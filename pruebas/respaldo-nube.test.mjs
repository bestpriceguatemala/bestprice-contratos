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

test('si la lectura de los contratos falla NO se arma con la copia de esta computadora, aunque la copia traiga datos', async () => {
  const nube = nubeConDatos();
  const copiaLocal = { datos: [F.rentadoAlDia()], fallo: true, costoSinLeer: [] };
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, { ...conDinero(nube), cargarContratos: async () => copiaLocal }),
    (e) => e instanceof ErrorDeRespaldo && /contratos/.test(e.message) && /copia de esta computadora/.test(e.message),
  );
});

test('si no se pudo leer el costo del dueño de alguna renta NO se arma: el archivo diría una utilidad falsa', async () => {
  const nube = nubeConDatos({ fallan: [{ op: 'getDoc', ruta: 'contratos/c-ajeno-debe/privado/dinero' }] });
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, conDinero(nube)),
    (e) => e instanceof ErrorDeRespaldo && /costo del dueño de 1 renta/.test(e.message),
  );
});

test('si falla la lectura de los clientes, de los carros o de los pagos a dueños, NO se arma, y cada una dice cuál', async () => {
  for (const [coleccion, patron] of [['clientes', /no se arma un respaldo con datos a medias/], ['vehiculos', /no se arma un respaldo con datos a medias/]]) {
    const nube = nubeConDatos({ fallan: [{ op: 'getDocs', ruta: coleccion }] });
    // La falla del fake se declara por colección en `ruta`; getDocs la compara con el nombre de la colección.
    nube.fallan.splice(0, nube.fallan.length, { op: 'getDocs', ruta: coleccion });
    await assert.rejects(() => leerDatosDelRespaldo(2026, conDinero(nube)), (e) => e instanceof ErrorDeRespaldo && patron.test(e.message), coleccion);
  }
  const sinPagos = nubeConDatos();
  await assert.rejects(
    () => leerDatosDelRespaldo(2026, { ...conDinero(sinPagos), cargarPagos: async () => ({ datos: null, fallo: true }) }),
    (e) => e instanceof ErrorDeRespaldo && /pagos a los dueños/.test(e.message),
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
