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
// deuda pendiente es `cuentaDeDueno(...).totalPorPagar` (que ya incluye las
// diferencias de rentas pagadas cuyo monto creció), y lo que las rentas de
// «Le pagué» suman HOY es `totalSeleccionado` (las tres de
// nucleo/liquidacion.js); lo pagado es el `monto` que quedó guardado en el
// pago, y es lo que el papel dice siempre. Si aquí se sumara algo por cuenta propia, un día el papel contradiría la
// pantalla que lo produjo — justo lo que este proyecto ya sufrió cinco veces.
//
// EL DESCUENTO. Cuando a ese dueño ya se le había pagado de más, el pago que se le hace después puede
// descontar eso (`descuento`, §7b): las rentas quedan pagadas completas —`monto` es lo que suman— pero lo que
// de verdad se entrega es `monto − descuento`. El papel que él guarda tiene que explicarse solo: las rentas, lo
// que ya se le había pagado de más, y lo que se entregó (`descuentoDelPago`, `entregadoDelPago` y
// `totalesDePagos`, del núcleo; aquí no se resta ni se suma nada). Todo sale de lo que el pago GUARDÓ, nunca de
// lo que las rentas cuestan hoy: el dueño del carro tiene ese papel en la mano, y una reimpresión que dijera
// otra cifra entregada no sería el mismo comprobante.
//
// Y la palabra «descuento» no sale en el papel. La prueba de lo prohibido la tiene en su lista porque en un
// contrato es lo que se le rebaja al CLIENTE, y esa prueba no puede saber de cuál se habla; en vez de aflojarla,
// el papel dice lo que el dueño del carro entiende sin conocer el sistema: «lo que ya se le había pagado de más».
//
// El PDF lo hace el navegador (ADR-003): esta hoja se imprime con
// Cmd + P → Guardar como PDF, y css/estilos.css (@media print) esconde todo lo
// que no sea ella.
import {
  costoDelSubarriendo, agruparPorDueno, totalSeleccionado, pagoAnulado,
  descuentoDelPago, entregadoDelPago, descuentoInvalido, totalesDePagos,
} from '../nucleo/liquidacion.js';
import { atrasoDe } from '../nucleo/contrato.js';
import { q } from '../nucleo/dinero.js';
import { diasEntre, esFechaISO } from '../nucleo/fechas.js';
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
 * Una diferencia pendiente, tal como aparece en el papel: lo que se le debe de
 * más por rentas que YA se le pagaron y cuyo monto creció después. Solo lleva los
 * comprobantes de donde viene, las placas de sus carros y tres cifras suyas: lo
 * que se le pagó, lo que esas rentas cuestan hoy y lo que falta. Con una renta
 * sin costo confiable, `ahora` y `monto` son `null` (igual que en una fila): lo
 * que se le pagó sí se sabe, lo que cuestan hoy no.
 */
function filaDeDiferencia(d, { sinAnotar, sinLeer }) {
  const sinCosto = d.contratos.some((c) => sinLeer.has(c.id)) ? 'leer'
    : (d.contratos.some((c) => sinAnotar.has(c.id)) ? 'anotar' : null);
  return {
    comprobantes: d.pagos.map((p) => p.numero),
    placas: d.contratos.map((c) => c.carroPlacas ?? ''),
    pagado: d.pagado,
    ahora: sinCosto ? null : d.ahora,
    monto: sinCosto ? null : d.diferencia,
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
 *   Un pago ANULADO tampoco: ya no pagó nada (ver `pagoAnulado`) y el papel lo afirmaría. Ni uno
 *   con un `descuento` imposible (`descuentoInvalido`): la cifra entregada saldría de un dato dañado.
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
  // Un pago anulado ya no pagó nada: sus rentas volvieron a «por pagar». Un papel que dijera
  // «Le pagué … Total pagado» sobre él afirmaría lo contrario de lo que el sistema sabe, y saldría
  // de la empresa. El número se conserva (ese dueño tiene el papel viejo), pero no se reimprime.
  if (pagoAnulado(pago)) {
    throw new Error(
      `El pago N° ${pago.numero} está anulado${esFechaISO(pago.anuladoEn) ? ` desde el ${fecha(pago.anuladoEn)}` : ''}: `
      + 'ya no cuenta como pagado, y un comprobante de pago diría lo contrario.',
    );
  }
  if (!esFechaISO(pago.fecha)) {
    throw new Error(`El pago N° ${pago.numero} no trae una fecha válida: sin ella el comprobante no dice cuándo se pagó.`);
  }
  if (!(q(pago.monto) > 0)) {
    throw new Error(`El pago N° ${pago.numero} no trae monto: un comprobante por Q0.00 no prueba que se pagó nada.`);
  }
  // `guardarPagoDueno` no deja guardar un descuento negativo ni mayor que el monto. Si uno llega así, el
  // documento se dañó, y el núcleo lo recorta para que una cuenta no entregue de más; un papel no se recorta:
  // diría una cifra entregada que nadie decidió, y saldría de la empresa.
  if (descuentoInvalido(pago)) {
    throw new Error(
      `El pago N° ${pago.numero} trae un descuento que no es posible (no es un monto, es negativo o es mayor que lo que suman sus rentas): `
      + 'el comprobante diría una cifra entregada que nadie decidió. Revisa ese pago antes de imprimirlo.',
    );
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

  // Del núcleo, no restados aquí: lo que se descontó y lo que de verdad se entregó con este pago.
  const descuento = descuentoDelPago(pago);
  const entregado = entregadoDelPago(pago);

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
  // Lo que se le debe de más por rentas ya pagadas que crecieron (ver `cuentaDeDueno`):
  // sin esto, el papel diría «No queda nada pendiente» con una deuda abierta.
  const diferencias = grupo.cuenta.diferencias.map((d) => filaDeDiferencia(d, marcas));
  const pendienteIncompleto = filasPendientes.some((f) => f.sinCosto) || diferencias.some((d) => d.sinCosto);

  // Los pagos anteriores sobre las mismas rentas. Un pago que viene detrás de otro
  // sobre las mismas rentas es el de una diferencia (ver `gruposDePago`): ya no es
  // «lo que cuestan estas rentas», es lo que completa un comprobante anterior, y el
  // papel lo dice así en vez de mostrar una tabla que parece pagada de menos.
  //
  // Solo si lo pagado hasta este comprobante todavía cabe en lo que esas rentas
  // cuestan hoy. Si lo pasa, no es una diferencia que se completa sino un pago de
  // más (el mismo pago registrado dos veces desde dos pestañas): decir que «las
  // rentas cambiaron de monto» sería falso, y se imprime como un pago normal.
  const esEste = (p) => p === pago || (pago.id && p?.id === pago.id);
  const delGrupo = grupo.cuenta.gruposDePago.find((g) => g.pagos.some(esEste));
  const lugar = delGrupo ? delGrupo.pagos.findIndex(esEste) : -1;
  // Lo que suman los pagos de la cadena hasta este (la suma es del núcleo: `totalesDePagos`).
  const hasta = totalesDePagos(lugar > 0 ? delGrupo.pagos.slice(0, lugar + 1) : [pago]);
  const hastaAqui = hasta.monto;
  // De cada comprobante anterior se dice lo que ese papel dice como «Total pagado»: lo que se ENTREGÓ.
  // Sin descuento es su `monto`, igual que siempre.
  const anteriores = lugar > 0 && hastaAqui <= delGrupo.ahora
    ? delGrupo.pagos.slice(0, lugar).map((p) => ({ numero: p.numero, monto: entregadoDelPago(p) }))
    : [];

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
  // El pago de una diferencia no es un «cambió»: tiene su propia nota (ver `anteriores`).
  const cambiaron = costosLegibles && anteriores.length === 0
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
      // El monto que se guardó, no una suma de las filas: es lo que las rentas de este pago suman y
      // lo que se comparó contra ellas el día que se hizo.
      total: q(pago.monto),
      // De ese `total`, lo que no se entregó porque ya se le había pagado de más antes (0 si no hubo), y
      // lo que de verdad salió de las manos de él: la cifra de «Total pagado» cuando hay descuento.
      // Los dos salen de lo guardado en el pago, así que una reimpresión dice lo mismo que el original.
      descuento,
      entregado,
      forma: String(pago.forma ?? ''),
      cambiaron,
      // Los comprobantes anteriores que este completa (vacío si es un pago normal) y
      // lo que suman junto con este: lo que el dueño del carro lleva recibido por esas rentas,
      // con la parte de eso que fue lo ya pagado de más (`acumuladoDescuento`) para que la cuenta cuadre.
      anteriores,
      acumulado: anteriores.length ? hastaAqui : q(pago.monto),
      acumuladoDescuento: anteriores.length ? hasta.descuento : descuento,
    },
    pendiente: {
      filas: filasPendientes,
      diferencias,
      // Con una renta sin cifra el total no se puede dar: sumar las demás y
      // llamarlo «total» diría que se debe menos de lo que se debe.
      total: pendienteIncompleto ? null : grupo.cuenta.totalPorPagar,
      incompleto: pendienteIncompleto,
    },
    rentasSinCosto: {
      anotar: cuantas([...filasPagadas, ...filasPendientes, ...diferencias], 'anotar'),
      leer: cuantas([...filasPagadas, ...filasPendientes, ...diferencias], 'leer'),
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

/**
 * La tabla de rentas. `pie` es la fila del total, ya armada, porque cada tabla lo
 * dice distinto. `extra` son filas que van después de las rentas (las diferencias).
 */
function tablaHtml(filas, pie, extra = '') {
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
      ${filas.map(filaHtml).join('\n      ')}${extra}
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
 *
 * Con un descuento, «lo pagado» no es lo que suman las rentas (parte de eso ya estaba pagado de más): la
 * nota dice lo que las rentas sumaban al pagar, que es contra lo que se compara el detalle, y que lo
 * entregado no cambia.
 */
function notaDeCambio(p) {
  if (p.descuento > 0) {
    return `<p class="comp-nota-cambio">Nota: al hacer este pago las rentas de esta lista sumaban ${dinero(p.total)}. Cambiaron después, por eso su detalle ya no suma esa cifra. Lo entregado con este comprobante, ${dinero(p.entregado)}, es lo que se pagó ese día y no cambia.</p>`;
  }
  return `<p class="comp-nota-cambio">Nota: lo pagado fue ${dinero(p.total)}. Las rentas de esta lista cambiaron después del pago, por eso su detalle ya no suma esa cifra.</p>`;
}

/**
 * La nota que explica el descuento a quien no conoce el sistema: de dónde sale la resta y por qué lo
 * entregado es menos que lo que suman las rentas. Solo lleva cifras del propio dueño del carro (lo que se le
 * pagó de más, lo que suman sus rentas, lo que se le entregó) y ninguna palabra del negocio de Best Price.
 *
 * No nombra de cuál comprobante viene lo pagado de más: el pago guarda cuánto se descontó, no contra cuál
 * (un descuento se reparte entre los pagos de más que hubiera), y decirlo con lo que las rentas cuestan HOY
 * haría que la reimpresión dijera algo distinto al papel que él ya tiene.
 *
 * Cuando lo descontado es todo lo que suman las rentas no se entregó dinero, y se dice así: «Forma de pago:
 * Efectivo» sobre un pago de Q0.00 haría pensar que sí.
 */
function notaDeDescuento(p) {
  const queda = p.anteriores.length ? 'La diferencia queda pagada' : 'Las rentas de esta lista quedan pagadas';
  const entrega = p.entregado > 0
    ? `lo que se entregó con este comprobante fue ${dinero(p.entregado)}`
    : 'con este comprobante no se entregó dinero';
  return `<p class="comp-nota-cambio">Nota: antes se le pagaron ${dinero(p.descuento)} de más. Esa cantidad no se entrega otra vez: se resta de este pago. ${queda} por completo (${dinero(p.total)}) y ${entrega}.</p>`;
}

/**
 * Las notas bajo la tabla de «Le pagué», en este orden: primero qué se descontó (si hubo), que es lo que
 * explica por qué el total es menos que las rentas, y después lo que cambió desde el pago (si cambió). Un
 * pago que completa a otros dice eso y no el «cambiaron» a secas (ver `anteriores`).
 */
function notasDePagado(p) {
  const notas = [];
  if (p.descuento > 0) notas.push(notaDeDescuento(p));
  if (p.anteriores.length) notas.push(notaDeComplemento(p));
  else if (p.cambiaron) notas.push(notaDeCambio(p));
  return notas.join('\n    ');
}

/** Cómo se dice la forma de pago: con dinero entregado, la forma; sin él, que no se entregó nada. */
function lineaDeForma(p) {
  if (p.descuento > 0 && p.entregado === 0) {
    return '<p class="comp-forma">Forma de pago: <strong>Sin entrega de dinero</strong></p>';
  }
  return `<p class="comp-forma">Forma de pago: <strong>${esc(textoDeForma(p.forma))}</strong></p>`;
}

/**
 * El pie de la tabla de «Le pagué». Sin descuento es la fila de siempre, «Total pagado». Con descuento son
 * tres, y la cuenta se lee de arriba abajo: lo que suman las rentas de este pago, menos lo que ya se le había
 * pagado de más, igual al total pagado (lo que se entregó). Cada fila dice qué es, sin que haga falta
 * conocer el sistema.
 */
function pieDePagado(p) {
  if (!(p.descuento > 0)) {
    return `<tr>
          <th scope="row" colspan="5">Total pagado</th>
          <td class="num">${dinero(p.total)}</td>
        </tr>`;
  }
  const suman = p.anteriores.length ? 'Diferencia pagada con este comprobante' : 'Rentas pagadas con este comprobante';
  return `<tr class="comp-pie-suma">
          <th scope="row" colspan="5">${suman}</th>
          <td class="num">${dinero(p.total)}</td>
        </tr>
        <tr class="comp-pie-menos">
          <th scope="row" colspan="5">Menos: lo que ya se le había pagado de más</th>
          <td class="num">${dinero(-p.descuento)}</td>
        </tr>
        <tr class="comp-pie-total">
          <th scope="row" colspan="5">Total pagado</th>
          <td class="num">${dinero(p.entregado)}</td>
        </tr>`;
}

/**
 * Qué comprobantes completa un pago: «el comprobante N° 7 (Q1,500.00)», «los
 * comprobantes N° 7 (Q1,500.00) y N° 9 (Q600.00)».
 */
function textoDeAnteriores(anteriores) {
  const cada = anteriores.map((a) => `N° ${esc(a.numero)} (${dinero(a.monto)})`);
  return cada.length === 1
    ? `el comprobante ${cada[0]}`
    : `los comprobantes ${cada.slice(0, -1).join(', ')} y ${cada[cada.length - 1]}`;
}

/**
 * La nota de un pago que es la diferencia de uno anterior. La tabla de arriba
 * trae las rentas con su monto de hoy, y el total de abajo es solo lo que se
 * pagó en este comprobante: sin esta nota, el papel diría «la renta vale Q2,100
 * y se te pagaron Q600», que se lee como una deuda. Dice qué se pagó antes y
 * cuánto suma todo junto.
 */
function notaDeComplemento(p) {
  // Si en la cadena hubo lo ya pagado de más, el total incluye esa parte, que no se entregó otra vez:
  // los comprobantes dicen lo que se entregó y la suma de ellos no sería este total sin esta aclaración.
  const deMas = p.acumuladoDescuento > 0
    ? `, de los cuales ${dinero(p.acumuladoDescuento)} ya se le habían pagado de más antes y no se entregaron otra vez`
    : '';
  return `<p class="comp-nota-cambio">Nota: este pago completa ${textoDeAnteriores(p.anteriores)}. Las rentas de esta lista cambiaron de monto después de ese pago, y esto es la diferencia. En total, por estas rentas se le han pagado ${dinero(p.acumulado)}${deMas}.</p>`;
}

/** Una diferencia pendiente: una fila que dice de dónde viene y cuánto falta. */
function filaDeDiferenciaHtml(d) {
  const comprobantes = d.comprobantes.length === 1
    ? `el comprobante N° ${esc(d.comprobantes[0])}`
    : `los comprobantes ${d.comprobantes.slice(0, -1).map((n) => `N° ${esc(n)}`).join(', ')} y N° ${esc(d.comprobantes[d.comprobantes.length - 1])}`;
  const detalle = d.sinCosto
    ? `<span class="comp-falta">${TEXTO_SIN_COSTO[d.sinCosto]}</span>`
    : `Se pagaron ${dinero(d.pagado)} y hoy esas rentas suman ${dinero(d.ahora)}.`;
  return `<tr>
        <td colspan="5">Diferencia de rentas ya pagadas en ${comprobantes} (${d.placas.map(algo).join(', ')}). ${detalle}</td>
        <td class="num">${d.sinCosto ? RAYA : dinero(d.monto)}</td>
      </tr>`;
}

function seccionPendiente(p, hoy) {
  const alDia = `al ${esc(fecha(hoy))}`;
  if (p.filas.length === 0 && p.diferencias.length === 0) {
    // Nada pendiente se dice con palabras: una tabla vacía parece un error.
    return `<p class="comp-sin-pendiente">No queda nada pendiente <span class="comp-al-dia">${alDia}</span></p>`;
  }
  const sinCosto = [...p.filas, ...p.diferencias].filter((f) => f.sinCosto).length;
  const total = p.incompleto
    ? `<th scope="row" colspan="3">Total pendiente</th>
        <td colspan="3" class="comp-falta">No se puede dar el total: falta el costo de ${pluralRentas(sinCosto)}.</td>`
    : `<th scope="row" colspan="5">Total pendiente</th>
        <td class="num">${dinero(p.total)}</td>`;
  return `<p class="comp-al-dia">Rentas ya cerradas que aún se le deben, ${alDia}.</p>
    ${tablaHtml(p.filas, `<tr>${total}</tr>`, p.diferencias.map(filaDeDiferenciaHtml).join('\n      '))}`;
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
    ${tablaHtml(m.pagado.filas, pieDePagado(m.pagado))}
    ${lineaDeForma(m.pagado)}
    ${notasDePagado(m.pagado)}
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
    // Con un descuento, «lo pagado» (lo entregado) no es contra lo que se compara el detalle: es lo que las
    // rentas sumaban al pagar. Decir «lo pagado ya no coincide» sería afirmar algo que no se comparó.
    partes.push(
      m.pagado.descuento > 0
        ? `Las rentas de este comprobante sumaban ${dinero(m.pagado.total)} cuando se pagó y ya no coinciden con su detalle: alguna cambió después del pago. `
          + `El papel lo dice en una nota y mantiene lo entregado (${dinero(m.pagado.entregado)}). Revisa qué cambió antes de mandarlo.`
        : `Lo pagado (${dinero(m.pagado.total)}) ya no coincide con el detalle de las rentas de este comprobante: alguna cambió después del pago. `
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
