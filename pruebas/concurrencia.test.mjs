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
  guardarContrato, agregarPago, contratoParaGuardar, reservaParaGuardar,
  CODIGO_COPIA_VIEJA, MENSAJE_COPIA_VIEJA, cambioDesdeQueSeAbrio,
  CODIGO_RESERVACION_CAMBIO, MENSAJE_RESERVACION_YA_SALIO, MENSAJE_RESERVACION_CANCELADA, MENSAJE_RESERVACION_CAMBIO,
  nuevoIdContrato, nuevoIdCliente, nuevoIdReserva, nuevoIdVehiculo, nuevoIdDueno, altaConIdFijo, MENSAJE_ALTA_SIN_ID,
  guardarCliente, guardarDueno, guardarReserva, guardarVehiculo,
} from '../js/datos.js';
import { construirCliente } from '../js/nucleo/cliente.js';
import { construirDueno } from '../js/nucleo/dueno.js';
import { resumen } from '../js/nucleo/contrato.js';
import { construirContrato, conAnticipoComoPago, textoFalloAlGuardarElContrato } from '../js/pantallas/sacarCarro.js';
import { construirReserva } from '../js/nucleo/reserva.js';
import { textoFalloAlGuardarElCierre, conKmSalidaNormalizado } from '../js/pantallas/recibirCarro.js';
import { construirCierre } from '../js/nucleo/cierre.js';
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

test('H-1: lo que Recibir carro arma de verdad (cierre, kilometraje normalizado y cobro) conserva el sello — el candado lo alcanza', async () => {
  // Si alguna de estas funciones soltara `actualizado`, el contrato parecería «nuevo» y se escribiría sin comparar.
  const { nube, guardar, pestanaA, pestanaB } = dosPestanas();
  const alRecibir = (contrato) => cobrar(construirCierre(conKmSalidaNormalizado(contrato), {
    fechaReal: '2026-09-05', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
  }), 500);
  assert.equal(alRecibir(pestanaA).actualizado, pestanaA.actualizado);

  await guardar(alRecibir(pestanaA));
  await assert.rejects(guardar(alRecibir(pestanaB)), { codigo: CODIGO_COPIA_VIEJA });
  assert.deepEqual(montos(nube.leer('contratos/c4')), [1000, 500]);
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

// ---------------------------------------------------------------------------
// H-3. Dos pestañas sacando el carro de la misma reservación: dos contratos, dos anticipos
// ---------------------------------------------------------------------------
//
// Lo que cada pestaña arma es lo que arma «Sacar carro» de verdad: `construirContrato` y, si la reservación
// trae el anticipo pagado, `conAnticipoComoPago`. La reservación guardada sale de `reservaParaGuardar`.

/** Una reservación pendiente de un carro exacto, con Q400 de anticipo ya pagado, como queda guardada. */
const reservaPendiente = () => reservaParaGuardar(construirReserva({}, {
  clienteId: 'k1',
  clienteNombre: 'Juan Pérez',
  telefono: '5555-5555',
  fechaSalida: '2026-09-01',
  dias: 4,
  carroId: 'v1',
  carroPlacas: 'P-999TST',
  tipoVehiculo: '',
  precioDia: 700,
  anticipo: 400,
  anticipoPagado: true,
  nota: '',
}), { id: 'r7', ahora: 1790000000000 });

/** Lo que una pestaña manda a guardar al sacar el carro: el contrato nuevo (sin sello) con el anticipo como pago. */
function salidaDeLaReserva({ id, numero, reserva }) {
  const base = salidaPropia({ id, numero, montoPago: 2800 - 400 });
  return conAnticipoComoPago(base, reserva, { forma: 'efectivo' });
}

function dosPestanasConLaReserva() {
  const reserva = reservaPendiente();
  const nube = nubeEnMemoria();
  nube.docs.set('reservas/r7', structuredClone((({ id: _id, ...resto }) => resto)(reserva)));
  const copia = copiaLocalEnMemoria();
  const sacar = (contrato, reservaDeOrigen = reserva, extra = {}) => guardarContrato(contrato, {
    iniciar: nube.iniciar,
    guardarCopia: async (coleccion, docs) => { copia.guardarCopia(coleccion, docs); },
    avisar: () => assert.fail('no había nada que avisar'),
    numeroNuevo: async () => assert.fail('el número ya viene decidido'),
    reservaDeOrigen,
    ...extra,
  });
  const contratosEnLaNube = () => [...nube.docs.keys()].filter((r) => /^contratos\/[^/]+$/.test(r));
  return {
    reserva, nube, copia, sacar, contratosEnLaNube,
    pestanaA: salidaDeLaReserva({ id: 'c6', numero: 6, reserva }),
    pestanaB: salidaDeLaReserva({ id: 'c7', numero: 7, reserva }),
  };
}

const anticiposRegistrados = (nube) => [...nube.docs]
  .filter(([ruta]) => /^contratos\/[^/]+$/.test(ruta))
  .flatMap(([, c]) => c.pagos.filter((p) => p.monto === 400));

test('H-3: la segunda pestaña NO saca el carro otra vez — un contrato, un anticipo, y la reservación apunta al contrato', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA, pestanaB } = dosPestanasConLaReserva();
  assert.deepEqual(montos(pestanaA), [2400, 400], 'punto de partida: la salida registra el anticipo como un pago');

  await sacar(pestanaA);
  await assert.rejects(sacar(pestanaB), (error) => {
    assert.equal(error.codigo, CODIGO_RESERVACION_CAMBIO);
    assert.equal(error.message, MENSAJE_RESERVACION_YA_SALIO);
    return true;
  });

  assert.deepEqual(contratosEnLaNube(), ['contratos/c6'], 'un solo contrato');
  assert.equal(anticiposRegistrados(nube).length, 1, 'el anticipo de Q400 se registró una sola vez');
  assert.equal(nube.leer('reservas/r7').contratoId, 'c6');
  assert.equal(nube.leer('reservas/r7').estado, 'entregada');
});

test('H-3: las dos pestañas guardando a la vez — sale UNO de los dos contratos, nunca los dos ni ninguno', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA, pestanaB } = dosPestanasConLaReserva();
  const resultados = await Promise.allSettled([sacar(pestanaA), sacar(pestanaB)]);

  assert.deepEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(resultados.find((r) => r.status === 'rejected').reason.codigo, CODIGO_RESERVACION_CAMBIO);
  const ganador = resultados.find((r) => r.status === 'fulfilled').value;
  assert.deepEqual(contratosEnLaNube(), [`contratos/${ganador.id}`]);
  assert.equal(anticiposRegistrados(nube).length, 1);
  assert.equal(nube.leer('reservas/r7').contratoId, ganador.id, 'la reservación apunta al contrato que sí quedó');
});

test('H-3: el contrato y la marca de «entregada» se escriben en UNA transacción — no pueden separarse', async () => {
  const { nube, sacar, pestanaA } = dosPestanasConLaReserva();
  await sacar(pestanaA);
  assert.deepEqual(
    nube.escriturasEnTransaccion().map(([, ruta]) => ruta).sort(),
    ['contratos/c6', 'reservas/r7'],
  );
  assert.deepEqual(nube.escrituras(), [], 'y ninguna fuera de la transacción');
});

test('H-3: si la transacción falla, no queda el contrato sin la marca ni la marca sin el contrato', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA, copia } = dosPestanasConLaReserva();
  nube.fallan.push({ op: 'tx.get', ruta: 'reservas/r7' });
  await assert.rejects(sacar(pestanaA), /sin internet/);
  assert.deepEqual(contratosEnLaNube(), []);
  assert.equal(nube.leer('reservas/r7').contratoId, undefined);
  assert.equal(copia.guardados.size, 0, 'y la copia local ni se tocó');
});

test('H-3: el reintento de un guardado que SÍ había llegado (mismo contrato) no se niega — sigue siendo un solo contrato', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA } = dosPestanasConLaReserva();
  await sacar(pestanaA);
  // «No se pudo guardar el contrato. Intenta de nuevo.» y el primer intento había aterrizado.
  await sacar(pestanaA);
  assert.deepEqual(contratosEnLaNube(), ['contratos/c6']);
  assert.equal(anticiposRegistrados(nube).length, 1);
  assert.equal(nube.leer('reservas/r7').contratoId, 'c6');
});

test('H-3: una reservación cancelada mientras tanto tampoco sale: no se guarda nada y se dice por qué', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA } = dosPestanasConLaReserva();
  const otra = reservaParaGuardar({ ...reservaPendiente(), cancelada: true }, { id: 'r7', ahora: 1790000009000 });
  nube.docs.set('reservas/r7', structuredClone((({ id: _id, ...resto }) => resto)(otra)));
  await assert.rejects(sacar(pestanaA), (error) => {
    assert.equal(error.codigo, CODIGO_RESERVACION_CAMBIO);
    assert.equal(error.message, MENSAJE_RESERVACION_CANCELADA);
    return true;
  });
  assert.deepEqual(contratosEnLaNube(), []);
});

test('H-3: una reservación que cambió mientras tanto (otro anticipo) tampoco sale — el pago se calculó con el viejo', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA } = dosPestanasConLaReserva();
  const otra = reservaParaGuardar({ ...reservaPendiente(), anticipoPagado: false }, { id: 'r7', ahora: 1790000009000 });
  nube.docs.set('reservas/r7', structuredClone((({ id: _id, ...resto }) => resto)(otra)));
  await assert.rejects(sacar(pestanaA), (error) => {
    assert.equal(error.codigo, CODIGO_RESERVACION_CAMBIO);
    assert.equal(error.message, MENSAJE_RESERVACION_CAMBIO);
    return true;
  });
  assert.deepEqual(contratosEnLaNube(), [], 'un anticipo fantasma de Q400 no entra a un contrato');
});

test('H-3: al negarse deja en esta computadora la reservación como está en la nube', async () => {
  const { sacar, copia, pestanaA, pestanaB } = dosPestanasConLaReserva();
  await sacar(pestanaA);
  await assert.rejects(sacar(pestanaB), { codigo: CODIGO_RESERVACION_CAMBIO });
  assert.equal(copia.guardados.get('r7').contratoId, 'c6');
});

test('H-3: lo que queda en la copia local es el contrato y la reservación ya entregada', async () => {
  const { sacar, copia, pestanaA } = dosPestanasConLaReserva();
  await sacar(pestanaA);
  assert.equal(copia.guardados.get('c6').numero, 6);
  assert.equal(copia.guardados.get('r7').estado, 'entregada');
  assert.equal(copia.guardados.get('r7').contratoId, 'c6');
});

test('H-3: la marca se arma sobre la reservación de la NUBE — lo que no tiene que ver con la salida no se pisa', async () => {
  const { nube, sacar, pestanaA, reserva } = dosPestanasConLaReserva();
  // Una nota que otra pestaña agregó DESPUÉS de leer la reservación no cambia el sello (es un campo más):
  // aquí el sello coincide, así que la salida pasa y la nota de la nube se conserva.
  const enNube = nube.docs.get('reservas/r7');
  enNube.nota = 'llega por la tarde';
  await sacar(pestanaA, reserva);
  assert.equal(nube.leer('reservas/r7').nota, 'llega por la tarde');
});

test('H-3: una reservación que ya no existe en la nube no estorba: la salida se guarda y la marca se vuelve a crear', async () => {
  const { nube, sacar, contratosEnLaNube, pestanaA } = dosPestanasConLaReserva();
  nube.docs.delete('reservas/r7');
  await sacar(pestanaA);
  assert.deepEqual(contratosEnLaNube(), ['contratos/c6']);
  assert.equal(nube.leer('reservas/r7').contratoId, 'c6');
});

test('H-3: una salida SIN reservación no toca ninguna reservación ni usa transacción (como siempre)', async () => {
  const { nube, sacar, pestanaA } = dosPestanasConLaReserva();
  await sacar(pestanaA, null);
  assert.deepEqual(nube.escrituras().map(([, ruta]) => ruta), ['contratos/c6']);
  assert.equal(nube.escriturasEnTransaccion().length, 0);
  assert.equal(nube.leer('reservas/r7').contratoId, undefined);
});

test('H-3: los tres rechazos hablan claro y ninguno dice «intenta de nuevo»', () => {
  for (const frase of [MENSAJE_RESERVACION_YA_SALIO, MENSAJE_RESERVACION_CANCELADA, MENSAJE_RESERVACION_CAMBIO]) {
    assert.match(frase, /No se guardó nada/);
    assert.doesNotMatch(frase, /Intenta de nuevo/i);
  }
  assert.match(MENSAJE_RESERVACION_YA_SALIO, /otra pestaña u otra computadora/);
  assert.match(MENSAJE_RESERVACION_YA_SALIO, /Contratos/);
});

test('«Sacar carro» dice la frase del rechazo; un fallo cualquiera sigue pidiendo intentar de nuevo', () => {
  for (const mensaje of [MENSAJE_RESERVACION_YA_SALIO, MENSAJE_RESERVACION_CANCELADA, MENSAJE_RESERVACION_CAMBIO]) {
    assert.equal(textoFalloAlGuardarElContrato(Object.assign(new Error(mensaje), { codigo: CODIGO_RESERVACION_CAMBIO })), mensaje);
  }
  assert.equal(textoFalloAlGuardarElContrato(new Error('La nube no respondió a tiempo.')), 'No se pudo guardar el contrato. Intenta de nuevo.');
  assert.equal(textoFalloAlGuardarElContrato(undefined), 'No se pudo guardar el contrato. Intenta de nuevo.');
});

test('estructura: «Sacar carro» saca el contrato y marca la reservación en UN solo guardado, y usa el texto del rechazo', () => {
  const fuente = leerFuente('../js/pantallas/sacarCarro.js');
  const guardar = fuente.slice(fuente.indexOf('async function guardar(ev)'), fuente.indexOf('// ---------- Cablear los eventos'));
  assert.match(guardar, /guardarContrato\(contrato, \{ reservaDeOrigen: reservaOrigen \}\)/);
  assert.doesNotMatch(guardar, /guardarReserva\(/, 'marcarla aparte, después, es lo que dejaba el hueco');
  assert.match(guardar, /aviso\(textoFalloAlGuardarElContrato\(error\), 'error'\)/);
});

// ---------------------------------------------------------------------------
// H-2. Un tiempo de espera vencido y luego un reintento: el reintento duplicaba el registro
// ---------------------------------------------------------------------------
//
// Con internet lento la pantalla se da por vencida a los 8 s («No se pudo guardar. Intenta de nuevo.») pero la
// primera escritura, que el SDK mantiene en cola, SÍ llega. Si el reintento acuña otro id, quedan dos
// documentos. Los contratos (`nuevoIdContrato`) y los pagos a dueños (`nuevoIdPagoDueno`) ya lo evitaban
// acuñando el id UNA vez, antes del primer intento; reservaciones, clientes, carros y dueños no. Es el mismo
// patrón, con las mismas funciones `nuevoId*`, y una sola regla para cuándo se suelta el id (`altaConIdFijo`).

const ALTAS = [
  {
    coleccion: 'clientes',
    nuevoId: nuevoIdCliente,
    guardar: guardarCliente,
    registro: (nombre = 'Ana') => construirCliente({}, { nombres: nombre, apellidos: 'López', documento: '1234567890101', telefono: '5555-1111' }),
  },
  {
    coleccion: 'duenos',
    nuevoId: nuevoIdDueno,
    guardar: guardarDueno,
    registro: (nombre = 'MARIO LÓPEZ') => construirDueno({}, { nombre, telefono: '7777-7777', nit: '12345678-7', nota: '' }),
  },
  {
    coleccion: 'reservas',
    nuevoId: nuevoIdReserva,
    guardar: guardarReserva,
    registro: (nombre = 'Juan Pérez') => construirReserva({}, {
      clienteId: 'k1', clienteNombre: nombre, telefono: '5555-5555', fechaSalida: '2026-09-01', dias: 4, carroId: 'v1',
      carroPlacas: 'P-999TST', tipoVehiculo: '', precioDia: 700, anticipo: 400, anticipoPagado: true, nota: '',
    }),
  },
  {
    coleccion: 'vehiculos',
    nuevoId: nuevoIdVehiculo,
    guardar: guardarVehiculo,
    registro: (placas = 'P-123ABC') => ({
      placas, tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', modelo: '2022', propiedad: 'Propio',
    }),
  },
];

const documentosDe = (nube, coleccion) => [...nube.docs.keys()].filter((r) => r.startsWith(`${coleccion}/`) && r.split('/').length === 2);

/**
 * La nube con el internet lento: la PRIMERA escritura de cada documento llega, pero a quien guarda le toca el
 * tiempo de espera vencido («La nube no respondió a tiempo.»). Las siguientes salen bien.
 */
function nubeLenta() {
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
  const original = nube.fsMod.setDoc;
  let primera = true;
  nube.fsMod.setDoc = async (ref, datos, opciones) => {
    await original(ref, datos, opciones);
    if (primera) {
      primera = false;
      throw new Error('La nube no respondió a tiempo.');
    }
  };
  const copia = copiaLocalEnMemoria();
  return {
    nube,
    deps: { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} },
  };
}

for (const alta of ALTAS) {
  test(`H-2 (${alta.coleccion}): un tiempo vencido y luego el reintento dejan UN documento, no dos`, async () => {
    const { nube, deps } = nubeLenta();
    const intencion = altaConIdFijo(() => alta.nuevoId({ iniciar: nube.iniciar }));

    await assert.rejects(alta.guardar(await intencion.paraGuardar(alta.registro()), deps), /no respondió a tiempo/);
    assert.equal(documentosDe(nube, alta.coleccion).length, 1, 'punto de partida: el primer intento sí llegó');
    const guardado = await alta.guardar(await intencion.paraGuardar(alta.registro()), deps); // «Intenta de nuevo»
    intencion.terminada();

    assert.equal(documentosDe(nube, alta.coleccion).length, 1, 'el reintento cayó en el mismo documento');
    assert.deepEqual(documentosDe(nube, alta.coleccion), [`${alta.coleccion}/${guardado.id}`]);
  });

  test(`H-2 (${alta.coleccion}): sin el id decidido de antemano NO se guarda — un alta que no se puede repetir no existe`, async () => {
    const { nube, deps } = nubeLenta();
    await assert.rejects(alta.guardar(alta.registro(), deps), (error) => {
      assert.equal(error.message, MENSAJE_ALTA_SIN_ID);
      return true;
    });
    assert.equal(documentosDe(nube, alta.coleccion).length, 0, 'ni siquiera llegó a la nube');
  });

  test(`H-2 (${alta.coleccion}): dos altas DISTINTAS, una detrás de otra, son dos documentos — el id no se reutiliza después de un guardado bueno`, async () => {
    const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
    const copia = copiaLocalEnMemoria();
    const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };
    const intencion = altaConIdFijo(() => alta.nuevoId({ iniciar: nube.iniciar }));

    const primera = await alta.guardar(await intencion.paraGuardar(alta.registro()), deps);
    intencion.terminada();
    const segunda = await alta.guardar(await intencion.paraGuardar(alta.registro(alta.coleccion === 'vehiculos' ? 'P-999ZZZ' : 'Otra')), deps);
    intencion.terminada();

    assert.notEqual(primera.id, segunda.id);
    assert.equal(documentosDe(nube, alta.coleccion).length, 2, 'la segunda alta no pisó a la primera');
  });

  test(`H-2 (${alta.coleccion}): editar un registro que ya existe sigue siendo editar — conserva su id y no gasta uno nuevo`, async () => {
    const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
    const copia = copiaLocalEnMemoria();
    const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };
    let minteados = 0;
    const intencion = altaConIdFijo(async () => { minteados += 1; return alta.nuevoId({ iniciar: nube.iniciar }); });
    const existente = await alta.guardar(await intencion.paraGuardar(alta.registro()), deps);
    intencion.terminada();
    const antes = minteados;

    const editado = await alta.guardar(await intencion.paraGuardar({ ...existente, nota: 'editado' }), deps);
    assert.equal(editado.id, existente.id);
    assert.equal(minteados, antes, 'una edición no pide un id nuevo');
    assert.equal(documentosDe(nube, alta.coleccion).length, 1);
  });
}

test('H-2: nuevoId* da un id sin escribir nada, en la colección que toca, y cada uno es distinto', async () => {
  const nube = nubeEnMemoria();
  const opciones = { iniciar: nube.iniciar };
  const casos = [
    [nuevoIdContrato, 'contratos'], [nuevoIdCliente, 'clientes'], [nuevoIdReserva, 'reservas'],
    [nuevoIdVehiculo, 'vehiculos'], [nuevoIdDueno, 'duenos'],
  ];
  for (const [pedir, coleccion] of casos) {
    const uno = await pedir(opciones);
    const otro = await pedir(opciones);
    assert.ok(uno && otro && uno !== otro, `${coleccion}: ids distintos`);
    assert.ok(uno.startsWith('auto-'), `${coleccion}: lo acuñó la colección correcta (la falsa los numera)`);
  }
  assert.equal(nube.escrituras().length, 0, 'pedir un id no escribe nada: solo lo decide');
  assert.equal(nube.docs.size, 0);
});

test('altaConIdFijo: el mismo id en cada reintento, aunque se pida a la vez (doble clic), y uno nuevo después de terminar', async () => {
  let n = 0;
  const intencion = altaConIdFijo(async () => `id-${(n += 1)}`);
  const [a, b] = await Promise.all([intencion.paraGuardar({ nombre: 'x' }), intencion.paraGuardar({ nombre: 'x' })]);
  assert.equal(a.id, 'id-1');
  assert.equal(b.id, 'id-1', 'dos clics seguidos son una sola alta');
  assert.equal((await intencion.paraGuardar({ nombre: 'x' })).id, 'id-1', 'y el reintento también');
  assert.equal(n, 1);
  intencion.terminada();
  assert.equal((await intencion.paraGuardar({ nombre: 'y' })).id, 'id-2', 'terminada una alta, la siguiente es otra');
});

test('altaConIdFijo: lo que ya trae id (una edición) pasa tal cual, sin pedir nada', async () => {
  let n = 0;
  const intencion = altaConIdFijo(async () => `id-${(n += 1)}`);
  const registro = { id: 'c9', nombre: 'x' };
  assert.equal(await intencion.paraGuardar(registro), registro);
  assert.equal(n, 0);
});

test('altaConIdFijo: si pedir el id FALLA, el siguiente intento lo vuelve a pedir — no se queda con una promesa rechazada', async () => {
  let n = 0;
  const intencion = altaConIdFijo(async () => {
    n += 1;
    if (n === 1) throw new Error('Firebase no arrancó');
    return `id-${n}`;
  });
  await assert.rejects(intencion.paraGuardar({ nombre: 'x' }), /no arrancó/);
  assert.equal((await intencion.paraGuardar({ nombre: 'x' })).id, 'id-2');
});

test('altaConIdFijo: con una clave distinta es OTRA alta (un intento fallido de un grupo no se le pega a otro)', async () => {
  let n = 0;
  const intencion = altaConIdFijo(async () => `id-${(n += 1)}`);
  assert.equal((await intencion.paraGuardar({ nombre: 'a' }, 'texto:a')).id, 'id-1');
  assert.equal((await intencion.paraGuardar({ nombre: 'a' }, 'texto:a')).id, 'id-1');
  assert.equal((await intencion.paraGuardar({ nombre: 'b' }, 'texto:b')).id, 'id-2');
});

test('H-2: el carro nuevo reintentado cae en el mismo documento; el código correlativo deja un hueco, no un carro repetido', async () => {
  // El código correlativo sale de una transacción; si el primer intento llegó, el reintento (mismo id) pide otro y
  // lo sobrescribe: un hueco en la numeración, no un carro repetido. Se deja dicho para que nadie lo «arregle» mal.
  const { nube, deps } = nubeLenta();
  const intencion = altaConIdFijo(() => nuevoIdVehiculo({ iniciar: nube.iniciar }));
  const vehiculo = ALTAS[3].registro();
  await assert.rejects(guardarVehiculo(await intencion.paraGuardar(vehiculo), deps), /no respondió a tiempo/);
  const guardado = await guardarVehiculo(await intencion.paraGuardar(vehiculo), deps);
  assert.equal(documentosDe(nube, 'vehiculos').length, 1);
  assert.equal(guardado.codigo, 5, 'el reintento tomó el siguiente código: el 4 quedó sin usar, un hueco que se explica');
});

test('estructura: cada pantalla que da de alta guarda con el id decidido de antemano (`altaConIdFijo`) y lo suelta al terminar', () => {
  // [archivo, guardado, función que acuña, llamadas en total, de ellas, altas que pasan por paraGuardar()]
  // Las que sobran son EDICIONES de algo que ya existe y ya traen su id (carros: marcar fuera de servicio, habilitar).
  const sitios = [
    ['reservas', 'guardarReserva', 'nuevoIdReserva', 1, 1],
    ['clientes', 'guardarCliente', 'nuevoIdCliente', 1, 1],
    ['duenos', 'guardarDueno', 'nuevoIdDueno', 1, 1],
    ['carros', 'guardarVehiculo', 'nuevoIdVehiculo', 4, 1],
    ['sacarCarro', 'guardarCliente', 'nuevoIdCliente', 1, 1],
    ['sacarCarro', 'guardarDueno', 'nuevoIdDueno', 1, 1],
    ['dinero', 'guardarDueno', 'nuevoIdDueno', 1, 1],
  ];
  for (const [pantalla, guardado, acuna, total, altas] of sitios) {
    const codigo = leerFuente(`../js/pantallas/${pantalla}.js`).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.match(codigo, new RegExp(`altaConIdFijo\\(${acuna}\\)`), `${pantalla}: acuña con ${acuna}`);
    assert.equal([...codigo.matchAll(new RegExp(`\\b${guardado}\\(`, 'g'))].length, total, `${pantalla}: llamadas a ${guardado}`);
    assert.equal(
      [...codigo.matchAll(new RegExp(`\\b${guardado}\\(await [\\w.]+\\.paraGuardar\\(`, 'g'))].length,
      altas,
      `${pantalla}: ${guardado} debe recibir el registro de paraGuardar() en cada alta`,
    );
    assert.match(codigo, /\.terminada\(\)/, `${pantalla}: suelta el id cuando el alta salió bien`);
  }
});
