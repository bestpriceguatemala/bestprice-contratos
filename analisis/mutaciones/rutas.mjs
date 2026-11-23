// Dónde está el proyecto y dónde trabaja el arnés. Nada de rutas escritas a mano: el arnés de octubre de
// 2026 se perdió justamente por vivir fuera del repositorio, en una carpeta temporal que se limpió.
//
// RAIZ  el proyecto (dos carpetas arriba de este archivo).
// CASA  donde el arnés hace sus copias y deja sus resultados. FUERA del proyecto a propósito: son
//       gigas de copias del árbol y no tienen nada que hacer en el repositorio. Se puede cambiar con
//       la variable de entorno ARNES_CASA.

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CASA = process.env.ARNES_CASA || join(tmpdir(), 'arnes-mutaciones');
export const BASE = join(CASA, 'base');

mkdirSync(CASA, { recursive: true });

/** Para las órdenes que necesitan la copia limpia: si no está, lo dice con palabras en vez de reventar. */
export function exigirBase() {
  if (!existsSync(BASE)) {
    console.error(`No hay copia limpia en ${BASE}.\nCorre primero:  node analisis/mutaciones/correr.mjs preparar`);
    process.exit(2);
  }
}
