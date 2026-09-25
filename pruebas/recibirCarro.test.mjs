// Pruebas de "Recibir carro": solo la parte pura, sin DOM.
//
// El cálculo del cobro ya vive en contrato.js/cierre.js y está probado ahí.
// Lo que se prueba aquí es lo propio de esta pantalla: el puente del
// kilometraje de salida, el texto del botón de pago, el aviso final y cómo
// se rotula un saldo negativo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conKmSalidaNormalizado, textoBotonPago, textoAvisoRecibido, textoSaldo,
} from '../js/pantallas/recibirCarro.js';

test('conKmSalidaNormalizado: sin kmSalida, lo toma de kilometrajeSalida (Sacar carro guarda ese nombre)', () => {
  const contrato = { id: 'c1', kilometrajeSalida: 45000 };
  const normalizado = conKmSalidaNormalizado(contrato);
  assert.equal(normalizado.kmSalida, 45000);
  assert.equal(normalizado.kilometrajeSalida, 45000, 'no se pierde el campo original');
});

test('conKmSalidaNormalizado: si ya trae kmSalida, no lo pisa', () => {
  const contrato = { id: 'c1', kmSalida: 40000, kilometrajeSalida: 45000 };
  assert.equal(conKmSalidaNormalizado(contrato).kmSalida, 40000);
});

test('conKmSalidaNormalizado: sin ninguno de los dos campos, da 0 (no undefined)', () => {
  assert.equal(conKmSalidaNormalizado({ id: 'c1' }).kmSalida, 0);
});

test('conKmSalidaNormalizado: con contrato nulo, no revienta', () => {
  assert.equal(conKmSalidaNormalizado(null), null);
});

test('textoBotonPago: sin nada que cobrar, dice "Recibir sin cobrar"', () => {
  assert.equal(textoBotonPago(0, 0), 'Recibir sin cobrar');
  assert.equal(textoBotonPago(-300, 0), 'Recibir sin cobrar', 'saldo a favor del cliente tampoco cobra');
  assert.equal(textoBotonPago(730, 0), 'Recibir sin cobrar', 'monto en cero, aunque haya saldo');
});

test('textoBotonPago: un abono menor que el saldo dice "Recibir y abonar"', () => {
  assert.equal(textoBotonPago(730, 500), 'Recibir y abonar');
});

test('textoBotonPago: el saldo completo dice "Recibir y cobrar"', () => {
  assert.equal(textoBotonPago(730, 730), 'Recibir y cobrar');
  assert.equal(textoBotonPago(730, 800), 'Recibir y cobrar', 'de más también cuenta como cobrado');
});

test('textoAvisoRecibido: con saldo pendiente, dice cuánto falta', () => {
  assert.equal(textoAvisoRecibido(14, 230), 'Contrato 14 recibido. Falta cobrar Q230.00.');
});

test('textoAvisoRecibido: sin saldo, dice que ya se cobró', () => {
  assert.equal(textoAvisoRecibido(14, 0), 'Contrato 14 recibido y cobrado.');
});

test('textoAvisoRecibido: con saldo a favor del cliente, tampoco falta cobrar', () => {
  assert.equal(textoAvisoRecibido(14, -50), 'Contrato 14 recibido y cobrado.');
});

test('textoSaldo: positivo se rotula "Saldo"', () => {
  assert.deepEqual(textoSaldo(730), { etiqueta: 'Saldo', monto: 730 });
});

test('textoSaldo: en cero también es "Saldo"', () => {
  assert.deepEqual(textoSaldo(0), { etiqueta: 'Saldo', monto: 0 });
});

test('textoSaldo: negativo se rotula "A favor del cliente" y se muestra en positivo', () => {
  assert.deepEqual(textoSaldo(-300), { etiqueta: 'A favor del cliente', monto: 300 });
});
