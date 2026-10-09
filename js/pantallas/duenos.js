// Pantalla de dueños: alta y edición de la lista de dueños de carros
// subarrendados (§4 del diseño de la liquidación).
//
// Hasta ahora un dueño solo se podía dar de alta de prisa desde "Sacar carro", y
// nunca corregir: un teléfono mal escrito o un NIT que faltaba se quedaban así
// para siempre, y el NIT es lo que lleva el comprobante cuando el dueño del carro
// factura. Esta pantalla sigue la forma de clientes.js (su hermana más cercana):
// una lista con su buscador y una ficha para ver/editar, con las mismas clases
// de CSS para que se vea parte del mismo sistema.
//
// Vive dentro del área de dinero (`#/dinero/duenos`), junto a la cuenta de cada
// dueño, y pasa por la misma puerta de contraseña que ella (conPuertaDeDinero,
// en app.js). Los datos de un dueño no son secretos —se leen con la sesión del
// mostrador, hace falta para sacar un carro—; está aquí porque es de donde se
// llega a ella sin cerrar el área, y porque lo que se corrige es lo que sale
// impreso en el comprobante.
//
// El nombre que se corrige aquí es el que se muestra en la lista de dinero: las
// cuentas toman el nombre del REGISTRO del dueño, no el texto que quedó escrito
// en cada contrato (ver armarVista en dinero.js).
import {
  CAMPOS_DUENO, construirDueno, faltaAlgoEnDueno, textoDeDueno,
} from '../nucleo/dueno.js';
import { filtrar } from '../nucleo/busqueda.js';
import {
  cargarDuenos, guardarDueno, altaConIdFijo, nuevoIdDueno,
} from '../datos.js';
import { aviso } from '../ui.js';
import { rutaDeCuenta } from './dinero.js';

const LISTA = '#/dinero/duenos';

// El texto libre se escapa antes de entrar al HTML, igual que en las demás pantallas.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const el = (id) => document.getElementById(id);

export const MENSAJE_FALLO_LISTA = 'No se pudo leer la lista de dueños. Puede que falten dueños o que la lista esté incompleta.';

const porNombre = (a, b) => String(a?.nombre ?? '').localeCompare(String(b?.nombre ?? ''), 'es');

// ---------- Vista: la lista ----------

function filaDueno(dueno) {
  return `
    <tr data-id="${esc(dueno.id)}">
      <td><a href="${LISTA}/${esc(dueno.id)}">${esc(dueno.nombre || 'Dueño sin nombre')}</a></td>
      <td>${esc(dueno.telefono || '—')}</td>
      <td>${esc(dueno.nit || '—')}</td>
      <td><a href="${esc(rutaDeCuenta(`id:${dueno.id}`))}">Ver cuenta</a></td>
    </tr>`;
}

function filasCuerpo(duenos) {
  if (!duenos.length) return '<tr><td colspan="4" class="pendiente dn-vacio">Sin resultados.</td></tr>';
  return duenos.map(filaDueno).join('');
}

/**
 * La lista de dueños. Si la lectura FALLÓ, no se invita a «agregar el primero»
 * ni se dice que no hay dueños: no se sabe, y dar de alta a quien quizá ya
 * existe lo dejaría duplicado y partiría su cuenta en dos (es el mismo error que
 * ya le costó una vuelta a "Sacar carro").
 */
export function htmlListaDeDuenos(duenos, { fallo = false } = {}) {
  const ordenados = [...duenos].sort(porNombre);
  const barra = fallo
    ? `<div class="barra-lectura-fallida" role="alert"><p>${esc(MENSAJE_FALLO_LISTA)}</p></div>`
    : '';
  let cuerpo;
  if (ordenados.length) cuerpo = filasCuerpo(ordenados);
  else if (fallo) cuerpo = '<tr><td colspan="4" class="pendiente dn-vacio">No se pudo leer la lista. Intenta de nuevo o revisa la conexión.</td></tr>';
  else cuerpo = '<tr><td colspan="4" class="pendiente dn-vacio">Todavía no hay dueños.<br><a href="#/dinero/duenos/nuevo" class="btn btn-primario dn-boton-ancho-auto">Agregar el primero</a></td></tr>';
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <a href="#/dinero" class="btn">← Dinero</a>
        <h1>Dueños de carros</h1>
        <a href="#/dinero/duenos/nuevo" class="btn btn-primario dn-boton-suelto">Agregar dueño</a>
      </div>
      ${barra}
      ${ordenados.length ? `
        <label class="carro-campo dn-buscador">Buscar por nombre, teléfono o NIT
          <input type="search" id="dn-buscar" placeholder="Escribe para buscar...">
        </label>` : ''}
      <table class="tabla-carros">
        <thead>
          <tr><th>Nombre</th><th>Teléfono</th><th>NIT</th><th></th></tr>
        </thead>
        <tbody id="dn-filas">${cuerpo}</tbody>
      </table>
    </div>`;
}

function dibujarLista(contenedor, duenos, fallo) {
  contenedor.innerHTML = htmlListaDeDuenos(duenos, { fallo });
  const ordenados = [...duenos].sort(porNombre);

  function cablearFilas() {
    el('dn-filas').querySelectorAll('tr[data-id]').forEach((fila) => {
      fila.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'A') return; // Dejar pasar clics en enlaces
        location.hash = `${LISTA}/${fila.dataset.id}`;
      });
    });
  }
  cablearFilas();

  // El buscador filtra sobre la copia ya en memoria en cada tecla, sin tocar la
  // nube, y solo redibuja el cuerpo de la tabla (nunca el campo) para no perder
  // el foco a media palabra.
  if (ordenados.length) {
    el('dn-buscar').addEventListener('input', (ev) => {
      el('dn-filas').innerHTML = filasCuerpo(filtrar(ordenados, ev.target.value, textoDeDueno));
      cablearFilas();
    });
  }
}

// ---------- Vista: la ficha (alta y edición) ----------

const TIPO_INPUT = { telefono: 'tel' };

/** El formulario de un dueño, dibujado desde CAMPOS_DUENO: un campo nuevo ahí aparece aquí solo. */
export function htmlFormularioDeDueno(dueno, { esNuevo }) {
  const titulo = esNuevo ? 'Nuevo dueño' : (dueno?.nombre || 'Dueño sin nombre');
  const campos = CAMPOS_DUENO.map((campo) => `
        <label class="carro-campo">${esc(campo.etiqueta)}
          <input type="${TIPO_INPUT[campo.tipo] || 'text'}" id="df-${esc(campo.id)}" value="${esc(dueno?.[campo.id] || '')}">
        </label>`).join('');
  return `
    <div class="carros-contenido">
      <div class="carro-formulario">
        <h1>${esc(titulo)}</h1>
        <form id="df-form" novalidate>
          <section class="carro-seccion">
            <div class="carro-campos">${campos}
            </div>
          </section>
          <div class="carro-botones">
            <button type="button" id="df-volver" class="btn">Cancelar</button>
            <button type="submit" id="df-guardar" class="btn btn-primario dn-boton-suelto">Guardar dueño</button>
          </div>
        </form>
        ${esNuevo ? '' : `<p class="dn-ver-cuenta"><a href="${esc(rutaDeCuenta(`id:${dueno?.id}`))}">Ver lo que se le debe</a></p>`}
      </div>
    </div>`;
}

function dibujarFicha(contenedor, duenoId, duenos, fallo) {
  const esNuevo = duenoId === 'nuevo';
  let dueno = null;

  if (!esNuevo) {
    dueno = duenos.find((d) => d.id === duenoId);
    if (!dueno) {
      // Con la lectura fallida no se sabe si el dueño existe: no se afirma que no.
      contenedor.innerHTML = fallo
        ? `<div class="carros-contenido"><div class="barra-lectura-fallida" role="alert"><p>${esc(MENSAJE_FALLO_LISTA)}</p></div>
          <p><a href="${LISTA}" class="btn">← Dueños</a></p></div>`
        : `<p class="pendiente">No se encontró este dueño. <a href="${LISTA}">Volver a la lista</a></p>`;
      return;
    }
  }

  contenedor.innerHTML = htmlFormularioDeDueno(dueno, { esNuevo });
  // El id de un dueño NUEVO se decide una vez, antes del primer intento: un reintento tras un tiempo vencido
  // cae en la misma ficha y no deja dos dueños, que partirían su cuenta en dos (H-2).
  const alta = altaConIdFijo(nuevoIdDueno);

  function leerCampos() {
    const campos = {};
    // Nunca se arma a mano campo por campo: se recorre CAMPOS_DUENO, así un campo
    // que se agregue ahí algún día se lee solo.
    CAMPOS_DUENO.forEach((c) => { campos[c.id] = el(`df-${c.id}`)?.value.trim() ?? ''; });
    return campos;
  }

  async function guardar(ev) {
    ev.preventDefault();
    // construirDueno hace el merge con lo que ya existía (nunca un objeto armado
    // a mano aquí), así lo que la ficha no muestra —el id, `actualizado`, lo que
    // se agregue después— pasa de largo sin que este archivo tenga que saber que existe.
    const nuevo = construirDueno(dueno || {}, leerCampos());
    const falta = faltaAlgoEnDueno(nuevo);
    if (falta.length) {
      aviso(`Falta completar: ${falta.join(', ')}.`, 'error');
      return;
    }
    const boton = el('df-guardar');
    boton.disabled = true;
    try {
      const guardado = await guardarDueno(await alta.paraGuardar(nuevo));
      alta.terminada();
      aviso(`${guardado.nombre || 'Dueño'} guardado.`, 'exito');
      location.hash = LISTA;
    } catch (error) {
      aviso('No se pudo guardar el dueño. Intenta de nuevo.', 'error');
      console.error(error);
    } finally {
      boton.disabled = false;
    }
  }

  el('df-form').addEventListener('submit', guardar);
  el('df-volver').addEventListener('click', () => { location.hash = LISTA; });
}

// ---------- Punto de entrada ----------

let ultimoToken = 0;

/** Dibuja la pantalla de dueños dentro de `contenedor`: la lista, o la ficha de uno. */
export async function pintarDuenos(contenedor, duenoId) {
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith(LISTA) && miToken === ultimoToken;

  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';

  let duenos = [];
  let fallo = false;
  // Solo la lista se redibuja sola cuando llega algo por detrás; una ficha
  // abierta a medio editar no se pisa.
  const alLlegar = (r) => {
    duenos = r.datos;
    fallo = r.fallo;
    if (sigoVigente() && !duenoId) dibujarLista(contenedor, duenos, fallo);
  };

  let leida;
  try {
    leida = await cargarDuenos(alLlegar);
  } catch {
    // Una lectura que lanza es un fallo, nunca «no hay dueños».
    leida = { datos: [], fallo: true };
  }
  duenos = leida.datos;
  fallo = leida.fallo;

  if (!sigoVigente()) return;
  if (duenoId) dibujarFicha(contenedor, duenoId, duenos, fallo);
  else dibujarLista(contenedor, duenos, fallo);
}
