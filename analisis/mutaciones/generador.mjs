// Genera los errores que se le meten a propósito a un archivo. Cada uno es: posición, texto viejo,
// texto nuevo, renglón y tipo. Solo en regiones de código (ver tokens.mjs) y nunca en un `import`
// ni en un `export ... from`: romper el módulo no mide nada, muere siempre y subiría el puntaje de a gratis.

import { regionesDeCodigo, renglones } from './tokens.mjs';

const OPERADORES = [
  // los más largos primero: así '===' no se lee como '=='
  ['===', '!==', 'igualdad'],
  ['!==', '===', 'igualdad'],
  ['&&', '||', 'logico'],
  ['||', '&&', 'logico'],
  ['??', '||', 'nulo'],
  ['?.', '.', 'cadena-opcional'],
  ['<=', '<', 'relacional'],
  ['>=', '>', 'relacional'],
  ['==', '!=', 'igualdad'],
  ['!=', '==', 'igualdad'],
  ['++', '--', 'conteo'],
  ['--', '++', 'conteo'],
  ['<', '<=', 'relacional'],
  ['>', '>=', 'relacional'],
];

// Aritmética: se trata aparte porque hay que evitar '+=' , '++', '=>' y los signos de un número.
const ARITMETICA = [['+', '-'], ['-', '+'], ['*', '/'], ['/', '*']];

const PALABRAS = [
  ['true', 'false', 'booleano'],
  ['false', 'true', 'booleano'],
  ['Math.max', 'Math.min', 'extremo'],
  ['Math.min', 'Math.max', 'extremo'],
  ['.every(', '.some(', 'cuantificador'],
  ['.some(', '.every(', 'cuantificador'],
  ['.filter(', '.concat(', 'coleccion'],
  ['.trim()', '', 'limpieza'],
  ['.toUpperCase()', '.toLowerCase()', 'mayusculas'],
];

const letra = (c) => /[A-Za-z0-9_$]/.test(c || '');

export function generar(src, archivo) {
  const codigo = regionesDeCodigo(src);
  const reng = renglones(src);
  const lineas = src.split('\n');
  const esImport = new Set();
  lineas.forEach((l, k) => {
    const t = l.trim();
    if (t.startsWith('import ') || t.startsWith('import{') || /^export\s+.*\sfrom\s/.test(t) || t.startsWith('export * from')) esImport.add(k + 1);
  });

  const fuera = [];
  const poner = (pos, viejo, nuevo, tipo) => {
    if (esImport.has(reng[pos])) return;
    fuera.push({ archivo, pos, viejo, nuevo, renglon: reng[pos], tipo });
  };
  const todoCodigo = (pos, largo) => {
    for (let k = pos; k < pos + largo; k++) if (!codigo[k]) return false;
    return true;
  };

  // 1. Operadores de dos y tres caracteres, y los de uno que no son aritmética
  for (let i = 0; i < src.length; i++) {
    if (!codigo[i]) continue;
    for (const [viejo, nuevo, tipo] of OPERADORES) {
      if (!src.startsWith(viejo, i)) continue;
      if (!todoCodigo(i, viejo.length)) continue;
      // '<' o '>' que sean parte de '<=', '>=', '=>', '<<' o '>>' ya los cubre la entrada más larga
      if (viejo === '<' && (src[i + 1] === '=' || src[i + 1] === '<' || src[i - 1] === '<')) break;
      if (viejo === '>' && (src[i + 1] === '=' || src[i + 1] === '>' || src[i - 1] === '=' || src[i - 1] === '>')) break;
      if (viejo === '==' && (src[i + 2] === '=' || src[i - 1] === '!' || src[i - 1] === '=')) break;
      if (viejo === '!=' && src[i + 2] === '=') break;
      poner(i, viejo, nuevo, tipo);
      i += viejo.length - 1;
      break;
    }
  }

  // 2. Aritmética
  for (let i = 0; i < src.length; i++) {
    if (!codigo[i]) continue;
    const c = src[i];
    const sig = src[i + 1];
    const ant = src[i - 1];
    for (const [viejo, nuevo] of ARITMETICA) {
      if (c !== viejo) continue;
      if (sig === '=' || sig === c || ant === c) continue;      // += ++ -- ** //
      if (c === '>' ) continue;
      if (ant === '=' && c === '>') continue;                    // =>
      if ((c === '+' || c === '-')) {
        // signo de un número o de una variable (unario): lo de antes no es un valor
        let k = i - 1;
        while (k >= 0 && /\s/.test(src[k])) k--;
        const prev = src[k] || '';
        if (!(letra(prev) || prev === ')' || prev === ']' || prev === "'" || prev === '"' || prev === '`')) continue;
      }
      if (c === '/' && (sig === '/' || sig === '*')) continue;
      poner(i, viejo, nuevo, 'aritmetica');
      break;
    }
  }

  // 3. Palabras y llamadas
  for (let i = 0; i < src.length; i++) {
    if (!codigo[i]) continue;
    for (const [viejo, nuevo, tipo] of PALABRAS) {
      if (!src.startsWith(viejo, i)) continue;
      if (!todoCodigo(i, viejo.length)) continue;
      if (/^[a-zA-Z]/.test(viejo) && (letra(src[i - 1]) || letra(src[i + viejo.length]))) continue;
      poner(i, viejo, nuevo, tipo);
      i += viejo.length - 1;
      break;
    }
  }

  // 4. Números
  const re = /(?<![\w$.])(\d+(?:\.\d+)?)(?![\w$])/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const i = m.index;
    if (!todoCodigo(i, m[1].length)) continue;
    const n = Number(m[1]);
    const nuevo = n === 0 ? '1' : n === 1 ? '0' : String(n === Math.round(n) ? n + 1 : n * 2);
    poner(i, m[1], nuevo, 'numero');
  }

  // 5. Condiciones de `if`: siempre sí y siempre no
  const reIf = /\bif\s*\(/g;
  while ((m = reIf.exec(src)) !== null) {
    const abre = m.index + m[0].length - 1;
    if (!codigo[abre]) continue;
    let k = abre; let nivel = 0;
    for (; k < src.length; k++) {
      if (!codigo[k]) continue;
      if (src[k] === '(') nivel++;
      else if (src[k] === ')') { nivel--; if (nivel === 0) break; }
    }
    if (nivel !== 0) continue;
    const cond = src.slice(abre + 1, k);
    if (!cond.trim() || cond.length > 300) continue;
    if (esImport.has(reng[abre])) continue;
    fuera.push({ archivo, pos: abre + 1, viejo: cond, nuevo: 'true', renglon: reng[abre], tipo: 'condicion' });
    fuera.push({ archivo, pos: abre + 1, viejo: cond, nuevo: 'false', renglon: reng[abre], tipo: 'condicion' });
  }

  // 6. Borrar un renglón que sea una sola orden (termina en ';' y no declara nada que se use después
  //    de forma evidente: si declara, borrarlo rompe al cargar y moriría de a gratis, así que se salta)
  let base = 0;
  lineas.forEach((linea, k) => {
    const inicio = base;
    base += linea.length + 1;
    const t = linea.trim();
    if (esImport.has(k + 1)) return;
    if (!t.endsWith(';') || t.length < 6) return;
    if (/^(const|let|var|return|export|import|throw)\b/.test(t)) return;
    if (!codigo[inicio + (linea.length - linea.trimStart().length)]) return;
    const desde = inicio + (linea.length - linea.trimStart().length);
    fuera.push({ archivo, pos: desde, viejo: t, nuevo: '', renglon: k + 1, tipo: 'borrar-orden' });
  });

  // 7. Textos que no están vacíos -> vacíos (solo los de comilla simple, que es lo que usa el proyecto)
  const reTexto = /'((?:[^'\\\n]|\\.){2,})'/g;
  while ((m = reTexto.exec(src)) !== null) {
    const i = m.index;
    // la comilla de apertura no es código (es texto), pero la posición anterior sí debería serlo
    if (codigo[i]) continue;      // si el tokenizador la marcó como código, es que algo no cuadra
    if (esImport.has(reng[i])) continue;
    if (/^[.#]/.test(m[1])) continue;        // selectores de CSS: cambiarlos es ruido de pintado
    fuera.push({ archivo, pos: i, viejo: m[0], nuevo: "''", renglon: reng[i], tipo: 'texto' });
  }

  // Sin repetidos (misma posición y mismo cambio)
  const vistos = new Set();
  return fuera.filter((x) => {
    const clave = `${x.pos}|${x.viejo}|${x.nuevo}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }).sort((a, b) => a.pos - b.pos);
}
