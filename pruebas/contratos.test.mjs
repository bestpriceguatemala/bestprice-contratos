// Pruebas de la pantalla de historial de contratos (contratos.js): solo la
// parte pura, sin DOM — igual que clientes.test.mjs y carros.test.mjs.
//
// Lo que más importa probar es que los cinco filtros de estado coincidan con
// el mismo criterio que ya usa flota.js (rentado/devuelto/cerrado de
// estadoContrato(), saldo>0 de resumen(), garantía de pendientesDe()) y que
// el ejemplo del diseño (el que "debe cuadrar", pruebas/contrato.test.mjs)
// se vea bien en esta pantalla: subtotal Q3,880.00, total cobrado Q4,345.60.
import test from 'node:test';
import assert from 'node:assert/strict';
import { textoDeContrato } from '../js/nucleo/busqueda.js';
import {
  primerDiaMes, ultimoDiaMes, filtrarPorEstado, contratosVisibles,
  claseFilaContrato, textoCuenta, numeroEnmascarado,
} from '../js/pantallas/contratos.js';

/** El contrato del ejemplo de la §5 del diseño (igual que pruebas/contrato.test.mjs). */
const ejemplo = () => ({
  id: 'ej-1',
  numero: 9001,
  clienteNombre: 'JUAN PÉREZ',
  carroPlacas: 'P-123ABC',
  fechaSalida: '2026-08-21',
  dias: 4,
  precioDia: 700,
  seguroMenoresDia: 0,
  seguroPaiDia: 0,
  deducibleBajo: 0,
  cartaPoderPrecio: 350,
  variosPrecio: 0,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  garantiaLiberada: true,
  pagos: [
    { monto: 3150, porcentajeTarjeta: 12 },
    { monto: 730, porcentajeTarjeta: 12 },
  ],
});

// ---------- textoDeContrato ya alineado (brief: "revisarlo primero") ----------
//
// El brief pedía comprobar que textoDeContrato (busqueda.js) lee los campos
// que los contratos de verdad traen hoy — numero, clienteNombre, carroPlacas,
// carroDescripcion, rentadoPor, tal como los arma construirContrato()
// (sacarCarro.js). Esta prueba deja constancia de que SÍ están alineados
// (a diferencia de Tarea 6, donde textoDeCliente sí necesitó un arreglo):
// si algún día se desalinean, esta prueba lo agarra antes que el buscador.
test('textoDeContrato ya lee los campos reales de un contrato (numero, clienteNombre, carroPlacas...)', () => {
  const c = {
    numero: 42, clienteNombre: 'ANA GÓMEZ', carroPlacas: 'P-999ZZZ', carroDescripcion: 'Toyota Yaris', rentadoPor: 'Esteban',
  };
  const texto = textoDeContrato(c);
  assert.match(texto, /42/);
  assert.match(texto, /ANA GÓMEZ/);
  assert.match(texto, /P-999ZZZ/);
  assert.match(texto, /Toyota Yaris/);
  assert.match(texto, /Esteban/);
});

// ---------- primerDiaMes / ultimoDiaMes ----------

test('primerDiaMes: siempre el día 01 del mismo mes', () => {
  assert.equal(primerDiaMes('2026-09-25'), '2026-09-01');
  assert.equal(primerDiaMes('2026-01-15'), '2026-01-01');
  assert.equal(primerDiaMes(''), '');
  assert.equal(primerDiaMes(undefined), '');
});

test('ultimoDiaMes: respeta meses de 30, 31 y febrero (con y sin año bisiesto)', () => {
  assert.equal(ultimoDiaMes('2026-09-05'), '2026-09-30');
  assert.equal(ultimoDiaMes('2026-01-05'), '2026-01-31');
  assert.equal(ultimoDiaMes('2026-02-05'), '2026-02-28', '2026 no es bisiesto');
  assert.equal(ultimoDiaMes('2028-02-05'), '2028-02-29', '2028 sí es bisiesto');
  assert.equal(ultimoDiaMes('2026-12-05'), '2026-12-31');
  assert.equal(ultimoDiaMes(''), '');
});

// ---------- filtrarPorEstado / contratosVisibles ----------
//
// Mismo criterio que flota.js para que los dos lados nunca se desacuerden:
// "pendientes de cobro" es resumen(c).saldo > 0; "garantías sin liberar"
// exige que el carro ya haya vuelto (c.cierre.fechaReal) y que la garantía
// siga bloqueada — mientras el carro sigue afuera eso no cuenta todavía.
test('filtrarPorEstado: rentado, devuelto y cerrado, por estadoContrato()', () => {
  const rentado = { dias: 1, precioDia: 100, pagos: [] }; // sin cierre
  const devuelto = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [], garantiaLiberada: false,
  }; // debe, sin cerrar
  const cerrado = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaLiberada: true,
  };
  const todos = [rentado, devuelto, cerrado];

  assert.deepEqual(filtrarPorEstado(todos, 'rentados'), [rentado]);
  assert.deepEqual(filtrarPorEstado(todos, 'devueltos'), [devuelto]);
  assert.deepEqual(filtrarPorEstado(todos, 'cerrados'), [cerrado]);
});

test('filtrarPorEstado: sin filtro, o "todos", no descarta nada', () => {
  const contratos = [{ dias: 1, precioDia: 1, pagos: [] }, { dias: 2, precioDia: 1, pagos: [] }];
  assert.deepEqual(filtrarPorEstado(contratos, undefined), contratos);
  assert.deepEqual(filtrarPorEstado(contratos, 'todos'), contratos);
});

test('filtrarPorEstado: pendientesCobro es resumen(c).saldo > 0, sin importar si ya regresó', () => {
  const debeYRentado = { dias: 2, precioDia: 100, pagos: [] }; // Q200, sin cierre
  const debeYDevuelto = {
    dias: 2, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [],
  };
  const pagado = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }],
  };
  const resultado = filtrarPorEstado([debeYRentado, debeYDevuelto, pagado], 'pendientesCobro');
  assert.deepEqual(resultado, [debeYRentado, debeYDevuelto]);
});

test('filtrarPorEstado: garantiasSinLiberar exige que el carro ya haya vuelto', () => {
  // Todavía afuera, sin liberar: NO cuenta (mismo criterio que flota.js).
  const afueraSinLiberar = { dias: 2, precioDia: 100, pagos: [], garantiaLiberada: false };
  // Ya volvió, saldo en 0, pero la garantía sigue bloqueada: SÍ cuenta.
  const devueltaSinLiberar = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaLiberada: false,
  };
  // Ya volvió y ya se liberó: no cuenta.
  const devueltaLiberada = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaLiberada: true,
  };
  const resultado = filtrarPorEstado([afueraSinLiberar, devueltaSinLiberar, devueltaLiberada], 'garantiasSinLiberar');
  assert.deepEqual(resultado, [devueltaSinLiberar]);
});

test('contratosVisibles: aplica el estado y luego el buscador encima', () => {
  const a = {
    id: 'a', numero: 1, clienteNombre: 'ANA LÓPEZ', carroPlacas: 'P-1', dias: 1, precioDia: 100, pagos: [],
  };
  const b = {
    id: 'b', numero: 2, clienteNombre: 'BETO RUIZ', carroPlacas: 'P-2', dias: 1, precioDia: 100, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' },
  };
  const soloA = contratosVisibles([a, b], { filtro: 'rentados', consulta: '' });
  assert.deepEqual(soloA, [a]);

  const buscaAna = contratosVisibles([a, b], { filtro: 'todos', consulta: 'ana' });
  assert.deepEqual(buscaAna, [a]);

  const sinResultado = contratosVisibles([a, b], { filtro: 'rentados', consulta: 'beto' });
  assert.deepEqual(sinResultado, []);
});

// ---------- claseFilaContrato ----------

test('claseFilaContrato: rentado es azul, cerrado se ve apagado, un atraso ya devuelto sale en rojo', () => {
  const rentado = { dias: 1, precioDia: 100, pagos: [] };
  const devueltoATiempo = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-05', cierre: { fechaReal: '2026-08-05' }, pagos: [],
  };
  const devueltoTarde = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-03' }, pagos: [],
  };
  const cerrado = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaLiberada: true,
  };
  assert.equal(claseFilaContrato(rentado), 'es-rentado');
  assert.equal(claseFilaContrato(devueltoATiempo), '');
  assert.equal(claseFilaContrato(devueltoTarde), 'es-atrasado');
  assert.equal(claseFilaContrato(cerrado), 'es-fuera');
});

// ---------- textoCuenta ----------

test('textoCuenta: "En curso" mientras el carro sigue afuera', () => {
  assert.equal(textoCuenta({ dias: 1, precioDia: 100, pagos: [] }), 'En curso');
});

test('textoCuenta: debe, pagado, y a favor del cliente, con el monto exacto de resumen()', () => {
  const debe = {
    dias: 2, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [], garantiaLiberada: true,
  };
  assert.equal(textoCuenta(debe), 'Debe Q200.00');

  const pagado = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaLiberada: true,
  };
  assert.equal(textoCuenta(pagado), 'Pagado');

  const sobrepago = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 150, porcentajeTarjeta: 0 }], garantiaLiberada: true,
  };
  assert.equal(textoCuenta(sobrepago), 'A favor del cliente Q50.00');
});

test('textoCuenta: agrega "garantía sin liberar" solo si ya regresó y sigue bloqueada', () => {
  const devueltoPagadoSinLiberar = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaLiberada: false,
  };
  assert.equal(textoCuenta(devueltoPagadoSinLiberar), 'Pagado · garantía sin liberar');
});

test('textoCuenta: el ejemplo del diseño, ya pagado por completo, sale "Pagado"', () => {
  assert.equal(textoCuenta(ejemplo()), 'Pagado');
});

// ---------- numeroEnmascarado ----------

test('numeroEnmascarado: solo los últimos 4 dígitos, como pide ADR-001', () => {
  assert.equal(numeroEnmascarado('3343'), '•••• 3343');
  assert.equal(numeroEnmascarado('4111 1111 1111 3343'), '•••• 3343', 'si algo trajera el número completo, igual se recorta a 4');
  assert.equal(numeroEnmascarado(''), '••••');
  assert.equal(numeroEnmascarado(undefined), '••••');
  assert.equal(numeroEnmascarado(null), '••••');
});

// ---------- El ejemplo del diseño, tal como lo vería esta pantalla ----------

test('el ejemplo del diseño: subtotal Q3,880.00 y total cobrado Q4,345.60, exactamente como en el diseño', () => {
  // Esta prueba no repite la aritmética (eso ya lo cubre
  // pruebas/contrato.test.mjs con resumen()); solo confirma que esta
  // pantalla, al pedirle el resumen al mismo contrato del ejemplo, ve los
  // mismos dos números que cita el diseño (§5, "Ejemplo que debe cuadrar").
  const c = ejemplo();
  const texto = textoCuenta(c);
  assert.equal(texto, 'Pagado');
  // Ya pagó todo y la garantía está liberada -> estadoContrato() lo da por
  // 'cerrado' (puedeCerrar), así que la fila se ve apagada (es-fuera), no en
  // rojo: el atraso de 1 día quedó cobrado, no es algo que siga pendiente.
  assert.equal(claseFilaContrato(c), 'es-fuera');
});
