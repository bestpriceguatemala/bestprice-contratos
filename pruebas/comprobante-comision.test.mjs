// Pruebas del comprobante de pago de comisión que se le entrega a un empleado (23 de octubre de 2026): lo que el pago GUARDA
// para que el papel exista (`numero` y `detalle[]`), el papel mismo (js/pantallas/comprobanteComision.js) y su botón en la ficha.
//
// Su gemelo es pruebas/comprobante.test.mjs (el papel del dueño de un carro ajeno). La regla de este archivo, la que lo
// distingue: UNA REIMPRESIÓN DICE LO QUE DIJO EL ORIGINAL, porque el empleado tiene la primera copia. Por eso casi todo lo de
// aquí se prueba contra un pago cuyas rentas DESPUÉS CAMBIARON: el papel no puede cambiar con ellas.
//
// Las rentas NO están inventadas: salen de pruebas/fixtures/rentasConComision.mjs, que las arma con las mismas funciones que
// las arman de verdad (`construirContrato`, `construirCierre`, `contratoParaGuardar`), y los pagos salen de las funciones que
// de verdad los arman y los sellan (`construirPagoComision`, `pagoComisionParaGuardar`).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cuentaDeEmpleado, elegirParaPagoDeComision, filaDeDetalle, estadoDelComprobante, CAMPOS_DEL_DETALLE,
} from '../js/nucleo/comisiones.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { suma } from '../js/nucleo/dinero.js';
import { renta, rentaDeAntes, pagoDeComision, EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { luis } = EMPLEADOS;

const firme = (id, extra = {}) => renta({ id, recibidoEl: '2026-10-05', ...extra });

// ---------------------------------------------------------------------------
// El detalle: lo que el pago guarda renta por renta
// ---------------------------------------------------------------------------

test('el detalle de una renta: los diez datos que el papel dice, con los nombres del contrato donde es el mismo dato', () => {
  const c = firme('c1', { numero: 7 });
  const fila = filaDeDetalle(c);
  assert.deepEqual(Object.keys(fila), CAMPOS_DEL_DETALLE, 'ni una llave de más ni de menos, en este orden');
  assert.deepEqual(fila, {
    contratoId: 'c1', numero: 7, fechaReal: '2026-10-05', carroPlacas: 'P-7AAA', clienteNombre: 'Juan Pérez',
    dias: 4, diasAtraso: 0, base: 2800, porcentajeComision: 5, monto: 140,
  });
  // Los nombres que ya existen en el contrato se llaman igual (§7b: un dato, un nombre).
  for (const campo of ['numero', 'carroPlacas', 'clienteNombre', 'dias', 'porcentajeComision']) {
    assert.ok(campo in c, `el contrato ya tiene «${campo}»`);
    assert.deepEqual(fila[campo], c[campo], campo);
  }
  assert.equal(fila.fechaReal, c.cierre.fechaReal, 'fechaReal es la del cierre');
});

test('el detalle trae la base, el atraso y el monto de `comisionDe`, no unos propios: con atraso y descuento sigue siendo lo mismo', () => {
  // Regresó 2 días tarde (devolución prevista 2026-10-05) y con Q300 de descuento al cliente: base = (4 + 2) × 700 − 300.
  const c = renta({ id: 'c1', fechaSalida: '2026-10-01', recibidoEl: '2026-10-07', descuento: 300 });
  const fila = filaDeDetalle(c);
  assert.equal(fila.diasAtraso, 2);
  assert.equal(fila.base, 3900);
  assert.equal(fila.monto, 195);
  assert.deepEqual([fila.base, fila.porcentajeComision, fila.monto], [comisionDe(c).base, comisionDe(c).porcentaje, comisionDe(c).monto]);
});

test('el detalle TOMA lo permitido: lo que el cliente pagó, la garantía, la tarjeta, el costo y el dueño de un carro ajeno no llegan', () => {
  const c = renta({ id: 'c1', ajeno: true, garantiaSinLiberar: true, recibidoEl: '2026-10-05', danos: 0 });
  assert.ok(c.garantiaMonto > 0 && c.carroAjeno?.dueno, 'el escenario de verdad tiene garantía, tarjeta y dueño ajeno');
  const texto = JSON.stringify(filaDeDetalle(c));
  for (const prohibido of ['3343', 'BAC', 'Don Mario', 'Ford', '5000', '400', 'garantia', 'tarjeta', 'costoDia', 'pagos']) {
    assert.ok(!texto.includes(prohibido), `«${prohibido}» no puede estar en el detalle: ${texto}`);
  }
  assert.deepEqual(Object.keys(filaDeDetalle(c)), CAMPOS_DEL_DETALLE);
});

test('un contrato con un campo nuevo no lo arrastra al detalle: se toma lo permitido, no se quita lo prohibido', () => {
  const c = { ...firme('c1'), campoDelFuturo: 'SECRETO-DEL-FUTURO', utilidad: 987654 };
  const texto = JSON.stringify(filaDeDetalle(c));
  assert.ok(!texto.includes('SECRETO-DEL-FUTURO') && !texto.includes('987654'));
});

test('el detalle nunca lleva `undefined` (Firestore lo rechaza): lo que falta sale como texto vacío, 0 o null', () => {
  const sin = { id: 'x', cierre: {}, porcentajeComision: 5 };
  const fila = filaDeDetalle(sin);
  for (const [llave, valor] of Object.entries(fila)) assert.notEqual(valor, undefined, llave);
  assert.deepEqual([fila.numero, fila.fechaReal, fila.carroPlacas, fila.clienteNombre], [null, '', '', '']);
});

test('lo elegido para pagar trae su detalle: una fila por renta, en el mismo orden, y el monto ES la suma de las filas', () => {
  const contratos = [firme('c1', { numero: 1 }), renta({ id: 'c2', numero: 2, empleado: luis, recibidoEl: '2026-10-05' }), firme('c3', { numero: 3 })];
  const cuenta = cuentaDeEmpleado({ contratos, pagos: [] });
  const elegido = elegirParaPagoDeComision(cuenta, ['c2', 'c1', 'c3']);
  assert.deepEqual(elegido.detalle.map((f) => f.contratoId), elegido.contratos, 'las mismas rentas, en el mismo orden');
  assert.equal(elegido.monto, suma(...elegido.detalle.map((f) => f.monto)));
  assert.equal(elegido.monto, 140 + 210 + 140);
  elegido.rentas.forEach((c, i) => assert.equal(elegido.detalle[i].monto, comisionDe(c).monto, c.id));
});

test('lo que no se puede pagar no tiene fila: ni la abierta, ni la ya pagada, ni la de 0 %', () => {
  const contratos = [firme('c1'), renta({ id: 'c2' }), firme('c3'), renta({ id: 'w1', empleado: EMPLEADOS.wilder, recibidoEl: '2026-10-05' })];
  const pagos = [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c3'] })];
  const cuenta = cuentaDeEmpleado({ contratos, pagos });
  const elegido = elegirParaPagoDeComision(cuenta, ['c1', 'c2', 'c3', 'w1']);
  assert.deepEqual(elegido.detalle.map((f) => f.contratoId), ['c1']);
});

// ---------------------------------------------------------------------------
// ¿Este pago puede dar un papel? Lo dice solo lo que el pago guardó
// ---------------------------------------------------------------------------

/** Un pago sellado como lo dejará el registro: sus rentas, el detalle de ellas y un número. */
function pagoSellado({ numero = 12, ids = ['c1', 'c2'], extra = {} } = {}) {
  const cuenta = cuentaDeEmpleado({ contratos: ids.map((id) => firme(id)), pagos: [] });
  const elegido = elegirParaPagoDeComision(cuenta, ids);
  return {
    id: 'p1', empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', monto: elegido.monto, contratos: elegido.contratos, detalle: elegido.detalle, numero, ...extra,
  };
}

test('un pago con su número y un detalle que lo explica está listo', () => {
  assert.deepEqual(estadoDelComprobante(pagoSellado()), { tipo: 'listo' });
  assert.deepEqual(estadoDelComprobante(pagoSellado({ ids: ['c1'] })), { tipo: 'listo' });
});

test('un pago de antes (ni número ni detalle) es «de-antes», y no se confunde con uno dañado', () => {
  const viejo = pagoDeComision({ id: 'p0', monto: 140, contratos: ['c1'] });
  assert.deepEqual(estadoDelComprobante(viejo), { tipo: 'de-antes' });
  assert.deepEqual(estadoDelComprobante({ ...viejo, numero: null, detalle: null }), { tipo: 'de-antes' }, 'null y ausente son lo mismo');
  assert.deepEqual(estadoDelComprobante(undefined), { tipo: 'de-antes' }, 'lo que no es un pago tampoco tiene papel');
});

test('uno solo de los dos (número o detalle) es un pago dañado: nunca «de antes», porque ese sí tendría los dos', () => {
  const completo = pagoSellado();
  const sinDetalle = { ...completo }; delete sinDetalle.detalle;
  const sinNumero = { ...completo }; delete sinNumero.numero;
  assert.equal(estadoDelComprobante(sinDetalle).tipo, 'danado');
  assert.match(estadoDelComprobante(sinDetalle).motivo, /número pero no el detalle/);
  assert.equal(estadoDelComprobante(sinNumero).tipo, 'danado');
  assert.match(estadoDelComprobante(sinNumero).motivo, /detalle pero no su número/);
});

test('un número que no es un comprobante (0, negativo, con decimales, texto) deja el pago dañado', () => {
  for (const numero of [0, -3, 1.5, '12', NaN, true]) {
    assert.equal(estadoDelComprobante(pagoSellado({ extra: { numero } })).tipo, 'danado', `numero: ${String(numero)}`);
  }
});

test('un detalle que no es una lista de rentas, o una fila que no es una renta, deja el pago dañado', () => {
  for (const detalle of [[], {}, 'texto', 7, [null], [[]], ['c1'], [{}]]) {
    assert.equal(estadoDelComprobante(pagoSellado({ extra: { detalle } })).tipo, 'danado', JSON.stringify(detalle));
  }
});

test('una fila sin una cifra legible, o sin comisión, deja el pago dañado: el papel no dice Q0.00 donde falta un dato', () => {
  for (const campo of ['dias', 'diasAtraso', 'base', 'porcentajeComision', 'monto']) {
    for (const valor of [undefined, null, '140', NaN, Infinity]) {
      const pago = pagoSellado();
      pago.detalle = pago.detalle.map((f, i) => (i === 0 ? { ...f, [campo]: valor } : f));
      assert.equal(estadoDelComprobante(pago).tipo, 'danado', `${campo}: ${String(valor)}`);
    }
  }
  // Una fila de comisión cero no podría haber entrado al pago, aunque la suma siga cuadrando con el monto guardado.
  const pago = pagoSellado();
  pago.detalle = pago.detalle.map((f, i) => (i === 1 ? { ...f, monto: 0 } : f));
  pago.monto = pago.detalle[0].monto;
  assert.equal(estadoDelComprobante(pago).tipo, 'danado');
});

test('el detalle tiene que ser de las MISMAS rentas que el pago cubre: ni una de más, ni una de menos, ni repetida', () => {
  const base = pagoSellado();
  const [f1, f2] = base.detalle;
  const casos = {
    'una renta de más en el detalle': { ...base, detalle: [...base.detalle, { ...f1, contratoId: 'otra' }], monto: base.monto + f1.monto },
    'una renta de menos en el detalle': { ...base, detalle: [f1], monto: f1.monto },
    'otra renta en lugar de una': { ...base, detalle: [f1, { ...f2, contratoId: 'otra' }] },
    'una renta repetida': { ...base, detalle: [f1, f1], monto: suma(f1.monto, f1.monto) },
    'sin contratos': { ...base, contratos: [] },
    'contratos no es lista': { ...base, contratos: 'c1' },
  };
  for (const [nombre, pago] of Object.entries(casos)) {
    assert.equal(estadoDelComprobante(pago).tipo, 'danado', nombre);
  }
});

test('el detalle tiene que sumar el monto guardado: unas filas que no suman su total se leen como un error de cuentas', () => {
  const pago = pagoSellado();
  assert.equal(estadoDelComprobante({ ...pago, monto: pago.monto + 0.01 }).tipo, 'danado');
  assert.equal(estadoDelComprobante({ ...pago, monto: pago.monto - 140 }).tipo, 'danado');
  assert.match(estadoDelComprobante({ ...pago, monto: 1 }).motivo, /no suman lo que se pagó/);
  // Y los centavos van por q(): 0.1 + 0.2 no rompe una suma que sí cuadra.
  const centavos = {
    ...pago, monto: 0.3, contratos: ['a', 'b'], detalle: [{ ...pago.detalle[0], contratoId: 'a', monto: 0.1 }, { ...pago.detalle[1], contratoId: 'b', monto: 0.2 }],
  };
  assert.equal(estadoDelComprobante(centavos).tipo, 'listo');
});

test('lo dice solo el pago: no recibe las rentas de hoy, y una renta de antes de la lista de empleados también tiene su fila', () => {
  assert.equal(estadoDelComprobante.length, 1, 'recibe un solo argumento: el pago');
  const viejo = pagoDeComision({ id: 'p0', monto: 140, contratos: ['c1'] });
  assert.deepEqual(estadoDelComprobante(viejo), estadoDelComprobante({ ...viejo, empleadoId: 'e99' }));
  const antes = rentaDeAntes({ id: 'v1', recibidoEl: '2026-09-29' });
  assert.equal(filaDeDetalle(antes).monto, 140, 'el papel no mira quién la rentó ni si estaba enlazada');
});
