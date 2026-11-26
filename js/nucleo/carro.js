// El documento del carro de la flota propia (`vehiculos/{id}`, §7b «Del carro»): de QUIÉN es cada llave.
//
// Un carro lo escriben varias manos, y cada mano escribe lo suyo y nada más:
//
//   - la FICHA («Guardar carro»): lo que él teclea en el formulario —placas, tipo, marca, línea, color, modelo—;
//   - el MANTENIMIENTO (`servicios[]`, `intervalos{}`): se anota, se anula y se cambia desde su propio bloque de la ficha
//     (`nucleo/mantenimiento.js`);
//   - la DISPONIBILIDAD (`fueraDeServicio`, `motivoFueraDeServicio`): se cambia con «Marcar fuera de servicio» y «Volver a habilitar»,
//     nunca desde el formulario (`construirVehiculo`, pantallas/carros.js, ya decía que esas marcas «no vienen del formulario»).
//
// Por qué importa: la ficha parte de la copia que la pantalla tiene en memoria, y esa copia puede ser de ayer. Si la ficha escribiera
// TAMBIÉN lo del taller, un guardado del color devolvería el historial a una lista vieja, o —peor— un carro que otra computadora acaba de
// mandar al taller reaparecería como rentable, y a un cliente se le entregaría un carro descompuesto. Cada escritor lee el carro de la nube
// DENTRO de la transacción que lo escribe (`cambiarEnNubeYLocal`, datos.js) y cambia solo sus llaves; la ficha deja las ajenas como están.
import { CAMPOS_DEL_MANTENIMIENTO } from './mantenimiento.js';
// `estadoReserva` es la ÚNICA copia de qué cuenta como reservación pendiente: se reusa, no se repite.
import { estadoReserva } from './reserva.js';

/** Las dos marcas del taller. Las escriben SOLO `carroFueraDeServicio` y `carroHabilitado`. */
export const CAMPOS_DE_LA_DISPONIBILIDAD = Object.freeze(['fueraDeServicio', 'motivoFueraDeServicio']);

/**
 * Todo lo que la ficha NO escribe porque tiene su propio escritor. Si un carro llega a tener otro grupo de llaves con su propio
 * escritor, se agrega aquí (y una prueba exige que cada escritor de `datos.js` esté contado, para que no se pueda olvidar).
 */
export const CAMPOS_CON_SU_PROPIO_ESCRITOR = Object.freeze([...CAMPOS_DEL_MANTENIMIENTO, ...CAMPOS_DE_LA_DISPONIBILIDAD]);

/** Lo que lee el dueño si intenta marcar un carro fuera de servicio sin decir por qué. */
export const MENSAJE_FALTA_EL_MOTIVO = 'Escribe un motivo para marcar el carro fuera de servicio.';

/**
 * El carro con las dos marcas del taller puestas. El motivo es obligatorio (se guarda sin espacios sobrantes): un carro en el taller
 * sin decir por qué es un carro que nadie sabe cuándo vuelve. Devuelve un carro nuevo, sin tocar el recibido.
 */
export function carroFueraDeServicio(carro, motivo) {
  const porque = String(motivo ?? '').trim();
  if (!porque) throw new Error(MENSAJE_FALTA_EL_MOTIVO);
  return { ...carro, fueraDeServicio: true, motivoFueraDeServicio: porque };
}

/** El carro con las dos marcas quitadas: `false` y `''`, explícitos (así lo ha guardado siempre «Volver a habilitar»). */
export function carroHabilitado(carro) {
  return { ...carro, fueraDeServicio: false, motivoFueraDeServicio: '' };
}

/**
 * El carro como queda cuando un guardado de la FICHA se aplica sobre lo que la nube tiene AHORA (`fresco`):
 *   - todo lo que la pantalla trae se escribe encima (lo que él teclea tiene que quedarse: el error de al revés, una edición que no se
 *     guarda, es tan invisible como el de perder el historial);
 *   - EXCEPTO lo que tiene su propio escritor (`CAMPOS_CON_SU_PROPIO_ESCRITOR`: el mantenimiento y la disponibilidad), que se queda como
 *     la nube lo tiene;
 *   - lo que la nube tiene y la pantalla no conoce, se conserva (como con `merge`, que es lo que se hacía antes);
 *   - un valor `undefined` en la pantalla es «no sé», no «bórralo»: no pisa nada (y Firestore no lo acepta).
 * `id` y `actualizado` los vuelve a sellar quien escribe (`cambiarEnNubeYLocal`). No toca ninguno de los dos objetos.
 */
export function carroConLoDeLaFicha(fresco, deLaFicha) {
  const carro = { ...fresco };
  for (const [campo, valor] of Object.entries(deLaFicha ?? {})) {
    if (valor === undefined || CAMPOS_CON_SU_PROPIO_ESCRITOR.includes(campo)) continue;
    carro[campo] = valor;
  }
  return carro;
}

/**
 * Lo que se pierde al BORRAR un carro, para poder decírselo antes de borrarlo.
 *
 * Borrar no es «marcar fuera de servicio»: el carro desaparece de la flota y no vuelve. Decisión del 26 de
 * noviembre de 2026: se puede borrar cualquiera, con historial o sin él, pero el aviso tiene que decir
 * exactamente qué se pierde y qué NO, porque es lo único que no se puede deshacer desde el sistema.
 *
 * Lo que **no** se pierde: los contratos. Cada contrato guarda `carroPlacas` y `carroDescripcion` como se
 * vieron el día de la salida, y el papel los lee del contrato, no del carro (`hojaContrato.js`), así que los
 * contratos viejos siguen imprimiéndose igual después de borrar.
 *
 * Lo que **sí** se pierde: el kilometraje y el mantenimiento de ese carro, que se calculan recorriendo los
 * contratos por `carroId` (`mantenimiento.js`), y los servicios anotados, que viven dentro del documento del
 * carro. Las reservaciones pendientes quedan apuntando a un carro que ya no existe.
 *
 * `afuera` es el contrato abierto, si el carro está rentado AHORA. No impide borrar —él decide—, pero es el
 * caso que tiene que ver escrito: el carro está físicamente con un cliente.
 */
export function loQueSePierdeAlBorrarElCarro(carro, { contratos = [], reservas = [] } = {}) {
  const id = carro?.id ?? null;
  const vacio = { contratos: 0, reservas: 0, afuera: null, servicios: 0 };
  if (!id) return vacio;
  const suyos = (Array.isArray(contratos) ? contratos : []).filter((c) => c?.carroId === id);
  const pendientes = (Array.isArray(reservas) ? reservas : [])
    .filter((r) => r?.carroId === id && estadoReserva(r) === 'pendiente');
  return {
    contratos: suyos.length,
    reservas: pendientes.length,
    afuera: suyos.find((c) => !c?.cierre?.fechaReal) ?? null,
    servicios: Array.isArray(carro?.servicios) ? carro.servicios.length : 0,
  };
}

/**
 * La pregunta de «Borrar carro», con lo que se pierde escrito. Pura y aparte de la pantalla para poder
 * medirla: es la última cosa que él lee antes de que el carro desaparezca.
 */
export function textoConfirmarBorrarElCarro(carro, perdida) {
  const nombre = [carro?.codigo, carro?.placas].filter(Boolean).join(' · ') || 'este carro';
  const partes = [`¿Borrar «${nombre}» de la flota?`];
  if (perdida?.afuera) {
    const numero = perdida.afuera.numero ? `N.° ${perdida.afuera.numero}` : 'sin número';
    partes.push(`OJO: este carro está AFUERA ahora mismo, rentado en el contrato ${numero}.`);
  }
  if (perdida?.contratos) {
    partes.push(`Tiene ${perdida.contratos} ${perdida.contratos === 1 ? 'contrato' : 'contratos'}. `
      + 'Los contratos NO se borran y siguen imprimiéndose igual, porque guardan las placas y la descripción '
      + 'del carro como se vieron ese día.');
    partes.push('Lo que se pierde es el kilometraje y el mantenimiento de este carro, que se calculan desde '
      + 'sus contratos.');
  }
  if (perdida?.servicios) {
    partes.push(`También se pierden ${perdida.servicios} ${perdida.servicios === 1 ? 'servicio anotado' : 'servicios anotados'}.`);
  }
  if (perdida?.reservas) {
    partes.push(`Y ${perdida.reservas} ${perdida.reservas === 1 ? 'reservación pendiente queda' : 'reservaciones pendientes quedan'} `
      + 'apuntando a un carro que ya no existe.');
  }
  partes.push('Esto no se puede deshacer desde el sistema.');
  return partes.join('\n\n');
}

/**
 * El aviso de que la cuenta de «lo que se pierde» puede estar incompleta, cuando algo no se pudo leer.
 *
 * Una pregunta que calla lo que no sabe es peor que no preguntar: si los contratos no se leyeron, el aviso
 * diría «no tiene contratos» cuando la verdad es «no se sabe». Devuelve cadena vacía cuando se leyó todo,
 * para no asustar sin motivo.
 */
export function textoDeLoQueNoSePudoLeer({ contratos = false, reservas = false } = {}) {
  const faltan = [contratos ? 'los contratos' : null, reservas ? 'las reservaciones' : null].filter(Boolean);
  if (!faltan.length) return '';
  return `OJO: no se pudieron leer ${faltan.join(' ni ')}, así que esta cuenta puede estar incompleta: `
    + 'puede haber más de lo que dice aquí.';
}
