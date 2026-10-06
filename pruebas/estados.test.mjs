// Pruebas de los estados.
//
// La regla que más importa: el carro se libera cuando REGRESA, no cuando se
// cierra el contrato. El dueño puede tardar días en liberar la garantía —
// sobre todo si hubo daños y está esperando que le paguen — y mientras tanto
// ese carro tiene que poder volver a salir rentado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoContrato, puedeCerrar, pendientesDe, garantiaPorLiberar, estadoCarro, finDelContrato,
} from '../js/nucleo/estados.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';

const rentado = {
  id: 'c1', carroId: 'v1', dias: 4, precioDia: 700,
  devolucionPrevista: '2026-08-24',
  pagos: [{ monto: 2800, porcentajeTarjeta: 0 }],
  garantiaMonto: 500, // pagó con tarjeta: sí hay algo que liberar
};
const devuelto = {
  ...rentado,
  cierre: { fechaReal: '2026-08-25', danos: 200, descuento: 0 },
  garantiaLiberada: false,
};
const cerrado = {
  ...devuelto,
  pagos: [{ monto: 2800, porcentajeTarjeta: 0 }, { monto: 900, porcentajeTarjeta: 0 }],
  garantiaLiberada: true,
};

test('los tres estados del contrato', () => {
  assert.equal(estadoContrato(rentado), 'rentado');
  assert.equal(estadoContrato(devuelto), 'devuelto');
  assert.equal(estadoContrato(cerrado), 'cerrado');
});

test('no se cierra un contrato con saldo pendiente', () => {
  assert.equal(puedeCerrar(devuelto), false);
  assert.deepEqual(pendientesDe(devuelto), { saldo: 900, garantia: true });
});

test('no se cierra un contrato con la garantía todavía bloqueada', () => {
  const pagadoPeroBloqueado = { ...cerrado, garantiaLiberada: false };
  assert.equal(puedeCerrar(pagadoPeroBloqueado), false);
  assert.deepEqual(pendientesDe(pagadoPeroBloqueado), { saldo: 0, garantia: true });
});

test('se cierra cuando ya no debe nada y la garantía está liberada', () => {
  assert.equal(puedeCerrar(cerrado), true);
  assert.deepEqual(pendientesDe(cerrado), { saldo: 0, garantia: false });
});

// IMPORTANTE de la revisión final: un descuento dado después de haber
// cobrado de más deja el saldo negativo (resumen() a propósito no lo
// recorta), y con `saldo === 0` ese contrato se quedaba "devuelto" para
// siempre aunque el negocio ya no tuviera nada más que cobrarle — al
// contrario, le debía al cliente. cargarContratosAbiertos() lo seguía
// trayendo en cada apertura sin que hubiera nada más que hacer con él.
test('un contrato sobrepagado (saldo negativo) sí se puede cerrar, con la garantía liberada', () => {
  const sobrepagado = {
    ...devuelto,
    cierre: { fechaReal: '2026-08-24', descuento: 500 }, // sin atraso ni daños
    pagos: [{ monto: 2800, porcentajeTarjeta: 0 }], // ya había cobrado antes de saber del descuento
    garantiaLiberada: true,
  };
  const pend = pendientesDe(sobrepagado);
  assert.equal(pend.saldo, -500, 'se le debe Q500 al cliente, no "está a mano"');
  assert.equal(pend.garantia, false);
  assert.equal(puedeCerrar(sobrepagado), true, 'saldo <= 0, no solo === 0');
});

test('con saldo === 0 antes del fix ya cerraba; el cambio es que un saldo negativo también cierra', () => {
  // Guarda contra una regresión al revés: que alguien vuelva a "=== 0" y
  // nadie lo note porque el caso normal (saldo exacto) sigue pasando.
  assert.equal(puedeCerrar(cerrado), true);
});

// IMPORTANTE de la revisión final: una renta pagada en efectivo, sin ninguna
// tarjeta de por medio, tiene garantiaMonto en 0 — no hay nada que liberar,
// así que exigir el mismo candado de "Liberar garantía" (con su confirm de
// "¿Liberar la garantía de Q0.00...? Esto no se puede deshacer") era pedir
// una acción sin sentido. Este contrato tiene que poder cerrarse con solo
// saldar el saldo, sin pasar por ese botón.
test('una renta en efectivo (garantiaMonto 0) cierra solo con el saldo, sin pedir "Liberar garantía"', () => {
  const enEfectivo = {
    id: 'c2', carroId: 'v1', dias: 2, precioDia: 300,
    devolucionPrevista: '2026-08-10',
    cierre: { fechaReal: '2026-08-10' },
    pagos: [{ monto: 600, porcentajeTarjeta: 0 }],
    garantiaMonto: 0,
    garantiaLiberada: false, // nunca se tocó, y no hace falta
  };
  assert.deepEqual(pendientesDe(enEfectivo), { saldo: 0, garantia: false });
  assert.equal(puedeCerrar(enEfectivo), true);
});

// El bug real que hizo falta esta función (Task 7 lo vio en pantalla): la
// cifra "Garantías por liberar" del encabezado y la lista de la pantalla de
// flota decían números distintos, al mismo tiempo, en la misma pantalla —
// porque cada una decidía "¿esto es un pendiente?" por su cuenta. La causa
// era `pendientesDe(c).garantia` sola, que también es `true` en un contrato
// con el carro todavía afuera (la tarjeta sí sigue retenida, pero eso es lo
// normal de una renta activa, no trabajo pendiente del dueño).
test('garantiaPorLiberar: una garantía bloqueada con el carro TODAVÍA AFUERA no cuenta (renta en curso, no un pendiente)', () => {
  // `rentado` no tiene `cierre` — el carro sigue en la calle — aunque
  // pendientesDe() ya lo marca con garantía bloqueada.
  assert.equal(pendientesDe(rentado).garantia, true, 'la tarjeta sí está retenida...');
  assert.equal(garantiaPorLiberar(rentado), false, '...pero eso no es "por liberar" mientras el carro no ha vuelto');
});

test('garantiaPorLiberar: con el carro ya de vuelta (cierre.fechaReal) y la garantía todavía bloqueada, sí cuenta', () => {
  // `devuelto` ya trae cierre.fechaReal y garantiaLiberada: false.
  assert.equal(garantiaPorLiberar(devuelto), true);
});

test('garantiaPorLiberar: con la garantía ya liberada, no cuenta aunque el carro ya haya vuelto', () => {
  assert.equal(garantiaPorLiberar(cerrado), false);
});

test('garantiaPorLiberar: una renta en efectivo (garantiaMonto 0) no cuenta aunque el carro ya haya vuelto', () => {
  const enEfectivoYaDevuelto = {
    id: 'c3', carroId: 'v1', dias: 2, precioDia: 300,
    devolucionPrevista: '2026-08-10',
    cierre: { fechaReal: '2026-08-10' },
    pagos: [{ monto: 600, porcentajeTarjeta: 0 }],
    garantiaMonto: 0,
    garantiaLiberada: false,
  };
  assert.equal(garantiaPorLiberar(enEfectivoYaDevuelto), false);
});

test('el carro queda disponible al recibirlo, aunque el contrato siga abierto', () => {
  const carro = { id: 'v1', placas: 'P-234IFN' };
  assert.equal(estadoCarro(carro, [rentado], '2026-08-22').estado, 'rentado');
  assert.equal(estadoCarro(carro, [devuelto], '2026-08-26').estado, 'disponible',
    'el contrato sigue pendiente de cobro y de liberar, pero el carro ya puede salir');
});

test('un carro que no ha regresado y ya pasó la fecha sale atrasado', () => {
  const carro = { id: 'v1', placas: 'P-234IFN' };
  const estado = estadoCarro(carro, [rentado], '2026-08-26');
  assert.equal(estado.estado, 'atrasado');
  assert.equal(estado.diasAtraso, 2);
  assert.equal(estado.contrato.id, 'c1');
});

test('un carro marcado fuera de servicio no se puede rentar', () => {
  const carro = { id: 'v1', placas: 'P-234IFN', fueraDeServicio: true, motivoFueraDeServicio: 'En el taller' };
  assert.equal(estadoCarro(carro, [], '2026-08-26').estado, 'fuera de servicio');
});

test('un carro fuera de servicio que anda rentado sigue mostrando a quién se lo llevaron', () => {
  // Se accidentó con el cliente: el dueño lo marca fuera de servicio el mismo
  // día. Si la pantalla solo dijera "fuera de servicio", nadie sabría quién lo
  // tiene, ni que viene tarde, ni habría botón para recibirlo.
  const carro = { id: 'v1', placas: 'P-234IFN', fueraDeServicio: true, motivoFueraDeServicio: 'Golpe en la puerta' };
  const e = estadoCarro(carro, [rentado], '2026-08-26');
  assert.equal(e.estado, 'atrasado');
  assert.equal(e.contrato.id, 'c1');
  assert.equal(e.diasAtraso, 2);
  assert.equal(e.fueraDeServicio, true);
  assert.equal(e.motivo, 'Golpe en la puerta');
});

test('un carro parado en el taller sí sale fuera de servicio', () => {
  const carro = { id: 'v1', placas: 'P-234IFN', fueraDeServicio: true, motivoFueraDeServicio: 'En el taller' };
  const e = estadoCarro(carro, [], '2026-08-26');
  assert.equal(e.estado, 'fuera de servicio');
  assert.equal(e.motivo, 'En el taller');
  assert.equal(e.contrato, null);
});

test('si no se dice qué día es, no se asume que el carro viene a tiempo', () => {
  const viejo = { ...rentado, devolucionPrevista: '2020-01-01' };
  assert.equal(estadoCarro({ id: 'v1' }, [viejo]).estado, 'atrasado');
});

// ---------------------------------------------------------------------------
// finDelContrato: hasta cuándo ocupa un contrato su carro.
//
// Es la ÚNICA regla del fin de un contrato. El dueño lo vio fallar así: «recibí
// el carro antes y ya quedó libre, pero me sigue apareciendo que lo devuelven el
// 12». Los contratos de estas pruebas se arman con las funciones que arman los
// reales (pruebas/fixtures/contratoDeUnCarro.mjs): el regreso se marca con
// `cierre.fechaReal` y con nada más.
// ---------------------------------------------------------------------------

test('finDelContrato: con el carro afuera y a tiempo, el fin es la devolución prevista', () => {
  const afuera = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9 });
  assert.equal(finDelContrato(afuera, '2026-10-05'), '2026-10-12');
  assert.equal(finDelContrato(afuera, '2026-10-12'), '2026-10-12', 'el día mismo de la devolución todavía no es atraso');
});

test('finDelContrato: un carro recibido ANTES termina el día que se recibió, no el día previsto', () => {
  // El caso del dueño: 3 oct → 12 oct, recibido el 6, y el contrato sigue abierto
  // porque quedó un saldo de daños. El carro ya está en el patio desde el 6.
  const recibidoAntes = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06' });
  assert.equal(estadoContrato(recibidoAntes), 'devuelto', 'el escenario: sigue abierto, no cerrado');
  assert.equal(recibidoAntes.devolucionPrevista, '2026-10-12');
  assert.equal(finDelContrato(recibidoAntes, '2026-10-07'), '2026-10-06');
  assert.equal(finDelContrato(recibidoAntes, '2026-10-30'), '2026-10-06', 'hoy no lo mueve: ya volvió');
});

test('finDelContrato: un carro recibido TARDE termina el día que de verdad volvió', () => {
  const tarde = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 2, recibidoEl: '2026-10-08' });
  assert.equal(tarde.devolucionPrevista, '2026-10-05');
  assert.equal(finDelContrato(tarde, '2026-10-09'), '2026-10-08');
});

test('finDelContrato: un contrato cerrado también termina el día que se recibió', () => {
  const cerradoYa = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06', danos: 0 });
  assert.equal(estadoContrato(cerradoYa), 'cerrado');
  assert.equal(finDelContrato(cerradoYa, '2026-10-07'), '2026-10-06');
});

test('finDelContrato: un carro todavía afuera después de su fecha prevista no queda libre ni hoy', () => {
  // Debía volver el 8 y hoy es el 10: no ha vuelto, así que no se puede decir
  // que el carro quedó libre el 8. Lo único que se sabe es que hoy sigue afuera
  // (está registrado como afuera): hoy no puede salir otra vez, mañana quién sabe.
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  assert.equal(atrasado.devolucionPrevista, '2026-10-08');
  assert.equal(finDelContrato(atrasado, '2026-10-10'), '2026-10-11');
  assert.equal(finDelContrato(atrasado, '2026-10-09'), '2026-10-10');
  assert.equal(finDelContrato(atrasado, '2026-12-31'), '2027-01-01', 'cruza el fin de mes y de año');
});

test('finDelContrato: sin saber qué día es no se inventa un atraso, y recibido gana sobre atrasado', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  assert.equal(finDelContrato(atrasado), '2026-10-08', 'sin `hoy`, la fecha prevista: la regla no lee el reloj');
  assert.equal(finDelContrato(atrasado, ''), '2026-10-08');
  // Pasada su fecha prevista pero ya recibido: manda el regreso, no el atraso.
  const recibido = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5, recibidoEl: '2026-10-07' });
  assert.equal(finDelContrato(recibido, '2026-10-20'), '2026-10-07');
});

test('finDelContrato: un contrato sin fechas no inventa un fin', () => {
  assert.equal(finDelContrato({}, '2026-10-10'), '');
  assert.equal(finDelContrato(null, '2026-10-10'), '');
  assert.equal(finDelContrato(undefined), '');
});
