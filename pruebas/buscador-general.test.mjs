// La caja de búsqueda de arriba de todo, la parte que decide (nucleo/buscadorGeneral.js): qué se encuentra, en qué orden, a dónde lleva cada
// cosa y qué se le dice cuando no hay nada. Sin DOM y sin nube.
//
// Todo se arma con los constructores reales (fixtures/negocioParaBuscar.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarEnTodo, filasVisibles, filaUnica, rutaDe, textoSinNada, textoDeLoQueFalta, textoDeLoQueTarda, FILAS_POR_GRUPO,
} from '../js/nucleo/buscadorGeneral.js';
import { clienteDe, carroDe, contratoDe } from './fixtures/negocioParaBuscar.mjs';

const juan = clienteDe('k1', {
  nombres: 'Juan Carlos', apellidos: 'Pérez Roldán', documento: '2999 11111 0101', licencia: '3786732380101', telefono: '3078-4155', correo: 'juan@correo.com',
});
const ana = clienteDe('k2', {
  nombres: 'Ana', apellidos: 'Gómez', documento: '0123 45678 0101', telefono: '5551-0123',
});
const yaris = carroDe('v1', { placas: 'P-234IFN', marca: 'Toyota', linea: 'Yaris', color: 'Blanco' });
const hilux = carroDe('v2', { placas: 'P-012ABC', marca: 'Toyota', linea: 'Hilux', color: 'Negro' });

const ajeno = {
  placas: 'C-777XYZ', tipo: 'Pickup', marca: 'Nissan', color: 'Rojo', modelo: 'Frontier', dueno: 'Mario López', costoDia: 300,
};

const clientes = [juan, ana];
const carros = [yaris, hilux];
const contratos = [
  contratoDe({ numero: 14591, cliente: juan, carro: yaris, fechaSalida: '2026-10-01' }),
  contratoDe({ numero: 14592, cliente: ana, carro: hilux, fechaSalida: '2026-10-03' }),
  contratoDe({ numero: 14500, cliente: ana, carro: yaris, fechaSalida: '2026-09-01', recibidoEl: '2026-09-04', danos: 0 }),
  contratoDe({ numero: 14400, cliente: juan, carroAjeno: ajeno, fechaSalida: '2026-08-01', recibidoEl: '2026-08-04', danos: 0 }),
];
const todo = { clientes, carros, contratos };
const buscar = (consulta, listas = todo, opciones) => buscarEnTodo(listas, consulta, opciones);
const grupo = (resultado, tipo) => resultado.grupos.find((g) => g.tipo === tipo);

test('una consulta vacía o de puros espacios no busca nada (no devuelve «todo»)', () => {
  for (const vacia of ['', '   ', '\t', null, undefined]) {
    const r = buscar(vacia);
    assert.equal(r.vacia, true);
    assert.deepEqual(r.grupos, []);
    assert.equal(r.total, 0);
  }
});

test('los grupos salen en el orden del letrero (cliente, placas, contrato) y solo los que tienen algo', () => {
  const r = buscar('toyota');
  assert.deepEqual(r.grupos.map((g) => g.tipo), ['carros', 'contratos'], 'ningún cliente se llama Toyota: ese grupo no sale');
  const r2 = buscar('ana');
  assert.deepEqual(r2.grupos.map((g) => g.tipo), ['clientes', 'contratos']);
});

test('un cliente se encuentra por nombre, apellido, DPI, licencia, teléfono o correo — sin acentos y en cualquier orden', () => {
  for (const consulta of ['juan', 'roldan', 'perez juan', 'ROLDÁN PÉREZ', '2999 11111', '3786732380101', '3078-4155', '30784155', '4155', 'juan@correo']) {
    const r = buscar(consulta);
    assert.deepEqual(grupo(r, 'clientes').filas.map((f) => f.id), ['k1'], `«${consulta}» debe encontrar a Juan`);
  }
});

test('las placas encuentran el carro de la flota y también los contratos de ese carro', () => {
  const r = buscar('P-234IFN');
  assert.deepEqual(grupo(r, 'carros').filas.map((f) => f.id), ['v1']);
  assert.deepEqual(grupo(r, 'contratos').filas.map((f) => f.dato.numero), [14591, 14500], 'los dos contratos del Yaris, el más reciente primero');
  assert.equal(grupo(r, 'clientes'), undefined);
  for (const escrito of ['p234ifn', '234ifn', 'P 234 IFN']) {
    assert.deepEqual(grupo(buscar(escrito), 'carros').filas.map((f) => f.id), ['v1'], escrito);
  }
});

test('un carro AJENO no tiene ficha: se alcanza por el contrato que lo rentó, y solo así', () => {
  const r = buscar('C-777XYZ');
  assert.equal(grupo(r, 'carros'), undefined, 'un carro ajeno no entra a la flota');
  assert.deepEqual(grupo(r, 'contratos').filas.map((f) => f.dato.numero), [14400]);
  assert.equal(filaUnica(r).ruta, '#/contratos/c-14400');
});

test('el número de la hoja, «014591», lleva al contrato 14591 y a nada más', () => {
  const r = buscar('014591');
  assert.equal(r.total, 1);
  assert.deepEqual(r.grupos.map((g) => g.tipo), ['contratos']);
  assert.equal(filaUnica(r).dato.numero, 14591);
  assert.equal(filaUnica(r).ruta, '#/contratos/c-14591');
});

test('«№ 014591» pegado del papel también', () => {
  assert.equal(filaUnica(buscar('№ 014591')).dato.numero, 14591);
});

test('el número escrito sin ceros va primero: antes que los que solo lo llevan dentro', () => {
  // 14591 es de Juan; «1459» está dentro de varios números. Escribir «14591» pone el 14591 primero aunque haya contratos más nuevos
  // que lo contengan, y escribir «459» los pone a todos juntos (ninguno ES el 459).
  const masNuevos = [
    ...contratos,
    contratoDe({ numero: 114591, cliente: ana, carro: hilux, fechaSalida: '2026-10-20' }),
    contratoDe({ numero: 145910, cliente: ana, carro: hilux, fechaSalida: '2026-10-21' }),
  ];
  const r = buscar('14591', { clientes, carros, contratos: masNuevos });
  assert.deepEqual(grupo(r, 'contratos').filas.map((f) => f.dato.numero), [14591, 145910, 114591]);
});

test('si lo escrito es EXACTAMENTE el número de un contrato, los contratos van primero (el papel en la mano); si no, el orden del letrero', () => {
  // «14591» está también dentro del DPI de un cliente: sin esto el cliente saldría arriba y el contrato, el que se leyó del papel, abajo.
  const rosa = clienteDe('k8', { nombres: 'Rosa', apellidos: 'Díaz', documento: '9 14591 2 0101' });
  const lista = { clientes: [...clientes, rosa], carros, contratos };
  assert.deepEqual(buscar('14591', lista).grupos.map((g) => g.tipo), ['contratos', 'clientes']);
  assert.deepEqual(buscar('014591', lista).grupos.map((g) => g.tipo), ['contratos'], 'con el cero, el DPI de Rosa ya no lo contiene');
  assert.equal(filasVisibles(buscar('14591', lista))[0].dato.numero, 14591, 'y el primero de todos es el contrato');
  // «459» no es el número de ningún contrato: aquí no hay nada que subir.
  assert.deepEqual(buscar('4591', { clientes: [...clientes, clienteDe('k7', { nombres: 'Raúl', apellidos: 'Sosa', documento: '4591 22222 0101' })], carros, contratos: [contratoDe({ numero: 94591, cliente: ana, carro: hilux })] }).grupos.map((g) => g.tipo), ['clientes', 'contratos']);
  // Y una consulta de más de una palabra nunca es «el número».
  assert.deepEqual(buscar('14591 pérez', lista).grupos.map((g) => g.tipo), ['contratos']);
});

test('el que ES el número no se queda fuera cuando hay más contratos que filas', () => {
  const lleno = [contratoDe({ numero: 459, cliente: juan, carro: yaris, fechaSalida: '2020-01-01' })];
  for (let n = 1; n <= 30; n += 1) {
    lleno.push(contratoDe({ numero: 10000 + n * 1000 + 459, cliente: ana, carro: hilux, fechaSalida: `2026-10-${String(n % 28 + 1).padStart(2, '0')}` }));
  }
  const r = buscar('459', { clientes, carros, contratos: lleno });
  const g = grupo(r, 'contratos');
  assert.equal(g.total, 31);
  assert.equal(g.filas.length, FILAS_POR_GRUPO);
  assert.equal(g.filas[0].dato.numero, 459, 'el contrato 459, aunque sea el más viejo de todos, sale primero');
  assert.equal(g.faltan, 31 - FILAS_POR_GRUPO);
});

test('lo que se encontró se cuenta entero aunque solo se enseñen algunas filas', () => {
  const muchos = [];
  for (let i = 0; i < 20; i += 1) muchos.push(clienteDe(`m${i}`, { nombres: `Mario${i}`, apellidos: 'Díaz' }));
  const r = buscar('diaz', { clientes: muchos, carros: [], contratos: [] });
  const g = grupo(r, 'clientes');
  assert.equal(g.total, 20);
  assert.equal(g.filas.length, FILAS_POR_GRUPO);
  assert.equal(g.faltan, 20 - FILAS_POR_GRUPO);
  assert.equal(r.total, 20);
  assert.equal(filasVisibles(r).length, FILAS_POR_GRUPO);
  assert.equal(filaUnica(r), null, 'con veinte coincidencias Enter no elige');
});

test('el límite de filas se puede cambiar', () => {
  const r = buscar('toyota', todo, { limite: 1 });
  assert.equal(grupo(r, 'carros').filas.length, 1);
  assert.equal(grupo(r, 'carros').faltan, 1);
});

test('Enter solo elige cuando hay UNA coincidencia en total: con dos clases distintas no elige por él', () => {
  // Un cliente cuyo DPI lleva el mismo número que un contrato: nadie sabe cuál se quería.
  const raro = clienteDe('k9', { nombres: 'Raúl', apellidos: 'Díaz', documento: '1459 22222 0101' });
  const r = buscar('14591', { clientes: [...clientes, clienteDe('k8', { nombres: 'Rosa', apellidos: 'Díaz', documento: '9 14591 2 0101' }), raro], carros, contratos });
  assert.equal(grupo(r, 'contratos').filas.length, 1);
  assert.equal(grupo(r, 'clientes').filas.length, 1);
  assert.equal(r.total, 2);
  assert.equal(filaUnica(r), null, 'un contrato y un cliente: se le enseñan los dos');
});

test('un carro y su contrato también son dos coincidencias: Enter no elige entre la ficha del carro y la renta', () => {
  const r = buscar('P-012ABC', { clientes, carros, contratos: [contratos[1]] });
  assert.equal(grupo(r, 'carros').filas.length, 1);
  assert.equal(grupo(r, 'contratos').filas.length, 1);
  assert.equal(filaUnica(r), null);
});

test('sin coincidencias no hay fila única', () => {
  assert.equal(filaUnica(buscar('zzzz')), null);
  assert.equal(buscar('zzzz').total, 0);
});

test('cada fila lleva a la ficha de lo que es, con el id escapado para la dirección', () => {
  assert.equal(rutaDe('clientes', 'k1'), '#/clientes/k1');
  assert.equal(rutaDe('carros', 'v1'), '#/carros/v1');
  assert.equal(rutaDe('contratos', 'c-14591'), '#/contratos/c-14591');
  assert.equal(rutaDe('clientes', 'a/b c#d'), '#/clientes/a%2Fb%20c%23d', 'un id raro no parte la dirección');
  const r = buscar('juan');
  assert.equal(grupo(r, 'clientes').filas[0].ruta, '#/clientes/k1');
});

test('lo que no tiene id no se puede abrir y no sale (ni cuenta)', () => {
  const sinId = { ...contratos[0], id: undefined };
  const r = buscar('014591', { clientes: [], carros: [], contratos: [sinId] });
  assert.equal(r.total, 0);
  const cliente = { ...juan, id: '' };
  assert.equal(buscar('juan', { clientes: [cliente], carros: [], contratos: [] }).total, 0);
});

test('listas ausentes no revientan', () => {
  assert.equal(buscarEnTodo({}, 'juan').total, 0);
  assert.equal(buscarEnTodo(undefined, 'juan').total, 0);
  assert.equal(buscarEnTodo({ clientes: [juan] }, 'juan').total, 1);
});

test('los clientes salen por orden alfabético y los carros por placas', () => {
  const dos = [clienteDe('z', { nombres: 'Zoila', apellidos: 'Díaz' }), clienteDe('a', { nombres: 'Abel', apellidos: 'Díaz' })];
  assert.deepEqual(grupo(buscar('diaz', { clientes: dos, carros: [], contratos: [] }), 'clientes').filas.map((f) => f.id), ['a', 'z']);
  const placas = [carroDe('b', { placas: 'P-900ZZZ', marca: 'Kia' }), carroDe('a', { placas: 'P-100AAA', marca: 'Kia' })];
  assert.deepEqual(grupo(buscar('kia', { clientes: [], carros: placas, contratos: [] }), 'carros').filas.map((f) => f.id), ['a', 'b']);
});

// ---------- Lo que se le dice cuando no hay nada ----------

const lista = (extra = {}) => ({
  datos: [], fallo: false, asentada: true, servida: true, ...extra,
});
const todasLeidas = { clientes: lista(), carros: lista(), contratos: lista() };

test('sin nada que enseñar y todo leído: «Sin resultados.»', () => {
  assert.deepEqual(textoSinNada(todasLeidas), { clase: 'nada', texto: 'Sin resultados.' });
});

test('sin nada que enseñar y la nube todavía contestando: «Buscando…», no «Sin resultados»', () => {
  const r = textoSinNada({ ...todasLeidas, contratos: lista({ asentada: false }) });
  assert.equal(r.clase, 'buscando');
  assert.equal(r.texto, 'Buscando…');
  assert.ok(!/Sin resultados/.test(r.texto));
});

test('una lectura que falló NUNCA se dice como «Sin resultados»: se dice que no se sabe', () => {
  const r = textoSinNada({ ...todasLeidas, contratos: lista({ fallo: true }) });
  assert.equal(r.clase, 'fallo');
  assert.ok(!/Sin resultados/.test(r.texto), r.texto);
  assert.match(r.texto, /y no se pudieron leer los contratos de la nube: no se sabe si existe/);
  assert.match(r.texto, /no se sabe si existe/);
  assert.match(r.texto, /Revisa tu conexión/);
});

test('el fallo manda sobre la espera, y se nombra lo que falló, en singular y en plural', () => {
  const r = textoSinNada({ clientes: lista({ fallo: true }), carros: lista({ asentada: false }), contratos: lista({ fallo: true }) });
  assert.equal(r.clase, 'fallo');
  assert.match(r.texto, /los clientes y los contratos/);
  assert.ok(!/la flota/.test(r.texto));
  const tres = textoSinNada({ clientes: lista({ fallo: true }), carros: lista({ fallo: true }), contratos: lista({ fallo: true }) });
  assert.match(tres.texto, /los clientes, la flota y los contratos/);
});

test('una lista que falta del todo cuenta como no leída, nunca como vacía', () => {
  assert.equal(textoSinNada({ clientes: lista(), carros: lista() }).clase, 'fallo');
  assert.equal(textoSinNada(undefined).clase, 'fallo');
});

test('lo encontrado con una lista caída lleva debajo que puede estar incompleto; sin caída, nada; en espera, nada', () => {
  assert.equal(textoDeLoQueFalta(todasLeidas), '');
  assert.equal(textoDeLoQueFalta({ ...todasLeidas, carros: lista({ asentada: false }) }), '', 'esperar a la nube no es un fallo');
  const falta = textoDeLoQueFalta({ ...todasLeidas, carros: lista({ fallo: true }) });
  assert.match(falta, /^No se pudo leer la flota de la nube\. Lo que ves puede estar incompleto\.$/, 'la flota va en singular');
  assert.match(textoDeLoQueFalta({ ...todasLeidas, clientes: lista({ fallo: true }) }), /^No se pudieron leer los clientes de la nube\./);
  assert.match(textoSinNada({ ...todasLeidas, carros: lista({ fallo: true }) }).texto, /y no se pudo leer la flota de la nube/);
});

test('mientras una lista entera todavía no entrega nada, lo encontrado lleva debajo «Buscando…»; con todas servidas (aunque sea de la copia local), nada', () => {
  assert.equal(textoDeLoQueTarda(todasLeidas), '');
  assert.equal(textoDeLoQueTarda({ ...todasLeidas, contratos: lista({ servida: false }) }), 'Buscando…');
  assert.equal(textoDeLoQueTarda({ ...todasLeidas, contratos: lista({ asentada: false }) }), '', 'la copia local ya está a la vista: la sincronía de fondo no se avisa');
  assert.equal(textoDeLoQueTarda({ ...todasLeidas, contratos: lista({ servida: false, fallo: true }) }), '', 'lo que falló ya lo dice textoDeLoQueFalta');
  assert.equal(textoDeLoQueTarda({ clientes: lista() }), '', 'una lista que falta del todo no es «todavía no llega»');
});
