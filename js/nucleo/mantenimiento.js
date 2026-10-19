// El mantenimiento de la flota propia (§12b del diseño): seis servicios, dos intervalos cada uno —kilómetros y
// tiempo—, y toca con el que llegue primero.
//
// Todo lo que el sistema sabe contestar sobre esto se contesta AQUÍ y en ningún otro lado: en cuántos kilómetros anda un
// carro, cuándo se hizo cada servicio, cuánto falta para el siguiente y si ya toca. La ficha del carro y el aviso de
// «Sacar carro» solo dibujan lo que sale de estas funciones; ninguna vuelve a hacer una de estas cuentas.
//
// LO QUE ESTE ARCHIVO NO HACE, A PROPÓSITO (es la mitad del trabajo):
//
// 1. **No inventa un kilometraje.** El kilometraje de un carro no se guarda en ningún lado: sale de los contratos
//    (`cierre.kmEntrada` al recibirlo, `kmSalida` mientras anda afuera). Un carro recién comprado no tiene contratos y su
//    kilometraje es «no se sabe» —`null`—, NO cero. Un servicio calculado sobre un cero inventado avisa mal desde el primer
//    día («faltan 5,000 km» de un carro que nadie ha medido) y le enseña al dueño a ignorar todos los avisos: este
//    proyecto ya arregló ese error exacto tres veces (un número ausente dibujado como un cero de verdad, §7b). Aquí, sin
//    kilometraje, el lado de kilómetros dice que no sabe y el de tiempo sigue funcionando solo.
//    Un kilometraje guardado en 0 es «no se anotó» (es como lo trata `problemasDelCierre`: «Falta el kilometraje de
//    entrada»), nunca «el carro marca cero».
//
// 2. **No cuenta un servicio que no puede fechar.** Un servicio sin fecha válida, con fecha futura o anulado no cuenta
//    para nada: «el último servicio» tiene que ser uno que de verdad pasó y cuya fecha se sabe, o el plazo de tiempo se
//    calcula desde un día que no existe.
//
// 3. **No dice «al día» por lo que no sabe.** Un renglón es «Al día» solo si los DOS lados se pudieron medir y ninguno
//    está cerca. Con un lado que no se sabe es «Al día por fecha»; con una lectura que falló (los contratos o la flota no
//    se pudieron leer) lo que no es malo se queda en «No se pudo confirmar»: una lectura caída nunca se dibuja como buena
//    noticia, porque la buena noticia nadie la audita. Lo malo, en cambio, sí se dice aunque la lectura sea incompleta:
//    el kilometraje solo sube, así que si una copia vieja ya dice que toca, toca.
//
// El aviso (`avisosDeMantenimiento`) sale al lado de los demás de «Sacar carro» (nucleo/avisos.js) y es de nivel medio:
// advertencia y no candado. Un servicio vencido no impide rentar el carro, él decide; lo que no puede es que nadie se lo
// haya dicho. Avisa solo de lo que SABE: un carro sin servicios anotados, o con el kilometraje desconocido y el plazo de
// tiempo lejos, no dice nada. Un aviso que él no quiere lo entrena a ignorar los que sí importan (ver el encabezado de
// avisos.js: por eso tampoco se avisa del precio ni de los días).
//
// Dónde viven los datos (§7b, «Del carro»): `servicios[]` e `intervalos{}` dentro del documento del carro. El
// kilometraje de cada servicio se guarda CON el servicio: él puede hacer el cambio de aceite tres semanas después de que
// el carro volvió, y entonces el odómetro de hoy no es el último `kmEntrada`. Eso no es llevar un kilometraje aparte por
// carro, que es lo que la especificación prohíbe: es anotar a qué kilometraje se hizo UN servicio.
import { q, textoEntero } from './dinero.js';
import {
  diasEntre, esFechaISO, sumarMeses, textoFecha,
} from './fechas.js';
import { conKmSalidaNormalizado } from './contrato.js';
import { yaVolvio } from './estados.js';

// ---------------------------------------------------------------------------------------------------------------
// Los seis servicios, sus intervalos por omisión y por qué
// ---------------------------------------------------------------------------------------------------------------
//
// ESTOS NÚMEROS SON PROPUESTOS, no del dueño: la especificación pide dos intervalos por servicio pero no fija cuáles, y los
// números son suyos (su taller, sus carros). Van como valores por omisión que se pueden cambiar en cada carro (ficha →
// «Intervalos de este carro»). Un valor por omisión equivocado le cuesta una corrección; un aviso inventado le cuesta la
// confianza en todos los avisos — por eso, ante la duda, se eligió el intervalo que suele recomendarse para uso pesado y
// no el más largo del manual. Ninguno salió de una medición ni de los datos del negocio: son criterio general, para que el
// dueño los confirme con su taller.
//
// Se pensó en carros de renta en Guatemala: muchos conductores distintos, ciudad con trancones y pendientes, caminos con
// baches y «túmulos», calor y lluvia de mayo a octubre; y un carro de renta que anda unos 2,000 a 3,000 km al mes (un
// supuesto que él puede corregir: no se midió). Es lo que el manual del fabricante llama «uso severo».
export const SERVICIOS = Object.freeze([
  Object.freeze({
    tipo: 'aceite',
    nombre: 'Aceite y filtro',
    km: 5000,
    meses: 3,
    porque: 'Cada 5,000 km es el intervalo que suele recomendarse para uso pesado (el manual dice 7,500–10,000 con uso '
      + 'normal; un carro de renta con muchos conductores, trancones y calor es uso severo). Los 3 meses son porque el aceite '
      + 'envejece aunque el carro esté parado entre rentas.',
  }),
  Object.freeze({
    tipo: 'frenos',
    nombre: 'Pastillas de freno',
    km: 30000,
    meses: 12,
    porque: 'Las pastillas duran 30,000–50,000 km; con pendientes, trancones y conductores que no son el dueño se acercan al '
      + 'extremo bajo. A los 12 meses se revisan igual: la lluvia y la humedad también las gastan.',
  }),
  Object.freeze({
    tipo: 'llantas',
    nombre: 'Llantas',
    km: 40000,
    meses: 48,
    porque: 'Con baches y túmulos una llanta rinde unos 40,000 km. El hule envejece aunque no ruede: 4 años es margen de '
      + 'seguridad (el fabricante dice hasta 6) porque una llanta reventada con un cliente adentro es un problema de otro tamaño.',
  }),
  Object.freeze({
    tipo: 'bateria',
    nombre: 'Batería',
    km: 60000,
    meses: 36,
    porque: 'Una batería de plomo se acaba por edad, más que por kilómetros: 3 años es lo que dura en el calor. Se cambia '
      + 'antes de que falle porque un cliente varado cuesta mucho más que la batería. Los 60,000 km son solo un respaldo '
      + 'para un carro muy usado.',
  }),
  Object.freeze({
    tipo: 'alineacion',
    nombre: 'Alineación y balanceo',
    km: 10000,
    meses: 6,
    porque: 'Cada 10,000 km es lo normal, y los baches de aquí la sacan de punto más seguido. A los 6 meses se revisa aunque '
      + 'el carro haya andado poco: una llanta mal alineada se come sola en pocas semanas.',
  }),
  Object.freeze({
    tipo: 'general',
    nombre: 'Servicio general',
    km: 20000,
    meses: 12,
    porque: 'La revisión completa (filtros de aire, bujías, líquidos, correas, suspensión) cae a los 20,000 km en el '
      + 'programa de casi todos los fabricantes; a los 12 meses se hace aunque no haya llegado a los kilómetros.',
  }),
]);

/** Cuánto antes de que toque empieza a avisar: 500 km (≈ una semana de renta) y 15 días. */
export const ANTELACION = Object.freeze({
  km: 500,
  dias: 15,
  // Por qué estos: un carro de renta anda unos 80 km al día, así que 500 km son más o menos una semana: tiempo para
  // meterlo al taller entre una renta y otra sin cancelar nada. Y 15 días es la mitad de un mes de agenda. Más
  // antelación avisaría durante demasiado tiempo de cada ciclo (el aviso se vuelve decoración); menos, no deja tiempo.
});

const POR_TIPO = new Map(SERVICIOS.map((s) => [s.tipo, s]));

/** El servicio con ese `tipo` (`'aceite'`, `'frenos'`, `'llantas'`, `'bateria'`, `'alineacion'`, `'general'`), o `null`. */
export function servicioDeTipo(tipo) {
  return POR_TIPO.get(tipo) ?? null;
}

const enMinuscula = (texto) => texto.charAt(0).toLowerCase() + texto.slice(1);
const arreglo = (x) => (Array.isArray(x) ? x : []);
const enteroPositivo = (x) => typeof x === 'number' && Number.isInteger(x) && x > 0;

// ---------------------------------------------------------------------------------------------------------------
// En cuántos kilómetros anda el carro
// ---------------------------------------------------------------------------------------------------------------

/**
 * Un kilometraje leído de lo que está guardado: un entero mayor que cero, o `null` si no hay nada que leer. Un cero, un
 * vacío, un texto que no es número, un booleano y lo negativo son «no se anotó», nunca «cero kilómetros». (`q()` a secas
 * daría 1 para `true` y 0 para lo ilegible, y ese 0 se confundiría con un odómetro en cero.)
 */
export function kmLeido(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const km = Math.round(q(valor));
  return km > 0 ? km : null;
}

/**
 * Un kilometraje `{ km, … }` con el `km` leído (`kmLeido`), o `null` si no trae uno que valga. Es la puerta por donde
 * entra TODO kilometraje a las cuentas de este archivo: así, quien llame con `{ km: 0 }` (un campo vacío que `q()` volvió
 * cero) no puede fabricar un «faltan 20,000 km» sobre un odómetro que nadie leyó.
 */
function lecturaValida(kilometraje) {
  const km = kmLeido(kilometraje?.km);
  return km === null ? null : { ...kilometraje, km };
}

/**
 * En cuántos kilómetros anda este carro, según sus contratos, o `null` si no se sabe.
 *
 * Es el MAYOR kilometraje anotado en cualquiera de sus contratos: el `cierre.kmEntrada` de los que ya regresaron y el
 * `kmSalida` de los demás (con su puente de lectura `kilometrajeSalida`, `conKmSalidaNormalizado`, para los contratos viejos).
 * Si el carro está afuera, el `kmSalida` de su contrato abierto puede ser mayor que cualquier entrada anterior, y entonces
 * es ése. Un odómetro solo sube, así que el mayor es el último; por eso no importa en qué orden lleguen los contratos.
 *
 * `contratos` tiene que traer TODOS los contratos del carro, abiertos y cerrados: con solo los abiertos (lo que lee
 * «Sacar carro») el mayor kilometraje casi nunca está. Los de un carro ajeno no cuentan (`Boolean(c.ajeno)` es el único
 * criterio, §7b), ni un cierre sin `fechaReal` (no es un regreso: `yaVolvio`).
 *
 * Devuelve `{ km, fecha, desde, contratoId, numero }` —`desde` es `'entrada'` o `'salida'`— para poder decirle al dueño de
 * dónde salió el número: un kilometraje mal tecleado en un contrato (un cero de más) se encuentra si se sabe cuál contrato lo puso.
 */
export function kilometrajeDelCarro(carroId, contratos) {
  if (!carroId) return null;
  let mejor = null;
  const considerar = (km, fecha, desde, contrato) => {
    if (km === null) return;
    const dia = typeof fecha === 'string' ? fecha : '';
    if (!mejor || km > mejor.km || (km === mejor.km && dia > mejor.fecha)) {
      mejor = {
        km, fecha: dia, desde, contratoId: contrato.id ?? null, numero: contrato.numero ?? null,
      };
    }
  };
  for (const original of arreglo(contratos)) {
    if (!original || original.ajeno || original.carroId !== carroId) continue;
    const c = conKmSalidaNormalizado(original);
    considerar(kmLeido(c.kmSalida), c.fechaSalida, 'salida', c);
    if (yaVolvio(c)) considerar(kmLeido(c.cierre.kmEntrada), c.cierre.fechaReal, 'entrada', c);
  }
  return mejor;
}

/**
 * La frase de arriba del bloque de la ficha: en cuántos kilómetros anda el carro y de dónde sale ese número, o por qué no
 * se sabe. `falloContratos` dice que la lectura de los contratos falló: entonces «no se sabe» es «no se pudo leer», que no
 * es lo mismo, y un número que sí salió puede estar atrasado.
 */
export function textoDelKilometraje(conocido, { falloContratos = false } = {}) {
  const kilometraje = lecturaValida(conocido);
  if (!kilometraje) {
    return falloContratos
      ? 'No se pudieron leer los contratos, así que no se sabe en cuántos kilómetros anda este carro. Revisa tu conexión.'
      : 'No se sabe en cuántos kilómetros anda este carro: ninguno de sus contratos trae kilometraje anotado. '
        + 'Se sabe con el kilometraje que se anota al sacarlo y al recibirlo.';
  }
  const contrato = kilometraje.numero != null ? `del contrato ${kilometraje.numero}` : 'de un contrato';
  const origen = kilometraje.desde === 'entrada'
    ? `el kilometraje de entrada ${contrato}${kilometraje.fecha ? `, recibido el ${textoFecha(kilometraje.fecha)}` : ''}`
    : `el kilometraje de salida ${contrato}${kilometraje.fecha ? `, que salió el ${textoFecha(kilometraje.fecha)}` : ''}`;
  const atrasado = falloContratos ? ' Puede estar atrasado: no se pudieron leer los contratos.' : '';
  return `Anda en ${textoEntero(kilometraje.km)} km, según ${origen}.${atrasado}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Los intervalos de cada carro
// ---------------------------------------------------------------------------------------------------------------

/**
 * Los intervalos que rigen para este servicio en este carro: los suyos si los cambió (`carro.intervalos[tipo]`, con los dos
 * números válidos) o los de siempre. `propio` dice cuál de los dos es, para poder ofrecer «volver a los de siempre».
 * Un intervalo guardado a medias o ilegible no rige: se usa el de siempre, nunca un cero ni un hueco.
 */
export function intervaloDe(carro, tipo) {
  const base = servicioDeTipo(tipo);
  if (!base) return null;
  const propio = carro?.intervalos?.[tipo];
  if (propio && enteroPositivo(propio.km) && enteroPositivo(propio.meses)) {
    return { km: propio.km, meses: propio.meses, propio: true };
  }
  return { km: base.km, meses: base.meses, propio: false };
}

/** Un entero mayor que cero escrito en un formulario (`'5000'`, `5000`), o `null`. */
function aEnteroPositivo(crudo) {
  const texto = typeof crudo === 'number' ? String(crudo) : String(crudo ?? '').trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

/**
 * Lo escrito en el formulario de intervalos (`{ km, meses }`, tal como llegó) ya revisado: `{ intervalo, problemas }`.
 * Los dos son obligatorios y enteros: «toca con el que llegue primero» necesita los dos lados, y un intervalo en cero
 * avisaría siempre. Con algún problema `intervalo` es `null`.
 */
export function revisarIntervalo({ km, meses } = {}) {
  const problemas = [];
  const kmN = aEnteroPositivo(km);
  const mesesN = aEnteroPositivo(meses);
  if (kmN === null) problemas.push('Los kilómetros van en un número entero mayor que cero.');
  if (mesesN === null) problemas.push('Los meses van en un número entero mayor que cero.');
  return { intervalo: problemas.length ? null : { km: kmN, meses: mesesN }, problemas };
}

/**
 * Los `intervalos` del carro con este servicio cambiado a `intervalo` (`{ km, meses }`), o devuelto a los de siempre con
 * `null`. Si lo que se escribió es justo lo de siempre, no se guarda nada: así el día que se cambie un valor por omisión
 * llega a los carros que nunca lo tocaron. No toca el objeto recibido.
 */
export function conIntervalo(intervalos, tipo, intervalo) {
  const base = servicioDeTipo(tipo);
  if (!base) throw new Error(`Servicio desconocido: ${tipo}`);
  const resto = { ...(intervalos && typeof intervalos === 'object' && !Array.isArray(intervalos) ? intervalos : {}) };
  delete resto[tipo];
  const esDeSiempre = !intervalo || (intervalo.km === base.km && intervalo.meses === base.meses);
  return esDeSiempre ? resto : { ...resto, [tipo]: { km: intervalo.km, meses: intervalo.meses } };
}

// ---------------------------------------------------------------------------------------------------------------
// Los servicios hechos
// ---------------------------------------------------------------------------------------------------------------

/**
 * ¿Cuenta este servicio? Solo si se sabe cuándo pasó: un tipo conocido, una fecha de calendario que no es de mañana, y
 * que no se haya anulado. Sin `hoy` válido nada cuenta (no se puede saber si ya pasó). Un servicio que no cuenta sigue en
 * el historial, a la vista, pero ni resetea un plazo ni calla un aviso.
 */
export function servicioCuenta(servicio, hoy) {
  return Boolean(servicio)
    && !servicio.anulado
    && POR_TIPO.has(servicio.tipo)
    && esFechaISO(servicio.fecha)
    && esFechaISO(hoy)
    && diasEntre(servicio.fecha, hoy) >= 0;
}

/**
 * Por qué NO cuenta un servicio, en palabras (para marcarlo en el historial), o `''` si cuenta.
 */
export function razonDeQueNoCuente(servicio, hoy) {
  if (servicio?.anulado) return 'Anulado';
  if (!servicio || !POR_TIPO.has(servicio.tipo)) return 'Servicio desconocido: no cuenta';
  if (!esFechaISO(servicio.fecha)) return 'Sin fecha válida: no cuenta';
  if (esFechaISO(hoy) && diasEntre(servicio.fecha, hoy) < 0) return 'Fecha que todavía no llega: no cuenta';
  return servicioCuenta(servicio, hoy) ? '' : 'No cuenta';
}

/**
 * El historial de servicios de un carro para la ficha: TODOS, los que cuentan y los que no, el más reciente primero.
 * `{ id, tipo, nombre, fecha, km, anulado, anuladoEn, cuenta, razon }`: `cuenta` y `razon` (por qué no cuenta, o `''`)
 * los decide el núcleo, para que la ficha no tenga que adivinar cuál se pinta tachado. Uno sin fecha válida no tiene lugar
 * en el tiempo y va al final. A igual fecha, el que se anotó después va primero.
 */
export function historialDeServicios(servicios, hoy) {
  const filas = arreglo(servicios).filter(Boolean).map((s, orden) => ({
    id: s.id ?? null,
    tipo: s.tipo,
    nombre: servicioDeTipo(s.tipo)?.nombre ?? 'Servicio desconocido',
    fecha: typeof s.fecha === 'string' ? s.fecha : '',
    km: kmLeido(s.km),
    anulado: Boolean(s.anulado),
    anuladoEn: s.anuladoEn ?? null,
    cuenta: servicioCuenta(s, hoy),
    razon: razonDeQueNoCuente(s, hoy),
    orden,
  }));
  const conFecha = (f) => esFechaISO(f.fecha);
  return filas
    .sort((a, b) => {
      if (conFecha(a) !== conFecha(b)) return conFecha(a) ? -1 : 1;
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return b.orden - a.orden;
    })
    .map(({ orden: _orden, ...fila }) => fila);
}

/** El último servicio de ese tipo que cuenta: el de fecha más reciente (a igual fecha, el de más kilómetros). `null` si no hay. */
export function ultimoServicioDe(servicios, tipo, hoy) {
  let ultimo = null;
  for (const s of arreglo(servicios)) {
    if (s?.tipo !== tipo || !servicioCuenta(s, hoy)) continue;
    const km = kmLeido(s.km);
    const gana = !ultimo || s.fecha > ultimo.fecha || (s.fecha === ultimo.fecha && (km ?? 0) >= (ultimo.km ?? 0));
    if (gana) ultimo = { id: s.id ?? null, tipo, fecha: s.fecha, km };
  }
  return ultimo;
}

/**
 * Lo escrito en el formulario de «Registrar un servicio» (`{ tipo, fecha, km }`, tal como llegó) ya revisado:
 * `{ servicio, problemas }`. El kilometraje es el del odómetro CUANDO se hizo el servicio —no el de hoy—, y puede quedar
 * vacío si no se sabe (`km: null`, nunca 0): entonces ese servicio fecha el plazo de tiempo y no el de kilómetros.
 * El `id` no se pone aquí: se decide una vez por intención (`altaConIdFijo`, datos.js) para que un reintento no duplique.
 */
export function construirServicio({ tipo, fecha, km } = {}, hoy) {
  const problemas = [];
  if (!POR_TIPO.has(tipo)) problemas.push('Escoge qué servicio se hizo.');

  const dia = String(fecha ?? '').trim();
  if (!dia) {
    problemas.push('Escribe la fecha en que se hizo el servicio.');
  } else if (!esFechaISO(dia)) {
    problemas.push('La fecha del servicio no es válida. Revisa el año.');
  } else if (esFechaISO(hoy) && diasEntre(hoy, dia) > 0) {
    problemas.push(`La fecha del servicio (${textoFecha(dia)}) todavía no llega. Revisa la fecha.`);
  }

  let kmN = null;
  const kmCrudo = typeof km === 'number' ? String(km) : String(km ?? '').trim();
  if (kmCrudo !== '') {
    kmN = aEnteroPositivo(kmCrudo);
    if (kmN === null) problemas.push('El kilometraje va en un número entero mayor que cero (o déjalo vacío si no se sabe).');
  }

  return { servicio: problemas.length ? null : { tipo, fecha: dia, km: kmN }, problemas };
}

/**
 * La lista de servicios con éste agregado. Si ya hay uno con el mismo `id` NO se agrega otro: es un reintento de un
 * guardado que sí había llegado, y duplicarlo contaría dos veces un servicio que se hizo una. No toca la lista recibida.
 */
export function conServicioAgregado(servicios, servicio) {
  if (!servicio?.id) throw new Error('Un servicio nuevo trae su id: sin él, repetir el intento lo duplicaría.');
  const lista = arreglo(servicios);
  if (lista.some((s) => s?.id === servicio.id)) return lista;
  return [...lista, { id: servicio.id, tipo: servicio.tipo, fecha: servicio.fecha, km: servicio.km ?? null }];
}

/**
 * La lista con ese servicio anulado. Se anula y no se borra, igual que un pago (§7b): `anulado` y `anuladoEn` se llaman
 * como en el pago a propósito. Un servicio mal tecleado (el kilometraje con un cero de más) corrompería el plazo para
 * siempre; anulado deja de contar y se ve en el historial. Uno que ya estaba anulado no vuelve a cambiar su fecha.
 */
export function conServicioAnulado(servicios, id, hoy) {
  const lista = arreglo(servicios);
  if (!lista.some((s) => s?.id === id)) throw new Error('Ese servicio ya no está en la lista del carro.');
  return lista.map((s) => (s?.id === id && !s.anulado ? { ...s, anulado: true, anuladoEn: hoy } : s));
}

/** El carro con un servicio más. Devuelve un carro nuevo, sin tocar el recibido. */
export function carroConServicio(carro, servicio) {
  return { ...carro, servicios: conServicioAgregado(carro?.servicios, servicio) };
}

/** El carro con ese servicio anulado. */
export function carroConServicioAnulado(carro, id, hoy) {
  return { ...carro, servicios: conServicioAnulado(carro?.servicios, id, hoy) };
}

/** El carro con los intervalos de un servicio cambiados (o devueltos a los de siempre con `null`). */
export function carroConIntervalo(carro, tipo, intervalo) {
  return { ...carro, intervalos: conIntervalo(carro?.intervalos, tipo, intervalo) };
}

/**
 * Las llaves del documento del carro que son del mantenimiento y de nadie más: `servicios[]` (su historial) e
 * `intervalos{}` (los que cambió el dueño en ese carro). Las escriben SOLO `carroConServicio`, `carroConServicioAnulado` y
 * `carroConIntervalo`, que `datos.js` aplica sobre el carro leído DENTRO de la transacción que lo escribe.
 *
 * Por qué hay una lista: un guardado de la ficha del carro («Guardar carro») parte de la copia que la pantalla tiene en memoria,
 * y esa copia puede traer el historial de ayer. Esas llaves no son suyas: el historial no se edita en ese formulario, así que no
 * hay edición que proteger al dejarlas como la nube las tiene y sí un historial entero que perder si se escriben. Si el
 * mantenimiento llega a tener una llave más, va AQUÍ (una prueba compara esta lista con lo que de verdad tocan los tres
 * cambios de arriba, para que no se pueda olvidar). La regla de qué NO escribe la ficha, con las del taller incluidas, vive en
 * `nucleo/carro.js` (`carroConLoDeLaFicha`).
 */
export const CAMPOS_DEL_MANTENIMIENTO = Object.freeze(['servicios', 'intervalos']);

// ---------------------------------------------------------------------------------------------------------------
// ¿Toca? Cuánto falta, de cada lado, y cuál llega primero
// ---------------------------------------------------------------------------------------------------------------

const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** Del lado de los kilómetros: ¿toca? No se mide sin el kilometraje del carro ni sin el del último servicio. */
function ladoDeKilometros({ ultimo, intervalo, kilometraje, falloContratos }) {
  const proximo = ultimo?.km != null ? ultimo.km + intervalo.km : null;
  const base = { proximo, faltan: null };

  if (!ultimo) return { ...base, estado: 'desconocido', texto: '' };
  if (proximo === null) {
    return {
      ...base,
      estado: 'desconocido',
      texto: 'El último servicio no tiene kilometraje anotado: no se sabe cuándo toca por kilómetros.',
    };
  }
  if (!kilometraje) {
    return falloContratos
      ? {
        ...base,
        estado: 'sin-leer',
        texto: `Toca a los ${textoEntero(proximo)} km, pero no se pudieron leer los contratos para saber en cuántos anda el carro.`,
      }
      : {
        ...base,
        estado: 'desconocido',
        texto: `Toca a los ${textoEntero(proximo)} km, pero no se sabe en cuántos kilómetros anda el carro.`,
      };
  }

  const faltan = proximo - kilometraje.km;
  const estado = faltan <= 0 ? 'toca' : (faltan <= ANTELACION.km ? 'pronto' : 'ok');
  let texto = `Faltan ${textoEntero(faltan)} km (a los ${textoEntero(proximo)} km).`;
  if (faltan === 0) texto = `Toca ahora: el carro anda justo en los ${textoEntero(proximo)} km.`;
  if (faltan < 0) texto = `Se pasó por ${textoEntero(-faltan)} km (tocaba a los ${textoEntero(proximo)} km).`;
  return { proximo, faltan, estado, texto };
}

/** Del lado del tiempo: ¿toca? Necesita solo la fecha del último servicio, que cuenta únicamente si se sabe. */
function ladoDeTiempo({ ultimo, intervalo, hoy }) {
  const proxima = ultimo ? sumarMeses(ultimo.fecha, intervalo.meses) : '';
  if (!ultimo || !proxima) return { proxima: '', faltan: null, estado: 'desconocido', texto: '' };

  const faltan = diasEntre(hoy, proxima);
  const estado = faltan <= 0 ? 'toca' : (faltan <= ANTELACION.dias ? 'pronto' : 'ok');
  let texto = `Faltan ${dias(faltan)} (el ${textoFecha(proxima)}).`;
  if (faltan === 0) texto = `Toca hoy (${textoFecha(proxima)}).`;
  if (faltan < 0) texto = `Se pasó hace ${dias(-faltan)} (tocaba el ${textoFecha(proxima)}).`;
  return {
    proxima, faltan, estado, texto,
  };
}

const ETIQUETAS = {
  toca: 'Toca',
  pronto: 'Pronto',
  'al-dia': 'Al día',
  parcial: 'Al día por fecha',
  'sin-registro': 'Sin registro',
  'sin-confirmar': 'No se pudo confirmar',
};

/**
 * Dónde está un servicio de un carro: `{ tipo, nombre, intervalo, ultimo, km, tiempo, estado, etiqueta, texto }`.
 *
 * - `ultimo`: el último servicio que cuenta (`{ id, fecha, km }`) o `null`.
 * - `km` y `tiempo`: cada lado, con `estado` (`'toca'`, `'pronto'`, `'ok'`, `'desconocido'` o `'sin-leer'`), cuánto `falta`
 *   y su frase `texto`. Un lado que no se sabe NO es `'ok'`.
 * - `estado`: el peor de los dos lados que se saben —toca con el que llegue primero—: `'toca'`, `'pronto'`, `'al-dia'`
 *   (los dos lados medidos y lejos), `'parcial'` (solo el tiempo se midió, y está lejos), `'sin-registro'` (no hay ningún
 *   servicio que cuente: no hay de dónde medir) o `'sin-confirmar'` (todo parecía bien pero una lectura falló).
 *
 * `kilometraje` es `{ km, … }` o `null`; `falloFlota`/`falloContratos` dicen que esa lectura falló.
 */
export function estadoDeServicio({
  tipo, servicios, intervalo, kilometraje: conocido = null, hoy, falloFlota = false, falloContratos = false,
}) {
  const kilometraje = lecturaValida(conocido);
  const base = servicioDeTipo(tipo);
  if (!base) throw new Error(`Servicio desconocido: ${tipo}`);
  const reglas = intervalo ?? { km: base.km, meses: base.meses, propio: false };
  const ultimo = ultimoServicioDe(servicios, tipo, hoy);
  const km = ladoDeKilometros({
    ultimo, intervalo: reglas, kilometraje, falloContratos,
  });
  const tiempo = ladoDeTiempo({ ultimo, intervalo: reglas, hoy });

  const lados = [km.estado, tiempo.estado];
  let estado;
  if (!ultimo) estado = 'sin-registro';
  else if (lados.includes('toca')) estado = 'toca';
  else if (lados.includes('pronto')) estado = 'pronto';
  else if (km.estado === 'ok' && tiempo.estado === 'ok') estado = 'al-dia';
  else estado = 'parcial';
  // Una lectura que falló no deja decir «al día»: lo malo se dice igual, lo bueno hay que confirmarlo.
  if ((falloFlota || falloContratos) && (estado === 'al-dia' || estado === 'parcial')) estado = 'sin-confirmar';

  return {
    tipo,
    nombre: base.nombre,
    intervalo: reglas,
    ultimo,
    km,
    tiempo,
    estado,
    etiqueta: ETIQUETAS[estado],
    texto: ultimo ? '' : 'Falta registrar el primer servicio.',
  };
}

/**
 * El mantenimiento de un carro entero: los seis servicios en su orden, el kilometraje que se usó, y cuáles tocan o están
 * por tocar. Es lo que dibuja la ficha, y de lo que sale el aviso.
 *
 * `kilometraje` es `{ km, … }` (de `kilometrajeDelCarro`) o `null` si no se sabe. `hoy` se recibe (nunca se lee del reloj
 * aquí). `falloFlota` / `falloContratos`: esa lectura falló, y lo que no es malo no se da por bueno.
 */
export function estadoDeMantenimiento({
  carro, kilometraje: conocido = null, hoy, falloFlota = false, falloContratos = false,
}) {
  const kilometraje = lecturaValida(conocido);
  const servicios = SERVICIOS.map((s) => estadoDeServicio({
    tipo: s.tipo,
    servicios: carro?.servicios,
    intervalo: intervaloDe(carro, s.tipo),
    kilometraje,
    hoy,
    falloFlota,
    falloContratos,
  }));
  return {
    servicios,
    kilometraje,
    tocan: servicios.filter((s) => s.estado === 'toca'),
    porTocar: servicios.filter((s) => s.estado === 'pronto'),
    lecturaIncompleta: Boolean(falloFlota || falloContratos),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// El aviso de «Sacar carro»
// ---------------------------------------------------------------------------------------------------------------

// Cuántos servicios se nombran en cada aviso; los demás se cuentan. Igual que las reservaciones apartadas (avisos.js):
// una pared de nombres no es ayuda, es ruido.
const MAX_NOMBRADOS = 3;

function enLista(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/**
 * Por qué toca un servicio, corto: los lados que ya llegaron. Con los dos lados, el de fecha va aparte con «;»: con dos «y»
 * seguidas no se sabía cuál cosa era de cuál («a los 17,000 km y el carro anda en 17,500 y el 16 oct» se lee mal).
 */
function porQueToca(s, kilometraje) {
  const razones = [];
  if (s.km.estado === 'toca') razones.push(`tocaba a los ${textoEntero(s.km.proximo)} km y el carro anda en ${textoEntero(kilometraje.km)}`);
  if (s.tiempo.estado === 'toca') razones.push(razones.length ? `por fecha, el ${textoFecha(s.tiempo.proxima)}` : `tocaba el ${textoFecha(s.tiempo.proxima)}`);
  return `${enMinuscula(s.nombre)} (${razones.join('; ')})`;
}

/** Cuánto falta para un servicio que está por tocar, corto: los lados que ya están dentro de la antelación. */
function porQueFalta(s) {
  const razones = [];
  if (s.km.estado === 'pronto') razones.push(`faltan ${textoEntero(s.km.faltan)} km, a los ${textoEntero(s.km.proximo)}`);
  if (s.tiempo.estado === 'pronto') razones.push(`faltan ${dias(s.tiempo.faltan)}, el ${textoFecha(s.tiempo.proxima)}`);
  return `${enMinuscula(s.nombre)} (${razones.join('; ')})`;
}

function nombrados(lista, aTexto) {
  const partes = lista.slice(0, MAX_NOMBRADOS).map(aTexto);
  const resto = lista.length - MAX_NOMBRADOS;
  return enLista(resto > 0 ? [...partes, `${resto} más`] : partes);
}

/**
 * Los avisos de mantenimiento de un carro, con la forma de los demás de «Sacar carro» (`{ nivel, mensaje }`, nivel medio).
 * Uno por lo que ya toca y otro por lo que está por tocar; ninguno si no hay nada.
 *
 * Avisa SOLO de lo que sabe: un servicio sin registro, un kilometraje que no se sabe o un lado que no se pudo medir no
 * producen aviso (ver el encabezado). `kilometraje` es `{ km }` con el kilometraje de ahora, o `null`: en «Sacar carro» es
 * el que el mostrador escribe como kilometraje de salida, que es el odómetro de ese momento. Sin él (el campo vacío, 0)
 * solo se mide el tiempo.
 */
export function avisosDeMantenimiento({ carro, kilometraje = null, hoy }) {
  if (!carro || carro.ajeno) return [];
  const { tocan, porTocar, kilometraje: lectura } = estadoDeMantenimiento({ carro, kilometraje, hoy });
  const avisos = [];
  if (tocan.length) {
    avisos.push({
      nivel: 'medio',
      mensaje: `A este carro le toca servicio: ${nombrados(tocan, (s) => porQueToca(s, lectura))}.`,
    });
  }
  if (porTocar.length) {
    avisos.push({
      nivel: 'medio',
      mensaje: `A este carro le toca servicio pronto: ${nombrados(porTocar, porQueFalta)}.`,
    });
  }
  return avisos;
}
