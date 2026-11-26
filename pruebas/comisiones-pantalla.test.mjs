// Pruebas de la pantalla de comisiones de los empleados (js/pantallas/comisiones.js): lo que decide la pantalla sin
// necesidad de un navegador — qué cuentas arma, qué dice cuando algo falla, qué suma lo marcado, cómo registra y cómo
// anula un pago, qué dibuja — con las rentas armadas por las mismas funciones que arman las reales. El cableado del DOM se
// comprobó a mano en el navegador (ver el informe de esta tarea).
//
// Es la gemela de la parte de pruebas/dinero.test.mjs que prueba la pantalla de los dueños.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  armarVistaDeComisiones, resumenDeMarcadasDeComision, pagosDeLaCuentaDeComision, registrarElPagoDeComision, anularElPagoDeComision,
  textoConfirmarAnularPagoDeComision, htmlListaDeComisiones, htmlFichaDeComisiones, htmlFalloDeComisiones, mensajeSeguroDeComision,
  rutaDeComisiones, textoDePagoQueCambio, porcentajesDeLasRentas, textoDeLaTasa, textoConfirmarEnlazar,
  htmlPeriodos, idsDelPeriodo, etiquetaDelPeriodo, nombreDelMes, textoDeSinMarcar, parchearSinMarcar,
  MENSAJE_FALLO_RENTAS, MENSAJE_FALLO_PAGOS_DE_COMISION, MENSAJE_FALLO_EMPLEADOS, MENSAJE_COMISION_SIN_COMPROBAR,
  MENSAJE_COMISION_SIN_COMPROBAR_RENTAS, MENSAJE_ANULAR_COMISION_SIN_COMPROBAR, MENSAJE_COMISION_FALLO,
  pintarComisiones, pintarComisionesDeEmpleado, MENSAJE_BAJAR_FALLO, MENSAJE_COMPROBANTE_COMISION_NO_ESTA,
} from '../js/pantallas/comisiones.js';
import { crearLector } from '../js/pantallas/dinero.js';
import { pantallaDeMentira } from './fixtures/pantallaDeMentira.mjs';
import { cerrarElDinero, parchearMarcado, alOlvidarElDinero, razonDeNoCierre } from '../js/pantallas/dinero.js';
import { MENSAJE_COMISION_SIN_RENTAS, MENSAJE_COMISION_SIN_DINERO } from '../js/datos.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { cuentaDeEmpleado, sinMarcarDeComision, filaDeDetalle } from '../js/nucleo/comisiones.js';
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
  assert.equal(ana1.sinRegistro, false, 'no se sabe si está en la lista: no se afirma que no');
  assert.doesNotMatch(htmlListaDeComisiones(vista), /No está en la lista de empleados/);
  assert.equal(vista.total, 140);
  assert.ok(texto(htmlListaDeComisiones(vista)).includes(MENSAJE_FALLO_EMPLEADOS), 'el mensaje COMPLETO');
});

test('con la lista de empleados LEÍDA, una renta enlazada a alguien que ya no está en ella sí dice «No está en la lista de empleados»', () => {
  const vista = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')], empleados: [wilder, luis] }));
  const e = vista.entradas.find((x) => x.empleadoId === 'e1');
  assert.equal(e.sinRegistro, true);
  assert.match(htmlListaDeComisiones(vista), /No está en la lista de empleados/);
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
  assert.match(texto(html), /2 rentas ya cerraron y no generan comisión: su porcentaje es 0 %/);
  assert.match(texto(html), /Por pagar en total Q0\.00/);
  assert.match(texto(html), /No hay comisiones por pagar/);
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

test('la ficha de Ana: por pagar (con casillas y de dónde sale cada número), todavía no se paga y ya pagado, en ese orden', () => {
  const lectura = lecturaOk({
    contratos: [firme('a1', { numero: 7 }), abierta('a2', { numero: 8 }), firme('a3', { numero: 9 })],
    pagos: [pagoDeComision({ id: 'p1', monto: 140, contratos: ['a3'] })],
  });
  const html = ficha('Ana López', { lectura });
  const posiciones = ['Por pagar', 'Todavía no se paga', 'Ya pagado'].map((t) => html.indexOf(`<h2>${t}</h2>`));
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
  assert.match(texto(html), /De las que siguen afuera, estimado: Q140\.00\. No es deuda todavía/);
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
  assert.match(html.slice(0, html.indexOf('<h2>Todavía no se paga</h2>')), /data-cm="marcar" data-id="a2"/);
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

test('una renta sin porcentaje legible sale en «Todavía no se paga» con su razón y sin casilla, y la lista avisa cuántas son', () => {
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

test('el mensaje de confirmar el enlace: cuántas rentas, de qué nombre a qué empleado, y solo si se pidió, cuántas cambian de porcentaje y a cuál', () => {
  const lectura = lecturaOk({ contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Wilder', recibidoEl: '2026-09-29' }), rentaDeAntes({ id: 'v2', numero: 2, rentadoPor: 'Wilder', recibidoEl: '2026-09-29' })] });
  const entrada = entradaDe(armarVistaDeComisiones(lectura), 'Wilder');
  const base = { entrada, registro: wilder };
  assert.equal(
    textoConfirmarEnlazar({ ...base, sinPagar: [] }),
    '¿Enlazar 2 rentas de «Wilder» al empleado «Wilder»? Esto no se puede deshacer desde el sistema.',
    'sin pedir el cambio de porcentaje no dice nada de porcentajes',
  );
  assert.match(textoConfirmarEnlazar({ ...base, sinPagar: [{}, {}] }), /el porcentaje de 2 rentas que aún no se han pagado pasa a 0 %\./);
  assert.match(textoConfirmarEnlazar({ ...base, sinPagar: [{}] }), /el porcentaje de 1 renta que aún no se ha pagado pasa a 0 %\./);
  assert.match(textoConfirmarEnlazar({ entrada: { ...entrada, contratos: [entrada.contratos[0]] }, registro: ana, sinPagar: [] }), /¿Enlazar 1 renta de «Wilder» al empleado «Ana López»\?/);
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
  assert.ok(texto(html).includes(MENSAJE_FALLO_PAGOS_DE_COMISION), 'el mensaje COMPLETO');
  assert.match(html, /data-cm="reintentar"/);
  assert.doesNotMatch(html, /Q\d/, 'ni una cifra');
  assert.doesNotMatch(html, /<table/);
  assert.ok(texto(htmlFalloDeComisiones({ problemas: ['rentas'] })).includes(MENSAJE_FALLO_RENTAS), 'el mensaje COMPLETO');
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
  const estado = { contratos, pagos: [...pagos], guardados: [], leidasPagos: 0, leidasRentas: 0, ids: 0, numeros: 0 };
  return {
    estado,
    leerPagos: async () => { estado.leidasPagos += 1; return fallaPagos ? { datos: null, fallo: true } : { datos: [...estado.pagos], fallo: false }; },
    leerContratos: async () => {
      estado.leidasRentas += 1;
      if (fallaRentas) throw new Error('sin internet');
      return { datos: estado.contratos, fallo: false };
    },
    nuevoId: async () => { estado.ids += 1; return `p-nuevo-${estado.ids}`; },
    nuevoNumero: async () => { estado.numeros += 1; return 40 + estado.numeros; },
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
    empleadoId: 'e1', fecha: HOY, forma: 'transferencia', monto: 280, contratos: ['a1', 'a2'], id: 'p-nuevo-1', numero: 41,
    detalle: [filaDeDetalle(firme('a1')), filaDeDetalle(firme('a2'))],
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
        const marcadas = resumenDeMarcadasDeComision(anaDe(lectura), new Set(despues));
        parchearMarcado(pagina.raiz, marcadas, { pagando });
        parchearSinMarcar(pagina.raiz, textoDeSinMarcar(marcadas, sinMarcarDeComision(anaDe(lectura).cuenta, marcadas.ids)));
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

test('enlazar y registrar y anular vuelven a mirar que siga habiendo sesión de dinero antes de escribir', () => {
  assert.match(PANTALLA, /async function enlazar\(\) \{\s*if \(ui\.ocupado \|\| !entrada\?\.sinEnlazar \|\| !haySesion\(\)\) return;/);
  assert.match(PANTALLA, /async function guardarPago\(\) \{\s*if \(ui\.ocupado \|\| !haySesion\(\)\) return;/);
  assert.match(PANTALLA, /async function anularPago\(pagoId\) \{\s*if \(ui\.ocupado \|\| !haySesion\(\)\) return;/);
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

// ---------------------------------------------------------------------------
// «Firme» es un contrato CERRADO: lo que todavía no se paga dice SU razón
// ---------------------------------------------------------------------------

const debiendo = (id, extra = {}) => renta({ id, recibidoEl: '2026-10-05', danos: 200, cerrada: false, ...extra });
const conGarantia = (id, extra = {}) => renta({ id, recibidoEl: '2026-10-05', garantiaSinLiberar: true, ...extra });
const todoLoQueNoSePaga = (html) => html.slice(html.indexOf('<h2>Todavía no se paga</h2>'), html.indexOf('<h2>Ya pagado</h2>'));

test('una renta con el carro de vuelta y el cliente debiendo NO es pagable y dice «Saldo pendiente», no que el carro sigue afuera', () => {
  const lectura = lecturaOk({ contratos: [debiendo('d1', { numero: 21 }), firme('a2', { numero: 22 })] });
  const html = ficha('Ana López', { lectura });
  assert.doesNotMatch(html.slice(0, html.indexOf('<h2>Todavía no se paga</h2>')), /data-cm="marcar" data-id="d1"/, 'sin casilla');
  const abajo = texto(todoLoQueNoSePaga(html));
  assert.match(abajo, /21 P-21AAA Juan Pérez 4 días Q140\.00 Saldo pendiente: Q200\.00\./, 'su fila, con SU razón');
  assert.doesNotMatch(abajo, /El carro todavía no regresa/, 'el carro NO está afuera: está en el patio');
  assert.match(texto(html), /Por pagar en total Q140\.00/, 'solo suma la que sí cerró');
});

test('la razón de una renta con la garantía sin liberar es esa, con la cifra', () => {
  const abajo = texto(todoLoQueNoSePaga(ficha('Ana López', { lectura: lecturaOk({ contratos: [conGarantia('g1')] }) })));
  assert.match(abajo, /Garantía sin liberar: Q5,000\.00\./);
  assert.doesNotMatch(abajo, /El carro todavía no regresa/);
});

test('las razones salen de razonDeNoCierre: las mismas palabras que la ficha del dueño de un carro ajeno, para el mismo contrato', () => {
  for (const c of [debiendo('d1'), conGarantia('g1'), abierta('a1')]) {
    const abajo = texto(todoLoQueNoSePaga(ficha('Ana López', { lectura: lecturaOk({ contratos: [c] }) })));
    assert.ok(abajo.includes(razonDeNoCierre(c)), `${c.id}: ${razonDeNoCierre(c)}`);
  }
});

test('lo que puede cambiar y lo que solo espera a cerrar NO se suman bajo la palabra «estimado»: dos frases, dos cifras', () => {
  const lectura = lecturaOk({ contratos: [abierta('afuera'), debiendo('debe'), conGarantia('garantia', { empleado: { ...ana, porcentajeComision: 10 } })] });
  const abajo = texto(todoLoQueNoSePaga(ficha('Ana López', { lectura })));
  assert.match(abajo, /De las que siguen afuera, estimado: Q140\.00\. No es deuda todavía: puede subir con un día de atraso o bajar con un descuento\./);
  assert.match(abajo, /De las que ya regresaron, el monto ya es ese: Q420\.00\. Solo falta que cierre el contrato\./, 'Q140 de la que debe + Q280 de la de garantía al 10 %');
  assert.equal((abajo.match(/estimada/g) ?? []).length, 1, 'solo la que sigue afuera dice «estimada»');
  assert.match(abajo, /Q140\.00 estimada El carro todavía no regresa/);
});

test('con nada que esperar no hay frases de estimado ni de «ya regresaron»', () => {
  const abajo = texto(todoLoQueNoSePaga(ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1')] }) })));
  assert.match(abajo, /Ninguna renta está esperando a que cierre su contrato/);
  assert.doesNotMatch(abajo, /estimado|el monto ya es ese/);
});

test('el título ya no dice «firme» por una mitad que sí lo es, ni «regrese» donde la condición es que cierre', () => {
  const html = ficha('Ana López', { lectura: lecturaOk({ contratos: [firme('a1'), debiendo('d1')] }) });
  assert.doesNotMatch(html, /Aún no es firme|esperando que regrese|comisiones firmes/);
  assert.match(html, /<h2>Todavía no se paga<\/h2>/);
  assert.match(texto(html), /la comisión se paga cuando el contrato cierra/);
  assert.match(texto(htmlListaDeComisiones(armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')] })))), /contrato ya cerró: el carro regresó, no se debe saldo y la garantía está liberada/);
});

test('cuando el cliente paga y el contrato cierra, la renta pasa de «todavía no se paga» a «por pagar» con la misma comisión', () => {
  const antes = ficha('Ana López', { lectura: lecturaOk({ contratos: [debiendo('d1')] }) });
  const despues = ficha('Ana López', { lectura: lecturaOk({ contratos: [renta({ id: 'd1', recibidoEl: '2026-10-05', danos: 200 })] }) });
  assert.doesNotMatch(antes, /data-cm="marcar" data-id="d1"/);
  assert.match(despues, /data-cm="marcar" data-id="d1"/);
  assert.match(texto(despues), /Por pagar en total Q140\.00/);
});

test('registrar: si mientras armaba el pago el cliente volvió a deber (el contrato dejó de estar cerrado), no se paga: «cambio»', async () => {
  const d = deps({ contratos: [debiendo('a1'), firme('a2')] });
  const r = await registrar(d);
  assert.equal(r.tipo, 'cambio');
  assert.equal(d.estado.guardados.length, 0, 'ni siquiera la que sí cerró: él vio un monto y se guardaría otro');
});

// ---------------------------------------------------------------------------
// Marcar un período de un clic (el dueño paga por quincena y por fin de mes)
// ---------------------------------------------------------------------------

const regresaEl = (id, regreso, extra = {}) => {
  const salida = new Date(`${regreso}T12:00:00Z`);
  salida.setUTCDate(salida.getUTCDate() - 2);
  return renta({ id, fechaSalida: salida.toISOString().slice(0, 10), dias: 2, recibidoEl: regreso, ...extra });
};
/** Cinco rentas de Ana de 2 días (Q70 cada una): dos en la 1.ª quincena de octubre, tres en la 2.ª. */
const deOctubre = () => [
  regresaEl('o1', '2026-10-03'), regresaEl('o2', '2026-10-15'), regresaEl('o3', '2026-10-16'), regresaEl('o4', '2026-10-31'), regresaEl('o5', '2026-10-31'),
];
const cuentaDeAna = (contratos, pagos = []) => cuentaDeEmpleado({ contratos, pagos });

test('los nombres: «octubre 2026», «Todo octubre 2026», «1.ª quincena (1–15)» y «2.ª quincena (16–31)» con el último día del mes de verdad', () => {
  assert.equal(nombreDelMes('2026-10'), 'octubre 2026');
  assert.equal(nombreDelMes('2026-01'), 'enero 2026');
  assert.equal(nombreDelMes('2026-12'), 'diciembre 2026');
  assert.equal(etiquetaDelPeriodo('2026-10', 0), 'Todo octubre 2026');
  assert.equal(etiquetaDelPeriodo('2026-10', 1), '1.ª quincena (1–15)');
  assert.equal(etiquetaDelPeriodo('2026-10', 2), '2.ª quincena (16–31)');
  assert.equal(etiquetaDelPeriodo('2026-11', 2), '2.ª quincena (16–30)');
  assert.equal(etiquetaDelPeriodo('2026-02', 2), '2.ª quincena (16–28)');
  assert.equal(etiquetaDelPeriodo('2028-02', 2), '2.ª quincena (16–29)', 'bisiesto');
});

test('la ficha ofrece, por mes, el botón del mes completo y de cada quincena, con cuántas rentas y cuánto suman', () => {
  const html = ficha('Ana López', { lectura: lecturaOk({ contratos: deOctubre() }) });
  const periodos = html.slice(html.indexOf('class="dn-periodos"'), html.indexOf('<table'));
  assert.match(texto(periodos), /Marcar un período de un clic: octubre 2026 Todo octubre 2026 · 5 rentas · Q350\.00 1\.ª quincena \(1–15\) · 2 rentas · Q140\.00 2\.ª quincena \(16–31\) · 3 rentas · Q210\.00/);
  assert.match(periodos, /data-cm="periodo" data-mes="2026-10" data-quincena="0"/);
  assert.match(periodos, /data-cm="periodo" data-mes="2026-10" data-quincena="1"/);
  assert.match(periodos, /data-cm="periodo" data-mes="2026-10" data-quincena="2"/);
});

test('un mes sin nada en una quincena no ofrece ese botón, y sin nada por pagar no hay bloque de períodos', () => {
  const soloPrimera = htmlPeriodos(cuentaDeAna([regresaEl('o1', '2026-10-03')]));
  assert.match(soloPrimera, /data-quincena="1"/);
  assert.doesNotMatch(soloPrimera, /data-quincena="2"/);
  assert.equal(htmlPeriodos(cuentaDeAna([abierta('a1'), debiendo('d1')])), '', 'lo que no cierra no tiene período');
  assert.equal(htmlPeriodos(cuentaDeAna([])), '');
  assert.doesNotMatch(ficha('Ana López', { lectura: lecturaOk({ contratos: [abierta('a1')] }) }), /dn-periodos/);
});

test('los meses salen del más viejo al más nuevo, cada uno con su nombre', () => {
  const html = htmlPeriodos(cuentaDeAna([regresaEl('n1', '2026-11-20'), regresaEl('s1', '2026-09-02'), regresaEl('o1', '2026-10-17')]));
  const nombres = [...html.matchAll(/<span class="dn-periodo-mes">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(nombres, ['septiembre 2026', 'octubre 2026', 'noviembre 2026']);
});

test('idsDelPeriodo: el mes completo, una quincena, y nada si ya no existe; siempre de la cuenta de AHORA', () => {
  const cuenta = cuentaDeAna(deOctubre());
  assert.deepEqual(idsDelPeriodo(cuenta, '2026-10', 0).sort(), ['o1', 'o2', 'o3', 'o4', 'o5']);
  assert.deepEqual(idsDelPeriodo(cuenta, '2026-10', 1).sort(), ['o1', 'o2']);
  assert.deepEqual(idsDelPeriodo(cuenta, '2026-10', 2).sort(), ['o3', 'o4', 'o5']);
  assert.deepEqual(idsDelPeriodo(cuenta, '2026-11', 0), []);
  assert.deepEqual(idsDelPeriodo(cuenta, '2026-10', 3), []);
  const yaPagada = cuentaDeAna(deOctubre(), [pagoDeComision({ id: 'p', monto: 140, contratos: ['o1', 'o2'] })]);
  assert.deepEqual(idsDelPeriodo(yaPagada, '2026-10', 1), [], 'lo ya pagado no se vuelve a ofrecer');
});

test('marcar una quincena suma EXACTO lo que dice su botón, y es lo que se guardaría', () => {
  const lectura = lecturaOk({ contratos: deOctubre() });
  const entrada = anaDe(lectura);
  const ids = idsDelPeriodo(entrada.cuenta, '2026-10', 2);
  const marcadas = resumenDeMarcadasDeComision(entrada, new Set(ids));
  assert.deepEqual([marcadas.cuantas, marcadas.total], [3, 210]);
  assert.match(ficha('Ana López', { lectura }), /2\.ª quincena \(16–31\) · 3 rentas · Q210\.00/);
});

test('NADA SE MARCA EN SILENCIO: tras marcar una quincena, lo que quedó fuera sigue a la vista con su total', () => {
  const lectura = lecturaOk({ contratos: deOctubre() });
  const entrada = anaDe(lectura);
  const marcados = new Set(idsDelPeriodo(entrada.cuenta, '2026-10', 1));
  const html = ficha('Ana López', { lectura, ui: uiVacia({ marcados }) });
  assert.match(texto(html), /Marcado: 2 rentas Total marcado Q140\.00 Sin marcar: 3 rentas · Q210\.00/);
  assert.doesNotMatch(html, /id="cm-sin-marcar"[^>]*hidden/, 'la línea se ve');
  // Las filas de lo no marcado siguen estando, con su casilla sin marcar.
  const casilla = (id) => new RegExp(`<input[^>]*data-cm="marcar" data-id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
  for (const id of ['o3', 'o4', 'o5']) {
    assert.ok(casilla(id), `${id} sigue en la lista, con su casilla`);
    assert.doesNotMatch(casilla(id), /checked/, `${id} no está marcada`);
  }
  for (const id of ['o1', 'o2']) assert.match(casilla(id), /checked/, `${id} sí`);
  assert.match(texto(html), /Por pagar en total Q350\.00/, 'el total de lo que se debe no cambia al marcar');
});

test('la línea «Sin marcar» solo aparece cuando se escogió una parte: sin nada marcado, o con todo marcado, no dice nada', () => {
  const lectura = lecturaOk({ contratos: deOctubre() });
  const entrada = anaDe(lectura);
  const todas = new Set(idsDelPeriodo(entrada.cuenta, '2026-10', 0));
  for (const marcados of [new Set(), todas]) {
    const html = ficha('Ana López', { lectura, ui: uiVacia({ marcados }) });
    assert.match(html, /id="cm-sin-marcar" class="dn-gris" hidden><\/span>/, `${marcados.size} marcadas`);
    assert.doesNotMatch(texto(html), /Sin marcar/);
  }
  const algunas = resumenDeMarcadasDeComision(entrada, new Set(['o1']));
  assert.equal(textoDeSinMarcar(algunas, sinMarcarDeComision(entrada.cuenta, algunas.ids)), 'Sin marcar: 4 rentas · Q280.00');
  assert.equal(textoDeSinMarcar({ cuantas: 0 }, { contratos: ['a'], monto: 70 }), '');
  assert.equal(textoDeSinMarcar({ cuantas: 2 }, { contratos: [], monto: 0 }), '');
  assert.equal(textoDeSinMarcar({ cuantas: 1 }, { contratos: ['a'], monto: 70 }), 'Sin marcar: 1 renta · Q70.00', 'singular');
});

test('parchearSinMarcar pone el texto y lo muestra, o lo vacía y lo esconde', () => {
  const nodo = { textContent: '', hidden: true };
  const raiz = { querySelector: (id) => (id === '#cm-sin-marcar' ? nodo : null) };
  parchearSinMarcar(raiz, 'Sin marcar: 3 rentas · Q210.00');
  assert.deepEqual(nodo, { textContent: 'Sin marcar: 3 rentas · Q210.00', hidden: false });
  parchearSinMarcar(raiz, '');
  assert.deepEqual(nodo, { textContent: '', hidden: true });
  assert.doesNotThrow(() => parchearSinMarcar({ querySelector: () => null }, 'x'), 'sin la línea en la página no revienta');
});

test('el parche y la plantilla dicen lo mismo marcando un período (con la línea «Sin marcar» incluida)', () => {
  const lectura = lecturaOk({ contratos: deOctubre() });
  const entrada = anaDe(lectura);
  const periodos = [[], idsDelPeriodo(entrada.cuenta, '2026-10', 1), idsDelPeriodo(entrada.cuenta, '2026-10', 2), idsDelPeriodo(entrada.cuenta, '2026-10', 0)];
  for (const antes of periodos) {
    for (const despues of periodos) {
      const pagina = paginaFalsa(ficha('Ana López', { lectura, ui: uiVacia({ marcados: new Set(antes) }) }));
      const marcadas = resumenDeMarcadasDeComision(entrada, new Set(despues));
      parchearMarcado(pagina.raiz, marcadas, { pagando: false });
      parchearSinMarcar(pagina.raiz, textoDeSinMarcar(marcadas, sinMarcarDeComision(entrada.cuenta, marcadas.ids)));
      assert.equal(pagina.visible(), paginaFalsa(ficha('Ana López', { lectura, ui: uiVacia({ marcados: new Set(despues) }) })).visible(), `de ${antes.length} a ${despues.length}`);
    }
  }
});

test('los períodos no ponen plazos ni avisos: nada de «atrasado», «vencido», «lleva días» ni rojo por no haber pagado', () => {
  const viejo = [regresaEl('v1', '2026-01-03'), regresaEl('v2', '2026-01-20'), regresaEl('o1', '2026-10-03')];
  const html = ficha('Ana López', { lectura: lecturaOk({ contratos: viejo }) });
  const periodos = html.slice(html.indexOf('class="dn-periodos"'), html.indexOf('<table'));
  assert.doesNotMatch(texto(periodos), /atras|venc|lleva|desde hace|recuerd|urgente|falta pagar|sin pagar|pendiente|plazo/i);
  assert.doesNotMatch(periodos, /dn-alerta|barra-lectura-fallida|role="alert"/);
  assert.match(texto(periodos), /enero 2026/, 'un mes viejo se ofrece igual que uno nuevo: sin distinguirlo');
  assert.doesNotMatch(html, /barra-lectura-fallida/, 'y la ficha entera no se pinta de rojo por lo viejo');
});

test('el clic de un período reemplaza lo marcado, sincroniza las casillas y suma a la vista: lo dice el código de la pantalla', () => {
  const clic = PANTALLA.slice(PANTALLA.indexOf("case 'periodo':"), PANTALLA.indexOf("default: return;"));
  assert.match(clic, /ui\.marcados = new Set\(idsDelPeriodo\(entrada\.cuenta, accion\.dataset\.mes, Number\(accion\.dataset\.quincena\)\)\)/);
  assert.match(clic, /sincronizarCasillas\(\);\s*actualizarMarcado\(\);/);
  assert.match(PANTALLA, /parchearSinMarcar\(raiz, textoDeSinMarcar\(marcadas, sinMarcarDeComision\(entrada\.cuenta, marcadas\.ids\)\)\)/);
  assert.match(PANTALLA, /todas\.checked = filas\.length > 0 && filas\.every/);
});

test('la pantalla no arma los períodos ni decide «quincena»: se los pide al núcleo', () => {
  assert.match(PANTALLA, /periodosDePago\(/);
  assert.ok(!/slice\(8,\s*10\)|slice\(0,\s*7\)|getUTCDate\(\)\s*<=|<=\s*15\b/.test(PANTALLA.replace(/'[^']*'/g, "''")), 'ni parte la fecha ni compara contra 15');
  assert.ok(!/estadoContrato|pendientesDe/.test(PANTALLA), 'y lo que cierra y lo que no se lo pregunta al núcleo');
  assert.match(PANTALLA, /razonDeNoCierre\(c\)/);
  assert.match(PANTALLA, /estadoDeComision\(c\) === 'estimada'/);
});

// ===========================================================================
// El CABLEADO de la pantalla de comisiones: qué pasa cuando él aprieta algo
// ===========================================================================
//
// Hasta el 26 de noviembre de 2026 esto no se podía probar: hacía falta un navegador, una sesión de
// Firebase de verdad y la nube. Lo dice la cabecera vieja de este archivo — «el cableado del DOM se
// comprobó a mano en el navegador». Ahora `pintarCuentas` recibe sus aparatos, igual que la pantalla de
// los dueños, y se aprieta con la misma pantalla de mentira (`fixtures/pantallaDeMentira.mjs`), que solo
// encuentra lo que la pantalla dibujó de verdad.

/** Monta la pantalla de comisiones con todo de mentira menos ella misma. */
async function pantallaDeComisiones({
  lectura = lecturaOk({ contratos: [firme('a1', { empleado: ana })] }),
  clave = null,
  sesion = true,
  responder = () => true,
  pagar,
  anular,
  bajarElExcel,
  leerElPago,
  enlazarAlEmpleado,
  dibujarComprobante,
} = {}) {
  const p = pantallaDeMentira();
  const lecturas = [];
  // El mismo `valida` que usa la pantalla de verdad: si no, el lector da por mala una lectura buena.
  const lector = crearLector({
    leer: async () => { lecturas.push(1); return lectura; },
    valida: (l) => armarVistaDeComisiones(l).ok,
  });
  const preguntas = [];
  const dichos = [];
  const pagos = [];
  const anulaciones = [];
  const bajadas = [];
  const comprobantes = [];
  const rutasMostradas = [];
  const enlaces = [];
  let rutaActual = clave === null ? '#/dinero/comisiones' : `#/dinero/comisiones/${encodeURIComponent(clave)}`;
  let sesionAbierta = sesion;
  const aparatos = {
    lector,
    sesionAbierta: () => sesionAbierta,
    ahora: () => HOY,
    doc: p.documento,
    preguntar: (texto2) => { preguntas.push(texto2); return responder(texto2); },
    rutaDeAhora: () => rutaActual,
    irA: (r) => { rutaActual = r; },
    cambiarLaDireccion: (r) => { rutaActual = r; },
    avisar: (texto2, tipo) => dichos.push({ texto: texto2, tipo }),
    mostrarLaRuta: (r) => rutasMostradas.push(r),
    pagar: pagar ?? (async (args) => { pagos.push(args); return { tipo: 'guardado', pago: { id: 'pc-1', numero: 5, monto: 100 }, pagos: [] }; }),
    anular: anular ?? (async (args) => { anulaciones.push(args); return { tipo: 'anulado', pago: { numero: 5 }, pagos: [] }; }),
    bajarElExcel: bajarElExcel ?? (async (args) => {
      bajadas.push(args);
      return { nombre: 'comisiones-2026.xlsx', cuenta: { empleados: 3, rentas: 7, pagos: 2, debe: 1500 }, avisos: [] };
    }),
    leerElPago: leerElPago ?? (async (args) => ({ tipo: 'esta', pago: { id: args.pagoId, numero: 5, monto: 100 }, pagos: [] })),
    dibujarComprobante: dibujarComprobante ?? ((_caja, modelo) => comprobantes.push(modelo)),
    enlazarAlEmpleado: enlazarAlEmpleado ?? (async (ids, empleadoId, extra) => { enlaces.push({ ids, empleadoId, ...extra }); }),
  };
  if (clave === null) await pintarComisiones(p.contenedor, aparatos);
  else await pintarComisionesDeEmpleado(p.contenedor, clave, aparatos);
  return {
    ...p, lector, lecturas, preguntas, dichos, pagos, anulaciones, bajadas, comprobantes, rutasMostradas, enlaces,
    ruta: () => rutaActual,
    cerrarLaSesion() { sesionAbierta = false; },
  };
}

test('el cableado: la pantalla de comisiones se dibuja con la lectura, sin tocar la nube', async () => {
  const p = await pantallaDeComisiones();
  assert.match(p.html(), /Ana/, 'sale el empleado de la lectura');
  assert.ok(p.hay('tr[data-cm-clave]'), 'cada empleado trae su fila con su clave');
});

test('el cableado: sin sesión de dinero no se dibuja ni una cifra; se vuelve a pasar por la puerta', async () => {
  // Esta pantalla vive detrás de `conPuertaDeDinero` (app.js), así que no dibuja ella la puerta: vuelve a
  // pedir la ruta, y la puerta de app.js se encarga de pedir la contraseña.
  const p = await pantallaDeComisiones({ sesion: false });
  assert.doesNotMatch(p.html(), /Q\d/, 'ni una cifra');
  assert.doesNotMatch(p.html(), /Ana/, 'ni un nombre');
  assert.deepEqual(p.rutasMostradas, ['#/dinero/comisiones'], 'se vuelve a pasar por la puerta');
});

test('el cableado: bajar el Excel pide la cuenta ABIERTA cuando es «una», y todas cuando no', async () => {
  // Reemplaza a una prueba que leía ocho pedazos del TEXTO del código.
  const p = await pantallaDeComisiones({ clave: 'id:e1' });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
  assert.ok(boton, 'la ficha trae su botón de bajar');
  assert.equal(boton.dataset.alcance, 'una', 'el de la ficha baja SOLO esta cuenta');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.bajadas.length, 1);
  assert.equal(p.bajadas[0].clave, 'id:e1', 'y pide la cuenta ABIERTA, no todas');
  assert.equal(p.bajadas[0].hoy, HOY, 'con la fecha de hoy');
  assert.ok(p.dichos.some((d) => d.tipo === 'exito'), 'y se le dice que se bajó');

  // Y el de la lista baja TODAS: clave null.
  const lista = await pantallaDeComisiones();
  const suyo = lista.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
  assert.notEqual(suyo.dataset.alcance, 'una');
  lista.lanzar('click', suyo);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(lista.bajadas[0].clave, null, 'todas las cuentas');
});

test('el cableado: mientras arma el Excel, el botón se apaga y lo dice', async () => {
  let visto = null;
  const p = await pantallaDeComisiones({
    clave: 'id:e1',
    bajarElExcel: async () => {
      const b = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
      visto = { apagado: b.disabled, texto: b.textContent };
      return { cuantas: 1 };
    },
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(visto.apagado, true);
  assert.equal(visto.texto, 'Armando el archivo…');
});

test('el cableado: si bajar el Excel falla, el aviso se QUEDA ESCRITO en la página', async () => {
  // Un aviso flotante de cinco segundos se pierde, y él creería que el archivo se bajó.
  const p = await pantallaDeComisiones({
    clave: 'id:e1',
    bajarElExcel: async () => { throw new Error('se rompió algo raro'); },
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.html(), /No se bajó nada/, 'queda escrito en la pantalla, no en un aviso que se va');
  assert.ok(!p.dichos.some((d) => d.tipo === 'exito'), 'y nunca se canta como bajado');
});

test('el cableado: bajar el Excel dos veces de un clic doble solo lo baja una vez', async () => {
  const p = await pantallaDeComisiones({ clave: 'id:e1' });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
  p.lanzar('click', boton);
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.bajadas.length, 1);
});

/** Una ficha con un pago de comisión ya hecho, para poder apretar «Ver comprobante» y «Anular». */
async function conUnPagoHecho(opciones = {}) {
  const renta1 = firme('a1');
  // Un pago CON PAPEL (número y detalle) es el que ofrece «Ver comprobante»; los de antes del papel, no.
  const pago = { ...pagoDeComision({ id: 'p1', monto: 140, contratos: ['a1'] }), numero: 5, detalle: [filaDeDetalle(renta1)] };
  const lectura = lecturaOk({ contratos: [renta1], pagos: [pago] });
  const vista = armarVistaDeComisiones(lectura);
  const clave = vista.entradas.find((e) => e.pagos?.length || e.nombre === 'Ana López')?.clave ?? vista.entradas[0].clave;
  const p = await pantallaDeComisiones({ lectura, clave, ...opciones });
  return { p, pago, clave };
}

test('el cableado: «Ver comprobante» vuelve a LEER el pago antes de dibujar el papel', async () => {
  // Reemplaza a una prueba que leía once pedazos del TEXTO del código. Un papel que sale de la empresa no
  // puede salir de una copia vieja: se lee otra vez, y lo leído manda.
  const leidos = [];
  const { p } = await conUnPagoHecho({
    leerElPago: async ({ pagoId }) => {
      leidos.push(pagoId);
      return { tipo: 'esta', pago: { id: pagoId, numero: 5, monto: 100 }, pagos: [] };
    },
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'comprobante');
  assert.ok(boton, 'la ficha trae su botón de comprobante');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(leidos.length, 1, 'se lee de nuevo antes de dibujar');
  assert.equal(p.comprobantes.length, 1, 'y se dibuja el papel');
});

test('el cableado: un pago que YA NO ESTÁ no dibuja ningún papel: se dice y se redibuja la ficha', async () => {
  const { p } = await conUnPagoHecho({
    leerElPago: async () => ({ tipo: 'no-esta', pago: null, pagos: [] }),
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'comprobante');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.comprobantes, [], 'no sale ningún papel');
  assert.ok(p.dichos.some((d) => d.texto === MENSAJE_COMPROBANTE_COMISION_NO_ESTA && d.tipo === 'error'));
});

test('el cableado: si la sesión se cerró MIENTRAS leía el pago, lo leído se tira', async () => {
  // Es dinero, y se suelta con la sesión: ni se guarda en memoria ni se dibuja el papel.
  const { p } = await conUnPagoHecho({
    leerElPago: async ({ pagoId }) => {
      p.cerrarLaSesion();
      return { tipo: 'esta', pago: { id: pagoId, numero: 5, monto: 100 }, pagos: [{ id: 'colado' }] };
    },
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'comprobante');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.comprobantes, [], 'no se dibuja el papel');
  assert.equal(p.lector.actual, null, 'y al encontrar la sesión cerrada, lo leído se suelta entero');
  const pagosAhora = p.lector.actual?.pagos?.datos ?? [];
  assert.ok(!pagosAhora.some((x) => x.id === 'colado'), 'lo que llegó tarde no se guardó');
});

test('el cableado: si leer el pago FALLA, se le dice y la ficha sigue ahí', async () => {
  const { p } = await conUnPagoHecho({
    leerElPago: async () => { throw new Error('se cayó el internet'); },
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'comprobante');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.comprobantes, []);
  assert.equal(p.dichos.at(-1).tipo, 'error');
  assert.match(p.html(), /Ana/, 'y la ficha sigue dibujada');
});

test('el cableado: «Ver comprobante» dos veces de un clic doble solo lee una vez', async () => {
  const leidos = [];
  const { p } = await conUnPagoHecho({
    leerElPago: async ({ pagoId }) => {
      leidos.push(pagoId);
      return { tipo: 'esta', pago: { id: pagoId, numero: 5, monto: 100 }, pagos: [] };
    },
  });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'comprobante');
  p.lanzar('click', boton);
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(leidos.length, 1);
});



// ---------------------------------------------------------------------------
// Registrar el pago de una comisión
// ---------------------------------------------------------------------------

/** La ficha de Ana con una renta firme marcada y el formulario de pago abierto. */
async function conElPagoAbierto(opciones = {}) {
  const lectura = lecturaOk({ contratos: [firme('a1')] });
  const p = await pantallaDeComisiones({ lectura, clave: 'id:e1', ...opciones });
  const casilla = p.raiz.querySelectorAll('[data-cm="marcar"]')[0];
  if (casilla) p.lanzar('change', casilla, { checked: true });
  const registrar = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'registrar');
  p.lanzar('click', registrar);
  return p;
}

test('comisiones: lo que se guarda se LEE del formulario al guardar', async () => {
  // La misma regla de la pantalla de dueños y de `hora24`: no puede depender de que un evento del
  // navegador haya alcanzado a correr.
  const p = await conElPagoAbierto();
  p.buscar('#dn-fecha').value = '2026-10-19';
  p.buscar('#dn-forma').value = 'cheque';
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.pagos.at(-1).fecha, '2026-10-19');
  assert.equal(p.pagos.at(-1).forma, 'cheque');
});

test('comisiones: una fecha que todavía no llega NO gasta un número de comprobante', async () => {
  const p = await conElPagoAbierto();
  p.buscar('#dn-fecha').value = '2062-01-05';
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.pagos, []);
  assert.match(p.html(), /La fecha del pago todavía no llega/);
});

test('comisiones: el pago lleva la lista de EMPLEADOS, que es de donde sale el porcentaje', async () => {
  const p = await conElPagoAbierto();
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  const empleados = p.pagos.at(-1).empleados;
  assert.equal(empleados.fallo, false);
  assert.ok(empleados.datos.some((e) => e.id === 'e1'), 'con el empleado de esta cuenta adentro');
});

test('comisiones: al registrar se le dice el MONTO y el número de comprobante', async () => {
  const p = await conElPagoAbierto({
    pagar: async () => ({ tipo: 'guardado', pago: { id: 'pc-9', numero: 9, monto: 140 }, pagos: [] }),
  });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.dichos.at(-1).texto, /Pago registrado: Q140\.00\. Comprobante N\.° 9\./);
  assert.equal(p.dichos.at(-1).tipo, 'exito');
});

test('comisiones: uno que YA ESTABA registrado se dice distinto', async () => {
  const p = await conElPagoAbierto({
    pagar: async () => ({ tipo: 'ya-guardado', pago: { id: 'pc-9', numero: 9, monto: 140 }, pagos: [] }),
  });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.dichos.at(-1).texto, /Ese pago ya estaba registrado \(comprobante N\.° 9\)/);
  assert.doesNotMatch(p.dichos.at(-1).texto, /Pago registrado:/);
});

test('comisiones: si la cuenta CAMBIÓ, el formulario se queda abierto y lo marcado se suelta', async () => {
  const p = await conElPagoAbierto({ pagar: async () => ({ tipo: 'cambio', pagos: [] }) });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.ok(p.hay('#dn-guardar-pago'), 'sigue abierto');
  assert.match(p.html(), /Mientras tanto cambió la cuenta de este empleado/);
  assert.ok(!p.dichos.some((d) => /Pago registrado/.test(d.texto)));
});

test('comisiones: el reintento lleva la MISMA marca, para no pagar dos veces', async () => {
  let falla = true;
  const marcas = [];
  const p = await conElPagoAbierto({
    pagar: async (args) => {
      marcas.push(args.enCurso);
      if (falla) throw new Error('se cayó el internet');
      return { tipo: 'guardado', pago: { id: 'pc-9', numero: 9, monto: 140 }, pagos: [] };
    },
  });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.html(), /No se pudo registrar el pago/);
  falla = false;
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(marcas.length, 2);
  assert.strictEqual(marcas[0], marcas[1], 'la misma marca, no una nueva');
});

// ---------------------------------------------------------------------------
// Enlazar rentas viejas a un empleado de la lista
// ---------------------------------------------------------------------------

/** Una cuenta de antes de la lista de empleados: el nombre escrito a mano, sin `empleadoId`. */
async function conUnaCuentaAMano(opciones = {}) {
  const vieja = rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' });
  const lectura = lecturaOk({ contratos: [vieja] });
  const p = await pantallaDeComisiones({ lectura, clave: 'texto:Pedro', ...opciones });
  return { p, vieja };
}

test('comisiones: enlazar sin escoger a nadie no pregunta ni enlaza', async () => {
  const { p } = await conUnaCuentaAMano();
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  assert.ok(boton, 'la cuenta a mano ofrece enlazarse');
  p.lanzar('click', boton);
  assert.deepEqual(p.preguntas, []);
  assert.match(p.html(), /Escoge a qué empleado de la lista corresponde/);
});

test('comisiones: enlazar pregunta antes; un «no» no enlaza nada', async () => {
  const { p } = await conUnaCuentaAMano({ responder: () => false });
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  assert.equal(p.preguntas.length, 1);
  assert.match(p.preguntas[0], /Ana López/);
});

test('comisiones: al enlazar, las rentas quedan con su empleado en memoria y la cuenta cambia de dirección', async () => {
  const { p } = await conUnaCuentaAMano();
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  const v1 = p.lector.actual.contratos.datos.find((c) => c.id === 'v1');
  assert.equal(v1.empleadoId, 'e1');
  assert.equal(p.ruta(), '#/dinero/comisiones/id%3Ae1', 'de «texto:» a «id:», sin volver a leer');
  assert.ok(p.dichos.some((d) => /Rentas enlazadas/.test(d.texto)));
});

test('comisiones: al enlazar con porcentaje nuevo, SOLO las rentas sin pagar lo toman', async () => {
  // Lo ya pagado no se toca: el empleado tiene su comprobante con la cifra de ese día, y cambiarle el
  // porcentaje por detrás haría que su cuenta ya no cuadre con el papel que tiene en la mano.
  const pagada = rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' });
  const sinPagar = rentaDeAntes({ id: 'v2', rentadoPor: 'Pedro', recibidoEl: '2026-09-30', numero: 2 });
  const pago = { ...pagoDeComision({ id: 'pv1', monto: 140, contratos: ['v1'] }), numero: 1, detalle: [filaDeDetalle(pagada)] };
  const lectura = lecturaOk({ contratos: [pagada, sinPagar], pagos: [pago] });
  const p = await pantallaDeComisiones({ lectura, clave: 'texto:Pedro' });

  p.buscar('#cm-enlazar-empleado').value = 'e16';          // Luis, que cobra 7.5 %
  p.lanzar('change', '#cm-enlazar-porcentaje', { checked: true });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });

  assert.equal(p.enlaces.length, 1);
  assert.deepEqual(p.enlaces[0].ids.sort(), ['v1', 'v2'], 'las dos se enlazan al empleado');
  assert.deepEqual(p.enlaces[0].idsConPorcentaje, ['v2'], 'pero SOLO la que no se ha pagado toma el porcentaje nuevo');
  assert.equal(p.enlaces[0].porcentajeComision, 7.5);

  const enMemoria = Object.fromEntries(p.lector.actual.contratos.datos.map((c) => [c.id, c.porcentajeComision]));
  assert.equal(enMemoria.v2, 7.5, 'la que no se había pagado queda con el porcentaje nuevo');
  assert.equal(enMemoria.v1, 5, 'la pagada se queda con el que tenía: su comprobante ya salió así');
});

test('comisiones: sin marcar el porcentaje, ninguna renta lo cambia', async () => {
  const { p } = await conUnaCuentaAMano();
  p.buscar('#cm-enlazar-empleado').value = 'e16';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.enlaces[0].idsConPorcentaje, [], 'nadie toma el porcentaje nuevo');
  const v1 = p.lector.actual.contratos.datos.find((c) => c.id === 'v1');
  assert.equal(v1.porcentajeComision, 5, 'la renta se queda con el suyo');
});

// ---------------------------------------------------------------------------
// Anular un pago de comisión
// ---------------------------------------------------------------------------

test('comisiones: anular pregunta antes; un «no» no anula nada', async () => {
  const { p } = await conUnPagoHecho({ responder: () => false });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'anular-pago');
  p.lanzar('click', boton);
  assert.equal(p.preguntas.length, 1);
  assert.deepEqual(p.anulaciones, []);
});

test('comisiones: anular avisa dónde queda el pago; uno YA anulado se dice distinto', async () => {
  const { p } = await conUnPagoHecho({ anular: async () => ({ tipo: 'anulado', pago: { numero: 5 }, pagos: [] }) });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'anular-pago');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.dichos.at(-1).texto, /Pago anulado\. Queda en «Ya pagado», marcado como anulado/);

  const otra = await conUnPagoHecho({ anular: async () => ({ tipo: 'ya-anulado', pago: { numero: 5 }, pagos: [] }) });
  const suyo = otra.p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'anular-pago');
  otra.p.lanzar('click', suyo);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(otra.p.dichos.at(-1).texto, /Ese pago ya estaba anulado/);
});

test('comisiones: anular uno que YA NO ESTÁ se avisa como error, nunca como éxito', async () => {
  const { p } = await conUnPagoHecho({ anular: async () => ({ tipo: 'no-esta', pago: null, pagos: [] }) });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'anular-pago');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.dichos.at(-1).tipo, 'error');
  assert.ok(!p.dichos.some((d) => /Pago anulado\./.test(d.texto)));
});

test('comisiones: anular dos veces de un clic doble solo anula una', async () => {
  const { p } = await conUnPagoHecho();
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'anular-pago');
  p.lanzar('click', boton);
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.anulaciones.length, 1);
  assert.equal(p.preguntas.length, 1, 'ni vuelve a preguntar');
});

// ---------------------------------------------------------------------------
// Marcar rentas: la casilla de cada fila y la de «todas»
// ---------------------------------------------------------------------------
// 36 de los 43 errores del manejador de `change` pasaban sin que nada se pusiera rojo: es el pedazo con
// más huecos de esta pantalla, y es el que decide CUÁNTO se le va a pagar al empleado.

/** La ficha de Ana con tres rentas firmes, todas pagables. */
async function conTresRentas(opciones = {}) {
  const lectura = lecturaOk({ contratos: [firme('a1'), firme('a2', { numero: 2 }), firme('a3', { numero: 3 })] });
  const p = await pantallaDeComisiones({ lectura, clave: 'id:e1', ...opciones });
  const casillas = () => p.raiz.querySelectorAll('[data-cm="marcar"]');
  const todas = () => p.buscar('[data-cm="marcar-todas"]');
  const total = () => p.buscar('#dn-total-marcado')?.textContent;
  return { p, casillas, todas, total };
}

test('marcar: cada casilla suma lo suyo al total de lo marcado', async () => {
  const { p, casillas, total } = await conTresRentas();
  assert.equal(casillas().length, 3, 'el control: tres rentas pagables');
  p.lanzar('change', casillas()[0], { checked: true });
  const unaSola = total();
  p.lanzar('change', casillas()[1], { checked: true });
  assert.notEqual(total(), unaSola, 'con dos marcadas el total cambia');
  p.lanzar('change', casillas()[1], { checked: false });
  assert.equal(total(), unaSola, 'y al desmarcar vuelve');
});

test('marcar: «todas» marca TODAS las que se pueden pagar, y desmarcarla las suelta', async () => {
  const { p, casillas, todas, total } = await conTresRentas();
  p.lanzar('change', todas(), { checked: true });
  assert.deepEqual(casillas().map((c) => c.checked), [true, true, true], 'las tres quedan marcadas');
  const conTodas = total();
  p.lanzar('change', todas(), { checked: false });
  assert.deepEqual(casillas().map((c) => c.checked), [false, false, false]);
  assert.notEqual(total(), conTodas, 'y el total vuelve a cero');
  assert.equal(total(), 'Q0.00');
});

test('marcar: la casilla de «todas» se marca sola cuando ya están todas, y se suelta si falta una', async () => {
  // Si no siguiera a las de abajo, él vería «todas» sin marcar con todo marcado, o al revés — y una
  // casilla que miente sobre lo que está marcado es una cifra que no cuadra con lo que se va a pagar.
  const { p, casillas, todas } = await conTresRentas();
  for (const c of casillas()) p.lanzar('change', c, { checked: true });
  assert.equal(todas().checked, true, 'con las tres marcadas, «todas» se marca sola');
  p.lanzar('change', casillas()[1], { checked: false });
  assert.equal(todas().checked, false, 'y al quitar una, se suelta');
});

test('marcar: en una cuenta SIN rentas que pagar, «todas» no se marca sola', async () => {
  // `filas.length > 0` en `sincronizarCasillas`: sin ese guardia, una cuenta vacía dibuja «todas»
  // marcada —porque «todas las de la lista» de una lista vacía es cierto— y eso se lee como si hubiera
  // algo marcado cuando no hay nada.
  const lectura = lecturaOk({ contratos: [abierta('a9')] }); // el carro sigue afuera: no se puede pagar
  const p = await pantallaDeComisiones({ lectura, clave: 'id:e1' });
  const todas = p.buscar('[data-cm="marcar-todas"]');
  if (todas) assert.equal(todas.checked, false, 'no se marca sola sobre una lista vacía');
  assert.equal(p.raiz.querySelectorAll('[data-cm="marcar"]').length, 0, 'el control: no hay nada que marcar');
});

test('marcar: lo que se escoge en el formulario queda apuntado al instante', async () => {
  const p = await conElPagoAbierto();
  p.lanzar('change', '#dn-forma', { value: 'transferencia' });
  p.lanzar('change', '#dn-fecha', { value: '2026-10-18' });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.pagos.at(-1).forma, 'transferencia');
  assert.equal(p.pagos.at(-1).fecha, '2026-10-18');
});

test('marcar: el empleado y el porcentaje del enlace quedan apuntados al escogerlos', async () => {
  const { p } = await conUnaCuentaAMano({ responder: () => false });
  p.lanzar('change', '#cm-enlazar-empleado', { value: 'e16' });
  p.lanzar('change', '#cm-enlazar-porcentaje', { checked: true });
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  assert.equal(p.preguntas.length, 1, 'con el empleado apuntado ya se puede preguntar');
  assert.match(p.preguntas[0], /Luis Mérida/, 'el que él escogió');
});

test('marcar: el empleado escogido NO se pierde si OTRA COSA redibuja la pantalla', async () => {
  // Para esto sirve apuntarlo. `enlazar()` lee el campo por su cuenta al apretar, así que no hace falta
  // para enlazar; hace falta para cuando él escoge al empleado y, antes de apretar Enlazar, pasa otra
  // cosa que redibuja la ficha (aquí, bajar el Excel). Sin lo apuntado, el desplegable vuelve a «Escoge
  // un empleado» y la casilla del porcentaje se destilda: él tendría que buscarlo otra vez, y podría
  // escoger a otro sin darse cuenta.
  const { p } = await conUnaCuentaAMano();
  p.lanzar('change', '#cm-enlazar-empleado', { value: 'e16' });
  p.lanzar('change', '#cm-enlazar-porcentaje', { checked: true });

  const bajar = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'bajar');
  p.lanzar('click', bajar);
  await new Promise((ok) => { setTimeout(ok, 0); });

  assert.match(p.html(), /<option value="e16" selected>/, 'Luis Mérida sigue escogido');
  assert.match(p.html(), /id="cm-enlazar-porcentaje" checked/, 'y la casilla del porcentaje sigue marcada');
});

// ---------------------------------------------------------------------------
// La vista: de qué lectura se arma, y QUÉ NOMBRE se ve
// ---------------------------------------------------------------------------

test('la vista: cada lectura que falla se dice por su nombre, y las dos juntas también', async () => {
  const soloPagos = armarVistaDeComisiones({ ...lecturaOk(), pagos: { datos: null, fallo: true } });
  assert.equal(soloPagos.ok, false);
  assert.deepEqual(soloPagos.problemas, ['pagos']);

  const soloRentas = armarVistaDeComisiones({ ...lecturaOk(), contratos: { datos: null, fallo: true } });
  assert.deepEqual(soloRentas.problemas, ['rentas']);

  const ambas = armarVistaDeComisiones({
    contratos: { datos: null, fallo: true }, pagos: { datos: null, fallo: true }, empleados: { datos: [], fallo: false },
  });
  assert.deepEqual(ambas.problemas, ['rentas', 'pagos'], 'las dos, en orden');
});

test('la vista: una lectura que llega SIN la lista (no es un arreglo) también es un problema', async () => {
  // No es lo mismo «llegó vacía» que «no llegó»: una lista que no es lista no se puede recorrer, y
  // tratarla como vacía dibujaría «no le debes nada a nadie» sobre una lectura rota.
  for (const malo of [null, undefined, 'nada', 42, {}]) {
    const v = armarVistaDeComisiones({ ...lecturaOk(), pagos: { datos: malo, fallo: false } });
    assert.equal(v.ok, false, JSON.stringify(malo));
    assert.deepEqual(v.problemas, ['pagos'], JSON.stringify(malo));
  }
});

test('la vista: el nombre que se ve es el de la LISTA de empleados, no el que se escribió ese día', async () => {
  // El contrato guarda el nombre como estaba el día de la renta. Si después se corrige en la ficha del
  // empleado, la cuenta tiene que salir con el nombre bueno, no con el viejo.
  const corregida = { ...ana, nombre: 'Ana López Mejía' };
  const v = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')], empleados: [corregida, wilder, luis] }));
  const suya = v.entradas.find((e) => e.empleadoId === 'e1');
  assert.equal(suya.nombre, 'Ana López Mejía', 'el de la lista manda');
});

test('la vista: sin empleado en la lista, se ve el nombre escrito en el contrato', async () => {
  const v = armarVistaDeComisiones(lecturaOk({ contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })] }));
  const pedro = v.entradas.find((e) => e.sinEnlazar);
  assert.equal(pedro.nombre, 'Pedro', 'el que quedó escrito a mano');
});

test('la vista: un empleado de la lista SIN nombre no sale en blanco', async () => {
  // Una fila sin nombre no se puede escoger ni leer: se dice que le falta.
  const sinNombre = { ...luis, nombre: '   ' };
  const v = armarVistaDeComisiones(lecturaOk({ contratos: [], empleados: [sinNombre] }));
  const html = htmlListaDeComisiones(v);
  assert.match(html, /Empleado sin nombre/, 'se dice que le falta el nombre');
});

test('la vista: con la lista de empleados CAÍDA no se acusa a nadie de «no está en la lista»', async () => {
  // Decirlo de alguien que sí está sería inventar un problema: la barra roja ya dice que no se pudo leer.
  const caida = { ...lecturaOk({ contratos: [firme('a1')] }), empleados: { datos: null, fallo: true } };
  const v = armarVistaDeComisiones(caida);
  assert.equal(v.ok, true, 'la cuenta se puede armar igual: los empleados solo ponen el nombre');
  assert.ok(v.entradas.every((e) => e.sinRegistro === false), 'de nadie se afirma que no está');

  // Una lista ROTA que no dice que falló cuenta igual que una caída: no se sabe quién está.
  for (const rota of [null, undefined, 'nada', 42]) {
    const v2 = armarVistaDeComisiones({ ...lecturaOk({ contratos: [firme('a1')] }), empleados: { datos: rota, fallo: false } });
    assert.ok(v2.entradas.every((e) => e.sinRegistro === false), `con datos ${JSON.stringify(rota)} tampoco se acusa`);
  }

  // El control: con la lista leída, el que no está sí se dice.
  const leida = armarVistaDeComisiones(lecturaOk({ contratos: [firme('a1')], empleados: [wilder, luis] }));
  assert.ok(leida.entradas.some((e) => e.sinRegistro === true), 'ahí sí');
});

// ---------------------------------------------------------------------------
// Lo que falta de registrar y de enlazar: lo que queda en memoria después
// ---------------------------------------------------------------------------

test('registrar: lo que contestó el guardado es la verdad, no lo que la pantalla tenía', async () => {
  const comoQuedo = [{ id: 'pc-9', numero: 9, monto: 140 }];
  const rentasFrescas = { datos: [firme('a1'), firme('a2', { numero: 2 })], fallo: false };
  const p = await conElPagoAbierto({
    pagar: async () => ({ tipo: 'guardado', pago: comoQuedo[0], pagos: comoQuedo, contratos: rentasFrescas }),
  });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(p.lector.actual.pagos.datos, comoQuedo, 'los pagos quedan como los dejó el guardado');
  assert.equal(p.lector.actual.contratos.datos.length, 2, 'y las rentas que se leyeron al guardar son las de ahora');
});

test('registrar: si el área se cerró y soltó lo leído mientras guardaba, no se escribe en memoria', async () => {
  // Lo que `if (!elLector.actual) return` cuida: cuando el área de dinero se cierra, suelta lo leído; si
  // la respuesta del guardado llega después, no hay dónde ponerla y no se inventa una lectura nueva.
  const p = await conElPagoAbierto({
    pagar: async () => {
      p.lector.olvidar();
      return { tipo: 'guardado', pago: { id: 'pc-9', numero: 9, monto: 140 }, pagos: [{ id: 'colado' }] };
    },
  });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.lector.actual, null, 'lo leído sigue suelto');
  assert.ok(p.dichos.every((d) => !/Pago registrado/.test(d.texto)), 'y no se canta un pago sobre una pantalla vacía');
  // Sin el guardia, escribir sobre lo que ya no está REVIENTA; el reventón se traga en el `catch` y la
  // pantalla se cambia por la de «no se pudo leer», que es mentira: el pago SÍ se registró, y lo que
  // pasó es que el área se cerró mientras tanto. Con el guardia, la pantalla se queda como estaba y la
  // puerta se encarga en la siguiente acción.
  assert.doesNotMatch(p.html(), /No se pudieron leer las rentas|No se pudieron leer los pagos/, 'no se cambia por la pantalla de fallo');
});

test('registrar: dos clics seguidos no registran dos pagos de comisión', async () => {
  const p = await conElPagoAbierto();
  p.clic('#dn-guardar-pago');
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.pagos.length, 1);
});

test('registrar: al lograrlo el formulario se cierra y lo marcado se suelta', async () => {
  const p = await conElPagoAbierto();
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.hay('#dn-guardar-pago'), false, 'el formulario se cierra');
  assert.equal(p.buscar('#dn-total-marcado')?.textContent ?? 'Q0.00', 'Q0.00', 'y no queda nada marcado');
});

test('enlazar: el empleado se lee del DESPLEGABLE al apretar, aunque no haya llegado ningún evento', async () => {
  // La misma regla de la casa: lo que se guarda no puede depender de que el navegador haya alcanzado a
  // mandar el aviso de que cambió el desplegable.
  const { p } = await conUnaCuentaAMano();
  p.buscar('#cm-enlazar-empleado').value = 'e16';   // sin lanzar ningún `change`
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.enlaces.length, 1);
  assert.equal(p.enlaces[0].empleadoId, 'e16', 'el que estaba escogido en el campo');
});

test('enlazar: SOLO las rentas de esa cuenta toman al empleado; las de otros no se tocan', async () => {
  // Sin el guardia, el `map` sobre todos los contratos le pondría ESTE empleado a TODAS las rentas que
  // haya en memoria, incluidas las de otra gente.
  const dePedro = rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' });
  const deAna = firme('a1');
  const lectura = lecturaOk({ contratos: [dePedro, deAna] });
  const p = await pantallaDeComisiones({ lectura, clave: 'texto:Pedro' });
  p.buscar('#cm-enlazar-empleado').value = 'e16';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });

  const porId = Object.fromEntries(p.lector.actual.contratos.datos.map((c) => [c.id, c.empleadoId]));
  assert.equal(porId.v1, 'e16', 'la de la cuenta que se enlazó');
  assert.equal(porId.a1, 'e1', 'la de Ana se queda con el suyo');
  assert.deepEqual(p.enlaces[0].ids, ['v1'], 'y a la nube solo se le mandan las de esa cuenta');
});

test('enlazar: al lograrlo, la cuenta deja de ofrecer el enlace y no queda nada marcado', async () => {
  // Lo que se puede afirmar de verdad: enlazada la cuenta, el formulario del enlace ya no se dibuja (la
  // cuenta dejó de estar «sin enlazar»). Las líneas que limpian el desplegable y la casilla del
  // porcentaje se revisaron con un error a propósito y NO rompen nada, porque ese formulario ya no sale:
  // son limpieza de más, no un agujero.
  const { p } = await conUnaCuentaAMano();
  p.lanzar('change', '#cm-enlazar-porcentaje', { checked: true });
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.hay('#cm-enlazar-empleado'), false, 'ya no se ofrece enlazar');
  assert.equal(p.buscar('#dn-total-marcado')?.textContent ?? 'Q0.00', 'Q0.00', 'y no queda nada marcado');
});

test('enlazar: si el área se cerró y soltó lo leído mientras enlazaba, no se escribe en memoria', async () => {
  const { p } = await conUnaCuentaAMano({
    enlazarAlEmpleado: async () => { p.lector.olvidar(); },
  });
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.lector.actual, null, 'lo leído sigue suelto: no se inventa una lectura nueva');
  assert.ok(p.dichos.every((d) => !/Rentas enlazadas/.test(d.texto)), 'y no se canta el enlace');
  assert.doesNotMatch(p.html(), /No se pudieron leer las rentas|No se pudieron leer los pagos/, 'ni se cambia por la pantalla de fallo');
});

test('enlazar: después de un fallo se puede volver a intentar', async () => {
  let falla = true;
  const intentos = [];
  const { p } = await conUnaCuentaAMano({
    enlazarAlEmpleado: async (ids, empleadoId) => {
      intentos.push(empleadoId);
      if (falla) throw new Error('se cayó el internet');
    },
  });
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  const boton = () => p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton());
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.match(p.html(), /No se pudieron enlazar las rentas/);
  falla = false;
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  p.lanzar('click', boton());
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.deepEqual(intentos, ['e1', 'e1'], 'el segundo intento corre: la pantalla no se quedó ocupada');
});

test('registrar: si la SESIÓN se cerró mientras guardaba, no se escribe en memoria y se pide la contraseña', async () => {
  // La misma regla que ya seguía `verComprobante`: es dinero, y se suelta con la sesión. Antes del 26 de
  // noviembre de 2026, `guardarPago` solo miraba si el lector seguía teniendo algo, así que una sesión
  // cerrada por Firebase mientras el guardado viajaba dejaba los pagos nuevos en memoria.
  const p = await conElPagoAbierto({
    pagar: async () => {
      p.cerrarLaSesion();
      return { tipo: 'guardado', pago: { id: 'pc-9', numero: 9, monto: 140 }, pagos: [{ id: 'colado' }] };
    },
  });
  p.clic('#dn-guardar-pago');
  await new Promise((ok) => { setTimeout(ok, 0); });
  const pagos = p.lector.actual?.pagos?.datos ?? [];
  assert.ok(!pagos.some((x) => x.id === 'colado'), 'lo que llegó con la sesión cerrada no entra en memoria');
  assert.equal(p.lector.actual, null, 'y lo que había se suelta');
  assert.ok(p.dichos.every((d) => !/Pago registrado/.test(d.texto)), 'no se canta un pago sobre una pantalla cerrada');
});

test('enlazar: si la SESIÓN se cerró mientras enlazaba, no se escribe en memoria', async () => {
  const { p } = await conUnaCuentaAMano({
    enlazarAlEmpleado: async () => { p.cerrarLaSesion(); },
  });
  p.buscar('#cm-enlazar-empleado').value = 'e1';
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'enlazar');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  const v1 = p.lector.actual?.contratos?.datos?.find((c) => c.id === 'v1');
  assert.ok(!v1 || v1.empleadoId === undefined, 'la renta no queda enlazada en memoria');
  assert.equal(p.lector.actual, null, 'lo leído se suelta');
  assert.ok(p.dichos.every((d) => !/Rentas enlazadas/.test(d.texto)), 'y no se canta el enlace');
});

test('comisiones: si la SESIÓN se cerró mientras anulaba, no se escribe en memoria', async () => {
  // Igual que al registrar y al enlazar: es dinero y se suelta con la sesión. (26 de noviembre de 2026.)
  const anuladas = [];
  const { p } = await conUnPagoHecho({
    anular: async (args) => {
      anuladas.push(args);
      p.cerrarLaSesion();
      return { tipo: 'anulado', pago: { numero: 5 }, pagos: [{ id: 'colado' }] };
    },
  });
  const leida = p.lector.actual;
  const boton = p.raiz.querySelectorAll('[data-cm]').find((n) => n.dataset.cm === 'anular-pago');
  p.lanzar('click', boton);
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(anuladas.length, 1, 'la anulación SÍ viajó a la nube');
  assert.ok(!leida.pagos.datos.some((x) => x.id === 'colado'), 'lo que volvió con la sesión cerrada no entra');
  assert.ok(p.dichos.every((d) => !/Pago anulado/.test(d.texto)), 'y no se canta la anulación');
});

// ---------------------------------------------------------------------------------------------------
// El oyente de «click»: el reparto de cada botón a su acción
// ---------------------------------------------------------------------------------------------------
// Por qué. La medición del 26 de noviembre de 2026 dio que de los 34 errores que se le pueden meter a este
// oyente, 14 no los notaba nadie: «Actualizar» podía dejar de leer, «Cancelar» podía dejar de cerrar el
// formulario, y un clic en la fila de un empleado podía abrir otra cuenta o ninguna. Es el cableado entre
// lo que él aprieta y lo que pasa: un botón conectado a la acción de al lado no lo atrapa ninguna prueba
// de las funciones por separado.

test('comisiones: «Actualizar» vuelve a LEER de la nube, no redibuja la copia que ya tenía', async () => {
  // `cargarYDibujar({ forzar: true })`: sin el `forzar`, el lector devuelve lo que ya tenía guardado y el
  // botón no haría nada visible. Es el botón que él aprieta justamente cuando sospecha que la pantalla
  // está vieja.
  const p = await pantallaDeComisiones();
  assert.equal(p.lecturas.length, 1, 'se leyó una vez al entrar');
  p.clic('[data-cm="actualizar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.lecturas.length, 2, 'apretarlo lee otra vez, saltándose la copia guardada');
});

test('comisiones: tras un fallo de lectura, «Volver a leer» vuelve a leer', async () => {
  const rota = { contratos: { datos: null, fallo: true }, pagos: { datos: null, fallo: true }, empleados: { datos: null, fallo: true } };
  const p = await pantallaDeComisiones({ lectura: rota });
  assert.ok(p.hay('[data-cm="reintentar"]'), 'con la lectura caída sale el botón de volver a leer');
  assert.equal(p.lecturas.length, 1);
  p.clic('[data-cm="reintentar"]');
  await new Promise((ok) => { setTimeout(ok, 0); });
  assert.equal(p.lecturas.length, 2, 'y apretarlo lee otra vez');
});

test('comisiones: «Cancelar» cierra el formulario de pago y deja la pantalla como estaba', async () => {
  const p = await pantallaDeComisiones({ lectura: lecturaOk({ contratos: [firme('a1')] }), clave: 'id:e1' });
  const casilla = p.raiz.querySelectorAll('[data-cm="marcar"]')[0];
  assert.ok(casilla, 'la cuenta trae una renta por pagar');
  p.marcar(casilla);
  p.clic('[data-cm="registrar"]');
  assert.ok(p.hay('#dn-guardar-pago'), 'el formulario se abrió');
  p.clic('[data-cm="cancelar-pago"]');
  assert.ok(!p.hay('#dn-guardar-pago'), 'y «Cancelar» lo cierra');
  assert.ok(p.hay('[data-cm="registrar"]'), 'vuelve a ofrecer registrar un pago');
});

test('comisiones: un clic en la fila de un empleado abre LA DE ÉL, no otra', async () => {
  const p = await pantallaDeComisiones();
  const filas = p.raiz.querySelectorAll('tr[data-cm-clave]');
  assert.ok(filas.length >= 2, 'hacen falta dos filas para que la prueba distinga una de otra');
  const suya = filas[1];
  p.lanzar('click', suya);
  assert.match(p.ruta(), new RegExp(encodeURIComponent(suya.dataset.cmClave) + '$'), 'se abre la cuenta de la fila que apretó');
});

test('comisiones: un clic en el NOMBRE de la fila lo deja seguir el enlace, no lo intercepta', async () => {
  // La fila lleva un `<a href>` con el nombre. Si el oyente se lo come, el clic derecho «abrir en otra
  // pestaña» y el clic con la rueda dejan de funcionar, que es cómo se mira a dos empleados a la vez.
  const p = await pantallaDeComisiones();
  const rutaAntes = p.ruta();
  const enlace = p.raiz.querySelectorAll('a').find((n) => n.closest('tr[data-cm-clave]'));
  assert.ok(enlace, 'la fila trae el nombre como enlace');
  p.lanzar('click', enlace);
  assert.equal(p.ruta(), rutaAntes, 'el oyente no cambia la dirección: la cambia el enlace');
});

test('comisiones: un clic en una parte de la pantalla que no es un botón no hace nada', async () => {
  // `if (accion)`: sin esa pregunta, un clic en cualquier parte reventaría al leer `accion.dataset.cm`.
  const p = await pantallaDeComisiones();
  const lecturasAntes = p.lecturas.length;
  const rutaAntes = p.ruta();
  const titulo = p.raiz.querySelectorAll('h2')[0] ?? p.raiz.querySelectorAll('p')[0];
  assert.ok(titulo, 'hace falta algo que no sea un botón para apretar');
  p.lanzar('click', titulo);
  assert.equal(p.lecturas.length, lecturasAntes, 'no se lee');
  assert.equal(p.ruta(), rutaAntes, 'ni se cambia de pantalla');
  assert.deepEqual(p.dichos, [], 'ni se dice nada');
});

test('ningún aparato de ninguna pantalla se llama a SÍ MISMO en su valor de siempre', () => {
  // El fallo, tal como estuvo: al meterle los aparatos a `pintarCuentas` de comisiones, dos valores de
  // siempre quedaron escritos `preguntar = (texto) => preguntar(texto)`. Eso no llama a `window.confirm`:
  // se llama a sí mismo hasta que se acaba la pila. En el navegador, «Anular» y «Enlazar» de la pantalla de
  // comisiones reventaban con «Maximum call stack size exceeded» y no hacían nada.
  //
  // Ninguna prueba lo vio porque TODAS le inyectan sus aparatos: el valor de siempre nunca corría. Esta
  // prueba no mira esos dos casos, mira la forma del error en todo el sistema, que es lo que se repite.
  const raiz = new URL('../js/', import.meta.url);
  const archivos = [];
  (function recorrer(dir) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = new URL(`${entrada.name}${entrada.isDirectory() ? '/' : ''}`, dir);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith('.js')) archivos.push(ruta);
    }
  })(raiz);
  assert.ok(archivos.length > 20, `hacen falta los archivos del sistema para que esto mida algo (hay ${archivos.length})`);

  const culpables = [];
  for (const ruta of archivos) {
    readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
      const m = /^\s*([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*([A-Za-z0-9_$]+)\s*\(/.exec(linea);
      if (m && m[1] === m[3]) culpables.push(`${ruta.pathname.split('/js/')[1]}:${i + 1}  ${linea.trim()}`);
    });
  }
  assert.deepEqual(culpables, [], `un valor de siempre que se llama a sí mismo revienta la pila al usarlo:\n${culpables.join('\n')}`);
});

// ---------------------------------------------------------------------------------------------------
// armarVistaDeComisiones: los dos huecos que dejó la medición del 26 de noviembre de 2026
// ---------------------------------------------------------------------------------------------------

test('armarVistaDeComisiones: una lectura SIN la llave de empleados no revienta la pantalla', () => {
  // Los `?.` de `empleados?.datos` y `empleados?.fallo` existen para esto, y nadie los probaba: todas las
  // pruebas armaban la lectura con las tres llaves puestas. Sin ellos, una lectura a la que le falte
  // `empleados` tira una excepción, y una excepción aquí no es «no se pudo leer» — es una PANTALLA EN
  // BLANCO, que es justo lo que el resto de esta función se esfuerza por evitar.
  const sinEmpleados = { contratos: { datos: [firme('a1')], fallo: false }, pagos: { datos: [], fallo: false } };
  const vista = armarVistaDeComisiones(sinEmpleados);
  assert.equal(vista.ok, true, 'la pantalla se puede dibujar');
  assert.ok(Array.isArray(vista.entradas), 'con sus entradas');
  // Y sin la lista de empleados no se afirma que a alguien le falte su ficha: no se sabe.
  assert.ok(vista.entradas.every((e) => e.sinRegistro === false), 'no se inventa un problema que no se puede saber');
});

test('armarVistaDeComisiones: un empleado cuyo nombre son PUROS ESPACIOS cae al nombre del contrato', () => {
  // El `.trim()` del nombre. Sin él, un registro con nombre «   » gana sobre el nombre que traen los
  // contratos, y la fila del empleado sale en blanco: no se sabe a quién se le debe.
  const renta = firme('a1');
  const lectura = lecturaOk({
    contratos: [renta],
    empleados: [{ id: 'e1', nombre: '   ', porcentajeComision: 5 }],
  });
  const conNombre = armarVistaDeComisiones(lectura);
  for (const e of conNombre.entradas) {
    assert.notEqual(e.nombre.trim(), '', `una fila sin nombre no dice a quién se le debe: ${JSON.stringify(e.nombre)}`);
  }
});

test('armarVistaDeComisiones: una ficha DAÑADA en la lista de empleados no tumba la pantalla', () => {
  // El `e?.id` que filtra la lista: un documento nulo o sin id no es «no se pudo leer», y con el punto
  // pelado tira una excepción que deja la pantalla en blanco. Se salta y se sigue.
  const vista = armarVistaDeComisiones(lecturaOk({
    contratos: [firme('a1')],
    empleados: [null, undefined, {}, { nombre: 'Sin id' }, { id: 'e1', nombre: 'Ana López', porcentajeComision: 5 }],
  }));
  assert.equal(vista.ok, true, 'la pantalla se dibuja igual');
  assert.ok(vista.entradas.some((e) => e.empleadoId === 'e1'), 'y la ficha buena sigue ahí');
});
