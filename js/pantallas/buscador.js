// La caja de búsqueda de arriba de todo (§6 del diseño, «Buscador general»): nombre, apellido, DPI, licencia, teléfono, placas o número de
// contrato, desde cualquier pantalla, y se llega a la ficha misma. Vive en la barra del cascarón (index.html) y se conecta una vez al
// arrancar (app.js).
//
// Cómo se porta, en una línea cada cosa:
//   - Escribe y debajo salen, agrupados, los clientes, los carros y los contratos que coinciden (nucleo/buscadorGeneral.js, que a su vez
//     pregunta a nucleo/busqueda.js: aquí no hay ninguna regla de búsqueda).
//   - Un clic en una fila lleva a esa ficha. Enter lleva a la única que haya; con dos o más NO elige por él: flechas y Enter, o un clic.
//   - Una lista que no se pudo leer nunca se dibuja como «Sin resultados» (nucleo/buscadorGeneral.js: textoSinNada).
//
// De dónde salen las listas: de las mismas lecturas que ya usan Clientes, Carros y «Sacar carro» (datos.js) —copia local al instante, la
// nube por detrás—, pedidas la primera vez que se toca la caja y otra vez pasados cinco minutos, no con cada tecla ni con cada pantalla.
// Cada lectura de la nube trae la colección ENTERA (D3 de las costuras: cuesta una lectura por documento), y la caja no debe multiplicar
// eso. Entre una y otra, cada vez que se toca la caja se vuelve a leer la copia de ESTA computadora (barato, sin nube): así un contrato
// que se acaba de guardar aquí se encuentra aunque la última lectura de la nube sea de hace tres minutos.
import {
  buscarEnTodo, filasVisibles, filaUnica, textoSinNada, textoDeLoQueFalta, textoDeLoQueTarda,
} from '../nucleo/buscadorGeneral.js';
import { nombreCompleto } from '../nucleo/cliente.js';
import { estadoContrato } from '../nucleo/estados.js';
import { lecturaConNubeDetras } from '../nucleo/lecturas.js';
import { mezclar, leerLocal, borrarLocales } from '../cache.js';
import { cargarClientes, cargarFlota, cargarTodosLosContratos } from '../datos.js';
import { fecha } from '../ui.js';
import { ETIQUETAS_ESTADO } from './contratos.js';

// Mismo escape que el resto de pantallas: el nombre de un cliente, unas placas o una observación son texto libre y nunca entran al HTML sin
// pasar por aquí.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Cada cuánto, como máximo, la caja vuelve a pedirle las listas a la nube. */
export const VIGENCIA_DE_LA_LECTURA_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que dibuja cada fila
// ---------------------------------------------------------------------------------------------------------------------------------

const unidos = (partes) => partes.filter(Boolean).join(' · ');

/** Las dos líneas de una fila: lo principal (con negritas) y el detalle. Sin ningún monto: la caja se ve desde cualquier pantalla. */
export function textosDeLaFila(fila) {
  const d = fila.dato;
  if (fila.tipo === 'clientes') {
    return { principal: nombreCompleto(d) || 'Cliente sin nombre', detalle: unidos([d.documento, d.telefono]) };
  }
  if (fila.tipo === 'carros') {
    return { principal: d.placas || 'Sin placas', detalle: unidos([[d.marca, d.linea].filter(Boolean).join(' '), d.color]) };
  }
  const estado = estadoContrato(d);
  return {
    principal: `N.° ${d.numero ?? '—'} · ${d.clienteNombre || 'Cliente sin nombre'}`,
    detalle: unidos([
      d.carroPlacas, d.carroDescripcion, d.fechaSalida ? `salió ${fecha(d.fechaSalida)}` : '', ETIQUETAS_ESTADO[estado] || estado,
    ]),
  };
}

function htmlDeLaFila(fila, indice, activa) {
  const { principal, detalle } = textosDeLaFila(fila);
  return `<a class="bg-fila${activa ? ' bg-activa' : ''}" role="option" id="bg-fila-${indice}" aria-selected="${activa}"`
    + ` href="${esc(fila.ruta)}" data-ruta="${esc(fila.ruta)}" data-clave="${esc(`${fila.tipo}:${fila.id}`)}">`
    + `<span class="bg-principal">${esc(principal)}</span>`
    + `${detalle ? `<span class="bg-detalle">${esc(detalle)}</span>` : ''}</a>`;
}

/**
 * Todo lo que va dentro del panel de resultados, como HTML: los grupos con sus filas, y debajo lo que haya que decir (nada encontrado,
 * o lo que se ve puede estar incompleto). `activa` es la clave de la fila marcada con las flechas, o null. Función pura.
 */
export function htmlDelPanel({ resultado, listas, activa = null }) {
  let indice = 0;
  const grupos = resultado.grupos.map((g) => {
    const filas = g.filas.map((f) => htmlDeLaFila(f, indice++, activa === `${f.tipo}:${f.id}`)).join('');
    const mas = g.faltan > 0 ? `<p class="bg-mas">y ${g.faltan} más: escribe un poco más para acotar</p>` : '';
    return `<div class="bg-grupo" role="group" aria-label="${esc(g.titulo)}">`
      + `<p class="bg-titulo">${esc(g.titulo)} <span class="bg-cuenta">${g.total}</span></p>${filas}${mas}</div>`;
  }).join('');

  let pie = '';
  if (resultado.total === 0) {
    const { clase, texto } = textoSinNada(listas);
    pie = `<p class="bg-nada bg-${clase}" role="status">${esc(texto)}</p>`;
  } else {
    const falta = textoDeLoQueFalta(listas);
    const tarda = textoDeLoQueTarda(listas);
    if (falta) pie = `<p class="bg-falta" role="status">${esc(falta)}</p>`;
    else if (tarda) pie = `<p class="bg-nada bg-buscando" role="status">${esc(tarda)}</p>`;
  }
  return `<div id="buscador-lista" role="listbox" aria-label="Resultados">${grupos}</div>${pie}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La lectura de las tres listas
// ---------------------------------------------------------------------------------------------------------------------------------

const FUENTES = [
  { clave: 'clientes', coleccion: 'clientes', leer: cargarClientes },
  { clave: 'carros', coleccion: 'vehiculos', leer: cargarFlota },
  { clave: 'contratos', coleccion: 'contratos', leer: cargarTodosLosContratos },
];

const listaNueva = () => ({
  datos: [], fallo: false, asentada: false, servida: false,
});

/**
 * Las tres listas en memoria, cada una `{ datos, fallo, asentada }` (ver nucleo/buscadorGeneral.js), y cómo ponerlas al día.
 *
 * `servida` dice que la lista ya entregó algo (aunque sea la copia local); mientras no, lo que se ve no la incluye y se dice «Buscando…».
 * `asentada` es lo que distingue «sin resultados» de «todavía no sé»: las lecturas de datos.js entregan la copia local al instante y la nube
 * por detrás, y avisan (`alLlegar`) solo si la nube trae algo distinto o falla. Que la nube conteste lo MISMO no avisa a nadie, así que se
 * mira el último paso de la sincronía (`borrarCopia`, que corre siempre que la nube contestó bien) para saber que terminó.
 *
 * `depsDe(coleccion)` y `leerCopia` son para las pruebas: la nube y la copia local de mentira.
 */
export function crearLectura({
  fuentes = FUENTES, depsDe = () => ({}), leerCopia = leerLocal, alCambiar = () => {},
} = {}) {
  const listas = Object.fromEntries(fuentes.map(({ clave }) => [clave, listaNueva()]));
  // Cada petición a la nube lleva su número: lo que conteste una anterior (o una que ya no importa porque se cerró la sesión) no puede
  // pisar a la nueva.
  let generacion = 0;
  let cargadoEn = 0;

  async function cargar(ahora) {
    generacion += 1;
    const mia = generacion;
    const vigente = () => mia === generacion;
    cargadoEn = ahora;
    await Promise.all(fuentes.map(async ({ clave, coleccion, leer }) => {
      const lista = listas[clave];
      lista.asentada = false;
      const deLaNube = lecturaConNubeDetras();
      const poner = () => {
        ({ datos: lista.datos, fallo: lista.fallo } = deLaNube.actual);
        lista.servida = true;
        alCambiar();
      };
      const deps = depsDe(coleccion);
      const borrarAntes = deps.borrarCopia ?? borrarLocales;
      try {
        const r = await leer((tarde) => {
          if (!vigente()) return;
          deLaNube.deLaNube(tarde);
          lista.asentada = true;
          poner();
        }, {
          ...deps,
          borrarCopia: async (...args) => {
            await borrarAntes(...args);
            if (vigente()) { lista.asentada = true; alCambiar(); }
          },
        });
        if (!vigente()) return;
        deLaNube.inmediata(r);
        // Sin copia local y con la nube caída no va a llegar nada más: ya no hay nada que esperar.
        if (r.fallo) lista.asentada = true;
        poner();
      } catch {
        // Falló la copia local misma (IndexedDB): es un fallo de lectura, nunca «no hay nada».
        if (!vigente()) return;
        lista.fallo = true;
        lista.asentada = true;
        lista.servida = true;
        alCambiar();
      }
    }));
  }

  /** Lo que hay guardado en ESTA computadora, sumado a lo que ya se tiene: lo recién guardado aquí aparece sin esperar a la nube. */
  async function traerLoLocal() {
    const mia = generacion;
    await Promise.all(fuentes.map(async ({ clave, coleccion }) => {
      const locales = await leerCopia(coleccion);
      if (mia !== generacion || !locales.length) return;
      listas[clave].datos = mezclar(listas[clave].datos, locales);
    }));
    if (mia === generacion) alCambiar();
  }

  return {
    listas,
    /** Pide la nube la primera vez y cada cinco minutos; entre una y otra, solo vuelve a mirar la copia de esta computadora. */
    asegurar(ahora) {
      if (!cargadoEn || ahora - cargadoEn > VIGENCIA_DE_LA_LECTURA_MS) return cargar(ahora);
      return traerLoLocal();
    },
    get leyendoPorPrimeraVez() { return !cargadoEn; },
    /** Se cerró la sesión: nada de lo leído se queda en memoria, y lo que conteste tarde se ignora. */
    reiniciar() {
      generacion += 1;
      cargadoEn = 0;
      for (const clave of Object.keys(listas)) Object.assign(listas[clave], listaNueva());
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// La caja
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Conecta la caja `entrada` con su panel de resultados `panel`. Todo lo del navegador entra por parámetros para poder probarlo con un
 * documento de mentira: `ir(ruta)` cambia de pantalla, `ahora()` es la hora, `documento` y `ventana` los eventos de fuera de la caja.
 * Devuelve `{ reiniciar, desconectar }`.
 */
export function crearBuscador({
  entrada, panel, documento = globalThis.document, ventana = globalThis.window,
  ir = (ruta) => { globalThis.location.hash = ruta; }, ahora = () => Date.now(), ...opcionesDeLectura
}) {
  const caja = entrada.parentElement;
  const control = new AbortController();
  const escuchar = (objetivo, tipo, fn) => objetivo?.addEventListener(tipo, fn, { signal: control.signal });

  const estado = { abierto: false, activa: null, resultado: null, ultimoHtml: null };
  const lectura = crearLectura({ ...opcionesDeLectura, alCambiar: () => pintar() });

  const tieneTexto = () => Boolean(String(entrada.value ?? '').trim());

  function ocultar() {
    estado.abierto = false;
    estado.activa = null;
    estado.ultimoHtml = null;
    // Cerrado también significa vacío: lo que estaba escrito (nombres, placas) no se queda en la página para quien la abra después.
    panel.innerHTML = '';
    panel.hidden = true;
    entrada.setAttribute('aria-expanded', 'false');
    entrada.removeAttribute('aria-activedescendant');
  }

  function pintar() {
    if (!estado.abierto || !tieneTexto()) { if (estado.abierto) ocultar(); return; }
    const { listas } = lectura;
    estado.resultado = buscarEnTodo({
      clientes: listas.clientes.datos, carros: listas.carros.datos, contratos: listas.contratos.datos,
    }, entrada.value);
    // La fila marcada con las flechas se recuerda por lo que ES, no por su lugar: si llega algo de la nube y las filas se corren, Enter no
    // abre la que ahora quedó en ese lugar.
    const claves = new Set(filasVisibles(estado.resultado).map((f) => `${f.tipo}:${f.id}`));
    if (estado.activa && !claves.has(estado.activa)) estado.activa = null;
    const html = htmlDelPanel({ resultado: estado.resultado, listas, activa: estado.activa });
    // Si no cambió nada de lo que se ve no se toca el panel: cambiar el HTML justo cuando alguien aprieta el botón del ratón sobre una fila
    // deja el clic sin fila a la que llegar.
    if (html !== estado.ultimoHtml) {
      panel.innerHTML = html;
      estado.ultimoHtml = html;
    }
    panel.hidden = false;
    entrada.setAttribute('aria-expanded', 'true');
    const indice = filasVisibles(estado.resultado).findIndex((f) => `${f.tipo}:${f.id}` === estado.activa);
    if (indice >= 0) {
      entrada.setAttribute('aria-activedescendant', `bg-fila-${indice}`);
      documento?.getElementById?.(`bg-fila-${indice}`)?.scrollIntoView?.({ block: 'nearest' });
    } else {
      entrada.removeAttribute('aria-activedescendant');
    }
  }

  function abrir() {
    if (!tieneTexto()) return;
    estado.abierto = true;
    pintar();
  }

  function limpiar() {
    entrada.value = '';
    ocultar();
  }

  function irA(fila) {
    limpiar();
    entrada.blur?.();
    ir(fila.ruta);
  }

  /** Mueve la fila marcada: las posiciones son «ninguna» y cada fila, dando la vuelta. */
  function mover(paso) {
    const filas = filasVisibles(estado.resultado ?? { grupos: [] });
    if (!filas.length) return;
    const actual = filas.findIndex((f) => `${f.tipo}:${f.id}` === estado.activa) + 1; // 0 = ninguna
    const siguiente = (actual + paso + filas.length + 1) % (filas.length + 1);
    estado.activa = siguiente === 0 ? null : `${filas[siguiente - 1].tipo}:${filas[siguiente - 1].id}`;
    pintar();
  }

  escuchar(entrada, 'focus', () => {
    lectura.asegurar(ahora());
    abrir();
  });

  // Un clic en el campo ya enfocado (el panel se cerró con Escape o tocando fuera y el foco sigue aquí) no vuelve a dar `focus`.
  escuchar(entrada, 'click', abrir);

  escuchar(entrada, 'input', () => {
    // Un `input` sin haber pasado por `focus` (autocompletar, pegar con el menú): las listas aún no se han pedido.
    if (lectura.leyendoPorPrimeraVez) lectura.asegurar(ahora());
    estado.abierto = true;
    estado.activa = null;
    pintar();
  });

  escuchar(entrada, 'keydown', (ev) => {
    if (ev.isComposing) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!estado.abierto) abrir();
      mover(ev.key === 'ArrowDown' ? 1 : -1);
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      if (!estado.abierto || !estado.resultado) return;
      // La que se marcó con las flechas; si no se marcó ninguna, la única que hay. Con varias y ninguna marcada no se hace nada: no se
      // elige por él.
      const marcada = filasVisibles(estado.resultado).find((f) => `${f.tipo}:${f.id}` === estado.activa);
      const fila = marcada ?? filaUnica(estado.resultado);
      if (fila) {
        ev.preventDefault();
        irA(fila);
      }
    } else if (ev.key === 'Escape') {
      // El primer Escape cierra el panel (y evita que el navegador borre lo escrito); el segundo, con el panel ya cerrado, lo borra.
      if (estado.abierto) {
        ev.preventDefault();
        ocultar();
      }
    }
  });

  escuchar(panel, 'click', (ev) => {
    const fila = ev.target?.closest?.('[data-ruta]');
    if (!fila) return;
    // Un clic con Ctrl, Cmd o Mayús, o con otro botón, se queda como lo entienda el navegador.
    if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    irA({ ruta: fila.getAttribute('data-ruta') });
  });

  // Sin cerrar con el desenfoque: en Safari tocar un enlace no le da el foco, y el panel se cerraría antes de que el clic llegara.
  escuchar(documento, 'pointerdown', (ev) => {
    if (!estado.abierto) return;
    if (caja?.contains?.(ev.target)) return;
    ocultar();
  });

  // Al cambiar de pantalla (un enlace del menú, la flecha de atrás) el panel se cierra; lo escrito se queda.
  escuchar(ventana, 'hashchange', () => { if (estado.abierto) ocultar(); });

  return {
    /** Se cerró la sesión: se borra lo escrito y todo lo leído. */
    reiniciar() {
      lectura.reiniciar();
      limpiar();
    },
    /** Quita todo lo que esta caja conectó (para las pruebas). */
    desconectar() { control.abort(); },
    lectura,
  };
}

/** Conecta la caja de index.html. Si la página no la trae, no hace nada (y `reiniciar` tampoco). */
export function conectarElBuscador(documento = globalThis.document) {
  const entrada = documento?.getElementById('buscador');
  const panel = documento?.getElementById('buscador-panel');
  if (!entrada || !panel) return { reiniciar() {}, desconectar() {} };
  return crearBuscador({ entrada, panel, documento });
}
