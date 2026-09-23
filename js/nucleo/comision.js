// La comisión del empleado que rentó el carro.
//
// Regla del dueño, confirmada el 23 de septiembre de 2026:
//   comisión = porcentaje × [(días contratados + días de atraso) × precio por día − descuento]
//
// El precio por día va COMPLETO: ya lleva el seguro y el seguro de terceros
// adentro, y esos solo se desglosan en el contrato impreso. No entran daños,
// combustible, carta poder, seguros extra, varios ni el recargo de tarjeta.
//
// El porcentaje se guarda en el contrato el día que se hace, para que subirle el
// porcentaje a un empleado no mueva las comisiones de meses ya pagados.
import { q } from './dinero.js';
import { atrasoDe } from './contrato.js';

/** Sobre cuánto se calcula la comisión. Nunca menos de cero. */
export function baseComision(c) {
  const dias = q(c?.dias) + atrasoDe(c);
  const renta = q(dias * q(c?.precioDia));
  const descuento = q(c?.cierre?.descuento);
  return q(Math.max(0, renta - descuento));
}

/**
 * La comisión del contrato.
 *
 * Mientras el carro no regresa se puede ver una estimación con los días
 * contratados, pero `firme: false` avisa que todavía puede cambiar: un día de
 * atraso la sube y un descuento la baja. Solo las firmes se pagan.
 */
export function comisionDe(c) {
  const base = baseComision(c);
  const porcentaje = q(c?.porcentajeComision);
  return {
    base,
    porcentaje,
    monto: q(base * porcentaje / 100),
    firme: Boolean(c?.cierre?.fechaReal),
  };
}
