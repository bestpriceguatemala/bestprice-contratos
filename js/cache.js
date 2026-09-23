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
