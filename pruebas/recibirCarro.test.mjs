// Pruebas de "Recibir carro": solo la parte pura, sin DOM.
//
// El cálculo del cobro ya vive en contrato.js/cierre.js y está probado ahí.
// Lo que se prueba aquí es lo propio de esta pantalla: el puente del
// kilometraje de salida, el texto del botón de pago, el aviso final, cómo
// se rotula un saldo negativo, y — ronda de corrección 1 — cuánto cuesta de
// verdad cobrar un abono parcial con tarjeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conKmSalidaNormalizado, textoBotonPago, textoAvisoRecibido, textoSaldo, totalDeEstaCobranza,
} from '../js/pantallas/recibirCarro.js';
import { resumen } from '../js/nucleo/contrato.js';
import { agregarPago } from '../js/datos.js';

test('conKmSalidaNormalizado: compatibilidad con contratos guardados antes del cambio de nombre (kilometrajeSalida -> kmSalida)', () => {
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

// El ejemplo del diseño (contrato.test.mjs / cierre.test.mjs): 4 días a
// Q700, carta poder Q350, ya pagó Q3,150 al salir, y al recibirlo un día
// tarde con Q200 de daños, Q130 de combustible y Q300 de descuento, el
// saldo da Q730.00.
const contratoConCierre = () => ({
  dias: 4, precioDia: 700, cartaPoderPrecio: 350,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
});

test('totalDeEstaCobranza: un abono de Q500 al 12% de tarjeta cuesta Q560.00, no el recargo del saldo completo', () => {
  const r = totalDeEstaCobranza(contratoConCierre(), {
    monto: 500, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25',
  });
  assert.deepEqual(r, { total: 560, recargo: 60 });
});

test('totalDeEstaCobranza: saldar los Q730 completos al 12% sigue dando Q817.60', () => {
  const r = totalDeEstaCobranza(contratoConCierre(), {
    monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25',
  });
  assert.deepEqual(r, { total: 817.6, recargo: 87.6 });
});

test('totalDeEstaCobranza: un abono en efectivo cobra exactamente lo escrito, sin recargo', () => {
  const r = totalDeEstaCobranza(contratoConCierre(), {
    monto: 500, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25',
  });
  assert.deepEqual(r, { total: 500, recargo: 0 });
});

test('totalDeEstaCobranza: sin monto (o en cero), no hay nada que cobrar', () => {
  assert.deepEqual(totalDeEstaCobranza(contratoConCierre(), { monto: 0, forma: 'efectivo', porcentajeTarjeta: 0 }), { total: 0, recargo: 0 });
});

test('el abono de Q500 con tarjeta deja Q230.00 pendientes (no se toca el saldo por el recargo)', () => {
  const conAbono = agregarPago(contratoConCierre(), { monto: 500, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25' });
  assert.equal(resumen(conAbono).saldo, 230);
});
