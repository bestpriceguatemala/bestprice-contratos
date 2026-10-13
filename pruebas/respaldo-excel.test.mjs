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
    [`AL${f}`]: 'Ana',
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

test('hora tardía y varios al recibir: la hoja anota la hora tardía en su columna pero no la suma, y lo dice; los varios no tienen columna', async () => {
  const { libro } = await respaldo();
  const f = fila(106);
  assert.equal(libro.numero('CONTRATOS', `AH${f}`), 150);
  assert.equal(libro.texto('CONTRATOS', `AR${f}`), null, 'los varios del cierre NO se meten en VARIOS PRECIO: ese es el cargo de la salida');
  const notas = libro.texto('CONTRATOS', `CA${f}`);
  assert.match(notas, /Hora tardía Q150\.00: la hoja la anota pero no la suma al total/);
  assert.match(notas, /Varios al recibir Q50\.00 \(Llave perdida\): la hoja no tiene dónde sumarlo/);
});

test('pagos mixtos: forma MIXTO, SIN porcentaje de tarjeta (aplicarlo a todo cobraría de más) y el detalle en COMENTARIOS', async () => {
  const { libro } = await respaldo();
  const f = fila(107);
  assert.equal(libro.texto('CONTRATOS', `BZ${f}`), 'MIXTO');
  assert.equal(libro.texto('CONTRATOS', `BS${f}`), null);
  assert.match(libro.texto('CONTRATOS', `CA${f}`), /Pagos: efectivo Q1,000\.00; tarjeta Q400\.00 \(5 % de tarjeta\)/);
});

test('un saldo por cobrar se anota en COMENTARIOS con la cifra del sistema', async () => {
  const { libro } = await respaldo();
  assert.match(libro.texto('CONTRATOS', `CA${fila(108)}`), /Saldo por cobrar según el sistema: Q300\.00/);
  assert.match(libro.texto('CONTRATOS', `CA${fila(108)}`), /Daños: Espejo roto/);
});

test('un contrato sin nada que anotar no lleva COMENTARIOS (no se llena la columna de ruido)', async () => {
  const { libro } = await respaldo();
  assert.equal(libro.texto('CONTRATOS', `CA${fila(101)}`), null);
  assert.equal(libro.texto('CONTRATOS', `CA${fila(104)}`), null);
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
