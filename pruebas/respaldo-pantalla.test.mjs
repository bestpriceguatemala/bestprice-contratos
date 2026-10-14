// La pantalla del respaldo y el aviso al entrar.
//
// Lo que se vigila: que la advertencia de privacidad esté DONDE se baja el archivo (antes del botón y otra vez en el
// «Listo»), que la fecha del respaldo se anote DESPUÉS de entregar el archivo y nunca si algo falló, y que el aviso de
// «pasó un año» salga cuando debe, calle cuando no se pudo leer y no se duplique.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlDeLaPantalla, htmlDelRecordatorio, textoDelEstadoDelAnio, crearElRespaldo, mostrarElRecordatorioDeRespaldo,
  olvidarElDescarteDelRecordatorio, AVISO_DE_PRIVACIDAD, RUTA_DEL_RESPALDO,
} from '../js/pantallas/respaldo.js';
import { estadoDeLosAnios } from '../js/nucleo/respaldo.js';
import { NO_SE_RESPALDA, ErrorDeRespaldo } from '../js/respaldo/mapa.js';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const anios = (porAnio, hoy) => estadoDeLosAnios(porAnio, hoy).filter((a) => a.ofrecer);

// ---------------------------------------------------------------------------
// La advertencia de privacidad (§10): «Se le advierte al dueño que ese archivo lleva DPI, licencias y teléfonos»
// ---------------------------------------------------------------------------

test('la advertencia dice lo que el archivo lleva —DPI, licencia, teléfono— y que se cuide como el Excel de hoy', () => {
  const texto = `${AVISO_DE_PRIVACIDAD.titulo} ${AVISO_DE_PRIVACIDAD.texto}`;
  assert.match(texto, /DPI/);
  assert.match(texto, /licencia/);
  assert.match(texto, /teléfono/);
  assert.match(texto, /mismo cuidado que el Excel/);
  assert.match(texto, /WhatsApp/);
});

test('la advertencia está en la pantalla ANTES de cualquier botón de descarga, no escondida debajo', () => {
  const html = htmlDeLaPantalla({ anios: anios({}, '2026-10-14'), anioMaximo: 2026 });
  const lugarDeLaAdvertencia = html.indexOf('rs-cuidado');
  assert.ok(lugarDeLaAdvertencia > 0);
  assert.ok(html.includes(AVISO_DE_PRIVACIDAD.titulo));
  assert.ok(lugarDeLaAdvertencia < html.indexOf('data-bajar='), 'antes del primer botón «Bajar»');
  assert.ok(lugarDeLaAdvertencia < html.indexOf('<form'), 'antes del botón de «Otro año»');
});

test('la advertencia se dibuja siempre: cargando, armando, con error y con resultado', () => {
  const resultado = {
    nombre: 'Best Price 2026.xlsx', cuenta: { clientes: 1, vehiculos: 1, contratos: 1 }, avisos: [], anotado: true,
  };
  for (const ui of [{ cargando: true }, { trabajando: 2026 }, { error: 'algo' }, { resultado }]) {
    assert.ok(htmlDeLaPantalla({ anios: anios({}, '2026-10-14'), ...ui }).includes(AVISO_DE_PRIVACIDAD.texto.slice(0, 40)), JSON.stringify(Object.keys(ui)));
  }
});

test('el «Listo» recuerda otra vez, en el momento de haber bajado el archivo, que lleva DPI, licencias y teléfonos', () => {
  const html = htmlDeLaPantalla({
    anios: [],
    resultado: {
      nombre: 'Best Price 2026.xlsx', cuenta: { clientes: 4, vehiculos: 3, contratos: 8 }, avisos: [], anotado: true,
    },
  });
  assert.match(html, /Listo: Best Price 2026\.xlsx/);
  assert.match(html, /Lleva 4 clientes, 3 carros y 8 contratos/);
  assert.match(html, /Recuerda:.*DPI, la licencia y el teléfono/);
  assert.match(html, /Vista protegida/, 'y que Excel puede abrirlo en Vista protegida');
});

// ---------------------------------------------------------------------------
// Lo demás que dice la pantalla
// ---------------------------------------------------------------------------

test('un botón por año, con el nombre del archivo que baja (§10: Best Price 2026.xlsx)', () => {
  const html = htmlDeLaPantalla({ anios: anios({}, '2026-10-14'), anioMaximo: 2026 });
  assert.match(html, /data-bajar="2026"[^>]*>Bajar Best Price 2026\.xlsx</);
  assert.doesNotMatch(html, /data-bajar="2025"/, 'en octubre de 2026 no se ofrece un 2025');
  const enero = htmlDeLaPantalla({ anios: anios({ 2026: '2026-10-14' }, '2027-01-20'), anioMaximo: 2027 });
  assert.match(enero, /data-bajar="2027"/);
  assert.match(enero, /data-bajar="2026"/);
  assert.match(enero, /no lleva las rentas de después/);
});

test('mientras se arma, todos los botones se apagan (un doble clic no arma dos archivos) y el del año dice que está armando', () => {
  const html = htmlDeLaPantalla({ anios: anios({ 2026: '2026-10-14' }, '2027-01-20'), trabajando: 2027, anioMaximo: 2027 });
  assert.equal((html.match(/data-bajar="\d+" disabled/g) ?? []).length, 2);
  assert.match(html, /Armando el archivo…/);
  assert.match(html, /<input[^>]*id="rs-otro-anio"[^>]* disabled/);
});

test('lo que se sabe de cada año, en frases', () => {
  const [actual, anterior] = estadoDeLosAnios({ 2026: '2026-10-14' }, '2027-01-20');
  assert.match(textoDelEstadoDelAnio(actual), /Todavía no has bajado el respaldo de este año/);
  assert.match(textoDelEstadoDelAnio(anterior), /Lo bajaste el 14 oct 2026, antes de que terminara el año/);
  const [, cerrado] = estadoDeLosAnios({ 2026: '2027-01-05' }, '2027-02-01');
  assert.match(textoDelEstadoDelAnio(cerrado), /Completo: lo bajaste el 5 ene 2027/);
});

test('lo que el archivo NO lleva está a la vista, con cada punto de la lista', () => {
  const html = htmlDeLaPantalla({ anios: anios({}, '2026-10-14') });
  assert.match(html, /Lo que este archivo NO lleva/);
  for (const punto of NO_SE_RESPALDA) assert.ok(html.includes(punto.replace(/&/g, '&amp;')), punto);
  assert.match(html, /reservaciones/);
  assert.match(html, /COMENTARIOS/);
});

test('un error y los avisos del archivo se dibujan, y el texto de los clientes entra ESCAPADO (un nombre con «<» no rompe ni ejecuta nada)', () => {
  const html = htmlDeLaPantalla({
    anios: [],
    error: 'No se pudo <b>leer</b>',
    resultado: {
      nombre: 'Best Price 2026.xlsx', cuenta: { clientes: 1, vehiculos: 0, contratos: 1 }, avisos: ['Contrato 5: su cliente (<img src=x onerror=alert(1)>) no entró'], anotado: true,
    },
  });
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>leer/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('si no se pudo anotar la fecha, el «Listo» lo dice (el aviso puede volver a salir)', () => {
  const html = htmlDeLaPantalla({
    anios: [], resultado: { nombre: 'x.xlsx', cuenta: { clientes: 0, vehiculos: 0, contratos: 0 }, avisos: [], anotado: false },
  });
  assert.match(html, /no se pudo anotar la fecha/);
});

test('si no se pudo leer cuándo fue el último respaldo, se dice y se deja bajar igual', () => {
  const html = htmlDeLaPantalla({ anios: anios({}, '2026-10-14'), registroFallo: true });
  assert.match(html, /No se pudo ver cuándo bajaste el último respaldo/);
  assert.match(html, /data-bajar="2026"/);
});

// ---------------------------------------------------------------------------
// Armar y entregar: el orden
// ---------------------------------------------------------------------------

function llamadas(sobrescribir = {}) {
  const orden = [];
  return {
    orden,
    deps: {
      anio: 2026,
      hoy: '2026-10-14',
      leer: async (anio) => { orden.push(`leer ${anio}`); return { clientes: [], vehiculos: [], contratos: [], pagosDueno: [] }; },
      cargarPlantilla: async () => { orden.push('plantilla'); return new Uint8Array([1]); },
      armar: async ({ anio, hoy }) => { orden.push(`armar ${anio} ${hoy}`); return { bytes: new Uint8Array([2]), avisos: ['uno'], cuenta: { clientes: 1, vehiculos: 2, contratos: 3 } }; },
      entregar: (bytes, nombre) => { orden.push(`entregar ${nombre}`); },
      anotar: async (anio, hoy) => { orden.push(`anotar ${anio} ${hoy}`); },
      ...sobrescribir,
    },
  };
}

test('lee, arma, entrega y anota la fecha DESPUÉS, con el nombre del §10', async () => {
  const { orden, deps } = llamadas();
  const r = await crearElRespaldo(deps);
  assert.deepEqual(orden, ['leer 2026', 'plantilla', 'armar 2026 2026-10-14', 'entregar Best Price 2026.xlsx', 'anotar 2026 2026-10-14']);
  assert.deepEqual(r, { nombre: 'Best Price 2026.xlsx', cuenta: { clientes: 1, vehiculos: 2, contratos: 3 }, avisos: ['uno'], anotado: true });
});

test('si falta un dato (la nube falló) NO se entrega nada y NO se anota nada: el aviso del año sigue', async () => {
  const { orden, deps } = llamadas({ leer: async () => { throw new ErrorDeRespaldo('No se pudo leer todo de la nube.'); } });
  await assert.rejects(() => crearElRespaldo(deps), /nube/);
  assert.deepEqual(orden, []);
});

test('si el armado se niega (no cabe, la plantilla cambió) NO se entrega ni se anota', async () => {
  const { orden, deps } = llamadas({ armar: async () => { throw new ErrorDeRespaldo('En 2026 hay 1001 contratos'); } });
  await assert.rejects(() => crearElRespaldo(deps), /1001/);
  assert.ok(!orden.some((o) => o.startsWith('entregar') || o.startsWith('anotar')));
});

test('si la entrega falla NO se anota: anotar un respaldo que no salió callaría el aviso un año', async () => {
  const { orden, deps } = llamadas({ entregar: () => { throw new Error('el navegador bloqueó la descarga'); } });
  await assert.rejects(() => crearElRespaldo(deps), /bloqueó/);
  assert.ok(!orden.some((o) => o.startsWith('anotar')));
});

test('si la anotación falla, el archivo YA salió: se dice, no se tira el respaldo', async () => {
  const { deps } = llamadas({ anotar: async () => { throw new Error('sin internet'); } });
  const r = await crearElRespaldo(deps);
  assert.equal(r.anotado, false);
  assert.equal(r.nombre, 'Best Price 2026.xlsx');
});

// ---------------------------------------------------------------------------
// El aviso al entrar
// ---------------------------------------------------------------------------

/** Un documento de mentira con lo justo: #app, #pantalla, crear un div, insertarlo, buscar sus dos botones. */
function documentoFalso() {
  const porId = new Map();
  const elemento = (etiqueta) => {
    const el = {
      etiqueta, id: '', className: '', atributos: {}, hijos: [], escuchas: {}, quitado: false, _html: '',
      setAttribute(k, v) { this.atributos[k] = v; },
      remove() {
        this.quitado = true;
        if (this.id && porId.get(this.id) === this) porId.delete(this.id);
        this.padre?.hijos.splice(this.padre.hijos.indexOf(this), 1);
      },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = v; },
      querySelector(selector) {
        if (!this._html.includes(selector.slice(1, -1))) return null;
        this.escuchas[selector] ??= {};
        const alvo = this.escuchas[selector];
        return { addEventListener: (ev, fn) => { alvo[ev] = fn; } };
      },
    };
    return el;
  };
  const app = elemento('div');
  app.id = 'app';
  const pantalla = elemento('main');
  pantalla.id = 'pantalla';
  app.insertBefore = (nuevo, antes) => {
    app.hijos.splice(app.hijos.indexOf(antes), 0, nuevo);
    nuevo.padre = app;
    porId.set(nuevo.id, nuevo);
  };
  app.hijos.push(pantalla);
  porId.set('app', app);
  porId.set('pantalla', pantalla);
  return {
    app,
    getElementById: (id) => porId.get(id) ?? null,
    createElement: (etiqueta) => elemento(etiqueta),
    banners: () => app.hijos.filter((h) => h.id === 'rs-recordatorio'),
  };
}

const registro = (porAnio, fallo = false) => async () => ({ porAnio, fallo });

test('al entrar, pasado un año desde el último respaldo, pone el aviso ANTES de la pantalla, con el botón que lleva al respaldo', async () => {
  olvidarElDescarteDelRecordatorio();
  const doc = documentoFalso();
  assert.equal(await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: doc }), true);
  assert.equal(doc.banners().length, 1);
  assert.equal(doc.app.hijos.indexOf(doc.banners()[0]), 0, 'arriba de #pantalla');
  assert.match(doc.banners()[0].innerHTML, /Hace más de un año que no bajas el respaldo.*14 oct 2026/);
  assert.ok(doc.banners()[0].innerHTML.includes(`href="${RUTA_DEL_RESPALDO}"`));
});

test('un día antes de cumplirse el año NO sale; el mismo día que se cumple, sí', async () => {
  olvidarElDescarteDelRecordatorio();
  const antes = documentoFalso();
  assert.equal(await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-13', leer: registro({ 2026: '2026-10-14' }), documento: antes }), false);
  assert.equal(antes.banners().length, 0);
  const justo = documentoFalso();
  assert.equal(await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: justo }), true);
});

test('si nunca se bajó un respaldo, el aviso lo dice con esas palabras', async () => {
  olvidarElDescarteDelRecordatorio();
  const doc = documentoFalso();
  await mostrarElRecordatorioDeRespaldo({ hoy: '2026-10-14', leer: registro({}), documento: doc });
  assert.match(doc.banners()[0].innerHTML, /Todavía no has bajado ningún respaldo/);
});

test('si no se pudo LEER cuándo fue el último, no avisa nada: no se sabe, y un aviso falso se aprende a ignorar', async () => {
  olvidarElDescarteDelRecordatorio();
  const doc = documentoFalso();
  assert.equal(await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({}, true), documento: doc }), false);
  assert.equal(doc.banners().length, 0);
});

test('entrar dos veces no duplica el aviso, y si el respaldo ya está al día lo quita', async () => {
  olvidarElDescarteDelRecordatorio();
  const doc = documentoFalso();
  await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: doc });
  await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: doc });
  assert.equal(doc.banners().length, 1);
  await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14', 2027: '2027-10-14' }), documento: doc });
  assert.equal(doc.banners().length, 0);
});

test('«Ahora no» lo quita y no vuelve a salir hasta recargar la página', async () => {
  olvidarElDescarteDelRecordatorio();
  const doc = documentoFalso();
  await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: doc });
  doc.banners()[0].escuchas['[data-respaldo-despues]'].click();
  assert.equal(doc.banners().length, 0);
  assert.equal(await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: doc }), false);
  olvidarElDescarteDelRecordatorio();
});

test('el texto del aviso: la fecha del último respaldo se escribe como la lee el dueño', () => {
  assert.match(htmlDelRecordatorio({ ultimo: '2026-10-14' }), /el último fue el 14 oct 2026/);
  assert.match(htmlDelRecordatorio({ ultimo: null }), /Todavía no has bajado ningún respaldo/);
});

// ---------------------------------------------------------------------------
// El cableado: lo que ninguna otra prueba ve
// ---------------------------------------------------------------------------

test('app.js: la ruta del respaldo pasa por la puerta de la contraseña de dinero y el aviso se pide al entrar, sin esperar y sin estorbar', () => {
  const app = sinComentarios(leer('../js/app.js'));
  assert.match(app, /registrarPantalla\('#\/dinero\/respaldo', conPuertaDeDinero\(pintarRespaldo\)\);/);
  assert.match(app, /import \{ pintarRespaldo, mostrarElRecordatorioDeRespaldo \} from '\.\/pantallas\/respaldo\.js';/);
  const cascaron = app.slice(app.indexOf('function verCascaron()'), app.indexOf('forma.addEventListener'));
  assert.match(cascaron, /mostrarElRecordatorioDeRespaldo\(\)\.catch\(/);
  assert.ok(!/await mostrarElRecordatorioDeRespaldo/.test(cascaron));
});

test('index.html: hay un enlace a Respaldo en la barra y se carga su hoja de estilos', () => {
  const html = leer('../index.html');
  assert.match(html, /<a href="#\/dinero\/respaldo">Respaldo<\/a>/);
  assert.match(html, /<link rel="stylesheet" href="css\/respaldo\.css\?v=1">/);
});

test('la regla de cuándo se recuerda NO lee el reloj: `hoy` llega de fuera (Guatemala va seis horas detrás de UTC)', () => {
  const regla = sinComentarios(leer('../js/nucleo/respaldo.js'));
  assert.doesNotMatch(regla, /new Date|Date\.now|hoyISO\(/);
  const mapa = sinComentarios(leer('../js/respaldo/mapa.js')) + sinComentarios(leer('../js/respaldo/excel.js'));
  assert.doesNotMatch(mapa, /new Date|Date\.now|hoyISO\(/);
});

test('el respaldo no recalcula ningún total: ni q() ni sumas propias en el mapa, solo las funciones del núcleo', () => {
  const mapa = sinComentarios(leer('../js/respaldo/mapa.js'));
  // Los montos que escribe salen de lineasSalida, horaTardiaDe y resumen; el único `q(` es el redondeo a la hora de escribir un valor.
  assert.match(mapa, /lineasSalida\(c\)/);
  assert.match(mapa, /resumen\(c\)\.saldo/);
  assert.match(mapa, /horaTardiaDe\(c\)/);
  assert.doesNotMatch(mapa, /precioDia\s*\*|\*\s*c\.dias|dias\s*\*\s*precio/, 'la renta no se multiplica aquí');
});

// ---------------------------------------------------------------------------
// El papel membretado: el único lugar donde un aviso de pantalla se vuelve tinta
// ---------------------------------------------------------------------------

test('el aviso de arriba lleva `no-imprimir`: si la hoja del contrato no se arma, el aviso no sale impreso sobre el papel que el cliente firma', async () => {
  olvidarElDescarteDelRecordatorio();
  const doc = documentoFalso();
  await mostrarElRecordatorioDeRespaldo({ hoy: '2027-10-14', leer: registro({ 2026: '2026-10-14' }), documento: doc });
  assert.match(doc.banners()[0].className, /(^|\s)no-imprimir(\s|$)/);
});

test('y la regla de impresión que esconde `.no-imprimir` existe CON sus declaraciones: display: none !important dentro de @media print', () => {
  const css = leer('../css/estilos.css');
  const impresion = css.slice(css.indexOf('@media print'));
  // La regla que nombra `.no-imprimir` entre sus selectores, y lo que declara.
  const regla = /([^{}]*\.no-imprimir[^{}]*)\{([^{}]*)\}/.exec(impresion);
  assert.ok(regla, 'ninguna regla de @media print nombra .no-imprimir');
  assert.match(regla[2], /display:\s*none\s*!important/);
});

test('nada más de lo que dibuja el respaldo encima de otra pantalla puede salir en el papel: el único elemento que inserta fuera de su pantalla es el aviso', () => {
  const fuente = sinComentarios(leer('../js/pantallas/respaldo.js'));
  // Todo lo que se inserta en el documento fuera de `#pantalla` pasa por insertBefore / appendChild: solo el aviso, el enlace de descarga (que se quita al instante).
  const inserciones = [...fuente.matchAll(/\b(insertBefore|appendChild|prepend|append)\(/g)].map((m) => m[1]);
  assert.deepEqual(inserciones.sort(), ['appendChild', 'insertBefore'], inserciones.join(', '));
  assert.match(fuente, /app\.insertBefore\(aviso, pantalla\)/);
  assert.match(fuente, /document\.body\.appendChild\(enlace\)/);
});
