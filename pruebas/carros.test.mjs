// Tests para la pantalla de carros: construirVehiculo() y casos críticos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  construirVehiculo, mensajesDeFalloDeCarros, htmlListaVaciaDeCarros, textoCarroNoEncontrado,
  htmlAvisoDePlacas, formularioHTML,
} from '../js/pantallas/carros.js';
import { loQueSePierdeAlBorrarElCarro, textoConfirmarBorrarElCarro } from '../js/nucleo/carro.js';

test('construirVehiculo: un carro nuevo tiene propiedad Propio y sin fuera de servicio', () => {
  const campos = {
    placas: 'P-234IFN',
    tipo: 'Sedán',
    marca: 'Kia',
    linea: 'Rio',
    color: 'Blanco',
    modelo: '2022',
  };
  const vehiculo = construirVehiculo({}, campos);
  assert.equal(vehiculo.propiedad, 'Propio');
  assert.equal(vehiculo.fueraDeServicio, undefined);
  assert.equal(vehiculo.motivoFueraDeServicio, undefined);
});

test('construirVehiculo: editar un carro fuera de servicio preserva los flags', () => {
  const carroExistente = {
    id: 'carro-1',
    codigo: 1,
    placas: 'P-234IFN',
    tipo: 'Sedán',
    marca: 'Kia',
    linea: 'Rio',
    color: 'Blanco',
    modelo: '2022',
    fueraDeServicio: true,
    motivoFueraDeServicio: 'Taller de choque',
    actualizado: Date.now(),
  };

  const camposEditados = {
    placas: 'P-234IFN-NEW', // Solo cambió las placas
  };

  const vehiculo = construirVehiculo(carroExistente, camposEditados);

  // Las placas nuevas llegan
  assert.equal(vehiculo.placas, 'P-234IFN-NEW');

  // Pero fuera de servicio se conserva
  assert.equal(vehiculo.fueraDeServicio, true);
  assert.equal(vehiculo.motivoFueraDeServicio, 'Taller de choque');

  // Y propiedad es siempre Propio
  assert.equal(vehiculo.propiedad, 'Propio');
});

test('construirVehiculo: los campos del formulario ganan sobre los viejos', () => {
  const carroExistente = {
    id: 'carro-2',
    placas: 'P-235IFN',
    color: 'Gris',
    fueraDeServicio: false,
  };

  const camposEditados = {
    placas: 'P-235IFN-NUEVO',
    color: 'Blanco',
  };

  const vehiculo = construirVehiculo(carroExistente, camposEditados);

  // Los nuevos valores ganan
  assert.equal(vehiculo.placas, 'P-235IFN-NUEVO');
  assert.equal(vehiculo.color, 'Blanco');

  // Los que no se editan se preservan
  assert.equal(vehiculo.fueraDeServicio, false);
});

test('construirVehiculo: siempre fuerza propiedad a Propio', () => {
  const carroExistente = {
    id: 'carro-3',
    propiedad: 'Propio',
  };

  const campos = {
    placas: 'P-999ZZZ',
    // Si alguien intentara pasar propiedad: 'Subarrendado', sería ignorado
  };

  const vehiculo = construirVehiculo(carroExistente, campos);
  assert.equal(vehiculo.propiedad, 'Propio');
});

// «No hay carros» y «no se pudo leer la flota» no son lo mismo (prueba del sistema, 7 oct 2026):
// con el internet caído y sin copia local, esta lista decía «Todavía no hay carros en la flota.
// Agregar el primer carro» sin ninguna barra roja; la pantalla principal sí la tiene.
test('mensajesDeFalloDeCarros: sin fallos no hay nada que decir; cada lectura caída se nombra', () => {
  assert.deepEqual(mensajesDeFalloDeCarros({}), []);
  assert.deepEqual(mensajesDeFalloDeCarros({ falloFlota: true }), [
    'No se pudo leer la flota. Puede que falten carros o que la lista esté incompleta.',
  ]);
  assert.deepEqual(mensajesDeFalloDeCarros({ falloContratos: true }), [
    'No se pudieron leer los contratos. Los estados que ves pueden estar equivocados.',
  ]);
  assert.equal(mensajesDeFalloDeCarros({ falloFlota: true, falloContratos: true }).length, 2);
});

test('htmlListaVaciaDeCarros: sin carros de verdad invita a agregar el primero; si falló la lectura, no', () => {
  const vacia = htmlListaVaciaDeCarros({ falloFlota: false });
  assert.match(vacia, /Todavía no hay carros en la flota\./);
  assert.match(vacia, /Agregar el primer carro/);
  const fallo = htmlListaVaciaDeCarros({ falloFlota: true });
  assert.match(fallo, /No se pudo leer la flota\. Intenta de nuevo o revisa la conexión\./);
  assert.ok(!/Todavía no hay carros/.test(fallo));
  assert.ok(!/Agregar el primer carro/.test(fallo));
});

test('textoCarroNoEncontrado: «no se encontró» solo si la lectura salió bien', () => {
  assert.equal(textoCarroNoEncontrado(false), 'No se encontró este carro.');
  assert.equal(textoCarroNoEncontrado(true), 'No se pudo leer la flota, así que no se sabe si este carro existe. Revisa tu conexión e intenta de nuevo.');
});

test('la pantalla de carros pasa los fallos al dibujar la lista', () => {
  const fuente = readFileSync(new URL('../js/pantallas/carros.js', import.meta.url), 'utf8');
  assert.match(fuente, /dibujarLista\(contenedor, flota, contratos, hoy, \{ falloFlota, falloContratos \}\)/);
  assert.match(fuente, /r\.fallo/);
});

// ---------- Placas repetidas en la flota (H-10) ----------
//
// Dos carros con las mismas placas parten la historia de renta en dos. Se avisa mientras se escribe, nombrando
// el carro que ya existe, y se deja guardar: la regla de «no me tires avisos» es sobre su juicio de negocio, y
// una placa repetida no es un juicio. Los carros llevan la forma con la que quedan guardados (§7b).

const FLOTA_GUARDADA = [
  {
    id: 'v1', codigo: 12, placas: 'P-234IFN', tipo: 'Pickup', marca: 'Toyota', linea: 'Hilux', color: 'Blanco', modelo: '2022', propiedad: 'Propio', actualizado: 1790000000000,
  },
  {
    id: 'v2', codigo: 13, placas: 'P-555ABC', tipo: 'Sedán', marca: 'Kia', linea: 'Rio', color: 'Gris', modelo: '2021', propiedad: 'Propio', actualizado: 1790000000001,
  },
];

test('htmlAvisoDePlacas: un carro NUEVO con placas que ya existen dice cuál carro es', () => {
  const html = htmlAvisoDePlacas({ placas: 'p-234 ifn', flota: FLOTA_GUARDADA });
  assert.match(html, /Ya hay un carro con estas placas\./);
  assert.match(html, /Carro 12 · P-234IFN · Toyota Hilux · Blanco · 2022/, 'nombra al carro: se distingue un desliz de un registro a propósito');
  assert.match(html, /puedes guardar de todos modos/i);
});

test('htmlAvisoDePlacas: editar un carro sin tocar sus placas no lo marca como repetido de sí mismo', () => {
  assert.equal(htmlAvisoDePlacas({ placas: 'P-234IFN', flota: FLOTA_GUARDADA, carroId: 'v1' }), '');
  // Pero cambiarle las placas a las de OTRO carro sí.
  assert.match(htmlAvisoDePlacas({ placas: 'P-234IFN', flota: FLOTA_GUARDADA, carroId: 'v2' }), /Ya hay otro carro con estas placas\./);
});

test('htmlAvisoDePlacas: placas nuevas, o sin escribir, no dicen nada', () => {
  assert.equal(htmlAvisoDePlacas({ placas: 'P-999ZZZ', flota: FLOTA_GUARDADA }), '');
  assert.equal(htmlAvisoDePlacas({ placas: '', flota: FLOTA_GUARDADA }), '');
});

test('htmlAvisoDePlacas: con la flota sin poder leerse, «no hay repetido» no se afirma (vacío ≠ falló)', () => {
  const html = htmlAvisoDePlacas({ placas: 'P-999ZZZ', flota: [], falloFlota: true });
  assert.match(html, /No se pudo leer la flota, así que no se sabe si estas placas ya están registradas\./);
  assert.equal(htmlAvisoDePlacas({ placas: '', flota: [], falloFlota: true }), '', 'sin placas escritas no hay nada que comprobar');
});

test('el formulario del carro tiene su lugar para el aviso, a la vista, debajo de las placas y sin estilos en línea', () => {
  const html = formularioHTML();
  const lugar = html.match(/<div id="frm-placas-repetido"[^>]*>/);
  assert.ok(lugar, 'el formulario no tiene dónde dibujar el aviso');
  assert.match(lugar[0], /class="rep-aviso"/);
  assert.match(lugar[0], /role="status"/, 'se lee en voz alta al aparecer');
  assert.match(lugar[0], /\bhidden\b/, 'oculto mientras no hay nada que decir');
  assert.doesNotMatch(lugar[0], /style=/);
  // Dentro del mismo <label> de las placas: aparece pegado al campo.
  const etiqueta = html.match(/<label class="carro-campo">Placas[\s\S]*?<\/label>/)[0];
  assert.ok(etiqueta.includes('frm-placas-repetido'));
});

test('la pantalla de carros avisa al escribir y al abrir, y guardar NUNCA consulta si hay repetido (no bloquea)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/carros.js', import.meta.url), 'utf8');
  assert.match(fuente, /el\('frm-placas'\)\.addEventListener\('input', mostrarAvisoDePlacas\)/, 'mientras se escribe');
  assert.match(fuente, /^\s*mostrarAvisoDePlacas\(\);/m, 'y al abrir, para un carro que ya repite');
  const guardar = fuente.match(/async function guardar\(ev\) \{[\s\S]*?\n  \}\n/)[0];
  assert.doesNotMatch(guardar, /htmlAvisoDePlacas|mostrarAvisoDePlacas|Repetid|repetid/, 'guardar no mira si hay repetido');
  assert.doesNotMatch(fuente, /confirm\(|alert\(|showModal|<dialog/, 'y nada es modal');
});

// ---------------------------------------------------------------------------------------------------
// Borrar un carro: lo que se pierde, y la pregunta que lo dice
// ---------------------------------------------------------------------------------------------------
// Por qué. Hasta el 26 de noviembre de 2026 no se podía borrar un carro: solo «marcar fuera de servicio».
// Un carro agregado por error se quedaba en la flota para siempre. Decisión de él: se puede borrar
// cualquiera, con historial o sin él, siempre que el aviso diga exactamente qué se pierde. Borrar es lo
// único del sistema que no se puede deshacer, así que la pregunta se mide como se mide un papel.

const CARRO = { id: 'v1', codigo: 'A-07', placas: 'P-123ABC', servicios: [] };
const cerrado = (id, carroId) => ({ id, carroId, numero: 41, cierre: { fechaReal: '2026-10-01' } });
const abierto = (id, carroId) => ({ id, carroId, numero: 42, cierre: null });

test('loQueSePierdeAlBorrarElCarro: sin carro no se pierde nada, y no revienta', () => {
  for (const nada of [null, undefined, {}]) {
    assert.deepEqual(loQueSePierdeAlBorrarElCarro(nada), { contratos: 0, reservas: 0, afuera: null, servicios: 0 });
  }
  // Y con basura en lugar de listas tampoco: esto corre justo antes de borrar, no es el lugar para reventar.
  assert.deepEqual(
    loQueSePierdeAlBorrarElCarro(CARRO, { contratos: 'x', reservas: null }),
    { contratos: 0, reservas: 0, afuera: null, servicios: 0 },
  );
});

test('loQueSePierdeAlBorrarElCarro: cuenta SOLO lo de ese carro, no lo de los demás', () => {
  const p = loQueSePierdeAlBorrarElCarro(CARRO, {
    contratos: [cerrado('c1', 'v1'), cerrado('c2', 'v9'), cerrado('c3', 'v1')],
    reservas: [{ id: 'r1', carroId: 'v1' }, { id: 'r2', carroId: 'v9' }],
  });
  assert.equal(p.contratos, 2, 'los dos de v1, no el de v9');
  assert.equal(p.reservas, 1);
});

test('loQueSePierdeAlBorrarElCarro: una reservación ya entregada o cancelada NO cuenta', () => {
  // Solo las pendientes se quedan sin carro; las otras ya se resolvieron. La regla no se repite aquí:
  // es `estadoReserva` (nucleo/reserva.js), la misma que usa todo lo demás.
  const p = loQueSePierdeAlBorrarElCarro(CARRO, {
    reservas: [
      { id: 'r1', carroId: 'v1' },
      { id: 'r2', carroId: 'v1', contratoId: 'c9' },
      { id: 'r3', carroId: 'v1', cancelada: true },
    ],
  });
  assert.equal(p.reservas, 1, 'solo la pendiente');
});

test('loQueSePierdeAlBorrarElCarro: dice si el carro está AFUERA ahora mismo', () => {
  const con = loQueSePierdeAlBorrarElCarro(CARRO, { contratos: [cerrado('c1', 'v1'), abierto('c2', 'v1')] });
  assert.equal(con.afuera?.id, 'c2', 'el que no ha regresado');
  const sin = loQueSePierdeAlBorrarElCarro(CARRO, { contratos: [cerrado('c1', 'v1')] });
  assert.equal(sin.afuera, null);
});

test('loQueSePierdeAlBorrarElCarro: cuenta los servicios anotados, que viven dentro del carro', () => {
  const p = loQueSePierdeAlBorrarElCarro({ ...CARRO, servicios: [{ id: 's1' }, { id: 's2' }] });
  assert.equal(p.servicios, 2);
});

test('textoConfirmarBorrarElCarro: nombra el carro y dice que no se puede deshacer', () => {
  const t = textoConfirmarBorrarElCarro(CARRO, loQueSePierdeAlBorrarElCarro(CARRO));
  assert.match(t, /A-07/, 'el código');
  assert.match(t, /P-123ABC/, 'y las placas: borrar el carro equivocado no se arregla');
  assert.match(t, /no se puede deshacer/i);
});

test('textoConfirmarBorrarElCarro: con historial dice que los contratos NO se borran, y qué sí se pierde', () => {
  // Es la duda que de verdad tendría: «¿se me van los contratos?». La respuesta es no, y tiene que estar
  // escrita antes de apretar, no después.
  const carro = { ...CARRO, servicios: [{ id: 's1' }] };
  const p = loQueSePierdeAlBorrarElCarro(carro, {
    contratos: [cerrado('c1', 'v1'), cerrado('c2', 'v1')],
    reservas: [{ id: 'r1', carroId: 'v1' }],
  });
  const t = textoConfirmarBorrarElCarro(carro, p);
  assert.match(t, /2 contratos/);
  assert.match(t, /NO se borran/, 'lo que no se pierde');
  assert.match(t, /kilometraje y el mantenimiento/, 'lo que sí se pierde');
  assert.match(t, /1 servicio anotado/, 'en singular cuando es uno');
  assert.match(t, /1 reservación pendiente queda/, 'y la reservación que se queda colgada');
});

test('textoConfirmarBorrarElCarro: si el carro está AFUERA, eso va primero y con OJO', () => {
  const p = loQueSePierdeAlBorrarElCarro(CARRO, { contratos: [abierto('c2', 'v1')] });
  const t = textoConfirmarBorrarElCarro(CARRO, p);
  assert.match(t, /OJO: este carro está AFUERA ahora mismo, rentado en el contrato N\.° 42/);
  assert.ok(t.indexOf('OJO') < t.indexOf('contrato.'), 'antes que el resto del detalle');
});

test('textoConfirmarBorrarElCarro: sin historial no inventa pérdidas que no hay', () => {
  const t = textoConfirmarBorrarElCarro(CARRO, loQueSePierdeAlBorrarElCarro(CARRO));
  assert.doesNotMatch(t, /contrato/i, 'no habla de contratos si no tiene');
  assert.doesNotMatch(t, /servicio/i);
  assert.doesNotMatch(t, /reservaci/i);
  assert.doesNotMatch(t, /OJO/);
});
