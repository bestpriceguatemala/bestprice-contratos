// La hoja del contrato sobre el papel PREIMPRESO (§8 del diseño): dónde cae cada dato en la carta, en milímetros,
// y cómo se corre toda la hoja de una vez para que calce con el papel de cada impresora.
//
// El sistema imprime SOLO los datos. El papel ya trae sus líneas, su membrete y sus casillas; lo que aquí se dibuja
// son los valores, en las posiciones que hoy usa la hoja «IMP. CONTRATO» del Excel del dueño. Esas posiciones no se
// inventaron ni se calcularon a ojo desde el archivo: se MIDIERON con el propio Excel (ver
// analisis/imp-contrato/medir_cuadricula.py) porque el archivo guarda los anchos en «caracteres» y las alturas en
// puntos, y Excel los vuelve a redondear al imprimir (cada fila imprime una unidad menos de lo que dice el archivo,
// cada columna es un número entero de unidades). Un cálculo desde el archivo se desvía un par de milímetros; la
// medición no.
//
// Este archivo es PURO (sin DOM, sin reloj, sin almacenamiento propio) para poder probar cada cuenta sola:
//   1. La cuadrícula de Excel (ANCHOS, ALTOS) y `cajaDeRango`, que dice dónde cae un rango de celdas.
//   2. `CAMPOS`: cada dato que el papel espera, con su celda, su fuente, su alineación y de dónde sale en el sistema.
//   3. La CALIBRACIÓN: un corrimiento (dx, dy) y un tamaño (escala) que se aplican a TODA la hoja juntos, una sola
//      vez. Ningún campo tiene su propio ajuste: si un campo no calza y los demás sí, el problema es la tabla, no
//      la impresora, y se arregla en la tabla.

/** Carta, en milímetros. */
export const PAPEL = { anchoMm: 215.9, altoMm: 279.4 };

/**
 * Excel imprime esta hoja al 89 % («Ajustar a: 89 %» en su configuración de página), y una unidad de pantalla
 * son 0.89 puntos en el papel. 25.4 / 72 pasa puntos a milímetros.
 */
export const ESCALA_EXCEL = 0.89;
export const MM_POR_UNIDAD = (ESCALA_EXCEL * 25.4) / 72;

/**
 * Dónde cae la esquina de arriba a la izquierda de la hoja (borde de A1) en la carta, MEDIDO en el PDF de Excel. Los
 * márgenes guardados en el archivo son 18.0 y 19.0 mm; Excel deja la línea del borde en 17.90 y 18.52.
 */
export const ORIGEN_MM = { x: 17.9, y: 18.52 };

/** El margen derecho que él le puso a la hoja en Excel (0.1969 pulgadas = 5 mm): hasta ahí llega lo que se imprime. */
const MARGEN_DERECHO_DE_EXCEL_MM = 5;

// ---------- La cuadrícula de Excel, en unidades de pantalla ----------
// De arriba a la izquierda, tal como Excel las imprime. Columna M y filas 18, 52, 54 y 55 están ocultas en el archivo
// (valen 0). Medidas en analisis/imp-contrato/cuadricula.json; esta es la copia que usa el sistema.
export const ANCHOS = {
  A: 33, B: 26, C: 26, D: 26, E: 26, F: 26, G: 26, H: 26, I: 26, J: 26, K: 99, L: 20, M: 0, N: 21, O: 20, P: 26, Q: 41, R: 10, S: 26, T: 26, U: 26, V: 20, W: 26, X: 38, Y: 56, Z: 75,
};
export const ALTOS = {
  1: 12, 2: 15, 3: 16, 4: 17, 5: 15, 6: 12, 7: 11, 8: 12, 9: 23, 10: 14, 11: 9, 12: 9, 13: 13, 14: 28, 15: 19, 16: 5, 17: 18, 18: 0, 19: 27, 20: 7, 21: 21, 22: 17, 23: 7, 24: 16, 25: 8, 26: 8, 27: 32, 28: 27, 29: 17, 30: 8, 31: 15, 32: 10, 33: 12, 34: 9, 35: 15, 36: 12, 37: 17, 38: 12, 39: 9, 40: 22, 41: 12, 42: 4, 43: 6, 44: 9, 45: 14, 46: 14, 47: 15, 48: 15, 49: 8, 50: 7, 51: 7, 52: 0, 53: 3, 54: 0, 55: 0, 56: 8, 57: 5, 58: 20, 59: 14, 60: 12,
};

const LETRAS = Object.keys(ANCHOS);

/** Unidades desde el borde izquierdo de A hasta el borde izquierdo de una columna. */
function izquierdaDe(letra) {
  const i = LETRAS.indexOf(letra);
  if (i < 0) throw new Error(`Columna desconocida: ${letra}`);
  return LETRAS.slice(0, i).reduce((s, l) => s + ANCHOS[l], 0);
}

/** Unidades desde el borde de arriba de la fila 1 hasta el borde de arriba de una fila. */
function arribaDe(fila) {
  if (!Number.isInteger(fila) || fila < 1 || fila > 60) throw new Error(`Fila desconocida: ${fila}`);
  let s = 0;
  for (let f = 1; f < fila; f++) s += ALTOS[f];
  return s;
}

/** Lo que mide la hoja entera (A1:Z60) en unidades de pantalla. */
export const HOJA_UNIDADES = {
  ancho: LETRAS.reduce((s, l) => s + ANCHOS[l], 0),
  alto: Object.values(ALTOS).reduce((s, h) => s + h, 0),
};

/** Lo que mide la hoja entera en milímetros, al tamaño que Excel la imprime. */
export const HOJA_MM = {
  ancho: HOJA_UNIDADES.ancho * MM_POR_UNIDAD,
  alto: HOJA_UNIDADES.alto * MM_POR_UNIDAD,
};

const redondear = (n) => Math.round(n * 100) / 100;

/**
 * Dónde cae un rango de celdas ('N4:Q5', o una sola, 'A8'), en milímetros desde la esquina de arriba a la izquierda
 * de la hoja (A1), al tamaño que imprime Excel. Lanza si el rango no es de la hoja: una celda que no existe no se
 * puede ubicar, y adivinar su lugar pondría un dato donde no va.
 */
export function cajaDeRango(rango) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(String(rango || ''));
  if (!m) throw new Error(`Rango de celdas inválido: «${rango}».`);
  const [, c1, f1, c2 = m[1], f2 = m[2]] = m;
  const fila1 = Number(f1);
  const fila2 = Number(f2);
  const x0 = izquierdaDe(c1);
  const x1 = izquierdaDe(c2) + ANCHOS[c2];
  const y0 = arribaDe(fila1);
  const y1 = arribaDe(fila2) + ALTOS[fila2];
  if (x1 <= x0 || y1 <= y0) throw new Error(`El rango ${rango} está vacío o al revés.`);
  return {
    x: redondear(x0 * MM_POR_UNIDAD),
    y: redondear(y0 * MM_POR_UNIDAD),
    ancho: redondear((x1 - x0) * MM_POR_UNIDAD),
    alto: redondear((y1 - y0) * MM_POR_UNIDAD),
  };
}

// ---------- Los campos que el papel espera ----------
//
// Cada uno trae:
//   id         el nombre con que lo llama el código (y la hoja de prueba).
//   etiqueta   cómo se dice en español.
//   rango      el rango de celdas combinadas de «IMP. CONTRATO» donde Excel lo imprime.
//   excel      de qué celda de «INGRESO DE DATOS» lo toma Excel (o «(texto fijo)»).
//   fuente     'arial' o 'narrow' (Arial Narrow); `pt` el tamaño en la hoja de Excel (se imprime a 89 %).
//   alinea / valinea   cómo se acomoda dentro de su casilla ('general' = a la izquierda si es texto).
//   ajusta     si el texto baja de renglón en vez de seguir derecho.
//   tipo       cómo se escribe el valor: 'texto', 'dinero', 'dineroPlano' (sin la Q), 'entero', 'fechaCorta'
//              (20-08-26), 'fechaLarga' (20         08         2026, con los espacios de las casillas del papel),
//              'fechaDoc' (20  08    26), 'tarjeta' y 'cbc' (ADR-001), 'etiqueta' (texto fijo).
//   imprime    false = NO se imprime. Dos motivos, y la nota dice cuál: Excel lo pone en letra BLANCA (se imprime pero no
//              se ve), o es un texto fijo que no se sabe si el papel ya trae. Para imprimirlo basta quitar esta línea.
//   de         de dónde sale en el sistema (nombres de §7b), o null si el sistema no tiene ese dato.
//   nota       lo que hay que saber de él.
//
// El orden es el del papel: arriba abajo, izquierda a derecha por bloques.
export const CAMPOS = [
  { id: 'codigoCliente', etiqueta: 'Código del cliente', rango: 'J5:K5', excel: 'C3', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: null, nota: 'El Excel imprime el «código» del cliente (su número de fila en la hoja CLIENTES). El sistema no tiene ese número.' },
  { id: 'tarjeta1Numero', etiqueta: 'Tarjeta 1: número', rango: 'D6:L7', excel: 'C6', fuente: 'narrow', pt: 12, alinea: 'center', valinea: 'bottom', ajusta: true, tipo: 'tarjeta', de: 'lo teclea en la pantalla de imprimir (ADR-001); en una reimpresión, `tarjetas[0].ultimos4` enmascarado' },
  { id: 'tarjeta1Vence', etiqueta: 'Tarjeta 1: vence', rango: 'C8:D8', excel: 'C7', fuente: 'narrow', pt: 12, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`tarjetas[0].vencimiento`' },
  { id: 'tarjeta1Cbc', etiqueta: 'Tarjeta 1: CBC', rango: 'H8:I8', excel: 'C9', fuente: 'narrow', pt: 14, alinea: 'center', valinea: 'center', tipo: 'cbc', de: 'lo teclea en la pantalla de imprimir (ADR-001); nunca se guarda' },
  { id: 'tarjeta1Banco', etiqueta: 'Tarjeta 1: banco emisor', rango: 'D9:L9', excel: 'C10', fuente: 'narrow', pt: 12, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`tarjetas[0].banco`' },
  { id: 'tarjeta2Numero', etiqueta: 'Tarjeta 2: número', rango: 'A10:M10', excel: 'C11', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'center', tipo: 'tarjeta', de: 'igual que la 1, con `tarjetas[1]`' },
  { id: 'tarjeta2Vence', etiqueta: 'Tarjeta 2: vence', rango: 'C11:D11', excel: 'C12', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'center', tipo: 'texto', de: '`tarjetas[1].vencimiento`' },
  { id: 'tarjeta2Cbc', etiqueta: 'Tarjeta 2: CBC', rango: 'H11:I11', excel: 'C14', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'center', tipo: 'cbc', de: 'igual que el de la 1' },
  { id: 'etiquetaAcepto', etiqueta: 'Texto fijo: ACEPTO LOS CARGOS A MI TARJETA NUMERO', rango: 'A4:L4', excel: '(texto fijo)', fuente: 'arial', pt: 8, alinea: 'left', valinea: 'bottom', tipo: 'etiqueta', texto: 'ACEPTO LOS CARGOS A MI TARJETA NUMERO', imprime: false, de: null, nota: 'Texto que el Excel imprime encima del papel. No se sabe si el papel ya lo trae.' },
  { id: 'etiquetaCodigo', etiqueta: 'Texto fijo: CODIGO', rango: 'H5:I5', excel: '(texto fijo)', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'etiqueta', texto: 'CODIGO', imprime: false, de: null, nota: 'Texto que el Excel imprime junto al código del cliente.' },
  { id: 'etiquetaTarjeta1', etiqueta: 'Texto fijo: TARJETA 1 No:', rango: 'A6:C7', excel: '(texto fijo)', fuente: 'narrow', pt: 8, alinea: 'center', valinea: 'center', tipo: 'etiqueta', texto: 'TARJETA 1  No:', imprime: false, de: null, nota: 'Texto fijo del bloque de la tarjeta.' },
  { id: 'etiquetaExpira1', etiqueta: 'Texto fijo: EXPIRA:', rango: 'A8', excel: '(texto fijo)', fuente: 'narrow', pt: 11, alinea: 'general', valinea: 'bottom', tipo: 'etiqueta', texto: 'EXPIRA:', imprime: false, de: null, nota: 'Texto fijo del bloque de la tarjeta.' },
  { id: 'etiquetaCbc1', etiqueta: 'Texto fijo: CODIGO CBC', rango: 'E8:G8', excel: '(texto fijo)', fuente: 'narrow', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'etiqueta', texto: 'CODIGO CBC', imprime: false, de: null, nota: 'Texto fijo del bloque de la tarjeta.' },
  { id: 'etiquetaBanco', etiqueta: 'Texto fijo: BANCO EMISOR', rango: 'A9:C9', excel: '(texto fijo)', fuente: 'narrow', pt: 9, alinea: 'center', valinea: 'bottom', tipo: 'etiqueta', texto: 'BANCO EMISOR', imprime: false, de: null, nota: 'Texto fijo del bloque de la tarjeta.' },
  { id: 'etiquetaExpira2', etiqueta: 'Texto fijo: EXPIRA: (tarjeta 2)', rango: 'A11', excel: '(texto fijo)', fuente: 'arial', pt: 11, alinea: 'general', valinea: 'center', tipo: 'etiqueta', texto: 'EXPIRA:', imprime: false, de: null, nota: 'Texto fijo del bloque de la tarjeta.' },
  { id: 'etiquetaCbc2', etiqueta: 'Texto fijo: CODIGO CBC (tarjeta 2)', rango: 'E11:G11', excel: '(texto fijo)', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'center', tipo: 'etiqueta', texto: 'CODIGO CBC', imprime: false, de: null, nota: 'Texto fijo del bloque de la tarjeta.' },
  { id: 'carroTipo', etiqueta: 'Tipo de vehículo', rango: 'N4:Q5', excel: 'C19', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'texto', de: 'carro de la flota: `tipo`; ajeno: `carroAjeno.tipo`' },
  { id: 'carroMarcaLinea', etiqueta: 'Marca y línea', rango: 'N6:Q7', excel: 'C21', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: '`carroDescripcion` (propio: marca y línea); ajeno: `carroAjeno.marca`' },
  { id: 'carroPlacas', etiqueta: 'Placas', rango: 'N8:Q9', excel: 'C20', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'top', tipo: 'texto', de: '`carroPlacas`' },
  { id: 'carroColor', etiqueta: 'Color', rango: 'N10:Q10', excel: 'C22', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'top', tipo: 'texto', de: 'flota: `color`; ajeno: `carroAjeno.color`' },
  { id: 'carroModelo', etiqueta: 'Modelo', rango: 'N11:Q12', excel: 'C23', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: 'flota: `modelo`; ajeno: `carroAjeno.modelo`' },
  { id: 'kmSalida', etiqueta: 'Kilometraje de salida', rango: 'O14:Q15', excel: 'C27', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'entero', imprime: false, de: '`kmSalida`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'combustibleSalida', etiqueta: 'Combustible de salida', rango: 'N23:O25', excel: 'C28', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'texto', de: '`combustibleSalida`' },
  { id: 'lugarEntrada', etiqueta: 'Lugar de entrada', rango: 'T7:W8', excel: 'E31', fuente: 'narrow', pt: 14, alinea: 'right', valinea: 'top', tipo: 'texto', de: null, nota: 'En el Excel se teclea aparte («LUGAR ENTRADA»). El contrato guarda `lugar` (salida) y `cierre.lugarEntrada` solo al recibir el carro.' },
  { id: 'fechaSalida', etiqueta: 'Fecha de salida', rango: 'X7:Y8', excel: 'C29', fuente: 'narrow', pt: 15, alinea: 'right', valinea: 'top', tipo: 'fechaCorta', de: '`fechaSalida`' },
  { id: 'horaSalida', etiqueta: 'Hora de salida', rango: 'Z7:Z8', excel: 'C30', fuente: 'arial', pt: 12, alinea: 'right', valinea: 'top', tipo: 'texto', de: '`horaSalida`' },
  { id: 'lugarSalida', etiqueta: 'Lugar de salida', rango: 'T9:V9', excel: 'C31', fuente: 'narrow', pt: 14, alinea: 'center', valinea: 'top', tipo: 'texto', de: '`lugar`' },
  { id: 'fechaEntrada', etiqueta: 'Fecha de entrada', rango: 'W9:Y9', excel: 'E29', fuente: 'narrow', pt: 14, alinea: 'right', valinea: 'top', tipo: 'fechaCorta', de: '`devolucionPrevista`' },
  { id: 'horaEntrada', etiqueta: 'Hora de entrada', rango: 'Z9:Z10', excel: 'C30', fuente: 'arial', pt: 12, alinea: 'right', valinea: 'top', tipo: 'texto', de: '`horaSalida`', nota: 'El Excel imprime aquí la hora de SALIDA (lee la misma celda que la de arriba). El contrato no guarda una hora de entrada prevista.' },
  { id: 'horaTardia', etiqueta: 'Hora tardía (precio)', rango: 'V10:X12', excel: 'C33', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'center', tipo: 'dinero', de: null, nota: 'El Excel imprime el precio de la hora tardía al salir (Q150). El sistema solo anota la hora tardía al RECIBIR el carro, como cobro; no guarda una tarifa.' },
  { id: 'facturarNit', etiqueta: 'NIT (persona o empresa)', rango: 'A13:D14', excel: 'D18', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'center', tipo: 'texto', de: null, nota: 'El Excel lo teclea en «PERSONA O EMPRESA / NIT». El sistema no guarda a quién se factura.' },
  { id: 'facturarNombre', etiqueta: 'Persona o empresa', rango: 'E13:L14', excel: 'B18', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: null, nota: 'Igual: sin dato en el sistema.' },
  { id: 'apellido1', etiqueta: 'Primer apellido', rango: 'B15:H16', excel: 'F3', fuente: 'arial', pt: 14, alinea: 'center', valinea: 'center', tipo: 'texto', de: '`apellidos` completo (el sistema guarda los dos apellidos juntos)', nota: 'El papel tiene una casilla por apellido; el sistema guarda `apellidos` en un solo texto.' },
  { id: 'apellido2', etiqueta: 'Segundo apellido', rango: 'B17:I17', excel: 'G3', fuente: 'arial', pt: 11, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: null, nota: 'Ver el primer apellido: no se separa solo.' },
  { id: 'nombre1', etiqueta: 'Primer nombre', rango: 'B19:H20', excel: 'F4', fuente: 'arial', pt: 14, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`nombres` completo', nota: 'Igual que los apellidos.' },
  { id: 'nombre2', etiqueta: 'Segundo nombre', rango: 'B21:H22', excel: 'G4', fuente: 'arial', pt: 14, alinea: 'center', valinea: 'center', tipo: 'texto', de: null, nota: 'Ver el primer nombre.' },
  { id: 'nacionalidad', etiqueta: 'Nacionalidad', rango: 'A23:E24', excel: 'F5', fuente: 'arial', pt: 10, alinea: 'left', valinea: 'bottom', tipo: 'texto', de: '`nacionalidad` del cliente (solo la traen los clientes viejos)', nota: 'Se quitó de la ficha del cliente el 3 de octubre; el Excel la sigue imprimiendo.' },
  { id: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', rango: 'F23:L24', excel: 'F6', fuente: 'arial', pt: 12, alinea: 'right', valinea: 'bottom', tipo: 'fechaLarga', de: '`fechaNacimiento` del cliente' },
  { id: 'correo', etiqueta: 'Correo electrónico', rango: 'A25:L26', excel: 'F15', fuente: 'arial', pt: 8, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: '`correo` del cliente' },
  { id: 'direccion', etiqueta: 'Dirección de referencia', rango: 'A31:L32', excel: 'A15', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: '`direccionReferencia` del cliente' },
  { id: 'municipio', etiqueta: 'Municipio', rango: 'A33:D34', excel: 'G8', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`municipio` del cliente' },
  { id: 'departamento', etiqueta: 'GUATEMALA (texto fijo)', rango: 'E33:H34', excel: '(texto fijo)', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'etiqueta', texto: 'GUATEMALA', imprime: false, de: null, nota: 'Texto fijo que el Excel imprime en la casilla del medio.' },
  { id: 'telefono', etiqueta: 'Teléfono', rango: 'I33:L34', excel: 'F8', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`telefono` del cliente' },
  { id: 'documento', etiqueta: 'Cédula o pasaporte', rango: 'A38:G39', excel: 'F9', fuente: 'narrow', pt: 14, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`documento` del cliente' },
  { id: 'documentoExtendidoEn', etiqueta: 'Documento extendido en', rango: 'H38:J39', excel: 'F10', fuente: 'arial', pt: 9, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: '`documentoExtendidoEn` del cliente' },
  { id: 'documentoExpira', etiqueta: 'Documento: fecha de expiración', rango: 'K38:M39', excel: 'F11', fuente: 'arial', pt: 9, alinea: 'center', valinea: 'bottom', tipo: 'fechaDoc', de: '`documentoExpira` del cliente' },
  { id: 'licencia', etiqueta: 'Licencia de conducir', rango: 'A41:G43', excel: 'F12', fuente: 'narrow', pt: 16, alinea: 'center', valinea: 'bottom', tipo: 'texto', de: '`licencia` del cliente' },
  { id: 'licenciaEmitidaEn', etiqueta: 'Licencia: lugar de emisión', rango: 'H41:J42', excel: 'F13', fuente: 'arial', pt: 8, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: '`licenciaEmitidaEn` del cliente' },
  { id: 'licenciaExpira', etiqueta: 'Licencia: fecha de expiración', rango: 'K41:M43', excel: 'F14', fuente: 'arial', pt: 8, alinea: 'center', valinea: 'top', tipo: 'fechaDoc', imprime: false, de: '`licenciaExpira` del cliente', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'conductorNombre', etiqueta: 'Conductor adicional: nombre', rango: 'N35:R38', excel: 'C41', fuente: 'arial', pt: 9, alinea: 'center', valinea: 'bottom', ajusta: true, tipo: 'texto', imprime: false, de: '`conductorAdicional.nombre`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'conductorLicencia', etiqueta: 'Conductor adicional: licencia', rango: 'N39:R40', excel: 'C42', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', ajusta: true, tipo: 'texto', de: '`conductorAdicional.licencia`' },
  { id: 'precioBase', etiqueta: 'Precio por día (sin seguros)', rango: 'V13:X14', excel: 'D34', fuente: 'arial', pt: 12, alinea: 'right', valinea: 'top', tipo: 'dinero', de: '`precioDia` menos `seguroDia` menos `seguroTercerosDia`', nota: 'El Excel imprime el precio por día restando los dos seguros (celda D34 de INGRESO).' },
  { id: 'seguroTerceros', etiqueta: 'Seguro de terceros (por día)', rango: 'V27:X27', excel: 'C24', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'bottom', tipo: 'dinero', de: '`seguroTercerosDia`' },
  { id: 'seguro', etiqueta: 'Seguro (por día)', rango: 'V28:X28', excel: 'C25', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'center', tipo: 'dinero', de: '`seguroDia`' },
  { id: 'combustiblePrecio', etiqueta: 'Combustible a (por galón)', rango: 'V34:X35', excel: 'C37', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'top', tipo: 'dinero', de: null, nota: 'El Excel tiene «COMBUSTIBLE A: Q65 por galón». El sistema no guarda un precio por galón (el `combustible` del cierre es un cobro, no una tarifa).' },
  { id: 'deducible', etiqueta: 'Deducible', rango: 'U36:X37', excel: 'C26', fuente: 'arial', pt: 12, alinea: 'center', valinea: 'top', tipo: 'dinero', de: '`deducible`' },
  { id: 'deducibleIva', etiqueta: '« + iva » (texto fijo)', rango: 'Y36:Y37', excel: '(texto fijo)', fuente: 'arial', pt: 10, alinea: 'left', valinea: 'top', tipo: 'etiqueta', texto: '+ iva', imprime: false, de: null, nota: 'Texto fijo junto al deducible.' },
  { id: 'deducibleCopia', etiqueta: 'Deducible (segunda vez, abajo)', rango: 'O46:Q46', excel: 'C26', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'dineroPlano', de: '`deducible`', nota: 'El Excel lo imprime otra vez en la parte de abajo.' },
  { id: 'seguroCopia', etiqueta: 'Seguro (segunda vez, abajo)', rango: 'O47:Q47', excel: 'C25', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'bottom', tipo: 'dinero', de: '`seguroDia`', nota: 'El Excel lo imprime otra vez en la parte de abajo.' },
  { id: 'cartaPoderDestino', etiqueta: 'Carta poder: destino', rango: 'R21:V22', excel: 'F35', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', de: '`lineasSalida`: detalle de la línea «Carta poder»' },
  { id: 'cartaPoderPrecio', etiqueta: 'Carta poder: precio', rango: 'W21:X22', excel: 'F36', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'dinero', de: '`lineasSalida`: monto de la línea «Carta poder»' },
  { id: 'deducibleBajo', etiqueta: 'Deducible bajo', rango: 'V23:X24', excel: 'F37', fuente: 'arial', pt: 10, alinea: 'left', valinea: 'bottom', tipo: 'dinero', imprime: false, de: '`deducibleBajo`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'seguroMenores', etiqueta: 'Seguro de menores (por día)', rango: 'V25:X26', excel: 'F34', fuente: 'arial', pt: 10, alinea: 'right', valinea: 'bottom', tipo: 'dinero', imprime: false, de: '`seguroMenoresDia`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'seguroPai', etiqueta: 'Seguro PAI (por día)', rango: 'U30:X31', excel: 'F40', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'dinero', imprime: false, de: '`seguroPaiDia`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'variosDescripcion', etiqueta: 'Varios: descripción', rango: 'V32:X32', excel: 'F38', fuente: 'arial', pt: 7, alinea: 'center', valinea: 'center', tipo: 'texto', imprime: false, de: '`variosDescripcion`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'variosPrecio', etiqueta: 'Varios: precio', rango: 'V33:X33', excel: 'F39', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'dinero', imprime: false, de: '`variosPrecio`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve.' },
  { id: 'tarjeta1Monto', etiqueta: 'Tarjeta 1: monto autorizado', rango: 'Q29:T31', excel: 'D8', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'dinero', de: '`tarjetas[0].montoAutorizado`' },
  { id: 'tarjeta2Monto', etiqueta: 'Tarjeta 2: monto autorizado', rango: 'P32:R33', excel: 'D13', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'dinero', de: '`tarjetas[1].montoAutorizado`' },
  { id: 'tarjeta2Autorizacion', etiqueta: 'Tarjeta 2: autorización', rango: 'M32:O33', excel: 'C13', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', ajusta: true, tipo: 'texto', imprime: false, de: '`tarjetas[1].autorizacion`', nota: 'Letra BLANCA en el Excel: se imprime pero no se ve. (La de la tarjeta 1 no se imprime: su celda, M29, está vacía.)' },
  { id: 'rentadoPor', etiqueta: 'Rentado por', rango: 'T58:U59', excel: 'C38', fuente: 'arial', pt: 10, alinea: 'center', valinea: 'center', tipo: 'texto', de: '`rentadoPor`' },
];

const porId = new Map(CAMPOS.map((c) => [c.id, c]));

/** Un campo por su id. Lanza si no existe: un id mal escrito no debe volverse un dato que no sale. */
export function campoPorId(id) {
  const c = porId.get(id);
  if (!c) throw new Error(`No hay un campo «${id}» en la hoja del contrato.`);
  return c;
}

/** Los campos que se imprimen (los de letra blanca y los textos fijos quedan fuera hasta que él diga). */
export const camposQueSeImprimen = () => CAMPOS.filter((c) => c.imprime !== false);

// ---------- Cómo se escriben las fechas en el papel ----------
// A mano, partiendo el texto 'AAAA-MM-DD': ni `Date` ni la hora del reloj (un día de diferencia por la zona horaria
// movería una fecha de renta de lugar). Lo que no es una fecha de calendario no se imprime: queda en blanco y la pantalla lo avisa.

function partesDeFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const [, anio, mes, dia] = m;
  const mm = Number(mes);
  const dd = Number(dia);
  const bisiesto = (Number(anio) % 4 === 0 && Number(anio) % 100 !== 0) || Number(anio) % 400 === 0;
  const diasDelMes = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mm < 1 || mm > 12 || dd < 1 || dd > diasDelMes[mm - 1]) return null;
  return { anio, mes, dia };
}

/**
 * Una fecha ISO como la escribe el papel, o '' si no es una fecha:
 *   'corta'  20-08-26           (fecha de salida y de entrada)
 *   'larga'  20         08         2026   (nueve espacios entre cada parte: caen en las casillas DD / MM / AAAA)
 *   'doc'    20  08    26     (vencimientos del documento y de la licencia)
 * Los espacios son los que pone el formato de número de la hoja de Excel; hay que dejarlos tal cual.
 */
export function fechaParaPapel(iso, formato) {
  const p = partesDeFecha(iso);
  if (!p) return '';
  const aa = p.anio.slice(2);
  if (formato === 'corta') return `${p.dia}-${p.mes}-${aa}`;
  if (formato === 'larga') return `${p.dia}${' '.repeat(9)}${p.mes}${' '.repeat(9)}${p.anio}`;
  if (formato === 'doc') return `${p.dia}${' '.repeat(2)}${p.mes}${' '.repeat(4)}${aa}`;
  throw new Error(`Formato de fecha desconocido: «${formato}».`);
}

// ---------- ¿Cabe el texto en su casilla? ----------
// Aproximación a propósito (sin medir con el navegador, para poder probarla): un renglón de Arial gasta en promedio
// 0.56 de su tamaño por letra, y uno de Arial Narrow 0.46. Sirve para avisar, en la pantalla y antes de imprimir,
// «esto se sale de su casilla»; no recorta ni encoge nada, porque un dato cortado en un contrato es peor que uno largo.

const ANCHO_PROMEDIO = { arial: 0.56, narrow: 0.46 };
const RENGLON = 1.15;
// Lo que Excel deja de cada lado de una casilla antes del texto: 3 unidades.
const RELLENO_MM = 3 * MM_POR_UNIDAD;
const PT_A_MM = 25.4 / 72;

/**
 * ¿El texto se sale de la casilla del campo? Con `ajusta` baja de renglón y se sale si los renglones no caben de
 * alto; sin él, se sale si su largo pasa del ancho. El tamaño de letra es el que se imprime (el de Excel × 0.89).
 */
export function textoSeSale(campo, texto) {
  const t = String(texto ?? '');
  if (!t.trim()) return false;
  const caja = cajaDeRango(campo.rango);
  const pt = campo.pt * ESCALA_EXCEL;
  const letraMm = pt * PT_A_MM;
  const largo = t.length * letraMm * ANCHO_PROMEDIO[campo.fuente];
  const util = caja.ancho - 2 * RELLENO_MM;
  if (!campo.ajusta) return largo > util;
  const renglones = Math.ceil(largo / util);
  return renglones * letraMm * RENGLON > caja.alto;
}

// ---------- La calibración ----------
// Ninguna impresora mete el papel al mismo milímetro. La calibración es UN solo cambio para toda la hoja:
//   dx, dy   cuánto se corre (mm; positivo = a la derecha / hacia abajo)
//   escala   qué tan grande sale (1 = el tamaño medido en Excel)
// y se aplica sobre la esquina de la hoja: p' = origen + escala × (p − origen) + (dx, dy). El tamaño se arregla
// primero y la posición después, y ninguno mueve al otro.

/**
 * La escala más grande con la que la hoja entera todavía cabe en la carta entre los márgenes que él le puso en Excel
 * (izquierdo 18 mm, derecho 5 mm). A tamaño de Excel la hoja mide 250 mm de ancho y la carta solo deja 193: Excel la
 * parte en dos hojas. Es el punto de partida mientras no se sepa con qué escala imprime él de verdad: la primera
 * hoja de prueba lo dice.
 */
export const ESCALA_QUE_CABE = Math.floor(((PAPEL.anchoMm - ORIGEN_MM.x - MARGEN_DERECHO_DE_EXCEL_MM) / HOJA_MM.ancho) * 100) / 100;

/** La calibración de una impresora que nadie ha calibrado todavía. */
export const CALIBRACION_DE_FABRICA = Object.freeze({ dx: 0, dy: 0, escala: ESCALA_QUE_CABE });

export const LIMITES = Object.freeze({
  dx: [-40, 40], dy: [-40, 40], escala: [0.5, 1.2],
});

/** Cuánto mueve cada tecla. */
export const PASOS = Object.freeze({
  fino: { mm: 0.1, escala: 0.001 },
  normal: { mm: 0.5, escala: 0.005 },
  grueso: { mm: 5, escala: 0.05 },
});

const dentro = (valor, [min, max]) => Number.isFinite(valor) && valor >= min && valor <= max;

/** ¿Es una calibración posible? (tres números dentro de lo razonable). */
export function calibracionValida(c) {
  return Boolean(c) && typeof c === 'object'
    && dentro(c.dx, LIMITES.dx) && dentro(c.dy, LIMITES.dy) && dentro(c.escala, LIMITES.escala);
}

const aMilesimas = (n) => Math.round(n * 1000) / 1000;

/** Recorta cada valor a lo posible y lo deja en milésimas (0.1 + 0.2 no debe dar 0.30000000000000004 en un texto). */
export function limitar(c) {
  const tope = (v, [min, max]) => aMilesimas(Math.min(max, Math.max(min, v)));
  return { dx: tope(c.dx, LIMITES.dx), dy: tope(c.dy, LIMITES.dy), escala: tope(c.escala, LIMITES.escala) };
}

/**
 * Lo que pasa al apretar una tecla en la pantalla de calibrar: las flechas mueven la hoja (←→ en x, ↑↓ en y), `+` y
 * `-` cambian su tamaño. Shift = paso fino, Ctrl/Cmd = paso grueso. Devuelve la calibración nueva, o `null` si la
 * tecla no es de calibrar (para que la pantalla no se trague teclas que no le tocan).
 */
export function aplicarTecla(cal, { key, shiftKey = false, ctrlKey = false, metaKey = false } = {}) {
  const paso = shiftKey ? PASOS.fino : (ctrlKey || metaKey ? PASOS.grueso : PASOS.normal);
  const cambios = {
    ArrowRight: { dx: paso.mm },
    ArrowLeft: { dx: -paso.mm },
    ArrowDown: { dy: paso.mm },
    ArrowUp: { dy: -paso.mm },
    '+': { escala: paso.escala },
    '=': { escala: paso.escala },
    '-': { escala: -paso.escala },
    _: { escala: -paso.escala },
  }[key];
  if (!cambios) return null;
  return limitar({
    dx: cal.dx + (cambios.dx ?? 0),
    dy: cal.dy + (cambios.dy ?? 0),
    escala: cal.escala + (cambios.escala ?? 0),
  });
}

/**
 * Dónde cae en el papel una caja de la hoja (la que da `cajaDeRango`, desde la esquina de la hoja) con una
 * calibración. Es EXACTAMENTE la misma cuenta que hace el navegador con el `transform` de la hoja
 * (`transformacionCss`); una prueba los pone a prueba el uno contra el otro.
 */
export function cajaEnPapel(caja, cal) {
  return {
    x: ORIGEN_MM.x + cal.dx + cal.escala * caja.x,
    y: ORIGEN_MM.y + cal.dy + cal.escala * caja.y,
    ancho: cal.escala * caja.ancho,
    alto: cal.escala * caja.alto,
  };
}

/** El `transform` de CSS que le hace a TODA la hoja lo mismo que `cajaEnPapel` a una caja: se aplica una sola vez. */
export function transformacionCss(cal) {
  return `translate(${aMilesimas(cal.dx)}mm, ${aMilesimas(cal.dy)}mm) scale(${aMilesimas(cal.escala)})`;
}

/** La calibración dicha con palabras, para que la lea quien calibra. */
export function textoDeCalibracion(cal) {
  const mm = (n, mas, menos) => (n === 0 ? null : `${Math.abs(n).toFixed(1)} mm ${n > 0 ? mas : menos}`);
  const partes = [mm(cal.dx, 'a la derecha', 'a la izquierda'), mm(cal.dy, 'hacia abajo', 'hacia arriba')].filter(Boolean);
  const tamano = `${(cal.escala * 100).toFixed(1)} % del tamaño de Excel`;
  return partes.length ? `${partes.join(', ')}, ${tamano}` : `sin corrimiento, ${tamano}`;
}

// ---------- Una calibración por impresora ----------
// Ninguna página puede saber qué impresora va a usar el navegador, así que el ajuste se guarda con un NOMBRE que le
// pone quien calibra («Oficina», «Mostrador») y vive en esta computadora (una impresora está conectada a una
// computadora). Es configuración del aparato, no un dato del negocio: no va a la nube.
//
// El «almacén» es cualquier cosa con getItem/setItem (en el navegador, localStorage); se recibe para poder probar sin él
// y porque leerlo puede fallar (modo privado, datos bloqueados): todo lo que sale mal deja la calibración de fábrica.

export const CLAVE_DE_CALIBRACIONES = 'bestprice.impresion.calibraciones';

/** `{ activa, impresoras: { nombre: { dx, dy, escala } } }`. Lo ilegible o imposible se descarta, no se arregla. */
export function leerCalibraciones(almacen) {
  const vacio = { activa: null, impresoras: {} };
  let crudo;
  try {
    crudo = JSON.parse(almacen.getItem(CLAVE_DE_CALIBRACIONES));
  } catch {
    return vacio;
  }
  if (!crudo || typeof crudo !== 'object' || !crudo.impresoras || typeof crudo.impresoras !== 'object') return vacio;
  const impresoras = {};
  for (const [nombre, c] of Object.entries(crudo.impresoras)) {
    if (calibracionValida(c)) impresoras[nombre] = { dx: c.dx, dy: c.dy, escala: c.escala };
  }
  const activa = typeof crudo.activa === 'string' && impresoras[crudo.activa] ? crudo.activa : null;
  return { activa, impresoras };
}

/** Guarda la calibración de una impresora y la deja como la activa. Lanza si el nombre o los números no sirven. */
export function guardarCalibracion(almacen, nombre, cal) {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) throw new Error('Ponle un nombre a la impresora para guardar su ajuste.');
  if (!calibracionValida(cal)) throw new Error('Esos números de calibración no son posibles.');
  const actuales = leerCalibraciones(almacen);
  actuales.impresoras[limpio] = { dx: cal.dx, dy: cal.dy, escala: cal.escala };
  actuales.activa = limpio;
  almacen.setItem(CLAVE_DE_CALIBRACIONES, JSON.stringify(actuales));
  return actuales;
}

/**
 * Con qué calibración se imprime ahora: `{ nombre, cal, calibrada }`. Sin impresora activa, la de fábrica y
 * `calibrada: false` — la pantalla de imprimir lo dice en voz alta, porque la primera impresión sin calibrar sale
 * corrida seguro.
 */
export function calibracionActiva(almacen) {
  const { activa, impresoras } = leerCalibraciones(almacen);
  if (!activa) return { nombre: null, cal: { ...CALIBRACION_DE_FABRICA }, calibrada: false };
  return { nombre: activa, cal: { ...impresoras[activa] }, calibrada: true };
}
