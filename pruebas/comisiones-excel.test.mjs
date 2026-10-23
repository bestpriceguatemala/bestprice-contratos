// Bajar la cuenta de comisiones en Excel (js/pantallas/comisiones.js, «Bajar la cuenta en Excel»).
//
// Lo que estas pruebas cuidan, en el orden en que el dueño lo sufriría:
//   1. que el archivo diga la verdad: cada renta una sola vez, la deuda en una sola columna, lo pagado como quedó guardado;
//   2. que sea sobre esa persona: ni el costo de un carro ajeno, ni lo que el cliente pagó, ni su garantía, ni otro empleado;
//   3. que una lectura caída NO se convierta en un archivo que dice «no se le debe nada»;
//   4. que nada de lo leído se quede en la memoria cuando la sesión de dinero se cierra.
// El archivo de verdad se abrió con otros programas (ver el informe); aquí se lee con el mismo lector del respaldo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  armarVistaDeComisiones, modeloDeComisionesEnExcel, armarElExcelDeComisiones, bajarLasCuentasEnExcel, textoDeLoBajado,
  nombreDelArchivoDeComisiones, ErrorDeBajada, ESTADOS_EN_EXCEL, etiquetasDeLaCuenta, frasesDelFallo,
  htmlListaDeComisiones, htmlFichaDeComisiones, htmlFalloDeComisiones,
  MENSAJE_BAJAR_SIN_SESION, MENSAJE_BAJAR_CUENTA_YA_NO_ESTA, MENSAJE_BAJAR_SIN_CUENTAS, MENSAJE_BAJAR_FALLO,
  MENSAJE_FALLO_RENTAS, MENSAJE_FALLO_PAGOS_DE_COMISION, MENSAJE_FALLO_DATOS_DE_COMISION,
  TEXTO_DE_LA_COPIA, TEXTO_DE_LA_COPIA_DE_UNA, textoDePagoQueCambio,
} from '../js/pantallas/comisiones.js';
import { suma } from '../js/nucleo/dinero.js';
import { comisionDe } from '../js/nucleo/comision.js';
import { totalGeneralDeComisiones } from '../js/nucleo/comisiones.js';
import { serialDeFecha } from '../js/respaldo/hojas.js';
import { renta, rentaDeAntes, pagoDeComision, EMPLEADOS } from './fixtures/rentasConComision.mjs';
import { abrirLibro } from './fixtures/leerLibro.mjs';

const { ana, wilder, luis } = EMPLEADOS;
const HOY = '2026-10-23';

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PANTALLA = sinComentarios(leer('../js/pantallas/comisiones.js'));
// Todo lo nuevo de este trabajo que no es HTML ni cableado: desde sus frases hasta donde empieza el HTML.
const SECCION = PANTALLA.slice(PANTALLA.indexOf('export const MENSAJE_BAJAR_SIN_SESION'), PANTALLA.indexOf('const barraRoja'));
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Un mes de Ana, con de todo
// ---------------------------------------------------------------------------
//
//   1  por1     cerrada, regresó el 5 oct (1.ª quincena)            Q140 por pagar
//   2  por2     cerrada, regresó el 18 oct (2.ª quincena)           Q140 por pagar
//   3  pag1     cerrada, regresó el 14 sep, YA PAGADA (p1)          Q140 pagada
//   4  afuera   el carro sigue afuera                               Q140 estimada
//   5  debe     el carro volvió y el cliente debe daños             Q140 falta cerrar
//   6  garantia el carro volvió y la garantía sigue retenida        Q140 falta cerrar
//   7  sinPct   cerrada pero el contrato no trae porcentaje legible —
//   8  anul     cerrada; su pago (p3) se ANULÓ, así que vuelve a por pagar        Q140
//   9  cam      cerrada y pagada con Q100 (p4), pero hoy suma Q140 (se corrigió un cierre)
const rentasDeAna = () => [
  renta({ id: 'por1', numero: 1, fechaSalida: '2026-10-01', recibidoEl: '2026-10-05' }),
  renta({ id: 'por2', numero: 2, fechaSalida: '2026-10-14', recibidoEl: '2026-10-18' }),
  renta({ id: 'pag1', numero: 3, fechaSalida: '2026-09-10', recibidoEl: '2026-09-14' }),
  renta({ id: 'afuera', numero: 4, fechaSalida: '2026-10-19' }),
  renta({ id: 'debe', numero: 5, fechaSalida: '2026-10-06', recibidoEl: '2026-10-10', danos: 200, cerrada: false }),
  renta({ id: 'garantia', numero: 6, fechaSalida: '2026-10-07', recibidoEl: '2026-10-11', garantiaSinLiberar: true }),
  (() => { const r = renta({ id: 'sinPct', numero: 7, fechaSalida: '2026-10-02', recibidoEl: '2026-10-06' }); delete r.porcentajeComision; return r; })(),
  renta({ id: 'anul', numero: 8, fechaSalida: '2026-09-16', recibidoEl: '2026-09-20' }),
  renta({ id: 'cam', numero: 9, fechaSalida: '2026-09-01', recibidoEl: '2026-09-05' }),
];
const pagosDeAna = () => [
  pagoDeComision({ id: 'p1', monto: 140, fecha: '2026-09-30', forma: 'efectivo', contratos: ['pag1'] }),
  pagoDeComision({ id: 'p3', monto: 140, fecha: '2026-09-29', forma: 'transferencia', contratos: ['anul'], anulado: true, anuladoEn: '2026-10-02' }),
  pagoDeComision({ id: 'p4', monto: 100, fecha: '2026-10-01', forma: 'cheque', contratos: ['cam'] }),
];
const rentasDeLuis = () => [
  renta({ id: 'l1', numero: 20, empleado: luis, fechaSalida: '2026-10-02', recibidoEl: '2026-10-06', precioDia: 900 }),
  renta({ id: 'l2', numero: 21, empleado: luis, fechaSalida: '2026-09-02', recibidoEl: '2026-09-06', precioDia: 900 }),
];
// 4 días a Q900 son Q3,600 de base; al 7.5 % de Luis son Q270.00 (un número que no aparece en ninguna cuenta de Ana).
const pagosDeLuis = () => [pagoDeComision({ id: 'pl', empleadoId: 'e16', monto: 270, fecha: '2026-09-30', contratos: ['l2'] })];

const lecturaOk = ({ contratos = [], pagos = [], empleados = [ana, wilder, luis] } = {}) => ({
  contratos: { datos: contratos, fallo: false },
  pagos: { datos: pagos, fallo: false },
  empleados: { datos: empleados, fallo: false },
});
const escenario = () => lecturaOk({
  contratos: [...rentasDeAna(), ...rentasDeLuis(), renta({ id: 'w1', numero: 30, empleado: wilder, recibidoEl: '2026-10-05' })],
  pagos: [...pagosDeAna(), ...pagosDeLuis()],
});
const entradaDe = (vista, nombre) => vista.entradas.find((e) => e.nombre === nombre);
const hojaDe = (modelo, nombre) => modelo.hojas.find((h) => h.nombre === nombre);
/** Una columna de una hoja por el título que lleva. */
const columna = (hoja, titulo) => {
  const i = hoja.columnas.findIndex((c) => c.titulo === titulo);
  assert.notEqual(i, -1, `la hoja ${hoja.nombre} no tiene la columna «${titulo}»`);
  return hoja.filas.map((f) => f[i]);
};
const filaDeContrato = (hoja, numero) => hoja.filas.find((f) => f[1] === numero);
const modeloDe = (lectura = escenario(), { clave = null } = {}) => {
  const vista = armarVistaDeComisiones(lectura);
  return modeloDeComisionesEnExcel({
    vista, clave, pagos: lectura.pagos.datos, hoy: HOY,
  });
};
const sumaDe = (valores) => suma(...valores.filter((v) => typeof v === 'number'));

// ---------------------------------------------------------------------------
// 1. Que el archivo diga la verdad
// ---------------------------------------------------------------------------

test('el escenario es el que dice la cabecera: cada renta en la situación que se espera', () => {
  const ficha = entradaDe(armarVistaDeComisiones(escenario()), 'Ana López').cuenta;
  assert.deepEqual(ficha.porPagar.map((c) => c.id).sort(), ['anul', 'por1', 'por2']);
  assert.deepEqual(ficha.noFirmes.map((c) => c.id).sort(), ['afuera', 'debe', 'garantia']);
  assert.deepEqual(ficha.pagados.map((c) => c.id).sort(), ['cam', 'pag1']);
  assert.deepEqual(ficha.sinPorcentaje.map((c) => c.id), ['sinPct']);
  assert.deepEqual([ficha.totalPorPagar, ficha.totalEstimado, ficha.totalPorCerrar], [420, 140, 280]);
  assert.equal(ficha.pagosQueCambiaron.length, 1);
});

test('la hoja «Rentas» lleva cada renta de la cuenta UNA sola vez, ni una más ni una menos', () => {
  const vista = armarVistaDeComisiones(escenario());
  const modelo = modeloDe(escenario(), { clave: 'id:e1' });
  const rentas = hojaDe(modelo, 'Rentas');
  const ana1 = entradaDe(vista, 'Ana López');
  assert.equal(rentas.filas.length, ana1.contratos.length, 'tantas filas como rentas tiene la cuenta');
  assert.deepEqual(columna(rentas, 'Contrato').sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(modelo.cuenta.rentas, 9);
});

test('la deuda vive en UNA columna: lo que suma «Por pagar» es lo que dice el núcleo, y lo que no es deuda no cae en ella', () => {
  const rentas = hojaDe(modeloDe(escenario(), { clave: 'id:e1' }), 'Rentas');
  const cuenta = entradaDe(armarVistaDeComisiones(escenario()), 'Ana López').cuenta;
  assert.equal(sumaDe(columna(rentas, 'Por pagar')), cuenta.totalPorPagar);
  assert.equal(sumaDe(columna(rentas, 'Estimada (el carro sigue afuera)')), cuenta.totalEstimado);
  assert.equal(sumaDe(columna(rentas, 'Ya regresó, falta que cierre')), cuenta.totalPorCerrar);
  // Cada renta lleva su comisión en UNA de las cuatro columnas de dinero (o en ninguna), nunca en dos.
  const cuatro = ['Por pagar', 'Estimada (el carro sigue afuera)', 'Ya regresó, falta que cierre', 'Ya pagada (lo que suma hoy)'].map((t) => columna(rentas, t));
  rentas.filas.forEach((f, i) => {
    assert.ok(cuatro.filter((c) => typeof c[i] === 'number').length <= 1, `contrato ${f[1]}`);
  });
  const en = (numero) => cuatro.map((c) => c[rentas.filas.findIndex((f) => f[1] === numero)]);
  assert.deepEqual(en(1), [140, null, null, null], 'por pagar');
  assert.deepEqual(en(4), [null, 140, null, null], 'el carro sigue afuera: estimada, no deuda');
  assert.deepEqual(en(5), [null, null, 140, null], 'regresó y falta cerrar');
  assert.deepEqual(en(3), [null, null, null, 140], 'ya pagada');
  assert.deepEqual(en(8), [140, null, null, null], 'su pago se anuló: vuelve a deuda');
  assert.deepEqual(en(7), [null, null, null, null], 'sin porcentaje legible: nadie sabe cuánto es');
});

test('cada renta dice su estado con las palabras de ESTADOS_EN_EXCEL, y la pagada dice cuándo se le pagó', () => {
  const rentas = hojaDe(modeloDe(escenario(), { clave: 'id:e1' }), 'Rentas');
  const posEstado = rentas.columnas.findIndex((c) => c.titulo === 'Estado');
  const estado = (n) => filaDeContrato(rentas, n)[posEstado];
  assert.equal(estado(1), ESTADOS_EN_EXCEL['por-pagar']);
  assert.equal(estado(4), ESTADOS_EN_EXCEL.estimada);
  assert.equal(estado(5), ESTADOS_EN_EXCEL['sin-cerrar']);
  assert.equal(estado(6), ESTADOS_EN_EXCEL['sin-cerrar']);
  assert.equal(estado(3), ESTADOS_EN_EXCEL.pagada);
  assert.equal(estado(7), ESTADOS_EN_EXCEL['sin-porcentaje']);
  assert.equal(estado(8), ESTADOS_EN_EXCEL['por-pagar']);
  const pagadaEl = columna(rentas, 'Pagada el');
  const i = (n) => rentas.filas.findIndex((f) => f[1] === n);
  assert.equal(pagadaEl[i(3)], serialDeFecha('2026-09-30'), 'pagada el día del pago vigente que la cubre');
  assert.equal(pagadaEl[i(8)], null, 'la del pago anulado no está pagada');
  assert.equal(pagadaEl[i(1)], null);
  assert.equal(new Set(Object.values(ESTADOS_EN_EXCEL)).size, Object.keys(ESTADOS_EN_EXCEL).length, 'cada situación, sus propias palabras');
});

test('el mes y la quincena son los del núcleo (por la fecha en que REGRESÓ el carro); si el carro no ha vuelto quedan vacíos', () => {
  const rentas = hojaDe(modeloDe(escenario(), { clave: 'id:e1' }), 'Rentas');
  const mes = columna(rentas, 'Mes');
  const quincena = columna(rentas, 'Quincena');
  const i = (n) => rentas.filas.findIndex((f) => f[1] === n);
  assert.deepEqual([mes[i(1)], quincena[i(1)]], ['2026-10', 1]);
  assert.deepEqual([mes[i(2)], quincena[i(2)]], ['2026-10', 2]);
  assert.deepEqual([mes[i(3)], quincena[i(3)]], ['2026-09', 1]);
  assert.deepEqual([mes[i(4)], quincena[i(4)]], [null, null], 'sin fecha de regreso no hay período');
});

test('de dónde sale cada número: días, atraso, base, porcentaje y comisión son los de comisionDe y los del contrato', () => {
  const lectura = escenario();
  const rentas = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Rentas');
  const c1 = lectura.contratos.datos.find((c) => c.id === 'por1');
  const fila = filaDeContrato(rentas, 1);
  const pos = (t) => rentas.columnas.findIndex((c) => c.titulo === t);
  assert.equal(fila[pos('Días')], 4);
  assert.equal(fila[pos('Días de atraso')], 0);
  assert.equal(fila[pos('Base')], comisionDe(c1).base);
  assert.equal(fila[pos('Base')], 2800);
  assert.equal(fila[pos('% de comisión')], 5);
  assert.equal(fila[pos('Por pagar')], comisionDe(c1).monto);
  assert.equal(fila[pos('Placas')], 'P-1AAA');
  assert.equal(fila[pos('Cliente')], 'Juan Pérez');
  assert.equal(fila[pos('Salió')], serialDeFecha('2026-10-01'));
  assert.equal(fila[pos('Regresó')], serialDeFecha('2026-10-05'));
  // Sin porcentaje legible: la base es un hecho, el porcentaje y la comisión no se inventan (ni un 0 ni un 5).
  const sin = filaDeContrato(rentas, 7);
  assert.equal(sin[pos('Base')], 2800);
  assert.equal(sin[pos('% de comisión')], null);
});

test('un atraso se ve en su columna y la base lo incluye, igual que en la pantalla', () => {
  const lectura = lecturaOk({ contratos: [renta({ id: 'at', numero: 1, fechaSalida: '2026-10-01', dias: 4, recibidoEl: '2026-10-07' })] });
  const rentas = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Rentas');
  const fila = rentas.filas[0];
  const pos = (t) => rentas.columnas.findIndex((c) => c.titulo === t);
  assert.equal(fila[pos('Días')], 4);
  assert.equal(fila[pos('Días de atraso')], 2);
  assert.equal(fila[pos('Base')], 4200, '6 días a Q700');
  assert.equal(fila[pos('Por pagar')], 210);
});

test('LO PAGADO ES LO QUE SE GUARDÓ: la hoja «Pagos» dice el monto del pago, y aparte lo que las rentas suman hoy si cambió', () => {
  const lectura = escenario();
  const pagos = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Pagos');
  const pos = (t) => pagos.columnas.findIndex((c) => c.titulo === t);
  const p4 = pagos.filas.find((f) => f[pos('Forma')] === 'Cheque');
  assert.equal(p4[pos('Monto pagado (el que quedó guardado)')], 100, 'el monto del pago, no lo que suma hoy');
  assert.equal(p4[pos('Hoy esas rentas suman')], 140);
  const cuenta = entradaDe(armarVistaDeComisiones(lectura), 'Ana López').cuenta;
  assert.equal(p4[pos('Aviso')], textoDePagoQueCambio(cuenta.pagosQueCambiaron[0]), 'con las mismas palabras de la pantalla');
  const p1 = pagos.filas.find((f) => f[pos('Forma')] === 'Efectivo');
  assert.equal(p1[pos('Monto pagado (el que quedó guardado)')], 140);
  assert.equal(p1[pos('Hoy esas rentas suman')], null, 'si no cambió, no se dice nada');
  assert.equal(p1[pos('Aviso')], null);
});

test('el aviso de «hoy esas rentas suman» sigue saliendo aunque los pagos lleguen copiados (se reconoce por el id, no solo por el objeto)', () => {
  const lectura = escenario();
  const vista = armarVistaDeComisiones(lectura);
  const modelo = modeloDeComisionesEnExcel({
    vista, clave: 'id:e1', pagos: structuredClone(lectura.pagos.datos), hoy: HOY,
  });
  const pagos = hojaDe(modelo, 'Pagos');
  const pos = (t) => pagos.columnas.findIndex((c) => c.titulo === t);
  assert.equal(pagos.filas.find((f) => f[pos('Forma')] === 'Cheque')[pos('Hoy esas rentas suman')], 140);
});

test('un pago ANULADO sale en «Pagos» con su monto, marcado y con la fecha en que se anuló, y no cuenta como pagado', () => {
  const modelo = modeloDe(escenario(), { clave: 'id:e1' });
  const pagos = hojaDe(modelo, 'Pagos');
  const pos = (t) => pagos.columnas.findIndex((c) => c.titulo === t);
  const anulado = pagos.filas.find((f) => f[pos('Forma')] === 'Transferencia');
  assert.equal(anulado[pos('Estado')], 'Anulado');
  assert.equal(anulado[pos('Anulado el')], serialDeFecha('2026-10-02'));
  assert.equal(anulado[pos('Monto pagado (el que quedó guardado)')], 140, 'conserva su monto');
  assert.equal(anulado[pos('Hoy esas rentas suman')], null);
  assert.deepEqual(columna(pagos, 'Estado').sort(), ['Anulado', 'Vigente', 'Vigente']);
  // Y el resumen no lo suma como pagado.
  const resumen = hojaDe(modelo, 'Resumen');
  const fila = resumen.filas[0];
  const rp = (t) => resumen.columnas.findIndex((c) => c.titulo === t);
  assert.equal(fila[rp('Pagado (pagos sin anular)')], 240, '140 + 100; el anulado no');
  assert.equal(fila[rp('Pagos')], 2);
  assert.equal(fila[rp('Pagos anulados')], 1);
});

test('un pago que cubre una renta que ya no está en la cuenta lo dice, en vez de callarlo o inventarla', () => {
  const lectura = escenario();
  lectura.pagos.datos.push(pagoDeComision({ id: 'p9', monto: 140, fecha: '2026-10-03', forma: 'efectivo', contratos: ['pag1', 'fantasma'] }));
  const pagos = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Pagos');
  const fila = pagos.filas.find((f) => f[pagos.columnas.findIndex((c) => c.titulo === 'Rentas que cubre')] === 2);
  assert.ok(fila);
  assert.equal(fila[pagos.columnas.findIndex((c) => c.titulo === 'Contratos')], '3, 1 renta que ya no está en esta cuenta');
});

test('una renta repetida o vacía en la lista de un pago cuenta una sola vez; y la fecha de anulación solo sale en un pago anulado', () => {
  const lectura = lecturaOk({
    contratos: [renta({ id: 'a', numero: 5, recibidoEl: '2026-10-05' })],
    pagos: [{ ...pagoDeComision({ id: 'p', monto: 140, contratos: ['a', 'a', null, ''] }), anuladoEn: '2026-10-09' }],
  });
  const pagos = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Pagos');
  const pos = (t) => pagos.columnas.findIndex((c) => c.titulo === t);
  assert.equal(pagos.filas[0][pos('Rentas que cubre')], 1);
  assert.equal(pagos.filas[0][pos('Contratos')], '5');
  assert.equal(pagos.filas[0][pos('Estado')], 'Vigente');
  assert.equal(pagos.filas[0][pos('Anulado el')], null, 'un pago que no está anulado no trae fecha de anulación');
});

test('los contratos de un pago salen por número, de menor a mayor', () => {
  const lectura = lecturaOk({
    contratos: [renta({ id: 'a', numero: 12, recibidoEl: '2026-10-05' }), renta({ id: 'b', numero: 3, recibidoEl: '2026-10-06' }), renta({ id: 'c', numero: 7, recibidoEl: '2026-10-07' })],
    pagos: [pagoDeComision({ id: 'p', monto: 420, contratos: ['a', 'b', 'c'] })],
  });
  const pagos = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Pagos');
  assert.equal(pagos.filas[0][pagos.columnas.findIndex((c) => c.titulo === 'Contratos')], '3, 7, 12');
});

test('el resumen: lo que se le debe, lo estimado y lo que falta cerrar son las cifras del núcleo, y trae su código y su porcentaje de hoy', () => {
  const resumen = hojaDe(modeloDe(escenario(), { clave: 'id:e1' }), 'Resumen');
  const rp = (t) => resumen.columnas.findIndex((c) => c.titulo === t);
  const fila = resumen.filas[0];
  assert.equal(fila[rp('Empleado')], 'Ana López');
  assert.equal(fila[rp('Código')], '1');
  assert.equal(fila[rp('% de hoy')], 5);
  assert.equal(fila[rp('Rentas por pagar')], 3);
  assert.equal(fila[rp('Se le debe')], 420);
  assert.equal(fila[rp('Estimado (carros afuera)')], 140);
  assert.equal(fila[rp('Ya regresaron, falta que cierre')], 280);
  assert.equal(resumen.filas.length, 1, 'una cuenta no trae renglón de «Todos»');
});

test('el resumen de todas las cuentas suma lo que se debe con la misma cuenta de la lista (totalGeneralDeComisiones)', () => {
  const lectura = escenario();
  const vista = armarVistaDeComisiones(lectura);
  const modelo = modeloDe(lectura);
  const resumen = hojaDe(modelo, 'Resumen');
  assert.equal(resumen.filas.length, vista.entradas.length + 1);
  const ultima = resumen.filas.at(-1);
  assert.equal(ultima[0], 'Todos');
  const debe = resumen.columnas.findIndex((c) => c.titulo === 'Se le debe');
  assert.equal(ultima[debe], totalGeneralDeComisiones(vista.entradas.map((e) => e.cuenta)));
  assert.equal(ultima[debe], vista.total);
  assert.equal(modelo.cuenta.debe, vista.total);
  assert.equal(modelo.cuenta.empleados, vista.entradas.length);
  assert.equal(ultima.filter((v, i) => i !== 0 && i !== debe && v !== null && v !== '').length, 0, 'el renglón de todos solo dice lo que se debe');
});

test('un empleado con 0 % (Wilder) sale con su cuenta y sus rentas «cerradas y sin comisión», sin deuda', () => {
  const modelo = modeloDe(escenario(), { clave: 'id:e6' });
  const rentas = hojaDe(modelo, 'Rentas');
  assert.equal(rentas.filas.length, 1);
  const pos = (t) => rentas.columnas.findIndex((c) => c.titulo === t);
  assert.equal(rentas.filas[0][pos('Estado')], ESTADOS_EN_EXCEL['sin-comision']);
  assert.equal(rentas.filas[0][pos('% de comisión')], 0, 'el cero es un porcentaje');
  assert.equal(rentas.filas[0][pos('Por pagar')], null);
  assert.match(hojaDe(modelo, 'Resumen').filas[0].at(-1), /No gana comisión/);
});

test('las aclaraciones junto al nombre salen de las mismas etiquetas que la pantalla', () => {
  const vista = armarVistaDeComisiones(lecturaOk({
    contratos: [rentaDeAntes({ id: 'v1', rentadoPor: 'Pedro', recibidoEl: '2026-09-29' })], empleados: [{ ...luis, activo: false }],
  }));
  assert.deepEqual(etiquetasDeLaCuenta(entradaDe(vista, 'Pedro')).map((e) => e.texto), ['Sin enlazar']);
  assert.deepEqual(etiquetasDeLaCuenta(entradaDe(vista, 'Luis Mérida')).map((e) => e.texto), ['De baja']);
  const modelo = modeloDeComisionesEnExcel({
    vista, pagos: [], hoy: HOY,
  });
  const resumen = hojaDe(modelo, 'Resumen');
  assert.deepEqual(resumen.filas.map((f) => [f[0], f.at(-1)]).filter(([, a]) => a), [['Pedro', 'Sin enlazar'], ['Luis Mérida', 'De baja']]);
});

test('una cuenta sin rentas ni pagos baja con su renglón en cero: leída bien, «Q0.00» es verdad', () => {
  const modelo = modeloDe(lecturaOk({ contratos: [], pagos: [] }), { clave: 'id:e1' });
  assert.equal(hojaDe(modelo, 'Rentas').filas.length, 0);
  assert.equal(hojaDe(modelo, 'Pagos').filas.length, 0);
  const resumen = hojaDe(modelo, 'Resumen');
  assert.equal(resumen.filas[0][resumen.columnas.findIndex((c) => c.titulo === 'Se le debe')], 0);
});

// ---------------------------------------------------------------------------
// 2. Que sea sobre esa persona
// ---------------------------------------------------------------------------

test('el archivo de UN empleado no lleva nada de otro: ni sus rentas, ni sus pagos, ni su nombre', () => {
  const modelo = modeloDe(escenario(), { clave: 'id:e1' });
  const todo = JSON.stringify(modelo.hojas);
  for (const ajeno of ['Luis Mérida', 'Wilder', 'P-20AAA', 'P-21AAA', 'P-30AAA']) assert.ok(!todo.includes(ajeno), `«${ajeno}» no debe estar`);
  assert.ok(!modelo.hojas.flatMap((h) => h.filas).some((f) => f.includes(270)), 'ni el pago de Q270 de Luis');
  assert.ok(!columna(hojaDe(modelo, 'Rentas'), 'Contrato').some((n) => n >= 20), 'ninguna renta de Luis ni de Wilder');
  assert.equal(columna(hojaDe(modelo, 'Pagos'), 'Empleado').every((n) => n === 'Ana López'), true);
  assert.equal(modelo.nombre, 'Comisiones de Ana López 2026-10-23.xlsx');
});

test('un pago de otro empleado no se cuela en la hoja «Pagos» de Ana aunque llegue en la misma lista', () => {
  const lectura = escenario();
  const pagos = hojaDe(modeloDe(lectura, { clave: 'id:e1' }), 'Pagos');
  assert.equal(pagos.filas.length, 3);
  const deLuis = hojaDe(modeloDe(lectura, { clave: 'id:e16' }), 'Pagos');
  assert.equal(deLuis.filas.length, 1);
  assert.equal(deLuis.filas[0][3], 270);
});

test('NO LLEVA lo del cliente ni lo del carro ajeno: ni sus pagos, ni su saldo, ni su garantía, ni la tarjeta, ni el costo ni el dueño del carro', () => {
  const lectura = lecturaOk({
    contratos: [
      renta({ id: 'aj', numero: 1, ajeno: true, recibidoEl: '2026-10-05' }),
      renta({ id: 'ga', numero: 2, garantiaSinLiberar: true, recibidoEl: '2026-10-06' }),
      renta({ id: 'de', numero: 3, danos: 200, cerrada: false, recibidoEl: '2026-10-07' }),
    ],
  });
  const modelo = modeloDe(lectura, { clave: 'id:e1' });
  const todo = JSON.stringify(modelo.hojas);
  for (const prohibido of ['Don Mario', 'Ford', 'Rojo', '3343', 'BAC', 'Pickup', 'costoDia', 'Saldo pendiente', 'Garantía sin liberar']) {
    assert.ok(!todo.includes(prohibido), `«${prohibido}» no debe estar`);
  }
  // Ninguna cifra del cliente: lo cobrado (2800), el costo del dueño (400 por día), la garantía (5000) ni los daños (200).
  const cifras = modelo.hojas.flatMap((h) => h.filas.flat()).filter((v) => typeof v === 'number');
  for (const prohibida of [400, 1600, 5000, 200]) assert.ok(!cifras.includes(prohibida), `la cifra ${prohibida} no debe estar`);
  // La razón de no cerrar dice QUE no ha cerrado, no cuánto debe el cliente.
  const estados = columna(hojaDe(modelo, 'Rentas'), 'Estado');
  assert.ok(estados.includes(ESTADOS_EN_EXCEL['sin-cerrar']));
  assert.ok(!estados.some((e) => /Q\d/.test(e)));
  // Las placas del carro ajeno SÍ salen: identifican la renta, y están en la pantalla.
  assert.ok(columna(hojaDe(modelo, 'Rentas'), 'Placas').includes('P-1AJN'));
});

test('las columnas de las tres hojas son exactamente estas: agregar una (y con ella un dato que no debía salir) tiene que fallar aquí', () => {
  const modelo = modeloDe(escenario());
  assert.deepEqual(hojaDe(modelo, 'Rentas').columnas.map((c) => c.titulo), [
    'Empleado', 'Contrato', 'Salió', 'Regresó', 'Mes', 'Quincena', 'Placas', 'Cliente', 'Días', 'Días de atraso', 'Base', '% de comisión',
    'Por pagar', 'Estimada (el carro sigue afuera)', 'Ya regresó, falta que cierre', 'Ya pagada (lo que suma hoy)', 'Estado', 'Pagada el',
  ]);
  assert.deepEqual(hojaDe(modelo, 'Pagos').columnas.map((c) => c.titulo), [
    'Empleado', 'Fecha del pago', 'Forma', 'Monto pagado (el que quedó guardado)', 'Estado', 'Anulado el', 'Rentas que cubre', 'Contratos', 'Hoy esas rentas suman', 'Aviso',
  ]);
  assert.deepEqual(hojaDe(modelo, 'Resumen').columnas.map((c) => c.titulo), [
    'Empleado', 'Código', '% de hoy', 'Rentas por pagar', 'Se le debe', 'Estimado (carros afuera)', 'Ya regresaron, falta que cierre', 'Pagado (pagos sin anular)', 'Pagos', 'Pagos anulados', 'Aclaración',
  ]);
  assert.deepEqual(modelo.hojas.map((h) => h.nombre), ['Resumen', 'Rentas', 'Pagos']);
  // Y cada fila trae un valor por columna (el libro se niega a escribirla si no).
  for (const hoja of modelo.hojas) for (const fila of hoja.filas) assert.equal(fila.length, hoja.columnas.length, hoja.nombre);
});

test('una fila solo lleva texto, números o vacío: nunca un objeto del contrato (que arrastraría campos por descuido)', () => {
  const modelo = modeloDe(escenario());
  for (const hoja of modelo.hojas) {
    for (const valor of hoja.filas.flat()) {
      assert.ok(valor === null || typeof valor === 'string' || typeof valor === 'number', `${hoja.nombre}: ${JSON.stringify(valor)}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Una lectura caída no es «no se le debe nada»
// ---------------------------------------------------------------------------

test('sin una vista buena, sin pagos o sin la fecha de hoy el modelo LANZA: nunca arma un archivo con ceros', () => {
  const lectura = escenario();
  const vista = armarVistaDeComisiones(lectura);
  const pagos = lectura.pagos.datos;
  const caidas = [
    armarVistaDeComisiones({ ...lectura, contratos: { datos: null, fallo: true } }),
    armarVistaDeComisiones({ ...lectura, pagos: { datos: null, fallo: true } }),
    armarVistaDeComisiones(null), undefined, null, {}, { ok: true }, { ok: true, entradas: 'x' },
  ];
  for (const mala of caidas) {
    assert.throws(() => modeloDeComisionesEnExcel({ vista: mala, pagos, hoy: HOY }), /vista buena/, JSON.stringify(mala)?.slice(0, 40));
  }
  for (const mala of [undefined, null, 'x', {}, 0]) {
    assert.throws(() => modeloDeComisionesEnExcel({ vista, pagos: mala, hoy: HOY }), /«pagos» debe ser una lista/, String(mala));
  }
  for (const mala of [undefined, '', '23/10/2026', '2026-02-30', 20261023]) {
    assert.throws(() => modeloDeComisionesEnExcel({ vista, pagos, hoy: mala }), /Falta la fecha de hoy/, String(mala));
  }
  assert.throws(() => modeloDeComisionesEnExcel(), /vista buena/);
});

test('una cuenta que ya no está, o ninguna cuenta, se dice con palabras y no baja un archivo vacío', () => {
  const lectura = escenario();
  const vista = armarVistaDeComisiones(lectura);
  assert.throws(() => modeloDeComisionesEnExcel({ vista, clave: 'id:nadie', pagos: lectura.pagos.datos, hoy: HOY }),
    (e) => e instanceof ErrorDeBajada && e.message === MENSAJE_BAJAR_CUENTA_YA_NO_ESTA);
  const sinNada = armarVistaDeComisiones(lecturaOk({ empleados: [] }));
  assert.equal(sinNada.entradas.length, 0);
  assert.throws(() => modeloDeComisionesEnExcel({ vista: sinNada, pagos: [], hoy: HOY }),
    (e) => e instanceof ErrorDeBajada && e.message === MENSAJE_BAJAR_SIN_CUENTAS);
});

const lecturaFallida = (cual) => ({ ...escenario(), [cual]: { datos: null, fallo: true } });

function conEspias({ lectura = escenario(), sesion = [true, true, true, true], leer, armar, entregar } = {}) {
  const orden = [];
  let n = 0;
  return {
    orden,
    deps: {
      hoy: HOY,
      hayCredencial: () => { orden.push('credencial'); const v = sesion[Math.min(n, sesion.length - 1)]; n += 1; return v; },
      leer: leer ?? (async () => { orden.push('leer'); return lectura; }),
      armar: armar ?? (async (args) => { orden.push('armar'); return armarElExcelDeComisiones(args); }),
      entregar: entregar ?? ((bytes, nombre) => { orden.push(`entregar ${nombre} ${bytes.length > 0}`); }),
    },
  };
}
const sinCredencial = (orden) => orden.filter((o) => o !== 'credencial');

test('bajar: lee, arma y entrega, en ese orden, y el archivo sale con el nombre de la cuenta', async () => {
  const { orden, deps } = conEspias();
  const r = await bajarLasCuentasEnExcel({ ...deps, clave: 'id:e1' });
  assert.deepEqual(sinCredencial(orden), ['leer', 'armar', 'entregar Comisiones de Ana López 2026-10-23.xlsx true']);
  assert.equal(r.nombre, 'Comisiones de Ana López 2026-10-23.xlsx');
  assert.deepEqual(r.cuenta, { empleados: 1, rentas: 9, pagos: 3, debe: 420 });
  assert.deepEqual(r.avisos, []);
});

test('bajar todas: un solo archivo con todas las cuentas', async () => {
  const { orden, deps } = conEspias();
  const r = await bajarLasCuentasEnExcel(deps);
  assert.equal(r.nombre, 'Comisiones de todos 2026-10-23.xlsx');
  assert.equal(r.cuenta.empleados, 3);
  assert.equal(r.cuenta.rentas, 9 + 2 + 1);
  assert.equal(sinCredencial(orden).length, 3);
});

test('bajar LEE DE NUEVO cada vez: nunca una copia en memoria de cuando se abrió la pantalla', async () => {
  let lecturas = 0;
  const { deps } = conEspias({ leer: async () => { lecturas += 1; return escenario(); } });
  await bajarLasCuentasEnExcel(deps);
  await bajarLasCuentasEnExcel(deps);
  assert.equal(lecturas, 2);
});

test('si falla la lectura de las rentas, de los pagos o de ambos: NO se arma ni se entrega nada, y se dice cuál falló', async () => {
  const casos = [
    ['contratos', [MENSAJE_FALLO_RENTAS]],
    ['pagos', [MENSAJE_FALLO_PAGOS_DE_COMISION]],
  ];
  for (const [cual, frases] of casos) {
    const { orden, deps } = conEspias({ lectura: lecturaFallida(cual) });
    await assert.rejects(() => bajarLasCuentasEnExcel(deps), (e) => e instanceof ErrorDeBajada && e.message === `No se bajó nada. ${frases.join(' ')}`, cual);
    assert.deepEqual(sinCredencial(orden), ['leer'], `${cual}: no se armó ni se entregó`);
  }
  const ambas = { ...escenario(), contratos: { datos: null, fallo: true }, pagos: { datos: null, fallo: true } };
  const { orden, deps } = conEspias({ lectura: ambas });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), new RegExp(`${MENSAJE_FALLO_RENTAS.slice(0, 30)}[\\s\\S]*${MENSAJE_FALLO_PAGOS_DE_COMISION.slice(0, 30)}`));
  assert.deepEqual(sinCredencial(orden), ['leer']);
});

test('un pago dañado (sin su lista de rentas) tampoco baja un archivo', async () => {
  const lectura = escenario();
  lectura.pagos.datos.push({ id: 'roto', monto: 5 });
  const { orden, deps } = conEspias({ lectura });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), (e) => e instanceof ErrorDeBajada && e.message.includes(MENSAJE_FALLO_DATOS_DE_COMISION));
  assert.deepEqual(sinCredencial(orden), ['leer']);
});

test('las frases del fallo son las mismas de la pantalla (una sola fuente), y la pantalla de fallo no ofrece bajar nada', () => {
  const vista = armarVistaDeComisiones(lecturaFallida('contratos'));
  assert.deepEqual(frasesDelFallo(vista), [MENSAJE_FALLO_RENTAS]);
  const html = htmlFalloDeComisiones(vista);
  assert.match(html, new RegExp(MENSAJE_FALLO_RENTAS.slice(0, 40)));
  assert.doesNotMatch(html, /data-cm="bajar"|Excel/);
  assert.doesNotMatch(htmlListaDeComisiones(vista), /data-cm="bajar"|Excel/);
});

test('si falla solo la lista de EMPLEADOS el archivo sí baja, con el aviso escrito adentro: las cifras no dependen de ella', async () => {
  const lectura = { ...escenario(), empleados: { datos: null, fallo: true } };
  const { deps } = conEspias({ lectura });
  let bytes;
  const r = await bajarLasCuentasEnExcel({ ...deps, clave: 'id:e1', entregar: (b) => { bytes = b; } });
  assert.equal(r.cuenta.debe, 420);
  const libro = await abrirLibro(bytes);
  const avisos = [...libro.xml('Resumen').matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]).filter((t) => t.startsWith('No se pudo leer la lista de empleados'));
  assert.equal(avisos.length, 1, 'el aviso está en la hoja Resumen');
  const bien = await armarElExcelDeComisiones({ vista: armarVistaDeComisiones(escenario()), clave: 'id:e1', pagos: escenario().pagos.datos, hoy: HOY });
  const xmlBien = (await abrirLibro(bien.bytes)).xml('Resumen');
  assert.ok(!xmlBien.includes('No se pudo leer la lista de empleados'), 'y con la lista leída no está');
});

test('si la lectura lanza, el error sube y no se entrega nada', async () => {
  const { orden, deps } = conEspias({ leer: async () => { throw new Error('Missing or insufficient permissions.'); } });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), /Missing or insufficient permissions/);
  assert.deepEqual(sinCredencial(orden), []);
});

test('si armar lanza, no se entrega nada', async () => {
  const { orden, deps } = conEspias({ armar: async () => { throw new Error('boom'); } });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), /boom/);
  assert.deepEqual(sinCredencial(orden), ['leer'], 'se leyó, y nada más: no se entregó');
});

test('sin la fecha de hoy no se baja nada, y ni siquiera se lee', async () => {
  for (const hoy of [undefined, '', 'hoy', '2026-13-01']) {
    const { orden, deps } = conEspias();
    await assert.rejects(() => bajarLasCuentasEnExcel({ ...deps, hoy }), /Falta la fecha de hoy/, String(hoy));
    assert.deepEqual(orden, [], `${hoy}: no se leyó nada`);
  }
});

// ---------------------------------------------------------------------------
// 4. La sesión de dinero: lo leído se suelta, y sin ella no sale nada
// ---------------------------------------------------------------------------

test('sin sesión de dinero ni siquiera se lee', async () => {
  const { orden, deps } = conEspias({ sesion: [false] });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), (e) => e instanceof ErrorDeBajada && e.message === MENSAJE_BAJAR_SIN_SESION);
  assert.deepEqual(sinCredencial(orden), []);
});

test('si la sesión se cierra MIENTRAS se lee, lo leído se tira: no se arma ni se entrega nada', async () => {
  const { orden, deps } = conEspias({ sesion: [true, false] });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), (e) => e instanceof ErrorDeBajada && e.message === MENSAJE_BAJAR_SIN_SESION);
  assert.deepEqual(sinCredencial(orden), ['leer']);
});

test('si la sesión se cierra MIENTRAS se arma, el archivo no sale', async () => {
  const { orden, deps } = conEspias({ sesion: [true, true, false] });
  await assert.rejects(() => bajarLasCuentasEnExcel(deps), (e) => e instanceof ErrorDeBajada && e.message === MENSAJE_BAJAR_SIN_SESION);
  assert.deepEqual(sinCredencial(orden), ['leer', 'armar'], 'se armó pero no se entregó');
});

test('la credencial por omisión es la sesión de dinero real, y leer por omisión es la lectura de la pantalla', () => {
  const firma = SECCION.slice(SECCION.indexOf('export async function bajarLasCuentasEnExcel'));
  assert.match(firma, /leer = leerTodo, armar = armarElExcelDeComisiones, entregar = descargarArchivo, hayCredencial = \(\) => Boolean\(sesionDeDinero\(\)\)/);
});

test('lo leído NO se guarda en la memoria del módulo: la sección no tiene variables propias ni toca el lector', () => {
  assert.ok(SECCION.length > 3000, 'se encontró la sección');
  assert.doesNotMatch(SECCION, /^(let|var) /m, 'ni un let ni un var a nivel de módulo');
  assert.doesNotMatch(SECCION, /\blector\b/, 'no pasa por el lector, que es lo único que se suelta al cerrar la sesión');
  assert.doesNotMatch(SECCION, /localStorage|sessionStorage|indexedDB|caches\./i);
  // Las únicas constantes de módulo son frases, columnas y estados: ninguna guarda datos leídos.
  const constantes = [...SECCION.matchAll(/^const ([A-Z_]+) =/gm)].map((m) => m[1]);
  assert.deepEqual(constantes, ['COLUMNAS_DE_RENTAS', 'COLUMNAS_DE_PAGOS', 'COLUMNAS_DE_RESUMEN']);
});

// ---------------------------------------------------------------------------
// El archivo de verdad, leído de vuelta
// ---------------------------------------------------------------------------

test('el .xlsx de la cuenta de Ana tiene tres pestañas y cada celda dice lo que el modelo dijo', async () => {
  const lectura = escenario();
  const vista = armarVistaDeComisiones(lectura);
  const { bytes, nombre } = await armarElExcelDeComisiones({
    vista, clave: 'id:e1', pagos: lectura.pagos.datos, hoy: HOY,
  });
  assert.equal(nombre, 'Comisiones de Ana López 2026-10-23.xlsx');
  const libro = await abrirLibro(bytes);
  assert.deepEqual([...libro.hojas.keys()], ['Resumen', 'Rentas', 'Pagos']);
  // Rentas: fila 1 son los títulos y la fila 2 la primera renta (la de «por pagar» que regresó primero).
  assert.equal(libro.texto('Rentas', 'A1'), 'Empleado');
  assert.equal(libro.texto('Rentas', 'M1'), 'Por pagar');
  assert.equal(libro.texto('Rentas', 'A2'), 'Ana López');
  assert.equal(libro.numero('Rentas', 'B2'), 8, 'la que regresó el 20 de septiembre (la del pago anulado) va primero entre las por pagar');
  assert.equal(libro.numero('Rentas', 'M2'), 140);
  assert.equal(libro.numero('Rentas', 'C2'), serialDeFecha('2026-09-16'));
  assert.equal(libro.texto('Rentas', 'E2'), '2026-09');
  assert.equal(libro.texto('Rentas', 'Q2'), ESTADOS_EN_EXCEL['por-pagar']);
  assert.equal(libro.numero('Rentas', 'K2'), 2800);
  assert.equal(libro.numero('Rentas', 'L2'), 5);
  // Pagos.
  assert.equal(libro.numero('Pagos', 'D2'), 100);
  assert.equal(libro.texto('Pagos', 'C2'), 'Cheque');
  // Las pestañas de tabla llevan filtro y la fila de títulos fija.
  assert.match(libro.xml('Rentas'), /<autoFilter ref="A1:R10"\/>/);
  assert.match(libro.xml('Pagos'), /<pane ySplit="1"/);
  // Las propiedades del archivo dicen de quién es y de qué día.
  const propiedades = new TextDecoder().decode(libro.partes.get('docProps/core.xml'));
  assert.match(propiedades, /<dc:title>Comisiones de Ana López<\/dc:title><dc:subject>Cuenta de comisiones al 2026-10-23<\/dc:subject>/);
  // Y el resumen empieza con el título, la fecha de la cuenta y la advertencia de privacidad.
  assert.equal(libro.texto('Resumen', 'A1'), 'Comisiones de los empleados — Ana López');
  assert.match(libro.texto('Resumen', 'A2'), /^Cuenta al 23 oct 2026\./);
  const notas = [...libro.xml('Resumen').matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);
  assert.ok(notas.some((t) => t.startsWith('Cuídalo como tu Excel')));
  assert.ok(notas.some((t) => t.includes('Solo la columna «Por pagar» es deuda')));
});

test('ninguna celda del archivo es una fórmula, aunque un nombre o un cliente empiece con «=»', async () => {
  const lectura = lecturaOk({
    contratos: [{ ...renta({ id: 'x', numero: 1, recibidoEl: '2026-10-05' }), clienteNombre: '=HYPERLINK("http://x")', carroPlacas: '+1+1' }],
  });
  const { bytes } = await armarElExcelDeComisiones({
    vista: armarVistaDeComisiones(lectura), clave: 'id:e1', pagos: [], hoy: HOY,
  });
  const libro = await abrirLibro(bytes);
  for (const hoja of libro.hojas.keys()) assert.doesNotMatch(libro.xml(hoja), /<f[\s>/]/, hoja);
  assert.equal(libro.texto('Rentas', 'H2'), '=HYPERLINK("http://x")', 'queda como texto');
});

test('una fecha que no se puede escribir como fecha queda como TEXTO (no se pierde), y se avisa adentro del archivo y en pantalla', async () => {
  const lectura = lecturaOk({ contratos: [renta({ id: 'x', numero: 1, fechaSalida: '2026-02-30', recibidoEl: '2026-10-05' })] });
  const { bytes, avisos } = await armarElExcelDeComisiones({
    vista: armarVistaDeComisiones(lectura), clave: 'id:e1', pagos: [], hoy: HOY,
  });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Renta 1 de Ana López: la fecha «2026-02-30» no se pudo escribir como fecha y quedó como texto\./);
  const libro = await abrirLibro(bytes);
  assert.equal(libro.texto('Rentas', 'C2'), '2026-02-30');
  assert.ok([...libro.xml('Resumen').matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].some((m) => m[1] === avisos[0]));
  assert.match(textoDeLoBajado({ nombre: 'a.xlsx', cuenta: { empleados: 1, rentas: 1, pagos: 0, debe: 0 }, avisos }), /una fecha no se pudieron escribir/);
});

test('los mismos datos del mismo día dan el mismo archivo, byte por byte', async () => {
  const lectura = escenario();
  const vista = armarVistaDeComisiones(lectura);
  const a = await armarElExcelDeComisiones({ vista, pagos: lectura.pagos.datos, hoy: HOY });
  const b = await armarElExcelDeComisiones({ vista, pagos: lectura.pagos.datos, hoy: HOY });
  assert.deepEqual(a.bytes, b.bytes);
});

// ---------------------------------------------------------------------------
// Los botones y lo que dicen
// ---------------------------------------------------------------------------

const ficha = (nombre, { lectura = escenario(), ui = {} } = {}) => {
  const vista = armarVistaDeComisiones(lectura);
  return htmlFichaDeComisiones({
    entrada: entradaDe(vista, nombre), vista, ui: { marcados: new Set(), pagando: false, forma: 'efectivo', fecha: HOY, ...ui }, lectura, hoy: HOY,
  });
};

test('la ficha de un empleado ofrece bajar SU cuenta; la lista, bajar todas', () => {
  const unaFicha = ficha('Ana López');
  assert.equal((unaFicha.match(/data-cm="bajar"/g) ?? []).length, 1);
  assert.match(unaFicha, /<button type="button" class="btn" data-cm="bajar" data-alcance="una">Bajar esta cuenta en Excel<\/button>/);
  const lista = htmlListaDeComisiones(armarVistaDeComisiones(escenario()));
  assert.equal((lista.match(/data-cm="bajar"/g) ?? []).length, 1);
  assert.match(lista, /<button type="button" class="btn" data-cm="bajar" data-alcance="todas">Bajar todas las cuentas en Excel<\/button>/);
});

test('la lista sin ninguna cuenta no ofrece bajar nada', () => {
  const vacia = armarVistaDeComisiones(lecturaOk({ empleados: [] }));
  assert.doesNotMatch(htmlListaDeComisiones(vacia), /data-cm="bajar"/);
});

test('JUNTO AL BOTÓN se dice lo que el archivo es y lo que no: el respaldo del año no lleva las comisiones, y el archivo lleva nombres de clientes', () => {
  const lista = texto(htmlListaDeComisiones(armarVistaDeComisiones(escenario())));
  assert.ok(lista.includes(TEXTO_DE_LA_COPIA));
  assert.match(TEXTO_DE_LA_COPIA, /No se baja solo/);
  assert.match(TEXTO_DE_LA_COPIA, /el respaldo del año no lleva las comisiones/);
  assert.match(TEXTO_DE_LA_COPIA, /nombre de los clientes/);
  assert.match(TEXTO_DE_LA_COPIA, /donde solo entres tú/);
  assert.ok(texto(ficha('Ana López')).includes(TEXTO_DE_LA_COPIA_DE_UNA));
  assert.match(TEXTO_DE_LA_COPIA_DE_UNA, /también los anulados/);
  assert.match(TEXTO_DE_LA_COPIA_DE_UNA, /nombre de los clientes/);
});

test('un fallo al bajar se queda escrito en la página, en rojo, en la lista y en la ficha; sin fallo no hay barra', () => {
  const vista = armarVistaDeComisiones(escenario());
  const lista = htmlListaDeComisiones(vista, { mensajeBajar: MENSAJE_BAJAR_FALLO });
  assert.match(lista, new RegExp(`<div class="barra-lectura-fallida" role="alert"><p>${MENSAJE_BAJAR_FALLO.slice(0, 30)}`));
  assert.doesNotMatch(htmlListaDeComisiones(vista), /No se bajó nada/);
  const enFicha = ficha('Ana López', { ui: { mensajeBajar: MENSAJE_BAJAR_SIN_SESION } });
  assert.match(enFicha, /role="alert"><p>No se bajó nada: la sesión del área de dinero se cerró/);
  assert.doesNotMatch(ficha('Ana López'), /No se bajó nada/);
});

test('el mensaje que se le dice a un error que no es nuestro es el genérico: nunca el texto crudo de Firebase', () => {
  const clic = PANTALLA.slice(PANTALLA.indexOf('async function bajarExcel'), PANTALLA.indexOf('// ----- Los eventos'));
  assert.match(clic, /if \(error instanceof ErrorDeBajada\) ui\.mensajeBajar = error\.message;/);
  assert.match(clic, /else \{ ui\.mensajeBajar = MENSAJE_BAJAR_FALLO;/);
  assert.doesNotMatch(clic, /aviso\(error\.message|String\(error/);
  assert.match(MENSAJE_BAJAR_FALLO, /^No se bajó nada/);
  for (const m of [MENSAJE_BAJAR_SIN_SESION, MENSAJE_BAJAR_CUENTA_YA_NO_ESTA, MENSAJE_BAJAR_SIN_CUENTAS]) assert.match(m, /^No se bajó nada/);
});

test('el clic: mira la sesión antes, bloquea el doble clic, baja la cuenta abierta (o todas), con la fecha de hoy, y redibuja', () => {
  const clic = PANTALLA.slice(PANTALLA.indexOf('async function bajarExcel'), PANTALLA.indexOf('// ----- Los eventos'));
  assert.match(clic, /async function bajarExcel\(alcance\) \{\s*if \(ui\.ocupado \|\| !haySesion\(\)\) return;\s*ui\.ocupado = true;/);
  assert.match(clic, /bajarLasCuentasEnExcel\(\{ clave: alcance === 'una' \? claveActual : null, hoy: hoyISO\(\) \}\)/);
  assert.match(clic, /finally \{\s*ui\.ocupado = false;/);
  assert.match(clic, /if \(ui\.mensajeBajar === MENSAJE_BAJAR_SIN_SESION && !haySesion\(\)\) return;\s*dibujar\(\);/);
  assert.match(PANTALLA, /case 'bajar': bajarExcel\(accion\.dataset\.alcance\); return;/);
  // Lo que falló se dibuja en la lista y en la ficha: la lista recibe el mensaje y la ficha lo lee de `ui`.
  assert.match(PANTALLA, /raiz\.innerHTML = htmlListaDeComisiones\(vista, \{ mensajeBajar: ui\.mensajeBajar \}\);/);
  assert.match(PANTALLA, /raiz\.innerHTML = htmlFichaDeComisiones\(\{ entrada, vista, ui, lectura: lector\.actual, hoy \}\);/);
  assert.match(clic, /boton\.disabled = true; boton\.textContent = 'Armando el archivo…'/);
});

test('el botón de bajar existe solo en las pantallas de comisiones, detrás de la contraseña: ni el menú ni otra pantalla lo traen', () => {
  assert.doesNotMatch(leer('../index.html'), /bajar|comisiones/i);
  assert.doesNotMatch(leer('../js/pantallas/dinero.js'), /data-cm="bajar"|bajarLasCuentasEnExcel/);
  assert.doesNotMatch(leer('../js/pantallas/respaldo.js'), /bajarLasCuentasEnExcel/);
});

test('el aviso de «se bajó» dice cuántas cuentas, rentas y pagos lleva y cuánto se debe, para compararlo con la pantalla', () => {
  assert.equal(
    textoDeLoBajado({ nombre: 'Comisiones de Ana López 2026-10-23.xlsx', cuenta: { empleados: 1, rentas: 9, pagos: 3, debe: 420 }, avisos: [] }),
    'Se bajó «Comisiones de Ana López 2026-10-23.xlsx» a tu carpeta de descargas: 1 cuenta, 9 rentas y 3 pagos. Se debe Q420.00.',
  );
  assert.match(textoDeLoBajado({ nombre: 'x.xlsx', cuenta: { empleados: 3, rentas: 1, pagos: 1, debe: 1234.5 }, avisos: [] }), /3 cuentas, 1 renta y 1 pago\. Se debe Q1,234\.50\./);
});

test('el nombre del archivo no lleva lo que un sistema de archivos no admite, ni queda vacío', () => {
  assert.equal(nombreDelArchivoDeComisiones('Ana López', HOY), 'Comisiones de Ana López 2026-10-23.xlsx');
  assert.equal(nombreDelArchivoDeComisiones('A/B: "C"?*<>|\\D', HOY), 'Comisiones de A B C D 2026-10-23.xlsx');
  assert.equal(nombreDelArchivoDeComisiones(null, HOY), 'Comisiones de todos 2026-10-23.xlsx');
  assert.equal(nombreDelArchivoDeComisiones('   ', HOY), 'Comisiones de todos 2026-10-23.xlsx');
  assert.ok(nombreDelArchivoDeComisiones('x'.repeat(300), HOY).length < 120);
});

// ---------------------------------------------------------------------------
// Ninguna regla se repite aquí
// ---------------------------------------------------------------------------

test('el archivo no recalcula nada: ni multiplica por el porcentaje, ni decide qué cierra, ni parte fechas, ni suma por su cuenta', () => {
  assert.ok(!/\*\s*porcentaje|porcentaje\s*\/\s*100|\/\s*100\b/.test(SECCION), 'la comisión la calcula comisionDe');
  assert.ok(!/\.firme\b|estadoContrato|pendientesDe|esPagableAlDueno/.test(SECCION), 'qué cierra lo dice el núcleo');
  assert.ok(!/slice\(0,\s*7\)|slice\(8,\s*10\)|getUTCDate|<=\s*15\b/.test(SECCION), 'el mes y la quincena son de quincenaDe');
  assert.ok(!/\.reduce\(|\bsuma\(/.test(SECCION), 'las sumas son de totalesDePagos y totalGeneralDeComisiones; las del dinero de cada renta, del núcleo');
  assert.match(SECCION, /quincenaDe\(regreso\)/);
  assert.match(SECCION, /comisionDe\(contrato\)/);
  assert.match(SECCION, /totalesDePagos\(vigentes\)\.monto/);
  assert.match(SECCION, /totalGeneralDeComisiones\(entradas\.map/);
  assert.match(SECCION, /cuenta\.totalPorPagar,\s*cuenta\.totalEstimado,\s*cuenta\.totalPorCerrar/);
  assert.match(SECCION, /entrada\.cuenta\.pagosQueCambiaron\.find/);
  assert.match(SECCION, /!pagoAnulado\(p\)/);
});

test('la pantalla del respaldo sigue diciendo que NO lleva las comisiones, y dónde se bajan aparte (para que nadie crea que ya están en el respaldo)', async () => {
  const { NO_SE_RESPALDA } = await import('../js/respaldo/mapa.js');
  const linea = NO_SE_RESPALDA.filter((t) => /comisiones de los empleados/i.test(t));
  assert.equal(linea.length, 1);
  assert.match(linea[0], /^Las comisiones de los empleados y sus pagos\./);
  assert.match(linea[0], /Se bajan aparte: Dinero → Comisiones → «Bajar todas las cuentas en Excel» \(no se baja solo\)/);
  assert.ok(htmlListaDeComisiones(armarVistaDeComisiones(escenario())).includes('Bajar todas las cuentas en Excel'), 'y ese botón existe con ese nombre');
});

test('el archivo no lee el reloj: `hoy` llega de fuera', () => {
  assert.doesNotMatch(SECCION, /new Date|Date\.now|hoyISO\(/);
});

test('reutiliza el libro y el zip del respaldo y la descarga del respaldo: no escribe un .xlsx por su cuenta', () => {
  assert.match(PANTALLA, /import \{ escribirLibro \} from '\.\.\/respaldo\/libroNuevo\.js';/);
  assert.match(PANTALLA, /import \{ descargarArchivo \} from '\.\/respaldo\.js';/);
  assert.match(PANTALLA, /import \{ serialDeFecha \} from '\.\.\/respaldo\/hojas\.js';/);
  assert.ok(!/escribirZip|CompressionStream|new Blob|createObjectURL/.test(PANTALLA));
});
