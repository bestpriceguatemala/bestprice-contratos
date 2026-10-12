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

test('captura el pedazo ya decodificado: %20 es un espacio', () => {
  assert.deepEqual(emparejar('#/calendario/a%20b', '#/calendario/:fecha'), ['a b']);
});

// Una dirección escrita a mano con un «%» suelto no se puede decodificar (decodeURIComponent lanza
// URIError). El enrutador no atrapaba el error: el evento de cambio de dirección moría, y bajo
// «#/calendario/%E0%A4%A» seguía a la vista la pantalla de ANTES (la flota), con otra dirección
// escrita arriba. Ahora el pedazo llega tal cual se escribió y la pantalla de esa ruta dice que no lo entiende.
test('un «%» mal formado no revienta el emparejado: el pedazo llega tal cual se escribió', () => {
  assert.deepEqual(emparejar('#/calendario/%E0%A4%A', '#/calendario/:fecha'), ['%E0%A4%A']);
  assert.deepEqual(emparejar('#/carros/50%', '#/carros/:carroId'), ['50%']);
});
