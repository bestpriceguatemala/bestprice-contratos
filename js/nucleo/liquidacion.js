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

/** Los ids de contrato que algún pago a un dueño ya cubrió. */
function idsCubiertos(pagos) {
  const cubiertos = new Set();
  for (const pago of Array.isArray(pagos) ? pagos : []) {
    for (const id of Array.isArray(pago?.contratos) ? pago.contratos : []) {
      if (id) cubiertos.add(id);
    }
  }
  return cubiertos;
}

/**
 * La cuenta con un dueño: tres listas y el total, ya separadas para que la
 * pantalla solo las dibuje.
 *
 * - `porPagar`: cerrados y todavía no cubiertos por un pago. Son los únicos que
 *   suman al total.
 * - `aunNoCierra`: del dueño, sin pagar, pero todavía no cerrados (el carro
 *   sigue afuera, o falta cobrar el saldo, o liberar la garantía). Se ven,
 *   pero no se pueden marcar ni suman.
 * - `pagados`: cubiertos por un pago (`pagos[].contratos` guarda sus ids).
 *   Se revisan primero: un contrato ya pagado sigue pagado aunque después
 *   cambie de estado, y nunca debe volver a sumar.
 *
 * `contratos` ya vienen de un solo dueño. Un contrato de carro propio que se
 * colara no le debe nada a nadie, así que no aparece en ninguna lista.
 */
export function cuentaDeDueno({ contratos, pagos } = {}) {
  const cubiertos = idsCubiertos(pagos);
  const porPagar = [];
  const aunNoCierra = [];
  const pagados = [];

  for (const c of Array.isArray(contratos) ? contratos : []) {
    if (!esDeCarroAjeno(c)) continue;
    if (cubiertos.has(c.id)) pagados.push(c);
    else if (esPagableAlDueno(c)) porPagar.push(c);
    else aunNoCierra.push(c);
  }

  return {
    porPagar,
    aunNoCierra,
    pagados,
    totalPorPagar: suma(...porPagar.map(costoDelSubarriendo)),
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
 *
 * No se adivina que dos textos distintos ('Don Mario', 'Mario López') son la
 * misma persona: quedan como dos grupos, visibles, hasta que el dueño los
 * enlace. Unir a dos personas por error contagiaría una deuda a quien no la
 * tiene; un grupo de más solo es un desorden que se ve.
 *
 * Los contratos de carro propio no forman parte de ningún dueño.
 */
export function agruparPorDueno(contratos, pagos) {
  const grupos = new Map();

  for (const c of Array.isArray(contratos) ? contratos : []) {
    if (!esDeCarroAjeno(c)) continue;
    const duenoId = c.duenoId || null;
    const texto = String(c.carroAjeno?.dueno ?? '').trim();
    // Cada clave lleva su prefijo para que un texto que casualmente se parezca
    // a un id (un dueño escrito como «d1») no se junte con el dueño enlazado.
    const clave = duenoId ? `id:${duenoId}` : `texto:${texto}`;

    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { duenoId, nombre: texto, contratos: [] };
      grupos.set(clave, grupo);
    }
    // Un dueño enlazado puede tener contratos con el texto vacío y otros con
    // él escrito: el primer nombre que aparezca es el respaldo.
    if (!grupo.nombre && texto) grupo.nombre = texto;
    grupo.contratos.push(c);
  }

  return [...grupos.values()]
    .map((g) => ({
      duenoId: g.duenoId,
      nombre: g.nombre || SIN_NOMBRE,
      sinEnlazar: !g.duenoId,
      cuenta: cuentaDeDueno({ contratos: g.contratos, pagos }),
    }))
    // Si dos deben lo mismo, el orden no debe depender de cómo llegaron los
    // contratos: primero por nombre, y a igual nombre el enlazado va antes.
    .sort((a, b) => (
      b.cuenta.totalPorPagar - a.cuenta.totalPorPagar
      || a.nombre.localeCompare(b.nombre, 'es')
      || Number(a.sinEnlazar) - Number(b.sinEnlazar)
    ));
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
  const elegidos = (Array.isArray(contratos) ? contratos : [])
    .filter((c) => c?.id && marcados.has(c.id) && esPagableAlDueno(c));
  return suma(...elegidos.map(costoDelSubarriendo));
}
