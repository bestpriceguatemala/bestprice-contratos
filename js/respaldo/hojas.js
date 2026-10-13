// Escribir celdas dentro del XML de una hoja de Excel, sin tocar nada más.
//
// Esta es la mitad de la promesa de §10 («conserva sus diez hojas, sus colores y sus fórmulas»): en vez de leer
// el libro a objetos y volverlo a escribir —que es donde una librería pierde formatos condicionales, validaciones
// o la protección sin avisar—, el respaldo toma el XML de SU hoja y cambia solo el contenido de las celdas de
// datos. Todo lo demás son los mismos bytes que tiene su archivo.
//
// Tres reglas, y las tres se niegan en voz alta:
//   1. Una celda con fórmula no se pisa. Sus fórmulas son lo que hace que el archivo sirva para rentar.
//   2. Una celda que la plantilla no trae no se inventa: si no está donde el mapa dice, el Excel cambió y escribir
//      «al lado» pondría el DPI en la columna de la licencia.
//   3. Un número que no es número no se escribe: Excel se niega a abrir el archivo.
import { diasEntre, sumarDias } from '../nucleo/fechas.js';

const MAX_TEXTO = 32000; // Excel no abre celdas de más de 32,767 caracteres.

// ---------- letras de columna ----------

/** 'A' → 1, 'Z' → 26, 'AA' → 27, 'CA' → 79. */
export function numeroDeColumna(letras) {
  let n = 0;
  for (const letra of String(letras)) n = n * 26 + (letra.charCodeAt(0) - 64);
  return n;
}

/** 1 → 'A', 27 → 'AA', 79 → 'CA'. */
export function columnaDeNumero(n) {
  let resto = n;
  let letras = '';
  while (resto > 0) {
    const r = (resto - 1) % 26;
    letras = String.fromCharCode(65 + r) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return letras;
}

// ---------- fechas y horas ----------

/**
 * Una fecha ISO ('2026-08-20') como el número de serie que guarda Excel (46254). Se cuenta con `diasEntre`, como
 * todas las fechas del sistema, desde el 30 de diciembre de 1899: así el serial coincide con el de Excel a partir
 * del 1 de marzo de 1900 (Excel cuenta un 29 de febrero de 1900 que no existió, y antes de esa fecha el serial no
 * calza con el calendario real). Una fecha anterior, o que no existe, devuelve `null`: nunca un número inventado.
 */
export function serialDeFecha(iso) {
  if (typeof iso !== 'string' || sumarDias(iso, 0) !== iso) return null;
  const serial = diasEntre('1899-12-30', iso);
  return serial >= 61 ? serial : null;
}

/** 'HH:MM' como fracción del día, que es como guarda Excel una hora (15:00 → 0.625). `null` si no es una hora. */
export function fraccionDeHora(texto) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return (horas * 60 + minutos) / 1440;
}

// ---------- texto ----------

/** Escapa lo que XML no admite suelto dentro de un texto. */
export function escaparXml(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Quita los caracteres que XML 1.0 no admite ni escapados (controles, sustitutos sueltos): rompen el archivo entero. */
function limpiarTexto(texto) {
  // eslint-disable-next-line no-control-regex
  let limpio = String(texto).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
  limpio = limpio.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
  if (limpio.length > MAX_TEXTO) limpio = `${limpio.slice(0, MAX_TEXTO - 40)} … [recortado: no cabe en una celda]`;
  return limpio;
}

const desescapar = (texto) => texto
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

/** La tabla de textos compartidos (`xl/sharedStrings.xml`) como lista; un texto con formato mixto se une en uno. */
export function textosCompartidos(xml) {
  return [...String(xml).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, cuerpo]) => (
    [...cuerpo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, t]) => desescapar(t)).join('')
  ));
}

// ---------- leer una celda ----------

const CELDA = /<c r="([A-Z]{1,3}\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function textoDeCuerpo(atributos, cuerpo, textos) {
  if (!cuerpo) return null;
  const tipo = /\st="([^"]+)"/.exec(atributos)?.[1];
  if (tipo === 'inlineStr') {
    const t = [...cuerpo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, x]) => desescapar(x)).join('');
    return t === '' ? null : t;
  }
  const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
  if (v === undefined || v === '') return null;
  if (tipo === 's') return textos[Number(v)] ?? null;
  return desescapar(v);
}

/**
 * Lo que dicen varias celdas, como texto, de una sola pasada por la hoja: un `Map` de referencia a texto (`null` si la
 * celda está vacía o no existe). Para comprobar los encabezados de la plantilla antes de escribir.
 */
export function textosDeCeldas(xml, refs, textos = []) {
  const quedan = new Set(refs);
  const leidas = new Map(refs.map((ref) => [ref, null]));
  for (const m of String(xml).matchAll(CELDA)) {
    if (!quedan.has(m[1])) continue;
    leidas.set(m[1], textoDeCuerpo(m[2], m[3] ?? '', textos));
    quedan.delete(m[1]);
    if (!quedan.size) break;
  }
  return leidas;
}

/** Lo que dice una celda como texto, o `null` si está vacía o no existe. */
export function textoDeCelda(xml, ref, textos = []) {
  return textosDeCeldas(xml, [ref], textos).get(ref);
}

// ---------- escribir ----------

function celdaNueva(ref, estilo, valor) {
  const s = estilo ? ` s="${estilo}"` : '';
  if (valor === null || valor === undefined || valor === '') return `<c r="${ref}"${s}/>`;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error(`El valor de la celda ${ref} no es un número válido (${valor}). No se escribe: Excel no abriría el archivo.`);
    return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(limpiarTexto(valor))}</t></is></c>`;
}

/**
 * Escribe `cambios`, `[{ ref: 'B3', valor }]`, en el XML de una hoja y devuelve el XML nuevo.
 *
 *   texto  → cadena en línea (nunca una fórmula: «=SUMA(...)» tecleado en un nombre queda como texto)
 *   número → número (las fechas y horas, ya convertidas con `serialDeFecha` y `fraccionDeHora`)
 *   null o '' → vaciar la celda
 *
 * El estilo de cada celda (su color, su formato de fecha, si está desbloqueada) se conserva. Ver las tres reglas
 * de la cabecera: una fórmula no se pisa, una celda ausente se niega, un número inválido se niega.
 */
export function escribirCeldas(xml, cambios) {
  const porRef = new Map();
  for (const { ref, valor } of cambios) porRef.set(ref, valor);
  const hechas = new Set();

  const salida = String(xml).replace(CELDA, (todo, ref, atributos, cuerpo) => {
    if (!porRef.has(ref)) return todo;
    if (cuerpo && /<f[\s>/]/.test(cuerpo)) {
      throw new Error(`La celda ${ref} de la plantilla tiene una fórmula y el respaldo no la pisa: son las fórmulas las que hacen que el archivo sirva para rentar. ¿Cambió el diseño del Excel?`);
    }
    hechas.add(ref);
    return celdaNueva(ref, /\ss="(\d+)"/.exec(atributos)?.[1], porRef.get(ref));
  });

  const faltan = [...porRef.keys()].filter((ref) => !hechas.has(ref));
  if (faltan.length) {
    throw new Error(`La plantilla no trae la celda ${faltan.slice(0, 5).join(', ')}${faltan.length > 5 ? ` (y ${faltan.length - 5} más)` : ''}. ¿Cambió el diseño del Excel? No se escribe a un lado: pondría un dato en la columna equivocada.`);
  }
  return salida;
}

// ---------- completar celdas ausentes (solo al preparar la plantilla) ----------

/** Cuáles de estas referencias la hoja NO trae como celda, de una sola pasada. */
export function celdasAusentes(xml, refs) {
  const hay = new Set([...String(xml).matchAll(/<c r="([A-Z]{1,3}\d+)"/g)].map((m) => m[1]));
  return refs.filter((ref) => !hay.has(ref));
}

/** El estilo de la misma columna en la fila de arriba más cercana que la tenga; `null` si ninguna. */
function estiloDeLaColumnaDeArriba(xml, letras, fila) {
  for (let r = fila - 1; r >= Math.max(1, fila - 60); r -= 1) {
    const hallada = new RegExp(`<c r="${letras}${r}"([^>]*?)(?:/>|>)`).exec(xml);
    if (hallada) return /\ss="(\d+)"/.exec(hallada[1])?.[1] ?? null;
  }
  return null;
}

/**
 * Agrega, vacías, las celdas que la hoja no trae. Excel no escribe una celda cuando su estilo es el de la columna, y en
 * su plantilla faltan cuatro de CLIENTES (I27, G545, D605, N1345) porque en esos renglones el estilo de la celda se
 * perdió. Sin celda no hay dónde escribir (`escribirCeldas` se niega), así que se completan al preparar la plantilla,
 * con el estilo que tienen las demás celdas de esa columna: así la celda nueva es igual a sus vecinas (desbloqueada, con
 * el mismo formato) y no cae al estilo suelto de la columna.
 *
 * Se ponen en su lugar, en el orden de columnas que Excel exige dentro de la fila. La fila tiene que existir.
 */
export function completarCeldas(xml, refs) {
  let salida = String(xml);
  for (const ref of refs) {
    const [, letras, filaTexto] = /^([A-Z]+)(\d+)$/.exec(ref);
    const fila = Number(filaTexto);
    if (new RegExp(`<c r="${ref}"[ />]`).test(salida)) continue;
    const filaXml = new RegExp(`(<row r="${fila}"[^>]*>)([\\s\\S]*?)(</row>)`).exec(salida);
    if (!filaXml) throw new Error(`La plantilla no trae la fila ${fila}, así que no se puede completar la celda ${ref}.`);
    const estilo = estiloDeLaColumnaDeArriba(salida, letras, fila);
    const nueva = `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}/>`;
    const columna = numeroDeColumna(letras);
    let dentro = filaXml[2];
    const siguiente = [...dentro.matchAll(/<c r="([A-Z]+)\d+"/g)].find((m) => numeroDeColumna(m[1]) > columna);
    dentro = siguiente ? dentro.slice(0, siguiente.index) + nueva + dentro.slice(siguiente.index) : dentro + nueva;
    salida = salida.slice(0, filaXml.index) + filaXml[1] + dentro + filaXml[3] + salida.slice(filaXml.index + filaXml[0].length);
  }
  return salida;
}
