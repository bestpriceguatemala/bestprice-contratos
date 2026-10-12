// Pruebas de «el historial del último año» de un cliente (nucleo/historial.js).
//
// H-4 de la prueba del sistema (7 oct 2026): «Este cliente ya devolvió tarde» y la marca «Devolvió tarde»
// casi nunca se prendían, porque solo miraban los contratos ABIERTOS y un cliente que devolvió tarde, pagó y
// cerró (el caso normal) quedaba limpio. El dueño decidió mirar el último año de sus rentas: no todo el
// historial (cada vez que elige un cliente sería una lectura de nube más grande, y una devolución tarde de
// hace tres años no informa la decisión de hoy).
//
// Los contratos se arman con las funciones que los arman de verdad (pruebas/fixtures/contratoDeUnCarro.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_DEL_HISTORIAL, desdeDelHistorial, sinRepetir, devolucionesTardias, revisionDeDevoluciones, textoDeVecesTarde,
} from '../js/nucleo/historial.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';
import { diasEntre } from '../js/nucleo/fechas.js';

const HOY = '2026-10-11';

// Juan: sale el 3 ago, debía volver el 7 y volvió el 10 (3 días tarde), pagó los 3 días y quedó cerrado.
const juanTardeYCerrado = (extra = {}) => contratoDeUnCarro({
  id: 'c-juan', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 0, ...extra,
});
const aTiempoYCerrado = (extra = {}) => contratoDeUnCarro({
  id: 'c-a-tiempo', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-07', danos: 0, ...extra,
});

test('la ventana es de un año exacto: 365 días antes de hoy', () => {
  assert.equal(DIAS_DEL_HISTORIAL, 365);
  assert.equal(desdeDelHistorial(HOY), '2025-10-11');
  assert.equal(diasEntre(desdeDelHistorial(HOY), HOY), 365);
});

test('el fixture de Juan es lo que dice ser: cerrado, pagado, y 3 días tarde', () => {
  const c = juanTardeYCerrado();
  assert.equal(c.estado, 'cerrado');
  assert.equal(c.cierre.fechaReal, '2026-08-10');
  assert.equal(c.devolucionPrevista, '2026-08-07');
});

test('devolucionesTardias: cuenta una devolución tarde aunque el contrato ya esté cerrado y pagado', () => {
  assert.equal(devolucionesTardias([juanTardeYCerrado()], HOY), 1);
});

test('devolucionesTardias: a tiempo, o con el carro todavía afuera, no cuentan', () => {
  const afuera = contratoDeUnCarro({ id: 'c-afuera', fechaSalida: '2026-10-01', dias: 3 }); // debía volver el 4 y no ha vuelto
  assert.equal(devolucionesTardias([aTiempoYCerrado(), afuera], HOY), 0);
  assert.equal(devolucionesTardias([], HOY), 0);
});

test('devolucionesTardias: solo el último año — una devolución tarde de hace más de 365 días no cuenta', () => {
  // Salió exactamente en el primer día de la ventana: cuenta. Un día antes: ya no.
  const justoDentro = juanTardeYCerrado({ id: 'c-dentro', fechaSalida: desdeDelHistorial(HOY), recibidoEl: '2025-10-18' });
  const unDiaFuera = juanTardeYCerrado({ id: 'c-fuera', fechaSalida: '2025-10-10', recibidoEl: '2025-10-17' });
  assert.equal(justoDentro.cierre.fechaReal, '2025-10-18');
  assert.equal(devolucionesTardias([justoDentro], HOY), 1, 'el primer día de la ventana todavía cuenta');
  assert.equal(devolucionesTardias([unDiaFuera], HOY), 0, 'un día antes de la ventana ya no');
});

test('devolucionesTardias: un contrato sin fecha de salida no se puede descartar por viejo, así que cuenta', () => {
  const sinFecha = { ...juanTardeYCerrado(), fechaSalida: undefined };
  assert.equal(devolucionesTardias([sinFecha], HOY), 1);
});

test('devolucionesTardias: el mismo contrato en las dos lecturas (abiertos y último año) cuenta una sola vez', () => {
  const abierto = contratoDeUnCarro({ id: 'c-debe', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 200 });
  assert.equal(abierto.estado, 'devuelto', 'el escenario: sigue abierto, con el carro ya de vuelta y tarde');
  assert.equal(devolucionesTardias(sinRepetir([abierto], [abierto, juanTardeYCerrado()]), HOY), 2);
});

test('sinRepetir: sin id no se puede saber si es el mismo, así que no se descarta ninguno', () => {
  const a = { dias: 1 };
  const b = { dias: 1 };
  assert.equal(sinRepetir([a], [b]).length, 2);
  assert.equal(sinRepetir([{ id: 'x' }], [{ id: 'x' }]).length, 1);
});

// ---------- Lo que se sabe y lo que no ----------

test('revisionDeDevoluciones: con el historial leído bien, la cuenta es completa', () => {
  const r = revisionDeDevoluciones({ abiertos: [], historial: { datos: [juanTardeYCerrado()], fallo: false }, hoy: HOY });
  assert.deepEqual(r, { veces: 1, sinLeer: false });
});

test('revisionDeDevoluciones: un historial que no se pudo leer NUNCA se lee como «no tiene historial»', () => {
  const r = revisionDeDevoluciones({ abiertos: [], historial: { datos: [], fallo: true }, hoy: HOY });
  assert.equal(r.veces, 0);
  assert.equal(r.sinLeer, true, 'cero veces con la lectura caída no es «limpio»: es «no se sabe»');
});

test('revisionDeDevoluciones: los contratos abiertos son un piso — si el historial falla, lo que ya se sabe sigue contando', () => {
  const abierto = contratoDeUnCarro({ id: 'c-debe', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 200 });
  const r = revisionDeDevoluciones({ abiertos: [abierto], historial: { datos: [], fallo: true }, hoy: HOY });
  assert.deepEqual(r, { veces: 1, sinLeer: true });
});

test('revisionDeDevoluciones: sin historial pedido (todavía no llega, o no hay cliente) no inventa un fallo', () => {
  const r = revisionDeDevoluciones({ abiertos: [], historial: null, hoy: HOY });
  assert.deepEqual(r, { veces: 0, sinLeer: false });
});

test('textoDeVecesTarde: singular, plural, y «al menos» cuando la cuenta puede estar incompleta', () => {
  assert.equal(textoDeVecesTarde(1), '1 vez en el último año');
  assert.equal(textoDeVecesTarde(2), '2 veces en el último año');
  assert.equal(textoDeVecesTarde(1, { sinLeer: true }), 'al menos 1 vez en el último año');
  assert.equal(textoDeVecesTarde(3, { sinLeer: true }), 'al menos 3 veces en el último año');
});
