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
import { estadoContrato } from './nucleo/estados.js';
import { resumen } from './nucleo/contrato.js';
import { q, textoDosDecimales } from './nucleo/dinero.js';
import { hoyISO } from './nucleo/fechas.js';

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
async function cargarConSincronia(coleccion, alLlegar) {
  const locales = await leerLocal(coleccion);
  const sincronizar = leerRemoto(coleccion).then(async (remotos) => {
    const mezclados = mezclar(locales, remotos);
    await guardarLocal(coleccion, mezclados);
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
export async function cargarContratosAbiertos(alLlegar) {
  const estaAbierto = (c) => ['rentado', 'devuelto'].includes(c?.estado || 'rentado');
  const soloAbiertos = (contratos) => contratos.filter(estaAbierto);
  const r = await cargarConSincronia(
    'contratos',
    alLlegar && ((res) => alLlegar({ datos: soloAbiertos(res.datos), fallo: res.fallo })),
  );
  return { datos: soloAbiertos(r.datos), fallo: r.fallo };
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
 */
export async function cargarContratos({ desde, hasta } = {}, alLlegar) {
  const enRango = (c) => (!desde || (c?.fechaSalida || '') >= desde)
    && (!hasta || (c?.fechaSalida || '') <= hasta);

  const locales = (await leerLocal('contratos')).filter(enRango);

  async function leerRemotoDelRango() {
    const { db, fsMod } = await iniciarFirebase();
    const restricciones = [];
    if (desde) restricciones.push(fsMod.where('fechaSalida', '>=', desde));
    if (hasta) restricciones.push(fsMod.where('fechaSalida', '<=', hasta));
    const referencia = fsMod.collection(db, 'contratos');
    const consulta = restricciones.length ? fsMod.query(referencia, ...restricciones) : referencia;
    const instantanea = await conLimiteDeTiempo(fsMod.getDocs(consulta));
    return instantanea.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const sincronizar = leerRemotoDelRango().then(async (remotos) => {
    const mezclados = mezclar(locales, remotos);
    await guardarLocal('contratos', mezclados);
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
 */
export function contratoParaGuardar(contrato, { id, numero, ahora = Date.now() } = {}) {
  return {
    ...contrato, id, numero, actualizado: ahora, estado: estadoContrato(contrato),
  };
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
  const guardado = contratoParaGuardar(contrato, { id: ref.id, numero });
  await conLimiteDeTiempo(fsMod.setDoc(ref, guardado, { merge: true }));
  await guardarLocal('contratos', [guardado]);
  return guardado;
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
 * Registra un abono nuevo y guarda el contrato con `guardarContrato`. Si el
 * pago no aportó nada (`agregarPago` lo ignoró — ver arriba), `agregarPago`
 * devuelve el mismísimo objeto `contrato` que recibió, así que compararlos
 * por referencia basta para saber que no hay nada que guardar: no tiene
 * sentido gastar una escritura en Firestore por un pago vacío.
 */
export async function registrarPago(contrato, pago) {
  const actualizado = agregarPago(contrato, pago);
  if (actualizado === contrato) return contrato;
  return guardarContrato(actualizado);
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

/** Libera la garantía de la tarjeta. Rechaza mientras `puedeLiberarse` diga que hay motivo. */
export async function liberarGarantia(contrato) {
  const motivo = puedeLiberarse(contrato);
  if (motivo) throw new Error(motivo);
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
  const { db, fsMod } = await iniciarFirebase();
  const ref = vehiculo?.id ? fsMod.doc(db, 'vehiculos', vehiculo.id) : fsMod.doc(fsMod.collection(db, 'vehiculos'));
  const guardado = { ...vehiculo, id: ref.id, codigo, actualizado: Date.now() };
  await conLimiteDeTiempo(fsMod.setDoc(ref, guardado, { merge: true }));
  await guardarLocal('vehiculos', [guardado]);
  return guardado;
}
