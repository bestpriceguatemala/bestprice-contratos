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
  assert.equal(devolucionPrevista('2026-08-20', 1), '2026-08-21', 'un día de renta: vuelve al día siguiente');
  assert.equal(devolucionPrevista('2026-08-20', '4'), '2026-08-24', 'los días del formulario llegan como texto');
});

// Prueba del sistema, H-10 (7 oct 2026): «Devolución prevista: 31 oct 2026» salía con 0 días, con
// aspecto de dato real, en la reservación y en la salida. Esta prueba antes AFIRMABA ese 0 días =
// «la misma fecha de salida»: era el hueco mismo. Un número de días que no es una renta (cero, vacío,
// negativo, con decimales, o tan grande que se sale del calendario) no tiene fecha de regreso, y la
// respuesta es vacío, que las pantallas ya pintan como «—». Nunca una fecha inventada.
test('devolucionPrevista: sin días que valgan, NO hay fecha de regreso (vacío), no la fecha de salida', () => {
  assert.equal(devolucionPrevista('2026-10-31', 0), '', '0 días es el caso que se veía como dato real');
  assert.equal(devolucionPrevista('2026-10-31', '0'), '');
  assert.equal(devolucionPrevista('2026-10-31', ''), '', 'el campo de días todavía vacío');
  assert.equal(devolucionPrevista('2026-10-31', undefined), '');
  assert.equal(devolucionPrevista('2026-10-31', null), '');
  assert.equal(devolucionPrevista('2026-10-31', 'abc'), '');
  assert.equal(devolucionPrevista('2026-10-31', NaN), '');
  assert.equal(devolucionPrevista('2026-10-31', -3), '', 'una devolución ANTES de salir no existe');
  assert.equal(devolucionPrevista('2026-10-31', 2.5), '', 'los días son enteros: 2.5 no se redondea a 2 en silencio');
});

test('devolucionPrevista: una salida que no es una fecha de verdad tampoco da fecha de regreso', () => {
  assert.equal(devolucionPrevista('', 3), '');
  assert.equal(devolucionPrevista(undefined, 3), '');
  assert.equal(devolucionPrevista('2026-02-30', 3), '', 'el 30 de febrero no existe: antes daba el 5 de marzo');
  assert.equal(devolucionPrevista('20261-10-21', 3), '', 'el año con cinco dígitos que el campo deja teclear');
});

test('devolucionPrevista: días tan grandes que el resultado se sale del calendario no revientan ni dan basura', () => {
  // Antes: new Date(...).toISOString() lanzaba RangeError con 1e12 días (y la pantalla se quedaba con la
  // fecha anterior, que parecía de verdad), y con 3,000,000 días daba «+010000-…» con el año de cinco dígitos.
  assert.equal(devolucionPrevista('2026-10-31', 1e12), '');
  assert.equal(devolucionPrevista('2026-10-31', 3000000), '');
  assert.equal(devolucionPrevista('2026-10-31', Infinity), '');
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
