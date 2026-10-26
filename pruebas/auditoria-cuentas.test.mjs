// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en las cuentas
// (lo que se le debe a cada dueño de carro y a cada empleado). Cada una nació de un mutante que SOBREVIVIÓ:
// se le metió a propósito un error al código y las 2,589 pruebas de entonces seguían en verde. Aquí cada
// una falla con ese error puesto y pasa con el código bueno. Qué le habría costado al dueño cada uno:
// .superpowers/auditoria-pruebas-2026-10-26.md.
//
// Los contratos y los pagos salen de los constructores de verdad (`construirContrato`, `construirCierre`,
// `agregarPago`, `contratoParaGuardar`, `construirPagoDueno`, `construirPagoComision`), no de objetos
// escritos a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cuentaDeDueno, agruparPorDueno, totalSeleccionado, totalGeneral, pagadoDeMas, totalPagadoDeMas, descuentoMaximo,
  descuentoDelPago, sinIdsRepetidos,
} from '../js/nucleo/liquidacion.js';
import {
  cuentaDeEmpleado, agruparPorEmpleado, filaDeDetalle, totalGeneralDeComisiones,
} from '../js/nucleo/comisiones.js';
import { construirPagoComision, pagoComisionParaGuardar } from '../js/datos.js';
import { renta, rentaDeAntes, EMPLEADOS } from './fixtures/rentasConComision.mjs';
import {
  AHORA, ids, salida, cerrado, devuelto, sinCostoLeido, pagoReal,
} from './fixtures/duenoDeCarros.mjs';

// ---------------------------------------------------------------------------
// liquidacion.js — «cierra» y «de fiar» son de TODAS las rentas del grupo, no de alguna
// ---------------------------------------------------------------------------

test('un pago de dos rentas y una se reabre y crece: la diferencia se ve pero NO se paga, porque la otra cierre no basta', () => {
  // `enGrupo.every(esPagableAlDueno)` -> `.some`: con una sola renta cerrada del grupo, la diferencia de la otra
  // —que todavía puede cambiar— entraba a «Por pagar» y se le pagaba al dueño del carro sobre una cifra que se mueve.
  const c1 = cerrado('c1');
  const c2 = cerrado('c2');
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c1, c2], idsMarcados: ['c1', 'c2'] });
  assert.equal(p1.monto, 2400, 'el escenario: un solo pago por las dos rentas, Q1,200 cada una');

  const cuenta = cuentaDeDueno({ contratos: [devuelto('c1', 2), c2], pagos: [p1] });

  assert.equal(cuenta.gruposDePago.length, 1);
  assert.equal(cuenta.gruposDePago[0].diferencia, 600, 'c1 creció a Q1,800 y todavía no la paga el cliente');
  assert.equal(cuenta.gruposDePago[0].cierra, false, 'una de las dos no está cerrada: el grupo no cierra');
  assert.deepEqual(cuenta.diferencias, [], 'no se puede pagar todavía');
  assert.equal(cuenta.diferenciasSinCerrar.length, 1, 'pero se ve');
  assert.equal(cuenta.totalPorPagar, 0, 'y no suma a lo que se le debe ahora');

  // La contraparte: si las DOS rentas cierran, la diferencia se paga y NO se repite además como «sin cerrar».
  // (`crecidos.filter((g) => !g.cierra)` -> sin el filtro: la misma deuda aparecía en las dos listas.)
  const cierran = cuentaDeDueno({ contratos: [cerrado('c1', 2), c2], pagos: [p1] });
  assert.equal(cierran.diferencias.length, 1);
  assert.equal(cierran.diferencias[0].diferencia, 600);
  assert.deepEqual(cierran.diferenciasSinCerrar, []);
  assert.equal(cierran.totalPorPagar, 600);
});

test('una diferencia de menos de un quetzal también es deuda y se ve', () => {
  // `diferencia > 0` -> `> 1`: un cobro de Q0.50 de más se leía como «a mano». (Un costo de Q0.50 por día no es
  // realista; el borde es el mismo con cualquier cifra menor de Q1.)
  const pagado = cerrado('r1', 1, { costoDia: 0.5 });
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [pagado], idsMarcados: ['r1'] });
  assert.equal(p1.monto, 2.5, '(4 + 1) días × Q0.50');
  const cuenta = cuentaDeDueno({ contratos: [cerrado('r1', 2, { costoDia: 0.5 })], pagos: [p1] });
  assert.equal(cuenta.diferencias.length, 1);
  assert.equal(cuenta.diferencias[0].diferencia, 0.5);
  assert.equal(cuenta.totalPorPagar, 0.5);
});

test('un grupo con una renta cuyo costo no se pudo leer NO afirma que se pagó de más', () => {
  // `!g.contratos.some(dudosa)` -> `.every`: bastaba con que UNA renta del grupo tuviera su costo leído para creer la cuenta,
  // y la ficha diría «se le pagó de más Q1,200» cuando lo que pasó es que no se pudo leer lo que cuesta la otra.
  const c1 = cerrado('c1');
  const c2 = cerrado('c2');
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c1, c2], idsMarcados: ['c1', 'c2'] });
  const cuenta = cuentaDeDueno({ contratos: [c1, sinCostoLeido('c2')], pagos: [p1] });
  assert.equal(cuenta.gruposDePago[0].diferencia, -1200, 'el escenario: lo que se lee cuesta Q1,200 y se pagaron Q2,400');
  assert.deepEqual(pagadoDeMas(cuenta, ['c2']), [], 'con un costo que no se leyó no se dice nada');
  assert.equal(totalPagadoDeMas(cuenta, ['c2']), 0);
  assert.equal(descuentoMaximo(cuenta, ['c2'], ['c1']), 0, 'y no se puede descontar nada contra una cifra inventada');
  // Con los dos costos leídos, la misma cuenta SÍ dice que se pagó de más cuando de verdad es así.
  const leidos = cuentaDeDueno({ contratos: [c1, cerrado('c2', 0, { dias: 2 })], pagos: [p1] });
  assert.equal(pagadoDeMas(leidos, [])[0].deMas, 600, 'Q2,400 pagados contra Q1,200 + Q600');
});

// ---------------------------------------------------------------------------
// liquidacion.js — qué copia gana, y en qué orden se ven las cosas
// ---------------------------------------------------------------------------

test('dos copias del mismo contrato con el MISMO sello: se queda la primera; con uno más nuevo, la nueva', () => {
  // `nuevo > viejo` -> `>=`: en un empate se quedaba la última en llegar, y el desempate dejaba de ser el de siempre.
  const a = cerrado('c1');
  const b = { ...a, clienteNombre: 'Otra copia' };
  assert.equal(a.actualizado, b.actualizado, 'el escenario: empatan');
  assert.equal(sinIdsRepetidos([a, b])[0].clienteNombre, a.clienteNombre, 'empate: la primera');
  assert.equal(sinIdsRepetidos([b, a])[0].clienteNombre, 'Otra copia');
  const masNueva = { ...b, actualizado: a.actualizado + 1 };
  assert.equal(sinIdsRepetidos([a, masNueva]).length, 1);
  assert.equal(sinIdsRepetidos([a, masNueva])[0].clienteNombre, 'Otra copia', 'la más nueva gana aunque llegue después');
  assert.equal(sinIdsRepetidos([masNueva, a])[0].clienteNombre, 'Otra copia', 'y aunque llegue antes');
});

test('dos copias del mismo contrato sin sello (las de antes del sello): se queda la primera', () => {
  // `c.actualizado || 0` -> `|| 1`: dos copias sin sello se desempataban a favor de la última.
  const a = salida({ id: 'c1' });
  const b = { ...a, clienteNombre: 'Otra copia' };
  assert.equal(a.actualizado, undefined);
  assert.equal(sinIdsRepetidos([a, b])[0].clienteNombre, a.clienteNombre);
});

test('lo que no es una lista se devuelve tal cual (quien lanza es exigirContratos)', () => {
  assert.equal(sinIdsRepetidos(null), null);
  assert.equal(sinIdsRepetidos('x'), 'x');
  assert.equal(totalSeleccionado(null, ['c1']), 0, 'sin lista de contratos no hay nada que sumar, y no truena');
});

test('la clave de una diferencia lleva los ids ORDENADOS, aunque los contratos lleguen al revés', () => {
  // Esa clave es la casilla que se marca; si cambiara con el orden en que llegaron los contratos, marcarla en una
  // pantalla y registrar el pago con los datos de otra no encontraría la misma. (Con tres rentas, porque con dos el
  // orden por código nunca llega a decir «este va después de aquel».)
  const [c1, c2, c3] = ['c1', 'c2', 'c3'].map((id) => cerrado(id));
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c1, c2, c3], idsMarcados: ['c1', 'c2', 'c3'] });
  const crecido = cerrado('c1', 2);
  for (const contratos of [[crecido, c2, c3], [c3, c2, crecido], [c2, c3, crecido], [c3, crecido, c2]]) {
    const cuenta = cuentaDeDueno({ contratos, pagos: [p1] });
    assert.deepEqual(cuenta.diferencias.map((d) => d.clave), ['dif:c1+c2+c3']);
  }
});

test('los pagos de un grupo salen del más antiguo al más nuevo, lleguen como lleguen; a igual número, por id', () => {
  const c = cerrado('r41', 1);
  const p7 = pagoReal({ id: 'p7', numero: 7, contratos: [c], idsMarcados: ['r41'] });
  const crecida = cerrado('r41', 3);
  const cuenta1 = cuentaDeDueno({ contratos: [crecida], pagos: [p7] });
  const p9 = pagoReal({
    id: 'p9', numero: 9, contratos: [crecida], pagos: [p7], idsMarcados: [cuenta1.diferencias[0].clave],
  });
  for (const pagos of [[p7, p9], [p9, p7]]) {
    const cuenta = cuentaDeDueno({ contratos: [crecida], pagos });
    assert.deepEqual(cuenta.gruposDePago[0].pagos.map((p) => p.numero), [7, 9]);
  }
  // Sin número (los de antes del número de comprobante) desempata el id.
  const sinNumero = (p, id) => ({ ...p, id, numero: undefined });
  const cuentaSinNumero = cuentaDeDueno({ contratos: [crecida], pagos: [sinNumero(p9, 'pb'), sinNumero(p7, 'pa')] });
  assert.deepEqual(cuentaSinNumero.gruposDePago[0].pagos.map((p) => p.id), ['pa', 'pb']);
});

test('los grupos de pagos van por número del primer comprobante y, a igual número, por el id de su primera renta', () => {
  const rentas = Object.fromEntries(['ca', 'cb', 'cc', 'cd'].map((id) => [id, cerrado(id)]));
  const pago = (id, numero, renta) => pagoReal({ id, numero, contratos: [rentas[renta]], idsMarcados: [renta] });
  const pagos = [pago('pa', 3, 'ca'), pago('pc', 1, 'cc'), pago('pb', 1, 'cb'), pago('pd', 1, 'cd')];
  for (const contratos of [['cd', 'cc', 'cb', 'ca'], ['ca', 'cb', 'cc', 'cd'], ['cc', 'ca', 'cd', 'cb']]) {
    const cuenta = cuentaDeDueno({ contratos: contratos.map((id) => rentas[id]), pagos: [...pagos].reverse() });
    assert.deepEqual(cuenta.gruposDePago.map((g) => ids(g.contratos)[0]), ['cb', 'cc', 'cd', 'ca']);
  }
});

// ---------------------------------------------------------------------------
// liquidacion.js — lo que se descuenta, lo que se agrupa, lo que se dice cuando algo no llegó
// ---------------------------------------------------------------------------

test('un pago en cero o con monto dañado no puede «descontar» nada', () => {
  // `Math.max(0, monto)` -> `Math.max(1, monto)`: un pago sin monto dejaba descontar hasta Q1.
  const c = cerrado('c1');
  const vacio = pagoReal({ id: 'p0', numero: 1, contratos: [c], idsMarcados: [] });
  assert.equal(vacio.monto, 0, 'el escenario: nada marcado, pago en cero');
  assert.equal(descuentoDelPago({ ...vacio, descuento: 0.5 }), 0);
  assert.equal(descuentoDelPago({ ...vacio, monto: -10, descuento: 5 }), 0);
  assert.equal(descuentoDelPago({ monto: 600, descuento: 600.5 }), 600, 'y nunca más que el monto');
});

test('un contrato con duenoId vacío («») cuenta como sin enlazar, y su duenoId sale null', () => {
  // `c.duenoId || null` -> `??`: el '' pasaba tal cual y el grupo salía con duenoId '' en vez de null.
  const sinId = { ...cerrado('c1'), duenoId: '' };
  const [entrada] = agruparPorDueno([sinId], []);
  assert.equal(entrada.duenoId, null);
  assert.equal(entrada.sinEnlazar, true);
});

test('lo que no llegó dice QUÉ no llegó: null, undefined o un texto', () => {
  // `queLlego`: el mensaje es lo único que le dice a quien lo lee si fue la lectura que falló o un dato mal armado.
  const dice = (fn, patron) => assert.throws(fn, (e) => e instanceof TypeError && patron.test(e.message));
  dice(() => cuentaDeDueno({ contratos: [], pagos: null }), /«pagos» debe ser una lista y llegó null\./);
  dice(() => cuentaDeDueno({ contratos: [], pagos: undefined }), /«pagos» debe ser una lista y llegó undefined\./);
  dice(() => cuentaDeDueno({ contratos: [], pagos: 'p1' }), /«pagos» debe ser una lista y llegó string\./);
  dice(() => cuentaDeDueno({ contratos: null, pagos: [] }), /«contratos» debe ser una lista y llegó null\./);
  dice(() => cuentaDeDueno({ contratos: {}, pagos: [] }), /«contratos» debe ser una lista y llegó object\./);
  dice(() => totalGeneral(null), /«cuentas» debe ser una lista y llegó null\. Sin ella no se sabe qué se le debe a nadie, y un total en cero diría/);
  dice(() => totalGeneral(7), /llegó number\./);
  dice(() => cuentaDeEmpleado({ contratos: [], pagos: null }), /«pagos» debe ser una lista y llegó null\./);
  dice(() => cuentaDeEmpleado({ contratos: [], pagos: 5 }), /«pagos» debe ser una lista y llegó number\./);
  dice(() => cuentaDeEmpleado({ contratos: undefined, pagos: [] }), /«contratos» debe ser una lista y llegó undefined\./);
  dice(() => totalGeneralDeComisiones(null), /«cuentas» debe ser una lista y llegó null\. Sin ella/);
});

// ---------------------------------------------------------------------------
// comisiones.js — el orden de la lista, y los avisos de «tu pago cambió»
// ---------------------------------------------------------------------------

const { ana } = EMPLEADOS;
const cerradaEl = (id, numero, recibidoEl, extra = {}) => renta({ id, numero, recibidoEl, ...extra });

test('lo por pagar va del que regresó primero al último; a igual día, por número de contrato; a igual número, por id', () => {
  const rentas = [
    cerradaEl('cz', 7, '2026-10-09'),
    cerradaEl('cy', 7, '2026-10-09'),
    cerradaEl('ca', 12, '2026-10-09'),
    cerradaEl('cb', 5, '2026-10-09'),
    cerradaEl('cc', 20, '2026-10-05'),
  ];
  const quedaron = (orden) => cuentaDeEmpleado({ contratos: orden.map((i) => rentas[i]), pagos: [] }).porPagar.map((c) => c.id);
  assert.deepEqual(quedaron([0, 1, 2, 3, 4]), ['cc', 'cb', 'cy', 'cz', 'ca']);
  assert.deepEqual(quedaron([4, 3, 2, 1, 0]), ['cc', 'cb', 'cy', 'cz', 'ca'], 'igual si llegan al revés');
  assert.deepEqual(quedaron([2, 0, 3, 4, 1]), ['cc', 'cb', 'cy', 'cz', 'ca'], 'y revueltas');
});

test('los que siguen afuera van del que salió primero al último; a igual día, por número; a igual número, por id', () => {
  const salio = (id, numero, fechaSalida) => renta({ id, numero, fechaSalida });
  const rentas = [salio('cz', 7, '2026-10-02'), salio('cy', 7, '2026-10-02'), salio('ca', 12, '2026-10-02'), salio('cb', 5, '2026-10-02'), salio('cc', 20, '2026-09-28')];
  const quedaron = (orden) => cuentaDeEmpleado({ contratos: orden.map((i) => rentas[i]), pagos: [] }).noFirmes.map((c) => c.id);
  assert.deepEqual(quedaron([0, 1, 2, 3, 4]), ['cc', 'cb', 'cy', 'cz', 'ca']);
  assert.deepEqual(quedaron([4, 3, 2, 1, 0]), ['cc', 'cb', 'cy', 'cz', 'ca']);
});

test('dos empleados con el mismo nombre y lo mismo por pagar: el enlazado va antes que el escrito a mano', () => {
  // El último desempate de la lista (`porCodigo(a.clave, b.clave)`): sin él el orden dependía de cómo llegaron los contratos.
  const enlazada = renta({ id: 'c1', numero: 1, empleado: ana, recibidoEl: '2026-10-05' });
  const aMano = rentaDeAntes({
    id: 'c2', numero: 2, rentadoPor: ana.nombre, fechaSalida: '2026-10-01', recibidoEl: '2026-10-05',
  });
  for (const contratos of [[aMano, enlazada], [enlazada, aMano]]) {
    const grupos = agruparPorEmpleado(contratos, []);
    assert.equal(grupos[0].cuenta.totalPorPagar, grupos[1].cuenta.totalPorPagar, 'el escenario: empatan en todo');
    assert.equal(grupos[0].nombre, grupos[1].nombre);
    assert.deepEqual(grupos.map((g) => g.clave), ['id:e1', `texto:${ana.nombre}`]);
  }
});

test('una renta con empleadoId vacío («») es del grupo escrito a mano y su empleadoId sale null', () => {
  const sinId = { ...renta({ id: 'c1', empleado: ana, recibidoEl: '2026-10-05' }), empleadoId: '' };
  const [entrada] = agruparPorEmpleado([sinId], []);
  assert.equal(entrada.empleadoId, null);
  assert.equal(entrada.sinEnlazar, true);
});

test('el número de contrato del detalle de un pago es un número o null, nunca NaN ni vacío', () => {
  // `numero !== null && numero !== undefined && numero !== '' && Number.isFinite(numero)`: con un `||` en lugar de
  // un `&&`, un contrato sin número salía con NaN en el papel del comprobante.
  const base = renta({ id: 'c1', numero: 12, empleado: ana, recibidoEl: '2026-10-05' });
  const conNumero = (numero) => filaDeDetalle({ ...base, numero }).numero;
  assert.equal(conNumero(12), 12);
  assert.equal(conNumero('12'), 12);
  for (const sinNumero of [null, undefined, '', 'abc']) {
    assert.equal(conNumero(sinNumero), null, `numero ${JSON.stringify(sinNumero)}`);
  }
});

/** Un pago de comisión armado como lo arma la pantalla, y sellado como queda guardado. */
const pagoDeComisionReal = ({ id, contratos, idsMarcados }) => pagoComisionParaGuardar(
  construirPagoComision({
    empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos, pagos: [], idsMarcados,
  }),
  { id, ahora: AHORA },
);

test('un pago que no cubre ninguna renta, o cubre una que sigue afuera, no avisa «tu pago cambió»', () => {
  const c1 = renta({ id: 'c1', numero: 1, empleado: ana, recibidoEl: '2026-10-05' });
  const afuera = renta({ id: 'c2', numero: 2, empleado: ana });
  const pago = pagoDeComisionReal({ id: 'p1', contratos: [c1], idsMarcados: ['c1'] });
  assert.equal(pago.monto, 140, 'el escenario: Q140.00 por la renta de c1');

  // Sin rentas: `!ids.length || …` -> `&&` lo dejaba pasar y comparaba Q500 contra Q0.
  const sinRentas = { ...pago, contratos: [], monto: 500 };
  assert.deepEqual(cuentaDeEmpleado({ contratos: [c1], pagos: [sinRentas] }).pagosQueCambiaron, []);

  // Una de las rentas que cubre todavía es un estimado: no es lo mismo contra lo mismo, y no se afirma nada.
  // (`rentas.some(estimada)` -> `every`: con una sola de las dos estimada comparaba y avisaba un cambio de Q140.)
  const cubreUnaAfuera = { ...pago, contratos: ['c1', 'c2'] };
  assert.deepEqual(cuentaDeEmpleado({ contratos: [c1, afuera], pagos: [cubreUnaAfuera] }).pagosQueCambiaron, []);

  // Una que ya no está en esta cuenta tampoco.
  assert.deepEqual(cuentaDeEmpleado({ contratos: [c1], pagos: [{ ...pago, contratos: ['c1', 'otra'] }] }).pagosQueCambiaron, []);

  // Y cuando de verdad cambió (un descuento después de pagar), sí avisa, con la diferencia.
  const corregida = renta({ id: 'c1', numero: 1, empleado: ana, recibidoEl: '2026-10-05', descuento: 400 });
  const [cambio] = cuentaDeEmpleado({ contratos: [corregida], pagos: [pago] }).pagosQueCambiaron;
  assert.equal(cambio.pagado, 140);
  assert.equal(cambio.ahora, 120, '5 % de (Q2,800 - Q400)');
  assert.equal(cambio.diferencia, -20);
});
