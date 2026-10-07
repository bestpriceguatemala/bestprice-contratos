// Pruebas del cobro de un contrato.
//
// La prueba que manda es "el ejemplo del diseño": 4 días a Q700, devuelto un día
// tarde, con carta poder, daños, combustible, descuento y 12 % de tarjeta. Tiene
// que dar Q4,345.60. Si algún día deja de dar ese número, algo se rompió.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lineasSalida, lineasDevolucion, resumen, saldoConTarjeta, horaTardiaDe,
} from '../js/nucleo/contrato.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { contratoGuardadoConHoraTardiaSiNo } from './fixtures/contratoGuardadoConHoraTardiaSiNo.mjs';
import { contratoGuardadoConHoraTardiaAlSalir } from './fixtures/contratoGuardadoConHoraTardiaAlSalir.mjs';

/** El contrato del ejemplo de la §5 del diseño, ya cobrado por completo. */
const ejemplo = () => ({
  dias: 4,
  precioDia: 700,
  seguroMenoresDia: 0,
  seguroPaiDia: 0,
  deducibleBajo: 0,
  cartaPoderPrecio: 350,
  variosPrecio: 0,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [
    { monto: 3150, porcentajeTarjeta: 12 },   // al salir: renta y carta poder
    { monto: 730, porcentajeTarjeta: 12 },    // al devolver: atraso, daños, combustible, menos descuento
  ],
});

test('al salir se cobra la renta, la carta poder y los varios', () => {
  const lineas = lineasSalida(ejemplo());
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [
    ['Renta', 2800],
    ['Carta poder', 350],
  ]);
});

// Revisión final: el detalle mostraba "4 días × Q700" en vez de "Q700.00",
// un monto sin centavos en el único lugar del sistema donde eso pasaba.
test('el detalle de la renta y del atraso llevan el precio con dos decimales', () => {
  const salida = lineasSalida(ejemplo()).find((l) => l.concepto === 'Renta');
  assert.equal(salida.detalle, '4 días × Q700.00');
  const devolucion = lineasDevolucion(ejemplo()).find((l) => l.concepto === 'Cobro días de atraso');
  assert.equal(devolucion.detalle, '1 × Q700.00');
});

test('los seguros por día se cobran por los días contratados', () => {
  const c = { ...ejemplo(), seguroMenoresDia: 50, seguroPaiDia: 25, deducibleBajo: 400 };
  const lineas = lineasSalida(c);
  const extra = lineas.find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 700, '(50 + 25) × 4 días + 400 de deducible bajo');
});

test('en la devolución se cobran los seguros por día de los días de atraso', () => {
  const c = { ...ejemplo(), seguroMenoresDia: 50, seguroPaiDia: 25, deducibleBajo: 400 };
  const extra = lineasDevolucion(c).find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 75, '(50 + 25) × 1 día de atraso, sin repetir el deducible bajo');
});

test('en la devolución se cobra el atraso, los daños y el combustible, menos el descuento', () => {
  const lineas = lineasDevolucion(ejemplo());
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [
    ['Cobro días de atraso', 700],
    ['Daños', 200],
    ['Combustible', 130],
    ['Descuento', -300],
  ]);
});

// CRÍTICO de la revisión final: "Varios" (la llave perdida, el lavado, la
// silla de bebé no devuelta) se guardaba en el cierre pero lineasDevolucion
// nunca emitía una línea para él, así que nunca subía el saldo — el
// mostrador tecleaba Q150 y la pantalla no se movía. La prueba que hacía
// falta y que dejó pasar esto dos rondas de revisión: no basta con
// comprobar que el campo se guardó (eso ya lo hacía cierre.test.mjs), hay
// que comprobar que el SALDO se mueve.
test('CRÍTICO: "Varios" al recibir el carro sí se cobra — mueve el saldo, no solo se guarda', () => {
  const c = { ...ejemplo(), cierre: { ...ejemplo().cierre, varios: 150, variosDetalle: 'Silla de bebé no devuelta' } };

  const linea = lineasDevolucion(c).find((l) => l.concepto === 'Varios');
  assert.ok(linea, 'lineasDevolucion tiene que emitir una línea de Varios');
  assert.equal(linea.monto, 150);
  assert.equal(linea.detalle, 'Silla de bebé no devuelta');

  const saldoSinVarios = resumen(ejemplo()).saldo; // 0: el ejemplo ya está cobrado por completo
  const saldoConVarios = resumen(c).saldo;
  assert.equal(saldoSinVarios, 0);
  assert.equal(saldoConVarios, 150, 'los Q150 de Varios tienen que aparecer como saldo por cobrar');
});

test('el ejemplo del diseño da Q4,345.60', () => {
  const r = resumen(ejemplo());
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalSalida, 3150, 'renta más carta poder');
  assert.equal(r.totalDevolucion, 730, 'atraso más daños más combustible menos descuento');
  assert.equal(r.subtotal, 3880, 'lo mismo que daría la hoja CONTRATOS del Excel');
  assert.equal(r.pagado, 4345.6, 'los dos pagos, cada uno con su 12 %');
  assert.equal(r.saldo, 0, 'ya no debe nada');
  assert.equal(r.totalCobrado, 4345.6);
});

test('mientras no paga la devolución, se ve lo que falta y lo que costaría con tarjeta', () => {
  const c = { ...ejemplo(), pagos: [{ monto: 3150, porcentajeTarjeta: 12 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3528, 'lo que pagó al salir, con su 12 %');
  assert.equal(r.saldo, 730, 'el saldo se ve sin recargo: todavía no se sabe cómo va a pagar');
  assert.deepEqual(saldoConTarjeta(c, 12), { saldo: 730, recargo: 87.6, total: 817.6 });
  assert.deepEqual(saldoConTarjeta(c, 0), { saldo: 730, recargo: 0, total: 730 });
});

test('sin devolución todavía, solo se debe lo de la salida', () => {
  const c = { ...ejemplo(), cierre: null, pagos: [] };
  const r = resumen(c);
  assert.equal(r.diasAtraso, 0);
  assert.equal(r.totalDevolucion, 0);
  assert.equal(r.saldo, 3150, 'la renta y la carta poder');
  assert.equal(r.totalCobrado, 0);
});

// Revisión final: un descuento grande podía dejar el saldo negativo, y
// Math.max(0, ...) lo escondía detrás de un 0 que decía "está a mano" cuando
// en realidad el negocio le debe al cliente. "Nunca ajustar una cifra para
// que cuadre" — el número honesto es negativo, no cero.
test('un descuento grande deja un saldo negativo: se le debe al cliente, no está a mano', () => {
  const c = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-24', descuento: 500 }, // sin atraso, sin daños
    pagos: [{ monto: 2800, porcentajeTarjeta: 0 }], // cobrado al salir, antes de saber del descuento
  };
  const r = resumen(c);
  assert.equal(r.subtotal, 2300, '2,800 de renta menos 500 de descuento');
  assert.equal(r.pagado, 2800, 'lo que ya se cobró, sin recargo (pagó en efectivo)');
  assert.equal(r.saldo, -500, 'se le debe Q500 al cliente, no "está a mano"');
});

test('lo que se paga en efectivo no lleva recargo', () => {
  const c = { ...ejemplo(), pagos: [{ monto: 3150, porcentajeTarjeta: 0 }, { monto: 730, porcentajeTarjeta: 0 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3880, 'el subtotal pelado, sin un centavo de recargo');
  assert.equal(r.saldo, 0);
});

test('un carro ajeno deja utilidad después de pagarle al dueño', () => {
  const c = { ...ejemplo(), subarriendo: { costoDia: 400 } };
  const r = resumen(c);
  assert.equal(r.costoSubarriendo, 2000, 'Q400 × (4 días + 1 de atraso)');
  assert.equal(r.utilidad, 2345.6, 'Q4,345.60 cobrados menos Q2,000 del dueño');
});

test('un carro propio no tiene costo de subarriendo', () => {
  const r = resumen(ejemplo());
  assert.equal(r.costoSubarriendo, 0);
  assert.equal(r.utilidad, 4345.6);
});

// Anular un pago mal registrado (Tarea "cobro-claro"): el dueño tecleó un
// cobro sobre un contrato que ya estaba pagado y quedó con Q4,800 de crédito
// a favor del cliente. anularPago() (datos.js) marca el pago, nunca lo
// borra; resumen() es el único lugar donde la aritmética tiene que cambiar.
test('CRÍTICO: resumen() ignora un pago anulado — ni pagado ni saldo lo cuentan', () => {
  const c = {
    ...ejemplo(),
    cierre: null, // sin devolución: solo importa el pago de más, aislado
    pagos: [
      { monto: 3150, porcentajeTarjeta: 12 }, // el pago real de la salida
      { monto: 4800, porcentajeTarjeta: 0, anulado: true, anuladoEn: '2026-09-25' }, // el error, ya anulado
    ],
  };
  const r = resumen(c);
  assert.equal(r.pagado, 3528, 'solo el pago real, con su 12%; el anulado no suma');
  assert.equal(r.totalCobrado, 3528);
  assert.equal(r.saldo, 0, 'lo pagado de verdad (3150, sin recargo) cuadra justo con el subtotal (3150)');
});

// El escenario exacto del incidente: sin anular, el pago de más deja Q4,800
// a favor del cliente (lo que el dueño vio sin entender); con anularPago()
// (datos.js) marcando ESE pago, resumen() lo ignora y el saldo vuelve a lo
// que de verdad se debía.
test('CRÍTICO: sin anular el pago de más se ve el sobrepago; anulado, resumen() lo corrige', () => {
  const conElError = {
    ...ejemplo(),
    cierre: null,
    pagos: [
      { monto: 3150, porcentajeTarjeta: 12 }, // el pago real
      { monto: 4800, porcentajeTarjeta: 0 },  // el error: tecleado sobre un contrato ya pagado
    ],
  };
  assert.equal(resumen(conElError).saldo, -4800, 'el error tal cual lo vivió el dueño: Q4,800 a favor del cliente');

  const anulado = {
    ...conElError,
    pagos: [
      conElError.pagos[0],
      { ...conElError.pagos[1], anulado: true, anuladoEn: '2026-09-25' },
    ],
  };
  assert.equal(resumen(anulado).saldo, 0, 'anulado el pago equivocado, el contrato vuelve a estar en cero');
});

test('un pago SIN anular sigue contando igual que siempre (anularPago no afecta lo demás)', () => {
  const c = {
    ...ejemplo(),
    cierre: null,
    pagos: [
      { monto: 3150, porcentajeTarjeta: 12 },
      { monto: 4800, porcentajeTarjeta: 0, anulado: false },
    ],
  };
  const r = resumen(c);
  assert.equal(r.pagado, 8328, 'sin anular, los Q4,800 sí cuentan (3528 + 4800)');
});

test('anular el pago equivocado deja el contrato otra vez con saldo — el estado se recalcula solo', () => {
  // Mismo caso que arriba pero visto desde estadoContrato/puedeCerrar
  // (nucleo/estados.js): un contrato que se había "cerrado" de más al
  // cobrar Q4,800 sobrantes vuelve a "devuelto" en cuanto se anula ese pago,
  // sin que nadie tenga que tocar el campo `estado` a mano.
  const cerradoDeMas = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-24' }, // sin atraso, sin daños: debía Q2,800
    pagos: [{ monto: 7600, porcentajeTarjeta: 0 }], // cobró de más por error
    garantiaLiberada: false,
  };
  assert.equal(resumen(cerradoDeMas).saldo, -4800, 'Q4,800 de crédito a favor del cliente, el error del incidente');

  const corregido = {
    ...cerradoDeMas,
    pagos: [{ ...cerradoDeMas.pagos[0], anulado: true, anuladoEn: '2026-09-25' }],
  };
  assert.equal(resumen(corregido).saldo, 2800, 'anulado el pago, vuelve a deber la renta completa');
});

// ---------- Hora tardía: un cobro de la devolución, con monto ----------
//
// En el Excel era una celda con un monto (Q150 en el ejemplo) que se imprimía
// en el contrato y se cobraba aparte, a mano; el sistema la volvió una casilla
// de sí/no y desde entonces nunca se cobró. Se recuperó como un monto, primero
// al salir y, cuando se le preguntó al dueño, «solo al devolver»: ahora vive en
// `cierre.horaTardia`, igual que `varios`, y entra al total de la DEVOLUCIÓN.
//
// Todas estas cifras son exactas, no formas: Q150 sobre el ejemplo de la §5
// (devolución de Q730) da Q880 al recibir, y la salida se queda en Q3,150.

/** El ejemplo de la §5 con Q`monto` de hora tardía anotados al recibir el carro. */
const conHoraTardiaAlRecibir = (monto, c = ejemplo()) => ({ ...c, cierre: { ...c.cierre, horaTardia: monto } });

test('la hora tardía de Q150 sale como una línea del cobro al recibir, entre el combustible y el descuento', () => {
  assert.deepEqual(lineasDevolucion(conHoraTardiaAlRecibir(150)), [
    { concepto: 'Cobro días de atraso', detalle: '1 × Q700.00', monto: 700 },
    { concepto: 'Daños', detalle: '', monto: 200 },
    { concepto: 'Combustible', detalle: '', monto: 130 },
    { concepto: 'Hora tardía', detalle: '', monto: 150 },
    { concepto: 'Descuento', detalle: '', monto: -300 },
  ]);
});

test('lo que se anota al recibir NO sale al salir: el cobro de la salida no se mueve', () => {
  const c = conHoraTardiaAlRecibir(150);
  assert.deepEqual(lineasSalida(c), lineasSalida(ejemplo()), 'ni una línea de hora tardía en la salida');
  assert.deepEqual(lineasSalida(c).map((l) => [l.concepto, l.monto]), [['Renta', 2800], ['Carta poder', 350]]);
});

test('la hora tardía de Q150 al recibir entra al total de la devolución: Q880, y Q150 más en el saldo', () => {
  const r = resumen(conHoraTardiaAlRecibir(150));
  assert.equal(r.totalSalida, 3150, 'la salida es la del ejemplo: 2,800 de renta + 350 de carta poder');
  assert.equal(r.totalDevolucion, 880, '730 del ejemplo + 150 de hora tardía');
  assert.equal(r.subtotal, 4030, '3,880 del ejemplo + 150');
  assert.equal(r.pagado, 4345.6, 'los dos pagos ya hechos siguen valiendo lo mismo');
  assert.equal(r.saldo, 150, 'sin pagar la hora tardía, es justo lo que falta: Q150 y ni un centavo más');
});

// §5, «Ejemplo que debe cuadrar»: la hora tardía cambió de lugar y de total, no
// de cifras. El ejemplo no tiene hora tardía, así que NINGUNA de sus celdas se
// mueve; y con Q150 al recibir, solo se mueve lo de la devolución.
test('§5 sigue cuadrando celda por celda: salida 3,528.00, saldo con tarjeta 817.60, subtotal 3,880.00, total cobrado 4,345.60', () => {
  const alSalir = { ...ejemplo(), pagos: [ejemplo().pagos[0]] };
  const r = resumen(alSalir);
  assert.equal(r.totalSalida, 3150);
  assert.equal(r.pagado, 3528, 'Salida · Pagado');
  assert.equal(r.subtotal, 3880);
  assert.equal(r.saldo, 730);
  assert.deepEqual(saldoConTarjeta(alSalir, 12), { saldo: 730, recargo: 87.6, total: 817.6 }, 'Devolución · Saldo por cobrar');

  const completo = resumen(ejemplo());
  assert.equal(completo.subtotal, 3880);
  assert.equal(completo.totalCobrado, 4345.6, 'Total cobrado');
  assert.equal(completo.saldo, 0);
});

test('§5 con Q150 de hora tardía al recibir: la salida sigue en 3,528.00 y el saldo con tarjeta sube a 985.60', () => {
  const alSalir = { ...conHoraTardiaAlRecibir(150), pagos: [ejemplo().pagos[0]] };
  const r = resumen(alSalir);
  assert.equal(r.pagado, 3528, 'lo que se cobró al salir no se toca: la hora tardía no es de ahí');
  assert.equal(r.totalSalida, 3150);
  assert.equal(r.subtotal, 4030);
  assert.equal(r.saldo, 880);
  // 880 × 1.12 = 985.60: los 817.60 del ejemplo más 150 × 1.12 = 168.
  assert.deepEqual(saldoConTarjeta(alSalir, 12), { saldo: 880, recargo: 105.6, total: 985.6 });
});

test('con la hora tardía pagada con tarjeta, el 12 % se le aplica a ella también', () => {
  // Al recibir se cobra 880 (no 730) con 12 %: 880 × 1.12 = 985.60.
  const c = { ...conHoraTardiaAlRecibir(150), pagos: [{ monto: 3150, porcentajeTarjeta: 12 }, { monto: 880, porcentajeTarjeta: 12 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3528 + 985.6);
  assert.equal(r.saldo, 0);
});

test('un monto con centavos de más pasa por q(): 150.005 es Q150.01, no 150.00500000000001', () => {
  const lineas = lineasDevolucion(conHoraTardiaAlRecibir(150.005));
  assert.equal(lineas.find((l) => l.concepto === 'Hora tardía').monto, 150.01);
  assert.equal(resumen(conHoraTardiaAlRecibir(150.005)).totalDevolucion, 880.01);
});

test('hora tardía en cero al recibir: no hay línea y el total es el de siempre', () => {
  const lineas = lineasDevolucion(conHoraTardiaAlRecibir(0));
  assert.equal(lineas.some((l) => l.concepto === 'Hora tardía'), false, 'cero no deja una línea de Q0.00');
  assert.deepEqual(lineas, lineasDevolucion(ejemplo()));
  assert.deepEqual(resumen(conHoraTardiaAlRecibir(0)), resumen(ejemplo()), 'ni un número del resumen se mueve');
});

test('mientras el carro no regresa no hay hora tardía que cobrar: sin cierre, la devolución está vacía', () => {
  assert.deepEqual(lineasDevolucion({ ...ejemplo(), cierre: null }), []);
});

test('horaTardiaDe: las formas del campo, una por una', () => {
  const cero = { alSalir: 0, alRecibir: 0, sinMonto: false };
  // La de hoy: un monto en el cierre.
  assert.deepEqual(horaTardiaDe({ cierre: { horaTardia: 150 } }), { alSalir: 0, alRecibir: 150, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ cierre: { horaTardia: 150.005 } }), { alSalir: 0, alRecibir: 150.01, sinMonto: false });
  // La de unas horas: un monto en el contrato, de cuando se anotaba al salir.
  assert.deepEqual(horaTardiaDe({ horaTardia: 150 }), { alSalir: 150, alRecibir: 0, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ horaTardia: 150.005 }), { alSalir: 150.01, alRecibir: 0, sinMonto: false });
  // La original: `true` es «hubo y nadie anotó cuánto». No es un monto de ningún lado.
  assert.deepEqual(horaTardiaDe({ horaTardia: true }), { alSalir: 0, alRecibir: 0, sinMonto: true });
  // Nada: cero, falso, ausente.
  assert.deepEqual(horaTardiaDe({ horaTardia: 0 }), cero);
  assert.deepEqual(horaTardiaDe({ horaTardia: false }), cero);
  assert.deepEqual(horaTardiaDe({ cierre: { horaTardia: 0 } }), cero);
  assert.deepEqual(horaTardiaDe({ cierre: { fechaReal: '2026-08-25' } }), cero, 'un cierre viejo que nunca trajo el campo');
  assert.deepEqual(horaTardiaDe({}), cero, 'un contrato que nunca trajo el campo');
  assert.deepEqual(horaTardiaDe(undefined), cero);
  assert.deepEqual(horaTardiaDe({ horaTardia: null }), cero);
});

test('horaTardiaDe: un booleano nunca es un monto, ni en el contrato ni en el cierre (q(true) vale 1)', () => {
  assert.deepEqual(horaTardiaDe({ cierre: { horaTardia: true } }), { alSalir: 0, alRecibir: 0, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ cierre: { horaTardia: false } }), { alSalir: 0, alRecibir: 0, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ horaTardia: true, cierre: { horaTardia: true } }), { alSalir: 0, alRecibir: 0, sinMonto: true });
  assert.equal(resumen(conHoraTardiaAlRecibir(true)).totalDevolucion, 730, 'ni Q731');
});

// ---------- Los contratos de antes (1): `horaTardia: true` ----------
//
// Lo que más importa de este cambio. Un `true` guardado significa que hubo una
// hora tardía y que nadie anotó cuánto: la cifra NO se sabe. Si se leyera con
// q() a secas valdría 1, y cada contrato viejo ganaría Q1.00 en silencio; si
// alguien "arreglara" eso poniéndole Q150, se inventaría un cobro que nadie
// hizo. Se lee como lo que es: sin monto, ni al salir ni al recibir.

test('un contrato guardado con horaTardia: true no gana ningún monto, ni siquiera Q1', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  assert.equal(viejo.horaTardia, true, 'la fixture es de verdad el booleano que se guardó');

  assert.deepEqual(horaTardiaDe(viejo), { alSalir: 0, alRecibir: 0, sinMonto: true });
  assert.deepEqual(lineasSalida(viejo).map((l) => [l.concepto, l.monto]), [
    ['Renta', 2800],
    ['Carta poder', 350],
  ]);
  const r = resumen(viejo);
  assert.equal(r.totalSalida, 3150, 'ni Q3,151 (el true como 1) ni Q3,300 (un Q150 inventado)');
  assert.equal(r.subtotal, 3150);
  assert.equal(r.pagado, 3528, '3,150 con 12 % de tarjeta, como se cobró ese día');
  assert.equal(r.saldo, 0);
});

test('un contrato viejo con horaTardia: true da EXACTAMENTE el mismo resumen que sin el campo', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  const sinCampo = contratoGuardadoConHoraTardiaSiNo();
  delete sinCampo.horaTardia;
  assert.deepEqual(resumen(viejo), resumen(sinCampo));
  assert.deepEqual(lineasSalida(viejo), lineasSalida(sinCampo));
  assert.deepEqual(lineasDevolucion(viejo), lineasDevolucion(sinCampo));
});

/** Los campos del cierre del ejemplo de la §5, tal como los arma la pantalla de recibir. */
const camposDelEjemplo = (extra = {}) => ({
  fechaReal: '2026-09-28', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 45600,
  danos: 200, danosDetalle: 'Rayón', combustible: 130, varios: 0, variosDetalle: '', descuento: 300,
  ...extra,
});

test('un contrato viejo ya recibido y cobrado sigue en Q3,880.00 de subtotal y saldo cero', () => {
  // El caso que no se puede romper: un contrato que el dueño ya cerró y cobró
  // con la casilla marcada. Se arma igual que la pantalla de recibir: el
  // cierre se le agrega con construirCierre y el segundo pago con tarjeta.
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaSiNo(), camposDelEjemplo());
  cerrado.pagos.push({
    monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-09-28',
  });
  cerrado.garantiaLiberada = true;

  assert.equal(cerrado.horaTardia, true, 'cerrar el contrato no toca el campo');
  assert.equal(cerrado.cierre.horaTardia, 0, 'y el cierre no se inventa una hora tardía: ni 1 ni 150');
  const r = resumen(cerrado);
  assert.equal(r.totalSalida, 3150);
  assert.equal(r.totalDevolucion, 730, 'atraso de 1 día + daños + combustible − descuento, como el ejemplo');
  assert.equal(r.subtotal, 3880, 'el mismo 3,880.00 del ejemplo del diseño');
  assert.equal(r.pagado, 4345.6);
  assert.equal(r.saldo, 0, 'el contrato sigue cerrado y sin deber nada');
});

test('a un contrato viejo con `true` SÍ se le puede anotar la hora tardía al recibir: entra a la devolución y el `true` ya no está «sin monto»', () => {
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaSiNo(), camposDelEjemplo({ horaTardia: 150 }));
  assert.equal(cerrado.horaTardia, true, 'el booleano viejo sigue ahí, tal cual');
  assert.equal(cerrado.cierre.horaTardia, 150);
  assert.deepEqual(horaTardiaDe(cerrado), { alSalir: 0, alRecibir: 150, sinMonto: false });
  const r = resumen(cerrado);
  assert.equal(r.totalSalida, 3150, 'la salida no se mueve');
  assert.equal(r.totalDevolucion, 880);
  assert.equal(r.subtotal, 4030);
});

// ---------- Los contratos de antes (2): `horaTardia: 150` en la salida ----------
//
// Durante unas horas la hora tardía se escribía al salir y se cobraba en el
// total de la salida. Esos contratos ya se guardaron, ya se cobraron y ya
// mostraron Q3,300.00 al salir. Cuando el cobro se mudó a la devolución su
// total no se podía mover: si se dejara de leer ese número, el contrato
// mostraría Q3,150.00, el pago de Q3,300 le sobraría y saldría un saldo a favor
// del cliente que nadie anotó. Se siguen leyendo donde se guardaron.

test('un contrato guardado con la hora tardía en la salida sigue mostrando Q3,300.00 al salir, igual que cuando se guardó', () => {
  const guardado = contratoGuardadoConHoraTardiaAlSalir();
  assert.equal(typeof guardado.horaTardia, 'number', 'la fixture es de verdad el número que se guardó al salir');

  assert.deepEqual(horaTardiaDe(guardado), { alSalir: 150, alRecibir: 0, sinMonto: false });
  assert.deepEqual(lineasSalida(guardado), [
    { concepto: 'Renta', detalle: '4 días × Q700.00', monto: 2800 },
    { concepto: 'Hora tardía', detalle: '', monto: 150 },
    { concepto: 'Carta poder', detalle: 'Ciudad de Guatemala', monto: 350 },
  ]);
  assert.deepEqual(lineasDevolucion(guardado), [], 'todavía no regresa: nada que cobrar al recibir');
  const r = resumen(guardado);
  assert.equal(r.totalSalida, 3300, '2,800 de renta + 150 de hora tardía + 350 de carta poder');
  assert.equal(r.subtotal, 3300);
  assert.equal(r.pagado, 3696, '3,300 con 12 % de tarjeta, como se cobró ese día');
  assert.equal(r.saldo, 0, 'ni un saldo a favor ni uno por cobrar que nadie anotó');
});

test('ese contrato, ya recibido: la hora tardía de la salida se queda en la salida y no se cobra dos veces', () => {
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaAlSalir(), camposDelEjemplo());
  assert.equal(cerrado.horaTardia, 150, 'cerrar el contrato no mueve el número que ya traía');
  assert.equal(cerrado.cierre.horaTardia, 0, 'y el cierre no lo copia: eso la cobraría otra vez');
  const r = resumen(cerrado);
  assert.equal(r.totalSalida, 3300, 'el mismo total que mostró al guardarse');
  assert.equal(r.totalDevolucion, 730, 'el de la devolución del ejemplo, sin la hora tardía');
  assert.equal(r.subtotal, 4030);
  assert.deepEqual(lineasDevolucion(cerrado).map((l) => l.concepto), ['Cobro días de atraso', 'Daños', 'Combustible', 'Descuento']);
});

test('ese contrato, cuando el mostrador anota además una hora tardía al recibir, la suma: es lo que escribió', () => {
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaAlSalir(), camposDelEjemplo({ horaTardia: 200 }));
  const r = resumen(cerrado);
  assert.equal(r.totalSalida, 3300, 'la de la salida sigue en su lugar');
  assert.equal(r.totalDevolucion, 930, '730 + 200 que se escribió al recibir');
  assert.equal(r.subtotal, 4230);
});

// Prueba del sistema (7 oct 2026): una renta de un solo día decía «1 días × Q500.00» en el detalle de
// la salida, en el contrato y en el cierre — y el recargo de seguros por atraso «1 día(s)». Las rentas
// de un día son de las más comunes.
test('el detalle de la renta concuerda en singular y en plural: «1 día», «4 días»', () => {
  const detalle = (dias) => lineasSalida({ dias, precioDia: 500 }).find((l) => l.concepto === 'Renta').detalle;
  assert.equal(detalle(1), '1 día × Q500.00');
  assert.equal(detalle(4), '4 días × Q500.00');
});

test('los seguros extra por atraso dicen «1 día de atraso» o «2 días de atraso», sin «(s)»', () => {
  const c = (atraso) => ({
    dias: 3, precioDia: 500, seguroMenoresDia: 40, seguroPaiDia: 30, devolucionPrevista: '2026-10-10',
    cierre: { fechaReal: `2026-10-${10 + atraso}` },
  });
  const detalle = (atraso) => lineasDevolucion(c(atraso)).find((l) => l.concepto === 'Seguros extra').detalle;
  assert.equal(detalle(1), 'por 1 día de atraso');
  assert.equal(detalle(2), 'por 2 días de atraso');
});
