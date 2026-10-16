// Pruebas del mantenimiento de la flota propia (§12b): nucleo/mantenimiento.js.
//
// Los carros y los contratos de aquí salen de los constructores de verdad (pruebas/fixtures/): ni un contrato ni un
// carro escritos a mano con las llaves que la prueba necesita (§7b, la regla 2 de «La cuarta vez»). Lo único escrito a
// mano son los registros MALFORMADOS que se prueban a propósito (un servicio sin fecha, un intervalo a medias): eso es
// justo lo que un constructor no produce y una nube sí puede traer.
//
// `hoy` es siempre 2026-10-16 y se pasa; nada de aquí lee el reloj.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICIOS, ANTELACION, servicioDeTipo, kmLeido, kilometrajeDelCarro, textoDelKilometraje, intervaloDe, revisarIntervalo,
  conIntervalo, servicioCuenta, razonDeQueNoCuente, ultimoServicioDe, construirServicio, conServicioAgregado,
  conServicioAnulado, carroConServicio, carroConServicioAnulado, carroConIntervalo, estadoDeServicio, estadoDeMantenimiento,
  avisosDeMantenimiento, historialDeServicios,
} from '../js/nucleo/mantenimiento.js';
import { contratoConKilometraje } from './fixtures/contratoConKilometraje.mjs';
import { carroPropio, carroConServicios } from './fixtures/carroConServicios.mjs';

const HOY = '2026-10-16';

// ---------------------------------------------------------------------------------------------------------------
// Los seis servicios (§12b)
// ---------------------------------------------------------------------------------------------------------------

test('son los seis servicios de la especificación, en su orden, cada uno con sus dos intervalos y su razón', () => {
  assert.deepEqual(SERVICIOS.map((s) => s.nombre), [
    'Aceite y filtro', 'Pastillas de freno', 'Llantas', 'Batería', 'Alineación y balanceo', 'Servicio general',
  ]);
  assert.deepEqual(SERVICIOS.map((s) => s.tipo), ['aceite', 'frenos', 'llantas', 'bateria', 'alineacion', 'general']);
  for (const s of SERVICIOS) {
    assert.ok(Number.isInteger(s.km) && s.km > 0, `${s.tipo}: km`);
    assert.ok(Number.isInteger(s.meses) && s.meses > 0, `${s.tipo}: meses`);
    assert.ok(s.porque.length > 40, `${s.tipo}: cada número lleva escrito su porqué`);
  }
  assert.deepEqual(SERVICIOS.map((s) => [s.tipo, s.km, s.meses]), [
    ['aceite', 5000, 3], ['frenos', 30000, 12], ['llantas', 40000, 48], ['bateria', 60000, 36], ['alineacion', 10000, 6], ['general', 20000, 12],
  ], 'los intervalos por omisión son PROPUESTOS: si cambian, el informe y el diseño (§12b) tienen que cambiar con ellos');
  assert.deepEqual({ ...ANTELACION }, { km: 500, dias: 15 });
  assert.equal(servicioDeTipo('aceite').nombre, 'Aceite y filtro');
  assert.equal(servicioDeTipo('cambio-de-vidrio'), null);
});

// ---------------------------------------------------------------------------------------------------------------
// En cuántos kilómetros anda el carro
// ---------------------------------------------------------------------------------------------------------------

test('kmLeido: un cero, un vacío, un texto, un booleano o un negativo son «no se anotó», nunca un odómetro en cero', () => {
  for (const nada of [0, '0', '', '   ', null, undefined, NaN, Infinity, -5, '-5', 'abc', '12abc', true, false, {}, []]) {
    assert.equal(kmLeido(nada), null, `${JSON.stringify(nada)} no es un kilometraje`);
  }
  assert.equal(kmLeido(45000), 45000);
  assert.equal(kmLeido('45000'), 45000, 'un número guardado como texto se lee');
  assert.equal(kmLeido(45000.4), 45000, 'los kilómetros son enteros');
  assert.equal(kmLeido(45000.5), 45001);
  assert.equal(kmLeido(1), 1);
});

test('un carro SIN contratos no tiene kilometraje: es «no se sabe» (null), no cero', () => {
  const r = kilometrajeDelCarro('v1', []);
  assert.equal(r, null, 'ni 0 ni {km: 0}');
  assert.equal(kilometrajeDelCarro('v1', undefined), null);
  assert.equal(kilometrajeDelCarro('v1', null), null);
  assert.equal(kilometrajeDelCarro('', [contratoConKilometraje({
    id: 'c1', numero: 1, carroId: '', fechaSalida: '2026-09-01', kmSalida: 1000,
  })]), null, 'sin carro no hay de quién preguntar');
});

test('contratos que nunca anotaron kilometraje (el campo vacío se guarda como 0) tampoco dan kilometraje', () => {
  // «Recibir carro» con el kilometraje en blanco guarda kmEntrada 0, y «Sacar carro» kmSalida 0: no se anotó.
  const sinKm = contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-09-01', recibidoEl: '2026-09-05',
  });
  assert.equal(sinKm.cierre.kmEntrada, 0, 'así lo deja el constructor real');
  assert.equal(sinKm.kmSalida, 0);
  assert.equal(kilometrajeDelCarro('v1', [sinKm]), null);
});

test('el kilometraje es el MAYOR de los contratos del carro, sin importar en qué orden lleguen', () => {
  const primero = contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-08-01', kmSalida: 10000, recibidoEl: '2026-08-05', kmEntrada: 10900,
  });
  const segundo = contratoConKilometraje({
    id: 'c2', numero: 2, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  });
  for (const lista of [[primero, segundo], [segundo, primero]]) {
    const r = kilometrajeDelCarro('v1', lista);
    assert.equal(r.km, 14800);
    assert.equal(r.desde, 'entrada');
    assert.equal(r.numero, 2, 'dice de qué contrato salió el número: así se encuentra un kilometraje mal tecleado');
    assert.equal(r.contratoId, 'c2');
    assert.equal(r.fecha, '2026-09-05');
  }
});

test('si el carro está afuera, el kmSalida de su contrato abierto puede ser mayor que cualquier entrada', () => {
  const cerrado = contratoConKilometraje({
    id: 'c2', numero: 2, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  });
  const afuera = contratoConKilometraje({
    id: 'c3', numero: 3, fechaSalida: '2026-10-10', kmSalida: 14950,
  });
  const r = kilometrajeDelCarro('v1', [cerrado, afuera]);
  assert.equal(r.km, 14950);
  assert.equal(r.desde, 'salida');
  assert.equal(r.fecha, '2026-10-10');
  assert.equal(r.numero, 3);
});

test('a igual kilometraje gana el contrato más reciente', () => {
  const viejo = contratoConKilometraje({
    id: 'c2', numero: 2, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  });
  const nuevo = contratoConKilometraje({
    id: 'c3', numero: 3, fechaSalida: '2026-10-10', kmSalida: 14800,
  });
  assert.equal(kilometrajeDelCarro('v1', [nuevo, viejo]).numero, 3);
  assert.equal(kilometrajeDelCarro('v1', [viejo, nuevo]).numero, 3);
});

test('un contrato viejo, guardado con kilometrajeSalida, también cuenta (el puente de lectura)', () => {
  const viejo = contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 22000, nombreViejo: true,
  });
  assert.equal(viejo.kmSalida, undefined, 'el contrato de la prueba NO trae kmSalida');
  assert.equal(viejo.kilometrajeSalida, 22000);
  assert.equal(kilometrajeDelCarro('v1', [viejo]).km, 22000);
});

test('solo cuentan los contratos de ESTE carro, y nunca los de un carro ajeno', () => {
  const deOtro = contratoConKilometraje({
    id: 'c1', numero: 1, carroId: 'v2', fechaSalida: '2026-09-01', kmSalida: 90000,
  });
  assert.equal(kilometrajeDelCarro('v1', [deOtro]), null);

  const ajeno = contratoConKilometraje({
    id: 'c2', numero: 2, fechaSalida: '2026-09-01', kmSalida: 70000, ajeno: true,
  });
  assert.equal(ajeno.ajeno, true);
  // `ajeno` es el único criterio (§7b): aunque algo hubiera dejado un carroId en un contrato ajeno, no es de la flota.
  assert.equal(kilometrajeDelCarro('v1', [{ ...ajeno, carroId: 'v1' }]), null);
});

test('un cierre sin fecha real no es un regreso: su kmEntrada no cuenta, el kmSalida del contrato sí', () => {
  const recibido = contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  });
  const sinFecha = { ...recibido, cierre: { ...recibido.cierre, fechaReal: '' } };
  assert.equal(kilometrajeDelCarro('v1', [sinFecha]).km, 14000);
});

test('textoDelKilometraje: dice en cuánto anda y de dónde sale; sin saberlo, dice que no se sabe; con una lectura caída, que no se pudo leer', () => {
  const recibido = contratoConKilometraje({
    id: 'c2', numero: 57, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  });
  const afuera = contratoConKilometraje({
    id: 'c3', numero: 58, fechaSalida: '2026-10-10', kmSalida: 14950,
  });
  assert.equal(
    textoDelKilometraje(kilometrajeDelCarro('v1', [recibido])),
    'Anda en 14,800 km, según el kilometraje de entrada del contrato 57, recibido el 5 sep 2026.',
    'kilómetros enteros: «14,800», nunca «14,800.00»',
  );
  assert.equal(
    textoDelKilometraje(kilometrajeDelCarro('v1', [recibido, afuera])),
    'Anda en 14,950 km, según el kilometraje de salida del contrato 58, que salió el 10 oct 2026.',
  );
  assert.equal(
    textoDelKilometraje({ km: 9000, desde: 'salida', fecha: '', numero: null }),
    'Anda en 9,000 km, según el kilometraje de salida de un contrato.',
    'un contrato sin número ni fecha no inventa ninguno',
  );
  assert.match(textoDelKilometraje(null), /^No se sabe en cuántos kilómetros anda este carro: ninguno de sus contratos trae kilometraje anotado\./);
  assert.match(textoDelKilometraje(null, { falloContratos: true }), /^No se pudieron leer los contratos, así que no se sabe/);
  assert.ok(!/No se sabe en cuántos/.test(textoDelKilometraje(null, { falloContratos: true })), 'no leer no es lo mismo que no saber');
  assert.match(textoDelKilometraje(kilometrajeDelCarro('v1', [recibido]), { falloContratos: true }), /Puede estar atrasado: no se pudieron leer los contratos\./);
  assert.match(textoDelKilometraje({ km: 0 }), /^No se sabe/, 'un {km: 0} es «no se sabe», no un odómetro en cero');
});

// ---------------------------------------------------------------------------------------------------------------
// Los intervalos de cada carro
// ---------------------------------------------------------------------------------------------------------------

test('intervaloDe: los de siempre, salvo los que el dueño cambió en ese carro', () => {
  const carro = carroPropio();
  assert.deepEqual(intervaloDe(carro, 'aceite'), { km: 5000, meses: 3, propio: false });
  const cambiado = carroConIntervalo(carro, 'aceite', { km: 7500, meses: 4 });
  assert.deepEqual(intervaloDe(cambiado, 'aceite'), { km: 7500, meses: 4, propio: true });
  assert.deepEqual(intervaloDe(cambiado, 'frenos'), { km: 30000, meses: 12, propio: false }, 'los demás servicios no se mueven');
  assert.equal(intervaloDe(carro, 'inventado'), null);
});

test('intervaloDe: un intervalo guardado a medias, en cero o ilegible NO rige: se usa el de siempre, nunca un hueco', () => {
  const carro = carroPropio();
  for (const malo of [
    { km: 7500 }, { meses: 4 }, { km: 0, meses: 4 }, { km: 7500, meses: 0 }, { km: '7500', meses: 4 },
    { km: 7500.5, meses: 4 }, { km: -1, meses: 4 }, { km: null, meses: null }, 'tres meses', 5, [],
  ]) {
    assert.deepEqual(intervaloDe({ ...carro, intervalos: { aceite: malo } }, 'aceite'), { km: 5000, meses: 3, propio: false }, JSON.stringify(malo));
  }
});

test('revisarIntervalo: los dos números son obligatorios y enteros mayores que cero', () => {
  assert.deepEqual(revisarIntervalo({ km: '7500', meses: '4' }), { intervalo: { km: 7500, meses: 4 }, problemas: [] });
  assert.deepEqual(revisarIntervalo({ km: 7500, meses: 4 }).intervalo, { km: 7500, meses: 4 });
  for (const [km, meses] of [['', '4'], ['7500', ''], ['0', '4'], ['7500', '0'], ['7.5', '4'], ['7500', '3.5'], ['-5', '4'], ['abc', '4'], ['7,500', '4']]) {
    const r = revisarIntervalo({ km, meses });
    assert.equal(r.intervalo, null, `${km} / ${meses}`);
    assert.ok(r.problemas.length >= 1);
  }
  assert.deepEqual(revisarIntervalo({ km: '', meses: '' }).problemas, [
    'Los kilómetros van en un número entero mayor que cero.',
    'Los meses van en un número entero mayor que cero.',
  ]);
  assert.equal(revisarIntervalo().intervalo, null);
});

test('conIntervalo: guarda lo cambiado; lo que queda igual al de siempre, o null, no guarda nada (así un valor por omisión nuevo llega a todos)', () => {
  assert.deepEqual(conIntervalo({}, 'aceite', { km: 7500, meses: 4 }), { aceite: { km: 7500, meses: 4 } });
  assert.deepEqual(conIntervalo(undefined, 'aceite', { km: 7500, meses: 4 }), { aceite: { km: 7500, meses: 4 } });
  const dos = conIntervalo({ aceite: { km: 7500, meses: 4 } }, 'frenos', { km: 25000, meses: 12 });
  assert.deepEqual(dos, { aceite: { km: 7500, meses: 4 }, frenos: { km: 25000, meses: 12 } });
  assert.deepEqual(conIntervalo(dos, 'aceite', null), { frenos: { km: 25000, meses: 12 } }, 'null = volver a los de siempre');
  assert.deepEqual(conIntervalo(dos, 'frenos', { km: 30000, meses: 12 }), { aceite: { km: 7500, meses: 4 } }, 'escribir justo los de siempre = no tener los suyos');
  const original = { aceite: { km: 7500, meses: 4 } };
  conIntervalo(original, 'aceite', null);
  assert.deepEqual(original, { aceite: { km: 7500, meses: 4 } }, 'no toca lo recibido');
  assert.throws(() => conIntervalo({}, 'inventado', { km: 1, meses: 1 }), /Servicio desconocido/);
});

// ---------------------------------------------------------------------------------------------------------------
// Registrar un servicio
// ---------------------------------------------------------------------------------------------------------------

test('construirServicio: tipo, fecha y kilometraje entero; el kilometraje vacío es «no se sabe» (null), nunca 0', () => {
  assert.deepEqual(construirServicio({ tipo: 'aceite', fecha: '2026-10-10', km: '15000' }, HOY), {
    servicio: { tipo: 'aceite', fecha: '2026-10-10', km: 15000 }, problemas: [],
  });
  assert.deepEqual(construirServicio({ tipo: 'frenos', fecha: HOY, km: 30000 }, HOY).servicio, { tipo: 'frenos', fecha: HOY, km: 30000 }, 'hoy vale');
  for (const vacio of ['', '  ', undefined, null]) {
    assert.deepEqual(construirServicio({ tipo: 'bateria', fecha: '2026-10-10', km: vacio }, HOY).servicio, { tipo: 'bateria', fecha: '2026-10-10', km: null }, JSON.stringify(vacio));
  }
});

test('construirServicio: cada cosa que no se puede guardar se dice con sus palabras, y no devuelve servicio', () => {
  const dice = (campos) => construirServicio(campos, HOY);
  assert.deepEqual(dice({ tipo: '', fecha: '2026-10-10', km: '1' }).problemas, ['Escoge qué servicio se hizo.']);
  assert.deepEqual(dice({ tipo: 'inventado', fecha: '2026-10-10', km: '1' }).problemas, ['Escoge qué servicio se hizo.']);
  assert.deepEqual(dice({ tipo: 'aceite', fecha: '', km: '1' }).problemas, ['Escribe la fecha en que se hizo el servicio.']);
  assert.deepEqual(dice({ tipo: 'aceite', fecha: '20261-10-10', km: '1' }).problemas, ['La fecha del servicio no es válida. Revisa el año.']);
  assert.deepEqual(dice({ tipo: 'aceite', fecha: '2026-02-30', km: '1' }).problemas, ['La fecha del servicio no es válida. Revisa el año.']);
  assert.deepEqual(dice({ tipo: 'aceite', fecha: '2026-10-17', km: '1' }).problemas, ['La fecha del servicio (17 oct 2026) todavía no llega. Revisa la fecha.'], 'un servicio de mañana no se ha hecho');
  for (const km of ['0', '-100', '15000.5', 'abc', '15,000']) {
    assert.deepEqual(dice({ tipo: 'aceite', fecha: '2026-10-10', km }).problemas, ['El kilometraje va en un número entero mayor que cero (o déjalo vacío si no se sabe).'], km);
  }
  for (const campos of [{ tipo: '', fecha: '', km: '0' }, { tipo: 'aceite', fecha: '2026-10-17', km: 'abc' }]) {
    const r = dice(campos);
    assert.equal(r.servicio, null);
    assert.ok(r.problemas.length >= 2, 'si hay varios problemas se dicen todos');
  }
});

test('conServicioAgregado: agrega con su id; el MISMO id no se agrega dos veces (un reintento no duplica); no toca lo recibido', () => {
  const lista = [];
  const uno = conServicioAgregado(lista, { id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  assert.deepEqual(uno, [{ id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 }]);
  assert.deepEqual(lista, [], 'la lista recibida no se modifica');
  assert.deepEqual(conServicioAgregado(uno, { id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 }), uno, 'reintento del mismo guardado');
  assert.equal(conServicioAgregado(uno, { id: 's2', tipo: 'frenos', fecha: '2026-10-11', km: null }).length, 2);
  assert.deepEqual(conServicioAgregado(undefined, { id: 's9', tipo: 'general', fecha: HOY }), [{ id: 's9', tipo: 'general', fecha: HOY, km: null }]);
  assert.throws(() => conServicioAgregado([], { tipo: 'aceite', fecha: '2026-10-10', km: 1 }), /trae su id/, 'sin id un reintento duplicaría');
});

test('conServicioAnulado: se anula y no se borra; no vuelve a cambiar la fecha; uno que no está avisa', () => {
  const lista = [
    { id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 150000 },
    { id: 's2', tipo: 'frenos', fecha: '2026-10-11', km: 30000 },
  ];
  const anulada = conServicioAnulado(lista, 's1', '2026-10-16');
  assert.equal(anulada.length, 2, 'sigue en la lista: el historial no pierde nada');
  assert.deepEqual(anulada[0], {
    id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 150000, anulado: true, anuladoEn: '2026-10-16',
  });
  assert.deepEqual(anulada[1], lista[1], 'los demás no se tocan');
  assert.equal(lista[0].anulado, undefined, 'la lista recibida no se modifica');
  assert.equal(conServicioAnulado(anulada, 's1', '2026-11-01')[0].anuladoEn, '2026-10-16', 'la fecha de la anulación es la primera');
  assert.throws(() => conServicioAnulado(lista, 's3', HOY), /ya no está/);
});

test('carroConServicio / carroConServicioAnulado / carroConIntervalo devuelven otro carro y no tocan el recibido', () => {
  const carro = carroPropio();
  const con = carroConServicio(carro, { id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  assert.equal(carro.servicios, undefined);
  assert.equal(con.servicios.length, 1);
  assert.equal(con.placas, carro.placas, 'conserva el resto del carro');
  const sin = carroConServicioAnulado(con, 's1', HOY);
  assert.equal(con.servicios[0].anulado, undefined);
  assert.equal(sin.servicios[0].anulado, true);
  const otros = carroConIntervalo(carro, 'aceite', { km: 7500, meses: 4 });
  assert.equal(carro.intervalos, undefined);
  assert.deepEqual(otros.intervalos, { aceite: { km: 7500, meses: 4 } });
});

// ---------------------------------------------------------------------------------------------------------------
// Qué servicio cuenta
// ---------------------------------------------------------------------------------------------------------------

test('servicioCuenta: solo el que se sabe cuándo pasó — fecha de calendario, no de mañana, no anulado, de un tipo conocido', () => {
  const bueno = { id: 's1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 };
  assert.equal(servicioCuenta(bueno, HOY), true);
  assert.equal(servicioCuenta({ ...bueno, fecha: HOY }, HOY), true, 'el de hoy cuenta');
  assert.equal(razonDeQueNoCuente(bueno, HOY), '');
  const noCuentan = [
    [{ ...bueno, fecha: '' }, 'Sin fecha válida: no cuenta'],
    [{ ...bueno, fecha: undefined }, 'Sin fecha válida: no cuenta'],
    [{ ...bueno, fecha: '2026-13-01' }, 'Sin fecha válida: no cuenta'],
    [{ ...bueno, fecha: '10/10/2026' }, 'Sin fecha válida: no cuenta'],
    [{ ...bueno, fecha: '2026-10-17' }, 'Fecha que todavía no llega: no cuenta'],
    [{ ...bueno, anulado: true, anuladoEn: HOY }, 'Anulado'],
    [{ ...bueno, tipo: 'inventado' }, 'Servicio desconocido: no cuenta'],
    [null, 'Servicio desconocido: no cuenta'],
  ];
  for (const [servicio, razon] of noCuentan) {
    assert.equal(servicioCuenta(servicio, HOY), false, JSON.stringify(servicio));
    assert.equal(razonDeQueNoCuente(servicio, HOY), razon, JSON.stringify(servicio));
  }
  assert.equal(servicioCuenta(bueno, ''), false, 'sin un hoy válido no se puede saber si ya pasó');
  assert.equal(servicioCuenta(bueno, undefined), false);
});

test('ultimoServicioDe: el de fecha más reciente de ESE tipo, sin importar el orden; a igual fecha, el de más kilómetros', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-08-01', km: 12000 },
    { tipo: 'aceite', fecha: '2026-09-15', km: 17000 },
    { tipo: 'frenos', fecha: '2026-10-01', km: 18000 },
    { tipo: 'aceite', fecha: '2026-07-01', km: 7000 },
  ], HOY);
  assert.deepEqual(ultimoServicioDe(carro.servicios, 'aceite', HOY), { id: 's2', tipo: 'aceite', fecha: '2026-09-15', km: 17000 });
  assert.deepEqual(ultimoServicioDe(carro.servicios, 'frenos', HOY).fecha, '2026-10-01');
  assert.equal(ultimoServicioDe(carro.servicios, 'llantas', HOY), null);
  assert.equal(ultimoServicioDe(undefined, 'aceite', HOY), null);
  assert.equal(ultimoServicioDe('no es una lista', 'aceite', HOY), null);

  const empate = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-09-15', km: 16000 },
    { tipo: 'aceite', fecha: '2026-09-15', km: 17000 },
    { tipo: 'aceite', fecha: '2026-09-15', km: null },
  ], HOY);
  assert.equal(ultimoServicioDe(empate.servicios, 'aceite', HOY).km, 17000);
});

test('historialDeServicios: todos, el más reciente primero, marcando cuáles cuentan y por qué no los demás', () => {
  const base = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-08-01', km: 10000 },
    { tipo: 'frenos', fecha: '2026-10-01', km: 18000 },
    { tipo: 'aceite', fecha: '2026-10-01', km: 18500 },
  ], HOY);
  const anulado = carroConServicioAnulado(base, 's1', HOY);
  const conBasura = {
    ...anulado,
    servicios: [...anulado.servicios, { id: 'x1', tipo: 'aceite', fecha: '', km: 1 }, { id: 'x2', tipo: 'general', fecha: '2027-01-01', km: 2 }],
  };
  const h = historialDeServicios(conBasura.servicios, HOY);
  assert.deepEqual(h.map((f) => f.id), ['x2', 's3', 's2', 's1', 'x1'], 'por fecha, a igual fecha el anotado después va primero, y el que no tiene fecha al final');
  const porId = Object.fromEntries(h.map((f) => [f.id, f]));
  assert.equal(porId.s3.cuenta, true);
  assert.equal(porId.s3.razon, '');
  assert.equal(porId.s3.nombre, 'Aceite y filtro');
  assert.equal(porId.s3.km, 18500);
  assert.equal(porId.s1.cuenta, false);
  assert.equal(porId.s1.anulado, true);
  assert.equal(porId.s1.anuladoEn, HOY);
  assert.equal(porId.s1.razon, 'Anulado');
  assert.equal(porId.x1.razon, 'Sin fecha válida: no cuenta');
  assert.equal(porId.x2.razon, 'Fecha que todavía no llega: no cuenta');
  assert.deepEqual(historialDeServicios(undefined, HOY), []);
  assert.deepEqual(historialDeServicios([null, undefined], HOY), []);
  assert.equal(historialDeServicios([{ id: 'z', tipo: 'inventado', fecha: '2026-10-01' }], HOY)[0].nombre, 'Servicio desconocido');
  assert.equal(historialDeServicios([{ id: 'k', tipo: 'aceite', fecha: '2026-10-01', km: 0 }], HOY)[0].km, null, 'un 0 guardado no se muestra como 0 km');
});

// ---------------------------------------------------------------------------------------------------------------
// ¿Toca? El lado de los kilómetros
// ---------------------------------------------------------------------------------------------------------------

// El aceite: cada 5,000 km o 3 meses. Último servicio a los 15,000 km, hecho hace un mes (el plazo de tiempo, lejos), así que
// estas pruebas miden solo los kilómetros: toca a los 20,000.
const aceiteReciente = () => carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY);
const aceiteCon = (kmDelCarro) => estadoDeServicio({
  tipo: 'aceite', servicios: aceiteReciente().servicios, kilometraje: kmDelCarro === null ? null : { km: kmDelCarro }, hoy: HOY,
});

test('kilómetros: lejos, a 500 km (justo en el límite del aviso), a 1 km, justo en el límite y ya pasado', () => {
  const casos = [
    [19000, 'ok', 1000], [19499, 'ok', 501], [19500, 'pronto', 500], [19999, 'pronto', 1], [20000, 'toca', 0], [20001, 'toca', -1], [25000, 'toca', -5000],
  ];
  for (const [km, estado, faltan] of casos) {
    const r = aceiteCon(km);
    assert.equal(r.km.estado, estado, `${km} km`);
    assert.equal(r.km.faltan, faltan, `${km} km`);
    assert.equal(r.km.proximo, 20000);
    assert.equal(r.tiempo.estado, 'ok', 'el tiempo no se mueve');
  }
  assert.equal(aceiteCon(19000).estado, 'al-dia');
  assert.equal(aceiteCon(19500).estado, 'pronto');
  assert.equal(aceiteCon(20000).estado, 'toca');
});

test('kilómetros: las frases dicen cuánto falta o cuánto se pasó, en enteros', () => {
  assert.equal(aceiteCon(19000).km.texto, 'Faltan 1,000 km (a los 20,000 km).');
  assert.equal(aceiteCon(19999).km.texto, 'Faltan 1 km (a los 20,000 km).');
  assert.equal(aceiteCon(20000).km.texto, 'Toca ahora: el carro anda justo en los 20,000 km.');
  assert.equal(aceiteCon(20320).km.texto, 'Se pasó por 320 km (tocaba a los 20,000 km).');
  assert.ok(!/\.00/.test(aceiteCon(25000).km.texto), 'kilómetros, no quetzales: sin decimales');
});

test('sin el kilometraje del carro NO se mide el lado de kilómetros: «no se sabe», sin ningún «faltan N km» inventado', () => {
  for (const nada of [null, undefined, { km: 0 }, { km: '' }, { km: NaN }, {}, { km: -3 }]) {
    const r = estadoDeServicio({ tipo: 'aceite', servicios: aceiteReciente().servicios, kilometraje: nada, hoy: HOY });
    assert.equal(r.km.estado, 'desconocido', JSON.stringify(nada));
    assert.equal(r.km.faltan, null, 'ni un número');
    assert.equal(r.km.proximo, 20000, 'lo que sí se sabe: a qué kilometraje toca');
    assert.equal(r.km.texto, 'Toca a los 20,000 km, pero no se sabe en cuántos kilómetros anda el carro.');
    assert.ok(!/Faltan/.test(r.km.texto));
    assert.equal(r.estado, 'parcial', 'no es «al día»: la mitad no se pudo medir');
    assert.equal(r.etiqueta, 'Al día por fecha');
  }
});

test('el cero inventado: con un servicio hecho a 1,000 km un carro «en 0 km» saldría al día; sin kilometraje NO se dice', () => {
  // Con el cero inventado: proximo 6,000 − 0 = «faltan 6,000 km» y el renglón saldría «Al día». Eso es lo que no se hace.
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-10-01', km: 1000 }], HOY);
  const r = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 0 }, hoy: HOY });
  assert.equal(r.estado, 'parcial');
  assert.notEqual(r.estado, 'al-dia');
  assert.equal(r.km.faltan, null);
});

test('el último servicio sin kilometraje no ancla el lado de kilómetros (aunque el carro tenga kilometraje): solo el tiempo mide', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: null }], HOY);
  const r = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 30000 }, hoy: HOY });
  assert.equal(r.km.estado, 'desconocido');
  assert.equal(r.km.proximo, null);
  assert.equal(r.km.texto, 'El último servicio no tiene kilometraje anotado: no se sabe cuándo toca por kilómetros.');
  assert.equal(r.tiempo.estado, 'ok');
  assert.equal(r.estado, 'parcial');
});

test('el kilometraje del último servicio es el del ÚLTIMO, no el de uno anterior que sí lo traía', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-06-01', km: 10000 },
    { tipo: 'aceite', fecha: '2026-09-16', km: null },
  ], HOY);
  const r = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 30000 }, hoy: HOY });
  assert.equal(r.km.proximo, null, 'no se hereda el 10,000 de un servicio anterior');
  assert.equal(r.km.estado, 'desconocido');
});

// ---------------------------------------------------------------------------------------------------------------
// ¿Toca? El lado del tiempo
// ---------------------------------------------------------------------------------------------------------------

// Aceite cada 3 meses: un servicio del 16 de julio vence el 16 de octubre. Aquí se mide solo el tiempo, con un servicio
// sin kilometraje; los días que faltan los dicta la fecha del último servicio.
const aceiteDelDia = (fecha, kilometraje = null) => estadoDeServicio({
  tipo: 'aceite',
  servicios: carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha, km: null }], HOY).servicios,
  kilometraje,
  hoy: HOY,
});

test('tiempo: lejos, a 15 días (el límite del aviso), a 1 día, hoy y ya pasado', () => {
  const casos = [
    ['2026-09-16', 'ok', 61, '2026-12-16'], ['2026-08-01', 'ok', 16, '2026-11-01'], ['2026-07-31', 'pronto', 15, '2026-10-31'],
    ['2026-07-17', 'pronto', 1, '2026-10-17'], ['2026-07-16', 'toca', 0, '2026-10-16'], ['2026-07-15', 'toca', -1, '2026-10-15'],
    ['2026-01-10', 'toca', -189, '2026-04-10'],
  ];
  for (const [ultimo, estado, faltan, proxima] of casos) {
    const r = aceiteDelDia(ultimo);
    assert.equal(r.tiempo.estado, estado, ultimo);
    assert.equal(r.tiempo.faltan, faltan, ultimo);
    assert.equal(r.tiempo.proxima, proxima, ultimo);
  }
});

test('tiempo: 3 meses son meses de calendario, y el 31 no se pasa al mes siguiente', () => {
  assert.equal(aceiteDelDia('2026-07-03').tiempo.proxima, '2026-10-03', 'no los 90 días que caerían el 1 de octubre');
  const fin = estadoDeServicio({
    tipo: 'alineacion',
    servicios: carroConServicios(carroPropio(), [{ tipo: 'alineacion', fecha: '2026-08-31', km: null }], HOY).servicios,
    hoy: HOY,
  });
  assert.equal(fin.tiempo.proxima, '2027-02-28', 'seis meses desde el 31 de agosto');
});

test('tiempo: las frases dicen cuánto falta o cuánto se pasó', () => {
  assert.equal(aceiteDelDia('2026-09-16').tiempo.texto, 'Faltan 61 días (el 16 dic 2026).');
  assert.equal(aceiteDelDia('2026-07-17').tiempo.texto, 'Faltan 1 día (el 17 oct 2026).');
  assert.equal(aceiteDelDia('2026-07-16').tiempo.texto, 'Toca hoy (16 oct 2026).');
  assert.equal(aceiteDelDia('2026-07-15').tiempo.texto, 'Se pasó hace 1 día (tocaba el 15 oct 2026).');
  assert.equal(aceiteDelDia('2026-07-03').tiempo.texto, 'Se pasó hace 13 días (tocaba el 3 oct 2026).');
});

test('el tiempo sigue funcionando solo cuando no se sabe el kilometraje: vencido por fecha toca aunque los kilómetros no se midan', () => {
  const r = aceiteDelDia('2026-07-03', null);
  assert.equal(r.km.estado, 'desconocido');
  assert.equal(r.tiempo.estado, 'toca');
  assert.equal(r.estado, 'toca');
});

// ---------------------------------------------------------------------------------------------------------------
// Toca con el que llegue primero
// ---------------------------------------------------------------------------------------------------------------

test('«toca con el que llegue primero»: basta un lado vencido, sea cual sea', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY);
  const kmVencido = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 21000 }, hoy: HOY });
  assert.equal(kmVencido.km.estado, 'toca');
  assert.equal(kmVencido.tiempo.estado, 'ok');
  assert.equal(kmVencido.estado, 'toca', 'los kilómetros llegaron primero');

  const viejo = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-07-03', km: 15000 }], HOY);
  const tiempoVencido = estadoDeServicio({ tipo: 'aceite', servicios: viejo.servicios, kilometraje: { km: 15500 }, hoy: HOY });
  assert.equal(tiempoVencido.km.estado, 'ok');
  assert.equal(tiempoVencido.tiempo.estado, 'toca');
  assert.equal(tiempoVencido.estado, 'toca', 'el tiempo llegó primero');
});

test('«pronto» de un lado y «ok» del otro es «pronto»; toca de un lado y pronto del otro es «toca»', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-07-25', km: 15000 }], HOY);
  const r = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 16000 }, hoy: HOY });
  assert.equal(r.tiempo.estado, 'pronto');
  assert.equal(r.km.estado, 'ok');
  assert.equal(r.estado, 'pronto');
  const los2 = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 20100 }, hoy: HOY });
  assert.equal(los2.estado, 'toca');
});

test('sin ningún servicio que cuente: «sin registro» — no hay de dónde medir y nada se avisa', () => {
  const r = estadoDeServicio({ tipo: 'aceite', servicios: [], kilometraje: { km: 90000 }, hoy: HOY });
  assert.equal(r.estado, 'sin-registro');
  assert.equal(r.etiqueta, 'Sin registro');
  assert.equal(r.texto, 'Falta registrar el primer servicio.');
  assert.equal(r.ultimo, null);
  assert.equal(r.km.faltan, null);
  assert.equal(r.tiempo.faltan, null);
  assert.equal(r.tiempo.proxima, '');
});

// ---------------------------------------------------------------------------------------------------------------
// Un servicio que no se puede fechar no cuenta
// ---------------------------------------------------------------------------------------------------------------

test('un servicio anulado NO resetea el plazo: cuenta el anterior', () => {
  const base = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-03-01', km: 10000 },
    { tipo: 'aceite', fecha: '2026-10-10', km: 150000 },
  ], HOY);
  const vigente = estadoDeServicio({ tipo: 'aceite', servicios: base.servicios, kilometraje: { km: 16000 }, hoy: HOY });
  assert.equal(vigente.ultimo.fecha, '2026-10-10');
  const anulado = carroConServicioAnulado(base, 's2', HOY);
  const r = estadoDeServicio({ tipo: 'aceite', servicios: anulado.servicios, kilometraje: { km: 16000 }, hoy: HOY });
  assert.equal(r.ultimo.fecha, '2026-03-01', 'el de marzo vuelve a ser el último');
  assert.equal(r.tiempo.estado, 'toca');
  assert.equal(r.km.estado, 'toca', '10,000 + 5,000 = 15,000 y el carro anda en 16,000');
});

test('un servicio sin fecha válida o con fecha futura no cuenta: no resetea un plazo vencido ni lo calla', () => {
  const vencido = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-03-01', km: 10000 }], HOY);
  // Registros malformados escritos a propósito: lo que un constructor no produce y la nube sí puede traer.
  const malos = [
    { id: 'x1', tipo: 'aceite', fecha: '', km: 16000 },
    { id: 'x2', tipo: 'aceite', fecha: undefined, km: 16000 },
    { id: 'x3', tipo: 'aceite', fecha: '2026-99-99', km: 16000 },
    { id: 'x4', tipo: 'aceite', fecha: '2026-12-01', km: 16000 },
  ];
  const r = estadoDeServicio({ tipo: 'aceite', servicios: [...vencido.servicios, ...malos], kilometraje: { km: 16000 }, hoy: HOY });
  assert.equal(r.ultimo.fecha, '2026-03-01');
  assert.equal(r.estado, 'toca', 'el servicio sin fecha no calló el aviso');

  const soloMalos = estadoDeServicio({ tipo: 'aceite', servicios: malos, kilometraje: { km: 16000 }, hoy: HOY });
  assert.equal(soloMalos.estado, 'sin-registro', 'sin ninguno que cuente no hay de dónde medir');
});

test('el último servicio es el de fecha más reciente aunque llegue primero en la lista', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-10-01', km: 19000 },
    { tipo: 'aceite', fecha: '2026-03-01', km: 10000 },
  ], HOY);
  assert.equal(estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 19500 }, hoy: HOY }).ultimo.km, 19000);
});

test('un servicio de otro tipo no cuenta para éste', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'frenos', fecha: '2026-10-10', km: 19000 }], HOY);
  assert.equal(estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 19500 }, hoy: HOY }).estado, 'sin-registro');
});

test('un hoy inválido no inventa un plazo: el tiempo no se mide y nada cuenta', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-03-01', km: 10000 }], HOY);
  for (const malo of ['', undefined, '16/10/2026']) {
    const r = estadoDeServicio({ tipo: 'aceite', servicios: carro.servicios, kilometraje: { km: 16000 }, hoy: malo });
    assert.equal(r.estado, 'sin-registro', String(malo));
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Una lectura caída nunca es «al día»
// ---------------------------------------------------------------------------------------------------------------

test('con una lectura caída, lo que estaba bien queda «No se pudo confirmar»; lo malo se dice igual', () => {
  const bien = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY);
  for (const fallo of [{ falloContratos: true }, { falloFlota: true }, { falloFlota: true, falloContratos: true }]) {
    const alDia = estadoDeServicio({ tipo: 'aceite', servicios: bien.servicios, kilometraje: { km: 16000 }, hoy: HOY, ...fallo });
    assert.equal(alDia.estado, 'sin-confirmar', JSON.stringify(fallo));
    assert.equal(alDia.etiqueta, 'No se pudo confirmar');
    const parcial = estadoDeServicio({ tipo: 'aceite', servicios: bien.servicios, kilometraje: null, hoy: HOY, ...fallo });
    assert.equal(parcial.estado, 'sin-confirmar', 'tampoco «al día por fecha»');
    const toca = estadoDeServicio({ tipo: 'aceite', servicios: bien.servicios, kilometraje: { km: 21000 }, hoy: HOY, ...fallo });
    assert.equal(toca.estado, 'toca', 'si una copia vieja ya dice que toca, toca: el kilometraje solo sube');
    const pronto = estadoDeServicio({ tipo: 'aceite', servicios: bien.servicios, kilometraje: { km: 19700 }, hoy: HOY, ...fallo });
    assert.equal(pronto.estado, 'pronto');
  }
  const sinLeer = estadoDeServicio({ tipo: 'aceite', servicios: bien.servicios, kilometraje: null, hoy: HOY, falloContratos: true });
  assert.equal(sinLeer.km.estado, 'sin-leer', 'no leer no es lo mismo que no saber');
  assert.match(sinLeer.km.texto, /no se pudieron leer los contratos/);
  assert.equal(estadoDeServicio({ tipo: 'aceite', servicios: [], hoy: HOY, falloContratos: true }).estado, 'sin-registro', 'sin servicios sigue siendo sin registro');
});

// ---------------------------------------------------------------------------------------------------------------
// El mantenimiento de un carro entero
// ---------------------------------------------------------------------------------------------------------------

test('un carro recién comprado: los seis servicios «sin registro», el kilometraje «no se sabe», y nada que avisar', () => {
  const e = estadoDeMantenimiento({ carro: carroPropio(), kilometraje: kilometrajeDelCarro('v1', []), hoy: HOY });
  assert.equal(e.servicios.length, 6);
  assert.ok(e.servicios.every((s) => s.estado === 'sin-registro'));
  assert.equal(e.kilometraje, null);
  assert.deepEqual(e.tocan, []);
  assert.deepEqual(e.porTocar, []);
  assert.equal(e.lecturaIncompleta, false);
  assert.deepEqual(avisosDeMantenimiento({ carro: carroPropio(), kilometraje: null, hoy: HOY }), []);
});

test('un carro con historia: cada servicio se mide con SUS intervalos, los de siempre o los suyos', () => {
  const contratos = [contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 19700,
  })];
  const km = kilometrajeDelCarro('v1', contratos);
  const carro = carroConIntervalo(carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-09-16', km: 15000 },
    { tipo: 'frenos', fecha: '2026-06-01', km: 10000 },
    { tipo: 'llantas', fecha: '2025-06-01', km: 1000 },
  ], HOY), 'aceite', { km: 4000, meses: 3 });
  const e = estadoDeMantenimiento({ carro, kilometraje: km, hoy: HOY });
  const porTipo = Object.fromEntries(e.servicios.map((s) => [s.tipo, s]));
  assert.equal(porTipo.aceite.km.proximo, 19000, '15,000 + los 4,000 que este carro tiene para el aceite');
  assert.equal(porTipo.aceite.estado, 'toca', 'el carro anda en 19,700');
  assert.equal(porTipo.frenos.km.proximo, 40000);
  assert.equal(porTipo.frenos.estado, 'al-dia');
  assert.equal(porTipo.llantas.km.proximo, 41000);
  assert.equal(porTipo.llantas.estado, 'al-dia');
  assert.equal(porTipo.bateria.estado, 'sin-registro');
  assert.deepEqual(e.tocan.map((s) => s.tipo), ['aceite']);
  assert.equal(e.kilometraje.km, 19700);
});

test('estadoDeMantenimiento: un kilometraje {km: 0} se vuelve «no se sabe» también aquí (la puerta es una sola)', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-10-01', km: 1000 }], HOY);
  const e = estadoDeMantenimiento({ carro, kilometraje: { km: 0 }, hoy: HOY });
  assert.equal(e.kilometraje, null);
  assert.equal(e.servicios[0].estado, 'parcial');
});

// ---------------------------------------------------------------------------------------------------------------
// El aviso de «Sacar carro»
// ---------------------------------------------------------------------------------------------------------------

test('aviso: nada que decir cuando no hay servicios, cuando está al día o cuando lo único que hay es incierto', () => {
  assert.deepEqual(avisosDeMantenimiento({ carro: carroPropio(), kilometraje: { km: 80000 }, hoy: HOY }), [], 'sin servicios anotados no hay de dónde medir');
  const alDia = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY);
  assert.deepEqual(avisosDeMantenimiento({ carro: alDia, kilometraje: { km: 16000 }, hoy: HOY }), []);
  assert.deepEqual(avisosDeMantenimiento({ carro: alDia, kilometraje: null, hoy: HOY }), [], 'sin kilometraje y con el plazo de tiempo lejos');
  assert.deepEqual(avisosDeMantenimiento({ carro: alDia, kilometraje: { km: 0 }, hoy: HOY }), [], 'el campo vacío de «Sacar carro» (0) no es un odómetro');
  assert.deepEqual(avisosDeMantenimiento({ carro: null, kilometraje: { km: 99999 }, hoy: HOY }), []);
  assert.deepEqual(avisosDeMantenimiento({ carro: undefined, hoy: HOY }), []);
});

test('aviso: un carro ajeno no lleva mantenimiento (no es de él)', () => {
  const viejo = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-01-01', km: 1000 }], HOY);
  assert.equal(avisosDeMantenimiento({ carro: viejo, kilometraje: { km: 90000 }, hoy: HOY }).length, 1);
  assert.deepEqual(avisosDeMantenimiento({ carro: { ...viejo, ajeno: true }, kilometraje: { km: 90000 }, hoy: HOY }), []);
});

test('aviso: lo que ya toca por kilómetros, con el número que se escribió', () => {
  const carro = aceiteReciente();
  const r = avisosDeMantenimiento({ carro, kilometraje: { km: 20320 }, hoy: HOY });
  assert.deepEqual(r, [{
    nivel: 'medio',
    mensaje: 'A este carro le toca servicio: aceite y filtro (le tocaba a los 20,000 km y el carro anda en 20,320).',
  }]);
});

test('aviso: lo que ya toca por fecha, aunque no se sepa el kilometraje (el tiempo sigue funcionando solo)', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-07-03', km: 15000 }], HOY);
  for (const km of [null, undefined, { km: 0 }]) {
    const r = avisosDeMantenimiento({ carro, kilometraje: km, hoy: HOY });
    assert.deepEqual(r, [{ nivel: 'medio', mensaje: 'A este carro le toca servicio: aceite y filtro (le tocaba el 3 oct 2026).' }], JSON.stringify(km));
  }
});

test('aviso: cuando toca por los dos lados lo dice con los dos', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-07-03', km: 15000 }], HOY);
  const r = avisosDeMantenimiento({ carro, kilometraje: { km: 21000 }, hoy: HOY });
  assert.equal(r[0].mensaje, 'A este carro le toca servicio: aceite y filtro (le tocaba a los 20,000 km y el carro anda en 21,000 y el 3 oct 2026).');
});

test('aviso: lo que está por tocar, con cuánto falta de cada lado', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-09-16', km: 15000 },
    { tipo: 'alineacion', fecha: '2026-04-25', km: null },
  ], HOY);
  const r = avisosDeMantenimiento({ carro, kilometraje: { km: 19700 }, hoy: HOY });
  assert.deepEqual(r, [{
    nivel: 'medio',
    mensaje: 'A este carro le toca servicio pronto: aceite y filtro (faltan 300 km, a los 20,000) y alineación y balanceo (faltan 9 días, el 25 oct 2026).',
  }]);
});

test('aviso: lo vencido y lo próximo van en avisos separados, todos de nivel medio (advertencia, no candado)', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-07-03', km: 15000 },
    { tipo: 'alineacion', fecha: '2026-04-25', km: null },
  ], HOY);
  const r = avisosDeMantenimiento({ carro, kilometraje: null, hoy: HOY });
  assert.equal(r.length, 2);
  assert.ok(r.every((a) => a.nivel === 'medio'));
  assert.match(r[0].mensaje, /^A este carro le toca servicio: aceite y filtro/);
  assert.match(r[1].mensaje, /^A este carro le toca servicio pronto: alineación y balanceo/);
});

test('aviso: con muchos servicios no se arma una pared: se nombran tres y se cuentan los demás', () => {
  const todos = carroConServicios(carroPropio(), SERVICIOS.map((s) => ({ tipo: s.tipo, fecha: '2020-01-01', km: 1000 })), HOY);
  const r = avisosDeMantenimiento({ carro: todos, kilometraje: null, hoy: HOY });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /aceite y filtro \(le tocaba el 1 abr 2020\), pastillas de freno \(le tocaba el 1 ene 2021\), llantas \(le tocaba el 1 ene 2024\) y 3 más\./);
});

test('aviso: los kilómetros del aviso son enteros con su separador de miles, nunca con decimales', () => {
  const r = avisosDeMantenimiento({ carro: aceiteReciente(), kilometraje: { km: '20320' }, hoy: HOY });
  assert.ok(!/\.\d\d/.test(r[0].mensaje), r[0].mensaje);
  assert.match(r[0].mensaje, /20,000 km/);
});

test('aviso: un servicio anulado, sin fecha o de fecha futura no calla el aviso de uno vencido ni lo inventa', () => {
  const vencido = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-03-01', km: 10000 }], HOY);
  const conBasura = {
    ...vencido,
    servicios: [...vencido.servicios, { id: 'x1', tipo: 'aceite', fecha: '', km: 16000 }, { id: 'x2', tipo: 'aceite', fecha: '2027-01-01', km: 16000 }],
  };
  assert.equal(avisosDeMantenimiento({ carro: conBasura, hoy: HOY }).length, 1);
  const soloBasura = { ...carroPropio(), servicios: conBasura.servicios.slice(1) };
  assert.deepEqual(avisosDeMantenimiento({ carro: soloBasura, kilometraje: { km: 90000 }, hoy: HOY }), []);
});
