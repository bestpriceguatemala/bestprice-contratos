// Pruebas de recibir el carro.
//
// El cálculo del cobro ya vive en contrato.js y está probado ahí. Lo que se
// prueba aquí es lo que puede salir mal al recibir: un kilometraje que retrocede,
// una fecha anterior a la salida, un descuento inventado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirCierre, problemasDelCierre } from '../js/nucleo/cierre.js';
import { resumen } from '../js/nucleo/contrato.js';

const contrato = () => ({
  id: 'c1', numero: 1, carroId: 'v1',
  dias: 4, precioDia: 700, kmSalida: 45000,
  fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24',
  cartaPoderPrecio: 350,
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
  estado: 'rentado',
});

const campos = {
  fechaReal: '2026-08-25', horaReal: '10:30', lugarEntrada: 'OFICINA',
  kmEntrada: 45600, combustible: 130, danos: 200, danosDetalle: 'Rayón en la puerta',
  varios: 0, descuento: 300,
};

test('el cierre no pierde nada de lo que ya traía el contrato', () => {
  const c = construirCierre(contrato(), campos);
  assert.equal(c.numero, 1);
  assert.equal(c.precioDia, 700);
  assert.equal(c.pagos.length, 1);
  assert.equal(c.cierre.fechaReal, '2026-08-25');
  assert.equal(c.cierre.kmEntrada, 45600);
});

test('el ejemplo del diseño cuadra al recibir', () => {
  const r = resumen(construirCierre(contrato(), campos));
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalDevolucion, 730, 'atraso más daños más combustible menos descuento');
  assert.equal(r.subtotal, 3880);
  assert.equal(r.saldo, 730, 'el saldo se ve sin recargo hasta saber cómo paga');
});

test('los kilómetros no pueden retroceder', () => {
  const p = problemasDelCierre(contrato(), { ...campos, kmEntrada: 44000 });
  assert.equal(p.length, 1);
  assert.match(p[0], /kilometraje/i);
  assert.match(p[0], /45,?000/, 'dice con cuánto salió');
});

test('no se puede recibir un carro antes de haberlo entregado', () => {
  const p = problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-19' });
  assert.equal(p.length, 1);
  assert.match(p[0], /antes/i);
});

// Minor de la revisión final: el mensaje mostraba las fechas crudas
// ('2026-08-19') en vez del formato que lee el dueño, y rotulaba la fecha
// que el mostrador acaba de teclear como "Devolución" — que en el resto del
// sistema significa la fecha PREVISTA, un campo distinto.
test('el mensaje de fecha anterior usa el formato legible y rotula "Entrada", no "Devolución"', () => {
  const p = problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-19' });
  assert.match(p[0], /20 ago 2026/, 'la fecha de salida, formateada');
  assert.match(p[0], /19 ago 2026/, 'la fecha tecleada, formateada');
  assert.match(p[0], /Entrada:/);
  assert.doesNotMatch(p[0], /Devolución:/, 'esa palabra ya significa otra cosa en el resto del sistema');
});

test('sin fecha real no se puede cerrar', () => {
  assert.match(problemasDelCierre(contrato(), { ...campos, fechaReal: '' }).join(' '), /fecha/i);
});

test('un descuento mayor que todo lo cobrado se avisa', () => {
  const p = problemasDelCierre(contrato(), { ...campos, descuento: 99999 });
  assert.match(p.join(' '), /descuento/i);
});

// Minor de la revisión final: un subtotal negativo se mostraba como
// "(Q-95,819.00)" — el signo pegado adentro de la Q en vez de adelante.
test('el subtotal negativo del aviso de descuento lleva el signo antes de la Q', () => {
  const p = problemasDelCierre(contrato(), { ...campos, descuento: 99999 });
  assert.match(p.join(' '), /-Q95,819\.00/);
  assert.doesNotMatch(p.join(' '), /Q-/, 'nunca el signo pegado adentro de la Q');
});

test('un cierre normal no tiene problemas', () => {
  assert.deepEqual(problemasDelCierre(contrato(), campos), []);
});

test('devolver antes de tiempo no da crédito ni problema', () => {
  const c = construirCierre(contrato(), { ...campos, fechaReal: '2026-08-22', descuento: 0 });
  const r = resumen(c);
  assert.equal(r.diasAtraso, 0);
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-22' }), []);
});

test('el detalle de los varios llega al cierre y de verdad se cobra (CRÍTICO: mueve el saldo)', () => {
  const c = construirCierre(contrato(), { ...campos, varios: 150, variosDetalle: 'Silla de bebé no devuelta' });
  assert.equal(c.cierre.varios, 150);
  assert.equal(c.cierre.variosDetalle, 'Silla de bebé no devuelta');

  // No basta con que el campo se guarde: dos rondas de revisión dejaron
  // pasar que lineasDevolucion nunca emitía la línea, así que el saldo se
  // quedaba igual aunque "Varios" trajera un monto. Comparar el saldo con y
  // sin varios es la prueba que faltaba.
  const sinVarios = resumen(construirCierre(contrato(), { ...campos, varios: 0 })).saldo;
  const conVarios = resumen(c).saldo;
  assert.equal(conVarios, sinVarios + 150, 'los Q150 de Varios tienen que subir el saldo por cobrar');
});

test('corregir un cierre ya guardado se queda con lo nuevo', () => {
  // Él va a corregir un cierre que ya guardó: un monto mal tecleado, un
  // detalle mejor escrito. Lo nuevo manda; lo que no se toca se queda.
  const yaCerrado = construirCierre(contrato(), { ...campos, varios: 150, variosDetalle: 'VIEJO' });
  const corregido = construirCierre(yaCerrado, { ...campos, varios: 150, variosDetalle: 'NUEVO' });
  assert.equal(corregido.cierre.variosDetalle, 'NUEVO');
  assert.equal(corregido.cierre.danosDetalle, campos.danosDetalle, 'lo que no se corrigió sigue ahí');
  assert.equal(corregido.cierre.kmEntrada, 45600);
});

test('sin kmSalida registrado, no se valida que el kilometraje retroceda', () => {
  // Si no se registró kmSalida, no hay base para comparar — la validación
  // no es un pase falso sino un skip: ningún problema devuelto.
  const sinKmSalida = { ...contrato(), kmSalida: 0 };
  const p = problemasDelCierre(sinKmSalida, { ...campos, kmEntrada: 44000 });
  assert.equal(p.filter((m) => /kilometraje/i.test(m)).length, 0, 'no hay problema de km sin kmSalida');
});

// ---------- La hora tardía es un campo del cierre ----------
//
// El dueño la cobra «solo al devolver»: se decide con lo demás que se decide
// cuando el carro regresa, así que vive en `cierre.horaTardia` y la arma
// construirCierre, igual que `varios`.

test('la hora tardía llega al cierre como un número, y de verdad se cobra: mueve el saldo', () => {
  const c = construirCierre(contrato(), { ...campos, horaTardia: 150 });
  assert.equal(c.cierre.horaTardia, 150);
  assert.equal(typeof c.cierre.horaTardia, 'number');

  // Igual que con los varios: no basta con que el campo se guarde.
  const sin = resumen(construirCierre(contrato(), { ...campos, horaTardia: 0 }));
  const con = resumen(c);
  assert.equal(con.saldo, sin.saldo + 150, 'los Q150 de hora tardía tienen que subir el saldo por cobrar');
  assert.equal(con.totalDevolucion, 880);
  assert.equal(con.totalSalida, sin.totalSalida, 'y solo el de la devolución: la salida no se mueve');
});

test('la hora tardía pasa por q(): lo tecleado con centavos de más se guarda a dos decimales', () => {
  assert.equal(construirCierre(contrato(), { ...campos, horaTardia: 150.005 }).cierre.horaTardia, 150.01);
});

test('sin hora tardía el cierre guarda 0, no un campo ausente ni false', () => {
  assert.equal(construirCierre(contrato(), campos).cierre.horaTardia, 0);
  assert.equal(construirCierre(contrato(), { ...campos, horaTardia: '' }).cierre.horaTardia, 0);
  assert.equal(resumen(construirCierre(contrato(), campos)).subtotal, 3880, 'el ejemplo del diseño, intacto');
});

test('un booleano en el cierre no se vuelve un monto: true no es Q1', () => {
  // La trampa de q(true) === 1: nadie escribe un booleano aquí hoy, pero el
  // mismo campo tuvo esa forma en el contrato y este es el camino por donde
  // volvería a colarse un centavo inventado.
  assert.equal(construirCierre(contrato(), { ...campos, horaTardia: true }).cierre.horaTardia, 0);
  assert.equal(construirCierre(contrato(), { ...campos, horaTardia: false }).cierre.horaTardia, 0);
  assert.equal(resumen(construirCierre(contrato(), { ...campos, horaTardia: true })).subtotal, 3880);
});

test('corregir un cierre ya guardado conserva la hora tardía si no se toca, y la cambia si se corrige', () => {
  const yaCerrado = construirCierre(contrato(), { ...campos, horaTardia: 150 });
  // Un cierre armado sin ese campo (otra pantalla, un campo que no se mandó)
  // no se lo lleva por delante.
  const { horaTardia: _quitado, ...sinElCampo } = { ...campos, horaTardia: 0 };
  assert.equal(construirCierre(yaCerrado, sinElCampo).cierre.horaTardia, 150, 'lo que no se corrigió sigue ahí');
  assert.equal(construirCierre(yaCerrado, { ...campos, horaTardia: 100 }).cierre.horaTardia, 100, 'lo nuevo manda');
  assert.equal(construirCierre(yaCerrado, { ...campos, horaTardia: 0 }).cierre.horaTardia, 0, 'y se puede quitar');
});

test('el aviso del descuento cuenta la hora tardía: el cobro en negativo se calcula con ella dentro', () => {
  // Sin hora tardía: 3,150 de la salida + 1,030 de la devolución − 4,300 = −120.
  const sin = problemasDelCierre(contrato(), { ...campos, descuento: 4300 });
  assert.match(sin.join(' '), /-Q120\.00/);
  // Con Q150 de hora tardía el cobro queda en +30: ya no hay nada que avisar.
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, descuento: 4300, horaTardia: 150 }), []);
});

// Prueba del sistema (7 oct 2026): un año con cinco dígitos («20261-10-21») en la fecha de
// entrada se habría cobrado como millones de días de atraso, o con una fecha que ningún
// calendario entiende. Se avisa, y el botón de guardar queda apagado como con cualquier otro
// problema del cierre.
test('una fecha de entrada que no existe (año de cinco dígitos, día imposible) no se puede guardar', () => {
  for (const fechaReal of ['20261-10-21', '2026-02-30', '2026-13-01']) {
    const p = problemasDelCierre(contrato(), { ...campos, fechaReal });
    assert.equal(p.length, 1, fechaReal);
    assert.match(p[0], /fecha/i);
    assert.match(p[0], /no es válida/i);
  }
});

test('una fecha de entrada buena sigue sin problemas, y la vacía sigue diciendo que falta', () => {
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-25' }), []);
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '' }), ['Falta la fecha en que se recibió el carro.']);
});

// Prueba del sistema (7 oct 2026): al abrir «Recibir carro» de un carro que salió con 80,000 km,
// ANTES de escribir nada, el cierre ya decía en rojo «El kilometraje de entrada (0.00) es menor
// que el de salida (80,000.00)»: kilómetros con centavos (en el encabezado de la misma pantalla
// salen como «80,000»), y un «0.00» que el mostrador nunca escribió.
test('el aviso del kilometraje habla en kilómetros enteros, sin centavos', () => {
  const [mensaje] = problemasDelCierre(contrato(), { ...campos, kmEntrada: 44000 });
  assert.equal(mensaje, 'El kilometraje de entrada (44,000) es menor que el de salida (45,000).');
  assert.ok(!/\.00/.test(mensaje));
});

test('con el kilometraje de entrada sin escribir, el aviso dice que FALTA, no que retrocede a «0.00»', () => {
  for (const kmEntrada of [0, '', undefined]) {
    const problemas = problemasDelCierre(contrato(), { ...campos, kmEntrada });
    assert.deepEqual(problemas, ['Falta el kilometraje de entrada: el carro salió con 45,000.'], String(kmEntrada));
  }
});

test('un kilometraje igual al de salida (el carro no se movió) no es problema', () => {
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, kmEntrada: 45000 }), []);
});

// Prueba del sistema (7 oct 2026): «2062» por «2026» en la fecha de entrada daba 13,149 días de
// atraso y un «Falta cobrar Q8,546,850.00» ya escrito en el monto, que «Recibir y cobrar» registraba
// como pagado. Un carro no se recibe mañana: la fecha de entrada no puede ser posterior a hoy.
test('una fecha de entrada posterior a hoy no se puede guardar, y dice cuál es', () => {
  for (const fechaReal of ['2026-08-26', '2026-09-30', '2062-08-25']) {
    const p = problemasDelCierre(contrato(), { ...campos, fechaReal }, '2026-08-25');
    assert.equal(p.length, 1, fechaReal);
    assert.match(p[0], /todavía no llega/);
    assert.match(p[0], /Revisa la fecha/);
  }
  assert.match(problemasDelCierre(contrato(), { ...campos, fechaReal: '2062-08-25' }, '2026-08-25')[0], /25 ago 2062/);
});

test('recibir hoy, o en un día pasado (se olvidó anotarlo), no es ningún problema', () => {
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-25' }, '2026-08-25'), []);
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-24' }, '2026-08-25'), []);
});

test('sin decir qué día es hoy no se revisa el futuro: el cálculo del cierre no depende del reloj', () => {
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2062-08-25' }), []);
});
