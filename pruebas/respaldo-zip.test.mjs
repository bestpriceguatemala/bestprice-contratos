// El zip del respaldo: un .xlsx es un zip de XML, y este proyecto no trae librerías.
// Estas pruebas fijan lo que Excel exige de un zip y que aquí se arma a mano: que los
// bytes de cada parte sobrevivan intactos, que el CRC sea el de verdad (Excel lo revisa
// y ofrece «reparar» el archivo si no cuadra) y que un archivo dañado se niegue en voz alta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, leerZip, escribirZip } from '../js/respaldo/zip.js';

const enBytes = (texto) => new TextEncoder().encode(texto);
const enTexto = (bytes) => new TextDecoder().decode(bytes);

test('crc32: el vector de prueba conocido de la norma', () => {
  assert.equal(crc32(enBytes('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('un zip armado aquí se vuelve a leer con los mismos nombres, el mismo orden y los mismos bytes', async () => {
  const largo = enBytes('<c r="A1"><v>1</v></c>'.repeat(5000));
  const partes = [
    ['[Content_Types].xml', enBytes('<Types/>')],
    ['xl/worksheets/sheet1.xml', largo],
    ['xl/media/imagen.png', Uint8Array.from([137, 80, 78, 71, 0, 255, 1, 2, 3])],
    ['xl/vacio.xml', new Uint8Array(0)],
  ];
  const zip = await escribirZip(partes);
  const leido = await leerZip(zip);
  assert.deepEqual([...leido.keys()], partes.map(([nombre]) => nombre), 'el orden de las partes se conserva: [Content_Types].xml va primero');
  for (const [nombre, bytes] of partes) assert.deepEqual(leido.get(nombre), bytes, nombre);
});

test('las partes grandes se comprimen de verdad (el archivo no pesa lo que pesa el XML)', async () => {
  const largo = enBytes('<c r="A1" s="4"/>'.repeat(20000));
  const zip = await escribirZip([['hoja.xml', largo]]);
  assert.ok(zip.length < largo.length / 10, `pesa ${zip.length} bytes de ${largo.length}`);
});

test('el zip lo acepta una herramienta de verdad: `unzip -t` lo da por bueno', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'respaldo-zip-'));
  try {
    const zip = await escribirZip([
      ['[Content_Types].xml', enBytes('<Types/>')],
      ['xl/workbook.xml', enBytes('<workbook>ñ á</workbook>'.repeat(200))],
      ['docProps/ñandú.xml', enBytes('nombre con ñ')],
    ]);
    writeFileSync(join(carpeta, 'a.zip'), zip);
    const salida = execFileSync('unzip', ['-t', join(carpeta, 'a.zip')], { encoding: 'utf8' });
    assert.match(salida, /No errors detected/);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

test('lee también un zip hecho por otro programa (el de `zip`), no solo los propios', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'respaldo-zip-'));
  try {
    writeFileSync(join(carpeta, 'uno.txt'), 'primero\n'.repeat(300));
    writeFileSync(join(carpeta, 'dos.txt'), 'segundo');
    execFileSync('zip', ['-q', '-X', 'x.zip', 'uno.txt', 'dos.txt'], { cwd: carpeta });
    const { readFileSync } = await import('node:fs');
    const leido = await leerZip(new Uint8Array(readFileSync(join(carpeta, 'x.zip'))));
    assert.equal(enTexto(leido.get('uno.txt')), 'primero\n'.repeat(300));
    assert.equal(enTexto(leido.get('dos.txt')), 'segundo');
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});

test('un zip con un byte cambiado dentro de una parte se NIEGA: nunca se arma un respaldo sobre una plantilla dañada', async () => {
  const zip = await escribirZip([['hoja.xml', enBytes('<sheet>datos que no se pueden perder</sheet>'.repeat(50))]]);
  const dañado = Uint8Array.from(zip);
  dañado[60] ^= 0xff;
  await assert.rejects(() => leerZip(dañado), /dañad|no cuadra|corrupt/i);
});

test('algo que no es un zip se niega con una frase en español, no con un error técnico', async () => {
  await assert.rejects(() => leerZip(enBytes('esto no es un zip, es un texto cualquiera')), /no es un archivo de Excel|no es un zip/i);
  await assert.rejects(() => leerZip(new Uint8Array(0)), /no es un archivo de Excel|no es un zip/i);
});

test('si el navegador no trae los flujos de compresión, lo dice en español y no revienta con un TypeError', async () => {
  const original = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  try {
    await assert.rejects(() => escribirZip([['a.xml', enBytes('x'.repeat(100))]]), /navegador/i);
  } finally {
    globalThis.CompressionStream = original;
  }
});
