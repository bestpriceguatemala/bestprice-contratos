// El comprobante de pago al dueño de un carro subarrendado (§6 del diseño de la
// liquidación, ADR-003).
//
// Es el único papel de este sistema que sale de la empresa hacia un tercero: el
// dueño del negocio lo manda a la persona a quien le subarrienda el carro, para
// probar qué le pagó y qué le queda por pagar. Tiene que estar bien y tiene que
// verse serio, y hay UNA regla que está por encima de todo lo demás:
//
//     el dueño del carro ve solo lo que es suyo.
//
// Nunca la comisión del empleado, nunca lo que el cliente le pagó a Best Price,
// nunca la utilidad. Es un proveedor, no un socio: un papel que le dejara ver
// cuánto se cobró por su propio carro le costaría a este negocio la relación y
// el precio que negoció. Por eso este archivo está hecho en dos pasos, y la
// separación no es de estilo:
//
//   1. `armarComprobante` recibe los datos y devuelve un MODELO con solo lo que
//      se imprime: una fila por renta (fecha, placas, cliente, días, costo por
//      día, monto) y los totales. Los contratos nunca salen de aquí enteros: de
//      cada uno se TOMA lo permitido, no se QUITA lo prohibido, así que un campo
//      nuevo en un contrato nunca llega al papel por descuido.
//   2. `htmlComprobante` dibuja ese modelo, y solo ese modelo. No recibe un
//      contrato en ningún momento: no tiene con qué filtrar una cifra del negocio.
//
// La prueba que lo fija (pruebas/comprobante.test.mjs) busca las cifras
// prohibidas en todo lo que sale, y compara las llaves del modelo contra una
// lista blanca para que agregar una falle fuerte.
//
// Sin cálculos propios: el costo de cada renta es `costoDelSubarriendo`, la
// deuda pendiente es `cuentaDeDueno(...).totalPorPagar`, y lo que las rentas de
// «Le pagué» suman HOY es `totalSeleccionado` (las tres de
// nucleo/liquidacion.js); lo pagado es el `monto` que quedó guardado en el
// pago, y es lo que el papel dice siempre. Si aquí se sumara algo por cuenta propia, un día el papel contradiría la
// pantalla que lo produjo — justo lo que este proyecto ya sufrió cinco veces.
//
// El PDF lo hace el navegador (ADR-003): esta hoja se imprime con
// Cmd + P → Guardar como PDF, y css/estilos.css (@media print) esconde todo lo
// que no sea ella.
import { costoDelSubarriendo, agruparPorDueno, totalSeleccionado } from '../nucleo/liquidacion.js';
import { atrasoDe } from '../nucleo/contrato.js';
import { q } from '../nucleo/dinero.js';
import { diasEntre, sumarDias } from '../nucleo/fechas.js';
import { dinero, fecha } from '../ui.js';

/**
 * El membrete. Es texto y no una imagen a propósito: el sistema no carga
 * imágenes (abrir al instante es una de sus promesas) y el único logo bueno de
 * la marca es una foto de perfil, no algo que deba viajar impreso en un papel
 * formal. Los datos de contacto son los de la marca; si cambian, es aquí.
 */
// Confirmado por el dueño el 5 de octubre de 2026, uno por uno. Sin NIT: él
// dijo que no lo quiere en este papel, y tiene sentido — es un comprobante
// entre él y el dueño del carro, no una factura.
export const MEMBRETE = {
  nombre: 'Best Price Rent a Car Guatemala',
  lema: 'Movilidad confiable para cada destino.',
  contacto: [
    '7 av 15-90 zona 13, Colonia Aurora I',
    'Tel. 2261-3575 · rentaautos.gt',
    'WhatsApp: 4019-3131 · 4001-2626 · 5770-5278',
    'bestprice.ventas@gmail.com',
  ],
};

// El texto libre (nombre del dueño, del cliente, placas) nunca entra al HTML sin
// pasar por aquí: mismo escape que el resto de las pantallas.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Lo que se escribe donde no hay dato: una raya, no un hueco que parezca un error. */
const RAYA = '—';
const algo = (texto) => (String(texto ?? '').trim() ? esc(String(texto).trim()) : RAYA);

/**
 * ¿Es una fecha ISO real? 'sumarDias(x, 0)' devuelve la misma fecha si lo es,
 * y otra cosa si no ('2026-13-45' rueda a otro día, un texto raro da ''). Es
 * la validación que ya tiene el núcleo de fechas, no una expresión regular más.
 * El texto vacío se descarta aparte: `sumarDias('', 0)` también devuelve '', y
 * «'' === ''» lo daría por buena (la prueba de «sin fecha» lo cazó).
 */
const esFechaISO = (x) => typeof x === 'string' && x !== '' && sumarDias(x, 0) === x;

/** Qué se imprime en lugar de la cifra cuando el costo no es confiable, según el motivo. */
const TEXTO_SIN_COSTO = {
  anotar: 'Sin costo anotado',
  leer: 'No se pudo leer el costo',
};

const FORMAS_DE_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', cheque: 'Cheque' };

function textoDeForma(forma) {
  const limpia = String(forma ?? '').trim();
  if (!limpia) return 'No anotada';
  return FORMAS_DE_PAGO[limpia.toLowerCase()] ?? `${limpia[0].toUpperCase()}${limpia.slice(1)}`;
}

// ---------- El modelo: solo lo que se imprime ----------

/**
 * Una renta, tal como aparece en una fila. TOMA los seis datos de la tabla y
 * nada más: ni el precio al cliente, ni sus pagos, ni la comisión, ni quién
 * rentó (todo eso vive en el contrato, y por eso el contrato no pasa de aquí).
 *
 * `sinCosto` dice si la cifra no es confiable, y en ese caso `costoDia` y
 * `monto` son `null` — no 0. Un 0 se formatearía como «Q0.00» sin que nadie lo
 * note, y un papel que dice cero donde el dato falta es peor que uno que dice
 * que falta. Son dos motivos distintos y el papel los distingue:
 *  - 'leer': `privado/dinero` no se pudo leer (`costoSinLeer`, de
 *    cargarContratosParaDinero). Gana aunque el documento traiga un costo viejo,
 *    porque privado es el que manda y no se sabe qué decía.
 *  - 'anotar': el costo por día es 0 o nunca se anotó (`sinCostoAnotado`, de
 *    cuentaDeDueno).
 */
function filaDeRenta(c, { sinAnotar, sinLeer }) {
  const sinCosto = sinLeer.has(c.id) ? 'leer' : (sinAnotar.has(c.id) ? 'anotar' : null);
  return {
    fecha: c.fechaSalida ?? '',
    placas: c.carroPlacas ?? '',
    cliente: c.clienteNombre ?? '',
    dias: q(c.dias),
    diasAtraso: atrasoDe(c),
    costoDia: sinCosto ? null : q(c.subarriendo?.costoDia),
    monto: sinCosto ? null : costoDelSubarriendo(c),
    sinCosto,
  };
}

/**
 * Cronológico, y a igual fecha por placas: el papel sale siempre en el mismo
 * orden aunque los contratos hayan llegado de la nube en otro. La fecha se
 * compara con `diasEntre`, la única manera de comparar fechas ISO en este
 * proyecto (una fecha inválida da 0 y se queda donde estaba).
 */
function porFechaYPlacas(a, b) {
  const orden = diasEntre(b.fecha, a.fecha);
  if (orden) return orden;
  return a.placas < b.placas ? -1 : a.placas > b.placas ? 1 : 0;
}

const cuantas = (filas, motivo) => filas.filter((f) => f.sinCosto === motivo).length;

/**
 * Arma lo que se imprime. LANZA si no puede armarlo completo: un papel a medias
 * (sin número, con una tabla a la que le faltan filas, con un «nada pendiente»
 * que en realidad es una lista que no llegó) es peor que no tener papel,
 * porque sale de la empresa y ya no se puede corregir.
 *
 * Recibe:
 * - `pago`: el pago a un dueño ya guardado (`id`, `fecha`, `forma`, `monto`,
 *   `contratos[]`, `numero`; §7 del diseño). Sin `numero` no hay papel: el
 *   correlativo es lo que lo vuelve un comprobante y no una hoja cualquiera.
 * - `dueno`: el registro del dueño (`nombre`, `telefono`, `nit`) o `null` para
 *   el grupo de contratos viejos con el dueño escrito a mano; ahí el nombre es el
 *   que se escribió en los contratos, y teléfono y NIT salen en blanco en vez de
 *   inventarse. Su `nota` (interna) nunca se imprime.
 * - `contratos` y `pagos`: los del negocio, tal como los lee el área de dinero.
 *   No hace falta recortarlos a un dueño: aquí se escoge el grupo del dueño con
 *   la misma regla que usa la pantalla (`agruparPorDueno`), así que el papel de
 *   uno nunca lleva las rentas de otro. Y el pago que se imprime cuenta como
 *   pagado aunque `pagos` no lo traiga todavía: si no, sus propias rentas
 *   saldrían como «queda pendiente».
 * - `costoSinLeer`: lo que devuelve `cargarContratosParaDinero`. Es obligatorio
 *   que sea una lista (aunque vacía): `undefined` no es «todo se leyó bien»,
 *   es «no sé», y imprimir una cifra sobre un «no sé» es la dirección peligrosa.
 * - `hoy`: la fecha de hoy, que se recibe y no se lee del reloj (una regla no
 *   mira qué día es). Lo pendiente es lo que se debe AL DÍA DE HOY, no al día
 *   del pago: si el papel se reimprime semanas después, el dueño lee de cuándo es.
 */
export function armarComprobante({
  pago, dueno, contratos, pagos, costoSinLeer, hoy,
} = {}) {
  if (!pago || typeof pago !== 'object') {
    throw new Error('Falta el pago del que se imprime el comprobante.');
  }
  if (!pago.numero) {
    throw new Error('Este pago todavía no tiene número de comprobante: sin número el papel no prueba nada. Guarda el pago primero.');
  }
  if (!esFechaISO(pago.fecha)) {
    throw new Error(`El pago N° ${pago.numero} no trae una fecha válida: sin ella el comprobante no dice cuándo se pagó.`);
  }
  if (!(q(pago.monto) > 0)) {
    throw new Error(`El pago N° ${pago.numero} no trae monto: un comprobante por Q0.00 no prueba que se pagó nada.`);
  }
  if (!esFechaISO(hoy)) {
    throw new Error('Falta la fecha de hoy (hoy): lo que queda pendiente es «al día de hoy» y el papel tiene que decir cuál es.');
  }
  if (!Array.isArray(costoSinLeer)) {
    throw new TypeError(
      'comprobante: «costoSinLeer» debe ser una lista (la que devuelve cargarContratosParaDinero, aunque vacía). '
      + 'Sin ella no se sabe qué costos no se pudieron leer, y se imprimirían cifras que quizá no son.',
    );
  }

  const idsDelPago = new Set(Array.isArray(pago.contratos) ? pago.contratos.filter(Boolean) : []);
  if (idsDelPago.size === 0) {
    throw new Error(`El pago N° ${pago.numero} no cubre ninguna renta: el comprobante saldría sin una sola fila.`);
  }

  // El pago que se imprime se cuenta como pagado aunque la lista no lo traiga.
  // Si `pagos` no es una lista se deja pasar tal cual: `agruparPorDueno` lanza
  // con el mensaje de siempre, y no se «arregla» aquí con un [] que diría «nada
  // pagado» (ver idsCubiertos en liquidacion.js).
  const incluido = Array.isArray(pagos)
    && pagos.some((p) => p === pago || (pago.id && p?.id === pago.id));
  const pagosConEste = Array.isArray(pagos) && !incluido ? [...pagos, pago] : pagos;

  const grupo = agruparPorDueno(contratos, pagosConEste)
    .find((g) => g.cuenta.pagados.some((c) => idsDelPago.has(c.id)));
  const delPago = grupo ? grupo.cuenta.pagados.filter((c) => idsDelPago.has(c.id)) : [];
  const faltan = idsDelPago.size - new Set(delPago.map((c) => c.id)).size;
  if (!grupo || faltan > 0) {
    throw new Error(
      `No se encontraron ${grupo ? faltan : idsDelPago.size} de las ${idsDelPago.size} rentas que cubre el pago N° ${pago.numero}, `
      + 'o no son todas del mismo dueño. Recarga la pantalla: sin todas sus filas el comprobante saldría incompleto.',
    );
  }

  const marcas = { sinAnotar: new Set(grupo.cuenta.sinCostoAnotado), sinLeer: new Set(costoSinLeer) };
  const filasPagadas = delPago.map((c) => filaDeRenta(c, marcas)).sort(porFechaYPlacas);
  const filasPendientes = grupo.cuenta.porPagar.map((c) => filaDeRenta(c, marcas)).sort(porFechaYPlacas);
  const pendienteIncompleto = filasPendientes.some((f) => f.sinCosto);

  // ¿Las rentas de «Le pagué» todavía suman lo que se pagó? Se le pregunta al
  // núcleo (`totalSeleccionado`, la misma suma que la pantalla enseña al marcar
  // casillas), no se suman aquí. Si no coinciden es que algo cambió DESPUÉS del
  // pago —se corrigió el costo de una renta, o se anuló un pago del cliente y la
  // renta dejó de estar cerrada— y la tabla ya no explica el total. El total no
  // se toca (lo pagado es lo pagado, y el dueño del carro ya tiene el papel con
  // ese número): el papel dice, en una línea, que el detalle ya no suma.
  // Con un costo que no se pudo leer no hay cifra confiable con qué comparar:
  // la fila ya dice que falta, y comparar contra un 0 inventado daría un aviso falso.
  const costosLegibles = !filasPagadas.some((f) => f.sinCosto === 'leer');
  const cambiaron = costosLegibles
    && totalSeleccionado(delPago, delPago.map((c) => c.id)) !== q(pago.monto);

  return {
    numero: pago.numero,
    fecha: pago.fecha,
    hoy,
    dueno: {
      nombre: String(dueno?.nombre ?? '').trim() || grupo.nombre,
      telefono: String(dueno?.telefono ?? '').trim(),
      nit: String(dueno?.nit ?? '').trim(),
    },
    pagado: {
      filas: filasPagadas,
      // El monto que se guardó, no una suma de las filas: es lo que de verdad se
      // pagó ese día y es lo que enseña la pantalla de «ya pagado».
      total: q(pago.monto),
      forma: String(pago.forma ?? ''),
      cambiaron,
    },
    pendiente: {
      filas: filasPendientes,
      // Con una renta sin cifra el total no se puede dar: sumar las demás y
      // llamarlo «total» diría que se debe menos de lo que se debe.
      total: pendienteIncompleto ? null : grupo.cuenta.totalPorPagar,
      incompleto: pendienteIncompleto,
    },
    rentasSinCosto: {
      anotar: cuantas([...filasPagadas, ...filasPendientes], 'anotar'),
      leer: cuantas([...filasPagadas, ...filasPendientes], 'leer'),
    },
  };
}

// ---------- La hoja ----------

const pluralRentas = (n) => `${n} renta${n === 1 ? '' : 's'}`;

function celdaDeDias(f) {
  // Costo por día × días tiene que explicar el monto: si el carro se devolvió
  // tarde, los días de atraso también se le pagan al dueño (diseño §3), y una
  // fila «4 días × Q300 = Q1,800» se leería como un error de cuentas.
  return f.diasAtraso > 0 ? `${f.dias} + ${f.diasAtraso} de atraso` : `${f.dias}`;
}

function filaHtml(f) {
  const falta = f.sinCosto ? `<span class="comp-falta">${TEXTO_SIN_COSTO[f.sinCosto]}</span>` : '';
  return `<tr>
        <td>${algo(fecha(f.fecha))}</td>
        <td>${algo(f.placas)}</td>
        <td>${algo(f.cliente)}</td>
        <td class="num">${esc(celdaDeDias(f))}</td>
        <td class="num">${f.sinCosto ? falta : dinero(f.costoDia)}</td>
        <td class="num">${f.sinCosto ? RAYA : dinero(f.monto)}</td>
      </tr>`;
}

/** La tabla de rentas. `pie` es la fila del total, ya armada, porque cada tabla lo dice distinto. */
function tablaHtml(filas, pie) {
  return `<table class="comp-tabla">
      <thead>
        <tr>
          <th>Fecha de salida</th>
          <th>Placas</th>
          <th>Cliente</th>
          <th class="num">Días</th>
          <th class="num">Costo por día</th>
          <th class="num">Monto</th>
        </tr>
      </thead>
      <tbody>
      ${filas.map(filaHtml).join('\n      ')}
      </tbody>
      <tfoot>
        ${pie}
      </tfoot>
    </table>`;
}

/**
 * La línea que dice la verdad cuando el detalle ya no suma lo pagado. Solo dice
 * qué se pagó y que las rentas cambiaron: no escribe la suma nueva, que
 * contradiría el total del comprobante que el dueño del carro ya tiene.
 */
function notaDeCambio(totalPagado) {
  return `<p class="comp-nota-cambio">Nota: lo pagado fue ${dinero(totalPagado)}. Las rentas de esta lista cambiaron después del pago, por eso su detalle ya no suma esa cifra.</p>`;
}

function seccionPendiente(p, hoy) {
  const alDia = `al ${esc(fecha(hoy))}`;
  if (p.filas.length === 0) {
    // Nada pendiente se dice con palabras: una tabla vacía parece un error.
    return `<p class="comp-sin-pendiente">No queda nada pendiente <span class="comp-al-dia">${alDia}</span></p>`;
  }
  const total = p.incompleto
    ? `<th scope="row" colspan="3">Total pendiente</th>
        <td colspan="3" class="comp-falta">No se puede dar el total: falta el costo de ${pluralRentas(p.filas.filter((f) => f.sinCosto).length)}.</td>`
    : `<th scope="row" colspan="5">Total pendiente</th>
        <td class="num">${dinero(p.total)}</td>`;
  return `<p class="comp-al-dia">Rentas ya cerradas que aún se le deben, ${alDia}.</p>
    ${tablaHtml(p.filas, `<tr>${total}</tr>`)}`;
}

/**
 * La hoja, como texto HTML. Función pura: recibe el modelo de `armarComprobante`
 * y nada más, para poder revisar en una prueba cada carácter que sale.
 *
 * El orden es el de §6 del diseño: membrete, datos del dueño, número y fecha,
 * «Le pagué», «Queda pendiente», firma.
 */
export function htmlComprobante(m) {
  const d = m.dueno;
  return `<article class="comprobante" aria-label="Comprobante de pago N° ${esc(m.numero)}">
  <header class="comp-membrete">
    <div class="comp-marca">
      <p class="comp-nombre">${esc(MEMBRETE.nombre)}</p>
      <p class="comp-lema">${esc(MEMBRETE.lema)}</p>
    </div>
    <p class="comp-contacto">${MEMBRETE.contacto.map(esc).join('<br>')}</p>
  </header>

  <h1 class="comp-titulo">Comprobante de pago</h1>

  <div class="comp-encabezado">
    <section class="comp-dueno" aria-label="Dueño del vehículo">
      <p class="comp-etiqueta">Dueño del vehículo</p>
      <p class="comp-dueno-nombre">${algo(d.nombre)}</p>
      <dl class="comp-datos">
        <div><dt>Teléfono</dt><dd>${algo(d.telefono)}</dd></div>
        <div><dt>NIT</dt><dd>${algo(d.nit)}</dd></div>
      </dl>
    </section>
    <section class="comp-numero" aria-label="Número y fecha">
      <p class="comp-etiqueta">Comprobante</p>
      <p class="comp-numero-valor">N° ${esc(m.numero)}</p>
      <dl class="comp-datos">
        <div><dt>Fecha</dt><dd>${algo(fecha(m.fecha))}</dd></div>
      </dl>
    </section>
  </div>

  <section class="comp-seccion comp-pagado">
    <h2>Le pagué</h2>
    ${tablaHtml(m.pagado.filas, `<tr>
          <th scope="row" colspan="5">Total pagado</th>
          <td class="num">${dinero(m.pagado.total)}</td>
        </tr>`)}
    <p class="comp-forma">Forma de pago: <strong>${esc(textoDeForma(m.pagado.forma))}</strong></p>
    ${m.pagado.cambiaron ? notaDeCambio(m.pagado.total) : ''}
  </section>

  <section class="comp-seccion comp-pendiente">
    <h2>Queda pendiente</h2>
    ${seccionPendiente(m.pendiente, m.hoy)}
  </section>

  <footer class="comp-firma">
    <div class="comp-firma-linea"></div>
    <p>Firma del dueño del vehículo</p>
    <p class="comp-firma-nombre">${algo(d.nombre)}</p>
  </footer>
</article>`;
}

// ---------- La pantalla ----------

/**
 * Lo que se le avisa al dueño del NEGOCIO, solo en pantalla y antes de imprimir,
 * cuando hay rentas sin cifra o cuando el detalle ya no suma lo pagado. No sale en el papel (`no-imprimir`): es para
 * quien manda el comprobante, no para quien lo recibe.
 */
function avisosDePantalla(m) {
  const { anotar, leer } = m.rentasSinCosto;
  const partes = [];
  if (leer) {
    partes.push(
      `No se pudo leer el costo de ${pluralRentas(leer)}: en el papel salen sin cifra. `
      + 'Revisa tu internet y que el área de dinero siga abierta, vuelve a abrir este comprobante y no lo mandes hasta que salgan completas.',
    );
  }
  if (anotar) {
    partes.push(
      `${pluralRentas(anotar)} sin costo anotado: en el papel salen sin cifra. Anota el costo antes de mandar este comprobante.`,
    );
  }
  if (m.pagado.cambiaron) {
    partes.push(
      `Lo pagado (${dinero(m.pagado.total)}) ya no coincide con el detalle de las rentas de este comprobante: alguna cambió después del pago. `
      + 'El papel lo dice en una nota y mantiene el total pagado. Revisa qué cambió antes de mandarlo.',
    );
  }
  if (!partes.length) return '';
  return `<div class="barra-lectura-fallida no-imprimir" role="alert">${partes.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;
}

/**
 * El nombre con que Chrome y Safari proponen guardar el PDF es el título de la
 * página. Mientras el diálogo está abierto el título es el del comprobante, y
 * al terminar se devuelve el de antes (`afterprint` avisa en los dos casos:
 * imprimió o canceló). Así el archivo sale como «Comprobante 7 - Mario López»
 * y no como «Best Price — Contratos», que es lo que ADR-003 lista como
 * inconveniente. Fuera de un navegador no hace nada y solo imprime.
 */
function imprimirConTitulo(titulo, imprimir) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    imprimir();
    return;
  }
  const antes = document.title;
  const devolver = () => {
    document.title = antes;
    window.removeEventListener('afterprint', devolver);
  };
  document.title = titulo;
  window.addEventListener('afterprint', devolver);
  imprimir();
}

/**
 * Dibuja el comprobante en `contenedor`, con su barra de botones. Devuelve el
 * modelo, o `null` si no se pudo armar.
 *
 * Si `armarComprobante` lanza, NO se dibuja una hoja: se dibuja una barra roja
 * que dice por qué (la misma de las lecturas fallidas, sin esconderla detrás de
 * nada). Una hoja a medias en pantalla es una hoja que alguien imprime.
 *
 * Quien llama (la ficha del dueño, en el área de dinero) pasa lo mismo que
 * `armarComprobante` — el pago ya guardado con su número, el dueño, los
 * contratos y los pagos tal como los leyó, `costoSinLeer` y `hoy` — y, si quiere
 * un botón de volver, `alVolver`. `imprimir` se puede inyectar solo para probar.
 */
export function pintarComprobante(contenedor, entrada, { imprimir = () => window.print(), alVolver } = {}) {
  const volver = alVolver ? '<button type="button" class="btn" data-accion="volver">← Volver</button>' : '';
  let modelo;
  try {
    modelo = armarComprobante(entrada);
  } catch (error) {
    contenedor.innerHTML = `<div class="comp-pantalla">
  <div class="comp-barra no-imprimir">${volver}</div>
  <div class="barra-lectura-fallida no-imprimir" role="alert"><p>No se pudo armar el comprobante. ${esc(error.message)}</p></div>
</div>`;
    contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
    return null;
  }

  contenedor.innerHTML = `<div class="comp-pantalla">
  <div class="comp-barra no-imprimir">
    ${volver}
    <button type="button" class="btn btn-primario" data-accion="imprimir">Imprimir o guardar como PDF</button>
  </div>
  <p class="comp-ayuda no-imprimir">Para el PDF: Cmd + P y elige «Guardar como PDF». La primera vez apaga «Encabezados y pies de página» en el diálogo.</p>
  ${avisosDePantalla(modelo)}
  ${htmlComprobante(modelo)}
</div>`;

  const titulo = `Comprobante ${modelo.numero} - ${modelo.dueno.nombre}`;
  contenedor.querySelector('[data-accion="imprimir"]')?.addEventListener('click', () => imprimirConTitulo(titulo, imprimir));
  contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
  return modelo;
}
