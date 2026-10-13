// El diseño de su Excel, tal como el respaldo lo conoce: dónde empiezan los datos de cada hoja, cuántas filas caben y
// qué dice cada encabezado.
//
// Esta es la otra mitad del mapa de §7b: allá están los nombres de los campos del sistema, aquí las columnas de su
// archivo. Los encabezados no son decoración: antes de escribir una sola celda el respaldo comprueba que la plantilla
// diga lo que aquí se espera (`compararEncabezados`). Si él mueve una columna en su Excel, la comprobación falla y el
// respaldo se niega, en vez de poner el DPI en la columna de la licencia sin que nadie se entere.
import { textosDeCeldas, columnaDeNumero, numeroDeColumna } from './hojas.js';

export const HOJA_CLIENTES = 'CLIENTES';
export const HOJA_VEHICULOS = 'VEHICULOS';
export const HOJA_CONTRATOS = 'CONTRATOS';
export const HOJA_FORMULARIO = 'INGRESO DE DATOS';

/** Cuántas filas de datos caben en cada hoja. Más allá no hay fórmulas: su Excel no las trae. */
export const CAPACIDAD = {
  clientes: { primera: 3, ultima: 2002 },
  vehiculos: { primera: 3, ultima: 202 },
  contratos: { primera: 6, ultima: 1005 },
};

/** Cuántas filas son (para los mensajes). */
export const cuantasCaben = (hoja) => CAPACIDAD[hoja].ultima - CAPACIDAD[hoja].primera + 1;

/** Con espacios y saltos de línea normalizados: «DEVOLUCION\nPREVISTA» y «DEVOLUCION PREVISTA» son el mismo encabezado. */
export const normalizar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

// ---------- encabezados ----------
// CLIENTES tiene el encabezado en dos filas (1 y 2): «FECHA» arriba, «NAC.» abajo. Se comparan juntas.
const CLIENTES = {
  B: '1er. APELLIDO', C: '2do. APELLIDO', D: '1er. NOMBRE', E: '2do. NOMBRE', F: 'NACIONALIDAD', G: 'FECHA NAC.',
  H: 'CEDULA O PASAPORTE', I: 'EXTENDIDA EN', J: 'FECHA EXPIRA', K: 'LICENCIA CONDUCIR', L: 'LUGAR EMISION', M: 'FECHA EXPIRA',
  N: 'DIRECCION REFERENCIA', O: 'MUNICIPIO', Q: 'PAIS', R: 'TELEFONO', S: 'CORREO ELECTRONICO', T: 'DIRECCION ADICIONAL',
  U: 'CIUDAD', V: 'ESTADO', W: 'PAIS', X: 'TELEFONO ADICIONAL',
};

const VEHICULOS = {
  A: 'CODIGO', B: 'PLACAS', C: 'TIPO DE VEHICULO', D: 'MARCA Y LINEA', E: 'COLOR', F: 'MODELO', G: 'PROPIEDAD', H: 'DUEÑO DEL CARRO',
};

const CONTRATOS = {
  A: 'No. CONTRATO', B: 'COD. CLIENTE', C: 'CLIENTE', D: 'COD. CARRO', E: 'CARRO', F: 'FECHA SALIDA', G: 'DIAS',
  H: 'DEVOLUCION PREVISTA', I: 'KM SALIDA', J: 'TARIFA X DIA', K: 'RENTA', L: 'DEDUCIBLE', M: 'TARJETA 1',
  N: 'VENCE TARJETA 1', O: 'AUTORIZ. TARJETA 1', P: 'MONTO AUTORIZ. 1', Q: 'BANCO TARJETA 1', R: 'TARJETA 2',
  S: 'VENCE TARJETA 2', T: 'AUTORIZ. TARJETA 2', U: 'MONTO AUTORIZ. 2', V: 'BANCO TARJETA 2', W: 'PERSONA O EMPRESA',
  X: 'NIT', Y: 'T. CIRCULACION ORIGINAL', Z: 'T. CIRCULACION AUTENTICA', AA: 'SEGURO TERCEROS X DIA', AB: 'SEGURO X DIA',
  AC: 'COMBUSTIBLE SALIDA', AD: 'HORA SALIDA', AE: 'LUGAR SALIDA', AF: 'HORA ENTRADA', AG: 'LUGAR ENTRADA',
  AH: 'HORA TARDIA', AI: 'SEMANA', AJ: 'MES', AK: 'COMBUSTIBLE X GALON', AL: 'RENTADO POR', AM: 'SEGURO MENORES X DIA',
  AN: 'CARTA PODER DESTINO', AO: 'CARTA PODER PRECIO', AP: 'DEDUCIBLE BAJO', AQ: 'VARIOS DESCRIPCION', AR: 'VARIOS PRECIO',
  AS: 'SEGURO PAI X DIA', AT: 'NOMBRE', AU: 'LICENCIA No.', AV: 'IDENTIFICACION', AW: 'OBSERVACIONES',
  AX: 'SUBARR. PLACAS', AY: 'SUBARR. TIPO', AZ: 'SUBARR. MARCA Y LINEA', BA: 'SUBARR. COLOR', BB: 'SUBARR. MODELO',
  BC: 'SUBARR. DUEÑO', BD: 'SUBARR. COSTO X DIA', BE: 'PROPIEDAD', BF: 'DUEÑO DEL CARRO', BG: 'FECHA REAL INGRESO',
  BH: 'KM ENTRADA', BI: 'KM RECORRIDOS', BJ: 'DIAS DE ATRASO', BK: 'COBRO DIAS DE ATRASO', BL: 'SEGUROS EXTRA',
  BM: 'DAÑOS', BN: 'CARTA PODER', BO: 'COMBUSTIBLE', BP: 'VARIOS', BQ: 'SUBTOTAL', BR: 'DESCUENTO', BS: '% TARJETA (ej: 12)',
  BT: 'TOTAL COBRADO', BU: 'COSTO SUB. X DIA', BV: 'COSTO SUBARRIENDO', BW: 'UTILIDAD', BX: 'PAGADO AL DUEÑO',
  BY: 'FECHA PAGO AL DUEÑO', BZ: 'FORMA DE PAGO', CA: 'COMENTARIOS',
};

// Las etiquetas del formulario de INGRESO DE DATOS que están junto a las celdas que el respaldo deja en blanco: si no
// calzan, la lista de abajo ya no apunta a donde se cree.
const FORMULARIO = {
  B6: 'TARJETA 1', B8: 'AUTORIZACION 1', B9: 'CODIGO CBC', B17: 'PERSONA O EMPRESA', E19: 'CODIGO CARRO',
  B27: 'KIL. SALIDA', B29: 'FECHA SALIDA', B32: 'DIAS A RENTAR', B34: 'PECIO X DIA', B38: 'RENTADO POR', B41: 'NOMBRE',
  B42: 'LICENCIA No.:', B50: 'OBSERVACIONES:', E35: 'CARTA PODER DESTINO', E45: 'DUEÑO',
};

/** Cada hoja, con los encabezados que se comprueban: `[referencia, texto esperado]`. */
export const ENCABEZADOS = {
  [HOJA_CLIENTES]: Object.entries(CLIENTES).map(([col, texto]) => [`${col}2`, texto]),
  [HOJA_VEHICULOS]: Object.entries(VEHICULOS).map(([col, texto]) => [`${col}2`, texto]),
  [HOJA_CONTRATOS]: Object.entries(CONTRATOS).map(([col, texto]) => [`${col}4`, texto]),
  [HOJA_FORMULARIO]: Object.entries(FORMULARIO),
};

/**
 * Compara los encabezados de una hoja con lo esperado. Devuelve la lista de lo que no calza (`[]` si todo bien), cada
 * uno con la celda, lo esperado y lo que hay.
 *
 * CLIENTES se compara con las dos filas de encabezado unidas («FECHA» + «NAC.»): la fila 1 puede decir lo que sea
 * en las columnas donde la fila 2 ya basta, así que se acepta que lo esperado termine en lo que dice la fila 2 y
 * empiece por lo que diga la fila 1.
 */
export function compararEncabezados(hoja, xml, textos) {
  const esperados = ENCABEZADOS[hoja];
  const refs = esperados.map(([ref]) => ref);
  const arriba = hoja === HOJA_CLIENTES ? refs.map((ref) => ref.replace(/2$/, '1')) : [];
  const leidas = textosDeCeldas(xml, [...refs, ...arriba], textos);
  const fallas = [];
  for (const [ref, esperado] of esperados) {
    const abajo = normalizar(leidas.get(ref));
    const alto = hoja === HOJA_CLIENTES ? normalizar(leidas.get(ref.replace(/2$/, '1'))) : '';
    const hay = normalizar(`${alto} ${abajo}`);
    if (hay !== normalizar(esperado)) fallas.push({ celda: ref, esperado, hay });
  }
  return fallas;
}

/**
 * Las celdas de INGRESO DE DATOS que se quedan en blanco en la plantilla que viaja con el sistema: lo que se tecleó
 * para UNA renta (el cliente, el carro, la tarjeta, las fechas, el conductor). Quedan tal cual las tarifas fijas del
 * negocio (seguro de terceros, seguro, deducible, combustible por galón: C24, C25, C26 y C37), que no son de nadie.
 */
export const CELDAS_DEL_FORMULARIO = [
  'C3',
  'C6', 'C7', 'C8', 'D8', 'C9', 'C10', 'C11', 'C12', 'C13', 'D13', 'C14', 'C15',
  'B18', 'D18',
  'F19', 'F22', 'F23',
  'C27', 'C28', 'C29', 'C30', 'C31', 'C32', 'C33', 'C34', 'C35', 'C36', 'E30', 'E31', 'C38',
  'F34', 'F35', 'F36', 'F37', 'F38', 'F39', 'F40',
  'C41', 'C42', 'C43',
  'C45', 'C46', 'C47', 'C48', 'F45', 'F46', 'F47',
  'C50',
];

// ---------- el área de datos de cada hoja ----------

/** Las referencias `[desde..hasta] × [primera..ultima]`: ('B', 'X', 3, 2002) → B3, C3, … X2002. */
function rectangulo(desde, hasta, primera, ultima) {
  const refs = [];
  for (let fila = primera; fila <= ultima; fila += 1) {
    for (let col = numeroDeColumna(desde); col <= numeroDeColumna(hasta); col += 1) refs.push(`${columnaDeNumero(col)}${fila}`);
  }
  return refs;
}

/**
 * Todas las celdas donde el respaldo escribe datos, hoja por hoja. Lo demás son fórmulas, encabezados y adornos de su
 * archivo, y no se toca. Sirve para dos cosas: dejar la plantilla en blanco y vaciar el área antes de escribir (así el
 * archivo sale igual aunque la plantilla trajera algo).
 *
 * CONTRATOS: las columnas A–BD se pegan como valores al salir el carro; BG, BH, BM, BO, BR, BS y BX–CA se llenan al regresar.
 * Las demás de esas filas (BE, BF, BI–BL, BN, BP–BQ, BT–BW, CB–CG) son fórmulas.
 */
export function celdasDeDatos(hoja) {
  const { clientes, vehiculos, contratos } = CAPACIDAD;
  if (hoja === HOJA_CLIENTES) return rectangulo('B', 'X', clientes.primera, clientes.ultima);
  if (hoja === HOJA_VEHICULOS) return rectangulo('B', 'H', vehiculos.primera, vehiculos.ultima);
  if (hoja === HOJA_CONTRATOS) {
    return [
      ...rectangulo('A', 'BD', contratos.primera, contratos.ultima),
      ...['BG', 'BH', 'BM', 'BO', 'BR', 'BS', 'BX', 'BY', 'BZ', 'CA'].flatMap((col) => rectangulo(col, col, contratos.primera, contratos.ultima)),
    ];
  }
  if (hoja === HOJA_FORMULARIO) return CELDAS_DEL_FORMULARIO;
  throw new Error(`La hoja «${hoja}» no tiene área de datos.`);
}
