process.env.TZ = 'America/Guatemala';

// Pruebas de fechas y días.
//
// Las fechas se manejan como texto 'YYYY-MM-DD' y se cuentan en UTC a propósito:
// si se usara la hora local, un contrato que sale a las 3 de la tarde en
// Guatemala podía contar un día de más o de menos según el horario de verano de
// otro país. Un día de diferencia son Q700.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sumarDias, diasEntre, devolucionPrevista, diasAtraso, hoyISO, textoFecha, esFechaISO,
} from '../js/nucleo/fechas.js';

test('suma días cruzando fin de mes y fin de año', () => {
  assert.equal(sumarDias('2026-08-20', 5), '2026-08-25');
  assert.equal(sumarDias('2026-08-30', 3), '2026-09-02');
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
});

test('cuenta días entre fechas, incluso en año bisiesto', () => {
  assert.equal(diasEntre('2026-08-20', '2026-08-25'), 5);
  assert.equal(diasEntre('2028-02-28', '2028-03-01'), 2);
  assert.equal(diasEntre('2026-08-25', '2026-08-20'), -5);
});

test('la devolución prevista es la salida más los días', () => {
  assert.equal(devolucionPrevista('2026-08-20', 4), '2026-08-24');
  assert.equal(devolucionPrevista('2026-08-20', 0), '2026-08-20');
});

test('el atraso nunca es negativo', () => {
  assert.equal(diasAtraso('2026-08-24', '2026-08-25'), 1);
  assert.equal(diasAtraso('2026-08-24', '2026-08-24'), 0);
  assert.equal(diasAtraso('2026-08-24', '2026-08-22'), 0, 'devolver antes no da crédito');
});

test('sin fecha real todavía no hay atraso que cobrar', () => {
  assert.equal(diasAtraso('2026-08-24', ''), 0);
  assert.equal(diasAtraso('2026-08-24', undefined), 0);
});

test('hoy es el día del calendario de aquí, no el de Londres', () => {
  // Las ocho de la noche del 22 de septiembre en Guatemala ya son las dos de la
  // madrugada del 23 en UTC. En el mostrador todavía es 22.
  assert.equal(hoyISO(new Date('2026-09-23T02:00:00Z')), '2026-09-22');
  assert.equal(hoyISO(new Date('2026-09-22T18:00:00Z')), '2026-09-22');
});

// Revisión final: cierre.js y avisos.js armaban sus mensajes con la fecha
// ISO cruda ('2026-08-25') en vez del formato que lee el dueño. textoFecha
// es la versión que puede usar el propio núcleo (duplica a fecha(), en
// ui.js, a propósito — ver el comentario de textoDosDecimales en dinero.js).
test('textoFecha da el formato que lee el dueño, igual que fecha() en ui.js', () => {
  assert.equal(textoFecha('2026-08-25'), '25 ago 2026');
  assert.equal(textoFecha(''), '');
  assert.equal(textoFecha(undefined), '');
});

// Prueba del sistema (7 oct 2026): el campo de fecha del navegador deja teclear el año con
// CINCO dígitos (20261 en vez de 2026) y devuelve «20261-10-21». Sin nadie que lo revisara,
// «Sacar carro» guardó un contrato con devolución prevista «+020261-10» (cobrado, y fuera de
// la lista del mes), y «Registrar pago» guardó un pago con un comprobante que nunca se pudo
// armar. Una fecha buena es la que sobrevive a un viaje de ida y vuelta por el calendario.
test('esFechaISO: una fecha de calendario de verdad, con cuatro dígitos de año', () => {
  assert.equal(esFechaISO('2026-10-21'), true);
  assert.equal(esFechaISO('2028-02-29'), true, 'bisiesto');
  assert.equal(esFechaISO('2026-12-31'), true);
});

test('esFechaISO: el año con cinco dígitos, un día que no existe o una fecha a medias no lo son', () => {
  assert.equal(esFechaISO('20261-10-21'), false, 'el desliz de teclear un dígito de más en el año');
  assert.equal(esFechaISO('2026-02-30'), false);
  assert.equal(esFechaISO('2027-02-29'), false, 'no es bisiesto');
  assert.equal(esFechaISO('2026-13-01'), false);
  assert.equal(esFechaISO('2026-1-5'), false, 'los campos de fecha siempre traen ceros');
  assert.equal(esFechaISO('0026-10-21'), false, 'el año 26 el calendario lo toma por 1926');
  assert.equal(esFechaISO('21/10/2026'), false);
});

test('esFechaISO: lo vacío o lo que no es texto no es una fecha', () => {
  assert.equal(esFechaISO(''), false);
  assert.equal(esFechaISO(undefined), false);
  assert.equal(esFechaISO(null), false);
  assert.equal(esFechaISO(20261021), false);
});
