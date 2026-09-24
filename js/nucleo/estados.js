// En qué anda cada contrato y cada carro.
//
// El carro y el contrato llevan caminos separados a propósito. El carro se
// libera al regresar; el contrato sigue abierto hasta que el cliente pague lo
// que falte y se le suelte la garantía de la tarjeta. Si se amarraran, un
// cliente que no paga unos daños dejaría el carro parado sin necesidad.
import { resumen } from './contrato.js';
import { diasAtraso, hoyISO } from './fechas.js';

/** Lo que falta para poder cerrar: saldo por cobrar y garantía por liberar. */
export function pendientesDe(c) {
  return {
    saldo: resumen(c).saldo,
    garantia: !c?.garantiaLiberada,
  };
}

/** Un contrato se cierra cuando no debe nada y la garantía ya se liberó. */
export function puedeCerrar(c) {
  const { saldo, garantia } = pendientesDe(c);
  return saldo === 0 && !garantia;
}

/** 'rentado' mientras el carro anda fuera, 'devuelto' hasta cerrarlo, 'cerrado' al final. */
export function estadoContrato(c) {
  if (!c?.cierre?.fechaReal) return 'rentado';
  return puedeCerrar(c) ? 'cerrado' : 'devuelto';
}

/**
 * El estado del carro para la pantalla principal.
 *
 * `contratos` son los de ese carro; se busca el que todavía no ha regresado.
 */
export function estadoCarro(carro, contratos = [], hoy = hoyISO()) {
  const fueraDeServicio = Boolean(carro?.fueraDeServicio);
  const motivo = carro?.motivoFueraDeServicio || '';
  const afuera = contratos.find((c) => c?.carroId === carro?.id && !c?.cierre?.fechaReal);

  // Sin contrato abierto, el carro está aquí: o disponible, o parado por algo.
  if (!afuera) {
    return {
      estado: fueraDeServicio ? 'fuera de servicio' : 'disponible',
      contrato: null, diasAtraso: 0, fueraDeServicio, motivo,
    };
  }

  // Con contrato abierto, el carro lo tiene un cliente. Eso es lo que manda en
  // el mostrador: hay que saber quién lo tiene y si viene tarde. Que además
  // esté marcado fuera de servicio se muestra como etiqueta, no borra al cliente.
  const atraso = diasAtraso(afuera.devolucionPrevista, hoy);
  return {
    estado: atraso > 0 ? 'atrasado' : 'rentado',
    contrato: afuera, diasAtraso: atraso, fueraDeServicio, motivo,
  };
}
