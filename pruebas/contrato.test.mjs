// Pruebas del cobro de un contrato.
//
// La prueba que manda es "el ejemplo del diseño": 4 días a Q700, devuelto un día
// tarde, con carta poder, daños, combustible, descuento y 12 % de tarjeta. Tiene
// que dar Q4,345.60. Si algún día deja de dar ese número, algo se rompió.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineasSalida, lineasDevolucion, resumen, saldoConTarjeta } from '../js/nucleo/contrato.js';

/** El contrato del ejemplo de la §5 del diseño, ya cobrado por completo. */
const ejemplo = () => ({
  dias: 4,
  precioDia: 700,
  seguroMenoresDia: 0,
  seguroPaiDia: 0,
  deducibleBajo: 0,
  cartaPoderPrecio: 350,
  variosPrecio: 0,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [
    { monto: 3150, porcentajeTarjeta: 12 },   // al salir: renta y carta poder
    { monto: 730, porcentajeTarjeta: 12 },    // al devolver: atraso, daños, combustible, menos descuento
  ],
});

test('al salir se cobra la renta, la carta poder y los varios', () => {
  const lineas = lineasSalida(ejemplo());
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [
    ['Renta', 2800],
    ['Carta poder', 350],
  ]);
});

test('los seguros por día se cobran por los días contratados', () => {
  const c = { ...ejemplo(), seguroMenoresDia: 50, seguroPaiDia: 25, deducibleBajo: 400 };
  const lineas = lineasSalida(c);
  const extra = lineas.find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 700, '(50 + 25) × 4 días + 400 de deducible bajo');
});

test('en la devolución se cobran los seguros por día de los días de atraso', () => {
  const c = { ...ejemplo(), seguroMenoresDia: 50, seguroPaiDia: 25, deducibleBajo: 400 };
  const extra = lineasDevolucion(c).find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 75, '(50 + 25) × 1 día de atraso, sin repetir el deducible bajo');
});

test('en la devolución se cobra el atraso, los daños y el combustible, menos el descuento', () => {
  const lineas = lineasDevolucion(ejemplo());
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [
    ['Cobro días de atraso', 700],
    ['Daños', 200],
    ['Combustible', 130],
    ['Descuento', -300],
  ]);
});

test('el ejemplo del diseño da Q4,345.60', () => {
  const r = resumen(ejemplo());
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalSalida, 3150, 'renta más carta poder');
  assert.equal(r.totalDevolucion, 730, 'atraso más daños más combustible menos descuento');
  assert.equal(r.subtotal, 3880, 'lo mismo que daría la hoja CONTRATOS del Excel');
  assert.equal(r.pagado, 4345.6, 'los dos pagos, cada uno con su 12 %');
  assert.equal(r.saldo, 0, 'ya no debe nada');
  assert.equal(r.totalCobrado, 4345.6);
});

test('mientras no paga la devolución, se ve lo que falta y lo que costaría con tarjeta', () => {
  const c = { ...ejemplo(), pagos: [{ monto: 3150, porcentajeTarjeta: 12 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3528, 'lo que pagó al salir, con su 12 %');
  assert.equal(r.saldo, 730, 'el saldo se ve sin recargo: todavía no se sabe cómo va a pagar');
  assert.deepEqual(saldoConTarjeta(c, 12), { saldo: 730, recargo: 87.6, total: 817.6 });
  assert.deepEqual(saldoConTarjeta(c, 0), { saldo: 730, recargo: 0, total: 730 });
});

test('sin devolución todavía, solo se debe lo de la salida', () => {
  const c = { ...ejemplo(), cierre: null, pagos: [] };
  const r = resumen(c);
  assert.equal(r.diasAtraso, 0);
  assert.equal(r.totalDevolucion, 0);
  assert.equal(r.saldo, 3150, 'la renta y la carta poder');
  assert.equal(r.totalCobrado, 0);
});

test('lo que se paga en efectivo no lleva recargo', () => {
  const c = { ...ejemplo(), pagos: [{ monto: 3150, porcentajeTarjeta: 0 }, { monto: 730, porcentajeTarjeta: 0 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3880, 'el subtotal pelado, sin un centavo de recargo');
  assert.equal(r.saldo, 0);
});

test('un carro ajeno deja utilidad después de pagarle al dueño', () => {
  const c = { ...ejemplo(), subarriendo: { costoDia: 400 } };
  const r = resumen(c);
  assert.equal(r.costoSubarriendo, 2000, 'Q400 × (4 días + 1 de atraso)');
  assert.equal(r.utilidad, 2345.6, 'Q4,345.60 cobrados menos Q2,000 del dueño');
});

test('un carro propio no tiene costo de subarriendo', () => {
  const r = resumen(ejemplo());
  assert.equal(r.costoSubarriendo, 0);
  assert.equal(r.utilidad, 4345.6);
});
