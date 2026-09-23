// Pruebas de los estados.
//
// La regla que más importa: el carro se libera cuando REGRESA, no cuando se
// cierra el contrato. El dueño puede tardar días en liberar la garantía —
// sobre todo si hubo daños y está esperando que le paguen — y mientras tanto
// ese carro tiene que poder volver a salir rentado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoContrato, puedeCerrar, pendientesDe, estadoCarro } from '../js/nucleo/estados.js';

const rentado = {
  id: 'c1', carroId: 'v1', dias: 4, precioDia: 700,
  devolucionPrevista: '2026-08-24',
  pagos: [{ monto: 2800, porcentajeTarjeta: 0 }],
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
