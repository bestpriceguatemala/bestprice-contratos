// «Sacar carro» y las reservaciones que solo piden un TIPO.
//
// El punto ciego (H-5, preocupación 3): `avisosDeSalida` solo miraba las reservaciones clavadas a ESE carro. Darle
// la Ranger a un cliente no decía nada de una reservación «Pickup» sin carro elegido para los mismos días, que
// cuenta con la única pickup que hay: se entrega el carro en el mostrador y se sabe cuando llega el otro cliente.
//
// La pregunta es la misma que el formulario de reservaciones ya contesta (¿puede cada compromiso seguir teniendo un
// carro propio?) y la regla es UNA (`cabeEnElTipo`, nucleo/reserva.js). Estas pruebas comprueban el aviso desde el
// lado de la salida y, sobre todo, que las dos pantallas nunca se contradigan.
//
// Todo se arma con lo que arma los de verdad: `construirVehiculo`, `construirReserva` + `reservaParaGuardar`,
// `contratoDeUnCarro` y `construirContrato` (el borrador de la salida, con su `devolucionPrevista`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisosDeSalida } from '../js/nucleo/avisos.js';
import { choquesDeReserva, construirReserva, reservasQueSeQuedanSinCarro } from '../js/nucleo/reserva.js';
import { reservaParaGuardar } from '../js/datos.js';
import { construirVehiculo } from '../js/pantallas/carros.js';
import { construirContrato, entradaDeAvisos } from '../js/pantallas/sacarCarro.js';
import { diasEntre, sumarDias } from '../js/nucleo/fechas.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';

// ---------- Armar el escenario ----------

const HOY = '2026-10-12';

const carro = (id, tipo, extra = {}) => construirVehiculo({ id }, {
  placas: `P-${id}`, marca: 'Marca', linea: id, color: 'Blanco', modelo: 2022, tipo, ...extra,
});

/** Una reservación tal como queda guardada. `desde`/`hasta` son fechas ISO: la salida y la devolución prevista. */
const apartada = (id, desde, hasta, campos = {}) => reservaParaGuardar(construirReserva({ id }, {
  clienteNombre: 'Ana', telefono: '5555-0000', precioDia: 600, anticipo: 0,
  fechaSalida: desde, dias: diasEntre(desde, hasta), ...campos,
}), { id, ahora: 1 });

/** Un contrato abierto de ese carro, tal como lo deja guardar Sacar carro. */
const rentado = (id, carroId, desde, hasta, extra = {}) => contratoDeUnCarro({
  id, numero: 70, carroId, placas: `P-${carroId}`, fechaSalida: desde, dias: diasEntre(desde, hasta), ...extra,
});

/** El borrador de la salida que arma la pantalla: `construirContrato` con lo que el mostrador escribió. */
const salida = (miCarro, desde, hasta) => construirContrato({
  id: null,
  numero: null,
  cliente: { id: 'k9', nombres: 'Cliente', apellidos: 'Nuevo' },
  ajeno: false,
  carro: miCarro,
  carroAjeno: null,
  duenoId: null,
  fechaSalida: desde,
  dias: diasEntre(desde, hasta),
  precioDia: 700,
  tarjetas: [],
  forma: 'efectivo',
  porcentajeTarjeta: 0,
  montoPago: 0,
  rentadoPor: 'Ana',
  porcentajeComision: 5,
});

const clienteSinProblemas = { id: 'k9', licenciaExpira: '2030-01-01', documentoExpira: '2030-01-01' };

/** Lo que la pantalla le pasa a `avisosDeSalida` para sacar `carroId` del `desde` al `hasta`. */
function sacar({
  flota, carroId, desde, hasta, reservas = [], contratosAbiertos = [], hoy = HOY, ...resto
}) {
  const miCarro = flota.find((c) => c.id === carroId) ?? null;
  return avisosDeSalida({
    cliente: clienteSinProblemas,
    carro: miCarro,
    contrato: salida(miCarro ?? { id: carroId }, desde, hasta),
    flota,
    reservas,
    contratosAbiertos,
    hoy,
    ...resto,
  });
}

/** Solo el aviso de capacidad por tipo (el que habla de lo que dejaría sin carro). */
const deCapacidad = (avisos) => avisos.filter((a) => /^Si sacas este carro|^No se pudo comprobar si sacar/.test(a.mensaje));

// ---------- La reproducción con nombre ----------

test('Sacar carro: entregar la Ranger deja sin carro a la reservación «Pickup» (sin carro elegido) que ya contaba con la única pickup', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { clienteNombre: 'Carlos Méndez', tipoVehiculo: 'Pickup' })];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.equal(r.length, 1, 'un aviso, no una pared');
  assert.equal(r[0].nivel, 'alto');
  assert.equal(
    r[0].mensaje,
    'Si sacas este carro, la reservación de Pickup de Carlos Méndez (desde el 3 nov 2026) se queda sin carro: solo tienes 1 Pickup.',
  );
});

test('Sacar carro: el aviso nombra a quién afecta y desde cuándo, en una sola frase', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-04', '2026-11-09', { clienteNombre: 'Lucía Paz', tipoVehiculo: 'Pickup' })];
  const [aviso] = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.match(aviso.mensaje, /Lucía Paz/);
  assert.match(aviso.mensaje, /desde el 4 nov 2026/);
  assert.doesNotMatch(aviso.mensaje, /2026-11/, 'las fechas se leen como las lee el dueño, no en ISO');
  assert.equal(aviso.mensaje.split(/(?<=[.!?])\s/).length, 1, 'una sola oración');
});

// ---------- No hay que inventar un aviso: lo que NO debe avisar ----------

test('Sacar carro: sin reservaciones por tipo no avisa de nada (el caso de todos los días)', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05' }), []);
});

test('Sacar carro: una reservación por tipo de OTRO tipo no estorba', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  const reservas = [apartada('S', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Sedán' })];
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas }), []);
});

test('Sacar carro: si hay otra pickup libre, la reservación por tipo se va a esa y no avisa', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas }), []);
});

test('Sacar carro: tocarse no es cruzarse; la reservación por tipo que empieza el día que la renta termina no avisa', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-05', '2026-11-08', { tipoVehiculo: 'Pickup' })];
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas }), []);
  // Y el mismo día de antes, sí se cruzan.
  assert.equal(deCapacidad(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-06', reservas })).length, 1);
  // Del otro lado también: una reservación que termina el día que la renta empieza.
  const previa = [apartada('Q', '2026-10-30', '2026-11-03', { tipoVehiculo: 'Pickup' })];
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas: previa }), []);
});

test('Sacar carro: una reservación por tipo cancelada, o ya entregada, no le quita su carro a nadie', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [
    apartada('P1', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup', cancelada: true }),
    apartada('P2', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup', contratoId: 'c9' }),
  ];
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas }), []);
});

test('Sacar carro: un carro ajeno (rentado a un dueño de fuera) no es una unidad de la flota y no avisa', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  const r = avisosDeSalida({
    cliente: clienteSinProblemas,
    carro: null,
    contrato: { ...salida({ id: 'x' }, '2026-11-03', '2026-11-05'), carroId: null, ajeno: true },
    flota,
    reservas,
    contratosAbiertos: [],
    hoy: HOY,
  });
  assert.deepEqual(r, []);
});

test('Sacar carro: sin las listas (flota, reservaciones) no inventa un aviso; los avisos de siempre siguen igual', () => {
  const miCarro = carro('ranger', 'Pickup');
  assert.deepEqual(avisosDeSalida({
    cliente: clienteSinProblemas, carro: miCarro, contrato: salida(miCarro, '2026-11-03', '2026-11-05'), hoy: HOY,
  }), []);
});

// ---------- Cuando la otra pickup también está ocupada ----------

test('Sacar carro: con dos pickups y la otra rentada esos días, la reservación por tipo no tiene a dónde ir', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { clienteNombre: 'Carlos Méndez', tipoVehiculo: 'Pickup' })];
  const contratosAbiertos = [rentado('c1', 'hilux', '2026-11-02', '2026-11-06')];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, contratosAbiertos });
  assert.equal(r.length, 1);
  assert.equal(
    r[0].mensaje,
    'Si sacas este carro, la reservación de Pickup de Carlos Méndez (desde el 3 nov 2026) se queda sin carro: tienes 2 Pickup y los 2 quedan comprometidos.',
  );
});

test('Sacar carro: la otra pickup apartada para un cliente con carro exacto también cuenta', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [
    apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' }),
    apartada('E', '2026-11-04', '2026-11-07', { carroId: 'hilux' }),
  ];
  assert.equal(deCapacidad(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas })).length, 1);
});

// ---------- El carro que ya volvió no ocupa los días que se habían previsto ----------

test('Sacar carro: la otra pickup que ya se recibió antes de lo previsto está libre; no avisa', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  // Debía volver el 10 de noviembre, pero se recibió el 1: sigue abierto cobrando daños, y el carro está en el patio.
  const recibida = rentado('c1', 'hilux', '2026-10-28', '2026-11-10', { recibidoEl: '2026-11-01' });
  assert.equal(recibida.estado, 'devuelto', 'el escenario: el contrato sigue abierto');
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, contratosAbiertos: [recibida], hoy: '2026-11-02' }), []);
  // Control: el mismo contrato sin recibir sí tiene a la hilux afuera, y entonces sí avisa.
  const sigueAfuera = rentado('c1', 'hilux', '2026-10-28', '2026-11-10');
  assert.equal(deCapacidad(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, contratosAbiertos: [sigueAfuera], hoy: '2026-11-02' })).length, 1);
});

test('Sacar carro: la otra pickup que sigue afuera pasada su fecha ocupa por lo menos hoy; el reloj entra por `hoy`', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  // Debía volver el 1 de noviembre y no ha vuelto.
  const atrasada = rentado('c1', 'hilux', '2026-10-28', '2026-11-01');
  // El 31 de octubre todavía iba a tiempo: el 3 la hilux está libre.
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, contratosAbiertos: [atrasada], hoy: '2026-10-31' }), []);
  // El 3 de noviembre sigue afuera: hoy no puede salir otra vez, y la reservación por tipo cae encima.
  assert.equal(deCapacidad(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, contratosAbiertos: [atrasada], hoy: '2026-11-03' })).length, 1);
});

// ---------- El taller ----------

test('Sacar carro: una reservación clavada a un carro del taller no le quita unidades a las demás', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup'), carro('navara', 'Pickup', { fueraDeServicio: true, motivoFueraDeServicio: 'Taller' })];
  const reservas = [
    apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' }),
    apartada('N', '2026-11-03', '2026-11-05', { carroId: 'navara' }), // se apartó antes de que entrara al taller
  ];
  // La hilux está libre: la reservación por tipo se va a la hilux. La navara apartada no cuenta contra nadie.
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas }), []);
});

test('Sacar carro: sacar el carro que está en el taller no inventa un aviso de capacidad (ya avisa que está fuera de servicio)', () => {
  const flota = [carro('ranger', 'Pickup', { fueraDeServicio: true, motivoFueraDeServicio: 'Taller' }), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /fuera de servicio/);
});

// ---------- La reservación de la que se sale no compite contra sí misma ----------

test('Sacar carro: la reservación «Pickup» que ESTA salida cumple no cuenta como competencia', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { clienteNombre: 'Carlos Méndez', tipoVehiculo: 'Pickup' })];
  // El mostrador entra desde la reservación (#/sacar/ranger?reserva=P): es la que se está entregando.
  assert.deepEqual(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, reservaDeOrigenId: 'P' }), []);
  // Control: sin saber de dónde viene, la misma reservación sí se cuenta (así que el id es lo que la saca).
  assert.equal(deCapacidad(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas })).length, 1);
});

test('Sacar carro: otra reservación por tipo distinta de la que se cumple SÍ avisa', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [
    apartada('P', '2026-11-03', '2026-11-05', { clienteNombre: 'Carlos Méndez', tipoVehiculo: 'Pickup' }),
    apartada('Q', '2026-11-04', '2026-11-08', { clienteNombre: 'Lucía Paz', tipoVehiculo: 'Pickup' }),
  ];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, reservaDeOrigenId: 'P' });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /Lucía Paz/);
  assert.doesNotMatch(r[0].mensaje, /Carlos Méndez/);
});

test('Sacar carro: el contrato que se está escribiendo no compite contra sí mismo si ya llegó a la lista (un guardado que se quedó esperando)', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  // Un guardado que venció pero sí llegó a la nube: el contrato ya aparece entre los abiertos con el mismo id.
  const yaGuardado = rentado('c-nuevo', 'hilux', '2026-11-03', '2026-11-05');
  const miCarro = flota[0];
  const borrador = { ...salida(miCarro, '2026-11-03', '2026-11-05'), id: 'c-nuevo' };
  // Contra la hilux no hay competencia (es otro carro); lo que importa es que el id propio se descarte.
  const mismoIdMismoCarro = rentado('c-nuevo', 'ranger', '2026-11-03', '2026-11-05');
  const r = avisosDeSalida({
    cliente: clienteSinProblemas, carro: miCarro, contrato: borrador, flota, reservas, contratosAbiertos: [yaGuardado, mismoIdMismoCarro], hoy: HOY,
  });
  assert.deepEqual(deCapacidad(r), [], 'la hilux está libre y el contrato propio no se cuenta dos veces');
});

// ---------- La cadena ----------

// Dos carros, A y B. Se saca B del 10 al 12. La cadena de reservaciones por tipo: f1 11–14, f2 13–16, f3 15–18; A tiene un
// contrato del 9 al 11 y una reservación del 17 al 20. f2 y f3 NO tocan los días de la renta, pero f1 sí: tiene que irse a A,
// eso manda a f2 a B, y f3 se queda sin ninguno (A está apartado del 17 al 20). Sin la renta caben todas.
// (El contrato de A, del 9 al 11, no está atrasado: «hoy» de estas pruebas es antes de todo.)
const ANTES_DE_TODO = '2026-10-01';
const cadena = () => ({
  flota: [carro('A', 'Camioneta'), carro('B', 'Camioneta')],
  reservas: [
    apartada('f1', '2026-10-11', '2026-10-14', { tipoVehiculo: 'Camioneta', clienteNombre: 'Uno' }),
    apartada('f2', '2026-10-13', '2026-10-16', { tipoVehiculo: 'Camioneta', clienteNombre: 'Dos' }),
    apartada('f3', '2026-10-15', '2026-10-18', { tipoVehiculo: 'Camioneta', clienteNombre: 'Tres' }),
    apartada('aFinal', '2026-10-17', '2026-10-20', { carroId: 'A' }),
  ],
  contratosAbiertos: [rentado('cInicio', 'A', '2026-10-09', '2026-10-11')],
});

test('Sacar carro: una reservación que no toca los días pero encadena a otras también queda sin carro (la cadena de tres)', () => {
  const { flota, reservas, contratosAbiertos } = cadena();
  // Lejos de todo no avisa.
  assert.deepEqual(sacar({ flota, carroId: 'B', desde: '2026-10-30', hasta: '2026-10-31', reservas, contratosAbiertos, hoy: ANTES_DE_TODO }), []);
  const r = sacar({ flota, carroId: 'B', desde: '2026-10-10', hasta: '2026-10-12', reservas, contratosAbiertos, hoy: ANTES_DE_TODO });
  assert.equal(r.length, 1, 'sacar B deja a alguien de la cadena sin carro');
  // Cualquiera de las tres puede ser la que se quede sin carro (se puede reacomodar), así que no se señala a una sola.
  assert.match(r[0].mensaje, /^Si sacas este carro, alguna de las reservaciones de Camioneta sin carro elegido se queda sin carro \(/);
  assert.match(r[0].mensaje, /Uno desde el 11 oct 2026/);
  assert.match(r[0].mensaje, /Dos desde el 13 oct 2026/);
  assert.match(r[0].mensaje, /Tres desde el 15 oct 2026/);
  assert.match(r[0].mensaje, /: tienes 2 Camioneta y los 2 quedan comprometidos\.$/);
});

test('Sacar carro: y si la cadena tiene holgura (un tercer carro), no avisa', () => {
  const { flota, reservas, contratosAbiertos } = cadena();
  assert.deepEqual(sacar({
    flota: [...flota, carro('C', 'Camioneta')], carroId: 'B', desde: '2026-10-10', hasta: '2026-10-12', reservas, contratosAbiertos, hoy: ANTES_DE_TODO,
  }), []);
});

// ---------- Varias reservaciones afectadas ----------

test('Sacar carro: con una sola pickup, dos reservaciones por tipo que caen dentro de la renta se quedan sin carro y se nombran las dos', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [
    apartada('P1', '2026-11-03', '2026-11-05', { clienteNombre: 'Ana López', tipoVehiculo: 'Pickup' }),
    apartada('P2', '2026-11-06', '2026-11-08', { clienteNombre: 'Luis Gómez', tipoVehiculo: 'Pickup' }),
  ];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-08', reservas });
  assert.equal(r.length, 1, 'una sola línea');
  assert.equal(
    r[0].mensaje,
    'Si sacas este carro, las reservaciones de Pickup de Ana López (desde el 3 nov 2026) y Luis Gómez (desde el 6 nov 2026) se quedan sin carro: solo tienes 1 Pickup.',
  );
});

test('Sacar carro: solo se nombra a la reservación que la renta de verdad deja sin carro, no a la que no se cruza', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [
    apartada('P1', '2026-11-03', '2026-11-05', { clienteNombre: 'Ana López', tipoVehiculo: 'Pickup' }),
    apartada('P2', '2026-11-06', '2026-11-08', { clienteNombre: 'Luis Gómez', tipoVehiculo: 'Pickup' }),
  ];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /Ana López/);
  assert.doesNotMatch(r[0].mensaje, /Luis Gómez/);
});

// ---------- Warns, never blocks ----------

test('Sacar carro: es un aviso (alto), no un candado: la función devuelve avisos y nada más', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.ok(Array.isArray(r));
  r.forEach((a) => assert.deepEqual(Object.keys(a).sort(), ['mensaje', 'nivel']));
});

test('Sacar carro: si la búsqueda se pasa de su límite lo dice; ni se calla ni inventa un «se queda sin carro»', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán')];
  const reservas = [
    apartada('g1', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('g2', '2026-10-10', '2026-10-13', { tipoVehiculo: 'Sedán' }),
  ];
  const r = sacar({ flota, carroId: 's1', desde: '2026-10-11', hasta: '2026-10-14', reservas, limiteDeBusqueda: 1 });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'No se pudo comprobar si sacar este carro le deja sin carro a una reservación de Sedán: hay demasiadas reservaciones cruzadas. Revisa las de ese tipo.');
});

// ---------- Una sola regla, en un solo lugar ----------

test('Sacar carro: avisos.js no repite la regla ni lee el reloj; pregunta a nucleo/reserva.js', () => {
  const fuente = readFileSync(new URL('../js/nucleo/avisos.js', import.meta.url), 'utf8')
    .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(fuente, /new Date\(|Date\.now\(|hoyISO\(/, 'la regla recibe `hoy`, no lo lee');
  assert.doesNotMatch(fuente, /maximoConCarro|asignacion\.js/, 'la asignación vive en reserva.js, una sola vez');
  assert.match(fuente, /from '\.\/reserva\.js'/);
});

test('Sacar carro y el formulario de reservaciones contestan lo mismo con los mismos datos', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [
    apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' }),
    apartada('E', '2026-11-04', '2026-11-07', { carroId: 'hilux' }),
  ];
  const aviso = deCapacidad(sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas }));
  const formulario = choquesDeReserva({
    reserva: construirReserva({}, {
      clienteNombre: 'X', carroId: 'ranger', fechaSalida: '2026-11-03', dias: 2, precioDia: 1, anticipo: 0,
    }),
    flota,
    reservas,
    contratos: [],
    hoy: HOY,
  }).filter((a) => /otra reservación de Pickup/.test(a.mensaje));
  assert.equal(aviso.length, 1);
  assert.equal(formulario.length, 1);
});

// ---------------------------------------------------------------------------
// El cableado de la pantalla
//
// `entradaDeAvisos` (sacarCarro.js) arma lo que la pantalla le pasa a `avisosDeSalida`. Es lo único que la
// regla no puede probar por sí sola: si la pantalla no mandara la reservación de origen, TODA salida hecha desde
// una reservación por tipo pintaría un rojo falso contra el mismo cliente que está enfrente.
// ---------------------------------------------------------------------------

/** Lo que haría la pantalla: arma la entrada y se la pasa a la regla. */
function pantalla({
  flota, carroId, desde, hasta, reservas = [], contratosAbiertos = [], reservaId = null, ajeno = false, hoy = HOY,
}) {
  const miCarro = flota.find((c) => c.id === carroId) ?? null;
  return avisosDeSalida(entradaDeAvisos({
    borrador: salida(miCarro ?? { id: carroId }, desde, hasta),
    cliente: clienteSinProblemas,
    carro: miCarro,
    ajeno,
    carroId,
    reservaId,
    flota,
    reservas,
    contratosAbiertos,
    hoy,
  }));
}

test('La pantalla: entrar desde la reservación «Pickup» por tipo no avisa contra ESA reservación; entrar sin ella, sí', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { clienteNombre: 'Carlos Méndez', tipoVehiculo: 'Pickup' })];
  assert.deepEqual(pantalla({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, reservaId: 'P' }), []);
  // Alguien más que sí necesita la pickup, mientras se cumple la reservación P: ese aviso sí sale.
  const conOtra = [...reservas, apartada('Q', '2026-11-04', '2026-11-06', { clienteNombre: 'Lucía Paz', tipoVehiculo: 'Pickup' })];
  const r = pantalla({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas: conOtra, reservaId: 'P' });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /Lucía Paz/);
  // Sin reservación de origen (una salida de mostrador), la reservación P sí le gana la pickup al cliente de enfrente.
  const sinOrigen = pantalla({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.equal(deCapacidad(sinOrigen).length, 1);
  assert.match(sinOrigen[0].mensaje, /Carlos Méndez/);
});

test('La pantalla: entrar desde una reservación de ESTE carro exacto sigue sin avisar que el carro está apartado para el mismo cliente', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('E', '2026-11-03', '2026-11-05', { clienteNombre: 'Carlos Méndez', carroId: 'ranger' })];
  assert.deepEqual(pantalla({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, reservaId: 'E' }), []);
  // Sin origen, sí avisa que está apartado (el aviso de siempre, intacto).
  const r = pantalla({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /^Este carro está apartado para Carlos Méndez desde el 3 nov 2026\.$/);
});

test('La pantalla: con el carro ajeno marcado no se cruza nada contra la flota', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  assert.deepEqual(pantalla({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, ajeno: true }), []);
});

test('La pantalla: manda `hoy` a la regla (un carro atrasado ocupa por lo menos hoy)', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  const atrasada = rentado('c1', 'hilux', '2026-10-28', '2026-11-01');
  const args = { flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-05', reservas, contratosAbiertos: [atrasada] };
  assert.deepEqual(pantalla({ ...args, hoy: '2026-10-31' }), []);
  assert.equal(deCapacidad(pantalla({ ...args, hoy: '2026-11-03' })).length, 1);
});

// ---------------------------------------------------------------------------
// reservasQueSeQuedanSinCarro: lo que comparten las dos pantallas
// ---------------------------------------------------------------------------

const pregunta = (flota, carroId, desde, hasta, resto) => reservasQueSeQuedanSinCarro({
  carroId, rango: { desde, hasta }, flota, hoy: HOY, ...resto,
});

test('reservasQueSeQuedanSinCarro: no hay nada que preguntar con un carro fuera de la flota, uno del taller o una renta sin fechas', () => {
  const flota = [carro('ranger', 'Pickup'), carro('navara', 'Pickup', { fueraDeServicio: true })];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  assert.equal(pregunta(flota, 'vendido', '2026-11-03', '2026-11-05', { reservas }), null);
  assert.equal(pregunta(flota, 'navara', '2026-11-03', '2026-11-05', { reservas }), null);
  assert.equal(pregunta(flota, 'ranger', '', '', { reservas }), null);
  assert.equal(pregunta(flota, 'ranger', '2026-11-03', undefined, { reservas }), null);
});

test('reservasQueSeQuedanSinCarro: dice cuántas unidades hay y, si cabe, no nombra a nadie', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  assert.deepEqual(pregunta(flota, 'ranger', '2026-11-03', '2026-11-05', { reservas, nombrar: true }), { tipo: 'Pickup', unidades: 2, cabe: true });
});

test('reservasQueSeQuedanSinCarro: la Ranger deja sin carro a la reservación P, y se sabe con certeza (no hay otra forma de acomodarlas)', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  const e = pregunta(flota, 'ranger', '2026-11-03', '2026-11-05', { reservas, nombrar: true });
  assert.equal(e.cabe, false);
  assert.equal(e.unidades, 1);
  assert.deepEqual(e.afectadas.map((r) => r.id), ['P']);
  assert.equal(e.seguro, true);
  // Sin pedir nombres, no se gastan las búsquedas de más: solo se dice que no cabe.
  assert.deepEqual(pregunta(flota, 'ranger', '2026-11-03', '2026-11-05', { reservas }), { tipo: 'Pickup', unidades: 1, cabe: false });
});

test('reservasQueSeQuedanSinCarro: con varias que podrían perder el carro no se señala a una sola (seguro: falso)', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  // Dos reservaciones por tipo que se cruzan entre sí, y la hilux rentada todo el tiempo: hoy una tiene la ranger,
  // la otra la hilux... no, la hilux está rentada, así que hoy solo una de las dos cabe (exceso previo).
  const reservas = [
    apartada('A', '2026-11-03', '2026-11-08', { tipoVehiculo: 'Pickup', clienteNombre: 'Ana' }),
    apartada('B', '2026-11-04', '2026-11-09', { tipoVehiculo: 'Pickup', clienteNombre: 'Beto' }),
  ];
  const contratos = [rentado('c1', 'hilux', '2026-10-30', '2026-11-12')];
  const e = pregunta(flota, 'ranger', '2026-11-05', '2026-11-06', { reservas, contratos, nombrar: true });
  // Con la hilux rentada, solo la ranger sirve: ya había una de las dos sin carro. Sacar la ranger deja a la otra.
  assert.equal(e.cabe, false);
  assert.equal(e.seguro, false);
  assert.deepEqual(e.afectadas.map((r) => r.id), ['A', 'B']);
});

test('reservasQueSeQuedanSinCarro: las afectadas salen por fecha de salida, la que urge primero', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [
    apartada('tarde', '2026-11-07', '2026-11-08', { tipoVehiculo: 'Pickup' }),
    apartada('pronto', '2026-11-03', '2026-11-04', { tipoVehiculo: 'Pickup' }),
    apartada('medio', '2026-11-05', '2026-11-06', { tipoVehiculo: 'Pickup' }),
  ];
  const e = pregunta(flota, 'ranger', '2026-11-03', '2026-11-08', { reservas, nombrar: true });
  assert.deepEqual(e.afectadas.map((r) => r.id), ['pronto', 'medio', 'tarde']);
  assert.equal(e.seguro, true);
});

test('Sacar carro: con más de tres afectadas se nombran tres y se cuentan las demás', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = ['uno', 'dos', 'tres', 'cuatro', 'cinco'].map((nombre, i) => apartada(
    nombre, sumarDias('2026-11-03', i), sumarDias('2026-11-04', i), { tipoVehiculo: 'Pickup', clienteNombre: nombre },
  ));
  const r = sacar({ flota, carroId: 'ranger', desde: '2026-11-03', hasta: '2026-11-10', reservas });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /^Si sacas este carro, las reservaciones de Pickup de uno \(desde el 3 nov 2026\), dos \(desde el 4 nov 2026\), tres \(desde el 5 nov 2026\) y 2 más se quedan sin carro: solo tienes 1 Pickup\.$/);
});

// ---------------------------------------------------------------------------
// El examen definitivo: contra una enumeración completa
//
// Para cientos de escenarios al azar (semilla fija) se contesta de la manera más bruta, probando TODAS las formas de
// repartir las reservaciones por tipo entre los carros, con los carros clavados como bloqueos:
//   1. ¿Sacar este carro deja a alguien sin carro? (debe coincidir con el aviso de «Sacar carro» y con el del
//      formulario de reservaciones: la misma pregunta no puede tener dos respuestas);
//   2. ¿A QUIÉN? Cuando ya estaban todas acomodadas, las reservaciones que pueden perder el carro son exactamente
//      las que sale en alguna forma de dejar la menor cantidad sin carro; y `seguro` es verdadero si y solo si solo
//      hay una forma. Cuando ya había más reservaciones que carros, no se sabe a quién culpar y no se asegura nada.
// Esta enumeración está escrita aparte, con números de día y sin pasar por ninguna función de la regla.
// ---------------------------------------------------------------------------

function azar(semilla) {
  let a = semilla;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE = '2026-11-01';
const dia = (n) => sumarDias(BASE, n);
const seCruzaN = (a, b) => a.desde < b.hasta && b.desde < a.hasta;

/** ¿Se pueden poner todas las de `conjunto` en un carro propio cada una, sin chocar con los bloqueos ni entre sí? */
function sePuedeColocar(conjunto, carros, bloqueos) {
  const enCarro = Array.from({ length: carros }, () => []);
  const ir = (i) => {
    if (i === conjunto.length) return true;
    const x = conjunto[i];
    for (let c = 0; c < carros; c += 1) {
      if (bloqueos.some((b) => b.carro === c && seCruzaN(b, x)) || enCarro[c].some((y) => seCruzaN(y, x))) continue;
      enCarro[c].push(x);
      const cabe = ir(i + 1);
      enCarro[c].pop();
      if (cabe) return true;
    }
    return false;
  };
  return ir(0);
}

/** Todos los subconjuntos de una lista corta. */
function subconjuntos(lista) {
  const salida = [];
  for (let mascara = 0; mascara < (1 << lista.length); mascara += 1) salida.push(lista.filter((_, i) => mascara & (1 << i)));
  return salida;
}

/**
 * Las reservaciones por tipo que de verdad entran en la cuenta: las que se cruzan con la renta nueva y, en cadena, las
 * que se cruzan con esas. Las demás no cambian con ella (un carro solo estorba a lo que se le cruza), y un cupo pasado
 * allá lejos no es culpa de esta renta ni cambia a quién le toca perder aquí.
 */
function lasQueEntranEnLaCuenta(libres, nueva) {
  const dentro = [];
  const frontera = [nueva];
  for (let k = 0; k < frontera.length; k += 1) {
    libres.forEach((l) => {
      if (!dentro.includes(l) && seCruzaN(l, frontera[k])) { dentro.push(l); frontera.push(l); }
    });
  }
  return libres.filter((l) => dentro.includes(l));
}

/** Lo que dice la enumeración: cuántas se pierden, si ya estaban todas acomodadas, y quiénes pueden ser las perdidas. */
function porFuerzaBruta({ carros, bloqueos, libres: todas, nueva, carro }) {
  const libres = lasQueEntranEnLaCuenta(todas, nueva);
  const conNueva = [...bloqueos, { ...nueva, carro }];
  const sinNueva = subconjuntos(libres).filter((s) => sePuedeColocar(s, carros, bloqueos)).reduce((m, s) => Math.max(m, s.length), 0);
  const conjuntosCon = subconjuntos(libres).filter((s) => sePuedeColocar(s, carros, conNueva));
  const conMax = conjuntosCon.reduce((m, s) => Math.max(m, s.length), 0);
  const perdida = sinNueva - conMax;
  const sinExceso = sinNueva === libres.length;
  const formas = conjuntosCon.filter((s) => s.length === conMax).map((s) => libres.filter((x) => !s.includes(x)).map((x) => x.id).sort().join(','));
  const posibles = new Set(formas.flatMap((f) => (f ? f.split(',') : [])));
  return { perdida, sinExceso, posibles, formas: new Set(formas) };
}

function escenario(rnd) {
  const entero = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const carros = rnd() < 0.7 ? entero(1, 2) : 3;
  const flota = [];
  for (let k = 0; k < carros; k += 1) flota.push(carro(`t${k}`, 'Camioneta'));
  flota.push(carro('u0', 'Sedán'));
  const hayTaller = rnd() < 0.2;
  if (hayTaller) flota.push(carro('tt', 'Camioneta', { fueraDeServicio: true }));

  const bloqueos = []; const libres = []; const reservas = []; const contratos = [];
  const cuantos = entero(1, 7);
  for (let i = 0; i < cuantos; i += 1) {
    const desde = entero(0, 8);
    const hasta = desde + entero(1, 4);
    const suerte = rnd();
    if (rnd() < 0.25) { // un contrato, de la flota (de cualquier tipo) o ajeno
      const donde = suerte < 0.7 ? entero(0, carros - 1) : (suerte < 0.85 ? 'u0' : 'ajeno');
      if (donde === 'ajeno') contratos.push({ ...rentado(`c${i}`, 'u0', dia(desde), dia(hasta)), carroId: null, ajeno: true });
      else if (donde === 'u0') contratos.push(rentado(`c${i}`, 'u0', dia(desde), dia(hasta)));
      else { contratos.push(rentado(`c${i}`, `t${donde}`, dia(desde), dia(hasta))); bloqueos.push({ desde, hasta, carro: donde }); }
      continue;
    }
    if (rnd() < 0.15) { reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { tipoVehiculo: 'Camioneta', cancelada: true })); continue; }
    if (suerte < 0.3) { // clavada a un carro del tipo
      const k = entero(0, carros - 1);
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { carroId: `t${k}`, tipoVehiculo: 'Camioneta' }));
      bloqueos.push({ desde, hasta, carro: k });
    } else if (suerte < 0.36) { // clavada a un sedán con el tipo escrito mal: manda el carro
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { carroId: 'u0', tipoVehiculo: 'Camioneta' }));
    } else if (suerte < 0.42 && hayTaller) { // clavada al carro del taller: no gasta a los que sí están en servicio
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { carroId: 'tt', tipoVehiculo: 'Camioneta' }));
    } else { // por tipo, sin carro
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { tipoVehiculo: 'Camioneta' }));
      libres.push({ id: `r${i}`, desde, hasta });
    }
  }
  const desde = entero(0, 8);
  const hasta = desde + entero(1, 5);
  return { carros, flota, bloqueos, libres, reservas, contratos, nueva: { desde, hasta }, carro: entero(0, carros - 1) };
}

test('El examen: sacar un carro avisa, nombra y asegura exactamente lo que dice la enumeración completa (1500 escenarios)', () => {
  const rnd = azar(20261013);
  let avisos = 0; let sinAviso = 0; let seguros = 0; let dudosos = 0; let conExceso = 0; let nombradosVarios = 0;
  for (let n = 0; n < 1500; n += 1) {
    const e = escenario(rnd);
    const esperado = porFuerzaBruta(e);
    const idCarro = `t${e.carro}`;
    const miCarro = e.flota.find((c) => c.id === idCarro);
    const desde = dia(e.nueva.desde); const hasta = dia(e.nueva.hasta);
    const donde = `escenario ${n}: ${JSON.stringify({ ...e, flota: e.flota.map((c) => `${c.id}:${c.tipo}`), reservas: undefined, contratos: undefined })}`;

    // 1. El aviso de «Sacar carro» y el del formulario de reservaciones contestan lo que dice la enumeración.
    const hayAviso = deCapacidad(avisosDeSalida({
      cliente: clienteSinProblemas, carro: miCarro, contrato: salida(miCarro, desde, hasta), flota: e.flota, reservas: e.reservas, contratosAbiertos: e.contratos, hoy: HOY,
    })).length > 0;
    const enElFormulario = choquesDeReserva({
      reserva: construirReserva({}, { clienteNombre: 'Beto', carroId: idCarro, fechaSalida: desde, dias: diasEntre(desde, hasta), precioDia: 600, anticipo: 0 }),
      flota: e.flota, reservas: e.reservas, contratos: e.contratos, hoy: HOY,
    }).some((a) => /otra reservación de Camioneta/.test(a.mensaje));
    assert.equal(hayAviso, esperado.perdida > 0, donde);
    assert.equal(enElFormulario, hayAviso, `las dos pantallas contestan igual. ${donde}`);
    if (hayAviso) avisos += 1; else sinAviso += 1;
    if (!hayAviso) continue;

    // 2. A quién.
    const efecto = reservasQueSeQuedanSinCarro({
      carroId: idCarro, rango: { desde, hasta }, flota: e.flota, reservas: e.reservas, contratos: e.contratos, hoy: HOY, nombrar: true,
    });
    const ids = efecto.afectadas.map((r) => r.id);
    assert.ok(ids.length > 0, `siempre nombra a alguien. ${donde}`);
    assert.ok(ids.every((id) => e.libres.some((l) => l.id === id)), `solo nombra reservaciones por tipo vivas. ${donde}`);
    if (esperado.sinExceso) {
      assert.deepEqual([...ids].sort(), [...esperado.posibles].sort(), `nombra exactamente a las que pueden perder el carro. ${donde}`);
      assert.equal(efecto.seguro, esperado.formas.size === 1, `asegura solo cuando no hay otra forma de acomodarlas. ${donde}`);
      if (efecto.seguro) seguros += 1; else dudosos += 1;
      if (ids.length > 1) nombradosVarios += 1;
    } else {
      assert.equal(efecto.seguro, false, `con el cupo ya pasado no se asegura a quién. ${donde}`);
      conExceso += 1;
    }
  }
  // El examen vale si de verdad probó todas las clases.
  assert.ok(avisos > 150 && sinAviso > 150, `avisos ${avisos}, sin aviso ${sinAviso}`);
  assert.ok(seguros > 50 && dudosos > 10 && conExceso > 5 && nombradosVarios > 10, `seguros ${seguros}, dudosos ${dudosos}, con exceso ${conExceso}, varios ${nombradosVarios}`);
});
