// Pruebas de la pantalla de clientes (clientes.js): solo la parte pura, sin
// DOM — igual que flota.test.mjs y carros.test.mjs.
//
// Lo que más importa probar es qué cuenta como alerta ("marca roja"): la
// licencia y el documento vencidos, el saldo pendiente (siempre por
// resumen(), nunca una cifra propia) y cuántas veces devolvió tarde.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estaVencido, contratosDe, saldoPendienteDe, vecesTarde, alertasDe,
} from '../js/pantallas/clientes.js';

const HOY = '2026-09-25';

test('estaVencido: una fecha pasada está vencida, vacía nunca lo está', () => {
  assert.equal(estaVencido('2026-01-01', HOY), true);
  assert.equal(estaVencido('2027-01-01', HOY), false, 'todavía no llega');
  assert.equal(estaVencido(HOY, HOY), false, 'vence hoy, todavía no vencida');
  assert.equal(estaVencido('', HOY), false);
  assert.equal(estaVencido(undefined, HOY), false);
});

test('contratosDe: solo los del cliente pedido', () => {
  const cliente = { id: 'k1' };
  const contratos = [
    { id: 'c1', clienteId: 'k1' },
    { id: 'c2', clienteId: 'k2' },
    { id: 'c3', clienteId: 'k1' },
  ];
  const propios = contratosDe(cliente, contratos);
  assert.deepEqual(propios.map((c) => c.id), ['c1', 'c3']);
});

test('saldoPendienteDe: suma el saldo real de cada contrato, con resumen()', () => {
  // dias=2, precioDia=100 -> totalSalida 200; sin pagos -> saldo 200 cada uno
  const contratos = [
    { dias: 2, precioDia: 100, pagos: [] },
    { dias: 1, precioDia: 100, pagos: [{ monto: 100, porcentajeTarjeta: 0 }] }, // saldo 0
  ];
  assert.equal(saldoPendienteDe(contratos), 200);
  assert.equal(saldoPendienteDe([]), 0);
});

test('vecesTarde: cuenta solo los contratos que de verdad tuvieron atraso', () => {
  const contratos = [
    { dias: 2, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-12' } }, // 2 días tarde
    { dias: 2, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-10' } }, // a tiempo
    { dias: 2, precioDia: 100, devolucionPrevista: '2026-09-10' }, // todavía no regresa: no cuenta
  ];
  assert.equal(vecesTarde(contratos), 1);
  assert.equal(vecesTarde([]), 0);
});

test('alertasDe: sin nada vencido, sin saldo y sin atrasos, no hay alertas', () => {
  const cliente = { id: 'k1' };
  assert.deepEqual(alertasDe(cliente, [], HOY), []);
});

test('alertasDe: licencia y documento vencidos salen cada uno con su frase', () => {
  const cliente = { id: 'k1', licenciaExpira: '2026-01-01', documentoExpira: '2025-12-31' };
  const alertas = alertasDe(cliente, [], HOY);
  const tipos = alertas.map((a) => a.tipo);
  assert.ok(tipos.includes('Licencia vencida'));
  assert.ok(tipos.includes('Documento vencido'));
  assert.match(alertas.find((a) => a.tipo === 'Licencia vencida').texto, /1 ene 2026/);
});

test('alertasDe: saldo pendiente sale con el monto exacto de resumen()', () => {
  const cliente = { id: 'k1' };
  const contratos = [{ clienteId: 'k1', dias: 2, precioDia: 100, pagos: [] }];
  const alertas = alertasDe(cliente, contratosDe(cliente, contratos), HOY);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].tipo, 'Saldo pendiente');
  assert.match(alertas[0].texto, /Q200\.00/);
});

test('alertasDe: cuántas veces devolvió tarde, en singular y en plural', () => {
  const cliente = { id: 'k1' };
  const unaVez = [{ clienteId: 'k1', dias: 1, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-11' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }] }];
  const alerta = alertasDe(cliente, contratosDe(cliente, unaVez), HOY).find((a) => a.tipo === 'Devolvió tarde');
  assert.match(alerta.texto, /1 vez\./);

  const dosVeces = [
    ...unaVez,
    { clienteId: 'k1', dias: 1, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-12' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }] },
  ];
  const alerta2 = alertasDe(cliente, contratosDe(cliente, dosVeces), HOY).find((a) => a.tipo === 'Devolvió tarde');
  assert.match(alerta2.texto, /2 veces\./);
});

test('alertasDe: pueden salir varias alertas juntas, cada una con su tipo', () => {
  const cliente = { id: 'k1', licenciaExpira: '2020-01-01' };
  const contratos = [{ clienteId: 'k1', dias: 1, precioDia: 500, pagos: [] }];
  const alertas = alertasDe(cliente, contratosDe(cliente, contratos), HOY);
  const tipos = alertas.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ['Licencia vencida', 'Saldo pendiente'].sort());
});
