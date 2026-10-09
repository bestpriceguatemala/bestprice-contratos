// El área de dinero: lo que se le debe a cada dueño de un carro subarrendado, y
// el pago (§5 del diseño de la liquidación, §11 del diseño general).
//
// Es la pantalla para la que existe todo este plan, y es dinero que sale de las
// manos del dueño del negocio. Hay tres cosas que no se negocian aquí:
//
// 1. LA CONTRASEÑA ES UNA SEGUNDA CREDENCIAL, NO UNA CORTINA. Esta pantalla no
//    revisa ninguna contraseña: se la entrega a Firebase (dinero-sesion.js), y
//    son las reglas de Firestore las que dejan leer. Por eso lo importante no es
//    cómo se abre sino cómo se CIERRA: la sesión de dinero vive en una app de
//    Firebase aparte que el mostrador no ve, así que salir del mostrador NO la
//    cierra, y quien se sentara después abriría la consola y leería dinero con
//    `getApp('dinero')` sin ninguna de las dos credenciales. Se cierra cuando él
//    sale del sistema, cuando sale del área, y sola por inactividad — y cerrarla
//    NO es disparar y olvidar: `salirDeDinero()` se traga su propio rechazo, así
//    que aquí se espera, se comprueba, y si no se pudo cerrar se recarga la
//    página, que es lo único que la mata con seguridad (vive solo en memoria).
//
// 2. NINGUNA REGLA DE NEGOCIO SE ESCRIBE AQUÍ. Qué se le debe, qué ya cerró, qué
//    suma el total y cuándo un pago se puede armar viven en nucleo/liquidacion.js,
//    nucleo/estados.js y datos.js (`construirPagoDueno`). Esta pantalla pregunta
//    y dibuja. Este proyecto ya perdió cinco vueltas de revisión por reglas
//    escritas en dos lugares, y una apareció en un tercero solo porque dos números
//    se contradijeron en pantalla.
//
// 3. UNA LECTURA FALLIDA NUNCA SE DIBUJA COMO «NO LE DEBES NADA A NADIE». Eso es
//    buena noticia, y a las buenas noticias nadie las audita: cerraría la
//    pantalla tranquilo y un dueño se quedaría sin su pago un mes. Si falla la
//    lectura de los contratos o de los pagos, no se dibuja ninguna cuenta (un
//    total sobre datos incompletos es peor que ninguno); si es un total que SÍ se
//    puede calcular pero quedó corto (rentas sin costo, o con el costo sin leer),
//    se dice en pantalla, junto al total, que está corto.
import {
  agruparPorDueno, cuentaDeDueno, costoDelSubarriendo, elegirParaPago, esPagableAlDueno, totalGeneral,
} from '../nucleo/liquidacion.js';
import { estadoContrato, pendientesDe } from '../nucleo/estados.js';
import { atrasoDe } from '../nucleo/contrato.js';
import { construirDueno } from '../nucleo/dueno.js';
import { hoyISO, esFechaISO, diasEntre } from '../nucleo/fechas.js';
import { entrarADinero, salirDeDinero, sesionDeDinero } from '../dinero-sesion.js';
import {
  cargarContratosParaDinero, cargarPagosDueno, cargarDuenos, guardarDueno, nuevoIdPagoDueno, altaConIdFijo, nuevoIdDueno,
  siguienteNumeroComprobante, construirPagoDueno, guardarPagoDueno, anotarCostoDelDueno,
  enlazarContratosAlDueno, conCostoDelDueno, costoDelDocumento, migrarCostosDelDueno, mensajeDeMigracion,
  MENSAJE_PAGO_SIN_DINERO, MENSAJE_PAGO_SIN_RENTAS, MENSAJE_PAGO_SIN_MONTO, MENSAJE_PAGO_SIN_ID,
  MENSAJE_COSTO_SIN_DINERO, MENSAJE_COSTO_SIN_VALOR, MENSAJE_COSTO_YA_ANOTADO, MENSAJE_COSTO_SIN_COMPROBAR,
  MENSAJE_MIGRAR_SIN_DINERO,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';
import { mostrar } from '../router.js';
import { pintarComprobante } from './comprobante.js';

// El texto libre (nombres, placas, el motivo escrito a mano) se escapa antes de
// entrar al HTML, igual que en flota.js y clientes.js.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------------------------------------------------------------------------
// Lo que no cambia
// ---------------------------------------------------------------------------

/**
 * El correo de la cuenta de dinero. Es una constante del sistema y NO se le
 * pide a él: él solo teclea la contraseña. Tiene que ser exactamente el correo
 * con el que se crea la segunda cuenta en Firebase Authentication (Tarea 10 del
 * plan); si allá se crea con otro, aquí se cambia esta línea y nada más.
 *
 * Esta constante no sale en ninguna pantalla, mensaje ni atributo: una frase que
 * le hablara de un correo lo mandaría a buscar un campo que no ve (ver
 * `auth/invalid-email` en dinero-sesion.js, que cae en la frase de respaldo).
 */
export const CORREO_DE_DINERO = 'dinero@bestpricegt.com';

/**
 * Cuánto tiempo sin tocar nada (ratón, teclado o rueda) antes de que el área se
 * cierre sola (§6 del diseño: «se cierra sola por inactividad»). El diseño no da
 * el número; diez minutos alcanzan para leer una cuenta con calma y no dejan el
 * área abierta toda una tarde frente a una silla vacía.
 */
export const INACTIVIDAD_MS = 10 * 60 * 1000;

/** Cuánto se espera a que la sesión de dinero se cierre antes de darla por no cerrada. */
export const LIMITE_CIERRE_MS = 10000;

export const FORMAS_DE_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'cheque', etiqueta: 'Cheque' },
];

const etiquetaDeForma = (forma) => {
  const limpia = String(forma ?? '').trim();
  if (!limpia) return '—';
  return FORMAS_DE_PAGO.find((f) => f.valor === limpia.toLowerCase())?.etiqueta
    ?? `${limpia[0].toUpperCase()}${limpia.slice(1)}`;
};

export const MENSAJE_INACTIVIDAD = 'El área de dinero se cerró sola porque pasó un rato sin usarse. Escribe la contraseña para abrirla otra vez.';
export const MENSAJE_FALLO_CONTRATOS = 'No se pudieron leer los contratos. No se muestra ninguna cuenta porque cualquier cifra saldría incompleta.';
export const MENSAJE_FALLO_PAGOS = 'No se pudieron leer los pagos a dueños. Sin ellos no se sabe qué ya se pagó, y una cuenta ahora podría hacerte pagar dos veces.';
export const MENSAJE_FALLO_DATOS = 'Hay un contrato o un pago guardado que no se puede leer completo, así que no se muestra ninguna cuenta. Avisa a quien lleva el sistema.';
export const MENSAJE_FALLO_DUENOS = 'No se pudo leer la lista de dueños. Los nombres que ves pueden estar desactualizados.';
export const MENSAJE_SIN_COMPROBAR = 'No se pudo comprobar si estas rentas ya tienen un pago registrado, y registrar sin saberlo podría pagarlas dos veces. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_SIN_COMPROBAR_RENTAS = 'No se pudo comprobar si estas rentas siguen cerradas y con el mismo monto, y registrar sin saberlo podría pagar una renta que ya cambió. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_PAGO_CAMBIO = 'Mientras tanto cambió la cuenta de este dueño: alguna de las rentas marcadas ya no se puede pagar o cambió de monto (por ejemplo, ya tiene un pago registrado, o se corrigió su cierre). No se registró nada; la lista ya está al día, revisa y vuelve a marcar.';
/**
 * Qué está mal con la fecha del pago, o `null` si está bien. Una fecha vacía se pide;
 * una que no existe —el año con cinco dígitos que el campo de fecha deja teclear, un 30 de
 * febrero— se manda a revisar. Función pura. Sin esto el pago se guardaba, gastaba su
 * número de comprobante y el papel nunca se podía armar («no trae una fecha válida»), y no
 * hay dónde corregir un pago ya guardado (prueba del sistema, 7 oct 2026).
 */
export function problemaDeLaFechaDelPago(fechaDelPago, hoy) {
  if (!fechaDelPago) return 'Escribe la fecha del pago.';
  if (!esFechaISO(fechaDelPago)) return 'La fecha del pago no es válida. Revisa el año.';
  // Un pago que se registra ya se hizo: no puede ser de mañana. Con «2062» por «2026» el comprobante salía
  // fechado en 2062 y, como no hay dónde corregir un pago ya guardado, se quedaba así. Solo se revisa si quien
  // llama dice qué día es hoy.
  if (hoy && diasEntre(hoy, fechaDelPago) > 0) return 'La fecha del pago todavía no llega. Revisa la fecha.';
  return null;
}

export const MENSAJE_PAGO_FALLO = 'No se pudo registrar el pago. Revisa tu internet y vuelve a apretar «Guardar pago»: si ya había quedado guardado, no se duplica. '
  + 'Si sigue sin conectar, recarga la página y revisa «Ya pagado» antes de intentarlo otra vez.';
export const MENSAJE_COSTO_FALLO = 'No se pudo guardar el costo. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_ENLACE_FALLO = 'No se pudieron enlazar los contratos. Revisa tu internet e intenta de nuevo: repetirlo no daña nada.';
export const MENSAJE_COMPROBANTE_FALLO = 'No se pudo abrir el comprobante. Recarga la página e intenta de nuevo.';

// ---------------------------------------------------------------------------
// Dónde está el área, y cómo se cierra
// ---------------------------------------------------------------------------

/**
 * ¿Esta ruta es parte del área de dinero? Todo lo que cuelga de `#/dinero`
 * (la lista, las cuentas, la pantalla de dueños). Salir de aquí cierra la sesión.
 */
export function enElAreaDeDinero(hash) {
  const ruta = String(hash ?? '');
  return ruta === '#/dinero' || ruta.startsWith('#/dinero/');
}

/**
 * La clave con la que una cuenta viaja en la dirección. Un dueño enlazado es
 * `id:<duenoId>`; los contratos viejos con el nombre escrito a mano son
 * `texto:<nombre>`. Es la misma distinción que hace `agruparPorDueno`, que no
 * entrega su propia clave.
 */
export const claveDeEntrada = (entrada) => (entrada.duenoId ? `id:${entrada.duenoId}` : `texto:${entrada.nombre}`);

/** La dirección de la ficha de una cuenta. La clave puede traer espacios y «/»: se escapa. */
export const rutaDeCuenta = (clave) => `#/dinero/cuenta/${encodeURIComponent(clave)}`;

// Lo que la pantalla ya leyó (el `lector`, más abajo) sirve para ir de la lista a
// una ficha y volver sin volver a pedirle todo a la nube: la lectura es lenta,
// porque cada contrato ajeno pide su propio `privado/dinero`. Vive en la memoria
// de este módulo —no en IndexedDB, no en una variable global— y se olvida SIEMPRE
// que la sesión de dinero se cierra, por la vía que sea (`cerrarElDinero`).

// El dibujo vigente, para que un cambio que llega tarde (la lista de dueños) pueda repintarlo.
let repintarActual = null;
// La caja donde está dibujada el área de dinero: al cerrarse la sesión se vacía.
let raizActual = null;
// Cuenta las pantallas dibujadas: una carga lenta que termina cuando ya se dibujó
// otra cosa (la entrada, otra ficha) no pinta encima.
let ultimoToken = 0;
// Lo que la entrada le dice al dueño la próxima vez que se dibuje (por ejemplo, que se cerró sola).
let mensajeDeEntrada = '';

function olvidarLosDatos() {
  lector.olvidar();
  repintarActual = null;
  // Lo ya dibujado también es dinero: quien abriera la consola lo leería de la
  // página aunque la sesión ya estuviera cerrada. Si la pantalla ya cambió, la
  // caja está suelta y no hay nada que vaciar.
  if (raizActual?.isConnected) raizActual.replaceChildren();
  raizActual = null;
}

/**
 * Cierra la sesión de dinero y olvida lo que se leyó con ella. Devuelve `true`
 * si quedó cerrada y `false` si NO se pudo cerrar (o no contestó a tiempo).
 * Nunca lanza.
 *
 * Esto existe porque `salirDeDinero()` no se puede llamar a la ligera: la cola de
 * dinero-sesion.js le pone su propio `catch`, así que si `signOut` falla y nadie
 * espera esta promesa, no queda ni una línea en la consola y el área sigue
 * abierta sin que nadie lo sepa. Aquí se espera, se registra el fallo, y quien
 * llama decide qué hacer con el `false` (todos recargan: ver
 * `cerrarElDineroOReiniciar`).
 *
 * Los datos y el reloj de inactividad se sueltan ANTES de esperar a Firebase:
 * si el cierre falla, lo ya leído tampoco debe quedarse en memoria.
 */
export async function cerrarElDinero({
  salir = salirDeDinero, olvidar = olvidarLosDatos, parar = () => vigilante.detener(),
  registrar = console.error, limite = LIMITE_CIERRE_MS,
} = {}) {
  olvidar();
  parar();
  let reloj;
  const sinTiempo = new Promise((ok) => { reloj = setTimeout(() => ok('sin-tiempo'), limite); });
  try {
    const resultado = await Promise.race([Promise.resolve().then(salir).then(() => 'cerrada'), sinTiempo]);
    if (resultado === 'sin-tiempo') {
      registrar('El área de dinero no contestó a tiempo al cerrarse.');
      return false;
    }
    return true;
  } catch (error) {
    registrar('El área de dinero no se pudo cerrar:', error);
    return false;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Cierra la sesión de dinero y, si no se pudo cerrar, recarga la página: la
 * sesión vive solo en memoria, así que recargar es lo único que la mata con
 * seguridad. Al recargar, `app.js` lleva a la flota, no al área de dinero, así
 * que no puede haber un ciclo. Devuelve si se cerró sin necesidad de recargar.
 */
export async function cerrarElDineroOReiniciar({
  cerrar = cerrarElDinero, recargar = () => location.reload(),
} = {}) {
  const cerrada = await cerrar();
  if (!cerrada) recargar();
  return cerrada;
}

/**
 * «Salir» del mostrador: primero se cierra el área de dinero, luego la sesión
 * del mostrador, y solo al final —si el área no se pudo cerrar— se recarga. En
 * ese orden a propósito: recargar antes dejaría la salida del mostrador a medias
 * (la página podría irse antes de que terminara el `signOut`) y el dueño creería
 * haber salido sin haber salido. Si el área no cierra, igual se sale del
 * mostrador: nunca se le deja atrapado dentro por un fallo de la otra sesión.
 */
export async function salirDelSistema({
  cerrar = cerrarElDinero, salirDelMostrador, alFallarElMostrador = () => {}, recargar = () => location.reload(),
} = {}) {
  const cerrada = await cerrar();
  try {
    await salirDelMostrador();
  } catch (error) {
    alFallarElMostrador(error);
  }
  if (!cerrada) recargar();
}

/**
 * El reloj de inactividad. `latido()` lo reinicia solo si ya está corriendo:
 * mover el ratón con el área cerrada no lo enciende. `programar` y `cancelar` se
 * reciben para poder probarlo sin esperar minutos.
 */
export function crearVigilante({
  ms = INACTIVIDAD_MS, alExpirar, programar = setTimeout, cancelar = clearTimeout,
} = {}) {
  let reloj = null;
  const armar = () => {
    if (reloj !== null) cancelar(reloj);
    reloj = programar(() => { reloj = null; alExpirar?.(); }, ms);
  };
  return {
    /** Lo enciende (si no corría). */
    iniciar() { if (reloj === null) armar(); },
    /** Hubo actividad: empieza a contar de nuevo, pero solo si ya corría. */
    latido() { if (reloj !== null) armar(); },
    detener() {
      if (reloj !== null) cancelar(reloj);
      reloj = null;
    },
    activo: () => reloj !== null,
  };
}

async function alExpirarPorInactividad() {
  mensajeDeEntrada = MENSAJE_INACTIVIDAD;
  await cerrarElDineroOReiniciar();
  // Si sigue en el área, se vuelve a dibujar la ruta: ya sin sesión, pasa por la
  // puerta y aparece la entrada. Si ya se había ido a otro lado, no hay nada que dibujar.
  if (typeof location !== 'undefined' && enElAreaDeDinero(location.hash)) mostrar(location.hash);
}

const vigilante = crearVigilante({ alExpirar: alExpirarPorInactividad });

let latidosInstalados = false;
function instalarLatidos() {
  if (latidosInstalados || typeof document === 'undefined') return;
  latidosInstalados = true;
  for (const evento of ['pointerdown', 'keydown', 'wheel']) {
    document.addEventListener(evento, () => vigilante.latido(), { capture: true, passive: true });
  }
}

// ---------------------------------------------------------------------------
// Lo que lee el dueño cuando algo falla: nunca el texto crudo de Firebase
// ---------------------------------------------------------------------------

const FRASES_CONOCIDAS = new Set([
  MENSAJE_PAGO_SIN_DINERO, MENSAJE_PAGO_SIN_RENTAS, MENSAJE_PAGO_SIN_MONTO, MENSAJE_PAGO_SIN_ID,
  MENSAJE_COSTO_SIN_DINERO, MENSAJE_COSTO_SIN_VALOR, MENSAJE_COSTO_YA_ANOTADO, MENSAJE_COSTO_SIN_COMPROBAR,
  MENSAJE_MIGRAR_SIN_DINERO, MENSAJE_SIN_COMPROBAR, MENSAJE_SIN_COMPROBAR_RENTAS, MENSAJE_PAGO_CAMBIO,
  'La nube no respondió a tiempo.',
  'Solo se puede anotar el costo en un contrato de carro ajeno que ya esté guardado.',
  'Falta escoger a qué dueño de la lista se enlazan los contratos.',
  'No hay contratos que enlazar.',
]);

/**
 * La frase de un error, si es una de las nuestras (ya en español y pensada para
 * él); si no, la de respaldo. Un error de Firebase llega en inglés
 * («Missing or insufficient permissions.») y con un código: nunca se le enseña.
 * `construirPagoDueno` arma sus frases con el nombre de los contratos, así que se
 * reconocen por cómo empiezan.
 */
export function mensajeSeguro(error, respaldo) {
  const mensaje = String(error?.message ?? '');
  if (FRASES_CONOCIDAS.has(mensaje) || mensaje.startsWith('No se registró el pago.')) return mensaje;
  return respaldo;
}

// ---------------------------------------------------------------------------
// Qué se le debe a cada dueño: la vista, ya armada
// ---------------------------------------------------------------------------

const porNombre = (a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');

/** Todos los contratos de una cuenta, en cualquiera de sus tres listas. */
const contratosDeCuenta = (cuenta) => [...cuenta.porPagar, ...cuenta.aunNoCierra, ...cuenta.pagados];

/**
 * Lo que se dibuja, o por qué NO se puede dibujar. Función pura: recibe lo que
 * devolvieron las tres lecturas y no toca la nube ni el DOM.
 *
 * Si los contratos o los pagos no se pudieron leer (o no llegaron como lista),
 * devuelve `{ ok: false }` y NO se dibuja ninguna cuenta: `liquidacion.js` lanza
 * ante una lista que no es lista justo para que nadie la reemplace por `[]`, y
 * aquí tampoco se hace. Que `costoSinLeer` no sea una lista es lo mismo que un
 * fallo: sin ella no se sabe qué costos faltan, y no es lo mismo «ninguno» que
 * «no sé» (por ejemplo, si alguien conectara aquí otra lectura que no la trae).
 *
 * Una lectura fallida de los dueños NO impide dibujar: lo que se debe sale de
 * los contratos y los pagos, y los dueños solo dan el nombre. Se marca
 * `falloDuenos` para decirlo en pantalla.
 *
 * `entradas` trae una por cuenta, de la que más se debe a la que menos (el
 * orden es el de `agruparPorDueno`), y después los dueños de la lista que no
 * tienen ninguna renta todavía: un dueño sin nada no desaparece, solo se apaga.
 * El nombre de un dueño enlazado es el de SU REGISTRO, que es el que se puede
 * corregir; el texto escrito en el contrato es solo el respaldo.
 */
export function armarVista({ contratos, pagos, duenos } = {}) {
  const problemas = [];
  if (!contratos || contratos.fallo || !Array.isArray(contratos.datos) || !Array.isArray(contratos.costoSinLeer)) {
    problemas.push('contratos');
  }
  if (!pagos || pagos.fallo || !Array.isArray(pagos.datos)) problemas.push('pagos');
  if (problemas.length) return { ok: false, problemas };

  let grupos;
  try {
    grupos = agruparPorDueno(contratos.datos, pagos.datos);
  } catch (error) {
    return { ok: false, problemas: ['datos'], error };
  }

  const registros = Array.isArray(duenos?.datos) ? duenos.datos.filter((d) => d?.id) : [];
  const registroDe = new Map(registros.map((d) => [d.id, d]));
  const enlazados = new Set();

  const entradas = grupos.map((g) => {
    if (g.duenoId) enlazados.add(g.duenoId);
    const registro = g.duenoId ? (registroDe.get(g.duenoId) ?? null) : null;
    const nombre = String(registro?.nombre ?? '').trim() || g.nombre;
    return {
      clave: claveDeEntrada({ duenoId: g.duenoId, nombre }),
      duenoId: g.duenoId,
      nombre,
      registro,
      sinEnlazar: g.sinEnlazar,
      // Enlazado a un dueño que ya no está en la lista (o que no se pudo leer).
      sinRegistro: Boolean(g.duenoId && !registro),
      cuenta: g.cuenta,
      contratos: contratosDeCuenta(g.cuenta),
    };
  });

  const sinRentas = registros.filter((d) => !enlazados.has(d.id)).sort(porNombre);
  if (sinRentas.length) {
    const vacia = cuentaDeDueno({ contratos: [], pagos: pagos.datos });
    for (const d of sinRentas) {
      entradas.push({
        clave: claveDeEntrada({ duenoId: d.id, nombre: d.nombre }),
        duenoId: d.id,
        nombre: String(d.nombre ?? '').trim() || 'Dueño sin nombre',
        registro: d,
        sinEnlazar: false,
        sinRegistro: false,
        cuenta: vacia,
        contratos: [],
      });
    }
  }

  return {
    ok: true,
    entradas,
    registros,
    costoSinLeer: contratos.costoSinLeer,
    falloDuenos: Boolean(duenos?.fallo),
    // Lo que se le debe a TODOS junto, y las frases que lo dejan en su sitio si
    // está corto: es la pregunta con la que se abre esta pantalla («¿cuánto
    // debo?»), y no se contesta sumando renglones a ojo. La suma la hace el
    // núcleo; aquí solo se junta lo que cada cuenta ya dice.
    total: totalGeneral(entradas.map((e) => e.cuenta)),
    notasDelTotal: notasDelTotalGeneral({ entradas, costoSinLeer: contratos.costoSinLeer }),
  };
}

/** Los ids de las rentas por pagar cuyo costo no se puede pagar todavía: sin anotar, o sin leer. */
export function rentasSinCostoLegible(cuenta, costoSinLeer) {
  const ids = new Set(cuenta.sinCostoAnotado);
  for (const id of costoSinLeer ?? []) ids.add(id);
  return ids;
}

/** El estado del costo de una renta: 'leido', 'sin-anotar' (es 0 o falta) o 'sin-leer' (la nube no contestó). */
export function estadoDeCosto(contrato, cuenta, costoSinLeer) {
  if (new Set(costoSinLeer ?? []).has(contrato.id)) return 'sin-leer';
  if (cuenta.sinCostoAnotado.includes(contrato.id)) return 'sin-anotar';
  return 'leido';
}

/**
 * Las rentas cuyo costo SUMA en el total de una cuenta: las cerradas por pagar y
 * las de sus diferencias (una renta ya pagada cuyo monto creció también se cuenta
 * por su costo). Cada una una sola vez.
 */
function rentasDelTotal(cuenta) {
  const vistas = new Map();
  for (const c of [...cuenta.porPagar, ...cuenta.diferencias.flatMap((d) => d.contratos)]) {
    if (c?.id) vistas.set(c.id, c);
  }
  return [...vistas.values()];
}

/**
 * Cuántas rentas de las que suma el total de una cuenta no tienen un costo en el
 * que confiar: `sinAnotar` (el costo por día es 0 o nunca se anotó: cuentan como
 * Q0.00) y `sinLeer` (la nube no contestó). Una renta sin leer no cuenta también
 * como sin anotar: son dos motivos y se dicen por separado.
 *
 * Solo cuentan las que suma el total. Una renta que todavía no cierra y no tiene
 * costo se señala en su propia fila, pero no hace corto un total que no la
 * incluye ni debe incluirla.
 */
export function rentasCortas(entrada, costoSinLeer) {
  const sinLeer = new Set(costoSinLeer ?? []);
  const sinAnotar = new Set(entrada.cuenta.sinCostoAnotado);
  const delTotal = rentasDelTotal(entrada.cuenta);
  return {
    sinAnotar: delTotal.filter((c) => sinAnotar.has(c.id) && !sinLeer.has(c.id)).length,
    sinLeer: delTotal.filter((c) => sinLeer.has(c.id)).length,
  };
}

const palabraRentas = (n) => (n === 1 ? 'renta' : 'rentas');

/** Las frases que dicen que un total está corto, según cuántas rentas lo dejan así. */
function frasesDeTotalCorto({ sinAnotar, sinLeer }) {
  const notas = [];
  if (sinAnotar) {
    notas.push(`Falta anotar el costo de ${sinAnotar} ${palabraRentas(sinAnotar)}: este total es menor al real.`);
  }
  if (sinLeer) {
    notas.push(`No se pudo leer el costo de ${sinLeer} ${palabraRentas(sinLeer)}: este total puede no ser el real.`);
  }
  return notas;
}

/**
 * Lo que hay que decir al lado del total de una cuenta cuando está CORTO: rentas
 * sin costo anotado (cuentan como Q0.00) o con el costo sin leer. Es una lista de
 * frases, vacía cuando el total es completo.
 */
export function notasDeTotal(entrada, costoSinLeer) {
  return frasesDeTotalCorto(rentasCortas(entrada, costoSinLeer));
}

/**
 * Lo mismo para el total de TODOS los dueños, con las mismas frases y la misma
 * regla de qué rentas cuentan (la de `notasDeTotal`): si el total de un solo
 * dueño está corto, el de todos también lo está, y un total general limpio que
 * está mal es peor que uno con una nota que lo dice. Cuenta las rentas de todos
 * los dueños juntas, no dueño por dueño.
 */
export function notasDelTotalGeneral({ entradas, costoSinLeer }) {
  const junto = { sinAnotar: 0, sinLeer: 0 };
  for (const entrada of entradas ?? []) {
    const corto = rentasCortas(entrada, costoSinLeer);
    junto.sinAnotar += corto.sinAnotar;
    junto.sinLeer += corto.sinLeer;
  }
  return frasesDeTotalCorto(junto);
}

/**
 * ¿Esta diferencia tiene alguna renta sin costo en el que confiar? Entonces su
 * monto sale de una cifra dudosa y no se puede pagar todavía, igual que una renta.
 */
export function diferenciaBloqueada(diferencia, cuenta, costoSinLeer) {
  const bloqueadas = rentasSinCostoLegible(cuenta, costoSinLeer);
  return diferencia.contratos.some((c) => bloqueadas.has(c.id));
}

/**
 * Lo que está marcado y de verdad se puede pagar: los ids (de rentas, y las
 * claves de las diferencias), cuántos son y cuánto suman. El total sale de
 * `elegirParaPago` —la MISMA cuenta con la que `construirPagoDueno` arma el
 * monto—, así que lo que se ve abajo antes de registrar es exactamente lo que se
 * guarda.
 *
 * Una renta sin costo legible no entra aunque su casilla siga marcada (la casilla
 * ni se deja marcar, pero esto no depende de eso): pagarla borraría una deuda
 * real por Q0.00. Con una diferencia pasa lo mismo si alguna de sus rentas no
 * tiene costo legible.
 */
export function resumenDeMarcadas(entrada, marcados, costoSinLeer) {
  const bloqueadas = rentasSinCostoLegible(entrada.cuenta, costoSinLeer);
  const elegidos = marcados ?? new Set();
  const ids = [
    ...entrada.cuenta.porPagar
      .filter((c) => c?.id && elegidos.has(c.id) && !bloqueadas.has(c.id))
      .map((c) => c.id),
    ...entrada.cuenta.diferencias
      .filter((d) => elegidos.has(d.clave) && !d.contratos.some((c) => bloqueadas.has(c.id)))
      .map((d) => d.clave),
  ];
  return { ids, cuantas: ids.length, total: elegirParaPago(entrada.cuenta, ids).monto };
}

/**
 * Por qué un contrato todavía no cierra. No decide nada: lo lee de
 * `estadoContrato` (¿el carro ya regresó?) y de `pendientesDe` (¿falta cobrar
 * un saldo? ¿falta liberar la garantía?), las dos de nucleo/estados.js, las
 * mismas con las que se decide que un contrato cierra.
 */
export function razonDeNoCierre(contrato) {
  if (estadoContrato(contrato) === 'rentado') return 'El carro todavía no regresa.';
  const { saldo, garantia } = pendientesDe(contrato);
  const motivos = [];
  if (saldo > 0) motivos.push(`Saldo pendiente: ${dinero(saldo)}.`);
  if (garantia) motivos.push(`Garantía sin liberar: ${dinero(contrato?.garantiaMonto)}.`);
  return motivos.join(' ') || 'Todavía no cierra.';
}

/**
 * Los pagos que cubren rentas de esta cuenta, el más reciente primero. Se
 * reconocen por los contratos que cubren, no por `duenoId`: un pago hecho a un
 * grupo de contratos viejos guarda `duenoId: null`, y si después ese grupo se
 * enlaza a un dueño de la lista, el pago sigue siendo suyo.
 */
export function pagosDeLaCuenta(entrada, pagos) {
  const ids = new Set(entrada.contratos.map((c) => c.id));
  return (Array.isArray(pagos) ? pagos : [])
    .filter((p) => Array.isArray(p?.contratos) && p.contratos.some((id) => ids.has(id)))
    .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''))
      || (Number(b.numero) || 0) - (Number(a.numero) || 0));
}

// ---------------------------------------------------------------------------
// Registrar el pago
// ---------------------------------------------------------------------------

/**
 * Registra el pago de lo marcado. Las dependencias se reciben para poder probar
 * todo el recorrido sin red. `enCurso` es un objeto que el llamador conserva
 * entre intentos del MISMO pago (`{ id, numero }`, se llena aquí): es lo que hace
 * que repetir el intento —con internet lento, o apretando dos veces— caiga en el
 * mismo documento y el mismo número de comprobante en vez de crear otros.
 *
 * El recorrido, en orden:
 * 1. Vuelve a LEER los pagos antes de escribir. Si el pago de `enCurso` ya está
 *    ahí, un intento anterior sí había llegado: no se escribe nada, se devuelve
 *    ese.
 * 2. Vuelve a LEER los contratos, con la misma lectura de la pantalla. La
 *    cuenta que la pantalla tiene en memoria es la de cuando se abrió, y pudo
 *    cambiar mientras él armaba el pago: otra pestaña (o el mostrador) pudo
 *    corregir el cierre de una renta marcada y dejarla otra vez con saldo, y
 *    entonces ya no es pagable aunque su casilla siga marcada. Sin esta
 *    relectura el pago se registraba sobre la copia vieja, con su comprobante
 *    impreso, y el aviso llegaba después. Si no se pueden leer, no se registra.
 * 3. Si lo marcado ya no está por pagar (otra pestaña, o un intento anterior
 *    con otras casillas), o suma otra cosa que lo que él vio, NO se registra
 *    una versión recortada o distinta en silencio —él vio un monto y se
 *    guardaría otro—: se devuelve `cambio`. Lo marcado puede ser rentas por
 *    pagar y diferencias de rentas ya pagadas (sus claves «dif:…»): las dos se
 *    comparan igual.
 * 4. Arma el pago con `construirPagoDueno` sobre lo leído AHORA, que se niega
 *    con su propia frase si alguna renta marcada no tiene costo legible (el
 *    «sin leer» también es el de ahora, no el de cuando se abrió).
 * 5. Pide el id y el número UNA vez (`enCurso`) y guarda.
 *
 * Devuelve `{ tipo, pagos, contratos?, pago? }`: `pagos` y `contratos` son lo
 * leído (la pantalla los toma como la nueva verdad; `contratos` falta solo en
 * `ya-guardado`, que no necesitó leerlos). Lanza lo que lance cada paso.
 */
export async function registrarElPago({
  entrada, idsMarcados, forma, fecha: fechaDelPago, enCurso = {},
  leerPagos = cargarPagosDueno, leerContratos = cargarContratosParaDinero,
  nuevoId = nuevoIdPagoDueno, nuevoNumero = siguienteNumeroComprobante,
  guardar = guardarPagoDueno,
}) {
  if (!idsMarcados.length) throw new Error(MENSAJE_PAGO_SIN_RENTAS);

  const frescos = await leerPagos();
  if (frescos.fallo || !Array.isArray(frescos.datos)) throw new Error(MENSAJE_SIN_COMPROBAR);

  const yaGuardado = enCurso?.id ? frescos.datos.find((p) => p?.id === enCurso.id) : null;
  if (yaGuardado) return { tipo: 'ya-guardado', pago: yaGuardado, pagos: frescos.datos };

  // Lo que él vio: lo marcado sobre la cuenta que tenía en pantalla, con la misma
  // cuenta con la que se arma el pago (`elegirParaPago`).
  const visto = elegirParaPago(entrada.cuenta, idsMarcados);

  // La lectura que falle (o lance) NO se vuelve «ninguna renta»: se dice que no se pudo comprobar.
  const rentas = await Promise.resolve().then(() => leerContratos()).catch(() => null);
  // La cuenta se arma con la MISMA regla que la pantalla (`armarVista`), no con otra copia de ella.
  const vista = armarVista({ contratos: rentas, pagos: frescos });
  if (!vista.ok) throw new Error(MENSAJE_SIN_COMPROBAR_RENTAS);
  const cuentaDeAhora = vista.entradas.find((e) => e.clave === entrada.clave);
  if (!cuentaDeAhora) return { tipo: 'cambio', pagos: frescos.datos, contratos: rentas };

  const pago = construirPagoDueno({
    duenoId: entrada.duenoId,
    fecha: fechaDelPago,
    forma,
    contratos: cuentaDeAhora.contratos,
    pagos: frescos.datos,
    idsMarcados,
    costoSinLeer: rentas.costoSinLeer,
  });
  // Cada casilla marcada tiene que haber sido algo de la cuenta que él vio (una
  // renta por pagar o una diferencia), y el pago de ahora tiene que cubrir lo mismo
  // y sumar lo mismo.
  const igual = visto.rentas.length + visto.diferencias.length === idsMarcados.length
    && pago.contratos.length === visto.contratos.length
    && visto.contratos.every((id) => pago.contratos.includes(id))
    && pago.monto === visto.monto;
  if (!igual) return { tipo: 'cambio', pagos: frescos.datos, contratos: rentas };

  // Una vez por intención de pagar, y se conservan aunque este intento falle.
  enCurso.id ??= await nuevoId();
  enCurso.numero ??= await nuevoNumero();
  const guardado = await guardar({ ...pago, id: enCurso.id, numero: enCurso.numero });
  return { tipo: 'guardado', pago: guardado, pagos: [...frescos.datos, guardado], contratos: rentas };
}

/**
 * Lo que `pintarComprobante` (comprobante.js) pide: el pago ya guardado con su
 * número, el REGISTRO del dueño (o null para un grupo de contratos viejos con el
 * nombre escrito a mano), los contratos y los pagos tal como los leyó esta
 * pantalla, lo que no se pudo leer y la fecha de hoy. El comprobante escoge solo
 * al dueño con la misma regla que la pantalla (`agruparPorDueno`), así que aquí
 * no se recorta nada.
 */
export function entradaDelComprobante({
  entrada, pago, lectura: leida, hoy,
}) {
  return {
    pago,
    dueno: entrada.registro,
    contratos: leida.contratos.datos,
    pagos: leida.pagos.datos,
    costoSinLeer: leida.contratos.costoSinLeer,
    hoy,
  };
}

// ---------------------------------------------------------------------------
// HTML (funciones puras: reciben datos y devuelven texto, sin tocar el DOM)
// ---------------------------------------------------------------------------

// Nada de esta pantalla lleva estilos en línea: cada ajuste es una clase `dn-*` de
// css/estilos.css (como en las demás pantallas), y el resto —carros-contenido,
// tabla-carros, carro-seccion, barra-lectura-fallida, btn— son las clases de siempre.
// La hoja de impresión (`@media print`) y cualquier cambio de aspecto viven en el
// CSS; un estilo en línea los ganaría a todos sin que nadie lo notara.

/** La entrada: solo pide una contraseña. Nada de correo ni usuario, ni en palabras ni en un campo. */
export function htmlEntrada({ mensaje = '' } = {}) {
  const aparte = mensaje ? `<p class="dn-entrada-mensaje">${esc(mensaje)}</p>` : '';
  return `
    <div class="carros-contenido dn-entrada-caja">
      <form id="dn-entrada" class="carro-formulario" autocomplete="off" novalidate>
        <h1>Área de dinero</h1>
        <p class="dn-entrada-sub">Esta área tiene su propia contraseña.</p>
        ${aparte}
        <label class="carro-campo">Contraseña del área de dinero
          <input type="password" id="dn-clave" name="clave-del-area-de-dinero" autocomplete="new-password" spellcheck="false" required>
        </label>
        <p id="dn-error" class="barra-lectura-fallida dn-mensaje" role="alert" hidden></p>
        <div class="carro-botones">
          <button type="submit" id="dn-abrir" class="btn btn-primario dn-boton-suelto">Abrir</button>
        </div>
      </form>
    </div>`;
}

const barraRoja = (frases) => (frases.length
  ? `<div class="barra-lectura-fallida" role="alert">${frases.map((f) => `<p>${esc(f)}</p>`).join('')}</div>`
  : '');

/** Lo que se dibuja cuando NO se puede mostrar ninguna cuenta: una barra roja y cómo volver a intentarlo. Ninguna cifra. */
export function htmlFallo(vista) {
  const frases = [];
  if (vista.problemas.includes('contratos')) frases.push(MENSAJE_FALLO_CONTRATOS);
  if (vista.problemas.includes('pagos')) frases.push(MENSAJE_FALLO_PAGOS);
  if (vista.problemas.includes('datos')) frases.push(MENSAJE_FALLO_DATOS);
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado"><h1>Dinero</h1></div>
      ${barraRoja(frases)}
      <p><button type="button" class="btn btn-primario dn-boton-suelto" data-dn="reintentar">Volver a leer</button></p>
    </div>`;
}

/**
 * Qué comprobantes cubrieron una diferencia: «el comprobante N.° 7», «los
 * comprobantes N.° 7 y N.° 9». Es lo que le dice a él de dónde viene el monto.
 */
export function textoDeComprobantes(pagos) {
  const numeros = pagos.map((p) => `N.° ${p.numero ?? '—'}`);
  if (numeros.length <= 1) return `el comprobante ${numeros[0] ?? ''}`.trim();
  return `los comprobantes ${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`;
}

function filaDeLista(entrada, costoSinLeer) {
  const { cuenta } = entrada;
  // Una cuenta con solo una diferencia por pagar no es una cuenta apagada: se le debe.
  const filasPorPagar = cuenta.porPagar.length + cuenta.diferencias.length;
  const apagada = filasPorPagar === 0;
  const notas = notasDeTotal(entrada, costoSinLeer);
  const etiquetas = [
    entrada.sinEnlazar ? '<span class="etiqueta-estado" title="El nombre se escribió a mano en el contrato">Sin enlazar</span>' : '',
    entrada.sinRegistro ? '<span class="etiqueta-estado">No está en la lista de dueños</span>' : '',
  ].join('');
  const notasHtml = notas.map((n) => `<div class="dn-alerta dn-nota">${esc(n)}</div>`).join('');
  // Sin esto, «0 rentas por pagar» junto a una cifra se leería como un error de cuentas.
  const explicaDiferencia = cuenta.diferencias.length
    ? `<div class="dn-gris dn-nota">Incluye ${esc(dinero(cuenta.totalDiferencias))} de rentas ya pagadas cuyo monto cambió después del pago.</div>`
    : '';
  return `
    <tr class="${apagada ? 'es-fuera' : ''}" data-dn-clave="${esc(entrada.clave)}">
      <td><a href="${esc(rutaDeCuenta(entrada.clave))}">${esc(entrada.nombre)}</a> ${etiquetas}${explicaDiferencia}${notasHtml}</td>
      <td>${filasPorPagar}</td>
      <td class="dn-derecha"><strong>${esc(dinero(cuenta.totalPorPagar))}</strong>${
  notas.length ? '<div class="dn-alerta dn-nota-mini">incompleto</div>' : ''}</td>
    </tr>`;
}

/**
 * El pie de la lista: lo que se le debe a TODOS los dueños junto. Es lo que él
 * viene a preguntar al abrir esta pantalla, y suma también los grupos «sin
 * enlazar», que de otro modo se le pasarían de largo como una fila más.
 *
 * Si algún dueño tiene el total corto (una renta sin costo anotado, o con el
 * costo sin leer), este también lo está, y lo dice con las mismas palabras y la
 * misma marca de «incompleto» que ya usa cada fila: un total general limpio que
 * está mal es peor que uno con una nota que lo dice.
 */
function htmlTotalGeneral(vista) {
  const notas = vista.notasDelTotal.map((n) => `<div class="dn-alerta dn-nota">${esc(n)}</div>`).join('');
  const rentas = vista.entradas.reduce((t, e) => t + e.cuenta.porPagar.length + e.cuenta.diferencias.length, 0);
  return `
        <tfoot>
          <tr class="dn-fila-total">
            <td>Lo que debes a todos los dueños${notas}</td>
            <td>${rentas}</td>
            <td class="dn-derecha"><strong id="dn-total-general">${esc(dinero(vista.total))}</strong>${
  vista.notasDelTotal.length ? '<div class="dn-alerta dn-nota-mini">incompleto</div>' : ''}</td>
          </tr>
        </tfoot>`;
}

/**
 * La pantalla principal: una fila por dueño, de lo que más se le debe a lo que
 * menos. Con `vista.ok` en false NO dibuja filas: dibuja el fallo.
 */
export function htmlLista(vista, { migracion = '' } = {}) {
  if (!vista.ok) return htmlFallo(vista);
  const filas = vista.entradas.length
    ? vista.entradas.map((e) => filaDeLista(e, vista.costoSinLeer)).join('')
    : '<tr><td colspan="3" class="pendiente dn-vacio dn-vacio-ancho dn-sin-clic">Todavía no hay rentas de carros ajenos ni dueños en la lista.</td></tr>';
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <h1>Dinero</h1>
        <button type="button" class="btn" data-dn="actualizar">Actualizar</button>
        <a href="#/dinero/duenos" class="btn">Dueños</a>
      </div>
      ${vista.falloDuenos ? barraRoja([MENSAJE_FALLO_DUENOS]) : ''}
      <table class="tabla-carros">
        <thead>
          <tr><th>Dueño</th><th>Rentas cerradas por pagar</th><th class="dn-derecha">Se le debe</th></tr>
        </thead>
        <tbody>${filas}</tbody>${vista.entradas.length ? htmlTotalGeneral(vista) : ''}
      </table>
      <section class="carro-seccion dn-seccion-migracion">
        <h2>Mover el costo de los dueños</h2>
        <p class="dn-explica">Los contratos que se guardaron antes traen lo que le pagas al dueño por día dentro del contrato, donde lo puede leer quien use el mostrador. Este botón lo pasa detrás de la contraseña de dinero. Se corre una sola vez, a mano; si lo corres otra vez no daña nada.</p>
        <button type="button" class="btn" data-dn="migrar">Mover el costo ahora</button>
        <div id="dn-migracion">${migracion}</div>
      </section>
    </div>`;
}

/**
 * Lo que se enseña debajo del botón «Mover el costo ahora» cuando termina: una
 * barra roja si algo quedó sin mover o falló, o el recuadro verde si todo salió
 * bien. Función pura, para poder revisar cómo se ve sin correr la migración.
 */
export function htmlMigracion({ mensaje, problema }) {
  return problema
    ? `<p class="barra-lectura-fallida dn-mensaje-junto" role="alert">${esc(mensaje)}</p>`
    : `<p class="dn-migracion-ok">${esc(mensaje)}</p>`;
}

/** Los días de la renta, con los de atraso señalados. */
function htmlDeDias(contrato) {
  const dias = Number(contrato?.dias);
  const base = Number.isFinite(dias) ? `${dias} ${dias === 1 ? 'día' : 'días'}` : '—';
  const atraso = atrasoDe(contrato);
  return atraso > 0
    ? `${esc(base)} <span class="dn-alerta">+ ${atraso} de atraso</span>`
    : esc(base);
}

function htmlCostoDia(contrato, costo, ui) {
  if (costo === 'leido') return esc(dinero(costoDelDocumento(contrato)));
  if (costo === 'sin-leer') return '<span class="dn-alerta">No se pudo leer</span>';
  // Sin costo anotado: aquí está la salida de una renta que, sin esto, se quedaría
  // en «por pagar» para siempre. Solo se ofrece cuando de verdad falta: un costo
  // que no se pudo LEER podría ser uno real, y escribir encima lo pisaría.
  if (ui.anotando === contrato.id) {
    return `<span class="dn-costo-edicion">
      <input type="number" id="dn-costo-input" class="dn-costo-campo" min="0" step="0.01" inputmode="decimal" placeholder="Q por día"
        aria-label="Costo por día que le pagas al dueño">
      <button type="button" class="btn dn-boton-chico" data-dn="guardar-costo" data-id="${esc(contrato.id)}">Guardar</button>
      <button type="button" class="btn dn-boton-chico" data-dn="cancelar-costo">Cancelar</button>
    </span>`;
  }
  return `<span class="dn-alerta">Sin costo anotado</span>
    <button type="button" class="btn dn-boton-mini" data-dn="anotar-costo" data-id="${esc(contrato.id)}">Anotar costo</button>`;
}

/** Las rentas de una diferencia, una por línea, como las de «Ya pagado». */
function htmlRentasDeDiferencia(d) {
  return `<ul class="dn-pago-rentas">${d.contratos.map((c) => (
    `<li>${esc(fecha(c.fechaSalida))} · ${esc(c.carroPlacas || '—')} · ${esc(c.clienteNombre || '—')} · ${htmlDeDias(c)}</li>`
  )).join('')}</ul>`;
}

/**
 * Lo que se explica de una diferencia: de dónde viene (qué comprobantes) y por
 * qué hay un monto. NO es una renta más: la renta ya está pagada, y el
 * comprobante que el dueño del carro tiene sigue diciendo lo que dijo. Esto es lo
 * que se le debe además de eso.
 */
function htmlExplicacionDeDiferencia(d) {
  return `<strong>Diferencia de rentas ya pagadas</strong>
        <div class="dn-explica-chica dn-sin-margen">Se pagaron ${esc(dinero(d.pagado))} en ${esc(textoDeComprobantes(d.pagos))}, y hoy esas rentas suman ${esc(dinero(d.ahora))}.</div>
        ${htmlRentasDeDiferencia(d)}`;
}

/** Una diferencia por pagar: una fila con su casilla, igual que una renta. */
function htmlFilaDiferencia(d, ctx) {
  const bloqueada = diferenciaBloqueada(d, ctx.entrada.cuenta, ctx.vista.costoSinLeer);
  const marcada = !bloqueada && ctx.ui.marcados.has(d.clave);
  const titulo = bloqueada ? ' title="No se puede marcar hasta tener el costo por día"' : '';
  return `
    <tr class="dn-sin-clic" data-id="${esc(d.clave)}">
      <td><input type="checkbox" data-dn="marcar" data-id="${esc(d.clave)}" ${marcada ? 'checked' : ''} ${bloqueada ? 'disabled' : ''}${titulo}
        aria-label="Marcar la diferencia de las rentas ya pagadas para pagarla"></td>
      <td colspan="5">${htmlExplicacionDeDiferencia(d)}</td>
      <td class="dn-derecha"><strong>${esc(dinero(d.diferencia))}</strong></td>
    </tr>`;
}

function htmlFilaPorPagar(contrato, ctx) {
  const costo = estadoDeCosto(contrato, ctx.entrada.cuenta, ctx.vista.costoSinLeer);
  const bloqueada = costo !== 'leido';
  const marcada = !bloqueada && ctx.ui.marcados.has(contrato.id);
  const titulo = bloqueada ? ' title="No se puede marcar hasta tener el costo por día"' : '';
  return `
    <tr class="dn-sin-clic" data-id="${esc(contrato.id)}">
      <td><input type="checkbox" data-dn="marcar" data-id="${esc(contrato.id)}" ${marcada ? 'checked' : ''} ${bloqueada ? 'disabled' : ''}${titulo}
        aria-label="Marcar la renta de ${esc(contrato.carroPlacas)} para pagarla"></td>
      <td>${esc(fecha(contrato.fechaSalida))}</td>
      <td>${esc(contrato.carroPlacas || '—')}</td>
      <td>${esc(contrato.clienteNombre || '—')}</td>
      <td>${htmlDeDias(contrato)}</td>
      <td>${htmlCostoDia(contrato, costo, ctx.ui)}</td>
      <td class="dn-derecha">${costo === 'leido' ? `<strong>${esc(dinero(costoDelSubarriendo(contrato)))}</strong>` : '—'}</td>
    </tr>`;
}

function htmlBloquePorPagar(ctx) {
  const { entrada, vista, ui } = ctx;
  const { cuenta } = entrada;
  const notas = notasDeTotal(entrada, vista.costoSinLeer);
  const marcadas = resumenDeMarcadas(entrada, ui.marcados, vista.costoSinLeer);
  // Las diferencias van en la misma tabla que las rentas: son deuda por pagar, y
  // «No hay rentas cerradas por pagar» junto a una cifra que sí se debe sería mentira.
  const filas = cuenta.porPagar.length || cuenta.diferencias.length
    ? [
      ...cuenta.porPagar.map((c) => htmlFilaPorPagar(c, ctx)),
      ...cuenta.diferencias.map((d) => htmlFilaDiferencia(d, ctx)),
    ].join('')
    : '<tr><td colspan="7" class="pendiente dn-vacio dn-sin-clic">No hay rentas cerradas por pagar.</td></tr>';

  const formulario = ui.pagando ? `
    <div id="dn-pago-form" class="dn-caja dn-pago-form">
      <div class="carro-campos">
        <label class="carro-campo">Forma de pago
          <select id="dn-forma" class="dn-selector">
            ${FORMAS_DE_PAGO.map((f) => `<option value="${f.valor}" ${ui.forma === f.valor ? 'selected' : ''}>${f.etiqueta}</option>`).join('')}
          </select>
        </label>
        <label class="carro-campo">Fecha del pago
          <input type="date" id="dn-fecha" value="${esc(ui.fecha)}">
        </label>
      </div>
      <div class="carro-botones dn-botones-pago">
        <button type="button" class="btn" data-dn="cancelar-pago">Cancelar</button>
        <button type="button" class="btn btn-primario dn-boton-suelto" id="dn-guardar-pago" data-dn="guardar-pago" ${marcadas.cuantas === 0 ? 'disabled' : ''}>Guardar pago de ${esc(dinero(marcadas.total))}</button>
      </div>
      <p id="dn-mensaje-pago" class="barra-lectura-fallida dn-mensaje" role="alert" ${ui.mensajePago ? '' : 'hidden'}>${esc(ui.mensajePago)}</p>
    </div>` : '';

  return `
    <section class="carro-seccion">
      <h2>Por pagar</h2>
      ${barraRoja(notas)}
      <table class="tabla-carros">
        <thead>
          <tr><th></th><th>Salida</th><th>Placas</th><th>Cliente</th><th>Días</th><th>Costo por día</th><th class="dn-derecha">Monto</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="dn-caja dn-resumen">
        <div>Por pagar en total<br><strong class="dn-total">${esc(dinero(cuenta.totalPorPagar))}</strong>${notas.length ? '<br><span class="dn-alerta dn-nota">incompleto</span>' : ''}</div>
        <div id="dn-marcado" class="dn-marcado">Marcado: <strong id="dn-marcadas">${marcadas.cuantas}</strong> <span id="dn-marcadas-palabra">${palabraRentas(marcadas.cuantas)}</span><br>
          <span class="dn-rotulo">Total marcado</span> <strong id="dn-total-marcado" class="dn-total-marcado">${esc(dinero(marcadas.total))}</strong></div>
        <button type="button" class="btn btn-primario dn-boton-suelto" id="dn-registrar" data-dn="registrar" ${marcadas.cuantas === 0 || ui.pagando ? 'disabled' : ''}>Registrar pago</button>
      </div>
      ${formulario}
    </section>`;
}

function htmlBloqueAunNoCierra(ctx) {
  const { entrada, vista, ui } = ctx;
  const { cuenta } = entrada;
  const diferenciasSinCerrar = cuenta.diferenciasSinCerrar.map((d) => {
    // Por qué no cierra el grupo: lo dice cada renta que no cerró, con las mismas
    // palabras que una renta cualquiera de esta tabla.
    const razones = d.contratos.filter((c) => !esPagableAlDueno(c))
      .map((c) => `${esc(c.carroPlacas || '—')}: ${esc(razonDeNoCierre(c))}`).join('<br>');
    return `
    <tr class="es-fuera dn-sin-clic" data-id="${esc(d.clave)}">
      <td colspan="5">${htmlExplicacionDeDiferencia(d)}
        <div class="dn-explica-chica dn-sin-margen">Faltan ${esc(dinero(d.diferencia))} por pagarle, cuando cierre.</div></td>
      <td>${razones}</td>
    </tr>`;
  });
  const filas = cuenta.aunNoCierra.length || diferenciasSinCerrar.length
    ? cuenta.aunNoCierra.map((c) => {
      const costo = estadoDeCosto(c, cuenta, vista.costoSinLeer);
      return `
    <tr class="es-fuera dn-sin-clic" data-id="${esc(c.id)}">
      <td>${esc(fecha(c.fechaSalida))}</td>
      <td>${esc(c.carroPlacas || '—')}</td>
      <td>${esc(c.clienteNombre || '—')}</td>
      <td>${htmlDeDias(c)}</td>
      <td>${htmlCostoDia(c, costo, ui)}</td>
      <td>${esc(razonDeNoCierre(c))}</td>
    </tr>`;
    }).concat(diferenciasSinCerrar).join('')
    : '<tr><td colspan="6" class="pendiente dn-vacio dn-sin-clic">Ninguna renta de este dueño está esperando cerrar.</td></tr>';
  return `
    <section class="carro-seccion">
      <h2>Aún no cierra</h2>
      <p class="dn-explica-chica">Estas rentas se ven pero no se pueden marcar ni suman al total: todavía pueden cambiar de monto.</p>
      <table class="tabla-carros dn-tabla-gris">
        <thead>
          <tr><th>Salida</th><th>Placas</th><th>Cliente</th><th>Días</th><th>Costo por día</th><th>Por qué no cierra</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </section>`;
}

function htmlBloqueYaPagado(ctx) {
  const { entrada, lectura: datosLeidos } = ctx;
  const pagos = pagosDeLaCuenta(entrada, datosLeidos.pagos.datos);
  const rentaDe = (id) => entrada.contratos.find((c) => c.id === id);
  const tarjetas = pagos.map((p) => {
    const rentas = (p.contratos ?? []).map((id) => {
      const c = rentaDe(id);
      return c
        ? `<li>${esc(fecha(c.fechaSalida))} · ${esc(c.carroPlacas || '—')} · ${esc(c.clienteNombre || '—')} · ${htmlDeDias(c)}</li>`
        : '<li class="dn-gris">Una renta que ya no está en el sistema.</li>';
    }).join('');
    return `
      <article class="dn-caja dn-pago-hecho">
        <div class="dn-pago-cabecera">
          <div><strong>Comprobante N.° ${esc(p.numero ?? '—')}</strong> · ${esc(fecha(p.fecha))} · ${esc(etiquetaDeForma(p.forma))}</div>
          <div class="dn-pago-monto">
            <strong class="dn-pago-cifra">${esc(dinero(p.monto))}</strong>
            <button type="button" class="btn" data-dn="comprobante" data-id="${esc(p.id)}">Ver comprobante</button>
          </div>
        </div>
        <ul class="dn-pago-rentas">${rentas}</ul>
      </article>`;
  }).join('');
  return `
    <section class="carro-seccion">
      <h2>Ya pagado</h2>
      ${tarjetas || '<p class="dn-sin-pagos">Todavía no se le ha pagado nada.</p>'}
    </section>`;
}

/**
 * Lo que se ofrece para los contratos viejos con el nombre escrito a mano: o se
 * escoge a qué dueño de la lista corresponde ese nombre, o se da de alta uno con
 * ese mismo nombre y se enlaza. Sin esto último, el primer día no habría nadie a
 * quien enlazar: la lista de dueños empieza vacía.
 */
function htmlEnlace(ctx) {
  const { entrada, vista, ui } = ctx;
  const opciones = [...vista.registros].sort(porNombre)
    .map((d) => `<option value="${esc(d.id)}">${esc(d.nombre)}</option>`).join('');
  return `
    <section class="carro-seccion" id="dn-enlace">
      <h2>Contratos sin enlazar</h2>
      <p class="dn-parrafo">Estas rentas solo tienen el nombre «${esc(entrada.nombre)}» escrito a mano en el contrato, y mientras no se enlacen a un dueño de la lista se cuentan aparte de las que ese dueño ya tenga.</p>
      <div class="dn-enlace-fila">
        <select id="dn-enlazar-dueno" class="dn-selector" aria-label="Dueño de la lista">
          <option value="">Escoge un dueño de la lista</option>${opciones}
        </select>
        <button type="button" class="btn" data-dn="enlazar">Enlazar</button>
        <span class="dn-gris">o</span>
        <button type="button" class="btn" data-dn="crear-y-enlazar">Dar de alta a «${esc(entrada.nombre)}» y enlazar</button>
      </div>
      <p id="dn-mensaje-enlace" class="barra-lectura-fallida dn-mensaje-junto" role="alert" ${ui.mensajeEnlace ? '' : 'hidden'}>${esc(ui.mensajeEnlace)}</p>
    </section>`;
}

/** La ficha de un dueño: sus tres bloques, en este orden. */
export function htmlFicha(ctx) {
  const { entrada, vista } = ctx;
  const datos = entrada.registro
    ? `<p class="dn-datos-dueno">${[entrada.registro.telefono, entrada.registro.nit ? `NIT ${entrada.registro.nit}` : '']
      .filter(Boolean).map(esc).join(' · ') || 'Sin teléfono ni NIT anotados.'}
      · <a href="#/dinero/duenos/${esc(entrada.registro.id)}">Editar dueño</a></p>`
    : '';
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <a href="#/dinero" class="btn">← Dueños</a>
        <h1>${esc(entrada.nombre)}</h1>
      </div>
      ${vista.falloDuenos ? barraRoja([MENSAJE_FALLO_DUENOS]) : ''}
      ${datos}
      ${entrada.sinEnlazar ? htmlEnlace(ctx) : ''}
      ${htmlBloquePorPagar(ctx)}
      ${htmlBloqueAunNoCierra(ctx)}
      ${htmlBloqueYaPagado(ctx)}
    </div>`;
}

/**
 * Pone en la ficha YA DIBUJADA lo que dice lo marcado, sin redibujarla: la cuenta
 * («Marcado: N renta/rentas»), el total y los botones. Es lo que él ve al marcar
 * una casilla, y es un parche sobre la página: la plantilla (`htmlBloquePorPagar`)
 * dice lo mismo con los mismos datos, pero son dos caminos distintos y los dos
 * tienen que dar la misma frase.
 *
 * Se parchea la PALABRA igual que el número, con la misma `palabraRentas` que usa
 * la plantilla: antes solo se cambiaba el número, y marcar una casilla dejaba
 * «Marcado: 1 rentas». `raiz` es cualquier cosa con `querySelector`.
 */
export function parchearMarcado(raiz, resumenMarcado, { pagando = false } = {}) {
  const poner = (id, texto) => { const nodo = raiz.querySelector(id); if (nodo) nodo.textContent = texto; };
  poner('#dn-marcadas', String(resumenMarcado.cuantas));
  poner('#dn-marcadas-palabra', palabraRentas(resumenMarcado.cuantas));
  poner('#dn-total-marcado', dinero(resumenMarcado.total));
  poner('#dn-guardar-pago', `Guardar pago de ${dinero(resumenMarcado.total)}`);
  const guardar = raiz.querySelector('#dn-guardar-pago');
  if (guardar) guardar.disabled = resumenMarcado.cuantas === 0;
  const registrar = raiz.querySelector('#dn-registrar');
  if (registrar) registrar.disabled = resumenMarcado.cuantas === 0 || pagando;
}

// ---------------------------------------------------------------------------
// La lectura
// ---------------------------------------------------------------------------

/**
 * Lee lo que la pantalla necesita, de la nube y con la credencial de dinero.
 * Ninguna de las tres lecturas puede tumbar a las otras ni dejar la pantalla sin
 * respuesta: cada una, si lanza, se vuelve un fallo — nunca una lista vacía.
 *
 * Contratos: `cargarContratosParaDinero` y NINGUNA otra. `cargarContratosAbiertos`
 * descarta los cerrados, que son justo los que se pagan, y cualquier otra lectura
 * trae el costo del dueño en cero: la pantalla no mostraría nada por pagar.
 */
async function leerTodo(alLlegarDuenos) {
  const [contratos, pagos, duenos] = await Promise.all([
    cargarContratosParaDinero().catch(() => ({ datos: null, fallo: true, costoSinLeer: null })),
    cargarPagosDueno().catch(() => ({ datos: null, fallo: true })),
    cargarDuenos(alLlegarDuenos).catch(() => ({ datos: [], fallo: true })),
  ]);
  return { contratos, pagos, duenos };
}

/**
 * Lo ya leído, y quién lo lee. Una sola regla decide qué se guarda: SOLO una
 * lectura que `armarVista` da por buena. Una lectura fallida no se guarda, y
 * además BORRA lo que hubiera guardado de antes.
 *
 * Esto último es lo que costó un error de verdad (lo encontró la prueba en el
 * navegador): con «Actualizar» y la nube caída, la lectura nueva fallaba pero la
 * vieja seguía guardada, y la pantalla dibujaba la lista de antes como si fuera
 * de ahora — una cuenta que quizá ya cambió (otro pago, otro contrato) sin una
 * sola palabra. Si no se pudo leer, no se sabe: se dice, no se enseña lo viejo.
 *
 * `leer(alLlegarDuenos)` entrega las tres lecturas; `alCambiar` avisa cuando la
 * lista de dueños llega tarde (la nube termina de sincronizar por detrás); `valida`
 * dice si una lectura sirve para guardarse. Se reciben para poder probarlo sin red.
 */
export function crearLector({ leer, alCambiar = () => {}, valida = (l) => armarVista(l).ok }) {
  let guardada = null;
  let enCurso = null;
  let generacion = 0;
  // La lectura más reciente que se pidió: una respuesta tardía de una más vieja no cuenta.
  let ultimaPedida = null;
  return {
    /** Lo guardado, o null. Se lee en cada uso: nunca una copia. */
    get actual() { return guardada; },
    async obtener({ forzar = false } = {}) {
      if (guardada && !forzar) return guardada;
      if (!enCurso) {
        const mia = generacion;
        const esta = { guardada: false, tardia: null };
        ultimaPedida = esta;
        // La sincronía de fondo de los dueños puede avisar ANTES de que esta
        // lectura termine de guardarse (cuando la nube falla al instante): ese
        // aviso no se pierde, se pone cuando la lectura ya está.
        const alLlegarDuenos = (r) => {
          if (mia !== generacion || ultimaPedida !== esta) return;
          if (!esta.guardada) { esta.tardia = r; return; }
          guardada.duenos = r;
          alCambiar();
        };
        enCurso = Promise.resolve()
          .then(() => leer(alLlegarDuenos))
          .then((l) => {
            // Si la sesión se cerró mientras se leía, lo leído no se guarda.
            if (mia === generacion) {
              if (esta.tardia && l) l.duenos = esta.tardia;
              guardada = valida(l) ? l : null;
              esta.guardada = true;
            }
            return l;
          })
          .finally(() => { if (mia === generacion) enCurso = null; });
      }
      return enCurso;
    },
    /**
     * Vuelve a pedir SOLO la lista de dueños, sobre lo ya guardado (es local y
     * rápida): si se acaba de corregir un nombre en la pantalla de dueños, aquí
     * debe verse ya. Lo que llega por detrás gana sobre la primera respuesta,
     * lleguen en el orden que lleguen.
     */
    async refrescarDuenos(leerDuenos) {
      const actual = guardada;
      if (!actual) return;
      const mia = generacion;
      let llegoAlgoPorDetras = false;
      const poner = (r) => {
        if (mia !== generacion || guardada !== actual) return false;
        actual.duenos = r;
        return true;
      };
      const primera = await leerDuenos((r) => {
        llegoAlgoPorDetras = true;
        if (poner(r)) alCambiar();
      });
      if (!llegoAlgoPorDetras) poner(primera);
    },
    /** Suelta todo (se cerró la sesión) e invalida lo que todavía esté leyéndose. */
    olvidar() {
      generacion += 1;
      guardada = null;
      enCurso = null;
    },
  };
}

const lector = crearLector({ leer: leerTodo, alCambiar: () => repintarActual?.() });

// ---------------------------------------------------------------------------
// La entrada y la puerta
// ---------------------------------------------------------------------------

function dibujarEntrada(contenedor, { alEntrar }) {
  // Lo que se esté cargando para dibujarse más tarde no tiene que tapar la entrada.
  ultimoToken += 1;
  const mensaje = mensajeDeEntrada;
  mensajeDeEntrada = '';
  contenedor.innerHTML = htmlEntrada({ mensaje });
  const forma = contenedor.querySelector('#dn-entrada');
  const campo = contenedor.querySelector('#dn-clave');
  const boton = contenedor.querySelector('#dn-abrir');
  const error = contenedor.querySelector('#dn-error');
  campo.focus();

  forma.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // La contraseña sale del campo antes de esperar: no se queda escrita en la página.
    const clave = campo.value;
    campo.value = '';
    error.hidden = true;
    boton.disabled = true;
    try {
      await entrarADinero(CORREO_DE_DINERO, clave);
    } catch (fallo) {
      // `entrarADinero` ya traduce todo a una frase en español: nunca un código de Firebase.
      error.textContent = fallo.message;
      error.hidden = false;
      boton.disabled = false;
      campo.focus();
      return;
    }
    boton.disabled = false;
    vigilante.iniciar();
    alEntrar();
  });
}

/**
 * Envuelve una pantalla del área de dinero con la entrada: sin sesión de dinero
 * se dibuja el formulario de la contraseña, y con ella se dibuja la pantalla. La
 * sesión se pregunta cada vez a `sesionDeDinero()`, que la lee del Auth en vivo:
 * si Firebase la cerró por su cuenta, la puerta lo sabe.
 */
export function conPuertaDeDinero(pintar) {
  return async function conPuerta(contenedor, ...parametros) {
    if (!sesionDeDinero()) {
      dibujarEntrada(contenedor, { alEntrar: () => conPuerta(contenedor, ...parametros) });
      return undefined;
    }
    instalarLatidos();
    vigilante.iniciar();
    return pintar(contenedor, ...parametros);
  };
}

// ---------------------------------------------------------------------------
// La pantalla: la lista y la ficha
// ---------------------------------------------------------------------------

/** La lista de dueños, `#/dinero`. */
export function pintarDinero(contenedor) {
  return pintarCuentas(contenedor, null);
}

/** La ficha de un dueño, `#/dinero/cuenta/:clave`. */
export function pintarCuentaDeDueno(contenedor, clave) {
  return pintarCuentas(contenedor, clave);
}

async function pintarCuentas(contenedor, claveDeFicha) {
  const miToken = ++ultimoToken;
  const hoy = hoyISO();
  const vigente = () => miToken === ultimoToken && enElAreaDeDinero(location.hash);

  // Todo lo que esta pantalla engancha cuelga de esta caja y no del contenedor:
  // el router reutiliza siempre el mismo <main>, y un manejador pegado a él se
  // seguiría disparando en las demás pantallas.
  const raiz = document.createElement('div');
  contenedor.replaceChildren(raiz);
  raizActual = raiz;

  const ui = {
    marcados: new Set(), anotando: null, pagando: false, forma: FORMAS_DE_PAGO[0].valor, fecha: hoy,
    mensajePago: '', mensajeEnlace: '', enCurso: null, ocupado: false, migracion: '',
    // «Dar de alta como dueño y enlazar» crea un dueño: su id se decide una vez, antes del primer intento, para
    // que un reintento tras un tiempo vencido no cree un segundo dueño con el mismo nombre (H-2). Va por grupo
    // («sin enlazar»): un intento fallido de uno no le pega su id a otro.
    altaDeDueno: altaConIdFijo(nuevoIdDueno),
  };
  let vista = null;
  let entrada = null;
  let claveActual = claveDeFicha;
  // La última lectura que NO salió bien: no se guarda con lo demás (reintentar
  // tiene que volver a pedirla), pero hace falta para decir QUÉ falló.
  let lecturaFallida = null;

  function dibujar() {
    // Sin sesión no se dibuja nada: lo leído se soltó al cerrarse.
    if (!vigente() || !sesionDeDinero()) return;
    vista = armarVista(lector.actual ?? lecturaFallida ?? {});
    if (!vista.ok) {
      raiz.innerHTML = htmlFallo(vista);
      return;
    }
    if (claveActual === null) {
      raiz.innerHTML = htmlLista(vista, { migracion: ui.migracion });
      return;
    }
    entrada = vista.entradas.find((e) => e.clave === claveActual) ?? null;
    if (!entrada) {
      raiz.innerHTML = `<div class="carros-contenido"><p class="pendiente">No se encontró esta cuenta. <a href="#/dinero">Volver a la lista</a></p></div>`;
      return;
    }
    // Lo marcado que ya no se puede pagar (porque se pagó, o cambió) se desmarca.
    const pagables = new Set([...entrada.cuenta.porPagar.map((c) => c.id), ...entrada.cuenta.diferencias.map((d) => d.clave)]);
    for (const id of [...ui.marcados]) if (!pagables.has(id)) ui.marcados.delete(id);
    raiz.innerHTML = htmlFicha({ entrada, vista, ui, lectura: lector.actual, hoy });
    if (ui.anotando) raiz.querySelector('#dn-costo-input')?.focus();
  }

  async function cargarYDibujar({ forzar = false } = {}) {
    raiz.innerHTML = '<p class="pendiente">Leyendo las cuentas de los dueños…</p>';
    const eraDeAntes = Boolean(lector.actual) && !forzar;
    const leida = await lector.obtener({ forzar });
    if (!vigente()) return;
    lecturaFallida = lector.actual ? null : leida;
    // Los contratos y los pagos se reusan al ir de la lista a una ficha, pero la
    // lista de dueños se vuelve a pedir (es local y rápida): si se acaba de
    // corregir un nombre en la pantalla de dueños, aquí debe verse ya.
    if (eraDeAntes) {
      await lector.refrescarDuenos((alLlegar) => cargarDuenos(alLlegar).catch(() => ({ datos: [], fallo: true })));
      if (!vigente() || !lector.actual) return;
    }
    // Si la sesión se cerró mientras se leía (inactividad, o Firebase), se pide la contraseña otra vez.
    if (!sesionDeDinero()) {
      dibujarEntrada(contenedor, { alEntrar: () => mostrar(location.hash) });
      return;
    }
    dibujar();
  }

  repintarActual = dibujar;

  /**
   * ¿Sigue habiendo sesión de dinero? Si Firebase la cerró por su cuenta (se
   * venció el permiso), seguir como si nada haría que cada acción fallara con un
   * «revisa tu internet» que no es: se suelta lo leído y se pide la contraseña.
   */
  function haySesion() {
    if (sesionDeDinero()) return true;
    lector.olvidar();
    dibujarEntrada(contenedor, { alEntrar: () => mostrar(location.hash) });
    return false;
  }

  // ----- Marcar rentas: solo se mueve el total, no se redibuja nada -----
  function actualizarMarcado() {
    if (!entrada) return;
    parchearMarcado(raiz, resumenDeMarcadas(entrada, ui.marcados, vista.costoSinLeer), { pagando: ui.pagando });
  }

  // ----- Anotar el costo de una renta sin costo -----
  async function guardarCosto(id) {
    if (ui.ocupado || !haySesion()) return;
    const contrato = lector.actual?.contratos.datos.find((c) => c.id === id);
    const campo = raiz.querySelector('#dn-costo-input');
    if (!contrato || !campo) return;
    ui.ocupado = true;
    try {
      const costo = await anotarCostoDelDueno(contrato, campo.value);
      const leida = lector.actual;
      if (!leida) return;
      // Se pone en memoria con el mismo puente que usa la lectura: queda como
      // quedaría si se volviera a leer, sin volver a pedirle todo a la nube.
      leida.contratos.datos = leida.contratos.datos.map((c) => (c.id === id ? conCostoDelDueno(c, costo) : c));
      ui.anotando = null;
      aviso(`Costo anotado: ${dinero(costo)} por día.`, 'exito');
      dibujar();
    } catch (error) {
      aviso(mensajeSeguro(error, MENSAJE_COSTO_FALLO), 'error');
    } finally {
      ui.ocupado = false;
    }
  }

  // ----- Registrar el pago -----
  async function guardarPago() {
    if (ui.ocupado || !haySesion()) return;
    const marcadas = resumenDeMarcadas(entrada, ui.marcados, vista.costoSinLeer);
    const campoFecha = raiz.querySelector('#dn-fecha');
    ui.fecha = campoFecha?.value || ui.fecha;
    ui.forma = raiz.querySelector('#dn-forma')?.value || ui.forma;
    const problemaDeFecha = problemaDeLaFechaDelPago(ui.fecha, hoyISO());
    if (problemaDeFecha) { ui.mensajePago = problemaDeFecha; dibujar(); return; }
    ui.ocupado = true;
    const boton = raiz.querySelector('#dn-guardar-pago');
    if (boton) boton.disabled = true;
    try {
      const r = await registrarElPago({
        entrada,
        idsMarcados: marcadas.ids,
        forma: ui.forma,
        fecha: ui.fecha,
        enCurso: ui.enCurso ?? (ui.enCurso = {}),
      });
      if (!lector.actual) return;
      lector.actual.pagos.datos = r.pagos;
      // Los contratos que se leyeron al guardar son ahora la verdad: si una renta
      // cambió mientras tanto, la lista ya la dibuja como está, no como estaba.
      if (r.contratos) lector.actual.contratos = r.contratos;
      if (r.tipo === 'cambio') {
        ui.mensajePago = MENSAJE_PAGO_CAMBIO;
        ui.marcados.clear();
        ui.enCurso = null;
      } else {
        ui.pagando = false;
        ui.mensajePago = '';
        ui.marcados.clear();
        ui.enCurso = null;
        aviso(r.tipo === 'ya-guardado'
          ? `Ese pago ya estaba registrado (comprobante N.° ${r.pago.numero}).`
          : `Pago registrado. Comprobante N.° ${r.pago.numero}.`, 'exito');
      }
      dibujar();
    } catch (error) {
      ui.mensajePago = mensajeSeguro(error, MENSAJE_PAGO_FALLO);
      dibujar();
    } finally {
      ui.ocupado = false;
    }
  }

  // ----- Enlazar los contratos viejos a un dueño de la lista -----
  async function enlazar({ crear }) {
    if (ui.ocupado || !entrada?.sinEnlazar) return;
    let duenoId = raiz.querySelector('#dn-enlazar-dueno')?.value ?? '';
    let nombreDelDueno = vista.registros.find((d) => d.id === duenoId)?.nombre ?? '';
    if (!crear && !duenoId) { ui.mensajeEnlace = 'Escoge a qué dueño de la lista corresponde.'; dibujar(); return; }
    const cuantos = entrada.contratos.length;
    const pregunta = crear
      ? `¿Dar de alta a «${entrada.nombre}» como dueño y enlazarle ${cuantos} ${cuantos === 1 ? 'contrato' : 'contratos'}? Esto no se puede deshacer desde el sistema.`
      : `¿Enlazar ${cuantos} ${cuantos === 1 ? 'contrato' : 'contratos'} de «${entrada.nombre}» al dueño «${nombreDelDueno}»? Esto no se puede deshacer desde el sistema.`;
    if (!window.confirm(pregunta)) return;
    ui.ocupado = true;
    ui.mensajeEnlace = '';
    try {
      if (crear) {
        const alta = await guardarDueno(await ui.altaDeDueno.paraGuardar(construirDueno({}, { nombre: entrada.nombre }), entrada.clave));
        duenoId = alta.id;
        // El dueño recién creado ya está: si el enlace falla, el siguiente intento lo escoge de la lista.
        const antes = lector.actual;
        if (antes) antes.duenos = { ...antes.duenos, datos: [...(antes.duenos.datos ?? []), alta] };
      }
      await enlazarContratosAlDueno(entrada.contratos.map((c) => c.id), duenoId);
      // Con el enlace hecho el alta terminó: la siguiente vez, otro dueño. Antes de aquí NO se suelta: si el enlace
      // falla y se repite «dar de alta», cae en el mismo dueño y no crea otro.
      ui.altaDeDueno.terminada();
      const leida = lector.actual;
      if (!leida) return;
      const enlazados = new Set(entrada.contratos.map((c) => c.id));
      leida.contratos.datos = leida.contratos.datos.map((c) => (enlazados.has(c.id) ? { ...c, duenoId } : c));
      aviso('Contratos enlazados.', 'exito');
      // La cuenta cambia de clave (de `texto:` a `id:`): se actualiza la dirección sin volver a leer.
      claveActual = `id:${duenoId}`;
      history.replaceState(null, '', rutaDeCuenta(claveActual));
      ui.mensajeEnlace = '';
    } catch (error) {
      ui.mensajeEnlace = mensajeSeguro(error, MENSAJE_ENLACE_FALLO);
    } finally {
      ui.ocupado = false;
    }
    dibujar();
  }

  // ----- El comprobante -----
  function verComprobante(pagoId) {
    const leida = lector.actual;
    const pago = leida?.pagos.datos.find((p) => p.id === pagoId);
    if (!pago) return;
    try {
      pintarComprobante(raiz, entradaDelComprobante({ entrada, pago, lectura: leida, hoy }), { alVolver: dibujar });
    } catch (error) {
      console.error(error);
      aviso(MENSAJE_COMPROBANTE_FALLO, 'error');
    }
  }

  // ----- La migración del costo, una vez y a mano -----
  async function migrar(boton) {
    if (ui.ocupado || !haySesion()) return;
    if (!window.confirm('¿Mover ahora el costo de los dueños detrás de la contraseña de dinero? Se corre una sola vez y no se puede deshacer desde el sistema.')) return;
    ui.ocupado = true;
    boton.disabled = true;
    const caja = raiz.querySelector('#dn-migracion');
    try {
      const resultado = await migrarCostosDelDueno({
        alAvanzar: (hechos, total) => { boton.textContent = `Moviendo… ${hechos} de ${total}`; },
      });
      const mensaje = mensajeDeMigracion(resultado);
      const hayProblema = resultado.conflictos.length || resultado.fallidos.length || !resultado.copiaLocalLimpia;
      ui.migracion = htmlMigracion({ mensaje, problema: Boolean(hayProblema) });
    } catch (error) {
      // Sin sesión de dinero, o la lectura de contratos falló: nunca «0 contratos movidos».
      const frase = mensajeSeguro(error, 'No se pudo mover el costo. Revisa tu internet e intenta de nuevo: lo que ya se movió no se repite.');
      ui.migracion = htmlMigracion({ mensaje: frase, problema: true });
    } finally {
      ui.ocupado = false;
    }
    if (caja && vigente()) dibujar();
  }

  // ----- Los eventos, todos desde la raíz -----
  raiz.addEventListener('click', (ev) => {
    const accion = ev.target.closest('[data-dn]');
    if (accion) {
      const id = accion.dataset.id;
      switch (accion.dataset.dn) {
        case 'reintentar':
        case 'actualizar':
          cargarYDibujar({ forzar: true });
          return;
        case 'anotar-costo': ui.anotando = id; dibujar(); return;
        case 'cancelar-costo': ui.anotando = null; dibujar(); return;
        case 'guardar-costo': guardarCosto(id); return;
        case 'registrar': ui.pagando = true; ui.mensajePago = ''; ui.enCurso = {}; dibujar(); return;
        case 'cancelar-pago': ui.pagando = false; ui.mensajePago = ''; ui.enCurso = null; dibujar(); return;
        case 'guardar-pago': guardarPago(); return;
        case 'enlazar': enlazar({ crear: false }); return;
        case 'crear-y-enlazar': enlazar({ crear: true }); return;
        case 'comprobante': verComprobante(id); return;
        case 'migrar': migrar(accion); return;
        default: return;
      }
    }
    // Un clic en cualquier parte de una fila de la lista abre esa cuenta (como en clientes).
    const fila = ev.target.closest('tr[data-dn-clave]');
    if (fila && !ev.target.closest('a')) location.hash = rutaDeCuenta(fila.dataset.dnClave);
  });

  raiz.addEventListener('change', (ev) => {
    const caja = ev.target;
    if (caja.matches?.('[data-dn="marcar"]')) {
      if (caja.checked) ui.marcados.add(caja.dataset.id);
      else ui.marcados.delete(caja.dataset.id);
      actualizarMarcado();
    } else if (caja.id === 'dn-forma') {
      ui.forma = caja.value;
    } else if (caja.id === 'dn-fecha') {
      ui.fecha = caja.value;
    }
  });

  raiz.addEventListener('keydown', (ev) => {
    if (ev.target.id !== 'dn-costo-input') return;
    if (ev.key === 'Enter') { ev.preventDefault(); guardarCosto(ui.anotando); }
    if (ev.key === 'Escape') { ui.anotando = null; dibujar(); }
  });

  await cargarYDibujar();
}
