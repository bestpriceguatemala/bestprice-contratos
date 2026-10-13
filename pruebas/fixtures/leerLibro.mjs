// Leer de vuelta un .xlsx armado por el respaldo, para que las pruebas pregunten «¿qué quedó en esta celda?» en vez de
// comparar texto de XML. Usa el mismo zip y los mismos lectores que el sistema (no un lector aparte que pudiera
// equivocarse igual que el escritor); las pruebas de zip.test.mjs ya comprueban esa parte contra `unzip`.
import { readFileSync } from 'node:fs';
import { leerZip } from '../../js/respaldo/zip.js';
import { hojasDelLibro, textosDelLibro, xmlDe } from '../../js/respaldo/libro.js';
import { textosDeCeldas } from '../../js/respaldo/hojas.js';

export const PLANTILLA = new URL('../../plantilla/best-price.xlsx', import.meta.url);

export const leerPlantilla = () => new Uint8Array(readFileSync(PLANTILLA));

export async function abrirLibro(bytes) {
  const partes = await leerZip(bytes);
  const hojas = hojasDelLibro(partes);
  const textos = textosDelLibro(partes);
  const xmls = new Map();
  const xml = (hoja) => {
    if (!xmls.has(hoja)) xmls.set(hoja, xmlDe(partes, hojas.get(hoja)));
    return xmls.get(hoja);
  };
  return {
    partes,
    hojas,
    xml,
    /** El texto de una celda (los números, como texto), o `null` si está vacía. */
    texto: (hoja, ref) => textosDeCeldas(xml(hoja), [ref], textos).get(ref),
    /** Lo mismo, de varias celdas: `{ B3: ..., C3: ... }`. */
    textos: (hoja, refs) => Object.fromEntries(textosDeCeldas(xml(hoja), refs, textos)),
    /** El número de una celda, o `null` si está vacía. */
    numero: (hoja, ref) => {
      const t = textosDeCeldas(xml(hoja), [ref], textos).get(ref);
      return t === null ? null : Number(t);
    },
  };
}
