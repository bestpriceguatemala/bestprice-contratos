process.env.TZ = 'America/Guatemala';

// Pruebas de fechas y días.
//
// Las fechas se manejan como texto 'YYYY-MM-DD' y se cuentan en UTC a propósito:
// si se usara la hora local, un contrato que sale a las 3 de la tarde en
// Guatemala podía contar un día de más o de menos según el horario de verano de
// otro país. Un día de diferencia son Q700.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sumarDias, diasEntre, devolucionPrevista, diasAtraso, hoyISO } from '../js/nucleo/fechas.js';

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
