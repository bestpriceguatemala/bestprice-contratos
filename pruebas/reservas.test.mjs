// Pruebas de la pantalla de reservaciones (reservas.js): solo la parte pura,
// sin DOM — igual que clientes.test.mjs y contratos.test.mjs.
//
// Lo que más importa probar: qué se apartó (el carro o el tipo), el orden de
// la lista (pendientes primero, ascendente; el resto detrás de un filtro) y
// el mensaje antes de cancelar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queSeAparto, reservasVisibles, textoConfirmarCancelar, opcionesCarro, ETIQUETAS_ESTADO_RESERVA,
  tiposDeFlota, opcionesTipo, SENTINEL_OTRO_TIPO, textoReservaNoEncontrada,
} from '../js/pantallas/reservas.js';

const flota = [
  { id: 'v1', placas: 'P-111AAA', marca: 'Mitsubishi', linea: 'Montero', tipo: 'SUV' },
  { id: 'v2', placas: 'P-222BBB', marca: 'Toyota', linea: 'Hiace', tipo: 'MICROBÚS', fueraDeServicio: true },
];

test('queSeAparto: con carro exacto en la flota, muestra placas y descripción', () => {
  const r = { carroId: 'v1', carroPlacas: 'P-111AAA' };
  assert.equal(queSeAparto(r, flota), 'P-111AAA · Mitsubishi · Montero');
});

test('queSeAparto: con carro exacto que ya no está en la flota, cae a las placas guardadas', () => {
  const r = { carroId: 'v9', carroPlacas: 'P-999ZZZ' };
  assert.equal(queSeAparto(r, flota), 'P-999ZZZ');
});

test('queSeAparto: sin carro exacto, muestra el tipo', () => {
  assert.equal(queSeAparto({ tipoVehiculo: 'MICROBÚS' }, flota), 'MICROBÚS');
});

test('queSeAparto: ni carro ni tipo, no revienta', () => {
  assert.equal(queSeAparto({}, flota), '—');
  assert.equal(queSeAparto(null, flota), '—');
});

test('queSeAparto: el carro exacto manda sobre el tipo cuando hay los dos', () => {
  const r = { carroId: 'v1', carroPlacas: 'P-111AAA', tipoVehiculo: 'SEDÁN' };
  assert.equal(queSeAparto(r, flota), 'P-111AAA · Mitsubishi · Montero');
});

// ---------- reservasVisibles: el orden que pide el brief ----------

const pend1 = {
  id: 'p1', clienteNombre: 'Ana', fechaSalida: '2026-10-20',
};
const pend2 = {
  id: 'p2', clienteNombre: 'Beto', fechaSalida: '2026-10-05',
};
const entregada = {
  id: 'e1', clienteNombre: 'Carla', fechaSalida: '2026-09-01', contratoId: 'c1',
};
const cancelada = {
  id: 'x1', clienteNombre: 'Diego', fechaSalida: '2026-09-15', cancelada: true,
};
const reservas = [pend1, entregada, pend2, cancelada];

test('reservasVisibles: por defecto, solo pendientes, ascendente por fecha de salida', () => {
  const visibles = reservasVisibles(reservas);
  assert.deepEqual(visibles.map((r) => r.id), ['p2', 'p1']);
});

test('reservasVisibles: "entregadas" no mezcla pendientes ni canceladas', () => {
  assert.deepEqual(reservasVisibles(reservas, 'entregadas').map((r) => r.id), ['e1']);
});

test('reservasVisibles: "canceladas" no mezcla pendientes ni entregadas', () => {
  assert.deepEqual(reservasVisibles(reservas, 'canceladas').map((r) => r.id), ['x1']);
});

test('reservasVisibles: "todas" pone las pendientes primero (ascendente) y el resto después (más reciente primero)', () => {
  // cancelada es del 15-sep y entregada del 1-sep: más reciente primero deja
  // 'x1' antes que 'e1', igual que ordenarPorSalida en contratos.js.
  const visibles = reservasVisibles(reservas, 'todas');
  assert.deepEqual(visibles.map((r) => r.id), ['p2', 'p1', 'x1', 'e1']);
});

test('reservasVisibles: una cancelación tardía de una ya entregada se ve como entregada, no como cancelada', () => {
  // Misma regla que estadoReserva (nucleo/reserva.js): contratoId manda.
  const rara = { id: 'r9', clienteNombre: 'Elsa', fechaSalida: '2026-09-10', contratoId: 'c9', cancelada: true };
  assert.deepEqual(reservasVisibles([rara], 'entregadas').map((r) => r.id), ['r9']);
  assert.deepEqual(reservasVisibles([rara], 'canceladas'), []);
});

// ---------- El mensaje antes de cancelar ----------

test('textoConfirmarCancelar: nombra al cliente y la fecha', () => {
  const texto = textoConfirmarCancelar({ clienteNombre: 'Jonatán Urizar', fechaSalida: '2026-10-10' });
  assert.match(texto, /Jonatán Urizar/);
  assert.match(texto, /10 oct 2026/);
  assert.match(texto, /no desaparece de la lista/);
});

test('textoConfirmarCancelar: sin nombre, no revienta', () => {
  assert.match(textoConfirmarCancelar({ fechaSalida: '2026-10-10' }), /este cliente/);
});

// ---------- El selector de carro exacto ----------

test('opcionesCarro: empieza con "solo el tipo", luego la flota ordenada por placas', () => {
  const html = opcionesCarro(flota);
  const indiceVacio = html.indexOf('<option value="">');
  const indiceV1 = html.indexOf('value="v1"');
  const indiceV2 = html.indexOf('value="v2"');
  assert.ok(indiceVacio < indiceV1 && indiceV1 < indiceV2);
});

test('opcionesCarro: marca "selected" el carro elegido y avisa si está fuera de servicio', () => {
  const html = opcionesCarro(flota, 'v2');
  assert.match(html, /value="v2" selected/);
  assert.match(html, /fuera de servicio/);
});

// ---------- Las etiquetas de estado ----------

test('ETIQUETAS_ESTADO_RESERVA: las tres que existen', () => {
  assert.deepEqual(ETIQUETAS_ESTADO_RESERVA, {
    pendiente: 'Pendiente', entregada: 'Entregada', cancelada: 'Cancelada',
  });
});

// ---------- El selector de tipo ----------
//
// El tipo se ELIGE de la flota, nunca se deletrea: cuando era texto libre, el
// recálculo por tecla comparaba "M", "MI", "MIC"... contra la flota y tiraba
// un aviso rojo falso por cada letra, además de fallar con minúsculas.

test('tiposDeFlota: los tipos distintos, ordenados, sin vacíos', () => {
  const mezclada = [...flota, { id: 'v3', tipo: 'SUV' }, { id: 'v4', tipo: '' }, { id: 'v5' }];
  assert.deepEqual(tiposDeFlota(mezclada), ['MICROBÚS', 'SUV']);
});

test('opcionesTipo: un tipo guardado que ya no está en la flota no se pierde', () => {
  // El carro se vendió, o ya no se maneja ese tipo. La reservación vieja sigue
  // apuntando ahí: tiene que seguir elegida (guardar de nuevo no debe borrarle
  // el tipo) y es el único caso en que "No tienes ningún X en la flota" es
  // cierto y vale decirlo.
  const html = opcionesTipo(flota, 'LIMUSINA');
  assert.match(html, /value="LIMUSINA" selected/);
  assert.match(html, /value="SUV"(?! selected)/);
});

test('opcionesTipo: un tipo de la flota queda elegido sin duplicarse', () => {
  const html = opcionesTipo(flota, 'SUV');
  assert.match(html, /value="SUV" selected/);
  assert.equal(html.match(/value="SUV"/g).length, 1);
});

test('opcionesTipo: siempre ofrece "Sin tipo" y "Otro…"', () => {
  const html = opcionesTipo(flota, '');
  assert.match(html, /<option value="">Sin tipo<\/option>/);
  assert.match(html, new RegExp(`value="${SENTINEL_OTRO_TIPO}"`));
});

// ---------- textoReservaNoEncontrada ----------
//
// IMPORTANTE 2 de la revisión final, segunda cara: si la lectura de
// reservaciones falló, no encontrar la reservación en lo ya cargado no
// prueba que no exista — puede estar perfectamente en la nube. "No se
// encontró" es una afirmación categórica que solo vale cuando la lectura sí
// funcionó.
test('textoReservaNoEncontrada: lectura exitosa y no está en la lista, sí se afirma que no existe', () => {
  assert.equal(textoReservaNoEncontrada(false), 'No se encontró esta reservación.');
});

test('textoReservaNoEncontrada: con la lectura fallida, nunca se afirma que no existe', () => {
  const texto = textoReservaNoEncontrada(true);
  assert.doesNotMatch(texto, /no se encontró/i);
  assert.match(texto, /no se pudo leer/i);
});
