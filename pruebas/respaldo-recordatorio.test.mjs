// Cuándo se le recuerda el respaldo, y qué años le faltan.
//
// `hoy` siempre llega de fuera ('YYYY-MM-DD'): Guatemala va seis horas detrás de UTC y este sistema ya dijo «mañana» a
// partir de las seis de la tarde por leer el reloj dentro de una regla (hoyISO existe por eso). Aquí nada lee el reloj.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_PARA_RECORDAR, respaldoVencido, ultimoRespaldo, estadoDeLosAnios, rangoDelAnio, nombreDelArchivo,
} from '../js/nucleo/respaldo.js';

test('pasó un año desde el último respaldo: se le recuerda; un día antes, no', () => {
  assert.equal(DIAS_PARA_RECORDAR, 365);
  assert.equal(respaldoVencido('2026-10-12', '2027-10-12'), true, 'justo un año después (365 días)');
  assert.equal(respaldoVencido('2026-10-12', '2027-10-11'), false, 'a un día de cumplir el año');
  assert.equal(respaldoVencido('2026-10-12', '2026-10-13'), false);
  assert.equal(respaldoVencido('2026-10-12', '2026-10-12'), false, 'el mismo día que lo bajó');
});

test('pasa por un año bisiesto sin saltarse ni adelantar el aviso más de un día', () => {
  assert.equal(respaldoVencido('2027-10-12', '2028-10-11'), true, 'con el 29 de febrero de por medio ya pasaron 365 días');
  assert.equal(respaldoVencido('2027-10-12', '2028-10-10'), false);
});

test('nunca se bajó un respaldo: se le recuerda (lo seguro es avisar, no callar)', () => {
  assert.equal(respaldoVencido(null, '2026-10-12'), true);
  assert.equal(respaldoVencido(undefined, '2026-10-12'), true);
  assert.equal(respaldoVencido('', '2026-10-12'), true);
});

test('una fecha guardada que no es una fecha NO silencia el aviso', () => {
  assert.equal(respaldoVencido('mañana', '2026-10-12'), true);
  assert.equal(respaldoVencido('2026-02-30', '2026-10-12'), true);
});

test('una fecha guardada en el futuro lejano tampoco lo silencia (un reloj descompuesto no apaga el aviso por años)', () => {
  assert.equal(respaldoVencido('2031-01-01', '2026-10-12'), true);
});

test('pero el reloj de otra computadora un día adelantado no hace que el aviso salte de más', () => {
  assert.equal(respaldoVencido('2026-10-13', '2026-10-12'), false);
  assert.equal(respaldoVencido('2026-10-14', '2026-10-12'), false);
});

test('el último respaldo es la fecha más reciente de todos los años bajados', () => {
  assert.equal(ultimoRespaldo({ 2026: '2026-10-12', 2027: '2027-03-01' }), '2027-03-01');
  assert.equal(ultimoRespaldo({ 2026: '2026-10-12' }), '2026-10-12');
  assert.equal(ultimoRespaldo({}), null);
  assert.equal(ultimoRespaldo(null), null);
  assert.equal(ultimoRespaldo({ 2026: 'basura', 2027: '2027-03-01' }), '2027-03-01', 'ignora lo que no es fecha');
});

test('un año está completo solo si se bajó DESPUÉS de que terminó: el de octubre le falta lo de noviembre y diciembre', () => {
  const r = { 2026: '2026-10-12' };
  const anios = estadoDeLosAnios(r, '2027-10-15');
  assert.deepEqual(anios.map((a) => a.anio), [2027, 2026]);
  const de2026 = anios.find((a) => a.anio === 2026);
  assert.equal(de2026.bajadoEl, '2026-10-12');
  assert.equal(de2026.completo, false, 'lo que pasó del 13 de octubre al 31 de diciembre no está en ese archivo');
  const de2027 = anios.find((a) => a.anio === 2027);
  assert.equal(de2027.bajadoEl, null);
  assert.equal(de2027.esDelAnioEnCurso, true);
  assert.equal(de2027.completo, false, 'el año en curso nunca está completo');
});

test('si se bajó el año anterior ya terminado, queda completo y no se vuelve a ofrecer como pendiente', () => {
  const anios = estadoDeLosAnios({ 2026: '2027-01-05' }, '2027-02-01');
  assert.equal(anios.find((a) => a.anio === 2026).completo, true);
});

test('el primer año de la lista es el año de hoy, tomado de `hoy` y no del reloj', () => {
  assert.deepEqual(estadoDeLosAnios({}, '2026-12-31').map((a) => a.anio), [2026, 2025]);
  assert.deepEqual(estadoDeLosAnios({}, '2027-01-01').map((a) => a.anio), [2027, 2026]);
});

test('el rango de un año y el nombre del archivo', () => {
  assert.deepEqual(rangoDelAnio(2026), { desde: '2026-01-01', hasta: '2026-12-31' });
  assert.equal(nombreDelArchivo(2026), 'Best Price 2026.xlsx');
});

test('al año anterior solo se le da lugar cuando hay algo que hacer con él: incompleto, o el primer trimestre sin bajar', () => {
  const ofrecidos = (porAnio, hoy) => estadoDeLosAnios(porAnio, hoy).filter((a) => a.ofrecer).map((a) => a.anio);
  assert.deepEqual(ofrecidos({}, '2026-10-14'), [2026], 'en octubre de 2026 no hay un 2025 que ofrecer: el sistema ni existía');
  assert.deepEqual(ofrecidos({ 2026: '2026-10-14' }, '2027-02-10'), [2027, 2026], 'bajado antes de terminar el año: se ofrece de nuevo');
  assert.deepEqual(ofrecidos({}, '2027-02-10'), [2027, 2026], 'primer trimestre y nunca bajado: es cuando se cierra el año anterior');
  assert.deepEqual(ofrecidos({}, '2027-04-01'), [2027], 'pasado el primer trimestre ya no se ofrece sin que él lo pida');
  assert.deepEqual(ofrecidos({ 2026: '2027-01-05' }, '2027-02-10'), [2027], 'bajado ya terminado el año: completo, no se ofrece');
});
