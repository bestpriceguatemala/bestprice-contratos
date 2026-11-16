// Las tres correcciones que el dueño hizo el 16 de noviembre de 2026 al releer lo que imprime el contrato (§8b, puntos 19 a 21).
//   1. El combustible de salida SÍ se imprime, y en «Sacar carro» se escribe en vez de escogerse de una lista.
//   2. Todo monto lleva la Q, también LDW y PAI, y la hoja de prueba lo dice a la vista.
//   3. Las nueve casillas de «letra blanca» se pueden dejar en blanco en un papel concreto, sin que eso se guarde.
//
// Los contratos salen de las mismas funciones que arman los de verdad (`construirContrato`, `contratoParaGuardar`) y el cliente de
// `construirCliente`: ninguno está escrito a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  armarContratoImpreso, htmlContratoImpreso,
} from '../js/pantallas/contratoImpreso.js';
import { construirContrato, plantilla as plantillaSacar, leerFormularioDe, lectorDeCampos } from '../js/pantallas/sacarCarro.js';
import { plantilla as plantillaRecibir, datosDeSalida } from '../js/pantallas/recibirCarro.js';
import { plantillaDetalle } from '../js/pantallas/contratos.js';
import { contratoParaGuardar } from '../js/datos.js';
import { construirCliente } from '../js/nucleo/cliente.js';
import { lineasSalida, resumen, lineasDevolucion } from '../js/nucleo/contrato.js';
import { armarRespaldo } from '../js/respaldo/excel.js';
import { abrirLibro, leerPlantilla } from './fixtures/leerLibro.mjs';
import * as F from './fixtures/datosParaRespaldo.mjs';
import { EMPLEADOS } from './fixtures/rentasConComision.mjs';

const AHORA = 1790000000000;
const CARRO = {
  id: 'v1', placas: 'P-123ABC', tipo: 'Pickup', marca: 'Toyota', linea: 'Hilux', modelo: '2020', color: 'Blanco',
};
const TARJETAS = [
  { ultimos4: '3343', vencimiento: '12/28', banco: 'BAC', autorizacion: '1234', montoAutorizado: 3000 },
  { ultimos4: '9999', vencimiento: '01/29', banco: 'BI', autorizacion: 'AB77', montoAutorizado: 500 },
];
const cliente = () => construirCliente({
  nombres: 'Juan Carlos', apellidos: 'Pérez López', nacionalidad: 'Guatemalteca', documento: '2380 10120 0101',
  licencia: '2380 10120 0101', licenciaExpira: '2030-01-31', telefono: '5555-0001', direccionReferencia: '5a avenida 10-20',
  municipio: 'Guatemala', fechaNacimiento: '1985-02-09', documentoExpira: '2030-02-09',
}, { id: 'k1', ahora: AHORA });

/** Un contrato guardado de un carro de la flota; `extra` pisa lo que se le pasa a `construirContrato`. */
function contrato(extra = {}) {
  const salida = construirContrato({
    id: 'c1', numero: 77, cliente: cliente(), ajeno: false, carro: CARRO, carroAjeno: null, duenoId: null,
    fechaSalida: '2026-08-20', horaSalida: '15:00', lugar: 'OFICINA', dias: 5, precioDia: 700, kmSalida: 234343,
    combustibleSalida: '3/4', seguroDia: 72, seguroTercerosDia: 120, seguroMenoresDia: 10, seguroPaiDia: 5, deducible: 55000,
    deducibleBajo: 250, cartaPoderDestino: 'EL SALVADOR', cartaPoderPrecio: 350, variosDescripcion: 'Lavado', variosPrecio: 80,
    tarjetas: TARJETAS, forma: 'efectivo', porcentajeTarjeta: 0, montoPago: 3500, rentadoPor: 'DENNIS', empleadoCodigo: '6',
    porcentajeComision: 5, conductorAdicional: { nombre: 'ESTEBAN URIZAR', licencia: '2380 10120 0101', identificacion: '' },
    observaciones: 'una nota', ...extra,
  });
  return contratoParaGuardar(salida, { id: 'c1', numero: 77, ahora: AHORA });
}
const entrada = (extra = {}, aparte = {}) => ({ contrato: contrato(extra), cliente: cliente(), carro: CARRO, ...aparte });
const hoja = (extra = {}, aparte = {}) => htmlContratoImpreso(armarContratoImpreso(entrada(extra, aparte)));
const caja = (html, id) => new RegExp(`data-campo="${id}"[^>]*>(.*?)</div>`, 's').exec(html)?.[1] ?? null;

// ===========================================================================
// 1. El combustible de salida se imprime, y se escribe
// ===========================================================================

test('1. «Sacar carro»: el combustible es una casilla para escribir (input de texto), ya no una lista de opciones', () => {
  const html = plantillaSacar();
  assert.match(html, /<input type="text" id="sc-combustible-salida"/);
  assert.ok(!/<select id="sc-combustible-salida"/.test(html), 'la lista de opciones se quitó');
  assert.ok(!html.includes('<option value="3/4">'), 'ni sus opciones');
  // y la hora, que se hizo igual el 3 de octubre, sigue siendo de texto: el mismo camino
  assert.match(html, /<input type="text" id="sc-hora-salida"/);
});

const leerConCombustible = (valor) => {
  const valores = {
    'sc-ajeno': true, 'sc-ajeno-placas': 'P-1AJN', 'sc-ajeno-tipo': 'Pickup', 'sc-ajeno-marca': 'Ford', 'sc-ajeno-color': 'Rojo',
    'sc-ajeno-modelo': '2019', 'sc-ajeno-costo': '400', 'sc-fecha-salida': '2026-09-23', 'sc-dias': '4', 'sc-precio-dia': '700',
    'sc-pago-forma': 'efectivo', 'sc-pago-monto': '2800', ...(valor === undefined ? {} : { 'sc-combustible-salida': valor }),
  };
  const pedidos = new Set();
  const el = (id) => {
    pedidos.add(id);
    const v = valores[id];
    if (typeof v === 'boolean') return { value: '', checked: v };
    return { value: v === undefined ? '' : String(v), checked: false };
  };
  const datos = leerFormularioDe(lectorDeCampos(el), {
    contratoId: 'c1', cliente: cliente(), carro: null, duenoEscogido: null, empleadoEscogido: EMPLEADOS.ana, tarjetas: [],
  }, 12);
  return { datos, guardado: contratoParaGuardar(construirContrato(datos), { id: 'c1', numero: 12, ahora: AHORA }), pedidos };
};

test('1. lo que él escribe se guarda tal cual (recortado de espacios), sin traducir a «Lleno, 3/4…»', () => {
  for (const escrito of ['FULL', 'Lleno', '3/4', 'Vacío', 'casi lleno, falta una rayita']) {
    assert.equal(leerConCombustible(escrito).guardado.combustibleSalida, escrito);
  }
  assert.equal(leerConCombustible('   FULL  ').guardado.combustibleSalida, 'FULL');
  assert.equal(leerConCombustible('').guardado.combustibleSalida, '', 'sin escribir: vacío, como con la lista');
  assert.equal(leerConCombustible(undefined).guardado.combustibleSalida, '');
});

test('1. el id que la lectura pide existe en la plantilla (un error de dedo se leería como vacío, sin avisar)', () => {
  const { pedidos } = leerConCombustible('FULL');
  assert.ok(pedidos.has('sc-combustible-salida'));
  assert.ok(plantillaSacar().includes('id="sc-combustible-salida"'));
});

test('1. el papel imprime el combustible: lo de contratos viejos (Lleno, 3/4, 1/2, 1/4, Vacío) y lo que él escriba, tal cual', () => {
  for (const nivel of ['Lleno', '3/4', '1/2', '1/4', 'Vacío', 'FULL', 'casi lleno']) {
    const modelo = armarContratoImpreso(entrada({ combustibleSalida: nivel }));
    assert.equal(modelo.valores.combustibleSalida, nivel);
    assert.equal(caja(htmlContratoImpreso(modelo), 'combustibleSalida'), `<span class="hc-t">${nivel}</span>`, nivel);
  }
});

test('1. sin combustible anotado no hay caja en el papel (ni un espacio que parezca dato); lo escrito con HTML sale escapado', () => {
  for (const vacio of ['', '   ']) assert.equal(caja(hoja({ combustibleSalida: vacio }), 'combustibleSalida'), null);
  const sinLlave = contrato();
  delete sinLlave.combustibleSalida; // un contrato de antes de que existiera el campo
  assert.equal(caja(htmlContratoImpreso(armarContratoImpreso({ contrato: sinLlave, cliente: cliente(), carro: CARRO })), 'combustibleSalida'), null);
  const peligro = hoja({ combustibleSalida: '<b>FULL</b> & "ok"' });
  assert.equal(caja(peligro, 'combustibleSalida'), '<span class="hc-t">&lt;b&gt;FULL&lt;/b&gt; &amp; &quot;ok&quot;</span>');
});

test('1. «Recibir carro» muestra el combustible al salir, viejo o nuevo, y escapado', () => {
  for (const nivel of ['Lleno', '3/4', 'FULL']) assert.equal(datosDeSalida(contrato({ combustibleSalida: nivel })).combustible, nivel);
  assert.equal(datosDeSalida(contrato({ combustibleSalida: '  ' })).combustible, null, 'sin anotar sigue siendo null');
  const html = plantillaRecibir(contrato({ combustibleSalida: '<i>FULL</i>' }), false);
  assert.ok(html.includes('&lt;i&gt;FULL&lt;/i&gt;'));
  assert.ok(!html.includes('<i>FULL</i>'));
});

test('1. el detalle del contrato muestra el combustible de salida, viejo o nuevo, y escapado', () => {
  assert.match(plantillaDetalle(contrato({ combustibleSalida: 'Lleno' })), /Combustible de salida\s*<input type="text" value="Lleno"/);
  assert.match(plantillaDetalle(contrato({ combustibleSalida: 'FULL' })), /Combustible de salida\s*<input type="text" value="FULL"/);
  assert.match(plantillaDetalle(contrato({ combustibleSalida: '"><script>x</script>' })), /value="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;"/);
});

test('1. el respaldo en Excel pone el combustible en su columna AC tal cual, también si empieza con «=»; sin anotar queda vacío', async () => {
  const distintos = F.contratosDe2026().map((c) => {
    if (c.numero === 101) return { ...c, combustibleSalida: 'FULL' };
    if (c.numero === 102) return { ...c, combustibleSalida: '=1+1 <b>&' };
    if (c.numero === 103) return { ...c, combustibleSalida: '' };
    return c;
  });
  const r = await armarRespaldo({
    plantilla: leerPlantilla(), anio: 2026, hoy: '2026-10-12', clientes: F.clientes(), vehiculos: F.vehiculos(),
    contratos: [...distintos, F.deOtroAnio()], pagosDueno: F.pagosDueno(),
  });
  const libro = await abrirLibro(r.bytes);
  assert.equal(libro.texto('CONTRATOS', 'AC6'), 'FULL');
  assert.equal(libro.texto('CONTRATOS', 'AC7'), '=1+1 <b>&', 'texto, nunca fórmula');
  assert.equal(libro.texto('CONTRATOS', 'AC8'), null);
  assert.ok(!/<c r="AC7"[^>]*><f>/.test(libro.xml('CONTRATOS')), 'no se escribió una fórmula');
});

test('1. NADA calcula con el combustible de salida: dos contratos que solo difieren en él cobran lo mismo', () => {
  const a = contrato({ combustibleSalida: 'Lleno' });
  const b = contrato({ combustibleSalida: 'cualquier cosa que él escriba 123' });
  assert.deepEqual(lineasSalida(a), lineasSalida(b));
  assert.deepEqual(lineasDevolucion(a), lineasDevolucion(b));
  assert.deepEqual(resumen(a), resumen(b));
});

// Quién lee `combustibleSalida` en el código: si un día aparece un lector nuevo, esta lista obliga a mirarlo (¿rompe con texto libre?).
function archivosJs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivosJs(ruta) : (ruta.endsWith('.js') ? [ruta] : []);
  });
}
test('1. los únicos lugares del código que tocan `combustibleSalida` son los revisados para texto libre', () => {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const lectores = archivosJs(join(raiz, 'js')).filter((r) => readFileSync(r, 'utf8').includes('combustibleSalida'))
    .map((r) => r.slice(raiz.length)).sort();
  assert.deepEqual(lectores, [
    'js/nucleo/hojaContrato.js', // la tabla del papel (se imprime)
    'js/pantallas/contratoImpreso.js', // el papel (escapa)
    'js/pantallas/contratos.js', // el detalle (escapa)
    'js/pantallas/recibirCarro.js', // «Combustible al salir» (escapa)
    'js/pantallas/sacarCarro.js', // lo escribe (campo de texto)
    'js/respaldo/mapa.js', // columna AC (texto)
  ]);
});
