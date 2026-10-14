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
// - SOLO SE PAGA LO FIRME: una comisión queda firme cuando el carro regresó. La de una renta que sigue afuera es un
//   estimado (un día de atraso la sube, un descuento la baja): se ve, aparte, y no se puede marcar.
// - Un empleado con 0 % (Wilder) no tiene nada que pagarle: sus rentas no ofrecen casilla, y se dice cuántas son.
import { comisionDe } from '../nucleo/comision.js';
import {
  agruparPorEmpleado, cuentaDeEmpleado, elegirParaPagoDeComision, totalGeneralDeComisiones, rentasSinPagar,
} from '../nucleo/comisiones.js';
import { pagoAnulado } from '../nucleo/liquidacion.js';
import { porcentajeAnotado, estaActivo, ordenarEmpleados } from '../nucleo/empleado.js';
import { atrasoDe } from '../nucleo/contrato.js';
import { hoyISO, esFechaISO } from '../nucleo/fechas.js';
import { sesionDeDinero } from '../dinero-sesion.js';
import {
  cargarContratosDeLaNube, cargarPagosComision, cargarEmpleados, nuevoIdPagoComision, construirPagoComision, guardarPagoComision,
  anularPagoComision, enlazarContratosAlEmpleado, MENSAJE_COMISION_SIN_DINERO, MENSAJE_COMISION_SIN_RENTAS,
  MENSAJE_COMISION_SIN_MONTO, MENSAJE_COMISION_SIN_ID,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';
import { mostrar } from '../router.js';
import {
  FORMAS_DE_PAGO, etiquetaDeForma, crearLector, problemaDeLaFechaDelPago, parchearMarcado, alOlvidarElDinero, enElAreaDeDinero,
} from './dinero.js';

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
export const MENSAJE_COMISION_CAMBIO = 'Mientras tanto cambió la cuenta de este empleado: alguna de las rentas marcadas ya no se puede pagar o cambió de monto (por ejemplo, ya tiene un pago registrado, o se corrigió su cierre). No se registró nada; la lista ya está al día, revisa y vuelve a marcar.';
export const MENSAJE_COMISION_FALLO = 'No se pudo registrar el pago. Revisa tu internet y vuelve a apretar «Guardar pago»: si ya había quedado guardado, no se duplica. '
  + 'Si sigue sin conectar, recarga la página y revisa «Ya pagado» antes de intentarlo otra vez.';
export const MENSAJE_ANULAR_COMISION_SIN_COMPROBAR = 'No se pudo comprobar si este pago sigue como lo ves, y anularlo sin saberlo podría pisar una anulación que ya se hizo. Revisa tu internet e intenta de nuevo; no se anuló nada.';
export const MENSAJE_ANULAR_COMISION_NO_ESTA = 'Este pago ya no está en la lista de pagos. No se anuló nada; la lista ya está al día, revísala.';
export const MENSAJE_ANULAR_COMISION_FALLO = 'No se pudo anular el pago. Revisa tu internet y vuelve a intentarlo: si ya había quedado anulado, no se anula dos veces.';
export const MENSAJE_ENLACE_COMISION_FALLO = 'No se pudieron enlazar las rentas. Revisa tu internet e intenta de nuevo: repetirlo no daña nada.';

const FRASES_CONOCIDAS = new Set([
  MENSAJE_COMISION_SIN_DINERO, MENSAJE_COMISION_SIN_RENTAS, MENSAJE_COMISION_SIN_MONTO, MENSAJE_COMISION_SIN_ID,
  MENSAJE_COMISION_SIN_COMPROBAR, MENSAJE_COMISION_SIN_COMPROBAR_RENTAS, MENSAJE_ANULAR_COMISION_SIN_COMPROBAR,
  'La nube no respondió a tiempo.',
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
      // Enlazado a un empleado que no está en la lista (o que no se pudo leer).
      sinRegistro: Boolean(g.empleadoId && !registro),
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
    falloEmpleados: Boolean(empleados?.fallo) || !Array.isArray(empleados?.datos),
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
 * 4. Arma el pago con `construirPagoComision` sobre lo leído AHORA, pide el id UNA vez (`enCurso`) y guarda.
 *
 * Devuelve `{ tipo, pagos, contratos?, pago? }` con `tipo` en 'guardado', 'ya-guardado' o 'cambio'. Lanza lo que lance cada paso.
 */
export async function registrarElPagoDeComision({
  entrada, idsMarcados, forma, fecha: fechaDelPago, empleados = { datos: [], fallo: false }, enCurso = {},
  leerPagos = cargarPagosComision, leerContratos = cargarContratosDeLaNube,
  nuevoId = nuevoIdPagoComision, guardar = guardarPagoComision,
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
  // cubrir lo mismo y sumar lo mismo.
  const igual = visto.rentas.length === idsMarcados.length
    && pago.contratos.length === visto.contratos.length
    && visto.contratos.every((id) => pago.contratos.includes(id))
    && pago.monto === visto.monto;
  if (!igual) return { tipo: 'cambio', pagos: frescos.datos, contratos: rentas };

  // Una vez por intención de pagar, y se conserva aunque este intento falle.
  enCurso.id ??= await nuevoId();
  const guardado = await guardar({ ...pago, id: enCurso.id });
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
  return `¿Anular el pago de ${dinero(pago?.monto)} a ${entrada?.nombre ?? 'este empleado'} (del ${fecha(pago?.fecha)}, ${etiquetaDeForma(pago?.forma).toLowerCase()})? `
    + `Cubre ${rentas} ${palabraRentas(rentas)}. ${rentas === 1 ? 'Esa renta vuelve' : 'Esas rentas vuelven'} a «Por pagar». `
    + 'El pago queda marcado como anulado y no desaparece de «Ya pagado».';
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
  const anulado = await guardar(anularPagoComision(actual, { fecha: hoy }));
  return { tipo: 'anulado', pago: anulado, pagos: frescos.datos.map((p) => (p.id === anulado.id ? anulado : p)) };
}

// ---------------------------------------------------------------------------
// HTML (funciones puras: reciben datos y devuelven texto, sin tocar el DOM)
// ---------------------------------------------------------------------------

// Nada de esta pantalla lleva estilos en línea: cada ajuste es una clase `dn-*` de css/estilos.css (como en dinero.js).

const barraRoja = (frases) => (frases.length
  ? `<div class="barra-lectura-fallida" role="alert">${frases.map((f) => `<p>${esc(f)}</p>`).join('')}</div>`
  : '');

/** Lo que se dibuja cuando NO se puede mostrar ninguna cuenta: una barra roja y cómo volver a intentarlo. Ninguna cifra. */
export function htmlFalloDeComisiones(vista) {
  const frases = [];
  if (vista.problemas.includes('rentas')) frases.push(MENSAJE_FALLO_RENTAS);
  if (vista.problemas.includes('pagos')) frases.push(MENSAJE_FALLO_PAGOS_DE_COMISION);
  if (vista.problemas.includes('datos')) frases.push(MENSAJE_FALLO_DATOS_DE_COMISION);
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

/** Las etiquetas junto al nombre de un empleado en la lista y en la ficha. */
function htmlEtiquetas(entrada) {
  const baja = entrada.registro && !estaActivo(entrada.registro);
  return [
    entrada.sinEnlazar ? '<span class="etiqueta-estado" title="El nombre se escribió a mano en el contrato">Sin enlazar</span>' : '',
    entrada.sinRegistro ? '<span class="etiqueta-estado">No está en la lista de empleados</span>' : '',
    baja ? '<span class="etiqueta-estado">De baja</span>' : '',
    entrada.registro && porcentajeAnotado(entrada.registro.porcentajeComision) === 0 ? '<span class="etiqueta-estado">No gana comisión</span>' : '',
  ].filter(Boolean).join(' ');
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
export function htmlListaDeComisiones(vista) {
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
      </div>
      ${vista.falloEmpleados ? barraRoja([MENSAJE_FALLO_EMPLEADOS]) : ''}
      <p class="dn-explica">Solo se paga la comisión de una renta cuyo carro ya regresó: mientras sigue afuera es un estimado, porque un día de atraso la sube y un descuento la baja.</p>
      <table class="tabla-carros">
        <thead>
          <tr><th>Empleado</th><th>Porcentaje</th><th>Rentas por pagar</th><th class="dn-derecha">Se le debe</th></tr>
        </thead>
        <tbody>${filas}</tbody>${pie}
      </table>
    </div>`;
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
    : '<tr><td colspan="9" class="pendiente dn-vacio dn-sin-clic">No hay comisiones firmes por pagar.</td></tr>';

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

  // Las que ya regresaron y no generan comisión (el 0 % de Wilder, o una base que el descuento se comió): no hay nada que
  // pagarles ni marcar. Se cuentan para que no se pierdan de vista sin llenar la pantalla de filas en cero.
  const n = cuenta.sinComision.length;
  const gana0 = entrada.registro && porcentajeAnotado(entrada.registro.porcentajeComision) === 0;
  const sinComision = n
    ? `<p class="dn-explica-chica">${n} ${n === 1 ? 'renta ya regresó y no genera' : 'rentas ya regresaron y no generan'} comisión${gana0 ? ': su porcentaje es 0 %' : ' (Q0.00)'}.</p>`
    : '';

  return `
    <section class="carro-seccion">
      <h2>Por pagar</h2>
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
          <span class="dn-rotulo">Total marcado</span> <strong id="dn-total-marcado" class="dn-total-marcado">${esc(dinero(marcadas.total))}</strong></div>
        <button type="button" class="btn btn-primario dn-boton-suelto" id="dn-registrar" data-cm="registrar" ${marcadas.cuantas === 0 || ui.pagando ? 'disabled' : ''}>Registrar pago</button>
      </div>
      ${formulario}
    </section>`;
}

/**
 * Lo que no es una comisión firme todavía, o no se puede pagar: las rentas cuyo carro sigue afuera (con su estimado) y las
 * que no traen un porcentaje legible. Se ven pero no se pueden marcar ni suman al total.
 */
function htmlBloqueAunNoEsFirme(ctx) {
  const { cuenta } = ctx.entrada;
  const filasNoFirmes = cuenta.noFirmes.map((c) => `
    <tr class="es-fuera dn-sin-clic" data-id="${esc(c.id)}">
      <td>${esc(fecha(c.fechaSalida))}</td>
      <td>${esc(c.numero ?? '—')}</td>
      <td>${esc(c.carroPlacas || '—')}</td>
      <td>${esc(c.clienteNombre || '—')}</td>
      <td>${htmlDeDias(c)}</td>
      <td class="dn-derecha">${esc(dinero(comisionDe(c).monto))} <span class="dn-gris">estimada</span></td>
      <td>El carro todavía no regresa.</td>
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
  const estimado = cuenta.noFirmes.length
    ? `<p class="dn-explica-chica">Estimado de las que siguen afuera: ${esc(dinero(cuenta.totalEstimado))}. No es deuda todavía: puede subir con un día de atraso o bajar con un descuento.</p>`
    : '';
  return `
    <section class="carro-seccion">
      <h2>Aún no es firme</h2>
      <p class="dn-explica-chica">Estas rentas se ven pero no se pueden marcar ni suman al total: la comisión se fija cuando el carro regresa.</p>
      <table class="tabla-carros dn-tabla-gris">
        <thead>
          <tr><th>Salida</th><th>Contrato</th><th>Placas</th><th>Cliente</th><th>Días</th><th class="dn-derecha">Comisión</th><th>Por qué no se paga</th></tr>
        </thead>
        <tbody>${filas.length ? filas.join('') : '<tr><td colspan="7" class="pendiente dn-vacio dn-sin-clic">Ninguna renta está esperando que regrese su carro.</td></tr>'}</tbody>
      </table>
      ${estimado}
    </section>`;
}

function htmlBloqueYaPagado(ctx) {
  const { entrada, lectura } = ctx;
  const pagos = pagosDeLaCuentaDeComision(entrada, lectura.pagos.datos);
  const rentaDe = (id) => entrada.contratos.find((c) => c.id === id);
  const tarjetas = pagos.map((p) => {
    const rentas = (p.contratos ?? []).map((id) => {
      const c = rentaDe(id);
      return c
        ? `<li>${esc(fecha(c.cierre?.fechaReal))} · contrato ${esc(c.numero ?? '—')} · ${esc(c.carroPlacas || '—')} · ${esc(c.clienteNombre || '—')} · ${esc(dinero(comisionDe(c).monto))}</li>`
        : '<li class="dn-gris">Una renta que ya no está en esta cuenta.</li>';
    }).join('');
    // Un pago anulado NO desaparece: se ve apagado, con «Anulado el …», como un pago anulado del cliente o de un dueño. Sin botones.
    const anulado = pagoAnulado(p);
    const etiquetaAnulado = anulado
      ? `<span class="etiqueta-anulado">Anulado${p.anuladoEn ? ` el ${esc(fecha(p.anuladoEn))}` : ''}</span>`
      : '';
    const boton = anulado ? '' : `<button type="button" class="btn" data-cm="anular-pago" data-id="${esc(p.id)}">Anular</button>`;
    return `
      <article class="dn-caja dn-pago-hecho${anulado ? ' dn-pago-anulado' : ''}">
        <div class="dn-pago-cabecera">
          <div><strong>Pago del ${esc(fecha(p.fecha))}</strong> · ${esc(etiquetaDeForma(p.forma))}${etiquetaAnulado}</div>
          <div class="dn-pago-monto">
            <strong class="dn-pago-cifra">${esc(dinero(p.monto))}</strong>${boton}
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
      </div>
      ${vista.falloEmpleados ? barraRoja([MENSAJE_FALLO_EMPLEADOS]) : ''}
      ${datos}
      ${htmlPagosQueCambiaron(ctx)}
      ${entrada.sinEnlazar ? htmlEnlace(ctx) : ''}
      ${htmlBloquePorPagar(ctx)}
      ${htmlBloqueAunNoEsFirme(ctx)}
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
    mensajePago: '', mensajeEnlace: '', enlazarEmpleadoId: '', enlazarPorcentaje: false, enCurso: null, ocupado: false,
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
      raiz.innerHTML = htmlListaDeComisiones(vista);
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
    parchearMarcado(raiz, resumenDeMarcadasDeComision(entrada, ui.marcados), { pagando: ui.pagando });
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
        aviso(r.tipo === 'ya-guardado' ? 'Ese pago ya estaba registrado.' : `Pago registrado: ${dinero(r.pago.monto)}.`, 'exito');
      }
      dibujar();
    } catch (error) {
      ui.mensajePago = mensajeSeguroDeComision(error, MENSAJE_COMISION_FALLO);
      dibujar();
    } finally {
      ui.ocupado = false;
    }
  }

  // ----- Enlazar las rentas viejas a un empleado de la lista -----
  async function enlazar() {
    if (ui.ocupado || !entrada?.sinEnlazar) return;
    const empleadoId = raiz.querySelector('#cm-enlazar-empleado')?.value ?? '';
    ui.enlazarEmpleadoId = empleadoId;
    ui.enlazarPorcentaje = Boolean(raiz.querySelector('#cm-enlazar-porcentaje')?.checked);
    const registro = vista.registros.find((e) => e.id === empleadoId);
    if (!registro) { ui.mensajeEnlace = 'Escoge a qué empleado de la lista corresponde.'; dibujar(); return; }
    // Solo las que no están pagadas pueden tomar otro porcentaje: lo ya pagado no se toca.
    const sinPagar = ui.enlazarPorcentaje ? rentasSinPagar(entrada.cuenta) : [];
    const cuantos = entrada.contratos.length;
    const delPorcentaje = sinPagar.length
      ? ` Además, en ${sinPagar.length} ${palabraRentas(sinPagar.length)} que aún no se han pagado el porcentaje pasa a ${textoDeLaTasa(registro.porcentajeComision)}.`
      : '';
    const pregunta = `¿Enlazar ${cuantos} ${cuantos === 1 ? 'renta' : 'rentas'} de «${entrada.nombre}» al empleado «${registro.nombre}»?${delPorcentaje} Esto no se puede deshacer desde el sistema.`;
    if (!window.confirm(pregunta)) return;
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
      actualizarMarcado();
    } else if (caja.matches?.('[data-cm="marcar-todas"]')) {
      // La casilla del encabezado marca o desmarca todas las que se pueden pagar, y cada casilla de fila la sigue.
      for (const fila of raiz.querySelectorAll('[data-cm="marcar"]')) {
        fila.checked = caja.checked;
        if (caja.checked) ui.marcados.add(fila.dataset.id);
        else ui.marcados.delete(fila.dataset.id);
      }
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
