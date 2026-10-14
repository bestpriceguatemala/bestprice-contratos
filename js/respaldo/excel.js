// El respaldo en Excel, armado: su plantilla + los datos del sistema.
//
// No se construye un libro nuevo: se abre la plantilla (su archivo, sin datos de nadie), se escriben las celdas de datos
// de CLIENTES, VEHICULOS y CONTRATOS y se vuelve a cerrar. Los colores, las fórmulas, las validaciones, la protección,
// las áreas de impresión y la imagen son los mismos bytes que tiene su archivo (ver hojas.js).
//
// Las fórmulas no traen valores guardados: Excel las calcula al abrir. Si el
// archivo se abre en «Vista protegida» —Excel lo hace con todo lo que baja de internet— las fórmulas se ven en blanco
// hasta apretar «Habilitar edición»; ver MENSAJE_VISTA_PROTEGIDA.
import { leerZip, escribirZip } from './zip.js';
import { escribirCeldas } from './hojas.js';
import { hojasDelLibro, textosDelLibro, xmlDe, ponerXml } from './libro.js';
import {
  HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO, compararEncabezados, celdasDeDatos,
} from './diseno.js';
import { armarCeldas, ErrorDeRespaldo } from './mapa.js';

export { ErrorDeRespaldo };

/** Lo que se le dice junto al botón: Excel no calcula las fórmulas de un archivo de internet hasta que se le permite editar. */
export const MENSAJE_VISTA_PROTEGIDA = 'Si Excel abre el archivo con una barra amarilla de «Vista protegida», aprieta «Habilitar edición»: hasta entonces las fórmulas (totales, buscador, fichas) se ven en blanco.';

/**
 * Arma el archivo. Devuelve `{ bytes, avisos, cuenta }`: los bytes del .xlsx, lo que hay que decirle al dueño (clientes que
 * no cupieron, contratos sin cliente…) y cuántos clientes, carros y contratos entraron.
 *
 * - `plantilla`: los bytes de plantilla/best-price.xlsx.
 * - `hoy`: 'YYYY-MM-DD', del calendario de Guatemala (hoyISO). Nunca se lee el reloj aquí.
 */
export async function armarRespaldo({
  plantilla, anio, hoy, clientes, vehiculos, contratos, pagosDueno,
}) {
  const partes = await leerZip(plantilla);
  const hojas = hojasDelLibro(partes);
  const textos = textosDelLibro(partes);

  // El diseño: antes de escribir una sola celda, la plantilla tiene que decir lo que el mapa espera.
  const nombres = { clientes: HOJA_CLIENTES, vehiculos: HOJA_VEHICULOS, contratos: HOJA_CONTRATOS };
  for (const nombre of [HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO]) {
    const parte = hojas.get(nombre);
    if (!parte) throw new ErrorDeRespaldo(`A la plantilla le falta la hoja «${nombre}». No se arma el respaldo sobre una plantilla que no es la del sistema.`);
    const fallas = compararEncabezados(nombre, xmlDe(partes, parte), textos);
    if (fallas.length) {
      const f = fallas[0];
      throw new ErrorDeRespaldo(`La hoja ${nombre} de la plantilla no es la que el sistema espera (en ${f.celda} dice «${f.hay}» y debía decir «${f.esperado}»). No se arma el respaldo: pondría datos en la columna equivocada.`);
    }
  }

  const { celdas, avisos, cuenta } = armarCeldas({
    anio, clientes, vehiculos, contratos, pagosDueno,
  });

  for (const [clave, nombre] of Object.entries(nombres)) {
    const parte = hojas.get(nombre);
    // Primero se vacía toda el área de datos y encima se escribe lo del sistema: el archivo sale igual aunque la plantilla trajera algo.
    const cambios = new Map(celdasDeDatos(nombre).map((ref) => [ref, null]));
    for (const { ref, valor } of celdas[clave]) cambios.set(ref, valor);
    ponerXml(partes, parte, escribirCeldas(xmlDe(partes, parte), [...cambios].map(([ref, valor]) => ({ ref, valor }))));
  }

  ponerXml(partes, 'docProps/core.xml', xmlDe(partes, 'docProps/core.xml')
    .replace(/<dc:title>[\s\S]*?<\/dc:title>/, `<dc:title>Best Price ${anio}</dc:title>`)
    .replace(/<dc:subject>[\s\S]*?<\/dc:subject>/, `<dc:subject>Respaldo de los contratos de ${anio}, generado el ${hoy}</dc:subject>`)
    .replace(/(<dcterms:modified[^>]*>)[^<]*/, `$1${hoy}T12:00:00Z`));

  return { bytes: await escribirZip(partes), avisos, cuenta };
}
