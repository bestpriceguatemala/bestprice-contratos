// Rentas tal como QUEDAN GUARDADAS, para las pruebas de las comisiones de los empleados. Armadas con las mismas
// funciones que las arman de verdad —`datosDelContratoPara` (lo que el formulario toma del empleado escogido),
// `construirContrato` («Sacar carro»), `construirCierre` («Recibir carro») y `contratoParaGuardar` (datos.js)—,
// no objetos escritos a mano con las llaves que la prueba necesita (§7b del diseño).
//
//   renta({ id, empleado, recibidoEl })     -> una renta de ese empleado; sin `recibidoEl` el carro sigue afuera
//   rentaDeAntes({ id, rentadoPor })        -> la de antes de la lista de empleados: un nombre escrito a mano,
//                                              el 5 % de entonces y NI SIQUIERA la llave `empleadoId`
//
// 4 días a Q700 dan una base de Q2,800: al 5 % son Q140.00 de comisión; al 0 % de Wilder, Q0.00.
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { contratoParaGuardar } from '../../js/datos.js';
import { datosDelContratoPara } from '../../js/nucleo/empleado.js';

const AHORA = 1790000000000;

export const EMPLEADOS = {
  ana: { id: 'e1', codigo: '1', nombre: 'Ana López', porcentajeComision: 5, activo: true },
  wilder: { id: 'e6', codigo: '6', nombre: 'Wilder', porcentajeComision: 0, activo: true },
  luis: { id: 'e16', codigo: '16', nombre: 'Luis Mérida', porcentajeComision: 7.5, activo: true },
};

function armar({
  id, numero, datosDelEmpleado, fechaSalida, dias, precioDia, recibidoEl, descuento, ajeno, danos,
}) {
  const salida = construirContrato({
    id,
    numero,
    cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' },
    ajeno,
    carro: ajeno ? null : { id: `v-${id}`, placas: `P-${numero}AAA`, marca: 'Toyota', linea: 'Hilux', color: 'Blanco' },
    carroAjeno: ajeno
      ? { placas: `P-${numero}AJN`, tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno: 'Don Mario', costoDia: 400 }
      : null,
    duenoId: null,
    fechaSalida,
    dias,
    precioDia,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * precioDia,
    ...datosDelEmpleado,
  });
  const final = recibidoEl
    ? construirCierre(salida, {
      fechaReal: recibidoEl, horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos, varios: 0, descuento,
    })
    : salida;
  return contratoParaGuardar(final, { id, numero, ahora: AHORA });
}

/** Una renta de un empleado de la lista: lleva su `empleadoId`, su nombre de ese día y su porcentaje de ese día. */
export function renta({
  id, numero = 1, empleado = EMPLEADOS.ana, fechaSalida = '2026-10-01', dias = 4, precioDia = 700,
  recibidoEl = null, descuento = 0, ajeno = false, danos = 0,
}) {
  return armar({
    id, numero, datosDelEmpleado: datosDelContratoPara(empleado), fechaSalida, dias, precioDia, recibidoEl, descuento, ajeno, danos,
  });
}

/**
 * Una renta de antes de que existiera la lista de empleados: el nombre escrito a mano en `rentadoPor`, el
 * porcentaje que el formulario traía (5), y sin la llave `empleadoId` (§7b: los contratos de antes no la traen).
 */
export function rentaDeAntes({
  id, numero = 1, rentadoPor = 'Wilder', porcentajeComision = 5, fechaSalida = '2026-09-25', dias = 4, precioDia = 700,
  recibidoEl = null, descuento = 0, ajeno = false, danos = 0,
}) {
  const guardado = armar({
    id, numero, datosDelEmpleado: { rentadoPor, porcentajeComision }, fechaSalida, dias, precioDia, recibidoEl, descuento, ajeno, danos,
  });
  const { empleadoId: _no, ...sinLlave } = guardado;
  return sinLlave;
}

/** Un pago de comisión tal como queda guardado (§7b): sin copia local, sin número de comprobante. */
export function pagoDeComision({
  id, empleadoId = 'e1', fecha = '2026-10-20', forma = 'efectivo', monto, contratos, anulado = false, anuladoEn,
}) {
  return {
    id, empleadoId, fecha, forma, monto, contratos, actualizado: AHORA, ...(anulado ? { anulado: true, anuladoEn: anuladoEn ?? '2026-10-21' } : {}),
  };
}
