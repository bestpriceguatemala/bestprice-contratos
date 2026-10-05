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
import { cuentaDeDueno } from '../js/nucleo/liquidacion.js';
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
  construirPagoDueno, pagoDuenoParaGuardar,
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
  id, numero, placas, cliente, costoDia, fechaSalida,
}) {
  const sinCierre = construirContrato({
    id,
    numero,
    cliente,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas, tipo: 'Pickup', marca: 'Toyota', color: 'Blanco', modelo: '2021', dueno: 'Mario López Estrada', costoDia,
    },
    duenoId: 'd1',
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
    '.pendiente', '.pendiente.filas', '.pendiente.total', '.pendiente.incompleto',
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
  assert.equal(MEMBRETE.nombre, 'Best Price Rent a Car');
  const html = htmlComprobante(armarComprobante(entrada()));
  assert.ok(!/<img|url\(|<svg/i.test(html));
  assert.ok(html.includes(MEMBRETE.nombre));
});
