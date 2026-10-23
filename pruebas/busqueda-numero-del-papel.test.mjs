// El número rojo de la hoja preimpresa («№ 014591») contra el número que el sistema guarda (14591).
//
// Lo que se prueba es que el número que el dueño lee en el papel que tiene en la mano ENCUENTRA el contrato, y —tan importante como eso—
// que ese arreglo no hace que otra búsqueda traiga un contrato que no es: un teléfono, unas placas, un DPI, un texto que empieza con
// cifras. Un buscador que normaliza de más devuelve el contrato de OTRO cliente, que es peor que no devolver ninguno.
//
// Todo se arma con los constructores reales (fixtures/negocioParaBuscar.mjs): el `numero` es un número, como queda guardado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filtrar, filtrarContratos, textoDeCliente, textoDeContrato, numeroSinCeros, DIGITOS_DEL_NUMERO_IMPRESO,
} from '../js/nucleo/busqueda.js';
import { contratosVisibles } from '../js/pantallas/contratos.js';
import { clienteDe, carroDe, contratoDe } from './fixtures/negocioParaBuscar.mjs';

const juan = clienteDe('k1', {
  nombres: 'Juan', apellidos: 'Pérez', documento: '2999 11111 0101', licencia: '3786732380101', telefono: '3078-4155',
});
const ana = clienteDe('k2', {
  nombres: 'Ana', apellidos: 'Gómez', documento: '0123 45678 0101', telefono: '5551-0123',
});
const yaris = carroDe('v1', {
  placas: 'P-234IFN', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', tipo: 'Sedán', modelo: '2020',
});
const hilux = carroDe('v2', {
  placas: 'P-012ABC', marca: 'Toyota', linea: 'Hilux', color: 'Negro', tipo: 'Pickup', modelo: '2019',
});
const corolla = carroDe('v3', {
  placas: 'P-555XYZ', marca: 'Toyota', linea: 'Corolla', color: 'Gris', tipo: 'Sedán', modelo: '2018',
});

// Los contratos del mostrador: el 14591 es el de Juan; los demás son vecinos que un buscador demasiado generoso confundiría con él.
const contratos = [
  contratoDe({ numero: 14591, cliente: juan, carro: yaris }),
  contratoDe({ numero: 14592, cliente: ana, carro: hilux }),
  contratoDe({ numero: 1459, cliente: ana, carro: yaris }),
  contratoDe({ numero: 4591, cliente: juan, carro: hilux }),
  contratoDe({ numero: 114591, cliente: ana, carro: yaris }),
  contratoDe({ numero: 145910, cliente: juan, carro: hilux }),
  contratoDe({ numero: 12, cliente: ana, carro: corolla }),
  contratoDe({ numero: 14, cliente: juan, carro: corolla }),
];
const numerosQueTrae = (consulta, lista = contratos) => filtrarContratos(lista, consulta).map((c) => c.numero).sort((a, b) => a - b);

test('el contrato se guarda con el número SIN ceros (el papel los imprime, el sistema no): este es el punto de partida', () => {
  assert.equal(contratos[0].numero, 14591);
  assert.equal(typeof contratos[0].numero, 'number');
  assert.ok(!textoDeContrato(contratos[0]).includes('014591'), 'el texto buscable del contrato no trae el número del papel');
});

test('«014591», tal como está impreso en el papel, encuentra el contrato 14591', () => {
  assert.deepEqual(numerosQueTrae('014591'), [14591]);
});

test('«14591» sigue encontrándolo, y con cualquier cantidad de ceros delante también', () => {
  assert.ok(numerosQueTrae('14591').includes(14591));
  assert.deepEqual(numerosQueTrae('0014591'), [14591]);
  assert.deepEqual(numerosQueTrae('00000014591'), [14591]);
});

test('lo que se pega del papel («№ 014591», con el signo y los espacios) también lo encuentra', () => {
  assert.deepEqual(numerosQueTrae('№ 014591'), [14591]);
  assert.deepEqual(numerosQueTrae('  014591  '), [14591]);
});

test('el número del papel es EXACTO: no trae el 14592, el 1459, el 4591, el 114591 ni el 145910', () => {
  const traidos = numerosQueTrae('014591');
  for (const vecino of [14592, 1459, 4591, 114591, 145910, 12, 14]) {
    assert.ok(!traidos.includes(vecino), `«014591» no debe traer el contrato ${vecino}`);
  }
});

test('el número del papel se combina con el resto de la búsqueda: todas las palabras tienen que estar', () => {
  assert.deepEqual(numerosQueTrae('014591 pérez'), [14591]);
  assert.deepEqual(numerosQueTrae('pérez 014591'), [14591]);
  assert.deepEqual(numerosQueTrae('014591 gomez'), [], 'el 14591 es de Juan: con otro apellido no hay nada');
  assert.deepEqual(numerosQueTrae('014591 p234ifn'), [14591]);
  assert.deepEqual(numerosQueTrae('014591 p012abc'), [], 'las placas de otro carro');
});

test('un número del papel que no existe no trae nada (ni un contrato parecido)', () => {
  assert.deepEqual(numerosQueTrae('014593'), []);
  assert.deepEqual(numerosQueTrae('999999'), []);
});

test('solo cuenta como número del papel lo que tiene al menos tantas cifras como imprime la hoja', () => {
  // La hoja imprime seis cifras («014591»): un texto con cero adelante pero más corto es un pedazo de otra cosa (unas placas,
  // un teléfono, un DPI), no un número del papel, y el contrato 12 no tiene por qué salir cuando se busca «012».
  assert.equal(DIGITOS_DEL_NUMERO_IMPRESO, 6);
  assert.deepEqual(numerosQueTrae('012'), [4591, 14592, 145910], '«012» es un pedazo de las placas P-012ABC (el Hilux), no el contrato 12');
  assert.deepEqual(numerosQueTrae('0012'), []);
  assert.deepEqual(numerosQueTrae('00012'), [], 'cinco cifras todavía no es un número de la hoja');
  assert.deepEqual(numerosQueTrae('000012'), [12], 'seis sí');
  assert.deepEqual(numerosQueTrae('01459'), [], 'a medio teclear «014591» no trae el 1459');
});

test('numeroSinCeros: solo para texto de puros dígitos, y los ceros solos no son un número', () => {
  assert.equal(numeroSinCeros('014591'), '14591');
  assert.equal(numeroSinCeros('14591'), '14591');
  assert.equal(numeroSinCeros('0000'), '');
  assert.equal(numeroSinCeros('0'), '');
  assert.equal(numeroSinCeros('01 4591'), '');
  assert.equal(numeroSinCeros('014591A'), '');
  assert.equal(numeroSinCeros('-014591'), '');
  assert.equal(numeroSinCeros(''), '');
  assert.equal(numeroSinCeros(null), '');
  assert.equal(numeroSinCeros(undefined), '');
  assert.equal(numeroSinCeros(14591), '14591');
});

test('seis ceros no son el número de ningún contrato', () => {
  const con0 = [contratoDe({ numero: 0, cliente: juan, carro: yaris }), ...contratos];
  assert.deepEqual(numerosQueTrae('000000', con0), [], 'un cero escrito de más no abre el contrato 0');
});

test('un contrato sin número (todavía sin guardar) no revienta ni sale por «000000»', () => {
  const sinNumero = { ...contratos[0], numero: null };
  assert.deepEqual(filtrarContratos([sinNumero], '014591'), []);
  assert.deepEqual(filtrarContratos([{ ...contratos[0], numero: undefined }], '014591'), []);
  assert.deepEqual(filtrarContratos([{ ...contratos[0], numero: 'abc' }], '000000'), []);
});

// ---------- Lo que el arreglo NO debe mover ----------

test('el teléfono sigue encontrando al cliente, con guion, sin guion y por pedazos', () => {
  const clientes = [juan, ana];
  const busca = (consulta) => filtrar(clientes, consulta, textoDeCliente).map((c) => c.id);
  assert.deepEqual(busca('3078-4155'), ['k1']);
  assert.deepEqual(busca('30784155'), ['k1']);
  assert.deepEqual(busca('4155'), ['k1']);
  assert.deepEqual(busca('5551-0123'), ['k2']);
});

test('un DPI que empieza con cero se encuentra tal cual, con sus ceros, y no se convierte en otro número', () => {
  const clientes = [juan, ana];
  const busca = (consulta) => filtrar(clientes, consulta, textoDeCliente).map((c) => c.id);
  assert.deepEqual(busca('0123 45678 0101'), ['k2']);
  assert.deepEqual(busca('0123'), ['k2']);
  assert.deepEqual(busca('0123456780101'), ['k2'], 'seis o más cifras con cero adelante: el DPI completo, tal cual');
});

test('los clientes no tienen «número del papel»: un cliente jamás sale porque su teléfono, DPI o licencia valga lo mismo sin ceros', () => {
  // Cliente cuyo teléfono, sin los ceros de su búsqueda, valdría 14591: no debe salir por «014591».
  const raro = clienteDe('k9', { nombres: 'Raúl', apellidos: 'Díaz', telefono: '14591' });
  assert.deepEqual(filtrar([raro], '014591', textoDeCliente), []);
  assert.deepEqual(filtrar([raro], '14591', textoDeCliente).map((c) => c.id), ['k9']);
});

test('las placas se encuentran igual: con guion, sin guion, en minúsculas y por pedazos', () => {
  const busca = (consulta) => numerosQueTrae(consulta);
  assert.deepEqual(busca('P-234IFN'), [1459, 14591, 114591]);
  assert.deepEqual(busca('p234ifn'), [1459, 14591, 114591]);
  assert.deepEqual(busca('234ifn'), [1459, 14591, 114591]);
  assert.deepEqual(busca('P 234 IFN'), [1459, 14591, 114591]);
  assert.deepEqual(busca('P-012ABC'), [4591, 14592, 145910]);
  assert.deepEqual(busca('p 012 abc'), [4591, 14592, 145910]);
});

test('unas placas con ceros no traen un contrato por su número: «P-012ABC» no es el 12', () => {
  const soloElDoce = [contratoDe({ numero: 12, cliente: ana, carro: yaris })];
  assert.deepEqual(filtrarContratos(soloElDoce, 'p 012 abc'), []);
  assert.deepEqual(filtrarContratos(soloElDoce, '012'), []);
});

test('un texto que solo EMPIEZA con cifras sigue siendo un texto: «234ifn yaris» y «014 pérez» buscan lo que dicen', () => {
  assert.deepEqual(numerosQueTrae('234ifn yaris'), [1459, 14591, 114591]);
  assert.deepEqual(numerosQueTrae('yaris 234ifn'), [1459, 14591, 114591]);
  assert.deepEqual(numerosQueTrae('014 pérez'), [], '«014» no está en ningún lado: el contrato 14 existe y no debe inventarse');
  assert.deepEqual(numerosQueTrae('0145 pérez'), []);
  assert.deepEqual(numerosQueTrae('12 gómez'), [12, 14592], 'sin ceros nada cambia respecto a como buscaba antes');
});

test('un número sin ceros busca como siempre: por pedazos, dentro del número', () => {
  // Es el comportamiento que ya tenía «Contratos» y no se toca: «459» está dentro de varios números.
  assert.deepEqual(numerosQueTrae('459'), [1459, 4591, 14591, 14592, 114591, 145910]);
});

test('filtrar sin la lista de números se porta exactamente como antes', () => {
  assert.deepEqual(filtrar(contratos, '014591', textoDeContrato), [], 'la llamada vieja, sin números, no sabe de la hoja');
  assert.equal(filtrar(contratos, '', textoDeContrato).length, contratos.length);
  assert.equal(filtrar(contratos, '   ', textoDeContrato).length, contratos.length);
});

test('«Contratos» (la pantalla) busca con la misma regla: contratosVisibles encuentra el número del papel', () => {
  const lista = contratosVisibles(contratos, { filtro: 'todos', consulta: '014591' });
  assert.deepEqual(lista.map((c) => c.numero), [14591]);
  assert.deepEqual(contratosVisibles(contratos, { filtro: 'todos', consulta: '' }).length, contratos.length);
});

test('ninguna pantalla busca contratos por su cuenta: todas pasan por filtrarContratos, así la regla de los ceros vive una sola vez', () => {
  const archivos = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)]))
    .filter((f) => f.endsWith('.js'));
  const usan = archivos(fileURLToPath(new URL('../js', import.meta.url)))
    .filter((f) => !f.endsWith(join('nucleo', 'busqueda.js')))
    .filter((f) => readFileSync(f, 'utf8').includes('textoDeContrato'));
  assert.deepEqual(usan, [], 'quien arma el texto de un contrato a mano se salta el número del papel');
});

test('«Contratos» sigue buscando también por quién rentó (rentadoPor); solo la caja de arriba de todo lo deja fuera', () => {
  const deAna = contratoDe({ numero: 21, cliente: juan, carro: yaris, rentadoPor: 'Ana' });
  assert.deepEqual(filtrarContratos([deAna], 'ana').map((c) => c.numero), [21], 'la pantalla Contratos: como siempre');
  assert.deepEqual(filtrarContratos([deAna], 'ana', { empleado: false }), [], 'la caja: el empleado no es un nombre de cliente');
  assert.deepEqual(filtrarContratos([deAna], 'juan', { empleado: false }).map((c) => c.numero), [21], 'el cliente sí');
  assert.ok(textoDeContrato(deAna).includes('Ana'));
  assert.ok(!textoDeContrato(deAna, { empleado: false }).includes('Ana'));
});
