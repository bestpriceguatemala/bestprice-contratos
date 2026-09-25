// Pruebas de "Sacar carro": la parte pura, sin DOM.
//
// La que más importa es la del ADR-001: construirContrato no puede filtrar el
// número completo de la tarjeta ni el CBC porque ni siquiera los recibe —
// quien llama ya le pasa solo los últimos 4 dígitos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirContrato, ultimos4Digitos } from '../js/pantallas/sacarCarro.js';
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
