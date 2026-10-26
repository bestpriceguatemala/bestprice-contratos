// El comprobante de pago de comisión que se le entrega a un EMPLEADO (23 de octubre de 2026, ADR-003).
//
// Es el gemelo de comprobante.js —el papel del dueño de un carro subarrendado— y toma de él la hoja, el membrete y el botón de
// imprimir. Cambia solo lo que la diferencia entre un dueño de carro y un empleado exige, y hay UNA regla, la que justifica
// que este archivo exista aparte:
//
//     UNA REIMPRESIÓN DICE LO QUE DIJO EL ORIGINAL. El empleado tiene la primera copia en la mano.
//
// Por eso el papel NO se arma con las rentas de hoy. Se arma con lo que el pago GUARDÓ el día que se hizo: su `numero`, su
// `monto`, su `fecha`, su `forma` y su `detalle[]` (una fila por renta, congelada: §7b del diseño). Si después se corrige un
// cierre, el papel que sale es el mismo que salió. Y como no mira rentas, esta función no recibe contratos ni pagos ni «hoy»: no
// tiene con qué cambiar de opinión, ni con qué dejar pasar un dato del negocio que no debía salir.
//
// Qué lleva y qué NO (y por qué; el de los dueños excluye lo que el cliente pagó y la utilidad porque el dueño de un carro no tiene
// por qué ver los libros de Best Price, y aquí se razona igual para un empleado):
//   LLEVA, de cada renta: cuándo regresó, el número de contrato, las placas, el cliente, los días (con los de atraso), la base de
//   la comisión, el porcentaje de ese día y la comisión. Es exactamente lo que ya enseña la fila de «Por pagar» de su cuenta, y la base
//   (días × precio − descuento) no es un secreto para quien rentó el carro: él mismo la tiene en la pantalla.
//   NO LLEVA: lo que el cliente pagó, su saldo, su garantía ni su tarjeta (de la renta se TOMA lo permitido, ver `filaDeDetalle`);
//   el costo de un carro ajeno ni quién es su dueño; la utilidad; nada de otro empleado; ni «lo que queda pendiente» ni lo
//   estimado de las rentas que siguen afuera (el de los dueños lo trae, pero aquí sería una cifra «al día de hoy» que una
//   reimpresión no podría repetir, y una promesa de pago sobre una fecha que decide él: «yo decido cuándo lo pago»).
//
// Sin cálculos propios: la base, el porcentaje y la comisión de cada fila son las que `filaDeDetalle` guardó (de `comisionDe`), y
// el total es el `monto` que el pago guardó. Si aquí se sumara algo, un día el papel contradiría el pago que lo produjo.
import { estadoDelComprobante } from '../nucleo/comisiones.js';
import { pagoAnulado } from '../nucleo/liquidacion.js';
import { q } from '../nucleo/dinero.js';
import { diasEntre, esFechaISO } from '../nucleo/fechas.js';
import { dinero, fecha } from '../ui.js';
import {
  esc, algo, RAYA, textoDeForma, imprimirConTitulo, htmlDelMembrete,
} from './comprobante.js';

/**
 * Cómo se nombra un pago en una frase: por su número si lo tiene, y por su fecha y su monto si es de antes (no tiene otra cosa
 * con qué distinguirse).
 */
function nombreDelPago(pago) {
  if (Number.isInteger(pago?.numero)) return `El pago N° ${pago.numero}`;
  const cuando = esFechaISO(pago?.fecha) ? ` del ${fecha(pago.fecha)}` : '';
  return `El pago${cuando} de ${dinero(pago?.monto)}`;
}

/**
 * Por qué este pago NO puede dar un papel, o `null` si puede. Una sola función para los tres motivos, y es la que usan las dos
 * cosas que tienen que decir lo mismo: `armarComprobanteDeComision` (lanza con esta frase) y la ficha (la escribe en la tarjeta
 * del pago, en vez de un botón). Se le pregunta al núcleo si el pago trae lo que el papel dice (`estadoDelComprobante`).
 *
 * - Un pago ANULADO ya no pagó nada: sus rentas volvieron a «por pagar», y un papel que dijera «comisiones pagadas» sobre él
 *   afirmaría lo contrario de lo que el sistema sabe. El número se conserva (el empleado tiene el papel viejo), pero no se reimprime.
 * - Un pago DE ANTES de los comprobantes no guardó lo que se pagó renta por renta, y no se reconstruye: armarlo con las cifras de
 *   hoy diría «esto fue lo que se pagó» sobre algo que nadie guardó, y el papel saldría de la empresa. Tampoco se le pone un número
 *   al imprimir: una serie que el empleado nunca vio, y un pago viejo que parecería nuevo.
 * - Uno DAÑADO (trae el número sin el detalle o al revés, o unas filas que no suman lo que se pagó) se lee como un error de
 *   cuentas, así que no se arma.
 */
export function motivoSinComprobante(pago) {
  if (!pago || typeof pago !== 'object') return 'Falta el pago del que se imprime el comprobante.';
  if (pagoAnulado(pago)) {
    return `${nombreDelPago(pago)} está anulado${esFechaISO(pago.anuladoEn) ? ` desde el ${fecha(pago.anuladoEn)}` : ''}: `
      + 'ya no cuenta como pagado, y un comprobante de pago diría lo contrario.';
  }
  const estado = estadoDelComprobante(pago);
  if (estado.tipo === 'de-antes') {
    return 'Este pago se registró antes de que existieran los comprobantes de comisión, así que no tiene número ni guardó lo que se pagó '
      + 'renta por renta. Armarlo ahora con las cifras de hoy podría decir algo distinto de lo que se pagó ese día, y por eso no se arma. '
      + 'Los pagos que se registran desde ahora sí lo traen.';
  }
  if (estado.tipo === 'danado') {
    return `${nombreDelPago(pago)} no se puede imprimir: ${estado.motivo}. Avisa a quien lleva el sistema.`;
  }
  return null;
}

// ---------- El modelo: solo lo que se imprime ----------

/** Cronológico por la fecha en que regresó el carro, y a igual fecha por número de contrato: el papel sale siempre en el mismo orden. */
function porRegresoYContrato(a, b) {
  const orden = diasEntre(b.regreso, a.regreso);
  if (orden) return orden;
  return (Number(a.contrato) || 0) - (Number(b.contrato) || 0);
}

/** La renta de una fila, tal como el pago la guardó: nada más sale de aquí, y las cifras ya vienen hechas. */
function filaDelPapel(f) {
  return {
    regreso: String(f.fechaReal ?? ''),
    contrato: f.numero ?? null,
    placas: String(f.carroPlacas ?? ''),
    cliente: String(f.clienteNombre ?? ''),
    dias: f.dias,
    diasAtraso: f.diasAtraso,
    base: f.base,
    porcentaje: f.porcentajeComision,
    monto: f.monto,
  };
}

/**
 * Arma lo que se imprime. LANZA si no puede armarlo completo (un papel a medias sale de la empresa y ya no se puede corregir).
 *
 * Recibe:
 * - `pago`: el pago de comisión ya guardado, con su `numero`, `fecha`, `forma`, `monto` y `detalle[]`. Si no puede dar papel
 *   (`motivoSinComprobante`: anulado, de antes de los comprobantes o dañado) lanza con esa frase.
 * - `empleado`: `{ nombre, codigo }` del empleado, tal como los tiene su cuenta HOY. El nombre y el código no son una cifra: si se
 *   corrige una letra en la ficha del empleado, el papel lleva la corrección (como el del dueño de un carro lleva su nombre de hoy).
 *   Todo lo demás —número, fecha, forma, filas, total— es lo guardado.
 */
export function armarComprobanteDeComision({ pago, empleado } = {}) {
  const motivo = motivoSinComprobante(pago);
  if (motivo) throw new Error(motivo);
  if (!esFechaISO(pago.fecha)) {
    throw new Error(`El pago N° ${pago.numero} no trae una fecha válida: sin ella el comprobante no dice cuándo se pagó.`);
  }
  // (Un monto en cero no llega aquí: `estadoDelComprobante` pide que cada fila del detalle tenga comisión y que sumen el monto.)
  return {
    numero: pago.numero,
    fecha: pago.fecha,
    empleado: {
      nombre: String(empleado?.nombre ?? '').trim(),
      codigo: String(empleado?.codigo ?? '').trim(),
    },
    pagado: {
      filas: pago.detalle.map(filaDelPapel).sort(porRegresoYContrato),
      // El monto que se guardó, no una suma de las filas: es lo que se pagó, y `estadoDelComprobante` ya comprobó que las filas lo suman.
      total: q(pago.monto),
      forma: String(pago.forma ?? ''),
    },
  };
}

// ---------- La hoja ----------

function celdaDeDias(f) {
  // Base ÷ días tiene que poder leerse: si el carro se devolvió tarde, los días de atraso también cuentan para la base (§5).
  return f.diasAtraso > 0 ? `${f.dias} + ${f.diasAtraso} de atraso` : `${f.dias}`;
}

/** «5 %», «7.5 %»: el porcentaje que la renta tenía sellado ese día, tal como `comisionDe` lo guardó (ya pasó por `q()`; el núcleo comprobó que es un número). */
const celdaDeTasa = (valor) => `${valor} %`;

function filaHtml(f) {
  return `<tr>
        <td>${algo(fecha(f.regreso))}</td>
        <td>${f.contrato === null ? RAYA : esc(f.contrato)}</td>
        <td>${algo(f.placas)}</td>
        <td>${algo(f.cliente)}</td>
        <td class="num">${esc(celdaDeDias(f))}</td>
        <td class="num">${dinero(f.base)}</td>
        <td class="num">${esc(celdaDeTasa(f.porcentaje))}</td>
        <td class="num">${dinero(f.monto)}</td>
      </tr>`;
}

/**
 * La hoja, como texto HTML. Función pura: recibe el modelo de `armarComprobanteDeComision` y nada más. El orden es el del papel de
 * los dueños: membrete, a quién y número y fecha, la tabla de lo pagado con su total y su forma, firma.
 */
export function htmlComprobanteDeComision(m) {
  const e = m.empleado;
  return `<article class="comprobante" aria-label="Comprobante de pago de comisiones N° ${esc(m.numero)}">
  ${htmlDelMembrete()}

  <h1 class="comp-titulo">Comprobante de pago de comisiones</h1>

  <div class="comp-encabezado">
    <section class="comp-dueno" aria-label="Empleado">
      <p class="comp-etiqueta">Empleado</p>
      <p class="comp-dueno-nombre">${algo(e.nombre)}</p>
      <dl class="comp-datos">
        <div><dt>Código</dt><dd>${algo(e.codigo)}</dd></div>
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
    <h2>Comisiones pagadas</h2>
    <p class="comp-al-dia">Rentas incluidas en este pago: ${m.pagado.filas.length}.</p>
    <table class="comp-tabla">
      <thead>
        <tr>
          <th>Regresó</th>
          <th>Contrato</th>
          <th>Placas</th>
          <th>Cliente</th>
          <th class="num">Días</th>
          <th class="num">Base</th>
          <th class="num">%</th>
          <th class="num">Comisión</th>
        </tr>
      </thead>
      <tbody>
      ${m.pagado.filas.map(filaHtml).join('\n      ')}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="7">Total pagado</th>
          <td class="num">${dinero(m.pagado.total)}</td>
        </tr>
      </tfoot>
    </table>
    <p class="comp-forma">Forma de pago: <strong>${esc(textoDeForma(m.pagado.forma))}</strong></p>
  </section>

  <footer class="comp-firma">
    <div class="comp-firma-linea"></div>
    <p>Firma del empleado</p>
    <p class="comp-firma-nombre">${algo(e.nombre)}</p>
  </footer>
</article>`;
}

// ---------- La pantalla ----------

/**
 * Lo que se le avisa al dueño del NEGOCIO, solo en pantalla y antes de imprimir (`no-imprimir`): quien manda el papel, no quien lo
 * recibe. `avisos` son frases ya escritas por quien llama (la ficha sabe si las rentas de este pago hoy suman otra cosa); aquí solo
 * se dibujan, escapadas.
 */
function avisosDePantalla(avisos) {
  const frases = (Array.isArray(avisos) ? avisos : []).filter((a) => String(a ?? '').trim());
  if (!frases.length) return '';
  return `<div class="barra-lectura-fallida no-imprimir" role="alert">${frases.map((a) => `<p>${esc(a)}</p>`).join('')}</div>`;
}

/**
 * Dibuja el comprobante en `contenedor`, con su barra de botones. Devuelve el modelo, o `null` si no se pudo armar.
 *
 * Si `armarComprobanteDeComision` lanza, NO se dibuja una hoja: se dibuja una barra roja que dice por qué, igual que el papel de los
 * dueños. Una hoja a medias en pantalla es una hoja que alguien imprime.
 *
 * `entrada` es `{ pago, empleado, avisos }`. `imprimir` se puede inyectar solo para probar.
 */
export function pintarComprobanteDeComision(contenedor, entrada, { imprimir = () => window.print(), alVolver } = {}) {
  const volver = alVolver ? '<button type="button" class="btn" data-accion="volver">← Volver</button>' : '';
  let modelo;
  try {
    modelo = armarComprobanteDeComision(entrada);
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
  <p class="comp-ayuda no-imprimir">Para el PDF: Cmd + P y elige «Guardar como PDF». La primera vez apaga «Encabezados y pies de página» en el diálogo. Este papel dice lo que se pagó ese día: si lo imprimes de nuevo, sale igual.</p>
  ${avisosDePantalla(entrada.avisos)}
  ${htmlComprobanteDeComision(modelo)}
</div>`;

  const titulo = `Comprobante de comisión ${modelo.numero} - ${modelo.empleado.nombre}`;
  contenedor.querySelector('[data-accion="imprimir"]')?.addEventListener('click', () => imprimirConTitulo(titulo, imprimir));
  contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
  return modelo;
}
