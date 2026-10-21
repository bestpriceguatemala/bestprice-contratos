// El porcentaje de comisión de un contrato no lo cambia el mostrador (firestore.rules, 21 de octubre de 2026).
//
// LA REGLA VIVE EN FIREBASE Y DESDE AQUÍ NO SE PUEDE PROBAR: en este repositorio no hay emulador de Firestore, y esta
// prueba NO dice que la regla funcione. Lo que fija es lo otro, lo que la regla DA POR HECHO del código y que un cambio
// futuro puede romper sin que ninguna otra prueba se entere:
//
//   1. Que ningún camino del mostrador (sesión normal) escribe un `porcentajeComision` distinto del que el contrato ya tiene.
//      Si uno lo hiciera, las reglas lo rechazarían EN PRODUCCIÓN —el dueño no podría cobrar ni recibir un carro con el
//      cliente enfrente— y todas las demás pruebas seguirían en verde, porque la Firestore de mentira no rechaza nada.
//   2. Que el único camino que sí lo cambia (enlazar rentas viejas a un empleado) sale por la app 'dinero' (§11), que es la
//      única con `esDinero()`. Una regla que exige dinero sobre un camino que escribe con el mostrador falla en producción.
//   3. Que nada en el sistema borra contratos (la regla le niega el borrado al mostrador) ni lee un porcentaje de
//      `privado/dinero` (donde cualquier sesión escribe), y que ningún archivo nuevo empieza a tocar el porcentaje sin que
//      alguien lo revise.
//   4. Que el archivo de reglas conserva la forma que esas suposiciones necesitan, y que el archivo anterior (el botón de
//      deshacer del dueño) sigue siendo el de antes.
//
// El «vigilante» de abajo hace con la nube de mentira lo que la regla hace con la de verdad: mira el documento ENTERO antes y
// después de cada escritura (en una actualización `request.resource.data` es el documento como va a quedar, no un parche) y
// compara el porcentaje con la misma igualdad de la regla, `get('porcentajeComision', null)`. Solo vigila la base del mostrador:
// con la de dinero la regla deja pasar el cambio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  guardarContrato, agregarPago, anularPago, enlazarContratosAlDueno, enlazarContratosAlEmpleado, puedeLiberarse,
  CODIGO_COPIA_VIEJA,
} from '../js/datos.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { renta, rentaDeAntes, EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { ana, wilder, luis } = EMPLEADOS;
const AHORA = 1790000000000;

const raiz = new URL('../', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// El espejo de la regla y el vigilante
// ---------------------------------------------------------------------------

/**
 * `request.resource.data.get('porcentajeComision', null) == resource.data.get('porcentajeComision', null)`, negado: ¿cambió el
 * porcentaje entre el documento de antes y el de después? Ausente y `null` cuentan lo mismo; el 0 NO es `null`; un texto no es
 * un número. Si cambia la expresión del archivo de reglas, la prueba de más abajo que la fija obliga a cambiar esta también.
 */
const elPorcentajeCambio = (antes, despues) => (antes.porcentajeComision ?? null) !== (despues.porcentajeComision ?? null);

/**
 * Envuelve la nube de mentira: después de cada escritura hecha con la base del MOSTRADOR, revisa los contratos que ya
 * existían y anota (`violaciones`) los que quedaron con otro porcentaje. Las altas (documentos que no existían) se anotan
 * aparte: la regla las deja crear con el porcentaje que traigan.
 */
function vigilante(nube) {
  const violaciones = [];
  const altas = [];
  const foto = () => new Map([...nube.docs].filter(([ruta]) => /^contratos\/[^/]+$/.test(ruta)).map(([ruta, d]) => [ruta, structuredClone(d)]));
  const revisar = (antes, db, como) => {
    for (const [ruta, despues] of foto()) {
      const previo = antes.get(ruta);
      if (!previo) { altas.push(ruta); continue; }
      if (!db.esDinero && elPorcentajeCambio(previo, despues)) {
        violaciones.push({ ruta, como, de: previo.porcentajeComision, a: despues.porcentajeComision });
      }
    }
  };
  const original = nube.fsMod;
  const vigilada = (db, como, hacer) => async (...args) => {
    const antes = foto();
    try { return await hacer(...args); } finally { revisar(antes, db(...args), como); }
  };
  const fsMod = {
    ...original,
    setDoc: (ref, ...resto) => vigilada(() => ref.db, 'setDoc', () => original.setDoc(ref, ...resto))(),
    updateDoc: (ref, ...resto) => vigilada(() => ref.db, 'updateDoc', () => original.updateDoc(ref, ...resto))(),
    runTransaction: (db, funcion) => vigilada(() => db, 'transacción', () => original.runTransaction(db, funcion))(),
    writeBatch: (db) => {
      const lote = original.writeBatch(db);
      return { update: (...a) => lote.update(...a), commit: () => vigilada(() => db, 'lote', () => lote.commit())() };
    },
  };
  return { violaciones, altas, fsMod, iniciar: async () => ({ db: nube.dbMostrador, fsMod }) };
}

const sinCopiaLocal = (vig) => ({ iniciar: vig.iniciar, guardarCopia: async () => {}, avisar: () => {} });
const ref = (nube, id, db = nube.dbMostrador) => nube.fsMod.doc(db, 'contratos', id);

const CASOS_DE_IGUALDAD = [
  ['5 → 5: igual', { porcentajeComision: 5 }, { porcentajeComision: 5 }, false],
  ['5 → 7: cambió', { porcentajeComision: 5 }, { porcentajeComision: 7 }, true],
  ['7.5 → 7.5: igual', { porcentajeComision: 7.5 }, { porcentajeComision: 7.5 }, false],
  ['0 → 0: igual (el 0 de Wilder)', { porcentajeComision: 0 }, { porcentajeComision: 0 }, false],
  ['0 → null: cambió (el 0 es un porcentaje, no «falta»)', { porcentajeComision: 0 }, { porcentajeComision: null }, true],
  ['ausente → ausente: igual (contrato de antes de que existiera el campo)', {}, {}, false],
  ['ausente → null: igual (null es «sin porcentaje», no paga nada)', {}, { porcentajeComision: null }, false],
  ['null → ausente: igual', { porcentajeComision: null }, {}, false],
  ['ausente → 5: cambió (un contrato no puede RECIBIR un porcentaje)', {}, { porcentajeComision: 5 }, true],
  ['5 → ausente: cambió (quitarlo también es cambiarlo)', { porcentajeComision: 5 }, {}, true],
  ['5 → "5": cambió (un texto no es el número)', { porcentajeComision: 5 }, { porcentajeComision: '5' }, true],
];

for (const [nombre, antes, despues, cambio] of CASOS_DE_IGUALDAD) {
  test(`el espejo de la regla — ${nombre}`, () => {
    assert.equal(elPorcentajeCambio(antes, despues), cambio);
  });
}

test('el vigilante ve lo que la regla rechazaría: un cambio de porcentaje con la base del mostrador, en cualquiera de las cuatro formas de escribir', async () => {
  const intentos = {
    updateDoc: (nube, vig) => vig.fsMod.updateDoc(ref(nube, 'c1'), { porcentajeComision: 99 }),
    'setDoc con merge': (nube, vig) => vig.fsMod.setDoc(ref(nube, 'c1'), { porcentajeComision: 99 }, { merge: true }),
    lote: async (nube, vig) => { const l = vig.fsMod.writeBatch(nube.dbMostrador); l.update(ref(nube, 'c1'), { porcentajeComision: 99 }); await l.commit(); },
    transacción: (nube, vig) => vig.fsMod.runTransaction(nube.dbMostrador, async (tx) => { tx.set(ref(nube, 'c1'), { porcentajeComision: 99 }, { merge: true }); }),
    // Sin `merge`, `setDoc` REEMPLAZA el documento: el porcentaje desaparece, y para la regla eso también es cambiarlo.
    'setDoc que reemplaza': (nube, vig) => vig.fsMod.setDoc(ref(nube, 'c1'), { observaciones: 'x' }),
  };
  for (const [como, intento] of Object.entries(intentos)) {
    const nube = nubeEnMemoria({ contratos: [renta({ id: 'c1', empleado: luis })] });
    const vig = vigilante(nube);
    await intento(nube, vig);
    assert.equal(vig.violaciones.length, 1, `${como}: el vigilante tiene que verlo`);
    assert.equal(vig.violaciones[0].de, 7.5, como);
  }
});

test('el vigilante NO se queja de lo que la regla deja pasar: un guardado que no menciona el porcentaje, y cualquier cosa con la base de dinero', async () => {
  const nube = nubeEnMemoria({ contratos: [renta({ id: 'c1', empleado: luis })] });
  const vig = vigilante(nube);
  await vig.fsMod.setDoc(ref(nube, 'c1'), { observaciones: 'nueva nota' }, { merge: true });
  await vig.fsMod.updateDoc(ref(nube, 'c1'), { observaciones: 'otra' });
  assert.deepEqual(vig.violaciones, [], 'un parche que no menciona el porcentaje lo deja intacto: el documento ENTERO de después trae el mismo');
  assert.strictEqual(nube.leer('contratos/c1').porcentajeComision, 7.5);
  await vig.fsMod.updateDoc(ref(nube, 'c1', nube.dbDinero), { porcentajeComision: 10 });
  assert.deepEqual(vig.violaciones, [], 'con la base de dinero la regla deja pasar el cambio');
  assert.strictEqual(nube.leer('contratos/c1').porcentajeComision, 10);
});

// ---------------------------------------------------------------------------
// Los caminos del mostrador: ninguno cambia el porcentaje
// ---------------------------------------------------------------------------

for (const empleado of [ana, wilder, luis]) {
  const p = empleado.porcentajeComision;

  test(`${empleado.nombre} (${p} %): cobrar un abono, recibir el carro, anular un pago y liberar la garantía dejan el porcentaje exactamente como estaba`, async () => {
    // Un carro que sigue afuera: lo que «Recibir carro» y «Cobrar» abren con `cargarContrato`.
    const nube = nubeEnMemoria({ contratos: [renta({ id: 'c1', empleado }), renta({ id: 'g1', numero: 2, empleado, recibidoEl: '2026-10-05', garantiaSinLiberar: true })] });
    const vig = vigilante(nube);
    const deps = sinCopiaLocal(vig);

    // Cobrar un abono (recibirCarro.js: guardarSoloCobro).
    let c = nube.leer('contratos/c1');
    c = await guardarContrato(agregarPago(c, { monto: 100, forma: 'efectivo', fecha: '2026-10-02' }), deps);
    // Recibir el carro (recibirCarro.js: guardar). El cierre se arma sobre TODO lo que el contrato ya traía.
    c = await guardarContrato(construirCierre(c, {
      fechaReal: '2026-10-05', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
    }), deps);
    // Anular un pago mal registrado (contratos.js).
    c = await guardarContrato(anularPago(c, 0), deps);
    // Liberar la garantía (flota.js → liberarGarantia → guardarContrato); la prueba de abajo fija que no hace nada más.
    const g = nube.leer('contratos/g1');
    assert.equal(puedeLiberarse(g), null, 'la fixture trae el saldo en cero: se puede liberar');
    await guardarContrato({ ...g, garantiaLiberada: true, garantiaLiberadaEn: '2026-10-06' }, deps);

    assert.deepEqual(vig.violaciones, [], 'ni un solo guardado del mostrador cambió el porcentaje');
    assert.strictEqual(nube.leer('contratos/c1').porcentajeComision, p);
    assert.strictEqual(nube.leer('contratos/g1').porcentajeComision, p);
    assert.equal(nube.leer('contratos/g1').garantiaLiberada, true, 'y el guardado de verdad se hizo (la prueba no es vacía)');
  });
}

test('enlazar rentas viejas a un DUEÑO (sesión del mostrador) escribe duenoId y el sello, y nada más: el porcentaje queda', async () => {
  const nube = nubeEnMemoria({ contratos: [renta({ id: 'c1', empleado: luis }), renta({ id: 'c2', numero: 2, empleado: wilder })] });
  const vig = vigilante(nube);
  await enlazarContratosAlDueno(['c1', 'c2'], 'd1', { iniciar: vig.iniciar, ahora: AHORA + 5 });
  assert.equal(nube.leer('contratos/c1').duenoId, 'd1', 'se escribió de verdad');
  assert.deepEqual(vig.violaciones, []);
  assert.strictEqual(nube.leer('contratos/c1').porcentajeComision, 7.5);
  assert.strictEqual(nube.leer('contratos/c2').porcentajeComision, 0);
});

test('un contrato de ANTES de que existiera el campo se sigue guardando, y el guardado no le inventa un porcentaje (ni un 0, ni un null)', async () => {
  const { porcentajeComision: _borrado, ...sinCampo } = rentaDeAntes({ id: 'v1' });
  const nube = nubeEnMemoria({ contratos: [sinCampo] });
  const vig = vigilante(nube);
  assert.equal('porcentajeComision' in nube.leer('contratos/v1'), false, 'el punto de partida: el documento no trae la llave');
  await guardarContrato(agregarPago(nube.leer('contratos/v1'), { monto: 50, forma: 'efectivo', fecha: '2026-10-02' }), sinCopiaLocal(vig));
  assert.deepEqual(vig.violaciones, []);
  assert.equal('porcentajeComision' in nube.leer('contratos/v1'), false, 'la llave sigue sin existir: un contrato no puede RECIBIR un porcentaje al guardarse');
  assert.equal(nube.leer('contratos/v1').pagos.length, 2, 'y el cobro sí quedó');
});

test('un contrato guardado con `porcentajeComision: null` (sin porcentaje) se sigue guardando y sigue en null', async () => {
  const nube = nubeEnMemoria({ contratos: [{ ...rentaDeAntes({ id: 'v1' }), porcentajeComision: null }] });
  const vig = vigilante(nube);
  await guardarContrato(agregarPago(nube.leer('contratos/v1'), { monto: 50, forma: 'efectivo', fecha: '2026-10-02' }), sinCopiaLocal(vig));
  assert.deepEqual(vig.violaciones, []);
  assert.strictEqual(nube.leer('contratos/v1').porcentajeComision, null);
});

test('la salida («Sacar carro») es un ALTA: la regla no la compara con nada, y reintentarla (el primer intento sí había llegado) es una actualización que no cambia el porcentaje', async () => {
  const { actualizado: _sello, ...nuevo } = renta({ id: 'n1', numero: 9, empleado: luis });
  const nube = nubeEnMemoria();
  const vig = vigilante(nube);
  await guardarContrato(nuevo, sinCopiaLocal(vig));
  assert.deepEqual(vig.altas, ['contratos/n1'], 'primero se creó');
  assert.strictEqual(nube.leer('contratos/n1').porcentajeComision, 7.5, 'con el que la pantalla sacó del empleado');
  // Con internet lento la pantalla se rinde a los 8 s, el guardado sí llegó, y el mostrador aprieta otra vez: mismo id, mismo contrato.
  await guardarContrato(nuevo, sinCopiaLocal(vig));
  assert.deepEqual(vig.violaciones, []);
  assert.strictEqual(nube.leer('contratos/n1').porcentajeComision, 7.5);
});

test('una copia atrasada que todavía trae el porcentaje de antes NO llega a escribirlo: la guardia de copia vieja la niega antes, con su frase, y las reglas ni la ven', async () => {
  const delMostrador = rentaDeAntes({ id: 'v1' }); // la que el mostrador tiene abierta: 5 %, con su sello
  const nube = nubeEnMemoria({ contratos: [delMostrador] });
  const vig = vigilante(nube);
  // Mientras tanto el dueño enlaza la renta y le cambia el porcentaje a 0, con la credencial de dinero: sube `actualizado`.
  await enlazarContratosAlEmpleado(['v1'], 'e6', {
    iniciar: vig.iniciar, dbDinero: () => nube.dbDinero, idsConPorcentaje: ['v1'], porcentajeComision: 0, ahora: AHORA + 1000,
  });
  assert.strictEqual(nube.leer('contratos/v1').porcentajeComision, 0);
  await assert.rejects(
    guardarContrato(agregarPago(delMostrador, { monto: 50, forma: 'efectivo', fecha: '2026-10-02' }), sinCopiaLocal(vig)),
    { codigo: CODIGO_COPIA_VIEJA },
  );
  assert.deepEqual(vig.violaciones, [], 'no se escribió el 5 de antes encima del 0');
  assert.strictEqual(nube.leer('contratos/v1').porcentajeComision, 0);
  assert.equal(nube.leer('contratos/v1').pagos.length, 1, 'y el cobro no se coló');
});

// ---------------------------------------------------------------------------
// El único camino que cambia el porcentaje sale por la app de dinero
// ---------------------------------------------------------------------------

test('enlazar rentas viejas a un EMPLEADO con la casilla del porcentaje: el cambio SÍ ocurre, y sale por la base de DINERO', async () => {
  const nube = nubeEnMemoria({ contratos: [rentaDeAntes({ id: 'v1' }), rentaDeAntes({ id: 'v2', numero: 2 })] });
  const vig = vigilante(nube);
  await enlazarContratosAlEmpleado(['v1', 'v2'], 'e6', {
    iniciar: vig.iniciar, dbDinero: () => nube.dbDinero, idsConPorcentaje: ['v1'], porcentajeComision: 0, ahora: AHORA + 1,
  });
  assert.strictEqual(nube.leer('contratos/v1').porcentajeComision, 0, 'el porcentaje cambió (es lo que el dueño pidió)');
  assert.strictEqual(nube.leer('contratos/v2').porcentajeComision, 5, 'el de la renta que no se marcó, no');
  assert.deepEqual(nube.llamadas.filter(([op]) => op === 'commit'), [['commit', ['contratos/v1', 'contratos/v2'], 'dinero']], 'un lote, con la base de dinero');
  assert.deepEqual(vig.violaciones, [], 'y las reglas no tendrían nada que objetar');
});

test('si enlazar con porcentaje saliera por la base del MOSTRADOR (alguien «simplifica» y deja de usar la de dinero), esto lo ve: en producción las reglas lo rechazarían', async () => {
  const nube = nubeEnMemoria({ contratos: [rentaDeAntes({ id: 'v1' })] });
  const vig = vigilante(nube);
  await enlazarContratosAlEmpleado(['v1'], 'e6', {
    iniciar: vig.iniciar, dbDinero: () => nube.dbMostrador, idsConPorcentaje: ['v1'], porcentajeComision: 0, ahora: AHORA + 1,
  });
  assert.deepEqual(vig.violaciones, [{ ruta: 'contratos/v1', como: 'lote', de: 5, a: 0 }]);
});

// ---------------------------------------------------------------------------
// El código: lo que la regla da por hecho
// ---------------------------------------------------------------------------

/** Todos los archivos .js del sistema, con su ruta relativa a js/ y su texto SIN comentarios. */
function codigoDelSistema() {
  const dir = fileURLToPath(new URL('js/', raiz));
  return readdirSync(dir, { recursive: true })
    .filter((ruta) => ruta.endsWith('.js'))
    .map((ruta) => [ruta, sinComentarios(readFileSync(`${dir}/${ruta}`, 'utf8'))]);
}

/** El texto de una función de datos.js (de su `export ... function nombre` al `}` de la columna 0 que la cierra). */
function funcionDeDatos(nombre) {
  const fuente = leer('js/datos.js');
  const inicio = fuente.search(new RegExp(`^export (async )?function ${nombre}\\(`, 'm'));
  assert.ok(inicio >= 0, `datos.js ya no tiene ${nombre}`);
  return fuente.slice(inicio, fuente.indexOf('\n}\n', inicio) + 3);
}

test('nada en el sistema borra documentos: por eso las reglas le niegan el borrado de contratos a la sesión del mostrador sin romper nada', () => {
  for (const [ruta, codigo] of codigoDelSistema()) {
    assert.doesNotMatch(codigo, /\bdeleteDoc\b/, `js/${ruta}: un borrado de contratos pide la credencial de dinero (firestore.rules: allow delete: if esDinero())`);
    assert.doesNotMatch(codigo, /\b(lote|batch|tx|transaccion)\.delete\(/, `js/${ruta}: igual, un borrado dentro de un lote o una transacción`);
  }
});

// Estos archivos son los que hoy nombran el porcentaje en su código. Si aparece uno nuevo, esta prueba obliga a que alguien se
// pregunte: ¿ESCRIBE el porcentaje en un contrato? ¿Con qué sesión? Y a decir la respuesta aquí, no a sumarlo en silencio.
const ARCHIVOS_QUE_NOMBRAN_EL_PORCENTAJE = [
  'datos.js',               // empleadoParaGuardar (el empleado, solo dinero) y enlazarContratosAlEmpleado (dinero); ver la prueba siguiente
  'nucleo/comision.js',     // lo LEE para calcular la comisión
  'nucleo/comisiones.js',   // lo LEE para la cuenta de cada empleado
  'nucleo/empleado.js',     // la ficha del empleado y lo que el contrato sella de ella
  'pantallas/comisiones.js', // lo LEE; y llama a enlazarContratosAlEmpleado, que escribe con dinero
  'pantallas/empleados.js', // la ficha del empleado (se guarda con dinero)
  'pantallas/sacarCarro.js', // lo SELLA, una sola vez, al CREAR el contrato (construirContrato)
];

test('ningún archivo nuevo empieza a nombrar `porcentajeComision` sin que alguien lo revise: sumarlo aquí es decir si escribe un contrato y con qué sesión', () => {
  const nombran = codigoDelSistema().filter(([, codigo]) => codigo.includes('porcentajeComision')).map(([ruta]) => ruta).sort();
  assert.deepEqual(nombran, [...ARCHIVOS_QUE_NOMBRAN_EL_PORCENTAJE].sort());
});

test('en datos.js el porcentaje solo se nombra en dos funciones: la ficha del empleado (se escribe con dinero) y enlazarContratosAlEmpleado (dinero)', () => {
  const fuente = sinComentarios(leer('js/datos.js'));
  const permitido = ['empleadoParaGuardar', 'enlazarContratosAlEmpleado'].map((n) => sinComentarios(funcionDeDatos(n)));
  const fuera = sinComentarios(permitido.reduce((resto, f) => resto.replace(f, ''), fuente));
  assert.doesNotMatch(
    fuera,
    /porcentajeComision/,
    'datos.js nombra el porcentaje fuera de esas dos funciones: si ESCRIBE un contrato con la sesión del mostrador, las reglas lo van a rechazar en producción',
  );
});

test('enlazarContratosAlEmpleado toma de `iniciar()` SOLO el módulo (fsMod), nunca su base: la base de la escritura es la de dinero, y sin sesión de dinero se niega antes', () => {
  const f = sinComentarios(funcionDeDatos('enlazarContratosAlEmpleado'));
  assert.match(f, /const db = dbDinero\(\);\s*\n\s*if \(!db\) throw/, 'pide la base de dinero y se niega si no hay sesión');
  const desestructuraciones = [...f.matchAll(/const \{([^}]*)\} = await iniciar\(\)/g)].map((m) => m[1].trim());
  assert.deepEqual(desestructuraciones, ['fsMod'], 'de iniciar() solo se toma fsMod: tomar `db` ahí escribiría con la sesión del mostrador');
  assert.match(f, /writeBatch\(db\)/);
});

test('liberarGarantia no escribe por su cuenta: delega en guardarContrato, que es el camino probado arriba', () => {
  const f = sinComentarios(funcionDeDatos('liberarGarantia'));
  assert.match(f, /guardarContrato\(/);
  assert.doesNotMatch(f, /setDoc|updateDoc|writeBatch|runTransaction|porcentajeComision/);
});

test('ninguna línea del sistema junta `privado` con `porcentajeComision`: el porcentaje no se lee de donde cualquier sesión escribe', () => {
  for (const [ruta, codigo] of codigoDelSistema()) {
    for (const linea of codigo.split('\n')) {
      assert.ok(!(linea.includes('privado') && linea.includes('porcentajeComision')), `js/${ruta}: ${linea.trim()}`);
    }
  }
});

// ---------------------------------------------------------------------------
// El archivo de reglas
// ---------------------------------------------------------------------------

/** El texto entre las llaves de `encabezado { ... }`, con las llaves balanceadas, o `null`. */
function cuerpoDe(texto, encabezado) {
  const inicio = texto.indexOf(encabezado);
  if (inicio < 0) return null;
  // Las llaves del encabezado mismo (`{id}`, `{doc}`) no cuentan: el cuerpo empieza en la primera llave DESPUÉS de él.
  const abre = texto.indexOf('{', inicio + encabezado.length);
  if (abre < 0) return null;
  let profundidad = 0;
  for (let i = abre; i < texto.length; i += 1) {
    if (texto[i] === '{') profundidad += 1;
    if (texto[i] === '}') { profundidad -= 1; if (profundidad === 0) return texto.slice(abre + 1, i); }
  }
  return null;
}

const REGLAS = leer('firestore.rules');
const REGLAS_SIN_COMENTARIOS = sinComentarios(REGLAS);
const BLOQUE_CONTRATOS = cuerpoDe(REGLAS_SIN_COMENTARIOS, 'match /contratos/{id}');
const BLOQUE_PRIVADO = cuerpoDe(BLOQUE_CONTRATOS ?? '', 'match /privado/{doc}');
/** Las reglas del contrato mismo: el bloque de contratos sin el de su subcolección `privado`. */
const REGLAS_DEL_CONTRATO = BLOQUE_PRIVADO ? BLOQUE_CONTRATOS.replace(BLOQUE_PRIVADO, '') : (BLOQUE_CONTRATOS ?? '');
const lineasDeAllow = (texto) => texto.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('allow '));

test('firestore.rules: el contrato se lee y se crea con cualquier sesión; se actualiza con cualquier sesión SI el porcentaje no cambia, o con dinero; se borra solo con dinero', () => {
  assert.ok(BLOQUE_CONTRATOS, 'el archivo trae el bloque de contratos');
  assert.deepEqual(lineasDeAllow(REGLAS_DEL_CONTRATO), [
    'allow read: if haySesion();',
    'allow create: if haySesion();',
    'allow update: if haySesion() && (esDinero() || sinTocarElPorcentaje());',
    'allow delete: if esDinero();',
  ]);
});

test('firestore.rules: la comparación es la que el espejo de esta prueba copia (si cambia aquí, cambia allá)', () => {
  const funcion = cuerpoDe(REGLAS_DEL_CONTRATO, 'function sinTocarElPorcentaje()');
  assert.ok(funcion, 'la función existe');
  assert.equal(
    funcion.replace(/\s+/g, ' ').trim(),
    "return request.resource.data.get('porcentajeComision', null) == resource.data.get('porcentajeComision', null);",
  );
});

test('firestore.rules: `esDinero()` solo se exige donde el código tiene un camino de dinero (cambiar el porcentaje) o ninguno (borrar)', () => {
  // Cada `esDinero()` que la regla del contrato exige tiene que corresponder a una escritura que el código HACE con la app 'dinero'. El
  // error que ninguna prueba ve es el contrario: exigir dinero en un camino que escribe con el mostrador. Hoy son dos, y están justificados.
  const exigencias = lineasDeAllow(REGLAS_DEL_CONTRATO).filter((l) => l.includes('esDinero()'));
  assert.deepEqual(exigencias, [
    'allow update: if haySesion() && (esDinero() || sinTocarElPorcentaje());', // enlazarContratosAlEmpleado (dinero), probado arriba
    'allow delete: if esDinero();', // nadie borra contratos, probado arriba
  ]);
});

test('firestore.rules: la subcolección `privado` y todo lo demás del archivo siguen como estaban (solo cambió el contrato)', () => {
  assert.deepEqual(lineasDeAllow(BLOQUE_PRIVADO), ['allow create, update: if haySesion();', 'allow read, delete: if esDinero();']);
  assert.match(REGLAS_SIN_COMENTARIOS, /match \/empleados\/\{id\}\s*\{ allow read: if haySesion\(\); allow write: if esDinero\(\); \}/);
  assert.match(REGLAS_SIN_COMENTARIOS, /match \/pagosComision\/\{id\}\s*\{ allow read, write: if esDinero\(\); \}/);
  assert.match(REGLAS_SIN_COMENTARIOS, /match \/pagosDueno\/\{id\}\s*\{ allow read, write: if esDinero\(\); \}/);
});

test('firestore.rules: el comentario de la regla dice la fecha y, sobre todo, lo que NO protege (los comentarios de este archivo ya mintieron dos veces)', () => {
  assert.match(REGLAS, /21 de octubre de 2026/);
  assert.match(REGLAS, /Lo que NO protege/);
  for (const palabra of ['CREAR', 'LEER']) assert.match(REGLAS, new RegExp(`- ${palabra}:`), `el comentario dice qué pasa con ${palabra}`);
  assert.match(REGLAS, /ADR-002/);
});

test('el archivo anterior de las reglas (el botón de deshacer del dueño) sigue siendo el de antes: el contrato lo escribe cualquier sesión, sin la regla nueva', () => {
  const anterior = leer('firestore.rules.anterior-2026-10-21.txt');
  const bloque = cuerpoDe(sinComentarios(anterior), 'match /contratos/{id}');
  assert.ok(bloque);
  assert.ok(bloque.includes('allow read, write: if haySesion();'), 'el contrato del archivo anterior se lee y se escribe con cualquier sesión');
  assert.doesNotMatch(anterior, /sinTocarElPorcentaje/);
  assert.match(anterior, /^rules_version = '2';/);
  assert.match(anterior, /GyyHuczWAzXILS99b0FtmpD06mK2/, 'trae el UID de la cuenta de dinero');
});
