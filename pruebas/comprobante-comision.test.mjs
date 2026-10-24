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
import { readFileSync } from 'node:fs';
import {
  cuentaDeEmpleado, elegirParaPagoDeComision, filaDeDetalle, estadoDelComprobante, CAMPOS_DEL_DETALLE, detallesIguales,
} from '../js/nucleo/comisiones.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { suma } from '../js/nucleo/dinero.js';
import {
  siguienteNumeroComprobante, siguienteNumeroComprobanteComision, construirPagoComision, pagoComisionParaGuardar, guardarPagoComision,
  cargarPagosComision, nuevoIdPagoComision, anularPagoComision, MENSAJE_COMISION_SIN_COMPROBANTE,
} from '../js/datos.js';
import { registrarElPagoDeComision, anularElPagoDeComision, armarVistaDeComisiones } from '../js/pantallas/comisiones.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
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

// ---------------------------------------------------------------------------
// El número: SU contador, con el mismo mecanismo que numera contratos y comprobantes de dueños
// ---------------------------------------------------------------------------

const numeroDe = (nube) => siguienteNumeroComprobanteComision({ iniciar: nube.iniciar });

test('el número del comprobante de comisión: el primero es el 1, y queda en contadores/comprobantesComision', async () => {
  const nube = nubeEnMemoria();
  assert.equal(await numeroDe(nube), 1);
  assert.deepEqual(nube.leer('contadores/comprobantesComision'), { id: 'comprobantesComision', ultimo: 1 });
});

test('tiene SU serie: no gasta números de los dueños, de contratos ni de carros, y los de ellos no mueven la suya', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 41 }, contratos: { ultimo: 100 }, vehiculos: { ultimo: 7 } } });
  assert.equal(await numeroDe(nube), 1, 'el 42 es de un dueño de carro, no de un empleado');
  assert.equal(await numeroDe(nube), 2);
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 41);
  assert.equal(nube.leer('contadores/contratos').ultimo, 100);
  assert.equal(nube.leer('contadores/vehiculos').ultimo, 7);
  assert.equal(await siguienteNumeroComprobante({ iniciar: nube.iniciar }), 42, 'y el de los dueños sigue donde iba');
  assert.equal(nube.leer('contadores/comprobantesComision').ultimo, 2);
});

test('el número: dos pestañas pidiendo a la vez NO se llevan el mismo, y es una transacción', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantesComision: { ultimo: 9 } } });
  const numeros = await Promise.all([numeroDe(nube), numeroDe(nube), numeroDe(nube), numeroDe(nube)]);
  assert.deepEqual([...numeros].sort((a, b) => a - b), [10, 11, 12, 13]);
  const solo = nubeEnMemoria();
  await numeroDe(solo);
  assert.deepEqual(solo.llamadas.filter(([op]) => op === 'tx.get').map((l) => l.slice(0, 2)), [['tx.get', 'contadores/comprobantesComision']]);
  assert.deepEqual(solo.llamadas.filter(([op]) => op === 'tx.set'), [['tx.set', 'contadores/comprobantesComision', { ultimo: 1 }, 'mostrador']]);
  assert.equal(solo.llamadas.filter(([op]) => op === 'getDoc' || op === 'setDoc').length, 0, 'nada fuera de la transacción');
});

test('el número: si la nube falla, falla — no inventa uno, y el contador no se mueve', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantesComision: { ultimo: 5 } }, fallan: [{ op: 'tx.get' }] });
  await assert.rejects(numeroDe(nube), /sin internet/);
  assert.equal(nube.leer('contadores/comprobantesComision').ultimo, 5);
});

test('NINGUNA regla de Firestore cambia: el número se escribe con la sesión normal (contadores es haySesion) y el pago con la de dinero', () => {
  const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(reglas, /match \/contadores\/\{id\} \{ allow read, write: if haySesion\(\); \}/, 'cualquier contador, cualquier sesión');
  assert.match(reglas, /match \/pagosComision\/\{id\} \{ allow read, write: if esDinero\(\); \}/, 'el pago no mira campos: lleva los que quiera');
  assert.ok(!/comprobantesComision/.test(reglas), 'no hay una regla para este contador: no hace falta');
});

// ---------------------------------------------------------------------------
// Lo que un pago NUEVO guarda, y lo que un pago de ANTES no recibe jamás
// ---------------------------------------------------------------------------

const conDinero = (nube, extra = {}) => ({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, avisar: () => {}, ...extra });
const CONTRATOS = [firme('c1', { numero: 1 }), firme('c2', { numero: 2 }), renta({ id: 'c3', numero: 3 })];

function nuevoPago(extra = {}) {
  return {
    ...construirPagoComision({
      empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos: CONTRATOS, pagos: [], idsMarcados: ['c1', 'c2'],
    }),
    numero: 7,
    ...extra,
  };
}

async function guardar(nube, pago, extra = {}) {
  const id = pago.id ?? await nuevoIdPagoComision(conDinero(nube));
  return guardarPagoComision({ ...pago, id }, conDinero(nube, extra));
}

test('un pago nuevo se guarda con su número y su detalle, y lo guardado SE LEE DE VUELTA como un pago listo', async () => {
  const nube = nubeEnMemoria();
  const guardado = await guardar(nube, nuevoPago());
  const { datos } = await cargarPagosComision(conDinero(nube));
  assert.deepEqual(datos, [guardado]);
  assert.equal(guardado.numero, 7);
  assert.deepEqual(guardado.detalle.map((f) => f.contratoId), ['c1', 'c2']);
  assert.deepEqual(estadoDelComprobante(datos[0]), { tipo: 'listo' }, 'tras ir a Firestore y volver sigue explicándose solo');
});

test('un pago NUEVO sin número, sin detalle o con un detalle que no lo explica NO se guarda: ni una escritura', async () => {
  const completo = nuevoPago();
  const sinNumero = { ...completo }; delete sinNumero.numero;
  const sinDetalle = { ...completo }; delete sinDetalle.detalle;
  const casos = {
    'sin número': sinNumero,
    'sin detalle': sinDetalle,
    'con el número en null': { ...completo, numero: null },
    'con el detalle vacío': { ...completo, detalle: [] },
    'con un detalle de otras rentas': { ...completo, detalle: completo.detalle.map((f) => ({ ...f, contratoId: `${f.contratoId}-otra` })) },
    'con un detalle que no suma': { ...completo, detalle: completo.detalle.map((f) => ({ ...f, monto: f.monto + 1 })) },
  };
  for (const [nombre, pago] of Object.entries(casos)) {
    const nube = nubeEnMemoria();
    await assert.rejects(guardar(nube, pago), { message: MENSAJE_COMISION_SIN_COMPROBANTE }, nombre);
    assert.equal(nube.escrituras().length, 0, `${nombre}: no se escribió nada`);
  }
});

test('anular un pago de ANTES no le pone número ni detalle: se reescribe tal cual, solo con anulado, anuladoEn y el sello', async () => {
  const viejo = pagoDeComision({ id: 'p0', monto: 280, contratos: ['c1', 'c2'], fecha: '2026-10-10' });
  const nube = nubeEnMemoria({ pagosComision: [viejo], contadores: { comprobantesComision: { ultimo: 3 } } });
  const anulado = anularPagoComision(viejo, { fecha: '2026-10-21' });
  await guardarPagoComision(anulado, conDinero(nube, { reescritura: true }));
  const enLaNube = nube.leer('pagosComision/p0');
  assert.equal(enLaNube.anulado, true);
  assert.equal(enLaNube.anuladoEn, '2026-10-21');
  assert.ok(!('numero' in enLaNube), 'no se le puso número');
  assert.ok(!('detalle' in enLaNube), 'ni detalle');
  assert.deepEqual(estadoDelComprobante(enLaNube), { tipo: 'de-antes' }, 'sigue siendo un pago de antes');
  assert.equal(nube.leer('contadores/comprobantesComision').ultimo, 3, 'y no gastó un número');
  assert.equal(enLaNube.monto, 280);
  assert.deepEqual(enLaNube.contratos, ['c1', 'c2']);
});

test('...y sin decir que es una reescritura, ese mismo pago de antes no pasa: lo que lo deja pasar es `reescritura`, no la falta de campos', async () => {
  const viejo = pagoDeComision({ id: 'p0', monto: 280, contratos: ['c1', 'c2'] });
  const nube = nubeEnMemoria({ pagosComision: [viejo] });
  await assert.rejects(guardarPagoComision(viejo, conDinero(nube)), { message: MENSAJE_COMISION_SIN_COMPROBANTE });
});

test('anular un pago NUEVO conserva su número y su detalle, igual que su monto y sus rentas', async () => {
  const nube = nubeEnMemoria();
  const guardado = await guardar(nube, nuevoPago());
  const anulado = anularPagoComision(guardado, { fecha: '2026-10-21' });
  await guardarPagoComision(anulado, conDinero(nube, { reescritura: true }));
  const enLaNube = nube.leer(`pagosComision/${guardado.id}`);
  assert.equal(enLaNube.numero, 7, 'el empleado tiene el papel con ese número: no se reutiliza ni se pierde');
  assert.deepEqual(enLaNube.detalle, guardado.detalle);
  assert.equal(enLaNube.monto, guardado.monto);
  assert.equal(enLaNube.anulado, true);
});

test('pagoComisionParaGuardar: el número y el detalle viajan SI llegan; sin ellos no hay llave (nunca `undefined`, que Firestore rechaza)', () => {
  const nuevo = pagoComisionParaGuardar(nuevoPago({ id: 'p1' }), { ahora: 5 });
  assert.equal(nuevo.numero, 7);
  assert.deepEqual(nuevo.detalle, nuevoPago().detalle);
  assert.notStrictEqual(nuevo.detalle, nuevoPago().detalle, 'una copia, no el mismo arreglo');
  const viejo = pagoComisionParaGuardar(pagoDeComision({ id: 'p0', monto: 1, contratos: ['c'] }), { ahora: 5 });
  assert.ok(!('numero' in viejo) && !('detalle' in viejo));
  const conNulos = pagoComisionParaGuardar({ id: 'p2', monto: 1, contratos: ['c'], numero: null, detalle: null }, { ahora: 5 });
  assert.ok(!('numero' in conNulos) && !('detalle' in conNulos), 'null tampoco se escribe');
  const dañado = pagoComisionParaGuardar({ id: 'p3', monto: 1, contratos: ['c'], numero: 4, detalle: 'texto' }, { ahora: 5 });
  assert.equal(dañado.numero, 4);
  assert.ok(!('detalle' in dañado), 'un detalle que no es lista no se inventa ni se copia');
});

// ---------------------------------------------------------------------------
// Registrar: el número se toma UNA vez por intención, y lo que se guarda es lo que él vio
// ---------------------------------------------------------------------------

const HOY = '2026-10-20';
const lecturaOk = ({ contratos, pagos = [] }) => ({
  contratos: { datos: contratos, fallo: false }, pagos: { datos: pagos, fallo: false }, empleados: { datos: [EMPLEADOS.ana], fallo: false },
});
const anaDe = (contratos) => armarVistaDeComisiones(lecturaOk({ contratos })).entradas.find((e) => e.nombre === 'Ana López');

function nubeDeMentira({ contratos, pagos = [], fallaGuardar = false, fallaNumero = false }) {
  const e = { contratos, pagos: [...pagos], guardados: [], ids: 0, numeros: 0, siguiente: 20 };
  return {
    e,
    leerPagos: async () => ({ datos: [...e.pagos], fallo: false }),
    leerContratos: async () => ({ datos: e.contratos, fallo: false }),
    nuevoId: async () => { e.ids += 1; return `p-nuevo-${e.ids}`; },
    nuevoNumero: async () => { if (fallaNumero) throw new Error('sin internet'); e.numeros += 1; e.siguiente += 1; return e.siguiente; },
    guardar: async (pago, opciones) => {
      if (fallaGuardar) throw new Error('sin internet');
      e.guardados.push([pago, opciones]);
      e.pagos.push(pago);
      return pago;
    },
  };
}

const registrar = (d, cambios = {}) => registrarElPagoDeComision({
  entrada: anaDe(['c1', 'c2'].map((id, i) => firme(id, { numero: i + 1 }))), idsMarcados: ['c1', 'c2'], forma: 'efectivo', fecha: HOY, ...d, ...cambios,
});
const rentasVistas = () => ['c1', 'c2'].map((id, i) => firme(id, { numero: i + 1 }));

test('registrar guarda el pago con su número y el detalle de lo que él vio, y no pide `reescritura`: es un pago nuevo', async () => {
  const d = nubeDeMentira({ contratos: rentasVistas() });
  const r = await registrar(d);
  assert.equal(r.tipo, 'guardado');
  const [[pago, opciones]] = d.e.guardados;
  assert.equal(pago.numero, 21);
  assert.deepEqual(pago.detalle, rentasVistas().map(filaDeDetalle));
  assert.equal(opciones, undefined, 'sin opciones: el guardado estricto, el que exige número y detalle');
  assert.deepEqual(estadoDelComprobante(pago), { tipo: 'listo' });
});

test('el número se toma DESPUÉS de comprobar que nada cambió: un «cambio» no gasta ninguno', async () => {
  const corregida = renta({ id: 'c1', numero: 1, recibidoEl: '2026-10-06' });
  const d = nubeDeMentira({ contratos: [corregida, firme('c2', { numero: 2 })] });
  assert.equal((await registrar(d)).tipo, 'cambio');
  assert.equal(d.e.numeros, 0);
  assert.equal(d.e.ids, 0);
  assert.equal(d.e.guardados.length, 0);
});

test('un intento que se repite (internet lento, doble clic) usa el MISMO id y el MISMO número: no deja un hueco por cada intento', async () => {
  const d = nubeDeMentira({ contratos: rentasVistas(), fallaGuardar: true });
  const enCurso = {};
  await assert.rejects(registrar(d, { enCurso }), /sin internet/);
  assert.deepEqual(enCurso, { id: 'p-nuevo-1', numero: 21 }, 'los dos quedaron decididos aunque el guardado falló');
  d.guardar = async (pago, opciones) => { d.e.guardados.push([pago, opciones]); d.e.pagos.push(pago); return pago; };
  const r = await registrar(d, { enCurso });
  assert.equal(r.tipo, 'guardado');
  assert.equal(d.e.numeros, 1, 'solo se tomó un número');
  assert.equal(d.e.ids, 1);
  assert.equal(d.e.guardados[0][0].numero, 21);
});

test('si el primer intento SÍ había llegado, el reintento no toma otro número ni escribe nada', async () => {
  const d = nubeDeMentira({ contratos: rentasVistas() });
  const enCurso = {};
  await registrar(d, { enCurso });
  const r = await registrar(d, { enCurso });
  assert.equal(r.tipo, 'ya-guardado');
  assert.equal(d.e.numeros, 1);
  assert.equal(d.e.guardados.length, 1);
});

test('si el número no se puede tomar, no se guarda NADA (un pago sin número no se registra) y el reintento lo vuelve a pedir', async () => {
  const d = nubeDeMentira({ contratos: rentasVistas(), fallaNumero: true });
  const enCurso = {};
  await assert.rejects(registrar(d, { enCurso }), /sin internet/);
  assert.equal(d.e.guardados.length, 0);
  assert.equal(enCurso.id, 'p-nuevo-1');
  assert.equal(enCurso.numero, undefined, 'no quedó un número a medias');
  d.nuevoNumero = async () => 99;
  const r = await registrar(d, { enCurso });
  assert.equal(r.pago.numero, 99);
  assert.equal(r.pago.id, 'p-nuevo-1');
});

test('dos rentas que cambian en sentidos opuestos y siguen sumando lo mismo SÍ son un «cambio»: el papel dice renta por renta', async () => {
  // La primera regresó un día después (Q175 en vez de Q140) y a la segunda se le descontó (Q105 en vez de Q140): suman Q280, igual que antes.
  const a1 = renta({ id: 'c1', numero: 1, recibidoEl: '2026-10-06' });
  const a2 = renta({ id: 'c2', numero: 2, recibidoEl: '2026-10-05', descuento: 700 });
  assert.equal(comisionDe(a1).monto + comisionDe(a2).monto, 280, 'el escenario: el total no se mueve');
  const d = nubeDeMentira({ contratos: [a1, a2] });
  assert.equal((await registrar(d)).tipo, 'cambio');
  assert.equal(d.e.guardados.length, 0);
});

test('detallesIguales: mismas rentas y mismos diez datos, en cualquier orden; cualquier diferencia, o algo que no es lista, no', () => {
  const [a, b] = rentasVistas().map(filaDeDetalle);
  assert.equal(detallesIguales([a, b], [b, a]), true);
  assert.equal(detallesIguales([a, b], [a, { ...b, clienteNombre: 'Otro' }]), false);
  for (const campo of CAMPOS_DEL_DETALLE) {
    const otro = { ...b, [campo]: typeof b[campo] === 'number' ? b[campo] + 1 : `${b[campo]}x` };
    assert.equal(detallesIguales([a, b], [a, otro]), false, campo);
  }
  assert.equal(detallesIguales([a], [a, b]), false);
  assert.equal(detallesIguales(undefined, [a]), false);
  assert.equal(detallesIguales([a], 'x'), false);
  assert.equal(detallesIguales([], []), true);
});

test('anular (la pantalla): un pago de antes se reescribe con `reescritura` y sin número; uno nuevo conserva el suyo', async () => {
  const nuevo = { ...nuevoPago(), id: 'pn' };
  const viejo = pagoDeComision({ id: 'p0', monto: 280, contratos: ['c1', 'c2'] });
  for (const [pago, esperado] of [[viejo, undefined], [nuevo, 7]]) {
    const guardados = [];
    const r = await anularElPagoDeComision({
      pago, hoy: '2026-10-21',
      leerPagos: async () => ({ datos: [structuredClone(pago)], fallo: false }),
      guardar: async (p, opciones) => { guardados.push([p, opciones]); return p; },
    });
    assert.equal(r.tipo, 'anulado');
    const [[escrito, opciones]] = guardados;
    assert.deepEqual(opciones, { reescritura: true });
    assert.equal(escrito.numero, esperado);
    assert.equal('numero' in escrito, esperado !== undefined);
    assert.equal('detalle' in escrito, esperado !== undefined);
  }
});
