// Pruebas de la pantalla de clientes (clientes.js): solo la parte pura, sin
// DOM — igual que flota.test.mjs y carros.test.mjs.
//
// Lo que más importa probar es qué cuenta como alerta ("marca roja"): la
// licencia y el documento vencidos, el saldo pendiente (siempre por
// resumen(), nunca una cifra propia) y cuántas veces devolvió tarde.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';
import {
  estaVencido, contratosDe, saldoPendienteDe, vecesTarde, alertasDe, clienteParaFormulario,
  mensajesDeFalloDeClientes, htmlListaVacia, textoClienteNoEncontrado, seccionHistorial,
  htmlAvisoDeDocumento, seccionesHTML,
} from '../js/pantallas/clientes.js';

const HOY = '2026-09-25';

// Fix round 1, hallazgo Crítico de la revisión: sacarCarro.js todavía guarda
// clientes con nombre1/apellido1 (se migra en la Tarea 7), y ya hay clientes
// guardados así. Sin este puente la ficha se abre con Nombres/Apellidos en
// blanco y faltaAlgo() rechaza cualquier guardado, aunque solo se quiera
// corregir el teléfono.
test('clienteParaFormulario: prellena nombres/apellidos de la forma vieja cuando faltan', () => {
  const viejo = {
    id: 'k9', nombre1: 'PEDRO', apellido1: 'MENDOZA', telefono: '5555-1234',
  };
  const prellenado = clienteParaFormulario(viejo);
  assert.equal(prellenado.nombres, 'PEDRO');
  assert.equal(prellenado.apellidos, 'MENDOZA');
  // El resto del cliente viaja igual, nada se pierde ni se inventa.
  assert.equal(prellenado.id, 'k9');
  assert.equal(prellenado.telefono, '5555-1234');
});

test('clienteParaFormulario: un cliente de la forma nueva no cambia', () => {
  const nuevo = { id: 'k1', nombres: 'ANA', apellidos: 'GÓMEZ' };
  assert.deepEqual(clienteParaFormulario(nuevo), nuevo);
});

test('clienteParaFormulario: sin cliente (alta nueva), no revienta', () => {
  assert.deepEqual(clienteParaFormulario(null), {});
  assert.deepEqual(clienteParaFormulario(undefined), {});
});

test('estaVencido: una fecha pasada está vencida, vacía nunca lo está', () => {
  assert.equal(estaVencido('2026-01-01', HOY), true);
  assert.equal(estaVencido('2027-01-01', HOY), false, 'todavía no llega');
  assert.equal(estaVencido(HOY, HOY), false, 'vence hoy, todavía no vencida');
  assert.equal(estaVencido('', HOY), false);
  assert.equal(estaVencido(undefined, HOY), false);
});

test('contratosDe: solo los del cliente pedido', () => {
  const cliente = { id: 'k1' };
  const contratos = [
    { id: 'c1', clienteId: 'k1' },
    { id: 'c2', clienteId: 'k2' },
    { id: 'c3', clienteId: 'k1' },
  ];
  const propios = contratosDe(cliente, contratos);
  assert.deepEqual(propios.map((c) => c.id), ['c1', 'c3']);
});

test('saldoPendienteDe: suma el saldo real de cada contrato, con resumen()', () => {
  // dias=2, precioDia=100 -> totalSalida 200; sin pagos -> saldo 200 cada uno
  const contratos = [
    { dias: 2, precioDia: 100, pagos: [] },
    { dias: 1, precioDia: 100, pagos: [{ monto: 100, porcentajeTarjeta: 0 }] }, // saldo 0
  ];
  assert.equal(saldoPendienteDe(contratos), 200);
  assert.equal(saldoPendienteDe([]), 0);
});

// IMPORTANTE de la revisión final: mismo hallazgo que ya corrigió el plan 1
// en avisos.js (commit edb1c06) reapareciendo en esta pantalla. Un cliente
// que debe Q500 en un contrato y quedó con Q500 a favor en otro sumaba neto
// 0 (sin marca roja en la ficha), mientras "Sacar carro" sí avisaba "Este
// cliente debe Q500.00" — la misma persona, dos respuestas distintas. Una
// deuda y un saldo a favor son dos hechos distintos y no se cancelan.
test('saldoPendienteDe: una deuda real no se cancela con un sobrepago en otro contrato (no se netean)', () => {
  const debe500 = { dias: 5, precioDia: 100, pagos: [] }; // saldo 500
  const sobrepago500 = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-07-01', cierre: { fechaReal: '2026-07-01' }, pagos: [{ monto: 600, porcentajeTarjeta: 0 }],
  }; // saldo -500
  assert.equal(saldoPendienteDe([debe500, sobrepago500]), 500, 'la deuda real, no el neto (0, que escondería la deuda)');
});

test('vecesTarde: cuenta solo los contratos que de verdad tuvieron atraso', () => {
  const contratos = [
    { dias: 2, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-12' } }, // 2 días tarde
    { dias: 2, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-10' } }, // a tiempo
    { dias: 2, precioDia: 100, devolucionPrevista: '2026-09-10' }, // todavía no regresa: no cuenta
  ];
  assert.equal(vecesTarde(contratos), 1);
  assert.equal(vecesTarde([]), 0);
});

test('alertasDe: sin nada vencido, sin saldo y sin atrasos, no hay alertas', () => {
  const cliente = { id: 'k1' };
  assert.deepEqual(alertasDe(cliente, [], HOY), []);
});

test('alertasDe: licencia y documento vencidos salen cada uno con su frase', () => {
  const cliente = { id: 'k1', licenciaExpira: '2026-01-01', documentoExpira: '2025-12-31' };
  const alertas = alertasDe(cliente, [], HOY);
  const tipos = alertas.map((a) => a.tipo);
  assert.ok(tipos.includes('Licencia vencida'));
  assert.ok(tipos.includes('Documento vencido'));
  assert.match(alertas.find((a) => a.tipo === 'Licencia vencida').texto, /1 ene 2026/);
});

test('alertasDe: saldo pendiente sale con el monto exacto de resumen()', () => {
  const cliente = { id: 'k1' };
  const contratos = [{ clienteId: 'k1', dias: 2, precioDia: 100, pagos: [] }];
  const alertas = alertasDe(cliente, contratosDe(cliente, contratos), HOY);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].tipo, 'Saldo pendiente');
  assert.match(alertas[0].texto, /Q200\.00/);
});

test('alertasDe: cuántas veces devolvió tarde, en singular y en plural', () => {
  const cliente = { id: 'k1' };
  const unaVez = [{ clienteId: 'k1', dias: 1, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-11' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }] }];
  const alerta = alertasDe(cliente, contratosDe(cliente, unaVez), HOY).find((a) => a.tipo === 'Devolvió tarde');
  assert.match(alerta.texto, /1 vez\./);

  const dosVeces = [
    ...unaVez,
    { clienteId: 'k1', dias: 1, precioDia: 100, devolucionPrevista: '2026-09-10', cierre: { fechaReal: '2026-09-12' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }] },
  ];
  const alerta2 = alertasDe(cliente, contratosDe(cliente, dosVeces), HOY).find((a) => a.tipo === 'Devolvió tarde');
  assert.match(alerta2.texto, /2 veces\./);
});

// H-4, Clientes. «Devolvió tarde» tenía su propia copia de la regla (cuenta todo lo que le pasen, sin ventana) y la pantalla solo le pasaba los
// contratos ABIERTOS, así que casi nunca se prendía: el que devolvió tarde, pagó y cerró (el caso normal) salía limpio. El dueño decidió mirar el
// ÚLTIMO AÑO (nucleo/historial.js, la regla que ya usa «Sacar carro»). Ahora la pantalla lee TODOS los contratos, y esta cuenta es esa regla: cuenta
// lo cerrado, y no cuenta lo de hace más de un año.
test('alertasDe: «Devolvió tarde» cuenta el último año, cerrado o no, y no lo de hace más de un año (la regla de nucleo/historial.js)', () => {
  const cliente = { id: 'k1' };
  const reciente = contratoDeUnCarro({ id: 'c-reciente', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-10', danos: 0 });
  const vieja = contratoDeUnCarro({ id: 'c-vieja', fechaSalida: '2024-08-03', dias: 4, recibidoEl: '2024-08-10', danos: 0 });
  assert.equal(reciente.estado, 'cerrado', 'el escenario: pagó y cerró, no está entre los abiertos');
  const tarde = (contratos) => alertasDe(cliente, contratos, HOY).find((a) => a.tipo === 'Devolvió tarde');
  assert.match(tarde([reciente]).texto, /1 vez\./);
  assert.equal(tarde([vieja]), undefined, 'hace más de un año no cuenta');
  assert.match(tarde([vieja, reciente]).texto, /1 vez\./, 'solo la de este año');
  // sin `hoy` no hay ventana (vecesTarde a secas sigue contando todo lo que se le pasa)
  assert.equal(vecesTarde([vieja, reciente]), 2);
  assert.equal(vecesTarde([vieja, reciente], HOY), 1);
});

// Al leer TODOS los contratos la deuda no puede cambiar de respuesta: «Saldo pendiente» sigue saliendo de los ABIERTOS, los mismos que mira el aviso de
// «Sacar carro» (la misma persona no puede tener dos respuestas, ver `saldoPendienteDe`). Un contrato guardado como `cerrado` con una cuenta que hoy no
// cuadra (un cierre de antes de que se cobraran los «varios» de la devolución, por ejemplo) no se vuelve de pronto una deuda en esta pantalla.
test('alertasDe: con TODOS los contratos del cliente, el saldo pendiente sigue saliendo solo de los abiertos', () => {
  const cliente = { id: 'k1' };
  const cerradoQueHoyDebe = { ...contratoDeUnCarro({ id: 'c-viejo', fechaSalida: '2026-08-03', dias: 4, recibidoEl: '2026-08-07', danos: 200 }), estado: 'cerrado' };
  assert.ok(saldoPendienteDe([cerradoQueHoyDebe]) > 0, 'el escenario: su cuenta de hoy dice que debe');
  assert.equal(alertasDe(cliente, [cerradoQueHoyDebe], HOY).find((a) => a.tipo === 'Saldo pendiente'), undefined);
  const abierto = { ...cerradoQueHoyDebe, id: 'c-abierto', estado: 'devuelto' };
  assert.match(alertasDe(cliente, [cerradoQueHoyDebe, abierto], HOY).find((a) => a.tipo === 'Saldo pendiente').texto, /Q200\.00/);
});

test('H-4, Clientes: la pantalla lee TODOS los contratos y la lista de rentas de la ficha sigue siendo solo la de los abiertos', () => {
  const fuente = readFileSync(new URL('../js/pantallas/clientes.js', import.meta.url), 'utf8');
  assert.match(fuente, /cargarTodosLosContratos\(/, 'la lectura que conserva los cerrados, para el último año de devoluciones');
  assert.doesNotMatch(fuente, /cargarContratosAbiertos\(/);
  assert.match(fuente, /seccionHistorial\(contratosAbiertosDe\(/, '«Rentas abiertas» no se llena de cerradas');
  assert.doesNotMatch(fuente, /const vecesTarde|function vecesTarde[\s\S]{0,200}filter\(/, 'una sola copia de la regla de «devolvió tarde»');
});

test('alertasDe: pueden salir varias alertas juntas, cada una con su tipo', () => {
  const cliente = { id: 'k1', licenciaExpira: '2020-01-01' };
  const contratos = [{ clienteId: 'k1', dias: 1, precioDia: 500, pagos: [] }];
  const alertas = alertasDe(cliente, contratosDe(cliente, contratos), HOY);
  const tipos = alertas.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ['Licencia vencida', 'Saldo pendiente'].sort());
});

// ---------------------------------------------------------------------------
// «No hay clientes» y «no se pudo leer los clientes» no son lo mismo
//
// Prueba del sistema (7 oct 2026): con el internet caído y sin copia local de los clientes
// (una computadora nueva, o con los datos del navegador borrados), la lista decía «Todavía no
// hay clientes. Agregar el primero», sin ninguna barra roja — flota, reservaciones, calendario
// y contratos sí la tenían. Es la invitación a dar de alta a alguien que ya existe, y a partir
// la historia de esa persona en dos.
// ---------------------------------------------------------------------------

test('mensajesDeFalloDeClientes: sin fallos no hay nada que decir', () => {
  assert.deepEqual(mensajesDeFalloDeClientes({}), []);
  assert.deepEqual(mensajesDeFalloDeClientes({ falloClientes: false, falloContratos: false }), []);
  assert.deepEqual(mensajesDeFalloDeClientes(), []);
});

test('mensajesDeFalloDeClientes: cada lectura que falló se nombra, con lo que eso hace dudar', () => {
  assert.deepEqual(mensajesDeFalloDeClientes({ falloClientes: true }), [
    'No se pudieron leer los clientes. Puede que falten o que la lista esté incompleta.',
  ]);
  assert.deepEqual(mensajesDeFalloDeClientes({ falloContratos: true }), [
    'No se pudieron leer los contratos. Las alertas de saldo pendiente y de devoluciones tardías pueden estar incompletas.',
  ]);
  assert.equal(mensajesDeFalloDeClientes({ falloClientes: true, falloContratos: true }).length, 2);
});

test('htmlListaVacia: sin clientes de verdad invita a agregar el primero', () => {
  const html = htmlListaVacia({ falloClientes: false });
  assert.match(html, /Todavía no hay clientes\./);
  assert.match(html, /Agregar el primero/);
});

test('htmlListaVacia: si la lectura falló NO dice que no hay clientes ni invita a dar de alta a nadie', () => {
  const html = htmlListaVacia({ falloClientes: true });
  assert.match(html, /No se pudieron leer los clientes\. Intenta de nuevo o revisa la conexión\./);
  assert.ok(!/Todavía no hay clientes/.test(html));
  assert.ok(!/Agregar el primero/.test(html));
});

test('textoClienteNoEncontrado: «no se encontró» solo si la lectura salió bien', () => {
  assert.equal(textoClienteNoEncontrado(false), 'No se encontró este cliente.');
  assert.equal(textoClienteNoEncontrado(true), 'No se pudo leer la lista de clientes, así que no se sabe si este cliente existe. Revisa tu conexión e intenta de nuevo.');
});

test('la pantalla de clientes pasa los fallos al dibujar la lista y la ficha', () => {
  const fuente = readFileSync(new URL('../js/pantallas/clientes.js', import.meta.url), 'utf8');
  assert.match(fuente, /dibujarLista\(contenedor, clientes, contratos, hoy, \{ falloClientes, falloContratos \}\)/);
  assert.match(fuente, /r\.fallo/, 'el aviso de que la sincronía de atrás falló también llega');
});

// Prueba del sistema (7 oct 2026): una clienta con cuatro rentas (dos cerradas, una atrasada) veía
// «Historial de rentas» con UNA fila: la ficha solo carga los contratos abiertos. El título prometía
// el historial completo; la lista no puede cumplirlo todavía, así que dice lo que es.
test('seccionHistorial: se llama «Rentas abiertas» y dice dónde están las ya cerradas, en vez de prometer un historial completo', () => {
  const abierta = contratoDeUnCarro({ fechaSalida: '2026-10-03', dias: 9 });
  const html = seccionHistorial([abierta]);
  assert.match(html, /<h2>Rentas abiertas<\/h2>/);
  assert.match(html, /están en Contratos/);
  assert.doesNotMatch(html, /Historial de rentas/);
  assert.match(html, /P-111AAA/, 'la fila de la renta abierta sigue saliendo');
});

test('seccionHistorial: sin rentas abiertas lo dice igual que antes', () => {
  assert.match(seccionHistorial([]), /Todavía no tiene rentas abiertas\./);
});

// ---------- DPI repetido al dar de alta un cliente (H-10) ----------
//
// La misma persona dada de alta dos veces parte su historial en dos. Se avisa mientras se escribe el documento,
// nombrando a quién ya existe, y se deja guardar. Los clientes llevan la forma con la que quedan guardados
// (§7b): `documento` tal como se escribió, con espacios, y a veces los cuatro campos viejos de nombre.

const CLIENTES_GUARDADOS = [
  {
    id: 'k1', nombres: 'Juan', apellidos: 'Pérez', documento: '2345 67890 0101', licencia: 'L-445566', telefono: '5555-0000', actualizado: 1790000000000,
  },
  {
    id: 'k2', nombre1: 'María', apellido1: 'López', documento: '1111-22222-0303', telefono: '4444-7777', actualizado: 1790000000001,
  },
];

test('htmlAvisoDeDocumento: un cliente NUEVO con un DPI que ya existe dice quién es', () => {
  const html = htmlAvisoDeDocumento({ documento: '2345678900101', clientes: CLIENTES_GUARDADOS });
  assert.match(html, /Ya hay un cliente con este documento\./);
  assert.match(html, /Juan Pérez · documento 2345 67890 0101 · tel\. 5555-0000/);
  assert.match(html, /puedes guardar de todos modos/i);
});

test('htmlAvisoDeDocumento: corregir la ficha de alguien sin tocar su documento no lo marca repetido de sí mismo', () => {
  assert.equal(htmlAvisoDeDocumento({ documento: '2345 67890 0101', clientes: CLIENTES_GUARDADOS, clienteId: 'k1' }), '');
  assert.match(htmlAvisoDeDocumento({ documento: '2345 67890 0101', clientes: CLIENTES_GUARDADOS, clienteId: 'k2' }), /Ya hay otro cliente con este documento\./);
});

test('htmlAvisoDeDocumento: un documento nuevo o sin escribir no dice nada; con la lista sin leer, no afirma que no hay', () => {
  assert.equal(htmlAvisoDeDocumento({ documento: '9999 99999 9999', clientes: CLIENTES_GUARDADOS }), '');
  assert.equal(htmlAvisoDeDocumento({ documento: '', clientes: CLIENTES_GUARDADOS }), '');
  const fallo = htmlAvisoDeDocumento({ documento: '9999 99999 9999', clientes: [], falloClientes: true });
  assert.match(fallo, /No se pudo leer la lista de clientes, así que no se sabe si este documento ya está registrado\./);
});

test('la ficha del cliente tiene su lugar para el aviso pegado al campo del documento, y solo ahí', () => {
  const html = seccionesHTML({});
  const lugares = html.match(/<div id="cf-documento-repetido"[^>]*>/g) || [];
  assert.equal(lugares.length, 1);
  assert.match(lugares[0], /class="rep-aviso"/);
  assert.match(lugares[0], /role="status"/);
  assert.match(lugares[0], /\bhidden\b/);
  assert.doesNotMatch(lugares[0], /style=/);
  const etiqueta = html.match(/<label class="carro-campo">Cédula o pasaporte[\s\S]*?<\/label>/)[0];
  assert.ok(etiqueta.includes('cf-documento-repetido'), 'dentro del mismo label del documento');
  assert.equal((html.match(/-repetido"/g) || []).length, 1, 'ningún otro campo lo lleva');
});

test('la ficha avisa al escribir y al abrir, y guardar NUNCA consulta si hay repetido (no bloquea)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/clientes.js', import.meta.url), 'utf8');
  assert.match(fuente, /el\('cf-documento'\)\.addEventListener\('input', mostrarAvisoDeDocumento\)/);
  assert.match(fuente, /^\s*mostrarAvisoDeDocumento\(\);/m, 'y al abrir');
  const guardar = fuente.match(/async function guardar\(ev\) \{[\s\S]*?\n  \}\n/)[0];
  assert.doesNotMatch(guardar, /htmlAvisoDeDocumento|mostrarAvisoDeDocumento|Repetid|repetid/, 'guardar no mira si hay repetido');
  assert.doesNotMatch(fuente, /confirm\(|alert\(|showModal|<dialog/);
});
