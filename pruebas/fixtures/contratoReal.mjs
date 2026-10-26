// Un contrato tal como QUEDA GUARDADO, armado con las mismas funciones que lo arman de verdad —
// `construirContrato` («Sacar carro»), `agregarPago` (cobrar), `construirCierre` («Recibir carro»)
// y `contratoParaGuardar` (datos.js, que sella `estado`)— y con todo lo que el cobro puede tocar a la
// vista: días, precio, seguros, carta poder, varios, pagos con su recargo de tarjeta y el cierre.
// No es un objeto escrito a mano con las llaves que la prueba necesita (§7b del diseño).
//
// Lo usan las pruebas de la auditoría de mutaciones (pruebas/auditoria-*.test.mjs), que necesitan
// llegar a los bordes del cobro (un atraso de 3 días con seguros, un descuento que deja el cobro en
// cero…) sin repetir cada vez los veinte campos de «Sacar carro».
//
//   contratoReal({ dias: 3, precioDia: 700 })                       -> sale el 1 oct, debe volver el 4; sin pagos.
//   contratoReal({ dias: 2, seguroPaiDia: 25, recibidoEl: '2026-10-06' })
//                                                                   -> volvió con 3 días de atraso.
//   contratoReal({ pagos: [{ monto: 1000, forma: 'tarjeta', porcentajeTarjeta: 12 }] })
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { agregarPago, contratoParaGuardar } from '../../js/datos.js';

export const AHORA = 1790000000000;
export const CLIENTE = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };
/** Una tarjeta autorizada como garantía (solo los últimos 4 dígitos, ADR-001). */
export const TARJETA = {
  ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000,
};

/** Lo que «Sacar carro» arma, sin pagos ni cierre. */
export function salidaReal({
  id = 'c-real', numero = 77, fechaSalida = '2026-10-01', dias = 3, precioDia = 700,
  seguroMenoresDia = 0, seguroPaiDia = 0, deducibleBajo = 0,
  cartaPoderDestino = '', cartaPoderPrecio = 0, variosDescripcion = '', variosPrecio = 0,
  kmSalida = 0, ajeno = false, costoDia = 0, dueno = 'Don Mario', porcentajeComision = 5, tarjetas = [],
} = {}) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno,
    carro: ajeno ? null : { id: 'v1', placas: 'P-111AAA', marca: 'Toyota', linea: 'Hilux', color: 'Blanco' },
    carroAjeno: ajeno
      ? { placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno, costoDia }
      : null,
    fechaSalida,
    dias,
    precioDia,
    kmSalida,
    seguroMenoresDia,
    seguroPaiDia,
    deducibleBajo,
    cartaPoderDestino,
    cartaPoderPrecio,
    variosDescripcion,
    variosPrecio,
    tarjetas,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 0,
    rentadoPor: 'Ana',
    porcentajeComision,
  });
}

/** Los campos que «Recibir carro» le pasa a `construirCierre`; lo que no se pida queda en cero. */
export function camposDeCierre({ recibidoEl, ...resto }) {
  return {
    fechaReal: recibidoEl, horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0, ...resto,
  };
}

/**
 * El contrato guardado. `pagos` son abonos `{ monto, forma, porcentajeTarjeta, fecha }` que se agregan con
 * `agregarPago`; `recibidoEl` (más lo que se pase en `cierre`) lo cierra con `construirCierre`.
 */
export function contratoReal({ pagos = [], recibidoEl = null, cierre = {}, ...salida } = {}) {
  let c = salidaReal(salida);
  if (recibidoEl) c = construirCierre(c, camposDeCierre({ recibidoEl, ...cierre }));
  for (const p of pagos) {
    c = agregarPago(c, {
      forma: 'efectivo', porcentajeTarjeta: 0, fecha: recibidoEl ?? c.fechaSalida, ...p,
    });
  }
  return contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA });
}
