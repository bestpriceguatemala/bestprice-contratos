// Escrituras que se cruzan y reintentos (prueba del sistema, 7 oct 2026: H-1, H-2 y H-3).
//
// Las tres fallas son de una familia: dos pestañas (o un reintento) que escriben sobre lo mismo sin
// enterarse una de la otra. Aquí se prueban las dos ideas que las resuelven:
//
//   1. Un documento que YA existe solo se reescribe si en la nube sigue siendo el que se abrió. La
//      comprobación va dentro de la misma transacción que escribe (H-1: un pago que desaparece; H-3: una
//      reservación que sale dos veces).
//   2. Un alta nueva decide su identificador ANTES del primer intento y lo conserva (H-2).
//
// La Firestore de estas pruebas es la de `fixtures/nubeEnMemoria.mjs`: de mentira, pero con
// transacciones que se descartan y se repiten si alguien escribió en medio. NO prueba a Firebase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  guardarContrato, agregarPago, contratoParaGuardar,
  CODIGO_COPIA_VIEJA, MENSAJE_COPIA_VIEJA, cambioDesdeQueSeAbrio,
} from '../js/datos.js';
import { resumen } from '../js/nucleo/contrato.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { textoFalloAlGuardarElCierre } from '../js/pantallas/recibirCarro.js';
import { textoFalloAlAnular } from '../js/pantallas/contratos.js';
import { textoFalloAlLiberar } from '../js/pantallas/flota.js';
import { nubeEnMemoria, copiaLocalEnMemoria } from './fixtures/nubeEnMemoria.mjs';

const leerFuente = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

const CLIENTE = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };

/** Una salida de un carro propio, armada como la arma «Sacar carro»: 4 días a Q700 = Q2,800. */
function salidaPropia({ id, numero = 4, montoPago = 1000 }) {
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
    montoPago,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

/** El documento tal como queda en la nube después de guardarse por primera vez. */
const guardado = (c, ahora = 1790000000000) => contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora });

/** Dos pestañas abren el mismo contrato: cada una tiene su copia en memoria, con el mismo sello. */
function dosPestanas() {
  const enLaNube = guardado(salidaPropia({ id: 'c4' }));
  const nube = nubeEnMemoria({ contratos: [enLaNube] });
  const copia = copiaLocalEnMemoria([enLaNube]);
  const guardar = (contrato) => guardarContrato(contrato, {
    iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => assert.fail('no había nada que avisar'),
  });
  return {
    nube, copia, guardar, pestanaA: structuredClone(enLaNube), pestanaB: structuredClone(enLaNube),
  };
}

const cobrar = (contrato, monto, fecha = '2026-09-05') => agregarPago(contrato, { monto, forma: 'efectivo', fecha });
const montos = (contrato) => contrato.pagos.map((p) => p.monto);

// ---------------------------------------------------------------------------
// H-1. Dos pestañas cobrando la misma renta: un pago SE PERDÍA en silencio
// ---------------------------------------------------------------------------

test('H-1: la segunda pestaña NO pisa el pago de la primera — se niega, y los Q500 siguen en lo guardado', async () => {
  const { nube, guardar, pestanaA, pestanaB } = dosPestanas();
  assert.deepEqual(montos(pestanaA), [1000], 'punto de partida: la renta lleva Q1,000 pagados y debe Q1,800');

  await guardar(cobrar(pestanaA, 500)); // la A cobra Q500: «Falta cobrar Q1,300»
  // La B sigue mostrando «Falta cobrar Q1,800» y cobra Q300 sobre esa copia vieja.
  await assert.rejects(guardar(cobrar(pestanaB, 300)), (error) => {
    assert.equal(error.codigo, CODIGO_COPIA_VIEJA);
    return true;
  });

  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500], 'lo que el cliente entregó sigue ahí: ni se perdió ni se mezcló');
  assert.equal(resumen(nube.leer('contratos/c4')).saldo, 1300);
});

test('H-1: tampoco se «mezclan» los dos arreglos de pagos — el que llegó tarde no deja ni la mitad escrita', async () => {
  const { nube, guardar, pestanaA, pestanaB } = dosPestanas();
  await guardar(cobrar(pestanaA, 500));
  const antes = structuredClone(nube.leer('contratos/c4'));
  await assert.rejects(guardar(cobrar(pestanaB, 300)), { codigo: CODIGO_COPIA_VIEJA });
  assert.deepEqual(nube.leer('contratos/c4'), antes, 'la nube quedó exactamente como la dejó la primera pestaña');
  assert.equal(nube.escrituras('contratos/c4').length, 0);
  assert.equal(nube.escriturasEnTransaccion('contratos/c4').length, 1, 'solo la escritura de la primera pestaña');
});

test('H-1: las dos pestañas guardando a la vez — gana una, la otra se niega, y NUNCA quedan los dos pagos ni ninguno', async () => {
  const { nube, guardar, pestanaA, pestanaB } = dosPestanas();
  const resultados = await Promise.allSettled([guardar(cobrar(pestanaA, 500)), guardar(cobrar(pestanaB, 300))]);

  assert.deepEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  const rechazada = resultados.find((r) => r.status === 'rejected');
  assert.equal(rechazada.reason.codigo, CODIGO_COPIA_VIEJA);
  const guardados = montos(nube.leer('contratos/c4'));
  assert.equal(guardados.length, 2, 'el pago de la salida más el de la pestaña que ganó');
  assert.ok(guardados[1] === 500 || guardados[1] === 300, `quedó ${guardados[1]}`);
});

test('H-1: el rechazo trae la frase en español llano — qué pasó, que no se guardó nada y qué hacer', () => {
  assert.equal(CODIGO_COPIA_VIEJA, 'copia-vieja');
  assert.match(MENSAJE_COPIA_VIEJA, /otra pestaña/);
  assert.match(MENSAJE_COPIA_VIEJA, /otra computadora/);
  assert.match(MENSAJE_COPIA_VIEJA, /No se guardó nada/);
  assert.match(MENSAJE_COPIA_VIEJA, /Recarga la página/);
  assert.match(MENSAJE_COPIA_VIEJA, /vuelve a hacerlo/);
  assert.doesNotMatch(MENSAJE_COPIA_VIEJA, /Intenta de nuevo/i, '«intenta de nuevo» no sirve: la copia en memoria sigue vieja');
});

test('H-1: el error es el mismo de siempre en el objeto — su `message` es la frase', async () => {
  const { guardar, pestanaA, pestanaB } = dosPestanas();
  await guardar(cobrar(pestanaA, 500));
  await assert.rejects(guardar(cobrar(pestanaB, 300)), (error) => {
    assert.equal(error.message, MENSAJE_COPIA_VIEJA);
    return true;
  });
});

test('H-1: al negarse deja en ESTA computadora la copia de la nube, para que «recargar» de verdad muestre lo nuevo', async () => {
  // `cargarContrato` sirve la copia local primero: sin esto, recargar mostraría la misma copia vieja y el
  // intento siguiente se negaría otra vez, para siempre.
  const nube = nubeEnMemoria({ contratos: [guardado(salidaPropia({ id: 'c4' }))] });
  const vieja = nube.leer('contratos/c4');
  const copia = copiaLocalEnMemoria([vieja]);
  // Otra computadora cobró Q500 y subió el sello; esta no se enteró.
  const otra = { ...cobrar(vieja, 500), actualizado: vieja.actualizado + 5000 };
  nube.docs.set('contratos/c4', structuredClone((({ id: _id, ...resto }) => resto)(otra)));

  await assert.rejects(
    guardarContrato(cobrar(vieja, 300), { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} }),
    { codigo: CODIGO_COPIA_VIEJA },
  );
  assert.deepEqual(montos(copia.guardados.get('c4')), [1000, 500], 'la copia local ya tiene lo que hay en la nube');
});

test('H-1: si la copia local no se puede escribir al negarse, igual se niega con su frase', async () => {
  const { nube, pestanaA, pestanaB } = dosPestanas();
  const sinCopia = { iniciar: nube.iniciar, guardarCopia: async () => { throw new Error('VersionError'); }, avisar: () => {} };
  await guardarContrato(cobrar(pestanaA, 500), sinCopia);
  await assert.rejects(guardarContrato(cobrar(pestanaB, 300), sinCopia), { codigo: CODIGO_COPIA_VIEJA });
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500]);
});

test('una copia al día guarda sin estorbos — también la que la pantalla recibe de vuelta al guardar', async () => {
  const { nube, guardar, pestanaA } = dosPestanas();
  const primero = await guardar(cobrar(pestanaA, 500));
  // «Anular» reasigna el contrato con lo que devuelve el guardado y puede guardar otra vez.
  const segundo = await guardar(cobrar(primero, 300));
  assert.deepEqual(montos(segundo), [1000, 500, 300]);
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500, 300]);
});

test('una copia al día guarda aunque pase tiempo: el sello que cuenta es el de la nube, no el reloj', async () => {
  const { nube, guardar, pestanaA } = dosPestanas();
  const ahora = Date.now;
  try {
    Date.now = () => ahora() + 3 * 3600 * 1000; // pasan tres horas
    await guardar(cobrar(pestanaA, 500));
  } finally {
    Date.now = ahora;
  }
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500]);
});

test('el rechazo se decide por IGUALDAD de sello, no por orden: una nube con sello MÁS VIEJO también es otra versión', () => {
  // Dos computadoras con el reloj desfasado: la que escribió después puede traer un sello menor.
  // «¿es la misma versión que abrí?» se contesta aunque los relojes no coincidan.
  assert.equal(cambioDesdeQueSeAbrio({ actualizado: 100 }, { actualizado: 100 }), false);
  assert.equal(cambioDesdeQueSeAbrio({ actualizado: 100 }, { actualizado: 250 }), true, 'la nube es más nueva');
  assert.equal(cambioDesdeQueSeAbrio({ actualizado: 100 }, { actualizado: 40 }), true, 'la nube trae otro sello, aunque sea menor');
  assert.equal(cambioDesdeQueSeAbrio({ actualizado: 100 }, {}), true, 'la nube ya no trae sello');
  assert.equal(cambioDesdeQueSeAbrio({}, {}), false);
});

test('H-1: dos relojes desfasados — la otra computadora guardó DESPUÉS pero con un sello MENOR — también se niega', async () => {
  // Con una comparación por orden («¿la nube es más nueva?») este pago se perdía igual, por unos minutos de reloj.
  const base = guardado(salidaPropia({ id: 'c4' }));
  const nube = nubeEnMemoria({ contratos: [base] });
  const copia = copiaLocalEnMemoria([base]);
  const cobradoEnLaOtra = { ...cobrar(base, 500), actualizado: base.actualizado - 4 * 60 * 1000 };
  nube.docs.set('contratos/c4', structuredClone((({ id: _id, ...resto }) => resto)(cobradoEnLaOtra)));

  await assert.rejects(
    guardarContrato(cobrar(base, 300), { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} }),
    { codigo: CODIGO_COPIA_VIEJA },
  );
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500]);
});

test('H-1: un documento que ya no existe en la nube no es un «cambio»: se vuelve a crear, como siempre', async () => {
  const enLaNube = guardado(salidaPropia({ id: 'c4' }));
  const nube = nubeEnMemoria({ contratos: [] });
  const copia = copiaLocalEnMemoria([enLaNube]);
  await guardarContrato(cobrar(enLaNube, 500), { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} });
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500]);
});

test('H-1: un contrato NUEVO (sin sello) cuyo primer intento sí llegó se reintenta en su mismo documento, no se niega', async () => {
  // Es el patrón de `nuevoIdContrato`: «No se pudo guardar» + el primer intento que sí había llegado.
  const nuevo = salidaPropia({ id: 'c9', numero: 9 });
  assert.equal('actualizado' in nuevo, false, 'punto de partida: un contrato recién armado no trae sello');
  const nube = nubeEnMemoria();
  const copia = copiaLocalEnMemoria();
  const opciones = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };
  await guardarContrato(nuevo, opciones);
  await guardarContrato(nuevo, opciones); // el reintento
  assert.equal([...nube.docs.keys()].filter((r) => /^contratos\/[^/]+$/.test(r)).length, 1, 'un solo documento');
});

test('H-1: sin red NO se guarda (ni se deja en cola): el error es el de la red, no el de «cambió»', async () => {
  const { nube, copia, pestanaA } = dosPestanas();
  nube.fallan.push({ op: 'tx.get' });
  await assert.rejects(
    guardarContrato(cobrar(pestanaA, 500), { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} }),
    (error) => {
      assert.match(error.message, /sin internet/);
      assert.equal(error.codigo, undefined);
      return true;
    },
  );
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000], 'nada quedó escrito ni pendiente');
});

test('liberar la garantía desde una lista vieja ya no pisa los daños que otra pestaña acababa de agregar', async () => {
  // El segundo ejemplo de H-1: con la copia vieja de la lista, el cierre viejo borraba los daños nuevos.
  // `liberarGarantia` guarda con este mismo `guardarContrato`: esto es lo que le llega.
  const base = guardado(salidaPropia({ id: 'c4', montoPago: 2800 }));
  const nube = nubeEnMemoria({ contratos: [base] });
  const copia = copiaLocalEnMemoria([base]);
  const vieja = structuredClone(base);
  const otra = { ...base, cierre: { fechaReal: '2026-09-05', danos: 400 }, actualizado: base.actualizado + 1 };
  nube.docs.set('contratos/c4', structuredClone((({ id: _id, ...resto }) => resto)(otra)));

  await assert.rejects(
    guardarContrato({ ...vieja, garantiaLiberada: true, garantiaLiberadaEn: '2026-09-06' }, {
      iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {},
    }),
    { codigo: CODIGO_COPIA_VIEJA },
  );
  assert.equal(nube.leer('contratos/c4').cierre.danos, 400);
  assert.equal(nube.leer('contratos/c4').garantiaLiberada, false, 'la garantía sigue sin liberarse');
});

// ---------------------------------------------------------------------------
// Lo que lee cada pantalla que guarda contratos
// ---------------------------------------------------------------------------

test('cada pantalla que guarda un contrato dice la frase del rechazo, no «intenta de nuevo»', () => {
  const error = Object.assign(new Error(MENSAJE_COPIA_VIEJA), { codigo: CODIGO_COPIA_VIEJA });
  assert.equal(textoFalloAlGuardarElCierre(error), MENSAJE_COPIA_VIEJA, 'Recibir carro');
  assert.equal(textoFalloAlAnular(error), MENSAJE_COPIA_VIEJA, 'Anular un pago');
  assert.equal(textoFalloAlLiberar(error), MENSAJE_COPIA_VIEJA, 'Liberar la garantía');
});

test('«Cobrar» (el modo de solo cobro de Recibir carro) también la dice — su aviso era un «intenta de nuevo» suelto', async () => {
  const { textoFalloAlRegistrarElAbono } = await import('../js/pantallas/recibirCarro.js');
  const error = Object.assign(new Error(MENSAJE_COPIA_VIEJA), { codigo: CODIGO_COPIA_VIEJA });
  assert.equal(textoFalloAlRegistrarElAbono(error), MENSAJE_COPIA_VIEJA);
  assert.equal(textoFalloAlRegistrarElAbono(new Error('La nube no respondió a tiempo.')), 'No se pudo registrar el abono. Intenta de nuevo.');
  assert.match(leerFuente('../js/pantallas/recibirCarro.js'), /aviso\(textoFalloAlRegistrarElAbono\(error\), 'error'\)/);
});
