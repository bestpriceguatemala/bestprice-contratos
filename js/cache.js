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
// Subida a 2 (Tarea 4, reservaciones): una computadora que ya tenía la base
// de datos en la versión 1 solo se entera de una tienda nueva si el número de
// versión sube — si no, `onupgradeneeded` nunca se vuelve a correr, y
// `guardarLocal('reservas', ...)` fallaría con la tienda inexistente aunque
// 'reservas' ya esté en el arreglo de abajo.
// Subida a 3 (dueños de carros subarrendados): misma razón, ahora para
// 'duenos'. Sin el 3, el guardado en la nube saldría bien y el local fallaría,
// y `cargarDuenos` reportaría fallo para siempre en esta computadora.
// Subir la versión no pierde nada: el manejador de abajo solo crea las tiendas
// que faltan y en ningún lado se borra una (no hay `deleteObjectStore`), así
// que clientes, carros, contratos y reservaciones guardados se quedan como están.
const VERSION_BD = 3;
const TIENDAS = ['clientes', 'vehiculos', 'contratos', 'ajustes', 'reservas', 'duenos'];

/** Lo que lee el dueño cuando otra pestaña con código viejo le impide a esta abrir la copia local. */
export const MENSAJE_OTRA_PESTANA =
  'Tienes el sistema abierto en otra pestaña con una versión anterior. Ciérrala o recárgala para continuar.';

/**
 * Abre la copia local. Recibe la fábrica de IndexedDB y los dos avisos para
 * poder probar el cableado sin un navegador; `abrir()` de abajo le pasa los
 * reales.
 *
 * Dos cosas que antes no estaban y que el dueño no podía descubrir solo:
 *
 * - `onversionchange`: cuando OTRA pestaña pide subir la versión de la base,
 *   esta conexión se cierra en vez de aferrarse a ella. Sin esto una pestaña
 *   que se quedó abierta desde la mañana bloquea para siempre a la pestaña
 *   nueva. (Solo ayuda a las pestañas que ya traen este código: una pestaña
 *   con código anterior no sabe cederla, y para ese caso está lo de abajo.)
 * - `onblocked`: si la subida igual queda bloqueada, se le DICE al dueño qué
 *   hacer. La promesa se queda esperando a propósito, no se rechaza: en cuanto
 *   la otra pestaña se cierra, la subida sigue sola y todo lo pendiente
 *   continúa sin recargar. Rechazar sería peor — `leerLocal` lo tomaría por
 *   "no hay nada local" y `guardarLocal` fallaría DESPUÉS de que la nube ya
 *   guardó el registro, así que el dueño volvería a guardarlo y quedaría
 *   duplicado.
 */
export function abrirBase(fabrica, { alBloquear = () => {}, alLiberar = () => {} } = {}) {
  return new Promise((ok, mal) => {
    const req = fabrica.open(BD, VERSION_BD);
    // Cada pedido avisa su bloqueo una sola vez y lo libera una sola vez, así
    // quien lleva la cuenta (varias lecturas arrancan juntas) nunca se desfasa.
    let bloqueado = false;
    const liberar = () => {
      if (!bloqueado) return;
      bloqueado = false;
      alLiberar();
    };
    req.onupgradeneeded = () => {
      for (const t of TIENDAS) {
        if (!req.result.objectStoreNames.contains(t)) req.result.createObjectStore(t, { keyPath: 'id' });
      }
    };
    req.onblocked = () => {
      if (bloqueado) return;
      bloqueado = true;
      alBloquear();
    };
    req.onsuccess = () => {
      liberar();
      const bd = req.result;
      bd.onversionchange = () => bd.close();
      ok(bd);
    };
    req.onerror = () => {
      liberar();
      mal(req.error);
    };
  });
}

// El aviso vive aquí y no en una pantalla porque el bloqueo ocurre al leer la
// copia local, antes de que exista ninguna pantalla que pueda hablar.
const ID_AVISO_OTRA_PESTANA = 'aviso-otra-pestana';
let pedidosBloqueados = 0;

function mostrarAvisoOtraPestana() {
  if (typeof document === 'undefined' || document.getElementById(ID_AVISO_OTRA_PESTANA)) return;
  const barra = document.createElement('div');
  barra.id = ID_AVISO_OTRA_PESTANA;
  barra.setAttribute('role', 'alert');
  barra.textContent = MENSAJE_OTRA_PESTANA;
  // Estilos aquí mismo: este archivo no depende de ninguna hoja de estilos
  // para que el aviso se vea. Mismo rojo que las demás barras de error.
  barra.style.cssText = 'background:#b3261e;color:#fff;padding:12px 16px;font-size:14px;'
    + 'font-weight:600;text-align:center;font-family:inherit;';
  document.body.insertBefore(barra, document.body.firstChild);
}

function quitarAvisoOtraPestana() {
  if (typeof document === 'undefined') return;
  document.getElementById(ID_AVISO_OTRA_PESTANA)?.remove();
}

function alBloquearse() {
  pedidosBloqueados += 1;
  mostrarAvisoOtraPestana();
}

function alLiberarse() {
  pedidosBloqueados = Math.max(0, pedidosBloqueados - 1);
  // Varias lecturas arrancan juntas y quedan bloqueadas juntas: el aviso se
  // quita cuando ya no queda ninguna esperando, no con la primera que sale.
  if (pedidosBloqueados === 0) quitarAvisoOtraPestana();
}

function abrir() {
  return abrirBase(indexedDB, { alBloquear: alBloquearse, alLiberar: alLiberarse });
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
