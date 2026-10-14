// Pruebas de la pantalla de empleados (js/pantallas/empleados.js): la lista, la ficha y el recorrido de guardar, sin
// navegador. Es la hermana de lo que pruebas/dinero.test.mjs hace con la pantalla de dueños; el cableado del DOM se comprobó
// a mano en el navegador (ver el informe de esta tarea).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlListaDeEmpleados, htmlFormularioDeEmpleado, leerCamposDeEmpleado, guardarFichaDeEmpleado, mensajeDeFalloAlGuardar,
  textoDelPorcentaje, MENSAJE_FALLO_LISTA, MENSAJE_SIN_LISTA_PARA_GUARDAR, MENSAJE_FALLO_GUARDAR,
} from '../js/pantallas/empleados.js';
import { altaConIdFijo, MENSAJE_EMPLEADO_SIN_DINERO } from '../js/datos.js';
import { EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { ana, wilder, luis } = EMPLEADOS;
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// La lista
// ---------------------------------------------------------------------------

test('la lista: código, nombre, porcentaje y el enlace a lo que se le debe, ordenada por código como número', () => {
  const html = htmlListaDeEmpleados([luis, wilder, ana]);
  const filas = [...html.matchAll(/<tr data-id="(e\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(filas, ['e1', 'e6', 'e16'], 'el 6 antes que el 16');
  assert.match(texto(html), /1 Ana López 5 % Ver comisiones/);
  assert.match(texto(html), /16 Luis Mérida 7\.5 % Ver comisiones/);
  assert.match(html, /href="#\/dinero\/comisiones\/id%3Ae6"/);
  assert.match(html, /href="#\/dinero\/empleados\/e1"/);
  assert.match(html, /href="#\/dinero\/empleados\/nuevo"/);
  assert.match(html, /id="em-buscar"/);
});

test('Wilder se ve con su 0 % y «No gana comisión»; un empleado de baja sale apagado y marcado', () => {
  const html = htmlListaDeEmpleados([wilder, { ...ana, activo: false }]);
  const w = html.slice(html.indexOf('data-id="e6"'), html.indexOf('</tr>', html.indexOf('data-id="e6"')));
  assert.match(texto(w), /Wilder 0 % No gana comisión/);
  const a = html.slice(html.lastIndexOf('<tr', html.indexOf('data-id="e1"')), html.indexOf('</tr>', html.indexOf('data-id="e1"')));
  assert.match(a, /class="es-fuera"/);
  assert.match(a, /De baja/);
});

test('una lista que de verdad está vacía invita a agregar el primero', () => {
  const html = htmlListaDeEmpleados([]);
  assert.match(texto(html), /Todavía no hay empleados/);
  assert.match(html, /Agregar el primero/);
  assert.doesNotMatch(html, /barra-lectura-fallida/);
  assert.doesNotMatch(html, /id="em-buscar"/, 'sin empleados no hay qué buscar');
});

test('una lectura FALLIDA no dice «no hay empleados» ni invita a agregar el primero: no se sabe, y repetiría un código', () => {
  const html = htmlListaDeEmpleados([], { fallo: true });
  assert.match(html, /barra-lectura-fallida/);
  assert.match(texto(html), new RegExp(MENSAJE_FALLO_LISTA.slice(0, 40)));
  assert.doesNotMatch(texto(html), /Todavía no hay empleados/);
  assert.doesNotMatch(html, /Agregar el primero/);
  assert.match(html, /data-em="reintentar"/, 'y se puede volver a leer');
});

test('un nombre con símbolos se escapa en la lista', () => {
  const html = htmlListaDeEmpleados([{ ...ana, nombre: 'Ana <i>&</i>' }]);
  assert.doesNotMatch(html, /<i>/);
  assert.match(html, /Ana &lt;i&gt;&amp;&lt;\/i&gt;/);
});

test('textoDelPorcentaje: el 0 es «0 %»; lo que no se lee, «—»', () => {
  assert.equal(textoDelPorcentaje(0), '0 %');
  assert.equal(textoDelPorcentaje(5), '5 %');
  assert.equal(textoDelPorcentaje(''), '—');
  assert.equal(textoDelPorcentaje(undefined), '—');
});

// ---------------------------------------------------------------------------
// La ficha
// ---------------------------------------------------------------------------

test('un empleado NUEVO arranca con el siguiente código libre y el 5 % de siempre, activo', () => {
  const html = htmlFormularioDeEmpleado(null, { esNuevo: true, lista: [ana, wilder, luis] });
  assert.match(html, /id="ef-codigo" value="17"/);
  assert.match(html, /id="ef-porcentajeComision"[^>]*value="5"/);
  assert.match(html, /id="ef-activo" checked/);
  assert.match(texto(html), /Nuevo empleado/);
  assert.match(texto(html), /Si no gana comisión, escribe 0\./);
  assert.doesNotMatch(html, /Ver lo que se le debe/, 'uno nuevo todavía no tiene cuenta');
});

test('la ficha de Wilder trae su 0 como 0 (no vacío), y explica que cambiar el porcentaje no mueve lo ya ganado', () => {
  const html = htmlFormularioDeEmpleado(wilder, { esNuevo: false, lista: [wilder] });
  assert.match(html, /id="ef-porcentajeComision"[^>]*value="0"/);
  assert.match(html, /id="ef-codigo" value="6"/);
  assert.match(texto(html), /Cambiarlo no mueve lo que ya ganó: cada renta guarda el porcentaje del día que se hizo/);
  assert.match(html, /href="#\/dinero\/comisiones\/id%3Ae6"/);
});

test('el porcentaje es un campo numérico de 0 a 100 con centavos, y «Trabaja aquí» una casilla (la baja)', () => {
  const html = htmlFormularioDeEmpleado(ana, { esNuevo: false, lista: [ana] });
  assert.match(html, /<input type="number" id="ef-porcentajeComision" min="0" max="100" step="0\.01"/);
  assert.match(html, /<input type="checkbox" id="ef-activo" checked>/);
  assert.doesNotMatch(htmlFormularioDeEmpleado({ ...ana, activo: false }, { esNuevo: false, lista: [ana] }), /id="ef-activo" checked/);
  assert.match(html, /class="carro-campo dn-casilla"/);
});

test('el formulario se dibuja desde CAMPOS_EMPLEADO: cada campo de la ficha tiene su input con id ef-<campo>', () => {
  const html = htmlFormularioDeEmpleado(ana, { esNuevo: false, lista: [ana] });
  for (const id of ['codigo', 'nombre', 'porcentajeComision', 'activo']) assert.match(html, new RegExp(`id="ef-${id}"`));
});

test('el nombre del empleado se escapa en el campo (una comilla no rompe el formulario)', () => {
  const html = htmlFormularioDeEmpleado({ ...ana, nombre: 'Ana "la" <b>' }, { esNuevo: false, lista: [] });
  assert.match(html, /value="Ana &quot;la&quot; &lt;b&gt;"/);
});

// leerCamposDeEmpleado: los campos de mentira con la forma de lo que se lee de verdad.
const camposDeMentira = (valores) => (id) => {
  const v = valores[id.replace(/^ef-/, '')];
  if (v === undefined) return undefined;
  return typeof v === 'boolean' ? { checked: v, value: '' } : { value: String(v), checked: false };
};

test('leerCamposDeEmpleado recorre CAMPOS_EMPLEADO: texto recortado, y la casilla como booleano', () => {
  const campos = leerCamposDeEmpleado(camposDeMentira({
    codigo: ' 6 ', nombre: '  Wilder ', porcentajeComision: '0', activo: true,
  }));
  assert.deepEqual(campos, { codigo: '6', nombre: 'Wilder', porcentajeComision: '0', activo: true });
  assert.strictEqual(leerCamposDeEmpleado(camposDeMentira({ activo: false })).activo, false);
});

// ---------------------------------------------------------------------------
// Guardar la ficha
// ---------------------------------------------------------------------------

function altaDePrueba() {
  let n = 0;
  const pedidos = [];
  return {
    pedidos,
    alta: altaConIdFijo(async () => { n += 1; pedidos.push(n); return `e-nuevo-${n}`; }),
  };
}

const camposDeWilder = { codigo: '6', nombre: 'Wilder', porcentajeComision: '0', activo: true };

test('guardar un empleado nuevo: arma la ficha, le da su id una vez, guarda y suelta el id', async () => {
  const { alta, pedidos } = altaDePrueba();
  const guardados = [];
  const r = await guardarFichaDeEmpleado({
    existente: null, campos: camposDeWilder, lista: [ana], alta, guardar: async (e) => { guardados.push(e); return e; },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(guardados[0], {
    codigo: '6', nombre: 'Wilder', porcentajeComision: 0, activo: true, id: 'e-nuevo-1',
  });
  assert.strictEqual(guardados[0].porcentajeComision, 0, 'el cero escrito se guarda como número 0');
  // Terminó bien: la siguiente alta es otra y tendrá otro id.
  await guardarFichaDeEmpleado({ existente: null, campos: { ...camposDeWilder, codigo: '7' }, lista: [ana], alta, guardar: async (e) => e });
  assert.deepEqual(pedidos, [1, 2]);
});

test('un reintento tras un guardado que falló cae en el MISMO empleado: el id no se suelta hasta que sale bien', async () => {
  const { alta, pedidos } = altaDePrueba();
  const intento = (guardar) => guardarFichaDeEmpleado({ existente: null, campos: camposDeWilder, lista: [], alta, guardar });
  await assert.rejects(intento(async () => { throw new Error('sin internet'); }), /sin internet/);
  const guardados = [];
  await intento(async (e) => { guardados.push(e); return e; });
  assert.equal(guardados[0].id, 'e-nuevo-1');
  assert.deepEqual(pedidos, [1], 'se pidió un solo id');
});

test('editar un empleado conserva lo que la ficha no muestra y su id, y no pide otro', async () => {
  const { alta, pedidos } = altaDePrueba();
  const existente = { ...ana, telefono: '5555', actualizado: 99 };
  const guardados = [];
  const r = await guardarFichaDeEmpleado({
    existente, campos: { codigo: '1', nombre: 'Ana López', porcentajeComision: '6', activo: true }, lista: [existente], alta,
    guardar: async (e) => { guardados.push(e); return e; },
  });
  assert.equal(r.ok, true);
  assert.equal(guardados[0].id, 'e1');
  assert.equal(guardados[0].telefono, '5555');
  assert.equal(guardados[0].porcentajeComision, 6);
  assert.deepEqual(pedidos, []);
});

test('darle de baja a alguien no lo borra: activo pasa a false y su código sigue siendo suyo', async () => {
  const { alta } = altaDePrueba();
  const guardados = [];
  await guardarFichaDeEmpleado({
    existente: ana, campos: { codigo: '1', nombre: 'Ana López', porcentajeComision: '5', activo: false }, lista: [ana, wilder], alta,
    guardar: async (e) => { guardados.push(e); return e; },
  });
  assert.strictEqual(guardados[0].activo, false);
  assert.equal(guardados[0].codigo, '1');
});

test('un código repetido no se guarda y dice de quién es; uno de baja también cuenta', async () => {
  const { alta } = altaDePrueba();
  const guardados = [];
  const guardar = async (e) => { guardados.push(e); return e; };
  const r = await guardarFichaDeEmpleado({ existente: null, campos: { ...camposDeWilder, nombre: 'Otro Wilder' }, lista: [wilder], alta, guardar });
  assert.equal(r.ok, false);
  assert.match(r.problemas[0], /El código 6 ya es de Wilder/);
  const baja = await guardarFichaDeEmpleado({ existente: null, campos: { ...camposDeWilder, codigo: '1' }, lista: [{ ...ana, activo: false }], alta, guardar });
  assert.equal(baja.ok, false);
  assert.equal(guardados.length, 0);
});

test('sin nombre, sin código o sin porcentaje no se guarda; el 0 sí', async () => {
  const { alta } = altaDePrueba();
  const guardar = async (e) => e;
  for (const mal of [{ nombre: '' }, { codigo: '' }, { porcentajeComision: '' }, { porcentajeComision: '105' }, { porcentajeComision: '-1' }]) {
    const r = await guardarFichaDeEmpleado({ existente: null, campos: { ...camposDeWilder, ...mal }, lista: [], alta, guardar });
    assert.equal(r.ok, false, JSON.stringify(mal));
    assert.ok(r.problemas.length >= 1);
  }
  assert.equal((await guardarFichaDeEmpleado({ existente: null, campos: camposDeWilder, lista: [], alta, guardar })).ok, true);
});

test('con la lista sin leer NO se guarda: no se puede comprobar que el código no se repita', async () => {
  const { alta, pedidos } = altaDePrueba();
  let llamadas = 0;
  const r = await guardarFichaDeEmpleado({
    existente: null, campos: camposDeWilder, lista: [], fallo: true, alta, guardar: async (e) => { llamadas += 1; return e; },
  });
  assert.deepEqual([r.ok, r.problemas], [false, [MENSAJE_SIN_LISTA_PARA_GUARDAR]]);
  assert.equal(llamadas, 0);
  assert.deepEqual(pedidos, [], 'ni siquiera se gastó un id');
});

test('mensajeDeFalloAlGuardar: la frase nuestra de «entra al área de dinero» pasa; lo de Firebase no', () => {
  assert.equal(mensajeDeFalloAlGuardar(new Error(MENSAJE_EMPLEADO_SIN_DINERO)), MENSAJE_EMPLEADO_SIN_DINERO);
  assert.equal(mensajeDeFalloAlGuardar(new Error('Missing or insufficient permissions.')), MENSAJE_FALLO_GUARDAR);
  assert.equal(mensajeDeFalloAlGuardar(undefined), MENSAJE_FALLO_GUARDAR);
});

// ---------------------------------------------------------------------------
// El cableado
// ---------------------------------------------------------------------------

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PANTALLA = sinComentarios(readFileSync(new URL('../js/pantallas/empleados.js', import.meta.url), 'utf8'));

test('la pantalla guarda con guardarEmpleado (la credencial de dinero) y nunca con guardarDueno ni guardarLocal', () => {
  assert.match(PANTALLA, /guardar = guardarEmpleado/);
  assert.ok(!/guardarDueno|guardarLocal|guardarCliente/.test(PANTALLA));
});

test('una lectura que lanza es un fallo, nunca «no hay empleados»: la pantalla trata lo que no es lista como fallo', () => {
  assert.match(PANTALLA, /leida = \{ datos: null, fallo: true \}/);
  assert.match(PANTALLA, /const fallo = Boolean\(leida\.fallo\) \|\| !Array\.isArray\(leida\.datos\)/);
});

test('las dos pantallas se enlazan entre sí: de la lista de empleados a sus cuentas, y de la cuenta a su ficha', () => {
  const html = htmlListaDeEmpleados([ana]);
  assert.match(html, /Ver comisiones/);
  const comisiones = readFileSync(new URL('../js/pantallas/comisiones.js', import.meta.url), 'utf8');
  assert.match(comisiones, /href="#\/dinero\/empleados\/\$\{esc\(registro\.id\)\}">Editar empleado/);
});
