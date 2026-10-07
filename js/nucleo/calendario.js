// El calendario, en cálculo puro.
//
// Esto alimenta dos pantallas que vienen después: el mes que el dueño hojea
// y las cuatro cifras que ve al entrar ("hoy salen 3, regresan 2, van
// atrasados 1, garantías por liberar 4"). Aquí no hay DOM — solo las listas y
// los números; las pantallas deciden cómo pintarlos.
import { diasEntre } from './fechas.js';
import { estadoReserva } from './reserva.js';
// `yaVolvio` y `estaAtrasado` viven en estados.js: son las mismas preguntas con las
// que se decide hasta cuándo ocupa un contrato su carro (`finDelContrato`), y una
// regla de «atrasado» en dos archivos es una que se corrige en uno solo.
import { garantiaPorLiberar, yaVolvio, estaAtrasado } from './estados.js';

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
 * Lo que pasa en un día: quién sale, quién todavía debe regresar, quién ya
 * regresó, quién ya está atrasado. Listas, no números — la pantalla del
 * calendario las necesita completas para poder mostrar nombres, no solo
 * cuántos, y así no tiene que volver a filtrar reservas y contratos por su
 * cuenta (el brief es explícito: la pantalla no vuelve a filtrar).
 *
 * `regresan` y `yaRegresaron` parten los contratos citados ese día en dos,
 * en vez de un solo `regresan` con todos: las cuatro cifras del encabezado
 * (resumenDeHoy) son una lista de pendientes de HOY, no un historial — si
 * dos carros se esperaban hoy y los dos ya están en el patio a las 5pm, el
 * encabezado no puede seguir diciendo "regresan 2" solo porque la cita caía
 * hoy. La vista de mes sí quiere el día completo, por eso ambas listas
 * existen y ninguna se descarta aquí.
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

  const citadosHoy = contratos.filter((c) =>
    c?.devolucionPrevista && diasEntre(fecha, c.devolucionPrevista) === 0);
  const regresan = citadosHoy.filter((c) => !yaVolvio(c));
  const yaRegresaron = citadosHoy.filter((c) => yaVolvio(c));

  const atrasados = contratos.filter((c) => estaAtrasado(c, fecha));

  return { salen, regresan, yaRegresaron, atrasados };
}

/**
 * Lo que el calendario PINTA de un día: lo mismo que `movimientosDelDia`, salvo que
 * un día que todavía no llega no tiene atrasados.
 *
 * Por qué: `movimientosDelDia` mide el atraso contra el día que se mira, y eso está
 * bien para hoy y para un día pasado. Pero para un día futuro contesta «todo contrato
 * abierto cuya fecha prevista ya pasó para entonces», es decir, una proyección en la
 * que NADIE regresa nunca: con tres carros que vuelven hoy, el mes entero se llenaba
 * de «⚠ 3» —una pastilla roja en cada día que falta— y el detalle de un día futuro
 * decía «Atrasado 14 días» de un carro que ni siquiera ha vencido (prueba del
 * sistema, 7 oct 2026). Esos carros ya salen en «↓ regresan» el día que les toca; el
 * rojo es para lo que de verdad está atrasado, y un rojo que se equivoca enseña a
 * ignorar el que acierta.
 *
 * `regresan` y `salen` de un día futuro sí se quedan: son citas, no atrasos.
 */
export function movimientosParaPintar(fecha, hoy, datos) {
  const movimientos = movimientosDelDia(fecha, datos);
  return diasEntre(hoy, fecha) > 0 ? { ...movimientos, atrasados: [] } : movimientos;
}

/**
 * Las cuatro cifras del encabezado, para el día `hoy`.
 *
 * Sale, regresa y atrasados se apoyan en `movimientosDelDia` — no se vuelve
 * a escribir esa regla aquí, solo se cuentan sus listas. Garantías por
 * liberar es distinto: no depende de la fecha, es un pendiente que se
 * arrastra hasta que alguien lo suelta, y usa `garantiaPorLiberar`
 * (estados.js) para no duplicarla — la misma función que usa la lista de
 * "Garantías por liberar" en la pantalla de flota, para que la cifra de
 * aquí y esa lista nunca puedan decir números distintos. Un contrato con el
 * carro todavía afuera NO cuenta (la garantía retenida ahí es lo normal de
 * una renta activa), y uno pagado en efectivo (`garantiaMonto` 0) tampoco
 * tiene nada que liberar.
 */
export function resumenDeHoy(hoy, { reservas = [], contratos = [] } = {}) {
  const { salen, regresan, atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  const garantias = contratos.filter(garantiaPorLiberar).length;

  return {
    salen: salen.length,
    regresan: regresan.length,
    atrasados: atrasados.length,
    garantias,
  };
}
