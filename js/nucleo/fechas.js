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

/**
 * Una fecha más (o menos) días. Vacío si la fecha no se entiende o si el resultado se sale de lo que
 * el calendario del navegador puede dibujar: `toISOString()` LANZA con una fecha fuera de rango, y eso
 * reventaba la pantalla (la línea de «Devolución prevista» se quedaba con la fecha anterior, que se
 * veía de verdad) en cuanto alguien tecleaba un número de días absurdo.
 */
export function sumarDias(iso, dias) {
  const base = aUTC(iso);
  if (Number.isNaN(base)) return '';
  const ms = base + Math.trunc(Number(dias) || 0) * MS_DIA;
  if (!Number.isFinite(new Date(ms).getTime())) return '';
  return aISO(ms);
}

/**
 * Una fecha más (o menos) MESES de calendario: el intervalo de tiempo de un servicio de mantenimiento («cada 3 meses»)
 * se cuenta así y no en días, porque «3 meses» desde el 3 de julio es el 3 de octubre y no los 90 días que caerían el 1.
 *
 * Si el mes de llegada no tiene ese día (el 31 no existe en febrero) la fecha se queda en el ÚLTIMO día de ese mes, no
 * pasa al siguiente: seis meses desde el 31 de agosto son el 28 de febrero, no el 3 de marzo — un servicio no se atrasa
 * días por cómo cae el calendario. Vacío si la fecha no se entiende, si los meses no son un entero, o si el resultado
 * se sale del año de cuatro dígitos: nunca una fecha inventada.
 */
export function sumarMeses(iso, meses) {
  if (!esFechaISO(iso)) return '';
  const n = Number(meses);
  if (typeof meses === 'boolean' || meses === null || meses === '' || !Number.isInteger(n)) return '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  const total = (mes - 1) + n;
  const anioDestino = anio + Math.floor(total / 12);
  const mesDestino = ((total % 12) + 12) % 12;
  // El día 0 del mes siguiente es el último de este: cuántos días tiene el mes de llegada.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
  const resultado = `${String(anioDestino).padStart(4, '0')}-${String(mesDestino + 1).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
  return esFechaISO(resultado) ? resultado : '';
}

/** Días completos entre dos fechas. Negativo si la segunda es anterior. */
export function diasEntre(desde, hasta) {
  const a = aUTC(desde);
  const b = aUTC(hasta);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

/**
 * ¿Es esto una fecha de calendario de verdad, en el formato 'YYYY-MM-DD' con
 * ceros y cuatro dígitos de año? Se comprueba dando el viaje de ida y vuelta por
 * el calendario: lo que no sobrevive a sumarle cero días no es una fecha.
 *
 * Existe porque el campo de fecha del navegador deja teclear el año con cinco
 * dígitos («20261-10-21») y entonces devuelve eso. Sin esta revisión, esa fecha
 * entraba a «Sacar carro» y producía una devolución prevista «+020261-10», o a
 * «Registrar pago» y dejaba un comprobante que nunca se pudo armar (prueba del
 * sistema, 7 oct 2026). Atrapa también el 30 de febrero y el año 26 (que el
 * calendario toma por 1926).
 */
export function esFechaISO(x) {
  return typeof x === 'string' && x !== '' && sumarDias(x, 0) === x;
}

/**
 * Cuándo debería regresar el carro, o vacío ('') si no se puede saber.
 *
 * Solo hay fecha de regreso cuando hay una renta de verdad: una salida que es una fecha de calendario y
 * un número ENTERO de días, de 1 en adelante. Con 0 días, sin días, con días negativos o con decimales
 * no hay fecha, y se devuelve vacío — nunca la fecha de salida «más cero» ni un 2.5 redondeado a 2:
 * eso se veía como «Devolución prevista: 31 oct 2026» con aspecto de dato real cuando todavía no había
 * ninguno (H-10, prueba del sistema del 7 oct 2026). Es la misma regla que ya se aplica en todo el
 * sistema: un dato que falta se ve como «—» o «sin anotar», jamás como uno inventado. El vacío es lo
 * que las pantallas ya pintan como «—», así que ninguna tiene que repetir esta cuenta.
 *
 * Los días llegan del formulario como número o como texto ('4'); lo que no es un número no cuenta.
 */
export function devolucionPrevista(fechaSalida, dias) {
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 1) return '';
  if (!esFechaISO(fechaSalida)) return '';
  const regreso = sumarDias(fechaSalida, n);
  // Con una cantidad de días enorme el resultado puede salirse del año de cuatro dígitos
  // («+010000-…»): tampoco es una fecha de regreso.
  return esFechaISO(regreso) ? regreso : '';
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
