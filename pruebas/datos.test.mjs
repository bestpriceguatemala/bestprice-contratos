// Pruebas de la parte pura de la capa de datos: las reglas que deciden qué
// se le entrega a la pantalla, sin tocar Firestore ni IndexedDB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resultadoLectura, contratoParaGuardar, guardarContrato, duenoParaGuardar, guardarEnNubeYLocal,
  costoDelDocumento, sinCostoDelDueno, conCostoDelDueno, cargarContratosParaDinero,
  migrarCostosDelDueno, mensajeDeMigracion, MENSAJE_MIGRAR_SIN_DINERO,
} from '../js/datos.js';
import { CAMPOS_DUENO } from '../js/nucleo/dueno.js';
import { mezclar } from '../js/cache.js';
import { resumen } from '../js/nucleo/contrato.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { costoDelSubarriendo, cuentaDeDueno } from '../js/nucleo/liquidacion.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';

// CRÍTICO de la revisión final: una lectura de contratos fallida se dibujaba
// como "todos los carros disponibles" porque cargarConSincronia devolvía []
// sin decir que la lectura había fallado. resultadoLectura es la regla que
// arregla eso — se prueba aquí sin necesidad de Firestore.
test('con la nube al día, entrega lo remoto y fallo en false', () => {
  const r = resultadoLectura(['local'], { ok: true, valor: ['remoto1', 'remoto2'] });
  assert.deepEqual(r, { datos: ['remoto1', 'remoto2'], fallo: false });
});

test('con copia local pero la nube falló, entrega lo local y avisa el fallo', () => {
  const r = resultadoLectura(['v1', 'v2'], { ok: false });
  assert.deepEqual(r, { datos: ['v1', 'v2'], fallo: true });
});

test('nunca se inventa una lista vacía a partir de una lectura fallida: sin local y sin nube, fallo sale en true', () => {
  const r = resultadoLectura([], { ok: false });
  assert.deepEqual(r, { datos: [], fallo: true });
  // La clave del hallazgo: esto NO se puede distinguir de "de verdad no hay
  // nada" mirando solo `datos` — por eso `fallo` existe como campo aparte.
  const deVerdadVacio = resultadoLectura([], { ok: true, valor: [] });
  assert.deepEqual(deVerdadVacio, { datos: [], fallo: false });
  assert.notDeepEqual(r, deVerdadVacio, 'un fallo y una lista de verdad vacía no son lo mismo');
});

// IMPORTANTE de la revisión final: el campo `estado` que se guarda en el
// contrato tiene que salir siempre de estadoContrato(), nunca de lo que ya
// traía el objeto — si no, el campo guardado y lo que de verdad calcula
// estadoContrato() (cierre + saldo + garantía) se pueden desacordar.
test('contratoParaGuardar calcula el estado con estadoContrato(), no confía en el que ya traía', () => {
  const contrato = { dias: 4, precioDia: 700, pagos: [], estado: 'rentado' }; // sin cierre
  const guardado = contratoParaGuardar(contrato, { id: 'c1', numero: 1, ahora: 1000 });
  assert.equal(guardado.estado, 'rentado');
  assert.equal(guardado.id, 'c1');
  assert.equal(guardado.numero, 1);
  assert.equal(guardado.actualizado, 1000);
});

test('un contrato con cierre y sin saldo pendiente se guarda como "cerrado", no "rentado"', () => {
  const contrato = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-24' }, // ya regresó, sin atraso ni daños
    pagos: [{ monto: 2800, porcentajeTarjeta: 0 }], // ya pagó todo
    garantiaLiberada: true,
    estado: 'rentado', // el campo viejo, a propósito, para probar que no se confía en él
  };
  const guardado = contratoParaGuardar(contrato, { id: 'c1', numero: 1 });
  assert.equal(guardado.estado, 'cerrado');
});

test('un contrato devuelto pero con saldo o garantía pendiente se guarda como "devuelto"', () => {
  const contrato = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-24' },
    pagos: [], // todavía debe
    garantiaLiberada: false,
    estado: 'rentado',
  };
  const guardado = contratoParaGuardar(contrato, { id: 'c1', numero: 1 });
  assert.equal(guardado.estado, 'devuelto');
});

// CRÍTICO de la revisión final: el mismo hueco que deja reabrir un cierre ya
// hecho en blanco (recibirCarro.js) podría, en teoría, guardar una garantía
// liberada sobre un contrato que en realidad sigue debiendo. Candado barato:
// guardarContrato rechaza esa combinación ANTES de tocar la nube — por eso
// esta prueba puede llamarlo directo, sin mock de Firestore, y esperar el
// rechazo (el chequeo corre antes del primer `await` que de verdad usa la
// red).
test('CRÍTICO: guardarContrato rechaza una garantía liberada si todavía hay saldo pendiente', async () => {
  const contrato = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-25', danos: 200, descuento: 0 },
    pagos: [], // no pagó nada
    garantiaLiberada: true, // el mismo hueco que abre CRÍTICO 2
  };
  await assert.rejects(() => guardarContrato(contrato), /todavía debe/i);
});

// Los dueños de carros subarrendados. La ficha guardada tiene la forma que
// dice js/nucleo/dueno.js (CAMPOS_DUENO: nombre, telefono, nit, nota) más los
// dos campos que sella `duenoParaGuardar`: id y actualizado.
const dueno = {
  nombre: 'JUAN PÉREZ',
  telefono: '7777-7777',
  nit: '12345678-7',
  nota: 'Dueño confiable',
};

test('duenoParaGuardar: un dueño nuevo recibe su id y su sello actualizado', () => {
  const guardado = duenoParaGuardar(dueno, { id: 'd1', ahora: 5000 });
  assert.equal(guardado.id, 'd1');
  assert.equal(guardado.actualizado, 5000);
  // Lo que escribió el mostrador llega completo, sin tocarse.
  for (const { id } of CAMPOS_DUENO) assert.equal(guardado[id], dueno[id], `se perdió ${id}`);
});

test('duenoParaGuardar: sin `ahora` el sello es la hora de ahora, no vacío', () => {
  const antes = Date.now();
  const guardado = duenoParaGuardar(dueno, { id: 'd1' });
  assert.ok(guardado.actualizado >= antes && guardado.actualizado <= Date.now());
});

test('duenoParaGuardar: un dueño que ya existe conserva su id', () => {
  const existente = { ...dueno, id: 'd7', actualizado: 100 };
  // Como lo llama guardarDueno: el id de la referencia es el mismo del dueño.
  assert.equal(duenoParaGuardar(existente, { id: 'd7', ahora: 200 }).id, 'd7');
  // Y si quien llama olvida pasarlo, no se pierde: un dueño sin id se
  // guardaría como un documento nuevo y quedaría duplicado.
  assert.equal(duenoParaGuardar(existente, { ahora: 200 }).id, 'd7');
});

test('duenoParaGuardar: los campos que el formulario no conoce sobreviven', () => {
  // Un bug real de este proyecto borró un campo justo así: la ficha se
  // guardaba reconstruida solo con lo que la pantalla mostraba. El nombre es
  // inventado a propósito — tiene que ser uno que CAMPOS_DUENO no conozca.
  const desconocido = 'campoQueElFormularioNoConoce';
  assert.ok(!CAMPOS_DUENO.some((c) => c.id === desconocido), 'la prueba exige un campo fuera de la lista');
  const existente = { ...dueno, id: 'd7', actualizado: 100, [desconocido]: 'se queda' };
  const guardado = duenoParaGuardar(existente, { id: 'd7', ahora: 200 });
  assert.equal(guardado[desconocido], 'se queda');
});

test('duenoParaGuardar: `actualizado` se sella, no se copia del dueño que llega', () => {
  // mezclar() decide quién gana por este número: si se copiara el viejo, la
  // ficha recién guardada perdería contra la copia vieja que ya está en la nube.
  const existente = { ...dueno, id: 'd7', actualizado: 100 };
  const guardado = duenoParaGuardar(existente, { id: 'd7', ahora: 9999 });
  assert.equal(guardado.actualizado, 9999);
  assert.notEqual(guardado.actualizado, existente.actualizado);
});

test('duenoParaGuardar: no modifica el dueño que recibe', () => {
  const existente = { ...dueno, id: 'd7', actualizado: 100 };
  duenoParaGuardar(existente, { id: 'd7', ahora: 9999 });
  assert.equal(existente.actualizado, 100);
});

// ---------- Guardar: lo que ya está en la nube no se pierde por la copia local ----------
//
// El hallazgo: cada guardado escribía en la nube y DESPUÉS en la copia local, y
// un fallo de la local reventaba todo el guardado aunque el registro ya
// estuviera en Firebase. El dueño veía "no se pudo guardar", volvía a guardar
// con un formulario sin `id`, y quedaba un documento duplicado.
//
// QUÉ CUBREN: `guardarEnNubeYLocal` (el único camino de los guardados) con una
// Firestore y una copia local FALSAS que el test controla. NO cubren a Firebase
// ni a IndexedDB de verdad.

/** Una Firestore falsa que anota en `llamadas` lo que se le hace, en orden. */
function firestoreFalsa({ falla = false } = {}) {
  const llamadas = [];
  const fsMod = {
    collection: (db, c) => ({ coleccion: c }),
    // Sin id (alta) se "mintea" uno, como hace Firestore con collection().
    doc: (db, c, id) => ({ id: id || 'id-nuevo', coleccion: c || 'x' }),
    setDoc: async (ref, doc, opciones) => {
      llamadas.push(['nube', ref.id, doc, opciones]);
      if (falla) throw new Error('sin internet');
    },
  };
  return { llamadas, iniciar: async () => ({ db: {}, fsMod }) };
}

const armarCliente = (original) => (id) => ({ ...original, id, actualizado: 7 });

test('guardarEnNubeYLocal: si la copia local falla, el guardado sale bien y se le avisa', async () => {
  const f = firestoreFalsa();
  const avisados = [];
  const error = new Error('VersionError');
  const guardado = await guardarEnNubeYLocal('clientes', { nombres: 'ANA' }, armarCliente({ nombres: 'ANA' }), {
    iniciar: f.iniciar,
    guardarCopia: async () => { throw error; },
    avisar: (coleccion, e) => avisados.push([coleccion, e]),
  });
  assert.deepEqual(guardado, { nombres: 'ANA', id: 'id-nuevo', actualizado: 7 }, 'devuelve lo que quedó en la nube');
  assert.equal(f.llamadas.length, 1, 'la nube se escribió');
  assert.deepEqual(avisados, [['clientes', error]], 'no se traga en silencio: se avisa, una vez');
});

test('guardarEnNubeYLocal: si la nube falla, el guardado falla y la copia local ni se toca', async () => {
  const f = firestoreFalsa({ falla: true });
  let copias = 0;
  await assert.rejects(
    guardarEnNubeYLocal('clientes', {}, armarCliente({}), {
      iniciar: f.iniciar,
      guardarCopia: async () => { copias += 1; },
      avisar: () => assert.fail('un fallo de la nube no es un aviso de copia local'),
    }),
    /sin internet/,
  );
  assert.equal(copias, 0, 'lo que no está en la nube no se muestra como guardado');
});

test('guardarEnNubeYLocal: con todo bien escribe primero la nube y luego la copia local, sin avisar', async () => {
  const f = firestoreFalsa();
  const orden = [];
  const fsMod = (await f.iniciar()).fsMod;
  const guardado = await guardarEnNubeYLocal('duenos', { nombre: 'JUAN' }, (id) => ({ nombre: 'JUAN', id }), {
    iniciar: async () => ({ db: {}, fsMod: { ...fsMod, setDoc: async (...a) => { orden.push('nube'); return fsMod.setDoc(...a); } } }),
    guardarCopia: async (coleccion, docs) => { orden.push(['local', coleccion, docs]); },
    avisar: () => assert.fail('no había nada que avisar'),
  });
  assert.deepEqual(orden, ['nube', ['local', 'duenos', [guardado]]]);
  assert.deepEqual(f.llamadas[0][3], { merge: true });
});

test('guardarEnNubeYLocal: un registro con id se edita; uno sin id recibe uno nuevo', async () => {
  const f = firestoreFalsa();
  const copia = { guardarCopia: async () => {}, avisar: () => {} };
  const editado = await guardarEnNubeYLocal('clientes', { id: 'c9' }, (id) => ({ id }), { iniciar: f.iniciar, ...copia });
  assert.equal(editado.id, 'c9');
  const nuevo = await guardarEnNubeYLocal('clientes', {}, (id) => ({ id }), { iniciar: f.iniciar, ...copia });
  assert.equal(nuevo.id, 'id-nuevo');
});

// Esta NO es una prueba de comportamiento: lee el código fuente. Existe porque
// el comportamiento de arriba solo protege a los guardados que pasan por
// `guardarEnNubeYLocal`, y un guardado nuevo (o uno que alguien vuelva a
// escribir a mano) que llame a `guardarLocal` suelto traería de vuelta el
// duplicado sin que ninguna otra prueba lo note. Frágil a propósito: si
// alguien renombra algo, falla y obliga a mirar.
test('estructura: todo `guardar*` de datos.js pasa por guardarEnNubeYLocal y ninguno llama a guardarLocal suelto', () => {
  const fuente = readFileSync(new URL('../js/datos.js', import.meta.url), 'utf8');
  const guardados = [...fuente.matchAll(/^export async function (guardar\w+)\(/gm)]
    .map((m) => m[1]).filter((n) => n !== 'guardarEnNubeYLocal');
  assert.deepEqual(
    guardados.sort(),
    ['guardarCliente', 'guardarContrato', 'guardarDueno', 'guardarReserva', 'guardarVehiculo'],
    'hay un guardado nuevo (o uno menos): decidir si debe pasar por guardarEnNubeYLocal y actualizar esta lista',
  );
  for (const nombre of guardados) {
    const inicio = fuente.indexOf(`export async function ${nombre}(`);
    const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}\n', inicio));
    assert.ok(cuerpo.includes('guardarEnNubeYLocal('), `${nombre} no pasa por guardarEnNubeYLocal`);
    assert.ok(!/guardarLocal\(/.test(cuerpo), `${nombre} llama a guardarLocal directo: su fallo reventaría un guardado que ya salió bien en la nube`);
  }
});

// ===========================================================================
// El costo del dueño tras la contraseña (ADR-002)
// ===========================================================================
//
// Los contratos de estas pruebas NO están inventados: salen de
// `construirContrato` (Sacar carro), `construirCierre` (Recibir carro) y de lo
// que escribían las versiones de antes de ADR-002 (`viejo()`), o sea con los
// campos que de verdad se guardan — también `carroAjeno.costoDia`, la segunda
// copia del costo que nadie leía y que un movimiento solo de
// `subarriendo.costoDia` habría dejado a la vista.
//
// La Firestore de abajo es de MENTIRA, pero imita lo que importa de la de
// verdad: `privado/*` solo se lee con la base del área de dinero (las reglas),
// `setDoc` con `merge` mezcla los mapas por dentro, y `updateDoc` entiende
// 'a.b' y `deleteField()`. Estas pruebas NO prueban a Firebase.

const CLIENTE = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };

/** Un contrato de carro ajeno recién armado en pantalla: trae el costo en `subarriendo` Y en `carroAjeno`. */
function salidaAjena({
  id, numero = 1, costoDia = 400, dias = 4, dueno = 'Mario López', duenoId = 'd1',
}) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno, costoDia,
    },
    duenoId,
    fechaSalida: '2026-09-01',
    dias,
    precioDia: 700,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

function salidaPropia({ id, numero = 90 }) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: false,
    carro: { id: 'v1', placas: 'P-999TST', marca: 'Toyota', linea: 'Corolla' },
    fechaSalida: '2026-09-01',
    dias: 4,
    precioDia: 700,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 2800,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

/** El carro ya regresó, sin atraso y pagado todo: un contrato cerrado, de los que se le pagan al dueño. */
const devuelto = (c) => construirCierre(c, {
  fechaReal: c.devolucionPrevista, horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
});

/** El documento tal como lo escribían las versiones de ANTES de ADR-002: el costo adentro. */
const viejo = (c) => ({ ...c, actualizado: 1790000000000, estado: estadoContrato(c) });

/** El documento tal como lo escribe `guardarContrato` hoy: sin el costo. */
const nuevo = (c) => contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: 1790000000000 });

const sinId = ({ id: _id, ...resto }) => resto;

/** Dónde está la palabra `costoDia` dentro de algo, para afirmar que NO está en ningún lado. */
const traeCostoDia = (algo) => JSON.stringify(algo).includes('costoDia');

const BORRAR = Symbol('deleteField');
const esMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `merge: true` de Firestore: los mapas se mezclan por dentro, lo demás se reemplaza. */
function fusionar(destino, origen) {
  for (const [k, v] of Object.entries(origen)) {
    if (esMapa(v) && esMapa(destino[k])) fusionar(destino[k], v);
    else destino[k] = structuredClone(v);
  }
}

/**
 * Una Firestore en memoria con dos bases: la del mostrador (`iniciar`) y la del
 * área de dinero. `contratos` y `privados` son lo que ya está guardado;
 * `fallan` es una lista de `{ op, ruta }` que lanzan "sin internet" (sin
 * `ruta`, falla esa operación en cualquier documento).
 */
function nubeEnMemoria({
  contratos = [], privados = {}, fallan = [], demoraMs = 0,
} = {}) {
  const docs = new Map();
  for (const c of contratos) docs.set(`contratos/${c.id}`, structuredClone(sinId(c)));
  for (const [id, datos] of Object.entries(privados)) docs.set(`contratos/${id}/privado/dinero`, structuredClone(datos));
  const llamadas = [];
  const dbMostrador = { nombre: 'mostrador', esDinero: false };
  const dbDinero = { nombre: 'dinero', esDinero: true };
  let auto = 0;
  const vuelo = { ahora: 0, maximo: 0 };
  const falla = (op, ruta) => fallan.some((f) => f.op === op && (f.ruta === undefined || f.ruta === ruta));

  const fsMod = {
    collection: (db, nombre) => ({ coleccion: nombre, db }),
    doc: (origen, ...segmentos) => {
      if (origen.coleccion) {
        const id = segmentos[0] ?? `auto-${(auto += 1)}`;
        return { ruta: `${origen.coleccion}/${id}`, id, db: origen.db };
      }
      return { ruta: segmentos.join('/'), id: segmentos.at(-1), db: origen };
    },
    getDoc: async (ref) => {
      llamadas.push(['getDoc', ref.ruta, ref.db.nombre]);
      vuelo.ahora += 1;
      vuelo.maximo = Math.max(vuelo.maximo, vuelo.ahora);
      if (demoraMs) await new Promise((ok) => { setTimeout(ok, demoraMs); });
      vuelo.ahora -= 1;
      if (falla('getDoc', ref.ruta)) throw new Error('sin internet');
      // Las reglas: `privado` solo se lee con la credencial de dinero.
      if (ref.ruta.includes('/privado/') && !ref.db.esDinero) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      const datos = docs.get(ref.ruta);
      return { exists: () => datos !== undefined, data: () => structuredClone(datos) };
    },
    getDocs: async (col) => {
      llamadas.push(['getDocs', col.coleccion, col.db.nombre]);
      if (falla('getDocs', col.coleccion)) throw new Error('sin internet');
      return {
        docs: [...docs]
          .filter(([ruta]) => ruta.startsWith(`${col.coleccion}/`) && ruta.split('/').length === 2)
          .map(([ruta, datos]) => ({ id: ruta.split('/')[1], data: () => structuredClone(datos) })),
      };
    },
    setDoc: async (ref, datos, opciones) => {
      llamadas.push(['setDoc', ref.ruta, structuredClone(datos), opciones, ref.db.nombre]);
      if (falla('setDoc', ref.ruta)) throw new Error('sin internet');
      if (opciones?.merge && docs.has(ref.ruta)) fusionar(docs.get(ref.ruta), structuredClone(datos));
      else docs.set(ref.ruta, structuredClone(datos));
    },
    updateDoc: async (ref, cambios) => {
      llamadas.push(['updateDoc', ref.ruta, Object.keys(cambios), ref.db.nombre]);
      if (falla('updateDoc', ref.ruta)) throw new Error('sin internet');
      if (!docs.has(ref.ruta)) throw new Error('El documento no existe.');
      for (const [camino, valor] of Object.entries(cambios)) {
        const partes = camino.split('.');
        let nodo = docs.get(ref.ruta);
        for (const parte of partes.slice(0, -1)) nodo = nodo[parte];
        if (valor === BORRAR) delete nodo[partes.at(-1)];
        else nodo[partes.at(-1)] = structuredClone(valor);
      }
    },
    deleteField: () => BORRAR,
  };

  return {
    docs,
    llamadas,
    fallan,
    vuelo,
    dbMostrador,
    dbDinero,
    fsMod,
    iniciar: async () => ({ db: dbMostrador, fsMod }),
    /** Lo que hay en un documento, con su id, o `undefined`. */
    leer: (ruta) => (docs.has(ruta) ? { id: ruta.split('/')[1], ...structuredClone(docs.get(ruta)) } : undefined),
    escrituras: (ruta) => llamadas.filter(([op, r]) => ['setDoc', 'updateDoc'].includes(op) && (ruta === undefined || r === ruta)),
  };
}

/** La copia local en memoria, con la forma de `guardarLocal`/`leerLocal`. */
function copiaLocalEnMemoria(iniciales = []) {
  const guardados = new Map(iniciales.map((c) => [c.id, structuredClone(c)]));
  return {
    guardados,
    leerCopia: async () => [...guardados.values()].map((c) => structuredClone(c)),
    guardarCopia: async (_coleccion, docs) => { for (const d of docs) guardados.set(d.id, structuredClone(d)); },
  };
}

// ---------- Lo que se guarda ----------

test('contratoParaGuardar: el documento no lleva el costo del dueño, ni en subarriendo ni en carroAjeno', () => {
  const armado = salidaAjena({ id: 'c1' });
  // Punto de partida: en pantalla el costo SÍ está, en las dos llaves.
  assert.equal(armado.subarriendo.costoDia, 400);
  assert.equal(armado.carroAjeno.costoDia, 400);

  const guardado = nuevo(armado);
  assert.equal(traeCostoDia(guardado), false, 'ninguna llave del documento puede traer el costo');
  // Y nada más se perdió: lo demás del carro ajeno sigue ahí.
  assert.equal(guardado.carroAjeno.placas, 'P-1AJN');
  assert.equal(guardado.carroAjeno.dueno, 'Mario López');
  assert.equal(guardado.duenoId, 'd1');
  assert.equal(guardado.ajeno, true, 'sigue siendo la marca por la que se sabe que es ajeno');
  assert.equal('subarriendo' in guardado, false, 'si el costo era lo único que tenía, no queda un subarriendo vacío');
});

test('contratoParaGuardar: no modifica el contrato que recibe (la pantalla lo sigue usando)', () => {
  const armado = salidaAjena({ id: 'c1' });
  nuevo(armado);
  assert.equal(armado.subarriendo.costoDia, 400);
  assert.equal(armado.carroAjeno.costoDia, 400);
  assert.equal(resumen(armado).costoSubarriendo, 1600, 'resumen() sigue calculando sobre el contrato armado');
});

test('contratoParaGuardar: un carro propio se guarda igual que siempre (subarriendo null se queda null)', () => {
  const propio = salidaPropia({ id: 'p1' });
  const guardado = nuevo(propio);
  assert.equal(guardado.subarriendo, null);
  assert.equal(guardado.carroAjeno, null);
});

test('sinCostoDelDueno: un subarriendo que trae algo más conserva lo demás', () => {
  const c = { ...salidaAjena({ id: 'c1' }), subarriendo: { costoDia: 400, otro: 'x' } };
  assert.deepEqual(sinCostoDelDueno(c).subarriendo, { otro: 'x' });
});

// ---------- costoDelDocumento ----------

test('costoDelDocumento: lee subarriendo.costoDia, y si no, el de carroAjeno; ninguno es null (no 0)', () => {
  assert.equal(costoDelDocumento(salidaAjena({ id: 'c1', costoDia: 400 })), 400);
  assert.equal(costoDelDocumento({ ajeno: true, carroAjeno: { costoDia: 250 } }), 250, 'solo la segunda copia');
  assert.equal(costoDelDocumento(nuevo(salidaAjena({ id: 'c1' }))), null, 'uno ya migrado no trae ninguno');
  assert.equal(costoDelDocumento(salidaPropia({ id: 'p1' })), null);
  assert.equal(costoDelDocumento(null), null);
  assert.equal(costoDelDocumento({ subarriendo: { costoDia: '' } }), null, 'un campo vacío no es un costo anotado');
  assert.equal(costoDelDocumento(salidaAjena({ id: 'c1', costoDia: 0 })), 0, 'un 0 que sí se guardó es un número');
});

// ---------- El puente de lectura ----------

test('puente: lee el valor VIEJO cuando el costo sigue dentro del contrato', () => {
  const c = conCostoDelDueno(viejo(salidaAjena({ id: 'c1', costoDia: 400 })), null);
  assert.equal(c.subarriendo.costoDia, 400);
  assert.equal(resumen(c).costoSubarriendo, 1600);
});

test('puente: lee el valor NUEVO cuando está en privado y el documento ya no lo trae', () => {
  const guardado = nuevo(salidaAjena({ id: 'c1', costoDia: 400 }));
  assert.equal(costoDelDocumento(guardado), null, 'punto de partida: el documento no lo trae');
  const c = conCostoDelDueno(guardado, 400);
  assert.equal(c.subarriendo.costoDia, 400);
  assert.equal(resumen(c).costoSubarriendo, 1600);
});

test('puente: si por alguna razón están LOS DOS, manda el de privado', () => {
  const conAmbos = viejo(salidaAjena({ id: 'c1', costoDia: 400 }));
  assert.equal(conCostoDelDueno(conAmbos, 300).subarriendo.costoDia, 300);
  // Aunque lo de privado sea 0: privado es el que manda, no "el mayor" ni "el que no es cero".
  assert.equal(conCostoDelDueno(conAmbos, 0).subarriendo.costoDia, 0);
});

test('puente: un contrato sin costo en NINGÚN lado no se vuelve un cero de verdad', () => {
  const guardado = nuevo(salidaAjena({ id: 'c1' }));
  const c = conCostoDelDueno(guardado, null);
  // No se le inventa `costoDia: 0`: sigue sin costo anotado, que es lo que es.
  assert.equal(traeCostoDia(c), false);
  assert.equal(c, guardado, 'se devuelve tal cual');
  assert.equal(resumen(c).costoSubarriendo, 0);
  // Y la liquidación lo marca, en vez de pasar Q0.00 por un costo de verdad.
  const cuenta = cuentaDeDueno({ contratos: [devuelto(c)], pagos: [] });
  assert.deepEqual(cuenta.sinCostoAnotado, ['c1']);
  assert.equal(cuenta.totalPorPagar, 0);
});

test('puente: no modifica el contrato que recibe', () => {
  const guardado = nuevo(salidaAjena({ id: 'c1' }));
  const copia = structuredClone(guardado);
  const mezclado = conCostoDelDueno(guardado, 400);
  assert.notEqual(mezclado, guardado);
  assert.deepEqual(guardado, copia, 'el objeto original sigue sin el costo');
});

test('puente: un carro propio no se toca, aunque alguien le pase un costo', () => {
  const propio = nuevo(salidaPropia({ id: 'p1' }));
  assert.equal(conCostoDelDueno(propio, 500), propio);
});

test('UN solo lugar calcula el costo: la deuda al dueño y la utilidad leen la misma cifra', () => {
  const c = devuelto(conCostoDelDueno(nuevo(salidaAjena({ id: 'c1', costoDia: 400 })), 400));
  const { costoSubarriendo, utilidad, pagado } = resumen(c);
  assert.equal(costoSubarriendo, 1600);
  assert.equal(costoDelSubarriendo(c), costoSubarriendo, 'liquidacion.js le pregunta a resumen()');
  assert.equal(utilidad, pagado - costoSubarriendo);
});

test('el núcleo no aprendió a leer de ningún almacén: no importa datos, Firebase ni la sesión de dinero', () => {
  for (const archivo of ['contrato.js', 'liquidacion.js']) {
    const fuente = readFileSync(new URL(`../js/nucleo/${archivo}`, import.meta.url), 'utf8');
    const importes = [...fuente.matchAll(/^import .*? from '(.+?)';/gms)].map((m) => m[1]);
    assert.ok(importes.length > 0, `${archivo} debería importar algo del núcleo`);
    for (const ruta of importes) {
      assert.match(ruta, /^\.\/[a-z]+\.js$/, `${archivo} importa ${ruta}: el núcleo solo se importa a sí mismo`);
    }
  }
});

// ---------- guardarContrato: lo que de verdad sale hacia la nube y hacia la copia local ----------

/** Guarda `contrato` contra la nube y la copia local de mentira, y devuelve todo para mirar. */
async function guardarYMirar(contrato, nube = nubeEnMemoria(), copia = copiaLocalEnMemoria()) {
  const guardado = await guardarContrato(contrato, {
    iniciar: nube.iniciar,
    guardarCopia: copia.guardarCopia,
    avisar: () => assert.fail('no había nada que avisar'),
    numeroNuevo: async () => 77,
  });
  return { guardado, nube, copia };
}

test('guardarContrato: el costo va a privado/dinero y NI el documento NI la copia local lo llevan', async () => {
  const { guardado, nube, copia } = await guardarYMirar(salidaAjena({ id: 'c1', costoDia: 400 }));

  assert.deepEqual(nube.leer('contratos/c1/privado/dinero'), { id: 'c1', costoDia: 400 });
  assert.equal(traeCostoDia(nube.leer('contratos/c1')), false, 'el documento del contrato, ya en la nube');
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'la copia local (IndexedDB)');
  assert.equal(traeCostoDia(guardado), false, 'lo que se le devuelve a la pantalla');
  assert.equal(guardado.carroAjeno.dueno, 'Mario López', 'el resto del contrato llegó completo');
});

test('guardarContrato: privado se escribe PRIMERO y con la base normal (crear y actualizar lo permite la sesión)', async () => {
  const { nube } = await guardarYMirar(salidaAjena({ id: 'c1' }));
  assert.deepEqual(nube.escrituras().map(([, ruta]) => ruta), ['contratos/c1/privado/dinero', 'contratos/c1']);
  const [, , , opciones, base] = nube.escrituras('contratos/c1/privado/dinero')[0];
  assert.deepEqual(opciones, { merge: true }, 'no pisa lo que privado guarde después (comisión, pagos al dueño)');
  assert.equal(base, 'mostrador');
});

test('guardarContrato: si privado falla, el contrato NO se guarda y la copia local ni se toca', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'setDoc', ruta: 'contratos/c1/privado/dinero' }] });
  const copia = copiaLocalEnMemoria();
  await assert.rejects(guardarYMirar(salidaAjena({ id: 'c1' }), nube, copia), /sin internet/);
  assert.equal(nube.leer('contratos/c1'), undefined, 'un contrato guardado sin su costo diría "sin costo anotado" para siempre');
  assert.equal(copia.guardados.size, 0);
});

test('guardarContrato: un contrato SIN costo (uno ya migrado, al cobrar o recibir el carro) no toca privado', async () => {
  // Es el cero silencioso que más cuesta: q(undefined) es 0, y guardarlo pisaría el costo real.
  const migrado = nuevo(salidaAjena({ id: 'c1', costoDia: 400 }));
  const nube = nubeEnMemoria({ contratos: [migrado], privados: { c1: { costoDia: 400 } } });
  await guardarYMirar({ ...migrado, observaciones: 'cobró el saldo' }, nube);
  assert.deepEqual(nube.leer('contratos/c1/privado/dinero'), { id: 'c1', costoDia: 400 });
  assert.deepEqual(nube.escrituras().map(([, ruta]) => ruta), ['contratos/c1'], 'solo el documento del contrato');
  assert.equal(nube.leer('contratos/c1').observaciones, 'cobró el saldo');
});

test('guardarContrato: un carro propio no escribe nada en privado', async () => {
  const { nube } = await guardarYMirar(salidaPropia({ id: 'p1' }));
  assert.deepEqual(nube.escrituras().map(([, ruta]) => ruta), ['contratos/p1']);
});

test('guardarContrato: un contrato sin id recibe uno, y privado y contrato caen en el mismo documento', async () => {
  const { guardado, nube } = await guardarYMirar({ ...salidaAjena({ id: null }), id: null });
  assert.ok(guardado.id, 'el contrato recibió su id');
  assert.deepEqual(
    nube.escrituras().map(([, ruta]) => ruta),
    [`contratos/${guardado.id}/privado/dinero`, `contratos/${guardado.id}`],
  );
});

test('guardarContrato: guardar un contrato viejo (con su costo adentro) no lo migra a escondidas', async () => {
  // La migración es a mano, una vez, y alguien la ve correr. Guardar un viejo
  // copia su costo a privado y deja de escribirlo, pero no le borra al
  // documento lo que ya tenía en la nube (set con merge no borra campos).
  const antiguo = viejo(salidaAjena({ id: 'c1', costoDia: 400 }));
  const nube = nubeEnMemoria({ contratos: [antiguo] });
  const copia = copiaLocalEnMemoria();
  await guardarYMirar({ ...antiguo, observaciones: 'cobró el saldo' }, nube, copia);
  assert.equal(nube.leer('contratos/c1/privado/dinero').costoDia, 400);
  assert.equal(nube.leer('contratos/c1').subarriendo.costoDia, 400, 'sigue en el documento hasta que se corra la migración');
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'pero lo que se escribe ya no lo lleva');
});

// ---------- El área de dinero carga contratos con su costo ----------

const CERRADO = (id, costoDia, dias = 4) => devuelto(salidaAjena({ id, costoDia, dias }));

/** Un `cargar` de mentira: lo que devolvería cargarContratos, y recuerda el callback de fondo. */
function cargarFalso(datos, { fallo = false } = {}) {
  const f = { pedidos: [] };
  f.cargar = async (rango, alLlegar) => { f.pedidos.push({ rango, alLlegar }); return { datos, fallo }; };
  return f;
}

test('el área de dinero: el costo viene de privado para un contrato ya migrado', async () => {
  const guardados = [nuevo(CERRADO('c1', 400)), nuevo(CERRADO('c2', 250))];
  const nube = nubeEnMemoria({ contratos: guardados, privados: { c1: { costoDia: 400 }, c2: { costoDia: 250 } } });
  const f = cargarFalso(guardados);
  const r = await cargarContratosParaDinero({}, undefined, { cargar: f.cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });

  assert.deepEqual(r.datos.map((c) => c.subarriendo.costoDia), [400, 250]);
  assert.deepEqual(r.datos.map(costoDelSubarriendo), [1600, 1000]);
  assert.deepEqual(r.costoSinLeer, []);
  assert.equal(r.fallo, false);
  assert.equal(cuentaDeDueno({ contratos: r.datos, pagos: [] }).totalPorPagar, 2600);
});

test('el área de dinero: un contrato viejo, que aún trae el costo adentro, sigue funcionando sin tocarlo', async () => {
  const antiguo = viejo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [antiguo] }); // ni siquiera tiene privado
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([antiguo]).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.equal(costoDelSubarriendo(r.datos[0]), 1600);
  assert.deepEqual(r.costoSinLeer, [], 'se leyó bien y ahí no había nada: eso no es un fallo');
});

test('el área de dinero: si están los dos, manda privado', async () => {
  const antiguo = viejo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [antiguo], privados: { c1: { costoDia: 300 } } });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([antiguo]).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.equal(r.datos[0].subarriendo.costoDia, 300);
});

test('el área de dinero: sin costo en ningún lado queda marcado «sin costo anotado» y no suma', async () => {
  const guardado = nuevo(CERRADO('c1', 400)); // ya migrado... pero privado no tiene nada
  const nube = nubeEnMemoria({ contratos: [guardado] });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([guardado]).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.equal(traeCostoDia(r.datos[0]), false, 'no se le inventa un costo');
  const cuenta = cuentaDeDueno({ contratos: r.datos, pagos: [] });
  assert.deepEqual(cuenta.sinCostoAnotado, ['c1'], 'la marca que ya existe en liquidacion.js');
  assert.equal(cuenta.totalPorPagar, 0);
  assert.deepEqual(r.costoSinLeer, [], 'se leyó bien: no hay nada que NO se pudiera leer');
});

test('el área de dinero: SIN credencial de dinero no se lee nada, no se finge Q0.00 y se dice por qué', async () => {
  const guardados = [nuevo(CERRADO('c1', 400)), viejo(CERRADO('c2', 250))];
  const nube = nubeEnMemoria({ contratos: guardados, privados: { c1: { costoDia: 400 } } });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso(guardados).cargar, iniciar: nube.iniciar, dbDinero: () => null,
  });
  assert.equal(nube.llamadas.length, 0, 'ni siquiera se intenta con la sesión normal: las reglas la rechazarían');
  assert.equal(r.datos.length, 2, 'los contratos siguen ahí: no se vacía la lista');
  assert.deepEqual(r.costoSinLeer, ['c1', 'c2'], 'los dos: no se pudo leer privado de ninguno');
  // c1 no trae el costo por dentro: cae en `sinCostoAnotado` solo, sin una marca paralela.
  // c2 es viejo: su costo está en el documento, que sí se pudo leer.
  const cuenta = cuentaDeDueno({ contratos: r.datos, pagos: [] });
  assert.deepEqual(cuenta.sinCostoAnotado, ['c1']);
  assert.equal(cuenta.totalPorPagar, 1000, 'solo suma lo que de verdad se pudo leer');
});

test('el área de dinero: si la lectura de UNO falla, ese queda como no leído y los demás se leen', async () => {
  const guardados = [nuevo(CERRADO('c1', 400)), nuevo(CERRADO('c2', 250))];
  const nube = nubeEnMemoria({
    contratos: guardados,
    privados: { c1: { costoDia: 400 }, c2: { costoDia: 250 } },
    fallan: [{ op: 'getDoc', ruta: 'contratos/c1/privado/dinero' }],
  });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso(guardados).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.deepEqual(r.costoSinLeer, ['c1']);
  assert.equal(r.datos[1].subarriendo.costoDia, 250);
  assert.deepEqual(cuentaDeDueno({ contratos: r.datos, pagos: [] }).sinCostoAnotado, ['c1']);
});

test('el área de dinero: lee privado con la base de DINERO, la única que las reglas dejan', async () => {
  const guardado = nuevo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [guardado], privados: { c1: { costoDia: 400 } } });
  await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([guardado]).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  const lecturas = nube.llamadas.filter(([op]) => op === 'getDoc');
  assert.equal(lecturas.length, 1);
  assert.equal(lecturas[0][2], 'dinero');
});

test('el área de dinero: con muchos contratos se leen todos, de a pocos a la vez', async () => {
  // Cada lectura corre con su límite de 8 segundos: pedirlas todas juntas haría
  // que las últimas vencieran esperando turno y se dieran por «no leídas».
  const guardados = Array.from({ length: 25 }, (_, i) => nuevo(CERRADO(`c${i}`, 100 + i)));
  const privados = Object.fromEntries(guardados.map((c, i) => [c.id, { costoDia: 100 + i }]));
  const nube = nubeEnMemoria({ contratos: guardados, privados, demoraMs: 2 });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso(guardados).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.deepEqual(r.costoSinLeer, []);
  assert.deepEqual(r.datos.map((c) => c.subarriendo.costoDia), guardados.map((_, i) => 100 + i), 'todos, y en su orden');
  assert.ok(nube.vuelo.maximo > 1, 'se leen en paralelo');
  assert.ok(nube.vuelo.maximo <= 10, `nunca más de 10 a la vez (hubo ${nube.vuelo.maximo})`);
});

test('el área de dinero: los carros propios no cuestan una lectura', async () => {
  const propio = nuevo(salidaPropia({ id: 'p1' }));
  const nube = nubeEnMemoria({ contratos: [propio] });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([propio]).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.equal(nube.llamadas.length, 0);
  assert.deepEqual(r.costoSinLeer, []);
});

test('el área de dinero: lo que no se pudo leer del contrato (fallo) se conserva, y la lista no se vacía', async () => {
  const guardado = nuevo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [guardado], privados: { c1: { costoDia: 400 } } });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([guardado], { fallo: true }).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.equal(r.fallo, true);
  assert.equal(r.datos.length, 1);
});

test('el área de dinero: pasa el rango a cargarContratos tal cual', async () => {
  const f = cargarFalso([]);
  await cargarContratosParaDinero({ desde: '2026-09-01', hasta: '2026-09-30' }, undefined, {
    cargar: f.cargar, iniciar: nubeEnMemoria().iniciar, dbDinero: () => null,
  });
  assert.deepEqual(f.pedidos[0].rango, { desde: '2026-09-01', hasta: '2026-09-30' });
});

test('el área de dinero: una lectura que no es lista LANZA, no se vuelve una lista vacía', async () => {
  // liquidacion.js lanza ante lo que no es lista; esta capa no lo ablanda a [].
  for (const mala of [undefined, null, 'x']) {
    await assert.rejects(
      cargarContratosParaDinero({}, undefined, {
        cargar: async () => ({ datos: mala, fallo: true }), iniciar: nubeEnMemoria().iniciar, dbDinero: () => null,
      }),
      (error) => error instanceof TypeError && /debe ser una lista/.test(error.message),
    );
  }
});

test('el área de dinero: mezcla sobre COPIAS — lo que devolvió la lectura local queda sin el costo', async () => {
  // La sincronía de fondo de cargarContratos puede escribir esos MISMOS
  // objetos a IndexedDB un instante después. Si aquí se les mezclara el costo
  // adentro, quedaría legible en la copia local sin credencial.
  const guardado = nuevo(CERRADO('c1', 400));
  const original = structuredClone(guardado);
  const nube = nubeEnMemoria({ contratos: [guardado], privados: { c1: { costoDia: 400 } } });
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso([guardado]).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.equal(r.datos[0].subarriendo.costoDia, 400);
  assert.deepEqual(guardado, original, 'el objeto que se le dio sigue igual');
  assert.equal(traeCostoDia(guardado), false);
});

test('el área de dinero: la sincronía de fondo también llega con el costo mezclado', async () => {
  const guardado = nuevo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [guardado], privados: { c1: { costoDia: 400 } } });
  const f = cargarFalso([guardado]);
  const llegadas = [];
  const avisado = new Promise((ok) => {
    cargarContratosParaDinero({}, (r) => { llegadas.push(r); ok(); }, {
      cargar: f.cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
    });
  });
  await new Promise((ok) => { setImmediate(ok); });
  // Lo que cargarContratos avisa cuando la nube trae algo distinto:
  f.pedidos[0].alLlegar({ datos: [guardado], fallo: false });
  await avisado;
  assert.equal(llegadas.length, 1);
  assert.equal(llegadas[0].datos[0].subarriendo.costoDia, 400);
  assert.deepEqual(llegadas[0].costoSinLeer, []);
});

test('de punta a punta: lo que guarda Sacar carro llega al área de dinero, y la copia local nunca lo vio', async () => {
  const nube = nubeEnMemoria();
  const copia = copiaLocalEnMemoria();
  await guardarContrato(devuelto(salidaAjena({ id: 'c1', costoDia: 400, dias: 4 })), {
    iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {}, numeroNuevo: async () => 1,
  });
  // `cargar` lee de la copia local, como la lectura real.
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: async () => ({ datos: await copia.leerCopia(), fallo: false }),
    iniciar: nube.iniciar,
    dbDinero: () => nube.dbDinero,
  });
  assert.equal(costoDelSubarriendo(r.datos[0]), 1600);
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'después de cargar para dinero, IndexedDB sigue sin el costo');
});

// ---------- La migración ----------

/** Una nube de antes de ADR-002, con tres contratos: dos ajenos viejos y uno propio; más uno ya migrado. */
function nubeDeAntes() {
  return nubeEnMemoria({
    contratos: [
      viejo(CERRADO('a', 400)),
      viejo(CERRADO('b', 250, 3)),
      viejo(salidaPropia({ id: 'p' })),
      nuevo(CERRADO('m', 300)),
    ],
    privados: { m: { costoDia: 300 } },
  });
}

const migrar = (nube, extra = {}) => migrarCostosDelDueno({
  iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, leerCopia: async () => [], guardarCopia: async () => {}, ...extra,
});

test('migración: copia el costo a privado, lo quita del documento (las dos llaves) y cuenta lo que movió', async () => {
  const nube = nubeDeAntes();
  const r = await migrar(nube);

  assert.equal(r.migrados, 2);
  assert.deepEqual(r.conflictos, []);
  assert.deepEqual(r.fallidos, []);
  assert.equal(r.revisados, 4);
  assert.equal(nube.leer('contratos/a/privado/dinero').costoDia, 400);
  assert.equal(nube.leer('contratos/b/privado/dinero').costoDia, 250);
  for (const id of ['a', 'b', 'p', 'm']) {
    assert.equal(traeCostoDia(nube.leer(`contratos/${id}`)), false, `el documento de ${id} ya no trae el costo`);
  }
  // Quedan idénticos a un contrato que se guarda hoy: ni un `subarriendo` vacío ni nada que lo delate.
  assert.deepEqual(nube.leer('contratos/a'), nuevo(CERRADO('a', 400)));
  assert.deepEqual(nube.leer('contratos/b'), nuevo(CERRADO('b', 250, 3)));
  // Y lo demás del contrato quedó como estaba.
  assert.equal(nube.leer('contratos/a').carroAjeno.dueno, 'Mario López');
  assert.equal(nube.leer('contratos/a').duenoId, 'd1');
  assert.equal(nube.leer('contratos/a').numero, 1);
  assert.equal(nube.leer('contratos/a').ajeno, true);
});

test('migración: usa la credencial de dinero para todo, y no toca el contrato ya migrado ni el propio', async () => {
  const nube = nubeDeAntes();
  await migrar(nube);
  assert.ok(nube.llamadas.every(([, , , , base]) => base === undefined || base === 'dinero'), 'ninguna escritura con la base normal');
  assert.ok(nube.llamadas.filter(([op]) => op === 'getDocs').every(([, , base]) => base === 'dinero'));
  assert.deepEqual(nube.escrituras().map(([, ruta]) => ruta).sort(), [
    'contratos/a', 'contratos/a/privado/dinero', 'contratos/b', 'contratos/b/privado/dinero',
  ]);
});

test('migración: las copias locales de OTRAS computadoras se limpian solas al leer el contrato ya migrado', async () => {
  // La migración solo puede limpiar la copia de ESTA computadora. Las demás
  // dependen de que `mezclar` (cache.js) deje ganar a la versión de la nube
  // aunque traiga el mismo sello `actualizado`, que es justo lo que pasa: el
  // documento migrado conserva su sello.
  const antiguo = viejo(CERRADO('a', 400));
  const nube = nubeEnMemoria({ contratos: [antiguo] });
  await migrar(nube);
  const enLaNube = nube.leer('contratos/a');
  assert.equal(enLaNube.actualizado, antiguo.actualizado, 'el sello no cambió');
  const copiaViejaDeOtraComputadora = mezclar([antiguo], [enLaNube]);
  assert.equal(traeCostoDia(copiaViejaDeOtraComputadora), false);
});

test('migración: se puede correr dos veces — la segunda no encuentra nada ni escribe nada', async () => {
  const nube = nubeDeAntes();
  await migrar(nube);
  const despues = structuredClone([...nube.docs]);
  nube.llamadas.length = 0;

  const segunda = await migrar(nube);
  assert.equal(segunda.migrados, 0);
  assert.deepEqual(nube.escrituras(), [], 'no escribió nada');
  assert.deepEqual([...nube.docs], despues, 'la nube quedó idéntica');
  assert.match(mensajeDeMigracion(segunda), /No había nada que mover/);
});

test('migración: lo que el dueño vio no cambia — cada contrato da el mismo costo antes y después', async () => {
  const antes = [viejo(CERRADO('a', 400)), viejo(CERRADO('b', 250, 3))];
  const nube = nubeEnMemoria({ contratos: antes });
  await migrar(nube);
  const despues = ['a', 'b'].map((id) => nube.leer(`contratos/${id}`));
  const r = await cargarContratosParaDinero({}, undefined, {
    cargar: cargarFalso(despues).cargar, iniciar: nube.iniciar, dbDinero: () => nube.dbDinero,
  });
  assert.deepEqual(r.datos.map(costoDelSubarriendo), antes.map(costoDelSubarriendo));
  assert.deepEqual(r.datos.map((c) => resumen(c).utilidad), antes.map((c) => resumen(c).utilidad));
});

test('migración: lo que NO se pudo copiar no se borra del documento — el costo nunca queda en ningún lado', async () => {
  const nube = nubeDeAntes();
  nube.fallan.push({ op: 'setDoc', ruta: 'contratos/a/privado/dinero' });
  const r = await migrar(nube);

  assert.deepEqual(r.fallidos, [{ id: 'a', numero: 1 }]);
  assert.equal(r.migrados, 1, 'b sí se movió');
  assert.equal(nube.leer('contratos/a').subarriendo.costoDia, 400, 'a conserva su costo');
  assert.equal(nube.leer('contratos/a').carroAjeno.costoDia, 400);
  assert.equal(nube.leer('contratos/a/privado/dinero'), undefined);
  assert.equal(nube.escrituras('contratos/a').length, 0, 'ni siquiera intentó quitárselo');
});

test('migración: si se corta después de copiar, volver a correrla termina el trabajo', async () => {
  const nube = nubeDeAntes();
  nube.fallan.push({ op: 'updateDoc', ruta: 'contratos/a' });
  const primera = await migrar(nube);
  assert.deepEqual(primera.fallidos, [{ id: 'a', numero: 1 }]);
  assert.equal(nube.leer('contratos/a/privado/dinero').costoDia, 400, 'ya estaba copiado');
  assert.equal(nube.leer('contratos/a').subarriendo.costoDia, 400, 'y todavía en el documento: nada se perdió');

  nube.fallan.length = 0;
  const segunda = await migrar(nube);
  assert.equal(segunda.migrados, 1);
  assert.equal(traeCostoDia(nube.leer('contratos/a')), false);
  assert.equal(nube.leer('contratos/a/privado/dinero').costoDia, 400);
});

test('migración: un costo distinto en privado NO se pisa ni se borra — se avisa', async () => {
  const nube = nubeEnMemoria({
    contratos: [viejo(CERRADO('a', 400))],
    privados: { a: { costoDia: 300 } },
  });
  const r = await migrar(nube);
  assert.deepEqual(r.conflictos, [{ id: 'a', numero: 1 }]);
  assert.equal(r.migrados, 0);
  assert.equal(nube.leer('contratos/a/privado/dinero').costoDia, 300);
  assert.equal(nube.leer('contratos/a').subarriendo.costoDia, 400);
  assert.match(mensajeDeMigracion(r), /N° 1/);
});

test('migración: dos costos distintos dentro del mismo documento tampoco se adivinan', async () => {
  const raro = viejo(CERRADO('a', 400));
  raro.carroAjeno.costoDia = 350;
  const nube = nubeEnMemoria({ contratos: [raro] });
  const r = await migrar(nube);
  assert.deepEqual(r.conflictos, [{ id: 'a', numero: 1 }]);
  assert.equal(nube.escrituras().length, 0);
});

test('migración: si privado ya tiene el mismo costo (un guardado lo copió), solo se quita del documento', async () => {
  const nube = nubeEnMemoria({ contratos: [viejo(CERRADO('a', 400))], privados: { a: { costoDia: 400 } } });
  const r = await migrar(nube);
  assert.equal(r.migrados, 1);
  assert.deepEqual(nube.escrituras().map(([op, ruta]) => [op, ruta]), [['updateDoc', 'contratos/a']], 'no vuelve a escribir privado');
  assert.equal(traeCostoDia(nube.leer('contratos/a')), false);
});

test('migración: un contrato sin costo en ningún lado no se cuenta ni se vuelve un cero guardado', async () => {
  const nube = nubeEnMemoria({ contratos: [nuevo(CERRADO('m', 300)), nuevo(salidaAjena({ id: 'n', costoDia: 0 })), viejo(salidaPropia({ id: 'p' }))] });
  const r = await migrar(nube);
  assert.equal(r.migrados, 0);
  assert.equal(nube.leer('contratos/m/privado/dinero'), undefined, 'no se inventó un privado para el que no tenía costo');
  assert.equal(nube.escrituras().length, 0);
});

test('migración: un costo de 0 que sí estaba guardado se mueve igual que cualquier otro', async () => {
  const nube = nubeEnMemoria({ contratos: [viejo(CERRADO('a', 0))] });
  const r = await migrar(nube);
  assert.equal(r.migrados, 1);
  assert.equal(nube.leer('contratos/a/privado/dinero').costoDia, 0);
  assert.equal(traeCostoDia(nube.leer('contratos/a')), false);
});

test('migración: sin sesión de dinero LANZA y no toca nada', async () => {
  const nube = nubeDeAntes();
  await assert.rejects(migrar(nube, { dbDinero: () => null }), { message: MENSAJE_MIGRAR_SIN_DINERO });
  assert.equal(nube.llamadas.length, 0);
});

test('migración: si no se pudieron LEER los contratos, lanza — no dice "0 migrados"', async () => {
  const nube = nubeDeAntes();
  nube.fallan.push({ op: 'getDocs' });
  await assert.rejects(migrar(nube), /sin internet/);
  assert.equal(nube.escrituras().length, 0);
});

test('migración: lee los contratos de la NUBE, no de la copia local, que puede traer solo algunos meses', async () => {
  const nube = nubeDeAntes();
  await migrar(nube, { leerCopia: async () => assert.fail('no debe decidir qué migrar con la copia local') });
  assert.equal(nube.llamadas.filter(([op]) => op === 'getDocs').length, 1);
});

test('migración: limpia el costo de la copia local de ESTA computadora — mover solo en la nube sería de adorno', async () => {
  const nube = nubeDeAntes();
  const copia = copiaLocalEnMemoria([viejo(CERRADO('a', 400)), viejo(CERRADO('b', 250, 3)), viejo(salidaPropia({ id: 'p' }))]);
  assert.equal(traeCostoDia([...copia.guardados.values()]), true, 'punto de partida: la copia local sí lo trae');
  const r = await migrar(nube, { leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia });
  assert.equal(r.copiaLocalLimpia, true);
  assert.equal(traeCostoDia([...copia.guardados.values()]), false);
  assert.equal(copia.guardados.get('a').carroAjeno.dueno, 'Mario López', 'solo se le quitó el costo');
});

test('migración: lo que no se pudo mover conserva su copia local, igual que su documento', async () => {
  const nube = nubeDeAntes();
  nube.fallan.push({ op: 'setDoc', ruta: 'contratos/a/privado/dinero' });
  const copia = copiaLocalEnMemoria([viejo(CERRADO('a', 400)), viejo(CERRADO('b', 250, 3))]);
  await migrar(nube, { leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia });
  assert.equal(traeCostoDia(copia.guardados.get('a')), true);
  assert.equal(traeCostoDia(copia.guardados.get('b')), false);
});

test('migración: si la copia local no se puede limpiar, lo migrado sigue migrado y se dice', async () => {
  const nube = nubeDeAntes();
  const copia = copiaLocalEnMemoria([viejo(CERRADO('a', 400))]);
  const r = await migrar(nube, {
    leerCopia: copia.leerCopia,
    guardarCopia: async () => { throw new Error('VersionError'); },
  });
  assert.equal(r.migrados, 2);
  assert.equal(r.copiaLocalLimpia, false);
  assert.match(mensajeDeMigracion(r), /copia de esta computadora/);
  // Una segunda corrida, ya con la copia local en orden, termina de limpiarla.
  const segunda = await migrar(nube, { leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia });
  assert.equal(segunda.copiaLocalLimpia, true);
  assert.equal(traeCostoDia(copia.guardados.get('a')), false);
});

test('migración: va avisando cuántos lleva', async () => {
  const nube = nubeDeAntes();
  const avances = [];
  await migrar(nube, { alAvanzar: (hechos, total) => avances.push([hechos, total]) });
  assert.deepEqual(avances, [[1, 2], [2, 2]]);
});

test('mensajeDeMigracion: dice cuántos movió, con su plural, y qué hacer con los que no', () => {
  assert.equal(mensajeDeMigracion({ migrados: 1 }), 'Se movió 1 contrato detrás de la contraseña de dinero.');
  assert.equal(mensajeDeMigracion({ migrados: 12 }), 'Se movieron 12 contratos detrás de la contraseña de dinero.');
  assert.match(mensajeDeMigracion({ migrados: 0 }), /No había nada que mover/);
  const conFallos = mensajeDeMigracion({ migrados: 3, fallidos: [{ id: 'x', numero: 8 }, { id: 'y', numero: null }] });
  assert.match(conFallos, /^Se movieron 3 contratos/);
  assert.match(conFallos, /N° 8, sin número/);
  assert.match(conFallos, /vuelve a correrlo/);
  // Con algo pendiente NO dice "no había nada que mover".
  assert.doesNotMatch(mensajeDeMigracion({ migrados: 0, fallidos: [{ id: 'x', numero: 8 }] }), /No había nada/);
});
