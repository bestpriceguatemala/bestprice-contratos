// Pruebas de "Sacar carro": la parte pura, sin DOM.
//
// La que más importa es la del ADR-001: construirContrato no puede filtrar el
// número completo de la tarjeta ni el CBC porque ni siquiera los recibe —
// quien llama ya le pasa solo los últimos 4 dígitos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirContrato, ultimos4Digitos, leerParametroRuta, montoSalidaConAnticipo, conAnticipoComoPago,
  resultadosDeLista, avisoDeLista, conAltasDeHoy,
} from '../js/pantallas/sacarCarro.js';
import { resumen } from '../js/nucleo/contrato.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { agruparPorDueno } from '../js/nucleo/liquidacion.js';
import { resultadoLectura, contratoParaGuardar } from '../js/datos.js';

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
