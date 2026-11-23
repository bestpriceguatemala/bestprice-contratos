// Cuántos errores saldrían de cada archivo de js/, sin correr ninguna prueba. Sirve para saber qué tan
// grande es una medición antes de arrancarla, y para ver si el generador está mirando el archivo entero.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BASE, exigirBase } from './rutas.mjs';
import { generar } from './generador.mjs';

exigirBase();

const archivos = (dir, fuera = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, fuera);
    else if (e.endsWith('.js')) fuera.push(p);
  }
  return fuera;
};

const pedido = process.argv[2];
const filas = [];
for (const ruta of archivos(join(BASE, 'js'))) {
  const corta = relative(BASE, ruta);
  if (pedido && !corta.includes(pedido)) continue;
  const src = readFileSync(ruta, 'utf8');
  const lineas = src.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*|$)/.test(l)).length;
  filas.push({ archivo: corta, lineas, errores: generar(src, corta).length });
}
filas.sort((a, b) => b.errores - a.errores);
let lineas = 0; let errores = 0;
for (const f of filas) {
  lineas += f.lineas; errores += f.errores;
  console.log(`${String(f.errores).padStart(5)} errores | ${String(f.lineas).padStart(5)} líneas | ${f.archivo}`);
}
console.log(`${String(errores).padStart(5)} errores | ${String(lineas).padStart(5)} líneas | TOTAL (${filas.length} archivos)`);
