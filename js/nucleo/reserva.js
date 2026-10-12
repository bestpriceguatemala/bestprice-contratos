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
import { maximoConCarro, LIMITE_DE_PASOS } from './asignacion.js';

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

  // Los campos declaran días enteros desde 1, y precio y anticipo desde 0, pero el formulario no deja que el
  // navegador lo exija. Una reservación de -3 días a -Q500 con -Q100 de anticipo se guardó con la devolución
  // ANTES de la salida (prueba del sistema, 7 oct 2026). Falta algo, y se dice qué tiene que ser.
  if (!r?.dias) falta.push('Días');
  else if (r.dias < 0) falta.push('Días (no pueden ser negativos)');
  else if (!Number.isInteger(r.dias)) falta.push('Días (tienen que ser un número entero)');
  if (q(r?.precioDia) < 0) falta.push('Precio por día (no puede ser negativo)');
  if (q(r?.anticipo) < 0) falta.push('Anticipo (no puede ser negativo)');

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

// ---------------------------------------------------------------------------
// La capacidad por tipo (H-5)
//
// «Tengo 2 sedanes y 2 compromisos de sedán» NO quiere decir que no quede un sedán: depende de CUÁNDO. Una
// reservación por tipo (sin carro elegido) termina con un carro de ese tipo, el mismo todos sus días; un
// compromiso con carro exacto ya lo tiene; y un carro no puede estar en dos compromisos que se cruzan. La
// pregunta de verdad es: ¿puede cada compromiso que se cruza con este, más este, tener un carro propio?
// Contar cuántos tocan las fechas se equivoca para los dos lados (avisa de más cuando no coinciden el mismo
// día, y calla cuando un carro exacto le quita la única unidad a uno por tipo), y contar el máximo de
// coincidencias tampoco alcanza: un carro ocupado del 1 al 5 y otro del 6 al 10 no dejan ninguno libre del 1
// al 10 aunque nunca haya más de uno ocupado a la vez. Es un problema de asignación; la parte matemática
// vive en asignacion.js y aquí se arma lo que necesita.
//
// Qué se le pregunta, exactamente: no «¿caben todos?» (si ya había un exceso antes, culparía a la reservación
// nueva de lo que no hizo) sino «¿esto deja sin carro a alguien que hoy sí lo tiene?». Se compara el máximo de
// compromisos por tipo que pueden tener carro CON la reservación nueva contra SIN ella.
//
// Dos compromisos clavados al mismo carro que se cruzan entre sí no entran aquí: eso es un aviso de carro
// exacto y ya sale por su lado. Para esta pregunta un compromiso clavado solo hace una cosa: ocupar su carro
// esos días.
// ---------------------------------------------------------------------------

/** Cuándo ocupa una reservación (el rango que apartó) o un contrato (hasta su fin EFECTIVO) un carro. */
const rangoDeReserva = (r) => ({ desde: r?.fechaSalida, hasta: r?.devolucionPrevista });
const rangoDeContrato = (c, hoy) => ({ desde: c?.fechaSalida, hasta: finDelContrato(c, hoy) });
const rangosSeCruzan = (a, b) => seTraslapan(a.desde, a.hasta, b.desde, b.hasta);
const tieneRango = (rango) => Boolean(rango?.desde && rango?.hasta);

/**
 * Lo que los compromisos vivos (reservaciones pendientes y contratos que no se han cerrado) le piden a los
 * carros de UN tipo.
 *
 * - `carros`: los de ese tipo que están en servicio (un carro del taller no es una unidad con la que contar).
 * - `fijos`: los compromisos clavados a uno de esos carros: lo ocupan esos días. Un compromiso clavado a un
 *   carro de otro tipo, o a uno del taller, no le quita unidades a nadie de aquí.
 * - `libres`: las reservaciones por tipo, sin carro: necesitan cualquiera de los carros que esté libre.
 *   Si el carro exacto que traen ya no está en la flota, vale el tipo que pidieron. Un contrato de carro
 *   ajeno no tiene carro de la flota ni tipo pedido, así que no entra.
 *
 * Se excluye la reservación con id `excepto` (la que se está editando: no choca contra sí misma).
 */
function compromisosDelTipo({
  tipo, flota, reservas, contratos, excepto, hoy,
}) {
  const carros = flota.filter((c) => c.tipo === tipo && !c?.fueraDeServicio);
  const fijos = [];
  const libres = [];
  const clasificar = (compromiso, rango, tipoPedido) => {
    if (!tieneRango(rango)) return;
    const delCarro = compromiso?.carroId ? flota.find((c) => c.id === compromiso.carroId) : undefined;
    if (delCarro) {
      // Si trae carro exacto manda ESE carro y no el tipo que quedó escrito en la reservación: son dos
      // campos del formulario que no se corrigen uno al otro (prueba del sistema, 7 oct 2026: una
      // reservación de «Sedán» a la que se le puso la Ranger).
      const k = carros.indexOf(delCarro);
      if (k >= 0) fijos.push({ carro: k, rango });
      return;
    }
    if (tipoPedido === tipo) libres.push({ rango, reserva: compromiso });
  };
  reservas.forEach((r) => {
    if (r?.id !== excepto && estadoReserva(r) === 'pendiente') clasificar(r, rangoDeReserva(r), r?.tipoVehiculo);
  });
  contratos.forEach((c) => {
    if (estadoContrato(c) !== 'cerrado') clasificar(c, rangoDeContrato(c, hoy), undefined);
  });
  return { carros, fijos, libres };
}

/**
 * La pregunta de la capacidad, contestada una vez: ¿cuántas reservaciones por tipo se quedan sin carro por culpa
 * de `nuevo`? `nuevo` es `{ libre: true, rango }` (otra reservación por tipo: necesita un carro suyo) o
 * `{ carro, rango }` (un compromiso clavado al carro número `carro` de `grupo.carros`: se lo quita a quien lo
 * fuera a usar). Devuelve `{ perdida, sin, delGrupo }`, o `null` si la búsqueda se pasó de su límite y no se pudo
 * saber:
 *
 * - `perdida`: cuántas se quedan sin carro de las que hoy lo tienen. Cero es «cabe».
 * - `sin`: cuántas reservaciones del grupo pueden tener carro hoy, sin lo nuevo.
 * - `delGrupo`: las reservaciones por tipo que entran en la cuenta (ver abajo).
 *
 * Solo se mira el grupo conectado con las fechas de lo nuevo: las reservaciones por tipo que se cruzan con
 * ellas, las que se cruzan con ESAS, y así hasta que no hay más. No basta con las que tocan las fechas:
 * si lo nuevo manda a una a un carro, esa le quita su lugar a la que sigue, y así en cadena hasta una que ya
 * ni toca las fechas. Lo que no está conectado no cambia con lo nuevo, así que ni se mira.
 */
function analizar({ carros, fijos, libres }, nuevo, limite) {
  const enGrupo = new Set();
  const frontera = [nuevo.rango];
  for (let k = 0; k < frontera.length; k += 1) {
    libres.forEach((l, i) => {
      if (enGrupo.has(i) || !rangosSeCruzan(l.rango, frontera[k])) return;
      enGrupo.add(i);
      frontera.push(l.rango);
    });
  }
  const delGrupo = libres.filter((_, i) => enGrupo.has(i));

  const preguntar = (compromisos, ocupado) => {
    const choques = compromisos.map((a) => compromisos.map((b) => a !== b && rangosSeCruzan(a.rango, b.rango)));
    const vetados = compromisos.map((a) => carros.map((_, c) =>
      fijos.some((f) => f.carro === c && rangosSeCruzan(f.rango, a.rango))
      || (ocupado?.carro === c && rangosSeCruzan(ocupado.rango, a.rango))));
    return maximoConCarro({ carros: carros.length, choques, vetados, limite });
  };

  const sin = preguntar(delGrupo);
  if (sin === null) return null;
  if (nuevo.libre) {
    const con = preguntar([...delGrupo, { rango: nuevo.rango }]);
    return con === null ? null : { perdida: sin + 1 - con, sin, delGrupo };
  }
  const con = preguntar(delGrupo, nuevo);
  return con === null ? null : { perdida: sin - con, sin, delGrupo };
}

/**
 * ¿Puede lo nuevo tener su carro sin dejar sin carro a una reservación por tipo que hoy sí lo tiene?
 * Devuelve `true`, `false`, o `null` si la búsqueda se pasó de su límite y no se pudo saber.
 */
function cabeEnElTipo(grupo, nuevo, limite) {
  const a = analizar(grupo, nuevo, limite);
  return a === null ? null : a.perdida === 0;
}

/**
 * Lo que apartar un carro (para una reservación) o sacarlo (en un contrato) le hace a las reservaciones que solo
 * piden su TIPO: la misma pregunta de `cabeEnElTipo`, vista desde el carro. Es lo que comparten el formulario de
 * reservaciones y «Sacar carro», para que nunca puedan contestar distinto.
 *
 * - `carroId` y `rango` (`{ desde, hasta }`): el carro que se ocupa y los días.
 * - `excepto`: el id de la reservación que no compite (la que se está editando; o la que esta salida cumple).
 * - `nombrar`: además de si cabe, quiénes son las afectadas (cuesta unas búsquedas más: solo cuando se va a decir).
 *
 * Devuelve `null` cuando no hay nada que preguntar: el carro no está en la flota (uno ajeno), está en el taller
 * (no era una unidad con la que se contaba) o la renta no tiene fechas. Si no, `{ tipo, unidades, cabe }`, con
 * `cabe` verdadero, falso, o `null` si no se pudo saber. Cuando `cabe` es falso y se pidió `nombrar`, trae además
 * `afectadas` (reservaciones, por fecha de salida) y `seguro`:
 *
 * - `seguro` verdadero: ESAS son las que se quedan sin carro, no hay otra forma de acomodarlas.
 * - `seguro` falso: alguna de ellas se queda sin carro, pero cuál depende de cómo se acomoden. Pasa cuando hay
 *   varias que podrían ser, o cuando ya había más reservaciones que carros (entonces no se sabe a quién culpar).
 *
 * Una reservación es «posible afectada» si, sin ella, lo nuevo ya cabe. Si ya estaban todas acomodadas, quienes
 * pueden perder el carro son exactamente esas; si el cupo ya estaba pasado, no se puede decir a quién, y se
 * nombran todas las que entran en la cuenta.
 */
export function reservasQueSeQuedanSinCarro({
  carroId, rango, flota = [], reservas = [], contratos = [], excepto, hoy, nombrar = false, limiteDeBusqueda = LIMITE_DE_PASOS,
}) {
  const delCarro = flota.find((c) => c.id === carroId);
  const tipo = delCarro?.tipo;
  if (!tipo || delCarro.fueraDeServicio || !tieneRango(rango)) return null;

  const grupo = compromisosDelTipo({ tipo, flota, reservas, contratos, excepto, hoy });
  const unidades = grupo.carros.length;
  const nuevo = { carro: grupo.carros.indexOf(delCarro), rango };
  const a = analizar(grupo, nuevo, limiteDeBusqueda);
  if (a === null) return { tipo, unidades, cabe: null };
  if (a.perdida === 0) return { tipo, unidades, cabe: true };
  if (!nombrar) return { tipo, unidades, cabe: false };

  // Sin lo cual lo nuevo cabe: quienes pueden ser la que se quede sin carro. Solo tiene sentido si hoy todas
  // tienen el suyo; con el cupo ya pasado, quitar una no cambia a quién le toca perder.
  let posibles = null;
  if (a.sin === a.delGrupo.length) {
    posibles = [];
    for (const l of a.delGrupo) {
      const sinEsta = analizar({ ...grupo, libres: a.delGrupo.filter((otra) => otra !== l) }, nuevo, limiteDeBusqueda);
      if (sinEsta === null) { posibles = null; break; }
      if (sinEsta.perdida < a.perdida) posibles.push(l);
    }
    if (posibles?.length === 0) posibles = null;
  }
  const nombradas = posibles ?? a.delGrupo;
  const afectadas = nombradas.map((l) => l.reserva).sort((x, y) => diasEntre(y.fechaSalida, x.fechaSalida));
  return {
    tipo, unidades, cabe: false, afectadas, seguro: posibles !== null && posibles.length === a.perdida,
  };
}

/**
 * Los choques de una reservación contra lo que ya está comprometido: otras
 * reservaciones y contratos vivos.
 *
 * Dos casos, porque son preguntas distintas:
 * - Carro exacto ("el Montero blanco"): choca contra ESE carro, si otra
 *   reservación o un contrato lo tienen encima de esas fechas. Y además se
 *   pregunta por las reservaciones que piden solo el tipo de ese carro (la
 *   Ranger, cuando hay una «Pickup» sin carro que ya cuenta con la única pickup):
 *   si apartar este carro deja a una sin unidad, se avisa.
 * - Por tipo ("un microbús"): no hay un carro contra el cual comparar. Lo que
 *   importa es si le cabe uno: cada compromiso que se cruza con estas fechas
 *   (un carro exacto lo tiene ya; uno por tipo toma cualquiera libre) tiene que
 *   quedarse con su carro, y este también. Ver «La capacidad por tipo» arriba.
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
 *
 * `limiteDeBusqueda` (pasos de la búsqueda de asignaciones) existe para las pruebas; con una flota de verdad
 * no se acerca. Si se pasa, el aviso dice que no se pudo comprobar: ni se calla ni inventa un choque.
 */
export function choquesDeReserva({
  reserva, flota = [], reservas = [], contratos = [], hoy, limiteDeBusqueda = LIMITE_DE_PASOS,
}) {
  if (!reserva) return [];

  const rango = rangoDeReserva(reserva);

  if (reserva.carroId) {
    const avisos = [];
    const otraReserva = reservas.find((r) =>
      r?.id !== reserva.id && estadoReserva(r) === 'pendiente' && seCruzan(reserva, r) && r.carroId === reserva.carroId);
    const otroContrato = otraReserva ? null : contratos.find((c) =>
      estadoContrato(c) !== 'cerrado' && seCruzanConContrato(reserva, c, hoy) && c.carroId === reserva.carroId);
    if (otraReserva) {
      avisos.push(alto(`Este carro ya está apartado del ${textoFecha(otraReserva.fechaSalida)} al ${textoFecha(otraReserva.devolucionPrevista)}.`));
    } else if (otroContrato) {
      avisos.push(alto(`Este carro tiene un contrato ${textoDeOcupacion(otroContrato, hoy)}.`));
    }

    // Y lo que apartar este carro le hace a las reservaciones que solo piden su tipo. Con el carro que no está
    // en la flota, o el del taller, no hay unidades de las que contar. La pregunta es la misma que se le hace a
    // «Sacar carro» (reservasQueSeQuedanSinCarro): una sola regla, dos pantallas.
    const efecto = reservasQueSeQuedanSinCarro({
      carroId: reserva.carroId, rango, flota, reservas, contratos, excepto: reserva.id, hoy, limiteDeBusqueda,
    });
    if (efecto?.cabe === null) {
      avisos.push(alto(`No se pudo comprobar si apartar este carro le deja sin unidad a otra reservación de ${efecto.tipo}: hay demasiadas cruzadas. Revisa las de ese tipo.`));
    } else if (efecto?.cabe === false) {
      const cuantas = efecto.unidades;
      const cuantasTienes = cuantas === 1 ? 'es la única que tienes' : `tienes ${cuantas} y los ${cuantas} quedan comprometidos`;
      avisos.push(alto(`Si apartas este carro, otra reservación de ${efecto.tipo} (sin carro elegido) se queda sin unidad en esas fechas: ${cuantasTienes}.`));
    }
    return avisos;
  }

  const tipo = reserva.tipoVehiculo;
  if (!tipo) return [];

  const grupo = compromisosDelTipo({ tipo, flota, reservas, contratos, excepto: reserva.id, hoy });
  const capacidad = grupo.carros.length;

  // Cero es un problema distinto al de "ya no queda": no es que se hayan
  // acabado, es que nunca hubo. Avisar "0 comprometidos de 0" confunde al
  // dueño sobre cuál es el problema de verdad.
  if (capacidad === 0) {
    return [alto(`No tienes ninguna unidad ${tipo} en la flota.`)];
  }
  if (!tieneRango(rango)) return [];

  const cabe = cabeEnElTipo(grupo, { libre: true, rango }, limiteDeBusqueda);
  if (cabe === true) return [];
  if (cabe === null) {
    return [alto(`No se pudo comprobar si te queda un ${tipo} libre en esas fechas: hay demasiadas reservaciones cruzadas. Revisa las de ese tipo.`)];
  }

  // Ninguno de los carros puede quedarse con esta reservación sin dejar a otra sin el suyo: cada uno está
  // comprometido en algún momento de esas fechas. Concordancia en singular/plural, igual que hace
  // avisosDeSalida con "vez"/"veces" — con un solo carro del tipo, "los 1 ya están comprometidos" suena a
  // error de dedo, no a un aviso serio.
  if (capacidad === 1) {
    return [alto(`Solo tienes 1 ${tipo} y ya está comprometido en esas fechas.`)];
  }
  return [alto(`Tienes ${capacidad} ${tipo} y los ${capacidad} ya están comprometidos en esas fechas.`)];
}
