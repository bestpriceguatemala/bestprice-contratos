// Clientes, carros y contratos para probar el buscador, armados con las funciones que los arman de verdad:
// `construirCliente` (nucleo/cliente.js), `construirVehiculo` (pantallas/carros.js), y `construirContrato` (Sacar carro) +
// `construirCierre` (Recibir carro) + `contratoParaGuardar` (datos.js). Ningún objeto escrito a mano con las llaves que la
// prueba necesita: lleva las llaves y los tipos de uno guardado, el `numero` como NÚMERO (14591), no como el texto «014591»
// que imprime el papel.
//
//   clienteDe('k1', { nombres: 'Juan', apellidos: 'Pérez', telefono: '3078-4155' })
//   carroDe('v1', { placas: 'P-234IFN', marca: 'Toyota', linea: 'Yaris' })
//   contratoDe({ numero: 14591, cliente, carro })                          -> rentado, el carro sigue afuera
//   contratoDe({ numero: 14591, cliente, carro, recibidoEl: '2026-10-06' }) -> devuelto, con Q200 de daños sin cobrar
//   contratoDe({ numero: 14591, cliente, carro, recibidoEl: '2026-10-06', danos: 0 }) -> cerrado
//   contratoDe({ numero: 14591, cliente, carroAjeno: { placas: 'C-777XYZ', ... } })       -> carro de otra persona
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirVehiculo } from '../../js/pantallas/carros.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { construirCliente } from '../../js/nucleo/cliente.js';
import { agregarPago, contratoParaGuardar } from '../../js/datos.js';
import { resumen } from '../../js/nucleo/contrato.js';

const AHORA = 1790000000000;

/** Un cliente con su `id`, como queda guardado. */
export const clienteDe = (id, campos) => ({ id, ...construirCliente({}, campos) });

/** Un carro de la flota propia con su `id`, como queda guardado. */
export const carroDe = (id, campos) => ({ id, ...construirVehiculo({}, campos) });

export function contratoDe({
  id: idPedido, numero, cliente, carro = null, carroAjeno = null,
  fechaSalida = '2026-10-01', dias = 3, recibidoEl = null, danos = 200, rentadoPor = 'Ana',
}) {
  const id = idPedido ?? `c-${numero}`;
  const ajeno = Boolean(carroAjeno);
  const salida = construirContrato({
    id,
    numero,
    cliente,
    ajeno,
    carro: ajeno ? null : carro,
    carroAjeno: ajeno ? carroAjeno : null,
    duenoId: null,
    fechaSalida,
    dias,
    precioDia: 700,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor,
    porcentajeComision: 5,
  });
  if (!recibidoEl) return contratoParaGuardar(salida, { id, numero, ahora: AHORA });

  const recibido = construirCierre(salida, {
    fechaReal: recibidoEl, horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos, varios: 0, descuento: 0,
  });
  const cobrado = danos > 0
    ? recibido
    : agregarPago(recibido, { monto: resumen(recibido).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: recibidoEl });
  return contratoParaGuardar(cobrado, { id, numero, ahora: AHORA });
}
