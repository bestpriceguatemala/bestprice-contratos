// Pruebas de la cuenta de comisiones de cada empleado (js/nucleo/comisiones.js): qué se le debe, qué todavía no es
// firme y qué ya se le pagó. Es la gemela de pruebas/liquidacion.test.mjs, la de los dueños de carros ajenos.
//
// Las rentas salen de las funciones que arman las de verdad (pruebas/fixtures/rentasConComision.mjs), y la
// comisión de cada una la sigue calculando `comisionDe` (nucleo/comision.js), que aquí no se vuelve a escribir.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cuentaDeEmpleado, agruparPorEmpleado, elegirParaPagoDeComision, totalGeneralDeComisiones, estadoDeComision, rentasSinPagar,
  sinMarcarDeComision, periodosDePago, quincenaDe,
} from '../js/nucleo/comisiones.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { esPagableAlDueno } from '../js/nucleo/liquidacion.js';
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
// Solo se paga lo firme, y firme es un contrato CERRADO (el dueño, 14 de octubre de 2026)
// ---------------------------------------------------------------------------

test('una renta de contrato cerrado es pagable; una que sigue afuera NO: su comisión es un estimado', () => {
  const cuenta = cuentaDeEmpleado({ contratos: [firme('c1'), abierta('c2')], pagos: [] });
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.noFirmes.map((c) => c.id), ['c2']);
  assert.equal(cuenta.totalPorPagar, 140, 'el estimado de la que sigue afuera no suma');
  assert.equal(cuenta.totalEstimado, 140, 'pero se ve cuánto sería, aparte');
});

test('el carro volvió pero el cliente todavía DEBE: no es pagable, está en «no firmes», y su monto ya se conoce', () => {
  const conSaldo = renta({ id: 'c1', recibidoEl: '2026-10-05', danos: 200, cerrada: false });
  assert.equal(estadoContrato(conSaldo), 'devuelto', 'el escenario: devuelto, con Q200 de daños sin cobrar');
  assert.equal(comisionDe(conSaldo).firme, true, 'el monto sí se conoce: el carro volvió');
  assert.equal(estadoDeComision(conSaldo), 'sin-cerrar');
  const cuenta = cuentaDeEmpleado({ contratos: [conSaldo, firme('c2')], pagos: [] });
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c2']);
  assert.deepEqual(cuenta.noFirmes.map((c) => c.id), ['c1']);
  assert.equal(cuenta.totalPorPagar, 140, 'la del cliente que debe no suma');
  assert.equal(cuenta.totalEstimado, 0, 'NO es un estimado: el carro volvió y su monto ya es ese');
  assert.equal(cuenta.totalPorCerrar, 140, 'es lo que solo espera a que el contrato cierre');
  assert.deepEqual(elegirParaPagoDeComision(cuenta, ['c1']), { rentas: [], contratos: [], monto: 0 }, 'ni marcándola a la fuerza');
});

test('el carro volvió y no se debe nada, pero la GARANTÍA sigue sin liberar: tampoco es pagable', () => {
  const conGarantia = renta({ id: 'c1', recibidoEl: '2026-10-05', garantiaSinLiberar: true });
  assert.equal(estadoContrato(conGarantia), 'devuelto');
  assert.equal(estadoDeComision(conGarantia), 'sin-cerrar');
  assert.deepEqual(cuentaDeEmpleado({ contratos: [conGarantia], pagos: [] }).noFirmes.map((c) => c.id), ['c1']);
});

test('cuando el contrato cierra (el cliente paga), la comisión pasa a «por pagar» sin que nada más cambie', () => {
  const debiendo = renta({ id: 'c1', recibidoEl: '2026-10-05', danos: 200, cerrada: false });
  const pagado = renta({ id: 'c1', recibidoEl: '2026-10-05', danos: 200 });
  assert.equal(estadoDeComision(debiendo), 'sin-cerrar');
  assert.equal(estadoDeComision(pagado), 'por-pagar');
  assert.equal(comisionDe(debiendo).monto, comisionDe(pagado).monto, 'los daños no entran a la base: el monto es el mismo');
});

test('UNA SOLA REGLA para los dos pagos: una comisión se paga exactamente cuando se le podría pagar a un dueño de carro ajeno', () => {
  const casos = [
    { recibidoEl: null },
    { recibidoEl: '2026-10-05', danos: 200, cerrada: false },
    { recibidoEl: '2026-10-05', garantiaSinLiberar: true },
    { recibidoEl: '2026-10-05' },
    { recibidoEl: '2026-10-06' },
    { recibidoEl: '2026-10-05', descuento: 300 },
  ];
  for (const [i, caso] of casos.entries()) {
    const ajena = renta({ id: `a${i}`, ajeno: true, ...caso });
    const deComision = estadoDeComision(ajena) === 'por-pagar';
    assert.equal(deComision, esPagableAlDueno(ajena), `${JSON.stringify(caso)}: la comisión y el pago al dueño preguntan lo mismo`);
    assert.equal(deComision, estadoContrato(ajena) === 'cerrado');
  }
});

test('un día de atraso sube la comisión y un descuento la baja: por eso la que sigue afuera es solo un estimado', () => {
  // (Con atraso el cliente debe esa renta de más: la comisión se paga cuando ya la pagó y el contrato cierra.)
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

test('el estado de una comisión lo dice una sola función, y se pregunta por `estadoContrato`, no por el campo `estado` guardado', () => {
  assert.equal(estadoDeComision(firme('c1')), 'por-pagar');
  assert.equal(estadoDeComision(abierta('c2')), 'estimada');
  // Un sello `estado` viejo o equivocado no cambia nada: lo que manda es lo que dice el contrato (cierre, saldo, garantía).
  assert.equal(estadoDeComision({ ...abierta('c3'), estado: 'cerrado' }), 'estimada');
  assert.equal(estadoDeComision({ ...firme('c4'), estado: 'rentado' }), 'por-pagar');
  const debiendo = renta({ id: 'c5', recibidoEl: '2026-10-05', danos: 200, cerrada: false });
  assert.equal(estadoDeComision({ ...debiendo, estado: 'cerrado' }), 'sin-cerrar', 'un sello «cerrado» viejo no la vuelve pagable');
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

test('un pago que cubre una renta cuyo carro todavía no regresa no afirma nada sobre cuánto suman: ese monto aún se mueve', () => {
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
  assert.equal('empleadoCodigo' in vieja, false, 'ni la del código del empleado');
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

test('cada grupo trae su clave (la de la dirección de su ficha): `id:` si está enlazado y `texto:` si lo escribió a mano', () => {
  const grupos = agruparPorEmpleado([firme('c1'), rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })], []);
  assert.deepEqual(grupos.map((g) => g.clave).sort(), ['id:e1', 'texto:Pedro']);
  assert.equal(new Set(grupos.map((g) => g.clave)).size, grupos.length, 'únicas');
});

test('rentasSinPagar: todo lo que no está pagado, de cualquier tipo — y nunca lo ya pagado (a eso no se le cambia el porcentaje)', () => {
  const contratos = [
    firme('porpagar'), abierta('afuera'), renta({ id: 'cero', empleado: wilder, recibidoEl: '2026-10-05' }),
    { ...firme('sinpct'), porcentajeComision: '' }, firme('pagada'),
  ];
  const cuenta = cuentaDeEmpleado({ contratos, pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['pagada'] })] });
  assert.deepEqual(rentasSinPagar(cuenta).map((c) => c.id).sort(), ['afuera', 'cero', 'porpagar', 'sinpct']);
  assert.deepEqual(rentasSinPagar(undefined), []);
});

// ---------------------------------------------------------------------------
// El dueño paga por quincena y por fin de mes: marcar un período es un clic
// ---------------------------------------------------------------------------

test('quincenaDe: la primera es del 1 al 15 y la segunda del 16 al fin de mes, en cualquier mes', () => {
  assert.deepEqual(quincenaDe('2026-10-01'), { mes: '2026-10', quincena: 1 });
  assert.deepEqual(quincenaDe('2026-10-15'), { mes: '2026-10', quincena: 1 }, 'el 15 todavía es de la primera');
  assert.deepEqual(quincenaDe('2026-10-16'), { mes: '2026-10', quincena: 2 });
  assert.deepEqual(quincenaDe('2026-10-31'), { mes: '2026-10', quincena: 2 });
  assert.deepEqual(quincenaDe('2026-02-28'), { mes: '2026-02', quincena: 2 }, 'un mes de 28 días');
  assert.deepEqual(quincenaDe('2028-02-29'), { mes: '2028-02', quincena: 2 }, 'y uno bisiesto');
  assert.deepEqual(quincenaDe('2026-12-16'), { mes: '2026-12', quincena: 2 });
});

test('quincenaDe: lo que no es una fecha de calendario no es de ninguna quincena', () => {
  for (const mala of ['', undefined, null, '2026-02-30', '20261-10-05', 'hoy', 20261005]) {
    assert.strictEqual(quincenaDe(mala), null, JSON.stringify(mala));
  }
});

/** Una renta de 2 días que regresa en `regreso` (salió 2 días antes: a tiempo, comisión de Q70). */
const regresa = (id, regreso, extra = {}) => {
  const salida = new Date(`${regreso}T12:00:00Z`);
  salida.setUTCDate(salida.getUTCDate() - 2);
  return renta({ id, fechaSalida: salida.toISOString().slice(0, 10), dias: 2, recibidoEl: regreso, ...extra });
};

test('los períodos: por mes, el mes completo y cada quincena que tenga algo, con cuántas rentas y cuánto suman', () => {
  const contratos = [
    regresa('a1', '2026-10-03'), regresa('a2', '2026-10-15'), regresa('a3', '2026-10-16'),
    regresa('a4', '2026-10-31'), regresa('a5', '2026-10-31'),
  ];
  const [oct, ...otros] = periodosDePago(cuentaDeEmpleado({ contratos, pagos: [] }));
  assert.deepEqual(otros, []);
  assert.equal(oct.mes, '2026-10');
  assert.deepEqual([oct.cuantas, oct.total], [5, 350]);
  assert.deepEqual(oct.contratos.sort(), ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(oct.quincenas.map((x) => [x.quincena, x.cuantas, x.total]), [[1, 2, 140], [2, 3, 210]]);
  assert.deepEqual(oct.quincenas[0].contratos.sort(), ['a1', 'a2']);
  assert.deepEqual(oct.quincenas[1].contratos.sort(), ['a3', 'a4', 'a5']);
});

test('los períodos: una quincena vacía no se ofrece, y los meses salen del más viejo al más nuevo', () => {
  const contratos = [regresa('n1', '2026-11-20'), regresa('s1', '2026-09-02'), regresa('o1', '2026-10-17')];
  const meses = periodosDePago(cuentaDeEmpleado({ contratos, pagos: [] }));
  assert.deepEqual(meses.map((m) => m.mes), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(meses.map((m) => m.quincenas.map((x) => x.quincena)), [[1], [2], [2]], 'solo las quincenas con algo');
});

test('los períodos solo cuentan lo PAGABLE: ni lo que no cierra, ni lo ya pagado, ni lo que no genera comisión', () => {
  const contratos = [
    regresa('p1', '2026-10-03'),
    regresa('debe', '2026-10-04', { danos: 200, cerrada: false }),
    regresa('afuera', '2026-10-05', { recibidoEl: null }),
    regresa('pagada', '2026-10-06'),
    regresa('w1', '2026-10-07', { empleado: wilder }),
  ];
  const cuenta = cuentaDeEmpleado({ contratos, pagos: [pagoDeComision({ id: 'x', monto: 70, contratos: ['pagada'] })] });
  const [oct] = periodosDePago(cuenta);
  assert.deepEqual(oct.contratos, ['p1']);
  assert.equal(oct.total, 70);
  assert.deepEqual(periodosDePago(cuentaDeEmpleado({ contratos: [regresa('afuera', '2026-10-05', { recibidoEl: null })], pagos: [] })), []);
  assert.deepEqual(periodosDePago(undefined), []);
});

test('una renta cuenta en el período de la fecha en que REGRESÓ el carro, aunque el contrato haya cerrado después', () => {
  // Regresó el 10 de octubre y el cliente pagó el 18: sigue siendo de la primera quincena.
  const tarde = regresa('t1', '2026-10-10');
  const cuenta = cuentaDeEmpleado({ contratos: [tarde, regresa('t2', '2026-10-20')], pagos: [pagoDeComision({ id: 'p', monto: 70, contratos: ['t2'] })] });
  const [oct] = periodosDePago(cuenta);
  assert.deepEqual(oct.quincenas.map((x) => [x.quincena, x.contratos]), [[1, ['t1']]]);
});

test('una renta cuya fecha de regreso no se lee no cae en ningún período, pero sigue siendo pagable a mano', () => {
  const rara = { ...regresa('r1', '2026-10-03'), cierre: { ...regresa('r1', '2026-10-03').cierre, fechaReal: '2026-10-3x' } };
  const cuenta = { porPagar: [rara, regresa('b1', '2026-10-04')] };
  assert.deepEqual(periodosDePago(cuenta).map((m) => m.contratos), [['b1']]);
});

test('lo que queda SIN MARCAR es el complemento exacto de lo marcado, con su total', () => {
  const cuenta = cuentaDeEmpleado({ contratos: [regresa('a1', '2026-10-03'), regresa('a2', '2026-10-04'), regresa('a3', '2026-10-20')], pagos: [] });
  const marcado = elegirParaPagoDeComision(cuenta, ['a1', 'a2']);
  const resto = sinMarcarDeComision(cuenta, ['a1', 'a2']);
  assert.deepEqual(resto.contratos, ['a3']);
  assert.equal(resto.monto, 70);
  assert.equal(marcado.monto + resto.monto, cuenta.totalPorPagar, 'lo marcado y lo no marcado suman todo lo que se debe');
  assert.deepEqual(sinMarcarDeComision(cuenta, []).contratos.sort(), ['a1', 'a2', 'a3']);
  assert.deepEqual(sinMarcarDeComision(cuenta, ['a1', 'a2', 'a3']), { rentas: [], contratos: [], monto: 0 });
  assert.deepEqual(sinMarcarDeComision(cuenta, ['no-existe']).contratos.length, 3, 'una casilla que no corresponde a nada no quita nada');
  assert.deepEqual(sinMarcarDeComision(undefined, undefined), { rentas: [], contratos: [], monto: 0 });
});

test('lo que puede cambiar y lo que solo espera a cerrar se suman APARTE: la que sigue afuera es estimado, la que volvió debiendo no', () => {
  const afuera = abierta('afuera');
  const debiendo = renta({ id: 'debe', recibidoEl: '2026-10-05', danos: 200, cerrada: false });
  const conGarantia = renta({ id: 'garantia', recibidoEl: '2026-10-05', garantiaSinLiberar: true, empleado: luis });
  const cuenta = cuentaDeEmpleado({ contratos: [afuera, debiendo, conGarantia], pagos: [] });
  assert.deepEqual(cuenta.noFirmes.map((c) => c.id).sort(), ['afuera', 'debe', 'garantia']);
  assert.equal(cuenta.totalEstimado, 140, 'solo la que sigue afuera (4 días × Q700 × 5 %)');
  assert.equal(cuenta.totalPorCerrar, 140 + 210, 'las dos que ya volvieron: Q140 de Ana y Q210 de Luis al 7.5 %');
  assert.equal(cuenta.totalPorPagar, 0, 'ninguna es deuda todavía');
  assert.equal(estadoDeComision(afuera), 'estimada');
  assert.equal(estadoDeComision(debiendo), 'sin-cerrar');
});

test('los períodos salen del más viejo al más nuevo aunque la cuenta que se les pase venga desordenada', () => {
  const nov = regresa('n1', '2026-11-20');
  const sep = regresa('s1', '2026-09-02');
  const oct = regresa('o1', '2026-10-17');
  assert.deepEqual(periodosDePago({ porPagar: [nov, sep, oct] }).map((m) => m.mes), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(periodosDePago({ porPagar: [oct, nov, sep] }).map((m) => m.mes), ['2026-09', '2026-10', '2026-11']);
});

test('el total de un período se suma por q(): 0.10 + 0.20 es 0.30, no 0.30000000000000004', () => {
  const diez = regresa('c1', '2026-10-03', { dias: 1, precioDia: 2, fechaSalida: '2026-10-02' });
  const veinte = regresa('c2', '2026-10-04', { dias: 1, precioDia: 4, fechaSalida: '2026-10-03' });
  assert.deepEqual([comisionDe(diez).monto, comisionDe(veinte).monto], [0.1, 0.2]);
  const [oct] = periodosDePago(cuentaDeEmpleado({ contratos: [diez, veinte], pagos: [] }));
  assert.strictEqual(oct.total, 0.3);
  assert.strictEqual(oct.quincenas[0].total, 0.3);
  assert.strictEqual(sinMarcarDeComision(cuentaDeEmpleado({ contratos: [diez, veinte], pagos: [] }), []).monto, 0.3);
});
