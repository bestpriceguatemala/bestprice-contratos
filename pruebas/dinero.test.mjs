// Pruebas del manejo de dinero.
// Correr con:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { q, suma, conTarjeta, recargoTarjeta } from '../js/nucleo/dinero.js';

test('redondea a dos decimales', () => {
  assert.equal(q(3.005), 3.01);
  assert.equal(q(1234.567), 1234.57);
  assert.equal(q(700), 700);
});

test('lo vacío vale cero, no rompe la cuenta', () => {
  assert.equal(q(undefined), 0);
  assert.equal(q(null), 0);
  assert.equal(q(''), 0);
  assert.equal(q('abc'), 0);
  assert.equal(q('350'), 350);
});

test('suma sin arrastrar errores de centavos', () => {
  assert.equal(suma(0.1, 0.2), 0.3);
  assert.equal(suma(2800, 350, 200, 130), 3480);
  assert.equal(suma(700, undefined, null, '130'), 830);
});

test('el recargo de tarjeta del ejemplo del diseño', () => {
  assert.equal(conTarjeta(3150, 12), 3528);
  assert.equal(conTarjeta(730, 12), 817.6);
  assert.equal(recargoTarjeta(3150, 12), 378);
  assert.equal(recargoTarjeta(730, 12), 87.6);
});

test('sin porcentaje, el monto no cambia', () => {
  assert.equal(conTarjeta(3150, 0), 3150);
  assert.equal(conTarjeta(3150, undefined), 3150);
  assert.equal(recargoTarjeta(3150, 0), 0);
});
