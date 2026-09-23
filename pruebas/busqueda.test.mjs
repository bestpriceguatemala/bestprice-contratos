// Pruebas del buscador.
//
// En el mostrador nadie escribe acentos ni recuerda si el apellido va antes del
// nombre. El buscador tiene que encontrar igual: "urizar jonatan" y "Jonatán
// Urízar" son la misma persona, y "3786" encuentra al del DPI que empieza así.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, coincide, textoDeCliente, filtrar } from '../js/nucleo/busqueda.js';

const cliente = {
  id: 'k1',
  apellido1: 'URIZAR', apellido2: 'ROLDÁN',
  nombre1: 'JONATÁN', nombre2: 'ESTEBAN',
  documento: 'DPI 3786 73238 0101',
  licencia: 'LIC 3786732380101',
  telefono: '3078-4155',
  correo: 'FASTERESTEBAN07@GMAIL.COM',
};

test('quita acentos, mayúsculas y signos', () => {
  assert.equal(normalizar('JONATÁN Urízar'), 'jonatan urizar');
  assert.equal(normalizar('3078-4155'), '3078 4155');
  assert.equal(normalizar('  doble   espacio '), 'doble espacio');
});

test('encuentra en cualquier orden y sin acentos', () => {
  const texto = textoDeCliente(cliente);
  assert.ok(coincide(texto, 'urizar jonatan'));
  assert.ok(coincide(texto, 'jonatan urizar'));
  assert.ok(coincide(texto, 'URÍZAR'));
  assert.ok(coincide(texto, 'roldan esteban'));
});

test('encuentra por DPI, licencia, teléfono o correo, aunque sea un pedazo', () => {
  const texto = textoDeCliente(cliente);
  assert.ok(coincide(texto, '3786'));
  assert.ok(coincide(texto, '30784155'), 'el teléfono sin guion');
  assert.ok(coincide(texto, 'fasteresteban07'));
});

test('no encuentra lo que no está', () => {
  const texto = textoDeCliente(cliente);
  assert.equal(coincide(texto, 'marcela'), false);
  assert.equal(coincide(texto, 'urizar marcela'), false, 'tienen que estar TODAS las palabras');
});

test('una búsqueda vacía devuelve todo', () => {
  const lista = [cliente, { ...cliente, id: 'k2', apellido1: 'BRIONES' }];
  assert.equal(filtrar(lista, '', textoDeCliente).length, 2);
  assert.equal(filtrar(lista, '   ', textoDeCliente).length, 2);
  assert.equal(filtrar(lista, 'briones', textoDeCliente).length, 1);
});

test('la ñ no estorba: Peña se encuentra escribiendo pena', () => {
  const peña = { ...cliente, id: 'k3', apellido1: 'PEÑA' };
  assert.equal(filtrar([peña], 'pena', textoDeCliente).length, 1);
  assert.equal(filtrar([peña], 'PEÑA', textoDeCliente).length, 1);
});
