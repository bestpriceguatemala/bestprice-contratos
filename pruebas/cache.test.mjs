// Pruebas de la mezcla entre la copia local y lo que viene de la nube.
//
// El sistema dibuja primero con la copia local para abrir rápido, y después
// llega lo de la nube. Si esa mezcla se hace mal, el mostrador ve un dato viejo
// encima de uno nuevo — o peor, se le borra algo que sí existía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mezclar } from '../js/cache.js';

const local = [
  { id: 'a', placas: 'P-1', actualizado: 100 },
  { id: 'b', placas: 'P-2', actualizado: 100 },
];

test('lo más nuevo gana', () => {
  const remotos = [{ id: 'a', placas: 'P-1 NUEVA', actualizado: 200 }];
  const r = mezclar(local, remotos);
  assert.equal(r.find((x) => x.id === 'a').placas, 'P-1 NUEVA');
});

test('lo viejo de la nube no pisa lo nuevo de aquí', () => {
  const remotos = [{ id: 'a', placas: 'VIEJA', actualizado: 50 }];
  const r = mezclar(local, remotos);
  assert.equal(r.find((x) => x.id === 'a').placas, 'P-1');
});

test('lo que solo está en la nube se agrega', () => {
  const r = mezclar(local, [{ id: 'c', placas: 'P-3', actualizado: 10 }]);
  assert.equal(r.length, 3);
});

test('lo que solo está local se conserva', () => {
  const r = mezclar(local, []);
  assert.equal(r.length, 2);
});

test('lo borrado en la nube desaparece', () => {
  const r = mezclar(local, [{ id: 'a', borrado: true, actualizado: 300 }]);
  assert.deepEqual(r.map((x) => x.id), ['b']);
});
