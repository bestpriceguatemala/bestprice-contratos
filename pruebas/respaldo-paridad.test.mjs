// Que la hoja y el sistema digan lo mismo: las cifras de un contrato en el archivo contra `resumen()`.
//
// Las pruebas de respaldo-excel.test.mjs miran DÓNDE cae cada dato. Esta mira que lo escrito, pasado por las fórmulas de
// SU hoja, dé la cifra que el sistema muestra. En Excel de verdad se comprobó a mano (ver el informe); aquí se repite
// sin Excel: las fórmulas de la plantilla se fijan por su texto (si él cambia una, esta prueba lo dice) y se evalúan
// con una réplica mínima. Es una prueba, no una regla del sistema: el respaldo NO calcula nada de esto.
//
// Lo que se afirma:
//   - donde la hoja suma todo lo que el sistema cobra, el TOTAL COBRADO de la hoja ES la cifra del sistema;
//   - donde no (hora tardía, varios de la devolución, recargo de tarjeta repartido), la hoja sale corta EXACTAMENTE por lo
//     que el COMENTARIO de ese contrato dice que falta, ni un quetzal más ni menos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { armarRespaldo } from '../js/respaldo/excel.js';
import { resumen } from '../js/nucleo/contrato.js';
import { q, conTarjeta } from '../js/nucleo/dinero.js';
import { abrirLibro, leerPlantilla } from './fixtures/leerLibro.mjs';
import * as F from './fixtures/datosParaRespaldo.mjs';

const FORMULAS_DE_SU_HOJA = {
  BI: 'IF(OR($BH6="",$I6=""),"",$BH6-$I6)',
  BJ: 'IF(OR($BG6="",$H6=""),"",MAX(0,$BG6-$H6))',
  BK: 'IF($A6="","",N($BJ6)*N($J6))',
  BL: 'IF($A6="","",(N($AM6)+N($AS6))*(N($G6)+N($BJ6))+N($AP6))',
  BN: 'IF($A6="","",N($AO6))',
  BP: 'IF($A6="","",N($AR6))',
  BQ: 'IF($A6="","",N($K6)+N($BK6)+N($BL6)+N($BM6)+N($BN6)+N($BO6)+N($BP6))',
  BT: 'IF($A6="","",ROUND((N($BQ6)-N($BR6))*(1+N($BS6)/100),2))',
  BU: 'IF($A6="","",N($BD6))',
  BV: 'IF($A6="","",N($BU6)*(N($G6)+N($BJ6)))',
  BW: 'IF($A6="","",N($BT6)-N($BV6))',
};

const N = (v) => (typeof v === 'number' ? v : 0);

/** Las fórmulas de su hoja, evaluadas sobre lo que el respaldo escribió en una fila. */
function laHojaCalcula(v) {
  const BJ = v.BG === null || v.H === null ? 0 : Math.max(0, v.BG - v.H);
  const BK = N(BJ) * N(v.J);
  const BL = (N(v.AM) + N(v.AS)) * (N(v.G) + N(BJ)) + N(v.AP);
  const BQ = N(v.K) + BK + BL + N(v.BM) + N(v.AO) + N(v.BO) + N(v.AR);
  const BT = Math.round((BQ - N(v.BR)) * (1 + N(v.BS) / 100) * 100) / 100;
  const BV = N(v.BD) * (N(v.G) + BJ);
  return { BQ: q(BQ), BT: q(BT), BV: q(BV), BW: q(BT - BV) };
}

let cache;
async function archivo() {
  if (!cache) {
    const r = await armarRespaldo({
      plantilla: leerPlantilla(), anio: 2026, hoy: '2026-10-14', clientes: F.clientes(), vehiculos: F.vehiculos(), contratos: F.contratosDe2026(), pagosDueno: F.pagosDueno(),
    });
    cache = await abrirLibro(r.bytes);
  }
  return cache;
}

const COLUMNAS = ['G', 'H', 'J', 'K', 'AM', 'AO', 'AP', 'AR', 'AS', 'BD', 'BG', 'BM', 'BO', 'BR', 'BS'];
async function filaDe(libro, fila) {
  const t = libro.textos('CONTRATOS', COLUMNAS.map((c) => `${c}${fila}`));
  return Object.fromEntries(COLUMNAS.map((c) => [c, t[`${c}${fila}`] === null ? null : Number(t[`${c}${fila}`])]));
}

test('las fórmulas de su hoja son las que esta prueba evalúa: si él cambia una, esta prueba lo dice', async () => {
  const libro = await archivo();
  for (const [col, texto] of Object.entries(FORMULAS_DE_SU_HOJA)) {
    const hallada = new RegExp(`<c r="${col}6"[^>]*><f[^>]*>([^<]*)</f>`).exec(libro.xml('CONTRATOS'))?.[1];
    assert.equal(hallada?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<'), texto, col);
  }
});

// fila → contrato (ver respaldo-excel.test.mjs): 101→6, 102→7, 103→8, 104→9, 105→10, 106→11, 107→12, 108→13
const CASOS = [
  [101, 6, 'rentado al día'], [102, 7, 'con de todo'], [103, 8, 'pagado con tarjeta'], [104, 9, 'carro ajeno'], [105, 10, 'carro ajeno sin pagar'], [108, 13, 'devuelto con saldo'],
];
const contratoDe = (numero) => F.contratosDe2026().find((c) => c.numero === numero);

for (const [numero, fila, que] of CASOS) {
  test(`contrato ${numero} (${que}): el TOTAL COBRADO de la hoja es la cifra que muestra el sistema`, async () => {
    const libro = await archivo();
    const c = contratoDe(numero);
    const { subtotal, costoSubarriendo } = resumen(c);
    const hoja = laHojaCalcula(await filaDe(libro, fila));
    const pct = Number((await filaDe(libro, fila)).BS ?? 0);
    // La hoja aplica UN porcentaje de tarjeta al total; el sistema lo aplica a cada pago. Cuando todo se paga con tarjeta coinciden.
    assert.equal(hoja.BT, pct ? conTarjeta(subtotal, pct) : subtotal);
    assert.equal(hoja.BV, costoSubarriendo, 'el costo del subarriendo');
  });
}

test('contrato 104 y 105 (carro ajeno, pagado completo): la UTILIDAD de la hoja es la del sistema', async () => {
  const libro = await archivo();
  for (const [numero, fila] of [[104, 9], [105, 10]]) {
    assert.equal(laHojaCalcula(await filaDe(libro, fila)).BW, resumen(contratoDe(numero)).utilidad, `contrato ${numero}`);
  }
});

test('contrato 102: cada pedazo del cobro (atraso, seguros extra, daños, carta poder, combustible, varios, descuento) llega a la hoja', async () => {
  const libro = await archivo();
  const hoja = laHojaCalcula(await filaDe(libro, 7));
  // 2,800 renta + 700 atraso + 350 seguros + 200 daños + 350 carta poder + 80 combustible + 75 varios − 100 descuento.
  assert.equal(hoja.BQ, 4555);
  assert.equal(hoja.BT, 4455);
});

test('contrato 106 (hora tardía y varios al recibir): la hoja sale corta EXACTAMENTE por lo que el COMENTARIO dice que falta', async () => {
  const libro = await archivo();
  const sistema = resumen(contratoDe(106)).subtotal;
  const hoja = laHojaCalcula(await filaDe(libro, 11));
  assert.equal(sistema - hoja.BT, 200);
  const notas = libro.texto('CONTRATOS', 'CA11');
  assert.match(notas, /sale Q200\.00 menos que el del sistema \(Q1,600\.00\)/);
});

test('contrato 107 (pagó en efectivo y con tarjeta): la hoja sale corta por el recargo, y el COMENTARIO lo dice', async () => {
  const libro = await archivo();
  const c = contratoDe(107);
  const hoja = laHojaCalcula(await filaDe(libro, 12));
  assert.equal(hoja.BT, resumen(c).subtotal);
  assert.equal(resumen(c).pagado - hoja.BT, 20, 'el sistema cobró Q20.00 de recargo sobre la parte con tarjeta');
  assert.match(libro.texto('CONTRATOS', 'CA12'), /sale Q20\.00 menos que el del sistema \(Q1,420\.00\)/);
});

test('el faltante que dice el COMENTARIO es el de cada contrato: nunca más ni menos que lo que la hoja deja sin sumar', async () => {
  const libro = await archivo();
  for (const [numero, fila] of [[101, 6], [102, 7], [103, 8], [104, 9], [105, 10], [106, 11], [107, 12], [108, 13]]) {
    const c = contratoDe(numero);
    const hoja = laHojaCalcula(await filaDe(libro, fila));
    const sistema = resumen(c).totalCobrado;
    const completo = resumen(c).saldo === 0 ? sistema : resumen(c).subtotal;
    const dicho = /sale (Q[\d,]+\.\d\d) menos/.exec(libro.texto('CONTRATOS', `CA${fila}`) ?? '')?.[1];
    const faltaDeVerdad = q(completo - hoja.BT);
    assert.equal(dicho ?? 'Q0.00', `Q${faltaDeVerdad.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`, `contrato ${numero}`);
  }
});
