// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en las reglas que deciden
// qué ve el dueño: si un carro va atrasado, si un contrato puede cerrarse, qué reservaciones se cruzan y cuándo avisa
// de que ya no cabe una. Cada una nació de un mutante que SOBREVIVIÓ: se le metió a propósito un error al código y las
// 2,589 pruebas de entonces seguían en verde. Aquí cada una falla con ese error puesto y pasa con el código bueno.
// Qué le habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
//
// Los contratos y las reservaciones salen de los constructores de verdad, no de objetos escritos a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoCarro, puedeCerrar, pendientesDe, creditoDelCliente, estadoContrato,
} from '../js/nucleo/estados.js';
import {
  construirReserva, seCruzan, faltaAlgoEnReserva, cambiosSinGuardar, textoAnticipo, choquesDeReserva,
} from '../js/nucleo/reserva.js';
import { reservaParaGuardar } from '../js/datos.js';
import { construirVehiculo } from '../js/pantallas/carros.js';
import { contratoDeUnCarro } from './fixtures/contratoDeUnCarro.mjs';
import { contratoReal, TARJETA } from './fixtures/contratoReal.mjs';

// ---------------------------------------------------------------------------
// estados.js — «atrasado» desde el PRIMER día, y los bordes de cuándo se cierra un contrato
// ---------------------------------------------------------------------------

test('un carro que debía volver ayer ya está «atrasado» (1 día); el día previsto todavía no', () => {
  // `atraso > 0` -> `atraso > 1`: el carro que se atrasó UN día —lo más común— se veía como «rentado, a tiempo».
  const carro = { id: 'v1' };
  const c = contratoDeUnCarro({ fechaSalida: '2026-10-01', dias: 4 });
  assert.equal(c.devolucionPrevista, '2026-10-05', 'el escenario: debe volver el 5');
  const enHoy = (hoy) => estadoCarro(carro, [c], hoy);
  assert.equal(enHoy('2026-10-05').estado, 'rentado', 'el día previsto sigue a tiempo');
  assert.equal(enHoy('2026-10-05').diasAtraso, 0);
  assert.equal(enHoy('2026-10-06').estado, 'atrasado');
  assert.equal(enHoy('2026-10-06').diasAtraso, 1);
  assert.equal(enHoy('2026-10-08').diasAtraso, 3);
});

test('un carro sin contrato abierto está disponible y NO atrasado, con cero días de atraso', () => {
  const sinContrato = estadoCarro({ id: 'v1' }, [], '2026-10-06');
  assert.deepEqual([sinContrato.estado, sinContrato.diasAtraso, sinContrato.contrato], ['disponible', 0, null]);
  assert.equal(estadoCarro({ id: 'v1', fueraDeServicio: true, motivoFueraDeServicio: 'Frenos' }, [], '2026-10-06').motivo, 'Frenos');
  assert.equal(estadoCarro({ id: 'v1', fueraDeServicio: true }, [], '2026-10-06').motivo, '', 'sin motivo, vacío y no «undefined»');
});

test('un contrato con Q0.50 por cobrar NO puede cerrarse; con Q0.50 a favor, sí', () => {
  // `saldo <= 0` -> `saldo <= 1`: un cliente que debe hasta Q1.00 aparecía «cerrado», y de ahí salen lo que se le paga al
  // dueño del carro y a quien rentó.
  const conSaldo = (pago) => contratoReal({ dias: 3, precioDia: 700, recibidoEl: '2026-10-04', pagos: [{ monto: pago }] });
  const debe = conSaldo(2099.5);
  assert.equal(pendientesDe(debe).saldo, 0.5);
  assert.equal(puedeCerrar(debe), false);
  assert.equal(estadoContrato(debe), 'devuelto');
  assert.equal(puedeCerrar(conSaldo(2100)), true);
  assert.equal(puedeCerrar(conSaldo(2100.5)), true, 'a favor del cliente también cierra');
});

test('«a favor del cliente»: solo lo que hay de MÁS cobrado; quien debe poco o está a mano no tiene crédito negativo', () => {
  // `saldo < 0` -> `saldo < 1`: quien debía Q0.50 aparecía con un «crédito» de -Q0.50.
  const conSaldo = (pago) => contratoReal({ dias: 3, precioDia: 700, recibidoEl: '2026-10-04', pagos: [{ monto: pago }] });
  assert.equal(creditoDelCliente(conSaldo(2100.5)), 0.5);
  assert.equal(creditoDelCliente(conSaldo(2100)), 0);
  assert.equal(creditoDelCliente(conSaldo(2099.5)), 0, 'debe Q0.50: no hay crédito');
  assert.equal(creditoDelCliente(conSaldo(0)), 0);
});

test('una garantía de menos de un quetzal sigue siendo garantía retenida', () => {
  const chica = contratoReal({
    dias: 3, precioDia: 700, tarjetas: [{ ...TARJETA, montoAutorizado: 0.5 }], recibidoEl: '2026-10-04', pagos: [{ monto: 2100 }],
  });
  assert.equal(chica.garantiaMonto, 0.5);
  assert.equal(pendientesDe(chica).garantia, true);
  assert.equal(puedeCerrar(chica), false);
});

// ---------------------------------------------------------------------------
// reserva.js — apartar un carro: lo que se guarda, lo que cruza, lo que falta
// ---------------------------------------------------------------------------

const CAMPOS = {
  clienteId: 'k1', clienteNombre: 'Juan Pérez', telefono: '5555-5555', fechaSalida: '2026-11-01', dias: 4, carroId: 'v1',
  carroPlacas: 'P-999TST', tipoVehiculo: '', precioDia: 700, anticipo: 400, anticipoPagado: true, nota: '',
};

test('construirReserva: lo que el formulario manda como texto se guarda como número redondeado y sin espacios', () => {
  // Borrar `dias = Number(…)`, `precioDia = q(…)`, `anticipo = q(…)` o el recorte de los textos dejaba la reservación con
  // «3» y «400.005» como TEXTO: el anticipo que se descuenta al sacar el carro, sin redondear a centavos.
  const r = construirReserva({}, {
    ...CAMPOS, clienteNombre: '  Juan Pérez ', dias: '3', precioDia: '700.005', anticipo: ' 400.5 ', nota: ' llega tarde ',
  });
  assert.equal(r.dias, 3);
  assert.equal(r.precioDia, 700.01);
  assert.equal(r.anticipo, 400.5);
  assert.equal(r.clienteNombre, 'Juan Pérez');
  assert.equal(r.nota, 'llega tarde');
  assert.equal(r.devolucionPrevista, '2026-11-04');
  assert.equal(construirReserva({}, { ...CAMPOS, dias: 'abc' }).dias, 0, 'unos días ilegibles son cero, no NaN');
  assert.equal(construirReserva({}, { ...CAMPOS, dias: '' }).devolucionPrevista, '', 'y sin días no hay fecha de regreso');
});

test('dos reservaciones a las que les falta una fecha NO se cruzan (no hay rango, no hay cruce)', () => {
  // `return false` -> `return true` en la guardia: una reservación a medio llenar bloquearía a todas las demás.
  const completa = construirReserva({}, CAMPOS);
  const sinDevolucion = { ...completa, devolucionPrevista: '' };
  const sinSalida = { ...completa, fechaSalida: '' };
  assert.equal(seCruzan(completa, completa), true, 'el escenario: completas sí se cruzan');
  for (const incompleta of [sinDevolucion, sinSalida, {}, undefined]) {
    assert.equal(seCruzan(completa, incompleta), false);
    assert.equal(seCruzan(incompleta, completa), false);
  }
});

test('faltaAlgoEnReserva: cero días, días negativos y días con decimales dicen cada uno lo suyo', () => {
  // `dias < 0` -> `dias < 1`: media jornada (0.5) se leía como «negativo» en lugar de «tiene que ser entero».
  const falta = (dias) => faltaAlgoEnReserva(construirReserva({}, { ...CAMPOS, dias }));
  assert.deepEqual(falta(0), ['Días']);
  assert.deepEqual(falta(-3), ['Días (no pueden ser negativos)']);
  assert.deepEqual(falta(0.5), ['Días (tienen que ser un número entero)']);
  assert.deepEqual(falta(2.5), ['Días (tienen que ser un número entero)']);
  assert.deepEqual(falta(3), []);
});

test('cambiosSinGuardar: Q400 guardados y «400.00» en el formulario son lo mismo; «400.01», no', () => {
  // La razón de ser de esta regla: que «Sacar el carro» no use un anticipo distinto del que se ve en pantalla (el pago de
  // Q400 que nadie hizo). Si los números se compararan como TEXTO, «400.00» contra 400 daría un cambio falso y bloquearía
  // sacar el carro con la ficha sin tocar.
  const guardada = reservaParaGuardar(construirReserva({}, CAMPOS), { id: 'r1', ahora: 1 });
  const formulario = (cambios) => ({ ...guardada, ...cambios });
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ anticipo: '400.00', precioDia: '700.0', dias: '4' })), []);
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ anticipo: '400.01' })), ['anticipo']);
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ precioDia: '700.01' })), ['precio por día']);
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ dias: '5' })), ['días']);
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ anticipoPagado: false })), ['si el anticipo ya se pagó']);
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ clienteNombre: ' Juan Pérez ' })), [], 'los espacios sobrantes no son un cambio');
  assert.deepEqual(cambiosSinGuardar(guardada, formulario({ clienteNombre: 'Juan Pérez S.' })), ['nombre del cliente']);
});

test('un anticipo de medio quetzal es un anticipo (no «Sin anticipo»)', () => {
  assert.equal(textoAnticipo(construirReserva({}, { ...CAMPOS, anticipo: 0.5 })), 'Anticipo Q0.50 — ya me lo pagó');
  assert.equal(textoAnticipo(construirReserva({}, { ...CAMPOS, anticipo: 0 })), 'Sin anticipo');
});

// ---------------------------------------------------------------------------
// reserva.js — cuando la búsqueda se rinde, el aviso lo dice y no inventa
// ---------------------------------------------------------------------------

const carro = (id, tipo) => construirVehiculo({ id }, {
  placas: `P-${id}`, marca: 'Marca', linea: id, color: 'Blanco', modelo: 2022, tipo,
});
const apartada = (id, desde, dias, campos = {}) => reservaParaGuardar(construirReserva({ id }, {
  clienteNombre: 'Ana', telefono: '5555-0000', precioDia: 600, anticipo: 0, fechaSalida: desde, dias, ...campos,
}), { id, ahora: 1 });
const borrador = (desde, dias, campos = {}) => construirReserva({}, {
  clienteNombre: 'Beto', fechaSalida: desde, dias, precioDia: 600, anticipo: 0, ...campos,
});
const HOY = '2026-11-01';

test('una reservación por tipo cuando la búsqueda de asignaciones se rinde: «no se pudo comprobar», no «ya están comprometidos»', () => {
  // `con === null ? null : …` -> siempre el objeto: si la segunda búsqueda se pasaba del límite, la cuenta daba NaN y el
  // aviso decía «Tienes 3 Sedán y los 3 ya están comprometidos» cuando sí cabía (y no se sabía).
  const flota = ['s1', 's2', 's3'].map((id) => carro(id, 'Sedán'));
  const reserva = borrador('2026-12-02', 5, { tipoVehiculo: 'Sedán' });
  // Con límite 0 la primera búsqueda (sin ninguna reservación por tipo todavía) no necesita ni un paso; la segunda, sí.
  const r = choquesDeReserva({ reserva, flota, reservas: [], contratos: [], hoy: HOY, limiteDeBusqueda: 0 });
  assert.equal(r.length, 1);
  assert.match(r[0].mensaje, /^No se pudo comprobar si te queda un Sedán libre en esas fechas: hay demasiadas reservaciones cruzadas/);
  assert.deepEqual(choquesDeReserva({ reserva, flota, reservas: [], contratos: [], hoy: HOY }), [], 'con todo el tiempo, cabe');
});

test('un carro exacto cuando la búsqueda se rinde a la mitad: «no se pudo comprobar», no «se queda sin unidad»', () => {
  // La otra rama de lo mismo (`perdida: sin - con`). Seis sedanes, ocho reservaciones, una clavada a otro carro: con un límite
  // de 25 pasos la primera búsqueda termina y la segunda no.
  const flota = Array.from({ length: 6 }, (_, i) => carro(`s${i + 1}`, 'Sedán'));
  const porTipo = (id, desde, dias) => apartada(id, desde, dias, { tipoVehiculo: 'Sedán' });
  const reservas = [
    porTipo('r0', '2026-12-03', 2), porTipo('r1', '2026-12-03', 4), porTipo('r2', '2026-12-01', 2), porTipo('r3', '2026-12-03', 2),
    porTipo('r4', '2026-12-01', 6), apartada('r5', '2026-12-01', 6, { carroId: 's5', carroPlacas: 'P-s5' }),
    porTipo('r6', '2026-12-03', 4), porTipo('r7', '2026-12-03', 2),
  ];
  const reserva = borrador('2026-12-04', 4, { carroId: 's1', carroPlacas: 'P-s1' });
  const sinPrisa = choquesDeReserva({ reserva, flota, reservas, contratos: [], hoy: HOY });
  assert.match(sinPrisa[0].mensaje, /^Si apartas este carro, otra reservación de Sedán \(sin carro elegido\) se queda sin unidad/);
  const conPrisa = choquesDeReserva({ reserva, flota, reservas, contratos: [], hoy: HOY, limiteDeBusqueda: 25 });
  assert.equal(conPrisa.length, 1);
  assert.match(conPrisa[0].mensaje, /^No se pudo comprobar si apartar este carro le deja sin unidad a otra reservación de Sedán/);
});

test('choquesDeReserva: sin reservación, o sin carro ni tipo, devuelve una lista vacía (no null)', () => {
  // `return []` -> `return null`: quien llama hace `.length` o `.map` sobre el resultado.
  assert.deepEqual(choquesDeReserva({ reserva: undefined, hoy: HOY }), []);
  assert.deepEqual(choquesDeReserva({ reserva: borrador('2026-12-02', 5), flota: [carro('s1', 'Sedán')], hoy: HOY }), []);
});
