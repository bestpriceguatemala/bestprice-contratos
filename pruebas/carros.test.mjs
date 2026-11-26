// Tests para la pantalla de carros: construirVehiculo() y casos críticos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  construirVehiculo, mensajesDeFalloDeCarros, htmlListaVaciaDeCarros, textoCarroNoEncontrado,
  htmlAvisoDePlacas, formularioHTML,
} from '../js/pantallas/carros.js';
import {
  loQueSePierdeAlBorrarElCarro, textoConfirmarBorrarElCarro, carrosAjenosUsados,
} from '../js/nucleo/carro.js';

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
  // «se pierden 1 servicio» se leyó en pantalla el 26 de noviembre de 2026: el singular es del verbo
  // también, no solo del sustantivo.
  assert.match(t, /También se pierde 1 servicio anotado\./, 'el VERBO también va en singular');
  assert.doesNotMatch(t, /se pierden 1 /);
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

// ---------------------------------------------------------------------------------------------------
// Los carros ajenos (subarrendados) que ya se usaron
// ---------------------------------------------------------------------------------------------------
// Decisión suya del 26 de noviembre de 2026: «que no me estorben con mi flotilla pero que se queden
// guardados para cualquier ocasión». No se guardan en ninguna colección nueva: se sacan de los contratos,
// que es donde un carro ajeno vive desde siempre.

const ajeno = (placas, campos = {}, contrato = {}) => ({
  id: `c-${placas}`,
  fechaSalida: '2026-05-01',
  carroAjeno: { placas, tipo: 'Sedán', marca: 'Toyota', color: 'Gris', modelo: '2020', dueno: 'Don Beto', ...campos },
  duenoId: 'd-beto',
  ...contrato,
});

test('carrosAjenosUsados: sin contratos, sin nada, y no revienta con basura', () => {
  for (const nada of [undefined, null, [], 'x', {}]) {
    assert.deepEqual(carrosAjenosUsados(nada), []);
  }
});

test('carrosAjenosUsados: un contrato de carro PROPIO no aporta ningún ajeno', () => {
  const propios = [{ id: 'c1', carroId: 'v1', carroPlacas: 'P-111AAA', carroAjeno: null }];
  assert.deepEqual(carrosAjenosUsados(propios), []);
});

test('carrosAjenosUsados: el mismo carro en tres contratos sale UNA vez', () => {
  const lista = carrosAjenosUsados([ajeno('P-222BBB'), ajeno('P-222BBB'), ajeno('P-222BBB')]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].placas, 'P-222BBB');
});

test('carrosAjenosUsados: las mismas placas escritas distinto son EL MISMO carro', () => {
  // Él las escribe «P-222BBB», «p 222 bbb» y «P222BBB» el mismo mes. Si cada forma fuera un carro distinto,
  // la lista se llenaría de duplicados del mismo vehículo y dejaría de servir.
  const lista = carrosAjenosUsados([ajeno('P-222BBB'), ajeno('p 222 bbb'), ajeno('P222BBB')]);
  assert.equal(lista.length, 1, 'uno solo');
});

test('carrosAjenosUsados: gana el contrato MÁS NUEVO, no el primero que apareció', () => {
  // Si el dueño del carro cambió, lo que se ofrece tiene que ser el último que se vio: ofrecer el viejo
  // haría que el pago del subarriendo se le anote a quien ya no es.
  const lista = carrosAjenosUsados([
    ajeno('P-333CCC', { dueno: 'Don Beto' }, { fechaSalida: '2026-01-10', duenoId: 'd-beto' }),
    ajeno('P-333CCC', { dueno: 'Doña Mila' }, { fechaSalida: '2026-09-20', duenoId: 'd-mila' }),
  ]);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].dueno, 'Doña Mila', 'el del contrato más nuevo');
  assert.equal(lista[0].duenoId, 'd-mila');
});

test('carrosAjenosUsados: el más usado recientemente va primero', () => {
  const lista = carrosAjenosUsados([
    ajeno('P-111AAA', {}, { fechaSalida: '2026-02-01' }),
    ajeno('P-333CCC', {}, { fechaSalida: '2026-11-01' }),
    ajeno('P-222BBB', {}, { fechaSalida: '2026-07-01' }),
  ]);
  assert.deepEqual(lista.map((c) => c.placas), ['P-333CCC', 'P-222BBB', 'P-111AAA']);
});

test('carrosAjenosUsados: trae lo que hace falta para rellenar el formulario, y NO el costo por día', () => {
  // El costo por día vive detrás de la contraseña de dinero (`subarriendo`), y esta lista se arma en el
  // mostrador. Traerlo aquí lo sacaría de donde está guardado a propósito.
  const [c] = carrosAjenosUsados([ajeno('P-444DDD', {}, { subarriendo: { costoDia: 250 } })]);
  assert.deepEqual(Object.keys(c).sort(), ['color', 'dueno', 'duenoId', 'marca', 'modelo', 'placas', 'tipo']);
  assert.equal(c.marca, 'Toyota');
  assert.equal(c.dueno, 'Don Beto');
});

test('carrosAjenosUsados: un ajeno sin una placa de VERDAD no entra', () => {
  // La misma regla que para la flota (`claveDeNumero`): una placa siempre trae al menos un dígito. Dos
  // carros «sin placas» o dos «N/A» no son el mismo carro, así que no se agrupan ni se ofrecen.
  assert.deepEqual(carrosAjenosUsados([ajeno(''), ajeno('   '), ajeno('N/A'), ajeno('ninguno')]), []);
});

test('todo modificador «btn-…» que el programa usa existe en el CSS', () => {
  // El fallo, tal como pasó: al agregar «Borrar carro» le puse `class="btn btn-peligro"` y esa clase no
  // existía en ninguna hoja de estilo. El botón salía EXACTAMENTE igual al de «Cancelar» que está a su
  // lado — en lo único del sistema que no se puede deshacer. Ninguna prueba lo vio porque node no mira el
  // CSS, y la suite entera pasaba en verde.
  //
  // Se vigilan solo los modificadores `btn-*` a propósito: son los que cambian cómo se VE un botón, y un
  // botón que se ve como otro es el error que de verdad hace daño. (26 de noviembre de 2026.)
  const raizJs = new URL('../js/', import.meta.url);
  const archivos = [];
  (function recorrer(dir) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = new URL(`${entrada.name}${entrada.isDirectory() ? '/' : ''}`, dir);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith('.js')) archivos.push(ruta);
    }
  })(raizJs);

  const hojas = ['estilos.css', 'contrato-papel.css', 'respaldo.css']
    .map((n) => readFileSync(new URL(`../css/${n}`, import.meta.url), 'utf8')).join('\n');
  const definidos = new Set([...hojas.matchAll(/\.(btn-[a-zA-Z0-9_-]+)/g)].map((m) => m[1]));
  assert.ok(definidos.has('btn-primario'), `la prueba tiene que estar leyendo el CSS de verdad (encontró ${definidos.size} modificadores)`);

  const sinEstilo = new Map();
  for (const ruta of archivos) {
    for (const m of readFileSync(ruta, 'utf8').matchAll(/class=\\?["']([^"'\\]*)/g)) {
      for (const clase of m[1].split(/\s+/)) {
        if (!clase.startsWith('btn-') || clase.includes('${') || definidos.has(clase)) continue;
        sinEstilo.set(clase, [...(sinEstilo.get(clase) ?? []), ruta.pathname.split('/js/')[1]]);
      }
    }
  }
  assert.deepEqual([...sinEstilo.keys()], [],
    `un botón con una clase que el CSS no define se ve igual que el de al lado:\n${[...sinEstilo].map(([c, r]) => `  ${c} <- ${r.join(', ')}`).join('\n')}`);
});

test('el «?v=» de las hojas de estilo es el contenido de las hojas, no un número a mano', () => {
  // El fallo, tal como pasó: `index.html` pedía `css/estilos.css?v=1` y ese «1» no había cambiado nunca.
  // Al agregar la clase del botón de borrar, el archivo en disco la tenía y el navegador seguía pintando
  // el botón igual al de «Cancelar», porque servía la hoja vieja de su caché. En GitHub Pages eso dura
  // hasta que se le vence la caché; publicar y «no ver el cambio» es exactamente esto.
  //
  // Con el `?v=` atado al CONTENIDO, cambiar el CSS y olvidar esto pone roja esta prueba y dice qué pegar.
  // (26 de noviembre de 2026.)
  const hojas = ['estilos.css', 'contrato-papel.css', 'respaldo.css'];
  const h = createHash('sha256');
  for (const n of hojas) h.update(readFileSync(new URL(`../css/${n}`, import.meta.url)));
  const esperado = h.digest('hex').slice(0, 8);

  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const n of hojas) {
    const m = new RegExp(`href="css/${n.replace('.', '\\.')}\\?v=([a-z0-9]+)"`).exec(html);
    assert.ok(m, `index.html tiene que pedir css/${n} con un ?v=`);
    assert.equal(m[1], esperado,
      `cambió el CSS: en index.html, poné ?v=${esperado} en las TRES hojas (hoy dice ?v=${m[1]} en ${n})`);
  }
});

test('textoConfirmarBorrarElCarro: con VARIOS servicios el verbo va en plural', () => {
  const carro = { ...CARRO, servicios: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] };
  const t = textoConfirmarBorrarElCarro(carro, loQueSePierdeAlBorrarElCarro(carro, { contratos: [cerrado('c1', 'v1')] }));
  assert.match(t, /También se pierden 3 servicios anotados\./);
});
