// La capa de datos: dibuja con la copia local al instante y sincroniza con
// Firestore por detrás (§9 del diseño — "no quiero un programa lento").
//
// Leer nunca debe romper la pantalla aunque el internet ande mal: se sirve lo
// local y la nube se intenta aparte, sin que un fallo de red se note más que
// en que los datos quedan un poco atrás. Guardar es distinto — un cliente o un
// contrato que se quedara solo en esta computadora sería un dato que el resto
// del negocio nunca ve, así que ahí sí se deja subir el error si la nube falla
// — y solo si falla la nube: ver `guardarEnNubeYLocal`.
import { iniciarFirebase } from './firebase-config.js';
import { dbDeDinero } from './dinero-sesion.js';
import { mezclar, guardarLocal, leerLocal, idsQueSobran, borrarLocales, depurarLocal } from './cache.js';
import { filtrar, textoDeCliente } from './nucleo/busqueda.js';
import { textoDeDueno } from './nucleo/dueno.js';
import { estadoContrato } from './nucleo/estados.js';
import { cuentaDeDueno, elegirParaPago } from './nucleo/liquidacion.js';
import { estadoReserva } from './nucleo/reserva.js';
import { resumen } from './nucleo/contrato.js';
import { q, textoDosDecimales } from './nucleo/dinero.js';
import { hoyISO } from './nucleo/fechas.js';
import { aviso } from './ui.js';

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

/** Lo que lee el dueño cuando algo ya quedó guardado en la nube pero la copia de esta computadora no se pudo actualizar. */
export const MENSAJE_COPIA_LOCAL = 'Quedó guardado en la nube, pero puede que aquí tarde en verse. Si no lo ves, recarga la página.';

function avisarCopiaLocal(coleccion, error) {
  // El detalle técnico va a la consola para quien tenga que averiguarlo; al
  // dueño solo se le dice lo que le importa: su dato está a salvo.
  console.warn(`No se pudo actualizar la copia local de "${coleccion}":`, error);
  if (typeof document !== 'undefined') aviso(MENSAJE_COPIA_LOCAL, 'info');
}

/**
 * El único camino por el que un guardado llega a la nube y a la copia local.
 * Todos los `guardar*` pasan por aquí, para que el ORDEN y la regla de abajo
 * se decidan en un solo lugar.
 *
 * La regla: **cuando la escritura en la nube salió bien, el guardado salió
 * bien**, pase lo que pase con la copia local. La nube es la verdad; la copia
 * local es una comodidad para abrir rápido, y perderla cuesta una carga más
 * lenta. Dejar que su fallo reviente el guardado costaba mucho más: el
 * registro YA estaba en Firebase, el dueño veía "no se pudo guardar", volvía a
 * guardar con un formulario que todavía no traía `id`, y quedaba un documento
 * duplicado que alguien tenía que encontrar y borrar a mano. (La copia local
 * puede fallar por una pestaña vieja que bloquea la base, por disco lleno o
 * por una ventana privada.)
 *
 * Tampoco se traga en silencio: `avisar` le dice que lo guardado está a salvo
 * pero puede no verse al instante aquí. Si falla la NUBE, ese error sí sale
 * tal cual y la copia local ni se toca: no hay nada que mostrar que no esté
 * guardado de verdad.
 *
 * `armar(id)` devuelve el documento a escribir, ya con el id decidido. Las
 * dependencias se pueden inyectar solo para probar el orden sin red.
 *
 * `guardia`, si se da, hace que la escritura sea una TRANSACCIÓN: la guardia lee
 * lo que necesite y se NIEGA lanzando un error (con su código), o deja pasar y
 * puede devolver otros documentos que se escriben en la misma transacción
 * (`[{ coleccion, ref, datos }]`). Es la única forma de que una comprobación
 * («¿sigue siendo el documento que se abrió?», «¿la reservación sigue
 * pendiente?») valga *en el momento de escribir*: leer primero y escribir después,
 * por separado, deja un hueco en medio por donde cabe otra pestaña. Dentro de la
 * transacción Firestore descarta y repite la función si alguien escribió lo que
 * ésta leyó, así que la guardia puede correr más de una vez: no debe tener
 * efectos fuera de lo que lee y devuelve. Una transacción NO funciona sin red
 * (no se deja en cola): sin internet se niega, y eso es lo que se quiere.
 */
export async function guardarEnNubeYLocal(coleccion, original, armar, {
  iniciar = iniciarFirebase, guardarCopia = guardarLocal, avisar = avisarCopiaLocal, guardia = null,
} = {}) {
  const { db, fsMod } = await iniciar();
  const ref = original?.id ? fsMod.doc(db, coleccion, original.id) : fsMod.doc(fsMod.collection(db, coleccion));
  const guardado = armar(ref.id);
  let tambien = [];
  if (guardia) {
    tambien = await conLimiteDeTiempo(fsMod.runTransaction(db, async (tx) => {
      const otros = (await guardia({ tx, db, fsMod, ref })) ?? [];
      // Las lecturas de la guardia ya terminaron: desde aquí solo se escribe.
      tx.set(ref, guardado, { merge: true });
      for (const otro of otros) tx.set(otro.ref, otro.datos, { merge: true });
      return otros;
    }));
  } else {
    await conLimiteDeTiempo(fsMod.setDoc(ref, guardado, { merge: true }));
  }
  try {
    await guardarCopia(coleccion, [guardado]);
    for (const otro of tambien) await guardarCopia(otro.coleccion, [otro.datos]);
  } catch (error) {
    avisar(coleccion, error);
  }
  return guardado;
}

/** Trae una colección completa de Firestore, con el id de cada documento. */
async function leerRemoto(coleccion, iniciar = iniciarFirebase) {
  const { db, fsMod } = await iniciar();
  const instantanea = await conLimiteDeTiempo(fsMod.getDocs(fsMod.collection(db, coleccion)));
  return instantanea.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lo que de verdad se escribe en la copia local al sincronizar `coleccion`: lo
 * mismo que llegó de la nube, salvo que a los contratos se les quita el costo
 * del dueño (ver «El costo del dueño del carro», más abajo).
 *
 * La nube de un contrato que todavía no se migró (ADR-002) SÍ trae el costo en
 * su documento, y sincronizar lo escribía tal cual en IndexedDB: la limpieza de
 * arranque (`limpiarCopiaLocalDelCosto`) lo habría quitado una vez y la
 * sincronía siguiente lo habría vuelto a poner. Para que «la copia local nunca
 * tiene el costo de un subarriendo» sea cierto de verdad y no solo hasta la
 * próxima lectura, TODA escritura de contratos a la copia local pasa por
 * `sinCostoDelDueno`: ésta, la del guardado (`contratoParaGuardar`) y la de la
 * migración.
 */
const paraLaCopiaLocal = (coleccion, docs) => (coleccion === 'contratos' ? docs.map(sinCostoDelDueno) : docs);

/**
 * Compara dos copias de una colección por cantidad y por el sello
 * `actualizado` de cada documento — suficiente para saber si vale la pena
 * redibujar una pantalla, sin comparar campo por campo.
 */
function distintos(antes, despues) {
  if (antes.length !== despues.length) return true;
  const sellos = new Set(antes.map((x) => `${x.id}:${x.actualizado || 0}`));
  return despues.some((x) => !sellos.has(`${x.id}:${x.actualizado || 0}`));
}

/**
 * Decide qué se le entrega a quien pidió una colección, a partir de la copia
 * local y de cómo terminó el intento de leer la nube. Función pura — no toca
 * Firestore ni IndexedDB — para poder probar la regla sin depender de
 * ninguno de los dos.
 *
 * La regla (hallazgo crítico de la revisión final): **nunca se inventa una
 * lista vacía a partir de una lectura fallida.** Antes, sin copia local y con
 * la nube caída, `cargarConSincronia` devolvía `[]` sin más — y una pantalla
 * no tiene forma de distinguir eso de "de verdad no hay nada". Por eso esta
 * función siempre devuelve `datos` (lo mejor que hay: lo remoto si llegó, si
 * no lo local, si no vacío) junto con `fallo` (si la nube no contestó), y
 * quien la llama decide qué avisar con esa bandera en vez de que se le
 * escondan carros o contratos reales detrás de una pantalla que se ve limpia.
 */
export function resultadoLectura(locales, remoto) {
  if (remoto.ok) return { datos: remoto.valor, fallo: false };
  return { datos: locales, fallo: true };
}

/**
 * Sirve una colección local al instante y, por detrás, la mezcla con lo que
 * haya en la nube y guarda el resultado — así la próxima vez que se abra ya
 * está al día. Si no hay nada local todavía (primera vez en esta computadora)
 * sí se espera a la nube: no hay copia que mostrar mientras tanto.
 *
 * Devuelve `{ datos, fallo }` (ver `resultadoLectura`), nunca solo el arreglo:
 * `fallo` en true dice que la nube no contestó, para que la pantalla nunca
 * confunda "no pude leer" con "no hay nada".
 *
 * `alLlegar({ datos, fallo })`, si se da, avisa cuando la sincronía de atrás
 * termina — trajo algo distinto de lo que ya se sirvió, o falló — así una
 * pantalla que ya dibujó con la copia local puede volver a pintarse (con los
 * datos nuevos, o con el aviso de que la nube falló) sin que el dueño tenga
 * que recargar. No se avisa por un éxito que contesta exactamente lo mismo:
 * para eso está la comparación, en vez de redibujar cada vez que llega la nube.
 */
async function cargarConSincronia(coleccion, alLlegar, {
  iniciar = iniciarFirebase, leerCopia = leerLocal, guardarCopia = guardarLocal, borrarCopia = borrarLocales,
} = {}) {
  const locales = await leerCopia(coleccion);
  const sincronizar = leerRemoto(coleccion, iniciar).then(async (remotos) => {
    // Esta lectura trae la colección ENTERA, así que lo que esté en la copia
    // local y no venga aquí está borrado de verdad y se quita. Solo llega a
    // esta línea si la lectura salió bien: si la nube falla, se va por el
    // `catch` y no se borra nada — confundir "no pude leer" con "no hay nada"
    // fue un error grave del primer plan y no puede volver por esta puerta.
    const sobran = new Set(idsQueSobran(locales, remotos));
    const mezclados = mezclar(locales, remotos).filter((doc) => !sobran.has(doc.id));
    await guardarCopia(coleccion, paraLaCopiaLocal(coleccion, mezclados));
    await borrarCopia(coleccion, [...sobran]);
    return mezclados;
  });

  if (locales.length) {
    // Sigue por detrás; la pantalla ya dibujó con lo local. El aviso de
    // cambio solo tiene sentido aquí — en la rama de abajo la nube es la
    // primera respuesta, no una que llega después de haber mostrado algo.
    sincronizar
      .then((mezclados) => {
        const r = resultadoLectura(locales, { ok: true, valor: mezclados });
        if (alLlegar && distintos(locales, r.datos)) alLlegar(r);
      })
      .catch(() => {
        // La nube falló, pero ya se sirvió la copia local — se avisa igual,
        // para que la pantalla pueda decir que lo que se ve puede estar
        // desactualizado, sin dejar de mostrar lo que sí tiene.
        if (alLlegar) alLlegar(resultadoLectura(locales, { ok: false }));
      });
    return resultadoLectura(locales, { ok: true, valor: locales });
  }
  try {
    const remotos = await sincronizar;
    return resultadoLectura(locales, { ok: true, valor: remotos });
  } catch {
    return resultadoLectura(locales, { ok: false });
  }
}

/**
 * La flota completa, como `{ datos, fallo }` (ver `resultadoLectura`).
 * `alLlegar` avisa si la sincronía trae cambios o si falló.
 */
export async function cargarFlota(alLlegar) {
  return cargarConSincronia('vehiculos', alLlegar);
}

/**
 * Todos los clientes, como `{ datos, fallo }` (ver `resultadoLectura`).
 * `alLlegar` avisa si la sincronía trae cambios o si falló. Mismo patrón que
 * `cargarFlota`: copia local primero, nube por detrás — la pantalla de
 * clientes (Tarea 6) necesita la lista completa para su buscador y para
 * marcar licencias vencidas y saldos pendientes, así que no le sirve la
 * sesión compartida de `buscarClientes` (pensada solo para "Sacar carro").
 */
export async function cargarClientes(alLlegar) {
  return cargarConSincronia('clientes', alLlegar);
}

/**
 * Todos los dueños de carros subarrendados, como `{ datos, fallo }` (ver
 * `resultadoLectura`). Mismo patrón que `cargarClientes`, y a propósito sin
 * nada más: `cargarConSincronia` ya lleva la regla que este sistema aprendió
 * a golpes — una lectura fallida de la nube nunca se toma por una colección
 * vacía —, y reescribirla aquí sería abrir otra puerta por donde se cuele.
 */
export async function cargarDuenos(alLlegar) {
  return cargarConSincronia('duenos', alLlegar);
}

/**
 * Todas las reservaciones, como `{ datos, fallo }` (ver `resultadoLectura`).
 * Mismo patrón que `cargarClientes`: copia local primero, nube por detrás,
 * `idsQueSobran` propagando los borrados — sin reinventar nada de eso aquí,
 * `cargarConSincronia` ya hace toda la sincronía.
 */
export async function cargarReservas(alLlegar) {
  return cargarConSincronia('reservas', alLlegar);
}

/**
 * Los contratos que todavía piden algo: el carro anda fuera, falta cobrar un
 * saldo o falta soltar la garantía de la tarjeta. Los cerrados no se traen al
 * abrir: se buscan cuando alguien los busca.
 *
 * Antes este filtro miraba `cierre.fechaReal`, así que un contrato ya
 * devuelto pero con la garantía todavía bloqueada desaparecía de aquí — y la
 * lista de "garantías por liberar" de la flota se quedaba vacía siempre. Se
 * mira en cambio el campo `estado` que graba "Sacar carro" (T11): un
 * contrato guardado sin ese campo (no debería pasar, pero por si acaso) se
 * trata como 'rentado' al leerlo, para que nunca desaparezca de la pantalla.
 *
 * Devuelve `{ datos, fallo }` igual que `cargarFlota`. `alLlegar({ datos,
 * fallo })` recibe la misma forma, ya con `datos` filtrado — quien llama no
 * debería tener que saber que este filtro existe.
 */
export async function cargarContratosAbiertos(alLlegar, deps) {
  const estaAbierto = (c) => ['rentado', 'devuelto'].includes(c?.estado || 'rentado');
  const soloAbiertos = (contratos) => contratos.filter(estaAbierto);
  const r = await cargarConSincronia(
    'contratos',
    alLlegar && ((res) => alLlegar({ datos: soloAbiertos(res.datos), fallo: res.fallo })),
    deps,
  );
  return { datos: soloAbiertos(r.datos), fallo: r.fallo };
}

/** ¿Cae este contrato en el rango de `fechaSalida` pedido? Sin `desde` o sin `hasta`, ese lado queda abierto. */
const enRangoDe = ({ desde, hasta }) => (c) => (!desde || (c?.fechaSalida || '') >= desde)
  && (!hasta || (c?.fechaSalida || '') <= hasta);

/**
 * Los contratos de un rango de `fechaSalida`, leídos de la NUBE y de ningún otro
 * lado: una consulta filtrada, sin tocar la copia local. Lanza si la nube no
 * contesta (`conLimiteDeTiempo` la da por vencida). La comparten `cargarContratos`
 * y `cargarContratosDeLaNube`.
 */
async function leerContratosDelRango({ desde, hasta } = {}, iniciar = iniciarFirebase) {
  const { db, fsMod } = await iniciar();
  const restricciones = [];
  if (desde) restricciones.push(fsMod.where('fechaSalida', '>=', desde));
  if (hasta) restricciones.push(fsMod.where('fechaSalida', '<=', hasta));
  const referencia = fsMod.collection(db, 'contratos');
  const consulta = restricciones.length ? fsMod.query(referencia, ...restricciones) : referencia;
  const instantanea = await conLimiteDeTiempo(fsMod.getDocs(consulta));
  return instantanea.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Los contratos de un rango de fechas (por `fechaSalida`), como `{ datos,
 * fallo }` (ver resultadoLectura). Es lo que abre la pantalla de historial
 * (#/contratos, Tarea 8): entra con el mes en curso y solo pide un rango
 * distinto cuando el dueño lo cambia.
 *
 * A propósito NO se apoya en `cargarConSincronia`: esa función siempre trae
 * LA COLECCIÓN ENTERA (bien para clientes y flota, que de por sí son chicos,
 * pero mal para contratos — un negocio de años puede acumular miles, y el
 * diseño promete que "los años viejos no se cargan al abrir" — §9 del
 * diseño: "el sistema se queda rápido con el negocio entero adentro"). En
 * cambio arma una consulta a Firestore filtrada por `fechaSalida` (que
 * compara bien como texto por venir en 'YYYY-MM-DD', formato ISO, igual que
 * el resto de fechas.js), y solo guarda localmente lo que ese rango trajo.
 * `guardarLocal` (cache.js) escribe documento por documento (`put`), así que
 * un rango ya guardado antes convive con este sin perderse — la copia local
 * de contratos crece rango por rango, nunca de un solo golpe.
 *
 * Mismo contrato que cargarFlota/cargarClientes en todo lo demás: sirve la
 * copia local (la que ya cayera dentro de este mismo rango) al instante,
 * sincroniza por detrás, y nunca confunde "vacío" con "la nube falló"
 * (resultadoLectura). `alLlegar({ datos, fallo })` avisa solo cuando la
 * sincronía de atrás trae algo distinto de lo ya servido, o cuando falla.
 *
 * Lo que sincronizar escribe en la copia local nunca lleva el costo del dueño
 * (`paraLaCopiaLocal`); lo que se le entrega a la pantalla, en memoria, es lo que
 * la nube trajo. El área de dinero NO usa esta lectura: ver `cargarContratosDeLaNube`.
 */
export async function cargarContratos({ desde, hasta } = {}, alLlegar, {
  iniciar = iniciarFirebase, leerCopia = leerLocal, guardarCopia = guardarLocal, borrarCopia = borrarLocales,
} = {}) {
  const enRango = enRangoDe({ desde, hasta });

  const locales = (await leerCopia('contratos')).filter(enRango);

  const sincronizar = leerContratosDelRango({ desde, hasta }, iniciar).then(async (remotos) => {
    // `locales` ya viene filtrado por el mismo rango que se le pidió a la
    // nube, así que se comparan dos listas del mismo alcance: lo que falte
    // está borrado. Un contrato de otro mes ni siquiera entró en `locales`,
    // de modo que leer marzo no puede tocar lo de agosto.
    const sobran = new Set(idsQueSobran(locales, remotos));
    const mezclados = mezclar(locales, remotos).filter((doc) => !sobran.has(doc.id));
    await guardarCopia('contratos', paraLaCopiaLocal('contratos', mezclados));
    await borrarCopia('contratos', [...sobran]);
    return mezclados;
  });

  if (locales.length) {
    // Mismo mecanismo que cargarConSincronia: la pantalla ya dibujó con lo
    // local, y esto sigue por detrás para avisar si la nube trae algo
    // distinto o si falló — nunca antes de servir lo que ya había.
    sincronizar
      .then((mezclados) => {
        const r = resultadoLectura(locales, { ok: true, valor: mezclados });
        if (alLlegar && distintos(locales, r.datos)) alLlegar(r);
      })
      .catch(() => {
        if (alLlegar) alLlegar(resultadoLectura(locales, { ok: false }));
      });
    return resultadoLectura(locales, { ok: true, valor: locales });
  }
  try {
    const remotos = await sincronizar;
    return resultadoLectura(locales, { ok: true, valor: remotos });
  } catch {
    return resultadoLectura(locales, { ok: false });
  }
}

/**
 * Un contrato por su id: la copia local primero (para no esperar la nube si
 * ya se tiene), y si no está ahí, se pide directo a Firestore por su id (no
 * hace falta traer toda la colección para esto). `null` si en verdad no
 * existe en ningún lado.
 *
 * A propósito no se atrapa un fallo de red al consultar la nube: si el
 * documento no existe, `getDoc` contesta igual (`exists()` en false) y eso sí
 * es un `null` de verdad; pero si la nube no contesta (`conLimiteDeTiempo` la
 * da por vencida), eso es un fallo, no un "no existe" — confundirlos sería
 * repetir el error que resultadoLectura ya corrigió para las listas (ver más
 * arriba): una pantalla de cobro no debe decirle al dueño "este contrato no
 * existe" cuando lo que en verdad pasó es que no hubo internet.
 */
export async function cargarContrato(id) {
  if (!id) return null;
  const locales = await leerLocal('contratos');
  const local = locales.find((c) => c.id === id);
  if (local) return local;
  const { db, fsMod } = await iniciarFirebase();
  const doc = await conLimiteDeTiempo(fsMod.getDoc(fsMod.doc(db, 'contratos', id)));
  return doc.exists() ? { id: doc.id, ...doc.data() } : null;
}

// Todavía no hay pantalla de Ajustes (§6 del diseño) — es de un plan futuro
// — así que mientras el documento `ajustes/general` no exista en Firestore
// se usan estos, que son los que confirmó el dueño. El precio por día NO
// lleva mínimo aquí a propósito: él lo pone caso por caso y el sistema no
// opina ("yo pongo el precio que yo quiera").
const AJUSTES_POR_DEFECTO = {
  porcentajeTarjeta: 12,
  porcentajeComision: 5,
};

/**
 * La configuración general del negocio que usa "Sacar carro": porcentaje de
 * tarjeta y de comisión por defecto. Una lectura simple, sin copia local ni
 * sincronía de fondo (a diferencia de cargarFlota/cargarContratosAbiertos):
 * es un solo documento chico que casi no cambia, y si la nube no responde o
 * el documento todavía no existe, los valores del dueño sirven igual.
 */
export async function cargarAjustes() {
  try {
    const { db, fsMod } = await iniciarFirebase();
    const doc = await conLimiteDeTiempo(fsMod.getDoc(fsMod.doc(db, 'ajustes', 'general')));
    return doc.exists() ? { ...AJUSTES_POR_DEFECTO, ...doc.data() } : AJUSTES_POR_DEFECTO;
  } catch {
    return AJUSTES_POR_DEFECTO;
  }
}

// Los clientes se sincronizan una sola vez por sesión: buscar mientras se
// escribe no puede depender de la nube en cada letra (§9 del diseño). Si esa
// única sincronización no trae nada (sin copia local y sin nube), se olvida
// para que la siguiente búsqueda pueda volver a intentarlo en vez de quedar
// vacía el resto de la sesión.
let clientesListos = null;

function clientesDeLaSesion() {
  if (!clientesListos) {
    // El buscador no tiene dónde avisar un fallo de la nube (no hay pantalla
    // de resultados con una barra de arriba); si la lectura falló y no hay
    // nada local, `clientesListos` se olvida igual para reintentar en la
    // próxima búsqueda, en vez de quedar con una sesión de clientes vacía.
    clientesListos = cargarConSincronia('clientes').then((r) => {
      if (!r.datos.length) clientesListos = null;
      return r.datos;
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
  const guardado = await guardarEnNubeYLocal('clientes', cliente, (id) => ({ ...cliente, id, actualizado: Date.now() }));
  // Si ya había una búsqueda de la sesión en curso, se le agrega de una vez:
  // el cliente que el mostrador acaba de dar de alta debe aparecer ya mismo.
  if (clientesListos) clientesListos = clientesListos.then((clientes) => mezclar(clientes, [guardado]));
  return guardado;
}

// Mismo arreglo que los clientes: los dueños se sincronizan una sola vez por
// sesión para que buscar mientras se escribe no dependa de la nube en cada
// letra, y si esa sincronización no trae nada se olvida para reintentar.
let duenosListos = null;

function duenosDeLaSesion() {
  if (!duenosListos) {
    duenosListos = cargarConSincronia('duenos').then((r) => {
      if (!r.datos.length) duenosListos = null;
      return r.datos;
    });
  }
  return duenosListos;
}

/** Busca dueños por nombre, teléfono o NIT en la copia local ya sincronizada. */
export async function buscarDuenos(consulta) {
  const duenos = await duenosDeLaSesion();
  return filtrar(duenos, consulta, textoDeDueno);
}

/**
 * Arma el documento que de verdad se guarda para un dueño. Función **pura** —
 * sin Firestore — mismo patrón que `contratoParaGuardar`, para poder probarla
 * sin red. El `id` y `actualizado` los sella esta función y no los manda la
 * pantalla: `actualizado` es lo que `mezclar` usa para decidir quién gana, así
 * que uno copiado de la ficha vieja le haría perder contra la copia que ya
 * está en la nube. Todo lo demás de la ficha se arrastra tal cual, también los
 * campos que el formulario no conoce — así no se pierde ninguno al guardar.
 *
 * `id ?? dueno?.id` (y no `id` a secas) **difiere a propósito** de
 * `contratoParaGuardar` y `reservaParaGuardar`, que escriben `id` tal cual: si
 * a esas se les olvida pasar el id, dejan `id: undefined` pisando el del
 * registro existente, y un guardado sin id es un documento NUEVO — un
 * duplicado. Aquí un dueño que ya tiene id nunca lo pierde. No "unificar"
 * quitando el `??`; si algún día se unifican, lo sano es llevar el `??` a las
 * otras dos.
 */
export function duenoParaGuardar(dueno, { id, ahora = Date.now() } = {}) {
  return { ...dueno, id: id ?? dueno?.id, actualizado: ahora };
}

/** Guarda un dueño en la nube y refresca la copia local. */
export async function guardarDueno(dueno) {
  const guardado = await guardarEnNubeYLocal('duenos', dueno, (id) => duenoParaGuardar(dueno, { id }));
  // Igual que con los clientes: si ya había una búsqueda de la sesión en
  // curso, el dueño recién dado de alta debe aparecer ya mismo.
  if (duenosListos) duenosListos = duenosListos.then((duenos) => mezclar(duenos, [guardado]));
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

// ---------- El costo del dueño del carro (ADR-002) ----------
//
// Lo que Best Price le paga por día al dueño de un carro ajeno es el número
// más delicado del sistema: de él salen lo que se le debe al dueño y la
// utilidad de la renta. Vive en `contratos/{id}/privado/dinero`, donde solo se
// LEE con la credencial de dinero. Pero un candado solo protege lo que de
// verdad se mueve detrás de él, y este número estaba en TRES lugares:
//
//   - `subarriendo.costoDia`, el que lee resumen() (nucleo/contrato.js);
//   - `carroAjeno.costoDia`, la MISMA cifra otra vez: construirContrato copia
//     el carro ajeno entero, costo incluido, y nada la leía — por eso nadie la
//     había visto. Mover solo el primero habría dejado el segundo legible para
//     cualquier sesión, y el movimiento habría sido de adorno;
//   - la copia local de IndexedDB, que guarda el documento tal cual lo
//     escribió `guardarEnNubeYLocal` — y también tal cual lo trajo la nube al
//     sincronizar, que antes de migrar todavía lo trae.
//
// Por eso el costo se quita al ESCRIBIR, y solo vuelve a entrar al LEER, en
// memoria, para el área de dinero (`cargarContratosParaDinero`). Tres puertas,
// todas por `sinCostoDelDueno`: lo que se guarda (`contratoParaGuardar`, en la
// nube y en la copia local a la vez), lo que sincronizar escribe en la copia
// local (`paraLaCopiaLocal`) y lo que la copia local ya tenía de antes
// (`limpiarCopiaLocalDelCosto`, una vez por computadora al arrancar). La regla
// que decidió el dueño del proyecto: la copia local NUNCA guarda el costo de un
// subarriendo, en ninguna computadora, haya corrido la migración o no — y por
// eso el área de dinero lo lee de la nube y no de ahí (`cargarContratosDeLaNube`).
// El núcleo no cambió: resumen() sigue siendo el único lugar que calcula el
// costo, así que la deuda al dueño y la utilidad usan siempre la misma cifra.

/** ¿Hay aquí un número? `q()` convierte todo en 0, y un 0 inventado no es un costo anotado. */
const hayNumero = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * ¿Es un contrato de carro ajeno? La misma pregunta que hace
 * nucleo/liquidacion.js (`esDeCarroAjeno`, que no se exporta): la marca
 * `ajeno`, y no `subarriendo`, que con esta mudanza deja de estar.
 */
const esAjeno = (c) => Boolean(c?.ajeno);

/** Los costos que el documento trae por su cuenta: `subarriendo.costoDia` y `carroAjeno.costoDia`, los que haya. */
function costosEnElDocumento(contrato) {
  return [contrato?.subarriendo?.costoDia, contrato?.carroAjeno?.costoDia].filter(hayNumero).map(q);
}

/**
 * El costo por día que el contrato trae DENTRO: el de `subarriendo.costoDia`
 * (el que lee resumen()) y, si no, el de `carroAjeno.costoDia`. `null` cuando
 * no trae ninguno — y `null` no es 0: un contrato que ya migró, o que nunca
 * tuvo costo anotado, no trae ninguno, y guardarlo como 0 pisaría el costo
 * real que está tras la contraseña.
 */
export function costoDelDocumento(contrato) {
  const costos = costosEnElDocumento(contrato);
  return costos.length ? costos[0] : null;
}

/**
 * Una copia del contrato SIN el costo del dueño, en las dos llaves donde
 * `construirContrato` lo deja. Función pura: no toca el original, que sigue
 * trayendo el costo para la pantalla que lo está armando.
 *
 * `subarriendo` desaparece si el costo era lo único que tenía; un
 * `subarriendo: null` (carro propio) se queda como está.
 */
export function sinCostoDelDueno(contrato) {
  if (!esObjeto(contrato)) return contrato;
  const copia = { ...contrato };
  if (esObjeto(contrato.subarriendo) && 'costoDia' in contrato.subarriendo) {
    const { costoDia: _costo, ...resto } = contrato.subarriendo;
    if (Object.keys(resto).length) copia.subarriendo = resto;
    else delete copia.subarriendo;
  }
  if (esObjeto(contrato.carroAjeno) && 'costoDia' in contrato.carroAjeno) {
    const { costoDia: _costo, ...resto } = contrato.carroAjeno;
    copia.carroAjeno = resto;
  }
  return copia;
}

/** ¿Trae el contrato la llave `costoDia` en alguna de sus dos copias, valga lo que valga? */
const traeLlaveDeCosto = (c) => (esObjeto(c?.subarriendo) && 'costoDia' in c.subarriendo)
  || (esObjeto(c?.carroAjeno) && 'costoDia' in c.carroAjeno);

/** La marca con que `depurarLocal` recuerda que esta computadora ya se limpió. Con otro nombre, se volvería a correr. */
export const MARCA_COPIA_SIN_COSTO = 'depuracion:costo-del-dueno:1';

/**
 * Limpia, UNA vez por computadora y al arrancar, el costo del dueño que la copia
 * local de contratos ya tenga guardado — `subarriendo.costoDia` y
 * `carroAjeno.costoDia` — de TODOS los contratos, no solo de los que esta
 * computadora vuelva a leer.
 *
 * Por qué hace falta (C1 de la revisión de las Tareas 6 y 7): ADR-002 promete que
 * un contrato migrado deja de exponer el costo a quien solo tenga la sesión
 * normal, pero IndexedDB es del PERFIL del navegador, no de la cuenta de
 * Firebase, y sobrevive a cerrar la sesión. La computadora del mostrador, que
 * corrió el sistema meses antes de ADR-002, guarda el costo de todos los
 * subarriendos viejos, y la migración (que corre en la computadora del dueño)
 * no la toca; esa computadora solo se limpia de los meses que vuelva a abrir, y
 * un contrato cerrado puede no abrirse nunca. Cualquiera que se siente ahí lo lee
 * en las herramientas del navegador. Así que la regla es esta, sin importar la
 * migración: la copia local nunca guarda el costo de un subarriendo.
 *
 * Esta limpieza es la mitad de esa regla (lo que ya estaba guardado); la otra
 * mitad es que nada nuevo lo vuelva a escribir (`paraLaCopiaLocal`,
 * `contratoParaGuardar`). Y es seguro quitarlo de aquí porque el área de dinero
 * NO lo lee de aquí: lee de la nube (`cargarContratosDeLaNube`).
 *
 * LANZA si no pudo limpiar (ver `depurarLocal`): sin marca puesta, el siguiente
 * arranque lo vuelve a intentar. `depurar` se puede inyectar solo para probar.
 */
export async function limpiarCopiaLocalDelCosto({ depurar = depurarLocal } = {}) {
  return depurar('contratos', (c) => (traeLlaveDeCosto(c) ? sinCostoDelDueno(c) : null), { marca: MARCA_COPIA_SIN_COSTO });
}

/**
 * El PUENTE DE LECTURA de ADR-002: el contrato con su costo por día puesto en
 * `subarriendo.costoDia`, que es donde lo lee resumen() y, por él, la
 * liquidación y la utilidad. Función pura que devuelve una copia — nunca toca
 * el contrato que recibe: ese objeto puede ser el mismo que la sincronía de
 * fondo está a punto de escribir a la copia local, y mezclarle el costo
 * adentro lo dejaría legible en IndexedDB sin credencial.
 *
 * `costoPrivado` es lo que dice `privado/dinero` (un número, o `null` si ahí
 * no hay nada). La regla:
 *   1. si `privado` tiene un número, ese manda (aunque el documento también
 *      traiga uno: los contratos de antes de migrar);
 *   2. si no, el que el documento trae por dentro (contratos viejos, que así
 *      siguen funcionando sin que nadie los toque);
 *   3. si ninguno, el contrato se devuelve TAL CUAL: sin inventarle un
 *      `costoDia: 0`. Así sigue siendo un contrato "sin costo anotado" para
 *      `cuentaDeDueno` (liquidacion.js), y no un costo real que resultó ser cero.
 *
 * Los contratos de carro propio no se tocan nunca.
 *
 * Este puente se queda para siempre, como los de §7b del diseño: los contratos
 * de hace un año siguen trayendo su costo en el documento hasta que alguien
 * corra la migración, y después de correrla ya no hace falta mirar ahí, pero
 * mirar no cuesta nada.
 */
export function conCostoDelDueno(contrato, costoPrivado) {
  if (!esAjeno(contrato)) return contrato;
  const costo = hayNumero(costoPrivado) ? q(costoPrivado) : costoDelDocumento(contrato);
  if (costo === null) return contrato;
  const subarriendo = esObjeto(contrato.subarriendo) ? contrato.subarriendo : {};
  return { ...contrato, subarriendo: { ...subarriendo, costoDia: costo } };
}

/**
 * Arma el documento que de verdad se guarda para un contrato, a partir de lo
 * que pide guardar la pantalla más el id y número ya decididos. Función
 * pura — sin Firestore — para poder probar la regla del estado sin
 * depender de la red.
 *
 * El campo `estado` se pisa siempre con `estadoContrato(contrato)`
 * (nucleo/estados.js) en vez de confiar en lo que traiga `contrato` —
 * hallazgo importante de la revisión final: antes "Sacar carro" escribía
 * `estado: 'rentado'` a mano y nada más lo volvía a tocar, así que ese campo
 * y lo que de verdad calcula `estadoContrato()` (cierre + saldo + garantía)
 * podían desacordarse en cuanto existiera una pantalla que cerrara contratos.
 * Calculándolo aquí, en el único lugar que arma lo que se guarda, el campo
 * guardado nunca puede quedar atrás de lo que la fórmula dice.
 *
 * Por la misma razón, aquí —y solo aquí— se quita el costo del dueño (ver
 * "El costo del dueño del carro" arriba): lo que sale de esta función es lo
 * que va a la nube y a la copia local, y ninguna de las dos debe llevarlo.
 */
export function contratoParaGuardar(contrato, { id, numero, ahora = Date.now() } = {}) {
  return {
    ...sinCostoDelDueno(contrato), id, numero, actualizado: ahora, estado: estadoContrato(contrato),
  };
}

/**
 * Escribe el costo del dueño en `contratos/{id}/privado/dinero`. Crear y
 * actualizar ahí lo permite la sesión normal (firestore.rules); solo LEER pide
 * la credencial de dinero, y eso es lo que importa.
 *
 * `merge: true` para no pisar lo que ese documento llegue a guardar después
 * (comisión, pagos al dueño: §7 del diseño).
 */
async function escribirCostoDelDueno({ db, fsMod }, id, costoDia) {
  const ref = fsMod.doc(db, 'contratos', id, 'privado', 'dinero');
  await conLimiteDeTiempo(fsMod.setDoc(ref, { costoDia }, { merge: true }));
}

// ---------- Guardar sobre algo que ya cambió (prueba del sistema, 7 oct 2026: H-1 y H-3) ----------
//
// `guardarContrato` reescribía el contrato ENTERO desde la copia que la pantalla traía en memoria, y un
// arreglo (`pagos`) se reemplaza completo: con dos pestañas abiertas, la que guardaba última borraba lo que
// la otra acababa de registrar. Reproducido: la A cobra Q500, la B cobra Q300, y lo guardado quedaba con
// los Q300 solamente — el cliente entregó Q1,800 y el sistema decía Q1,300.
//
// La regla (decidida por el dueño): **un guardado que pisaría una copia distinta de la que se abrió se
// NIEGA y lo dice**. No se mezclan los dos arreglos de pagos: cada pestaña tiene una lista parcial, y
// mezclarlas contaría doble un pago que está en las dos, que es el error contrario y cuesta lo mismo. Es la
// misma forma que ya tiene el área de dinero cuando las rentas de un pago cambiaron mientras tanto
// (`MENSAJE_PAGO_CAMBIO`): no se registra nada y se dice qué hacer.

/** El código del rechazo cuando el documento cambió en la nube desde que la pantalla lo abrió. */
export const CODIGO_COPIA_VIEJA = 'copia-vieja';

/**
 * Lo que lee el dueño cuando un guardado se negó porque el contrato ya no es el que abrió. «Intenta de
 * nuevo» no sirve aquí: la copia que la pantalla tiene en memoria sigue vieja y se negaría otra vez; hay
 * que recargar. Incluye «un intento tuyo que sí había llegado»: con internet lento, el primer intento puede
 * haber aterrizado después de que la pantalla se dio por vencida.
 */
export const MENSAJE_COPIA_VIEJA = 'Este contrato cambió desde que lo abriste: otra pestaña, otra computadora —o un intento tuyo '
  + 'que sí había llegado— registró algo. No se guardó nada, para no borrar lo que ya está. '
  + 'Recarga la página, revisa cómo quedó el contrato y vuelve a hacerlo.';

/**
 * ¿Cambió el documento en la nube desde que se abrió? Se compara el sello `actualizado` por IGUALDAD, no
 * por orden: lo que importa es «¿es la misma versión que yo tengo?». «¿cuál es más nueva?» (lo que hace
 * `mezclar`, en cache.js, para decidir qué copia mostrar) depende de que dos relojes coincidan, y entre dos
 * computadoras no tienen por qué: la que escribió después podía traer un sello menor y su cambio pasaría
 * por viejo — el pago perdido otra vez, por una diferencia de minutos entre dos relojes.
 */
export function cambioDesdeQueSeAbrio(abierto, enLaNube) {
  return Number(enLaNube?.actualizado || 0) !== Number(abierto?.actualizado || 0);
}

/** Un error con código y con el documento que la nube tiene ahora, para refrescar la copia local sin ensuciar los registros. */
function rechazo(mensaje, codigo, enNube) {
  const error = Object.assign(new Error(mensaje), { codigo });
  Object.defineProperty(error, 'enNube', { value: enNube });
  return error;
}

/**
 * La guardia de un contrato que YA existía (trae `actualizado`): dentro de la transacción que lo escribe,
 * lee el documento y, si ya no es el que la pantalla abrió, se niega. Un documento que ya no existe en la
 * nube no es un cambio: se vuelve a crear, como siempre.
 */
const guardiaDeCopiaVieja = (contrato) => async ({ tx, ref }) => {
  const actual = await tx.get(ref);
  if (actual.exists() && cambioDesdeQueSeAbrio(contrato, actual.data())) {
    throw rechazo(MENSAJE_COPIA_VIEJA, CODIGO_COPIA_VIEJA, { id: ref.id, ...actual.data() });
  }
  return [];
};

/** El código del rechazo de `guardarContrato` cuando la garantía ya se soltó y el contrato todavía debe. */
export const CODIGO_GARANTIA_LIBERADA_CON_SALDO = 'garantia-liberada-con-saldo';

/**
 * Guarda un contrato ya completo en la nube y refresca la copia local. Si no
 * trae número todavía, lo toma de `siguienteNumeroContrato()`; si ya lo trae
 * (por ejemplo porque la pantalla lo pidió antes para imprimirlo) se respeta
 * ese mismo número en vez de gastar uno nuevo.
 *
 * El costo del dueño, si el contrato lo trae Y SE GUARDA POR PRIMERA VEZ, se
 * escribe PRIMERO en `privado/dinero` y el documento del contrato se escribe
 * sin él (ver `contratoParaGuardar`). Primero, y no después, por si algo falla:
 * un `privado` huérfano, de un contrato que no llegó a guardarse, no lo ve nadie
 * y el reintento (mismo id) lo reutiliza; un contrato guardado SIN su costo,
 * en cambio, quedaría diciendo "sin costo anotado" y nadie sabría que lo que
 * faltó fue un guardado a medias. Si el contrato NO trae costo (uno ya
 * migrado que se vuelve a guardar al cobrar o al recibir el carro), `privado`
 * ni se toca: escribir ahí un 0 pisaría el costo real.
 *
 * `privado` MANDA (M2 de la revisión de las Tareas 6 y 7), igual que al leer
 * (`conCostoDelDueno`) y que en la migración (que ante un costo distinto no
 * decide: avisa). Un contrato que ya existía — trae `actualizado`, que
 * `contratoParaGuardar` sella en todo lo que escribe, así que solo lo trae el
 * que vino de la nube o de la copia local — NO escribe su costo en `privado`
 * aunque el documento todavía lo traiga: la sesión normal no puede LEER
 * `privado`, no sabe qué hay ahí, y pisarlo con el del documento resolvía en
 * silencio, a favor del documento, un conflicto que la migración dejó para
 * revisar. Ese costo se queda donde está (en el documento de la nube, que un
 * `setDoc` con `merge` no borra) hasta que la migración lo mueva, que sí lee
 * `privado` antes de tocar nada. Un contrato nuevo no tiene sello y su
 * `privado` está vacío por construcción: ahí sí se escribe, y un reintento del
 * mismo guardado (mismo contrato en memoria, aún sin sello) escribe lo mismo.
 *
 * **Un contrato que ya existía solo se reescribe si en la nube sigue siendo el que
 * la pantalla abrió** (H-1, ver arriba «Guardar sobre algo que ya cambió»): se
 * compara el sello `actualizado` dentro de la misma transacción que escribe, y si
 * es otro se lanza `CODIGO_COPIA_VIEJA` sin escribir nada. Un contrato NUEVO (sin
 * sello) no se compara con nada: su id ya lo decidió `nuevoIdContrato`, nadie más
 * pudo escribirlo, y un reintento cae en el mismo documento.
 *
 * Lo que esto NO cubre: un documento sin sello `actualizado` en la nube (de antes de
 * que existiera el sello) no se puede comparar; y lo que se escribe por otro camino
 * sin subir el sello (`updateDoc` de la migración del costo, que no toca `pagos`) no
 * lo ve. Y dos mostradores que sí se enteran pero deciden distinto siguen siendo dos
 * personas: esto solo impide que una pise a la otra sin saberlo.
 *
 * Las dependencias se pueden inyectar solo para probar el orden sin red.
 */
export async function guardarContrato(contrato, {
  iniciar = iniciarFirebase, guardarCopia = guardarLocal, avisar = avisarCopiaLocal,
  numeroNuevo = siguienteNumeroContrato,
} = {}) {
  // Candado barato (CRÍTICO 2 de la revisión final): reabrir "Recibir carro"
  // sobre un contrato ya cerrado — por ejemplo con el botón "atrás" del
  // navegador — podía guardar un cierre en blanco encima del real sin que
  // nada lo impidiera. Hoy solo liberarGarantia() escribe
  // `garantiaLiberada: true`, pero el hueco es el mismo: nada evitaba que
  // ALGUNA pantalla guardara una garantía liberada sobre un contrato que en
  // realidad sigue debiendo. Se revisa aquí, en el único lugar donde de
  // verdad se escribe a la nube, no en cada pantalla que llama a esto — y
  // con el mismo mensaje que ya usa liberarGarantia(), para que el dueño
  // nunca lea dos frases distintas para el mismo motivo.
  if (contrato?.garantiaLiberada) {
    const motivo = puedeLiberarse(contrato);
    // Con código propio: ese rechazo también le llega a «Guardar correcciones» y a «Anular»
    // sobre una renta ya cerrada, y esas pantallas dicen «Intenta de nuevo» ante un fallo
    // cualquiera — reintentar aquí nunca sirve (prueba del sistema, 7 oct 2026). Con el código
    // pueden decir la razón de verdad. El mensaje no cambia.
    if (motivo) throw Object.assign(new Error(motivo), { codigo: CODIGO_GARANTIA_LIBERADA_CON_SALDO });
  }
  const numero = contrato?.numero || (await numeroNuevo());
  let original = contrato;
  const costoDia = contrato?.actualizado ? null : costoDelDocumento(contrato);
  if (costoDia !== null) {
    const nube = await iniciar();
    // El id se decide ya, para que `privado` y el contrato caigan en el mismo documento.
    const id = contrato?.id || nube.fsMod.doc(nube.fsMod.collection(nube.db, 'contratos')).id;
    await escribirCostoDelDueno(nube, id, costoDia);
    original = { ...contrato, id };
  }
  // Un contrato que YA existía se reescribe solo si en la nube sigue siendo el que la pantalla abrió (H-1).
  const guardia = contrato?.actualizado ? guardiaDeCopiaVieja(contrato) : null;
  try {
    return await guardarEnNubeYLocal(
      'contratos', original, (id) => contratoParaGuardar(contrato, { id, numero }), {
        iniciar, guardarCopia, avisar, guardia,
      },
    );
  } catch (error) {
    // Al negarse, esta computadora se queda con la copia que la nube tiene AHORA: `cargarContrato` sirve la
    // copia local primero, y sin esto «recarga la página» volvería a mostrar la misma copia vieja y el
    // intento siguiente se negaría otra vez, para siempre. Es solo comodidad: si no se puede escribir, el
    // rechazo sale igual.
    if (error?.codigo === CODIGO_COPIA_VIEJA && error.enNube) {
      try { await guardarCopia('contratos', [sinCostoDelDueno(error.enNube)]); } catch { /* la copia local es comodidad */ }
    }
    throw error;
  }
}

/**
 * Agrega un abono a `contrato.pagos`. Función **pura** (sin Firestore) para
 * poder probar la cuenta del saldo sin depender de la red — el dueño cobra en
 * dos momentos (salida y devolución) pero además "a veces abona": el cliente
 * puede dejar parte de lo que debe al traer el carro y terminar de pagar
 * después, en más de una visita.
 *
 * Un pago que no suma nada no cambia el contrato: ni sin monto (0, vacío, no
 * numérico) ni con un monto negativo. Lo segundo importa tanto como lo
 * primero — un "abono" negativo no libera la garantía antes de tiempo (el
 * saldo solo subiría), pero sí ensuciaría `pagos`, que es lo que después leen
 * los reportes de caja. Así una pantalla puede llamar a esto con lo que haya
 * en el formulario sin tener que comprobar antes si el mostrador de verdad
 * escribió una cifra válida.
 */
export function agregarPago(contrato, {
  monto, forma, porcentajeTarjeta, fecha = hoyISO(),
} = {}) {
  const montoValido = q(monto);
  if (!(montoValido > 0)) return contrato;
  const pago = {
    monto: montoValido, forma, porcentajeTarjeta: q(porcentajeTarjeta), fecha,
  };
  const pagos = Array.isArray(contrato?.pagos) ? contrato.pagos : [];
  return { ...contrato, pagos: [...pagos, pago] };
}

/**
 * Anula un pago mal registrado, sin borrarlo de `contrato.pagos`. Función
 * **pura** (sin Firestore) — quien llama guarda el resultado con
 * `guardarContrato()`, igual que con `agregarPago`.
 *
 * Por qué anular y no editar el monto (decisión del dueño, tal cual): un
 * pago que se anula deja rastro — puede tener que explicárselo a un cliente
 * — y el dinero nunca debe parecer que cambió solo. Por eso esto no quita
 * el pago del arreglo ni le toca el monto: le agrega `anulado: true` y
 * `anuladoEn` (la fecha de la anulación, no la del pago original) y lo deja
 * ahí, visible, tachado en pantalla (contratos.js). `resumen()`
 * (nucleo/contrato.js) ya sabe ignorar un pago anulado — ese es el único
 * lugar donde la aritmética cambia; aquí solo se marca.
 *
 * `indice` es la posición del pago dentro de `contrato.pagos` (los pagos no
 * traen id propio, y como nunca se reordenan ni se borran, la posición
 * alcanza para identificarlos). Un índice que no exista, o un pago que ya
 * estuviera anulado, no cambia nada — así un doble clic sobre "Anular" no
 * pisa la fecha de la primera anulación con la de un segundo clic.
 */
export function anularPago(contrato, indice, { fecha = hoyISO() } = {}) {
  const pagos = Array.isArray(contrato?.pagos) ? contrato.pagos : [];
  if (!pagos[indice] || pagos[indice].anulado) return contrato;
  const pagosActualizados = pagos.map((p, i) => (
    i === indice ? { ...p, anulado: true, anuladoEn: fecha } : p
  ));
  return { ...contrato, pagos: pagosActualizados };
}

/**
 * La razón por la que la garantía todavía no se puede liberar, o `null` si ya
 * se puede. Función **pura** — es el candado de "no libero hasta que me
 * pague" (regla del dueño, tal cual: es la única palanca que le queda una vez
 * que el carro ya volvió) separado de `liberarGarantia` a propósito, para que
 * la regla más importante de este sistema se pueda probar sin necesitar
 * Firestore ni ningún mock.
 *
 * El saldo se mide sin recargo de tarjeta, igual que en todo el sistema (ver
 * resumen() en nucleo/contrato.js): dejarla ir con saldo pendiente sería
 * dinero que el dueño ya no vuelve a ver.
 */
export function puedeLiberarse(contrato) {
  const { saldo } = resumen(contrato);
  if (saldo > 0) {
    return `Todavía debe Q${textoDosDecimales(saldo)}. La garantía se libera cuando termine de pagar.`;
  }
  return null;
}

/** El código del rechazo de `liberarGarantia` cuando el cliente todavía debe: el mensaje ya es la razón, en español. */
export const CODIGO_SALDO_PENDIENTE = 'saldo-pendiente';

/** Libera la garantía de la tarjeta. Rechaza mientras `puedeLiberarse` diga que hay motivo. */
export async function liberarGarantia(contrato) {
  const motivo = puedeLiberarse(contrato);
  if (motivo) throw Object.assign(new Error(motivo), { codigo: CODIGO_SALDO_PENDIENTE });
  return guardarContrato({ ...contrato, garantiaLiberada: true, garantiaLiberadaEn: hoyISO() });
}

/**
 * Un id nuevo para un contrato, sin escribir nada todavía (Firestore lo
 * genera localmente, sin ida y vuelta a la nube). "Sacar carro" lo pide una
 * sola vez por alquiler, antes del primer intento de guardar, y lo guarda en
 * su propio estado: si el internet se pone lento y `conLimiteDeTiempo` se da
 * por vencido antes de que la escritura en verdad llegue, un reintento con
 * `guardarContrato` cae en este mismo documento (lo sobreescribe con
 * `merge: true`) en vez de crear uno nuevo — dos contratos del mismo
 * alquiler significarían un carro comprometido dos veces y una tarjeta
 * autorizada dos veces.
 */
export async function nuevoIdContrato() {
  const { db, fsMod } = await iniciarFirebase();
  return fsMod.doc(fsMod.collection(db, 'contratos')).id;
}

/**
 * Toma el siguiente código de carro dentro de una transacción sobre
 * `contadores/vehiculos`, igual que `siguienteNumeroContrato()` sobre
 * `contadores/contratos` — el mismo mecanismo, para que dos mostradores
 * nunca den de alta dos carros con el mismo código correlativo.
 */
export async function siguienteCodigoCarro() {
  const { db, fsMod } = await iniciarFirebase();
  const ref = fsMod.doc(db, 'contadores', 'vehiculos');
  return conLimiteDeTiempo(fsMod.runTransaction(db, async (tx) => {
    const actual = await tx.get(ref);
    const siguiente = (Number(actual.exists() ? actual.data().ultimo : 0) || 0) + 1;
    tx.set(ref, { ultimo: siguiente });
    return siguiente;
  }));
}

/**
 * Guarda un carro de la flota propia en la nube y refresca la copia local.
 * Mismo patrón que `guardarContrato()`: si no trae código todavía (alta
 * nueva) lo toma de `siguienteCodigoCarro()`; si ya lo trae (edición de un
 * carro existente) se respeta ese mismo código en vez de gastar uno nuevo.
 * `vehiculo.id`, si viene, hace que se edite ese mismo documento en vez de
 * crear uno — así "marcar fuera de servicio" y "volver a habilitar" (que
 * llaman a esto de nuevo sobre un carro ya dado de alta) actualizan el carro
 * que ya existe.
 */
export async function guardarVehiculo(vehiculo) {
  const codigo = vehiculo?.codigo || (await siguienteCodigoCarro());
  return guardarEnNubeYLocal('vehiculos', vehiculo, (id) => ({ ...vehiculo, id, codigo, actualizado: Date.now() }));
}

/**
 * Arma el documento que de verdad se guarda para una reservación, a partir de
 * lo que pide guardar la pantalla más el id ya decidido. Función **pura** —
 * sin Firestore — mismo patrón que `contratoParaGuardar`: el campo `estado`
 * no se confía a lo que traiga `reserva`, se sella con `estadoReserva()`
 * (nucleo/reserva.js). Es la resolución de la Tarea 1: el estado de una
 * reservación se deriva, nunca se autoriza a mano, para que el campo guardado
 * nunca pueda desacordarse de `contratoId`/`cancelada`, que son los datos que
 * de verdad lo determinan.
 */
export function reservaParaGuardar(reserva, { id, ahora = Date.now() } = {}) {
  return {
    ...reserva, id, actualizado: ahora, estado: estadoReserva(reserva),
  };
}

/**
 * Guarda una reservación en la nube y refresca la copia local. Mismo patrón
 * que `guardarCliente`: si `reserva.id` ya existe se edita ese documento, si
 * no se mintea uno nuevo con `fsMod.collection(...)`; el documento que en
 * verdad se escribe sale de `reservaParaGuardar`, igual que `guardarContrato`
 * se apoya en `contratoParaGuardar`.
 */
export async function guardarReserva(reserva) {
  return guardarEnNubeYLocal('reservas', reserva, (id) => reservaParaGuardar(reserva, { id }));
}

/**
 * Da de baja una reservación sin borrarla del historial: la marca
 * `cancelada: true` y la guarda por el mismo camino que `guardarReserva`,
 * para que `estadoReserva` recalcule el campo `estado` al vuelo en vez de
 * escribirlo aquí a mano. Si la reservación ya tiene `contratoId` (ya se
 * entregó), `estadoReserva` la deja en 'entregada' de todos modos — una
 * cancelación tardía o un clic equivocado no puede borrar un contrato que ya
 * existe, y esta función no pone ningún candado que pelee contra esa regla.
 */
export async function cancelarReserva(reserva) {
  return guardarReserva({ ...reserva, cancelada: true });
}

// ---------- El área de dinero lee el costo del dueño (ADR-002) ----------

/** Cuántos `privado/dinero` se piden a la vez: la nube los atiende de a poco y cada uno corre con su propio límite de tiempo. */
const LECTURAS_A_LA_VEZ = 10;

/** Corre `tarea` sobre cada elemento, `tamano` a la vez. `tarea` no debe lanzar: cada una atrapa lo suyo. */
async function enTandas(items, tamano, tarea) {
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(tamano, items.length) }, async () => {
    while (siguiente < items.length) {
      const indice = siguiente;
      siguiente += 1;
      await tarea(items[indice], indice);
    }
  });
  await Promise.all(trabajadores);
}

/** Lo que dice `privado/dinero` de un contrato: el costo, o `null` si ahí no hay nada. Lanza si no se pudo leer. */
async function leerCostoPrivado(fsMod, db, id) {
  const doc = await conLimiteDeTiempo(fsMod.getDoc(fsMod.doc(db, 'contratos', id, 'privado', 'dinero')));
  if (!doc.exists()) return null;
  const costo = doc.data()?.costoDia;
  return hayNumero(costo) ? q(costo) : null;
}

/**
 * Los costos que dice `privado/dinero` de cada contrato de carro ajeno de la
 * lista, leídos con la credencial de dinero (`dbDeDinero`): la base de la
 * sesión normal no puede leer ese documento, y por eso esta función no la usa
 * para eso. Solo toma `fsMod` de `iniciarFirebase`, que es el mismo módulo de
 * Firebase (los mismos URL, ver dinero-sesion.js).
 *
 * Devuelve `{ costos, sinLeer }`:
 * - `costos`: `Map` de id a número (o `null`: se leyó y ahí no hay nada).
 * - `sinLeer`: los ids cuyo `privado/dinero` NO se pudo leer — no hay sesión
 *   de dinero, falló la nube, o venció el tiempo. "No se pudo leer" y "no hay
 *   nada" son cosas distintas y esta función nunca las mezcla: un `null` en
 *   `costos` es una lectura que salió bien.
 *
 * LANZA si `contratos` no es una lista (lo que llegue en su lugar es un error
 * de quien llama, y se ve), igual que liquidacion.js.
 */
async function costosPrivadosDe(contratos, { iniciar = iniciarFirebase, dbDinero = dbDeDinero } = {}) {
  if (!Array.isArray(contratos)) {
    throw new TypeError(
      `datos: «contratos» debe ser una lista y llegó ${contratos === null ? 'null' : typeof contratos}. `
      + 'Sin ella no se sabe de qué contratos leer el costo del dueño.',
    );
  }
  const ajenos = contratos.filter((c) => esAjeno(c) && c?.id);
  const costos = new Map();
  const sinLeer = new Set();
  if (!ajenos.length) return { costos, sinLeer: [] };

  const db = dbDinero();
  let fsMod = null;
  if (db) {
    try {
      ({ fsMod } = await iniciar());
    } catch {
      fsMod = null;
    }
  }
  if (!db || !fsMod) {
    // Sin credencial de dinero (o sin Firebase) no se leyó NINGUNO: no se
    // finge que están en cero.
    for (const c of ajenos) sinLeer.add(c.id);
  } else {
    await enTandas(ajenos, LECTURAS_A_LA_VEZ, async (c) => {
      try {
        costos.set(c.id, await leerCostoPrivado(fsMod, db, c.id));
      } catch {
        sinLeer.add(c.id);
      }
    });
  }
  return { costos, sinLeer: ajenos.map((c) => c.id).filter((id) => sinLeer.has(id)) };
}

/** `{ datos, fallo }` → lo mismo, con el costo del dueño mezclado en cada contrato ajeno, más `costoSinLeer`. */
async function conCostosDeDinero({ datos, fallo }, deps) {
  const { costos, sinLeer } = await costosPrivadosDe(datos, deps);
  return {
    datos: datos.map((c) => conCostoDelDueno(c, costos.get(c?.id))),
    fallo,
    costoSinLeer: sinLeer,
  };
}

/**
 * Los contratos de un rango para el área de dinero, leídos SOLO de la nube: ni
 * se sirve ni se escribe la copia local. Es lo que `cargarContratosParaDinero`
 * usa por omisión, y por qué no usa `cargarContratos` es lo importante de esta
 * función (C1 de la revisión de las Tareas 6 y 7):
 *
 * `cargarContratos` sirve primero la copia local, y solo avisa de lo que la nube
 * cambió si cambió el sello `actualizado`. Si el costo del dueño de un contrato
 * que todavía no se migró se leyera de ahí, limpiar la copia local (que es lo
 * que hay que hacer: ver `limpiarCopiaLocalDelCosto`) lo haría desaparecer de la
 * pantalla de dinero sin que nada avisara — la nube sigue trayéndolo, con el
 * MISMO sello —, y una deuda real se vería como «sin costo anotado». El costo del
 * dueño sale de la nube: del documento del contrato (lo viejo) o de
 * `privado/dinero` (lo nuevo), nunca de la copia local.
 *
 * Es más lenta que servir lo local, y es lo que hay: de todos modos cada contrato
 * de carro ajeno pide su `privado/dinero` a la nube, así que esta pantalla no
 * puede abrir sin red.
 *
 * Si la nube no contesta devuelve lo que haya en la copia local, SIN el costo
 * del dueño aunque esa copia todavía lo tuviera, junto con `fallo: true`: nunca
 * una lista vacía inventada a partir de una lectura fallida (`resultadoLectura`),
 * y nunca un costo leído de aquí. Sin costo, esos contratos no se pueden pagar
 * (`construirPagoDueno`). No hay sincronía de fondo, así que no usa `alLlegar`.
 */
export async function cargarContratosDeLaNube({ desde, hasta } = {}, _alLlegar, {
  iniciar = iniciarFirebase, leerCopia = leerLocal,
} = {}) {
  try {
    return resultadoLectura([], { ok: true, valor: await leerContratosDelRango({ desde, hasta }, iniciar) });
  } catch {
    const locales = (await leerCopia('contratos')).filter(enRangoDe({ desde, hasta }));
    return resultadoLectura(locales.map(sinCostoDelDueno), { ok: false });
  }
}

/**
 * Los contratos para el área de dinero, con el costo del dueño ya DENTRO de
 * cada contrato de carro ajeno (`subarriendo.costoDia`), venga de donde venga:
 * de `privado/dinero` (lo nuevo) o del documento (lo viejo, mientras no se
 * migre). Es el puente de lectura de ADR-002, y es aquí — al cargar — y no en
 * `liquidacion.js` ni en `contrato.js` donde va, por dos razones:
 *
 * - el costo lo calcula UN solo lugar, `resumen()`, y de ahí salen a la vez la
 *   deuda al dueño y la utilidad. Un puente solo en la liquidación haría que
 *   una y otra usaran costos distintos sobre el mismo contrato, sin avisar;
 * - el núcleo es puro y no sabe leer de Firestore.
 *
 * Los contratos se leen de la NUBE (`cargarContratosDeLaNube`), no de la copia
 * local: de ahí sale tanto el costo viejo del documento como el de `privado`.
 * Con eso, que la copia local nunca guarde el costo (`limpiarCopiaLocalDelCosto`)
 * no esconde nada de esta pantalla. Y el costo se mezcla sobre COPIAS de lo que
 * se leyó, nunca en el mismo objeto.
 *
 * Devuelve `{ datos, fallo, costoSinLeer }`. `fallo` es el de la lectura de
 * contratos (la nube no contestó). `costoSinLeer` son los ids de contratos ajenos cuyo
 * `privado/dinero` no se pudo leer — sin sesión de dinero, o falló la nube:
 * ahí el costo es 0 y la pantalla tiene que decirlo, no pintar "Q0.00" como si
 * fuera un costo de verdad. La marca que ya existe para eso es
 * `sinCostoAnotado` de `cuentaDeDueno` (liquidacion.js): un contrato cuyo costo
 * no se pudo leer y que no trae ninguno por dentro cae ahí SOLO, porque no se
 * le inventa un costo. `costoSinLeer` no es otra marca que compita con esa:
 * es el MOTIVO, para decir «no se pudo leer» y no «sin costo anotado» cuando
 * lo que pasó es lo primero.
 *
 * `alLlegar` (la sincronía de fondo) recibe la misma forma, ya mezclada, SI el
 * `cargar` que se use tiene sincronía de fondo. El de por omisión no la tiene
 * (espera a la nube), así que con él `alLlegar` no se llama nunca.
 * `cargar`, `iniciar`, `dbDinero` y `leerCopia` se pueden inyectar para probar sin red.
 */
export async function cargarContratosParaDinero({ desde, hasta } = {}, alLlegar, { cargar = cargarContratosDeLaNube, ...deps } = {}) {
  const lectura = await cargar(
    { desde, hasta },
    alLlegar && ((resultado) => { conCostosDeDinero(resultado, deps).then(alLlegar); }),
    deps,
  );
  return conCostosDeDinero(lectura, deps);
}

// ---------- La migración del costo del dueño (ADR-002) ----------

/** Lo que lee el dueño si aprieta el botón sin haber entrado al área de dinero. */
export const MENSAJE_MIGRAR_SIN_DINERO = 'Primero entra al área de dinero: sin esa contraseña no se puede mover el costo de los dueños.';

/** La lectura de TODOS los contratos puede tardar más que cualquier otra: es una sola vez, a mano. */
const LIMITE_MIGRACION_MS = 30000;

/** Qué quitarle al documento de un contrato para que ya no traiga el costo. */
function cambiosParaQuitarElCosto(contrato, fsMod) {
  const cambios = {};
  if (esObjeto(contrato.subarriendo) && 'costoDia' in contrato.subarriendo) {
    // Si el costo era lo único que `subarriendo` tenía, se quita entero: así
    // queda igual que un contrato nuevo, que ya no lo lleva.
    if (Object.keys(contrato.subarriendo).some((k) => k !== 'costoDia')) cambios['subarriendo.costoDia'] = fsMod.deleteField();
    else cambios.subarriendo = fsMod.deleteField();
  }
  if (esObjeto(contrato.carroAjeno) && 'costoDia' in contrato.carroAjeno) cambios['carroAjeno.costoDia'] = fsMod.deleteField();
  return cambios;
}

/**
 * Mueve el costo de UN contrato: lo copia a `privado/dinero` y SOLO DESPUÉS
 * lo quita del documento. Ese orden es todo el cuidado: si algo falla a la
 * mitad, el costo sigue en el documento y no se perdió, y volver a correr
 * termina el trabajo. Devuelve 'movido' o 'conflicto'.
 *
 * Conflicto: el documento trae dos costos distintos (`subarriendo.costoDia` y
 * `carroAjeno.costoDia`), o trae uno distinto del que ya está en `privado`.
 * No se adivina cuál es el bueno — "nunca ajustar una cifra" — ni se borra
 * ninguno: se deja como está y se avisa.
 */
async function moverElCostoDe(contrato, { db, fsMod }) {
  const costos = costosEnElDocumento(contrato);
  if (new Set(costos).size > 1) return 'conflicto';
  const costo = costos[0];

  const refPrivado = fsMod.doc(db, 'contratos', contrato.id, 'privado', 'dinero');
  const enPrivado = await leerCostoPrivado(fsMod, db, contrato.id);
  if (enPrivado !== null && enPrivado !== costo) return 'conflicto';
  // Si ya está igual en `privado` (por ejemplo, un guardado posterior lo
  // copió allá) no se vuelve a escribir: solo falta quitarlo del documento.
  if (enPrivado === null) await conLimiteDeTiempo(fsMod.setDoc(refPrivado, { costoDia: costo }, { merge: true }));

  await conLimiteDeTiempo(fsMod.updateDoc(fsMod.doc(db, 'contratos', contrato.id), cambiosParaQuitarElCosto(contrato, fsMod)));
  return 'movido';
}

/**
 * Mueve, UNA SOLA VEZ y a mano, el costo del dueño de todos los contratos ya
 * guardados — de `subarriendo.costoDia` y `carroAjeno.costoDia` en el documento
 * a `contratos/{id}/privado/dinero` —. Es lo que corre el botón del área de
 * dinero. NO se llama sola al abrir: una migración que corre sola es una
 * migración que nadie vio correr.
 *
 * Se puede correr dos veces sin daño: la segunda no encuentra ningún contrato
 * que traiga el costo y no escribe nada. Si la primera se cortó a la mitad
 * (internet), la segunda termina lo que faltó.
 *
 * Todo va con la credencial de dinero (la única que puede leer `privado`, para
 * comprobar qué hay ahí antes de tocar nada). Sin ella LANZA, y también lanza
 * si no se pudieron leer los contratos: una lectura fallida no es "no hay
 * nada que migrar", y decir "0 contratos migrados" sobre una lectura caída
 * dejaría al dueño creyendo que ya quedó todo detrás de la contraseña.
 *
 * Los contratos se leen de la NUBE, no de la copia local, que puede traer solo
 * algunos meses. Y al final se limpia la copia local de esta computadora: el
 * documento ya no trae el costo, pero IndexedDB guardaba su propia copia, y
 * mover el costo sin limpiarla sería de adorno. Las copias de las OTRAS
 * computadoras no dependen de esto: cada una se limpia sola al arrancar
 * (`limpiarCopiaLocalDelCosto`), de TODOS sus contratos, los vuelva a leer o no.
 *
 * Devuelve `{ revisados, migrados, conflictos, fallidos, copiaLocalLimpia }`;
 * `conflictos` y `fallidos` son listas de `{ id, numero }`. `mensajeDeMigracion`
 * lo convierte en lo que lee el dueño. `alAvanzar(hechos, total)` va contando.
 */
export async function migrarCostosDelDueno({
  iniciar = iniciarFirebase, dbDinero = dbDeDinero, leerCopia = leerLocal, guardarCopia = guardarLocal,
  alAvanzar = () => {},
} = {}) {
  const db = dbDinero();
  if (!db) throw new Error(MENSAJE_MIGRAR_SIN_DINERO);
  const { fsMod } = await iniciar();

  const instantanea = await conLimiteDeTiempo(fsMod.getDocs(fsMod.collection(db, 'contratos')), LIMITE_MIGRACION_MS);
  const contratos = instantanea.docs.map((d) => ({ id: d.id, ...d.data() }));
  const pendientes = contratos.filter((c) => costosEnElDocumento(c).length > 0);

  const resultado = {
    revisados: contratos.length, migrados: 0, conflictos: [], fallidos: [], copiaLocalLimpia: true,
  };
  // Los que siguen trayendo el costo en la nube al terminar: no se limpian de la copia local.
  const siguenConCosto = new Set();
  const referencia = (c) => ({ id: c.id, numero: c.numero ?? null });

  // De uno en uno, a propósito: si algo falla, el estado queda claro, y es
  // una sola vez en la vida del sistema.
  for (let i = 0; i < pendientes.length; i += 1) {
    const c = pendientes[i];
    try {
      if (await moverElCostoDe(c, { db, fsMod }) === 'movido') {
        resultado.migrados += 1;
      } else {
        resultado.conflictos.push(referencia(c));
        siguenConCosto.add(c.id);
      }
    } catch {
      resultado.fallidos.push(referencia(c));
      siguenConCosto.add(c.id);
    }
    alAvanzar(i + 1, pendientes.length);
  }

  // La copia local: a todo contrato que ya no trae el costo en la nube se le
  // quita de aquí también. No depende de lo que se migró en ESTA corrida: así
  // una segunda corrida limpia lo que la primera no pudo.
  const idsDeLaNube = new Set(contratos.map((c) => c.id));
  try {
    const sucias = (await leerCopia('contratos'))
      .filter((c) => idsDeLaNube.has(c?.id) && !siguenConCosto.has(c.id) && costosEnElDocumento(c).length > 0)
      .map(sinCostoDelDueno);
    if (sucias.length) await guardarCopia('contratos', sucias);
  } catch (error) {
    console.warn('No se pudo limpiar el costo del dueño de la copia local:', error);
    resultado.copiaLocalLimpia = false;
  }
  return resultado;
}

const cuantosContratos = (n) => (n === 1 ? '1 contrato' : `${n} contratos`);

/** «N° 12, N° 15 y 3 más»: de cuáles contratos se habla, por el número que él conoce. */
function numerosDe(contratos) {
  const nombres = contratos.map((c) => (c.numero ? `N° ${c.numero}` : 'sin número'));
  if (nombres.length <= 5) return nombres.join(', ');
  return `${nombres.slice(0, 5).join(', ')} y ${nombres.length - 5} más`;
}

/**
 * Lo que lee el dueño después de apretar el botón: cuántos contratos movió y,
 * si quedó alguno sin mover, cuáles y qué hacer. Función pura.
 */
export function mensajeDeMigracion({
  migrados = 0, conflictos = [], fallidos = [], copiaLocalLimpia = true,
} = {}) {
  const partes = [];
  if (migrados > 0) {
    partes.push(`Se ${migrados === 1 ? 'movió' : 'movieron'} ${cuantosContratos(migrados)} detrás de la contraseña de dinero.`);
  } else if (!conflictos.length && !fallidos.length) {
    partes.push('No había nada que mover: ningún contrato trae ya el costo del dueño en su documento.');
  }
  if (conflictos.length) {
    partes.push(
      conflictos.length === 1
        ? `El contrato ${numerosDe(conflictos)} trae un costo distinto al que ya estaba guardado detrás de la contraseña. No se tocó: hay que revisarlo.`
        : `Los contratos ${numerosDe(conflictos)} traen un costo distinto al que ya estaba guardado detrás de la contraseña. No se tocaron: hay que revisarlos.`,
    );
  }
  if (fallidos.length) {
    partes.push(
      fallidos.length === 1
        ? `No se pudo mover el contrato ${numerosDe(fallidos)}. Revisa tu internet y vuelve a correrlo: lo que ya se movió no se repite.`
        : `No se pudieron mover los contratos ${numerosDe(fallidos)}. Revisa tu internet y vuelve a correrlo: lo que ya se movió no se repite.`,
    );
  }
  if (!copiaLocalLimpia) {
    partes.push('No se pudo limpiar la copia de esta computadora. Cierra las otras pestañas del sistema y vuelve a correrlo.');
  }
  return partes.join(' ');
}

// ---------- Lo que el área de dinero escribe sobre un contrato que ya existe ----------
//
// "Sacar carro" es la única pantalla que escribe el costo del dueño, y solo lo
// hace al CREAR el contrato. Un contrato cuyo costo quedó en 0 (el campo no es
// obligatorio) o ilegible no se puede pagar — pagarlo borraría una deuda real
// por Q0.00 —, y sin una puerta aquí quedaría en «por pagar» para siempre, sin
// nada que él pudiera hacer. Estas dos funciones son lo único que el área de
// dinero escribe sobre contratos; el resto de sus escrituras son pagos.

/** Lo que lee el dueño si intenta anotar un costo sin haber entrado al área de dinero. */
export const MENSAJE_COSTO_SIN_DINERO = 'Primero entra al área de dinero: sin esa contraseña no se puede anotar el costo del dueño.';

/**
 * Lo que lee el dueño si intenta anotar un costo vacío o en cero. Un 0 no es un
 * costo: es justo lo que dejó la renta atorada, y guardarlo la dejaría igual.
 */
export const MENSAJE_COSTO_SIN_VALOR = 'Escribe cuánto le pagas al dueño por día: un número mayor que cero.';

/**
 * Lo que lee el dueño si intenta anotar el costo de una renta que ya lo tiene. No
 * se pisa desde aquí: lo que se negoció con el dueño del carro no se cambia con un
 * campo de texto, y esta pantalla solo existe para llenar lo que falta.
 */
export const MENSAJE_COSTO_YA_ANOTADO = 'Esta renta ya tiene un costo anotado, así que no se cambia desde aquí. Vuelve a la lista de dueños y aprieta «Actualizar» para verlo.';

/** Lo que lee el dueño si no se pudo comprobar que la renta siga sin costo: sin saberlo, anotarlo podría pisar uno real. */
export const MENSAJE_COSTO_SIN_COMPROBAR = 'No se pudo comprobar si esta renta ya tiene un costo anotado, y anotarlo sin saberlo podría pisar el real. Revisa tu internet e intenta de nuevo.';

/**
 * Anota el costo por día del dueño en un contrato que ya existe. Escribe en
 * `contratos/{id}/privado/dinero` con la credencial de DINERO — el mismo lugar y
 * la misma credencial que todo lo demás del área —, y devuelve el costo ya
 * redondeado (`q()`), que es lo que quedó guardado.
 *
 * `privado` MANDA al leer (`conCostoDelDueno`), así que este número le gana a lo
 * que el documento todavía traiga. Pero un contrato SIN MIGRAR sigue trayendo su
 * costo viejo (un 0, que es justo por lo que está aquí) en el documento, y la
 * migración (`moverElCostoDe`) vería ahí dos costos distintos y se negaría a
 * decidir: «conflicto, hay que revisarlo», sin ninguna pantalla donde revisarlo.
 * Por eso, después de anotar el costo se quita el viejo del documento, con el
 * mismo recorte que usa la migración. Es lo único que se hace sobre el documento
 * y NO es esencial: si falla, el costo ya quedó anotado y el único efecto es que
 * la migración, cuando corra, lo señale — por eso un fallo ahí se registra y no
 * se le presenta como si el costo no se hubiera guardado.
 *
 * Se niega ANTES de escribir nada si el contrato no es de carro ajeno o no
 * trae id, si el costo no es un número mayor que cero, o si no hay sesión de
 * dinero. Nunca escribe en la copia local: la copia local no guarda jamás el
 * costo de un subarriendo (ver «El costo del dueño del carro», más arriba).
 *
 * NUNCA PISA UN COSTO QUE YA ESTÁ, y lo decide aquí, en el punto donde se escribe
 * (Important 2 de la revisión de la Tarea 8). `setDoc` con `merge` escribe encima
 * sin mirar qué había, y antes lo único que lo impedía era que la pantalla no
 * dibujara el botón «Anotar costo» cuando el costo no se pudo leer — algo que
 * dependía de en qué orden se hacían dos preguntas, y no lo sujetaba ninguna
 * prueba. Un contrato ya migrado cuyo `privado/dinero` no se pudo leer llega aquí
 * con el costo en 0, igual que uno al que nunca se le anotó: si él escribiera lo
 * que recuerda (Q250), pisaría el Q300 que negoció y que está detrás de la
 * contraseña. Por eso, antes de escribir:
 *   - si el contrato que llega ya trae un costo mayor que cero, se niega;
 *   - se LEE `privado/dinero` ahora mismo, con la credencial de dinero: si ya hay
 *     un costo mayor que cero, se niega; y si no se pudo leer, también — «no se
 *     pudo leer» no es «no hay nada», y anotar a ciegas es justo lo que se evita.
 * Un costo de 0 en `privado` no es un costo (es lo que deja migrar una renta que
 * nunca lo tuvo): ahí sí se puede anotar.
 *
 * Las dependencias se pueden inyectar solo para probar sin red.
 */
export async function anotarCostoDelDueno(contrato, costoDia, {
  iniciar = iniciarFirebase, dbDinero = dbDeDinero,
} = {}) {
  if (!esAjeno(contrato) || !contrato?.id) {
    throw new Error('Solo se puede anotar el costo en un contrato de carro ajeno que ya esté guardado.');
  }
  const costo = q(costoDia);
  if (!hayNumero(costoDia) || !(costo > 0)) throw new Error(MENSAJE_COSTO_SIN_VALOR);
  const db = dbDinero();
  if (!db) throw new Error(MENSAJE_COSTO_SIN_DINERO);
  if (costoDelDocumento(contrato) > 0) throw new Error(MENSAJE_COSTO_YA_ANOTADO);
  const { fsMod } = await iniciar();

  let enPrivado;
  try {
    enPrivado = await leerCostoPrivado(fsMod, db, contrato.id);
  } catch {
    throw new Error(MENSAJE_COSTO_SIN_COMPROBAR);
  }
  if (enPrivado !== null && enPrivado > 0) throw new Error(MENSAJE_COSTO_YA_ANOTADO);

  await escribirCostoDelDueno({ db, fsMod }, contrato.id, costo);

  const cambios = cambiosParaQuitarElCosto(contrato, fsMod);
  if (Object.keys(cambios).length) {
    try {
      await conLimiteDeTiempo(fsMod.updateDoc(fsMod.doc(db, 'contratos', contrato.id), cambios));
    } catch (error) {
      console.warn('El costo quedó anotado, pero no se pudo quitar el costo viejo del documento del contrato:', error);
    }
  }
  return costo;
}

/** Cuántos contratos caben en un solo lote de escritura: Firestore acepta 500 y aquí se deja margen. */
const CONTRATOS_POR_LOTE = 400;

/**
 * Enlaza contratos viejos —los que solo traen el nombre del dueño escrito a
 * mano— a un dueño de la lista: les escribe `duenoId`. Es la salida del grupo
 * «sin enlazar» de `agruparPorDueno`.
 *
 * Escribe SOLO `duenoId` y el sello `actualizado`, con `update` y no con el
 * contrato entero: reescribir un contrato desde una copia que ya pudo quedar
 * atrás pisaría `pagos` (un arreglo se reemplaza completo) con lo que había al
 * leerlo, y perder un abono a mitad de un enlace sería peor que no enlazar.
 * `update` además falla si el contrato ya no existe, en vez de crear uno vacío.
 * `actualizado` sube para que la copia local de otras computadoras, que decide
 * por ese sello (`mezclar`), recoja el cambio. `carroAjeno.dueno` no se toca: el
 * texto original se conserva (§7 de la liquidación).
 *
 * Va por lotes, así que un enlace se aplica entero o no se aplica — salvo con
 * más de `CONTRATOS_POR_LOTE` contratos de un mismo texto, donde cada lote es
 * atómico y el siguiente puede fallar: volver a enlazar termina lo que faltó,
 * porque repetir un enlace no cambia nada. Va con la sesión normal: las reglas
 * dejan escribir contratos a cualquier sesión y esto no toca dinero.
 */
export async function enlazarContratosAlDueno(ids, duenoId, {
  iniciar = iniciarFirebase, ahora = Date.now(),
} = {}) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  if (!duenoId) throw new Error('Falta escoger a qué dueño de la lista se enlazan los contratos.');
  if (!lista.length) throw new Error('No hay contratos que enlazar.');
  const { db, fsMod } = await iniciar();
  for (let desde = 0; desde < lista.length; desde += CONTRATOS_POR_LOTE) {
    const lote = fsMod.writeBatch(db);
    for (const id of lista.slice(desde, desde + CONTRATOS_POR_LOTE)) {
      lote.update(fsMod.doc(db, 'contratos', id), { duenoId, actualizado: ahora });
    }
    await conLimiteDeTiempo(lote.commit());
  }
  return lista;
}

// ---------- Los pagos a dueños de carros ajenos ----------
//
// Lo que Best Price le pagó a cada dueño, con el número del comprobante que se
// le manda. Es dinero que sale de sus manos, y por eso va distinto a los demás
// guardados en dos cosas:
//
// - SOLO con la credencial de dinero (`dbDeDinero`), para leer y para escribir:
//   es lo único que la regla de `pagosDueno` deja pasar (firestore.rules). La
//   sesión normal del mostrador no sirve aquí, ni debe.
// - SIN copia local. Los demás guardados dejan una copia en IndexedDB para que
//   el sistema abra rápido, pero IndexedDB se lee sin credencial: lo que se le
//   pagó a cada dueño quedaría al alcance de cualquiera que abra la consola, que
//   es justo lo que ADR-002 evita con el costo. Además `cache.js` no tiene tienda
//   `pagosDueno`. El precio es que, si la nube no contesta, no hay copia con qué
//   servir — y es lo correcto: ver `cargarPagosDueno`.

/** Lo que lee el dueño si intenta registrar un pago sin haber entrado al área de dinero. */
export const MENSAJE_PAGO_SIN_DINERO = 'Primero entra al área de dinero: sin esa contraseña no se puede registrar el pago.';

/** Lo que lee el dueño si intenta registrar un pago sin ninguna renta marcada. */
export const MENSAJE_PAGO_SIN_RENTAS = 'Marca al menos una renta cerrada para registrar el pago.';

/**
 * Lo que lee quien intente guardar un pago que sale en Q0.00 (o sin un monto que
 * se pueda leer). Es la última línea: `construirPagoDueno` ya rechaza las rentas
 * sin costo y con su propio mensaje, que dice cuáles son; esta frase es para
 * lo que llegue por cualquier otro camino.
 */
export const MENSAJE_PAGO_SIN_MONTO = 'Este pago saldría en Q0.00, y un comprobante en cero no prueba que se pagó nada. '
  + 'Revisa que cada renta marcada tenga su costo por día anotado.';

/**
 * Lo que lee quien intente guardar un pago sin el id que se decide antes del
 * primer intento. No debería llegar a la pantalla: es la salvaguarda de que
 * nadie escriba un guardado de pagos que, al repetirse, cree otro comprobante.
 */
export const MENSAJE_PAGO_SIN_ID = 'Este pago no tiene su identificador todavía, y sin él repetir el intento crearía un segundo comprobante. '
  + 'Pídelo con nuevoIdPagoDueno() antes del primer intento y úsalo en todos los reintentos.';

/**
 * Un id nuevo para un pago a un dueño, sin escribir nada todavía: Firestore lo
 * genera localmente, sin ida y vuelta a la nube. Es `nuevoIdContrato` para los
 * pagos, y por la misma razón.
 *
 * La pantalla lo pide UNA vez cada vez que él decide «Registrar pago», antes del
 * primer intento de guardar, y lo conserva en su estado. Si el internet se pone
 * lento y `conLimiteDeTiempo` se da por vencido antes de que la escritura en
 * verdad llegue — o si él aprieta el botón dos veces —, el reintento con
 * `guardarPagoDueno` cae en este mismo documento (lo sobrescribe con
 * `merge: true`) en vez de crear otro: dos documentos del mismo pago son dos
 * comprobantes sobre las mismas rentas, y la deuda quedaría registrada dos veces.
 *
 * Con la base de DINERO, la misma en la que luego se escribe (`guardarPagoDueno`),
 * y con su misma negativa si no hay sesión de dinero.
 */
export async function nuevoIdPagoDueno({ iniciar = iniciarFirebase, dbDinero = dbDeDinero } = {}) {
  const db = dbDinero();
  if (!db) throw new Error(MENSAJE_PAGO_SIN_DINERO);
  const { fsMod } = await iniciar();
  return fsMod.doc(fsMod.collection(db, 'pagosDueno')).id;
}

/**
 * Toma el siguiente número de comprobante dentro de una transacción sobre
 * `contadores/comprobantes`. Es `siguienteNumeroContrato()` con otro contador,
 * a propósito y sin variantes: ese mecanismo ya está probado contra dos
 * pestañas guardando a la vez, y un número de comprobante repetido es un papel
 * que el dueño del carro puede disputar.
 *
 * Si el guardado falla después de tomar el número, ese número queda sin usar:
 * un hueco en la numeración se explica, un número repetido no.
 *
 * `iniciar` se puede inyectar solo para probar la transacción sin red.
 */
export async function siguienteNumeroComprobante({ iniciar = iniciarFirebase } = {}) {
  const { db, fsMod } = await iniciar();
  const ref = fsMod.doc(db, 'contadores', 'comprobantes');
  return conLimiteDeTiempo(fsMod.runTransaction(db, async (tx) => {
    const actual = await tx.get(ref);
    const siguiente = (Number(actual.exists() ? actual.data().ultimo : 0) || 0) + 1;
    tx.set(ref, { ultimo: siguiente });
    return siguiente;
  }));
}

/**
 * Lo que lee el dueño cuando marcó rentas que no se pueden pagar porque no tienen
 * un costo por día legible. Función pura. Separa los dos motivos, porque piden
 * cosas distintas: lo que no tiene costo anotado se arregla escribiéndolo; lo que
 * no se pudo leer, con internet y la contraseña de dinero — y decirle «anótalo» a
 * quien solo tuvo un fallo de red lo mandaría a escribir un costo que ya existe.
 */
function mensajeDeRentasSinCosto(contratos, sinLeer) {
  const porLeer = contratos.filter((c) => sinLeer.has(c.id));
  const porAnotar = contratos.filter((c) => !sinLeer.has(c.id));
  const partes = [];
  if (porAnotar.length) {
    partes.push(
      porAnotar.length === 1
        ? `El contrato ${numerosDe(porAnotar)} no tiene costo por día anotado: anota lo que le pagas al dueño por día y vuelve a marcarlo.`
        : `Los contratos ${numerosDe(porAnotar)} no tienen costo por día anotado: anota lo que le pagas al dueño por día en cada uno y vuelve a marcarlos.`,
    );
  }
  if (porLeer.length) {
    partes.push(
      porLeer.length === 1
        ? `No se pudo leer el costo del contrato ${numerosDe(porLeer)}. Revisa tu internet y que el área de dinero siga abierta, y vuelve a intentarlo.`
        : `No se pudo leer el costo de los contratos ${numerosDe(porLeer)}. Revisa tu internet y que el área de dinero siga abierta, y vuelve a intentarlo.`,
    );
  }
  return `No se registró el pago. ${partes.join(' ')}`;
}

/**
 * Arma el pago de lo que el dueño marcó, y es el ÚNICO lugar donde `monto` y
 * `contratos` nacen: los dos salen de la misma lista, así que no pueden
 * contradecirse.
 *
 * Esa lista es lo que `elegirParaPago` toma de `cuentaDeDueno(...)`: las rentas
 * de `porPagar` — cerradas, de carro ajeno y todavía sin pagar — y las
 * `diferencias` (rentas ya pagadas cuyo monto creció, que se marcan por su
 * `clave` «dif:…»), recortadas a lo marcado. Lo que no está ahí nunca entra,
 * ni con su dinero ni con su id, aunque su casilla siga marcada: una pantalla
 * que quedó atrás (el contrato se reabrió, o otra pestaña ya lo pagó) no puede
 * mover un contrato todavía abierto al bloque de «pagado» sin dinero de por
 * medio, ni cobrar dos veces uno ya pagado. Si `monto` y `contratos` se armaran
 * cada uno por su lado, esa asimetría sería posible.
 *
 * El pago de una diferencia cubre las MISMAS rentas que el pago original (las de
 * su grupo): no se le agrega nada al comprobante que el dueño del carro ya
 * tiene, y al sumar los dos pagos las rentas vuelven a cuadrar.
 *
 * `monto` sale de la misma cuenta que la pantalla enseña mientras se marcan
 * casillas: lo que él ve a la vista es, exacto, lo que se guarda.
 *
 * LANZA si `contratos` o `pagos` no son listas (lo hace `cuentaDeDueno`, y aquí
 * no se ablanda): una lectura fallida de `pagosDueno` no se puede tomar por «nada
 * pagado», o se le pagaría dos veces a quien ya se le pagó. Tampoco se arregla
 * pasando `[]`.
 *
 * `fecha` llega de afuera (la pantalla arranca en hoy): una regla no mira qué
 * día es. `duenoId` puede ser null — el grupo de contratos viejos con el dueño
 * escrito a mano —, y se guarda null y no `undefined`, que Firestore rechaza.
 *
 * Con nada pagable marcado devuelve `monto: 0` y `contratos: []`; no inventa
 * nada, y `guardarPagoDueno` se niega a guardarlo.
 *
 * UNA RENTA SIN COSTO LEGIBLE NO SE PAGA. Si entre lo marcado hay una renta cuyo
 * costo por día es 0 o no llegó (`sinCostoAnotado` de `cuentaDeDueno`), o cuyo
 * `privado/dinero` no se pudo leer (`costoSinLeer`, el que devuelve
 * `cargarContratosParaDinero`), esto LANZA con un mensaje que dice cuáles y qué
 * hacer. No las deja fuera en silencio: él marcó tres, el pago saldría por dos y
 * no sabría por qué. Y no las deja pasar: un 0 que en realidad es un número que
 * falta, pagado, borra la deuda del dueño del carro y deja un comprobante por
 * Q0.00 (I1 de la revisión de las Tareas 6 y 7). Las no marcadas no estorban.
 *
 * Que `privado` no se pudiera leer basta aunque el documento traiga un costo
 * viejo: `privado` es el que manda (ver `conCostoDelDueno`) y no se sabe qué decía.
 * Un contrato cuyo costo de verdad es 0 se queda en «por pagar» marcado «sin costo
 * anotado» hasta que alguien le anote el costo real.
 */
export function construirPagoDueno({
  duenoId, fecha, forma, contratos, pagos, idsMarcados, costoSinLeer,
} = {}) {
  // `cuentaDeDueno` cuenta cada contrato una sola vez (M3 de la revisión de las Tareas 6 y 7).
  const cuenta = cuentaDeDueno({ contratos, pagos });
  const { rentas, diferencias, contratos: ids, monto } = elegirParaPago(cuenta, idsMarcados);
  const sinAnotar = new Set(cuenta.sinCostoAnotado);
  const sinLeer = new Set(costoSinLeer ?? []);
  // Las rentas que se van a pagar, y las de cada diferencia: cualquiera con un costo
  // dudoso detiene el pago, porque el monto sale de ese costo.
  const dePago = [...rentas, ...diferencias.flatMap((d) => d.contratos)];
  const sinCosto = [...new Map(dePago.map((c) => [c.id, c])).values()]
    .filter((c) => sinAnotar.has(c.id) || sinLeer.has(c.id));
  if (sinCosto.length) throw new Error(mensajeDeRentasSinCosto(sinCosto, sinLeer));
  return {
    duenoId: duenoId ?? null,
    fecha,
    forma,
    // `monto` y `contratos` salen de la misma elección: no pueden contradecirse.
    monto,
    contratos: ids,
  };
}

/**
 * Arma el documento que de verdad se guarda para un pago a un dueño. Función
 * **pura** — sin Firestore — mismo patrón que `contratoParaGuardar`, para poder
 * probarla sin red. Los campos son los de §7 del diseño de la liquidación:
 * `duenoId`, `fecha`, `forma`, `monto`, `contratos[]`, `numero`, `actualizado`
 * (más `id`, que es el del documento).
 *
 * - `id`, `numero` y `actualizado` los sella esta función; `actualizado` nunca
 *   se copia del pago que llega (ver `duenoParaGuardar`: es lo que `mezclar`
 *   usa para decidir quién gana).
 * - Un pago que ya existe conserva su `id` y su `numero`, aunque quien llama
 *   pase otros: un comprobante que se renumera solo es peor que ninguno, porque
 *   el dueño del carro ya tiene el papel con el número anterior. (`id ?? pago.id`
 *   y no `id` a secas, igual que `duenoParaGuardar`: un pago sin id se guardaría
 *   como un documento NUEVO, y quedaría duplicado.)
 * - `monto` pasa por `q()`: nunca se redondea a mano.
 * - `contratos` nunca queda `undefined` (Firestore lo rechaza, y un pago sin
 *   lista de rentas no se puede leer después: `cuentaDeDueno` lanza). Una lista
 *   que no es lista se guarda como `[]`, y `guardarPagoDueno` no deja guardar un
 *   pago sin rentas, así que esa vía no llega a la nube.
 */
export function pagoDuenoParaGuardar(pago, { id, numero, ahora = Date.now() } = {}) {
  return {
    ...pago,
    id: id ?? pago?.id,
    numero: pago?.numero || numero,
    monto: q(pago?.monto),
    contratos: Array.isArray(pago?.contratos) ? [...pago.contratos] : [],
    actualizado: ahora,
  };
}

/**
 * Guarda un pago a un dueño en la nube, con la credencial de dinero, y le da su
 * número de comprobante. Si el pago ya trae `numero` (se está editando uno que
 * ya existe) se respeta; si no, se toma el siguiente de
 * `siguienteNumeroComprobante()`.
 *
 * Pasa por `guardarEnNubeYLocal`, igual que todo guardado, pero con una copia
 * local que no hace nada a propósito (ver arriba: dinero no se copia a IndexedDB).
 * Así sigue valiendo la regla de ese camino —lo que ya está en la nube no se
 * pierde porque algo local falle— y nadie puede volver a escribir aquí una copia
 * por descuido sin pasar por esta decisión.
 *
 * Se niega ANTES de gastar un número de comprobante si no hay sesión de dinero,
 * si el pago no cubre ninguna renta o si sale en Q0.00: un comprobante sin rentas
 * es un papel vacío con número, y uno en cero no prueba que se pagó nada, y un
 * número gastado no se devuelve. Un pago con un `contratos` que no se pueda leer
 * como lista tampoco pasa.
 *
 * EL PAGO TRAE SU `id`, pedido antes del primer intento con `nuevoIdPagoDueno()`
 * y reusado en cada reintento (ver ahí por qué): sin id, cada llamada mintearía
 * un documento distinto y un doble clic, o un reintento después de que el primer
 * intento venció, dejaría dos comprobantes de las mismas rentas. Por eso sin id
 * se niega. Si un reintento no trae `numero`, toma uno nuevo y el número del
 * intento anterior queda sin usar —un hueco en la numeración se explica, un
 * número repetido no—; la pantalla que quiera evitar el hueco puede tomar el
 * número una vez (`siguienteNumeroComprobante`) y mandarlo en cada intento.
 *
 * Lo que esto NO cubre: dos pestañas, o dos computadoras, que registran cada una
 * su propio pago (con su propio id) de la misma renta. Ninguna sabe lo que hizo
 * la otra, y esta función no vuelve a leer `pagosDueno` antes de escribir.
 *
 * Las dependencias se pueden inyectar solo para probar sin red.
 */
export async function guardarPagoDueno(pago, {
  iniciar = iniciarFirebase, dbDinero = dbDeDinero, numeroNuevo = siguienteNumeroComprobante, avisar = avisarCopiaLocal,
} = {}) {
  if (!Array.isArray(pago?.contratos) || pago.contratos.length === 0) throw new Error(MENSAJE_PAGO_SIN_RENTAS);
  // Un pago por Q0.00 no es un pago: borraría la deuda del dueño del carro y
  // dejaría un comprobante que no prueba nada (I1 de la revisión). `q()` y no
  // `> 0` a secas, para que un texto o un NaN no pasen por números.
  if (!(q(pago.monto) > 0)) throw new Error(MENSAJE_PAGO_SIN_MONTO);
  const db = dbDinero();
  if (!db) throw new Error(MENSAJE_PAGO_SIN_DINERO);
  if (!pago.id) throw new Error(MENSAJE_PAGO_SIN_ID);
  const numero = pago.numero || (await numeroNuevo());
  return guardarEnNubeYLocal(
    'pagosDueno',
    pago,
    (id) => pagoDuenoParaGuardar(pago, { id, numero }),
    {
      // La base es la de dinero; de `iniciar` solo se toma el módulo de Firebase,
      // que es el mismo (ver `costosPrivadosDe`).
      iniciar: async () => ({ db, fsMod: (await iniciar()).fsMod }),
      guardarCopia: async () => {},
      avisar,
    },
  );
}

/**
 * Todos los pagos a dueños, como `{ datos, fallo }` — pero con una diferencia
 * respecto a `cargarDuenos` y las demás lecturas, hecha a propósito: **cuando la
 * lectura falla, `datos` es `null`, no `[]`**.
 *
 * Las otras lecturas, si la nube no contesta, devuelven lo que haya en la copia
 * local. Aquí no hay copia local (ver arriba), así que no hay «lo mejor que hay»
 * que ofrecer. Y `[]` es peligroso: `cuentaDeDueno` lee una lista vacía de pagos
 * como «a nadie se le ha pagado», y cada contrato ya pagado reaparece como
 * deuda — él le pagaría dos veces a quien ya le pagó. Con `null`, una pantalla
 * que se olvide de mirar `fallo` y pase `datos` a `cuentaDeDueno` choca con un
 * error en vez de dibujar una deuda inflada. Una lista vacía de verdad
 * (`{ datos: [], fallo: false }`) sí es «no se ha pagado nada».
 *
 * Es `fallo: true` si no hay sesión de dinero (no se intenta leer), si Firebase
 * no arranca, o si la nube no contesta. Sin sesión de fondo ni callback: se
 * espera a la nube, como las demás lecturas cuando no tienen copia local.
 *
 * Lo que llega se devuelve tal cual está guardado: un pago dañado (sin su lista
 * de contratos) no se «arregla» aquí, para que `cuentaDeDueno` lo siga viendo.
 */
export async function cargarPagosDueno({ iniciar = iniciarFirebase, dbDinero = dbDeDinero } = {}) {
  const db = dbDinero();
  if (!db) return { datos: null, fallo: true };
  try {
    const { fsMod } = await iniciar();
    const instantanea = await conLimiteDeTiempo(fsMod.getDocs(fsMod.collection(db, 'pagosDueno')));
    return { datos: instantanea.docs.map((d) => ({ id: d.id, ...d.data() })), fallo: false };
  } catch {
    return { datos: null, fallo: true };
  }
}
