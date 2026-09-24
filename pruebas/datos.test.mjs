// Pruebas de la parte pura de la capa de datos: las reglas que deciden qué
// se le entrega a la pantalla, sin tocar Firestore ni IndexedDB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resultadoLectura, contratoParaGuardar } from '../js/datos.js';

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
