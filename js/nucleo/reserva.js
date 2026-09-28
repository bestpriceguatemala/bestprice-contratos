// El núcleo de una reservación.
//
// Una reservación aparta un carro antes de que salga: apunta a un cliente y a
// unas fechas, y opcionalmente a un carro exacto ("el Montero blanco") o solo
// a un tipo ("un microbús"), cuando el cliente todavía no eligió unidad. Los
// planes cambian a última hora — "me gustaría poder cambiar la unidad en dado
// caso cambie el plan" — así que cambiar de carro tiene que ser un campo más
// que se sobrescribe, nunca una reservación nueva.
import { devolucionPrevista as calcularDevolucionPrevista, diasEntre } from './fechas.js';
import { q, textoDosDecimales } from './dinero.js';

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
