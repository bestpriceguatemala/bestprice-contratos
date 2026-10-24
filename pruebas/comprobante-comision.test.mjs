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
import { suma, recargoTarjeta, conTarjeta } from '../js/nucleo/dinero.js';
import { resumen } from '../js/nucleo/contrato.js';
import { atrasoDe } from '../js/nucleo/contrato.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { datosDelContratoPara } from '../js/nucleo/empleado.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import { dinero, fecha } from '../js/ui.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import {
  armarComprobanteDeComision, htmlComprobanteDeComision, pintarComprobanteDeComision, motivoSinComprobante,
} from '../js/pantallas/comprobanteComision.js';
import { MEMBRETE } from '../js/pantallas/comprobante.js';
import {
  agregarPago, contratoParaGuardar, conCostoDelDueno, costoDelDocumento,
  siguienteNumeroComprobante, siguienteNumeroComprobanteComision, construirPagoComision, pagoComisionParaGuardar, guardarPagoComision,
  cargarPagosComision, nuevoIdPagoComision, anularPagoComision, MENSAJE_COMISION_SIN_COMPROBANTE,
} from '../js/datos.js';
import { registrarElPagoDeComision, anularElPagoDeComision, armarVistaDeComisiones } from '../js/pantallas/comisiones.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { renta, rentaDeAntes, pagoDeComision, EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { luis } = EMPLEADOS;

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
/** El código sin comentarios, para buscar en lo que de verdad se ejecuta y no en lo que se explica. */
const sinComentarios = (codigo) => codigo.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');

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

// ---------------------------------------------------------------------------
// EL PAPEL (js/pantallas/comprobanteComision.js)
// ---------------------------------------------------------------------------

/**
 * Una renta CON TODO LO QUE EL EMPLEADO NO DEBE VER: carro ajeno (costo de Q310 por día y un dueño con nombre), precio de Q850,
 * pagada con tarjeta (6.5 % de recargo), una garantía de Q4,321 en otra tarjeta, daños, descuento al cliente, un día de atraso y
 * una observación del mostrador. La comisión sale del 7.5 % de Luis.
 */
function conMargen({ id, numero, cliente, placas, fechaSalida, precioDia = 850 }) {
  const sinCierre = construirContrato({
    id,
    numero,
    cliente,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas, tipo: 'Pickup', marca: 'Toyota', color: 'Blanco', modelo: '2021', dueno: 'Mario López Estrada', costoDia: 310,
    },
    duenoId: 'd1',
    fechaSalida,
    dias: 4,
    precioDia,
    tarjetas: [{
      ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 4321,
    }],
    forma: 'tarjeta',
    porcentajeTarjeta: 6.5,
    montoPago: 3400,
    observaciones: 'OBSERVACION-DEL-MOSTRADOR',
    ...datosDelContratoPara(luis),
  });
  const devuelto = construirCierre(sinCierre, {
    fechaReal: sumarDias(sinCierre.devolucionPrevista, 1),
    horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 275, varios: 0, descuento: 125,
  });
  const saldado = agregarPago(devuelto, {
    monto: resumen(devuelto).saldo, forma: 'tarjeta', porcentajeTarjeta: 6.5, fecha: devuelto.cierre.fechaReal,
  });
  const completo = { ...saldado, garantiaLiberada: true, garantiaLiberadaEn: devuelto.cierre.fechaReal };
  // Con el costo del dueño del carro DE VUELTA en memoria (ADR-002: así llega al área de dinero, que lo lee de `privado`): el peor caso,
  // porque si el papel dejara pasar un campo del contrato, este es el que más duele.
  return conCostoDelDueno(contratoParaGuardar(completo, { id, numero, ahora: 1790000000000 }), costoDelDocumento(completo));
}

const RICAS = [
  conMargen({ id: 'm1', numero: 31, cliente: { id: 'k3', nombres: 'Carlos', apellidos: 'Méndez' }, placas: 'P-333CCC', fechaSalida: '2026-09-10' }),
  conMargen({ id: 'm2', numero: 32, cliente: { id: 'k4', nombres: 'Lucía', apellidos: 'Barrios' }, placas: 'P-555EEE', fechaSalida: '2026-09-20', precioDia: 900 }),
];

/** El pago N° 12 que paga las dos rentas ricas y una sencilla, sellado como lo sella el registro. */
function pagoDelPapel(extra = {}) {
  const contratos = [...RICAS, firme('s1', { numero: 33 })];
  return {
    ...construirPagoComision({
      empleadoId: 'e16', fecha: '2026-10-12', forma: 'transferencia', contratos, pagos: [], idsMarcados: ['m1', 'm2', 's1'],
    }),
    id: 'pp1', numero: 12, ...extra,
  };
}
const LUIS_EN_PAPEL = { nombre: 'Luis Mérida', codigo: '16' };
const papel = (extra = {}) => ({ pago: pagoDelPapel(), empleado: LUIS_EN_PAPEL, ...extra });

test('el escenario del papel es el que dice ser: tres rentas, dos con todo lo que el empleado no debe ver, y su comisión', () => {
  const pago = pagoDelPapel();
  assert.deepEqual(pago.contratos.sort(), ['m1', 'm2', 's1']);
  assert.deepEqual(estadoDelComprobante(pago), { tipo: 'listo' });
  for (const c of RICAS) {
    assert.ok(c.ajeno && c.garantiaMonto === 4321 && c.pagos.length === 2, 'ajena, con garantía y dos pagos con tarjeta');
    assert.ok(c.cierre.danos === 275 && c.cierre.descuento === 125 && atrasoDe(c) === 1);
    assert.equal(c.porcentajeComision, 7.5);
  }
  assert.equal(comisionDe(RICAS[0]).base, (4 + 1) * 850 - 125);
  assert.equal(pago.monto, suma(...RICAS.map((c) => comisionDe(c).monto), 140));
});

test('el modelo: una fila por renta del pago, en el orden en que regresaron, con el total y la forma que el pago guardó', () => {
  const m = armarComprobanteDeComision(papel());
  assert.equal(m.numero, 12);
  assert.equal(m.fecha, '2026-10-12');
  assert.deepEqual(m.empleado, LUIS_EN_PAPEL);
  assert.deepEqual(m.pagado.filas.map((f) => f.contrato).sort((a, b) => a - b), [31, 32, 33], 'las tres rentas del pago, ni una más');
  const regresos = m.pagado.filas.map((f) => f.regreso);
  assert.deepEqual([...regresos].sort(), regresos, 'cronológico');
  assert.equal(m.pagado.total, pagoDelPapel().monto, 'el total es el monto GUARDADO, no una suma hecha aquí');
  assert.equal(m.pagado.forma, 'transferencia');
  const fila = m.pagado.filas.find((f) => f.contrato === 31);
  assert.deepEqual(fila, {
    regreso: RICAS[0].cierre.fechaReal, contrato: 31, placas: 'P-333CCC', cliente: 'Carlos Méndez', dias: 4, diasAtraso: 1,
    base: comisionDe(RICAS[0]).base, porcentaje: 7.5, monto: comisionDe(RICAS[0]).monto,
  });
});

test('las filas salen en el mismo orden aunque el pago las haya guardado en otro: por cuándo regresaron y, a igual día, por contrato', () => {
  const pago = pagoDelPapel();
  const fila = (extra) => ({ ...pago.detalle[0], ...extra });
  pago.detalle = [
    fila({ contratoId: 'z', numero: 9, fechaReal: '2026-10-09', monto: 10 }),
    fila({ contratoId: 'y', numero: 8, fechaReal: '2026-10-09', monto: 10 }),
    fila({ contratoId: 'x', numero: 7, fechaReal: '2026-10-05', monto: 10 }),
  ];
  pago.contratos = ['z', 'y', 'x'];
  pago.monto = 30;
  const filas = armarComprobanteDeComision({ pago, empleado: LUIS_EN_PAPEL }).pagado.filas;
  assert.deepEqual(filas.map((f) => f.contrato), [7, 8, 9]);
});

test('el papel dice lo que el diseño manda, en este orden: membrete, empleado, número y fecha, las rentas con su total y su forma, firma', () => {
  const html = htmlComprobanteDeComision(armarComprobanteDeComision(papel()));
  const marcas = [
    MEMBRETE.nombre, 'Comprobante de pago de comisiones', 'Empleado', 'Luis Mérida', 'N° 12', '12 oct 2026',
    'Comisiones pagadas', '<th>Regresó</th>', '<th>Contrato</th>', '<th>Placas</th>', '<th>Cliente</th>', 'Días', 'Base', 'Comisión',
    'Total pagado', 'Forma de pago: <strong>Transferencia</strong>', 'Firma del empleado',
  ];
  let desde = 0;
  for (const marca of marcas) {
    const en = html.indexOf(marca, desde);
    assert.ok(en >= desde, `«${marca}» tiene que estar, después de lo anterior`);
    desde = en;
  }
  assert.equal((html.match(/<tr>/g) || []).length, 1 + 3 + 1, 'encabezado, tres rentas y el total');
});

test('cada fila dice cuándo regresó, el contrato, las placas, el cliente, los días con su atraso, la base, el porcentaje y la comisión', () => {
  const html = htmlComprobanteDeComision(armarComprobanteDeComision(papel()));
  const k = comisionDe(RICAS[0]);
  const fila = html.match(/<tr>\s*<td>[^<]*<\/td>\s*<td>31<\/td>[^]*?<\/tr>/)[0];
  for (const esperado of [fecha(RICAS[0].cierre.fechaReal), '31', 'P-333CCC', 'Carlos Méndez', '4 + 1 de atraso', dinero(k.base), '7.5 %', dinero(k.monto)]) {
    assert.ok(fila.includes(esperado), `la fila de la renta 31 dice «${esperado}»: ${fila}`);
  }
  const sencilla = html.match(/<tr>\s*<td>[^<]*<\/td>\s*<td>33<\/td>[^]*?<\/tr>/)[0];
  assert.ok(sencilla.includes('<td class="num">4</td>') && !sencilla.includes('atraso'), 'sin atraso, solo los días');
});

test('UNA REIMPRESIÓN DICE LO QUE DIJO EL ORIGINAL: el papel no se arma con las rentas, así que no hay con qué cambiarlo', () => {
  const original = htmlComprobanteDeComision(armarComprobanteDeComision(papel()));
  // Aunque quien llame le pase las rentas corregidas, los pagos de hoy o la fecha de hoy, el papel sale igual: no las lee.
  const corregidas = RICAS.map((c) => ({ ...c, dias: 9, precioDia: 1, cierre: { ...c.cierre, descuento: 9999, fechaReal: '2027-01-01' } }));
  const reimpreso = htmlComprobanteDeComision(armarComprobanteDeComision({ ...papel(), contratos: corregidas, pagos: [], hoy: '2027-05-05', costoSinLeer: ['m1'] }));
  assert.equal(reimpreso, original);
  // Y es lo guardado lo que manda: cambiar el pago guardado sí cambia el papel (no se está ignorando todo).
  const otro = pagoDelPapel({ forma: 'cheque' });
  assert.notEqual(htmlComprobanteDeComision(armarComprobanteDeComision({ pago: otro, empleado: LUIS_EN_PAPEL })), original);
});

test('el papel no recibe ni contratos ni pagos: el módulo no importa nada que sepa calcular una comisión ni agrupar una cuenta', () => {
  const codigo = sinComentarios(leer('../js/pantallas/comprobanteComision.js'));
  assert.ok(!/comisionDe|cuentaDeEmpleado|agruparPorEmpleado|elegirParaPagoDeComision|filaDeDetalle|baseComision|estadoDeComision/.test(codigo), 'no calcula ni elige');
  assert.ok(!/\bcontratos\b/.test(codigo.replace(/aria-label|pago\.contratos/g, '')), 'nunca nombra «contratos»: no recibe rentas');
  assert.ok(!/new Date|hoyISO|Date\.now/.test(codigo), 'no lee el reloj: el papel no depende de qué día se imprime');
  assert.ok(!/[^\w.]suma\(|\.reduce\(|\*\s*\d|\/\s*100/.test(codigo), 'no suma ni multiplica dinero por su cuenta');
});

test('el modelo solo tiene las llaves permitidas: una llave nueva (cliente pagó, utilidad, costo…) hace fallar esto', () => {
  const llaves = (valor, ruta = '') => {
    if (Array.isArray(valor)) return valor.flatMap((v) => llaves(v, `${ruta}[]`));
    if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => [`${ruta}.${k}`, ...llaves(v, `${ruta}.${k}`)]);
    return [];
  };
  const permitidas = [
    '.numero', '.fecha', '.empleado', '.empleado.nombre', '.empleado.codigo',
    '.pagado', '.pagado.filas', '.pagado.total', '.pagado.forma',
    ...['regreso', 'contrato', 'placas', 'cliente', 'dias', 'diasAtraso', 'base', 'porcentaje', 'monto'].map((k) => `.pagado.filas[].${k}`),
  ].sort();
  assert.deepEqual([...new Set(llaves(armarComprobanteDeComision(papel())))].sort(), permitidas);
});

// ----- LO QUE EL EMPLEADO NO VE -----

const formasDe = (n) => {
  const formas = new Set([dinero(n), n.toFixed(2), n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
  if (n >= 100) { formas.add(String(n)); formas.add(n.toLocaleString('es-GT', { maximumFractionDigits: 2 })); }
  return [...formas];
};
/**
 * Lo que aparece de la lista en `texto` como un número ENTERO (no pegado a otras cifras): el 125 del descuento no es una fuga
 * por estar dentro del 4,125.00 de una base legítima. Los textos (nombres, 3343) se buscan tal cual.
 */
const encontrados = (texto, lista) => lista.filter((x) => (/^[\dQ.,-]+$/.test(x)
  ? new RegExp(`(?<![\\d.,])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`).test(texto)
  : texto.includes(x)));

/** Todo lo que un contrato sabe del negocio y que el empleado no ve en su papel: de lo que el cliente pagó, de lo que se cobró y de lo que cuesta el carro. */
function numerosProhibidosDe(c) {
  const r = resumen(c);
  const pagos = (c.pagos || []).filter((p) => !p.anulado);
  return [
    c.garantiaMonto, c.carroAjeno?.costoDia, c.subarriendo?.costoDia, c.cierre?.danos, c.cierre?.descuento,
    r.subtotal, r.totalSalida, r.totalDevolucion, r.pagado, r.totalCobrado, r.utilidad, r.saldo, r.costoSubarriendo,
    ...pagos.flatMap((p) => [p.monto, recargoTarjeta(p.monto, p.porcentajeTarjeta), conTarjeta(p.monto, p.porcentajeTarjeta)]),
  ].filter((n) => Number.isFinite(n) && n !== 0);
}
const TEXTOS_PROHIBIDOS = ['Mario López', 'Toyota', 'OBSERVACION-DEL-MOSTRADOR', '3343', 'BAC', '6.5', 'A1'];
const PALABRAS_PROHIBIDAS = [
  /utilidad/i, /ganancia/i, /margen/i, /recargo/i, /tarjeta/i, /garant[ií]a/i, /precio/i, /descuento/i, /cobrado/i, /saldo/i,
  /costo/i, /due[ñn]o/i, /pendiente/i, /estimad/i, /abono/i, /\bNIT\b/,
];

function salidasDelPapel(extra = {}) {
  const modelo = armarComprobanteDeComision(papel(extra));
  const contenedor = { innerHTML: '', querySelector: () => null };
  pintarComprobanteDeComision(contenedor, papel(extra));
  return {
    modelo, html: htmlComprobanteDeComision(modelo), pantalla: contenedor.innerHTML, json: JSON.stringify(modelo),
  };
}

test('la prueba de lo prohibido no está vacía, y ninguna cifra prohibida choca con una permitida', () => {
  const { modelo } = salidasDelPapel();
  const permitidas = new Set(modelo.pagado.filas.flatMap((f) => [f.base, f.monto, f.dias, f.diasAtraso, f.porcentaje, f.contrato]).concat([modelo.pagado.total, modelo.numero]));
  for (const c of RICAS) {
    const prohibidas = numerosProhibidosDe(c);
    assert.ok(prohibidas.length >= 8, `hay muchas cifras que buscar (${prohibidas.length})`);
    assert.deepEqual(prohibidas.filter((n) => permitidas.has(n)), [], `lo prohibido de ${c.id} no choca con lo permitido`);
  }
});

test('el detector funciona: ve cada cifra prohibida en un papel que la filtra de verdad, y no confunde el 125 con el 4,125.00', () => {
  const prohibidas = [...new Set(RICAS.flatMap(numerosProhibidosDe))];
  const papelQueFiltra = [...prohibidas.map((n) => `${dinero(n)} / ${n}`), ...TEXTOS_PROHIBIDOS].join('\n');
  for (const n of prohibidas) assert.ok(encontrados(papelQueFiltra, formasDe(n)).length > 0, `el detector no vio ${n}`);
  assert.deepEqual(encontrados(papelQueFiltra, TEXTOS_PROHIBIDOS), TEXTOS_PROHIBIDOS);
  assert.deepEqual(encontrados('base Q4,125.00 y 1125', formasDe(125)), [], 'una cifra dentro de otra no es la misma cifra');
  assert.ok(encontrados('descuento de Q125.00.', formasDe(125)).length > 0);
});

test('NINGUNA cifra del negocio sale en el papel: ni lo que el cliente pagó, ni su garantía, ni el recargo, ni el costo del carro, ni la utilidad', () => {
  const { html, pantalla, json } = salidasDelPapel();
  assert.ok(html.includes('P-333CCC') && html.includes('P-555EEE'), 'las rentas ricas SÍ están en el papel');
  const permitidas = new Set(armarComprobanteDeComision(papel()).pagado.filas.flatMap((f) => [f.base, f.monto]));
  const buscar = [...new Set(RICAS.flatMap(numerosProhibidosDe))].filter((n) => !permitidas.has(n));
  // Las que más duelen están de verdad en la búsqueda: garantía, costo del carro ajeno, daños, descuento, lo pagado con recargo.
  for (const n of [4321, 310, 1550, 275, 125]) assert.ok(buscar.includes(n), `${n} tiene que estar entre lo que se busca`);
  for (const [donde, texto] of [['el HTML', html], ['la pantalla', pantalla], ['el modelo', json]]) {
    for (const n of buscar) {
      assert.deepEqual(encontrados(texto, formasDe(n)), [], `${donde} lleva ${dinero(n)}, una cifra del negocio que el empleado no puede ver`);
    }
    assert.deepEqual(encontrados(texto, TEXTOS_PROHIBIDOS), [], `${donde} lleva un dato del mostrador, de la tarjeta o del dueño del carro`);
  }
});

test('ni una palabra del negocio: utilidad, tarjeta, garantía, precio, costo, dueño, saldo, pendiente, descuento…', () => {
  const { html, pantalla } = salidasDelPapel();
  // Los nombres de las clases del CSS (`comp-dueno`, que el papel de los dueños y este comparten) no se imprimen: se miran las palabras.
  const palabras = (texto) => texto.replace(/ class="[^"]*"/g, '');
  for (const palabra of PALABRAS_PROHIBIDAS) {
    assert.ok(!palabra.test(palabras(html)), `el HTML dice ${palabra}`);
    assert.ok(!palabra.test(palabras(pantalla)), `la pantalla dice ${palabra}`);
  }
});

test('ningún id de contrato llega al papel, ni un contrato entero escondido en un atributo', () => {
  const { html, pantalla } = salidasDelPapel();
  for (const id of ['m1', 'm2', 's1', 'pp1']) {
    assert.ok(!html.includes(`"${id}"`) && !pantalla.includes(`"${id}"`), id);
  }
  assert.ok(!/data-contrato|data-id|data-json/i.test(html));
});

test('un pago con campos de más no los arrastra al papel: solo se toma lo permitido de cada fila', () => {
  const pago = pagoDelPapel({ utilidad: 646464.64, comisionTotal: 535353.53 });
  pago.detalle = pago.detalle.map((f) => ({ ...f, clientePago: 747474.74, costoDia: 313131.31, duenoCarro: 'DUENO-SECRETO' }));
  const { html, json } = salidasDelPapel({ pago });
  for (const x of ['646464', '535353', '747474', '313131', 'DUENO-SECRETO']) {
    assert.ok(!html.includes(x) && !json.includes(x), x);
  }
});

test('el membrete es el de Best Price tal como lo confirmó el dueño: sin NIT, sin imágenes, con los tres WhatsApp', () => {
  const html = htmlComprobanteDeComision(armarComprobanteDeComision(papel()));
  assert.ok(!/\bNIT\b/i.test(html), 'él dijo que no lo quiere en estos papeles');
  assert.ok(!/<img|url\(|<svg/i.test(html));
  for (const linea of MEMBRETE.contacto) assert.ok(html.includes(linea.replace(/&/g, '&amp;')), linea);
  assert.ok(html.includes(MEMBRETE.nombre) && html.includes(MEMBRETE.lema));
});

test('el texto escrito a mano se escapa: ni el nombre, ni el cliente, ni las placas pueden meter HTML al papel', () => {
  const pago = pagoDelPapel();
  pago.detalle = pago.detalle.map((f) => ({ ...f, clienteNombre: 'Ñandú & Hijos <S.A.> "El Rápido"', carroPlacas: '<b>P-1</b>' }));
  const html = htmlComprobanteDeComision(armarComprobanteDeComision({ pago, empleado: { nombre: 'Ana <script>x()</script>', codigo: '<i>6</i>' } }));
  assert.ok(!html.includes('<script>') && !html.includes('<b>P-1') && !html.includes('<i>6'));
  assert.ok(html.includes('Ñandú &amp; Hijos &lt;S.A.&gt; &quot;El Rápido&quot;'));
  assert.ok(html.includes('Ana &lt;script&gt;'));
});

test('lo que falta se ve como raya, no como «undefined»: sin código, sin contrato, sin placas', () => {
  const pago = pagoDelPapel();
  pago.detalle = pago.detalle.map((f) => ({ ...f, numero: null, carroPlacas: '', clienteNombre: '' }));
  const html = htmlComprobanteDeComision(armarComprobanteDeComision({ pago, empleado: { nombre: 'Luis Mérida' } }));
  assert.ok(!/undefined|null|NaN/.test(html));
  assert.ok(html.includes('<dt>Código</dt><dd>—</dd>'));
  assert.equal((html.match(/<td>—<\/td>/g) || []).length, 3 * 3, 'las tres filas, y en cada una: contrato, placas y cliente');
});

// ----- cuándo NO hay papel -----

test('un pago ANULADO no tiene papel: lanza, dice que está anulado y desde cuándo, y el número se conserva en la frase', () => {
  const anulado = anularPagoComision(pagoDelPapel(), { fecha: '2026-10-15' });
  assert.throws(() => armarComprobanteDeComision({ pago: anulado, empleado: LUIS_EN_PAPEL }), /El pago N° 12 está anulado desde el 15 oct 2026/);
  assert.match(motivoSinComprobante(anulado), /ya no cuenta como pagado/);
});

test('un pago DE ANTES de los comprobantes no tiene papel: lanza y explica por qué, sin recalcular nada ni ponerle número', () => {
  const viejo = pagoDeComision({ id: 'p0', monto: 280, contratos: ['m1', 'm2'], fecha: '2026-10-10' });
  const motivo = motivoSinComprobante(viejo);
  assert.match(motivo, /El pago del 10 oct 2026 de Q280\.00 se registró antes de que existieran los comprobantes/);
  assert.match(motivo, /no tiene número/);
  assert.match(motivo, /cifras de hoy/);
  assert.throws(() => armarComprobanteDeComision({ pago: viejo, empleado: LUIS_EN_PAPEL }), { message: motivo });
  // Por muchas rentas «de hoy» que se le pasen, no inventa un papel: no las mira.
  assert.throws(() => armarComprobanteDeComision({ pago: viejo, empleado: LUIS_EN_PAPEL, contratos: RICAS, pagos: [viejo] }), /antes de que existieran/);
});

test('un pago DAÑADO no tiene papel: dice cuál es el daño', () => {
  const pago = pagoDelPapel();
  const sinNumero = { ...pago }; delete sinNumero.numero;
  assert.match(motivoSinComprobante(sinNumero), /no se puede imprimir: trae el detalle pero no su número/);
  assert.match(motivoSinComprobante({ ...pago, monto: pago.monto + 1 }), /N° 12 no se puede imprimir: las filas de su detalle no suman lo que se pagó/);
  assert.throws(() => armarComprobanteDeComision({ pago: { ...pago, detalle: [] }, empleado: LUIS_EN_PAPEL }), /no se puede imprimir/);
});

test('sin fecha válida o sin un pago, no hay papel; y un pago bueno no tiene motivo para negarse', () => {
  assert.throws(() => armarComprobanteDeComision({ pago: pagoDelPapel({ fecha: '2026-02-30' }), empleado: LUIS_EN_PAPEL }), /fecha válida/);
  assert.throws(() => armarComprobanteDeComision({ pago: pagoDelPapel({ fecha: '' }), empleado: LUIS_EN_PAPEL }), /fecha válida/);
  assert.throws(() => armarComprobanteDeComision({ empleado: LUIS_EN_PAPEL }), /Falta el pago/);
  assert.throws(() => armarComprobanteDeComision(), /Falta el pago/);
  assert.equal(motivoSinComprobante(pagoDelPapel()), null);
});

// ----- la pantalla del papel -----

/** Un contenedor mínimo, sin DOM: lo que `pintarComprobanteDeComision` necesita para dibujar y enganchar botones. */
function contenedorFalso() {
  const enganches = {};
  return {
    innerHTML: '',
    enganches,
    querySelector(selector) {
      return { addEventListener(evento, fn) { enganches[`${selector}:${evento}`] = fn; } };
    },
  };
}

test('pintarComprobanteDeComision dibuja la hoja y engancha el botón de imprimir al diálogo del navegador', () => {
  const c = contenedorFalso();
  let impresiones = 0;
  const modelo = pintarComprobanteDeComision(c, papel(), { imprimir: () => { impresiones += 1; } });
  assert.equal(modelo.numero, 12);
  assert.ok(c.innerHTML.includes('Comisiones pagadas') && c.innerHTML.includes('Guardar como PDF'));
  c.enganches['[data-accion="imprimir"]:click']();
  assert.equal(impresiones, 1);
});

test('la barra de botones y las ayudas llevan la marca que la hoja de impresión esconde; la hoja misma no', () => {
  const c = contenedorFalso();
  pintarComprobanteDeComision(c, papel());
  const barra = c.innerHTML.match(/<div class="comp-barra[^"]*"[^>]*>/);
  assert.ok(barra && barra[0].includes('no-imprimir'));
  assert.match(c.innerHTML, /<p class="comp-ayuda no-imprimir">/);
  const hoja = c.innerHTML.match(/<article class="comprobante[^"]*"/);
  assert.ok(hoja && !hoja[0].includes('no-imprimir'));
});

test('si el papel no se puede armar, la pantalla dice por qué y NO dibuja una hoja', () => {
  for (const pago of [pagoDeComision({ id: 'p0', monto: 280, contratos: ['m1'] }), anularPagoComision(pagoDelPapel(), { fecha: '2026-10-15' })]) {
    const c = contenedorFalso();
    assert.equal(pintarComprobanteDeComision(c, papel({ pago })), null);
    assert.ok(c.innerHTML.includes('barra-lectura-fallida') && c.innerHTML.includes('No se pudo armar el comprobante.'));
    assert.ok(!c.innerHTML.includes('class="comprobante') && !c.innerHTML.includes('Comisiones pagadas'), 'ninguna hoja a medias');
  }
});

test('los avisos para quien manda el papel salen en pantalla, escapados, y NO en el papel', () => {
  const c = contenedorFalso();
  pintarComprobanteDeComision(c, papel({ avisos: ['Hoy esas rentas suman Q1.00 <b>y</b>.', '  ', null] }));
  const aviso = c.innerHTML.match(/<div class="barra-lectura-fallida[^"]*"[^>]*>[^]*?<\/div>/);
  assert.ok(aviso && aviso[0].includes('no-imprimir') && aviso[0].includes('&lt;b&gt;'));
  assert.equal((aviso[0].match(/<p>/g) || []).length, 1, 'las frases vacías no hacen un aviso');
  const limpio = contenedorFalso();
  pintarComprobanteDeComision(limpio, papel());
  assert.ok(!limpio.innerHTML.includes('barra-lectura-fallida'));
  // Y ni el aviso ni la ayuda están dentro de la hoja que se imprime.
  const hoja = c.innerHTML.slice(c.innerHTML.indexOf('<article'));
  assert.ok(!hoja.includes('Hoy esas rentas suman') && !hoja.includes('no-imprimir'));
});

test('el botón de volver solo existe si quien llama dijo a dónde volver', () => {
  const sin = contenedorFalso();
  pintarComprobanteDeComision(sin, papel());
  assert.ok(!sin.innerHTML.includes('data-accion="volver"'));
  const con = contenedorFalso();
  let volvio = 0;
  pintarComprobanteDeComision(con, papel(), { alVolver: () => { volvio += 1; } });
  con.enganches['[data-accion="volver"]:click']();
  assert.equal(volvio, 1);
  const fallo = contenedorFalso();
  pintarComprobanteDeComision(fallo, papel({ pago: undefined }), { alVolver: () => { volvio += 1; } });
  fallo.enganches['[data-accion="volver"]:click']();
  assert.equal(volvio, 2, 'también desde la pantalla de «no se pudo armar»');
});
