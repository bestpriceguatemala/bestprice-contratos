// Barrido aparte: ¿se puede VACIAR un mensaje que lee el dueño sin que ninguna prueba se ponga roja?
// Un mensaje vacío no es un detalle: es una barra roja sin texto adentro, o un aviso que no dice nada.
// Se vacía uno a la vez en una copia y se corren TODAS las pruebas que alcanzan su archivo.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CASA, BASE, exigirBase } from './rutas.mjs';
import { mapaDeAlcance, pruebasQueAlcanzan } from './alcance.mjs';

exigirBase();

const SALIDA = join(CASA, 'res-mensajes.jsonl');

const ejecutar = (cmd, args, opciones = {}) => new Promise((resolver) => {
  const p = spawn(cmd, args, { ...opciones, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let salida = ''; let matado = false;
  const reloj = setTimeout(() => { matado = true; try { process.kill(-p.pid, 'SIGKILL'); } catch { /* ya murió */ } }, 180000);
  p.stdout.on('data', (d) => { salida += d; });
  p.stderr.on('data', () => {});
  p.on('close', (codigo) => { clearTimeout(reloj); resolver({ codigo, salida, matado }); });
});

const archivosJs = (dir, fuera = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivosJs(p, fuera);
    else if (e.endsWith('.js')) fuera.push(p);
  }
  return fuera;
};

// Los mensajes: `export const NOMBRE = '...'` (una sola línea) en js/
const mensajes = [];
for (const ruta of archivosJs(join(BASE, 'js'))) {
  const src = readFileSync(ruta, 'utf8');
  const re = /^export const ((?:MENSAJE|TEXTO|AVISO|FRASE)[A-Z_0-9]*) = ('(?:[^'\\\n]|\\.)*');$/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    mensajes.push({ archivo: relative(BASE, ruta), nombre: m[1], viejo: m[0], nuevo: `export const ${m[1]} = '';` });
  }
}

const mapa = mapaDeAlcance(BASE);
const trabajadores = Number(process.argv[2] ?? 2);
const dirs = [];
for (let n = 0; n < trabajadores; n++) {
  const dir = join(CASA, `trabajo-msj-${n}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  await ejecutar('/bin/cp', ['-R', BASE, dir]);
  dirs.push(dir);
}

let siguiente = 0;
const cuenta = { muere: 0, sobrevive: 0 };
const trabajar = async (dir) => {
  while (true) {
    const i = siguiente++;
    if (i >= mensajes.length) break;
    const m = mensajes[i];
    const ruta = join(dir, m.archivo);
    const original = readFileSync(ruta, 'utf8');
    const pruebas = pruebasQueAlcanzan(mapa, m.archivo);
    writeFileSync(ruta, original.replace(m.viejo, m.nuevo));
    let estado = 'sobrevive'; let donde = null;
    try {
      for (const prueba of pruebas) {
        const r = await ejecutar(process.execPath, ['--test', prueba], { cwd: dir });
        if (r.codigo !== 0) { estado = 'muere'; donde = prueba; break; }
      }
    } finally {
      writeFileSync(ruta, original);
    }
    cuenta[estado]++;
    appendFileSync(SALIDA, JSON.stringify({ ...m, viejo: undefined, estado, prueba: donde, cuantasPruebas: pruebas.length }) + '\n');
    process.stderr.write(`${i + 1}/${mensajes.length} ${m.nombre} -> ${estado}\n`);
  }
};
await Promise.all(dirs.map(trabajar));
console.log(JSON.stringify({ total: mensajes.length, ...cuenta }, null, 2));
