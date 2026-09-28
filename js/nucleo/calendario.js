// El calendario, en cálculo puro.
//
// Esto alimenta dos pantallas que vienen después: el mes que el dueño hojea
// y las cuatro cifras que ve al entrar ("hoy salen 3, regresan 2, van
// atrasados 1, garantías por liberar 4"). Aquí no hay DOM — solo las listas y
// los números; las pantallas deciden cómo pintarlos.
import { diasEntre } from './fechas.js';
import { estadoReserva } from './reserva.js';
import { pendientesDe } from './estados.js';

/**
 * Todas las fechas de un mes, en orden. `mes` es 'YYYY-MM'.
 *
 * El último día se saca pidiéndole al día 0 del mes siguiente (que en el
 * calendario Gregoriano cae un día antes del día 1 de ese mes, es decir, en
 * el último día del mes pedido) — así febrero da 28 o 29 solo, sin tabular
 * "cuántos días tiene cada mes" a mano.
 */
export function diasDelMes(mes) {
  const [anioTexto, mesTexto] = String(mes || '').split('-');
  const anio = Number(anioTexto);
  const numeroMes = Number(mesTexto);
  if (!anio || !numeroMes) return [];

  const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  const fechas = [];
  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    fechas.push(`${anioTexto}-${mesTexto}-${String(dia).padStart(2, '0')}`);
  }
  return fechas;
}

/**
 * El mes en semanas de lunes a domingo, con huecos (`null`) al principio y
 * al final para completar la primera y la última semana.
 *
 * `Date.getUTCDay()` da 0 para domingo, 1 para lunes... — si se usara tal
 * cual como columna, domingo caería en la primera columna y correría todo el
 * mes una posición. Por eso se convierte explícito: lunes queda en la
 * columna 0 y domingo en la 6.
 */
export function cuadriculaDelMes(mes) {
  const fechas = diasDelMes(mes);
  if (fechas.length === 0) return [];

  const [anioTexto, mesTexto] = String(mes).split('-');
  const anio = Number(anioTexto);
  const numeroMes = Number(mesTexto);
  const diaSemanaCrudo = new Date(Date.UTC(anio, numeroMes - 1, 1)).getUTCDay();
  const huecosAlPrincipio = (diaSemanaCrudo + 6) % 7;

  const celdas = [...Array(huecosAlPrincipio).fill(null), ...fechas];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) {
    semanas.push(celdas.slice(i, i + 7));
  }
  return semanas;
}

/**
 * ¿Ya pasó la devolución prevista de este contrato, sin que el carro haya
 * vuelto? Un contrato cerrado nunca cuenta, sin importar las fechas: ya se
 * saldó y ya no es un pendiente del dueño. El atraso se mide contra `fecha`
 * (el día que se está mirando en el calendario), no contra un reloj real,
 * para que un día pasado del calendario muestre lo que de verdad estaba
 * atrasado ESE día.
 */
function estaAtrasado(c, fecha) {
  if (c?.cerrado) return false;
  if (c?.fechaDevolucion) return false;
  return diasEntre(c?.devolucionPrevista, fecha) > 0;
}

/**
 * Lo que pasa en un día: quién sale, quién regresa, quién ya está atrasado.
 * Listas, no números — la pantalla del calendario las necesita completas
 * para poder mostrar nombres, no solo cuántos, y así no tiene que volver a
 * filtrar reservas y contratos por su cuenta.
 */
export function movimientosDelDia(fecha, { reservas = [], contratos = [] } = {}) {
  // Cancelada o ya entregada no sale: se pregunta con estadoReserva(), no con
  // el campo `cancelada` a secas, porque una reservación entregada tampoco
  // debe seguir apareciendo aquí (ya salió por el contrato, no por sí misma).
  //
  // El `r?.fechaSalida &&` antes de diasEntre() no es adorno: diasEntre()
  // devuelve 0 (no NaN) cuando una fecha falta o es inválida (ver su guarda
  // en fechas.js), así que sin este candado una reservación sin fecha
  // "coincidiría" con cualquier día. Mismo patrón que seCruzan en reserva.js.
  const salen = reservas.filter((r) =>
    estadoReserva(r) === 'pendiente' && r?.fechaSalida && diasEntre(fecha, r.fechaSalida) === 0);

  const regresan = contratos.filter((c) => c?.devolucionPrevista && diasEntre(fecha, c.devolucionPrevista) === 0);

  const atrasados = contratos.filter((c) => estaAtrasado(c, fecha));

  return { salen, regresan, atrasados };
}

/**
 * Las cuatro cifras del encabezado, para el día `hoy`.
 *
 * Sale, regresa y atrasados se apoyan en `movimientosDelDia` — no se vuelve
 * a escribir esa regla aquí, solo se cuentan sus listas. Garantías por
 * liberar es distinto: no depende de la fecha, es un pendiente que se
 * arrastra hasta que alguien lo suelta, y usa la misma regla que
 * `pendientesDe` (estados.js) para no duplicarla — un contrato pagado en
 * efectivo (`garantiaMonto` 0) no tiene nada que liberar y no debe contar.
 */
export function resumenDeHoy(hoy, { reservas = [], contratos = [] } = {}) {
  const { salen, regresan, atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  const garantias = contratos.filter((c) => pendientesDe(c).garantia).length;

  return {
    salen: salen.length,
    regresan: regresan.length,
    atrasados: atrasados.length,
    garantias,
  };
}
