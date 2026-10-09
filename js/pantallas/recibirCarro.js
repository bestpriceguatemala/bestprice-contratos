// Recibir el carro (§6 del diseño, "Recibir carro"): la pantalla que le
// faltaba al negocio. Hasta que existe, un contrato puede salir pero nunca
// volver, y cada renta se queda abierta para siempre.
//
// Es el espejo de sacarCarro.js: mismo layout de dos columnas (los bloques a
// la izquierda, el resumen fijo a la derecha), la misma forma de recalcular
// el cobro mientras se escribe, los mismos avisos en rojo arriba del botón
// de guardar, las mismas clases CSS — para que se sienta el mismo sistema.
//
// La regla del dueño que manda aquí es la de la garantía: el carro queda
// libre en el momento en que se guarda este cierre (estadoCarro, en
// nucleo/estados.js, ya lo decide solo por la fecha real de entrada), pero
// la garantía de la tarjeta NO se suelta aquí — eso es de liberarGarantia()
// (datos.js, Tarea 5), que se niega mientras haya saldo. Esta pantalla nunca
// escribe garantiaLiberada.
//
// Modo de solo cobro (Tarea 5, Paso 3): "Pendientes de cobro", en flota.js,
// abre esta misma pantalla para un contrato cuyo cierre ya está hecho (o que
// ni siquiera ha vuelto) — ahí lo único que falta es el abono, nunca volver a
// tocar el cierre. En ese modo no se dibuja el bloque "Al recibir el carro"
// (nada de fecha real, kilometraje, daños...) y guardar() nunca llama a
// construirCierre: agrega el pago directo sobre el contrato tal como está,
// para que un cierre ya hecho no se pueda reabrir ni reeditar por accidente
// desde aquí.
import { construirCierre, problemasDelCierre } from '../nucleo/cierre.js';
import { lineasDevolucion, resumen, horaTardiaDe } from '../nucleo/contrato.js';
import { q, textoEntero } from '../nucleo/dinero.js';
import { hoyISO } from '../nucleo/fechas.js';
import {
  cargarContrato, agregarPago, guardarContrato, cargarAjustes, CODIGO_GARANTIA_LIBERADA_CON_SALDO, CODIGO_COPIA_VIEJA,
} from '../datos.js';
import {
  dinero, fecha, aviso, hora24, bloquearEnterEnElFormulario,
} from '../ui.js';

// Mismo respaldo que PORCENTAJE_TARJETA_DEFECTO en sacarCarro.js: el campo
// del % de tarjeta arranca en este valor fijo por si cargarAjustes()
// (datos.js) todavía no contestó, y se actualiza al valor real en cuanto
// llega — salvo que el mostrador ya lo haya tocado a mano (ver
// `tarjetaTocada` más abajo). Sin este mecanismo, "Sacar carro" cobró de
// menos el 12 % durante un buen tiempo (hallazgo crítico de su revisión
// final) porque el campo nacía vacío y nadie lo llenaba a tiempo.
const PORCENTAJE_TARJETA_DEFECTO = 12;

// El texto libre que el mostrador escribe (detalle de daños, de varios, el
// lugar de entrada...) se escapa antes de entrar al HTML, igual que en
// sacarCarro.js y flota.js, para que un "&" o un "<" sueltos no rompan la
// pantalla.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * "Sacar carro" ya guarda el kilometraje de salida como `kmSalida` (ronda de
 * corrección 1 de esta tarea: antes lo guardaba como `kilometrajeSalida`,
 * un nombre distinto al que valida `problemasDelCierre` en nucleo/cierre.js,
 * y ningún contrato real disparaba el aviso de "el kilometraje retrocede").
 *
 * Este puente NO es el camino normal — es compatibilidad hacia atrás, solo
 * para los contratos que ya quedaron guardados con el nombre viejo antes de
 * ese cambio. Un contrato nuevo, guardado por la versión actual de "Sacar
 * carro", ya trae `kmSalida` puesto y esta función lo devuelve tal cual. No
 * se pisa un `kmSalida` que ya viniera puesto.
 */
export function conKmSalidaNormalizado(contrato) {
  if (!contrato) return contrato;
  if (contrato.kmSalida) return contrato;
  return { ...contrato, kmSalida: q(contrato.kilometrajeSalida) };
}

/**
 * Con qué valores arranca el bloque "Al recibir el carro": vacíos y la fecha
 * de hoy si el contrato todavía no tiene cierre, o el cierre YA GUARDADO,
 * completo, si el mostrador volvió a esta pantalla sobre un contrato que ya
 * se recibió — por ejemplo con el botón "atrás" del navegador después de
 * guardar (CRÍTICO de la revisión final).
 *
 * Antes esta pantalla no distinguía los dos casos: siempre arrancaba en
 * blanco con la fecha de hoy, así que reabrir un cierre ya hecho se veía
 * igual que recibir el carro por primera vez — con 32 días de atraso
 * inventados de la nada y lista para guardar `{fechaReal: hoy, danos: 0,
 * descuento: 0}` encima de los daños y el descuento que el dueño ya había
 * negociado. Al prellenar con el cierre real, esta misma pantalla se
 * convierte en la única forma de corregir un cierre mal tecleado — que hoy
 * no existía de ninguna otra manera.
 *
 * Se apoya en el spread de `contrato.cierre`: los mismos nombres de campo
 * que ya arma `construirCierre` (nucleo/cierre.js), así que un campo nuevo
 * que se agregue ahí algún día llega solo, sin tener que tocar esta función.
 * Función pura — nada de DOM ni de `location` — para poder probarla sola.
 */
export function valoresIniciales(contrato, hoy = hoyISO()) {
  const cierre = contrato?.cierre;
  if (!cierre?.fechaReal) return { fechaReal: hoy };
  return { ...cierre };
}

/**
 * El aviso de que esta pantalla está en modo de corrección, con la fecha en
 * que de verdad se recibió el carro — o `null` si el contrato todavía no
 * tiene cierre y esto es un "recibir carro" normal.
 */
export function textoCorreccion(contrato) {
  const fechaReal = contrato?.cierre?.fechaReal;
  if (!fechaReal) return null;
  return `Este contrato ya se recibió el ${fecha(fechaReal)} — estás corrigiendo el cierre.`;
}

/**
 * Con qué monto arranca el campo de pago, antes de que el mostrador lo
 * toque a mano: el saldo completo, salvo en modo de corrección puro.
 *
 * IMPORTANTE 3 de la revisión final: reabrir un cierre YA guardado (el
 * botón "atrás", o la ficha) para arreglar un dato — un kilometraje, una
 * nota — prellenaba este campo con el saldo completo igual que un "recibir
 * carro" nuevo. El botón dice "Guardar correcciones", así que guardar
 * corregía kilometraje/notas Y, sin que nadie lo pidiera, registraba un
 * pago del saldo entero — el dinero nunca entró a la caja pero el sistema
 * lo daba por cobrado y soltaba la garantía. Corregir un dato no es decidir
 * cobrar: en corrección, el campo arranca en 0, así que guardar() (más
 * abajo) no agrega ningún pago salvo que el mostrador escriba un monto él
 * mismo — eso enciende `montoPagoTocado` y este prellenado ya no lo pisa,
 * así que SÍ se puede seguir cobrando a propósito mientras se corrige.
 *
 * El modo de solo cobro es la excepción a esa excepción: ahí se abre la
 * pantalla justo para cobrar un saldo pendiente (el enlace "Pendientes de
 * cobro" de flota.js), aunque el contrato ya tenga cierre — por eso también
 * cuenta como "corrección" para `textoCorreccion`. Ahí SÍ se prellena con
 * el saldo completo: cobrar es la acción que el mostrador vino a hacer, no
 * un efecto colateral de guardar otra cosa.
 */
export function montoInicialPago(saldo, { enCorreccion, soloCobro }) {
  const sePrellena = soloCobro || !enCorreccion;
  return sePrellena && saldo > 0 ? q(saldo) : 0;
}

/**
 * Qué dice el botón de guardar, según cuánto se está por cobrar contra el
 * saldo. Sin nada que cobrar (el saldo ya está en cero o a favor del
 * cliente, o el monto quedó en cero) dice "Recibir carro": el carro vuelve,
 * y punto — nunca "Recibir sin cobrar".
 *
 * "Recibir sin cobrar" era justo la frase que confundió al dueño en el
 * incidente que motivó este cambio: sobre un contrato ya pagado por
 * completo, leía como "falta algo por cobrar" cuando en realidad no había
 * nada pendiente. Que el bloque de pago esté oculto en ese caso (ver
 * plantilla() más abajo) ya lo deja claro, pero el botón no puede seguir
 * diciendo lo contrario.
 */
export function textoBotonPago(saldo, monto) {
  const m = q(monto);
  if (saldo <= 0 || m <= 0) return 'Recibir carro';
  return m < saldo ? 'Recibir y abonar' : 'Recibir y cobrar';
}

/**
 * El texto plano de "no hay nada que cobrar", para cuando `saldo <= 0`: en
 * cero, dice que el contrato ya está pagado completo; negativo (un
 * sobrepago real, ver el comentario de saldo en resumen(), nucleo/contrato.js)
 * lo dice tal cual, en positivo y a favor del cliente — "nunca ajustar una
 * cifra para que cuadre" incluye no esconder ese número detrás de un
 * "pagado completo" que no sería cierto.
 */
export function textoEstadoPago(saldo) {
  const s = q(saldo);
  if (s < 0) return `Este contrato quedó con ${dinero(-s)} a favor del cliente.`;
  return 'Este contrato ya está pagado completo.';
}

/**
 * El aviso de que se está cobrando más de lo que el contrato debe — la
 * misma clase de error que dejó al dueño con Q4,800 de crédito a favor de un
 * cliente sin darse cuenta (el incidente que motivó esta pantalla). `null`
 * cuando no aplica (sin saldo pendiente, o el monto no pasa del saldo): es
 * un aviso, no un candado — se le deja escribir un monto mayor al saldo
 * (puede ser un abono grande a cuenta de la próxima renta, por ejemplo),
 * pero se le avisa antes de que pase sin darse cuenta.
 */
export function textoAvisoSobrecobro(saldo, monto) {
  const s = q(saldo);
  const m = q(monto);
  if (!(s > 0) || !(m > s)) return null;
  return `Estás cobrando ${dinero(m)} y solo te debe ${dinero(s)}. Van a quedar ${dinero(q(m - s))} a favor del cliente.`;
}

/**
 * El aviso final, con el número de contrato y lo que haya quedado pendiente.
 *
 * Con el saldo en negativo el cliente pagó de más (o una corrección le bajó la cuenta):
 * decir «recibido y cobrado» contradecía a la pantalla, que un instante antes decía «Este
 * contrato quedó con Q1,400.00 a favor del cliente». Se dice igual que ella (prueba del
 * sistema, 7 oct 2026).
 */
export function textoAvisoRecibido(numero, saldoRestante) {
  if (saldoRestante > 0) return `Contrato ${numero} recibido. Falta cobrar ${dinero(saldoRestante)}.`;
  if (saldoRestante < 0) return `Contrato ${numero} recibido. Quedaron ${dinero(-saldoRestante)} a favor del cliente.`;
  return `Contrato ${numero} recibido y cobrado.`;
}

/**
 * Lo que se le dice al mostrador cuando el cierre no se pudo guardar. Un fallo cualquiera
 * (la nube no contestó) se arregla intentando de nuevo. El rechazo por garantía ya liberada
 * NO: corregir hacia arriba el cierre de una renta cuya garantía ya se soltó la deja
 * debiendo, y `guardarContrato` se niega a guardar eso — por mucho que se reintente (prueba
 * del sistema, 7 oct 2026). Lo que sí funciona hoy es cobrar lo que falta en el mismo
 * guardado, así que eso es lo que se le dice. Función pura.
 */
export function textoFalloAlGuardarElCierre(error) {
  // El contrato cambió desde que se abrió esta pantalla (otra pestaña, otra computadora): la frase ya dice
  // que no se guardó nada y que hay que recargar. «Intenta de nuevo» no sirve, la copia en memoria sigue vieja.
  if (error?.codigo === CODIGO_COPIA_VIEJA) return error.message;
  if (error?.codigo === CODIGO_GARANTIA_LIBERADA_CON_SALDO) {
    return 'La garantía de esta renta ya está liberada y, con lo que corriges, quedaría debiendo: así no se puede guardar. '
      + 'Cobra lo que falta ahora mismo, escribiéndolo en «Monto sin recargo de tarjeta», y vuelve a guardar.';
  }
  return 'No se pudo guardar el cierre. Intenta de nuevo.';
}

/**
 * Lo que se le dice al mostrador cuando el abono (el modo de solo cobro, «Cobrar») no se pudo registrar.
 * Un fallo cualquiera se arregla intentando de nuevo; el rechazo porque el contrato cambió mientras tanto NO
 * (ver `textoFalloAlGuardarElCierre`): ahí hay que recargar, y la frase del rechazo ya lo dice. Función pura.
 */
export function textoFalloAlRegistrarElAbono(error) {
  if (error?.codigo === CODIGO_COPIA_VIEJA) return error.message;
  return 'No se pudo registrar el abono. Intenta de nuevo.';
}

/**
 * La fecha con que se anota un cobro hecho desde esta pantalla: el día en que el dinero entra.
 *
 * - Al recibir el carro por primera vez, la fecha de entrada (así se anota desde el principio,
 *   y un carro recibido «tarde» en el sistema conserva el día en que de verdad volvió).
 * - Al CORREGIR un cierre que ya estaba guardado, hoy: lo que se cobra en esa corrección entra
 *   ahora y no el día que dice el campo de fecha, que puede ser cualquiera —corregirla es justo
 *   el motivo de abrir la pantalla—. En la prueba del sistema (7 oct 2026) un cobro de Q1,400
 *   hecho hoy quedó fechado el 22 de octubre, un día que ni había llegado.
 * - En el modo de solo cobro, hoy.
 */
export function fechaDelCobro({ soloCobro, enCorreccion, campos, hoy }) {
  // En solo cobro la pantalla no dibuja el bloque del cierre y `campos` es null: la fecha de entrada
  // no se lee ni se necesita (un primer intento de esta función leía campos.fechaReal siempre y
  // reventaba el «Cobrar» de «Pendientes de cobro»: la pantalla dejaba de responder).
  return soloCobro || enCorreccion ? hoy : campos?.fechaReal;
}

/**
 * El renglón de "Pendientes de cobro" (flota.js) abre esta misma pantalla
 * pero en modo de solo cobro, agregando "?cobro=1" al final del id en el
 * enlace — el enrutador (router.js) empareja rutas por pedazos separados con
 * "/" y no sabe nada de parámetros de consulta, así que aquí se separa el id
 * real de ese sufijo antes de usarlo. Función pura, sin `location` ni DOM,
 * para poder probarla sola.
 */
export function leerParametroRuta(parametroRuta) {
  const [contratoId, consulta] = String(parametroRuta || '').split('?');
  const soloCobro = new URLSearchParams(consulta || '').get('cobro') === '1';
  return { contratoId, soloCobro };
}

/**
 * La nota del modo de solo cobro. «El cierre ya está hecho» solo es cierto si el carro
 * ya volvió: «Pendientes de cobro» (flota.js) también ofrece «Cobrar» en una renta que
 * sigue afuera con un saldo (la salida se pagó a medias), y ahí la pantalla afirmaba un
 * cierre que no existe (prueba del sistema, 7 oct 2026). Función pura.
 */
export function textoNotaDeSoloCobro(contrato) {
  return contrato?.cierre?.fechaReal
    ? 'El cierre de este contrato ya está hecho: aquí solo se registra el abono.'
    : 'Este carro todavía no se ha recibido: aquí solo se registra el abono. El cierre se hace al recibirlo.';
}

/** El aviso final del modo de solo cobro: nunca dice "recibido", el carro no se tocó aquí. */
export function textoAvisoCobro(numero, saldoRestante) {
  if (saldoRestante > 0) return `Abono registrado en el contrato ${numero}. Falta cobrar ${dinero(saldoRestante)}.`;
  // Cobrar de más ya avisó en rojo antes de guardar; el aviso final no lo borra con un «por completo».
  if (saldoRestante < 0) return `Abono registrado en el contrato ${numero}. Quedaron ${dinero(-saldoRestante)} a favor del cliente.`;
  return `Contrato ${numero} cobrado por completo.`;
}

/**
 * Cómo se rotula el saldo cuando sale negativo: un descuento grande o un
 * sobrepago puede dejar al negocio debiéndole al cliente (resumen(), en
 * nucleo/contrato.js, ya explica por qué ese número nunca se esconde detrás
 * de un cero). Se muestra en español llano y como un monto a favor, nunca
 * como un negativo que pareciera un cobro pendiente.
 */
export function textoSaldo(saldo) {
  return saldo < 0
    ? { etiqueta: 'A favor del cliente', monto: -saldo }
    : { etiqueta: 'Saldo', monto: saldo };
}

/**
 * Cuánto hay que cobrar AHORA MISMO por un pago de `monto` — con su recargo
 * de tarjeta si aplica — sobre un contrato que puede traer pagos previos
 * (el de la salida, por ejemplo). Ronda de corrección 1 (hallazgo crítico):
 * antes esta pantalla leía el recargo/total de `saldoConTarjeta`, que
 * siempre calcula sobre TODO el saldo pendiente — así que un abono parcial
 * pagado con tarjeta mostraba el costo de saldar TODO hoy, no el costo real
 * de ese abono. Un abono de Q500 al 12 % sobre un saldo de Q730 mostraba
 * Q817.60 (el total de los Q730 completos) en vez de los Q560.00 que de
 * verdad cuesta cobrar Q500 con tarjeta.
 *
 * La cuenta correcta no tiene una función propia en el núcleo (saldoConTarjeta
 * no sirve para un monto parcial), así que se arma un borrador con
 * `agregarPago` (pura, la misma que usa guardar()) y se lee cuánto sumó ese
 * pago a `pagado` (resumen) — la diferencia entre el acumulado antes y
 * después de agregarlo. Es el mismo truco de restar dos lecturas del núcleo
 * que ya usa sacarCarro.js para separar el recargo del monto sin recargo;
 * nunca se calcula el recargo a mano con conTarjeta()/recargoTarjeta() aquí.
 */
export function totalDeEstaCobranza(contratoConCierre, { monto, forma, porcentajeTarjeta, fecha }) {
  const montoNum = q(monto);
  if (!(montoNum > 0)) return { total: 0, recargo: 0 };
  const antes = resumen(contratoConCierre).pagado;
  const borrador = agregarPago(contratoConCierre, {
    monto: montoNum, forma, porcentajeTarjeta, fecha,
  });
  const total = q(resumen(borrador).pagado - antes);
  return { total, recargo: q(total - montoNum) };
}

/**
 * Lo que el formulario del cierre dice, leído con `texto` y `num` (los lectores
 * de campos de la pantalla). Es pura para poder probar el camino real: campo →
 * lectura → cierre, no solo la plantilla.
 *
 * La hora pasa por `hora24` AL LEER, y no solo al salir del campo (el evento
 * `change`): lo que se guarda en el cierre no puede depender de que ese evento
 * haya alcanzado a correr (Enter dentro del campo, según el navegador), y una
 * hora a medias ("9:") queda vacía en vez de volverse las 09:00.
 *
 * `fechaReal` NO se rellena con hoyISO() si el mostrador la borra a propósito:
 * problemasDelCierre necesita ver ese vacío tal cual para avisar «Falta la fecha
 * en que se recibió el carro.» Rellenarla aquí escondería justo el problema que
 * esa validación existe para mostrar.
 */
export function leerCamposDelCierre({ texto, num }) {
  return {
    fechaReal: texto('rc-fecha-real'),
    horaReal: hora24(texto('rc-hora-real')),
    lugarEntrada: texto('rc-lugar-entrada'),
    kmEntrada: num('rc-km-entrada'),
    combustible: num('rc-combustible'),
    danos: num('rc-danos'),
    danosDetalle: texto('rc-danos-detalle'),
    // La hora tardía se escribe aquí, al recibir el carro, y no al sacarlo: el
    // dueño la cobra «solo al devolver». Es un monto, y entra al total de la
    // devolución (lineasDevolucion).
    horaTardia: num('rc-hora-tardia'),
    varios: num('rc-varios'),
    variosDetalle: texto('rc-varios-detalle'),
    descuento: num('rc-descuento'),
  };
}

// ---------- La plantilla (se arma una sola vez, con el contrato ya cargado) ----------

function campo(id, etiqueta, opciones = {}) {
  const { tipo = 'text', paso, minimo, valor = '', marcador, numerico } = opciones;
  const attrs = [
    paso !== undefined && `step="${paso}"`,
    minimo !== undefined && `min="${minimo}"`,
    marcador !== undefined && `placeholder="${esc(marcador)}"`,
    // El teclado numérico del teléfono y la tablet, sin volverlo type=number:
    // la hora lleva dos puntos, y un campo numérico no los deja escribir.
    numerico && 'inputmode="numeric"',
  ].filter(Boolean).join(' ');
  return `
    <label class="sc-campo">${esc(etiqueta)}
      <input type="${tipo}" id="${id}" value="${esc(valor)}" ${attrs}>
    </label>`;
}

// Se exporta solo para probar qué campos dibuja y con qué valores arranca.
export function plantilla(contrato, soloCobro) {
  const pagadoSalida = resumen(contrato).pagado;
  const encabezado = [contrato.carroDescripcion, contrato.carroPlacas].filter(Boolean).join(' · ');

  // Modo de corrección (CRÍTICO de la revisión final): el contrato ya tiene
  // un cierre guardado, así que esto no es "recibir carro" por primera vez —
  // es corregir uno mal tecleado. `iniciales` trae ese cierre completo (ver
  // valoresIniciales más arriba) para prellenar cada campo con lo que de
  // verdad se guardó, en vez de arrancar en blanco listo para pisarlo.
  const enCorreccion = Boolean(textoCorreccion(contrato));
  const iniciales = valoresIniciales(contrato);
  // La hora tardía ya guardada en el cierre, leída por horaTardiaDe (el único
  // que sabe que un `true` viejo no es un monto) y no de `iniciales`. Vacía, y
  // no «0», cuando no hay ninguna: un recibir nuevo no debe arrancar con un 0
  // escrito. Un contrato que trae la hora tardía en la salida (formas viejas)
  // tampoco la trae aquí: esa ya está en su total de la salida.
  const horaTardiaGuardada = horaTardiaDe(contrato).alRecibir || '';

  // Modo de solo cobro: el bloque "Al recibir el carro" no se dibuja en
  // absoluto (ni fecha real, ni kilometraje, ni daños) — no hay nada de eso
  // que reeditar aquí, el cierre ya está hecho (o el carro ni ha vuelto, si
  // el abono viene de un contrato que aún anda afuera con saldo pendiente).
  const bloqueCierre = soloCobro ? '' : `
        <section class="sc-bloque">
          <h2>${enCorreccion ? esc(textoCorreccion(contrato)) : 'Al recibir el carro'}</h2>
          <div class="sc-campos">
            ${campo('rc-fecha-real', 'Fecha real de entrada', { tipo: 'date', valor: iniciales.fechaReal })}
            ${campo('rc-hora-real', 'Hora real de entrada (24 h)', { marcador: 'HH:MM', numerico: true, valor: iniciales.horaReal })}
            ${campo('rc-lugar-entrada', 'Lugar de entrada', { valor: iniciales.lugarEntrada })}
            ${campo('rc-km-entrada', 'Kilometraje de entrada', { tipo: 'number', paso: '1', minimo: '0', valor: iniciales.kmEntrada })}
            ${campo('rc-combustible', 'Combustible (monto a cobrar)', { tipo: 'number', paso: '0.01', minimo: '0', valor: iniciales.combustible })}
            ${campo('rc-danos', 'Daños', { tipo: 'number', paso: '0.01', minimo: '0', valor: iniciales.danos })}
            ${campo('rc-danos-detalle', 'Daños — detalle', { valor: iniciales.danosDetalle })}
            ${campo('rc-hora-tardia', 'Hora tardía — precio', { tipo: 'number', paso: '0.01', minimo: '0', valor: horaTardiaGuardada })}
            ${campo('rc-varios', 'Varios', { tipo: 'number', paso: '0.01', minimo: '0', valor: iniciales.varios })}
            ${campo('rc-varios-detalle', 'Varios — detalle', { valor: iniciales.variosDetalle })}
            ${campo('rc-descuento', 'Descuento', { tipo: 'number', paso: '0.01', minimo: '0', valor: iniciales.descuento })}
          </div>
          <p class="sc-nota">
            El combustible se escribe a mano, como un monto a cobrar: el sistema no lo calcula por nivel de tanque.
          </p>
        </section>`;

  // novalidate: igual que en sacarCarro.js, la validación nativa del
  // navegador sale en su propio idioma; problemasDelCierre (en rojo, arriba
  // del botón) es la que de verdad habla con el mostrador.
  return `
    <form id="rc-form" class="sacar-carro" novalidate>
      <div class="sc-bloques">

        <section class="sc-bloque">
          <h2>Contrato N.° ${esc(contrato.numero ?? '—')}</h2>
          <div class="sc-carro-info">
            <strong>${esc(contrato.clienteNombre || 'Cliente sin nombre')}</strong>
            ${esc(encabezado || 'Sin datos del carro')}<br>
            Fecha de salida: ${esc(fecha(contrato.fechaSalida) || '—')}<br>
            Devolución prevista: ${esc(fecha(contrato.devolucionPrevista) || '—')}<br>
            Kilometraje de salida: ${esc(textoEntero(contrato.kmSalida))}<br>
            Pagado hasta ahora: ${esc(dinero(pagadoSalida))}
          </div>
          ${soloCobro ? `<p class="sc-nota">${esc(textoNotaDeSoloCobro(contrato))}</p>` : ''}
        </section>
${bloqueCierre}
      </div>

      <aside class="sc-resumen">
        <h2>${soloCobro ? 'Cobro' : 'Detalle del cierre'}</h2>
        <ul id="rc-lineas" class="sc-lineas"><li class="sc-vacio">Todavía no hay nada que cobrar.</li></ul>

        <!--
          Tarea "cobro-claro": lo que el dueño pidió fue "decime cuánto ya
          pagó el cliente Y TIRAME ALERTA SOLO SI ME DEBE ALGO MÁS". "Ya
          pagó" se ve siempre, prominente; "Falta cobrar" (rojo) es la ÚNICA
          alerta de dinero de toda esta pantalla y solo existe si de verdad
          queda saldo; sin saldo, se dice tal cual (textoEstadoPago, arriba)
          y el bloque de cobro entero desaparece — nada que cobrar, nada que
          mostrar sobre cobrar.
        -->
        <div class="sc-total-linea">
          <strong>Ya pagó</strong>
          <span id="rc-ya-pago">${dinero(pagadoSalida)}</span>
        </div>
        <p class="carro-atraso" id="rc-falta-cobrar" hidden></p>
        <p class="sc-nota" id="rc-estado-pago" hidden></p>

        <div id="rc-bloque-cobro">
          <div class="sc-garantia-linea" id="rc-recargo-linea" hidden>
            <span>Recargo de tarjeta</span>
            <strong id="rc-recargo">Q0.00</strong>
          </div>
          <div class="sc-total-linea">
            <strong>Total a cobrar</strong>
            <span id="rc-total">Q0.00</span>
          </div>

          <div class="sc-campos">
            <label class="sc-campo">Monto sin recargo de tarjeta
              <input type="number" id="rc-pago-monto" step="0.01" min="0">
            </label>
            <label class="sc-campo">Forma de pago
              <select id="rc-pago-forma">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
            <label class="sc-campo" id="rc-pago-porcentaje-campo" hidden>% de tarjeta
              <input type="number" id="rc-pago-porcentaje" step="0.01" min="0" value="${PORCENTAJE_TARJETA_DEFECTO}">
            </label>
          </div>
        </div>

        <ul id="rc-problemas" class="sc-avisos-lista"></ul>

        <button type="submit" id="rc-guardar" class="btn btn-primario">${soloCobro ? 'Cobrar' : (enCorreccion ? 'Guardar correcciones' : 'Recibir y cobrar')}</button>
      </aside>
    </form>`;
}

function filaLinea(l) {
  const detalle = l.detalle ? ` <small>${esc(l.detalle)}</small>` : '';
  return `<li><span>${esc(l.concepto)}${detalle}</span><strong>${dinero(l.monto)}</strong></li>`;
}

const PREFIJO_RUTA = '#/recibir/';
let ultimoToken = 0;

/** Dibuja "Recibir carro" dentro de `contenedor`, para el contrato `contratoId` (o `id?cobro=1`). */
export async function pintarRecibirCarro(contenedor, parametroRuta) {
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith(PREFIJO_RUTA) && miToken === ultimoToken;
  const { contratoId, soloCobro } = leerParametroRuta(parametroRuta);

  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';

  // cargarContrato (datos.js) devuelve `null` cuando el contrato de verdad
  // no existe, pero puede rechazar cuando la nube no contesta a tiempo y no
  // hay copia local (conLimiteDeTiempo). Las dos cosas se muestran distinto
  // — nunca como si todo estuviera bien: un cierre a medio construir sobre
  // un contrato que no se pudo leer sería "ajustar la pantalla para que
  // cuadre" con datos que no existen.
  let contrato = null;
  let fallo = false;
  try {
    contrato = await cargarContrato(contratoId);
  } catch {
    fallo = true;
  }
  if (!sigoVigente()) return;

  if (fallo) {
    contenedor.innerHTML = `<div class="barra-lectura-fallida"><p>No se pudo leer este contrato. Revisa tu conexión e intenta de nuevo.</p></div>`;
    return;
  }
  if (!contrato) {
    contenedor.innerHTML = `<div class="barra-lectura-fallida"><p>No se encontró el contrato ${esc(contratoId)}.</p></div>`;
    return;
  }

  contrato = conKmSalidaNormalizado(contrato);
  // CRÍTICO de la revisión final: si el contrato ya tiene un cierre guardado
  // (por ejemplo, el botón "atrás" del navegador volvió aquí después de
  // guardar), esto es un modo de corrección, no un "recibir carro" nuevo —
  // ver valoresIniciales/textoCorreccion más arriba.
  const enCorreccion = Boolean(textoCorreccion(contrato));

  let tarjetaTocada = false;
  let montoPagoTocado = false;
  let guardando = false;

  contenedor.innerHTML = plantilla(contrato, soloCobro);

  const el = (id) => document.getElementById(id);
  const val = (id) => el(id)?.value ?? '';
  const num = (id) => q(val(id));
  const texto = (id) => val(id).trim();

  function leerCampos() {
    return leerCamposDelCierre({ texto, num });
  }

  function recalcular() {
    // Modo de solo cobro: nunca se pasa por construirCierre — no hay campos
    // de cierre en pantalla que leer, y el contrato se usa tal cual está
    // guardado (con su cierre, si ya lo tiene, o sin él si el carro sigue
    // afuera). Es lo que impide que este modo reabra o reedite un cierre ya
    // hecho (Tarea 5, punto 4).
    const campos = soloCobro ? null : leerCampos();
    const pagadoSalida = resumen(contrato).pagado;
    const contratoActual = soloCobro ? contrato : construirCierre(contrato, campos);

    // Cada figura de dinero en esta pantalla sale de lineasDevolucion,
    // resumen o agregarPago (nucleo/contrato.js y datos.js) — nunca de una
    // cuenta hecha aquí mismo con los campos del formulario.
    const lineas = lineasDevolucion(contratoActual);
    el('rc-lineas').innerHTML = [
      `<li><span>Pagado hasta ahora</span><strong>${dinero(pagadoSalida)}</strong></li>`,
      ...lineas.map(filaLinea),
    ].join('');

    // "Saldo" es lo que se debe ANTES de este pago (lo que dice la hoja
    // CIERRE); nunca se toca con lo que se está por cobrar ahora mismo.
    const { saldo } = resumen(contratoActual);

    // El incidente que motivó esta pantalla: "Ya pagó" siempre se ve, sin
    // ambigüedad; "Falta cobrar" (rojo) es la ÚNICA alerta de dinero de toda
    // la pantalla y solo aparece si de verdad queda saldo. Sin saldo
    // pendiente no hay nada que cobrar: se dice tal cual con
    // textoEstadoPago() (pagado completo, o a favor del cliente si quedó
    // negativo) y el bloque de cobro entero —monto, forma de pago, % de
    // tarjeta, recargo, total— se oculta completo, no solo se deshabilita.
    el('rc-ya-pago').textContent = dinero(pagadoSalida);
    const hayAlgoQueCobrar = saldo > 0;
    el('rc-falta-cobrar').hidden = !hayAlgoQueCobrar;
    if (hayAlgoQueCobrar) el('rc-falta-cobrar').textContent = `Falta cobrar: ${dinero(saldo)}`;
    el('rc-estado-pago').hidden = hayAlgoQueCobrar;
    if (!hayAlgoQueCobrar) el('rc-estado-pago').textContent = textoEstadoPago(saldo);
    el('rc-bloque-cobro').hidden = !hayAlgoQueCobrar;

    // El monto a cobrar arranca en el saldo completo (o en 0 si no hay nada
    // que cobrar, o si esto es una corrección — ver montoInicialPago más
    // arriba) y sigue ese valor mientras el mostrador no lo haya tocado a
    // mano — el mismo mecanismo de "montoPagoTocado" que sacarCarro.js, para
    // que un abono a medio escribir nunca se pise con el recálculo.
    if (!montoPagoTocado) el('rc-pago-monto').value = montoInicialPago(saldo, { enCorreccion, soloCobro });

    const formaPago = texto('rc-pago-forma') || 'efectivo';
    const pctTarjeta = num('rc-pago-porcentaje');
    const montoField = num('rc-pago-monto');

    // Ronda de corrección 1 (hallazgo crítico): el recargo y el total de
    // ESTA cobranza ya NO salen de saldoConTarjeta(contratoConCierre, ...) —
    // esa función siempre calcula el recargo sobre TODO el saldo pendiente,
    // así que un abono de Q500 con tarjeta mostraba el recargo de saldar
    // los Q730 completos (Q87.60) en vez del recargo real de Q500 (Q60.00):
    // el dueño hubiera cobrado de más en su propia terminal. Ver
    // totalDeEstaCobranza() más arriba para el porqué del cálculo.
    const { total: totalEstaCobranza, recargo: recargoEstaCobranza } = totalDeEstaCobranza(contratoActual, {
      monto: montoField,
      forma: formaPago,
      porcentajeTarjeta: formaPago === 'tarjeta' ? pctTarjeta : 0,
      fecha: fechaDelCobro({ soloCobro, enCorreccion, campos, hoy: hoyISO() }),
    });

    const hayCobroAhora = montoField > 0;
    const esTarjeta = hayCobroAhora && formaPago === 'tarjeta';
    el('rc-recargo-linea').hidden = !esTarjeta;
    if (esTarjeta) el('rc-recargo').textContent = dinero(recargoEstaCobranza);
    el('rc-total').textContent = dinero(hayCobroAhora ? totalEstaCobranza : 0);

    // El aviso de cobrar de más (textoAvisoSobrecobro, más arriba): el mismo
    // error que dejó al dueño con Q4,800 de crédito a favor de un cliente sin
    // darse cuenta. Se ve en rojo, junto a los demás problemas, pero NUNCA
    // cuenta para deshabilitar el botón — es un aviso, no un candado: el
    // mostrador puede de verdad querer cobrar de más (a cuenta de la próxima
    // renta, por ejemplo) y decide él, con el número ya puesto enfrente.
    const avisoSobrecobro = textoAvisoSobrecobro(saldo, montoField);
    const avisoSobrecobroHTML = avisoSobrecobro ? [`<li class="nivel-alto">${esc(avisoSobrecobro)}</li>`] : [];

    if (soloCobro) {
      // Sin cierre que validar, lo único que puede impedir el cobro es que
      // ya no quede saldo (por ejemplo, otro cobro desde otra pestaña justo
      // antes de que este formulario se guardara).
      el('rc-guardar').textContent = 'Cobrar';
      const problemas = saldo <= 0 ? ['Este contrato ya no tiene saldo pendiente.'] : [];
      el('rc-problemas').innerHTML = [
        ...problemas.map((m) => `<li class="nivel-alto">${esc(m)}</li>`),
        ...avisoSobrecobroHTML,
      ].join('');
      el('rc-guardar').disabled = problemas.length > 0 || guardando || !(montoField > 0);
      return;
    }

    // En modo de corrección el botón siempre dice "Guardar correcciones":
    // aquí no se está "recibiendo" el carro (ya volvió hace rato), así que
    // "Recibir y cobrar"/"Recibir y abonar" contarían una historia que no es.
    el('rc-guardar').textContent = enCorreccion ? 'Guardar correcciones' : textoBotonPago(saldo, montoField);

    // Los problemas de problemasDelCierre (nucleo/cierre.js) van en rojo,
    // justo arriba del botón, y mientras haya alguno el botón no guarda. El
    // aviso de sobrecobro se ve en el mismo lugar pero nunca se suma a ellos.
    const problemas = problemasDelCierre(contrato, campos, hoyISO());
    el('rc-problemas').innerHTML = [
      ...problemas.map((m) => `<li class="nivel-alto">${esc(m)}</li>`),
      ...avisoSobrecobroHTML,
    ].join('');
    el('rc-guardar').disabled = problemas.length > 0 || guardando;
  }

  /**
   * El guardado del modo de solo cobro: agrega el abono directo sobre
   * `contrato` (nunca sobre un `construirCierre` nuevo) y guarda — el cierre
   * que ya traía el contrato queda intacto, tal como llegó de la nube.
   */
  async function guardarSoloCobro() {
    const montoField = num('rc-pago-monto');
    if (!(montoField > 0)) return; // el botón ya debería estar deshabilitado

    guardando = true;
    recalcular();
    try {
      const formaPago = texto('rc-pago-forma') || 'efectivo';
      const pctTarjeta = num('rc-pago-porcentaje');
      const contratoConPago = agregarPago(contrato, {
        monto: montoField,
        forma: formaPago,
        porcentajeTarjeta: formaPago === 'tarjeta' ? pctTarjeta : 0,
        fecha: hoyISO(),
      });
      const guardado = await guardarContrato(contratoConPago);
      const saldoRestante = resumen(guardado).saldo;
      aviso(textoAvisoCobro(guardado.numero, saldoRestante), saldoRestante === 0 ? 'exito' : 'info');
      location.hash = '#/flota';
    } catch (error) {
      aviso(textoFalloAlRegistrarElAbono(error), 'error');
    } finally {
      guardando = false;
      recalcular();
    }
  }

  async function guardar(ev) {
    ev.preventDefault();
    if (guardando) return;

    if (soloCobro) {
      await guardarSoloCobro();
      return;
    }

    const campos = leerCampos();
    if (problemasDelCierre(contrato, campos, hoyISO()).length) {
      // El botón ya debería estar deshabilitado en este caso; esto es solo
      // el segundo candado, por si algo lo dejó pasar (Enter en un campo,
      // por ejemplo).
      aviso('Revisa los problemas marcados en rojo antes de guardar.', 'error');
      return;
    }

    guardando = true;
    recalcular();
    try {
      // construirCierre arma lo que se guarda a partir de TODO lo que ya
      // traía el contrato — nunca se listan los campos a mano, así ninguno
      // se cae en el camino (como pasó antes con variosDetalle).
      const contratoConCierre = construirCierre(contrato, campos);

      const montoField = num('rc-pago-monto');
      const formaPago = texto('rc-pago-forma') || 'efectivo';
      const pctTarjeta = num('rc-pago-porcentaje');

      // agregarPago (datos.js) es pura y ya decide si el monto de verdad
      // suma algo (ignora vacíos, ceros y negativos): "Recibir sin cobrar"
      // no necesita su propio camino aparte. El contrato SIEMPRE se guarda
      // aquí abajo con guardarContrato — con o sin cobro — porque lo que
      // cambió es el cierre completo, no solo un pago.
      const contratoConPago = montoField > 0
        ? agregarPago(contratoConCierre, {
          monto: montoField,
          forma: formaPago,
          porcentajeTarjeta: formaPago === 'tarjeta' ? pctTarjeta : 0,
          fecha: fechaDelCobro({ soloCobro: false, enCorreccion, campos, hoy: hoyISO() }),
        })
        : contratoConCierre;

      const guardado = await guardarContrato(contratoConPago);
      const saldoRestante = resumen(guardado).saldo;
      // "Recibido y cobrado" sí es una buena noticia completa ('exito'),
      // pero "recibido, falta cobrar Qxxx" no lo es del todo — el carro ya
      // volvió, pero todavía queda una deuda abierta. Un nivel más plano
      // ('info') evita que un pendiente se vea celebrado en verde.
      aviso(textoAvisoRecibido(guardado.numero, saldoRestante), saldoRestante === 0 ? 'exito' : 'info');
      location.hash = '#/flota';
    } catch (error) {
      aviso(textoFalloAlGuardarElCierre(error), 'error');
    } finally {
      guardando = false;
      recalcular();
    }
  }

  el('rc-form').addEventListener('input', (ev) => {
    if (ev.target.id === 'rc-pago-monto') montoPagoTocado = true;
    if (ev.target.id === 'rc-pago-porcentaje') tarjetaTocada = true;
    recalcular();
  });
  el('rc-form').addEventListener('change', (ev) => {
    // La hora se normaliza al salir del campo, no mientras escribe: corregirle
    // el texto tecla por tecla le movería el cursor bajo los dedos. Al salir,
    // "1345" o "9:5" ya quedan como 13:45 y 09:05. Lo que no sea una hora
    // válida se borra en vez de dejarse a medias — "9:" en el contrato
    // impreso sería una hora falsa.
    if (ev.target.id === 'rc-hora-real') ev.target.value = hora24(ev.target.value);
    if (ev.target.id === 'rc-pago-forma') {
      el('rc-pago-porcentaje-campo').hidden = texto('rc-pago-forma') !== 'tarjeta';
    }
    recalcular();
  });
  el('rc-form').addEventListener('submit', guardar);
  // Enter dentro de un campo envía el formulario, y aquí enviarlo RECIBE el carro y
  // COBRA el saldo, que arranca prellenado en el monto: apretar Enter para pasar al
  // campo siguiente —como en una hoja de cálculo— registraba un pago que nadie hizo
  // (prueba del sistema, 7 oct 2026). Para recibir hay que apretar el botón.
  // En el modo de solo cobro no hace falta: esa pantalla existe para cobrar, el monto
  // es lo único que se escribe y Enter ahí es la forma de confirmarlo a propósito.
  if (!soloCobro) bloquearEnterEnElFormulario(el('rc-form'));

  recalcular();

  // El % de tarjeta arranca en PORCENTAJE_TARJETA_DEFECTO (por si la nube
  // tarda) y se actualiza al valor real de cargarAjustes() en cuanto llega,
  // salvo que el mostrador ya lo haya tocado a mano — el mismo candado de
  // "tarjetaTocada" que sacarCarro.js, para que su propio valor escrito
  // nunca se pise con una lectura que llega tarde.
  const ajustes = await cargarAjustes();
  if (!sigoVigente()) return;
  if (!tarjetaTocada && ajustes.porcentajeTarjeta !== undefined) {
    el('rc-pago-porcentaje').value = ajustes.porcentajeTarjeta;
  }
  recalcular();
}
