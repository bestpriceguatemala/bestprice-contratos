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
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';
import { construirContrato, entradaDeAvisos } from '../js/pantallas/sacarCarro.js';
import { readFileSync } from 'node:fs';
import { carroPropio, carroConServicios } from './fixtures/carroConServicios.mjs';

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

// ---------------------------------------------------------------------------
// H-4: «Este cliente ya devolvió tarde» casi nunca se prendía
//
// Prueba del sistema (7 oct 2026): Juan devolvió 3 días tarde, pagó y el contrato quedó CERRADO; al sacarle
// otro carro no salía nada, porque el aviso solo miraba los contratos abiertos. El dueño decidió mirar el
// último año de rentas de ese cliente (nucleo/historial.js), leído aparte (`cargarContratosDelCliente`) y
// entregado aquí como `historialDelCliente`: `{ datos, fallo }`, o `null` si todavía no llega.
// ---------------------------------------------------------------------------

// Juan, con el contrato que la prueba del sistema le dejó: sale el 3 ago, debía volver el 7, volvió el 10.
const juanTardeYCerrado = () => contratoDeUnCarro({
  id: 'c-juan', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 0,
});
const hoyDeLaPrueba = { ...base, hoy: '2026-10-11' };

test('H-4: Juan devolvió 3 días tarde en un contrato ya cerrado y pagado — sacarle otro carro lo avisa', () => {
  const cerrado = juanTardeYCerrado();
  assert.equal(cerrado.estado, 'cerrado', 'el escenario: ya pagó y cerró, así que NO está entre los abiertos');
  const r = avisosDeSalida({
    ...hoyDeLaPrueba, contratosDelCliente: [], historialDelCliente: { datos: [cerrado], fallo: false },
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'medio');
  assert.equal(r[0].mensaje, 'Este cliente ya devolvió tarde 1 vez en el último año.');
});

test('H-4: la cuenta dice «en el último año»: la cifra no es de toda la vida del cliente', () => {
  const dos = [juanTardeYCerrado(), contratoDeUnCarro({
    id: 'c-juan-2', fechaSalida: '2026-09-01', dias: 2, recibidoEl: '2026-09-05', danos: 0,
  })];
  const r = avisosDeSalida({ ...hoyDeLaPrueba, historialDelCliente: { datos: dos, fallo: false } });
  assert.equal(r[0].mensaje, 'Este cliente ya devolvió tarde 2 veces en el último año.');
});

test('H-4: una devolución tarde de hace más de un año no avisa', () => {
  const vieja = contratoDeUnCarro({
    id: 'c-vieja', fechaSalida: '2025-08-03', dias: 4, recibidoEl: '2025-08-10', danos: 0,
  });
  assert.deepEqual(avisosDeSalida({ ...hoyDeLaPrueba, historialDelCliente: { datos: [vieja], fallo: false } }), []);
});

test('H-4: un cliente que siempre devolvió a tiempo no avisa nada', () => {
  const aTiempo = contratoDeUnCarro({ id: 'c-bien', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-07', danos: 0 });
  assert.deepEqual(avisosDeSalida({ ...hoyDeLaPrueba, historialDelCliente: { datos: [aTiempo], fallo: false } }), []);
});

test('H-4: el contrato abierto que sale en las dos lecturas (abiertos y último año) cuenta una sola vez', () => {
  const abierto = contratoDeUnCarro({ id: 'c-debe', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 200 });
  const r = avisosDeSalida({
    ...hoyDeLaPrueba, contratosDelCliente: [abierto], historialDelCliente: { datos: [abierto, juanTardeYCerrado()], fallo: false },
  });
  const tarde = r.find((a) => /devolvió tarde/.test(a.mensaje));
  assert.equal(tarde.mensaje, 'Este cliente ya devolvió tarde 2 veces en el último año.');
});

// «Un historial que no se pudo leer» no es «un historial limpio»: es la confusión que este sistema ya pagó
// varias veces (resultadoLectura). Un récord limpio que el cliente no se ha ganado es una falsa tranquilidad.
test('H-4: si el historial no se pudo leer y no se encontró nada, DICE que no se pudo revisar — no se calla', () => {
  const r = avisosDeSalida({ ...hoyDeLaPrueba, historialDelCliente: { datos: [], fallo: true } });
  assert.equal(r.length, 1, 'un historial sin leer no es un historial limpio');
  assert.equal(r[0].nivel, 'medio');
  assert.match(r[0].mensaje, /No se pudo revisar si este cliente ya devolvió tarde/);
});

test('H-4: si el historial no se pudo leer pero ya se sabe de una tarde, avisa «al menos» y dice por qué', () => {
  const abierto = contratoDeUnCarro({ id: 'c-debe', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 200 });
  const r = avisosDeSalida({
    ...hoyDeLaPrueba, contratosDelCliente: [abierto], historialDelCliente: { datos: [], fallo: true },
  });
  const tarde = r.find((a) => /devolvió tarde/.test(a.mensaje));
  assert.equal(tarde.mensaje, 'Este cliente ya devolvió tarde al menos 1 vez en el último año (no se pudo leer todo su historial).');
  assert.equal(r.filter((a) => /No se pudo revisar/.test(a.mensaje)).length, 0, 'una sola frase, no dos');
});

test('H-4: mientras el historial no llega (o no hay cliente) no se inventa ni un fallo ni una tranquilidad', () => {
  assert.deepEqual(avisosDeSalida({ ...hoyDeLaPrueba, historialDelCliente: null }), []);
  assert.deepEqual(avisosDeSalida(hoyDeLaPrueba), []);
});

test('H-4: los contratos abiertos siguen avisando aunque no llegue ningún historial (nada de lo que ya funcionaba se pierde)', () => {
  const abierto = contratoDeUnCarro({ id: 'c-debe', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 200 });
  const r = avisosDeSalida({ ...hoyDeLaPrueba, contratosDelCliente: [abierto] });
  assert.ok(r.some((a) => /devolvió tarde 1 vez/.test(a.mensaje)));
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

// ---------- El carro que ya volvió no choca con lo que se había previsto ----------
//
// El dueño: «recibí el carro antes y ya quedó libre, pero me sigue apareciendo que
// lo devuelven el 12». Un contrato de la renta del 3 al 12 de octubre, recibido el
// 6, sigue ABIERTO mientras le quede un saldo (aquí, Q200 de daños) y por eso entra
// a `contratosDelCarro`; el aviso comparaba contra la devolución PREVISTA y le
// pintaba un rojo falso a un carro que estaba en el patio. Un aviso que se
// equivoca siempre enseña a ignorar los que no se equivocan.
//
// Los contratos se arman con las funciones que arman los reales
// (pruebas/fixtures/contratoDeUnCarro.mjs): el regreso es `cierre.fechaReal`.

const recibidoElSeis = () => contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06' });
const rentaDelSiete = { ...contrato, fechaSalida: '2026-10-07', dias: 3, devolucionPrevista: '2026-10-10' };

test('un carro recibido antes de lo previsto NO avisa que está comprometido hasta la fecha prevista', () => {
  const abierto = recibidoElSeis();
  assert.equal(abierto.estado, 'devuelto', 'el escenario: el contrato sigue abierto');
  assert.equal(abierto.devolucionPrevista, '2026-10-12');
  assert.deepEqual(avisosDeSalida({
    ...base, hoy: '2026-10-07', contrato: rentaDelSiete, contratosDelCarro: [abierto],
  }), []);
});

test('lo que SÍ se cruza con el tiempo que el carro estuvo afuera sigue avisando, y dice el día real de regreso', () => {
  const abierto = recibidoElSeis();
  // Una renta del 5 al 8 empieza antes de que el carro volviera, el 6: choque de verdad.
  const r = avisosDeSalida({
    ...base,
    hoy: '2026-10-05',
    contrato: { ...contrato, fechaSalida: '2026-10-05', dias: 3, devolucionPrevista: '2026-10-08' },
    contratosDelCarro: [abierto],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /3 oct 2026 al 6 oct 2026/, 'el día en que de verdad volvió');
  assert.doesNotMatch(r[0].mensaje, /12 oct/, 'no la fecha prevista, que ya no es cierta');
});

test('el día en que el carro volvió puede volver a salir: tocarse no es cruzarse', () => {
  assert.deepEqual(avisosDeSalida({
    ...base,
    hoy: '2026-10-06',
    contrato: { ...contrato, fechaSalida: '2026-10-06', dias: 2, devolucionPrevista: '2026-10-08' },
    contratosDelCarro: [recibidoElSeis()],
  }), []);
});

test('un carro recibido TARDE sí estuvo afuera hasta el día real: una renta intermedia avisa con esa fecha', () => {
  // Debía volver el 5 y volvió el 8. Una renta del 6 al 9 no choca con lo previsto,
  // pero el carro de verdad no estaba: el aviso tiene que decirlo.
  const tarde = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 2, recibidoEl: '2026-10-08' });
  const r = avisosDeSalida({
    ...base,
    hoy: '2026-10-06',
    contrato: { ...contrato, fechaSalida: '2026-10-06', dias: 3, devolucionPrevista: '2026-10-09' },
    contratosDelCarro: [tarde],
  });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /3 oct 2026 al 8 oct 2026/);
});

test('un carro que sigue afuera con la fecha prevista ya vencida SÍ choca con una renta que cae hoy', () => {
  // Debía volver el 8 y hoy es el 10: no ha vuelto, es el carro con menos
  // probabilidad de estar libre. Una renta del 9 al 12 incluye el día de hoy.
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  const r = avisosDeSalida({
    ...base,
    hoy: '2026-10-10',
    contrato: { ...contrato, fechaSalida: '2026-10-09', dias: 3, devolucionPrevista: '2026-10-12' },
    contratosDelCarro: [atrasado],
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /debía volver el 8 oct 2026 y sigue afuera/);
  assert.doesNotMatch(r[0].mensaje, /3 oct 2026 al 8 oct 2026/, 'no dice que terminó el 8: no ha vuelto');
});

test('un carro atrasado avisa si la renta empieza HOY: hoy sigue afuera y no puede salir otra vez', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  const r = avisosDeSalida({
    ...base,
    hoy: '2026-10-10',
    contrato: { ...contrato, fechaSalida: '2026-10-10', dias: 3, devolucionPrevista: '2026-10-13' },
    contratosDelCarro: [atrasado],
  });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /3 oct 2026, que debía volver el 8 oct 2026 y sigue afuera/);
});

test('un carro atrasado no avisa por rentas que empiezan después de hoy: no se sabe cuándo volverá', () => {
  const atrasado = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 5 });
  assert.deepEqual(avisosDeSalida({
    ...base,
    hoy: '2026-10-10',
    contrato: { ...contrato, fechaSalida: '2026-10-14', dias: 3, devolucionPrevista: '2026-10-17' },
    contratosDelCarro: [atrasado],
  }), []);
  // Ni siquiera la de mañana: hoy es lo último que se sabe.
  assert.deepEqual(avisosDeSalida({
    ...base,
    hoy: '2026-10-10',
    contrato: { ...contrato, fechaSalida: '2026-10-11', dias: 3, devolucionPrevista: '2026-10-14' },
    contratosDelCarro: [atrasado],
  }), []);
});

test('un contrato a tiempo (el carro sigue afuera dentro de lo previsto) avisa con su fecha prevista, como siempre', () => {
  const aTiempo = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9 });
  const r = avisosDeSalida({
    ...base, hoy: '2026-10-05', contrato: { ...contrato, fechaSalida: '2026-10-08', dias: 2, devolucionPrevista: '2026-10-10' }, contratosDelCarro: [aTiempo],
  });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /3 oct 2026 al 12 oct 2026/);
});

// Prueba del sistema (7 oct 2026): un carro marcado «fuera de servicio» (sin botón «Sacar» en la
// flota) se abría igual desde el «Sacar carro» de una reservación, o escribiendo la dirección, y la
// salida no decía nada. El carro es el que guarda carros.js al marcarlo (fueraDeServicio y
// motivoFueraDeServicio), no un objeto con las llaves a mano.
const carroEnElTaller = {
  id: 'v4', codigo: 4, placas: 'P-400DDD', tipo: 'Sedán', marca: 'Kia', linea: 'Rio', color: 'Negro', modelo: '2023',
  propiedad: 'Propio', fueraDeServicio: true, motivoFueraDeServicio: 'En el taller: cambio de frenos',
};

test('avisa, en rojo y con el motivo, si el carro está fuera de servicio', () => {
  const r = avisosDeSalida({ ...base, carro: carroEnElTaller });
  assert.equal(r.length, 1);
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'Este carro está fuera de servicio: En el taller: cambio de frenos.');
});

test('fuera de servicio sin motivo escrito avisa igual, sin dejar un «: » colgando', () => {
  const r = avisosDeSalida({ ...base, carro: { ...carroEnElTaller, motivoFueraDeServicio: '  ' } });
  assert.equal(r[0].mensaje, 'Este carro está fuera de servicio.');
});

test('un carro ya habilitado, o sin esa marca, no avisa nada (carros.js guarda fueraDeServicio: false al habilitarlo)', () => {
  assert.deepEqual(avisosDeSalida({ ...base, carro: { ...carroEnElTaller, fueraDeServicio: false } }), []);
  assert.deepEqual(avisosDeSalida({ ...base, carro: { ...carroEnElTaller, fueraDeServicio: false, motivoFueraDeServicio: '' } }), []);
  assert.deepEqual(avisosDeSalida({ ...base, carro: null }), [], 'un carro ajeno no tiene ficha en la flota');
});

// ---------- El mantenimiento del carro (§12b) ----------
//
// «Cuando falte poco, aparece donde ya aparecen los demás avisos». El carro llega a `avisosDeSalida` tal como está en la
// flota —con sus `servicios[]`— y el kilometraje de ahora es el que el mostrador escribe como kilometraje de salida. Aquí
// el borrador sale de `construirContrato` y el camino completo de `entradaDeAvisos` (la función que arma lo que «Sacar
// carro» le pasa a los avisos, y que esta tarea no toca): si alguien le quita el carro o el borrador, esto falla.
const HOY_MANT = '2026-10-16';
const ACEITE_A_LOS_15000 = () => carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY_MANT);
const ACEITE_DE_JULIO = () => carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-07-03', km: 15000 }], HOY_MANT);
const borradorDe = (carroDeLaFlota, kmSalida) => construirContrato({
  id: null, numero: null, cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' }, ajeno: false, carro: carroDeLaFlota, carroAjeno: null,
  duenoId: null, fechaSalida: HOY_MANT, dias: 3, precioDia: 700, kmSalida, tarjetas: [], forma: 'efectivo', porcentajeTarjeta: 0, montoPago: 2100,
  rentadoPor: 'Ana', porcentajeComision: 5,
});
const avisosDeLaSalida = (carroDeLaFlota, kmSalida, { ajeno = false } = {}) => avisosDeSalida(entradaDeAvisos({
  borrador: borradorDe(carroDeLaFlota, kmSalida),
  cliente: { id: 'k1', licenciaExpira: '2030-02-09', documentoExpira: '2030-02-09' },
  carro: carroDeLaFlota,
  ajeno,
  carroId: carroDeLaFlota.id,
  flota: [carroDeLaFlota],
  hoy: HOY_MANT,
}));

test('mantenimiento: al escribir el kilometraje de salida, si al carro ya le toca servicio sale el aviso, de nivel medio', () => {
  const r = avisosDeLaSalida(ACEITE_A_LOS_15000(), 20320);
  assert.deepEqual(r, [{
    nivel: 'medio',
    mensaje: 'A este carro le toca servicio: aceite y filtro (tocaba a los 20,000 km y el carro anda en 20,320).',
  }]);
});

test('mantenimiento: a 500 km avisa «pronto»; a 501, no', () => {
  assert.deepEqual(avisosDeLaSalida(ACEITE_A_LOS_15000(), 19500).map((a) => a.mensaje), [
    'A este carro le toca servicio pronto: aceite y filtro (faltan 500 km, a los 20,000).',
  ]);
  assert.deepEqual(avisosDeLaSalida(ACEITE_A_LOS_15000(), 19499), []);
});

test('mantenimiento: con el kilometraje de salida sin escribir (0) no inventa nada, pero el tiempo sí avisa', () => {
  assert.deepEqual(avisosDeLaSalida(ACEITE_A_LOS_15000(), 0), [], 'sin kilometraje y con el plazo lejos: callado, no «faltan 20,000 km»');
  const r = avisosDeLaSalida(ACEITE_DE_JULIO(), 0);
  assert.deepEqual(r.map((a) => a.mensaje), ['A este carro le toca servicio: aceite y filtro (tocaba el 3 oct 2026).']);
  assert.ok(!/km/.test(r[0].mensaje), 'no menciona kilómetros que nadie leyó');
});

test('mantenimiento: un carro sin servicios anotados no avisa de nada, por kilometraje que tenga el borrador', () => {
  assert.deepEqual(avisosDeLaSalida(carroPropio(), 99000), []);
});

test('mantenimiento: un carro AJENO no lleva mantenimiento (llega como null por entradaDeAvisos)', () => {
  assert.deepEqual(avisosDeLaSalida(ACEITE_DE_JULIO(), 21000, { ajeno: true }), []);
});

test('mantenimiento: va después de los avisos serios (la licencia vencida va primero)', () => {
  const vencida = { id: 'k1', licenciaExpira: '2026-08-01', documentoExpira: '2030-02-09' };
  const carroDeLaFlota = ACEITE_DE_JULIO();
  const r = avisosDeSalida({
    ...entradaDeAvisos({
      borrador: borradorDe(carroDeLaFlota, 21000), cliente: vencida, carro: carroDeLaFlota, carroId: 'v1', flota: [carroDeLaFlota], hoy: HOY_MANT,
    }),
  });
  assert.deepEqual(r.map((a) => a.nivel), ['alto', 'medio']);
  assert.match(r[0].mensaje, /licencia/i);
  assert.match(r[1].mensaje, /le toca servicio/);
});

test('mantenimiento: avisosDeSalida a secas, sin servicios en el carro, sigue sin decir nada (nada de lo de antes cambió)', () => {
  assert.deepEqual(avisosDeSalida({ ...base, contrato: { ...contrato, kmSalida: 999999 } }), []);
});

// H-4, el cableado de «Sacar carro». La regla de arriba estaba hecha y probada, pero NADA le entregaba el historial: `entradaDeAvisos` no lo
// recibía ni lo pasaba, y `cargarContratosDelCliente`, que estos comentarios nombran, nunca existió. En pantalla Juan (3 días tarde, contrato
// CERRADO) seguía sin avisar. «Sacar carro» ya lee TODA la colección de contratos (y los guarda en la copia local) y tiraba los cerrados en
// memoria; ahora los conserva y se los da a los avisos como `historial`, y `entradaDeAvisos` saca de ahí lo de ESE cliente.
const ELEGIDO = { id: 'k1', licenciaExpira: '2030-02-09', documentoExpira: '2030-02-09' };
const sacandoAJuan = ({ historial, contratosAbiertos = [], cliente = ELEGIDO } = {}) => avisosDeSalida(entradaDeAvisos({
  borrador: borradorDe(carroPropio(), 0), cliente, carro: carroPropio(), carroId: 'v1', flota: [carroPropio()], contratosAbiertos, historial, hoy: HOY_MANT,
}));
const de = (contrato, clienteId) => ({ ...contrato, clienteId });

test('H-4, «Sacar carro»: sacarle otro carro a Juan, que devolvió tarde en un contrato ya CERRADO, lo avisa', () => {
  const cerrado = juanTardeYCerrado();
  assert.equal(cerrado.estado, 'cerrado');
  const r = sacandoAJuan({ historial: { datos: [cerrado], fallo: false } });
  assert.deepEqual(r.map((a) => a.mensaje), ['Este cliente ya devolvió tarde 1 vez en el último año.']);
});

test('H-4, «Sacar carro»: del historial (que trae los contratos de TODOS) cuenta solo lo de ESE cliente', () => {
  const deOtro = de(juanTardeYCerrado(), 'k2');
  assert.deepEqual(sacandoAJuan({ historial: { datos: [deOtro], fallo: false } }), []);
  const mezclado = [deOtro, de(juanTardeYCerrado(), 'k1')];
  assert.deepEqual(sacandoAJuan({ historial: { datos: mezclado, fallo: false } }).map((a) => a.mensaje), ['Este cliente ya devolvió tarde 1 vez en el último año.']);
});

test('H-4, «Sacar carro»: una lectura que falló nunca se dibuja como un cliente sin historial, y mientras no llega no se inventa nada', () => {
  assert.match(sacandoAJuan({ historial: { datos: [], fallo: true } })[0].mensaje, /No se pudo revisar si este cliente ya devolvió tarde/);
  assert.deepEqual(sacandoAJuan({ historial: null }), []);
  assert.deepEqual(sacandoAJuan({}), []);
  // sin cliente escogido no hay historial de nadie
  assert.deepEqual(sacandoAJuan({ historial: { datos: [juanTardeYCerrado()], fallo: false }, cliente: null }), []);
});

test('H-4, «Sacar carro»: la pantalla lee TODOS los contratos y se los pasa a los avisos como historial (no solo los abiertos)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/sacarCarro.js', import.meta.url), 'utf8');
  assert.match(fuente, /cargarTodosLosContratos\(/, 'la lectura que conserva los cerrados');
  assert.doesNotMatch(fuente, /cargarContratosAbiertos\(/, 'la que los tira antes de que nadie los vea');
  assert.match(fuente, /avisosDeSalida\(entradaDeAvisos\(\{[^}]*\bhistorial\b/s, 'y se los da a la regla (la llamada de la pantalla, no la definición de la función)');
  assert.match(fuente, /contratosAbiertosDe\(/, 'los abiertos salen de esa misma lectura, con la misma regla de «abierto» que datos.js');
});
