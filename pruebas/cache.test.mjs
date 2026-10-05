// Pruebas de la mezcla entre la copia local y lo que viene de la nube.
//
// El sistema dibuja primero con la copia local para abrir rápido, y después
// llega lo de la nube. Si esa mezcla se hace mal, el mostrador ve un dato viejo
// encima de uno nuevo — o peor, se le borra algo que sí existía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mezclar, idsQueSobran, abrirBase, depurarLocal } from '../js/cache.js';

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

// ---------- Curar lo que ya está guardado: depurarLocal (C1 de la revisión de las Tareas 6 y 7) ----------
//
// QUÉ CUBREN ESTAS PRUEBAS Y QUÉ NO. Usan una IndexedDB FALSA que modela solo lo
// que `depurarLocal` usa: tiendas con `getAll`/`get`/`put`, transacciones que
// confirman todo junto o, si algo lanza, no escriben nada, y el rechazo de abrir
// una tienda que la transacción no pidió. Comprueban la LÓGICA: qué se reemplaza,
// que la marca viaja en la misma transacción, que corre una sola vez, que un fallo
// no deja marca. NO comprueban que el IndexedDB de un navegador de verdad se
// comporte así (que `put` dentro de `onsuccess` de `getAll` quede en la misma
// transacción, que `abort()` descarte lo escrito, que `oncomplete` llegue): eso
// se verificó a mano en un navegador contra IndexedDB real (ver el reporte).

/** Una base falsa: `tiendas` es `{ nombre: [docs] }`. Anota cada transacción que se abre. */
function idbFalsa(tiendas) {
  const confirmado = new Map(Object.entries(tiendas).map(([n, docs]) => [n, new Map(docs.map((d) => [d.id, structuredClone(d)]))]));
  const bd = {
    transacciones: [],
    lectura: (tienda) => [...confirmado.get(tienda).values()].map((d) => structuredClone(d)),
    transaction(nombres, modo) {
      const permitidas = [].concat(nombres);
      const registro = { nombres: permitidas, modo, getAll: [], get: [], put: [] };
      bd.transacciones.push(registro);
      const escritos = []; // [tienda, doc]: se confirman solo si la transacción termina bien
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      let pendientes = 0;
      let cerrada = false;

      const terminar = () => {
        if (cerrada || pendientes > 0) return;
        cerrada = true;
        for (const [tienda, doc] of escritos) confirmado.get(tienda).set(doc.id, structuredClone(doc));
        setImmediate(() => tx.oncomplete?.());
      };
      const abortar = (error) => {
        if (cerrada) return;
        cerrada = true;
        tx.error = error;
        setImmediate(() => tx.onabort?.());
      };
      const pedir = (calcular) => {
        const pedido = { result: undefined, onsuccess: null };
        pendientes += 1;
        setImmediate(() => {
          pedido.result = calcular();
          pedido.onsuccess?.();
          pendientes -= 1;
          terminar();
        });
        return pedido;
      };
      tx.abort = () => abortar(null); // nada de lo escrito se confirma

      tx.objectStore = (tienda) => {
        if (!permitidas.includes(tienda)) throw new Error(`NotFoundError: la transacción no pidió «${tienda}»`);
        return {
          getAll: () => { registro.getAll.push(tienda); return pedir(() => bd.lectura(tienda)); },
          get: (id) => { registro.get.push([tienda, id]); return pedir(() => structuredClone(confirmado.get(tienda).get(id))); },
          put: (doc) => {
            if (modo !== 'readwrite') throw new Error('ReadOnlyError');
            registro.put.push([tienda, structuredClone(doc)]);
            escritos.push([tienda, structuredClone(doc)]);
            return pedir(() => doc.id);
          },
        };
      };
      return tx;
    },
  };
  return bd;
}

const conCosto = (id) => ({ id, ajeno: true, subarriendo: { costoDia: 400 }, carroAjeno: { placas: 'P-1', costoDia: 400 } });
const limpioDe = (c) => ({ id: c.id, ajeno: true, carroAjeno: { placas: 'P-1' } });
/** Lo que haría datos.js: reemplazar lo que trae costo, dejar (null) lo que no. */
const quitarCosto = (c) => (c?.subarriendo || c?.carroAjeno?.costoDia !== undefined ? limpioDe(c) : null);

test('depurarLocal: reemplaza cada documento que `transformar` cambie y deja los demás exactamente como están', async () => {
  const bd = idbFalsa({ contratos: [conCosto('a'), { id: 'b', ajeno: false }, conCosto('c')], ajustes: [] });
  const r = await depurarLocal('contratos', quitarCosto, { abrirBd: async () => bd });
  assert.deepEqual(r, { revisados: 3, cambiados: 2, yaHecha: false });
  assert.deepEqual(bd.lectura('contratos'), [limpioDe({ id: 'a' }), { id: 'b', ajeno: false }, limpioDe({ id: 'c' })]);
});

test('depurarLocal: recorre TODA la tienda, no solo lo que se vuelva a leer', async () => {
  // Es el hallazgo: meses viejos que esta computadora nunca vuelve a abrir.
  const viejos = Array.from({ length: 200 }, (_, i) => conCosto(`v${i}`));
  const bd = idbFalsa({ contratos: viejos, ajustes: [] });
  const r = await depurarLocal('contratos', quitarCosto, { abrirBd: async () => bd });
  assert.equal(r.cambiados, 200);
  assert.equal(bd.lectura('contratos').some((c) => JSON.stringify(c).includes('costoDia')), false);
});

test('depurarLocal: con marca, la marca se guarda en `ajustes` en la MISMA transacción que la limpieza', async () => {
  const bd = idbFalsa({ contratos: [conCosto('a')], ajustes: [] });
  await depurarLocal('contratos', quitarCosto, { marca: 'depuracion:x', abrirBd: async () => bd });
  assert.equal(bd.transacciones.length, 1, 'una sola transacción: no hay estado intermedio «limpié pero no marqué»');
  assert.deepEqual(bd.transacciones[0].nombres, ['contratos', 'ajustes']);
  assert.equal(bd.transacciones[0].modo, 'readwrite');
  const [marca] = bd.lectura('ajustes');
  assert.equal(marca.id, 'depuracion:x');
  assert.equal(marca.cambiados, 1);
  assert.equal(typeof marca.hecha, 'number');
});

test('depurarLocal: corre UNA sola vez por computadora — con la marca ya puesta no lee ni toca nada', async () => {
  const bd = idbFalsa({ contratos: [conCosto('a')], ajustes: [] });
  await depurarLocal('contratos', quitarCosto, { marca: 'depuracion:x', abrirBd: async () => bd });
  // Después de limpiar, algo (una pestaña vieja) vuelve a dejar un costo en la copia:
  bd.transacciones.length = 0;
  const r = await depurarLocal('contratos', () => assert.fail('no debe ni mirar los documentos'), { marca: 'depuracion:x', abrirBd: async () => bd });
  assert.deepEqual(r, { revisados: 0, cambiados: 0, yaHecha: true });
  assert.deepEqual(bd.transacciones[0].getAll, [], 'no recorrió la tienda');
  assert.deepEqual(bd.transacciones[0].put, [], 'y no escribió nada, ni la marca otra vez');
});

test('depurarLocal: otra marca es otra limpieza — se corre aunque la primera ya esté puesta', async () => {
  const bd = idbFalsa({ contratos: [conCosto('a')], ajustes: [{ id: 'depuracion:x', hecha: 1 }] });
  const r = await depurarLocal('contratos', quitarCosto, { marca: 'depuracion:y', abrirBd: async () => bd });
  assert.equal(r.cambiados, 1);
});

test('depurarLocal: si `transformar` lanza, NO se escribe nada y NO queda marca — el siguiente arranque lo reintenta y limpia', async () => {
  const bd = idbFalsa({ contratos: [conCosto('a'), conCosto('b')], ajustes: [] });
  let n = 0;
  const falla = (c) => { n += 1; if (n === 2) throw new Error('documento raro'); return quitarCosto(c); };
  await assert.rejects(depurarLocal('contratos', falla, { marca: 'depuracion:x', abrirBd: async () => bd }), /documento raro/);
  assert.equal(bd.lectura('contratos').filter((c) => c.subarriendo).length, 2, 'ni el primero quedó a medias');
  assert.deepEqual(bd.lectura('ajustes'), [], 'sin marca: no se dará por hecha');

  const reintento = await depurarLocal('contratos', quitarCosto, { marca: 'depuracion:x', abrirBd: async () => bd });
  assert.equal(reintento.cambiados, 2);
  assert.equal(reintento.yaHecha, false);
});

test('depurarLocal: si la base no se puede abrir, LANZA — no lo toma por «no había nada» y no deja marca', async () => {
  // `leerLocal` devuelve [] ante un fallo; una limpieza que hiciera lo mismo
  // quedaría marcada como hecha sobre una copia sin limpiar.
  const error = Object.assign(new Error('requested version is less than existing'), { name: 'VersionError' });
  await assert.rejects(depurarLocal('contratos', quitarCosto, { marca: 'depuracion:x', abrirBd: async () => { throw error; } }), { name: 'VersionError' });
});

test('depurarLocal: sin marca solo pide la tienda que se le dijo (no abre `ajustes`) y puede correr cuantas veces se quiera', async () => {
  const bd = idbFalsa({ contratos: [conCosto('a')] });
  await depurarLocal('contratos', quitarCosto, { abrirBd: async () => bd });
  assert.deepEqual(bd.transacciones[0].nombres, ['contratos']);
  const otra = await depurarLocal('contratos', quitarCosto, { abrirBd: async () => bd });
  assert.equal(otra.cambiados, 0, 'ya estaba limpia');
});

test('depurarLocal: una tienda vacía se marca igual — no hay nada que limpiar y no se vuelve a mirar', async () => {
  const bd = idbFalsa({ contratos: [], ajustes: [] });
  const r = await depurarLocal('contratos', quitarCosto, { marca: 'depuracion:x', abrirBd: async () => bd });
  assert.deepEqual(r, { revisados: 0, cambiados: 0, yaHecha: false });
  assert.equal(bd.lectura('ajustes').length, 1);
});
