// La garantía de la tarjeta y la cancelación de una reservación: los dos botones que nadie probaba.
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
  puedeLiberarse, liberarGarantia, cancelarReserva, reservaParaGuardar, CODIGO_SALDO_PENDIENTE,
} from '../js/datos.js';
import { resumen } from '../js/nucleo/contrato.js';
import { construirReserva } from '../js/nucleo/reserva.js';
import { nubeEnMemoria, copiaLocalEnMemoria } from './fixtures/nubeEnMemoria.mjs';
import { contratoReal, TARJETA } from './fixtures/contratoReal.mjs';


// ---------------------------------------------------------------------------
// La garantía de la tarjeta: «no la libero hasta que me pague»
// ---------------------------------------------------------------------------

const conGarantia = (monto) => contratoReal({
  dias: 3, precioDia: 700, tarjetas: [TARJETA], recibidoEl: '2026-10-04', pagos: monto ? [{ monto }] : [],
});

test('puedeLiberarse: cualquier saldo mayor que cero, aunque sea de medio quetzal, retiene la garantía', () => {
  // `saldo > 0` -> `saldo > 1`: un cliente que debe Q0.50 se llevaba su garantía. Es la única palanca que le queda.
  const debeMedio = conGarantia(2099.5);
  assert.equal(resumen(debeMedio).saldo, 0.5);
  assert.equal(puedeLiberarse(debeMedio), 'Todavía debe Q0.50. La garantía se libera cuando termine de pagar.');
  assert.equal(puedeLiberarse(conGarantia(2100)), null, 'pagado justo: ya se puede');
  assert.equal(puedeLiberarse(conGarantia(2200)), null, 'y con un sobrepago también');
  assert.match(puedeLiberarse(conGarantia(0)), /^Todavía debe Q2,100\.00\./);
});

test('liberarGarantia: con todo pagado SÍ libera — queda guardada la liberación y su fecha, y el contrato cierra', async () => {
  // Nadie probaba el camino bueno: con la condición invertida (`if (!motivo) throw`) ningún contrato volvería a liberarse
  // y con `garantiaLiberada: false` el botón diría que sí y no haría nada.
  const c = conGarantia(2100);
  assert.equal(c.estado, 'devuelto', 'el escenario: pagó todo pero la garantía sigue retenida');
  const nube = nubeEnMemoria({ contratos: [c] });
  const copia = copiaLocalEnMemoria();
  const guardado = await liberarGarantia(c, {
    iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => assert.fail('no había nada que avisar'),
  });
  assert.equal(guardado.garantiaLiberada, true);
  assert.match(guardado.garantiaLiberadaEn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(guardado.estado, 'cerrado');
  const enNube = nube.leer(`contratos/${c.id}`);
  assert.equal(enNube.garantiaLiberada, true, 'en la nube');
  assert.equal(enNube.estado, 'cerrado');
  assert.equal(copia.guardados.get(c.id).garantiaLiberada, true, 'y en la copia local');
});

test('liberarGarantia: con saldo pendiente se NIEGA con su código y no escribe nada', async () => {
  const c = conGarantia(2099.5);
  const nube = nubeEnMemoria({ contratos: [c] });
  await assert.rejects(
    () => liberarGarantia(c, { iniciar: nube.iniciar, guardarCopia: async () => {} }),
    (e) => e.codigo === CODIGO_SALDO_PENDIENTE && /Todavía debe Q0\.50/.test(e.message),
  );
  assert.equal(nube.leer(`contratos/${c.id}`).garantiaLiberada, false);
  assert.equal(nube.escrituras().length + nube.escriturasEnTransaccion().length, 0, 'ni una escritura');
});

// ---------------------------------------------------------------------------
// Cancelar una reservación
// ---------------------------------------------------------------------------

const reservaPendiente = () => reservaParaGuardar(construirReserva({}, {
  clienteId: 'k1', clienteNombre: 'Juan Pérez', telefono: '5555-5555', fechaSalida: '2026-11-01', dias: 4, carroId: 'v1',
  carroPlacas: 'P-999TST', tipoVehiculo: '', precioDia: 700, anticipo: 400, anticipoPagado: true, nota: '',
}), { id: 'r1', ahora: 1790000000000 });

test('cancelarReserva: la reservación queda cancelada en la nube y en la copia local, y devuelve lo guardado', async () => {
  // Nadie la probaba: con `cancelada: false` o sin el `return`, el botón «Cancelar reservación» no cancelaba nada.
  const reserva = reservaPendiente();
  const nube = nubeEnMemoria();
  nube.docs.set('reservas/r1', structuredClone((({ id: _id, ...resto }) => resto)(reserva)));
  const copia = copiaLocalEnMemoria();
  const guardada = await cancelarReserva(reserva, { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia });
  assert.equal(guardada.cancelada, true);
  assert.equal(guardada.estado, 'cancelada');
  assert.equal(nube.leer('reservas/r1').cancelada, true);
  assert.equal(nube.leer('reservas/r1').estado, 'cancelada');
  assert.equal(copia.guardados.get('r1').estado, 'cancelada');
  assert.equal(nube.leer('reservas/r1').anticipo, 400, 'y no pierde lo demás');
});

test('cancelarReserva: una reservación que ya salió en un contrato sigue «entregada» (una cancelación tardía no la deshace)', async () => {
  const entregada = reservaParaGuardar({ ...reservaPendiente(), contratoId: 'c9' }, { id: 'r1' });
  const nube = nubeEnMemoria();
  nube.docs.set('reservas/r1', structuredClone((({ id: _id, ...resto }) => resto)(entregada)));
  const guardada = await cancelarReserva(entregada, { iniciar: nube.iniciar, guardarCopia: async () => {} });
  assert.equal(guardada.estado, 'entregada');
  assert.equal(guardada.contratoId, 'c9');
});
