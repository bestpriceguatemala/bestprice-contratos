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
import { readFileSync } from 'node:fs';
import { textoDeContrato } from '../js/nucleo/busqueda.js';
import { CODIGO_GARANTIA_LIBERADA_CON_SALDO } from '../js/datos.js';
import { garantiaPorLiberar } from '../js/nucleo/estados.js';
import {
  primerDiaMes, ultimoDiaMes, filtrarPorEstado, contratosVisibles,
  claseFilaContrato, textoCuenta, numeroEnmascarado, textoConfirmarAnular, textoHoraTardia,
  textoEstadoGarantia, seccionPagos, textoFalloAlAnular, textoSinResultados,
  CRITERIOS_ESTADO, OPCIONES_DE_ESTADO, opcionesDeEstadoHTML, textoAlcanceDelFiltro, accionDeRecibo, plantillaDetalle,
} from '../js/pantallas/contratos.js';
import {
  leerParametroRuta, textoCorreccion, montoInicialPago, plantilla as plantillaDeRecibir,
} from '../js/pantallas/recibirCarro.js';
import { emparejar } from '../js/router.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { contratoParaGuardar } from '../js/datos.js';
import { estadoContrato, creditoDelCliente } from '../js/nucleo/estados.js';
import {
  rentadoAlDia, rentadoConSobrepago, devueltoDebiendo, cerradoAlDia, cerradoConCredito,
} from './fixtures/contratosDeUnaCuenta.mjs';
import { lineasSalida, lineasDevolucion, resumen } from '../js/nucleo/contrato.js';
import { contratoGuardadoConHoraTardiaSiNo } from './fixtures/contratoGuardadoConHoraTardiaSiNo.mjs';
import { contratoGuardadoConHoraTardiaAlSalir } from './fixtures/contratoGuardadoConHoraTardiaAlSalir.mjs';

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
  const afueraSinLiberar = {
    dias: 2, precioDia: 100, pagos: [], garantiaMonto: 500, garantiaLiberada: false,
  };
  // Ya volvió, saldo en 0, pero la garantía sigue bloqueada: SÍ cuenta.
  const devueltaSinLiberar = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaMonto: 500, garantiaLiberada: false,
  };
  // Ya volvió y ya se liberó: no cuenta.
  const devueltaLiberada = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaMonto: 500, garantiaLiberada: true,
  };
  const resultado = filtrarPorEstado([afueraSinLiberar, devueltaSinLiberar, devueltaLiberada], 'garantiasSinLiberar');
  assert.deepEqual(resultado, [devueltaSinLiberar]);
});

// IMPORTANTE de la revisión final: sin tarjeta de por medio (garantiaMonto
// 0), no hay nada que liberar — este contrato no debería aparecer aquí
// aunque `garantiaLiberada` siga en false, porque nunca hizo falta liberar
// nada.
test('filtrarPorEstado: garantiasSinLiberar no cuenta una renta en efectivo (garantiaMonto 0)', () => {
  const enEfectivoSinTocar = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaMonto: 0, garantiaLiberada: false,
  };
  assert.deepEqual(filtrarPorEstado([enEfectivoSinTocar], 'garantiasSinLiberar'), []);
});

// Hallazgo de la revisión: este mismo criterio ("¿el carro ya volvió Y la
// garantía sigue bloqueada?") vivía escrito a mano aquí Y en flota.js
// (filasGarantia) Y en calendario.js (resumenDeHoy) — tres copias que hoy
// coinciden pero que nada obligaba a seguir coincidiendo el día que alguien
// afinara la regla en un solo lugar. Ahora las tres llaman a
// garantiaPorLiberar (nucleo/estados.js); esta prueba fija que el criterio
// de ESTA pantalla (garantiasSinLiberar) de verdad es esa misma función, en
// las dos direcciones que importan, no una que hoy da la misma respuesta por
// casualidad.
test('filtrarPorEstado: garantiasSinLiberar concuerda con garantiaPorLiberar (nucleo/estados.js) en las dos direcciones', () => {
  // Carro TODAVÍA AFUERA con garantía bloqueada: las dos dicen que NO cuenta.
  const carroAfuera = {
    dias: 2, precioDia: 100, pagos: [], garantiaMonto: 500, garantiaLiberada: false,
  };
  // Carro YA DE VUELTA con garantía bloqueada: las dos dicen que SÍ cuenta.
  const carroDeVuelta = {
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaMonto: 500, garantiaLiberada: false,
  };

  assert.equal(garantiaPorLiberar(carroAfuera), false);
  assert.equal(garantiaPorLiberar(carroDeVuelta), true);

  const contratos = [carroAfuera, carroDeVuelta];
  assert.deepEqual(
    filtrarPorEstado(contratos, 'garantiasSinLiberar'),
    contratos.filter(garantiaPorLiberar),
    'el filtro de esta pantalla tiene que devolver EXACTAMENTE lo mismo que garantiaPorLiberar',
  );
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
    dias: 1, precioDia: 100, devolucionPrevista: '2026-08-01', cierre: { fechaReal: '2026-08-01' }, pagos: [{ monto: 100, porcentajeTarjeta: 0 }], garantiaMonto: 500, garantiaLiberada: false,
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

// ---------- textoConfirmarAnular ----------
//
// Tarea "cobro-claro": el confirm() antes de anular un pago, mismo patrón
// que textoConfirmarLiberar (flota.js) — nombra el monto y la fecha del pago
// para que el mostrador sepa exactamente qué está a punto de marcar como
// anulado antes de tocar nada.
test('textoConfirmarAnular: avisa si la garantía ya se liberó', () => {
  // El caso que cuesta plata: el contrato se cerró, se soltó la tarjeta, y
  // después se anula el pago. El cliente vuelve a deber y ya no hay garantía
  // que ejecutar. Tiene que enterarse ANTES de anular, no después.
  const pago = { monto: 3150, fecha: '2026-09-22' };
  const conGarantiaSuelta = textoConfirmarAnular(pago, { garantiaLiberada: true });
  assert.match(conGarantiaSuelta, /ya se liberó/i);
  assert.match(conGarantiaSuelta, /no tienes la tarjeta bloqueada/i);

  const conGarantiaBloqueada = textoConfirmarAnular(pago, { garantiaLiberada: false });
  assert.doesNotMatch(conGarantiaBloqueada, /ya se liberó/i);
  assert.doesNotMatch(textoConfirmarAnular(pago), /ya se liberó/i, 'sin contrato, no inventa el aviso');
});

test('textoConfirmarAnular: nombra el monto y la fecha del pago', () => {
  const texto = textoConfirmarAnular({ monto: 4800, fecha: '2026-08-25' });
  assert.match(texto, /Q4,800\.00/);
  assert.match(texto, /25 ago 2026/);
});

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

// ---------- La hora tardía en el detalle del contrato ----------
//
// Un contrato nuevo con monto la muestra como una línea de «Cobro al recibir»
// (lineasDevolucion, que prueba contrato.test.mjs), porque el dueño la cobra
// «solo al devolver». Un contrato de unas horas la trae como un número en la
// salida y la muestra en «Cobro al salir», como se cobró. Un contrato viejo
// trae `horaTardia: true`, una casilla marcada sin cifra: el detalle dice eso,
// tal cual, en «Datos de la salida» (que es donde se marcó), y no le pone ni un
// monto ni un aviso.
test('textoHoraTardia: un contrato viejo con la casilla marcada dice que se marcó al salir, sin monto', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  assert.equal(viejo.horaTardia, true);
  assert.equal(textoHoraTardia(viejo), 'Marcada al salir, sin monto registrado');
});

test('textoHoraTardia: con monto, en cero, falso o ausente no dice nada (el monto ya sale en el cobro)', () => {
  assert.equal(textoHoraTardia({ horaTardia: 150 }), '', 'la de la salida: sale en «Cobro al salir»');
  assert.equal(textoHoraTardia({ cierre: { horaTardia: 150 } }), '', 'la de la devolución: sale en «Cobro al recibir»');
  assert.equal(textoHoraTardia({ horaTardia: 0 }), '');
  assert.equal(textoHoraTardia({ horaTardia: false }), '');
  assert.equal(textoHoraTardia({ cierre: { horaTardia: 0 } }), '');
  assert.equal(textoHoraTardia({}), '');
  assert.equal(textoHoraTardia(undefined), '');
});

test('textoHoraTardia: un `true` viejo al que se le anota un monto al recibir ya no está «sin monto»', () => {
  const c = { ...contratoGuardadoConHoraTardiaSiNo(), cierre: { fechaReal: '2026-09-28', horaTardia: 150 } };
  assert.equal(c.horaTardia, true);
  assert.equal(textoHoraTardia(c), '', 'decir «sin monto» junto a una línea de Q150 se contradiría');
  assert.deepEqual(lineasDevolucion(c).map((l) => [l.concepto, l.monto]), [['Cobro días de atraso', 700], ['Hora tardía', 150]]);
  // ...pero con la hora tardía en cero sigue sin monto, y lo dice.
  assert.equal(textoHoraTardia({ ...c, cierre: { ...c.cierre, horaTardia: 0 } }), 'Marcada al salir, sin monto registrado');
});

test('el detalle de un contrato viejo con horaTardia: true sigue mostrando Q3,150.00 al salir y ninguna línea de hora tardía', () => {
  const viejo = contratoGuardadoConHoraTardiaSiNo();
  assert.deepEqual(lineasSalida(viejo).map((l) => [l.concepto, l.monto]), [['Renta', 2800], ['Carta poder', 350]]);
  assert.equal(resumen(viejo).totalSalida, 3150);
  assert.equal(textoCuenta(viejo), 'En curso', 'y su estado no cambia');
});

test('el detalle de un contrato guardado con la hora tardía en la salida sigue mostrando la línea y Q3,300.00 al salir', () => {
  const guardado = contratoGuardadoConHoraTardiaAlSalir();
  assert.deepEqual(lineasSalida(guardado).map((l) => [l.concepto, l.monto]), [
    ['Renta', 2800], ['Hora tardía', 150], ['Carta poder', 350],
  ]);
  assert.equal(resumen(guardado).totalSalida, 3300);
  assert.equal(textoHoraTardia(guardado), '');
  assert.equal(textoCuenta(guardado), 'En curso', 'y su estado no cambia: Q3,300 cobrados de Q3,300');
});

test('el detalle de un contrato con Q150 de hora tardía al recibir la muestra en «Cobro al recibir», no al salir', () => {
  // Un contrato nuevo ya no trae `horaTardia` en la salida: solo el cierre.
  const { horaTardia: _casilla, ...sinCasilla } = contratoGuardadoConHoraTardiaSiNo();
  const recibido = {
    ...sinCasilla,
    cierre: { fechaReal: '2026-09-27', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 45600, horaTardia: 150 },
  };
  assert.deepEqual(lineasSalida(recibido).map((l) => [l.concepto, l.monto]), [['Renta', 2800], ['Carta poder', 350]]);
  assert.deepEqual(lineasDevolucion(recibido).map((l) => [l.concepto, l.monto]), [['Hora tardía', 150]]);
  const r = resumen(recibido);
  assert.equal(r.totalSalida, 3150, 'Total al salir');
  assert.equal(r.totalDevolucion, 150, 'Total al recibir');
  assert.equal(r.saldo, 150, 'sin pagar la hora tardía, es justo lo que falta');
  assert.equal(textoHoraTardia(recibido), '');
});

// ---------------------------------------------------------------------------
// Prueba del sistema (7 oct 2026): dos cosas del detalle de un contrato que decían
// algo distinto de lo que pasó.
// ---------------------------------------------------------------------------

test('textoEstadoGarantia: una renta sin tarjeta no dice «Liberada»: nunca hubo nada que liberar', () => {
  // Toda renta en efectivo (la mayoría) mostraba «Monto bloqueado Q0.00 · Estado: Liberada»,
  // incluso con el carro todavía afuera.
  assert.equal(textoEstadoGarantia({ garantiaMonto: 0, garantiaLiberada: false, tarjetas: [] }), 'Sin garantía');
  assert.equal(textoEstadoGarantia({ garantiaMonto: 0, garantiaLiberada: false, cierre: { fechaReal: '2026-10-20' } }), 'Sin garantía');
  assert.equal(textoEstadoGarantia({}), 'Sin garantía');
});

test('textoEstadoGarantia: con tarjeta, «Sin liberar» hasta soltarla y «Liberada el …» después', () => {
  const conTarjeta = { garantiaMonto: 5000, tarjetas: [{ ultimos4: '1111', montoAutorizado: 5000 }] };
  assert.equal(textoEstadoGarantia({ ...conTarjeta, garantiaLiberada: false }), 'Sin liberar');
  assert.equal(
    textoEstadoGarantia({ ...conTarjeta, garantiaLiberada: true, garantiaLiberadaEn: '2026-10-17', cierre: { fechaReal: '2026-10-17' }, pagos: [] }),
    'Liberada el 17 oct 2026',
  );
  assert.equal(textoEstadoGarantia({ ...conTarjeta, garantiaLiberada: true, cierre: { fechaReal: '2026-10-17' }, pagos: [] }), 'Liberada');
});

test('seccionPagos: cada fila dice lo que de verdad se cobró, y las filas suman el «Total cobrado»', () => {
  // Con el ejemplo de la §5 el detalle decía «Monto Q3,150.00» y «Monto Q730.00» (sin el 12 %) y arriba
  // «Total cobrado Q4,345.60»: 3,150 + 730 = 3,880, y nada en la tabla explicaba los otros Q465.60.
  const c = ejemplo();
  const html = seccionPagos(c);
  const celdas = [...html.matchAll(/<td class="cobrado">([^<]*)<\/td>/g)].map((m) => m[1]);
  assert.deepEqual(celdas, ['Q3,528.00', 'Q817.60']);
  assert.equal(resumen(c).totalCobrado, 4345.6);
  assert.match(html, /<th>Cobrado<\/th>/);
  assert.match(html, /Q3,150\.00/, 'y el monto sin recargo sigue a la vista');
});

test('seccionPagos: un pago en efectivo cobra lo mismo que su monto, y uno anulado no suma pero se sigue viendo', () => {
  const c = {
    ...ejemplo(),
    pagos: [
      { monto: 1000, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-21' },
      { monto: 500, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-22', anulado: true, anuladoEn: '2026-08-23' },
    ],
  };
  const html = seccionPagos(c);
  const celdas = [...html.matchAll(/<td class="cobrado">([^<]*)<\/td>/g)].map((m) => m[1]);
  assert.deepEqual(celdas, ['Q1,000.00', 'Q500.00'], 'el anulado sale tachado en su fila, con su cifra');
  assert.match(html, /class="fila-anulada"/);
});

// Prueba del sistema (7 oct 2026): en una renta con la garantía ya liberada, «Anular» pregunta
// «OJO: la garantía ya se liberó, así que si queda saldo, ya no tienes la tarjeta bloqueada» — como si
// se pudiera — y al aceptar dice «No se pudo anular el pago. Intenta de nuevo.»: guardarContrato se
// niega mientras quede saldo con la garantía soltada, y reintentar nunca cambia eso.
test('textoFalloAlAnular: un fallo cualquiera sigue pidiendo intentar de nuevo', () => {
  assert.equal(textoFalloAlAnular(new Error('La nube no respondió a tiempo.')), 'No se pudo anular el pago. Intenta de nuevo.');
  assert.equal(textoFalloAlAnular(undefined), 'No se pudo anular el pago. Intenta de nuevo.');
});

test('textoFalloAlAnular: el rechazo por garantía ya liberada dice por qué, no «intenta de nuevo»', () => {
  const texto = textoFalloAlAnular(Object.assign(new Error('Todavía debe Q500.00.'), { codigo: CODIGO_GARANTIA_LIBERADA_CON_SALDO }));
  assert.match(texto, /garantía/);
  assert.match(texto, /liberó/);
  assert.match(texto, /debiendo/);
  assert.ok(!/intenta de nuevo/i.test(texto));
});

test('anularDesdeLaFicha usa textoFalloAlAnular en su catch', () => {
  const fuente = readFileSync(new URL('../js/pantallas/contratos.js', import.meta.url), 'utf8');
  assert.match(fuente, /aviso\(textoFalloAlAnular\(error\), 'error'\)/);
});

// La lista solo trae las rentas cuya SALIDA cae en el rango (abre con el mes en curso). El 2 de noviembre,
// buscar a un cliente que salió en octubre y sigue afuera contestaba «Sin resultados.» como si no existiera.
test('textoSinResultados: dice el rango de salida que se está mirando y qué cambiar para buscar en otro mes', () => {
  assert.equal(
    textoSinResultados({ desde: primerDiaMes('2026-11-02'), hasta: ultimoDiaMes('2026-11-02') }),
    'Sin resultados con salida del 1 nov 2026 al 30 nov 2026. Si buscas una renta de otro mes, cambia «Desde» y «Hasta».',
  );
});

test('textoSinResultados: sin rango conocido no inventa fechas, pero sigue diciendo qué cambiar', () => {
  assert.equal(textoSinResultados(), 'Sin resultados. Si buscas una renta de otro mes, cambia «Desde» y «Hasta».');
  assert.equal(textoSinResultados({ desde: '2026-11-01' }), 'Sin resultados. Si buscas una renta de otro mes, cambia «Desde» y «Hasta».');
});

// ---------- H-8 y H-9 (prueba del sistema, 7 oct 2026) ----------
//
test('los contratos de estas pruebas son los que dicen ser: el de H-9 queda cerrado con Q1,400 a favor', () => {
  assert.equal(estadoContrato(rentadoAlDia()), 'rentado');
  assert.equal(estadoContrato(devueltoDebiendo()), 'devuelto');
  assert.equal(estadoContrato(cerradoAlDia()), 'cerrado');
  const credito = cerradoConCredito();
  assert.equal(credito.estado, 'cerrado', 'sin deuda y sin garantía, el contrato se cierra aunque se le deba al cliente');
  assert.equal(resumen(credito).saldo, -1400);
  assert.equal(textoCuenta(credito), 'A favor del cliente Q1,400.00');
});

// ---- H-9: el filtro «A favor del cliente» ----

test('H-9, filtrarPorEstado: aFavorDelCliente trae al que tiene crédito y a nadie más (ni al que debe, ni al que está a mano)', () => {
  const credito = cerradoConCredito();
  const todos = [rentadoAlDia(), devueltoDebiendo(), cerradoAlDia(), credito];
  assert.deepEqual(filtrarPorEstado(todos, 'aFavorDelCliente'), [credito]);
});

// Mismo cuidado que el filtro de garantías (`garantiaPorLiberar`): el filtro y la frase de cada renglón preguntan lo
// mismo a la misma función, en las dos direcciones, y la pantalla no vuelve a decidir qué es un crédito por su cuenta.
test('H-9, filtrarPorEstado: aFavorDelCliente concuerda con creditoDelCliente (nucleo/estados.js) y con la frase del renglón', () => {
  const todos = [rentadoAlDia(), rentadoConSobrepago(), devueltoDebiendo(), cerradoAlDia(), cerradoConCredito()];
  const traidos = filtrarPorEstado(todos, 'aFavorDelCliente');
  for (const c of todos) {
    const esCredito = creditoDelCliente(c) > 0;
    assert.equal(traidos.includes(c), esCredito, `contrato ${c.numero}`);
    assert.equal(/A favor del cliente/.test(textoCuenta(c)), esCredito, `la frase del contrato ${c.numero} dice lo mismo que el filtro`);
  }
});

test('H-9: la pantalla pregunta a creditoDelCliente y no repite la cuenta con resumen(c).saldo < 0', () => {
  const fuente = readFileSync(new URL('../js/pantallas/contratos.js', import.meta.url), 'utf8');
  assert.match(fuente, /aFavorDelCliente: \(c\) => creditoDelCliente\(c\) > 0/);
  assert.match(fuente, /const credito = creditoDelCliente\(c\)/);
  assert.doesNotMatch(fuente, /resumen\(c\)\.saldo < 0/);
});

test('H-9, filtrarPorEstado: un crédito NO es un cobro pendiente — «Pendientes de cobro» sigue siendo saldo > 0 y no lo trae', () => {
  const credito = cerradoConCredito();
  const debe = devueltoDebiendo();
  assert.deepEqual(filtrarPorEstado([credito, debe], 'pendientesCobro'), [debe]);
  assert.deepEqual(filtrarPorEstado([credito, debe], 'aFavorDelCliente'), [credito], 'y el espejo: el que debe no sale como crédito');
});

test('H-9, filtrarPorEstado: el crédito de una renta que todavía anda afuera (cobró de más al salir) también aparece', () => {
  const sobrepago = rentadoConSobrepago();
  assert.equal(estadoContrato(sobrepago), 'rentado');
  assert.deepEqual(filtrarPorEstado([rentadoAlDia(), sobrepago], 'aFavorDelCliente'), [sobrepago]);
});

test('H-9, filtrarPorEstado: un pago anulado deja de contar, y con él el crédito que había hecho', () => {
  // El sobrepago de Q200 se anula: resumen() ya lo ignora, así que el contrato vuelve a estar a mano.
  const sobrepago = rentadoConSobrepago();
  const anulado = { ...sobrepago, pagos: sobrepago.pagos.map((p) => ({ ...p, anulado: true })) };
  assert.deepEqual(filtrarPorEstado([anulado], 'aFavorDelCliente'), []);
});

test('H-9, contratosVisibles: el filtro de crédito y el buscador se combinan', () => {
  const credito = cerradoConCredito();
  const otroCredito = { ...rentadoConSobrepago(), clienteNombre: 'ANA GÓMEZ' };
  const lista = [credito, otroCredito, cerradoAlDia()];
  assert.equal(contratosVisibles(lista, { filtro: 'aFavorDelCliente', consulta: '' }).length, 2);
  assert.deepEqual(contratosVisibles(lista, { filtro: 'aFavorDelCliente', consulta: 'gomez' }), [otroCredito]);
});

test('H-9, textoCuenta: una renta que sigue afuera con sobrepago lo dice — si no, el filtro la traería con un renglón que no explica por qué', () => {
  assert.equal(textoCuenta(rentadoConSobrepago()), 'En curso · A favor del cliente Q200.00');
  assert.equal(textoCuenta(rentadoAlDia()), 'En curso', 'sin crédito sigue diciendo solo «En curso»');
  assert.equal(textoCuenta({ dias: 1, precioDia: 100, pagos: [] }), 'En curso', 'y debiendo también: un saldo por cobrar mientras anda afuera es lo normal');
});

// El <select> sale de UNA lista. filtrarPorEstado con una clave que no conoce devuelve la lista entera sin
// avisar, así que una opción escrita a mano con otro valor se vería «sin efecto» y nadie sabría por qué.
test('H-9, OPCIONES_DE_ESTADO: cada opción menos «Todos» tiene su criterio, y ningún criterio queda sin opción', () => {
  const valores = OPCIONES_DE_ESTADO.map((o) => o.valor);
  assert.equal(new Set(valores).size, valores.length, 'ningún valor repetido');
  assert.equal(valores[0], 'todos');
  for (const valor of valores.filter((v) => v !== 'todos')) {
    assert.equal(typeof CRITERIOS_ESTADO[valor], 'function', `la opción «${valor}» no tiene criterio: filtraría nada`);
  }
  assert.deepEqual([...Object.keys(CRITERIOS_ESTADO)].sort(), valores.filter((v) => v !== 'todos').sort());
});

test('H-9, opcionesDeEstadoHTML: «A favor del cliente» está en el menú, justo al lado de «Pendientes de cobro» (su espejo)', () => {
  const html = opcionesDeEstadoHTML();
  assert.match(html, /<option value="aFavorDelCliente">A favor del cliente<\/option>/);
  const textos = [...html.matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(textos, [
    'Todos', 'Rentados', 'Devueltos', 'Pendientes de cobro', 'A favor del cliente', 'Garantías sin liberar', 'Cerrados',
  ]);
});

// La lista solo trae las rentas con SALIDA en el rango (abre con el mes en curso). Una renta que salió el 28 de
// septiembre y se corrigió en octubre no está en ese rango: sin decirlo, «A favor del cliente» con una fila
// parecería la lista completa, y es justo la clase de filtro que se lee como «no se le debe a nadie más».
test('H-9, textoAlcanceDelFiltro: el filtro de crédito dice qué rango de salidas está mirando; los demás no dicen nada', () => {
  const rango = { desde: '2026-10-01', hasta: '2026-10-31' };
  const texto = textoAlcanceDelFiltro('aFavorDelCliente', rango);
  assert.match(texto, /1 oct 2026/);
  assert.match(texto, /31 oct 2026/);
  assert.match(texto, /«Desde» y «Hasta»/);
  for (const otro of ['todos', 'rentados', 'devueltos', 'pendientesCobro', 'garantiasSinLiberar', 'cerrados', undefined]) {
    assert.equal(textoAlcanceDelFiltro(otro, rango), '', `«${otro}» no lleva nota`);
  }
});

test('H-9, textoAlcanceDelFiltro: sin rango conocido no inventa fechas', () => {
  const texto = textoAlcanceDelFiltro('aFavorDelCliente', {});
  assert.doesNotMatch(texto, /undefined|null|NaN/);
  assert.match(texto, /«Desde» y «Hasta»/);
});

// Lo que no se puede probar sin un navegador es el cableado. Se comprobó a mano en pantalla (menú, filtro, nota,
// clic en una fila después de filtrar) y estas dos líneas fijan que el cableado no se pierda en silencio.
test('H-9, cableado: el menú se dibuja de OPCIONES_DE_ESTADO y la nota se repinta con las filas (al filtrar y al buscar)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/contratos.js', import.meta.url), 'utf8');
  assert.match(fuente, /<select id="ct-estado">\s*\$\{opcionesDeEstadoHTML\(\)\}\s*<\/select>/);
  assert.match(fuente, /id="ct-alcance"/);
  const repintar = fuente.slice(fuente.indexOf('function repintarFilas()'), fuente.indexOf('function repintarAlcance('));
  assert.match(repintar, /repintarAlcance\(visibles\.length > 0\)/);
  assert.match(repintar, /cablearFilas\(\)/);
  // Y se dibuja ya puesta al abrir la pantalla (el filtro sobrevive a recargar la lista de la nube).
  assert.match(fuente, /el\('ct-estado'\)\.value = filtro;\s*repintarAlcance\(/);
});

// ---- H-8: «Recibir carro» y «Corregir» en el detalle del contrato ----

test('H-8, accionDeRecibo: el carro sigue afuera -> «Recibir carro»; ya volvió (devuelto o cerrado) -> «Corregir»', () => {
  assert.equal(accionDeRecibo(rentadoAlDia()).texto, 'Recibir carro');
  assert.equal(accionDeRecibo(rentadoConSobrepago()).texto, 'Recibir carro');
  assert.equal(accionDeRecibo(devueltoDebiendo()).texto, 'Corregir');
  assert.equal(accionDeRecibo(cerradoAlDia()).texto, 'Corregir');
  assert.equal(accionDeRecibo(cerradoConCredito()).texto, 'Corregir');
});

test('H-8, accionDeRecibo: sin contrato o sin id no hay botón (un enlace a «#/recibir/undefined» no lleva a ningún lado)', () => {
  assert.equal(accionDeRecibo(null), null);
  assert.equal(accionDeRecibo({ numero: 3, dias: 1, precioDia: 1, pagos: [] }), null);
});

// LA PRUEBA QUE IMPORTA de H-8. Reabrir un cierre ya guardado fue lo que una vez produjo un pago fantasma: la
// pantalla volvía armada para cobrar el saldo entero otra vez. El camino correcto es el de la corrección
// (`montoInicialPago` arranca en 0), y la pantalla elige su modo SOLA, mirando el contrato y el sufijo de la
// ruta. Aquí se recorre ese mismo camino: la ruta del botón, por el enrutador de verdad, hasta el modo en que
// abre y el monto con que arranca.
test('H-8, «Corregir» abre «Recibir carro» en modo de CORRECCIÓN y sin nada pre-cobrado, aunque el contrato todavía deba', () => {
  const debiendo = devueltoDebiendo();
  assert.ok(resumen(debiendo).saldo > 0, 'punto de partida: este contrato todavía debe, justo el que armaría un cobro fantasma');

  const accion = accionDeRecibo(debiendo);
  const [parametro] = emparejar(accion.ruta, '#/recibir/:contratoId');
  const { contratoId, soloCobro } = leerParametroRuta(parametro);

  assert.equal(contratoId, debiendo.id);
  assert.equal(soloCobro, false, 'no es «Cobrar»: ese modo SÍ prellena el saldo completo');
  const enCorreccion = Boolean(textoCorreccion(debiendo));
  assert.equal(enCorreccion, true, 'la pantalla abre en corrección porque el contrato ya tiene cierre');
  assert.equal(montoInicialPago(resumen(debiendo).saldo, { enCorreccion, soloCobro }), 0, 'nada pre-cobrado');

  const html = plantillaDeRecibir(debiendo, soloCobro);
  assert.match(html, /Guardar correcciones/);
  assert.doesNotMatch(html, /Recibir y cobrar/);
});

test('H-8, «Recibir carro» abre una recepción NORMAL (sin corrección, sin solo cobro) para un carro que sigue afuera', () => {
  const afuera = rentadoAlDia();
  const accion = accionDeRecibo(afuera);
  const [parametro] = emparejar(accion.ruta, '#/recibir/:contratoId');
  const { contratoId, soloCobro } = leerParametroRuta(parametro);
  assert.equal(contratoId, afuera.id);
  assert.equal(soloCobro, false);
  assert.equal(textoCorreccion(afuera), null, 'no hay cierre: es la primera vez que se recibe');
});

test('H-8, accionDeRecibo: el modo de la pantalla y el rótulo del botón nunca se desacuerdan (lo decide `cierre.fechaReal` en los dos)', () => {
  for (const c of [rentadoAlDia(), rentadoConSobrepago(), devueltoDebiendo(), cerradoAlDia(), cerradoConCredito()]) {
    assert.equal(accionDeRecibo(c).texto === 'Corregir', Boolean(textoCorreccion(c)), `contrato ${c.numero}`);
  }
});

test('H-8, accionDeRecibo: la ruta es la de siempre, sin parámetros (el id va en el último pedazo)', () => {
  assert.equal(accionDeRecibo(rentadoAlDia()).ruta, '#/recibir/c-afuera');
  assert.equal(accionDeRecibo(cerradoAlDia()).ruta, '#/recibir/c-cerrado');
  assert.doesNotMatch(accionDeRecibo(cerradoAlDia()).ruta, /\?|cobro/);
});

test('H-8, el detalle de un carro que sigue afuera trae «Recibir carro» y no «Corregir»', () => {
  const html = plantillaDetalle(rentadoConSobrepago());
  assert.match(html, /<a [^>]*href="#\/recibir\/c-sobrepago"[^>]*>Recibir carro<\/a>/);
  assert.doesNotMatch(html, />Corregir</);
});

test('H-8, el detalle de un contrato cerrado trae «Corregir», hacia la recepción de siempre, y no «Recibir carro»', () => {
  for (const c of [cerradoAlDia(), cerradoConCredito(), devueltoDebiendo()]) {
    const html = plantillaDetalle(c);
    assert.match(html, new RegExp(`<a [^>]*href="#/recibir/${c.id}"[^>]*>Corregir</a>`), `contrato ${c.numero}`);
    assert.doesNotMatch(html, />Recibir carro</);
    assert.doesNotMatch(html, /cobro=1/, 'jamás el modo de solo cobro: ese pre-cobra el saldo');
  }
});

test('H-8, el detalle sigue trayendo «Volver», y el botón de recibir no es un <button> que dependa de un manejador', () => {
  const html = plantillaDetalle(cerradoAlDia());
  assert.match(html, /id="ct-volver"/);
  // Un enlace navega por sí solo: no hay manejador de clic que pueda dejar de cablearse sin que ninguna prueba lo note.
  assert.doesNotMatch(html, /<button[^>]*>Corregir/);
  assert.doesNotMatch(html, /<button[^>]*>Recibir carro/);
});

test('H-8, el detalle de un contrato sin id no dibuja un enlace roto', () => {
  const html = plantillaDetalle({ numero: 3, dias: 1, precioDia: 1, pagos: [] });
  assert.doesNotMatch(html, /#\/recibir\//);
});

// Los kilómetros son un entero con separador de miles, igual en la salida y en la entrada del MISMO detalle, y «no se anotó» (0) es un «—» y no
// un odómetro en cero (§7b: un 0 aquí es «no se anotó»; recibirCarro.js ya lo trata así). El detalle decía «12,000» abajo de «Datos de la salida» y
// «12900» abajo de «Cobro al recibir» (sin miles, y con los decimales de un q() si se había tecleado «12900.5»), y mostraba «0» donde no se anotó nada.
const valorDelCampo = (html, etiqueta) => new RegExp(`${etiqueta}\\s*<input[^>]*value="([^"]*)"`).exec(html)?.[1];
const conKilometros = (kmSalida, kmEntrada) => {
  const salida = construirContrato({
    id: 'c-km', numero: 90, cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' }, ajeno: false,
    carro: { id: 'v1', placas: 'P-111AAA', marca: 'Toyota', linea: 'Hilux' }, fechaSalida: '2026-10-03', dias: 4, precioDia: 700,
    forma: 'efectivo', porcentajeTarjeta: 0, montoPago: 2800, rentadoPor: 'Ana', porcentajeComision: 5, kmSalida,
  });
  const recibido = construirCierre(salida, {
    fechaReal: '2026-10-07', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada, combustible: 0, danos: 0, varios: 0, descuento: 0,
  });
  return contratoParaGuardar(recibido, { id: 'c-km', numero: 90, ahora: 1790000000000 });
};

test('el detalle dice los kilómetros de entrada y de salida igual (enteros con miles), y lo que no se anotó como «—», no como «0»', () => {
  const con = plantillaDetalle(conKilometros(12000, 12900));
  assert.equal(valorDelCampo(con, 'Kilometraje de salida'), '12,000');
  assert.equal(valorDelCampo(con, 'Kilometraje de entrada'), '12,900');
  // un kilometraje tecleado con decimales no los enseña
  assert.equal(valorDelCampo(plantillaDetalle(conKilometros(12000, 12900.5)), 'Kilometraje de entrada'), '12,901');
  // sin kilometrajes anotados (vacío es 0 al guardar): «—», nunca «0» ni «0.00»
  const sin = plantillaDetalle(conKilometros(0, 0));
  assert.equal(valorDelCampo(sin, 'Kilometraje de salida'), '—');
  assert.equal(valorDelCampo(sin, 'Kilometraje de entrada'), '—');
});

test('H-8 y H-9: las pantallas nuevas usan clases de CSS, no style="" (y las clases existen en la hoja de estilos)', () => {
  const fuente = readFileSync(new URL('../js/pantallas/contratos.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/estilos.css', import.meta.url), 'utf8');
  assert.doesNotMatch(plantillaDetalle(cerradoAlDia()), /style=/);
  assert.match(css, /\.carros-acciones\s*\{/);
  assert.match(fuente, /class="carros-acciones"/);
});
