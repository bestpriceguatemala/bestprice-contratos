// Qué se le debe a cada empleado de comisión.
//
// La pregunta del dueño es «¿cuánto le debo a cada empleado?». Este archivo la
// contesta sin tocar pantalla, igual que liquidacion.js lo hace con los dueños de
// los carros: la lista, la ficha de uno y el pago le preguntan aquí, una sola vez,
// qué rentas se le pagan y cuánto suman. Ninguna pantalla vuelve a filtrar ni a
// sumar por su cuenta — este proyecto ya perdió muchas vueltas de revisión por
// reglas escritas en dos lugares.
//
// La comisión de CADA renta la calcula `comisionDe` (comision.js, §5 del diseño) y
// aquí no se vuelve a escribir. Lo que este archivo decide es qué hacer con ella:
//
// - SOLO SE PAGA LO FIRME, Y «FIRME» ES UN CONTRATO CERRADO (decisión del dueño, 14 de
//   octubre de 2026: «Lo miro cuando el contrato está cerrado y tengo que pagar
//   quincena o final de mes. Yo decido cuándo lo pago.»). Es la MISMA pregunta con la
//   que se le paga al dueño de un carro ajeno: `estadoContrato(c) === 'cerrado'`
//   (estados.js), que ya exige que el carro haya vuelto, que no se deba saldo y que la
//   garantía esté liberada. Aquí no se vuelve a escribir esa regla, se le pregunta.
//   Ojo con dos preguntas que se parecen y no son la misma: `comisionDe(c).firme` dice si
//   el MONTO ya se conoce (el carro volvió: un día de atraso la sube y un descuento la
//   baja mientras siga afuera) y sirve para decir «estimada» o no; lo que decide si se
//   PAGA es que el contrato cierre. Una renta cuyo carro volvió pero cuyo cliente aún
//   debe tiene su monto, y todavía no se paga.
// - EL PORCENTAJE ES EL DEL CONTRATO, no el que el empleado tiene hoy: se selló el
//   día que se rentó, y subirle el porcentaje a alguien no mueve lo ya ganado.
// - UN 0 % NO SE PAGA, y no es lo mismo que un porcentaje que falta. Wilder, el
//   dueño, no gana comisión: sus rentas salen en `sinComision`, firmes y en cero.
//   Un contrato sin ningún porcentaje legible (`sinPorcentaje`) no se lee como 0 %
//   ni como 5 %: se aparta y se dice, porque un número que falta no es un cero.
import { q, suma } from './dinero.js';
import { comisionDe } from './comision.js';
import { porcentajeAnotado } from './empleado.js';
import { sinIdsRepetidos, pagoAnulado } from './liquidacion.js';
import { estadoContrato } from './estados.js';
import { esFechaISO } from './fechas.js';

// Lo que se lee cuando una renta no trae ningún nombre de empleado. Existe para
// que esa renta tenga un grupo donde aparecer: dejarla fuera sería un monto fuera
// de la vista, que es el error más caro de este archivo.
const SIN_NOMBRE = 'Sin empleado anotado';

/** Orden por código de caracteres: total y siempre igual, sin depender del idioma. */
const porCodigo = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Cómo se llama lo que llegó, para el mensaje de error (`typeof null` es 'object'). */
const queLlego = (valor) => (valor === null ? 'null' : typeof valor);

/**
 * En qué anda la comisión de UNA renta, sin mirar si ya se pagó (eso lo decide la cuenta):
 * - 'estimada': el carro no ha regresado; el monto puede cambiar y no se paga.
 * - 'sin-cerrar': el carro volvió, así que el monto ya se conoce, pero el contrato todavía no cierra (el cliente
 *   debe saldo, o falta liberar la garantía): no se paga todavía. Por qué no cierra lo dice `razonDeNoCierre`
 *   (pantallas/dinero.js), con las mismas palabras de la ficha del dueño de un carro ajeno.
 * - 'sin-porcentaje': el contrato cerró, pero no trae un porcentaje legible; no se sabe cuánto es.
 * - 'sin-comision': cerrado, pero la comisión es Q0.00 (0 % o una base que el descuento se comió).
 * - 'por-pagar': cerrado y con un monto.
 *
 * Le pregunta a `estadoContrato` si cierra y a `comisionDe` cuánto es y si el monto ya se conoce: no mira el campo
 * `estado` guardado (que un sello viejo podría tener atrasado) ni decide «cerrado» por su cuenta.
 */
export function estadoDeComision(contrato) {
  if (estadoContrato(contrato) !== 'cerrado') return comisionDe(contrato).firme ? 'sin-cerrar' : 'estimada';
  if (porcentajeAnotado(contrato?.porcentajeComision) === null) return 'sin-porcentaje';
  return comisionDe(contrato).monto > 0 ? 'por-pagar' : 'sin-comision';
}

/**
 * Los pagos que de verdad cuentan: sin repetidos y sin los anulados (`pagoAnulado`, la misma marca que
 * un pago a un dueño y que uno del cliente). Si el mismo pago llega dos veces —la copia vieja y la que se
 * anuló después—, gana la de `actualizado` más nuevo. LANZA si `pagos` no es una lista o si el `contratos`
 * de algún pago no lo es: «no llegó» no es «nada pagado», o cada renta ya pagada reaparecería como deuda y
 * se le pagaría dos veces a quien ya se le pagó.
 */
function pagosVigentes(pagos) {
  if (!Array.isArray(pagos)) {
    throw new TypeError(
      `comisiones: «pagos» debe ser una lista y llegó ${queLlego(pagos)}. Sin ella no se sabe qué ya se pagó, `
      + 'y suponer que nada está pagado inflaría lo que se le debe a cada empleado.',
    );
  }
  for (const pago of pagos) {
    if (!Array.isArray(pago?.contratos)) {
      throw new TypeError(
        `comisiones: el «contratos» de un pago de comisión debe ser una lista y llegó ${queLlego(pago?.contratos)}. `
        + 'Un pago dañado no se lee como «no cubre nada».',
      );
    }
  }
  return sinIdsRepetidos(pagos).filter((pago) => !pagoAnulado(pago));
}

/**
 * La lista de contratos, o un error si no es una lista. Si `contratos` no llegó (la lectura falló) y aquí
 * se leyera como «no hay ninguno», la pantalla diría «no le debes nada a nadie» con toda confianza, y
 * «estás a mano con todos» es una buena noticia que nadie audita.
 */
function exigirContratos(contratos) {
  if (!Array.isArray(contratos)) {
    throw new TypeError(
      `comisiones: «contratos» debe ser una lista y llegó ${queLlego(contratos)}. Sin ella no se sabe qué se le debe `
      + 'a nadie, y suponer que no hay ninguno diría «no le debes nada» cuando quizá sí.',
    );
  }
  return contratos;
}

/** La fecha en que el carro volvió, para ordenar: el mes en que cuenta la comisión (§5). Vacía si no ha vuelto. */
const regreso = (c) => String(c?.cierre?.fechaReal ?? '');

/** Del que regresó primero al último; a igual día, por número de contrato y por id: el orden no depende de cómo llegaron. */
const porRegreso = (a, b) => (
  porCodigo(regreso(a), regreso(b)) || (Number(a?.numero) || 0) - (Number(b?.numero) || 0) || porCodigo(String(a?.id ?? ''), String(b?.id ?? ''))
);

/** Los que siguen afuera: del que salió primero al último. */
const porSalida = (a, b) => (
  porCodigo(String(a?.fechaSalida ?? ''), String(b?.fechaSalida ?? '')) || (Number(a?.numero) || 0) - (Number(b?.numero) || 0)
  || porCodigo(String(a?.id ?? ''), String(b?.id ?? ''))
);

/**
 * La cuenta con un empleado: las listas y el total, ya separadas para que la pantalla solo las dibuje.
 *
 * - `porPagar`: de contratos CERRADOS, con una comisión mayor que cero y todavía sin pagar. Suman al total y se
 *   pueden marcar. Del que regresó primero al último.
 * - `noFirmes`: del empleado, sin pagar, pero el contrato todavía no cierra: el carro sigue afuera (el monto es un
 *   estimado), o ya volvió y el cliente debe saldo o falta liberar la garantía. Se ven, pero no se pueden marcar ni
 *   suman al total. `estadoDeComision` dice cuál de las dos es.
 * - `pagados`: cubiertos por un pago vigente (`pagos[].contratos` guarda sus ids). Se revisan primero: una renta
 *   ya pagada sigue pagada aunque después cambie, y nunca debe volver a pagarse completa. Un pago ANULADO no
 *   cubre nada: sus rentas vuelven a `porPagar`, y el pago sigue existiendo con su número y su monto.
 * - `sinComision`: cerradas y sin pagar, pero la comisión es Q0.00 (el 0 % de Wilder, o un descuento que se comió
 *   la base). No hay nada que pagarles ni marcar; se cuentan para que no desaparezcan de la vista.
 * - `sinPorcentaje`: cerradas y sin pagar, pero el contrato no trae un porcentaje legible. No se pagan: no se sabe
 *   cuánto es. (Un contrato guardado por «Sacar carro» siempre lo trae; esto es por un documento dañado.)
 * - `totalPorPagar`: lo que suman las `porPagar`, con `comisionDe` y `suma` (que redondea con `q()`).
 * - `totalEstimado`: lo que sumarían las `noFirmes` si cerraran como están. Es aparte a propósito: no es deuda.
 * - `pagosQueCambiaron`: pagos vigentes cuyas rentas hoy suman otra cosa que lo que se pagó (se corrigió un
 *   cierre después de pagar). `{ pago, pagado, ahora, diferencia }`. No afirma nada si el pago cubre una renta
 *   que ya no está en esta cuenta, o si alguna de las que cubre dejó de ser firme: ahí la comparación no es de
 *   lo mismo contra lo mismo. No cambia lo que se debe — decide él qué hacer —, pero tampoco se calla: una
 *   diferencia que nadie ve es plata que se pierde o se paga de más sin saberlo.
 *
 * `pagos` y `contratos` DEBEN ser listas (ver `pagosVigentes` y `exigirContratos`): si no llegaron, esto lanza.
 * Los contratos ya vienen de un solo empleado. Un contrato que llega repetido cuenta una sola vez.
 */
export function cuentaDeEmpleado({ contratos, pagos } = {}) {
  const vigentes = pagosVigentes(pagos);
  const cubiertos = new Set(vigentes.flatMap((p) => p.contratos.filter(Boolean)));
  const todos = sinIdsRepetidos(exigirContratos(contratos));
  const porPagar = [];
  const noFirmes = [];
  const pagados = [];
  const sinComision = [];
  const sinPorcentaje = [];

  for (const c of todos) {
    if (cubiertos.has(c?.id)) { pagados.push(c); continue; }
    const estado = estadoDeComision(c);
    if (estado === 'estimada' || estado === 'sin-cerrar') noFirmes.push(c);
    else if (estado === 'sin-porcentaje') sinPorcentaje.push(c);
    else if (estado === 'sin-comision') sinComision.push(c);
    else porPagar.push(c);
  }

  const montoDe = (c) => comisionDe(c).monto;
  const porId = new Map(todos.filter((c) => c?.id).map((c) => [c.id, c]));
  const pagosQueCambiaron = [];
  for (const pago of vigentes) {
    const ids = [...new Set(pago.contratos.filter(Boolean))];
    const rentas = ids.map((id) => porId.get(id));
    if (!ids.length || rentas.some((c) => !c) || rentas.some((c) => estadoDeComision(c) === 'estimada')) continue;
    const pagado = q(pago.monto);
    const ahora = suma(...rentas.map(montoDe));
    if (ahora !== pagado) pagosQueCambiaron.push({ pago, pagado, ahora, diferencia: suma(ahora, -pagado) });
  }

  return {
    porPagar: porPagar.sort(porRegreso),
    noFirmes: noFirmes.sort(porSalida),
    pagados: pagados.sort(porRegreso),
    sinComision: sinComision.sort(porRegreso),
    sinPorcentaje: sinPorcentaje.sort(porRegreso),
    totalPorPagar: suma(...porPagar.map(montoDe)),
    totalEstimado: suma(...noFirmes.map(montoDe)),
    pagosQueCambiaron,
  };
}

/**
 * Las rentas de la cuenta que NO están pagadas, de cualquier tipo (por pagar, no firmes, sin comisión, sin porcentaje).
 * Es la lista a la que se le puede cambiar el porcentaje al enlazar rentas viejas a un empleado: lo ya pagado no se
 * toca nunca, porque se le pagó a alguien sobre ese porcentaje y cambiarlo después movería lo ya ganado.
 */
export function rentasSinPagar(cuenta) {
  return [...(cuenta?.porPagar ?? []), ...(cuenta?.noFirmes ?? []), ...(cuenta?.sinComision ?? []), ...(cuenta?.sinPorcentaje ?? [])];
}

/**
 * Lo que de verdad entra a un pago cuando se marcan casillas: las rentas por pagar marcadas, con los ids que el
 * pago va a cubrir y lo que suma. Es el único lugar que decide qué cubre un pago y cuánto vale: lo que la pantalla
 * enseña antes de registrar, lo que `construirPagoComision` guarda y lo que se compara al registrar salen de aquí,
 * así que no pueden contradecirse. Una casilla que ya no corresponde a nada (se pagó, el carro aún no vuelve, o es
 * de otra cuenta) simplemente no entra: ni con su dinero ni con su id.
 */
export function elegirParaPagoDeComision(cuenta, idsMarcados) {
  const marcados = new Set(idsMarcados ?? []);
  const rentas = (cuenta?.porPagar ?? []).filter((c) => c?.id && marcados.has(c.id));
  return {
    rentas,
    contratos: [...new Set(rentas.map((c) => c.id))],
    monto: suma(...rentas.map((c) => comisionDe(c).monto)),
  };
}

/**
 * Lo que de la cuenta queda SIN MARCAR: las rentas por pagar que no están entre las marcadas, con los ids y lo que suman.
 * Es el complemento de `elegirParaPagoDeComision` (la misma lista, la otra mitad), para que quien marcó un período vea
 * lo que dejó fuera y su total: él tiene que poder ver que escogió una parte, no creer que escogió todo.
 */
export function sinMarcarDeComision(cuenta, idsMarcados) {
  const marcados = new Set(idsMarcados ?? []);
  const rentas = (cuenta?.porPagar ?? []).filter((c) => c?.id && !marcados.has(c.id));
  return {
    rentas,
    contratos: [...new Set(rentas.map((c) => c.id))],
    monto: suma(...rentas.map((c) => comisionDe(c).monto)),
  };
}

/**
 * La quincena a la que cuenta una fecha: la primera es del 1 al 15 y la segunda del 16 al fin de mes. `null` si no es una
 * fecha de calendario de verdad. Es la regla de «quincena» del dueño y vive solo aquí.
 */
export function quincenaDe(fechaISO) {
  if (!esFechaISO(fechaISO)) return null;
  return { mes: fechaISO.slice(0, 7), quincena: Number(fechaISO.slice(8, 10)) <= 15 ? 1 : 2 };
}

/**
 * Los períodos en que se puede marcar de un clic lo que se le debe a un empleado: por cada mes con algo por pagar, el mes
 * completo y cada una de sus quincenas que tenga algo. El dueño paga por quincena o a fin de mes (14 de octubre de 2026,
 * §5 del diseño) y decide él cuándo: esto no pone plazos ni dice qué lleva sin pagar, solo agrupa lo que hay.
 *
 * Una renta cuenta en el período de la fecha en que regresó el carro (`cierre.fechaReal`, §5: «se cuenta en el mes de esa
 * fecha de devolución»), no en el de la fecha en que cerró el contrato —esa no se guarda—. Así una renta que regresó el 10 y
 * cerró el 18, cuando el cliente pagó, reaparece en la primera quincena aunque ya se haya pagado esa quincena. Solo entran
 * las `porPagar` de la cuenta: nada que no se pueda pagar. Una renta cuya fecha no se lee no cae en ningún período (se sigue
 * pudiendo marcar a mano).
 *
 * Cada período es `{ mes, cuantas, total, contratos, quincenas }`, del mes más viejo al más nuevo; `quincenas` son
 * `{ quincena, cuantas, total, contratos }` (1 o 2). `contratos` son ids, y `total` pasa por `suma`.
 */
export function periodosDePago(cuenta) {
  const porMes = new Map();
  for (const c of cuenta?.porPagar ?? []) {
    const q1 = quincenaDe(c?.cierre?.fechaReal);
    if (!q1 || !c?.id) continue;
    if (!porMes.has(q1.mes)) porMes.set(q1.mes, { 1: [], 2: [] });
    porMes.get(q1.mes)[q1.quincena].push(c);
  }
  const armar = (rentas) => ({
    cuantas: rentas.length,
    total: suma(...rentas.map((c) => comisionDe(c).monto)),
    contratos: rentas.map((c) => c.id),
  });
  return [...porMes.entries()]
    .sort(([a], [b]) => porCodigo(a, b))
    .map(([mes, quincenas]) => ({
      mes,
      ...armar([...quincenas[1], ...quincenas[2]]),
      quincenas: [1, 2].filter((n) => quincenas[n].length).map((n) => ({ quincena: n, ...armar(quincenas[n]) })),
    }));
}

/**
 * Una entrada por empleado, con su cuenta ya armada, de la que más se le debe a la que menos.
 *
 * La clave de agrupación es `empleadoId` cuando el contrato lo trae, y el texto de `rentadoPor` cuando no. Las
 * rentas de antes de que los empleados fueran una lista solo tienen ese texto, y agruparlas por `empleadoId` las
 * dejaría fuera: él vería un total menor de lo que de verdad debe. Es preferible un grupo desordenado a un monto
 * que desaparece.
 *
 * Cada entrada es `{ clave, empleadoId, nombre, sinEnlazar, cuenta }`:
 * - `clave` es la del grupo (`id:<empleadoId>` o `texto:<texto>`): única, y es la que viaja en la dirección de la ficha.
 * - `sinEnlazar` es `true` (y `empleadoId` es `null`) cuando el grupo sale del texto escrito a mano: la señal para
 *   que la pantalla ofrezca enlazarlo a un empleado de la lista.
 * - `nombre` es el que se escribió en el contrato ese día, sin espacios sobrantes. En un grupo enlazado es solo un
 *   respaldo: la pantalla muestra el nombre del registro del empleado. Si hay varios textos, el respaldo es el menor,
 *   no «el del primer contrato», para que no dependa del orden de llegada.
 *
 * No se adivina que «Wilder» a mano y el empleado Wilder son la misma persona, ni que «pedro» y «Pedro» lo son:
 * quedan como grupos aparte, visibles, hasta que él los enlace. Unir a dos personas por error le pagaría a quien no
 * es; un grupo de más solo es un desorden que se ve.
 *
 * `pagos` y `contratos` DEBEN ser listas, y se exige aquí arriba aunque no haya contratos: que lance no debe
 * depender de que ese día haya o no rentas.
 */
export function agruparPorEmpleado(contratos, pagos) {
  pagosVigentes(pagos);
  const grupos = new Map();

  for (const c of sinIdsRepetidos(exigirContratos(contratos))) {
    const empleadoId = c?.empleadoId || null;
    const texto = String(c?.rentadoPor ?? '').trim();
    // Cada clave lleva su prefijo para que un texto que casualmente se parezca a un id (alguien escrito como «e1»)
    // no se junte con el empleado enlazado.
    const clave = empleadoId ? `id:${empleadoId}` : `texto:${texto}`;
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { clave, empleadoId, textos: new Set(), contratos: [] };
      grupos.set(clave, grupo);
    }
    if (texto) grupo.textos.add(texto);
    grupo.contratos.push(c);
  }

  return [...grupos.values()]
    .map((g) => ({
      clave: g.clave,
      empleadoId: g.empleadoId,
      nombre: [...g.textos].sort(porCodigo)[0] || SIN_NOMBRE,
      sinEnlazar: !g.empleadoId,
      cuenta: cuentaDeEmpleado({ contratos: g.contratos, pagos }),
    }))
    // Si dos deben lo mismo, el orden no debe depender de cómo llegaron los contratos: el nombre, y a igual nombre
    // la clave del grupo, que es única y deja al enlazado ('id:') antes que al escrito a mano ('texto:').
    .sort((a, b) => (
      b.cuenta.totalPorPagar - a.cuenta.totalPorPagar
      || a.nombre.localeCompare(b.nombre, 'es')
      || porCodigo(a.clave, b.clave)
    ));
}

/**
 * Lo que se le debe a TODOS los empleados junto: la suma de lo que dice cada cuenta (`totalPorPagar`), sin volver
 * a decidir qué cuenta. LANZA si `cuentas` no es una lista: no convierte «no llegó» en «no se debe nada».
 */
export function totalGeneralDeComisiones(cuentas) {
  if (!Array.isArray(cuentas)) {
    throw new TypeError(
      `comisiones: «cuentas» debe ser una lista y llegó ${queLlego(cuentas)}. Sin ella no se sabe qué se le debe `
      + 'a nadie, y un total en cero diría «no le debes nada» cuando quizá sí.',
    );
  }
  return suma(...cuentas.map((c) => c?.totalPorPagar));
}
