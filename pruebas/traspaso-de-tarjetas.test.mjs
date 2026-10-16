// Pruebas del traspaso del número de la tarjeta y del CBC de «Sacar carro» a «Imprimir contrato» (ADR-001, aclaración
// del 16 de octubre de 2026).
//
// QUÉ SE PRUEBA AQUÍ: la vida de ese dato. Lo que importa de verdad es lo que NO pasa: que no llegue a ningún almacén, que
// no reaparezca en la hoja de otro contrato, que no se quede esperando mientras el mostrador almuerza. Cada prueba de
// abajo nombra una de esas cuatro cosas. (El camino completo con las dos pantallas está en contrato-impreso.test.mjs y
// en sacarCarro.test.mjs; la prueba en un Chrome de verdad, en el informe.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dejarTraspaso, tomarTraspaso, olvidarTraspaso, rutaDeImprimir, VIDA_DEL_TRASPASO_MS,
} from '../js/pantallas/traspasoDeTarjetas.js';
import { conEspias } from './fixtures/espias.mjs';

const T1 = { numero: '4111 1111 1111 3343', cbc: '123' };
const T2 = { numero: '5500 0000 0000 0004', cbc: '9876' };

/** Un entorno de mentira: un reloj que se mueve a mano, un temporizador que no corre solo y una ventana con su `location`. */
function entornoFalso(hash = '#/sacar/v1') {
  let ahora = 1_790_000_000_000;
  const oyentes = [];
  const temporizadores = new Map();
  let siguiente = 1;
  const ventana = {
    location: { hash },
    addEventListener: (evento, fn) => oyentes.push([evento, fn]),
    removeEventListener: (evento, fn) => {
      const i = oyentes.findIndex(([e, f]) => e === evento && f === fn);
      if (i >= 0) oyentes.splice(i, 1);
    },
  };
  return {
    ventana,
    oyentes,
    temporizadores,
    entorno: {
      ahora: () => ahora,
      programar: (fn, ms) => { const id = siguiente++; temporizadores.set(id, { fn, ms }); return id; },
      cancelar: (id) => temporizadores.delete(id),
      ventana: () => ventana,
    },
    avanzar: (ms) => { ahora += ms; },
    /** Cambia la dirección y avisa, como el navegador. */
    irA(nuevoHash) {
      ventana.location.hash = nuevoHash;
      oyentes.filter(([e]) => e === 'hashchange').forEach(([, fn]) => fn());
    },
    /** Corre los temporizadores que quedan, como si el tiempo se hubiera cumplido. */
    cumplir() { [...temporizadores.values()].forEach((t) => t.fn()); },
  };
}

test.afterEach(() => olvidarTraspaso());

test('lo que se deja para un contrato se entrega por posición, las dos tarjetas, y UNA sola vez', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1, T2], m.entorno);
  assert.deepEqual(tomarTraspaso('c1'), [T1, T2]);
  assert.deepEqual(tomarTraspaso('c1'), [], 'la segunda vez ya no hay nada: es un salto, no un almacén');
});

test('lo que se entrega es una copia: tocarla no cambia nada de lo que se dejó ni de lo que alguien más tenga', () => {
  const m = entornoFalso();
  const original = [{ ...T1 }];
  dejarTraspaso('c1', original, m.entorno);
  original[0].numero = '0000';
  original.push({ numero: '1', cbc: '1' });
  assert.deepEqual(tomarTraspaso('c1'), [T1], 'lo que se dejó no cambia porque quien lo dejó siga tocando su arreglo');
});

test('LA PEOR: lo de un contrato NO sale en la hoja de otro, ni ahora ni después', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1], m.entorno);
  assert.deepEqual(tomarTraspaso('c2'), [], 'la pantalla de imprimir del contrato 2 no ve la tarjeta del 1');
  assert.deepEqual(tomarTraspaso('c1'), [], 'y visitar la de otro contrato cerró el salto: tampoco queda para el 1');
});

test('sacar un carro y luego otro: lo del segundo reemplaza a lo del primero, y lo del primero no sale en ningún lado', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1, T2], m.entorno);
  dejarTraspaso('c2', [{ numero: '3700 000000 00002', cbc: '4444' }], m.entorno);
  assert.deepEqual(tomarTraspaso('c1'), [], 'el primero ya no está');
  // (la lectura de arriba ya cerró el salto; se deja otra vez para mirar el segundo solo)
  dejarTraspaso('c1', [T1, T2], m.entorno);
  dejarTraspaso('c2', [{ numero: '3700 000000 00002', cbc: '4444' }], m.entorno);
  const del2 = tomarTraspaso('c2');
  assert.equal(del2.length, 1);
  assert.equal(JSON.stringify(del2).includes('3343'), false, 'ni un dígito del primero');
  assert.equal(JSON.stringify(del2).includes('123'), false);
});

test('una renta sin tarjeta (nada que llevar) también borra lo que hubiera dejado la anterior', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1], m.entorno);
  dejarTraspaso('c2', [{ numero: '', cbc: '' }, { numero: '  ', cbc: undefined }], m.entorno);
  assert.deepEqual(tomarTraspaso('c1'), []);
  assert.deepEqual(tomarTraspaso('c2'), []);
  dejarTraspaso('c1', [T1], m.entorno);
  dejarTraspaso('c3', [], m.entorno);
  assert.deepEqual(tomarTraspaso('c1'), []);
  dejarTraspaso('c1', [T1], m.entorno);
  dejarTraspaso('c4', null, m.entorno);
  assert.deepEqual(tomarTraspaso('c1'), []);
});

test('sin id de contrato no se deja nada, y quien pide sin id no recibe nada', () => {
  const m = entornoFalso();
  dejarTraspaso('', [T1], m.entorno);
  dejarTraspaso(undefined, [T1], m.entorno);
  assert.deepEqual(tomarTraspaso(''), []);
  assert.deepEqual(tomarTraspaso(undefined), []);
  dejarTraspaso('c1', [T1], m.entorno);
  assert.deepEqual(tomarTraspaso(undefined), [], 'pedir sin id no entrega lo de c1');
  assert.deepEqual(tomarTraspaso('c1'), [], 'y de paso cerró el salto');
});

test('una tarjeta con solo el CBC, o con solo el número, sí se lleva; la segunda en blanco se lleva en blanco, en su lugar', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [{ numero: '4111 1111 1111 3343', cbc: '' }, { numero: '', cbc: '987' }], m.entorno);
  assert.deepEqual(tomarTraspaso('c1'), [{ numero: '4111 1111 1111 3343', cbc: '' }, { numero: '', cbc: '987' }]);
});

test('NO SE QUEDA mientras el mostrador almuerza: pasado un minuto no hay nada, aunque el temporizador no haya corrido', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1], m.entorno);
  m.avanzar(VIDA_DEL_TRASPASO_MS - 1);
  assert.deepEqual(tomarTraspaso('c1'), [T1], 'justo antes de vencer todavía sirve (el salto real dura milisegundos)');
  dejarTraspaso('c1', [T1], m.entorno);
  m.avanzar(VIDA_DEL_TRASPASO_MS + 1);
  assert.deepEqual(tomarTraspaso('c1'), [], 'una computadora dormida deja el temporizador pendiente: la hora se comprueba al tomar');
});

test('el temporizador borra de verdad lo que nadie tomó, y se cancela cuando ya no hace falta', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1], m.entorno);
  assert.equal(m.temporizadores.size, 1);
  assert.equal([...m.temporizadores.values()][0].ms, VIDA_DEL_TRASPASO_MS);
  m.cumplir();
  assert.equal(m.temporizadores.size, 0, 'al cumplirse quedó cancelado');
  assert.deepEqual(tomarTraspaso('c1'), [], 'ya no había nada que entregar aunque la hora no hubiera pasado');
  assert.equal(m.oyentes.length, 0, 'y quitó su oyente de cambio de pantalla');
  // tomar lo cancela; reemplazar lo cancela
  dejarTraspaso('c1', [T1], m.entorno);
  tomarTraspaso('c1');
  assert.equal(m.temporizadores.size, 0);
  dejarTraspaso('c1', [T1], m.entorno);
  dejarTraspaso('c2', [T2], m.entorno);
  assert.equal(m.temporizadores.size, 1, 'solo el del traspaso vigente');
});

test('cambiar de pantalla a cualquier lado que no sea imprimir ESTE contrato borra lo que había', () => {
  for (const destino of ['#/flota', '#/contratos/c1', '#/imprimir/c2', '#/sacar/v9', '', '#/imprimir/c1x']) {
    const m = entornoFalso();
    dejarTraspaso('c1', [T1], m.entorno);
    m.irA(destino);
    assert.deepEqual(tomarTraspaso('c1'), [], `ir a «${destino}» lo borra`);
    assert.equal(m.oyentes.length, 0, 'y no deja el oyente puesto');
  }
});

test('el salto normal sí sobrevive: ir a imprimir ESTE contrato conserva lo dejado hasta que la pantalla lo toma', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1, T2], m.entorno);
  m.irA(rutaDeImprimir('c1'));
  assert.deepEqual(tomarTraspaso('c1'), [T1, T2]);
  assert.equal(m.oyentes.length, 0, 'tomarlo quita el oyente');
});

test('dejar dos veces no acumula oyentes, y olvidar los quita', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1], m.entorno);
  dejarTraspaso('c2', [T2], m.entorno);
  dejarTraspaso('c3', [T1], m.entorno);
  assert.equal(m.oyentes.length, 1);
  olvidarTraspaso();
  assert.equal(m.oyentes.length, 0);
  assert.equal(m.temporizadores.size, 0);
  assert.deepEqual(tomarTraspaso('c3'), []);
});

test('sin ventana (Node) deja y toma igual, sin oyente', () => {
  const m = entornoFalso();
  dejarTraspaso('c1', [T1], { ...m.entorno, ventana: () => undefined });
  assert.deepEqual(tomarTraspaso('c1'), [T1]);
});

test('ADR-001: de punta a punta, dejar, cambiar de pantalla, tomar, vencer y olvidar no tocan NINGÚN almacén, red ni consola', async () => {
  const apuntes = await conEspias(() => {
    const m = entornoFalso();
    dejarTraspaso('c1', [T1, T2], m.entorno);
    m.irA(rutaDeImprimir('c1'));
    tomarTraspaso('c1');
    dejarTraspaso('c2', [T1], m.entorno);
    m.irA('#/flota');
    dejarTraspaso('c3', [T2], m.entorno);
    m.avanzar(VIDA_DEL_TRASPASO_MS + 1);
    tomarTraspaso('c3');
    dejarTraspaso('c4', [T1], m.entorno);
    m.cumplir();
    olvidarTraspaso();
  });
  assert.deepEqual(apuntes, [], 'ni localStorage, ni sessionStorage, ni IndexedDB, ni fetch, ni la consola');
});

test('el módulo no sabe de almacenes: ni los nombra, ni importa nada, ni exporta una forma de «mirar» lo guardado sin borrarlo', async () => {
  const fuente = readFileSync(new URL('../js/pantallas/traspasoDeTarjetas.js', import.meta.url), 'utf8');
  const codigo = fuente.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const prohibido of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'console.', 'location.hash =', 'history.', 'document.title', 'import ']) {
    assert.equal(codigo.includes(prohibido), false, `el módulo no usa ${prohibido}`);
  }
  const modulo = await import('../js/pantallas/traspasoDeTarjetas.js');
  assert.deepEqual(Object.keys(modulo).sort(), ['VIDA_DEL_TRASPASO_MS', 'dejarTraspaso', 'olvidarTraspaso', 'rutaDeImprimir', 'tomarTraspaso']);
});

test('la ruta de imprimir es la que registra app.js', () => {
  assert.equal(rutaDeImprimir('abc'), '#/imprimir/abc');
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /registrarPantalla\('#\/imprimir\/:contratoId'/);
});
