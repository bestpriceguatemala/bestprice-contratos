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
import { MEMBRETE, htmlDelMembrete } from '../js/pantallas/comprobante.js';
import { reglasDeCss } from './fixtures/reglasCss.mjs';
import { lineasDeContacto } from './fixtures/lineasDeContacto.mjs';
import {
  agregarPago, contratoParaGuardar, conCostoDelDueno, costoDelDocumento,
  siguienteNumeroComprobante, siguienteNumeroComprobanteComision, construirPagoComision, pagoComisionParaGuardar, guardarPagoComision,
  cargarPagosComision, nuevoIdPagoComision, anularPagoComision, MENSAJE_COMISION_SIN_COMPROBANTE,
} from '../js/datos.js';
import {
  registrarElPagoDeComision, anularElPagoDeComision, armarVistaDeComisiones, htmlFichaDeComisiones, leerElPagoParaElComprobante,
  entradaDelPapelDeComision, avisoDelPapelQueNoCambia, textoConfirmarAnularPagoDeComision, textoDePagoQueCambio,
  MENSAJE_COMPROBANTE_COMISION_SIN_COMPROBAR,
} from '../js/pantallas/comisiones.js';
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

test('un pago con número pero sin ninguna renta (ni cubierta ni en el detalle) y en cero no es un papel: no hay nada que decir', () => {
  const vacio = pagoSellado({ extra: { contratos: [], detalle: [], monto: 0 } });
  assert.equal(estadoDelComprobante(vacio).tipo, 'danado');
  assert.match(estadoDelComprobante(vacio).motivo, /detalle no es una lista de rentas/);
});

test('el id de una renta es texto: un detalle con ids que no lo son deja el pago dañado aunque coincida con `contratos`', () => {
  const pago = pagoSellado();
  const numerico = { ...pago, contratos: [1, 2], detalle: pago.detalle.map((f, i) => ({ ...f, contratoId: i + 1 })) };
  assert.equal(estadoDelComprobante(numerico).tipo, 'danado');
  assert.match(estadoDelComprobante(numerico).motivo, /no dice de qué renta es/);
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
  assert.equal((html.match(/<tr[ >]/g) || []).length, 1 + 3 + 1 + 2, 'encabezado, tres rentas, el total y las dos filas de la forma de pago y la firma');
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
  // Los números van envueltos en una etiqueta (no se parten al imprimir), pero el texto es EXACTAMENTE el que él aprobó.
  assert.deepEqual(lineasDeContacto(html), MEMBRETE.contacto);
  assert.ok(html.includes(htmlDelMembrete()), 'es el mismo membrete que el del papel de los dueños, no una copia');
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
  assert.match(motivo, /^Este pago se registró antes de que existieran los comprobantes/);
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

// ---------------------------------------------------------------------------
// LA FICHA: el número, el botón, y lo que se dice cuando no hay papel
// ---------------------------------------------------------------------------

const ANA_RENTAS = [firme('a1', { numero: 1 }), firme('a2', { numero: 2 }), firme('a3', { numero: 3 })];
const uiVacia = () => ({
  marcados: new Set(), pagando: false, forma: 'efectivo', fecha: '2026-10-20', mensajePago: '', mensajeEnlace: '', enlazarEmpleadoId: '', enlazarPorcentaje: false,
});
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** El pago N° 12 de Ana por a1 y a2, sellado como lo sella el registro. */
const pagoDeAna = (extra = {}) => ({
  ...construirPagoComision({
    empleadoId: 'e1', fecha: '2026-10-12', forma: 'transferencia', contratos: ANA_RENTAS, pagos: [], idsMarcados: ['a1', 'a2'],
  }),
  id: 'pa1', numero: 12, ...extra,
});
const PAGO_VIEJO = pagoDeComision({ id: 'pv', monto: 140, contratos: ['a3'], fecha: '2026-10-10', forma: 'efectivo' });

function fichaDeAna({ contratos = ANA_RENTAS, pagos }) {
  const lectura = lecturaOk({ contratos, pagos });
  const vista = armarVistaDeComisiones(lectura);
  const entrada = vista.entradas.find((e) => e.nombre === 'Ana López');
  return { html: htmlFichaDeComisiones({ entrada, vista, ui: uiVacia(), lectura, hoy: '2026-10-20' }), entrada, vista, lectura };
}
const yaPagado = (html) => html.slice(html.indexOf('<h2>Ya pagado</h2>'));

test('«Ya pagado»: un pago con comprobante se llama por su número, y trae «Ver comprobante» y «Anular»', () => {
  const { html } = fichaDeAna({ pagos: [pagoDeAna()] });
  const pagado = yaPagado(html);
  assert.match(texto(pagado), /Comprobante N\.° 12 · 12 oct 2026 · Transferencia/);
  assert.match(pagado, /data-cm="comprobante" data-id="pa1">Ver comprobante<\/button>/);
  assert.match(pagado, /data-cm="anular-pago" data-id="pa1"/);
  assert.ok(!pagado.includes('dn-sin-papel'), 'nada que explicar: sí tiene papel');
  assert.ok(!/Pago del 12 oct/.test(texto(pagado)));
});

test('un pago DE ANTES se sigue llamando «Pago del …», NO ofrece comprobante y dice por qué: no se parece a uno nuevo', () => {
  const { html } = fichaDeAna({ pagos: [PAGO_VIEJO, pagoDeAna()] });
  const tarjetas = yaPagado(html).split('<article').slice(1);
  const viejo = tarjetas.find((t) => t.includes('data-id="pv"'));
  const nuevo = tarjetas.find((t) => t.includes('data-id="pa1"'));
  assert.match(texto(viejo), /Pago del 10 oct 2026 · Efectivo/);
  assert.ok(!/Comprobante N\./.test(texto(viejo)), 'sin número que mostrar');
  assert.ok(!viejo.includes('data-cm="comprobante"'), 'sin botón');
  assert.match(viejo, /data-cm="anular-pago" data-id="pv"/, 'pero se puede anular, como siempre');
  assert.match(texto(viejo), /antes de que existieran los comprobantes de comisión/);
  assert.match(texto(viejo), /no tiene número ni guardó lo que se pagó renta por renta/);
  assert.match(texto(viejo), /cifras de hoy/);
  assert.ok(nuevo.includes('data-cm="comprobante"') && !nuevo.includes('dn-sin-papel'));
});

test('un pago ANULADO conserva su número y su etiqueta, y NO ofrece papel ni dice nada más: ya no pagó nada', () => {
  const anulado = anularPagoComision(pagoDeAna(), { fecha: '2026-10-15' });
  const { html } = fichaDeAna({ pagos: [anulado] });
  const pagado = yaPagado(html);
  assert.match(texto(pagado), /Comprobante N\.° 12 · 12 oct 2026 · Transferencia Anulado el 15 oct 2026/);
  assert.match(pagado, /dn-pago-anulado/);
  assert.ok(!pagado.includes('data-cm="comprobante"') && !pagado.includes('data-cm="anular-pago"') && !pagado.includes('dn-sin-papel'));
  // Y el viejo anulado tampoco: sigue siendo «Pago del …».
  const viejoAnulado = fichaDeAna({ pagos: [{ ...PAGO_VIEJO, anulado: true, anuladoEn: '2026-10-11' }] }).html;
  assert.match(texto(yaPagado(viejoAnulado)), /Pago del 10 oct 2026 · Efectivo Anulado el 11 oct 2026/);
  assert.ok(!yaPagado(viejoAnulado).includes('dn-sin-papel'), 'a un pago de antes que se anuló tampoco se le explica un papel que ya no tiene sentido');
});

test('un pago dañado no ofrece papel y dice cuál es el daño', () => {
  const dañado = pagoDeAna(); delete dañado.detalle;
  const { html } = fichaDeAna({ pagos: [dañado] });
  assert.ok(!html.includes('data-cm="comprobante"'));
  assert.match(texto(yaPagado(html)), /no se puede imprimir: trae su número pero no el detalle/);
  assert.match(texto(yaPagado(html)), /Pago del 12 oct 2026|Comprobante N\.° 12/, 'tiene un número guardado, y se ve');
});

test('las rentas de un pago con comprobante se listan COMO LAS GUARDÓ el pago: igual que el papel, aunque se corrija un cierre o la renta ya no esté', () => {
  const corregida = renta({ id: 'a2', numero: 2, recibidoEl: '2026-10-06' }); // hoy vale Q175, no Q140
  const sinA1 = [corregida, ANA_RENTAS[2]];
  const { html } = fichaDeAna({ contratos: sinA1, pagos: [pagoDeAna()] });
  const rentas = yaPagado(html);
  assert.ok(rentas.includes('contrato 1 · P-1AAA · Juan Pérez · Q140.00'), 'la a1 sigue ahí aunque ya no esté en la cuenta');
  assert.ok(rentas.includes('contrato 2 · P-2AAA · Juan Pérez · Q140.00'), 'la a2 dice lo que se pagó, no los Q175 de hoy');
  assert.ok(!rentas.includes('Q175.00') && !rentas.includes('ya no está en esta cuenta'));
  // Un pago de antes sí lista las de hoy (no guardó otra cosa) y dice «ya no está» de la que falta.
  const viejo = fichaDeAna({ pagos: [{ ...PAGO_VIEJO, contratos: ['a3', 'a-que-ya-no-esta'] }] }).html;
  assert.match(viejo, /Una renta que ya no está en esta cuenta/);
});

test('si hoy las rentas del pago suman otra cosa, la ficha lo dice como siempre y el aviso del papel lo repite para quien lo manda', () => {
  const corregida = renta({ id: 'a2', numero: 2, recibidoEl: '2026-10-06' });
  const pago = pagoDeAna();
  const { entrada, html } = fichaDeAna({ contratos: [ANA_RENTAS[0], corregida, ANA_RENTAS[2]], pagos: [pago] });
  const cambio = entrada.cuenta.pagosQueCambiaron.find((x) => x.pago.id === 'pa1');
  assert.ok(cambio, 'el escenario: el núcleo ve que cambió');
  assert.match(texto(html), /Lo que se pagó el 12 oct 2026 fue Q280\.00, y hoy esas rentas suman Q315\.00/);
  const aviso = avisoDelPapelQueNoCambia(cambio);
  assert.ok(aviso.startsWith(textoDePagoQueCambio(cambio)), 'con las mismas palabras de la ficha');
  assert.match(aviso, /El papel sigue diciendo lo que se pagó ese día/);
  const entradaPapel = entradaDelPapelDeComision({ pago, entrada, entradaDeAhora: entrada });
  assert.deepEqual(entradaPapel.avisos, [aviso]);
  assert.deepEqual(entradaPapel.empleado, { nombre: 'Ana López', codigo: '1' });
  // Sin cambio, o sin cuenta de ahora, no hay aviso (y el papel sale igual).
  const sinCambio = fichaDeAna({ pagos: [pago] }).entrada;
  assert.deepEqual(entradaDelPapelDeComision({ pago, entrada: sinCambio, entradaDeAhora: sinCambio }).avisos, []);
  assert.deepEqual(entradaDelPapelDeComision({ pago, entrada: sinCambio }).avisos, []);
});

test('el aviso es del pago que se imprime: con dos pagos y solo uno que cambió, el otro no lo lleva', () => {
  const otro = pagoDeAna({ id: 'pa2', numero: 13, contratos: ['a3'], monto: 140, detalle: [filaDeDetalle(ANA_RENTAS[2])] });
  const corregida = renta({ id: 'a3', numero: 3, recibidoEl: '2026-10-06' });
  const { entrada } = fichaDeAna({ contratos: [ANA_RENTAS[0], ANA_RENTAS[1], corregida], pagos: [pagoDeAna(), otro] });
  assert.deepEqual(entrada.cuenta.pagosQueCambiaron.map((x) => x.pago.id), ['pa2']);
  assert.equal(entradaDelPapelDeComision({ pago: pagoDeAna(), entrada, entradaDeAhora: entrada }).avisos.length, 0);
  assert.equal(entradaDelPapelDeComision({ pago: otro, entrada, entradaDeAhora: entrada }).avisos.length, 1);
});

test('EL RECORRIDO: se registra, se imprime, se corrige un cierre, se reimprime — el papel es el mismo, y la ficha avisa que hoy suma otra cosa', async () => {
  const d = nubeDeMentira({ contratos: ANA_RENTAS });
  const r = await registrarElPagoDeComision({
    entrada: anaDe(ANA_RENTAS), idsMarcados: ['a1', 'a2'], forma: 'efectivo', fecha: '2026-10-12', ...d,
  });
  assert.equal(r.tipo, 'guardado');
  const original = armarComprobanteDeComision({ pago: r.pago, empleado: { nombre: 'Ana López', codigo: '1' } });
  const htmlOriginal = htmlComprobanteDeComision(original);
  assert.match(htmlOriginal, /N° 21/);

  // Pasan los días y se corrige el cierre de la a2 (regresó un día después): ahora vale Q175.
  const despues = [ANA_RENTAS[0], renta({ id: 'a2', numero: 2, recibidoEl: '2026-10-06' }), ANA_RENTAS[2]];
  const leido = await leerElPagoParaElComprobante({ pagoId: r.pago.id, leerPagos: async () => ({ datos: [structuredClone(r.pago)], fallo: false }) });
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: despues, pagos: leido.pagos }));
  const entrada = vista.entradas.find((e) => e.nombre === 'Ana López');
  const entradaPapel = entradaDelPapelDeComision({ pago: leido.pago, entrada, entradaDeAhora: entrada });
  assert.equal(entradaPapel.avisos.length, 1, 'a él se le dice que hoy suma otra cosa');
  const reimpreso = htmlComprobanteDeComision(armarComprobanteDeComision(entradaPapel));
  assert.equal(reimpreso, htmlOriginal, 'al empleado, el papel le sale idéntico');
  assert.ok(!reimpreso.includes('Q175.00') && !reimpreso.includes('cambiaron'));
});

test('el papel se abre desde el pago tal como está AHORA en la nube, no desde la copia de la pantalla: se lee de nuevo', async () => {
  const pago = pagoDeAna();
  let lecturas = 0;
  const leerPagos = async () => { lecturas += 1; return { datos: [anularPagoComision(pago, { fecha: '2026-10-15' })], fallo: false }; };
  const r = await leerElPagoParaElComprobante({ pagoId: 'pa1', leerPagos });
  assert.equal(lecturas, 1);
  assert.equal(r.tipo, 'listo');
  assert.equal(r.pago.anulado, true, 'otra pestaña lo anuló: lo que llega es lo anulado');
  // ...y entonces el papel se niega, en vez de imprimir «comisiones pagadas» sobre algo que ya no está pagado.
  const c = contenedorFalso();
  assert.equal(pintarComprobanteDeComision(c, entradaDelPapelDeComision({ pago: r.pago, entrada: { nombre: 'Ana López' } })), null);
  assert.match(c.innerHTML, /está anulado desde el 15 oct 2026/);
});

test('leer el pago para el papel: si ya no está lo dice, y si los pagos no se pueden leer LANZA — sin saberlo no se abre ningún papel', async () => {
  const sinEse = await leerElPagoParaElComprobante({ pagoId: 'pa1', leerPagos: async () => ({ datos: [PAGO_VIEJO], fallo: false }) });
  assert.deepEqual(sinEse, { tipo: 'no-esta', pagos: [PAGO_VIEJO] });
  for (const lectura of [{ datos: null, fallo: true }, { datos: 'x', fallo: false }, { datos: [], fallo: true }]) {
    await assert.rejects(leerElPagoParaElComprobante({ pagoId: 'pa1', leerPagos: async () => lectura }), { message: MENSAJE_COMPROBANTE_COMISION_SIN_COMPROBAR });
  }
});

test('anular: el mensaje nombra el comprobante cuando lo hay, y avisa que el papel del empleado deja de valer; el de un pago de antes no inventa un número', () => {
  const entrada = { nombre: 'Ana López' };
  const nuevo = textoConfirmarAnularPagoDeComision(pagoDeAna(), entrada);
  assert.match(nuevo, /Anular el pago de Q280\.00 a Ana López \(comprobante N\.° 12, del 12 oct 2026, transferencia\)/);
  assert.match(nuevo, /con su número/);
  assert.match(nuevo, /el papel que el empleado tiene deja de valer/);
  const viejo = textoConfirmarAnularPagoDeComision(PAGO_VIEJO, entrada);
  assert.ok(!/comprobante N/.test(viejo) && !/papel/.test(viejo));
});

test('la ficha engancha el botón al recorrido seguro: sesión, relectura, y nada guardado en el módulo', () => {
  const codigo = sinComentarios(leer('../js/pantallas/comisiones.js'));
  assert.match(codigo, /case 'comprobante': verComprobante\(accion\.dataset\.id\); return;/);
  const f = codigo.slice(codigo.indexOf('async function verComprobante'), codigo.indexOf('// ----- Enlazar'));
  assert.match(f, /async function verComprobante\(pagoId\) \{\s*if \(ui\.ocupado \|\| !haySesion\(\) \|\| !entrada\) return;/);
  assert.match(f, /await leerElPagoParaElComprobante\(\{ pagoId \}\)/, 'lee de nuevo');
  assert.match(f, /if \(!haySesion\(\) \|\| !lector\.actual\) return;/, 'y mira la sesión otra vez después de leer');
  assert.match(f, /lector\.actual\.pagos\.datos = r\.pagos/);
  assert.match(f, /if \(r\.tipo === 'no-esta'\) \{ aviso\(MENSAJE_COMPROBANTE_COMISION_NO_ESTA, 'error'\); dibujar\(\); return; \}/, 'un pago que ya no está se dice');
  assert.match(f, /alVolver: dibujar/);
  assert.match(codigo, /Pago registrado: \$\{dinero\(r\.pago\.monto\)\}\. Comprobante N\.° \$\{r\.pago\.numero\}\./, 'al registrar se le dice el número');
});

// ---------------------------------------------------------------------------
// La hoja de estilos: el papel del empleado se imprime con las reglas del de los dueños
// ---------------------------------------------------------------------------

test('el papel del empleado usa la misma hoja de impresión: la clase `comprobante`, Carta vertical, y todo lo demás escondido', () => {
  const css = leer('../css/estilos.css');
  const html = htmlComprobanteDeComision(armarComprobanteDeComision(papel()));
  assert.match(html, /^<article class="comprobante"/, 'la hoja es lo que `body:has(.comprobante)` deja imprimir');
  const impresion = css.slice(css.indexOf('@media print'));
  assert.match(impresion, /body:has\(\.comprobante\) \*:not\(:has\(\.comprobante\)\):not\(\.comprobante\):not\(\.comprobante \*\)/);
  for (const pieza of ['.no-imprimir', '.btn', '#avisos']) assert.ok(impresion.includes(pieza), `${pieza} se esconde al imprimir`);
  // Ninguna clase sin regla: toda clase que dibuja el papel del empleado es del papel de los dueños (con sus reglas ya probadas en la hoja
  // de impresión) o es una de las tres de su bloque final, y esas tres tienen su regla CON declaraciones (más abajo).
  const clases = (texto) => new Set([...texto.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(' ')));
  const lasDelDueno = clases(leer('../js/pantallas/comprobante.js'));
  const propias = new Set(['comp-cola', 'comp-fila-total', 'comp-fila-suelta']);
  for (const clase of clases(html)) assert.ok(lasDelDueno.has(clase) || propias.has(clase), `la clase «${clase}» no es del papel de los dueños ni está en la lista de las propias: ¿tiene su regla de impresión?`);
  for (const clase of propias) assert.ok(clases(html).has(clase), `«${clase}» se dibuja`);
  assert.ok(css.includes('.dn-pago-hecho .dn-sin-papel'), 'y la nota de «sin comprobante» de la ficha tiene su regla');
});

// ---------------------------------------------------------------------------
// La firma nunca va sola en una hoja de más (24 de octubre de 2026)
//
// Con unas 14 rentas o más (y otra vez cerca de las 44) el total, la forma de pago y la firma no cabían en la hoja y la firma caía sola
// en una hoja de más. `break-before: avoid` no lo arregló (solo mueve el corte un borde hacia atrás) y una cadena de `avoid` tampoco sirve
// en una hoja que continúa una tabla: el navegador no mueve el corte hacia atrás ahí. Lo que sí se cumple en todas las hojas es un
// bloque que no se parte: el total, la forma de pago y la firma son filas de la MISMA tabla, junto con las últimas tres rentas, dentro
// de `tbody.comp-cola`. Desde Node no se ve el papel; sí se ve que el bloque esté armado así, y que su regla exista con su declaración.
// ---------------------------------------------------------------------------

/** El papel de un pago de `n` rentas (todas del mismo día, así que salen en orden de contrato). */
function papelConRentas(n) {
  const contratos = Array.from({ length: n }, (_, i) => firme(`r${i}`, { numero: 100 + i }));
  const pago = {
    ...construirPagoComision({
      empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos, pagos: [], idsMarcados: contratos.map((c) => c.id),
    }),
    id: 'pn', numero: 3,
  };
  return { pago, empleado: LUIS_EN_PAPEL };
}
const numerosDeContrato = (trozo) => [...trozo.matchAll(/<tr>\s*<td>[^<]*<\/td>\s*<td>(\d+)<\/td>/g)].map((m) => Number(m[1]));

test('el total, la forma de pago y la firma son las últimas filas de la tabla, en el mismo bloque que las últimas tres rentas', () => {
  const html = htmlComprobanteDeComision(armarComprobanteDeComision(papelConRentas(10)));
  const [antes, desdeLaCola] = html.split('<tbody class="comp-cola">');
  const cola = desdeLaCola.slice(0, desdeLaCola.indexOf('</tbody>'));
  assert.deepEqual(numerosDeContrato(antes), [100, 101, 102, 103, 104, 105, 106], 'las primeras siete, antes del bloque');
  assert.deepEqual(numerosDeContrato(cola), [107, 108, 109], 'las ÚLTIMAS tres viajan con el total y la firma');
  const marcas = ['comp-fila-total', 'Total pagado', 'comp-fila-suelta', 'Forma de pago', 'comp-fila-suelta', 'comp-firma-linea', 'Firma del empleado', 'comp-firma-nombre'];
  let desde = 0;
  for (const marca of marcas) {
    const en = cola.indexOf(marca, desde);
    assert.ok(en >= desde, `«${marca}» está dentro del bloque, en orden`);
    desde = en;
  }
  assert.equal(html.split('<tbody').length - 1, 2, 'dos cuerpos: las rentas y el bloque final');
  assert.ok(html.indexOf('</tbody>', html.indexOf('comp-cola')) < html.indexOf('</table>'), 'el bloque cierra dentro de la tabla: la firma no queda fuera de ella');
  assert.ok(html.indexOf('</table>') > html.indexOf('comp-firma-nombre'));
  assert.ok(!/<tfoot|<footer/.test(html), 'ya no hay un total ni una firma sueltos después de la tabla');
});

test('con pocas rentas viajan todas: con dos, el primer cuerpo queda vacío; con tres o cuatro, se parten en tres y el resto', () => {
  const de = (n) => htmlComprobanteDeComision(armarComprobanteDeComision(papelConRentas(n)));
  const cuantas = (html) => {
    const [antes, resto] = html.split('<tbody class="comp-cola">');
    return [numerosDeContrato(antes).length, numerosDeContrato(resto.slice(0, resto.indexOf('</tbody>'))).length];
  };
  assert.deepEqual(cuantas(de(1)), [0, 1]);
  assert.deepEqual(cuantas(de(2)), [0, 2]);
  assert.deepEqual(cuantas(de(3)), [0, 3]);
  assert.deepEqual(cuantas(de(4)), [1, 3]);
  assert.deepEqual(cuantas(de(44)), [41, 3]);
});

test('con las filas en otro orden en el pago, las que viajan con la firma siguen siendo las últimas en el papel (por cuándo regresaron)', () => {
  const { pago, empleado } = papelConRentas(6);
  pago.detalle = [...pago.detalle].reverse();
  const html = htmlComprobanteDeComision(armarComprobanteDeComision({ pago, empleado }));
  const [antes, resto] = html.split('<tbody class="comp-cola">');
  assert.deepEqual(numerosDeContrato(antes), [100, 101, 102]);
  assert.deepEqual(numerosDeContrato(resto.slice(0, resto.indexOf('</tbody>'))), [103, 104, 105]);
});

test('estilos.css: el bloque final del papel del empleado tiene sus reglas con sus declaraciones (no se parte al imprimir; el total y las filas sueltas se ven como siempre)', () => {
  const css = reglasDeCss(leer('../css/estilos.css'));
  assert.ok(css.declaraAlImprimir('.comp-cola', 'break-inside: avoid'), 'el bloque no se parte: pasa entero a la hoja siguiente');
  assert.ok(css.declaraAlImprimir('.comp-tabla tr', 'break-inside: avoid'), 'y cada fila tampoco');
  // El total se ve como el pie de siempre (negrita, su raya, cifra a la derecha), ahora que es una fila del cuerpo.
  for (const celda of ['th', 'td']) {
    assert.ok(css.declara(`.comp-tabla .comp-fila-total ${celda}`, 'font-weight: 700'), `total ${celda}: negrita`);
    assert.ok(css.declara(`.comp-tabla .comp-fila-total ${celda}`, 'border-top: 1.5px solid var(--navy)'), `total ${celda}: raya`);
  }
  assert.ok(css.declara('.comp-tabla .comp-fila-total th', 'text-align: right'));
  // La forma de pago y la firma, sin la raya ni el relleno de una celda de datos.
  assert.ok(css.declara('.comp-tabla .comp-fila-suelta td', 'padding: 0'));
  assert.ok(css.declara('.comp-tabla .comp-fila-suelta td', 'border-bottom: none'));
});

test('ni el papel ni la ficha llevan estilos en línea: un estilo en línea le gana a la hoja de impresión sin que nadie lo vea', () => {
  const codigo = sinComentarios(leer('../js/pantallas/comprobanteComision.js'));
  assert.equal((codigo.match(/style\s*=/g) || []).length, 0);
  assert.ok(!/\.style\b|cssText|setAttribute\(\s*['"]style/.test(codigo));
});
