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
  // Se corre el punto con el texto decimal del número ('5.015' -> '5.015e2')
  // en vez de multiplicar por 100: multiplicar arrastra el error binario y
  // hace que 5.015 se redondee para abajo. Se redondea el valor absoluto para
  // que un negativo caiga del mismo lado que su positivo.
  const escalado = Number(`${Math.abs(x)}e2`);
  if (!Number.isFinite(escalado)) return Math.round(x * 100) / 100;
  const redondeado = Math.round(escalado) / 100;
  if (redondeado === 0) return 0;
  return x < 0 ? -redondeado : redondeado;
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

/**
 * Un monto en texto con dos decimales y separador de miles ('700.00',
 * '1,234.56'), sin el símbolo de moneda — para los detalles de línea que
 * arma el núcleo (contrato.js), que van pegados a un 'Q' ya puesto en el
 * texto (`Q${...}`). No se importa dinero() de ui.js a propósito: el núcleo
 * no depende de la capa de presentación, aunque el formato sea el mismo que
 * ve el dueño en toda la pantalla — antes estos detalles mostraban "Q700" en
 * vez de "Q700.00", un monto sin sus centavos en el mismo lugar donde el
 * resto del sistema siempre los muestra.
 */
export function textoDosDecimales(n) {
  return q(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Un monto con el símbolo Q y el signo antes de la Q ('-Q50.00', nunca
 * 'Q-50.00'): lo mismo que hace dinero() en ui.js, pero para los mensajes que
 * arma el propio núcleo (cierre.js) sobre montos que sí pueden salir
 * negativos, como un subtotal que un descuento dejó en contra. Interpolar
 * textoDosDecimales de un negativo directo en un texto `Q${...}` deja el
 * signo pegado adentro de la Q, que es justo lo que esto evita.
 */
export function textoConQ(n) {
  const monto = q(n);
  const negativo = monto < 0;
  return `${negativo ? '-' : ''}Q${textoDosDecimales(Math.abs(monto))}`;
}

/**
 * Un número entero con separador de miles y sin decimales ('45,000'): para
 * kilometrajes, que no llevan centavos. Revisión final: recibirCarro.js
 * mostraba el kilometraje de salida con textoDosDecimales ('45,000.00') y
 * contratos.js lo mostraba crudo ('45000') — el mismo dato con dos caras
 * distintas en dos pantallas.
 */
export function textoEntero(n) {
  return Math.round(q(n)).toLocaleString('es-GT', { maximumFractionDigits: 0 });
}
