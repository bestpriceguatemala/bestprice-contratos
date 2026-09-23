// La capa de datos: dibuja con la copia local al instante y sincroniza con
// Firestore por detrás (§9 del diseño — "no quiero un programa lento").
//
// Leer nunca debe romper la pantalla aunque el internet ande mal: se sirve lo
// local y la nube se intenta aparte, sin que un fallo de red se note más que
// en que los datos quedan un poco atrás. Guardar es distinto — un cliente o un
// contrato que se quedara solo en esta computadora sería un dato que el resto
// del negocio nunca ve, así que ahí sí se deja subir el error si la nube falla.
import { iniciarFirebase } from './firebase-config.js';
import { mezclar, guardarLocal, leerLocal } from './cache.js';
import { filtrar, textoDeCliente } from './nucleo/busqueda.js';

// Comprobado a mano: con las claves de Firebase todavía sin pegar (o sin
// internet), el SDK de Firestore no falla rápido — reintenta por su cuenta y
// se queda colgado sin resolver ni rechazar. Sin este límite, cualquier
// pantalla que esperara esa promesa se quedaría esperando para siempre en vez
// de mostrar la copia local o avisar del error.
const LIMITE_NUBE_MS = 8000;

function conLimiteDeTiempo(promesa, ms = LIMITE_NUBE_MS) {
  return new Promise((ok, mal) => {
    const vencido = setTimeout(() => mal(new Error('La nube no respondió a tiempo.')), ms);
    promesa.then(
      (v) => { clearTimeout(vencido); ok(v); },
      (e) => { clearTimeout(vencido); mal(e); },
    );
  });
}

/** Trae una colección completa de Firestore, con el id de cada documento. */
async function leerRemoto(coleccion) {
  const { db, fsMod } = await iniciarFirebase();
  const instantanea = await conLimiteDeTiempo(fsMod.getDocs(fsMod.collection(db, coleccion)));
  return instantanea.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Sirve una colección local al instante y, por detrás, la mezcla con lo que
 * haya en la nube y guarda el resultado — así la próxima vez que se abra ya
 * está al día. Si no hay nada local todavía (primera vez en esta computadora)
 * sí se espera a la nube: no hay copia que mostrar mientras tanto.
 */
async function cargarConSincronia(coleccion) {
  const locales = await leerLocal(coleccion);
  const sincronizar = leerRemoto(coleccion).then(async (remotos) => {
    const mezclados = mezclar(locales, remotos);
    await guardarLocal(coleccion, mezclados);
    return mezclados;
  });

  if (locales.length) {
    sincronizar.catch(() => {}); // sigue por detrás; la pantalla ya dibujó con lo local
    return locales;
  }
  try {
    return await sincronizar;
  } catch {
    return []; // sin local y sin nube: no hay nada que mostrar, pero no se rompe la pantalla
  }
}

/** La flota completa. */
export async function cargarFlota() {
  return cargarConSincronia('vehiculos');
}

/**
 * Los contratos abiertos. Este plan todavía no tiene cómo cerrar un contrato
 * (eso lo trae el plan de "recibir y cobrar"), así que por ahora el filtro
 * casi nunca quita nada; queda puesto para cuando sí pueda haber cerrados, y
 * de paso deja lista la forma en que la pantalla de flota los espera.
 */
export async function cargarContratosAbiertos() {
  const todos = await cargarConSincronia('contratos');
  return todos.filter((c) => !c?.cierre?.fechaReal);
}

// Los clientes se sincronizan una sola vez por sesión: buscar mientras se
// escribe no puede depender de la nube en cada letra (§9 del diseño). Si esa
// única sincronización no trae nada (sin copia local y sin nube), se olvida
// para que la siguiente búsqueda pueda volver a intentarlo en vez de quedar
// vacía el resto de la sesión.
let clientesListos = null;

function clientesDeLaSesion() {
  if (!clientesListos) {
    clientesListos = cargarConSincronia('clientes').then((clientes) => {
      if (!clientes.length) clientesListos = null;
      return clientes;
    });
  }
  return clientesListos;
}

/** Busca clientes en la copia local ya sincronizada. No consulta la nube por cada letra. */
export async function buscarClientes(consulta) {
  const clientes = await clientesDeLaSesion();
  return filtrar(clientes, consulta, textoDeCliente);
}

/** Guarda un cliente en la nube y refresca la copia local. */
export async function guardarCliente(cliente) {
  const { db, fsMod } = await iniciarFirebase();
  const ref = cliente?.id ? fsMod.doc(db, 'clientes', cliente.id) : fsMod.doc(fsMod.collection(db, 'clientes'));
  const guardado = { ...cliente, id: ref.id, actualizado: Date.now() };
  await conLimiteDeTiempo(fsMod.setDoc(ref, guardado, { merge: true }));
  await guardarLocal('clientes', [guardado]);
  // Si ya había una búsqueda de la sesión en curso, se le agrega de una vez:
  // el cliente que el mostrador acaba de dar de alta debe aparecer ya mismo.
  if (clientesListos) clientesListos = clientesListos.then((clientes) => mezclar(clientes, [guardado]));
  return guardado;
}

/**
 * Toma el siguiente número de contrato dentro de una transacción sobre
 * `contadores/contratos`, para que dos mostradores nunca impriman el mismo
 * número — es el número que el cliente firma en papel.
 */
export async function siguienteNumeroContrato() {
  const { db, fsMod } = await iniciarFirebase();
  const ref = fsMod.doc(db, 'contadores', 'contratos');
  return conLimiteDeTiempo(fsMod.runTransaction(db, async (tx) => {
    const actual = await tx.get(ref);
    const siguiente = (Number(actual.exists() ? actual.data().ultimo : 0) || 0) + 1;
    tx.set(ref, { ultimo: siguiente });
    return siguiente;
  }));
}

/**
 * Guarda un contrato ya completo en la nube y refresca la copia local. Si no
 * trae número todavía, lo toma de `siguienteNumeroContrato()`; si ya lo trae
 * (por ejemplo porque la pantalla lo pidió antes para imprimirlo) se respeta
 * ese mismo número en vez de gastar uno nuevo.
 */
export async function guardarContrato(contrato) {
  const numero = contrato?.numero || (await siguienteNumeroContrato());
  const { db, fsMod } = await iniciarFirebase();
  const ref = contrato?.id ? fsMod.doc(db, 'contratos', contrato.id) : fsMod.doc(fsMod.collection(db, 'contratos'));
  const guardado = { ...contrato, id: ref.id, numero, actualizado: Date.now() };
  await conLimiteDeTiempo(fsMod.setDoc(ref, guardado, { merge: true }));
  await guardarLocal('contratos', [guardado]);
  return guardado;
}
