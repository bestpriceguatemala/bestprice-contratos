// Pruebas del manejo de dinero y de la pantalla del área de dinero.
// Correr con:  npm test
//
// La primera parte es el redondeo (nucleo/dinero.js). La segunda, desde «La
// pantalla del área de dinero», es la pantalla de lo que se le debe a cada
// dueño (pantallas/dinero.js), con los contratos armados por las mismas
// funciones que arman los reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  q, suma, conTarjeta, recargoTarjeta, textoDosDecimales, textoConQ, textoEntero,
} from '../js/nucleo/dinero.js';
import {
  CORREO_DE_DINERO, INACTIVIDAD_MS, FORMAS_DE_PAGO, MENSAJE_SIN_COMPROBAR, MENSAJE_SIN_COMPROBAR_RENTAS, MENSAJE_PAGO_CAMBIO,
  MENSAJE_FALLO_CONTRATOS, MENSAJE_FALLO_PAGOS, MENSAJE_FALLO_DATOS, MENSAJE_FALLO_DUENOS, MENSAJE_PAGO_FALLO,
  MENSAJE_INACTIVIDAD, enElAreaDeDinero, claveDeEntrada, rutaDeCuenta, armarVista, rentasSinCostoLegible,
  estadoDeCosto, notasDeTotal, resumenDeMarcadas, razonDeNoCierre, pagosDeLaCuenta, registrarElPago,
  parchearMarcado, notasDelTotalGeneral, textoDeComprobantes, diferenciaBloqueada, rentasCortas,
  cerrarElDinero, cerrarElDineroOReiniciar, salirDelSistema, crearVigilante, crearLector, mensajeSeguro,
  pintarDinero, pintarCuentaDeDueno, alOlvidarElDinero,
  htmlEntrada, htmlFallo, htmlLista, htmlFicha, htmlMigracion, entradaDelComprobante, problemaDeLaFechaDelPago,
  textoConfirmarAnularPagoDueno, anularElPago, MENSAJE_ANULAR_SIN_COMPROBAR, MENSAJE_ANULAR_NO_ESTA, MENSAJE_ANULAR_FALLO,
  textoDePagadoDeMas, resumenDelDescuento, textoDelProblemaDelDescuento, textoDeDescuentoSinRespaldo,
} from '../js/pantallas/dinero.js';
import { armarComprobante } from '../js/pantallas/comprobante.js';
import { pantallaDeMentira } from './fixtures/pantallaDeMentira.mjs';
import { htmlListaDeDuenos, htmlFormularioDeDueno } from '../js/pantallas/duenos.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { resumen } from '../js/nucleo/contrato.js';
import { estadoContrato, pendientesDe } from '../js/nucleo/estados.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import {
  cuentaDeDueno, agruparPorDueno, totalSeleccionado, pagoAnulado, pagadoDeMas, totalPagadoDeMas, descuentoMaximo,
  descuentoSinRespaldo, entregadoDelPago,
} from '../js/nucleo/liquidacion.js';
import { dinero } from '../js/ui.js';
import { mensajeDeErrorDeDinero } from '../js/dinero-sesion.js';
import {
  agregarPago, contratoParaGuardar, conCostoDelDueno, costoDelDocumento, construirPagoDueno, pagoDuenoParaGuardar,
  guardarPagoDueno, anotarCostoDelDueno, enlazarContratosAlDueno, nuevoIdPagoDueno, anularPagoDueno,
  MENSAJE_COSTO_SIN_VALOR, MENSAJE_COSTO_SIN_DINERO, MENSAJE_COSTO_YA_ANOTADO, MENSAJE_COSTO_SIN_COMPROBAR, MENSAJE_PAGO_SIN_RENTAS,
  MENSAJE_PAGO_DESCUENTO,
} from '../js/datos.js';

test('redondea a dos decimales', () => {
  assert.equal(q(3.005), 3.01);
  assert.equal(q(1234.567), 1234.57);
  assert.equal(q(700), 700);
});

test('lo vacío vale cero, no rompe la cuenta', () => {
  assert.equal(q(undefined), 0);
  assert.equal(q(null), 0);
  assert.equal(q(''), 0);
  assert.equal(q('abc'), 0);
  assert.equal(q('350'), 350);
});

// Un negativo diminuto llega escrito en notación exponencial y se cae por el camino
// de respaldo de `q()`, que antes devolvía `-0`. Se lee «0.00» en pantalla, así que
// nadie lo notaría; lo que no se puede es dejar que un menos cero viaje como si fuera
// una cantidad de dinero. `Object.is` es la única forma de distinguirlo: `-0 === 0`.
test('un negativo diminuto da cero, no menos cero', () => {
  assert.ok(Object.is(q(-5.55e-17), 0), `q(-5.55e-17) dio ${q(-5.55e-17)}`);
  assert.ok(Object.is(q(-1e-30), 0));
  assert.ok(Object.is(q(-0.001), 0), 'el que no pasa por el respaldo, igual');
  assert.ok(Object.is(q(0), 0));
  assert.equal(q(-2.5e2), -250, 'un negativo de verdad en exponencial no se toca');
});

test('suma sin arrastrar errores de centavos', () => {
  assert.equal(suma(0.1, 0.2), 0.3);
  assert.equal(suma(2800, 350, 200, 130), 3480);
  assert.equal(suma(700, undefined, null, '130'), 830);
});

test('el recargo de tarjeta del ejemplo del diseño', () => {
  assert.equal(conTarjeta(3150, 12), 3528);
  assert.equal(conTarjeta(730, 12), 817.6);
  assert.equal(recargoTarjeta(3150, 12), 378);
  assert.equal(recargoTarjeta(730, 12), 87.6);
});

test('sin porcentaje, el monto no cambia', () => {
  assert.equal(conTarjeta(3150, 0), 3150);
  assert.equal(conTarjeta(3150, undefined), 3150);
  assert.equal(recargoTarjeta(3150, 0), 0);
});

test('el medio centavo sube, sin importar el tamaño del monto', () => {
  assert.equal(q(3.005), 3.01);
  assert.equal(q(5.015), 5.02);
  assert.equal(q(1234.565), 1234.57);
  assert.equal(q(0.615), 0.62);
});

test('un monto negativo se redondea igual que su positivo', () => {
  assert.equal(q(-3.005), -3.01);
  assert.equal(q(-5.015), -5.02);
  assert.ok(Object.is(q(-0.001), 0), 'no queda un menos cero suelto');
});

// Revisión final: los detalles de línea del núcleo (contrato.js) mostraban
// "Q700" en vez de "Q700.00" — un monto sin sus centavos justo donde el
// resto del sistema siempre los muestra.
test('textoDosDecimales siempre lleva dos decimales y separador de miles', () => {
  assert.equal(textoDosDecimales(700), '700.00');
  assert.equal(textoDosDecimales(1234.5), '1,234.50');
  assert.equal(textoDosDecimales(0), '0.00');
  assert.equal(textoDosDecimales(undefined), '0.00');
});

// Revisión final: cierre.js interpolaba textoDosDecimales de un subtotal
// negativo directo en un texto "Q${...}", y el signo de un negativo queda
// pegado adentro de la Q: "Q-95,819.00". textoConQ es la versión del núcleo
// que ya pone el signo antes, igual que dinero() en ui.js.
test('textoConQ: el signo va antes de la Q, nunca pegado adentro', () => {
  assert.equal(textoConQ(-95819), '-Q95,819.00');
  assert.equal(textoConQ(730), 'Q730.00');
  assert.equal(textoConQ(0), 'Q0.00');
  assert.equal(textoConQ(undefined), 'Q0.00');
});

// Revisión final: el kilometraje se mostraba distinto en dos pantallas —
// "45,000.00" (textoDosDecimales) en recibirCarro.js y "45000" (crudo) en
// contratos.js. textoEntero es el único formato que ahora usan las dos: con
// separador de miles, sin decimales.
test('textoEntero: separador de miles, sin decimales, para kilometrajes', () => {
  assert.equal(textoEntero(45000), '45,000');
  assert.equal(textoEntero(0), '0');
  assert.equal(textoEntero(undefined), '0');
  assert.equal(textoEntero(45600.7), '45,601', 'redondea, no trunca');
});

// ===========================================================================
// La pantalla del área de dinero
// ===========================================================================
//
// Lo que se prueba aquí es lo que decide la pantalla sin necesidad de un
// navegador: qué cuentas arma, qué dice cuando algo falla, qué suma lo marcado,
// cómo registra el pago y cómo se cierra la sesión. El cableado del DOM se
// comprobó a mano en el navegador (ver el reporte de la Tarea 8).
//
// Los contratos NO están inventados: salen de `construirContrato` (Sacar
// carro), `construirCierre` (Recibir carro), `agregarPago` (cobrar el saldo) y
// de lo que de verdad se guarda y se vuelve a leer (`contratoParaGuardar` +
// `conCostoDelDueno`), o sea con los campos de §7b y ninguno que no exista. Una
// suite que arma sus propios datos solo se comprueba a sí misma.

const AHORA = 1790000000000;
const HOY = '2026-10-05';
const JUAN = { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' };
const ROSA = { id: 'k2', nombres: 'Rosa', apellidos: 'Díaz' };
const TARJETA = {
  ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000,
};

/** Un contrato de carro ajeno recién salido; la renta al cliente se cobra completa en efectivo. */
function salida({
  id, numero = 1, dueno = 'Mario López', duenoId = 'd1', costoDia = 300, dias = 4, fechaSalida = '2026-09-01',
  garantia = false, placas = 'P-1AJN', cliente = JUAN,
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
    tarjetas: garantia ? [TARJETA] : [],
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

/**
 * Como llega el contrato al área de dinero: lo que de verdad se escribe (sin el
 * costo) con el costo puesto por el puente de lectura, como lo hace
 * `cargarContratosParaDinero`. Un costo de 0 llega como 0, no como «ausente».
 */
const alLeer = (c) => conCostoDelDueno(
  contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA }),
  costoDelDocumento(c),
);

const cerrado = (id, opciones) => alLeer(saldado(recibido(salida({ id, ...opciones }))));
const cerradoConAtraso = (id, opciones) => alLeer(saldado(recibido(salida({ id, ...opciones }), 2)));
const devueltoConSaldo = (id, opciones) => alLeer(recibido(salida({ id, ...opciones }), 2));
const devueltoConGarantia = (id, opciones) => alLeer(recibido(salida({ id, garantia: true, ...opciones })));
const sigueAfuera = (id, opciones) => alLeer(salida({ id, ...opciones }));

// Mario López (d1): tres rentas cerradas por pagar (una sin costo anotado) y dos
// que aún no cierran. Lucía Barrios (d2): una por pagar, una con la garantía sin
// liberar y una ya pagada. Dos nombres escritos a mano en contratos viejos, sin
// duenoId. Y un dueño de la lista sin ninguna renta.
const M1 = cerrado('m1', { numero: 11, placas: 'P-111AAA', costoDia: 300 }); //                              4 × 300 = 1,200
const M2 = cerradoConAtraso('m2', { numero: 12, placas: 'P-222BBB', costoDia: 300, cliente: ROSA, fechaSalida: '2026-09-05' }); // (4 + 2) × 300 = 1,800
const M3 = devueltoConSaldo('m3', { numero: 13, placas: 'P-333CCC', costoDia: 300 }); //                       aún debe 2 días de atraso
const M4 = sigueAfuera('m4', { numero: 14, placas: 'P-444DDD', costoDia: 300 }); //                           el carro sigue afuera
const M5 = cerrado('m5', { numero: 15, placas: 'P-555EEE', costoDia: 0 }); //                                 cerrado, SIN costo anotado
const L1 = cerrado('l1', { numero: 21, placas: 'P-AAA111', costoDia: 250, dias: 3, dueno: 'Lucía Barrios', duenoId: 'd2' }); // 3 × 250 = 750
const L2 = devueltoConGarantia('l2', { numero: 22, placas: 'P-BBB222', costoDia: 250, dueno: 'Lucía Barrios', duenoId: 'd2' });
const L3 = cerrado('l3', { numero: 23, placas: 'P-CCC333', costoDia: 250, dias: 5, dueno: 'Lucía Barrios', duenoId: 'd2' }); // 5 × 250 = 1,250, ya pagada
const T1 = cerrado('t1', { numero: 31, placas: 'P-TTT001', costoDia: 200, dias: 2, dueno: 'Don Mario', duenoId: null }); //   2 × 200 = 400
const T2 = cerrado('t2', { numero: 32, placas: 'P-TTT002', costoDia: 100, dias: 3, dueno: 'Doña Pura', duenoId: null }); //  3 × 100 = 300

const REGISTRO_MARIO = { id: 'd1', nombre: 'Mario López Alvarado', telefono: '5555-1111', nit: '1234567-8', nota: '', actualizado: AHORA };
const REGISTRO_LUCIA = { id: 'd2', nombre: 'Lucía Barrios', telefono: '', nit: '', nota: '', actualizado: AHORA };
const REGISTRO_ZACARIAS = { id: 'd3', nombre: 'Zacarías Sin Rentas', telefono: '', nit: '', nota: '', actualizado: AHORA };
const DUENOS = [REGISTRO_LUCIA, REGISTRO_ZACARIAS, REGISTRO_MARIO];

/** El pago #3 a Lucía, armado y sellado por las mismas funciones que arman los reales. */
const PAGO_A_LUCIA = pagoDuenoParaGuardar(
  construirPagoDueno({
    duenoId: 'd2', fecha: '2026-09-20', forma: 'transferencia', contratos: [L1, L2, L3], pagos: [], idsMarcados: ['l3'],
  }),
  { id: 'pg-lucia', numero: 3, ahora: AHORA },
);

const TODOS = [M1, M2, M3, M4, M5, L1, L2, L3, T1, T2];

/** Lo que devuelven las tres lecturas cuando todo salió bien. */
const lecturaOk = (cambios = {}) => ({
  contratos: { datos: TODOS, fallo: false, costoSinLeer: [] },
  pagos: { datos: [PAGO_A_LUCIA], fallo: false },
  duenos: { datos: DUENOS, fallo: false },
  ...cambios,
});

const entradaDe = (vista, nombre) => vista.entradas.find((e) => e.nombre === nombre);
const uiVacia = (cambios = {}) => ({
  marcados: new Set(), anotando: null, pagando: false, forma: 'efectivo', fecha: HOY, mensajePago: '', mensajeEnlace: '', ...cambios,
});
const fichaDe = (nombre, { vista = armarVista(lecturaOk()), ui = uiVacia(), lectura = lecturaOk() } = {}) => htmlFicha({
  entrada: entradaDe(vista, nombre), vista, ui, lectura, hoy: HOY,
});
/** El pedazo de HTML entre dos marcas (para afirmar qué hay DENTRO de un bloque, no solo en la página). */
const entre = (html, desde, hasta) => {
  const i = html.indexOf(desde);
  assert.ok(i >= 0, `no está «${desde}»`);
  const j = hasta ? html.indexOf(hasta, i + desde.length) : html.length;
  assert.ok(j >= 0, `no está «${hasta}»`);
  return html.slice(i, j);
};

test('el escenario: los estados y los montos son los que las pruebas suponen', () => {
  for (const c of [M1, M2, M5, L1, L3, T1, T2]) assert.equal(estadoContrato(c), 'cerrado', c.id);
  assert.equal(estadoContrato(M3), 'devuelto');
  assert.equal(estadoContrato(M4), 'rentado');
  assert.equal(estadoContrato(L2), 'devuelto');
  assert.equal(resumen(M1).costoSubarriendo, 1200);
  assert.equal(resumen(M2).costoSubarriendo, 1800);
  assert.equal(resumen(M5).costoSubarriendo, 0);
  assert.equal(resumen(L1).costoSubarriendo, 750);
  assert.equal(PAGO_A_LUCIA.monto, 1250);
  assert.deepEqual(PAGO_A_LUCIA.contratos, ['l3']);
  assert.equal(PAGO_A_LUCIA.duenoId, 'd2');
  // El contrato M5 llega con costo 0 y NO con el costo ausente: es el caso real tras ADR-002.
  assert.equal(M5.subarriendo.costoDia, 0);
});

// ---------------------------------------------------------------------------
// Qué se le debe a cada dueño: los totales cuadran con lo sembrado
// ---------------------------------------------------------------------------

test('las cuentas: cada dueño debe exactamente lo sembrado, de la que más se debe a la que menos', () => {
  const vista = armarVista(lecturaOk());
  assert.equal(vista.ok, true);
  assert.deepEqual(
    vista.entradas.map((e) => [e.nombre, e.cuenta.totalPorPagar]),
    [
      ['Mario López Alvarado', 3000], // 1,200 + 1,800 + 0 (la renta sin costo anotado cuenta Q0.00)
      ['Lucía Barrios', 750], //          solo l1: l3 ya está pagada, l2 aún no cierra
      ['Don Mario', 400],
      ['Doña Pura', 300],
      ['Zacarías Sin Rentas', 0], //       un dueño sin ninguna renta no desaparece
    ],
  );
});

test('las tres listas de cada cuenta: por pagar, aún no cierra y ya pagado', () => {
  const vista = armarVista(lecturaOk());
  const mario = entradaDe(vista, 'Mario López Alvarado').cuenta;
  assert.deepEqual(mario.porPagar.map((c) => c.id), ['m1', 'm2', 'm5']);
  assert.deepEqual(mario.aunNoCierra.map((c) => c.id), ['m3', 'm4']);
  assert.deepEqual(mario.pagados.map((c) => c.id), []);
  const lucia = entradaDe(vista, 'Lucía Barrios').cuenta;
  assert.deepEqual(lucia.porPagar.map((c) => c.id), ['l1']);
  assert.deepEqual(lucia.aunNoCierra.map((c) => c.id), ['l2']);
  assert.deepEqual(lucia.pagados.map((c) => c.id), ['l3']);
});

test('un dueño enlazado se muestra con el nombre de su REGISTRO, no con el texto que quedó en el contrato', () => {
  const vista = armarVista(lecturaOk());
  const mario = vista.entradas.find((e) => e.duenoId === 'd1');
  assert.equal(M1.carroAjeno.dueno, 'Mario López', 'el contrato conserva lo que se escribió ese día');
  assert.equal(mario.nombre, 'Mario López Alvarado', 'la pantalla muestra el nombre del registro');
  assert.equal(mario.registro.id, 'd1');
  assert.ok(!htmlLista(vista).includes('>Mario López<'), 'el texto viejo no sale como nombre');
  // Si el registro se corrige, la cuenta lo sigue sin tocar ningún contrato.
  const corregido = armarVista(lecturaOk({ duenos: { datos: [{ ...REGISTRO_MARIO, nombre: 'Mario A. López' }, REGISTRO_LUCIA], fallo: false } }));
  assert.ok(corregido.entradas.some((e) => e.duenoId === 'd1' && e.nombre === 'Mario A. López'));
});

test('los contratos viejos con el nombre escrito a mano NO desaparecen: salen bajo ese texto, marcados sin enlazar', () => {
  const vista = armarVista(lecturaOk());
  const don = entradaDe(vista, 'Don Mario');
  assert.equal(don.sinEnlazar, true);
  assert.equal(don.duenoId, null);
  assert.deepEqual(don.cuenta.porPagar.map((c) => c.id), ['t1']);
  assert.equal(don.cuenta.totalPorPagar, 400);
  const lista = htmlLista(vista);
  assert.ok(lista.includes('Don Mario') && lista.includes('Q400.00'));
  assert.ok(lista.includes('Doña Pura') && lista.includes('Q300.00'));
  assert.equal((lista.match(/Sin enlazar/g) || []).length, 2, 'una marca por cada grupo escrito a mano, y ninguna en los enlazados');
  // Nada se pierde: lo que suman las cuentas es lo que de verdad se debe en total.
  const aPagar = vista.entradas.reduce((t, e) => t + e.cuenta.totalPorPagar, 0);
  assert.equal(aPagar, 3000 + 750 + 400 + 300);
});

test('un dueño de la lista sin ninguna renta se ve apagado y no desaparece; el que tiene algo por pagar no se apaga', () => {
  const lista = htmlLista(armarVista(lecturaOk()));
  const fila = (nombre) => entre(lista, `>${nombre}</a>`, '</tr>');
  const inicio = (nombre) => lista.lastIndexOf('<tr', lista.indexOf(`>${nombre}</a>`));
  const clase = (nombre) => lista.slice(inicio(nombre), lista.indexOf('>', inicio(nombre)));
  assert.match(clase('Zacarías Sin Rentas'), /es-fuera/);
  assert.match(clase('Mario López Alvarado'), /class=""/);
  assert.match(clase('Lucía Barrios'), /class=""/);
  assert.ok(fila('Zacarías Sin Rentas').includes('Q0.00'));
});

test('un dueño cuyas únicas rentas por pagar no tienen costo NO se apaga: aunque su total salga en Q0.00, todavía hay algo que arreglar', () => {
  const lectura = lecturaOk({
    contratos: { datos: [M5], fallo: false, costoSinLeer: [] },
    pagos: { datos: [], fallo: false },
    duenos: { datos: [REGISTRO_MARIO], fallo: false },
  });
  const vista = armarVista(lectura);
  assert.equal(vista.entradas[0].cuenta.totalPorPagar, 0);
  assert.equal(vista.entradas[0].cuenta.porPagar.length, 1);
  const lista = htmlLista(vista);
  assert.doesNotMatch(lista, /<tr class="es-fuera"/);
  assert.ok(lista.includes('Falta anotar el costo de 1 renta'));
});

test('un dueño al que ya se le pagó todo sigue en la lista, apagado', () => {
  const lectura = lecturaOk({
    contratos: { datos: [L3], fallo: false, costoSinLeer: [] },
    duenos: { datos: [REGISTRO_LUCIA], fallo: false },
  });
  const vista = armarVista(lectura);
  assert.deepEqual(vista.entradas.map((e) => e.nombre), ['Lucía Barrios']);
  const lista = htmlLista(vista);
  assert.match(lista, /<tr class="es-fuera"/);
  assert.ok(lista.includes('Q0.00'));
});

test('la lista de dueños muestra el total de cada uno y cuántas rentas cerradas se le deben', () => {
  const lista = htmlLista(armarVista(lecturaOk()));
  const filaMario = entre(lista, '>Mario López Alvarado</a>', '</tr>');
  assert.ok(filaMario.includes('Q3,000.00') && filaMario.includes('<td>3</td>'), 'tres rentas cerradas por pagar');
  const filaLucia = entre(lista, '>Lucía Barrios</a>', '</tr>');
  assert.ok(filaLucia.includes('Q750.00') && filaLucia.includes('<td>1</td>'));
  // Y el orden de la pantalla es el de lo que más se debe.
  const posiciones = ['Mario López Alvarado', 'Lucía Barrios', 'Don Mario', 'Doña Pura', 'Zacarías Sin Rentas']
    .map((n) => lista.indexOf(`>${n}</a>`));
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones);
  assert.ok(posiciones.every((p) => p > 0));
});

test('la clave de una cuenta distingue a un dueño enlazado de un texto que se le parece', () => {
  assert.equal(claveDeEntrada({ duenoId: 'd1', nombre: 'Mario' }), 'id:d1');
  assert.equal(claveDeEntrada({ duenoId: null, nombre: 'd1' }), 'texto:d1', 'un dueño escrito como «d1» no se confunde con el enlazado');
  assert.equal(rutaDeCuenta('texto:Don Mario/Pérez'), '#/dinero/cuenta/texto%3ADon%20Mario%2FP%C3%A9rez');
  const vista = armarVista(lecturaOk());
  assert.equal(new Set(vista.entradas.map((e) => e.clave)).size, vista.entradas.length, 'ninguna clave se repite');
});

test('el nombre de un dueño con signos raros no rompe la página, y no se le COME ninguna letra', () => {
  // El apóstrofo se agregó el 23 de noviembre de 2026: la prueba cubría < > " y &, y por eso nadie veía
  // que si el escapador dejaba de tratarlo, «D'Angelo» salía en pantalla como «DAngelo» — el apóstrofo
  // no se escapaba mal, desaparecía. Un apellido guatemalteco con apóstrofo es de todos los días.
  const raro = { ...REGISTRO_MARIO, nombre: 'Mario <b>"D\'Angelo"</b> & Hijos' };
  const html = htmlLista(armarVista(lecturaOk({ duenos: { datos: [raro, REGISTRO_LUCIA], fallo: false } })));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('Mario &lt;b&gt;&quot;D&#39;Angelo&quot;&lt;/b&gt; &amp; Hijos'), html.slice(0, 400));
});

// ---------------------------------------------------------------------------
// Un total corto lo dice, y una lectura fallida NUNCA es «no le debes nada»
// ---------------------------------------------------------------------------

// Un contrato que llega dos veces (dos lecturas de rangos de fechas que se traslapan) inflaba
// lo que se ve: «3 · Q4,200.00» sobre Q3,000.00 en dos rentas, sin la marca de «incompleto», y
// después el pago se negaba con un aviso de «cambió la cuenta» que nadie había causado.
// Minor 1 de la revisión de la Tarea 8.
const SOLO_MARIO_CON_M1_REPETIDA = [M1, M2, M1];

test('un contrato repetido en la lectura no infla lo que se ve: la lista dice 2 rentas y Q3,000.00, no 3 y Q4,200.00', () => {
  const lectura = lecturaOk({ contratos: { datos: SOLO_MARIO_CON_M1_REPETIDA, fallo: false, costoSinLeer: [] }, pagos: { datos: [], fallo: false } });
  const vista = armarVista(lectura);
  const mario = entradaDe(vista, 'Mario López Alvarado');
  assert.equal(mario.cuenta.totalPorPagar, 3000);
  assert.deepEqual(mario.cuenta.porPagar.map((c) => c.id), ['m1', 'm2']);
  assert.deepEqual(mario.contratos.map((c) => c.id), ['m1', 'm2']);
  const fila = entre(htmlLista(vista), 'data-dn-clave="id:d1"', '</tr>');
  assert.ok(fila.includes('<td>2</td>') && fila.includes('Q3,000.00'));
  assert.ok(!fila.includes('Q4,200.00') && !fila.includes('<td>3</td>'));
  const ficha = fichaDe('Mario López Alvarado', { vista, lectura });
  assert.equal(ficha.split('P-111AAA').length - 1, 1 + 1, 'una fila, y su casilla lo nombra una vez: la renta no sale dos veces');
});

test('con un contrato repetido, marcar todo suma Q3,000.00 y el pago SE REGISTRA: no hay callejón con un aviso que culpe a otra cosa', async () => {
  const lectura = lecturaOk({ contratos: { datos: SOLO_MARIO_CON_M1_REPETIDA, fallo: false, costoSinLeer: [] }, pagos: { datos: [], fallo: false } });
  const entrada = entradaDe(armarVista(lectura), 'Mario López Alvarado');
  const marcadas = resumenDeMarcadas(entrada, new Set(['m1', 'm2']), []);
  assert.equal(marcadas.cuantas, 2, 'no 3');
  assert.equal(marcadas.total, 3000, 'no Q4,200');
  const deps = depsDePago({ pagos: [], contratos: SOLO_MARIO_CON_M1_REPETIDA });
  const r = await registrar(deps, { entrada, idsMarcados: marcadas.ids });
  assert.equal(r.tipo, 'guardado', 'lo marcado y lo que cubre el pago son lo mismo');
  assert.equal(r.pago.monto, 3000);
  assert.deepEqual(r.pago.contratos, ['m1', 'm2']);
});

test('un total corto por una renta sin costo anotado lo dice en pantalla, junto al total', () => {
  const vista = armarVista(lecturaOk());
  const mario = entradaDe(vista, 'Mario López Alvarado');
  assert.deepEqual(mario.cuenta.sinCostoAnotado, ['m5']);
  assert.deepEqual(notasDeTotal(mario, []), ['Falta anotar el costo de 1 renta: este total es menor al real.']);
  const lista = htmlLista(vista);
  const fila = entre(lista, '>Mario López Alvarado</a>', '</tr>');
  assert.ok(fila.includes('Falta anotar el costo de 1 renta') && fila.includes('incompleto'));
  // Y una cuenta completa no lleva ninguna advertencia: no se le tiran avisos que no pidió.
  const limpia = entre(lista, '>Lucía Barrios</a>', '</tr>');
  assert.ok(!limpia.includes('incompleto') && !limpia.includes('Falta anotar'));
  assert.deepEqual(notasDeTotal(entradaDe(vista, 'Lucía Barrios'), []), []);
});

test('un total con el costo SIN LEER también lo dice, y con otras palabras: es otro problema', () => {
  const lectura = lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: ['m1', 'm2'] } });
  const vista = armarVista(lectura);
  const mario = entradaDe(vista, 'Mario López Alvarado');
  assert.deepEqual(notasDeTotal(mario, vista.costoSinLeer), [
    'Falta anotar el costo de 1 renta: este total es menor al real.',
    'No se pudo leer el costo de 2 rentas: este total puede no ser el real.',
  ]);
  assert.ok(htmlLista(vista).includes('No se pudo leer el costo de 2 rentas'));
  assert.deepEqual([...rentasSinCostoLegible(mario.cuenta, vista.costoSinLeer)].sort(), ['m1', 'm2', 'm5']);
  assert.equal(estadoDeCosto(M1, mario.cuenta, vista.costoSinLeer), 'sin-leer');
  assert.equal(estadoDeCosto(M5, mario.cuenta, vista.costoSinLeer), 'sin-anotar');
  assert.equal(estadoDeCosto(M3, mario.cuenta, vista.costoSinLeer), 'leido');
});

test('una renta que todavía no cierra y no tiene costo se señala en su fila, pero no hace corto un total que no la incluye', () => {
  const sinCosto = devueltoConSaldo('x9', { numero: 99, placas: 'P-999XXX', costoDia: 0, dueno: 'Lucía Barrios', duenoId: 'd2' });
  const vista = armarVista(lecturaOk({ contratos: { datos: [L1, sinCosto], fallo: false, costoSinLeer: [] } }));
  const lucia = entradaDe(vista, 'Lucía Barrios');
  assert.deepEqual(lucia.cuenta.sinCostoAnotado, ['x9'], 'el núcleo sí la marca');
  assert.deepEqual(notasDeTotal(lucia, []), [], 'el total de Q750.00 es completo');
  const ficha = fichaDe('Lucía Barrios', { vista });
  assert.ok(entre(ficha, '<h2>Aún no cierra</h2>', '<h2>Ya pagado</h2>').includes('Sin costo anotado'));
});

test('lectura de CONTRATOS fallida: ninguna cuenta, ninguna cifra, y la barra roja dice por qué', () => {
  for (const contratos of [
    { datos: TODOS, fallo: true, costoSinLeer: [] }, // la nube no contestó: lo local no es confiable
    { datos: null, fallo: true, costoSinLeer: null },
    { datos: null, fallo: false, costoSinLeer: [] }, // no es lista
    { datos: TODOS, fallo: false }, //                 `costoSinLeer` no llegó: no se sabe qué costos faltan
    { datos: TODOS, fallo: false, costoSinLeer: 'm1' },
  ]) {
    const vista = armarVista(lecturaOk({ contratos }));
    assert.equal(vista.ok, false, JSON.stringify(contratos).slice(0, 60));
    assert.deepEqual(vista.problemas, ['contratos']);
    assert.equal(vista.entradas, undefined, 'no hay ni una cuenta que dibujar');
    const html = htmlLista(vista);
    assert.ok(html.includes('barra-lectura-fallida') && html.includes(MENSAJE_FALLO_CONTRATOS));
    assert.ok(!html.includes('<table') && !html.includes('Q0.00') && !/Q\d/.test(html), 'ni una sola cifra');
    assert.ok(!/no (le )?debes nada|al d[ií]a|a mano/i.test(html), 'jamás se dice que está al día');
  }
});

test('lectura de PAGOS fallida (datos null, como la deja cargarPagosDueno): ninguna cuenta — sin ella se pagaría dos veces', () => {
  for (const pagos of [{ datos: null, fallo: true }, { datos: [], fallo: true }, { datos: undefined, fallo: false }]) {
    const vista = armarVista(lecturaOk({ pagos }));
    assert.equal(vista.ok, false);
    assert.deepEqual(vista.problemas, ['pagos']);
    const html = htmlLista(vista);
    assert.ok(html.includes(MENSAJE_FALLO_PAGOS) && !html.includes('<table') && !/Q\d/.test(html));
  }
});

test('las dos lecturas fallidas a la vez dicen las dos cosas, y siempre queda cómo volver a leer', () => {
  const vista = armarVista(lecturaOk({ contratos: { datos: null, fallo: true, costoSinLeer: null }, pagos: { datos: null, fallo: true } }));
  assert.deepEqual(vista.problemas, ['contratos', 'pagos']);
  const html = htmlLista(vista);
  assert.ok(html.includes(MENSAJE_FALLO_CONTRATOS) && html.includes(MENSAJE_FALLO_PAGOS));
  assert.ok(html.includes('data-dn="reintentar"'));
  assert.equal(armarVista({}).ok, false, 'sin nada que mirar tampoco hay cuentas');
  assert.equal(armarVista().ok, false);
});

test('un pago dañado (sin su lista de contratos) no se «arregla»: ninguna cuenta, y la frase no es técnica', () => {
  const dañado = { ...PAGO_A_LUCIA, contratos: undefined };
  const vista = armarVista(lecturaOk({ pagos: { datos: [dañado], fallo: false } }));
  assert.equal(vista.ok, false);
  assert.deepEqual(vista.problemas, ['datos']);
  assert.ok(vista.error instanceof TypeError, 'el error crudo queda para quien depure');
  const html = htmlFallo(vista);
  assert.ok(html.includes(MENSAJE_FALLO_DATOS) && !html.includes('liquidacion:') && !html.includes('TypeError'));
});

test('con la lista de dueños fallida las cuentas SÍ salen (lo que se debe no depende de ella) y la barra roja avisa de los nombres', () => {
  const vista = armarVista(lecturaOk({ duenos: { datos: [], fallo: true } }));
  assert.equal(vista.ok, true);
  assert.equal(vista.falloDuenos, true);
  // Sin el registro, el nombre cae al texto del contrato, y se dice que ese dueño no se encontró.
  const mario = vista.entradas.find((e) => e.duenoId === 'd1');
  assert.equal(mario.nombre, 'Mario López');
  assert.equal(mario.sinRegistro, true);
  assert.equal(mario.cuenta.totalPorPagar, 3000);
  const html = htmlLista(vista);
  assert.ok(html.includes(MENSAJE_FALLO_DUENOS) && html.includes('Q3,000.00'));
  assert.ok(armarVista(lecturaOk()).falloDuenos === false);
  assert.ok(!htmlLista(armarVista(lecturaOk())).includes(MENSAJE_FALLO_DUENOS));
});

test('una lectura buena sin ninguna renta ajena ni dueños dice eso, y solo eso', () => {
  const vista = armarVista({
    contratos: { datos: [], fallo: false, costoSinLeer: [] }, pagos: { datos: [], fallo: false }, duenos: { datos: [], fallo: false },
  });
  assert.equal(vista.ok, true);
  assert.deepEqual(vista.entradas, []);
  assert.ok(htmlLista(vista).includes('Todavía no hay rentas de carros ajenos ni dueños en la lista.'));
});

// ---------------------------------------------------------------------------
// La ficha: tres bloques, en este orden
// ---------------------------------------------------------------------------

test('la ficha trae los tres bloques de §5, en este orden', () => {
  const ficha = fichaDe('Mario López Alvarado');
  const [a, b, c] = ['<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>', '<h2>Ya pagado</h2>'].map((t) => ficha.indexOf(t));
  assert.ok(a > 0 && a < b && b < c);
});

test('Por pagar: una fila con casilla por contrato cerrado sin pagar, con fecha, placas, cliente, días, costo por día y monto', () => {
  const bloque = entre(fichaDe('Mario López Alvarado'), '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.equal((bloque.match(/data-dn="marcar"/g) || []).length, 3, 'm1, m2 y m5');
  const m1 = entre(bloque, 'data-id="m1"', '</tr>');
  for (const texto of ['1 sep 2026', 'P-111AAA', 'Juan Pérez', '4 días', 'Q300.00', 'Q1,200.00']) assert.ok(m1.includes(texto), texto);
  const m2 = entre(bloque, 'data-id="m2"', '</tr>');
  for (const texto of ['5 sep 2026', 'Rosa Díaz', '4 días', '+ 2 de atraso', 'Q300.00', 'Q1,800.00']) assert.ok(m2.includes(texto), texto);
  assert.ok(!entre(bloque, 'data-id="m1"', '</tr>').includes('atraso'), 'sin atraso no se señala nada');
});

test('la casilla de una renta que se puede pagar viene marcada solo si se marcó; las demás, no', () => {
  const ui = uiVacia({ marcados: new Set(['m1']) });
  const bloque = entre(fichaDe('Mario López Alvarado', { ui }), '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(entre(bloque, 'data-dn="marcar" data-id="m1"', '>').includes('checked'));
  assert.ok(!entre(bloque, 'data-dn="marcar" data-id="m2"', '>').includes('checked'));
  assert.ok(!entre(bloque, 'data-dn="marcar" data-id="m5"', '>').includes('checked'));
});

test('Aún no cierra: en gris, SIN casillas, con la razón que dicen estadoContrato y pendientesDe, y sin sumar al total', () => {
  const ficha = fichaDe('Mario López Alvarado');
  const bloque = entre(ficha, '<h2>Aún no cierra</h2>', '<h2>Ya pagado</h2>');
  assert.ok(!bloque.includes('type="checkbox"'), 'ninguna casilla');
  assert.equal((bloque.match(/<tr class="es-fuera[ "]/g) || []).length, 2, 'm3 y m4, en gris');
  assert.ok(bloque.includes('P-333CCC') && bloque.includes('P-444DDD'));
  // La razón sale del núcleo, con las cifras que él mismo calcula.
  assert.equal(pendientesDe(M3).saldo, 1400);
  assert.equal(razonDeNoCierre(M3), 'Saldo pendiente: Q1,400.00.');
  assert.equal(razonDeNoCierre(M4), 'El carro todavía no regresa.');
  assert.equal(razonDeNoCierre(L2), 'Garantía sin liberar: Q5,000.00.');
  assert.ok(bloque.includes('Saldo pendiente: Q1,400.00.') && bloque.includes('El carro todavía no regresa.'));
  assert.ok(!bloque.includes('Q900.00') && !bloque.includes('Q1,200.00'), 'sus montos no se enseñan como si se debieran');
  // El total de la cuenta es el de lo cerrado.
  assert.ok(ficha.includes('Q3,000.00'));
});

test('razonDeNoCierre dice las dos razones juntas cuando hay saldo Y garantía, y nunca inventa otra', () => {
  const ambas = alLeer(recibido(salida({ id: 'z1', garantia: true }), 2));
  const p = pendientesDe(ambas);
  assert.ok(p.saldo > 0 && p.garantia);
  assert.equal(razonDeNoCierre(ambas), `Saldo pendiente: Q${p.saldo.toLocaleString('es-GT', { minimumFractionDigits: 2 })}. Garantía sin liberar: Q5,000.00.`);
  // Lo que cierra no tiene razón de no cerrar: cae en la frase de respaldo.
  assert.equal(razonDeNoCierre(M1), 'Todavía no cierra.');
});

test('Ya pagado: cada pago con su comprobante, fecha, forma, monto y las rentas que cubrió', () => {
  const bloque = entre(fichaDe('Lucía Barrios'), '<h2>Ya pagado</h2>');
  for (const texto of ['Comprobante N.° 3', '20 sep 2026', 'Transferencia', 'Q1,250.00', 'P-CCC333', 'Juan Pérez', 'data-dn="comprobante"', 'data-id="pg-lucia"']) {
    assert.ok(bloque.includes(texto), texto);
  }
  assert.ok(!bloque.includes('P-AAA111'), 'solo la renta que ese pago cubrió');
  assert.ok(entre(fichaDe('Mario López Alvarado'), '<h2>Ya pagado</h2>').includes('Todavía no se le ha pagado nada.'));
});

test('los pagos de una cuenta se reconocen por las rentas que cubren, no por duenoId: sobreviven a un enlace posterior', () => {
  const vista = armarVista(lecturaOk());
  const lucia = entradaDe(vista, 'Lucía Barrios');
  assert.deepEqual(pagosDeLaCuenta(lucia, [PAGO_A_LUCIA]).map((p) => p.id), ['pg-lucia']);
  assert.deepEqual(pagosDeLaCuenta(entradaDe(vista, 'Mario López Alvarado'), [PAGO_A_LUCIA]), []);
  // Un pago hecho cuando el grupo todavía era un texto (duenoId null) sigue siendo suyo.
  const viejo = { ...PAGO_A_LUCIA, duenoId: null };
  assert.equal(pagosDeLaCuenta(lucia, [viejo]).length, 1);
  // El más reciente primero.
  const otro = { ...PAGO_A_LUCIA, id: 'pg-2', fecha: '2026-10-01', numero: 4 };
  assert.deepEqual(pagosDeLaCuenta(lucia, [PAGO_A_LUCIA, otro]).map((p) => p.id), ['pg-2', 'pg-lucia']);
  assert.deepEqual(pagosDeLaCuenta(lucia, null), [], 'una lista que no llegó no revienta aquí: ya se rechazó arriba');
});

test('los contratos viejos sin enlazar ofrecen enlazarlos a un dueño de la lista, o darlo de alta; los enlazados no', () => {
  const don = fichaDe('Don Mario');
  assert.ok(don.includes('data-dn="enlazar"') && don.includes('data-dn="crear-y-enlazar"'));
  assert.ok(don.includes('Dar de alta a «Don Mario» y enlazar'));
  const opciones = entre(don, '<select id="dn-enlazar-dueno"', '</select>');
  assert.deepEqual([...opciones.matchAll(/value="([^"]*)"/g)].map((m) => m[1]), ['', 'd2', 'd1', 'd3'], 'la lista, por nombre');
  assert.ok(!fichaDe('Mario López Alvarado').includes('data-dn="enlazar"'));
  assert.ok(!fichaDe('Lucía Barrios').includes('Contratos sin enlazar'));
});

test('la ficha de un dueño de la lista muestra su teléfono y NIT, y cómo editarlo', () => {
  const ficha = fichaDe('Mario López Alvarado');
  assert.ok(ficha.includes('5555-1111') && ficha.includes('NIT 1234567-8'));
  assert.ok(ficha.includes('href="#/dinero/duenos/d1"'));
  assert.ok(!fichaDe('Don Mario').includes('Editar dueño'));
});

// ---------------------------------------------------------------------------
// Lo marcado se suma a la vista, y lo que se ve es lo que se guarda
// ---------------------------------------------------------------------------

test('marcar casillas suma exacto, y el total que se ve es el mismo que arma construirPagoDueno', () => {
  const vista = armarVista(lecturaOk());
  const mario = entradaDe(vista, 'Mario López Alvarado');
  assert.deepEqual(resumenDeMarcadas(mario, new Set(), []), { ids: [], cuantas: 0, total: 0 });
  assert.deepEqual(resumenDeMarcadas(mario, new Set(['m1']), []), { ids: ['m1'], cuantas: 1, total: 1200 });
  assert.deepEqual(resumenDeMarcadas(mario, new Set(['m1', 'm2']), []), { ids: ['m1', 'm2'], cuantas: 2, total: 3000 });
  // Todas las combinaciones de lo que se puede marcar: lo que se ve es lo que se guarda.
  const marcables = ['m1', 'm2'];
  for (let mascara = 0; mascara < 2 ** marcables.length; mascara += 1) {
    const ids = marcables.filter((_, i) => mascara & (1 << i));
    const visto = resumenDeMarcadas(mario, new Set(ids), []);
    const pago = construirPagoDueno({
      duenoId: 'd1', fecha: HOY, forma: 'efectivo', contratos: mario.contratos, pagos: [PAGO_A_LUCIA], idsMarcados: visto.ids, costoSinLeer: [],
    });
    assert.equal(visto.total, pago.monto, JSON.stringify(ids));
    assert.deepEqual(visto.ids, pago.contratos);
  }
});

test('lo que no se puede pagar nunca entra a lo marcado: ni lo que no cierra, ni lo ya pagado, ni lo sin costo', () => {
  const vista = armarVista(lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: ['m2'] } }));
  const mario = entradaDe(vista, 'Mario López Alvarado');
  const todo = new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'l3', 'nada']);
  assert.deepEqual(resumenDeMarcadas(mario, todo, vista.costoSinLeer), { ids: ['m1'], cuantas: 1, total: 1200 });
  assert.equal(resumenDeMarcadas(mario, undefined, []).cuantas, 0);
  assert.equal(resumenDeMarcadas(mario, new Set(['m3']), []).total, 0, 'una renta que no cierra no suma aunque se marque');
});

test('la casilla de una renta sin costo (anotado o legible) está deshabilitada, con su motivo; las demás no', () => {
  const lectura = lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: ['m2'] } });
  const bloque = entre(fichaDe('Mario López Alvarado', { vista: armarVista(lectura), lectura }), '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  const caja = (id) => entre(bloque, `data-dn="marcar" data-id="${id}"`, '>');
  assert.ok(!caja('m1').includes('disabled'));
  assert.ok(caja('m2').includes('disabled') && caja('m2').includes('title='));
  assert.ok(caja('m5').includes('disabled'));
});

test('la ficha enseña el total marcado debajo de la tabla, en su propio lugar, ya sumado', () => {
  const ui = uiVacia({ marcados: new Set(['m1', 'm2']) });
  const ficha = fichaDe('Mario López Alvarado', { ui });
  const tabla = ficha.indexOf('</table>');
  assert.ok(ficha.indexOf('id="dn-total-marcado"') > tabla, 'debajo de la tabla');
  assert.match(ficha, /id="dn-marcadas">2</);
  assert.match(ficha, /id="dn-total-marcado"[^>]*>Q3,000\.00</);
  assert.match(fichaDe('Mario López Alvarado'), /id="dn-total-marcado"[^>]*>Q0\.00</, 'sin nada marcado: Q0.00');
  assert.doesNotMatch(entre(ficha, 'id="dn-registrar"', '>'), /disabled/, 'con algo marcado se puede registrar');
  assert.match(fichaDe('Mario López Alvarado'), /id="dn-registrar"[^>]*disabled/, 'sin nada marcado no');
});

test('con rentas sin costo, la ficha pone la barra roja arriba de la tabla y marca «incompleto» el total de la cuenta', () => {
  const ficha = fichaDe('Mario López Alvarado');
  const bloque = entre(ficha, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(bloque.indexOf('barra-lectura-fallida') < bloque.indexOf('<table'));
  assert.ok(bloque.includes('Falta anotar el costo de 1 renta: este total es menor al real.'));
  assert.ok(bloque.includes('incompleto'));
  const limpia = entre(fichaDe('Lucía Barrios'), '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(!limpia.includes('barra-lectura-fallida') && !limpia.includes('incompleto'));
});

test('el formulario del pago: forma (efectivo, transferencia, cheque) y fecha que arranca en hoy', () => {
  assert.deepEqual(FORMAS_DE_PAGO.map((f) => f.valor), ['efectivo', 'transferencia', 'cheque']);
  const ui = uiVacia({ marcados: new Set(['m1']), pagando: true });
  const form = entre(fichaDe('Mario López Alvarado', { ui }), 'id="dn-pago-form"', '</section>');
  assert.ok(form.includes('id="dn-forma"') && form.includes('value="transferencia"') && form.includes('value="cheque"'));
  assert.ok(form.includes(`id="dn-fecha" value="${HOY}"`));
  assert.ok(form.includes('Guardar pago de Q1,200.00'));
  assert.doesNotMatch(entre(form, 'id="dn-guardar-pago"', '>'), /disabled/);
  const vacio = entre(fichaDe('Mario López Alvarado', { ui: uiVacia({ pagando: true }) }), 'id="dn-pago-form"', '</section>');
  assert.match(entre(vacio, 'id="dn-guardar-pago"', '>'), /disabled/, 'sin nada marcado no se guarda');
  assert.ok(!fichaDe('Mario López Alvarado').includes('id="dn-pago-form"'), 'cerrado hasta que se aprieta Registrar pago');
});

test('«Ver comprobante»: lo que la ficha le entrega a comprobante.js es lo que ese módulo necesita, y el papel sale con las cifras de la ficha', () => {
  const vista = armarVista(lecturaOk());
  const lucia = entradaDe(vista, 'Lucía Barrios');
  const entrada = entradaDelComprobante({ entrada: lucia, pago: PAGO_A_LUCIA, lectura: lecturaOk(), hoy: HOY });
  assert.deepEqual(Object.keys(entrada).sort(), ['contratos', 'costoSinLeer', 'dueno', 'hoy', 'pago', 'pagos']);
  const papel = armarComprobante(entrada);
  assert.equal(papel.numero, 3);
  assert.equal(papel.dueno.nombre, 'Lucía Barrios');
  assert.equal(papel.pagado.total, 1250);
  assert.deepEqual(papel.pagado.filas.map((f) => f.placas), ['P-CCC333']);
  // Lo que queda pendiente en el papel es lo mismo que la ficha enseña como por pagar.
  assert.deepEqual(papel.pendiente.filas.map((f) => f.placas).sort(), ['P-AAA111']);
  assert.equal(papel.pendiente.total, lucia.cuenta.totalPorPagar);
});

test('«Ver comprobante» de un pago a contratos viejos (sin dueño de la lista): el papel usa el nombre escrito a mano y deja teléfono y NIT en blanco', () => {
  const pagoViejo = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: null, fecha: '2026-10-01', forma: 'cheque', contratos: [T1], pagos: [], idsMarcados: ['t1'] }),
    { id: 'pg-viejo', numero: 8, ahora: AHORA },
  );
  const lectura = lecturaOk({ pagos: { datos: [PAGO_A_LUCIA, pagoViejo], fallo: false } });
  const don = entradaDe(armarVista(lectura), 'Don Mario');
  assert.equal(don.registro, null);
  const papel = armarComprobante(entradaDelComprobante({ entrada: don, pago: pagoViejo, lectura, hoy: HOY }));
  assert.equal(papel.dueno.nombre, 'Don Mario');
  assert.equal(papel.dueno.telefono, '');
  assert.equal(papel.pagado.total, 400);
});

// ---------------------------------------------------------------------------
// La salida: anotar el costo que falta
// ---------------------------------------------------------------------------

test('una renta sin costo anotado ofrece «Anotar costo» en su fila, y la que no se pudo leer NO (escribir encima pisaría el costo real)', () => {
  const lectura = lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: ['m2'] } });
  const bloque = entre(fichaDe('Mario López Alvarado', { vista: armarVista(lectura), lectura }), '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(entre(bloque, 'data-id="m5"', '</tr>').includes('data-dn="anotar-costo"'));
  const m2 = entre(bloque, 'data-id="m2"', '</tr>');
  assert.ok(!m2.includes('anotar-costo') && m2.includes('No se pudo leer'));
  assert.ok(!entre(bloque, 'data-id="m1"', '</tr>').includes('anotar-costo'));
  // Y nunca se dibuja «Q0.00» como si fuera un costo de verdad.
  assert.ok(!entre(bloque, 'data-id="m5"', '</tr>').includes('Q0.00'));
});

// El traslape es el caso NORMAL, no un borde: un contrato ya migrado cuyo privado/dinero no
// se pudo leer llega con costo 0 (por eso `cuentaDeDueno` lo apunta como sin costo anotado)
// Y su id está en `costoSinLeer`, o sea en las dos listas a la vez. La revisión de la Tarea 8
// intercambió las dos líneas de `estadoDeCosto` y las 825 pruebas siguieron en verde, porque
// ninguna sembraba un contrato que estuviera en las dos. Esta sí: si alguien vuelve a
// preguntar por «sin anotar» antes que por «sin leer», la fila ofrece anotar un costo que
// quizá ya existe.
const M6 = sigueAfuera('m6', { numero: 16, placas: 'P-666FFF', costoDia: 0 }); // aún no cierra, sin costo
const TODOS_Y_M6 = [...TODOS, M6];

test('una renta en las DOS listas (sin costo anotado Y costo sin leer) es «sin leer»: no ofrece anotar, en ninguno de los dos bloques', () => {
  const lectura = lecturaOk({ contratos: { datos: TODOS_Y_M6, fallo: false, costoSinLeer: ['m5', 'm6'] } });
  const vista = armarVista(lectura);
  const cuenta = entradaDe(vista, 'Mario López Alvarado').cuenta;
  for (const id of ['m5', 'm6']) {
    assert.ok(cuenta.sinCostoAnotado.includes(id), `${id} está en sinCostoAnotado`);
    assert.ok(vista.costoSinLeer.includes(id), `${id} está en costoSinLeer`);
  }
  assert.equal(estadoDeCosto(M5, cuenta, ['m5']), 'sin-leer');
  assert.equal(estadoDeCosto(M6, cuenta, ['m6']), 'sin-leer');
  assert.equal(estadoDeCosto(M5, cuenta, []), 'sin-anotar', 'y sin el aviso de lectura, la misma renta sí es «sin anotar»');

  const ficha = fichaDe('Mario López Alvarado', { vista, lectura });
  for (const id of ['m5', 'm6']) {
    const fila = entre(ficha, `data-id="${id}"`, '</tr>');
    assert.ok(fila.includes('No se pudo leer'), `${id} dice que no se pudo leer`);
    assert.ok(!fila.includes('anotar-costo') && !fila.includes('Anotar costo') && !fila.includes('Sin costo anotado'), `${id} no ofrece anotar`);
    assert.ok(!fila.includes('dn-costo-input'), `${id} no abre el campo, ni siquiera con ui.anotando`);
  }
  // Aunque la pantalla quedara con el campo abierto de antes, una renta sin leer no lo dibuja.
  const abierta = fichaDe('Mario López Alvarado', { vista, lectura, ui: uiVacia({ anotando: 'm5' }) });
  assert.ok(!entre(abierta, 'data-id="m5"', '</tr>').includes('dn-costo-input'));
  // La nota de arriba también es la de «no se pudo leer», no la de «falta anotar».
  assert.deepEqual(notasDeTotal(entradaDe(vista, 'Mario López Alvarado'), vista.costoSinLeer), [
    'No se pudo leer el costo de 1 renta: este total puede no ser el real.',
  ]);
});

test('al anotar, la fila se vuelve un campo con Guardar y Cancelar', () => {
  const ui = uiVacia({ anotando: 'm5' });
  const fila = entre(fichaDe('Mario López Alvarado', { ui }), 'data-id="m5"', '</tr>');
  assert.ok(fila.includes('id="dn-costo-input"') && fila.includes('data-dn="guardar-costo"') && fila.includes('data-dn="cancelar-costo"'));
  assert.ok(!fila.includes('data-dn="anotar-costo"'));
});

test('LA SALIDA COMPLETA: una renta atorada sin costo se paga después de anotarle el costo (la ficha, el puente y construirPagoDueno)', async () => {
  const vista = armarVista(lecturaOk());
  const mario = entradaDe(vista, 'Mario López Alvarado');
  // Antes: no se puede pagar, y la pantalla no deja ni marcarla.
  assert.throws(
    () => construirPagoDueno({ duenoId: 'd1', fecha: HOY, forma: 'efectivo', contratos: mario.contratos, pagos: [], idsMarcados: ['m5'], costoSinLeer: [] }),
    /no tiene costo por día anotado/,
  );
  // Se anota con la credencial de dinero, en privado/dinero.
  const nube = nubeMini({ docs: { 'contratos/m5': { ajeno: true, subarriendo: { costoDia: 0 }, carroAjeno: { costoDia: 0, dueno: 'Mario López' } } } });
  const costo = await anotarCostoDelDueno(M5, '350', { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  assert.equal(costo, 350);
  assert.deepEqual(nube.docs.get('contratos/m5/privado/dinero'), { costoDia: 350 });
  // La pantalla pone el costo en memoria con el mismo puente que usa la lectura.
  const despues = lecturaOk({ contratos: { datos: TODOS.map((c) => (c.id === 'm5' ? conCostoDelDueno(c, costo) : c)), fallo: false, costoSinLeer: [] } });
  const vistaDespues = armarVista(despues);
  const marioDespues = entradaDe(vistaDespues, 'Mario López Alvarado');
  assert.deepEqual(marioDespues.cuenta.sinCostoAnotado, [], 'ya no está sin costo');
  assert.equal(marioDespues.cuenta.totalPorPagar, 1200 + 1800 + 1400, 'm5: 4 × 350 = 1,400 ya suma');
  assert.deepEqual(notasDeTotal(marioDespues, []), [], 'y el total ya no está corto');
  const pago = construirPagoDueno({
    duenoId: 'd1', fecha: HOY, forma: 'efectivo', contratos: marioDespues.contratos, pagos: [], idsMarcados: ['m5'], costoSinLeer: [],
  });
  assert.equal(pago.monto, 1400);
  assert.deepEqual(pago.contratos, ['m5']);
  assert.equal(resumenDeMarcadas(marioDespues, new Set(['m5']), []).total, 1400, 'y ya se puede marcar');
});

// ---------------------------------------------------------------------------
// Una Firestore de mentira, mínima: lo que importa de la de verdad para
// `anotarCostoDelDueno`, `enlazarContratosAlDueno` y `guardarPagoDueno`.
// ---------------------------------------------------------------------------

const BORRAR = Symbol('deleteField');

/** `deleteField()` y los caminos 'a.b' de `updateDoc`, como en Firestore. */
function aplicarCambios(documento, cambios) {
  for (const [camino, valor] of Object.entries(cambios)) {
    const partes = camino.split('.');
    let nodo = documento;
    for (const parte of partes.slice(0, -1)) nodo = nodo[parte];
    if (valor === BORRAR) delete nodo[partes.at(-1)];
    else nodo[partes.at(-1)] = structuredClone(valor);
  }
}

function nubeMini({ docs = {}, fallan = [] } = {}) {
  const almacen = new Map(Object.entries(docs).map(([ruta, datos]) => [ruta, structuredClone(datos)]));
  const llamadas = [];
  // Las lecturas van aparte: `llamadas` son las ESCRITURAS, y varias pruebas cuentan solo esas.
  const lecturas = [];
  const lotes = [];
  const dbDinero = { nombre: 'dinero' };
  const dbMostrador = { nombre: 'mostrador' };
  const falla = (op) => { if (fallan.includes(op)) throw new Error('sin internet'); };
  const fsMod = {
    collection: (db, nombre) => ({ coleccion: nombre, db }),
    doc: (origen, ...segmentos) => (origen.coleccion
      ? { ruta: `${origen.coleccion}/${segmentos[0] ?? 'id-nuevo'}`, id: segmentos[0] ?? 'id-nuevo', db: origen.db }
      : { ruta: segmentos.join('/'), id: segmentos.at(-1), db: origen }),
    getDoc: async (ref) => {
      lecturas.push([ref.ruta, ref.db.nombre]);
      falla('getDoc');
      return { exists: () => almacen.has(ref.ruta), data: () => structuredClone(almacen.get(ref.ruta)) };
    },
    setDoc: async (ref, datos, opciones) => {
      llamadas.push(['setDoc', ref.ruta, structuredClone(datos), opciones, ref.db.nombre]);
      falla('setDoc');
      almacen.set(ref.ruta, opciones?.merge && almacen.has(ref.ruta) ? { ...almacen.get(ref.ruta), ...structuredClone(datos) } : structuredClone(datos));
    },
    updateDoc: async (ref, cambios) => {
      llamadas.push(['updateDoc', ref.ruta, Object.keys(cambios), ref.db.nombre]);
      falla('updateDoc');
      if (!almacen.has(ref.ruta)) throw new Error('El documento no existe.');
      aplicarCambios(almacen.get(ref.ruta), cambios);
    },
    deleteField: () => BORRAR,
    writeBatch: (db) => {
      const operaciones = [];
      return {
        update: (ref, cambios) => { operaciones.push([ref, cambios]); },
        commit: async () => {
          falla('commit');
          lotes.push(operaciones.map(([ref, cambios]) => [ref.ruta, structuredClone(cambios), db.nombre]));
          for (const [ref, cambios] of operaciones) {
            if (!almacen.has(ref.ruta)) throw new Error('El documento no existe.');
            aplicarCambios(almacen.get(ref.ruta), cambios);
          }
        },
      };
    },
  };
  return {
    docs: almacen, llamadas, lecturas, lotes, dbDinero, dbMostrador, fsMod, iniciar: async () => ({ db: dbMostrador, fsMod }),
  };
}

// ---------------------------------------------------------------------------
// anotarCostoDelDueno (datos.js): la salida de una renta atorada
// ---------------------------------------------------------------------------

test('anotarCostoDelDueno escribe en contratos/{id}/privado/dinero, con la base de DINERO, y devuelve el costo redondeado', async () => {
  const nube = nubeMini({ docs: { 'contratos/m5': { ajeno: true } } });
  const costo = await anotarCostoDelDueno(M5, '350.004', { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  assert.equal(costo, 350);
  const [primera] = nube.llamadas;
  assert.deepEqual(primera, ['setDoc', 'contratos/m5/privado/dinero', { costoDia: 350 }, { merge: true }, 'dinero']);
});

test('anotarCostoDelDueno se niega, sin escribir nada, ante un costo vacío, en cero, negativo o que no es número', async () => {
  for (const costo of [0, '0', '', '   ', null, undefined, -5, 'abc', NaN, 0.004]) {
    const nube = nubeMini({ docs: { 'contratos/m5': {} } });
    await assert.rejects(
      anotarCostoDelDueno(M5, costo, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }),
      { message: MENSAJE_COSTO_SIN_VALOR },
      `costo ${String(costo)}`,
    );
    assert.equal(nube.llamadas.length, 0, 'no se escribió nada');
  }
});

test('anotarCostoDelDueno sin sesión de dinero se niega y no escribe; con la base del mostrador no hay otra puerta', async () => {
  const nube = nubeMini({ docs: { 'contratos/m5': {} } });
  await assert.rejects(anotarCostoDelDueno(M5, 350, { iniciar: nube.iniciar, dbDinero: () => null }), { message: MENSAJE_COSTO_SIN_DINERO });
  assert.equal(nube.llamadas.length, 0);
  await anotarCostoDelDueno(M5, 350, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  assert.ok(nube.llamadas.every((l) => l.at(-1) === 'dinero'), 'todo va con la credencial de dinero');
});

// ---- El guardia de «no pisar un costo que ya está» (Important 2 de la revisión de la Tarea 8) ----
//
// Antes lo único que impedía pisar un costo real era que la pantalla no dibujara el
// botón «Anotar costo» cuando el costo no se pudo leer — y eso dependía de en qué
// orden preguntaba `estadoDeCosto`. Aquí se prueba que el guardia está donde se
// escribe, y no en lo que la pantalla enseñe.

test('anotarCostoDelDueno NO pisa un costo que ya está en privado, aunque el contrato que le llega diga «sin costo»', async () => {
  // El caso de la revisión: Mario cuesta Q300 por día, guardado detrás de la contraseña. Al abrir
  // la pantalla la nube no contestó ese documento, así que el contrato llegó sin costo (M5: 0)...
  const nube = nubeMini({ docs: { 'contratos/m5': { ajeno: true }, 'contratos/m5/privado/dinero': { costoDia: 300 } } });
  // ...y él escribe lo que recuerda.
  await assert.rejects(
    anotarCostoDelDueno(M5, 250, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }),
    { message: MENSAJE_COSTO_YA_ANOTADO },
  );
  assert.equal(nube.llamadas.length, 0, 'no se escribió NADA: ni el privado ni el documento');
  assert.deepEqual(nube.docs.get('contratos/m5/privado/dinero'), { costoDia: 300 }, 'el costo que negoció sigue ahí');
  assert.deepEqual(nube.lecturas, [['contratos/m5/privado/dinero', 'dinero']], 'lo comprobó con la credencial de dinero');
});

test('anotarCostoDelDueno, si no puede comprobar qué hay en privado, tampoco escribe: «no se pudo leer» no es «no hay nada»', async () => {
  const nube = nubeMini({ docs: { 'contratos/m5/privado/dinero': { costoDia: 300 } }, fallan: ['getDoc'] });
  await assert.rejects(
    anotarCostoDelDueno(M5, 250, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }),
    { message: MENSAJE_COSTO_SIN_COMPROBAR },
  );
  assert.equal(nube.llamadas.length, 0);
  assert.deepEqual(nube.docs.get('contratos/m5/privado/dinero'), { costoDia: 300 });
});

test('anotarCostoDelDueno no pisa el costo que el contrato YA trae, y ni siquiera va a la nube a comprobarlo', async () => {
  const nube = nubeMini({ docs: { 'contratos/m1': {} } });
  assert.equal(costoDelDocumento(M1), 300, 'el escenario: m1 ya trae su costo');
  await assert.rejects(
    anotarCostoDelDueno(M1, 250, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }),
    { message: MENSAJE_COSTO_YA_ANOTADO },
  );
  assert.equal(nube.llamadas.length, 0);
  assert.equal(nube.lecturas.length, 0);
});

test('un costo en privado que es 0 no es un costo: la renta migrada con costo 0 sí se puede anotar (es la salida de la renta atorada)', async () => {
  const nube = nubeMini({ docs: { 'contratos/m5': { ajeno: true }, 'contratos/m5/privado/dinero': { costoDia: 0 } } });
  assert.equal(await anotarCostoDelDueno(M5, 350, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }), 350);
  assert.deepEqual(nube.docs.get('contratos/m5/privado/dinero'), { costoDia: 350 });
});

test('las dos frases del guardia son nuestras: pasan tal cual a la pantalla, y dicen qué hacer', () => {
  for (const frase of [MENSAJE_COSTO_YA_ANOTADO, MENSAJE_COSTO_SIN_COMPROBAR]) {
    assert.equal(mensajeSeguro(new Error(frase), 'respaldo'), frase);
    assert.ok(!/correo|e-?mail|usuario/i.test(frase));
  }
  assert.notEqual(MENSAJE_COSTO_YA_ANOTADO, MENSAJE_COSTO_SIN_COMPROBAR);
});

test('anotarCostoDelDueno solo acepta contratos de carro ajeno que ya tengan id', async () => {
  const nube = nubeMini();
  const propio = { ...M1, ajeno: false };
  for (const contrato of [propio, { ...M1, id: undefined }, null, undefined]) {
    await assert.rejects(anotarCostoDelDueno(contrato, 350, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }), /contrato de carro ajeno/);
  }
  assert.equal(nube.llamadas.length, 0);
});

test('anotarCostoDelDueno quita el costo viejo del documento: así la migración no encuentra un «conflicto» que nadie puede resolver', async () => {
  // Un contrato sin migrar: trae su costo viejo (0, justo por lo que está atorado) en las dos llaves.
  const documento0 = { ajeno: true, subarriendo: { costoDia: 0 }, carroAjeno: { costoDia: 0, dueno: 'Mario López' }, pagos: [{ monto: 2800 }] };
  const nube = nubeMini({ docs: { 'contratos/m5': documento0 } });
  // Tal como lo entrega la lectura del área de dinero: el documento de la nube con el puente puesto.
  const sinMigrar = conCostoDelDueno({ id: 'm5', ...structuredClone(documento0) }, undefined);
  await anotarCostoDelDueno(sinMigrar, 350, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  assert.deepEqual(nube.docs.get('contratos/m5/privado/dinero'), { costoDia: 350 });
  const documento = nube.docs.get('contratos/m5');
  assert.equal(JSON.stringify(documento).includes('costoDia'), false, 'el documento ya no trae ningún costo');
  assert.equal(documento.carroAjeno.dueno, 'Mario López', 'lo demás no se toca');
  assert.deepEqual(documento.pagos, [{ monto: 2800 }]);
  // Y privado se escribió ANTES: si lo segundo fallara, el costo ya está a salvo.
  assert.deepEqual(nube.llamadas.map((l) => l[0]), ['setDoc', 'updateDoc']);
});

test('si quitar el costo viejo del documento falla, el costo SÍ quedó anotado: no se presenta como un fallo', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const nube = nubeMini({ docs: { 'contratos/m5': { subarriendo: { costoDia: 0 } } }, fallan: ['updateDoc'] });
  const costo = await anotarCostoDelDueno(M5, 350, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });
  assert.equal(costo, 350);
  assert.deepEqual(nube.docs.get('contratos/m5/privado/dinero'), { costoDia: 350 });
  assert.equal(console.warn.mock.callCount(), 1, 'queda registrado para quien depure');
});

test('si escribir en privado falla, el fallo sale tal cual (no se finge que se anotó) y no se toca el documento', async () => {
  const nube = nubeMini({ docs: { 'contratos/m5': { subarriendo: { costoDia: 0 } } }, fallan: ['setDoc'] });
  await assert.rejects(anotarCostoDelDueno(M5, 350, { iniciar: nube.iniciar, dbDinero: () => nube.dbDinero }), /sin internet/);
  assert.deepEqual(nube.llamadas.map((l) => l[0]), ['setDoc']);
  assert.equal(nube.docs.get('contratos/m5').subarriendo.costoDia, 0);
});

// ---------------------------------------------------------------------------
// enlazarContratosAlDueno (datos.js): la salida del grupo «sin enlazar»
// ---------------------------------------------------------------------------

test('enlazarContratosAlDueno escribe SOLO duenoId y actualizado en cada contrato, y no toca el resto (los abonos no se pisan)', async () => {
  const nube = nubeMini({
    docs: {
      'contratos/t1': { ajeno: true, carroAjeno: { dueno: 'Don Mario' }, pagos: [{ monto: 2800 }], actualizado: 5 },
      'contratos/t2': { ajeno: true, carroAjeno: { dueno: 'Don Mario' }, pagos: [], actualizado: 5 },
    },
  });
  const ids = await enlazarContratosAlDueno(['t1', 't2'], 'd1', { iniciar: nube.iniciar, ahora: AHORA });
  assert.deepEqual(ids, ['t1', 't2']);
  assert.deepEqual(nube.lotes, [[
    ['contratos/t1', { duenoId: 'd1', actualizado: AHORA }, 'mostrador'],
    ['contratos/t2', { duenoId: 'd1', actualizado: AHORA }, 'mostrador'],
  ]]);
  const t1 = nube.docs.get('contratos/t1');
  assert.equal(t1.duenoId, 'd1');
  assert.equal(t1.carroAjeno.dueno, 'Don Mario', 'el texto original se conserva');
  assert.deepEqual(t1.pagos, [{ monto: 2800 }]);
});

test('enlazarContratosAlDueno quita repetidos y vacíos, y se niega sin dueño o sin contratos', async () => {
  const nube = nubeMini({ docs: { 'contratos/t1': {} } });
  assert.deepEqual(await enlazarContratosAlDueno(['t1', 't1', '', null], 'd1', { iniciar: nube.iniciar }), ['t1']);
  await assert.rejects(enlazarContratosAlDueno(['t1'], '', { iniciar: nube.iniciar }), /escoger a qué dueño/);
  await assert.rejects(enlazarContratosAlDueno(['t1'], null, { iniciar: nube.iniciar }), /escoger a qué dueño/);
  await assert.rejects(enlazarContratosAlDueno([], 'd1', { iniciar: nube.iniciar }), /No hay contratos/);
  await assert.rejects(enlazarContratosAlDueno(undefined, 'd1', { iniciar: nube.iniciar }), /No hay contratos/);
});

test('enlazarContratosAlDueno va en lotes de 400: nunca pasa el máximo de Firestore', async () => {
  const docs = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`contratos/c${i}`, {}]));
  const nube = nubeMini({ docs });
  await enlazarContratosAlDueno(Array.from({ length: 401 }, (_, i) => `c${i}`), 'd1', { iniciar: nube.iniciar });
  assert.deepEqual(nube.lotes.map((l) => l.length), [400, 1]);
});

test('enlazarContratosAlDueno con un contrato que ya no existe falla entero, sin crear uno vacío, y repetirlo no daña', async () => {
  const nube = nubeMini({ docs: { 'contratos/t1': {} } });
  await assert.rejects(enlazarContratosAlDueno(['t1', 'fantasma'], 'd1', { iniciar: nube.iniciar }), /no existe/);
  assert.equal(nube.docs.has('contratos/fantasma'), false);
  await enlazarContratosAlDueno(['t1'], 'd1', { iniciar: nube.iniciar });
  await enlazarContratosAlDueno(['t1'], 'd1', { iniciar: nube.iniciar });
  assert.equal(nube.docs.get('contratos/t1').duenoId, 'd1');
});

test('después de enlazar, el grupo escrito a mano pasa a ser del dueño de la lista y se junta con sus rentas', () => {
  // Lo que hace la pantalla en memoria tras `enlazarContratosAlDueno`.
  const enlazados = new Set(['t1']);
  const contratos = TODOS.map((c) => (enlazados.has(c.id) ? { ...c, duenoId: 'd1' } : c));
  const vista = armarVista(lecturaOk({ contratos: { datos: contratos, fallo: false, costoSinLeer: [] } }));
  assert.equal(entradaDe(vista, 'Don Mario'), undefined, 'el grupo del texto ya no existe');
  const mario = vista.entradas.find((e) => e.duenoId === 'd1');
  assert.equal(mario.cuenta.totalPorPagar, 3000 + 400, 'sus rentas se suman a las del dueño de la lista');
  assert.equal(mario.clave, 'id:d1');
});

// ---------------------------------------------------------------------------
// Registrar el pago
// ---------------------------------------------------------------------------

// `contratos` son los que la nube trae AHORA, al momento de guardar (por omisión,
// los mismos que la pantalla leyó al abrir); `costoSinLeer` son los que no se pudieron leer.
function depsDePago({
  pagos = [PAGO_A_LUCIA], contratos = TODOS, costoSinLeer = [], fallaLectura = false, fallaContratos = null, fallaGuardar = 0,
} = {}) {
  const orden = [];
  let ids = 0;
  let numeros = 100;
  let intentosFallidos = 0;
  return {
    orden,
    leerPagos: async () => { orden.push('leer'); return fallaLectura ? { datos: null, fallo: true } : { datos: structuredClone(pagos), fallo: false }; },
    leerContratos: async () => {
      orden.push('leerContratos');
      if (fallaContratos === 'lanza') throw new Error('sin internet');
      if (fallaContratos === 'fallo') return { datos: structuredClone(contratos), fallo: true, costoSinLeer: [] };
      if (fallaContratos === 'sin-lista') return { datos: structuredClone(contratos), fallo: false, costoSinLeer: null };
      return { datos: structuredClone(contratos), fallo: false, costoSinLeer };
    },
    nuevoId: async () => { orden.push('id'); ids += 1; return `pago-${ids}`; },
    nuevoNumero: async () => { orden.push('numero'); numeros += 1; return numeros; },
    guardar: async (pago) => {
      orden.push(['guardar', pago.id, pago.numero]);
      if (intentosFallidos < fallaGuardar) { intentosFallidos += 1; throw new Error('sin internet'); }
      return { ...pago, actualizado: AHORA };
    },
  };
}

const mario = () => entradaDe(armarVista(lecturaOk()), 'Mario López Alvarado');
const registrar = (deps, cambios = {}) => registrarElPago({
  entrada: mario(), idsMarcados: ['m1', 'm2'], forma: 'efectivo', fecha: HOY, enCurso: {}, ...deps, ...cambios,
});

test('registrar el pago: lee los pagos y los contratos, arma el pago con la misma suma que se ve, pide id y número y guarda', async () => {
  const deps = depsDePago();
  const r = await registrar(deps);
  assert.equal(r.tipo, 'guardado');
  assert.deepEqual(deps.orden, ['leer', 'leerContratos', 'id', 'numero', ['guardar', 'pago-1', 101]]);
  assert.equal(r.pago.monto, 3000);
  assert.deepEqual(r.pago.contratos, ['m1', 'm2']);
  assert.equal(r.pago.duenoId, 'd1');
  assert.equal(r.pago.fecha, HOY);
  assert.equal(r.pago.forma, 'efectivo');
  assert.equal(r.pago.numero, 101);
  assert.deepEqual(r.pagos.map((p) => p.id), ['pg-lucia', 'pago-1'], 'la lista queda al día, con el pago nuevo');
  assert.deepEqual(r.contratos.datos.map((c) => c.id), TODOS.map((c) => c.id), 'y los contratos que se leyeron al guardar, para que la pantalla los tome como la nueva verdad');
});

test('un pago a un grupo de contratos viejos (sin dueño de la lista) se guarda con duenoId null, no undefined', async () => {
  const don = entradaDe(armarVista(lecturaOk()), 'Don Mario');
  const r = await registrar(depsDePago(), { entrada: don, idsMarcados: ['t1'] });
  assert.equal(r.pago.duenoId, null);
  assert.equal(r.pago.monto, 400);
});

test('REINTENTO: tras un fallo, el mismo pago usa el MISMO id y el MISMO número — no hay un segundo comprobante', async () => {
  const deps = depsDePago({ fallaGuardar: 1 });
  const enCurso = {};
  await assert.rejects(registrar(deps, { enCurso }), /sin internet/);
  assert.deepEqual(enCurso, { id: 'pago-1', numero: 101 }, 'quedaron conservados');
  const r = await registrar(deps, { enCurso });
  assert.equal(r.tipo, 'guardado');
  assert.deepEqual(deps.orden.filter((o) => o === 'id' || o === 'numero'), ['id', 'numero'], 'se pidieron UNA sola vez');
  assert.deepEqual(deps.orden.filter(Array.isArray), [['guardar', 'pago-1', 101], ['guardar', 'pago-1', 101]]);
});

test('REINTENTO que sí había llegado: si el pago ya está en la nube no se escribe nada, se devuelve ese', async () => {
  const llegado = { ...PAGO_A_LUCIA, id: 'pago-1', numero: 101, contratos: ['m1', 'm2'], duenoId: 'd1', monto: 3000 };
  const deps = depsDePago({ pagos: [PAGO_A_LUCIA, llegado] });
  const r = await registrar(deps, { enCurso: { id: 'pago-1', numero: 101 } });
  assert.equal(r.tipo, 'ya-guardado');
  assert.equal(r.pago.id, 'pago-1');
  assert.deepEqual(deps.orden, ['leer'], 'ni se pidió otro id ni se guardó nada');
});

test('si lo marcado ya no se puede pagar (otra pestaña ya lo pagó), NO se registra un pago recortado: se avisa y se devuelve la lista al día', async () => {
  const deOtraPestana = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd1', fecha: HOY, forma: 'efectivo', contratos: TODOS, pagos: [PAGO_A_LUCIA], idsMarcados: ['m2'] }),
    { id: 'otra', numero: 9, ahora: AHORA },
  );
  const deps = depsDePago({ pagos: [PAGO_A_LUCIA, deOtraPestana] });
  const r = await registrar(deps);
  assert.equal(r.tipo, 'cambio');
  assert.deepEqual(r.pagos.map((p) => p.id), ['pg-lucia', 'otra']);
  assert.deepEqual(deps.orden, ['leer', 'leerContratos'], 'no se gastó ni un id ni un número, ni se guardó nada');
  assert.ok(MENSAJE_PAGO_CAMBIO.includes('No se registró nada'));
});

// El caso hermano del de arriba (Important 1 de la revisión de la Tarea 8): el
// pago ya estaba al día, pero la RENTA no. Antes solo se volvían a leer los pagos;
// los contratos eran la copia que la pantalla leyó al abrir, así que si otra
// pestaña corregía el cierre de una renta marcada mientras el formulario estaba
// abierto, se registraba el pago de una renta que ya no estaba cerrada, con su
// comprobante impreso, sin un solo aviso.
//
// m1 reabierta: el MISMO contrato, con el cierre corregido para que vuelva a tener
// días de atraso y un saldo sin cobrar (lo arman las mismas funciones que arman los reales).
const M1_REABIERTA = devueltoConSaldo('m1', { numero: 11, placas: 'P-111AAA', costoDia: 300 });
// m1 con el cierre corregido y TODAVÍA cerrada (saldada), pero con otro monto: (4 + 2) × 300.
const M1_CON_OTRO_MONTO = cerradoConAtraso('m1', { numero: 11, placas: 'P-111AAA', costoDia: 300 });
const conM1 = (m1) => TODOS.map((c) => (c.id === 'm1' ? m1 : c));

test('el escenario del Important 1: m1 reabierta ya no es pagable, y la que solo cambió de monto sigue cerrada', () => {
  assert.equal(estadoContrato(M1_REABIERTA), 'devuelto');
  assert.equal(estadoContrato(M1_CON_OTRO_MONTO), 'cerrado');
  assert.equal(resumen(M1_CON_OTRO_MONTO).costoSubarriendo, 1800);
});

test('si otra pestaña REABRIÓ una renta marcada, NO se registra el pago: no se escribe nada, y la lista vuelve al día', async () => {
  const deps = depsDePago({ contratos: conM1(M1_REABIERTA) });
  const r = await registrar(deps); // marcó m1 + m2: lo que vio sumaba Q3,000
  assert.equal(r.tipo, 'cambio');
  assert.deepEqual(deps.orden, ['leer', 'leerContratos'], 'no se gastó ni un id ni un número, ni se guardó nada');

  // La pantalla toma lo leído como la nueva verdad: m1 sale de «por pagar» y pasa a «aún no cierra».
  const lectura = lecturaOk({ contratos: r.contratos, pagos: { datos: r.pagos, fallo: false } });
  const fresca = entradaDe(armarVista(lectura), 'Mario López Alvarado');
  assert.deepEqual(fresca.cuenta.porPagar.map((c) => c.id), ['m2', 'm5']);
  assert.deepEqual(fresca.cuenta.aunNoCierra.map((c) => c.id), ['m1', 'm3', 'm4']);
  // Y al volver a marcar, lo marcado suma exactamente lo que sí se puede pagar: solo m2.
  assert.equal(resumenDeMarcadas(fresca, new Set(['m1', 'm2']), r.contratos.costoSinLeer).total, 1800);
  const otra = depsDePago({ contratos: conM1(M1_REABIERTA) });
  const ahora = await registrar(otra, { entrada: fresca, idsMarcados: ['m2'] });
  assert.equal(ahora.tipo, 'guardado');
  assert.equal(ahora.pago.monto, 1800);
  assert.deepEqual(ahora.pago.contratos, ['m2']);
});

test('si otra pestaña le cambió el MONTO a una renta marcada (sigue cerrada), tampoco se registra: él vio un monto y se guardaría otro', async () => {
  const deps = depsDePago({ contratos: conM1(M1_CON_OTRO_MONTO) });
  const r = await registrar(deps); // vio Q1,200 + Q1,800 = Q3,000; ahora serían Q1,800 + Q1,800
  assert.equal(r.tipo, 'cambio');
  assert.deepEqual(deps.orden, ['leer', 'leerContratos']);
  const fresca = entradaDe(armarVista(lecturaOk({ contratos: r.contratos })), 'Mario López Alvarado');
  assert.equal(resumenDeMarcadas(fresca, new Set(['m1', 'm2']), []).total, 3600, 'la lista al día ya lo muestra con el monto nuevo');
});

test('si una renta marcada ya no está en la nube, o la cuenta entera desapareció, tampoco se registra', async () => {
  for (const contratos of [TODOS.filter((c) => c.id !== 'm1'), TODOS.filter((c) => c.duenoId !== 'd1')]) {
    const deps = depsDePago({ contratos });
    const r = await registrar(deps);
    assert.equal(r.tipo, 'cambio');
    assert.deepEqual(deps.orden, ['leer', 'leerContratos']);
  }
});

test('el costo se juzga con la lectura de AHORA: si el costo de una renta marcada ya no se puede leer, no se registra', async () => {
  const deps = depsDePago({ costoSinLeer: ['m2'] });
  await assert.rejects(registrar(deps), /No se pudo leer el costo del contrato N° 12/);
  assert.deepEqual(deps.orden, ['leer', 'leerContratos'], 'ni un número gastado');
});

test('si no se pueden volver a leer los contratos, NO se registra: sin saber si la renta sigue cerrada se podría pagar una que se reabrió', async () => {
  for (const fallaContratos of ['fallo', 'lanza', 'sin-lista']) {
    const deps = depsDePago({ fallaContratos });
    await assert.rejects(registrar(deps), { message: MENSAJE_SIN_COMPROBAR_RENTAS }, fallaContratos);
    assert.deepEqual(deps.orden, ['leer', 'leerContratos'], `${fallaContratos}: no se pidió id ni número, ni se guardó nada`);
  }
  assert.notEqual(MENSAJE_SIN_COMPROBAR_RENTAS, MENSAJE_SIN_COMPROBAR, 'dice otra cosa: no son los pagos lo que no se pudo leer');
  assert.equal(mensajeSeguro(new Error(MENSAJE_SIN_COMPROBAR_RENTAS), 'respaldo'), MENSAJE_SIN_COMPROBAR_RENTAS, 'y se le enseña tal cual');
});

test('un pago que YA llegó a la nube se devuelve sin volver a leer los contratos: no hay nada que comprobar', async () => {
  const llegado = { ...PAGO_A_LUCIA, id: 'pago-1', numero: 101, contratos: ['m1', 'm2'], duenoId: 'd1', monto: 3000 };
  const deps = depsDePago({ pagos: [PAGO_A_LUCIA, llegado], fallaContratos: 'lanza' });
  const r = await registrar(deps, { enCurso: { id: 'pago-1', numero: 101 } });
  assert.equal(r.tipo, 'ya-guardado');
  assert.deepEqual(deps.orden, ['leer']);
});

test('si no se pueden leer los pagos antes de escribir, NO se registra: sin saber qué ya se pagó se podría pagar dos veces', async () => {
  const deps = depsDePago({ fallaLectura: true });
  await assert.rejects(registrar(deps), { message: MENSAJE_SIN_COMPROBAR });
  assert.deepEqual(deps.orden, ['leer']);
});

test('una renta sin costo legible no se paga, con la frase de datos.js, y no se gasta ni un número', async () => {
  const deps = depsDePago();
  await assert.rejects(registrar(deps, { idsMarcados: ['m1', 'm5'] }), /^Error: No se registró el pago\. El contrato N° 15 no tiene costo por día anotado/);
  assert.deepEqual(deps.orden, ['leer', 'leerContratos']);
  // «Sin leer» es lo que dice la lectura de AHORA, no la que se hizo al abrir la pantalla.
  const sinLeer = depsDePago({ costoSinLeer: ['m1'] });
  await assert.rejects(registrar(sinLeer, { idsMarcados: ['m1'] }), /No se pudo leer el costo del contrato N° 11/);
  assert.deepEqual(sinLeer.orden, ['leer', 'leerContratos']);
});

test('sin ninguna renta marcada se niega antes de leer nada', async () => {
  const deps = depsDePago();
  await assert.rejects(registrar(deps, { idsMarcados: [] }), { message: MENSAJE_PAGO_SIN_RENTAS });
  assert.deepEqual(deps.orden, []);
});

test('de punta a punta con guardarPagoDueno de verdad: el mismo pago reintentado deja UN solo documento y UN solo número', async () => {
  const docs = new Map();
  let intentos = 0;
  let numerosGastados = 0;
  const fsMod = {
    collection: (db, nombre) => ({ coleccion: nombre }),
    doc: (db, coleccion, id) => ({ ruta: `${coleccion}/${id}`, id }),
    setDoc: async (ref, datos) => {
      intentos += 1;
      if (intentos === 1) throw new Error('sin internet');
      docs.set(ref.ruta, structuredClone(datos));
    },
  };
  const entorno = { iniciar: async () => ({ db: {}, fsMod }), dbDinero: () => ({ esDinero: true }) };
  // Como lo cablea la pantalla: el id sale de nuevoIdPagoDueno, el número de un contador.
  const enCurso = {};
  const hacer = () => registrarElPago({
    entrada: mario(),
    idsMarcados: ['m1', 'm2'],
    forma: 'transferencia',
    fecha: HOY,
    enCurso,
    leerPagos: async () => ({ datos: [PAGO_A_LUCIA, ...[...docs.values()]], fallo: false }),
    leerContratos: async () => ({ datos: TODOS, fallo: false, costoSinLeer: [] }),
    nuevoId: () => nuevoIdPagoDueno({ iniciar: async () => ({ db: {}, fsMod: { ...fsMod, doc: () => ({ id: 'id-del-pago' }), collection: () => ({}) } }), dbDinero: entorno.dbDinero }),
    nuevoNumero: async () => { numerosGastados += 1; return 7; },
    guardar: (pago) => guardarPagoDueno(pago, { ...entorno, numeroNuevo: async () => assert.fail('el número ya viene puesto') }),
  });
  await assert.rejects(hacer(), /sin internet/);
  assert.equal(docs.size, 0);
  const r = await hacer();
  assert.equal(r.tipo, 'guardado');
  assert.deepEqual([...docs.keys()], ['pagosDueno/id-del-pago'], 'un solo documento');
  assert.equal(docs.get('pagosDueno/id-del-pago').numero, 7);
  assert.equal(numerosGastados, 1, 'un solo número de comprobante');
  assert.equal(docs.get('pagosDueno/id-del-pago').monto, 3000);
  assert.deepEqual(docs.get('pagosDueno/id-del-pago').contratos, ['m1', 'm2']);
});

test('después de registrar, lo pagado sale de «por pagar», pasa a «ya pagado» y el total baja exacto', async () => {
  const r = await registrar(depsDePago());
  const lectura = lecturaOk({ pagos: { datos: r.pagos, fallo: false } });
  const vista = armarVista(lectura);
  const cuenta = entradaDe(vista, 'Mario López Alvarado').cuenta;
  assert.deepEqual(cuenta.porPagar.map((c) => c.id), ['m5']);
  assert.deepEqual(cuenta.pagados.map((c) => c.id), ['m1', 'm2']);
  assert.equal(cuenta.totalPorPagar, 0, 'solo queda la renta sin costo, que cuenta Q0.00');
  const ficha = fichaDe('Mario López Alvarado', { vista, lectura });
  const pagado = entre(ficha, '<h2>Ya pagado</h2>');
  assert.ok(pagado.includes('Q3,000.00') && pagado.includes('P-111AAA') && pagado.includes('P-222BBB') && pagado.includes('Comprobante N.° 101'));
});

test('mensajeSeguro: lo nuestro pasa tal cual; lo de Firebase (en inglés, con código) nunca llega a la pantalla', () => {
  const respaldo = 'frase de respaldo';
  assert.equal(mensajeSeguro(new Error(MENSAJE_SIN_COMPROBAR), respaldo), MENSAJE_SIN_COMPROBAR);
  assert.equal(mensajeSeguro(new Error(MENSAJE_COSTO_SIN_VALOR), respaldo), MENSAJE_COSTO_SIN_VALOR);
  assert.equal(mensajeSeguro(new Error(MENSAJE_SIN_COMPROBAR_RENTAS), respaldo), MENSAJE_SIN_COMPROBAR_RENTAS);
  assert.equal(mensajeSeguro(new Error('No se registró el pago. El contrato N° 15 no tiene costo por día anotado: …'), respaldo).startsWith('No se registró el pago.'), true);
  for (const crudo of [
    Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }),
    new Error('sin internet'),
    new TypeError('liquidacion: «pagos» debe ser una lista y llegó null.'),
    'texto suelto', null, undefined,
  ]) {
    assert.equal(mensajeSeguro(crudo, respaldo), respaldo);
  }
  assert.match(MENSAJE_PAGO_FALLO, /no se duplica/);
});

// ---------------------------------------------------------------------------
// Cerrar la sesión de dinero: el requisito duro de la revisión de la Tarea 4
// ---------------------------------------------------------------------------
//
// `salirDeDinero()` no se puede disparar y olvidar: la cola de dinero-sesion.js
// le pone su propio `catch`, así que un `signOut` que falla no deja ni una línea
// en la consola y el área sigue abierta sin que nadie lo sepa. Estas pruebas
// fijan que aquí se espera, se registra, y que un cierre que no se pudo hacer
// termina en una recarga (la sesión vive solo en memoria: recargar la mata).

test('enElAreaDeDinero: todo lo que cuelga de #/dinero es el área; lo demás no', () => {
  for (const ruta of ['#/dinero', '#/dinero/cuenta/id%3Ad1', '#/dinero/duenos', '#/dinero/duenos/nuevo', '#/dinero/duenos/d1']) {
    assert.equal(enElAreaDeDinero(ruta), true, ruta);
  }
  for (const ruta of ['#/flota', '#/clientes', '#/contratos/dinero', '#/dineros', '#/dinero-x', '#/', '', undefined, null]) {
    assert.equal(enElAreaDeDinero(ruta), false, String(ruta));
  }
});

test('cerrarElDinero espera a que la sesión se cierre y devuelve true; los datos y el reloj se sueltan ANTES de esperar', async () => {
  const orden = [];
  const cerrada = await cerrarElDinero({
    olvidar: () => orden.push('olvidar'),
    parar: () => orden.push('parar'),
    salir: async () => { orden.push('salir'); await Promise.resolve(); orden.push('salio'); },
    registrar: () => assert.fail('no había nada que registrar'),
  });
  assert.equal(cerrada, true);
  assert.deepEqual(orden, ['olvidar', 'parar', 'salir', 'salio']);
});

test('cerrarElDinero: si salirDeDinero RECHAZA, no se traga el fallo — lo registra y devuelve false', async () => {
  const registros = [];
  const falla = new Error('No se pudo cerrar el área de dinero. Recarga la página para cerrarla.');
  let olvidado = false;
  const cerrada = await cerrarElDinero({
    olvidar: () => { olvidado = true; },
    parar: () => {},
    salir: () => Promise.reject(falla),
    registrar: (...datos) => registros.push(datos),
  });
  assert.equal(cerrada, false);
  assert.equal(registros.length, 1);
  assert.ok(registros[0].includes(falla), 'el error queda a la vista de quien depure');
  assert.equal(olvidado, true, 'lo ya leído se suelta aunque el cierre falle');
});

test('cerrarElDinero: un salir que lanza de golpe (sin ser async) también cuenta como fallo', async () => {
  const cerrada = await cerrarElDinero({
    olvidar: () => {}, parar: () => {}, registrar: () => {}, salir: () => { throw new Error('boom'); },
  });
  assert.equal(cerrada, false);
});

test('cerrarElDinero: un cierre que nunca contesta (cola atorada detrás de un ingreso colgado) se da por NO cerrado a tiempo', async () => {
  const registros = [];
  const t0 = Date.now();
  const cerrada = await cerrarElDinero({
    olvidar: () => {}, parar: () => {}, limite: 20, salir: () => new Promise(() => {}), registrar: (...d) => registros.push(d),
  });
  assert.equal(cerrada, false);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(registros.length, 1);
});

test('cerrarElDineroOReiniciar: recarga la página SOLO si no se pudo cerrar', async () => {
  let recargas = 0;
  assert.equal(await cerrarElDineroOReiniciar({ cerrar: async () => true, recargar: () => { recargas += 1; } }), true);
  assert.equal(recargas, 0);
  assert.equal(await cerrarElDineroOReiniciar({ cerrar: async () => false, recargar: () => { recargas += 1; } }), false);
  assert.equal(recargas, 1);
});

test('salirDelSistema: primero cierra el dinero, luego sale del mostrador, y nunca recarga si todo salió bien', async () => {
  const orden = [];
  await salirDelSistema({
    cerrar: async () => { orden.push('cerrar-dinero'); return true; },
    salirDelMostrador: async () => { orden.push('salir-mostrador'); },
    alFallarElMostrador: () => orden.push('fallo-mostrador'),
    recargar: () => orden.push('recargar'),
  });
  assert.deepEqual(orden, ['cerrar-dinero', 'salir-mostrador']);
});

test('salirDelSistema: si el dinero NO se pudo cerrar, igual sale del mostrador y LUEGO recarga (recargar antes dejaría la salida a medias)', async () => {
  const orden = [];
  await salirDelSistema({
    cerrar: async () => { orden.push('cerrar-dinero'); return false; },
    salirDelMostrador: async () => { await Promise.resolve(); orden.push('salir-mostrador'); },
    alFallarElMostrador: () => orden.push('fallo-mostrador'),
    recargar: () => orden.push('recargar'),
  });
  assert.deepEqual(orden, ['cerrar-dinero', 'salir-mostrador', 'recargar']);
});

test('salirDelSistema: si falla la salida del mostrador se avisa, y si además el dinero no cerró se recarga igual', async () => {
  const orden = [];
  await salirDelSistema({
    cerrar: async () => false,
    salirDelMostrador: async () => { throw new Error('sin internet'); },
    alFallarElMostrador: (e) => orden.push(['fallo-mostrador', e.message]),
    recargar: () => orden.push('recargar'),
  });
  assert.deepEqual(orden, [['fallo-mostrador', 'sin internet'], 'recargar']);
  // Y con el dinero cerrado, un fallo del mostrador no recarga: solo se avisa.
  const solo = [];
  await salirDelSistema({
    cerrar: async () => true,
    salirDelMostrador: () => Promise.reject(new Error('x')),
    alFallarElMostrador: () => solo.push('aviso'),
    recargar: () => solo.push('recargar'),
  });
  assert.deepEqual(solo, ['aviso']);
});

function relojFalso() {
  let n = 0;
  const activos = new Map();
  return {
    activos,
    programar: (fn, ms) => { n += 1; activos.set(n, { fn, ms }); return n; },
    cancelar: (id) => { activos.delete(id); },
    dispara() {
      const [id, { fn }] = [...activos][0];
      activos.delete(id);
      fn();
    },
  };
}

test('el reloj de inactividad: se enciende, cada latido lo reinicia, y al vencer cierra', () => {
  const reloj = relojFalso();
  let vencio = 0;
  const v = crearVigilante({ ms: 600000, alExpirar: () => { vencio += 1; }, programar: reloj.programar, cancelar: reloj.cancelar });
  assert.equal(v.activo(), false);
  v.iniciar();
  assert.equal(v.activo(), true);
  assert.deepEqual([...reloj.activos.values()].map((a) => a.ms), [600000]);
  v.latido();
  v.latido();
  assert.equal(reloj.activos.size, 1, 'un latido reinicia el mismo reloj, no acumula otros');
  v.iniciar();
  assert.equal(reloj.activos.size, 1, 'encender dos veces no apila relojes');
  reloj.dispara();
  assert.equal(vencio, 1);
  assert.equal(v.activo(), false);
});

test('el reloj de inactividad: sin haberse encendido, la actividad no lo enciende; detener lo apaga', () => {
  const reloj = relojFalso();
  const v = crearVigilante({ alExpirar: () => assert.fail('no debía vencer'), programar: reloj.programar, cancelar: reloj.cancelar });
  v.latido();
  assert.equal(reloj.activos.size, 0, 'mover el ratón con el área cerrada no la «abre»');
  v.iniciar();
  v.detener();
  assert.equal(reloj.activos.size, 0);
  assert.equal(v.activo(), false);
  v.detener();
});

test('el área se cierra sola a los diez minutos sin usarse', () => {
  assert.equal(INACTIVIDAD_MS, 10 * 60 * 1000);
  assert.match(MENSAJE_INACTIVIDAD, /se cerró sola/);
});

// ---------------------------------------------------------------------------
// La entrada: solo una contraseña, y NADA sobre un correo
// ---------------------------------------------------------------------------

test('la entrada pide una contraseña y nada más: ni correo, ni usuario, ni un campo de texto', () => {
  const html = htmlEntrada();
  assert.ok(html.includes('type="password"'));
  assert.equal((html.match(/<input/g) || []).length, 1, 'un solo campo');
  assert.ok(html.includes('Contraseña del área de dinero'));
  assert.ok(!/correo|e-?mail|usuario|@/i.test(html), 'ninguna palabra sobre un correo');
  assert.ok(!html.includes(CORREO_DE_DINERO), 'la constante no sale en la página');
  assert.match(html, /autocomplete="new-password"/, 'el navegador no ofrece la contraseña del mostrador en este campo');
  assert.ok(htmlEntrada({ mensaje: MENSAJE_INACTIVIDAD }).includes(MENSAJE_INACTIVIDAD));
  assert.ok(!htmlEntrada().includes('se cerró sola'), 'sin motivo, no inventa uno');
});

test('ninguna frase que el área de dinero le puede dar al dueño habla de un correo', () => {
  // Cada código con el que Firebase puede contestar un ingreso, incluido el que
  // solo saldría por una constante mal escrita (`auth/invalid-email`).
  const codigos = [
    'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found',
    'auth/network-request-failed', 'auth/timeout', 'dinero/sin-conexion', 'auth/too-many-requests',
    'auth/user-disabled', 'auth/missing-password', 'auth/invalid-email', 'auth/loquesea', undefined, null, 42,
  ];
  for (const codigo of codigos) {
    const frase = mensajeDeErrorDeDinero(codigo);
    assert.ok(!/correo|e-?mail|usuario/i.test(frase), `${String(codigo)} → ${frase}`);
    assert.ok(!/auth\//.test(frase), 'nunca el código crudo');
  }
  const fuente = readFileSync(new URL('../js/pantallas/dinero.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // La constante se usa en UN solo lugar: la llamada que entrega la contraseña.
  assert.equal(fuente.match(/CORREO_DE_DINERO/g).length, 2, 'su definición y la llamada a entrarADinero, y nada más');
  assert.match(fuente, /entrarADinero\(CORREO_DE_DINERO, clave\)/);
  assert.match(CORREO_DE_DINERO, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'es un correo válido: Firebase lo exige');
});

// ---------------------------------------------------------------------------
// El cableado (app.js, dinero.js, index.html): lo que ninguna otra prueba ve
// ---------------------------------------------------------------------------
//
// Estas NO prueban comportamiento: leen el código. Existen porque app.js se
// ejecuta entero al importarlo (toca el DOM) y no se puede cargar en una prueba,
// y justo lo que está ahí es lo que impide que alguien lea dinero desde la
// consola: si alguien borra una de estas líneas, ninguna otra prueba lo nota —
// falla cerrado, y nadie se entera. Frágiles a propósito: si algo se renombra,
// fallan y obligan a mirar.

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const APP = leer('../js/app.js');
const PANTALLA = leer('../js/pantallas/dinero.js');
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('app.js: «Salir» llama a salirDelSistema, que cierra el dinero primero', () => {
  const codigo = sinComentarios(APP);
  const manejador = codigo.slice(codigo.indexOf("botonSalir.addEventListener('click'"), codigo.indexOf("window.addEventListener('hashchange'"));
  assert.match(manejador, /salirDelSistema\(\{/);
  assert.match(manejador, /salirDelMostrador: salir/);
  assert.ok(!/\bsalir\(\)/.test(manejador), 'ya no llama a salir() suelto: saldría del mostrador y dejaría el dinero abierto');
});

test('app.js: salir del área de dinero (cualquier cambio de ruta fuera de #/dinero) cierra la sesión', () => {
  const codigo = sinComentarios(APP);
  const cuerpo = codigo.slice(codigo.indexOf("window.addEventListener('hashchange'"));
  assert.match(cuerpo.slice(0, cuerpo.indexOf('});') + 3), /if \(!enElAreaDeDinero\(location\.hash\)\) cerrarElDineroOReiniciar\(\);/);
});

test('app.js: cuando el mostrador se queda sin sesión, el área de dinero se cierra con ella (Salir, o que Firebase la venciera)', () => {
  const codigo = sinComentarios(APP);
  const cuerpo = codigo.slice(codigo.indexOf('alCambiarSesion((usuario)'));
  const ramaSinUsuario = cuerpo.slice(cuerpo.indexOf('} else {'), cuerpo.indexOf('})'));
  assert.match(ramaSinUsuario, /cerrarElDineroOReiniciar\(\);/);
  assert.match(ramaSinUsuario, /verEntrada\(\);/);
  assert.ok(ramaSinUsuario.indexOf('cerrarElDineroOReiniciar') < ramaSinUsuario.indexOf('verEntrada'), 'se cierra antes de enseñar la entrada');
});

test('app.js: NINGUNA llamada suelta a salirDeDinero (disparar y olvidar): el rechazo de su cola se traga solo', () => {
  assert.ok(!/salirDeDinero/.test(sinComentarios(APP)), 'app.js no la importa ni la llama: pasa siempre por cerrarElDinero');
  // En dinero.js solo aparece como valor por omisión de cerrarElDinero y en su import.
  const usos = sinComentarios(PANTALLA).match(/.*salirDeDinero.*/g);
  assert.equal(usos.length, 2, usos.join('\n'));
  assert.ok(usos.some((l) => /import \{ entrarADinero, salirDeDinero, sesionDeDinero \}/.test(l)));
  assert.ok(usos.some((l) => /salir = salirDeDinero/.test(l)));
});

test('app.js: las nueve rutas del área de dinero (dueños, empleados, comisiones y el respaldo) pasan por la puerta de la contraseña', () => {
  const rutas = [...sinComentarios(APP).matchAll(/registrarPantalla\('(#\/dinero[^']*)', ([^;]+)\);/g)];
  assert.deepEqual(rutas.map((r) => r[1]), [
    '#/dinero', '#/dinero/cuenta/:clave', '#/dinero/duenos', '#/dinero/duenos/:duenoId',
    '#/dinero/empleados', '#/dinero/empleados/:empleadoId', '#/dinero/comisiones', '#/dinero/comisiones/:clave',
    '#/dinero/respaldo',
  ]);
  for (const [, ruta, funcion] of rutas) assert.match(funcion, /^conPuertaDeDinero\(\w+\)$/, `${ruta} sin puerta: ${funcion}`);
  assert.ok(sinComentarios(APP).includes("import { pintarDuenos } from './pantallas/duenos.js';"));
  assert.ok(sinComentarios(APP).includes("import { pintarEmpleados } from './pantallas/empleados.js';"));
  assert.ok(sinComentarios(APP).includes("import { pintarComisiones, pintarComisionesDeEmpleado } from './pantallas/comisiones.js';"));
});

test('index.html: el enlace a Dinero ya no está escondido, y Ajustes sí (todavía no tiene pantalla)', () => {
  const html = leer('../index.html');
  assert.match(html, /<a href="#\/dinero">Dinero<\/a>/);
  assert.match(html, /<a href="#\/ajustes" hidden>Ajustes<\/a>/);
});

test('dinero.js lee los contratos con cargarContratosParaDinero y NINGUNA otra: las demás dejan la pantalla sin nada por pagar', () => {
  const codigo = sinComentarios(PANTALLA);
  const fin = codigo.indexOf("} from '../datos.js';");
  const importaDeDatos = codigo.slice(codigo.lastIndexOf('import {', fin) + 'import {'.length, fin);
  const nombres = importaDeDatos.split(',').map((n) => n.trim()).filter(Boolean);
  assert.ok(nombres.includes('cargarContratosParaDinero'));
  for (const prohibida of ['cargarContratosAbiertos', 'cargarContratos', 'cargarContratosDeLaNube']) {
    assert.ok(!nombres.includes(prohibida), `${prohibida} no se usa aquí`);
  }
  assert.match(sinComentarios(PANTALLA), /cargarContratosParaDinero\(\)\.catch\(/);
  assert.ok(nombres.includes('cargarPagosDueno') && nombres.includes('cargarDuenos'));
});

test('dinero.js nunca arma una lista vacía para esquivar una lectura fallida: no pasa [] a liquidacion', () => {
  const codigo = sinComentarios(PANTALLA);
  assert.ok(!/agruparPorDueno\(\s*\[\]/.test(codigo) && !/agruparPorDueno\([^)]*\|\|\s*\[\]/.test(codigo));
  assert.ok(!/(contratos|pagos)\??\.datos\s*(\?\?|\|\|)\s*\[\]/.test(codigo), 'ni «datos ?? []» ni «datos || []» para contratos o pagos');
});

// ---------------------------------------------------------------------------
// El lector: qué lectura se guarda y cuál no
// ---------------------------------------------------------------------------
//
// Lo encontró la prueba en el navegador: con «Actualizar» y la nube caída, la
// lectura nueva fallaba pero la vieja seguía guardada, y la pantalla dibujaba la
// lista de antes como si fuera de ahora, sin una palabra. Si no se pudo leer, no
// se sabe: se dice, no se enseña lo viejo.

const buenaLectura = (n) => lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: [], n } });
const malaLectura = () => lecturaOk({ pagos: { datos: null, fallo: true } });

function lectorDePrueba(lecturas) {
  const pedidas = [];
  const cambios = [];
  const lector = crearLector({
    leer: async (alLlegar) => { pedidas.push(alLlegar); return lecturas.shift(); },
    alCambiar: () => cambios.push('cambio'),
  });
  return { lector, pedidas, cambios };
}

test('el lector guarda una lectura buena y no vuelve a pedirla mientras no se fuerce', async () => {
  const { lector, pedidas } = lectorDePrueba([buenaLectura(1), buenaLectura(2)]);
  assert.equal(lector.actual, null);
  const a = await lector.obtener();
  const b = await lector.obtener();
  assert.equal(a, b);
  assert.equal(a.contratos.n, 1);
  assert.equal(lector.actual, a);
  assert.equal(pedidas.length, 1);
  const c = await lector.obtener({ forzar: true });
  assert.equal(c.contratos.n, 2);
  assert.equal(pedidas.length, 2);
});

test('una lectura FALLIDA no se guarda, y un «Actualizar» que falla BORRA lo viejo: la lista de antes no se enseña como si fuera de ahora', async () => {
  const { lector } = lectorDePrueba([buenaLectura(1), malaLectura(), buenaLectura(3)]);
  const buena = await lector.obtener();
  assert.equal(lector.actual, buena);
  const fallida = await lector.obtener({ forzar: true });
  assert.equal(fallida.pagos.fallo, true, 'quien pidió recibe la lectura fallida, para saber qué decir');
  assert.equal(lector.actual, null, 'y lo viejo ya no está guardado');
  // Reintentar vuelve a pedirla (una fallida nunca se queda guardada) y ahora sí.
  const otra = await lector.obtener();
  assert.equal(otra.contratos.n, 3);
  assert.equal(lector.actual, otra);
});

test('una lectura fallida sin nada guardado de antes tampoco se guarda: el siguiente intento vuelve a pedirla', async () => {
  const { lector, pedidas } = lectorDePrueba([malaLectura(), malaLectura()]);
  await lector.obtener();
  await lector.obtener();
  assert.equal(pedidas.length, 2);
  assert.equal(lector.actual, null);
});

test('dos pedidos a la vez comparten UNA sola lectura', async () => {
  const { lector, pedidas } = lectorDePrueba([buenaLectura(1)]);
  const [a, b] = await Promise.all([lector.obtener(), lector.obtener()]);
  assert.equal(a, b);
  assert.equal(pedidas.length, 1);
});

test('si la sesión se cierra MIENTRAS se lee, lo leído no se guarda', async () => {
  let soltar;
  const lector = crearLector({ leer: () => new Promise((ok) => { soltar = ok; }) });
  const leyendo = lector.obtener();
  await Promise.resolve();
  lector.olvidar();
  soltar(buenaLectura(1));
  const r = await leyendo;
  assert.equal(r.contratos.n, 1, 'quien pidió igual recibe lo suyo');
  assert.equal(lector.actual, null, 'pero no queda guardado: la sesión ya se cerró');
});

test('olvidar() suelta lo guardado; la lista de dueños que llega tarde se pone solo si la lectura sigue vigente', async () => {
  const { lector, pedidas, cambios } = lectorDePrueba([buenaLectura(1), buenaLectura(2)]);
  const buena = await lector.obtener();
  const nuevosDuenos = { datos: [REGISTRO_LUCIA], fallo: false };
  pedidas[0](nuevosDuenos);
  assert.equal(buena.duenos, nuevosDuenos);
  assert.deepEqual(cambios, ['cambio'], 'avisa para que se repinte');
  lector.olvidar();
  assert.equal(lector.actual, null);
  pedidas[0]({ datos: [], fallo: true });
  assert.equal(cambios.length, 1, 'tras cerrar la sesión una respuesta tardía no repinta nada');
  assert.equal((await lector.obtener()).contratos.n, 2, 'y vuelve a leer');
});

test('un aviso de dueños que llega ANTES de que la lectura termine de guardarse no se pierde (la nube falla al instante)', async () => {
  const lectura = buenaLectura(1);
  const lector = crearLector({
    leer: async (alLlegar) => {
      alLlegar({ datos: [REGISTRO_LUCIA], fallo: true }); // la sincronía de fondo ya falló
      return lectura;
    },
  });
  const r = await lector.obtener();
  assert.equal(r.duenos.fallo, true, 'la lectura guardada trae el fallo, que la pantalla tiene que decir');
  assert.equal(lector.actual.duenos.fallo, true);
});

test('el aviso de dueños de una lectura VIEJA no pisa a la nueva', async () => {
  const avisos = [];
  const lector = crearLector({ leer: async (alLlegar) => { avisos.push(alLlegar); return buenaLectura(avisos.length); } });
  await lector.obtener();
  await lector.obtener({ forzar: true });
  avisos[0]({ datos: [], fallo: true }); // la sincronía de la primera lectura contesta tarde
  assert.equal(lector.actual.duenos.fallo, false, 'manda la lectura vigente');
  avisos[1]({ datos: [], fallo: true });
  assert.equal(lector.actual.duenos.fallo, true);
});

test('refrescarDuenos: lo que llega por detrás gana sobre la primera respuesta, en el orden que llegue', async () => {
  const cambios = [];
  const lector = crearLector({ leer: async () => buenaLectura(1), alCambiar: () => cambios.push('repintar') });
  await lector.obtener();
  const primera = { datos: [REGISTRO_LUCIA], fallo: false };
  const fallida = { datos: [REGISTRO_LUCIA], fallo: true };
  // 1) La respuesta de fondo llega ANTES de que la primera se procese: gana la de fondo.
  await lector.refrescarDuenos(async (alLlegar) => { alLlegar(fallida); return primera; });
  assert.equal(lector.actual.duenos, fallida);
  // 2) Llega después: se pone y se repinta.
  let despues;
  await lector.refrescarDuenos(async (alLlegar) => { despues = alLlegar; return primera; });
  assert.equal(lector.actual.duenos, primera);
  despues(fallida);
  assert.equal(lector.actual.duenos, fallida);
  assert.equal(cambios.length, 2);
  // 3) Con la sesión cerrada no hace nada.
  lector.olvidar();
  await lector.refrescarDuenos(async () => assert.fail('no hay nada que refrescar'));
  despues({ datos: [], fallo: false });
  assert.equal(lector.actual, null);
});

test('el lector por omisión solo guarda lo que armarVista da por bueno (se prueba con la regla de verdad)', async () => {
  const lector = crearLector({ leer: async () => lecturaOk({ contratos: { datos: TODOS, fallo: false } }) }); // sin costoSinLeer
  await lector.obtener();
  assert.equal(lector.actual, null, 'sin costoSinLeer no se sabe qué costos faltan: no sirve');
  const bueno = crearLector({ leer: async () => lecturaOk() });
  await bueno.obtener();
  assert.ok(bueno.actual);
});

// ---------------------------------------------------------------------------
// La pantalla de dueños
// ---------------------------------------------------------------------------

test('la lista de dueños: alfabética, con teléfono, NIT y un enlace a lo que se le debe', () => {
  const html = htmlListaDeDuenos([REGISTRO_MARIO, REGISTRO_LUCIA, REGISTRO_ZACARIAS]);
  const orden = ['Lucía Barrios', 'Mario López Alvarado', 'Zacarías Sin Rentas'].map((n) => html.indexOf(`>${n}</a>`));
  assert.ok(orden.every((p) => p > 0) && [...orden].sort((a, b) => a - b).join() === orden.join());
  assert.ok(html.includes('5555-1111') && html.includes('1234567-8'));
  assert.ok(html.includes('href="#/dinero/duenos/d1"') && html.includes('href="#/dinero/cuenta/id%3Ad1"'));
  assert.ok(html.includes('href="#/dinero/duenos/nuevo"') && html.includes('id="dn-buscar"'));
  assert.ok(!html.includes('barra-lectura-fallida'));
});

test('la lista de dueños con la lectura FALLIDA: barra roja, y no invita a «agregar el primero» (podría duplicar a un dueño que ya existe)', () => {
  const vacia = htmlListaDeDuenos([], { fallo: true });
  assert.ok(vacia.includes('barra-lectura-fallida'));
  assert.ok(!vacia.includes('Agregar el primero') && !vacia.includes('Todavía no hay dueños'));
  const buena = htmlListaDeDuenos([], { fallo: false });
  assert.ok(buena.includes('Todavía no hay dueños') && buena.includes('Agregar el primero'));
  assert.ok(!buena.includes('barra-lectura-fallida'));
  // Con dueños en la copia local y la nube caída, se ven y la barra avisa.
  const parcial = htmlListaDeDuenos([REGISTRO_LUCIA], { fallo: true });
  assert.ok(parcial.includes('barra-lectura-fallida') && parcial.includes('Lucía Barrios'));
});

test('el formulario del dueño sale de CAMPOS_DUENO y trae lo que ya tenía; el nombre con signos raros no rompe nada', () => {
  const html = htmlFormularioDeDueno({ ...REGISTRO_MARIO, nombre: 'Mario "El <Grande>"' }, { esNuevo: false });
  for (const id of ['nombre', 'telefono', 'nit', 'nota']) assert.ok(html.includes(`id="df-${id}"`), id);
  assert.ok(html.includes('value="5555-1111"') && html.includes('value="1234567-8"'));
  assert.ok(html.includes('Mario &quot;El &lt;Grande&gt;&quot;') && !html.includes('<Grande>'));
  const conApostrofo = htmlFormularioDeDueno({ ...REGISTRO_MARIO, nombre: "Mario D'Angelo" }, { esNuevo: false });
  assert.ok(conApostrofo.includes('value="Mario D&#39;Angelo"'), 'el apóstrofo se escapa, no se borra');
  assert.ok(html.includes('type="tel"'));
  assert.ok(html.includes('href="#/dinero/cuenta/id%3Ad1"'), 'desde la ficha se llega a lo que se le debe');
  const nuevo = htmlFormularioDeDueno(null, { esNuevo: true });
  assert.ok(nuevo.includes('Nuevo dueño') && !nuevo.includes('Ver lo que se le debe'));
});

// ---------------------------------------------------------------------------
// El aspecto: nada en línea, y cada clase que se usa existe en la hoja de estilos
// ---------------------------------------------------------------------------
//
// Minor 4 de la revisión de la Tarea 8: esta pantalla llevaba 57 `style="..."` (y
// duenos.js 8) contra 0 en clientes, comprobante, sacarCarro y recibirCarro. Un estilo
// en línea le gana a todo, también a la hoja de impresión, y nadie lo ve en el CSS.
//
// Mover estilos a clases es justo donde un selector equivocado esconde una cifra sin
// avisar: la clase no existe, el navegador no se queja, y el estilo simplemente no se
// aplica. Por eso estas pruebas fijan las dos mitades: que no quede ningún `style=`, y
// que cada clase `dn-*` que dibuja la pantalla esté DEFINIDA en css/estilos.css (y que
// ninguna definida ahí sobre).

// Sin comentarios: la cabecera del bloque en el CSS nombra clases a modo de ejemplo, y eso no es definirlas.
const CSS = leer('../css/estilos.css').replace(/\/\*[\s\S]*?\*\//g, '');
const DUENOS_FUENTE = leer('../js/pantallas/duenos.js');

/** Todo lo que las pantallas de dinero pueden dibujar, con sus variantes de estado. */
function todoElHtmlDeDinero() {
  const lectura = lecturaOk({ contratos: { datos: [...TODOS, M6], fallo: false, costoSinLeer: ['m6'] } });
  const vista = armarVista(lectura);
  const ui = uiVacia({
    marcados: new Set(['m1']), pagando: true, anotando: 'm5', mensajePago: 'Un mensaje', mensajeEnlace: 'Otro mensaje',
  });
  const fichas = ['Mario López Alvarado', 'Lucía Barrios', 'Don Mario', 'Zacarías Sin Rentas']
    .flatMap((nombre) => [fichaDe(nombre, { vista, lectura }), fichaDe(nombre, { vista, lectura, ui })]);
  const vacia = armarVista(lecturaOk({ contratos: { datos: [], fallo: false, costoSinLeer: [] }, pagos: { datos: [], fallo: false }, duenos: { datos: [], fallo: false } }));
  const conAnulado = lecturaConAnulado();
  return [
    ...htmlConDiferencias(),
    fichaDe('Lucía Barrios', { vista: armarVista(conAnulado), lectura: conAnulado }),
    htmlEntrada(), htmlEntrada({ mensaje: MENSAJE_INACTIVIDAD }),
    htmlFallo({ problemas: ['contratos', 'pagos', 'datos'] }),
    htmlLista(vista), htmlLista(vista, { migracion: htmlMigracion({ mensaje: 'Se movieron 3 contratos.', problema: false }) }),
    htmlLista(vista, { migracion: htmlMigracion({ mensaje: 'No se pudo.', problema: true }) }), htmlLista(vacia),
    ...fichas,
    htmlListaDeDuenos(DUENOS), htmlListaDeDuenos([]), htmlListaDeDuenos([], { fallo: true }), htmlListaDeDuenos([REGISTRO_LUCIA], { fallo: true }),
    htmlFormularioDeDueno(REGISTRO_MARIO, { esNuevo: false }), htmlFormularioDeDueno(null, { esNuevo: true }),
  ].join('\n');
}

test('ni dinero.js ni duenos.js llevan un solo estilo en línea, ni en su código ni en lo que dibujan', () => {
  assert.equal((sinComentarios(PANTALLA).match(/style\s*=/g) || []).length, 0, 'dinero.js');
  assert.equal((sinComentarios(DUENOS_FUENTE).match(/style\s*=/g) || []).length, 0, 'duenos.js');
  assert.ok(!/\.style\b|cssText|setAttribute\(\s*['"]style/.test(sinComentarios(PANTALLA) + sinComentarios(DUENOS_FUENTE)), 'ni por el DOM');
  assert.ok(!/style\s*=/.test(todoElHtmlDeDinero()), 'lo que se dibuja, en cualquier estado, tampoco');
});

test('cada clase dn-* que dibujan las pantallas de dinero está definida en css/estilos.css', () => {
  const usadas = new Set();
  for (const [, valor] of todoElHtmlDeDinero().matchAll(/class="([^"]*)"/g)) {
    for (const clase of valor.split(/\s+/)) if (clase.startsWith('dn-')) usadas.add(clase);
  }
  assert.ok(usadas.size >= 30, `se esperaban muchas clases dn-* y salieron ${usadas.size}`);
  for (const clase of usadas) {
    assert.match(CSS, new RegExp(`\\.${clase}(?![\\w-])`), `.${clase} se dibuja pero no está en el CSS: el navegador no avisa, el estilo simplemente no se aplica`);
  }
});

test('ninguna clase dn-* del CSS sobra: todas las definidas se usan en las pantallas', () => {
  const fuente = sinComentarios(PANTALLA) + sinComentarios(DUENOS_FUENTE)
    + sinComentarios(leer('../js/pantallas/empleados.js')) + sinComentarios(leer('../js/pantallas/comisiones.js'));
  const definidas = new Set([...CSS.matchAll(/\.(dn-[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(definidas.size >= 30);
  for (const clase of definidas) {
    assert.match(fuente, new RegExp(`class="[^"]*(?<![\\w-])${clase}(?![\\w-])`), `.${clase} está en el CSS y ninguna pantalla la usa`);
  }
});

// ===========================================================================
// Revisión final, hallazgo 1: una renta ya pagada cuyo monto CRECE después
// ===========================================================================
//
// La renta 41 de Mario López se cerró con 1 día de atraso (Q300 × 5 = Q1,500) y
// se le pagó con el comprobante N.° 7. Después se corrigió el cierre a 3 días de
// atraso: ahora son Q300 × 7 = Q2,100. La ficha decía «No hay rentas cerradas por
// pagar. Por pagar en total Q0.00» y Mario se quedaba sin sus Q600: una deuda real
// leída como cero. Aquí se prueba lo que se VE y lo que se PAGA, no solo el núcleo.

const CIERRE_VIEJO = saldado(recibido(salida({ id: 'r41', numero: 41, placas: 'P-222CCC', costoDia: 300, cliente: ROSA }), 1));
const R41_PAGADA = alLeer(CIERRE_VIEJO); // 1,500, cerrada
/** La misma renta con el cierre corregido a 3 días de atraso. Con `clientePaga: false`, el cliente todavía no paga lo de más. */
const r41Corregida = ({ clientePaga = true } = {}) => {
  const enmendada = recibido(CIERRE_VIEJO, 3);
  return alLeer(clientePaga ? saldado(enmendada) : enmendada);
};
const R41_CRECIDA = r41Corregida();
const PAGO_7 = pagoDuenoParaGuardar(
  construirPagoDueno({
    duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', contratos: [R41_PAGADA], pagos: [], idsMarcados: ['r41'],
  }),
  { id: 'pg-41', numero: 7, ahora: AHORA },
);

/** Las tres lecturas de la nube con solo la renta 41 de Mario (y las que se pidan). */
const lecturaDe41 = ({
  contratos = [R41_CRECIDA], pagos = [PAGO_7], costoSinLeer = [],
} = {}) => ({
  contratos: { datos: contratos, fallo: false, costoSinLeer },
  pagos: { datos: pagos, fallo: false },
  duenos: { datos: DUENOS, fallo: false },
});
const MARIO_41 = 'Mario López Alvarado';
/** La etiqueta <input> de la casilla de una fila (renta o diferencia), o null si la ficha no la dibuja. */
const casilla = (html, id) => new RegExp(`<input[^>]*data-dn="marcar"[^>]*data-id="${id}"[^>]*>`).exec(html)?.[0] ?? null;
const marioDe = (lectura) => entradaDe(armarVista(lectura), MARIO_41);

/** Lo que dibujan las pantallas con una diferencia por pagar y con una que aún no cierra (para el chequeo de clases CSS). */
function htmlConDiferencias() {
  const sinCerrar = lecturaDe41({ contratos: [r41Corregida({ clientePaga: false })] });
  const lectura = lecturaDe41();
  const ui = uiVacia({ marcados: new Set(['dif:r41']), pagando: true });
  return [
    htmlLista(armarVista(lectura)),
    fichaDe(MARIO_41, { vista: armarVista(lectura), lectura }),
    fichaDe(MARIO_41, { vista: armarVista(lectura), lectura, ui }),
    fichaDe(MARIO_41, { vista: armarVista(sinCerrar), lectura: sinCerrar }),
  ];
}

test('el escenario de la renta 41: cerrada paga Q1,500; corregida son Q2,100 y sigue cerrada', () => {
  assert.equal(estadoContrato(R41_PAGADA), 'cerrado');
  assert.equal(resumen(R41_PAGADA).costoSubarriendo, 1500);
  assert.equal(PAGO_7.monto, 1500);
  assert.equal(estadoContrato(R41_CRECIDA), 'cerrado');
  assert.equal(resumen(R41_CRECIDA).costoSubarriendo, 2100);
  assert.equal(estadoContrato(r41Corregida({ clientePaga: false })), 'devuelto');
});

test('la ficha de Mario NO dice «No hay rentas cerradas por pagar»: dice que se le deben Q600.00 de diferencia', () => {
  const lectura = lecturaDe41();
  const ficha = fichaDe(MARIO_41, { vista: armarVista(lectura), lectura });
  const porPagar = entre(ficha, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(!porPagar.includes('No hay rentas cerradas por pagar'), 'antes del arreglo decía esto, con Q0.00');
  assert.ok(porPagar.includes('Diferencia de rentas ya pagadas'));
  assert.ok(porPagar.includes('Se pagaron Q1,500.00 en el comprobante N.° 7, y hoy esas rentas suman Q2,100.00'));
  assert.match(porPagar, /class="dn-total">Q600\.00</, 'Por pagar en total Q600.00');
  // La renta sigue en «Ya pagado» con su monto de entonces: el comprobante N.° 7 sigue siendo cierto.
  const yaPagado = entre(ficha, '<h2>Ya pagado</h2>');
  assert.ok(yaPagado.includes('Comprobante N.° 7') && yaPagado.includes('Q1,500.00'));
});

test('la diferencia tiene su casilla: se puede marcar, suma lo que falta, y se paga con su propio pago', async () => {
  const lectura = lecturaDe41();
  const entrada = marioDe(lectura);
  assert.equal(entrada.cuenta.totalPorPagar, 600);
  assert.deepEqual(entrada.cuenta.porPagar, [], 'la renta no vuelve a «por pagar»: ya se le pagó, no se le paga otra vez completa');

  const clave = entrada.cuenta.diferencias[0].clave;
  const ficha = fichaDe(MARIO_41, { vista: armarVista(lectura), lectura });
  assert.ok(casilla(ficha, clave), 'tiene su casilla, como una renta');
  assert.doesNotMatch(casilla(ficha, clave), /checked|disabled/, 'sin marcar y se puede marcar');
  const marcada = fichaDe(MARIO_41, { vista: armarVista(lectura), lectura, ui: uiVacia({ marcados: new Set([clave]) }) });
  assert.match(casilla(marcada, clave), /checked/);
  assert.match(marcada, /id="dn-total-marcado"[^>]*>Q600\.00</);

  assert.deepEqual(resumenDeMarcadas(entrada, new Set([clave]), []), { ids: [clave], cuantas: 1, total: 600 });
  assert.deepEqual(resumenDeMarcadas(entrada, new Set(), []), { ids: [], cuantas: 0, total: 0 });

  const deps = depsDePago({ pagos: [PAGO_7], contratos: [R41_CRECIDA] });
  const r = await registrarElPago({
    entrada, idsMarcados: [clave], forma: 'transferencia', fecha: HOY, enCurso: {}, ...deps,
  });
  assert.equal(r.tipo, 'guardado');
  assert.equal(r.pago.monto, 600, 'solo la diferencia, no los Q2,100');
  assert.deepEqual(r.pago.contratos, ['r41'], 'sobre la misma renta, para que el grupo vuelva a cuadrar');
  assert.equal(r.pago.duenoId, 'd1');
  assert.deepEqual(r.pagos.map((p) => p.numero), [7, 101], 'el pago N.° 7 sigue ahí, intacto');
  assert.equal(r.pagos[0].monto, 1500, 'y no se tocó');

  // Con el pago ya hecho, la cuenta de Mario cuadra: nada que pagar.
  const despues = marioDe(lecturaDe41({ pagos: r.pagos }));
  assert.equal(despues.cuenta.totalPorPagar, 0);
  assert.deepEqual(despues.cuenta.diferencias, []);
  const fichaDespues = fichaDe(MARIO_41, { vista: armarVista(lecturaDe41({ pagos: r.pagos })), lectura: lecturaDe41({ pagos: r.pagos }) });
  assert.ok(entre(fichaDespues, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>').includes('No hay rentas cerradas por pagar'));
  assert.equal((fichaDespues.match(/Comprobante N\.° /g) || []).length, 2, 'los dos comprobantes en «Ya pagado»');
});

test('una renta por pagar y una diferencia se pagan juntas: el pago suma las dos y cubre las rentas de las dos', async () => {
  const otra = cerrado('r50', { numero: 50, placas: 'P-050AAA', costoDia: 300 }); // Q1,200
  const lectura = lecturaDe41({ contratos: [R41_CRECIDA, otra] });
  const entrada = marioDe(lectura);
  const clave = entrada.cuenta.diferencias[0].clave;
  assert.equal(entrada.cuenta.totalPorPagar, 1800, 'Q1,200 + Q600');
  const marcadas = resumenDeMarcadas(entrada, new Set(['r50', clave]), []);
  assert.deepEqual(marcadas, { ids: ['r50', clave], cuantas: 2, total: 1800 });
  const r = await registrarElPago({
    entrada, idsMarcados: marcadas.ids, forma: 'efectivo', fecha: HOY, enCurso: {},
    ...depsDePago({ pagos: [PAGO_7], contratos: [R41_CRECIDA, otra] }),
  });
  assert.equal(r.tipo, 'guardado', 'lo marcado y lo que cubre el pago son lo mismo');
  assert.equal(r.pago.monto, 1800);
  assert.deepEqual(r.pago.contratos.sort(), ['r41', 'r50']);
  // Y después de pagarlas juntas no queda nada: la diferencia no reaparece para pagarse dos veces.
  const despues = marioDe(lecturaDe41({ contratos: [R41_CRECIDA, otra], pagos: r.pagos }));
  assert.equal(despues.cuenta.totalPorPagar, 0);
  assert.deepEqual(despues.cuenta.diferencias, []);
});

test('una diferencia cuyo costo no se pudo leer no se puede marcar ni pagar: igual que una renta', async () => {
  const lectura = lecturaDe41({ costoSinLeer: ['r41'] });
  const vista = armarVista(lectura);
  const entrada = marioDe(lectura);
  const [dif] = entrada.cuenta.diferencias;
  assert.equal(diferenciaBloqueada(dif, entrada.cuenta, ['r41']), true);
  assert.equal(diferenciaBloqueada(dif, entrada.cuenta, []), false);
  assert.deepEqual(resumenDeMarcadas(entrada, new Set([dif.clave]), ['r41']), { ids: [], cuantas: 0, total: 0 });
  const ficha = fichaDe(MARIO_41, { vista, lectura, ui: uiVacia({ marcados: new Set([dif.clave]) }) });
  assert.match(casilla(ficha, dif.clave), /disabled/);
  assert.doesNotMatch(casilla(ficha, dif.clave), /checked/, 'ni marcada aunque estuviera en la memoria');
  // Y el total se dice corto, con las mismas palabras de siempre.
  assert.deepEqual(notasDeTotal(entrada, vista.costoSinLeer), ['No se pudo leer el costo de 1 renta: este total puede no ser el real.']);
  // Pagarla a la fuerza (otra pestaña, o una casilla vieja) se niega con su propia frase.
  await assert.rejects(
    registrarElPago({
      entrada, idsMarcados: [dif.clave], forma: 'efectivo', fecha: HOY, enCurso: {},
      ...depsDePago({ pagos: [PAGO_7], contratos: [R41_CRECIDA], costoSinLeer: ['r41'] }),
    }),
    /No se pudo leer el costo del contrato N° 41/,
  );
});

test('si otra pestaña ya pagó esa diferencia, NO se registra otra vez: se avisa y la lista vuelve al día', async () => {
  const lectura = lecturaDe41();
  const entrada = marioDe(lectura);
  const clave = entrada.cuenta.diferencias[0].clave;
  const deOtraPestana = pagoDuenoParaGuardar(
    { duenoId: 'd1', fecha: HOY, forma: 'efectivo', monto: 600, contratos: ['r41'] },
    { id: 'otra', numero: 9, ahora: AHORA },
  );
  const deps = depsDePago({ pagos: [PAGO_7, deOtraPestana], contratos: [R41_CRECIDA] });
  const r = await registrarElPago({
    entrada, idsMarcados: [clave], forma: 'efectivo', fecha: HOY, enCurso: {}, ...deps,
  });
  assert.equal(r.tipo, 'cambio', 'doble pago evitado');
  assert.deepEqual(deps.orden, ['leer', 'leerContratos'], 'no se gastó ni un id ni un número, ni se guardó nada');
});

test('si la diferencia CRECIÓ mientras él armaba el pago, tampoco se registra: vio un monto y se guardaría otro', async () => {
  const lectura = lecturaDe41();
  const entrada = marioDe(lectura);
  const clave = entrada.cuenta.diferencias[0].clave;
  // La misma renta, que otra pestaña corrigió a 4 días de atraso: Q2,400.
  const todavia = alLeer(saldado(recibido(CIERRE_VIEJO, 4)));
  assert.equal(resumen(todavia).costoSubarriendo, 2400);
  const r = await registrarElPago({
    entrada, idsMarcados: [clave], forma: 'efectivo', fecha: HOY, enCurso: {},
    ...depsDePago({ pagos: [PAGO_7], contratos: [todavia] }),
  });
  assert.equal(r.tipo, 'cambio');
});

test('una diferencia que todavía no cierra se ve en «Aún no cierra», no se puede marcar y no suma al total', () => {
  const lectura = lecturaDe41({ contratos: [r41Corregida({ clientePaga: false })] });
  const vista = armarVista(lectura);
  const entrada = marioDe(lectura);
  assert.equal(entrada.cuenta.totalPorPagar, 0, 'igual que una renta que no cierra: se ve, no suma');
  assert.equal(entrada.cuenta.diferenciasSinCerrar.length, 1);
  const ficha = fichaDe(MARIO_41, { vista, lectura });
  const aunNoCierra = entre(ficha, '<h2>Aún no cierra</h2>', '<h2>Ya pagado</h2>');
  assert.ok(aunNoCierra.includes('Diferencia de rentas ya pagadas'));
  assert.ok(aunNoCierra.includes('Faltan Q600.00 por pagarle, cuando cierre'));
  assert.ok(aunNoCierra.includes('Saldo pendiente'), 'y por qué no cierra, con las palabras de siempre');
  assert.ok(!aunNoCierra.includes('Ninguna renta de este dueño está esperando cerrar'));
  assert.ok(!aunNoCierra.includes('type="checkbox"'), 'sin casilla');
  assert.deepEqual(resumenDeMarcadas(entrada, new Set(['dif:r41']), []), { ids: [], cuantas: 0, total: 0 });
});

test('la lista de dueños: Mario sale con Q600.00, no apagado, y dice por qué una cuenta sin rentas por pagar debe algo', () => {
  const lectura = lecturaDe41();
  const lista = htmlLista(armarVista(lectura));
  const fila = entre(lista, `>${MARIO_41}</a>`, '</tr>');
  assert.ok(fila.includes('Q600.00'));
  assert.ok(fila.includes('Incluye Q600.00 de rentas ya pagadas cuyo monto cambió después del pago'));
  const inicio = lista.lastIndexOf('<tr', lista.indexOf(`>${MARIO_41}</a>`));
  assert.doesNotMatch(lista.slice(inicio, lista.indexOf('>', inicio)), /es-fuera/, 'no se ve apagado: se le debe');
  // Una cuenta sin diferencias no lleva esa línea: no se le tiran avisos que no pidió.
  const sana = htmlLista(armarVista(lecturaOk()));
  assert.ok(!sana.includes('Incluye'));
});

test('textoDeComprobantes: uno, dos o tres, en palabras', () => {
  assert.equal(textoDeComprobantes([{ numero: 7 }]), 'el comprobante N.° 7');
  assert.equal(textoDeComprobantes([{ numero: 7 }, { numero: 9 }]), 'los comprobantes N.° 7 y N.° 9');
  assert.equal(textoDeComprobantes([{ numero: 7 }, { numero: 9 }, { numero: 12 }]), 'los comprobantes N.° 7, N.° 9 y N.° 12');
});

test('el comprobante de la diferencia sale de la misma pantalla: entradaDelComprobante lo arma y dice que completa el N.° 7', async () => {
  const lectura = lecturaDe41();
  const entrada = marioDe(lectura);
  const clave = entrada.cuenta.diferencias[0].clave;
  const r = await registrarElPago({
    entrada, idsMarcados: [clave], forma: 'efectivo', fecha: HOY, enCurso: {},
    ...depsDePago({ pagos: [PAGO_7], contratos: [R41_CRECIDA] }),
  });
  const leida = lecturaDe41({ pagos: r.pagos });
  const modelo = armarComprobante(entradaDelComprobante({ entrada, pago: r.pago, lectura: leida, hoy: HOY }));
  assert.equal(modelo.pagado.total, 600);
  assert.deepEqual(modelo.pagado.anteriores, [{ numero: 7, monto: 1500 }]);
  assert.equal(modelo.pagado.acumulado, 2100);
  assert.deepEqual(modelo.pendiente.diferencias, []);
});

// ===========================================================================
// Revisión final, hallazgo 3: «Marcado: 1 rentas»
// ===========================================================================
//
// La plantilla (htmlBloquePorPagar) pluralizaba bien, pero al marcar una casilla
// la pantalla NO la redibuja: parchea el número (`parchearMarcado`) y la palabra
// que va detrás se quedaba como estaba. Las pruebas miraban la plantilla; él mira
// la página ya parcheada. Aquí se parchea lo que la plantilla dibujó, con un
// navegador mínimo, y se compara con lo que la plantilla habría dibujado de cero.

/**
 * Un «navegador» mínimo, sin DOM: de lo que la plantilla dibujó toma los elementos
 * con `id` que el parche pida, les deja `textContent` y `disabled`, y `visible()`
 * devuelve el texto de TODA la página como quedaría con esos cambios puestos.
 */
function paginaFalsa(html) {
  const nodos = new Map();
  const raiz = {
    querySelector(selector) {
      const id = selector.replace(/^#/, '');
      if (!nodos.has(id)) {
        const hallado = new RegExp(`<(\\w+)([^>]*?\\bid="${id}"[^>]*)>([^]*?)</\\1>`).exec(html);
        if (!hallado) return null;
        nodos.set(id, {
          original: hallado[0], textContent: hallado[3].replace(/<[^>]+>/g, ''), disabled: /\bdisabled\b/.test(hallado[2]),
        });
      }
      return nodos.get(id);
    },
  };
  const visible = () => {
    let pagina = html;
    for (const nodo of nodos.values()) pagina = pagina.replace(nodo.original, nodo.textContent);
    return pagina.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  };
  return { raiz, visible };
}

/** El texto visible de la ficha de Mario con lo marcado dado, dibujada de cero por la plantilla. */
const textoDeLaPlantilla = (marcados, pagando) => paginaFalsa(fichaDe('Mario López Alvarado', {
  ui: uiVacia({ marcados: new Set(marcados), pagando }),
})).visible();

/** El texto visible de la ficha de Mario dibujada con `antes` marcado y parcheada a `despues`, como hace la pantalla al marcar. */
function textoDelParche(antes, despues, pagando) {
  const vista = armarVista(lecturaOk());
  const entrada = entradaDe(vista, 'Mario López Alvarado');
  const pagina = paginaFalsa(fichaDe('Mario López Alvarado', { ui: uiVacia({ marcados: new Set(antes), pagando }) }));
  parchearMarcado(pagina.raiz, resumenDeMarcadas(entrada, new Set(despues), vista.costoSinLeer), { pagando });
  return { texto: pagina.visible(), pagina };
}

test('MARCAR UNA casilla deja «Marcado: 1 renta», no «1 rentas» (lo que reprodujo la revisión)', () => {
  const { texto } = textoDelParche([], ['m1'], false);
  assert.ok(texto.includes('Marcado: 1 renta '), texto.slice(texto.indexOf('Marcado')));
  assert.ok(!texto.includes('Marcado: 1 rentas'));
  assert.ok(texto.includes('Total marcado Q1,200.00'));
});

test('el parche dice la misma frase que la plantilla, con 0, 1 y 2 marcadas, venga de donde venga', () => {
  const casos = [[], ['m1'], ['m1', 'm2']];
  for (const pagando of [false, true]) {
    for (const antes of casos) {
      for (const despues of casos) {
        assert.equal(
          textoDelParche(antes, despues, pagando).texto,
          textoDeLaPlantilla(despues, pagando),
          `de ${antes.length} a ${despues.length} marcadas, con el formulario ${pagando ? 'abierto' : 'cerrado'}`,
        );
      }
    }
  }
});

test('«2 renta» al pasar de 1 a 2 tampoco: la palabra se parchea en las dos direcciones', () => {
  assert.ok(textoDelParche(['m1'], ['m1', 'm2'], false).texto.includes('Marcado: 2 rentas '));
  assert.ok(textoDelParche(['m1', 'm2'], ['m1'], false).texto.includes('Marcado: 1 renta '));
  assert.ok(textoDelParche(['m1'], [], false).texto.includes('Marcado: 0 rentas '), 'y cero es plural');
});

test('el parche también mueve lo que hay debajo: el total, el botón de guardar y el de registrar', () => {
  const { pagina } = textoDelParche([], ['m1', 'm2'], true);
  assert.equal(pagina.raiz.querySelector('#dn-total-marcado').textContent, 'Q3,000.00');
  assert.equal(pagina.raiz.querySelector('#dn-guardar-pago').textContent, 'Guardar pago de Q3,000.00');
  assert.equal(pagina.raiz.querySelector('#dn-guardar-pago').disabled, false);
  assert.equal(pagina.raiz.querySelector('#dn-registrar').disabled, true, 'con el formulario abierto, «Registrar pago» sigue apagado');
  const vacia = textoDelParche(['m1'], [], true).pagina;
  assert.equal(vacia.raiz.querySelector('#dn-guardar-pago').disabled, true, 'sin nada marcado no se guarda');
  const cerrada = textoDelParche([], ['m1'], false).pagina;
  assert.equal(cerrada.raiz.querySelector('#dn-registrar').disabled, false, 'con algo marcado y sin formulario, sí se puede registrar');
});

test('parchearMarcado no revienta si la página no trae algo (la ficha sin formulario no tiene «Guardar pago»)', () => {
  assert.doesNotThrow(() => parchearMarcado({ querySelector: () => null }, { cuantas: 1, total: 1200 }));
});

test('la plantilla y el parche usan el mismo elemento para la palabra: sin él, el parche no tiene dónde escribirla', () => {
  assert.match(fichaDe('Mario López Alvarado'), /<span id="dn-marcadas-palabra">rentas<\/span>/);
  assert.match(PANTALLA, /dn-marcadas-palabra/);
});

// ===========================================================================
// Revisión final, hallazgo 4: «¿cuánto debo?» — el total de todo lo que se debe
// ===========================================================================

test('la lista da el total de lo que se debe a todos los dueños: la suma de las cuentas, sin enlazar incluidos', () => {
  const vista = armarVista(lecturaOk());
  // Mario Q3,000 + Lucía Q750 + «Don Mario» Q400 + «Doña Pura» Q300 (los dos últimos, sin enlazar).
  assert.equal(vista.total, 4450);
  assert.equal(vista.total, vista.entradas.reduce((t, e) => t + e.cuenta.totalPorPagar, 0), 'es lo que suman los renglones que se ven');
  const lista = htmlLista(vista);
  const pie = entre(lista, '<tfoot>', '</tfoot>');
  assert.ok(pie.includes('Lo que debes a todos los dueños'));
  assert.match(pie, /id="dn-total-general">Q4,450\.00</);
  assert.ok(lista.indexOf('</tbody>') < lista.indexOf('<tfoot>'), 'debajo de las filas');
  assert.ok(lista.indexOf('<tfoot>') < lista.indexOf('Mover el costo de los dueños'));
});

test('el total general lleva las diferencias de rentas ya pagadas: Mario con Q600.00 y nada más suma Q600.00, no Q0.00', () => {
  const vista = armarVista(lecturaDe41());
  assert.equal(vista.total, 600);
  assert.match(htmlLista(vista), /id="dn-total-general">Q600\.00</);
});

test('si el total de algún dueño está corto, el total general lo dice con las mismas palabras y la misma marca «incompleto»', () => {
  const vista = armarVista(lecturaOk()); // m5: cerrada y SIN costo anotado
  assert.deepEqual(vista.notasDelTotal, ['Falta anotar el costo de 1 renta: este total es menor al real.']);
  const pie = entre(htmlLista(vista), '<tfoot>', '</tfoot>');
  assert.ok(pie.includes('Falta anotar el costo de 1 renta: este total es menor al real.'));
  assert.ok(pie.includes('incompleto'));

  const sinLeer = armarVista(lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: ['m1', 'm2', 'l1'] } }));
  assert.deepEqual(sinLeer.notasDelTotal, [
    'Falta anotar el costo de 1 renta: este total es menor al real.',
    'No se pudo leer el costo de 3 rentas: este total puede no ser el real.',
  ], 'cuenta las rentas de TODOS los dueños juntas (m1 y m2 de Mario, l1 de Lucía)');
  assert.ok(entre(htmlLista(sinLeer), '<tfoot>', '</tfoot>').includes('No se pudo leer el costo de 3 rentas'));
});

test('con todos los totales completos el total general no lleva ninguna advertencia: no se tiran avisos que no se pidieron', () => {
  const sana = lecturaOk({ contratos: { datos: [M1, M2, L1, T1, T2], fallo: false, costoSinLeer: [] } });
  const vista = armarVista(sana);
  assert.deepEqual(vista.notasDelTotal, []);
  const pie = entre(htmlLista(vista), '<tfoot>', '</tfoot>');
  assert.ok(!pie.includes('incompleto') && !pie.includes('Falta') && !pie.includes('No se pudo'));
  assert.match(pie, /id="dn-total-general">Q4,450\.00</);
});

test('el total general nunca es más limpio que los de cada dueño: si una cuenta dice «incompleto», el general también', () => {
  for (const costoSinLeer of [[], ['m1'], ['l1'], ['t1'], ['m1', 'l1', 't1']]) {
    const vista = armarVista(lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer } }));
    const algunaCorta = vista.entradas.some((e) => notasDeTotal(e, vista.costoSinLeer).length > 0);
    assert.equal(vista.notasDelTotal.length > 0, algunaCorta, `costoSinLeer ${JSON.stringify(costoSinLeer)}`);
    // Y cuenta exactamente las mismas rentas que las filas: ni una más, ni una menos.
    const dePorDueno = vista.entradas.reduce((t, e) => t + rentasCortas(e, vista.costoSinLeer).sinLeer, 0);
    const frase = vista.notasDelTotal.find((n) => n.startsWith('No se pudo leer'));
    assert.equal(frase ? Number(frase.match(/de (\d+) renta/)[1]) : 0, dePorDueno);
  }
});

test('notasDelTotalGeneral con nada que decir devuelve una lista vacía, y sin entradas tampoco revienta', () => {
  assert.deepEqual(notasDelTotalGeneral({ entradas: [], costoSinLeer: [] }), []);
  assert.deepEqual(notasDelTotalGeneral({}), []);
});

test('con lecturas que fallaron NO hay total: ningún «Q0.00» limpio sobre datos que no se leyeron', () => {
  for (const cambios of [
    { contratos: { datos: null, fallo: true, costoSinLeer: null } },
    { pagos: { datos: null, fallo: true } },
  ]) {
    const vista = armarVista(lecturaOk(cambios));
    assert.equal(vista.ok, false);
    assert.equal('total' in vista, false, 'ni el campo');
    const html = htmlLista(vista);
    assert.ok(!html.includes('dn-total-general') && !html.includes('<tfoot>') && !html.includes('Lo que debes'));
  }
});

test('con la lista vacía de verdad (ningún dueño, ninguna renta) no se dibuja un total: el vacío ya lo dice con palabras', () => {
  const vacia = armarVista(lecturaOk({
    contratos: { datos: [], fallo: false, costoSinLeer: [] }, pagos: { datos: [], fallo: false }, duenos: { datos: [], fallo: false },
  }));
  assert.equal(vacia.ok, true);
  assert.equal(vacia.total, 0);
  const html = htmlLista(vacia);
  assert.ok(html.includes('Todavía no hay rentas de carros ajenos ni dueños en la lista'));
  assert.ok(!html.includes('<tfoot>'));
});

test('con todos los dueños en cero, el total general dice Q0.00 de verdad (sí hay cuentas y se leyeron)', () => {
  const vista = armarVista(lecturaOk({ contratos: { datos: [L3], fallo: false, costoSinLeer: [] } }));
  assert.equal(vista.total, 0);
  assert.match(htmlLista(vista), /id="dn-total-general">Q0\.00</);
});

// ---------------------------------------------------------------------------
// La fecha del pago a un dueño tiene que ser una fecha de verdad
//
// Prueba del sistema (7 oct 2026): con «20261-10-21» en la fecha del pago (el campo del
// navegador deja teclear el año con cinco dígitos) el pago se guardó, gastó el número de
// comprobante N.° 3 y el papel NUNCA se pudo armar: «El pago N° 3 no trae una fecha válida».
// Un pago hecho, pagado y sin comprobante, y sin pantalla donde corregir su fecha.
// ---------------------------------------------------------------------------

test('problemaDeLaFechaDelPago: una fecha buena no tiene problema', () => {
  assert.equal(problemaDeLaFechaDelPago('2026-10-21'), null);
});

test('problemaDeLaFechaDelPago: vacía pide escribirla; el año de cinco dígitos o un día imposible piden revisarla', () => {
  assert.equal(problemaDeLaFechaDelPago(''), 'Escribe la fecha del pago.');
  assert.equal(problemaDeLaFechaDelPago(undefined), 'Escribe la fecha del pago.');
  assert.equal(problemaDeLaFechaDelPago('20261-10-21'), 'La fecha del pago no es válida. Revisa el año.');
  assert.equal(problemaDeLaFechaDelPago('2026-02-30'), 'La fecha del pago no es válida. Revisa el año.');
});

test('problemaDeLaFechaDelPago: un pago no es de mañana; hoy y los días pasados están bien, y sin «hoy» no se revisa', () => {
  assert.equal(problemaDeLaFechaDelPago('2062-11-02', '2026-11-02'), 'La fecha del pago todavía no llega. Revisa la fecha.');
  assert.equal(problemaDeLaFechaDelPago('2026-11-03', '2026-11-02'), 'La fecha del pago todavía no llega. Revisa la fecha.');
  assert.equal(problemaDeLaFechaDelPago('2026-11-02', '2026-11-02'), null);
  assert.equal(problemaDeLaFechaDelPago('2026-10-20', '2026-11-02'), null, 'un pago de días atrás que se anota hoy es normal');
  assert.equal(problemaDeLaFechaDelPago('2062-11-02'), null);
});


// ===========================================================================
// H-6: anular un pago a un dueño
// ===========================================================================
//
// Prueba del sistema (7 oct 2026): «Registrar pago» con las rentas o la forma equivocadas sacaba esas
// rentas de «por pagar» —una deuda real que se leía como cero— y la única salida era tocar Firestore a
// mano. Decisión de él: ANULAR, dejando rastro, como un pago del cliente. El pago conserva su número
// (ese dueño ya tiene el papel con él), sigue en «Ya pagado» marcado como anulado, y sus rentas vuelven a
// «por pagar». El diálogo nombra a QUIÉN, cuánto y cuántas rentas: anular el pago equivocado por un
// diálogo vago es justo lo que no puede pasar.

/** El pago N.° 3 a Lucía, anulado el 2 de octubre: tal como queda después de `anularPagoDueno` + guardarlo. */
const ANULADO_A_LUCIA = pagoDuenoParaGuardar(
  anularPagoDueno(PAGO_A_LUCIA, { fecha: '2026-10-02' }),
  { id: PAGO_A_LUCIA.id, numero: PAGO_A_LUCIA.numero, ahora: AHORA + 60000 },
);
const lecturaConAnulado = () => lecturaOk({ pagos: { datos: [ANULADO_A_LUCIA], fallo: false } });
const luciaDe = (lectura) => entradaDe(armarVista(lectura), 'Lucía Barrios');

test('el escenario del anulado: conserva el N.° 3, su monto y su renta, y Lucía vuelve a deber lo que se le había pagado', () => {
  assert.equal(pagoAnulado(ANULADO_A_LUCIA), true);
  assert.equal(ANULADO_A_LUCIA.numero, 3);
  assert.equal(ANULADO_A_LUCIA.monto, 1250);
  assert.deepEqual(ANULADO_A_LUCIA.contratos, ['l3']);
  assert.equal(ANULADO_A_LUCIA.anuladoEn, '2026-10-02');
  assert.equal(luciaDe(lecturaOk()).cuenta.totalPorPagar, 750, 'con el pago vigente solo debe L1');
  const sin = luciaDe(lecturaConAnulado()).cuenta;
  assert.deepEqual(sin.porPagar.map((c) => c.id), ['l1', 'l3']);
  assert.equal(sin.totalPorPagar, 2000, 'Q750 + los Q1,250 que habían salido de «por pagar»');
});

// ---------- El diálogo ----------

test('textoConfirmarAnularPagoDueno: nombra a QUIÉN, cuánto, cuál comprobante, cuándo y cuántas rentas', () => {
  const lucia = luciaDe(lecturaOk());
  const texto = textoConfirmarAnularPagoDueno(PAGO_A_LUCIA, lucia);
  assert.ok(texto.startsWith('¿Anular el pago de Q1,250.00 a Lucía Barrios'), texto);
  assert.ok(texto.includes('comprobante N.° 3'), 'cuál papel es');
  assert.ok(texto.includes('20 sep 2026'), 'de cuándo');
  assert.ok(texto.includes('Cubre 1 renta'), 'cuántas rentas, en singular');
  assert.ok(texto.includes('Esa renta vuelve a «Por pagar»'), 'y qué pasa con ella');
  assert.ok(texto.includes('marcado como anulado, con su número, y no desaparece de «Ya pagado»'), 'y que deja rastro');
});

test('textoConfirmarAnularPagoDueno: con varias rentas lo dice en plural, y nombra al dueño de ESA cuenta', () => {
  const pago = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd1', fecha: '2026-09-21', forma: 'efectivo', contratos: TODOS, pagos: [], idsMarcados: ['m1', 'm2'] }),
    { id: 'pg-mario', numero: 4, ahora: AHORA },
  );
  const lectura = lecturaOk({ pagos: { datos: [PAGO_A_LUCIA, pago], fallo: false } });
  const texto = textoConfirmarAnularPagoDueno(pago, entradaDe(armarVista(lectura), 'Mario López Alvarado'));
  assert.ok(texto.includes('Q3,000.00 a Mario López Alvarado'), texto);
  assert.ok(texto.includes('Cubre 2 rentas'), texto);
  assert.ok(texto.includes('Esas rentas vuelven a «Por pagar»'), texto);
  assert.ok(!texto.includes('Lucía'), 'ni el nombre de otro dueño');
});

test('textoConfirmarAnularPagoDueno: un pago de un grupo sin enlazar nombra el texto escrito a mano', () => {
  const pago = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: null, fecha: '2026-09-21', forma: 'efectivo', contratos: TODOS, pagos: [], idsMarcados: ['t1'] }),
    { id: 'pg-don', numero: 5, ahora: AHORA },
  );
  const lectura = lecturaOk({ pagos: { datos: [PAGO_A_LUCIA, pago], fallo: false } });
  assert.ok(textoConfirmarAnularPagoDueno(pago, entradaDe(armarVista(lectura), 'Don Mario')).includes('Q400.00 a Don Mario'));
});

test('textoConfirmarAnularPagoDueno: si el pago comparte rentas con otro (una diferencia), NO promete que vuelven a «Por pagar»', () => {
  const lectura = lecturaDe41();
  const entrada = marioDe(lectura);
  const clave = entrada.cuenta.diferencias[0].clave;
  const p9 = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd1', fecha: '2026-09-25', forma: 'efectivo', contratos: [R41_CRECIDA], pagos: [PAGO_7], idsMarcados: [clave] }),
    { id: 'pg-dif', numero: 9, ahora: AHORA },
  );
  const conAmbos = lecturaDe41({ pagos: [PAGO_7, p9] });
  const texto = textoConfirmarAnularPagoDueno(p9, marioDe(conAmbos));
  assert.ok(texto.includes('Q600.00 a Mario López Alvarado') && texto.includes('comprobante N.° 9'), texto);
  assert.ok(texto.includes('también están en el comprobante N.° 7'), 'dice con cuál comparte');
  assert.ok(texto.includes('solo vuelve a «Por pagar» lo que falte'), texto);
  assert.ok(!texto.includes('vuelve a «Por pagar».') && !texto.includes('vuelven a «Por pagar».'), 'no promete lo que no pasa');
});

// ---------- Anular: el recorrido ----------

/** Dependencias de `anularElPago` con la nube de mentira: lo que hay en `pagos` y lo que se guarda. */
function depsDeAnular({ pagos = [PAGO_A_LUCIA], fallaLectura = false, fallaGuardar = false } = {}) {
  const orden = [];
  return {
    orden,
    leerPagos: async () => {
      orden.push('leer');
      return fallaLectura ? { datos: null, fallo: true } : { datos: structuredClone(pagos), fallo: false };
    },
    guardar: async (pago) => {
      orden.push(['guardar', pago.id, pago.numero, pago.anuladoEn]);
      if (fallaGuardar) throw new Error('sin internet');
      return { ...pago, actualizado: AHORA + 1 };
    },
  };
}

test('anularElPago: lee los pagos, y guarda el pago anulado con la fecha de hoy y su MISMO número', async () => {
  const deps = depsDeAnular();
  const r = await anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...deps });
  assert.equal(r.tipo, 'anulado');
  assert.deepEqual(deps.orden, ['leer', ['guardar', 'pg-lucia', 3, '2026-10-11']]);
  assert.equal(r.pago.anulado, true);
  assert.equal(r.pago.numero, 3, 'el número se queda: ese dueño tiene el papel');
  assert.equal(r.pago.monto, 1250);
  assert.deepEqual(r.pago.contratos, ['l3']);
  assert.deepEqual(r.pagos.map((p) => p.id), ['pg-lucia'], 'la lista queda al día, sin duplicar el pago');
  assert.equal(pagoAnulado(r.pagos[0]), true, 'y con el pago ya anulado adentro');
  // Y con esa lista, la cuenta de Lucía vuelve a deber la renta.
  assert.equal(luciaDe(lecturaOk({ pagos: { datos: r.pagos, fallo: false } })).cuenta.totalPorPagar, 2000);
});

test('anularElPago: si otra pestaña ya lo anuló, NO escribe nada y respeta la fecha de la primera anulación', async () => {
  const deps = depsDeAnular({ pagos: [ANULADO_A_LUCIA] });
  const r = await anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...deps });
  assert.equal(r.tipo, 'ya-anulado');
  assert.deepEqual(deps.orden, ['leer'], 'no se escribió nada');
  assert.equal(r.pago.anuladoEn, '2026-10-02', 'la fecha de la primera anulación, no la de hoy');
});

test('anularElPago: guarda el pago como está AHORA en la nube, no la copia vieja de la pantalla', async () => {
  const deAhora = { ...PAGO_A_LUCIA, forma: 'cheque', actualizado: AHORA + 5 };
  const deps = depsDeAnular({ pagos: [deAhora] });
  const r = await anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...deps });
  assert.equal(r.pago.forma, 'cheque', 'lo de la nube, no lo que la pantalla tenía');
});

test('anularElPago: si el pago ya no está en la nube, no escribe nada y lo dice', async () => {
  const deps = depsDeAnular({ pagos: [] });
  const r = await anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...deps });
  assert.equal(r.tipo, 'no-esta');
  assert.deepEqual(deps.orden, ['leer']);
  assert.ok(MENSAJE_ANULAR_NO_ESTA.includes('No se anuló nada'));
});

test('anularElPago: si no se pueden leer los pagos NO anula: sin saber cómo está, se podría pisar algo', async () => {
  const deps = depsDeAnular({ fallaLectura: true });
  await assert.rejects(anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...deps }), { message: MENSAJE_ANULAR_SIN_COMPROBAR });
  assert.deepEqual(deps.orden, ['leer']);
});

test('anularElPago: si guardar falla, el fallo sale tal cual (no se finge que se anuló), y repetirlo es seguro', async () => {
  const deps = depsDeAnular({ fallaGuardar: true });
  await assert.rejects(anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...deps }), /sin internet/);
  // Reintento: si el primer intento sí había llegado, el pago se lee anulado y no se vuelve a escribir.
  const reintento = depsDeAnular({ pagos: [ANULADO_A_LUCIA] });
  assert.equal((await anularElPago({ pago: PAGO_A_LUCIA, hoy: '2026-10-11', ...reintento })).tipo, 'ya-anulado');
});

test('anularElPago: sin la fecha de hoy se niega, no la adivina', async () => {
  const deps = depsDeAnular();
  await assert.rejects(anularElPago({ pago: PAGO_A_LUCIA, ...deps }), /fecha de hoy/);
  await assert.rejects(anularElPago({ pago: PAGO_A_LUCIA, hoy: '20261-10-11', ...deps }), /fecha de hoy/);
  assert.deepEqual(deps.orden, [], 'ni siquiera leyó');
});

test('de punta a punta con guardarPagoDueno de verdad: anular deja UN documento, el mismo número, y la anulación escrita', async () => {
  const docs = new Map([['pagosDueno/pg-lucia', structuredClone(PAGO_A_LUCIA)]]);
  const fsMod = {
    doc: (db, coleccion, id) => ({ ruta: `${coleccion}/${id}`, id }),
    setDoc: async (ref, datos) => { docs.set(ref.ruta, { ...(docs.get(ref.ruta) ?? {}), ...structuredClone(datos) }); },
  };
  const entorno = { iniciar: async () => ({ db: {}, fsMod }), dbDinero: () => ({ esDinero: true }) };
  const hacer = () => anularElPago({
    pago: PAGO_A_LUCIA,
    hoy: '2026-10-11',
    leerPagos: async () => ({ datos: [...docs].map(([ruta, d]) => ({ ...d, id: ruta.split('/')[1] })), fallo: false }),
    guardar: (pago) => guardarPagoDueno(pago, { ...entorno, numeroNuevo: async () => assert.fail('el número ya viene puesto') }),
  });
  assert.equal((await hacer()).tipo, 'anulado');
  assert.deepEqual([...docs.keys()], ['pagosDueno/pg-lucia'], 'un solo documento');
  const guardado = docs.get('pagosDueno/pg-lucia');
  assert.equal(guardado.numero, 3);
  assert.equal(guardado.anulado, true);
  assert.equal(guardado.anuladoEn, '2026-10-11');
  assert.equal(guardado.monto, 1250);
  assert.equal((await hacer()).tipo, 'ya-anulado', 'el doble clic no hace nada la segunda vez');
  assert.equal(docs.get('pagosDueno/pg-lucia').anuladoEn, '2026-10-11');
});

test('mensajeSeguro: la frase de «no se pudo comprobar» al anular pasa tal cual; un error de Firebase no', () => {
  assert.equal(mensajeSeguro(new Error(MENSAJE_ANULAR_SIN_COMPROBAR), MENSAJE_ANULAR_FALLO), MENSAJE_ANULAR_SIN_COMPROBAR);
  assert.equal(mensajeSeguro(new Error('Missing or insufficient permissions.'), MENSAJE_ANULAR_FALLO), MENSAJE_ANULAR_FALLO);
});

// ---------- Lo que se ve en la ficha ----------

test('«Ya pagado»: un pago anulado SIGUE ahí, con su número, «Anulado el …» y sin botones; el vigente lleva «Ver comprobante» y «Anular»', () => {
  const vigente = entre(fichaDe('Lucía Barrios'), '<h2>Ya pagado</h2>');
  assert.ok(vigente.includes('data-dn="comprobante"') && vigente.includes('data-dn="anular-pago" data-id="pg-lucia"'));
  assert.ok(!vigente.includes('Anulado'));

  const lectura = lecturaConAnulado();
  const anulado = entre(fichaDe('Lucía Barrios', { vista: armarVista(lectura), lectura }), '<h2>Ya pagado</h2>');
  assert.ok(anulado.includes('Comprobante N.° 3'), 'no desaparece: el número se queda');
  assert.ok(anulado.includes('Anulado el 2 oct 2026'), 'marcado como anulado, con la fecha de la anulación');
  assert.ok(anulado.includes('Q1,250.00') && anulado.includes('P-CCC333'), 'y con su monto y su renta: es el rastro');
  assert.ok(anulado.includes('class="dn-caja dn-pago-hecho dn-pago-anulado"'));
  assert.ok(!anulado.includes('data-dn="comprobante"'), 'sin «Ver comprobante»: un papel de pago sobre algo que ya no está pagado diría lo contrario');
  assert.ok(!anulado.includes('data-dn="anular-pago"'), 'ni «Anular» otra vez');
  assert.ok(!anulado.includes('Todavía no se le ha pagado nada'), 'no es "nada pagado": hay un pago, anulado');
});

test('las rentas de un pago anulado vuelven a «Por pagar» en la ficha, con su casilla, y el total las incluye', () => {
  const lectura = lecturaConAnulado();
  const ficha = fichaDe('Lucía Barrios', { vista: armarVista(lectura), lectura });
  const porPagar = entre(ficha, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(porPagar.includes('P-CCC333') && porPagar.includes('Q1,250.00'));
  assert.ok(casilla(porPagar, 'l3'), 'se puede marcar otra vez para pagarla bien');
  assert.doesNotMatch(casilla(porPagar, 'l3'), /disabled/);
  assert.match(porPagar, /class="dn-total">Q2,000\.00</, 'Q750 + Q1,250');
  // Antes de anular, esa renta no estaba en «Por pagar».
  assert.ok(!entre(fichaDe('Lucía Barrios'), '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>').includes('P-CCC333'));
});

test('la lista de dueños también ve la deuda que volvió: Lucía pasa de Q750.00 a Q2,000.00', () => {
  const antes = entre(htmlLista(armarVista(lecturaOk())), '>Lucía Barrios</a>', '</tr>');
  assert.ok(antes.includes('Q750.00') && !antes.includes('Q2,000.00'));
  const despues = entre(htmlLista(armarVista(lecturaConAnulado())), '>Lucía Barrios</a>', '</tr>');
  assert.ok(despues.includes('Q2,000.00'));
});

test('lo anulado y lo vigente conviven: se anula uno de dos pagos y solo ese suelta sus rentas', () => {
  const otro = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd2', fecha: '2026-09-22', forma: 'cheque', contratos: [L1, L2, L3], pagos: [PAGO_A_LUCIA], idsMarcados: ['l1'] }),
    { id: 'pg-lucia-2', numero: 4, ahora: AHORA },
  );
  const lectura = lecturaOk({ pagos: { datos: [ANULADO_A_LUCIA, otro], fallo: false } });
  const lucia = luciaDe(lectura);
  assert.deepEqual(lucia.cuenta.pagados.map((c) => c.id), ['l1']);
  assert.deepEqual(lucia.cuenta.porPagar.map((c) => c.id), ['l3']);
  const ya = entre(fichaDe('Lucía Barrios', { vista: armarVista(lectura), lectura }), '<h2>Ya pagado</h2>');
  assert.equal((ya.match(/data-dn="anular-pago"/g) || []).length, 1, 'solo el N.° 4 se puede anular');
  assert.equal((ya.match(/Anulado el/g) || []).length, 1);
  assert.ok(ya.indexOf('Comprobante N.° 4') < ya.indexOf('Comprobante N.° 3'), 'el más reciente primero, como siempre');
});

test('rehacer el pago: tras anular, las mismas rentas se pagan con un pago NUEVO y su propio número, y la cuenta queda a mano', async () => {
  const lectura = lecturaConAnulado();
  const entrada = luciaDe(lectura);
  const marcadas = resumenDeMarcadas(entrada, new Set(['l3']), []);
  assert.deepEqual(marcadas, { ids: ['l3'], cuantas: 1, total: 1250 });
  const deps = depsDePago({ pagos: [ANULADO_A_LUCIA], contratos: TODOS });
  const r = await registrarElPago({
    entrada, idsMarcados: marcadas.ids, forma: 'efectivo', fecha: HOY, enCurso: {}, ...deps,
  });
  assert.equal(r.tipo, 'guardado');
  assert.equal(r.pago.numero, 101, 'un comprobante nuevo: el N.° 3 no se reutiliza');
  assert.equal(r.pago.forma, 'efectivo');
  assert.deepEqual(r.pago.contratos, ['l3']);
  assert.deepEqual(r.pagos.map((p) => p.numero), [3, 101], 'el anulado sigue en la lista, intacto');
  const despues = luciaDe(lecturaOk({ pagos: { datos: r.pagos, fallo: false } }));
  assert.deepEqual(despues.cuenta.pagados.map((c) => c.id), ['l3']);
  assert.equal(despues.cuenta.totalPorPagar, 750, 'como antes del error: solo L1');
});

// ---------- El comprobante de un pago anulado ----------

test('el comprobante de un pago ANULADO no se arma: el papel diría «Le pagué» sobre algo que ya no está pagado', () => {
  const lectura = lecturaConAnulado();
  assert.throws(
    () => armarComprobante(entradaDelComprobante({ entrada: luciaDe(lectura), pago: ANULADO_A_LUCIA, lectura, hoy: HOY })),
    /está anulado desde el 2 oct 2026/,
  );
});

test('el comprobante de otro pago de la misma cuenta no se enreda con el anulado', () => {
  const otro = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd2', fecha: '2026-09-22', forma: 'cheque', contratos: [L1, L2, L3], pagos: [ANULADO_A_LUCIA], idsMarcados: ['l3'] }),
    { id: 'pg-lucia-2', numero: 4, ahora: AHORA },
  );
  const lectura = lecturaOk({ pagos: { datos: [ANULADO_A_LUCIA, otro], fallo: false } });
  const modelo = armarComprobante(entradaDelComprobante({ entrada: luciaDe(lectura), pago: otro, lectura, hoy: HOY }));
  assert.equal(modelo.numero, 4);
  assert.equal(modelo.pagado.total, 1250);
  assert.deepEqual(modelo.pagado.anteriores, [], 'el N.° 3 anulado no es "un comprobante anterior que este completa"');
  assert.equal(modelo.pagado.cambiaron, false);
});

// ---------- El cableado ----------



// ===========================================================================
// H-7: se le pagó más de lo que esas rentas cuestan hoy, y la ficha lo dice
// ===========================================================================
//
// Prueba del sistema (7 oct 2026): la renta N.° 2 se cerró con 3 días de atraso (Q2,100) y se le
// pagaron Q2,100 a su dueño; después se corrigió el cierre a 1 día (Q1,500). Los Q600 pagados de más
// no se veían en ninguna pantalla de dinero. «Lo que baja después de pagado no es deuda» (1b4f748) se
// queda, y decidió él: se muestra en la ficha de ESE dueño, en una línea, y NO se descuenta solo.
//
// Ofelia Ramos (d4) tiene la renta N.° 2: la que se pagó con la cifra de antes, y la misma renta
// ya corregida. Todo sale de los mismos constructores que los reales.

const REGISTRO_OFELIA = { id: 'd4', nombre: 'Ofelia Ramos', telefono: '', nit: '', nota: '', actualizado: AHORA };
const deOfelia = (id, opciones = {}) => ({
  numero: 2, placas: 'P-OFE002', costoDia: 300, dueno: 'Ofelia Ramos', duenoId: 'd4', ...opciones, id,
});
/** La renta N.° 2 cuando se pagó: 3 días de atraso, (4 + 3) × 300 = Q2,100. */
const O2_COMO_SE_PAGO = alLeer(saldado(recibido(salida(deOfelia('o2')), 3)));
/** La misma, después de corregir su cierre a 1 día de atraso: Q1,500. El cliente queda con saldo a favor, y sigue «cerrada». */
const O2_CORREGIDA = alLeer(recibido(saldado(recibido(salida(deOfelia('o2')), 3)), 1));
const PAGO_A_OFELIA = pagoDuenoParaGuardar(
  construirPagoDueno({
    duenoId: 'd4', fecha: '2026-09-20', forma: 'transferencia', contratos: [O2_COMO_SE_PAGO], pagos: [], idsMarcados: ['o2'],
  }),
  { id: 'pg-ofelia', numero: 2, ahora: AHORA },
);
const ANULADO_A_OFELIA = pagoDuenoParaGuardar(
  anularPagoDueno(PAGO_A_OFELIA, { fecha: '2026-10-02' }),
  { id: PAGO_A_OFELIA.id, numero: PAGO_A_OFELIA.numero, ahora: AHORA + 60000 },
);
const lecturaConOfelia = ({ pagos = [PAGO_A_OFELIA], contratos = [O2_CORREGIDA], costoSinLeer = [] } = {}) => lecturaOk({
  contratos: { datos: [...TODOS, ...contratos], fallo: false, costoSinLeer },
  pagos: { datos: [PAGO_A_LUCIA, ...pagos], fallo: false },
  duenos: { datos: [...DUENOS, REGISTRO_OFELIA], fallo: false },
});
const fichaDeOfelia = (cambios) => {
  const lectura = lecturaConOfelia(cambios);
  return fichaDe('Ofelia Ramos', { vista: armarVista(lectura), lectura });
};
/** Las líneas de «pagado de más» de una ficha, o '' si no hay. */
const deMasDe = (ficha) => (ficha.match(/<div class="dn-de-mas">[\s\S]*?<\/div>/) || [''])[0];

test('H-7, el escenario: Q2,100 pagados, la renta cuesta Q1,500 hoy y sigue cerrada', () => {
  assert.equal(PAGO_A_OFELIA.monto, 2100);
  assert.equal(resumen(O2_CORREGIDA).costoSubarriendo, 1500);
  assert.equal(estadoContrato(O2_CORREGIDA), 'cerrado');
});

test('H-7: la ficha de ese dueño dice, en una línea, que se le pagó de más y cuánto', () => {
  const linea = deMasDe(fichaDeOfelia());
  assert.ok(linea, 'hay una línea');
  assert.match(linea, /Se le pagó de más: Q600\.00\./);
  assert.ok(linea.includes('Se pagaron Q2,100.00 en el comprobante N.° 2'), 'de dónde viene');
  assert.ok(linea.includes('hoy esa renta suma Q1,500.00'), 'y contra qué se compara');
  assert.equal((linea.match(/<p>/g) || []).length, 1, 'una sola línea');
  assert.equal(
    textoDePagadoDeMas(pagadoDeMas(entradaDe(armarVista(lecturaConOfelia()), 'Ofelia Ramos').cuenta, [])[0]),
    'Se le pagó de más: Q600.00. Se pagaron Q2,100.00 en el comprobante N.° 2 y hoy esa renta suma Q1,500.00.',
  );
});

test('H-7: está donde ya mira su cuenta: arriba de la ficha, antes de «Por pagar», y no dentro de una tabla', () => {
  const ficha = fichaDeOfelia();
  const i = ficha.indexOf('class="dn-de-mas"');
  assert.ok(i > 0);
  assert.ok(i > ficha.indexOf('<h1>Ofelia Ramos</h1>'), 'después del nombre del dueño');
  assert.ok(i < ficha.indexOf('<h2>Por pagar</h2>'), 'antes de «Por pagar»');
  assert.ok(!entre(ficha, '<h2>Por pagar</h2>').includes('Se le pagó de más'), 'y no se repite en los bloques de abajo');
  assert.ok(!/<table[^>]*>(?:(?!<\/table>)[\s\S])*Se le pagó de más/.test(ficha), 'no es una fila de una tabla');
});

test('H-7: se ve, pero NO se descuenta: «Por pagar» y lo marcado dicen lo mismo con o sin el pago de más', () => {
  const nueva = cerrado('o3', deOfelia('o3', { numero: 3, placas: 'P-OFE003', fechaSalida: '2026-09-10' })); // 4 × 300 = Q1,200
  const ui = uiVacia({ marcados: new Set(['o3']) });
  const con = lecturaConOfelia({ contratos: [O2_CORREGIDA, nueva] }); // se pagaron Q2,100 y hoy cuesta Q1,500
  const sin = lecturaConOfelia({ contratos: [O2_COMO_SE_PAGO, nueva] }); // se pagaron Q2,100 y hoy cuesta Q2,100
  const fichaCon = fichaDe('Ofelia Ramos', { vista: armarVista(con), lectura: con, ui });
  const fichaSin = fichaDe('Ofelia Ramos', { vista: armarVista(sin), lectura: sin, ui });

  assert.ok(deMasDe(fichaCon).includes('Q600.00') && !deMasDe(fichaSin), 'el escenario: solo una tiene el pago de más');
  const porPagar = (f) => entre(f, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.equal(porPagar(fichaCon), porPagar(fichaSin), '«Por pagar» es byte por byte el mismo');
  assert.match(porPagar(fichaCon), /class="dn-total">Q1,200\.00</, 'se le deben Q1,200 enteros, no Q600');
  assert.match(porPagar(fichaCon), /id="dn-total-marcado" class="dn-total-marcado">Q1,200\.00</, 'y lo marcado también');
  assert.equal(entradaDe(armarVista(con), 'Ofelia Ramos').cuenta.totalPorPagar, 1200);
  assert.deepEqual(resumenDeMarcadas(entradaDe(armarVista(con), 'Ofelia Ramos'), new Set(['o3']), []), { ids: ['o3'], cuantas: 1, total: 1200 });
});

test('descuento: la cifra grande de «Ya pagado» en la ficha y el «Total pagado» del comprobante son la misma — lo que él entregó', () => {
  // La ficha y el papel tienen que decir lo mismo de un pago: si no, él ve Q600 en pantalla y el dueño del carro lee Q1,200.
  const nueva = cerrado('o3', deOfelia('o3', { numero: 3, placas: 'P-OFE003', fechaSalida: '2026-09-10' })); // 4 × 300 = Q1,200
  const contratos = [O2_CORREGIDA, nueva];
  const pagoConDescuento = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd4', fecha: '2026-10-01', forma: 'efectivo', contratos, pagos: [PAGO_A_OFELIA], idsMarcados: ['o3'], descuento: 600, costoSinLeer: [],
    }),
    { id: 'pg-o3', numero: 7, ahora: AHORA },
  );
  assert.equal(pagoConDescuento.monto, 1200);
  assert.equal(pagoConDescuento.descuento, 600);
  const lectura = lecturaConOfelia({ pagos: [PAGO_A_OFELIA, pagoConDescuento], contratos });
  const vista = armarVista(lectura);
  const ficha = fichaDe('Ofelia Ramos', { vista, lectura });
  const tarjeta = ficha.match(/<article class="dn-caja dn-pago-hecho">(?:(?!<\/article>)[\s\S])*?Comprobante N\.° 7[\s\S]*?<\/article>/)[0];
  const cifraDeLaFicha = tarjeta.match(/<strong class="dn-pago-cifra">([^<]*)<\/strong>/)[1];
  assert.equal(cifraDeLaFicha, 'Q600.00', 'la ficha dice lo que salió de sus manos');

  const modelo = armarComprobante(entradaDelComprobante({
    entrada: entradaDe(vista, 'Ofelia Ramos'), pago: pagoConDescuento, lectura, hoy: HOY,
  }));
  assert.equal(dinero(modelo.pagado.entregado), cifraDeLaFicha, 'el papel dice la misma cifra');
  assert.equal(dinero(modelo.pagado.total), 'Q1,200.00', 'y las rentas, lo que suman');
  assert.equal(dinero(modelo.pagado.descuento), 'Q600.00', 'igual que la línea de la tarjeta');
  assert.ok(tarjeta.includes('Las rentas suman Q1,200.00; se descontaron Q600.00'), 'la tarjeta explica la diferencia con las mismas cifras del papel');
  // Y el pago anterior (sin descuento) dice lo mismo en los dos lados: su monto entero.
  const tarjeta2 = ficha.match(/<article class="dn-caja dn-pago-hecho">(?:(?!<\/article>)[\s\S])*?Comprobante N\.° 2[\s\S]*?<\/article>/)[0];
  assert.equal(tarjeta2.match(/<strong class="dn-pago-cifra">([^<]*)<\/strong>/)[1], 'Q2,100.00');
});

test('H-7: lo que viene de los datos entra escapado, nunca como HTML', () => {
  const raro = { ...PAGO_A_OFELIA, numero: '<i>2</i>' };
  const linea = deMasDe(fichaDeOfelia({ pagos: [raro] }));
  assert.ok(linea.includes('&lt;i&gt;2&lt;/i&gt;') && !linea.includes('<i>'));
});

test('H-7: no es un aviso rojo ni una alarma: es una línea normal, sin la barra roja de los fallos', () => {
  const linea = deMasDe(fichaDeOfelia());
  assert.ok(!linea.includes('barra-lectura-fallida') && !linea.includes('dn-alerta') && !linea.includes('role="alert"'));
  assert.ok(!fichaDeOfelia().includes('barra-lectura-fallida'), 'ninguna barra roja en la ficha');
});

test('H-7: solo en la ficha de ese dueño: las demás no dicen nada de más, ni la lista de dueños', () => {
  const lectura = lecturaConOfelia();
  const vista = armarVista(lectura);
  for (const nombre of ['Mario López Alvarado', 'Lucía Barrios', 'Don Mario', 'Doña Pura', 'Zacarías Sin Rentas']) {
    const ficha = fichaDe(nombre, { vista, lectura });
    assert.ok(!ficha.includes('dn-de-mas') && !ficha.includes('Se le pagó de más'), nombre);
  }
  assert.ok(!htmlLista(vista).includes('Se le pagó de más'), 'la decisión fue la ficha de ese dueño');
});

test('H-7: sin pago de más, la ficha no dice nada (nadie pidió un «todo en orden»)', () => {
  const lectura = lecturaConOfelia({ contratos: [O2_COMO_SE_PAGO] });
  assert.equal(armarVista(lectura).ok, true);
  assert.ok(!fichaDe('Ofelia Ramos', { vista: armarVista(lectura), lectura }).includes('dn-de-mas'), 'cuadra: pagó Q2,100 y cuestan Q2,100');
  assert.ok(!fichaDe('Lucía Barrios').includes('dn-de-mas'), 'y la de siempre tampoco');
});

test('H-7 y H-6: un pago ANULADO no sale como pagado de más: la renta vuelve a «Por pagar» con lo que cuesta hoy', () => {
  assert.ok(deMasDe(fichaDeOfelia()), 'el control: vigente, la línea sale');
  const lectura = lecturaConOfelia({ pagos: [ANULADO_A_OFELIA] });
  const ficha = fichaDe('Ofelia Ramos', { vista: armarVista(lectura), lectura });
  assert.ok(!ficha.includes('dn-de-mas') && !ficha.includes('Se le pagó de más'));
  const porPagar = entre(ficha, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>');
  assert.ok(porPagar.includes('P-OFE002') && porPagar.includes('Q1,500.00'), 'la renta volvió, con lo que cuesta hoy');
  assert.match(porPagar, /class="dn-total">Q1,500\.00</);
  assert.ok(entre(ficha, '<h2>Ya pagado</h2>').includes('Anulado el 2 oct 2026'), 'y el anulado sigue como rastro');
});

test('H-7 y H-6: anular de verdad (por anularElPago) el pago del que sobra Q600 hace desaparecer la línea', async () => {
  const deps = depsDeAnular({ pagos: [PAGO_A_OFELIA] });
  const r = await anularElPago({ pago: PAGO_A_OFELIA, hoy: '2026-10-12', ...deps });
  assert.equal(r.tipo, 'anulado');
  assert.equal(r.pago.anulado, true);
  const lectura = lecturaConOfelia({ pagos: r.pagos });
  const ficha = fichaDe('Ofelia Ramos', { vista: armarVista(lectura), lectura });
  assert.ok(!ficha.includes('Se le pagó de más'), 'anulado, ya no sobra: su dinero está deshecho');
  assert.ok(entre(ficha, '<h2>Por pagar</h2>', '<h2>Aún no cierra</h2>').includes('P-OFE002'), 'y la renta volvió a «Por pagar»');
});

test('H-7: un costo que no se pudo leer no inventa un pago de más', () => {
  assert.ok(deMasDe(fichaDeOfelia()), 'el control: leído, sale');
  assert.ok(!fichaDeOfelia({ costoSinLeer: ['o2'] }).includes('Se le pagó de más'));
  assert.ok(deMasDe(fichaDeOfelia({ costoSinLeer: ['otra'] })), 'el costo sin leer de OTRA renta no la apaga');
  const sinCosto = alLeer(recibido(saldado(recibido(salida(deOfelia('o2', { costoDia: 0 })), 3)), 1));
  assert.ok(!fichaDeOfelia({ contratos: [sinCosto] }).includes('Se le pagó de más'), 'ni una renta sin costo anotado');
});

test('H-7: dos rentas en un mismo pago dicen «esas rentas suman», y varios comprobantes se nombran todos', () => {
  const o3 = cerrado('o3', deOfelia('o3', { numero: 3, placas: 'P-OFE003', fechaSalida: '2026-09-10' })); // Q1,200
  const juntas = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd4', fecha: '2026-09-20', forma: 'cheque', contratos: [O2_COMO_SE_PAGO, o3], pagos: [], idsMarcados: ['o2', 'o3'] }),
    { id: 'pg-ofelia-3', numero: 3, ahora: AHORA },
  );
  const linea = deMasDe(fichaDeOfelia({ contratos: [O2_CORREGIDA, o3], pagos: [juntas] }));
  assert.ok(linea.includes('Se le pagó de más: Q600.00.'));
  assert.ok(linea.includes('Se pagaron Q3,300.00 en el comprobante N.° 3 y hoy esas rentas suman Q2,700.00.'));

  const complemento = pagoDuenoParaGuardar(
    { duenoId: 'd4', fecha: '2026-09-25', forma: 'efectivo', monto: 300, contratos: ['o2'] },
    { id: 'pg-ofelia-9', numero: 9, ahora: AHORA },
  );
  assert.ok(
    deMasDe(fichaDeOfelia({ pagos: [PAGO_A_OFELIA, complemento] })).includes('en los comprobantes N.° 2 y N.° 9 y hoy esa renta suma Q1,500.00'),
    'varios comprobantes del mismo grupo',
  );
});

test('H-7: si a un mismo dueño se le pagó de más en dos pagos distintos, hay una línea por cada uno', () => {
  const opciones = deOfelia('o4', { numero: 4, placas: 'P-OFE004', fechaSalida: '2026-09-12' });
  const o4AlPagar = alLeer(saldado(recibido(salida(opciones), 2))); // (4 + 2) × 300 = Q1,800
  const o4Corregida = alLeer(recibido(saldado(recibido(salida(opciones), 2)), 0)); // 4 × 300 = Q1,200
  const pagoO4 = pagoDuenoParaGuardar(
    construirPagoDueno({ duenoId: 'd4', fecha: '2026-09-21', forma: 'efectivo', contratos: [O2_COMO_SE_PAGO, o4AlPagar], pagos: [PAGO_A_OFELIA], idsMarcados: ['o4'] }),
    { id: 'pg-ofelia-4', numero: 4, ahora: AHORA },
  );
  const linea = deMasDe(fichaDeOfelia({ contratos: [O2_CORREGIDA, o4Corregida], pagos: [PAGO_A_OFELIA, pagoO4] }));
  assert.equal((linea.match(/<p>/g) || []).length, 2, 'una por cada pago de más');
  assert.ok(linea.includes('Se le pagó de más: Q600.00. Se pagaron Q2,100.00 en el comprobante N.° 2'));
  assert.ok(linea.includes('Se le pagó de más: Q600.00. Se pagaron Q1,800.00 en el comprobante N.° 4 y hoy esa renta suma Q1,200.00'));
});

test('H-7: la ficha y el comprobante no se contradicen sobre el mismo pago', () => {
  const lectura = lecturaConOfelia();
  const entrada = entradaDe(armarVista(lectura), 'Ofelia Ramos');
  const modelo = armarComprobante(entradaDelComprobante({ entrada, pago: PAGO_A_OFELIA, lectura, hoy: HOY }));
  const [grupo] = pagadoDeMas(entrada.cuenta, []);
  const detalle = suma(...modelo.pagado.filas.map((f) => f.monto));

  assert.equal(modelo.pagado.total, grupo.pagado, 'lo pagado: el mismo monto guardado');
  assert.equal(detalle, grupo.ahora, 'lo que las rentas suman hoy: la misma cifra');
  assert.equal(modelo.pagado.cambiaron, true, 'y el papel avisa que el detalle ya no suma lo pagado');
  assert.equal(modelo.pagado.total - detalle, grupo.deMas);
  const ficha = deMasDe(fichaDe('Ofelia Ramos', { vista: armarVista(lectura), lectura }));
  assert.ok(ficha.includes(`Q${textoDosDecimales(modelo.pagado.total)}`) && ficha.includes(`Q${textoDosDecimales(detalle)}`));
});

test('H-7: el cableado — la ficha le pregunta a pagadoDeMas del núcleo con los costos sin leer, y la pantalla no suma ni compara', () => {
  const codigo = sinComentarios(PANTALLA);
  const cuerpo = codigo.slice(codigo.indexOf('function htmlPagadoDeMas('), codigo.indexOf('export function htmlFicha('));
  assert.match(cuerpo, /pagadoDeMas\(ctx\.entrada\.cuenta, ctx\.vista\.costoSinLeer\)/);
  assert.doesNotMatch(cuerpo, /suma\(|reduce\(|\.monto|diferencia|ahora -|pagado -/, 'ninguna cifra se calcula en la pantalla');
  assert.match(codigo, /\$\{htmlPagadoDeMas\(ctx\)\}/, 'y la ficha la dibuja');
});

// ---------------------------------------------------------------------------
// El descuento de un pago de más, y lo que se le dice cuando no se puede aplicar
// ---------------------------------------------------------------------------
// Por qué existe este bloque (23 de noviembre de 2026). Midiendo las pruebas con mutaciones salió que
// `resumenDelDescuento`, `textoDelProblemaDelDescuento` y `textoDeDescuentoSinRespaldo` estaban
// IMPORTADAS en este archivo y no las llamaba NINGUNA prueba: 31 errores metidos a propósito en ellas
// sobrevivían sin que nada se pusiera rojo, y el archivo parecía cubrirlas de un vistazo.
// Lo que se podía romper en silencio era dinero:
//   - que el descuento tecleado se leyera como 0 (él cree que descontó Q500 y entrega los Q500 completos);
//   - que un descuento igual al tope se rechazara, o que uno ilegible se aceptara como válido;
//   - que la pantalla bloqueara el guardado sin decir por qué (el texto del problema vacío).
// Las cifras de aquí salen de las mismas funciones del núcleo con las que `construirPagoDueno` arma el
// pago (`descuentoMaximo`, `entregadoDelPago`): lo que se ve es lo que se guarda.

/** Una renta pagada con 3 días de atraso y después corregida a 0: al dueño se le pagaron Q900 de más. */
const CIERRE_DE_MAS = saldado(recibido(salida({ id: 'x1', numero: 51, placas: 'P-XXX111', costoDia: 300, cliente: ROSA }), 3));
const PAGO_DE_MAS = pagoDuenoParaGuardar(
  construirPagoDueno({
    duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', contratos: [alLeer(CIERRE_DE_MAS)], pagos: [], idsMarcados: ['x1'],
  }),
  { id: 'pg-x1', numero: 9, ahora: AHORA },
);
const X1_CORREGIDA = alLeer(saldado(recibido(CIERRE_DE_MAS, 0)));
/** Y otra renta cerrada, de Q600, para tener qué marcar en el pago siguiente. */
const X2_POR_PAGAR = cerrado('x2', { numero: 52, placas: 'P-XXX222', costoDia: 300, dias: 2 });

const lecturaConPagoDeMas = ({ contratos = [X1_CORREGIDA, X2_POR_PAGAR], pagos = [PAGO_DE_MAS], costoSinLeer = [] } = {}) => ({
  contratos: { datos: contratos, fallo: false, costoSinLeer },
  pagos: { datos: pagos, fallo: false },
  duenos: { datos: DUENOS, fallo: false },
});

/** Mario con los Q900 de más, sus marcadas (la renta de Q600) y el descuento que se pida. */
function conDescuento(tecleado, { lectura = lecturaConPagoDeMas(), costoSinLeer = [] } = {}) {
  const entrada = entradaDe(armarVista(lectura), 'Mario López Alvarado');
  const marcadas = resumenDeMarcadas(entrada, new Set(entrada.cuenta.porPagar.map((c) => c.id)), costoSinLeer);
  return { entrada, marcadas, r: resumenDelDescuento(entrada, marcadas, costoSinLeer, tecleado) };
}

test('el control de la cuenta de más: Q900 pagados de más, Q600 marcados, y el tope es lo marcado', () => {
  const { entrada, marcadas, r } = conDescuento('');
  assert.equal(totalPagadoDeMas(entrada.cuenta, []), 900);
  assert.deepEqual(marcadas.ids, ['x2']);
  assert.equal(marcadas.total, 600);
  assert.equal(r.deMas, 900);
  assert.equal(r.maximo, 600, 'no se descuenta más de lo que se está pagando, aunque sobren Q900');
  assert.equal(r.maximo, descuentoMaximo(entrada.cuenta, [], marcadas.ids), 'el tope es el del núcleo, no uno propio');
});

test('resumenDelDescuento: sin pago de más NO se ofrece el campo, y no hay descuento que aplicar', () => {
  // Sin el pago, la renta corregida es una renta por pagar normal: no hay nada pagado de más.
  const { r } = conDescuento('500', { lectura: lecturaConPagoDeMas({ pagos: [] }) });
  assert.equal(r.hay, false, 'un campo de descuento sin pago de más solo invitaría a borrar una deuda real');
  assert.equal(r.deMas, 0);
  assert.equal(r.descuento, 0, 'ni siquiera el que quedó tecleado de antes: el campo ya no está');
  assert.equal(r.valido, true);
  assert.equal(r.problema, null);
  assert.equal(textoDelProblemaDelDescuento(r), '');
});

test('resumenDelDescuento: con pago de más se ofrece, y lo tecleado se lee TAL CUAL (no como cero)', () => {
  const { r } = conDescuento('100');
  assert.equal(r.hay, true);
  assert.equal(r.descuento, 100, 'si esto se leyera como 0, él creería haber descontado Q100 y entregaría los Q600 completos');
  assert.equal(r.valido, true);
  assert.equal(r.problema, null);
  assert.equal(r.entregar, 500, 'lo que entrega es lo marcado menos el descuento');
});

test('resumenDelDescuento: el campo vacío es CERO, no un descuento de uno ni un error', () => {
  const { r } = conDescuento('');
  assert.equal(r.hay, true);
  assert.equal(r.descuento, 0);
  assert.equal(r.valido, true);
  assert.equal(r.problema, null);
  assert.equal(r.entregar, 600, 'sin descuento se entrega todo lo marcado');
});

test('resumenDelDescuento: un cero TECLEADO es válido (el mensaje promete «de cero o más»)', () => {
  const { r } = conDescuento('0');
  assert.equal(r.valido, true, 'cero es un descuento válido: no descontar nada');
  assert.equal(r.problema, null);
  assert.equal(r.descuento, 0);
  assert.equal(r.entregar, 600);
});

test('resumenDelDescuento: un descuento JUSTO en el tope se acepta; uno solo arriba del tope, no', () => {
  const justo = conDescuento('600').r;
  assert.equal(justo.valido, true, 'el tope se puede usar completo, no se queda a un quetzal');
  assert.equal(justo.descuento, 600);
  assert.equal(justo.entregar, 0, 'se le descuenta todo lo que se le iba a pagar');
  const pasado = conDescuento('600.01').r;
  assert.equal(pasado.valido, false);
  assert.equal(pasado.problema, 'excede');
});

test('resumenDelDescuento: lo que no es un monto, o es negativo, es «ilegible» y NO enseña ninguna cifra', () => {
  for (const malo of ['abc', '-5', '1..5', '12 34x']) {
    const { r } = conDescuento(malo);
    assert.equal(r.valido, false, malo);
    assert.equal(r.problema, 'ilegible', malo);
    assert.equal(r.descuento, 0, `${malo}: un valor ilegible no se convierte en un descuento de uno`);
    assert.equal(r.entregar, null, `${malo}: no se enseña ninguna cifra hasta que se arregle`);
  }
});

test('resumenDelDescuento: el monto se escribe NORMAL y la coma de los miles y la Q se perdonan', () => {
  // Decisión del dueño del 23 de noviembre de 2026: «Lo escribo normal y que se pongan las comas solas».
  // Desde que el campo es de texto (para poder MOSTRAR la coma), la coma llega hasta aquí: antes la
  // borraba el navegador. Lo que él ya podía escribir tiene que seguir valiendo lo mismo.
  for (const escrito of ['500', '500.00', 'Q500', 'Q 500.00', ' 500 ']) {
    const { r } = conDescuento(escrito);
    assert.equal(r.descuento, 500, escrito);
    assert.equal(r.valido, true, escrito);
  }
  // Y con coma: «1,500» son mil quinientos, así que pasa del tope de Q600 — «excede», no «ilegible».
  const conComa = conDescuento('1,500').r;
  assert.equal(conComa.problema, 'excede', 'la coma se lee: son 1500, no un error de escritura');
  const tope = conDescuento('Q600.00').r;
  assert.equal(tope.valido, true);
  assert.equal(tope.descuento, 600);
  // El punto es SIEMPRE el punto decimal, como en toda la pantalla: «1.500» son uno punto cinco.
  assert.equal(conDescuento('1.500').r.descuento, 1.5, 'no se adivina que quiso decir mil quinientos');
});

test('resumenDelDescuento: un descuento que pasa del tope es «excede», no se aplica a medias', () => {
  const { r } = conDescuento('999999');
  assert.equal(r.valido, false);
  assert.equal(r.problema, 'excede');
  assert.equal(r.descuento, 0, 'no se recorta al tope sin decirlo: se rechaza y él decide');
  assert.equal(r.entregar, null);
});

test('textoDelProblemaDelDescuento: dice QUÉ pasó, y el de «excede» trae las tres cifras', () => {
  assert.equal(
    textoDelProblemaDelDescuento(conDescuento('abc').r),
    'El descuento tiene que ser un monto de cero o más.',
  );
  const excede = textoDelProblemaDelDescuento(conDescuento('999999').r);
  assert.equal(
    excede,
    'El descuento no puede pasar de Q600.00: a este dueño se le pagó de más Q900.00 y las rentas marcadas suman Q600.00.',
  );
  assert.equal(textoDelProblemaDelDescuento(conDescuento('100').r), '', 'sin problema, ni una palabra');
  assert.equal(textoDelProblemaDelDescuento({ problema: null }), '');
});

test('resumenDeMarcadas: una diferencia con dos rentas se cae completa si a UNA le falta el costo', () => {
  // Dos rentas pagadas en un mismo comprobante y las dos corregidas después: una sola diferencia con dos
  // contratos. Si el costo de una no se pudo leer, la diferencia entera queda fuera de lo que se paga: no
  // se paga media diferencia con una cifra que no se conoce. (`.some` y no `.every`.)
  const cierreA = saldado(recibido(salida({ id: 'y1', numero: 61, placas: 'P-YYY111', costoDia: 300, cliente: ROSA }), 0));
  const cierreB = saldado(recibido(salida({ id: 'y2', numero: 62, placas: 'P-YYY222', costoDia: 300, cliente: ROSA }), 0));
  const pago = pagoDuenoParaGuardar(
    construirPagoDueno({
      duenoId: 'd1', fecha: '2026-09-20', forma: 'transferencia', contratos: [alLeer(cierreA), alLeer(cierreB)], pagos: [], idsMarcados: ['y1', 'y2'],
    }),
    { id: 'pg-y', numero: 10, ahora: AHORA },
  );
  const crecidas = [alLeer(saldado(recibido(cierreA, 2))), alLeer(saldado(recibido(cierreB, 2)))];
  const conTodo = (costoSinLeer) => {
    const entrada = entradaDe(armarVista(lecturaConPagoDeMas({ contratos: crecidas, pagos: [pago], costoSinLeer })), 'Mario López Alvarado');
    const todas = new Set([...entrada.cuenta.porPagar.map((c) => c.id), ...entrada.cuenta.diferencias.map((d) => d.clave)]);
    return resumenDeMarcadas(entrada, todas, costoSinLeer);
  };
  assert.deepEqual(conTodo([]).ids, ['dif:y1+y2'], 'con los dos costos legibles, la diferencia se puede pagar');
  assert.equal(conTodo([]).total, 1200);
  assert.deepEqual(conTodo(['y1']).ids, [], 'con UNA sola ilegible, la diferencia entera queda fuera');
  assert.equal(conTodo(['y1']).total, 0);
});

test('los campos donde él escribe un monto son de TEXTO: si no, la coma no se puede ni mostrar', () => {
  // Un `type="number"` no admite comas — el navegador las borra — así que el campo nunca podría enseñar
  // «1,500.00». Esta prueba existe para que nadie los devuelva a `type="number"` creyendo que es más
  // estricto: la validación del monto no la hace el navegador, la hace `montoTecleado` + `resumenDelDescuento`.
  const lectura = lecturaConPagoDeMas();
  const conDescuentoAbierto = fichaDe('Mario López Alvarado', {
    vista: armarVista(lectura),
    lectura,
    ui: uiVacia({ pagando: true, marcados: new Set(['x2']) }),
  });
  assert.match(conDescuentoAbierto, /<input type="text" id="dn-descuento"[^>]*inputmode="decimal"/, 'el descuento');
  assert.doesNotMatch(conDescuentoAbierto, /id="dn-descuento"[^>]*type="number"/);

  const conCostoAbierto = fichaDe('Mario López Alvarado', { ui: uiVacia({ anotando: 'm5' }) });
  assert.match(conCostoAbierto, /<input type="text" id="dn-costo-input"[^>]*inputmode="decimal"/, 'el costo por día');
  assert.doesNotMatch(conCostoAbierto, /id="dn-costo-input"[^>]*type="number"/);
});

// ===========================================================================
// El CABLEADO de la pantalla de dinero: qué pasa cuando él aprieta algo
// ===========================================================================
//
// Por qué existe este bloque (23 de noviembre de 2026). La medición de mutaciones dio que `pintarCuentas`
// atrapaba el 5 % de los errores que se le metían: 335 de 354 pasaban sin que nada se pusiera rojo. Es la
// función más grande del área de dinero y es la que conecta lo que él aprieta con las funciones que
// deciden el dinero — las de decidir sí estaban vigiladas; el cable que las une, no.
//
// No se podía probar: hacía falta un navegador, una sesión de Firebase de verdad y la nube. Ahora
// `pintarCuentas` recibe sus aparatos (ver su comentario), y aquí se le pone una pantalla de mentira que
// **solo encuentra lo que la pantalla dibujó de verdad** (`fixtures/pantallaDeMentira.mjs`, con sus diez
// controles en `pantalla-de-mentira.test.mjs`), el lector DE VERDAD con una lectura de mentira, y espías
// en lugar de los guardados.

/** Monta la pantalla de dinero con todo de mentira menos ella misma, y devuelve con qué apretarla. */
async function pantallaDeDinero({
  lectura = lecturaOk(),
  clave = null,
  sesion = true,
  responder = () => true,
  pagar,
  anular,
  anotarCosto,
  enlazarAlDueno,
  migrarCostos,
  dibujarComprobante,
  ruta = clave === null ? '#/dinero' : `#/dinero/cuenta/${encodeURIComponent(clave)}`,
} = {}) {
  const p = pantallaDeMentira();
  const lecturas = [];
  const lector = crearLector({ leer: async () => { lecturas.push(Date.now()); return lectura; } });
  const preguntas = [];
  const pagos = [];
  const anulaciones = [];
  const dichos = [];
  const costos = [];
  const altas = [];
  const enlaces = [];
  const direcciones = [];
  let idsAcunados = 0;
  const comprobantes = [];
  const migraciones = [];
  let rutaActual = ruta;
  let sesionAbierta = sesion;
  const aparatos = {
    lector,
    sesionAbierta: () => sesionAbierta,
    ahora: () => HOY,
    doc: p.documento,
    preguntar: (texto) => { preguntas.push(texto); return responder(texto); },
    rutaDeAhora: () => rutaActual,
    irA: (r) => { rutaActual = r; },
    pagar: pagar ?? (async (args) => { pagos.push(args); return { tipo: 'guardado', pago: { id: 'pg-nuevo', numero: 9 }, pagos: lectura.pagos.datos }; }),
    anular: anular ?? (async (args) => { anulaciones.push(args); return { pagos: lectura.pagos.datos }; }),
    avisar: (texto, tipo) => dichos.push({ texto, tipo }),
    anotarCosto: anotarCosto ?? (async (contrato, costo) => { costos.push({ id: contrato.id, costo }); return costo; }),
    guardarElDueno: async (registro) => { altas.push(registro); return registro; },
    enlazarAlDueno: enlazarAlDueno ?? (async (ids, duenoId) => { enlaces.push({ ids, duenoId }); }),
    cambiarLaDireccion: (r) => direcciones.push(r),
    acunarIdDeDueno: async () => `d-nuevo-${++idsAcunados}`,
    dibujarComprobante: dibujarComprobante ?? ((_caja, modelo) => { comprobantes.push(modelo); }),
    migrarCostos: migrarCostos ?? (async (args) => {
      migraciones.push(args);
      return { movidos: 3, conflictos: [], fallidos: [], copiaLocalLimpia: true };
    }),
  };
  if (clave === null) await pintarDinero(p.contenedor, aparatos);
  else await pintarCuentaDeDueno(p.contenedor, clave, aparatos);
  return {
    ...p,
    lector,
    preguntas,
    pagos,
    anulaciones,
    dichos,
    costos,
    altas,
    enlaces,
    direcciones,
    comprobantes,
    migraciones,
    lecturas,
    ruta: () => rutaActual,
    /** Cierra la sesión de dinero por detrás, como la cierra Firebase cuando se le vence el permiso. */
    cerrarLaSesion() { sesionAbierta = false; },
  };
}

const CLAVE_MARIO = 'id:d1';
/** El recuadro de marcar de una renta: no tiene id, se distingue por su data-id. */
const LA_RENTA = (id) => `[data-dn="marcar"][data-id="${id}"]`;

test('el cableado: la pantalla se dibuja con los dueños de la lectura, sin tocar la nube', async () => {
  const p = await pantallaDeDinero();
  assert.match(p.html(), /Mario López Alvarado/);
  assert.match(p.html(), /Lucía Barrios/);
  assert.ok(p.hay('tr[data-dn-clave]'), 'cada dueño trae su fila con su clave');
});

test('el cableado: sin sesión de dinero no se dibuja ninguna cifra, se pide la contraseña', async () => {
  const p = await pantallaDeDinero({ sesion: false });
  assert.doesNotMatch(p.html(), /Mario López Alvarado/, 'ni un nombre');
  assert.doesNotMatch(p.html(), /Q\d/, 'ni una cifra');
  assert.ok(p.hay('#dn-entrada'), 'la puerta, con su campo de contraseña');
});

test('el cableado: un clic en la fila de un dueño abre SU cuenta, no la de otro', async () => {
  const p = await pantallaDeDinero();
  const fila = p.raiz.querySelectorAll('tr[data-dn-clave]')[0];
  p.lanzar('click', fila);
  assert.equal(p.ruta(), `#/dinero/cuenta/${encodeURIComponent(fila.dataset.dnClave)}`);
  assert.notEqual(fila.dataset.dnClave, undefined, 'la fila lleva de quién es');
});


/** Marca una renta y abre el formulario de pago, que es lo que él hace antes de guardar nada. */
async function conElFormularioDePago(opciones = {}) {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, ...opciones });
  p.marcar(LA_RENTA('m1'));
  p.clic('[data-dn="registrar"]');
  return p;
}

test('el cableado: marcar una renta mueve el total de lo marcado, sin redibujar la ficha', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  const total = () => p.buscar('#dn-total-marcado').textContent;
  assert.equal(p.buscar('#dn-marcadas').textContent, '0', 'arranca sin nada marcado');
  p.marcar(LA_RENTA('m1'));
  assert.equal(total(), 'Q1,200.00', 'la renta m1 son 4 días a Q300');
  p.marcar(LA_RENTA('m2'));
  assert.equal(total(), 'Q3,000.00', 'y con m2 (6 × 300) suman Q3,000');
  p.marcar(LA_RENTA('m2'), false);
  assert.equal(total(), 'Q1,200.00', 'al desmarcar se vuelve a restar');
});

test('el cableado: el botón de registrar NO se puede apretar sin nada marcado', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  assert.equal(p.buscar('[data-dn="registrar"]').disabled, true, 'sin marcar nada');
  p.marcar(LA_RENTA('m1'));
  assert.equal(p.buscar('[data-dn="registrar"]').disabled, false, 'con una renta marcada ya se puede');
});

test('el cableado: una fecha de pago que todavía no llega NO gasta un número de comprobante', async () => {
  // Reemplaza a una prueba que leía el TEXTO del código para ver que se preguntaba por la fecha antes de
  // registrar. Esto lo aprieta de verdad: con «2062» por «2026» el comprobante salía fechado en 2062 y
  // no había cómo corregirlo (hay que anularlo, y el número queda gastado).
  const p = await conElFormularioDePago();
  p.lanzar('change', '#dn-fecha', { value: '2062-01-05' });
  p.clic('#dn-guardar-pago');
  assert.deepEqual(p.pagos, [], 'no se registró nada');
  assert.match(p.html(), /La fecha del pago todavía no llega/, 'y se le dice por qué');
});

test('el cableado: con todo en orden, «Guardar pago» registra lo marcado, con su forma y su fecha', async () => {
  const p = await conElFormularioDePago();
  p.lanzar('change', '#dn-fecha', { value: HOY });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.pagos.length, 1, 'se registró una vez');
  assert.deepEqual(p.pagos[0].idsMarcados, ['m1'], 'exactamente lo que él marcó');
  assert.equal(p.pagos[0].fecha, HOY);
  assert.equal(p.pagos[0].entrada.nombre, 'Mario López Alvarado', 'y a quién se le paga');
});

test('el cableado: «Anular» pregunta ANTES, y si él dice que no, no se anula nada', async () => {
  // Reemplaza a otra prueba que leía el texto del código. Anular un pago gasta su número de comprobante:
  // preguntar primero no es un detalle.
  const conPago = lecturaOk();
  const p = await pantallaDeDinero({ clave: 'id:d2', lectura: conPago, responder: () => false });
  const anularEn = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'anular-pago');
  assert.ok(anularEn, 'la ficha de Lucía trae su pago con su botón de anular');
  p.lanzar('click', anularEn);
  assert.equal(p.preguntas.length, 1, 'preguntó');
  assert.match(p.preguntas[0], /Lucía Barrios/, 'con el nombre de a quién se le anula');
  assert.deepEqual(p.anulaciones, [], 'y como dijo que no, no se anuló nada');
});

test('el cableado: «Anular» con un sí anula ESE pago, fechado hoy', async () => {
  const p = await pantallaDeDinero({ clave: 'id:d2', responder: () => true });
  const anularEn = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'anular-pago');
  p.lanzar('click', anularEn);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.anulaciones.length, 1);
  assert.equal(p.anulaciones[0].pago.id, 'pg-lucia', 'el que él apretó');
  assert.equal(p.anulaciones[0].hoy, HOY, 'la anulación queda fechada, y no se adivina');
});



test('el cableado: un pago YA ANULADO no vuelve a preguntar ni se anula dos veces', async () => {
  // Venía de una prueba que leía el texto del código buscando `pagoAnulado(pago)`. Ahora se aprieta.
  const anulado = { ...PAGO_A_LUCIA, anuladoEl: HOY, anulado: true };
  const p = await pantallaDeDinero({
    clave: 'id:d2',
    lectura: lecturaOk({ pagos: { datos: [anulado], fallo: false } }),
    responder: () => true,
  });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'anular-pago');
  if (boton) p.lanzar('click', boton);
  assert.deepEqual(p.preguntas, [], 'ni siquiera pregunta');
  assert.deepEqual(p.anulaciones, [], 'y no se anula otra vez');
});

test('el cableado: el descuento se lee MIENTRAS escribe y lo que entrega cambia al instante', async () => {
  // Sin esto, él teclea un descuento y la cifra de «Entregas ahora» se queda en la de antes hasta que algo
  // redibuje: entregaría de más creyendo que descontó. Y la ficha NO se redibuja al teclear a propósito,
  // porque eso le quitaría el cursor del campo.
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, lectura: lecturaConPagoDeMas() });
  p.marcar(LA_RENTA('x2'));
  p.clic('[data-dn="registrar"]');
  assert.ok(p.hay('#dn-descuento'), 'a este dueño se le pagó de más, así que el campo está');
  assert.equal(p.buscar('#dn-entregar').textContent, 'Q600.00', 'sin descuento entrega lo marcado');
  p.teclear('#dn-descuento', '100');
  assert.equal(p.buscar('#dn-entregar').textContent, 'Q500.00', 'con Q100 de descuento entrega Q500');
  p.teclear('#dn-descuento', '600');
  assert.equal(p.buscar('#dn-entregar').textContent, 'Q0.00', 'el tope se puede usar completo');
});

test('el cableado: un descuento que no se puede aplicar bloquea el guardado y dice por qué', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, lectura: lecturaConPagoDeMas() });
  p.marcar(LA_RENTA('x2'));
  p.clic('[data-dn="registrar"]');
  p.teclear('#dn-descuento', '999999');
  assert.equal(p.buscar('#dn-guardar-pago').disabled, true, 'no se puede guardar');
  assert.match(p.buscar('#dn-descuento-problema').textContent, /no puede pasar de Q600\.00/);
  assert.equal(p.buscar('#dn-entregar').textContent, '—', 'y no se enseña ninguna cifra hasta que se arregle');
  // Y si lo arregla, se puede otra vez.
  p.teclear('#dn-descuento', '600');
  assert.equal(p.buscar('#dn-guardar-pago').disabled, false);
});

test('el cableado: ni apretando «Guardar pago» con un descuento malo se registra nada', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, lectura: lecturaConPagoDeMas() });
  p.marcar(LA_RENTA('x2'));
  p.clic('[data-dn="registrar"]');
  p.teclear('#dn-descuento', 'abril');
  p.clic('#dn-guardar-pago');
  assert.deepEqual(p.pagos, [], 'el botón está apagado, pero si alguien lo aprieta igual, tampoco');
  assert.match(p.html(), /El descuento tiene que ser un monto de cero o más/);
});

test('el cableado: anotar el costo de una renta guarda el monto TECLEADO, con sus comas', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.clic('[data-dn="anotar-costo"][data-id="m5"]');
  assert.ok(p.hay('#dn-costo-input'), 'se abre la casilla para escribirlo');
  p.buscar('#dn-costo-input').value = '1,500';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.costos, [{ id: 'm5', costo: 1500 }], 'se guarda el NÚMERO, no el texto con coma');
});

test('el cableado: Escape cierra la casilla del costo sin guardar nada', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.clic('[data-dn="anotar-costo"][data-id="m5"]');
  p.buscar('#dn-costo-input').value = '300';
  p.tecla('#dn-costo-input', 'Escape');
  assert.equal(p.hay('#dn-costo-input'), false, 'la casilla se cierra');
  assert.deepEqual(p.costos, [], 'y no se guardó nada');
});

test('el cableado: Enter en la casilla del costo lo guarda, sin enviar ningún formulario', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.clic('[data-dn="anotar-costo"][data-id="m5"]');
  p.buscar('#dn-costo-input').value = '300';
  const ev = p.tecla('#dn-costo-input', 'Enter');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(ev.seEvito, true, 'se corta el Enter: si no, el navegador enviaría el formulario');
  assert.deepEqual(p.costos, [{ id: 'm5', costo: 300 }]);
});

test('el cableado: una lectura FALLIDA no dibuja ninguna cifra, dibuja la barra roja', async () => {
  const p = await pantallaDeDinero({ lectura: lecturaOk({ pagos: { datos: null, fallo: true } }) });
  assert.doesNotMatch(p.html(), /Q\d/, 'ni una cifra: cualquiera saldría incompleta');
  assert.match(p.html(), /No se pudieron leer los pagos a dueños/);
  assert.ok(p.hay('[data-dn="reintentar"]'), 'y se puede volver a leer');
});

test('el cableado: el descuento se manda con el PAGO, y es el que el núcleo dio por bueno', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, lectura: lecturaConPagoDeMas() });
  p.marcar(LA_RENTA('x2'));
  p.clic('[data-dn="registrar"]');
  p.teclear('#dn-descuento', 'Q100');
  p.lanzar('change', '#dn-fecha', { value: HOY });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.pagos.length, 1);
  assert.equal(p.pagos[0].descuento, 100, 'el número, no el texto «Q100» que él tecleó');
  assert.deepEqual(p.pagos[0].idsMarcados, ['x2']);
});

test('el cableado: si la cuenta CAMBIÓ mientras tanto, no se cierra el formulario: se le dice y se desmarca', async () => {
  // El caso feo: él marcó, alguien más corrigió un cierre, y guardar pagaría una renta que ya no es esa.
  const p = await pantallaDeDinero({
    clave: CLAVE_MARIO,
    pagar: async () => ({ tipo: 'cambio', pagos: [], contratos: null }),
  });
  p.marcar(LA_RENTA('m1'));
  p.clic('[data-dn="registrar"]');
  p.lanzar('change', '#dn-fecha', { value: HOY });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.html(), /Mientras tanto cambió la cuenta de este dueño/);
  assert.equal(p.buscar('#dn-total-marcado')?.textContent, 'Q0.00', 'lo marcado se suelta: hay que volver a mirar');
});

test('el cableado: cancelar el pago borra el descuento tecleado, no se queda para el siguiente', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, lectura: lecturaConPagoDeMas() });
  p.marcar(LA_RENTA('x2'));
  p.clic('[data-dn="registrar"]');
  p.teclear('#dn-descuento', '500');
  p.clic('[data-dn="cancelar-pago"]');
  p.clic('[data-dn="registrar"]');
  assert.equal(p.buscar('#dn-descuento').value, '', 'el campo arranca limpio');
  assert.equal(p.buscar('#dn-entregar').textContent, 'Q600.00', 'y entrega todo lo marcado');
});

test('el cableado: una renta cuyo costo no se pudo leer no se puede marcar para pagar', async () => {
  // Pagarla sería pagar una cifra que no se conoce.
  const sinCosto = lecturaOk({ contratos: { datos: TODOS, fallo: false, costoSinLeer: ['m1'] } });
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, lectura: sinCosto });
  const caja = p.buscar(LA_RENTA('m1'));
  assert.ok(caja, 'la renta se sigue viendo');
  assert.equal(caja.disabled, true, 'pero su recuadro no se puede marcar');
  p.marcar(LA_RENTA('m2'));
  assert.equal(p.buscar('#dn-total-marcado').textContent, 'Q1,800.00', 'las demás sí');
});

// ---------------------------------------------------------------------------
// Enlazar una cuenta escrita a mano con un dueño de la lista
// ---------------------------------------------------------------------------
// Dos contratos viejos traen el nombre del dueño escrito a mano, sin `duenoId`. Enlazarlos NO se puede
// deshacer desde el sistema, así que cada paso de aquí importa.

/** La cuenta de «Don Mario», que viene escrita a mano (clave `texto:`) y no está enlazada a ningún dueño. */
const CLAVE_A_MANO = 'texto:Don Mario';

test('el cableado: enlazar sin escoger a nadie no pregunta ni enlaza, solo lo dice', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_A_MANO });
  assert.ok(p.hay('#dn-enlazar-dueno'), 'la cuenta a mano ofrece enlazarse');
  p.clic('[data-dn="enlazar"]');
  assert.deepEqual(p.preguntas, [], 'no pregunta por algo que todavía no se puede hacer');
  assert.deepEqual(p.enlaces, []);
  assert.match(p.html(), /Escoge a qué dueño de la lista corresponde/);
});

test('el cableado: enlazar PREGUNTA antes, con cuántos contratos y a quién; un «no» no enlaza nada', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_A_MANO, responder: () => false });
  p.buscar('#dn-enlazar-dueno').value = 'd1';
  p.clic('[data-dn="enlazar"]');
  assert.equal(p.preguntas.length, 1);
  assert.match(p.preguntas[0], /¿Enlazar 1 contrato de «Don Mario» al dueño «Mario López Alvarado»\?/);
  assert.match(p.preguntas[0], /no se puede deshacer/);
  assert.deepEqual(p.enlaces, [], 'dijo que no: no se enlazó nada');
  assert.deepEqual(p.altas, [], 'ni se dio de alta a nadie');
});

test('el cableado: con un sí, se enlazan SUS contratos a ESE dueño y la cuenta cambia de dirección', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_A_MANO });
  p.buscar('#dn-enlazar-dueno').value = 'd1';
  p.clic('[data-dn="enlazar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.enlaces.length, 1);
  assert.deepEqual(p.enlaces[0].ids, ['t1'], 'exactamente los contratos de esa cuenta');
  assert.equal(p.enlaces[0].duenoId, 'd1');
  assert.deepEqual(p.direcciones, ['#/dinero/cuenta/id%3Ad1'], 'la cuenta pasa de «texto:» a «id:» sin volver a leer');
  assert.ok(p.dichos.some((d) => /Contratos enlazados/.test(d.texto)));
});

test('el cableado: «dar de alta y enlazar» crea al dueño con el nombre de la cuenta y le enlaza sus contratos', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_A_MANO });
  p.clic('[data-dn="crear-y-enlazar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.preguntas[0], /¿Dar de alta a «Don Mario» como dueño y enlazarle 1 contrato\?/);
  assert.equal(p.altas.length, 1);
  assert.equal(p.altas[0].nombre, 'Don Mario');
  assert.equal(p.enlaces[0].duenoId, p.altas[0].id, 'los contratos van al dueño que se acaba de crear');
});

test('el cableado: si el ENLACE falla, un reintento NO crea un segundo dueño con el mismo nombre', async () => {
  // Es la razón de ser de `altaConIdFijo`: el id se decide UNA vez, antes del primer intento. Sin eso, él
  // aprieta otra vez después de un fallo de internet y se queda con dos «Don Mario» en la lista de dueños,
  // uno con los contratos y otro vacío. Hasta hoy esto se cuidaba contando llamadas en el TEXTO del código.
  let falla = true;
  const intentos = [];
  const p = await pantallaDeDinero({
    clave: CLAVE_A_MANO,
    enlazarAlDueno: async (ids, duenoId) => {
      intentos.push({ ids, duenoId });
      if (falla) throw new Error('se cayó el internet');
    },
  });
  p.clic('[data-dn="crear-y-enlazar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.altas.length, 1, 'se creó el dueño');
  assert.match(p.html(), /No se pudieron enlazar los contratos/, 'y se dice que el enlace no se pudo');

  falla = false;
  p.clic('[data-dn="crear-y-enlazar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.altas.length, 2, 'se vuelve a intentar el alta…');
  assert.equal(p.altas[0].id, p.altas[1].id, '…pero con el MISMO id: es el mismo dueño, no uno nuevo');
  assert.equal(intentos.length, 2, 'se volvió a intentar el enlace');
  assert.equal(intentos[1].duenoId, p.altas[0].id, 'y los contratos van al dueño de siempre, no a uno nuevo');
  assert.deepEqual(intentos[0].ids, intentos[1].ids, 'los mismos contratos');
});


test('el cableado: «Ver comprobante» abre el comprobante DE ESE pago', async () => {
  const p = await pantallaDeDinero({ clave: 'id:d2' });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'comprobante');
  assert.ok(boton, 'el pago de Lucía trae su botón');
  p.lanzar('click', boton);
  assert.equal(p.comprobantes.length, 1);
  assert.equal(p.comprobantes[0].pago.id, 'pg-lucia', 'el que él apretó, no otro');
  assert.equal(p.comprobantes[0].dueno.nombre, 'Lucía Barrios', 'y a nombre de quién va el papel');
  assert.equal(p.comprobantes[0].hoy, HOY, 'fechado hoy');
});

test('el cableado: un pago ANULADO no abre comprobante ni a la fuerza', async () => {
  // Venía de una prueba que leía el texto del código buscando `pagoAnulado(pago)`. Un papel que sale de
  // la empresa no puede salir de un pago que ya no vale.
  const anulado = { ...PAGO_A_LUCIA, anuladoEl: HOY, anulado: true };
  const p = await pantallaDeDinero({ clave: 'id:d2', lectura: lecturaOk({ pagos: { datos: [anulado], fallo: false } }) });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'comprobante');
  if (boton) p.lanzar('click', boton);
  assert.deepEqual(p.comprobantes, [], 'no se abre nada');
});

test('el cableado: si el comprobante no se puede dibujar, se le dice y la pantalla no se rompe', async () => {
  const p = await pantallaDeDinero({
    clave: 'id:d2',
    dibujarComprobante: () => { throw new Error('se rompió al dibujar'); },
  });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'comprobante');
  p.lanzar('click', boton);
  assert.ok(p.dichos.some((d) => /No se pudo abrir el comprobante/.test(d.texto) && d.tipo === 'error'));
  assert.match(p.html(), /Lucía Barrios/, 'y la ficha sigue ahí');
});

test('el cableado: la migración PREGUNTA antes; un «no» no mueve nada', async () => {
  const p = await pantallaDeDinero({ responder: () => false });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'migrar');
  assert.ok(boton, 'la lista ofrece mover el costo');
  p.lanzar('click', boton);
  assert.equal(p.preguntas.length, 1);
  assert.match(p.preguntas[0], /no se puede deshacer/);
  assert.deepEqual(p.migraciones, [], 'dijo que no: no se movió nada');
});

test('el cableado: si la migración FALLA, nunca dice «0 contratos movidos»', async () => {
  // Sin sesión de dinero, o con la lectura caída, un «0 movidos» le haría creer que ya está hecho.
  const p = await pantallaDeDinero({
    responder: () => true,
    migrarCostos: async () => { throw new Error('no se pudo leer'); },
  });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'migrar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.doesNotMatch(p.html(), /0 contratos movidos|0 movidos/);
  assert.match(p.html(), /No se pudo mover el costo/);
});


// ---------------------------------------------------------------------------
// Cerrar el área de dinero: lo leído se suelta, y lo DIBUJADO también
// ---------------------------------------------------------------------------
// `olvidarLosDatos` es lo que corre cuando el área se cierra —a mano, o sola por inactividad—. Hasta hoy
// las pruebas de `cerrarElDinero` le ponían un espía en su lugar, así que la función de verdad no la
// ejercitaba nadie: 6 de sus 8 errores pasaban sin que nada se pusiera rojo.

test('el cableado: cerrar el área suelta lo leído Y VACÍA lo dibujado', async () => {
  // Lo ya dibujado también es dinero: quien abriera la consola lo leería de la página aunque la sesión
  // estuviera cerrada.
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  assert.match(p.html(), /Mario López Alvarado/, 'el control: la ficha está dibujada');
  assert.ok(p.lector.actual, 'y hay una lectura guardada');

  const cerrada = await cerrarElDinero({ salir: async () => {}, parar: () => {} });
  assert.equal(cerrada, true);
  assert.equal(p.html(), '', 'la página queda vacía: no hay de dónde leerlo');
});

test('el cableado: al cerrar, cada pantalla registrada suelta lo suyo', async () => {
  const soltaron = [];
  const quitarA = alOlvidarElDinero(() => soltaron.push('A'));
  const quitarB = alOlvidarElDinero(() => soltaron.push('B'));
  try {
    await cerrarElDinero({ salir: async () => {}, parar: () => {} });
    assert.deepEqual(soltaron.sort(), ['A', 'B']);
  } finally { quitarA(); quitarB(); }
});

test('el cableado: una pantalla que FALLA al soltar no deja a las demás con dinero en memoria', async () => {
  const soltaron = [];
  const quitarMala = alOlvidarElDinero(() => { throw new Error('esta pantalla se rompió'); });
  const quitarBuena = alOlvidarElDinero(() => soltaron.push('la buena'));
  const errores = [];
  const consolaReal = console.error;
  console.error = (...args) => errores.push(args.join(' '));
  try {
    await cerrarElDinero({ salir: async () => {}, parar: () => {} });
    assert.deepEqual(soltaron, ['la buena'], 'la otra soltó lo suyo igual');
    assert.ok(errores.some((e) => /no pudo soltar lo que leyó/.test(e)), 'y el fallo queda escrito');
  } finally { console.error = consolaReal; quitarMala(); quitarBuena(); }
});

test('el cableado: quien se dio de baja ya no se entera de los cierres siguientes', async () => {
  const soltaron = [];
  const quitar = alOlvidarElDinero(() => soltaron.push('yo'));
  quitar();
  await cerrarElDinero({ salir: async () => {}, parar: () => {} });
  assert.deepEqual(soltaron, [], 'ya no se le llama');
});

test('el cableado: al cerrar el área, la pantalla suelta LO QUE ELLA LEYÓ', async () => {
  // Es lo más importante de cerrar: la página se vacía, pero si lo leído sigue en memoria basta con que
  // algo la vuelva a dibujar para que el costo de cada dueño salga otra vez sin contraseña.
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  assert.ok(p.lector.actual, 'el control: la pantalla tiene su lectura guardada');

  const cerrada = await cerrarElDinero({ salir: async () => {}, parar: () => {} });
  assert.equal(cerrada, true);
  assert.equal(p.lector.actual, null, 'y al cerrar la suelta');
  assert.equal(p.html(), '', 'la página también queda vacía');
});

test('el cableado: montar la pantalla otra vez NO deja olvidadores colgados', async () => {
  // Cada vuelta por el área de dinero registra el lector de esa vuelta. Si no se diera de baja el
  // anterior, se irían amontonando para siempre, y cada cierre llamaría a todos los de todas las vueltas.
  const primera = await pantallaDeDinero({ clave: CLAVE_MARIO });
  const segunda = await pantallaDeDinero({ clave: CLAVE_MARIO });
  await cerrarElDinero({ salir: async () => {}, parar: () => {} });
  assert.equal(segunda.lector.actual, null, 'la puesta suelta lo suyo');
  assert.ok(primera.lector.actual, 'la anterior ya no está registrada: se dio de baja al montarse la otra');
});

// ---------------------------------------------------------------------------
// Anotar el costo de una renta: lo que pasa DESPUÉS de apretar «Guardar»
// ---------------------------------------------------------------------------
// De los 25 errores que se le pueden meter a `guardarCosto`, 22 pasaban sin que nada se pusiera rojo
// (medición del 24 de noviembre de 2026): el peor número de la pantalla. Y es un monto que él teclea.

/** Abre la casilla del costo de la renta m5 (la única cerrada sin costo anotado) y devuelve la pantalla. */
async function conLaCasillaDelCosto(opciones = {}) {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, ...opciones });
  p.clic('[data-dn="anotar-costo"][data-id="m5"]');
  return p;
}

test('el costo anotado le queda a ESA renta, no a las demás', async () => {
  // Con un `===` por un `!==` aquí, el costo se le pegaba a TODAS las otras rentas del dueño y a esa no.
  const p = await conLaCasillaDelCosto();
  p.buscar('#dn-costo-input').value = '450';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  const porId = Object.fromEntries(p.lector.actual.contratos.datos.map((c) => [c.id, costoDelDocumento(c)]));
  assert.equal(porId.m5, 450, 'la renta que él anotó');
  assert.equal(porId.m1, 300, 'las demás se quedan con el suyo');
  assert.equal(porId.m2, 300);
});

test('después de anotarlo, la casilla se cierra y el costo se ve en la ficha', async () => {
  const p = await conLaCasillaDelCosto();
  p.buscar('#dn-costo-input').value = '450';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.hay('#dn-costo-input'), false, 'la casilla se cierra sola');
  assert.doesNotMatch(p.html(), /Sin costo anotado/, 'y la renta deja de salir sin costo');
  assert.ok(p.dichos.some((d) => /Costo anotado: Q450\.00 por día/.test(d.texto) && d.tipo === 'exito'),
    'se le dice cuánto quedó anotado, y como algo que salió bien');
});

test('dos clics seguidos en «Guardar» no anotan el costo dos veces', async () => {
  const p = await conLaCasillaDelCosto();
  p.buscar('#dn-costo-input').value = '450';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.costos.length, 1, 'el segundo clic encuentra la pantalla ocupada y no hace nada');
});

test('sin sesión de dinero no se anota ningún costo', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.clic('[data-dn="anotar-costo"][data-id="m5"]');
  p.buscar('#dn-costo-input').value = '450';
  p.cerrarLaSesion();
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.costos, [], 'el costo del dueño no se escribe sin la contraseña');
});

test('si anotar el costo FALLA, se le dice y la casilla NO se cierra', async () => {
  // Cerrarla le haría creer que quedó anotado, y el costo es lo que decide cuánto se le debe al dueño.
  const p = await conLaCasillaDelCosto({
    anotarCosto: async () => { throw new Error('se cayó el internet'); },
  });
  p.buscar('#dn-costo-input').value = '450';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.ok(p.dichos.some((d) => /No se pudo guardar el costo/.test(d.texto) && d.tipo === 'error'));
  assert.ok(p.hay('#dn-costo-input'), 'la casilla sigue abierta para volver a intentarlo');
  const m5 = p.lector.actual.contratos.datos.find((c) => c.id === 'm5');
  assert.equal(costoDelDocumento(m5), 0, 'y la renta sigue sin costo: no se apunta en memoria lo que no se guardó');
});

test('después de un fallo se puede volver a intentar: la pantalla no se queda ocupada', async () => {
  let falla = true;
  const intentos = [];
  const p = await conLaCasillaDelCosto({
    anotarCosto: async (contrato, costo) => {
      intentos.push(costo);
      if (falla) throw new Error('se cayó el internet');
      return costo;
    },
  });
  p.buscar('#dn-costo-input').value = '450';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  falla = false;
  p.buscar('#dn-costo-input').value = '450';
  p.clic('[data-dn="guardar-costo"][data-id="m5"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(intentos, [450, 450], 'el segundo intento sí corre');
  assert.equal(p.hay('#dn-costo-input'), false, 'y esta vez sí quedó anotado');
});

// ---------------------------------------------------------------------------
// Anular un pago: lo que pasa DESPUÉS, según lo que conteste el guardado
// ---------------------------------------------------------------------------
// 27 de los 35 errores de `anularPagoDeDueno` pasaban sin que nada se pusiera rojo. Anular gasta el
// número de comprobante: lo que se le diga después no es un detalle.

/** La ficha de Lucía, que trae su pago, y el botón de anularlo. */
async function conElPagoDeLucia(opciones = {}) {
  const p = await pantallaDeDinero({ clave: 'id:d2', responder: () => true, ...opciones });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'anular-pago');
  return { p, boton };
}

test('anular un pago: se le dice con el número de comprobante y dónde queda', async () => {
  const { p, boton } = await conElPagoDeLucia({
    anular: async () => ({ tipo: 'anulado', pago: { ...PAGO_A_LUCIA, numero: 3 }, pagos: [] }),
  });
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  const dicho = p.dichos.at(-1);
  assert.match(dicho.texto, /comprobante N\.° 3 queda en «Ya pagado», marcado como anulado/);
  assert.equal(dicho.tipo, 'exito');
});

test('anular un pago que YA ESTABA anulado se dice distinto: no se anuncia como recién hecho', async () => {
  // Otra computadora lo anuló mientras tanto. Decirle «Pago anulado» le haría creer que lo hizo él ahora.
  const { p, boton } = await conElPagoDeLucia({
    anular: async () => ({ tipo: 'ya-anulado', pago: { ...PAGO_A_LUCIA, numero: 3 }, pagos: [] }),
  });
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.dichos.at(-1).texto, /Ese pago ya estaba anulado \(comprobante N\.° 3\)/);
});

test('anular un pago que YA NO ESTÁ en la lista se avisa como error, no como éxito', async () => {
  const { p, boton } = await conElPagoDeLucia({
    anular: async () => ({ tipo: 'no-esta', pago: null, pagos: [] }),
  });
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.dichos.at(-1).tipo, 'error');
  assert.match(p.dichos.at(-1).texto, /Este pago ya no está en la lista de pagos/);
  assert.ok(!p.dichos.some((d) => /Pago anulado/.test(d.texto)), 'nunca se dice que se anuló');
});

test('anular: la lista de pagos queda como la dejó el guardado, no como estaba en pantalla', async () => {
  const anuladoEnLaNube = { ...PAGO_A_LUCIA, anulado: true, anuladoEl: HOY };
  const { p, boton } = await conElPagoDeLucia({
    anular: async () => ({ tipo: 'anulado', pago: anuladoEnLaNube, pagos: [anuladoEnLaNube] }),
  });
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.lector.actual.pagos.datos, [anuladoEnLaNube], 'lo que contestó la nube es la verdad');
});

test('anular: si el guardado FALLA, se le dice y no se toca la lista de pagos', async () => {
  const { p, boton } = await conElPagoDeLucia({
    anular: async () => { throw new Error('se cayó el internet'); },
  });
  const antes = p.lector.actual.pagos.datos;
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.dichos.at(-1).tipo, 'error');
  assert.match(p.dichos.at(-1).texto, /No se pudo anular el pago/);
  assert.deepEqual(p.lector.actual.pagos.datos, antes, 'la lista se queda como estaba');
});

test('anular: dos clics seguidos no anulan dos veces', async () => {
  const intentos = [];
  const { p, boton } = await conElPagoDeLucia({
    anular: async (args) => { intentos.push(args); return { tipo: 'anulado', pago: PAGO_A_LUCIA, pagos: [] }; },
  });
  p.lanzar('click', boton);
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(intentos.length, 1, 'el segundo encuentra la pantalla ocupada');
  assert.equal(p.preguntas.length, 1, 'y ni siquiera vuelve a preguntar');
});

// ---------------------------------------------------------------------------
// Registrar un pago: lo que pasa DESPUÉS, según lo que conteste el guardado
// ---------------------------------------------------------------------------
// 39 de los 54 errores de `guardarPago` pasaban. Lo de «qué se aprieta» ya estaba cubierto; esto es lo
// que la pantalla hace con cada clase de respuesta.

/** Marca la renta m1 de Mario, abre el formulario, pone la fecha de hoy y aprieta Guardar. */
async function registrarUnPago(opciones = {}) {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO, ...opciones });
  p.marcar(LA_RENTA('m1'));
  p.clic('[data-dn="registrar"]');
  p.lanzar('change', '#dn-fecha', { value: HOY });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  return p;
}

test('registrar un pago: se le dice el número de comprobante y el formulario se cierra', async () => {
  const p = await registrarUnPago({
    pagar: async () => ({ tipo: 'guardado', pago: { id: 'pg-9', numero: 9 }, pagos: [] }),
  });
  assert.match(p.dichos.at(-1).texto, /Pago registrado\. Comprobante N\.° 9\./);
  assert.equal(p.dichos.at(-1).tipo, 'exito');
  assert.equal(p.hay('#dn-guardar-pago'), false, 'el formulario se cierra: ya no hay nada que guardar');
  assert.equal(p.buscar('#dn-total-marcado')?.textContent, 'Q0.00', 'y lo marcado se suelta');
});

test('un pago que YA ESTABA registrado se dice distinto: no se anuncia como recién hecho', async () => {
  // Él apretó dos veces, o se le cayó el internet y volvió a intentar. Decirle «Pago registrado» le haría
  // creer que son dos pagos.
  const p = await registrarUnPago({
    pagar: async () => ({ tipo: 'ya-guardado', pago: { id: 'pg-9', numero: 9 }, pagos: [] }),
  });
  assert.match(p.dichos.at(-1).texto, /Ese pago ya estaba registrado \(comprobante N\.° 9\)/);
  assert.equal(p.hay('#dn-guardar-pago'), false, 'y el formulario también se cierra');
});

test('si la cuenta CAMBIÓ, el formulario se queda abierto y lo marcado se suelta', async () => {
  // Es lo contrario del caso bueno: hay que volver a mirar antes de pagar otra cosa.
  const p = await registrarUnPago({ pagar: async () => ({ tipo: 'cambio', pagos: [] }) });
  assert.ok(p.hay('#dn-guardar-pago'), 'el formulario sigue abierto');
  assert.match(p.html(), /Mientras tanto cambió la cuenta de este dueño/);
  assert.equal(p.buscar('#dn-total-marcado')?.textContent, 'Q0.00', 'lo marcado se suelta');
  assert.ok(!p.dichos.some((d) => /Pago registrado/.test(d.texto)), 'y nunca se dice que se registró');
});

test('si el guardado FALLA, el formulario se queda abierto CON el mensaje, y se puede reintentar', async () => {
  let falla = true;
  const intentos = [];
  const p = await registrarUnPago({
    pagar: async (args) => {
      intentos.push(args);
      if (falla) throw new Error('se cayó el internet');
      return { tipo: 'guardado', pago: { id: 'pg-9', numero: 9 }, pagos: [] };
    },
  });
  assert.ok(p.hay('#dn-guardar-pago'), 'sigue abierto');
  assert.match(p.html(), /No se pudo registrar el pago/);
  assert.ok(!p.dichos.some((d) => d.tipo === 'exito'), 'no se canta nada como hecho');

  falla = false;
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(intentos.length, 2, 'se puede volver a intentar: la pantalla no se queda ocupada');
  assert.deepEqual(intentos[1].idsMarcados, intentos[0].idsMarcados, 'con lo mismo que él había marcado');
});

test('registrar: el reintento lleva el MISMO `enCurso`, para que el guardado reconozca su propio pago', async () => {
  // Es lo que evita el pago doble cuando se cae el internet justo al guardar: el segundo intento llega con
  // la misma marca y el guardado contesta «ya-guardado» en vez de cobrar otra vez.
  let falla = true;
  const intentos = [];
  const p = await registrarUnPago({
    pagar: async (args) => {
      intentos.push(args.enCurso);
      if (falla) throw new Error('se cayó el internet');
      return { tipo: 'guardado', pago: { id: 'pg-9', numero: 9 }, pagos: [] };
    },
  });
  falla = false;
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(intentos.length, 2);
  assert.strictEqual(intentos[0], intentos[1], 'la misma marca, no una nueva');
});

test('registrar: dos clics seguidos no registran dos pagos', async () => {
  const intentos = [];
  const p = await pantallaDeDinero({
    clave: CLAVE_MARIO,
    pagar: async (args) => { intentos.push(args); return { tipo: 'guardado', pago: { id: 'pg-9', numero: 9 }, pagos: [] }; },
  });
  p.marcar(LA_RENTA('m1'));
  p.clic('[data-dn="registrar"]');
  p.lanzar('change', '#dn-fecha', { value: HOY });
  p.clic('#dn-guardar-pago');
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(intentos.length, 1);
});

// ---------------------------------------------------------------------------
// El despachador: cada botón a SU acción, y lo que no es un botón no hace nada
// ---------------------------------------------------------------------------
// 44 de los 99 errores de los oyentes de eventos pasaban sin que nada se pusiera rojo. Es el reparto: un
// error aquí no rompe una cuenta, hace que un botón haga lo de otro.

test('el despachador: «Actualizar» vuelve a leer, forzando', async () => {
  const p = await pantallaDeDinero();
  const antes = p.lecturas.length;
  p.clic('[data-dn="actualizar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.lecturas.length, antes + 1, 'se pide la lectura otra vez');
});

test('el despachador: «Cancelar» cierra la casilla del costo sin guardar', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.clic('[data-dn="anotar-costo"][data-id="m5"]');
  assert.ok(p.hay('#dn-costo-input'));
  p.clic('[data-dn="cancelar-costo"]');
  assert.equal(p.hay('#dn-costo-input'), false);
  assert.deepEqual(p.costos, [], 'y no se anotó nada');
});

test('el despachador: «Cancelar» del pago cierra el formulario y suelta lo marcado', async () => {
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.marcar(LA_RENTA('m1'));
  p.clic('[data-dn="registrar"]');
  assert.ok(p.hay('#dn-guardar-pago'));
  p.clic('[data-dn="cancelar-pago"]');
  assert.equal(p.hay('#dn-guardar-pago'), false, 'el formulario se cierra');
  assert.deepEqual(p.pagos, [], 'y no se registró nada');
});

test('el despachador: un clic en un ENLACE de la fila no abre además la cuenta', async () => {
  // Las filas de la lista se abren con un clic en cualquier parte. Si el enlace de adentro contara
  // también, un clic haría las dos cosas y él acabaría en una pantalla que no pidió.
  const p = await pantallaDeDinero();
  const rutaAntes = p.ruta();
  const enlaces = p.raiz.querySelectorAll('a');
  const dentroDeUnaFila = enlaces.find((a) => a.closest('tr[data-dn-clave]'));
  if (dentroDeUnaFila) {
    p.lanzar('click', dentroDeUnaFila);
    assert.equal(p.ruta(), rutaAntes, 'el enlace se encarga; la fila no se mete');
  }
  // El control: un clic en la fila FUERA del enlace sí abre la cuenta.
  const fila = p.raiz.querySelectorAll('tr[data-dn-clave]')[0];
  p.lanzar('click', fila);
  assert.notEqual(p.ruta(), rutaAntes);
});

test('el despachador: un `data-dn` que no existe no hace NADA', async () => {
  // El `default: return` del reparto. Sin él, un botón nuevo mal escrito caería en la acción de al lado.
  const p = await pantallaDeDinero({ clave: CLAVE_MARIO });
  p.raiz.innerHTML = `${p.html()}<button id="inventado" data-dn="esto-no-existe" data-id="m1">x</button>`;
  p.clic('#inventado');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual([p.pagos, p.anulaciones, p.costos, p.migraciones, p.enlaces], [[], [], [], [], []]);
  assert.deepEqual(p.preguntas, [], 'ni siquiera pregunta nada');
});

// ---------------------------------------------------------------------------
// La mudanza del costo: lo que se le dice según cómo haya salido
// ---------------------------------------------------------------------------

/** Aprieta «mover el costo» en la lista y espera a que termine. */
async function moverElCosto(resultado, opciones = {}) {
  const p = await pantallaDeDinero({
    responder: () => true,
    migrarCostos: typeof resultado === 'function' ? resultado : async () => resultado,
    ...opciones,
  });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'migrar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  return p;
}

test('la mudanza: si sale limpia, se dice cuántos se movieron y NO se marca como problema', async () => {
  const p = await moverElCosto({ migrados: 3, conflictos: [], fallidos: [], copiaLocalLimpia: true });
  assert.match(p.html(), /Se movieron 3 contratos detrás de la contraseña de dinero/);
  assert.doesNotMatch(p.html(), /barra-lectura-fallida/, 'salió bien: nada en rojo');
});

test('la mudanza: un CONFLICTO se marca como problema, con el número del contrato', async () => {
  // Un contrato que trae un costo distinto al ya guardado no se toca: hay que mirarlo a mano.
  const p = await moverElCosto({ migrados: 1, conflictos: [{ numero: 41 }], fallidos: [], copiaLocalLimpia: true });
  assert.match(p.html(), /41/, 'dice cuál');
  assert.match(p.html(), /barra-lectura-fallida/, 'y sale marcado como problema');
});

test('la mudanza: lo que NO se pudo mover se marca como problema, aunque otros sí se movieran', async () => {
  const p = await moverElCosto({ migrados: 5, conflictos: [], fallidos: [{ numero: 12 }], copiaLocalLimpia: true });
  assert.match(p.html(), /No se pudo mover el contrato/);
  assert.match(p.html(), /barra-lectura-fallida/);
});

test('la mudanza: una copia local que no se pudo limpiar también es problema', async () => {
  const p = await moverElCosto({ migrados: 2, conflictos: [], fallidos: [], copiaLocalLimpia: false });
  assert.match(p.html(), /No se pudo limpiar la copia de esta computadora/);
  assert.match(p.html(), /barra-lectura-fallida/);
});

test('la mudanza: mientras corre, el botón dice por dónde va y queda apagado', async () => {
  // Mover el costo de todos los contratos tarda. Sin esto, él ve un botón quieto, cree que no pasó nada y
  // lo vuelve a apretar — y esto se corre UNA vez y no se deshace.
  const visto = [];
  const p = await pantallaDeDinero({ responder: () => true });
  const boton = p.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'migrar');
  assert.equal(boton.disabled, false, 'el control: antes de apretarlo está vivo');

  const pantalla = await pantallaDeDinero({
    responder: () => true,
    migrarCostos: async ({ alAvanzar }) => {
      const suyo = pantalla.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'migrar');
      alAvanzar(1, 4);
      visto.push({ texto: suyo.textContent, apagado: suyo.disabled });
      alAvanzar(3, 4);
      visto.push({ texto: suyo.textContent, apagado: suyo.disabled });
      return { migrados: 4, conflictos: [], fallidos: [], copiaLocalLimpia: true };
    },
  });
  const suBoton = pantalla.raiz.querySelectorAll('[data-dn]').find((n) => n.dataset.dn === 'migrar');
  pantalla.lanzar('click', suBoton);
  await new Promise((ok) => { setTimeout(ok, 0); });

  assert.deepEqual(visto.map((v) => v.texto), ['Moviendo… 1 de 4', 'Moviendo… 3 de 4'], 'va contando');
  assert.deepEqual(visto.map((v) => v.apagado), [true, true], 'y apagado mientras tanto');
  assert.match(pantalla.html(), /Se movieron 4 contratos/);
});
