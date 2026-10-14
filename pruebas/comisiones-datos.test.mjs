// Pruebas de la capa de datos de los empleados y de lo que se les paga de comisión (js/datos.js), contra la
// Firestore de mentira de pruebas/fixtures/nubeEnMemoria.mjs, que imita las reglas que importan:
//
//   empleados      -> se LEE con cualquier sesión (el mostrador escoge quién rentó) y se ESCRIBE solo con la de dinero
//   pagosComision  -> se lee y se escribe solo con la credencial de dinero
//
// Estas pruebas NO prueban a Firebase: prueban que el código pide lo que las reglas exigen, y que cuando algo falla
// no se dibuja como «no hay nada».
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cargarEmpleados, guardarEmpleado, nuevoIdEmpleado, empleadoParaGuardar, MENSAJE_EMPLEADO_SIN_DINERO, MENSAJE_ALTA_SIN_ID,
  nuevoIdPagoComision, construirPagoComision, pagoComisionParaGuardar, guardarPagoComision, cargarPagosComision, anularPagoComision,
  enlazarContratosAlEmpleado, MENSAJE_COMISION_SIN_DINERO, MENSAJE_COMISION_SIN_RENTAS, MENSAJE_COMISION_SIN_MONTO,
  MENSAJE_COMISION_SIN_ID, MENSAJE_ENLACE_SIN_DINERO,
} from '../js/datos.js';
import { cuentaDeEmpleado } from '../js/nucleo/comisiones.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { renta, rentaDeAntes, pagoDeComision, EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { ana, wilder } = EMPLEADOS;
const AHORA = 1790000000000;

const conDinero = (nube, extra = {}) => ({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, avisar: () => {}, ...extra });

// ---------------------------------------------------------------------------
// Los empleados
// ---------------------------------------------------------------------------

test('cargarEmpleados: trae la lista con la sesión del mostrador, y NO deja copia local (ni la pide)', async () => {
  const nube = nubeEnMemoria({ empleados: [ana, wilder] });
  const r = await cargarEmpleados({ iniciar: nube.iniciar });
  assert.equal(r.fallo, false);
  assert.deepEqual(r.datos.map((e) => e.id).sort(), ['e1', 'e6']);
  assert.deepEqual(nube.llamadas.filter(([op]) => op === 'getDocs'), [['getDocs', 'empleados', 'mostrador']], 'con la base del mostrador: las reglas lo permiten');
  assert.deepEqual(r.datos.find((e) => e.id === 'e6').porcentajeComision, 0, 'el 0 de Wilder llega como 0');
});

test('cargarEmpleados: una lista que de verdad está vacía es `[]` sin fallo; una lectura fallida es `null` con fallo — nunca `[]`', async () => {
  assert.deepEqual(await cargarEmpleados({ iniciar: nubeEnMemoria().iniciar }), { datos: [], fallo: false });
  const caida = nubeEnMemoria({ empleados: [ana], fallan: [{ op: 'getDocs' }] });
  assert.deepEqual(await cargarEmpleados({ iniciar: caida.iniciar }), { datos: null, fallo: true });
  assert.deepEqual(await cargarEmpleados({ iniciar: async () => { throw new Error('sin claves'); } }), { datos: null, fallo: true });
});

test('guardarEmpleado: escribe en `empleados` con la base de DINERO, sellando id y actualizado', async () => {
  const nube = nubeEnMemoria();
  const id = await nuevoIdEmpleado({ iniciar: nube.iniciar });
  const guardado = await guardarEmpleado({ id, codigo: '6', nombre: 'Wilder', porcentajeComision: 0, activo: true }, conDinero(nube));
  assert.equal(guardado.id, id);
  assert.ok(guardado.actualizado > 0);
  assert.strictEqual(nube.leer(`empleados/${id}`).porcentajeComision, 0, 'el cero se guarda como cero');
  const [escritura] = nube.escrituras(`empleados/${id}`);
  assert.equal(escritura[4], 'dinero');
});

test('guardarEmpleado: con la base del mostrador las reglas lo rechazan: el porcentaje no se cambia desde el mostrador', async () => {
  const nube = nubeEnMemoria();
  const id = await nuevoIdEmpleado({ iniciar: nube.iniciar });
  // Aun si alguien le pasara la base del mostrador, la nube de mentira (como la de verdad) lo rechaza.
  await assert.rejects(
    guardarEmpleado({ id, codigo: '1', nombre: 'Ana', porcentajeComision: 5 }, conDinero(nube, { dbDinero: () => nube.dbMostrador })),
    { code: 'permission-denied' },
  );
  assert.equal(nube.leer(`empleados/${id}`), undefined);
});

test('guardarEmpleado: sin sesión de dinero se niega y no escribe nada', async () => {
  const nube = nubeEnMemoria();
  await assert.rejects(
    guardarEmpleado({ id: 'e9', codigo: '9', nombre: 'Luis', porcentajeComision: 5 }, conDinero(nube, { dbDinero: () => null })),
    { message: MENSAJE_EMPLEADO_SIN_DINERO },
  );
  assert.equal(nube.escrituras().length, 0);
});

test('guardarEmpleado: sin id se niega (un alta que no se puede repetir sin duplicarse no se guarda)', async () => {
  const nube = nubeEnMemoria();
  await assert.rejects(guardarEmpleado({ codigo: '9', nombre: 'Luis', porcentajeComision: 5 }, conDinero(nube)), { message: MENSAJE_ALTA_SIN_ID });
  assert.equal(nube.escrituras().length, 0);
});

test('guardarEmpleado: sin nombre, sin código o sin porcentaje legible no se guarda; el 0 sí', async () => {
  const nube = nubeEnMemoria();
  for (const mal of [{ nombre: '' }, { codigo: '' }, { porcentajeComision: '' }, { porcentajeComision: undefined }, { porcentajeComision: 101 }]) {
    await assert.rejects(guardarEmpleado({ id: 'e9', codigo: '9', nombre: 'Luis', porcentajeComision: 5, ...mal }, conDinero(nube)), Error, JSON.stringify(mal));
  }
  assert.equal(nube.escrituras().length, 0);
  await guardarEmpleado({ id: 'e9', codigo: '9', nombre: 'Luis', porcentajeComision: 0 }, conDinero(nube));
  assert.equal(nube.escrituras().length, 1);
});

test('guardarEmpleado: no deja copia local (el porcentaje no se escribe donde se lee sin contraseña)', async () => {
  const nube = nubeEnMemoria();
  // Si intentara una copia local, en Node no existe `indexedDB` y el aviso lo delataría.
  const avisos = [];
  await guardarEmpleado({ id: 'e9', codigo: '9', nombre: 'Luis', porcentajeComision: 5 }, conDinero(nube, { avisar: (...a) => avisos.push(a) }));
  assert.deepEqual(avisos, []);
});

test('guardarEmpleado: si la nube falla, el guardado falla (no se finge)', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'setDoc' }] });
  await assert.rejects(guardarEmpleado({ id: 'e9', codigo: '9', nombre: 'Luis', porcentajeComision: 5 }, conDinero(nube)), /sin internet/);
});

test('empleadoParaGuardar: conserva el id del que ya lo tiene, sella `actualizado` y arrastra lo que el formulario no conoce', () => {
  const e = empleadoParaGuardar({ id: 'e6', codigo: '6', nombre: 'Wilder', porcentajeComision: '0', telefono: '5555', actualizado: 1 }, { ahora: AHORA });
  assert.equal(e.id, 'e6');
  assert.equal(e.actualizado, AHORA, 'el sello viejo no se copia: perdería contra la copia que ya está en la nube');
  assert.equal(e.telefono, '5555');
  assert.strictEqual(e.porcentajeComision, 0);
  assert.equal(empleadoParaGuardar({ nombre: 'x' }, { id: 'nuevo', ahora: AHORA }).id, 'nuevo');
});

// ---------------------------------------------------------------------------
// Los pagos de comisión
// ---------------------------------------------------------------------------

const firmes = () => [
  renta({ id: 'c1', numero: 1, recibidoEl: '2026-10-05' }),
  renta({ id: 'c2', numero: 2, recibidoEl: '2026-10-05' }),
  renta({ id: 'c3', numero: 3 }), // sigue afuera
  renta({ id: 'w1', numero: 4, empleado: wilder, recibidoEl: '2026-10-05' }),
];

test('construirPagoComision: monto y contratos salen de la MISMA elección, y lo que no es pagable no entra', () => {
  const pago = construirPagoComision({
    empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos: firmes(), pagos: [], idsMarcados: ['c1', 'c3', 'w1', 'fantasma'],
  });
  assert.deepEqual(pago, { empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', monto: 140, contratos: ['c1'] });
});

test('construirPagoComision: lo que ya está pagado no vuelve a entrar, y un pago anulado devuelve sus rentas', () => {
  const base = { empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos: firmes(), idsMarcados: ['c1', 'c2'] };
  const pagado = construirPagoComision({ ...base, pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] })] });
  assert.deepEqual(pagado.contratos, ['c2']);
  const anulado = construirPagoComision({ ...base, pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'], anulado: true })] });
  assert.deepEqual(anulado.contratos, ['c1', 'c2']);
  assert.equal(anulado.monto, 280);
});

test('construirPagoComision: sin nada pagable marcado devuelve monto 0 y ninguna renta (guardar se niega), nunca un pago inventado', () => {
  const pago = construirPagoComision({ empleadoId: 'e6', fecha: '2026-10-20', forma: 'efectivo', contratos: firmes(), pagos: [], idsMarcados: ['w1'] });
  assert.equal(pago.monto, 0);
  assert.deepEqual(pago.contratos, []);
});

test('construirPagoComision: el grupo sin enlazar guarda empleadoId null (no undefined, que Firestore rechaza)', () => {
  const pago = construirPagoComision({
    fecha: '2026-10-20', forma: 'efectivo', contratos: [rentaDeAntes({ id: 'v1', recibidoEl: '2026-09-29' })], pagos: [], idsMarcados: ['v1'],
  });
  assert.strictEqual(pago.empleadoId, null);
  assert.equal(pago.monto, 140);
});

test('construirPagoComision: lanza si los pagos no son una lista — una lectura fallida no es «nada pagado»', () => {
  assert.throws(() => construirPagoComision({ contratos: firmes(), pagos: null, idsMarcados: ['c1'] }), /«pagos» debe ser una lista/);
  assert.throws(() => construirPagoComision({ contratos: undefined, pagos: [], idsMarcados: ['c1'] }), /«contratos» debe ser una lista/);
});

const pagoNuevo = (extra = {}) => ({ empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', monto: 140, contratos: ['c1'], ...extra });

async function guardarPago(nube, pago, extra = {}) {
  const id = pago.id ?? await nuevoIdPagoComision(conDinero(nube));
  return guardarPagoComision({ ...pago, id }, conDinero(nube, extra));
}

test('guardarPagoComision: escribe en `pagosComision` con la base de DINERO, sin número de comprobante', async () => {
  const nube = nubeEnMemoria();
  const guardado = await guardarPago(nube, pagoNuevo());
  assert.deepEqual(Object.keys(guardado).sort(), ['actualizado', 'contratos', 'empleadoId', 'fecha', 'forma', 'id', 'monto']);
  const [escritura, ...otras] = nube.escrituras(`pagosComision/${guardado.id}`);
  assert.equal(otras.length, 0);
  assert.equal(escritura[4], 'dinero');
  assert.deepEqual(nube.leer(`pagosComision/${guardado.id}`), guardado);
  assert.equal(nube.docs.has('contadores/comprobantes'), false, 'no gasta un número de comprobante: no hay papel');
});

test('guardarPagoComision: no deja copia local (lo que se le paga a cada empleado no se escribe donde se lee sin contraseña)', async () => {
  const nube = nubeEnMemoria();
  // Si intentara una copia local, en Node no existe `indexedDB` y el aviso lo delataría.
  const avisos = [];
  await guardarPago(nube, pagoNuevo(), { avisar: (...a) => avisos.push(a) });
  assert.deepEqual(avisos, []);
});

test('guardarPagoComision: se niega ANTES de escribir sin sesión de dinero, sin rentas, en Q0.00 o sin id', async () => {
  const nube = nubeEnMemoria();
  const id = await nuevoIdPagoComision(conDinero(nube));
  const intenta = (pago, extra) => guardarPagoComision({ id, ...pago }, conDinero(nube, extra));
  await assert.rejects(intenta(pagoNuevo(), { dbDinero: () => null }), { message: MENSAJE_COMISION_SIN_DINERO });
  await assert.rejects(intenta(pagoNuevo({ contratos: [] })), { message: MENSAJE_COMISION_SIN_RENTAS });
  await assert.rejects(intenta(pagoNuevo({ contratos: undefined })), { message: MENSAJE_COMISION_SIN_RENTAS });
  await assert.rejects(intenta(pagoNuevo({ monto: 0 })), { message: MENSAJE_COMISION_SIN_MONTO });
  await assert.rejects(intenta(pagoNuevo({ monto: 'abc' })), { message: MENSAJE_COMISION_SIN_MONTO });
  await assert.rejects(guardarPagoComision(pagoNuevo(), conDinero(nube)), { message: MENSAJE_COMISION_SIN_ID });
  assert.equal(nube.escrituras().length, 0, 'no se escribió nada');
});

test('guardarPagoComision: con la base del mostrador las reglas lo rechazan (no hay otra puerta)', async () => {
  const nube = nubeEnMemoria();
  await assert.rejects(nuevoIdPagoComision(conDinero(nube, { dbDinero: () => null })), { message: MENSAJE_COMISION_SIN_DINERO });
  await assert.rejects(guardarPago(nube, { ...pagoNuevo(), id: 'p1' }, { dbDinero: () => nube.dbMostrador }), { code: 'permission-denied' });
});

test('guardarPagoComision: apretar el botón dos veces (mismo id) es UN pago, no dos', async () => {
  const nube = nubeEnMemoria();
  const id = await nuevoIdPagoComision(conDinero(nube));
  await Promise.all([guardarPago(nube, { ...pagoNuevo(), id }), guardarPago(nube, { ...pagoNuevo(), id })]);
  const { datos } = await cargarPagosComision(conDinero(nube));
  assert.equal(datos.length, 1);
});

test('guardarPagoComision: un pago ANULADO se guarda en su mismo documento y conserva monto y rentas', async () => {
  const nube = nubeEnMemoria();
  const guardado = await guardarPago(nube, pagoNuevo());
  const anulado = anularPagoComision(guardado, { fecha: '2026-10-21' });
  assert.equal(anulado.anulado, true);
  assert.equal(anulado.anuladoEn, '2026-10-21');
  assert.equal(anulado.monto, 140);
  assert.deepEqual(anulado.contratos, ['c1']);
  await guardarPagoComision(anulado, conDinero(nube));
  assert.equal(nube.leer(`pagosComision/${guardado.id}`).anulado, true);
  assert.equal((await cargarPagosComision(conDinero(nube))).datos.length, 1, 'no se borra: sigue en la lista');
  assert.equal(anularPagoComision(anulado, { fecha: '2026-12-31' }).anuladoEn, '2026-10-21', 'un segundo clic no le pisa la fecha');
});

test('pagoComisionParaGuardar: sella id y actualizado, monto por q(), contratos nunca undefined', () => {
  const p = pagoComisionParaGuardar({ empleadoId: 'e1', monto: '140.004', contratos: undefined, actualizado: 5 }, { id: 'p9', ahora: AHORA });
  assert.equal(p.id, 'p9');
  assert.equal(p.monto, 140);
  assert.deepEqual(p.contratos, []);
  assert.equal(p.actualizado, AHORA);
  assert.equal(pagoComisionParaGuardar({ id: 'p1', monto: 1, contratos: ['c'] }, { ahora: AHORA }).id, 'p1', 'conserva el suyo si no le pasan otro');
});

test('cargarPagosComision: trae los pagos con la base de DINERO; fallar es null con fallo, y vacío de verdad es []', async () => {
  const p1 = pagoDeComision({ id: 'p1', monto: 140, contratos: ['c1'] });
  const nube = nubeEnMemoria({ pagosComision: [p1] });
  const r = await cargarPagosComision(conDinero(nube));
  assert.deepEqual(r, { datos: [p1], fallo: false });
  assert.deepEqual(nube.llamadas.filter(([op]) => op === 'getDocs'), [['getDocs', 'pagosComision', 'dinero']]);

  assert.deepEqual(await cargarPagosComision(conDinero(nubeEnMemoria())), { datos: [], fallo: false });
  assert.deepEqual(await cargarPagosComision(conDinero(nubeEnMemoria({ fallan: [{ op: 'getDocs' }] }))), { datos: null, fallo: true });
  assert.deepEqual(await cargarPagosComision(conDinero(nube, { dbDinero: () => null })), { datos: null, fallo: true });
  assert.deepEqual(await cargarPagosComision(conDinero(nube, { dbDinero: () => nube.dbMostrador })), { datos: null, fallo: true }, 'con el mostrador las reglas rechazan');
});

test('lo que se guarda y se lee de vuelta sirve para la cuenta: lo ya pagado no se vuelve a deber', async () => {
  const nube = nubeEnMemoria();
  const contratos = firmes();
  const pago = construirPagoComision({ empleadoId: 'e1', fecha: '2026-10-20', forma: 'efectivo', contratos, pagos: [], idsMarcados: ['c1'] });
  await guardarPago(nube, pago);
  const { datos } = await cargarPagosComision(conDinero(nube));
  const cuenta = cuentaDeEmpleado({ contratos: contratos.filter((c) => c.empleadoId === 'e1'), pagos: datos });
  assert.deepEqual(cuenta.pagados.map((c) => c.id), ['c1']);
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['c2']);
  assert.equal(cuenta.totalPorPagar, 140);
});

// ---------------------------------------------------------------------------
// Enlazar las rentas de antes a un empleado
// ---------------------------------------------------------------------------

/** Enlazar va con la credencial de dinero: las dependencias de siempre, con la base de dinero puesta. */
const enlazaCon = (nube, extra = {}) => ({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero, ...extra });

const nubeConViejas = () => {
  const v1 = rentaDeAntes({ id: 'v1', recibidoEl: '2026-09-29' });
  const v2 = rentaDeAntes({ id: 'v2', recibidoEl: '2026-09-29' });
  return nubeEnMemoria({ contratos: [v1, v2] });
};

test('enlazarContratosAlEmpleado: escribe SOLO empleadoId y el sello, con update — nunca el contrato entero, y no toca rentadoPor ni el porcentaje', async () => {
  const nube = nubeConViejas();
  const antes = nube.leer('contratos/v1');
  await enlazarContratosAlEmpleado(['v1', 'v2', 'v1'], 'e6', { ...enlazaCon(nube), ahora: AHORA + 123 });
  const despues = nube.leer('contratos/v1');
  assert.equal(despues.empleadoId, 'e6');
  assert.equal(despues.actualizado, AHORA + 123, 'el sello sube para que la copia de otras computadoras recoja el cambio');
  assert.equal(despues.rentadoPor, antes.rentadoPor, 'el nombre de ese día se conserva');
  assert.equal(despues.porcentajeComision, 5, 'sellado es sellado: enlazar no mueve el porcentaje');
  assert.deepEqual(despues.pagos, antes.pagos);
  assert.deepEqual(nube.llamadas.filter(([op]) => op === 'commit'), [['commit', ['contratos/v1', 'contratos/v2'], 'dinero']], 'un lote, sin repetidos, con la credencial de dinero');
});

test('enlazarContratosAlEmpleado: puede, SOLO si se pide, ponerle a algunas rentas el porcentaje de hoy del empleado (Wilder, 0 %)', async () => {
  const nube = nubeConViejas();
  await enlazarContratosAlEmpleado(['v1', 'v2'], 'e6', {
    ...enlazaCon(nube), ahora: AHORA, idsConPorcentaje: ['v1'], porcentajeComision: 0,
  });
  assert.strictEqual(nube.leer('contratos/v1').porcentajeComision, 0, 'a la pedida, el 0 de Wilder como número');
  assert.equal(nube.leer('contratos/v2').porcentajeComision, 5, 'a la que no se pidió, no');
  assert.equal(nube.leer('contratos/v2').empleadoId, 'e6', 'pero las dos quedan enlazadas');
});

test('enlazarContratosAlEmpleado: pedir cambiar el porcentaje sin decir cuál es no escribe nada', async () => {
  const nube = nubeConViejas();
  await assert.rejects(
    enlazarContratosAlEmpleado(['v1'], 'e6', { ...enlazaCon(nube), idsConPorcentaje: ['v1'], porcentajeComision: undefined }),
    /porcentaje del empleado/,
  );
  assert.equal(nube.escrituras().length, 0);
  assert.equal(nube.leer('contratos/v1').empleadoId ?? null, null);
});

test('enlazarContratosAlEmpleado: sin empleado o sin rentas se niega; si un contrato ya no existe, ninguno se enlaza', async () => {
  const nube = nubeConViejas();
  await assert.rejects(enlazarContratosAlEmpleado(['v1'], '', enlazaCon(nube)), /Falta escoger a qué empleado/);
  await assert.rejects(enlazarContratosAlEmpleado([], 'e6', enlazaCon(nube)), /No hay rentas que enlazar/);
  await assert.rejects(enlazarContratosAlEmpleado(['v1', 'borrado'], 'e6', enlazaCon(nube)), /no existe/);
  assert.equal(nube.leer('contratos/v1').empleadoId ?? null, null, 'todo o nada');
});

test('enlazar y volver a enlazar no daña nada (repetirlo termina lo que faltó)', async () => {
  const nube = nubeConViejas();
  await enlazarContratosAlEmpleado(['v1', 'v2'], 'e6', { ...enlazaCon(nube), ahora: AHORA });
  await enlazarContratosAlEmpleado(['v1', 'v2'], 'e6', { ...enlazaCon(nube), ahora: AHORA + 1 });
  assert.equal(nube.leer('contratos/v2').empleadoId, 'e6');
});

test('enlazarContratosAlEmpleado: sin sesión de dinero se niega y no escribe nada — ni siquiera el enlace', async () => {
  const nube = nubeConViejas();
  await assert.rejects(enlazarContratosAlEmpleado(['v1'], 'e6', enlazaCon(nube, { dbDinero: () => null })), { message: MENSAJE_ENLACE_SIN_DINERO });
  assert.equal(nube.escrituras().length, 0);
  assert.equal(nube.llamadas.filter(([op]) => op === 'commit').length, 0);
});
