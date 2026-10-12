// Pruebas de «lo que ya existe»: placas repetidas en la flota y DPI repetido al dar de alta un cliente
// (H-10, prueba del sistema del 7 oct 2026).
//
// Dos carros con las mismas placas, o la misma persona dos veces, parten el historial de renta en dos y
// él no sabe cuál registro es el de verdad. Pero él tiene una regla clara contra los avisos
// («yo pongo el precio que yo quiera, así que no me tires avisos»), y esa regla es sobre su JUICIO de
// negocio: precio, días, riesgo. Una placa repetida no es un juicio, es casi seguro un desliz. Por eso esto
// DICE, nombrando lo que ya existe para que él distinga un error de un registro hecho a propósito, y
// NUNCA bloquea: estas funciones solo devuelven el aviso, y quien guarda no las consulta.
//
// Los carros y los clientes de prueba llevan la forma con la que de verdad quedan guardados (§7b del
// diseño): el carro con su `codigo` correlativo (un número) y `propiedad: 'Propio'`; el cliente con
// `nombres`/`apellidos` (o los cuatro campos viejos) y el `documento` tal como se escribió, con espacios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlAvisoRepetido } from '../js/ui.js';
import {
  claveDeNumero, carrosConLasMismasPlacas, clientesConElMismoDocumento,
  avisoDeCarroRepetido, avisoDeClienteRepetido,
} from '../js/nucleo/repetidos.js';

const hilux = {
  id: 'v1', codigo: 12, placas: 'P-234IFN', tipo: 'Pickup', marca: 'Toyota', linea: 'Hilux', color: 'Blanco', modelo: '2022', propiedad: 'Propio', actualizado: 1790000000000,
};
const kia = {
  id: 'v2', codigo: 13, placas: 'P-555ABC', tipo: 'Sedán', marca: 'Kia', linea: 'Rio', color: 'Gris', modelo: '2021', propiedad: 'Propio', actualizado: 1790000000001,
};
const flota = [hilux, kia];

// ---------- claveDeNumero ----------

test('claveDeNumero: la misma placa o documento escrito de otra forma da la misma clave', () => {
  assert.equal(claveDeNumero('P-234IFN'), 'p234ifn');
  assert.equal(claveDeNumero(' p 234 ifn '), 'p234ifn', 'minúsculas y espacios');
  assert.equal(claveDeNumero('P234-IFN'), 'p234ifn', 'guion en otro lugar');
  assert.equal(claveDeNumero('2345 67890 0101'), '2345678900101', 'el DPI en bloques');
  assert.equal(claveDeNumero('2345-67890-0101'), '2345678900101');
});

test('claveDeNumero: lo que no es un número de verdad no tiene clave (así no se compara)', () => {
  assert.equal(claveDeNumero(''), '');
  assert.equal(claveDeNumero(undefined), '');
  assert.equal(claveDeNumero(null), '');
  assert.equal(claveDeNumero('   '), '');
  assert.equal(claveDeNumero('---'), '');
  // Quien no tiene documento a veces escribe «N/A» o «ninguno»: dos así no son la misma persona. Un número
  // de placa, de DPI o de pasaporte siempre trae al menos un dígito.
  assert.equal(claveDeNumero('N/A'), '');
  assert.equal(claveDeNumero('ninguno'), '');
  assert.equal(claveDeNumero('sin placas'), '');
});

// ---------- carrosConLasMismasPlacas ----------

test('carrosConLasMismasPlacas: encuentra el carro con las mismas placas, escritas como sea', () => {
  assert.deepEqual(carrosConLasMismasPlacas('P-234IFN', flota).map((c) => c.id), ['v1']);
  assert.deepEqual(carrosConLasMismasPlacas('p234 ifn', flota).map((c) => c.id), ['v1'], 'minúsculas, sin guion, con espacio');
});

test('carrosConLasMismasPlacas: otras placas, o ninguna escrita, no encuentran nada', () => {
  assert.deepEqual(carrosConLasMismasPlacas('P-999ZZZ', flota), []);
  assert.deepEqual(carrosConLasMismasPlacas('', flota), []);
  assert.deepEqual(carrosConLasMismasPlacas('   ', flota), []);
  assert.deepEqual(carrosConLasMismasPlacas(undefined, flota), []);
});

test('carrosConLasMismasPlacas: editando un carro, él mismo no cuenta como repetido', () => {
  assert.deepEqual(carrosConLasMismasPlacas('P-234IFN', flota, { exceptoId: 'v1' }), []);
  // Pero si OTRO ya tiene esas placas (cambió las placas del Kia a las de la Hilux), sí.
  assert.deepEqual(carrosConLasMismasPlacas('P-234IFN', flota, { exceptoId: 'v2' }).map((c) => c.id), ['v1']);
});

test('carrosConLasMismasPlacas: devuelve TODOS los que ya las tienen, y los carros sin placas nunca coinciden entre sí', () => {
  const sucia = [hilux, { ...hilux, id: 'v3', codigo: 14 }, { id: 'v4', codigo: 15, placas: '' }, { id: 'v5', codigo: 16 }];
  assert.deepEqual(carrosConLasMismasPlacas('P-234IFN', sucia).map((c) => c.id), ['v1', 'v3']);
  assert.deepEqual(carrosConLasMismasPlacas('', sucia), [], 'dos carros sin placas no son el mismo carro');
});

test('carrosConLasMismasPlacas: una flota que no es una lista no revienta', () => {
  assert.deepEqual(carrosConLasMismasPlacas('P-234IFN', undefined), []);
  assert.deepEqual(carrosConLasMismasPlacas('P-234IFN', null), []);
});

// ---------- avisoDeCarroRepetido ----------

test('avisoDeCarroRepetido: sin repetido no hay aviso (nada que decir, nada que hacer)', () => {
  assert.equal(avisoDeCarroRepetido({ placas: 'P-999ZZZ', flota }), null);
  assert.equal(avisoDeCarroRepetido({ placas: '', flota }), null);
  assert.equal(avisoDeCarroRepetido({ placas: 'P-234IFN', flota, exceptoId: 'v1' }), null, 'editando el mismo carro');
});

test('avisoDeCarroRepetido: nombra QUÉ carro ya existe, para distinguir un desliz de un registro a propósito', () => {
  const aviso = avisoDeCarroRepetido({ placas: 'p234ifn', flota });
  assert.equal(aviso.titulo, 'Ya hay un carro con estas placas.');
  assert.deepEqual(aviso.filas, ['Carro 12 · P-234IFN · Toyota Hilux · Blanco · 2022']);
  assert.match(aviso.pie, /puedes guardar de todos modos/i, 'dice que puede seguir: no bloquea');
});

test('avisoDeCarroRepetido: un carro que ya está fuera de servicio lo dice (ayuda a ver si es el viejo)', () => {
  const fuera = { ...hilux, fueraDeServicio: true, motivoFueraDeServicio: 'Taller de choque' };
  const aviso = avisoDeCarroRepetido({ placas: 'P-234IFN', flota: [fuera, kia] });
  assert.deepEqual(aviso.filas, ['Carro 12 · P-234IFN · Toyota Hilux · Blanco · 2022 · fuera de servicio']);
});

test('avisoDeCarroRepetido: varios carros, uno por renglón y el título en plural', () => {
  const aviso = avisoDeCarroRepetido({ placas: 'P-234IFN', flota: [hilux, { ...hilux, id: 'v3', codigo: 14, color: 'Negro' }, kia] });
  assert.equal(aviso.titulo, 'Ya hay 2 carros con estas placas.');
  assert.equal(aviso.filas.length, 2);
  assert.match(aviso.filas[1], /^Carro 14 · .*Negro/);
});

test('avisoDeCarroRepetido: editando, dice «otro carro»; y un carro sin datos no deja renglones raros', () => {
  const aviso = avisoDeCarroRepetido({ placas: 'P-234IFN', flota, exceptoId: 'v2' });
  assert.equal(aviso.titulo, 'Ya hay otro carro con estas placas.');
  const pelon = avisoDeCarroRepetido({ placas: 'P-1', flota: [{ id: 'z', placas: 'P-1' }] });
  assert.deepEqual(pelon.filas, ['P-1'], 'sin código, marca ni color: solo las placas, sin puntos sueltos ni «undefined»');
});

test('editando un registro que ya repite a otro, el pie no le pide «registrarlo» de nuevo: dice que ya está repetido', () => {
  const carro = avisoDeCarroRepetido({ placas: 'P-234IFN', flota, exceptoId: 'v2' });
  assert.equal(carro.pie, 'Si es el mismo carro, ya está registrado dos veces; si es otro, puedes guardar de todos modos.');
  const nuevo = avisoDeCarroRepetido({ placas: 'P-234IFN', flota });
  assert.match(nuevo.pie, /no hace falta registrarlo dos veces/);
  const cliente = avisoDeClienteRepetido({ documento: '2345 67890 0101', clientes, exceptoId: 'k2' });
  assert.match(cliente.pie, /ya está registrada dos veces/);
  assert.match(cliente.pie, /puedes guardar de todos modos/i);
  assert.match(avisoDeClienteRepetido({ documento: '2345 67890 0101', clientes }).pie, /búscala en la lista/);
});

test('avisoDeCarroRepetido: si la flota no se pudo leer y no hay coincidencia, NO calla (vacío ≠ falló)', () => {
  const aviso = avisoDeCarroRepetido({ placas: 'P-999ZZZ', flota: [], noSePudoLeer: true });
  assert.match(aviso.titulo, /No se pudo leer la flota/);
  assert.match(aviso.titulo, /no se sabe si estas placas ya están registradas/);
  assert.deepEqual(aviso.filas, []);
  // Sin placas escritas no hay nada que comprobar, así que tampoco hay nada que decir.
  assert.equal(avisoDeCarroRepetido({ placas: '', flota: [], noSePudoLeer: true }), null);
  // Y si con lo que se alcanzó a leer SÍ hay una coincidencia, se nombra: eso ya se sabe.
  assert.equal(avisoDeCarroRepetido({ placas: 'P-234IFN', flota, noSePudoLeer: true }).titulo, 'Ya hay un carro con estas placas.');
});

// ---------- clientesConElMismoDocumento ----------

const juan = {
  id: 'k1', nombres: 'Juan', apellidos: 'Pérez', documento: '2345 67890 0101', licencia: 'L-445566', telefono: '5555-0000', actualizado: 1790000000000,
};
const viejo = {
  id: 'k2', nombre1: 'María', apellido1: 'López', apellido2: 'Soto', documento: '1111-22222-0303', telefono: '4444-7777', actualizado: 1790000000001,
};
const clientes = [juan, viejo];

test('clientesConElMismoDocumento: el mismo DPI en bloques, con guiones o junto, es la misma persona', () => {
  assert.deepEqual(clientesConElMismoDocumento('2345 67890 0101', clientes).map((c) => c.id), ['k1']);
  assert.deepEqual(clientesConElMismoDocumento('2345678900101', clientes).map((c) => c.id), ['k1']);
  assert.deepEqual(clientesConElMismoDocumento('2345-67890-0101', clientes).map((c) => c.id), ['k1']);
  assert.deepEqual(clientesConElMismoDocumento('1111 22222 0303', clientes).map((c) => c.id), ['k2'], 'también el de un cliente de la forma vieja');
});

test('clientesConElMismoDocumento: otro DPI, vacío o «N/A» no encuentran a nadie; editando, él mismo no cuenta', () => {
  assert.deepEqual(clientesConElMismoDocumento('9999 99999 9999', clientes), []);
  assert.deepEqual(clientesConElMismoDocumento('', clientes), []);
  assert.deepEqual(clientesConElMismoDocumento('N/A', [{ ...juan, documento: 'N/A' }, { ...viejo, documento: 'N/A' }]), []);
  assert.deepEqual(clientesConElMismoDocumento('2345 67890 0101', clientes, { exceptoId: 'k1' }), []);
  assert.deepEqual(clientesConElMismoDocumento('2345 67890 0101', undefined), []);
});

// ---------- avisoDeClienteRepetido ----------

test('avisoDeClienteRepetido: nombra a QUIÉN ya existe: nombre, documento tal como lo escribió y teléfono', () => {
  const aviso = avisoDeClienteRepetido({ documento: '2345678900101', clientes });
  assert.equal(aviso.titulo, 'Ya hay un cliente con este documento.');
  assert.deepEqual(aviso.filas, ['Juan Pérez · documento 2345 67890 0101 · tel. 5555-0000']);
  assert.match(aviso.pie, /historial/, 'dice por qué importa: el historial queda partido en dos');
  assert.match(aviso.pie, /puedes guardar de todos modos/i, 'y que no bloquea');
});

test('avisoDeClienteRepetido: un cliente de la forma vieja se nombra bien, y sin teléfono no deja «tel.» vacío', () => {
  const aviso = avisoDeClienteRepetido({ documento: '1111 22222 0303', clientes: [{ ...viejo, telefono: '' }] });
  assert.deepEqual(aviso.filas, ['María López Soto · documento 1111-22222-0303']);
  const sinNombre = avisoDeClienteRepetido({ documento: '1111 22222 0303', clientes: [{ id: 'k9', documento: '1111-22222-0303' }] });
  assert.deepEqual(sinNombre.filas, ['Cliente sin nombre · documento 1111-22222-0303']);
});

test('avisoDeClienteRepetido: sin repetido, vacío o editando al mismo cliente, no hay aviso', () => {
  assert.equal(avisoDeClienteRepetido({ documento: '9999 99999 9999', clientes }), null);
  assert.equal(avisoDeClienteRepetido({ documento: '', clientes }), null);
  assert.equal(avisoDeClienteRepetido({ documento: '2345 67890 0101', clientes, exceptoId: 'k1' }), null);
});

test('avisoDeClienteRepetido: varios, en plural, y si la lista no se pudo leer y no hay coincidencia, no calla', () => {
  const dos = avisoDeClienteRepetido({ documento: '2345 67890 0101', clientes: [juan, { ...juan, id: 'k3', nombres: 'Juana' }] });
  assert.equal(dos.titulo, 'Ya hay 2 clientes con este documento.');
  assert.equal(dos.filas.length, 2);

  const fallo = avisoDeClienteRepetido({ documento: '9999 99999 9999', clientes: [], noSePudoLeer: true });
  assert.match(fallo.titulo, /No se pudo leer la lista de clientes/);
  assert.match(fallo.titulo, /no se sabe si este documento ya está registrado/);
  assert.equal(avisoDeClienteRepetido({ documento: '', clientes: [], noSePudoLeer: true }), null);
});

test('un aviso es solo información: nada en él puede leerse como una prohibición', () => {
  const avisos = [
    avisoDeCarroRepetido({ placas: 'P-234IFN', flota }),
    avisoDeClienteRepetido({ documento: '2345 67890 0101', clientes }),
  ];
  for (const aviso of avisos) {
    const texto = [aviso.titulo, ...aviso.filas, aviso.pie].join(' ');
    assert.doesNotMatch(texto, /no (se )?(puede|permite)|prohib|bloque|error|inválid|incorrect/i, texto);
    assert.deepEqual(Object.keys(aviso).sort(), ['filas', 'pie', 'titulo'], 'solo texto: ningún campo que haga a nadie impedir un guardado');
  }
});

// ---------- El aspecto: ámbar, sin estilos en línea y cada clase definida en la hoja ----------
//
// Mismo criterio que las pantallas de dinero y de recibir carro: una clase que no existe no avisa, el estilo
// simplemente no se aplica; y un aviso que se ve rojo o encima de todo ya no es «información».

const CSS_SIN_COMENTARIOS = readFileSync(new URL('../css/estilos.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('cada clase rep-* que se dibuja está definida en css/estilos.css, y ninguna definida ahí sobra', () => {
  const html = htmlAvisoRepetido({ titulo: 'Ya hay un carro con estas placas.', filas: ['Carro 12 · P-234IFN'], pie: 'Puedes guardar de todos modos.' });
  const usadas = new Set();
  // El lugar donde se dibuja (rep-aviso) lo trae cada formulario; aquí se dibuja su contenido.
  usadas.add('rep-aviso');
  for (const [, valor] of html.matchAll(/class="([^"]*)"/g)) for (const c of valor.split(/\s+/)) if (c.startsWith('rep-')) usadas.add(c);
  assert.deepEqual([...usadas].sort(), ['rep-aviso', 'rep-filas', 'rep-pie', 'rep-titulo']);
  for (const clase of usadas) {
    assert.match(CSS_SIN_COMENTARIOS, new RegExp(`\\.${clase}(?![\\w-])`), `.${clase} se dibuja y no está en el CSS`);
  }
  const definidas = new Set([...CSS_SIN_COMENTARIOS.matchAll(/\.(rep-[a-z0-9-]+)/g)].map((m) => m[1]));
  for (const clase of definidas) assert.ok(usadas.has(clase), `.${clase} está en el CSS y nadie la usa`);
  assert.doesNotMatch(html, /style\s*=/);
});

test('el aviso se ve ámbar (el mismo de los avisos de nivel medio), no rojo: no es un error ni un bloqueo', () => {
  const regla = CSS_SIN_COMENTARIOS.match(/\.rep-aviso\s*\{([^}]*)\}/)[1];
  assert.match(regla, /background:\s*#fff6e0/);
  assert.match(regla, /color:\s*#8a5b00/);
  assert.doesNotMatch(regla, /var\(--rojo\)|position:\s*(fixed|absolute)/, 'ni rojo ni flotando encima de nada');
});
