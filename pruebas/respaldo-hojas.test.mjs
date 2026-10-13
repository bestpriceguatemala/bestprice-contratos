// Escribir celdas dentro del XML de una hoja de Excel, sin tocar nada más.
//
// Lo que se protege aquí es la promesa de §10: «conserva sus diez hojas, sus colores y sus fórmulas». Por eso
// `escribirCeldas` solo cambia las celdas que se le piden, nunca pisa una fórmula, y se niega en voz alta si una
// celda no está donde la plantilla debía tenerla (un Excel cambiado a mano): un respaldo que escribe al lado
// de donde debía es peor que ninguno.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escribirCeldas, completarCeldas, textoDeCelda, textosCompartidos, serialDeFecha, fraccionDeHora, escaparXml, columnaDeNumero, numeroDeColumna,
} from '../js/respaldo/hojas.js';

const HOJA = '<?xml version="1.0"?><worksheet><sheetData>'
  + '<row r="3"><c r="A3" s="47"><v>1</v></c><c r="B3" s="4" t="s"><v>0</v></c><c r="C3" s="4"/><c r="D3" s="8"><v>38757</v></c>'
  + '<c r="E3" s="9" t="str"><f>IF($B3="","",1)</f><v>x</v></c></row>'
  + '<row r="4"><c r="A4" s="66"><f t="shared" ref="A4:A67" si="2">A3+1</f><v>2</v></c><c r="B4" s="4"/><c r="C4" s="4"/></row>'
  + '</sheetData></worksheet>';

test('un texto va como cadena en línea y conserva el estilo (el color y el formato de su celda)', () => {
  const salida = escribirCeldas(HOJA, [{ ref: 'C3', valor: 'Juan Pérez' }]);
  assert.match(salida, /<c r="C3" s="4" t="inlineStr"><is><t xml:space="preserve">Juan Pérez<\/t><\/is><\/c>/);
});

test('un número va como número, sin tipo, con el estilo de la celda', () => {
  assert.match(escribirCeldas(HOJA, [{ ref: 'C3', valor: 700 }]), /<c r="C3" s="4"><v>700<\/v><\/c>/);
  assert.match(escribirCeldas(HOJA, [{ ref: 'C3', valor: 0.625 }]), /<v>0\.625<\/v>/);
});

test('vaciar una celda le quita el valor y el tipo pero conserva el estilo', () => {
  const salida = escribirCeldas(HOJA, [{ ref: 'B3', valor: null }, { ref: 'D3', valor: '' }]);
  assert.match(salida, /<c r="B3" s="4"\/>/);
  assert.match(salida, /<c r="D3" s="8"\/>/);
});

test('todo lo que no se pidió queda byte por byte igual: fórmulas, fórmulas compartidas y celdas vecinas', () => {
  const salida = escribirCeldas(HOJA, [{ ref: 'C3', valor: 'x' }]);
  assert.equal(salida.replace(/<c r="C3"[^>]*>.*?<\/c>/, '<c r="C3" s="4"/>'), HOJA);
});

test('NO pisa una fórmula: ni una común ni el hijo de una fórmula compartida', () => {
  assert.throws(() => escribirCeldas(HOJA, [{ ref: 'E3', valor: 5 }]), /fórmula/);
  assert.throws(() => escribirCeldas(HOJA, [{ ref: 'A4', valor: 5 }]), /fórmula/);
});

test('una celda que la plantilla no trae se niega con su nombre, no se inventa en otro lado', () => {
  assert.throws(() => escribirCeldas(HOJA, [{ ref: 'Z9', valor: 5 }]), /Z9/);
});

test('el texto se escapa: un «&» o un «<» no rompen el XML, y una fórmula escrita como texto sigue siendo texto', () => {
  const salida = escribirCeldas(HOJA, [{ ref: 'C3', valor: '=SUM(A1) & <b> "x"' }]);
  assert.match(salida, /<t xml:space="preserve">=SUM\(A1\) &amp; &lt;b&gt; "x"<\/t>/);
  assert.match(salida, /t="inlineStr"/);
  assert.doesNotMatch(salida, /<c r="C3"[^>]*><f>/);
});

test('los caracteres que XML no admite se quitan (un pegado de Word con un carácter de control rompería el archivo entero)', () => {
  const salida = escribirCeldas(HOJA, [{ ref: 'C3', valor: 'a\u0000b\u0008c\u001fd\ud800e\n.' }]);
  assert.match(salida, /<t xml:space="preserve">abcde\n\.<\/t>/);
});

test('un texto de más de 32,000 caracteres se recorta y lo dice: Excel no abre celdas más largas', () => {
  const salida = escribirCeldas(HOJA, [{ ref: 'C3', valor: 'x'.repeat(40000) }]);
  const texto = /<t xml:space="preserve">(.*)<\/t>/s.exec(salida)[1];
  assert.ok(texto.length <= 32000);
  assert.match(texto, /recortado/);
});

test('un número que no es un número (NaN, Infinity) se niega: escribirlo daría un archivo que Excel no abre', () => {
  assert.throws(() => escribirCeldas(HOJA, [{ ref: 'C3', valor: NaN }]), /número/);
  assert.throws(() => escribirCeldas(HOJA, [{ ref: 'C3', valor: Infinity }]), /número/);
});

test('leer lo que dice una celda: texto compartido, texto en línea, texto de fórmula y número', () => {
  const textos = textosCompartidos('<sst><si><t>APELLIDO</t></si><si><r><t>NOM</t></r><r><t xml:space="preserve">BRE </t></r></si></sst>');
  assert.deepEqual(textos, ['APELLIDO', 'NOMBRE ']);
  assert.equal(textoDeCelda(HOJA, 'B3', textos), 'APELLIDO');
  assert.equal(textoDeCelda(HOJA, 'D3', textos), '38757');
  assert.equal(textoDeCelda(HOJA, 'E3', textos), 'x');
  assert.equal(textoDeCelda(HOJA, 'C3', textos), null, 'una celda vacía no dice nada');
  const escrita = escribirCeldas(HOJA, [{ ref: 'C3', valor: 'Ñandú & co' }]);
  assert.equal(textoDeCelda(escrita, 'C3', textos), 'Ñandú & co');
});

test('las fechas son números de serie de Excel, contados con diasEntre: su plantilla guarda el 20 de agosto de 2026 como 46254', () => {
  assert.equal(serialDeFecha('2026-08-20'), 46254);
  assert.equal(serialDeFecha('2026-08-25'), 46259);
  assert.equal(serialDeFecha('1900-03-01'), 61, 'a partir del 1 de marzo de 1900 el serial de Excel coincide con el calendario real');
  assert.equal(serialDeFecha('1985-02-09'), 31087);
});

test('una fecha que no se puede escribir devuelve null, no un número inventado: una de antes de marzo de 1900 o una que no existe', () => {
  assert.equal(serialDeFecha('1899-12-31'), null);
  assert.equal(serialDeFecha('2026-02-30'), null);
  assert.equal(serialDeFecha('20261-10-21'), null);
  assert.equal(serialDeFecha(''), null);
  assert.equal(serialDeFecha(undefined), null);
});

test('la hora es la fracción del día, como la guarda Excel: las 15:00 son 0.625', () => {
  assert.equal(fraccionDeHora('15:00'), 0.625);
  assert.equal(fraccionDeHora('00:00'), 0);
  assert.equal(fraccionDeHora('13:45'), (13 * 60 + 45) / 1440);
  assert.equal(fraccionDeHora(''), null);
  assert.equal(fraccionDeHora('25:00'), null);
  assert.equal(fraccionDeHora('abc'), null);
});

test('escaparXml y las letras de columna', () => {
  assert.equal(escaparXml('a&b<c>d"e'), 'a&amp;b&lt;c&gt;d"e');
  assert.equal(numeroDeColumna('A'), 1);
  assert.equal(numeroDeColumna('Z'), 26);
  assert.equal(numeroDeColumna('AA'), 27);
  assert.equal(numeroDeColumna('CA'), 79);
  assert.equal(columnaDeNumero(79), 'CA');
  assert.equal(columnaDeNumero(1), 'A');
  assert.equal(columnaDeNumero(52), 'AZ');
});

test('completarCeldas agrega la celda que falta EN SU LUGAR de la fila y con el estilo de sus vecinas de columna', () => {
  const hoja = '<sheetData><row r="26"><c r="A26" s="1"/><c r="B26" s="4"/><c r="D26" s="8"/></row>'
    + '<row r="27"><c r="A27" s="1"/><c r="D27" s="9"/><c r="F27" s="7"/></row></sheetData>';
  const salida = completarCeldas(hoja, ['B27', 'E27', 'G27']);
  assert.match(salida, /<c r="A27" s="1"\/><c r="B27" s="4"\/><c r="D27" s="9"\/>/, 'B27 entra entre A27 y D27, con el estilo de B26');
  assert.match(salida, /<c r="D27" s="9"\/><c r="E27"\/><c r="F27" s="7"\/><c r="G27"\/><\/row>/, 'sin vecina arriba no inventa estilo; la última va al final');
});

test('completarCeldas no toca una celda que ya existe y se niega si la fila no existe', () => {
  assert.equal(completarCeldas(HOJA, ['B3']), HOJA);
  assert.throws(() => completarCeldas(HOJA, ['B9']), /fila 9/);
});
