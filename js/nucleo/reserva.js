// El núcleo de una reservación.
//
// Una reservación aparta un carro antes de que salga: apunta a un cliente y a
// unas fechas, y opcionalmente a un carro exacto ("el Montero blanco") o solo
// a un tipo ("un microbús"), cuando el cliente todavía no eligió unidad. Los
// planes cambian a última hora — "me gustaría poder cambiar la unidad en dado
// caso cambie el plan" — así que cambiar de carro tiene que ser un campo más
// que se sobrescribe, nunca una reservación nueva.
import {
  devolucionPrevista as calcularDevolucionPrevista, diasEntre, textoFecha, esFechaISO,
} from './fechas.js';
import { q, textoDosDecimales } from './dinero.js';
import { estadoContrato, estaAtrasado, finDelContrato } from './estados.js';

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
 * La regla de cruce, para cuatro fechas sueltas. Es la ÚNICA copia: tocarse no es
 * cruzarse, porque un carro que regresa el 20 puede volver a salir el 20, y eso
 * pasa a diario. Solo hay cruce cuando los rangos de verdad se traslapan, por eso
 * se usa diasEntre() > 0 (estricto) y no una comparación de "o igual". Con
 * cualquier fecha ausente no hay rango, y no hay cruce.
 */
function seTraslapan(desdeA, hastaA, desdeB, hastaB) {
  if (!desdeA || !hastaA || !desdeB || !hastaB) return false;
  return diasEntre(desdeA, hastaB) > 0 && diasEntre(desdeB, hastaA) > 0;
}

/**
 * ¿Se cruzan dos rangos PREVISTOS {fechaSalida, devolucionPrevista}? Para dos
 * reservaciones, o para una reservación o un contrato que todavía se está
 * escribiendo contra otra reservación: ahí la fecha prevista es el rango que se
 * apartó y no hay otro.
 *
 * NO es para un contrato que ya se hizo: ese ocupa el carro hasta su fin
 * efectivo, que no siempre es el previsto (el carro puede haber vuelto antes, o
 * seguir afuera pasada la fecha). Para eso, `seCruzanConContrato`.
 */
export function seCruzan(a, b) {
  return seTraslapan(a?.fechaSalida, a?.devolucionPrevista, b?.fechaSalida, b?.devolucionPrevista);
}

/**
 * ¿Lo que se quiere apartar (`aparte`: una reservación o el contrato que se está
 * escribiendo, con su rango previsto) se cruza con lo que un CONTRATO ya hecho
 * ocupa de verdad? El contrato ocupa del día que salió hasta su fin efectivo
 * (`finDelContrato`, nucleo/estados.js), con el mismo cruce estricto de siempre.
 * `hoy` se recibe: sin él un contrato afuera se mide por su fecha prevista.
 */
export function seCruzanConContrato(aparte, contrato, hoy) {
  return seTraslapan(aparte?.fechaSalida, aparte?.devolucionPrevista, contrato?.fechaSalida, finDelContrato(contrato, hoy));
}

/**
 * Cuándo ocupa un contrato su carro, tal como se le dice al mostrador:
 * «del 3 oct 2026 al 6 oct 2026» (el día que de verdad volvió, o el previsto si
 * sigue afuera), o — si ya pasó su fecha prevista y no ha vuelto — «del 3 oct 2026,
 * que debía volver el 8 oct 2026 y sigue afuera». Ese caso no dice «al <fin>»:
 * el fin efectivo de un carro atrasado es solo «mañana, como pronto», no una
 * fecha de regreso, y escribirlo así la haría pasar por una.
 *
 * Los dos avisos que hablan de un contrato (el de salida y el de una
 * reservación) usan este texto, así que nunca pueden dar fechas distintas.
 */
export function textoDeOcupacion(contrato, hoy) {
  const desde = textoFecha(contrato?.fechaSalida);
  if (estaAtrasado(contrato, hoy)) {
    return `del ${desde}, que debía volver el ${textoFecha(contrato.devolucionPrevista)} y sigue afuera`;
  }
  return `del ${desde} al ${textoFecha(finDelContrato(contrato, hoy))}`;
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
  // El campo de fecha deja teclear el año con cinco dígitos: «20261-10-15» no es una
  // fecha, y una reservación con ella queda fuera del calendario y de los choques.
  else if (!esFechaISO(fechaSalida)) falta.push('Fecha de salida (el año no es válido)');

  if (!r?.dias) falta.push('Días');

  return falta;
}

// Lo que «Sacar carro» lee de la reservación GUARDADA (sacarCarro.js:aplicarReserva y
// conAnticipoComoPago): la fecha, los días, el precio, el cliente y, sobre todo, el
// anticipo — de ahí salen el descuento del monto a cobrar y un pago de verdad. El carro
// no está aquí a propósito: «Sacar el carro» toma el que está elegido en la ficha AHORA.
// El orden es el de la ficha.
const CAMPOS_QUE_LLEGAN_A_SACAR = [
  ['fechaSalida', 'fecha de salida'],
  ['dias', 'días'],
  ['precioDia', 'precio por día'],
  ['anticipo', 'anticipo'],
  ['anticipoPagado', 'si el anticipo ya se pagó'],
  ['clienteId', 'cliente'],
  ['clienteNombre', 'nombre del cliente'],
];

/** El valor de un campo comparable: lo mismo que el formulario devuelve como texto y lo que se guardó como número. */
function valorParaComparar(reserva, campo) {
  const v = reserva?.[campo];
  if (campo === 'dias' || campo === 'precioDia' || campo === 'anticipo') return q(v);
  if (campo === 'anticipoPagado') return Boolean(v);
  if (campo === 'clienteId') return v ?? null;
  return String(v ?? '').trim();
}

/**
 * Qué cambió en la ficha de una reservación (`borrador`, lo que el formulario dice
 * ahora) contra lo que está guardado (`guardada`) en los campos que «Sacar carro»
 * lee. Vacío si nada. Función pura.
 *
 * Por qué existe: «Sacar el carro» está en la misma ficha que «Guardar reservación» y
 * navega con solo el id de la reservación — la salida lee lo GUARDADO. En la prueba del
 * sistema el dueño desmarcó «Ya pagó el anticipo» (de Q400) y apretó «Sacar el carro»
 * sin guardar: la salida abrió con «anticipo ya pagado», descontado del monto, y al
 * guardar el contrato habría registrado un pago de Q400 que nadie hizo. Cuando hay
 * cambios sin guardar, la pantalla se niega y lo dice, en vez de usar en silencio una
 * cifra distinta de la que está viendo.
 */
export function cambiosSinGuardar(guardada, borrador) {
  return CAMPOS_QUE_LLEGAN_A_SACAR
    .filter(([campo]) => valorParaComparar(guardada, campo) !== valorParaComparar(borrador, campo))
    .map(([, etiqueta]) => etiqueta);
}

/** La frase que lee el dueño cuando hay cambios sin guardar (vacía si no hay). */
export function textoCambiosSinGuardar(cambios) {
  if (!cambios?.length) return '';
  return `Hay cambios sin guardar en la reservación: ${cambios.join(', ')}. `
    + 'Guárdalos antes de sacar el carro: la salida usa lo que está guardado, no lo que ves ahora.';
}

/** El anticipo en una línea, para la lista y la ficha de la reservación. */
export function textoAnticipo(r) {
  const anticipo = q(r?.anticipo);
  if (anticipo <= 0) return 'Sin anticipo';
  // "pagado"/"pendiente" a secas no decía QUIÉN debe hacer qué, y el dueño lo
  // preguntó con estas palabras: "¿es el anticipo que le pedí y aún falta que
  // yo lo cobre?". Las dos frases de abajo contestan eso sin que tenga que
  // adivinar: una dice que el dinero ya entró (y por eso se le descuenta al
  // sacar el carro), la otra que todavía no (y por eso sigue incluido en lo
  // que va a cobrar).
  return r?.anticipoPagado
    ? `Anticipo Q${textoDosDecimales(anticipo)} — ya me lo pagó`
    : `Anticipo Q${textoDosDecimales(anticipo)} — falta que me lo pague`;
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
 *
 * Un contrato abierto ocupa el carro hasta su fin EFECTIVO (`finDelContrato`):
 * uno que ya se recibió (aunque siga abierto cobrando un saldo) lo ocupa solo
 * hasta el día que volvió, y uno que sigue afuera pasada su fecha prevista, por
 * lo menos durante hoy (queda libre desde mañana, como pronto). Por eso `hoy` se recibe, igual que en los avisos de
 * salida; sin él, un contrato afuera se mide por su fecha prevista.
 */
export function choquesDeReserva({
  reserva, flota = [], reservas = [], contratos = [], hoy,
}) {
  if (!reserva) return [];

  const reservasVivas = reservas.filter((r) =>
    r?.id !== reserva.id && estadoReserva(r) === 'pendiente' && seCruzan(reserva, r));
  const contratosVivos = contratos.filter((c) =>
    estadoContrato(c) !== 'cerrado' && seCruzanConContrato(reserva, c, hoy));

  if (reserva.carroId) {
    const otraReserva = reservasVivas.find((r) => r.carroId === reserva.carroId);
    if (otraReserva) {
      return [alto(`Este carro ya está apartado del ${textoFecha(otraReserva.fechaSalida)} al ${textoFecha(otraReserva.devolucionPrevista)}.`)];
    }
    const otroContrato = contratosVivos.find((c) => c.carroId === reserva.carroId);
    if (otroContrato) {
      return [alto(`Este carro tiene un contrato ${textoDeOcupacion(otroContrato, hoy)}.`)];
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
