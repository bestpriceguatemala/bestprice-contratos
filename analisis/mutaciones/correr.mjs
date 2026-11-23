// El arnés. Mete un error a la vez en una COPIA del árbol y mira si alguna prueba se pone roja.
// Nunca usa el shell: spawn con arreglo de argumentos, así que no hay nada que se separe mal
// (el 25 de octubre de 2026 un script reportó «todos muertos» sin haber corrido ninguna prueba).

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, CASA, BASE } from './rutas.mjs';
import { generar } from './generador.mjs';
import { mapaDeAlcance, pruebasQueAlcanzan } from './alcance.mjs';

const TIEMPO_MAX = 120000;

function ejecutar(cmd, args, opciones = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opciones, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let salida = ''; let error = ''; let matado = false;
    const reloj = setTimeout(() => { matado = true; try { process.kill(-p.pid, 'SIGKILL'); } catch { /* ya murió */ } }, opciones.tiempoMax ?? TIEMPO_MAX);
    p.stdout.on('data', (d) => { salida += d; });
    p.stderr.on('data', (d) => { error += d; });
    p.on('close', (codigo) => { clearTimeout(reloj); resolve({ codigo, salida, error, matado }); });
  });
}

const cuentas = (texto) => {
  const n = (clave) => {
    const m = new RegExp(`^\\u2139 ${clave} (\\d+)$`, 'm').exec(texto);
    return m ? Number(m[1]) : null;
  };
  return { tests: n('tests'), pass: n('pass'), fail: n('fail') };
};

/** Copia limpia del commit en el que estamos (nunca del árbol de trabajo: no se mide sobre pruebas a medio escribir). */
async function prepararBase() {
  if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true });
  mkdirSync(BASE, { recursive: true });
  const r = await ejecutar('/bin/sh', ['-c', 'git archive HEAD | tar -x -C ' + JSON.stringify(BASE)], { cwd: RAIZ });
  if (r.codigo !== 0) throw new Error('git archive falló: ' + r.error);
  const commit = (await ejecutar('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ })).salida.trim();
  const sucio = (await ejecutar('git', ['status', '--porcelain'], { cwd: RAIZ })).salida.trim();
  return { commit, sucio };
}

async function copiaDeTrabajo(n) {
  const dir = join(CASA, `trabajo-${n}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  await ejecutar('/bin/cp', ['-R', BASE, dir]);
  return dir;
}

/** Corre UN archivo de prueba en una copia. */
const correrPrueba = (dir, prueba, tiempoMax) => ejecutar(process.execPath, ['--test', prueba], { cwd: dir, tiempoMax });

export async function medirLineaBase(dir, pruebas) {
  const base = {};
  for (const prueba of pruebas) {
    const r = await correrPrueba(dir, prueba);
    base[prueba] = { codigo: r.codigo, ...cuentas(r.salida) };
  }
  return base;
}

/**
 * Un mutante: se escribe el archivo cambiado, se corren las pruebas que lo alcanzan de una en una y se para
 * en la primera que falle. MUERE solo si alguna salió con código distinto de cero. SOBREVIVE solo si TODAS
 * corrieron con código 0 y contaron exactamente las pruebas de la línea base. Si el conteo no cuadra es
 * ANOMALÍA, no sobreviviente: un error del arnés nunca se cuenta como mutante muerto.
 */
async function probarMutante(dir, mutante, pruebas, lineaBase, textoOriginal, rutaArchivo) {
  const nuevo = textoOriginal.slice(0, mutante.pos) + mutante.nuevo + textoOriginal.slice(mutante.pos + mutante.viejo.length);
  if (nuevo === textoOriginal) return { estado: 'sin-cambio' };
  writeFileSync(rutaArchivo, nuevo);
  try {
    for (const prueba of pruebas) {
      const r = await correrPrueba(dir, prueba);
      if (r.matado) return { estado: 'tiempo-agotado', prueba };
      if (r.codigo !== 0) return { estado: 'muere', prueba };
      const c = cuentas(r.salida);
      const b = lineaBase[prueba];
      if (c.tests !== b.tests || c.pass !== b.pass) {
        return { estado: 'anomalia', prueba, detalle: `contó ${c.tests}/${c.pass} y la línea base es ${b.tests}/${b.pass}` };
      }
    }
    return { estado: 'sobrevive' };
  } finally {
    writeFileSync(rutaArchivo, textoOriginal);
  }
}

// ---------- programa ----------

const args = process.argv.slice(2);
const orden = args[0];
const valor = (bandera, omision) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : omision;
};

if (orden === 'preparar') {
  const { commit, sucio } = await prepararBase();
  const dir = await copiaDeTrabajo('base-prueba');
  const r = await ejecutar(process.execPath, ['--test', 'pruebas/**/*.test.mjs'], { cwd: dir, tiempoMax: 300000 });
  const c = cuentas(r.salida);
  console.log(JSON.stringify({ commit, arbolSucio: sucio || '(limpio)', codigoDeSalida: r.codigo, ...c }, null, 2));
} else if (orden === 'alcance') {
  const mapa = mapaDeAlcance(BASE);
  const archivo = valor('--archivo');
  const pruebas = pruebasQueAlcanzan(mapa, archivo);
  console.log(JSON.stringify({ archivo, cuantas: pruebas.length, pruebas }, null, 2));
} else if (orden === 'contar') {
  const archivo = valor('--archivo');
  const src = readFileSync(join(BASE, archivo), 'utf8');
  const ms = generar(src, archivo);
  const porTipo = {};
  for (const m of ms) porTipo[m.tipo] = (porTipo[m.tipo] ?? 0) + 1;
  console.log(JSON.stringify({ archivo, total: ms.length, porTipo }, null, 2));
} else if (orden === 'correr') {
  const archivo = valor('--archivo');
  const trabajadores = Number(valor('--trabajadores', '4'));
  const salidaJsonl = valor('--salida', join(CASA, `resultados-${archivo.replace(/\W+/g, '_')}.jsonl`));
  const desde = Number(valor('--desde', '0'));
  const hasta = Number(valor('--hasta', '0')) || Infinity;

  const mapa = mapaDeAlcance(BASE);
  const pruebas = pruebasQueAlcanzan(mapa, archivo);
  const src = readFileSync(join(BASE, archivo), 'utf8');
  const todos = generar(src, archivo).slice(desde, hasta);

  const dirs = [];
  for (let n = 0; n < trabajadores; n++) dirs.push(await copiaDeTrabajo(n));
  // línea base de cada archivo de prueba, en la copia 0
  const lineaBase = await medirLineaBase(dirs[0], pruebas);
  const malas = Object.entries(lineaBase).filter(([, v]) => v.codigo !== 0);
  if (malas.length) { console.error('la línea base no está verde: ' + JSON.stringify(malas)); process.exit(2); }
  appendFileSync(salidaJsonl, JSON.stringify({ meta: { archivo, pruebas, total: todos.length, lineaBase } }) + '\n');

  let siguiente = 0;
  let hechos = 0;
  const cuenta = {};
  const trabajar = async (n) => {
    const dir = dirs[n];
    const rutaArchivo = join(dir, archivo);
    const original = readFileSync(rutaArchivo, 'utf8');
    while (true) {
      const i = siguiente++;
      if (i >= todos.length) break;
      const m = todos[i];
      const r = await probarMutante(dir, m, pruebas, lineaBase, original, rutaArchivo);
      cuenta[r.estado] = (cuenta[r.estado] ?? 0) + 1;
      hechos++;
      appendFileSync(salidaJsonl, JSON.stringify({ i: i + desde, ...m, ...r }) + '\n');
      if (hechos % 25 === 0) process.stderr.write(`${hechos}/${todos.length} ${JSON.stringify(cuenta)}\n`);
    }
  };
  await Promise.all(dirs.map((_, n) => trabajar(n)));
  console.log(JSON.stringify({ archivo, total: todos.length, cuenta, salida: salidaJsonl }, null, 2));
} else {
  console.error('órdenes: preparar | alcance --archivo X | contar --archivo X | correr --archivo X [--trabajadores N] [--salida F] [--desde N] [--hasta N]');
  process.exit(1);
}
