// Los avisos que aparecen mientras se saca un carro.
//
// Son advertencias, no candados: el dueño decide. Puede rentarle a un conocido
// con la licencia recién vencida si así lo quiere. Lo que no puede es que nadie
// se lo haya dicho.
import { diasEntre, textoFecha } from './fechas.js';
import { resumen } from './contrato.js';
import { textoDosDecimales } from './dinero.js';
import { revisionDeDevoluciones, textoDeVecesTarde } from './historial.js';
// El aviso de mantenimiento (§12b) lo contesta mantenimiento.js, que es quien sabe si a un carro le toca servicio; aquí
// solo se pone junto a los demás. Ver el comentario donde se llama.
import { avisosDeMantenimiento } from './mantenimiento.js';
// seCruzan es la misma regla que antes vivía aquí duplicada como seEnciman:
// tocarse no es cruzarse (un carro que regresa el 20 puede volver a salir el
// 20, y eso pasa a diario), así que la comparación es estricta. Dos copias de
// la misma regla es como se arregla un error en un lado y se queda vivo en el
// otro — por eso esta pantalla usa la de reserva.js en vez de mantener la suya.
// Y hasta cuándo ocupa un contrato su carro tampoco se decide aquí: es
// `finDelContrato` (estados.js), vía `seCruzanConContrato` y `textoDeOcupacion`.
//
// Y lo mismo con la capacidad por tipo: si sacar este carro deja sin carro a una reservación que solo pidió el
// TIPO («una pickup»), eso lo contesta `reservasQueSeQuedanSinCarro` (reserva.js), la misma pregunta que el
// formulario de reservaciones le hace a un carro exacto. Aquí solo se dice con las palabras de este mostrador.
import {
  seCruzan, seCruzanConContrato, textoDeOcupacion, estadoReserva, reservasQueSeQuedanSinCarro,
} from './reserva.js';

const alto = (mensaje) => ({ nivel: 'alto', mensaje });
const medio = (mensaje) => ({ nivel: 'medio', mensaje });

// A cuántas reservaciones se nombran en el aviso de capacidad; las demás se cuentan. Igual que el aviso de las
// apartadas de este carro: una pared de nombres no es ayuda, es ruido.
const MAX_NOMBRADAS = 3;

/** «A, B y C» (o «A, B o C»); una sola, tal cual. */
function enLista(partes, conjuncion) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} ${conjuncion} ${partes[partes.length - 1]}`;
}

/**
 * La frase del aviso «sacar este carro deja sin carro a una reservación por tipo», a partir de lo que contestó
 * `reservasQueSeQuedanSinCarro` (reserva.js) — que es quien decide si pasa y a quién; aquí solo se escribe.
 *
 * Nombra a quién afecta y desde cuándo (la fecha en que esa reservación necesita su carro), en una oración. Si
 * se sabe con certeza quiénes se quedan sin carro, dice que ESAS se quedan sin carro. Si no (varias podrían ser
 * la que pierda, o ya había más reservaciones que carros), dice que ALGUNA de ellas — nunca señala a una persona
 * que quizás no es la afectada.
 */
function textoDeReservacionesSinCarro({ tipo, unidades, cabe, afectadas, seguro }) {
  if (cabe === null) {
    return `No se pudo comprobar si sacar este carro le deja sin carro a una reservación de ${tipo}: hay demasiadas reservaciones cruzadas. Revisa las de ese tipo.`;
  }
  const porque = unidades === 1
    ? `solo tienes 1 ${tipo}`
    : `tienes ${unidades} ${tipo} y los ${unidades} quedan comprometidos`;
  const quien = (r) => r.clienteNombre || 'un cliente sin nombre';
  const resto = afectadas.length - MAX_NOMBRADAS;
  const nombradas = (cadaUna) => {
    const partes = afectadas.slice(0, MAX_NOMBRADAS).map(cadaUna);
    return resto > 0 ? [...partes, `${resto} más`] : partes;
  };

  if (seguro && afectadas.length === 1) {
    const [r] = afectadas;
    return `Si sacas este carro, la reservación de ${tipo} de ${quien(r)} (desde el ${textoFecha(r.fechaSalida)}) se queda sin carro: ${porque}.`;
  }
  if (seguro) {
    const lista = enLista(nombradas((r) => `${quien(r)} (desde el ${textoFecha(r.fechaSalida)})`), 'y');
    return `Si sacas este carro, las reservaciones de ${tipo} de ${lista} se quedan sin carro: ${porque}.`;
  }
  const lista = enLista(nombradas((r) => `la de ${quien(r)} desde el ${textoFecha(r.fechaSalida)}`), 'o');
  return `Si sacas este carro, alguna de las reservaciones de ${tipo} sin carro elegido se queda sin carro (${lista}): ${porque}.`;
}

// El precio y los días NO se avisan: el dueño pone el precio que quiera en cada
// renta y el sistema no opina. Un aviso que él no quiere lo entrena a ignorar
// los que sí importan.
//
// `contratosDelCliente` son sus contratos ABIERTOS: de ahí sale lo que debe. Lo que devolvió tarde sale del
// ÚLTIMO AÑO de sus rentas, cerradas o no (`historialDelCliente`: `{ datos, fallo }` con lo de ESE cliente de
// la lectura de TODOS los contratos —lo arma `entradaDeAvisos`, sacarCarro.js—, o `null` mientras no llega), porque
// un cliente que devolvió tarde, pagó y cerró es el caso normal y los abiertos nunca lo ven (H-4).
//
// `reservasDelCarro` son las apartadas para ESTE carro exacto. Las que solo piden un tipo no tienen carro, así
// que no están ahí: para ellas hacen falta `flota`, TODAS las `reservas` y TODOS los `contratosAbiertos` (no
// solo los de este carro), y `reservaDeOrigenId`, la reservación que esta salida cumple, que no compite contra
// sí misma. Sin esas listas no se pregunta nada (nunca se inventa un aviso). `limiteDeBusqueda` es para las
// pruebas; ver `choquesDeReserva`.
export function avisosDeSalida({
  cliente, carro, contrato, contratosDelCliente = [], historialDelCliente = null, contratosDelCarro = [],
  reservasDelCarro = [], flota = [], reservas = [], contratosAbiertos = [], reservaDeOrigenId = null,
  limiteDeBusqueda, hoy,
}) {
  const avisos = [];

  // Un carro fuera de servicio (taller, golpe, revisión) no tiene botón «Sacar» en la flota, pero hay
  // otros caminos hasta esta pantalla: el «Sacar carro» de una reservación que apartó ese carro ANTES de
  // que entrara al taller (calendario y ficha de la reservación) o la dirección escrita a mano. Por
  // ahí se podía rentar el carro del taller sin que nada lo dijera (prueba del sistema, 7 oct 2026).
  // Es un aviso y no un candado: él decide, pero tiene que enterarse.
  if (carro?.fueraDeServicio) {
    const motivo = String(carro.motivoFueraDeServicio ?? '').trim();
    avisos.push(alto(`Este carro está fuera de servicio${motivo ? `: ${motivo}` : ''}.`));
  }

  if (cliente?.licenciaExpira && diasEntre(cliente.licenciaExpira, hoy) > 0) {
    avisos.push(alto(`La licencia del cliente venció el ${textoFecha(cliente.licenciaExpira)}.`));
  }
  if (cliente?.documentoExpira && diasEntre(cliente.documentoExpira, hoy) > 0) {
    avisos.push(alto(`El documento del cliente venció el ${textoFecha(cliente.documentoExpira)}.`));
  }

  // Solo cuenta lo que debe, no lo que se le debe: si en un contrato pagó de
  // más y en otro quedó debiendo, esas dos cosas no se cancelan entre sí. El
  // mostrador tiene que enterarse de la deuda, aunque el neto dé a favor.
  const deuda = contratosDelCliente.reduce((total, c) => total + Math.max(0, resumen(c).saldo), 0);
  if (deuda > 0) {
    avisos.push(alto(`Este cliente debe Q${textoDosDecimales(deuda)} de una renta anterior.`));
  }

  // Cuántas veces devolvió tarde en el último año — la regla vive en nucleo/historial.js y la comparte la
  // marca «Devolvió tarde» de Clientes. Un historial que NO se pudo leer nunca se calla: «cero veces» con la
  // lectura caída no es «nunca devolvió tarde» sino «no se sabe», y un récord limpio que no se ha ganado es
  // exactamente la falsa tranquilidad que estos avisos existen para evitar.
  const { veces, sinLeer } = revisionDeDevoluciones({ abiertos: contratosDelCliente, historial: historialDelCliente, hoy });
  if (veces > 0) {
    const incompleto = sinLeer ? ' (no se pudo leer todo su historial)' : '';
    avisos.push(medio(`Este cliente ya devolvió tarde ${textoDeVecesTarde(veces, { sinLeer })}${incompleto}.`));
  } else if (sinLeer) {
    avisos.push(medio('No se pudo revisar si este cliente ya devolvió tarde antes: su historial no cargó. Revisa tu conexión.'));
  }

  // El otro contrato ocupa el carro hasta su fin EFECTIVO, no hasta el previsto:
  // uno que ya se recibió (y sigue abierto solo porque queda un saldo) dejó el
  // carro libre el día que volvió. Comparar contra la fecha prevista le pintaba al
  // dueño un rojo falso sobre un carro que estaba en su patio — y un aviso que se
  // equivoca siempre enseña a ignorar los que no se equivocan.
  const encimado = contratosDelCarro.find((otro) =>
    otro.id !== contrato?.id && seCruzanConContrato(contrato, otro, hoy));
  if (encimado) {
    avisos.push(alto(`Este carro tiene otro contrato ${textoDeOcupacion(encimado, hoy)}.`));
  }

  // El carro que está por salir puede estar apartado para otro cliente
  // pasado mañana — eso es lo que hoy se pierde: nadie se lo dice al
  // mostrador y se entera por un cliente enojado. Una reservación cancelada
  // o ya entregada no cuenta (estadoReserva) — esa función deja que
  // contratoId mande sobre cancelada a propósito, para que una cancelación
  // tardía no borre un contrato que ya existe.
  const cruzadas = reservasDelCarro.filter((r) => estadoReserva(r) === 'pendiente' && seCruzan(contrato, r));
  if (cruzadas.length) {
    // Con varias reservaciones cruzadas no se apila una pared de rojo: se
    // avisa solo de la que sale primero (la que de verdad urge decidir) y,
    // si hay más, se dice cuántas — un renglón por cada una sería ruido, no
    // ayuda.
    let primera = cruzadas[0];
    cruzadas.forEach((r) => {
      if (diasEntre(primera.fechaSalida, r.fechaSalida) < 0) primera = r;
    });
    const extra = cruzadas.length - 1;
    // Igual que vez/veces más arriba: el plural de "reservación" no se arma
    // pegando una "s" o una "es" — la tilde se cae ("reservaciones"), así que
    // se escriben las dos formas completas en vez de concatenar un sufijo.
    const plural = extra === 1 ? 'reservación' : 'reservaciones';
    const demas = extra > 0 ? ` (y ${extra} ${plural} más)` : '';
    avisos.push(alto(`Este carro está apartado para ${primera.clienteNombre} desde el ${textoFecha(primera.fechaSalida)}${demas}.`));
  }

  // Lo que no se ve en el carro: una reservación que solo pidió el TIPO («una pickup») ya cuenta con uno de los
  // carros de ese tipo, y no está apartada para este. Sacar este puede dejarla sin ninguno; el mostrador se
  // entera cuando llega el cliente. Es la misma pregunta que se le hace a un carro exacto en el formulario de
  // reservaciones, y la contesta la misma regla (reserva.js): un carro de otro tipo, uno que ya vuelve antes,
  // uno del taller o un contrato ajeno no cuentan, y tocarse no es cruzarse.
  //
  // El contrato que se está escribiendo no se cuenta contra sí mismo si ya apareció entre los abiertos (un
  // guardado que se quedó esperando), igual que más arriba.
  if (carro?.id) {
    const efecto = reservasQueSeQuedanSinCarro({
      carroId: carro.id,
      rango: { desde: contrato?.fechaSalida, hasta: contrato?.devolucionPrevista },
      flota,
      reservas,
      contratos: contratosAbiertos.filter((otro) => otro.id !== contrato?.id),
      excepto: reservaDeOrigenId,
      hoy,
      nombrar: true,
      limiteDeBusqueda,
    });
    if (efecto && efecto.cabe !== true) avisos.push(alto(textoDeReservacionesSinCarro(efecto)));
  }

  // Si a este carro le toca servicio (aceite, frenos, llantas, batería, alineación, servicio general), o le va a tocar
  // pronto (§12b). De nivel medio: advertencia y no candado, él decide si lo renta igual. Lo contesta mantenimiento.js y
  // solo avisa de lo que SABE: un carro sin servicios anotados no dice nada, y sin kilometraje solo se mide el tiempo.
  //
  // El kilometraje de AHORA es el que el mostrador escribe como kilometraje de salida: el odómetro de este momento, que
  // es mejor dato que cualquier contrato anterior (y los contratos CERRADOS de este carro, de donde sale su kilometraje en
  // la ficha, no los trae esta pantalla: solo lee los abiertos). Vacío es 0 (`construirContrato` guarda `q(kmSalida)`) y
  // 0 es «no se anotó», no un odómetro en cero: mantenimiento.js lo lee así. Un número a medio escribir («1500» camino a
  // «15000») es más chico que el final, así que puede callar un aviso por un instante pero no inventar uno.
  // Un carro ajeno llega aquí como `null` (`entradaDeAvisos`): no lleva mantenimiento, no es de él.
  avisos.push(...avisosDeMantenimiento({ carro, kilometraje: { km: contrato?.kmSalida }, hoy }));

  return [...avisos.filter((a) => a.nivel === 'alto'), ...avisos.filter((a) => a.nivel === 'medio')];
}
