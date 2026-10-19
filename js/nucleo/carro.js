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
