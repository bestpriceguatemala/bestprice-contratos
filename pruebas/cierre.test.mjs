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

// Minor de la revisión final: el mensaje mostraba las fechas crudas
// ('2026-08-19') en vez del formato que lee el dueño, y rotulaba la fecha
// que el mostrador acaba de teclear como "Devolución" — que en el resto del
// sistema significa la fecha PREVISTA, un campo distinto.
test('el mensaje de fecha anterior usa el formato legible y rotula "Entrada", no "Devolución"', () => {
  const p = problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-19' });
  assert.match(p[0], /20 ago 2026/, 'la fecha de salida, formateada');
  assert.match(p[0], /19 ago 2026/, 'la fecha tecleada, formateada');
  assert.match(p[0], /Entrada:/);
  assert.doesNotMatch(p[0], /Devolución:/, 'esa palabra ya significa otra cosa en el resto del sistema');
});

test('sin fecha real no se puede cerrar', () => {
  assert.match(problemasDelCierre(contrato(), { ...campos, fechaReal: '' }).join(' '), /fecha/i);
});

test('un descuento mayor que todo lo cobrado se avisa', () => {
  const p = problemasDelCierre(contrato(), { ...campos, descuento: 99999 });
  assert.match(p.join(' '), /descuento/i);
});

// Minor de la revisión final: un subtotal negativo se mostraba como
// "(Q-95,819.00)" — el signo pegado adentro de la Q en vez de adelante.
test('el subtotal negativo del aviso de descuento lleva el signo antes de la Q', () => {
  const p = problemasDelCierre(contrato(), { ...campos, descuento: 99999 });
  assert.match(p.join(' '), /-Q95,819\.00/);
  assert.doesNotMatch(p.join(' '), /Q-/, 'nunca el signo pegado adentro de la Q');
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

test('el detalle de los varios llega al cierre y de verdad se cobra (CRÍTICO: mueve el saldo)', () => {
  const c = construirCierre(contrato(), { ...campos, varios: 150, variosDetalle: 'Silla de bebé no devuelta' });
  assert.equal(c.cierre.varios, 150);
  assert.equal(c.cierre.variosDetalle, 'Silla de bebé no devuelta');

  // No basta con que el campo se guarde: dos rondas de revisión dejaron
  // pasar que lineasDevolucion nunca emitía la línea, así que el saldo se
  // quedaba igual aunque "Varios" trajera un monto. Comparar el saldo con y
  // sin varios es la prueba que faltaba.
  const sinVarios = resumen(construirCierre(contrato(), { ...campos, varios: 0 })).saldo;
  const conVarios = resumen(c).saldo;
  assert.equal(conVarios, sinVarios + 150, 'los Q150 de Varios tienen que subir el saldo por cobrar');
});

test('corregir un cierre ya guardado se queda con lo nuevo', () => {
  // Él va a corregir un cierre que ya guardó: un monto mal tecleado, un
  // detalle mejor escrito. Lo nuevo manda; lo que no se toca se queda.
  const yaCerrado = construirCierre(contrato(), { ...campos, varios: 150, variosDetalle: 'VIEJO' });
  const corregido = construirCierre(yaCerrado, { ...campos, varios: 150, variosDetalle: 'NUEVO' });
  assert.equal(corregido.cierre.variosDetalle, 'NUEVO');
  assert.equal(corregido.cierre.danosDetalle, campos.danosDetalle, 'lo que no se corrigió sigue ahí');
  assert.equal(corregido.cierre.kmEntrada, 45600);
});

test('sin kmSalida registrado, no se valida que el kilometraje retroceda', () => {
  // Si no se registró kmSalida, no hay base para comparar — la validación
  // no es un pase falso sino un skip: ningún problema devuelto.
  const sinKmSalida = { ...contrato(), kmSalida: 0 };
  const p = problemasDelCierre(sinKmSalida, { ...campos, kmEntrada: 44000 });
  assert.equal(p.filter((m) => /kilometraje/i.test(m)).length, 0, 'no hay problema de km sin kmSalida');
});
