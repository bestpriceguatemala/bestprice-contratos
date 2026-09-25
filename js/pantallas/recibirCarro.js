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
import { construirCierre, problemasDelCierre } from '../nucleo/cierre.js';
import { lineasDevolucion, resumen, saldoConTarjeta } from '../nucleo/contrato.js';
import { q, textoDosDecimales } from '../nucleo/dinero.js';
import { hoyISO } from '../nucleo/fechas.js';
import {
  cargarContrato, agregarPago, guardarContrato, cargarAjustes,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';

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
 * "Sacar carro" (Tarea 11) guarda el kilometraje de salida bajo el nombre
 * `kilometrajeSalida`, pero el cierre (nucleo/cierre.js, y su prueba en
 * pruebas/cierre.test.mjs) valida el retroceso del kilometraje contra
 * `contrato.kmSalida` — así se llamó ese campo en el diseño original de
 * este cierre. Sin este puente, ningún contrato real dispararía jamás el
 * aviso de "el kilometraje retrocede": `kmSalida` llegaría vacío y
 * problemasDelCierre se saltaría la validación en silencio, exactamente el
 * mismo tipo de trampa que "un default que nunca llega". No se pisa un
 * `kmSalida` que ya viniera puesto (por ejemplo, si algún día "Sacar carro"
 * se corrige para guardarlo con ese nombre).
 */
export function conKmSalidaNormalizado(contrato) {
  if (!contrato) return contrato;
  if (contrato.kmSalida) return contrato;
  return { ...contrato, kmSalida: q(contrato.kilometrajeSalida) };
}

/**
 * Qué dice el botón de guardar, según cuánto se está por cobrar contra el
 * saldo. Sin nada que cobrar (el saldo ya está en cero o a favor del
 * cliente, o el monto quedó en cero) dice "Recibir sin cobrar": el carro
 * vuelve igual, el contrato se queda pendiente de saldo.
 */
export function textoBotonPago(saldo, monto) {
  const m = q(monto);
  if (saldo <= 0 || m <= 0) return 'Recibir sin cobrar';
  return m < saldo ? 'Recibir y abonar' : 'Recibir y cobrar';
}

/** El aviso final, con el número de contrato y lo que haya quedado pendiente. */
export function textoAvisoRecibido(numero, saldoRestante) {
  return saldoRestante > 0
    ? `Contrato ${numero} recibido. Falta cobrar ${dinero(saldoRestante)}.`
    : `Contrato ${numero} recibido y cobrado.`;
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

// ---------- La plantilla (se arma una sola vez, con el contrato ya cargado) ----------

function campo(id, etiqueta, opciones = {}) {
  const { tipo = 'text', paso, minimo, valor = '' } = opciones;
  const attrs = [
    paso !== undefined && `step="${paso}"`,
    minimo !== undefined && `min="${minimo}"`,
  ].filter(Boolean).join(' ');
  return `
    <label class="sc-campo">${esc(etiqueta)}
      <input type="${tipo}" id="${id}" value="${esc(valor)}" ${attrs}>
    </label>`;
}

function plantilla(contrato) {
  const pagadoSalida = resumen(contrato).pagado;
  const encabezado = [contrato.carroDescripcion, contrato.carroPlacas].filter(Boolean).join(' · ');

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
            Kilometraje de salida: ${esc(textoDosDecimales(contrato.kilometrajeSalida))}<br>
            Ya pagó al salir: ${esc(dinero(pagadoSalida))}
          </div>
        </section>

        <section class="sc-bloque">
          <h2>Al recibir el carro</h2>
          <div class="sc-campos">
            ${campo('rc-fecha-real', 'Fecha real de entrada', { tipo: 'date', valor: hoyISO() })}
            ${campo('rc-hora-real', 'Hora real de entrada', { tipo: 'time' })}
            ${campo('rc-lugar-entrada', 'Lugar de entrada')}
            ${campo('rc-km-entrada', 'Kilometraje de entrada', { tipo: 'number', paso: '1', minimo: '0' })}
            ${campo('rc-combustible', 'Combustible (monto a cobrar)', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('rc-danos', 'Daños', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('rc-danos-detalle', 'Daños — detalle')}
            ${campo('rc-varios', 'Varios', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('rc-varios-detalle', 'Varios — detalle')}
            ${campo('rc-descuento', 'Descuento', { tipo: 'number', paso: '0.01', minimo: '0' })}
          </div>
          <p class="sc-nota">
            El combustible se escribe a mano, como un monto a cobrar: el sistema no lo calcula por nivel de tanque.
          </p>
        </section>

      </div>

      <aside class="sc-resumen">
        <h2>Detalle del cierre</h2>
        <ul id="rc-lineas" class="sc-lineas"><li class="sc-vacio">Todavía no hay nada que cobrar.</li></ul>

        <div class="sc-garantia-linea">
          <span id="rc-saldo-etiqueta">Saldo</span>
          <strong id="rc-saldo">Q0.00</strong>
        </div>
        <div class="sc-garantia-linea" id="rc-recargo-linea" hidden>
          <span>Recargo de tarjeta</span>
          <strong id="rc-recargo">Q0.00</strong>
        </div>
        <div class="sc-total-linea">
          <strong>Total a cobrar</strong>
          <span id="rc-total">Q0.00</span>
        </div>

        <div class="sc-campos">
          <label class="sc-campo">Monto a cobrar
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

        <ul id="rc-problemas" class="sc-avisos-lista"></ul>

        <button type="submit" id="rc-guardar" class="btn btn-primario">Recibir y cobrar</button>
      </aside>
    </form>`;
}

function filaLinea(l) {
  const detalle = l.detalle ? ` <small>${esc(l.detalle)}</small>` : '';
  return `<li><span>${esc(l.concepto)}${detalle}</span><strong>${dinero(l.monto)}</strong></li>`;
}

const PREFIJO_RUTA = '#/recibir/';
let ultimoToken = 0;

/** Dibuja "Recibir carro" dentro de `contenedor`, para el contrato `contratoId`. */
export async function pintarRecibirCarro(contenedor, contratoId) {
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith(PREFIJO_RUTA) && miToken === ultimoToken;

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

  let tarjetaTocada = false;
  let montoPagoTocado = false;
  let guardando = false;

  contenedor.innerHTML = plantilla(contrato);

  const el = (id) => document.getElementById(id);
  const val = (id) => el(id)?.value ?? '';
  const num = (id) => q(val(id));
  const texto = (id) => val(id).trim();

  function leerCampos() {
    // fechaReal NO se rellena con hoyISO() si el mostrador la borra a
    // propósito: problemasDelCierre necesita ver ese vacío tal cual para
    // avisar "Falta la fecha en que se recibió el carro." Rellenarla aquí
    // escondería justo el problema que esa validación existe para mostrar.
    return {
      fechaReal: texto('rc-fecha-real'),
      horaReal: texto('rc-hora-real'),
      lugarEntrada: texto('rc-lugar-entrada'),
      kmEntrada: num('rc-km-entrada'),
      combustible: num('rc-combustible'),
      danos: num('rc-danos'),
      danosDetalle: texto('rc-danos-detalle'),
      varios: num('rc-varios'),
      variosDetalle: texto('rc-varios-detalle'),
      descuento: num('rc-descuento'),
    };
  }

  function recalcular() {
    const campos = leerCampos();
    const pagadoSalida = resumen(contrato).pagado;
    const contratoConCierre = construirCierre(contrato, campos);

    // Cada figura de dinero en esta pantalla sale de lineasDevolucion,
    // resumen o saldoConTarjeta (nucleo/contrato.js) — nunca de una cuenta
    // hecha aquí mismo con los campos del formulario.
    const lineas = lineasDevolucion(contratoConCierre);
    el('rc-lineas').innerHTML = [
      `<li><span>Ya pagó al salir</span><strong>${dinero(pagadoSalida)}</strong></li>`,
      ...lineas.map(filaLinea),
    ].join('');

    const formaPago = texto('rc-pago-forma') || 'efectivo';
    const pctTarjeta = num('rc-pago-porcentaje');
    const { saldo, recargo, total } = saldoConTarjeta(contratoConCierre, pctTarjeta);

    const { etiqueta, monto: montoSaldo } = textoSaldo(saldo);
    el('rc-saldo-etiqueta').textContent = etiqueta;
    el('rc-saldo').textContent = dinero(montoSaldo);

    // El recargo y el total con tarjeta solo tienen sentido cuando de
    // verdad hay algo que cobrar (saldo positivo): con saldo en cero o a
    // favor del cliente, "cuánto costaría con tarjeta" no significa nada.
    const hayQueCobrar = saldo > 0;
    const esTarjeta = hayQueCobrar && formaPago === 'tarjeta';
    el('rc-recargo-linea').hidden = !esTarjeta;
    if (esTarjeta) el('rc-recargo').textContent = dinero(recargo);
    el('rc-total').textContent = dinero(hayQueCobrar ? (esTarjeta ? total : saldo) : 0);

    // El monto a cobrar arranca en el saldo completo (o en 0 si no hay nada
    // que cobrar) y sigue ese valor mientras el mostrador no lo haya tocado
    // a mano — el mismo mecanismo de "montoPagoTocado" que sacarCarro.js,
    // para que un abono a medio escribir nunca se pise con el recálculo.
    if (!montoPagoTocado) el('rc-pago-monto').value = hayQueCobrar ? saldo : 0;

    const montoField = num('rc-pago-monto');
    el('rc-guardar').textContent = textoBotonPago(saldo, montoField);

    // Los problemas de problemasDelCierre (nucleo/cierre.js) van en rojo,
    // justo arriba del botón, y mientras haya alguno el botón no guarda.
    const problemas = problemasDelCierre(contrato, campos);
    el('rc-problemas').innerHTML = problemas.map((m) => `<li class="nivel-alto">${esc(m)}</li>`).join('');
    el('rc-guardar').disabled = problemas.length > 0 || guardando;
  }

  async function guardar(ev) {
    ev.preventDefault();
    if (guardando) return;

    const campos = leerCampos();
    if (problemasDelCierre(contrato, campos).length) {
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
      // no necesita su propio camino aparte.
      //
      // A propósito NO se usa registrarPago aquí: esa función se salta el
      // guardado entero cuando el pago no suma nada, y aquí el contrato
      // SIEMPRE tiene que guardarse — con o sin cobro — porque lo que
      // cambió es el cierre completo, no solo un pago.
      const contratoConPago = montoField > 0
        ? agregarPago(contratoConCierre, {
          monto: montoField,
          forma: formaPago,
          porcentajeTarjeta: formaPago === 'tarjeta' ? pctTarjeta : 0,
          fecha: campos.fechaReal,
        })
        : contratoConCierre;

      const guardado = await guardarContrato(contratoConPago);
      const saldoRestante = resumen(guardado).saldo;
      aviso(textoAvisoRecibido(guardado.numero, saldoRestante), 'exito');
      location.hash = '#/flota';
    } catch {
      aviso('No se pudo guardar el cierre. Intenta de nuevo.', 'error');
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
    if (ev.target.id === 'rc-pago-forma') {
      el('rc-pago-porcentaje-campo').hidden = texto('rc-pago-forma') !== 'tarjeta';
    }
    recalcular();
  });
  el('rc-form').addEventListener('submit', guardar);

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
