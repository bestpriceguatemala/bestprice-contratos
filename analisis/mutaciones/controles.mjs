// Los controles del arnés. Van PRIMERO y van siempre: sin ellos, un número de mutaciones no vale nada.
//   - La tubería: una prueba sembrada que falla tiene que salir con código 1.
//   - Mutantes que NO cambian nada: tienen que SOBREVIVIR (si «mueren», el arnés miente).
//   - Mutantes que rompen algo obvio: tienen que MORIR (si «sobreviven», el arnés no está corriendo las pruebas).

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASA, BASE, exigirBase } from './rutas.mjs';
import { mapaDeAlcance, pruebasQueAlcanzan } from './alcance.mjs';

exigirBase();


const ejecutar = (cmd, args, opciones = {}) => new Promise((resolver) => {
  const p = spawn(cmd, args, { ...opciones, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let salida = ''; let error = ''; let matado = false;
  const reloj = setTimeout(() => { matado = true; try { process.kill(-p.pid, 'SIGKILL'); } catch { /* ya murió */ } }, 180000);
  p.stdout.on('data', (d) => { salida += d; });
  p.stderr.on('data', (d) => { error += d; });
  p.on('close', (codigo) => { clearTimeout(reloj); resolver({ codigo, salida, error, matado }); });
});

const cuentas = (texto) => {
  const n = (clave) => {
    const m = new RegExp(`^\\u2139 ${clave} (\\d+)$`, 'm').exec(texto);
    return m ? Number(m[1]) : null;
  };
  return { tests: n('tests'), pass: n('pass'), fail: n('fail') };
};

const CONTROLES = [
  // ---- no cambian nada: deben SOBREVIVIR ----
  {
    id: 'NOOP-A', espera: 'sobrevive', archivo: 'js/pantallas/dinero.js',
    viejo: "const palabraRentas = (n) => (n === 1 ? 'renta' : 'rentas');",
    nuevo: "const palabraRentas = (n) => (1 === n ? 'renta' : 'rentas');",
    porque: 'comparar al revés da lo mismo',
  },
  {
    id: 'NOOP-B', espera: 'sobrevive', archivo: 'js/pantallas/dinero.js',
    viejo: 'export function armarVista({ contratos, pagos, duenos } = {}) {\n  const problemas = [];',
    nuevo: 'export function armarVista({ contratos, pagos, duenos } = {}) {\n  void 0;\n  const problemas = [];',
    porque: 'una orden que no hace nada',
  },
  {
    id: 'NOOP-C', espera: 'sobrevive', archivo: 'js/pantallas/comisiones.js',
    viejo: 'export function armarVistaDeComisiones(lectura) {',
    nuevo: 'export function armarVistaDeComisiones(lectura) {\n  void 0;',
    porque: 'una orden que no hace nada',
  },
  {
    id: 'NOOP-D', espera: 'sobrevive', archivo: 'js/pantallas/comisiones.js',
    viejo: 'const problemas = [];\n  if (!contratos || contratos.fallo || !Array.isArray(contratos.datos)) problemas.push(\'rentas\');',
    nuevo: 'const problemas = [];\n  if (contratos?.fallo || !contratos || !Array.isArray(contratos.datos)) problemas.push(\'rentas\');',
    porque: 'el mismo juicio escrito en otro orden',
  },
  // ---- rompen algo obvio: deben MORIR ----
  {
    id: 'ROMPE-A', espera: 'muere', archivo: 'js/pantallas/dinero.js',
    viejo: "export const CORREO_DE_DINERO = 'dinero@bestpricegt.com';",
    nuevo: "throw new Error('control ROMPE-A');\nexport const CORREO_DE_DINERO = 'dinero@bestpricegt.com';",
    porque: 'revienta al cargar: prueba que lo que corre es la COPIA',
  },
  {
    id: 'ROMPE-B', espera: 'muere', archivo: 'js/pantallas/comisiones.js',
    viejo: "export const RUTA_DE_COMISIONES = '#/dinero/comisiones';",
    nuevo: "throw new Error('control ROMPE-B');\nexport const RUTA_DE_COMISIONES = '#/dinero/comisiones';",
    porque: 'revienta al cargar',
  },
  {
    id: 'ROMPE-C', espera: 'muere', archivo: 'js/pantallas/dinero.js',
    viejo: '  if (problemas.length) return { ok: false, problemas };',
    nuevo: '  if (problemas.length) return { ok: true, problemas };',
    porque: 'una lectura caída dibujada como buena noticia',
  },
  {
    id: 'ROMPE-D', espera: 'muere', archivo: 'js/pantallas/comisiones.js',
    viejo: '  if (problemas.length) return { ok: false, problemas };',
    nuevo: '  if (problemas.length) return { ok: true, problemas };',
    porque: 'una lectura caída dibujada como buena noticia',
  },
];

const dir = join(CASA, 'trabajo-controles');
if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
await ejecutar('/bin/cp', ['-R', BASE, dir]);

const mapa = mapaDeAlcance(BASE);
const informe = [];

// Control 0: la tubería. Una prueba sembrada que falla DEBE salir con código 1.
{
  const ruta = join(dir, 'pruebas/control-sembrado.test.mjs');
  writeFileSync(ruta, "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('control sembrado', () => { assert.equal(1, 2); });\n");
  const r = await ejecutar(process.execPath, ['--test', 'pruebas/control-sembrado.test.mjs'], { cwd: dir });
  rmSync(ruta);
  informe.push({ id: 'TUBERIA', espera: 'codigo 1', obtuvo: `codigo ${r.codigo}`, bien: r.codigo === 1, ...cuentas(r.salida) });
}

for (const c of CONTROLES) {
  const pruebas = pruebasQueAlcanzan(mapa, c.archivo);
  const ruta = join(dir, c.archivo);
  const original = readFileSync(ruta, 'utf8');
  if (!original.includes(c.viejo)) {
    informe.push({ id: c.id, espera: c.espera, obtuvo: 'NO SE ENCONTRÓ EL TEXTO', bien: false });
    continue;
  }
  writeFileSync(ruta, original.replace(c.viejo, c.nuevo));
  let estado = 'sobrevive'; let donde = null; let detalle = null;
  // línea base de cada prueba, medida en esta misma copia, sin el mutante
  try {
    for (const prueba of pruebas) {
      const r = await ejecutar(process.execPath, ['--test', prueba], { cwd: dir });
      if (r.matado) { estado = 'tiempo-agotado'; donde = prueba; break; }
      if (r.codigo !== 0) { estado = 'muere'; donde = prueba; detalle = `fail ${cuentas(r.salida).fail}`; break; }
    }
  } finally {
    writeFileSync(ruta, original);
  }
  informe.push({ id: c.id, espera: c.espera, obtuvo: estado, bien: estado === c.espera, prueba: donde, detalle, porque: c.porque, cuantasPruebas: pruebas.length });
}

console.log(JSON.stringify(informe, null, 2));
appendFileSync(join(CASA, 'controles.json'), JSON.stringify({ cuando: new Date().toISOString(), informe }, null, 2) + '\n');
const mal = informe.filter((x) => !x.bien);
console.log(mal.length ? `\n*** ${mal.length} CONTROL(ES) MAL: ${mal.map((x) => x.id).join(', ')} ***` : '\nLos controles pasan: el arnés mide algo.');
