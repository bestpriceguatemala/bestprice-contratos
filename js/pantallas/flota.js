// Pantalla principal: la flota con su estado (§6 del diseño, "Principal — la
// flota").
//
// El principio es "se ve el carro, no el papeleo": un cuadro por carro, y el
// botón para recibirlo vive en el carro que está afuera — nunca hay que ir a
// buscar un número de contrato en otra pantalla.
//
// Esta pantalla no muestra ningún monto cobrado, utilidad ni comisión: esa
// promesa es del "área de dinero" bajo contraseña (§6, §11). Las dos listas de
// pendientes de abajo son la única excepción que permite el diseño, porque ahí
// el monto es lo que falta para poder cerrar el contrato, no una cifra de
// negocio.
import { estadoCarro } from '../nucleo/estados.js';
import { resumen } from '../nucleo/contrato.js';
import { diasEntre, hoyISO } from '../nucleo/fechas.js';
import { cargarFlota, cargarContratosAbiertos } from '../datos.js';
import { dinero, fecha } from '../ui.js';

const ESTADOS = {
  disponible: { clase: 'es-disponible', etiqueta: 'Disponible' },
  rentado: { clase: 'es-rentado', etiqueta: 'Rentado' },
  atrasado: { clase: 'es-atrasado', etiqueta: 'Atrasado' },
  'fuera de servicio': { clase: 'es-fuera', etiqueta: 'Fuera de servicio' },
};

// El nombre del cliente y el motivo de "fuera de servicio" son texto libre que
// el dueño escribió en algún formulario; se escapan antes de entrar al HTML
// para que un "&" o un "<" sueltos no rompan el cuadro del carro.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pluralDias = (n) => `${n} día${n === 1 ? '' : 's'}`;

function botonAccion(texto, ruta, primario = true) {
  return `<a class="btn ${primario ? 'btn-primario' : ''}" href="${ruta}">${esc(texto)}</a>`;
}

/** El cuadro de un carro: placas, marca y línea, y su estado. */
function tarjetaCarro(carro, info) {
  const { estado, contrato, diasAtraso, fueraDeServicio, motivo } = info;
  const cfg = ESTADOS[estado];
  const encabezado = [carro?.placas, carro?.marca, carro?.linea].filter(Boolean).join(' · ');

  let cuerpo = '';
  let boton;
  if (estado === 'disponible') {
    boton = botonAccion('Sacar carro', `#/sacar/${carro.id}`);
  } else if (estado === 'fuera de servicio') {
    cuerpo = `<p class="carro-detalle">${esc(motivo || 'Sin motivo registrado')}</p>`;
    // Ningún plan hecho todavía trae una pantalla que reactive un carro; la
    // ruta queda a la espera igual que #/sacar y #/recibir (el enrutador ya
    // sabe avisar "Todavía no está lista esta pantalla" mientras tanto).
    boton = botonAccion('Volver a habilitar', `#/habilitar/${carro.id}`, false);
  } else {
    // rentado o atrasado: en los dos manda quién tiene el carro (§5, Estados).
    const detalle = estado === 'atrasado'
      ? `Atrasado ${pluralDias(diasAtraso)}`
      : `Vuelve el ${esc(fecha(contrato?.devolucionPrevista))}`;
    cuerpo = `
      <p class="carro-cliente">${esc(contrato?.clienteNombre || 'Cliente sin nombre')}</p>
      <p class="carro-detalle ${estado === 'atrasado' ? 'carro-atraso' : ''}">${detalle}</p>`;
    boton = botonAccion('Recibir carro', `#/recibir/${contrato.id}`);
  }

  // Un carro marcado fuera de servicio que además anda rentado no pierde su
  // cuadro azul o rojo (dónde está el carro manda); el motivo se ve aparte,
  // en una etiqueta gris, sin tapar al cliente ni el botón de recibir.
  const etiqueta = fueraDeServicio && estado !== 'fuera de servicio'
    ? `<span class="etiqueta-fuera">${esc(motivo || 'Fuera de servicio')}</span>`
    : '';

  return `
    <article class="tarjeta-carro ${cfg.clase}">
      <header><span class="punto"></span><strong>${esc(encabezado)}</strong></header>
      <p class="carro-estado">${cfg.etiqueta}</p>
      ${etiqueta}
      ${cuerpo}
      ${boton}
    </article>`;
}

function filaPendiente(cliente, montoTexto, diasTexto) {
  return `<li><strong>${esc(cliente)}</strong><span>${esc(montoTexto)}</span><span>${esc(diasTexto)}</span></li>`;
}

/** Solo aparece si hay algo que mostrar (§6: las listas son la excepción, no la regla). */
function seccionPendientes(titulo, filas) {
  if (!filas.length) return '';
  return `<section class="pendientes"><h2>${esc(titulo)}</h2><ul class="lista-pendientes">${filas.join('')}</ul></section>`;
}

function dibujar(contenedor, flota, contratos, hoy) {
  if (!flota.length) {
    contenedor.innerHTML = `
      <p class="pendiente">Todavía no hay carros en la flota.<br>
      Pide que te agreguen los carros para empezar a usar el sistema.</p>`;
    return;
  }

  const tarjetas = flota
    .map((carro) => tarjetaCarro(carro, estadoCarro(carro, contratos, hoy)))
    .join('');

  // Garantías por liberar: solo contratos que ya regresaron (tienen cierre) y
  // cuya garantía sigue bloqueada — mientras el carro sigue afuera, la
  // garantía está bien retenida, eso no es algo "por liberar" todavía.
  //
  // Ojo: `cargarContratosAbiertos()` (T9) hoy filtra fuera cualquier contrato
  // con `cierre.fechaReal`, así que esta lista se queda vacía en la pantalla
  // real hasta que esa función también entregue los devueltos — no es un
  // límite de este archivo, es la forma en que T9 carga los datos.
  //
  // `garantiaMonto` es el monto autorizado que describe la §6 del diseño para
  // el bloque de tarjetas; ninguna tarea anterior lo guarda todavía, así que
  // "Sacar carro" (T11) deberá escribirlo junto con `garantiaLiberada`.
  const filasGarantia = contratos
    .filter((c) => c?.cierre?.fechaReal && c?.garantiaLiberada === false)
    .map((c) => filaPendiente(
      c?.clienteNombre || 'Cliente sin nombre',
      dinero(c?.garantiaMonto),
      `${pluralDias(Math.max(0, diasEntre(c.cierre.fechaReal, hoy)))} esperando`,
    ));

  // Pendientes de cobro: cualquier contrato con saldo, haya regresado o no —
  // un cliente puede quedar debiendo desde el día que sacó el carro.
  const filasCobro = contratos
    .filter((c) => resumen(c).saldo > 0)
    .map((c) => filaPendiente(
      c?.clienteNombre || 'Cliente sin nombre',
      dinero(resumen(c).saldo),
      pluralDias(Math.max(0, diasEntre(c?.cierre?.fechaReal || c?.fechaSalida, hoy))),
    ));

  contenedor.innerHTML = `
    <div class="flota-cuadros">${tarjetas}</div>
    ${seccionPendientes('Garantías por liberar', filasGarantia)}
    ${seccionPendientes('Pendientes de cobro', filasCobro)}
  `;
}

/** Dibuja la pantalla principal dentro de `contenedor`. */
export async function pintarFlota(contenedor) {
  const hoy = hoyISO();
  // cargarFlota/cargarContratosAbiertos sirven la copia local al instante y
  // nunca rechazan (T9): no hace falta un try/catch para que esta pantalla no
  // se rompa si la nube falla.
  const [flota, contratos] = await Promise.all([cargarFlota(), cargarContratosAbiertos()]);
  dibujar(contenedor, flota, contratos, hoy);
}
