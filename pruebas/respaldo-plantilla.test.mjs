// La plantilla que viaja con el sistema (`plantilla/best-price.xlsx`): su Excel, sin datos de nadie.
//
// Dos cosas se vigilan aquí y no se pueden ver a ojo. Una: que en un repositorio PÚBLICO no haya un solo dato
// personal —ni en las celdas, ni en la tabla de textos compartidos donde Excel guarda un texto aunque la celda se
// borre, ni en los valores en caché de las fórmulas—. Dos: que lo que hace que su archivo sirva para rentar (las
// fórmulas, las validaciones, la protección, la imagen) siga ahí, tal cual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirLibro, leerPlantilla } from './fixtures/leerLibro.mjs';
import { prepararPlantilla } from '../herramientas/preparar-plantilla.mjs';
import { textosCompartidos } from '../js/respaldo/hojas.js';
import {
  HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO, compararEncabezados, celdasDeDatos, CAPACIDAD,
} from '../js/respaldo/diseno.js';
import { xmlDe } from '../js/respaldo/libro.js';

const DIEZ_HOJAS = ['BUSCAR', 'VEHICULOS', 'CLIENTES', 'INGRESO DE DATOS', 'IMP. CONTRATO', 'CONTRATOS', 'CIERRE', 'IMP. CIERRE DE CONTRATO', 'FICHA CLIENTE', 'FICHA VEHICULO'];

// Cuántas fórmulas tiene cada hoja en SU archivo (contadas antes de preparar la plantilla). Si alguna baja, la
// preparación perdió fórmulas; si sube, alguien las agregó a mano y hay que revisar que el mapa las conozca.
const FORMULAS = {
  BUSCAR: 386, VEHICULOS: 201, CLIENTES: 9999, 'INGRESO DE DATOS': 42, 'IMP. CONTRATO': 61, CONTRATOS: 19059, CIERRE: 313, 'IMP. CIERRE DE CONTRATO': 47, 'FICHA CLIENTE': 411, 'FICHA VEHICULO': 415,
};

test('conserva sus diez hojas, en su orden', async () => {
  const libro = await abrirLibro(leerPlantilla());
  assert.deepEqual([...libro.hojas.keys()], DIEZ_HOJAS);
});

test('conserva TODAS sus fórmulas, hoja por hoja', async () => {
  const libro = await abrirLibro(leerPlantilla());
  for (const [hoja, esperadas] of Object.entries(FORMULAS)) {
    assert.equal((libro.xml(hoja).match(/<f[\s>/]/g) ?? []).length, esperadas, hoja);
  }
});

test('conserva las validaciones, los formatos condicionales, la protección y la imagen', async () => {
  const libro = await abrirLibro(leerPlantilla());
  const cuenta = (hoja, etiqueta) => (libro.xml(hoja).match(new RegExp(`<${etiqueta}[\\s>/]`, 'g')) ?? []).length;
  assert.equal(cuenta('CONTRATOS', 'dataValidation'), 2, 'forma de pago y pagado al dueño son listas');
  assert.equal(cuenta('VEHICULOS', 'dataValidation'), 1, 'PROPIO / SUBARRENDADO');
  assert.equal(cuenta('BUSCAR', 'dataValidation'), 1);
  assert.equal(cuenta('CONTRATOS', 'cfRule'), 4);
  for (const hoja of DIEZ_HOJAS) assert.equal(cuenta(hoja, 'sheetProtection'), 1, `${hoja} sigue protegida`);
  assert.ok(libro.partes.has('xl/media/image1.png'), 'el logo');
  assert.ok(libro.partes.has('xl/styles.xml'));
  assert.match(xmlDe(libro.partes, 'xl/workbook.xml'), /Print_Area/, 'las áreas de impresión de los contratos');
});

test('los encabezados son los que el mapa del respaldo espera, en las cuatro hojas', async () => {
  const libro = await abrirLibro(leerPlantilla());
  for (const hoja of [HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO]) {
    const textos = textosCompartidos(xmlDe(libro.partes, 'xl/sharedStrings.xml'));
    assert.deepEqual(compararEncabezados(hoja, libro.xml(hoja), textos), [], hoja);
  }
});

test('SIN datos de nadie: las celdas de datos de CLIENTES, VEHICULOS, CONTRATOS y el formulario están vacías', async () => {
  const libro = await abrirLibro(leerPlantilla());
  for (const hoja of [HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO]) {
    const refs = celdasDeDatos(hoja);
    // Se lee de a pedazos para no recorrer la hoja de 3 MB una vez por celda.
    for (let i = 0; i < refs.length; i += 5000) {
      const llenas = Object.entries(libro.textos(hoja, refs.slice(i, i + 5000))).filter(([, t]) => t !== null);
      assert.deepEqual(llenas, [], `${hoja}: celdas de datos con algo escrito`);
    }
  }
});

test('SIN datos de nadie: ningún texto de la plantilla parece un correo, un DPI, un teléfono ni una tarjeta', async () => {
  const libro = await abrirLibro(leerPlantilla());
  // El único texto con cifras largas que debe quedar es el pie de página del contrato impreso (teléfonos de la empresa).
  const PIE = /rentaautos\.gt/;
  const textos = textosCompartidos(xmlDe(libro.partes, 'xl/sharedStrings.xml')).filter((t) => t !== '');
  const constantes = [];
  for (const hoja of DIEZ_HOJAS) {
    for (const m of libro.xml(hoja).matchAll(/<c r="[A-Z]+\d+"[^>]*>(?:(?!<f)[\s\S])*?<\/c>/g)) {
      const v = /<v>([^<]*)<\/v>/.exec(m[0]);
      if (v && !/\st="s"/.test(m[0])) constantes.push(v[1]);
    }
  }
  for (const t of [...textos, ...constantes]) {
    assert.doesNotMatch(t, /@/, `un correo: ${t.slice(0, 20)}…`);
    if (PIE.test(t)) continue;
    assert.doesNotMatch(t, /\d{7,}|\d{4}[\s-]\d{4,}|\d{4} \d{5} \d{4}/, `cifras largas (¿un documento, un teléfono, una tarjeta?): ${t.slice(0, 6)}…`);
    assert.doesNotMatch(t, /visa|master ?card|amex/i, 'una marca de tarjeta');
  }
  assert.doesNotMatch(xmlDe(libro.partes, 'xl/sharedStrings.xml'), /mailto/);
});

test('SIN datos de nadie: ni hipervínculos, ni valores en caché de fórmulas, ni el autor', async () => {
  const libro = await abrirLibro(leerPlantilla());
  for (const hoja of DIEZ_HOJAS) {
    assert.doesNotMatch(libro.xml(hoja), /<hyperlink/, hoja);
    const conCache = [...libro.xml(hoja).matchAll(/<c r="([A-Z]+\d+)"[^>]*>(?:(?!<\/c>)[\s\S])*?<f[\s>/](?:(?!<\/c>)[\s\S])*?<v[\s>/]/g)];
    assert.equal(conCache.length, 0, `${hoja}: fórmulas con un valor viejo guardado, p. ej. ${conCache[0]?.[1]}`);
  }
  assert.ok(![...libro.partes.keys()].some((n) => n.includes('_rels/sheet3')), 'sin relaciones de hipervínculo');
  const core = xmlDe(libro.partes, 'docProps/core.xml');
  assert.doesNotMatch(core, /Esteban|Urizar/i);
});

test('pide a Excel calcular todo al abrir y no trae cadena de cálculo vieja', async () => {
  const libro = await abrirLibro(leerPlantilla());
  assert.match(xmlDe(libro.partes, 'xl/workbook.xml'), /<calcPr[^>]*fullCalcOnLoad="1"/);
  assert.equal(libro.partes.has('xl/calcChain.xml'), false);
  assert.doesNotMatch(xmlDe(libro.partes, '[Content_Types].xml'), /calcChain/);
  assert.doesNotMatch(xmlDe(libro.partes, 'xl/_rels/workbook.xml.rels'), /calcChain/);
});

test('las fórmulas de las que depende el respaldo son las de su hoja: si las cambia, las notas de COMENTARIOS dejarían de ser ciertas', async () => {
  const libro = await abrirLibro(leerPlantilla());
  const formula = (hoja, ref) => new RegExp(`<c r="${ref}"[^>]*><f[^>]*>([^<]*)</f>`).exec(libro.xml(hoja))?.[1];
  // El SUBTOTAL suma renta, atraso, seguros, daños, carta poder, combustible y varios — y NO la hora tardía (AH).
  assert.equal(formula(HOJA_CONTRATOS, 'BQ6'), 'IF($A6="","",N($K6)+N($BK6)+N($BL6)+N($BM6)+N($BN6)+N($BO6)+N($BP6))');
  assert.doesNotMatch(formula(HOJA_CONTRATOS, 'BQ6'), /\$AH/);
  // El total aplica UN porcentaje de tarjeta a todo el subtotal.
  assert.equal(formula(HOJA_CONTRATOS, 'BT6'), 'IF($A6="","",ROUND((N($BQ6)-N($BR6))*(1+N($BS6)/100),2))');
  // La fila de los contratos que se agregan después se pega donde dice COUNT(A6:A1005)+6: sin huecos.
  assert.match(xmlDe(libro.partes, libro.hojas.get(HOJA_CONTRATOS)), /COUNT\(\$A\$6:\$A\$1005\)\+6/);
});

test('el formulario conserva las tarifas fijas del negocio (seguro de terceros, seguro, deducible, combustible por galón)', async () => {
  const libro = await abrirLibro(leerPlantilla());
  assert.deepEqual(libro.textos(HOJA_FORMULARIO, ['C24', 'C25', 'C26', 'C37']), { C24: '120', C25: '72', C26: '55000', C37: '65' });
});

test('la capacidad que el código conoce es la de las hojas (hay fórmula en la última fila y no en la siguiente)', async () => {
  const libro = await abrirLibro(leerPlantilla());
  assert.match(libro.xml(HOJA_CONTRATOS), new RegExp(`<row r="${CAPACIDAD.contratos.ultima}"`));
  assert.doesNotMatch(libro.xml(HOJA_CONTRATOS), new RegExp(`<row r="${CAPACIDAD.contratos.ultima + 1}"`));
  assert.match(libro.xml(HOJA_CLIENTES), new RegExp(`<row r="${CAPACIDAD.clientes.ultima}"`));
  assert.match(libro.xml(HOJA_VEHICULOS), new RegExp(`<row r="${CAPACIDAD.vehiculos.ultima}"`));
});

test('la herramienta que prepara la plantilla da EXACTAMENTE la plantilla que viaja: ni un byte distinto', async () => {
  const guardada = leerPlantilla();
  const { bytes } = await prepararPlantilla(guardada);
  assert.equal(Buffer.compare(Buffer.from(bytes), Buffer.from(guardada)), 0);
});

test('la herramienta se niega con un Excel cuyo diseño no es el que el respaldo conoce', async () => {
  const { escribirCeldas } = await import('../js/respaldo/hojas.js');
  const { leerZip, escribirZip } = await import('../js/respaldo/zip.js');
  const { hojasDelLibro, ponerXml } = await import('../js/respaldo/libro.js');
  const partes = await leerZip(leerPlantilla());
  const parte = hojasDelLibro(partes).get(HOJA_CLIENTES);
  ponerXml(partes, parte, escribirCeldas(xmlDe(partes, parte), [{ ref: 'H2', valor: 'LICENCIA' }]));
  const alterada = await escribirZip(partes);
  await assert.rejects(() => prepararPlantilla(alterada), /no es el que el respaldo conoce/);
});
