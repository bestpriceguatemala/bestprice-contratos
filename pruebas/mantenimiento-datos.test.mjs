// Pruebas de cómo se guardan los servicios de un carro (datos.js): dentro del documento del carro, leyéndolo DENTRO de la
// transacción que lo escribe.
//
// La Firestore de abajo es de MENTIRA (pruebas/fixtures/nubeEnMemoria.mjs): imita las transacciones de la de verdad —si
// alguien más escribió el documento que se leyó, se descarta y se repite— y las reglas que importan. NO prueba a Firebase.
//
// Los carros y los contratos salen de los constructores de verdad; nada escrito a mano con las llaves que la prueba necesita.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cambiarEnNubeYLocal, registrarServicioDelCarro, anularServicioDelCarro, cambiarIntervaloDelCarro, nuevoIdServicio,
  cargarTodosLosContratos, cargarContratosAbiertos, contratosAbiertosDe, altaConIdFijo, CODIGO_DOCUMENTO_NO_ESTA, MENSAJE_CARRO_NO_ESTA,
} from '../js/datos.js';
import { nubeEnMemoria, copiaLocalEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { carroPropio, carroConServicios } from './fixtures/carroConServicios.mjs';
import { contratoConKilometraje } from './fixtures/contratoConKilometraje.mjs';
import { kilometrajeDelCarro } from '../js/nucleo/mantenimiento.js';

const HOY = '2026-10-16';

/** La nube con el carro `v1` ya guardado (sin su `id` adentro, como lo devuelve `setDoc`) y la copia local con él. */
function conCarro(carro = carroPropio()) {
  const nube = nubeEnMemoria();
  const { id, ...sinId } = carro;
  nube.docs.set(`vehiculos/${id}`, structuredClone(sinId));
  const copia = copiaLocalEnMemoria([carro]);
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {}, hoy: HOY };
  return { nube, copia, deps };
}

const servicio = (campos = {}) => ({
  id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000, ...campos,
});

test('registrar un servicio lo escribe dentro del documento del carro y deja todo lo demás del carro como estaba', async () => {
  const carro = { ...carroPropio(), fueraDeServicio: true, motivoFueraDeServicio: 'Taller de choque' };
  const { nube, copia, deps } = conCarro(carro);
  const guardado = await registrarServicioDelCarro('v1', servicio(), deps);

  const enNube = nube.leer('vehiculos/v1');
  assert.deepEqual(enNube.servicios, [{ id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 }]);
  assert.equal(enNube.placas, 'P-111AAA');
  assert.equal(enNube.fueraDeServicio, true, 'el resto del carro no se toca');
  assert.equal(enNube.motivoFueraDeServicio, 'Taller de choque');
  assert.equal(enNube.propiedad, 'Propio');
  assert.deepEqual(guardado, enNube, 'lo que devuelve es el carro como quedó');
  assert.deepEqual(copia.guardados.get('v1'), enNube, 'la copia local queda con el carro entero y al día');
  assert.equal(nube.escriturasEnTransaccion('vehiculos/v1').length, 1);
});

test('registrar NO escribe lo que la pantalla tenía en memoria: si otra computadora cambió el carro mientras tanto, eso se queda', async () => {
  const { nube, deps } = conCarro();
  // Otra computadora marcó el carro fuera de servicio Y anotó un servicio, y esta pantalla no se enteró.
  nube.docs.set('vehiculos/v1', {
    ...structuredClone(nube.docs.get('vehiculos/v1')),
    fueraDeServicio: true,
    motivoFueraDeServicio: 'Revisión',
    servicios: [{ id: 's-otro', tipo: 'frenos', fecha: '2026-10-01', km: 18000 }],
  });
  await registrarServicioDelCarro('v1', servicio(), deps);
  const enNube = nube.leer('vehiculos/v1');
  assert.deepEqual(enNube.servicios.map((s) => s.id), ['s-otro', 's-1'], 'el servicio de la otra computadora no se perdió');
  assert.equal(enNube.fueraDeServicio, true);
  assert.equal(enNube.motivoFueraDeServicio, 'Revisión');
});

test('dos servicios anotados al mismo tiempo quedan los DOS (la transacción se repite si alguien tocó lo que leyó)', async () => {
  const { nube, deps } = conCarro();
  await Promise.all([
    registrarServicioDelCarro('v1', servicio({ id: 's-a', tipo: 'aceite' }), deps),
    registrarServicioDelCarro('v1', servicio({ id: 's-b', tipo: 'frenos', km: 14000 }), deps),
    anularServicioDelCarro('v1', 's-a', { ...deps }).catch(() => {}),
  ]);
  const ids = nube.leer('vehiculos/v1').servicios.map((s) => s.id).sort();
  assert.deepEqual(ids, ['s-a', 's-b']);
});

test('un reintento con el mismo id no duplica el servicio (el guardado anterior sí había llegado)', async () => {
  const { nube, deps } = conCarro();
  await registrarServicioDelCarro('v1', servicio(), deps);
  await registrarServicioDelCarro('v1', servicio(), deps);
  assert.equal(nube.leer('vehiculos/v1').servicios.length, 1);
});

test('el sello `actualizado` sube siempre, aunque el reloj de esta computadora vaya atrasado', async () => {
  const { nube, deps } = conCarro({ ...carroPropio(), actualizado: Date.now() + 3_600_000 });
  const antes = nube.leer('vehiculos/v1').actualizado;
  const guardado = await registrarServicioDelCarro('v1', servicio(), deps);
  assert.ok(guardado.actualizado > antes, 'si no, la copia vieja ganaría en mezclar() y el servicio parecería perdido');
  assert.equal(nube.leer('vehiculos/v1').actualizado, guardado.actualizado);
});

test('anular marca el servicio y lo deja en el historial; anular otra vez no cambia la fecha', async () => {
  const { nube, deps } = conCarro(carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-10-10', km: 150000, id: 's-1' }], HOY));
  await anularServicioDelCarro('v1', 's-1', { ...deps, fecha: '2026-10-16' });
  assert.deepEqual(nube.leer('vehiculos/v1').servicios, [
    { id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 150000, anulado: true, anuladoEn: '2026-10-16' },
  ]);
  await anularServicioDelCarro('v1', 's-1', { ...deps, fecha: '2026-11-01' });
  assert.equal(nube.leer('vehiculos/v1').servicios[0].anuladoEn, '2026-10-16');
});

test('anular un servicio que no está lo dice y no escribe nada', async () => {
  const { nube, deps } = conCarro();
  await assert.rejects(anularServicioDelCarro('v1', 'no-existe', deps), /ya no está/);
  assert.equal(nube.escriturasEnTransaccion('vehiculos/v1').length, 0);
});

test('cambiar un intervalo lo guarda en el carro; volverlo a los de siempre QUITA la llave de la nube (no se queda con merge)', async () => {
  const { nube, copia, deps } = conCarro();
  await cambiarIntervaloDelCarro('v1', 'aceite', { km: 7500, meses: 4 }, deps);
  assert.deepEqual(nube.leer('vehiculos/v1').intervalos, { aceite: { km: 7500, meses: 4 } });
  await cambiarIntervaloDelCarro('v1', 'frenos', { km: 25000, meses: 12 }, deps);
  assert.deepEqual(nube.leer('vehiculos/v1').intervalos, { aceite: { km: 7500, meses: 4 }, frenos: { km: 25000, meses: 12 } });
  await cambiarIntervaloDelCarro('v1', 'aceite', null, deps);
  assert.deepEqual(nube.leer('vehiculos/v1').intervalos, { frenos: { km: 25000, meses: 12 } }, 'el de aceite desapareció de verdad');
  assert.deepEqual(copia.guardados.get('v1').intervalos, { frenos: { km: 25000, meses: 12 } });
});

test('un carro que ya no está en la nube no se crea a medias: se rechaza con su código y no se escribe nada', async () => {
  const { nube, copia, deps } = conCarro();
  const error = await registrarServicioDelCarro('v-fantasma', servicio(), deps).then(() => null, (e) => e);
  assert.equal(error.codigo, CODIGO_DOCUMENTO_NO_ESTA);
  assert.equal(error.message, MENSAJE_CARRO_NO_ESTA);
  assert.equal(nube.docs.has('vehiculos/v-fantasma'), false);
  assert.equal(copia.guardados.has('v-fantasma'), false);
});

test('un servicio mal formado no se guarda aunque una pantalla lo mande (se revisa con la misma regla del formulario)', async () => {
  const { nube, deps } = conCarro();
  for (const malo of [
    servicio({ tipo: 'inventado' }), servicio({ fecha: '' }), servicio({ fecha: '2026-10-17' }), servicio({ km: 0 }), servicio({ km: 15000.5 }),
  ]) {
    await assert.rejects(registrarServicioDelCarro('v1', malo, deps), JSON.stringify(malo));
  }
  await assert.rejects(registrarServicioDelCarro('v1', servicio({ id: undefined }), deps), /trae su id/);
  assert.equal(nube.escriturasEnTransaccion('vehiculos/v1').length, 0);
});

test('un servicio sin kilometraje se guarda con km null, no con 0', async () => {
  const { nube, deps } = conCarro();
  await registrarServicioDelCarro('v1', servicio({ km: null }), deps);
  assert.equal(nube.leer('vehiculos/v1').servicios[0].km, null);
  await registrarServicioDelCarro('v1', servicio({ id: 's-2', km: '' }), deps);
  assert.equal(nube.leer('vehiculos/v1').servicios[1].km, null);
});

test('si la nube no contesta NO se dice que se guardó: lanza, y la copia local no se toca', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'tx.get' }] });
  nube.docs.set('vehiculos/v1', structuredClone({ ...carroPropio(), id: undefined }));
  const copia = copiaLocalEnMemoria([carroPropio()]);
  const antes = structuredClone(copia.guardados.get('v1'));
  await assert.rejects(registrarServicioDelCarro('v1', servicio(), { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {}, hoy: HOY }), /sin internet/);
  assert.deepEqual(copia.guardados.get('v1'), antes);
  assert.equal(nube.escriturasEnTransaccion('vehiculos/v1').length, 0);
});

test('si la nube lo guardó pero la copia local falla, el cambio salió bien: se avisa y no revienta', async () => {
  const { nube, deps } = conCarro();
  const avisos = [];
  const guardado = await registrarServicioDelCarro('v1', servicio(), {
    ...deps, guardarCopia: async () => { throw new Error('disco lleno'); }, avisar: (coleccion, error) => avisos.push([coleccion, error.message]),
  });
  assert.equal(guardado.servicios.length, 1);
  assert.equal(nube.leer('vehiculos/v1').servicios.length, 1);
  assert.deepEqual(avisos, [['vehiculos', 'disco lleno']]);
});

test('cambiarEnNubeYLocal: el cambio recibe lo que la nube tiene AHORA, con su id, y lo que devuelve se escribe entero', async () => {
  const { nube, deps } = conCarro();
  let recibido;
  const r = await cambiarEnNubeYLocal('vehiculos', 'v1', (doc) => { recibido = doc; return { ...doc, color: 'Negro' }; }, deps);
  assert.equal(recibido.id, 'v1');
  assert.equal(recibido.color, 'Blanco');
  assert.equal(r.color, 'Negro');
  assert.equal(nube.leer('vehiculos/v1').color, 'Negro');
  // Aunque el cambio olvide el id o el sello, no se pierden.
  const sinSello = await cambiarEnNubeYLocal('vehiculos', 'v1', () => ({ placas: 'P-222BBB' }), deps);
  assert.equal(sinSello.id, 'v1');
  assert.ok(sinSello.actualizado > 0);
});

test('estructura: los tres cambios de un carro pasan por cambiarEnNubeYLocal y ninguno llama a guardarLocal suelto', () => {
  const fuente = readFileSync(new URL('../js/datos.js', import.meta.url), 'utf8');
  for (const nombre of ['registrarServicioDelCarro', 'anularServicioDelCarro', 'cambiarIntervaloDelCarro']) {
    const inicio = fuente.indexOf(`export async function ${nombre}(`);
    assert.ok(inicio > 0, nombre);
    const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}\n', inicio));
    assert.ok(cuerpo.includes("cambiarEnNubeYLocal('vehiculos'"), `${nombre} no pasa por cambiarEnNubeYLocal`);
    assert.ok(!/guardarLocal\(/.test(cuerpo), `${nombre} llama a guardarLocal directo`);
    assert.ok(!/guardarVehiculo\(/.test(cuerpo), `${nombre} reescribe el carro con la copia de la pantalla`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// El id de un servicio
// ---------------------------------------------------------------------------------------------------------------

test('nuevoIdServicio: cada uno es distinto y no vacío', () => {
  const ids = new Set(Array.from({ length: 50 }, () => nuevoIdServicio()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^s-.{6,}$/);
});

test('el id se decide una vez por intención: los reintentos caen en el mismo, y el siguiente servicio es otro', async () => {
  const alta = altaConIdFijo(nuevoIdServicio);
  const primero = await alta.paraGuardar({ tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  const reintento = await alta.paraGuardar({ tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  assert.equal(primero.id, reintento.id);
  alta.terminada();
  const siguiente = await alta.paraGuardar({ tipo: 'frenos', fecha: '2026-10-11', km: 15000 });
  assert.notEqual(siguiente.id, primero.id);
});

test('de punta a punta con el id fijo: un guardado que venció pero llegó, reintentado, deja UN servicio', async () => {
  const { nube, deps } = conCarro();
  const alta = altaConIdFijo(nuevoIdServicio);
  const intento1 = await alta.paraGuardar({ tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  await registrarServicioDelCarro('v1', intento1, deps); // llegó, aunque la pantalla se dio por vencida
  const intento2 = await alta.paraGuardar({ tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  await registrarServicioDelCarro('v1', intento2, deps);
  assert.equal(nube.leer('vehiculos/v1').servicios.length, 1);
});

// ---------------------------------------------------------------------------------------------------------------
// Los contratos de donde sale el kilometraje
// ---------------------------------------------------------------------------------------------------------------

test('cargarTodosLosContratos trae también los CERRADOS; cargarContratosAbiertos no — y por eso el kilometraje sale de aquella', async () => {
  const cerrado = contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  });
  assert.equal(cerrado.estado, 'cerrado');
  const afuera = contratoConKilometraje({
    id: 'c2', numero: 2, carroId: 'v2', fechaSalida: '2026-10-10', kmSalida: 5000,
  });
  const nube = nubeEnMemoria({ contratos: [cerrado, afuera] });
  const deps = (copia) => ({ iniciar: nube.iniciar, leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia, borrarCopia: copia.borrarCopia });

  const abiertos = await cargarContratosAbiertos(undefined, deps(copiaLocalEnMemoria()));
  assert.deepEqual(abiertos.datos.map((c) => c.id), ['c2']);
  assert.equal(kilometrajeDelCarro('v1', abiertos.datos), null, 'con solo los abiertos, el carro v1 saldría «sin kilometraje»');

  const todos = await cargarTodosLosContratos(undefined, deps(copiaLocalEnMemoria()));
  assert.deepEqual(todos.datos.map((c) => c.id).sort(), ['c1', 'c2']);
  assert.equal(todos.fallo, false);
  assert.equal(kilometrajeDelCarro('v1', todos.datos).km, 14800);
});

test('contratosAbiertosDe: de la lectura de TODOS saca exactamente lo que devuelve cargarContratosAbiertos (una sola regla de «abierto»)', async () => {
  const cerrado = contratoConKilometraje({ id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800 });
  const afuera = contratoConKilometraje({ id: 'c2', numero: 2, carroId: 'v2', fechaSalida: '2026-10-10', kmSalida: 5000 });
  const { estado: _sinEstado, ...viejoSinEstado } = contratoConKilometraje({ id: 'c3', numero: 3, carroId: 'v3', fechaSalida: '2026-10-11', kmSalida: 100 });
  const nube = nubeEnMemoria({ contratos: [cerrado, afuera, viejoSinEstado] });
  const deps = (copia) => ({ iniciar: nube.iniciar, leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia, borrarCopia: copia.borrarCopia });
  const abiertos = await cargarContratosAbiertos(undefined, deps(copiaLocalEnMemoria()));
  const todos = await cargarTodosLosContratos(undefined, deps(copiaLocalEnMemoria()));
  assert.deepEqual(contratosAbiertosDe(todos.datos).map((c) => c.id).sort(), abiertos.datos.map((c) => c.id).sort());
  assert.deepEqual(contratosAbiertosDe(todos.datos).map((c) => c.id).sort(), ['c2', 'c3'], 'uno sin `estado` guardado cuenta como abierto: nunca desaparece');
  assert.deepEqual(contratosAbiertosDe(undefined), [], 'lo que no es una lista no es «todos abiertos» ni revienta');
});

// Mismo contrato que las demás lecturas (`cargarConSincronia`): con copia local se sirve al instante y la nube llega por
// detrás —si falla, lo dice por `alLlegar`—; sin copia local se espera a la nube y el fallo viene en la respuesta. La ficha
// atiende las dos formas: «no se pudo leer» nunca se dibuja como «no hay contratos».
test('cargarTodosLosContratos: con la nube caída, SIN copia local, avisa el fallo y no inventa que «no hay contratos»', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'getDocs' }] });
  const copia = copiaLocalEnMemoria();
  const r = await cargarTodosLosContratos(undefined, {
    iniciar: nube.iniciar, leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia, borrarCopia: copia.borrarCopia,
  });
  assert.equal(r.fallo, true);
  assert.deepEqual(r.datos, []);
});

test('cargarTodosLosContratos: con la nube caída y copia local, sirve lo local y el fallo llega por alLlegar', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'getDocs' }] });
  const copia = copiaLocalEnMemoria([contratoConKilometraje({
    id: 'c1', numero: 1, fechaSalida: '2026-09-01', kmSalida: 14000, recibidoEl: '2026-09-05', kmEntrada: 14800,
  })]);
  let tardio;
  const llego = new Promise((ok) => { tardio = ok; });
  const r = await cargarTodosLosContratos(tardio, {
    iniciar: nube.iniciar, leerCopia: copia.leerCopia, guardarCopia: copia.guardarCopia, borrarCopia: copia.borrarCopia,
  });
  assert.equal(r.datos.length, 1, 'lo último que esta computadora sabe');
  const despues = await llego;
  assert.equal(despues.fallo, true, 'y después se entera de que la nube no contestó');
  assert.equal(despues.datos.length, 1);
});
