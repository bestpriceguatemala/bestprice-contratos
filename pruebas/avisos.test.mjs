// Pruebas de los avisos al sacar un carro.
//
// Son las cosas que el Excel deja pasar y que cuestan dinero: rentarle a alguien
// con la licencia vencida, rentarle al que quedó debiendo, o prometer un carro
// que ya está comprometido.
//
// El precio NO se avisa: el dueño lo pone en cada renta y el sistema no opina.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosDeSalida } from '../js/nucleo/avisos.js';

const cliente = { id: 'k1', licenciaExpira: '2030-02-09', documentoExpira: '2030-02-09' };
const carro = { id: 'v1', placas: 'P-234IFN' };
const contrato = { carroId: 'v1', dias: 4, precioDia: 700, fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24' };
const base = { cliente, carro, contrato, contratosDelCliente: [], contratosDelCarro: [], hoy: '2026-08-20' };
const mensajes = (r) => r.map((a) => a.mensaje);

test('un contrato normal no dispara ningún aviso', () => {
  assert.deepEqual(avisosDeSalida(base), []);
});

test('avisa si la licencia está vencida', () => {
  const r = avisosDeSalida({ ...base, cliente: { ...cliente, licenciaExpira: '2026-08-01' } });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /licencia/i);
  // Minor de la revisión final: mostraba la fecha ISO cruda ('2026-08-01')
  // en vez del formato que lee el dueño.
  assert.match(r[0].mensaje, /1 ago 2026/);
  assert.doesNotMatch(r[0].mensaje, /2026-08-01/);
});

test('avisa si el DPI o pasaporte está vencido', () => {
  const r = avisosDeSalida({ ...base, cliente: { ...cliente, documentoExpira: '2026-08-19' } });
  assert.match(mensajes(r).join(' '), /documento/i);
  assert.match(mensajes(r).join(' '), /19 ago 2026/);
});

test('avisa si el cliente quedó debiendo de otra renta', () => {
  const deudor = [{
    id: 'c9', dias: 2, precioDia: 600,
    devolucionPrevista: '2026-07-10',
    cierre: { fechaReal: '2026-07-10' },
    pagos: [{ monto: 400, porcentajeTarjeta: 0 }],
  }];
  const r = avisosDeSalida({ ...base, contratosDelCliente: deudor });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /debe|saldo/i);
  assert.match(r[0].mensaje, /800/, 'dice cuánto debe');
  // Minor de la revisión final: usaba deuda.toFixed(2) (sin separador de
  // miles) en vez del formato de dinero del resto del sistema.
  assert.match(r[0].mensaje, /Q800\.00/);
});

// Revisión final (hallazgo de un solo renglón, efecto secundario de
// "saldo ya no se recorta en 0"): un sobrepago en un contrato no debe tapar
// la deuda real de otro. Antes de este arreglo, sumar los saldos tal cual
// (uno negativo, uno positivo) daba un neto que podía no disparar el aviso.
test('un sobrepago en un contrato no tapa la deuda real de otro (no se netean)', () => {
  const sobrepagado = {
    id: 'c10', dias: 4, precioDia: 700,
    devolucionPrevista: '2026-07-05',
    cierre: { fechaReal: '2026-07-05' },
    pagos: [{ monto: 3300, porcentajeTarjeta: 0 }], // pagó Q500 de más (subtotal 2800)
  };
  const debiendo = {
    id: 'c11', dias: 1, precioDia: 300,
    devolucionPrevista: '2026-07-12',
    cierre: { fechaReal: '2026-07-12' },
    pagos: [], // debe los Q300 completos
  };
  const r = avisosDeSalida({ ...base, contratosDelCliente: [sobrepagado, debiendo] });
  assert.equal(r[0]?.nivel, 'alto');
  assert.match(r[0]?.mensaje ?? '', /300/, 'la deuda real, no el neto (-200, que no avisaría nada)');
});

test('avisa si el cliente ya devolvió tarde antes', () => {
  const tarde = [{
    id: 'c8', dias: 2, precioDia: 600,
    devolucionPrevista: '2026-07-08',
    cierre: { fechaReal: '2026-07-10' },
    pagos: [{ monto: 2400, porcentajeTarjeta: 0 }],
    garantiaLiberada: true,
  }];
  const r = avisosDeSalida({ ...base, contratosDelCliente: tarde });
  assert.equal(r[0].nivel, 'medio');
  assert.match(r[0].mensaje, /tarde/i);
  assert.match(r[0].mensaje, /1 vez/, 'singular cuando es una sola vez');
});

test('avisa si el carro ya está comprometido en esas fechas', () => {
  const encima = [{ id: 'c7', carroId: 'v1', fechaSalida: '2026-08-22', devolucionPrevista: '2026-08-27' }];
  const r = avisosDeSalida({ ...base, contratosDelCarro: encima });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /otro contrato|comprometido/i);
});

test('no avisa si las fechas no se enciman', () => {
  const despues = [{ id: 'c7', carroId: 'v1', fechaSalida: '2026-08-25', devolucionPrevista: '2026-08-28' }];
  assert.deepEqual(avisosDeSalida({ ...base, contratosDelCarro: despues }), []);
});

test('los avisos altos van primero', () => {
  const tarde = [{
    id: 'c8', dias: 2, precioDia: 600,
    devolucionPrevista: '2026-07-08',
    cierre: { fechaReal: '2026-07-10' },
    pagos: [{ monto: 2400, porcentajeTarjeta: 0 }],
    garantiaLiberada: true,
  }];
  const r = avisosDeSalida({
    ...base,
    cliente: { ...cliente, licenciaExpira: '2026-08-01' },
    contratosDelCliente: tarde,
  });
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[r.length - 1].nivel, 'medio');
});

test('una renta seguida el mismo día no es un choque', () => {
  // El carro regresa el 20 en la mañana y vuelve a salir el 20 en la tarde:
  // es el día a día del negocio, no un carro comprometido dos veces.
  const anterior = [{ id: 'c7', carroId: 'v1', fechaSalida: '2026-08-15', devolucionPrevista: '2026-08-20' }];
  const seguido = {
    ...base,
    contrato: { ...contrato, fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24' },
    contratosDelCarro: anterior,
  };
  assert.deepEqual(avisosDeSalida(seguido), []);
});

test('un día de traslape sí es un choque', () => {
  const anterior = [{ id: 'c7', carroId: 'v1', fechaSalida: '2026-08-15', devolucionPrevista: '2026-08-21' }];
  const encimado = {
    ...base,
    contrato: { ...contrato, fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24' },
    contratosDelCarro: anterior,
  };
  const r = avisosDeSalida(encimado);
  assert.equal(r[0].nivel, 'alto');
  // Revisión de la tarea 8: mostraba la fecha ISO cruda ('2026-08-21') en vez
  // del formato que lee el dueño — mismo arreglo que ya tenían licencia y
  // documento vencidos, aplicado aquí para que las dos fechas de este aviso
  // se lean igual que el resto de la pantalla.
  assert.match(r[0].mensaje, /21 ago 2026/);
  assert.doesNotMatch(r[0].mensaje, /2026-08-21/);
});

// ---------- El carro comprometido por una reservación ----------
//
// Las reservaciones se leen con la forma real de un documento guardado
// (§7b del diseño): todos los campos de la lista canónica, no solo los que
// usa avisosDeSalida — para que estas pruebas comprueben el sistema y no una
// forma inventada a modo.
const reservaBase = {
  id: 'r1',
  clienteId: 'k2',
  clienteNombre: 'Ana López',
  telefono: '5555-1234',
  fechaSalida: '2026-08-22',
  dias: 3,
  devolucionPrevista: '2026-08-25',
  carroId: 'v1',
  carroPlacas: 'P-234IFN',
  tipoVehiculo: '',
  precioDia: 250,
  anticipo: 0,
  anticipoPagado: false,
  nota: '',
  cancelada: false,
  contratoId: null,
  estado: 'pendiente',
  actualizado: '2026-08-15T10:00:00.000Z',
};

test('avisa si el carro está apartado para otro cliente en esas fechas', () => {
  // El contrato base sale el 20 y regresa el 24; la reservación sale el 22:
  // se cruzan.
  const r = avisosDeSalida({ ...base, reservasDelCarro: [reservaBase] });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /Ana López/, 'dice para quién está apartado');
  assert.match(r[0].mensaje, /22 ago 2026/, 'dice desde cuándo, con textoFecha');
});

test('no avisa si las fechas de la reservación no se cruzan con el contrato', () => {
  const despues = { ...reservaBase, fechaSalida: '2026-08-26', devolucionPrevista: '2026-08-29' };
  assert.deepEqual(avisosDeSalida({ ...base, reservasDelCarro: [despues] }), []);
});

test('una reservación cancelada no avisa', () => {
  const cancelada = { ...reservaBase, cancelada: true, estado: 'cancelada' };
  assert.deepEqual(avisosDeSalida({ ...base, reservasDelCarro: [cancelada] }), []);
});

test('una reservación ya entregada no avisa, aunque también esté marcada cancelada', () => {
  // estadoReserva() (reserva.js) deja que contratoId mande sobre cancelada:
  // una cancelación tardía no debe borrar el aviso de un contrato que ya
  // existe... y tampoco debe inventar un choque contra sí misma.
  const entregada = { ...reservaBase, contratoId: 'c50', cancelada: true, estado: 'entregada' };
  assert.deepEqual(avisosDeSalida({ ...base, reservasDelCarro: [entregada] }), []);
});

test('una reserva seguida el mismo día no es un choque (tocarse no es cruzarse)', () => {
  // Mismo caso que la prueba de contratos, pero contra una reservación: el
  // carro sale el 20 (el contrato de este renglón) y la reservación previa
  // devuelve el 20 — no hay traslape real.
  const previa = { ...reservaBase, fechaSalida: '2026-08-16', devolucionPrevista: '2026-08-20' };
  assert.deepEqual(avisosDeSalida({ ...base, reservasDelCarro: [previa] }), []);
});

test('con varias reservaciones cruzadas, avisa de la que sale primero y cuántas más hay', () => {
  const masTarde = { ...reservaBase, id: 'r1', clienteNombre: 'Ana López', fechaSalida: '2026-08-23' };
  const primero = { ...reservaBase, id: 'r2', clienteNombre: 'Carlos Ruiz', fechaSalida: '2026-08-21', devolucionPrevista: '2026-08-24' };
  const r = avisosDeSalida({ ...base, reservasDelCarro: [masTarde, primero] });
  assert.equal(r.length, 1, 'una sola línea, no una pared de rojo');
  assert.match(r[0].mensaje, /Carlos Ruiz/, 'la que sale primero, no la que viene después');
  assert.match(r[0].mensaje, /21 ago 2026/);
  assert.match(r[0].mensaje, /1 reservación más/);
});

// Revisión de la tarea 8: la única prueba de varias reservaciones usaba
// exactamente dos, que cae en la rama singular ("1 reservación más") y nunca
// ejercita el plural — así se coló "reservaciónes" (con tilde, mal) en vez de
// "reservaciones". Con tres se entra a la rama que sí importaba probar.
test('con tres reservaciones cruzadas, el plural dice "reservaciones" (sin tilde)', () => {
  const masTarde = { ...reservaBase, id: 'r1', clienteNombre: 'Ana López', fechaSalida: '2026-08-23' };
  const primero = { ...reservaBase, id: 'r2', clienteNombre: 'Carlos Ruiz', fechaSalida: '2026-08-21', devolucionPrevista: '2026-08-24' };
  const otraMas = { ...reservaBase, id: 'r3', clienteNombre: 'Diana Pérez', fechaSalida: '2026-08-22' };
  const r = avisosDeSalida({ ...base, reservasDelCarro: [masTarde, primero, otraMas] });
  assert.equal(r.length, 1, 'una sola línea, no una pared de rojo');
  assert.match(r[0].mensaje, /Carlos Ruiz/, 'la que sale primero');
  assert.match(r[0].mensaje, /21 ago 2026/);
  assert.match(r[0].mensaje, /2 reservaciones más/);
  assert.doesNotMatch(r[0].mensaje, /reservaciónes/, 'la tilde se cae en el plural: "reservaciones", no "reservaciónes"');
});
