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
  leerParametroRuta, textoAvisoCobro, valoresIniciales, textoCorreccion, textoNotaDeSoloCobro, fechaDelCobro,
  textoEstadoPago, textoAvisoSobrecobro, montoInicialPago, leerCamposDelCierre, plantilla, textoFalloAlGuardarElCierre,
} from '../js/pantallas/recibirCarro.js';
import { resumen, lineasDevolucion, saldoConTarjeta } from '../js/nucleo/contrato.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { agregarPago, CODIGO_GARANTIA_LIBERADA_CON_SALDO } from '../js/datos.js';
import { contratoGuardadoConHoraTardiaSiNo } from './fixtures/contratoGuardadoConHoraTardiaSiNo.mjs';
import { contratoGuardadoConHoraTardiaAlSalir } from './fixtures/contratoGuardadoConHoraTardiaAlSalir.mjs';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';

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

test('textoAvisoRecibido: con saldo a favor del cliente, no dice «cobrado»: dice cuánto queda a su favor', () => {
  assert.equal(textoAvisoRecibido(14, -50), 'Contrato 14 recibido. Quedaron Q50.00 a favor del cliente.');
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

test('textoAvisoCobro: saldo a favor del cliente, no dice «por completo»: dice cuánto queda a su favor', () => {
  assert.equal(textoAvisoCobro(14, -50), 'Abono registrado en el contrato 14. Quedaron Q50.00 a favor del cliente.');
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
    'combustible', 'danos', 'danosDetalle', 'descuento', 'fechaReal', 'horaReal', 'horaTardia', 'kmEntrada', 'lugarEntrada', 'varios', 'variosDetalle',
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

// ---------------------------------------------------------------------------
// La hora tardía se escribe AL RECIBIR el carro (no al sacarlo)
//
// El dueño la cobra «solo al devolver»: es un monto del cierre, igual que los
// varios o el combustible, y entra al total de la devolución. Estas pruebas
// corren el camino real —campo de la pantalla → leerCamposDelCierre →
// construirCierre → resumen—, con cifras exactas sobre el ejemplo de la §5.
// ---------------------------------------------------------------------------

/** Un contrato nuevo: sale con el ejemplo de la §5 y, desde ahora, sin `horaTardia` en la salida. */
const contratoNuevoSinHoraTardia = () => {
  const { horaTardia: _casilla, ...sinCasilla } = contratoGuardadoConHoraTardiaSiNo();
  return sinCasilla;
};

/** Lo que el mostrador teclea al recibir el carro del ejemplo (1 día tarde, Q200 de daños, Q130, −Q300). */
const camposTecleados = (extra = {}) => ({
  'rc-fecha-real': '2026-09-28', 'rc-km-entrada': '45600', 'rc-danos': '200', 'rc-combustible': '130', 'rc-descuento': '300',
  ...extra,
});

test('leerCamposDelCierre lee «Hora tardía — precio» como un monto: 150 es el número 150', () => {
  assert.equal(leerCamposDelCierre(lectoresDe({ 'rc-hora-tardia': '150' })).horaTardia, 150);
  assert.equal(typeof leerCamposDelCierre(lectoresDe({ 'rc-hora-tardia': '150' })).horaTardia, 'number');
  assert.equal(leerCamposDelCierre(lectoresDe()).horaTardia, 0, 'sin tocar el campo, cero');
  // Los centavos de más los redondea construirCierre (pruebas/cierre.test.mjs).
  const campos = leerCamposDelCierre(lectoresDe(camposTecleados({ 'rc-hora-tardia': '150.005' })));
  assert.equal(construirCierre(contratoNuevoSinHoraTardia(), campos).cierre.horaTardia, 150.01);
});

test('Q150 en «Hora tardía — precio» al recibir sube el total de la DEVOLUCIÓN a Q880, y deja la salida en Q3,150', () => {
  const campos = leerCamposDelCierre(lectoresDe(camposTecleados({ 'rc-hora-tardia': '150' })));
  const conCierre = construirCierre(contratoNuevoSinHoraTardia(), campos);
  assert.equal(conCierre.cierre.horaTardia, 150, 'se guarda en el cierre, como número');
  assert.equal('horaTardia' in conCierre, false, 'y no en el contrato');

  const r = resumen(conCierre);
  assert.equal(r.totalSalida, 3150, 'Total al salir: no se mueve');
  assert.equal(r.totalDevolucion, 880, 'Total al recibir: 730 del ejemplo + 150');
  assert.equal(r.subtotal, 4030);
  assert.equal(r.saldo, 880, 'lo que ya pagó es solo lo de la salida: 3,150');
  assert.deepEqual(lineasDevolucion(conCierre).map((l) => [l.concepto, l.monto]), [
    ['Cobro días de atraso', 700], ['Daños', 200], ['Combustible', 130], ['Hora tardía', 150], ['Descuento', -300],
  ]);
});

test('sin tocar «Hora tardía — precio» el cierre da el ejemplo de la §5 tal cual: Q730 al recibir y Q817.60 con tarjeta', () => {
  const campos = leerCamposDelCierre(lectoresDe(camposTecleados()));
  const conCierre = construirCierre(contratoNuevoSinHoraTardia(), campos);
  assert.equal(conCierre.cierre.horaTardia, 0);
  const r = resumen(conCierre);
  assert.equal(r.totalDevolucion, 730);
  assert.equal(r.subtotal, 3880);
  assert.deepEqual(saldoConTarjeta(conCierre, 12), { saldo: 730, recargo: 87.6, total: 817.6 });
});

test('cobrar la hora tardía con tarjeta: los Q880 del saldo cuestan Q985.60, con Q105.60 de recargo', () => {
  const campos = leerCamposDelCierre(lectoresDe(camposTecleados({ 'rc-hora-tardia': '150' })));
  const conCierre = construirCierre(contratoNuevoSinHoraTardia(), campos);
  assert.deepEqual(
    totalDeEstaCobranza(conCierre, { monto: 880, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-09-28' }),
    { total: 985.6, recargo: 105.6 },
  );
});

test('la plantilla de recibir pide la hora tardía como un campo de monto dentro de «Al recibir el carro», junto a los varios', () => {
  const html = plantilla(contratoNuevoSinHoraTardia(), false);
  assert.match(html, /<input type="number" id="rc-hora-tardia" value=""[^>]*step="0.01"[^>]*min="0"/);
  assert.ok(html.includes('Hora tardía — precio'));
  const inicio = html.indexOf('Al recibir el carro');
  const fin = html.indexOf('</section>', inicio);
  const campo = html.indexOf('id="rc-hora-tardia"');
  const varios = html.indexOf('id="rc-varios"');
  assert.ok(inicio > -1 && fin > inicio, 'existe el bloque');
  assert.ok(campo > inicio && campo < fin, 'el campo está dentro del bloque «Al recibir el carro»');
  assert.ok(campo < varios && varios < fin, 'y va justo antes de los varios');
});

test('en el modo de solo cobro no se dibuja el campo: el cierre ya está hecho y no se reedita desde ahí', () => {
  assert.equal(plantilla(contratoNuevoSinHoraTardia(), true).includes('rc-hora-tardia'), false);
});

test('al corregir un cierre ya guardado, el campo trae la hora tardía que se guardó', () => {
  const cerrado = construirCierre(contratoNuevoSinHoraTardia(), leerCamposDelCierre(lectoresDe(camposTecleados({ 'rc-hora-tardia': '150' }))));
  assert.match(plantilla(cerrado, false), /id="rc-hora-tardia" value="150"/);
});

test('el campo arranca vacío —no en «0», no en «1»— cuando el contrato no trae ninguna hora tardía en el cierre', () => {
  const vacio = /id="rc-hora-tardia" value=""/;
  assert.match(plantilla(contratoNuevoSinHoraTardia(), false), vacio, 'recibir por primera vez');
  const sinHora = construirCierre(contratoNuevoSinHoraTardia(), leerCamposDelCierre(lectoresDe(camposTecleados())));
  assert.match(plantilla(sinHora, false), vacio, 'cierre guardado sin hora tardía (se guardó 0)');
  // Un contrato viejo con la casilla marcada: `true` no es un monto, ni 1 ni nada.
  assert.match(plantilla(contratoGuardadoConHoraTardiaSiNo(), false), vacio, 'horaTardia: true');
  // Uno de cuando se anotaba al salir: sus Q150 ya están en su total de la salida, no se repiten aquí.
  assert.match(plantilla(contratoGuardadoConHoraTardiaAlSalir(), false), vacio, 'horaTardia: 150 en la salida');
});

test('un contrato viejo con `true`, al recibirlo sin anotar nada, queda igual que siempre: Q3,880.00 de subtotal', () => {
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaSiNo(), leerCamposDelCierre(lectoresDe(camposTecleados())));
  assert.equal(cerrado.horaTardia, true, 'el booleano viejo sigue tal cual');
  assert.equal(cerrado.cierre.horaTardia, 0);
  assert.equal(resumen(cerrado).subtotal, 3880);
});

test('un contrato guardado con la hora tardía en la salida, al recibirlo, conserva sus Q3,300.00 de salida y no la cobra otra vez', () => {
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaAlSalir(), leerCamposDelCierre(lectoresDe(camposTecleados())));
  assert.equal(cerrado.cierre.horaTardia, 0);
  const r = resumen(cerrado);
  assert.equal(r.totalSalida, 3300);
  assert.equal(r.totalDevolucion, 730);
  assert.equal(r.subtotal, 4030);
});

// Enter dentro de un campo no puede recibir el carro y cobrar el saldo (prueba del sistema,
// 7 oct 2026): la pantalla no tiene arnés de DOM en esta suite, así que lo que se fija aquí es
// el cableado — que el formulario del cierre se conecta al bloqueo y el de solo cobro no.
test('el formulario del cierre bloquea Enter; el de solo cobro, que existe para cobrar, no', () => {
  const fuente = readFileSync(new URL('../js/pantallas/recibirCarro.js', import.meta.url), 'utf8');
  assert.match(fuente, /import\s*\{[^}]*bloquearEnterEnElFormulario[^}]*\}\s*from '\.\.\/ui\.js'/, 'se importa del lugar donde se prueba');
  assert.match(fuente, /if \(!soloCobro\) bloquearEnterEnElFormulario\(el\('rc-form'\)\);/, 'se conecta al formulario del cierre, no al de solo cobro');
});

// Prueba del sistema (7 oct 2026): corregir hacia ARRIBA el cierre de una renta cuya garantía ya se
// soltó (la fecha de entrada era un día más tarde, por ejemplo) dejaba el botón «Guardar correcciones»
// encendido y, al apretarlo, decía «No se pudo guardar el cierre. Intenta de nuevo.» — para siempre:
// guardarContrato se niega mientras quede saldo con la garantía ya liberada, y reintentar no cambia nada.
test('textoFalloAlGuardarElCierre: un fallo cualquiera sigue pidiendo intentar de nuevo', () => {
  assert.equal(textoFalloAlGuardarElCierre(new Error('La nube no respondió a tiempo.')), 'No se pudo guardar el cierre. Intenta de nuevo.');
  assert.equal(textoFalloAlGuardarElCierre(undefined), 'No se pudo guardar el cierre. Intenta de nuevo.');
});

test('textoFalloAlGuardarElCierre: el rechazo por garantía ya liberada dice por qué y qué sí funciona, no «intenta de nuevo»', () => {
  const texto = textoFalloAlGuardarElCierre(Object.assign(new Error('Todavía debe Q1,540.00.'), { codigo: CODIGO_GARANTIA_LIBERADA_CON_SALDO }));
  assert.match(texto, /garantía/);
  assert.match(texto, /liberada/);
  assert.match(texto, /Monto sin recargo de tarjeta/, 'dice dónde escribir lo que se cobra');
  assert.ok(!/intenta de nuevo/i.test(texto), 'reintentar no lo arregla');
});

test('guardar() del cierre usa textoFalloAlGuardarElCierre en su catch', () => {
  const fuente = readFileSync(new URL('../js/pantallas/recibirCarro.js', import.meta.url), 'utf8');
  assert.match(fuente, /aviso\(textoFalloAlGuardarElCierre\(error\), 'error'\)/);
});

// «Pendientes de cobro» (flota.js) ofrece «Cobrar» en cualquier renta con saldo, haya vuelto el
// carro o no. La nota de la pantalla de solo cobro decía siempre «El cierre ya está hecho».
test('textoNotaDeSoloCobro: con el carro recibido dice que el cierre ya está hecho', () => {
  const recibido = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9, recibidoEl: '2026-10-06' });
  assert.match(textoNotaDeSoloCobro(recibido), /El cierre de este contrato ya está hecho/);
});

test('textoNotaDeSoloCobro: con el carro todavía afuera NO dice que hay un cierre, y dice lo que falta', () => {
  const afuera = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9 });
  const texto = textoNotaDeSoloCobro(afuera);
  assert.doesNotMatch(texto, /cierre de este contrato ya está hecho/);
  assert.match(texto, /todavía no se ha recibido/);
});

// La pantalla es la que sabe qué día es hoy: las DOS veces que pregunta qué impide guardar el cierre
// (al repintar y al guardar) le pasa hoyISO(). Sin eso el candado de «un carro no se recibe mañana»
// existiría en el núcleo y nunca se prendería.
test('recibirCarro.js le pasa el día de hoy a problemasDelCierre en sus dos llamadas', () => {
  const fuente = readFileSync(new URL('../js/pantallas/recibirCarro.js', import.meta.url), 'utf8');
  const llamadas = fuente.match(/problemasDelCierre\(contrato, campos[^)]*\)/g) ?? [];
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas.every((l) => l.includes('hoyISO()')), llamadas.join(' | '));
});

// Prueba del sistema (7 oct 2026): al corregir el cierre de una renta ya guardada se cobraron Q1,400 hoy
// y el pago quedó fechado el 22 de octubre —la fecha que se había tecleado en el campo de entrada—,
// un día que todavía no llegaba. El dinero entra el día que entra.
test('fechaDelCobro: al recibir por primera vez, la fecha de entrada; al corregir o en solo cobro, hoy', () => {
  const base = { campos: { fechaReal: '2026-10-22' }, hoy: '2026-11-02' };
  assert.equal(fechaDelCobro({ ...base, soloCobro: false, enCorreccion: false }), '2026-10-22');
  assert.equal(fechaDelCobro({ ...base, soloCobro: false, enCorreccion: true }), '2026-11-02');
  assert.equal(fechaDelCobro({ ...base, soloCobro: true, enCorreccion: true }), '2026-11-02');
  assert.equal(fechaDelCobro({ ...base, soloCobro: true, enCorreccion: false }), '2026-11-02');
});

// El «Cobrar» de «Pendientes de cobro» (modo de solo cobro) no dibuja el bloque del cierre: `campos` es null.
// Una primera versión de fechaDelCobro leía campos.fechaReal siempre y la pantalla se quedaba sin responder.
test('fechaDelCobro: en solo cobro `campos` es null y no se toca', () => {
  assert.equal(fechaDelCobro({ soloCobro: true, enCorreccion: true, campos: null, hoy: '2026-11-02' }), '2026-11-02');
  assert.equal(fechaDelCobro({ soloCobro: true, enCorreccion: false, campos: null, hoy: '2026-11-02' }), '2026-11-02');
});

test('recibirCarro.js usa fechaDelCobro en el total que muestra y en el pago que guarda (si no, la pantalla dice una fecha y guarda otra)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/recibirCarro.js', import.meta.url), 'utf8');
  assert.equal((fuente.match(/fecha: fechaDelCobro\(/g) ?? []).length, 2);
  assert.ok(!/fecha: campos\.fechaReal/.test(fuente), 'ya no se fecha un cobro con la fecha de entrada tecleada a secas');
  assert.ok(!/fechaDelCobro\([^)]*campos\.fechaReal/.test(fuente), 'la pantalla no lee campos.fechaReal por su cuenta: en solo cobro campos es null');
});
