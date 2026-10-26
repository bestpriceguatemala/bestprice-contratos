// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en el comprobante de pago a un
// dueño de carro (el papel que sale de la empresa): cuándo sale una nota de descuento, qué se imprime cuando falta un costo, y
// cómo se reconoce «este» pago dentro de su grupo. Cada una nació de un mutante que SOBREVIVIÓ: se le metió a propósito un error
// al código y las 2,589 pruebas de entonces seguían en verde. Aquí cada una falla con ese error puesto y pasa con el código
// bueno. Qué le habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
//
// Los contratos y los pagos salen de los constructores de verdad (pruebas/fixtures/duenoDeCarros.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armarComprobante, htmlComprobante, textoDeForma, imprimirConTitulo,
} from '../js/pantallas/comprobante.js';
import { cuentaDeDueno } from '../js/nucleo/liquidacion.js';
import {
  cerrado, sinCostoLeido, pagoReal,
} from './fixtures/duenoDeCarros.mjs';

const HOY = '2026-10-26';
const dueno = { nombre: 'Don Mario', telefono: '5555-1111', nit: '1234567-8' };
const armar = (extra) => armarComprobante({
  dueno, costoSinLeer: [], hoy: HOY, pagos: [], ...extra,
});

/**
 * Un dueño al que se le pagó de más: la renta 'r1' se cerró con 3 días de atraso (Q2,100), se le pagó, y después se corrigió
 * a 0 días (Q1,200): Q900 de más. Devuelve el pago de 'r1' y el contrato corregido, para que un pago nuevo descuente.
 */
function conPagoDeMas() {
  const original = cerrado('r1', 3);
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [original], idsMarcados: ['r1'] });
  assert.equal(p1.monto, 2100, 'el escenario: se le pagaron Q2,100');
  return { p1, corregida: cerrado('r1', 0) };
}

/** El pago de una renta nueva (`dias` días a Q300) que descuenta `descuento` de lo ya pagado de más. */
function pagoConDescuento(descuento, dias = 4) {
  const { p1, corregida } = conPagoDeMas();
  const nueva = cerrado('r2', 0, { dias });
  const contratos = [corregida, nueva];
  const p2 = pagoReal({
    id: 'p2', numero: 2, contratos, pagos: [p1], idsMarcados: ['r2'], descuento,
  });
  return { p1, p2, contratos };
}

test('un pago SIN descuento no imprime ninguna palabra de descuento ni de «pagado de más»', () => {
  // `descuento > 0` -> `>= 0`: cada comprobante normal saldría con «Menos: lo que ya se le había pagado de más -Q0.00».
  const c = cerrado('r1');
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c], idsMarcados: ['r1'] });
  const m = armar({ pago: p1, contratos: [c], pagos: [p1] });
  assert.equal(m.pagado.descuento, 0);
  const html = htmlComprobante(m);
  assert.doesNotMatch(html, /pagado de más|Menos:|se le pagaron|Sin entrega de dinero/);
  assert.match(html, /<th scope="row" colspan="5">Total pagado<\/th>\s*<td class="num">Q1,200\.00<\/td>/);
  assert.match(html, /Forma de pago: <strong>Transferencia<\/strong>/);
});

test('un descuento, aunque sea de medio quetzal, se imprime con su resta y su nota', () => {
  // `descuento > 0` -> `> 1` en el pie, la nota y la línea de forma: un descuento de Q0.50 no salía en el papel y el total
  // pagado no cuadraba con las rentas.
  const { p2, contratos } = pagoConDescuento(0.5);
  assert.equal(p2.descuento, 0.5);
  const m = armar({ pago: p2, contratos, pagos: [p2] });
  assert.equal(m.pagado.entregado, 1199.5);
  const html = htmlComprobante(m);
  assert.match(html, /Menos: lo que ya se le había pagado de más<\/th>\s*<td class="num">-Q0\.50<\/td>/);
  assert.match(html, /<tr class="comp-pie-total">\s*<th scope="row" colspan="5">Total pagado<\/th>\s*<td class="num">Q1,199\.50<\/td>/);
  assert.match(html, /Nota: antes se le pagaron Q0\.50 de más\./);
  assert.match(html, /lo que se entregó con este comprobante fue Q1,199\.50\./);
});

test('si lo descontado es TODO lo que suman las rentas, el papel dice que no se entregó dinero; si sobra un centavo, lo entregado', () => {
  // `entregado > 0` / `descuento > 0 && entregado === 0`: «Forma de pago: Transferencia» sobre un pago de Q0.00 haría pensar
  // que sí se pagó.
  const todo = pagoConDescuento(300, 1);
  const mTodo = armar({ pago: todo.p2, contratos: todo.contratos, pagos: [todo.p2] });
  assert.equal(mTodo.pagado.entregado, 0);
  const htmlTodo = htmlComprobante(mTodo);
  assert.match(htmlTodo, /Forma de pago: <strong>Sin entrega de dinero<\/strong>/);
  assert.match(htmlTodo, /con este comprobante no se entregó dinero\./);
  assert.doesNotMatch(htmlTodo, /Transferencia/);

  const casi = pagoConDescuento(299.5, 1);
  const htmlCasi = htmlComprobante(armar({ pago: casi.p2, contratos: casi.contratos, pagos: [casi.p2] }));
  assert.match(htmlCasi, /lo que se entregó con este comprobante fue Q0\.50\./);
  assert.match(htmlCasi, /Forma de pago: <strong>Transferencia<\/strong>/);
});

test('el pago de una diferencia dice qué comprobantes completa y NO inventa un «de los cuales Q0.00»', () => {
  // `acumuladoDescuento > 0` -> `>= 0`: sin ningún descuento, la nota decía «de los cuales Q0.00 ya se le habían pagado de
  // más antes». Y con 3 comprobantes anteriores, la lista de números debe leerse «N° 1 (…), N° 2 (…) y N° 3 (…)».
  const numeros = [];
  const pagos = [];
  let contratos;
  const costoPorAtraso = (atraso) => cerrado('r1', atraso);
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [costoPorAtraso(0)], idsMarcados: ['r1'] });
  pagos.push(p1);
  numeros.push(1);
  for (let atraso = 1; atraso <= 3; atraso += 1) {
    contratos = [costoPorAtraso(atraso)];
    const [dif] = cuentaDeDueno({ contratos, pagos }).diferencias;
    assert.equal(dif.diferencia, 300, `el escenario: el atraso ${atraso} agrega Q300`);
    pagos.push(pagoReal({
      id: `p${atraso + 1}`, numero: atraso + 1, contratos, pagos, idsMarcados: [dif.clave],
    }));
    numeros.push(atraso + 1);
  }
  const ultimo = pagos.at(-1);
  const m = armar({ pago: ultimo, contratos, pagos });
  assert.deepEqual(m.pagado.anteriores.map((a) => a.numero), [1, 2, 3]);
  assert.equal(m.pagado.acumulado, 2100, 'Q1,200 + 3 × Q300: lo que el dueño del carro lleva recibido por esas rentas');
  const html = htmlComprobante(m);
  assert.match(html, /este pago completa los comprobantes N° 1 \(Q1,200\.00\), N° 2 \(Q300\.00\) y N° 3 \(Q300\.00\)\./);
  assert.match(html, /se le han pagado Q2,100\.00\.<\/p>/);
  assert.doesNotMatch(html, /de los cuales/);
});

test('reconoce «este» pago por su id aunque llegue una copia (no el mismo objeto): sigue siendo el complemento del anterior', () => {
  // `p === pago || (pago.id && p.id === pago.id)` -> `&&`: con una copia del pago, no lo encontraba en su grupo y lo imprimía
  // como un pago normal, sin decir que completa a otro, con un «acumulado» que no es el que él lleva recibido.
  const original = cerrado('r1', 1);
  const p7 = pagoReal({ id: 'p7', numero: 7, contratos: [original], idsMarcados: ['r1'] });
  const crecida = cerrado('r1', 3);
  const [dif] = cuentaDeDueno({ contratos: [crecida], pagos: [p7] }).diferencias;
  const p9 = pagoReal({
    id: 'p9', numero: 9, contratos: [crecida], pagos: [p7], idsMarcados: [dif.clave],
  });
  const copia = structuredClone(p9);
  assert.notEqual(copia, p9);
  const conLaLista = armar({ pago: copia, contratos: [crecida], pagos: [p7, p9] });
  assert.deepEqual(conLaLista.pagado.anteriores.map((a) => a.numero), [7]);
  assert.equal(conLaLista.pagado.acumulado, 2100);
  // Y si la lista de pagos ni siquiera trae este pago, se cuenta igual como pagado.
  const sinEl = armar({ pago: p9, contratos: [crecida], pagos: [p7] });
  assert.deepEqual(sinEl.pagado.anteriores.map((a) => a.numero), [7]);
  assert.equal(sinEl.pagado.acumulado, 2100);
});

test('con una renta cuyo costo no se pudo leer entre varias, el papel NO dice que «el detalle ya no suma»', () => {
  // `!filasPagadas.some(sinCosto === 'leer')` -> `every`: con una sola renta sin leer, se comparaba contra un 0 inventado y el
  // papel decía que las rentas «cambiaron después del pago» sin que haya cambiado nada.
  const c1 = cerrado('r1');
  const c2 = cerrado('r2');
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c1, c2], idsMarcados: ['r1', 'r2'] });
  const m = armar({ pago: p1, contratos: [c1, sinCostoLeido('r2')], pagos: [p1], costoSinLeer: ['r2'] });
  assert.equal(m.pagado.cambiaron, false);
  assert.equal(m.rentasSinCosto.leer, 1);
  const sinLeer = m.pagado.filas.find((f) => f.sinCosto === 'leer');
  assert.deepEqual([sinLeer.monto, sinLeer.costoDia], [null, null], 'la cifra que falta no se imprime como Q0.00');
  assert.doesNotMatch(htmlComprobante(m), /cambiaron después del pago/);
  // Con los dos costos leídos y de verdad cambiados, sí lo dice.
  const mcambio = armar({ pago: p1, contratos: [c1, cerrado('r2', 0, { dias: 2 })], pagos: [p1] });
  assert.equal(mcambio.pagado.cambiaron, true);
});

test('una diferencia donde SOLO UNA de las rentas no tiene costo anotado se imprime sin cifra, y el total no se da', () => {
  // `d.contratos.some(sinAnotar)` -> `every` / siempre null: la fila de la diferencia salía con una cifra armada sobre un costo
  // que nadie escribió, y el papel firmaba «te debo Q3,600» sobre un dato que falta.
  const c1 = cerrado('r1');
  const c2 = cerrado('r2');
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c1, c2], idsMarcados: ['r1', 'r2'] });
  const sinCosto = cerrado('r2', 0, { costoDia: 0 });
  const crecida = cerrado('r1', 8);
  const contratos = [crecida, sinCosto];
  const cuenta = cuentaDeDueno({ contratos, pagos: [p1] });
  assert.equal(cuenta.diferencias.length, 1, 'el escenario: una diferencia con una renta sin costo anotado');
  const m = armar({ pago: p1, contratos, pagos: [p1] });
  const [dif] = m.pendiente.diferencias;
  assert.equal(dif.sinCosto, 'anotar');
  assert.deepEqual([dif.ahora, dif.monto], [null, null]);
  assert.equal(m.pendiente.incompleto, true);
  assert.equal(m.pendiente.total, null);
  const html = htmlComprobante(m);
  assert.match(html, /No se puede dar el total: falta el costo de 1 renta\./, 'la de la diferencia');
  assert.doesNotMatch(html, /hoy esas rentas suman/, 'ni la frase con la cifra inventada');
  assert.match(html, /Diferencia de rentas ya pagadas en el comprobante N° 1[^<]*<span class="comp-falta">Sin costo anotado<\/span><\/td>\s*<td class="num">—<\/td>/, 'y su monto es una raya, no Q0.00');
  assert.equal(m.rentasSinCosto.anotar, 2, 'la renta pagada sin costo y la diferencia');
});

test('el papel dice «1 renta» o «N rentas» según sean, nunca «1 rentas»', () => {
  const c1 = cerrado('r1');
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: [c1], idsMarcados: ['r1'] });
  const sinCosto = (...ids) => ids.map((id) => cerrado(id, 0, { costoDia: 0 }));
  const unaSola = armar({ pago: p1, contratos: [c1, ...sinCosto('r2')], pagos: [p1] });
  assert.match(htmlComprobante(unaSola), /falta el costo de 1 renta\./);
  const dos = armar({ pago: p1, contratos: [c1, ...sinCosto('r2', 'r3')], pagos: [p1] });
  assert.match(htmlComprobante(dos), /falta el costo de 2 rentas\./);
});

test('las filas salen por fecha de salida y, a igual fecha, por placas — llegue como llegue la lista', () => {
  const salidas = [['rA', '2026-09-05', 'P-9AAA'], ['rB', '2026-09-01', 'P-8BBB'], ['rC', '2026-09-01', 'P-1CCC'], ['rD', '2026-09-01', 'P-5DDD']];
  const rentas = salidas.map(([id, fechaSalida, placas]) => {
    const c = cerrado(id, 0, { fechaSalida });
    return { ...c, carroPlacas: placas, carroAjeno: { ...c.carroAjeno, placas } };
  });
  const p1 = pagoReal({ id: 'p1', numero: 1, contratos: rentas, idsMarcados: salidas.map(([id]) => id) });
  for (const lista of [rentas, [...rentas].reverse(), [rentas[2], rentas[0], rentas[3], rentas[1]]]) {
    const m = armar({ pago: p1, contratos: lista, pagos: [p1] });
    assert.deepEqual(m.pagado.filas.map((f) => f.placas), ['P-1CCC', 'P-5DDD', 'P-8BBB', 'P-9AAA']);
  }
});

test('textoDeForma: las conocidas con su nombre, las demás con mayúscula inicial, y vacío es «No anotada»', () => {
  assert.equal(textoDeForma('transferencia'), 'Transferencia');
  assert.equal(textoDeForma('EFECTIVO'), 'Efectivo');
  assert.equal(textoDeForma('deposito'), 'Deposito');
  assert.equal(textoDeForma('tarjeta'), 'Tarjeta');
  assert.equal(textoDeForma(''), 'No anotada');
  assert.equal(textoDeForma('   '), 'No anotada');
  assert.equal(textoDeForma(undefined), 'No anotada');
});

test('imprimirConTitulo: pone el título del comprobante mientras imprime y lo devuelve al terminar; sin navegador, solo imprime', () => {
  const antes = { document: globalThis.document, window: globalThis.window };
  try {
    // Sin navegador.
    delete globalThis.document;
    delete globalThis.window;
    let imprimio = 0;
    imprimirConTitulo('Comprobante 7', () => { imprimio += 1; });
    assert.equal(imprimio, 1);

    // Con documento pero sin ventana tampoco hay a qué engancharse: imprime y ya.
    globalThis.document = { title: 'Best Price — Contratos' };
    imprimirConTitulo('Comprobante 7', () => { imprimio += 1; });
    assert.equal(imprimio, 2);
    assert.equal(globalThis.document.title, 'Best Price — Contratos');
    delete globalThis.document;

    // Con los dos.
    const escuchas = new Map();
    globalThis.document = { title: 'Best Price — Contratos' };
    globalThis.window = {
      addEventListener: (nombre, f) => escuchas.set(nombre, f),
      removeEventListener: (nombre, f) => { if (escuchas.get(nombre) === f) escuchas.delete(nombre); },
    };
    let tituloAlImprimir = null;
    imprimirConTitulo('Comprobante 7 - Mario López', () => { imprimio += 1; tituloAlImprimir = globalThis.document.title; });
    assert.equal(imprimio, 3, 'imprimió');
    assert.equal(tituloAlImprimir, 'Comprobante 7 - Mario López', 'con el título del comprobante: es el nombre con que se propone guardar el PDF');
    assert.equal(escuchas.has('afterprint'), true, 'quedó esperando a que termine de imprimir');
    escuchas.get('afterprint')();
    assert.equal(globalThis.document.title, 'Best Price — Contratos', 'devolvió el título de antes');
    assert.equal(escuchas.has('afterprint'), false, 'y se quitó a sí mismo');
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
  }
});
