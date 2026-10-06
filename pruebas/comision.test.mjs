// Pruebas de la comisión del empleado.
//
// La regla, dicha por el dueño: 5 % de los días rentados por el precio por día,
// contando los días de atraso y restando el descuento. Nada más entra: ni daños,
// ni combustible, ni carta poder, ni hora tardía, ni el recargo de tarjeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseComision, comisionDe } from '../js/nucleo/comision.js';
import { resumen } from '../js/nucleo/contrato.js';
import { contratoGuardadoConHoraTardiaSiNo } from './fixtures/contratoGuardadoConHoraTardiaSiNo.mjs';

const base = () => ({
  dias: 4,
  precioDia: 700,
  porcentajeComision: 5,
  devolucionPrevista: '2026-08-24',
  cartaPoderPrecio: 350,
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
});

test('el ejemplo que dio el dueño: 4 días a Q600 dan Q120', () => {
  const c = { dias: 4, precioDia: 600, porcentajeComision: 5 };
  assert.equal(baseComision(c), 2400);
  assert.equal(comisionDe(c).monto, 120);
});

test('el precio por día va completo, con los seguros adentro', () => {
  const c = { dias: 4, precioDia: 700, seguroDia: 72, seguroTercerosDia: 120, porcentajeComision: 5 };
  assert.equal(baseComision(c), 2800, 'no se descuentan los Q192 de seguros');
  assert.equal(comisionDe(c).monto, 140);
});

test('los días de atraso suman a la comisión', () => {
  const c = { ...base(), cierre: { fechaReal: '2026-08-25', descuento: 0 } };
  assert.equal(baseComision(c), 3500, '5 días × Q700');
  assert.equal(comisionDe(c).monto, 175);
});

test('el descuento le baja la comisión', () => {
  assert.equal(baseComision(base()), 3200, '5 días × Q700 − Q300 de descuento');
  assert.equal(comisionDe(base()).monto, 160);
});

test('no entran daños, combustible, carta poder ni recargo de tarjeta', () => {
  const con = { ...base(), cierre: { ...base().cierre, danos: 5000, combustible: 900 } };
  assert.equal(baseComision(con), 3200, 'los Q5,900 extra no mueven la comisión');
});

test('cada empleado puede tener su porcentaje', () => {
  assert.equal(comisionDe({ ...base(), porcentajeComision: 7 }).monto, 224);
  assert.equal(comisionDe({ ...base(), porcentajeComision: 0 }).monto, 0);
});

test('un descuento mayor que la renta no genera comisión negativa', () => {
  const c = { dias: 1, precioDia: 300, porcentajeComision: 5, cierre: { fechaReal: '2026-08-21', descuento: 500 } };
  assert.equal(baseComision(c), 0);
  assert.equal(comisionDe(c).monto, 0);
});

test('la comisión queda firme hasta que el carro regresa', () => {
  const rentado = { ...base(), cierre: null };
  assert.equal(comisionDe(rentado).firme, false);
  assert.equal(comisionDe(rentado).monto, 140, 'se estima con los días contratados');
  assert.equal(comisionDe(base()).firme, true);
});

// La hora tardía es un cobro extra de la salida, de la misma familia que la
// carta poder: se cobra, pero no entra a la base de la comisión. Si entrara,
// subirle Q150 a un contrato le subiría la comisión al empleado sin que nadie
// lo haya decidido (Q7.50 al 5 %, en cada hora tardía).
test('la hora tardía de Q150 no mueve la base ni la comisión, aunque sí sube lo que se cobra', () => {
  const sin = base();
  const con = { ...base(), horaTardia: 150 };

  assert.equal(baseComision(con), 3200, 'la misma base de siempre: 5 días × Q700 − Q300');
  assert.equal(baseComision(con), baseComision(sin));
  assert.deepEqual(comisionDe(con), comisionDe(sin), 'base, porcentaje, monto y firmeza, todo igual');
  assert.equal(comisionDe(con).monto, 160, 'Q160, no Q167.50');

  // ...y la hora tardía de verdad se está cobrando, para que esta prueba no
  // pase solo porque el campo no se leyera en ningún lado.
  assert.equal(resumen(con).totalSalida, resumen(sin).totalSalida + 150);
});

test('la hora tardía no se cuenta como días ni como precio: el estimado de un carro rentado tampoco cambia', () => {
  const rentado = { ...base(), cierre: null, horaTardia: 150 };
  assert.equal(baseComision(rentado), 2800, '4 días × Q700');
  assert.equal(comisionDe(rentado).monto, 140);
  assert.equal(comisionDe(rentado).firme, false);
});

test('un contrato viejo con horaTardia: true tiene la misma comisión que sin el campo', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  const sinCampo = contratoGuardadoConHoraTardiaSiNo();
  delete sinCampo.horaTardia;
  assert.equal(baseComision(viejo), 2800, '4 días × Q700: ni Q2,801 ni Q2,950');
  assert.deepEqual(comisionDe(viejo), comisionDe(sinCampo));
  assert.equal(comisionDe(viejo).monto, 140);
});
