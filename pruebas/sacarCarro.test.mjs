// Pruebas de "Sacar carro": la parte pura, sin DOM.
//
// La que más importa es la del ADR-001: construirContrato no puede filtrar el
// número completo de la tarjeta ni el CBC porque ni siquiera los recibe —
// quien llama ya le pasa solo los últimos 4 dígitos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirContrato, ultimos4Digitos, leerParametroRuta, montoSalidaConAnticipo, conAnticipoComoPago,
} from '../js/pantallas/sacarCarro.js';
import { resumen } from '../js/nucleo/contrato.js';

test('ultimos4Digitos se queda solo con los últimos 4 dígitos', () => {
  assert.equal(ultimos4Digitos('4111 1111 1111 3343'), '3343');
  assert.equal(ultimos4Digitos('4111-1111-1111-3343'), '3343');
  assert.equal(ultimos4Digitos('123'), '123');
  assert.equal(ultimos4Digitos(''), '');
  assert.equal(ultimos4Digitos(undefined), '');
});

const datosBase = () => ({
  numero: 42,
  cliente: { id: 'k1', nombre1: 'Juan', apellido1: 'Pérez' },
  ajeno: false,
  carro: { id: 'v1', placas: 'P-999TST', marca: 'Toyota', linea: 'Corolla' },
  fechaSalida: '2026-09-23',
  dias: 4,
  precioDia: 700,
  cartaPoderDestino: 'Ciudad de Guatemala',
  cartaPoderPrecio: 350,
  tarjetas: [{ ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000 }],
  forma: 'tarjeta',
  porcentajeTarjeta: 12,
  montoPago: 3150,
  rentadoPor: 'Ana',
  porcentajeComision: 5,
});

test('el ejemplo del diseño: 4 días a Q700, carta poder Q350 y 12% de tarjeta dan Q3,528.00 a cobrar', () => {
  const contrato = construirContrato(datosBase());
  assert.equal(resumen(contrato).pagado, 3528, 'el ejemplo del diseño y de la pantalla');
});

test('el pago usa la clave "forma", no "formaPago"', () => {
  const contrato = construirContrato(datosBase());
  assert.equal(contrato.pagos.length, 1);
  assert.equal('forma' in contrato.pagos[0], true, 'el pago debe tener la clave "forma"');
  assert.equal('formaPago' in contrato.pagos[0], false, 'el pago no debe tener la clave "formaPago"');
  assert.equal(contrato.pagos[0].forma, 'tarjeta');
});

// IMPORTANTE de la revisión final: §7b del diseño dice que un pago es
// {monto, forma, porcentajeTarjeta, fecha}. Sin `fecha` aquí, el pago más
// grande de cada contrato (el de la salida) quedaba con la celda de Fecha
// vacía en el detalle — el único pago de todo el sistema sin ella.
test('el pago de la salida sí lleva fecha: la de fechaSalida del contrato', () => {
  const contrato = construirContrato(datosBase());
  assert.equal(contrato.pagos[0].fecha, '2026-09-23');
});

test('el pago de la salida usa hoyISO() si no se dio fechaSalida', () => {
  const contrato = construirContrato({ ...datosBase(), fechaSalida: undefined });
  assert.equal(contrato.pagos[0].fecha, contrato.fechaSalida, 'la misma fecha que quedó guardada en el contrato');
});

test('guarda el estado, la garantía y la comisión que otras tareas dan por hecho', () => {
  const contrato = construirContrato(datosBase());
  assert.equal(contrato.estado, 'rentado');
  assert.equal(contrato.garantiaLiberada, false);
  assert.equal(contrato.garantiaMonto, 5000, 'lo autorizado en la tarjeta');
  assert.equal(contrato.porcentajeComision, 5);
});

test('nunca guarda un contrato sin porcentajeComision: usa el 5% por defecto si viene vacío', () => {
  const contrato = construirContrato({ ...datosBase(), porcentajeComision: '' });
  assert.equal(contrato.porcentajeComision, 5);
});

test('ADR-001: el contrato guardado no tiene el número completo de la tarjeta ni el CBC', () => {
  const contrato = construirContrato(datosBase());
  const texto = JSON.stringify(contrato);
  assert.equal(texto.includes('3343'.padStart(16, '4')), false); // ningún rastro de un número completo
  assert.equal('numeroCompleto' in contrato.tarjetas[0], false);
  assert.equal('cbc' in contrato.tarjetas[0], false);
  assert.equal(contrato.tarjetas[0].ultimos4, '3343');
});

test('un carro ajeno no toca carroId, y sus datos quedan dentro del contrato', () => {
  const contrato = construirContrato({
    ...datosBase(),
    ajeno: true,
    carro: null,
    carroAjeno: { placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno: 'Don Mario', costoDia: 400 },
  });
  assert.equal(contrato.carroId, null, 'nunca se cruza con un carro de la flota');
  assert.equal(contrato.carroPlacas, 'P-1AJN');
  assert.equal(contrato.subarriendo.costoDia, 400);
});

test('un carro propio no tiene costo de subarriendo', () => {
  const contrato = construirContrato(datosBase());
  assert.equal(contrato.subarriendo, null);
});

// Minor de la revisión final: la pantalla siempre leía un objeto para la
// primera tarjeta, aunque el mostrador nunca hubiera tocado esos campos —
// una renta en efectivo terminaba guardando un renglón de tarjeta vacío, que
// el detalle del contrato mostraba como "•••• / — / — / Q0.00".
test('una tarjeta sin nada escrito no se guarda (evita el renglón de ••••/—/—/Q0.00 en el detalle)', () => {
  const contrato = construirContrato({
    ...datosBase(),
    tarjetas: [{
      ultimos4: '', vencimiento: '', banco: '', autorizacion: '', montoAutorizado: 0,
    }],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
  });
  assert.deepEqual(contrato.tarjetas, []);
  assert.equal(contrato.garantiaMonto, 0);
});

test('una tarjeta con solo el monto autorizado escrito sí cuenta (hay algo que bloquear)', () => {
  const contrato = construirContrato({
    ...datosBase(),
    tarjetas: [{
      ultimos4: '', vencimiento: '', banco: '', autorizacion: '', montoAutorizado: 2000,
    }],
  });
  assert.equal(contrato.tarjetas.length, 1);
  assert.equal(contrato.garantiaMonto, 2000);
});

test('la segunda tarjeta se descarta igual si se agrega vacía', () => {
  const contrato = construirContrato({
    ...datosBase(),
    tarjetas: [
      { ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000 },
      { ultimos4: '', vencimiento: '', banco: '', autorizacion: '', montoAutorizado: 0 },
    ],
  });
  assert.equal(contrato.tarjetas.length, 1);
  assert.equal(contrato.garantiaMonto, 5000);
});

// Ronda de revisión 1, hallazgo importante: un reintento de guardar (por
// ejemplo porque conLimiteDeTiempo se dio por vencido sin saber si la
// escritura anterior en verdad llegó) tiene que caer en el MISMO contrato,
// nunca crear uno segundo — dos contratos del mismo alquiler serían un carro
// comprometido dos veces y una tarjeta autorizada dos veces.
test('sin id, el contrato sale con id: null (lo asigna guardarContrato la primera vez)', () => {
  const contrato = construirContrato(datosBase());
  assert.equal(contrato.id, null);
});

test('con id, lo conserva tal cual — es lo que hace que un reintento no duplique el contrato', () => {
  const contrato = construirContrato({ ...datosBase(), id: 'contrato-abc' });
  assert.equal(contrato.id, 'contrato-abc');
});

test('el mismo id y número, llamados dos veces (como en un reintento), dan el mismo contrato', () => {
  // Simula lo que hace guardar() en sacarCarro.js: decide el id y el número
  // una sola vez y arma el contrato con construirContrato en cada intento.
  // Si el primer intento se cae y el mostrador vuelve a hacer clic, esta es
  // la llamada que se repite — debe apuntar exactamente al mismo documento.
  const datosDelIntento = { ...datosBase(), id: 'contrato-abc', numero: 42 };
  const primerIntento = construirContrato(datosDelIntento);
  const segundoIntento = construirContrato(datosDelIntento);
  assert.equal(primerIntento.id, segundoIntento.id);
  assert.equal(primerIntento.numero, segundoIntento.numero);
});

// ---------- Tarea 9: sacar el carro desde una reservación ----------
//
// leerParametroRuta separa el carroId del '?reserva=' que le pega la ruta
// '#/sacar/:carroId?reserva=:reservaId' — el enrutador (router.js) no sabe
// nada de "?", mismo patrón que recibirCarro.js con "?cobro=1".

test('leerParametroRuta: separa el carroId del "?reserva="', () => {
  assert.deepEqual(leerParametroRuta('v1?reserva=r1'), { carroId: 'v1', reservaId: 'r1' });
});

test('leerParametroRuta: sin "?reserva=", el carroId queda igual y reservaId es null', () => {
  assert.deepEqual(leerParametroRuta('v1'), { carroId: 'v1', reservaId: null });
});

test('leerParametroRuta: vacío o undefined no revienta', () => {
  assert.deepEqual(leerParametroRuta(''), { carroId: '', reservaId: null });
  assert.deepEqual(leerParametroRuta(undefined), { carroId: '', reservaId: null });
});

// Los dos casos que pide el brief como "el corazón de esta tarea": un
// anticipo YA PAGADO se resta de lo que se cobra hoy y se registra como su
// propio pago (Regla 1 y 2 del dueño); un anticipo PENDIENTE no se resta de
// nada y no se pre-registra (Regla 3). Los campos de la reservación son los
// de §7b del diseño ('anticipo', 'anticipoPagado', 'fechaSalida'...), nunca
// inventados.

const reservaConAnticipoPagado = () => ({
  id: 'res1',
  clienteId: 'k1',
  clienteNombre: 'Juan Pérez',
  fechaSalida: '2026-09-10',
  dias: 4,
  devolucionPrevista: '2026-09-14',
  carroId: 'v1',
  carroPlacas: 'P-999TST',
  precioDia: 700,
  anticipo: 500,
  anticipoPagado: true,
});

const reservaConAnticipoPendiente = () => ({ ...reservaConAnticipoPagado(), anticipoPagado: false });

test('montoSalidaConAnticipo: un anticipo PAGADO se resta de lo que se cobra hoy', () => {
  // 4 días × Q700 = Q2,800 de renta (§5 del diseño) — Q500 de anticipo ya
  // pagado dejan Q2,300 por cobrar hoy en el mostrador.
  assert.equal(montoSalidaConAnticipo(2800, reservaConAnticipoPagado()), 2300);
});

test('montoSalidaConAnticipo: un anticipo PENDIENTE no resta nada (Regla 3: "do not subtract it from anything")', () => {
  assert.equal(montoSalidaConAnticipo(2800, reservaConAnticipoPendiente()), 2800);
});

test('montoSalidaConAnticipo: sin reservación de origen, el total no cambia', () => {
  assert.equal(montoSalidaConAnticipo(2800, null), 2800);
});

test('montoSalidaConAnticipo: un anticipo pagado más grande que el total nunca deja un monto negativo', () => {
  const reserva = { ...reservaConAnticipoPagado(), anticipo: 5000 };
  assert.equal(montoSalidaConAnticipo(2800, reserva), 0);
});

test('conAnticipoComoPago: un anticipo PAGADO se agrega como un pago de verdad, con la fecha de la reservación', () => {
  const base = construirContrato({
    ...datosBase(),
    cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' },
    fechaSalida: '2026-09-11', // el mostrador movió la salida un día — sigue editable
    cartaPoderPrecio: 0,
    cartaPoderDestino: '',
    dias: 4,
    precioDia: 700,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 2300, // ya descontado por montoSalidaConAnticipo() arriba
  });
  assert.equal(base.pagos.length, 1, 'antes de agregar el anticipo, solo el pago de la salida');

  const conAnticipo = conAnticipoComoPago(base, reservaConAnticipoPagado(), { forma: 'efectivo' });

  assert.equal(conAnticipo.pagos.length, 2, 'un pago existe: el del anticipo, aparte del de la salida');
  const pagoAnticipo = conAnticipo.pagos[1];
  assert.equal(pagoAnticipo.monto, 500);
  assert.equal(pagoAnticipo.forma, 'efectivo', 'Regla 2: nunca se adivina, y el default es efectivo');
  assert.equal(pagoAnticipo.porcentajeTarjeta, 0);
  assert.equal(
    pagoAnticipo.fecha,
    reservaConAnticipoPagado().fechaSalida,
    'la fecha de la reservación, no la de hoy ni la del contrato (que aquí es un día después)',
  );
  assert.notEqual(pagoAnticipo.fecha, conAnticipo.fechaSalida, 'confirma que de verdad son fechas distintas en este caso');

  // "la balanza se reduce por exactamente ese monto, y el total a cobrar lo
  // refleja": los 2,800 de renta quedan cubiertos exactamente por el
  // anticipo (500) más lo cobrado hoy ya descontado (2,300) — ni un
  // centavo de más ni de menos, saldo en 0.
  const r = resumen(conAnticipo);
  assert.equal(r.pagado, 2800, 'anticipo + lo cobrado hoy suman el total de la renta, no más');
  assert.equal(r.saldo, 0);
});

test('conAnticipoComoPago: el anticipo pagado con tarjeta sí lleva su recargo, solo si se elige a mano', () => {
  const base = construirContrato({
    ...datosBase(), cartaPoderPrecio: 0, cartaPoderDestino: '', dias: 4, precioDia: 700, montoPago: 2300, forma: 'efectivo', porcentajeTarjeta: 0,
  });
  const conAnticipo = conAnticipoComoPago(base, reservaConAnticipoPagado(), { forma: 'tarjeta', porcentajeTarjeta: 12 });
  assert.equal(conAnticipo.pagos[1].forma, 'tarjeta');
  assert.equal(conAnticipo.pagos[1].porcentajeTarjeta, 12);
  // Q500 + 12% = Q560 de recargo sobre ese pago, aparte del de la salida.
  assert.equal(resumen(conAnticipo).pagado, 2300 + 560);
});

test('conAnticipoComoPago: un anticipo PENDIENTE no agrega ningún pago (Regla 3: "a pending anticipo is not a payment")', () => {
  const base = construirContrato({
    ...datosBase(), cartaPoderPrecio: 0, cartaPoderDestino: '', dias: 4, precioDia: 700, montoPago: 2800, forma: 'efectivo', porcentajeTarjeta: 0,
  });
  const conAnticipo = conAnticipoComoPago(base, reservaConAnticipoPendiente(), { forma: 'efectivo' });
  assert.equal(conAnticipo, base, 'ni siquiera arma un contrato nuevo: lo devuelve tal cual');
  assert.equal(conAnticipo.pagos.length, 1);

  // El total a cobrar hoy sigue siendo la renta completa: nada se
  // pre-registró ni se restó de nada.
  const r = resumen(conAnticipo);
  assert.equal(r.pagado, 2800);
  assert.equal(r.saldo, 0);
});

test('conAnticipoComoPago: sin anticipo en la reservación (0 o vacío), tampoco agrega nada', () => {
  const base = construirContrato({ ...datosBase(), montoPago: 2800 });
  const sinAnticipo = conAnticipoComoPago(base, { ...reservaConAnticipoPagado(), anticipo: 0 }, {});
  assert.equal(sinAnticipo, base);
  assert.equal(sinAnticipo.pagos.length, 1);
});

test('conAnticipoComoPago: sin reservación de origen, el contrato no cambia', () => {
  const base = construirContrato({ ...datosBase(), montoPago: 2800 });
  assert.equal(conAnticipoComoPago(base, null, {}), base);
});
