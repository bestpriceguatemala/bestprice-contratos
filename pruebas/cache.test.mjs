// Pruebas de la mezcla entre la copia local y lo que viene de la nube.
//
// El sistema dibuja primero con la copia local para abrir rápido, y después
// llega lo de la nube. Si esa mezcla se hace mal, el mostrador ve un dato viejo
// encima de uno nuevo — o peor, se le borra algo que sí existía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mezclar, idsQueSobran } from '../js/cache.js';

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

// ---------- Lo que se borró de verdad ----------
//
// El dueño vació sus colecciones desde la consola de Firebase y el sistema
// siguió mostrando sus contratos de prueba: `mezclar` solo suma y actualiza,
// nunca quita. Estas pruebas fijan la regla que faltaba.

test('lo que la nube ya no devuelve, sobra en la copia local', () => {
  const locales = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(idsQueSobran(locales, [{ id: 'b' }]), ['a', 'c']);
});

test('si la nube devolvió todo, no sobra nada', () => {
  const locales = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(idsQueSobran(locales, [{ id: 'b' }, { id: 'a' }]), []);
});

test('una copia local vacía no borra nada aunque la nube traiga cosas', () => {
  assert.deepEqual(idsQueSobran([], [{ id: 'a' }]), []);
});

test('si la nube contesta vacío de verdad, se van todos', () => {
  // Es el caso del dueño: borró las cuatro colecciones en la consola.
  // Solo se llega aquí cuando la LECTURA SALIÓ BIEN; una lectura fallida ni
  // siquiera pasa por esta función (ver resultadoLectura en datos.js).
  assert.deepEqual(idsQueSobran([{ id: 'a' }, { id: 'b' }], []), ['a', 'b']);
});
