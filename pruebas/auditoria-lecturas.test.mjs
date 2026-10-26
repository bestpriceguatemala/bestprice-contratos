// Leer con la copia local primero y la nube por detrás: lo que decide qué ve el dueño al abrir una pantalla.
//
// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en la capa de datos
// (js/datos.js). Cada una nació de un mutante que SOBREVIVIÓ: se le metió a propósito un error al código y las 2,589
// pruebas de entonces seguían en verde. Aquí cada una falla con ese error puesto y pasa con el código bueno. Qué le
// habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
//
// La nube y la copia local son las de mentira de pruebas/fixtures/nubeEnMemoria.mjs; los contratos salen de los
// constructores de verdad (pruebas/fixtures/contratoReal.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cargarContrato, cargarAjustes, cargarContratos, cargarContratosAbiertos, cargarFlota, cargarClientes, cargarDuenos, cargarReservas,
} from '../js/datos.js';
import { nubeEnMemoria, copiaLocalEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { contratoReal } from './fixtures/contratoReal.mjs';


// ---------------------------------------------------------------------------
// Leer un contrato por su id, y los ajustes
// ---------------------------------------------------------------------------

test('cargarContrato: sin id no va a ningún lado; con copia local la sirve sin tocar la nube', async () => {
  const c = contratoReal({ id: 'c1' });
  const sinNube = async () => { throw new Error('no debía ir a la nube'); };
  const sinCopia = async () => { throw new Error('no debía leer la copia local'); };
  assert.equal(await cargarContrato('', { iniciar: sinNube, leerCopia: sinCopia }), null);
  assert.equal(await cargarContrato(undefined, { iniciar: sinNube, leerCopia: sinCopia }), null);
  const otro = contratoReal({ id: 'c2', numero: 78 });
  const hallado = await cargarContrato('c1', { iniciar: sinNube, leerCopia: async () => [otro, c] });
  assert.equal(hallado, c, 'el de la copia local, no el de al lado');
});

test('cargarContrato: sin copia local lo pide a la nube por su id; si de verdad no existe es null, y si la nube falla LANZA', async () => {
  const c = contratoReal({ id: 'c1' });
  const nube = nubeEnMemoria({ contratos: [c] });
  const sinCopia = async () => [];
  const traido = await cargarContrato('c1', { iniciar: nube.iniciar, leerCopia: sinCopia });
  assert.deepEqual(traido, c, 'con su id y todo lo que tiene guardado');
  assert.equal(await cargarContrato('no-existe', { iniciar: nube.iniciar, leerCopia: sinCopia }), null, 'no existe: null');
  const caida = nubeEnMemoria({ contratos: [c], fallan: [{ op: 'getDoc' }] });
  await assert.rejects(() => cargarContrato('c1', { iniciar: caida.iniciar, leerCopia: sinCopia }), /sin internet/, 'no es «no existe»');
});

test('cargarAjustes: lo que el dueño guardó manda sobre los valores de siempre; sin eso, el 12 % de tarjeta', async () => {
  // Un 12 % que se quedara fijo sin leer lo que el dueño configuró dejaría el recargo de tarjeta de cada formulario mal.
  const conAjustes = nubeEnMemoria();
  conAjustes.docs.set('ajustes/general', { porcentajeTarjeta: 10, otro: 'dato' });
  assert.deepEqual(await cargarAjustes({ iniciar: conAjustes.iniciar }), { porcentajeTarjeta: 10, otro: 'dato' });
  const sinPorcentaje = nubeEnMemoria();
  sinPorcentaje.docs.set('ajustes/general', { otro: 'dato' });
  assert.deepEqual(await cargarAjustes({ iniciar: sinPorcentaje.iniciar }), { porcentajeTarjeta: 12, otro: 'dato' });
  assert.deepEqual(await cargarAjustes({ iniciar: nubeEnMemoria().iniciar }), { porcentajeTarjeta: 12 }, 'el documento no existe');
  const caida = nubeEnMemoria({ fallan: [{ op: 'getDoc' }] });
  assert.deepEqual(await cargarAjustes({ iniciar: caida.iniciar }), { porcentajeTarjeta: 12 }, 'la nube no contesta: no truena');
  assert.deepEqual(await cargarAjustes({ iniciar: async () => { throw new Error('no arrancó'); } }), { porcentajeTarjeta: 12 });
});

// ---------------------------------------------------------------------------
// Leer con la copia local primero y la nube por detrás
// ---------------------------------------------------------------------------

const espera = (ms = 15) => new Promise((ok) => { setTimeout(ok, ms); });

/** Las dependencias de una lectura, con la nube y la copia local de mentira, y lo que `alLlegar` fue recibiendo. */
function lectura({ locales = [], contratos = [], fallan = [] } = {}) {
  const nube = nubeEnMemoria({ contratos, fallan });
  const copia = copiaLocalEnMemoria(locales);
  const llegadas = [];
  return {
    nube,
    copia,
    llegadas,
    alLlegar: (r) => llegadas.push(r),
    deps: {
      iniciar: nube.iniciar, leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia, borrarCopia: copia.borrarCopia,
    },
  };
}
const salio = (id, fechaSalida, extra = {}) => contratoReal({
  id, numero: Number(id.replace(/\D/g, '')) || 1, fechaSalida, dias: 2, ...extra,
});
const idsDe = (lista) => lista.map((c) => c.id).sort();

test('cargarContratos: de la copia local entrega SOLO lo del rango pedido, con los dos días de los extremos incluidos', async () => {
  // Los bordes del rango (`>=`, `<=`) y los lados abiertos (`!desde`, `!hasta`): un mes que perdiera el último día en su
  // lista, o que colara el anterior, mostraría ventas de otro mes.
  const locales = [salio('c1', '2026-09-30'), salio('c2', '2026-10-01'), salio('c3', '2026-10-15'), salio('c4', '2026-10-31'), salio('c5', '2026-11-01')];
  const pedir = async (rango) => {
    const t = lectura({ locales, contratos: locales });
    return idsDe((await cargarContratos(rango, undefined, t.deps)).datos);
  };
  assert.deepEqual(await pedir({ desde: '2026-10-01', hasta: '2026-10-31' }), ['c2', 'c3', 'c4']);
  assert.deepEqual(await pedir({ desde: '2026-10-15' }), ['c3', 'c4', 'c5'], 'sin tope por arriba');
  assert.deepEqual(await pedir({ hasta: '2026-10-01' }), ['c1', 'c2'], 'sin tope por abajo');
  assert.deepEqual(await pedir({}), ['c1', 'c2', 'c3', 'c4', 'c5'], 'sin rango: todo');
});

test('cargarContratos: sin copia local pide a la nube el rango con sus dos días de los extremos', async () => {
  const todos = [salio('c1', '2026-09-30'), salio('c2', '2026-10-01'), salio('c3', '2026-10-31'), salio('c4', '2026-11-01')];
  const t = lectura({ contratos: todos });
  const r = await cargarContratos({ desde: '2026-10-01', hasta: '2026-10-31' }, undefined, t.deps);
  assert.equal(r.fallo, false);
  assert.deepEqual(idsDe(r.datos), ['c2', 'c3']);
  assert.deepEqual([...t.copia.guardados.keys()].sort(), ['c2', 'c3'], 'y lo guarda en la copia local');
});

test('cargarContratos: lo que la nube ya no tiene (dentro de ese rango) se quita de la copia local; lo de otros meses no se toca', async () => {
  const borrado = salio('c1', '2026-10-05');
  const vigente = salio('c2', '2026-10-06');
  const deOtroMes = salio('c3', '2026-08-01');
  const t = lectura({ locales: [borrado, vigente, deOtroMes], contratos: [vigente, deOtroMes] });
  const primera = await cargarContratos({ desde: '2026-10-01', hasta: '2026-10-31' }, t.alLlegar, t.deps);
  assert.deepEqual(idsDe(primera.datos), ['c1', 'c2'], 'al instante: lo que había en la copia local');
  await espera();
  assert.equal(t.llegadas.length, 1, 'y avisa cuando la nube trae algo distinto');
  assert.deepEqual(idsDe(t.llegadas[0].datos), ['c2']);
  assert.equal(t.llegadas[0].fallo, false);
  assert.deepEqual([...t.copia.guardados.keys()].sort(), ['c2', 'c3'], 'el borrado se fue de la copia; el de agosto ni se miró');
});

test('cargarContratos: si la nube trae lo mismo que la copia local NO avisa; si falla, avisa con fallo y la copia sigue', async () => {
  const c = salio('c1', '2026-10-05');
  const igual = lectura({ locales: [c], contratos: [c] });
  const servida = await cargarContratos({ desde: '2026-10-01', hasta: '2026-10-31' }, igual.alLlegar, igual.deps);
  assert.deepEqual(servida, { datos: [c], fallo: false });
  await espera();
  assert.equal(igual.llegadas.length, 0, 'nada nuevo: no se redibuja');

  const caida = lectura({ locales: [c], contratos: [c], fallan: [{ op: 'getDocs', ruta: 'contratos' }] });
  const conCopia = await cargarContratos({ desde: '2026-10-01', hasta: '2026-10-31' }, caida.alLlegar, caida.deps);
  assert.deepEqual(conCopia, { datos: [c], fallo: false }, 'se sirve la copia local sin esperar a la nube');
  await espera();
  assert.deepEqual(caida.llegadas, [{ datos: [c], fallo: true }], 'y después se avisa que la nube falló');
  assert.deepEqual([...caida.copia.guardados.keys()], ['c1'], 'sin borrar nada de la copia local');
});

test('cargarContratos: sin copia local y con la nube caída entrega una lista vacía MARCADA como fallo, no como «no hay nada»', async () => {
  const t = lectura({ fallan: [{ op: 'getDocs', ruta: 'contratos' }] });
  assert.deepEqual(await cargarContratos({}, undefined, t.deps), { datos: [], fallo: true });
});

test('cargarFlota y compañía: cada una lee SU colección, sirve la copia local y se sincroniza con la nube', async () => {
  // Cuatro lecturas que comparten la misma sincronía: la copia local nueva se guarda, lo que la nube ya no trae se quita,
  // y un fallo de la nube nunca quita nada. Con `guardarCopia` o `borrarCopia` borrados, la copia local se quedaba
  // vieja para siempre.
  const casos = [
    ['vehiculos', cargarFlota], ['clientes', cargarClientes], ['duenos', cargarDuenos], ['reservas', cargarReservas],
  ];
  for (const [coleccion, cargar] of casos) {
    const viejo = { id: 'viejo', actualizado: 5 };
    const igual = { id: 'igual', actualizado: 5 };
    const nuevo = { id: 'nuevo', actualizado: 9 };
    const nube = nubeEnMemoria();
    nube.docs.set(`${coleccion}/igual`, { actualizado: 5 });
    nube.docs.set(`${coleccion}/nuevo`, { actualizado: 9 });
    const copia = copiaLocalEnMemoria([viejo, igual]);
    const llegadas = [];
    const deps = {
      iniciar: nube.iniciar, leerCopia: async () => copia.leerCopia(), guardarCopia: copia.guardarCopia, borrarCopia: copia.borrarCopia,
    };
    const primera = await cargar((r) => llegadas.push(r), deps);
    assert.deepEqual(idsDe(primera.datos), ['igual', 'viejo'], `${coleccion}: al instante, la copia local`);
    assert.equal(primera.fallo, false);
    await espera();
    assert.deepEqual(idsDe(llegadas[0].datos), ['igual', 'nuevo'], `${coleccion}: la nube trajo uno nuevo y ya no trae el viejo`);
    assert.deepEqual([...copia.guardados.keys()].sort(), ['igual', 'nuevo'], `${coleccion}: la copia local quedó al día`);
    assert.deepEqual(nuevo, { id: 'nuevo', actualizado: 9 });
  }
});

test('cargarContratosAbiertos: sin quien escuche no truena, y a quien escucha le llegan solo los abiertos', async () => {
  // `alLlegar && (…)` -> `||`: sin escucha se le pasaba a la sincronía una función que llama a `undefined`.
  const abierto = salio('c1', '2026-10-05');
  const cerrado = contratoReal({
    id: 'c2', numero: 2, fechaSalida: '2026-10-01', dias: 2, recibidoEl: '2026-10-03', pagos: [{ monto: 1400 }],
  });
  assert.equal(cerrado.estado, 'cerrado');
  const t = lectura({ locales: [abierto], contratos: [abierto, cerrado] });
  const errores = [];
  const alFallar = (e) => errores.push(e);
  process.once('unhandledRejection', alFallar);
  const sinEscucha = await cargarContratosAbiertos(undefined, t.deps);
  assert.deepEqual(idsDe(sinEscucha.datos), ['c1']);
  await espera(40);
  process.off('unhandledRejection', alFallar);
  assert.deepEqual(errores, [], 'ni una promesa rota por detrás');

  const t2 = lectura({ locales: [abierto], contratos: [abierto, cerrado, { ...abierto, id: 'c3', numero: 3, actualizado: 7 }] });
  await cargarContratosAbiertos(t2.alLlegar, t2.deps);
  await espera();
  assert.equal(t2.llegadas.length, 1);
  assert.deepEqual(idsDe(t2.llegadas[0].datos), ['c1', 'c3'], 'el cerrado no llega');
});
