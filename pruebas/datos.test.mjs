// Pruebas de la parte pura de la capa de datos: las reglas que deciden qué
// se le entrega a la pantalla, sin tocar Firestore ni IndexedDB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resultadoLectura, contratoParaGuardar, guardarContrato, duenoParaGuardar, guardarEnNubeYLocal,
  costoDelDocumento, sinCostoDelDueno, conCostoDelDueno, cargarContratosParaDinero,
  cargarContratos, cargarContratosAbiertos, limpiarCopiaLocalDelCosto, MARCA_COPIA_SIN_COSTO,
  migrarCostosDelDueno, mensajeDeMigracion, MENSAJE_MIGRAR_SIN_DINERO,
  pagoDuenoParaGuardar, construirPagoDueno, guardarPagoDueno, cargarPagosDueno, siguienteNumeroComprobante,
  nuevoIdPagoDueno, MENSAJE_PAGO_SIN_DINERO, MENSAJE_PAGO_SIN_RENTAS, MENSAJE_PAGO_SIN_ID, MENSAJE_PAGO_SIN_MONTO,
} from '../js/datos.js';
import { CAMPOS_DUENO } from '../js/nucleo/dueno.js';
import { mezclar } from '../js/cache.js';
import { resumen } from '../js/nucleo/contrato.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { costoDelSubarriendo, cuentaDeDueno, totalSeleccionado } from '../js/nucleo/liquidacion.js';
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
    ['guardarCliente', 'guardarContrato', 'guardarDueno', 'guardarPagoDueno', 'guardarReserva', 'guardarVehiculo'],
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

/**
 * Un contrato como lo recibe de verdad el área de dinero: el documento TAL COMO
 * SE GUARDA (`nuevo`: sin el costo, en ninguna de sus dos llaves) con el costo
 * que dijo `privado` puesto por el puente de lectura (`conCostoDelDueno`). No la
 * forma en memoria de `construirContrato`, que todavía trae `carroAjeno.costoDia`:
 * con ella las pruebas del dinero dependerían de un campo que el área de dinero
 * ya nunca recibe.
 */
const paraDinero = (c, costoPrivado) => conCostoDelDueno(nuevo(c), costoPrivado);

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
  contratos = [], privados = {}, fallan = [], demoraMs = 0, pagosDueno = [], contadores = {},
} = {}) {
  const docs = new Map();
  for (const c of contratos) docs.set(`contratos/${c.id}`, structuredClone(sinId(c)));
  for (const [id, datos] of Object.entries(privados)) docs.set(`contratos/${id}/privado/dinero`, structuredClone(datos));
  for (const p of pagosDueno) docs.set(`pagosDueno/${p.id}`, structuredClone(p));
  for (const [id, datos] of Object.entries(contadores)) docs.set(`contadores/${id}`, structuredClone(datos));
  // Cuántas veces se escribió cada documento: lo que `runTransaction` mira para
  // saber si alguien más lo tocó entre su lectura y su escritura.
  const versiones = new Map();
  const subir = (ruta) => versiones.set(ruta, (versiones.get(ruta) ?? 0) + 1);
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
    // Una consulta con `where`, como la de cargarContratos por rango de fechas.
    where: (campo, operador, valor) => ({ campo, operador, valor }),
    query: (col, ...restricciones) => ({ ...col, restricciones }),
    getDocs: async (col) => {
      llamadas.push(['getDocs', col.coleccion, col.db.nombre]);
      if (falla('getDocs', col.coleccion)) throw new Error('sin internet');
      const cumple = (datos) => (col.restricciones ?? []).every(({ campo, operador, valor }) => (
        operador === '>=' ? datos[campo] >= valor : datos[campo] <= valor
      ));
      // Las reglas: `pagosDueno` solo se lee con la credencial de dinero.
      if (col.coleccion === 'pagosDueno' && !col.db.esDinero) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      return {
        docs: [...docs]
          .filter(([ruta]) => ruta.startsWith(`${col.coleccion}/`) && ruta.split('/').length === 2)
          .filter(([, datos]) => cumple(datos))
          .map(([ruta, datos]) => ({ id: ruta.split('/')[1], data: () => structuredClone(datos) })),
      };
    },
    setDoc: async (ref, datos, opciones) => {
      llamadas.push(['setDoc', ref.ruta, structuredClone(datos), opciones, ref.db.nombre]);
      if (falla('setDoc', ref.ruta)) throw new Error('sin internet');
      // Las reglas: `pagosDueno` solo se escribe con la credencial de dinero.
      if (ref.ruta.startsWith('pagosDueno/') && !ref.db.esDinero) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      if (opciones?.merge && docs.has(ref.ruta)) fusionar(docs.get(ref.ruta), structuredClone(datos));
      else docs.set(ref.ruta, structuredClone(datos));
      subir(ref.ruta);
    },
    /**
     * Una transacción como la de Firestore: la función corre, y al terminar solo
     * se escribe si ningún documento que LEYÓ cambió mientras tanto; si cambió,
     * se vuelve a correr desde cero. Es lo que hace que dos pestañas tomando el
     * siguiente número a la vez no se lleven el mismo. Cada lectura cede el turno,
     * para que dos transacciones lanzadas juntas de verdad se crucen.
     */
    runTransaction: async (db, funcion) => {
      for (let intento = 0; intento < 5; intento += 1) {
        const leidos = new Map();
        const escritos = new Map();
        const tx = {
          get: async (ref) => {
            llamadas.push(['tx.get', ref.ruta, db.nombre]);
            if (falla('tx.get', ref.ruta)) throw new Error('sin internet');
            leidos.set(ref.ruta, versiones.get(ref.ruta) ?? 0);
            await Promise.resolve();
            const datos = docs.get(ref.ruta);
            return { exists: () => datos !== undefined, data: () => structuredClone(datos) };
          },
          set: (ref, datos) => { escritos.set(ref.ruta, structuredClone(datos)); },
        };
        const resultado = await funcion(tx);
        const alguienLoCambio = [...leidos].some(([ruta, version]) => (versiones.get(ruta) ?? 0) !== version);
        if (alguienLoCambio) continue;
        for (const [ruta, datos] of escritos) {
          llamadas.push(['tx.set', ruta, structuredClone(datos), db.nombre]);
          docs.set(ruta, datos);
          subir(ruta);
        }
        return resultado;
      }
      throw new Error('La transacción no pudo terminar: otro la ganó demasiadas veces.');
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
    borrarCopia: async (_coleccion, ids) => { for (const id of ids) guardados.delete(id); },
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
  // La migración es a mano, una vez, y alguien la ve correr. Guardar un contrato
  // que ya existía (cobrar el saldo, recibir el carro) no escribe su costo en
  // `privado` ni le borra al documento lo que ya tenía en la nube (set con merge
  // no borra campos): el costo se queda donde está hasta que la migración lo mueva.
  const antiguo = viejo(salidaAjena({ id: 'c1', costoDia: 400 }));
  const nube = nubeEnMemoria({ contratos: [antiguo] });
  const copia = copiaLocalEnMemoria();
  await guardarYMirar({ ...antiguo, observaciones: 'cobró el saldo' }, nube, copia);
  assert.equal(nube.leer('contratos/c1/privado/dinero'), undefined, 'privado no se tocó');
  assert.equal(nube.leer('contratos/c1').subarriendo.costoDia, 400, 'sigue en el documento hasta que se corra la migración');
  assert.equal(nube.leer('contratos/c1').observaciones, 'cobró el saldo', 'y el guardado en sí sí se hizo');
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'pero lo que se escribe a la copia local ya no lo lleva');
});

// ---------- `privado` manda también al guardar (M2 de la revisión) ----------
//
// Al LEER manda `privado` (el puente, `conCostoDelDueno`) y la migración no pisa
// un costo distinto en `privado` (lo deja como conflicto, para revisarlo). Pero
// `guardarContrato` hacía lo contrario: el costo que traía el documento se
// escribía encima de `privado`, y un conflicto que la migración había dejado
// para revisar se resolvía en silencio, a favor del documento, la siguiente vez
// que el mostrador guardaba cualquier cobro. La sesión normal no puede LEER
// `privado` (las reglas), así que no puede saber qué hay ahí: por eso un contrato
// que ya existía nunca escribe su costo en `privado`. Solo lo hace la primera vez
// que se guarda (Sacar carro, donde `privado` está vacío por construcción) y lo
// hace la migración, que sí lo lee antes de tocar nada.

test('M2: guardar un contrato que ya existía NO pisa lo que hay en privado, aunque el documento traiga otro costo', async () => {
  const antiguo = viejo(salidaAjena({ id: 'c1', costoDia: 400 })); // el documento dice 400…
  const nube = nubeEnMemoria({ contratos: [antiguo], privados: { c1: { costoDia: 450 } } }); // …y privado dice 450
  await guardarYMirar({ ...antiguo, observaciones: 'cobró el saldo' }, nube);
  assert.equal(nube.leer('contratos/c1/privado/dinero').costoDia, 450, 'manda privado');
  assert.deepEqual(nube.escrituras().map(([, ruta]) => ruta), ['contratos/c1'], 'privado ni se escribió');
});

test('M2: un guardado ordinario no resuelve en silencio el conflicto que dejó la migración', async () => {
  const antiguo = viejo(CERRADO('a', 400));
  const nube = nubeEnMemoria({ contratos: [antiguo], privados: { a: { costoDia: 450 } } });
  const antes = await migrar(nube);
  assert.deepEqual(antes.conflictos, [{ id: 'a', numero: 1 }], 'punto de partida: un conflicto para revisar');

  await guardarYMirar({ ...nube.leer('contratos/a'), observaciones: 'cobró el saldo' }, nube);

  assert.equal(nube.leer('contratos/a/privado/dinero').costoDia, 450);
  const despues = await migrar(nube);
  assert.deepEqual(despues.conflictos, [{ id: 'a', numero: 1 }], 'sigue siendo un conflicto: nadie lo decidió');
  assert.equal(despues.migrados, 0);
});

test('M2: la primera vez que se guarda un contrato nuevo sí escribe su costo en privado, y un reintento cae en el mismo lugar', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'setDoc', ruta: 'contratos/c1' }] });
  const contrato = salidaAjena({ id: 'c1', costoDia: 400 });
  assert.equal('actualizado' in contrato, false, 'punto de partida: un contrato recién armado no trae sello');

  await assert.rejects(guardarYMirar(contrato, nube), /sin internet/);
  assert.equal(nube.leer('contratos/c1/privado/dinero').costoDia, 400, 'privado quedó escrito aunque el contrato no');
  // Sacar carro reintenta con el MISMO contrato en memoria (guardarContrato no lo muta).
  nube.fallan.length = 0;
  await guardarYMirar(contrato, nube);

  assert.deepEqual(nube.leer('contratos/c1/privado/dinero'), { id: 'c1', costoDia: 400 });
  assert.ok(nube.leer('contratos/c1'), 'y ahora el contrato también');
  assert.equal(traeCostoDia(nube.leer('contratos/c1')), false);
});

test('M2: un contrato que ya existía y NO trae costo sigue sin tocar privado (como antes)', async () => {
  const migrado = nuevo(salidaAjena({ id: 'c1', costoDia: 400 }));
  const nube = nubeEnMemoria({ contratos: [migrado], privados: { c1: { costoDia: 450 } } });
  await guardarYMirar({ ...migrado, observaciones: 'x' }, nube);
  assert.equal(nube.leer('contratos/c1/privado/dinero').costoDia, 450);
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

// ---------- La copia local nunca guarda el costo, y el área de dinero no lo lee de ahí (C1) ----------
//
// ADR-002 promete que un contrato migrado deja de exponer el costo a quien solo
// tenga la sesión normal. La revisión lo desmintió contra IndexedDB de verdad: la
// computadora del mostrador, que corrió el sistema meses antes de ADR-002, guarda
// el costo de todos los subarriendos viejos, la migración (que corre en la
// computadora del dueño) no la toca, y solo se limpia de los meses que vuelva a
// abrir. La regla que decidió el dueño del proyecto: la copia local NUNCA guarda el
// costo de un subarriendo, en ninguna computadora, haya corrido la migración o no.
// Tres piezas que se sostienen una a la otra, y cada una tiene su prueba:
//   1. el área de dinero lee el costo de la NUBE y no de la copia local, para que
//      limpiar la copia no esconda un costo que aún no se migró;
//   2. sincronizar no vuelve a escribir en la copia local el costo que una nube sin
//      migrar todavía trae;
//   3. al arrancar se limpia lo que ya estaba guardado (`limpiarCopiaLocalDelCosto`).
//
// QUÉ CUBREN: la lógica, con una nube y una copia local de mentira. NO cubren que
// IndexedDB de verdad guarde, lea y borre así, ni que `app.js` llame a la limpieza
// al arrancar con un navegador real: eso se miró en un navegador (ver el reporte).

/** Todo lo que las lecturas de contratos reciben de afuera: la nube, la sesión de dinero y la copia local de mentira. */
const conLaNube = (nube, copia) => ({
  iniciar: nube.iniciar,
  dbDinero: () => nube.dbDinero,
  leerCopia: copia.leerCopia,
  guardarCopia: copia.guardarCopia,
  borrarCopia: copia.borrarCopia,
});

/** La copia local con una lectura contada, para afirmar que NO se leyó. */
const copiaContada = (iniciales) => {
  const copia = copiaLocalEnMemoria(iniciales);
  const leidas = { veces: 0 };
  return { ...copia, leidas, leerCopia: async (...a) => { leidas.veces += 1; return copia.leerCopia(...a); } };
};

test('C1: el área de dinero lee el costo de la NUBE — una copia local ya limpiada no esconde un costo que aún no se migró', async () => {
  const antiguo = viejo(CERRADO('c1', 400)); // la nube todavía lo trae en el documento, y privado está vacío
  const nube = nubeEnMemoria({ contratos: [antiguo] });
  // Esta computadora ya se limpió: su copia no trae el costo, y trae el MISMO sello.
  const copia = copiaContada([sinCostoDelDueno(antiguo)]);
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'punto de partida: la copia local ya está limpia');

  const r = await cargarContratosParaDinero({}, undefined, conLaNube(nube, copia));

  assert.equal(costoDelSubarriendo(r.datos[0]), 1600, 'la deuda real sigue viéndose: el costo salió del documento en la nube');
  assert.deepEqual(cuentaDeDueno({ contratos: r.datos, pagos: [] }).sinCostoAnotado, []);
  assert.deepEqual(r.costoSinLeer, []);
  assert.equal(r.fallo, false);
});

test('C1: el área de dinero NO lee la copia local — lo que esa copia diga del costo (viejo, sin limpiar) no cuenta', async () => {
  const nube = nubeEnMemoria({ contratos: [viejo(CERRADO('c1', 400))] }); // la nube dice 400
  const copia = copiaContada([viejo(CERRADO('c1', 999))]); // una copia vieja y sin limpiar dice 999
  const r = await cargarContratosParaDinero({}, undefined, conLaNube(nube, copia));
  assert.equal(r.datos[0].subarriendo.costoDia, 400);
  assert.equal(copia.leidas.veces, 0, 'ni siquiera se abrió la copia local');
  assert.equal(nube.llamadas.filter(([op]) => op === 'getDocs').length, 1, 'de la nube sí');
});

test('C1: el costo de privado, ya migrado, también sale de la nube — y la copia local no se escribe', async () => {
  const guardado = nuevo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [guardado], privados: { c1: { costoDia: 400 } } });
  const copia = copiaContada([]);
  const r = await cargarContratosParaDinero({}, undefined, conLaNube(nube, copia));
  assert.equal(costoDelSubarriendo(r.datos[0]), 1600);
  assert.equal(copia.guardados.size, 0, 'cargar para dinero no deja nada en IndexedDB');
});

test('C1: el área de dinero pide a la nube solo el rango de fechas que se le pidió', async () => {
  const septiembre = nuevo(CERRADO('c1', 400)); // fechaSalida 2026-09-01
  const octubre = { ...nuevo(CERRADO('c2', 250)), fechaSalida: '2026-10-05' };
  const nube = nubeEnMemoria({ contratos: [septiembre, octubre], privados: { c1: { costoDia: 400 }, c2: { costoDia: 250 } } });
  const r = await cargarContratosParaDinero({ desde: '2026-09-01', hasta: '2026-09-30' }, undefined, conLaNube(nube, copiaContada([])));
  assert.deepEqual(r.datos.map((c) => c.id), ['c1']);
});

test('C1: si la nube no contesta se ven los contratos de la copia local pero SIN costo, y se avisa (fallo) — ni lista vacía ni un costo viejo', async () => {
  const nube = nubeEnMemoria({
    contratos: [viejo(CERRADO('c1', 400))],
    fallan: [{ op: 'getDocs', ruta: 'contratos' }, { op: 'getDoc', ruta: 'contratos/c1/privado/dinero' }],
  });
  // Una copia local de una computadora que todavía no se limpió: trae el costo.
  const copia = copiaContada([viejo(CERRADO('c1', 400)), { ...viejo(CERRADO('c9', 100)), fechaSalida: '2026-12-01' }]);

  const r = await cargarContratosParaDinero({ desde: '2026-09-01', hasta: '2026-09-30' }, undefined, conLaNube(nube, copia));

  assert.equal(r.fallo, true);
  assert.deepEqual(r.datos.map((c) => c.id), ['c1'], 'lo local del rango pedido, no una lista vacía');
  assert.equal(traeCostoDia(r.datos), false, 'el costo de la copia local no llega a la pantalla de dinero');
  assert.deepEqual(r.costoSinLeer, ['c1']);
  assert.deepEqual(cuentaDeDueno({ contratos: r.datos, pagos: [] }).sinCostoAnotado, ['c1'], 'sin costo, no se puede pagar');
  assert.equal(traeCostoDia([...copia.guardados.values()]), true, 'y esta lectura no tocó la copia local');
});

test('C1: sincronizar contratos de una nube SIN migrar no escribe el costo en la copia local', async () => {
  const antiguos = [viejo(CERRADO('c1', 400)), viejo(CERRADO('c2', 250))];
  const nube = nubeEnMemoria({ contratos: antiguos });
  const copia = copiaLocalEnMemoria();

  const r = await cargarContratos({}, undefined, conLaNube(nube, copia));

  assert.equal(r.datos.length, 2, 'primera vez en esta computadora: se esperó a la nube');
  assert.equal(copia.guardados.size, 2, 'los contratos sí quedaron en la copia local');
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'pero sin el costo del dueño, en ninguna de las dos llaves');
  // Y lo demás del contrato llegó completo.
  assert.equal(copia.guardados.get('c1').carroAjeno.dueno, 'Mario López');
  assert.equal(copia.guardados.get('c1').ajeno, true);
});

test('C1: la sincronía de FONDO de contratos tampoco lo escribe — ni sobre una copia local que ya estaba limpia', async () => {
  const antiguo = viejo(CERRADO('c1', 400));
  const nube = nubeEnMemoria({ contratos: [antiguo] });
  const copia = copiaLocalEnMemoria([sinCostoDelDueno(antiguo)]); // limpia, mismo sello: la nube lo reemplaza (mezclar)
  const escrita = new Promise((ok) => {
    cargarContratos({}, undefined, {
      ...conLaNube(nube, copia),
      guardarCopia: async (c, d) => { await copia.guardarCopia(c, d); ok(); },
    });
  });
  await escrita;
  assert.equal(traeCostoDia([...copia.guardados.values()]), false, 'la nube sin migrar no lo devuelve a IndexedDB');
});

test('C1: la lectura de contratos abiertos (la de la flota) tampoco lo escribe', async () => {
  const nube = nubeEnMemoria({ contratos: [viejo(salidaAjena({ id: 'c1', costoDia: 400 }))] });
  const copia = copiaLocalEnMemoria();
  const r = await cargarContratosAbiertos(undefined, conLaNube(nube, copia));
  assert.equal(r.datos.length, 1);
  assert.equal(traeCostoDia([...copia.guardados.values()]), false);
});

test('C1: lo que sincronizar le entrega a la pantalla no se mutó: la limpieza es solo de lo que se escribe a la copia local', async () => {
  const antiguo = viejo(salidaAjena({ id: 'c1', costoDia: 400 }));
  const nube = nubeEnMemoria({ contratos: [antiguo] });
  const entregado = await cargarContratos({}, undefined, conLaNube(nube, copiaLocalEnMemoria()));
  // Antes de ADR-002 la nube lo trae, y una sesión normal ya lo lee de ahí: no se esconde en memoria.
  assert.equal(entregado.datos[0].subarriendo.costoDia, 400);
});

// ---------- La limpieza de arranque ----------

test('limpiarCopiaLocalDelCosto: le pide a la copia local limpiar la colección entera, y una sola vez por computadora', async () => {
  const pedidos = [];
  await limpiarCopiaLocalDelCosto({ depurar: async (...a) => { pedidos.push(a); return { revisados: 0, cambiados: 0, yaHecha: false }; } });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0][0], 'contratos');
  assert.equal(pedidos[0][2].marca, MARCA_COPIA_SIN_COSTO, 'con marca: es lo que hace que corra una sola vez');
  assert.ok(MARCA_COPIA_SIN_COSTO.length > 0);
});

test('limpiarCopiaLocalDelCosto: lo que le manda a la copia local quita el costo de las dos llaves y deja lo demás', async () => {
  let limpiar;
  await limpiarCopiaLocalDelCosto({ depurar: async (_c, f) => { limpiar = f; } });

  const sucio = viejo(salidaAjena({ id: 'c1', costoDia: 400 }));
  const original = structuredClone(sucio);
  const limpio = limpiar(sucio);
  assert.equal(traeCostoDia(limpio), false);
  assert.equal(limpio.carroAjeno.dueno, 'Mario López');
  assert.equal(limpio.ajeno, true);
  assert.deepEqual(sucio, original, 'el documento que recibe no se muta');

  // Siempre devuelve un documento nuevo (nunca null) cuando había una llave de costo.
  const limpiado = (c) => {
    const r = limpiar(c);
    assert.ok(r, `no devolvió el documento limpio de ${JSON.stringify(c)}`);
    return r;
  };
  // Solo una de las dos llaves (la segunda copia que nadie leía, o la primera suelta).
  assert.equal(traeCostoDia(limpiado({ id: 'a', ajeno: true, carroAjeno: { placas: 'P-1', costoDia: 250 } })), false);
  assert.equal(traeCostoDia(limpiado({ id: 'b', ajeno: true, subarriendo: { costoDia: 250 } })), false);
  // Con la llave presente pero vacía o en cero, igual: lo que importa es que no quede ninguna.
  for (const costoDia of [0, '', null, 'abc']) {
    assert.equal(traeCostoDia(limpiado({ id: 'c', ajeno: true, subarriendo: { costoDia }, carroAjeno: { costoDia } })), false, `costoDia: ${String(costoDia)}`);
    assert.equal(traeCostoDia(limpiado({ id: 'd', ajeno: true, carroAjeno: { placas: 'P-1', costoDia } })), false, `solo carroAjeno, costoDia: ${String(costoDia)}`);
  }
});

test('limpiarCopiaLocalDelCosto: lo que ya está limpio, o es de un carro propio, no se vuelve a escribir (devuelve null)', async () => {
  let limpiar;
  await limpiarCopiaLocalDelCosto({ depurar: async (_c, f) => { limpiar = f; } });
  assert.equal(limpiar(nuevo(salidaAjena({ id: 'c1' }))), null);
  assert.equal(limpiar(nuevo(salidaPropia({ id: 'p1' }))), null);
  assert.equal(limpiar(viejo(salidaPropia({ id: 'p2' }))), null, 'subarriendo: null no es un costo');
  assert.equal(limpiar(null), null);
  assert.equal(limpiar({ id: 'x' }), null);
});

test('limpiarCopiaLocalDelCosto: si la copia local falla, el error SALE — sin marca, el siguiente arranque lo reintenta', async () => {
  const error = new Error('VersionError');
  await assert.rejects(limpiarCopiaLocalDelCosto({ depurar: async () => { throw error; } }), (e) => e === error);
});

test('estructura: app.js llama a limpiarCopiaLocalDelCosto al arrancar, sin esperar a ninguna sesión', () => {
  // NO es una prueba de comportamiento: lee el código fuente. app.js toca el DOM
  // y no se puede importar en Node; que de verdad corra al abrir el sistema se
  // miró en un navegador. Esto solo cuida que nadie quite la llamada sin querer.
  const fuente = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(fuente, /import \{[^}]*\blimpiarCopiaLocalDelCosto\b[^}]*\} from '\.\/datos\.js';/);
  const llamada = fuente.indexOf('limpiarCopiaLocalDelCosto()');
  assert.ok(llamada > 0, 'app.js no llama a limpiarCopiaLocalDelCosto()');
  assert.ok(llamada < fuente.indexOf('alCambiarSesion(('), 'debe correr antes de esperar la sesión: la copia local es de la computadora, no de quien entra');
  assert.match(fuente.slice(llamada, llamada + 200), /\.catch\(/, 'un fallo se avisa en consola; no revienta el arranque');
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

// ===========================================================================
// Los pagos a dueños de carros ajenos
// ===========================================================================
//
// La forma de un pago sale de §7 del diseño de la liquidación (que Tarea 11
// pasa a §7b del diseño general): `duenoId`, `fecha`, `forma`, `monto`,
// `contratos[]`, `numero`, `actualizado`, más el `id` del documento. Los
// contratos de estas pruebas son los mismos de arriba (`CERRADO`, `salidaAjena`,
// `devuelto`): salen de `construirContrato` y `construirCierre`, no están
// inventados. La Firestore es la de mentira de arriba, que ahora también sabe
// de `pagosDueno` (solo con la credencial de dinero, como la regla) y de
// transacciones (si alguien toca lo que se leyó, se repite). NO prueban a Firebase.

/** Los campos de un pago guardado, tal cual los lista §7 — y ninguno más. */
const CAMPOS_DE_UN_PAGO = ['actualizado', 'contratos', 'duenoId', 'fecha', 'forma', 'id', 'monto', 'numero'];

const pagoBase = {
  duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', monto: 2350, contratos: ['c1', 'c2'],
};

// ---------- pagoDuenoParaGuardar ----------

test('pagoDuenoParaGuardar: sella id, numero y actualizado, y deja los campos de §7 exactos', () => {
  const guardado = pagoDuenoParaGuardar(pagoBase, { id: 'p1', numero: 12, ahora: 1790000000000 });
  assert.deepEqual(guardado, {
    duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', monto: 2350, contratos: ['c1', 'c2'],
    id: 'p1', numero: 12, actualizado: 1790000000000,
  });
  assert.deepEqual(Object.keys(guardado).sort(), CAMPOS_DE_UN_PAGO, 'ni un nombre de campo distinto al de §7');
});

test('pagoDuenoParaGuardar: sin `ahora` el sello es la hora de ahora, no vacío', () => {
  const antes = Date.now();
  const { actualizado } = pagoDuenoParaGuardar(pagoBase, { id: 'p1', numero: 1 });
  assert.ok(actualizado >= antes && actualizado <= Date.now());
});

test('pagoDuenoParaGuardar: el monto pasa por q() — nunca queda un decimal de la suma binaria', () => {
  const monto = (valor) => pagoDuenoParaGuardar({ ...pagoBase, monto: valor }, { id: 'p1', numero: 1 }).monto;
  assert.equal(monto(0.1 + 0.2), 0.3, '0.1 + 0.2 da 0.30000000000000004 sin q()');
  assert.equal(monto(1600 + 750.004), 2350);
  assert.equal(monto(1500.005), 1500.01, 'q() redondea el medio centavo hacia arriba, como en todo el sistema');
  assert.equal(monto('2350.50'), 2350.5, 'un texto de un formulario también');
  assert.equal(monto(undefined), 0, 'q() lee lo vacío como 0 (y guardarPagoDueno no deja guardar un pago sin rentas)');
  assert.equal(monto(NaN), 0);
});

test('pagoDuenoParaGuardar: contratos[] nunca queda undefined, y no comparte la lista con quien la pasó', () => {
  const sin = (contratos) => pagoDuenoParaGuardar({ ...pagoBase, contratos }, { id: 'p1', numero: 1 }).contratos;
  assert.deepEqual(sin(undefined), []);
  assert.deepEqual(sin(null), []);
  assert.deepEqual(sin('c1'), [], 'un texto no es una lista de contratos');
  assert.deepEqual(sin([]), []);

  const original = ['c1', 'c2'];
  const guardado = pagoDuenoParaGuardar({ ...pagoBase, contratos: original }, { id: 'p1', numero: 1 });
  original.push('c3');
  assert.deepEqual(guardado.contratos, ['c1', 'c2'], 'lo que se guarda no cambia si la pantalla sigue marcando casillas');
  assert.ok('contratos' in pagoDuenoParaGuardar({ duenoId: 'd1' }, { id: 'p1', numero: 1 }), 'ni siquiera sin la clave');
});

test('pagoDuenoParaGuardar: un pago que ya existe conserva su id y su numero, pase lo que pase', () => {
  const existente = { ...pagoBase, id: 'p7', numero: 12, actualizado: 100 };
  // Como lo llama guardarPagoDueno: ya trae el numero, y el id es el de la referencia.
  const igual = pagoDuenoParaGuardar(existente, { id: 'p7', numero: 12, ahora: 200 });
  assert.equal(igual.id, 'p7');
  assert.equal(igual.numero, 12);
  // Pero si quien llama pasa OTRO numero (un contador que avanzó), el comprobante
  // que el dueño del carro ya tiene en papel no cambia de número.
  const otroNumero = pagoDuenoParaGuardar(existente, { id: 'p7', numero: 99, ahora: 200 });
  assert.equal(otroNumero.numero, 12, 'un comprobante que se renumera solo es peor que ninguno');
  // Ni se pierde el id si se olvida pasarlo: un pago sin id es un documento nuevo, o sea un duplicado.
  assert.equal(pagoDuenoParaGuardar(existente, { numero: 12, ahora: 200 }).id, 'p7');
  // Uno nuevo, sin numero, recibe el que se le da.
  assert.equal(pagoDuenoParaGuardar(pagoBase, { id: 'p8', numero: 13 }).numero, 13);
});

test('pagoDuenoParaGuardar: `actualizado` se sella, no se copia del pago que llega', () => {
  const guardado = pagoDuenoParaGuardar({ ...pagoBase, actualizado: 5 }, { id: 'p1', numero: 1, ahora: 9 });
  assert.equal(guardado.actualizado, 9);
});

test('pagoDuenoParaGuardar: no modifica el pago que recibe, y lo que no conoce sobrevive', () => {
  const entrada = { ...pagoBase, campoQueNadieConoce: 'x' };
  const copia = structuredClone(entrada);
  const guardado = pagoDuenoParaGuardar(entrada, { id: 'p1', numero: 1, ahora: 1 });
  assert.deepEqual(entrada, copia);
  assert.equal(guardado.campoQueNadieConoce, 'x');
});

// ---------- construirPagoDueno: monto y contratos nacen de la misma lista ----------

// Seis contratos de ajeno y uno propio, de dos dueños en la vida real pero aquí
// de uno solo (la ficha de un dueño trae solo los suyos):
//   c1  cerrado, Q400 × 4 días  = Q1,600   por pagar
//   c2  cerrado, Q250 × 3 días  =   Q750   por pagar
//   c3  el carro sigue afuera   = (Q300 × 4 = Q1,200 cuando cierre) aún no cierra
//   c4  cerrado, Q100 × 4 días  =   Q400   YA pagado por el pago p1
//   c5  cerrado, Q500 × 2 días  = Q1,000   por pagar
// y p9, un carro propio cerrado, que no le debe nada a nadie.
const SELECCION = {
  contratos: [
    paraDinero(CERRADO('c1', 400, 4), 400),
    paraDinero(CERRADO('c2', 250, 3), 250),
    paraDinero(salidaAjena({ id: 'c3', costoDia: 300 }), 300),
    paraDinero(CERRADO('c4', 100, 4), 100),
    paraDinero(CERRADO('c5', 500, 2), 500),
    paraDinero(devuelto(salidaPropia({ id: 'p9' }))),
  ],
  pagos: [pagoDuenoParaGuardar(
    { duenoId: 'd1', fecha: '2026-09-10', forma: 'efectivo', monto: 400, contratos: ['c4'] },
    { id: 'p1', numero: 1, ahora: 1790000000000 },
  )],
};
const TODOS_LOS_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'p9', 'no-existe'];

const construirDe = (idsMarcados, extra = {}) => construirPagoDueno({
  duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', ...SELECCION, idsMarcados, ...extra,
});

test('los contratos de estas pruebas son los que recibe el área de dinero: sin carroAjeno.costoDia, con el costo del puente', () => {
  const ajenos = SELECCION.contratos.filter((c) => c.ajeno);
  assert.equal(ajenos.length, 5);
  for (const c of ajenos) {
    assert.equal('costoDia' in c.carroAjeno, false, `${c.id}: la segunda copia del costo no llega al área de dinero`);
    assert.equal(typeof c.subarriendo.costoDia, 'number', `${c.id}: el costo lo puso el puente de lectura`);
    assert.equal(typeof c.actualizado, 'number', `${c.id}: es un documento guardado, con su sello`);
  }
});

test('construirPagoDueno: el pago de lo marcado lleva su monto exacto y sus ids, en el orden de la lista', () => {
  assert.deepEqual(construirDe(['c2', 'c1']), {
    duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', monto: 2350, contratos: ['c1', 'c2'],
  });
  // Un Set marcado a mano da lo mismo que un arreglo.
  assert.deepEqual(construirDe(new Set(['c5'])).monto, 1000);
});

test('construirPagoDueno: una casilla vieja sobre un contrato que aún no cierra no mueve ni dinero ni id', () => {
  const pago = construirDe(['c1', 'c3']);
  assert.deepEqual(pago.contratos, ['c1'], 'c3 no pasa al bloque de «pagado»');
  assert.equal(pago.monto, 1600, 'y tampoco suma Q1,200 que todavía se pueden mover');
  assert.equal(estadoContrato(SELECCION.contratos[2]), 'rentado', 'el carro de c3 sigue afuera');
});

test('construirPagoDueno: un contrato ya pagado, aunque su casilla siga marcada, no se vuelve a pagar', () => {
  const pago = construirDe(['c4', 'c5']);
  assert.deepEqual(pago.contratos, ['c5']);
  assert.equal(pago.monto, 1000);
});

test('construirPagoDueno: un id que no existe, o un carro propio, no entran', () => {
  const pago = construirDe(['p9', 'no-existe', 'c2']);
  assert.deepEqual(pago.contratos, ['c2']);
  assert.equal(pago.monto, 750);
});

test('construirPagoDueno: sin nada pagable marcado no inventa nada: monto 0 y ninguna renta', () => {
  for (const marcados of [[], new Set(), undefined, null, ['c3'], ['c4'], ['p9', 'no-existe']]) {
    const pago = construirDe(marcados);
    assert.equal(pago.monto, 0, `marcados: ${JSON.stringify(marcados)}`);
    assert.deepEqual(pago.contratos, []);
  }
});

// LA PRUEBA de la asimetría que la revisión señaló: `totalSeleccionado` filtra
// por si se puede pagar, y una lista de ids tomada de las casillas no. Aquí se
// prueba, para TODAS las combinaciones de casillas posibles —las 128 de siete
// ids, incluidos los que no deben entrar—, que el monto guardado y los ids
// guardados salen de la misma lista y no se pueden contradecir.
test('construirPagoDueno: monto y contratos NO pueden contradecirse, con ninguna combinación de casillas', () => {
  const cuenta = cuentaDeDueno(SELECCION);
  const porPagar = new Set(cuenta.porPagar.map((c) => c.id));
  assert.deepEqual([...porPagar].sort(), ['c1', 'c2', 'c5'], 'el punto de partida de esta prueba');
  const costos = new Map(SELECCION.contratos.map((c) => [c.id, costoDelSubarriendo(c)]));

  let combinaciones = 0;
  for (let mascara = 0; mascara < 2 ** TODOS_LOS_IDS.length; mascara += 1) {
    const marcados = TODOS_LOS_IDS.filter((_, i) => mascara & (1 << i));
    const pago = construirDe(marcados);
    const contexto = `casillas ${JSON.stringify(marcados)}`;
    combinaciones += 1;

    // 1. Ningún id entra si no estaba por pagar: ni abierto, ni ya pagado, ni propio, ni inexistente.
    for (const id of pago.contratos) assert.ok(porPagar.has(id), `${contexto}: «${id}» entró y no estaba por pagar`);
    // 2. Entran todos los marcados que sí estaban por pagar.
    assert.deepEqual(pago.contratos, [...porPagar].filter((id) => marcados.includes(id)).sort(), contexto);
    // 3. El monto es, al centavo, el costo de EXACTAMENTE esos ids: recalculado desde cero, contrato por contrato.
    const esperado = pago.contratos.reduce((total, id) => total + costos.get(id), 0);
    assert.equal(pago.monto, esperado, `${contexto}: el monto no es la suma de los contratos que cubre`);
    // 4. Y es el mismo número que la pantalla enseña mientras se marcan casillas.
    assert.equal(pago.monto, totalSeleccionado(cuenta.porPagar, marcados), `${contexto}: no es el total que él vio`);
    // 5. Un monto sin rentas, o rentas sin monto, nunca se dan solas (aquí todos cuestan más de 0).
    assert.equal(pago.monto === 0, pago.contratos.length === 0, contexto);
  }
  assert.equal(combinaciones, 128);
});

test('construirPagoDueno: la forma del pago es la de §7 y el monto ya viene redondeado', () => {
  const pago = construirDe(['c1', 'c2']);
  assert.deepEqual(Object.keys(pago).sort(), ['contratos', 'duenoId', 'fecha', 'forma', 'monto']);
  // Es lo que `guardarPagoDueno` le entrega a `pagoDuenoParaGuardar`: pasa sin cambiar.
  const guardado = pagoDuenoParaGuardar(pago, { id: 'p2', numero: 2, ahora: 1 });
  assert.equal(guardado.monto, pago.monto);
  assert.deepEqual(guardado.contratos, pago.contratos);
});

test('construirPagoDueno: duenoId vacío se guarda null, no undefined (Firestore rechaza undefined)', () => {
  // El grupo de contratos viejos con el dueño escrito a mano no tiene duenoId.
  assert.equal(construirDe(['c1'], { duenoId: null }).duenoId, null);
  assert.equal(construirDe(['c1'], { duenoId: undefined }).duenoId, null);
  assert.ok('duenoId' in construirDe(['c1'], { duenoId: undefined }));
});

test('construirPagoDueno: sin la lista de pagos LANZA — no la toma por «nada pagado»', () => {
  // Es la regla más cara de este sistema: leer una lectura fallida como vacía
  // reaparece lo ya pagado como deuda, y se le paga dos veces a quien ya se le pagó.
  for (const pagos of [undefined, null, {}, 'p1']) {
    assert.throws(() => construirDe(['c1'], { pagos }), /«pagos» debe ser una lista/, `pagos: ${String(pagos)}`);
  }
  assert.doesNotThrow(() => construirDe(['c1'], { pagos: [] }), 'una lista vacía de verdad sí es «no se ha pagado nada»');
});

test('construirPagoDueno: sin la lista de contratos LANZA — no dice «no se le debe nada»', () => {
  for (const contratos of [undefined, null, {}, 'c1']) {
    assert.throws(() => construirDe(['c1'], { contratos }), /«contratos» debe ser una lista/, `contratos: ${String(contratos)}`);
  }
});

test('construirPagoDueno: un pago dañado en la lista (sin su lista de contratos) lanza, no «cubre nada»', () => {
  assert.throws(() => construirDe(['c1'], { pagos: [{ id: 'p5', monto: 1600 }] }), /«contratos» de un pago/);
});

// ---------- Una renta sin costo legible no se puede pagar (I1 de la revisión) ----------
//
// La revisión lo reprodujo: dos contratos cerrados, `cz` con costo guardado en 0
// y `sl` con Q777 por día en `privado` pero cuya lectura falló. `cuentaDeDueno`
// los marca bien en `sinCostoAnotado`, él los marcaba igual, y el pago salía por
// Q0.00 sobre las dos rentas: la deuda desaparecía de «por pagar» para siempre y
// existía un comprobante «Le pagué Q0.00». Un número que falta, leído como un
// cero de verdad, justo en el paso que no se deshace desde la pantalla.
//
// Los contratos de estas pruebas tienen la forma que de verdad recibe el área de
// dinero (`paraDinero`, arriba), no la forma en memoria de `construirContrato`.

/** Cuatro contratos cerrados, con número distinto para poder nombrarlos: c1 normal, cz en cero, sl sin leer, ca con costo en el documento. */
const cerradoN = (id, numero, costoDia, dias = 4) => devuelto(salidaAjena({ id, numero, costoDia, dias }));
const SIN_COSTO = {
  contratos: [
    paraDinero(cerradoN('c1', 11, 400), 400), // 4 × 400 = 1,600
    paraDinero(cerradoN('cz', 12, 0), 0), // el costo se guardó en 0
    paraDinero(cerradoN('sl', 13, 777), undefined), // privado dice 777, pero no se pudo leer: no llegó ningún costo
    conCostoDelDueno(viejo(cerradoN('ca', 14, 300)), undefined), // costo viejo en el documento; privado no se pudo leer
  ],
  pagos: [],
};
const construirSinCosto = (idsMarcados, extra = {}) => construirPagoDueno({
  duenoId: 'd1', fecha: '2026-09-20', forma: 'efectivo', ...SIN_COSTO, idsMarcados, costoSinLeer: ['sl', 'ca'], ...extra,
});

test('I1: el punto de partida — la liquidación sí los marca, y los cuatro están por pagar', () => {
  const cuenta = cuentaDeDueno(SIN_COSTO);
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c1', 'cz', 'sl', 'ca']);
  assert.deepEqual(cuenta.sinCostoAnotado, ['cz', 'sl'], 'cz: costo 0; sl: ningún costo llegó. ca trae costo por dentro');
  assert.equal(traeCostoDia(SIN_COSTO.contratos[2]), false, 'sl no trae costo: no se le inventa uno');
});

test('I1: una renta con costo 0 o que no se pudo leer NO se puede pagar — se rechaza, no sale un pago por Q0.00', () => {
  // La reproducción de la revisión: marcar los dos.
  assert.throws(() => construirSinCosto(['cz', 'sl']), /No se registró el pago/);
  // Y cada una por separado.
  assert.throws(() => construirSinCosto(['cz']), /No se registró el pago/);
  assert.throws(() => construirSinCosto(['sl']), /No se registró el pago/);
});

test('I1: dice POR QUÉ, con el número de contrato que él conoce — para ir a anotar el costo y no preguntarse dónde quedó la renta', () => {
  assert.throws(() => construirSinCosto(['cz']), (e) => {
    assert.match(e.message, /N° 12/);
    assert.match(e.message, /no tiene costo por día anotado/);
    assert.match(e.message, /anota/i);
    return true;
  });
  // Si lo que pasó es que no se pudo LEER, es otro consejo: no «anótalo» sino «revisa tu internet».
  assert.throws(() => construirSinCosto(['sl']), (e) => {
    assert.match(e.message, /No se pudo leer el costo del contrato N° 13/);
    assert.match(e.message, /internet/);
    assert.doesNotMatch(e.message, /no tiene costo por día anotado/, 'no se acusa de «sin anotar» a lo que solo no se pudo leer');
    return true;
  });
  // Varias: se nombran todas, en plural.
  assert.throws(() => construirSinCosto(['cz', 'sl']), (e) => {
    assert.match(e.message, /N° 12/);
    assert.match(e.message, /N° 13/);
    return true;
  });
});

test('I1: «no se pudo leer privado» también la rechaza si el documento trae un costo viejo — privado manda y no se sabe qué decía', () => {
  // `ca` tiene Q300 en el documento, así que NO está en `sinCostoAnotado`; pero
  // privado (que ganaría si dijera otra cosa) no se pudo leer.
  assert.deepEqual(cuentaDeDueno(SIN_COSTO).sinCostoAnotado.includes('ca'), false);
  assert.throws(() => construirSinCosto(['ca']), /No se pudo leer el costo del contrato N° 14/);
  // Leído bien (ya no está en `costoSinLeer`), ese mismo contrato sí se paga, por su costo viejo.
  const pago = construirSinCosto(['ca'], { costoSinLeer: [] });
  assert.deepEqual(pago.contratos, ['ca']);
  assert.equal(pago.monto, 1200);
});

test('I1: no se paga ni una parte en silencio — marcar una renta buena y una sin costo rechaza todo el pago', () => {
  assert.throws(() => construirSinCosto(['c1', 'cz']), /N° 12/);
});

test('I1: una renta sin costo que NO se marcó no estorba — las demás se pagan, y su monto es exacto', () => {
  const pago = construirSinCosto(['c1']);
  assert.deepEqual(pago.contratos, ['c1']);
  assert.equal(pago.monto, 1600);
});

test('I1: lo rechazado sigue debiéndose: nada se guardó, y las dos rentas siguen en «por pagar»', async () => {
  const nube = nubeEnMemoria();
  assert.throws(() => construirSinCosto(['cz', 'sl']));
  assert.equal(nube.escrituras().length, 0);
  assert.deepEqual(cuentaDeDueno(SIN_COSTO).porPagar.map((c) => c.id), ['c1', 'cz', 'sl', 'ca']);
});

test('I1: sin la lista de rentas sin leer (no se pasó) se sigue protegiendo lo que ya se sabe: costo 0 o ausente', () => {
  assert.throws(() => construirSinCosto(['cz'], { costoSinLeer: undefined }), /N° 12/);
  assert.throws(() => construirSinCosto(['sl'], { costoSinLeer: undefined }), /N° 13/);
});

// ---------- Un id repetido no cuenta dos veces (M3 de la revisión) ----------
//
// `contratos: [c1, c1]` daba `monto: 3200, contratos: ['c1', 'c1']` sobre una
// deuda real de 1,600: monto y lista coincidían entre sí y no con la deuda. Una
// pantalla que junta dos lecturas de rangos de fechas que se traslapan puede
// entregar el mismo contrato dos veces.

test('M3: el mismo contrato dos veces cuenta una sola — el monto es la deuda real y el id no se repite', () => {
  const c1 = SELECCION.contratos[0]; // Q400 × 4 = Q1,600
  const pago = construirDe(['c1'], { contratos: [c1, c1] });
  assert.equal(pago.monto, 1600, 'no Q3,200');
  assert.deepEqual(pago.contratos, ['c1']);
});

test('M3: repetidos mezclados con otros contratos — todo cuenta una vez y el orden de la lista se conserva', () => {
  const [c1, c2, , , c5] = SELECCION.contratos;
  const pago = construirDe(['c1', 'c2', 'c5'], { contratos: [c5, c1, c2, c1, c5, c2, c1] });
  assert.deepEqual(pago.contratos, ['c5', 'c1', 'c2'], 'cada uno en el lugar de su primera aparición');
  assert.equal(pago.monto, 1000 + 1600 + 750);
});

test('M3: de dos copias del mismo contrato manda la más nueva, en cualquier orden — una vieja no lo «reabre» ni lo «cierra»', () => {
  const cerrado = { ...SELECCION.contratos[0], actualizado: 200 };
  const sinCerrar = { ...paraDinero(salidaAjena({ id: 'c1', costoDia: 400 }), 400), actualizado: 100 }; // la copia vieja: el carro seguía afuera
  assert.equal(estadoContrato(sinCerrar), 'rentado');
  for (const lista of [[cerrado, sinCerrar], [sinCerrar, cerrado]]) {
    const pago = construirDe(['c1'], { contratos: lista });
    assert.deepEqual(pago.contratos, ['c1']);
    assert.equal(pago.monto, 1600);
  }
  // Y al revés: si la nueva es la que dice que sigue abierto, no se paga.
  const reabierto = { ...sinCerrar, actualizado: 300 };
  for (const lista of [[cerrado, reabierto], [reabierto, cerrado]]) {
    assert.deepEqual(construirDe(['c1'], { contratos: lista }).contratos, []);
  }
});

test('M3: quitar repetidos no cambia nada cuando no hay — las 128 combinaciones siguen dando lo mismo', () => {
  for (let mascara = 0; mascara < 2 ** TODOS_LOS_IDS.length; mascara += 1) {
    const marcados = TODOS_LOS_IDS.filter((_, i) => mascara & (1 << i));
    assert.deepEqual(
      construirDe(marcados, { contratos: [...SELECCION.contratos, ...SELECCION.contratos] }),
      construirDe(marcados),
      `casillas ${JSON.stringify(marcados)}`,
    );
  }
});

test('I1: guardarPagoDueno nunca guarda un pago por Q0.00 — se niega ANTES de gastar un número', async () => {
  for (const monto of [0, 0.004, -5, '', null, undefined, 'abc', NaN]) {
    const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 3 } } });
    const g = guardarCon(nube, { ...pagoBase, monto, contratos: ['cz', 'sl'] });
    await assert.rejects(g.promesa, (e) => e.message === MENSAJE_PAGO_SIN_MONTO, `monto: ${String(monto)}`);
    assert.equal(g.numeros.pedidos, 0, 'no se gastó un comprobante');
    assert.equal(nube.leer('contadores/comprobantes').ultimo, 3);
    assert.equal(nube.escrituras().length, 0, 'y no se escribió nada');
  }
});

test('I1: el rechazo por monto habla claro — dice que Q0.00 no prueba nada y qué revisar', () => {
  assert.match(MENSAJE_PAGO_SIN_MONTO, /Q0\.00/);
  assert.match(MENSAJE_PAGO_SIN_MONTO, /costo por día/);
});

test('I1: un pago de verdad por más de cero sigue guardándose (el candado no estorba lo bueno)', async () => {
  const nube = nubeEnMemoria();
  const guardado = await guardarCon(nube, construirSinCosto(['c1'])).promesa;
  assert.equal(guardado.monto, 1600);
  assert.deepEqual(guardado.contratos, ['c1']);
});

// ---------- siguienteNumeroComprobante ----------

const numeroDe = (nube) => siguienteNumeroComprobante({ iniciar: nube.iniciar });

test('siguienteNumeroComprobante: el primero es el 1, y queda anotado en contadores/comprobantes', async () => {
  const nube = nubeEnMemoria();
  assert.equal(await numeroDe(nube), 1);
  assert.deepEqual(nube.leer('contadores/comprobantes'), { id: 'comprobantes', ultimo: 1 });
});

test('siguienteNumeroComprobante: sigue donde se quedó el contador', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 41 } } });
  assert.equal(await numeroDe(nube), 42);
  assert.equal(await numeroDe(nube), 43);
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 43);
});

test('siguienteNumeroComprobante: es SU contador — no gasta números de contrato ni de carro', async () => {
  const nube = nubeEnMemoria({ contadores: { contratos: { ultimo: 100 }, vehiculos: { ultimo: 7 } } });
  assert.equal(await numeroDe(nube), 1, 'el 101 es de un contrato, no de un comprobante');
  assert.equal(nube.leer('contadores/contratos').ultimo, 100);
  assert.equal(nube.leer('contadores/vehiculos').ultimo, 7);
});

test('siguienteNumeroComprobante: dos pestañas pidiendo a la vez NO se llevan el mismo número', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 9 } } });
  const numeros = await Promise.all([numeroDe(nube), numeroDe(nube), numeroDe(nube), numeroDe(nube)]);
  assert.deepEqual([...numeros].sort((a, b) => a - b), [10, 11, 12, 13], 'cuatro pedidos, cuatro números distintos');
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 13);
});

test('siguienteNumeroComprobante: la lectura y la escritura son UNA transacción, no dos pasos sueltos', async () => {
  const nube = nubeEnMemoria();
  await numeroDe(nube);
  const [lectura] = nube.llamadas.filter(([op]) => op === 'tx.get');
  const [escritura] = nube.llamadas.filter(([op]) => op === 'tx.set');
  assert.deepEqual(lectura.slice(0, 2), ['tx.get', 'contadores/comprobantes']);
  assert.deepEqual(escritura, ['tx.set', 'contadores/comprobantes', { ultimo: 1 }, 'mostrador']);
  assert.equal(nube.llamadas.filter(([op]) => op === 'getDoc' || op === 'setDoc').length, 0, 'nada fuera de la transacción');
});

test('siguienteNumeroComprobante: si la nube falla, falla — no inventa un número', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 5 } }, fallan: [{ op: 'tx.get' }] });
  await assert.rejects(numeroDe(nube), /sin internet/);
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 5, 'el contador no se movió');
});

// ---------- guardarPagoDueno ----------

/**
 * Un guardado contra la nube de mentira, con la credencial de dinero puesta y
 * un contador falso o el de verdad.
 *
 * Un pago NUEVO llega sin `id` y aquí se le pide uno antes del primer intento,
 * que es lo que tiene que hacer la pantalla (`nuevoIdPagoDueno`): sin id,
 * `guardarPagoDueno` se niega. El id se pide con una base de dinero buena
 * aunque `extra` ponga una mala, para que cada prueba mida lo suyo.
 */
function guardarCon(nube, pago, extra = {}) {
  const avisos = [];
  const numeros = { pedidos: 0 };
  const promesa = (async () => {
    const id = pago.id ?? await nuevoIdPagoDueno({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
    return guardarPagoDueno({ ...pago, id }, {
      iniciar: nube.iniciar,
      dbDinero: () => nube.dbDinero,
      numeroNuevo: async () => { numeros.pedidos += 1; return siguienteNumeroComprobante({ iniciar: nube.iniciar }); },
      avisar: (coleccion, e) => avisos.push([coleccion, e]),
      ...extra,
    });
  })();
  return { promesa, avisos, numeros };
}

test('guardarPagoDueno: escribe el pago en pagosDueno, con la base de DINERO, y le da el siguiente comprobante', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 3 } } });
  const g = guardarCon(nube, pagoBase);
  const guardado = await g.promesa;

  assert.equal(guardado.numero, 4);
  assert.deepEqual(Object.keys(guardado).sort(), CAMPOS_DE_UN_PAGO);
  assert.equal(guardado.monto, 2350);
  assert.deepEqual(guardado.contratos, ['c1', 'c2']);

  const [escritura, ...otras] = nube.escrituras(`pagosDueno/${guardado.id}`);
  assert.equal(otras.length, 0);
  assert.equal(escritura[4], 'dinero', 'las reglas solo dejan escribir pagosDueno a la credencial de dinero');
  assert.deepEqual(escritura[3], { merge: true });
  assert.deepEqual(nube.leer(`pagosDueno/${guardado.id}`), guardado, 'lo que quedó en la nube es lo que se devolvió');
});

test('guardarPagoDueno: dos pagos seguidos reciben comprobantes distintos y consecutivos', async () => {
  const nube = nubeEnMemoria();
  const a = await guardarCon(nube, pagoBase).promesa;
  const b = await guardarCon(nube, { ...pagoBase, contratos: ['c5'], monto: 1000 }).promesa;
  assert.deepEqual([a.numero, b.numero], [1, 2]);
  assert.notEqual(a.id, b.id, 'son dos documentos, no uno encima del otro');
});

test('guardarPagoDueno: un pago que ya existe se edita en su mismo documento y NO gasta otro número', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 12 } } });
  const primero = await guardarCon(nube, pagoBase).promesa;
  assert.equal(primero.numero, 13);

  const g = guardarCon(nube, { ...primero, forma: 'cheque' });
  const editado = await g.promesa;
  assert.equal(editado.id, primero.id, 'el mismo documento: no se duplica');
  assert.equal(editado.numero, 13, 'el comprobante conserva su número');
  assert.equal(editado.forma, 'cheque');
  assert.equal(g.numeros.pedidos, 0, 'no se pidió ningún número nuevo');
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 13, 'y el contador no avanzó');
  assert.equal([...nube.docs.keys()].filter((r) => r.startsWith('pagosDueno/')).length, 1);
});

test('guardarPagoDueno: sin sesión de dinero se niega ANTES de gastar un número, y no escribe nada', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 3 } } });
  const g = guardarCon(nube, pagoBase, { dbDinero: () => null });
  await assert.rejects(g.promesa, (e) => e.message === MENSAJE_PAGO_SIN_DINERO);
  assert.equal(g.numeros.pedidos, 0);
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 3);
  assert.equal(nube.escrituras().length, 0);
});

test('guardarPagoDueno: con la base del mostrador en vez de la de dinero, las reglas lo rechazan (no hay otra puerta)', async () => {
  const nube = nubeEnMemoria();
  const g = guardarCon(nube, pagoBase, { dbDinero: () => nube.dbMostrador });
  await assert.rejects(g.promesa, /permissions/);
  assert.equal([...nube.docs.keys()].filter((r) => r.startsWith('pagosDueno/')).length, 0);
});

test('guardarPagoDueno: un pago sin ninguna renta no se guarda, y no gasta un número de comprobante', async () => {
  for (const contratos of [[], undefined, null, 'c1']) {
    const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 3 } } });
    const g = guardarCon(nube, { ...pagoBase, monto: 0, contratos });
    await assert.rejects(g.promesa, (e) => e.message === MENSAJE_PAGO_SIN_RENTAS, `contratos: ${JSON.stringify(contratos)}`);
    assert.equal(g.numeros.pedidos, 0);
    assert.equal(nube.escrituras().length, 0);
  }
});

test('guardarPagoDueno: lo que construirPagoDueno arma, guardarPagoDueno lo guarda — una casilla vieja no llega a la nube', async () => {
  const nube = nubeEnMemoria();
  const pago = construirDe(['c1', 'c3']); // c3 todavía no cierra
  const guardado = await guardarCon(nube, pago).promesa;
  assert.deepEqual(nube.leer(`pagosDueno/${guardado.id}`).contratos, ['c1']);
  assert.equal(nube.leer(`pagosDueno/${guardado.id}`).monto, 1600);
  // Y construirPagoDueno de una selección vacía no es un pago que se pueda guardar.
  const g = guardarCon(nube, construirDe(['c3']));
  await assert.rejects(g.promesa, (e) => e.message === MENSAJE_PAGO_SIN_RENTAS);
});

test('guardarPagoDueno: si la nube falla, el guardado falla (no se finge) y no se tocó nada más', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'setDoc' }] });
  const g = guardarCon(nube, pagoBase);
  await assert.rejects(g.promesa, /sin internet/);
  assert.equal(g.avisos.length, 0, 'un fallo de la nube no es un aviso de copia local');
  assert.equal([...nube.docs.keys()].filter((r) => r.startsWith('pagosDueno/')).length, 0);
});

test('guardarPagoDueno: si no se pudo tomar el número, falla y no guarda un pago sin comprobante', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'tx.get' }] });
  await assert.rejects(guardarCon(nube, pagoBase).promesa, /sin internet/);
  assert.equal(nube.escrituras().length, 0);
});

// Dinero no se copia a IndexedDB (ver la nota de la sección). Si algún día
// `guardarPagoDueno` intentara una copia local, en Node no existe `indexedDB` y
// ese intento reventaría en silencio hacia `avisar`: que no se avise nunca es la
// prueba de que no se intentó.
test('guardarPagoDueno: no deja copia local — lo que se le pagó a cada dueño no se escribe donde se lee sin contraseña', async () => {
  const nube = nubeEnMemoria();
  const g = guardarCon(nube, pagoBase);
  await g.promesa;
  assert.deepEqual(g.avisos, [], 'ningún intento de copia local, ni fallido');
});

// ---------- Guardar un pago es repetible (I2 de la revisión de las Tareas 6 y 7) ----------
//
// La revisión grabó Q4,700 contra una deuda real de Q2,350: dos llamadas con el
// mismo pago daban dos documentos, con los comprobantes 1 y 2, sobre las mismas
// rentas. Un doble clic lo hace, y también el reintento de quien vio fallar el
// primer intento por el límite de 8 segundos mientras la escritura seguía en
// camino — justo lo que pasa con mala conexión, cuando más probable es que
// vuelva a apretar el botón. Los contratos lo resolvieron con `nuevoIdContrato`:
// el id se decide ANTES de escribir, y un reintento cae en el mismo documento.
//
// QUÉ CUBREN: que, con el mismo id, dos guardados son un solo documento en la
// Firestore de mentira, y que `guardarPagoDueno` no deja guardar sin id. NO
// cubren que el SDK de verdad aplique `setDoc` con `merge` sobre el mismo
// documento ni en qué orden aterrizan dos escrituras en vuelo: eso es de
// Firebase, no se probó aquí.

const losPagos = (nube) => [...nube.docs.keys()].filter((r) => r.startsWith('pagosDueno/'));
const sumaDeLoGuardado = (nube) => losPagos(nube).reduce((total, ruta) => total + nube.docs.get(ruta).monto, 0);

test('nuevoIdPagoDueno: da un id sin escribir nada, con la colección de dinero, y cada uno es distinto', async () => {
  const nube = nubeEnMemoria();
  const pedir = () => nuevoIdPagoDueno({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  const a = await pedir();
  const b = await pedir();
  assert.ok(a && b && a !== b);
  assert.equal(nube.escrituras().length, 0, 'pedir el id no escribe nada: como nuevoIdContrato, solo lo decide');
  assert.equal(nube.docs.size, 0);
});

test('nuevoIdPagoDueno: sin sesión de dinero se niega con la frase de siempre y ni arranca Firebase', async () => {
  const nube = nubeEnMemoria();
  let arrancó = false;
  await assert.rejects(
    nuevoIdPagoDueno({ iniciar: async () => { arrancó = true; return nube.iniciar(); }, dbDinero: () => null }),
    (e) => e.message === MENSAJE_PAGO_SIN_DINERO,
  );
  assert.equal(arrancó, false);
});

test('guardarPagoDueno: apretar el botón dos veces (mismo id) es UN comprobante, no dos — la suma sigue siendo la deuda', async () => {
  const nube = nubeEnMemoria();
  const id = await nuevoIdPagoDueno({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  const pago = { ...pagoBase, id };
  const [a, b] = await Promise.all([guardarCon(nube, pago).promesa, guardarCon(nube, pago).promesa]);

  assert.equal(a.id, b.id);
  assert.equal(losPagos(nube).length, 1, 'un solo documento en pagosDueno');
  assert.equal(sumaDeLoGuardado(nube), 2350, 'lo registrado es lo que se debía, no Q4,700');
});

test('guardarPagoDueno: el reintento después de que el primer intento venció cae en el MISMO documento', async () => {
  const nube = nubeEnMemoria();
  const id = await nuevoIdPagoDueno({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  // El primer intento vence por el límite de 8 s, pero la escritura sí llegó a
  // la nube (iba en camino). Quien lo vio fallar vuelve a apretar el botón.
  let primera = true;
  const fsVence = {
    ...nube.fsMod,
    setDoc: async (...a) => {
      await nube.fsMod.setDoc(...a);
      if (primera) { primera = false; throw new Error('La nube no respondió a tiempo.'); }
    },
  };
  const iniciar = async () => ({ db: nube.dbMostrador, fsMod: fsVence });
  const pago = { ...pagoBase, id };
  await assert.rejects(guardarCon(nube, pago, { iniciar }).promesa, /no respondió a tiempo/);
  const reintento = await guardarCon(nube, pago, { iniciar }).promesa;

  assert.equal(losPagos(nube).length, 1, 'el reintento no creó un segundo documento');
  assert.equal(reintento.id, id);
  assert.equal(sumaDeLoGuardado(nube), 2350);
  assert.deepEqual(nube.leer(`pagosDueno/${id}`), reintento, 'lo que quedó es lo que el reintento devolvió');
});

test('guardarPagoDueno: pagos DISTINTOS (cada uno con su id) siguen siendo documentos distintos', async () => {
  const nube = nubeEnMemoria();
  const a = await guardarCon(nube, pagoBase).promesa;
  const b = await guardarCon(nube, { ...pagoBase, contratos: ['c5'], monto: 1000 }).promesa;
  assert.notEqual(a.id, b.id);
  assert.equal(losPagos(nube).length, 2);
});

test('guardarPagoDueno: sin id se niega ANTES de gastar un número — un guardado que no se puede repetir no existe', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 3 } } });
  for (const id of [undefined, null, '']) {
    const numeros = { pedidos: 0 };
    await assert.rejects(
      guardarPagoDueno({ ...pagoBase, id }, {
        iniciar: nube.iniciar,
        dbDinero: () => nube.dbDinero,
        numeroNuevo: async () => { numeros.pedidos += 1; return 99; },
        avisar: () => {},
      }),
      (e) => e.message === MENSAJE_PAGO_SIN_ID,
      `id: ${String(id)}`,
    );
    assert.equal(numeros.pedidos, 0);
  }
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 3);
  assert.equal(nube.escrituras().length, 0);
});

// ---------- cargarPagosDueno ----------

const pagoGuardado = (id, numero, contratos, monto) => pagoDuenoParaGuardar(
  { duenoId: 'd1', fecha: '2026-09-10', forma: 'efectivo', monto, contratos },
  { id, numero, ahora: 1790000000000 },
);

const cargarCon = (nube, extra = {}) => cargarPagosDueno({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, ...extra });

test('cargarPagosDueno: trae todos los pagos, con su id, leídos con la base de DINERO', async () => {
  const p1 = pagoGuardado('p1', 1, ['c4'], 400);
  const p2 = pagoGuardado('p2', 2, ['c1', 'c2'], 2350);
  const nube = nubeEnMemoria({ pagosDueno: [p1, p2] });
  const r = await cargarCon(nube);

  assert.equal(r.fallo, false);
  assert.deepEqual(r.datos.sort((a, b) => a.numero - b.numero), [p1, p2]);
  assert.deepEqual(nube.llamadas.filter(([op]) => op === 'getDocs'), [['getDocs', 'pagosDueno', 'dinero']]);
});

test('cargarPagosDueno: lo leído sirve tal cual para lo que se le debe: cuentaDeDueno ve lo ya pagado', async () => {
  const nube = nubeEnMemoria({ pagosDueno: [pagoGuardado('p1', 1, ['c4'], 400)] });
  const { datos } = await cargarCon(nube);
  const cuenta = cuentaDeDueno({ contratos: SELECCION.contratos, pagos: datos });
  assert.deepEqual(cuenta.pagados.map((c) => c.id), ['c4']);
  assert.equal(cuenta.totalPorPagar, 3350, 'c1 + c2 + c5, sin volver a contar c4');
});

test('cargarPagosDueno: una colección que de verdad está vacía es `[]` con fallo en false — no es un fallo', async () => {
  assert.deepEqual(await cargarCon(nubeEnMemoria()), { datos: [], fallo: false });
});

test('cargarPagosDueno: si la nube falla, `datos` es null — NUNCA `[]`, que se leería como «nada pagado»', async () => {
  const nube = nubeEnMemoria({ pagosDueno: [pagoGuardado('p1', 1, ['c4'], 400)], fallan: [{ op: 'getDocs' }] });
  const r = await cargarCon(nube);
  assert.deepEqual(r, { datos: null, fallo: true });
  // Quien se olvide de mirar `fallo` choca aquí, y no dibuja una deuda de más.
  assert.throws(() => cuentaDeDueno({ contratos: SELECCION.contratos, pagos: r.datos }), /«pagos» debe ser una lista/);
  assert.throws(() => construirDe(['c4'], { pagos: r.datos }), /«pagos» debe ser una lista/);
});

test('cargarPagosDueno: sin sesión de dinero no se lee nada y se dice que falló, no que no hay pagos', async () => {
  const nube = nubeEnMemoria({ pagosDueno: [pagoGuardado('p1', 1, ['c4'], 400)] });
  const r = await cargarCon(nube, { dbDinero: () => null });
  assert.deepEqual(r, { datos: null, fallo: true });
  assert.equal(nube.llamadas.length, 0, 'ni siquiera se intentó leer');
});

test('cargarPagosDueno: con la base del mostrador las reglas lo rechazan, y eso también es un fallo', async () => {
  const nube = nubeEnMemoria({ pagosDueno: [pagoGuardado('p1', 1, ['c4'], 400)] });
  assert.deepEqual(await cargarCon(nube, { dbDinero: () => nube.dbMostrador }), { datos: null, fallo: true });
});

test('cargarPagosDueno: si Firebase ni arranca, es un fallo', async () => {
  const nube = nubeEnMemoria();
  const r = await cargarCon(nube, { iniciar: async () => { throw new Error('sin claves'); } });
  assert.deepEqual(r, { datos: null, fallo: true });
});

test('cargarPagosDueno: un pago dañado se devuelve tal cual — no se «arregla» para que cuentaDeDueno lo vea', async () => {
  const dañado = { id: 'p5', duenoId: 'd1', fecha: '2026-09-10', forma: 'efectivo', monto: 1600 }; // sin `contratos`
  const nube = nubeEnMemoria({ pagosDueno: [dañado] });
  const r = await cargarCon(nube);
  assert.deepEqual(r.datos, [dañado], 'no se le inventó un `contratos: []`');
  assert.throws(() => cuentaDeDueno({ contratos: SELECCION.contratos, pagos: r.datos }), /«contratos» de un pago/);
});

test('de punta a punta: lo que se guarda se vuelve a leer, y esa renta deja de deberse', async () => {
  const nube = nubeEnMemoria();
  const antes = await cargarCon(nube);
  assert.equal(cuentaDeDueno({ contratos: SELECCION.contratos, pagos: antes.datos }).totalPorPagar, 3350 + 400);

  const pago = construirDe(['c1', 'c2']);
  const guardado = await guardarCon(nube, pago).promesa;
  const despues = await cargarCon(nube);
  assert.deepEqual(despues.datos, [guardado]);
  const cuenta = cuentaDeDueno({ contratos: SELECCION.contratos, pagos: despues.datos });
  assert.deepEqual(cuenta.pagados.map((c) => c.id).sort(), ['c1', 'c2']);
  assert.equal(cuenta.totalPorPagar, 1000 + 400, 'c5 y c4 (c4 no se pagó en esta nube)');
});
