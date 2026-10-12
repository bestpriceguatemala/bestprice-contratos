// El buscador de asignaciones (nucleo/asignacion.js): ¿cuántos compromisos pueden tener un carro propio?
//
// Es un problema de grafos puro, sin fechas: quién se cruza con quién (`choques`) y a qué carros no puede ir cada
// compromiso (`vetados`, porque ahí ya hay uno clavado). Las fechas las resuelve reserva.js, una sola vez, con la
// regla de cruce. Aquí se prueba que la respuesta sea la EXACTA, contra una enumeración completa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maximoConCarro } from '../js/nucleo/asignacion.js';

const sinVetos = (n, carros) => Array.from({ length: n }, () => Array(carros).fill(false));
const todosChocan = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i !== j));
const nadieChoca = (n) => Array.from({ length: n }, () => Array(n).fill(false));

test('sin compromisos no hay nada que colocar', () => {
  assert.equal(maximoConCarro({ carros: 3, choques: [], vetados: [] }), 0);
});

test('compromisos que se cruzan necesitan un carro cada uno; los que no, pueden compartirlo', () => {
  assert.equal(maximoConCarro({ carros: 1, choques: todosChocan(3), vetados: sinVetos(3, 1) }), 1);
  assert.equal(maximoConCarro({ carros: 2, choques: todosChocan(3), vetados: sinVetos(3, 2) }), 2);
  assert.equal(maximoConCarro({ carros: 3, choques: todosChocan(3), vetados: sinVetos(3, 3) }), 3);
  assert.equal(maximoConCarro({ carros: 1, choques: nadieChoca(3), vetados: sinVetos(3, 1) }), 3);
});

test('un compromiso no puede usar un carro vetado', () => {
  assert.equal(maximoConCarro({ carros: 1, choques: nadieChoca(1), vetados: [[true]] }), 0);
  // Dos compromisos, dos carros, y cada uno solo puede ir al otro: caben los dos.
  assert.equal(maximoConCarro({ carros: 2, choques: todosChocan(2), vetados: [[true, false], [false, true]] }), 2);
  // Los dos vetados del mismo carro y chocando entre sí: solo uno cabe en el otro.
  assert.equal(maximoConCarro({ carros: 2, choques: todosChocan(2), vetados: [[true, false], [true, false]] }), 1);
});

test('la cadena: el primero obliga al segundo, ese al tercero, y solo el final dice que no caben los cuatro', () => {
  // 0—1—2—3 se cruzan en cadena y hay dos carros. El 0 no puede ir al carro 0 y el 3 tampoco (ahí hay uno clavado).
  // 0→carro 1, 1→carro 0, 2→carro 1, y el 3 ya no tiene a dónde: sin el 0, el 3 sí cabe (y todos).
  const choques = [
    [false, true, false, false],
    [true, false, true, false],
    [false, true, false, true],
    [false, false, true, false],
  ];
  const vetados = [[true, false], [false, false], [false, false], [true, false]];
  assert.equal(maximoConCarro({ carros: 2, choques, vetados }), 3, 'no caben los cuatro, y el buscador lo sabe');
  const sinElPrimero = [choques[1].slice(1), choques[2].slice(1), choques[3].slice(1)];
  assert.equal(maximoConCarro({ carros: 2, choques: sinElPrimero, vetados: vetados.slice(1) }), 3, 'sin el primero caben los tres');
});

test('si se pasa de su límite de pasos, contesta null: no inventa un número', () => {
  assert.equal(maximoConCarro({ carros: 2, choques: todosChocan(3), vetados: sinVetos(3, 2), limite: 1 }), null);
  assert.equal(typeof maximoConCarro({ carros: 2, choques: todosChocan(3), vetados: sinVetos(3, 2) }), 'number');
});

test('los carros iguales y sin usar no multiplican la búsqueda', () => {
  // 12 compromisos que se cruzan todos y 12 carros iguales: 12! asignaciones. Con carros intercambiables, un suspiro.
  assert.equal(maximoConCarro({ carros: 12, choques: todosChocan(12), vetados: sinVetos(12, 12) }), 12);
  assert.equal(maximoConCarro({ carros: 11, choques: todosChocan(12), vetados: sinVetos(12, 11) }), 11);
});

// ---------- Contra la enumeración completa ----------

function azar(semilla) {
  let a = semilla;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Todas las formas de dar a cada compromiso un carro (o dejarlo sin), sin pensar: la respuesta de fuerza bruta. */
function porEnumeracion(carros, choques, vetados) {
  const n = choques.length;
  const asignado = Array(n).fill(-1);
  let mejor = 0;
  const sigue = (i) => {
    if (i === n) { mejor = Math.max(mejor, asignado.filter((c) => c >= 0).length); return; }
    for (let c = -1; c < carros; c += 1) {
      if (c >= 0 && vetados[i][c]) continue;
      if (c >= 0 && asignado.some((otro, j) => j < i && otro === c && choques[i][j])) continue;
      asignado[i] = c;
      sigue(i + 1);
    }
    asignado[i] = -1;
  };
  sigue(0);
  return mejor;
}

test('coincide con la enumeración completa en 2000 casos al azar', () => {
  const rnd = azar(7);
  let distintos = new Set();
  for (let caso = 0; caso < 2000; caso += 1) {
    const carros = 1 + Math.floor(rnd() * 4);
    const n = Math.floor(rnd() * 8);
    const densidad = rnd();
    const choques = Array.from({ length: n }, () => Array(n).fill(false));
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (rnd() < densidad) { choques[i][j] = true; choques[j][i] = true; }
    const vetados = Array.from({ length: n }, () => Array.from({ length: carros }, () => rnd() < 0.3));
    const esperado = porEnumeracion(carros, choques, vetados);
    assert.equal(maximoConCarro({ carros, choques, vetados }), esperado, `caso ${caso}: ${JSON.stringify({ carros, choques, vetados })}`);
    distintos.add(esperado);
  }
  assert.ok(distintos.size >= 4, 'el examen probó respuestas distintas');
});
