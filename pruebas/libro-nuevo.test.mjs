// El libro de Excel armado desde cero (js/respaldo/libroNuevo.js): el que baja la cuenta de un empleado.
//
// Se lee de vuelta con el MISMO lector que usan las pruebas del respaldo (zip.js, libro.js, hojas.js), y además con `unzip -t`,
// que es una herramienta de verdad. Que el archivo se baje y que Excel lo abra son dos afirmaciones distintas: la segunda
// se comprobó abriéndolo (ver el informe de esta tarea), y estas pruebas fijan lo que ese abrir exige.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escribirLibro, ESTILO, MAX_NOMBRE_DE_HOJA } from '../js/respaldo/libroNuevo.js';
import { celdaNueva } from '../js/respaldo/hojas.js';
import { abrirLibro } from './fixtures/leerLibro.mjs';

const HOY = '2026-10-23';
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const enTexto = (bytes) => new TextDecoder().decode(bytes);

const hojaDePrueba = (cambios = {}) => ({
  nombre: 'Rentas',
  columnas: [
    { titulo: 'Empleado', tipo: 'texto', ancho: 24 },
    { titulo: 'Contrato', tipo: 'entero' },
    { titulo: 'Regresó', tipo: 'fecha' },
    { titulo: 'Comisión', tipo: 'dinero' },
    { titulo: '%', tipo: 'numero' },
  ],
  filas: [['Ana López', 21, 46310, 140, 5], ['Wilder', 22, null, 0, 0]],
  ...cambios,
});
/** El número de estilo de una celda; una celda sin atributo `s` lleva el de por omisión (0). */
const estiloDe = (libro, hoja, ref) => {
  const celda = new RegExp(`<c r="${ref}"(?: s="(\\d+)")?[ />]`).exec(libro.xml(hoja));
  return celda ? (celda[1] ?? '0') : undefined;
};
const armar = (hojas, extra = {}) => escribirLibro({
  hojas, titulo: 'Comisiones', asunto: 'prueba', hoy: HOY, ...extra,
});

test('un libro armado aquí se vuelve a leer: pestañas en su orden y cada celda con lo que se escribió', async () => {
  const bytes = await armar([hojaDePrueba(), { ...hojaDePrueba(), nombre: 'Pagos', filas: [['Pedro', 1, null, 2.5, 7.5]] }]);
  const libro = await abrirLibro(bytes);
  assert.deepEqual([...libro.hojas.keys()], ['Rentas', 'Pagos'], 'las pestañas, en el orden en que se pidieron');
  assert.deepEqual(libro.textos('Rentas', ['A1', 'B1', 'C1', 'D1', 'E1']), { A1: 'Empleado', B1: 'Contrato', C1: 'Regresó', D1: 'Comisión', E1: '%' });
  assert.deepEqual(libro.textos('Rentas', ['A2', 'B2', 'C2', 'D2', 'E2']), { A2: 'Ana López', B2: '21', C2: '46310', D2: '140', E2: '5' });
  assert.equal(libro.texto('Rentas', 'C3'), null, 'una celda sin valor queda vacía, no en cero');
  assert.equal(libro.numero('Rentas', 'D3'), 0, 'y un cero es un cero');
  assert.equal(libro.numero('Pagos', 'D2'), 2.5);
  assert.equal(libro.texto('Pagos', 'A2'), 'Pedro');
});

test('el formato de cada celda lo pone su columna: fecha, dinero, entero y el resto sin formato', async () => {
  const libro = await abrirLibro(await armar([hojaDePrueba()]));
  assert.equal(estiloDe(libro, 'Rentas', 'A2'), String(ESTILO.texto));
  assert.equal(estiloDe(libro, 'Rentas', 'B2'), String(ESTILO.entero));
  assert.equal(estiloDe(libro, 'Rentas', 'C2'), String(ESTILO.fecha));
  assert.equal(estiloDe(libro, 'Rentas', 'D2'), String(ESTILO.dinero));
  assert.equal(estiloDe(libro, 'Rentas', 'E2'), String(ESTILO.numero));
  assert.equal(estiloDe(libro, 'Rentas', 'A1'), String(ESTILO.encabezado), 'el título de cada columna lleva el estilo del encabezado');
  assert.match(enTexto(libro.partes.get('xl/styles.xml')), /formatCode="dd\/mm\/yyyy"/);
  assert.match(enTexto(libro.partes.get('xl/styles.xml')), /formatCode="&quot;Q&quot;#,##0\.00;-&quot;Q&quot;#,##0\.00"/, 'Q1,234.50 y -Q50.00, como en pantalla');
});

test('cada estilo de ESTILO existe en la hoja de estilos: ninguna celda apunta a un estilo que no está', async () => {
  const libro = await abrirLibro(await armar([hojaDePrueba()]));
  const estilos = enTexto(libro.partes.get('xl/styles.xml'));
  const cuantos = Number(/<cellXfs count="(\d+)"/.exec(estilos)[1]);
  const declarados = (/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)[1].match(/<xf /g) ?? []).length;
  assert.equal(declarados, cuantos, 'el conteo que declara es el real');
  assert.equal(cuantos, Object.keys(ESTILO).length);
  for (const [clave, n] of Object.entries(ESTILO)) assert.ok(n >= 0 && n < cuantos, clave);
  // Y los números de fuente, relleno y borde de cada formato existen.
  const fuentes = (/<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(estilos)[1].match(/<font>/g) ?? []).length;
  const rellenos = (/<fills[^>]*>([\s\S]*?)<\/fills>/.exec(estilos)[1].match(/<fill>/g) ?? []).length;
  const bordes = (/<borders[^>]*>([\s\S]*?)<\/borders>/.exec(estilos)[1].match(/<border>/g) ?? []).length;
  for (const m of /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)[1].matchAll(/<xf [^>]*fontId="(\d+)" fillId="(\d+)" borderId="(\d+)"/g)) {
    assert.ok(Number(m[1]) < fuentes && Number(m[2]) < rellenos && Number(m[3]) < bordes, m[0]);
  }
});

test('SIN FÓRMULAS: un texto que parece fórmula queda como texto, y ninguna hoja trae un <f>', async () => {
  const bytes = await armar([hojaDePrueba({ filas: [['=SUMA(A1:A9)', 1, null, 1, 1], ['+cmd|calc', 2, null, 2, 2]] })]);
  const libro = await abrirLibro(bytes);
  assert.equal(libro.texto('Rentas', 'A2'), '=SUMA(A1:A9)');
  assert.doesNotMatch(libro.xml('Rentas'), /<f[\s>/]/);
  assert.match(libro.xml('Rentas'), /<c r="A2" t="inlineStr"><is><t xml:space="preserve">=SUMA\(A1:A9\)<\/t><\/is><\/c>/);
});

test('el texto se escapa y se limpia: &, <, > y comillas no rompen el XML, y los caracteres de control se quitan', async () => {
  const bytes = await armar([hojaDePrueba({ nombre: 'Ana & "Luis"', filas: [['A & B <c> "d" \u0007\u0000 ñ', 1, null, 1, 1]] })]);
  const libro = await abrirLibro(bytes);
  assert.deepEqual([...libro.hojas.keys()], ['Ana & "Luis"'], 'el nombre de la pestaña vuelve igual que se pidió');
  assert.equal(libro.texto('Ana & "Luis"', 'A2'), 'A & B <c> "d"  ñ', 'los dos caracteres de control salieron; lo demás, intacto');
  assert.match(enTexto(libro.partes.get('xl/workbook.xml')), /<sheet name="Ana &amp; &quot;Luis&quot;" sheetId="1" r:id="rId1"\/>/);
});

test('un número que no es número no se escribe: Excel no abriría el archivo', async () => {
  for (const malo of [NaN, Infinity, -Infinity]) {
    await assert.rejects(() => armar([hojaDePrueba({ filas: [['x', 1, null, malo, 1]] })]), /no es un número válido/, String(malo));
  }
  assert.throws(() => celdaNueva('A1', 0, NaN), /no es un número válido/);
});

test('las notas van arriba, una por fila, con su estilo, y la tabla empieza dos filas después de la última', async () => {
  const bytes = await armar([hojaDePrueba({
    notas: [{ texto: 'Comisiones', estilo: 'titulo' }, { texto: 'Al 23 oct 2026', estilo: 'nota' }, { texto: 'Cuidado', estilo: 'aviso' }],
  })]);
  const libro = await abrirLibro(bytes);
  assert.deepEqual(libro.textos('Rentas', ['A1', 'A2', 'A3']), { A1: 'Comisiones', A2: 'Al 23 oct 2026', A3: 'Cuidado' });
  assert.deepEqual([estiloDe(libro, 'Rentas', 'A1'), estiloDe(libro, 'Rentas', 'A2'), estiloDe(libro, 'Rentas', 'A3')], [ESTILO.titulo, ESTILO.nota, ESTILO.aviso].map(String));
  assert.equal(libro.texto('Rentas', 'A4'), null, 'una fila en blanco');
  assert.equal(libro.texto('Rentas', 'A5'), 'Empleado', 'los títulos');
  assert.equal(libro.texto('Rentas', 'A6'), 'Ana López', 'y los datos');
  assert.match(libro.xml('Rentas'), /<dimension ref="A1:E7"\/>/);
});

test('un estilo de nota que no existe cae a texto normal, no a un estilo inventado', async () => {
  const libro = await abrirLibro(await armar([hojaDePrueba({ notas: [{ texto: 'x', estilo: 'rojo-chillon' }] })]));
  assert.match(libro.xml('Rentas'), /<c r="A1" t="inlineStr">/, 'sin atributo de estilo: el de por omisión');
});

test('congelar deja la fila de títulos fija, y el filtro pone las flechas sobre toda la tabla y declara su nombre oculto', async () => {
  const libro = await abrirLibro(await armar([hojaDePrueba({ congelar: true, filtro: true }), { ...hojaDePrueba(), nombre: 'Mis rentas' }]));
  assert.match(libro.xml('Rentas'), /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(libro.xml('Rentas'), /<autoFilter ref="A1:E3"\/>/);
  assert.match(enTexto(libro.partes.get('xl/workbook.xml')), /<definedName name="_xlnm\._FilterDatabase" localSheetId="0" hidden="1">Rentas!\$A\$1:\$E\$3<\/definedName>/);
  assert.doesNotMatch(libro.xml('Mis rentas'), /pane|autoFilter/, 'la hoja que no lo pidió no lo trae');
});

test('un nombre de hoja con espacios se cita en el rango del filtro, y con notas el filtro baja a la fila de títulos', async () => {
  const bytes = await armar([hojaDePrueba({ nombre: "Mis rentas d'hoy", filtro: true, notas: [{ texto: 'x', estilo: 'nota' }] })]);
  const libro = await abrirLibro(bytes);
  assert.match(libro.xml("Mis rentas d'hoy"), /<autoFilter ref="A3:E5"\/>/);
  assert.match(enTexto(libro.partes.get('xl/workbook.xml')), /Mis rentas d''hoy'!\$A\$3:\$E\$5/);
});

test('se niega lo que Excel no abriría: sin hojas, nombres malos o repetidos, columnas o filas mal armadas', async () => {
  await assert.rejects(() => armar([]), /por lo menos una hoja/);
  await assert.rejects(() => armar('x'), /por lo menos una hoja/);
  for (const nombre of ['', '   ', 'a/b', 'a\\b', 'a?b', 'a*b', 'a[b', 'a]b', 'a:b', "'abc", "abc'", 'x'.repeat(MAX_NOMBRE_DE_HOJA + 1)]) {
    await assert.rejects(() => armar([hojaDePrueba({ nombre })]), /no tiene nombre|no sirve en Excel/, JSON.stringify(nombre));
  }
  await assert.doesNotReject(() => armar([hojaDePrueba({ nombre: 'x'.repeat(MAX_NOMBRE_DE_HOJA) })]));
  await assert.rejects(() => armar([hojaDePrueba(), hojaDePrueba({ nombre: 'RENTAS' })]), /Dos hojas se llaman/, 'Excel no distingue mayúsculas');
  await assert.rejects(() => armar([hojaDePrueba({ columnas: [] })]), /no tiene columnas/);
  await assert.rejects(() => armar([hojaDePrueba({ columnas: [{ titulo: 'x', tipo: 'moneda' }], filas: [] })]), /tipo «moneda»/);
  await assert.rejects(() => armar([hojaDePrueba({ filas: 'x' })]), /sus filas como una lista/);
  await assert.rejects(() => armar([hojaDePrueba({ filas: [['solo uno']] })]), /1 valores y 5 columnas/);
  await assert.rejects(() => armar([hojaDePrueba({ filas: [null] })]), /ningún valores/);
  await assert.rejects(() => armar([hojaDePrueba({ congelar: true, notas: [{ texto: 'x', estilo: 'nota' }] })]), /no empieza en la fila 1/);
});

test('sin la fecha de hoy no se arma: el archivo lleva adentro el día y no se lee del reloj', async () => {
  for (const hoy of [undefined, '', '23/10/2026', '2026-10-2', 20261023]) {
    await assert.rejects(() => escribirLibro({ hojas: [hojaDePrueba()], hoy }), /Falta la fecha de hoy/, String(hoy));
  }
  const fuente = sinComentarios(leer('../js/respaldo/libroNuevo.js'));
  assert.doesNotMatch(fuente, /new Date|Date\.now|hoyISO\(/);
});

test('los mismos datos y la misma fecha dan exactamente los mismos bytes, y otro día cambia solo las propiedades del archivo', async () => {
  const a = await armar([hojaDePrueba()]);
  const b = await armar([hojaDePrueba()]);
  assert.deepEqual(a, b);
  const libro = await abrirLibro(await armar([hojaDePrueba()], { hoy: '2027-01-02' }));
  assert.match(enTexto(libro.partes.get('docProps/core.xml')), /<dcterms:created xsi:type="dcterms:W3CDTF">2027-01-02T12:00:00Z</);
  assert.match(enTexto(a.length ? (await abrirLibro(a)).partes.get('docProps/core.xml') : new Uint8Array(0)), /<dc:title>Comisiones<\/dc:title><dc:subject>prueba<\/dc:subject>/);
});

test('el zip es un zip de verdad: `unzip -t` lo da por bueno, [Content_Types].xml va primero y cada parte declarada existe', async () => {
  const bytes = await armar([hojaDePrueba({ congelar: true, filtro: true }), { ...hojaDePrueba(), nombre: 'Pagos' }]);
  const carpeta = mkdtempSync(join(tmpdir(), 'libro-nuevo-'));
  try {
    writeFileSync(join(carpeta, 'a.xlsx'), bytes);
    assert.match(execFileSync('unzip', ['-t', join(carpeta, 'a.xlsx')], { encoding: 'utf8' }), /No errors detected/);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
  const libro = await abrirLibro(bytes);
  assert.equal([...libro.partes.keys()][0], '[Content_Types].xml');
  const tipos = enTexto(libro.partes.get('[Content_Types].xml'));
  for (const parte of libro.partes.keys()) {
    if (parte === '[Content_Types].xml' || parte.endsWith('.rels')) continue;
    assert.ok(tipos.includes(`PartName="/${parte}"`), `${parte} está declarada en [Content_Types].xml`);
  }
  for (const m of tipos.matchAll(/PartName="\/([^"]+)"/g)) assert.ok(libro.partes.has(m[1]), `${m[1]} declarada y presente`);
  const rels = enTexto(libro.partes.get('xl/_rels/workbook.xml.rels'));
  for (const m of rels.matchAll(/Target="([^"]+)"/g)) assert.ok(libro.partes.has(`xl/${m[1]}`), `${m[1]} existe`);
  assert.deepEqual([...libro.hojas.values()], ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
});

test('es XML bien formado: toda etiqueta que se abre se cierra, en las hojas, el libro y los estilos', async () => {
  const bytes = await armar([hojaDePrueba({ congelar: true, filtro: true, nombre: 'A & B' })]);
  const libro = await abrirLibro(bytes);
  for (const [nombre, datos] of libro.partes) {
    const xml = enTexto(datos).replace(/<\?xml[^?]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
    const pila = [];
    for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g)) {
      if (m[4]) continue;
      if (m[1]) assert.equal(pila.pop(), m[2], `${nombre}: </${m[2]}> sin su apertura`);
      else pila.push(m[2]);
    }
    assert.deepEqual(pila, [], `${nombre}: etiquetas sin cerrar`);
    assert.doesNotMatch(xml.replace(/<[^>]*>/g, ''), /[<>]|&(?!amp;|lt;|gt;|quot;|apos;|#)/, `${nombre}: texto sin escapar`);
  }
});

test('el libro reutiliza el zip y las celdas del respaldo, no una segunda manera de escribirlos', () => {
  const fuente = sinComentarios(leer('../js/respaldo/libroNuevo.js'));
  assert.match(fuente, /import \{ escribirZip \} from '\.\/zip\.js';/);
  assert.match(fuente, /import \{ celdaNueva, columnaDeNumero, escaparXml \} from '\.\/hojas\.js';/);
  assert.ok(!/CompressionStream|new Blob|crc32/.test(fuente), 'no comprime ni calcula CRC por su cuenta');
  assert.ok(!/inlineStr|<v>/.test(fuente), 'no arma celdas a mano: las pide a celdaNueva');
});
