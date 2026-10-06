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

/**
 * La hora, siempre en 24 horas, pase lo que pase en la computadora.
 *
 * `<input type="time">` se ve como el navegador quiera: Chrome usa el idioma
 * del NAVEGADOR, no el de la página, así que en una máquina en inglés sale
 * "01:58 PM" aunque el contrato de papel y el país trabajen en 24 horas.
 * Probado: poner `lang="es-GT"` o `lang="de-DE"` en el input no cambia nada.
 * Por eso el campo pasa a ser de texto y el formato lo decide este archivo.
 *
 * Acepta lo que el mostrador teclea de verdad con el cliente enfrente —
 * "1345", "13:45", "9:5", "0945", "13.45", y también "1:30 pm", que es como se
 * dice la hora en Guatemala — y devuelve siempre 'HH:MM'. Con «am» o «pm» la
 * hora es de 1 a 12 y se pasa a 24 horas (12 am es 00:00; 12 pm, 12:00): es una
 * hora completa y sin ambigüedad, así que se entiende en vez de borrarse.
 *
 * Lo que NO es una hora completa devuelve '' en vez de inventar una. Una hora a
 * medio escribir no es una hora: "9:" (lo interrumpió el cliente) no es las 9:00,
 * y ":30" no es las 00:30; guardarlas como si lo fueran pondría en el contrato
 * impreso una hora de aspecto firme que él nunca escribió. Por eso cada parte
 * tiene que estar escrita: la hora, y — si hay dos puntos — los minutos también.
 * Solo se completa lo que no dice nada nuevo: los ceros de la izquierda ("9:5" es
 * 09:05) y los minutos cuando se escribe una hora sola ("8" es 08:00).
 *
 * Esta función es la que decide, y se llama también al LEER el formulario, no solo
 * al salir del campo: lo que se guarda no puede depender de que un evento del
 * navegador haya alcanzado a correr (Enter dentro del campo, según el navegador).
 */
export function hora24(texto) {
  let cuerpo = String(texto ?? '').trim().toLowerCase();
  if (!cuerpo) return '';

  // «am» / «pm», también como «a.m.» o «p. m.».
  let meridiano = null;
  const sufijo = /^(.*?)\s*([ap])\s*\.?\s*m\s*\.?$/.exec(cuerpo);
  if (sufijo) {
    cuerpo = sufijo[1].trim();
    [, , meridiano] = sufijo;
  }

  let h;
  let m;
  const conSeparador = /^(\d{1,2})\s*[:.h\s]\s*(\d{1,2})$/.exec(cuerpo);
  if (conSeparador) {
    h = Number(conSeparador[1]);
    m = Number(conSeparador[2]);
  } else if (/^\d{4}$/.test(cuerpo)) {
    h = Number(cuerpo.slice(0, 2));
    m = Number(cuerpo.slice(2));
  } else if (/^\d{3}$/.test(cuerpo)) {
    h = Number(cuerpo.slice(0, 1));
    m = Number(cuerpo.slice(1));
  } else if (/^\d{1,2}$/.test(cuerpo)) {
    h = Number(cuerpo);
    m = 0;
  } else {
    return '';
  }

  if (m < 0 || m > 59) return '';
  if (meridiano) {
    if (h < 1 || h > 12) return '';
    h = (h % 12) + (meridiano === 'p' ? 12 : 0);
  }
  if (h < 0 || h > 23) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
