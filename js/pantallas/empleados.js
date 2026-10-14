// Pantalla de empleados: alta, edición y baja de quienes rentan los carros, con su código y su porcentaje de comisión
// (§6 del diseño: «Empleados: alta, baja y el porcentaje de comisión de cada uno»).
//
// Es la hermana de duenos.js (una lista con su buscador y una ficha para ver y editar, con las mismas clases de CSS), con
// lo que un empleado tiene de propio:
//
// - Vive dentro del área de dinero (`#/dinero/empleados`) y pasa por la misma puerta de contraseña (conPuertaDeDinero, en
//   app.js), y no es un adorno: la regla de Firestore deja ESCRIBIR `empleados` solo a la credencial de dinero, y
//   `guardarEmpleado` escribe con ella. El mostrador ve la lista para escoger quién rentó, pero el porcentaje solo se
//   cambia aquí (§12b: «el porcentaje solo se edita detrás de la contraseña»).
// - El CÓDIGO no se repite: teclear «6» en el mostrador tiene que dar a uno solo. Con la lista sin leer no se puede
//   comprobar, así que no se deja guardar (a diferencia de un dueño, aquí un duplicado no es un desorden sino un empleado
//   al que se le acredita lo de otro).
// - La baja no borra: sus rentas viejas siguen siendo suyas y siguen pagándose. Solo deja de salir al escoger quién rentó.
//
// Ninguna regla se escribe aquí: qué es un empleado válido, cómo se arma y cómo se busca viven en nucleo/empleado.js, y
// cómo se guarda en datos.js. Esta pantalla pregunta y dibuja.
import {
  CAMPOS_EMPLEADO, PORCENTAJE_DE_COMISION_POR_DEFECTO, construirEmpleado, problemasDeEmpleado, buscarEmpleados, siguienteCodigo,
  ordenarEmpleados, estaActivo, porcentajeAnotado,
} from '../nucleo/empleado.js';
import {
  cargarEmpleados, guardarEmpleado, altaConIdFijo, nuevoIdEmpleado, MENSAJE_EMPLEADO_SIN_DINERO,
} from '../datos.js';
import { aviso } from '../ui.js';
import { rutaDeComisiones } from './comisiones.js';

const LISTA = '#/dinero/empleados';

// El texto libre se escapa antes de entrar al HTML, igual que en las demás pantallas.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const el = (id) => document.getElementById(id);

export const MENSAJE_FALLO_LISTA = 'No se pudo leer la lista de empleados. Puede que falten empleados o que la lista esté incompleta.';
export const MENSAJE_SIN_LISTA_PARA_GUARDAR = 'No se pudo leer la lista de empleados, así que no se puede comprobar que el código no se repita. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_FALLO_GUARDAR = 'No se pudo guardar el empleado. Revisa tu internet e intenta de nuevo: si ya había quedado guardado, no se duplica.';

/** Cómo se dice el porcentaje en la lista: «5 %», «7.5 %», «0 %». Un porcentaje que no se lee, «—». */
export function textoDelPorcentaje(valor) {
  const porcentaje = porcentajeAnotado(valor);
  return porcentaje === null ? '—' : `${porcentaje} %`;
}

// ---------- Vista: la lista ----------

function filaEmpleado(e) {
  const baja = !estaActivo(e);
  const gana = porcentajeAnotado(e.porcentajeComision) === 0 ? ' <span class="etiqueta-estado">No gana comisión</span>' : '';
  return `
    <tr data-id="${esc(e.id)}"${baja ? ' class="es-fuera"' : ''}>
      <td>${esc(e.codigo || '—')}</td>
      <td><a href="${LISTA}/${esc(e.id)}">${esc(e.nombre || 'Empleado sin nombre')}</a>${baja ? ' <span class="etiqueta-estado">De baja</span>' : ''}</td>
      <td>${esc(textoDelPorcentaje(e.porcentajeComision))}${gana}</td>
      <td><a href="${esc(rutaDeComisiones(`id:${e.id}`))}">Ver comisiones</a></td>
    </tr>`;
}

function filasCuerpo(empleados) {
  if (!empleados.length) return '<tr><td colspan="4" class="pendiente dn-vacio">Sin resultados.</td></tr>';
  return empleados.map(filaEmpleado).join('');
}

/**
 * La lista de empleados. Si la lectura FALLÓ, no se invita a «agregar el primero» ni se dice que no hay empleados: no se
 * sabe, y dar de alta a quien quizá ya existe repetiría su código (el mismo error que ya le costó una vuelta a la lista de
 * dueños en «Sacar carro»).
 */
export function htmlListaDeEmpleados(empleados, { fallo = false } = {}) {
  const ordenados = ordenarEmpleados(empleados);
  const barra = fallo
    ? `<div class="barra-lectura-fallida" role="alert"><p>${esc(MENSAJE_FALLO_LISTA)}</p></div>`
    : '';
  let cuerpo;
  if (ordenados.length) cuerpo = filasCuerpo(ordenados);
  else if (fallo) cuerpo = '<tr><td colspan="4" class="pendiente dn-vacio">No se pudo leer la lista. Intenta de nuevo o revisa la conexión.</td></tr>';
  else cuerpo = '<tr><td colspan="4" class="pendiente dn-vacio">Todavía no hay empleados.<br><a href="#/dinero/empleados/nuevo" class="btn btn-primario dn-boton-ancho-auto">Agregar el primero</a></td></tr>';
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <a href="#/dinero" class="btn">← Dinero</a>
        <h1>Empleados</h1>
        ${fallo ? '<button type="button" class="btn" data-em="reintentar">Volver a leer</button>' : ''}
        <a href="#/dinero/empleados/nuevo" class="btn btn-primario dn-boton-suelto">Agregar empleado</a>
      </div>
      ${barra}
      ${ordenados.length ? `
        <label class="carro-campo dn-buscador">Buscar por código o por nombre
          <input type="search" id="em-buscar" placeholder="Escribe para buscar...">
        </label>` : ''}
      <table class="tabla-carros">
        <thead>
          <tr><th>Código</th><th>Nombre</th><th>Porcentaje de comisión</th><th></th></tr>
        </thead>
        <tbody id="em-filas">${cuerpo}</tbody>
      </table>
    </div>`;
}

function dibujarLista(contenedor, empleados, fallo) {
  contenedor.innerHTML = htmlListaDeEmpleados(empleados, { fallo });
  const ordenados = ordenarEmpleados(empleados);

  function cablearFilas() {
    el('em-filas').querySelectorAll('tr[data-id]').forEach((fila) => {
      fila.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'A') return; // Dejar pasar clics en enlaces
        location.hash = `${LISTA}/${fila.dataset.id}`;
      });
    });
  }
  cablearFilas();

  contenedor.querySelector('[data-em="reintentar"]')?.addEventListener('click', () => {
    pintarEmpleados(contenedor, null);
  });

  // El buscador filtra sobre la copia ya en memoria en cada tecla, sin tocar la nube, y solo redibuja el cuerpo de la
  // tabla (nunca el campo) para no perder el foco a media palabra. Con la misma búsqueda del mostrador: el código exacto primero.
  if (ordenados.length) {
    el('em-buscar').addEventListener('input', (ev) => {
      el('em-filas').innerHTML = filasCuerpo(buscarEmpleados(ordenados, ev.target.value));
      cablearFilas();
    });
  }
}

// ---------- Vista: la ficha (alta y edición) ----------

/**
 * El formulario de un empleado, dibujado desde CAMPOS_EMPLEADO: un campo nuevo ahí aparece aquí solo. Un empleado NUEVO
 * arranca con el siguiente código libre y con el 5 % de siempre, que es solo lo que se propone: se puede cambiar.
 *
 * Bajo el porcentaje va una frase que explica lo que pasa al cambiarlo, porque es lo que él se pregunta: no mueve lo que
 * el empleado ya ganó, cada renta guarda el porcentaje del día que se hizo.
 */
export function htmlFormularioDeEmpleado(empleado, { esNuevo, lista = [] }) {
  const titulo = esNuevo ? 'Nuevo empleado' : (empleado?.nombre || 'Empleado sin nombre');
  const inicial = esNuevo
    ? { codigo: siguienteCodigo(lista), porcentajeComision: PORCENTAJE_DE_COMISION_POR_DEFECTO, activo: true }
    : empleado;
  const campos = CAMPOS_EMPLEADO.map((campo) => {
    const valor = inicial?.[campo.id];
    if (campo.tipo === 'casilla') {
      return `
        <label class="carro-campo dn-casilla">
          <input type="checkbox" id="ef-${esc(campo.id)}" ${valor === false ? '' : 'checked'}> ${esc(campo.etiqueta)}
        </label>`;
    }
    if (campo.tipo === 'porcentaje') {
      return `
        <label class="carro-campo">${esc(campo.etiqueta)}
          <input type="number" id="ef-${esc(campo.id)}" min="0" max="100" step="0.01" inputmode="decimal" value="${esc(valor ?? '')}">
          <span class="dn-explica-chica">${esc(esNuevo ? 'Si no gana comisión, escribe 0.' : 'Si no gana comisión, 0. Cambiarlo no mueve lo que ya ganó: cada renta guarda el porcentaje del día que se hizo.')}</span>
        </label>`;
    }
    return `
        <label class="carro-campo">${esc(campo.etiqueta)}
          <input type="text" id="ef-${esc(campo.id)}" value="${esc(valor ?? '')}" autocomplete="off">
        </label>`;
  }).join('');
  return `
    <div class="carros-contenido">
      <div class="carro-formulario">
        <h1>${esc(titulo)}</h1>
        <form id="ef-form" novalidate>
          <section class="carro-seccion">
            <div class="carro-campos">${campos}
            </div>
          </section>
          <div class="carro-botones">
            <button type="button" id="ef-volver" class="btn">Cancelar</button>
            <button type="submit" id="ef-guardar" class="btn btn-primario dn-boton-suelto">Guardar empleado</button>
          </div>
        </form>
        ${esNuevo ? '' : `<p class="dn-ver-cuenta"><a href="${esc(rutaDeComisiones(`id:${empleado?.id}`))}">Ver lo que se le debe</a></p>`}
      </div>
    </div>`;
}

/**
 * Lee el formulario, recorriendo CAMPOS_EMPLEADO (nunca campo por campo a mano): un campo que se agregue ahí algún día se
 * lee solo. `elemento(id)` devuelve el campo con ese id; se recibe para poder probarlo con campos de mentira.
 */
export function leerCamposDeEmpleado(elemento) {
  const campos = {};
  for (const c of CAMPOS_EMPLEADO) {
    const campo = elemento(`ef-${c.id}`);
    if (c.tipo === 'casilla') campos[c.id] = Boolean(campo?.checked);
    else campos[c.id] = String(campo?.value ?? '').trim();
  }
  return campos;
}

/**
 * Guarda la ficha, o dice por qué no. Función aparte de la pantalla, con lo que recibe de afuera, para poder probar el
 * recorrido sin DOM ni red:
 *
 * - Sin la lista leída (`fallo`) NO se guarda: no se puede comprobar que el código no se repita.
 * - Se arma con `construirEmpleado` (el merge con lo que ya existía: lo que la ficha no muestra pasa de largo) y se pregunta
 *   a `problemasDeEmpleado` con los DEMÁS empleados (con los de baja también: su código sigue siendo suyo).
 * - El `id` de un empleado NUEVO lo decide `alta` una vez, antes del primer intento (H-2): un reintento tras un tiempo
 *   vencido cae en la misma ficha y no deja dos empleados. Se suelta solo cuando salió bien.
 *
 * Devuelve `{ ok: true, guardado }` o `{ ok: false, problemas }`; lo que lance `guardar` sube tal cual.
 */
export async function guardarFichaDeEmpleado({
  existente, campos, lista, fallo = false, alta, guardar = guardarEmpleado,
}) {
  if (fallo) return { ok: false, problemas: [MENSAJE_SIN_LISTA_PARA_GUARDAR] };
  const nuevo = construirEmpleado(existente || {}, campos);
  const problemas = problemasDeEmpleado(nuevo, lista);
  if (problemas.length) return { ok: false, problemas };
  const guardado = await guardar(await alta.paraGuardar(nuevo));
  alta.terminada();
  return { ok: true, guardado };
}

/** Lo que se le dice cuando guardar falló: nuestras frases pasan tal cual; lo de Firebase (en inglés, con un código) nunca. */
export function mensajeDeFalloAlGuardar(error) {
  return error?.message === MENSAJE_EMPLEADO_SIN_DINERO ? error.message : MENSAJE_FALLO_GUARDAR;
}

function dibujarFicha(contenedor, empleadoId, empleados, fallo) {
  const esNuevo = empleadoId === 'nuevo';
  let empleado = null;

  if (!esNuevo) {
    empleado = empleados.find((e) => e.id === empleadoId);
    if (!empleado) {
      // Con la lectura fallida no se sabe si el empleado existe: no se afirma que no.
      contenedor.innerHTML = fallo
        ? `<div class="carros-contenido"><div class="barra-lectura-fallida" role="alert"><p>${esc(MENSAJE_FALLO_LISTA)}</p></div>
          <p><a href="${LISTA}" class="btn">← Empleados</a></p></div>`
        : `<p class="pendiente">No se encontró este empleado. <a href="${LISTA}">Volver a la lista</a></p>`;
      return;
    }
  }

  contenedor.innerHTML = htmlFormularioDeEmpleado(empleado, { esNuevo, lista: empleados });
  const alta = altaConIdFijo(nuevoIdEmpleado);

  async function guardar(ev) {
    ev.preventDefault();
    const boton = el('ef-guardar');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      const r = await guardarFichaDeEmpleado({
        existente: empleado, campos: leerCamposDeEmpleado(el), lista: empleados, fallo, alta,
      });
      if (!r.ok) {
        aviso(r.problemas[0], 'error');
        return;
      }
      aviso(`${r.guardado.nombre || 'Empleado'} guardado.`, 'exito');
      location.hash = LISTA;
    } catch (error) {
      aviso(mensajeDeFalloAlGuardar(error), 'error');
      console.error(error);
    } finally {
      boton.disabled = false;
    }
  }

  el('ef-form').addEventListener('submit', guardar);
  el('ef-volver').addEventListener('click', () => { location.hash = LISTA; });
}

// ---------- Punto de entrada ----------

let ultimoToken = 0;

/** Dibuja la pantalla de empleados dentro de `contenedor`: la lista, o la ficha de uno (o `nuevo`). */
export async function pintarEmpleados(contenedor, empleadoId) {
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith(LISTA) && miToken === ultimoToken;

  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';

  let leida;
  try {
    leida = await cargarEmpleados();
  } catch {
    // Una lectura que lanza es un fallo, nunca «no hay empleados».
    leida = { datos: null, fallo: true };
  }
  if (!sigoVigente()) return;
  // Con la lectura fallida `datos` es null: la lista queda vacía PERO marcada como fallo, y ninguna vista la toma por «no hay».
  const empleados = Array.isArray(leida.datos) ? leida.datos : [];
  const fallo = Boolean(leida.fallo) || !Array.isArray(leida.datos);

  if (empleadoId) dibujarFicha(contenedor, empleadoId, empleados, fallo);
  else dibujarLista(contenedor, empleados, fallo);
}
