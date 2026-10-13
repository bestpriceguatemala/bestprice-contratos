// Pruebas de la cuenta de comisiones de cada empleado (js/nucleo/comisiones.js): qué se le debe, qué todavía no es
// firme y qué ya se le pagó. Es la gemela de pruebas/liquidacion.test.mjs, la de los dueños de carros ajenos.
//
// Las rentas salen de las funciones que arman las de verdad (pruebas/fixtures/rentasConComision.mjs), y la
// comisión de cada una la sigue calculando `comisionDe` (nucleo/comision.js), que aquí no se vuelve a escribir.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cuentaDeEmpleado, agruparPorEmpleado, elegirParaPagoDeComision, totalGeneralDeComisiones, estadoDeComision,
} from '../js/nucleo/comisiones.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { q } from '../js/nucleo/dinero.js';
import { renta, rentaDeAntes, pagoDeComision, EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { ana, wilder, luis } = EMPLEADOS;

// 4 días a Q700 = base Q2,800. Al 5 % son Q140.00.
const firme = (id, extra = {}) => renta({ id, recibidoEl: '2026-10-05', ...extra });
const abierta = (id, extra = {}) => renta({ id, ...extra });

test('la renta de ejemplo: Q2,800 de base al 5 % dan Q140.00 de comisión, firme', () => {
  const c = firme('c1');
  assert.deepEqual(comisionDe(c), { base: 2800, porcentaje: 5, monto: 140, firme: true });
});

// ---------------------------------------------------------------------------
// Solo se paga lo firme
// ---------------------------------------------------------------------------

test('una renta con el carro de vuelta es pagable; una que sigue afuera NO: su comisión es un estimado', () => {
  const cuenta = cuentaDeEmpleado({ contratos: [firme('c1'), abierta('c2')], pagos: [] });
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.noFirmes.map((c) => c.id), ['c2']);
  assert.equal(cuenta.totalPorPagar, 140, 'el estimado de la que sigue afuera no suma');
  assert.equal(cuenta.totalEstimado, 140, 'pero se ve cuánto sería, aparte');
});

test('un día de atraso sube la comisión y un descuento la baja: por eso la que sigue afuera es solo un estimado', () => {
  const alDia = renta({ id: 'c1', recibidoEl: '2026-10-05' }); // prevista 5 oct: a tiempo
  const tarde = renta({ id: 'c2', recibidoEl: '2026-10-06' }); // un día tarde
  const conDescuento = renta({ id: 'c3', recibidoEl: '2026-10-05', descuento: 300 });
  assert.equal(comisionDe(alDia).monto, 140);
  assert.equal(comisionDe(tarde).monto, 175, '5 días × Q700 al 5 %');
  assert.equal(comisionDe(conDescuento).monto, 125, '(Q2,800 − Q300) al 5 %');
  const cuenta = cuentaDeEmpleado({ contratos: [alDia, tarde, conDescuento], pagos: [] });
  assert.equal(cuenta.totalPorPagar, 440);
});

test('marcar una renta que no es firme no la mete al pago: ni su dinero ni su id', () => {
  const cuenta = cuentaDeEmpleado({ contratos: [firme('c1'), abierta('c2')], pagos: [] });
  const elegido = elegirParaPagoDeComision(cuenta, ['c1', 'c2']);
  assert.deepEqual(elegido.contratos, ['c1']);
  assert.equal(elegido.monto, 140);
  assert.deepEqual(elegirParaPagoDeComision(cuenta, ['c2']), { rentas: [], contratos: [], monto: 0 });
});

test('«firme» es solo que el carro volvió: aunque el cliente aún deba daños, la comisión ya se conoce', () => {
  // Con daños el contrato queda abierto (devuelto), pero los daños no entran a la base de la comisión (§5).
  const devuelto = renta({ id: 'c1', recibidoEl: '2026-10-05', danos: 200 });
  assert.equal(comisionDe(devuelto).firme, true);
  const cuenta = cuentaDeEmpleado({ contratos: [devuelto], pagos: [] });
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c1']);
});

test('el estado de una comisión lo dice una sola función, y se pregunta por `comisionDe`, no por el campo `estado` guardado', () => {
  assert.equal(estadoDeComision(firme('c1')), 'por-pagar');
  assert.equal(estadoDeComision(abierta('c2')), 'estimada');
  // Un sello `estado` viejo o equivocado no cambia nada: lo que manda es que el carro haya vuelto.
  assert.equal(estadoDeComision({ ...abierta('c3'), estado: 'cerrado' }), 'estimada');
  assert.equal(estadoDeComision({ ...firme('c4'), estado: 'rentado' }), 'por-pagar');
});

// ---------------------------------------------------------------------------
// Wilder: 0 %, nunca hay nada que pagar
// ---------------------------------------------------------------------------

test('Wilder al 0 %: sus rentas, firmes o no, nunca producen una comisión por pagar', () => {
  const contratos = [
    renta({ id: 'w1', empleado: wilder, recibidoEl: '2026-10-05' }),
    renta({ id: 'w2', empleado: wilder, recibidoEl: '2026-10-06' }),
    renta({ id: 'w3', empleado: wilder }),
  ];
  assert.ok(contratos.every((c) => c.porcentajeComision === 0 && c.empleadoId === 'e6'), 'sellado en 0, un número, no ausente');
  const cuenta = cuentaDeEmpleado({ contratos, pagos: [] });
  assert.deepEqual(cuenta.porPagar, []);
  assert.deepEqual(cuenta.sinComision.map((c) => c.id), ['w1', 'w2'], 'firmes y sin comisión: se cuentan, no se pagan');
  assert.deepEqual(cuenta.sinPorcentaje, [], 'un 0 sellado es un porcentaje, no uno que falta');
  assert.equal(cuenta.totalPorPagar, 0);
  assert.equal(cuenta.totalEstimado, 0);
  assert.deepEqual(elegirParaPagoDeComision(cuenta, ['w1', 'w2', 'w3']), { rentas: [], contratos: [], monto: 0 });
});

test('una renta firme con un descuento que se come la base tampoco paga nada, con cualquier porcentaje', () => {
  const sinBase = renta({ id: 'c1', recibidoEl: '2026-10-05', descuento: 2800 });
  assert.equal(comisionDe(sinBase).monto, 0);
  const cuenta = cuentaDeEmpleado({ contratos: [sinBase], pagos: [] });
  assert.deepEqual(cuenta.sinComision.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.porPagar, []);
});

test('un contrato sin el porcentaje sellado NO se lee como 0 %: se aparta, no se paga, y se dice', () => {
  const sin = { ...firme('c1'), porcentajeComision: undefined };
  delete sin.porcentajeComision;
  const cuenta = cuentaDeEmpleado({ contratos: [sin, { ...firme('c2'), porcentajeComision: '' }, { ...firme('c3'), porcentajeComision: 'cinco' }], pagos: [] });
  assert.deepEqual(cuenta.sinPorcentaje.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.deepEqual(cuenta.sinComision, []);
  assert.deepEqual(cuenta.porPagar, []);
});

// ---------------------------------------------------------------------------
// Lo ya pagado, y anular
// ---------------------------------------------------------------------------

test('una renta cubierta por un pago está pagada y deja de deberse', () => {
  const contratos = [firme('c1'), firme('c2')];
  const pagos = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] })];
  const cuenta = cuentaDeEmpleado({ contratos, pagos });
  assert.deepEqual(cuenta.pagados.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c2']);
  assert.equal(cuenta.totalPorPagar, 140);
});

test('un pago ANULADO ya no cubre nada: sus rentas vuelven a «por pagar» y el pago sigue existiendo', () => {
  const contratos = [firme('c1')];
  const pagos = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'], anulado: true })];
  const cuenta = cuentaDeEmpleado({ contratos, pagos });
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.pagados, []);
  assert.equal(pagos[0].monto, 140, 'el pago anulado conserva su monto');
});

test('el mismo pago dos veces (la copia vieja y la anulada) cuenta como lo que es la más nueva', () => {
  const vieja = { ...pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] }), actualizado: 100 };
  const anulada = { ...pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'], anulado: true }), actualizado: 200 };
  assert.deepEqual(cuentaDeEmpleado({ contratos: [firme('c1')], pagos: [vieja, anulada] }).porPagar.map((c) => c.id), ['c1']);
  assert.deepEqual(cuentaDeEmpleado({ contratos: [firme('c1')], pagos: [anulada, vieja] }).porPagar.map((c) => c.id), ['c1']);
});

test('una renta ya pagada sigue pagada aunque después cambie: nunca vuelve a pagarse completa', () => {
  const pagos = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] })];
  // Se corrigió el cierre y ahora es una renta con un día de atraso (Q175).
  const corregida = renta({ id: 'c1', recibidoEl: '2026-10-06' });
  const cuenta = cuentaDeEmpleado({ contratos: [corregida], pagos });
  assert.deepEqual(cuenta.pagados.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.porPagar, []);
});

test('si lo que suman las rentas de un pago ya no es lo que se pagó, la cuenta lo dice (no lo calla)', () => {
  const pagos = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] })];
  const corregida = renta({ id: 'c1', recibidoEl: '2026-10-06' }); // hoy son Q175
  const { pagosQueCambiaron } = cuentaDeEmpleado({ contratos: [corregida], pagos });
  assert.equal(pagosQueCambiaron.length, 1);
  assert.equal(pagosQueCambiaron[0].pago.id, 'p1');
  assert.equal(pagosQueCambiaron[0].pagado, 140);
  assert.equal(pagosQueCambiaron[0].ahora, 175);
  assert.equal(pagosQueCambiaron[0].diferencia, 35);
});

test('un pago que sigue cuadrando no avisa nada, ni uno anulado, ni uno que cubre una renta que ya no está en la cuenta', () => {
  const cuadra = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] })];
  assert.deepEqual(cuentaDeEmpleado({ contratos: [firme('c1')], pagos: cuadra }).pagosQueCambiaron, []);
  const anulado = [pagoDeComision({ id: 'p1', monto: 999, contratos: ['c1'], anulado: true })];
  assert.deepEqual(cuentaDeEmpleado({ contratos: [firme('c1')], pagos: anulado }).pagosQueCambiaron, []);
  const incompleto = [pagoDeComision({ id: 'p1', monto: 280, contratos: ['c1', 'fantasma'] })];
  assert.deepEqual(cuentaDeEmpleado({ contratos: [firme('c1')], pagos: incompleto }).pagosQueCambiaron, [],
    'no se afirma nada sobre una comparación que no es de lo mismo contra lo mismo');
});

test('un pago que cubre una renta que todavía no es firme no afirma nada sobre cuánto suman: ese monto aún se mueve', () => {
  const pagos = [pagoDeComision({ id: 'p1', monto: 999, contratos: ['c1'] })];
  assert.deepEqual(cuentaDeEmpleado({ contratos: [abierta('c1')], pagos }).pagosQueCambiaron, []);
});

// ---------------------------------------------------------------------------
// Una lectura fallida no es «no se le debe nada a nadie»
// ---------------------------------------------------------------------------

test('sin la lista de pagos NO se sabe qué se pagó: lanza, no lee «nada pagado»', () => {
  for (const malo of [undefined, null, 'x', {}]) {
    assert.throws(() => cuentaDeEmpleado({ contratos: [firme('c1')], pagos: malo }), /«pagos» debe ser una lista/);
  }
  assert.throws(() => cuentaDeEmpleado({ contratos: [firme('c1')], pagos: [{ id: 'p1', monto: 1 }] }), /«contratos» de un pago de comisión debe ser una lista/,
    'un pago dañado, sin su lista de rentas, tampoco se lee como «no cubre nada»');
});

test('sin la lista de contratos NO se sabe qué se debe: lanza, no dice «no se le debe nada»', () => {
  for (const malo of [undefined, null, 'x', {}]) {
    assert.throws(() => cuentaDeEmpleado({ contratos: malo, pagos: [] }), /«contratos» debe ser una lista/);
    assert.throws(() => agruparPorEmpleado(malo, []), /«contratos» debe ser una lista/);
  }
  assert.throws(() => agruparPorEmpleado([], undefined), /«pagos» debe ser una lista/, 'aunque no haya contratos: lanzar no depende del día');
});

test('las listas vacías de verdad sí son válidas', () => {
  assert.equal(cuentaDeEmpleado({ contratos: [], pagos: [] }).totalPorPagar, 0);
  assert.deepEqual(agruparPorEmpleado([], []), []);
});

test('un contrato que llega repetido cuenta una sola vez, y gana la copia de `actualizado` más nuevo', () => {
  const a = firme('c1');
  const b = { ...firme('c1'), actualizado: a.actualizado + 5, danos: 0 };
  const cuenta = cuentaDeEmpleado({ contratos: [a, b, a], pagos: [] });
  assert.equal(cuenta.porPagar.length, 1);
  assert.equal(cuenta.totalPorPagar, 140);
});

// ---------------------------------------------------------------------------
// Agrupar por empleado: la lista, y las rentas de antes
// ---------------------------------------------------------------------------

test('las rentas con `empleadoId` se juntan por empleado aunque el nombre de ese día esté escrito distinto', () => {
  const a = firme('c1');
  const b = { ...firme('c2'), rentadoPor: 'ana lopez' };
  const grupos = agruparPorEmpleado([a, b], []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].empleadoId, 'e1');
  assert.equal(grupos[0].sinEnlazar, false);
  assert.equal(grupos[0].cuenta.totalPorPagar, 280);
});

test('las rentas de antes (solo el nombre escrito a mano) siguen apareciendo y pagándose, agrupadas por ese texto y sin enlazar', () => {
  const vieja = rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' });
  assert.equal('empleadoId' in vieja, false, 'el contrato de antes ni siquiera trae la llave');
  const [g] = agruparPorEmpleado([vieja], []);
  assert.equal(g.empleadoId, null);
  assert.equal(g.sinEnlazar, true);
  assert.equal(g.nombre, 'Pedro');
  assert.equal(g.cuenta.totalPorPagar, 140, 'con el 5 % de entonces: sigue siendo pagable');
  assert.deepEqual(g.cuenta.porPagar.map((c) => c.id), ['v1']);
});

test('el nombre de respaldo de un grupo es el menor de los textos escritos, no el del primer contrato que llegó', () => {
  const uno = { ...firme('c1'), rentadoPor: 'zeta' };
  const dos = { ...firme('c2'), rentadoPor: 'alfa' };
  assert.equal(agruparPorEmpleado([uno, dos], [])[0].nombre, 'alfa');
  assert.equal(agruparPorEmpleado([dos, uno], [])[0].nombre, 'alfa');
});

test('no se adivina que «Wilder» a mano y el empleado Wilder son la misma persona: dos grupos, visibles, hasta que se enlacen', () => {
  const vieja = rentaDeAntes({ id: 'v1', rentadoPor: 'Wilder', recibidoEl: '2026-09-29' });
  const nueva = renta({ id: 'n1', empleado: wilder, recibidoEl: '2026-10-05' });
  const grupos = agruparPorEmpleado([vieja, nueva], []);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos.map((g) => g.sinEnlazar).sort(), [false, true]);
});

test('un nombre escrito dos veces parecido («Pedro», «Pedro »): se recorta, pero «pedro» no se junta con «Pedro»', () => {
  const a = rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' });
  const b = rentaDeAntes({ id: 'v2', rentadoPor: '  Pedro  ', recibidoEl: '2026-09-29' });
  const c = rentaDeAntes({ id: 'v3', rentadoPor: 'pedro', recibidoEl: '2026-09-29' });
  const grupos = agruparPorEmpleado([a, b, c], []);
  assert.equal(grupos.length, 2);
});

test('un texto que se parece a un id («e1») no se junta con el empleado enlazado', () => {
  const vieja = rentaDeAntes({ id: 'v1', rentadoPor: 'e1', recibidoEl: '2026-09-29' });
  const nueva = firme('n1');
  assert.equal(agruparPorEmpleado([vieja, nueva], []).length, 2);
});

test('una renta sin ningún nombre tiene su grupo: ningún monto se queda fuera de la vista', () => {
  const sinNombre = { ...rentaDeAntes({ id: 'v1', rentadoPor: '', recibidoEl: '2026-09-29' }) };
  const [g] = agruparPorEmpleado([sinNombre], []);
  assert.equal(g.nombre, 'Sin empleado anotado');
  assert.equal(g.cuenta.totalPorPagar, 140);
});

test('el orden: de lo que más se debe a lo que menos, y a igual deuda por nombre y luego por clave (no salta entre pantallas)', () => {
  const contratos = [
    renta({ id: 'a1', empleado: ana, recibidoEl: '2026-10-05' }),
    renta({ id: 'l1', empleado: luis, recibidoEl: '2026-10-05' }),
    renta({ id: 'l2', empleado: luis, recibidoEl: '2026-10-05' }),
    renta({ id: 'w1', empleado: wilder, recibidoEl: '2026-10-05' }),
  ];
  const nombres = agruparPorEmpleado(contratos, []).map((g) => g.nombre);
  assert.deepEqual(nombres, ['Luis Mérida', 'Ana López', 'Wilder']);
  assert.deepEqual(agruparPorEmpleado([...contratos].reverse(), []).map((g) => g.nombre), nombres, 'no depende del orden de llegada');
});

test('el total de todos es la suma de lo que dice cada cuenta, y lanza si no recibe una lista', () => {
  const contratos = [
    renta({ id: 'a1', empleado: ana, recibidoEl: '2026-10-05' }),
    renta({ id: 'l1', empleado: luis, recibidoEl: '2026-10-05' }),
    renta({ id: 'w1', empleado: wilder, recibidoEl: '2026-10-05' }),
  ];
  const grupos = agruparPorEmpleado(contratos, []);
  assert.equal(totalGeneralDeComisiones(grupos.map((g) => g.cuenta)), 140 + 210, 'Luis 7.5 % de 2,800 = 210');
  assert.equal(totalGeneralDeComisiones([]), 0);
  assert.throws(() => totalGeneralDeComisiones(undefined), /«cuentas» debe ser una lista/);
});

// ---------------------------------------------------------------------------
// El porcentaje es el SELLADO en el contrato, no el que el empleado tiene hoy
// ---------------------------------------------------------------------------

test('subirle el porcentaje a alguien no mueve las comisiones ya ganadas: la cuenta lee el del contrato', () => {
  const antes = renta({ id: 'c1', empleado: ana, recibidoEl: '2026-10-05' });
  const despues = renta({ id: 'c2', empleado: { ...ana, porcentajeComision: 10 }, recibidoEl: '2026-10-05' });
  const cuenta = cuentaDeEmpleado({ contratos: [antes, despues], pagos: [] });
  assert.equal(comisionDe(antes).monto, 140);
  assert.equal(comisionDe(despues).monto, 280);
  assert.equal(cuenta.totalPorPagar, 420, 'cada renta con el suyo, y el primero no se movió');
});

// ---------------------------------------------------------------------------
// Qué marcar y cuánto suma: UNA sola cuenta
// ---------------------------------------------------------------------------

test('lo marcado suma exacto lo que se guarda: monto y ids salen de la misma lista, sin repetidos', () => {
  const contratos = [firme('c1'), renta({ id: 'c2', empleado: luis, recibidoEl: '2026-10-05' }), firme('c3')];
  const cuenta = cuentaDeEmpleado({ contratos, pagos: [] });
  const elegido = elegirParaPagoDeComision(cuenta, ['c1', 'c2', 'c2']);
  assert.deepEqual(elegido.contratos, ['c1', 'c2']);
  assert.equal(elegido.monto, 140 + 210);
  assert.deepEqual(elegido.rentas.map((c) => c.id), ['c1', 'c2']);
});

test('una casilla que ya no corresponde a nada (ya pagada, o que no es de esta cuenta) no entra', () => {
  const contratos = [firme('c1'), firme('c2')];
  const pagos = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] })];
  const cuenta = cuentaDeEmpleado({ contratos, pagos });
  const elegido = elegirParaPagoDeComision(cuenta, ['c1', 'c2', 'otra-cuenta']);
  assert.deepEqual(elegido.contratos, ['c2']);
  assert.equal(elegido.monto, 140);
  assert.deepEqual(elegirParaPagoDeComision(cuenta, undefined), { rentas: [], contratos: [], monto: 0 });
});

test('el dinero pasa por q(): los centavos no se arrastran', () => {
  // 3 días a Q333.33 al 7.5 %: la comisión de cada una es 74.9992 → 75.00.
  const c1 = renta({ id: 'c1', empleado: luis, dias: 3, precioDia: 333.33, fechaSalida: '2026-10-01', recibidoEl: '2026-10-04' });
  const c2 = renta({ id: 'c2', empleado: luis, dias: 3, precioDia: 333.33, fechaSalida: '2026-10-01', recibidoEl: '2026-10-04' });
  const cuenta = cuentaDeEmpleado({ contratos: [c1, c2], pagos: [] });
  assert.equal(cuenta.totalPorPagar, comisionDe(c1).monto + comisionDe(c2).monto);
  assert.equal(q(cuenta.totalPorPagar), cuenta.totalPorPagar, 'sin más de dos decimales');
});

test('las listas salen en un orden fijo: por fecha de regreso (el mes en que cuenta, §5) y luego por número', () => {
  const tarde = renta({ id: 'a', numero: 3, fechaSalida: '2026-10-10', recibidoEl: '2026-10-14' });
  const pronto = renta({ id: 'b', numero: 9, fechaSalida: '2026-10-01', recibidoEl: '2026-10-05' });
  const mismoDia = renta({ id: 'c', numero: 2, fechaSalida: '2026-10-01', recibidoEl: '2026-10-05' });
  const ids = (xs) => cuentaDeEmpleado({ contratos: xs, pagos: [] }).porPagar.map((c) => c.id);
  assert.deepEqual(ids([tarde, pronto, mismoDia]), ['c', 'b', 'a']);
  assert.deepEqual(ids([mismoDia, tarde, pronto]), ['c', 'b', 'a']);
});
