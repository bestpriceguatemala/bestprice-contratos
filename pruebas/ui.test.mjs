// Pruebas de las utilidades de presentación puras (dinero, fecha). aviso()
// no se prueba aquí: toca el DOM (document.getElementById) y esta suite
// corre en Node sin navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dinero, fecha } from '../js/ui.js';

test('dinero() da separador de miles y dos decimales', () => {
  assert.equal(dinero(1234.5), 'Q1,234.50');
  assert.equal(dinero(700), 'Q700.00');
  assert.equal(dinero(0), 'Q0.00');
});

test('lo vacío o lo que no sea número vale Q0.00, no rompe la pantalla', () => {
  assert.equal(dinero(undefined), 'Q0.00');
  assert.equal(dinero(null), 'Q0.00');
  assert.equal(dinero('abc'), 'Q0.00');
});

// Revisión final: dinero(-50) daba "Q-50.00" (toLocaleString pone el signo
// pegado al número, dentro de la Q); el plan de dinero y el saldo
// sobrepagado de resumen() (nucleo/contrato.js) van a mostrar montos
// negativos, y "Q-50.00" se lee como un monto raro, no como "menos 50".
test('un monto negativo lleva el signo antes de la Q: "-Q50.00", no "Q-50.00"', () => {
  assert.equal(dinero(-50), '-Q50.00');
  assert.equal(dinero(-1234.5), '-Q1,234.50');
});

test('fecha() da el formato que lee el dueño', () => {
  assert.equal(fecha('2026-08-25'), '25 ago 2026');
  assert.equal(fecha(''), '');
  assert.equal(fecha(undefined), '');
});
