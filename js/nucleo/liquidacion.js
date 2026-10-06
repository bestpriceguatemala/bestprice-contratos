// Qué se le debe a cada dueño de un carro subarrendado.
//
// La pregunta del dueño del negocio es «¿cuánto le debo a Fulano?», y Fulano
// suele tener varios carros. Este archivo la contesta sin tocar pantalla: la
// lista de dueños, la ficha de uno y el comprobante que se imprime le preguntan
// aquí, una sola vez, qué contratos se le pagan y cuánto suman. Ninguna
// pantalla vuelve a filtrar ni a sumar por su cuenta — este proyecto ya perdió
// cinco vueltas de revisión por reglas escritas en dos lugares.
//
// Solo se le paga al dueño de un contrato ya CERRADO (diseño de liquidación,
// §2 y §3). Un contrato abierto todavía puede cambiar de monto — días de
// atraso, daños — y pagarle antes sería pagar sobre una cifra que se mueve.
import { suma } from './dinero.js';
import { resumen } from './contrato.js';
import { estadoContrato } from './estados.js';

// Lo que se lee cuando un contrato de carro ajeno no trae ningún nombre de
// dueño. Existe para que ese contrato tenga un grupo donde aparecer: sin él
// habría que dejarlo fuera, y un monto fuera de la vista es el error más caro
// de este archivo.
const SIN_NOMBRE = 'Sin dueño anotado';

/** Orden por código de caracteres: total y siempre igual, sin depender del idioma. */
const porCodigo = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * ¿Es un contrato de carro ajeno? Se pregunta por `ajeno`, la marca que
 * escribe "Sacar carro" (construirContrato), y no por `subarriendo`: el costo
 * del dueño se va a mover a `privado/dinero` y `subarriendo` deja de ser una
 * señal confiable de que el carro es ajeno.
 */
function esDeCarroAjeno(c) {
  return Boolean(c?.ajeno);
}

/**
 * Lo que costó el subarriendo: costo por día del dueño × (días + días de
 * atraso). Los días de atraso también se le pagan: el carro estuvo fuera esos
 * días. Nunca negativo, y 0 para un carro propio o sin costo por día.
 *
 * No repite la fórmula: la toma de `resumen()`, que ya la usa para la
 * utilidad del contrato. Si vivieran dos copias, el día que cambie de dónde se
 * lee el costo por día (ADR-002) una de las dos se quedaría atrás y el dueño
 * vería una utilidad y una deuda calculadas sobre costos distintos.
 */
export function costoDelSubarriendo(contrato) {
  return Math.max(0, resumen(contrato).costoSubarriendo);
}

/**
 * ¿Se le puede pagar al dueño por este contrato? Sí cuando es de carro ajeno
 * y `estadoContrato` dice 'cerrado'.
 *
 * Le pregunta a `estadoContrato` en vez de decidir "cerrado" por su cuenta:
 * cerrado ya exige saldo saldado y garantía liberada, y esa regla tiene un
 * solo dueño (estados.js). Es lo que el dueño del negocio pidió con sus
 * palabras: solo paga de contratos «ya cerrados con el precio final».
 */
export function esPagableAlDueno(contrato) {
  return esDeCarroAjeno(contrato) && estadoContrato(contrato) === 'cerrado';
}

/** Cómo se llama lo que llegó, para el mensaje de error (`typeof null` es 'object'). */
const queLlego = (valor) => (valor === null ? 'null' : typeof valor);

/**
 * Los ids de contrato que algún pago a un dueño ya cubrió.
 *
 * LANZA si `pagos` no es una lista, o si el `contratos` de algún pago no lo es.
 * No devuelve un conjunto vacío «por si acaso»: vacío y fallido no son lo
 * mismo. Si la lectura de `pagosDueno` falló y aquí se leyera como «nadie ha
 * cobrado», cada contrato ya pagado reaparecería como deuda y el dueño del
 * negocio le pagaría dos veces a quien ya le pagó. Una función del núcleo no
 * puede saber si la lectura falló, así que no adivina: un error fuerte se ve
 * y se arregla, una deuda inflada en silencio se paga. (La misma regla que
 * evitó pintar una lectura fallida de la flota como «todos disponibles».)
 *
 * Una lista vacía sí es válida: significa que no se le ha pagado a nadie.
 */
function idsCubiertos(pagos) {
  if (!Array.isArray(pagos)) {
    throw new TypeError(
      `liquidacion: «pagos» debe ser una lista y llegó ${queLlego(pagos)}. Sin ella no se sabe qué ya se pagó, `
      + 'y suponer que nada está pagado inflaría lo que se le debe a cada dueño.',
    );
  }
  const cubiertos = new Set();
  for (const pago of pagos) {
    if (!Array.isArray(pago?.contratos)) {
      throw new TypeError(
        `liquidacion: el «contratos» de un pago a dueño debe ser una lista y llegó ${queLlego(pago?.contratos)}. `
        + 'Un pago dañado no se lee como «no cubre nada».',
      );
    }
    for (const id of pago.contratos) {
      if (id) cubiertos.add(id);
    }
  }
  return cubiertos;
}

/**
 * La lista de contratos, o un error si no es una lista. Es la otra mitad de
 * `idsCubiertos` y la que más importa no ablandar.
 *
 * Si `contratos` no llegó (la lectura falló) y aquí se leyera como «no hay
 * ninguno», la pantalla diría «no le debes nada a nadie» con toda confianza. Un
 * total inflado hace que el dueño del negocio se detenga y revise, porque más o
 * menos sabe cuánto debe; «estás a mano con todos» es una buena noticia y las
 * buenas noticias nadie las audita: cerraría la pantalla tranquilo y un dueño
 * se quedaría sin su pago un mes. El silencio es la dirección peligrosa. Por
 * eso no se devuelve `[]` por cortesía: que alguien lo «arregle» a un valor por
 * defecto amable es volver a poner el error donde más cuesta.
 *
 * Una lista vacía de verdad sí es válida: no hay contratos de carro ajeno.
 */
function exigirContratos(contratos) {
  if (!Array.isArray(contratos)) {
    throw new TypeError(
      `liquidacion: «contratos» debe ser una lista y llegó ${queLlego(contratos)}. Sin ella no se sabe qué se le debe `
      + 'a nadie, y suponer que no hay ninguno diría «no le debes nada» cuando quizá sí.',
    );
  }
  return contratos;
}

/**
 * La lista de contratos sin ids repetidos (M3 de la revisión de las Tareas 6 y 7,
 * y Minor 1 de la de la Tarea 8): un contrato que llega dos veces — una pantalla
 * que junta dos lecturas de rangos de fechas que se traslapan — contaría doble en
 * el total y dos veces en la lista de rentas, y la cifra que se ve no coincidiría
 * con la deuda (con `[M1, M2, M1]` la lista decía «3 · Q4,200.00» sobre una deuda
 * de Q3,000.00 en dos rentas, sin la marca de «incompleto»). Se quitan AQUÍ, en
 * la cuenta, que es lo que se ve y lo que se paga: así la pantalla, el pago y el
 * comprobante parten de las mismas rentas.
 *
 * De dos copias del mismo id queda la de `actualizado` más nuevo (la regla de
 * `mezclar`, cache.js; si empatan, la primera), en el lugar de la primera
 * aparición. Los que no traen id pasan tal cual: no se pueden marcar, así que no
 * pueden entrar a un pago.
 *
 * Una lista que no es lista se devuelve igual: quien lanza es `exigirContratos`.
 */
export function sinIdsRepetidos(contratos) {
  if (!Array.isArray(contratos)) return contratos;
  const lugarDe = new Map();
  const lista = [];
  for (const c of contratos) {
    if (!c?.id) {
      lista.push(c);
    } else if (!lugarDe.has(c.id)) {
      lugarDe.set(c.id, lista.length);
      lista.push(c);
    } else if (Number(c.actualizado || 0) > Number(lista[lugarDe.get(c.id)].actualizado || 0)) {
      lista[lugarDe.get(c.id)] = c;
    }
  }
  return lista;
}

/**
 * Los pagos de una cuenta, juntos por las rentas que comparten, y lo que sus
 * rentas suman HOY contra lo que esos pagos suman. Es la pregunta que el
 * comprobante ya se hacía por su cuenta (`totalSeleccionado(rentas) !== pago.monto`),
 * hecha aquí una sola vez para que la ficha, la lista y el papel la contesten igual.
 *
 * Un pago normal es un grupo de un solo pago. Un grupo tiene más de uno cuando
 * se pagó una diferencia (ver `cuentaDeDueno`): ese segundo pago cubre las mismas
 * rentas que el primero, así que los dos son UNA misma deuda que se fue pagando
 * en dos partes, y se comparan juntos contra lo que esas rentas cuestan ahora.
 * Comparar cada pago por separado haría que el primero siguiera «debiendo» para
 * siempre aunque la diferencia ya se hubiera pagado.
 *
 * Cada grupo es `{ contratos, pagos, pagado, ahora, cierra, diferencia }`:
 * - `contratos`: las rentas de ESTA cuenta que esos pagos cubren.
 * - `pagos`: del más antiguo al más nuevo (por número de comprobante).
 * - `pagado`: lo que suman los `monto` guardados.
 * - `ahora`: lo que esas rentas cuestan hoy, con `costoDelSubarriendo` — la
 *   misma fórmula de siempre — y SIN preguntar si están cerradas. Si una renta
 *   se reabrió porque se corrigió su cierre y el cliente todavía no paga los
 *   días de más, el dueño del carro ya tiene derecho a ellos: no verlos hasta
 *   que el cliente pague sería leer como cero una deuda que ya existe.
 * - `cierra`: si TODAS esas rentas están cerradas (`esPagableAlDueno`). De esto
 *   depende solo si la diferencia se puede pagar ya, igual que una renta
 *   cualquiera: solo se paga lo cerrado.
 * - `diferencia`: `ahora - pagado`. Positiva es deuda nueva con el dueño del
 *   carro; negativa, que se le pagó de más, y eso no es una deuda.
 *
 * Un pago que llega repetido (misma `id`) cuenta una sola vez: si contara dos,
 * `pagado` se inflaría y una deuda real se leería como saldada.
 */
function gruposDePago(contratos, pagos) {
  const porId = new Map(contratos.filter((c) => c?.id).map((c) => [c.id, c]));
  const padre = new Map();
  const raiz = (id) => {
    let r = id;
    while (padre.get(r) !== r) r = padre.get(r);
    return r;
  };
  const relevantes = [];
  for (const pago of sinIdsRepetidos(pagos)) {
    const ids = [...new Set(pago.contratos)].filter((id) => porId.has(id));
    if (ids.length === 0) continue;
    relevantes.push({ pago, ids });
    for (const id of ids) if (!padre.has(id)) padre.set(id, id);
    for (const id of ids.slice(1)) padre.set(raiz(id), raiz(ids[0]));
  }

  const grupos = new Map();
  for (const { pago, ids } of relevantes) {
    const clave = raiz(ids[0]);
    if (!grupos.has(clave)) grupos.set(clave, { ids: new Set(), pagos: [] });
    const grupo = grupos.get(clave);
    for (const id of ids) grupo.ids.add(id);
    grupo.pagos.push(pago);
  }

  return [...grupos.values()].map((g) => {
    const enGrupo = contratos.filter((c) => c?.id && g.ids.has(c.id));
    const ordenados = [...g.pagos].sort((a, b) => (
      (Number(a.numero) || 0) - (Number(b.numero) || 0) || porCodigo(String(a.id ?? ''), String(b.id ?? ''))
    ));
    const pagado = suma(...ordenados.map((p) => p.monto));
    const ahora = suma(...enGrupo.map(costoDelSubarriendo));
    return {
      contratos: enGrupo,
      pagos: ordenados,
      pagado,
      ahora,
      cierra: enGrupo.every(esPagableAlDueno),
      diferencia: suma(ahora, -pagado),
    };
  }).sort((a, b) => (
    (Number(a.pagos[0].numero) || 0) - (Number(b.pagos[0].numero) || 0)
    || porCodigo(a.contratos[0].id, b.contratos[0].id)
  ));
}

/**
 * La cuenta con un dueño: las listas y el total, ya separadas para que la
 * pantalla solo las dibuje.
 *
 * - `porPagar`: cerrados y todavía no cubiertos por un pago. Suman al total.
 * - `aunNoCierra`: del dueño, sin pagar, pero todavía no cerrados (el carro
 *   sigue afuera, o falta cobrar el saldo, o liberar la garantía). Se ven,
 *   pero no se pueden marcar ni suman.
 * - `pagados`: cubiertos por un pago (`pagos[].contratos` guarda sus ids).
 *   Se revisan primero: un contrato ya pagado sigue pagado aunque después
 *   cambie de estado, y nunca debe volver a pagarse completo.
 * - `diferencias`: lo que se le debe de más por rentas YA PAGADAS cuyo monto
 *   creció después del pago (se corrigió el cierre y el carro estuvo más días
 *   afuera). Una por grupo de pagos (ver `gruposDePago`):
 *   `{ clave, contratos, pagos, pagado, ahora, diferencia }`, con `diferencia`
 *   siempre positiva. Suman al total y se pueden marcar para pagarlas.
 *
 *   NO se doblan dentro del pago original: el comprobante de ese pago ya está
 *   en manos del dueño del carro y dice otra cifra, y cambiarlo a escondidas
 *   no le diría a nadie que hay algo nuevo. La diferencia es una deuda aparte,
 *   que se paga con su propio pago (y su propio comprobante) sobre las mismas
 *   rentas, y entonces el grupo vuelve a cuadrar.
 *
 *   Esta es la dirección peligrosa: un monto que BAJA después de pagado no le
 *   debe nada a nadie (se pagó de más), pero uno que SUBE se leía como Q0.00 —
 *   una deuda real que nadie ve, porque «estás a mano» es una buena noticia y
 *   las buenas noticias nadie las audita. Solo las que suben aparecen aquí.
 * - `diferenciasSinCerrar`: lo mismo, cuando alguna de las rentas del grupo no
 *   está cerrada (se corrigió el cierre y el cliente todavía debe los días de
 *   más). Se ven, pero no se pueden marcar ni suman al total, igual que
 *   `aunNoCierra`: todavía puede cambiar de monto.
 * - `totalDiferencias`: lo que suman `diferencias`, para quien tenga que decir
 *   cuánto de `totalPorPagar` viene de ahí y no lo sume por su cuenta.
 * - `gruposDePago`: todos los grupos de pagos de la cuenta, con o sin
 *   diferencia, para quien necesite saber qué otros pagos comparten rentas con
 *   uno (el comprobante).
 * - `totalPorPagar`: lo que se le debe AHORA: las rentas por pagar más las
 *   diferencias. Una sola cifra, para que ninguna pantalla se olvide de sumar
 *   la mitad.
 * - `sinCostoAnotado`: ids de los contratos (de cualquiera de las tres
 *   listas, en el orden en que llegaron) cuyo costo por día del dueño es 0.
 *   El campo de costo no es obligatorio: vacío queda en 0, y la fila diría
 *   «Q0.00» igual que un costo de verdad en cero. Con esto la pantalla puede
 *   decir «sin costo anotado» en vez de pasar por buena una cifra que nadie
 *   escribió. El contrato sigue en su lista y no cambia el total.
 *
 * `pagos` y `contratos` DEBEN ser listas (ver `idsCubiertos` y
 * `exigirContratos`): si no llegaron, esto lanza. Pagos ausentes contarían como
 * «sin pagar» lo que quizá ya se pagó; contratos ausentes dirían «no se le debe
 * nada» a quien quizá sí se le debe.
 *
 * `contratos` ya vienen de un solo dueño. Un contrato de carro propio que se
 * colara no le debe nada a nadie, así que no aparece en ninguna lista. Un
 * contrato que llegue repetido cuenta una sola vez (ver `sinIdsRepetidos`).
 */
export function cuentaDeDueno({ contratos, pagos } = {}) {
  const cubiertos = idsCubiertos(pagos);
  const porPagar = [];
  const aunNoCierra = [];
  const pagados = [];
  const sinCostoAnotado = [];
  const ajenos = [];

  for (const c of sinIdsRepetidos(exigirContratos(contratos))) {
    if (!esDeCarroAjeno(c)) continue;
    ajenos.push(c);
    // Se pregunta por el costo ya calculado, no por `subarriendo.costoDia`:
    // así, cuando el costo se mueva a `privado/dinero` (ADR-002), esta marca
    // lo sigue sin que nadie la toque.
    if (costoDelSubarriendo(c) === 0) sinCostoAnotado.push(c.id);
    if (cubiertos.has(c.id)) pagados.push(c);
    else if (esPagableAlDueno(c)) porPagar.push(c);
    else aunNoCierra.push(c);
  }

  const grupos = gruposDePago(ajenos, pagos);
  // Con los ids de las rentas en la clave, y no con los de los pagos: no cambia
  // cuando se paga una parte, y no se parece a ningún id de contrato (para marcarla
  // en la misma lista que las rentas).
  const comoDiferencia = (g) => ({
    clave: `dif:${g.contratos.map((c) => c.id).sort(porCodigo).join('+')}`,
    contratos: g.contratos,
    pagos: g.pagos,
    pagado: g.pagado,
    ahora: g.ahora,
    diferencia: g.diferencia,
  });
  const crecidos = grupos.filter((g) => g.diferencia > 0);
  const diferencias = crecidos.filter((g) => g.cierra).map(comoDiferencia);
  const diferenciasSinCerrar = crecidos.filter((g) => !g.cierra).map(comoDiferencia);
  const totalDiferencias = suma(...diferencias.map((d) => d.diferencia));

  return {
    porPagar,
    aunNoCierra,
    pagados,
    diferencias,
    diferenciasSinCerrar,
    gruposDePago: grupos,
    totalDiferencias,
    totalPorPagar: suma(...porPagar.map(costoDelSubarriendo), totalDiferencias),
    sinCostoAnotado,
  };
}

/**
 * Una entrada por dueño, con su cuenta ya armada, de la que más se le debe a
 * la que menos.
 *
 * La clave de agrupación es `duenoId` cuando el contrato lo trae, y el texto
 * de `carroAjeno.dueno` cuando no. Los contratos de antes de que los dueños
 * fueran una lista solo tienen ese texto, y agruparlos por `duenoId` los
 * dejaría a todos fuera: el dueño del negocio vería un total menor de lo que
 * de verdad debe y creería estar a mano con alguien a quien todavía le debe.
 * Es preferible un grupo desordenado a un monto que desaparece.
 *
 * Cada entrada es `{ duenoId, nombre, sinEnlazar, cuenta }`:
 * - `sinEnlazar` es `true` (y `duenoId` es `null`) cuando el grupo sale del
 *   texto escrito a mano: es la señal para que la pantalla ofrezca enlazarlo
 *   a un dueño de la lista.
 * - `nombre` es el que se escribió en el contrato ese día, tal cual pero sin
 *   espacios sobrantes. En un grupo enlazado es solo un respaldo: la pantalla
 *   muestra el nombre del registro del dueño, que es el que se puede corregir.
 *   Si el mismo dueño tiene varios textos escritos, el respaldo es el menor de
 *   ellos, no «el del primer contrato»: así no cambia con el orden en que
 *   llegaron los contratos, y con él no cambia el lugar del dueño en la lista.
 *
 * No se adivina que dos textos distintos ('Don Mario', 'Mario López') son la
 * misma persona: quedan como dos grupos, visibles, hasta que el dueño los
 * enlace. Unir a dos personas por error contagiaría una deuda a quien no la
 * tiene; un grupo de más solo es un desorden que se ve.
 *
 * Los contratos de carro propio no forman parte de ningún dueño.
 *
 * `pagos` y `contratos` DEBEN ser listas, igual que en `cuentaDeDueno`, y se
 * exige aquí arriba aunque no haya contratos: que lance no debe depender de que
 * ese día haya o no subarriendos. Una lista vacía de verdad da `[]`; una que no
 * llegó lanza, porque `[]` aquí significaría «no le debes a nadie».
 */
export function agruparPorDueno(contratos, pagos) {
  idsCubiertos(pagos);
  const grupos = new Map();

  // Antes de repartir, y no solo dentro de cada cuenta: el mismo contrato entregado
  // dos veces con dueño distinto (una copia ya enlazada y otra vieja) caería en dos
  // grupos, y quedaría contado en los dos.
  for (const c of sinIdsRepetidos(exigirContratos(contratos))) {
    if (!esDeCarroAjeno(c)) continue;
    const duenoId = c.duenoId || null;
    const texto = String(c.carroAjeno?.dueno ?? '').trim();
    // Cada clave lleva su prefijo para que un texto que casualmente se parezca
    // a un id (un dueño escrito como «d1») no se junte con el dueño enlazado.
    const clave = duenoId ? `id:${duenoId}` : `texto:${texto}`;

    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { clave, duenoId, textos: new Set(), contratos: [] };
      grupos.set(clave, grupo);
    }
    // Un dueño enlazado puede tener contratos con el texto vacío y otros con
    // él escrito, o escrito de varias maneras: se juntan todos para escoger
    // el respaldo sin depender de cuál contrato llegó primero.
    if (texto) grupo.textos.add(texto);
    grupo.contratos.push(c);
  }

  return [...grupos.values()]
    .map((g) => ({
      clave: g.clave,
      duenoId: g.duenoId,
      nombre: [...g.textos].sort(porCodigo)[0] || SIN_NOMBRE,
      sinEnlazar: !g.duenoId,
      cuenta: cuentaDeDueno({ contratos: g.contratos, pagos }),
    }))
    // Si dos deben lo mismo, el orden no debe depender de cómo llegaron los
    // contratos. Primero el nombre; y a igual nombre, la clave del grupo, que
    // es única y siempre distinta entre dos grupos: empieza con 'id:' (dueño
    // enlazado, y trae su duenoId) o con 'texto:' (escrito a mano), así que a
    // igual nombre el enlazado va antes. Sin esa última llave, dos dueños con
    // el mismo nombre y el mismo total saltarían de lugar entre una pantalla
    // y la siguiente. `porCodigo` y no `localeCompare`: este último da 0 para
    // textos distintos que se ven igual (una «é» escrita de dos maneras), y
    // un 0 es justo el empate que hay que romper.
    .sort((a, b) => (
      b.cuenta.totalPorPagar - a.cuenta.totalPorPagar
      || a.nombre.localeCompare(b.nombre, 'es')
      || porCodigo(a.clave, b.clave)
    ))
    .map(({ clave, ...entrada }) => entrada);
}

/**
 * Lo que suman los contratos marcados con casilla, para mostrarlo a la vista
 * antes de registrar el pago.
 *
 * La pantalla le pasa `cuenta.porPagar`. Aun así, un contrato que todavía no
 * cierra nunca entra a la suma aunque alguien lo marque: pagarle al dueño
 * sobre una cifra que todavía se mueve es justo lo que el dueño del negocio
 * pidió no hacer. `idsMarcados` puede ser un arreglo o un Set.
 */
export function totalSeleccionado(contratos, idsMarcados) {
  const marcados = new Set(idsMarcados ?? []);
  if (marcados.size === 0) return 0;
  const elegidos = sinIdsRepetidos(Array.isArray(contratos) ? contratos : [])
    .filter((c) => c?.id && marcados.has(c.id) && esPagableAlDueno(c));
  return suma(...elegidos.map(costoDelSubarriendo));
}

/**
 * Lo que de verdad entra a un pago cuando se marcan casillas: las rentas
 * cerradas por pagar y las diferencias (por su `clave`), con los ids de contrato
 * que el pago va a cubrir y lo que suma. `cuenta` es la de `cuentaDeDueno`.
 *
 * Es el único lugar que decide qué cubre un pago y cuánto vale: lo que la
 * pantalla enseña antes de registrar, lo que `construirPagoDueno` guarda y lo
 * que `registrarElPago` compara contra lo que él vio salen de aquí, así que no
 * pueden contradecirse. Una casilla que ya no corresponde a nada (se pagó, o
 * dejó de ser pagable) simplemente no entra: ni con su dinero ni con su id.
 *
 * `contratos` sale sin repetidos, y para una diferencia trae los ids de TODAS
 * las rentas de su grupo: el pago de la diferencia cubre las mismas rentas que el
 * pago original, y por eso el grupo vuelve a cuadrar (ver `gruposDePago`).
 * `monto` pasa por `suma`, que redondea con `q()`.
 */
export function elegirParaPago(cuenta, idsMarcados) {
  const marcados = new Set(idsMarcados ?? []);
  const rentas = (cuenta?.porPagar ?? []).filter((c) => c?.id && marcados.has(c.id));
  const diferencias = (cuenta?.diferencias ?? []).filter((d) => marcados.has(d.clave));
  const contratos = [...new Set([
    ...rentas.map((c) => c.id),
    ...diferencias.flatMap((d) => d.contratos.map((c) => c.id)),
  ])];
  return {
    rentas,
    diferencias,
    contratos,
    monto: suma(totalSeleccionado(rentas, rentas.map((c) => c.id)), ...diferencias.map((d) => d.diferencia)),
  };
}

/**
 * Lo que se le debe a TODOS los dueños junto: la suma de lo que dice cada cuenta
 * (`totalPorPagar`), sin volver a decidir qué cuenta. Recibe las cuentas de
 * `cuentaDeDueno`, no los contratos: un solo lugar sabe qué se debe, y este
 * total no puede salir distinto de la suma de los renglones que se ven.
 *
 * LANZA si `cuentas` no es una lista: igual que el resto de este archivo, no
 * convierte «no llegó» en «no se debe nada». Una lista vacía de verdad da 0.
 */
export function totalGeneral(cuentas) {
  if (!Array.isArray(cuentas)) {
    throw new TypeError(
      `liquidacion: «cuentas» debe ser una lista y llegó ${queLlego(cuentas)}. Sin ella no se sabe qué se le debe `
      + 'a nadie, y un total en cero diría «no le debes nada» cuando quizá sí.',
    );
  }
  return suma(...cuentas.map((c) => c?.totalPorPagar));
}
