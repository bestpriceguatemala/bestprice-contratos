// Los avisos que aparecen mientras se saca un carro.
//
// Son advertencias, no candados: el dueño decide. Puede rentarle a un conocido
// con la licencia recién vencida si así lo quiere. Lo que no puede es que nadie
// se lo haya dicho.
import { diasEntre, textoFecha } from './fechas.js';
import { resumen } from './contrato.js';
import { textoDosDecimales } from './dinero.js';
import { revisionDeDevoluciones, textoDeVecesTarde } from './historial.js';
// seCruzan es la misma regla que antes vivía aquí duplicada como seEnciman:
// tocarse no es cruzarse (un carro que regresa el 20 puede volver a salir el
// 20, y eso pasa a diario), así que la comparación es estricta. Dos copias de
// la misma regla es como se arregla un error en un lado y se queda vivo en el
// otro — por eso esta pantalla usa la de reserva.js en vez de mantener la suya.
// Y hasta cuándo ocupa un contrato su carro tampoco se decide aquí: es
// `finDelContrato` (estados.js), vía `seCruzanConContrato` y `textoDeOcupacion`.
import {
  seCruzan, seCruzanConContrato, textoDeOcupacion, estadoReserva,
} from './reserva.js';

const alto = (mensaje) => ({ nivel: 'alto', mensaje });
const medio = (mensaje) => ({ nivel: 'medio', mensaje });

// El precio y los días NO se avisan: el dueño pone el precio que quiera en cada
// renta y el sistema no opina. Un aviso que él no quiere lo entrena a ignorar
// los que sí importan.
//
// `contratosDelCliente` son sus contratos ABIERTOS: de ahí sale lo que debe. Lo que devolvió tarde sale del
// ÚLTIMO AÑO de sus rentas, cerradas o no (`historialDelCliente`: `{ datos, fallo }` de
// `cargarContratosDelCliente`, o `null` mientras no llega), porque un cliente que devolvió tarde, pagó y
// cerró es el caso normal y los abiertos nunca lo ven (H-4).
export function avisosDeSalida({
  cliente, carro, contrato, contratosDelCliente = [], historialDelCliente = null, contratosDelCarro = [],
  reservasDelCarro = [], hoy,
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

  return [...avisos.filter((a) => a.nivel === 'alto'), ...avisos.filter((a) => a.nivel === 'medio')];
}
