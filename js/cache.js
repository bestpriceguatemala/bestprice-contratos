// La copia local del negocio, para que el sistema abra al instante.
//
// Se dibuja con esto y la nube llega después. La mezcla se decide por el sello
// `actualizado` de cada ficha: gana el más nuevo, y lo marcado como borrado se
// va. Sin esa regla, una respuesta lenta de la nube podía pisar algo que el
// mostrador acababa de guardar.

/** Mezcla la copia local con lo que llegó de la nube. Función pura. */
export function mezclar(locales = [], remotos = []) {
  const porId = new Map(locales.map((x) => [x.id, x]));
  for (const r of remotos) {
    const actual = porId.get(r.id);
    if (actual && Number(actual.actualizado || 0) > Number(r.actualizado || 0)) continue;
    if (r.borrado) porId.delete(r.id);
    else porId.set(r.id, r);
  }
  return [...porId.values()];
}

/**
 * Los ids que están en la copia local pero que la nube ya no devolvió.
 *
 * `mezclar` solo suma y actualiza: nunca quita. Eso es correcto cuando la
 * respuesta puede venir incompleta, pero deja fantasmas cuando alguien borra
 * de verdad — el dueño vació sus colecciones desde la consola de Firebase y
 * el sistema siguió mostrando sus contratos de prueba.
 *
 * Quien llama tiene que pasar dos listas del MISMO alcance: la colección
 * entera contra la colección entera, o un rango de fechas contra ese mismo
 * rango. Comparar una lista completa contra una respuesta parcial borraría
 * cosas que sí existen.
 */
export function idsQueSobran(locales = [], remotos = []) {
  const vivos = new Set(remotos.map((r) => r?.id));
  return locales.filter((l) => l?.id && !vivos.has(l.id)).map((l) => l.id);
}

const BD = 'bestprice-contratos';
const VERSION_BD = 1;
const TIENDAS = ['clientes', 'vehiculos', 'contratos', 'ajustes'];

function abrir() {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(BD, VERSION_BD);
    req.onupgradeneeded = () => {
      for (const t of TIENDAS) {
        if (!req.result.objectStoreNames.contains(t)) req.result.createObjectStore(t, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

/** Guarda una colección completa en la copia local. */
export async function guardarLocal(coleccion, items) {
  const bd = await abrir();
  await new Promise((ok, mal) => {
    const tx = bd.transaction(coleccion, 'readwrite');
    for (const item of items) tx.objectStore(coleccion).put(item);
    tx.oncomplete = ok;
    tx.onerror = () => mal(tx.error);
  });
}

/** Quita de la copia local los documentos que ya no existen en la nube. */
export async function borrarLocales(coleccion, ids = []) {
  if (!ids.length) return;
  const bd = await abrir();
  await new Promise((ok, mal) => {
    const tx = bd.transaction(coleccion, 'readwrite');
    for (const id of ids) tx.objectStore(coleccion).delete(id);
    tx.oncomplete = ok;
    tx.onerror = () => mal(tx.error);
  });
}

/** Lee una colección de la copia local. Si algo falla, devuelve vacío: la nube manda. */
export async function leerLocal(coleccion) {
  try {
    const bd = await abrir();
    return await new Promise((ok, mal) => {
      const req = bd.transaction(coleccion).objectStore(coleccion).getAll();
      req.onsuccess = () => ok(req.result || []);
      req.onerror = () => mal(req.error);
    });
  } catch {
    return [];
  }
}
