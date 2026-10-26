// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en el dinero.
//
// Cada prueba de aquí nació de un mutante que SOBREVIVIÓ: se le metió a propósito un error al código
// (un `<` por `<=`, un `*` por `/`…) y las 2,589 pruebas de entonces seguían en verde. Aquí cada una
// falla con ese error puesto y pasa con el código bueno. El informe, con lo que le habría costado al
// dueño cada uno, está en .superpowers/auditoria-pruebas-2026-10-26.md.
//
// Los contratos salen de los constructores de verdad (pruebas/fixtures/contratoReal.mjs), no de objetos
// escritos a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { q } from '../js/nucleo/dinero.js';
import { construirContrato, conAnticipoComoPago } from '../js/pantallas/sacarCarro.js';
import { totalDeEstaCobranza } from '../js/pantallas/recibirCarro.js';
import { construirReserva } from '../js/nucleo/reserva.js';
import { lineasSalida, lineasDevolucion, resumen } from '../js/nucleo/contrato.js';
import { construirCierre, problemasDelCierre } from '../js/nucleo/cierre.js';
import { contratoReal, salidaReal, camposDeCierre } from './fixtures/contratoReal.mjs';

const HOY = '2026-10-26';

// ---------------------------------------------------------------------------
// dinero.js — el redondeo de lo que el texto decimal no puede escalar
// ---------------------------------------------------------------------------

test('q: un monto enorme o casi cero (su texto lleva exponente) también se redondea a dos decimales', () => {
  // `${x}e2` solo sirve si el texto del número no trae ya un exponente; con 1e21 o 4e-7 ese texto da NaN
  // y q() cae a la otra cuenta. Esa otra cuenta no tenía ninguna prueba: un error ahí (×101, ÷100, sin
  // redondear, hacia abajo) no lo notaba nadie.
  // Un monto de 1e21 no existe en este negocio, pero la cuenta no debe moverlo más que el error de la coma flotante.
  const casiIgual = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-9;
  assert.ok(casiIgual(q(1e21), 1e21), 'un monto enorme se queda como está: no se escala por error');
  assert.ok(casiIgual(q(-1e22), -1e22), 'y su negativo, del mismo lado');
  assert.equal(q(4e-7), 0, 'menos de medio centavo es cero');
  assert.equal(q(5e-7) === 0, true, 'también medio centavo escrito en notación científica');
  // Un negativo diminuto (el residuo de 0.3 - (0.1 + 0.2)) no se va a -Q0.01 por redondear hacia abajo.
  assert.equal(q(-4e-7) == 0, true, 'un residuo negativo es cero, no -0.01');
  assert.equal(q(-5.551115123125783e-17) == 0, true);
});

// ---------------------------------------------------------------------------
// contrato.js — lo que se le cobra a quien se pasa de los días
// ---------------------------------------------------------------------------

test('los seguros por día de un atraso de VARIOS días se multiplican por esos días', () => {
  // Con 1 día de atraso, multiplicar y dividir dan lo mismo (75 × 1 = 75 ÷ 1), y todas las pruebas de
  // antes usaban 1. Con 3 días, dividir cobraría Q25 en vez de Q225: Q200 de menos por cada renta.
  const c = contratoReal({
    dias: 2, precioDia: 700, seguroMenoresDia: 50, seguroPaiDia: 25, recibidoEl: '2026-10-06',
  });
  const extra = lineasDevolucion(c).find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 225, '(50 + 25) × 3 días de atraso');
  assert.equal(extra.detalle, 'por 3 días de atraso');
  const atraso = lineasDevolucion(c).find((l) => l.concepto === 'Cobro días de atraso');
  assert.equal(atraso.monto, 2100, '3 días de atraso × Q700');
  assert.equal(resumen(c).totalDevolucion, 2325);
});

test('una renta sin días o sin precio por día no escribe una línea «Renta» en Q0.00', () => {
  // `dias && precio` -> `dias || precio`: con solo uno de los dos aparecería «Renta — 3 días × Q0.00 — Q0.00».
  const sinPrecio = contratoReal({ dias: 3, precioDia: 0 });
  assert.equal(lineasSalida(sinPrecio).some((l) => l.concepto === 'Renta'), false, 'sin precio por día no hay renta que cobrar');
  const sinDias = contratoReal({ dias: 0, precioDia: 700 });
  assert.equal(lineasSalida(sinDias).some((l) => l.concepto === 'Renta'), false, 'sin días tampoco');
  const completa = contratoReal({ dias: 3, precioDia: 700 });
  assert.deepEqual(lineasSalida(completa).map((l) => [l.concepto, l.monto]), [['Renta', 2100]]);
});

test('el detalle de una línea que viene en null (un contrato de antes) sale vacío, no «null»', () => {
  // Nada lo probaba: bastaría quitar el `|| ''` de las cuatro líneas para que un contrato guardado con el detalle en
  // null escribiera «null» en el papel. (`x || ''` y `x ?? ''` dan lo mismo con null, así que cambiar uno por el otro
  // no es un error: ver el informe.)
  const base = contratoReal({
    dias: 2, cartaPoderPrecio: 350, cartaPoderDestino: 'Honduras', variosPrecio: 80, variosDescripcion: 'Silla',
  });
  const viejo = { ...base, cartaPoderDestino: null, variosDescripcion: null };
  const salida = lineasSalida(viejo);
  assert.equal(salida.find((l) => l.concepto === 'Carta poder').detalle, '');
  assert.equal(salida.find((l) => l.concepto === 'Varios').detalle, '');

  const cerrado = construirCierre(base, camposDeCierre({
    recibidoEl: '2026-10-03', danos: 100, danosDetalle: null, varios: 40, variosDetalle: null,
  }));
  const devolucion = lineasDevolucion(cerrado);
  assert.equal(devolucion.find((l) => l.concepto === 'Daños').detalle, '');
  assert.equal(devolucion.find((l) => l.concepto === 'Varios').detalle, '');
  // Y cuando sí traen el texto, sale el texto.
  assert.equal(lineasSalida(base).find((l) => l.concepto === 'Carta poder').detalle, 'Honduras');
});

// ---------------------------------------------------------------------------
// cierre.js — lo que impide guardar al recibir el carro
// ---------------------------------------------------------------------------

test('recibir el carro el MISMO día que salió es válido (una renta de un día que vuelve en la tarde)', () => {
  // `diasEntre(salida, real) < 0` -> `<= 0`: bloquearía con «No se puede recibir el carro antes de haberlo
  // entregado» a cada contrato que regresa el día que salió, y no se podría cerrar.
  const c = salidaReal({ fechaSalida: '2026-10-05', dias: 1 });
  assert.deepEqual(problemasDelCierre(c, camposDeCierre({ recibidoEl: '2026-10-05', kmEntrada: 120 }), HOY), []);
  const antes = problemasDelCierre(c, camposDeCierre({ recibidoEl: '2026-10-04', kmEntrada: 120 }), HOY);
  assert.equal(antes.length, 1);
  assert.match(antes[0], /No se puede recibir el carro antes de haberlo entregado\. Salida: 5 oct 2026\. Entrada: 4 oct 2026\./);
});

test('un descuento que deja el cobro EXACTAMENTE en Q0.00 se puede guardar; uno de un centavo más, no', () => {
  // `subtotal < 0` -> `<= 0` bloquearía la cortesía total (una renta regalada); `< 1` bloquearía
  // un cobro de Q0.50. Los dos bordes, en las dos direcciones.
  const c = salidaReal({ dias: 3, precioDia: 700 });
  const con = (descuento) => problemasDelCierre(c, camposDeCierre({ recibidoEl: '2026-10-04', descuento }), HOY);
  assert.deepEqual(con(2100), [], 'descuento igual a lo que se cobra: cobro en cero, válido');
  assert.deepEqual(con(2099.5), [], 'medio quetzal de cobro tampoco es negativo');
  const pasado = con(2100.01);
  assert.equal(pasado.length, 1);
  assert.match(pasado[0], /es demasiado grande: dejaría el cobro en negativo \(-Q0\.01\)\./);
});

test('sin fecha real (vacía, en blanco o ausente) dice que falta, y no truena', () => {
  // `!fechaReal || fechaReal.trim() === ''` -> `&&`: con la fecha ausente se llamaría `.trim()` de
  // undefined; con espacios diría «no es válida» en vez de «falta».
  const c = salidaReal({ fechaSalida: '2026-10-05', dias: 1 });
  const falta = ['Falta la fecha en que se recibió el carro.'];
  for (const fechaReal of [undefined, '', '   ']) {
    assert.deepEqual(problemasDelCierre(c, { ...camposDeCierre({ recibidoEl: '' }), fechaReal }, HOY), falta, JSON.stringify(fechaReal));
  }
});

test('el kilometraje de entrada: 0 es «falta», cualquier otro menor que el de salida es «retrocede»', () => {
  // `kmEntrada > 0` -> `> 1`: un kilometraje de entrada de 1 se leería como «falta».
  const c = salidaReal({ fechaSalida: '2026-10-05', dias: 1, kmSalida: 80000 });
  const con = (kmEntrada) => problemasDelCierre(c, camposDeCierre({ recibidoEl: '2026-10-05', kmEntrada }), HOY);
  assert.deepEqual(con(0), ['Falta el kilometraje de entrada: el carro salió con 80,000.']);
  assert.deepEqual(con(1), ['El kilometraje de entrada (1) es menor que el de salida (80,000).']);
  assert.deepEqual(con(80000), [], 'igual al de salida no retrocede');
});

// ---------------------------------------------------------------------------
// El ejemplo del diseño (§5), armado con los constructores de verdad
// ---------------------------------------------------------------------------

test('el ejemplo del diseño armado con «Sacar carro» y «Recibir carro» da Q4,345.60 (con dos pagos, cada uno con su 12 %)', () => {
  // pruebas/contrato.test.mjs prueba este mismo ejemplo sobre un objeto escrito a mano. Aquí el contrato sale de
  // `construirContrato`, `construirCierre` y `agregarPago`: si un constructor cambiara el nombre de un campo que el cobro
  // lee, la prueba del objeto a mano seguiría verde y esta no.
  const c = contratoReal({
    fechaSalida: '2026-08-20',
    dias: 4,
    precioDia: 700,
    cartaPoderDestino: 'Honduras',
    cartaPoderPrecio: 350,
    recibidoEl: '2026-08-25',
    cierre: { danos: 200, combustible: 130, descuento: 300 },
    pagos: [{ monto: 3150, forma: 'tarjeta', porcentajeTarjeta: 12 }, { monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12 }],
  });
  assert.equal(c.devolucionPrevista, '2026-08-24');
  const r = resumen(c);
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalSalida, 3150, 'renta Q2,800 y carta poder Q350');
  assert.equal(r.totalDevolucion, 730, 'atraso Q700 + daños Q200 + combustible Q130 - descuento Q300');
  assert.equal(r.subtotal, 3880);
  assert.equal(r.pagado, 4345.6, 'cada pago con su 12 %: 3,528.00 + 817.60');
  assert.equal(r.saldo, 0);
  assert.equal(c.estado, 'cerrado', 'pagó todo y no hay garantía de tarjeta que soltar');
});

// ---------------------------------------------------------------------------
// «Sacar carro»: el 12 % de la tarjeta solo viaja con un pago con tarjeta
// ---------------------------------------------------------------------------

test('un pago en EFECTIVO al sacar el carro se guarda con 0 % aunque el formulario traiga el 12 % puesto', () => {
  // `forma === 'tarjeta' ? q(porcentajeTarjeta) : 0` -> `q(porcentajeTarjeta)`: el formulario trae el 12 % escrito de
  // arranque (es el de ajustes), y un pago en efectivo quedaba guardado con 12 %: el sistema creía que el cliente había
  // pagado 12 % más de lo que entregó, y el saldo salía Q336 de menos en una renta de Q2,800.
  const base = {
    id: 'c1', numero: 9, cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' }, ajeno: false,
    carro: { id: 'v1', placas: 'P-111AAA', marca: 'Toyota', linea: 'Hilux', color: 'Blanco' },
    fechaSalida: '2026-10-01', dias: 4, precioDia: 700, montoPago: 2800, porcentajeTarjeta: 12,
  };
  const efectivo = construirContrato({ ...base, forma: 'efectivo' });
  assert.equal(efectivo.pagos[0].porcentajeTarjeta, 0);
  assert.equal(resumen(efectivo).pagado, 2800);
  assert.equal(resumen(efectivo).saldo, 0);
  const sinForma = construirContrato({ ...base, forma: undefined });
  assert.deepEqual([sinForma.pagos[0].forma, sinForma.pagos[0].porcentajeTarjeta], ['efectivo', 0]);
  const tarjeta = construirContrato({ ...base, forma: 'tarjeta' });
  assert.equal(tarjeta.pagos[0].porcentajeTarjeta, 12);
  assert.equal(resumen(tarjeta).pagado, 3136, 'con tarjeta sí: Q2,800 + 12 %');
  assert.deepEqual(construirContrato({ ...base, forma: 'efectivo', montoPago: 0 }).pagos, [], 'sin monto no hay pago');
});

test('el anticipo de una reservación se agrega como pago: en efectivo sin recargo, con tarjeta con el suyo, y pendiente no es un pago', () => {
  const reserva = (campos) => construirReserva({}, {
    clienteNombre: 'Juan', fechaSalida: '2026-10-01', dias: 4, precioDia: 700, anticipo: 400, anticipoPagado: true, ...campos,
  });
  const c = salidaReal({ fechaSalida: '2026-10-01', dias: 4 });
  const pagos = (contrato) => contrato.pagos.map((p) => [p.monto, p.forma, p.porcentajeTarjeta, p.fecha]);
  assert.deepEqual(pagos(conAnticipoComoPago(c, reserva({}), { porcentajeTarjeta: 12 })), [[400, 'efectivo', 0, '2026-10-01']], 'sin decir forma: efectivo, sin 12 %');
  assert.deepEqual(pagos(conAnticipoComoPago(c, reserva({}), { forma: 'tarjeta', porcentajeTarjeta: 12 })), [[400, 'tarjeta', 12, '2026-10-01']]);
  assert.deepEqual(conAnticipoComoPago(c, reserva({ anticipoPagado: false }), { forma: 'tarjeta', porcentajeTarjeta: 12 }).pagos, [], 'pendiente: no existe como pago');
  assert.deepEqual(conAnticipoComoPago(c, reserva({ anticipo: 0 })).pagos, []);
});

test('lo que cuesta cobrar un abono con tarjeta es SU recargo, no el de todo el saldo', () => {
  // totalDeEstaCobranza: Q500 al 12 % son Q560.00 (no los Q817.60 de saldar Q730).
  const c = contratoReal({
    fechaSalida: '2026-08-20', dias: 4, precioDia: 700, cartaPoderPrecio: 350, recibidoEl: '2026-08-25', cierre: { danos: 200, combustible: 130, descuento: 300 },
    pagos: [{ monto: 3150, forma: 'tarjeta', porcentajeTarjeta: 12 }],
  });
  assert.equal(resumen(c).saldo, 730);
  assert.deepEqual(totalDeEstaCobranza(c, { monto: 500, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25' }), { total: 560, recargo: 60 });
  assert.deepEqual(totalDeEstaCobranza(c, { monto: 500, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25' }), { total: 500, recargo: 0 });
  assert.deepEqual(totalDeEstaCobranza(c, { monto: 0, forma: 'tarjeta', porcentajeTarjeta: 12 }), { total: 0, recargo: 0 });
  assert.deepEqual(totalDeEstaCobranza(c, { monto: '', forma: 'tarjeta', porcentajeTarjeta: 12 }), { total: 0, recargo: 0 });
});
