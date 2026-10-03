// Pruebas de las utilidades de presentación puras (dinero, fecha). aviso()
// no se prueba aquí: toca el DOM (document.getElementById) y esta suite
// corre en Node sin navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dinero, fecha, hora24 } from '../js/ui.js';

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

// ---------- La hora siempre en 24 horas ----------
//
// El dueño lo pidió el 3 de octubre: "el reloj tiene que ser de 24 hrs". El
// <input type="time"> del navegador mostraba "01:58 PM" porque su Chrome está
// en inglés — y se comprobó que ponerle lang="es-GT" NO lo cambia, Chrome usa
// el idioma del navegador. Así que el formato lo decide hora24(), no el
// navegador, y estas pruebas lo fijan.

test('hora24: acepta lo que el mostrador teclea de verdad', () => {
  assert.equal(hora24('13:45'), '13:45');
  assert.equal(hora24('1345'), '13:45', 'cuatro dígitos de corrido, sin dos puntos');
  assert.equal(hora24('945'), '09:45', 'tres dígitos: la primera es la hora');
  assert.equal(hora24('9:5'), '09:05', 'rellena con ceros a la izquierda');
  assert.equal(hora24('8'), '08:00', 'solo la hora, en punto');
  assert.equal(hora24(' 13:45 '), '13:45', 'recorta espacios');
});

test('hora24: medianoche y el último minuto del día', () => {
  assert.equal(hora24('00:00'), '00:00');
  assert.equal(hora24('0'), '00:00');
  assert.equal(hora24('23:59'), '23:59');
});

test('hora24: lo que no es una hora devuelve vacío, no una hora inventada', () => {
  // Una hora a medio escribir no es una hora. Guardar "9:" como si fuera algo
  // sería peor que dejarlo vacío: el contrato impreso diría una hora falsa.
  assert.equal(hora24('24:00'), '', 'no existe la hora 24');
  assert.equal(hora24('13:60'), '', 'no existe el minuto 60');
  assert.equal(hora24('99'), '');
  assert.equal(hora24('abc'), '');
  assert.equal(hora24(''), '');
  assert.equal(hora24(null), '');
  assert.equal(hora24(undefined), '');
});
