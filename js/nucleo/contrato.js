// El cobro de un contrato, de principio a fin.
//
// El cobro sucede en dos momentos, como en el mostrador: al salir el carro se
// cobra todo lo que ya se sabe (renta, seguros por día de los días contratados,
// deducible bajo, carta poder, varios) y al recibirlo solo lo que apareció
// después (atraso, seguros por día de esos días, daños, combustible, hora
// tardía, varios, descuento).
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
 * Lo que dice un contrato de la hora tardía: `{ alSalir, alRecibir, sinMonto }`.
 * ÚNICO lugar que mira esos campos — el cobro (`lineasSalida`,
 * `lineasDevolucion`), el cierre (`construirCierre`), la pantalla de recibir y el
 * detalle del contrato preguntan aquí y ninguno vuelve a leerlos por su cuenta.
 *
 * La hora tardía se cobra AL RECIBIR el carro: el dueño lo dijo así («solo al
 * devolver», cuando se le preguntó directamente) y es un monto en quetzales que
 * vive en `cierre.horaTardia`, igual que `varios` o `combustible`. Pero el campo
 * ha tenido tres formas guardadas, y las tres siguen existiendo en la nube:
 *
 *   `cierre.horaTardia` (número) -> la de hoy. `alRecibir`, y entra al total de
 *      la devolución.
 *   `horaTardia` (número) -> la de unas pocas horas, cuando se escribía al salir
 *      y se cobraba dentro del total de la salida. `alSalir`. Esos contratos ya
 *      se guardaron y se cobraron con ese total, así que se siguen leyendo donde
 *      se guardaron: cambiarlos de lugar les movería el total sin que nadie lo
 *      tocara. Ningún contrato nuevo lo escribe.
 *   `horaTardia: true` -> la original, una casilla de sí/no que nada leía. Quiere
 *      decir «hubo una hora tardía y nadie anotó cuánto»: la cifra NO se sabe,
 *      así que no es ni `alSalir` ni `alRecibir` (valen 0) y `sinMonto` deja
 *      decir la verdad en el detalle. Nunca se le inventa una cifra.
 *
 * La trampa es el `true`: con `q()` a secas vale 1, y cada contrato viejo ganaba
 * Q1.00 en silencio, moviendo el saldo de uno que ya se cobró y se cerró. Por
 * eso un booleano nunca pasa por `q()` aquí. Si el mostrador anota después un
 * monto al recibir (`alRecibir`), el `true` ya no está «sin monto» y el detalle
 * deja de decirlo.
 *
 *   false, ausente o cualquier otra cosa -> nada.
 */
export function horaTardiaDe(c) {
  const alSalir = c?.horaTardia;
  const alRecibir = c?.cierre?.horaTardia;
  const montoDe = (v) => (typeof v === 'boolean' ? 0 : q(v));
  const recibido = montoDe(alRecibir);
  return {
    alSalir: montoDe(alSalir),
    alRecibir: recibido,
    sinMonto: alSalir === true && !recibido,
  };
}

/** Lo que se cobra al salir el carro. */
export function lineasSalida(c) {
  const dias = q(c?.dias);
  const precio = q(c?.precioDia);
  const lineas = [];

  if (dias && precio) {
    lineas.push({ concepto: 'Renta', detalle: `${dias} ${dias === 1 ? 'día' : 'días'} × Q${textoDosDecimales(precio)}`, monto: q(dias * precio) });
  }

  const porDia = suma(c?.seguroMenoresDia, c?.seguroPaiDia);
  const extra = suma(porDia * dias, c?.deducibleBajo);
  if (extra) {
    lineas.push({ concepto: 'Seguros extra', detalle: 'menores, PAI, deducible bajo', monto: extra });
  }

  // La hora tardía ya NO se cobra al salir: se cobra al recibir el carro
  // (lineasDevolucion), porque así lo cobra el dueño. Esta línea existe solo
  // para los contratos guardados cuando se escribía al salir (`horaTardia`
  // como número, ver horaTardiaDe): ya se cobraron con ese total y siguen
  // mostrándolo. Un contrato nuevo no la trae, y uno viejo con `true` tampoco
  // (no tiene monto).
  const horaTardiaAlSalir = horaTardiaDe(c).alSalir;
  if (horaTardiaAlSalir) {
    lineas.push({ concepto: 'Hora tardía', detalle: '', monto: horaTardiaAlSalir });
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
    lineas.push({ concepto: 'Seguros extra', detalle: `por ${atraso} ${atraso === 1 ? 'día' : 'días'} de atraso`, monto: extraAtraso });
  }

  if (q(c.cierre.danos)) lineas.push({ concepto: 'Daños', detalle: c.cierre.danosDetalle || '', monto: q(c.cierre.danos) });
  if (q(c.cierre.combustible)) lineas.push({ concepto: 'Combustible', detalle: '', monto: q(c.cierre.combustible) });
  // La hora tardía se decide al recibir el carro (el dueño la cobra «solo al
  // devolver»), así que va con los demás cobros del cierre y, como ellos, entra
  // al total de la devolución. Se lee con horaTardiaDe y no directo de
  // `cierre.horaTardia`: ese lector es el único que sabe que un booleano no es
  // un monto. Igual que la carta poder, la línea existe solo si el monto no es
  // cero. No entra a la comisión (comision.js no la lee).
  const horaTardia = horaTardiaDe(c).alRecibir;
  if (horaTardia) lineas.push({ concepto: 'Hora tardía', detalle: '', monto: horaTardia });
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
