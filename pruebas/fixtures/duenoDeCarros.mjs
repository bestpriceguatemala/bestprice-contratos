// Contratos de carro ajeno y pagos a su dueño, tal como quedan GUARDADOS, armados con las mismas funciones que los arman de
// verdad —`construirContrato` («Sacar carro»), `construirCierre` («Recibir carro»), `agregarPago`, `contratoParaGuardar`,
// `conCostoDelDueno` (lo que el área de dinero vuelve a poner), `construirPagoDueno` y `pagoDuenoParaGuardar`—, no objetos
// escritos a mano (§7b del diseño). Mismo recorrido que pruebas/liquidacion.test.mjs, reunido aquí para que las pruebas de
// la auditoría de mutaciones (auditoria-cuentas, auditoria-comprobante) no lo copien.
//
//   cerrado('c1')                  -> 4 días × Q300 = Q1,200, cerrado, pagado por el cliente.
//   cerrado('c1', 2)               -> con 2 días de atraso ya cobrados: Q1,800.
//   devuelto('c1', 2)              -> volvió con 2 días de atraso que el cliente todavía no paga: abierto.
//   sinCostoLeido('c1')            -> el mismo, leído SIN su costo (falló la lectura de privado/dinero).
//   pagoReal({ id, numero, contratos, pagos, idsMarcados, descuento }) -> el pago como lo arma la pantalla.
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { resumen } from '../../js/nucleo/contrato.js';
import { sumarDias } from '../../js/nucleo/fechas.js';
import {
  agregarPago, contratoParaGuardar, conCostoDelDueno, costoDelDocumento, construirPagoDueno, pagoDuenoParaGuardar,
} from '../../js/datos.js';

export const AHORA = 1790000000000;
export const CLIENTE = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };
export const ids = (lista) => lista.map((c) => c.id);

export function salida({
  id, numero = 1, costoDia = 300, dias = 4, fechaSalida = '2026-09-01', duenoId = undefined, dueno = 'Don Mario',
}) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno, costoDia,
    },
    duenoId,
    fechaSalida,
    dias,
    precioDia: 700,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}
export const recibido = (c, atraso = 0) => construirCierre(c, {
  fechaReal: sumarDias(c.devolucionPrevista, atraso), horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
});
export const saldado = (c) => agregarPago(c, {
  monto: resumen(c).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: c.cierre.fechaReal,
});
/** Lo que llega al área de dinero: guardado, y con el costo del dueño vuelto a poner (`conCostoDelDueno`). */
export const guardado = (c) => conCostoDelDueno(contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA }), costoDelDocumento(c));
/** Cerrado con `atraso` días de atraso ya cobrados al cliente. */
export const cerrado = (id, atraso = 0, opciones = {}) => guardado(saldado(recibido(salida({ id, ...opciones }), atraso)));
/** El carro volvió con `atraso` días y el cliente todavía no paga esos días: devuelto, no cerrado. */
export const devuelto = (id, atraso, opciones = {}) => guardado(recibido(salida({ id, ...opciones }), atraso));
/** El mismo contrato leído SIN su costo: la lectura de `privado/dinero` falló (`costoSinLeer`). */
export const sinCostoLeido = (id) => contratoParaGuardar(saldado(recibido(salida({ id }))), { id, numero: 1, ahora: AHORA });

/** Un pago a un dueño armado como lo arma la pantalla: `construirPagoDueno` + `pagoDuenoParaGuardar`. */
export function pagoReal({
  id, numero, contratos, pagos = [], idsMarcados, descuento,
}) {
  const armado = construirPagoDueno({
    duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', contratos, pagos, idsMarcados, costoSinLeer: [], descuento,
  });
  return pagoDuenoParaGuardar(armado, { id, numero, ahora: AHORA });
}

