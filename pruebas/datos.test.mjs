// Pruebas de la parte pura de la capa de datos: las reglas que deciden qué
// se le entrega a la pantalla, sin tocar Firestore ni IndexedDB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resultadoLectura, contratoParaGuardar, guardarContrato, duenoParaGuardar,
} from '../js/datos.js';
import { CAMPOS_DUENO } from '../js/nucleo/dueno.js';

// CRÍTICO de la revisión final: una lectura de contratos fallida se dibujaba
// como "todos los carros disponibles" porque cargarConSincronia devolvía []
// sin decir que la lectura había fallado. resultadoLectura es la regla que
// arregla eso — se prueba aquí sin necesidad de Firestore.
test('con la nube al día, entrega lo remoto y fallo en false', () => {
  const r = resultadoLectura(['local'], { ok: true, valor: ['remoto1', 'remoto2'] });
  assert.deepEqual(r, { datos: ['remoto1', 'remoto2'], fallo: false });
});

test('con copia local pero la nube falló, entrega lo local y avisa el fallo', () => {
  const r = resultadoLectura(['v1', 'v2'], { ok: false });
  assert.deepEqual(r, { datos: ['v1', 'v2'], fallo: true });
});

test('nunca se inventa una lista vacía a partir de una lectura fallida: sin local y sin nube, fallo sale en true', () => {
  const r = resultadoLectura([], { ok: false });
  assert.deepEqual(r, { datos: [], fallo: true });
  // La clave del hallazgo: esto NO se puede distinguir de "de verdad no hay
  // nada" mirando solo `datos` — por eso `fallo` existe como campo aparte.
  const deVerdadVacio = resultadoLectura([], { ok: true, valor: [] });
  assert.deepEqual(deVerdadVacio, { datos: [], fallo: false });
  assert.notDeepEqual(r, deVerdadVacio, 'un fallo y una lista de verdad vacía no son lo mismo');
});

// IMPORTANTE de la revisión final: el campo `estado` que se guarda en el
// contrato tiene que salir siempre de estadoContrato(), nunca de lo que ya
// traía el objeto — si no, el campo guardado y lo que de verdad calcula
// estadoContrato() (cierre + saldo + garantía) se pueden desacordar.
test('contratoParaGuardar calcula el estado con estadoContrato(), no confía en el que ya traía', () => {
  const contrato = { dias: 4, precioDia: 700, pagos: [], estado: 'rentado' }; // sin cierre
  const guardado = contratoParaGuardar(contrato, { id: 'c1', numero: 1, ahora: 1000 });
  assert.equal(guardado.estado, 'rentado');
  assert.equal(guardado.id, 'c1');
  assert.equal(guardado.numero, 1);
  assert.equal(guardado.actualizado, 1000);
});

test('un contrato con cierre y sin saldo pendiente se guarda como "cerrado", no "rentado"', () => {
  const contrato = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-24' }, // ya regresó, sin atraso ni daños
    pagos: [{ monto: 2800, porcentajeTarjeta: 0 }], // ya pagó todo
    garantiaLiberada: true,
    estado: 'rentado', // el campo viejo, a propósito, para probar que no se confía en él
  };
  const guardado = contratoParaGuardar(contrato, { id: 'c1', numero: 1 });
  assert.equal(guardado.estado, 'cerrado');
});

test('un contrato devuelto pero con saldo o garantía pendiente se guarda como "devuelto"', () => {
  const contrato = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-24' },
    pagos: [], // todavía debe
    garantiaLiberada: false,
    estado: 'rentado',
  };
  const guardado = contratoParaGuardar(contrato, { id: 'c1', numero: 1 });
  assert.equal(guardado.estado, 'devuelto');
});

// CRÍTICO de la revisión final: el mismo hueco que deja reabrir un cierre ya
// hecho en blanco (recibirCarro.js) podría, en teoría, guardar una garantía
// liberada sobre un contrato que en realidad sigue debiendo. Candado barato:
// guardarContrato rechaza esa combinación ANTES de tocar la nube — por eso
// esta prueba puede llamarlo directo, sin mock de Firestore, y esperar el
// rechazo (el chequeo corre antes del primer `await` que de verdad usa la
// red).
test('CRÍTICO: guardarContrato rechaza una garantía liberada si todavía hay saldo pendiente', async () => {
  const contrato = {
    dias: 4,
    precioDia: 700,
    devolucionPrevista: '2026-08-24',
    cierre: { fechaReal: '2026-08-25', danos: 200, descuento: 0 },
    pagos: [], // no pagó nada
    garantiaLiberada: true, // el mismo hueco que abre CRÍTICO 2
  };
  await assert.rejects(() => guardarContrato(contrato), /todavía debe/i);
});

// Los dueños de carros subarrendados. La ficha guardada tiene la forma que
// dice js/nucleo/dueno.js (CAMPOS_DUENO: nombre, telefono, nit, nota) más los
// dos campos que sella `duenoParaGuardar`: id y actualizado.
const dueno = {
  nombre: 'JUAN PÉREZ',
  telefono: '7777-7777',
  nit: '12345678-7',
  nota: 'Dueño confiable',
};

test('duenoParaGuardar: un dueño nuevo recibe su id y su sello actualizado', () => {
  const guardado = duenoParaGuardar(dueno, { id: 'd1', ahora: 5000 });
  assert.equal(guardado.id, 'd1');
  assert.equal(guardado.actualizado, 5000);
  // Lo que escribió el mostrador llega completo, sin tocarse.
  for (const { id } of CAMPOS_DUENO) assert.equal(guardado[id], dueno[id], `se perdió ${id}`);
});

test('duenoParaGuardar: sin `ahora` el sello es la hora de ahora, no vacío', () => {
  const antes = Date.now();
  const guardado = duenoParaGuardar(dueno, { id: 'd1' });
  assert.ok(guardado.actualizado >= antes && guardado.actualizado <= Date.now());
});

test('duenoParaGuardar: un dueño que ya existe conserva su id', () => {
  const existente = { ...dueno, id: 'd7', actualizado: 100 };
  // Como lo llama guardarDueno: el id de la referencia es el mismo del dueño.
  assert.equal(duenoParaGuardar(existente, { id: 'd7', ahora: 200 }).id, 'd7');
  // Y si quien llama olvida pasarlo, no se pierde: un dueño sin id se
  // guardaría como un documento nuevo y quedaría duplicado.
  assert.equal(duenoParaGuardar(existente, { ahora: 200 }).id, 'd7');
});

test('duenoParaGuardar: los campos que el formulario no conoce sobreviven', () => {
  // Un bug real de este proyecto borró un campo justo así: la ficha se
  // guardaba reconstruida solo con lo que la pantalla mostraba. El nombre es
  // inventado a propósito — tiene que ser uno que CAMPOS_DUENO no conozca.
  const desconocido = 'campoQueElFormularioNoConoce';
  assert.ok(!CAMPOS_DUENO.some((c) => c.id === desconocido), 'la prueba exige un campo fuera de la lista');
  const existente = { ...dueno, id: 'd7', actualizado: 100, [desconocido]: 'se queda' };
  const guardado = duenoParaGuardar(existente, { id: 'd7', ahora: 200 });
  assert.equal(guardado[desconocido], 'se queda');
});

test('duenoParaGuardar: `actualizado` se sella, no se copia del dueño que llega', () => {
  // mezclar() decide quién gana por este número: si se copiara el viejo, la
  // ficha recién guardada perdería contra la copia vieja que ya está en la nube.
  const existente = { ...dueno, id: 'd7', actualizado: 100 };
  const guardado = duenoParaGuardar(existente, { id: 'd7', ahora: 9999 });
  assert.equal(guardado.actualizado, 9999);
  assert.notEqual(guardado.actualizado, existente.actualizado);
});

test('duenoParaGuardar: no modifica el dueño que recibe', () => {
  const existente = { ...dueno, id: 'd7', actualizado: 100 };
  duenoParaGuardar(existente, { id: 'd7', ahora: 9999 });
  assert.equal(existente.actualizado, 100);
});
