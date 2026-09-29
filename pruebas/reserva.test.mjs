// Pruebas de una reservación.
//
// Una reservación aparta un carro antes de que salga. Puede apartar un carro
// exacto ("el Montero blanco", cuando el cliente lo pide) o solo un tipo ("un
// microbús"), y cambiar de unidad es un clic: el dueño lo pidió así porque los
// planes cambian a última hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirReserva, estadoReserva, seCruzan, faltaAlgoEnReserva, textoAnticipo, choquesDeReserva } from '../js/nucleo/reserva.js';
import { reservaParaGuardar } from '../js/datos.js';

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

// Las tres formas del aviso por tipo, con el texto exacto fijado: cero,
// uno y varios concuerdan distinto en español, y sin una prueba por forma
// la redacción se puede corromper sin que ninguna prueba se dé cuenta.
test('por tipo: cero carros de ese tipo es un problema distinto a "ya no queda"', () => {
  // Ningún LIMOSINA en la flota: el problema no es capacidad agotada, es que
  // nunca hubo ninguno. "0 de 0 comprometidos" confundiría al dueño.
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'LIMOSINA' }, flota, reservas: [], contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'No tienes ninguna unidad LIMOSINA en la flota.');
});

test('por tipo: con un solo carro del tipo, el aviso concuerda en singular', () => {
  const reservas = [{ id: 'r1', carroId: 'v3', tipoVehiculo: 'SEDÁN', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'SEDÁN' }, flota, reservas, contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'Solo tienes 1 SEDÁN y ya está comprometido en esas fechas.');
});

test('por tipo: con varios carros del tipo, el aviso concuerda en plural y dice cuántos', () => {
  const reservas = [
    { id: 'r1', carroId: 'v1', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' },
    { id: 'r2', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-09', devolucionPrevista: '2026-10-13' },
  ];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota, reservas, contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'Tienes 2 MICROBÚS y los 2 ya están comprometidos en esas fechas.');
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

// reservaParaGuardar (Tarea 4, datos.js): la parte pura de guardarReserva.
// Mismo patrón que contratoParaGuardar (pruebas/datos.test.mjs) — el campo
// `estado` no se confía a lo que traiga la reservación, se sella con
// estadoReserva() para que nunca pueda desacordarse de contratoId/cancelada,
// que son los datos que de verdad lo determinan (la resolución de la Tarea 1).
test('reservaParaGuardar sella id y actualizado en una reservación nueva', () => {
  const nueva = construirReserva({}, campos);
  const guardado = reservaParaGuardar(nueva, { id: 'r1', ahora: 1000 });
  assert.equal(guardado.id, 'r1');
  assert.equal(guardado.actualizado, 1000);
});

test('reservaParaGuardar conserva el id de una reservación existente', () => {
  const existente = { ...construirReserva({}, campos), id: 'r1' };
  const guardado = reservaParaGuardar(existente, { id: 'r1', ahora: 2000 });
  assert.equal(guardado.id, 'r1');
});

test('reservaParaGuardar calcula el estado con estadoReserva(), no confía en el que ya traía', () => {
  const reserva = { ...construirReserva({}, campos), estado: 'entregada' }; // mentira a propósito
  const guardado = reservaParaGuardar(reserva, { id: 'r1' });
  assert.equal(guardado.estado, 'pendiente', 'el campo guardado se corrige, no se copia el que traía');
});

test('reservaParaGuardar sella "cancelada" cuando la reservación se dio de baja', () => {
  const reserva = { ...construirReserva({}, campos), cancelada: true };
  const guardado = reservaParaGuardar(reserva, { id: 'r1' });
  assert.equal(guardado.estado, 'cancelada');
});

test('reservaParaGuardar sella "entregada" aunque también venga cancelada: true, si ya tiene contrato', () => {
  // La asimetría de estadoReserva (Tarea 1): una reservación que ya se
  // cumplió con un contrato no se borra con una cancelación tardía ni con un
  // clic equivocado.
  const reserva = { ...construirReserva({}, campos), contratoId: 'c9', cancelada: true };
  const guardado = reservaParaGuardar(reserva, { id: 'r1' });
  assert.equal(guardado.estado, 'entregada');
});
