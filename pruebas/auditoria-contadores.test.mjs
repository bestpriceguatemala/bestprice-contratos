// El número del contrato y el código de un carro: los contadores que nadie probaba.
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
import { siguienteNumeroContrato, siguienteCodigoCarro } from '../js/datos.js';
import { nubeEnMemoria } from './fixtures/nubeEnMemoria.mjs';


// ---------------------------------------------------------------------------
// El número del contrato: el que el cliente firma en el papel
// ---------------------------------------------------------------------------

const numeroDe = (nube) => siguienteNumeroContrato({ iniciar: nube.iniciar });

test('siguienteNumeroContrato: el primero es el 1, y queda anotado en contadores/contratos', async () => {
  // Nadie probaba este contador (los guardados de contratos reciben un número de mentira). Con el `tx.set` borrado
  // TODOS los contratos nuevos saldrían con el mismo número; con `+ 1` por `- 1` o el 0 por 1 la serie arrancaría mal.
  const nube = nubeEnMemoria();
  assert.equal(await numeroDe(nube), 1);
  assert.deepEqual(nube.leer('contadores/contratos'), { id: 'contratos', ultimo: 1 });
});

test('siguienteNumeroContrato: sigue donde se quedó el contador, y cada contrato recibe uno distinto', async () => {
  const nube = nubeEnMemoria({ contadores: { contratos: { ultimo: 41 } } });
  assert.equal(await numeroDe(nube), 42);
  assert.equal(await numeroDe(nube), 43);
  assert.equal(nube.leer('contadores/contratos').ultimo, 43);
});

test('siguienteNumeroContrato: un contador dañado no inventa números, empieza otra vez en 1', async () => {
  // `Number(...) || 0`: un `ultimo` ilegible (texto, vacío) no puede dar NaN; y con `&&`/`??` sí daría NaN.
  for (const ultimo of ['abc', '', null]) {
    const nube = nubeEnMemoria({ contadores: { contratos: { ultimo } } });
    assert.equal(await numeroDe(nube), 1, `ultimo ${JSON.stringify(ultimo)}`);
  }
  const textoNumerico = nubeEnMemoria({ contadores: { contratos: { ultimo: '7' } } });
  assert.equal(await numeroDe(textoNumerico), 8, 'un «7» escrito como texto sigue contando');
});

test('siguienteNumeroContrato: es SU contador — no gasta números de comprobante ni de carro', async () => {
  const nube = nubeEnMemoria({ contadores: { comprobantes: { ultimo: 100 }, vehiculos: { ultimo: 7 } } });
  assert.equal(await numeroDe(nube), 1);
  assert.equal(nube.leer('contadores/comprobantes').ultimo, 100);
  assert.equal(nube.leer('contadores/vehiculos').ultimo, 7);
});

test('siguienteNumeroContrato: dos mostradores pidiendo a la vez NO se llevan el mismo número', async () => {
  const nube = nubeEnMemoria({ contadores: { contratos: { ultimo: 9 } } });
  const numeros = await Promise.all([numeroDe(nube), numeroDe(nube), numeroDe(nube), numeroDe(nube)]);
  assert.deepEqual([...numeros].sort((a, b) => a - b), [10, 11, 12, 13], 'cuatro pedidos, cuatro números distintos');
  assert.equal(nube.leer('contadores/contratos').ultimo, 13);
});

test('siguienteNumeroContrato: la lectura y la escritura son UNA transacción, no dos pasos sueltos', async () => {
  const nube = nubeEnMemoria();
  await numeroDe(nube);
  const [lectura] = nube.llamadas.filter(([op]) => op === 'tx.get');
  const [escritura] = nube.llamadas.filter(([op]) => op === 'tx.set');
  assert.deepEqual(lectura.slice(0, 2), ['tx.get', 'contadores/contratos']);
  assert.deepEqual(escritura, ['tx.set', 'contadores/contratos', { ultimo: 1 }, 'mostrador']);
  assert.equal(nube.llamadas.filter(([op]) => op === 'getDoc' || op === 'setDoc').length, 0, 'nada fuera de la transacción');
});

test('siguienteNumeroContrato: si la nube falla, falla — no inventa un número', async () => {
  const nube = nubeEnMemoria({ fallan: [{ op: 'tx.get', ruta: 'contadores/contratos' }] });
  await assert.rejects(() => numeroDe(nube), /sin internet/);
  assert.equal(nube.leer('contadores/contratos'), undefined, 'y no deja anotado nada');
});

// ---------------------------------------------------------------------------
// El código correlativo de un carro nuevo
// ---------------------------------------------------------------------------

const codigoDe = (nube) => siguienteCodigoCarro({ iniciar: nube.iniciar });

test('siguienteCodigoCarro: el primero es el 1, sigue donde se quedó, y es SU contador', async () => {
  const nube = nubeEnMemoria({ contadores: { contratos: { ultimo: 500 } } });
  assert.equal(await codigoDe(nube), 1);
  assert.deepEqual(nube.leer('contadores/vehiculos'), { id: 'vehiculos', ultimo: 1 });
  assert.equal(await codigoDe(nube), 2);
  assert.equal(nube.leer('contadores/contratos').ultimo, 500, 'no gasta números de contrato');
  const andando = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 7 } } });
  assert.equal(await codigoDe(andando), 8);
});

test('siguienteCodigoCarro: dos mostradores dando de alta a la vez NO se llevan el mismo código', async () => {
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 4 } } });
  const codigos = await Promise.all([codigoDe(nube), codigoDe(nube), codigoDe(nube)]);
  assert.deepEqual([...codigos].sort((a, b) => a - b), [5, 6, 7]);
  assert.equal(nube.leer('contadores/vehiculos').ultimo, 7);
});

test('siguienteCodigoCarro: un contador dañado no inventa códigos, empieza otra vez en 1', async () => {
  for (const ultimo of ['abc', '', null]) {
    assert.equal(await codigoDe(nubeEnMemoria({ contadores: { vehiculos: { ultimo } } })), 1, `ultimo ${JSON.stringify(ultimo)}`);
  }
});
