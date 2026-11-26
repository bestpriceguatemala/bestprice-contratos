// Dónde caen los errores de una corrida: cuántos pasan dentro de cada función del archivo.
//
// Por qué existe, y por qué hay que tener cuidado con él (26 de noviembre de 2026): la primera versión de
// este reparto estaba escrita a ojo en una sola línea y reconocía solo `function x` y `const x = (`. Todo
// lo demás —`const X = { … }`, `const X = 'texto'`, los manejadores de eventos sueltos— se le quedaba
// pegado a la función de ARRIBA. Tres veces seguidas dio cuentas falsas: «migrar: 59 de 123» eran en
// realidad `migrar` (24) más los oyentes de eventos (99); «bajarExcel: 58 de 103» eran 26 más 77; y
// «avisoDelPapelQueNoCambia: 45 de 134» eran dos líneas más toda la definición del Excel.
//
// Un reparto que no sabe dónde empieza cada cosa no mide, adivina — lo mismo que un arnés sin controles.
// Este corta por CUALQUIER declaración de nivel superior y, dentro de una función, por las de dos
// espacios; y para lo que no cae en ninguna (los oyentes sueltos) tiene un tramo con nombre propio.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, exigirBase } from './rutas.mjs';

exigirBase();

/** Las declaraciones de un archivo, con el renglón en que empieza cada una. */
export function declaracionesDe(src) {
  const fuera = [];
  src.split('\n').forEach((linea, i) => {
    const nivelSuperior = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(linea)
      ?? /^(?:export\s+)?(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/.exec(linea);
    if (nivelSuperior) { fuera.push({ linea: i + 1, nombre: nivelSuperior[1], nivel: 0 }); return; }
    const dentro = /^ {2}(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(linea)
      ?? /^ {2}(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(|function)/.exec(linea);
    if (dentro) { fuera.push({ linea: i + 1, nombre: dentro[1], nivel: 1 }); return; }
    // Los manejadores que se enganchan sueltos no son una declaración, pero son un tramo con su propio
    // dueño: sin esto se le pegan a la última función y le inflan la cuenta.
    const oyente = /^ {2}([A-Za-z0-9_$.]+)\.addEventListener\(\s*'([a-z]+)'/.exec(linea);
    if (oyente) fuera.push({ linea: i + 1, nombre: `(oyente de «${oyente[2]}»)`, nivel: 1 });
  });
  return fuera;
}

const [jsonl, archivo] = process.argv.slice(2);
if (!jsonl || !archivo) {
  console.error('uso: node analisis/mutaciones/porFuncion.mjs <resultados.jsonl> <js/pantallas/x.js>');
  process.exit(1);
}

const decl = declaracionesDe(readFileSync(join(BASE, archivo), 'utf8'));
const donde = (n) => {
  let ultima = '(antes de la primera declaración)';
  for (const d of decl) { if (d.linea <= n) ultima = d.nombre; else break; }
  return ultima;
};

const resultados = readFileSync(jsonl, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => !x.meta);
const por = new Map();
for (const x of resultados) {
  const clave = donde(x.renglon);
  const e = por.get(clave) ?? { total: 0, pasan: 0 };
  e.total += 1;
  if (x.estado === 'sobrevive') e.pasan += 1;
  por.set(clave, e);
}

const total = resultados.length;
const pasan = resultados.filter((x) => x.estado === 'sobrevive').length;
const muertos = resultados.filter((x) => x.estado === 'muere').length;
console.log(`${archivo}: ${total} errores | atrapados ${muertos} | pasan ${pasan} | ATRAPA ${((muertos / (muertos + pasan)) * 100).toFixed(1)} %`);
console.log('\npasan/total  dentro de');
for (const [nombre, e] of [...por].sort((a, b) => b[1].pasan - a[1].pasan)) {
  if (!e.pasan) continue;
  console.log(`${String(e.pasan).padStart(4)}/${String(e.total).padStart(4)}   ${nombre}`);
}
