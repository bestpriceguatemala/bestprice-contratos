// Pruebas de la ficha del empleado: el que renta los carros y cobra comisión.
//
// Espejo de pruebas/dueno.test.mjs, con lo que un empleado tiene de propio: un CÓDIGO (su hoja de Excel trabaja
// por código y en el mostrador teclea «6» o busca «Wilder», lo que sea más rápido) y un PORCENTAJE que puede ser
// cero. El cero es lo que más se cuida: Wilder es el dueño y no gana comisión, y un 0 que se lee como «no hay
// porcentaje» (o al revés) sería una comisión que nadie decidió.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPOS_EMPLEADO, PORCENTAJE_DE_COMISION_POR_DEFECTO, construirEmpleado, problemasDeEmpleado, textoDeEmpleado,
  buscarEmpleados, siguienteCodigo, estaActivo, porcentajeAnotado, ordenarEmpleados, datosDelContratoPara,
} from '../js/nucleo/empleado.js';

const wilder = () => ({ id: 'e6', codigo: '6', nombre: 'Wilder', porcentajeComision: 0, activo: true });
const ana = () => ({ id: 'e1', codigo: '1', nombre: 'Ana López', porcentajeComision: 5, activo: true });
const luis = () => ({ id: 'e16', codigo: '16', nombre: 'Luis Mérida', porcentajeComision: 5, activo: true });

test('la lista de campos contiene lo que dijo el dueño: código, nombre y porcentaje', () => {
  const ids = CAMPOS_EMPLEADO.map((c) => c.id);
  for (const necesario of ['codigo', 'nombre', 'porcentajeComision', 'activo']) {
    assert.ok(ids.includes(necesario), `falta el campo ${necesario}`);
  }
});

test('el porcentaje de un empleado nuevo arranca en 5, el de siempre', () => {
  assert.equal(PORCENTAJE_DE_COMISION_POR_DEFECTO, 5);
});

test('construir un empleado nuevo: texto recortado, porcentaje como número y activo', () => {
  const e = construirEmpleado({}, { codigo: ' 6 ', nombre: '  Wilder ', porcentajeComision: '0' });
  assert.equal(e.codigo, '6');
  assert.equal(e.nombre, 'Wilder');
  assert.strictEqual(e.porcentajeComision, 0, 'un cero escrito es un cero de verdad, un número');
  assert.strictEqual(e.activo, true, 'un empleado nuevo trabaja aquí');
});

test('editar un empleado no borra lo que la pantalla no mostró', () => {
  const existente = { id: 'e6', actualizado: 100, telefono: '5555-5555' };
  const e = construirEmpleado(existente, { codigo: '6', nombre: 'Wilder', porcentajeComision: '0' });
  assert.equal(e.id, 'e6');
  assert.equal(e.telefono, '5555-5555');
  assert.equal(e.actualizado, 100);
});

test('dar de baja no borra: activo pasa a false y el resto sigue', () => {
  const e = construirEmpleado(ana(), { activo: false });
  assert.strictEqual(e.activo, false);
  assert.equal(e.nombre, 'Ana López');
  assert.equal(e.porcentajeComision, 5);
});

test('un empleado sin la llave `activo` (uno de antes de que existiera) trabaja aquí', () => {
  assert.equal(estaActivo({ id: 'x', nombre: 'Viejo' }), true);
  assert.equal(estaActivo({ activo: true }), true);
  assert.equal(estaActivo({ activo: false }), false);
});

test('el porcentaje escrito con coma o con un texto raro no se lee como 0: queda tal cual para que se vea el problema', () => {
  assert.strictEqual(construirEmpleado({}, { porcentajeComision: '' }).porcentajeComision, '');
  assert.strictEqual(construirEmpleado({}, { porcentajeComision: 'cinco' }).porcentajeComision, 'cinco');
  assert.strictEqual(construirEmpleado({}, { porcentajeComision: '7.5' }).porcentajeComision, 7.5);
});

test('porcentajeAnotado: el cero es un porcentaje; lo vacío, lo ilegible y lo que no es número, no', () => {
  assert.strictEqual(porcentajeAnotado(0), 0);
  assert.strictEqual(porcentajeAnotado('0'), 0);
  assert.strictEqual(porcentajeAnotado(5), 5);
  assert.strictEqual(porcentajeAnotado('7.5'), 7.5);
  for (const malo of [undefined, null, '', '  ', 'cinco', NaN, Infinity, true, [], {}]) {
    assert.strictEqual(porcentajeAnotado(malo), null, `${JSON.stringify(malo)} no es un porcentaje`);
  }
});

test('un empleado sin nombre, sin código o sin porcentaje no se puede guardar, y cada falta se dice', () => {
  assert.deepEqual(problemasDeEmpleado(wilder(), []), []);
  assert.deepEqual(problemasDeEmpleado({ ...wilder(), nombre: '  ' }, []), ['Falta el nombre.']);
  assert.deepEqual(problemasDeEmpleado({ ...wilder(), codigo: '' }, []), ['Falta el código.']);
  const sinPorcentaje = problemasDeEmpleado({ ...wilder(), porcentajeComision: '' }, []);
  assert.equal(sinPorcentaje.length, 1);
  assert.match(sinPorcentaje[0], /porcentaje/);
  assert.match(sinPorcentaje[0], /0/, 'dice que quien no gana comisión lleva 0');
});

test('el porcentaje va de 0 a 100: ni negativo ni más del cien', () => {
  assert.equal(problemasDeEmpleado({ ...ana(), porcentajeComision: -1 }, []).length, 1);
  assert.equal(problemasDeEmpleado({ ...ana(), porcentajeComision: 100.01 }, []).length, 1);
  assert.deepEqual(problemasDeEmpleado({ ...ana(), porcentajeComision: 100 }, []), []);
  assert.deepEqual(problemasDeEmpleado({ ...ana(), porcentajeComision: 0 }, []), []);
});

test('dos empleados no pueden tener el mismo código: teclear «6» tiene que dar a uno solo', () => {
  const lista = [ana(), wilder()];
  const repetido = problemasDeEmpleado({ ...luis(), codigo: '6' }, lista);
  assert.equal(repetido.length, 1);
  assert.match(repetido[0], /Wilder/, 'dice de quién es ya ese código');
  assert.deepEqual(problemasDeEmpleado({ ...wilder(), nombre: 'Wilder A.' }, lista), [], 'editarse a sí mismo no choca consigo');
  assert.equal(problemasDeEmpleado({ ...luis(), codigo: ' 6 ' }, lista).length, 1, 'los espacios no esconden el choque');
  assert.equal(problemasDeEmpleado({ ...luis(), codigo: 'A1' }, [{ ...ana(), codigo: 'a1' }]).length, 1, 'ni las mayúsculas');
});

test('el código de un empleado dado de baja también cuenta: sus contratos viejos siguen siendo suyos', () => {
  const baja = { ...ana(), activo: false };
  assert.equal(problemasDeEmpleado({ ...luis(), codigo: '1' }, [baja]).length, 1);
});

test('textoDeEmpleado junta código y nombre para el buscador', () => {
  assert.equal(textoDeEmpleado(wilder()), '6 Wilder');
  assert.equal(textoDeEmpleado({}), '');
});

test('buscar por código: «6» da a Wilder primero, aunque «16» también tenga un 6', () => {
  const lista = [luis(), ana(), wilder()];
  const r = buscarEmpleados(lista, '6');
  assert.deepEqual(r.map((e) => e.id), ['e6', 'e16']);
});

test('buscar por nombre: sin acentos, sin importar mayúsculas y en cualquier orden', () => {
  const lista = [luis(), ana(), wilder()];
  assert.deepEqual(buscarEmpleados(lista, 'wilder').map((e) => e.id), ['e6']);
  assert.deepEqual(buscarEmpleados(lista, 'lopez ana').map((e) => e.id), ['e1']);
  assert.deepEqual(buscarEmpleados(lista, 'merida').map((e) => e.id), ['e16']);
});

test('buscar sin nada que coincida no inventa a nadie', () => {
  assert.deepEqual(buscarEmpleados([ana(), wilder()], 'zzz'), []);
  assert.deepEqual(buscarEmpleados([], '6'), []);
});

test('el código exacto no pisa a quien se llama igual: el nombre «6 Pinos» sigue saliendo por nombre', () => {
  const raro = { id: 'e9', codigo: '9', nombre: 'Seis 6 Pinos', porcentajeComision: 5 };
  const r = buscarEmpleados([raro, wilder()], '6');
  assert.deepEqual(r.map((e) => e.id), ['e6', 'e9']);
});

test('el siguiente código: el mayor número más uno, y 1 si no hay ninguno numérico', () => {
  assert.equal(siguienteCodigo([ana(), wilder(), luis()]), '17');
  assert.equal(siguienteCodigo([]), '1');
  assert.equal(siguienteCodigo([{ codigo: 'A1' }]), '1');
});

test('ordenar: por código como número (2 antes que 10), y por nombre a igual código', () => {
  const lista = [luis(), wilder(), ana(), { id: 'x', codigo: '', nombre: 'Sin código' }];
  assert.deepEqual(ordenarEmpleados(lista).map((e) => e.id), ['e1', 'e6', 'e16', 'x']);
});

// Lo que el contrato guarda del empleado escogido: el id, su nombre de ESE día y su porcentaje de ESE día.
test('datosDelContratoPara: id, nombre y porcentaje, y el cero de Wilder se conserva como cero', () => {
  assert.deepEqual(datosDelContratoPara(wilder()), { empleadoId: 'e6', rentadoPor: 'Wilder', porcentajeComision: 0 });
  assert.deepEqual(datosDelContratoPara(ana()), { empleadoId: 'e1', rentadoPor: 'Ana López', porcentajeComision: 5 });
});

test('datosDelContratoPara: un empleado sin porcentaje legible NO se convierte en 5 ni en 0, devuelve null', () => {
  assert.strictEqual(datosDelContratoPara({ ...ana(), porcentajeComision: undefined }), null);
  assert.strictEqual(datosDelContratoPara({ ...ana(), porcentajeComision: '' }), null);
  assert.strictEqual(datosDelContratoPara(null), null);
});
