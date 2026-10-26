// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en lo que la capa de datos ESCRIBE:
// el sello `actualizado` que nunca baja, los ids vacíos de un enlace, un pago de menos de un quetzal, el mensaje cuando una renta
// no tiene costo, y la migración que no debe pisar lo que ya había en `privado`. Cada una nació de un mutante que SOBREVIVIÓ: se le
// metió a propósito un error al código y las 2,589 pruebas de entonces seguían en verde. Aquí cada una falla con ese error puesto
// y pasa con el código bueno. Qué le habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  habilitarCarro, enlazarContratosAlDueno, enlazarContratosAlEmpleado, construirPagoDueno, guardarPagoDueno,
  construirPagoComision, pagoComisionParaGuardar, guardarPagoComision, migrarCostosDelDueno, anotarCostoDelDueno,
} from '../js/datos.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { carroPropio } from './fixtures/carroConServicios.mjs';
import { contratoReal, salidaReal } from './fixtures/contratoReal.mjs';
import { renta } from './fixtures/rentasConComision.mjs';
import {
  cerrado, sinCostoLeido, pagoReal,
} from './fixtures/duenoDeCarros.mjs';

const conDinero = (nube, extra = {}) => ({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, avisar: () => {}, ...extra });
const sinId = ({ id: _id, ...resto }) => resto;

// ---------------------------------------------------------------------------
// El sello `actualizado` de un cambio sobre lo que la nube tiene ahora
// ---------------------------------------------------------------------------

test('un cambio sobre un carro estampa un `actualizado` de AHORA, y nunca uno menor que el que ya tenía (aunque el reloj vaya atrasado)', async () => {
  // `Math.max(Date.now(), previo + 1)` -> solo `previo + 1`: el sello se quedaba pegado a la última cifra en vez de avanzar con
  // el reloj, y `mezclar` (cache.js) deja ganar al sello más grande: la copia de otra computadora le ganaba a este cambio.
  const viejo = { ...carroPropio(), actualizado: 1000 };
  const nube = nubeEnMemoria();
  nube.docs.set('vehiculos/v1', sinId(viejo));
  const antes = Date.now();
  const cambiado = await habilitarCarro('v1', { iniciar: nube.iniciar, guardarCopia: async () => {} });
  assert.ok(cambiado.actualizado >= antes, 'estampa la hora de ahora, no 1001');
  // Con el reloj de esta computadora ATRASADO (el documento ya trae un sello del futuro), el sello sube de todos modos.
  const futuro = Date.now() + 10 * 24 * 60 * 60 * 1000;
  nube.docs.set('vehiculos/v1', sinId({ ...carroPropio(), actualizado: futuro }));
  const otra = await habilitarCarro('v1', { iniciar: nube.iniciar, guardarCopia: async () => {} });
  assert.equal(otra.actualizado, futuro + 1, 'nunca baja del que ya tenía');
});

// ---------------------------------------------------------------------------
// Enlazar rentas a un dueño o a un empleado
// ---------------------------------------------------------------------------

test('enlazar rentas: los ids vacíos o repetidos no se escriben, y se devuelve la lista de las que sí', async () => {
  // `filter(Boolean)` quitado: un id vacío o null se intentaba escribir como documento «contratos/».
  const c1 = cerrado('c1');
  const c2 = cerrado('c2');
  const nubeD = nubeEnMemoria({ contratos: [c1, c2] });
  const hechas = await enlazarContratosAlDueno(['c1', '', null, undefined, 'c2', 'c1'], 'd1', { iniciar: nubeD.iniciar, ahora: 5000 });
  assert.deepEqual(hechas, ['c1', 'c2']);
  assert.equal(nubeD.leer('contratos/c1').duenoId, 'd1');
  assert.equal(nubeD.leer('contratos/c2').actualizado, 5000);
  assert.equal(nubeD.llamadas.filter(([op]) => op === 'commit').length, 1, 'un solo lote');
  await assert.rejects(() => enlazarContratosAlDueno([], 'd1', { iniciar: nubeD.iniciar }), /No hay contratos que enlazar/);

  const r1 = renta({ id: 'r1', recibidoEl: '2026-10-05' });
  const r2 = renta({ id: 'r2', numero: 2, recibidoEl: '2026-10-06' });
  const nubeE = nubeEnMemoria({ contratos: [r1, r2] });
  const enlazadas = await enlazarContratosAlEmpleado(['r1', null, '', 'r2', 'r1'], 'e9', {
    ...conDinero(nubeE), ahora: 6000, idsConPorcentaje: ['r2', 'otra', null], porcentajeComision: 7,
  });
  assert.deepEqual(enlazadas, ['r1', 'r2']);
  assert.equal(nubeE.leer('contratos/r1').empleadoId, 'e9');
  assert.equal(nubeE.leer('contratos/r1').porcentajeComision, 5, 'a la que no se pidió, no se le cambia el porcentaje');
  assert.equal(nubeE.leer('contratos/r2').porcentajeComision, 7);
});

// ---------------------------------------------------------------------------
// Un pago de menos de un quetzal sigue siendo un pago
// ---------------------------------------------------------------------------

test('un pago a un dueño o a un empleado de Q0.50 se guarda: lo único que se niega es el Q0.00', async () => {
  // `q(pago.monto) > 0` -> `> 1`: un pago de Q0.50 se rechazaba como si fuera de cero.
  const renta1 = cerrado('r1', 0, { dias: 1, costoDia: 0.5 });
  const pago = pagoReal({ id: 'p1', numero: 1, contratos: [renta1], idsMarcados: ['r1'] });
  assert.equal(pago.monto, 0.5);
  const nube = nubeEnMemoria();
  const guardado = await guardarPagoDueno(pago, { ...conDinero(nube), numeroNuevo: async () => 1 });
  assert.equal(guardado.monto, 0.5);
  assert.equal(nube.leer('pagosDueno/p1').monto, 0.5);

  const empleado = { id: 'e9', codigo: '9', nombre: 'Luis', porcentajeComision: 0.5, activo: true };
  const rentaChica = renta({
    id: 'r9', empleado, dias: 1, precioDia: 100, fechaSalida: '2026-10-01', recibidoEl: '2026-10-02',
  });
  const armado = construirPagoComision({
    empleadoId: 'e9', fecha: '2026-10-20', forma: 'efectivo', contratos: [rentaChica], pagos: [], idsMarcados: ['r9'],
  });
  assert.equal(armado.monto, 0.5, 'Q100 de base al 0.5 %');
  const nubeC = nubeEnMemoria();
  const pagoC = pagoComisionParaGuardar({ ...armado, numero: 1 }, { id: 'pc1', ahora: 1 });
  await guardarPagoComision(pagoC, conDinero(nubeC));
  assert.equal(nubeC.leer('pagosComision/pc1').monto, 0.5);
});

// ---------------------------------------------------------------------------
// Qué dice el mensaje cuando una renta no se puede pagar por su costo
// ---------------------------------------------------------------------------

test('el mensaje de «no se puede pagar» separa las rentas sin costo anotado de las que no se pudieron LEER, cada una en su frase', () => {
  // `contratos.filter(sinLeer)` / `filter(!sinLeer)` quitados: las dos frases hablaban de todas las rentas, y le decían «anótalo»
  // a quien solo tuvo un fallo de red.
  const buenas = [cerrado('c1'), cerrado('c2'), cerrado('c3')];
  const sinAnotar = cerrado('c2', 0, { costoDia: 0 });
  const sinLeer = sinCostoLeido('c3');
  const pagos = [];
  const marcar = (contratos, costoSinLeer) => {
    try {
      construirPagoDueno({
        duenoId: 'd1', fecha: '2026-10-01', forma: 'efectivo', contratos, pagos, idsMarcados: ['c1', 'c2', 'c3'], costoSinLeer,
      });
    } catch (e) {
      return e.message;
    }
    return null;
  };
  const numerar = (c, numero) => ({ ...c, numero });
  const mezcla = marcar([buenas[0], numerar(sinAnotar, 12), numerar(sinLeer, 15)], ['c3']);
  assert.match(mezcla, /^No se registró el pago\. El contrato N° 12 no tiene costo por día anotado: anota lo que le pagas al dueño por día y vuelve a marcarlo\./);
  assert.match(mezcla, /No se pudo leer el costo del contrato N° 15\. Revisa tu internet/);
  assert.doesNotMatch(mezcla, /contratos N°/, 'cada frase habla de UN contrato, en singular');
  const plural = marcar([buenas[0], numerar(sinAnotar, 12), numerar({ ...sinAnotar, id: 'c3' }, 13)], []);
  assert.match(plural, /Los contratos N° 12, N° 13 no tienen costo por día anotado/);
  const variosSinLeer = marcar([buenas[0], numerar(sinLeer, 15), numerar({ ...sinLeer, id: 'c2' }, 16)], ['c2', 'c3']);
  assert.match(variosSinLeer, /No se pudo leer el costo de los contratos N° 15, N° 16\./);
});

// ---------------------------------------------------------------------------
// La migración del costo del dueño no pisa lo que ya había detrás de la contraseña
// ---------------------------------------------------------------------------

test('migrar el costo copia a `privado/dinero` SIN borrar lo demás que ese documento ya guardaba', async () => {
  // `{ merge: true }` -> `false` en la escritura de la migración: `privado/dinero` puede traer otras cosas (la comisión, los
  // pagos al dueño: §7) y reemplazarlo entero las borraba. Es dinero detrás de la contraseña.
  const conCosto = { ...salidaReal({ id: 'c1', ajeno: true, costoDia: 300 }), id: 'c1' };
  const nube = nubeEnMemoria({ contratos: [conCosto], privados: { c1: { otraCosa: 'no la borres' } } });
  const r = await migrarCostosDelDueno({
    iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, leerCopia: async () => [], guardarCopia: async () => {},
  });
  assert.equal(r.migrados, 1);
  assert.deepEqual(sinId(nube.leer('contratos/c1/privado/dinero')), { otraCosa: 'no la borres', costoDia: 300 });
  assert.equal(nube.leer('contratos/c1').subarriendo?.costoDia, undefined, 'y el costo ya no está en el documento');
});

test('anotar el costo de una renta que ya tiene uno, aunque sea de Q0.50 al día, se niega: nunca se pisa un costo que ya está', async () => {
  // `costo > 0` -> `> 1` en las tres guardias de `anotarCostoDelDueno`: un costo de Q0.50 contaba como «no hay».
  const sinCosto = { ...contratoReal({ id: 'c1', ajeno: true, costoDia: 0 }), id: 'c1' };
  const nube = nubeEnMemoria({ contratos: [sinCosto] });
  const deps = { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero };
  assert.equal(await anotarCostoDelDueno(sinCosto, 0.5, deps), 0.5, 'el primero se anota: Q0.50 es un costo válido');
  await assert.rejects(() => anotarCostoDelDueno(sinCosto, 0.9, deps), /ya tiene un costo anotado/);
  assert.equal(nube.leer('contratos/c1/privado/dinero').costoDia, 0.5, 'el segundo no pisó al primero');
  // Con el costo todavía DENTRO del documento (sin nada en `privado`) también se niega: esa guardia va antes de leer `privado`.
  const conCostoEnElDocumento = { ...sinCosto, subarriendo: { costoDia: 0.5 } };
  const nubeNueva = nubeEnMemoria({ contratos: [conCostoEnElDocumento] });
  await assert.rejects(
    () => anotarCostoDelDueno(conCostoEnElDocumento, 0.9, { iniciar: nubeNueva.iniciar, dbDinero: () => nubeNueva.dbDinero }),
    /ya tiene un costo anotado/,
  );
  assert.equal(nubeNueva.leer('contratos/c1/privado/dinero'), undefined, 'y no escribió nada');
  await assert.rejects(() => anotarCostoDelDueno(sinCosto, 0, deps), /Escribe cuánto le pagas al dueño/);
});
