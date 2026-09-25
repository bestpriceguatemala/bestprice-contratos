// Pruebas de la ficha del cliente.
//
// Los campos salen de la hoja CLIENTES de su Excel, con un cambio que él pidió:
// nombres y apellidos van en dos campos y no en cuatro. Todo lo demás se queda
// porque va impreso en el contrato.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS_CLIENTE, construirCliente, nombreCompleto, faltaAlgo, nombresResueltos,
} from '../js/nucleo/cliente.js';

const campos = {
  nombres: 'JONATÁN ESTEBAN',
  apellidos: 'URIZAR ROLDÁN',
  documento: 'DPI 3786 73238 0101',
  telefono: '3078-4155',
  correo: 'fasteresteban07@gmail.com',
  direccionReferencia: 'CONDADO SAN NICOLÁS 2, ZONA 4, MIXCO',
};

test('la lista de campos trae lo que va impreso en el contrato', () => {
  const ids = CAMPOS_CLIENTE.map((c) => c.id);
  for (const necesario of ['nombres', 'apellidos', 'documento', 'licencia', 'telefono', 'correo', 'direccionReferencia']) {
    assert.ok(ids.includes(necesario), `falta el campo ${necesario}`);
  }
  assert.ok(!ids.includes('nombre2'), 'los nombres van en un solo campo');
  assert.ok(!ids.includes('apellido2'), 'los apellidos van en un solo campo');
});

test('construir un cliente nuevo deja solo lo que se escribió', () => {
  const c = construirCliente({}, campos);
  assert.equal(c.nombres, 'JONATÁN ESTEBAN');
  assert.equal(c.correo, 'fasteresteban07@gmail.com');
  assert.equal(c.direccionReferencia, 'CONDADO SAN NICOLÁS 2, ZONA 4, MIXCO');
});

test('editar un cliente no borra lo que la pantalla no mostró', () => {
  // El mismo error que nos costó un carro en el plan 1: la copia local se
  // reemplaza entera, así que lo que no se copia desaparece de la pantalla.
  const existente = { id: 'k1', codigo: 7, facturarA: 'BEST PRICE', actualizado: 100 };
  const c = construirCliente(existente, { ...campos, telefono: '5555-5555' });
  assert.equal(c.id, 'k1');
  assert.equal(c.codigo, 7);
  assert.equal(c.facturarA, 'BEST PRICE', 'un campo que el formulario no mostró se conserva');
  assert.equal(c.telefono, '5555-5555', 'lo que se escribió gana sobre lo viejo');
});

test('el nombre completo se lee como en el contrato', () => {
  assert.equal(nombreCompleto(construirCliente({}, campos)), 'JONATÁN ESTEBAN URIZAR ROLDÁN');
  assert.equal(nombreCompleto({}), '');
});

test('sin nombre o sin apellido no se puede guardar', () => {
  assert.deepEqual(faltaAlgo(construirCliente({}, campos)), []);
  assert.deepEqual(faltaAlgo(construirCliente({}, { ...campos, apellidos: '  ' })), ['Apellidos']);
  assert.deepEqual(faltaAlgo({}), ['Nombres', 'Apellidos']);
});

// Fix round 1, hallazgo Crítico de la revisión: sacarCarro.js todavía guarda
// clientes con la forma vieja (nombre1/apellido1, de antes de la Tarea 1), y
// ya hay clientes guardados así. Sin este puente, nombreCompleto() devuelve
// '' para ellos y se ven como "Cliente sin nombre" en toda la pantalla.
test('el nombre completo entiende las fichas viejas', () => {
  assert.equal(nombreCompleto({ nombre1: 'PEDRO', apellido1: 'MENDOZA' }), 'PEDRO MENDOZA');
  assert.equal(nombreCompleto({ nombres: 'PEDRO', apellidos: 'MENDOZA', nombre1: 'IGNORAR' }), 'PEDRO MENDOZA');
});

test('nombresResueltos: la forma nueva gana, la vieja es respaldo, y arma nombre1+nombre2', () => {
  // Solo la forma vieja: se arma nombres de nombre1+nombre2, apellidos de apellido1.
  assert.deepEqual(nombresResueltos({ nombre1: 'PEDRO', nombre2: 'LUIS', apellido1: 'MENDOZA' }),
    { nombres: 'PEDRO LUIS', apellidos: 'MENDOZA' });
  // Las dos formas presentes: la nueva gana, la vieja se ignora.
  assert.deepEqual(
    nombresResueltos({
      nombres: 'ANA', nombre1: 'IGNORAR', apellidos: 'GÓMEZ', apellido1: 'IGNORAR',
    }),
    { nombres: 'ANA', apellidos: 'GÓMEZ' },
  );
  // Ninguna de las dos: vacío, no revienta.
  assert.deepEqual(nombresResueltos({}), { nombres: '', apellidos: '' });
});
