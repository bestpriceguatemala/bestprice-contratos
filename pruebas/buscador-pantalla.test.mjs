// La caja de búsqueda de arriba de todo, la parte que toca el navegador (pantallas/buscador.js): lo que dibuja, cómo lee las tres listas
// y qué hacen el teclado y el ratón. El documento es de mentira (EventTarget de Node con lo justo), así que NO prueba que la caja se vea
// ni que responda en un navegador de verdad: eso se mira en pantalla, con clics (informe del 23 de octubre de 2026).
//
// Las listas salen de las lecturas REALES de datos.js (cargarClientes, cargarFlota, cargarTodosLosContratos) sobre una nube y una copia
// local en memoria, y los clientes, carros y contratos de los constructores reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlDelPanel, crearLectura, crearBuscador, textosDeLaFila, VIGENCIA_DE_LA_LECTURA_MS,
} from '../js/pantallas/buscador.js';
import { buscarEnTodo } from '../js/nucleo/buscadorGeneral.js';
import { cargarClientes, cargarFlota, cargarTodosLosContratos } from '../js/datos.js';
import { clienteDe, carroDe, contratoDe } from './fixtures/negocioParaBuscar.mjs';
import { nubeEnMemoria, copiaLocalEnMemoria } from './fixtures/nubeEnMemoria.mjs';

const juan = clienteDe('k1', {
  nombres: 'Juan', apellidos: 'Pérez', documento: '2999 11111 0101', telefono: '3078-4155',
});
const ana = clienteDe('k2', { nombres: 'Ana', apellidos: 'Gómez', telefono: '5551-0123' });
const yaris = carroDe('v1', { placas: 'P-234IFN', marca: 'Toyota', linea: 'Yaris', color: 'Blanco' });
const hilux = carroDe('v2', { placas: 'P-012ABC', marca: 'Toyota', linea: 'Hilux', color: 'Negro' });
const c14591 = contratoDe({ numero: 14591, cliente: juan, carro: yaris, fechaSalida: '2026-10-01' });
const c14592 = contratoDe({ numero: 14592, cliente: ana, carro: hilux, fechaSalida: '2026-10-03', recibidoEl: '2026-10-05' });

const sinId = ({ id: _id, ...resto }) => resto;

/** Una nube y una copia local por colección, con los datos dados; las lecturas de verdad corren encima. */
function mundo({ nube: enLaNube = {}, local: enLocal = {}, fallan = [] } = {}) {
  const nube = nubeEnMemoria({ contratos: enLaNube.contratos ?? [], fallan });
  for (const c of enLaNube.clientes ?? []) nube.docs.set(`clientes/${c.id}`, structuredClone(sinId(c)));
  for (const v of enLaNube.carros ?? []) nube.docs.set(`vehiculos/${v.id}`, structuredClone(sinId(v)));
  const copias = {
    clientes: copiaLocalEnMemoria(enLocal.clientes ?? []),
    vehiculos: copiaLocalEnMemoria(enLocal.carros ?? []),
    contratos: copiaLocalEnMemoria(enLocal.contratos ?? []),
  };
  const opciones = {
    depsDe: (coleccion) => ({
      iniciar: nube.iniciar, leerCopia: copias[coleccion].leerCopia, guardarCopia: copias[coleccion].guardarCopia, borrarCopia: copias[coleccion].borrarCopia,
    }),
    leerCopia: (coleccion) => copias[coleccion].leerCopia(),
  };
  const lecturas = (alCambiar) => crearLectura({ ...opciones, alCambiar });
  return { nube, copias, opciones, lecturas };
}

/** Espera (cediendo el turno) a que se cumpla algo que ocurre por detrás, sin dormir de más. */
async function esperar(condicion, nombre = 'la condición') {
  for (let i = 0; i < 1000; i += 1) {
    if (condicion()) return;
    await new Promise((ok) => { setTimeout(ok, 2); });
  }
  assert.fail(`nunca se cumplió: ${nombre}`);
}

/** Hace que la nube de mentira tarde `lento.ms` en contestar cada lectura de una colección (todas, o solo las de `soloDe`). */
function nubeLenta(m, soloDe = null) {
  const lento = { ms: 0 };
  m.nube.fsMod.getDocs = new Proxy(m.nube.fsMod.getDocs, {
    apply: async (objetivo, esto, args) => {
      if (lento.ms && (!soloDe || args[0].coleccion === soloDe)) await new Promise((ok) => { setTimeout(ok, lento.ms); });
      return Reflect.apply(objetivo, esto, args);
    },
  });
  return lento;
}

const lecturaDe = (r) => (({ clientes, carros, contratos }) => ({ clientes, carros, contratos }))(r.listas);
const vacia = (extra = {}) => ({
  datos: [], fallo: false, asentada: true, servida: true, ...extra,
});
const leidas = { clientes: vacia(), carros: vacia(), contratos: vacia() };

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que se dibuja
// ---------------------------------------------------------------------------------------------------------------------------------

test('el panel enseña los grupos con su cuenta, las filas con su ficha, y no lleva ningún monto', () => {
  const r = buscarEnTodo({ clientes: [juan], carros: [yaris], contratos: [c14591, c14592] }, 'P-234IFN');
  const html = htmlDelPanel({ resultado: r, listas: leidas });
  assert.match(html, /role="listbox"/);
  assert.match(html, /Carros <span class="bg-cuenta">1<\/span>/);
  assert.match(html, /Contratos <span class="bg-cuenta">1<\/span>/);
  assert.match(html, /href="#\/carros\/v1"/);
  assert.match(html, /href="#\/contratos\/c-14591"/);
  assert.match(html, /N\.° 14591 · Juan Pérez/);
  assert.match(html, /Rentado/, 'el estado del contrato');
  assert.doesNotMatch(html, /Q\s?\d/, 'ni un solo monto: la caja se ve desde cualquier pantalla');
  assert.doesNotMatch(html, /Debe|Saldo|A favor/, 'ni cómo quedó la cuenta');
});

test('cada fila dice qué es: cliente con su DPI y teléfono, carro con marca y color, contrato con carro, fecha y estado', () => {
  const listas = { clientes: [juan, ana], carros: [yaris], contratos: [c14591, c14592] };
  const fila = (consulta, tipo, id) => buscarEnTodo(listas, consulta).grupos.flatMap((g) => g.filas).find((f) => f.tipo === tipo && f.id === id);
  assert.deepEqual(textosDeLaFila(fila('juan', 'clientes', 'k1')), { principal: 'Juan Pérez', detalle: '2999 11111 0101 · 3078-4155' });
  assert.deepEqual(textosDeLaFila(fila('yaris', 'carros', 'v1')), { principal: 'P-234IFN', detalle: 'Toyota Yaris · Blanco' });
  assert.deepEqual(textosDeLaFila(fila('yaris', 'contratos', 'c-14591')), {
    principal: 'N.° 14591 · Juan Pérez', detalle: 'P-234IFN · Toyota Yaris · salió 1 oct 2026 · Rentado',
  });
  assert.match(textosDeLaFila(fila('hilux', 'contratos', 'c-14592')).detalle, /Devuelto/, 'recibido con daños sin cobrar: devuelto, no cerrado');
});

test('el texto libre entra ESCAPADO: un nombre, unas placas o un id con HTML no se vuelven HTML', () => {
  const malo = clienteDe('k"\'><img src=x onerror=alert(1)>', {
    nombres: '<script>alert(1)</script>', apellidos: 'O\'Brien & "Hijos"', documento: '<b>1</b>', telefono: '555-0000',
  });
  const carroMalo = carroDe('v<1>\'&', { placas: '<i>P-1</i>', marca: '"Toyota"', linea: '&amp;' });
  const contratoMalo = contratoDe({
    numero: 7, cliente: malo, carro: carroMalo, id: 'c"\'><svg onload=alert(2)>',
  });
  const r = buscarEnTodo({ clientes: [malo], carros: [carroMalo], contratos: [contratoMalo] }, 'o');
  assert.ok(r.total >= 3, 'se encontraron las tres cosas');
  const html = htmlDelPanel({ resultado: r, listas: leidas });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /<svg/i);
  assert.doesNotMatch(html, /<i>/i);
  assert.doesNotMatch(html, /<b>/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /O&#39;Brien &amp; &quot;Hijos&quot;/);
  // La dirección va con el id escapado para la dirección Y para el HTML: ni una comilla suelta que cierre el atributo.
  for (const href of html.match(/href="[^"]*"/g)) assert.doesNotMatch(href.slice(6, -1), /[<>"']/, href);
  for (const ruta of html.match(/data-ruta="[^"]*"/g)) assert.doesNotMatch(ruta.slice(11, -1), /[<>"']/, ruta);
  assert.equal((html.match(/href="/g) ?? []).length, 3, 'tres filas, tres direcciones');
});

test('lo que se pudo escribir en la consulta tampoco entra: «Sin resultados» no repite lo escrito', () => {
  const html = htmlDelPanel({ resultado: buscarEnTodo({}, '<script>alert(1)</script>'), listas: leidas });
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /Sin resultados\./);
});

test('sin nada que enseñar: «Sin resultados.» si todo se leyó, «Buscando…» si falta la nube, y NO «Sin resultados» si una lectura falló', () => {
  const nada = buscarEnTodo({}, 'zzz');
  assert.match(htmlDelPanel({ resultado: nada, listas: leidas }), /<p class="bg-nada bg-nada" role="status">Sin resultados\.<\/p>/);
  const esperando = htmlDelPanel({ resultado: nada, listas: { ...leidas, carros: vacia({ asentada: false }) } });
  assert.match(esperando, /Buscando…/);
  assert.doesNotMatch(esperando, /Sin resultados/);
  const caida = htmlDelPanel({ resultado: nada, listas: { ...leidas, contratos: vacia({ fallo: true }) } });
  assert.doesNotMatch(caida, /Sin resultados/, 'dos frases distintas: una lectura que no llegó no es «no hay»');
  assert.match(caida, /bg-fallo/);
  assert.match(caida, /no se pudieron leer los contratos de la nube/);
});

test('con resultados y una lista caída, lo encontrado sale y debajo dice que puede estar incompleto', () => {
  const r = buscarEnTodo({ clientes: [juan], carros: [], contratos: [] }, 'juan');
  const html = htmlDelPanel({ resultado: r, listas: { ...leidas, contratos: vacia({ fallo: true }) } });
  assert.match(html, /href="#\/clientes\/k1"/);
  assert.match(html, /No se pudieron leer los contratos de la nube\. Lo que ves puede estar incompleto\./);
  assert.doesNotMatch(htmlDelPanel({ resultado: r, listas: leidas }), /incompleto/, 'sin caída, sin aviso');
});

test('con resultados de unas listas y otra todavía sin llegar, debajo dice «Buscando…»; con todas servidas no dice nada', () => {
  const r = buscarEnTodo({ clientes: [juan], carros: [], contratos: [] }, 'juan');
  const esperando = htmlDelPanel({ resultado: r, listas: { ...leidas, contratos: vacia({ servida: false, asentada: false }) } });
  assert.match(esperando, /href="#\/clientes\/k1"/);
  assert.match(esperando, /<p class="bg-nada bg-buscando" role="status">Buscando…<\/p>/);
  assert.doesNotMatch(htmlDelPanel({ resultado: r, listas: leidas }), /Buscando/);
  assert.doesNotMatch(htmlDelPanel({ resultado: r, listas: { ...leidas, contratos: vacia({ asentada: false }) } }), /Buscando/, 'copia local servida: sin aviso');
});

test('la fila marcada con las flechas se anuncia como seleccionada, y solo esa', () => {
  const r = buscarEnTodo({ clientes: [juan, ana], carros: [], contratos: [] }, 'a');
  const html = htmlDelPanel({ resultado: r, listas: leidas, activa: 'clientes:k2' });
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(html, /class="bg-fila bg-activa" role="option" id="bg-fila-0" aria-selected="true" href="#\/clientes\/k2"/);
});

test('cuando hay más de las que caben se dice cuántas faltan', () => {
  const muchos = Array.from({ length: 9 }, (_, i) => clienteDe(`m${i}`, { nombres: `Mario${i}`, apellidos: 'Díaz' }));
  const html = htmlDelPanel({ resultado: buscarEnTodo({ clientes: muchos }, 'diaz'), listas: leidas });
  assert.match(html, /Clientes <span class="bg-cuenta">9<\/span>/);
  assert.match(html, /y 3 más: escribe un poco más para acotar/);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Las lecturas
// ---------------------------------------------------------------------------------------------------------------------------------

test('con copia local y la nube de acuerdo: se sirve lo local al instante y la lista queda «asentada» cuando la nube terminó, sin avisar a nadie', async () => {
  const m = mundo({
    nube: { clientes: [juan], carros: [yaris], contratos: [c14591] },
    local: { clientes: [juan], carros: [yaris], contratos: [c14591] },
  });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  assert.deepEqual(lectura.listas.contratos.datos.map((c) => c.numero), [14591], 'lo local, ya');
  await esperar(() => Object.values(lectura.listas).every((l) => l.asentada), 'que la nube termine');
  assert.deepEqual(Object.values(lectura.listas).map((l) => l.fallo), [false, false, false]);
});

test('una lista queda «servida» en cuanto entrega algo, y sigue servida cuando se vuelve a pedir; al cerrar la sesión deja de estarlo', async () => {
  const m = mundo({ nube: { contratos: [c14591] }, local: { contratos: [c14591] } });
  const lectura = m.lecturas();
  const lento = nubeLenta(m);
  assert.equal(lectura.listas.contratos.servida, false, 'antes de pedir nada');
  await lectura.asegurar(1000);
  assert.deepEqual(Object.values(lectura.listas).map((l) => l.servida), [true, true, true]);
  await esperar(() => Object.values(lectura.listas).every((l) => l.asentada));
  lento.ms = 40;
  await lectura.asegurar(1000 + VIGENCIA_DE_LA_LECTURA_MS + 1);
  assert.equal(lectura.listas.contratos.servida, true, 'la copia de hace cinco minutos sigue a la vista mientras llega la nueva');
  assert.equal(lectura.listas.contratos.asentada, false);
  lectura.reiniciar();
  assert.deepEqual(Object.values(lectura.listas).map((l) => l.servida), [false, false, false]);
});

test('con copia local y la nube con algo nuevo: lo nuevo llega por detrás', async () => {
  const m = mundo({
    nube: { clientes: [juan, ana], carros: [yaris], contratos: [c14591, c14592] },
    local: { clientes: [juan], carros: [yaris], contratos: [c14591] },
  });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  await esperar(() => lectura.listas.contratos.datos.length === 2 && lectura.listas.clientes.datos.length === 2, 'lo nuevo de la nube');
  assert.equal(lectura.listas.contratos.asentada, true);
});

test('sin copia local se espera a la nube; con la nube caída, la lista dice que FALLÓ (no que está vacía) y queda asentada', async () => {
  const m = mundo({ fallan: [{ op: 'getDocs' }] });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  for (const lista of Object.values(lectura.listas)) {
    assert.equal(lista.fallo, true);
    assert.equal(lista.asentada, true, 'ya no hay nada que esperar');
    assert.deepEqual(lista.datos, []);
  }
});

test('con copia local y la nube caída: se sirve lo local, y el fallo llega después y NO borra lo que había', async () => {
  const m = mundo({ fallan: [{ op: 'getDocs' }], local: { clientes: [juan], carros: [yaris], contratos: [c14591] } });
  const lectura = m.lecturas();
  nubeLenta(m).ms = 30;
  await lectura.asegurar(1000);
  assert.equal(lectura.listas.contratos.fallo, false, 'al principio, solo se tiene lo local');
  assert.equal(lectura.listas.contratos.asentada, false, 'y todavía se espera a la nube');
  await esperar(() => lectura.listas.contratos.fallo, 'el aviso de que la nube falló');
  assert.equal(lectura.listas.contratos.asentada, true);
  assert.deepEqual(lectura.listas.contratos.datos.map((c) => c.numero), [14591]);
});

test('las lecturas de la caja son las de siempre: una sola pasada por colección, nada de consultas por rango', async () => {
  const m = mundo({ nube: { clientes: [juan], carros: [yaris], contratos: [c14591] } });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  await esperar(() => Object.values(lectura.listas).every((l) => l.asentada));
  const lecturasDeLaNube = m.nube.llamadas.filter(([op]) => op === 'getDocs').map(([, coleccion]) => coleccion).sort();
  assert.deepEqual(lecturasDeLaNube, ['clientes', 'contratos', 'vehiculos']);
});

test('la nube se pide la primera vez y otra vez pasados cinco minutos — no con cada toque a la caja', async () => {
  const m = mundo({ nube: { clientes: [juan], carros: [yaris], contratos: [c14591] }, local: { clientes: [juan], carros: [yaris], contratos: [c14591] } });
  const lectura = m.lecturas();
  const lento = nubeLenta(m);
  const getDocs = () => m.nube.llamadas.filter(([op]) => op === 'getDocs').length;
  await lectura.asegurar(0 + 1000);
  await esperar(() => Object.values(lectura.listas).every((l) => l.asentada));
  assert.equal(getDocs(), 3);
  await lectura.asegurar(1000 + 60 * 1000);
  await lectura.asegurar(1000 + VIGENCIA_DE_LA_LECTURA_MS);
  assert.equal(getDocs(), 3, 'dentro de los cinco minutos no se vuelve a pedir');
  lento.ms = 40;
  await lectura.asegurar(1000 + VIGENCIA_DE_LA_LECTURA_MS + 1);
  assert.equal(lectura.listas.contratos.asentada, false, 'y mientras llega, lo que hay es la copia: no se da por leído');
  await esperar(() => Object.values(lectura.listas).every((l) => l.asentada));
  assert.equal(getDocs(), 6, 'pasados los cinco minutos sí');
});

test('lo que se guardó en ESTA computadora después de la lectura aparece al volver a tocar la caja, sin pedir la nube', async () => {
  const m = mundo({ nube: { clientes: [juan], carros: [yaris], contratos: [c14591] }, local: { clientes: [juan], carros: [yaris], contratos: [c14591] } });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  await esperar(() => Object.values(lectura.listas).every((l) => l.asentada));
  assert.deepEqual(lectura.listas.contratos.datos.map((c) => c.numero), [14591]);
  const getDocs = () => m.nube.llamadas.filter(([op]) => op === 'getDocs').length;
  const antes = getDocs();

  // El mostrador guarda un contrato nuevo: queda en la copia local (guardarEnNubeYLocal), y la caja no lo sabe todavía.
  await m.copias.contratos.guardarCopia('contratos', [c14592]);
  await lectura.asegurar(1000 + 60 * 1000);
  assert.deepEqual(lectura.listas.contratos.datos.map((c) => c.numero).sort(), [14591, 14592]);
  assert.equal(getDocs(), antes, 'sin tocar la nube');
});

test('mezclar lo local no pisa lo que la nube trajo más nuevo', async () => {
  const nuevo = { ...c14591, actualizado: 2000, clienteNombre: 'JUAN PÉREZ (corregido)' };
  const viejo = { ...c14591, actualizado: 1000 };
  const m = mundo({ nube: { contratos: [nuevo] }, local: { contratos: [viejo] } });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  await esperar(() => lectura.listas.contratos.datos[0]?.actualizado === 2000, 'lo nuevo de la nube');
  await m.copias.contratos.guardarCopia('contratos', [viejo]);
  await lectura.asegurar(2000);
  assert.equal(lectura.listas.contratos.datos[0].clienteNombre, 'JUAN PÉREZ (corregido)');
});

test('al cerrar la sesión no se queda nada en memoria, y lo que la nube conteste tarde se ignora', async () => {
  const m = mundo({ nube: { clientes: [juan], carros: [yaris], contratos: [c14591] }, local: { clientes: [juan], carros: [yaris], contratos: [c14591] } });
  const lectura = m.lecturas();
  await lectura.asegurar(1000);
  assert.equal(lectura.listas.clientes.datos.length, 1);
  lectura.reiniciar();
  for (const lista of Object.values(lectura.listas)) assert.deepEqual(lista, { datos: [], fallo: false, asentada: false, servida: false });
  await new Promise((ok) => { setTimeout(ok, 20); });
  for (const lista of Object.values(lectura.listas)) assert.deepEqual(lista, { datos: [], fallo: false, asentada: false, servida: false }, 'la respuesta tardía no repuebla');
  assert.equal(lectura.leyendoPorPrimeraVez, true, 'y la próxima vez se pide otra vez');
});

test('si falla la copia local misma, es un fallo de lectura, nunca «no hay nada»', async () => {
  const lectura = crearLectura({
    fuentes: [{ clave: 'clientes', coleccion: 'clientes', leer: async () => { throw new Error('IndexedDB murió'); } }],
  });
  await lectura.asegurar(1);
  assert.equal(lectura.listas.clientes.fallo, true);
  assert.equal(lectura.listas.clientes.asentada, true);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// La caja: teclado y ratón, con un documento de mentira
// ---------------------------------------------------------------------------------------------------------------------------------

function elemento(etiqueta = 'div') {
  const el = new EventTarget();
  Object.assign(el, {
    etiqueta, value: '', hidden: false, innerHTML: '', atributos: {}, hijos: [], padre: null, desenfocado: false,
  });
  el.setAttribute = (k, v) => { el.atributos[k] = String(v); };
  el.removeAttribute = (k) => { delete el.atributos[k]; };
  el.getAttribute = (k) => el.atributos[k] ?? null;
  el.blur = () => { el.desenfocado = true; };
  el.contains = (otro) => otro === el || el.hijos.some((h) => h.contains(otro));
  return el;
}

/** La caja con su panel dentro, y un documento y una ventana que son solo donde caen los eventos de fuera. */
function cajaDeMentira(m, extra = {}) {
  const caja = elemento('div');
  const entrada = elemento('input');
  const panel = elemento('div');
  panel.hidden = true;
  for (const hijo of [entrada, panel]) { hijo.parentElement = caja; caja.hijos.push(hijo); }
  const documento = elemento('document');
  documento.getElementById = () => null;
  const ventana = elemento('window');
  const irA = [];
  const buscador = crearBuscador({
    entrada, panel, documento, ventana, ir: (ruta) => irA.push(ruta), ahora: () => 1000, ...m.opciones, ...extra,
  });
  const evento = (tipo, propiedades = {}) => {
    const ev = new Event(tipo, { cancelable: true });
    for (const [k, v] of Object.entries(propiedades)) Object.defineProperty(ev, k, { value: v });
    return ev;
  };
  return {
    caja, entrada, panel, documento, ventana, irA, buscador, evento,
    escribir(texto) { entrada.value = texto; entrada.dispatchEvent(evento('input')); },
    tecla(key) { const ev = evento('keydown', { key }); entrada.dispatchEvent(ev); return ev; },
    enfocar() { entrada.dispatchEvent(evento('focus')); },
    filaFalsa(ruta) { return { closest: (selector) => (selector === '[data-ruta]' ? { getAttribute: () => ruta } : null) }; },
    clic(ruta, propiedades = {}) {
      const ev = evento('click', { target: this.filaFalsa(ruta), button: 0, ...propiedades });
      panel.dispatchEvent(ev);
      return ev;
    },
  };
}

const mundoCompleto = () => mundo({
  nube: { clientes: [juan, ana], carros: [yaris, hilux], contratos: [c14591, c14592] },
  local: { clientes: [juan, ana], carros: [yaris, hilux], contratos: [c14591, c14592] },
});

test('tocar la caja pide las listas; escribir el número de la hoja con su cero deja el contrato a la vista y Enter aterriza en él', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2, 'la lectura al tocar la caja');
  c.escribir('014591');
  assert.equal(c.panel.hidden, false);
  assert.match(c.panel.innerHTML, /N\.° 14591 · Juan Pérez/);
  assert.doesNotMatch(c.panel.innerHTML, /14592/);
  const enter = c.tecla('Enter');
  assert.deepEqual(c.irA, ['#/contratos/c-14591']);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(c.entrada.value, '', 'la caja queda limpia para la próxima');
  assert.equal(c.panel.hidden, true);
  assert.equal(c.entrada.desenfocado, true);
});

test('el número sin cero, «14591», también aterriza', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('14591');
  c.tecla('Enter');
  assert.deepEqual(c.irA, ['#/contratos/c-14591']);
});

test('Enter con varias coincidencias NO elige: se queda la lista y no se va a ningún lado', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  assert.match(c.panel.innerHTML, /P-234IFN/);
  assert.match(c.panel.innerHTML, /P-012ABC/);
  const enter = c.tecla('Enter');
  assert.deepEqual(c.irA, []);
  assert.equal(enter.defaultPrevented, false);
  assert.equal(c.panel.hidden, false, 'la lista sigue a la vista');
  assert.equal(c.entrada.value, 'toyota');
});

test('con varias coincidencias, las flechas marcan una fila y Enter abre ESA', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  // Orden en pantalla: Carros (P-012ABC, P-234IFN por placas) y después Contratos (14592 el más reciente, 14591).
  c.tecla('ArrowDown');
  assert.match(c.panel.innerHTML, /bg-activa" role="option" id="bg-fila-0"[^>]*href="#\/carros\/v2"/);
  assert.equal(c.entrada.getAttribute('aria-activedescendant'), 'bg-fila-0');
  c.tecla('ArrowDown');
  c.tecla('ArrowDown');
  c.tecla('ArrowDown');
  assert.match(c.panel.innerHTML, /bg-activa" role="option" id="bg-fila-3"[^>]*href="#\/contratos\/c-14591"/);
  c.tecla('Enter');
  assert.deepEqual(c.irA, ['#/contratos/c-14591']);
});

test('las flechas dan la vuelta pasando por «ninguna»: ArrowUp desde ninguna va a la última, y otra vez ArrowDown vuelve a ninguna', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.tecla('ArrowUp');
  assert.match(c.panel.innerHTML, /bg-activa" role="option" id="bg-fila-3"/);
  c.tecla('ArrowDown');
  assert.doesNotMatch(c.panel.innerHTML, /bg-activa/);
  assert.equal(c.entrada.getAttribute('aria-activedescendant'), null);
  c.tecla('Enter');
  assert.deepEqual(c.irA, [], 'sin fila marcada y con varias, Enter no elige');
});

test('escribir de nuevo suelta la fila marcada: Enter no abre una fila que ya no es la que se veía', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.tecla('ArrowDown');
  c.escribir('toyota hilux');
  assert.doesNotMatch(c.panel.innerHTML, /bg-activa/);
});

test('un clic en una fila lleva a esa ficha; con Ctrl, Cmd, Mayús, Alt o el botón derecho se deja al navegador', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  for (const raro of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 2 }]) {
    const ev = c.clic('#/carros/v1', raro);
    assert.equal(ev.defaultPrevented, false);
  }
  assert.deepEqual(c.irA, []);
  const ev = c.clic('#/carros/v1');
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(c.irA, ['#/carros/v1']);
  assert.equal(c.entrada.value, '');
});

test('un clic en el panel que no es en una fila (un título, un espacio) no hace nada', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.panel.dispatchEvent(c.evento('click', { target: { closest: () => null }, button: 0 }));
  assert.deepEqual(c.irA, []);
  assert.equal(c.panel.hidden, false);
});

test('Escape cierra el panel sin borrar lo escrito (y no deja que el navegador lo borre); el segundo Escape ya no lo impide', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  const primero = c.tecla('Escape');
  assert.equal(c.panel.hidden, true);
  assert.equal(c.entrada.value, 'toyota');
  assert.equal(primero.defaultPrevented, true);
  const segundo = c.tecla('Escape');
  assert.equal(segundo.defaultPrevented, false, 'con el panel cerrado el navegador hace lo suyo (borrar)');
});

test('un clic en el campo, con el foco ya en él y el panel cerrado con Escape, lo vuelve a abrir', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.tecla('Escape');
  assert.equal(c.panel.hidden, true);
  c.entrada.dispatchEvent(c.evento('click'));
  assert.equal(c.panel.hidden, false);
  assert.match(c.panel.innerHTML, /P-234IFN/);
});

test('un panel cerrado queda VACÍO: lo que se buscó no se queda escrito en la página', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('juan');
  assert.match(c.panel.innerHTML, /Juan/);
  c.tecla('Escape');
  assert.equal(c.panel.innerHTML, '');
  c.escribir('juan');
  c.buscador.reiniciar();
  assert.equal(c.panel.innerHTML, '', 'y al cerrar la sesión también');
});

test('volver a tocar la caja con texto escrito vuelve a abrir el panel', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.tecla('Escape');
  assert.equal(c.panel.hidden, true);
  c.enfocar();
  assert.equal(c.panel.hidden, false);
});

test('un toque fuera de la caja cierra el panel; uno dentro (en el panel o en el campo) no', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.documento.dispatchEvent(c.evento('pointerdown', { target: c.panel }));
  c.documento.dispatchEvent(c.evento('pointerdown', { target: c.entrada }));
  assert.equal(c.panel.hidden, false);
  c.documento.dispatchEvent(c.evento('pointerdown', { target: elemento('main') }));
  assert.equal(c.panel.hidden, true);
  assert.equal(c.entrada.value, 'toyota', 'lo escrito se queda');
});

test('al cambiar de pantalla el panel se cierra', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.ventana.dispatchEvent(c.evento('hashchange'));
  assert.equal(c.panel.hidden, true);
});

test('borrar todo lo escrito cierra el panel; solo espacios tampoco busca', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  assert.equal(c.panel.hidden, false);
  c.escribir('');
  assert.equal(c.panel.hidden, true);
  c.escribir('   ');
  assert.equal(c.panel.hidden, true);
});

test('una tecla que forma parte de una composición (acentos muertos, teclados en otros idiomas) no se toma por Enter ni por una flecha', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('014591');
  const componiendo = (key) => {
    const ev = c.evento('keydown', { key, isComposing: true });
    c.entrada.dispatchEvent(ev);
    return ev;
  };
  assert.equal(componiendo('Enter').defaultPrevented, false);
  assert.equal(componiendo('ArrowDown').defaultPrevented, false);
  assert.deepEqual(c.irA, []);
  assert.doesNotMatch(c.panel.innerHTML, /bg-activa/);
});

test('aria-expanded dice si el panel está abierto', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  assert.equal(c.entrada.getAttribute('aria-expanded'), 'true');
  c.tecla('Escape');
  assert.equal(c.entrada.getAttribute('aria-expanded'), 'false');
});

test('una fila marcada que desaparece de la lista (se borró en la nube) no vuelve a salir marcada si reaparece', async () => {
  const m = mundoCompleto();
  const c = cajaDeMentira(m);
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.tecla('ArrowDown');
  assert.match(c.panel.innerHTML, /bg-activa" role="option" id="bg-fila-0"[^>]*href="#\/carros\/v2"/, 'marcado el Hilux');
  const { carros } = c.buscador.lectura.listas;
  const completos = carros.datos;
  const copia = m.copias.vehiculos.guardados;
  const guardado = copia.get('v2');
  // Se borra de la nube: la copia local ya no lo tiene y la lista en memoria tampoco.
  copia.delete('v2');
  carros.datos = completos.filter((v) => v.id !== 'v2');
  await c.buscador.lectura.asegurar(1001);
  assert.doesNotMatch(c.panel.innerHTML, /href="#\/carros\/v2"/, 'ya no está');
  copia.set('v2', guardado);
  await c.buscador.lectura.asegurar(1002);
  assert.match(c.panel.innerHTML, /href="#\/carros\/v2"/, 'volvió');
  assert.doesNotMatch(c.panel.innerHTML, /bg-activa/, 'pero nadie lo marcó otra vez');
  c.tecla('Enter');
  assert.deepEqual(c.irA, [], 'y Enter no abre una fila que ya no estaba marcada');
});

test('Enter con la caja vacía o con el panel cerrado no hace nada', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  const enter = c.tecla('Enter');
  assert.deepEqual(c.irA, []);
  assert.equal(enter.defaultPrevented, false);
});

test('una lectura caída no se pinta como «Sin resultados»: lo que se busca no está en esta computadora y se dice que no se pudo leer la nube', async () => {
  const c = cajaDeMentira(mundo({ fallan: [{ op: 'getDocs' }] }));
  c.enfocar();
  await esperar(() => Object.values(c.buscador.lectura.listas).every((l) => l.asentada));
  c.escribir('014591');
  assert.doesNotMatch(c.panel.innerHTML, /Sin resultados/);
  assert.match(c.panel.innerHTML, /no se pudieron leer los clientes, la flota y los contratos de la nube/);
  assert.match(c.panel.innerHTML, /no se sabe si existe/);
  const enter = c.tecla('Enter');
  assert.deepEqual(c.irA, []);
  assert.equal(enter.defaultPrevented, false);
});

test('mientras la nube no contesta y no hay nada local, la caja dice «Buscando…», y cuando llega lo encontrado, lo enseña', async () => {
  const m = mundo({ nube: { contratos: [c14591] } });
  m.nube.fsMod.getDocs = new Proxy(m.nube.fsMod.getDocs, {
    apply: async (objetivo, esto, args) => { await new Promise((ok) => { setTimeout(ok, 30); }); return Reflect.apply(objetivo, esto, args); },
  });
  const c = cajaDeMentira(m);
  c.enfocar();
  c.escribir('014591');
  assert.match(c.panel.innerHTML, /Buscando…/);
  assert.doesNotMatch(c.panel.innerHTML, /Sin resultados/);
  await esperar(() => /N\.° 14591/.test(c.panel.innerHTML), 'que llegue el contrato');
});

test('con los clientes ya a la vista y los contratos esperando a la nube, la caja enseña lo que hay y dice «Buscando…» debajo', async () => {
  const m = mundo({ nube: { clientes: [juan], contratos: [c14591] }, local: { clientes: [juan] } });
  m.nube.fsMod.getDocs = new Proxy(m.nube.fsMod.getDocs, {
    apply: async (objetivo, esto, args) => {
      if (args[0].coleccion === 'contratos') await new Promise((ok) => { setTimeout(ok, 40); });
      return Reflect.apply(objetivo, esto, args);
    },
  });
  const c = cajaDeMentira(m);
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.clientes.servida, 'los clientes locales');
  c.escribir('juan');
  assert.match(c.panel.innerHTML, /href="#\/clientes\/k1"/);
  assert.match(c.panel.innerHTML, /bg-buscando/);
  assert.doesNotMatch(c.panel.innerHTML, /c-14591/);
  await esperar(() => /c-14591/.test(c.panel.innerHTML), 'que lleguen los contratos');
  assert.doesNotMatch(c.panel.innerHTML, /Buscando/, 'ya llegaron');
});

test('lo que llega de la nube mientras se mira el panel lo repinta; si no cambia nada de lo que se ve, el panel ni se toca', async () => {
  const m = mundo({ nube: { clientes: [juan, ana], carros: [yaris], contratos: [c14591] }, local: { clientes: [juan], carros: [yaris], contratos: [c14591] } });
  const lento = nubeLenta(m);
  const c = cajaDeMentira(m);
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.servida && c.buscador.lectura.listas.clientes.servida, 'lo local');
  lento.ms = 40;
  c.escribir('juan');
  // Ahora la nube tarda y trae un cliente más (Ana): con «juan» escrito, lo que se ve NO cambia.
  c.buscador.lectura.asegurar(10 * 60 * 1000);
  let escrituras = 0;
  let html = c.panel.innerHTML;
  Object.defineProperty(c.panel, 'innerHTML', { get: () => html, set: (v) => { html = v; escrituras += 1; } });
  await esperar(() => c.buscador.lectura.listas.clientes.datos.length === 2 && Object.values(c.buscador.lectura.listas).every((l) => l.asentada), 'que la nube termine');
  assert.equal(escrituras, 0, 'llegó la nube, la lista tiene un cliente más, pero lo que se ve es lo mismo: nada que repintar (repintar bajo el dedo pierde el clic)');
  // Y cuando SÍ cambia lo que se ve, se repinta.
  c.escribir('ana');
  assert.ok(escrituras > 0);
  assert.match(c.panel.innerHTML, /href="#\/clientes\/k2"/);
});

test('«Salir»: reiniciar borra lo escrito, cierra el panel y olvida las listas', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.enfocar();
  await esperar(() => c.buscador.lectura.listas.contratos.datos.length === 2);
  c.escribir('toyota');
  c.buscador.reiniciar();
  assert.equal(c.entrada.value, '');
  assert.equal(c.panel.hidden, true);
  assert.deepEqual(c.buscador.lectura.listas.contratos.datos, []);
});

test('desconectar quita todo lo que la caja conectó', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.buscador.desconectar();
  c.enfocar();
  c.escribir('toyota');
  assert.equal(c.panel.innerHTML, '', 'ya nadie escucha');
});

test('un input sin haber pasado por el foco (autocompletar, pegar con el menú) también pide las listas', async () => {
  const c = cajaDeMentira(mundoCompleto());
  c.escribir('014591');
  await esperar(() => /N\.° 14591/.test(c.panel.innerHTML), 'que lleguen las listas');
});

test('la caja se conecta con la de index.html y, sin ella, no revienta', async () => {
  const { conectarElBuscador } = await import('../js/pantallas/buscador.js');
  const sin = conectarElBuscador({ getElementById: () => null });
  assert.doesNotThrow(() => sin.reiniciar());
  assert.doesNotThrow(() => sin.desconectar());
});

// ---------------------------------------------------------------------------------------------------------------------------------
// El cascarón: lo que no puede faltar para que la caja exista y no salga en el papel
// ---------------------------------------------------------------------------------------------------------------------------------

const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/estilos.css', import.meta.url), 'utf8');

test('index.html: la caja existe, ya no está oculta, y ni ella ni su panel ni lo que las envuelve salen en el papel', () => {
  const entrada = INDEX.match(/<input[^>]*id="buscador"[^>]*>/)?.[0];
  assert.ok(entrada, 'el campo sigue en la página');
  assert.doesNotMatch(entrada, /\bhidden\b/, 'el campo ya no está oculto');
  assert.match(entrada, /class="[^"]*\bno-imprimir\b/, 'el campo lleva no-imprimir');
  assert.match(entrada, /placeholder="Buscar cliente, placas o número de contrato"/);
  const panel = INDEX.match(/<div[^>]*id="buscador-panel"[^>]*>/)?.[0];
  assert.ok(panel, 'el panel de resultados está en la página');
  assert.match(panel, /class="[^"]*\bno-imprimir\b/, 'el panel lleva no-imprimir');
  assert.match(panel, /\bhidden\b/, 'y empieza cerrado');
  assert.match(INDEX, /<div class="buscador-caja no-imprimir">/, 'y la caja que los envuelve también');
});

test('la hoja de estilos esconde .no-imprimir al imprimir (la caja sale por ahí), con !important', () => {
  const bloque = CSS.match(/@media print\s*\{[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
  const [selectores, declaraciones] = bloque.slice(bloque.indexOf('{') + 1).split('{');
  assert.match(selectores, /\.no-imprimir/, '.no-imprimir está en la lista de lo que no se imprime');
  assert.match(declaraciones, /display:\s*none\s*!important/);
  assert.match(CSS, /\.buscador-panel\[hidden\]\s*\{\s*display:\s*none/, 'cerrado de verdad, aunque otra regla le ponga display');
});

test('app.js conecta la caja al arrancar y la reinicia al cerrar la sesión', () => {
  assert.match(APP, /import \{ conectarElBuscador \} from '\.\/pantallas\/buscador\.js';/);
  assert.match(APP, /const buscador = conectarElBuscador\(\);/);
  const rama = APP.slice(APP.indexOf('alCambiarSesion((usuario) =>'));
  const sinSesion = rama.slice(rama.indexOf('} else {'));
  assert.match(sinSesion, /buscador\.reiniciar\(\);/, 'sin sesión la caja olvida lo leído');
});

test('el código de la caja no habla de dinero: ni lee costos, ni importa la contraseña de dinero, ni el área de dinero', () => {
  const fuente = readFileSync(new URL('../js/pantallas/buscador.js', import.meta.url), 'utf8');
  const general = readFileSync(new URL('../js/nucleo/buscadorGeneral.js', import.meta.url), 'utf8');
  for (const texto of [fuente, general]) {
    const importa = texto.match(/^import[^;]*;/gms).join('\n');
    assert.doesNotMatch(importa, /dinero-sesion|pantallas\/dinero|liquidacion|comisiones/, 'no importa nada del área de dinero');
  }
  assert.doesNotMatch(fuente, /resumen\(|dinero\(|costoDia|garantia/, 'ni calcula ni muestra montos');
});
