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

// ---------- Hora tardía: un cobro de la salida, con monto ----------
//
// En el Excel era una celda con un monto (Q150 en el ejemplo) que se imprimía
// en el contrato y se cobraba; el sistema la volvió una casilla de sí/no y
// desde entonces nunca se cobró. Ahora `horaTardia` es un monto que entra al
// total de la salida igual que la carta poder (cartaPoderPrecio).
//
// Todas estas cifras son exactas, no formas: Q150 sobre el ejemplo de la §5
// (4 × Q700 de renta, Q350 de carta poder) da Q3,300 al salir.

test('la hora tardía de Q150 sale como una línea del cobro al salir, antes de la carta poder', () => {
  const lineas = lineasSalida({ ...ejemplo(), horaTardia: 150 });
  assert.deepEqual(lineas, [
    { concepto: 'Renta', detalle: '4 días × Q700.00', monto: 2800 },
    { concepto: 'Hora tardía', detalle: '', monto: 150 },
    { concepto: 'Carta poder', detalle: '', monto: 350 },
  ]);
});

test('la hora tardía de Q150 entra al total: Q3,300 al salir y Q150 más en el saldo', () => {
  const c = { ...ejemplo(), horaTardia: 150 };
  const r = resumen(c);
  assert.equal(r.totalSalida, 3300, '2,800 de renta + 150 de hora tardía + 350 de carta poder');
  assert.equal(r.totalDevolucion, 730, 'lo de la devolución no cambia: la hora tardía no es de ahí');
  assert.equal(r.subtotal, 4030, '3,880 del ejemplo + 150');
  assert.equal(r.pagado, 4345.6, 'los dos pagos ya hechos siguen valiendo lo mismo');
  assert.equal(r.saldo, 150, 'sin pagar la hora tardía, es justo lo que falta: Q150 y ni un centavo más');
});

test('con la hora tardía pagada con tarjeta, el 12 % se le aplica a ella también', () => {
  // Al salir se cobra 3,300 (no 3,150) con 12 %: 3,300 × 1.12 = 3,696.
  const c = { ...ejemplo(), horaTardia: 150, cierre: null, pagos: [{ monto: 3300, porcentajeTarjeta: 12 }] };
  const r = resumen(c);
  assert.equal(r.totalSalida, 3300);
  assert.equal(r.pagado, 3696);
  assert.equal(r.saldo, 0);
});

test('un monto con centavos de más pasa por q(): 150.005 es Q150.01, no 150.00500000000001', () => {
  const lineas = lineasSalida({ ...ejemplo(), horaTardia: 150.005 });
  assert.equal(lineas.find((l) => l.concepto === 'Hora tardía').monto, 150.01);
  assert.equal(resumen({ ...ejemplo(), horaTardia: 150.005 }).totalSalida, 3300.01);
});

test('hora tardía en cero: no hay línea y el total es el de siempre', () => {
  const lineas = lineasSalida({ ...ejemplo(), horaTardia: 0 });
  assert.equal(lineas.some((l) => l.concepto === 'Hora tardía'), false, 'cero no deja una línea de Q0.00');
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [['Renta', 2800], ['Carta poder', 350]]);
  assert.deepEqual(resumen({ ...ejemplo(), horaTardia: 0 }), resumen(ejemplo()), 'ni un número del resumen se mueve');
});

test('horaTardiaDe: un monto es el monto; falso, ausente o cero no son nada', () => {
  assert.deepEqual(horaTardiaDe({ horaTardia: 150 }), { monto: 150, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ horaTardia: 150.005 }), { monto: 150.01, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ horaTardia: 0 }), { monto: 0, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ horaTardia: false }), { monto: 0, sinMonto: false });
  assert.deepEqual(horaTardiaDe({}), { monto: 0, sinMonto: false }, 'un contrato que nunca trajo el campo');
  assert.deepEqual(horaTardiaDe(undefined), { monto: 0, sinMonto: false });
  assert.deepEqual(horaTardiaDe({ horaTardia: null }), { monto: 0, sinMonto: false });
});

// ---------- Los contratos de antes: `horaTardia: true` ----------
//
// Lo que más importa de este cambio. Un `true` guardado significa que hubo una
// hora tardía y que nadie anotó cuánto: la cifra NO se sabe. Si se leyera con
// q() a secas valdría 1, y cada contrato viejo ganaría Q1.00 en silencio; si
// alguien "arreglara" eso poniéndole Q150, se inventaría un cobro que nadie
// hizo. Se lee como lo que es: sin monto.

test('un contrato guardado con horaTardia: true no gana ningún monto, ni siquiera Q1', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  assert.equal(viejo.horaTardia, true, 'la fixture es de verdad el booleano que se guardó');

  assert.deepEqual(horaTardiaDe(viejo), { monto: 0, sinMonto: true });
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

test('un contrato viejo ya recibido y cobrado sigue en Q3,880.00 de subtotal y saldo cero', () => {
  // El caso que no se puede romper: un contrato que el dueño ya cerró y cobró
  // con la casilla marcada. Se arma igual que la pantalla de recibir: el
  // cierre se le agrega con construirCierre y el segundo pago con tarjeta.
  const cerrado = construirCierre(contratoGuardadoConHoraTardiaSiNo(), {
    fechaReal: '2026-09-28', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 45600,
    danos: 200, danosDetalle: 'Rayón', combustible: 130, varios: 0, variosDetalle: '', descuento: 300,
  });
  cerrado.pagos.push({
    monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-09-28',
  });
  cerrado.garantiaLiberada = true;

  assert.equal(cerrado.horaTardia, true, 'cerrar el contrato no toca el campo');
  const r = resumen(cerrado);
  assert.equal(r.totalSalida, 3150);
  assert.equal(r.totalDevolucion, 730, 'atraso de 1 día + daños + combustible − descuento, como el ejemplo');
  assert.equal(r.subtotal, 3880, 'el mismo 3,880.00 del ejemplo del diseño');
  assert.equal(r.pagado, 4345.6);
  assert.equal(r.saldo, 0, 'el contrato sigue cerrado y sin deber nada');
});
