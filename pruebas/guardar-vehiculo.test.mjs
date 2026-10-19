// Cada mano escribe lo suyo en el documento del carro: la ficha (`guardarVehiculo`), el mantenimiento y el taller.
//
// El hueco: «Guardar carro», «Marcar fuera de servicio», «Volver a habilitar» y `#/habilitar/:id` escribían el carro ENTERO
// desde la copia que la pantalla tenía en memoria. Un carro lleva `servicios[]` (su historial de mantenimiento) e
// `intervalos{}`; si otra computadora anotó un servicio después de que ésta sincronizó, esa escritura devolvía `servicios[]` a
// la lista de antes —en silencio—. Y con las marcas del taller era peor: B manda el carro al taller y A, con la ficha de antes,
// guarda un color: el carro reaparecía como rentable. Estas pruebas arman DOS computadoras sobre la misma nube (cada una con su
// copia local y su pantalla abierta sobre el carro) y comprueban las dos mitades de la regla:
//
//   1. lo que tiene su propio escritor (el mantenimiento y el taller, `CAMPOS_CON_SU_PROPIO_ESCRITOR`) NUNCA sale de la copia de
//      la pantalla de la ficha: se queda como la nube lo tiene ahora; y cada escritor del taller escribe SOLO sus dos marcas;
//   2. todo lo demás SÍ sale de la pantalla: lo que él escribe se guarda (el error de al revés, una edición que no se
//      queda, es tan invisible como el primero).
//
// La Firestore de abajo es de MENTIRA (pruebas/fixtures/nubeEnMemoria.mjs): transacciones que se repiten si alguien tocó lo que
// leyeron, y —como la de verdad— rechaza un valor `undefined`. NO prueba a Firebase. Los carros salen de los constructores de
// verdad (`construirVehiculo`, `carroFueraDeServicio`, `carroHabilitado`, `carroConServicio`…), no de objetos escritos a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  guardarVehiculo, marcarCarroFueraDeServicio, habilitarCarro, registrarServicioDelCarro, anularServicioDelCarro,
  cambiarIntervaloDelCarro, nuevoIdVehiculo, altaConIdFijo, CODIGO_DOCUMENTO_NO_ESTA, MENSAJE_CARRO_NO_ESTA,
} from '../js/datos.js';
import { construirVehiculo, textoFalloAlGuardarElCarro } from '../js/pantallas/carros.js';
import {
  CAMPOS_DEL_MANTENIMIENTO, carroConServicio, carroConServicioAnulado, carroConIntervalo,
} from '../js/nucleo/mantenimiento.js';
import {
  CAMPOS_DE_LA_DISPONIBILIDAD, CAMPOS_CON_SU_PROPIO_ESCRITOR, MENSAJE_FALTA_EL_MOTIVO,
  carroConLoDeLaFicha, carroFueraDeServicio, carroHabilitado,
} from '../js/nucleo/carro.js';
import { nubeEnMemoria, copiaLocalEnMemoria, valoresIndefinidos } from './fixtures/nubeEnMemoria.mjs';
import { carroPropio, carroConServicios } from './fixtures/carroConServicios.mjs';

const HOY = '2026-10-19';
const leerFuente = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

const servicio = (campos = {}) => ({
  id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000, ...campos,
});

/**
 * El carro como lo tienen las dos computadoras antes de empezar: ya con UN servicio de antes (`s-0`). Importa que no esté
 * vacío: con `servicios` ausente, el `merge` de la escritura vieja no tocaba la llave y el hueco no se veía; el hueco es
 * una lista que RETROCEDE, y para eso la copia vieja tiene que traer una.
 */
const carroConHistoria = () => carroConServicios(carroPropio(), [{
  id: 's-0', tipo: 'general', fecha: '2026-09-01', km: 12000,
}], HOY);

/**
 * Dos computadoras sobre la misma nube. Las dos ya sincronizaron el carro `v1` (cada una tiene su copia local) y las dos
 * tienen la ficha abierta; `abrir()` es la copia que la pantalla de una de ellas tiene en memoria.
 */
function dosComputadoras(carro = carroConHistoria()) {
  const nube = nubeEnMemoria();
  const { id, ...sinId } = carro;
  nube.docs.set(`vehiculos/${id}`, structuredClone(sinId));
  const computadora = () => {
    const copia = copiaLocalEnMemoria([carro]);
    return {
      copia,
      deps: {
        iniciar: nube.iniciar,
        guardarCopia: copia.guardarCopia,
        avisar: (coleccion, error) => assert.fail(`la copia local no debía fallar (${coleccion}): ${error.message}`),
        hoy: HOY,
      },
    };
  };
  return {
    nube, A: computadora(), B: computadora(), abrir: () => structuredClone(carro),
  };
}

/** Lo que lee «Guardar carro» del formulario (carros.js, `guardar`): estos ocho y ninguno más. */
const camposDelFormulario = (carro, cambios = {}) => ({
  id: carro.id,
  codigo: carro.codigo,
  placas: carro.placas,
  tipo: carro.tipo,
  marca: carro.marca,
  linea: carro.linea,
  color: carro.color,
  modelo: carro.modelo,
  ...cambios,
});

/** «Guardar carro» tal como lo arma la pantalla, sobre la copia que ella tiene. */
const guardarDesdeElFormulario = (copiaDeLaPantalla, cambios, deps) => guardarVehiculo(
  construirVehiculo(copiaDeLaPantalla, camposDelFormulario(copiaDeLaPantalla, cambios)),
  deps,
);

const ids = (carro) => (carro.servicios ?? []).map((s) => s.id);

// ---------------------------------------------------------------------------------------------------------------
// El hueco, tal como se vio: dos computadoras
// ---------------------------------------------------------------------------------------------------------------

test('dos computadoras: B anota un servicio y A, con la copia de antes, guarda el carro — el historial sobrevive', async () => {
  const { nube, A, B, abrir } = dosComputadoras();
  const copiaDeA = abrir(); // A abrió la ficha cuando el carro tenía UN servicio
  await registrarServicioDelCarro('v1', servicio(), B.deps); // B anota el cambio de aceite: ya son dos
  assert.deepEqual(ids(nube.leer('vehiculos/v1')), ['s-0', 's-1'], 'punto de partida: los dos servicios están en la nube');

  const guardado = await guardarDesdeElFormulario(copiaDeA, { color: 'Negro' }, A.deps);

  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.color, 'Negro', 'lo que A escribió se guardó');
  assert.deepEqual(ids(enNube), ['s-0', 's-1'], 'y el servicio de B sigue ahí (la lista no retrocedió a la de A)');
  assert.deepEqual(enNube.servicios[1], { id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  assert.deepEqual(guardado, enNube, 'lo que devuelve es el carro como quedó');
  assert.deepEqual(A.copia.guardados.get('v1'), enNube, 'la copia local de A queda con el carro ENTERO: la pantalla no vuelve a ver la lista vieja');
});

test('lo mismo con un carro que todavía no tenía ningún servicio: la copia local de A no se queda sin la lista que B anotó', async () => {
  // Aquí la copia de A no trae `servicios`; la escritura vieja no tocaba la nube (el `merge` omite la llave), pero la copia
  // LOCAL de A se reemplaza entera con lo que se mandó: la pantalla de A dejaba de ver el servicio de B.
  const { nube, A, B, abrir } = dosComputadoras(carroPropio());
  const copiaDeA = abrir();
  await registrarServicioDelCarro('v1', servicio(), B.deps);

  await guardarDesdeElFormulario(copiaDeA, { color: 'Negro' }, A.deps);

  assert.deepEqual(ids(nube.leer('vehiculos/v1')), ['s-1']);
  assert.deepEqual(ids(A.copia.guardados.get('v1')), ['s-1']);
});

test('«Marcar fuera de servicio» escribe SOLO sus dos marcas: lo que otra computadora anotó o cambió mientras tanto se queda', async () => {
  const { nube, A, B, abrir } = dosComputadoras();
  abrir(); // A tiene la ficha abierta de antes… y el escritor del taller no la usa
  await registrarServicioDelCarro('v1', servicio(), B.deps);
  await guardarDesdeElFormulario(abrir(), { color: 'Rojo' }, B.deps);

  const guardado = await marcarCarroFueraDeServicio('v1', 'Taller de choque', A.deps);

  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.fueraDeServicio, true, 'lo que A pidió se guardó');
  assert.equal(enNube.motivoFueraDeServicio, 'Taller de choque');
  assert.deepEqual(ids(enNube), ['s-0', 's-1'], 'el servicio de B sigue ahí');
  assert.equal(enNube.color, 'Rojo', 'y el color que B corrigió NO vuelve al de la ficha vieja de A');
  assert.deepEqual(guardado, enNube);
  assert.deepEqual(A.copia.guardados.get('v1'), enNube, 'y la copia local de A queda con el carro entero y al día');
});

test('«Volver a habilitar» (la ficha y `#/habilitar/:id`) quita SOLO sus dos marcas, y no devuelve nada a como estaba en la copia de A', async () => {
  const { nube, A, B } = dosComputadoras(carroFueraDeServicio(carroConHistoria(), 'Revisión'));
  await registrarServicioDelCarro('v1', servicio(), B.deps);
  await guardarVehiculo({ ...nube.leer('vehiculos/v1'), color: 'Rojo' }, B.deps);

  await habilitarCarro('v1', A.deps);

  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.fueraDeServicio, false, 'lo que A pidió se guardó');
  assert.equal(enNube.motivoFueraDeServicio, '');
  assert.deepEqual(ids(enNube), ['s-0', 's-1'], 'y el servicio sigue ahí');
  assert.equal(enNube.color, 'Rojo');
});

test('marcar y habilitar cambian EXACTAMENTE las dos marcas del taller y ninguna llave más', async () => {
  const { nube, A } = dosComputadoras();
  const antes = nube.leer('vehiculos/v1');
  const cambiadas = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
  await marcarCarroFueraDeServicio('v1', 'Taller', A.deps);
  const fuera = nube.leer('vehiculos/v1');
  assert.deepEqual(cambiadas(antes, fuera).filter((k) => k !== 'actualizado'), [...CAMPOS_DE_LA_DISPONIBILIDAD].sort());
  await habilitarCarro('v1', A.deps);
  assert.deepEqual(cambiadas(fuera, nube.leer('vehiculos/v1')).filter((k) => k !== 'actualizado'), [...CAMPOS_DE_LA_DISPONIBILIDAD].sort());
});

test('marcar fuera de servicio exige un motivo, también en el escritor (no solo en el botón): sin motivo no se escribe nada', async () => {
  const { nube, A } = dosComputadoras();
  for (const motivo of ['', '   ', undefined, null]) {
    await assert.rejects(marcarCarroFueraDeServicio('v1', motivo, A.deps), { message: MENSAJE_FALTA_EL_MOTIVO });
  }
  assert.equal(nube.escriturasEnTransaccion('vehiculos/v1').length, 0);
  assert.equal(nube.leer('vehiculos/v1').fueraDeServicio, undefined);
  await marcarCarroFueraDeServicio('v1', '  Taller de choque  ', A.deps);
  assert.equal(nube.leer('vehiculos/v1').motivoFueraDeServicio, 'Taller de choque', 'y se guarda sin espacios sobrantes');
});

test('marcar y habilitar sobre un carro que ya no está, o con la nube caída, se rechazan sin escribir nada y la pantalla dice por qué', async () => {
  const { nube, A } = dosComputadoras();
  nube.docs.delete('vehiculos/v1');
  const antes = structuredClone(A.copia.guardados.get('v1'));
  for (const intento of [() => marcarCarroFueraDeServicio('v1', 'Taller', A.deps), () => habilitarCarro('v1', A.deps)]) {
    const error = await intento().then(() => null, (e) => e);
    assert.equal(error.codigo, CODIGO_DOCUMENTO_NO_ESTA);
    assert.equal(textoFalloAlGuardarElCarro(error, 'marcar el carro'), MENSAJE_CARRO_NO_ESTA);
  }
  assert.equal(nube.docs.has('vehiculos/v1'), false);
  assert.deepEqual(A.copia.guardados.get('v1'), antes);

  const caida = dosComputadoras();
  caida.nube.fallan.push({ op: 'tx.get' });
  await assert.rejects(habilitarCarro('v1', caida.A.deps), /sin internet/);
  assert.equal(caida.nube.escriturasEnTransaccion('vehiculos/v1').length, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// El carro del taller no reaparece rentable (la misma regla, otra llave)
// ---------------------------------------------------------------------------------------------------------------

test('B manda el carro al taller y A guarda su ficha desde una copia de antes — de un carro que alguna vez pasó por «Volver a habilitar» —: el carro SIGUE fuera de servicio', async () => {
  // «Volver a habilitar» deja `fueraDeServicio: false` ESCRITO; la copia de A trae esa marca y, con el guardado de antes, la devolvía a `false`.
  const { nube, A, B } = dosComputadoras();
  await habilitarCarro('v1', B.deps); // el carro ya pasó por «Volver a habilitar»: la marca es un `false` explícito, no una llave ausente
  const copiaDeA = nube.leer('vehiculos/v1'); // la ficha de A, abierta: disponible
  assert.equal(copiaDeA.fueraDeServicio, false, 'punto de partida: el `false` está escrito');
  await marcarCarroFueraDeServicio('v1', 'Taller de choque', B.deps); // B lo manda al taller

  await guardarDesdeElFormulario(copiaDeA, { color: 'Negro' }, A.deps);

  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.color, 'Negro', 'lo que A tecleó se guardó');
  assert.equal(enNube.fueraDeServicio, true, 'y el carro SIGUE en el taller');
  assert.equal(enNube.motivoFueraDeServicio, 'Taller de choque');
  assert.equal(A.copia.guardados.get('v1').fueraDeServicio, true, 'y la copia local de A ya lo sabe');
});

test('al revés: B habilita el carro y A guarda su ficha de antes (fuera de servicio): el carro NO vuelve al taller', async () => {
  const { nube, A, B } = dosComputadoras(carroFueraDeServicio(carroConHistoria(), 'Revisión'));
  const copiaDeA = nube.leer('vehiculos/v1');
  await habilitarCarro('v1', B.deps);

  await guardarDesdeElFormulario(copiaDeA, { color: 'Negro' }, A.deps);

  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.color, 'Negro');
  assert.equal(enNube.fueraDeServicio, false);
  assert.equal(enNube.motivoFueraDeServicio, '');
});

test('cada marca del taller que traiga la ficha se ignora, también la que está escrita a mano en el alta', async () => {
  for (const campo of CAMPOS_DE_LA_DISPONIBILIDAD) {
    const { nube, A, abrir } = dosComputadoras();
    await guardarVehiculo({ ...abrir(), [campo]: campo === 'fueraDeServicio' ? true : 'Lo que trae la ficha' }, A.deps);
    assert.equal(campo in nube.leer('vehiculos/v1'), false, `${campo}: la ficha no la escribe`);
  }
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
  const copia = copiaLocalEnMemoria();
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };
  const alta = altaConIdFijo(() => nuevoIdVehiculo({ iniciar: nube.iniciar }));
  const guardado = await guardarVehiculo(await alta.paraGuardar({
    ...construirVehiculo({}, {
      id: undefined, codigo: undefined, placas: 'P-123ABC', tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', modelo: '2022',
    }),
    fueraDeServicio: true,
    motivoFueraDeServicio: 'x',
  }), deps);
  assert.equal(nube.leer(`vehiculos/${guardado.id}`).fueraDeServicio, undefined, 'un carro nuevo nace disponible');
});

test('un servicio ANULADO en otra computadora no se «desanula» al guardar desde una copia atrasada', async () => {
  const { nube, A, B, abrir } = dosComputadoras(carroConServicios(carroConHistoria(), [{
    id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000,
  }], HOY));
  const copiaDeA = abrir(); // todavía sin anular
  await anularServicioDelCarro('v1', 's-1', { ...B.deps, fecha: '2026-10-18' });

  await guardarDesdeElFormulario(copiaDeA, { color: 'Rojo' }, A.deps);

  const anulado = nube.leer('vehiculos/v1').servicios.find((x) => x.id === 's-1');
  assert.equal(anulado.anulado, true);
  assert.equal(anulado.anuladoEn, '2026-10-18');
  assert.deepEqual(ids(nube.leer('vehiculos/v1')), ['s-0', 's-1']);
});

test('un intervalo que otra computadora devolvió «a los de siempre» no resucita al guardar desde una copia atrasada', async () => {
  // Con `merge`, el mapa `intervalos` de la copia vieja se mezclaba por dentro y volvía a poner la llave que B había quitado.
  const conIntervalo = carroConIntervalo(carroConHistoria(), 'aceite', { km: 7500, meses: 4 });
  const { nube, A, B, abrir } = dosComputadoras(conIntervalo);
  const copiaDeA = abrir(); // todavía con el intervalo propio
  await cambiarIntervaloDelCarro('v1', 'aceite', null, B.deps);
  assert.equal(nube.leer('vehiculos/v1').intervalos?.aceite, undefined, 'punto de partida: B lo quitó');

  await guardarDesdeElFormulario(copiaDeA, { color: 'Rojo' }, A.deps);

  assert.equal(nube.leer('vehiculos/v1').intervalos?.aceite, undefined, 'sigue quitado');
});

test('un intervalo que otra computadora CAMBIÓ no vuelve al valor de la copia atrasada', async () => {
  const conIntervalo = carroConIntervalo(carroConHistoria(), 'aceite', { km: 7500, meses: 4 });
  const { nube, A, B, abrir } = dosComputadoras(conIntervalo);
  const copiaDeA = abrir();
  await cambiarIntervaloDelCarro('v1', 'aceite', { km: 4000, meses: 3 }, B.deps);

  await guardarDesdeElFormulario(copiaDeA, { color: 'Rojo' }, A.deps);

  assert.deepEqual(nube.leer('vehiculos/v1').intervalos, { aceite: { km: 4000, meses: 3 } });
});

test('guardar el carro NO borra el historial que A misma tiene y B no vio (la copia de la nube manda en lo del mantenimiento, en los dos sentidos)', async () => {
  // La pantalla de A trae un servicio que la nube no tiene (p. ej. una copia local que se adelantó): tampoco se escribe desde ahí.
  const { nube, A, abrir } = dosComputadoras();
  const copiaDeA = carroConServicio(abrir(), { id: 's-fantasma', tipo: 'frenos', fecha: '2026-10-01', km: 18000 });

  await guardarDesdeElFormulario(copiaDeA, { color: 'Rojo' }, A.deps);

  assert.deepEqual(ids(nube.leer('vehiculos/v1')), ['s-0'], 'lo del mantenimiento solo lo escriben sus escritores (los que leen la nube dentro de la transacción)');
});

test('A guarda el carro y B anota un servicio AL MISMO TIEMPO: quedan las dos cosas', async () => {
  const { nube, A, B, abrir } = dosComputadoras();
  const copiaDeA = abrir();
  await Promise.all([
    guardarDesdeElFormulario(copiaDeA, { color: 'Verde' }, A.deps),
    registrarServicioDelCarro('v1', servicio(), B.deps),
  ]);
  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.color, 'Verde');
  assert.deepEqual(ids(enNube), ['s-0', 's-1']);
});

// ---------------------------------------------------------------------------------------------------------------
// La otra mitad: lo que él escribe SÍ se queda (el error de al revés)
// ---------------------------------------------------------------------------------------------------------------

test('cada campo del carro que la ficha escribe se guarda, aunque la nube tenga otro valor (§7b, «Del carro»)', async () => {
  // `codigo` no se prueba aquí: no se edita, se asigna una vez. `id` y `actualizado` los sella el escritor.
  const casos = [
    ['placas', 'P-999ZZZ'], ['tipo', 'Sedán'], ['marca', 'Kia'], ['linea', 'Rio'], ['color', 'Plateado'], ['modelo', '2024'],
    ['propiedad', 'Propio'], ['dueno', 'Mario López'], ['unCampoQueElFormularioNoConoce', 'se arrastra tal cual'],
  ];
  // Todo lo que NO tiene su propio escritor: si el carro llegara a tener un campo más, esta lista es la que lo recordaría.
  for (const [campo, valor] of casos) {
    const base = { ...carroPropio(), [campo]: `${valor} (de antes)` };
    const { nube, A, abrir } = dosComputadoras(base);
    await guardarVehiculo({ ...abrir(), [campo]: valor }, A.deps);
    assert.equal(nube.leer('vehiculos/v1')[campo], valor, `${campo}: la edición no se quedó`);
  }
});

test('un campo que la pantalla deja vacío («») se guarda vacío: el nombre de un color que se borra no es «no sé»', async () => {
  const { nube, A, abrir } = dosComputadoras();
  await guardarVehiculo({ ...abrir(), color: '' }, A.deps);
  assert.equal(nube.leer('vehiculos/v1').color, '');
});

test('lo que la nube tiene y la pantalla no conoce se conserva (como con `merge`, que es lo que hacía antes)', async () => {
  const { nube, A, abrir } = dosComputadoras();
  nube.docs.set('vehiculos/v1', { ...structuredClone(nube.docs.get('vehiculos/v1')), campoSoloEnLaNube: 'x' });
  await guardarDesdeElFormulario(abrir(), { color: 'Rojo' }, A.deps);
  assert.equal(nube.leer('vehiculos/v1').campoSoloEnLaNube, 'x');
});

test('un valor `undefined` en la copia de la pantalla significa «no sé», no «bórralo»: no pisa la nube ni llega a Firestore', async () => {
  const { nube, A, abrir } = dosComputadoras({ ...carroPropio(), dueno: 'Mario López' });
  await guardarVehiculo({ ...abrir(), dueno: undefined, color: 'Rojo' }, A.deps);
  const enNube = nube.leer('vehiculos/v1');
  assert.equal(enNube.dueno, 'Mario López');
  assert.equal(enNube.color, 'Rojo');
});

test('el sello `actualizado` sube siempre, aunque el reloj de esta computadora vaya atrasado, y el id y el código no cambian', async () => {
  const { nube, A, abrir } = dosComputadoras({ ...carroPropio(), actualizado: Date.now() + 3_600_000 });
  const antes = nube.leer('vehiculos/v1');
  const guardado = await guardarDesdeElFormulario(abrir(), { color: 'Rojo' }, A.deps);
  assert.ok(guardado.actualizado > antes.actualizado, 'si no, la copia vieja ganaría en mezclar() y el cambio parecería perdido');
  assert.equal(nube.leer('vehiculos/v1').actualizado, guardado.actualizado);
  assert.equal(guardado.id, 'v1');
  assert.equal(guardado.codigo, antes.codigo);
});

test('un carro que ya no está en la nube NO se vuelve a crear a medias: se rechaza con su código y no se escribe nada', async () => {
  const { nube, A, abrir } = dosComputadoras();
  nube.docs.delete('vehiculos/v1');
  const antes = structuredClone(A.copia.guardados.get('v1'));
  const error = await guardarDesdeElFormulario(abrir(), { color: 'Rojo' }, A.deps).then(() => null, (e) => e);
  assert.equal(error.codigo, CODIGO_DOCUMENTO_NO_ESTA);
  assert.equal(error.message, MENSAJE_CARRO_NO_ESTA);
  assert.equal(nube.docs.has('vehiculos/v1'), false);
  assert.deepEqual(A.copia.guardados.get('v1'), antes, 'y la copia local no se toca');
  assert.equal(textoFalloAlGuardarElCarro(error, 'guardar el carro'), MENSAJE_CARRO_NO_ESTA, 'y la pantalla dice por qué, no «intenta de nuevo»');
});

test('si la nube no contesta NO se dice que se guardó: lanza y la copia local no se toca', async () => {
  const carro = carroPropio();
  const nube = nubeEnMemoria({ fallan: [{ op: 'tx.get' }] });
  const { id, ...sinId } = carro;
  nube.docs.set(`vehiculos/${id}`, structuredClone(sinId));
  const copia = copiaLocalEnMemoria([carro]);
  const antes = structuredClone(copia.guardados.get('v1'));
  await assert.rejects(
    guardarDesdeElFormulario(structuredClone(carro), { color: 'Rojo' }, { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} }),
    /sin internet/,
  );
  assert.deepEqual(copia.guardados.get('v1'), antes);
  assert.equal(nube.escriturasEnTransaccion('vehiculos/v1').length, 0);
});

test('si la nube lo guardó pero la copia local falla, el guardado salió bien: se avisa y no revienta', async () => {
  const { nube, A, abrir } = dosComputadoras();
  const avisos = [];
  const guardado = await guardarDesdeElFormulario(abrir(), { color: 'Rojo' }, {
    ...A.deps, guardarCopia: async () => { throw new Error('disco lleno'); }, avisar: (coleccion, error) => avisos.push([coleccion, error.message]),
  });
  assert.equal(nube.leer('vehiculos/v1').color, 'Rojo');
  assert.equal(guardado.color, 'Rojo');
  assert.deepEqual(avisos, [['vehiculos', 'disco lleno']]);
});

// ---------------------------------------------------------------------------------------------------------------
// El alta: un carro que no existe todavía no tiene nada que leer
// ---------------------------------------------------------------------------------------------------------------

test('un carro NUEVO se crea como siempre: id decidido de antemano, código del contador, un solo `setDoc`, sin transacción', async () => {
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
  const copia = copiaLocalEnMemoria();
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };
  const alta = altaConIdFijo(() => nuevoIdVehiculo({ iniciar: nube.iniciar }));

  const nuevo = construirVehiculo({}, {
    id: undefined, codigo: undefined, placas: 'P-123ABC', tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', modelo: '2022',
  });
  const guardado = await guardarVehiculo(await alta.paraGuardar(nuevo), deps);

  assert.equal(guardado.codigo, 4);
  assert.equal(guardado.propiedad, 'Propio');
  assert.deepEqual(nube.leer(`vehiculos/${guardado.id}`), guardado);
  assert.equal(nube.escrituras(`vehiculos/${guardado.id}`).length, 1, 'un `setDoc`');
  assert.equal(nube.escriturasEnTransaccion(`vehiculos/${guardado.id}`).length, 0, 'y ninguna transacción: no hay nada que leer');
  assert.equal(nube.llamadas.filter(([op, ruta]) => op === 'tx.get' && ruta.startsWith('vehiculos/')).length, 0);
  assert.deepEqual(copia.guardados.get(guardado.id), guardado);
});

test('el reintento de un alta que sí había llegado no toca el mantenimiento que el carro ya tenga (el `setDoc` con `merge` no lo manda)', async () => {
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
  const copia = copiaLocalEnMemoria();
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {}, hoy: HOY };
  const alta = altaConIdFijo(() => nuevoIdVehiculo({ iniciar: nube.iniciar }));
  const nuevo = construirVehiculo({}, {
    id: undefined, codigo: undefined, placas: 'P-123ABC', tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', modelo: '2022',
  });
  const primero = await guardarVehiculo(await alta.paraGuardar(nuevo), deps); // llegó, aunque la pantalla se haya dado por vencida
  await registrarServicioDelCarro(primero.id, servicio(), deps);

  await guardarVehiculo(await alta.paraGuardar(nuevo), deps); // el reintento: mismo id, sin código

  assert.deepEqual(ids(nube.leer(`vehiculos/${primero.id}`)), ['s-1']);
});

test('un carro que llega SIN código (aunque ya exista) tampoco escribe el mantenimiento que la copia traiga: la regla es de todo guardado del carro', async () => {
  const { nube, A, abrir } = dosComputadoras();
  nube.docs.set('vehiculos/v1', {
    ...structuredClone(nube.docs.get('vehiculos/v1')),
    servicios: [...nube.docs.get('vehiculos/v1').servicios, { id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 }],
  });
  const { codigo: _sin, ...sinCodigo } = abrir(); // la copia vieja, con UN servicio y sin código
  nube.docs.set('contadores/vehiculos', { ultimo: 7 });

  await guardarVehiculo({ ...sinCodigo, color: 'Rojo' }, A.deps);

  assert.deepEqual(ids(nube.leer('vehiculos/v1')), ['s-0', 's-1']);
  assert.equal(nube.escrituras('vehiculos/v1').at(-1)[2].servicios, undefined, 'y ni siquiera se manda: el `merge` no la toca');
});

test('un alta con un campo en `undefined` lo deja fuera en vez de mandárselo a Firestore (que lo rechaza)', async () => {
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 3 } } });
  const copia = copiaLocalEnMemoria();
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };
  const alta = altaConIdFijo(() => nuevoIdVehiculo({ iniciar: nube.iniciar }));
  const nuevo = construirVehiculo({}, {
    id: undefined, codigo: undefined, placas: 'P-123ABC', tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: undefined, modelo: '2022',
  });
  const guardado = await guardarVehiculo(await alta.paraGuardar(nuevo), deps);
  assert.equal('color' in nube.leer(`vehiculos/${guardado.id}`), false);
  assert.equal(guardado.codigo, 4);
});

// ---------------------------------------------------------------------------------------------------------------
// Qué es «del mantenimiento» (una sola lista, y que sea la verdad)
// ---------------------------------------------------------------------------------------------------------------

/** Las llaves que cambian entre cada par `[antes, después]` (menos el sello, que sube con todo). */
function llavesTocadas(pares) {
  const tocadas = new Set();
  for (const [antes, despues] of pares) {
    for (const llave of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
      if (JSON.stringify(antes[llave]) !== JSON.stringify(despues[llave])) tocadas.add(llave);
    }
  }
  tocadas.delete('actualizado');
  return [...tocadas].sort();
}

test('CAMPOS_DEL_MANTENIMIENTO son exactamente las llaves que tocan los tres cambios del mantenimiento — ni una más, ni una menos', () => {
  const carro = carroPropio();
  const conServicio = carroConServicio(carro, { id: 's-1', tipo: 'aceite', fecha: '2026-10-10', km: 15000 });
  assert.deepEqual(llavesTocadas([
    [carro, conServicio],
    [conServicio, carroConServicioAnulado(conServicio, 's-1', HOY)],
    [carro, carroConIntervalo(carro, 'aceite', { km: 7500, meses: 4 })],
  ]), [...CAMPOS_DEL_MANTENIMIENTO].sort(),
  'un campo nuevo del mantenimiento que no esté en la lista volvería a ser pisado por un guardado de la ficha');
});

test('CAMPOS_DE_LA_DISPONIBILIDAD son exactamente las llaves que tocan marcar y habilitar — y los dos grupos no se pisan', () => {
  const carro = carroPropio();
  const fuera = carroFueraDeServicio(carro, 'Golpe');
  assert.deepEqual(llavesTocadas([[carro, fuera], [fuera, carroHabilitado(fuera)]]), [...CAMPOS_DE_LA_DISPONIBILIDAD].sort());
  assert.deepEqual(CAMPOS_DEL_MANTENIMIENTO.filter((c) => CAMPOS_DE_LA_DISPONIBILIDAD.includes(c)), [], 'una llave con DOS dueños es una llave que nadie cuida');
  assert.deepEqual([...CAMPOS_CON_SU_PROPIO_ESCRITOR].sort(), [...CAMPOS_DEL_MANTENIMIENTO, ...CAMPOS_DE_LA_DISPONIBILIDAD].sort());
});

test('todo escritor del carro que lee la nube dentro de la transacción está contado: hay cinco, y la ficha no es ninguno de ellos', () => {
  // Si alguien agrega un sexto (`cambiarEnNubeYLocal('vehiculos', …)` en otra función), tiene que decidir de quién son SUS llaves y
  // agregarlas a `CAMPOS_CON_SU_PROPIO_ESCRITOR`: si no, el guardado de la ficha las seguiría pisando desde una copia vieja.
  const fuente = leerFuente('../js/datos.js');
  const cuerpo = (nombre) => { const i = fuente.indexOf(`export async function ${nombre}(`); return fuente.slice(i, fuente.indexOf('\n}\n', i)); };
  const escritores = [...fuente.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1])
    .filter((nombre) => nombre !== 'guardarVehiculo') // la ficha también lee el carro dentro de la transacción, pero lo suyo es otro grupo de llaves
    .filter((nombre) => cuerpo(nombre).includes("cambiarEnNubeYLocal('vehiculos'")).sort();
  assert.deepEqual(escritores, [
    'anularServicioDelCarro', 'cambiarIntervaloDelCarro', 'habilitarCarro', 'marcarCarroFueraDeServicio', 'registrarServicioDelCarro',
  ]);
  for (const nombre of escritores) {
    assert.ok(!/guardarVehiculo\(|guardarLocal\(/.test(cuerpo(nombre)), `${nombre} reescribe el carro con la copia de la pantalla o toca la copia local suelta`);
  }
  assert.ok(cuerpo('guardarVehiculo').includes('carroConLoDeLaFicha('), 'y la ficha pasa por la función que deja lo ajeno como está');
});

test('carroConLoDeLaFicha: lo que tiene su propio escritor es de la nube; lo demás, de la pantalla; `undefined` no pisa; nada se muta', () => {
  const fresco = {
    id: 'v1', codigo: 1, placas: 'P-1', color: 'Blanco', servicios: [{ id: 's-1' }], intervalos: { aceite: { km: 1, meses: 1 } },
    fueraDeServicio: true, motivoFueraDeServicio: 'Taller', soloNube: 1,
  };
  const deLaFicha = {
    id: 'v1', codigo: 1, placas: 'P-2', color: undefined, servicios: [], intervalos: {}, fueraDeServicio: false, motivoFueraDeServicio: '', modelo: '2024',
  };
  const copiaFresco = structuredClone(fresco);
  const copiaFicha = structuredClone(deLaFicha);
  assert.deepEqual(carroConLoDeLaFicha(fresco, deLaFicha), {
    id: 'v1', codigo: 1, placas: 'P-2', color: 'Blanco', servicios: [{ id: 's-1' }], intervalos: { aceite: { km: 1, meses: 1 } },
    fueraDeServicio: true, motivoFueraDeServicio: 'Taller', soloNube: 1, modelo: '2024',
  });
  assert.deepEqual(fresco, copiaFresco);
  assert.deepEqual(deLaFicha, copiaFicha);
  assert.deepEqual(carroConLoDeLaFicha(fresco, undefined), fresco, 'sin nada de la pantalla, la nube se queda como está');
  assert.notEqual(carroConLoDeLaFicha(fresco, undefined), fresco, 'y es una copia, no el mismo objeto');
  // Sin esas llaves en ninguno de los dos lados no se inventan (Firestore no acepta `undefined`).
  const sin = carroConLoDeLaFicha({ id: 'v1', placas: 'P-1' }, { id: 'v1', placas: 'P-2', servicios: [{ id: 'x' }], fueraDeServicio: true });
  for (const llave of CAMPOS_CON_SU_PROPIO_ESCRITOR) assert.equal(llave in sin, false, llave);
});

test('carroFueraDeServicio y carroHabilitado: las dos marcas y nada más, sin tocar el carro recibido', () => {
  const carro = carroPropio();
  const copia = structuredClone(carro);
  assert.deepEqual(carroFueraDeServicio(carro, '  Golpe  '), { ...carro, fueraDeServicio: true, motivoFueraDeServicio: 'Golpe' });
  assert.deepEqual(carroHabilitado(carroFueraDeServicio(carro, 'Golpe')), { ...carro, fueraDeServicio: false, motivoFueraDeServicio: '' });
  assert.deepEqual(carro, copia);
  assert.throws(() => carroFueraDeServicio(carro, ''), { message: MENSAJE_FALTA_EL_MOTIVO });
});

// ---------------------------------------------------------------------------------------------------------------
// Nada que se escriba a Firestore lleva `undefined` (el SDK de verdad lo rechaza; la nube falsa antes no)
// ---------------------------------------------------------------------------------------------------------------

test('ninguna de las escrituras al carro lleva `undefined`: alta, guardar, marcar, habilitar, servicio, anular e intervalo', async () => {
  const nube = nubeEnMemoria({ contadores: { vehiculos: { ultimo: 0 } } });
  const copia = copiaLocalEnMemoria();
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {}, hoy: HOY };
  const alta = altaConIdFijo(() => nuevoIdVehiculo({ iniciar: nube.iniciar }));

  // El alta sale del formulario con `id` y `codigo` en `undefined` hasta que `guardarVehiculo` los decide.
  let carro = await guardarVehiculo(await alta.paraGuardar(construirVehiculo({}, {
    id: undefined, codigo: undefined, placas: 'P-123ABC', tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', modelo: '2022',
  })), deps);
  carro = await guardarDesdeElFormulario(carro, { color: 'Negro' }, deps);
  carro = await marcarCarroFueraDeServicio(carro.id, 'Taller', deps);
  carro = await habilitarCarro(carro.id, deps);
  carro = await registrarServicioDelCarro(carro.id, servicio({ km: null }), deps);
  carro = await anularServicioDelCarro(carro.id, 's-1', deps);
  carro = await cambiarIntervaloDelCarro(carro.id, 'aceite', { km: 7500, meses: 4 }, deps);
  await cambiarIntervaloDelCarro(carro.id, 'aceite', null, deps);

  const escrituras = nube.llamadas.filter(([op, ruta]) => ['setDoc', 'tx.set'].includes(op) && ruta === `vehiculos/${carro.id}`);
  assert.ok(escrituras.length >= 8, `se esperaban al menos 8 escrituras al carro y hubo ${escrituras.length}`);
  for (const [op, ruta, datos] of escrituras) {
    assert.deepEqual(valoresIndefinidos(datos), [], `${op} ${ruta} lleva undefined`);
  }
  assert.deepEqual(valoresIndefinidos(copia.guardados.get(carro.id)), [], 'ni la copia local');
});

// ---------------------------------------------------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------------------------------------------------

test('textoFalloAlGuardarElCarro: un carro que ya no está dice por qué; cualquier otro fallo, «intenta de nuevo» con lo que se intentaba', () => {
  assert.equal(textoFalloAlGuardarElCarro(Object.assign(new Error(MENSAJE_CARRO_NO_ESTA), { codigo: CODIGO_DOCUMENTO_NO_ESTA }), 'marcar el carro'), MENSAJE_CARRO_NO_ESTA);
  assert.equal(textoFalloAlGuardarElCarro(new Error('La nube no respondió a tiempo.'), 'guardar el carro'), 'No se pudo guardar el carro. Intenta de nuevo.');
  assert.equal(textoFalloAlGuardarElCarro(undefined, 'habilitar el carro'), 'No se pudo habilitar el carro. Intenta de nuevo.');
});

test('estructura: la ficha guarda con guardarVehiculo y los botones del taller con sus escritores, con el texto de fallo de la función pura', () => {
  const codigo = leerFuente('../js/pantallas/carros.js').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.equal([...codigo.matchAll(/\bguardarVehiculo\(/g)].length, 1, '«Guardar carro» es el ÚNICO que escribe la ficha');
  assert.match(codigo, /guardarVehiculo\(await alta\.paraGuardar\(vehiculo\)\)/);
  assert.match(codigo, /await marcarCarroFueraDeServicio\(carro\.id, motivoTrim\)/);
  assert.equal([...codigo.matchAll(/await habilitarCarro\(carro\.id\)/g)].length, 2, 'la ficha y la ruta #/habilitar');
  assert.doesNotMatch(codigo, /fueraDeServicio: (true|false)|motivoFueraDeServicio:/, 'ninguna pantalla arma las marcas del taller: eso es del escritor');
  assert.match(codigo, /aviso\(MENSAJE_FALTA_EL_MOTIVO, 'error'\)/, 'y el motivo obligatorio dice lo mismo en el botón y en el escritor');
  for (const queSeIntentaba of ['guardar el carro', 'marcar el carro', 'habilitar el carro']) {
    assert.ok(codigo.includes(`textoFalloAlGuardarElCarro(error, '${queSeIntentaba}')`), queSeIntentaba);
  }
  assert.doesNotMatch(codigo, /No se pudo (guardar|marcar|habilitar) el carro\. Intenta de nuevo\./, 'el texto vive en la función pura, no repetido en cada botón');
  // Lo que lee el formulario es exactamente lo que estas pruebas llaman `camposDelFormulario`: ocho llaves.
  const campos = codigo.slice(codigo.indexOf('const campos = {'), codigo.indexOf('};', codigo.indexOf('const campos = {')));
  assert.deepEqual([...campos.matchAll(/^\s+(\w+)\s*[:,]/gm)].map((m) => m[1]),
    ['id', 'codigo', 'placas', 'tipo', 'marca', 'linea', 'color', 'modelo']);
});
