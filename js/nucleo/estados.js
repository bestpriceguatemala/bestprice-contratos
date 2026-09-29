// En qué anda cada contrato y cada carro.
//
// El carro y el contrato llevan caminos separados a propósito. El carro se
// libera al regresar; el contrato sigue abierto hasta que el cliente pague lo
// que falte y se le suelte la garantía de la tarjeta. Si se amarraran, un
// cliente que no paga unos daños dejaría el carro parado sin necesidad.
import { resumen } from './contrato.js';
import { diasAtraso, hoyISO } from './fechas.js';
import { q } from './dinero.js';

/**
 * Lo que falta para poder cerrar: saldo por cobrar y garantía por liberar.
 *
 * `garantia` ya no es solo `!garantiaLiberada` (hallazgo importante de la
 * revisión final): una renta pagada en efectivo, sin tarjeta de por medio,
 * tiene `garantiaMonto` en 0 — no hay nada que liberar, así que exigir el
 * mismo candado de "Liberar garantía" (con su confirm de "¿Liberar la
 * garantía de Q0.00...? Esto no se puede deshacer") era pedir una acción sin
 * sentido para poder cerrar un contrato que ya no debe nada.
 */
export function pendientesDe(c) {
  return {
    saldo: resumen(c).saldo,
    garantia: q(c?.garantiaMonto) > 0 && !c?.garantiaLiberada,
  };
}

/**
 * ¿Hay una garantía bloqueada que YA se puede soltar? Dos condiciones, las
 * dos necesarias, no una:
 *
 * 1. El carro ya volvió (`cierre.fechaReal` puesta — la única marca real de
 *    un regreso, §7b del diseño). Mientras el carro sigue en la calle, la
 *    tarjeta retenida es lo normal de una renta activa, no un pendiente del
 *    dueño: nadie suelta la garantía de un carro que todavía no ha podido
 *    revisar.
 * 2. `pendientesDe(c).garantia` — sigue habiendo monto bloqueado sin soltar
 *    (ya descarta el caso `garantiaMonto` 0, pagado en efectivo).
 *
 * `pendientesDe(c).garantia` sola no alcanza: es `true` también en un
 * contrato con el carro todavía afuera (la tarjeta sí está retenida), así
 * que usarla sin la primera condición cuenta rentas en curso como si
 * fueran trabajo pendiente. Esa fue justo la falla real: la cifra
 * "Garantías por liberar" del resumen (`resumenDeHoy`, núcleo/calendario.js)
 * y la lista de abajo en la pantalla de flota decidían esto cada una por su
 * cuenta y daban números distintos en la misma pantalla, al mismo momento.
 * Ahora las dos preguntan aquí.
 */
export function garantiaPorLiberar(c) {
  return Boolean(c?.cierre?.fechaReal) && pendientesDe(c).garantia;
}

/**
 * Un contrato se cierra cuando no debe nada y la garantía ya se liberó.
 *
 * `saldo <= 0`, no `saldo === 0` (hallazgo importante de la revisión final):
 * un descuento dado después de haber cobrado de más deja el saldo negativo
 * (resumen() a propósito no lo recorta a 0, ver su comentario), y con
 * `=== 0` ese contrato se quedaba "devuelto" para siempre, aunque ya no le
 * debiera nada a nadie — cargarContratosAbiertos() lo seguía trayendo en
 * cada apertura sin que hubiera nada más que hacer con él.
 */
export function puedeCerrar(c) {
  const { saldo, garantia } = pendientesDe(c);
  return saldo <= 0 && !garantia;
}

/** 'rentado' mientras el carro anda fuera, 'devuelto' hasta cerrarlo, 'cerrado' al final. */
export function estadoContrato(c) {
  if (!c?.cierre?.fechaReal) return 'rentado';
  return puedeCerrar(c) ? 'cerrado' : 'devuelto';
}

/**
 * El estado del carro para la pantalla principal.
 *
 * `contratos` son los de ese carro; se busca el que todavía no ha regresado.
 */
export function estadoCarro(carro, contratos = [], hoy = hoyISO()) {
  const fueraDeServicio = Boolean(carro?.fueraDeServicio);
  const motivo = carro?.motivoFueraDeServicio || '';
  const afuera = contratos.find((c) => c?.carroId === carro?.id && !c?.cierre?.fechaReal);

  // Sin contrato abierto, el carro está aquí: o disponible, o parado por algo.
  if (!afuera) {
    return {
      estado: fueraDeServicio ? 'fuera de servicio' : 'disponible',
      contrato: null, diasAtraso: 0, fueraDeServicio, motivo,
    };
  }

  // Con contrato abierto, el carro lo tiene un cliente. Eso es lo que manda en
  // el mostrador: hay que saber quién lo tiene y si viene tarde. Que además
  // esté marcado fuera de servicio se muestra como etiqueta, no borra al cliente.
  const atraso = diasAtraso(afuera.devolucionPrevista, hoy);
  return {
    estado: atraso > 0 ? 'atrasado' : 'rentado',
    contrato: afuera, diasAtraso: atraso, fueraDeServicio, motivo,
  };
}
