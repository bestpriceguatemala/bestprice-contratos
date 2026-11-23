// Los mensajes que LEE EL DUEÑO: que ninguno se quede vacío sin que nadie se dé cuenta.
//
// Por qué existe este archivo (23 de noviembre de 2026). Midiendo las pruebas con mutaciones salió que
// `MENSAJE_FALLO_RENTAS = ''` dejaba las 144 pruebas de comisiones VERDES. En la pantalla eso no es un
// detalle: es la barra roja de «no se pudieron leer las rentas» dibujada sin una palabra adentro, y el
// dueño mirando una pantalla sin cuentas y sin ninguna explicación de por qué. La causa era una prueba
// que armaba lo que esperaba con la misma constante que estaba revisando:
//
//     assert.match(texto(html), new RegExp(MENSAJE_FALLO_RENTAS.slice(0, 30)));
//
// Con el mensaje vacío, el patrón queda vacío, y un patrón vacío hace juego con cualquier cosa: esa
// prueba no podía ponerse roja nunca. Las siete que estaban así ya revisan el mensaje COMPLETO; y esta
// prueba cierra la clase entera de una vez, también para los mensajes que se escriban después: recorre
// TODOS los mensajes exportados del sistema y exige que cada uno siga siendo una frase de verdad.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

/** Cómo se llama un mensaje que lee el dueño. El mismo patrón que busca la prueba de abajo en el código. */
const NOMBRE_DE_MENSAJE = /^(MENSAJE|TEXTO|AVISO|FRASE)[A-Z_0-9]*$/;
const DECLARACION = /^export const ((?:MENSAJE|TEXTO|AVISO|FRASE)[A-Z_0-9]*) *=/m;

/**
 * Los archivos que declaran mensajes, escritos a mano. La prueba de más abajo confirma que esta lista
 * esté completa: si mañana una pantalla nueva declara un mensaje y nadie la agrega aquí, se pone roja.
 * Importarlos (en vez de leer su texto) es a propósito: lo que se revisa es el valor que de verdad llega
 * a la pantalla, no lo que dice el archivo.
 */
const ARCHIVOS_CON_MENSAJES = [
  'js/cache.js',
  'js/datos.js',
  'js/dinero-sesion.js',
  'js/nucleo/carro.js',
  'js/pantallas/comisiones.js',
  'js/pantallas/contratoImpreso.js',
  'js/pantallas/dinero.js',
  'js/pantallas/duenos.js',
  'js/pantallas/empleados.js',
  'js/pantallas/respaldo.js',
  'js/pantallas/sacarCarro.js',
  'js/respaldo/excel.js',
  'js/respaldo/nube.js',
  'js/respaldo/zip.js',
];

const archivosJs = (dir, fuera = []) => {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosJs(ruta, fuera);
    else if (entrada.endsWith('.js')) fuera.push(ruta);
  }
  return fuera;
};

/** Cada texto que el dueño puede leer, con su nombre completo para poder señalarlo si falla. */
async function todosLosMensajes() {
  const fuera = [];
  for (const archivo of ARCHIVOS_CON_MENSAJES) {
    const modulo = await import(new URL(archivo, new URL('..', import.meta.url)));
    for (const [nombre, valor] of Object.entries(modulo)) {
      if (!NOMBRE_DE_MENSAJE.test(nombre)) continue;
      if (typeof valor === 'string') {
        fuera.push({ donde: `${archivo} ${nombre}`, texto: valor });
      } else if (valor && typeof valor === 'object') {
        for (const [campo, dentro] of Object.entries(valor)) {
          if (typeof dentro === 'string') fuera.push({ donde: `${archivo} ${nombre}.${campo}`, texto: dentro });
        }
      }
    }
  }
  return fuera;
}

test('la lista de archivos con mensajes está completa: ningún mensaje nuevo se queda sin vigilar', () => {
  const hallados = archivosJs(join(RAIZ, 'js'))
    .filter((ruta) => DECLARACION.test(readFileSync(ruta, 'utf8')))
    .map((ruta) => relative(RAIZ, ruta))
    .sort();
  assert.deepEqual(
    hallados,
    [...ARCHIVOS_CON_MENSAJES].sort(),
    'hay un archivo que declara mensajes y no está en ARCHIVOS_CON_MENSAJES (o al revés): agrégalo para que sus mensajes queden vigilados',
  );
});

test('ningún mensaje que lee el dueño está vacío ni es relleno', async () => {
  const mensajes = await todosLosMensajes();
  assert.ok(mensajes.length >= 70, `se esperaban al menos 70 mensajes y se hallaron ${mensajes.length}: ¿se dejó de exportar alguno?`);
  for (const { donde, texto } of mensajes) {
    assert.notEqual(texto.trim(), '', `${donde} está vacío: en la pantalla sale una barra sin una palabra adentro`);
    assert.ok(texto.trim().length >= 20, `${donde} tiene ${texto.trim().length} letras: un mensaje que explica algo no cabe en menos de 20`);
    assert.ok(texto.trim().split(/\s+/).length >= 4, `${donde} tiene menos de 4 palabras: no alcanza para decir qué pasó`);
    assert.doesNotMatch(texto, /\bundefined\b|\bnull\b|\bNaN\b|\[object |\bTODO\b|\bXXX\b/, `${donde} trae relleno o un valor que se escapó`);
    assert.equal(texto, texto.replace(/^\s+|\s+$/g, ''), `${donde} empieza o termina con espacios: en la pantalla se ve como un renglón mal pegado`);
  }
});

test('ningún mensaje se repite con otro nombre: dos frases iguales en dos lugares se desincronizan', async () => {
  const mensajes = await todosLosMensajes();
  const porTexto = new Map();
  for (const m of mensajes) {
    const clave = m.texto.trim();
    porTexto.set(clave, [...(porTexto.get(clave) ?? []), m.donde]);
  }
  const repetidos = [...porTexto.entries()].filter(([, donde]) => donde.length > 1);
  // Los que hoy se repiten a propósito (la misma frase para el dueño en dos áreas distintas del sistema):
  // se dejan escritos uno por uno, para que un repetido NUEVO salga rojo y se decida a mano.
  // Son pares del área de dueños y del área de comisiones que hoy dicen lo mismo y que PUEDEN separarse
  // mañana (son dos áreas distintas del sistema): no se juntan en una sola constante a propósito.
  // Son pares del área de dueños y del área de comisiones (y dos puertas del área de dinero) que hoy dicen
  // lo mismo y que PUEDEN separarse mañana, porque son partes distintas del sistema: no se juntan en una
  // sola constante a propósito. Están escritos uno por uno para que un repetido NUEVO salga rojo.
  const CONOCIDOS = [
    'Primero entra al área de dinero: sin esa contraseña no se puede registrar el pago.',
    'No se pudo anular el pago. Revisa tu internet y vuelve a intentarlo: si ya había quedado anulado, no se anula dos veces.',
    'Este pago ya no está en la lista de pagos. No se anuló nada; la lista ya está al día, revísala.',
    'No se pudo comprobar si este pago sigue como lo ves, y anularlo sin saberlo podría pisar una anulación que ya se hizo. Revisa tu internet e intenta de nuevo; no se anuló nada.',
    'No se pudo registrar el pago. Revisa tu internet y vuelve a apretar «Guardar pago»: si ya había quedado guardado, no se duplica. Si sigue sin conectar, recarga la página y revisa «Ya pagado» antes de intentarlo otra vez.',
    'No se pudo comprobar si estas rentas ya tienen un pago registrado, y registrar sin saberlo podría pagarlas dos veces. Revisa tu internet e intenta de nuevo.',
    'No se pudo abrir el comprobante. Recarga la página e intenta de nuevo.',
  ];
  const nuevos = repetidos.filter(([texto]) => !CONOCIDOS.includes(texto));
  assert.deepEqual(
    nuevos.map(([texto, donde]) => `${donde.join(' = ')}: «${texto.slice(0, 60)}…»`),
    [],
    'dos mensajes dicen lo mismo con nombres distintos: o se comparte uno, o se agrega a CONOCIDOS a propósito',
  );
});
