// Pruebas de una reservación.
//
// Una reservación aparta un carro antes de que salga. Puede apartar un carro
// exacto ("el Montero blanco", cuando el cliente lo pide) o solo un tipo ("un
// microbús"), y cambiar de unidad es un clic: el dueño lo pidió así porque los
// planes cambian a última hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  construirReserva, estadoReserva, seCruzan, seCruzanConContrato, faltaAlgoEnReserva, textoAnticipo, choquesDeReserva,
  cambiosSinGuardar, textoCambiosSinGuardar,
} from '../js/nucleo/reserva.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';
import { sumarDias } from '../js/nucleo/fechas.js';
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

test('el anticipo dice quién tiene que hacer qué, no solo "pagado"', () => {
  // El dueño leyó "Anticipo Q500.00 pendiente" y preguntó: "¿de qué me sirve
  // poner el anticipo? ¿o es el que le pedí y aún falta que yo lo cobre?".
  // Las dos frases tienen que contestar eso solas, sin que las interprete.
  assert.equal(textoAnticipo(construirReserva({}, campos)), 'Anticipo Q500.00 — ya me lo pagó');
  assert.equal(
    textoAnticipo(construirReserva({}, { ...campos, anticipoPagado: false })),
    'Anticipo Q500.00 — falta que me lo pague',
  );
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

// Prueba del sistema (7 oct 2026): «cambiar la unidad» de una reservación de Sedán a la Ranger (una
// pickup) dejaba `tipoVehiculo: 'Sedán'` guardado junto a `carroId` de la Ranger. La capacidad por
// tipo contaba esa reservación contra los sedanes y no contra las pickups. Lo que cuenta es el tipo
// real del carro asignado.
// Las reservaciones se arman con construirReserva (lo que guarda reservas.js), no a mano.
const apartada = (id, campos) => construirReserva({ id }, {
  clienteNombre: 'Ana', dias: 4, precioDia: 700, anticipo: 0, ...campos,
});

test('por tipo: una reservación con carro exacto cuenta como el tipo de ESE carro, aunque el tipo escrito sea otro', () => {
  const cambiadaALaPickup = apartada('r1', { carroId: 'v3', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11' });
  // v3 es el único SEDÁN: ya está apartado, aunque la reservación diga MICROBÚS.
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'SEDÁN' }, flota, reservas: [cambiadaALaPickup], contratos: [] });
  assert.equal(r[0]?.mensaje, 'Solo tienes 1 SEDÁN y ya está comprometido en esas fechas.');
});

test('por tipo: y no gasta la capacidad del tipo que dice el formulario si el carro es de otro', () => {
  // Dos microbuses y una reservación «MICROBÚS» que en realidad tiene el sedán: queda libre un microbús.
  const delSedan = apartada('r1', { carroId: 'v3', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11' });
  const otra = apartada('r2', { tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-09' });
  // Sin el arreglo las dos contaban como microbuses (2 de 2): un «ya están comprometidos» falso.
  assert.deepEqual(choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota, reservas: [delSedan, otra], contratos: [] }), []);
});

test('por tipo: un carro exacto que ya no está en la flota cae al tipo que se pidió', () => {
  const reservas = [apartada('r1', { carroId: 'vendido', tipoVehiculo: 'SEDÁN', fechaSalida: '2026-10-11' })];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'SEDÁN' }, flota, reservas, contratos: [] });
  assert.equal(r[0]?.mensaje, 'Solo tienes 1 SEDÁN y ya está comprometido en esas fechas.');
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

// ---------------------------------------------------------------------------
// Un contrato ocupa el carro hasta su fin EFECTIVO, no hasta el previsto.
//
// El dueño: «recibí el carro antes y ya quedó libre, pero me sigue apareciendo que
// lo devuelven el 12». Es la misma regla que en los avisos de salida
// (finDelContrato, nucleo/estados.js): `cierre.fechaReal` cuando el carro ya
// volvió, la fecha prevista mientras sigue afuera, y — si ya pasó esa fecha y no
// ha vuelto — todo el día de hoy (queda libre desde mañana, como pronto). Los contratos se arman con las funciones que
// arman los reales (pruebas/fixtures/contratoDeUnCarro.mjs).
// ---------------------------------------------------------------------------

const recibidoAntes = () => contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06' });
const del8al11 = { fechaSalida: '2026-10-08', dias: 3, devolucionPrevista: '2026-10-11' };

test('seCruzanConContrato: un contrato recibido antes ocupa solo hasta el día que se recibió', () => {
  const c = recibidoAntes();
  assert.equal(c.devolucionPrevista, '2026-10-12');
  // Lo que la regla vieja (la fecha prevista) decía cruce, ya no lo es.
  assert.equal(seCruzan(del8al11, c), true, 'seCruzan compara rangos PREVISTOS: no es para un contrato ya hecho');
  assert.equal(seCruzanConContrato(del8al11, c, '2026-10-08'), false);
  assert.equal(seCruzanConContrato({ fechaSalida: '2026-10-06', devolucionPrevista: '2026-10-09' }, c, '2026-10-06'), false, 'tocarse no es cruzarse');
  assert.equal(seCruzanConContrato({ fechaSalida: '2026-10-05', devolucionPrevista: '2026-10-08' }, c, '2026-10-05'), true, 'el 5 el carro todavía estaba afuera');
});

test('un carro exacto recibido antes de lo previsto ya no avisa que tiene un contrato esos días', () => {
  const abierto = recibidoAntes();
  assert.equal(abierto.estado, 'devuelto', 'el escenario: el contrato sigue abierto');
  assert.deepEqual(choquesDeReserva({
    reserva: { ...del8al11, carroId: 'v1' }, flota, reservas: [], contratos: [abierto], hoy: '2026-10-07',
  }), []);
});

test('y si la reservación SÍ cae mientras el carro estaba afuera, avisa y dice el día real de regreso', () => {
  const r = choquesDeReserva({
    reserva: { fechaSalida: '2026-10-05', dias: 3, devolucionPrevista: '2026-10-08', carroId: 'v1' },
    flota, reservas: [], contratos: [recibidoAntes()], hoy: '2026-10-05',
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /3 oct 2026 al 6 oct 2026/);
  assert.doesNotMatch(r[0].mensaje, /12 oct/);
});

test('por tipo: un carro ya recibido no cuenta como comprometido por el resto de su fecha prevista', () => {
  // Un solo SEDÁN (v3) y su contrato del 3 al 12, recibido el 6: del 8 en adelante está libre.
  const abierto = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06', carroId: 'v3', placas: 'P-333CCC' });
  const reserva = { ...del8al11, tipoVehiculo: 'SEDÁN' };
  assert.deepEqual(choquesDeReserva({ reserva, flota, reservas: [], contratos: [abierto], hoy: '2026-10-07' }), []);
  // Antes del regreso sí: el 5 el único sedán estaba afuera.
  const antes = choquesDeReserva({
    reserva: { fechaSalida: '2026-10-04', dias: 2, devolucionPrevista: '2026-10-06', tipoVehiculo: 'SEDÁN' },
    flota, reservas: [], contratos: [abierto], hoy: '2026-10-04',
  });
  assert.equal(antes[0].mensaje, 'Solo tienes 1 SEDÁN y ya está comprometido en esas fechas.');
});

// El gemelo al revés: el carro que NO ha vuelto y ya pasó su fecha prevista.
// (Diferido en la revisión de reservaciones: «una reservación posterior no cruza y
// no avisa, justo en el carro con menos probabilidad de estar libre».)

test('un carro atrasado (afuera pasada su fecha prevista) avisa para una reservación que incluye hoy', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  assert.equal(atrasado.devolucionPrevista, '2026-10-08');
  const r = choquesDeReserva({
    reserva: { fechaSalida: '2026-10-09', dias: 3, devolucionPrevista: '2026-10-12', carroId: 'v1' },
    flota, reservas: [], contratos: [atrasado], hoy: '2026-10-10',
  });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /debía volver el 8 oct 2026 y sigue afuera/);
});

test('un carro atrasado también cuenta contra la capacidad del tipo', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5, carroId: 'v3', placas: 'P-333CCC' });
  const r = choquesDeReserva({
    reserva: { fechaSalida: '2026-10-09', dias: 3, devolucionPrevista: '2026-10-12', tipoVehiculo: 'SEDÁN' },
    flota, reservas: [], contratos: [atrasado], hoy: '2026-10-10',
  });
  assert.equal(r[0].mensaje, 'Solo tienes 1 SEDÁN y ya está comprometido en esas fechas.');
});

test('un carro atrasado avisa para una reservación que empieza HOY: hoy sigue afuera', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  const r = choquesDeReserva({
    reserva: { fechaSalida: '2026-10-10', dias: 3, devolucionPrevista: '2026-10-13', carroId: 'v1' },
    flota, reservas: [], contratos: [atrasado], hoy: '2026-10-10',
  });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /debía volver el 8 oct 2026 y sigue afuera/);
});

test('un carro atrasado no avisa para una reservación que empieza después de hoy: no se sabe cuándo volverá', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  for (const salida of ['2026-10-11', '2026-10-14']) {
    assert.deepEqual(choquesDeReserva({
      reserva: { fechaSalida: salida, dias: 3, devolucionPrevista: sumarDias(salida, 3), carroId: 'v1' },
      flota, reservas: [], contratos: [atrasado], hoy: '2026-10-10',
    }), [], salida);
  }
});

test('sin saber qué día es, un contrato se mide por su fecha prevista (la regla no lee el reloj)', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  assert.deepEqual(choquesDeReserva({
    reserva: { fechaSalida: '2026-10-09', dias: 3, devolucionPrevista: '2026-10-12', carroId: 'v1' },
    flota, reservas: [], contratos: [atrasado],
  }), []);
});

test('«atrasada» es solo de contratos: una reservación pendiente con fechas pasadas no se alarga hasta hoy', () => {
  // Una reservación que quedó sin cancelar ni entregar, de principios de mes: su
  // rango es el que apartó. Alargarla hasta hoy inventaría un choque con todo lo nuevo.
  const vieja = { id: 'r-vieja', carroId: 'v1', fechaSalida: '2026-10-01', devolucionPrevista: '2026-10-05' };
  assert.deepEqual(choquesDeReserva({
    reserva: { fechaSalida: '2026-10-18', dias: 4, devolucionPrevista: '2026-10-22', carroId: 'v1' },
    flota, reservas: [vieja], contratos: [], hoy: '2026-10-20',
  }), []);
});

test('la pantalla de reservaciones le da `hoy` a choquesDeReserva (sin eso el atraso no se ve)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/reservas.js', import.meta.url), 'utf8');
  const llamada = /choquesDeReserva\(\{([^}]*)\}\)/.exec(fuente);
  assert.ok(llamada, 'se encontró la llamada');
  assert.match(llamada[1], /hoy: hoyISO\(\)/, 'hoy se recibe en el borde de la pantalla, no se lee dentro de la regla');
});

// ---------------------------------------------------------------------------
// «Sacar el carro» desde la ficha usa lo GUARDADO, no lo que se ve en pantalla
//
// Prueba del sistema (7 oct 2026): en la ficha de una reservación con anticipo de
// Q400 pagado, el dueño desmarcó «Ya pagó el anticipo» (la pantalla ya decía «falta
// que me lo pague») y cambió el precio, y apretó «Sacar el carro» sin guardar. La
// salida abrió con el precio viejo y con «anticipo ya pagado: Q400.00», descontado del
// monto — y al guardar el contrato habría registrado un pago de Q400 que nadie hizo.
// ---------------------------------------------------------------------------

const guardada = () => construirReserva({ id: 'r1', clienteId: 'k1' }, {
  clienteNombre: 'Ana López', telefono: '5555-1234', fechaSalida: '2026-10-31', dias: 2,
  tipoVehiculo: 'Sedán', carroId: 'v1', precioDia: 700, anticipo: 400, anticipoPagado: true, nota: '',
});

test('cambiosSinGuardar: la ficha tal como se abrió no tiene cambios', () => {
  assert.deepEqual(cambiosSinGuardar(guardada(), construirReserva(guardada(), {})), []);
});

test('cambiosSinGuardar: lo que el formulario devuelve como texto no cuenta como cambio', () => {
  // Los campos de la pantalla llegan como texto («2», «700», «400») y construirReserva los
  // normaliza; una reservación vieja puede ni traer anticipoPagado ni clienteId.
  const g = guardada();
  const delFormulario = construirReserva(g, { dias: '2', precioDia: '700', anticipo: '400', anticipoPagado: true });
  assert.deepEqual(cambiosSinGuardar(g, delFormulario), []);
  const vieja = { id: 'r0', clienteNombre: 'Ana', fechaSalida: '2026-10-31', dias: 2, precioDia: 700, anticipo: 0 };
  const abierta = construirReserva(vieja, { clienteId: null, anticipoPagado: false, dias: '2', precioDia: '700', anticipo: '0' });
  assert.deepEqual(cambiosSinGuardar(vieja, abierta), [], 'null y false son lo mismo que «no está»');
});

test('cambiosSinGuardar: el anticipo desmarcado y el precio cambiado, sin guardar, se nombran', () => {
  const g = guardada();
  const enPantalla = construirReserva(g, { anticipoPagado: false, precioDia: '800' });
  assert.deepEqual(cambiosSinGuardar(g, enPantalla), ['precio por día', 'si el anticipo ya se pagó']);
});

test('cambiosSinGuardar: cada campo que «Sacar carro» lee de lo guardado se vigila', () => {
  const g = guardada();
  const cambia = (campos) => cambiosSinGuardar(g, construirReserva(g, campos));
  assert.deepEqual(cambia({ fechaSalida: '2026-11-01' }), ['fecha de salida']);
  assert.deepEqual(cambia({ dias: '3' }), ['días']);
  assert.deepEqual(cambia({ precioDia: '701' }), ['precio por día']);
  assert.deepEqual(cambia({ anticipo: '0' }), ['anticipo']);
  assert.deepEqual(cambia({ anticipoPagado: false }), ['si el anticipo ya se pagó']);
  assert.deepEqual(cambia({ clienteId: 'k2' }), ['cliente']);
  assert.deepEqual(cambia({ clienteNombre: 'Otra Persona' }), ['nombre del cliente']);
});

test('cambiosSinGuardar: el carro y la nota no cuentan: el carro se toma a propósito del formulario', () => {
  // «Sacar el carro» usa el carro que está elegido AHORA (así una reservación por tipo escoge su unidad
  // ahí mismo); la nota no llega a la salida.
  const g = guardada();
  assert.deepEqual(cambiosSinGuardar(g, construirReserva(g, { carroId: 'v3', carroPlacas: 'P-300CCC', nota: 'otra' })), []);
});

test('textoCambiosSinGuardar: dice qué cambió y qué hacer, y no inventa nada si no hay cambios', () => {
  assert.equal(textoCambiosSinGuardar([]), '');
  assert.equal(
    textoCambiosSinGuardar(['precio por día', 'si el anticipo ya se pagó']),
    'Hay cambios sin guardar en la reservación: precio por día, si el anticipo ya se pagó. '
    + 'Guárdalos antes de sacar el carro: la salida usa lo que está guardado, no lo que ves ahora.',
  );
});

test('la ficha de la reservación no deja sacar el carro con cambios sin guardar', () => {
  const fuente = readFileSync(new URL('../js/pantallas/reservas.js', import.meta.url), 'utf8');
  const cuerpo = /function sacarCarroDesdeFicha\(\) \{([\s\S]*?)\n  \}/.exec(fuente);
  assert.ok(cuerpo, 'se encontró sacarCarroDesdeFicha');
  assert.match(cuerpo[1], /cambiosSinGuardar\(reserva,/, 'compara el formulario contra lo guardado');
  assert.ok(cuerpo[1].indexOf('cambiosSinGuardar') < cuerpo[1].indexOf('location.hash'), 'y lo hace ANTES de navegar');
});

test('faltaAlgoEnReserva: una fecha de salida que no existe (año de cinco dígitos) se señala, la buena no', () => {
  const buena = { clienteNombre: 'Ana', fechaSalida: '2026-10-15', dias: 3 };
  assert.deepEqual(faltaAlgoEnReserva(buena), []);
  assert.deepEqual(faltaAlgoEnReserva({ ...buena, fechaSalida: '20261-10-15' }), ['Fecha de salida (el año no es válido)']);
  assert.deepEqual(faltaAlgoEnReserva({ ...buena, fechaSalida: '' }), ['Fecha de salida'], 'vacía sigue siendo «falta»');
});

// Prueba del sistema (7 oct 2026): una reservación de -3 días a -Q500 con -Q100 de anticipo se guardó, con la
// devolución prevista antes de la salida. Se arma con construirReserva (lo que guarda reservas.js).
test('una reservación con días, precio o anticipo negativos no se puede guardar, y dice cuál', () => {
  const buena = { clienteNombre: 'Ana', fechaSalida: '2026-12-10', dias: 3, precioDia: 500, anticipo: 100 };
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, buena)), []);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...buena, dias: -3 })), ['Días (no pueden ser negativos)']);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...buena, precioDia: -500 })), ['Precio por día (no puede ser negativo)']);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...buena, anticipo: -100 })), ['Anticipo (no puede ser negativo)']);
  assert.deepEqual(
    faltaAlgoEnReserva(construirReserva({}, { ...buena, dias: -3, precioDia: -500, anticipo: -100 })),
    ['Días (no pueden ser negativos)', 'Precio por día (no puede ser negativo)', 'Anticipo (no puede ser negativo)'],
  );
});

test('una reservación con días con decimales no se puede guardar: la devolución prevista cuenta días enteros', () => {
  const r = construirReserva({}, { clienteNombre: 'Ana', fechaSalida: '2026-12-10', dias: 2.5 });
  assert.deepEqual(faltaAlgoEnReserva(r), ['Días (tienen que ser un número entero)']);
});

test('sin precio ni anticipo (cero o vacío) una reservación sigue siendo válida: se apartó, el precio se habla después', () => {
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { clienteNombre: 'Ana', fechaSalida: '2026-12-10', dias: 3 })), []);
});
