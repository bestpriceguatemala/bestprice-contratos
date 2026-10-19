// La nube falsa de las pruebas (pruebas/fixtures/nubeEnMemoria.mjs) tiene que rechazar lo mismo que rechaza la de verdad.
//
// El SDK de Firestore NO acepta un valor `undefined` en lo que se escribe (a menos que se arranque con
// `ignoreUndefinedProperties`, y `firebase-config.js` no lo hace): lanza «Unsupported field value: undefined». La nube falsa
// lo dejaba pasar, así que un `undefined` que en producción rompe un guardado —un carro con la llave `servicios` en
// `undefined`, un campo que una pantalla lee de un formulario vacío— pasaba todas las pruebas y se descubría con el dueño
// enfrente. Estas pruebas fijan que la nube falsa lo rechaza en TODA forma de escribir, y que no deja nada a medias.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nubeEnMemoria, valoresIndefinidos } from './fixtures/nubeEnMemoria.mjs';

test('valoresIndefinidos: dice dónde hay un `undefined`, en cualquier nivel, y nada más', () => {
  assert.deepEqual(valoresIndefinidos({ a: 1, b: null, c: '', d: 0, e: false, f: [], g: {} }), []);
  assert.deepEqual(valoresIndefinidos({ a: undefined }), ['a']);
  assert.deepEqual(valoresIndefinidos({ a: { b: { c: undefined } }, d: [1, { e: undefined }, undefined] }), ['a.b.c', 'd[1].e', 'd[2]']);
  assert.deepEqual(valoresIndefinidos(undefined), ['(la raíz)']);
  assert.deepEqual(valoresIndefinidos(Symbol('deleteField')), [], 'el centinela de deleteField() no es un undefined');
});

const conDocumento = () => {
  const nube = nubeEnMemoria();
  nube.docs.set('vehiculos/v1', { placas: 'P-111AAA' });
  return nube;
};

const intentos = {
  'setDoc': (nube, datos) => nube.fsMod.setDoc(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), datos),
  'setDoc con merge': (nube, datos) => nube.fsMod.setDoc(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), datos, { merge: true }),
  'updateDoc': (nube, datos) => nube.fsMod.updateDoc(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), datos),
  'Transaction.set': (nube, datos) => nube.fsMod.runTransaction(nube.dbMostrador, async (tx) => {
    await tx.get(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'));
    tx.set(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), datos);
  }),
  'WriteBatch.update': async (nube, datos) => {
    const lote = nube.fsMod.writeBatch(nube.dbMostrador);
    lote.update(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), datos);
    await lote.commit();
  },
};

for (const [forma, intentar] of Object.entries(intentos)) {
  test(`${forma}: un \`undefined\` se rechaza como lo hace el SDK, con el campo y el documento, y no se escribe nada`, async () => {
    const nube = conDocumento();
    const antes = structuredClone(nube.docs.get('vehiculos/v1'));
    for (const datos of [{ servicios: undefined }, { intervalos: { aceite: { km: undefined } } }, { servicios: [{ id: 's-1', km: undefined }] }]) {
      await assert.rejects(intentar(nube, datos), (error) => {
        assert.match(error.message, /Unsupported field value: undefined/);
        assert.match(error.message, /in document vehiculos\/v1/);
        return true;
      });
    }
    assert.deepEqual(nube.docs.get('vehiculos/v1'), antes, 'el documento quedó como estaba');
    assert.equal(nube.llamadas.filter(([op]) => ['setDoc', 'updateDoc', 'tx.set', 'commit'].includes(op)).length, 0, 'ni quedó registrada una escritura');
  });

  test(`${forma}: lo que sí es válido (null, vacío, 0, false) se sigue escribiendo`, async () => {
    const nube = conDocumento();
    await intentar(nube, { nota: null, motivo: '', km: 0, fuera: false });
    assert.deepEqual(
      { nota: nube.docs.get('vehiculos/v1').nota, motivo: nube.docs.get('vehiculos/v1').motivo, km: nube.docs.get('vehiculos/v1').km, fuera: nube.docs.get('vehiculos/v1').fuera },
      { nota: null, motivo: '', km: 0, fuera: false },
    );
  });
}

test('updateDoc sigue entendiendo deleteField() (su centinela no cuenta como `undefined`)', async () => {
  const nube = conDocumento();
  await nube.fsMod.updateDoc(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), { placas: nube.fsMod.deleteField() });
  assert.equal('placas' in nube.docs.get('vehiculos/v1'), false);
});

test('una transacción que lanza por un `undefined` no confirma NINGUNA de sus escrituras', async () => {
  const nube = conDocumento();
  nube.docs.set('contadores/vehiculos', { ultimo: 1 });
  await assert.rejects(nube.fsMod.runTransaction(nube.dbMostrador, async (tx) => {
    await tx.get(nube.fsMod.doc(nube.dbMostrador, 'contadores', 'vehiculos'));
    tx.set(nube.fsMod.doc(nube.dbMostrador, 'contadores', 'vehiculos'), { ultimo: 2 });
    tx.set(nube.fsMod.doc(nube.dbMostrador, 'vehiculos', 'v1'), { servicios: undefined });
  }), /Unsupported field value: undefined/);
  assert.equal(nube.docs.get('contadores/vehiculos').ultimo, 1);
});
