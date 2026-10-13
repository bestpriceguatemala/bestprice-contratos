// El libro de Excel por dentro: qué parte del zip es cada hoja.
//
// En el zip las hojas se llaman `sheet1.xml` … `sheet10.xml` y ese número no es el orden de las pestañas ni dice cuál
// es cuál: lo dicen `xl/workbook.xml` (el nombre de cada pestaña y su `r:id`) y `xl/_rels/workbook.xml.rels` (a qué
// parte apunta cada `r:id`). Confiar en «la hoja 3 es CLIENTES» funciona hasta el día que Excel renumera al guardar, y
// ese día el respaldo escribiría los clientes en los vehículos.
import { textosCompartidos } from './hojas.js';

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const desescapar = (t) => t.replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e]);

const aTexto = (bytes) => new TextDecoder().decode(bytes);
const aBytes = (texto) => new TextEncoder().encode(texto);

/** El XML de una parte del zip, como texto. Lanza en español si la parte no está. */
export function xmlDe(partes, nombre) {
  const bytes = partes.get(nombre);
  if (!bytes) throw new Error(`Al archivo de Excel le falta la parte «${nombre}». ¿Es la plantilla del sistema?`);
  return aTexto(bytes);
}

/** Pone el texto de nuevo como bytes en la parte. */
export function ponerXml(partes, nombre, xml) {
  partes.set(nombre, aBytes(xml));
}

/** `Map` de nombre de pestaña a nombre de parte del zip (`'CLIENTES'` → `'xl/worksheets/sheet3.xml'`). */
export function hojasDelLibro(partes) {
  const libro = xmlDe(partes, 'xl/workbook.xml');
  const rels = xmlDe(partes, 'xl/_rels/workbook.xml.rels');
  const destinos = new Map();
  for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /\sId="([^"]+)"/.exec(m[0])?.[1];
    const destino = /\sTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && destino) destinos.set(id, destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`);
  }
  const hojas = new Map();
  for (const m of libro.matchAll(/<sheet\s[^>]*>/g)) {
    const nombre = /\sname="([^"]+)"/.exec(m[0])?.[1];
    const id = /\sr:id="([^"]+)"/.exec(m[0])?.[1];
    if (nombre && id && destinos.has(id)) hojas.set(desescapar(nombre), destinos.get(id));
  }
  return hojas;
}

/** La tabla de textos compartidos del libro. */
export function textosDelLibro(partes) {
  return partes.has('xl/sharedStrings.xml') ? textosCompartidos(xmlDe(partes, 'xl/sharedStrings.xml')) : [];
}
