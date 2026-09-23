// Todo el dinero del sistema pasa por aquí.
//
// Las computadoras no guardan bien los decimales: 0.1 + 0.2 da 0.30000000000000004.
// Un centavo perdido por contrato no se nota, pero al final del mes el reporte no
// cuadra con la caja y nadie sabe por qué. Por eso cada monto se redondea a dos
// decimales en el momento en que se calcula, no al mostrarlo.

/** Redondea a dos decimales. Lo vacío o lo que no sea número vale cero. */
export function q(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Suma montos redondeando el resultado. */
export function suma(...montos) {
  return q(montos.reduce((total, m) => total + q(m), 0));
}

/** El monto con el porcentaje de tarjeta encima (12 significa 12 %). */
export function conTarjeta(monto, porcentaje) {
  return q(q(monto) * (1 + q(porcentaje) / 100));
}

/** Solo el recargo: lo que se le suma al cliente por pagar con tarjeta. */
export function recargoTarjeta(monto, porcentaje) {
  return q(conTarjeta(monto, porcentaje) - q(monto));
}
