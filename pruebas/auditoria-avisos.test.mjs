// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en los avisos de «Sacar carro»:
// los bordes de «venció», de «debe» y de «cuál reservación avisa primero». Cada una nació de un mutante que SOBREVIVIÓ: se
// le metió a propósito un error al código y las 2,589 pruebas de entonces seguían en verde. Aquí cada una falla con ese
// error puesto y pasa con el código bueno. Qué le habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
//
// El cliente, el contrato y las reservaciones salen de los constructores de verdad, no de objetos escritos a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosDeSalida } from '../js/nucleo/avisos.js';
import { construirCliente } from '../js/nucleo/cliente.js';
import { construirReserva } from '../js/nucleo/reserva.js';
import { reservaParaGuardar } from '../js/datos.js';
import { contratoReal, salidaReal } from './fixtures/contratoReal.mjs';

const HOY = '2026-10-20';
const carro = { id: 'v1', placas: 'P-111AAA' };
const contrato = () => salidaReal({ fechaSalida: HOY, dias: 4 });
const cliente = (campos = {}) => construirCliente({}, {
  id: 'k1', nombres: 'Juan', apellidos: 'Pérez', licenciaExpira: '2030-01-01', documentoExpira: '2030-01-01', ...campos,
});
const avisar = (extra = {}) => avisosDeSalida({
  cliente: cliente(), carro, contrato: contrato(), contratosDelCliente: [], contratosDelCarro: [], hoy: HOY, ...extra,
});
const mensajes = (r) => r.map((a) => a.mensaje);

test('la licencia que vence HOY todavía sirve; la que venció AYER, no (y lo mismo el documento)', () => {
  // `diasEntre(vence, hoy) > 0`: con `>= 0` avisaría «venció» el último día que vale; con `> 1`, el día después de vencida
  // se le rentaría el carro a alguien sin licencia vigente y sin un solo aviso.
  for (const [campo, venció] of [
    ['licenciaExpira', 'La licencia del cliente venció el 19 oct 2026.'], ['documentoExpira', 'El documento del cliente venció el 19 oct 2026.'],
  ]) {
    const conFecha = (fecha) => mensajes(avisar({ cliente: cliente({ [campo]: fecha }) }));
    assert.deepEqual(conFecha(HOY), [], `${campo}: vence hoy, todavía vale`);
    assert.deepEqual(conFecha('2026-10-21'), [], `${campo}: vence mañana`);
    assert.deepEqual(conFecha('2026-10-19'), [venció], `${campo}: venció ayer`);
    assert.equal(conFecha('2026-10-01').length, 1, `${campo}: venció hace semanas`);
  }
});

test('un cliente que debe Q0.50 de una renta anterior también se avisa', () => {
  // `deuda > 0` -> `deuda > 1`.
  const debe = contratoReal({ id: 'c0', numero: 5, fechaSalida: '2026-09-01', dias: 2, recibidoEl: '2026-09-03', pagos: [{ monto: 1399.5 }] });
  const r = avisar({ contratosDelCliente: [debe] });
  assert.deepEqual(mensajes(r), ['Este cliente debe Q0.50 de una renta anterior.']);
  const aldia = contratoReal({ id: 'c1', numero: 6, fechaSalida: '2026-09-01', dias: 2, recibidoEl: '2026-09-03', pagos: [{ monto: 1400 }] });
  assert.deepEqual(mensajes(avisar({ contratosDelCliente: [aldia] })), []);
});

test('con varias reservaciones encimadas avisa de la que sale PRIMERO; si salen el mismo día, de la primera de la lista', () => {
  // `diasEntre(primera, r) < 0` -> `<= 0` o `< 1`: en un empate se quedaba con la última.
  const apartada = (id, nombre, desde) => reservaParaGuardar(construirReserva({ id }, {
    clienteNombre: nombre, telefono: '5555-0000', precioDia: 600, anticipo: 0, fechaSalida: desde, dias: 5, carroId: 'v1', carroPlacas: 'P-111AAA',
  }), { id, ahora: 1 });
  const ana = apartada('a', 'Ana', '2026-10-22');
  const beto = apartada('b', 'Beto', '2026-10-21');
  const carla = apartada('c', 'Carla', '2026-10-21');
  const aviso = (reservasDelCarro) => mensajes(avisar({ reservasDelCarro }));
  assert.deepEqual(aviso([ana, beto]), ['Este carro está apartado para Beto desde el 21 oct 2026 (y 1 reservación más).']);
  assert.deepEqual(aviso([beto, carla]), ['Este carro está apartado para Beto desde el 21 oct 2026 (y 1 reservación más).'], 'empate: la primera');
  assert.deepEqual(aviso([carla, beto]), ['Este carro está apartado para Carla desde el 21 oct 2026 (y 1 reservación más).']);
  assert.deepEqual(aviso([ana, carla, beto]), ['Este carro está apartado para Carla desde el 21 oct 2026 (y 2 reservaciones más).']);
  assert.deepEqual(aviso([ana]), ['Este carro está apartado para Ana desde el 22 oct 2026.']);
});
