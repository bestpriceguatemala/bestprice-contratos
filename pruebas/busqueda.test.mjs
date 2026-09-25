// Pruebas del buscador.
//
// En el mostrador nadie escribe acentos ni recuerda si el apellido va antes del
// nombre. El buscador tiene que encontrar igual: "urizar jonatan" y "Jonatán
// Urízar" son la misma persona, y "3786" encuentra al del DPI que empieza así.
//
// El cliente de prueba usa `nombres`/`apellidos` (nucleo/cliente.js, Tarea 1:
// un solo campo cada uno, ya no los viejos nombre1/nombre2/apellido1/apellido2
// de cuatro campos) — es la forma real en que la pantalla de clientes
// (Tarea 6) guarda un cliente, y la que este archivo tuvo que alinear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, coincide, textoDeCliente, filtrar } from '../js/nucleo/busqueda.js';

const cliente = {
  id: 'k1',
  apellidos: 'URIZAR ROLDÁN',
  nombres: 'JONATÁN ESTEBAN',
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
  const lista = [cliente, { ...cliente, id: 'k2', apellidos: 'BRIONES' }];
  assert.equal(filtrar(lista, '', textoDeCliente).length, 2);
  assert.equal(filtrar(lista, '   ', textoDeCliente).length, 2);
  assert.equal(filtrar(lista, 'briones', textoDeCliente).length, 1);
});

test('la ñ no estorba: Peña se encuentra escribiendo pena', () => {
  const peña = { ...cliente, id: 'k3', apellidos: 'PEÑA' };
  assert.equal(filtrar([peña], 'pena', textoDeCliente).length, 1);
  assert.equal(filtrar([peña], 'PEÑA', textoDeCliente).length, 1);
});

// La forma nueva del cliente (Tarea 1/6): nombres y apellidos van cada uno en
// un solo campo, con más de una palabra adentro. El buscador tiene que
// encontrar por cualquiera de esas palabras sueltas, igual que antes
// encontraba por nombre1/nombre2 por separado — si esto se rompiera, la
// pantalla de clientes no encontraría a un cliente por su segundo nombre o
// segundo apellido.
test('con nombres y apellidos en un solo campo cada uno, se encuentra por cualquier palabra suelta', () => {
  const texto = textoDeCliente(cliente);
  assert.ok(coincide(texto, 'esteban'), 'el segundo nombre, dentro del campo nombres');
  assert.ok(coincide(texto, 'roldan'), 'el segundo apellido, dentro del campo apellidos');
  assert.ok(coincide(texto, 'jonatan esteban urizar roldan'), 'las cuatro palabras juntas, en el orden del contrato');
});
