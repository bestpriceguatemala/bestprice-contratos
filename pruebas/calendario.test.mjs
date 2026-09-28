// Pruebas del calendario, en cálculo puro.
//
// El riesgo central de este archivo es el de-uno-en-uno: `getDay()` da 0
// para domingo, y si se usara tal cual como columna, un mes que empieza en
// domingo correría todo un día. Por eso se prueba un mes que empieza en
// lunes Y uno que empieza en domingo — son los dos casos donde ese error se
// esconde (un mes que empieza a media semana lo disimula).
import test from 'node:test';
import assert from 'node:assert/strict';
import { diasDelMes, cuadriculaDelMes, movimientosDelDia, resumenDeHoy } from '../js/nucleo/calendario.js';

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

const hoy = '2026-08-20';

const contratoDueHoy = {
  id: 'k1', carroId: 'v1', devolucionPrevista: '2026-08-20', fechaDevolucion: null, cerrado: false,
};
const contratoAtrasadoDesdeAyer = {
  id: 'k2', carroId: 'v2', devolucionPrevista: '2026-08-19', fechaDevolucion: null, cerrado: false,
};
const contratoCerradoAunqueVencido = {
  id: 'k3', carroId: 'v3', devolucionPrevista: '2026-08-10', fechaDevolucion: null, cerrado: true,
};
const contratoYaRegresado = {
  id: 'k4', carroId: 'v4', devolucionPrevista: '2026-08-15', fechaDevolucion: '2026-08-16', cerrado: false,
};

const reservaPendiente = { id: 'r1', clienteNombre: 'Ana', fechaSalida: '2026-08-20' };
const reservaEntregada = { id: 'r2', clienteNombre: 'Beto', fechaSalida: '2026-08-20', contratoId: 'k9' };
const reservaCancelada = { id: 'r3', clienteNombre: 'Caro', fechaSalida: '2026-08-20', cancelada: true };

const contratos = [contratoDueHoy, contratoAtrasadoDesdeAyer, contratoCerradoAunqueVencido, contratoYaRegresado];
const reservas = [reservaPendiente, reservaEntregada, reservaCancelada];

test('un contrato aparece en regresan el día de su devolución prevista', () => {
  const { regresan } = movimientosDelDia(hoy, { reservas, contratos });
  assert.deepEqual(regresan.map((c) => c.id), ['k1']);
});

test('un contrato debido justo hoy todavía NO cuenta como atrasado', () => {
  const { atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  assert.ok(!atrasados.some((c) => c.id === 'k1'));
});

test('un contrato vencido desde ayer, sin regresar, sí cuenta como atrasado', () => {
  const { atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  assert.deepEqual(atrasados.map((c) => c.id), ['k2']);
});

test('un contrato cerrado nunca cuenta como atrasado, aunque su fecha ya haya pasado', () => {
  const { atrasados } = movimientosDelDia(hoy, { reservas, contratos });
  assert.ok(!atrasados.some((c) => c.id === 'k3'));
});

test('un contrato que ya regresó (fechaDevolucion) no cuenta como atrasado', () => {
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

test('resumenDeHoy cuenta las garantías por liberar con la misma regla de pendientesDe', () => {
  const conGarantiaPendiente = { id: 'g1', devolucionPrevista: '2026-01-01', cerrado: true, garantiaMonto: 500, garantiaLiberada: false };
  const conGarantiaYaLiberada = { id: 'g2', devolucionPrevista: '2026-01-01', cerrado: true, garantiaMonto: 500, garantiaLiberada: true };
  // IMPORTANTE: garantiaMonto en 0 (pagó en efectivo) NO debe contar, aunque
  // garantiaLiberada siga en false — no hay nada que liberar.
  const enEfectivoSinGarantia = { id: 'g3', devolucionPrevista: '2026-01-01', cerrado: true, garantiaMonto: 0, garantiaLiberada: false };

  const resumen = resumenDeHoy('2026-01-05', { reservas: [], contratos: [conGarantiaPendiente, conGarantiaYaLiberada, enEfectivoSinGarantia] });
  assert.equal(resumen.garantias, 1);
});
