// Pruebas de "Sacar carro": la parte pura, sin DOM.
//
// La que más importa es la del ADR-001: construirContrato no puede filtrar el
// número completo de la tarjeta ni el CBC porque ni siquiera los recibe —
// quien llama ya le pasa solo los últimos 4 dígitos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  construirContrato, ultimos4Digitos, leerParametroRuta, montoSalidaConAnticipo, conAnticipoComoPago,
  resultadosDeLista, avisoDeLista, conAltasDeHoy,
  vistaDeBuscador, crearListaDeSesion, duenoDelContrato, lectorDeCampos, leerFormularioDe, plantilla, motivoParaNoGuardar,
  textoCarroPropioNoEncontrado, avisosConSobrecobro, avisoAnticipoDeMas,
} from '../js/pantallas/sacarCarro.js';
import { resumen } from '../js/nucleo/contrato.js';
import { construirReserva } from '../js/nucleo/reserva.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { agruparPorDueno } from '../js/nucleo/liquidacion.js';
import { resultadoLectura, contratoParaGuardar } from '../js/datos.js';
import { contratoGuardadoConHoraTardiaSiNo } from './fixtures/contratoGuardadoConHoraTardiaSiNo.mjs';
import { contratoGuardadoConHoraTardiaAlSalir } from './fixtures/contratoGuardadoConHoraTardiaAlSalir.mjs';

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


// ---------- El dueño del carro ajeno se escoge de la lista ----------
//
// Los contratos de prueba salen de construirContrato, o sea con la forma que
// de verdad se guarda: `ajeno`, `carroAjeno{placas, tipo, marca, color,
// modelo, dueno, costoDia}` y `subarriendo{costoDia}`. `duenoId` es campo del
// contrato; `carroAjeno.dueno` sigue siendo el nombre tal como se vio ese día.
// Los dueños llevan los campos de CAMPOS_DUENO (nucleo/dueno.js) más el `id` y
// el `actualizado` que les pone duenoParaGuardar.

const carroAjenoDeMario = () => ({
  placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno: 'Mario López', costoDia: 400,
});

const datosDeCarroAjeno = (extra = {}) => ({
  ...datosBase(), ajeno: true, carro: null, carroAjeno: carroAjenoDeMario(), ...extra,
});

const duenoMario = () => ({
  id: 'd1', nombre: 'Mario López', telefono: '5555-1234', nit: '1234567-8', nota: '', actualizado: 1790000000000,
});
const duenaLucia = () => ({
  id: 'd2', nombre: 'Lucía Pérez', telefono: '4444-9876', nit: '', nota: 'Solo fines de semana', actualizado: 1790000000001,
});

test('un carro ajeno con dueño escogido guarda duenoId Y el nombre que se vio ese día', () => {
  const contrato = construirContrato(datosDeCarroAjeno({ duenoId: 'd1' }));
  assert.equal(contrato.duenoId, 'd1');
  // El nombre es también un dato del contrato, no solo un puntero: si el
  // registro del dueño se corrige o se renombra después, este contrato sigue
  // diciendo a quién se le rentó el carro ese día.
  assert.equal(contrato.carroAjeno.dueno, 'Mario López');
});

test('un carro ajeno sin dueño escogido deja duenoId en null (nunca undefined ni "")', () => {
  for (const sinDueno of [undefined, null, '']) {
    const contrato = construirContrato(datosDeCarroAjeno({ duenoId: sinDueno }));
    assert.equal(contrato.duenoId, null, `duenoId: ${JSON.stringify(sinDueno)}`);
  }
  // Y si quien llama ni siquiera conoce el campo (como todo lo escrito antes de hoy):
  const contrato = construirContrato(datosDeCarroAjeno());
  assert.equal(contrato.duenoId, null);
  assert.equal(contrato.carroAjeno.dueno, 'Mario López', 'el resto del carro ajeno no cambia');
});

test('un carro propio nunca lleva duenoId, aunque la pantalla se haya quedado con uno escogido', () => {
  // La pantalla recuerda el dueño escogido si se desmarca "carro ajeno" y se
  // vuelve a marcar; mientras tanto el contrato es de un carro de la flota.
  const contrato = construirContrato({ ...datosBase(), duenoId: 'd1' });
  assert.equal(contrato.ajeno, false);
  assert.equal(contrato.duenoId, null);
});

test('duenoId es el que lee la liquidación: dos contratos del mismo dueño caen en una sola cuenta', () => {
  // De punta a punta: lo que construirContrato arma, pasado por lo que de
  // verdad se guarda, entra a agruparPorDueno con el nombre del campo que ella lee.
  const guardado = (id, numero) => contratoParaGuardar(
    construirContrato(datosDeCarroAjeno({ duenoId: 'd1', id, numero })), { id, numero, ahora: 1790000000100 },
  );
  assert.equal(guardado('c1', 1).duenoId, 'd1', 'sobrevive a lo que se guarda');
  const cuentas = agruparPorDueno([guardado('c1', 1), guardado('c2', 2)], []);
  assert.equal(cuentas.length, 1);
  assert.equal(cuentas[0].duenoId, 'd1');
  assert.equal(cuentas[0].sinEnlazar, false);
});

// Todo contrato escrito antes de hoy NO tiene la llave `duenoId`: no es null,
// no existe. Nada de lo que se agregó puede negarse a leer, pintar o guardar uno.
const contratoViejoSinDuenoId = () => {
  const contrato = construirContrato(datosDeCarroAjeno({ id: 'viejo', numero: 7 }));
  delete contrato.duenoId;
  return contrato;
};

test('un contrato de antes (sin la llave duenoId) sigue siendo válido: se lee, se calcula y se guarda', () => {
  const viejo = contratoViejoSinDuenoId();
  assert.equal('duenoId' in viejo, false, 'la forma de un contrato escrito antes de hoy');

  assert.doesNotThrow(() => resumen(viejo));
  assert.equal(resumen(viejo).totalSalida, 2800 + 350, '4 días × Q700 más la carta poder, igual que antes');
  assert.equal(estadoContrato(viejo), 'rentado');

  const guardado = contratoParaGuardar(viejo, { id: 'viejo', numero: 7, ahora: 1790000000200 });
  assert.equal(guardado.carroAjeno.dueno, 'Mario López');
  assert.equal(guardado.estado, 'rentado');
  assert.equal('duenoId' in guardado, false, 'guardarlo no le inventa un duenoId');
});

test('un contrato de antes aparece en la liquidación bajo el nombre que se escribió, marcado como sin enlazar', () => {
  const cuentas = agruparPorDueno([contratoViejoSinDuenoId()], []);
  assert.equal(cuentas.length, 1, 'no desaparece de la vista');
  assert.equal(cuentas[0].nombre, 'Mario López');
  assert.equal(cuentas[0].duenoId, null);
  assert.equal(cuentas[0].sinEnlazar, true);
});

// ---------- Los buscadores de cliente y de dueño: qué se dibuja ----------
//
// La regla de esta parte es la más vieja del sistema: una lectura que FALLÓ
// no se dibuja como "no hay nada". Aquí cuesta una ficha duplicada — el
// mostrador ve "Sin resultados. Puedes darlo de alta abajo", da de alta a
// quien ya existía, y la historia de esa persona (o la cuenta de ese dueño) se
// parte en dos. Es la misma regla para el cliente y para el dueño, y por eso
// cada prueba de abajo corre contra los dos.
//
// Los clientes llevan los campos de CAMPOS_CLIENTE (nombres, apellidos,
// documento, licencia, telefono...), no los viejos nombre1/apellido1.

const clienteJuan = () => ({
  id: 'k1', nombres: 'Juan', apellidos: 'Pérez', documento: '2345 67890 0101', licencia: 'L-445566', telefono: '5555-0000', actualizado: 1790000000000,
});
const clienteLucia = () => ({
  id: 'k2', nombres: 'Lucía', apellidos: 'Méndez', documento: '1111 22222 0303', licencia: 'L-998877', telefono: '4444-7777', actualizado: 1790000000001,
});

// Cada caso: el tipo de buscador, dos fichas reales, y lo que se busca para encontrarlas.
const BUSCADORES = [
  {
    tipo: 'clientes',
    uno: clienteJuan, otro: clienteLucia,
    encuentraA1: ['pérez', 'juan perez', '5555', '2345'], encuentraA2: ['mendez', 'l-998877', '4444'],
    sinCoincidencia: 'zzz',
    plural: 'clientes',
  },
  {
    tipo: 'duenos',
    uno: duenoMario, otro: duenaLucia,
    encuentraA1: ['lopez', 'mario lopez', '5555', '1234567'], encuentraA2: ['lucia perez', '4444'],
    sinCoincidencia: 'zzz',
    plural: 'dueños',
  },
];

for (const { tipo, uno, otro, encuentraA1, encuentraA2, sinCoincidencia, plural } of BUSCADORES) {
  const leido = (items, consulta) => resultadosDeLista({
    tipo, items, fallo: false, leida: true, consulta,
  });

  test(`resultadosDeLista (${tipo}): sin nada escrito no se dibuja nada`, () => {
    assert.deepEqual(leido([uno()], '   '), { filas: [], mensaje: '' });
  });

  test(`resultadosDeLista (${tipo}): encuentra por nombre sin acentos y por los datos de contacto`, () => {
    const items = [uno(), otro()];
    for (const consulta of encuentraA1) assert.deepEqual(leido(items, consulta).filas.map((f) => f.id), [uno().id], consulta);
    for (const consulta of encuentraA2) assert.deepEqual(leido(items, consulta).filas.map((f) => f.id), [otro().id], consulta);
  });

  test(`resultadosDeLista (${tipo}): una lista leída de verdad y sin coincidencias sí invita a dar de alta`, () => {
    const r = leido([uno()], sinCoincidencia);
    assert.deepEqual(r.filas, []);
    assert.match(r.mensaje, /Sin resultados/);
  });

  test(`resultadosDeLista (${tipo}): una lista leída de verdad y vacía (todavía no hay ninguno) también`, () => {
    assert.match(leido([], 'mario').mensaje, /Sin resultados/);
  });

  test(`resultadosDeLista (${tipo}): una lectura que FALLÓ y quedó vacía no se dibuja como "no hay"`, () => {
    const lectura = resultadoLectura([], { ok: false });
    const r = resultadosDeLista({
      tipo, items: lectura.datos, fallo: lectura.fallo, leida: true, consulta: 'mario',
    });
    assert.deepEqual(r.filas, []);
    assert.match(r.mensaje, /No se pudo leer/);
    assert.ok(r.mensaje.includes(plural), 'dice qué lista no se pudo leer');
    assert.doesNotMatch(r.mensaje, /Sin resultados/);
    assert.doesNotMatch(r.mensaje, /alta/i, 'no lo empuja a dar de alta a alguien que puede existir');
  });

  test(`resultadosDeLista (${tipo}): con copia local pero la nube caída, no encontrar no es "no existe"`, () => {
    const lectura = resultadoLectura([uno()], { ok: false });
    const buscar = (consulta) => resultadosDeLista({
      tipo, items: lectura.datos, fallo: lectura.fallo, leida: true, consulta,
    });
    const r = buscar(sinCoincidencia);
    assert.deepEqual(r.filas, []);
    assert.match(r.mensaje, /desactualizada/);
    assert.doesNotMatch(r.mensaje, /Sin resultados/);
    // Y lo que sí hay en la copia se sigue mostrando: la lectura caída no esconde nada.
    const conCoincidencia = buscar(encuentraA1[0]);
    assert.deepEqual(conCoincidencia.filas.map((f) => f.id), [uno().id]);
    assert.equal(conCoincidencia.mensaje, '');
  });

  test(`resultadosDeLista (${tipo}): mientras la lista todavía no llega, no se dice "sin resultados"`, () => {
    const r = resultadosDeLista({
      tipo, items: [], fallo: false, leida: false, consulta: 'mario',
    });
    assert.deepEqual(r.filas, []);
    assert.match(r.mensaje, /Leyendo/);
    assert.doesNotMatch(r.mensaje, /Sin resultados/);
  });

  test(`resultadosDeLista (${tipo}): muestra a lo más 8`, () => {
    const muchos = Array.from({ length: 12 }, (_, i) => ({ ...uno(), id: `x${i}` }));
    assert.equal(leido(muchos, encuentraA1[0]).filas.length, 8);
  });

  test(`avisoDeLista (${tipo}): callado cuando la lista llegó bien o todavía no se sabe`, () => {
    assert.equal(avisoDeLista({ tipo, leida: false, fallo: false, cantidad: 0 }), '');
    assert.equal(avisoDeLista({ tipo, leida: true, fallo: false, cantidad: 0 }), '');
    assert.equal(avisoDeLista({ tipo, leida: true, fallo: false, cantidad: 5 }), '');
  });

  test(`avisoDeLista (${tipo}): una lectura fallida sin copia dice que no se sabe si ya está registrado`, () => {
    const texto = avisoDeLista({ tipo, leida: true, fallo: true, cantidad: 0 });
    assert.match(texto, /No se pudo leer/);
    assert.match(texto, /ya está registrado/);
    assert.ok(texto.includes(plural));
    assert.doesNotMatch(texto, /Sin resultados/);
  });

  test(`avisoDeLista (${tipo}): una lectura fallida con copia dice que la lista puede estar desactualizada`, () => {
    assert.match(avisoDeLista({ tipo, leida: true, fallo: true, cantidad: 3 }), /desactualizada/);
  });

  test(`conAltasDeHoy (${tipo}): una ficha dada de alta aquí no se pierde si la sincronía llega después sin ella`, () => {
    // La sincronía de atrás trae la lista tal como estaba cuando se pidió: si el
    // mostrador dio de alta a la segunda mientras tanto, ella no viene en esa
    // lista, y sin esto el buscador "no la encontraría" y la daría de alta otra vez.
    const conAlta = conAltasDeHoy([uno()], [otro()]);
    assert.deepEqual(conAlta.map((f) => f.id), [uno().id, otro().id]);
  });

  test(`conAltasDeHoy (${tipo}): si la nube ya la trae, manda la versión de la nube y no se duplica`, () => {
    const nubeConLaSegunda = { ...otro(), telefono: '0000-0000', actualizado: 1790000009999 };
    const conAlta = conAltasDeHoy([uno(), nubeConLaSegunda], [otro()]);
    assert.equal(conAlta.length, 2);
    assert.equal(conAlta.find((f) => f.id === otro().id).telefono, '0000-0000');
  });
}

test('resultadosDeLista: el mensaje de cada buscador nombra SU lista', () => {
  const dicen = (tipo) => resultadosDeLista({
    tipo, items: [], fallo: true, leida: true, consulta: 'x',
  }).mensaje;
  assert.match(dicen('clientes'), /lista de clientes/);
  assert.match(dicen('duenos'), /lista de dueños/);
});

// ---------- Lo que se teclea del dueño no se tira (I-1) ----------
//
// Antes de que el dueño del carro ajeno se escogiera de una lista, el nombre
// se escribía a mano y SE GUARDABA. Con el buscador, quien teclea el nombre
// completo y sigue de largo sin pulsar la fila se llevaba un contrato con
// `carroAjeno.dueno: ''`: lo escrito desaparecía sin un aviso. Escoger sigue
// siendo opcional (y sin avisos: así lo quiere quien maneja el negocio), pero
// lo escrito se queda como el nombre del contrato, con `duenoId: null`.
//
// Estas pruebas corren el camino real de los datos: campos de mentira con los
// ids de la pantalla → lectorDeCampos → leerFormularioDe → construirContrato
// → contratoParaGuardar. Lo que NO prueban (no se puede desde node:test, no
// hay DOM): que la pantalla le pase a leerFormularioDe el `duenoSeleccionado`
// que de verdad recuerda, y que el clic en una fila lo guarde.

// Campos de mentira con la forma de lo que se lee de verdad: `{ value }` o
// `{ checked }`. Un id que nadie llenó es un campo vacío, como en la pantalla.
// `pedidos` junta cada id que se leyó, para compararlos con la plantilla.
const camposDeMentira = (valores = {}) => {
  const pedidos = new Set();
  const el = (id) => {
    pedidos.add(id);
    const v = valores[id];
    if (typeof v === 'boolean') return { value: '', checked: v };
    return { value: v === undefined ? '' : String(v), checked: false };
  };
  return { el, pedidos };
};

const formularioDeCarroAjeno = (extra = {}) => ({
  'sc-ajeno': true,
  'sc-ajeno-placas': 'P-1AJN',
  'sc-ajeno-tipo': 'Pickup',
  'sc-ajeno-marca': 'Ford',
  'sc-ajeno-color': 'Rojo',
  'sc-ajeno-modelo': '2019',
  'sc-ajeno-costo': '400',
  'sc-fecha-salida': '2026-09-23',
  'sc-dias': '4',
  'sc-precio-dia': '700',
  'sc-rentado-por': 'Ana',
  'sc-porcentaje-comision': '5',
  'sc-pago-forma': 'efectivo',
  'sc-pago-monto': '2800',
  ...extra,
});

// Lo que pasa al pulsar "Guardar" con esos campos: lo que se lee del formulario
// (`datos`), el contrato armado y el que de verdad se guarda.
const contratoDeLosCampos = (valores, { duenoEscogido = null, carro = null } = {}) => {
  const { el } = camposDeMentira(valores);
  const datos = leerFormularioDe(lectorDeCampos(el), {
    contratoId: 'c1', cliente: clienteJuan(), carro, duenoEscogido, tarjetas: [],
  }, 12);
  const armado = construirContrato(datos);
  return { datos, armado, guardado: contratoParaGuardar(armado, { id: 'c1', numero: 12, ahora: 1790000000300 }) };
};

test('el caso de la revisión: "Mario López" tecleado completo y sin pulsar la fila se guarda como nombre, con duenoId null', () => {
  // d1 (Mario López) existe en la lista, pero nadie lo escogió.
  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-dueno-buscar': 'Mario López' }));
  assert.equal(guardado.carroAjeno.dueno, 'Mario López', 'lo tecleado ya no se pierde');
  assert.equal(guardado.duenoId, null, 'pero no se inventa un enlace que nadie escogió');
  assert.equal(guardado.ajeno, true);
});

test('lo tecleado se guarda sin espacios de más', () => {
  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-dueno-buscar': '   Mario López  ' }));
  assert.equal(guardado.carroAjeno.dueno, 'Mario López');
});

test('escoger de la lista sigue poniendo los dos: duenoId y el nombre de ese día', () => {
  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno(), { duenoEscogido: duenoMario() });
  assert.equal(guardado.duenoId, 'd1');
  assert.equal(guardado.carroAjeno.dueno, 'Mario López');
});

test('escoger gana sobre lo tecleado después: una búsqueda nueva no cambia al dueño escogido', () => {
  const { guardado } = contratoDeLosCampos(
    formularioDeCarroAjeno({ 'sc-dueno-buscar': 'lucia' }), { duenoEscogido: duenoMario() },
  );
  assert.equal(guardado.duenoId, 'd1');
  assert.equal(guardado.carroAjeno.dueno, 'Mario López');
});

test('sin escoger ni teclear nada, el contrato se guarda igual: sin dueño, sin bloqueo y sin undefined', () => {
  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno());
  assert.equal(guardado.carroAjeno.dueno, '');
  assert.equal(guardado.duenoId, null);
  assert.equal(guardado.estado, 'rentado', 'el contrato salió: escoger sigue siendo opcional');
});

test('un dueño nuevo tecleado en el alta rápida que no llegó a guardarse (la nube lo rechazó) tampoco se pierde', () => {
  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-nd-nombre': 'Rosa Tum' }));
  assert.equal(guardado.carroAjeno.dueno, 'Rosa Tum');
  assert.equal(guardado.duenoId, null);
});

test('lo tecleado en el buscador manda sobre el nombre a medio llenar del alta', () => {
  const { guardado } = contratoDeLosCampos(
    formularioDeCarroAjeno({ 'sc-dueno-buscar': 'Mario López', 'sc-nd-nombre': 'Rosa Tum' }),
  );
  assert.equal(guardado.carroAjeno.dueno, 'Mario López');
});

test('un carro propio no arrastra lo tecleado en la caja del dueño: carroAjeno y duenoId quedan en null', () => {
  // La caja del dueño se esconde al desmarcar "carro ajeno", pero conserva lo escrito.
  const { datos, guardado } = contratoDeLosCampos(
    formularioDeCarroAjeno({ 'sc-ajeno': false, 'sc-dueno-buscar': 'Mario López' }),
    { duenoEscogido: duenoMario(), carro: { id: 'v1', placas: 'P-999TST', marca: 'Toyota', linea: 'Corolla' } },
  );
  // Ya desde la lectura del formulario, no solo al armar el contrato: las dos
  // capas cuidan que un carro propio no lleve dueño.
  assert.equal(datos.duenoId, null);
  assert.equal(datos.carroAjeno, null);
  assert.equal(guardado.ajeno, false);
  assert.equal(guardado.carroAjeno, null);
  assert.equal(guardado.duenoId, null);
  assert.equal(guardado.carroId, 'v1');
});

test('un contrato con el dueño tecleado entra a la liquidación bajo ese nombre, marcado como sin enlazar', () => {
  // La liquidación ya sabe agrupar por texto lo que no tiene duenoId: lo
  // tecleado sigue contando en la cuenta de esa persona en vez de no aparecer.
  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-dueno-buscar': 'Mario López' }));
  const cuentas = agruparPorDueno([guardado], []);
  assert.equal(cuentas.length, 1);
  assert.equal(cuentas[0].nombre, 'Mario López');
  assert.equal(cuentas[0].duenoId, null);
  assert.equal(cuentas[0].sinEnlazar, true);
});

test('leerFormularioDe pasa el resto del formulario al contrato con los ids de la pantalla', () => {
  const { armado, guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-dueno-buscar': 'Mario López' }));
  assert.equal(armado.clienteId, 'k1');
  assert.equal(guardado.numero, 12);
  assert.equal(guardado.carroPlacas, 'P-1AJN');
  assert.equal(guardado.carroDescripcion, 'Ford 2019');
  assert.equal(guardado.dias, 4);
  assert.equal(guardado.precioDia, 700);
  assert.equal(guardado.rentadoPor, 'Ana');
  assert.equal(guardado.pagos[0].monto, 2800);
  assert.equal(armado.carroAjeno.costoDia, 400, 'el costo del dueño sigue llegando a construirContrato');
  assert.equal(resumen(guardado).totalSalida, 2800);
});

test('leerFormularioDe solo lee campos que existen en la plantilla (un id mal escrito no se ve de otro modo)', () => {
  // Un id con un error de dedo se lee como campo vacío, sin avisar, y el
  // contrato sale sin ese dato. Se leen TODOS los ids con "carro ajeno"
  // marcado y se exige que cada uno exista en la plantilla de la pantalla.
  const { el, pedidos } = camposDeMentira(formularioDeCarroAjeno());
  leerFormularioDe(lectorDeCampos(el), {
    contratoId: null, cliente: null, carro: null, duenoEscogido: null, tarjetas: [],
  }, null);
  const html = plantilla();
  assert.ok(pedidos.has('sc-dueno-buscar') && pedidos.has('sc-nd-nombre'), 'lee los dos campos del dueño');
  const faltan = [...pedidos].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(faltan, [], 'ids leídos que no existen en la plantilla');
});

test('duenoDelContrato: escogido, tecleado, alta sin guardar, o nada', () => {
  assert.deepEqual(duenoDelContrato({ escogido: duenoMario(), buscado: 'otra cosa' }), { duenoId: 'd1', dueno: 'Mario López' });
  assert.deepEqual(duenoDelContrato({ escogido: null, buscado: ' Mario López ' }), { duenoId: null, dueno: 'Mario López' });
  assert.deepEqual(duenoDelContrato({ escogido: null, buscado: '', nuevo: 'Rosa Tum' }), { duenoId: null, dueno: 'Rosa Tum' });
  assert.deepEqual(duenoDelContrato({ escogido: null, buscado: '  ', nuevo: '  ' }), { duenoId: null, dueno: '' });
  assert.deepEqual(duenoDelContrato({}), { duenoId: null, dueno: '' });
});

test('lectorDeCampos: texto recorta, num pasa por q(), marcado es booleano, lo que falta es vacío', () => {
  const { el } = camposDeMentira({ a: '  hola ', b: '12.345', c: true });
  const { val, texto, num, marcado } = lectorDeCampos(el);
  assert.equal(val('a'), '  hola ');
  assert.equal(texto('a'), 'hola');
  assert.equal(num('b'), 12.35, 'dinero: siempre por q(), a dos decimales');
  assert.equal(marcado('c'), true);
  assert.equal(marcado('nada'), false);
  assert.equal(texto('nada'), '');
  assert.equal(lectorDeCampos(() => undefined).texto('x'), '', 'un campo que no existe no revienta');
});

// ---------- La lectura de la lista: una por sesión, y un fallo nunca se recuerda ----------
//
// Esto es el estado que antes vivía dentro de la pantalla (`recibir` y `leer`)
// y que ninguna prueba alcanzaba: dos de sus líneas, al cambiarlas por
// `fallo = false`, volvían a hacer que una nube caída se viera como "Sin
// resultados" con la suite en verde. Ahora es crearListaDeSesion, sin DOM, con
// un `cargar` de mentira que cuenta cuántas veces se le pide.
//
// Lo que NO prueba (es DOM): que `pintar` copie la vista a los elementos, y
// que la pantalla llame a esta lista (y no a otra) al abrir, al escoger y al
// pulsar "Volver a intentar".

const buena = (datos) => ({ datos, fallo: false });
const caida = (datos = []) => ({ datos, fallo: true });

// Un `cargar` de mentira: cuenta las veces que se le pide, guarda los `alLlegar`
// que recibió (la sincronía de atrás) y contesta una respuesta por llamada
// (la última se repite). Una respuesta que sea un Error se lanza.
const cargaDeMentira = (...respuestas) => {
  const alLlegar = [];
  const cargar = async (cb) => {
    alLlegar.push(cb);
    const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
    if (r instanceof Error) throw r;
    return r;
  };
  return { cargar, alLlegar };
};

test('lista de sesión: una lectura que falló y quedó vacía es un fallo, nunca "no hay nada"', async () => {
  const lista = crearListaDeSesion({ cargar: cargaDeMentira(caida()).cargar });
  await lista.leer();
  assert.deepEqual(lista.estado(), { items: [], altas: [], fallo: true, leida: true });
  // Y así se dibuja: no como "Sin resultados".
  const vista = vistaDeBuscador({ tipo: 'clientes', ...lista.estado(), consulta: 'ana' });
  assert.doesNotMatch(vista.mensaje, /Sin resultados/);
  assert.match(vista.mensaje, /No se pudo leer/);
});

test('lista de sesión: una respuesta sin forma de respuesta (undefined o null) cuenta como fallo', async () => {
  for (const rara of [undefined, null]) {
    const lista = crearListaDeSesion({ cargar: cargaDeMentira(rara).cargar });
    await lista.leer();
    assert.equal(lista.estado().fallo, true, `respuesta: ${rara}`);
    assert.equal(lista.estado().leida, true);
  }
});

test('lista de sesión: una lectura buena no es fallo y trae lo leído', async () => {
  const lista = crearListaDeSesion({ cargar: cargaDeMentira(buena([clienteJuan()])).cargar });
  await lista.leer();
  assert.deepEqual(lista.estado(), { items: [clienteJuan()], altas: [], fallo: false, leida: true });
});

test('lista de sesión: si cargar mismo revienta (IndexedDB), es un fallo y se conserva lo que ya había', async () => {
  const { cargar } = cargaDeMentira(buena([clienteJuan()]), new Error('IndexedDB no abre'));
  const lista = crearListaDeSesion({ cargar });
  await lista.leer();
  await lista.leer({ forzar: true });
  assert.deepEqual(lista.estado(), { items: [clienteJuan()], altas: [], fallo: true, leida: true });
});

test('lista de sesión: si cargar revienta desde el principio, es un fallo y la lista queda vacía pero leída', async () => {
  const lista = crearListaDeSesion({ cargar: cargaDeMentira(new Error('no abre')).cargar });
  await assert.doesNotReject(lista.leer(), 'leer nunca rechaza: el error queda en el estado');
  assert.deepEqual(lista.estado(), { items: [], altas: [], fallo: true, leida: true });
});

test('lista de sesión: un fallo que llega TARDE (ya se sirvió la copia local) queda anotado y avisa a la pantalla', async () => {
  const { cargar, alLlegar } = cargaDeMentira(buena([clienteJuan()]));
  const lista = crearListaDeSesion({ cargar });
  let avisos = 0;
  lista.escuchar(() => { avisos += 1; });
  await lista.leer();
  assert.equal(lista.estado().fallo, false, 'con la copia local servida, todavía no hay fallo');
  assert.equal(avisos, 1);

  alLlegar[0](caida([clienteJuan()]));
  assert.equal(lista.estado().fallo, true);
  assert.equal(lista.estado().items.length, 1, 'la copia local sigue sirviendo');
  assert.equal(avisos, 2, 'la pantalla se entera para volver a pintar');
});

test('lista de sesión: la sincronía tardía de una lectura vieja no pisa a la lectura nueva', async () => {
  const { cargar, alLlegar } = cargaDeMentira(buena([clienteJuan()]), buena([clienteJuan(), clienteLucia()]));
  const lista = crearListaDeSesion({ cargar });
  await lista.leer();
  await lista.leer({ forzar: true });
  alLlegar[0](caida([clienteJuan()])); // la nube de la lectura 1 contesta con un error, ya fuera de turno
  assert.equal(lista.estado().fallo, false);
  assert.equal(lista.estado().items.length, 2);
});

test('lista de sesión: la nube se lee UNA vez por sesión — abrir la pantalla otra vez no vuelve a pedirla', async () => {
  const { cargar, alLlegar } = cargaDeMentira(buena([clienteJuan(), clienteLucia()]));
  const lista = crearListaDeSesion({ cargar });
  await lista.leer(); // primera apertura
  await lista.leer(); // segunda
  await lista.leer(); // tercera
  assert.equal(alLlegar.length, 1, 'tres aperturas, una sola lectura (eran tres)');
  assert.equal(lista.estado().items.length, 2, 'y la lista sigue en memoria');
});

test('lista de sesión: una lectura FALLIDA no se recuerda — la siguiente apertura vuelve a pedir', async () => {
  const { cargar, alLlegar } = cargaDeMentira(caida(), buena([clienteJuan()]));
  const lista = crearListaDeSesion({ cargar });
  await lista.leer();
  assert.equal(lista.estado().fallo, true);
  await lista.leer();
  assert.equal(alLlegar.length, 2, 'se pidió otra vez');
  assert.deepEqual(lista.estado(), { items: [clienteJuan()], altas: [], fallo: false, leida: true });
  await lista.leer();
  assert.equal(alLlegar.length, 2, 'ya con una lectura buena, no se pide más');
});

test('lista de sesión: un fallo que llegó tarde tampoco se recuerda como lectura buena', async () => {
  const { cargar, alLlegar } = cargaDeMentira(buena([clienteJuan()]));
  const lista = crearListaDeSesion({ cargar });
  await lista.leer();
  alLlegar[0](caida([clienteJuan()]));
  await lista.leer();
  assert.equal(alLlegar.length, 2, 'la apertura siguiente reintenta la nube');
});

test('lista de sesión: dos aperturas seguidas comparten la lectura que sigue en vuelo', async () => {
  let soltar;
  const lenta = new Promise((ok) => { soltar = ok; });
  let pedidas = 0;
  const lista = crearListaDeSesion({ cargar: () => { pedidas += 1; return lenta; } });
  const a = lista.leer();
  const b = lista.leer();
  soltar(buena([clienteJuan()]));
  await Promise.all([a, b]);
  assert.equal(pedidas, 1);
  assert.equal(lista.estado().leida, true);
});

test('lista de sesión: forzar (el botón "Volver a intentar") pide aunque ya haya una lectura buena', async () => {
  const { cargar, alLlegar } = cargaDeMentira(buena([clienteJuan()]));
  const lista = crearListaDeSesion({ cargar });
  await lista.leer();
  await lista.leer({ forzar: true });
  assert.equal(alLlegar.length, 2);
});

test('lista de sesión: olvidar() obliga a leer otra vez, y lo que conteste la lectura que iba en vuelo ya no cuenta', async () => {
  let soltar;
  const lenta = new Promise((ok) => { soltar = ok; });
  const respuestas = [lenta, Promise.resolve(buena([clienteJuan(), clienteLucia()]))];
  let pedidas = 0;
  const lista = crearListaDeSesion({ cargar: () => { pedidas += 1; return respuestas.shift(); } });
  const enVuelo = lista.leer();
  lista.olvidar(); // se entró a la pantalla de Clientes mientras esa lectura seguía en curso
  await lista.leer();
  soltar(buena([]));
  await enVuelo;
  assert.equal(pedidas, 2);
  assert.equal(lista.estado().items.length, 2, 'la respuesta vieja no pisó a la nueva');

  lista.olvidar();
  assert.equal(lista.estado().leida, false, 'vencida: hasta que se lea otra vez, no se sabe');
});

test('lista de sesión: lo dado de alta hoy se recuerda entre aperturas, y el buscador lo encuentra aunque la lista leída no lo traiga', async () => {
  const lista = crearListaDeSesion({ cargar: cargaDeMentira(buena([clienteJuan()])).cargar });
  await lista.leer();
  lista.registrarAlta(clienteLucia());
  await lista.leer(); // la apertura siguiente no vuelve a pedir la lista, que no trae a Lucía
  const vista = vistaDeBuscador({ tipo: 'clientes', ...lista.estado(), consulta: 'mendez' });
  assert.deepEqual(vista.filas.map((f) => f.id), ['k2']);
});

test('lista de sesión: solo escucha la última pantalla que lo pidió', async () => {
  const { cargar, alLlegar } = cargaDeMentira(buena([clienteJuan()]));
  const lista = crearListaDeSesion({ cargar });
  const avisos = [];
  lista.escuchar(() => avisos.push('vieja'));
  lista.escuchar(() => avisos.push('nueva'));
  await lista.leer();
  alLlegar[0](caida([clienteJuan()]));
  assert.deepEqual(avisos, ['nueva', 'nueva']);
});

// ---------- El aviso rojo: legible cuando importa, ausente cuando no (M-2) ----------

for (const tipo of ['clientes', 'duenos']) {
  test(`avisoDeLista (${tipo}): en cuanto se escoge a alguien el aviso se va, haya o no copia local`, () => {
    assert.equal(avisoDeLista({ tipo, leida: true, fallo: true, cantidad: 0, elegido: true }), '');
    assert.equal(avisoDeLista({ tipo, leida: true, fallo: true, cantidad: 4, elegido: true }), '');
    // Y sin escoger, el mismo estado sí lo muestra: el cambio es por escoger, no por callar.
    assert.notEqual(avisoDeLista({ tipo, leida: true, fallo: true, cantidad: 0, elegido: false }), '');
    assert.notEqual(avisoDeLista({ tipo, leida: true, fallo: true, cantidad: 4 }), '');
  });

  test(`vistaDeBuscador (${tipo}): lectura caída y nada escrito — el aviso se ve YA y con el botón, sin lista abierta`, () => {
    const vista = vistaDeBuscador({ tipo, items: [], fallo: true, leida: true, consulta: '' });
    assert.match(vista.aviso, /Vuelve a intentar antes de dar de alta a uno nuevo/);
    assert.equal(vista.reintentar, true);
    assert.equal(vista.abierta, false);
  });

  test(`vistaDeBuscador (${tipo}): lectura caída con algo escrito — aviso con botón Y la frase de la lista, ninguna dice "Sin resultados"`, () => {
    const vista = vistaDeBuscador({ tipo, items: [], fallo: true, leida: true, consulta: 'ana' });
    assert.match(vista.aviso, /No se pudo leer/);
    assert.equal(vista.reintentar, true);
    assert.equal(vista.abierta, true);
    assert.match(vista.mensaje, /No se pudo leer/);
    assert.doesNotMatch(`${vista.aviso} ${vista.mensaje}`, /Sin resultados/);
  });

  test(`vistaDeBuscador (${tipo}): ya escogido, el aviso y el botón desaparecen aunque la lectura siga caída`, () => {
    const vista = vistaDeBuscador({
      tipo, items: [], fallo: true, leida: true, consulta: '', elegido: true,
    });
    assert.equal(vista.aviso, '');
    assert.equal(vista.reintentar, false);
  });

  test(`vistaDeBuscador (${tipo}): con copia local el aviso dice que está desactualizada y NO ofrece reintentar`, () => {
    const vista = vistaDeBuscador({
      tipo, items: [tipo === 'clientes' ? clienteJuan() : duenoMario()], fallo: true, leida: true, consulta: '',
    });
    assert.match(vista.aviso, /desactualizada/);
    assert.equal(vista.reintentar, false);
  });

  test(`vistaDeBuscador (${tipo}): lectura buena — sin aviso; la lista flotante solo se abre si hay algo escrito`, () => {
    const uno = tipo === 'clientes' ? clienteJuan() : duenoMario();
    const sinTexto = vistaDeBuscador({ tipo, items: [uno], fallo: false, leida: true, consulta: '   ' });
    assert.deepEqual([sinTexto.aviso, sinTexto.reintentar, sinTexto.abierta], ['', false, false]);
    const conTexto = vistaDeBuscador({ tipo, items: [uno], fallo: false, leida: true, consulta: tipo === 'clientes' ? 'juan' : 'mario' });
    assert.equal(conTexto.abierta, true);
    assert.equal(conTexto.filas.length, 1);
  });
}

test('la plantilla pone el aviso rojo ARRIBA de cada caja de búsqueda: la lista flotante cae debajo de la caja y ya no lo tapa', () => {
  // Esto prueba el ORDEN del HTML, no el dibujo: que la lista de resultados es
  // `position: absolute` justo debajo de la caja (css/estilos.css) se vio en el
  // navegador. Con el aviso debajo de la caja, esa lista lo tapaba.
  const html = plantilla();
  for (const prefijo of ['cliente', 'dueno']) {
    const aviso = html.indexOf(`id="sc-${prefijo}-aviso"`);
    const caja = html.indexOf(`id="sc-${prefijo}-buscar"`);
    const lista = html.indexOf(`id="sc-${prefijo}-resultados"`);
    assert.ok(aviso > -1 && caja > -1 && lista > -1, `${prefijo}: existen los tres`);
    assert.ok(aviso < caja, `${prefijo}: el aviso va antes de la caja`);
    assert.ok(aviso < lista, `${prefijo}: y antes de la lista flotante`);
  }
});

// ---------- Hora tardía: ya no se escribe al salir ----------
//
// Era la casilla «Hora tardía» (un sí/no que nada leía) y el Excel traía ahí un
// monto de Q150 que se imprimía en el contrato y se cobraba a mano. Se recuperó
// como un monto en este formulario y, cuando se le preguntó al dueño, dijo que
// la cobra «solo al devolver»: el campo se mudó a «Recibir carro»
// (`cierre.horaTardia`, pruebas/recibirCarro.test.mjs). Estas pruebas fijan que
// de aquí SALIÓ del todo: ni campo, ni lectura, ni línea en el total de la
// salida, ni llave en el contrato nuevo.

test('«Sacar carro» ya no pide la hora tardía: el campo no está en la plantilla', () => {
  const html = plantilla();
  assert.equal(html.includes('sc-hora-tardia'), false);
  assert.equal(html.includes('Hora tardía'), false);
  // Los cobros extra que sí se cobran al salir siguen ahí.
  assert.ok(html.includes('id="sc-carta-poder-precio"'));
  assert.ok(html.includes('id="sc-varios-precio"'));
});

test('el formulario no lee ninguna hora tardía, aunque el campo de antes viniera con un valor', () => {
  const { el, pedidos } = camposDeMentira(formularioDeCarroAjeno({ 'sc-hora-tardia': '150' }));
  const datos = leerFormularioDe(lectorDeCampos(el), {
    contratoId: 'c1', cliente: clienteJuan(), carro: null, duenoEscogido: null, tarjetas: [],
  }, 12);
  assert.equal(pedidos.has('sc-hora-tardia'), false, 'ni siquiera lo pide');
  assert.equal('horaTardia' in datos, false);

  const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-hora-tardia': '150' }));
  assert.equal('horaTardia' in guardado, false, 'un contrato nuevo no trae la llave');
  const r = resumen(guardado);
  assert.equal(r.totalSalida, 2800, 'solo los 4 días × Q700 de renta: nada de hora tardía al salir');
  assert.equal(r.saldo, 0);
});

test('construirContrato ignora una horaTardia que le pasen: no vuelve a entrar al total de la salida', () => {
  // Con los Q350 de carta poder de datosBase: 2,800 + 350, sin los 150.
  const contrato = construirContrato({ ...datosBase(), horaTardia: 150 });
  assert.equal('horaTardia' in contrato, false);
  assert.equal(resumen(contrato).totalSalida, 3150);
  assert.deepEqual(contrato, construirContrato(datosBase()), 'idéntico al contrato sin ella');
});

test('volver a guardar un contrato viejo (pagos, cierre, garantía) deja `horaTardia: true` tal cual: nunca se vuelve un número', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  const guardado = contratoParaGuardar(viejo, { id: viejo.id, numero: viejo.numero, ahora: 1790000009999 });
  assert.equal(guardado.horaTardia, true, 'el mismo booleano que ya traía, no 1 ni 150');
  assert.equal(guardado.estado, 'rentado');
  assert.equal(resumen(guardado).totalSalida, 3150, 'y el total que ya tenía');
});

test('volver a guardar un contrato de cuando se anotaba al salir deja su número y su total: Q3,300.00', () => {
  const alSalir = contratoGuardadoConHoraTardiaAlSalir();
  const guardado = contratoParaGuardar(alSalir, { id: alSalir.id, numero: alSalir.numero, ahora: 1790000009999 });
  assert.equal(guardado.horaTardia, 150, 'el mismo número que ya traía');
  assert.equal(resumen(guardado).totalSalida, 3300, 'y el total que mostró al guardarse');
  assert.equal(resumen(guardado).saldo, 0);
});

// ---------------------------------------------------------------------------
// La hora de salida se normaliza al LEER el formulario, no solo al salir del campo
// (revisión final, hallazgo 4). Antes dependía del oyente de `change`: si el
// navegador no alcanzaba a correrlo (Enter dentro del campo), lo que se guardaba
// era «1345», o «9:» tal cual. Estas pruebas corren el camino real —campo →
// lectura → contrato—, sin pasar por ningún oyente.
// ---------------------------------------------------------------------------

test('la hora de salida tecleada de corrido ("1345") se guarda como 13:45 sin que el campo la haya normalizado', () => {
  const { datos, guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-hora-salida': '1345' }));
  assert.equal(datos.horaSalida, '13:45', 'ya desde la lectura del formulario');
  assert.equal(guardado.horaSalida, '13:45');
});

test('una hora de salida a medias ("9:") se guarda VACÍA: no es un 09:00 que nadie escribió', () => {
  for (const aMedias of ['9:', '13:', ':30', '1:2:3']) {
    const { guardado } = contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-hora-salida': aMedias }));
    assert.equal(guardado.horaSalida, '', `con «${aMedias}»`);
  }
});

test('«1:30 pm» en la hora de salida se guarda como 13:30', () => {
  assert.equal(contratoDeLosCampos(formularioDeCarroAjeno({ 'sc-hora-salida': '1:30 pm' })).guardado.horaSalida, '13:30');
});

test('sin hora de salida el contrato se guarda igual, con la hora vacía', () => {
  assert.equal(contratoDeLosCampos(formularioDeCarroAjeno()).guardado.horaSalida, '');
});

// ---------------------------------------------------------------------------
// Lo que impide guardar una salida (antes estaba suelto dentro de guardar())
//
// Prueba del sistema (7 oct 2026): con un año de cinco dígitos en la fecha de salida
// («20261-10-21») el contrato se guardó, cobrado, con devolución prevista «+020261-10»,
// fuera de la lista del mes y sin tarjeta en la flota. Y con días o precio NEGATIVOS
// también: «Faltan los días o el precio» solo miraba el cero, así que «-3 días ×
// Q700 = -Q2,100.00» se guardaba tal cual.
// ---------------------------------------------------------------------------

const salidaLista = () => ({
  hayCliente: true, ajeno: false, hayCarroPropio: true, placasAjeno: '',
  fechaSalida: '2026-10-21', dias: 3, precioDia: 700, rentadoPor: 'Ana',
});

test('motivoParaNoGuardar: una salida completa no tiene motivo', () => {
  assert.equal(motivoParaNoGuardar(salidaLista()), null);
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), fechaSalida: '' }), null, 'sin fecha se usa la de hoy: no es un error');
});

test('motivoParaNoGuardar: conserva, palabra por palabra, los cinco avisos de siempre', () => {
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), hayCliente: false }), 'Elige o da de alta un cliente antes de guardar.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), hayCarroPropio: false }), 'Este carro ya no está disponible. Vuelve a la flota e intenta de nuevo.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), ajeno: true, hayCarroPropio: false, placasAjeno: '' }), 'Completa al menos las placas del carro ajeno.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), dias: 0 }), 'Faltan los días o el precio por día.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), precioDia: 0 }), 'Faltan los días o el precio por día.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), rentadoPor: '' }), 'Falta quién lo rentó.');
});

test('motivoParaNoGuardar: un carro ajeno con placas no necesita carro de la flota', () => {
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), ajeno: true, hayCarroPropio: false, placasAjeno: 'P-ABC123' }), null);
});

test('motivoParaNoGuardar: una fecha de salida que no existe no se guarda', () => {
  for (const fechaSalida of ['20261-10-21', '2026-02-30']) {
    assert.equal(motivoParaNoGuardar({ ...salidaLista(), fechaSalida }), 'La fecha de salida no es válida. Revisa el año.', fechaSalida);
  }
});

test('motivoParaNoGuardar: días o precio negativos no se guardan', () => {
  const texto = 'Los días y el precio por día no pueden ser negativos.';
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), dias: -3 }), texto);
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), precioDia: -700 }), texto);
});

test('guardar() de «Sacar carro» le pregunta a motivoParaNoGuardar, no repite las reglas', () => {
  const fuente = readFileSync(new URL('../js/pantallas/sacarCarro.js', import.meta.url), 'utf8');
  const guardar = fuente.slice(fuente.indexOf('async function guardar(ev)'));
  assert.match(guardar.slice(0, 1500), /motivoParaNoGuardar\(\{/);
  assert.ok(!/Faltan los días o el precio/.test(guardar), 'el texto vive en un solo lugar');
});

// Prueba del sistema (7 oct 2026): con internet caído y sin copia local de la flota, «Sacar carro»
// decía «No se encontró este carro, o ya no está disponible. Marca "carro ajeno" si es de otra
// persona» — como si el carro hubiera desaparecido, y empujando a rentarlo como ajeno (sin carroId,
// así que la flota nunca se enteraría de que salió). Lo que pasó es que no se pudo leer la flota.
test('textoCarroPropioNoEncontrado: «no está» solo si la flota se leyó bien', () => {
  assert.equal(
    textoCarroPropioNoEncontrado(false),
    'No se encontró este carro, o ya no está disponible. Marca "carro ajeno" si es de otra persona.',
  );
  const noLeida = textoCarroPropioNoEncontrado(true);
  assert.match(noLeida, /No se pudo leer la flota/);
  assert.ok(!/carro ajeno/.test(noLeida), 'no sugiere rentar como ajeno un carro que quizá es de la flota');
});

test('motivoParaNoGuardar: sin carro de la flota por un fallo de lectura, el motivo es el fallo, no «ya no está disponible»', () => {
  const motivo = motivoParaNoGuardar({ ...salidaLista(), hayCarroPropio: false, falloFlota: true });
  assert.match(motivo, /No se pudo leer la flota/);
  assert.equal(
    motivoParaNoGuardar({ ...salidaLista(), hayCarroPropio: false, falloFlota: false }),
    'Este carro ya no está disponible. Vuelve a la flota e intenta de nuevo.',
  );
});

// Prueba del sistema (7 oct 2026): en «Sacar carro» se escribió Q28,000 de monto en una renta de
// Q2,800 (un cero de más) y la pantalla no dijo nada: el contrato quedó con «A favor del cliente
// Q25,200.00». «Recibir carro» ya avisa de esto («Estás cobrando … y solo te debe …», nacido de un
// crédito de Q4,800 que nadie vio); la salida, el momento donde más dinero se escribe, no.
test('avisosConSobrecobro: cobrar más de lo que se debe hoy pone el aviso al principio, en rojo', () => {
  const otros = [{ nivel: 'alto', mensaje: 'La licencia del cliente venció.' }, { nivel: 'medio', mensaje: 'Devolvió tarde.' }];
  const r = avisosConSobrecobro(otros, 2800, 28000);
  assert.equal(r.length, 3);
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[0].mensaje, 'Estás cobrando Q28,000.00 y solo te debe Q2,800.00. Van a quedar Q25,200.00 a favor del cliente.');
  assert.deepEqual(r.slice(1), otros, 'los demás avisos quedan como estaban');
});

test('avisosConSobrecobro: cobrar lo justo, de menos o nada, no agrega nada (ni inventa un aviso con el anticipo)', () => {
  const otros = [{ nivel: 'medio', mensaje: 'Devolvió tarde.' }];
  assert.deepEqual(avisosConSobrecobro(otros, 2800, 2800), otros);
  assert.deepEqual(avisosConSobrecobro(otros, 2800, 300), otros, 'cobrar menos deja saldo pendiente, no es sobrecobro');
  assert.deepEqual(avisosConSobrecobro(otros, 2800, 0), otros);
  assert.deepEqual(avisosConSobrecobro([], 0, 0), []);
  // Con un anticipo ya pagado de Q500 en una renta de Q3,500 lo que se debe hoy es Q3,000: cobrar Q3,000 está bien.
  assert.deepEqual(avisosConSobrecobro([], montoSalidaConAnticipo(3500, { anticipoPagado: true, anticipo: 500 }), 3000), []);
  assert.equal(avisosConSobrecobro([], montoSalidaConAnticipo(3500, { anticipoPagado: true, anticipo: 500 }), 3500).length, 1, 'cobrar los Q3,500 completos otra vez SÍ es cobrar de más');
});

test('la pantalla de la salida compara el monto contra lo que se debe hoy (el sugerido, que ya descuenta el anticipo)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/sacarCarro.js', import.meta.url), 'utf8');
  assert.match(fuente, /avisosConSobrecobro\(avisos, montoSugerido, montoSinRecargo\)/);
});

// Prueba del sistema (7 oct 2026): una reservación de 2 días a Q700 con un anticipo de Q5,000 «ya
// pagado» (un cero de más). La salida lo descontaba, dejaba el monto en Q0.00 y no decía nada; el
// contrato quedaba con un pago de Q5,000 y Q3,600 a favor del cliente. La reservación es la que
// guarda reservas.js (construirReserva), no un objeto con las llaves a mano.
const reservaDeDosDias = (anticipo, anticipoPagado) => construirReserva({}, {
  clienteNombre: 'Ana López', fechaSalida: '2026-11-02', dias: 2, precioDia: 700, anticipo, anticipoPagado,
});

test('avisoAnticipoDeMas: un anticipo pagado mayor que la salida avisa cuánto queda a favor del cliente', () => {
  assert.equal(
    avisoAnticipoDeMas(1400, reservaDeDosDias(5000, true)),
    'El anticipo ya pagado (Q5,000.00) es más de lo que cuesta la salida (Q1,400.00). Van a quedar Q3,600.00 a favor del cliente.',
  );
});

test('avisoAnticipoDeMas: no avisa si el anticipo cabe en la salida, si está pendiente, si no hay reservación o si aún no hay total', () => {
  assert.equal(avisoAnticipoDeMas(1400, reservaDeDosDias(1400, true)), null, 'justo lo que cuesta: nada a favor');
  assert.equal(avisoAnticipoDeMas(1400, reservaDeDosDias(500, true)), null);
  assert.equal(avisoAnticipoDeMas(1400, reservaDeDosDias(5000, false)), null, 'pendiente: nunca se pagó, no se descuenta');
  assert.equal(avisoAnticipoDeMas(1400, null), null);
  assert.equal(avisoAnticipoDeMas(0, reservaDeDosDias(5000, true)), null, 'sin días o sin precio todavía no hay con qué comparar');
});

// Prueba del sistema (7 oct 2026): «2.5 días» cobraba 2.5 × el precio y la devolución prevista contaba 2: el
// dinero y la fecha de la misma renta contaban días distintos. El campo declara paso 1 y mínimo 1 (la pantalla
// no deja que el navegador lo exija); los cobros extra declaran mínimo 0, y un «Varios -200» era un descuento
// escondido en una línea de cobro.
test('motivoParaNoGuardar: los días tienen que ser enteros', () => {
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), dias: 2.5 }), 'Los días tienen que ser un número entero, sin decimales.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), dias: 0.5 }), 'Los días tienen que ser un número entero, sin decimales.');
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), dias: 30 }), null);
});

test('motivoParaNoGuardar: un cobro extra negativo no se guarda, y dice cuáles', () => {
  assert.equal(
    motivoParaNoGuardar({ ...salidaLista(), cobrosExtra: { variosPrecio: -200 } }),
    'No pueden ser negativos: Varios — precio.',
  );
  assert.equal(
    motivoParaNoGuardar({ ...salidaLista(), cobrosExtra: { seguroPaiDia: -5, cartaPoderPrecio: -350, deducibleBajo: 100 } }),
    'No pueden ser negativos: Seguro PAI, Carta poder — precio.',
  );
  assert.equal(motivoParaNoGuardar({ ...salidaLista(), cobrosExtra: { variosPrecio: 0, cartaPoderPrecio: 350 } }), null);
});

test('la pantalla de la salida le pasa a motivoParaNoGuardar los ocho cobros extra (si no, la regla existiría y no se prendería)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/sacarCarro.js', import.meta.url), 'utf8');
  for (const id of ['sc-seguro-dia', 'sc-seguro-terceros-dia', 'sc-seguro-menores-dia', 'sc-seguro-pai-dia', 'sc-deducible', 'sc-deducible-bajo', 'sc-carta-poder-precio', 'sc-varios-precio']) {
    assert.match(fuente, new RegExp(`cobrosExtra: \\{[^}]*num\\('${id}'\\)`), id);
  }
});
