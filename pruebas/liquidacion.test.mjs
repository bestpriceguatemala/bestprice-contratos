// Pruebas de lo que se le debe a cada dueño de carro subarrendado.
//
// La pregunta del dueño es «¿cuánto le debo a Fulano?». Un error aquí no se ve
// como un error: se ve como una cifra menor de lo que de verdad debe, y él
// cree estar a mano con alguien a quien todavía le debe. Por eso las pruebas
// exigen montos exactos, y por eso hay una prueba de que ningún contrato ajeno
// desaparece de la vista, esté enlazado a un dueño o no.
//
// Los contratos de estas pruebas NO están inventados: se arman con las mismas
// funciones que arman los reales — `construirContrato` (Sacar carro),
// `construirCierre` (Recibir carro), `agregarPago` (cobrar el saldo) y
// `contratoParaGuardar` (lo que de verdad se escribe en Firestore) —, así que
// llevan exactamente los campos de §7b y ninguno que no exista. Una suite que
// arma sus propios datos con campos inventados solo se está comprobando a sí
// misma (la cuarta vez que este proyecto lo sufrió fueron 259 pruebas).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  costoDelSubarriendo, esPagableAlDueno, cuentaDeDueno, agruparPorDueno, totalSeleccionado,
} from '../js/nucleo/liquidacion.js';
import { estadoContrato } from '../js/nucleo/estados.js';
import { resumen } from '../js/nucleo/contrato.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { agregarPago, anularPago, contratoParaGuardar } from '../js/datos.js';

const AHORA = 1790000000000;
const CLIENTE = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };
const TARJETA = {
  ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000,
};

// ---------------------------------------------------------------------------
// Los contratos de prueba, en las tres etapas de su vida.
// ---------------------------------------------------------------------------

/**
 * Un contrato de carro ajeno recién salido, tal como lo deja "Sacar carro".
 * La renta al cliente se cobra completa en efectivo (dias × Q700), así que el
 * saldo queda en cero. Con `garantia`, además hay una tarjeta autorizada que
 * queda bloqueada hasta que se libere.
 */
function salida({
  id, numero = 1, dueno = 'Don Mario', costoDia = 300, dias = 4, fechaSalida = '2026-09-01', garantia = false,
} = {}) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas: 'P-1AJN', tipo: 'Pickup', marca: 'Ford', color: 'Rojo', modelo: '2019', dueno, costoDia,
    },
    fechaSalida,
    dias,
    precioDia: 700,
    tarjetas: garantia ? [TARJETA] : [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: dias * 700,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

/** Un carro propio, sin dueño a quien pagarle. */
function propio({ id, numero = 90 }) {
  return construirContrato({
    id,
    numero,
    cliente: CLIENTE,
    ajeno: false,
    carro: { id: 'v1', placas: 'P-999TST', marca: 'Toyota', linea: 'Corolla' },
    fechaSalida: '2026-09-01',
    dias: 4,
    precioDia: 700,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 2800,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

/**
 * El carro regresó (Recibir carro), con `atraso` días después de la fecha
 * prevista. La fecha real sale de la prevista del propio contrato, así los días
 * de atraso son exactamente los que se piden y no dependen de cuántos días duró
 * la renta.
 */
function recibido(c, atraso = 0) {
  return construirCierre(c, {
    fechaReal: sumarDias(c.devolucionPrevista, atraso),
    horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 0, combustible: 0, danos: 0, varios: 0, descuento: 0,
  });
}

/** El cliente termina de pagar lo que falte y se le suelta la garantía, si la había. */
function saldado(c) {
  const conPago = agregarPago(c, {
    monto: resumen(c).saldo, forma: 'efectivo', porcentajeTarjeta: 0, fecha: c.cierre.fechaReal,
  });
  return c.garantiaMonto > 0 ? { ...conPago, garantiaLiberada: true, garantiaLiberadaEn: c.cierre.fechaReal } : conPago;
}

/** Lo que de verdad queda escrito: con `id`, `numero`, `actualizado` y `estado` sellados. */
const guardado = (c) => contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA });

/** Cerrado, sin atraso: 4 días × Q300 = Q1,200. */
function cerrado(id, opciones = {}) {
  return guardado(saldado(recibido(salida({ id, ...opciones }))));
}
/** Cerrado con 2 días de atraso: (4 + 2) días × Q300 = Q1,800. */
function cerradoConAtraso(id, opciones = {}) {
  return guardado(saldado(recibido(salida({ id, ...opciones }), 2)));
}
/** El carro ya volvió pero el cliente todavía debe los 2 días de atraso. */
function devueltoConSaldo(id, opciones = {}) {
  return guardado(recibido(salida({ id, ...opciones }), 2));
}
/** Pagó todo, pero la garantía de la tarjeta sigue bloqueada. */
function devueltoConGarantia(id, opciones = {}) {
  return guardado(recibido(salida({ id, garantia: true, ...opciones })));
}
/** El carro todavía anda afuera. */
function afuera(id, opciones = {}) {
  return guardado(salida({ id, ...opciones }));
}
/** Con dueño de la lista: `duenoId` va junto a `carroAjeno`, en la raíz del contrato. */
const enlazado = (c, duenoId) => ({ ...c, duenoId });

// ---------------------------------------------------------------------------
// Contratos con el `estado` GUARDADO desactualizado.
//
// `contratoParaGuardar` sella `estado` en cada escritura, así que todos los
// contratos de arriba traen un sello que coincide con lo que dice
// estadoContrato(). Con solo esos, una función que leyera `c.estado` en vez de
// preguntarle a estadoContrato() pasaría todas las pruebas, y es la regresión
// que de verdad cuesta dinero: un sello 'cerrado' viejo le haría pagar a un
// dueño una renta cuyo cliente todavía no termina de pagar. Aquí el sello y la
// realidad se contradicen, y la realidad es la que manda.
// ---------------------------------------------------------------------------

/**
 * Sellado 'cerrado'. Después se anuló el pago del atraso (Q1,400): `anularPago`
 * no vuelve a sellar, así que el contrato dice 'cerrado' pero el cliente debe.
 * Es la forma real en que ocurre, sin tocar el sello a mano.
 */
const cerradoPeroSeAnuloUnPago = (id, opciones = {}) => anularPago(
  cerradoConAtraso(id, opciones), 1, { fecha: '2026-09-20' },
);
/**
 * Sellado 'cerrado' con la garantía todavía bloqueada. Ninguna función real
 * deshace una liberación, así que este es el único lugar donde el sello se
 * escribe a mano — y solo el sello: lo demás es el contrato real devuelto.
 */
const cerradoPeroGarantiaBloqueada = (id, opciones = {}) => ({ ...devueltoConGarantia(id, opciones), estado: 'cerrado' });
/**
 * Sellado 'devuelto' al regresar el carro; el cliente pagó el atraso después y
 * nadie volvió a sellar. Realmente ya está cerrado.
 */
const devueltoPeroYaSaldado = (id, opciones = {}) => saldado(devueltoConSaldo(id, opciones));
/**
 * Con el sello 'rentado' que dejaba "Sacar carro" y que nada volvió a tocar
 * (los contratos de antes de `contratoParaGuardar`). Ya regresó y ya pagó:
 * realmente está cerrado.
 */
const rentadoPeroYaCerrado = (id, opciones = {}) => saldado(recibido(salida({ id, ...opciones })));

/** Un pago a un dueño, con los campos de `pagosDueno` (§7 del diseño de liquidación). */
function pagoADueno({
  id, duenoId, contratos, monto, numero = 1, fecha = '2026-09-20', forma = 'transferencia',
}) {
  return {
    id, duenoId, fecha, forma, monto, contratos, numero, actualizado: AHORA,
  };
}

const ids = (lista) => lista.map((c) => c.id);

// ---------------------------------------------------------------------------
// Que los contratos de prueba sean lo que dicen ser.
// ---------------------------------------------------------------------------

test('los contratos de prueba están en el estado que dicen estar, según el sistema', () => {
  assert.equal(estadoContrato(afuera('a')), 'rentado');
  assert.equal(estadoContrato(devueltoConSaldo('b')), 'devuelto');
  assert.equal(estadoContrato(devueltoConGarantia('c')), 'devuelto');
  assert.equal(estadoContrato(cerrado('d')), 'cerrado');
  assert.equal(estadoContrato(cerradoConAtraso('e')), 'cerrado');
  assert.equal(cerrado('d').estado, 'cerrado', 'el campo guardado también dice cerrado');
});

test('los contratos de sello desactualizado de verdad contradicen a estadoContrato', () => {
  // Si alguno de estos coincidiera con su sello, las pruebas de abajo no
  // probarían nada: serían las de siempre con otro nombre.
  const anulado = cerradoPeroSeAnuloUnPago('a');
  assert.equal(anulado.estado, 'cerrado');
  assert.equal(estadoContrato(anulado), 'devuelto');
  assert.equal(resumen(anulado).saldo, 1400, 'por eso: debe el atraso otra vez');

  const garantia = cerradoPeroGarantiaBloqueada('b');
  assert.equal(garantia.estado, 'cerrado');
  assert.equal(estadoContrato(garantia), 'devuelto');
  assert.equal(resumen(garantia).saldo, 0, 'no debe nada; es la tarjeta bloqueada lo que lo mantiene abierto');

  const devuelto = devueltoPeroYaSaldado('c');
  assert.equal(devuelto.estado, 'devuelto');
  assert.equal(estadoContrato(devuelto), 'cerrado');

  const rentado = rentadoPeroYaCerrado('d');
  assert.equal(rentado.estado, 'rentado');
  assert.equal(estadoContrato(rentado), 'cerrado');
});

// ---------------------------------------------------------------------------
// costoDelSubarriendo
// ---------------------------------------------------------------------------

test('costoDelSubarriendo: 4 días a Q300 son Q1,200.00', () => {
  assert.equal(costoDelSubarriendo(cerrado('c1')), 1200);
});

test('costoDelSubarriendo: los 2 días de atraso también se le pagan al dueño, Q1,800.00', () => {
  assert.equal(costoDelSubarriendo(cerradoConAtraso('c1')), 1800);
});

test('costoDelSubarriendo: un contrato sin subarriendo (carro propio) cuesta 0', () => {
  const c = guardado(recibido(propio({ id: 'propio1' })));
  assert.equal(c.subarriendo, null, 'así queda guardado un carro propio');
  assert.equal(costoDelSubarriendo(c), 0);
});

test('costoDelSubarriendo: con costoDia en 0 el costo es 0', () => {
  assert.equal(costoDelSubarriendo(cerrado('c1', { costoDia: 0 })), 0);
});

test('costoDelSubarriendo: el costo nunca sale negativo', () => {
  assert.equal(costoDelSubarriendo(cerrado('c1', { costoDia: -300 })), 0);
});

test('costoDelSubarriendo: pasa por q(), no arrastra el error de los decimales', () => {
  // 0.1 × 3 en la computadora da 0.30000000000000004.
  assert.equal(costoDelSubarriendo(cerrado('c1', { costoDia: 0.1, dias: 3 })), 0.3);
  assert.equal(costoDelSubarriendo(cerrado('c2', { costoDia: 333.33, dias: 3 })), 999.99);
});

test('costoDelSubarriendo: da lo mismo que el costo que resumen() usa para la utilidad', () => {
  // La fórmula es una sola. Si esta prueba se rompe es que alguien la copió
  // en un segundo lugar y ya no coinciden.
  for (const c of [cerrado('c1'), cerradoConAtraso('c2'), afuera('c3'), guardado(recibido(propio({ id: 'propio1' })))]) {
    assert.equal(costoDelSubarriendo(c), resumen(c).costoSubarriendo);
  }
});

// ---------------------------------------------------------------------------
// esPagableAlDueno
// ---------------------------------------------------------------------------

test('esPagableAlDueno: un contrato ajeno cerrado sí se le paga al dueño', () => {
  assert.equal(esPagableAlDueno(cerrado('c1')), true);
  assert.equal(esPagableAlDueno(cerradoConAtraso('c2')), true);
});

test('esPagableAlDueno: uno ajeno devuelto con saldo pendiente no', () => {
  assert.equal(esPagableAlDueno(devueltoConSaldo('c1')), false);
});

test('esPagableAlDueno: uno ajeno devuelto con la garantía sin liberar no', () => {
  // Saldo en cero, pero la tarjeta sigue bloqueada: "cerrado" exige las dos
  // cosas, y esta función se lo pregunta a estadoContrato en vez de decidirlo.
  const c = devueltoConGarantia('c1');
  assert.equal(resumen(c).saldo, 0);
  assert.equal(esPagableAlDueno(c), false);
});

test('esPagableAlDueno: uno ajeno todavía afuera no', () => {
  assert.equal(esPagableAlDueno(afuera('c1')), false);
});

test('esPagableAlDueno: un contrato de carro propio, aunque esté cerrado, no', () => {
  const c = guardado(saldado(recibido(propio({ id: 'propio1' }))));
  assert.equal(estadoContrato(c), 'cerrado');
  assert.equal(esPagableAlDueno(c), false);
});

test('esPagableAlDueno: un sello "cerrado" viejo no basta: manda estadoContrato(), no el campo guardado', () => {
  // Le dice al dueño del negocio «ya cerró, págale» cuando su cliente todavía
  // debe, o cuando la garantía sigue bloqueada. Solo preguntándole a
  // estadoContrato() se evita.
  assert.equal(esPagableAlDueno(cerradoPeroSeAnuloUnPago('c1')), false, 'se anuló un pago: debe Q1,400');
  assert.equal(esPagableAlDueno(cerradoPeroGarantiaBloqueada('c2')), false, 'la garantía sigue bloqueada');
});

test('esPagableAlDueno: al revés, un sello "devuelto" o "rentado" viejo no esconde un contrato que ya cerró', () => {
  assert.equal(esPagableAlDueno(devueltoPeroYaSaldado('c1')), true, 'pagó el atraso después del sello');
  assert.equal(esPagableAlDueno(rentadoPeroYaCerrado('c2')), true, 'sello de antes de contratoParaGuardar');
});

// ---------------------------------------------------------------------------
// cuentaDeDueno
// ---------------------------------------------------------------------------

test('cuentaDeDueno: separa por pagar, aún no cierra y pagados; el total suma solo lo por pagar', () => {
  const contratos = [
    cerrado('c1'), // Q1,200 por pagar
    cerradoConAtraso('c2'), // Q1,800 por pagar
    devueltoConSaldo('c3'), // aún no cierra: debe el atraso
    devueltoConGarantia('c4'), // aún no cierra: garantía bloqueada
    afuera('c5'), // aún no cierra: todavía afuera
    cerrado('c6'), // cerrado y ya cubierto por un pago
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c6'], monto: 1200 })];

  const cuenta = cuentaDeDueno({ contratos, pagos });

  assert.deepEqual(ids(cuenta.porPagar), ['c1', 'c2']);
  assert.deepEqual(ids(cuenta.aunNoCierra), ['c3', 'c4', 'c5']);
  assert.deepEqual(ids(cuenta.pagados), ['c6']);
  assert.equal(cuenta.totalPorPagar, 3000, 'Q1,200 + Q1,800; ni lo que aún no cierra ni lo ya pagado');
});

test('cuentaDeDueno: un contrato cubierto por un pago cae en pagados y no vuelve a sumar', () => {
  const contratos = [cerrado('c1'), cerrado('c2')];
  const sinPagos = cuentaDeDueno({ contratos, pagos: [] });
  assert.equal(sinPagos.totalPorPagar, 2400);

  const conPago = cuentaDeDueno({
    contratos,
    pagos: [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })],
  });
  assert.deepEqual(ids(conPago.pagados), ['c1']);
  assert.deepEqual(ids(conPago.porPagar), ['c2']);
  assert.equal(conPago.totalPorPagar, 1200, 'solo queda lo de c2');
});

test('cuentaDeDueno: un pago que cubre varias rentas las saca todas de lo pendiente', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2'), cerrado('c3')];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1', 'c2'], monto: 3000 })];
  const cuenta = cuentaDeDueno({ contratos, pagos });
  assert.deepEqual(ids(cuenta.pagados), ['c1', 'c2']);
  assert.deepEqual(ids(cuenta.porPagar), ['c3']);
  assert.equal(cuenta.totalPorPagar, 1200);
});

test('cuentaDeDueno: sin contratos y con una lista de pagos vacía todo queda en cero, no falla', () => {
  assert.deepEqual(cuentaDeDueno({ contratos: [], pagos: [] }), {
    porPagar: [], aunNoCierra: [], pagados: [], totalPorPagar: 0, sinCostoAnotado: [],
  });
});

// «Vacío» y «falló» no son lo mismo. Este sistema ya pintó una lectura fallida
// de la nube como «todos los carros disponibles» y estuvo a punto de rentar un
// carro que ya no estaba. Aquí es igual: si `pagos` no llegó (la lectura de
// `pagosDueno` falló, o falta la credencial del dinero) y se leyera como
// «nadie ha cobrado», cada contrato ya pagado reaparecería como deuda y el
// dueño del negocio le volvería a pagar a quien ya le pagó. Una función del
// núcleo no puede saber si la lectura falló, así que NO adivina: lanza. Un
// error fuerte se ve y se arregla; una deuda inflada en silencio se paga. La
// pantalla ya recibe `{datos, fallo}` y debe pintar la barra roja sin llamar
// aquí; si llamara con datos fallidos, esto es lo que la delata.
test('cuentaDeDueno: si la lista de pagos no llegó, lanza en vez de suponer que nada está pagado', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2')]; // Q1,200 + Q1,800
  const cobrado = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })];

  // Bien leído: c1 ya se pagó y solo se le debe c2.
  assert.equal(cuentaDeDueno({ contratos, pagos: cobrado }).totalPorPagar, 1800);

  // Mal leído: antes decía Q3,000, y a c1 se le pagaba dos veces.
  for (const pagos of [undefined, null, {}, 'p1', 42]) {
    assert.throws(
      () => cuentaDeDueno({ contratos, pagos }),
      { name: 'TypeError', message: /pagos/ },
      `pagos = ${JSON.stringify(pagos)} no es una lista`,
    );
  }
  assert.throws(() => cuentaDeDueno({ contratos }), { name: 'TypeError', message: /pagos/ }, 'ni omitido');
  assert.throws(() => cuentaDeDueno(), { name: 'TypeError', message: /pagos/ }, 'ni sin argumentos');
});

// La otra mitad de lo mismo, y la que más hay que cuidar. Si `contratos` no
// llegó (la lectura de contratos falló) y se leyera como «no hay ninguno», la
// pantalla diría «no le debes nada a nadie». Una deuda inflada hace que él se
// detenga y revise, porque más o menos sabe cuánto debe; «estás a mano con
// todos» es una buena noticia, y las buenas noticias nadie las audita. Cerraría
// la pantalla tranquilo y un dueño se quedaría sin su pago un mes. Por eso
// tampoco aquí se adivina: se lanza. Quien algún día quiera «arreglar» esto con
// un `[]` amable estaría volviendo a poner el silencio donde más cuesta.
test('cuentaDeDueno: si la lista de contratos no llegó, lanza en vez de decir que no se le debe nada', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2')]; // Q1,200 + Q1,800

  // Bien leído: se le deben Q3,000.
  assert.equal(cuentaDeDueno({ contratos, pagos: [] }).totalPorPagar, 3000);

  // Mal leído: antes decía Q0.00 con toda confianza.
  for (const mala of [undefined, null, {}, 'c1', 42]) {
    assert.throws(
      () => cuentaDeDueno({ contratos: mala, pagos: [] }),
      { name: 'TypeError', message: /«contratos» debe ser una lista/ },
      `contratos = ${JSON.stringify(mala)} no es una lista`,
    );
  }
  assert.throws(() => cuentaDeDueno({ pagos: [] }), { name: 'TypeError', message: /«contratos» debe ser una lista/ }, 'ni omitido');
});

test('cuentaDeDueno: un pago cuyo `contratos` no es una lista también lanza', () => {
  // Lo mismo un nivel más adentro: un pago al que le falta la lista de rentas
  // que cubre no dice «no cubre ninguna», dice que el dato está dañado.
  const contratos = [cerrado('c1')];
  const sano = pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 });
  for (const cubre of [undefined, null, 'c1', {}, 7]) {
    assert.throws(
      () => cuentaDeDueno({ contratos, pagos: [{ ...sano, contratos: cubre }] }),
      { name: 'TypeError', message: /contratos/ },
      `pago.contratos = ${JSON.stringify(cubre)} no es una lista`,
    );
  }
  assert.throws(() => cuentaDeDueno({ contratos, pagos: [sano, null] }), { name: 'TypeError', message: /contratos/ }, 'un pago que ni objeto es');
  // Y una lista vacía de rentas sí es válida: un pago que no cubre ninguna.
  assert.equal(cuentaDeDueno({ contratos, pagos: [{ ...sano, contratos: [] }] }).totalPorPagar, 1200);
});

test('cuentaDeDueno: lo guardado en `estado` no cuenta: un sello viejo no mete ni saca contratos de lo por pagar', () => {
  const contratos = [
    cerrado('c1'), // 1,200 por pagar
    cerradoPeroSeAnuloUnPago('c2'), // sello «cerrado», pero debe Q1,400: aún no cierra
    cerradoPeroGarantiaBloqueada('c3'), // sello «cerrado», pero la garantía sigue bloqueada: aún no cierra
    devueltoPeroYaSaldado('c4'), // sello «devuelto», pero ya cerró: 4 + 2 días × Q300 = 1,800
    rentadoPeroYaCerrado('c5', { costoDia: 250 }), // sello «rentado», pero ya cerró: 4 × 250 = 1,000
  ];
  const cuenta = cuentaDeDueno({ contratos, pagos: [] });
  assert.deepEqual(ids(cuenta.porPagar), ['c1', 'c4', 'c5']);
  assert.deepEqual(ids(cuenta.aunNoCierra), ['c2', 'c3']);
  assert.equal(cuenta.totalPorPagar, 4000, 'Q1,200 + Q1,800 + Q1,000');
});

test('cuentaDeDueno: un contrato cerrado sin costo por día anotado se marca, no se disfraza de un Q0.00 cualquiera', () => {
  // El campo de costo no es obligatorio: vacío queda en 0 y la fila diría
  // «Q0.00», igual que un costo de verdad en cero. Se avisa para que la
  // pantalla diga «sin costo anotado» y él no marque como pagado un contrato
  // por nada ni crea que no se le debe.
  const cuenta = cuentaDeDueno({ contratos: [cerrado('c1'), cerrado('c2', { costoDia: 0 })], pagos: [] });
  assert.deepEqual(ids(cuenta.porPagar), ['c1', 'c2'], 'sigue a la vista: no se esconde');
  assert.equal(cuenta.totalPorPagar, 1200, 'y no cambia ni un centavo del total');
  assert.deepEqual(cuenta.sinCostoAnotado, ['c2']);
});

test('cuentaDeDueno: sinCostoAnotado cubre las tres listas, en el orden en que llegaron, y no marca a quien sí tiene costo', () => {
  const contratos = [
    cerrado('c1', { costoDia: 0 }), // por pagar
    cerrado('c2'), // por pagar, con costo
    devueltoConSaldo('c3', { costoDia: 0 }), // aún no cierra
    afuera('c4', { costoDia: 0 }), // aún no cierra
    cerrado('c5', { costoDia: 0 }), // ya pagado
    guardado(saldado(recibido(propio({ id: 'propio1' })))), // propio: ni entra a la cuenta
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c5'], monto: 0 })];
  const cuenta = cuentaDeDueno({ contratos, pagos });
  assert.deepEqual(cuenta.sinCostoAnotado, ['c1', 'c3', 'c4', 'c5']);
  assert.deepEqual(cuentaDeDueno({ contratos: [cerrado('c2')], pagos: [] }).sinCostoAnotado, []);
});

test('cuentaDeDueno: un contrato de carro propio que se cuele no aparece en la cuenta de nadie', () => {
  const c = guardado(saldado(recibido(propio({ id: 'propio1' }))));
  const cuenta = cuentaDeDueno({ contratos: [c, cerrado('c1')], pagos: [] });
  assert.deepEqual(ids(cuenta.porPagar), ['c1']);
  assert.deepEqual(cuenta.aunNoCierra, []);
  assert.deepEqual(cuenta.pagados, []);
});

test('cuentaDeDueno: el total pasa por q() con montos de centavos', () => {
  const contratos = [
    cerrado('c1', { costoDia: 0.1, dias: 3 }), // 0.3
    cerrado('c2', { costoDia: 0.2, dias: 3 }), // 0.6 — y 0.3 + 0.6 en la computadora da 0.8999999999999999
  ];
  assert.equal(cuentaDeDueno({ contratos, pagos: [] }).totalPorPagar, 0.9);
});

// ---------------------------------------------------------------------------
// totalSeleccionado
// ---------------------------------------------------------------------------

test('totalSeleccionado: con ningún id marcado da 0', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2')];
  assert.equal(totalSeleccionado(contratos, []), 0);
  assert.equal(totalSeleccionado(contratos, new Set()), 0);
  assert.equal(totalSeleccionado(contratos, undefined), 0);
});

test('totalSeleccionado: con dos marcados da la suma exacta de esos dos, no de todos', () => {
  const contratos = [cerrado('c1'), cerradoConAtraso('c2'), cerrado('c3', { costoDia: 250 })];
  // Q1,200 + Q1,800 = Q3,000; el tercero (Q1,000) queda sin marcar.
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2']), 3000);
  assert.equal(totalSeleccionado(contratos, new Set(['c2', 'c3'])), 2800, 'también acepta un Set');
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2', 'c3']), 4000);
});

test('totalSeleccionado: suma centavos sin arrastrar el error de la computadora', () => {
  const contratos = [
    cerrado('c1', { costoDia: 0.1, dias: 3 }),
    cerrado('c2', { costoDia: 0.2, dias: 3 }),
  ];
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2']), 0.9);
});

test('totalSeleccionado: un id marcado que no está en la lista no suma nada', () => {
  assert.equal(totalSeleccionado([cerrado('c1')], ['c1', 'fantasma']), 1200);
});

test('totalSeleccionado: una renta que aún no cierra no entra a un pago aunque alguien la marque', () => {
  // Pagar sobre un monto que todavía se puede mover es justo lo que el dueño
  // dijo que no quiere hacer.
  const contratos = [cerrado('c1'), devueltoConSaldo('c2'), afuera('c3')];
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2', 'c3']), 1200);
});

test('totalSeleccionado: un sello "cerrado" viejo tampoco mete un contrato a un pago', () => {
  const contratos = [cerrado('c1'), cerradoPeroSeAnuloUnPago('c2'), cerradoPeroGarantiaBloqueada('c3')];
  assert.equal(totalSeleccionado(contratos, ['c1', 'c2', 'c3']), 1200);
});

// ---------------------------------------------------------------------------
// agruparPorDueno
// ---------------------------------------------------------------------------

/** Lo que interesa de cada grupo, para comparar completo con deepEqual. */
const resumenDeGrupos = (grupos) => grupos.map((g) => ({
  duenoId: g.duenoId, nombre: g.nombre, sinEnlazar: g.sinEnlazar, total: g.cuenta.totalPorPagar,
}));

test('agruparPorDueno: dos contratos del mismo duenoId caen en una entrada con el total sumado', () => {
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1'),
    enlazado(cerradoConAtraso('c2', { dueno: 'Don Mario' }), 'd1'),
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].duenoId, 'd1');
  assert.equal(grupos[0].sinEnlazar, false);
  assert.equal(grupos[0].cuenta.totalPorPagar, 3000);
  assert.deepEqual(ids(grupos[0].cuenta.porPagar), ['c1', 'c2']);
});

test('agruparPorDueno: el mismo dueño enlazado con textos distintos sigue siendo un solo dueño', () => {
  // El texto es lo que se escribió ese día; lo que manda es el duenoId.
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1'),
    enlazado(cerrado('c2', { dueno: 'mario lópez' }), 'd1'),
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].cuenta.totalPorPagar, 2400);
});

test('agruparPorDueno: un contrato viejo sin duenoId no desaparece: cae bajo su texto, marcado como no enlazado', () => {
  // Desde que "Sacar carro" escoge al dueño de una lista, construirContrato
  // escribe `duenoId: null` cuando no se escogió ninguno. Los contratos de ANTES
  // de eso ni siquiera traen la llave, así que para ser uno de ellos se le quita.
  const { duenoId: _sinLlave, ...viejo } = cerrado('c1', { dueno: 'Don Mario' });
  assert.equal('duenoId' in viejo, false, 'así quedaron guardados los contratos de antes de esta función');

  const grupos = agruparPorDueno([viejo], []);

  assert.deepEqual(resumenDeGrupos(grupos), [
    { duenoId: null, nombre: 'Don Mario', sinEnlazar: true, total: 1200 },
  ]);
  assert.deepEqual(ids(grupos[0].cuenta.porPagar), ['c1']);
});

test('agruparPorDueno: dos contratos viejos con el mismo texto caen juntos', () => {
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: 'Don Mario' }),
    cerradoConAtraso('c2', { dueno: 'Don Mario' }),
  ], []);
  assert.deepEqual(resumenDeGrupos(grupos), [
    { duenoId: null, nombre: 'Don Mario', sinEnlazar: true, total: 3000 },
  ]);
});

test('agruparPorDueno: un espacio de más al escribir el nombre no parte al dueño en dos', () => {
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: 'Don Mario' }),
    cerrado('c2', { dueno: '  Don Mario ' }),
  ], []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].nombre, 'Don Mario');
  assert.equal(grupos[0].cuenta.totalPorPagar, 2400);
});

test('agruparPorDueno: dos nombres escritos distinto quedan como dos grupos, a la vista, para enlazarlos', () => {
  // No se adivina que «Don Mario» y «Mario López» son la misma persona: un
  // grupo de más es un desorden que él puede ver; unir a dos personas por
  // error sería una deuda que se contagia a otro.
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: 'Don Mario' }),
    cerrado('c2', { dueno: 'Mario López' }),
  ], []);
  assert.equal(grupos.length, 2);
  assert.deepEqual(grupos.map((g) => g.sinEnlazar), [true, true]);
});

test('agruparPorDueno: el mismo nombre escrito a mano NO se une a un dueño enlazado', () => {
  // Hasta que él los enlace, son dos grupos. El texto «d1» no debe chocar con
  // un duenoId «d1»: cada clave lleva su propio prefijo.
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1'),
    cerrado('c2', { dueno: 'Don Mario' }),
    cerrado('c3', { dueno: 'd1' }),
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.equal(grupos.length, 3);
  assert.equal(grupos.filter((g) => g.duenoId === 'd1').length, 1);
  assert.equal(grupos.filter((g) => g.sinEnlazar).length, 2);
});

test('agruparPorDueno: un contrato ajeno sin ningún nombre de dueño tampoco desaparece', () => {
  const grupos = agruparPorDueno([
    cerrado('c1', { dueno: '' }),
    cerrado('c2', { dueno: '   ' }),
  ], []);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].duenoId, null);
  assert.equal(grupos[0].sinEnlazar, true);
  assert.equal(grupos[0].nombre, 'Sin dueño anotado');
  assert.equal(grupos[0].cuenta.totalPorPagar, 2400);
});

test('agruparPorDueno: ordena por lo que más se debe primero', () => {
  const contratos = [
    enlazado(cerrado('c1'), 'd2'), // d2: Q1,200
    enlazado(cerrado('c2'), 'd1'), // d1: Q1,200 + Q1,800 = Q3,000
    enlazado(cerradoConAtraso('c3'), 'd1'),
    cerrado('c4', { dueno: 'Doña Rosa', costoDia: 500 }), // sin enlazar: Q2,000
  ];
  const grupos = agruparPorDueno(contratos, []);
  assert.deepEqual(grupos.map((g) => g.cuenta.totalPorPagar), [3000, 2000, 1200]);
  assert.deepEqual(grupos.map((g) => g.duenoId), ['d1', null, 'd2']);
});

test('agruparPorDueno: un dueño sin nada pendiente no desaparece, va al final con total 0', () => {
  const contratos = [
    enlazado(cerrado('c1'), 'd1'), // ya pagado
    enlazado(cerrado('c2'), 'd2'), // Q1,200 por pagar
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })];
  const grupos = agruparPorDueno(contratos, pagos);
  assert.deepEqual(grupos.map((g) => [g.duenoId, g.cuenta.totalPorPagar]), [['d2', 1200], ['d1', 0]]);
  assert.deepEqual(ids(grupos[1].cuenta.pagados), ['c1']);
});

test('agruparPorDueno: cada entrada trae su cuenta armada con los pagos que le tocan', () => {
  const contratos = [
    enlazado(cerrado('c1'), 'd1'),
    enlazado(cerrado('c2'), 'd1'),
    enlazado(devueltoConSaldo('c3'), 'd1'),
    enlazado(cerrado('c4'), 'd2'),
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd1', contratos: ['c1'], monto: 1200 })];
  const grupos = agruparPorDueno(contratos, pagos);

  // d1: c2 por pagar (Q1,200), c1 ya pagado, c3 aún no cierra. d2: c4 (Q1,200).
  assert.equal(grupos.length, 2);
  const d1 = grupos.find((g) => g.duenoId === 'd1');
  const d2 = grupos.find((g) => g.duenoId === 'd2');
  assert.deepEqual(ids(d1.cuenta.porPagar), ['c2']);
  assert.deepEqual(ids(d1.cuenta.pagados), ['c1']);
  assert.deepEqual(ids(d1.cuenta.aunNoCierra), ['c3']);
  assert.equal(d1.cuenta.totalPorPagar, 1200);
  assert.deepEqual(ids(d2.cuenta.porPagar), ['c4']);
  assert.equal(d2.cuenta.totalPorPagar, 1200);
});

test('agruparPorDueno: si dos dueños deben lo mismo, el orden no depende de cómo llegaron los contratos', () => {
  const a = cerrado('c1', { dueno: 'Zacarías' });
  const b = cerrado('c2', { dueno: 'Alberto' });
  const esperado = ['Alberto', 'Zacarías'];
  assert.deepEqual(agruparPorDueno([a, b], []).map((g) => g.nombre), esperado);
  assert.deepEqual(agruparPorDueno([b, a], []).map((g) => g.nombre), esperado);
});

/** Todas las maneras de ordenar una lista, para probar que el orden de llegada no importa. */
function permutaciones(lista) {
  if (lista.length <= 1) return [lista];
  return lista.flatMap((x, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [x, ...resto]));
}

test('agruparPorDueno: dos dueños enlazados que empatan en total y en nombre quedan siempre en el mismo orden', () => {
  // Empatan en todo menos en el duenoId: sin un último desempate el orden
  // sería el de llegada, y las filas saltarían de lugar entre una pantalla y
  // la siguiente sin razón que él pueda ver.
  const a = enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'dA');
  const b = enlazado(cerrado('c2', { dueno: 'Don Mario' }), 'dB');
  assert.deepEqual(agruparPorDueno([a, b], []).map((g) => g.duenoId), ['dA', 'dB']);
  assert.deepEqual(agruparPorDueno([b, a], []).map((g) => g.duenoId), ['dA', 'dB']);
});

test('agruparPorDueno: el nombre de respaldo de un dueño enlazado no depende de qué contrato llegó primero', () => {
  // Un mismo dueño con dos textos escritos ('Zeta' un día, 'Alfa' otro). El
  // nombre sale de ordenar esos textos, no del orden de llegada; y como el
  // nombre es la llave del orden, tampoco cambia dónde cae el dueño.
  const zeta = enlazado(cerrado('c1', { dueno: 'Zeta' }), 'dX');
  const alfa = enlazado(cerrado('c2', { dueno: 'Alfa' }), 'dX');
  const beta = enlazado(cerrado('c3', { dueno: 'Beta' }), 'dY'); // mismo total que dX
  for (const llegada of permutaciones([zeta, alfa, beta])) {
    const grupos = agruparPorDueno(llegada, []);
    assert.deepEqual(
      grupos.map((g) => [g.duenoId, g.nombre]),
      [['dX', 'Alfa'], ['dY', 'Beta']],
      `llegada: ${ids(llegada)}`,
    );
  }
});

test('agruparPorDueno: a igual total y nombre, el dueño enlazado va antes que el escrito a mano', () => {
  const enlazadoMario = enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'd1');
  const aMano = cerrado('c2', { dueno: 'Don Mario' });
  for (const llegada of [[enlazadoMario, aMano], [aMano, enlazadoMario]]) {
    assert.deepEqual(agruparPorDueno(llegada, []).map((g) => g.sinEnlazar), [false, true]);
  }
});

test('agruparPorDueno: el orden es el mismo sea cual sea el orden de llegada, también con grupos enlazados', () => {
  // Cinco grupos que empatan en Q1,200 y se desempatan de todas las maneras
  // posibles: por nombre, por duenoId con el mismo nombre, por el nombre
  // más chico de un dueño con dos textos, y los dos grupos sin enlazar que
  // terminan llamándose «Sin dueño anotado» (el vacío, y uno al que de verdad
  // se le escribió ese texto). Se prueban las 720 maneras de llegar.
  const contratos = [
    enlazado(cerrado('c1', { dueno: 'Don Mario' }), 'dA'),
    enlazado(cerrado('c2', { dueno: 'Don Mario' }), 'dB'),
    enlazado(cerrado('c3', { dueno: 'Zeta' }), 'dC'),
    enlazado(devueltoConSaldo('c4', { dueno: 'Alfa' }), 'dC'), // aún no cierra, pero su texto cuenta
    cerrado('c5', { dueno: '' }),
    cerrado('c6', { dueno: 'Sin dueño anotado' }),
  ];
  const firma = (grupos) => grupos.map((g) => [g.duenoId, g.nombre, g.sinEnlazar, g.cuenta.totalPorPagar, ids(g.cuenta.porPagar)]);
  const esperado = [
    ['dC', 'Alfa', false, 1200, ['c3']],
    ['dA', 'Don Mario', false, 1200, ['c1']],
    ['dB', 'Don Mario', false, 1200, ['c2']],
    [null, 'Sin dueño anotado', true, 1200, ['c5']],
    [null, 'Sin dueño anotado', true, 1200, ['c6']],
  ];
  for (const llegada of permutaciones(contratos)) {
    assert.deepEqual(firma(agruparPorDueno(llegada, [])), esperado, `llegada: ${ids(llegada)}`);
  }
});

test('agruparPorDueno: dos textos que se ven iguales pero se escribieron distinto no se desempatan por el orden de llegada', () => {
  // «José» con la é de una pieza y «José» con la e y el acento por separado:
  // se ven idénticos, localeCompare() los da por iguales (0) y son dos grupos.
  // Si el último desempate fuera también un localeCompare, el orden volvería a
  // depender de cómo llegaron.
  const dePieza = cerrado('c1', { dueno: 'Jos\u00e9' });
  const separada = cerrado('c2', { dueno: 'Jose\u0301' });
  assert.equal('Jos\u00e9'.localeCompare('Jose\u0301', 'es'), 0, 'así de iguales los ve el idioma');
  const esperado = [['c2'], ['c1']]; // por código: la «e» suelta va antes que la «é»
  assert.deepEqual(agruparPorDueno([dePieza, separada], []).map((g) => ids(g.cuenta.porPagar)), esperado);
  assert.deepEqual(agruparPorDueno([separada, dePieza], []).map((g) => ids(g.cuenta.porPagar)), esperado);
});

test('agruparPorDueno: los contratos de carro propio no forman parte de ningún dueño', () => {
  const p = guardado(saldado(recibido(propio({ id: 'propio1' }))));
  const grupos = agruparPorDueno([p, cerrado('c1')], []);
  assert.equal(grupos.length, 1);
  assert.deepEqual(ids(grupos[0].cuenta.porPagar), ['c1']);
});

test('agruparPorDueno: una lista de contratos vacía de verdad da una lista vacía', () => {
  assert.deepEqual(agruparPorDueno([], []), []);
});

test('agruparPorDueno: si la lista de contratos no llegó, lanza en vez de decir que no se le debe a nadie', () => {
  // Ver el comentario de cuentaDeDueno: «no le debes a nadie» es la respuesta
  // que nadie revisa, y por eso la que no se puede dar por una lectura fallida.
  const contratos = [enlazado(cerrado('c1'), 'd1'), enlazado(cerradoConAtraso('c2'), 'd1')];
  assert.equal(agruparPorDueno(contratos, [])[0].cuenta.totalPorPagar, 3000, 'bien leído: Q3,000 a d1');

  for (const mala of [undefined, null, {}, 'c1', 42]) {
    assert.throws(
      () => agruparPorDueno(mala, []),
      { name: 'TypeError', message: /«contratos» debe ser una lista/ },
      `contratos = ${JSON.stringify(mala)} no es una lista`,
    );
  }
});

test('agruparPorDueno: una lista de pagos que no llegó lanza, haya contratos o no', () => {
  // Que falle no debe depender de que ese día haya contratos de carro ajeno:
  // la pantalla que llama con datos fallidos tiene que enterarse en la primera
  // prueba, no el día que aparezca el primer subarriendo.
  for (const pagos of [undefined, null, {}, 'p1']) {
    assert.throws(() => agruparPorDueno([enlazado(cerrado('c1'), 'd1')], pagos), { name: 'TypeError', message: /pagos/ });
    assert.throws(() => agruparPorDueno([], pagos), { name: 'TypeError', message: /pagos/ });
  }
  assert.throws(() => agruparPorDueno(undefined, undefined), { name: 'TypeError', message: /pagos/ });
  assert.throws(
    () => agruparPorDueno([], [{ id: 'p1', duenoId: 'd1', contratos: 'c1' }]),
    { name: 'TypeError', message: /contratos/ },
    'ni un pago con su lista de rentas dañada',
  );
});

test('agruparPorDueno: ningún contrato ajeno ni ningún centavo se pierde, enlazado o no', () => {
  // Lo que más importa de todo el módulo: lo que él ve repartido en grupos
  // tiene que ser TODO lo que le debe, no una parte.
  const contratos = [
    enlazado(cerrado('c1'), 'd1'), // 1,200
    enlazado(cerradoConAtraso('c2'), 'd1'), // 1,800
    enlazado(cerrado('c3'), 'd2'), // 1,200
    cerrado('c4', { dueno: 'Don Mario' }), // 1,200, viejo
    cerradoConAtraso('c5', { dueno: 'Don Mario' }), // 1,800, viejo
    cerrado('c6', { dueno: 'Doña Rosa', costoDia: 250 }), // 1,000, viejo
    cerrado('c7', { dueno: '' }), // 1,200, viejo y sin nombre
    devueltoConSaldo('c8', { dueno: 'Doña Rosa' }), // viejo, aún no cierra
    enlazado(afuera('c9'), 'd2'), // aún no cierra
    enlazado(cerrado('c10'), 'd3'), // ya pagado
    guardado(saldado(recibido(propio({ id: 'propio1' })))), // propio: no es de nadie
  ];
  const pagos = [pagoADueno({ id: 'p1', duenoId: 'd3', contratos: ['c10'], monto: 1200 })];

  const grupos = agruparPorDueno(contratos, pagos);

  const sumaDeTotales = grupos.reduce((t, g) => t + g.cuenta.totalPorPagar, 0);
  assert.equal(sumaDeTotales, 9400, 'Q1,200+1,800+1,200+1,200+1,800+1,000+1,200');

  const enGrupos = grupos.flatMap((g) => [...g.cuenta.porPagar, ...g.cuenta.aunNoCierra, ...g.cuenta.pagados]);
  assert.deepEqual(ids(enGrupos).sort(), ['c1', 'c10', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);

  // Cada contrato en un solo grupo, no en dos.
  assert.equal(new Set(ids(enGrupos)).size, enGrupos.length);

  assert.deepEqual(resumenDeGrupos(grupos), [
    { duenoId: 'd1', nombre: 'Don Mario', sinEnlazar: false, total: 3000 },
    { duenoId: null, nombre: 'Don Mario', sinEnlazar: true, total: 3000 },
    { duenoId: 'd2', nombre: 'Don Mario', sinEnlazar: false, total: 1200 },
    { duenoId: null, nombre: 'Sin dueño anotado', sinEnlazar: true, total: 1200 },
    { duenoId: null, nombre: 'Doña Rosa', sinEnlazar: true, total: 1000 },
    { duenoId: 'd3', nombre: 'Don Mario', sinEnlazar: false, total: 0 },
  ]);
});
