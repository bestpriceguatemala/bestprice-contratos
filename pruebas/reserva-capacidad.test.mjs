// H-5: el aviso de capacidad por tipo de una reservación.
//
// La pregunta que contesta no es «¿cuántos compromisos del tipo tocan estas fechas?» sino «¿puede cada
// compromiso que se cruza con ellas, más este, tener un carro propio?». Los de carro exacto están clavados a
// su carro; los de solo tipo toman cualquier carro libre de ese tipo. Contar no alcanza: con un carro ocupado
// del 1 al 5 y otro del 6 al 10, nunca hay más de uno ocupado a la vez y aun así no hay un carro libre del 1
// al 10. Las reservaciones y los contratos se arman con lo que arma los de verdad (construirReserva +
// reservaParaGuardar, contratoDeUnCarro, construirVehiculo), no con objetos escritos a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construirReserva, choquesDeReserva } from '../js/nucleo/reserva.js';
import { reservaParaGuardar } from '../js/datos.js';
import { construirVehiculo } from '../js/pantallas/carros.js';
import { sumarDias, diasEntre } from '../js/nucleo/fechas.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';

// ---------- Armar el escenario ----------

const carro = (id, tipo, extra = {}) => construirVehiculo({ id }, {
  placas: `P-${id}`, marca: 'Marca', linea: id, color: 'Blanco', modelo: 2022, tipo, ...extra,
});

/** Una reservación tal como queda guardada. `desde`/`hasta` son fechas ISO: la salida y la devolución prevista. */
const apartada = (id, desde, hasta, campos = {}) => reservaParaGuardar(construirReserva({ id }, {
  clienteNombre: 'Ana', telefono: '5555-0000', precioDia: 600, anticipo: 0,
  fechaSalida: desde, dias: diasEntre(desde, hasta), ...campos,
}), { id, ahora: 1 });

/** Un contrato abierto de ese carro, que sigue afuera (como lo deja guardar Sacar carro). */
const rentado = (id, carroId, desde, hasta) => contratoDeUnCarro({
  id, numero: 70, carroId, placas: `P-${carroId}`, fechaSalida: desde, dias: diasEntre(desde, hasta),
});

/** Lo que el formulario le pasa a la regla: la reservación que se está escribiendo (sin guardar). */
const borrador = (desde, hasta, campos = {}) => construirReserva({}, {
  clienteNombre: 'Beto', fechaSalida: desde, dias: diasEntre(desde, hasta), precioDia: 600, anticipo: 0, ...campos,
});

const HOY = '2026-10-01'; // antes de todo lo que se prueba aquí: ningún contrato está atrasado

const soloCapacidad = (r) => r.filter((a) => /en esas fechas/.test(a.mensaje));

// ---------- Las dos reproducciones de la prueba del sistema (7 oct 2026) ----------

test('H-5, aviso falso: dos sedanes, uno apartado 15–20 oct y una reservación por tipo 21–24 oct que no se tocan entre sí; apartar un sedán del 14 al 25 NO avisa', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán')];
  const reservas = [
    apartada('A', '2026-10-15', '2026-10-20', { carroId: 's1', carroPlacas: 'P-s1' }),
    apartada('D', '2026-10-21', '2026-10-24', { tipoVehiculo: 'Sedán' }),
  ];
  // Antes decía «Tienes 2 Sedán y los 2 ya están comprometidos»: contaba A y D como dos sedanes ocupados, pero nunca
  // coinciden un día. El segundo sedán está libre todo el tiempo.
  const r = choquesDeReserva({ reserva: borrador('2026-10-14', '2026-10-25', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY });
  assert.deepEqual(r, []);
});

test('H-5, aviso que falta: una reservación por carro exacto (Ranger, 3–5 nov) avisa de la reservación «Pickup» sin carro que ya necesita la única pickup', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  const reservas = [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' })];
  const r = choquesDeReserva({ reserva: borrador('2026-11-03', '2026-11-05', { carroId: 'ranger', carroPlacas: 'P-ranger' }), flota, reservas, contratos: [], hoy: HOY });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'Si apartas este carro, otra reservación de Pickup (sin carro elegido) se queda sin unidad en esas fechas: es la única que tienes.');
});

// ---------- El atajo que parece bueno y no lo es ----------

test('H-5: contar el máximo de coincidencias no basta; un carro ocupado del 1 al 5 y otro del 6 al 10 no dejan ninguno libre del 1 al 10', () => {
  const flota = [carro('v1', 'Microbús'), carro('v4', 'Microbús')];
  const reservas = [
    apartada('a', '2026-12-01', '2026-12-05', { carroId: 'v1' }),
    apartada('b', '2026-12-06', '2026-12-10', { carroId: 'v4' }),
  ];
  // Nunca hay más de uno ocupado a la vez, pero ninguno de los dos está libre los diez días.
  const r = choquesDeReserva({ reserva: borrador('2026-12-01', '2026-12-10', { tipoVehiculo: 'Microbús' }), flota, reservas, contratos: [], hoy: HOY });
  assert.equal(r.length, 1);
  assert.equal(r[0].mensaje, 'Tienes 2 Microbús y los 2 ya están comprometidos en esas fechas.');
  // Con un tercero que sí está libre, ya cabe.
  const conTercero = [...flota, carro('v9', 'Microbús')];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-12-01', '2026-12-10', { tipoVehiculo: 'Microbús' }), flota: conTercero, reservas, contratos: [], hoy: HOY }), []);
});

test('H-5: con un carro ocupado los primeros días y otro los últimos, una renta corta en medio sí cabe', () => {
  const flota = [carro('v1', 'Microbús'), carro('v4', 'Microbús')];
  const reservas = [
    apartada('a', '2026-12-01', '2026-12-05', { carroId: 'v1' }),
    apartada('b', '2026-12-06', '2026-12-10', { carroId: 'v4' }),
  ];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-12-02', '2026-12-04', { tipoVehiculo: 'Microbús' }), flota, reservas, contratos: [], hoy: HOY }), []);
});

// ---------- Tocarse no es cruzarse ----------

test('H-5: el sedán que regresa el 20 puede volver a salir el 20; una reservación por tipo que empieza ese día no avisa', () => {
  const flota = [carro('s1', 'Sedán')];
  const reservas = [apartada('A', '2026-10-15', '2026-10-20', { carroId: 's1' })];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-20', '2026-10-24', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }), []);
  // Y un día antes sí se cruzan.
  const r = choquesDeReserva({ reserva: borrador('2026-10-19', '2026-10-24', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY });
  assert.equal(r[0].mensaje, 'Solo tienes 1 Sedán y ya está comprometido en esas fechas.');
});

// ---------- Los compromisos que no tocan las fechas, pero cambian la respuesta ----------

// Dos carros, A y B. La reservación nueva es del 10 al 12. La cadena de compromisos por tipo:
//   f1 11–14, f2 13–16, f3 15–18, y A está apartado del 17 al 20 y del 9 al 11.
// A no sirve para la nueva (el 9–11 se cruza). Entonces B es para la nueva, f1 (que se cruza con ella) va a A, f2 va a B
// (se cruza con f1), y f3 tendría que ir a A, que está apartado del 17 al 20. Sin la nueva, f3 va a B, f2 a A y f1 a B.
// f2, f3 y el 17–20 NO se cruzan con las fechas de la nueva: mirar solo lo que las toca diría que cabe.
const cadena = () => ({
  flota: [carro('A', 'Camioneta'), carro('B', 'Camioneta')],
  reservas: [
    apartada('f1', '2026-10-11', '2026-10-14', { tipoVehiculo: 'Camioneta' }),
    apartada('f2', '2026-10-13', '2026-10-16', { tipoVehiculo: 'Camioneta' }),
    apartada('f3', '2026-10-15', '2026-10-18', { tipoVehiculo: 'Camioneta' }),
    apartada('aFinal', '2026-10-17', '2026-10-20', { carroId: 'A' }),
  ],
  contratos: [rentado('cInicio', 'A', '2026-10-09', '2026-10-11')],
});

test('H-5: un compromiso que no toca las fechas pero encadena a otros sí cuenta (la cadena de tres)', () => {
  const { flota, reservas, contratos } = cadena();
  // Sin la nueva todo cabe: f1→B, f2→A, f3→B.
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-30', '2026-10-31', { tipoVehiculo: 'Camioneta' }), flota, reservas, contratos, hoy: HOY }), [], 'lejos de todo no avisa');
  const r = choquesDeReserva({ reserva: borrador('2026-10-10', '2026-10-12', { tipoVehiculo: 'Camioneta' }), flota, reservas, contratos, hoy: HOY });
  assert.equal(r.length, 1, 'la nueva no cabe sin dejar a alguien sin carro');
  assert.equal(r[0].mensaje, 'Tienes 2 Camioneta y los 2 ya están comprometidos en esas fechas.');
});

test('H-5: y si la cadena tiene holgura (un tercer carro), la nueva cabe', () => {
  const { flota, reservas, contratos } = cadena();
  assert.deepEqual(choquesDeReserva({
    reserva: borrador('2026-10-10', '2026-10-12', { tipoVehiculo: 'Camioneta' }), flota: [...flota, carro('C', 'Camioneta')], reservas, contratos, hoy: HOY,
  }), []);
});

// ---------- Lo que ya estaba mal antes de esta reservación no es culpa de ella ----------

test('H-5: dos reservaciones del MISMO carro que se cruzan entre sí (ya hay un aviso de eso) no hacen que una por tipo avise: los otros dos sedanes están libres', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán'), carro('s3', 'Sedán')];
  const reservas = [
    apartada('x', '2026-10-10', '2026-10-20', { carroId: 's1' }),
    apartada('y', '2026-10-12', '2026-10-22', { carroId: 's1' }),
  ];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-12', '2026-10-14', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }), []);
});

test('H-5: tres reservaciones por tipo que no caben en dos sedanes (ya pasado de cupo) no hacen avisar a una que cae lejos; a una que se les cruza sí', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán')];
  const reservas = [
    apartada('g1', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('g2', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('g3', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
  ];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-20', '2026-10-22', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }), [], 'lejos');
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-12', '2026-10-14', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }), [], 'tocándose no es cruzarse');
  const r = choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-14', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY });
  assert.equal(r[0].mensaje, 'Tienes 2 Sedán y los 2 ya están comprometidos en esas fechas.');
});

test('H-5: si ya había un exceso (tres por tipo para dos sedanes) y la nueva cabe sin dejar a nadie peor, no se le culpa de lo anterior', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán')];
  const reservas = [
    apartada('g1', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('g2', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('g3', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('h', '2026-10-11', '2026-10-20', { tipoVehiculo: 'Sedán' }), // se cruza con las tres, y con la nueva
  ];
  // Del 19 al 21 solo se cruza con «h»; un sedán que ya iba a quedar sin reservación (el exceso) está libre ahí.
  // «Caben todos» sería falso desde antes de la nueva; la pregunta es si la nueva le quita su carro a alguien.
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-19', '2026-10-21', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }), []);
  // Encima del exceso, sí: ya no hay con qué.
  assert.equal(choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-13', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }).length, 1);
});

// ---------- Contratos, cancelaciones, taller ----------

test('H-5: un contrato abierto aparta su carro por el tiempo que de verdad lo ocupa', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán')];
  const contratos = [rentado('c1', 's1', '2026-10-10', '2026-10-14')];
  // Un sedán rentado hasta el 14 y el otro libre: cabe.
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-12', '2026-10-16', { tipoVehiculo: 'Sedán' }), flota, reservas: [], contratos, hoy: HOY }), []);
  // Con el otro apartado del 15 al 17, ninguno está libre del 12 al 16.
  const reservas = [apartada('r', '2026-10-15', '2026-10-17', { carroId: 's2' })];
  assert.equal(choquesDeReserva({ reserva: borrador('2026-10-12', '2026-10-16', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos, hoy: HOY }).length, 1);
});

test('H-5: una reservación cancelada o ya entregada no le quita su carro a nadie', () => {
  const flota = [carro('s1', 'Sedán')];
  const reservas = [
    apartada('r1', '2026-10-10', '2026-10-14', { tipoVehiculo: 'Sedán', cancelada: true }),
    apartada('r2', '2026-10-10', '2026-10-14', { carroId: 's1', contratoId: 'c9' }),
  ];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-13', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY }), []);
});

test('H-5: la reservación que se está editando no cuenta contra sí misma, ni por tipo ni por carro exacto', () => {
  const flota = [carro('s1', 'Sedán')];
  const guardadaPorTipo = apartada('r1', '2026-10-10', '2026-10-14', { tipoVehiculo: 'Sedán' });
  assert.deepEqual(choquesDeReserva({ reserva: { ...guardadaPorTipo }, flota, reservas: [guardadaPorTipo], contratos: [], hoy: HOY }), []);
  const guardadaExacta = apartada('r2', '2026-10-10', '2026-10-14', { carroId: 's1' });
  assert.deepEqual(choquesDeReserva({ reserva: { ...guardadaExacta }, flota, reservas: [guardadaExacta], contratos: [], hoy: HOY }), []);
});

test('H-5: un carro de otro tipo, o uno de contrato ajeno (sin carro de la flota), no gasta la capacidad de este tipo', () => {
  const flota = [carro('s1', 'Sedán'), carro('p1', 'Pickup')];
  const reservas = [apartada('r1', '2026-10-10', '2026-10-14', { carroId: 'p1', tipoVehiculo: 'Sedán' })]; // el tipo escrito miente: manda el carro
  const ajeno = { ...rentado('cA', 's1', '2026-10-10', '2026-10-14'), carroId: null, ajeno: true };
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-13', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [ajeno], hoy: HOY }), []);
});

test('H-5: un carro fuera de servicio no se cuenta como libre, pero lo que está clavado a él no gasta los demás', () => {
  const flota = [carro('s1', 'Sedán', { fueraDeServicio: true, motivoFueraDeServicio: 'Taller' }), carro('s2', 'Sedán')];
  const aparteDelTaller = [apartada('r1', '2026-10-10', '2026-10-14', { carroId: 's1' })];
  // s1 está en el taller: la única unidad que cuenta es s2, y está libre.
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-13', { tipoVehiculo: 'Sedán' }), flota, reservas: aparteDelTaller, contratos: [], hoy: HOY }), []);
  // Con s2 apartado, ya no queda ninguno, y el aviso cuenta solo los que están en servicio.
  const reservas = [...aparteDelTaller, apartada('r2', '2026-10-12', '2026-10-15', { carroId: 's2' })];
  const r = choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-13', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY });
  assert.equal(r[0].mensaje, 'Solo tienes 1 Sedán y ya está comprometido en esas fechas.');
});

test('H-5: cero carros del tipo sigue siendo «No tienes ninguna unidad», con o sin fechas', () => {
  const flota = [carro('s1', 'Sedán')];
  const sinFechas = construirReserva({}, { clienteNombre: 'Beto', tipoVehiculo: 'Limosina' });
  assert.equal(choquesDeReserva({ reserva: sinFechas, flota, reservas: [], contratos: [], hoy: HOY })[0].mensaje, 'No tienes ninguna unidad Limosina en la flota.');
  assert.deepEqual(choquesDeReserva({ reserva: construirReserva({}, { clienteNombre: 'Beto', tipoVehiculo: 'Sedán' }), flota, reservas: [], contratos: [], hoy: HOY }), [], 'sin fechas no hay con qué cruzar');
});

// ---------- Por carro exacto: lo que le hace a las reservaciones por tipo ----------

test('H-5: por carro exacto, con dos pickups: avisa solo si la otra pickup no puede absorber a la reservación por tipo', () => {
  const flota = [carro('ranger', 'Pickup'), carro('hilux', 'Pickup')];
  const porTipo = apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' });
  const exacta = borrador('2026-11-03', '2026-11-05', { carroId: 'ranger' });
  // La hilux está libre: la de tipo se va a la hilux.
  assert.deepEqual(choquesDeReserva({ reserva: exacta, flota, reservas: [porTipo], contratos: [], hoy: HOY }), []);
  // La hilux está rentada esos días: la de tipo no tiene a dónde ir.
  const r = choquesDeReserva({ reserva: exacta, flota, reservas: [porTipo], contratos: [rentado('c1', 'hilux', '2026-11-02', '2026-11-06')], hoy: HOY });
  assert.equal(r.length, 1);
  assert.equal(r[0].mensaje, 'Si apartas este carro, otra reservación de Pickup (sin carro elegido) se queda sin unidad en esas fechas: tienes 2 y los 2 quedan comprometidos.');
});

test('H-5: por carro exacto, si las fechas solo se tocan con la reservación por tipo, no avisa', () => {
  const flota = [carro('ranger', 'Pickup')];
  const porTipo = apartada('P', '2026-11-05', '2026-11-08', { tipoVehiculo: 'Pickup' });
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-11-03', '2026-11-05', { carroId: 'ranger' }), flota, reservas: [porTipo], contratos: [], hoy: HOY }), []);
});

test('H-5: por carro exacto, una reservación por tipo de OTRO tipo no estorba, ni una cancelada', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  const exacta = borrador('2026-11-03', '2026-11-05', { carroId: 'ranger' });
  assert.deepEqual(choquesDeReserva({ reserva: exacta, flota, reservas: [apartada('S', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Sedán' })], contratos: [], hoy: HOY }), []);
  assert.deepEqual(choquesDeReserva({ reserva: exacta, flota, reservas: [apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup', cancelada: true })], contratos: [], hoy: HOY }), []);
});

test('H-5: por carro exacto, el carro del taller o uno que ya no está en la flota no le quita unidades a nadie', () => {
  const porTipo = apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' });
  const delTaller = [carro('ranger', 'Pickup', { fueraDeServicio: true }), carro('hilux', 'Pickup')];
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-11-03', '2026-11-05', { carroId: 'ranger' }), flota: delTaller, reservas: [porTipo], contratos: [], hoy: HOY }), []);
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-11-03', '2026-11-05', { carroId: 'vendido' }), flota: [carro('hilux', 'Pickup')], reservas: [porTipo], contratos: [], hoy: HOY }), []);
});

test('H-5: por carro exacto manda el tipo REAL del carro, no el que quedó escrito en la reservación', () => {
  const flota = [carro('ranger', 'Pickup'), carro('yaris', 'Sedán')];
  const porTipo = apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' });
  // El formulario dice «Sedán» pero el carro elegido es la Ranger.
  const r = choquesDeReserva({ reserva: borrador('2026-11-03', '2026-11-05', { carroId: 'ranger', tipoVehiculo: 'Sedán' }), flota, reservas: [porTipo], contratos: [], hoy: HOY });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /Pickup/);
});

test('H-5: por carro exacto, el aviso de carro ya apartado sigue saliendo, y el de capacidad no lo repite cuando es la misma causa', () => {
  const flota = [carro('ranger', 'Pickup')];
  const reservas = [
    apartada('E', '2026-11-03', '2026-11-05', { carroId: 'ranger' }),
    apartada('P', '2026-11-03', '2026-11-05', { tipoVehiculo: 'Pickup' }), // ya se quedó sin carro por culpa de E
  ];
  const r = choquesDeReserva({ reserva: borrador('2026-11-03', '2026-11-05', { carroId: 'ranger' }), flota, reservas, contratos: [], hoy: HOY });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /^Este carro ya está apartado del 3 nov 2026 al 5 nov 2026\.$/);
});

// ---------- Cuando no se puede saber ----------

test('H-5: si la búsqueda se pasa de su límite, lo dice; no se queda callada ni inventa un «ya están comprometidos»', () => {
  const flota = [carro('s1', 'Sedán'), carro('s2', 'Sedán')];
  const reservas = [
    apartada('g1', '2026-10-10', '2026-10-12', { tipoVehiculo: 'Sedán' }),
    apartada('g2', '2026-10-10', '2026-10-13', { tipoVehiculo: 'Sedán' }),
  ];
  const r = choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-14', { tipoVehiculo: 'Sedán' }), flota, reservas, contratos: [], hoy: HOY, limiteDeBusqueda: 1 });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'No se pudo comprobar si te queda un Sedán libre en esas fechas: hay demasiadas reservaciones cruzadas. Revisa las de ese tipo.');
  const exacta = choquesDeReserva({ reserva: borrador('2026-10-11', '2026-10-14', { carroId: 's1' }), flota, reservas, contratos: [], hoy: HOY, limiteDeBusqueda: 1 });
  assert.equal(exacta.length, 1);
  assert.equal(exacta[0].mensaje, 'No se pudo comprobar si apartar este carro le deja sin unidad a otra reservación de Sedán: hay demasiadas cruzadas. Revisa las de ese tipo.');
});

// ---------- La regla no lee el reloj ----------

test('H-5: la regla de capacidad no lee el reloj ni compara fechas por su cuenta', () => {
  for (const archivo of ['../js/nucleo/reserva.js', '../js/nucleo/asignacion.js']) {
    const fuente = readFileSync(new URL(archivo, import.meta.url), 'utf8')
      .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(fuente, /new Date\(|Date\.now\(|hoyISO\(/, `${archivo} no lee el reloj`);
  }
  const asignacion = readFileSync(new URL('../js/nucleo/asignacion.js', import.meta.url), 'utf8');
  assert.doesNotMatch(asignacion, /import[^;]*fechas\.js/, 'el buscador no sabe de fechas: recibe quién se cruza con quién');
});

// ---------------------------------------------------------------------------
// El examen definitivo: la regla contra una enumeración completa
//
// Para cientos de escenarios al azar (con semilla fija, así que son siempre los mismos) se contesta la
// pregunta «¿le cabe un carro propio a la reservación nueva sin dejar sin carro a otra?» de la manera más
// bruta: se prueban TODAS las asignaciones posibles de las reservaciones por tipo a los carros, con los
// carros clavados como bloqueos. La regla de producción tiene que coincidir en cada escenario. Esta
// enumeración está escrita aparte, con números de día y sin pasar por ninguna de las funciones de la regla.
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

/** El máximo de reservaciones por tipo (libres) que pueden tener carro, probando todas las asignaciones. */
function maximoPorEnumeracion(carros, bloqueos, libres) {
  let mejor = 0;
  const enCarro = Array.from({ length: carros }, () => []);
  const sigue = (i, puestos) => {
    if (puestos + (libres.length - i) <= mejor) return;
    if (i === libres.length) { mejor = Math.max(mejor, puestos); return; }
    const x = libres[i];
    for (let c = 0; c < carros; c += 1) {
      const libre = !bloqueos.some((b) => b.carro === c && seCruzaN(b, x)) && !enCarro[c].some((y) => seCruzaN(y, x));
      if (libre) { enCarro[c].push(x); sigue(i + 1, puestos + 1); enCarro[c].pop(); }
    }
    sigue(i + 1, puestos);
  };
  sigue(0, 0);
  return mejor;
}

function escenario(rnd) {
  const entero = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const nCarros = entero(1, 3);
  const flota = [];
  for (let k = 0; k < nCarros; k += 1) flota.push(carro(`t${k}`, 'Camioneta'));
  flota.push(carro('u0', 'Sedán'));
  const delTaller = rnd() < 0.2;
  if (delTaller) flota.push(carro('tt', 'Camioneta', { fueraDeServicio: true }));

  const bloqueos = []; const libres = []; const reservas = []; const contratos = [];
  const cuantos = entero(0, 6);
  for (let i = 0; i < cuantos; i += 1) {
    const desde = entero(0, 9);
    const hasta = desde + entero(1, 5);
    const rango = { desde, hasta };
    const suerte = rnd();
    const esContrato = rnd() < 0.3;
    if (esContrato) {
      // Un contrato siempre es de un carro: de la flota (de cualquier tipo) o ajeno (sin carro).
      const donde = suerte < 0.7 ? entero(0, nCarros - 1) : (suerte < 0.85 ? 'u0' : 'ajeno');
      if (donde === 'ajeno') {
        contratos.push({ ...rentado(`c${i}`, 'u0', dia(desde), dia(hasta)), carroId: null, ajeno: true });
      } else if (donde === 'u0') {
        contratos.push(rentado(`c${i}`, 'u0', dia(desde), dia(hasta)));
      } else {
        contratos.push(rentado(`c${i}`, `t${donde}`, dia(desde), dia(hasta)));
        bloqueos.push({ ...rango, carro: donde });
      }
      continue;
    }
    if (rnd() < 0.15) { // cancelada: no aparta nada
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { tipoVehiculo: 'Camioneta', cancelada: true }));
      continue;
    }
    if (suerte < 0.45) { // clavada a un carro del tipo (o al del taller, que no es de este conjunto)
      const k = entero(0, nCarros - 1);
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { carroId: `t${k}`, tipoVehiculo: 'Camioneta' }));
      bloqueos.push({ ...rango, carro: k });
    } else if (suerte < 0.55) { // clavada a un sedán, con el tipo escrito mal: manda el carro
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { carroId: 'u0', tipoVehiculo: 'Camioneta' }));
    } else if (suerte < 0.6 && delTaller) { // clavada al carro del taller: no gasta los que sí están en servicio
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { carroId: 'tt', tipoVehiculo: 'Camioneta' }));
    } else { // por tipo, sin carro
      reservas.push(apartada(`r${i}`, dia(desde), dia(hasta), { tipoVehiculo: 'Camioneta' }));
      libres.push(rango);
    }
  }
  const desde = entero(0, 9);
  const hasta = desde + entero(1, 6);
  const nueva = { desde, hasta };
  const exacta = rnd() < 0.45 ? entero(0, nCarros - 1) : null;
  return { nCarros, flota, bloqueos, libres, reservas, contratos, nueva, exacta };
}

test('H-5, el examen: la regla coincide con la enumeración completa en 1500 escenarios al azar (por tipo y por carro exacto)', () => {
  const rnd = azar(20261012);
  let avisos = 0; let sinAviso = 0; let conExacta = 0;
  for (let n = 0; n < 1500; n += 1) {
    const e = escenario(rnd);
    const base = e.libres;
    const antes = maximoPorEnumeracion(e.nCarros, e.bloqueos, base);
    let debeAvisar;
    let reserva;
    if (e.exacta === null) {
      const despues = maximoPorEnumeracion(e.nCarros, e.bloqueos, [...base, e.nueva]);
      debeAvisar = despues !== antes + 1;
      reserva = borrador(dia(e.nueva.desde), dia(e.nueva.hasta), { tipoVehiculo: 'Camioneta' });
    } else {
      const despues = maximoPorEnumeracion(e.nCarros, [...e.bloqueos, { ...e.nueva, carro: e.exacta }], base);
      debeAvisar = despues !== antes;
      reserva = borrador(dia(e.nueva.desde), dia(e.nueva.hasta), { carroId: `t${e.exacta}`, tipoVehiculo: 'Camioneta' });
      conExacta += 1;
    }
    const r = soloCapacidad(choquesDeReserva({ reserva, flota: e.flota, reservas: e.reservas, contratos: e.contratos, hoy: HOY }));
    assert.equal(r.length > 0, debeAvisar, `escenario ${n}: ${JSON.stringify({ ...e, flota: e.flota.map((c) => `${c.id}:${c.tipo}`), reservas: undefined, contratos: undefined })}\nrespondió: ${JSON.stringify(r)}`);
    assert.ok(r.length <= 1, 'un solo aviso de capacidad');
    if (debeAvisar) avisos += 1; else sinAviso += 1;
  }
  // El examen vale si de verdad probó las dos respuestas, y de las dos clases.
  assert.ok(avisos > 100 && sinAviso > 100, `avisos ${avisos}, sin aviso ${sinAviso}`);
  assert.ok(conExacta > 300, `con carro exacto ${conExacta}`);
});
