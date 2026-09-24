// Utilidades de presentación: cómo se ven el dinero, las fechas y los avisos
// flotantes en pantalla. Nada de esto decide reglas del negocio, solo formatea
// lo que el núcleo ya calculó.

/**
 * Un monto en quetzales con separador de miles y dos decimales: 'Q1,234.56'.
 * Un negativo sale '-Q50.00', con el signo antes de la Q — no 'Q-50.00',
 * que es como lo dejaba `toLocaleString` antes de este arreglo. El plan de
 * dinero (descuentos, reembolsos) y el saldo sobrepagado de `resumen()`
 * (nucleo/contrato.js) son los primeros que van a mostrar montos negativos,
 * y 'Q-50.00' se lee como un monto raro pegado a un signo, no como "menos
 * cincuenta quetzales".
 */
export function dinero(n) {
  const x = Number(n);
  const monto = Number.isFinite(x) ? x : 0;
  const negativo = monto < 0;
  // es-GT usa coma de millares y punto decimal, igual que en el Excel del dueño.
  const texto = Math.abs(monto).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${negativo ? '-' : ''}Q${texto}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Una fecha ISO ('2026-08-25') en el formato que lee el dueño: '25 ago 2026'. */
export function fecha(iso) {
  if (typeof iso !== 'string') return '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  return `${dia} ${MESES[mes - 1]} ${anio}`;
}

/**
 * Muestra un mensaje flotante que se quita solo a los pocos segundos.
 * `tipo` es 'error', 'exito' o 'info' (por defecto) y solo cambia el color:
 * el dueño nunca debe leer un código técnico aquí, siempre una frase completa.
 */
export function aviso(texto, tipo = 'info') {
  const caja = document.getElementById('avisos');
  if (!caja) return;
  const nota = document.createElement('div');
  nota.className = `aviso aviso-${tipo}`;
  nota.textContent = texto;
  caja.appendChild(nota);
  setTimeout(() => nota.remove(), 5000);
}
