// Pruebas de la mezcla entre la copia local y lo que viene de la nube.
//
// El sistema dibuja primero con la copia local para abrir rápido, y después
// llega lo de la nube. Si esa mezcla se hace mal, el mostrador ve un dato viejo
// encima de uno nuevo — o peor, se le borra algo que sí existía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mezclar, idsQueSobran, abrirBase } from '../js/cache.js';

const local = [
  { id: 'a', placas: 'P-1', actualizado: 100 },
  { id: 'b', placas: 'P-2', actualizado: 100 },
];

test('lo más nuevo gana', () => {
  const remotos = [{ id: 'a', placas: 'P-1 NUEVA', actualizado: 200 }];
  const r = mezclar(local, remotos);
  assert.equal(r.find((x) => x.id === 'a').placas, 'P-1 NUEVA');
});

test('lo viejo de la nube no pisa lo nuevo de aquí', () => {
  const remotos = [{ id: 'a', placas: 'VIEJA', actualizado: 50 }];
  const r = mezclar(local, remotos);
  assert.equal(r.find((x) => x.id === 'a').placas, 'P-1');
});

test('lo que solo está en la nube se agrega', () => {
  const r = mezclar(local, [{ id: 'c', placas: 'P-3', actualizado: 10 }]);
  assert.equal(r.length, 3);
});

test('lo que solo está local se conserva', () => {
  const r = mezclar(local, []);
  assert.equal(r.length, 2);
});

test('lo borrado en la nube desaparece', () => {
  const r = mezclar(local, [{ id: 'a', borrado: true, actualizado: 300 }]);
  assert.deepEqual(r.map((x) => x.id), ['b']);
});

// ---------- Lo que se borró de verdad ----------
//
// El dueño vació sus colecciones desde la consola de Firebase y el sistema
// siguió mostrando sus contratos de prueba: `mezclar` solo suma y actualiza,
// nunca quita. Estas pruebas fijan la regla que faltaba.

test('lo que la nube ya no devuelve, sobra en la copia local', () => {
  const locales = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(idsQueSobran(locales, [{ id: 'b' }]), ['a', 'c']);
});

test('si la nube devolvió todo, no sobra nada', () => {
  const locales = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(idsQueSobran(locales, [{ id: 'b' }, { id: 'a' }]), []);
});

test('una copia local vacía no borra nada aunque la nube traiga cosas', () => {
  assert.deepEqual(idsQueSobran([], [{ id: 'a' }]), []);
});

test('si la nube contesta vacío de verdad, se van todos', () => {
  // Es el caso del dueño: borró las cuatro colecciones en la consola.
  // Solo se llega aquí cuando la LECTURA SALIÓ BIEN; una lectura fallida ni
  // siquiera pasa por esta función (ver resultadoLectura en datos.js).
  assert.deepEqual(idsQueSobran([{ id: 'a' }, { id: 'b' }], []), ['a', 'b']);
});

// ---------- Abrir la copia local sin quedarse colgado ----------
//
// QUÉ CUBREN ESTAS PRUEBAS Y QUÉ NO. Usan una fábrica de IndexedDB FALSA que
// el propio test dispara a mano (blocked, success, error). Comprueban que
// `abrirBase` engancha bien sus manejadores y reacciona como debe cuando esos
// eventos llegan. NO comprueban que el navegador de verdad los dispare, ni que
// una pestaña vieja bloquee a una nueva, ni que el aviso se vea en pantalla:
// eso solo se puede ver en un navegador y se verificó ahí a mano (ver el
// reporte de la Tarea 3), no aquí.

/** Una base falsa con las tiendas que se le digan, que anota lo que se le hace. */
function baseFalsa(existentes = []) {
  const tiendas = new Set(existentes);
  const bd = {
    creadas: [],
    cerrada: false,
    objectStoreNames: { contains: (t) => tiendas.has(t) },
    createObjectStore(t, opciones) { tiendas.add(t); bd.creadas.push([t, opciones]); },
    close() { bd.cerrada = true; },
  };
  return bd;
}

/** Una fábrica de IndexedDB falsa: `open` devuelve un pedido que el test dispara. */
function fabricaFalsa() {
  const f = { pedidos: [] };
  f.open = (nombre, version) => {
    const req = { nombre, version, result: null, error: null };
    f.pedidos.push(req);
    return req;
  };
  return f;
}

function avisos() {
  const a = { bloqueos: 0, liberaciones: 0, vieja: 0 };
  a.alBloquear = () => { a.bloqueos += 1; };
  a.alLiberar = () => { a.liberaciones += 1; };
  a.alQuedarVieja = () => { a.vieja += 1; };
  return a;
}

/** 'pendiente' si la promesa sigue sin resolver ni rechazar, aunque pasen los turnos. */
async function estadoDe(promesa) {
  const pendiente = Symbol('pendiente');
  const r = await Promise.race([
    promesa.then(() => 'resuelta', () => 'rechazada'),
    new Promise((ok) => setImmediate(() => ok(pendiente))),
  ]);
  return r === pendiente ? 'pendiente' : r;
}

test('abrirBase: al subir de versión crea solo la tienda que falta y no toca las demás', () => {
  // La base de una computadora que ya tenía la versión 2, con sus datos reales.
  const bd = baseFalsa(['clientes', 'vehiculos', 'contratos', 'ajustes', 'reservas']);
  const fabrica = fabricaFalsa();
  abrirBase(fabrica);
  const pedido = fabrica.pedidos[0];
  assert.ok(pedido.version >= 3, 'sin la versión 3 no corre onupgradeneeded y "duenos" no se crea');
  pedido.result = bd;
  pedido.onupgradeneeded();
  assert.deepEqual(bd.creadas, [['duenos', { keyPath: 'id' }]]);
  // Esta base falsa no tiene `deleteObjectStore`: si el manejador intentara borrar algo, la prueba reventaría.
});

test('abrirBase: en una computadora nueva crea todas las tiendas', () => {
  const bd = baseFalsa();
  const fabrica = fabricaFalsa();
  abrirBase(fabrica);
  fabrica.pedidos[0].result = bd;
  fabrica.pedidos[0].onupgradeneeded();
  assert.deepEqual(
    bd.creadas.map(([t]) => t),
    ['clientes', 'vehiculos', 'contratos', 'ajustes', 'reservas', 'duenos'],
  );
});

test('abrirBase: la conexión abierta se cierra sola cuando otra pestaña pide subir la versión, y la pestaña lo dice', async () => {
  const a = avisos();
  const bd = baseFalsa();
  const fabrica = fabricaFalsa();
  const p = abrirBase(fabrica, a);
  fabrica.pedidos[0].result = bd;
  fabrica.pedidos[0].onsuccess();
  assert.equal(await p, bd);
  assert.equal(bd.cerrada, false, 'abrir no la cierra');
  assert.equal(a.vieja, 0, 'mientras nadie pida subir la versión, no hay nada que decir');
  assert.equal(typeof bd.onversionchange, 'function');
  bd.onversionchange();
  assert.equal(bd.cerrada, true, 'cede el paso en vez de bloquear a la pestaña nueva');
  // Cerrada la conexión esta pestaña ya no tiene copia local: tiene que decirlo,
  // no devolver listas vacías como si no hubiera nada.
  assert.equal(a.vieja, 1);
});

test('abrirBase: si la base ya está en una versión más nueva que este código, la pestaña lo dice y rechaza', async () => {
  const a = avisos();
  const fabrica = fabricaFalsa();
  const p = abrirBase(fabrica, a);
  const pedido = fabrica.pedidos[0];
  pedido.error = Object.assign(new Error('requested version is less than existing'), { name: 'VersionError' });
  pedido.onerror();
  await assert.rejects(p, { name: 'VersionError' });
  assert.equal(a.vieja, 1);
});

test('abrirBase: otro error al abrir rechaza pero no dice que la pestaña quedó atrasada', async () => {
  const a = avisos();
  const fabrica = fabricaFalsa();
  const p = abrirBase(fabrica, a);
  const pedido = fabrica.pedidos[0];
  pedido.error = Object.assign(new Error('disco lleno'), { name: 'QuotaExceededError' });
  pedido.onerror();
  await assert.rejects(p, { name: 'QuotaExceededError' });
  assert.equal(a.vieja, 0, 'decir "recarga" por un error que recargar no arregla sería mentirle');
});

test('abrirBase: si la subida queda bloqueada avisa y se queda esperando; al liberarse sigue sola', async () => {
  const a = avisos();
  const bd = baseFalsa();
  const fabrica = fabricaFalsa();
  const p = abrirBase(fabrica, a);
  const pedido = fabrica.pedidos[0];

  pedido.onblocked();
  assert.equal(a.bloqueos, 1, 'se le avisa al dueño');
  assert.equal(await estadoDe(p), 'pendiente', 'no se rechaza: nadie debe tomarlo por "no hay copia local"');

  // Aunque el navegador repita el evento, no se avisa dos veces.
  pedido.onblocked();
  assert.equal(a.bloqueos, 1);

  // La otra pestaña se cerró: el navegador termina la subida y la espera continúa.
  pedido.result = bd;
  pedido.onsuccess();
  assert.equal(await p, bd);
  assert.equal(a.liberaciones, 1, 'el aviso se retira');
});

test('abrirBase: sin bloqueo no hay aviso que retirar', async () => {
  const a = avisos();
  const fabrica = fabricaFalsa();
  const p = abrirBase(fabrica, a);
  fabrica.pedidos[0].result = baseFalsa();
  fabrica.pedidos[0].onsuccess();
  await p;
  assert.deepEqual([a.bloqueos, a.liberaciones], [0, 0]);
});

test('abrirBase: si tras el bloqueo la apertura falla, rechaza y retira el aviso', async () => {
  const a = avisos();
  const fabrica = fabricaFalsa();
  const p = abrirBase(fabrica, a);
  const pedido = fabrica.pedidos[0];
  pedido.onblocked();
  pedido.error = new Error('VersionError');
  pedido.onerror();
  await assert.rejects(p, /VersionError/);
  assert.equal(a.liberaciones, 1, 'un aviso que nadie puede resolver no se queda en pantalla');
});
