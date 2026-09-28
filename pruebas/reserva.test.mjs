// Pruebas de una reservación.
//
// Una reservación aparta un carro antes de que salga. Puede apartar un carro
// exacto ("el Montero blanco", cuando el cliente lo pide) o solo un tipo ("un
// microbús"), y cambiar de unidad es un clic: el dueño lo pidió así porque los
// planes cambian a última hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirReserva, estadoReserva, seCruzan, faltaAlgoEnReserva, textoAnticipo, choquesDeReserva } from '../js/nucleo/reserva.js';

const campos = {
  clienteNombre: 'JONATÁN URIZAR', telefono: '3078-4155',
  fechaSalida: '2026-10-10', dias: 4,
  tipoVehiculo: 'MICROBÚS', precioDia: 600,
  anticipo: 500, anticipoPagado: true, nota: 'Llega a las 8',
};

test('la devolución prevista se calcula sola', () => {
  const r = construirReserva({}, campos);
  assert.equal(r.devolucionPrevista, '2026-10-14');
});

test('cambiar la unidad no pierde la reservación', () => {
  // Lo que él pidió: "me gustaría poder cambiar la unidad en dado caso cambie
  // el plan". Es la misma reservación; solo cambia qué carro la cumple.
  const original = construirReserva({}, { ...campos, carroId: 'v1', carroPlacas: 'P-111AAA' });
  const cambiada = construirReserva(original, { carroId: 'v2', carroPlacas: 'P-222BBB' });
  assert.equal(cambiada.carroId, 'v2');
  assert.equal(cambiada.carroPlacas, 'P-222BBB');
  assert.equal(cambiada.clienteNombre, 'JONATÁN URIZAR', 'el cliente sigue siendo el mismo');
  assert.equal(cambiada.anticipo, 500, 'y su anticipo también');
});

test('una reservación nace pendiente y termina entregada o cancelada', () => {
  const r = construirReserva({}, campos);
  assert.equal(estadoReserva(r), 'pendiente');
  assert.equal(estadoReserva({ ...r, contratoId: 'c9' }), 'entregada');
  assert.equal(estadoReserva({ ...r, cancelada: true }), 'cancelada');
  assert.equal(estadoReserva({ ...r, cancelada: true, contratoId: 'c9' }), 'entregada',
    'si ya se entregó, una cancelación tardía no la borra');
});

test('tocarse no es cruzarse', () => {
  // La misma regla que en los avisos de salida: un carro que regresa el 20
  // puede volver a salir el 20, y eso pasa a diario.
  const a = { fechaSalida: '2026-10-10', devolucionPrevista: '2026-10-14' };
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-14', devolucionPrevista: '2026-10-18' }), false);
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-06', devolucionPrevista: '2026-10-10' }), false);
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-13', devolucionPrevista: '2026-10-18' }), true);
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-12' }), true, 'una adentro de la otra');
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-01', devolucionPrevista: '2026-10-30' }), true, 'una encima de la otra');
});

test('sin fechas o sin cliente no se puede guardar', () => {
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, campos)), []);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...campos, clienteNombre: '' })), ['Cliente']);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...campos, fechaSalida: '' })), ['Fecha de salida']);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...campos, dias: 0 })), ['Días']);
});

test('el anticipo se dice en una línea', () => {
  assert.equal(textoAnticipo(construirReserva({}, campos)), 'Anticipo Q500.00 pagado');
  assert.equal(textoAnticipo(construirReserva({}, { ...campos, anticipoPagado: false })), 'Anticipo Q500.00 pendiente');
  assert.equal(textoAnticipo(construirReserva({}, { ...campos, anticipo: 0 })), 'Sin anticipo');
});

// choquesDeReserva: los choques que de verdad protegen el negocio. Dos casos
// distintos — carro exacto (choca contra ESE carro) y por tipo (choca contra
// la capacidad de la flota) — porque no hay un solo carro contra el cual
// comparar una reservación que todavía no eligió unidad.
const flota = [
  { id: 'v1', placas: 'P-111AAA', tipo: 'MICROBÚS' },
  { id: 'v2', placas: 'P-222BBB', tipo: 'MICROBÚS' },
  { id: 'v3', placas: 'P-333CCC', tipo: 'SEDÁN' },
];
const del10al14 = { fechaSalida: '2026-10-10', dias: 4, devolucionPrevista: '2026-10-14' };

test('un carro exacto ya apartado esas fechas avisa', () => {
  const reservas = [{ id: 'r1', carroId: 'v1', fechaSalida: '2026-10-12', devolucionPrevista: '2026-10-16' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, carroId: 'v1' }, flota, reservas, contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /apartad/i);
});

test('un carro exacto que ya salió rentado esas fechas avisa', () => {
  const contratos = [{ id: 'c1', carroId: 'v1', fechaSalida: '2026-10-09', devolucionPrevista: '2026-10-12', estado: 'rentado' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, carroId: 'v1' }, flota, reservas: [], contratos });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /rentado|contrato/i);
});

test('por tipo: mientras haya un carro libre, no se avisa', () => {
  // Dos microbuses, uno comprometido: todavía queda uno.
  const reservas = [{ id: 'r1', carroId: 'v1', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' }];
  assert.deepEqual(choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota, reservas, contratos: [] }), []);
});

test('por tipo: sin carros libres, avisa y dice cuántos hay', () => {
  const reservas = [
    { id: 'r1', carroId: 'v1', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' },
    { id: 'r2', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-09', devolucionPrevista: '2026-10-13' },
  ];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota, reservas, contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /2 MICROBÚS|dos/i, 'dice cuántos tiene');
});

test('una reservación cancelada o ya entregada no estorba', () => {
  const reservas = [
    { id: 'r1', carroId: 'v1', fechaSalida: '2026-10-12', devolucionPrevista: '2026-10-16', cancelada: true },
    { id: 'r2', carroId: 'v1', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15', contratoId: 'c5' },
  ];
  assert.deepEqual(choquesDeReserva({ reserva: { ...del10al14, carroId: 'v1' }, flota, reservas, contratos: [] }), []);
});

test('una reservación no choca consigo misma al editarla', () => {
  const reservas = [{ id: 'r1', carroId: 'v1', fechaSalida: '2026-10-10', devolucionPrevista: '2026-10-14' }];
  const misma = { id: 'r1', ...del10al14, carroId: 'v1' };
  assert.deepEqual(choquesDeReserva({ reserva: misma, flota, reservas, contratos: [] }), []);
});

test('un carro fuera de servicio no cuenta como disponible', () => {
  const flotaConTaller = [{ ...flota[0], fueraDeServicio: true }, flota[1], flota[2]];
  const reservas = [{ id: 'r1', carroId: 'v2', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota: flotaConTaller, reservas, contratos: [] });
  assert.equal(r.length, 1, 'el del taller no salva la capacidad');
});
