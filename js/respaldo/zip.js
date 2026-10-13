// El zip del respaldo.
//
// Un .xlsx no es más que un zip de archivos XML. Este proyecto no trae librerías
// (ADR-003 explica por qué: una dependencia menos que pueda romperse, quedar sin
// mantenimiento o cambiar de licencia), y no hace falta una: lo difícil de un zip
// es la compresión, y el navegador ya la trae (`CompressionStream` y
// `DecompressionStream` con 'deflate-raw'; Chrome y Edge 103, Safari 16.4,
// Firefox 113; Node 18 también, que es donde corren las pruebas). Lo que queda
// por escribir aquí es el envoltorio: las cabeceras y el CRC-32.
//
// Solo hace lo que el respaldo necesita: método «sin comprimir» (0) o «deflate»
// (8), sin cifrado, sin zip64 (la plantilla pesa menos de un mega).

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
// Bit 11 de las banderas: los nombres van en UTF-8.
const BANDERA_UTF8 = 0x0800;
// Fecha y hora fijas en formato DOS (1 de enero de 2026, 00:00): el zip no lleva la hora del reloj para que el mismo
// contenido dé siempre los mismos bytes. La fecha del respaldo ya está dentro del archivo, en docProps/core.xml.
const DOS_FECHA = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_HORA = 0;

export const MENSAJE_NO_ES_EXCEL = 'Ese archivo no es un archivo de Excel (.xlsx) que se pueda abrir. Revisa que sea la plantilla del sistema.';
export const MENSAJE_SIN_COMPRESION = 'Este navegador no sabe armar el archivo de Excel. Abre el sistema con Chrome, Edge o Safari actualizados y vuelve a intentar.';

// ---------- CRC-32 ----------

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

/** El CRC-32 de unos bytes, como número sin signo. Excel lo revisa al abrir y, si no cuadra, ofrece «reparar» el archivo. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- compresión nativa ----------

async function pasarPor(bytes, flujo) {
  const salida = new Blob([bytes]).stream().pipeThrough(flujo);
  return new Uint8Array(await new Response(salida).arrayBuffer());
}

async function comprimir(bytes) {
  if (typeof CompressionStream === 'undefined') throw new Error(MENSAJE_SIN_COMPRESION);
  return pasarPor(bytes, new CompressionStream('deflate-raw'));
}

async function descomprimir(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error(MENSAJE_SIN_COMPRESION);
  return pasarPor(bytes, new DecompressionStream('deflate-raw'));
}

// ---------- leer ----------

/**
 * Las partes de un zip: un `Map` de nombre a bytes, en el mismo orden en que vienen en el archivo.
 *
 * Se lee por el directorio central (al final del archivo) y no por las cabeceras locales: un zip hecho por Excel puede
 * dejar el tamaño en 0 en la cabecera local y ponerlo después de los datos, y solo el directorio central lo dice
 * siempre. Y se comprueba el CRC de cada parte: una plantilla a medio bajar o dañada se niega aquí, en voz alta, y no
 * produce un respaldo que Excel luego tenga que «reparar».
 */
export async function leerZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) throw new Error(MENSAJE_NO_ES_EXCEL);
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // El registro final está en los últimos 22 bytes más un comentario de hasta 65,535: se busca hacia atrás.
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (vista.getUint32(i, true) === FIRMA_FIN) { fin = i; break; }
  }
  if (fin < 0) throw new Error(MENSAJE_NO_ES_EXCEL);

  const cuantas = vista.getUint16(fin + 10, true);
  let cursor = vista.getUint32(fin + 16, true);
  const decodificador = new TextDecoder();
  const partes = new Map();

  for (let i = 0; i < cuantas; i += 1) {
    if (cursor + 46 > bytes.length || vista.getUint32(cursor, true) !== FIRMA_CENTRAL) throw new Error(MENSAJE_NO_ES_EXCEL);
    const metodo = vista.getUint16(cursor + 10, true);
    const crc = vista.getUint32(cursor + 16, true);
    const tamanoComprimido = vista.getUint32(cursor + 20, true);
    const tamanoReal = vista.getUint32(cursor + 24, true);
    const largoNombre = vista.getUint16(cursor + 28, true);
    const largoExtra = vista.getUint16(cursor + 30, true);
    const largoComentario = vista.getUint16(cursor + 32, true);
    const inicioLocal = vista.getUint32(cursor + 42, true);
    const nombre = decodificador.decode(bytes.subarray(cursor + 46, cursor + 46 + largoNombre));
    cursor += 46 + largoNombre + largoExtra + largoComentario;

    if (inicioLocal + 30 > bytes.length || vista.getUint32(inicioLocal, true) !== FIRMA_LOCAL) throw new Error(MENSAJE_NO_ES_EXCEL);
    // Los largos del nombre y del campo extra de la cabecera LOCAL pueden ser distintos a los del directorio central.
    const inicioDatos = inicioLocal + 30 + vista.getUint16(inicioLocal + 26, true) + vista.getUint16(inicioLocal + 28, true);
    const crudos = bytes.subarray(inicioDatos, inicioDatos + tamanoComprimido);
    if (crudos.length !== tamanoComprimido) throw new Error(MENSAJE_NO_ES_EXCEL);

    const dañada = () => new Error(`La parte «${nombre}» del archivo de Excel está dañada (no cuadra su suma de verificación). No se arma nada sobre un archivo dañado.`);
    let datos;
    if (metodo === 0) datos = crudos.slice();
    else if (metodo === 8) {
      try {
        datos = tamanoReal === 0 ? new Uint8Array(0) : await descomprimir(crudos);
      } catch (error) {
        // Un byte cambiado dentro de lo comprimido hace que el flujo falle con un TypeError técnico; el dueño lee esto.
        if (error?.message === MENSAJE_SIN_COMPRESION) throw error;
        throw dañada();
      }
    } else throw new Error(MENSAJE_NO_ES_EXCEL);

    if (datos.length !== tamanoReal || crc32(datos) !== crc) throw dañada();
    if (!nombre.endsWith('/')) partes.set(nombre, datos);
  }
  return partes;
}

// ---------- escribir ----------

function cabeceraLocal({ nombreBytes, metodo, crc, tamanoComprimido, tamanoReal }) {
  const cabecera = new Uint8Array(30 + nombreBytes.length);
  const v = new DataView(cabecera.buffer);
  v.setUint32(0, FIRMA_LOCAL, true);
  v.setUint16(4, 20, true); // versión necesaria: 2.0
  v.setUint16(6, BANDERA_UTF8, true);
  v.setUint16(8, metodo, true);
  v.setUint16(10, DOS_HORA, true);
  v.setUint16(12, DOS_FECHA, true);
  v.setUint32(14, crc, true);
  v.setUint32(18, tamanoComprimido, true);
  v.setUint32(22, tamanoReal, true);
  v.setUint16(26, nombreBytes.length, true);
  v.setUint16(28, 0, true);
  cabecera.set(nombreBytes, 30);
  return cabecera;
}

function entradaCentral({ nombreBytes, metodo, crc, tamanoComprimido, tamanoReal, inicioLocal }) {
  const entrada = new Uint8Array(46 + nombreBytes.length);
  const v = new DataView(entrada.buffer);
  v.setUint32(0, FIRMA_CENTRAL, true);
  v.setUint16(4, 20, true); // hecho con la versión 2.0
  v.setUint16(6, 20, true); // versión necesaria
  v.setUint16(8, BANDERA_UTF8, true);
  v.setUint16(10, metodo, true);
  v.setUint16(12, DOS_HORA, true);
  v.setUint16(14, DOS_FECHA, true);
  v.setUint32(16, crc, true);
  v.setUint32(20, tamanoComprimido, true);
  v.setUint32(24, tamanoReal, true);
  v.setUint16(28, nombreBytes.length, true);
  v.setUint32(42, inicioLocal, true);
  entrada.set(nombreBytes, 46);
  return entrada;
}

/**
 * Arma un zip con estas partes, `[[nombre, bytes], ...]` o un `Map`, en ese orden. Excel quiere `[Content_Types].xml`
 * primero: el orden de quien llama se respeta tal cual.
 *
 * Cada parte se comprime con deflate; si comprimida no pesa menos, se guarda sin comprimir.
 */
export async function escribirZip(partes) {
  const lista = partes instanceof Map ? [...partes] : [...partes];
  const codificador = new TextEncoder();
  const locales = [];
  const centrales = [];
  let posicion = 0;

  for (const [nombre, datos] of lista) {
    const nombreBytes = codificador.encode(nombre);
    const crc = crc32(datos);
    let metodo = 0;
    let guardado = datos;
    if (datos.length > 0) {
      const comprimido = await comprimir(datos);
      if (comprimido.length < datos.length) { metodo = 8; guardado = comprimido; }
    }
    const info = {
      nombreBytes, metodo, crc, tamanoComprimido: guardado.length, tamanoReal: datos.length, inicioLocal: posicion,
    };
    const cabecera = cabeceraLocal(info);
    locales.push(cabecera, guardado);
    centrales.push(entradaCentral(info));
    posicion += cabecera.length + guardado.length;
  }

  const tamanoCentral = centrales.reduce((suma, c) => suma + c.length, 0);
  const fin = new Uint8Array(22);
  const v = new DataView(fin.buffer);
  v.setUint32(0, FIRMA_FIN, true);
  v.setUint16(8, lista.length, true);
  v.setUint16(10, lista.length, true);
  v.setUint32(12, tamanoCentral, true);
  v.setUint32(16, posicion, true);

  const todo = [...locales, ...centrales, fin];
  const salida = new Uint8Array(todo.reduce((suma, p) => suma + p.length, 0));
  let cursor = 0;
  for (const pieza of todo) { salida.set(pieza, cursor); cursor += pieza.length; }
  return salida;
}
