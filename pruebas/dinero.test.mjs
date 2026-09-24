// Pruebas del manejo de dinero.
// Correr con:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  q, suma, conTarjeta, recargoTarjeta, textoDosDecimales,
} from '../js/nucleo/dinero.js';

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

test('el medio centavo sube, sin importar el tamaño del monto', () => {
  assert.equal(q(3.005), 3.01);
  assert.equal(q(5.015), 5.02);
  assert.equal(q(1234.565), 1234.57);
  assert.equal(q(0.615), 0.62);
});

test('un monto negativo se redondea igual que su positivo', () => {
  assert.equal(q(-3.005), -3.01);
  assert.equal(q(-5.015), -5.02);
  assert.ok(Object.is(q(-0.001), 0), 'no queda un menos cero suelto');
});

// Revisión final: los detalles de línea del núcleo (contrato.js) mostraban
// "Q700" en vez de "Q700.00" — un monto sin sus centavos justo donde el
// resto del sistema siempre los muestra.
test('textoDosDecimales siempre lleva dos decimales y separador de miles', () => {
  assert.equal(textoDosDecimales(700), '700.00');
  assert.equal(textoDosDecimales(1234.5), '1,234.50');
  assert.equal(textoDosDecimales(0), '0.00');
  assert.equal(textoDosDecimales(undefined), '0.00');
});
