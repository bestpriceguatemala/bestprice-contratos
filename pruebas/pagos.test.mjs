// Pruebas de los abonos y de la garantía.
//
// Él cobra la renta al salir y a veces el cliente abona el saldo en partes. La
// garantía de la tarjeta se libera SOLO cuando ya no debe nada: es la única
// palanca que le queda para que le terminen de pagar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agregarPago, liberarGarantia, puedeLiberarse, anularPago, anularPagoDueno, pagoDuenoParaGuardar,
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

// ---------- anularPagoDueno ----------
//
// H-6 (prueba del sistema, 7 oct 2026): un pago a un dueño no tenía cómo deshacerse. Decisión
// de él: anular dejando rastro, igual que un pago del cliente — y el número de comprobante se
// queda, porque ese dueño ya tiene un papel con él. Es la misma forma que `anularPago`, con
// los mismos nombres de campo (§7b: `anulado`, `anuladoEn`).

/** Un pago a un dueño ya guardado: sellado por la misma función que lo sella al guardarlo. */
const pagoAUnDueno = () => pagoDuenoParaGuardar(
  { duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', monto: 2350, contratos: ['c1', 'c2'] },
  { id: 'pg1', numero: 7, ahora: 1790000000000 },
);

test('anularPagoDueno marca el pago con anulado:true y anuladoEn, y no le toca el número, el monto ni las rentas', () => {
  const pago = pagoAUnDueno();
  const anulado = anularPagoDueno(pago, { fecha: '2026-10-02' });
  assert.equal(anulado.anulado, true);
  assert.equal(anulado.anuladoEn, '2026-10-02', 'la fecha de la anulación, no la del pago');
  assert.equal(anulado.fecha, '2026-09-20', 'la fecha del pago sigue siendo la del pago');
  assert.equal(anulado.numero, 7, 'ese dueño ya tiene el papel con el N.° 7');
  assert.equal(anulado.monto, 2350);
  assert.deepEqual(anulado.contratos, ['c1', 'c2']);
  assert.equal(anulado.id, 'pg1');
  assert.equal(pago.anulado, undefined, 'es una función pura: el pago de antes no se muta');
});

test('anularPagoDueno usa hoy por defecto si no se le da una fecha', () => {
  assert.match(anularPagoDueno(pagoAUnDueno()).anuladoEn, /^\d{4}-\d{2}-\d{2}$/);
});

test('anularPagoDueno sobre un pago ya anulado no le pisa la fecha (doble clic, u otra pestaña, no hace nada)', () => {
  const primera = anularPagoDueno(pagoAUnDueno(), { fecha: '2026-10-02' });
  const segunda = anularPagoDueno(primera, { fecha: '2026-10-09' });
  assert.equal(segunda.anuladoEn, '2026-10-02', 'se queda con la fecha de la primera anulación');
  assert.equal(segunda, primera, 'ni siquiera es otro objeto');
});

test('anularPagoDueno con algo que no es un pago no inventa uno', () => {
  assert.equal(anularPagoDueno(undefined), undefined);
  assert.equal(anularPagoDueno(null), null);
});

test('pagoDuenoParaGuardar deja pasar la anulación: al guardar un pago anulado conserva su número y sus rentas', () => {
  const anulado = anularPagoDueno(pagoAUnDueno(), { fecha: '2026-10-02' });
  // Lo que `guardarPagoDueno` le pasa: el mismo pago, con su id y su número.
  const guardado = pagoDuenoParaGuardar(anulado, { id: anulado.id, numero: 99, ahora: 1790000090000 });
  assert.equal(guardado.anulado, true);
  assert.equal(guardado.anuladoEn, '2026-10-02');
  assert.equal(guardado.numero, 7, 'un número distinto que le pasen NO renumera un comprobante ya entregado');
  assert.equal(guardado.monto, 2350);
  assert.deepEqual(guardado.contratos, ['c1', 'c2']);
  assert.equal(guardado.actualizado, 1790000090000, 'y se vuelve a sellar: es lo que dice cuál copia es la nueva');
});
