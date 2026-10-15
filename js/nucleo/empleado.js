// La ficha del empleado: quien atiende el mostrador, rentó el carro y cobra comisión.
//
// Hasta ahora «¿Quién lo rentó?» era un texto libre en cada contrato, y «Juan» y
// «juan» eran dos personas distintas para el sistema. El dueño pidió poner los
// nombres dentro del sistema, con su CÓDIGO (su hoja de Excel trabaja por código;
// en el mostrador teclea «6» o busca «Wilder», lo que sea más rápido) y con un
// PORCENTAJE de comisión por empleado que solo él cambia (§6 y §12b del diseño).
//
// Es el espejo de dueno.js, con lo que un empleado tiene de propio. Y con un
// cuidado que el dueño no tiene: el porcentaje puede ser CERO (Wilder es el dueño
// y no gana comisión), y un cero es un número de verdad, no «no hay porcentaje».
// Por eso nada aquí usa `||` ni «si hay porcentaje» para decidir: se pregunta con
// `porcentajeAnotado`, que distingue el 0 de lo vacío.
import { normalizar, filtrar } from './busqueda.js';
import { q } from './dinero.js';

/** El porcentaje con que arranca el formulario de un empleado nuevo (§5: «5 % por defecto»). Solo es lo que se propone: el empleado guarda el suyo. */
export const PORCENTAJE_DE_COMISION_POR_DEFECTO = 5;

/**
 * Los campos de la ficha, en el orden en que se piden. La pantalla de empleados
 * dibuja su formulario desde aquí. `activo` es la baja: un empleado que se va no
 * se borra (sus contratos viejos siguen siendo suyos y siguen pagándose), solo
 * deja de salir al escoger quién rentó.
 *
 * `porcentajeComision` se llama igual que en el contrato a propósito: es el mismo
 * dato. El del empleado es el de HOY; el del contrato es una copia que se sella el
 * día que se renta (§7b), para que subirle el porcentaje a alguien no mueva lo que
 * ya ganó.
 */
export const CAMPOS_EMPLEADO = [
  { id: 'codigo', etiqueta: 'Código', tipo: 'texto' },
  { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { id: 'porcentajeComision', etiqueta: 'Porcentaje de comisión', tipo: 'porcentaje' },
  { id: 'activo', etiqueta: 'Trabaja aquí', tipo: 'casilla' },
];

/**
 * El porcentaje como número, o `null` si no hay uno legible. El 0 SÍ es un porcentaje.
 * Lo vacío, un texto que no es un número, un booleano o una lista no lo son: `Number('')`
 * y `Number(true)` darían 0 y 1 con toda confianza, y un porcentaje que se inventa es una
 * comisión que se paga (o se deja de pagar) sin que nadie la decidiera.
 */
export function porcentajeAnotado(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? q(valor) : null;
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? q(n) : null;
}

/** ¿Trabaja aquí? Un empleado sin la llave `activo` (uno de antes de que existiera) sí. */
export const estaActivo = (empleado) => empleado?.activo !== false;

/**
 * Arma el empleado para guardar, preservando lo que el formulario no muestra
 * (como `construirDueno`: la ficha se reemplaza entera, y lo que no se copia se
 * pierde). El texto se recorta; el porcentaje, si se escribió un número, pasa a
 * número; y si NO se escribió uno legible se deja tal cual, para que
 * `problemasDeEmpleado` lo diga en vez de que se lea como 0.
 */
export function construirEmpleado(existente, campos) {
  const unido = { ...existente, ...campos };
  for (const llave of Object.keys(unido)) {
    if (typeof unido[llave] === 'string') unido[llave] = unido[llave].trim();
  }
  if ('porcentajeComision' in (campos ?? {})) {
    const numero = porcentajeAnotado(unido.porcentajeComision);
    if (numero !== null) unido.porcentajeComision = numero;
  }
  unido.activo = unido.activo === undefined ? true : Boolean(unido.activo);
  return unido;
}

/** El código para comparar: sin espacios sobrantes y sin importar mayúsculas. */
const codigoNormalizado = (e) => String(e?.codigo ?? '').trim().toLowerCase();

/**
 * Lo que impide guardar este empleado, en frases para él; vacío si se puede guardar.
 * `lista` son los demás empleados (con los dados de baja): sirve para que dos no
 * compartan código, porque teclear «6» tiene que dar a uno solo. Un empleado no choca
 * consigo mismo (se compara por `id`).
 */
export function problemasDeEmpleado(empleado, lista = []) {
  const problemas = [];
  if (!String(empleado?.nombre ?? '').trim()) problemas.push('Falta el nombre.');
  const codigo = codigoNormalizado(empleado);
  if (!codigo) {
    problemas.push('Falta el código.');
  } else {
    const otro = (Array.isArray(lista) ? lista : []).find((e) => e?.id !== empleado?.id && codigoNormalizado(e) === codigo);
    if (otro) problemas.push(`El código ${String(empleado.codigo).trim()} ya es de ${String(otro.nombre ?? '').trim() || 'otro empleado'}. Escoge otro.`);
  }
  const porcentaje = porcentajeAnotado(empleado?.porcentajeComision);
  if (porcentaje === null) {
    problemas.push('Falta el porcentaje de comisión. Si no gana comisión, escribe 0.');
  } else if (porcentaje < 0 || porcentaje > 100) {
    problemas.push('El porcentaje de comisión tiene que estar entre 0 y 100.');
  }
  return problemas;
}

/** Código y nombre juntos, para que el buscador encuentre al empleado por cualquiera de los dos. */
export function textoDeEmpleado(empleado) {
  return [empleado?.codigo, empleado?.nombre].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * Busca empleados por código o por nombre (el dueño pidió las dos cosas). El empleado cuyo
 * código es EXACTAMENTE lo escrito va primero: «6» tiene que dar a Wilder antes que a «16»
 * o a quien tenga un 6 en el nombre. Después, los que coinciden por texto, sin acentos ni
 * mayúsculas y en cualquier orden (la misma búsqueda de clientes y dueños).
 */
export function buscarEmpleados(lista, consulta) {
  const empleados = Array.isArray(lista) ? lista : [];
  const buscado = normalizar(consulta);
  if (!buscado) return empleados;
  const exactos = empleados.filter((e) => normalizar(e?.codigo) === buscado);
  const resto = filtrar(empleados, consulta, textoDeEmpleado).filter((e) => !exactos.includes(e));
  return [...exactos, ...resto];
}

/** El código que se propone para un empleado nuevo: el mayor número que ya hay, más uno. */
export function siguienteCodigo(lista) {
  const numeros = (Array.isArray(lista) ? lista : [])
    .map((e) => String(e?.codigo ?? '').trim())
    .filter((c) => /^\d+$/.test(c))
    .map(Number);
  return String(numeros.length ? Math.max(...numeros) + 1 : 1);
}

/** Por código como número (el 2 antes que el 10); los que no tienen un código numérico, al final, por nombre. */
export function ordenarEmpleados(lista) {
  const numero = (e) => (/^\d+$/.test(String(e?.codigo ?? '').trim()) ? Number(String(e.codigo).trim()) : Infinity);
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => (
    (numero(a) === numero(b) ? 0 : numero(a) < numero(b) ? -1 : 1)
    || String(a?.nombre ?? '').localeCompare(String(b?.nombre ?? ''), 'es')
    || String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  ));
}

/**
 * Lo que el contrato guarda del empleado que lo rentó: su `id` (para juntar todo lo suyo
 * en una cuenta), su nombre de ESE día (un dato de ese contrato, como `carroAjeno.dueno`: si
 * después se corrige el nombre en la ficha, el contrato sigue diciendo quién lo rentó), su
 * porcentaje de ESE día (sellado: subirlo después no mueve lo ya ganado) y su CÓDIGO de ESE día
 * (`empleadoCodigo`).
 *
 * El código se sella por la misma razón que el porcentaje, y más fuerte: la casilla del papel
 * preimpreso donde cae «quién lo rentó» se llama «PREPARADO POR (CODIGO)» y pide el código, no el
 * nombre. El papel impreso ese día llevó ese código, y una reimpresión tiene que decir lo mismo que
 * el original aunque después le cambien el código al empleado (el mismo principio del comprobante
 * del dueño de un carro ajeno). Es `null`, no `''`, si el empleado no tiene un código escrito: un
 * vacío no se parece a un código. Los contratos de antes no traen este campo y no se les inventa.
 *
 * `null` si no hay empleado o no tiene un porcentaje legible: ningún contrato se sella con un
 * porcentaje inventado. El 0 de Wilder se conserva como 0.
 */
export function datosDelContratoPara(empleado) {
  const porcentaje = porcentajeAnotado(empleado?.porcentajeComision);
  if (!empleado?.id || porcentaje === null) return null;
  return {
    empleadoId: empleado.id,
    rentadoPor: String(empleado.nombre ?? '').trim(),
    empleadoCodigo: String(empleado.codigo ?? '').trim() || null,
    porcentajeComision: porcentaje,
  };
}
