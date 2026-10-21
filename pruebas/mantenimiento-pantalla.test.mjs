// Pruebas del bloque de mantenimiento de la ficha del carro (pantallas/mantenimiento.js y su cableado en carros.js).
//
// Lo que se prueba aquí es lo propio de la pantalla: que dibuje lo que el núcleo contestó, que un dato que no se sabe se
// vea como «no se sabe» y nunca como cero ni como «al día», que una lectura caída se vea, y que ninguna regla de negocio
// viva en el archivo de la pantalla. La regla misma (toca o no toca, en cuántos kilómetros anda) se prueba en
// pruebas/mantenimiento.test.mjs. Los botones se probaron a clic real en el navegador (ver el informe).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlEstadoDeMantenimiento, htmlFormularioDeServicio, htmlIntervalos, mensajesDeFalloDeMantenimiento,
} from '../js/pantallas/mantenimiento.js';
import { construirVehiculo } from '../js/pantallas/carros.js';
import { carroConIntervalo, carroConServicioAnulado } from '../js/nucleo/mantenimiento.js';
import { carroPropio, carroConServicios } from './fixtures/carroConServicios.mjs';
import { contratoConKilometraje } from './fixtures/contratoConKilometraje.mjs';

const HOY = '2026-10-16';
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const textoVisible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const filaDe = (html, tipo) => html.match(new RegExp(`<tr class="mant-fila[^"]*" data-tipo="${tipo}">[\\s\\S]*?</tr>`))[0];

const recibido = (extra = {}) => contratoConKilometraje({
  id: 'c2', numero: 2, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800, ...extra,
});

// ---------------------------------------------------------------------------------------------------------------
// Un carro recién comprado
// ---------------------------------------------------------------------------------------------------------------

test('un carro sin contratos ni servicios: «no se sabe» en el kilometraje, «sin registro» en los seis, y ningún número inventado', () => {
  const html = htmlEstadoDeMantenimiento({ carro: carroPropio(), contratos: [], hoy: HOY });
  const texto = textoVisible(html);
  assert.match(texto, /No se sabe en cuántos kilómetros anda este carro/);
  assert.equal((html.match(/<tr class="mant-fila/g) || []).length, 6);
  assert.equal((html.match(/mant-etiqueta-sin-registro/g) || []).length, 6);
  assert.equal((texto.match(/Falta registrar el primer servicio\./g) || []).length, 6);
  assert.match(html, /class="mant-km mant-km-desconocido"/);
  // Nada que parezca una medición: ni «faltan», ni «al día», ni un «0 km».
  assert.doesNotMatch(texto, /[Ff]altan \d|Al día|\b0 km\b|Toca ahora|Se pasó/);
  assert.match(texto, /Todavía no se ha registrado ningún servicio\./);
  assert.doesNotMatch(html, /mant-anular/, 'sin servicios no hay nada que anular');
  assert.doesNotMatch(html, /barra-lectura-fallida/, 'y no hay lectura caída que decir');
});

test('los seis servicios salen con su nombre y su intervalo de siempre, en el orden de la especificación', () => {
  const html = htmlEstadoDeMantenimiento({ carro: carroPropio(), contratos: [], hoy: HOY });
  const nombres = [...html.matchAll(/<tr class="mant-fila[^"]*" data-tipo="\w+">\s*<td><strong>([^<]+)<\/strong>/g)].map((m) => m[1]);
  assert.deepEqual(nombres, ['Aceite y filtro', 'Pastillas de freno', 'Llantas', 'Batería', 'Alineación y balanceo', 'Servicio general']);
  assert.match(filaDe(html, 'aceite'), /cada 5,000 km o 3 meses/);
  assert.match(filaDe(html, 'llantas'), /cada 40,000 km o 48 meses/);
  assert.doesNotMatch(filaDe(html, 'aceite'), /de este carro/);
});

// ---------------------------------------------------------------------------------------------------------------
// Un carro con historia
// ---------------------------------------------------------------------------------------------------------------

test('un carro con historia: dice en cuánto anda y de qué contrato, en enteros, y cada renglón dice si toca', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-07-03', km: 9000 },
    { tipo: 'frenos', fecha: '2026-06-01', km: 10000 },
  ], HOY);
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [recibido()], hoy: HOY });
  const texto = textoVisible(html);
  assert.match(texto, /Anda en 14,800 km, según el kilometraje de entrada del contrato 2, recibido el 5 sep 2026\./);
  assert.doesNotMatch(texto, /14,800\.00|14800/, 'kilómetros enteros con su separador de miles, nunca con centavos');
  assert.match(filaDe(html, 'aceite'), /mant-etiqueta-toca/);
  assert.match(textoVisible(filaDe(html, 'aceite')), /Kilómetros: Se pasó por 800 km \(tocaba a los 14,000 km\)\./);
  assert.match(textoVisible(filaDe(html, 'aceite')), /Tiempo: Se pasó hace 13 días \(tocaba el 3 oct 2026\)\./);
  assert.match(filaDe(html, 'frenos'), /mant-etiqueta-al-dia/);
  assert.match(textoVisible(filaDe(html, 'frenos')), /Faltan 25,200 km \(a los 40,000 km\)\./);
  assert.match(filaDe(html, 'bateria'), /mant-etiqueta-sin-registro/);
  assert.match(filaDe(html, 'aceite'), /mant-fila-toca/, 'la fila que toca se marca');
});

test('«último» dice la fecha y el kilometraje del servicio, o «sin kilometraje» si no se anotó (nunca 0 km)', () => {
  const carro = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-09-16', km: 15000 },
    { tipo: 'frenos', fecha: '2026-09-16', km: null },
  ], HOY);
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [], hoy: HOY });
  assert.match(textoVisible(filaDe(html, 'aceite')), /16 sep 2026 a los 15,000 km/);
  assert.match(textoVisible(filaDe(html, 'frenos')), /16 sep 2026 sin kilometraje/);
  assert.doesNotMatch(textoVisible(html), /a los 0 km/);
});

test('sin el kilometraje del carro, el tiempo mide solo y los kilómetros dicen que no se saben (el renglón no es «Al día»)', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY);
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [], hoy: HOY });
  const fila = textoVisible(filaDe(html, 'aceite'));
  assert.match(fila, /Kilómetros: Toca a los 20,000 km, pero no se sabe en cuántos kilómetros anda el carro\./);
  assert.match(fila, /Tiempo: Faltan 61 días \(el 16 dic 2026\)\./);
  assert.match(filaDe(html, 'aceite'), /mant-etiqueta-parcial/);
  assert.match(fila, /Al día por fecha/);
  assert.doesNotMatch(fila, /Al día(?! por fecha)/, 'no dice «Al día» a secas');
});

test('un intervalo cambiado en este carro se dice en el renglón', () => {
  const carro = carroConIntervalo(carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY), 'aceite', { km: 4000, meses: 1 });
  const fila = textoVisible(filaDe(htmlEstadoDeMantenimiento({ carro, contratos: [], hoy: HOY }), 'aceite'));
  assert.match(fila, /cada 4,000 km o 1 mes \(de este carro\)/);
  assert.match(fila, /Kilómetros: Toca a los 19,000 km/);
});

// ---------------------------------------------------------------------------------------------------------------
// Una lectura caída se ve
// ---------------------------------------------------------------------------------------------------------------

test('mensajesDeFalloDeMantenimiento: cada lectura que cayó se dice con sus palabras', () => {
  assert.deepEqual(mensajesDeFalloDeMantenimiento({}), []);
  assert.deepEqual(mensajesDeFalloDeMantenimiento({ falloFlota: true }), ['No se pudo leer la flota: los servicios de este carro pueden estar atrasados.']);
  assert.deepEqual(mensajesDeFalloDeMantenimiento({ falloContratos: true }), ['No se pudieron leer los contratos: el kilometraje del carro puede estar atrasado o faltar.']);
  assert.equal(mensajesDeFalloDeMantenimiento({ falloFlota: true, falloContratos: true }).length, 2);
});

test('con los contratos sin poder leerse: la barra roja, «no se pudieron leer» (no «no se sabe») y ningún renglón «Al día»', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY);
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [], hoy: HOY, falloContratos: true });
  const texto = textoVisible(html);
  assert.match(html, /<div class="barra-lectura-fallida">/);
  assert.match(texto, /No se pudieron leer los contratos: el kilometraje del carro puede estar atrasado o faltar\./);
  assert.match(texto, /No se pudieron leer los contratos, así que no se sabe en cuántos kilómetros anda este carro/);
  assert.doesNotMatch(texto, /ninguno de sus contratos trae kilometraje/, 'no leer no es lo mismo que no tener');
  assert.match(filaDe(html, 'aceite'), /mant-etiqueta-sin-confirmar/);
  assert.match(textoVisible(filaDe(html, 'aceite')), /No se pudo confirmar/);
  assert.doesNotMatch(html, /mant-etiqueta-al-dia|mant-etiqueta-parcial/);
});

test('con la flota sin poder leerse: la barra roja, y un historial vacío NO dice «todavía no se ha registrado ninguno»', () => {
  const html = htmlEstadoDeMantenimiento({ carro: carroPropio(), contratos: [], hoy: HOY, falloFlota: true });
  const texto = textoVisible(html);
  assert.match(texto, /No se pudo leer la flota: los servicios de este carro pueden estar atrasados\./);
  assert.match(texto, /No se pudo leer el historial de servicios de este carro\./);
  assert.doesNotMatch(texto, /Todavía no se ha registrado ningún servicio/);
});

test('con una lectura caída, lo que toca se dice igual: lo malo no espera confirmación', () => {
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-03-01', km: 15000 }], HOY);
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [recibido()], hoy: HOY, falloContratos: true });
  assert.match(filaDe(html, 'aceite'), /mant-etiqueta-toca/);
  assert.match(textoVisible(html), /Puede estar atrasado: no se pudieron leer los contratos\./);
});

// ---------------------------------------------------------------------------------------------------------------
// El historial
// ---------------------------------------------------------------------------------------------------------------

test('el historial: el que cuenta lleva «Anular»; el anulado se queda, tachado y con su fecha, sin botón', () => {
  const base = carroConServicios(carroPropio(), [
    { tipo: 'aceite', fecha: '2026-09-16', km: 15000 },
    { tipo: 'frenos', fecha: '2026-10-01', km: 150000 },
  ], HOY);
  const carro = carroConServicioAnulado(base, 's2', HOY);
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [], hoy: HOY });
  assert.equal((html.match(/data-anular="/g) || []).length, 1);
  assert.match(html, /data-anular="s1"/);
  assert.doesNotMatch(html, /data-anular="s2"/);
  const items = html.match(/<li class="mant-hist-item[^"]*">[\s\S]*?<\/li>/g);
  assert.equal(items.length, 2);
  assert.match(items[0], /mant-hist-no-cuenta/, 'el más reciente es el anulado');
  assert.match(textoVisible(items[0]), /1 oct 2026 Pastillas de freno a los 150,000 km Anulado el 16 oct 2026/);
  assert.match(textoVisible(items[1]), /16 sep 2026 Aceite y filtro a los 15,000 km/);
  // Un servicio anulado no resetea el plazo de frenos: sigue «sin registro».
  assert.match(filaDe(html, 'frenos'), /mant-etiqueta-sin-registro/);
});

test('lo que viene de datos guardados entra escapado: nunca como HTML', () => {
  const carro = { ...carroPropio(), servicios: [{ id: 's"><img src=x onerror=alert(1)>', tipo: 'aceite', fecha: '2026-10-01', km: 1000 }] };
  const html = htmlEstadoDeMantenimiento({ carro, contratos: [], hoy: HOY });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /data-anular="s&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
});

// ---------------------------------------------------------------------------------------------------------------
// El formulario y los intervalos
// ---------------------------------------------------------------------------------------------------------------

test('el formulario propone el último kilometraje que se sabe y lo deja corregir; sin saberlo, queda vacío y lo dice', () => {
  const con = htmlFormularioDeServicio({ hoy: HOY, propuesta: 14800 });
  assert.match(con, /<input type="number" id="mant-km" min="1" step="1" inputmode="numeric" value="14800">/);
  assert.match(textoVisible(con), /Propuesto: 14,800 km, lo último que se sabe de este carro\. Corrígelo si el odómetro marca otra cosa\./);
  assert.match(con, /<input type="date" id="mant-fecha" value="2026-10-16">/);
  const sin = htmlFormularioDeServicio({ hoy: HOY, propuesta: null });
  assert.match(sin, /id="mant-km" min="1" step="1" inputmode="numeric" value="">/, 'vacío, no 0');
  assert.match(textoVisible(sin), /No se sabe en cuántos kilómetros anda este carro\. Escribe el del odómetro, o déjalo vacío si no lo sabes/);
  assert.equal((con.match(/<option value="/g) || []).length, 6);
  for (const html of [con, sin]) assert.match(html, /<button type="submit" class="btn btn-primario" id="mant-registrar">Registrar servicio<\/button>/);
});

test('los intervalos: los seis con sus números, el de siempre y el porqué; «volver» solo donde se cambió', () => {
  const carro = carroConIntervalo(carroPropio(), 'aceite', { km: 7500, meses: 4 });
  const html = htmlIntervalos({ carro });
  assert.equal((html.match(/class="mant-intervalo-fila"/g) || []).length, 6);
  assert.match(html, /data-tipo="aceite">[\s\S]*?data-km value="7500"[\s\S]*?data-meses value="4"/);
  assert.match(html, /data-tipo="frenos">[\s\S]*?data-km value="30000"[\s\S]*?data-meses value="12"/);
  assert.equal((html.match(/data-volver-intervalo="/g) || []).length, 1);
  assert.match(html, /data-volver-intervalo="aceite">Volver a los de siempre \(5,000 km o 3 meses\)/);
  assert.match(textoVisible(html), /De siempre: 5,000 km o 3 meses\. Cada 5,000 km es el intervalo que suele recomendarse/);
  assert.match(textoVisible(htmlIntervalos({ carro: carroPropio() })), /De siempre: 40,000 km o 48 meses\./);
  assert.doesNotMatch(htmlIntervalos({ carro: carroPropio() }), /data-volver-intervalo/);
});

// ---------------------------------------------------------------------------------------------------------------
// La regla vive una vez: nada del núcleo se vuelve a escribir en la pantalla
// ---------------------------------------------------------------------------------------------------------------

const PANTALLA = sinComentarios(leer('../js/pantallas/mantenimiento.js'));
const CARROS = sinComentarios(leer('../js/pantallas/carros.js'));

test('ninguna regla de negocio en la pantalla: no lee kilometrajes de contratos, no cuenta fechas, no compara contra intervalos', () => {
  for (const [archivo, codigo] of [['mantenimiento.js', PANTALLA], ['carros.js', CARROS]]) {
    for (const prohibido of ['kmEntrada', 'kmSalida', 'kilometrajeSalida', 'sumarMeses', 'diasEntre', 'sumarDias', 'ANTELACION', 'esFechaISO', 'conKmSalidaNormalizado', 'yaVolvio']) {
      assert.ok(!codigo.includes(prohibido), `${archivo} usa ${prohibido}: eso lo contesta nucleo/mantenimiento.js`);
    }
    assert.ok(!/\bfaltan\s*[<>]=?|\.faltan\b\s*[<>]=?/.test(codigo), `${archivo} compara cuánto falta`);
    assert.ok(!/estado\s*===\s*'(toca|pronto|al-dia)'/.test(codigo), `${archivo} decide si toca`);
    assert.ok(!/textoDosDecimales/.test(codigo), `${archivo}: los kilómetros son enteros (textoEntero)`);
  }
  const importaDelNucleo = PANTALLA.match(/import \{[^}]*\} from '\.\.\/nucleo\/[\w.]+';/g).map((l) => l.match(/'(.+)'/)[1]);
  assert.deepEqual(importaDelNucleo.sort(), ['../nucleo/dinero.js', '../nucleo/mantenimiento.js']);
});

test('la pantalla no lleva estilos en línea: cada ajuste es una clase del CSS', () => {
  assert.equal((PANTALLA.match(/style\s*=/g) || []).length, 0);
  const html = htmlEstadoDeMantenimiento({ carro: carroPropio(), contratos: [], hoy: HOY })
    + htmlFormularioDeServicio({ hoy: HOY }) + htmlIntervalos({ carro: carroPropio() });
  assert.doesNotMatch(html, /style=/);
  const css = leer('../css/estilos.css');
  for (const clase of ['mantenimiento', 'mant-bloque', 'mant-tabla', 'mant-etiqueta-toca', 'mant-etiqueta-pronto', 'mant-etiqueta-al-dia', 'mant-fila-toca', 'mant-historial', 'mant-campos', 'mant-intervalo-fila']) {
    assert.ok(css.includes(`.${clase}`), `falta .${clase} en estilos.css`);
  }
});

test('la ficha lee TODOS los contratos (de ahí sale el kilometraje) y la lista sigue leyendo solo los abiertos', () => {
  assert.match(CARROS, /const esFicha = Boolean\(carroId\) && carroId !== 'nuevo';/);
  assert.match(CARROS, /const cargarContratosDeEstaVista = esFicha \? cargarTodosLosContratos : cargarContratosAbiertos;/);
  // (con `lecturas.contratos.deLaNube(r)`: lo que la nube trae por detrás no lo pisa la copia local, ver nucleo/lecturas.js)
  assert.match(CARROS, /cargarContratosDeEstaVista\(\(r\) => \{ lecturas\.contratos\.deLaNube\(r\); contratos = r\.datos; falloContratos = r\.fallo; repintar\(\); \}\)/);
});

test('la ficha le pasa al bloque los dos fallos de lectura y se entera de las lecturas que llegan tarde', () => {
  assert.match(CARROS, /pintarMantenimiento\(el\('mantenimiento'\), \{\s*carro, contratos, hoy, falloFlota, falloContratos,/);
  assert.match(CARROS, /alLlegarTarde\(\(nuevos\) => \{[\s\S]*?mantenimiento\.actualizar\(\{[\s\S]*?falloFlota: nuevos\.falloFlota, falloContratos: nuevos\.falloContratos/);
  assert.match(CARROS, /alLlegarTardeLaFicha\(\{\s*flota, contratos, falloFlota, falloContratos,/);
});

test('un carro NUEVO no lleva bloque de mantenimiento (no tiene id, ni servicios, ni contratos)', () => {
  assert.match(CARROS, /if \(carro\) \{\s*contenedor\.insertAdjacentHTML\('beforeend', '<section id="mantenimiento"/);
});

test('después de anotar un servicio la ficha trabaja con el carro que quedó guardado: «Guardar carro» no reescribe la lista de cuando se abrió', () => {
  assert.match(CARROS, /alCambiar: \(guardado\) => \{ carro = guardado; \}/);
  assert.match(CARROS, /let carro = null;/);
});

test('construirVehiculo no pierde los servicios ni los intervalos al editar el carro (la copia local se reemplaza entera)', () => {
  const carro = carroConIntervalo(carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-09-16', km: 15000 }], HOY), 'frenos', { km: 25000, meses: 12 });
  const editado = construirVehiculo(carro, { placas: 'P-222BBB' });
  assert.equal(editado.placas, 'P-222BBB');
  assert.deepEqual(editado.servicios, carro.servicios);
  assert.deepEqual(editado.intervalos, carro.intervalos);
});

test('el formulario del carro sigue sin ser modal y el bloque nuevo tampoco usa alert ni diálogos de página', () => {
  assert.doesNotMatch(CARROS, /confirm\(|alert\(|showModal|<dialog/);
  assert.doesNotMatch(PANTALLA, /alert\(|showModal|<dialog/);
});
