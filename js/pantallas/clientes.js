// Pantalla de clientes: alta, edición e historial de la ficha que va impresa
// en el contrato (§6 del diseño).
//
// Hasta ahora un cliente solo se creaba de prisa desde "Sacar carro"
// (sacarCarro.js) y nunca se podía corregir: un DPI mal escrito o un teléfono
// equivocado se quedaban mal para siempre. Esta pantalla es donde el dueño ve
// y corrige esos datos antes de entregar un carro que vale más que la renta.
//
// Sigue la misma forma de trabajo que carros.js (su hermana más cercana): una
// lista con su buscador, una ficha para ver/editar un registro, y las mismas
// clases de CSS (carros-contenido, carro-formulario, tabla-carros, ...) para
// que las dos pantallas se vean como parte del mismo sistema, sin inventar
// una hoja de estilos aparte.
import {
  CAMPOS_CLIENTE, construirCliente, nombreCompleto, faltaAlgo, nombresResueltos,
} from '../nucleo/cliente.js';
import { filtrar, textoDeCliente } from '../nucleo/busqueda.js';
import { resumen } from '../nucleo/contrato.js';
import { diasEntre, hoyISO } from '../nucleo/fechas.js';
import { suma } from '../nucleo/dinero.js';
import { cargarClientes, cargarContratosAbiertos, guardarCliente } from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';

// El texto libre que escribe el mostrador se escapa antes de entrar al HTML,
// igual que en carros.js y flota.js, para que un "&" o un "<" sueltos no
// rompan la pantalla.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value ?? '';
const texto = (id) => val(id).trim();

// ---------- Reglas puras: qué se marca en rojo ----------
//
// Separadas de todo lo que dibuja HTML para poder probarlas sin DOM, igual
// que textoConfirmarLiberar en flota.js.

/**
 * El cliente tal como se prellena en el formulario de la ficha: si ya tiene
 * `nombres`/`apellidos` en la forma nueva, tal cual; si no, se completan con
 * `nombresResueltos()` (nucleo/cliente.js) a partir de la forma vieja
 * (`nombre1`/`nombre2`/`apellido1`/`apellido2`).
 *
 * Puente de solo lectura (fix round 1, hallazgo Crítico): sin esto, la ficha
 * de un cliente guardado con la forma vieja se abre con "Nombres" y
 * "Apellidos" en blanco, y `faltaAlgo()` rechaza CUALQUIER guardado —
 * incluso corregir solo el teléfono — hasta que alguien vuelva a escribir el
 * nombre a mano. Al prellenar, esos dos campos viajan con el resto del
 * formulario al guardar y el cliente queda migrado a la forma nueva sin que
 * el mostrador tenga que hacer nada extra.
 */
export function clienteParaFormulario(cliente) {
  if (!cliente) return {};
  return { ...cliente, ...nombresResueltos(cliente) };
}

/** Cierto si una fecha ISO ya pasó respecto a "hoy". Vacía nunca cuenta como vencida. */
export function estaVencido(fechaISO, hoy) {
  if (!fechaISO) return false;
  return diasEntre(fechaISO, hoy) > 0;
}

/** Los contratos de un cliente, de una lista de contratos ya cargada. */
export function contratosDe(cliente, contratos) {
  return (contratos || []).filter((c) => c?.clienteId === cliente?.id);
}

/**
 * Cuánto debe en total entre todos sus contratos. Se suma el saldo de cada
 * uno con `resumen()` (nucleo/contrato.js) — nunca una cifra propia — porque
 * "nunca ajustar una cifra para que cuadre" (regla del dueño) empieza por no
 * inventar aquí un total que el núcleo no calculó.
 */
export function saldoPendienteDe(contratosCliente) {
  return suma(...contratosCliente.map((c) => resumen(c).saldo));
}

/** Cuántas veces regresó tarde, contando solo lo que ya se cerró (con cierre). */
export function vecesTarde(contratosCliente) {
  return contratosCliente.filter((c) => resumen(c).diasAtraso > 0).length;
}

/**
 * Las alertas de un cliente: licencia vencida, documento vencido, saldo
 * pendiente y cuántas veces devolvió tarde. Cada una trae un `tipo` (la
 * etiqueta corta para la lista) y un `texto` (la frase completa para la
 * ficha) — una sola función que las decide todas, para que la lista y la
 * ficha nunca se desacuerden sobre qué cuenta como alerta.
 *
 * `contratosCliente` viene de `cargarContratosAbiertos()` (datos.js): trae
 * los contratos 'rentado' y 'devuelto', que son los únicos que pueden tener
 * saldo pendiente (uno 'cerrado' ya no debe nada, por definición de
 * `estadoContrato()`). Un contrato cerrado con un atraso histórico no se
 * vuelve a contar aquí todavía — la Tarea 8 (historial de contratos) es la
 * que trae también los cerrados, y esta pantalla se apoyará en eso cuando
 * exista.
 */
export function alertasDe(cliente, contratosCliente, hoy) {
  const alertas = [];

  if (estaVencido(cliente?.licenciaExpira, hoy)) {
    alertas.push({ tipo: 'Licencia vencida', texto: `Licencia vencida el ${fecha(cliente.licenciaExpira)}.` });
  }
  if (estaVencido(cliente?.documentoExpira, hoy)) {
    alertas.push({ tipo: 'Documento vencido', texto: `Documento vencido el ${fecha(cliente.documentoExpira)}.` });
  }

  const saldo = saldoPendienteDe(contratosCliente);
  if (saldo > 0) {
    alertas.push({ tipo: 'Saldo pendiente', texto: `Saldo pendiente: ${dinero(saldo)}.` });
  }

  const tarde = vecesTarde(contratosCliente);
  if (tarde > 0) {
    alertas.push({ tipo: 'Devolvió tarde', texto: `Devolvió tarde ${tarde} ${tarde === 1 ? 'vez' : 'veces'}.` });
  }

  return alertas;
}

// ---------- Vista: lista de clientes ----------

function filaCliente(cliente, alertas) {
  const nombre = esc(nombreCompleto(cliente) || 'Cliente sin nombre');
  const documento = esc(cliente?.documento || '—');
  const telefono = esc(cliente?.telefono || '—');
  const marcas = alertas.map((a) => `<span class="etiqueta-estado">${esc(a.tipo)}</span>`).join(' ');

  return `
    <tr class="${alertas.length ? 'es-atrasado' : ''}" data-id="${esc(cliente.id)}">
      <td><a href="#/clientes/${esc(cliente.id)}">${nombre}</a></td>
      <td>${documento}</td>
      <td>${telefono}</td>
      <td>${marcas}</td>
    </tr>`;
}

function filasCuerpo(clientes, contratos, hoy) {
  if (!clientes.length) return '<tr><td colspan="4" class="pendiente">Sin resultados.</td></tr>';
  return clientes
    .map((c) => filaCliente(c, alertasDe(c, contratosDe(c, contratos), hoy)))
    .join('');
}

function dibujarLista(contenedor, clientes, contratos, hoy) {
  // Orden alfabético por nombre: es como se busca a alguien a simple vista en
  // una lista larga, igual que en el Excel del dueño.
  const ordenados = [...clientes].sort(
    (a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'),
  );

  contenedor.innerHTML = `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <h1>Clientes</h1>
        <a href="#/clientes/nuevo" class="btn btn-primario">Agregar cliente</a>
      </div>
      ${ordenados.length ? `
        <label class="carro-campo">Buscar por nombre, documento, licencia, teléfono o correo
          <input type="search" id="cli-buscar" placeholder="Escribe para buscar...">
        </label>` : ''}
      <table class="tabla-carros">
        <thead>
          <tr><th>Nombre</th><th>Documento</th><th>Teléfono</th><th>Estado</th></tr>
        </thead>
        <tbody id="cli-filas">${
          ordenados.length
            ? filasCuerpo(ordenados, contratos, hoy)
            : '<tr><td colspan="4" class="pendiente">Todavía no hay clientes.<br>'
              + '<a href="#/clientes/nuevo" class="btn btn-primario">Agregar el primero</a></td></tr>'
        }</tbody>
      </table>
    </div>`;

  function cablearFilas() {
    el('cli-filas').querySelectorAll('tr[data-id]').forEach((fila) => {
      fila.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'A') return; // Dejar pasar clicks en links
        location.hash = `#/clientes/${fila.dataset.id}`;
      });
    });
  }
  cablearFilas();

  // El buscador filtra sobre `ordenados` (la copia ya en memoria) en cada
  // tecla, sin tocar la nube — el diseño lo exige ("el buscador responde
  // mientras se escribe, sobre la copia local"). Solo se redibuja el cuerpo
  // de la tabla, nunca el input, para no perder el foco a media palabra.
  if (ordenados.length) {
    el('cli-buscar').addEventListener('input', (ev) => {
      const resultado = filtrar(ordenados, ev.target.value, textoDeCliente);
      el('cli-filas').innerHTML = filasCuerpo(resultado, contratos, hoy);
      cablearFilas();
    });
  }
}

// ---------- Vista: la ficha (ver/editar) ----------

// Los 22 campos de CAMPOS_CLIENTE (nucleo/cliente.js) agrupados como pide la
// Tarea 6: "quién es, sus documentos, dónde vive y cómo se le contacta". Los
// ids, no los grupos, son la fuente de verdad — si algún día CAMPOS_CLIENTE
// trae un campo que no está en ninguna lista de aquí abajo, no desaparece del
// formulario: cae en "Otros datos" (ver seccionesHTML), nunca se pierde en
// silencio.
const GRUPOS = [
  { titulo: 'Quién es', ids: ['nombres', 'apellidos', 'nacionalidad', 'fechaNacimiento'] },
  {
    titulo: 'Documentos',
    ids: ['documento', 'documentoExtendidoEn', 'documentoExpira', 'licencia', 'licenciaEmitidaEn', 'licenciaEmision', 'licenciaExpira'],
  },
  {
    titulo: 'Dónde vive',
    ids: ['direccionReferencia', 'municipio', 'pais', 'direccionAdicional', 'ciudadAdicional', 'estadoAdicional', 'paisAdicional'],
  },
  { titulo: 'Cómo se le contacta', ids: ['telefono', 'correo', 'telefonoAdicional', 'facturarA'] },
];

const TIPO_INPUT = { fecha: 'date', correo: 'email', telefono: 'tel' };

function campoHTML(campo, valor) {
  const tipo = TIPO_INPUT[campo.tipo] || 'text';
  return `
    <label class="carro-campo">${esc(campo.etiqueta)}
      <input type="${tipo}" id="cf-${campo.id}" value="${esc(valor)}">
    </label>`;
}

function seccionCampos(titulo, campos, cliente) {
  return `
    <section class="carro-seccion">
      <h2>${esc(titulo)}</h2>
      <div class="carro-campos">
        ${campos.map((c) => campoHTML(c, cliente?.[c.id] || '')).join('')}
      </div>
    </section>`;
}

function seccionesHTML(cliente) {
  const usados = new Set();
  const secciones = GRUPOS.map((g) => {
    const campos = g.ids.map((id) => CAMPOS_CLIENTE.find((c) => c.id === id)).filter(Boolean);
    campos.forEach((c) => usados.add(c.id));
    return seccionCampos(g.titulo, campos, cliente);
  });

  const sobrantes = CAMPOS_CLIENTE.filter((c) => !usados.has(c.id));
  if (sobrantes.length) secciones.push(seccionCampos('Otros datos', sobrantes, cliente));

  return secciones.join('');
}

// Reutiliza la barra roja de flota.js (misma clase, mismo look): una lista de
// frases en rojo arriba de lo que sí se pudo mostrar.
function barraAlertas(alertas) {
  if (!alertas.length) return '';
  return `<div class="barra-lectura-fallida">${alertas.map((a) => `<p>${esc(a.texto)}</p>`).join('')}</div>`;
}

const pluralDias = (n) => `${n} día${n === 1 ? '' : 's'}`;

function filaHistorial(c) {
  const r = resumen(c);
  const carro = [c?.carroPlacas, c?.carroDescripcion].filter(Boolean).join(' · ') || '—';
  const regreso = c?.cierre?.fechaReal
    ? fecha(c.cierre.fechaReal)
    : `prevista ${fecha(c?.devolucionPrevista) || '—'}`;
  const puntualidad = !c?.cierre?.fechaReal
    ? 'En curso'
    : (r.diasAtraso > 0 ? `Atrasado ${pluralDias(r.diasAtraso)}` : 'A tiempo');
  const cuenta = r.saldo > 0 ? `Debe ${dinero(r.saldo)}` : 'Pagado';

  return `
    <tr class="${r.diasAtraso > 0 ? 'es-atrasado' : ''}" data-id="${esc(c.id)}">
      <td><a href="#/contratos/${esc(c.id)}">${esc(c?.numero ?? '—')}</a></td>
      <td>${esc(carro)}</td>
      <td>${esc(fecha(c?.fechaSalida))} → ${esc(regreso)}</td>
      <td>${esc(c?.dias ?? '—')}</td>
      <td>${esc(puntualidad)}</td>
      <td>${esc(cuenta)}</td>
    </tr>`;
}

// El historial muestra los contratos abiertos del cliente (cargarContratosAbiertos,
// datos.js): rentados, devueltos y cualquiera con saldo o garantía pendiente.
// Los ya cerrados todavía no se traen aquí — eso es lo que agrega la Tarea 8
// (historial de contratos, con su propio cargarContratos) — así que por ahora
// esta lista puede no traer una renta ya cobrada y cerrada hace tiempo.
function seccionHistorial(contratosCliente) {
  const ordenados = [...contratosCliente].sort(
    (a, b) => String(b?.fechaSalida || '').localeCompare(String(a?.fechaSalida || '')),
  );
  const cuerpo = ordenados.length
    ? ordenados.map(filaHistorial).join('')
    : '<tr><td colspan="6" class="pendiente">Todavía no tiene rentas abiertas.</td></tr>';

  return `
    <section class="carro-seccion">
      <h2>Historial de rentas</h2>
      <table class="tabla-carros">
        <thead>
          <tr><th>N.°</th><th>Carro</th><th>Fechas</th><th>Días</th><th>Puntualidad</th><th>Cuenta</th></tr>
        </thead>
        <tbody>${cuerpo}</tbody>
      </table>
    </section>`;
}

async function dibujarFicha(contenedor, clienteId, clientes, contratos, hoy) {
  const esNuevo = clienteId === 'nuevo';
  let cliente = null;

  if (!esNuevo) {
    cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) {
      contenedor.innerHTML = '<p class="pendiente">No se encontró este cliente.</p>';
      return;
    }
  }

  const contratosCliente = cliente ? contratosDe(cliente, contratos) : [];
  const alertas = cliente ? alertasDe(cliente, contratosCliente, hoy) : [];
  const titulo = esNuevo ? 'Nuevo cliente' : (nombreCompleto(cliente) || 'Cliente sin nombre');

  contenedor.innerHTML = `
    <div class="carros-contenido">
      <div class="carro-formulario">
        <h1>${esc(titulo)}</h1>
        ${barraAlertas(alertas)}
        <form id="cli-form" novalidate>
          ${seccionesHTML(clienteParaFormulario(cliente))}
          <div class="carro-botones">
            <button type="button" id="cli-volver" class="btn">Cancelar</button>
            <button type="submit" id="cli-guardar" class="btn btn-primario">Guardar cliente</button>
          </div>
        </form>
      </div>
      ${esNuevo ? '' : seccionHistorial(contratosCliente)}
    </div>`;

  function leerCampos() {
    const campos = {};
    // Ojo: NUNCA se arma este objeto a mano campo por campo — se recorre
    // CAMPOS_CLIENTE, así un campo nuevo que se agregue ahí algún día se lee
    // solo, sin tener que acordarse de tocar este archivo también.
    CAMPOS_CLIENTE.forEach((c) => { campos[c.id] = texto(`cf-${c.id}`); });
    return campos;
  }

  async function guardar(ev) {
    ev.preventDefault();

    // construirCliente (nucleo/cliente.js) hace el merge con lo que ya
    // existía — nunca un objeto armado a mano aquí — para que un campo que
    // esta ficha sí muestra pero que llegó vacío por error no borre lo que
    // ya había, y para que cualquier campo que el sistema guarde por su
    // cuenta (id, actualizado, ...) pase de largo sin que este archivo tenga
    // que saber que existe. Es el mismo error que ya le costó un carro al
    // dueño (una pantalla que arma el objeto a mano y se le olvida un campo).
    const nuevo = construirCliente(cliente || {}, leerCampos());
    const falta = faltaAlgo(nuevo);
    if (falta.length) {
      aviso(`Falta completar: ${falta.join(', ')}.`, 'error');
      return;
    }

    const boton = el('cli-guardar');
    boton.disabled = true;
    try {
      const guardado = await guardarCliente(nuevo);
      aviso(`${nombreCompleto(guardado) || 'Cliente'} guardado.`, 'exito');
      location.hash = '#/clientes';
    } catch (error) {
      aviso('No se pudo guardar el cliente. Intenta de nuevo.', 'error');
      console.error(error);
    } finally {
      boton.disabled = false;
    }
  }

  el('cli-form').addEventListener('submit', guardar);
  el('cli-volver').addEventListener('click', () => { location.hash = '#/clientes'; });
}

// ---------- Punto de entrada principal ----------

let ultimoToken = 0;

/** Dibuja la pantalla de clientes dentro de `contenedor`, manejando lista y ficha. */
export async function pintarClientes(contenedor, clienteId) {
  const miToken = ++ultimoToken;
  const hash = location.hash;
  const sigoVigente = () => location.hash.startsWith('#/clientes') && miToken === ultimoToken;
  // hoyISO() (nucleo/fechas.js), no new Date().toISOString(): la nube va en
  // UTC y Guatemala va seis horas atrás — el mismo motivo por el que
  // carros.js y flota.js ya lo hacen así (ver sus comentarios).
  const hoy = hoyISO();

  let clientes = [];
  let contratos = [];

  const repintar = () => {
    if (!sigoVigente()) return;
    // Solo la lista se redibuja sola cuando llega algo nuevo por detrás; una
    // ficha abierta a medio editar no se pisa con un repintado de fondo,
    // igual que en carros.js.
    if (hash === '#/clientes') {
      dibujarLista(contenedor, clientes, contratos, hoy);
    }
  };

  // cargarClientes/cargarContratosAbiertos (datos.js) devuelven { datos,
  // fallo } (T9): esta pantalla, igual que carros.js, todavía no tiene una
  // barra de error propia — un fallo de nube se ve como "sigue como estaba",
  // nunca como "se vació la lista", porque `datos` cae a la copia local en
  // vez de a un arreglo vacío inventado.
  const [rClientes, rContratos] = await Promise.all([
    cargarClientes((r) => { clientes = r.datos; repintar(); }),
    cargarContratosAbiertos((r) => { contratos = r.datos; repintar(); }),
  ]);
  clientes = rClientes.datos;
  contratos = rContratos.datos;

  if (!sigoVigente()) return;

  if (hash === '#/clientes') {
    dibujarLista(contenedor, clientes, contratos, hoy);
  } else if (clienteId) {
    await dibujarFicha(contenedor, clienteId, clientes, contratos, hoy);
  }
}
