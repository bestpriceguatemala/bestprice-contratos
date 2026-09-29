// Pruebas de la pantalla del calendario (calendario.js): solo la parte pura,
// sin DOM — igual que reservas.test.mjs y flota.test.mjs.
//
// Lo que más importa probar: que el mes no derive (retroceder y volver a
// avanzar aterriza en el mismo mes, diciembre↔enero rueda el año) y los
// textos que arma la pantalla (carro o tipo, saldo pendiente o ya pagó) —
// nunca inventando un número, siempre tomándolo de resumen() (nucleo/contrato.js).
//
// Los contratos de prueba llevan la forma real de un contrato guardado (§7b
// del diseño: numero, clienteId, clienteNombre, carroId, carroPlacas,
// carroDescripcion, fechaSalida, dias, devolucionPrevista, precioDia,
// garantiaMonto, estado, pagos[], cierre{}), nunca campos inventados — la
// razón exacta por la que §7b existe: una prueba escrita sobre datos
// inventados pasa en verde sin decir nada del sistema.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esFechaValida, mesDeFecha, mesSiguiente, mesAnterior, tituloMes,
  descripcionVehiculoReserva, textoSaldoContrato,
} from '../js/pantallas/calendario.js';

// ---------- esFechaValida / mesDeFecha ----------

test('esFechaValida: acepta YYYY-MM-DD, rechaza lo demás', () => {
  assert.equal(esFechaValida('2026-09-29'), true);
  assert.equal(esFechaValida('2026-9-29'), false);
  assert.equal(esFechaValida(''), false);
  assert.equal(esFechaValida(null), false);
  assert.equal(esFechaValida(undefined), false);
});

test('mesDeFecha: saca el mes de una fecha válida, vacío si no lo es', () => {
  assert.equal(mesDeFecha('2026-09-29'), '2026-09');
  assert.equal(mesDeFecha('nueva'), '');
  assert.equal(mesDeFecha(null), '');
});

// ---------- mesSiguiente / mesAnterior: que el mes no derive ----------
//
// El riesgo que marca el brief: "Stepping back from March and forward again
// has to land on March, and December→January must roll the year." Nada de
// esto pasa por Date con un día del mes que podría no existir en el vecino.

test('mesSiguiente: rueda el mes dentro del año', () => {
  assert.equal(mesSiguiente('2026-03'), '2026-04');
});

test('mesSiguiente: diciembre rueda a enero del año que sigue', () => {
  assert.equal(mesSiguiente('2026-12'), '2027-01');
});

test('mesAnterior: rueda el mes dentro del año', () => {
  assert.equal(mesAnterior('2026-04'), '2026-03');
});

test('mesAnterior: enero rueda a diciembre del año anterior', () => {
  assert.equal(mesAnterior('2027-01'), '2026-12');
});

test('mesSiguiente y mesAnterior: retroceder y volver a avanzar aterriza en el mismo mes', () => {
  const marzo = '2026-03';
  assert.equal(mesSiguiente(mesAnterior(marzo)), marzo);
  assert.equal(mesAnterior(mesSiguiente(marzo)), marzo);
});

test('mesSiguiente y mesAnterior: el mismo viaje redondo cruzando el fin de año', () => {
  const diciembre = '2026-12';
  assert.equal(mesAnterior(mesSiguiente(diciembre)), diciembre);
});

test('mesSiguiente/mesAnterior: mes inválido no revienta, se queda igual', () => {
  assert.equal(mesSiguiente(''), '');
  assert.equal(mesAnterior('basura'), 'basura');
});

// ---------- tituloMes ----------

test('tituloMes: el mes en el texto que lee el dueño, con mayúscula inicial', () => {
  assert.equal(tituloMes('2026-09'), 'Septiembre 2026');
  assert.equal(tituloMes('2026-01'), 'Enero 2026');
  assert.equal(tituloMes('2026-12'), 'Diciembre 2026');
});

test('tituloMes: mes inválido no revienta, da vacío', () => {
  assert.equal(tituloMes(''), '');
  assert.equal(tituloMes('2026-13'), '');
});

// ---------- descripcionVehiculoReserva: carro o tipo ----------

const flota = [
  { id: 'v1', placas: 'P-111AAA', marca: 'Mitsubishi', linea: 'Montero', tipo: 'SUV' },
];

test('descripcionVehiculoReserva: con carro exacto en la flota, placas y descripción', () => {
  const r = { carroId: 'v1', carroPlacas: 'P-111AAA' };
  assert.equal(descripcionVehiculoReserva(r, flota), 'P-111AAA · Mitsubishi · Montero');
});

test('descripcionVehiculoReserva: con carro exacto que ya no está en la flota, cae a las placas guardadas', () => {
  const r = { carroId: 'v9', carroPlacas: 'P-999ZZZ' };
  assert.equal(descripcionVehiculoReserva(r, flota), 'P-999ZZZ');
});

test('descripcionVehiculoReserva: sin carro exacto, muestra el tipo', () => {
  assert.equal(descripcionVehiculoReserva({ tipoVehiculo: 'MICROBÚS' }, flota), 'MICROBÚS');
});

test('descripcionVehiculoReserva: ni carro ni tipo, no revienta', () => {
  assert.equal(descripcionVehiculoReserva({}, flota), 'Sin tipo');
  assert.equal(descripcionVehiculoReserva(null, flota), 'Sin tipo');
});

// ---------- textoSaldoContrato: nunca inventa el número ----------
//
// El contrato de prueba trae la forma real (§7b): dias, precioDia, pagos[]
// con forma/monto/porcentajeTarjeta, tal como los lee resumen() en
// nucleo/contrato.js — nada de un campo "saldo" escrito a mano en el fixture.

test('textoSaldoContrato: con saldo pendiente, dice cuánto (tomado de resumen())', () => {
  const contrato = {
    dias: 3, precioDia: 300, pagos: [{ monto: 400, forma: 'efectivo' }],
  };
  // subtotal = 900, pagado = 400, saldo = 500.
  assert.equal(textoSaldoContrato(contrato), 'Pendiente de pagar Q500.00');
});

test('textoSaldoContrato: saldo en cero, dice que ya pagó', () => {
  const contrato = {
    dias: 2, precioDia: 250, pagos: [{ monto: 500, forma: 'efectivo' }],
  };
  assert.equal(textoSaldoContrato(contrato), 'Ya pagó');
});

test('textoSaldoContrato: un pago anulado no cuenta (mismo criterio que resumen())', () => {
  const contrato = {
    dias: 1, precioDia: 300,
    pagos: [{ monto: 300, forma: 'efectivo', anulado: true }],
  };
  // El pago anulado no cubre nada: sigue debiendo los Q300 completos.
  assert.equal(textoSaldoContrato(contrato), 'Pendiente de pagar Q300.00');
});
