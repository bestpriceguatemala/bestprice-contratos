// Pruebas de la ficha del dueño de carro subarrendado.
//
// Los dueños son como los clientes, pero más simples: solo cuatro campos,
// uno obligatorio. Espejo de pruebas/cliente.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS_DUENO, construirDueno, faltaAlgoEnDueno, textoDeDueno,
} from '../js/nucleo/dueno.js';

const campos = {
  nombre: 'JUAN PÉREZ',
  telefono: '7777-7777',
  nit: '12345678-7',
  nota: 'Dueño confiable',
};

test('la lista de campos contiene lo que describe el diseño', () => {
  const ids = CAMPOS_DUENO.map((c) => c.id);
  for (const necesario of ['nombre', 'telefono', 'nit', 'nota']) {
    assert.ok(ids.includes(necesario), `falta el campo ${necesario}`);
  }
});

test('construir un dueño nuevo deja solo lo que se escribió', () => {
  const d = construirDueno({}, campos);
  assert.equal(d.nombre, 'JUAN PÉREZ');
  assert.equal(d.telefono, '7777-7777');
  assert.equal(d.nit, '12345678-7');
  assert.equal(d.nota, 'Dueño confiable');
});

test('editar un dueño no borra lo que la pantalla no mostró', () => {
  // El mismo error que nos costó un carro en el plan 1: la copia local se
  // reemplaza entera, así que lo que no se copia desaparece de la pantalla.
  const existente = { id: 'd1', codigo: 5, empresa: 'TRANSPORTES PÉREZ', actualizado: 100 };
  const d = construirDueno(existente, { ...campos, telefono: '5555-5555' });
  assert.equal(d.id, 'd1');
  assert.equal(d.codigo, 5);
  assert.equal(d.empresa, 'TRANSPORTES PÉREZ', 'un campo que el formulario no mostró se conserva');
  assert.equal(d.telefono, '5555-5555', 'lo que se escribió gana sobre lo viejo');
});

test('recorta espacios de todos los campos de texto', () => {
  const d = construirDueno({}, {
    nombre: '  JUAN PÉREZ  ',
    telefono: '  7777-7777  ',
    nit: '  12345678-7  ',
    nota: '  dueño confiable  ',
  });
  assert.equal(d.nombre, 'JUAN PÉREZ');
  assert.equal(d.telefono, '7777-7777');
  assert.equal(d.nit, '12345678-7');
  assert.equal(d.nota, 'dueño confiable');
});

test('sin nombre no se puede guardar', () => {
  assert.deepEqual(faltaAlgoEnDueno(construirDueno({}, campos)), []);
  assert.deepEqual(faltaAlgoEnDueno(construirDueno({}, { ...campos, nombre: '  ' })), ['Nombre']);
  assert.deepEqual(faltaAlgoEnDueno({}), ['Nombre']);
});

test('textoDeDueno junta nombre, teléfono y NIT para el buscador', () => {
  const d = construirDueno({}, campos);
  const texto = textoDeDueno(d);
  assert.ok(texto.includes('JUAN PÉREZ'), 'contiene el nombre');
  assert.ok(texto.includes('7777-7777'), 'contiene el teléfono');
  assert.ok(texto.includes('12345678-7'), 'contiene el NIT');
});

test('textoDeDueno maneja campos faltantes sin romper', () => {
  assert.ok(textoDeDueno({}) === '');
  assert.ok(textoDeDueno({ nombre: 'PEDRO' }) === 'PEDRO');
  assert.ok(textoDeDueno({ nombre: 'PEDRO', telefono: '5555-5555' }).includes('PEDRO'));
});
