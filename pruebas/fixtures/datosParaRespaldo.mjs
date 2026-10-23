// Los datos de un año de Best Price, tal como QUEDAN GUARDADOS, para probar el respaldo en Excel.
//
// Armados con las mismas funciones que los arman de verdad —`construirContrato` («Sacar carro»), `construirCierre` y
// `agregarPago` («Recibir carro»), `contratoParaGuardar` (datos.js), `construirCliente` y `construirVehiculo`—, no
// objetos escritos a mano con las llaves que la prueba necesita. Todos los datos personales son inventados y
// evidentes (el repositorio es público).
//
// Cada contrato cubre un caso que la hoja de Excel entiende distinto del sistema:
//
//   rentadoAlDia          -> sigue afuera, pagado en efectivo: sin cierre, sin fechas de regreso.
//   cerradoConDeAtodo     -> atraso, daños, combustible, descuento, seguros extra, carta poder y varios: la hoja lo suma todo.
//   pagadoConTarjeta      -> tres tarjetas (la hoja solo tiene dos), recargo del 12 %, garantía sin soltar.
//   ajenoPagadoAlDueno    -> carro subarrendado con costo del dueño, ya pagado al dueño.
//   ajenoSinPagar         -> el mismo, todavía por pagarle al dueño.
//   conCobrosSinColumna   -> hora tardía y varios al recibir: dos cobros que la hoja no suma.
//   pagoMixto             -> efectivo y tarjeta: la hoja solo guarda una forma de pago y un porcentaje.
//   devueltoDebiendo      -> el carro volvió y quedó un saldo por cobrar.
//
// Quién rentó (columna AL «RENTADO POR» y el COMENTARIO del respaldo). Los ocho de arriba llevan al empleado como lo sella «Sacar
// carro» hoy (`datosDelContratoPara`: id, nombre, código y porcentaje de ese día). Los tres de abajo son los casos que ya existen
// en sus datos y que el respaldo tiene que distinguir, y se arman aparte para que cada prueba pida el que necesita:
//
//   deAntesDeLaLista      -> de antes de la lista de empleados: `rentadoPor` es texto escrito a mano y el contrato NO trae ni la llave
//                            `empleadoId` ni `empleadoCodigo`.
//   conEmpleadoSinCodigo  -> un empleado de la lista al que no se le escribió código: `empleadoCodigo` es `null`.
//   sinQuienLoRento       -> ni nombre ni código (`rentadoPor` vacío): no hay nada que decir de quién fue.
//   deEmpleadoConCodigo   -> el de un código cualquiera, para probar cómo se escribe cada forma de código.
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { construirVehiculo } from '../../js/pantallas/carros.js';
import { construirCliente } from '../../js/nucleo/cliente.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { construirEmpleado, datosDelContratoPara } from '../../js/nucleo/empleado.js';
import { agregarPago, contratoParaGuardar, conCostoDelDueno } from '../../js/datos.js';
import { resumen } from '../../js/nucleo/contrato.js';

const AHORA = 1790000000000;
const sellar = (contrato, id, numero) => contratoParaGuardar(contrato, { id, numero, ahora: AHORA });

// ---------- clientes ----------
export const clientes = () => [
  construirCliente({ id: 'k-lopez', actualizado: AHORA }, {
    nombres: 'María del Carmen',
    apellidos: 'López de Pérez',
    fechaNacimiento: '1985-02-09',
    documento: 'DPI 0000 00001 0101',
    documentoExtendidoEn: 'Guatemala',
    documentoExpira: '2030-02-09',
    licencia: 'LIC-PRUEBA-0001',
    licenciaEmitidaEn: 'Mixco',
    licenciaExpira: '2029-06-30',
    direccionReferencia: '5a avenida 10-20 zona 1, frente al parque',
    municipio: 'Guatemala',
    telefono: '5555-0001',
    correo: 'prueba1@example.com',
    direccionAdicional: 'Km 14 carretera a El Salvador',
    ciudadAdicional: 'Santa Catarina Pinula',
    estadoAdicional: 'Guatemala',
    paisAdicional: 'Guatemala',
    telefonoAdicional: '5555-0002',
    // Un cliente que vino del Excel conserva lo que la ficha de hoy ya no pide.
    nacionalidad: 'Guatemalteca',
    licenciaEmision: '2019-06-30',
  }),
  construirCliente({ id: 'k-zelaya', actualizado: AHORA - 5000 }, { nombres: 'Ana', apellidos: 'Álvarez Zelaya', documento: 'PAS-PRUEBA-77', telefono: '5555-0003' }),
  // Un cliente con la forma vieja de cuatro campos, como los que llegaron del Excel.
  { id: 'k-viejo', actualizado: AHORA - 9000, nombre1: 'Zacarías', nombre2: 'José', apellido1: 'Aguilar', apellido2: 'Montes', documento: 'DPI 0000 00003 0101', telefono: '5555-0004' },
  // Un cliente que nunca rentó este año.
  construirCliente({ id: 'k-sin-renta', actualizado: AHORA - 20000 }, { nombres: 'Bruno', apellidos: 'Barrios', telefono: '5555-0005' }),
];

// ---------- carros de la flota (con un hueco en los códigos: no hay carro 3) ----------
export const vehiculos = () => [
  { ...construirVehiculo(null, { placas: 'P-111AAA', tipo: 'Pick up', marca: 'Toyota', linea: 'Hilux', color: 'Blanco', modelo: 2024 }), id: 'v1', codigo: 1, actualizado: AHORA },
  { ...construirVehiculo(null, { placas: 'P-222BBB', tipo: 'Camioneta', marca: 'Mitsubishi', linea: 'Montero', color: 'Plateado', modelo: 2023 }), id: 'v2', codigo: 2, actualizado: AHORA },
  {
    ...construirVehiculo(null, {
      placas: 'P-444DDD', tipo: 'Sedán', marca: 'Kia', linea: 'Rio', color: 'Rojo', modelo: 2021, fueraDeServicio: true, motivoFueraDeServicio: 'En el taller',
    }),
    id: 'v4',
    codigo: 4,
    actualizado: AHORA,
  },
];

// Los empleados, armados con el constructor de la ficha y sellados en el contrato como lo hace «Sacar carro».
const empleado = (id, nombre, codigo) => construirEmpleado({ id }, { codigo, nombre, porcentajeComision: 5 });
const ANA = empleado('e-ana', 'Ana', '6');
const delEmpleado = (e) => datosDelContratoPara(e);

const cliente = (id, nombres, apellidos) => ({ id, nombres, apellidos });
const hilux = { id: 'v1', placas: 'P-111AAA', marca: 'Toyota', linea: 'Hilux', color: 'Blanco' };
const montero = { id: 'v2', placas: 'P-222BBB', marca: 'Mitsubishi', linea: 'Montero', color: 'Plateado' };
const FRONTERA = {
  placas: 'P-999ZZZ', tipo: 'Pick up', marca: 'Nissan Frontier', color: 'Gris', modelo: '2022', dueno: 'Carlos Méndez', costoDia: 300,
};

const salida = (extra) => construirContrato({
  cliente: cliente('k-lopez', 'María del Carmen', 'López de Pérez'), ajeno: false, carro: hilux, precioDia: 700, forma: 'efectivo', porcentajeTarjeta: 0, ...delEmpleado(ANA), ...extra,
});

export const rentadoAlDia = () => sellar(salida({
  id: 'c-afuera', numero: 101, fechaSalida: '2026-10-09', dias: 5, montoPago: 3500, horaSalida: '09:30', lugar: 'Oficina', combustibleSalida: 'Lleno', kmSalida: 45000, observaciones: 'Cliente frecuente',
}), 'c-afuera', 101);

export const cerradoConDeAtodo = () => {
  const abierto = salida({
    id: 'c-completo',
    numero: 102,
    fechaSalida: '2026-09-01',
    dias: 4,
    montoPago: 3525,
    horaSalida: '15:00',
    lugar: 'Aeropuerto',
    combustibleSalida: '3/4',
    kmSalida: 50000,
    seguroDia: 72,
    seguroTercerosDia: 120,
    seguroMenoresDia: 30,
    seguroPaiDia: 20,
    deducible: 55000,
    deducibleBajo: 100,
    cartaPoderDestino: 'El Salvador',
    cartaPoderPrecio: 350,
    variosDescripcion: 'Silla de bebé',
    variosPrecio: 75,
    conductorAdicional: { nombre: 'Pedro Pérez', licencia: 'LIC-PRUEBA-0002', identificacion: 'DPI 0000 00002 0101' },
    observaciones: 'Entrega en el aeropuerto',
  });
  const recibido = construirCierre(abierto, {
    fechaReal: '2026-09-06', horaReal: '11:15', lugarEntrada: 'Oficina', kmEntrada: 50620, combustible: 80, danos: 200, danosDetalle: 'Golpe en la puerta', varios: 0, descuento: 100,
  });
  const cobrado = agregarPago(recibido, { monto: resumen(recibido).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-09-06' });
  return sellar(cobrado, 'c-completo', 102);
};

export const pagadoConTarjeta = () => {
  const abierto = salida({
    id: 'c-tarjeta',
    numero: 103,
    cliente: cliente('k-zelaya', 'Ana', 'Álvarez Zelaya'),
    carro: montero,
    fechaSalida: '2026-08-10',
    dias: 3,
    precioDia: 800,
    forma: 'tarjeta',
    porcentajeTarjeta: 12,
    montoPago: 2400,
    kmSalida: 12000,
    tarjetas: [
      {
        ultimos4: '4242', vencimiento: '04/30', banco: 'BAC', autorizacion: 'A123', montoAutorizado: 5000,
      },
      {
        ultimos4: '1111', vencimiento: '11/29', banco: 'Banrural', autorizacion: 'B456', montoAutorizado: 3000,
      },
      {
        ultimos4: '9999', vencimiento: '01/31', banco: 'G&T Continental', autorizacion: 'C789', montoAutorizado: 2000,
      },
    ],
  });
  return sellar(construirCierre(abierto, {
    fechaReal: '2026-08-13', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 12400, combustible: 0, danos: 0, varios: 0, descuento: 0,
  }), 'c-tarjeta', 103);
};

const ajeno = (id, numero, extra = {}) => {
  const abierto = construirContrato({
    id,
    numero,
    cliente: cliente('k-viejo', 'Zacarías José', 'Aguilar Montes'),
    ajeno: true,
    carroAjeno: FRONTERA,
    duenoId: 'd-mendez',
    fechaSalida: '2026-07-01',
    dias: 4,
    precioDia: 900,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 3600,
    ...delEmpleado(ANA),
    ...extra,
  });
  const recibido = construirCierre(abierto, {
    fechaReal: '2026-07-05', horaReal: '18:00', lugarEntrada: 'Oficina', kmEntrada: 80000, combustible: 0, danos: 0, varios: 0, descuento: 0,
  });
  // Lo que queda en la nube NO trae el costo del dueño (ADR-002): el respaldo lo recibe del área de dinero.
  return sellar(recibido, id, numero);
};
export const ajenoPagadoAlDueno = () => ajeno('c-ajeno-pagado', 104);
export const ajenoSinPagar = () => ajeno('c-ajeno-debe', 105, { fechaSalida: '2026-07-10' });
/** El contrato ajeno con el costo del dueño puesto, como lo entrega `cargarContratosParaDinero`. */
export const conElCostoDelDueno = (c) => conCostoDelDueno(c, FRONTERA.costoDia);

export const conCobrosSinColumna = () => {
  const abierto = salida({
    id: 'c-sin-columna', numero: 106, fechaSalida: '2026-05-04', dias: 2, montoPago: 1400, kmSalida: 70000,
  });
  const recibido = construirCierre(abierto, {
    fechaReal: '2026-05-06', horaReal: '14:00', lugarEntrada: 'Oficina', kmEntrada: 70300, combustible: 0, danos: 0, horaTardia: 150, varios: 50, variosDetalle: 'Llave perdida', descuento: 0,
  });
  const cobrado = agregarPago(recibido, { monto: resumen(recibido).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-05-06' });
  return sellar(cobrado, 'c-sin-columna', 106);
};

export const pagoMixto = () => {
  const abierto = salida({
    id: 'c-mixto', numero: 107, fechaSalida: '2026-04-01', dias: 2, montoPago: 1000, kmSalida: 1000,
  });
  const conSegundoPago = agregarPago(abierto, { monto: 400, forma: 'tarjeta', porcentajeTarjeta: 5, fecha: '2026-04-03' });
  return sellar(construirCierre(conSegundoPago, {
    fechaReal: '2026-04-03', horaReal: '09:00', lugarEntrada: 'Oficina', kmEntrada: 1300, combustible: 0, danos: 0, varios: 0, descuento: 0,
  }), 'c-mixto', 107);
};

export const devueltoDebiendo = () => {
  const abierto = salida({
    id: 'c-debe', numero: 108, fechaSalida: '2026-03-02', dias: 3, montoPago: 2100, kmSalida: 5000,
  });
  return sellar(construirCierre(abierto, {
    fechaReal: '2026-03-05', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 5200, combustible: 0, danos: 300, danosDetalle: 'Espejo roto', varios: 0, descuento: 0,
  }), 'c-debe', 108);
};

/**
 * Un contrato de antes de la lista de empleados: «¿Quién lo rentó?» era un texto libre. Lo que `construirContrato` arma hoy
 * (`empleadoId` y `empleadoCodigo` en `null`) tampoco es eso: ese contrato ni siquiera traía las llaves, y aquí se le quitan.
 */
export const deAntesDeLaLista = () => {
  const c = sellar(salida({
    id: 'c-viejo', numero: 109, fechaSalida: '2026-02-02', dias: 2, montoPago: 1400, kmSalida: 900, rentadoPor: 'juan', empleadoId: undefined, empleadoCodigo: undefined, porcentajeComision: null,
  }), 'c-viejo', 109);
  delete c.empleadoId;
  delete c.empleadoCodigo;
  return c;
};

/** Un empleado de la lista que se registró sin código: el contrato selló `empleadoCodigo: null`, no un vacío que parezca un código. */
export const conEmpleadoSinCodigo = () => sellar(salida({
  id: 'c-sin-codigo', numero: 110, fechaSalida: '2026-02-09', dias: 2, montoPago: 1400, kmSalida: 1900, ...delEmpleado(empleado('e-luis', 'Luis', '')),
}), 'c-sin-codigo', 110);

/** Ni nombre ni código: no hay nada que decir de quién lo rentó. */
export const sinQuienLoRento = () => sellar(salida({
  id: 'c-sin-nadie', numero: 111, fechaSalida: '2026-02-16', dias: 2, montoPago: 1400, kmSalida: 2900, rentadoPor: '', empleadoId: undefined, empleadoCodigo: undefined, porcentajeComision: null,
}), 'c-sin-nadie', 111);

/** Un contrato de un empleado con ESE código (tal como lo escribió en su ficha). */
export const deEmpleadoConCodigo = (codigo, numero = 112) => sellar(salida({
  id: `c-codigo-${numero}`, numero, fechaSalida: '2026-02-23', dias: 2, montoPago: 1400, kmSalida: 3900, ...delEmpleado(empleado('e-otro', 'Marta', codigo)),
}), `c-codigo-${numero}`, numero);

/** Un contrato de otro año: no debe entrar al archivo de 2026. */
export const deOtroAnio = () => sellar(salida({
  id: 'c-2025', numero: 77, fechaSalida: '2025-12-30', dias: 2, montoPago: 1400,
}), 'c-2025', 77);

/** Todos los contratos de 2026, con el costo del dueño de los ajenos ya mezclado (lo que entrega el área de dinero). */
export const contratosDe2026 = () => [
  rentadoAlDia(), cerradoConDeAtodo(), pagadoConTarjeta(),
  conElCostoDelDueno(ajenoPagadoAlDueno()), conElCostoDelDueno(ajenoSinPagar()),
  conCobrosSinColumna(), pagoMixto(), devueltoDebiendo(),
];

/** Los pagos a dueños: el contrato 104 ya se le pagó, el 105 no. */
export const pagosDueno = () => [
  {
    id: 'pd-1', duenoId: 'd-mendez', fecha: '2026-07-20', forma: 'efectivo', monto: 1200, contratos: ['c-ajeno-pagado'], numero: 1, actualizado: AHORA,
  },
];
