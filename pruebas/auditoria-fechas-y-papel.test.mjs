// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en las fechas y en el papel del
// contrato: el calendario de enero, las fechas que no existen, los días que se salen de la hoja. Cada una nació de un mutante
// que SOBREVIVIÓ: se le metió a propósito un error al código y las 2,589 pruebas de entonces seguían en verde. Aquí cada una
// falla con ese error puesto y pasa con el código bueno. Qué le habría costado al dueño cada uno:
// .superpowers/auditoria-pruebas-2026-10-26.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { diasDelMes, cuadriculaDelMes } from '../js/nucleo/calendario.js';
import {
  diasEntre, diasAtraso, sumarMeses, esFechaISO,
} from '../js/nucleo/fechas.js';
import {
  fechaParaPapel, campoPorId, textoSeSale, camposFueraDelPapel, CALIBRACION_DE_FABRICA, LIMITES,
} from '../js/nucleo/hojaContrato.js';

// ---------------------------------------------------------------------------
// El calendario de cualquier mes (enero también)
// ---------------------------------------------------------------------------

test('el calendario tiene los días de cada uno de los doce meses, enero y diciembre incluidos', () => {
  // `numeroMes < 1` -> `<= 1`: enero salía vacío. Ninguna prueba abría un calendario de enero.
  const dias2026 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  dias2026.forEach((cuantos, i) => {
    const mes = `2026-${String(i + 1).padStart(2, '0')}`;
    const dias = diasDelMes(mes);
    assert.equal(dias.length, cuantos, mes);
    assert.equal(dias[0], `${mes}-01`);
    assert.equal(dias.at(-1), `${mes}-${cuantos}`);
  });
  assert.equal(diasDelMes('2028-02').length, 29, '2028 es bisiesto');
  assert.equal(diasDelMes('2100-02').length, 28, '2100 no (siglo no divisible entre 400)');
  assert.equal(diasDelMes('2000-02').length, 29, '2000 sí');
  for (const malo of ['2026-00', '2026-13', '2026-', '2026', '', undefined, null, '-05', 'abc-def']) {
    assert.deepEqual(diasDelMes(malo), [], String(malo));
  }
});

test('la cuadrícula de enero de 2027 arranca en viernes y cierra en domingo 31', () => {
  const semanas = cuadriculaDelMes('2027-01');
  assert.equal(semanas.length, 5);
  assert.deepEqual(semanas[0], [null, null, null, null, '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.deepEqual(semanas.at(-1), ['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29', '2027-01-30', '2027-01-31']);
  assert.deepEqual(cuadriculaDelMes('2027-13'), []);
});

// ---------------------------------------------------------------------------
// fechas.js — con una fecha que falta no hay atraso ni NaN
// ---------------------------------------------------------------------------

test('diasEntre y diasAtraso: si falta una de las dos fechas, o no es fecha, el resultado es 0 (nunca NaN)', () => {
  // `Number.isNaN(a) || Number.isNaN(b)` -> `&&`: con una sola fecha ilegible devolvía NaN, y NaN se cuela en los cobros.
  for (const mala of [undefined, null, '', 'ayer', 20261001]) {
    assert.equal(diasEntre('2026-10-01', mala), 0, `diasEntre(buena, ${String(mala)})`);
    assert.equal(diasEntre(mala, '2026-10-01'), 0, `diasEntre(${String(mala)}, buena)`);
    assert.equal(diasAtraso('2026-10-01', mala), 0);
    assert.equal(diasAtraso(mala, '2026-10-01'), 0);
  }
  assert.equal(diasEntre('2026-10-01', '2026-10-04'), 3);
  assert.equal(diasEntre('2026-10-04', '2026-10-01'), -3);
  assert.equal(diasAtraso('2026-10-05', '2026-10-04'), 0, 'devolver antes de tiempo no descuenta');
  assert.equal(diasAtraso('2026-10-04', '2026-10-06'), 2);
});

test('sumarMeses: un «true», un vacío o un null no son una cantidad de meses', () => {
  // `typeof meses === 'boolean' || meses === null || …` -> `&&`: «true» se leía como 1 mes.
  for (const raro of [true, false, null, '', 1.5, 'x', undefined]) {
    assert.equal(sumarMeses('2026-01-31', raro), '', String(raro));
  }
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28', 'sin el 31 de febrero: el último día del mes');
  assert.equal(sumarMeses('2026-10-26', '3'), '2027-01-26');
  assert.equal(esFechaISO('2026-02-29'), false);
  assert.equal(esFechaISO('2028-02-29'), true);
});

// ---------------------------------------------------------------------------
// hojaContrato.js — las fechas que salen escritas en el papel
// ---------------------------------------------------------------------------

test('el papel imprime el último día de cada mes, y NO imprime el día siguiente (ni años bisiestos que no lo son)', () => {
  // La tabla de días por mes de `partesDeFecha`: con un 31 donde va un 30 se imprimía un «31-04-26» que no existe.
  const dias2026 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  dias2026.forEach((ultimo, i) => {
    const mm = String(i + 1).padStart(2, '0');
    assert.equal(fechaParaPapel(`2026-${mm}-${ultimo}`, 'corta'), `${ultimo}-${mm}-26`, `último día de ${mm}`);
    assert.equal(fechaParaPapel(`2026-${mm}-${String(ultimo + 1).padStart(2, '0')}`, 'corta'), '', `${ultimo + 1} de ${mm} no existe`);
    assert.equal(fechaParaPapel(`2026-${mm}-01`, 'corta'), `01-${mm}-26`);
  });
  assert.equal(fechaParaPapel('2028-02-29', 'corta'), '29-02-28');
  assert.equal(fechaParaPapel('2028-02-30', 'corta'), '', 'ni en año bisiesto existe el 30 de febrero');
  assert.equal(fechaParaPapel('2026-02-29', 'corta'), '');
  assert.equal(fechaParaPapel('2100-02-29', 'corta'), '', '2100 no es bisiesto');
  assert.equal(fechaParaPapel('2000-02-29', 'corta'), '29-02-00', '2000 sí');
  for (const mala of ['2026-00-10', '2026-13-01', '2026-01-00', '2026-1-5', '26-01-05', '', undefined, null, 'ayer']) {
    assert.equal(fechaParaPapel(mala, 'corta'), '', String(mala));
  }
  assert.equal(fechaParaPapel('2026-08-20', 'larga'), `20${' '.repeat(9)}08${' '.repeat(9)}2026`);
  assert.equal(fechaParaPapel('2026-08-20', 'doc'), `20${' '.repeat(2)}08${' '.repeat(4)}26`);
  assert.throws(() => fechaParaPapel('2026-08-20', 'rara'), /Formato de fecha desconocido/);
});

// ---------------------------------------------------------------------------
// hojaContrato.js — «esto se sale de su casilla» y «esto se sale del papel»
// ---------------------------------------------------------------------------

test('un texto largo que cabe BAJANDO de renglón no se avisa como «se sale»; uno que no cabe ni así, sí', () => {
  // `ajusta: true` -> `false` en estos campos: el texto dejaba de bajar de renglón y se avisaba de más (o, al revés, el papel
  // imprimía un nombre largo fuera de su casilla sin que el aviso lo dijera). Cada par es: un largo que cabe en dos o más
  // renglones, y uno que no cabe ni así.
  const casos = [
    ['facturarNombre', 70, 180], ['direccion', 100, 190], ['documentoExtendidoEn', 22, 40], ['conductorNombre', 60, 150],
    ['conductorLicencia', 30, 56], ['cartaPoderDestino', 35, 75], ['tarjeta1Autorizacion', 22, 45],
  ];
  for (const [id, cabe, nocabe] of casos) {
    assert.equal(textoSeSale(campoPorId(id), 'x'.repeat(cabe)), false, `${id}: ${cabe} letras caben bajando de renglón`);
    assert.equal(textoSeSale(campoPorId(id), 'x'.repeat(nocabe)), true, `${id}: ${nocabe} letras no caben`);
    assert.equal(textoSeSale(campoPorId(id), '   '), false, `${id}: en blanco no se sale`);
  }
  // Justo pasada la capacidad de la caja el aviso salta (un renglón a medias también ocupa su renglón).
  assert.equal(textoSeSale(campoPorId('direccion'), 'x'.repeat(130)), false);
  assert.equal(textoSeSale(campoPorId('direccion'), 'x'.repeat(138)), true);
  assert.equal(textoSeSale(campoPorId('facturarNombre'), 'x'.repeat(125)), false);
  assert.equal(textoSeSale(campoPorId('facturarNombre'), 'x'.repeat(134)), true);
  assert.equal(textoSeSale(campoPorId('conductorNombre'), 'x'.repeat(114)), true);
});

test('la hoja de fábrica cabe en la carta; corrida a la izquierda, a la derecha o hacia arriba se salen casillas', () => {
  // Tres de las cuatro orillas de `camposFueraDelPapel`. Con un signo o un `<` cambiados, una orilla dejaba de vigilarse y un
  // contrato podía salir sin sus primeras o últimas columnas sin que nadie avisara. (La de abajo no se puede probar sola: la
  // hoja es más ancha que alta, así que con cualquier calibración que quepa a lo ancho, cabe a lo alto.)
  assert.deepEqual(camposFueraDelPapel(CALIBRACION_DE_FABRICA), []);
  const hacia = (cambios) => camposFueraDelPapel({ ...CALIBRACION_DE_FABRICA, ...cambios });
  assert.notDeepEqual(hacia({ dx: LIMITES.dx[1] }), [], 'corrida 40 mm a la derecha');
  assert.notDeepEqual(hacia({ dx: LIMITES.dx[0] }), [], 'corrida 40 mm a la izquierda');
  assert.notDeepEqual(hacia({ dy: LIMITES.dy[0] }), [], 'corrida 40 mm hacia arriba');
  assert.notDeepEqual(hacia({ escala: LIMITES.escala[1] }), [], 'a escala 1.2 no cabe a lo ancho');
  // Un corrimiento chico NO saca nada: la hoja de fábrica cabe con holgura.
  assert.deepEqual(hacia({ dx: 1 }), []);
  assert.deepEqual(hacia({ dy: 1 }), []);
  assert.deepEqual(hacia({ dy: -1 }), []);
});
