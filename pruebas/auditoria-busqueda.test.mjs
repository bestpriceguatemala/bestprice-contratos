// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en el buscador: el número de contrato
// tal como lo imprime la hoja («014591») y la búsqueda vacía. Cada una nació de un mutante que SOBREVIVIÓ: se le metió a propósito
// un error al código y las 2,589 pruebas de entonces seguían en verde. Aquí cada una falla con ese error puesto y pasa con el
// código bueno. Qué le habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coincide, esElNumeroDe, filtrarContratos, numeroSinCeros,
} from '../js/nucleo/busqueda.js';
import { contratoReal } from './fixtures/contratoReal.mjs';

const contrato = (id, numero) => contratoReal({ id, numero });

test('el número tal como lo imprime la hoja encuentra ESE contrato y no otro cuyo número lo contenga', () => {
  const lista = [contrato('a', 14591), contrato('b', 114591), contrato('c', 145910), contrato('d', 459)];
  const ids = (r) => r.map((c) => c.id);
  assert.deepEqual(ids(filtrarContratos(lista, '014591')), ['a'], 'con sus ceros, como en el papel');
  assert.deepEqual(ids(filtrarContratos(lista, '14591')), ['a', 'b', 'c'], 'sin ceros busca como siempre: «está dentro»');
  // Menos de seis cifras con un cero adelante no es el número de la hoja (podría ser un pedazo de unas placas o un teléfono).
  assert.deepEqual(ids(filtrarContratos([contrato('x', 12), contrato('y', 123)], '012')), []);
});

test('«es el número de este contrato» solo si la consulta ENTERA es ese número', () => {
  // `palabras.length !== 1` -> devolvía true con dos palabras, y «14591 Ana» pasaba por el número exacto.
  const c = contrato('a', 14591);
  assert.equal(esElNumeroDe(c, '14591'), true);
  assert.equal(esElNumeroDe(c, '014591'), true);
  assert.equal(esElNumeroDe(c, '  014591  '), true);
  assert.equal(esElNumeroDe(c, '14591 ana'), false);
  assert.equal(esElNumeroDe(c, ''), false);
  assert.equal(esElNumeroDe(c, '459'), false);
  assert.equal(esElNumeroDe(c, '145910'), false);
  assert.equal(esElNumeroDe({ numero: null }, '0'), false, 'unos ceros no son el número de ningún contrato');
  assert.equal(numeroSinCeros('0000'), '');
  assert.equal(numeroSinCeros('abc'), '');
});

test('una búsqueda vacía o en blanco encuentra todo', () => {
  // `if (!palabras.length) return true` -> false: la caja vacía no encontraría nada.
  assert.equal(coincide('Ana López', ''), true);
  assert.equal(coincide('Ana López', '   '), true);
  assert.equal(coincide('Ana López', 'lopez ana'), true, 'en cualquier orden');
  assert.equal(coincide('Ana López', 'beto'), false);
  assert.equal(coincide('3078-4155', '30784155'), true, 'saltándose los separadores');
});
