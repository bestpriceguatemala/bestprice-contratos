// Pruebas de la pantalla de comisiones de los empleados (js/pantallas/comisiones.js): lo que decide la pantalla sin
// necesidad de un navegador — qué cuentas arma, qué dice cuando algo falla, qué suma lo marcado, cómo registra y cómo
// anula un pago, qué dibuja — con las rentas armadas por las mismas funciones que arman las reales. El cableado del DOM se
// comprobó a mano en el navegador (ver el informe de esta tarea).
//
// Es la gemela de la parte de pruebas/dinero.test.mjs que prueba la pantalla de los dueños.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  armarVistaDeComisiones, resumenDeMarcadasDeComision, pagosDeLaCuentaDeComision, registrarElPagoDeComision, anularElPagoDeComision,
  textoConfirmarAnularPagoDeComision, htmlListaDeComisiones, htmlFichaDeComisiones, htmlFalloDeComisiones, mensajeSeguroDeComision,
  rutaDeComisiones, textoDePagoQueCambio, porcentajesDeLasRentas, textoDeLaTasa,
  MENSAJE_FALLO_RENTAS, MENSAJE_FALLO_PAGOS_DE_COMISION, MENSAJE_FALLO_EMPLEADOS, MENSAJE_COMISION_SIN_COMPROBAR,
  MENSAJE_COMISION_SIN_COMPROBAR_RENTAS, MENSAJE_ANULAR_COMISION_SIN_COMPROBAR, MENSAJE_COMISION_FALLO,
} from '../js/pantallas/comisiones.js';
import { cerrarElDinero, parchearMarcado, alOlvidarElDinero } from '../js/pantallas/dinero.js';
import { MENSAJE_COMISION_SIN_RENTAS, MENSAJE_COMISION_SIN_DINERO } from '../js/datos.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { renta, rentaDeAntes, pagoDeComision, EMPLEADOS } from './fixtures/rentasConComision.mjs';

const { ana, wilder, luis } = EMPLEADOS;
const HOY = '2026-10-20';

const firme = (id, extra = {}) => renta({ id, recibidoEl: '2026-10-05', ...extra });
const abierta = (id, extra = {}) => renta({ id, ...extra });

const lecturaOk = ({ contratos = [], pagos = [], empleados = [ana, wilder, luis] } = {}) => ({
  contratos: { datos: contratos, fallo: false },
  pagos: { datos: pagos, fallo: false },
  empleados: { datos: empleados, fallo: false },
});
const entradaDe = (vista, nombre) => vista.entradas.find((e) => e.nombre === nombre);
const uiVacia = (cambios = {}) => ({
  marcados: new Set(), pagando: false, forma: 'efectivo', fecha: HOY, mensajePago: '', mensajeEnlace: '',
  enlazarEmpleadoId: '', enlazarPorcentaje: false, ...cambios,
});
const ficha = (nombre, { lectura = lecturaOk(), ui = uiVacia() } = {}) => {
  const vista = armarVistaDeComisiones(lectura);
  return htmlFichaDeComisiones({ entrada: entradaDe(vista, nombre), vista, ui, lectura, hoy: HOY });
};
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// La vista: qué cuentas arma, y por qué NO arma ninguna
// ---------------------------------------------------------------------------

test('la vista junta por empleado, de lo que más se le debe a lo que menos, y suma el total de todos', () => {
  const vista = armarVistaDeComisiones(lecturaOk({
    contratos: [firme('a1'), renta({ id: 'l1', empleado: luis, recibidoEl: '2026-10-05' }), renta({ id: 'w1', empleado: wilder, recibidoEl: '2026-10-05' })],
  }));
  assert.equal(vista.ok, true);
  assert.deepEqual(vista.entradas.map((e) => e.nombre), ['Luis Mérida', 'Ana López', 'Wilder']);
  assert.equal(vista.total, 140 + 210, 'Wilder no suma: es 0 %');
  assert.equal(vista.falloEmpleados, false);
});

test('el total de todos se suma por q(): los centavos no se arrastran (0.10 + 0.20 es 0.30, no 0.30000000000000004)', () => {
  const beto = { id: 'e2', codigo: '2', nombre: 'Beto', porcentajeComision: 10, activo: true };
  const delAna = renta({ id: 'c1', dias: 1, precioDia: 2, fechaSalida: '2026-10-01', recibidoEl: '2026-10-02' });
  const delBeto = renta({ id: 'c2', empleado: beto, dias: 1, precioDia: 2, fechaSalida: '2026-10-01', recibidoEl: '2026-10-02' });
  assert.deepEqual([comisionDe(delAna).monto, comisionDe(delBeto).monto], [0.1, 0.2]);
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [delAna, delBeto], empleados: [ana, beto] }));
  assert.equal(vista.entradas.length, 2);
  assert.strictEqual(vista.total, 0.3);
});

test('una lectura fallida de las RENTAS o de los PAGOS no arma ninguna cuenta: jamás «no le debes nada a nadie»', () => {
  const sinRentas = armarVistaDeComisiones({ ...lecturaOk(), contratos: { datos: [firme('a1')], fallo: true } });
  assert.deepEqual([sinRentas.ok, sinRentas.problemas], [false, ['rentas']]);
  const sinPagos = armarVistaDeComisiones({ ...lecturaOk({ contratos: [firme('a1')] }), pagos: { datos: null, fallo: true } });
  assert.deepEqual([sinPagos.ok, sinPagos.problemas], [false, ['pagos']]);
  const ambas = armarVistaDeComisiones({ contratos: { datos: null, fallo: true }, pagos: { datos: null, fallo: true } });
  assert.deepEqual(ambas.problemas, ['rentas', 'pagos']);
  for (const mala of [undefined, null, {}, { contratos: { datos: 'x', fallo: false }, pagos: { datos: [], fallo: false } }]) {
    assert.equal(armarVistaDeComisiones(mala).ok, false, JSON.stringify(mala));
  }
  assert.equal('entradas' in sinRentas, false, 'ni una fila');
});

test('un pago dañado (sin su lista de rentas) tampoco arma ninguna cuenta', () => {
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')], pagos: [{ id: 'p1', monto: 140 }] }));
  assert.deepEqual([vista.ok, vista.problemas], [false, ['datos']]);
});

test('una lectura fallida de los EMPLEADOS no impide dibujar lo que se debe: sale de las rentas y los pagos, y se dice', () => {
  const vista = armarVistaDeComisiones({ ...lecturaOk({ contratos: [firme('a1')] }), empleados: { datos: null, fallo: true } });
  assert.equal(vista.ok, true);
  assert.equal(vista.falloEmpleados, true);
  const ana1 = vista.entradas[0];
  assert.equal(ana1.nombre, 'Ana López', 'el nombre de respaldo es el que se escribió ese día');
  assert.equal(ana1.sinRegistro, true);
  assert.equal(vista.total, 140);
  assert.match(texto(htmlListaDeComisiones(vista)), new RegExp(MENSAJE_FALLO_EMPLEADOS.slice(0, 40)));
});

test('el nombre de un empleado enlazado es el de SU REGISTRO: si se corrige allá, aquí se ve ya', () => {
  const corregido = { ...ana, nombre: 'Ana María López' };
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')], empleados: [corregido, wilder, luis] }));
  assert.ok(entradaDe(vista, 'Ana María López'));
  assert.equal(entradaDe(vista, 'Ana López'), undefined);
});

test('un empleado de la lista sin ninguna renta no desaparece: sale apagado, con su cuenta vacía, y uno de baja también', () => {
  const baja = { ...luis, activo: false };
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')], empleados: [ana, wilder, baja] }));
  assert.deepEqual(vista.entradas.map((e) => e.nombre), ['Ana López', 'Wilder', 'Luis Mérida']);
  assert.equal(entradaDe(vista, 'Wilder').cuenta.totalPorPagar, 0);
  const lista = htmlListaDeComisiones(vista);
  assert.match(lista, /class="es-fuera" data-cm-clave="id:e6"/);
  assert.match(lista, /De baja/);
});

test('las rentas de antes salen como «Sin enlazar», con el 5 % de entonces, y se pueden pagar', () => {
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })] }));
  const pedro = entradaDe(vista, 'Pedro');
  assert.equal(pedro.sinEnlazar, true);
  assert.equal(pedro.clave, 'texto:Pedro');
  assert.equal(pedro.cuenta.totalPorPagar, 140);
  assert.match(htmlListaDeComisiones(vista), /Sin enlazar/);
  assert.match(ficha('Pedro', { lectura: lecturaOk({ contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })] }) }), /Rentas sin enlazar/);
});

// ---------------------------------------------------------------------------
// Wilder: 0 %, sin casilla y sin nada que pagar
// ---------------------------------------------------------------------------

const rentasDeWilder = () => [
  renta({ id: 'w1', empleado: wilder, recibidoEl: '2026-10-05' }),
  renta({ id: 'w2', empleado: wilder, recibidoEl: '2026-10-05' }),
  renta({ id: 'w3', empleado: wilder }),
];

test('Wilder: la lista lo muestra con 0 %, «No gana comisión» y Q0.00, apagado', () => {
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: rentasDeWilder() }));
  const fila = htmlListaDeComisiones(vista);
  const w = fila.slice(fila.indexOf('data-cm-clave="id:e6"'), fila.indexOf('</tr>', fila.indexOf('data-cm-clave="id:e6"')));
  assert.match(w, /0 %/);
  assert.match(w, /No gana comisión/);
  assert.match(w, /Q0\.00/);
  assert.match(fila.slice(fila.lastIndexOf('<tr', fila.indexOf('data-cm-clave="id:e6"'))), /^<tr class="es-fuera"/);
});

test('Wilder: su ficha no ofrece ninguna casilla ni botón de pagar, y dice cuántas rentas no generan comisión', () => {
  const html = ficha('Wilder', { lectura: lecturaOk({ contratos: rentasDeWilder() }) });
  assert.doesNotMatch(html, /data-cm="marcar"/, 'ninguna casilla de fila');
  assert.doesNotMatch(html, /data-cm="marcar-todas"/, 'ni la de marcar todas');
  assert.match(html, /id="dn-registrar"[^>]*disabled/, 'Registrar pago apagado');
  assert.match(texto(html), /2 rentas ya regresaron y no generan comisión: su porcentaje es 0 %/);
  assert.match(texto(html), /Por pagar en total Q0\.00/);
  assert.match(texto(html), /No hay comisiones firmes por pagar/);
  // La que sigue afuera se ve como estimada en Q0.00, no como deuda.
  assert.match(texto(html), /Q0\.00 estimada/);
});

test('Wilder: ni siquiera marcándolo a la fuerza se arma un pago', () => {
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: rentasDeWilder() }));
  const w = entradaDe(vista, 'Wilder');
  assert.deepEqual(resumenDeMarcadasDeComision(w, new Set(['w1', 'w2', 'w3'])), { ids: [], cuantas: 0, total: 0 });
});

// ---------------------------------------------------------------------------
// Lo marcado: UNA sola cuenta
// ---------------------------------------------------------------------------

test('lo marcado suma lo mismo que se guardaría, y una renta no firme no entra aunque su casilla siga marcada', () => {
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1'), firme('a2'), abierta('a3')] }));
  const a = entradaDe(vista, 'Ana López');
  assert.deepEqual(resumenDeMarcadasDeComision(a, new Set(['a1', 'a3'])), { ids: ['a1'], cuantas: 1, total: 140 });
  assert.deepEqual(resumenDeMarcadasDeComision(a, new Set(['a1', 'a2'])), { ids: ['a1', 'a2'], cuantas: 2, total: 280 });
  assert.deepEqual(resumenDeMarcadasDeComision(a, undefined), { ids: [], cuantas: 0, total: 0 });
});

// ---------------------------------------------------------------------------
// La ficha: tres bloques, en este orden
// ---------------------------------------------------------------------------

test('la ficha de Ana: por pagar (con casillas y de dónde sale cada número), aún no es firme y ya pagado, en ese orden', () => {
  const lectura = lecturaOk({
    contratos: [firme('a1', { numero: 7 }), abierta('a2', { numero: 8 }), firme('a3', { numero: 9 })],
    pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['a3'] })],
  });
  const html = ficha('Ana López', { lectura });
  const posiciones = ['Por pagar', 'Aún no es firme', 'Ya pagado'].map((t) => html.indexOf(`<h2>${t}</h2>`));
  assert.ok(posiciones.every((p) => p > -1) && posiciones[0] < posiciones[1] && posiciones[1] < posiciones[2], posiciones.join(','));
  const porPagar = html.slice(posiciones[0], posiciones[1]);
  assert.match(porPagar, /data-cm="marcar" data-id="a1"/);
  assert.doesNotMatch(porPagar, /data-id="a2"|data-id="a3"/, 'ni la que sigue afuera ni la ya pagada');
  // De dónde sale cada número: base, porcentaje y comisión de esa renta.
  const fila = texto(porPagar.slice(porPagar.indexOf('data-id="a1"')));
  assert.match(fila, /5 oct 2026 7 P-7AAA Juan Pérez 4 días Q2,800\.00 5 % Q140\.00/);
  assert.match(texto(html.slice(posiciones[1], posiciones[2])), /Q140\.00 estimada/);
  assert.match(texto(html.slice(posiciones[1], posiciones[2])), /El carro todavía no regresa/);
  assert.match(texto(html.slice(posiciones[2])), /Pago del 20 oct 2026 · Efectivo Q140\.00/);
});

test('el total «Por pagar» de la ficha es el de la cuenta, y el estimado se dice aparte sin llamarlo deuda', () => {
  const html = ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1'), abierta('a2')] }) });
  assert.match(texto(html), /Por pagar en total Q140\.00/);
  assert.match(texto(html), /Estimado de las que siguen afuera: Q140\.00\. No es deuda todavía/);
});

test('la ficha no pone casillas de las comisiones no firmes, y la de «marcar todas» solo existe si hay algo por pagar', () => {
  const soloAfuera = ficha('Ana López', { lectura: lecturaOk({ contratos: [abierta('a1')] }) });
  assert.doesNotMatch(soloAfuera, /data-cm="marcar"/);
  assert.doesNotMatch(soloAfuera, /marcar-todas/);
  const conAlgo = ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1')] }) });
  assert.match(conAlgo, /data-cm="marcar-todas"/);
});

test('con casillas marcadas la ficha las dibuja marcadas y el resumen suma lo marcado', () => {
  const lectura = lecturaOk({ contratos: [firme('a1'), firme('a2')] });
  const html = ficha('Ana López', { lectura, ui: uiVacia({ marcados: new Set(['a1']) }) });
  assert.match(html, /data-cm="marcar" data-id="a1" checked/);
  assert.doesNotMatch(html, /data-cm="marcar" data-id="a2" checked/);
  assert.match(texto(html), /Marcado: 1 renta Total marcado Q140\.00/);
});

test('el formulario del pago: forma, fecha y «Guardar pago de Q…» con lo marcado; sin descuento (aquí no se le pagó de más a nadie)', () => {
  const lectura = lecturaOk({ contratos: [firme('a1'), firme('a2')] });
  const html = ficha('Ana López', { lectura, ui: uiVacia({ marcados: new Set(['a1', 'a2']), pagando: true }) });
  assert.match(html, /id="dn-forma"/);
  assert.match(html, /id="dn-fecha" value="2026-10-20"/);
  assert.match(texto(html), /Guardar pago de Q280\.00/);
  assert.doesNotMatch(html, /dn-descuento/);
  for (const forma of ['Efectivo', 'Transferencia', 'Cheque']) assert.match(html, new RegExp(forma));
});

test('«Ya pagado»: un pago anulado sigue ahí, apagado y sin botón, con «Anulado el …»; uno vigente trae su botón', () => {
  const lectura = lecturaOk({
    contratos: [firme('a1'), firme('a2')],
    pagos: [
      pagoDeComision({ id: 'p1', monto: 140, contratos: ['a1'], fecha: '2026-10-10' }),
      pagoDeComision({ id: 'p2', monto: 140, contratos: ['a2'], fecha: '2026-10-12', anulado: true, anuladoEn: '2026-10-13' }),
    ],
  });
  const html = ficha('Ana López', { lectura });
  const pagado = html.slice(html.indexOf('<h2>Ya pagado</h2>'));
  assert.match(pagado, /Anulado el 13 oct 2026/);
  assert.match(pagado, /dn-pago-anulado/);
  assert.equal((pagado.match(/data-cm="anular-pago"/g) ?? []).length, 1, 'solo el vigente tiene botón');
  assert.match(pagado, /data-cm="anular-pago" data-id="p1"/);
  // Y el de la anulada volvió a «Por pagar».
  assert.match(html.slice(0, html.indexOf('<h2>Aún no es firme</h2>')), /data-cm="marcar" data-id="a2"/);
});

test('«Ya pagado» sin pagos dice que todavía no se le ha pagado nada', () => {
  assert.match(texto(ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1')] }) })), /Todavía no se le ha pagado nada/);
});

test('si lo pagado ya no coincide con lo que suman esas rentas (se corrigió un cierre), la ficha lo dice con palabras', () => {
  const corregida = renta({ id: 'a1', recibidoEl: '2026-10-06' }); // hoy son Q175
  const lectura = lecturaOk({ contratos: [corregida], pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['a1'], fecha: '2026-10-10' })] });
  const html = ficha('Ana López', { lectura });
  assert.match(texto(html), /Lo que se pagó el 10 oct 2026 fue Q140\.00, y hoy esas rentas suman Q175\.00\./);
  assert.equal(textoDePagoQueCambio({ pago: { fecha: '2026-10-10' }, pagado: 140, ahora: 175 }), 'Lo que se pagó el 10 oct 2026 fue Q140.00, y hoy esas rentas suman Q175.00.');
  assert.doesNotMatch(html, /barra-lectura-fallida/, 'no es un fallo: no va en rojo');
  // Sin diferencia, ninguna línea.
  assert.doesNotMatch(texto(ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1')], pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['a1'] })] }) })), /hoy esas rentas suman/);
});

test('una renta sin porcentaje legible sale en «Aún no es firme» con su razón y sin casilla, y la lista avisa cuántas son', () => {
  const sin = { ...firme('a1'), porcentajeComision: '' };
  const lectura = lecturaOk({ contratos: [sin, firme('a2')] });
  const html = ficha('Ana López', { lectura });
  assert.match(texto(html), /no trae un porcentaje de comisión legible/);
  assert.doesNotMatch(html, /data-cm="marcar" data-id="a1"/);
  assert.match(texto(htmlListaDeComisiones(armarVistaDeComisiones(lectura))), /1 renta sin porcentaje anotado: no se pueden pagar/);
});

test('el nombre y lo que escribió el mostrador se escapan: un «&» o un «<» no rompen la pantalla', () => {
  const rara = firme('a1', { empleado: { ...ana, nombre: 'Ana <b>&</b>' } });
  const lectura = lecturaOk({ contratos: [{ ...rara, clienteNombre: '<script>x</script>' }], empleados: [{ ...ana, nombre: 'Ana <b>&</b>' }] });
  const html = ficha('Ana <b>&</b>', { lectura });
  assert.doesNotMatch(html, /<script>|<b>&<\/b>/);
  assert.match(html, /Ana &lt;b&gt;&amp;&lt;\/b&gt;/);
});

test('la ficha de un empleado con registro trae su código, su porcentaje de hoy y el enlace a editarlo', () => {
  const html = ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1')] }) });
  assert.match(texto(html), /Código 1 · Gana el 5 % · Editar empleado/);
  assert.match(html, /href="#\/dinero\/empleados\/e1"/);
});

// ---------------------------------------------------------------------------
// Rentas sin enlazar: el enlace
// ---------------------------------------------------------------------------

test('el bloque «Rentas sin enlazar» dice el nombre escrito, el porcentaje que traen las rentas y deja escoger empleado', () => {
  const lectura = lecturaOk({ contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Wilder', recibidoEl: '2026-09-29' })] });
  const html = ficha('Wilder', { lectura });
  const enlace = html.slice(html.indexOf('id="cm-enlace"'), html.indexOf('</section>', html.indexOf('id="cm-enlace"')));
  assert.match(texto(enlace), /solo tienen el nombre «Wilder» escrito a mano/);
  assert.match(texto(enlace), /traen el porcentaje que tenían ese día: 5 %/);
  assert.match(enlace, /<option value="e6">6 · Wilder \(0 %\)<\/option>/);
  assert.match(enlace, /id="cm-enlazar-porcentaje"/);
  assert.doesNotMatch(enlace, /checked/, 'el cambio de porcentaje NO viene marcado: hay que pedirlo');
  assert.match(enlace, /data-cm="enlazar"/);
});

test('sin empleados en la lista, el enlace manda a darlos de alta en lugar de dejar un selector vacío mudo', () => {
  const lectura = lecturaOk({ contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })], empleados: [] });
  assert.match(texto(ficha('Pedro', { lectura })), /Todavía no hay empleados en la lista\. Primero da de alta al empleado en Empleados/);
});

test('una renta ya enlazada no ofrece enlazar', () => {
  assert.doesNotMatch(ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1')] }) }), /cm-enlace/);
});

test('porcentajesDeLasRentas: los distintos, ordenados, sin los que no se leen', () => {
  assert.deepEqual(porcentajesDeLasRentas([{ porcentajeComision: 5 }, { porcentajeComision: 0 }, { porcentajeComision: 5 }, { porcentajeComision: '' }, {}]), [0, 5]);
});

// ---------------------------------------------------------------------------
// La lista
// ---------------------------------------------------------------------------

test('la lista: una fila por empleado con su porcentaje, cuántas rentas por pagar y cuánto; el total de todos al pie', () => {
  const vista = armarVistaDeComisiones(lecturaOk({
    contratos: [firme('a1'), firme('a2'), renta({ id: 'l1', empleado: luis, recibidoEl: '2026-10-05' })],
  }));
  const html = htmlListaDeComisiones(vista);
  assert.match(texto(html), /1 · Ana López 5 % 2 Q280\.00/);
  assert.match(texto(html), /16 · Luis Mérida 7\.5 % 1 Q210\.00/);
  assert.match(html, /id="cm-total-general">Q490\.00</);
  assert.match(html, /href="#\/dinero\/comisiones\/id%3Ae1"/, 'la ficha viaja con su clave escapada');
  assert.match(html, /data-cm="actualizar"/);
});

test('la lista sin nada dice que no hay rentas ni empleados, no «no le debes nada»', () => {
  const html = htmlListaDeComisiones(armarVistaDeComisiones(lecturaOk({ empleados: [] })));
  assert.match(texto(html), /Todavía no hay rentas ni empleados en la lista/);
  assert.doesNotMatch(html, /cm-total-general/, 'sin filas no hay pie con un total');
});

test('la lista de una lectura fallida no dibuja NINGUNA cifra: una barra roja y cómo volver a leer', () => {
  const html = htmlListaDeComisiones(armarVistaDeComisiones({ ...lecturaOk({ contratos: [firme('a1')] }), pagos: { datos: null, fallo: true } }));
  assert.match(html, /barra-lectura-fallida/);
  assert.match(texto(html), new RegExp(MENSAJE_FALLO_PAGOS_DE_COMISION.slice(0, 40)));
  assert.match(html, /data-cm="reintentar"/);
  assert.doesNotMatch(html, /Q\d/, 'ni una cifra');
  assert.doesNotMatch(html, /<table/);
  assert.match(texto(htmlFalloDeComisiones({ problemas: ['rentas'] })), new RegExp(MENSAJE_FALLO_RENTAS.slice(0, 30)));
});

test('rutaDeComisiones escapa la clave: un nombre con «/» o espacios viaja en una sola pieza de la dirección', () => {
  assert.equal(rutaDeComisiones('id:e1'), '#/dinero/comisiones/id%3Ae1');
  assert.equal(rutaDeComisiones('texto:Ana/Luis Pérez'), '#/dinero/comisiones/texto%3AAna%2FLuis%20P%C3%A9rez');
});

test('textoDeLaTasa: el cero es «0 %», lo que no se lee es «—»', () => {
  assert.equal(textoDeLaTasa(0), '0 %');
  assert.equal(textoDeLaTasa('7.5'), '7.5 %');
  assert.equal(textoDeLaTasa(''), '—');
  assert.equal(textoDeLaTasa(undefined), '—');
});

// ---------------------------------------------------------------------------
// Registrar el pago
// ---------------------------------------------------------------------------

/** Las dependencias de un pago contra una nube de mentira que se puede cambiar entre pasos. */
function deps({
  contratos = [firme('a1'), firme('a2')], pagos = [], fallaPagos = false, fallaRentas = false, fallaGuardar = false,
} = {}) {
  const estado = { contratos, pagos: [...pagos], guardados: [], leidasPagos: 0, leidasRentas: 0, ids: 0 };
  return {
    estado,
    leerPagos: async () => { estado.leidasPagos += 1; return fallaPagos ? { datos: null, fallo: true } : { datos: [...estado.pagos], fallo: false }; },
    leerContratos: async () => {
      estado.leidasRentas += 1;
      if (fallaRentas) throw new Error('sin internet');
      return { datos: estado.contratos, fallo: false };
    },
    nuevoId: async () => { estado.ids += 1; return `p-nuevo-${estado.ids}`; },
    guardar: async (pago) => {
      if (fallaGuardar) throw new Error('sin internet');
      estado.guardados.push(pago);
      estado.pagos.push(pago);
      return { ...pago, actualizado: 1 };
    },
  };
}

const anaDe = (lectura = lecturaOk({ contratos: [firme('a1'), firme('a2')] })) => entradaDe(armarVistaDeComisiones(lectura), 'Ana López');
const registrar = (d, cambios = {}) => registrarElPagoDeComision({
  entrada: anaDe(), idsMarcados: ['a1', 'a2'], forma: 'transferencia', fecha: HOY, ...d, ...cambios,
});

test('registrar: relee los pagos y las rentas, arma el pago con lo de AHORA y lo guarda con su id', async () => {
  const d = deps();
  const r = await registrar(d);
  assert.equal(r.tipo, 'guardado');
  assert.equal(d.estado.leidasPagos, 1);
  assert.equal(d.estado.leidasRentas, 1);
  const [guardado] = d.estado.guardados;
  assert.deepEqual(guardado, {
    empleadoId: 'e1', fecha: HOY, forma: 'transferencia', monto: 280, contratos: ['a1', 'a2'], id: 'p-nuevo-1',
  });
  assert.deepEqual(r.pagos.map((p) => p.id), ['p-nuevo-1']);
});

test('registrar sin marcar nada se niega, sin leer ni escribir', async () => {
  const d = deps();
  await assert.rejects(registrar(d, { idsMarcados: [] }), { message: MENSAJE_COMISION_SIN_RENTAS });
  assert.equal(d.estado.leidasPagos, 0);
});

test('registrar con los pagos sin poder leerse se niega: no sabe si ya se pagó y podría pagar dos veces', async () => {
  const d = deps({ fallaPagos: true });
  await assert.rejects(registrar(d), { message: MENSAJE_COMISION_SIN_COMPROBAR });
  assert.equal(d.estado.guardados.length, 0);
});

test('registrar con las rentas sin poder leerse se niega: no sabe si la comisión cambió', async () => {
  const d = deps({ fallaRentas: true });
  await assert.rejects(registrar(d), { message: MENSAJE_COMISION_SIN_COMPROBAR_RENTAS });
  assert.equal(d.estado.guardados.length, 0);
  const d2 = deps();
  d2.leerContratos = async () => ({ datos: null, fallo: true });
  await assert.rejects(registrar(d2), { message: MENSAJE_COMISION_SIN_COMPROBAR_RENTAS });
});

test('mientras él armaba el pago otra pestaña ya pagó una renta marcada: «cambio», no se guarda una versión recortada', async () => {
  const d = deps({ pagos: [pagoDeComision({ id: 'otro', monto: 140, contratos: ['a1'] })] });
  const r = await registrar(d);
  assert.equal(r.tipo, 'cambio');
  assert.equal(d.estado.guardados.length, 0, 'ni siquiera el pago de la que sí se podía');
  assert.deepEqual(r.pagos.map((p) => p.id), ['otro'], 'devuelve lo leído, que la pantalla toma como la nueva verdad');
});

test('mientras él armaba el pago se corrigió el cierre de una renta marcada y cambió lo que suma: «cambio»', async () => {
  const corregida = renta({ id: 'a1', recibidoEl: '2026-10-06' }); // ahora Q175
  const d = deps({ contratos: [corregida, firme('a2')] });
  assert.equal((await registrar(d)).tipo, 'cambio');
  assert.equal(d.estado.guardados.length, 0);
});

test('mientras él armaba el pago el carro de una renta marcada ya no cuenta como regresado (cierre reabierto): «cambio»', async () => {
  const d = deps({ contratos: [abierta('a1'), firme('a2')] });
  assert.equal((await registrar(d)).tipo, 'cambio');
});

test('mientras él armaba el pago la cuenta entera desapareció (la renta se enlazó a otro empleado): «cambio»', async () => {
  const d = deps({ contratos: [renta({ id: 'a1', empleado: luis, recibidoEl: '2026-10-05' }), renta({ id: 'a2', empleado: luis, recibidoEl: '2026-10-05' })] });
  assert.equal((await registrar(d)).tipo, 'cambio');
});

test('reintentar el MISMO pago (internet lento, doble clic) cae en el mismo documento: el id se pide una sola vez', async () => {
  const d = deps({ fallaGuardar: true });
  const enCurso = {};
  await assert.rejects(registrar(d, { enCurso }), /sin internet/);
  assert.equal(enCurso.id, 'p-nuevo-1', 'el id quedó decidido aunque el guardado falló');
  d.guardar = async (pago) => { d.estado.guardados.push(pago); d.estado.pagos.push(pago); return pago; };
  const r = await registrar(d, { enCurso });
  assert.equal(r.tipo, 'guardado');
  assert.equal(d.estado.ids, 1, 'no se pidió otro id');
  assert.equal(d.estado.guardados[0].id, 'p-nuevo-1');
});

test('si el primer intento SÍ había llegado, el reintento no escribe nada: devuelve ese pago', async () => {
  const d = deps();
  const enCurso = {};
  await registrar(d, { enCurso });
  const antes = d.estado.guardados.length;
  const r = await registrar(d, { enCurso });
  assert.equal(r.tipo, 'ya-guardado');
  assert.equal(r.pago.id, 'p-nuevo-1');
  assert.equal(d.estado.guardados.length, antes, 'no se duplicó');
});

test('registrar paga solo lo marcado, aunque haya más por pagar', async () => {
  const d = deps({ contratos: [firme('a1'), firme('a2'), firme('a3')] });
  const entrada = anaDe(lecturaOk({ contratos: [firme('a1'), firme('a2'), firme('a3')] }));
  const r = await registrar(d, { entrada, idsMarcados: ['a2'] });
  assert.equal(r.tipo, 'guardado');
  assert.deepEqual(d.estado.guardados[0].contratos, ['a2']);
  assert.equal(d.estado.guardados[0].monto, 140);
});

test('el pago de un grupo «sin enlazar» se guarda con empleadoId null', async () => {
  const viejas = [rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })];
  const entrada = entradaDe(armarVistaDeComisiones(lecturaOk({ contratos: viejas })), 'Pedro');
  const d = deps({ contratos: viejas });
  const r = await registrar(d, { entrada, idsMarcados: ['v1'] });
  assert.equal(r.tipo, 'guardado');
  assert.strictEqual(d.estado.guardados[0].empleadoId, null);
  assert.equal(d.estado.guardados[0].monto, 140);
});

// ---------------------------------------------------------------------------
// Anular
// ---------------------------------------------------------------------------

const PAGO_A_ANA = pagoDeComision({ id: 'p1', monto: 280, contratos: ['a1', 'a2'], fecha: '2026-10-10', forma: 'transferencia' });

function depsDeAnular({ pagos = [PAGO_A_ANA], fallaLectura = false, fallaGuardar = false } = {}) {
  const guardados = [];
  return {
    guardados,
    leerPagos: async () => (fallaLectura ? { datos: null, fallo: true } : { datos: structuredClone(pagos), fallo: false }),
    guardar: async (pago) => { if (fallaGuardar) throw new Error('sin internet'); guardados.push(pago); return pago; },
  };
}

test('anular: guarda el pago TAL COMO ESTÁ en la nube, con anulado y la fecha de la anulación, sin tocar monto ni rentas', async () => {
  const d = depsDeAnular();
  const r = await anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: HOY, ...d });
  assert.equal(r.tipo, 'anulado');
  assert.deepEqual(d.guardados[0], { ...PAGO_A_ANA, anulado: true, anuladoEn: HOY });
  assert.equal(r.pagos.find((p) => p.id === 'p1').anulado, true);
});

test('anular guarda el pago como está AHORA en la nube, no la copia que la pantalla tenía de cuando se abrió', async () => {
  const enLaNube = { ...PAGO_A_ANA, contratos: ['a1'], monto: 140, forma: 'cheque' }; // otra pestaña lo corrigió a un solo contrato
  const d = depsDeAnular({ pagos: [enLaNube] });
  await anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: HOY, ...d });
  assert.deepEqual(d.guardados[0], { ...enLaNube, anulado: true, anuladoEn: HOY });
});

test('anular un pago que otra pestaña ya anuló no escribe nada ni pisa la fecha de la primera anulación', async () => {
  const yaAnulado = { ...PAGO_A_ANA, anulado: true, anuladoEn: '2026-10-11' };
  const d = depsDeAnular({ pagos: [yaAnulado] });
  const r = await anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: HOY, ...d });
  assert.equal(r.tipo, 'ya-anulado');
  assert.equal(r.pago.anuladoEn, '2026-10-11');
  assert.equal(d.guardados.length, 0);
});

test('anular un pago que ya no existe lo dice y no escribe nada', async () => {
  const d = depsDeAnular({ pagos: [] });
  assert.equal((await anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: HOY, ...d })).tipo, 'no-esta');
  assert.equal(d.guardados.length, 0);
});

test('anular sin poder leer los pagos se niega; sin la fecha de hoy también (la anulación queda fechada y no se adivina)', async () => {
  const d = depsDeAnular({ fallaLectura: true });
  await assert.rejects(anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: HOY, ...d }), { message: MENSAJE_ANULAR_COMISION_SIN_COMPROBAR });
  await assert.rejects(anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: undefined, ...depsDeAnular() }), /Falta la fecha de hoy/);
  await assert.rejects(anularElPagoDeComision({ pago: PAGO_A_ANA, hoy: HOY, ...depsDeAnular({ fallaGuardar: true }) }), /sin internet/);
});

test('el mensaje de confirmar dice A QUIÉN, cuánto, de cuándo y cuántas rentas, y que queda con rastro', () => {
  const entrada = anaDe();
  const t = textoConfirmarAnularPagoDeComision(PAGO_A_ANA, entrada);
  assert.match(t, /Anular el pago de Q280\.00 a Ana López \(del 10 oct 2026, transferencia\)/);
  assert.match(t, /Cubre 2 rentas\. Esas rentas vuelven a «Por pagar»/);
  assert.match(t, /queda marcado como anulado y no desaparece/);
  assert.match(textoConfirmarAnularPagoDeComision({ ...PAGO_A_ANA, contratos: ['a1'] }, entrada), /Cubre 1 renta\. Esa renta vuelve/);
});

test('anular DEVUELVE las rentas a «por pagar» y el pago sigue en «Ya pagado»: el recorrido completo, con la cuenta real', () => {
  const lectura = lecturaOk({ contratos: [firme('a1'), firme('a2')], pagos: [PAGO_A_ANA] });
  assert.equal(entradaDe(armarVistaDeComisiones(lectura), 'Ana López').cuenta.totalPorPagar, 0);
  const anulada = lecturaOk({ contratos: [firme('a1'), firme('a2')], pagos: [{ ...PAGO_A_ANA, anulado: true, anuladoEn: HOY }] });
  const vista = armarVistaDeComisiones(anulada);
  assert.equal(entradaDe(vista, 'Ana López').cuenta.totalPorPagar, 280);
  assert.match(ficha('Ana López', { lectura: anulada }), /Anulado el 20 oct 2026/);
});

// ---------------------------------------------------------------------------
// Frases y pagos de la cuenta
// ---------------------------------------------------------------------------

test('mensajeSeguroDeComision: las frases nuestras pasan tal cual; lo de Firebase (en inglés) nunca', () => {
  assert.equal(mensajeSeguroDeComision(new Error(MENSAJE_COMISION_SIN_RENTAS), 'respaldo'), MENSAJE_COMISION_SIN_RENTAS);
  assert.equal(mensajeSeguroDeComision(new Error(MENSAJE_COMISION_SIN_DINERO), 'respaldo'), MENSAJE_COMISION_SIN_DINERO);
  assert.equal(mensajeSeguroDeComision(new Error('Missing or insufficient permissions.'), MENSAJE_COMISION_FALLO), MENSAJE_COMISION_FALLO);
  assert.equal(mensajeSeguroDeComision(undefined, 'respaldo'), 'respaldo');
});

test('los pagos de una cuenta se reconocen por las rentas que cubren, el más reciente primero', () => {
  const entrada = anaDe(lecturaOk({ contratos: [firme('a1'), firme('a2')] }));
  const pagos = [
    pagoDeComision({ id: 'p1', monto: 140, contratos: ['a1'], fecha: '2026-10-10' }),
    pagoDeComision({ id: 'p2', monto: 140, contratos: ['a2'], fecha: '2026-10-12' }),
    pagoDeComision({ id: 'p3', monto: 99, contratos: ['de-otro'], fecha: '2026-10-15' }),
  ];
  assert.deepEqual(pagosDeLaCuentaDeComision(entrada, pagos).map((p) => p.id), ['p2', 'p1']);
  assert.deepEqual(pagosDeLaCuentaDeComision(entrada, undefined), []);
});

// ---------------------------------------------------------------------------
// El parche de lo marcado dice lo mismo que la plantilla
// ---------------------------------------------------------------------------

/** Un «navegador» mínimo, sin DOM: toma de la plantilla los elementos con `id` que el parche pida y devuelve el texto visible. */
function paginaFalsa(html) {
  const nodos = new Map();
  const raiz = {
    querySelector(selector) {
      const id = selector.replace(/^#/, '');
      if (!nodos.has(id)) {
        const hallado = new RegExp(`<(\\w+)([^>]*?\\bid="${id}"[^>]*)>([^]*?)</\\1>`).exec(html);
        if (!hallado) return null;
        nodos.set(id, { original: hallado[0], textContent: hallado[3].replace(/<[^>]+>/g, ''), disabled: /\bdisabled\b/.test(hallado[2]) });
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

test('marcar una casilla parcha «Marcado: N», el total y los botones con la misma frase que dibuja la plantilla', () => {
  const lectura = lecturaOk({ contratos: [firme('a1'), firme('a2')] });
  const casos = [[], ['a1'], ['a1', 'a2']];
  for (const pagando of [false, true]) {
    for (const antes of casos) {
      for (const despues of casos) {
        const pagina = paginaFalsa(ficha('Ana López', { lectura, ui: uiVacia({ marcados: new Set(antes), pagando }) }));
        parchearMarcado(pagina.raiz, resumenDeMarcadasDeComision(anaDe(lectura), new Set(despues)), { pagando });
        const desdeCero = paginaFalsa(ficha('Ana López', { lectura, ui: uiVacia({ marcados: new Set(despues), pagando }) })).visible();
        assert.equal(pagina.visible(), desdeCero, `de ${antes.length} a ${despues.length}, formulario ${pagando ? 'abierto' : 'cerrado'}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Cerrar la sesión de dinero suelta TAMBIÉN lo que leyeron las comisiones
// ---------------------------------------------------------------------------

test('cerrarElDinero llama a cada pantalla que se registró para olvidar lo que leyó, y una que falla no deja a las otras con dinero en memoria', async () => {
  const llamadas = [];
  const quita1 = alOlvidarElDinero(() => llamadas.push('uno'));
  const quita2 = alOlvidarElDinero(() => { llamadas.push('malo'); throw new Error('falló'); });
  const quita3 = alOlvidarElDinero(() => llamadas.push('tres'));
  const errores = [];
  const consola = console.error;
  console.error = (...a) => errores.push(a);
  try {
    const cerrada = await cerrarElDinero({ salir: async () => {}, parar: () => {}, registrar: () => {} });
    assert.equal(cerrada, true);
  } finally {
    console.error = consola;
    quita1(); quita2(); quita3();
  }
  assert.deepEqual(llamadas, ['uno', 'malo', 'tres']);
  assert.equal(errores.length, 1, 'el fallo de una se dice en la consola');
  // Ya dadas de baja, no se vuelven a llamar.
  await cerrarElDinero({ salir: async () => {}, parar: () => {}, registrar: () => {} });
  assert.deepEqual(llamadas, ['uno', 'malo', 'tres']);
});

// ---------------------------------------------------------------------------
// El cableado: lo que ninguna otra prueba ve
// ---------------------------------------------------------------------------

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PANTALLA = sinComentarios(leer('../js/pantallas/comisiones.js'));

test('la pantalla de comisiones se registra para olvidar lo que leyó cuando la sesión de dinero se cierra', () => {
  assert.match(PANTALLA, /alOlvidarElDinero\(\(\) => \{\s*lector\.olvidar\(\);\s*if \(raizActual\?\.isConnected\) raizActual\.replaceChildren\(\);/);
});

test('las comisiones leen las rentas de la NUBE (cargarContratosDeLaNube) y los pagos con la credencial de dinero, sin copia local', () => {
  const importaDeDatos = PANTALLA.slice(PANTALLA.indexOf('import {\n  cargarContratosDeLaNube'), PANTALLA.indexOf("} from '../datos.js';"));
  assert.match(importaDeDatos, /cargarContratosDeLaNube/);
  assert.match(importaDeDatos, /cargarPagosComision/);
  for (const prohibida of ['cargarContratosAbiertos', 'cargarContratos,', 'cargarContratosParaDinero', 'leerLocal']) {
    assert.ok(!importaDeDatos.includes(prohibida), `${prohibida} no se usa aquí`);
  }
  assert.match(PANTALLA, /cargarContratosDeLaNube\(\)\.catch\(\(\) => \(\{ datos: null, fallo: true \}\)\)/);
  assert.match(PANTALLA, /cargarPagosComision\(\)\.catch\(\(\) => \(\{ datos: null, fallo: true \}\)\)/);
  assert.match(PANTALLA, /cargarEmpleados\(\)\.catch\(\(\) => \(\{ datos: null, fallo: true \}\)\)/);
});

test('la pantalla nunca arma una lista vacía para esquivar una lectura fallida: no le pasa [] a la cuenta', () => {
  assert.ok(!/agruparPorEmpleado\(\s*\[\]/.test(PANTALLA));
  assert.ok(!/(contratos|pagos)\??\.datos\s*(\?\?|\|\|)\s*\[\]/.test(PANTALLA), 'ni «datos ?? []» ni «datos || []» para rentas o pagos');
});

test('ninguna regla de negocio se repite en la pantalla: no multiplica por el porcentaje, no mira cierre.fechaReal para decidir si es firme', () => {
  assert.ok(!/\*\s*porcentaje|porcentaje\s*\/\s*100|\/\s*100\b/.test(PANTALLA), 'la comisión la calcula comisionDe');
  assert.ok(!/\.firme\b/.test(PANTALLA), '«firme» lo decide el núcleo (estadoDeComision), no la pantalla');
  assert.ok(!/estadoContrato|pendientesDe/.test(PANTALLA), 'no mira si el contrato está cerrado: solo se paga lo firme (que el carro regresó)');
});

test('la pantalla de comisiones y la de empleados no llevan estilos en línea: cada ajuste es una clase del CSS', () => {
  for (const archivo of ['../js/pantallas/comisiones.js', '../js/pantallas/empleados.js']) {
    const codigo = sinComentarios(leer(archivo));
    assert.equal((codigo.match(/style\s*=/g) || []).length, 0, archivo);
    assert.ok(!/\.style\b|cssText|setAttribute\(\s*['"]style/.test(codigo), `${archivo}: ni por el DOM`);
  }
});

test('el enlace «Comisiones» y «Empleados» están en el área de dinero (la lista de dueños) y en nada del mostrador', () => {
  const dinero = leer('../js/pantallas/dinero.js');
  assert.match(dinero, /<a href="#\/dinero\/comisiones" class="btn">Comisiones<\/a>/);
  assert.match(dinero, /<a href="#\/dinero\/empleados" class="btn">Empleados<\/a>/);
  const html = leer('../index.html');
  assert.doesNotMatch(html, /comisiones|empleados/i, 'el menú del mostrador no los trae: están detrás de la contraseña');
});

test('las comisiones sí usan comisionDe para cada cifra que dibujan', () => {
  assert.match(PANTALLA, /comisionDe\(contrato\)/);
  assert.equal(comisionDe(firme('x')).monto, 140);
});
