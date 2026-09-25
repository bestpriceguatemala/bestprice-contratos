// Pruebas de recibir el carro.
//
// El cálculo del cobro ya vive en contrato.js y está probado ahí. Lo que se
// prueba aquí es lo que puede salir mal al recibir: un kilometraje que retrocede,
// una fecha anterior a la salida, un descuento inventado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirCierre, problemasDelCierre } from '../js/nucleo/cierre.js';
import { resumen } from '../js/nucleo/contrato.js';

const contrato = () => ({
  id: 'c1', numero: 1, carroId: 'v1',
  dias: 4, precioDia: 700, kmSalida: 45000,
  fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24',
  cartaPoderPrecio: 350,
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
  estado: 'rentado',
});

const campos = {
  fechaReal: '2026-08-25', horaReal: '10:30', lugarEntrada: 'OFICINA',
  kmEntrada: 45600, combustible: 130, danos: 200, danosDetalle: 'Rayón en la puerta',
  varios: 0, descuento: 300,
};

test('el cierre no pierde nada de lo que ya traía el contrato', () => {
  const c = construirCierre(contrato(), campos);
  assert.equal(c.numero, 1);
  assert.equal(c.precioDia, 700);
  assert.equal(c.pagos.length, 1);
  assert.equal(c.cierre.fechaReal, '2026-08-25');
  assert.equal(c.cierre.kmEntrada, 45600);
});

test('el ejemplo del diseño cuadra al recibir', () => {
  const r = resumen(construirCierre(contrato(), campos));
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalDevolucion, 730, 'atraso más daños más combustible menos descuento');
  assert.equal(r.subtotal, 3880);
  assert.equal(r.saldo, 730, 'el saldo se ve sin recargo hasta saber cómo paga');
});

test('los kilómetros no pueden retroceder', () => {
  const p = problemasDelCierre(contrato(), { ...campos, kmEntrada: 44000 });
  assert.equal(p.length, 1);
  assert.match(p[0], /kilometraje/i);
  assert.match(p[0], /45,?000/, 'dice con cuánto salió');
});

test('no se puede recibir un carro antes de haberlo entregado', () => {
  const p = problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-19' });
  assert.equal(p.length, 1);
  assert.match(p[0], /antes/i);
});

test('sin fecha real no se puede cerrar', () => {
  assert.match(problemasDelCierre(contrato(), { ...campos, fechaReal: '' }).join(' '), /fecha/i);
});

test('un descuento mayor que todo lo cobrado se avisa', () => {
  const p = problemasDelCierre(contrato(), { ...campos, descuento: 99999 });
  assert.match(p.join(' '), /descuento/i);
});

test('un cierre normal no tiene problemas', () => {
  assert.deepEqual(problemasDelCierre(contrato(), campos), []);
});

test('devolver antes de tiempo no da crédito ni problema', () => {
  const c = construirCierre(contrato(), { ...campos, fechaReal: '2026-08-22', descuento: 0 });
  const r = resumen(c);
  assert.equal(r.diasAtraso, 0);
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-22' }), []);
});
