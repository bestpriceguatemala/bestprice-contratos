// Pruebas de lo que se le debe a cada dueño de carro subarrendado.
//
// La pregunta del dueño es «¿cuánto le debo a Fulano?». Un error aquí no se ve
// como un error: se ve como una cifra menor de lo que de verdad debe, y él
// cree estar a mano con alguien a quien todavía le debe. Por eso las pruebas
// exigen montos exactos, y por eso hay una prueba de que ningún contrato ajeno
// desaparece de la vista, esté enlazado a un dueño o no.
//
// Los contratos de estas pruebas NO están inventados: se arman con las mismas
// funciones que arman los reales — `construirContrato` (Sacar carro),
// `construirCierre` (Recibir carro), `agregarPago` (cobrar el saldo) y
// `contratoParaGuardar` (lo que de verdad se escribe en Firestore) —, así que
// llevan exactamente los campos de §7b y ninguno que no exista. Una suite que
// arma sus propios datos con campos inventados solo se está comprobando a sí
// misma (la cuarta vez que este proyecto lo sufrió fueron 259 pruebas).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  costoDelSubarriendo, esPagableAlDueno, cuentaDeDueno, agruparPorDueno, totalSeleccionado,
} from '../js/nucleo/liquidacion.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { resumen } from '../js/nucleo/contrato.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { agregarPago, contratoParaGuardar } from '../js/datos.js';

const AHORA = 1790000000000;
const CLIENTE = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };
const TARJETA = {
  ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000,
};

// ---------------------------------------------------------------------------
// Los contratos de prueba, en las tres etapas de su vida.
// ---------------------------------------------------------------------------

/**
 * Un contrato de carro ajeno recién salido, tal como lo deja "Sacar carro".
 * La renta al cliente se cobra completa en efectivo (dias × Q700), así que el
 * saldo queda en cero. Con `garantia`, además hay una tarjeta autorizada que
 * queda bloqueada hasta que se libere.
 */
function salida({
  id, numero = 1, dueno = 'Don Mario', costoDia = 300, dias = 4, fechaSalida = '2026-09-01', garantia = false,
} = {}) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno, costoDia,
    },
    fechaSalida,
    dias,
    precioDia: 700,
    tarjetas: garantia ? [TARJETA] : [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

/** Un carro propio, sin dueño a quien pagarle. */
function propio({ id, numero = 90 }) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: false,
    carro: { id: 'v1', placas: 'P-999TST', marca: 'Toyota', linea: 'Corolla' },
    fechaSalida: '2026-09-01',
    dias: 4,
    precioDia: 700,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 2800,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

/**
 * El carro regresó (Recibir carro), con `atraso` días después de la fecha
 * prevista. La fecha real sale de la prevista del propio contrato, así los días
 * de atraso son exactamente los que se piden y no dependen de cuántos días duró
 * la renta.
 */
function recibido(c, atraso = 0) {
  return construirCierre(c, {
    fechaReal: sumarDias(c.devolucionPrevista, atraso),
    horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
  });
}

/** El cliente termina de pagar lo que falte y se le suelta la garantía, si la había. */
function saldado(c) {
  const conPago = agregarPago(c, {
    monto: resumen(c).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: c.cierre.fechaReal,
  });
  return c.garantiaMonto > 0 ? { ...conPago, garantiaLiberada: true, garantiaLiberadaEn: c.cierre.fechaReal } : conPago;
}

/** Lo que de verdad queda escrito: con `id`, `numero`, `actualizado` y `estado` sellados. */
const guardado = (c) => contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA });

/** Cerrado, sin atraso: 4 días × Q300 = Q1,200. */
function cerrado(id, opciones = {}) {
  return guardado(saldado(recibido(salida({ id, ...opciones }))));
}
/** Cerrado con 2 días de atraso: (4 + 2) días × Q300 = Q1,800. */
function cerradoConAtraso(id, opciones = {}) {
  return guardado(saldado(recibido(salida({ id, ...opciones }), 2)));
}
/** El carro ya volvió pero el cliente todavía debe los 2 días de atraso. */
function devueltoConSaldo(id, opciones = {}) {
  return guardado(recibido(salida({ id, ...opciones }), 2));
}
/** Pagó todo, pero la garantía de la tarjeta sigue bloqueada. */
function devueltoConGarantia(id, opciones = {}) {
  return guardado(recibido(salida({ id, garantia: true, ...opciones })));
}
/** El carro todavía anda afuera. */
function afuera(id, opciones = {}) {
  return guardado(salida({ id, ...opciones }));
}
/** Con dueño de la lista: `duenoId` va junto a `carroAjeno`, en la raíz del contrato. */
const enlazado = (c, duenoId) => ({ ...c, duenoId });

/** Un pago a un dueño, con los campos de `pagosDueno` (§7 del diseño de liquidación). */
function pagoADueno({
  id, duenoId, contratos, monto, numero = 1, fecha = '2026-09-20', forma = 'transferencia',
}) {
  return {
    id, duenoId, fecha, forma, monto, contratos, numero, actualizado: AHORA,
  };
}

const ids = (lista) => lista.map((c) => c.id);

// ---------------------------------------------------------------------------
// Que los contratos de prueba sean lo que dicen ser.
// ---------------------------------------------------------------------------

test('los contratos de prueba están en el estado que dicen estar, según el sistema', () => {
  assert.equal(estadoContrato(afuera('a')), 'rentado');
  assert.equal(estadoContrato(devueltoConSaldo('b')), 'devuelto');
  assert.equal(estadoContrato(devueltoConGarantia('c')), 'devuelto');
  assert.equal(estadoContrato(cerrado('d')), 'cerrado');
  assert.equal(estadoContrato(cerradoConAtraso('e')), 'cerrado');
  assert.equal(cerrado('d').estado, 'cerrado', 'el campo guardado también dice cerrado');
});

// ---------------------------------------------------------------------------
// costoDelSubarriendo
// ---------------------------------------------------------------------------

test('costoDelSubarriendo: 4 días a Q300 son Q1,200.00', () => {
  assert.equal(costoDelSubarriendo(cerrado('c1')), 1200);
});

test('costoDelSubarriendo: los 2 días de atraso también se le pagan al dueño, Q1,800.00', () => {
  assert.equal(costoDelSubarriendo(cerradoConAtraso('c1')), 1800);
});

test('costoDelSubarriendo: un contrato sin subarriendo (carro propio) cuesta 0', () => {
  const c = guardado(recibido(propio({ id: 'propio1' })));
  assert.equal(c.subarriendo, null, 'así queda guardado un carro propio');
  assert.equal(costoDelSubarriendo(c), 0);
});

test('costoDelSubarriendo: con costoDia en 0 el costo es 0', () => {
  assert.equal(costoDelSubarriendo(cerrado('c1', { costoDia: 0 })), 0);
});

test('costoDelSubarriendo: el costo nunca sale negativo', () => {
  assert.equal(costoDelSubarriendo(cerrado('c1', { costoDia: -300 })), 0);
});

test('costoDelSubarriendo: pasa por q(), no arrastra el error de los decimales', () => {
  // 0.1 × 3 en la computadora da 0.30000000000000004.
  assert.equal(costoDelSubarriendo(cerrado('c1', { costoDia: 0.1, dias: 3 })), 0.3);
  assert.equal(costoDelSubarriendo(cerrado('c2', { costoDia: 333.33, dias: 3 })), 999.99);
});

test('costoDelSubarriendo: da lo mismo que el costo que resumen() usa para la utilidad', () => {
  // La fórmula es una sola. Si esta prueba se rompe es que alguien la copió
  // en un segundo lugar y ya no coinciden.
  for (const c of [cerrado('c1'), cerradoConAtraso('c2'), afuera('c3'), guardado(recibido(propio({ id: 'propio1' })))]) {
    assert.equal(costoDelSubarriendo(c), resumen(c).costoSubarriendo);
  }
});

// ---------------------------------------------------------------------------
// esPagableAlDueno
// ---------------------------------------------------------------------------

test('esPagableAlDueno: un contrato ajeno cerrado sí se le paga al dueño', () => {
  assert.equal(esPagableAlDueno(cerrado('c1')), true);
  assert.equal(esPagableAlDueno(cerradoConAtraso('c2')), true);
});

test('esPagableAlDueno: uno ajeno devuelto con saldo pendiente no', () => {
  assert.equal(esPagableAlDueno(devueltoConSaldo('c1')), false);
});

test('esPagableAlDueno: uno ajeno devuelto con la garantía sin liberar no', () => {
  // Saldo en cero, pero la tarjeta sigue bloqueada: "cerrado" exige las dos
  // cosas, y esta función se lo pregunta a estadoContrato en vez de decidirlo.
  const c = devueltoConGarantia('c1');
  assert.equal(resumen(c).saldo, 0);
  assert.equal(esPagableAlDueno(c), false);
});

test('esPagableAlDueno: uno ajeno todavía afuera no', () => {
  assert.equal(esPagableAlDueno(afuera('c1')), false);
});

test('esPagableAlDueno: un contrato de carro propio, aunque esté cerrado, no', () => {
  const c = guardado(saldado(recibido(propio({ id: 'propio1' }))));
  assert.equal(estadoContrato(c), 'cerrado');
  assert.equal(esPagableAlDueno(c), false);
});

// ---------------------------------------------------------------------------
// cuentaDeDueno
// ---------------------------------------------------------------------------

test('cuentaDeDueno: separa por pagar, aún no cierra y pagados; el total suma solo lo por pagar', () => {
  const contratos = [
    cerrado('c1'), // Q1,200 por pagar
    cerradoConAtraso('c2'), // Q1,800 por pagar
    devueltoConSaldo('c3'), // aún no cierra: debe el atraso
    devueltoConGarantia('c4'), // aún no cierra: garantía bloqueada
    afuera('c5'), // aún no cierra: todavía afuera
    cerrado('c6'), // cerrado y ya cubierto por un pago
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c6'], monto: 1200 })];

  const cuenta = cuentaDeDueno({ contratos, pagos });

  assert.deepEqual(ids(cuenta.porPagar), ['c1', 'c2']);
  assert.deepEqual(ids(cuenta.aunNoCierra), ['c3', 'c4', 'c5']);
  assert.deepEqual(ids(cuenta.pagados), ['c6']);
  assert.equal(cuenta.totalPorPagar, 3000, 'Q1,200 + Q1,800; ni lo que aún no cierra ni lo ya pagado');
});

test('cuentaDeDueno: un contrato cubierto por un pago cae en pagados y no vuelve a sumar', () => {
  const contratos = [cerrado('c1'), cerrado('c2')];
  const sinPagos = cuentaDeDueno({ contratos, pagos: [] });
  assert.equal(sinPagos.totalPorPagar, 2400);

  const conPago = cuentaDeDueno({
    contratos,
    pagos: [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })],
  });
  assert.deepEqual(ids(conPago.pagados), ['c1']);
  assert.deepEqual(ids(conPago.porPagar), ['c2']);
  assert.equal(conPago.totalPorPagar, 1200, 'solo queda lo de c2');
});

test('cuentaDeDueno: un pago que cubre varias rentas las saca todas de lo pendiente', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2'), cerrado('c3')];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1', 'c2'], monto: 3000 })];
  const cuenta = cuentaDeDueno({ contratos, pagos });
  assert.deepEqual(ids(cuenta.pagados), ['c1', 'c2']);
  assert.deepEqual(ids(cuenta.porPagar), ['c3']);
  assert.equal(cuenta.totalPorPagar, 1200);
});

test('cuentaDeDueno: sin contratos ni pagos todo queda en cero, no falla', () => {
  assert.deepEqual(cuentaDeDueno({ contratos: [], pagos: [] }), {
    porPagar: [], aunNoCierra: [], pagados: [], totalPorPagar: 0,
  });
  assert.equal(cuentaDeDueno({ contratos: [cerrado('c1')] }).totalPorPagar, 1200, 'sin la lista de pagos, nada está pagado');
});

test('cuentaDeDueno: un contrato de carro propio que se cuele no aparece en la cuenta de nadie', () => {
  const c = guardado(saldado(recibido(propio({ id: 'propio1' }))));
  const cuenta = cuentaDeDueno({ contratos: [c, cerrado('c1')], pagos: [] });
  assert.deepEqual(ids(cuenta.porPagar), ['c1']);
  assert.deepEqual(cuenta.aunNoCierra, []);
  assert.deepEqual(cuenta.pagados, []);
});

test('cuentaDeDueno: el total pasa por q() con montos de centavos', () => {
  const contratos = [
    cerrado('c1', { costoDia: 0.1, dias: 3 }), // 0.3
    cerrado('c2', { costoDia: 0.2, dias: 3 }), // 0.6 — y 0.3 + 0.6 en la computadora da 0.8999999999999999
  ];
  assert.equal(cuentaDeDueno({ contratos, pagos: [] }).totalPorPagar, 0.9);
});

// ---------------------------------------------------------------------------
// totalSeleccionado
// ---------------------------------------------------------------------------

test('totalSeleccionado: con ningún id marcado da 0', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2')];
  assert.equal(totalSeleccionado(contratos, []), 0);
  assert.equal(totalSeleccionado(contratos, new Set()), 0);
  assert.equal(totalSeleccionado(contratos, undefined), 0);
});

test('totalSeleccionado: con dos marcados da la suma exacta de esos dos, no de todos', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2'), cerrado('c3', { costoDia: 250 })];
  // Q1,200 + Q1,800 = Q3,000; el tercero (Q1,000) queda sin marcar.
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2']), 3000);
  assert.equal(totalSeleccionado(contratos, new Set(['c2', 'c3'])), 2800, 'también acepta un Set');
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2', 'c3']), 4000);
});

test('totalSeleccionado: suma centavos sin arrastrar el error de la computadora', () => {
  const contratos = [
    cerrado('c1', { costoDia: 0.1, dias: 3 }),
    cerrado('c2', { costoDia: 0.2, dias: 3 }),
  ];
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2']), 0.9);
});

test('totalSeleccionado: un id marcado que no está en la lista no suma nada', () => {
  assert.equal(totalSeleccionado([cerrado('c1')], ['c1', 'fantasma']), 1200);
});

test('totalSeleccionado: una renta que aún no cierra no entra a un pago aunque alguien la marque', () => {
  // Pagar sobre un monto que todavía se puede mover es justo lo que el dueño
  // dijo que no quiere hacer.
  const contratos = [cerrado('c1'), devueltoConSaldo('c2'), afuera('c3')];
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2', 'c3']), 1200);
});

// ---------------------------------------------------------------------------
// agruparPorDueno
// ---------------------------------------------------------------------------

/** Lo que interesa de cada grupo, para comparar completo con deepEqual. */
const resumenDeGrupos = (grupos) => grupos.map((g) => ({
  duenoId: g.duenoId, nombre: g.nombre, sinEnlazar: g.sinEnlazar, total: g.cuenta.totalPorPagar,
}));

test('agruparPorDueno: dos contratos del mismo duenoId caen en una entrada con el total sumado', () => {
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1'),
    enlazado(cerradoConAtraso('c2', { dueno: 'Don Mario' }), 'd1'),
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].duenoId, 'd1');
  assert.equal(grupos[0].sinEnlazar, false);
  assert.equal(grupos[0].cuenta.totalPorPagar, 3000);
  assert.deepEqual(ids(grupos[0].cuenta.porPagar), ['c1', 'c2']);
});

test('agruparPorDueno: el mismo dueño enlazado con textos distintos sigue siendo un solo dueño', () => {
  // El texto es lo que se escribió ese día; lo que manda es el duenoId.
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1'),
    enlazado(cerrado('c2', { dueno: 'mario lópez' }), 'd1'),
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].cuenta.totalPorPagar, 2400);
});

test('agruparPorDueno: un contrato viejo sin duenoId no desaparece: cae bajo su texto, marcado como no enlazado', () => {
  const viejo = cerrado('c1', { dueno: 'Don Mario' });
  assert.equal('duenoId' in viejo, false, 'así quedaron guardados los contratos de antes de esta función');

  const grupos = agruparPorDueno([viejo], []);

  assert.deepEqual(resumenDeGrupos(grupos), [
    { duenoId: null, nombre: 'Don Mario', sinEnlazar: true, total: 1200 },
  ]);
  assert.deepEqual(ids(grupos[0].cuenta.porPagar), ['c1']);
});

test('agruparPorDueno: dos contratos viejos con el mismo texto caen juntos', () => {
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: 'Don Mario' }),
    cerradoConAtraso('c2', { dueno: 'Don Mario' }),
  ], []);
  assert.deepEqual(resumenDeGrupos(grupos), [
    { duenoId: null, nombre: 'Don Mario', sinEnlazar: true, total: 3000 },
  ]);
});

test('agruparPorDueno: un espacio de más al escribir el nombre no parte al dueño en dos', () => {
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: 'Don Mario' }),
    cerrado('c2', { dueno: '  Don Mario ' }),
  ], []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].nombre, 'Don Mario');
  assert.equal(grupos[0].cuenta.totalPorPagar, 2400);
});

test('agruparPorDueno: dos nombres escritos distinto quedan como dos grupos, a la vista, para enlazarlos', () => {
  // No se adivina que «Don Mario» y «Mario López» son la misma persona: un
  // grupo de más es un desorden que él puede ver; unir a dos personas por
  // error sería una deuda que se contagia a otro.
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: 'Don Mario' }),
    cerrado('c2', { dueno: 'Mario López' }),
  ], []);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos.map((g) => g.sinEnlazar), [true, true]);
});

test('agruparPorDueno: el mismo nombre escrito a mano NO se une a un dueño enlazado', () => {
  // Hasta que él los enlace, son dos grupos. El texto «d1» no debe chocar con
  // un duenoId «d1»: cada clave lleva su propio prefijo.
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1'),
    cerrado('c2', { dueno: 'Don Mario' }),
    cerrado('c3', { dueno: 'd1' }),
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.equal(grupos.length, 3);
  assert.equal(grupos.filter((g) => g.duenoId === 'd1').length, 1);
  assert.equal(grupos.filter((g) => g.sinEnlazar).length, 2);
});

test('agruparPorDueno: un contrato ajeno sin ningún nombre de dueño tampoco desaparece', () => {
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: '' }),
    cerrado('c2', { dueno: '   ' }),
  ], []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].duenoId, null);
  assert.equal(grupos[0].sinEnlazar, true);
  assert.equal(grupos[0].nombre, 'Sin dueño anotado');
  assert.equal(grupos[0].cuenta.totalPorPagar, 2400);
});

test('agruparPorDueno: ordena por lo que más se debe primero', () => {
  const contratos = [
    enlazado(cerrado('c1'), 'd2'), // d2: Q1,200
    enlazado(cerrado('c2'), 'd1'), // d1: Q1,200 + Q1,800 = Q3,000
    enlazado(cerradoConAtraso('c3'), 'd1'),
    cerrado('c4', { dueno: 'Doña Rosa', costoDia: 500 }), // sin enlazar: Q2,000
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.deepEqual(grupos.map((g) => g.cuenta.totalPorPagar), [3000, 2000, 1200]);
  assert.deepEqual(grupos.map((g) => g.duenoId), ['d1', null, 'd2']);
});

test('agruparPorDueno: un dueño sin nada pendiente no desaparece, va al final con total 0', () => {
  const contratos = [
    enlazado(cerrado('c1'), 'd1'), // ya pagado
    enlazado(cerrado('c2'), 'd2'), // Q1,200 por pagar
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })];
  const grupos = agruparPorDueno(contratos, pagos);
  assert.deepEqual(grupos.map((g) => [g.duenoId, g.cuenta.totalPorPagar]), [['d2', 1200], ['d1', 0]]);
  assert.deepEqual(ids(grupos[1].cuenta.pagados), ['c1']);
});

test('agruparPorDueno: cada entrada trae su cuenta armada con los pagos que le tocan', () => {
  const contratos = [
    enlazado(cerrado('c1'), 'd1'),
    enlazado(cerrado('c2'), 'd1'),
    enlazado(devueltoConSaldo('c3'), 'd1'),
    enlazado(cerrado('c4'), 'd2'),
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })];
  const grupos = agruparPorDueno(contratos, pagos);

  // d1: c2 por pagar (Q1,200), c1 ya pagado, c3 aún no cierra. d2: c4 (Q1,200).
  assert.equal(grupos.length, 2);
  const d1 = grupos.find((g) => g.duenoId === 'd1');
  const d2 = grupos.find((g) => g.duenoId === 'd2');
  assert.deepEqual(ids(d1.cuenta.porPagar), ['c2']);
  assert.deepEqual(ids(d1.cuenta.pagados), ['c1']);
  assert.deepEqual(ids(d1.cuenta.aunNoCierra), ['c3']);
  assert.equal(d1.cuenta.totalPorPagar, 1200);
  assert.deepEqual(ids(d2.cuenta.porPagar), ['c4']);
  assert.equal(d2.cuenta.totalPorPagar, 1200);
});

test('agruparPorDueno: si dos dueños deben lo mismo, el orden no depende de cómo llegaron los contratos', () => {
  const a = cerrado('c1', { dueno: 'Zacarías' });
  const b = cerrado('c2', { dueno: 'Alberto' });
  const esperado = ['Alberto', 'Zacarías'];
  assert.deepEqual(agruparPorDueno([a, b], []).map((g) => g.nombre), esperado);
  assert.deepEqual(agruparPorDueno([b, a], []).map((g) => g.nombre), esperado);
});

test('agruparPorDueno: los contratos de carro propio no forman parte de ningún dueño', () => {
  const p = guardado(saldado(recibido(propio({ id: 'propio1' }))));
  const grupos = agruparPorDueno([p, cerrado('c1')], []);
  assert.equal(grupos.length, 1);
  assert.deepEqual(ids(grupos[0].cuenta.porPagar), ['c1']);
});

test('agruparPorDueno: sin contratos da una lista vacía', () => {
  assert.deepEqual(agruparPorDueno([], []), []);
  assert.deepEqual(agruparPorDueno(undefined, undefined), []);
});

test('agruparPorDueno: ningún contrato ajeno ni ningún centavo se pierde, enlazado o no', () => {
  // Lo que más importa de todo el módulo: lo que él ve repartido en grupos
  // tiene que ser TODO lo que le debe, no una parte.
  const contratos = [
    enlazado(cerrado('c1'), 'd1'), // 1,200
    enlazado(cerradoConAtraso('c2'), 'd1'), // 1,800
    enlazado(cerrado('c3'), 'd2'), // 1,200
    cerrado('c4', { dueno: 'Don Mario' }), // 1,200, viejo
    cerradoConAtraso('c5', { dueno: 'Don Mario' }), // 1,800, viejo
    cerrado('c6', { dueno: 'Doña Rosa', costoDia: 250 }), // 1,000, viejo
    cerrado('c7', { dueno: '' }), // 1,200, viejo y sin nombre
    devueltoConSaldo('c8', { dueno: 'Doña Rosa' }), // viejo, aún no cierra
    enlazado(afuera('c9'), 'd2'), // aún no cierra
    enlazado(cerrado('c10'), 'd3'), // ya pagado
    guardado(saldado(recibido(propio({ id: 'propio1' })))), // propio: no es de nadie
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd3', contratos: ['c10'], monto: 1200 })];

  const grupos = agruparPorDueno(contratos, pagos);

  const sumaDeTotales = grupos.reduce((t, g) => t + g.cuenta.totalPorPagar, 0);
  assert.equal(sumaDeTotales, 9400, 'Q1,200+1,800+1,200+1,200+1,800+1,000+1,200');

  const enGrupos = grupos.flatMap((g) => [...g.cuenta.porPagar, ...g.cuenta.aunNoCierra, ...g.cuenta.pagados]);
  assert.deepEqual(ids(enGrupos).sort(), ['c1', 'c10', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);

  // Cada contrato en un solo grupo, no en dos.
  assert.equal(new Set(ids(enGrupos)).size, enGrupos.length);

  assert.deepEqual(resumenDeGrupos(grupos), [
    { duenoId: 'd1', nombre: 'Don Mario', sinEnlazar: false, total: 3000 },
    { duenoId: null, nombre: 'Don Mario', sinEnlazar: true, total: 3000 },
    { duenoId: 'd2', nombre: 'Don Mario', sinEnlazar: false, total: 1200 },
    { duenoId: null, nombre: 'Sin dueño anotado', sinEnlazar: true, total: 1200 },
    { duenoId: null, nombre: 'Doña Rosa', sinEnlazar: true, total: 1000 },
    { duenoId: 'd3', nombre: 'Don Mario', sinEnlazar: false, total: 0 },
  ]);
});
