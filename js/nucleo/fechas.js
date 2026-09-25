// Fechas del contrato, en texto 'YYYY-MM-DD' y contadas en UTC.
//
// Se cuenta en UTC para que el resultado no dependa de la zona horaria ni del
// horario de verano: un día de diferencia en la devolución vale el precio de un
// día de renta.

const MS_DIA = 24 * 60 * 60 * 1000;

function aUTC(iso) {
  if (typeof iso !== 'string') return NaN;
  const [anio, mes, dia] = iso.split('-').map(Number);
  if (!anio || !mes || !dia) return NaN;
  return Date.UTC(anio, mes - 1, dia);
}

function aISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * La fecha de hoy, en texto, según el calendario de aquí.
 *
 * No se usa `toISOString()` a propósito: eso da el día de UTC, y Guatemala va
 * seis horas atrás. De seis de la tarde a medianoche, un carro que regresa hoy
 * quedaría registrado mañana — y un día de más es un día de renta de más.
 */
export function hoyISO(momento = new Date()) {
  const mes = String(momento.getMonth() + 1).padStart(2, '0');
  const dia = String(momento.getDate()).padStart(2, '0');
  return `${momento.getFullYear()}-${mes}-${dia}`;
}

/** Una fecha más (o menos) días. */
export function sumarDias(iso, dias) {
  const base = aUTC(iso);
  if (Number.isNaN(base)) return '';
  return aISO(base + Math.trunc(Number(dias) || 0) * MS_DIA);
}

/** Días completos entre dos fechas. Negativo si la segunda es anterior. */
export function diasEntre(desde, hasta) {
  const a = aUTC(desde);
  const b = aUTC(hasta);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

/** Cuándo debería regresar el carro. */
export function devolucionPrevista(fechaSalida, dias) {
  return sumarDias(fechaSalida, dias);
}

/** Días de atraso. Devolver antes de tiempo no descuenta nada. */
export function diasAtraso(prevista, fechaReal) {
  if (!prevista || !fechaReal) return 0;
  return Math.max(0, diasEntre(prevista, fechaReal));
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Una fecha ISO ('2026-08-25') en el formato que lee el dueño: '25 ago 2026'.
 * Duplica a propósito el formato de fecha() en ui.js — igual que
 * textoDosDecimales duplica a dinero() en dinero.js — para que el núcleo
 * (cierre.js, avisos.js) pueda armar mensajes legibles sin depender de la
 * capa de presentación. Revisión final: los mensajes de cierre.js mostraban
 * la fecha cruda ('2026-08-25') en vez de este formato.
 */
export function textoFecha(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return iso ?? '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  if (!anio || !mes || !dia) return iso;
  return `${dia} ${MESES[mes - 1]} ${anio}`;
}
