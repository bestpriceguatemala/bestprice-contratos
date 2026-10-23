// El respaldo armado de punta a punta: datos del sistema (de los constructores de verdad) + su plantilla = un .xlsx
// que se vuelve a leer celda por celda.
//
// Aquí está lo que el dueño más teme: «un respaldo que pone el DPI en la columna de la licencia es peor que ninguno».
// Cada columna que el respaldo escribe se comprueba contra el campo de §7b del que sale, y cada columna que NO tiene
// campo se comprueba vacía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { armarRespaldo, ErrorDeRespaldo } from '../js/respaldo/excel.js';
import { serialDeFecha, fraccionDeHora, escribirCeldas } from '../js/respaldo/hojas.js';
import { leerZip, escribirZip } from '../js/respaldo/zip.js';
import { hojasDelLibro, xmlDe, ponerXml } from '../js/respaldo/libro.js';
import { abrirLibro, leerPlantilla } from './fixtures/leerLibro.mjs';
import * as F from './fixtures/datosParaRespaldo.mjs';
import { construirCierre } from '../js/nucleo/cierre.js';
import { yaVolvio } from '../js/nucleo/estados.js';

const armar = (cambios = {}) => armarRespaldo({
  plantilla: leerPlantilla(),
  anio: 2026,
  hoy: '2026-10-12',
  clientes: F.clientes(),
  vehiculos: F.vehiculos(),
  contratos: [...F.contratosDe2026(), F.deOtroAnio()],
  pagosDueno: F.pagosDueno(),
  ...cambios,
});

let cache;
const respaldo = async () => {
  if (!cache) {
    const r = await armar();
    cache = { ...r, libro: await abrirLibro(r.bytes) };
  }
  return cache;
};

const fila = (numero) => ({ 101: 6, 102: 7, 103: 8, 104: 9, 105: 10, 106: 11, 107: 12, 108: 13 })[numero];

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------

test('CLIENTES: cada campo del cliente cae en SU columna (el DPI en la de documento, la licencia en la de licencia)', async () => {
  const { libro } = await respaldo();
  // Orden alfabético por apellidos: Aguilar (3), Álvarez (4), Barrios (5), López (6). El código de su hoja es la fila menos 2.
  const t = libro.textos('CLIENTES', ['B6', 'C6', 'D6', 'E6', 'F6', 'H6', 'I6', 'K6', 'L6', 'N6', 'O6', 'R6', 'S6', 'T6', 'U6', 'V6', 'W6', 'X6']);
  assert.deepEqual(t, {
    B6: 'López de Pérez',
    C6: null,
    D6: 'María del Carmen',
    E6: null,
    F6: 'Guatemalteca',
    H6: 'DPI 0000 00001 0101',
    I6: 'Guatemala',
    K6: 'LIC-PRUEBA-0001',
    L6: 'Mixco',
    N6: '5a avenida 10-20 zona 1, frente al parque',
    O6: 'Guatemala',
    R6: '5555-0001',
    S6: 'prueba1@example.com',
    T6: 'Km 14 carretera a El Salvador',
    U6: 'Santa Catarina Pinula',
    V6: 'Guatemala',
    W6: 'Guatemala',
    X6: '5555-0002',
  });
});

test('CLIENTES: las fechas son fechas de Excel (nacimiento, vencimiento del documento y de la licencia), no texto', async () => {
  const { libro } = await respaldo();
  assert.equal(libro.numero('CLIENTES', 'G6'), serialDeFecha('1985-02-09'));
  assert.equal(libro.numero('CLIENTES', 'J6'), serialDeFecha('2030-02-09'));
  assert.equal(libro.numero('CLIENTES', 'M6'), serialDeFecha('2029-06-30'));
  assert.match(libro.xml('CLIENTES'), /<c r="G6" s="\d+"><v>31087<\/v><\/c>/);
});

test('CLIENTES: la licenciaEmision vieja (una fecha) NO se mete en LUGAR EMISION: esa columna es el lugar', async () => {
  const { libro } = await respaldo();
  assert.equal(libro.texto('CLIENTES', 'L6'), 'Mixco');
});

test('CLIENTES: en orden alfabético, y un cliente de la forma vieja de cuatro campos se lee bien', async () => {
  const { libro } = await respaldo();
  assert.deepEqual(libro.textos('CLIENTES', ['B3', 'D3', 'H3']), { B3: 'Aguilar Montes', D3: 'Zacarías José', H3: 'DPI 0000 00003 0101' });
  assert.equal(libro.texto('CLIENTES', 'B4'), 'Álvarez Zelaya');
  assert.equal(libro.texto('CLIENTES', 'B5'), 'Barrios');
  assert.equal(libro.texto('CLIENTES', 'B7'), null, 'después del último cliente no queda nada');
});

test('CLIENTES: un cliente que nunca rentó este año también va (la hoja es la base de clientes para rentar esa tarde)', async () => {
  const { libro, cuenta } = await respaldo();
  assert.equal(cuenta.clientes, 4);
  assert.equal(libro.texto('CLIENTES', 'R5'), '5555-0005');
});

// ---------------------------------------------------------------------------
// VEHICULOS
// ---------------------------------------------------------------------------

test('VEHICULOS: cada carro va en la fila de SU código del sistema (código 4 → fila 6) y el hueco del código 3 queda vacío', async () => {
  const { libro } = await respaldo();
  assert.deepEqual(libro.textos('VEHICULOS', ['B3', 'C3', 'D3', 'E3', 'G3', 'H3']), {
    B3: 'P-111AAA', C3: 'Pick up', D3: 'Toyota Hilux', E3: 'Blanco', G3: 'PROPIO', H3: null,
  });
  assert.equal(libro.numero('VEHICULOS', 'F3'), 2024, 'el modelo es un número, como en su hoja');
  assert.equal(libro.texto('VEHICULOS', 'B4'), 'P-222BBB');
  assert.equal(libro.texto('VEHICULOS', 'B5'), null, 'no hay carro 3');
  assert.deepEqual(libro.textos('VEHICULOS', ['B6', 'C6', 'D6']), { B6: 'P-444DDD', C6: 'Sedán', D6: 'Kia Rio' });
});

test('VEHICULOS: la columna CODIGO (A) sigue siendo la fórmula de su hoja que cuenta sola', async () => {
  const { libro } = await respaldo();
  assert.match(libro.xml('VEHICULOS'), /<c r="A4" s="\d+"><f t="shared"[^>]*>A3\+1<\/f>/);
});

test('un carro sin código utilizable toma la primera fila libre y se AVISA, no se calla', async () => {
  const sinCodigo = { id: 'v-sin', placas: 'P-555EEE', tipo: 'Sedán', marca: 'Honda', linea: 'Civic' };
  const r = await armar({ vehiculos: [...F.vehiculos(), sinCodigo] });
  assert.ok(r.avisos.some((a) => /P-555EEE/.test(a) && /código/.test(a)), r.avisos.join(' | '));
  const libro = await abrirLibro(r.bytes);
  assert.equal(libro.texto('VEHICULOS', 'B5'), 'P-555EEE', 'cayó en el hueco del código 3');
});

test('más carros de los que caben (200) NO se arma el respaldo', async () => {
  const muchos = Array.from({ length: 201 }, (_, i) => ({ id: `v${i}`, codigo: i + 1, placas: `P-${i}` }));
  await assert.rejects(() => armar({ vehiculos: muchos }), (e) => e instanceof ErrorDeRespaldo && /200 filas/.test(e.message));
});

// ---------------------------------------------------------------------------
// CONTRATOS: las columnas que se escriben al salir el carro (A–BD)
// ---------------------------------------------------------------------------

test('CONTRATOS: los contratos del año van contiguos desde la fila 6, en orden de número, y el de otro año NO entra', async () => {
  const { libro, cuenta } = await respaldo();
  assert.equal(cuenta.contratos, 8);
  for (let n = 101; n <= 108; n += 1) assert.equal(libro.numero('CONTRATOS', `A${fila(n)}`), n);
  assert.equal(libro.texto('CONTRATOS', 'A14'), null, 'la fila siguiente queda libre: ahí se pega la próxima renta');
  const todos = Object.values(libro.textos('CONTRATOS', Array.from({ length: 12 }, (_, i) => `A${6 + i}`)));
  assert.ok(!todos.includes('77'), 'el contrato 77 es de 2025');
});

test('CONTRATOS: un contrato con de todo, columna por columna (el que lleva atraso, daños, carta poder, varios, conductor adicional)', async () => {
  const { libro } = await respaldo();
  const f = fila(102);
  const celdas = (cols) => cols.map((c) => `${c}${f}`);
  const t = libro.textos('CONTRATOS', celdas(['A', 'B', 'C', 'D', 'E', 'G', 'I', 'J', 'K', 'L', 'AA', 'AB', 'AC', 'AE', 'AG', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW', 'BH', 'BM', 'BO', 'BR', 'BZ']));
  assert.deepEqual(t, {
    [`A${f}`]: '102',
    [`B${f}`]: '4', // López de Pérez es el cliente 4 de su hoja CLIENTES
    [`C${f}`]: 'López de Pérez María del Carmen', // «APELLIDOS NOMBRES», como arma la fila 5 de su hoja
    [`D${f}`]: '1',
    [`E${f}`]: 'P-111AAA Toyota Hilux',
    [`G${f}`]: '4',
    [`I${f}`]: '50000',
    [`J${f}`]: '700',
    [`K${f}`]: '2800',
    [`L${f}`]: '55000',
    [`AA${f}`]: '120',
    [`AB${f}`]: '72',
    [`AC${f}`]: '3/4',
    [`AE${f}`]: 'Aeropuerto',
    [`AG${f}`]: 'Oficina',
    [`AL${f}`]: '6', // el CÓDIGO del empleado que selló el contrato (no su nombre, que va a COMENTARIOS): ver «RENTADO POR» más abajo
    [`AM${f}`]: '30',
    [`AN${f}`]: 'El Salvador',
    [`AO${f}`]: '350',
    [`AP${f}`]: '100',
    [`AQ${f}`]: 'Silla de bebé',
    [`AR${f}`]: '75',
    [`AS${f}`]: '20',
    [`AT${f}`]: 'Pedro Pérez',
    [`AU${f}`]: 'LIC-PRUEBA-0002',
    [`AV${f}`]: 'DPI 0000 00002 0101',
    [`AW${f}`]: 'Entrega en el aeropuerto',
    [`BH${f}`]: '50620',
    [`BM${f}`]: '200',
    [`BO${f}`]: '80',
    [`BR${f}`]: '100',
    [`BZ${f}`]: 'EFECTIVO',
  });
  assert.equal(libro.numero('CONTRATOS', `F${f}`), serialDeFecha('2026-09-01'));
  assert.equal(libro.numero('CONTRATOS', `H${f}`), serialDeFecha('2026-09-05'));
  assert.equal(libro.numero('CONTRATOS', `BG${f}`), serialDeFecha('2026-09-06'));
  assert.equal(libro.numero('CONTRATOS', `AD${f}`), fraccionDeHora('15:00'));
  assert.equal(libro.numero('CONTRATOS', `AF${f}`), fraccionDeHora('11:15'));
});

test('CONTRATOS: las columnas que el sistema NO tiene quedan VACÍAS (a quién se factura, tarjeta de circulación, tarifa semanal y mensual, combustible por galón)', async () => {
  const { libro } = await respaldo();
  for (let n = 101; n <= 108; n += 1) {
    const f = fila(n);
    const vacias = libro.textos('CONTRATOS', ['W', 'X', 'Y', 'Z', 'AI', 'AJ', 'AK'].map((c) => `${c}${f}`));
    assert.deepEqual(Object.values(vacias).filter((v) => v !== null), [], `contrato ${n}`);
  }
});

test('CONTRATOS: un contrato todavía afuera no trae nada de lo que se llena al regresar', async () => {
  const { libro } = await respaldo();
  const f = fila(101);
  const alRegresar = libro.textos('CONTRATOS', ['AF', 'AG', 'BG', 'BH', 'BM', 'BO', 'BR', 'BS', 'BX', 'BY'].map((c) => `${c}${f}`));
  assert.deepEqual(Object.values(alRegresar).filter((v) => v !== null), []);
  assert.equal(libro.texto('CONTRATOS', `AC${f}`), 'Lleno');
  assert.equal(libro.numero('CONTRATOS', `AD${f}`), fraccionDeHora('09:30'));
  assert.equal(libro.texto('CONTRATOS', `BZ${f}`), 'EFECTIVO');
});

// ---------------------------------------------------------------------------
// AF «HORA ENTRADA» y AG «LUGAR ENTRADA» (decisión del dueño, 16 de octubre de 2026):
// «El lugar siempre va a ser en la oficina. La hora es lo que importa porque si se pasa de la hora yo decido cuánto le cobro.»
// En su hoja se llenan al salir con la hora que se espera; el respaldo lleva la REAL, la de `cierre.horaReal`.
// ---------------------------------------------------------------------------

/** Un solo contrato en el archivo, y la celda de una columna de su fila (la primera de datos: la 6). */
const soloEste = async (contrato) => {
  const r = await armar({ contratos: [contrato] });
  const libro = await abrirLibro(r.bytes);
  return { libro, xml: libro.xml('CONTRATOS'), avisos: r.avisos };
};
/** Una renta que sigue afuera (la 101), recibida de verdad con los campos que se le den: el cierre sale del constructor del sistema. */
const recibida = (campos) => construirCierre(F.rentadoAlDia(), campos);

test('AF HORA ENTRADA lleva la hora REAL de regreso de cada contrato, no la de salida, y las rentas que siguen afuera la dejan vacía', async () => {
  const { libro } = await respaldo();
  for (const c of F.contratosDe2026()) {
    const esperada = yaVolvio(c) ? fraccionDeHora(c.cierre.horaReal) : null;
    assert.equal(libro.numero('CONTRATOS', `AF${fila(c.numero)}`), esperada, `contrato ${c.numero}`);
  }
  // el contrato que sale a las 15:00 y regresa a las 11:15: el archivo dice 11:15
  const f = fila(102);
  assert.equal(libro.numero('CONTRATOS', `AD${f}`), fraccionDeHora('15:00'));
  assert.equal(libro.numero('CONTRATOS', `AF${f}`), fraccionDeHora('11:15'));
  // y el que sigue afuera tiene hora de salida (09:30) pero ninguna de entrada
  assert.equal(libro.numero('CONTRATOS', `AD${fila(101)}`), fraccionDeHora('09:30'));
  assert.equal(libro.numero('CONTRATOS', `AF${fila(101)}`), null);
  // y todo contrato que regresó trae su hora (los demás no tienen hora de salida, así que una copia de ella saldría vacía)
  for (const n of [103, 104, 105, 106, 107, 108]) assert.notEqual(libro.numero('CONTRATOS', `AF${fila(n)}`), null, `contrato ${n}`);
});

test('AF: una renta recibida SIN hora real (en blanco, o de antes de que se pidiera) queda VACÍA: ni un cero, ni la hora de salida, ni un aviso', async () => {
  const enBlanco = recibida({ fechaReal: '2026-10-12', horaReal: '', kmEntrada: 45500 });
  const anterior = recibida({ fechaReal: '2026-10-12', kmEntrada: 45500 });
  assert.equal('horaReal' in anterior.cierre, false, 'el cierre de antes de que existiera el campo no lo trae');
  for (const [nombre, contrato] of [['en blanco', enBlanco], ['sin el campo', anterior]]) {
    const { libro, xml, avisos } = await soloEste(contrato);
    assert.equal(libro.numero('CONTRATOS', 'AD6'), fraccionDeHora('09:30'), `${nombre}: la hora de salida sí está`);
    assert.equal(libro.numero('CONTRATOS', 'AF6'), null, nombre);
    assert.match(xml, /<c r="AF6" s="\d+"\/>/, `${nombre}: la celda queda vacía, sin <v>`);
    assert.deepEqual(avisos.filter((a) => /hora/i.test(a)), [], `${nombre}: no es un problema que haya que gritar`);
  }
});

test('AF: las 00:00 SON una hora (se escribe el cero de Excel); vacío es vacío — no se confunden', async () => {
  const { libro, xml } = await soloEste(recibida({ fechaReal: '2026-10-12', horaReal: '00:00', kmEntrada: 45500 }));
  assert.equal(libro.numero('CONTRATOS', 'AF6'), 0);
  assert.match(xml, /<c r="AF6" s="\d+"><v>0<\/v><\/c>/);
});

test('AF: una hora que no se entiende (guardada a mano o por otra vía) queda VACÍA y se dice — nunca un cero que se lea como medianoche', async () => {
  for (const mala of ['25:99', '9am', '1030']) {
    const { libro, xml, avisos } = await soloEste(recibida({ fechaReal: '2026-10-12', horaReal: mala, kmEntrada: 45500 }));
    assert.equal(libro.numero('CONTRATOS', 'AF6'), null, mala);
    assert.match(xml, /<c r="AF6" s="\d+"\/>/, mala);
    assert.ok(avisos.some((a) => a.includes(`«${mala}»`) && /no se entiende/.test(a)), `${mala}: ${avisos.join(' | ')}`);
  }
});

test('AF y AG solo se llenan cuando el carro YA VOLVIÓ: una hora o un lugar sueltos en un cierre sin fecha de regreso no cuentan', async () => {
  const suelto = recibida({ horaReal: '10:30', lugarEntrada: 'Oficina' });
  assert.equal(yaVolvio(suelto), false);
  const { libro } = await soloEste(suelto);
  assert.deepEqual(Object.values(libro.textos('CONTRATOS', ['AF6', 'AG6', 'BG6'])), [null, null, null]);
  // el mismo contrato, ya con su fecha de regreso, sí los lleva
  const volvio = await soloEste(recibida({ fechaReal: '2026-10-12', horaReal: '10:30', lugarEntrada: 'Oficina', kmEntrada: 45500 }));
  assert.equal(volvio.libro.numero('CONTRATOS', 'AF6'), fraccionDeHora('10:30'));
  assert.equal(volvio.libro.texto('CONTRATOS', 'AG6'), 'Oficina');
});

test('AG LUGAR ENTRADA es el lugar anotado al RECIBIR, no el de salida: el contrato que salió del aeropuerto regresa a la oficina', async () => {
  const { libro } = await respaldo();
  const f = fila(102);
  assert.equal(libro.texto('CONTRATOS', `AE${f}`), 'Aeropuerto');
  assert.equal(libro.texto('CONTRATOS', `AG${f}`), 'Oficina');
  // el que sigue afuera tiene lugar de salida y ninguno de entrada: la columna no se rellena con «lo que más se le parece»
  assert.equal(libro.texto('CONTRATOS', `AE${fila(101)}`), 'Oficina');
  assert.equal(libro.texto('CONTRATOS', `AG${fila(101)}`), null);
});

test('I KM SALIDA: un contrato viejo que guardó el kilometraje como `kilometrajeSalida` lo lleva igual que uno de hoy (el puente de §7b)', async () => {
  // La pantalla de recibir, el detalle, el mantenimiento y (desde hoy) el papel leen el kilometraje por `conKmSalidaNormalizado`; el
  // respaldo se lo saltaba y dejaba la columna I vacía en esas rentas, justo el dato con el que se sabe cuánto anduvo el carro.
  const { kmSalida: _nuevo, ...sinElNombreNuevo } = F.rentadoAlDia();
  const viejo = { ...sinElNombreNuevo, kilometrajeSalida: 45000 };
  assert.equal('kmSalida' in viejo, false, 'la prueba parte de un contrato que NO trae kmSalida');
  const { libro } = await soloEste(viejo);
  assert.equal(libro.numero('CONTRATOS', 'I6'), 45000);
  // el de hoy no cambia
  assert.equal((await soloEste(F.rentadoAlDia())).libro.numero('CONTRATOS', 'I6'), 45000);
});

test('CONTRATOS: el nombre del cliente se escribe como lo escribe su hoja (apellidos primero)', async () => {
  const { libro } = await respaldo();
  assert.equal(libro.texto('CONTRATOS', 'C8'), 'Álvarez Zelaya Ana');
  assert.equal(libro.texto('CONTRATOS', 'C9'), 'Aguilar Montes Zacarías José');
});

// ---------------------------------------------------------------------------
// Tarjetas (ADR-001: solo los últimos 4 dígitos)
// ---------------------------------------------------------------------------

test('tarjetas: la 1 y la 2 van en sus columnas, solo con los últimos 4 dígitos; la 3 no cabe y va a COMENTARIOS', async () => {
  const { libro } = await respaldo();
  const f = fila(103);
  const t = libro.textos('CONTRATOS', ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'BS', 'BZ'].map((c) => `${c}${f}`));
  assert.deepEqual(t, {
    [`M${f}`]: 'XXXX XXXX XXXX 4242',
    [`N${f}`]: '04/30',
    [`O${f}`]: 'A123',
    [`P${f}`]: '5000',
    [`Q${f}`]: 'BAC',
    [`R${f}`]: 'XXXX XXXX XXXX 1111',
    [`S${f}`]: '11/29',
    [`T${f}`]: 'B456',
    [`U${f}`]: '3000',
    [`V${f}`]: 'Banrural',
    [`BS${f}`]: '12',
    [`BZ${f}`]: 'TARJETA',
  });
  const notas = libro.texto('CONTRATOS', `CA${f}`);
  assert.match(notas, /Tarjeta 3: XXXX XXXX XXXX 9999, vence 01\/31, autorización C789, Q2,000\.00, G&T Continental/);
  assert.match(notas, /Garantía de tarjeta sin liberar: Q10,000\.00/);
});

test('ADR-001: lo que queda de una tarjeta es «XXXX XXXX XXXX» y sus últimos 4; en todo CONTRATOS no hay un número de tarjeta completo ni CBC', async () => {
  const { libro } = await respaldo();
  for (let n = 101; n <= 108; n += 1) {
    const f = fila(n);
    for (const col of ['M', 'R']) {
      const texto = libro.texto('CONTRATOS', `${col}${f}`);
      if (texto !== null) assert.match(texto, /^XXXX XXXX XXXX \d{4}$/, `${col}${f}`);
    }
  }
  const escritos = [...libro.xml('CONTRATOS').matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);
  assert.ok(escritos.length > 40, 'se leyeron los textos escritos');
  for (const t of escritos) assert.doesNotMatch(t, /\d{13,}|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}/, t);
});

// ---------------------------------------------------------------------------
// Carros ajenos y pagos al dueño
// ---------------------------------------------------------------------------

test('carro ajeno: sin código de carro, con sus datos en SUBARR., el costo del dueño en SUBARR. COSTO X DIA y su hoja lo marca SUBARRENDADO', async () => {
  const { libro } = await respaldo();
  const f = fila(104);
  const t = libro.textos('CONTRATOS', ['D', 'E', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD'].map((c) => `${c}${f}`));
  assert.deepEqual(t, {
    [`D${f}`]: null,
    [`E${f}`]: 'P-999ZZZ Nissan Frontier 2022',
    [`AX${f}`]: 'P-999ZZZ',
    [`AY${f}`]: 'Pick up',
    [`AZ${f}`]: 'Nissan Frontier',
    [`BA${f}`]: 'Gris',
    [`BB${f}`]: '2022',
    [`BC${f}`]: 'Carlos Méndez',
    [`BD${f}`]: '300',
  });
});

test('pagado al dueño: SI y la fecha del pago cuando el contrato está en un pago vigente; NO cuando no; vacío en un carro propio', async () => {
  const { libro } = await respaldo();
  assert.equal(libro.texto('CONTRATOS', 'BX9'), 'SI');
  assert.equal(libro.numero('CONTRATOS', 'BY9'), serialDeFecha('2026-07-20'));
  assert.equal(libro.texto('CONTRATOS', 'BX10'), 'NO');
  assert.equal(libro.texto('CONTRATOS', 'BY10'), null);
  assert.equal(libro.texto('CONTRATOS', 'BX7'), null);
});

test('un pago a un dueño ANULADO no cuenta: la renta vuelve a salir NO', async () => {
  const anulado = F.pagosDueno().map((p) => ({ ...p, anulado: true, anuladoEn: '2026-07-25' }));
  const libro = await abrirLibro((await armar({ pagosDueno: anulado })).bytes);
  assert.equal(libro.texto('CONTRATOS', 'BX9'), 'NO');
});

test('un carro ajeno sin costo anotado se AVISA (su utilidad en el archivo saldría igual al total)', async () => {
  const sinCosto = F.ajenoSinPagar();
  const r = await armar({ contratos: [sinCosto] });
  assert.ok(r.avisos.some((a) => /105/.test(a) && /costo/.test(a)), r.avisos.join(' | '));
});

// ---------------------------------------------------------------------------
// Lo que su hoja no suma o no puede mostrar: va a COMENTARIOS, con el monto, y no a una columna que se le parezca
// ---------------------------------------------------------------------------

test('hora tardía y varios al recibir: la hora tardía se anota en su columna, los varios no tienen columna, y el COMENTARIO abre diciendo cuánto falta y por qué', async () => {
  const { libro } = await respaldo();
  const f = fila(106);
  assert.equal(libro.numero('CONTRATOS', `AH${f}`), 150);
  assert.equal(libro.texto('CONTRATOS', `AR${f}`), null, 'los varios del cierre NO se meten en VARIOS PRECIO: ese es el cargo de la salida');
  const notas = libro.texto('CONTRATOS', `CA${f}`);
  assert.match(notas, /^Del sistema: OJO: el total de esta hoja sale Q200\.00 menos que el del sistema \(Q1,600\.00\): /, 'lo primero que se lee');
  assert.match(notas, /la hoja anota la hora tardía \(Q150\.00\) pero no la suma/);
  assert.match(notas, /los varios de la devolución \(Q50\.00, Llave perdida\) no tienen dónde sumarse/);
});

test('el aviso al bajar el archivo lista los contratos cuyo total no cuadra con el del sistema, con lo que falta de cada uno', async () => {
  const r = await armar();
  const aviso = r.avisos.find((a) => /el total de la hoja sale MENOS/.test(a));
  assert.ok(aviso, r.avisos.join(' | '));
  assert.match(aviso, /106 \(faltan Q200\.00\)/);
  assert.match(aviso, /107 \(faltan Q20\.00\)/);
  assert.equal(r.avisos.indexOf(aviso), 0, 'es lo primero que se lee entre los avisos');
});

test('un contrato que cuadra NO lleva el «OJO»: solo se avisa cuando el total de la hoja de verdad sale distinto', async () => {
  const { libro } = await respaldo();
  for (const n of [101, 102, 103, 104, 105, 108]) {
    assert.doesNotMatch(libro.texto('CONTRATOS', `CA${fila(n)}`) ?? '', /OJO/, `contrato ${n}`);
  }
});

test('pagos mixtos: forma MIXTO, SIN porcentaje de tarjeta (aplicarlo a todo cobraría de más), el detalle en COMENTARIOS y el recargo que la hoja no suma', async () => {
  const { libro } = await respaldo();
  const f = fila(107);
  assert.equal(libro.texto('CONTRATOS', `BZ${f}`), 'MIXTO');
  assert.equal(libro.texto('CONTRATOS', `BS${f}`), null);
  const notas = libro.texto('CONTRATOS', `CA${f}`);
  assert.match(notas, /Pagos: efectivo Q1,000\.00; tarjeta Q400\.00 \(5 % de tarjeta\)/);
  assert.match(notas, /OJO: el total de esta hoja sale Q20\.00 menos que el del sistema \(Q1,420\.00\): el recargo de tarjeta que se cobró \(Q20\.00\) no cabe/);
});

test('un saldo por cobrar se anota en COMENTARIOS con la cifra del sistema', async () => {
  const { libro } = await respaldo();
  assert.match(libro.texto('CONTRATOS', `CA${fila(108)}`), /Saldo por cobrar según el sistema: Q300\.00/);
  assert.match(libro.texto('CONTRATOS', `CA${fila(108)}`), /Daños: Espejo roto/);
});

test('un contrato sin nada que anotar no lleva COMENTARIOS (no se llena la columna de ruido)', async () => {
  // «Nada que anotar» ya incluye el nombre de quien lo rentó (ver «RENTADO POR»): lo que no lleva comentario es un contrato que ni siquiera
  // trae a alguien que nombrar.
  const libro = await abrirLibro((await armar({ contratos: [F.sinQuienLoRento()] })).bytes);
  assert.equal(libro.texto('CONTRATOS', 'CA6'), null);
});

// ---------------------------------------------------------------------------
// AL «RENTADO POR»: el CÓDIGO en la columna y el NOMBRE en COMENTARIOS (decisión del dueño, 23 de octubre de 2026)
// ---------------------------------------------------------------------------
//
// Su Excel trabaja por código y su papel pide el código («PREPARADO POR (CODIGO)»), pero la columna recibía el nombre. Preguntado si AL debía llevar
// el código, contestó «Los dos»: el código en la columna, para que sus fórmulas reciban lo que esperan, y el nombre en el COMENTARIO del contrato,
// para que no se pierda nada. Un dato que falta NO se dibuja como uno que existe: sin código la columna queda VACÍA, no con un cero, no con un
// adivinado y no con el nombre en una columna cuyas fórmulas esperan un código.

/** Un respaldo de estos contratos solos: la primera fila (6) es el de menor número. */
const librosDe = async (...contratos) => abrirLibro((await armar({ contratos })).bytes);
/** La celda AL tal como quedó en el XML, o `null` si quedó vacía (la celda de la plantilla sigue ahí, con su estilo, pero sin valor). */
const celdaAL = (libro, f = 6) => {
  const m = libro.xml('CONTRATOS').match(new RegExp(`<c r="AL${f}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`));
  assert.ok(m, `la celda AL${f} sigue en la hoja`);
  return m[1] ? m[0] : null;
};

test('AL lleva el código que el contrato selló, y el NOMBRE de quien lo rentó queda en COMENTARIOS: no se pierde', async () => {
  const { libro } = await respaldo();
  for (const n of [101, 102, 103, 104, 105, 106, 107, 108]) {
    const f = fila(n);
    assert.equal(libro.texto('CONTRATOS', `AL${f}`), '6', `contrato ${n}: el código`);
    assert.match(libro.texto('CONTRATOS', `CA${f}`), /Rentado por: Ana/, `contrato ${n}: el nombre`);
    assert.doesNotMatch(libro.texto('CONTRATOS', `AL${f}`), /Ana/, `contrato ${n}: el nombre NO está en la columna`);
  }
});

test('un contrato de antes de la lista de empleados (nombre a mano, sin la llave del código): AL queda VACÍA y el nombre se conserva en COMENTARIOS', async () => {
  const viejo = F.deAntesDeLaLista();
  assert.ok(!('empleadoCodigo' in viejo) && !('empleadoId' in viejo), 'el contrato de prueba ni trae las llaves');
  assert.equal(viejo.rentadoPor, 'juan');
  const libro = await librosDe(viejo);
  assert.equal(celdaAL(libro), null, 'ni un cero, ni el nombre como si fuera un código: la celda ni existe');
  assert.equal(libro.texto('CONTRATOS', 'AL6'), null);
  assert.equal(libro.texto('CONTRATOS', 'CA6'), 'Del sistema: Rentado por: juan');
});

test('un empleado registrado sin código (empleadoCodigo null): AL queda VACÍA, nunca el nombre ni un 0, y el nombre va a COMENTARIOS', async () => {
  const c = F.conEmpleadoSinCodigo();
  assert.equal(c.empleadoCodigo, null, 'así lo sella «Sacar carro»');
  assert.equal(c.rentadoPor, 'Luis');
  const libro = await librosDe(c);
  assert.equal(celdaAL(libro), null);
  assert.equal(libro.texto('CONTRATOS', 'CA6'), 'Del sistema: Rentado por: Luis');
});

test('un código vacío, de solo espacios, null o undefined, y un valor que no es texto ni número (un booleano, un objeto, NaN), tampoco son un código: AL queda vacía', async () => {
  const base = F.conEmpleadoSinCodigo();
  const formas = {
    vacio: '', soloEspacios: '   ', nulo: null, indefinido: undefined, booleano: true, objeto: {}, lista: [6], noEsNumero: Number.NaN, infinito: Number.POSITIVE_INFINITY,
  };
  for (const [forma, valor] of Object.entries(formas)) {
    const libro = await librosDe({ ...base, empleadoCodigo: valor });
    assert.equal(celdaAL(libro), null, forma);
    assert.match(libro.texto('CONTRATOS', 'CA6'), /Rentado por: Luis/, forma);
  }
});

test('sin código NUNCA se busca uno en otra parte: ni el nombre, ni el `empleadoId`, ni el porcentaje, ni el número del contrato', async () => {
  const viejo = F.deAntesDeLaLista();
  // Todo lo tentador que el contrato trae al lado: si algún día alguien «ayuda» y rellena AL con algo, esto lo dice.
  const tentador = { ...viejo, empleadoId: 'e-ana', porcentajeComision: 5, rentadoPor: '6', numero: 109 };
  const libro = await librosDe(tentador);
  assert.equal(celdaAL(libro), null);
  assert.equal(libro.texto('CONTRATOS', 'CA6'), 'Del sistema: Rentado por: 6', 'un nombre que parece número sigue siendo el nombre: va a COMENTARIOS');
});

test('el código se escribe como lo escribiría su hoja: un número entero como NÚMERO, y cualquier otro como TEXTO tal cual (sin perder ceros)', async () => {
  const como = async (codigo) => {
    const libro = await librosDe(F.deEmpleadoConCodigo(codigo));
    return celdaAL(libro);
  };
  assert.match(await como('6'), /<c r="AL6" s="\d+"><v>6<\/v><\/c>/, 'el 6 es el número 6, como el 6 que él teclea en su hoja (y como los códigos de cliente y de carro de al lado)');
  assert.match(await como(' 12 '), /<v>12<\/v>/, 'recortado');
  assert.match(await como('W1'), /t="inlineStr"[^>]*><is><t[^>]*>W1<\/t>/, 'una letra: texto');
  assert.match(await como('007'), /t="inlineStr"[^>]*><is><t[^>]*>007<\/t>/, 'con ceros a la izquierda: texto, o se perdería el 00');
  assert.match(await como('0'), /t="inlineStr"[^>]*><is><t[^>]*>0<\/t>/, 'un código «0» es un código: no se vuelve celda vacía');
  assert.match(await como('1.5'), /t="inlineStr"[^>]*><is><t[^>]*>1\.5<\/t>/, 'no es un entero: texto');
});

test('el comentario conserva su orden: el «OJO» abre, y quien lo rentó cierra, después de todo lo que cambia cómo se lee el dinero', async () => {
  const { libro } = await respaldo();
  const hora = libro.texto('CONTRATOS', `CA${fila(106)}`);
  assert.match(hora, /^Del sistema: OJO: /, 'el nombre NO le gana el primer lugar al OJO');
  assert.ok(hora.endsWith(' | Rentado por: Ana'), hora);
  const saldo = libro.texto('CONTRATOS', `CA${fila(108)}`);
  assert.ok(saldo.endsWith(' | Rentado por: Ana'), saldo);
  assert.ok(saldo.indexOf('Daños:') < saldo.indexOf('Saldo por cobrar') && saldo.indexOf('Saldo por cobrar') < saldo.indexOf('Rentado por'), saldo);
  // y un contrato que cuadra no gana por eso un «OJO»: solo el nombre
  assert.equal(libro.texto('CONTRATOS', `CA${fila(101)}`), 'Del sistema: Rentado por: Ana');
});

test('el nombre que va a COMENTARIOS es el del contrato (el de ESE día), no el de la lista de empleados de hoy', async () => {
  const c = { ...F.deEmpleadoConCodigo('9'), rentadoPor: 'Marta (como se llamaba entonces)' };
  const libro = await librosDe(c);
  assert.equal(libro.texto('CONTRATOS', 'CA6'), 'Del sistema: Rentado por: Marta (como se llamaba entonces)');
  assert.equal(libro.numero('CONTRATOS', 'AL6'), 9);
});

test('la sola columna AL cambió: ninguna otra celda del contrato se movió por esto, y sin quién lo rentó ni código no hay ni AL ni comentario', async () => {
  const sin = await librosDe(F.sinQuienLoRento());
  assert.equal(celdaAL(sin), null);
  assert.equal(sin.texto('CONTRATOS', 'CA6'), null);
  // el mismo contrato, con y sin empleado, difiere SOLO en AL y CA
  const con = await librosDe({ ...F.sinQuienLoRento(), rentadoPor: 'Ana', empleadoId: 'e-ana', empleadoCodigo: '6' });
  const columnas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'AA', 'AB', 'AC', 'AD', 'AE', 'AM', 'AW', 'BS', 'BZ'];
  assert.deepEqual(con.textos('CONTRATOS', columnas.map((x) => `${x}6`)), sin.textos('CONTRATOS', columnas.map((x) => `${x}6`)));
  assert.equal(con.numero('CONTRATOS', 'AL6'), 6);
});

// ---------------------------------------------------------------------------
// Lo que NO se toca
// ---------------------------------------------------------------------------

test('las hojas que no son de datos salen byte por byte iguales a las de su plantilla', async () => {
  const { libro } = await respaldo();
  const original = await abrirLibro(leerPlantilla());
  for (const hoja of ['BUSCAR', 'IMP. CONTRATO', 'CIERRE', 'IMP. CIERRE DE CONTRATO', 'FICHA CLIENTE', 'FICHA VEHICULO', 'INGRESO DE DATOS']) {
    assert.equal(libro.xml(hoja), original.xml(hoja), hoja);
  }
  for (const parte of ['xl/styles.xml', 'xl/theme/theme1.xml', 'xl/media/image1.png', 'xl/sharedStrings.xml', 'docProps/app.xml']) {
    assert.deepEqual(libro.partes.get(parte), original.partes.get(parte), parte);
  }
});

test('en las tres hojas de datos, NINGUNA fórmula cambia y cada celda conserva su estilo (sus colores, formatos y si está desbloqueada)', async () => {
  const { libro } = await respaldo();
  const original = await abrirLibro(leerPlantilla());
  const formulas = (xml) => [...xml.matchAll(/<f[^>]*>[^<]*<\/f>|<f[^>]*\/>/g)].map((m) => m[0]);
  const estilos = (xml) => [...xml.matchAll(/<c r="([A-Z]+\d+)"(?:[^>]*?\ss="(\d+)")?/g)].map((m) => `${m[1]}:${m[2] ?? ''}`);
  for (const hoja of ['CLIENTES', 'VEHICULOS', 'CONTRATOS']) {
    assert.deepEqual(formulas(libro.xml(hoja)), formulas(original.xml(hoja)), `${hoja}: fórmulas`);
    assert.deepEqual(estilos(libro.xml(hoja)), estilos(original.xml(hoja)), `${hoja}: estilos`);
  }
  // Lo de afuera de las filas (validaciones, formatos condicionales, protección, combinadas) es el mismo texto.
  const fuera = (xml) => xml.slice(xml.indexOf('</sheetData>'));
  for (const hoja of ['CLIENTES', 'VEHICULOS', 'CONTRATOS']) assert.equal(fuera(libro.xml(hoja)), fuera(original.xml(hoja)), hoja);
});

test('lo escrito es texto o número, nunca una fórmula: un nombre que empieza con «=» queda como texto', async () => {
  const peligroso = { id: 'k-x', nombres: '=HYPERLINK("http://x")', apellidos: '+cmd|calc', telefono: '@SUM(1)' };
  const libro = await abrirLibro((await armar({ clientes: [peligroso], contratos: [] })).bytes);
  assert.equal(libro.texto('CLIENTES', 'D3'), '=HYPERLINK("http://x")');
  assert.match(libro.xml('CLIENTES'), /<c r="D3"[^>]*t="inlineStr"/);
  assert.doesNotMatch(libro.xml('CLIENTES'), /<c r="D3"[^>]*><f>/);
});

// ---------------------------------------------------------------------------
// Las negativas: cuándo NO se arma
// ---------------------------------------------------------------------------

test('más de 1,000 contratos en el año: NO se arma (faltarían contratos y parecería completo)', async () => {
  const muchos = Array.from({ length: 1001 }, (_, i) => ({ id: `c${i}`, numero: i + 1, fechaSalida: '2026-01-02', clienteId: 'k-lopez' }));
  await assert.rejects(() => armar({ contratos: muchos }), (e) => e instanceof ErrorDeRespaldo && /1,?000 filas|1000 filas/.test(e.message));
});

test('más clientes de los que caben (2,000): se arma, se avisa cuántos no cupieron, y los de las rentas del año entran primero', async () => {
  const sobrantes = Array.from({ length: 2000 }, (_, i) => ({ id: `kk${i}`, nombres: `Nombre${i}`, apellidos: `Apellido${i}`, actualizado: 1000 + i }));
  const r = await armar({ clientes: [...sobrantes, ...F.clientes()] });
  assert.equal(r.cuenta.clientes, 2000);
  assert.equal(r.cuenta.clientesFuera, 4);
  assert.ok(r.avisos.some((a) => /No cupieron 4 clientes/.test(a)), r.avisos.join(' | '));
  const libro = await abrirLibro(r.bytes);
  const todos = libro.textos('CLIENTES', Array.from({ length: 2000 }, (_, i) => `B${3 + i}`));
  assert.ok(Object.values(todos).includes('López de Pérez'), 'el cliente de las rentas del año sí entró');
  assert.ok(Object.values(todos).includes('Aguilar Montes'));
});

test('un contrato cuyo cliente ya no existe se avisa y queda con el nombre y sin código de cliente', async () => {
  const r = await armar({ clientes: F.clientes().filter((c) => c.id !== 'k-zelaya') });
  assert.ok(r.avisos.some((a) => /Contrato 103/.test(a) && /cliente/.test(a)));
  const libro = await abrirLibro(r.bytes);
  assert.equal(libro.texto('CONTRATOS', `B${fila(103)}`), null);
  assert.equal(libro.texto('CONTRATOS', `C${fila(103)}`), 'Ana Álvarez Zelaya', 'queda el nombre del contrato tal como se firmó');
});

test('un contrato cuyo carro ya no está en la flota se avisa y queda con las placas y sin código de carro', async () => {
  const r = await armar({ vehiculos: F.vehiculos().filter((v) => v.id !== 'v2') });
  assert.ok(r.avisos.some((a) => /Contrato 103/.test(a) && /carro/.test(a)));
  const libro = await abrirLibro(r.bytes);
  assert.equal(libro.texto('CONTRATOS', `D${fila(103)}`), null);
  assert.match(libro.texto('CONTRATOS', `E${fila(103)}`), /P-222BBB/);
});

test('una fecha que Excel no puede guardar se avisa y queda en blanco, no se inventa', async () => {
  const roto = { ...F.rentadoAlDia(), devolucionPrevista: '2026-02-30' };
  const r = await armar({ contratos: [roto] });
  assert.ok(r.avisos.some((a) => /2026-02-30/.test(a)), r.avisos.join(' | '));
  assert.equal((await abrirLibro(r.bytes)).texto('CONTRATOS', 'H6'), null);
});

test('un contrato sin número no entra (sin número no hay dónde pegar el siguiente) y se avisa; los números repetidos también', async () => {
  const sin = { ...F.rentadoAlDia(), id: 'c-sin', numero: null };
  const dos = { ...F.pagoMixto(), id: 'c-dup', numero: 101 };
  const r = await armar({ contratos: [F.rentadoAlDia(), sin, dos] });
  assert.equal(r.cuenta.contratos, 2);
  assert.ok(r.avisos.some((a) => /sin número/.test(a)));
  assert.ok(r.avisos.some((a) => /repetidos \(101\)/.test(a)));
});

test('un contrato de otro año NO entra aunque quien llama lo pase: el archivo «2026» solo lleva 2026', async () => {
  const r = await armar({ contratos: [F.deOtroAnio()] });
  assert.equal(r.cuenta.contratos, 0);
});

test('una plantilla cuyo diseño cambió (una columna movida) se NIEGA: nunca escribe el DPI donde antes iba la licencia', async () => {
  const partes = await leerZip(leerPlantilla());
  const parte = hojasDelLibro(partes).get('CLIENTES');
  ponerXml(partes, parte, escribirCeldas(xmlDe(partes, parte), [{ ref: 'K2', valor: 'OTRA COSA' }]));
  const alterada = await escribirZip(partes);
  await assert.rejects(() => armar({ plantilla: alterada }), (e) => e instanceof ErrorDeRespaldo && /K2/.test(e.message) && /no es la que el sistema espera/.test(e.message));
});

test('una plantilla que ni siquiera es un Excel se NIEGA en español', async () => {
  await assert.rejects(() => armar({ plantilla: new TextEncoder().encode('no soy un excel') }), /no es un archivo de Excel/);
});

test('una plantilla con datos de otro (la hoja de datos no vacía) sale limpia: el área de datos se vacía antes de escribir', async () => {
  const partes = await leerZip(leerPlantilla());
  const parte = hojasDelLibro(partes).get('CLIENTES');
  ponerXml(partes, parte, escribirCeldas(xmlDe(partes, parte), [{ ref: 'B900', valor: 'SOBRA' }, { ref: 'H900', valor: 'DPI VIEJO' }]));
  const libro = await abrirLibro((await armar({ plantilla: await escribirZip(partes) })).bytes);
  assert.equal(libro.texto('CLIENTES', 'B900'), null);
  assert.equal(libro.texto('CLIENTES', 'H900'), null);
});

test('el archivo lleva el año y la fecha en sus propiedades, tomados de `hoy`, y no del reloj', async () => {
  const { libro } = await respaldo();
  const core = xmlDe(libro.partes, 'docProps/core.xml');
  assert.match(core, /<dc:title>Best Price 2026<\/dc:title>/);
  assert.match(core, /generado el 2026-10-12/);
  assert.match(core, /2026-10-12T12:00:00Z/);
});

test('el respaldo de un año que nadie rentó sale igual: un archivo vacío de contratos pero con los clientes y los carros', async () => {
  const r = await armar({ anio: 2024, contratos: [F.deOtroAnio()] });
  assert.equal(r.cuenta.contratos, 0);
  assert.equal(r.cuenta.clientes, 4);
});
