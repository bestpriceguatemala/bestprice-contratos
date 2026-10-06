// El cobro de un contrato, de principio a fin.
//
// El cobro sucede en dos momentos, como en el mostrador: al salir el carro se
// cobra todo lo que ya se sabe (renta, seguros por día de los días contratados,
// deducible bajo, hora tardía, carta poder, varios) y al recibirlo solo lo que
// apareció después (atraso, seguros por día de esos días, daños, combustible,
// descuento).
//
// El porcentaje de tarjeta se aplica a CADA pago, no una sola vez al final:
// el cliente puede pagar la renta con tarjeta y el saldo en efectivo, y solo lo
// que se pagó con tarjeta lleva recargo. Cuando todo se paga con tarjeta, el
// total coincide con el de la hoja CONTRATOS del Excel.
import {
  q, suma, conTarjeta, recargoTarjeta, textoDosDecimales,
} from './dinero.js';
import { diasAtraso as calcularAtraso } from './fechas.js';

/** Los días de atraso de un contrato, 0 si todavía no ha regresado. */
export function atrasoDe(c) {
  return calcularAtraso(c?.devolucionPrevista, c?.cierre?.fechaReal);
}

/**
 * Lo que dice `horaTardia` de un contrato: `{ monto, sinMonto }`. ÚNICO lugar
 * que lo interpreta — el cobro (`lineasSalida`) y el detalle del contrato
 * (pantallas/contratos.js) preguntan aquí y ninguno vuelve a mirar el campo.
 *
 * `horaTardia` es un MONTO en quetzales desde que se recuperó el cobro que el
 * Excel traía en la celda «HORA TARDIA» y que el sistema había convertido en
 * una casilla de sí/no (ver §7b del diseño). Pero todo contrato guardado antes
 * de ese cambio lo trae como verdadero o falso, y ahí está la trampa: con
 * `q()` a secas, un `true` vale 1 y cada contrato viejo ganaba Q1.00 en
 * silencio, moviendo el saldo de un contrato que ya se cobró y se cerró.
 *
 *   número  -> es el monto, tal cual (`q`).
 *   true    -> hubo hora tardía y nadie anotó cuánto. NO se sabe, así que
 *              vale 0 en el cobro y `sinMonto` lo deja decir la verdad en el
 *              detalle; nunca se le inventa una cifra.
 *   false, ausente o cualquier otra cosa -> nada.
 */
export function horaTardiaDe(c) {
  const v = c?.horaTardia;
  if (typeof v === 'number') return { monto: q(v), sinMonto: false };
  return { monto: 0, sinMonto: v === true };
}

/** Lo que se cobra al salir el carro. */
export function lineasSalida(c) {
  const dias = q(c?.dias);
  const precio = q(c?.precioDia);
  const lineas = [];

  if (dias && precio) {
    lineas.push({ concepto: 'Renta', detalle: `${dias} días × Q${textoDosDecimales(precio)}`, monto: q(dias * precio) });
  }

  const porDia = suma(c?.seguroMenoresDia, c?.seguroPaiDia);
  const extra = suma(porDia * dias, c?.deducibleBajo);
  if (extra) {
    lineas.push({ concepto: 'Seguros extra', detalle: 'menores, PAI, deducible bajo', monto: extra });
  }

  // Se cobra al salir porque es de la salida: la hora tardía se anota en el
  // formulario de «Sacar carro» (junto a la hora de salida) y sale impresa en
  // el contrato que se entrega, igual que la carta poder. Como ella, la línea
  // existe solo si el monto no es cero — y un contrato viejo con `true` no
  // tiene monto (ver horaTardiaDe).
  const horaTardia = horaTardiaDe(c).monto;
  if (horaTardia) {
    lineas.push({ concepto: 'Hora tardía', detalle: '', monto: horaTardia });
  }

  if (q(c?.cartaPoderPrecio)) {
    lineas.push({ concepto: 'Carta poder', detalle: c?.cartaPoderDestino || '', monto: q(c.cartaPoderPrecio) });
  }
  if (q(c?.variosPrecio)) {
    lineas.push({ concepto: 'Varios', detalle: c?.variosDescripcion || '', monto: q(c.variosPrecio) });
  }
  return lineas;
}

/** Lo que se cobra al recibir el carro. El descuento va en negativo. */
export function lineasDevolucion(c) {
  if (!c?.cierre) return [];
  const atraso = atrasoDe(c);
  const precio = q(c?.precioDia);
  const lineas = [];

  if (atraso) {
    lineas.push({ concepto: 'Cobro días de atraso', detalle: `${atraso} × Q${textoDosDecimales(precio)}`, monto: q(atraso * precio) });
  }

  const porDia = suma(c?.seguroMenoresDia, c?.seguroPaiDia);
  const extraAtraso = q(porDia * atraso);
  if (extraAtraso) {
    lineas.push({ concepto: 'Seguros extra', detalle: `por ${atraso} día(s) de atraso`, monto: extraAtraso });
  }

  if (q(c.cierre.danos)) lineas.push({ concepto: 'Daños', detalle: c.cierre.danosDetalle || '', monto: q(c.cierre.danos) });
  if (q(c.cierre.combustible)) lineas.push({ concepto: 'Combustible', detalle: '', monto: q(c.cierre.combustible) });
  // CRÍTICO de la revisión final: "Varios" (la llave perdida, el lavado, la
  // silla de bebé no devuelta) se guardaba en el cierre pero nunca aparecía
  // aquí, así que nunca subía el saldo ni se cobraba — el mostrador tecleaba
  // el monto y la pantalla no se movía. Mismo patrón que Daños: el monto y su
  // detalle libre, tal cual, sin inventar nada.
  if (q(c.cierre.varios)) lineas.push({ concepto: 'Varios', detalle: c.cierre.variosDetalle || '', monto: q(c.cierre.varios) });
  if (q(c.cierre.descuento)) lineas.push({ concepto: 'Descuento', detalle: '', monto: q(-c.cierre.descuento) });

  return lineas;
}

const sumarLineas = (lineas) => suma(...lineas.map((l) => l.monto));

/** Todo el dinero del contrato en un solo vistazo. */
export function resumen(c) {
  const totalSalida = sumarLineas(lineasSalida(c));
  const totalDevolucion = sumarLineas(lineasDevolucion(c));
  const subtotal = suma(totalSalida, totalDevolucion);

  // Un pago anulado (Anular, en el detalle del contrato — datos.js:
  // anularPago) no se borra del arreglo, pero deja de contar: se marcó
  // `anulado` justo porque se registró mal, y "nunca ajustar una cifra para
  // que cuadre" corre en las dos direcciones — el número correcto es el que
  // resulta de ignorarlo, no uno pisado a mano después. Se filtra aquí, en
  // el único lugar que arma pagado/cubierto/saldo, para que estadoContrato()
  // (nucleo/estados.js) y guardarContrato() (datos.js) se corrijan solos en
  // cuanto se anula un pago, sin tener que enterarse cada uno por su cuenta.
  const pagos = (Array.isArray(c?.pagos) ? c.pagos : []).filter((p) => !p?.anulado);
  const pagado = suma(...pagos.map((p) => conTarjeta(p.monto, p.porcentajeTarjeta)));
  const cubierto = suma(...pagos.map((p) => q(p.monto)));

  // El saldo se muestra sin recargo mientras no se sepa cómo lo va a pagar; el
  // recargo se le suma en el momento de recibir el pago con tarjeta.
  //
  // Sin Math.max(0, ...): un saldo negativo es una sobrepago real (por
  // ejemplo, un descuento grande aplicado después de haber cobrado de más al
  // salir) y "nunca ajustar una cifra para que cuadre" (regla del dueño)
  // incluye no esconder ese número detrás de un 0 que diría "está a mano"
  // cuando en realidad el negocio le debe al cliente. Quien llama decide cómo
  // mostrarlo (flota.js, por ejemplo, ya filtra `saldo > 0` para "pendientes
  // de cobro", así que un sobrepago simplemente no aparece ahí — correcto,
  // eso no es un cobro pendiente) pero la cifra que sale de aquí es la
  // honesta, no una ya recortada.
  const saldo = q(subtotal - cubierto);

  const atraso = atrasoDe(c);
  const costoDia = q(c?.subarriendo?.costoDia);
  const costoSubarriendo = q(costoDia * (q(c?.dias) + atraso));

  return {
    diasAtraso: atraso,
    totalSalida,
    totalDevolucion,
    subtotal,
    pagado,
    saldo,
    totalCobrado: pagado,
    costoSubarriendo,
    utilidad: q(pagado - costoSubarriendo),
  };
}

/** Cuánto hay que cobrarle si paga ese saldo con tarjeta. */
export function saldoConTarjeta(c, porcentaje) {
  const { saldo } = resumen(c);
  return { saldo, recargo: recargoTarjeta(saldo, porcentaje), total: conTarjeta(saldo, porcentaje) };
}
