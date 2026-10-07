// Pruebas de la pantalla principal (flota.js): solo la parte pura, sin DOM.
//
// Lo que se prueba aquí es lo propio de esta pantalla para la Tarea 5: el
// texto del confirm() antes de soltar una garantía (nombra al cliente y el
// monto porque "no se deshace desde el sistema") y el aviso de éxito al
// soltarla (que se apoya en puedeCerrar, no en una suposición propia).
//
// Tarea 7 (el resumen del día) agrega estiloCifraResumen: la regla de "un
// cero se ve apagado, el rojo es solo para atrasados y solo cuando los hay".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  textoConfirmarLiberar, textoAvisoGarantiaLiberada, estiloCifraResumen, rutaDeAtrasados, textoFalloAlLiberar,
} from '../js/pantallas/flota.js';
import { liberarGarantia } from '../js/datos.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';

test('textoConfirmarLiberar: nombra al cliente y el monto, y avisa que no se deshace', () => {
  const contrato = { clienteNombre: 'Juan Pérez', garantiaMonto: 1500 };
  const texto = textoConfirmarLiberar(contrato);
  assert.match(texto, /Juan Pérez/);
  assert.match(texto, /Q1,500\.00/);
  assert.match(texto, /no se puede deshacer/);
});

test('textoConfirmarLiberar: sin nombre de cliente, usa un texto genérico (no revienta)', () => {
  const texto = textoConfirmarLiberar({ garantiaMonto: 500 });
  assert.match(texto, /este cliente/);
});

test('textoAvisoGarantiaLiberada: con saldo en cero y garantía ya liberada, dice que el contrato quedó cerrado', () => {
  const contrato = {
    numero: 14, garantiaLiberada: true, cierre: { fechaReal: '2026-08-25', danos: 0, descuento: 0 },
  };
  assert.equal(textoAvisoGarantiaLiberada(contrato), 'Garantía liberada. Contrato N.° 14 cerrado.');
});

test('textoAvisoGarantiaLiberada: si por algo el contrato no puede cerrar todavía, no lo dice cerrado', () => {
  // Caso defensivo: puedeCerrar también exige saldo en cero. Este contrato
  // trae garantía liberada pero con saldo pendiente (no debería pasar nunca
  // en la práctica, porque liberarGarantia ya lo impide), y aun así el
  // mensaje no miente diciendo "cerrado".
  const contrato = {
    numero: 14, garantiaLiberada: true, dias: 1, precioDia: 700,
    cierre: { fechaReal: '2026-08-25', danos: 0, descuento: 0 },
  };
  assert.equal(textoAvisoGarantiaLiberada(contrato), 'Garantía liberada.');
});

test('estiloCifraResumen: en cero se ve apagado, sea o no la cifra de atrasados', () => {
  assert.equal(estiloCifraResumen(0, false), 'apagado');
  assert.equal(estiloCifraResumen(0, true), 'apagado');
});

test('estiloCifraResumen: atrasados en positivo es alerta (rojo)', () => {
  assert.equal(estiloCifraResumen(3, true), 'alerta');
});

test('estiloCifraResumen: cualquier otra cifra en positivo es normal, nunca alerta', () => {
  assert.equal(estiloCifraResumen(3, false), 'normal');
  assert.equal(estiloCifraResumen(1, false), 'normal');
});

// El número «Atrasados» del resumen cuenta contratos, ajenos incluidos; los cuadros de esta pantalla
// son solo de la flota propia. Tiene que llevar a la lista que sí los trae.
test('rutaDeAtrasados: lleva al calendario de hoy (que lista todos los atrasados), no a los cuadros de la flota', () => {
  assert.equal(rutaDeAtrasados('2026-10-20'), '#/calendario/2026-10-20');
  assert.notEqual(rutaDeAtrasados('2026-10-20'), '#/flota');
});

// «Liberar garantía» mostraba el texto crudo del error: «La nube no respondió a tiempo.» sin decir qué
// hacer, o el inglés del SDK con una sesión vencida. Un rechazo del negocio (todavía debe) sí es la razón.
test('textoFalloAlLiberar: si todavía debe, el mensaje del rechazo es la razón y se deja tal cual', async () => {
  // Una renta recibida con Q200 de daños sin cobrar: debe, y liberarGarantia se niega con su código.
  const debe = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06' });
  const error = await liberarGarantia(debe).then(() => null, (e) => e);
  assert.match(error.message, /Todavía debe Q200\.00/);
  assert.equal(textoFalloAlLiberar(error), error.message);
});

test('textoFalloAlLiberar: si fue la red o la nube, dice qué hacer en vez del texto crudo', () => {
  const esperado = 'No se pudo liberar la garantía. Revisa tu conexión e intenta de nuevo.';
  assert.equal(textoFalloAlLiberar(new Error('La nube no respondió a tiempo.')), esperado);
  assert.equal(textoFalloAlLiberar(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })), esperado);
  assert.equal(textoFalloAlLiberar(undefined), esperado);
});
