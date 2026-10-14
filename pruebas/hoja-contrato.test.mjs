// Pruebas de la hoja del contrato sobre el papel preimpreso (nucleo/hojaContrato.js, §8 del diseño).
//
// QUÉ CUBREN Y QUÉ NO. Esto prueba las cuentas: de dónde sale cada milímetro (la cuadrícula contra lo que Excel
// imprimió de verdad), cómo se escriben las fechas, cómo se corre toda la hoja y cómo se guarda ese ajuste. NO
// prueba que un papel salga alineado con el formulario del dueño: eso solo se ve con una impresora y el papel
// delante. Lo que sí puede probar es la mitad que se puede equivocar en silencio: que la copia de la cuadrícula que
// usa el sistema siga siendo la que se midió, y que cada campo caiga donde Excel dibuja su casilla.
//
// Los números de comparación no salen de este código: son las líneas y los recortes de texto que Excel dejó en el
// PDF (analisis/imp-contrato/*.json, medidos con medir_cuadricula.py y medir_texto.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAPEL, ESCALA_EXCEL, MM_POR_UNIDAD, ORIGEN_MM, ANCHOS, ALTOS, HOJA_UNIDADES, HOJA_MM, CAMPOS,
  cajaDeRango, campoPorId, camposQueSeImprimen, fechaParaPapel, textoSeSale,
  ESCALA_QUE_CABE, CALIBRACION_DE_FABRICA, LIMITES, PASOS, calibracionValida, limitar, aplicarTecla,
  cajaEnPapel, transformacionCss, textoDeCalibracion, TARIFAS_DEL_PAPEL, camposFueraDeLaCarta,
  CLAVE_DE_CALIBRACIONES, leerCalibraciones, guardarCalibracion, calibracionActiva,
} from '../js/nucleo/hojaContrato.js';

const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const cuadricula = leerJson('../analisis/imp-contrato/cuadricula.json');
const textoMedido = leerJson('../analisis/imp-contrato/texto-medido.json');

const cerca = (real, esperado, tolerancia, mensaje) => assert.ok(
  Math.abs(real - esperado) <= tolerancia,
  `${mensaje ?? ''} esperaba ${esperado} ± ${tolerancia} y salió ${real}`,
);

// ---------------------------------------------------------------------------
// La cuadrícula: la copia del sistema contra lo que Excel imprimió.
// ---------------------------------------------------------------------------

test('ANCHOS y ALTOS son exactamente los de analisis/imp-contrato/cuadricula.json', () => {
  assert.deepEqual(ANCHOS, cuadricula.anchosUnidades, 'ancho de cada columna');
  const altos = Object.fromEntries(Object.entries(cuadricula.alturasUnidades).map(([fila, alto]) => [Number(fila), alto]));
  assert.deepEqual(ALTOS, altos, 'alto de cada fila');
});

test('la escala, el origen y los milímetros por unidad son los medidos', () => {
  assert.equal(ESCALA_EXCEL, cuadricula.escala);
  assert.deepEqual(ORIGEN_MM, cuadricula.origenPapelMm);
  cerca(MM_POR_UNIDAD, cuadricula.mmPorUnidad, 0.00001, 'mm por unidad');
  // 0.89 de escala, 72 puntos la pulgada, 25.4 mm la pulgada: la cuenta a mano, no la del código.
  cerca(MM_POR_UNIDAD, 0.314, 0.0005, 'mm por unidad, a mano');
});

test('la cuadrícula sale de las líneas que Excel dibujó, no de una copia a mano', () => {
  // Las líneas del PDF, en puntos. Una unidad son 0.89 puntos: el ancho de cada columna es la distancia entre dos
  // líneas verticales y el alto de cada fila, la que hay entre dos horizontales.
  const { pagina1, pagina2 } = cuadricula.lineasMedidasPt;
  const unidades = (a, b) => Math.round(Math.abs(b - a) / cuadricula.escala);

  // Página 1: A–V (M está oculta y no deja línea). Página 2: W–Z.
  const columnas1 = 'ABCDEFGHIJKLNOPQRSTUV'.split('');
  assert.equal(pagina1.v.length, columnas1.length + 1);
  columnas1.forEach((col, i) => assert.equal(ANCHOS[col], unidades(pagina1.v[i], pagina1.v[i + 1]), `columna ${col}`));
  const columnas2 = 'WXYZ'.split('');
  assert.equal(pagina2.v.length, columnas2.length + 1);
  columnas2.forEach((col, i) => assert.equal(ANCHOS[col], unidades(pagina2.v[i], pagina2.v[i + 1]), `columna ${col}`));

  // Filas: las 4 ocultas (18, 52, 54, 55) no dejan línea.
  const visibles = Array.from({ length: 60 }, (_v, i) => i + 1).filter((f) => ![18, 52, 54, 55].includes(f));
  assert.equal(pagina1.h.length, visibles.length + 1);
  visibles.forEach((fila, i) => assert.equal(ALTOS[fila], unidades(pagina1.h[i], pagina1.h[i + 1]), `fila ${fila}`));
});

test('la columna M y las filas 18, 52, 54 y 55 están ocultas y valen 0', () => {
  assert.equal(ANCHOS.M, 0);
  for (const fila of [18, 52, 54, 55]) assert.equal(ALTOS[fila], 0, `fila ${fila}`);
  // y ninguna otra vale 0
  assert.deepEqual(Object.entries(ANCHOS).filter(([, v]) => v === 0).map(([k]) => k), ['M']);
  assert.deepEqual(Object.entries(ALTOS).filter(([, v]) => v === 0).map(([k]) => Number(k)), [18, 52, 54, 55]);
});

test('el papel es la carta: 8.5 × 11 pulgadas', () => {
  cerca(PAPEL.anchoMm, 8.5 * 25.4, 0.001);
  cerca(PAPEL.altoMm, 11 * 25.4, 0.001);
});

test('la hoja entera mide 797 × 749 unidades: 250 × 235 mm, más de lo que cabe en una carta', () => {
  assert.deepEqual(HOJA_UNIDADES, { ancho: 797, alto: 749 });
  cerca(HOJA_MM.ancho, 250.24, 0.01, 'ancho');
  cerca(HOJA_MM.alto, 235.17, 0.01, 'alto');
  // Es el hallazgo que decide todo lo demás: a tamaño de Excel el ancho no cabe en la carta entre los márgenes que él puso.
  assert.ok(HOJA_MM.ancho > PAPEL.anchoMm - ORIGEN_MM.x - 5);
});

// ---------------------------------------------------------------------------
// cajaDeRango
// ---------------------------------------------------------------------------

test('cajaDeRango: una celda sola', () => {
  assert.deepEqual(cajaDeRango('A1'), { x: 0, y: 0, ancho: 10.36, alto: 3.77 });
  // Z60: la última; su borde derecho y su borde de abajo son los de la hoja entera.
  const z60 = cajaDeRango('Z60');
  cerca(z60.x + z60.ancho, HOJA_MM.ancho, 0.01, 'borde derecho de Z60');
  cerca(z60.y + z60.alto, HOJA_MM.alto, 0.01, 'borde de abajo de Z60');
});

test('cajaDeRango: un rango combinado', () => {
  // N4:Q5. A mano: N empieza tras 386 unidades (A–L; M está oculta) y Q termina en 494; la fila 4 empieza tras
  // 12 + 15 + 16 = 43 unidades y las filas 4 y 5 suman 17 + 15 = 32.
  const n4q5 = cajaDeRango('N4:Q5');
  cerca(n4q5.x, 386 * 0.314, 0.06);
  cerca(n4q5.ancho, (494 - 386) * 0.314, 0.06);
  cerca(n4q5.y, 43 * 0.314, 0.03);
  cerca(n4q5.alto, 32 * 0.314, 0.03);
  assert.deepEqual(n4q5, { x: 121.19, y: 13.5, ancho: 33.91, alto: 10.05 });
});

test('cajaDeRango: un rango que cruza la columna oculta M no la cuenta', () => {
  // A10:M10 mide lo mismo que A10:L10 (M no tiene ancho)
  assert.deepEqual(cajaDeRango('A10:M10'), cajaDeRango('A10:L10'));
  // y L10:N10 es L, nada y N
  const l10n10 = cajaDeRango('L10:N10');
  cerca(l10n10.ancho, (20 + 0 + 21) * MM_POR_UNIDAD, 0.01);
});

test('cajaDeRango: una columna o una fila oculta SOLA no tiene caja y lanza', () => {
  assert.throws(() => cajaDeRango('M10'), /vacío/);
  assert.throws(() => cajaDeRango('A18'), /vacío/);
  assert.throws(() => cajaDeRango('A52'), /vacío/);
});

test('cajaDeRango: un rango escrito al revés lanza, no da una caja de ancho negativo', () => {
  assert.throws(() => cajaDeRango('Q5:N4'), /al revés/);
  assert.throws(() => cajaDeRango('Q4:N4'), /al revés/);
  assert.throws(() => cajaDeRango('N5:N4'), /al revés/);
});

test('cajaDeRango: una columna o una fila que no existe en la hoja lanza', () => {
  assert.throws(() => cajaDeRango('AA1'), /Columna desconocida: AA/);
  assert.throws(() => cajaDeRango('A61'), /Fila desconocida: 61/);
  assert.throws(() => cajaDeRango('A0'), /Fila desconocida: 0/);
  assert.throws(() => cajaDeRango('A1:AA2'), /Columna desconocida/);
});

test('cajaDeRango: lo que no es un rango lanza con un mensaje en español', () => {
  for (const malo of ['', undefined, null, 'a1', 'N4:', ':Q5', 'N4:Q5:R6', 'N', '4', 'N 4', 'N4-Q5', 42, {}]) {
    assert.throws(() => cajaDeRango(malo), /Rango de celdas inválido/, `«${String(malo)}»`);
  }
});

// ---------------------------------------------------------------------------
// La tabla de campos contra lo que Excel imprimió
// ---------------------------------------------------------------------------

test('cada campo cae donde Excel recorta su texto (62 celdas medidas en el PDF)', () => {
  // Excel recorta el texto a su casilla, una unidad adentro por la izquierda y por arriba (el grosor de la línea).
  // El borde derecho y el de abajo coinciden con los de la casilla. Estos recortes salen del PDF, no de este código.
  const u = MM_POR_UNIDAD;
  let comparados = 0;
  for (const campo of CAMPOS) {
    const medido = textoMedido[campo.rango.split(':')[0]];
    if (!medido) continue; // los textos fijos de Excel no son fórmulas y no se marcaron en el PDF
    const caja = cajaDeRango(campo.rango);
    const m = medido.casillaMm;
    cerca(m.x - caja.x, u, 0.05, `${campo.id}: borde izquierdo`);
    cerca(m.y - caja.y, u, 0.05, `${campo.id}: borde de arriba`);
    cerca((m.x + m.ancho) - (caja.x + caja.ancho), 0, 0.05, `${campo.id}: borde derecho`);
    cerca((m.y + m.alto) - (caja.y + caja.alto), 0, 0.05, `${campo.id}: borde de abajo`);
    comparados += 1;
  }
  assert.ok(comparados >= 60, `solo se compararon ${comparados} campos`);
});

test('el tamaño de letra de cada campo es el que Excel imprime (su tamaño por 0.89)', () => {
  for (const campo of CAMPOS) {
    const medido = textoMedido[campo.rango.split(':')[0]];
    if (!medido) continue;
    cerca(campo.pt * ESCALA_EXCEL, medido.pt, 0.02, `${campo.id}: puntos`);
  }
});

test('los campos de letra BLANCA en Excel son exactamente los que lo dicen, y todos se imprimen por decisión del dueño', () => {
  const blancasEnExcel = new Set(Object.entries(textoMedido).filter(([, v]) => v.blanca).map(([celda]) => celda));
  assert.equal(blancasEnExcel.size, 11, 'Excel imprime 11 celdas en blanco, no más');
  const marcadas = CAMPOS.filter((c) => c.blancaEnExcel);
  const celdasMarcadas = new Set(marcadas.map((c) => c.rango.split(':')[0]));
  for (const celda of celdasMarcadas) assert.ok(blancasEnExcel.has(celda), `${celda} está marcada como blanca pero Excel la imprime visible`);
  // Las dos blancas que NO están en la tabla, y por qué: E27 es la ciudad adicional (el dueño dijo el 3 de octubre que la
  // segunda dirección no se imprime) e I27 es un 0 fijo que no significa nada.
  const faltan = [...blancasEnExcel].filter((celda) => !celdasMarcadas.has(celda)).sort();
  assert.deepEqual(faltan, ['E27', 'I27']);
  assert.equal(marcadas.length, 9);
  for (const c of marcadas) {
    assert.notEqual(c.imprime, false, `${c.id}: el dueño decidió que se imprima`);
    // la decisión queda escrita donde se lee, con su fecha: «¿por qué sale el kilometraje aquí?» tiene respuesta en el código
    assert.match(c.nota, /14 de octubre de 2026/, c.id);
    assert.match(c.nota, /NO se veía en el papel que firma el cliente/, c.id);
  }
  assert.deepEqual(marcadas.map((c) => c.id).sort(), [
    'conductorNombre', 'deducibleBajo', 'kmSalida', 'licenciaExpira', 'seguroMenores', 'seguroPai', 'tarjeta2Autorizacion',
    'variosDescripcion', 'variosPrecio',
  ]);
});

test('los diez rótulos de Excel (ocho textos distintos: «EXPIRA:» y «CODIGO CBC» van dos veces) se imprimen, con su razón escrita', () => {
  const esperado = {
    etiquetaAcepto: 'ACEPTO LOS CARGOS A MI TARJETA NUMERO',
    etiquetaCodigo: 'CODIGO',
    etiquetaTarjeta1: 'TARJETA 1  No:',
    etiquetaExpira1: 'EXPIRA:',
    etiquetaExpira2: 'EXPIRA:',
    etiquetaCbc1: 'CODIGO CBC',
    etiquetaCbc2: 'CODIGO CBC',
    etiquetaBanco: 'BANCO EMISOR',
    departamento: 'GUATEMALA',
    deducibleIva: ' + iva',
  };
  const rotulos = CAMPOS.filter((c) => c.tipo === 'etiqueta');
  assert.deepEqual(Object.fromEntries(rotulos.map((c) => [c.id, c.texto])), esperado);
  assert.equal(new Set(Object.values(esperado)).size, 8);
  assert.equal(rotulos.length, 10);
  for (const c of rotulos) {
    assert.notEqual(c.imprime, false, `${c.id} se imprime`);
    assert.equal(c.de, null, `${c.id}: es un texto fijo, no viene de ningún dato`);
    assert.match(c.nota, /14 de octubre de 2026/);
    assert.match(c.nota, /su papel NO trae este texto/, 'la razón es lo que dijo el dueño, no una suposición');
  }
  // los espacios de Excel se conservan: dos en «TARJETA 1  No:» y uno delante de « + iva»
  assert.ok(campoPorId('etiquetaTarjeta1').texto.includes('1  No'));
  assert.ok(campoPorId('deducibleIva').texto.startsWith(' + '));
});

test('lo que el sistema no guarda: cada decisión del 14 de octubre de 2026 está en la tabla, con su razón', () => {
  // a quién se factura: se teclea al imprimir
  for (const id of ['facturarNombre', 'facturarNit']) {
    const c = campoPorId(id);
    assert.equal(c.tecleado, true, id);
    assert.match(c.de, /lo teclea en la pantalla de imprimir; no se guarda/, id);
    assert.match(c.nota, /14 de octubre de 2026/);
    assert.match(c.nota, /ADR-001/);
  }
  // el lugar de entrada y las dos tarifas: precargados y corregibles
  assert.match(campoPorId('lugarEntrada').de, /`lugar`.*precargado/);
  assert.match(campoPorId('horaTardia').de, /TARIFAS_DEL_PAPEL\.horaTardia` \(Q150/);
  assert.match(campoPorId('combustiblePrecio').de, /TARIFAS_DEL_PAPEL\.galon` \(Q65/);
  for (const id of ['lugarEntrada', 'horaTardia', 'combustiblePrecio']) assert.match(campoPorId(id).nota, /14 de octubre de 2026/, id);
  // el código del cliente se queda vacío, y lo dice
  const codigo = campoPorId('codigoCliente');
  assert.equal(codigo.de, null);
  assert.match(codigo.nota, /14 de octubre de 2026: se queda vacío/);
  // y son los únicos sin fuente, salvo el segundo apellido y el segundo nombre: el sistema los guarda juntos con el primero
  // (`apellidos`, `nombres`) y la ficha no los separa; el texto completo sale en la casilla del primero
  assert.deepEqual(CAMPOS.filter((c) => c.de === null && c.tipo !== 'etiqueta').map((c) => c.id).sort(), ['apellido2', 'codigoCliente', 'nombre2']);
  // tecleados: los dos de facturar y los dos CBC, y ningún otro
  assert.deepEqual(CAMPOS.filter((c) => c.tecleado).map((c) => c.id).sort(), ['facturarNit', 'facturarNombre', 'tarjeta1Cbc', 'tarjeta2Cbc']);
});

test('TARIFAS_DEL_PAPEL: la hora tardía a Q150 y el galón a Q65, las del Excel, y nadie las puede cambiar en pleno vuelo', () => {
  assert.deepEqual({ ...TARIFAS_DEL_PAPEL }, { horaTardia: 150, galon: 65 });
  assert.ok(Object.isFrozen(TARIFAS_DEL_PAPEL));
  assert.throws(() => { 'use strict'; TARIFAS_DEL_PAPEL.horaTardia = 1; }, TypeError);
});

test('CAMPOS: ids únicos, rangos válidos y dentro de la hoja', () => {
  const ids = CAMPOS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'un id repetido');
  for (const c of CAMPOS) {
    const caja = cajaDeRango(c.rango);
    assert.ok(caja.x >= 0 && caja.y >= 0, `${c.id}: empieza fuera de la hoja`);
    assert.ok(caja.x + caja.ancho <= HOJA_MM.ancho + 0.01, `${c.id}: se sale por la derecha`);
    assert.ok(caja.y + caja.alto <= HOJA_MM.alto + 0.01, `${c.id}: se sale por abajo`);
  }
});

test('CAMPOS: ningún par de campos comparte una celda', () => {
  const celdasDe = (rango) => {
    const [a, b = a] = rango.split(':');
    const [, c1, f1] = /^([A-Z]+)(\d+)$/.exec(a);
    const [, c2, f2] = /^([A-Z]+)(\d+)$/.exec(b);
    const celdas = [];
    for (let col = c1.charCodeAt(0); col <= c2.charCodeAt(0); col++) {
      for (let fila = Number(f1); fila <= Number(f2); fila++) celdas.push(`${String.fromCharCode(col)}${fila}`);
    }
    return celdas;
  };
  const dueno = new Map();
  for (const c of CAMPOS) {
    for (const celda of celdasDe(c.rango)) {
      assert.ok(!dueno.has(celda), `${celda} la usan ${dueno.get(celda)} y ${c.id}`);
      dueno.set(celda, c.id);
    }
  }
});

test('CAMPOS: cada uno trae lo que la hoja necesita para dibujarlo', () => {
  const FUENTES = ['arial', 'narrow'];
  const ALINEA = ['left', 'center', 'right', 'general'];
  const VALINEA = ['top', 'center', 'bottom'];
  const TIPOS = ['texto', 'dinero', 'dineroPlano', 'entero', 'fechaCorta', 'fechaLarga', 'fechaDoc', 'tarjeta', 'cbc', 'etiqueta'];
  for (const c of CAMPOS) {
    assert.ok(typeof c.etiqueta === 'string' && c.etiqueta, `${c.id}: sin etiqueta`);
    assert.ok(FUENTES.includes(c.fuente), `${c.id}: fuente ${c.fuente}`);
    assert.ok(ALINEA.includes(c.alinea), `${c.id}: alinea ${c.alinea}`);
    assert.ok(VALINEA.includes(c.valinea), `${c.id}: valinea ${c.valinea}`);
    assert.ok(TIPOS.includes(c.tipo), `${c.id}: tipo ${c.tipo}`);
    assert.ok(Number.isFinite(c.pt) && c.pt > 0, `${c.id}: pt`);
    assert.ok(c.de === null || (typeof c.de === 'string' && c.de), `${c.id}: «de» es un texto o null`);
    // un campo que el sistema no tiene dice por qué, y uno que no se imprime también
    if (c.de === null && c.tipo !== 'etiqueta') assert.ok(c.nota, `${c.id}: sin fuente y sin nota`);
    if (c.imprime === false) assert.ok(c.nota, `${c.id}: no se imprime y no dice por qué`);
    if (c.tipo === 'etiqueta') assert.ok(c.texto, `${c.id}: texto fijo sin texto`);
  }
});

test('campoPorId encuentra un campo y lanza con el id si no existe', () => {
  assert.equal(campoPorId('carroPlacas').rango, 'N8:Q9');
  assert.throws(() => campoPorId('placas'), /«placas»/);
  assert.throws(() => campoPorId(''), /No hay un campo/);
  assert.throws(() => campoPorId(undefined), /No hay un campo/);
  assert.throws(() => campoPorId('toString'), /No hay un campo/, 'un nombre del prototipo no es un campo');
});

test('camposQueSeImprimen: hoy se imprimen todos, y uno con imprime: false se deja fuera', () => {
  assert.equal(camposQueSeImprimen().length, CAMPOS.length, 'el dueño decidió imprimir todo lo que Excel imprime');
  assert.ok(CAMPOS.every((c) => c.imprime !== false));
  const campo = campoPorId('kmSalida');
  try {
    campo.imprime = false;
    const salen = camposQueSeImprimen();
    assert.equal(salen.length, CAMPOS.length - 1);
    assert.ok(!salen.includes(campo));
  } finally {
    delete campo.imprime;
  }
  assert.equal(camposQueSeImprimen().length, CAMPOS.length);
});

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

test('fechaParaPapel: formato corto (20-08-26)', () => {
  assert.equal(fechaParaPapel('2026-08-20', 'corta'), '20-08-26');
  assert.equal(fechaParaPapel('2026-01-05', 'corta'), '05-01-26');
  assert.equal(fechaParaPapel('2099-12-31', 'corta'), '31-12-99');
  assert.equal(fechaParaPapel('2000-02-29', 'corta'), '29-02-00');
});

test('fechaParaPapel: formato largo, con nueve espacios entre las casillas DD / MM / AAAA', () => {
  const texto = fechaParaPapel('1990-03-15', 'larga');
  assert.equal(texto, '15         03         1990');
  assert.match(texto, /^15 {9}03 {9}1990$/);
});

test('fechaParaPapel: formato de documento, con dos y cuatro espacios', () => {
  const texto = fechaParaPapel('2031-11-02', 'doc');
  assert.equal(texto, '02  11    31');
  assert.match(texto, /^02 {2}11 {4}31$/);
});

test('fechaParaPapel: lo vacío o imposible sale en blanco, nunca «NaN» ni «undefined»', () => {
  const malas = ['', undefined, null, '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2026-06-00', '20260820', '2026-8-2',
    '26-08-20', 'ayer', ' 2026-08-20', '2026-08-20 ', 12345, {}, [], true, '2023-02-29', '1900-02-29', '2100-02-29'];
  for (const mala of malas) {
    for (const formato of ['corta', 'larga', 'doc']) {
      assert.equal(fechaParaPapel(mala, formato), '', `${JSON.stringify(mala)} en ${formato}`);
    }
  }
  // los años bisiestos de verdad sí
  assert.equal(fechaParaPapel('2024-02-29', 'corta'), '29-02-24');
  assert.equal(fechaParaPapel('2000-02-29', 'corta'), '29-02-00');
});

test('fechaParaPapel: un formato que no existe lanza (no se imprime una fecha con otro formato)', () => {
  assert.throws(() => fechaParaPapel('2026-08-20', 'media'), /Formato de fecha desconocido: «media»/);
  assert.throws(() => fechaParaPapel('2026-08-20'), /Formato de fecha desconocido/);
});

test('fechaParaPapel no usa Date ni el reloj: un día de renta no se mueve por la zona horaria', () => {
  const FechaReal = globalThis.Date;
  globalThis.Date = new Proxy(FechaReal, {
    construct() { throw new Error('se usó new Date'); },
    get(objetivo, propiedad) {
      if (propiedad === 'now' || propiedad === 'UTC' || propiedad === 'parse') throw new Error(`se usó Date.${String(propiedad)}`);
      return objetivo[propiedad];
    },
  });
  try {
    assert.equal(fechaParaPapel('2026-03-08', 'corta'), '08-03-26');
    assert.equal(fechaParaPapel('2026-11-01', 'larga'), '01         11         2026');
    assert.equal(fechaParaPapel('2026-02-30', 'doc'), '');
  } finally {
    globalThis.Date = FechaReal;
  }
});

// ---------------------------------------------------------------------------
// ¿Cabe el texto en su casilla?
// ---------------------------------------------------------------------------

// Campos de juguete con su propio rango, para no depender de lo que diga la tabla real.
const sinAjuste = { rango: 'N8:Q9', pt: 12, fuente: 'arial', ajusta: false };   // 33.9 mm de ancho
const conAjuste = { rango: 'A25:L26', pt: 8, fuente: 'arial', ajusta: true };   // 120.9 × 5.0 mm

test('textoSeSale: vacío, en blanco o ausente nunca se sale', () => {
  for (const nada of ['', '   ', null, undefined]) assert.equal(textoSeSale(sinAjuste, nada), false, JSON.stringify(nada));
  // aunque sean muchos espacios: no hay nada que se salga
  assert.equal(textoSeSale(sinAjuste, ' '.repeat(60)), false);
  assert.equal(textoSeSale(conAjuste, '\n'.repeat(60)), false);
});

test('textoSeSale: sin ajuste, se sale cuando el largo pasa del ancho útil', () => {
  assert.equal(textoSeSale(sinAjuste, 'P-234IFN'), false);
  assert.equal(textoSeSale(sinAjuste, 'A'.repeat(15)), false);
  assert.equal(textoSeSale(sinAjuste, 'A'.repeat(16)), true);
});

test('textoSeSale: con ajuste baja de renglón y solo se sale si no caben los renglones de alto', () => {
  assert.equal(textoSeSale(conAjuste, 'x'.repeat(80)), false, 'un renglón cabe');
  assert.equal(textoSeSale(conAjuste, 'x'.repeat(150)), true, 'dos renglones no caben en 5 mm de alto');
});

test('textoSeSale: Arial Narrow gasta menos ancho que Arial', () => {
  const texto = 'A'.repeat(18);
  assert.equal(textoSeSale({ ...sinAjuste, fuente: 'arial' }, texto), true);
  assert.equal(textoSeSale({ ...sinAjuste, fuente: 'narrow' }, texto), false);
});

test('textoSeSale: un número o cualquier valor se mira como texto', () => {
  assert.equal(textoSeSale(sinAjuste, 12345), false);
  assert.equal(textoSeSale(sinAjuste, 'A'.repeat(40)), true);
});

// ---------------------------------------------------------------------------
// La calibración: un solo corrimiento y un tamaño para toda la hoja
// ---------------------------------------------------------------------------

const BASE = { dx: 0, dy: 0, escala: 1 };

test('ESCALA_QUE_CABE es la más grande, en centésimas, con la que la hoja cabe en la carta entre los márgenes de Excel', () => {
  const caben = (escala) => ORIGEN_MM.x + (escala * HOJA_MM.ancho) + 5 <= PAPEL.anchoMm;
  assert.equal(caben(ESCALA_QUE_CABE), true);
  assert.equal(caben(ESCALA_QUE_CABE + 0.01), false, 'una centésima más ya no cabe');
  assert.deepEqual({ ...CALIBRACION_DE_FABRICA }, { dx: 0, dy: 0, escala: ESCALA_QUE_CABE });
  assert.ok(Object.isFrozen(CALIBRACION_DE_FABRICA), 'nadie puede cambiar la de fábrica por descuido');
  assert.ok(calibracionValida(CALIBRACION_DE_FABRICA));
});

test('calibracionValida: tres números dentro de lo posible, con los extremos incluidos', () => {
  assert.equal(calibracionValida(BASE), true);
  assert.equal(calibracionValida({ dx: 40, dy: -40, escala: 1.2 }), true);
  assert.equal(calibracionValida({ dx: -40, dy: 40, escala: 0.5 }), true);
  assert.equal(calibracionValida({ dx: 40.001, dy: 0, escala: 1 }), false);
  assert.equal(calibracionValida({ dx: 0, dy: -40.001, escala: 1 }), false);
  assert.equal(calibracionValida({ dx: 0, dy: 0, escala: 1.201 }), false);
  assert.equal(calibracionValida({ dx: 0, dy: 0, escala: 0.499 }), false);
  for (const mala of [null, undefined, 'x', 7, [], {}, { dx: 0, dy: 0 }, { dx: '1', dy: 0, escala: 1 },
    { dx: NaN, dy: 0, escala: 1 }, { dx: 0, dy: Infinity, escala: 1 }, { dx: 0, dy: 0, escala: null }]) {
    assert.equal(calibracionValida(mala), false, JSON.stringify(mala));
  }
});

test('aplicarTecla: las flechas mueven la hoja medio milímetro; ← y ↑ son negativos', () => {
  assert.deepEqual(aplicarTecla(BASE, { key: 'ArrowRight' }), { dx: 0.5, dy: 0, escala: 1 });
  assert.deepEqual(aplicarTecla(BASE, { key: 'ArrowLeft' }), { dx: -0.5, dy: 0, escala: 1 });
  assert.deepEqual(aplicarTecla(BASE, { key: 'ArrowDown' }), { dx: 0, dy: 0.5, escala: 1 });
  assert.deepEqual(aplicarTecla(BASE, { key: 'ArrowUp' }), { dx: 0, dy: -0.5, escala: 1 });
});

test('aplicarTecla: Shift es fino (0.1 mm), Ctrl o Cmd es grueso (5 mm), y Shift gana si vienen los dos', () => {
  assert.equal(aplicarTecla(BASE, { key: 'ArrowRight', shiftKey: true }).dx, 0.1);
  assert.equal(aplicarTecla(BASE, { key: 'ArrowRight', ctrlKey: true }).dx, 5);
  assert.equal(aplicarTecla(BASE, { key: 'ArrowRight', metaKey: true }).dx, 5);
  assert.equal(aplicarTecla(BASE, { key: 'ArrowRight', shiftKey: true, ctrlKey: true }).dx, 0.1);
  assert.deepEqual(PASOS.normal, { mm: 0.5, escala: 0.005 });
});

test('aplicarTecla: + y − (y = y _, que es lo que dan con Shift) cambian el tamaño', () => {
  assert.equal(aplicarTecla(BASE, { key: '+' }).escala, 1.005);
  assert.equal(aplicarTecla(BASE, { key: '=' }).escala, 1.005);
  assert.equal(aplicarTecla(BASE, { key: '-' }).escala, 0.995);
  assert.equal(aplicarTecla(BASE, { key: '_' }).escala, 0.995);
  assert.equal(aplicarTecla(BASE, { key: '+', shiftKey: true }).escala, 1.001);
  assert.equal(aplicarTecla(BASE, { key: '+', ctrlKey: true }).escala, 1.05);
  // el tamaño no mueve la hoja y la flecha no cambia el tamaño
  assert.equal(aplicarTecla(BASE, { key: '+' }).dx, 0);
  assert.equal(aplicarTecla(BASE, { key: 'ArrowRight' }).escala, 1);
});

test('aplicarTecla: una tecla que no es de calibrar devuelve null (la pantalla no se traga teclas ajenas)', () => {
  for (const key of ['a', 'Enter', 'Tab', ' ', 'Escape', 'ArrowRightt', 'Home', '', undefined]) {
    assert.equal(aplicarTecla(BASE, { key }), null, String(key));
  }
  assert.equal(aplicarTecla(BASE), null);
  assert.equal(aplicarTecla(BASE, {}), null);
});

test('aplicarTecla: se detiene en los límites por los dos extremos, sin pasarse con el paso grueso', () => {
  assert.equal(aplicarTecla({ dx: 39.8, dy: 0, escala: 1 }, { key: 'ArrowRight', ctrlKey: true }).dx, LIMITES.dx[1]);
  assert.equal(aplicarTecla({ dx: -39.8, dy: 0, escala: 1 }, { key: 'ArrowLeft', ctrlKey: true }).dx, LIMITES.dx[0]);
  assert.equal(aplicarTecla({ dx: 0, dy: 39.8, escala: 1 }, { key: 'ArrowDown', ctrlKey: true }).dy, LIMITES.dy[1]);
  assert.equal(aplicarTecla({ dx: 0, dy: -39.8, escala: 1 }, { key: 'ArrowUp', ctrlKey: true }).dy, LIMITES.dy[0]);
  assert.equal(aplicarTecla({ dx: 0, dy: 0, escala: 1.19 }, { key: '+', ctrlKey: true }).escala, LIMITES.escala[1]);
  assert.equal(aplicarTecla({ dx: 0, dy: 0, escala: 0.51 }, { key: '-', ctrlKey: true }).escala, LIMITES.escala[0]);
  // ya en el tope, otra flecha no lo mueve
  assert.equal(aplicarTecla({ dx: 40, dy: 0, escala: 1 }, { key: 'ArrowRight' }).dx, 40);
  // y el resultado de apretar siempre es una calibración válida
  assert.ok(calibracionValida(aplicarTecla({ dx: 40, dy: -40, escala: 1.2 }, { key: '+', ctrlKey: true })));
});

test('aplicarTecla: tres pasos finos suman 0.3, no 0.30000000000000004, y no tocan la calibración de entrada', () => {
  const entrada = Object.freeze({ dx: 0, dy: 0, escala: 1 });
  let cal = entrada;
  for (let i = 0; i < 3; i++) cal = aplicarTecla(cal, { key: 'ArrowRight', shiftKey: true });
  assert.equal(cal.dx, 0.3);
  assert.equal(String(cal.dx), '0.3');
  let escala = entrada;
  for (let i = 0; i < 3; i++) escala = aplicarTecla(escala, { key: '+' });
  assert.equal(escala.escala, 1.015);
  assert.deepEqual({ ...entrada }, { dx: 0, dy: 0, escala: 1 });
});

test('limitar recorta cada valor por su cuenta y lo deja en milésimas', () => {
  assert.deepEqual(limitar({ dx: 0.12345, dy: -50, escala: 2 }), { dx: 0.123, dy: -40, escala: 1.2 });
  assert.deepEqual(limitar({ dx: 99, dy: 99, escala: 0.1 }), { dx: 40, dy: 40, escala: 0.5 });
  assert.deepEqual(limitar({ dx: 1.5, dy: -0.5, escala: 0.98 }), { dx: 1.5, dy: -0.5, escala: 0.98 });
});

test('transformacionCss: un solo translate y un solo scale, en milímetros y sin ruido de decimales', () => {
  assert.equal(transformacionCss({ dx: 1.5, dy: -0.5, escala: 0.98 }), 'translate(1.5mm, -0.5mm) scale(0.98)');
  assert.equal(transformacionCss(BASE), 'translate(0mm, 0mm) scale(1)');
  assert.equal(transformacionCss({ dx: 0.1 + 0.2, dy: -0, escala: 0.77 }), 'translate(0.3mm, 0mm) scale(0.77)');
});

test('cajaEnPapel: la hoja se achica hacia su esquina y el corrimiento se suma después', () => {
  const caja = { x: 100, y: 50, ancho: 30, alto: 10 };
  // sin calibración: la caja más el origen de la hoja en la carta
  assert.deepEqual(cajaEnPapel(caja, BASE), { x: ORIGEN_MM.x + 100, y: ORIGEN_MM.y + 50, ancho: 30, alto: 10 });
  // la esquina de la hoja no se mueve con el tamaño, solo con el corrimiento
  const esquina = cajaEnPapel({ x: 0, y: 0, ancho: 1, alto: 1 }, { dx: 2, dy: -3, escala: 0.5 });
  assert.equal(esquina.x, ORIGEN_MM.x + 2);
  assert.equal(esquina.y, ORIGEN_MM.y - 3);
  // lo que está lejos de la esquina sí se acerca, y el corrimiento NO se multiplica por la escala
  const lejos = cajaEnPapel(caja, { dx: 2, dy: -3, escala: 0.5 });
  assert.deepEqual(lejos, { x: ORIGEN_MM.x + 2 + 50, y: ORIGEN_MM.y - 3 + 25, ancho: 15, alto: 5 });
});

test('camposFueraDeLaCarta: con la calibración de fábrica todo cabe; más grande de lo que cabe, se cortan las columnas de la derecha', () => {
  assert.deepEqual(camposFueraDeLaCarta({ ...CALIBRACION_DE_FABRICA }), []);
  // a tamaño de Excel la hoja mide 250 mm y la carta 216: se salen las horas y los precios de la derecha
  const alTamanoDeExcel = camposFueraDeLaCarta({ dx: 0, dy: 0, escala: 1 });
  for (const id of ['horaSalida', 'horaEntrada', 'precioBase', 'seguro', 'deducible']) assert.ok(alTamanoDeExcel.includes(id), id);
  assert.ok(!alTamanoDeExcel.includes('carroPlacas'), 'lo de la izquierda sigue dentro');
  // ESCALA_QUE_CABE deja los 5 mm de margen derecho que él le puso a Excel; las cajas todavía caben hasta 0.79 (216 mm menos
  // 17.9 de margen izquierdo, entre 250 de hoja) y a 0.80 ya se corta la columna de las horas
  assert.deepEqual(camposFueraDeLaCarta({ dx: 0, dy: 0, escala: ESCALA_QUE_CABE }), []);
  assert.deepEqual(camposFueraDeLaCarta({ dx: 0, dy: 0, escala: 0.79 }), []);
  assert.deepEqual(camposFueraDeLaCarta({ dx: 0, dy: 0, escala: 0.8 }), ['horaSalida', 'horaEntrada']);
});

test('camposFueraDeLaCarta: un corrimiento también puede sacar casillas por cualquier lado', () => {
  const fabrica = CALIBRACION_DE_FABRICA.escala;
  assert.ok(camposFueraDeLaCarta({ dx: 8, dy: 0, escala: fabrica }).includes('horaSalida'), 'a la derecha');
  assert.ok(camposFueraDeLaCarta({ dx: -20, dy: 0, escala: fabrica }).includes('etiquetaAcepto'), 'a la izquierda: la primera columna empieza en 17.9 mm');
  assert.ok(camposFueraDeLaCarta({ dx: 0, dy: -35, escala: fabrica }).includes('etiquetaAcepto'), 'arriba: la hoja empieza en 18.5 mm y su primera casilla en 29');
  assert.ok(camposFueraDeLaCarta({ dx: 0, dy: 90, escala: fabrica }).includes('rentadoPor'), 'abajo');
  // y un corrimiento chico hacia adentro no saca nada
  assert.deepEqual(camposFueraDeLaCarta({ dx: -1, dy: 1, escala: fabrica }), []);
});

test('camposFueraDeLaCarta: solo cuenta los campos que se imprimen', () => {
  const campo = campoPorId('horaSalida');
  const alTamanoDeExcel = { dx: 0, dy: 0, escala: 1 };
  assert.ok(camposFueraDeLaCarta(alTamanoDeExcel).includes('horaSalida'));
  try {
    campo.imprime = false;
    assert.ok(!camposFueraDeLaCarta(alTamanoDeExcel).includes('horaSalida'));
  } finally {
    delete campo.imprime;
  }
});

test('textoDeCalibracion dice la calibración con palabras', () => {
  assert.equal(textoDeCalibracion(BASE), 'sin corrimiento, 100.0 % del tamaño de Excel');
  assert.equal(
    textoDeCalibracion({ dx: 1.5, dy: -0.5, escala: 0.98 }),
    '1.5 mm a la derecha, 0.5 mm hacia arriba, 98.0 % del tamaño de Excel',
  );
  assert.equal(textoDeCalibracion({ dx: -2, dy: 1, escala: 1.005 }), '2.0 mm a la izquierda, 1.0 mm hacia abajo, 100.5 % del tamaño de Excel');
});

// ---------------------------------------------------------------------------
// Una calibración por impresora, en el almacén del navegador
// ---------------------------------------------------------------------------

/** Un almacén en memoria con la forma de localStorage. */
function almacenEnMemoria(inicial = null) {
  const datos = new Map();
  if (inicial !== null) datos.set(CLAVE_DE_CALIBRACIONES, inicial);
  return {
    datos,
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => { datos.set(clave, String(valor)); },
  };
}

/** Lo que hace un navegador en ventana privada o con los datos bloqueados: lanza al leer y al escribir. */
const almacenQueLanza = () => ({
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
});

/** Un almacén que devuelve lo que sea. */
const almacenConBasura = (texto) => ({ getItem: () => texto, setItem() {} });

const VACIO = { activa: null, impresoras: {} };

test('leerCalibraciones: un almacén vacío, que lanza o que devuelve basura da «nada guardado», nunca un error', () => {
  assert.deepEqual(leerCalibraciones(almacenEnMemoria()), VACIO);
  assert.deepEqual(leerCalibraciones(almacenQueLanza()), VACIO);
  for (const basura of ['esto no es json', '{', '', 'null', '42', '"texto"', '[]', 'true', '{}',
    '{"impresoras":5}', '{"impresoras":null}', '{"impresoras":"x"}', '{"activa":"Oficina"}']) {
    assert.deepEqual(leerCalibraciones(almacenConBasura(basura)), VACIO, basura);
  }
  // lo que no sea un texto tampoco lo rompe
  for (const raro of [undefined, 0, {}, []]) assert.deepEqual(leerCalibraciones(almacenConBasura(raro)), VACIO, JSON.stringify(raro));
});

test('leerCalibraciones: las impresoras con números imposibles se descartan, las buenas se quedan', () => {
  const guardado = JSON.stringify({
    activa: 'Oficina',
    impresoras: {
      Oficina: { dx: 1, dy: 2, escala: 0.98 },
      Rota: { dx: 'uno', dy: 0, escala: 1 },
      Enorme: { dx: 900, dy: 0, escala: 1 },
      SinEscala: { dx: 0, dy: 0 },
      Nula: null,
    },
  });
  assert.deepEqual(leerCalibraciones(almacenConBasura(guardado)), { activa: 'Oficina', impresoras: { Oficina: { dx: 1, dy: 2, escala: 0.98 } } });
});

test('leerCalibraciones: una «activa» que apunta a una impresora que no existe o que se descartó queda en null', () => {
  const inexistente = JSON.stringify({ activa: 'Fantasma', impresoras: { Oficina: { dx: 0, dy: 0, escala: 1 } } });
  assert.equal(leerCalibraciones(almacenConBasura(inexistente)).activa, null);
  const descartada = JSON.stringify({ activa: 'Rota', impresoras: { Rota: { dx: 99999, dy: 0, escala: 1 }, Buena: { dx: 0, dy: 0, escala: 1 } } });
  const leida = leerCalibraciones(almacenConBasura(descartada));
  assert.equal(leida.activa, null);
  assert.deepEqual(Object.keys(leida.impresoras), ['Buena']);
  const numerica = JSON.stringify({ activa: 7, impresoras: { 7: { dx: 0, dy: 0, escala: 1 } } });
  assert.equal(leerCalibraciones(almacenConBasura(numerica)).activa, null, 'una activa que no es texto no vale');
});

test('guardarCalibracion: se guarda, se vuelve a leer y queda como la activa', () => {
  const almacen = almacenEnMemoria();
  const resultado = guardarCalibracion(almacen, 'Oficina', { dx: 1.5, dy: -0.5, escala: 0.98 });
  assert.deepEqual(resultado, { activa: 'Oficina', impresoras: { Oficina: { dx: 1.5, dy: -0.5, escala: 0.98 } } });
  assert.deepEqual(leerCalibraciones(almacen), resultado);
  assert.ok(almacen.datos.has(CLAVE_DE_CALIBRACIONES) && almacen.datos.size === 1, 'una sola clave, la suya');
});

test('guardarCalibracion: una segunda impresora no borra la primera, y guardar de nuevo la misma la reemplaza', () => {
  const almacen = almacenEnMemoria();
  guardarCalibracion(almacen, 'Oficina', { dx: 1, dy: 1, escala: 1 });
  guardarCalibracion(almacen, 'Mostrador', { dx: -2, dy: 0, escala: 0.9 });
  let leida = leerCalibraciones(almacen);
  assert.equal(leida.activa, 'Mostrador', 'la última guardada es la activa');
  assert.deepEqual(Object.keys(leida.impresoras).sort(), ['Mostrador', 'Oficina']);
  guardarCalibracion(almacen, 'Oficina', { dx: 3, dy: 3, escala: 1.1 });
  leida = leerCalibraciones(almacen);
  assert.deepEqual(leida.impresoras.Oficina, { dx: 3, dy: 3, escala: 1.1 });
  assert.deepEqual(leida.impresoras.Mostrador, { dx: -2, dy: 0, escala: 0.9 });
  assert.equal(leida.activa, 'Oficina');
});

test('guardarCalibracion: el nombre se recorta, y uno vacío o en blanco lanza en español', () => {
  const almacen = almacenEnMemoria();
  guardarCalibracion(almacen, '  Oficina  ', BASE);
  assert.deepEqual(Object.keys(leerCalibraciones(almacen).impresoras), ['Oficina']);
  for (const malo of ['', '   ', null, undefined]) {
    assert.throws(() => guardarCalibracion(almacen, malo, BASE), /Ponle un nombre a la impresora/, JSON.stringify(malo));
  }
});

test('guardarCalibracion: números imposibles lanzan y no tocan lo guardado', () => {
  const almacen = almacenEnMemoria();
  guardarCalibracion(almacen, 'Oficina', { dx: 1, dy: 1, escala: 1 });
  const antes = almacen.datos.get(CLAVE_DE_CALIBRACIONES);
  for (const mala of [{ dx: 999, dy: 0, escala: 1 }, { dx: 0, dy: 0, escala: 0 }, { dx: NaN, dy: 0, escala: 1 }, null, undefined, 'x']) {
    assert.throws(() => guardarCalibracion(almacen, 'Otra', mala), /no son posibles/, JSON.stringify(mala));
  }
  assert.equal(almacen.datos.get(CLAVE_DE_CALIBRACIONES), antes);
});

test('guardarCalibracion: solo guarda dx, dy y escala, aunque le pasen más', () => {
  const almacen = almacenEnMemoria();
  guardarCalibracion(almacen, 'Oficina', { dx: 1, dy: 2, escala: 1, extra: 'no', numeroDeTarjeta: '4111111111111111' });
  assert.deepEqual(Object.keys(leerCalibraciones(almacen).impresoras.Oficina), ['dx', 'dy', 'escala']);
  assert.ok(!almacen.datos.get(CLAVE_DE_CALIBRACIONES).includes('4111'));
});

test('guardarCalibracion: si el navegador no deja guardar, lo dice en español en vez de fingir que guardó', () => {
  assert.throws(() => guardarCalibracion(almacenQueLanza(), 'Oficina', BASE), /No se pudo guardar el ajuste en esta computadora/);
});

test('calibracionActiva: sin impresora guardada es la de fábrica y avisa que no está calibrada', () => {
  for (const almacen of [almacenEnMemoria(), almacenQueLanza(), almacenConBasura('basura')]) {
    const activa = calibracionActiva(almacen);
    assert.deepEqual(activa, { nombre: null, cal: { ...CALIBRACION_DE_FABRICA }, calibrada: false });
  }
});

test('calibracionActiva: con una impresora guardada trae su ajuste, y entrega una copia', () => {
  const almacen = almacenEnMemoria();
  guardarCalibracion(almacen, 'Oficina', { dx: 1.5, dy: -0.5, escala: 0.98 });
  const activa = calibracionActiva(almacen);
  assert.deepEqual(activa, { nombre: 'Oficina', cal: { dx: 1.5, dy: -0.5, escala: 0.98 }, calibrada: true });
  activa.cal.dx = 99;
  assert.equal(calibracionActiva(almacen).cal.dx, 1.5, 'cambiar lo devuelto no cambia lo guardado');
  const deFabrica = calibracionActiva(almacenEnMemoria());
  deFabrica.cal.dx = 99;
  assert.equal(CALIBRACION_DE_FABRICA.dx, 0, 'ni la de fábrica');
});
