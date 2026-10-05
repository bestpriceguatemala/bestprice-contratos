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
  'Tienes el sistema abierto en otra pestaña con una versión anterior. '
  + 'Guarda lo que estés haciendo en ella y luego ciérrala o recárgala para continuar.';

/** Lo que lee el dueño en la pestaña que cedió la base: ya no puede usar su copia local hasta recargar. */
export const MENSAJE_PESTANA_ATRASADA =
  'Hay una versión nueva del sistema abierta en otra pestaña y esta quedó atrasada. '
  + 'Guarda lo que estés haciendo y recarga esta página para seguir.';

/**
 * Abre la copia local. Recibe la fábrica de IndexedDB y los avisos para poder
 * probar el cableado sin un navegador; `abrir()` de abajo le pasa los reales.
 *
 * Tres cosas que antes no estaban y que el dueño no podía descubrir solo:
 *
 * - `onversionchange`: cuando OTRA pestaña pide subir la versión de la base,
 *   esta conexión se cierra en vez de aferrarse a ella. Sin esto una pestaña
 *   que se quedó abierta desde la mañana bloquea para siempre a la pestaña
 *   nueva. (Solo ayuda a las pestañas que ya traen este código: una pestaña
 *   con código anterior no sabe cederla, y para ese caso está lo de abajo.)
 * - `alQuedarVieja`: cerrar la conexión deja a la pestaña que cede SIN copia
 *   local — desde ahí `leerLocal` devuelve `[]` y `guardarLocal` falla — y una
 *   lista vacía que en realidad es una conexión muerta es justo la confusión
 *   "vacío contra fallido" que este sistema ya pagó dos veces. Por eso esa
 *   pestaña lo DICE. Lo mismo si abrir falla con `VersionError`: la base ya
 *   está en una versión más nueva que el código de esta pestaña (por ejemplo
 *   porque otra pestaña la subió cuando esta ya no tenía conexión abierta).
 * - `onblocked`: si la subida igual queda bloqueada, se le DICE al dueño qué
 *   hacer. La promesa se queda esperando a propósito, no se rechaza: en cuanto
 *   la otra pestaña se cierra, la subida sigue sola y todo lo pendiente
 *   continúa sin recargar. Rechazar sería peor: en Chromium, de varias
 *   aperturas simultáneas solo la primera de la cola recibe `blocked` y las
 *   demás esperan sin que nada les avise — rechazar en `onblocked` rechazaría
 *   una y dejaría colgadas las otras, sin barra.
 */
export function abrirBase(fabrica, {
  alBloquear = () => {}, alLiberar = () => {}, alQuedarVieja = () => {},
} = {}) {
  return new Promise((ok, mal) => {
    const req = fabrica.open(BD, VERSION_BD);
    // Cada pedido avisa su bloqueo una sola vez y lo libera una sola vez, así
    // quien lleva la cuenta nunca se desfasa. (En Chromium solo el primer
    // pedido de la cola recibe `blocked`, así que la cuenta vale 0 o 1; se
    // lleva por pedido porque otro navegador podría avisar a cada uno.)
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
      bd.onversionchange = () => {
        bd.close();
        alQuedarVieja();
      };
      ok(bd);
    };
    req.onerror = () => {
      liberar();
      if (req.error?.name === 'VersionError') alQuedarVieja();
      mal(req.error);
    };
  });
}

// Los avisos viven aquí y no en una pantalla porque ocurren al abrir la copia
// local, antes de que exista ninguna pantalla que pueda hablar. Estilos en
// línea: este archivo no depende de ninguna hoja de estilos para que se vean.
// Mismo rojo que las demás barras de error.
const ID_AVISO_OTRA_PESTANA = 'aviso-otra-pestana';
const ID_AVISO_PESTANA_ATRASADA = 'aviso-pestana-atrasada';
let pedidosBloqueados = 0;

function mostrarBarra(id, texto) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const barra = document.createElement('div');
  barra.id = id;
  barra.setAttribute('role', 'alert');
  barra.textContent = texto;
  barra.style.cssText = 'background:#b3261e;color:#fff;padding:12px 16px;font-size:14px;'
    + 'font-weight:600;text-align:center;font-family:inherit;';
  document.body.insertBefore(barra, document.body.firstChild);
}

function quitarBarra(id) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.remove();
}

function alBloquearse() {
  pedidosBloqueados += 1;
  mostrarBarra(ID_AVISO_OTRA_PESTANA, MENSAJE_OTRA_PESTANA);
}

function alLiberarse() {
  pedidosBloqueados = Math.max(0, pedidosBloqueados - 1);
  // El aviso se quita cuando ya no queda ningún pedido esperando, no con el
  // primero que sale.
  if (pedidosBloqueados === 0) quitarBarra(ID_AVISO_OTRA_PESTANA);
}

function alQuedarVieja() {
  // Esta barra NO se quita sola: la pestaña no puede volver a abrir la copia
  // local con su código; lo único que lo arregla es recargar.
  mostrarBarra(ID_AVISO_PESTANA_ATRASADA, MENSAJE_PESTANA_ATRASADA);
}

function abrir() {
  return abrirBase(indexedDB, { alBloquear: alBloquearse, alLiberar: alLiberarse, alQuedarVieja });
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

/**
 * Recorre UNA tienda de la copia local entera y reemplaza cada documento por lo
 * que `transformar(doc)` devuelva; si devuelve `null`/`undefined`, ese documento
 * ya está bien y no se toca. Es el «curar lo que ya está guardado» que ni
 * `guardarLocal` (solo escribe lo nuevo) ni `mezclar` (solo mira lo que la nube
 * trae) pueden hacer: un documento que esta computadora nunca vuelve a leer no
 * se limpia solo (C1 de la revisión de las Tareas 6 y 7).
 *
 * Con `marca`, corre UNA sola vez por computadora: la marca se guarda en la
 * tienda `ajustes` dentro de la MISMA transacción que la limpieza. Así o se hace
 * todo y queda marcado, o no se hace nada y no queda marcado, y no hay un
 * estado intermedio en el que la computadora diga «ya limpié» sin haber limpiado.
 * Si la marca ya está, no se toca nada.
 *
 * A diferencia de `leerLocal`, un fallo AQUÍ SE LANZA. `leerLocal` devuelve `[]`
 * cuando algo sale mal, y una limpieza que leyera `[]` de una base que no pudo
 * abrir diría «no había nada» y dejaría la marca puesta: la computadora quedaría
 * sin limpiar y sin volver a intentarlo. Quien llama decide qué hacer con el error.
 *
 * Devuelve `{ revisados, cambiados, yaHecha }`. `abrirBd` se puede inyectar solo
 * para probar sin un navegador.
 */
export async function depurarLocal(coleccion, transformar, { marca, abrirBd = abrir } = {}) {
  const bd = await abrirBd();
  return new Promise((ok, mal) => {
    const tx = bd.transaction(marca ? [coleccion, 'ajustes'] : [coleccion], 'readwrite');
    const resultado = { revisados: 0, cambiados: 0, yaHecha: false };
    // Si `transformar` lanza se aborta la transacción A MANO y se guarda la
    // causa: el navegador, en cambio, aborta con un `AbortError` genérico que
    // no dice qué documento falló.
    let causa = null;
    tx.oncomplete = () => ok(resultado);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(causa || tx.error || new Error('La limpieza de la copia local se canceló.'));

    const tienda = tx.objectStore(coleccion);
    const recorrer = () => {
      const pedido = tienda.getAll();
      pedido.onsuccess = () => {
        try {
          for (const doc of pedido.result || []) {
            resultado.revisados += 1;
            const nuevo = transformar(doc);
            if (nuevo) {
              tienda.put(nuevo);
              resultado.cambiados += 1;
            }
          }
          if (marca) {
            tx.objectStore('ajustes').put({
              id: marca, hecha: Date.now(), revisados: resultado.revisados, cambiados: resultado.cambiados,
            });
          }
        } catch (error) {
          causa = error;
          tx.abort();
        }
      };
    };

    if (!marca) {
      recorrer();
      return;
    }
    const previa = tx.objectStore('ajustes').get(marca);
    previa.onsuccess = () => {
      if (previa.result) resultado.yaHecha = true;
      else recorrer();
    };
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
