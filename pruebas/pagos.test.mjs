// Pruebas de los abonos y de la garantía.
//
// Él cobra la renta al salir y a veces el cliente abona el saldo en partes. La
// garantía de la tarjeta se libera SOLO cuando ya no debe nada: es la única
// palanca que le queda para que le terminen de pagar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarPago, liberarGarantia, puedeLiberarse, anularPago,
} from '../js/datos.js';
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

test('un abono negativo no se guarda', () => {
  const c = agregarPago(conSaldo(), { monto: -500, forma: 'efectivo' });
  assert.equal(c.pagos.length, 1, 'sigue teniendo solo el pago de la salida');
});

// La regla más importante de esta tarea: "no libero hasta que me pague" (el
// dueño, tal cual). Es la única palanca que le queda una vez que el carro ya
// regresó — si este candado se rompe en un refactor futuro, aquí se nota.
test('la garantía no se libera mientras deba algo', async () => {
  // El candado (puedeLiberarse) corre antes de cualquier llamada a
  // Firestore, así que liberarGarantia rechaza sin tocar la red.
  await assert.rejects(() => liberarGarantia(conSaldo()), /730/);
});

test('con la deuda en cero, el candado deja pasar', () => {
  // liberarGarantia, en este caso, sí llegaría a guardarContrato (que
  // necesita Firestore) — por eso aquí se prueba directo el candado puro que
  // usa por dentro, sin depender de la red.
  const c = agregarPago(conSaldo(), { monto: 730, forma: 'efectivo', porcentajeTarjeta: 0 });
  assert.equal(resumen(c).saldo, 0);
  assert.equal(puedeLiberarse(c), null, 'sin saldo pendiente, el candado ya no debe rechazar');
});

// ---------- anularPago ----------
//
// El incidente que motivó esto: un carro volvió con el contrato ya pagado
// por completo, la pantalla igual mostró el bloque de cobro, y el dueño
// terminó tecleando un monto que dejó Q4,800 de crédito a favor del
// cliente. anularPago() es la forma de deshacerlo — nunca borrando el pago,
// solo marcándolo, porque el dinero recibido y luego revertido es algo que
// puede tener que explicarle a un cliente.
test('anularPago marca el pago con anulado:true y anuladoEn, sin quitarlo del arreglo', () => {
  const c = agregarPago(conSaldo(), { monto: 4800, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25' });
  const anulado = anularPago(c, 1, { fecha: '2026-09-25' });
  assert.equal(anulado.pagos.length, 2, 'el pago sigue ahí, no se borra');
  assert.equal(anulado.pagos[1].anulado, true);
  assert.equal(anulado.pagos[1].anuladoEn, '2026-09-25');
  assert.equal(anulado.pagos[1].monto, 4800, 'el monto original no se toca');
  assert.equal(anulado.pagos[0].anulado, undefined, 'el otro pago no se ve afectado');
});

test('anularPago usa hoy por defecto si no se le da una fecha', () => {
  const c = agregarPago(conSaldo(), { monto: 500, forma: 'efectivo' });
  const anulado = anularPago(c, 1);
  assert.ok(anulado.pagos[1].anuladoEn, 'trae alguna fecha, aunque no se le haya pasado una');
});

test('anularPago sobre un pago que ya estaba anulado no le pisa la fecha (doble clic no hace nada)', () => {
  const c = agregarPago(conSaldo(), { monto: 4800, forma: 'efectivo' });
  const primeraVez = anularPago(c, 1, { fecha: '2026-09-25' });
  const segundaVez = anularPago(primeraVez, 1, { fecha: '2026-09-26' });
  assert.equal(segundaVez.pagos[1].anuladoEn, '2026-09-25', 'se queda con la fecha de la primera anulación');
});

test('anularPago con un índice que no existe no cambia el contrato', () => {
  const c = conSaldo();
  assert.deepEqual(anularPago(c, 5), c);
  assert.deepEqual(anularPago(c, -1), c);
});

test('el pago anulado deja de contar para el saldo — resumen() lo confirma', () => {
  // El escenario completo del incidente: se cobra de más por error y se
  // anula; el saldo tiene que volver a lo que de verdad se debía.
  const conElError = agregarPago(conSaldo(), { monto: 4800, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25' });
  assert.equal(resumen(conElError).saldo, -4070, 'Q730 que debía menos Q4,800 cobrados de más');

  const corregido = anularPago(conElError, 1, { fecha: '2026-09-25' });
  assert.equal(resumen(corregido).saldo, 730, 'anulado el error, vuelve a deber exactamente lo mismo que antes');
});

test('anular un pago puede volver a dejar la garantía sin liberar (puedeLiberarse se recalcula solo)', () => {
  const pagado = agregarPago(conSaldo(), { monto: 730, forma: 'efectivo', porcentajeTarjeta: 0 });
  assert.equal(puedeLiberarse(pagado), null, 'antes de anular, ya no debía nada');

  const anulado = anularPago(pagado, 1, { fecha: '2026-09-25' });
  assert.match(puedeLiberarse(anulado), /730/, 'anulado el pago que saldaba la cuenta, vuelve a deber Q730');
});
