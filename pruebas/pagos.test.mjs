// Pruebas de los abonos y de la garantía.
//
// Él cobra la renta al salir y a veces el cliente abona el saldo en partes. La
// garantía de la tarjeta se libera SOLO cuando ya no debe nada: es la única
// palanca que le queda para que le terminen de pagar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agregarPago } from '../js/datos.js';
import { resumen } from '../js/nucleo/contrato.js';
import { puedeCerrar, pendientesDe } from '../js/nucleo/estados.js';

const conSaldo = () => ({
  id: 'c1', dias: 4, precioDia: 700, cartaPoderPrecio: 350,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
  garantiaLiberada: false,
});

test('un abono baja el saldo pero no lo cierra', () => {
  const c = agregarPago(conSaldo(), { monto: 500, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25' });
  const r = resumen(c);
  assert.equal(r.saldo, 230, 'de los Q730 quedan Q230');
  assert.equal(puedeCerrar(c), false);
  assert.equal(pendientesDe(c).saldo, 230);
});

test('dos abonos que completan dejan el saldo en cero', () => {
  let c = agregarPago(conSaldo(), { monto: 500, forma: 'efectivo', porcentajeTarjeta: 0 });
  c = agregarPago(c, { monto: 230, forma: 'efectivo', porcentajeTarjeta: 0 });
  assert.equal(resumen(c).saldo, 0);
});

test('un abono con tarjeta cobra su recargo', () => {
  const c = agregarPago(conSaldo(), { monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12 });
  const r = resumen(c);
  assert.equal(r.saldo, 0, 'el saldo se mide sin recargo');
  assert.equal(r.totalCobrado, 4345.6, 'y lo cobrado sí lo incluye');
});

test('el pago queda con su fecha y su forma, para saber después cómo pagó', () => {
  const c = agregarPago(conSaldo(), { monto: 500, forma: 'transferencia', porcentajeTarjeta: 0, fecha: '2026-08-26' });
  const ultimo = c.pagos[c.pagos.length - 1];
  assert.equal(ultimo.forma, 'transferencia');
  assert.equal(ultimo.fecha, '2026-08-26');
  assert.equal(ultimo.monto, 500);
});

test('un pago sin monto no se agrega', () => {
  const c = agregarPago(conSaldo(), { monto: 0, forma: 'efectivo' });
  assert.equal(c.pagos.length, 1, 'sigue teniendo solo el pago de la salida');
});
