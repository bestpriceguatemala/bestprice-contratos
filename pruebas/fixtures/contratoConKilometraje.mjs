// Un contrato de un carro de la flota CON kilometraje, tal como QUEDA GUARDADO, armado con las mismas funciones que lo
// arman de verdad: `construirContrato` (Sacar carro), `construirCierre` (Recibir carro) y `contratoParaGuardar`
// (datos.js). Es el hermano de `contratoDeUnCarro`, que siempre recibe el carro con `kmEntrada: 0`; el mantenimiento
// necesita justo lo que ése deja en cero, y un contrato escrito a mano con `kmEntrada: 12000` pasaría las pruebas sin decir
// nada del sistema (§7b: la suite estaría comprobando sus propios datos de prueba).
//
//   contratoConKilometraje({ id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800 })
//       -> salió con 14,000 y volvió con 14,800: cerrado.
//   contratoConKilometraje({ ..., recibidoEl: null })        -> el carro sigue afuera (solo trae `kmSalida`).
//   contratoConKilometraje({ ..., nombreViejo: true })       -> como lo guardaba «Sacar carro» antes del cambio de
//                                                              nombre: `kilometrajeSalida` en vez de `kmSalida`.
//   contratoConKilometraje({ ..., ajeno: true })              -> de un carro ajeno: no trae `carroId`.
//   kmSalida / kmEntrada en 0 (o sin ponerlos) = «no se anotó»: así los deja el formulario con el campo vacío.
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { agregarPago, contratoParaGuardar } from '../../js/datos.js';
import { resumen } from '../../js/nucleo/contrato.js';

const AHORA = 1790000000000;

export function contratoConKilometraje({
  id, numero, carroId = 'v1', placas = 'P-111AAA', fechaSalida, dias = 3, kmSalida = 0, recibidoEl = null, kmEntrada = 0,
  ajeno = false, nombreViejo = false,
}) {
  const salida = construirContrato({
    id,
    numero,
    cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' },
    ajeno,
    carro: ajeno ? null : { id: carroId, placas, marca: 'Toyota', linea: 'Hilux', color: 'Blanco' },
    carroAjeno: ajeno ? { placas: 'P-999ZZZ', tipo: 'Sedán', marca: 'Kia', color: 'Gris', modelo: '2020', dueno: 'Luis', costoDia: 300 } : null,
    duenoId: null,
    fechaSalida,
    dias,
    precioDia: 700,
    kmSalida,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
  let guardado;
  if (!recibidoEl) {
    guardado = contratoParaGuardar(salida, { id, numero, ahora: AHORA });
  } else {
    const recibido = construirCierre(salida, {
      fechaReal: recibidoEl, horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada, combustible: 0, danos: 0, varios: 0, descuento: 0,
    });
    // Sin daños no debe nada y, al ser en efectivo, no hay garantía que soltar: queda cerrado.
    const cobrado = agregarPago(recibido, {
      monto: resumen(recibido).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: recibidoEl,
    });
    guardado = contratoParaGuardar(cobrado, { id, numero, ahora: AHORA });
  }
  if (!nombreViejo) return guardado;
  // Un contrato de antes del cambio de nombre: la misma cifra, bajo el nombre que ya no escribe nadie.
  const { kmSalida: km, ...resto } = guardado;
  return { ...resto, kilometrajeSalida: km };
}
