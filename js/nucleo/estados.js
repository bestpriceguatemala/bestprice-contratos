// En qué anda cada contrato y cada carro.
//
// El carro y el contrato llevan caminos separados a propósito. El carro se
// libera al regresar; el contrato sigue abierto hasta que el cliente pague lo
// que falte y se le suelte la garantía de la tarjeta. Si se amarraran, un
// cliente que no paga unos daños dejaría el carro parado sin necesidad.
import { resumen } from './contrato.js';
import {
  diasAtraso, diasEntre, hoyISO, sumarDias,
} from './fechas.js';
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

/**
 * ¿Ya volvió el carro de este contrato? La única marca de que el carro
 * regresó es `cierre.fechaReal` (§7b del diseño: "Del cierre: fechaReal...").
 * "Cerrado" NO es un campo guardado — es un estado que se DERIVA
 * (`estadoContrato`: sin `cierre.fechaReal` el contrato sigue `'rentado'`; con
 * ella, `'cerrado'` o `'devuelto'` según `puedeCerrar`), así que nunca hay que
 * leer un `c.cerrado` ni un `c.fechaDevolucion` que no existen. Y no hace falta
 * replicar esa derivación completa: un contrato no puede estar cerrado sin que
 * el carro ya haya vuelto, así que preguntar solo por `cierre.fechaReal` ya
 * cubre ese caso.
 */
export function yaVolvio(c) {
  return Boolean(c?.cierre?.fechaReal);
}

/**
 * ¿Ya pasó la devolución prevista de este contrato, sin que el carro haya
 * vuelto? Un contrato con el carro de vuelta nunca cuenta, sin importar las
 * fechas: ya no es un pendiente de regreso, sin importar si todavía debe
 * cobro o garantía. El atraso se mide contra `hoy` (el día que se está
 * mirando, recibido de quien llama), no contra un reloj real, para que un día
 * pasado del calendario muestre lo que de verdad estaba atrasado ESE día.
 * Sin `hoy` no se sabe: no está atrasado.
 */
export function estaAtrasado(c, hoy) {
  if (yaVolvio(c)) return false;
  return diasEntre(c?.devolucionPrevista, hoy) > 0;
}

/**
 * Hasta cuándo ocupa un contrato su carro: su FIN EFECTIVO, que es el primer día
 * en que el carro puede volver a salir (por eso tocarse no es cruzarse: un carro
 * que regresa el 20 sale otra vez el 20). Es la ÚNICA regla de esto — los avisos
 * de salida, los choques de una reservación y todo lo que pregunte «¿este carro
 * está libre de tal día en adelante?» preguntan aquí, y ninguno vuelve a mirar
 * `devolucionPrevista` por su cuenta.
 *
 * - Con el carro ya de vuelta: el día que de verdad volvió, `cierre.fechaReal`.
 *   Sea antes de lo previsto (el carro está en el patio y libre, aunque el
 *   contrato siga abierto cobrando un saldo) o después (estuvo fuera de
 *   verdad hasta ese día). La fecha prevista ya no dice nada cierto.
 * - Con el carro todavía afuera y a tiempo: la devolución prevista, que es lo
 *   único que se sabe.
 * - Con el carro todavía afuera y la fecha prevista ya vencida: mañana. No se
 *   sabe cuándo volverá, pero sí que hoy sigue afuera —está registrado como
 *   afuera— y por eso hoy no puede salir otra vez: no queda libre el día
 *   previsto, ni siquiera hoy. Es el carro con menos probabilidad de estar libre,
 *   y que su fecha vencida lo mostrara libre fue el gemelo al revés del aviso
 *   falso de un carro ya recibido. Más allá de hoy no se inventa nada: una renta
 *   que empieza mañana no avisa, porque nadie sabe si para entonces habrá vuelto.
 *
 * `hoy` se recibe, nunca se lee del reloj aquí. Sin él, un contrato afuera se
 * mide por su fecha prevista (no se inventa un atraso que no se puede comprobar).
 * Devuelve '' si el contrato no tiene ninguna de las fechas.
 *
 * Solo se aplica a CONTRATOS. Una reservación no tiene `cierre` ni está
 * «atrasada» por tener fechas pasadas: apartó ese rango y ese es el que ocupa.
 */
export function finDelContrato(c, hoy) {
  if (yaVolvio(c)) return c.cierre.fechaReal;
  if (estaAtrasado(c, hoy)) return sumarDias(hoy, 1);
  return c?.devolucionPrevista ?? '';
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
