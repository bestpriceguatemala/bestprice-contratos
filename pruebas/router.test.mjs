// Pruebas del emparejado de rutas con parámetro (':carroId'), que usa
// "Sacar carro" para llegar desde la flota a #/sacar/<id-real>.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emparejar } from '../js/router.js';

test('una ruta sin parámetros solo calza consigo misma', () => {
  assert.deepEqual(emparejar('#/flota', '#/flota'), []);
  assert.equal(emparejar('#/clientes', '#/flota'), null);
});

test('captura el pedazo que ocupa el parámetro', () => {
  assert.deepEqual(emparejar('#/sacar/v9', '#/sacar/:carroId'), ['v9']);
});

test('no calza si sobran o faltan pedazos', () => {
  assert.equal(emparejar('#/sacar/v9/extra', '#/sacar/:carroId'), null);
  assert.equal(emparejar('#/sacar', '#/sacar/:carroId'), null);
});

test('un parámetro vacío no calza (evita "#/sacar/" sin id)', () => {
  assert.equal(emparejar('#/sacar/', '#/sacar/:carroId'), null);
});

test('las partes fijas del patrón deben coincidir tal cual', () => {
  assert.equal(emparejar('#/recibir/c1', '#/sacar/:carroId'), null);
});
