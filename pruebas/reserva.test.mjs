// Pruebas de una reservación.
//
// Una reservación aparta un carro antes de que salga. Puede apartar un carro
// exacto ("el Montero blanco", cuando el cliente lo pide) o solo un tipo ("un
// microbús"), y cambiar de unidad es un clic: el dueño lo pidió así porque los
// planes cambian a última hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirReserva, estadoReserva, seCruzan, faltaAlgoEnReserva, textoAnticipo } from '../js/nucleo/reserva.js';

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
