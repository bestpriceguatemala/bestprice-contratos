// El historial del último año de un cliente: cuántas veces devolvió tarde.
//
// Es la ÚNICA regla de esto. «Este cliente ya devolvió tarde» (avisos de «Sacar carro») y la marca
// «Devolvió tarde» (lista y ficha de Clientes) preguntan aquí, y ninguna cuenta por su cuenta: eran dos
// copias del mismo filtro, las dos mirando solo los contratos ABIERTOS, así que un cliente que devolvió
// tarde, pagó y cerró (el caso normal) quedaba limpio (H-4, prueba del sistema, 7 oct 2026).
//
// El dueño decidió cuánto mirar: el ÚLTIMO AÑO de rentas de ese cliente. No todo su historial —cada vez
// que elige un cliente en la pantalla que más abre sería una lectura de nube más grande, y él dijo que no
// quiere un programa lento—, y una devolución tarde de hace tres años no informa la decisión de hoy.
import { diasEntre, sumarDias } from './fechas.js';
import { resumen } from './contrato.js';

/** El tamaño de la ventana, en días. Lo único que hay que cambiar si el dueño la quiere más corta o más larga. */
export const DIAS_DEL_HISTORIAL = 365;

/**
 * Desde qué día cuenta el historial, dado `hoy` (que se recibe: la regla no lee el reloj, y Guatemala va seis
 * horas atrás de UTC). El primer día de la ventana todavía cuenta. Es lo que las lecturas de datos.js piden a
 * la nube y lo que esta regla vuelve a aplicar, para que la ventana se decida en un solo lugar.
 */
export function desdeDelHistorial(hoy) {
  return sumarDias(hoy, -DIAS_DEL_HISTORIAL);
}

/**
 * ¿Cae este contrato en la ventana? Se mide por el día que SALIÓ (`fechaSalida`), que es lo que la nube
 * puede filtrar. Uno sin fecha de salida no se puede descartar por viejo —no se sabe cuándo fue—, así que
 * entra: es una devolución tarde que existió. Sin `hoy` tampoco hay ventana.
 */
function enLaVentana(contrato, hoy) {
  if (!contrato?.fechaSalida || !hoy) return true;
  return diasEntre(desdeDelHistorial(hoy), contrato.fechaSalida) >= 0;
}

/**
 * Las listas juntas, sin repetir un mismo contrato. Un contrato abierto sale en las dos lecturas (los
 * abiertos y el último año) y contarlo dos veces sería inventar una devolución tarde. Sin `id` no se puede
 * saber si es el mismo, así que ninguno se descarta.
 */
export function sinRepetir(...listas) {
  const vistos = new Set();
  const juntos = [];
  for (const contrato of listas.flat()) {
    if (contrato?.id !== undefined && contrato?.id !== null) {
      if (vistos.has(contrato.id)) continue;
      vistos.add(contrato.id);
    }
    juntos.push(contrato);
  }
  return juntos;
}

/**
 * Cuántas de estas rentas volvieron tarde dentro de la ventana. «Volvió tarde» es `diasAtraso > 0` de
 * `resumen()`, que solo existe con el carro de vuelta (`cierre.fechaReal`): una renta que sigue afuera
 * pasada su fecha no «devolvió tarde» todavía. El estado del contrato no importa —cerrado o abierto—, que
 * era justo el hueco.
 */
export function devolucionesTardias(contratos, hoy) {
  return (contratos || []).filter((c) => enLaVentana(c, hoy) && resumen(c).diasAtraso > 0).length;
}

/**
 * Lo que se sabe de las devoluciones tardías de UN cliente: `{ veces, sinLeer }`.
 *
 * - `abiertos`: sus contratos abiertos, que la pantalla ya tiene. Son un piso: si la lectura del historial
 *   falla, lo que ya se sabe de ahí sigue contando.
 * - `historial`: `{ datos, fallo }` de la lectura del último año (`cargarContratosDelCliente`), o `null` si
 *   todavía no se pidió o no hay cliente.
 *
 * `sinLeer` es la bandera que no puede perderse: con la lectura caída, «0 veces» NO quiere decir «nunca
 * devolvió tarde» sino «no se sabe», y mostrarlo como un récord limpio es una tranquilidad que el cliente no
 * se ha ganado. Quien muestra el resultado tiene que decirlo (textoDeVecesTarde, o una frase de «no se pudo
 * revisar»).
 */
export function revisionDeDevoluciones({ abiertos = [], historial = null, hoy }) {
  const contratos = sinRepetir(abiertos, historial?.datos ?? []);
  return { veces: devolucionesTardias(contratos, hoy), sinLeer: Boolean(historial?.fallo) };
}

/**
 * La cuenta tal como se le dice al mostrador: «1 vez en el último año». Siempre dice el año: la cifra es
 * del último año, no de toda la vida del cliente, y callarlo se leería como un historial completo. Con la
 * lectura incompleta (`sinLeer`) es «al menos»: lo que se encontró es un piso, no la cuenta.
 */
export function textoDeVecesTarde(veces, { sinLeer = false } = {}) {
  return `${sinLeer ? 'al menos ' : ''}${veces} ${veces === 1 ? 'vez' : 'veces'} en el último año`;
}
