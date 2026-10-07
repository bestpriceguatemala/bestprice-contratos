// Pruebas del calendario, en cálculo puro.
//
// El riesgo central de este archivo es el de-uno-en-uno: `getDay()` da 0
// para domingo, y si se usara tal cual como columna, un mes que empieza en
// domingo correría todo un día. Por eso se prueba un mes que empieza en
// lunes Y uno que empieza en domingo — son los dos casos donde ese error se
// esconde (un mes que empieza a media semana lo disimula).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diasDelMes, cuadriculaDelMes, movimientosDelDia, movimientosParaPintar, resumenDeHoy,
} from '../js/nucleo/calendario.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';

test('un mes de 31 días trae 31 fechas, de la primera a la última', () => {
  const fechas = diasDelMes('2026-10');
  assert.equal(fechas.length, 31);
  assert.equal(fechas[0], '2026-10-01');
  assert.equal(fechas[30], '2026-10-31');
});

test('febrero de un año normal trae 28 días', () => {
  assert.equal(diasDelMes('2026-02').length, 28);
});

test('febrero de un año bisiesto trae 29 días, sin tabla de meses', () => {
  assert.equal(diasDelMes('2028-02').length, 29);
});

test('un mes que empieza en lunes no lleva huecos al principio', () => {
  // Junio 2026 empieza en lunes.
  const semanas = cuadriculaDelMes('2026-06');
  assert.equal(semanas.length, 5);
  assert.deepEqual(semanas[0], [
    '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07',
  ]);
  // Junio tiene 30 días y termina en martes: la última semana completa el
  // resto de la semana con huecos.
  assert.deepEqual(semanas[4], ['2026-06-29', '2026-06-30', null, null, null, null, null]);
});

test('un mes que empieza en domingo lleva seis huecos al principio (domingo es la última columna, no la primera)', () => {
  // Marzo 2026 empieza en domingo.
  const semanas = cuadriculaDelMes('2026-03');
  assert.equal(semanas.length, 6);
  assert.deepEqual(semanas[0], [null, null, null, null, null, null, '2026-03-01']);
  // Marzo tiene 31 días y termina en martes.
  assert.deepEqual(semanas[5], ['2026-03-30', '2026-03-31', null, null, null, null, null]);
});

// --- movimientosDelDia ---------------------------------------------------
//
// Los nombres de campo de aquí en adelante son los del §7b del diseño ("Los
// nombres de los campos"), tomados textuales de ahí — no de memoria: el
// contrato NO guarda `fechaDevolucion` ni `cerrado`. La única marca de que
// el carro volvió es `cierre.fechaReal`; "cerrado" es un estado derivado
// (estadoContrato, en estados.js) que nunca se lee como campo.

const hoy = '2026-08-20';

// Todavía afuera, vence hoy: sin `cierre`.
const contratoDueHoy = { id: 'k1', carroId: 'v1', devolucionPrevista: hoy };

// Todavía afuera, venció ayer: sin `cierre`.
const contratoAtrasadoDesdeAyer = { id: 'k2', carroId: 'v2', devolucionPrevista: '2026-08-19' };

// El carro ya volvió (cierre.fechaReal puesta) en una fecha distinta a la
// prevista — el regreso real manda sobre la fecha vencida, sin importar si
// el contrato ya se cerró (cobro y garantía) o sigue "devuelto".
const contratoYaRegresado = {
  id: 'k4', carroId: 'v4', devolucionPrevista: '2026-08-15', cierre: { fechaReal: '2026-08-16' },
};

const reservaPendiente = { id: 'r1', clienteNombre: 'Ana', fechaSalida: '2026-08-20' };
const reservaEntregada = { id: 'r2', clienteNombre: 'Beto', fechaSalida: '2026-08-20', contratoId: 'k9' };
const reservaCancelada = { id: 'r3', clienteNombre: 'Caro', fechaSalida: '2026-08-20', cancelada: true };

const contratos = [contratoDueHoy, contratoAtrasadoDesdeAyer, contratoYaRegresado];
const reservas = [reservaPendiente, reservaEntregada, reservaCancelada];

test('un contrato debido hoy y todavía afuera aparece en regresan, no en yaRegresaron', () => {
  const { regresan, yaRegresaron } = movimientosDelDia(hoy, { reservas, contratos });
  assert.deepEqual(regresan.map((c) => c.id), ['k1']);
  assert.deepEqual(yaRegresaron.map((c) => c.id), []);
});

// Ruling del coordinador: las cuatro cifras del encabezado son un
// pendiente de HOY, no un historial. Si un carro esperado hoy ya está de
// vuelta, "regresan" no debe seguir contándolo — por eso movimientosDelDia
// parte los contratos citados ese día en dos listas, y la pantalla de mes
// (que sí quiere ver el día completo) usa yaRegresaron para eso, sin volver
// a filtrar. Este también es el caso Important de la revisión: el contrato
// trae `cierre.fechaReal` real, no un campo inventado.
test('un contrato con cierre.fechaReal puesta, debido hoy, aparece en yaRegresaron y no en regresan ni en atrasados', () => {
  const c = { id: 'k6', carroId: 'v6', devolucionPrevista: hoy, cierre: { fechaReal: hoy } };
  const { regresan, yaRegresaron, atrasados } = movimientosDelDia(hoy, { reservas: [], contratos: [c] });
  assert.deepEqual(regresan.map((x) => x.id), []);
  assert.deepEqual(yaRegresaron.map((x) => x.id), ['k6']);
  assert.deepEqual(atrasados.map((x) => x.id), []);
});

test('un contrato debido justo hoy todavía NO cuenta como atrasado', () => {
  const { atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  assert.ok(!atrasados.some((c) => c.id === 'k1'));
});

test('un contrato vencido desde ayer, sin regresar, sí cuenta como atrasado', () => {
  const { atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  assert.deepEqual(atrasados.map((c) => c.id), ['k2']);
});

test('un contrato cuyo carro ya volvió (cierre.fechaReal) no cuenta como atrasado, aunque su fecha prevista ya haya pasado', () => {
  const { atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  assert.ok(!atrasados.some((c) => c.id === 'k4'));
});

test('un atraso se mide contra la fecha del día que se mira, no contra un reloj real', () => {
  // El mismo contrato k2 (vencido el 19), visto desde un día anterior a su
  // vencimiento, todavía no estaba atrasado ESE día.
  const { atrasados } = movimientosDelDia('2026-08-18', { reservas: [], contratos: [contratoAtrasadoDesdeAyer] });
  assert.equal(atrasados.length, 0);
});

test('una reservación pendiente aparece en salen el día de su salida', () => {
  const { salen } = movimientosDelDia(hoy, { reservas, contratos });
  assert.deepEqual(salen.map((r) => r.id), ['r1']);
});

test('una reservación entregada no aparece en salen', () => {
  const { salen } = movimientosDelDia(hoy, { reservas, contratos });
  assert.ok(!salen.some((r) => r.id === 'r2'));
});

test('una reservación cancelada no aparece en salen', () => {
  const { salen } = movimientosDelDia(hoy, { reservas, contratos });
  assert.ok(!salen.some((r) => r.id === 'r3'));
});

// diasEntre() da 0 (no NaN) cuando falta una fecha (ver fechas.js) — sin
// candado, una reservación o un contrato sin fecha "coincidiría" con
// cualquier día que se mire. Guarda contra esa trampa.
test('una reservación sin fechaSalida no aparece en salen ningún día', () => {
  const sinFecha = { id: 'r4', clienteNombre: 'Sin fecha' };
  const { salen } = movimientosDelDia(hoy, { reservas: [sinFecha], contratos: [] });
  assert.equal(salen.length, 0);
});

test('un contrato sin devolucionPrevista no aparece en regresan ningún día', () => {
  const sinFecha = { id: 'k5', carroId: 'v5' };
  const { regresan } = movimientosDelDia(hoy, { reservas: [], contratos: [sinFecha] });
  assert.equal(regresan.length, 0);
});

// --- resumenDeHoy ----------------------------------------------------------

test('resumenDeHoy da los cuatro números, construidos sobre movimientosDelDia', () => {
  const resumen = resumenDeHoy(hoy, { reservas, contratos });
  assert.deepEqual(resumen, { salen: 1, regresan: 1, atrasados: 1, garantias: 0 });
});

// Ruling del coordinador: si dos carros se esperaban hoy y ya están en el
// patio, el encabezado no puede seguir diciendo "regresan 2" a las 5pm solo
// porque la cita caía hoy — es un pendiente de HOY, no un historial.
test('resumenDeHoy.regresan no cuenta un contrato debido hoy que ya regresó (cierre.fechaReal puesta)', () => {
  const yaRegreso = { id: 'k8', carroId: 'v8', devolucionPrevista: hoy, cierre: { fechaReal: hoy } };
  const resumen = resumenDeHoy(hoy, { reservas: [], contratos: [yaRegreso] });
  assert.equal(resumen.regresan, 0);
});

test('resumenDeHoy cuenta las garantías por liberar con la misma regla de garantiaPorLiberar (estados.js)', () => {
  const conGarantiaPendiente = {
    id: 'g1', devolucionPrevista: '2026-01-01', cierre: { fechaReal: '2026-01-02' }, garantiaMonto: 500, garantiaLiberada: false,
  };
  const conGarantiaYaLiberada = {
    id: 'g2', devolucionPrevista: '2026-01-01', cierre: { fechaReal: '2026-01-02' }, garantiaMonto: 500, garantiaLiberada: true,
  };
  // IMPORTANTE: garantiaMonto en 0 (pagó en efectivo) NO debe contar, aunque
  // garantiaLiberada siga en false — no hay nada que liberar.
  const enEfectivoSinGarantia = {
    id: 'g3', devolucionPrevista: '2026-01-01', cierre: { fechaReal: '2026-01-02' }, garantiaMonto: 0, garantiaLiberada: false,
  };

  const resumen = resumenDeHoy('2026-01-05', { reservas: [], contratos: [conGarantiaPendiente, conGarantiaYaLiberada, enEfectivoSinGarantia] });
  assert.equal(resumen.garantias, 1);
});

// El defecto real que motivó esta tarea (Task 7 lo encontró en pantalla): la
// cifra "Garantías por liberar" del encabezado y la lista de la pantalla de
// flota decían números distintos al mismo tiempo. La causa era que la cifra
// contaba `pendientesDe(c).garantia` sola, que también es `true` en un
// contrato con el carro TODAVÍA AFUERA (la tarjeta sigue retenida, pero eso
// es lo normal de una renta activa, no un pendiente). Estas dos pruebas fijan
// el caso exacto.
test('resumenDeHoy.garantias NO cuenta una garantía bloqueada mientras el carro sigue afuera', () => {
  const carroTodaviaAfuera = { id: 'g4', devolucionPrevista: '2026-01-01', garantiaMonto: 500, garantiaLiberada: false };
  const resumen = resumenDeHoy('2026-01-05', { reservas: [], contratos: [carroTodaviaAfuera] });
  assert.equal(resumen.garantias, 0);
});

test('resumenDeHoy.garantias SÍ cuenta una garantía bloqueada una vez que el carro ya volvió', () => {
  const carroYaDeVuelta = {
    id: 'g5', devolucionPrevista: '2026-01-01', cierre: { fechaReal: '2026-01-02' }, garantiaMonto: 500, garantiaLiberada: false,
  };
  const resumen = resumenDeHoy('2026-01-05', { reservas: [], contratos: [carroYaDeVuelta] });
  assert.equal(resumen.garantias, 1);
});

// --- movimientosParaPintar: un día que todavía no llega no tiene atrasados --------
//
// Prueba del sistema (7 oct 2026): con tres carros que vuelven hoy y uno ya vencido, el
// mes mostraba «⚠ 3» en CADA día que falta. Los contratos son los de verdad
// (contratoDeUnCarro: lo que queda guardado), no objetos con las llaves a mano.

test('movimientosParaPintar: hoy y los días pasados cuentan los atrasados de ese día, como siempre', () => {
  // Salió el 20 oct por 3 días: debía volver el 23. Hoy es el 25 y sigue afuera.
  const vencido = contratoDeUnCarro({ id: 'v', fechaSalida: '2026-10-20', dias: 3 });
  assert.deepEqual(movimientosParaPintar('2026-10-25', '2026-10-25', { contratos: [vencido] }).atrasados.map((c) => c.id), ['v']);
  assert.deepEqual(movimientosParaPintar('2026-10-24', '2026-10-25', { contratos: [vencido] }).atrasados.map((c) => c.id), ['v']);
});

test('movimientosParaPintar: un día futuro no marca atrasados, ni del que ya venció ni del que vence hoy', () => {
  const vencido = contratoDeUnCarro({ id: 'v', carroId: 'v1', fechaSalida: '2026-10-20', dias: 3 });
  const vuelveHoy = contratoDeUnCarro({ id: 'h', carroId: 'v2', fechaSalida: '2026-10-22', dias: 3 });
  const manana = movimientosParaPintar('2026-10-26', '2026-10-25', { contratos: [vencido, vuelveHoy] });
  assert.deepEqual(manana.atrasados, [], 'mañana no hay nada atrasado todavía: el rojo de hoy no se repite en cada día del mes');
  const finDeMes = movimientosParaPintar('2026-10-31', '2026-10-25', { contratos: [vencido, vuelveHoy] });
  assert.deepEqual(finDeMes.atrasados, []);
  // Sin el arreglo (movimientosDelDia a secas) el mismo día daba los dos como atrasados:
  assert.equal(movimientosDelDia('2026-10-31', { contratos: [vencido, vuelveHoy] }).atrasados.length, 2);
});

test('movimientosParaPintar: un día futuro conserva lo que sí es una cita (salen y regresan)', () => {
  const vuelvePasado = contratoDeUnCarro({ id: 'p', fechaSalida: '2026-10-25', dias: 3 });
  const reserva = { id: 'r', clienteNombre: 'Ana', fechaSalida: '2026-10-28' };
  const dia28 = movimientosParaPintar('2026-10-28', '2026-10-25', { reservas: [reserva], contratos: [vuelvePasado] });
  assert.deepEqual(dia28.salen.map((r) => r.id), ['r']);
  assert.deepEqual(dia28.regresan.map((c) => c.id), ['p']);
});
