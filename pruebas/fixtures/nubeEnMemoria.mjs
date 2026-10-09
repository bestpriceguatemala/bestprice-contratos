// La nube y la copia local FALSAS, en memoria, que comparten las pruebas de la capa de datos.
//
// La Firestore de abajo es de MENTIRA, pero imita lo que importa de la de verdad: `privado/*` y
// `pagosDueno` solo se leen con la base del área de dinero (las reglas), `setDoc` con `merge`
// mezcla los mapas por dentro, `updateDoc` entiende 'a.b' y `deleteField()`, y `runTransaction`
// hace lo que hace la de verdad: si alguien más escribió un documento que la transacción LEYÓ
// antes de que ella escriba, se descarta y se vuelve a correr desde cero (y leer después de
// escribir dentro de una transacción es un error, como en el SDK). Estas pruebas NO prueban
// a Firebase.

const sinId = ({ id: _id, ...resto }) => resto;

const BORRAR = Symbol('deleteField');
const esMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `merge: true` de Firestore: los mapas se mezclan por dentro, lo demás se reemplaza. */
function fusionar(destino, origen) {
  for (const [k, v] of Object.entries(origen)) {
    if (esMapa(v) && esMapa(destino[k])) fusionar(destino[k], v);
    else destino[k] = structuredClone(v);
  }
}

/**
 * Una Firestore en memoria con dos bases: la del mostrador (`iniciar`) y la del
 * área de dinero. `contratos` y `privados` son lo que ya está guardado;
 * `fallan` es una lista de `{ op, ruta }` que lanzan "sin internet" (sin
 * `ruta`, falla esa operación en cualquier documento).
 */
export function nubeEnMemoria({
  contratos = [], privados = {}, fallan = [], demoraMs = 0, pagosDueno = [], contadores = {},
} = {}) {
  const docs = new Map();
  for (const c of contratos) docs.set(`contratos/${c.id}`, structuredClone(sinId(c)));
  for (const [id, datos] of Object.entries(privados)) docs.set(`contratos/${id}/privado/dinero`, structuredClone(datos));
  for (const p of pagosDueno) docs.set(`pagosDueno/${p.id}`, structuredClone(p));
  for (const [id, datos] of Object.entries(contadores)) docs.set(`contadores/${id}`, structuredClone(datos));
  // Cuántas veces se escribió cada documento: lo que `runTransaction` mira para
  // saber si alguien más lo tocó entre su lectura y su escritura.
  const versiones = new Map();
  const subir = (ruta) => versiones.set(ruta, (versiones.get(ruta) ?? 0) + 1);
  const llamadas = [];
  const dbMostrador = { nombre: 'mostrador', esDinero: false };
  const dbDinero = { nombre: 'dinero', esDinero: true };
  let auto = 0;
  const vuelo = { ahora: 0, maximo: 0 };
  const falla = (op, ruta) => fallan.some((f) => f.op === op && (f.ruta === undefined || f.ruta === ruta));

  const fsMod = {
    collection: (db, nombre) => ({ coleccion: nombre, db }),
    doc: (origen, ...segmentos) => {
      if (origen.coleccion) {
        const id = segmentos[0] ?? `auto-${(auto += 1)}`;
        return { ruta: `${origen.coleccion}/${id}`, id, db: origen.db };
      }
      return { ruta: segmentos.join('/'), id: segmentos.at(-1), db: origen };
    },
    getDoc: async (ref) => {
      llamadas.push(['getDoc', ref.ruta, ref.db.nombre]);
      vuelo.ahora += 1;
      vuelo.maximo = Math.max(vuelo.maximo, vuelo.ahora);
      if (demoraMs) await new Promise((ok) => { setTimeout(ok, demoraMs); });
      vuelo.ahora -= 1;
      if (falla('getDoc', ref.ruta)) throw new Error('sin internet');
      // Las reglas: `privado` solo se lee con la credencial de dinero.
      if (ref.ruta.includes('/privado/') && !ref.db.esDinero) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      const datos = docs.get(ref.ruta);
      return { exists: () => datos !== undefined, data: () => structuredClone(datos) };
    },
    // Una consulta con `where`, como la de cargarContratos por rango de fechas.
    where: (campo, operador, valor) => ({ campo, operador, valor }),
    query: (col, ...restricciones) => ({ ...col, restricciones }),
    getDocs: async (col) => {
      llamadas.push(['getDocs', col.coleccion, col.db.nombre]);
      if (falla('getDocs', col.coleccion)) throw new Error('sin internet');
      const cumple = (datos) => (col.restricciones ?? []).every(({ campo, operador, valor }) => (
        operador === '>=' ? datos[campo] >= valor : datos[campo] <= valor
      ));
      // Las reglas: `pagosDueno` solo se lee con la credencial de dinero.
      if (col.coleccion === 'pagosDueno' && !col.db.esDinero) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      return {
        docs: [...docs]
          .filter(([ruta]) => ruta.startsWith(`${col.coleccion}/`) && ruta.split('/').length === 2)
          .filter(([, datos]) => cumple(datos))
          .map(([ruta, datos]) => ({ id: ruta.split('/')[1], data: () => structuredClone(datos) })),
      };
    },
    setDoc: async (ref, datos, opciones) => {
      llamadas.push(['setDoc', ref.ruta, structuredClone(datos), opciones, ref.db.nombre]);
      if (falla('setDoc', ref.ruta)) throw new Error('sin internet');
      // Las reglas: `pagosDueno` solo se escribe con la credencial de dinero.
      if (ref.ruta.startsWith('pagosDueno/') && !ref.db.esDinero) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      if (opciones?.merge && docs.has(ref.ruta)) fusionar(docs.get(ref.ruta), structuredClone(datos));
      else docs.set(ref.ruta, structuredClone(datos));
      subir(ref.ruta);
    },
    /**
     * Una transacción como la de Firestore: la función corre, y al terminar solo
     * se escribe si ningún documento que LEYÓ cambió mientras tanto; si cambió,
     * se vuelve a correr desde cero. Es lo que hace que dos pestañas tomando el
     * siguiente número a la vez no se lleven el mismo. Cada lectura cede el turno,
     * para que dos transacciones lanzadas juntas de verdad se crucen.
     */
    runTransaction: async (db, funcion) => {
      for (let intento = 0; intento < 5; intento += 1) {
        const leidos = new Map();
        const escritos = new Map();
        const tx = {
          get: async (ref) => {
            // Como el SDK de verdad: todas las lecturas van ANTES de la primera escritura.
            if (escritos.size) throw new Error('Firestore transactions require all reads to be executed before all writes.');
            llamadas.push(['tx.get', ref.ruta, db.nombre]);
            if (falla('tx.get', ref.ruta)) throw new Error('sin internet');
            leidos.set(ref.ruta, versiones.get(ref.ruta) ?? 0);
            await Promise.resolve();
            const datos = docs.get(ref.ruta);
            return { exists: () => datos !== undefined, data: () => structuredClone(datos) };
          },
          set: (ref, datos, opciones) => { escritos.set(ref.ruta, { datos: structuredClone(datos), merge: Boolean(opciones?.merge) }); },
        };
        const resultado = await funcion(tx);
        const alguienLoCambio = [...leidos].some(([ruta, version]) => (versiones.get(ruta) ?? 0) !== version);
        if (alguienLoCambio) continue;
        for (const [ruta, { datos, merge }] of escritos) {
          llamadas.push(['tx.set', ruta, structuredClone(datos), db.nombre]);
          if (merge && docs.has(ruta)) fusionar(docs.get(ruta), structuredClone(datos));
          else docs.set(ruta, datos);
          subir(ruta);
        }
        return resultado;
      }
      throw new Error('La transacción no pudo terminar: otro la ganó demasiadas veces.');
    },
    updateDoc: async (ref, cambios) => {
      llamadas.push(['updateDoc', ref.ruta, Object.keys(cambios), ref.db.nombre]);
      if (falla('updateDoc', ref.ruta)) throw new Error('sin internet');
      if (!docs.has(ref.ruta)) throw new Error('El documento no existe.');
      for (const [camino, valor] of Object.entries(cambios)) {
        const partes = camino.split('.');
        let nodo = docs.get(ref.ruta);
        for (const parte of partes.slice(0, -1)) nodo = nodo[parte];
        if (valor === BORRAR) delete nodo[partes.at(-1)];
        else nodo[partes.at(-1)] = structuredClone(valor);
      }
    },
    deleteField: () => BORRAR,
  };

  return {
    docs,
    llamadas,
    fallan,
    vuelo,
    dbMostrador,
    dbDinero,
    fsMod,
    iniciar: async () => ({ db: dbMostrador, fsMod }),
    /** Lo que hay en un documento, con su id, o `undefined`. */
    leer: (ruta) => (docs.has(ruta) ? { id: ruta.split('/')[1], ...structuredClone(docs.get(ruta)) } : undefined),
    escrituras: (ruta) => llamadas.filter(([op, r]) => ['setDoc', 'updateDoc'].includes(op) && (ruta === undefined || r === ruta)),
    /** Lo que se escribió DENTRO de una transacción (`tx.set`), en el orden en que se confirmó. */
    escriturasEnTransaccion: (ruta) => llamadas.filter(([op, r]) => op === 'tx.set' && (ruta === undefined || r === ruta)),
  };
}

/** La copia local en memoria, con la forma de `guardarLocal`/`leerLocal`. */
export function copiaLocalEnMemoria(iniciales = []) {
  const guardados = new Map(iniciales.map((c) => [c.id, structuredClone(c)]));
  return {
    guardados,
    leerCopia: async () => [...guardados.values()].map((c) => structuredClone(c)),
    guardarCopia: async (_coleccion, docs) => { for (const d of docs) guardados.set(d.id, structuredClone(d)); },
    borrarCopia: async (_coleccion, ids) => { for (const id of ids) guardados.delete(id); },
  };
}
