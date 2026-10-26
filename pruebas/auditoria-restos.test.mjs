// Pruebas que cierran los últimos huecos baratos que la auditoría de mutaciones del 26 de octubre de 2026 encontró: ids vacíos en la
// lista de rentas de un pago, el orden de las listas de empleados y de comisiones, un contador dañado, unos días que no son un
// número. Cada una nació de un mutante que SOBREVIVIÓ: se le metió a propósito un error al código y las 2,589 pruebas de entonces
// seguían en verde. Aquí cada una falla con ese error puesto y pasa con el código bueno. Qué le habría costado al dueño cada uno:
// .superpowers/auditoria-pruebas-2026-10-26.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarEmpleados, siguienteCodigo, ordenarEmpleados,
} from '../js/nucleo/empleado.js';
import { cuentaDeEmpleado, estadoDelComprobante } from '../js/nucleo/comisiones.js';
import { pagadoDeMas, cuentaDeDueno } from '../js/nucleo/liquidacion.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import { construirPagoComision, pagoComisionParaGuardar, siguienteNumeroComprobante, siguienteNumeroComprobanteComision } from '../js/datos.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { renta, rentaDeAntes, EMPLEADOS } from './fixtures/rentasConComision.mjs';
import { cerrado, pagoReal } from './fixtures/duenoDeCarros.mjs';

const { ana, wilder } = EMPLEADOS;

test('los empleados: una lista que no es lista se lee como vacía, la búsqueda vacía trae a todos, y el código exacto va primero', () => {
  // `Array.isArray(lista) ? lista : []` y `if (!buscado) return empleados`: sin ellos, una lista que no llegó tronaba la pantalla y la
  // caja vacía no mostraba a nadie.
  const lista = [{ id: 'a', codigo: '16', nombre: 'Luis' }, { id: 'b', codigo: '6', nombre: 'Wilder' }, { id: 'c', codigo: '2', nombre: 'Ana 6' }];
  assert.deepEqual(buscarEmpleados(undefined, 'x'), []);
  assert.deepEqual(buscarEmpleados(null, ''), []);
  assert.equal(buscarEmpleados(lista, ''), lista, 'sin nada escrito, la lista tal cual');
  assert.equal(buscarEmpleados(lista, '   '), lista);
  assert.deepEqual(buscarEmpleados(lista, '6').map((e) => e.id), ['b', 'a', 'c'], '«6» da primero a Wilder (código exacto), luego a quien lo contiene');
  assert.deepEqual(siguienteCodigo(undefined), '1');
  assert.equal(siguienteCodigo(lista), '17');
  assert.equal(siguienteCodigo([{ codigo: 'x1' }, { codigo: '' }]), '1', 'sin códigos numéricos, el 1');
  assert.deepEqual(ordenarEmpleados(undefined), []);
});

test('los empleados salen por código como NÚMERO (el 2 antes que el 10); los sin código numérico, al final, por nombre y luego por id', () => {
  const lista = [
    { id: 'z2', codigo: 'x', nombre: 'Beto' }, { id: 'a1', codigo: '10', nombre: 'Diana' }, { id: 'z1', codigo: 'x', nombre: 'Beto' },
    { id: 'm1', codigo: '2', nombre: 'Carlos' }, { id: 'n1', codigo: '', nombre: 'Álvaro' }, { id: 'k1', codigo: '2', nombre: 'Ana' },
  ];
  const orden = (l) => ordenarEmpleados(l).map((e) => e.id);
  const esperado = ['k1', 'm1', 'a1', 'n1', 'z1', 'z2'];
  assert.deepEqual(orden(lista), esperado);
  assert.deepEqual(orden([...lista].reverse()), esperado, 'igual si llegan al revés');
  assert.deepEqual(orden([lista[3], lista[0], lista[5], lista[2], lista[1], lista[4]]), esperado);
});

test('un contador dañado de comprobantes empieza otra vez en 1, no en NaN (el de dueños y el de comisiones)', async () => {
  // `Number(…) || 0` -> `??` en la transacción que comparten los dos contadores de comprobantes.
  for (const [contador, pedir] of [['comprobantes', siguienteNumeroComprobante], ['comprobantesComision', siguienteNumeroComprobanteComision]]) {
    for (const ultimo of ['abc', '', null]) {
      const nube = nubeEnMemoria({ contadores: { [contador]: { ultimo } } });
      assert.equal(await pedir({ iniciar: nube.iniciar }), 1, `${contador} con ultimo ${JSON.stringify(ultimo)}`);
    }
    const bien = nubeEnMemoria({ contadores: { [contador]: { ultimo: 9 } } });
    assert.equal(await pedir({ iniciar: bien.iniciar }), 10);
  }
});

test('sumarDias: unos días que no son un número cuentan como cero, y la fecha se queda como estaba (no se vacía)', () => {
  // `Number(dias) || 0` -> `??`: «abc» daba NaN y la fecha de regreso desaparecía.
  assert.equal(sumarDias('2026-10-01', 'abc'), '2026-10-01');
  assert.equal(sumarDias('2026-10-01', undefined), '2026-10-01');
  assert.equal(sumarDias('2026-10-01', null), '2026-10-01');
  assert.equal(sumarDias('2026-10-01', '3'), '2026-10-04');
  assert.equal(sumarDias('2026-10-01', -1), '2026-09-30');
  assert.equal(sumarDias('mañana', 3), '');
});

test('comisiones: lo ya pagado, lo de 0 % y lo sin porcentaje también salen del que regresó primero al último', () => {
  const r = (id, numero, dia, extra = {}) => renta({ id, numero, recibidoEl: `2026-10-${dia}`, ...extra });
  const pagables = [r('c3', 3, 9), r('c1', 1, 5), r('c2', 2, 7)];
  const pago = pagoComisionParaGuardar({
    ...construirPagoComision({
      empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos: pagables, pagos: [], idsMarcados: ['c1', 'c2', 'c3'],
    }),
    numero: 1,
  }, { id: 'p1', ahora: 1 });
  const cuentaPagados = cuentaDeEmpleado({ contratos: pagables, pagos: [pago] });
  assert.deepEqual(cuentaPagados.pagados.map((c) => c.id), ['c1', 'c2', 'c3']);

  const sinComision = [r('w3', 13, 9, { empleado: wilder }), r('w1', 11, 5, { empleado: wilder }), r('w2', 12, 7, { empleado: wilder })];
  assert.deepEqual(cuentaDeEmpleado({ contratos: sinComision, pagos: [] }).sinComision.map((c) => c.id), ['w1', 'w2', 'w3']);

  const sinPorcentaje = ['x3', 'x1', 'x2'].map((id, i) => rentaDeAntes({
    id, numero: 20 + i, porcentajeComision: null, fechaSalida: '2026-10-01', recibidoEl: `2026-10-0${[9, 5, 7][i]}`,
  }));
  assert.deepEqual(sinPorcentaje.map((c) => c.porcentajeComision), [null, null, null], 'el escenario: ningún porcentaje legible');
  assert.deepEqual(cuentaDeEmpleado({ contratos: sinPorcentaje, pagos: [] }).sinPorcentaje.map((c) => c.id), ['x1', 'x2', 'x3']);
});

test('un id vacío entre las rentas de un pago de comisión no lo descompone: se sigue avisando si cambió y el comprobante se arma', () => {
  // `pago.contratos.filter(Boolean)` quitado: el `null` contaba como una renta que «ya no está» y se callaba el aviso, o el
  // detalle «no era de las mismas rentas que el pago cubre» y el comprobante se negaba.
  const original = renta({ id: 'c1', numero: 1, empleado: ana, recibidoEl: '2026-10-05' });
  const pago = pagoComisionParaGuardar({
    ...construirPagoComision({
      empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos: [original], pagos: [], idsMarcados: ['c1'],
    }),
    numero: 4,
  }, { id: 'p1', ahora: 1 });
  const conVacios = { ...pago, contratos: ['c1', null, '', undefined] };
  assert.equal(estadoDelComprobante(conVacios).tipo, 'listo');
  const corregida = renta({ id: 'c1', numero: 1, empleado: ana, recibidoEl: '2026-10-05', descuento: 400 });
  const [cambio] = cuentaDeEmpleado({ contratos: [corregida], pagos: [conVacios] }).pagosQueCambiaron;
  assert.equal(cambio.diferencia, -20);
});

test('un id vacío entre las rentas de un pago a un dueño no lo vuelve «incompleto»: se sigue diciendo que se pagó de más', () => {
  // `new Set(pago.contratos.filter(Boolean))` sin el filtro: el null contaba como una renta que falta, el grupo ya no era de fiar y
  // el «se le pagó de más» desaparecía de la ficha.
  const original = cerrado('r1', 3);
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [original], idsMarcados: ['r1'] });
  const corregida = cerrado('r1', 0);
  const conVacio = { ...p1, contratos: ['r1', null] };
  const cuenta = cuentaDeDueno({ contratos: [corregida], pagos: [conVacio] });
  assert.equal(cuenta.gruposDePago[0].completo, true);
  assert.equal(pagadoDeMas(cuenta, [])[0].deMas, 900, 'Q2,100 pagados contra Q1,200 que cuesta hoy');
});
