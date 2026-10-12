// Pruebas del comprobante de pago al dueño del carro (comprobante.js, ADR-003).
//
// Es el único papel de este sistema que sale de la empresa hacia un tercero, y
// el tercero es un PROVEEDOR, no un socio: el dueño del carro ve lo suyo y
// nada más. Si el papel dijera cuánto cobró Best Price por su carro, o cuánto
// se llevó el empleado, el dueño sabría el margen sobre su propio carro y el
// negocio perdería el precio que negoció. Por eso la prueba que más importa
// aquí no mira lo que el comprobante lleva: mira lo que NO puede llevar, y lo
// mira sobre un contrato que de verdad tiene comisión, pagos del cliente y
// recargo de tarjeta (ver «LO QUE EL DUEÑO NO VE», más abajo).
//
// Los contratos de estas pruebas NO están inventados: se arman con las mismas
// funciones que arman los reales —`construirContrato` (Sacar carro),
// `construirCierre` (Recibir carro), `agregarPago`, `contratoParaGuardar` y
// `conCostoDelDueno` (el recorrido de lo que se guarda y se vuelve a leer)—, y
// el pago a un dueño sale de `construirPagoDueno` y `pagoDuenoParaGuardar`, las
// que de verdad lo arman y lo sellan. Así llevan exactamente los campos de §7b
// y ninguno que no exista: una suite que arma sus propios datos solo se está
// comprobando a sí misma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  armarComprobante, htmlComprobante, pintarComprobante, MEMBRETE,
} from '../js/pantallas/comprobante.js';
import {
  cuentaDeDueno, totalSeleccionado, pagadoDeMas, descuentoDelPago, entregadoDelPago,
} from '../js/nucleo/liquidacion.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { resumen } from '../js/nucleo/contrato.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { construirDueno } from '../js/nucleo/dueno.js';
import { suma, recargoTarjeta, conTarjeta } from '../js/nucleo/dinero.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import { dinero, fecha } from '../js/ui.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import {
  agregarPago, anularPago, contratoParaGuardar, conCostoDelDueno, costoDelDocumento,
  construirPagoDueno, pagoDuenoParaGuardar, anularPagoDueno,
} from '../js/datos.js';

const AHORA = 1790000000000;
const HOY = '2026-10-05';

const JUAN = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };
const ROSA = { id: 'k2', nombres: 'Rosa', apellidos: 'Díaz' };
const CARLOS = { id: 'k3', nombres: 'Carlos', apellidos: 'Méndez' };
const LUCIA = { id: 'k4', nombres: 'Lucía', apellidos: 'Barrios' };

// ---------------------------------------------------------------------------
// Los contratos de prueba, en las etapas de su vida.
// ---------------------------------------------------------------------------

/** Un contrato de carro ajeno recién salido; la renta se cobra completa en efectivo. */
function salida({
  id, numero, placas, cliente = JUAN, costoDia, dias = 4, fechaSalida = '2026-09-01',
  duenoId = 'd1', dueno = 'Mario López',
}) {
  return construirContrato({
    id,
    numero,
    cliente,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas, tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno, costoDia,
    },
    duenoId,
    fechaSalida,
    dias,
    precioDia: 700,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

const recibido = (c, atraso = 0) => construirCierre(c, {
  fechaReal: sumarDias(c.devolucionPrevista, atraso),
  horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
});

/** El cliente termina de pagar lo que falte y se le suelta la garantía, si la había. */
function saldado(c) {
  const conPago = agregarPago(c, {
    monto: resumen(c).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: c.cierre.fechaReal,
  });
  return c.garantiaMonto > 0 ? { ...conPago, garantiaLiberada: true, garantiaLiberadaEn: c.cierre.fechaReal } : conPago;
}

/** Lo que de verdad se escribe, tal como LLEGA al área de dinero (ADR-002: el costo vuelve a entrar al leer). */
const guardado = (c) => conCostoDelDueno(
  contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA }),
  costoDelDocumento(c),
);

const cerrado = (datos, atraso = 0) => guardado(saldado(recibido(salida(datos), atraso)));
/** El carro ya volvió pero el cliente todavía debe el atraso: aún no cierra. */
const devueltoConSaldo = (datos) => guardado(recibido(salida(datos), 2));

/**
 * Un contrato cerrado CON TODO LO QUE EL DUEÑO NO DEBE VER: precio de venta
 * de Q850 por día, pagado con tarjeta (6.5 % de recargo) en la salida y al
 * recibirlo, daños, descuento, comisión del 7 % para una empleada con nombre,
 * una garantía de Q4,321 en otra tarjeta y una observación del mostrador.
 * Mientras tanto el dueño del carro cobra `costoDia` por día.
 */
function conMargen({
  id, numero, placas, cliente, costoDia, fechaSalida, duenoId = 'd1', dueno = 'Mario López Estrada',
}) {
  const sinCierre = construirContrato({
    id,
    numero,
    cliente,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas, tipo: 'Pickup', marca: 'Toyota', color: 'Blanco', modelo: '2021', dueno, costoDia,
    },
    duenoId,
    fechaSalida,
    dias: 4,
    precioDia: 850,
    tarjetas: [{
      ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 4321,
    }],
    forma: 'tarjeta',
    porcentajeTarjeta: 6.5,
    montoPago: 3400,
    rentadoPor: 'Ana Lucía Ordóñez',
    porcentajeComision: 7,
    observaciones: 'OBSERVACION-DEL-MOSTRADOR',
  });
  const devuelto = construirCierre(sinCierre, {
    fechaReal: sumarDias(sinCierre.devolucionPrevista, 1),
    horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 275, varios: 0, descuento: 125,
  });
  const conSaldoPagado = agregarPago(devuelto, {
    monto: resumen(devuelto).saldo, forma: 'tarjeta', porcentajeTarjeta: 6.5, fecha: devuelto.cierre.fechaReal,
  });
  return guardado({ ...conSaldoPagado, garantiaLiberada: true, garantiaLiberadaEn: devuelto.cierre.fechaReal });
}

// ---------------------------------------------------------------------------
// El escenario: lo que se le pagó a Mario, lo que le queda, y lo que no es de él.
// ---------------------------------------------------------------------------

// Pagados en el comprobante N° 7 (los tres cerrados):
const A1 = cerrado({
  id: 'ctr-a1', numero: 1, placas: 'P-111AAA', cliente: JUAN, costoDia: 300, dias: 4, fechaSalida: '2026-09-01',
}, 2); // (4 + 2) × 300 = 1,800
const A2 = cerrado({
  id: 'ctr-a2', numero: 2, placas: 'P-222BBB', cliente: ROSA, costoDia: 250, dias: 3, fechaSalida: '2026-09-06',
}); // 3 × 250 = 750
const AM = conMargen({
  id: 'ctr-am', numero: 3, placas: 'P-333CCC', cliente: CARLOS, costoDia: 310, fechaSalida: '2026-09-10',
}); // (4 + 1) × 310 = 1,550 — y el cliente le pagó a Best Price Q4,686 por él
// Pendientes (cerrados, sin pagar):
const A3 = cerrado({
  id: 'ctr-a3', numero: 4, placas: 'P-444DDD', cliente: LUCIA, costoDia: 400, dias: 5, fechaSalida: '2026-09-12',
}); // 5 × 400 = 2,000
const AP = conMargen({
  id: 'ctr-ap', numero: 5, placas: 'P-555EEE', cliente: JUAN, costoDia: 320, fechaSalida: '2026-09-20',
}); // (4 + 1) × 320 = 1,600 — también con margen: el pendiente tampoco puede filtrarlo
// Ni pagados aquí ni pendientes:
const A5 = devueltoConSaldo({
  id: 'ctr-a5', numero: 6, placas: 'P-666FFF', cliente: ROSA, costoDia: 350, dias: 4, fechaSalida: '2026-09-25',
}); // aún no cierra
const A6 = cerrado({
  id: 'ctr-a6', numero: 7, placas: 'P-777GGG', cliente: CARLOS, costoDia: 280, dias: 3, fechaSalida: '2026-08-15',
}); // ya lo cubrió el comprobante N° 5
// De otro dueño, que NO puede aparecer en el papel de Mario:
const B1 = cerrado({
  id: 'ctr-b1', numero: 8, placas: 'P-888HHH', cliente: LUCIA, costoDia: 999, dias: 4, fechaSalida: '2026-09-02',
  duenoId: 'd2', dueno: 'Elena Soto',
});

const CONTRATOS = [A1, A2, AM, A3, AP, A5, A6, B1];

const MARIO = construirDueno(
  { id: 'd1', actualizado: AHORA },
  {
    nombre: 'Mario López Estrada', telefono: '5555-1234', nit: '1234567-8', nota: 'NOTA-INTERNA-DEL-DUENO',
  },
);

/** El pago N° 5 de antes, que ya cubrió a6. */
const PAGO_5 = pagoDuenoParaGuardar(
  construirPagoDueno({
    duenoId: 'd1', fecha: '2026-09-01', forma: 'efectivo', contratos: CONTRATOS, pagos: [], idsMarcados: ['ctr-a6'], costoSinLeer: [],
  }),
  { id: 'p5', numero: 5, ahora: AHORA },
);

/** El pago N° 7 de este comprobante, armado por las mismas funciones que lo arman de verdad. */
const PAGO_7 = pagoDuenoParaGuardar(
  construirPagoDueno({
    duenoId: 'd1',
    fecha: '2026-09-20',
    forma: 'transferencia',
    contratos: CONTRATOS,
    pagos: [PAGO_5],
    idsMarcados: ['ctr-a1', 'ctr-a2', 'ctr-am'],
    costoSinLeer: [],
  }),
  { id: 'p7', numero: 7, ahora: AHORA },
);

/** Lo que Task 8 le entregará: el pago, el dueño, los contratos y TODOS los pagos, más hoy. */
const entrada = (extra = {}) => ({
  pago: PAGO_7, dueno: MARIO, contratos: CONTRATOS, pagos: [PAGO_5, PAGO_7], costoSinLeer: [], hoy: HOY, ...extra,
});

const placasDe = (filas) => filas.map((f) => f.placas);

// ---------------------------------------------------------------------------
// Que el escenario sea lo que dice ser (si no, nada de lo de abajo vale).
// ---------------------------------------------------------------------------

test('el escenario: los estados y los montos son los que las pruebas suponen', () => {
  for (const c of [A1, A2, AM, A3, AP, A6, B1]) assert.equal(estadoContrato(c), 'cerrado', c.id);
  assert.equal(estadoContrato(A5), 'devuelto');
  assert.equal(PAGO_7.monto, 4100, '1,800 + 750 + 1,550, tal como los arma construirPagoDueno');
  assert.deepEqual(PAGO_7.contratos, ['ctr-a1', 'ctr-a2', 'ctr-am']);
  assert.equal(PAGO_7.numero, 7);
  // El contrato con margen de verdad tiene margen: comisión, recargo de tarjeta y utilidad.
  assert.equal(comisionDe(AM).monto, 288.75);
  assert.equal(resumen(AM).pagado, 4686);
  assert.equal(resumen(AM).utilidad, 3136);
  assert.equal(recargoTarjeta(3400, 6.5), 221);
  assert.equal(AM.garantiaMonto, 4321);
});

// ---------------------------------------------------------------------------
// §6 del diseño: el contenido y su orden.
// ---------------------------------------------------------------------------

test('el modelo: una fila por renta pagada y una por renta pendiente, con lo que dice §6', () => {
  const m = armarComprobante(entrada());
  assert.equal(m.numero, 7);
  assert.equal(m.fecha, '2026-09-20');
  assert.deepEqual(m.dueno, { nombre: 'Mario López Estrada', telefono: '5555-1234', nit: '1234567-8' });

  assert.deepEqual(placasDe(m.pagado.filas), ['P-111AAA', 'P-222BBB', 'P-333CCC']);
  assert.deepEqual(m.pagado.filas[0], {
    fecha: '2026-09-01', placas: 'P-111AAA', cliente: 'Juan Pérez', dias: 4, diasAtraso: 2, costoDia: 300, monto: 1800, sinCosto: null,
  });
  assert.deepEqual(m.pagado.filas[1], {
    fecha: '2026-09-06', placas: 'P-222BBB', cliente: 'Rosa Díaz', dias: 3, diasAtraso: 0, costoDia: 250, monto: 750, sinCosto: null,
  });
  assert.equal(m.pagado.filas[2].monto, 1550);
  assert.equal(m.pagado.total, 4100);
  assert.equal(m.pagado.forma, 'transferencia');

  assert.deepEqual(placasDe(m.pendiente.filas), ['P-444DDD', 'P-555EEE']);
  assert.equal(m.pendiente.total, 3600);
  assert.equal(m.pendiente.incompleto, false);
  assert.equal(m.hoy, HOY);
});

test('los totales salen del núcleo: lo pagado es el monto guardado y lo pendiente es totalPorPagar', () => {
  const m = armarComprobante(entrada());
  // Lo pendiente: la misma función que dibuja la ficha del dueño.
  const { totalPorPagar } = cuentaDeDueno({ contratos: CONTRATOS.filter((c) => c.duenoId === 'd1'), pagos: [PAGO_5, PAGO_7] });
  assert.equal(m.pendiente.total, totalPorPagar);
  // Y las filas, sumadas AQUÍ en la prueba (no en el módulo), dan los totales: el papel cuadra.
  assert.equal(suma(...m.pagado.filas.map((f) => f.monto)), m.pagado.total);
  assert.equal(suma(...m.pendiente.filas.map((f) => f.monto)), m.pendiente.total);
});

test('el papel dice lo que §6 manda, en el orden en que §6 lo manda', () => {
  const html = htmlComprobante(armarComprobante(entrada()));
  const orden = [
    MEMBRETE.nombre,
    'Mario López Estrada', '5555-1234', '1234567-8',
    'N° 7', fecha('2026-09-20'),
    'Le pagué',
    dinero(4100), 'Transferencia',
    'Queda pendiente',
    dinero(3600),
    'Firma',
  ];
  let desde = 0;
  for (const marca of orden) {
    const en = html.indexOf(marca, desde);
    assert.ok(en >= 0, `«${marca}» tiene que aparecer, y después de lo anterior`);
    desde = en;
  }
});

test('la tabla «Le pagué» trae fecha, placas, cliente, días, costo por día y monto de cada renta', () => {
  const html = htmlComprobante(armarComprobante(entrada()));
  for (const encabezado of ['Fecha de salida', 'Placas', 'Cliente', 'Días', 'Costo por día', 'Monto']) {
    assert.ok(html.includes(encabezado), encabezado);
  }
  for (const texto of [
    fecha('2026-09-01'), 'P-111AAA', 'Juan Pérez', dinero(300), dinero(1800),
    fecha('2026-09-06'), 'P-222BBB', 'Rosa Díaz', dinero(250), dinero(750),
    'P-333CCC', 'Carlos Méndez', dinero(310), dinero(1550),
  ]) {
    assert.ok(html.includes(texto), texto);
  }
});

test('los días de atraso se ven junto a los contratados, para que costo por día × días explique el monto', () => {
  const html = htmlComprobante(armarComprobante(entrada()));
  // 4 días contratados + 2 de atraso, a Q300: el dueño ve por qué son Q1,800 y no Q1,200.
  assert.ok(html.includes('4 + 2 de atraso'), 'ctr-a1');
  assert.ok(html.includes('1 de atraso'), 'am y ap: 4 + 1');
  assert.ok(!html.includes('3 + 0'), 'una renta sin atraso no escribe «+ 0»');
});

test('lo pagado por OTRO comprobante, lo que aún no cierra y lo de otro dueño no aparecen en ningún lado', () => {
  const m = armarComprobante(entrada());
  const html = htmlComprobante(m);
  assert.ok(!placasDe([...m.pagado.filas, ...m.pendiente.filas]).includes('P-777GGG'), 'a6 ya lo cubrió el N° 5');
  assert.ok(!html.includes('P-777GGG'));
  assert.ok(!html.includes('P-666FFF'), 'a5 aún no cierra: no se le debe todavía');
  assert.ok(!html.includes('P-888HHH'), 'b1 es de Elena Soto');
  assert.ok(!html.includes('Elena'));
  assert.ok(!html.includes(dinero(3996)), 'ni lo que se le debe a otro dueño');
  assert.equal(m.pendiente.total, 3600, 'y su deuda no se suma a la de Mario');
});

test('un pago que no vino en la lista de pagos igual se descuenta de lo pendiente', () => {
  // Si quien arma la pantalla se olvida de incluir el pago que está imprimiendo,
  // sus rentas no pueden salir como «queda pendiente»: sería decirle al dueño
  // que no se le ha pagado lo que acaba de recibir.
  const m = armarComprobante(entrada({ pagos: [PAGO_5] }));
  assert.deepEqual(placasDe(m.pendiente.filas), ['P-444DDD', 'P-555EEE']);
  assert.equal(m.pendiente.total, 3600);
});

// ---------------------------------------------------------------------------
// «No queda nada pendiente»
// ---------------------------------------------------------------------------

test('sin nada pendiente dice «No queda nada pendiente» y no dibuja una tabla vacía', () => {
  const pagoTodo = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd1', fecha: '2026-09-20', forma: 'cheque', contratos: CONTRATOS, pagos: [PAGO_5], idsMarcados: ['ctr-a1', 'ctr-a2', 'ctr-am', 'ctr-a3', 'ctr-ap'], costoSinLeer: [],
    }),
    { id: 'p8', numero: 8, ahora: AHORA },
  );
  const m = armarComprobante(entrada({ pago: pagoTodo, pagos: [PAGO_5, pagoTodo] }));
  assert.equal(m.pendiente.filas.length, 0);
  assert.equal(m.pendiente.total, 0);
  const html = htmlComprobante(m);
  assert.ok(html.includes('No queda nada pendiente'));
  assert.equal((html.match(/<table/g) || []).length, 1, 'solo la tabla de «Le pagué»: la de pendientes no existe');
  assert.ok(html.indexOf('Queda pendiente') < html.indexOf('No queda nada pendiente'));
});

test('con algo pendiente NO dice «No queda nada pendiente» y hay dos tablas', () => {
  const html = htmlComprobante(armarComprobante(entrada()));
  assert.ok(!html.includes('No queda nada pendiente'));
  assert.equal((html.match(/<table/g) || []).length, 2);
});

// ---------------------------------------------------------------------------
// Un costo que no se pudo leer NO sale como Q0.00.
// ---------------------------------------------------------------------------

test('una renta pendiente sin costo anotado dice que falta, no «Q0.00», y no inventa el total', () => {
  const sinCosto = cerrado({
    id: 'ctr-a9', numero: 9, placas: 'P-999SSS', cliente: ROSA, costoDia: 0, dias: 2, fechaSalida: '2026-09-28',
  });
  const m = armarComprobante(entrada({ contratos: [...CONTRATOS, sinCosto] }));
  const fila = m.pendiente.filas.find((f) => f.placas === 'P-999SSS');
  assert.equal(fila.sinCosto, 'anotar');
  assert.equal(fila.costoDia, null, 'null, no 0: un 0 se formatearía como Q0.00 sin que nadie lo note');
  assert.equal(fila.monto, null);
  assert.equal(m.pendiente.incompleto, true);
  assert.equal(m.pendiente.total, null, 'con una renta sin cifra el total no se puede dar');
  assert.deepEqual(m.rentasSinCosto, { anotar: 1, leer: 0 });

  const html = htmlComprobante(m);
  assert.ok(html.includes('Sin costo anotado'));
  assert.ok(!html.includes('Q0.00'), 'ninguna cifra en cero en todo el papel');
  assert.ok(!html.includes(dinero(3600)), 'ni el total de las otras dos como si fuera el total');
});

test('una renta cuyo costo no se pudo LEER lo dice distinto, aunque el contrato traiga un costo viejo', () => {
  // `costoSinLeer` es lo que devuelve cargarContratosParaDinero: privado/dinero
  // no contestó. El documento puede traer un costo viejo, pero privado es el que
  // manda y no se sabe qué decía: esa cifra no se imprime.
  const m = armarComprobante(entrada({ costoSinLeer: ['ctr-a3'] }));
  const fila = m.pendiente.filas.find((f) => f.placas === 'P-444DDD');
  assert.equal(fila.sinCosto, 'leer');
  assert.equal(fila.monto, null);
  assert.equal(m.pendiente.total, null);
  assert.deepEqual(m.rentasSinCosto, { anotar: 0, leer: 1 });
  const html = htmlComprobante(m);
  assert.ok(html.includes('No se pudo leer el costo'));
  assert.ok(!html.includes(dinero(2000)), 'ni la cifra vieja de a3');
  assert.ok(!html.includes('Q0.00'));
});

test('una renta ya pagada cuyo costo no se puede leer ahora muestra la falta, y el total pagado sigue siendo lo que se pagó', () => {
  const m = armarComprobante(entrada({ costoSinLeer: ['ctr-a2'] }));
  const fila = m.pagado.filas.find((f) => f.placas === 'P-222BBB');
  assert.equal(fila.sinCosto, 'leer');
  assert.equal(fila.monto, null);
  assert.equal(m.pagado.total, 4100, 'el pago ya ocurrió por esa cifra: es el monto guardado, no una suma de filas');
  const html = htmlComprobante(m);
  assert.ok(html.includes('No se pudo leer el costo'));
  assert.ok(!html.includes('Q0.00'));
  assert.ok(html.includes(dinero(4100)));
});

// ---------------------------------------------------------------------------
// Lo pagado es lo pagado: si las rentas cambiaron DESPUÉS del pago, el papel lo dice.
//
// El dueño del carro tiene en la mano un papel con un número de comprobante. Si
// después se corrige una renta ya pagada, la tabla de «Le pagué» deja de sumar
// el total guardado. El total NO se recalcula (contradiría el comprobante que
// ya tiene el dueño del carro); el papel dice, en una línea, que el detalle ya
// no coincide, para que quien lo manda pueda explicarlo.
// ---------------------------------------------------------------------------

/** La misma renta ya pagada, pero con el costo por día corregido DESPUÉS del pago. */
const conCostoCorregido = (id, costoDia) => CONTRATOS.map((c) => (
  c.id === id ? { ...c, subarriendo: { ...c.subarriendo, costoDia } } : c
));

const NOTA_DE_CAMBIO = 'Las rentas de esta lista cambiaron después del pago';

test('un pago de Q4,100 cuyas rentas hoy suman Q3,900 lleva la nota, y el total sigue siendo lo que se pagó', () => {
  // ctr-am pasó de Q310 a Q270 por día: (4 + 1) × 270 = Q1,350, y 1,800 + 750 + 1,350 = 3,900.
  const m = armarComprobante(entrada({ contratos: conCostoCorregido('ctr-am', 270) }));
  assert.equal(suma(...m.pagado.filas.map((f) => f.monto)), 3900, 'el escenario: las rentas hoy suman Q3,900');
  assert.equal(m.pagado.cambiaron, true);
  assert.equal(m.pagado.total, 4100, 'lo pagado es lo pagado: no se recalcula');
  assert.equal(m.numero, 7, 'ni se renumera: el dueño del carro ya tiene el papel con ese número');

  const html = htmlComprobante(m);
  assert.ok(html.includes(NOTA_DE_CAMBIO), 'dice que las rentas cambiaron');
  assert.ok(html.includes(`lo pagado fue ${dinero(4100)}`), 'y dice qué se pagó');
  assert.match(html, /Total pagado[^]*?Q4,100\.00/, 'el total del pie sigue siendo el pagado');
  assert.ok(!html.includes(dinero(3900)), 'la suma nueva no se escribe en el papel: contradiría el comprobante');
  // La nota va dentro de «Le pagué», que es donde está la tabla que ya no suma.
  assert.ok(html.indexOf('Le pagué') < html.indexOf(NOTA_DE_CAMBIO));
  assert.ok(html.indexOf(NOTA_DE_CAMBIO) < html.indexOf('Queda pendiente'));
});

test('un pago cuyas rentas siguen sumando lo pagado NO lleva la nota', () => {
  const m = armarComprobante(entrada());
  assert.equal(suma(...m.pagado.filas.map((f) => f.monto)), m.pagado.total, 'el escenario: sí suman');
  assert.equal(m.pagado.cambiaron, false);
  assert.ok(!htmlComprobante(m).includes('cambiaron después del pago'));
});

test('el costo corregido hacia ARRIBA también se avisa (no solo cuando baja)', () => {
  const m = armarComprobante(entrada({ contratos: conCostoCorregido('ctr-a2', 400) }));
  assert.equal(m.pagado.cambiaron, true);
  assert.ok(htmlComprobante(m).includes(NOTA_DE_CAMBIO));
});

test('una renta ya pagada que ya no está cerrada también hace que el detalle no coincida', () => {
  // Se anuló un pago del CLIENTE de ctr-a1 después de pagarle al dueño: la renta
  // vuelve a «devuelto». Su fila sigue en el papel con su costo (se le pagó), pero
  // el detalle ya no es el de ese día.
  const anulada = anularPago(A1, 1, { fecha: '2026-09-25' });
  assert.notEqual(estadoContrato(anulada), 'cerrado', 'el escenario: ya no está cerrada');
  const m = armarComprobante(entrada({ contratos: CONTRATOS.map((c) => (c.id === 'ctr-a1' ? anulada : c)) }));
  assert.equal(m.pagado.cambiaron, true);
  assert.equal(m.pagado.filas[0].monto, 1800, 'su fila sigue ahí');
  assert.ok(htmlComprobante(m).includes(NOTA_DE_CAMBIO));
});

test('si un costo no se pudo LEER no se compara: no hay cifra confiable con qué comparar, y la fila ya lo dice', () => {
  const m = armarComprobante(entrada({ costoSinLeer: ['ctr-a2'] }));
  assert.equal(m.pagado.cambiaron, false);
  assert.ok(!htmlComprobante(m).includes('cambiaron después del pago'));
  assert.ok(htmlComprobante(m).includes('No se pudo leer el costo'));
});

test('el cambio también se le avisa al dueño del negocio en pantalla, antes de imprimir, y ese aviso no sale en el papel', () => {
  const c = contenedorFalso();
  pintarComprobante(c, entrada({ contratos: conCostoCorregido('ctr-am', 270) }));
  const aviso = c.innerHTML.match(/<div class="barra-lectura-fallida[^"]*"[^>]*>[^]*?<\/div>/);
  assert.ok(aviso, 'hay aviso');
  assert.ok(aviso[0].includes('no-imprimir'));
  assert.match(aviso[0], /ya no coincide/);
  assert.ok(c.innerHTML.includes(NOTA_DE_CAMBIO), 'y la nota está en la hoja');
  const limpio = contenedorFalso();
  pintarComprobante(limpio, entrada());
  assert.ok(!limpio.innerHTML.includes('ya no coincide'));
});

// ---------------------------------------------------------------------------
// Datos del dueño
// ---------------------------------------------------------------------------

test('un dueño que solo está escrito a mano en los contratos viejos sale con ese nombre, sin teléfono ni NIT inventados', () => {
  const viejos = [A1, A2, AM].map((c) => ({ ...c, duenoId: null, carroAjeno: { ...c.carroAjeno, dueno: 'Don Mario' } }));
  const pago = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: null, fecha: '2026-09-20', forma: 'efectivo', contratos: viejos, pagos: [], idsMarcados: ['ctr-a1', 'ctr-a2', 'ctr-am'], costoSinLeer: [],
    }),
    { id: 'p9', numero: 9, ahora: AHORA },
  );
  const m = armarComprobante({
    pago, dueno: null, contratos: [...viejos, A3, B1], pagos: [pago], costoSinLeer: [], hoy: HOY,
  });
  assert.deepEqual(m.dueno, { nombre: 'Don Mario', telefono: '', nit: '' });
  assert.equal(m.pagado.total, 4100);
  assert.equal(m.pendiente.filas.length, 0, 'a3 es de un dueño enlazado: no es de «Don Mario»');
  const html = htmlComprobante(m);
  assert.ok(html.includes('Don Mario'));
  assert.ok(!html.includes('undefined') && !html.includes('null'));
});

test('el teléfono o el NIT que faltan se ven como raya, no como «undefined»', () => {
  const sinContacto = construirDueno({ id: 'd1', actualizado: AHORA }, { nombre: 'Mario López Estrada' });
  const html = htmlComprobante(armarComprobante(entrada({ dueno: sinContacto })));
  assert.ok(!html.includes('undefined') && !html.includes('null'));
  assert.ok(html.includes('Teléfono') && html.includes('NIT'));
  assert.match(html, /Teléfono[^]*?—/);
});

test('el texto escrito a mano se escapa: ni el nombre ni el cliente pueden meter HTML al papel', () => {
  const raro = { ...MARIO, nombre: 'Mario <b>&</b> "Hijos"' };
  const clienteRaro = { ...A1, clienteNombre: '<img src=x onerror=alert(1)>' };
  const html = htmlComprobante(armarComprobante(entrada({
    dueno: raro, contratos: [clienteRaro, A2, AM, A3, AP, A5, A6, B1],
  })));
  assert.ok(!html.includes('<b>&</b>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('Mario &lt;b&gt;&amp;&lt;/b&gt; &quot;Hijos&quot;'));
});

// ---------------------------------------------------------------------------
// Un papel incompleto no se imprime: se grita antes.
// ---------------------------------------------------------------------------

test('sin número de comprobante no hay papel: un comprobante sin número no sirve de prueba', () => {
  assert.throws(() => armarComprobante(entrada({ pago: { ...PAGO_7, numero: undefined } })), /número/i);
});

test('sin fecha válida o sin monto no hay papel', () => {
  assert.throws(() => armarComprobante(entrada({ pago: { ...PAGO_7, fecha: '' } })), /fecha/i);
  assert.throws(() => armarComprobante(entrada({ pago: { ...PAGO_7, monto: 0 } })), /monto/i);
});

test('sin «hoy» no hay papel: lo pendiente es «al día de hoy» y el papel tiene que decir cuál', () => {
  assert.throws(() => armarComprobante(entrada({ hoy: undefined })), /hoy/i);
  assert.throws(() => armarComprobante(entrada({ hoy: 'ayer' })), /hoy/i);
});

test('sin la lista costoSinLeer no hay papel: «no sé qué costos se leyeron» no es «todos se leyeron»', () => {
  assert.throws(() => armarComprobante(entrada({ costoSinLeer: undefined })), /costoSinLeer/);
  assert.throws(() => armarComprobante(entrada({ costoSinLeer: 'ctr-a2' })), /costoSinLeer/);
});

// H-6: un pago a un dueño que se ANULÓ ya no pagó nada (sus rentas volvieron a «por pagar»). Reimprimir
// su comprobante diría «Le pagué … Total pagado» sobre algo que el sistema sabe que no está pagado, y
// ese papel sale de la empresa. El número se conserva, pero el papel no se arma.
test('un pago ANULADO no tiene comprobante: lanza, y dice que está anulado y desde cuándo', () => {
  const anulado = pagoDuenoParaGuardar(anularPagoDueno(PAGO_7, { fecha: '2026-10-02' }), { ahora: AHORA + 60000 });
  assert.throws(
    () => armarComprobante(entrada({ pago: anulado, pagos: [PAGO_5, anulado] })),
    { message: /N° 7 está anulado desde el 2 oct 2026/ },
  );
  // Y sin la fecha de la anulación, igual se niega (el pago dice anulado, la fecha es un detalle).
  assert.throws(() => armarComprobante(entrada({ pago: { ...anulado, anuladoEn: undefined } })), { message: /N° 7 está anulado:/ });
});

test('anulado el pago N° 7, las rentas que cubría ya no salen en «Le pagué» de otro comprobante: vuelven a «Queda pendiente»', () => {
  const anulado = pagoDuenoParaGuardar(anularPagoDueno(PAGO_7, { fecha: '2026-10-02' }), { ahora: AHORA + 60000 });
  const m = armarComprobante(entrada({ pago: PAGO_5, pagos: [PAGO_5, anulado] }));
  assert.deepEqual(placasDe(m.pagado.filas), ['P-777GGG'], 'el comprobante N° 5 sigue siendo el suyo: solo A6');
  const pendientes = placasDe(m.pendiente.filas);
  for (const placas of ['P-111AAA', 'P-222BBB', 'P-333CCC']) assert.ok(pendientes.includes(placas), `${placas} vuelve a pendiente`);
  assert.equal(m.pendiente.total, 3600 + 4100, 'y la deuda se suma completa: Q3,600 de antes + los Q4,100 que se anularon');
});

test('si falta alguna de las rentas que cubre el pago, lanza: una tabla a medias es un papel falso', () => {
  const sinA2 = CONTRATOS.filter((c) => c.id !== 'ctr-a2');
  assert.throws(() => armarComprobante(entrada({ contratos: sinA2 })), /no se encontr/i);
  assert.throws(() => armarComprobante(entrada({ contratos: [] })), /no se encontr/i);
});

test('si la lista de pagos o de contratos no es una lista, lanza: no se imprime «nada pendiente» a ciegas', () => {
  // Es la misma regla de liquidacion.js: una lectura fallida no se lee como «no se debe nada».
  assert.throws(() => armarComprobante(entrada({ pagos: undefined })), /lista/);
  assert.throws(() => armarComprobante(entrada({ contratos: null })), /lista/);
});

// ---------------------------------------------------------------------------
// LO QUE EL DUEÑO NO VE
//
// El dueño del carro es un proveedor. Cualquier cifra de lo que Best Price
// cobró, pagó a su empleado o ganó es el margen sobre SU carro. Estas pruebas
// no se conforman con que el módulo «no incluya» esos números hoy: los buscan
// en todo lo que sale (el modelo, el HTML, y lo que de verdad queda en la
// pantalla) para que un cambio futuro que pase datos más ricos, o que dibuje
// un contrato entero, falle fuerte.
// ---------------------------------------------------------------------------

/** Las maneras en que un número puede aparecer escrito en un papel. */
function formasDe(n) {
  const formas = new Set([dinero(n), n.toFixed(2), n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })]);
  // Un número chico («7», «12») aparece por casualidad en fechas y placas; solo
  // se busca crudo si es lo bastante largo para no ser casualidad.
  if (n >= 100) {
    formas.add(String(n));
    formas.add(n.toLocaleString('es-GT', { maximumFractionDigits: 2 }));
  }
  return [...formas];
}

/** Los porcentajes se buscan con su signo: «7 %», «6.5%». Un «7» suelto está en cualquier fecha. */
const formasDePorcentaje = (p) => [`${p} %`, `${p}%`, `${p} %`, `${p} por ciento`];

/**
 * TODO lo que un contrato sabe del negocio de Best Price y que el dueño del
 * carro no puede ver, sacado del núcleo y del propio contrato — nunca
 * escrito a mano aquí, para que la lista no se desactualice sola.
 */
function numerosProhibidosDe(c) {
  const r = resumen(c);
  const com = comisionDe(c);
  const pagos = (c.pagos || []).filter((p) => !p.anulado);
  const numeros = [
    c.precioDia, c.garantiaMonto,
    r.subtotal, r.totalSalida, r.totalDevolucion, r.pagado, r.totalCobrado, r.utilidad, r.saldo,
    com.base, com.monto,
    c.cierre?.danos, c.cierre?.descuento,
    // Cada pago del cliente: lo que anotó, el recargo, y lo que de verdad se le cargó a la tarjeta.
    ...pagos.flatMap((p) => [p.monto, recargoTarjeta(p.monto, p.porcentajeTarjeta), conTarjeta(p.monto, p.porcentajeTarjeta)]),
  ];
  const porcentajes = [c.porcentajeComision, ...pagos.map((p) => p.porcentajeTarjeta)];
  return {
    numeros: numeros.filter((n) => Number.isFinite(n) && n !== 0),
    porcentajes: porcentajes.filter((p) => Number.isFinite(p) && p !== 0),
  };
}

/** Los textos del mostrador que tampoco son del dueño del carro: quién rentó y qué se anotó. */
const TEXTOS_PROHIBIDOS = ['Ana Lucía', 'Ana', 'OBSERVACION-DEL-MOSTRADOR', 'NOTA-INTERNA-DEL-DUENO', '3343', 'BAC'];
const PALABRAS_PROHIBIDAS = [
  /comisi[oó]n/i, /utilidad/i, /ganancia/i, /margen/i, /recargo/i, /tarjeta/i, /garant[ií]a/i,
  /precio/i, /descuento/i, /emplead/i, /cobrado/i, /saldo/i,
];

/** Lo que aparece de la lista en `texto`, para que el mensaje de error diga CUÁL se coló. */
const encontrados = (texto, lista) => lista.filter((x) => texto.includes(x));

/** Todos los números de lo que el papel dice legítimamente (lo suyo), para no confundirlos con una fuga. */
function numerosPermitidos(m) {
  const filas = [...m.pagado.filas, ...m.pendiente.filas];
  return new Set([
    ...filas.flatMap((f) => [f.costoDia, f.monto, f.dias, f.diasAtraso]),
    m.pagado.total, m.pendiente.total, m.numero,
  ].filter(Number.isFinite));
}

test('la prueba de lo prohibido no está vacía: el contrato de prueba de verdad tiene comisión, pagos del cliente y recargo', () => {
  for (const c of [AM, AP]) {
    const { numeros, porcentajes } = numerosProhibidosDe(c);
    assert.ok(comisionDe(c).monto > 0, 'tiene comisión');
    assert.equal(c.pagos.length, 2, 'el cliente pagó dos veces a Best Price');
    assert.ok(c.pagos.every((p) => p.porcentajeTarjeta === 6.5), 'con 6.5 % de tarjeta');
    assert.ok(numeros.length >= 10, `hay muchos números prohibidos que buscar (${numeros.length})`);
    assert.deepEqual(porcentajes.sort(), [6.5, 6.5, 7]);
    // Y ninguno de ellos coincide con algo que el dueño SÍ ve: si coincidiera,
    // una fuga real quedaría escondida detrás de una cifra legítima.
    const permitidos = numerosPermitidos(armarComprobante(entrada()));
    assert.deepEqual(numeros.filter((n) => permitidos.has(n)), [], `lo prohibido de ${c.id} no choca con lo permitido`);
  }
});

test('el detector funciona: encuentra cada cifra prohibida en un papel que la filtra de verdad', () => {
  // Un detector que nunca encuentra nada también «pasa». Esto prueba que ve cada forma.
  const { numeros, porcentajes } = numerosProhibidosDe(AM);
  const papelQueFiltra = [
    ...numeros.map((n) => `${dinero(n)} / ${n}`),
    ...porcentajes.map((p) => `${p} %`),
    ...TEXTOS_PROHIBIDOS,
    'comisión utilidad recargo tarjeta garantía precio descuento empleado cobrado saldo ganancia margen',
  ].join('\n');
  for (const n of numeros) {
    assert.ok(formasDe(n).some((forma) => papelQueFiltra.includes(forma)), `el detector no vio ${n}`);
  }
  for (const p of porcentajes) {
    assert.ok(formasDePorcentaje(p).some((forma) => papelQueFiltra.includes(forma)), `el detector no vio ${p} %`);
  }
  assert.deepEqual(encontrados(papelQueFiltra, TEXTOS_PROHIBIDOS), TEXTOS_PROHIBIDOS);
  assert.equal(PALABRAS_PROHIBIDAS.filter((p) => p.test(papelQueFiltra)).length, PALABRAS_PROHIBIDAS.length);
});

/** Lo que sale del módulo, en las tres formas en que alguien lo puede leer. */
function salidasDe(extra = {}) {
  const modelo = armarComprobante(entrada(extra));
  const html = htmlComprobante(modelo);
  const contenedor = { innerHTML: '', querySelector: () => null, addEventListener() {} };
  pintarComprobante(contenedor, entrada(extra));
  return {
    modelo, html, pantalla: contenedor.innerHTML, json: JSON.stringify(modelo),
  };
}

test('NINGUNA cifra del negocio de Best Price sale en el comprobante: ni comisión, ni lo que pagó el cliente, ni recargo, ni utilidad', () => {
  const { modelo, html, pantalla, json } = salidasDe();
  // Los contratos con margen de verdad entran al papel (uno pagado, uno pendiente):
  assert.ok(html.includes('P-333CCC') && html.includes('P-555EEE'), 'el papel sí trae los contratos con margen');

  const permitidos = numerosPermitidos(modelo);
  const prohibidos = { numeros: new Set(), porcentajes: new Set() };
  for (const c of CONTRATOS) {
    const { numeros, porcentajes } = numerosProhibidosDe(c);
    numeros.forEach((n) => prohibidos.numeros.add(n));
    porcentajes.forEach((p) => prohibidos.porcentajes.add(p));
  }
  // Lo que además es legítimo se saca de la lista (el costo por día de uno puede ser el precio de otro);
  // la prueba anterior asegura que esto no esconde ninguna cifra del contrato con margen.
  const buscar = [...prohibidos.numeros].filter((n) => !permitidos.has(n));
  assert.ok(buscar.length >= 15, `se buscan muchas cifras (${buscar.length})`);
  // Y las que más duelen están de verdad en la búsqueda (no las sacó el filtro de lo permitido):
  // precio de venta, lo cobrado con y sin recargo, utilidad, comisión y su base, daños, descuento, garantía.
  for (const n of [850, 700, 3400, 3621, 221, 1065, 4686, 3136, 288.75, 4125, 275, 125, 4321]) {
    assert.ok(buscar.includes(n), `${n} tiene que estar entre lo que se busca`);
  }

  for (const [donde, texto] of [['el HTML', html], ['lo que queda en pantalla', pantalla], ['el modelo', json]]) {
    for (const n of buscar) {
      assert.deepEqual(
        encontrados(texto, formasDe(n)), [],
        `${donde} lleva ${dinero(n)}, una cifra del negocio de Best Price que el dueño del carro no puede ver`,
      );
    }
    for (const p of prohibidos.porcentajes) {
      assert.deepEqual(encontrados(texto, formasDePorcentaje(p)), [], `${donde} lleva el ${p} %`);
    }
    assert.deepEqual(encontrados(texto, TEXTOS_PROHIBIDOS), [], `${donde} lleva un dato del mostrador`);
  }
});

test('ni una palabra del negocio de Best Price: comisión, utilidad, tarjeta, garantía, precio, saldo…', () => {
  const { html, pantalla } = salidasDe();
  for (const palabra of PALABRAS_PROHIBIDAS) {
    assert.ok(!palabra.test(html), `el HTML dice ${palabra}`);
    assert.ok(!palabra.test(pantalla), `la pantalla dice ${palabra}`);
  }
});

test('ningún id de contrato llega al papel: no hay forma de que un contrato entero viaje escondido en un atributo', () => {
  const { html, pantalla } = salidasDe();
  for (const c of CONTRATOS) {
    assert.ok(!html.includes(c.id), `el HTML lleva el id ${c.id}`);
    assert.ok(!pantalla.includes(c.id), `la pantalla lleva el id ${c.id}`);
  }
  assert.ok(!/data-contrato|data-id|data-json/i.test(html));
});

test('el modelo solo tiene las llaves permitidas: una llave nueva (comision, utilidad, pagos…) hace fallar esto', () => {
  // La lista blanca ES el contrato. Si mañana alguien le agrega al modelo una
  // llave nueva para «mostrar un poco más», esta prueba se rompe y obliga a
  // que alguien decida, con esta lista a la vista, si el dueño debe verla.
  const llaves = (valor, ruta = '') => {
    if (Array.isArray(valor)) return valor.flatMap((v) => llaves(v, `${ruta}[]`));
    if (valor && typeof valor === 'object') {
      return Object.entries(valor).flatMap(([k, v]) => [`${ruta}.${k}`, ...llaves(v, `${ruta}.${k}`)]);
    }
    return [];
  };
  const permitidas = [
    '.numero', '.fecha', '.hoy', '.rentasSinCosto', '.rentasSinCosto.anotar', '.rentasSinCosto.leer',
    '.dueno', '.dueno.nombre', '.dueno.telefono', '.dueno.nit',
    '.pagado', '.pagado.filas', '.pagado.total', '.pagado.forma', '.pagado.cambiaron',
    '.pagado.anteriores', '.pagado.acumulado',
    // El descuento (12 oct): lo que ya se le había pagado de más y lo que de verdad se le entregó son
    // cifras SUYAS —su propio dinero—, y el papel tiene que decirlas para explicar su propio total.
    '.pagado.descuento', '.pagado.entregado', '.pagado.acumuladoDescuento',
    '.pendiente', '.pendiente.filas', '.pendiente.diferencias', '.pendiente.total', '.pendiente.incompleto',
    ...['pagado', 'pendiente'].flatMap((t) => ['fecha', 'placas', 'cliente', 'dias', 'diasAtraso', 'costoDia', 'monto', 'sinCosto']
      .map((k) => `.${t}.filas[].${k}`)),
  ].sort();
  assert.deepEqual([...new Set(llaves(armarComprobante(entrada())))].sort(), permitidas);
  // También con un renglón sin costo y con el dueño sin enlazar: ninguna rama agrega llaves.
  assert.deepEqual(
    [...new Set(llaves(armarComprobante(entrada({ costoSinLeer: ['ctr-a2', 'ctr-a3'], dueno: null }))))].sort(),
    permitidas,
  );
});

test('un pago o un contrato con campos de más NO los arrastra al papel: solo se toma lo permitido', () => {
  // Task 8 puede pasar objetos más ricos de lo debido. Lo que no está en la lista
  // blanca no sale, sin importar qué venga en el contrato o en el pago.
  const rico = { ...AM, utilidadExtra: 424242.42, comisionExtra: 313131.31, margenSecreto: 'MARGEN-SECRETO' };
  const pagoRico = { ...PAGO_7, comisionTotal: 535353.53, utilidad: 646464.64 };
  const duenoRico = { ...MARIO, saldoFavor: 757575.75 };
  const { html, json } = salidasDe({
    contratos: CONTRATOS.map((c) => (c.id === 'ctr-am' ? rico : c)), pago: pagoRico, dueno: duenoRico,
  });
  for (const x of ['424242', '313131', 'MARGEN-SECRETO', '535353', '646464', '757575']) {
    assert.ok(!html.includes(x), `el HTML lleva ${x}`);
    assert.ok(!json.includes(x), `el modelo lleva ${x}`);
  }
});

// ---------------------------------------------------------------------------
// La vista: lo que ve el dueño del negocio en pantalla antes de imprimir.
// ---------------------------------------------------------------------------

/** Un contenedor mínimo, sin DOM: lo que `pintarComprobante` necesita para dibujar y enganchar botones. */
function contenedorFalso() {
  const enganches = {};
  return {
    innerHTML: '',
    enganches,
    querySelector(selector) {
      return {
        addEventListener(evento, fn) { enganches[`${selector}:${evento}`] = fn; },
      };
    },
  };
}

test('pintarComprobante dibuja la hoja y engancha el botón de imprimir al diálogo del navegador', () => {
  const c = contenedorFalso();
  let impresiones = 0;
  pintarComprobante(c, entrada(), { imprimir: () => { impresiones += 1; } });
  assert.ok(c.innerHTML.includes('Le pagué') && c.innerHTML.includes('Queda pendiente'));
  assert.ok(c.innerHTML.includes('Guardar como PDF'), 'le dice cómo sacar el PDF');
  c.enganches['[data-accion="imprimir"]:click']();
  assert.equal(impresiones, 1);
});

test('la barra de botones y las ayudas llevan la marca que la hoja de impresión esconde', () => {
  const c = contenedorFalso();
  pintarComprobante(c, entrada());
  const barra = c.innerHTML.match(/<div class="comp-barra[^"]*"[^>]*>/);
  assert.ok(barra && barra[0].includes('no-imprimir'), 'la barra de botones no puede salir en el papel');
  // Y la hoja misma NO lleva la marca: si la llevara, el papel se escondería a sí mismo.
  const hoja = c.innerHTML.match(/<article class="comprobante[^"]*"/);
  assert.ok(hoja && !hoja[0].includes('no-imprimir'));
});

test('si el comprobante no se puede armar, la pantalla dice por qué y NO dibuja una hoja', () => {
  const c = contenedorFalso();
  pintarComprobante(c, entrada({ contratos: [] }));
  assert.ok(c.innerHTML.includes('barra-lectura-fallida'));
  assert.match(c.innerHTML, /no se encontr/i);
  assert.ok(!c.innerHTML.includes('class="comprobante'), 'ninguna hoja a medias');
  assert.ok(!c.innerHTML.includes('Le pagué'));
});

test('con rentas sin costo la pantalla avisa en rojo ANTES de imprimir, y ese aviso no sale en el papel', () => {
  const c = contenedorFalso();
  pintarComprobante(c, entrada({ costoSinLeer: ['ctr-a3'] }));
  const aviso = c.innerHTML.match(/<div class="barra-lectura-fallida[^"]*"[^>]*>[^]*?<\/div>/);
  assert.ok(aviso, 'hay aviso');
  assert.ok(aviso[0].includes('no-imprimir'), 'el aviso es para el dueño del negocio, no para el dueño del carro');
  assert.match(aviso[0], /1 renta/);
  const limpio = contenedorFalso();
  pintarComprobante(limpio, entrada());
  assert.ok(!limpio.innerHTML.includes('barra-lectura-fallida'), 'sin faltantes no hay aviso');
});

test('el botón de volver solo existe si quien llama dijo a dónde volver', () => {
  const sin = contenedorFalso();
  pintarComprobante(sin, entrada());
  assert.ok(!sin.innerHTML.includes('data-accion="volver"'));
  const con = contenedorFalso();
  let volvio = 0;
  pintarComprobante(con, entrada(), { alVolver: () => { volvio += 1; } });
  assert.ok(con.innerHTML.includes('data-accion="volver"'));
  con.enganches['[data-accion="volver"]:click']();
  assert.equal(volvio, 1);
});

// ---------------------------------------------------------------------------
// La hoja de impresión (css/estilos.css, @media print): Carta, vertical.
// La prueba de verdad es en el navegador (el papel se mide ahí); esto solo
// impide que alguien borre sin querer el bloque que esconde el menú.
// ---------------------------------------------------------------------------

test('estilos.css trae un @media print que fija Carta vertical y esconde el menú, los botones y lo que no es la hoja', () => {
  const css = readFileSync(new URL('../css/estilos.css', import.meta.url), 'utf8');
  const desde = css.indexOf('@media print');
  assert.ok(desde >= 0, 'falta @media print');
  // @page va suelto, no dentro del @media: solo aplica al imprimir de todos modos,
  // y así lo lee también Safari, que ignora el tamaño pero respeta el margen.
  assert.match(css, /@page\s*{[^}]*size:\s*letter\s+portrait/);
  const impresion = css.slice(desde);
  for (const pieza of ['.barra', '#entrada', '#avisos', '.no-imprimir', '.btn']) {
    assert.ok(impresion.includes(pieza), `${pieza} se esconde al imprimir`);
  }
  assert.match(impresion, /display:\s*none/);
});

test('el membrete es solo de Best Price y sin imágenes: texto, para abrir al instante y salir igual en cualquier computadora', () => {
  // Confirmado por el dueño el 5 de octubre, campo por campo.
  assert.equal(MEMBRETE.nombre, 'Best Price Rent a Car Guatemala');
  // Sin NIT: él dijo que no lo quiere en este papel. Es un comprobante entre
  // él y el dueño del carro, no una factura, y una prueba que lo fije evita
  // que alguien lo "complete" después creyendo que faltaba.
  assert.ok(!/\bNIT\b/i.test(MEMBRETE.contacto.join(' ')));
  // Los tres WhatsApp que él usa, juntos en una línea.
  for (const numero of ['4019-3131', '4001-2626', '5770-5278']) {
    assert.ok(MEMBRETE.contacto.join(' ').includes(numero), `falta el WhatsApp ${numero}`);
  }
  assert.ok(MEMBRETE.contacto.join(' ').includes('bestprice.ventas@gmail.com'));
  const html = htmlComprobante(armarComprobante(entrada()));
  assert.ok(!/<img|url\(|<svg/i.test(html));
  assert.ok(html.includes(MEMBRETE.nombre));
});

// ---------------------------------------------------------------------------
// Una renta ya pagada cuyo monto CRECE después (revisión final, hallazgo 1).
//
// El papel que sale de la empresa no puede decir «No queda nada pendiente» con
// una deuda abierta, ni mostrar el pago de una diferencia como si fuera un pago
// de menos. Aquí los dos casos, con el costo de ctr-a2 corregido DESPUÉS del
// pago N° 7 (de Q250 a Q400 por día: 750 → 1,200, Q450 más).
// ---------------------------------------------------------------------------

/** Las tres rentas del pago N° 7, con ctr-a2 corregida hacia arriba: hoy suman Q4,550 y se pagaron Q4,100. */
const RENTAS_DEL_7 = ['ctr-a1', 'ctr-a2', 'ctr-am'];
const CRECIDAS = conCostoCorregido('ctr-a2', 400);
const SOLO_LAS_DEL_7 = CRECIDAS.filter((c) => RENTAS_DEL_7.includes(c.id));

/** El pago de la diferencia, armado como lo arma la pantalla: marcando la diferencia en la cuenta. */
function pagoDeLaDiferencia() {
  const { diferencias } = cuentaDeDueno({ contratos: CRECIDAS.filter((c) => c.duenoId === 'd1'), pagos: [PAGO_5, PAGO_7] });
  assert.equal(diferencias.length, 1, 'el escenario: hay una diferencia');
  return pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd1',
      fecha: '2026-10-01',
      forma: 'efectivo',
      contratos: CRECIDAS,
      pagos: [PAGO_5, PAGO_7],
      idsMarcados: [diferencias[0].clave],
      costoSinLeer: [],
    }),
    { id: 'p9', numero: 9, ahora: AHORA },
  );
}

test('la diferencia de una renta que creció sale en «Queda pendiente», con de dónde viene, y suma al total', () => {
  const m = armarComprobante(entrada({ contratos: CRECIDAS }));
  assert.equal(m.pendiente.diferencias.length, 1);
  assert.deepEqual(m.pendiente.diferencias[0], {
    comprobantes: [7], placas: ['P-111AAA', 'P-222BBB', 'P-333CCC'], pagado: 4100, ahora: 4550, monto: 450, sinCosto: null,
  });
  assert.equal(m.pendiente.total, 3600 + 450, 'las rentas por pagar más la diferencia: la misma cifra que la ficha');
  assert.equal(m.pendiente.incompleto, false);

  const html = htmlComprobante(m);
  assert.ok(html.includes('Diferencia de rentas ya pagadas en el comprobante N° 7'));
  assert.ok(html.includes(`Se pagaron ${dinero(4100)} y hoy esas rentas suman ${dinero(4550)}`));
  assert.match(html, /Total pendiente[^]*?Q4,050\.00/);
});

test('con una diferencia por pagar el papel NUNCA dice «No queda nada pendiente»', () => {
  // Sin ninguna renta por pagar: solo las tres del pago N° 7, una de ellas crecida.
  const m = armarComprobante(entrada({ contratos: SOLO_LAS_DEL_7 }));
  assert.deepEqual(m.pendiente.filas, []);
  assert.equal(m.pendiente.diferencias.length, 1);
  assert.equal(m.pendiente.total, 450);
  const html = htmlComprobante(m);
  assert.ok(!html.includes('No queda nada pendiente'), 'una deuda abierta no se escribe como saldada');
  assert.ok(html.includes(dinero(450)));

  // Y sin la diferencia (nada cambió) sí lo dice, como siempre.
  const sinCambio = armarComprobante(entrada({ contratos: CONTRATOS.filter((c) => RENTAS_DEL_7.includes(c.id)) }));
  assert.deepEqual(sinCambio.pendiente.diferencias, []);
  assert.ok(htmlComprobante(sinCambio).includes('No queda nada pendiente'));
});

test('el comprobante del pago de la diferencia dice que completa el N° 7, y no que las rentas «cambiaron»', () => {
  const p9 = pagoDeLaDiferencia();
  assert.equal(p9.monto, 450);
  assert.deepEqual(p9.contratos.sort(), [...RENTAS_DEL_7].sort(), 'cubre las mismas rentas que el pago original');

  const m = armarComprobante(entrada({ pago: p9, contratos: CRECIDAS, pagos: [PAGO_5, PAGO_7, p9] }));
  assert.equal(m.numero, 9);
  assert.equal(m.pagado.total, 450, 'lo pagado en ESTE comprobante');
  assert.deepEqual(m.pagado.anteriores, [{ numero: 7, monto: 4100 }]);
  assert.equal(m.pagado.acumulado, 4550, 'lo que lleva recibido por esas rentas: 4,100 + 450');
  assert.equal(m.pagado.cambiaron, false, 'no es un «cambió»: es la diferencia, y tiene su propia nota');
  assert.deepEqual(m.pendiente.diferencias, [], 'pagada: el grupo vuelve a cuadrar');
  assert.equal(m.pendiente.total, 3600);

  const html = htmlComprobante(m);
  assert.ok(html.includes(`este pago completa el comprobante N° 7 (${dinero(4100)})`));
  assert.ok(html.includes(`se le han pagado ${dinero(4550)}`));
  assert.ok(!html.includes('cambiaron después del pago'), 'no la nota genérica, que diría que el detalle no suma y nada más');
  assert.ok(html.indexOf('Le pagué') < html.indexOf('este pago completa'));
  assert.ok(html.indexOf('este pago completa') < html.indexOf('Queda pendiente'));
});

test('el comprobante ORIGINAL, reimpreso después de pagar la diferencia, conserva su total y su nota', () => {
  const p9 = pagoDeLaDiferencia();
  const m = armarComprobante(entrada({ contratos: CRECIDAS, pagos: [PAGO_5, PAGO_7, p9] }));
  assert.equal(m.pagado.total, 4100, 'lo que dice el papel que el dueño del carro ya tiene');
  assert.deepEqual(m.pagado.anteriores, [], 'es el primero: no completa ninguno');
  assert.equal(m.pagado.cambiaron, true);
  assert.deepEqual(m.pendiente.diferencias, []);
  assert.ok(htmlComprobante(m).includes('cambiaron después del pago'));
});

/**
 * La cadena de verdad de tres pagos sobre las mismas rentas: el N° 7 paga las
 * rentas como estaban; ctr-a2 sube y el N° 9 paga esos Q450; después ctr-am sube
 * otra vez (310 → 330 por día, 5 días: Q100 más) y el N° 10 paga ESA diferencia.
 * El pago final sale de marcar la diferencia en la cuenta, igual que en la pantalla,
 * y no de un monto escrito a mano: así las rentas cuestan hoy lo mismo que lo
 * pagado en total, que es lo único que hace que el papel pueda decir «completa».
 */
function cadenaDeTresPagos() {
  const p9 = pagoDeLaDiferencia();
  const SEGUNDA_SUBIDA = CRECIDAS.map((c) => (
    c.id === 'ctr-am' ? { ...c, subarriendo: { ...c.subarriendo, costoDia: 330 } } : c
  ));
  const { diferencias } = cuentaDeDueno({
    contratos: SEGUNDA_SUBIDA.filter((c) => c.duenoId === 'd1'), pagos: [PAGO_5, PAGO_7, p9],
  });
  assert.equal(diferencias.length, 1, 'el escenario: la segunda subida deja una diferencia');
  assert.equal(diferencias[0].diferencia, 100);
  const p10 = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd1',
      fecha: '2026-10-02',
      forma: 'efectivo',
      contratos: SEGUNDA_SUBIDA,
      pagos: [PAGO_5, PAGO_7, p9],
      idsMarcados: [diferencias[0].clave],
      costoSinLeer: [],
    }),
    { id: 'p10', numero: 10, ahora: AHORA },
  );
  return { p9, p10, contratos: SEGUNDA_SUBIDA, pagos: [PAGO_5, PAGO_7, p9, p10] };
}

test('con tres pagos sobre las mismas rentas, el último los nombra a los dos anteriores', () => {
  const { p10, contratos, pagos } = cadenaDeTresPagos();
  assert.equal(p10.monto, 100);
  const m = armarComprobante(entrada({ pago: p10, contratos, pagos }));
  assert.deepEqual(m.pagado.anteriores, [{ numero: 7, monto: 4100 }, { numero: 9, monto: 450 }]);
  assert.equal(m.pagado.acumulado, 4650);
  assert.equal(m.pagado.cambiaron, false);
  // Lo recibido en total es lo que esas rentas cuestan hoy: el papel no se contradice.
  assert.equal(m.pagado.acumulado, totalSeleccionado(contratos, RENTAS_DEL_7));
  assert.deepEqual(m.pendiente.diferencias, [], 'con el N° 10 el grupo vuelve a cuadrar');
  assert.ok(htmlComprobante(m).includes(`los comprobantes N° 7 (${dinero(4100)}) y N° 9 (${dinero(450)})`));
});

test('en esa cadena, el N° 9 reimpreso después del N° 10 sigue nombrando solo al N° 7', () => {
  const { p9, contratos, pagos } = cadenaDeTresPagos();
  const m = armarComprobante(entrada({ pago: p9, contratos, pagos }));
  assert.deepEqual(m.pagado.anteriores, [{ numero: 7, monto: 4100 }]);
  assert.equal(m.pagado.acumulado, 4550, 'lo que llevaba recibido al emitirse el N° 9, no lo que lleva hoy');
});

test('un tercer pago de más (las rentas NO volvieron a subir) no se imprime como «completa»: es un pago de más', () => {
  // Las mismas rentas de la prueba anterior, pero sin la segunda subida: cuestan Q4,550 y
  // con un pago de Q100 detrás del N° 9 ya se han pagado Q4,650. Nadie «completó» nada: hay
  // Q100 de más, y decir que el papel completa los comprobantes N° 7 y N° 9 enseñaría una
  // tabla de Q4,550 junto a una frase que dice que se le pagó Q4,650.
  const p9 = pagoDeLaDiferencia();
  const deMas = pagoDuenoParaGuardar(
    { duenoId: 'd1', fecha: '2026-10-02', forma: 'efectivo', monto: 100, contratos: [...RENTAS_DEL_7] },
    { id: 'p10', numero: 10, ahora: AHORA },
  );
  const m = armarComprobante(entrada({ pago: deMas, contratos: CRECIDAS, pagos: [PAGO_5, PAGO_7, p9, deMas] }));
  assert.deepEqual(m.pagado.anteriores, []);
  assert.equal(m.pagado.acumulado, 100, 'solo lo que se pagó en este comprobante');
  assert.ok(!htmlComprobante(m).includes('este pago completa'));
});

test('el mismo pago registrado dos veces NO se imprime como «completa el anterior»: las rentas no cambiaron, es un pago de más', () => {
  // Dos pestañas pagando lo mismo (el riesgo que el sistema ya conoce y no cubre). El
  // segundo comprobante cubre las mismas rentas por la misma cifra: decir que «cambiaron
  // de monto» sería falso, y el papel no debe inventar una explicación.
  const repetido = pagoDuenoParaGuardar(
    { duenoId: 'd1', fecha: '2026-09-21', forma: 'transferencia', monto: PAGO_7.monto, contratos: [...PAGO_7.contratos] },
    { id: 'p8', numero: 8, ahora: AHORA },
  );
  const m = armarComprobante(entrada({ pago: repetido, pagos: [PAGO_5, PAGO_7, repetido] }));
  assert.deepEqual(m.pagado.anteriores, []);
  assert.equal(m.pagado.cambiaron, false, 'sus filas suman lo que dice su total');
  assert.equal(m.pagado.acumulado, 4100, 'solo lo que se pagó en este comprobante');
  const html = htmlComprobante(m);
  assert.ok(!html.includes('este pago completa'));
  assert.ok(!html.includes('cambiaron'));
});

test('una diferencia cuyo costo no se pudo leer sale sin cifra y hace incompleto el total pendiente', () => {
  const m = armarComprobante(entrada({ contratos: CRECIDAS, costoSinLeer: ['ctr-a2'] }));
  const [dif] = m.pendiente.diferencias;
  assert.equal(dif.sinCosto, 'leer');
  assert.equal(dif.monto, null);
  assert.equal(dif.ahora, null);
  assert.equal(dif.pagado, 4100, 'lo que se pagó sí se sabe');
  assert.equal(m.pendiente.incompleto, true);
  assert.equal(m.pendiente.total, null, 'no se da un total sumando lo que sí se sabe');
  const html = htmlComprobante(m);
  assert.ok(html.includes('No se pudo leer el costo'));
  assert.ok(html.includes('No se puede dar el total'));
  assert.ok(!html.includes(dinero(450)));
  assert.equal(m.rentasSinCosto.leer, 2, 'la renta pagada y la diferencia: las dos salen sin cifra');
});

test('con diferencias el modelo sigue teniendo solo las llaves permitidas, y el papel ni una cifra del negocio', () => {
  const llaves = (valor, ruta = '') => {
    if (Array.isArray(valor)) return valor.flatMap((v) => llaves(v, `${ruta}[]`));
    if (valor && typeof valor === 'object') {
      return Object.entries(valor).flatMap(([k, v]) => [`${ruta}.${k}`, ...llaves(v, `${ruta}.${k}`)]);
    }
    return [];
  };
  const p9 = pagoDeLaDiferencia();
  const original = armarComprobante(entrada({ contratos: CRECIDAS }));
  const complemento = armarComprobante(entrada({ pago: p9, contratos: CRECIDAS, pagos: [PAGO_5, PAGO_7, p9] }));
  const nuevas = (modelo) => [...new Set(llaves(modelo))].filter((k) => /anteriores|acumulado|diferencias/.test(k)).sort();
  assert.deepEqual(nuevas(original), [
    '.pagado.acumulado', '.pagado.acumuladoDescuento', '.pagado.anteriores', '.pendiente.diferencias',
    '.pendiente.diferencias[].ahora', '.pendiente.diferencias[].comprobantes', '.pendiente.diferencias[].monto',
    '.pendiente.diferencias[].pagado', '.pendiente.diferencias[].placas', '.pendiente.diferencias[].sinCosto',
  ]);
  assert.deepEqual(nuevas(complemento), [
    '.pagado.acumulado', '.pagado.acumuladoDescuento', '.pagado.anteriores', '.pagado.anteriores[].monto',
    '.pagado.anteriores[].numero', '.pendiente.diferencias',
  ]);

  // Nada del negocio de Best Price en el papel de la diferencia, ni en su versión en pantalla.
  for (const extra of [{ contratos: CRECIDAS }, { pago: p9, contratos: CRECIDAS, pagos: [PAGO_5, PAGO_7, p9] }]) {
    const { html, pantalla, json } = salidasDe(extra);
    for (const palabra of PALABRAS_PROHIBIDAS) {
      assert.ok(!palabra.test(html), `el HTML dice ${palabra}`);
      assert.ok(!palabra.test(pantalla), `la pantalla dice ${palabra}`);
    }
    for (const x of [...TEXTOS_PROHIBIDOS, '4,686', '3,136', '288.75']) {
      assert.ok(!html.includes(x) && !json.includes(x), `se coló ${x}`);
    }
    assert.ok(!/data-contrato|data-id|data-json/i.test(html));
    for (const c of CONTRATOS) assert.ok(!html.includes(c.id) && !pantalla.includes(c.id), `lleva el id ${c.id}`);
  }
});

// ---------------------------------------------------------------------------
// El DESCUENTO en el papel (12 oct 2026).
//
// A Ofelia Ramos se le pagó de más: la renta N.° 21 se pagó con Q2,100 (comprobante N.° 12) y se
// corrigió después a Q1,500. Al pagarle la renta N.° 22 (Q1,200) él descontó esos Q600 y le entregó
// Q600. El pago guarda `monto` = Q1,200 (lo que suman las rentas) y `descuento` = Q600; lo entregado
// es la resta, y lo dice el núcleo (`entregadoDelPago`).
//
// Antes de este cambio el papel decía «Total pagado Q1,200.00» sobre una renta de Q1,200: lo que NO
// salió de sus manos. Y ese papel va con el dueño del carro, que cuadra su cuenta con él. Un papel
// cuyas filas no explican su total es peor que ninguno: lo primero que concluye quien lo nota es que
// la contabilidad es descuidada.
//
// Todo sale de los constructores reales (`construirContrato`, `construirCierre`, `construirPagoDueno`,
// `pagoDuenoParaGuardar`): ningún pago ni contrato escrito a mano.
// ---------------------------------------------------------------------------

const OFELIA = construirDueno(
  { id: 'd3', actualizado: AHORA },
  {
    nombre: 'Ofelia Ramos', telefono: '4444-5678', nit: '7650123-0', nota: 'NOTA-INTERNA-DEL-DUENO',
  },
);
const DE_OFELIA = { duenoId: 'd3', dueno: 'Ofelia Ramos' };
const DATOS_21 = {
  id: 'ctr-o21', numero: 21, placas: 'P-212OOO', cliente: ROSA, costoDia: 300, dias: 4, fechaSalida: '2026-08-20', ...DE_OFELIA,
};
const DATOS_22 = {
  id: 'ctr-o22', numero: 22, placas: 'P-313OOO', cliente: LUCIA, costoDia: 240, dias: 4, fechaSalida: '2026-09-25', ...DE_OFELIA,
};
const DATOS_23 = {
  id: 'ctr-o23', numero: 23, placas: 'P-414OOO', cliente: JUAN, costoDia: 190, dias: 4, fechaSalida: '2026-09-28', ...DE_OFELIA,
};

/**
 * Una renta de Ofelia, cerrada con `atraso` días de atraso. Con `corregidaA`, el cierre se corrige
 * después a esos días de atraso —como «Guardar correcciones»—: si baja, el cliente queda con crédito
 * y la renta sigue cerrada; si sube, el cliente paga lo de más y vuelve a quedar cerrada.
 */
function rentaDeOfelia(datos, atraso, corregidaA = null) {
  const base = saldado(recibido(salida(datos), atraso));
  if (corregidaA === null) return guardado(base);
  const corregido = recibido(base, corregidaA);
  return guardado(resumen(corregido).saldo > 0 ? saldado(corregido) : corregido);
}

/**
 * El escenario completo. La renta 21 se pagó con Q2,100 (3 días de atraso) y hoy está corregida a
 * `corregida21` días de atraso (1 → Q1,500: Q600 de más). La renta que se paga con descuento es
 * `nueva` (por omisión la 22, con todo lo que el dueño del carro no debe ver, Q1,200 con un día de
 * atraso); la 23 (Q760) queda por pagar.
 */
function escenarioOfelia({
  descuento = 600, corregida21 = 1, nueva = null, datosNueva = DATOS_22, atrasoNueva = 1,
} = {}) {
  const antes21 = rentaDeOfelia(DATOS_21, 3);
  const ahora21 = rentaDeOfelia(DATOS_21, 3, corregida21);
  const nueva22 = nueva ?? conMargen({
    id: datosNueva.id, numero: datosNueva.numero, placas: datosNueva.placas, cliente: datosNueva.cliente,
    costoDia: datosNueva.costoDia, fechaSalida: datosNueva.fechaSalida, ...DE_OFELIA,
  });
  const pendiente = rentaDeOfelia(DATOS_23, 0);
  const p12 = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd3', fecha: '2026-09-10', forma: 'efectivo', contratos: [antes21], pagos: [], idsMarcados: ['ctr-o21'], costoSinLeer: [],
    }),
    { id: 'p12', numero: 12, ahora: AHORA },
  );
  const contratos = [ahora21, nueva22, pendiente];
  const p14 = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd3',
      fecha: '2026-10-01',
      forma: 'efectivo',
      contratos,
      pagos: [p12],
      idsMarcados: [nueva22.id],
      descuento,
      costoSinLeer: [],
    }),
    { id: 'p14', numero: 14, ahora: AHORA },
  );
  return {
    contratos, p12, p14, nueva22, ahora21, pendiente, atrasoNueva,
    entrada: (extra = {}) => ({
      pago: p14, dueno: OFELIA, contratos, pagos: [p12, p14], costoSinLeer: [], hoy: HOY, ...extra,
    }),
  };
}

/** Las filas del pie de «Le pagué», como [etiqueta, cifra]: lo que alguien lee de arriba abajo en el papel. */
function pieDePagado(html) {
  const pagado = html.slice(html.indexOf('<section class="comp-seccion comp-pagado">'), html.indexOf('<section class="comp-seccion comp-pendiente">'));
  const pie = pagado.match(/<tfoot>([^]*?)<\/tfoot>/)[1];
  return [...pie.matchAll(/<tr[^>]*>\s*<th[^>]*>([^<]*)<\/th>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/g)].map((m) => [m[1], m[2]]);
}
/** El texto de cada nota (`comp-nota-cambio`) de «Le pagué». */
function notasDe(html) {
  const pagado = html.slice(html.indexOf('<section class="comp-seccion comp-pagado">'), html.indexOf('<section class="comp-seccion comp-pendiente">'));
  return [...pagado.matchAll(/<p class="comp-nota-cambio">([^<]*)<\/p>/g)].map((m) => m[1]);
}

test('descuento, el escenario: se pagaron Q2,100, hoy cuesta Q1,500, y se paga una renta de Q1,200 descontando Q600', () => {
  const e = escenarioOfelia();
  assert.equal(estadoContrato(e.ahora21), 'cerrado');
  assert.equal(estadoContrato(e.nueva22), 'cerrado');
  assert.equal(e.p12.monto, 2100);
  assert.equal(resumen(e.ahora21).costoSubarriendo, 1500, 'hoy cuesta Q1,500: se le pagaron Q600 de más');
  assert.equal(resumen(e.nueva22).costoSubarriendo, 1200);
  assert.equal(e.p14.monto, 1200, 'monto = lo que suman las rentas, como siempre');
  assert.equal(e.p14.descuento, 600);
  assert.equal(entregadoDelPago(e.p14), 600, 'lo que de verdad salió de sus manos');
  assert.deepEqual(e.p14.contratos, ['ctr-o22']);
  // El descuento tiene de dónde salir: después de él ya no sobra nada.
  const cuenta = cuentaDeDueno({ contratos: e.contratos, pagos: [e.p12, e.p14] });
  assert.deepEqual(pagadoDeMas(cuenta, []), []);
  assert.equal(pagadoDeMas(cuentaDeDueno({ contratos: e.contratos, pagos: [e.p12] }), [])[0].deMas, 600, 'y sin el descuento sobrarían los Q600');
});

test('descuento: el modelo dice las rentas, lo descontado y lo entregado — del núcleo, no restado aquí', () => {
  const e = escenarioOfelia();
  const m = armarComprobante(e.entrada());
  assert.equal(m.numero, 14);
  assert.equal(m.pagado.total, 1200, 'lo que suman las rentas de este pago');
  assert.equal(m.pagado.descuento, 600);
  assert.equal(m.pagado.entregado, 600);
  assert.equal(m.pagado.entregado, entregadoDelPago(e.p14), 'la misma cifra que el núcleo y que «Ya pagado» de la ficha');
  assert.equal(m.pagado.descuento, descuentoDelPago(e.p14));
  assert.deepEqual(placasDe(m.pagado.filas), ['P-313OOO']);
  assert.equal(m.pagado.filas[0].monto, 1200);
  assert.deepEqual(m.pagado.anteriores, []);
});

test('descuento: el pie de «Le pagué» se lee de arriba abajo — rentas, menos lo ya pagado de más, igual al total pagado', () => {
  const html = htmlComprobante(armarComprobante(escenarioOfelia().entrada()));
  assert.deepEqual(pieDePagado(html), [
    ['Rentas pagadas con este comprobante', 'Q1,200.00'],
    ['Menos: lo que ya se le había pagado de más', '-Q600.00'],
    ['Total pagado', 'Q600.00'],
  ]);
  // La cuenta cuadra con las filas de arriba: la tabla suma las rentas, y la resta da el total (sumado AQUÍ, no en el módulo).
  const m = armarComprobante(escenarioOfelia().entrada());
  assert.equal(suma(...m.pagado.filas.map((f) => f.monto)), 1200);
  assert.equal(suma(1200, -600), 600);
  // «Total pagado» ya no es lo que suman las rentas (Q1,200): ese era el papel equivocado.
  assert.ok(!/Total pagado<\/th>\s*<td class="num">Q1,200\.00/.test(html), 'el total pagado no es Q1,200');
});

test('descuento: el papel dice con palabras de dónde sale la resta, para quien no conoce el sistema', () => {
  const html = htmlComprobante(armarComprobante(escenarioOfelia().entrada()));
  const [nota, ...mas] = notasDe(html);
  assert.deepEqual(mas, [], 'una sola nota: las rentas no cambiaron');
  assert.equal(
    nota,
    'Nota: antes se le pagaron Q600.00 de más. Esa cantidad no se entrega otra vez: se resta de este pago. '
    + 'Las rentas de esta lista quedan pagadas por completo (Q1,200.00) y lo que se entregó con este comprobante fue Q600.00.',
  );
  // Va dentro de «Le pagué», antes de «Queda pendiente», y el pie con la cuenta va antes que la nota.
  assert.ok(html.indexOf('Le pagué') < html.indexOf('Menos: lo que ya se le había pagado de más'));
  assert.ok(html.indexOf('Menos: lo que ya se le había pagado de más') < html.indexOf('Nota: antes se le pagaron'));
  assert.ok(html.indexOf('Nota: antes se le pagaron') < html.indexOf('Queda pendiente'));
  assert.ok(html.includes('Forma de pago: <strong>Efectivo</strong>'), 'la forma es de lo que se entregó');
});

test('descuento: la nota de «cambiaron» NO se dispara sola — las rentas no cambiaron, el total difiere por el descuento', () => {
  const e = escenarioOfelia();
  const m = armarComprobante(e.entrada());
  assert.equal(m.pagado.cambiaron, false);
  const html = htmlComprobante(m);
  assert.ok(!html.includes('cambiaron'), 'ni la nota de «cambiaron» ni la de «completa»');
  assert.ok(!html.includes('ya no suma'));
  // Ni el aviso al dueño del negocio en pantalla: no hay nada que revisar.
  const c = contenedorFalso();
  pintarComprobante(c, e.entrada());
  assert.ok(!c.innerHTML.includes('ya no coincide'));
  assert.ok(!c.innerHTML.includes('barra-lectura-fallida'));
});

test('descuento: si las rentas SÍ cambiaron después, la nota de cambio lo dice y no confunde lo entregado con lo que sumaban', () => {
  // La renta 22 (la de este pago) se corrige DESPUÉS del pago, de 1 a 0 días de atraso: hoy cuesta Q960.
  const base = escenarioOfelia({ nueva: rentaDeOfelia(DATOS_22, 1) });
  assert.equal(base.p14.monto, 1200);
  const corregida = rentaDeOfelia(DATOS_22, 1, 0);
  assert.equal(resumen(corregida).costoSubarriendo, 960);
  const e = { ...base, contratos: base.contratos.map((c) => (c.id === 'ctr-o22' ? corregida : c)) };
  const m = armarComprobante(base.entrada({ contratos: e.contratos }));
  assert.equal(m.pagado.cambiaron, true);
  assert.equal(m.pagado.total, 1200, 'lo que sumaban al pagar: no se recalcula');
  assert.equal(m.pagado.entregado, 600, 'y lo entregado tampoco');
  const html = htmlComprobante(m);
  assert.deepEqual(pieDePagado(html), [
    ['Rentas pagadas con este comprobante', 'Q1,200.00'],
    ['Menos: lo que ya se le había pagado de más', '-Q600.00'],
    ['Total pagado', 'Q600.00'],
  ]);
  const notas = notasDe(html);
  assert.equal(notas.length, 2, 'la del descuento y la del cambio');
  assert.ok(notas[0].startsWith('Nota: antes se le pagaron Q600.00 de más.'), 'primero lo que explica el total');
  assert.equal(
    notas[1],
    'Nota: al hacer este pago las rentas de esta lista sumaban Q1,200.00. Cambiaron después, por eso su detalle ya no suma esa cifra. '
    + 'Lo entregado con este comprobante, Q600.00, es lo que se pagó ese día y no cambia.',
  );
  assert.ok(!notas[1].includes('lo pagado fue'), 'no la frase de siempre, que con un descuento llamaría «pagado» a lo que sumaban las rentas');
  // La fila de la renta sí dice lo que cuesta hoy (Q960.00), como siempre; lo que no se escribe es una suma nueva
  // en el pie ni en las notas, que contradiría el comprobante que el dueño del carro ya tiene.
  assert.equal(m.pagado.filas[0].monto, 960);
  assert.ok(!notas.join(' ').includes(dinero(960)));
  // Y el aviso para quien manda el papel, en pantalla, habla de lo mismo.
  const c = contenedorFalso();
  pintarComprobante(c, base.entrada({ contratos: e.contratos }));
  const aviso = c.innerHTML.match(/<div class="barra-lectura-fallida[^"]*"[^>]*>[^]*?<\/div>/)[0];
  assert.ok(aviso.includes('no-imprimir'));
  assert.match(aviso, /sumaban Q1,200\.00 cuando se pagó y ya no coinciden/);
  assert.match(aviso, /lo entregado \(Q600\.00\)/);
  assert.ok(!/Lo pagado \(/.test(aviso), 'no la frase de siempre');
});

test('descuento y núcleo: la nota de cambio y los grupos del núcleo contestan igual en cada estado de la renta pagada', () => {
  // El comprobante contesta «¿cambiaron las rentas?» comparando contra `monto`, no contra lo entregado; el núcleo
  // (`gruposDePago`) compara `pagado` contra `ahora`. Con un descuento NO deben irse cada uno por su lado: si
  // lo hicieran, el papel diría «cambiaron» donde la ficha dice que está a mano, o al revés.
  const estados = [['sin cambios', 1, false], ['corregida hacia abajo', 0, true], ['corregida hacia arriba', 2, true]];
  for (const [nombre, corregidaA, cambio] of estados) {
    const base = escenarioOfelia({ nueva: rentaDeOfelia(DATOS_22, 1) });
    const hoyEstaRenta = rentaDeOfelia(DATOS_22, 1, corregidaA);
    assert.equal(estadoContrato(hoyEstaRenta), 'cerrado', `${nombre}: sigue cerrada`);
    const contratos = base.contratos.map((c) => (c.id === 'ctr-o22' ? hoyEstaRenta : c));
    const cuenta = cuentaDeDueno({ contratos, pagos: [base.p12, base.p14] });
    const grupo = cuenta.gruposDePago.find((g) => g.pagos.some((p) => p.numero === 14));
    const m = armarComprobante(base.entrada({ contratos }));
    assert.equal(m.pagado.cambiaron, cambio, nombre);
    assert.equal(grupo.diferencia !== 0, cambio, `${nombre}: el núcleo dice lo mismo`);
    assert.equal(grupo.pagado, 1200, `${nombre}: el grupo compara el monto, descuento incluido`);
    assert.equal(grupo.descuento, 600, nombre);
    assert.equal(m.pagado.entregado, 600, `${nombre}: lo entregado no se mueve`);
  }
});

test('descuento: una REIMPRESIÓN dice lo mismo — el descuento y lo entregado salen del pago guardado, no del costo de hoy', () => {
  const e = escenarioOfelia({ nueva: rentaDeOfelia(DATOS_22, 1) });
  const original = armarComprobante(e.entrada());
  const pieOriginal = pieDePagado(htmlComprobante(original));

  // (a) semanas después, con otra fecha de «hoy».
  const despues = armarComprobante(e.entrada({ hoy: '2026-12-20' }));
  assert.deepEqual(pieDePagado(htmlComprobante(despues)), pieOriginal);

  // (b) la renta pagada cuesta otra cosa hoy (corregida hacia abajo y hacia arriba).
  for (const corregidaA of [0, 2]) {
    const contratos = e.contratos.map((c) => (c.id === 'ctr-o22' ? rentaDeOfelia(DATOS_22, 1, corregidaA) : c));
    const m = armarComprobante(e.entrada({ contratos }));
    assert.equal(m.pagado.total, 1200, `corregida a ${corregidaA}`);
    assert.equal(m.pagado.descuento, 600);
    assert.equal(m.pagado.entregado, 600, 'lo entregado no se recalcula con el costo de hoy');
    assert.deepEqual(pieDePagado(htmlComprobante(m)), pieOriginal, 'el pie del papel es el mismo que el original');
  }

  // (c) el comprobante N.° 12, el que había pagado de más, se anula: el descuento se queda sin respaldo en la
  // cuenta, pero el papel que él ya entregó no cambia (es lo que se entregó ese día).
  const anulado12 = pagoDuenoParaGuardar(anularPagoDueno(e.p12, { fecha: '2026-10-03' }), { ahora: AHORA + 60000 });
  const m12 = armarComprobante(e.entrada({ pagos: [anulado12, e.p14] }));
  assert.equal(m12.pagado.entregado, 600);
  assert.deepEqual(pieDePagado(htmlComprobante(m12)), pieOriginal);

  // (d) con el pago llegando en la lista de pagos o sin llegar: igual.
  assert.deepEqual(pieDePagado(htmlComprobante(armarComprobante(e.entrada({ pagos: [e.p12] })))), pieOriginal);

  // (e) la misma hoja entera, byte por byte, cuando no cambió nada más que el «hoy» y el pago es el mismo.
  assert.equal(
    htmlComprobante(armarComprobante(e.entrada())).replace(/\s+/g, ' '),
    htmlComprobante(armarComprobante(e.entrada({ pagos: [e.p14, e.p12] }))).replace(/\s+/g, ' '),
    'el orden en que llegan los pagos no cambia el papel',
  );
});

test('descuento: la reimpresión de un pago con descuento dañado en el modelo no sale — `descuento` no se pierde al sellar', () => {
  // El campo sobrevive a `pagoDuenoParaGuardar` (es lo que se lee de la nube): sin esto, una reimpresión
  // leería un pago sin descuento y diría que se entregaron Q1,200.
  const e = escenarioOfelia();
  const releido = pagoDuenoParaGuardar(JSON.parse(JSON.stringify(e.p14)), { ahora: AHORA + 1 });
  assert.equal(releido.descuento, 600);
  const m = armarComprobante(e.entrada({ pago: releido, pagos: [e.p12, releido] }));
  assert.equal(m.pagado.entregado, 600);
});

test('descuento: si lo descontado es todo lo que suman las rentas, el papel dice que no se entregó dinero', () => {
  // La renta 21 corregida a 0 días de atraso hoy cuesta Q1,200: se pagaron Q900 de más. La renta 22 de Q800 se paga
  // descontando los Q800 completos.
  const e = escenarioOfelia({
    corregida21: 0, nueva: rentaDeOfelia({ ...DATOS_22, costoDia: 200 }, 0), descuento: 800,
  });
  assert.equal(e.p14.monto, 800);
  assert.equal(entregadoDelPago(e.p14), 0);
  const m = armarComprobante(e.entrada());
  assert.equal(m.pagado.entregado, 0);
  const html = htmlComprobante(m);
  assert.deepEqual(pieDePagado(html), [
    ['Rentas pagadas con este comprobante', 'Q800.00'],
    ['Menos: lo que ya se le había pagado de más', '-Q800.00'],
    ['Total pagado', 'Q0.00'],
  ]);
  assert.ok(html.includes('Forma de pago: <strong>Sin entrega de dinero</strong>'), 'no «Efectivo» sobre un pago de Q0.00');
  assert.ok(!html.includes('Forma de pago: <strong>Efectivo'));
  assert.ok(notasDe(html)[0].endsWith('quedan pagadas por completo (Q800.00) y con este comprobante no se entregó dinero.'));
  assert.ok(!html.includes('lo que se entregó con este comprobante fue Q0.00'));
});

test('descuento: con el costo de la renta sin poder leerse, el pie sigue diciendo lo guardado — no depende del costo de hoy', () => {
  const e = escenarioOfelia();
  const m = armarComprobante(e.entrada({ costoSinLeer: ['ctr-o22'] }));
  assert.equal(m.pagado.filas[0].sinCosto, 'leer');
  assert.equal(m.pagado.filas[0].monto, null, 'la fila dice que falta, no Q0.00');
  assert.equal(m.pagado.cambiaron, false, 'sin cifra confiable no se compara');
  const html = htmlComprobante(m);
  assert.deepEqual(pieDePagado(html), [
    ['Rentas pagadas con este comprobante', 'Q1,200.00'],
    ['Menos: lo que ya se le había pagado de más', '-Q600.00'],
    ['Total pagado', 'Q600.00'],
  ], 'lo que se pagó ese día se sabe aunque hoy no se pueda leer lo que cuesta');
  assert.ok(html.includes('No se pudo leer el costo'));
  assert.equal(notasDe(html).length, 1, 'solo la del descuento');
});

test('un pago de antes del descuento se imprime como siempre: una sola fila «Total pagado» y sin notas nuevas', () => {
  const m = armarComprobante(entrada());
  assert.equal(m.pagado.descuento, 0);
  assert.equal(m.pagado.entregado, m.pagado.total);
  assert.equal(m.pagado.acumuladoDescuento, 0);
  const html = htmlComprobante(m);
  assert.deepEqual(pieDePagado(html), [['Total pagado', 'Q4,100.00']]);
  assert.ok(!html.includes('Menos:'));
  assert.ok(!html.includes('pagaron') || !html.includes('de más'), 'ni una palabra del descuento');
  assert.ok(!html.includes('Sin entrega de dinero'));
  assert.ok(!/comp-pie-/.test(html), 'ni las clases de la cuenta de tres renglones');
});

test('un descuento imposible no se imprime: negativo, mayor que el monto o que no es un número lanzan', () => {
  const e = escenarioOfelia();
  for (const malo of [-50, 1201, 5000, 'mucho', NaN]) {
    const pago = { ...e.p14, descuento: malo };
    assert.throws(
      () => armarComprobante(e.entrada({ pago, pagos: [e.p12, pago] })),
      { message: /descuento que no es posible/ },
      `con ${String(malo)}`,
    );
  }
  // Y lo que no está, o está en cero, es un pago sin descuento (los de antes): no lanza.
  for (const vacio of [undefined, null, '', 0]) {
    const pago = { ...e.p14, descuento: vacio };
    assert.equal(armarComprobante(e.entrada({ pago, pagos: [e.p12, pago] })).pagado.descuento, 0);
  }
  // El descuento igual al monto sí es posible (se salda todo con lo pagado de más).
  const todo = { ...e.p14, descuento: 1200 };
  assert.equal(armarComprobante(e.entrada({ pago: todo, pagos: [e.p12, todo] })).pagado.entregado, 0);
});

// ---------------------------------------------------------------------------
// El descuento y los pagos que se completan unos a otros.
//
// Un pago con descuento puede ser después el «anterior» de uno que paga una diferencia. Cada papel dice
// como «Total pagado» lo que se ENTREGÓ, así que el que lo nombra debe decir ese número y no el de las
// rentas; y la cuenta total tiene que cuadrar contra ellos: lo entregado en cada papel, más lo que ya
// estaba pagado de más, es lo que esas rentas suman.
// ---------------------------------------------------------------------------

const DATOS_25 = {
  id: 'ctr-o25', numero: 25, placas: 'P-525OOO', cliente: JUAN, costoDia: 300, dias: 4, fechaSalida: '2026-08-25', ...DE_OFELIA,
};

/**
 * La cadena: el N.° 12 y el N.° 13 pagaron de más (Q600 cada uno). El N.° 14 paga la renta 22 (Q1,200)
 * descontando Q600. Después la renta 22 sube a Q1,440 y el N.° 15 paga esos Q240 de diferencia, con el descuento
 * que se pida (`descuentoDelQuince`, de los Q600 que todavía sobran del N.° 13).
 */
function cadenaDeOfelia({ descuentoDelQuince = 0 } = {}) {
  const r21Antes = rentaDeOfelia(DATOS_21, 3);
  const r25Antes = rentaDeOfelia(DATOS_25, 3);
  const r21 = rentaDeOfelia(DATOS_21, 3, 1);
  const r25 = rentaDeOfelia(DATOS_25, 3, 1);
  const r22 = rentaDeOfelia(DATOS_22, 1);
  const pagoPrimero = (id, numero, contratos, idsMarcados) => pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd3', fecha: '2026-09-10', forma: 'efectivo', contratos, pagos: [], idsMarcados, costoSinLeer: [],
    }),
    { id, numero, ahora: AHORA },
  );
  const p12 = pagoPrimero('p12', 12, [r21Antes], ['ctr-o21']);
  const p13 = pagoPrimero('p13', 13, [r25Antes], ['ctr-o25']);
  const p14 = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd3', fecha: '2026-10-01', forma: 'efectivo', contratos: [r21, r25, r22], pagos: [p12, p13], idsMarcados: ['ctr-o22'], descuento: 600, costoSinLeer: [],
    }),
    { id: 'p14', numero: 14, ahora: AHORA },
  );
  // La renta 22 sube de 1 a 2 días de atraso: Q1,440. El cliente paga lo de más y vuelve a quedar cerrada.
  const r22Subida = rentaDeOfelia(DATOS_22, 1, 2);
  const contratos = [r21, r25, r22Subida];
  const { diferencias } = cuentaDeDueno({ contratos, pagos: [p12, p13, p14] });
  assert.equal(diferencias.length, 1, 'el escenario: la renta 22 subió y deja una diferencia');
  assert.equal(diferencias[0].diferencia, 240);
  const p15 = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd3',
      fecha: '2026-10-04',
      forma: 'transferencia',
      contratos,
      pagos: [p12, p13, p14],
      idsMarcados: [diferencias[0].clave],
      descuento: descuentoDelQuince,
      costoSinLeer: [],
    }),
    { id: 'p15', numero: 15, ahora: AHORA },
  );
  const pagos = [p12, p13, p14, p15];
  return {
    contratos, pagos, p14, p15, entrada: (extra = {}) => ({
      pago: p15, dueno: OFELIA, contratos, pagos, costoSinLeer: [], hoy: HOY, ...extra,
    }),
  };
}

test('descuento, en cadena: el pago que completa a uno con descuento nombra lo que ese papel dice entregado, y la cuenta cuadra', () => {
  const { p14, p15, entrada: entradaDe } = cadenaDeOfelia();
  assert.equal(p14.descuento, 600);
  assert.equal(p15.monto, 240);
  assert.equal('descuento' in p15, false);

  const m = armarComprobante(entradaDe());
  assert.equal(m.numero, 15);
  assert.deepEqual(m.pagado.anteriores, [{ numero: 14, monto: 600 }], 'el N.° 14 dice «Total pagado Q600.00», no Q1,200');
  assert.equal(m.pagado.acumulado, 1440, 'lo que esas rentas suman hoy');
  assert.equal(m.pagado.acumuladoDescuento, 600);
  assert.equal(m.pagado.cambiaron, false);

  const html = htmlComprobante(m);
  const [nota] = notasDe(html);
  assert.equal(
    nota,
    'Nota: este pago completa el comprobante N° 14 (Q600.00). Las rentas de esta lista cambiaron de monto después de ese pago, y esto es la diferencia. '
    + 'En total, por estas rentas se le han pagado Q1,440.00, de los cuales Q600.00 ya se le habían pagado de más antes y no se entregaron otra vez.',
  );
  // La cuenta del párrafo cuadra: lo entregado en cada papel + lo ya pagado de más = lo que suman las rentas.
  assert.equal(suma(m.pagado.anteriores[0].monto, m.pagado.entregado, m.pagado.acumuladoDescuento), m.pagado.acumulado);
  assert.deepEqual(pieDePagado(html), [['Total pagado', 'Q240.00']], 'el pago de la diferencia no tiene descuento: la fila de siempre');
});

test('descuento, en cadena: el pago de la diferencia puede llevar su propio descuento, y el papel suma los dos', () => {
  const { p15, entrada: entradaDe } = cadenaDeOfelia({ descuentoDelQuince: 100 });
  assert.equal(p15.monto, 240);
  assert.equal(p15.descuento, 100);
  const m = armarComprobante(entradaDe());
  assert.equal(m.pagado.entregado, 140);
  assert.deepEqual(m.pagado.anteriores, [{ numero: 14, monto: 600 }]);
  assert.equal(m.pagado.acumulado, 1440);
  assert.equal(m.pagado.acumuladoDescuento, 700, 'los 600 del N.° 14 y los 100 de este');
  assert.equal(suma(600, 140, 700), 1440, 'el escenario: la cuenta cuadra');

  const html = htmlComprobante(m);
  assert.deepEqual(pieDePagado(html), [
    ['Diferencia pagada con este comprobante', 'Q240.00'],
    ['Menos: lo que ya se le había pagado de más', '-Q100.00'],
    ['Total pagado', 'Q140.00'],
  ]);
  const [delDescuento, delComplemento] = notasDe(html);
  assert.equal(
    delDescuento,
    'Nota: antes se le pagaron Q100.00 de más. Esa cantidad no se entrega otra vez: se resta de este pago. '
    + 'La diferencia queda pagada por completo (Q240.00) y lo que se entregó con este comprobante fue Q140.00.',
  );
  assert.ok(delComplemento.includes('este pago completa el comprobante N° 14 (Q600.00)'));
  assert.ok(delComplemento.includes('Q1,440.00, de los cuales Q700.00 ya se le habían pagado de más antes'));
  assert.ok(!html.includes('cambiaron después del pago'), 'la nota de «complementa», no la de «cambiaron»');
});

test('descuento, en cadena: el N.° 14 reimpreso después del N.° 15 sigue diciendo lo suyo, y no nombra al que vino después', () => {
  const { p14, entrada: entradaDe } = cadenaDeOfelia({ descuentoDelQuince: 100 });
  const m = armarComprobante(entradaDe({ pago: p14 }));
  assert.equal(m.numero, 14);
  assert.equal(m.pagado.total, 1200);
  assert.equal(m.pagado.descuento, 600);
  assert.equal(m.pagado.entregado, 600);
  assert.deepEqual(m.pagado.anteriores, [], 'es el primero de su cadena');
  assert.equal(m.pagado.acumuladoDescuento, 600, 'solo lo suyo, no el descuento de un pago que vino después');
  assert.deepEqual(pieDePagado(htmlComprobante(m)), [
    ['Rentas pagadas con este comprobante', 'Q1,200.00'],
    ['Menos: lo que ya se le había pagado de más', '-Q600.00'],
    ['Total pagado', 'Q600.00'],
  ]);
});

// ---------------------------------------------------------------------------
// LO QUE EL DUEÑO NO VE, ahora con un pago con descuento.
//
// El descuento agrega cifras al papel (lo ya pagado de más y lo entregado). Son del dueño del carro, pero el
// papel que las explica no puede arrastrar nada que no lo sea. Se vuelven a buscar TODAS las cifras y
// palabras prohibidas sobre este escenario, donde la renta pagada es el contrato con margen de verdad.
// ---------------------------------------------------------------------------

/** Todo lo que el papel de este escenario dice a propósito (lo suyo), para no confundirlo con una fuga. */
function permitidosDelDescuento(m) {
  return new Set([
    ...numerosPermitidos(m),
    m.pagado.descuento, m.pagado.entregado, m.pagado.acumulado, m.pagado.acumuladoDescuento,
    ...m.pagado.anteriores.map((a) => a.monto),
  ].filter(Number.isFinite));
}

test('descuento, lo prohibido: el escenario de verdad tiene margen, y las cifras del descuento no chocan con ninguna', () => {
  const e = escenarioOfelia();
  const m = armarComprobante(e.entrada());
  const { numeros } = numerosProhibidosDe(e.nueva22);
  assert.ok(comisionDe(e.nueva22).monto > 0, 'la renta pagada tiene comisión');
  assert.ok(numeros.length >= 10, `hay muchos números prohibidos que buscar (${numeros.length})`);
  const permitidos = permitidosDelDescuento(m);
  for (const c of [e.nueva22, e.pendiente, e.ahora21]) {
    const chocan = numerosProhibidosDe(c).numeros.filter((n) => permitidos.has(n));
    // La renta pendiente es del tipo sencillo (precio por día de Q700): su Q700 no es del dueño pero
    // tampoco sale en el papel; lo que no puede pasar es que una cifra del descuento sea una del negocio.
    assert.ok(![600, 1200].some((n) => chocan.includes(n)), `${c.id}: Q600 o Q1,200 no pueden ser también una cifra del negocio`);
  }
});

test('descuento, lo prohibido: ninguna cifra, texto ni palabra del negocio de Best Price sale en el papel con descuento', () => {
  const e = escenarioOfelia();
  const modelo = armarComprobante(e.entrada());
  const html = htmlComprobante(modelo);
  const contenedor = { innerHTML: '', querySelector: () => null, addEventListener() {} };
  pintarComprobante(contenedor, e.entrada());
  const salidas = [['el HTML', html], ['lo que queda en pantalla', contenedor.innerHTML], ['el modelo', JSON.stringify(modelo)]];
  // La pantalla con el cambio de las rentas (el aviso al dueño del negocio también cuenta como salida).
  const corregida = rentaDeOfelia(DATOS_22, 1, 0);
  const cambiado = escenarioOfelia({ nueva: rentaDeOfelia(DATOS_22, 1) });
  const contenedor2 = { innerHTML: '', querySelector: () => null, addEventListener() {} };
  pintarComprobante(contenedor2, cambiado.entrada({ contratos: cambiado.contratos.map((c) => (c.id === 'ctr-o22' ? corregida : c)) }));
  salidas.push(['la pantalla con el aviso de cambio', contenedor2.innerHTML]);

  const permitidos = permitidosDelDescuento(modelo);
  const prohibidos = new Set();
  const porcentajes = new Set();
  for (const c of [e.nueva22, e.pendiente, e.ahora21, rentaDeOfelia(DATOS_21, 3)]) {
    const r = numerosProhibidosDe(c);
    r.numeros.forEach((n) => prohibidos.add(n));
    r.porcentajes.forEach((p) => porcentajes.add(p));
  }
  const buscar = [...prohibidos].filter((n) => !permitidos.has(n));
  assert.ok(buscar.length >= 12, `se buscan muchas cifras (${buscar.length})`);
  const margen = resumen(e.nueva22);
  for (const n of [850, 3400, 3621, 221, margen.pagado, margen.utilidad, comisionDe(e.nueva22).monto, 275, 125, 4321]) {
    assert.ok(buscar.includes(n), `${n} (del contrato con margen) tiene que estar entre lo que se busca`);
  }
  for (const [donde, texto] of salidas) {
    for (const n of buscar) {
      assert.deepEqual(encontrados(texto, formasDe(n)), [], `${donde} lleva ${dinero(n)}, una cifra del negocio de Best Price`);
    }
    for (const p of porcentajes) assert.deepEqual(encontrados(texto, formasDePorcentaje(p)), [], `${donde} lleva el ${p} %`);
    assert.deepEqual(encontrados(texto, TEXTOS_PROHIBIDOS), [], `${donde} lleva un dato del mostrador`);
    // Las palabras se buscan en lo que se LEE (el papel y la pantalla), no en el nombre de las llaves del modelo:
    // `descuento` es el campo del pago (§7b) y no se imprime.
    if (donde === 'el modelo') continue;
    for (const palabra of PALABRAS_PROHIBIDAS) assert.ok(!palabra.test(texto), `${donde} dice ${palabra}`);
  }
  // La explicación del descuento no nombra nada más que lo del dueño: ni el otro comprobante, ni sus rentas, ni sus clientes.
  for (const x of ['P-212OOO', 'Rosa Díaz', 'N° 12', dinero(2100), dinero(1500), dinero(900)]) {
    assert.ok(!html.includes(x), `el papel del N.° 14 lleva «${x}», de otro comprobante`);
  }
  for (const c of e.contratos) assert.ok(!html.includes(c.id) && !contenedor.innerHTML.includes(c.id), `lleva el id ${c.id}`);
});

test('descuento, lo prohibido: el modelo con descuento tiene las mismas llaves permitidas que el de siempre, y nada de más se cuela', () => {
  const llaves = (valor, ruta = '') => {
    if (Array.isArray(valor)) return valor.flatMap((v) => llaves(v, `${ruta}[]`));
    if (valor && typeof valor === 'object') {
      return Object.entries(valor).flatMap(([k, v]) => [`${ruta}.${k}`, ...llaves(v, `${ruta}.${k}`)]);
    }
    return [];
  };
  const unicas = (modelo) => [...new Set(llaves(modelo))].sort();
  const e = escenarioOfelia();
  assert.deepEqual(unicas(armarComprobante(e.entrada())), unicas(armarComprobante(entrada())),
    'con descuento y sin él, el modelo trae exactamente las mismas llaves (la lista blanca de arriba)');

  // Un pago, un contrato o un dueño con campos de más NO los arrastra al papel, tampoco con descuento.
  const rico = { ...e.nueva22, utilidadExtra: 424242.42, margenSecreto: 'MARGEN-SECRETO' };
  const pagoRico = {
    ...e.p14, comisionTotal: 535353.53, utilidad: 646464.64, descuentoDelCliente: 767676.76,
  };
  const { modelo, html } = (() => {
    const m = armarComprobante(e.entrada({
      pago: pagoRico, pagos: [e.p12, pagoRico], dueno: { ...OFELIA, saldoFavor: 757575.75 },
      contratos: e.contratos.map((c) => (c.id === 'ctr-o22' ? rico : c)),
    }));
    return { modelo: JSON.stringify(m), html: htmlComprobante(m) };
  })();
  for (const x of ['424242', 'MARGEN-SECRETO', '535353', '646464', '767676', '757575']) {
    assert.ok(!html.includes(x) && !modelo.includes(x), `se coló ${x}`);
  }
});

// ---------------------------------------------------------------------------
// El cableado: el papel le pregunta al núcleo, no suma ni resta.
// ---------------------------------------------------------------------------

test('comprobante.js no suma ni resta dinero por su cuenta: el descuento y lo entregado vienen del núcleo', () => {
  const codigo = readFileSync(new URL('../js/pantallas/comprobante.js', import.meta.url), 'utf8')
    .replace(/\/\*[^]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');
  assert.doesNotMatch(codigo, /\bsuma\s*\(/, 'no suma montos');
  assert.doesNotMatch(codigo, /import[^;]*\bsuma\b[^;]*from/, 'ni siquiera importa `suma`');
  // Ninguna resta entre cifras del pago: ni `monto - descuento` ni `total - algo`.
  // (con espacios alrededor del signo: «comp-pie-total» es una clase, no una resta)
  assert.doesNotMatch(codigo, /\b(monto|total|descuento|entregado|pagado|acumulado)\s+-\s+[\w(.]/, 'no resta cifras');
  assert.doesNotMatch(codigo, /[\w)]\s+-\s+(pago\.)?(monto|descuento|total|entregado)\b/, 'ni restándoles');
  for (const llamada of ['descuentoDelPago(pago)', 'entregadoDelPago(pago)', 'totalesDePagos(', 'descuentoInvalido(pago)']) {
    assert.ok(codigo.includes(llamada), `le pregunta al núcleo: ${llamada}`);
  }
  // Y la pregunta de «¿cambiaron las rentas?» sigue siendo contra el `monto`, nunca contra lo entregado.
  assert.match(codigo, /totalSeleccionado\(delPago, delPago\.map\(\(c\) => c\.id\)\) !== q\(pago\.monto\)/);
});

test('estilos.css: el pie de tres renglones tiene su forma, y al imprimir la cuenta no se parte de su total', () => {
  const css = readFileSync(new URL('../css/estilos.css', import.meta.url), 'utf8');
  // Sin comentarios: una regla comentada no es una regla. Cada renglón tiene que tener un bloque con declaraciones.
  const reglas = css.replace(/\/\*[^]*?\*\//g, '');
  for (const clase of ['.comp-pie-suma', '.comp-pie-menos', '.comp-pie-total']) {
    assert.match(reglas, new RegExp(`\\${clase}[^{}]*{[^}]*:[^}]*}`), `falta la regla de ${clase}`);
  }
  assert.match(reglas, /\.comp-pie-total td\s*{[^}]*border-top/, 'el total lleva su raya');
  assert.match(reglas, /\.comp-pie-suma td[^{}]*{[^}]*font-weight:\s*400/, 'los dos renglones de cuenta no van en negrita');
  const impresion = css.slice(css.indexOf('@media print'));
  assert.match(impresion, /\.comp-pie-suma,\s*\.comp-pie-menos\s*{[^}]*break-after:\s*avoid/, 'los dos renglones de arriba no se separan del total');
  // Las clases que usa el HTML son las que el CSS conoce (ni un renglón sin estilo ni un estilo sin renglón).
  const html = htmlComprobante(armarComprobante(escenarioOfelia().entrada()));
  const usadas = [...html.matchAll(/class="(comp-pie-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(usadas, ['comp-pie-suma', 'comp-pie-menos', 'comp-pie-total']);
});
