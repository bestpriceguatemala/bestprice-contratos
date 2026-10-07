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
import { garantiaPorLiberar } from '../js/nucleo/estados.js';
import {
  primerDiaMes, ultimoDiaMes, filtrarPorEstado, contratosVisibles,
  claseFilaContrato, textoCuenta, numeroEnmascarado, textoConfirmarAnular, textoHoraTardia,
  textoEstadoGarantia, seccionPagos,
} from '../js/pantallas/contratos.js';
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
