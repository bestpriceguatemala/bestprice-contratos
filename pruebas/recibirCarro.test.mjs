// Pruebas de "Recibir carro": solo la parte pura, sin DOM.
//
// El cálculo del cobro ya vive en contrato.js/cierre.js y está probado ahí.
// Lo que se prueba aquí es lo propio de esta pantalla: el puente del
// kilometraje de salida, el texto del botón de pago, el aviso final, cómo
// se rotula un saldo negativo, y — ronda de corrección 1 — cuánto cuesta de
// verdad cobrar un abono parcial con tarjeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  conKmSalidaNormalizado, textoBotonPago, textoAvisoRecibido, textoSaldo, totalDeEstaCobranza,
  leerParametroRuta, textoAvisoCobro, valoresIniciales, textoCorreccion,
  textoEstadoPago, textoAvisoSobrecobro, montoInicialPago, leerCamposDelCierre,
} from '../js/pantallas/recibirCarro.js';
import { resumen } from '../js/nucleo/contrato.js';
import { agregarPago } from '../js/datos.js';

test('conKmSalidaNormalizado: compatibilidad con contratos guardados antes del cambio de nombre (kilometrajeSalida -> kmSalida)', () => {
  const contrato = { id: 'c1', kilometrajeSalida: 45000 };
  const normalizado = conKmSalidaNormalizado(contrato);
  assert.equal(normalizado.kmSalida, 45000);
  assert.equal(normalizado.kilometrajeSalida, 45000, 'no se pierde el campo original');
});

test('conKmSalidaNormalizado: si ya trae kmSalida, no lo pisa', () => {
  const contrato = { id: 'c1', kmSalida: 40000, kilometrajeSalida: 45000 };
  assert.equal(conKmSalidaNormalizado(contrato).kmSalida, 40000);
});

test('conKmSalidaNormalizado: sin ninguno de los dos campos, da 0 (no undefined)', () => {
  assert.equal(conKmSalidaNormalizado({ id: 'c1' }).kmSalida, 0);
});

test('conKmSalidaNormalizado: con contrato nulo, no revienta', () => {
  assert.equal(conKmSalidaNormalizado(null), null);
});

// Tarea "cobro-claro": "Recibir sin cobrar" era justo la frase que confundió
// al dueño en el incidente (contrato ya pagado por completo, y el botón
// sonaba a que algo faltaba). Ahora dice llanamente "Recibir carro".
test('textoBotonPago: sin nada que cobrar, dice "Recibir carro"', () => {
  assert.equal(textoBotonPago(0, 0), 'Recibir carro');
  assert.equal(textoBotonPago(-300, 0), 'Recibir carro', 'saldo a favor del cliente tampoco cobra');
  assert.equal(textoBotonPago(730, 0), 'Recibir carro', 'monto en cero, aunque haya saldo');
});

test('textoBotonPago: un abono menor que el saldo dice "Recibir y abonar"', () => {
  assert.equal(textoBotonPago(730, 500), 'Recibir y abonar');
});

test('textoBotonPago: el saldo completo dice "Recibir y cobrar"', () => {
  assert.equal(textoBotonPago(730, 730), 'Recibir y cobrar');
  assert.equal(textoBotonPago(730, 800), 'Recibir y cobrar', 'de más también cuenta como cobrado');
});

test('textoAvisoRecibido: con saldo pendiente, dice cuánto falta', () => {
  assert.equal(textoAvisoRecibido(14, 230), 'Contrato 14 recibido. Falta cobrar Q230.00.');
});

test('textoAvisoRecibido: sin saldo, dice que ya se cobró', () => {
  assert.equal(textoAvisoRecibido(14, 0), 'Contrato 14 recibido y cobrado.');
});

test('textoAvisoRecibido: con saldo a favor del cliente, tampoco falta cobrar', () => {
  assert.equal(textoAvisoRecibido(14, -50), 'Contrato 14 recibido y cobrado.');
});

test('textoSaldo: positivo se rotula "Saldo"', () => {
  assert.deepEqual(textoSaldo(730), { etiqueta: 'Saldo', monto: 730 });
});

test('textoSaldo: en cero también es "Saldo"', () => {
  assert.deepEqual(textoSaldo(0), { etiqueta: 'Saldo', monto: 0 });
});

test('textoSaldo: negativo se rotula "A favor del cliente" y se muestra en positivo', () => {
  assert.deepEqual(textoSaldo(-300), { etiqueta: 'A favor del cliente', monto: 300 });
});

// El ejemplo del diseño (contrato.test.mjs / cierre.test.mjs): 4 días a
// Q700, carta poder Q350, ya pagó Q3,150 al salir, y al recibirlo un día
// tarde con Q200 de daños, Q130 de combustible y Q300 de descuento, el
// saldo da Q730.00.
const contratoConCierre = () => ({
  dias: 4, precioDia: 700, cartaPoderPrecio: 350,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
});

test('totalDeEstaCobranza: un abono de Q500 al 12% de tarjeta cuesta Q560.00, no el recargo del saldo completo', () => {
  const r = totalDeEstaCobranza(contratoConCierre(), {
    monto: 500, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25',
  });
  assert.deepEqual(r, { total: 560, recargo: 60 });
});

test('totalDeEstaCobranza: saldar los Q730 completos al 12% sigue dando Q817.60', () => {
  const r = totalDeEstaCobranza(contratoConCierre(), {
    monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25',
  });
  assert.deepEqual(r, { total: 817.6, recargo: 87.6 });
});

test('totalDeEstaCobranza: un abono en efectivo cobra exactamente lo escrito, sin recargo', () => {
  const r = totalDeEstaCobranza(contratoConCierre(), {
    monto: 500, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25',
  });
  assert.deepEqual(r, { total: 500, recargo: 0 });
});

test('totalDeEstaCobranza: sin monto (o en cero), no hay nada que cobrar', () => {
  assert.deepEqual(totalDeEstaCobranza(contratoConCierre(), { monto: 0, forma: 'efectivo', porcentajeTarjeta: 0 }), { total: 0, recargo: 0 });
});

test('el abono de Q500 con tarjeta deja Q230.00 pendientes (no se toca el saldo por el recargo)', () => {
  const conAbono = agregarPago(contratoConCierre(), { monto: 500, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-08-25' });
  assert.equal(resumen(conAbono).saldo, 230);
});

// Tarea 5: el "Cobrar" de flota.js abre esta pantalla en modo de solo cobro
// pegando "?cobro=1" al id, porque el enrutador (router.js) no sabe nada de
// parámetros de consulta — leerParametroRuta es quien separa las dos cosas.
test('leerParametroRuta: un id normal (modo completo) no trae "cobro"', () => {
  assert.deepEqual(leerParametroRuta('c1'), { contratoId: 'c1', soloCobro: false });
});

test('leerParametroRuta: "id?cobro=1" separa el id real y marca el modo de solo cobro', () => {
  assert.deepEqual(leerParametroRuta('c1?cobro=1'), { contratoId: 'c1', soloCobro: true });
});

test('leerParametroRuta: cualquier otro valor de "cobro" no activa el modo de solo cobro', () => {
  assert.deepEqual(leerParametroRuta('c1?cobro=0'), { contratoId: 'c1', soloCobro: false });
  assert.deepEqual(leerParametroRuta('c1?otro=1'), { contratoId: 'c1', soloCobro: false });
});

test('leerParametroRuta: sin nada, no revienta', () => {
  assert.deepEqual(leerParametroRuta(undefined), { contratoId: '', soloCobro: false });
});

test('textoAvisoCobro: con saldo pendiente, dice cuánto falta (nunca dice "recibido")', () => {
  assert.equal(textoAvisoCobro(14, 230), 'Abono registrado en el contrato 14. Falta cobrar Q230.00.');
});

test('textoAvisoCobro: saldo en cero, dice que se cobró por completo', () => {
  assert.equal(textoAvisoCobro(14, 0), 'Contrato 14 cobrado por completo.');
});

test('textoAvisoCobro: saldo a favor del cliente, tampoco falta cobrar', () => {
  assert.equal(textoAvisoCobro(14, -50), 'Contrato 14 cobrado por completo.');
});

// CRÍTICO de la revisión final: el botón "atrás" del navegador reabría un
// cierre ya hecho sobre una pantalla en blanco, lista para pisar los daños y
// el descuento negociados con `{fechaReal: hoy, danos: 0, descuento: 0}`.
// valoresIniciales es lo que ahora decide con qué se prellena el formulario.
test('valoresIniciales: sin cierre todavía, arranca en blanco con la fecha de hoy (no es corrección)', () => {
  assert.deepEqual(valoresIniciales({ id: 'c1' }, '2026-09-25'), { fechaReal: '2026-09-25' });
  assert.deepEqual(valoresIniciales(null, '2026-09-25'), { fechaReal: '2026-09-25' });
});

test('valoresIniciales: con un cierre ya guardado, prellena TODO el cierre real (modo de corrección)', () => {
  const contrato = {
    id: 'c1',
    cierre: {
      fechaReal: '2026-08-25', horaReal: '10:30', lugarEntrada: 'OFICINA',
      kmEntrada: 45600, combustible: 130, danos: 200, danosDetalle: 'Rayón en la puerta',
      varios: 0, descuento: 300,
    },
  };
  const iniciales = valoresIniciales(contrato, '2026-09-25');
  // El cierre real entero, tal cual — nunca la fecha de hoy ni campos en
  // blanco: es justo lo que hubiera pisado los daños y el descuento.
  assert.deepEqual(iniciales, contrato.cierre);
  assert.equal(iniciales.danos, 200, 'los daños negociados no desaparecen');
  assert.equal(iniciales.descuento, 300, 'el descuento negociado no desaparece');
});

test('textoCorreccion: null cuando el contrato todavía no tiene cierre', () => {
  assert.equal(textoCorreccion({ id: 'c1' }), null);
  assert.equal(textoCorreccion(null), null);
});

test('textoCorreccion: nombra la fecha real, formateada, cuando ya se recibió', () => {
  const contrato = { id: 'c1', cierre: { fechaReal: '2026-08-25' } };
  assert.equal(textoCorreccion(contrato), 'Este contrato ya se recibió el 25 ago 2026 — estás corrigiendo el cierre.');
});

// ---------- textoEstadoPago ----------
//
// El texto que reemplaza al "Saldo"/"A favor del cliente" ambiguo cuando no
// hay nada que cobrar: en cero dice que ya está pagado completo; negativo lo
// dice tal cual, en positivo y a favor del cliente (nunca escondido detrás
// de un "pagado completo" que no sería cierto).
test('textoEstadoPago: en cero, dice que el contrato ya está pagado completo', () => {
  assert.equal(textoEstadoPago(0), 'Este contrato ya está pagado completo.');
});

test('textoEstadoPago: negativo, dice el monto a favor del cliente en positivo', () => {
  assert.equal(textoEstadoPago(-300), 'Este contrato quedó con Q300.00 a favor del cliente.');
});

// ---------- textoAvisoSobrecobro ----------
//
// El aviso del incidente que motivó toda esta tarea: cobrar más de lo que un
// contrato debe. `null` cuando no aplica; nunca bloquea, solo avisa antes de
// guardar (el mostrador puede seguir adelante si de verdad quiere cobrar de
// más, por ejemplo a cuenta de la próxima renta).
test('textoAvisoSobrecobro: cobrar más del saldo avisa cuánto va a quedar a favor del cliente', () => {
  assert.equal(
    textoAvisoSobrecobro(730, 4800),
    'Estás cobrando Q4,800.00 y solo te debe Q730.00. Van a quedar Q4,070.00 a favor del cliente.',
  );
});

test('textoAvisoSobrecobro: un monto menor o igual al saldo no avisa nada', () => {
  assert.equal(textoAvisoSobrecobro(730, 500), null, 'un abono parcial no es sobrecobro');
  assert.equal(textoAvisoSobrecobro(730, 730), null, 'cobrar justo el saldo tampoco es sobrecobro');
});

test('textoAvisoSobrecobro: sin saldo pendiente (en cero o a favor del cliente), no aplica', () => {
  assert.equal(textoAvisoSobrecobro(0, 100), null);
  assert.equal(textoAvisoSobrecobro(-50, 100), null);
});

// ---------- montoInicialPago ----------
//
// IMPORTANTE 3 de la revisión final: reabrir un cierre YA guardado para
// corregir un dato (kilometraje, nota...) prellenaba el campo de pago con
// el saldo completo, así que "Guardar correcciones" registraba un pago que
// nadie hizo — el reproducido en vivo del hallazgo era exactamente un
// contrato que debía Q380, reabierto para corregir, con 380 ya escrito en
// el campo. Estas pruebas fijan que una corrección arranca en 0 y que las
// otras dos situaciones (recibir por primera vez, y el modo de solo cobro)
// siguen prellenando el saldo como siempre.
test('montoInicialPago: recibir carro por primera vez, prellena el saldo completo', () => {
  assert.equal(montoInicialPago(380, { enCorreccion: false, soloCobro: false }), 380);
});

test('montoInicialPago: en modo de corrección (no solo cobro), arranca en 0 aunque haya saldo', () => {
  assert.equal(montoInicialPago(380, { enCorreccion: true, soloCobro: false }), 0);
});

test('montoInicialPago: el modo de solo cobro SÍ prellena el saldo, aunque el contrato ya tenga cierre (enCorreccion true)', () => {
  // "Pendientes de cobro" (flota.js) abre esta pantalla justo para cobrar:
  // ahí el prellenado es la acción que el mostrador vino a hacer, no un
  // efecto colateral de guardar una corrección.
  assert.equal(montoInicialPago(380, { enCorreccion: true, soloCobro: true }), 380);
});

test('montoInicialPago: sin saldo pendiente, siempre da 0 sin importar el modo', () => {
  assert.equal(montoInicialPago(0, { enCorreccion: false, soloCobro: false }), 0);
  assert.equal(montoInicialPago(-50, { enCorreccion: false, soloCobro: true }), 0);
});

// ---------------------------------------------------------------------------
// La hora real de entrada se normaliza al LEER el cierre, no solo al salir del
// campo (revisión final, hallazgo 4). Antes el cierre leía el campo en crudo y
// dependía de que el oyente de `change` hubiera corrido.
// ---------------------------------------------------------------------------

/** Lectores de campos de mentira: un id que nadie llenó es un campo vacío, como en la pantalla. */
const lectoresDe = (valores = {}) => ({
  texto: (id) => String(valores[id] ?? '').trim(),
  num: (id) => Number(valores[id] ?? 0) || 0,
});

test('el cierre lee la hora real ya normalizada: "1345" es 13:45 aunque ningún oyente haya corrido', () => {
  assert.equal(leerCamposDelCierre(lectoresDe({ 'rc-hora-real': '1345' })).horaReal, '13:45');
  assert.equal(leerCamposDelCierre(lectoresDe({ 'rc-hora-real': '9:5' })).horaReal, '09:05');
  assert.equal(leerCamposDelCierre(lectoresDe({ 'rc-hora-real': '1:30 pm' })).horaReal, '13:30');
});

test('el cierre lee una hora real a medias ("9:") como vacía, no como las 09:00', () => {
  for (const aMedias of ['9:', '13:', ':30']) {
    assert.equal(leerCamposDelCierre(lectoresDe({ 'rc-hora-real': aMedias })).horaReal, '', aMedias);
  }
});

test('leerCamposDelCierre trae los mismos campos de siempre, y la fecha real vacía se queda vacía (no se rellena con hoy)', () => {
  const campos = leerCamposDelCierre(lectoresDe({
    'rc-fecha-real': '', 'rc-lugar-entrada': ' Oficina ', 'rc-km-entrada': '45100', 'rc-danos': '200',
  }));
  assert.deepEqual(Object.keys(campos).sort(), [
    'combustible', 'danos', 'danosDetalle', 'descuento', 'fechaReal', 'horaReal', 'kmEntrada', 'lugarEntrada', 'varios', 'variosDetalle',
  ]);
  assert.equal(campos.fechaReal, '', 'problemasDelCierre necesita ver ese vacío para avisar que falta');
  assert.equal(campos.lugarEntrada, 'Oficina');
  assert.equal(campos.kmEntrada, 45100);
  assert.equal(campos.danos, 200);
});

test('todos los ids que lee el cierre existen en la plantilla de la pantalla (un id mal escrito se leería vacío sin avisar)', () => {
  const pedidos = new Set();
  leerCamposDelCierre({ texto: (id) => { pedidos.add(id); return ''; }, num: (id) => { pedidos.add(id); return 0; } });
  const fuente = readFileSync(new URL('../js/pantallas/recibirCarro.js', import.meta.url), 'utf8');
  const plantilla = fuente.slice(fuente.indexOf('function plantilla'));
  assert.ok(plantilla.length > 1000, 'se encontró la plantilla');
  for (const id of pedidos) assert.ok(plantilla.includes(`'${id}'`) || plantilla.includes(`id="${id}"`), `${id} no está en la plantilla`);
});
