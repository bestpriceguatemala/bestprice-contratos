// El cierre: lo que se hace cuando el carro regresa.
//
// El propietario necesita saber qué salió mal antes de cerrar la devolución.
// Un kilometraje que retrocede, una fecha inventada, un descuento que no cuadra:
// todo eso se avisa en español, con los números adentro, para que entienda
// en el momento sin pensar.
//
// Nunca ajustar una cifra para que cuadre. Si el descuento es mayor que lo que
// hay que cobrar, se lo decimos tal como es.

import { q, textoDosDecimales, textoConQ } from './dinero.js';
import { diasEntre, textoFecha } from './fechas.js';
import { resumen } from './contrato.js';

/**
 * Arma el cierre del contrato preservando todo lo que ya traía.
 * Se usa spread genérico para no perder campos: si se enumeran a mano,
 * uno se cae (como pasó con variosDetalle). Los campos de dinero se
 * redondean después con q() para evitar errores de centavos.
 */
export function construirCierre(contrato, campos) {
  const cierreBase = { ...contrato.cierre, ...campos };

  // Redondear los campos de dinero a dos decimales
  const cierre = {
    ...cierreBase,
    kmEntrada: q(cierreBase.kmEntrada),
    combustible: q(cierreBase.combustible),
    danos: q(cierreBase.danos),
    varios: q(cierreBase.varios),
    descuento: q(cierreBase.descuento),
  };

  return { ...contrato, cierre };
}

/**
 * Lo que impide guardar el cierre.
 * Retorna una lista de mensajes de error en español, o vacía si todo está bien.
 * Los mensajes van en este orden:
 * 1. Falta la fecha real
 * 2. La fecha real es anterior a la de salida
 * 3. El kilometraje retrocede
 * 4. El descuento deja el cobro en negativo
 */
export function problemasDelCierre(contrato, cierre) {
  const problemas = [];

  // Falta la fecha real
  if (!cierre.fechaReal || cierre.fechaReal.trim() === '') {
    problemas.push('Falta la fecha en que se recibió el carro.');
    // Si no hay fecha real, no puedo validar el resto (evito comparaciones con undefined)
    return problemas;
  }

  // La fecha real es anterior a la de salida
  //
  // Revisión final: este mensaje mostraba las fechas crudas ('2026-08-19' en
  // vez de '19 ago 2026') y rotulaba la fecha que el mostrador acaba de
  // teclear como "Devolución" — que en el resto del sistema significa la
  // fecha PREVISTA (devolucionPrevista), un campo distinto. Aquí se corrige
  // a "Entrada", que es lo que de verdad se está intentando registrar.
  if (diasEntre(contrato.fechaSalida, cierre.fechaReal) < 0) {
    problemas.push(
      `No se puede recibir el carro antes de haberlo entregado. ` +
      `Salida: ${textoFecha(contrato.fechaSalida)}. Entrada: ${textoFecha(cierre.fechaReal)}.`,
    );
  }

  // El kilometraje retrocede (solo si se registró el de salida)
  const kmSalida = q(contrato.kmSalida);
  const kmEntrada = q(cierre.kmEntrada);
  if (kmSalida && kmEntrada < kmSalida) {
    const kmSalidaTexto = textoDosDecimales(kmSalida);
    const kmEntradaTexto = textoDosDecimales(kmEntrada);
    problemas.push(
      `El kilometraje de entrada (${kmEntradaTexto}) es menor que el de salida (${kmSalidaTexto}).`,
    );
  }

  // El descuento deja el subtotal en negativo
  // Construir un cierre temporal para poder calcular el subtotal
  const cierreTemp = construirCierre(contrato, cierre);
  const r = resumen(cierreTemp);
  if (r.subtotal < 0) {
    // textoConQ, no `Q${textoDosDecimales(...)}`: r.subtotal aquí siempre es
    // negativo, y textoDosDecimales de un negativo interpolado así dejaba
    // "(Q-95,819.00)" — el signo pegado adentro de la Q en vez de adelante.
    problemas.push(
      `El descuento de Q${textoDosDecimales(cierre.descuento)} es demasiado grande: ` +
      `dejaría el cobro en negativo (${textoConQ(r.subtotal)}).`,
    );
  }

  return problemas;
}
