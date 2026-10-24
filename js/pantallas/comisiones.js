// Las comisiones de los empleados: lo que se le debe a cada uno, y el pago (§6 del diseño: «Comisiones […] con el detalle
// de cada contrato y de dónde sale cada número. Casillas para seleccionar qué contratos se van a pagar, con el total de
// lo seleccionado y el botón de pagar; queda registrada la fecha. Los pagados se separan de los pendientes»).
//
// Es la GEMELA de dinero.js (lo que se le debe a cada dueño de un carro ajeno), con la misma forma — una lista de personas
// con lo que se les debe, una ficha con tres bloques, casillas con el total sumando a la vista, un pago que se anula dejando
// rastro — y las mismas tres cosas que no se negocian:
//
// 1. LA CONTRASEÑA ES UNA SEGUNDA CREDENCIAL, NO UNA CORTINA. Esta pantalla vive detrás de `conPuertaDeDinero` (app.js) y
//    lo que lee y escribe (`pagosComision`) solo lo deja pasar la regla de Firestore a la credencial de dinero. Lo que lee
//    queda en la memoria de este módulo y se SUELTA cuando la sesión de dinero se cierra, por la vía que sea
//    (`alOlvidarElDinero`, dinero.js): lo ya leído también es dinero.
//
// 2. NINGUNA REGLA DE NEGOCIO SE ESCRIBE AQUÍ. Cuánto es la comisión de una renta lo dice `comisionDe` (nucleo/comision.js);
//    qué se le debe, qué todavía no es firme y qué suma lo marcado, nucleo/comisiones.js; cómo se arma el pago,
//    `construirPagoComision` (datos.js). Esta pantalla pregunta y dibuja. Este proyecto ya perdió muchas vueltas de revisión
//    por reglas escritas en dos lugares.
//
// 3. UNA LECTURA FALLIDA NUNCA SE DIBUJA COMO «NO LE DEBES NADA A NADIE». Eso es buena noticia, y a las buenas noticias nadie
//    las audita. Si falla la lectura de las rentas o de los pagos no se dibuja ninguna cuenta; si falla la de los empleados
//    se dibuja lo que se puede (lo que se debe sale de las rentas y los pagos) y se dice.
//
// Lo que esta pantalla hace distinto de la de los dueños, por lo que es una comisión y no un costo:
// - SOLO SE PAGA LO FIRME, Y FIRME ES UN CONTRATO CERRADO (el dueño, 14 de octubre de 2026: «Lo miro cuando el contrato está
//   cerrado y tengo que pagar quincena o final de mes. Yo decido cuándo lo pago.»): la misma regla con la que se le paga al
//   dueño de un carro ajeno, y se le pregunta al núcleo (`estadoDeComision`, que pregunta a `estadoContrato`). Una renta cuyo
//   carro sigue afuera es un estimado (un día de atraso la sube, un descuento la baja); una cuyo carro ya volvió pero cuyo
//   cliente debe saldo, o tiene la garantía sin liberar, ya tiene su monto y solo espera a cerrar. Las dos se ven, aparte, con
//   SU razón (`razonDeNoCierre`, las mismas palabras que la ficha del dueño) y sin casilla.
// - EL DUEÑO PAGA POR QUINCENA Y POR FIN DE MES y decide él cuándo: la ficha deja marcar un período de un clic. No pone plazos, no
//   dice qué lleva días sin pagarse ni pinta nada de rojo por no haber pagado; solo agrupa lo que hay por la fecha en que regresó
//   el carro. Nada se marca en silencio: lo que queda fuera de lo marcado sigue a la vista, con su total.
// - Un empleado con 0 % (Wilder) no tiene nada que pagarle: sus rentas no ofrecen casilla, y se dice cuántas son.
import { comisionDe } from '../nucleo/comision.js';
import {
  agruparPorEmpleado, cuentaDeEmpleado, elegirParaPagoDeComision, totalGeneralDeComisiones, rentasSinPagar, estadoDeComision,
  periodosDePago, sinMarcarDeComision, quincenaDe, detallesIguales, estadoDelComprobante,
} from '../nucleo/comisiones.js';
import { pagoAnulado, totalesDePagos } from '../nucleo/liquidacion.js';
import { q } from '../nucleo/dinero.js';
import { porcentajeAnotado, estaActivo, ordenarEmpleados } from '../nucleo/empleado.js';
import { atrasoDe } from '../nucleo/contrato.js';
import { hoyISO, esFechaISO } from '../nucleo/fechas.js';
import { sesionDeDinero } from '../dinero-sesion.js';
import {
  cargarContratosDeLaNube, cargarPagosComision, cargarEmpleados, nuevoIdPagoComision, siguienteNumeroComprobanteComision,
  construirPagoComision, guardarPagoComision,
  anularPagoComision, enlazarContratosAlEmpleado, MENSAJE_COMISION_SIN_DINERO, MENSAJE_COMISION_SIN_RENTAS,
  MENSAJE_COMISION_SIN_MONTO, MENSAJE_COMISION_SIN_ID, MENSAJE_ENLACE_SIN_DINERO,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';
import { mostrar } from '../router.js';
import { escribirLibro } from '../respaldo/libroNuevo.js';
import { serialDeFecha } from '../respaldo/hojas.js';
import {
  FORMAS_DE_PAGO, etiquetaDeForma, crearLector, problemaDeLaFechaDelPago, parchearMarcado, alOlvidarElDinero, enElAreaDeDinero,
  razonDeNoCierre,
} from './dinero.js';
import { descargarArchivo } from './respaldo.js';
import { pintarComprobanteDeComision, motivoSinComprobante } from './comprobanteComision.js';

// El texto libre (nombres, placas, el nombre escrito a mano) se escapa antes de entrar al HTML, igual que en las demás pantallas.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const RUTA_DE_COMISIONES = '#/dinero/comisiones';

/** La dirección de la ficha de una cuenta. La clave puede traer espacios y «/»: se escapa. */
export const rutaDeComisiones = (clave) => `${RUTA_DE_COMISIONES}/${encodeURIComponent(clave)}`;

// ---------------------------------------------------------------------------
// Lo que el dueño lee cuando algo falla: nunca el texto crudo de Firebase
// ---------------------------------------------------------------------------

export const MENSAJE_FALLO_RENTAS = 'No se pudieron leer las rentas. No se muestra ninguna cuenta porque cualquier cifra saldría incompleta.';
export const MENSAJE_FALLO_PAGOS_DE_COMISION = 'No se pudieron leer los pagos de comisión. Sin ellos no se sabe qué ya se pagó, y una cuenta ahora podría hacerte pagar dos veces.';
export const MENSAJE_FALLO_DATOS_DE_COMISION = 'Hay una renta o un pago guardado que no se puede leer completo, así que no se muestra ninguna cuenta. Avisa a quien lleva el sistema.';
export const MENSAJE_FALLO_EMPLEADOS = 'No se pudo leer la lista de empleados. Los nombres y porcentajes que ves pueden estar desactualizados o faltar.';
export const MENSAJE_COMISION_SIN_COMPROBAR = 'No se pudo comprobar si estas rentas ya tienen un pago registrado, y registrar sin saberlo podría pagarlas dos veces. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_COMISION_SIN_COMPROBAR_RENTAS = 'No se pudo comprobar si estas rentas siguen igual, y registrar sin saberlo podría pagar una comisión que ya cambió. Revisa tu internet e intenta de nuevo.';
export const MENSAJE_COMISION_CAMBIO = 'Mientras tanto cambió la cuenta de este empleado: alguna de las rentas marcadas ya no se puede pagar o cambió de monto o de datos (por ejemplo, ya tiene un pago registrado, o se corrigió su cierre). No se registró nada; la lista ya está al día, revisa y vuelve a marcar.';
export const MENSAJE_COMISION_FALLO = 'No se pudo registrar el pago. Revisa tu internet y vuelve a apretar «Guardar pago»: si ya había quedado guardado, no se duplica. '
  + 'Si sigue sin conectar, recarga la página y revisa «Ya pagado» antes de intentarlo otra vez.';
export const MENSAJE_ANULAR_COMISION_SIN_COMPROBAR = 'No se pudo comprobar si este pago sigue como lo ves, y anularlo sin saberlo podría pisar una anulación que ya se hizo. Revisa tu internet e intenta de nuevo; no se anuló nada.';
export const MENSAJE_ANULAR_COMISION_NO_ESTA = 'Este pago ya no está en la lista de pagos. No se anuló nada; la lista ya está al día, revísala.';
export const MENSAJE_COMPROBANTE_COMISION_SIN_COMPROBAR = 'No se pudo comprobar que este pago siga vigente, y un papel que sale de la empresa no puede salir de una copia vieja. Revisa tu internet e intenta de nuevo; no se abrió el comprobante.';
export const MENSAJE_COMPROBANTE_COMISION_FALLO = 'No se pudo abrir el comprobante. Recarga la página e intenta de nuevo.';
export const MENSAJE_COMPROBANTE_COMISION_NO_ESTA = 'Este pago ya no está en la lista de pagos. No se abrió el comprobante; la lista ya está al día, revísala.';
export const MENSAJE_ANULAR_COMISION_FALLO = 'No se pudo anular el pago. Revisa tu internet y vuelve a intentarlo: si ya había quedado anulado, no se anula dos veces.';
/** Lo que se dice junto al botón de la lista: qué es el archivo y lo que NO es (el respaldo del año no lleva las comisiones). */
export const TEXTO_DE_LA_COPIA = 'El Excel es tu copia: lleva todas las cuentas, con lo que se debe, lo que todavía no se paga y cada pago. No se baja solo, y el respaldo del año no lleva las comisiones: si no lo bajas de vez en cuando, esta historia solo existe en el sistema. Lleva el nombre de los clientes de cada renta: guárdalo donde solo entres tú.';
/** Lo mismo, junto al botón de la ficha de un empleado. */
export const TEXTO_DE_LA_COPIA_DE_UNA = 'El Excel lleva esta cuenta entera: lo que se le debe, lo que todavía no se paga y cada pago, también los anulados. Lleva el nombre de los clientes de cada renta: guárdalo donde solo entres tú.';

export const MENSAJE_ENLACE_COMISION_FALLO = 'No se pudieron enlazar las rentas. Revisa tu internet e intenta de nuevo: repetirlo no daña nada.';

const FRASES_CONOCIDAS = new Set([
  MENSAJE_COMISION_SIN_DINERO, MENSAJE_COMISION_SIN_RENTAS, MENSAJE_COMISION_SIN_MONTO, MENSAJE_COMISION_SIN_ID,
  MENSAJE_COMISION_SIN_COMPROBAR, MENSAJE_COMISION_SIN_COMPROBAR_RENTAS, MENSAJE_ANULAR_COMISION_SIN_COMPROBAR,
  MENSAJE_COMPROBANTE_COMISION_SIN_COMPROBAR,
  'La nube no respondió a tiempo.',
  MENSAJE_ENLACE_SIN_DINERO,
  'Falta escoger a qué empleado de la lista se enlazan las rentas.',
  'No hay rentas que enlazar.',
]);

/**
 * La frase de un error, si es una de las nuestras (ya en español y pensada para él); si no, la de respaldo. Un error de
 * Firebase llega en inglés («Missing or insufficient permissions.») y con un código: nunca se le enseña.
 */
export function mensajeSeguroDeComision(error, respaldo) {
  const mensaje = String(error?.message ?? '');
  return FRASES_CONOCIDAS.has(mensaje) ? mensaje : respaldo;
}

// ---------------------------------------------------------------------------
// Qué se le debe a cada empleado: la vista, ya armada
// ---------------------------------------------------------------------------

const porNombre = (a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');

/** Todas las rentas de una cuenta, en cualquiera de sus listas. */
const rentasDeCuenta = (cuenta) => [
  ...cuenta.porPagar, ...cuenta.noFirmes, ...cuenta.pagados, ...cuenta.sinComision, ...cuenta.sinPorcentaje,
];

/**
 * Lo que se dibuja, o por qué NO se puede dibujar. Función pura: recibe lo que devolvieron las tres lecturas y no toca la
 * nube ni el DOM. Cada lectura es `{ datos, fallo }`.
 *
 * Si las rentas o los pagos no se pudieron leer (o no llegaron como lista), devuelve `{ ok: false }` y NO se dibuja ninguna
 * cuenta: nucleo/comisiones.js lanza ante una lista que no es lista justo para que nadie la reemplace por `[]`, y aquí
 * tampoco se hace. Una lectura fallida de los empleados NO impide dibujar: lo que se debe sale de las rentas y los pagos, y
 * los empleados solo dan el nombre y el porcentaje de hoy. Se marca `falloEmpleados` para decirlo.
 *
 * `entradas` trae una por cuenta, de la que más se debe a la que menos, y después los empleados de la lista que no tienen
 * ninguna renta todavía: un empleado sin nada no desaparece, solo se apaga. El nombre de un empleado enlazado es el de SU
 * REGISTRO, que es el que se puede corregir; el texto escrito en el contrato es solo el respaldo.
 */
export function armarVistaDeComisiones(lectura) {
  // El valor por omisión solo cubre `undefined`: un `null` se colaba y reventaba al desestructurar, y una
  // excepción aquí no es «no se pudo leer», es una pantalla en blanco. Lo mismo que no se puede dibujar un
  // «no le debes nada a nadie» sobre una lectura caída, tampoco se puede dejar la pantalla muda: la lectura
  // que no llegó se dice con palabras, y para eso tiene que llegar hasta `problemas`.
  const { contratos, pagos, empleados } = lectura ?? {};
  const problemas = [];
  if (!contratos || contratos.fallo || !Array.isArray(contratos.datos)) problemas.push('rentas');
  if (!pagos || pagos.fallo || !Array.isArray(pagos.datos)) problemas.push('pagos');
  if (problemas.length) return { ok: false, problemas };

  let grupos;
  try {
    grupos = agruparPorEmpleado(contratos.datos, pagos.datos);
  } catch (error) {
    return { ok: false, problemas: ['datos'], error };
  }

  const registros = Array.isArray(empleados?.datos) ? ordenarEmpleados(empleados.datos.filter((e) => e?.id)) : [];
  const registroDe = new Map(registros.map((e) => [e.id, e]));
  const falloEmpleados = Boolean(empleados?.fallo) || !Array.isArray(empleados?.datos);
  const enlazados = new Set();

  const entradas = grupos.map((g) => {
    if (g.empleadoId) enlazados.add(g.empleadoId);
    const registro = g.empleadoId ? (registroDe.get(g.empleadoId) ?? null) : null;
    return {
      clave: g.clave,
      empleadoId: g.empleadoId,
      nombre: String(registro?.nombre ?? '').trim() || g.nombre,
      registro,
      sinEnlazar: g.sinEnlazar,
      // Enlazado a un empleado que no está en la lista. Solo se afirma si la lista se LEYÓ: con la lectura fallida no se sabe, y
      // decir «no está en la lista» de alguien que sí está sería inventar un problema (la barra roja ya dice lo que pasó).
      sinRegistro: Boolean(g.empleadoId && !registro && !falloEmpleados),
      cuenta: g.cuenta,
      contratos: rentasDeCuenta(g.cuenta),
    };
  });

  const sinRentas = registros.filter((e) => !enlazados.has(e.id));
  if (sinRentas.length) {
    const vacia = cuentaDeEmpleado({ contratos: [], pagos: pagos.datos });
    for (const e of sinRentas) {
      entradas.push({
        clave: `id:${e.id}`,
        empleadoId: e.id,
        nombre: String(e.nombre ?? '').trim() || 'Empleado sin nombre',
        registro: e,
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
    falloEmpleados,
    // Lo que se le debe a TODOS junto: la pregunta con la que se abre esta pantalla. La suma la hace el núcleo.
    total: totalGeneralDeComisiones(entradas.map((e) => e.cuenta)),
  };
}

/**
 * Lo que está marcado y de verdad se puede pagar: los ids, cuántos son y cuánto suman. El total sale de
 * `elegirParaPagoDeComision` —la MISMA cuenta con la que `construirPagoComision` arma el monto—, así que lo que se ve abajo
 * antes de registrar es exactamente lo que se guarda. Una renta que no es firme no entra aunque su casilla siga marcada.
 */
export function resumenDeMarcadasDeComision(entrada, marcados) {
  const elegido = elegirParaPagoDeComision(entrada.cuenta, [...(marcados ?? [])]);
  return { ids: elegido.contratos, cuantas: elegido.contratos.length, total: elegido.monto };
}

/**
 * Los pagos que cubren rentas de esta cuenta, el más reciente primero. Se reconocen por las rentas que cubren, no por
 * `empleadoId`: un pago hecho a un grupo de rentas viejas guarda `empleadoId: null`, y si después ese grupo se enlaza a un
 * empleado de la lista, el pago sigue siendo suyo.
 */
export function pagosDeLaCuentaDeComision(entrada, pagos) {
  const ids = new Set(entrada.contratos.map((c) => c.id));
  return (Array.isArray(pagos) ? pagos : [])
    .filter((p) => Array.isArray(p?.contratos) && p.contratos.some((id) => ids.has(id)))
    .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')) || String(b.id ?? '').localeCompare(String(a.id ?? '')));
}

/** Los porcentajes distintos que traen las rentas de una cuenta, para decir «con el 5 % de ese día» o «5 % y 7 %». */
export function porcentajesDeLasRentas(contratos) {
  const unicos = [...new Set(contratos.map((c) => porcentajeAnotado(c?.porcentajeComision)).filter((p) => p !== null))].sort((a, b) => a - b);
  return unicos;
}

const palabraRentas = (n) => (n === 1 ? 'renta' : 'rentas');

/** Cómo se dice un porcentaje: «5 %», «7.5 %». Uno que no se lee, «—». */
export const textoDeLaTasa = (valor) => {
  const p = porcentajeAnotado(valor);
  return p === null ? '—' : `${p} %`;
};

// ---------------------------------------------------------------------------
// Registrar el pago
// ---------------------------------------------------------------------------

/**
 * Registra el pago de lo marcado. Las dependencias se reciben para poder probar todo el recorrido sin red. `enCurso` es un
 * objeto que el llamador conserva entre intentos del MISMO pago (`{ id }`, se llena aquí): es lo que hace que repetir el
 * intento —con internet lento, o apretando dos veces— caiga en el mismo documento en vez de crear otro.
 *
 * El recorrido, en orden:
 * 1. Vuelve a LEER los pagos antes de escribir. Si el pago de `enCurso` ya está ahí, un intento anterior sí había llegado: no
 *    se escribe nada, se devuelve ese.
 * 2. Vuelve a LEER las rentas, con la misma lectura de la pantalla. La cuenta que la pantalla tiene en memoria es la de cuando
 *    se abrió, y pudo cambiar mientras él armaba el pago: se corrigió el cierre de una renta marcada, o ya se pagó desde otra
 *    pestaña. Si no se pueden leer, no se registra.
 * 3. Si lo marcado ya no está por pagar, o suma otra cosa que lo que él vio, NO se registra una versión recortada o distinta en
 *    silencio —él vio un monto y se guardaría otro—: se devuelve `cambio`.
 * 4. Arma el pago con `construirPagoComision` sobre lo leído AHORA (con su detalle renta por renta, que es el que saldrá en el
 *    papel), pide el id y el NÚMERO DE COMPROBANTE una vez cada uno (`enCurso`) y guarda.
 *
 * El número se toma DESPUÉS de comprobar que nada cambió, para no gastar uno en un pago que no se hace; y se conserva en
 * `enCurso` aunque el guardado falle, como el id: el reintento cae en el mismo documento con el mismo número. Si el primer intento
 * en verdad nunca llegó y el dueño cancela, ese número queda sin usar: un hueco en la numeración se explica, un repetido no.
 *
 * Devuelve `{ tipo, pagos, contratos?, pago? }` con `tipo` en 'guardado', 'ya-guardado' o 'cambio'. Lanza lo que lance cada paso.
 */
export async function registrarElPagoDeComision({
  entrada, idsMarcados, forma, fecha: fechaDelPago, empleados = { datos: [], fallo: false }, enCurso = {},
  leerPagos = cargarPagosComision, leerContratos = cargarContratosDeLaNube,
  nuevoId = nuevoIdPagoComision, nuevoNumero = siguienteNumeroComprobanteComision, guardar = guardarPagoComision,
}) {
  if (!idsMarcados.length) throw new Error(MENSAJE_COMISION_SIN_RENTAS);

  const frescos = await leerPagos();
  if (frescos.fallo || !Array.isArray(frescos.datos)) throw new Error(MENSAJE_COMISION_SIN_COMPROBAR);

  const yaGuardado = enCurso?.id ? frescos.datos.find((p) => p?.id === enCurso.id) : null;
  if (yaGuardado) return { tipo: 'ya-guardado', pago: yaGuardado, pagos: frescos.datos };

  // Lo que él vio: lo marcado sobre la cuenta que tenía en pantalla, con la misma cuenta con la que se arma el pago.
  const visto = elegirParaPagoDeComision(entrada.cuenta, idsMarcados);

  // La lectura que falle (o lance) NO se vuelve «ninguna renta»: se dice que no se pudo comprobar.
  const rentas = await Promise.resolve().then(() => leerContratos()).catch(() => null);
  // La cuenta se arma con la MISMA regla que la pantalla (`armarVistaDeComisiones`), no con otra copia de ella.
  const vista = armarVistaDeComisiones({ contratos: rentas, pagos: frescos, empleados });
  if (!vista.ok) throw new Error(MENSAJE_COMISION_SIN_COMPROBAR_RENTAS);
  const cuentaDeAhora = vista.entradas.find((e) => e.clave === entrada.clave);
  if (!cuentaDeAhora) return { tipo: 'cambio', pagos: frescos.datos, contratos: rentas };

  const pago = construirPagoComision({
    empleadoId: entrada.empleadoId,
    fecha: fechaDelPago,
    forma,
    contratos: cuentaDeAhora.contratos,
    pagos: frescos.datos,
    idsMarcados,
  });
  // Cada casilla marcada tiene que haber sido una renta por pagar de la cuenta que él vio, y el pago de ahora tiene que
  // cubrir lo mismo, sumar lo mismo y decir lo mismo renta por renta: lo que se guarda (y saldrá en el papel del empleado) es
  // exactamente lo que había en su pantalla.
  const igual = visto.rentas.length === idsMarcados.length
    && pago.contratos.length === visto.contratos.length
    && visto.contratos.every((id) => pago.contratos.includes(id))
    && pago.monto === visto.monto
    && detallesIguales(pago.detalle, visto.detalle);
  if (!igual) return { tipo: 'cambio', pagos: frescos.datos, contratos: rentas };

  // Una vez por intención de pagar, y se conserva aunque este intento falle. El id primero: si el número falla, el id ya
  // quedó decidido y el reintento sigue en el mismo documento.
  enCurso.id ??= await nuevoId();
  enCurso.numero ??= await nuevoNumero();
  const guardado = await guardar({ ...pago, id: enCurso.id, numero: enCurso.numero });
  return { tipo: 'guardado', pago: guardado, pagos: [...frescos.datos, guardado], contratos: rentas };
}

// ---------------------------------------------------------------------------
// Anular un pago de comisión
// ---------------------------------------------------------------------------
//
// Si registra las rentas equivocadas o la forma equivocada, esas rentas salen de «por pagar» y la deuda se lee como cero. La
// salida es la misma que ya tiene un pago del cliente y uno a un dueño: se ANULA, dejando rastro. El pago se queda con su
// monto y sus rentas y sigue en «Ya pagado», marcado; y las rentas que cubría vuelven a «por pagar», porque
// `cuentaDeEmpleado` ya no lo cuenta como pagado.

/**
 * El mensaje del confirm() antes de anular un pago: a QUIÉN, cuánto, de cuándo y cuántas rentas. Anular el pago equivocado
 * por un diálogo vago es justo lo que este mensaje existe para evitar. Función pura.
 */
export function textoConfirmarAnularPagoDeComision(pago, entrada) {
  const rentas = new Set((Array.isArray(pago?.contratos) ? pago.contratos : []).filter(Boolean)).size;
  // Un pago con comprobante lo nombra por su número: el empleado tiene ese papel en la mano, y anular el pago equivocado por un
  // diálogo vago es justo lo que este mensaje existe para evitar. Uno de antes de los comprobantes no tiene número que decir.
  const delPapel = Number.isInteger(pago?.numero) ? `comprobante N.° ${pago.numero}, ` : '';
  const delRastro = Number.isInteger(pago?.numero)
    ? 'El pago queda marcado como anulado, con su número, y no desaparece de «Ya pagado»: el papel que el empleado tiene deja de valer, y ese número no se reutiliza.'
    : 'El pago queda marcado como anulado y no desaparece de «Ya pagado».';
  return `¿Anular el pago de ${dinero(pago?.monto)} a ${entrada?.nombre ?? 'este empleado'} (${delPapel}del ${fecha(pago?.fecha)}, ${etiquetaDeForma(pago?.forma).toLowerCase()})? `
    + `Cubre ${rentas} ${palabraRentas(rentas)}. ${rentas === 1 ? 'Esa renta vuelve' : 'Esas rentas vuelven'} a «Por pagar». `
    + delRastro;
}

/**
 * Anula un pago de comisión. Las dependencias se reciben para probar todo el recorrido sin red. Vuelve a LEER los pagos antes
 * de escribir: la copia de la pantalla es la de cuando se abrió. Si otra pestaña ya lo anuló, no se escribe nada —se devuelve
 * ese, con la fecha de la primera anulación, que un segundo clic no debe pisar—, y lo que se escribe es el pago TAL COMO ESTÁ
 * AHORA en la nube. Si no se pueden leer, no se anula. `hoy` se recibe y es la fecha de la anulación (`anuladoEn`).
 *
 * Devuelve `{ tipo, pagos, pago? }` con `tipo` en 'anulado', 'ya-anulado' o 'no-esta'.
 */
export async function anularElPagoDeComision({
  pago, hoy, leerPagos = cargarPagosComision, guardar = guardarPagoComision,
}) {
  if (!esFechaISO(hoy)) throw new Error('Falta la fecha de hoy: la anulación queda fechada y no se adivina.');
  const frescos = await leerPagos();
  if (frescos.fallo || !Array.isArray(frescos.datos)) throw new Error(MENSAJE_ANULAR_COMISION_SIN_COMPROBAR);
  const actual = frescos.datos.find((p) => p?.id && p.id === pago?.id);
  if (!actual) return { tipo: 'no-esta', pagos: frescos.datos };
  if (pagoAnulado(actual)) return { tipo: 'ya-anulado', pago: actual, pagos: frescos.datos };
  // `reescritura`: el pago se vuelve a escribir tal como está en la nube, con o sin número y detalle. Anular un pago de antes de los
  // comprobantes no le pone un número ni un detalle: lo haría parecer un pago nuevo con un papel que nadie vio.
  const anulado = await guardar(anularPagoComision(actual, { fecha: hoy }), { reescritura: true });
  return { tipo: 'anulado', pago: anulado, pagos: frescos.datos.map((p) => (p.id === anulado.id ? anulado : p)) };
}

// ---------------------------------------------------------------------------
// El comprobante del empleado (23 de octubre de 2026)
// ---------------------------------------------------------------------------
//
// El papel lo arma comprobanteComision.js solo con lo que el pago guardó. Aquí se decide una cosa: de qué copia del pago sale. Un papel
// que sale de la empresa no puede salir de la copia que la pantalla tiene en memoria —la de cuando se abrió—: si otra pestaña anuló
// ese pago mientras tanto, se imprimiría «comisiones pagadas» sobre algo que ya no está pagado. Por eso, como al anular, se vuelve a
// LEER la lista de pagos antes de abrir el papel, y el papel sale del pago tal como está AHORA en la nube.

/**
 * Lee los pagos de nuevo y devuelve el que se quiere imprimir: `{ tipo: 'listo', pago, pagos }`, o `{ tipo: 'no-esta', pagos }` si ya no
 * existe. Si los pagos no se pueden leer LANZA: sin saberlo no se abre ningún papel. Las dependencias se reciben para probarlo sin red.
 */
export async function leerElPagoParaElComprobante({ pagoId, leerPagos = cargarPagosComision } = {}) {
  const frescos = await leerPagos();
  if (frescos.fallo || !Array.isArray(frescos.datos)) throw new Error(MENSAJE_COMPROBANTE_COMISION_SIN_COMPROBAR);
  const pago = frescos.datos.find((p) => p?.id && p.id === pagoId);
  return pago ? { tipo: 'listo', pago, pagos: frescos.datos } : { tipo: 'no-esta', pagos: frescos.datos };
}

/**
 * Lo que `pintarComprobanteDeComision` pide: el pago (el recién leído), el empleado tal como lo tiene su cuenta hoy y, si las rentas de
 * ese pago hoy suman otra cosa que lo que se pagó, el aviso para quien manda el papel. `entradaDeAhora` es la misma cuenta armada con los
 * pagos recién leídos (o `null` si ya no se puede armar: sin cuenta no hay aviso, pero el papel sale igual, porque no depende de ella).
 */
export function entradaDelPapelDeComision({ pago, entrada, entradaDeAhora = null }) {
  const cambio = entradaDeAhora?.cuenta.pagosQueCambiaron.find((x) => x.pago.id === pago?.id);
  return {
    pago,
    empleado: { nombre: entrada?.nombre, codigo: entrada?.registro?.codigo },
    avisos: cambio ? [avisoDelPapelQueNoCambia(cambio)] : [],
  };
}

/**
 * La frase que le dice a quien manda el papel que las rentas de este pago hoy suman otra cosa que lo que se pagó (se corrigió un
 * cierre después de pagar). Sale solo en pantalla, antes de imprimir: el papel NO cambia (es el que el empleado ya tiene), y lo que
 * hacer con la diferencia lo decide él. Lleva las palabras de siempre de la ficha (`textoDePagoQueCambio`).
 */
export function avisoDelPapelQueNoCambia(cambio) {
  return `${textoDePagoQueCambio(cambio)} El papel sigue diciendo lo que se pagó ese día, igual que el que el empleado ya tiene; la diferencia la decides tú.`;
}

// ---------------------------------------------------------------------------
// Bajar la cuenta en Excel (23 de octubre de 2026)
// ---------------------------------------------------------------------------
//
// El respaldo anual NO lleva las comisiones ni sus pagos (§10): viven solo en Firebase, y si él perdiera el acceso esa historia no
// existiría en nada que sea suyo. Este archivo es la copia que él guarda: la cuenta de un empleado (o la de todos) con lo que se le
// debe, lo que todavía no se paga y cada pago. NO es el comprobante del empleado: ese es el papel de `comprobanteComision.js` (23 de octubre de
// 2026), con su número y su detalle guardados en el pago; aquí, en su copia, solo se anota el número de cada papel.
//
// Ninguna regla se repite aquí. Cada cifra sale de lo que ya calculó el núcleo —`comisionDe` para cada renta, `cuenta.totalPorPagar`,
// `totalEstimado`, `totalPorCerrar` y `pagosQueCambiaron` de `cuentaDeEmpleado`, `totalesDePagos` y `totalGeneralDeComisiones` para
// las sumas, `quincenaDe` para el mes y la quincena— o de lo que el pago guardó. Y el archivo lleva tres reglas que se explican solas:
//   - LO QUE ES DEUDA NO SE MEZCLA CON LO QUE NO LO ES. «Por pagar», «Estimada» y «Ya regresó, falta que cierre» son tres columnas
//     distintas: sumar una columna entera tiene que dar una cifra que significa algo (el mismo motivo por el que el núcleo suma por
//     separado `totalEstimado` y `totalPorCerrar`).
//   - LO PAGADO ES LO QUE SE GUARDÓ. El monto de un pago es el `monto` del pago, no lo que sus rentas suman hoy; si hoy suman otra
//     cosa (se corrigió un cierre después de pagar), la hoja «Pagos» lo dice aparte con las palabras de la pantalla.
//   - ES SOBRE ESA PERSONA. Lleva la renta (número, fechas, placas, cliente por su nombre, días, base, porcentaje, comisión) y sus
//     pagos. No lleva lo que el cliente pagó, ni su saldo ni su garantía (la pantalla dice por qué una renta no cierra; el archivo solo
//     dice que no ha cerrado), ni el costo de un carro ajeno, ni la utilidad, ni nada de otro empleado.

export const MENSAJE_BAJAR_SIN_SESION = 'No se bajó nada: la sesión del área de dinero se cerró. Escribe la contraseña otra vez y vuelve a apretar el botón.';
export const MENSAJE_BAJAR_CUENTA_YA_NO_ESTA = 'No se bajó nada: esta cuenta ya no está en la lista (quizá se enlazó a un empleado). Vuelve a la lista de comisiones.';
export const MENSAJE_BAJAR_SIN_CUENTAS = 'No se bajó nada: todavía no hay rentas ni empleados en la lista.';
export const MENSAJE_BAJAR_FALLO = 'No se bajó nada: no se pudo armar el archivo. Revisa tu internet y vuelve a apretar el botón; si sigue igual, recarga la página.';

/** Un error cuya frase ya está pensada para él: se le dice tal cual. Cualquier otro se cambia por `MENSAJE_BAJAR_FALLO`. */
export class ErrorDeBajada extends Error {}

/** Lo que dice la columna «Estado» de la hoja «Rentas» para cada situación de una renta. */
export const ESTADOS_EN_EXCEL = {
  'por-pagar': 'Por pagar',
  estimada: 'Todavía no se paga: el carro sigue afuera (estimada)',
  'sin-cerrar': 'Todavía no se paga: el carro regresó, falta que cierre el contrato',
  pagada: 'Ya pagada',
  'sin-comision': 'Cerrada y sin comisión (Q0.00)',
  'sin-porcentaje': 'No se puede pagar: el contrato no trae un porcentaje legible',
};

const COLUMNAS_DE_RENTAS = [
  { titulo: 'Empleado', tipo: 'texto', ancho: 24 },
  { titulo: 'Contrato', tipo: 'entero', ancho: 10 },
  { titulo: 'Salió', tipo: 'fecha', ancho: 12 },
  { titulo: 'Regresó', tipo: 'fecha', ancho: 12 },
  { titulo: 'Mes', tipo: 'texto', ancho: 10 },
  { titulo: 'Quincena', tipo: 'entero', ancho: 10 },
  { titulo: 'Placas', tipo: 'texto', ancho: 12 },
  { titulo: 'Cliente', tipo: 'texto', ancho: 28 },
  { titulo: 'Días', tipo: 'entero', ancho: 8 },
  { titulo: 'Días de atraso', tipo: 'entero', ancho: 10 },
  { titulo: 'Base', tipo: 'dinero', ancho: 13 },
  { titulo: '% de comisión', tipo: 'numero', ancho: 11 },
  { titulo: 'Por pagar', tipo: 'dinero', ancho: 13 },
  { titulo: 'Estimada (el carro sigue afuera)', tipo: 'dinero', ancho: 16 },
  { titulo: 'Ya regresó, falta que cierre', tipo: 'dinero', ancho: 16 },
  { titulo: 'Ya pagada (lo que suma hoy)', tipo: 'dinero', ancho: 16 },
  { titulo: 'Estado', tipo: 'texto', ancho: 58 },
  { titulo: 'Pagada el', tipo: 'fecha', ancho: 12 },
];

const COLUMNAS_DE_PAGOS = [
  { titulo: 'Empleado', tipo: 'texto', ancho: 24 },
  { titulo: 'Comprobante N°', tipo: 'entero', ancho: 13 },
  { titulo: 'Fecha del pago', tipo: 'fecha', ancho: 13 },
  { titulo: 'Forma', tipo: 'texto', ancho: 14 },
  { titulo: 'Monto pagado (el que quedó guardado)', tipo: 'dinero', ancho: 18 },
  { titulo: 'Estado', tipo: 'texto', ancho: 11 },
  { titulo: 'Anulado el', tipo: 'fecha', ancho: 12 },
  { titulo: 'Rentas que cubre', tipo: 'entero', ancho: 10 },
  { titulo: 'Contratos', tipo: 'texto', ancho: 36 },
  { titulo: 'Hoy esas rentas suman', tipo: 'dinero', ancho: 16 },
  { titulo: 'Aviso', tipo: 'texto', ancho: 60 },
];

const COLUMNAS_DE_RESUMEN = [
  { titulo: 'Empleado', tipo: 'texto', ancho: 26 },
  { titulo: 'Código', tipo: 'texto', ancho: 9 },
  { titulo: '% de hoy', tipo: 'numero', ancho: 9 },
  { titulo: 'Rentas por pagar', tipo: 'entero', ancho: 11 },
  { titulo: 'Se le debe', tipo: 'dinero', ancho: 14 },
  { titulo: 'Estimado (carros afuera)', tipo: 'dinero', ancho: 15 },
  { titulo: 'Ya regresaron, falta que cierre', tipo: 'dinero', ancho: 16 },
  { titulo: 'Pagado (pagos sin anular)', tipo: 'dinero', ancho: 15 },
  { titulo: 'Pagos', tipo: 'entero', ancho: 8 },
  { titulo: 'Pagos anulados', tipo: 'entero', ancho: 10 },
  { titulo: 'Aclaración', tipo: 'texto', ancho: 44 },
];

/** El número de un contrato como número, o vacío: una celda de número nunca lleva un texto. */
const numeroDeContrato = (c) => {
  const n = Number(c?.numero);
  return c?.numero !== null && c?.numero !== undefined && c?.numero !== '' && Number.isFinite(n) ? n : null;
};

/** Una fecha para una celda de fecha: el número de serie de Excel, vacía si no hay fecha, o el texto tal cual (y un aviso) si no se entiende. */
function celdaDeFecha(iso, donde, avisos) {
  const texto = String(iso ?? '').trim();
  if (!texto) return null;
  const serial = serialDeFecha(texto);
  if (serial !== null) return serial;
  avisos.push(`${donde}: la fecha «${texto}» no se pudo escribir como fecha y quedó como texto.`);
  return texto;
}

/** El pago vigente que cubre una renta, o `null`: una renta que ningún pago cubre no tiene fecha de pago (y una de un pago anulado tampoco). */
function pagoQueCubre(pagosVigentes, id) {
  return pagosVigentes.find((p) => Array.isArray(p?.contratos) && p.contratos.includes(id)) ?? null;
}

function filaDeRentaParaExcel(entrada, contrato, estado, pagoVigente, avisos) {
  const c = comisionDe(contrato);
  const donde = `Renta ${contrato.numero ?? '(sin número)'} de ${entrada.nombre}`;
  const regreso = contrato.cierre?.fechaReal;
  const periodo = quincenaDe(regreso);
  const legible = estado !== 'sin-porcentaje';
  const si = (cual) => (estado === cual ? c.monto : null);
  return [
    entrada.nombre,
    numeroDeContrato(contrato),
    celdaDeFecha(contrato.fechaSalida, donde, avisos),
    celdaDeFecha(regreso, donde, avisos),
    periodo ? periodo.mes : null,
    periodo ? periodo.quincena : null,
    String(contrato.carroPlacas ?? ''),
    String(contrato.clienteNombre ?? ''),
    q(contrato.dias),
    atrasoDe(contrato),
    c.base,
    legible ? c.porcentaje : null,
    si('por-pagar'),
    si('estimada'),
    si('sin-cerrar'),
    si('pagada'),
    ESTADOS_EN_EXCEL[estado],
    celdaDeFecha(pagoVigente?.fecha, donde, avisos),
  ];
}

/** Las rentas de una cuenta con su situación, en el orden de la pantalla: por pagar, no firmes, pagadas, sin comisión, sin porcentaje. */
function rentasConSituacion(cuenta) {
  return [
    ...cuenta.porPagar.map((c) => [c, 'por-pagar']),
    ...cuenta.noFirmes.map((c) => [c, estadoDeComision(c)]),
    ...cuenta.pagados.map((c) => [c, 'pagada']),
    ...cuenta.sinComision.map((c) => [c, 'sin-comision']),
    ...cuenta.sinPorcentaje.map((c) => [c, 'sin-porcentaje']),
  ];
}

function filaDePagoParaExcel(entrada, pago, avisos) {
  const donde = `Pago de ${entrada.nombre} del ${pago.fecha ?? '(sin fecha)'}`;
  const ids = [...new Set((Array.isArray(pago.contratos) ? pago.contratos : []).filter(Boolean))];
  const numeros = [];
  let faltan = 0;
  for (const id of ids) {
    const renta = entrada.contratos.find((c) => c.id === id);
    if (renta) numeros.push(numeroDeContrato(renta) ?? '(sin número)');
    else faltan += 1;
  }
  numeros.sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es')));
  const lista = [...numeros.map(String), ...(faltan ? [`${faltan} ${faltan === 1 ? 'renta que ya no está' : 'rentas que ya no están'} en esta cuenta`] : [])].join(', ');
  const anulado = pagoAnulado(pago);
  // `pagosQueCambiaron` solo trae pagos vigentes; se busca por el mismo objeto o, si la lista se copió, por su id.
  const cambio = entrada.cuenta.pagosQueCambiaron.find((x) => x.pago === pago || (pago.id && x.pago?.id === pago.id));
  return [
    entrada.nombre,
    // El número del papel que se le entregó al empleado (§7b): su copia lo lleva para poder decir cuál papel es cuál. Vacío en un pago de
    // antes de los comprobantes —no tuvo número y no se le inventa uno—, o si lo que hay guardado no es un número de comprobante.
    Number.isInteger(pago.numero) ? pago.numero : null,
    celdaDeFecha(pago.fecha, donde, avisos),
    etiquetaDeForma(pago.forma),
    q(pago.monto),
    anulado ? 'Anulado' : 'Vigente',
    anulado ? celdaDeFecha(pago.anuladoEn, donde, avisos) : null,
    ids.length,
    lista,
    cambio ? cambio.ahora : null,
    cambio ? textoDePagoQueCambio(cambio) : null,
  ];
}

function filaDeResumenParaExcel(entrada, pagosDeLaCuenta) {
  const { cuenta, registro } = entrada;
  const vigentes = pagosDeLaCuenta.filter((p) => !pagoAnulado(p));
  return [
    entrada.nombre,
    String(registro?.codigo ?? ''),
    registro ? porcentajeAnotado(registro.porcentajeComision) : null,
    cuenta.porPagar.length,
    cuenta.totalPorPagar,
    cuenta.totalEstimado,
    cuenta.totalPorCerrar,
    totalesDePagos(vigentes).monto,
    vigentes.length,
    pagosDeLaCuenta.length - vigentes.length,
    etiquetasDeLaCuenta(entrada).map((e) => e.texto).join(', '),
  ];
}

/** Cómo se llama el archivo: «Comisiones de Ana López 2026-10-23.xlsx», o «Comisiones de todos 2026-10-23.xlsx». */
export function nombreDelArchivoDeComisiones(nombre, hoy) {
  const limpio = String(nombre ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return `Comisiones de ${limpio || 'todos'} ${hoy}.xlsx`;
}

/**
 * Lo que lleva el archivo, ya armado y sin tocar el libro: las hojas «Resumen», «Rentas» y «Pagos» con sus filas. Función pura: recibe
 * la vista que ya armó `armarVistaDeComisiones` (`vista.ok` en true) y los pagos leídos, y NO lee el reloj (`hoy` llega de fuera).
 *
 * - `clave`: la cuenta de un empleado, o `null` para todas.
 * - Una renta aparece en la hoja «Rentas» exactamente una vez, y un pago de la cuenta en «Pagos» exactamente una vez, anulado o no.
 *
 * LANZA si no recibe una vista buena, una lista de pagos o la fecha de hoy: «no llegó» no es «no se le debe nada».
 */
export function modeloDeComisionesEnExcel({
  vista, clave = null, pagos, hoy,
} = {}) {
  if (!vista?.ok || !Array.isArray(vista.entradas)) {
    throw new TypeError('comisiones: para armar el archivo hace falta una vista buena (vista.ok). Sin ella no se sabe qué se le debe a nadie, y un archivo sin cifras diría «no le debes nada» cuando quizá sí.');
  }
  if (!Array.isArray(pagos)) {
    throw new TypeError('comisiones: «pagos» debe ser una lista. Sin ella no se sabe qué ya se pagó, y un archivo sin pagos haría ver todo como deuda.');
  }
  if (!esFechaISO(hoy)) throw new Error('Falta la fecha de hoy (hoy): el archivo dice «cuenta al…» y esa fecha no se adivina.');
  const entradas = clave === null ? vista.entradas : vista.entradas.filter((e) => e.clave === clave);
  if (!entradas.length) {
    throw new ErrorDeBajada(clave === null ? MENSAJE_BAJAR_SIN_CUENTAS : MENSAJE_BAJAR_CUENTA_YA_NO_ESTA);
  }

  const avisos = [];
  const filasDeRentas = [];
  const filasDePagos = [];
  const filasDeResumen = [];
  for (const entrada of entradas) {
    const delEmpleado = pagosDeLaCuentaDeComision(entrada, pagos);
    const vigentes = delEmpleado.filter((p) => !pagoAnulado(p));
    for (const [contrato, estado] of rentasConSituacion(entrada.cuenta)) {
      filasDeRentas.push(filaDeRentaParaExcel(entrada, contrato, estado, pagoQueCubre(vigentes, contrato.id), avisos));
    }
    for (const pago of delEmpleado) filasDePagos.push(filaDePagoParaExcel(entrada, pago, avisos));
    filasDeResumen.push(filaDeResumenParaExcel(entrada, delEmpleado));
  }
  // La suma de lo que se le debe a todos la hace el núcleo (la misma de la lista de la pantalla), y solo si hay más de una cuenta.
  const debe = totalGeneralDeComisiones(entradas.map((e) => e.cuenta));
  if (entradas.length > 1) {
    filasDeResumen.push(['Todos', '', null, null, debe, null, null, null, null, null, '']);
  }

  const quien = clave === null ? null : entradas[0].nombre;
  const notas = [
    { texto: `Comisiones de los empleados — ${clave === null ? 'todas las cuentas' : entradas[0].nombre}`, estilo: 'titulo' },
    { texto: `Cuenta al ${fecha(hoy)}. Es una foto del día en que se bajó este archivo: no se actualiza solo.`, estilo: 'nota' },
    { texto: 'Una comisión se paga cuando el contrato de la renta ya cerró: el carro regresó, no se debe saldo y la garantía está liberada.', estilo: 'nota' },
    { texto: 'Hoja «Rentas»: una fila por renta. Solo la columna «Por pagar» es deuda; «Estimada» y «Ya regresó, falta que cierre» todavía no lo son.', estilo: 'nota' },
    { texto: 'Hoja «Pagos»: cada pago registrado, también los anulados (un pago anulado ya no cubre sus rentas). El monto es el que quedó guardado ese día. «Comprobante N°» es el número del papel que se le entregó al empleado; está vacío en los pagos de antes de que existieran los comprobantes.', estilo: 'nota' },
    ...(vista.falloEmpleados
      ? [{ texto: 'No se pudo leer la lista de empleados: los nombres, códigos y porcentajes de hoy pueden estar desactualizados. Lo que se debe sale de las rentas y los pagos, y no cambia.', estilo: 'aviso' }]
      : []),
    ...avisos.map((texto) => ({ texto, estilo: 'aviso' })),
    { texto: 'Cuídalo como tu Excel: lleva lo que se le debe a cada persona y el nombre de los clientes de cada renta.', estilo: 'nota' },
  ];

  return {
    nombre: nombreDelArchivoDeComisiones(quien, hoy),
    titulo: `Comisiones de ${quien ?? 'todos'}`,
    asunto: `Cuenta de comisiones al ${hoy}`,
    hojas: [
      { nombre: 'Resumen', notas, columnas: COLUMNAS_DE_RESUMEN, filas: filasDeResumen },
      {
        nombre: 'Rentas', columnas: COLUMNAS_DE_RENTAS, filas: filasDeRentas, congelar: true, filtro: true,
      },
      {
        nombre: 'Pagos', columnas: COLUMNAS_DE_PAGOS, filas: filasDePagos, congelar: true, filtro: true,
      },
    ],
    cuenta: {
      empleados: entradas.length, rentas: filasDeRentas.length, pagos: filasDePagos.length, debe,
    },
    avisos,
  };
}

/** Arma el .xlsx: `{ bytes, nombre, cuenta, avisos }`. */
export async function armarElExcelDeComisiones({
  vista, clave = null, pagos, hoy,
} = {}) {
  const modelo = modeloDeComisionesEnExcel({
    vista, clave, pagos, hoy,
  });
  const bytes = await escribirLibro({
    hojas: modelo.hojas, titulo: modelo.titulo, asunto: modelo.asunto, hoy,
  });
  return {
    bytes, nombre: modelo.nombre, cuenta: modelo.cuenta, avisos: modelo.avisos,
  };
}

/**
 * Lee, arma y entrega. En ese orden, y el orden importa:
 *   - LEE DE NUEVO, de la nube y con la credencial de dinero, igual que registrar un pago: la cuenta que la pantalla tiene en memoria
 *     es la de cuando se abrió. Un archivo que se guarda como historia no puede salir de una copia vieja.
 *   - Si CUALQUIER lectura falla, NO se entrega nada y se dice cuál (las mismas frases de la pantalla): un archivo armado con una
 *     lectura caída diría «no se le debe nada», y nadie audita lo que abre bien.
 *   - La sesión de dinero se mira antes de leer, y otra vez antes de entregar: si se cerró en medio, lo leído se tira y no sale ningún
 *     archivo (lo que se leyó es dinero y se suelta con la sesión). Nada de esto se guarda en la memoria del módulo.
 *
 * Devuelve `{ nombre, cuenta, avisos }`. Las dependencias se reciben para probar el recorrido sin red ni navegador.
 */
export async function bajarLasCuentasEnExcel({
  clave = null, hoy, leer = leerTodo, armar = armarElExcelDeComisiones, entregar = descargarArchivo, hayCredencial = () => Boolean(sesionDeDinero()),
} = {}) {
  if (!esFechaISO(hoy)) throw new Error('Falta la fecha de hoy (hoy): el archivo dice «cuenta al…» y esa fecha no se adivina.');
  if (!hayCredencial()) throw new ErrorDeBajada(MENSAJE_BAJAR_SIN_SESION);
  const lectura = await leer();
  if (!hayCredencial()) throw new ErrorDeBajada(MENSAJE_BAJAR_SIN_SESION);
  const vista = armarVistaDeComisiones(lectura);
  if (!vista.ok) throw new ErrorDeBajada(`No se bajó nada. ${frasesDelFallo(vista).join(' ')}`);
  const libro = await armar({
    vista, clave, pagos: lectura.pagos.datos, hoy,
  });
  if (!hayCredencial()) throw new ErrorDeBajada(MENSAJE_BAJAR_SIN_SESION);
  entregar(libro.bytes, libro.nombre);
  return { nombre: libro.nombre, cuenta: libro.cuenta, avisos: libro.avisos };
}

/** Lo que se le dice cuando el archivo ya salió: cuántas cuentas, rentas y pagos lleva y cuánto se debe, para que lo compare con la pantalla. */
export function textoDeLoBajado({ nombre, cuenta, avisos }) {
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const aviso1 = avisos.length ? ` Revisa el archivo: ${avisos.length === 1 ? 'una fecha' : `${avisos.length} fechas`} no se pudieron escribir como fecha (los avisos están en la hoja «Resumen»).` : '';
  return `Se bajó «${nombre}» a tu carpeta de descargas: ${plural(cuenta.empleados, 'cuenta', 'cuentas')}, ${plural(cuenta.rentas, 'renta', 'rentas')} y ${plural(cuenta.pagos, 'pago', 'pagos')}. Se debe ${dinero(cuenta.debe)}.${aviso1}`;
}

// ---------------------------------------------------------------------------
// HTML (funciones puras: reciben datos y devuelven texto, sin tocar el DOM)
// ---------------------------------------------------------------------------

// Nada de esta pantalla lleva estilos en línea: cada ajuste es una clase `dn-*` de css/estilos.css (como en dinero.js).

const barraRoja = (frases) => (frases.length
  ? `<div class="barra-lectura-fallida" role="alert">${frases.map((f) => `<p>${esc(f)}</p>`).join('')}</div>`
  : '');

/** Lo que se le dice cuando una vista no se pudo armar (`vista.ok` en false): una frase por lectura que falló. La pantalla y el archivo de Excel dicen lo mismo. */
export function frasesDelFallo(vista) {
  const frases = [];
  if (vista.problemas.includes('rentas')) frases.push(MENSAJE_FALLO_RENTAS);
  if (vista.problemas.includes('pagos')) frases.push(MENSAJE_FALLO_PAGOS_DE_COMISION);
  if (vista.problemas.includes('datos')) frases.push(MENSAJE_FALLO_DATOS_DE_COMISION);
  return frases;
}

/** Lo que se dibuja cuando NO se puede mostrar ninguna cuenta: una barra roja y cómo volver a intentarlo. Ninguna cifra. */
export function htmlFalloDeComisiones(vista) {
  const frases = frasesDelFallo(vista);
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado"><h1>Comisiones</h1></div>
      ${barraRoja(frases)}
      <p><button type="button" class="btn btn-primario dn-boton-suelto" data-cm="reintentar">Volver a leer</button></p>
    </div>`;
}

/** Los días de la renta, con los de atraso señalados. */
function htmlDeDias(contrato) {
  const dias = Number(contrato?.dias);
  const base = Number.isFinite(dias) ? `${dias} ${dias === 1 ? 'día' : 'días'}` : '—';
  const atraso = atrasoDe(contrato);
  return atraso > 0 ? `${esc(base)} <span class="dn-alerta">+ ${atraso} de atraso</span>` : esc(base);
}

/**
 * Lo que se dice junto al nombre de un empleado: `[{ texto, ayuda? }]`. Lo dibujan la lista y la ficha, y lo escribe el archivo de
 * Excel en su hoja «Resumen»: las mismas palabras, decididas en un solo lugar.
 */
export function etiquetasDeLaCuenta(entrada) {
  const baja = entrada.registro && !estaActivo(entrada.registro);
  return [
    entrada.sinEnlazar ? { texto: 'Sin enlazar', ayuda: 'El nombre se escribió a mano en el contrato' } : null,
    entrada.sinRegistro ? { texto: 'No está en la lista de empleados' } : null,
    baja ? { texto: 'De baja' } : null,
    entrada.registro && porcentajeAnotado(entrada.registro.porcentajeComision) === 0 ? { texto: 'No gana comisión' } : null,
  ].filter(Boolean);
}

/** Las etiquetas junto al nombre de un empleado en la lista y en la ficha. */
function htmlEtiquetas(entrada) {
  return etiquetasDeLaCuenta(entrada)
    .map((e) => `<span class="etiqueta-estado"${e.ayuda ? ` title="${esc(e.ayuda)}"` : ''}>${esc(e.texto)}</span>`)
    .join(' ');
}

function filaDeLista(entrada) {
  const { cuenta } = entrada;
  const apagada = cuenta.porPagar.length === 0;
  const sinPorcentaje = cuenta.sinPorcentaje.length
    ? `<div class="dn-alerta dn-nota">${cuenta.sinPorcentaje.length} ${palabraRentas(cuenta.sinPorcentaje.length)} sin porcentaje anotado: no se pueden pagar.</div>`
    : '';
  const codigo = entrada.registro?.codigo ? `<span class="dn-gris">${esc(entrada.registro.codigo)} ·</span> ` : '';
  return `
    <tr class="${apagada ? 'es-fuera' : ''}" data-cm-clave="${esc(entrada.clave)}">
      <td>${codigo}<a href="${esc(rutaDeComisiones(entrada.clave))}">${esc(entrada.nombre)}</a> ${htmlEtiquetas(entrada)}${sinPorcentaje}</td>
      <td>${esc(entrada.registro ? textoDeLaTasa(entrada.registro.porcentajeComision) : '—')}</td>
      <td>${cuenta.porPagar.length}</td>
      <td class="dn-derecha"><strong>${esc(dinero(cuenta.totalPorPagar))}</strong></td>
    </tr>`;
}

/**
 * La pantalla principal: una fila por empleado, de lo que más se le debe a lo que menos, con el total de todos al pie. Con
 * `vista.ok` en false NO dibuja filas: dibuja el fallo.
 */
export function htmlListaDeComisiones(vista, { mensajeBajar = '' } = {}) {
  if (!vista.ok) return htmlFalloDeComisiones(vista);
  const filas = vista.entradas.length
    ? vista.entradas.map(filaDeLista).join('')
    : '<tr><td colspan="4" class="pendiente dn-vacio dn-vacio-ancho dn-sin-clic">Todavía no hay rentas ni empleados en la lista.</td></tr>';
  const rentas = vista.entradas.reduce((t, e) => t + e.cuenta.porPagar.length, 0);
  const pie = vista.entradas.length ? `
        <tfoot>
          <tr class="dn-fila-total">
            <td>Lo que debes en comisiones</td>
            <td></td>
            <td>${rentas}</td>
            <td class="dn-derecha"><strong id="cm-total-general">${esc(dinero(vista.total))}</strong></td>
          </tr>
        </tfoot>` : '';
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <a href="#/dinero" class="btn">← Dinero</a>
        <h1>Comisiones</h1>
        <button type="button" class="btn" data-cm="actualizar">Actualizar</button>
        <a href="#/dinero/empleados" class="btn">Empleados</a>
        ${vista.entradas.length ? '<button type="button" class="btn" data-cm="bajar" data-alcance="todas">Bajar todas las cuentas en Excel</button>' : ''}
      </div>
      ${vista.falloEmpleados ? barraRoja([MENSAJE_FALLO_EMPLEADOS]) : ''}
      ${mensajeBajar ? barraRoja([mensajeBajar]) : ''}
      <p class="dn-explica">Solo se paga la comisión de una renta cuyo contrato ya cerró: el carro regresó, no se debe saldo y la garantía está liberada. Es la misma regla con la que se le paga al dueño de un carro ajeno.</p>
      <p class="dn-explica-chica">${esc(TEXTO_DE_LA_COPIA)}</p>
      <table class="tabla-carros">
        <thead>
          <tr><th>Empleado</th><th>Porcentaje</th><th>Rentas por pagar</th><th class="dn-derecha">Se le debe</th></tr>
        </thead>
        <tbody>${filas}</tbody>${pie}
      </table>
    </div>`;
}

const NOMBRES_DE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «octubre 2026» a partir de «2026-10». Solo da nombre a lo que el núcleo ya agrupó. */
export function nombreDelMes(mes) {
  const [anio, numero] = String(mes ?? '').split('-').map(Number);
  return NOMBRES_DE_MES[numero - 1] ? `${NOMBRES_DE_MES[numero - 1]} ${anio}` : String(mes ?? '');
}

/**
 * Cómo se llama un período en su botón: «Todo octubre 2026», «1.ª quincena (1–15)» o «2.ª quincena (16–31)». `quincena` es
 * 0 para el mes completo, 1 o 2. El último día de la segunda quincena es el último del mes (28, 29, 30 o 31).
 */
export function etiquetaDelPeriodo(mes, quincena) {
  if (!quincena) return `Todo ${nombreDelMes(mes)}`;
  if (quincena === 1) return '1.ª quincena (1–15)';
  const [anio, numero] = String(mes).split('-').map(Number);
  return `2.ª quincena (16–${new Date(Date.UTC(anio, numero, 0)).getUTCDate()})`;
}

/** Los ids de un período (`quincena` 0 es el mes completo), o `[]` si ya no existe. Se pregunta al núcleo cada vez: nunca una lista vieja. */
export function idsDelPeriodo(cuenta, mes, quincena) {
  const delMes = periodosDePago(cuenta).find((p) => p.mes === mes);
  if (!delMes) return [];
  if (!quincena) return delMes.contratos;
  return delMes.quincenas.find((x) => x.quincena === quincena)?.contratos ?? [];
}

/**
 * «Marcar un período»: por cada mes con algo por pagar, una fila con el botón del mes completo y el de cada quincena que
 * tenga algo, cada uno con cuántas rentas y cuánto suman. Un clic marca ese período (reemplaza lo marcado), y lo de ese
 * período que ya no se puede pagar ni aparece. Los períodos los arma el núcleo (`periodosDePago`); aquí solo se dibujan.
 * No dice nada de plazos ni de lo que lleva sin pagar: el dueño decide cuándo paga. Vacío si no hay nada por pagar.
 */
export function htmlPeriodos(cuenta) {
  const periodos = periodosDePago(cuenta);
  if (!periodos.length) return '';
  const boton = (mes, quincena, p) => `<button type="button" class="btn dn-boton-chico" data-cm="periodo" data-mes="${esc(mes)}" data-quincena="${quincena}">${esc(`${etiquetaDelPeriodo(mes, quincena)} · ${p.cuantas} ${palabraRentas(p.cuantas)} · ${dinero(p.total)}`)}</button>`;
  const filas = periodos.map((p) => `
      <div class="dn-periodo-fila">
        <span class="dn-periodo-mes">${esc(nombreDelMes(p.mes))}</span>
        ${boton(p.mes, 0, p)}${p.quincenas.map((x) => boton(p.mes, x.quincena, x)).join('')}
      </div>`).join('');
  return `
    <div class="dn-periodos">
      <p class="dn-explica-chica dn-sin-margen">Marcar un período de un clic:</p>${filas}
    </div>`;
}

/**
 * Lo que dice la línea «Sin marcar»: cuántas rentas por pagar quedaron fuera de lo marcado y cuánto suman, para que se vea que
 * se escogió una parte y no todo. Vacía —y escondida— si no hay nada marcado (entonces «Por pagar en total» ya lo dice todo) o
 * si lo marcado es todo. Las cifras salen del núcleo (`sinMarcarDeComision`); aquí solo se dicen.
 */
export function textoDeSinMarcar(marcadas, sinMarcar) {
  const n = sinMarcar.contratos.length;
  if (!marcadas.cuantas || !n) return '';
  return `Sin marcar: ${n} ${palabraRentas(n)} · ${dinero(sinMarcar.monto)}`;
}

/** Pone la línea «Sin marcar» en la ficha YA DIBUJADA, sin redibujarla: la plantilla dice lo mismo con los mismos datos. */
export function parchearSinMarcar(raiz, texto) {
  const nodo = raiz.querySelector('#cm-sin-marcar');
  if (!nodo) return;
  nodo.textContent = texto;
  nodo.hidden = !texto;
}

function htmlFilaPorPagar(contrato, ctx) {
  const c = comisionDe(contrato);
  const marcada = ctx.ui.marcados.has(contrato.id);
  return `
    <tr class="dn-sin-clic" data-id="${esc(contrato.id)}">
      <td><input type="checkbox" data-cm="marcar" data-id="${esc(contrato.id)}" ${marcada ? 'checked' : ''}
        aria-label="Marcar la renta ${esc(contrato.numero ?? '')} de ${esc(contrato.carroPlacas)} para pagar su comisión"></td>
      <td>${esc(fecha(contrato.cierre?.fechaReal))}</td>
      <td>${esc(contrato.numero ?? '—')}</td>
      <td>${esc(contrato.carroPlacas || '—')}</td>
      <td>${esc(contrato.clienteNombre || '—')}</td>
      <td>${htmlDeDias(contrato)}</td>
      <td class="dn-derecha">${esc(dinero(c.base))}</td>
      <td class="dn-derecha">${esc(textoDeLaTasa(c.porcentaje))}</td>
      <td class="dn-derecha"><strong>${esc(dinero(c.monto))}</strong></td>
    </tr>`;
}

function htmlBloquePorPagar(ctx) {
  const { entrada, ui } = ctx;
  const { cuenta } = entrada;
  const marcadas = resumenDeMarcadasDeComision(entrada, ui.marcados);
  const hayPorPagar = cuenta.porPagar.length > 0;
  const filas = hayPorPagar
    ? cuenta.porPagar.map((c) => htmlFilaPorPagar(c, ctx)).join('')
    : '<tr><td colspan="9" class="pendiente dn-vacio dn-sin-clic">No hay comisiones por pagar.</td></tr>';

  const formulario = ui.pagando ? `
    <div id="dn-pago-form" class="dn-caja dn-pago-form">
      <div class="carro-campos">
        <label class="carro-campo">Forma de pago
          <select id="dn-forma" class="dn-selector">
            ${FORMAS_DE_PAGO.map((f) => `<option value="${f.valor}"${ui.forma === f.valor ? ' selected' : ''}>${f.etiqueta}</option>`).join('')}
          </select>
        </label>
        <label class="carro-campo">Fecha del pago
          <input type="date" id="dn-fecha" value="${esc(ui.fecha)}">
        </label>
      </div>
      <div class="carro-botones dn-botones-pago">
        <button type="button" class="btn" data-cm="cancelar-pago">Cancelar</button>
        <button type="button" class="btn btn-primario dn-boton-suelto" id="dn-guardar-pago" data-cm="guardar-pago" ${marcadas.cuantas === 0 ? 'disabled' : ''}>${esc(`Guardar pago de ${dinero(marcadas.total)}`)}</button>
      </div>
      <p id="dn-mensaje-pago" class="barra-lectura-fallida dn-mensaje" role="alert" ${ui.mensajePago ? '' : 'hidden'}>${esc(ui.mensajePago)}</p>
    </div>` : '';

  // Las que ya cerraron y no generan comisión (el 0 % de Wilder, o una base que el descuento se comió): no hay nada que pagarles
  // ni marcar. Se cuentan para que no se pierdan de vista sin llenar la pantalla de filas en cero.
  const n = cuenta.sinComision.length;
  const gana0 = entrada.registro && porcentajeAnotado(entrada.registro.porcentajeComision) === 0;
  const sinComision = n
    ? `<p class="dn-explica-chica">${n} ${n === 1 ? 'renta ya cerró y no genera' : 'rentas ya cerraron y no generan'} comisión${gana0 ? ': su porcentaje es 0 %' : ' (Q0.00)'}.</p>`
    : '';
  // Lo que quedó fuera de lo marcado, con su total (ver `textoDeSinMarcar`): se ve que se escogió una parte, no todo.
  const textoSinMarcar = textoDeSinMarcar(marcadas, sinMarcarDeComision(cuenta, marcadas.ids));

  return `
    <section class="carro-seccion">
      <h2>Por pagar</h2>
      ${htmlPeriodos(cuenta)}
      <table class="tabla-carros">
        <thead>
          <tr>
            <th>${hayPorPagar ? '<input type="checkbox" data-cm="marcar-todas" aria-label="Marcar todas las comisiones por pagar">' : ''}</th>
            <th>Regresó</th><th>Contrato</th><th>Placas</th><th>Cliente</th><th>Días</th>
            <th class="dn-derecha">Base</th><th class="dn-derecha">%</th><th class="dn-derecha">Comisión</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      ${sinComision}
      <div class="dn-caja dn-resumen">
        <div>Por pagar en total<br><strong class="dn-total">${esc(dinero(cuenta.totalPorPagar))}</strong></div>
        <div id="dn-marcado" class="dn-marcado">Marcado: <strong id="dn-marcadas">${marcadas.cuantas}</strong> <span id="dn-marcadas-palabra">${palabraRentas(marcadas.cuantas)}</span><br>
          <span class="dn-rotulo">Total marcado</span> <strong id="dn-total-marcado" class="dn-total-marcado">${esc(dinero(marcadas.total))}</strong>
          <br><span id="cm-sin-marcar" class="dn-gris"${textoSinMarcar ? '' : ' hidden'}>${esc(textoSinMarcar)}</span></div>
        <button type="button" class="btn btn-primario dn-boton-suelto" id="dn-registrar" data-cm="registrar" ${marcadas.cuantas === 0 || ui.pagando ? 'disabled' : ''}>Registrar pago</button>
      </div>
      ${formulario}
    </section>`;
}

/**
 * Lo que todavía no se paga: las rentas cuyo contrato no ha cerrado —el carro sigue afuera (con su estimado), o ya volvió y el
 * cliente debe saldo o falta liberar la garantía— y las que no traen un porcentaje legible. Se ven pero no se pueden marcar ni
 * suman al total, y cada una dice POR QUÉ con las mismas palabras que la ficha del dueño de un carro ajeno (`razonDeNoCierre`):
 * un renglón en gris que no dice su razón obliga a buscarla en otra pantalla.
 *
 * Lo que puede cambiar y lo que solo espera a cerrar no se mezclan ni en la fila ni en los totales de abajo: «estimada» es solo de
 * la que sigue afuera (`estadoDeComision`), y la que ya volvió tiene su monto y lo único que le falta es cerrar.
 */
function htmlBloqueTodaviaNoSePaga(ctx) {
  const { cuenta } = ctx.entrada;
  const filasNoFirmes = cuenta.noFirmes.map((c) => `
    <tr class="es-fuera dn-sin-clic" data-id="${esc(c.id)}">
      <td>${esc(fecha(c.fechaSalida))}</td>
      <td>${esc(c.numero ?? '—')}</td>
      <td>${esc(c.carroPlacas || '—')}</td>
      <td>${esc(c.clienteNombre || '—')}</td>
      <td>${htmlDeDias(c)}</td>
      <td class="dn-derecha">${esc(dinero(comisionDe(c).monto))}${estadoDeComision(c) === 'estimada' ? ' <span class="dn-gris">estimada</span>' : ''}</td>
      <td>${esc(razonDeNoCierre(c))}</td>
    </tr>`);
  const filasSinPorcentaje = cuenta.sinPorcentaje.map((c) => `
    <tr class="es-fuera dn-sin-clic" data-id="${esc(c.id)}">
      <td>${esc(fecha(c.fechaSalida))}</td>
      <td>${esc(c.numero ?? '—')}</td>
      <td>${esc(c.carroPlacas || '—')}</td>
      <td>${esc(c.clienteNombre || '—')}</td>
      <td>${htmlDeDias(c)}</td>
      <td class="dn-derecha">—</td>
      <td><span class="dn-alerta">Esta renta no trae un porcentaje de comisión legible, así que no se sabe cuánto es.</span></td>
    </tr>`);
  const filas = [...filasNoFirmes, ...filasSinPorcentaje];
  const hayEstimadas = cuenta.noFirmes.some((c) => estadoDeComision(c) === 'estimada');
  const hayPorCerrar = cuenta.noFirmes.some((c) => estadoDeComision(c) === 'sin-cerrar');
  const estimado = hayEstimadas
    ? `<p class="dn-explica-chica">De las que siguen afuera, estimado: ${esc(dinero(cuenta.totalEstimado))}. No es deuda todavía: puede subir con un día de atraso o bajar con un descuento.</p>`
    : '';
  const porCerrar = hayPorCerrar
    ? `<p class="dn-explica-chica">De las que ya regresaron, el monto ya es ese: ${esc(dinero(cuenta.totalPorCerrar))}. Solo falta que cierre el contrato.</p>`
    : '';
  return `
    <section class="carro-seccion">
      <h2>Todavía no se paga</h2>
      <p class="dn-explica-chica">Estas rentas se ven pero no se pueden marcar ni suman al total: la comisión se paga cuando el contrato cierra.</p>
      <table class="tabla-carros dn-tabla-gris">
        <thead>
          <tr><th>Salida</th><th>Contrato</th><th>Placas</th><th>Cliente</th><th>Días</th><th class="dn-derecha">Comisión</th><th>Por qué no se paga</th></tr>
        </thead>
        <tbody>${filas.length ? filas.join('') : '<tr><td colspan="7" class="pendiente dn-vacio dn-sin-clic">Ninguna renta está esperando a que cierre su contrato.</td></tr>'}</tbody>
      </table>
      ${estimado}${porCerrar}
    </section>`;
}

/** Una renta de un pago, en una línea. La misma línea sale de la renta de hoy o de la fila que el pago guardó: solo cambia de dónde viene. */
const lineaDeRenta = ({
  regreso, numero, placas, cliente, monto,
}) => `<li>${esc(fecha(regreso))} · contrato ${esc(numero ?? '—')} · ${esc(placas || '—')} · ${esc(cliente || '—')} · ${esc(dinero(monto))}</li>`;

function htmlBloqueYaPagado(ctx) {
  const { entrada, lectura } = ctx;
  const pagos = pagosDeLaCuentaDeComision(entrada, lectura.pagos.datos);
  const rentaDe = (id) => entrada.contratos.find((c) => c.id === id);
  const tarjetas = pagos.map((p) => {
    const estadoPapel = estadoDelComprobante(p);
    const conPapel = estadoPapel.tipo === 'listo';
    // Un pago CON comprobante lista sus rentas como las guardó (lo mismo que dice el papel, aunque después se corrija un cierre o la
    // renta ya no esté en esta cuenta); uno de antes no guardó nada renta por renta, y lista las de hoy, como siempre.
    const rentas = conPapel
      ? p.detalle.map((f) => lineaDeRenta({
        regreso: f.fechaReal, numero: f.numero, placas: f.carroPlacas, cliente: f.clienteNombre, monto: f.monto,
      })).join('')
      : (p.contratos ?? []).map((id) => {
        const c = rentaDe(id);
        return c
          ? lineaDeRenta({
            regreso: c.cierre?.fechaReal, numero: c.numero, placas: c.carroPlacas, cliente: c.clienteNombre, monto: comisionDe(c).monto,
          })
          : '<li class="dn-gris">Una renta que ya no está en esta cuenta.</li>';
      }).join('');
    // Un pago anulado NO desaparece: se ve apagado, con «Anulado el …», como un pago anulado del cliente o de un dueño. Sin botones:
    // su comprobante no se vuelve a armar (el número se conserva, el empleado tiene el papel viejo).
    const anulado = pagoAnulado(p);
    const etiquetaAnulado = anulado
      ? `<span class="etiqueta-anulado">Anulado${p.anuladoEn ? ` el ${esc(fecha(p.anuladoEn))}` : ''}</span>`
      : '';
    const verPapel = conPapel
      ? `<button type="button" class="btn" data-cm="comprobante" data-id="${esc(p.id)}">Ver comprobante</button>`
      : '';
    const boton = anulado ? '' : `${verPapel}<button type="button" class="btn" data-cm="anular-pago" data-id="${esc(p.id)}">Anular</button>`;
    // El nombre del pago: con papel es su número (lo que el empleado tiene escrito); uno de antes se queda como «Pago del …», para
    // que no se parezca a uno nuevo.
    const nombre = Number.isInteger(p.numero)
      ? `<strong>Comprobante N.° ${esc(p.numero)}</strong> · ${esc(fecha(p.fecha))}`
      : `<strong>Pago del ${esc(fecha(p.fecha))}</strong>`;
    // Lo que no tiene papel dice por qué, en vez de un botón que falta sin explicación (el anulado ya lo dice su etiqueta).
    const sinPapel = !anulado && !conPapel
      ? `<p class="dn-explica-chica dn-sin-margen dn-sin-papel">${esc(motivoSinComprobante(p))}</p>`
      : '';
    return `
      <article class="dn-caja dn-pago-hecho${anulado ? ' dn-pago-anulado' : ''}">
        <div class="dn-pago-cabecera">
          <div>${nombre} · ${esc(etiquetaDeForma(p.forma))}${etiquetaAnulado}</div>
          <div class="dn-pago-monto">
            <strong class="dn-pago-cifra">${esc(dinero(p.monto))}</strong>${boton}
          </div>
        </div>
        ${sinPapel}
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
 * Lo que se le pagó y hoy ya no coincide con lo que suman esas rentas (se corrigió un cierre después de pagar), en la ficha
 * de ese empleado y con las palabras de siempre: se pagaron tanto y hoy suman tanto. Solo informa: no cambia lo que se debe
 * ni es una barra roja (no es un fallo). Decide él qué hace. Vacío cuando no hay nada que decir.
 */
export function textoDePagoQueCambio({ pago, pagado, ahora }) {
  return `Lo que se pagó el ${fecha(pago.fecha)} fue ${dinero(pagado)}, y hoy esas rentas suman ${dinero(ahora)}.`;
}

function htmlPagosQueCambiaron(ctx) {
  const lineas = ctx.entrada.cuenta.pagosQueCambiaron.map((c) => `<p>${esc(textoDePagoQueCambio(c))}</p>`);
  return lineas.length ? `<div class="dn-de-mas">${lineas.join('')}</div>` : '';
}

/**
 * El mensaje del confirm() antes de enlazar: cuántas rentas, de qué nombre escrito a qué empleado, y —solo si lo pidió— cuántas
 * de ellas cambian de porcentaje y a cuál. Lo ya pagado no entra a esa cuenta (`sinPagar`). Función pura.
 */
export function textoConfirmarEnlazar({ entrada, registro, sinPagar = [] }) {
  const cuantos = entrada.contratos.length;
  const n = sinPagar.length;
  const delPorcentaje = n
    ? ` Además, el porcentaje de ${n} ${n === 1 ? 'renta que aún no se ha pagado' : 'rentas que aún no se han pagado'} pasa a ${textoDeLaTasa(registro.porcentajeComision)}.`
    : '';
  return `¿Enlazar ${cuantos} ${palabraRentas(cuantos)} de «${entrada.nombre}» al empleado «${registro.nombre}»?${delPorcentaje} Esto no se puede deshacer desde el sistema.`;
}

/**
 * Lo que se ofrece para las rentas viejas con el nombre escrito a mano: se escoge a qué empleado de la lista corresponde ese
 * nombre. Opcionalmente, y solo si lo pide, las que aún no se han pagado toman el porcentaje de hoy de ese empleado — para las
 * rentas de antes cuyo porcentaje fue el 5 % que traía el formulario y no uno que alguien decidiera (el caso de Wilder, que no
 * gana comisión). Lo ya pagado no se toca nunca.
 */
function htmlEnlace(ctx) {
  const { entrada, vista, ui } = ctx;
  const opciones = [...vista.registros]
    .map((e) => `<option value="${esc(e.id)}"${ui.enlazarEmpleadoId === e.id ? ' selected' : ''}>${esc(e.codigo ? `${e.codigo} · ` : '')}${esc(e.nombre)} (${esc(textoDeLaTasa(e.porcentajeComision))})${estaActivo(e) ? '' : ' — de baja'}</option>`).join('');
  const traen = porcentajesDeLasRentas(entrada.contratos);
  const traenTexto = traen.length ? ` Esas rentas traen el porcentaje que tenían ese día: ${traen.map((p) => `${p} %`).join(' y ')}.` : '';
  const sinEmpleados = vista.registros.length === 0
    ? `<p class="dn-explica-chica">Todavía no hay empleados en la lista. Primero da de alta al empleado en <a href="#/dinero/empleados/nuevo">Empleados</a>.</p>`
    : '';
  return `
    <section class="carro-seccion" id="cm-enlace">
      <h2>Rentas sin enlazar</h2>
      <p class="dn-parrafo">Estas rentas solo tienen el nombre «${esc(entrada.nombre)}» escrito a mano en el contrato, y mientras no se enlacen a un empleado de la lista se cuentan aparte de las que ese empleado ya tenga.${esc(traenTexto)}</p>
      ${sinEmpleados}
      <div class="dn-enlace-fila">
        <select id="cm-enlazar-empleado" class="dn-selector" aria-label="Empleado de la lista">
          <option value="">Escoge un empleado de la lista</option>${opciones}
        </select>
        <button type="button" class="btn" data-cm="enlazar">Enlazar</button>
      </div>
      <label class="dn-casilla-enlace">
        <input type="checkbox" id="cm-enlazar-porcentaje" ${ui.enlazarPorcentaje ? 'checked' : ''}>
        También poner, en las rentas que aún no se han pagado, el porcentaje de hoy de ese empleado en lugar del que traen
      </label>
      <p id="cm-mensaje-enlace" class="barra-lectura-fallida dn-mensaje-junto" role="alert" ${ui.mensajeEnlace ? '' : 'hidden'}>${esc(ui.mensajeEnlace)}</p>
    </section>`;
}

/** La ficha de un empleado: lo que se le pagó de más o de menos (si algo), y sus bloques, en este orden. */
export function htmlFichaDeComisiones(ctx) {
  const { entrada, vista } = ctx;
  const registro = entrada.registro;
  const datos = registro
    ? `<p class="dn-datos-dueno">${[registro.codigo ? `Código ${esc(registro.codigo)}` : '', `Gana el ${esc(textoDeLaTasa(registro.porcentajeComision))}`]
      .filter(Boolean).join(' · ')} · <a href="#/dinero/empleados/${esc(registro.id)}">Editar empleado</a></p>`
    : '';
  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <a href="${RUTA_DE_COMISIONES}" class="btn">← Comisiones</a>
        <h1>${esc(entrada.nombre)}</h1>
        ${htmlEtiquetas(entrada)}
        <button type="button" class="btn" data-cm="bajar" data-alcance="una">Bajar esta cuenta en Excel</button>
      </div>
      ${vista.falloEmpleados ? barraRoja([MENSAJE_FALLO_EMPLEADOS]) : ''}
      ${ctx.ui?.mensajeBajar ? barraRoja([ctx.ui.mensajeBajar]) : ''}
      ${datos}
      <p class="dn-explica-chica">${esc(TEXTO_DE_LA_COPIA_DE_UNA)}</p>
      ${htmlPagosQueCambiaron(ctx)}
      ${entrada.sinEnlazar ? htmlEnlace(ctx) : ''}
      ${htmlBloquePorPagar(ctx)}
      ${htmlBloqueTodaviaNoSePaga(ctx)}
      ${htmlBloqueYaPagado(ctx)}
    </div>`;
}

// ---------------------------------------------------------------------------
// La lectura
// ---------------------------------------------------------------------------

/**
 * Lee lo que la pantalla necesita, de la nube y con la credencial de dinero. Ninguna de las tres lecturas puede tumbar a las
 * otras ni dejar la pantalla sin respuesta: cada una, si lanza, se vuelve un fallo — nunca una lista vacía.
 *
 * Las rentas, de la NUBE (`cargarContratosDeLaNube`) y no de la copia local: una renta recién guardada o corregida desde
 * otra computadora tiene que verse, porque de ella sale lo que se paga.
 */
async function leerTodo() {
  const [contratos, pagos, empleados] = await Promise.all([
    cargarContratosDeLaNube().catch(() => ({ datos: null, fallo: true })),
    cargarPagosComision().catch(() => ({ datos: null, fallo: true })),
    cargarEmpleados().catch(() => ({ datos: null, fallo: true })),
  ]);
  return { contratos, pagos, empleados };
}

// Lo ya leído sirve para ir de la lista a una ficha y volver sin pedirle todo a la nube. Vive en la memoria de este módulo —no
// en IndexedDB, no en una variable global— y se olvida SIEMPRE que la sesión de dinero se cierra (`alOlvidarElDinero`). Solo
// se guarda una lectura que `armarVistaDeComisiones` da por buena; una fallida no se guarda y además borra lo de antes.
const lector = crearLector({ leer: leerTodo, valida: (l) => armarVistaDeComisiones(l).ok });

// La caja donde está dibujada: al cerrarse la sesión se vacía. Cuenta las pantallas dibujadas: una carga lenta que termina
// cuando ya se dibujó otra cosa no pinta encima.
let raizActual = null;
let ultimoToken = 0;

alOlvidarElDinero(() => {
  lector.olvidar();
  if (raizActual?.isConnected) raizActual.replaceChildren();
  raizActual = null;
});

// ---------------------------------------------------------------------------
// La pantalla: la lista y la ficha
// ---------------------------------------------------------------------------

/** La lista de comisiones, `#/dinero/comisiones`. */
export function pintarComisiones(contenedor) {
  return pintarCuentas(contenedor, null);
}

/** La ficha de un empleado, `#/dinero/comisiones/:clave`. */
export function pintarComisionesDeEmpleado(contenedor, clave) {
  return pintarCuentas(contenedor, clave);
}

async function pintarCuentas(contenedor, claveDeFicha) {
  const miToken = ++ultimoToken;
  const hoy = hoyISO();
  const vigente = () => miToken === ultimoToken && enElAreaDeDinero(location.hash);

  // Todo lo que esta pantalla engancha cuelga de esta caja y no del contenedor: el router reutiliza siempre el mismo <main>,
  // y un manejador pegado a él se seguiría disparando en las demás pantallas.
  const raiz = document.createElement('div');
  contenedor.replaceChildren(raiz);
  raizActual = raiz;

  const ui = {
    marcados: new Set(), pagando: false, forma: FORMAS_DE_PAGO[0].valor, fecha: hoy,
    mensajePago: '', mensajeEnlace: '', mensajeBajar: '', enlazarEmpleadoId: '', enlazarPorcentaje: false, enCurso: null, ocupado: false,
  };
  let vista = null;
  let entrada = null;
  let claveActual = claveDeFicha;
  // La última lectura que NO salió bien: no se guarda con lo demás (reintentar tiene que volver a pedirla), pero hace falta
  // para decir QUÉ falló.
  let lecturaFallida = null;

  function dibujar() {
    // Sin sesión no se dibuja nada: lo leído se soltó al cerrarse.
    if (!vigente() || !sesionDeDinero()) return;
    vista = armarVistaDeComisiones(lector.actual ?? lecturaFallida ?? {});
    if (!vista.ok) {
      raiz.innerHTML = htmlFalloDeComisiones(vista);
      return;
    }
    if (claveActual === null) {
      raiz.innerHTML = htmlListaDeComisiones(vista, { mensajeBajar: ui.mensajeBajar });
      return;
    }
    entrada = vista.entradas.find((e) => e.clave === claveActual) ?? null;
    if (!entrada) {
      raiz.innerHTML = `<div class="carros-contenido"><p class="pendiente">No se encontró esta cuenta. <a href="${RUTA_DE_COMISIONES}">Volver a la lista</a></p></div>`;
      return;
    }
    // Lo marcado que ya no se puede pagar (porque se pagó, o cambió) se desmarca.
    const pagables = new Set(entrada.cuenta.porPagar.map((c) => c.id));
    for (const id of [...ui.marcados]) if (!pagables.has(id)) ui.marcados.delete(id);
    raiz.innerHTML = htmlFichaDeComisiones({ entrada, vista, ui, lectura: lector.actual, hoy });
  }

  async function cargarYDibujar({ forzar = false } = {}) {
    raiz.innerHTML = '<p class="pendiente">Leyendo las comisiones…</p>';
    const leida = await lector.obtener({ forzar });
    if (!vigente()) return;
    lecturaFallida = lector.actual ? null : leida;
    // Si la sesión se cerró mientras se leía (inactividad, o Firebase), se pide la contraseña otra vez.
    if (!sesionDeDinero()) {
      mostrar(location.hash);
      return;
    }
    dibujar();
  }

  /**
   * ¿Sigue habiendo sesión de dinero? Si Firebase la cerró por su cuenta, seguir como si nada haría que cada acción fallara con
   * un «revisa tu internet» que no es: se suelta lo leído y se vuelve a pasar por la puerta, que pide la contraseña.
   */
  function haySesion() {
    if (sesionDeDinero()) return true;
    lector.olvidar();
    mostrar(location.hash);
    return false;
  }

  // ----- Marcar rentas: solo se mueve el total, no se redibuja nada -----
  function actualizarMarcado() {
    if (!entrada) return;
    const marcadas = resumenDeMarcadasDeComision(entrada, ui.marcados);
    parchearMarcado(raiz, marcadas, { pagando: ui.pagando });
    parchearSinMarcar(raiz, textoDeSinMarcar(marcadas, sinMarcarDeComision(entrada.cuenta, marcadas.ids)));
  }

  // Las casillas de las filas (y la de «marcar todas») siguen a lo marcado: sin redibujar, para no mover la página.
  function sincronizarCasillas() {
    const filas = [...raiz.querySelectorAll('[data-cm="marcar"]')];
    for (const fila of filas) fila.checked = ui.marcados.has(fila.dataset.id);
    const todas = raiz.querySelector('[data-cm="marcar-todas"]');
    if (todas) todas.checked = filas.length > 0 && filas.every((fila) => fila.checked);
  }

  // ----- Registrar el pago -----
  async function guardarPago() {
    if (ui.ocupado || !haySesion()) return;
    const marcadas = resumenDeMarcadasDeComision(entrada, ui.marcados);
    ui.fecha = raiz.querySelector('#dn-fecha')?.value || ui.fecha;
    ui.forma = raiz.querySelector('#dn-forma')?.value || ui.forma;
    const problemaDeFecha = problemaDeLaFechaDelPago(ui.fecha, hoyISO());
    if (problemaDeFecha) { ui.mensajePago = problemaDeFecha; dibujar(); return; }
    ui.ocupado = true;
    const boton = raiz.querySelector('#dn-guardar-pago');
    if (boton) boton.disabled = true;
    try {
      const r = await registrarElPagoDeComision({
        entrada,
        idsMarcados: marcadas.ids,
        forma: ui.forma,
        fecha: ui.fecha,
        empleados: { datos: lector.actual?.empleados.datos ?? [], fallo: false },
        enCurso: ui.enCurso ?? (ui.enCurso = {}),
      });
      if (!lector.actual) return;
      lector.actual.pagos.datos = r.pagos;
      // Las rentas que se leyeron al guardar son ahora la verdad: si una cambió mientras tanto, la lista ya la dibuja como está.
      if (r.contratos) lector.actual.contratos = r.contratos;
      if (r.tipo === 'cambio') {
        ui.mensajePago = MENSAJE_COMISION_CAMBIO;
        ui.marcados.clear();
        ui.enCurso = null;
      } else {
        ui.pagando = false;
        ui.mensajePago = '';
        ui.marcados.clear();
        ui.enCurso = null;
        aviso(r.tipo === 'ya-guardado'
          ? `Ese pago ya estaba registrado (comprobante N.° ${r.pago.numero}).`
          : `Pago registrado: ${dinero(r.pago.monto)}. Comprobante N.° ${r.pago.numero}.`, 'exito');
      }
      dibujar();
    } catch (error) {
      ui.mensajePago = mensajeSeguroDeComision(error, MENSAJE_COMISION_FALLO);
      dibujar();
    } finally {
      ui.ocupado = false;
    }
  }

  // ----- El comprobante del empleado -----
  async function verComprobante(pagoId) {
    if (ui.ocupado || !haySesion() || !entrada) return;
    ui.ocupado = true;
    try {
      const r = await leerElPagoParaElComprobante({ pagoId });
      // Si la sesión se cerró mientras se leía, lo leído se tira: es dinero y se suelta con la sesión.
      if (!haySesion() || !lector.actual) return;
      lector.actual.pagos.datos = r.pagos;
      if (r.tipo === 'no-esta') { aviso(MENSAJE_COMPROBANTE_COMISION_NO_ESTA, 'error'); dibujar(); return; }
      // Lo que cambió en las rentas de este pago desde que se pagó, para decírselo a quien lo manda (el papel no cambia). La cuenta se arma
      // con los pagos recién leídos.
      const vistaDeAhora = armarVistaDeComisiones(lector.actual);
      const deAhora = vistaDeAhora.ok ? vistaDeAhora.entradas.find((e) => e.clave === claveActual) : null;
      pintarComprobanteDeComision(raiz, entradaDelPapelDeComision({ pago: r.pago, entrada, entradaDeAhora: deAhora }), { alVolver: dibujar });
    } catch (error) {
      aviso(mensajeSeguroDeComision(error, MENSAJE_COMPROBANTE_COMISION_FALLO), 'error');
    } finally {
      ui.ocupado = false;
    }
  }

  // ----- Enlazar las rentas viejas a un empleado de la lista -----
  async function enlazar() {
    if (ui.ocupado || !entrada?.sinEnlazar || !haySesion()) return;
    const empleadoId = raiz.querySelector('#cm-enlazar-empleado')?.value ?? '';
    ui.enlazarEmpleadoId = empleadoId;
    ui.enlazarPorcentaje = Boolean(raiz.querySelector('#cm-enlazar-porcentaje')?.checked);
    const registro = vista.registros.find((e) => e.id === empleadoId);
    if (!registro) { ui.mensajeEnlace = 'Escoge a qué empleado de la lista corresponde.'; dibujar(); return; }
    // Solo las que no están pagadas pueden tomar otro porcentaje: lo ya pagado no se toca.
    const sinPagar = ui.enlazarPorcentaje ? rentasSinPagar(entrada.cuenta) : [];
    if (!window.confirm(textoConfirmarEnlazar({ entrada, registro, sinPagar }))) return;
    ui.ocupado = true;
    ui.mensajeEnlace = '';
    try {
      await enlazarContratosAlEmpleado(entrada.contratos.map((c) => c.id), registro.id, {
        idsConPorcentaje: sinPagar.map((c) => c.id), porcentajeComision: registro.porcentajeComision,
      });
      const leida = lector.actual;
      if (!leida) return;
      const enlazadas = new Set(entrada.contratos.map((c) => c.id));
      const conPorcentaje = new Set(sinPagar.map((c) => c.id));
      // Se pone en memoria lo mismo que se escribió, sin volver a pedirle todo a la nube.
      leida.contratos.datos = leida.contratos.datos.map((c) => {
        if (!enlazadas.has(c.id)) return c;
        return { ...c, empleadoId: registro.id, ...(conPorcentaje.has(c.id) ? { porcentajeComision: porcentajeAnotado(registro.porcentajeComision) } : {}) };
      });
      aviso('Rentas enlazadas.', 'exito');
      // La cuenta cambia de clave (de `texto:` a `id:`): se actualiza la dirección sin volver a leer.
      claveActual = `id:${registro.id}`;
      history.replaceState(null, '', rutaDeComisiones(claveActual));
      ui.mensajeEnlace = '';
      ui.enlazarEmpleadoId = '';
      ui.enlazarPorcentaje = false;
      ui.marcados.clear();
    } catch (error) {
      ui.mensajeEnlace = mensajeSeguroDeComision(error, MENSAJE_ENLACE_COMISION_FALLO);
    } finally {
      ui.ocupado = false;
    }
    dibujar();
  }

  // ----- Anular un pago de comisión -----
  async function anularPago(pagoId) {
    if (ui.ocupado || !haySesion()) return;
    const pago = lector.actual?.pagos.datos.find((p) => p.id === pagoId);
    if (!pago || pagoAnulado(pago) || !entrada) return;
    if (!window.confirm(textoConfirmarAnularPagoDeComision(pago, entrada))) return;
    ui.ocupado = true;
    try {
      const r = await anularElPagoDeComision({ pago, hoy: hoyISO() });
      if (!lector.actual) return;
      lector.actual.pagos.datos = r.pagos;
      if (r.tipo === 'no-esta') aviso(MENSAJE_ANULAR_COMISION_NO_ESTA, 'error');
      else {
        aviso(r.tipo === 'ya-anulado'
          ? 'Ese pago ya estaba anulado.'
          : 'Pago anulado. Queda en «Ya pagado», marcado como anulado.', 'exito');
      }
    } catch (error) {
      aviso(mensajeSeguroDeComision(error, MENSAJE_ANULAR_COMISION_FALLO), 'error');
    } finally {
      ui.ocupado = false;
    }
    dibujar();
  }

  // ----- Bajar la cuenta en Excel -----
  async function bajarExcel(alcance) {
    if (ui.ocupado || !haySesion()) return;
    ui.ocupado = true;
    ui.mensajeBajar = '';
    for (const boton of raiz.querySelectorAll('[data-cm="bajar"]')) { boton.disabled = true; boton.textContent = 'Armando el archivo…'; }
    try {
      const r = await bajarLasCuentasEnExcel({ clave: alcance === 'una' ? claveActual : null, hoy: hoyISO() });
      aviso(textoDeLoBajado(r), 'exito');
    } catch (error) {
      // Una frase nuestra se le dice tal cual; cualquier otra cosa (un error de Firebase, de código) nunca.
      if (error instanceof ErrorDeBajada) ui.mensajeBajar = error.message;
      else { ui.mensajeBajar = MENSAJE_BAJAR_FALLO; console.error('No se pudo bajar la cuenta en Excel:', error); }
    } finally {
      ui.ocupado = false;
    }
    // Un fallo se queda escrito en la página (un aviso de cinco segundos se pierde y él creería que se bajó). Si lo que pasó es que
    // la sesión se cerró, se vuelve a pasar por la puerta, que pide la contraseña.
    if (ui.mensajeBajar === MENSAJE_BAJAR_SIN_SESION && !haySesion()) return;
    dibujar();
  }

  // ----- Los eventos, todos desde la raíz -----
  raiz.addEventListener('click', (ev) => {
    const accion = ev.target.closest('[data-cm]');
    if (accion) {
      switch (accion.dataset.cm) {
        case 'reintentar':
        case 'actualizar':
          cargarYDibujar({ forzar: true });
          return;
        case 'registrar': ui.pagando = true; ui.mensajePago = ''; ui.enCurso = {}; dibujar(); return;
        case 'cancelar-pago': ui.pagando = false; ui.mensajePago = ''; ui.enCurso = null; dibujar(); return;
        case 'guardar-pago': guardarPago(); return;
        case 'enlazar': enlazar(); return;
        case 'anular-pago': anularPago(accion.dataset.id); return;
        case 'comprobante': verComprobante(accion.dataset.id); return;
        case 'bajar': bajarExcel(accion.dataset.alcance); return;
        case 'periodo':
          // Un clic marca el período entero (reemplaza lo marcado); lo que quedó fuera sigue a la vista, con su total.
          ui.marcados = new Set(idsDelPeriodo(entrada.cuenta, accion.dataset.mes, Number(accion.dataset.quincena)));
          sincronizarCasillas();
          actualizarMarcado();
          return;
        default: return;
      }
    }
    // Un clic en cualquier parte de una fila de la lista abre esa cuenta (como en la de dueños).
    const fila = ev.target.closest('tr[data-cm-clave]');
    if (fila && !ev.target.closest('a')) location.hash = rutaDeComisiones(fila.dataset.cmClave);
  });

  raiz.addEventListener('change', (ev) => {
    const caja = ev.target;
    if (caja.matches?.('[data-cm="marcar"]')) {
      if (caja.checked) ui.marcados.add(caja.dataset.id);
      else ui.marcados.delete(caja.dataset.id);
      sincronizarCasillas();
      actualizarMarcado();
    } else if (caja.matches?.('[data-cm="marcar-todas"]')) {
      // La casilla del encabezado marca o desmarca todas las que se pueden pagar, y cada casilla de fila la sigue.
      for (const fila of raiz.querySelectorAll('[data-cm="marcar"]')) {
        if (caja.checked) ui.marcados.add(fila.dataset.id);
        else ui.marcados.delete(fila.dataset.id);
      }
      sincronizarCasillas();
      actualizarMarcado();
    } else if (caja.id === 'dn-forma') {
      ui.forma = caja.value;
    } else if (caja.id === 'dn-fecha') {
      ui.fecha = caja.value;
    } else if (caja.id === 'cm-enlazar-empleado') {
      ui.enlazarEmpleadoId = caja.value;
    } else if (caja.id === 'cm-enlazar-porcentaje') {
      ui.enlazarPorcentaje = caja.checked;
    }
  });

  await cargarYDibujar();
}
