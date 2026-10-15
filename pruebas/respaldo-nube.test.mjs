// Lo que el respaldo lee de la nube y dónde anota cuándo se bajó.
//
// La regla de estas pruebas: un respaldo NUNCA se arma con una copia vieja ni a medias. Cada lectura que puede fallar se
// hace fallar a propósito y se comprueba que el resultado es negarse con una frase, no un archivo incompleto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leerDatosDelRespaldo, leerRegistroDeRespaldos, anotarRespaldo, MENSAJE_SIN_DINERO } from '../js/respaldo/nube.js';
import { ErrorDeRespaldo } from '../js/respaldo/mapa.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import * as F from './fixtures/datosParaRespaldo.mjs';

/** Una nube con un año de datos: los clientes y carros del sistema, los contratos con su costo del dueño en `privado`. */
function nubeConDatos(opciones = {}) {
  const contratos = [F.rentadoAlDia(), F.cerradoConDeAtodo(), F.ajenoPagadoAlDueno(), F.ajenoSinPagar(), F.deOtroAnio()];
  const nube = nubeEnMemoria({
    contratos,
    privados: { 'c-ajeno-pagado': { costoDia: 300 }, 'c-ajeno-debe': { costoDia: 300 } },
    pagosDueno: F.pagosDueno(),
    ...opciones,
  });
  for (const c of F.clientes()) nube.docs.set(`clientes/${c.id}`, structuredClone(c));
  for (const v of F.vehiculos()) nube.docs.set(`vehiculos/${v.id}`, structuredClone(v));
  return nube;
}
const conDinero = (nube) => ({ iniciar: nube.iniciar, dbDinero: () => nube.dbDinero });

test('lee de la nube los clientes, los carros, los pagos a dueños y SOLO los contratos del año, con el costo del dueño puesto', async () => {
  const nube = nubeConDatos();
  const datos = await leerDatosDelRespaldo(2026, conDinero(nube));
  assert.equal(datos.clientes.length, 4);
  assert.equal(datos.vehiculos.length, 3);
  assert.equal(datos.pagosDueno.length, 1);
  assert.deepEqual(datos.contratos.map((c) => c.numero).sort(), [101, 102, 104, 105], 'el 77 es de 2025');
  const ajeno = datos.contratos.find((c) => c.numero === 104);
  assert.equal(ajeno.subarriendo.costoDia, 300, 'el costo viene de privado/dinero, leído con la sesión de dinero');
  assert.deepEqual(datos.clientes.map((c) => c.id).sort(), ['k-lopez', 'k-sin-renta', 'k-viejo', 'k-zelaya']);
});

test('el costo del dueño se lee con la base de DINERO y los pagos a dueños también: la del mostrador no puede', async () => {
  const nube = nubeConDatos();
  await leerDatosDelRespaldo(2026, conDinero(nube));
  const lecturasPrivadas = nube.llamadas.filter(([op, ruta]) => op === 'getDoc' && ruta.includes('/privado/'));
  assert.ok(lecturasPrivadas.length >= 2);
  assert.ok(lecturasPrivadas.every((l) => l[2] === 'dinero'));
  assert.ok(nube.llamadas.some(([op, col, db]) => op === 'getDocs' && col === 'pagosDueno' && db === 'dinero'));
});

test('sin sesión de dinero NO se arma: se pide la segunda contraseña, y no se lee ni un documento', async () => {
  const nube = nubeConDatos();
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, { iniciar: nube.iniciar, dbDinero: () => null }),
    (e) => e instanceof ErrorDeRespaldo && e.message === MENSAJE_SIN_DINERO,
  );
  assert.equal(nube.llamadas.length, 0);
});

// Cada lectura que el archivo necesita, rota a propósito. Lo que se exige de TODAS es lo mismo: no se arma nada, el mensaje dice
// CUÁL falló (y solo esa) y dice cómo volver a intentar. Un respaldo que se baja con una lectura caída abre, calcula y se ve
// bien, y le faltan los clientes: nadie audita un archivo que abre.
const REINTENTAR = /vuelve a apretar el botón; si sigue igual, recarga la página/;
const FRASES = {
  contratos: 'los contratos',
  pagos: 'los pagos a los dueños de carros',
  clientes: 'los clientes',
  carros: 'los carros de la flota',
};

async function seNiega(deps, quien) {
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, deps),
    (e) => {
      assert.ok(e instanceof ErrorDeRespaldo, `ErrorDeRespaldo, no ${e?.constructor?.name}`);
      assert.match(e.message, /^No se bajó nada: no se pudo leer /);
      assert.ok(e.message.includes(FRASES[quien]), `dice cuál falló: ${e.message}`);
      for (const [otra, frase] of Object.entries(FRASES)) if (otra !== quien) assert.ok(!e.message.includes(frase), `no acusa a ${frase}: ${e.message}`);
      assert.match(e.message, REINTENTAR);
      return true;
    },
    quien,
  );
}

test('si falla la lectura de los CLIENTES: no se arma, dice «los clientes» y cómo reintentar', async () => {
  const nube = nubeConDatos({ fallan: [{ op: 'getDocs', ruta: 'clientes' }] });
  await seNiega(conDinero(nube), 'clientes');
});

test('si falla la lectura de los CARROS: no se arma, dice «los carros de la flota» y cómo reintentar', async () => {
  const nube = nubeConDatos({ fallan: [{ op: 'getDocs', ruta: 'vehiculos' }] });
  await seNiega(conDinero(nube), 'carros');
});

test('si falla la lectura de los PAGOS A DUEÑOS (lanzando o con `fallo`): no se arma y lo dice', async () => {
  const nube = nubeConDatos();
  await seNiega({ ...conDinero(nube), cargarPagos: async () => ({ datos: null, fallo: true }) }, 'pagos');
  await seNiega({ ...conDinero(nube), cargarPagos: async () => { throw new Error('sin internet'); } }, 'pagos');
});

test('si falla la lectura de los CONTRATOS (lanzando, o con `fallo` y la copia de esta computadora de relleno): no se arma y lo dice', async () => {
  const nube = nubeConDatos();
  // Con `fallo: true` las pantallas sirven la copia local: un respaldo armado con ella parecería completo y podría estar atrasado.
  const copiaLocal = { datos: [F.rentadoAlDia()], fallo: true, costoSinLeer: [] };
  await seNiega({ ...conDinero(nube), cargarContratos: async () => copiaLocal }, 'contratos');
  await seNiega({ ...conDinero(nube), cargarContratos: async () => { throw new Error('sin internet'); } }, 'contratos');
});

test('si fallan varias a la vez, el mensaje las dice TODAS, no solo la primera', async () => {
  const nube = nubeConDatos({ fallan: [{ op: 'getDocs', ruta: 'clientes' }, { op: 'getDocs', ruta: 'vehiculos' }] });
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, conDinero(nube)),
    (e) => /no se pudo leer los clientes y los carros de la flota de la nube/.test(e.message) && REINTENTAR.test(e.message),
  );
  const todas = nubeConDatos({ fallan: [{ op: 'getDocs', ruta: 'clientes' }] });
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, { ...conDinero(todas), cargarContratos: async () => { throw new Error('x'); }, cargarPagos: async () => ({ datos: null, fallo: true }) }),
    (e) => /los contratos, los pagos a los dueños de carros y los clientes de la nube/.test(e.message),
  );
});

test('una lectura caída no deja NADA en la mano: la función lanza, no devuelve un archivo a medias ni una lista vacía', async () => {
  const nube = nubeConDatos({ fallan: [{ op: 'getDocs', ruta: 'clientes' }] });
  let devolvio = 'nada';
  try { devolvio = await leerDatosDelRespaldo(2026, conDinero(nube)); } catch { /* lo esperado */ }
  assert.equal(devolvio, 'nada');
});

test('si no se pudo leer el costo del dueño de alguna renta NO se arma: el archivo diría una utilidad falsa', async () => {
  const nube = nubeConDatos({ fallan: [{ op: 'getDoc', ruta: 'contratos/c-ajeno-debe/privado/dinero' }] });
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, conDinero(nube)),
    (e) => e instanceof ErrorDeRespaldo && /No se bajó nada: no se pudo leer el costo del dueño de 1 renta de la nube/.test(e.message) && REINTENTAR.test(e.message),
  );
});

test('cuándo se bajó: nunca → vacío; al anotar un año queda; al anotar otro se SUMA, no se pisa', async () => {
  const nube = nubeEnMemoria();
  assert.deepEqual(await leerRegistroDeRespaldos({ iniciar: nube.iniciar }), { porAnio: {}, fallo: false });
  await anotarRespaldo(2026, '2026-10-12', { iniciar: nube.iniciar });
  assert.deepEqual((await leerRegistroDeRespaldos({ iniciar: nube.iniciar })).porAnio, { 2026: '2026-10-12' });
  await anotarRespaldo(2027, '2027-01-05', { iniciar: nube.iniciar });
  assert.deepEqual((await leerRegistroDeRespaldos({ iniciar: nube.iniciar })).porAnio, { 2026: '2026-10-12', 2027: '2027-01-05' });
});

test('la fecha del respaldo se anota en ajustes/respaldo con la sesión del mostrador (no con la de dinero)', async () => {
  const nube = nubeEnMemoria();
  await anotarRespaldo(2026, '2026-10-12', { iniciar: nube.iniciar });
  const [escritura] = nube.escrituras('ajustes/respaldo');
  assert.deepEqual(escritura.slice(2, 5), [{ porAnio: { 2026: '2026-10-12' } }, { merge: true }, 'mostrador']);
});

test('si no se puede leer cuándo se bajó, lo dice con `fallo` y no inventa «nunca» ni «hoy»', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'getDoc', ruta: 'ajustes/respaldo' }] });
  assert.deepEqual(await leerRegistroDeRespaldos({ iniciar: nube.iniciar }), { porAnio: {}, fallo: true });
});

test('si no se puede anotar, anotarRespaldo lanza: quien llama lo dice, no lo traga', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'setDoc', ruta: 'ajustes/respaldo' }] });
  await assert.rejects(() => anotarRespaldo(2026, '2026-10-12', { iniciar: nube.iniciar }), /sin internet/);
});
