// Un contrato de un carro de la flota tal como QUEDA GUARDADO, armado con las
// mismas funciones que lo arman de verdad: `construirContrato` (Sacar carro),
// `construirCierre` (Recibir carro) y `contratoParaGuardar` (datos.js). No es un
// objeto escrito a mano con las llaves que la prueba necesita: lleva cada llave
// y cada tipo que lleva uno real, incluido `estado`, que se deriva al guardar.
//
// Sirve para las pruebas que preguntan «¿hasta cuándo ocupa este contrato su
// carro?»: el marcador de un regreso es `cierre.fechaReal` y ningún otro (§7b del
// diseño; `fechaDevolucion` y `cerrado` NO existen, y una vez se inventaron).
//
//   contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9 })
//       -> sale el 3 de octubre y debe volver el 12; el carro sigue afuera.
//   contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06' })
//       -> el mismo, recibido el 6, con Q200 de daños sin cobrar: el carro ya está
//          en el patio pero el contrato sigue abierto (`estado: 'devuelto'`),
//          que es justo el contrato que el mostrador ve «ocupando» el carro.
//   con `danos: 0` se paga todo y se suelta la garantía: queda `cerrado`.
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { agregarPago, contratoParaGuardar } from '../../js/datos.js';
import { resumen } from '../../js/nucleo/contrato.js';

const AHORA = 1790000000000;

export function contratoDeUnCarro({
  id = 'c-del-carro', numero = 50, carroId = 'v1', placas = 'P-111AAA',
  fechaSalida, dias, recibidoEl = null, danos = 200,
} = {}) {
  const salida = construirContrato({
    id,
    numero,
    cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' },
    ajeno: false,
    carro: { id: carroId, placas, marca: 'Toyota', linea: 'Hilux', color: 'Blanco' },
    carroAjeno: null,
    duenoId: null,
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
  if (!recibidoEl) return contratoParaGuardar(salida, { id, numero, ahora: AHORA });

  const recibido = construirCierre(salida, {
    fechaReal: recibidoEl, horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos, varios: 0, descuento: 0,
  });
  // Con daños el cliente todavía debe: el contrato queda abierto. Sin daños no
  // debe nada y, al ser en efectivo, no hay garantía que soltar: queda cerrado.
  const cobrado = danos > 0
    ? recibido
    : agregarPago(recibido, { monto: resumen(recibido).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: recibidoEl });
  return contratoParaGuardar(cobrado, { id, numero, ahora: AHORA });
}
