// El núcleo de una reservación.
//
// Una reservación aparta un carro antes de que salga: apunta a un cliente y a
// unas fechas, y opcionalmente a un carro exacto ("el Montero blanco") o solo
// a un tipo ("un microbús"), cuando el cliente todavía no eligió unidad. Los
// planes cambian a última hora — "me gustaría poder cambiar la unidad en dado
// caso cambie el plan" — así que cambiar de carro tiene que ser un campo más
// que se sobrescribe, nunca una reservación nueva.
import { devolucionPrevista as calcularDevolucionPrevista, diasEntre, textoFecha } from './fechas.js';
import { q, textoDosDecimales } from './dinero.js';
import { estadoContrato } from './estados.js';

/**
 * Construye el objeto reservación para guardar, preservando campos que no
 * vienen del formulario (mismo patrón que construirCliente en cliente.js):
 * la copia local se reemplaza entera, así que lo que no se arrastra aquí
 * desaparece aunque siga en la nube. Cambiar de unidad, por ejemplo, solo
 * manda { carroId, carroPlacas } — todo lo demás de la reservación tiene que
 * sobrevivir ese merge.
 */
export function construirReserva(existente, campos) {
  const merged = { ...existente, ...campos };

  // Recortar espacios de todos los campos de texto, igual que construirCliente.
  Object.keys(merged).forEach((key) => {
    if (typeof merged[key] === 'string') {
      merged[key] = merged[key].trim();
    }
  });

  merged.dias = Number(merged.dias) || 0;
  merged.precioDia = q(merged.precioDia);
  merged.anticipo = q(merged.anticipo);
  merged.devolucionPrevista = calcularDevolucionPrevista(merged.fechaSalida, merged.dias);

  return merged;
}

/**
 * El estado de una reservación: 'pendiente' mientras espera, 'entregada' en
 * cuanto un contrato la cumple, 'cancelada' si se dio de baja sin cumplirse.
 * Una vez entregada se queda entregada: si alguien la marca cancelada después
 * (una cancelación tardía, un clic equivocado) el contrato ya existe y la
 * reservación ya cumplió su propósito, así que contratoId manda sobre
 * cancelada.
 */
export function estadoReserva(r) {
  if (r?.contratoId) return 'entregada';
  if (r?.cancelada) return 'cancelada';
  return 'pendiente';
}

/**
 * ¿Se cruzan dos rangos de fechas {fechaSalida, devolucionPrevista}?
 *
 * La misma regla que seEnciman en avisos.js: tocarse no es cruzarse, porque
 * un carro que regresa el 20 puede volver a salir el 20, y eso pasa a diario.
 * Solo hay cruce cuando los rangos de verdad se traslapan, por eso se usa
 * diasEntre() > 0 (estricto) y no una comparación de "o igual".
 */
export function seCruzan(a, b) {
  if (!a?.fechaSalida || !a?.devolucionPrevista || !b?.fechaSalida || !b?.devolucionPrevista) return false;
  return diasEntre(a.fechaSalida, b.devolucionPrevista) > 0 && diasEntre(b.fechaSalida, a.devolucionPrevista) > 0;
}

/**
 * Etiquetas de lo que falta para poder guardar una reservación. Lo mínimo
 * para apartar algo: quién la pide y para cuándo.
 */
export function faltaAlgoEnReserva(r) {
  const falta = [];

  const clienteNombre = (r?.clienteNombre || '').trim();
  if (!clienteNombre) falta.push('Cliente');

  const fechaSalida = (r?.fechaSalida || '').trim();
  if (!fechaSalida) falta.push('Fecha de salida');

  if (!r?.dias) falta.push('Días');

  return falta;
}

/** El anticipo en una línea, para la lista y la ficha de la reservación. */
export function textoAnticipo(r) {
  const anticipo = q(r?.anticipo);
  if (anticipo <= 0) return 'Sin anticipo';
  return `Anticipo Q${textoDosDecimales(anticipo)} ${r?.anticipoPagado ? 'pagado' : 'pendiente'}`;
}

const alto = (mensaje) => ({ nivel: 'alto', mensaje });

/**
 * El tipo que una reservación o un contrato ya comprometen, para poder
 * restarlo de la capacidad de ese tipo. Si trae carro exacto asignado
 * (carroId), su tipo cuenta aunque nadie haya pedido "un microbús" — un carro
 * apartado por placa deja de estar libre para cualquier otro cliente que pida
 * ese tipo, se haya pedido por nombre o no.
 */
function tipoComprometido(item, flota) {
  if (item?.tipoVehiculo) return item.tipoVehiculo;
  return flota.find((c) => c.id === item?.carroId)?.tipo;
}

/**
 * Los choques de una reservación contra lo que ya está comprometido: otras
 * reservaciones y contratos vivos.
 *
 * Dos casos, porque son preguntas distintas:
 * - Carro exacto ("el Montero blanco"): choca contra ESE carro, si otra
 *   reservación o un contrato lo tienen encima de esas fechas.
 * - Por tipo ("un microbús"): no hay un carro contra el cual comparar. Lo que
 *   importa es la capacidad — cuántos carros de ese tipo hay (sin contar los
 *   del taller) contra cuántos ya están comprometidos esos días.
 *
 * Solo cuentan los compromisos vivos: una reservación cancelada o ya
 * entregada no aparta nada (estadoReserva), y un contrato cerrado tampoco
 * (estadoContrato) — el carro ya volvió y ya se saldó. Se compara por id para
 * que editar una reservación no choque contra sí misma.
 */
export function choquesDeReserva({ reserva, flota = [], reservas = [], contratos = [] }) {
  if (!reserva) return [];

  const reservasVivas = reservas.filter((r) =>
    r?.id !== reserva.id && estadoReserva(r) === 'pendiente' && seCruzan(reserva, r));
  const contratosVivos = contratos.filter((c) =>
    estadoContrato(c) !== 'cerrado' && seCruzan(reserva, c));

  if (reserva.carroId) {
    const otraReserva = reservasVivas.find((r) => r.carroId === reserva.carroId);
    if (otraReserva) {
      return [alto(`Este carro ya está apartado del ${textoFecha(otraReserva.fechaSalida)} al ${textoFecha(otraReserva.devolucionPrevista)}.`)];
    }
    const otroContrato = contratosVivos.find((c) => c.carroId === reserva.carroId);
    if (otroContrato) {
      return [alto(`Este carro tiene un contrato del ${textoFecha(otroContrato.fechaSalida)} al ${textoFecha(otroContrato.devolucionPrevista)}.`)];
    }
    return [];
  }

  const tipo = reserva.tipoVehiculo;
  if (!tipo) return [];

  const capacidad = flota.filter((c) => c.tipo === tipo && !c?.fueraDeServicio).length;

  // Cero es un problema distinto al de "ya no queda": no es que se hayan
  // acabado, es que nunca hubo. Avisar "0 comprometidos de 0" confunde al
  // dueño sobre cuál es el problema de verdad.
  if (capacidad === 0) {
    return [alto(`No tienes ninguna unidad ${tipo} en la flota.`)];
  }

  const comprometidos =
    reservasVivas.filter((r) => tipoComprometido(r, flota) === tipo).length +
    contratosVivos.filter((c) => tipoComprometido(c, flota) === tipo).length;

  if (comprometidos >= capacidad) {
    // Concordancia en singular/plural, igual que hace avisosDeSalida con
    // "vez"/"veces" — con un solo carro del tipo, "los 1 ya están
    // comprometidos" suena a error de dedo, no a un aviso serio.
    if (capacidad === 1) {
      return [alto(`Solo tienes 1 ${tipo} y ya está comprometido en esas fechas.`)];
    }
    return [alto(`Tienes ${capacidad} ${tipo} y los ${comprometidos} ya están comprometidos en esas fechas.`)];
  }
  return [];
}
