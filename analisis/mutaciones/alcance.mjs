// Qué archivos de prueba ALCANZAN a un archivo de código. Tres caminos, los tres cuentan:
//  1. lo importa, directo o a través de otros módulos;
//  2. nombra el archivo en su texto (hay pruebas del proyecto que LEEN el código fuente en vez de ejecutarlo);
//  3. recorre el árbol de fuentes (readdirSync): esas tocan todo.
// Si un mutante no lo alcanza NINGUNA prueba, no es «sobreviviente»: es «nadie lo mira», y se cuenta aparte.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, join, basename } from 'node:path';

const archivosDe = (dir, fuera = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivosDe(p, fuera);
    else if (/\.(mjs|js)$/.test(e)) fuera.push(p);
  }
  return fuera;
};

function importaciones(ruta) {
  const src = readFileSync(ruta, 'utf8');
  const fuera = [];
  const re = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const esp = m[1] || m[2];
    if (!esp || !esp.startsWith('.')) continue;
    const abs = resolve(dirname(ruta), esp);
    if (existsSync(abs)) fuera.push(abs);
  }
  return fuera;
}

/** Mapa: archivo de prueba -> conjunto de archivos de código que alcanza. */
export function mapaDeAlcance(raiz) {
  const pruebas = archivosDe(join(raiz, 'pruebas')).filter((p) => p.endsWith('.test.mjs'));
  const mapa = new Map();
  for (const prueba of pruebas) {
    const vistos = new Set();
    const pila = [prueba];
    while (pila.length) {
      const actual = pila.pop();
      if (vistos.has(actual)) continue;
      vistos.add(actual);
      for (const sig of importaciones(actual)) pila.push(sig);
    }
    const texto = readFileSync(prueba, 'utf8');
    const recorreElArbol = /readdirSync/.test(texto);
    mapa.set(relative(raiz, prueba), { importa: new Set([...vistos].map((v) => relative(raiz, v))), texto, recorreElArbol });
  }
  return mapa;
}

/** Los archivos de prueba que alcanzan a `archivo` (ruta relativa, p. ej. 'js/pantallas/dinero.js'). */
export function pruebasQueAlcanzan(mapa, archivo) {
  const nombre = basename(archivo);
  const fuera = [];
  for (const [prueba, info] of mapa) {
    if (info.importa.has(archivo) || info.recorreElArbol || info.texto.includes(nombre)) fuera.push(prueba);
  }
  return fuera.sort();
}
