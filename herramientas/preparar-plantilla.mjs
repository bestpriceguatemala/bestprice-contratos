// Prepara la plantilla del respaldo a partir del Excel del dueño.
//
//   node herramientas/preparar-plantilla.mjs "<su Excel>.xlsx" plantilla/best-price.xlsx
//
// NO es un paso de armado del sistema: el sistema se sirve tal cual y no corre esto nunca. Es una herramienta que se
// usa a mano, una vez, y otra vez solo el día que él cambie el diseño de su Excel (una columna nueva, una hoja nueva).
//
// Por qué existe: la plantilla viaja DENTRO del repositorio, y el repositorio es público
// (github.com/bestpriceguatemala/bestprice-contratos). Su Excel de trabajo trae datos de personas de verdad —un
// DPI, una licencia, un teléfono, un correo, números de tarjeta de prueba—, y no están solo en las celdas: también en
// la tabla de textos compartidos (donde Excel guarda un texto aunque la celda ya se haya borrado) y en los valores en
// caché de las fórmulas. Esto deja el archivo SIN datos de nadie y CON todo lo demás: las diez hojas, los colores, las
// fórmulas, las validaciones, los formatos condicionales, la protección y la imagen.
//
// Lo que hace, en orden:
//   1. comprueba que el diseño sea el que el respaldo conoce (los encabezados): si no, se niega;
//   2. vacía las celdas de datos de CLIENTES, VEHICULOS, CONTRATOS y el formulario INGRESO DE DATOS de una renta;
//   3. quita el hipervínculo de correo de CLIENTES;
//   4. quita los valores en caché de TODAS las fórmulas (Excel calcula las que no traen valor al abrir);
//   5. vacía los textos compartidos que ninguna celda usa;
//   6. quita la cadena de cálculo (Excel la reconstruye) y los datos del autor.
import { readFileSync, writeFileSync } from 'node:fs';
import { leerZip, escribirZip } from '../js/respaldo/zip.js';
import {
  escribirCeldas, completarCeldas, celdasAusentes,
} from '../js/respaldo/hojas.js';
import { hojasDelLibro, textosDelLibro, xmlDe, ponerXml } from '../js/respaldo/libro.js';
import {
  HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO, celdasDeDatos, compararEncabezados,
} from '../js/respaldo/diseno.js';

const CELDA = /<c r="([A-Z]{1,3}\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

const vaciar = (refs) => refs.map((ref) => ({ ref, valor: null }));

/** Quita el valor en caché de toda celda con fórmula (y su tipo): Excel lo vuelve a calcular al abrir. */
function sinCache(xml) {
  return xml.replace(CELDA, (todo, ref, atributos, cuerpo) => {
    if (!cuerpo || !/<f[\s>/]/.test(cuerpo)) return todo;
    const sinValor = cuerpo.replace(/<v(?:\s[^>]*)?>[\s\S]*?<\/v>|<v\/>/g, '');
    return `<c r="${ref}"${atributos.replace(/\st="[^"]*"/, '')}>${sinValor}</c>`;
  });
}

/** Los índices de la tabla de textos que alguna celda usa. */
function textosUsados(xmlsDeHojas) {
  const usados = new Set();
  let referencias = 0;
  for (const xml of xmlsDeHojas) {
    for (const m of xml.matchAll(CELDA)) {
      if (/\st="s"/.test(m[2]) && m[3]) {
        const v = /<v>(\d+)<\/v>/.exec(m[3]);
        if (v) { usados.add(Number(v[1])); referencias += 1; }
      }
    }
  }
  return { usados, referencias };
}

export async function prepararPlantilla(bytes) {
  const partes = await leerZip(bytes);
  const hojas = hojasDelLibro(partes);
  const textos = textosDelLibro(partes);
  const parte = (nombre) => {
    const p = hojas.get(nombre);
    if (!p) throw new Error(`El Excel no trae la hoja «${nombre}».`);
    return p;
  };

  // 1. El diseño
  for (const nombre of [HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO]) {
    const fallas = compararEncabezados(nombre, xmlDe(partes, parte(nombre)), textos);
    if (fallas.length) {
      const detalle = fallas.slice(0, 5).map((f) => `${f.celda}: esperaba «${f.esperado}» y dice «${f.hay}»`).join('; ');
      throw new Error(`El diseño de la hoja ${nombre} no es el que el respaldo conoce (${detalle}). Hay que ajustar js/respaldo/diseno.js y el mapa antes de preparar la plantilla.`);
    }
  }

  // 2. Las celdas de datos
  const completadas = [];
  for (const nombre of [HOJA_CLIENTES, HOJA_VEHICULOS, HOJA_CONTRATOS, HOJA_FORMULARIO]) {
    const refs = celdasDeDatos(nombre);
    const p = parte(nombre);
    let xml = xmlDe(partes, p);
    // Faltan cuatro celdas sueltas en CLIENTES: sin celda no hay dónde escribir, y el respaldo no escribe «al lado».
    // INGRESO DE DATOS no se completa: ahí una celda ausente quiere decir que el formulario cambió.
    if (nombre !== HOJA_FORMULARIO) {
      const faltan = celdasAusentes(xml, refs);
      if (faltan.length) { xml = completarCeldas(xml, faltan); completadas.push(...faltan.map((ref) => `${nombre}!${ref}`)); }
    }
    ponerXml(partes, p, escribirCeldas(xml, vaciar(refs)));
  }

  // 3. Hipervínculos (el de correo de CLIENTES apuntaba al correo de prueba)
  for (const p of hojas.values()) {
    ponerXml(partes, p, xmlDe(partes, p).replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/g, ''));
    const rels = p.replace('worksheets/', 'worksheets/_rels/').replace(/\.xml$/, '.xml.rels');
    if (!partes.has(rels)) continue;
    const limpio = xmlDe(partes, rels).replace(/<Relationship\s[^>]*relationships\/hyperlink"[^>]*\/>/g, '');
    if (/<Relationship\s/.test(limpio)) ponerXml(partes, rels, limpio);
    else partes.delete(rels);
  }

  // 4. Valores en caché
  for (const p of hojas.values()) ponerXml(partes, p, sinCache(xmlDe(partes, p)));

  // 5. Textos compartidos que nadie usa
  const { usados, referencias } = textosUsados([...hojas.values()].map((p) => xmlDe(partes, p)));
  const sst = xmlDe(partes, 'xl/sharedStrings.xml');
  let indice = -1;
  const nuevaSst = sst
    .replace(/<si>[\s\S]*?<\/si>/g, (si) => { indice += 1; return usados.has(indice) ? si : '<si><t></t></si>'; })
    .replace(/<sst([^>]*)>/, (_, atributos) => `<sst${atributos.replace(/count="\d+"/, `count="${referencias}"`)}>`);
  ponerXml(partes, 'xl/sharedStrings.xml', nuevaSst);
  const huerfanos = textos.length - usados.size;

  // 6. Sin cadena de cálculo y sin datos del autor.
  //
  // NO se pide `fullCalcOnLoad`: las fórmulas ya no traen valor guardado, y Excel calcula las que no lo traen al abrir. Pedirle
  // además un recálculo completo no cambia ninguna cifra (se comprobó celda por celda en Excel de verdad) y sí el tiempo: con una
  // renta llena (2,000 clientes, 150 carros, 990 contratos) abrir tardó 186 s (y 454 s otra vez, con la máquina ocupada) con la bandera y 19 s sin ella.
  ponerXml(partes, 'xl/workbook.xml', xmlDe(partes, 'xl/workbook.xml')
    .replace(/<calcPr\b[^>]*\/>/, '<calcPr calcId="191029"/>'));
  partes.delete('xl/calcChain.xml');
  ponerXml(partes, 'xl/_rels/workbook.xml.rels', xmlDe(partes, 'xl/_rels/workbook.xml.rels')
    .replace(/<Relationship\s[^>]*relationships\/calcChain"[^>]*\/>/g, ''));
  ponerXml(partes, '[Content_Types].xml', xmlDe(partes, '[Content_Types].xml')
    .replace(/<Override\s[^>]*calcChain[^>]*\/>/g, ''));
  ponerXml(partes, 'docProps/core.xml', xmlDe(partes, 'docProps/core.xml')
    .replace(/<dc:title>[\s\S]*?<\/dc:title>/, '<dc:title>Best Price</dc:title>')
    .replace(/<dc:subject>[\s\S]*?<\/dc:subject>/, '<dc:subject>Contratos de renta</dc:subject>')
    .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator>Best Price Rent a Car</dc:creator>')
    .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>Best Price Rent a Car</cp:lastModifiedBy>')
    .replace(/(<dcterms:created[^>]*>)[^<]*/, '$12026-08-28T00:00:00Z')
    .replace(/(<dcterms:modified[^>]*>)[^<]*/, '$12026-10-12T00:00:00Z'));

  return { bytes: await escribirZip(partes), textosVaciados: huerfanos, celdasCompletadas: completadas };
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [entrada, salida] = process.argv.slice(2);
  if (!entrada || !salida) {
    console.error('Uso: node herramientas/preparar-plantilla.mjs "<su Excel>.xlsx" plantilla/best-price.xlsx');
    process.exit(2);
  }
  const { bytes, textosVaciados, celdasCompletadas } = await prepararPlantilla(new Uint8Array(readFileSync(entrada)));
  writeFileSync(salida, bytes);
  console.log(`Listo: ${salida} (${bytes.length} bytes). Textos compartidos vaciados: ${textosVaciados}. Celdas completadas: ${celdasCompletadas.join(', ') || 'ninguna'}.`);
}
