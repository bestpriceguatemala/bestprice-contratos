// Del sistema a las hojas de su Excel: qué campo (§7b del diseño) va en qué columna.
//
// Esto es solo traducir de un lado al otro, y se dice abajo en cada columna. NINGUNA regla de negocio vive aquí:
//   - los totales no se recalculan para la hoja. La renta sale de `lineasSalida`, la hora tardía de `horaTardiaDe`,
//     el saldo y la garantía de `resumen` y `garantiaPorLiberar`. Los totales de la hoja (SUBTOTAL, TOTAL COBRADO,
//     UTILIDAD…) son SUS fórmulas, que siguen en el archivo y se calculan al abrirlo.
//   - el recargo de tarjeta, el atraso, los seguros por día: nada de eso se calcula aquí; son las fórmulas de su hoja.
//
// Lo que su hoja no tiene dónde guardar no se mete en la columna que más se le parece: se anota en COMENTARIOS (CA) con
// el monto y la razón, o se lista en `NO_SE_RESPALDA`. Un dato en la columna equivocada es peor que un dato ausente que
// se dice que está ausente.
import {
  q, suma, recargoTarjeta, textoConQ,
} from '../nucleo/dinero.js';
import {
  lineasSalida, horaTardiaDe, resumen, conKmSalidaNormalizado,
} from '../nucleo/contrato.js';
import { garantiaPorLiberar, yaVolvio } from '../nucleo/estados.js';
import { nombresResueltos } from '../nucleo/cliente.js';
import { pagoAnulado } from '../nucleo/liquidacion.js';
import { serialDeFecha, fraccionDeHora } from './hojas.js';
import { CAPACIDAD, cuantasCaben } from './diseno.js';

/** Un error que se le dice al dueño tal cual: no se arma el archivo. */
export class ErrorDeRespaldo extends Error {}

const aTexto = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
/** Un monto o cantidad: el número redondeado con q(), o vacío si es cero (su hoja lee «vacío» y «0» igual con N()). */
const aMonto = (v) => {
  const n = q(v);
  return n === 0 ? null : n;
};

/** Ordena por el texto, en español y sin distinguir mayúsculas ni acentos. */
const porTexto = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });

// ---------------------------------------------------------------------------
// Lo que el archivo NO lleva
// ---------------------------------------------------------------------------

/**
 * Lo que existe en el sistema y no tiene dónde ir en su Excel. Se le dice en la pantalla donde baja el archivo: que
 * sepa que NO es una copia de todo, sino su Excel de trabajo.
 */
export const NO_SE_RESPALDA = [
  'Las reservaciones y el calendario (su Excel no tiene una hoja para ellas).',
  'Las comisiones de los empleados y sus pagos.',
  'Los pagos al dueño de cada carro ajeno (solo queda si cada renta está pagada al dueño o no, y la fecha).',
  'Las fichas de los dueños de carros ajenos (teléfono, NIT y nota): su hoja solo guarda el nombre.',
  'Los abonos de cada pago de las rentas, uno por uno: la hoja guarda la forma de pago y el porcentaje de tarjeta; si fueron varios, el detalle va en COMENTARIOS.',
  'Si un carro de la flota está fuera de servicio y por qué.',
  // Los servicios (`servicios[]`) y los intervalos (`intervalos{}`) viven dentro de cada carro, y su hoja VEHICULOS tiene siete columnas
  // (placas, tipo, marca y línea, color, modelo, propiedad, dueño) y ninguna donde guardarlos. Estaba dicho solo en §10 del diseño; un
  // respaldo cuyos huecos solo se documentan en un archivo de diseño es un respaldo cuyos huecos nadie conoce hasta el día que lo necesita.
  'El mantenimiento de la flota (la pantalla Mantenimiento): los servicios que se le han hecho a cada carro y cada cuánto le toca cada uno. Su hoja VEHICULOS no tiene dónde guardarlos.',
];

// ---------------------------------------------------------------------------
// CLIENTES
// ---------------------------------------------------------------------------

/**
 * Columna de CLIENTES → cómo se saca del cliente. `fecha` pasa por serialDeFecha.
 *
 * Su hoja parte el nombre en cuatro columnas (1er apellido, 2do apellido, 1er nombre, 2do nombre); el sistema guarda
 * `apellidos` y `nombres` enteros. NO se adivina dónde cortar «María del Carmen López de Pérez»: los apellidos enteros
 * van en la columna del 1er apellido y los nombres enteros en la del 1er nombre, y las del 2do quedan vacías. Su hoja
 * los junta igual (BUSCAR y CONTRATOS concatenan las cuatro).
 */
const COLUMNAS_DE_CLIENTE = [
  ['B', (c) => nombresResueltos(c).apellidos],
  ['D', (c) => nombresResueltos(c).nombres],
  ['F', (c) => c.nacionalidad], // ya no se pide en la ficha, pero los clientes que vinieron del Excel la traen
  ['G', (c) => ({ fecha: c.fechaNacimiento })],
  ['H', (c) => c.documento],
  ['I', (c) => c.documentoExtendidoEn],
  ['J', (c) => ({ fecha: c.documentoExpira })],
  ['K', (c) => c.licencia],
  ['L', (c) => c.licenciaEmitidaEn],
  ['M', (c) => ({ fecha: c.licenciaExpira })],
  ['N', (c) => c.direccionReferencia],
  ['O', (c) => c.municipio],
  ['Q', (c) => c.pais], // columna oculta en su hoja; el dato viejo se conserva
  ['R', (c) => c.telefono],
  ['S', (c) => c.correo],
  ['T', (c) => c.direccionAdicional],
  ['U', (c) => c.ciudadAdicional],
  ['V', (c) => c.estadoAdicional],
  ['W', (c) => c.paisAdicional],
  ['X', (c) => c.telefonoAdicional],
];

/** El texto por el que se ordena y se agrupa un cliente. */
const nombreParaOrdenar = (c) => {
  const { nombres, apellidos } = nombresResueltos(c);
  return `${apellidos} ${nombres}`.trim();
};

// ---------------------------------------------------------------------------
// Armado de las tres hojas
// ---------------------------------------------------------------------------

function valorDe(extraido, contexto) {
  if (extraido && typeof extraido === 'object' && 'fecha' in extraido) {
    const iso = aTexto(extraido.fecha);
    if (!iso) return null;
    const serial = serialDeFecha(iso);
    if (serial === null) contexto.avisos.push(`${contexto.donde}: la fecha «${iso}» no se puede escribir en Excel y quedó en blanco.`);
    return serial;
  }
  if (extraido && typeof extraido === 'object' && 'hora' in extraido) {
    const texto = aTexto(extraido.hora);
    if (!texto) return null;
    const fraccion = fraccionDeHora(texto);
    if (fraccion === null) contexto.avisos.push(`${contexto.donde}: la hora «${texto}» no se entiende y quedó en blanco.`);
    return fraccion;
  }
  if (typeof extraido === 'number') return aMonto(extraido);
  return aTexto(extraido);
}

function clientesDelArchivo(clientes, contratos, avisos) {
  const cupo = cuantasCaben('clientes');
  const conRenta = new Set(contratos.map((c) => c.clienteId).filter(Boolean));
  let incluidos = clientes;
  let fuera = 0;
  if (clientes.length > cupo) {
    // Cabe lo que cabe, y lo que no se dice: primero los clientes de las rentas de este año (sin ellos las rentas no
    // encuentran a su cliente), después los demás, los últimos que se tocaron primero.
    const recientes = (c) => Number(c.actualizado || 0);
    const orden = [...clientes].sort((a, b) => (conRenta.has(b.id) - conRenta.has(a.id)) || (recientes(b) - recientes(a)));
    incluidos = orden.slice(0, cupo);
    fuera = clientes.length - cupo;
    avisos.push(`No cupieron ${fuera} cliente${fuera === 1 ? '' : 's'}: la hoja CLIENTES de su Excel tiene ${cupo} filas. Se dejaron los de las rentas de este año y, de los demás, los que se tocaron más recientemente.`);
  }
  // Orden alfabético: es el orden en que se buscan en una hoja de 2,000 filas, y es estable aunque el sistema no
  // tenga un código de cliente (el código de su hoja es la posición de la fila).
  const ordenados = [...incluidos].sort((a, b) => porTexto(nombreParaOrdenar(a), nombreParaOrdenar(b)) || porTexto(a.id ?? '', b.id ?? ''));
  return { ordenados, fuera };
}

function armarClientes(ordenados, avisos) {
  const celdas = [];
  const codigoDe = new Map();
  ordenados.forEach((cliente, i) => {
    const fila = CAPACIDAD.clientes.primera + i;
    codigoDe.set(cliente.id, i + 1);
    const contexto = { avisos, donde: `Cliente de la fila ${fila}` };
    for (const [col, sacar] of COLUMNAS_DE_CLIENTE) celdas.push({ ref: `${col}${fila}`, valor: valorDe(sacar(cliente), contexto) });
  });
  return { celdas, codigoDe };
}

// ---------- VEHICULOS ----------

/** PROPIEDAD en su hoja es una lista: PROPIO o SUBARRENDADO. La flota del sistema es la propia; lo demás se respeta si lo dice. */
const propiedadDe = (v) => (/subarr/i.test(String(v.propiedad ?? '')) ? 'SUBARRENDADO' : 'PROPIO');

function armarVehiculos(vehiculos, avisos) {
  const cupo = cuantasCaben('vehiculos');
  if (vehiculos.length > cupo) {
    throw new ErrorDeRespaldo(`La flota tiene ${vehiculos.length} carros y la hoja VEHICULOS de su Excel solo tiene ${cupo} filas. No se arma el respaldo: faltarían carros.`);
  }
  // El código del carro es el que se ve en la pantalla de Carros: va EN SU FILA (código 5 → fila 7) para que la columna
  // CODIGO de su hoja (que cuenta sola) diga lo mismo que el sistema. Un carro sin código, o con uno repetido o fuera
  // de la hoja, no tiene fila propia: toma la primera libre y se avisa, porque su código en el archivo no es el del sistema.
  const libres = new Set(Array.from({ length: cupo }, (_, i) => i + 1));
  const porCodigo = new Map();
  const sueltos = [];
  const claveDeCodigo = (v) => (Number.isInteger(Number(v.codigo)) && v.codigo !== null && v.codigo !== '' ? Number(v.codigo) : Infinity);
  for (const v of [...vehiculos].sort((a, b) => (claveDeCodigo(a) === claveDeCodigo(b) ? 0 : claveDeCodigo(a) < claveDeCodigo(b) ? -1 : 1))) {
    const codigo = Number(v.codigo);
    if (Number.isInteger(codigo) && libres.has(codigo)) { libres.delete(codigo); porCodigo.set(codigo, v); } else sueltos.push(v);
  }
  for (const v of sueltos) {
    const codigo = Math.min(...libres);
    libres.delete(codigo);
    porCodigo.set(codigo, v);
    avisos.push(`El carro ${aTexto(v.placas) ?? '(sin placas)'} no tiene un código utilizable en el sistema (${aTexto(v.codigo) ?? 'vacío'}); en el archivo quedó con el código ${codigo}.`);
  }
  const celdas = [];
  const codigoDe = new Map();
  for (const [codigo, v] of porCodigo) {
    const fila = CAPACIDAD.vehiculos.primera + codigo - 1;
    codigoDe.set(v.id, codigo);
    const contexto = { avisos, donde: `Carro ${codigo}` };
    const descripcion = [v.marca, v.linea].filter(Boolean).join(' ');
    celdas.push(
      { ref: `B${fila}`, valor: valorDe(v.placas, contexto) },
      { ref: `C${fila}`, valor: valorDe(v.tipo, contexto) },
      { ref: `D${fila}`, valor: valorDe(descripcion, contexto) },
      { ref: `E${fila}`, valor: valorDe(v.color, contexto) },
      // El modelo es un año: número si lo es (su hoja lo guarda como número), texto si no.
      { ref: `F${fila}`, valor: /^\d{4}$/.test(String(v.modelo ?? '').trim()) ? Number(v.modelo) : valorDe(v.modelo, contexto) },
      { ref: `G${fila}`, valor: propiedadDe(v) },
      { ref: `H${fila}`, valor: valorDe(v.dueno, contexto) },
    );
  }
  return { celdas, codigoDe };
}

// ---------- CONTRATOS ----------

/** El número de tarjeta de su hoja: solo se conservan los últimos 4 (ADR-001); el resto nunca se guardó. */
const textoDeTarjeta = (t) => (t?.ultimos4 ? `XXXX XXXX XXXX ${t.ultimos4}` : null);

const FORMA_DE_SU_LISTA = { efectivo: 'EFECTIVO', tarjeta: 'TARJETA', transferencia: 'TRANSFERENCIA', deposito: 'DEPOSITO' };

/** Los pagos que cuentan: los anulados no (es lo mismo que hace `resumen()`). */
const pagosVigentes = (c) => (Array.isArray(c.pagos) ? c.pagos : []).filter((p) => !p?.anulado);

/**
 * Forma de pago y porcentaje de tarjeta de un contrato, tal como su hoja los entiende: UNA forma y UN porcentaje para
 * toda la renta (BZ y BS), que su fórmula aplica sobre el total. Si los pagos fueron de una sola forma, esa; si
 * fueron de varias, MIXTO (está en su lista) y el detalle va a COMENTARIOS. El porcentaje solo se escribe cuando TODO
 * se pagó con tarjeta con el mismo porcentaje: si la mitad fue en efectivo, aplicarlo a todo cobraría de más.
 */
function formaYPorcentaje(c) {
  const pagos = pagosVigentes(c).filter((p) => q(p.monto) !== 0);
  const formas = [...new Set(pagos.map((p) => String(p.forma || p.formaPago || '').toLowerCase()))];
  const porcentajes = [...new Set(pagos.filter((p) => (p.forma || p.formaPago) === 'tarjeta').map((p) => q(p.porcentajeTarjeta)))];
  let forma = null;
  if (formas.length === 1) forma = FORMA_DE_SU_LISTA[formas[0]] ?? (formas[0] ? formas[0].toUpperCase() : null);
  else if (formas.length > 1) forma = 'MIXTO';
  const todoConTarjeta = formas.length === 1 && formas[0] === 'tarjeta';
  const porcentaje = todoConTarjeta && porcentajes.length === 1 && porcentajes[0] > 0 ? porcentajes[0] : null;
  return { forma, porcentaje, formas, porcentajes, pagos };
}

/**
 * Lo que la hoja NO suma de este contrato aunque el sistema sí lo cobre: `{ faltante, razones, totalDelSistema }`.
 *
 * Su fórmula de SUBTOTAL suma renta, atraso, seguros, daños, carta poder, combustible y varios de la salida, y nada más.
 * Entonces el TOTAL COBRADO de la hoja sale corto en tres casos, y los tres vienen de las funciones del núcleo, no de
 * una cuenta propia:
 *   - la hora tardía (`horaTardiaDe`): la hoja la anota en HORA TARDIA pero su SUBTOTAL no la suma;
 *   - los «varios» de la devolución (`cierre.varios`): la hoja no tiene columna para ellos;
 *   - el recargo de tarjeta de pagos que la hoja no puede representar (varias formas de pago, o varios porcentajes): su
 *     fórmula aplica UN porcentaje a todo el total, y sin él no se aplica nada.
 *
 * `totalDelSistema` es el subtotal de `resumen()` más ese recargo: lo que el sistema dice que se cobró por esta renta.
 * Con `faltante` en cero la hoja y el sistema dicen lo mismo.
 */
function loQueLaHojaNoSuma(c, pago) {
  const cierre = c.cierre ?? {};
  const horaTardia = horaTardiaDe(c);
  const montoHoraTardia = suma(horaTardia.alSalir, horaTardia.alRecibir);
  const varios = q(cierre.varios);
  const recargo = pago.porcentaje === null
    ? suma(...pago.pagos.map((p) => recargoTarjeta(p.monto, p.porcentajeTarjeta)))
    : 0;
  const razones = [];
  if (montoHoraTardia) razones.push(`la hoja anota la hora tardía (${textoConQ(montoHoraTardia)}) pero no la suma`);
  if (varios) razones.push(`los varios de la devolución (${textoConQ(varios)}${aTexto(cierre.variosDetalle) ? `, ${aTexto(cierre.variosDetalle)}` : ''}) no tienen dónde sumarse`);
  if (recargo) razones.push(`el recargo de tarjeta que se cobró (${textoConQ(recargo)}) no cabe: la hoja aplica un solo porcentaje a todo el total`);
  return {
    faltante: suma(montoHoraTardia, varios, recargo),
    razones,
    totalDelSistema: suma(resumen(c).subtotal, recargo),
  };
}

/**
 * Lo que lleva la columna AL «RENTADO POR»: el CÓDIGO del empleado que el contrato selló ese día (`empleadoCodigo`), o NADA.
 *
 * Decisión del dueño, 23 de octubre de 2026. Su Excel trabaja por código y su papel pide el código («PREPARADO POR (CODIGO)»), pero esta
 * columna recibía el nombre (`rentadoPor`). Preguntado si AL debía llevar el código, contestó «Los dos»: el código aquí, y el nombre en el
 * COMENTARIO del contrato (ver `notasDelContrato`), para que no se pierda.
 *
 * Sin código la columna queda VACÍA, y eso incluye los tres modos de «sin código» que ya existen en sus datos: un contrato de antes de la lista de
 * empleados (`rentadoPor` es texto escrito a mano y ni siquiera trae la llave), un empleado registrado sin código (`null`) y uno vacío o de solo
 * espacios. NO se rellena con el nombre (una columna cuyas fórmulas esperan un código no puede recibir un nombre), ni con un 0 (que se leería como
 * el código cero), ni con un código buscado en la lista de empleados de hoy (el de hoy no es necesariamente el que llevó el papel de aquel día;
 * es lo mismo que decidió la hoja impresa, §8b punto 12). Un dato que falta dibujado como uno que existe es un defecto que este código ya corrigió
 * más de una vez (§7b: «nunca `0`», «no se sabe, `null`»).
 *
 * Cómo se escribe: un código que es un número entero positivo, escrito sin ceros a la izquierda, va como NÚMERO, que es lo que su hoja guarda cuando
 * él teclea un 6 en la casilla (y lo que ya son el código de cliente y el de carro en la misma fila: un BUSCARV o un `=` contra un número no encuentra
 * un «6» de texto). Cualquier otro —«W1», «007», «0», «1.5»— va como TEXTO tal cual: convertirlo perdería el «00» de «007», y un código «0» es un
 * código, no una celda vacía (`aMonto` vacía los ceros).
 */
function codigoParaSuHoja(c) {
  const crudo = c.empleadoCodigo;
  if (typeof crudo !== 'string' && !(typeof crudo === 'number' && Number.isFinite(crudo))) return null;
  const texto = String(crudo).trim();
  if (texto === '') return null;
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero > 0 && String(numero) === texto ? numero : texto;
}

/**
 * Lo que su hoja no puede mostrar de este contrato, en frases que se leen en COMENTARIOS.
 *
 * El orden es deliberado: lo que descuadra el total va PRIMERO (es lo que no se puede dejar de ver), después lo que cambia cómo se lee el dinero de
 * esa renta, y al final quién la rentó. El nombre del empleado es identidad, no una advertencia, y no puede quitarle el primer lugar al «OJO» (una
 * prueba lo exige).
 */
function notasDelContrato(c, pago) {
  const { formas, porcentajes, pagos } = pago;
  const notas = [];
  const descuadre = loQueLaHojaNoSuma(c, pago);
  if (descuadre.faltante) {
    notas.push(`OJO: el total de esta hoja sale ${textoConQ(descuadre.faltante)} menos que el del sistema (${textoConQ(descuadre.totalDelSistema)}): ${descuadre.razones.join('; ')}`);
  }
  const horaTardia = horaTardiaDe(c);
  if (horaTardia.sinMonto) notas.push('Hora tardía marcada al salir, sin monto');

  const tarjetas = Array.isArray(c.tarjetas) ? c.tarjetas : [];
  tarjetas.slice(2).forEach((t, i) => {
    notas.push(`Tarjeta ${i + 3}: ${textoDeTarjeta(t) ?? '(sin número)'}${t.vencimiento ? `, vence ${t.vencimiento}` : ''}${t.autorizacion ? `, autorización ${t.autorizacion}` : ''}${q(t.montoAutorizado) ? `, ${textoConQ(t.montoAutorizado)}` : ''}${t.banco ? `, ${t.banco}` : ''}`);
  });

  const cierre = c.cierre ?? {};
  if (aTexto(cierre.danosDetalle)) notas.push(`Daños: ${aTexto(cierre.danosDetalle)}`);

  if (formas.length > 1 || porcentajes.length > 1) {
    notas.push(`Pagos: ${pagos.map((p) => `${p.forma || p.formaPago} ${textoConQ(p.monto)}${q(p.porcentajeTarjeta) ? ` (${q(p.porcentajeTarjeta)} % de tarjeta)` : ''}`).join('; ')}`);
  }

  const saldo = resumen(c).saldo;
  if (saldo > 0) notas.push(`Saldo por cobrar según el sistema: ${textoConQ(saldo)}`);
  if (saldo < 0) notas.push(`A favor del cliente según el sistema: ${textoConQ(-saldo)}`);
  if (garantiaPorLiberar(c)) notas.push(`Garantía de tarjeta sin liberar: ${textoConQ(c.garantiaMonto)}`);
  // El nombre de ESE día (`rentadoPor`, el que el contrato selló) va aquí porque la columna AL lleva el código (`codigoParaSuHoja`): su Excel
  // no tiene la lista de empleados, y sin esta frase el archivo no diría quién es el «6». Sin nombre no hay frase.
  const quien = aTexto(c.rentadoPor);
  if (quien) notas.push(`Rentado por: ${quien}`);
  return notas;
}

/** Cuántos quetzales le faltan al total de la hoja en este contrato (0 si cuadra). Para avisar en pantalla. */
export function faltanteDelTotal(c) {
  return loQueLaHojaNoSuma(c, formaYPorcentaje(c)).faltante;
}

/** Quién cubrió qué: id de contrato → fecha del pago al dueño. Solo cuentan los pagos que no se anularon. */
function pagadosAlDueno(pagosDueno) {
  const fechas = new Map();
  for (const pago of pagosDueno) {
    if (pagoAnulado(pago)) continue;
    for (const id of Array.isArray(pago.contratos) ? pago.contratos : []) if (id && !fechas.has(id)) fechas.set(id, pago.fecha ?? null);
  }
  return fechas;
}

/**
 * El nombre del cliente como lo escribe su hoja: «APELLIDOS NOMBRES» (la fórmula de la fila 5 de CONTRATOS los junta en
 * ese orden). El contrato del sistema guarda `clienteNombre` como se lee en el papel, «NOMBRES APELLIDOS»; si el
 * cliente está, se arma del cliente para que todas las filas de la hoja —las del respaldo y las que él agregue después—
 * se ordenen y se busquen igual. Si el cliente ya no está, queda el nombre del contrato tal cual.
 */
function nombreComoLoEscribeSuHoja(c, clientePorId) {
  const cliente = clientePorId.get(c.clienteId);
  if (cliente) {
    const { nombres, apellidos } = nombresResueltos(cliente);
    const junto = `${apellidos} ${nombres}`.trim();
    if (junto) return junto;
  }
  return aTexto(c.clienteNombre);
}

function armarContrato(c, fila, { codigoDeCliente, clientePorId, codigoDeCarro, pagados, avisos }) {
  const contexto = { avisos, donde: `Contrato ${c.numero}` };
  const cierre = c.cierre ?? null;
  const ajeno = Boolean(c.ajeno);
  const carroAjeno = ajeno ? (c.carroAjeno ?? {}) : {};
  const pago = formaYPorcentaje(c);
  const tarjeta = (i) => (Array.isArray(c.tarjetas) ? c.tarjetas[i] : undefined) ?? {};
  const [t1, t2] = [tarjeta(0), tarjeta(1)];
  const horaTardia = horaTardiaDe(c);
  const renta = lineasSalida(c).find((l) => l.concepto === 'Renta')?.monto ?? 0;
  // Lo anotado al recibir, o nada si el carro sigue afuera (ver AF y AG más abajo).
  const alRegresar = yaVolvio(c) ? cierre : null;

  const clienteCodigo = codigoDeCliente.get(c.clienteId);
  if (!clienteCodigo) avisos.push(`Contrato ${c.numero}: su cliente (${aTexto(c.clienteNombre) ?? 'sin nombre'}) no entró a la hoja CLIENTES; el contrato queda con el nombre, sin código de cliente.`);
  const carroCodigo = ajeno ? undefined : codigoDeCarro.get(c.carroId);
  if (!ajeno && !carroCodigo) avisos.push(`Contrato ${c.numero}: su carro (${aTexto(c.carroPlacas) ?? 'sin placas'}) ya no está en la flota; el contrato queda con las placas, sin código de carro.`);

  const notas = notasDelContrato(c, pago);
  const valores = {
    A: Number(c.numero),
    B: clienteCodigo ?? null,
    C: nombreComoLoEscribeSuHoja(c, clientePorId),
    D: carroCodigo ?? null,
    E: [aTexto(c.carroPlacas), aTexto(c.carroDescripcion)].filter(Boolean).join(' ') || null,
    F: { fecha: c.fechaSalida },
    G: aMonto(c.dias),
    H: { fecha: c.devolucionPrevista },
    // El puente de §7b: un contrato viejo trae el kilometraje de salida como `kilometrajeSalida` (el mismo puente de recibir, el detalle,
    // el mantenimiento y el papel). Sin él esa renta salía con la columna vacía en su archivo.
    I: aMonto(conKmSalidaNormalizado(c).kmSalida),
    J: aMonto(c.precioDia),
    K: aMonto(renta),
    L: aMonto(c.deducible),
    M: textoDeTarjeta(t1),
    N: aTexto(t1.vencimiento),
    O: aTexto(t1.autorizacion),
    P: aMonto(t1.montoAutorizado),
    Q: aTexto(t1.banco),
    R: textoDeTarjeta(t2),
    S: aTexto(t2.vencimiento),
    T: aTexto(t2.autorizacion),
    U: aMonto(t2.montoAutorizado),
    V: aTexto(t2.banco),
    // W, X (a quién se factura), Y, Z (tarjeta de circulación), AI, AJ (tarifa semanal y mensual) y AK (combustible por
    // galón) son columnas de su hoja que el sistema no tiene: quedan vacías.
    AA: aMonto(c.seguroTercerosDia),
    AB: aMonto(c.seguroDia),
    AC: aTexto(c.combustibleSalida),
    AD: { hora: c.horaSalida },
    AE: aTexto(c.lugar),
    // AF y AG llevan lo que se anotó al RECIBIR el carro (`cierre`), y solo cuando el carro ya volvió (`yaVolvio`, la única
    // marca de un regreso). En su hoja esas dos columnas se llenan al SALIR, con la hora que se espera; el sistema no guarda una
    // hora prevista de entrada y sí la real, y la real es la que importa. Decisión del dueño, 16 de octubre de 2026:
    // «El lugar siempre va a ser en la oficina. La hora es lo que importa porque si se pasa de la hora yo decido cuánto le cobro.»
    // Una renta que todavía no regresa no tiene hora real: AF queda VACÍA, no se rellena con la hora de salida ni con nada que
    // se le parezca (un cero ahí se leería como las 12 de la noche). AG es el lugar anotado al recibir; tampoco se inventa.
    AF: { hora: alRegresar?.horaReal },
    AG: aTexto(alRegresar?.lugarEntrada),
    AH: aMonto(horaTardia.alSalir + horaTardia.alRecibir),
    // El CÓDIGO del empleado, no su nombre (que va a COMENTARIOS): ver `codigoParaSuHoja`. Vacía si el contrato no trae código.
    AL: codigoParaSuHoja(c),
    AM: aMonto(c.seguroMenoresDia),
    AN: aTexto(c.cartaPoderDestino),
    AO: aMonto(c.cartaPoderPrecio),
    AP: aMonto(c.deducibleBajo),
    AQ: aTexto(c.variosDescripcion),
    AR: aMonto(c.variosPrecio),
    AS: aMonto(c.seguroPaiDia),
    AT: aTexto(c.conductorAdicional?.nombre),
    AU: aTexto(c.conductorAdicional?.licencia),
    AV: aTexto(c.conductorAdicional?.identificacion),
    AW: aTexto(c.observaciones),
    AX: aTexto(carroAjeno.placas),
    AY: aTexto(carroAjeno.tipo),
    AZ: aTexto(carroAjeno.marca),
    BA: aTexto(carroAjeno.color),
    BB: aTexto(carroAjeno.modelo),
    BC: aTexto(carroAjeno.dueno),
    // El costo por día del dueño llega ya dentro de `subarriendo` (el puente de lectura de ADR-002) o no llega.
    BD: ajeno ? aMonto(c.subarriendo?.costoDia) : null,
    // BE y BF son fórmulas de su hoja (PROPIEDAD y DUEÑO DEL CARRO): se calculan solas de D y de AX–BD.
    BG: { fecha: cierre?.fechaReal },
    BH: aMonto(cierre?.kmEntrada),
    BM: aMonto(cierre?.danos),
    BO: aMonto(cierre?.combustible),
    BR: aMonto(cierre?.descuento),
    BS: pago.porcentaje,
    BX: ajeno ? (pagados.has(c.id) ? 'SI' : 'NO') : null,
    BY: ajeno && pagados.has(c.id) ? { fecha: pagados.get(c.id) } : null,
    BZ: pago.forma,
    CA: notas.length ? `Del sistema: ${notas.join(' | ')}` : null,
  };
  if (ajeno && !aMonto(c.subarriendo?.costoDia)) {
    avisos.push(`Contrato ${c.numero}: carro ajeno sin costo del dueño anotado; su utilidad en el archivo saldrá igual al total.`);
  }
  return Object.entries(valores).map(([col, v]) => ({ ref: `${col}${fila}`, valor: valorDe(v, contexto) }));
}

/**
 * Arma las celdas de las tres hojas a partir de lo que hay en el sistema.
 *
 * - `clientes` y `vehiculos`: todos los del sistema.
 * - `contratos`: los del año (por `fechaSalida`), con el costo del dueño ya puesto en `subarriendo.costoDia`.
 * - `pagosDueno`: todos (para saber si cada renta ajena ya se le pagó al dueño).
 *
 * Devuelve `{ celdas: { clientes, vehiculos, contratos }, avisos, cuenta }`. LANZA `ErrorDeRespaldo` cuando el año no
 * cabe en la hoja: un respaldo al que le faltan contratos que parece completo es peor que ninguno.
 */
export function armarCeldas({
  anio, clientes, vehiculos, contratos, pagosDueno,
}) {
  const avisos = [];
  const delAnio = contratos.filter((c) => String(c.fechaSalida ?? '').startsWith(`${anio}-`));
  const sinNumero = delAnio.filter((c) => !Number.isFinite(Number(c.numero)) || c.numero === null || c.numero === '');
  const numerados = delAnio.filter((c) => !sinNumero.includes(c)).sort((a, b) => Number(a.numero) - Number(b.numero));
  if (sinNumero.length) avisos.push(`${sinNumero.length} contrato${sinNumero.length === 1 ? '' : 's'} sin número no entr${sinNumero.length === 1 ? 'ó' : 'aron'} a la hoja CONTRATOS: sin número no hay dónde pegar el siguiente.`);

  const repetidos = numerados.filter((c, i) => i > 0 && Number(numerados[i - 1].numero) === Number(c.numero));
  if (repetidos.length) avisos.push(`Hay números de contrato repetidos (${[...new Set(repetidos.map((c) => c.numero))].join(', ')}): su hoja los marca en rojo en la columna A.`);

  const cupo = cuantasCaben('contratos');
  if (numerados.length > cupo) {
    throw new ErrorDeRespaldo(`En ${anio} hay ${numerados.length} contratos y la hoja CONTRATOS de su Excel solo tiene ${cupo} filas. No se arma el respaldo: faltarían contratos.`);
  }

  const { ordenados, fuera } = clientesDelArchivo(clientes, numerados, avisos);
  const hojaClientes = armarClientes(ordenados, avisos);
  const hojaVehiculos = armarVehiculos(vehiculos, avisos);
  const pagados = pagadosAlDueno(pagosDueno);

  const celdasDeContratos = numerados.flatMap((c, i) => armarContrato(c, CAPACIDAD.contratos.primera + i, {
    codigoDeCliente: hojaClientes.codigoDe, clientePorId: new Map(ordenados.map((cl) => [cl.id, cl])), codigoDeCarro: hojaVehiculos.codigoDe, pagados, avisos,
  }));

  // Lo que la hoja no suma se dice AQUÍ, a la vista al bajar el archivo, además de en el COMENTARIO de cada renta: dentro de un
  // año él va a mirar su Excel, ver un total y creerlo.
  const descuadrados = numerados.map((c) => [c.numero, faltanteDelTotal(c)]).filter(([, falta]) => falta);
  if (descuadrados.length) {
    const lista = descuadrados.map(([numero, falta]) => `${numero} (faltan ${textoConQ(falta)})`).join(', ');
    avisos.unshift(`En ${descuadrados.length} contrato${descuadrados.length === 1 ? '' : 's'} el total de la hoja sale MENOS que el del sistema, porque su hoja no suma la hora tardía ni los varios de la devolución ni el recargo de una tarjeta que no cubre todo el pago: ${lista}. El COMENTARIO de cada uno empieza con «OJO» y dice qué falta.`);
  }

  return {
    celdas: { clientes: hojaClientes.celdas, vehiculos: hojaVehiculos.celdas, contratos: celdasDeContratos },
    avisos,
    cuenta: {
      clientes: ordenados.length, clientesFuera: fuera, vehiculos: vehiculos.length, contratos: numerados.length,
    },
  };
}
