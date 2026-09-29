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
  textoConfirmarLiberar, textoAvisoGarantiaLiberada, estiloCifraResumen,
} from '../js/pantallas/flota.js';

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
