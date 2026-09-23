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
});

test('avisa si el DPI o pasaporte está vencido', () => {
  const r = avisosDeSalida({ ...base, cliente: { ...cliente, documentoExpira: '2026-08-19' } });
  assert.match(mensajes(r).join(' '), /documento/i);
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
  assert.match(r[0].mensaje, /2026-08-21/);
});
