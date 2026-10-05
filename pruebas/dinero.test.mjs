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
  CORREO_DE_DINERO, INACTIVIDAD_MS, FORMAS_DE_PAGO, MENSAJE_SIN_COMPROBAR, MENSAJE_PAGO_CAMBIO,
  MENSAJE_FALLO_CONTRATOS, MENSAJE_FALLO_PAGOS, MENSAJE_FALLO_DATOS, MENSAJE_FALLO_DUENOS, MENSAJE_PAGO_FALLO,
  MENSAJE_INACTIVIDAD, enElAreaDeDinero, claveDeEntrada, rutaDeCuenta, armarVista, rentasSinCostoLegible,
  estadoDeCosto, notasDeTotal, resumenDeMarcadas, razonDeNoCierre, pagosDeLaCuenta, registrarElPago,
  cerrarElDinero, cerrarElDineroOReiniciar, salirDelSistema, crearVigilante, crearLector, mensajeSeguro,
  htmlEntrada, htmlFallo, htmlLista, htmlFicha, entradaDelComprobante,
} from '../js/pantallas/dinero.js';
import { armarComprobante } from '../js/pantallas/comprobante.js';
import { htmlListaDeDuenos, htmlFormularioDeDueno } from '../js/pantallas/duenos.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { resumen } from '../js/nucleo/contrato.js';
import { estadoContrato, pendientesDe } from '../js/nucleo/estados.js';
import { sumarDias } from '../js/nucleo/fechas.js';
import { cuentaDeDueno, agruparPorDueno, totalSeleccionado } from '../js/nucleo/liquidacion.js';
import { mensajeDeErrorDeDinero } from '../js/dinero-sesion.js';
import {
  agregarPago, contratoParaGuardar, conCostoDelDueno, costoDelDocumento, construirPagoDueno, pagoDuenoParaGuardar,
  guardarPagoDueno, anotarCostoDelDueno, enlazarContratosAlDueno, nuevoIdPagoDueno,
  MENSAJE_COSTO_SIN_VALOR, MENSAJE_COSTO_SIN_DINERO, MENSAJE_PAGO_SIN_RENTAS,
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

test('el nombre de un dueño con signos raros no rompe la página', () => {
  const raro = { ...REGISTRO_MARIO, nombre: 'Mario <b>"López"</b> & Hijos' };
  const html = htmlLista(armarVista(lecturaOk({ duenos: { datos: [raro, REGISTRO_LUCIA], fallo: false } })));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('Mario &lt;b&gt;&quot;López&quot;&lt;/b&gt; &amp; Hijos'));
});

// ---------------------------------------------------------------------------
// Un total corto lo dice, y una lectura fallida NUNCA es «no le debes nada»
// ---------------------------------------------------------------------------

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
  const m2 = entre(bloque, '<tr style="cursor:default" data-id="m2"', '</tr>');
  for (const texto of ['5 sep 2026', 'Rosa Díaz', '4 días', '+ 2 de atraso', 'Q300.00', 'Q1,800.00']) assert.ok(m2.includes(texto), texto);
  assert.ok(!entre(bloque, '<tr style="cursor:default" data-id="m1"', '</tr>').includes('atraso'), 'sin atraso no se señala nada');
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
  assert.equal((bloque.match(/class="es-fuera"/g) || []).length, 2, 'm3 y m4, en gris');
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
  assert.match(ficha, /id="dn-registrar"[^>]*data-dn="registrar"[^>]*style="[^"]*"\s*>/, 'con algo marcado se puede registrar');
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
  assert.ok(entre(bloque, '<tr style="cursor:default" data-id="m5"', '</tr>').includes('data-dn="anotar-costo"'));
  const m2 = entre(bloque, '<tr style="cursor:default" data-id="m2"', '</tr>');
  assert.ok(!m2.includes('anotar-costo') && m2.includes('No se pudo leer'));
  assert.ok(!entre(bloque, '<tr style="cursor:default" data-id="m1"', '</tr>').includes('anotar-costo'));
  // Y nunca se dibuja «Q0.00» como si fuera un costo de verdad.
  assert.ok(!entre(bloque, '<tr style="cursor:default" data-id="m5"', '</tr>').includes('Q0.00'));
});

test('al anotar, la fila se vuelve un campo con Guardar y Cancelar', () => {
  const ui = uiVacia({ anotando: 'm5' });
  const fila = entre(fichaDe('Mario López Alvarado', { ui }), '<tr style="cursor:default" data-id="m5"', '</tr>');
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
  const lotes = [];
  const dbDinero = { nombre: 'dinero' };
  const dbMostrador = { nombre: 'mostrador' };
  const falla = (op) => { if (fallan.includes(op)) throw new Error('sin internet'); };
  const fsMod = {
    collection: (db, nombre) => ({ coleccion: nombre, db }),
    doc: (origen, ...segmentos) => (origen.coleccion
      ? { ruta: `${origen.coleccion}/${segmentos[0] ?? 'id-nuevo'}`, id: segmentos[0] ?? 'id-nuevo', db: origen.db }
      : { ruta: segmentos.join('/'), id: segmentos.at(-1), db: origen }),
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
    docs: almacen, llamadas, lotes, dbDinero, dbMostrador, fsMod, iniciar: async () => ({ db: dbMostrador, fsMod }),
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

function depsDePago({ pagos = [PAGO_A_LUCIA], fallaLectura = false, fallaGuardar = 0 } = {}) {
  const orden = [];
  let ids = 0;
  let numeros = 100;
  let intentosFallidos = 0;
  return {
    orden,
    leerPagos: async () => { orden.push('leer'); return fallaLectura ? { datos: null, fallo: true } : { datos: structuredClone(pagos), fallo: false }; },
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
  entrada: mario(), idsMarcados: ['m1', 'm2'], forma: 'efectivo', fecha: HOY, costoSinLeer: [], enCurso: {}, ...deps, ...cambios,
});

test('registrar el pago: lee los pagos, arma el pago con la misma suma que se ve, pide id y número y guarda', async () => {
  const deps = depsDePago();
  const r = await registrar(deps);
  assert.equal(r.tipo, 'guardado');
  assert.deepEqual(deps.orden, ['leer', 'id', 'numero', ['guardar', 'pago-1', 101]]);
  assert.equal(r.pago.monto, 3000);
  assert.deepEqual(r.pago.contratos, ['m1', 'm2']);
  assert.equal(r.pago.duenoId, 'd1');
  assert.equal(r.pago.fecha, HOY);
  assert.equal(r.pago.forma, 'efectivo');
  assert.equal(r.pago.numero, 101);
  assert.deepEqual(r.pagos.map((p) => p.id), ['pg-lucia', 'pago-1'], 'la lista queda al día, con el pago nuevo');
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
  assert.deepEqual(deps.orden, ['leer'], 'no se gastó ni un id ni un número, ni se guardó nada');
  assert.ok(MENSAJE_PAGO_CAMBIO.includes('No se registró nada'));
});

test('si no se pueden leer los pagos antes de escribir, NO se registra: sin saber qué ya se pagó se podría pagar dos veces', async () => {
  const deps = depsDePago({ fallaLectura: true });
  await assert.rejects(registrar(deps), { message: MENSAJE_SIN_COMPROBAR });
  assert.deepEqual(deps.orden, ['leer']);
});

test('una renta sin costo legible no se paga, con la frase de datos.js, y no se gasta ni un número', async () => {
  const deps = depsDePago();
  await assert.rejects(registrar(deps, { idsMarcados: ['m1', 'm5'] }), /^Error: No se registró el pago\. El contrato N° 15 no tiene costo por día anotado/);
  assert.deepEqual(deps.orden, ['leer']);
  const sinLeer = depsDePago();
  await assert.rejects(registrar(sinLeer, { idsMarcados: ['m1'], costoSinLeer: ['m1'] }), /No se pudo leer el costo del contrato N° 11/);
  assert.deepEqual(sinLeer.orden, ['leer']);
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
    costoSinLeer: [],
    enCurso,
    leerPagos: async () => ({ datos: [PAGO_A_LUCIA, ...[...docs.values()]], fallo: false }),
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

test('app.js: las cuatro rutas del área de dinero pasan por la puerta de la contraseña', () => {
  const rutas = [...sinComentarios(APP).matchAll(/registrarPantalla\('(#\/dinero[^']*)', ([^;]+)\);/g)];
  assert.deepEqual(rutas.map((r) => r[1]), ['#/dinero', '#/dinero/cuenta/:clave', '#/dinero/duenos', '#/dinero/duenos/:duenoId']);
  for (const [, ruta, funcion] of rutas) assert.match(funcion, /^conPuertaDeDinero\(\w+\)$/, `${ruta} sin puerta: ${funcion}`);
  assert.ok(sinComentarios(APP).includes("import { pintarDuenos } from './pantallas/duenos.js';"));
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
  assert.ok(html.includes('type="tel"'));
  assert.ok(html.includes('href="#/dinero/cuenta/id%3Ad1"'), 'desde la ficha se llega a lo que se le debe');
  const nuevo = htmlFormularioDeDueno(null, { esNuevo: true });
  assert.ok(nuevo.includes('Nuevo dueño') && !nuevo.includes('Ver lo que se le debe'));
});
