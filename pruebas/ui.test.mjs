// Pruebas de las utilidades de presentación puras (dinero, fecha). aviso()
// no se prueba aquí: toca el DOM (document.getElementById) y esta suite
// corre en Node sin navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dinero, fecha, hora24, enterEnviariaElFormulario, bloquearEnterEnElFormulario,
} from '../js/ui.js';

test('dinero() da separador de miles y dos decimales', () => {
  assert.equal(dinero(1234.5), 'Q1,234.50');
  assert.equal(dinero(700), 'Q700.00');
  assert.equal(dinero(0), 'Q0.00');
});

test('lo vacío o lo que no sea número vale Q0.00, no rompe la pantalla', () => {
  assert.equal(dinero(undefined), 'Q0.00');
  assert.equal(dinero(null), 'Q0.00');
  assert.equal(dinero('abc'), 'Q0.00');
});

// Revisión final: dinero(-50) daba "Q-50.00" (toLocaleString pone el signo
// pegado al número, dentro de la Q); el plan de dinero y el saldo
// sobrepagado de resumen() (nucleo/contrato.js) van a mostrar montos
// negativos, y "Q-50.00" se lee como un monto raro, no como "menos 50".
test('un monto negativo lleva el signo antes de la Q: "-Q50.00", no "Q-50.00"', () => {
  assert.equal(dinero(-50), '-Q50.00');
  assert.equal(dinero(-1234.5), '-Q1,234.50');
});

test('fecha() da el formato que lee el dueño', () => {
  assert.equal(fecha('2026-08-25'), '25 ago 2026');
  assert.equal(fecha(''), '');
  assert.equal(fecha(undefined), '');
});

// ---------- La hora siempre en 24 horas ----------
//
// El dueño lo pidió el 3 de octubre: "el reloj tiene que ser de 24 hrs". El
// <input type="time"> del navegador mostraba "01:58 PM" porque su Chrome está
// en inglés — y se comprobó que ponerle lang="es-GT" NO lo cambia, Chrome usa
// el idioma del navegador. Así que el formato lo decide hora24(), no el
// navegador, y estas pruebas lo fijan.

test('hora24: acepta lo que el mostrador teclea de verdad', () => {
  assert.equal(hora24('13:45'), '13:45');
  assert.equal(hora24('1345'), '13:45', 'cuatro dígitos de corrido, sin dos puntos');
  assert.equal(hora24('945'), '09:45', 'tres dígitos: la primera es la hora');
  assert.equal(hora24('9:5'), '09:05', 'rellena con ceros a la izquierda');
  assert.equal(hora24('8'), '08:00', 'solo la hora, en punto');
  assert.equal(hora24(' 13:45 '), '13:45', 'recorta espacios');
});

test('hora24: medianoche y el último minuto del día', () => {
  assert.equal(hora24('00:00'), '00:00');
  assert.equal(hora24('0'), '00:00');
  assert.equal(hora24('23:59'), '23:59');
});

test('hora24: lo que no es una hora devuelve vacío, no una hora inventada', () => {
  // Una hora a medio escribir no es una hora. Guardar "9:" como si fuera algo
  // sería peor que dejarlo vacío: el contrato impreso diría una hora falsa.
  assert.equal(hora24('24:00'), '', 'no existe la hora 24');
  assert.equal(hora24('13:60'), '', 'no existe el minuto 60');
  assert.equal(hora24('99'), '');
  assert.equal(hora24('abc'), '');
  assert.equal(hora24(''), '');
  assert.equal(hora24(null), '');
  assert.equal(hora24(undefined), '');
});

// ---------------------------------------------------------------------------
// Revisión final, hallazgo 4: «9:» se guardaba como 09:00.
//
// El comentario de hora24, el mensaje del commit y los comentarios de las dos
// pantallas decían lo mismo: una hora a medio escribir queda VACÍA, no inventada.
// El código hacía lo contrario (`Number('')` es 0, que es entero y está en rango),
// y la prueba de arriba comentaba la promesa sin probarla: nunca preguntó por «9:».
// Lo que está en juego es una hora de aspecto firme, que él nunca escribió, en un
// contrato impreso.
// ---------------------------------------------------------------------------

test('hora24: una hora a medio escribir queda vacía, no se completa con ceros ("9:" no son las 09:00)', () => {
  assert.equal(hora24('9:'), '', 'la hora sin minutos después de los dos puntos');
  assert.equal(hora24('13:'), '');
  assert.equal(hora24('0:'), '', 'ni siquiera medianoche: el cero tampoco se inventa');
  assert.equal(hora24(':30'), '', 'los minutos sin hora no son las 00:30');
  assert.equal(hora24(':'), '');
  assert.equal(hora24('9: '), '');
});

test('hora24: lo que trae más de dos partes o signos no es una hora', () => {
  assert.equal(hora24('1:2:3'), '', 'no es 01:02');
  assert.equal(hora24('-5'), '', 'no es 05:00: el signo no se descarta en silencio');
  assert.equal(hora24('1::30'), '');
  assert.equal(hora24('9:305'), '', 'minutos de tres cifras');
  assert.equal(hora24('12345'), '', 'cinco dígitos de corrido');
  assert.equal(hora24('ab:cd'), '');
  assert.equal(hora24('9a'), '');
});

test('hora24: «1:30 pm» es como se dice la hora en Guatemala: se entiende, no se borra sin avisar', () => {
  assert.equal(hora24('1:30 pm'), '13:30');
  assert.equal(hora24('01:58 PM'), '13:58', 'el caso que reprodujo la revisión: sin PM salía vacío');
  assert.equal(hora24('9:30 am'), '09:30');
  assert.equal(hora24('5pm'), '17:00', 'sin espacio y sin minutos');
  assert.equal(hora24('9:30 a.m.'), '09:30');
  assert.equal(hora24('9 p. m.'), '21:00');
  assert.equal(hora24('130 pm'), '13:30', 'de corrido, como las demás');
  assert.equal(hora24('11:59 PM'), '23:59');
});

test('hora24: las 12 de la mañana son las 00:00 y las 12 del día las 12:00', () => {
  assert.equal(hora24('12:00 am'), '00:00');
  assert.equal(hora24('12:30 am'), '00:30');
  assert.equal(hora24('12 pm'), '12:00');
  assert.equal(hora24('12:15 pm'), '12:15');
});

test('hora24: «am» o «pm» con una hora que no existe en 12 horas vacía, no adivina', () => {
  assert.equal(hora24('13:30 pm'), '', 'las 13 ya son de 24 horas: contradice el pm');
  assert.equal(hora24('0:30 pm'), '');
  assert.equal(hora24('1:60 pm'), '');
  assert.equal(hora24('pm'), '', 'sin hora');
  assert.equal(hora24('1: pm'), '', 'ni «a medias» con pm');
});

test('hora24: otros separadores que el mostrador teclea de verdad (13.45, 13h45, 9 45)', () => {
  assert.equal(hora24('13.45'), '13:45');
  assert.equal(hora24('13h45'), '13:45');
  assert.equal(hora24('9 45'), '09:45');
});

test('hora24: lo que ya estaba bien sigue igual (el arreglo no endurece lo que funcionaba)', () => {
  for (const [entrada, esperado] of [
    ['13:45', '13:45'], ['1345', '13:45'], ['945', '09:45'], ['9:5', '09:05'], ['8', '08:00'], ['13', '13:00'],
    [' 13:45 ', '13:45'], ['00:00', '00:00'], ['0', '00:00'], ['23:59', '23:59'],
  ]) assert.equal(hora24(entrada), esperado, entrada);
});

test('hora24 siempre devuelve «HH:MM» o vacío, para cualquier cosa que se le tire', () => {
  const basura = ['', ' ', '9:', ':', '::', '1:2:3', '-5', '+5', '1e3', '٣:٣٠', '9\n', 'abc', '24:00', '99:99', '0:0', '12:5', '1 2', null, undefined, 5, 13.45];
  for (const x of basura) {
    assert.match(String(hora24(x)), /^(\d{2}:\d{2})?$/, `con ${JSON.stringify(x)}`);
  }
});

// ---------------------------------------------------------------------------
// Enter dentro de un campo no puede RECIBIR el carro y COBRAR el saldo
//
// Prueba del sistema (7 oct 2026), en el navegador con una tecla Enter de verdad:
// en «Recibir carro», con la pantalla recién abierta, escribir el lugar de entrada y
// apretar Enter —lo que se hace en una hoja de cálculo para pasar al campo
// siguiente— guardó el cierre Y registró un pago en efectivo por TODO el saldo
// (Q1,000.00), porque el monto a cobrar arranca prellenado con el saldo y Enter
// aprieta el botón «Recibir y cobrar». Un pago que nadie hizo.
// ---------------------------------------------------------------------------

const tecla = (key, tagName, type = 'text') => ({ key, target: { tagName, type } });

test('enterEnviariaElFormulario: Enter en un campo de texto o de número envía el formulario', () => {
  assert.equal(enterEnviariaElFormulario(tecla('Enter', 'INPUT', 'text')), true);
  assert.equal(enterEnviariaElFormulario(tecla('Enter', 'INPUT', 'number')), true);
  assert.equal(enterEnviariaElFormulario(tecla('Enter', 'INPUT', 'date')), true);
});

test('enterEnviariaElFormulario: otra tecla, un botón o un cuadro de texto largo no cuentan', () => {
  assert.equal(enterEnviariaElFormulario(tecla('Tab', 'INPUT')), false, 'solo Enter');
  assert.equal(enterEnviariaElFormulario(tecla('a', 'INPUT')), false);
  assert.equal(enterEnviariaElFormulario(tecla('Enter', 'BUTTON', 'submit')), false, 'Enter sobre el botón ES apretar el botón: eso es a propósito');
  assert.equal(enterEnviariaElFormulario(tecla('Enter', 'INPUT', 'submit')), false);
  assert.equal(enterEnviariaElFormulario(tecla('Enter', 'TEXTAREA', 'textarea')), false, 'en un cuadro largo Enter es un salto de línea');
  assert.equal(enterEnviariaElFormulario(undefined), false);
  assert.equal(enterEnviariaElFormulario({}), false);
});

test('bloquearEnterEnElFormulario: cancela el Enter que enviaría, y deja pasar todo lo demás', () => {
  let oyente = null;
  const formulario = { addEventListener: (tipo, fn) => { assert.equal(tipo, 'keydown'); oyente = fn; } };
  bloquearEnterEnElFormulario(formulario);
  assert.equal(typeof oyente, 'function', 'se conectó al keydown del formulario');

  const cancelados = [];
  const evento = (key, tagName, type) => ({ ...tecla(key, tagName, type), preventDefault: () => cancelados.push(`${key}:${tagName}`) });
  oyente(evento('Enter', 'INPUT', 'text'));
  oyente(evento('Enter', 'INPUT', 'number'));
  oyente(evento('Enter', 'BUTTON', 'submit'));
  oyente(evento('Enter', 'TEXTAREA', 'textarea'));
  oyente(evento('Tab', 'INPUT', 'text'));
  assert.deepEqual(cancelados, ['Enter:INPUT', 'Enter:INPUT'], 'solo los dos Enter de campos; el botón, el texto largo y Tab pasan');
});
