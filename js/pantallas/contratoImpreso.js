// El contrato impreso sobre el papel preimpreso (§8 del diseño, ADR-003).
//
// El papel ya trae sus líneas, su membrete y sus casillas: aquí se imprimen SOLO los datos, cada uno en el milímetro
// donde hoy lo pone la hoja «IMP. CONTRATO» del Excel del dueño (la tabla de posiciones y la forma de medirlas
// están en nucleo/hojaContrato.js). Esta pantalla sigue la misma forma que comprobante.js, el otro papel del sistema:
//
//   1. `armarContratoImpreso` recibe el contrato, el cliente y el carro ya leídos y devuelve un MODELO: el texto de
//      cada campo y los avisos. Función pura, sin DOM ni reloj. Aquí se decide qué dato alimenta cada casilla.
//   2. `htmlContratoImpreso` dibuja ese modelo, y solo ese modelo, con UN `transform` para toda la hoja (la
//      calibración de la impresora). Ningún campo tiene su propio corrimiento.
//   3. `pintarContratoImpreso` y `pintarCalibracion` son las pantallas: la barra de botones, los avisos, la vista
//      previa, y el botón de imprimir. El PDF lo hace el navegador (ADR-003).
//
// Sin cálculos propios: las cifras de cobro salen de `lineasSalida` (nucleo/contrato.js), la misma lista que ve el
// mostrador al salir el carro; el papel no lleva ningún total, así que no hay ninguna suma que pudiera
// contradecir a la pantalla. Lo único que se resta aquí es el precio por día sin seguros, que es la resta que hace
// la celda D34 del Excel y que §7b dice que se guarda justo para desglosarla al imprimir (`seguroDia` y
// `seguroTercerosDia` «se guardan para desglosarlos cuando se imprima el contrato»).
//
// ===== EL NÚMERO DE CONTRATO NO SE IMPRIME =====
// Ni Excel ni este sistema lo imprimen, y no es un olvido: viene PREIMPRESO en la papelería (las hojas membretadas), y el dueño lo
// pone al sacar el carro. Lo dijo así: «yo pongo el número de contrato porque es el que está en las hojas membretadas».
// Por eso no hay un campo de `numero` en la tabla de nucleo/hojaContrato.js.
//
// ===== LA TARJETA Y EL CBC (ADR-001) =====
// El número completo de la tarjeta y el CBC NUNCA se guardan: ni en Firestore, ni en la copia local, ni en
// localStorage, ni en la dirección de la página. Este archivo es, con «Sacar carro» (que los lee para llevarlos hasta aquí), el
// único lugar del sistema que los toca, y solo así:
//   - Los teclea quien atiende, aquí, en dos cajas que solo existen mientras la pantalla está abierta. O ya vienen puestos: si se
//     llegó aquí directo desde guardar la salida en «Sacar carro», el número y el CBC que se tecleron allá se entregan una sola vez
//     (traspasoDeTarjetas.js: en memoria, atados al id de este contrato, borrados al cambiar de pantalla y al minuto) y se ponen en
//     las mismas cajas, después de comprobar que terminan en los últimos 4 dígitos que el contrato guardó. Desde ahí es lo mismo.
//     Si no llegó nada (dirección escrita a mano, recargar, volver otro día), las cajas están vacías, como siempre.
//   - Viajan por parámetros de funciones (`tarjetasEfimeras`, nunca un campo del contrato) hasta el HTML de la
//     hoja, y de ahí a la impresora. `armarContratoImpreso` no los copia al contrato ni los devuelve en nada que se
//     parezca a un contrato.
//   - Al terminar de imprimir (o cancelar: `afterprint` avisa en los dos casos) y al salir de la pantalla, las
//     cajas se vacían y la hoja se vuelve a dibujar ENMASCARADA. Un papel que se reimprime sale con `•••• 3343`,
//     porque el número completo nunca existió en el sistema (§8 y ADR-001).
//   - La hoja con el número completo no debe guardarse como PDF: sería un archivo con tarjeta y CBC en la computadora.
//     La pantalla lo dice en voz alta, y el título del documento solo lleva el número de contrato.
import { lineasSalida, conKmSalidaNormalizado } from '../nucleo/contrato.js';
import { nombresResueltos } from '../nucleo/cliente.js';
import { q } from '../nucleo/dinero.js';
import {
  CAMPOS, ESCALA_EXCEL, ORIGEN_MM, PAPEL, HOJA_MM, cajaDeRango, campoPorId, fechaParaPapel, acomodoDeTexto,
  transformacionCss, textoDeCalibracion, aplicarTecla, calibracionActiva, guardarCalibracion,
  leerCalibraciones, CALIBRACION_DE_FABRICA, calibracionValida, camposQueSeImprimen, camposQueSePuedenDejarEnBlanco, TARIFAS_DEL_PAPEL, PASOS, camposFueraDelPapel, papelDe, PAPELES,
} from '../nucleo/hojaContrato.js';
import { dinero } from '../ui.js';
import { cargarContrato, cargarClientes, cargarFlota } from '../datos.js';
import { tomarTraspaso } from './traspasoDeTarjetas.js';

// El texto libre (nombre, dirección, observaciones) nunca entra al HTML sin pasar por aquí: mismo escape que el resto.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * ¿El papel ya trae la «Q» impresa junto a las casillas de dinero? El Excel la imprime (`Q150.00`) y el dueño contestó el
 * 14 de octubre de 2026 que su papel NO la trae: por eso se imprime, pegada al monto. Con `false` los montos saldrían sin
 * la Q (si algún día cambia de papelería y la traen, sería esta línea). La excepción son las casillas que dicen `sinQ` en la tabla
 * (hoy «LDW Q.» y «PAI Q.», que sí la traen impresa: foto de su hoja en blanco, 15 de octubre de 2026).
 */
export const QUETZAL_EN_EL_PAPEL = true;

const limpio = (x) => String(x ?? '').trim();

/** Un monto para el papel: con dinero() (la Q y los miles), y en blanco si es cero (una casilla sin dato, no «Q0.00»). */
function monto(n) {
  const x = q(n);
  if (x === 0) return '';
  const texto = dinero(x);
  return QUETZAL_EN_EL_PAPEL ? texto : sinLaQ(texto);
}

/** El monto sin su Q: '-Q50.00' queda '-50.00'. */
const sinLaQ = (texto) => texto.replace(/^(-?)Q/, '$1');

/** `•••• 3343`, igual que en el detalle del contrato (ADR-001): la reimpresión nunca lleva más que los últimos 4. */
function enmascarado(ultimos4) {
  const digitos = String(ultimos4 ?? '').replace(/\D/g, '').slice(-4);
  return digitos ? `•••• ${digitos}` : '';
}

// ---------- El modelo: qué dato alimenta cada casilla ----------

/**
 * Lo que dice el papel en cada campo de la hoja. Cada función recibe `{ contrato, cliente, carro, tarjetas, ajeno }` y
 * devuelve el texto, o '' si no hay dato. Un campo que el sistema NO tiene (`de: null` en CAMPOS) no está aquí a
 * propósito: sale en blanco, y la prueba exige que sea así — un dato inventado en un contrato firmado es peor
 * que una casilla vacía.
 */
const VALOR = {
  tarjeta1Numero: ({ tarjetas }) => tarjetas[0]?.numero ?? '',
  tarjeta1Vence: ({ contrato }) => limpio(contrato.tarjetas?.[0]?.vencimiento),
  tarjeta1Cbc: ({ tarjetas }) => tarjetas[0]?.cbc ?? '',
  tarjeta1Banco: ({ contrato }) => limpio(contrato.tarjetas?.[0]?.banco),
  tarjeta2Numero: ({ tarjetas }) => tarjetas[1]?.numero ?? '',
  tarjeta2Vence: ({ contrato }) => limpio(contrato.tarjetas?.[1]?.vencimiento),
  tarjeta2Cbc: ({ tarjetas }) => tarjetas[1]?.cbc ?? '',
  tarjeta1Monto: ({ contrato }) => monto(contrato.tarjetas?.[0]?.montoAutorizado),
  tarjeta2Monto: ({ contrato }) => monto(contrato.tarjetas?.[1]?.montoAutorizado),
  tarjeta1Autorizacion: ({ contrato }) => limpio(contrato.tarjetas?.[0]?.autorizacion),
  tarjeta2Autorizacion: ({ contrato }) => limpio(contrato.tarjetas?.[1]?.autorizacion),

  carroTipo: ({ carro, ajeno, contrato }) => limpio(ajeno ? contrato.carroAjeno?.tipo : carro?.tipo),
  // `carroDescripcion` se guardó con el contrato: es la marca y la línea de ese día (un carro ajeno solo trae la marca).
  carroMarcaLinea: ({ contrato }) => limpio(contrato.ajeno ? contrato.carroAjeno?.marca : contrato.carroDescripcion),
  carroPlacas: ({ contrato }) => limpio(contrato.carroPlacas),
  carroColor: ({ carro, ajeno, contrato }) => limpio(ajeno ? contrato.carroAjeno?.color : carro?.color),
  carroModelo: ({ carro, ajeno, contrato }) => limpio(ajeno ? contrato.carroAjeno?.modelo : carro?.modelo),
  kmSalida: ({ contrato }) => (q(contrato.kmSalida) ? String(Math.round(q(contrato.kmSalida))) : ''),
  combustibleSalida: ({ contrato }) => limpio(contrato.combustibleSalida),

  fechaSalida: ({ contrato }) => fechaParaPapel(contrato.fechaSalida, 'corta'),
  horaSalida: ({ contrato }) => limpio(contrato.horaSalida),
  lugarSalida: ({ contrato }) => limpio(contrato.lugar),
  fechaEntrada: ({ contrato }) => fechaParaPapel(contrato.devolucionPrevista, 'corta'),
  // El Excel imprime aquí la hora de SALIDA: un carro rentado por días regresa a la misma hora (ver la nota del campo).
  horaEntrada: ({ contrato }) => limpio(contrato.horaSalida),
  // Lo que el sistema no guarda (decisión del 14 de octubre de 2026, ver la nota de cada campo): se lee de lo que se
  // tecleó al imprimir (`papel`), y si no se tocó, de la salida (el lugar) o de las tarifas del código. Un `''` tecleado
  // es una casilla que se BORRÓ a propósito y sale en blanco: solo `undefined` y `null` caen al valor de siempre.
  lugarEntrada: ({ contrato, papel }) => limpio(papel.lugarEntrada ?? contrato.lugar),
  horaTardia: ({ papel }) => monto(papel.horaTardia ?? TARIFAS_DEL_PAPEL.horaTardia),
  combustiblePrecio: ({ papel }) => monto(papel.combustiblePrecio ?? TARIFAS_DEL_PAPEL.galon),
  facturarNombre: ({ papel }) => limpio(papel.facturarNombre),
  facturarNit: ({ papel }) => limpio(papel.facturarNit),

  apellido1: ({ cliente }) => nombresResueltos(cliente).apellidos,
  nombre1: ({ cliente }) => nombresResueltos(cliente).nombres,
  nacionalidad: ({ cliente }) => limpio(cliente.nacionalidad),
  fechaNacimiento: ({ cliente }) => fechaParaPapel(cliente.fechaNacimiento, 'larga'),
  correo: ({ cliente }) => limpio(cliente.correo),
  direccion: ({ cliente }) => limpio(cliente.direccionReferencia),
  municipio: ({ cliente }) => limpio(cliente.municipio),
  telefono: ({ cliente }) => limpio(cliente.telefono),
  documento: ({ cliente }) => limpio(cliente.documento),
  documentoExtendidoEn: ({ cliente }) => limpio(cliente.documentoExtendidoEn),
  documentoExpira: ({ cliente }) => fechaParaPapel(cliente.documentoExpira, 'doc'),
  licencia: ({ cliente }) => limpio(cliente.licencia),
  licenciaEmitidaEn: ({ cliente }) => limpio(cliente.licenciaEmitidaEn),
  licenciaExpira: ({ cliente }) => fechaParaPapel(cliente.licenciaExpira, 'doc'),
  conductorNombre: ({ contrato }) => limpio(contrato.conductorAdicional?.nombre),
  conductorLicencia: ({ contrato }) => limpio(contrato.conductorAdicional?.licencia),

  // El precio por día que el contrato guarda INCLUYE los dos seguros (§5); el papel los pone aparte. Un precio por
  // debajo de los seguros no es un precio: no se imprime una cifra negativa, y la pantalla lo avisa.
  precioBase: ({ contrato }) => {
    const base = q(q(contrato.precioDia) - q(contrato.seguroDia) - q(contrato.seguroTercerosDia));
    return base > 0 ? monto(base) : '';
  },
  seguroTerceros: ({ contrato }) => monto(contrato.seguroTercerosDia),
  seguro: ({ contrato }) => monto(contrato.seguroDia),
  seguroCopia: ({ contrato }) => monto(contrato.seguroDia),
  deducible: ({ contrato }) => monto(contrato.deducible),
  deducibleCopia: ({ contrato }) => monto(contrato.deducible),
  deducibleBajo: ({ contrato }) => monto(contrato.deducibleBajo),
  seguroMenores: ({ contrato }) => monto(contrato.seguroMenoresDia),
  seguroPai: ({ contrato }) => monto(contrato.seguroPaiDia),
  variosDescripcion: ({ contrato }) => limpio(contrato.variosDescripcion),
  variosPrecio: ({ contrato }) => monto(contrato.variosPrecio),
  // El destino de la carta poder se imprime aunque no tenga precio (el Excel lo hace así); el precio, de la
  // línea «Carta poder» de lineasSalida: lo mismo que ve el mostrador al salir el carro.
  cartaPoderDestino: ({ contrato }) => limpio(contrato.cartaPoderDestino),
  cartaPoderPrecio: ({ contrato }) => monto(lineasSalida(contrato).find((l) => l.concepto === 'Carta poder')?.monto),
  // El CÓDIGO del empleado que sellaba ese día el contrato, nunca su nombre: la casilla del papel dice «PREPARADO POR (CODIGO)» y mide
  // 16 mm. Ausente, `null` y `''` salen en blanco (él lo escribe a mano). No se busca en la lista de empleados de hoy: el papel de aquel
  // día llevaba el código de aquel día.
  empleadoCodigo: ({ contrato }) => limpio(contrato.empleadoCodigo),
};

/** Los textos fijos del Excel, por si algún día se imprimen (`imprime: false` hoy). */
const TEXTO_FIJO = (campo) => campo.texto;

/**
 * La tarjeta tal como se imprime. `efimera` es lo que se tecleó AHORA, solo para este papel (`{ numero, cbc }`);
 * sin ella, el número sale enmascarado con los últimos 4 que el contrato sí guarda, y el CBC en blanco.
 */
function tarjetaParaImprimir(guardada, efimera) {
  const numero = limpio(efimera?.numero);
  const cbc = limpio(efimera?.cbc);
  return {
    numero: numero || enmascarado(guardada?.ultimos4),
    cbc,
    completa: Boolean(numero),
  };
}

const CAMPOS_DE_FECHA = [
  ['fechaSalida', 'La fecha de salida'], ['fechaEntrada', 'La fecha de devolución prevista'],
  ['fechaNacimiento', 'La fecha de nacimiento del cliente'], ['documentoExpira', 'La fecha de expiración del documento'],
];
const ORIGEN_DE_FECHA = {
  fechaSalida: (c) => c.contrato.fechaSalida,
  fechaEntrada: (c) => c.contrato.devolucionPrevista,
  fechaNacimiento: (c) => c.cliente.fechaNacimiento,
  documentoExpira: (c) => c.cliente.documentoExpira,
};

/**
 * Arma lo que se imprime. LANZA si no puede identificar a quien firma o a qué carro: un papel sin el nombre del
 * cliente es peor que no tener papel, porque se firma y ya no se corrige.
 *
 * Recibe:
 * - `contrato`: el contrato guardado (§7b), con su `id`.
 * - `cliente`: el registro del cliente (`contrato.clienteId`).
 * - `carro`: el carro de la flota (`contrato.carroId`) o `null` en un carro ajeno, cuyos datos van en
 *   `contrato.carroAjeno`. Sin él, tipo, color y modelo de un carro propio salen en blanco y la pantalla avisa.
 * - `tarjetasEfimeras`: `[{ numero, cbc }]`, una por cada tarjeta del contrato, tecleadas para este papel y que
 *   NO se guardan (ADR-001). Opcional: sin ellas el número sale enmascarado.
 * - `datosDelPapel`: lo que el papel lleva y el sistema no guarda, tecleado o corregido al imprimir y tampoco guardado:
 *   `{ facturarNombre, facturarNit, lugarEntrada, horaTardia, combustiblePrecio }`. Todo opcional: sin facturar no hay
 *   a quién; el lugar de entrada es el de salida; las dos tarifas son las de `TARIFAS_DEL_PAPEL`.
 * - `enBlanco`: los id de las casillas que, EN ESTE PAPEL, se dejan en blanco (16 de noviembre de 2026). Solo cuentan las nueve de «letra blanca de Excel»
 *   (`camposQueSePuedenDejarEnBlanco`); cualquier otro id se ignora, porque un dato de tarjeta o el nombre no se borran por aquí. No toca el contrato:
 *   es de este papel, no de la renta. Sin él, las nueve se imprimen, que es lo que él decidió.
 *   El modelo devuelve `casillasOpcionales`: las nueve, con el dato que tendrían y si se imprimen, para que la pantalla las muestre.
 */
export function armarContratoImpreso({
  contrato, cliente, carro = null, tarjetasEfimeras = [], datosDelPapel = {}, enBlanco = [],
} = {}) {
  if (!contrato || typeof contrato !== 'object' || !contrato.id) {
    throw new Error('Falta el contrato guardado que se va a imprimir.');
  }
  // El puente de lectura del kilometraje (§7b): un contrato guardado cuando «Sacar carro» lo escribía como `kilometrajeSalida` lo trae
  // con ese nombre. Las demás pantallas que lo leen (recibir, el detalle, el mantenimiento) pasan por `conKmSalidaNormalizado`; esta
  // hoja se lo saltaba y dejaba en blanco la casilla del kilometraje en un papel que se firma. Se normaliza aquí, una vez, para todas
  // las casillas que lean `contrato`.
  contrato = conKmSalidaNormalizado(contrato);
  if (!cliente || typeof cliente !== 'object') {
    throw new Error(
      `No se encontró al cliente del contrato N.° ${contrato.numero ?? '—'}: sin sus datos el papel saldría sin nombre ni documento. Recarga la pantalla e intenta de nuevo.`,
    );
  }
  const ajeno = Boolean(contrato.ajeno);
  const guardadas = Array.isArray(contrato.tarjetas) ? contrato.tarjetas : [];
  const efimeras = Array.isArray(tarjetasEfimeras) ? tarjetasEfimeras : [];
  const tarjetas = guardadas.map((t, i) => tarjetaParaImprimir(t, efimeras[i]));

  const papel = datosDelPapel && typeof datosDelPapel === 'object' ? datosDelPapel : {};
  const contexto = {
    contrato, cliente, carro, tarjetas, ajeno, papel,
  };
  const valores = {};
  // Solo las nueve de letra blanca entran en la cuenta de más abajo (`campo.blancaEnExcel`): un id que no sea de ellas no hace nada.
  const aBlanco = new Set(Array.isArray(enBlanco) ? enBlanco : []);
  const casillasOpcionales = [];
  // `avisos` son cosas que pueden salir mal en el papel (una fecha inválida, un texto que se sale, una tarjeta que no coincide);
  // `notas` son lo normal que conviene saber (la tarjeta de una reimpresión sale enmascarada). Las primeras van en rojo.
  const avisos = [];
  const notas = [];

  for (const campo of CAMPOS) {
    if (campo.tipo === 'etiqueta') {
      valores[campo.id] = TEXTO_FIJO(campo);
    } else if (VALOR[campo.id]) {
      // Si su casilla del papel ya trae la Q (o Excel no la imprime ahí), el monto sale sin ella: lo dice la tabla (`sinQ`), no este archivo.
      const texto = VALOR[campo.id](contexto);
      valores[campo.id] = campo.sinQ ? sinLaQ(texto) : texto;
    } else {
      // Sin fuente en el sistema (`de: null`): en blanco, y la hoja de prueba lo dice.
      valores[campo.id] = '';
    }
    if (campo.blancaEnExcel) {
      // Se arma el dato completo y DESPUÉS se deja en blanco si él lo pidió: así la pantalla sigue mostrando qué dato iría ahí.
      casillasOpcionales.push({
        id: campo.id, etiqueta: campo.etiqueta, valor: valores[campo.id], imprime: !aBlanco.has(campo.id),
      });
      if (aBlanco.has(campo.id)) valores[campo.id] = '';
    }
  }

  // Lo que se pidió imprimir y no se pudo escribir.
  for (const [id, quien] of CAMPOS_DE_FECHA) {
    const crudo = ORIGEN_DE_FECHA[id](contexto);
    if (limpio(crudo) && !valores[id]) {
      avisos.push(`${quien} no es una fecha válida («${limpio(crudo)}»): sale en blanco en el papel.`);
    }
  }
  if (!ajeno && !carro) {
    avisos.push('No se encontró la ficha del carro: el tipo, el color y el modelo salen en blanco en el papel.');
  }
  if (q(contrato.precioDia) && q(contrato.precioDia) - q(contrato.seguroDia) - q(contrato.seguroTercerosDia) <= 0) {
    avisos.push('El precio por día no pasa de lo que suman el seguro y el seguro de terceros: el precio sin seguros sale en blanco.');
  }
  tarjetas.forEach((t, i) => {
    const tecleado = String(efimeras[i]?.numero ?? '').replace(/\D/g, '');
    const guardado = String(guardadas[i]?.ultimos4 ?? '').replace(/\D/g, '');
    if (t.completa && guardado && tecleado.slice(-4) !== guardado.slice(-4)) {
      avisos.push(
        `Tarjeta ${i + 1}: el número que tecleaste no termina en los últimos 4 dígitos de la tarjeta de este contrato (${enmascarado(guardado)}). `
        + 'Revisa que no sea otra tarjeta o un error de dedo antes de imprimir.',
      );
    }
    if (!t.completa) {
      notas.push(
        `Tarjeta ${i + 1}: el papel llevará el número enmascarado (${t.numero || '••••'}) y el CBC en blanco, porque el sistema nunca guarda el número completo ni el CBC. `
        + 'Para imprimirlos, tecléalos abajo: solo se usan para este papel.',
      );
    }
  });
  // Un texto más largo que su casilla NO se avisa por ser largo: decisión del dueño del 16 de noviembre de 2026
  // («no importa que la palabra FULL se salga un poquito de los cuadros»), y de todos modos la hoja lo acomoda hacia el
  // lado libre. Se avisa SOLO cuando lo que sobra caería sobre la casilla de otro dato, que es lo que sí arruina el
  // papel: dos datos encima. Los textos fijos de Excel no cuentan (se salen a propósito, y nadie puede corregirlos).
  for (const campo of camposQueSeImprimen()) {
    const { pisa, seCorta } = acomodoDeTexto(campo, valores[campo.id]);
    if (pisa) {
      avisos.push(
        `«${campo.etiqueta}» no cabe en su casilla del papel y se montaría encima de «${campoPorId(pisa)?.etiqueta ?? pisa}». Acórtalo.`,
      );
    } else if (seCorta) {
      avisos.push(`«${campo.etiqueta}» no cabe en su casilla del papel y se pasaría del borde de la hoja: ahí se cortaría. Acórtalo.`);
    }
  }

  return {
    contratoId: contrato.id,
    numero: contrato.numero ?? null,
    valores,
    tarjetas: tarjetas.map((t) => ({ completa: t.completa })),
    casillasOpcionales,
    avisos,
    notas,
  };
}

// ---------- La hoja ----------

const FUENTE_CSS = { arial: 'hc-arial', narrow: 'hc-narrow' };
const ALINEA_CSS = { left: 'hc-izq', center: 'hc-centro', right: 'hc-der', general: 'hc-izq' };
const VALINEA_CSS = { top: 'hc-arriba', center: 'hc-medio', bottom: 'hc-abajo' };

const mm = (n) => `${Math.round(n * 1000) / 1000}mm`;

/** El estilo de posición de un campo: su caja en la carta SIN calibración (la calibración es del lienzo entero). */
function estiloDeCaja(campo) {
  const caja = cajaDeRango(campo.rango);
  return `left:${mm(ORIGEN_MM.x + caja.x)};top:${mm(ORIGEN_MM.y + caja.y)};width:${mm(caja.ancho)};height:${mm(caja.alto)};`
    + `font-size:${Math.round(campo.pt * ESCALA_EXCEL * 1000) / 1000}pt;`;
}

// Los campos de fecha con espacios entre sus partes (los espacios caen en las casillas DD / MM / AAAA del papel) y los
// textos fijos de Excel («TARJETA 1  No:», « + iva»): el navegador no debe juntar sus espacios.
const CON_ESPACIOS = new Set(['fechaLarga', 'fechaDoc', 'etiqueta']);

// Con qué alineación se dibuja: la de su celda de Excel, salvo que el texto no quepa y haya que mandarlo al lado libre
// (`acomodoDeTexto`, §8 del diseño).
function claseDeCampo(campo, texto) {
  const { alinea } = acomodoDeTexto(campo, texto);
  return [
    'hc-campo', FUENTE_CSS[campo.fuente], ALINEA_CSS[alinea] ?? 'hc-izq', VALINEA_CSS[campo.valinea] ?? 'hc-abajo',
    campo.ajusta ? 'hc-ajusta' : '', CON_ESPACIOS.has(campo.tipo) ? 'hc-pre' : '',
  ].filter(Boolean).join(' ');
}

/**
 * Lo de dentro de la casilla. Un monto de formato CONTABLE (`contable` en la tabla) va como lo pone Excel: la «Q» en el borde izquierdo y el
 * número en el derecho, con un hueco en medio; sin la «Q» (casillas que dicen `sinQ`), solo el número, en el borde derecho, donde Excel lo
 * pone. Todo lo demás va en un solo texto, en la alineación de su celda.
 */
function contenidoDeCampo(campo, texto) {
  if (!campo.contable) return `<span class="hc-t">${esc(texto)}</span>`;
  const m = /^(-?)Q(.*)$/s.exec(texto);
  const q = m ? '<i class="hc-q">Q</i>' : '';
  const numero = m ? `${m[1]}${m[2]}` : texto;
  return `<span class="hc-t hc-contable">${q}<b class="hc-n">${esc(numero)}</b></span>`;
}

function campoHtml(campo, texto) {
  return `<div class="${claseDeCampo(campo, texto)}" data-campo="${esc(campo.id)}" style="${estiloDeCaja(campo)}">${contenidoDeCampo(campo, texto)}</div>`;
}

/**
 * La hoja, como texto HTML. Función pura: recibe el modelo de `armarContratoImpreso` y la calibración, y nada más.
 * Una caja del tamaño de la carta, sin margen, y dentro un solo lienzo con el único `transform` de la hoja.
 */
export function htmlContratoImpreso(modelo, cal = CALIBRACION_DE_FABRICA) {
  const campos = camposQueSeImprimen()
    .filter((c) => modelo.valores[c.id])
    .map((c) => campoHtml(c, modelo.valores[c.id]))
    .join('\n    ');
  const papel = papelDe(cal);
  return `<article class="hoja-contrato" aria-label="Contrato N.° ${esc(modelo.numero ?? '')}" style="width:${papel.anchoMm}mm;height:${papel.altoMm}mm">
  <div class="hc-lienzo" style="transform-origin:${mm(ORIGEN_MM.x)} ${mm(ORIGEN_MM.y)};transform:${transformacionCss(cal)};">
    ${campos}
  </div>
</article>`;
}

// ---------- La hoja de prueba ----------

const NUMERAR_CADA_MM = 10;

/** Una regla en los dos bordes del papel (carta u oficio): marcas cada 5 mm, número cada 10 mm. NO se corre con la calibración. */
function reglaHtml(papel) {
  const marcas = [];
  for (let x = 0; x <= papel.anchoMm; x += 5) {
    const larga = x % NUMERAR_CADA_MM === 0;
    marcas.push(`<i class="hp-marca hp-marca-x${larga ? ' hp-larga' : ''}" style="left:${x}mm"></i>`);
    if (larga && x > 0 && x < papel.anchoMm) marcas.push(`<b class="hp-num hp-num-x" style="left:${x}mm">${x}</b>`);
  }
  for (let y = 0; y <= papel.altoMm; y += 5) {
    const larga = y % NUMERAR_CADA_MM === 0;
    marcas.push(`<i class="hp-marca hp-marca-y${larga ? ' hp-larga' : ''}" style="top:${y}mm"></i>`);
    if (larga && y > 0 && y < papel.altoMm) marcas.push(`<b class="hp-num hp-num-y" style="top:${y}mm">${y}</b>`);
  }
  return marcas.join('');
}

/**
 * Las cuatro casillas con que se compara la hoja de prueba contra el formulario: una en cada esquina, para que la posición
 * y el tamaño se vean a la vez. Salen de la tabla por su id (una prueba comprueba que existan): el dueño las conoce por su
 * nombre en el formulario. La 1 manda sobre la posición (es la esquina que no se mueve al cambiar el tamaño) y la 4 sobre el
 * tamaño.
 */
export const HITOS = [
  { n: 1, id: 'tarjeta1Numero', que: 'número de tarjeta', donde: 'arriba a la izquierda' },
  { n: 2, id: 'fechaSalida', que: 'fecha de salida', donde: 'arriba a la derecha' },
  { n: 3, id: 'licencia', que: 'licencia', donde: 'abajo a la izquierda' },
  { n: 4, id: 'empleadoCodigo', que: 'preparado por (código)', donde: 'abajo a la derecha' },
];

/** Las marcas de la regla con que se mide la escala de la impresión: 100 mm entre ellas. */
export const MARCAS_DE_ESCALA = { desde: 10, hasta: 110 };

const aTexto = (n) => String(n);
const LEYENDA_DE_HITOS = HITOS.map((h) => `${h.n} = ${h.que} (${h.donde})`).join(' · ');
const TOQUE_MM = aTexto(PASOS.normal.mm);

/**
 * Lo que dice, en palabras, qué comparar y en qué orden. Se escribe UNA vez y sale en la pantalla de calibrar (completo) y
 * en la hoja impresa (la versión corta de abajo): esta hoja es la única parte del sistema donde el dueño es el
 * instrumento de medición, y una hoja que no se entiende convierte un minuto en una tarde. El orden importa: primero se
 * comprueba que la impresora no encogió la hoja, después se mira la casilla 1 (posición) y al final la 4 (tamaño); como el
 * tamaño se cambia desde la esquina de arriba a la izquierda, arreglar la 4 no desarregla la 1.
 */
export const PASOS_DE_CALIBRAR = [
  {
    titulo: 'Que la impresora no encoja la hoja',
    texto: `Con una regla de verdad, mide la distancia entre la marca ${MARCAS_DE_ESCALA.desde} y la marca ${MARCAS_DE_ESCALA.hasta} de la regla del borde de arriba. Tiene que medir ${MARCAS_DE_ESCALA.hasta - MARCAS_DE_ESCALA.desde} mm. Si mide menos, la impresora achicó la hoja: revisa que la escala del diálogo de imprimir sea «100 %» y vuelve a imprimirla.`,
    corto: `Mide con regla de la marca ${MARCAS_DE_ESCALA.desde} a la ${MARCAS_DE_ESCALA.hasta}: tienen que ser ${MARCAS_DE_ESCALA.hasta - MARCAS_DE_ESCALA.desde} mm. Si no, al imprimir elige escala «100 %».`,
  },
  {
    titulo: 'Ponla sobre tu formulario',
    texto: `Pon la hoja impresa sobre tu formulario preimpreso, contra la luz. Fíjate en las cuatro casillas con número: ${LEYENDA_DE_HITOS}. ¿Cada una cae dentro de su casilla del formulario? Además hay una casilla de raya de trazos largos, marcada «derivada, no medida»: es la autorización de la tarjeta 1, que en Excel nunca se imprimió y cuya posición se dedujo; mírala con más atención.`,
    corto: `Pon la hoja contra la luz sobre tu formulario. Casillas con número: ${LEYENDA_DE_HITOS}.`,
  },
  {
    titulo: 'Primero la posición (casilla 1)',
    texto: `Mira la casilla 1. Mide con la regla cuántos milímetros está corrida y hacia dónde, y en esta pantalla pulsa la flecha contraria: si cae demasiado a la derecha, pulsa ←; demasiado abajo, pulsa ↑. Cada toque mueve la hoja ${TOQUE_MM} mm (con Shift, ${aTexto(PASOS.fino.mm)} mm; con Ctrl o Cmd, ${aTexto(PASOS.grueso.mm)} mm).`,
    corto: `POSICIÓN: mira la 1. Mide cuánto se corrió y pulsa en el sistema la flecha contraria. Cada toque = ${TOQUE_MM} mm (Shift = ${aTexto(PASOS.fino.mm)}; Ctrl/Cmd = ${aTexto(PASOS.grueso.mm)}).`,
  },
  {
    titulo: 'Después el tamaño (casilla 4)',
    texto: 'Ahora mira la casilla 4, la de abajo a la derecha. Si cae más lejos que su casilla del formulario, la hoja salió grande: pulsa −. Si cae antes, pulsa +. La casilla 1 no se mueve cuando cambias el tamaño. Cada toque corre esa esquina poco más de 1 mm.',
    corto: 'TAMAÑO: mira la 4. Si cae más allá de su casilla, pulsa −; si cae antes, pulsa +. La 1 no se mueve.',
  },
  {
    titulo: 'Comprueba y guarda',
    texto: 'Imprime otra vez la hoja de prueba y comprueba las cuatro casillas. Cuando calcen, escribe el nombre de esta impresora y pulsa «Guardar ajuste». Desde entonces el contrato sale con ese ajuste.',
    corto: 'Imprime otra vez. Cuando calcen las cuatro, escribe el nombre de la impresora y pulsa «Guardar ajuste».',
  },
];

/**
 * Lo que el dueño ve en la hoja de prueba sobre LDW y PAI (16 de noviembre de 2026). Su formulario ya trae «LDW Q.» y «PAI Q.» impresas y él pidió que
 * todo monto lleve la Q («A todo lo que sea dinero ponle la Q.»): esas dos casillas van a leerse «Q. Q150.00». Se le dijo y decidió dos veces; el
 * sistema hace lo que pidió. Esta hoja es donde él mide con su formulario enfrente, así que aquí se ve con sus propios ojos, sin discutirlo: las dos
 * casillas llevan una muestra «Q150.00» dibujada por el mismo código que dibuja el contrato.
 */
export const AVISO_DE_LA_Q = 'LDW y PAI: tu formulario ya trae «LDW Q.» y «PAI Q.»; el contrato pone su Q: ahí leerás «Q. Q150.00» (muestra en esas dos casillas).';

/** La muestra de dinero de esas casillas: el mismo `monto()` del contrato, no un texto escrito aparte. */
const MUESTRA_DE_DINERO = monto(150);

/**
 * Cómo se llama una casilla en la hoja de prueba: con las palabras del dueño («Placas», «Fecha de salida»), no con el nombre que
 * le damos en el código. Un texto fijo de Excel se muestra con su propio texto.
 */
function nombreEnLaPrueba(campo) {
  const nombre = campo.tipo === 'etiqueta' ? campo.texto.trim() : campo.etiqueta;
  return campo.derivada ? `${nombre} (DERIVADA, no medida)` : nombre;
}

/**
 * La hoja de prueba: lo que se imprime en papel blanco y se pone contra la luz sobre el formulario preimpreso para
 * que calce.
 *   - Una regla en los bordes de la carta, en milímetros. No se corre con la calibración: dice dónde mete la
 *     impresora el papel, y si la escala de la impresión es de verdad 100 % (la marca de 100 mm tiene que caer a 100 mm
 *     de una regla de verdad).
 *   - Los pasos, en palabras, abajo (ver PASOS_DE_CALIBRAR). Tampoco se corren.
 *   - El rectángulo de la hoja entera y una cruz en cada una de sus cuatro esquinas.
 *   - Una caja por cada campo, con su nombre, en el lugar donde se imprimiría. Cuatro de ellas (los HITOS) van en
 *     grueso y con su número: son con las que se compara.
 * Todo lo que no es regla ni texto va dentro del mismo lienzo con el mismo `transform` que la hoja del contrato.
 */
export function htmlHojaDePrueba(cal = CALIBRACION_DE_FABRICA, { impresora = null } = {}) {
  const papel = papelDe(cal);
  const hito = new Map(HITOS.map((h) => [h.id, h]));
  const cajas = CAMPOS.map((c) => {
    const imprime = c.imprime !== false;
    const h = hito.get(c.id);
    const clase = `hp-caja${imprime ? '' : ' hp-no'}${h ? ' hp-hito-caja' : ''}${c.derivada ? ' hp-derivada' : ''}`;
    return `<div class="${clase}" data-campo="${esc(c.id)}" style="${estiloDeCaja(c).replace(/font-size:[^;]+;/, '')}"><span>${esc(nombreEnLaPrueba(c))}</span></div>`;
  }).join('\n    ');
  // Las casillas cuyo formulario ya trae la Q: la muestra se dibuja con `campoHtml`, o sea EXACTAMENTE como saldrá en el contrato (la Q a la izquierda, el número a la derecha).
  const muestras = CAMPOS.filter((c) => c.papelTraeLaQ).map((c) => campoHtml(c, MUESTRA_DE_DINERO).replace('class="', 'class="hp-muestra ').replace('data-campo=', 'data-muestra=')).join('\n    ');
  const insignias = HITOS.map((h) => {
    const caja = cajaDeRango(campoPorId(h.id).rango);
    return `<b class="hp-hito" data-hito="${h.n}" style="left:${mm(ORIGEN_MM.x + caja.x)};top:${mm(ORIGEN_MM.y + caja.y)}">${h.n}</b>`;
  }).join('');
  const esquina = (x, y, clase) => `<i class="hp-cruz ${clase}" style="left:${mm(ORIGEN_MM.x + x)};top:${mm(ORIGEN_MM.y + y)}"></i>`;
  const marco = `<div class="hp-marco" style="left:${mm(ORIGEN_MM.x)};top:${mm(ORIGEN_MM.y)};width:${mm(HOJA_MM.ancho)};height:${mm(HOJA_MM.alto)}"></div>`;
  const rotulo = `<strong>HOJA DE PRUEBA</strong> (no es el contrato)${impresora ? ` · impresora «${esc(impresora)}»` : ''} · papel ${esc(papel.nombre)} · ${esc(textoDeCalibracion(cal))}<br>Cada rectángulo marca dónde se escribirá un dato. Los cuatro con número y borde grueso son con los que se compara. Las reglas de los bordes están en milímetros. La casilla de raya de trazos largos («derivada») no se midió en Excel: mírala con más atención.<br><strong>${esc(AVISO_DE_LA_Q)}</strong>`;
  const pasos = PASOS_DE_CALIBRAR.map((p, i) => `<li><b>${i + 1}.</b> ${esc(p.corto)}</li>`).join('');
  return `<article class="hoja-contrato hoja-de-prueba" aria-label="Hoja de prueba" style="width:${papel.anchoMm}mm;height:${papel.altoMm}mm">
  <div class="hp-regla">${reglaHtml(papel)}</div>
  <p class="hp-rotulo">${rotulo}</p>
  <ol class="hp-pasos">${pasos}</ol>
  <div class="hc-lienzo" style="transform-origin:${mm(ORIGEN_MM.x)} ${mm(ORIGEN_MM.y)};transform:${transformacionCss(cal)};">
    ${marco}
    ${esquina(0, 0, 'hp-nw')}${esquina(HOJA_MM.ancho, 0, 'hp-ne')}${esquina(0, HOJA_MM.alto, 'hp-sw')}${esquina(HOJA_MM.ancho, HOJA_MM.alto, 'hp-se')}
    ${cajas}
    ${muestras}
    ${insignias}
  </div>
</article>`;
}

// ---------- Las pantallas ----------

/**
 * El nombre con que Chrome y Safari proponen guardar el PDF es el título de la página. Se pone el del contrato mientras
 * el diálogo está abierto y se devuelve el de antes cuando termina (imprimió o canceló): `afterprint` avisa en los
 * dos casos. Devuelve a `alTerminar` para vaciar lo que no debe quedarse (ADR-001).
 */
function imprimirConTitulo(titulo, imprimir, alTerminar) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    imprimir();
    alTerminar?.();
    return;
  }
  const antes = document.title;
  const devolver = () => {
    document.title = antes;
    window.removeEventListener('afterprint', devolver);
    alTerminar?.();
  };
  document.title = titulo;
  window.addEventListener('afterprint', devolver);
  imprimir();
}

/** El almacén del navegador, o uno que no guarda nada si el navegador no deja (modo privado, datos bloqueados). */
function almacenDelNavegador() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // acceso bloqueado: se sigue sin almacén
  }
  return {
    getItem: () => null,
    setItem: () => { throw new Error('El navegador no deja guardar datos en esta computadora.'); },
  };
}

/**
 * Pone, mientras esta pantalla esté abierta, la regla de página sin margen y del tamaño del papel (carta u oficio). Van DOS reglas:
 * la suelta (Safari y los demás) y la de la página CON NOMBRE de css/contrato-papel.css, que en Chrome manda sobre la suelta y que
 * en el CSS dice carta: sin pisarla, un oficio saldría en una página de carta.
 */
const ID_ESTILO_DE_PAGINA = 'hc-estilo-de-pagina';
let ventanaQueEscucha = null;
function ponerPaginaSinMargen(papel = PAPELES.carta) {
  if (typeof document === 'undefined') return;
  quitarPaginaSinMargen();
  const estilo = document.createElement('style');
  estilo.id = ID_ESTILO_DE_PAGINA;
  const pagina = `size: ${papel.anchoMm}mm ${papel.altoMm}mm; margin: 0;`;
  estilo.textContent = `@page { ${pagina} } @page contrato-papel { ${pagina} }`;
  document.head.appendChild(estilo);
  // Una sola escucha del cambio de pantalla aunque se vuelva a poner la regla (al cambiar de papel en calibrar): se pide una vez por ventana.
  if (ventanaQueEscucha !== window) {
    ventanaQueEscucha = window;
    window.addEventListener('hashchange', () => { ventanaQueEscucha = null; quitarPaginaSinMargen(); }, { once: true });
  }
}
function quitarPaginaSinMargen() {
  if (typeof document === 'undefined') return;
  document.getElementById(ID_ESTILO_DE_PAGINA)?.remove();
}

const textoDeImpresora = ({ nombre, cal, calibrada }) => (calibrada
  ? `Impresora «${esc(nombre)}», papel ${esc(papelDe(cal).nombre)}: ${esc(textoDeCalibracion(cal))}.`
  : `Esta computadora todavía no tiene una impresora calibrada: el primer papel sale corrido (ajuste de fábrica, papel ${esc(papelDe(cal).nombre)}: ${esc(textoDeCalibracion(cal))}).`);

/** Lo que se dice cuando una calibración dejaría casillas fuera del papel (de la carta o del oficio). */
function textoDeCortadas(ids, papel = PAPELES.carta) {
  const nombres = ids.map((id) => campoPorId(id).etiqueta).join(', ');
  return `Con la calibración de esta impresora ${ids.length === 1 ? 'una casilla se sale' : `${ids.length} casillas se salen`} ${papel.de} y se cortarían en el papel: ${nombres}. Achica la hoja en «Calibrar impresora» (tecla −).`;
}

/** El renglón de «Ajuste: …» de la pantalla de calibrar, con el aviso si el ajuste deja casillas fuera del papel. */
function lecturaDe(cal, prefijo = '') {
  const cortadas = camposFueraDelPapel(cal);
  return `${prefijo}Ajuste: ${textoDeCalibracion(cal)}.${cortadas.length ? ` ${textoDeCortadas(cortadas, papelDe(cal))}` : ''}`;
}

/** Cómo se configura el diálogo de imprimir para cada papel. El oficio mide 8.5 × 13 pulgadas, y NO es «Legal» (que mide 14). */
function ayudaDeImprimir(papel = PAPELES.carta) {
  const tamano = papel.clave === 'oficio'
    ? 'tamaño Oficio de 8.5 × 13 pulgadas (21.6 × 33 cm; en el diálogo puede llamarse «Oficio» o «Folio», no «Legal», que mide 14 pulgadas)'
    : 'tamaño Carta';
  return `En el diálogo de imprimir pon siempre: ${tamano}, escala 100 % (no «Ajustar a la página»), márgenes «Ninguno» y sin encabezados ni pies de página.`;
}
const AVISO_DE_TARJETA = 'Este papel lleva el número completo de la tarjeta y el CBC: imprímelo directo a la impresora. NO lo guardes como PDF: quedaría un archivo con la tarjeta en la computadora (ADR-001).';

/**
 * De lo que llegó de «Sacar carro» (`llegadas`, `[{ numero, cbc }]`, una por tarjeta del contrato y en su orden), lo que de verdad
 * se pone en las cajas de ESTA hoja: `{ puestas: [{ i, numero, cbc }], descartadas: [i] }`. Una tarjeta llegada solo se pone si existe en
 * el contrato en esa misma posición y su número termina en los últimos 4 dígitos que el contrato guardó (si no trae número, el
 * contrato tampoco tenía): es la última defensa contra la peor equivocación posible, la tarjeta de un cliente en el papel de
 * otro, por si el traspaso (que ya va atado al id del contrato y se borra al cambiar de pantalla) fallara por una razón que
 * hoy no se ve. Lo que no coincide NO se pone, y se dice. Función pura.
 */
export function tarjetasDelTraspasoParaElPapel(guardadas, llegadas) {
  const delContrato = Array.isArray(guardadas) ? guardadas : [];
  const lista = Array.isArray(llegadas) ? llegadas : [];
  const terminaEn = (x) => String(x ?? '').replace(/\D/g, '').slice(-4);
  const puestas = [];
  const descartadas = [];
  lista.forEach((t, i) => {
    const numero = limpio(t?.numero);
    const cbc = limpio(t?.cbc);
    if (!numero && !cbc) return;
    const guardada = delContrato[i];
    if (!guardada || terminaEn(numero) !== terminaEn(guardada.ultimos4)) {
      descartadas.push(i);
      return;
    }
    puestas.push({ i, numero, cbc });
  });
  return { puestas, descartadas };
}

/** Lo que dice la pantalla sobre lo que llegó de «Sacar carro». Nunca lleva el número ni el CBC, solo el lugar de la tarjeta. */
function notasDelTraspaso({ puestas, descartadas }) {
  const puesta = puestas.map(({ i }) => `<p class="comp-ayuda no-imprimir">Tarjeta ${i + 1}: el número y el CBC ya están puestos, vienen de «Sacar carro». Solo viven en esta pantalla: se borran al terminar de imprimir y al salir.</p>`);
  const dudosa = descartadas.map((i) => `<div class="barra-lectura-fallida no-imprimir" role="alert"><p>Tarjeta ${i + 1}: lo que llegó de «Sacar carro» no coincide con la tarjeta de este contrato y NO se puso. Tecléalo abajo.</p></div>`);
  return [...puesta, ...dudosa].join('');
}

function cajasDeTarjetas(contrato) {
  const guardadas = Array.isArray(contrato?.tarjetas) ? contrato.tarjetas : [];
  if (!guardadas.length) return '';
  const una = (t, i) => `<fieldset class="hc-tarjeta">
      <legend>Tarjeta ${i + 1}${t?.ultimos4 ? ` (${esc(enmascarado(t.ultimos4))})` : ''}</legend>
      <label>Número completo <input type="text" id="hc-t${i}-numero" inputmode="numeric" autocomplete="off" spellcheck="false"></label>
      <label>CBC <input type="password" id="hc-t${i}-cbc" inputmode="numeric" autocomplete="off" spellcheck="false" size="5"></label>
    </fieldset>`;
  return `<section class="hc-tarjetas no-imprimir" aria-label="Número completo y CBC">
    <p class="comp-ayuda">${esc(AVISO_DE_TARJETA)}</p>
    ${guardadas.map(una).join('\n    ')}
  </section>`;
}

// Lo que el papel lleva y el sistema NO guarda (decisión del 14 de octubre de 2026; ver la nota de cada campo en
// nucleo/hojaContrato.js): a quién se factura se teclea, y el lugar de entrada y las dos tarifas se precargan y se corrigen
// aquí mismo. Nada de esto va al contrato, a Firestore ni a ningún almacén: viaja de estas cajas a la hoja y se borra al
// terminar de imprimir, como el CBC.
const DATOS_DEL_PAPEL = [
  { id: 'hc-facturar-nombre', clave: 'facturarNombre', etiqueta: 'Facturar a (persona o empresa)' },
  { id: 'hc-facturar-nit', clave: 'facturarNit', etiqueta: 'NIT' },
  { id: 'hc-lugar-entrada', clave: 'lugarEntrada', etiqueta: 'Lugar de entrada' },
  { id: 'hc-tarifa-hora-tardia', clave: 'horaTardia', etiqueta: 'Hora tardía (Q)', numero: true },
  { id: 'hc-tarifa-galon', clave: 'combustiblePrecio', etiqueta: 'Combustible a (Q por galón)', numero: true },
];

/** Con qué se llenan esas cajas al abrir la pantalla y al terminar de imprimir. */
function inicialesDelPapel(contrato) {
  return {
    facturarNombre: '',
    facturarNit: '',
    lugarEntrada: limpio(contrato?.lugar),
    horaTardia: String(TARIFAS_DEL_PAPEL.horaTardia),
    combustiblePrecio: String(TARIFAS_DEL_PAPEL.galon),
  };
}

function cajasDelPapel(contrato) {
  const inicial = inicialesDelPapel(contrato);
  const una = (d) => `<label>${esc(d.etiqueta)} <input type="${d.numero ? 'number' : 'text'}" id="${d.id}"${d.numero ? ' step="0.01" min="0"' : ''} value="${esc(inicial[d.clave])}" autocomplete="off" spellcheck="false"></label>`;
  return `<section class="hc-datos no-imprimir" aria-label="Datos que lleva el papel y el sistema no guarda">
    <p class="comp-ayuda">Estos datos salen en el papel y NO se guardan en el sistema: se borran al terminar de imprimir. El lugar de entrada y las dos tarifas ya vienen puestos; corrígelos si esta renta es distinta.</p>
    ${DATOS_DEL_PAPEL.map(una).join('\n    ')}
  </section>`;
}

/**
 * Las nueve casillas de «letra blanca de Excel», cada una con su marca de «se imprime» (16 de noviembre de 2026: «Las 9 celdas sí imprímelas. Pero dame la
 * opción de ponerlas en blanco cuando necesite.»). Todas marcadas al abrir: imprimir es lo que decidió, y dejar una en blanco es lo que hace a propósito
 * en ESE papel. Nada de esto se guarda (ni en el contrato ni en el navegador): se vuelve a empezar con las nueve marcadas en cada contrato y al terminar
 * de imprimir, para que lo que se quitó con un cliente no se quede quitado en el siguiente sin que nadie se acuerde. Cada casilla enseña el dato que
 * llevaría, para que él decida sin buscarlo en otra pantalla; una sin dato lo dice y no hay nada que quitar.
 */
const ID_BLANCO = (id) => `hc-blanco-${id}`;
function cajasDeCasillasOpcionales(opcionales) {
  const una = (o) => `<label class="hc-blanco"><input type="checkbox" id="${ID_BLANCO(o.id)}" data-casilla="${esc(o.id)}" checked> ${esc(o.etiqueta)}: <span class="hc-blanco-valor">${o.valor ? esc(o.valor) : '(sin dato: sale vacía de todos modos)'}</span></label>`;
  return `<section class="hc-blancos no-imprimir" aria-label="Casillas que se pueden dejar en blanco">
    <p class="comp-ayuda">Estas nueve casillas se imprimen. Quita la marca de las que quieras dejar en BLANCO en este papel: solo vale para este papel, no se guarda, y el siguiente contrato las vuelve a imprimir todas.</p>
    ${opcionales.map(una).join('\n    ')}
    <p><button type="button" class="btn" data-accion="blancos-todas">Dejar las nueve en blanco</button></p>
  </section>`;
}

/** Lo que se dice, junto al botón de imprimir, cuando hay casillas que NO saldrán: tiene que verse ANTES de imprimir, no descubrirse en el papel. */
function textoDeLasQueQuedanEnBlanco(opcionales) {
  const fuera = opcionales.filter((o) => !o.imprime);
  if (!fuera.length) return '';
  const nombres = fuera.map((o) => o.etiqueta).join(', ');
  return `<p class="hc-en-blanco no-imprimir" role="status"><strong>En blanco en este papel (${fuera.length} de ${opcionales.length}):</strong> ${esc(nombres)}. Vuelven a imprimirse en el próximo contrato.</p>`;
}

/**
 * Dibuja el contrato impreso en `contenedor`. Devuelve el modelo, o `null` si no se pudo armar.
 *
 * Si `armarContratoImpreso` lanza NO se dibuja una hoja: se dibuja una barra roja que dice por qué (como el comprobante).
 * `entrada` es `{ contrato, cliente, carro }`; `imprimir`, `almacen` y `alVolver` se pueden inyectar para probar.
 */
export function pintarContratoImpreso(contenedor, entrada, {
  imprimir = () => window.print(), almacen = almacenDelNavegador(), alVolver, tarjetasDelTraspaso = [],
} = {}) {
  const volver = alVolver ? '<button type="button" class="btn" data-accion="volver">← Volver</button>' : '';
  const alertaDeFallo = (mensaje) => {
    contenedor.innerHTML = `<div class="hc-pantalla">
  <div class="comp-barra no-imprimir">${volver}</div>
  <div class="barra-lectura-fallida no-imprimir" role="alert"><p>No se pudo armar el contrato para imprimir. ${esc(mensaje)}</p></div>
</div>`;
    contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
    return null;
  };

  let modelo;
  try {
    modelo = armarContratoImpreso(entrada);
  } catch (error) {
    return alertaDeFallo(error.message);
  }

  const impresora = calibracionActiva(almacen);
  const conTarjetas = Array.isArray(entrada.contrato.tarjetas) && entrada.contrato.tarjetas.length > 0;

  // ADR-001: lo único que vive aquí de la tarjeta son estas dos listas, dentro de esta función. No se guardan en ningún
  // otro lado y `vaciar()` las borra.
  let tarjetasEfimeras = [];

  contenedor.innerHTML = `<div class="hc-pantalla">
  <div class="comp-barra no-imprimir">
    ${volver}
    <button type="button" class="btn btn-primario" data-accion="imprimir">Imprimir contrato</button>
    <a class="btn" href="#/impresion/calibrar" data-accion="calibrar">Calibrar impresora</a>
  </div>
  <div data-pieza="blancos-estado"></div>
  <p class="comp-ayuda no-imprimir" data-pieza="impresora">${textoDeImpresora(impresora)}</p>
  <p class="comp-ayuda no-imprimir">${esc(ayudaDeImprimir(papelDe(impresora.cal)))}</p>
  ${cajasDeTarjetas(entrada.contrato)}
  <div data-pieza="traspaso"></div>
  ${cajasDelPapel(entrada.contrato)}
  ${cajasDeCasillasOpcionales(modelo.casillasOpcionales)}
  <div data-pieza="notas"></div>
  <div data-pieza="avisos"></div>
  <div class="${papelDe(impresora.cal).clave === 'oficio' ? 'hc-vista hc-vista-oficio' : 'hc-vista'}" data-pieza="vista"></div>
</div>`;

  const el = (id) => contenedor.querySelector(id);

  function pintarAvisos() {
    el('[data-pieza="notas"]').innerHTML = modelo.notas.map((n) => `<p class="comp-ayuda no-imprimir">${esc(n)}</p>`).join('');
    const caja = el('[data-pieza="avisos"]');
    // Con la calibración de esta impresora, ¿alguna casilla que lleva dato se saldría de la carta? Se cortaría en el papel.
    const cortadas = camposFueraDelPapel(impresora.cal).filter((id) => modelo.valores[id]);
    const avisos = cortadas.length ? [...modelo.avisos, textoDeCortadas(cortadas, papelDe(impresora.cal))] : modelo.avisos;
    caja.innerHTML = avisos.length
      ? `<div class="barra-lectura-fallida no-imprimir" role="alert">${avisos.map((a) => `<p>${esc(a)}</p>`).join('')}</div>`
      : '';
  }

  /**
   * Lo tecleado hasta ahora, solo en memoria, y la hoja dibujada con ello. Si ya no se puede armar, NO se deja la hoja de
   * antes en pantalla: una hoja vieja es una hoja que alguien imprime.
   */
  function redibujar() {
    tarjetasEfimeras = (entrada.contrato.tarjetas ?? []).map((_t, i) => ({
      numero: el(`#hc-t${i}-numero`)?.value ?? '',
      cbc: el(`#hc-t${i}-cbc`)?.value ?? '',
    }));
    const datosDelPapel = Object.fromEntries(DATOS_DEL_PAPEL.map((d) => [d.clave, el(`#${d.id}`)?.value]));
    // Una casilla sin su marca se deja en blanco; si la marca no se puede leer, se imprime (el camino que él decidió).
    const enBlanco = camposQueSePuedenDejarEnBlanco().filter((c) => el(`#${ID_BLANCO(c.id)}`)?.checked === false).map((c) => c.id);
    try {
      modelo = armarContratoImpreso({
        ...entrada, tarjetasEfimeras, datosDelPapel, enBlanco,
      });
    } catch (error) {
      el('[data-pieza="vista"]').innerHTML = '';
      el('[data-pieza="blancos-estado"]').innerHTML = '';
      el('[data-pieza="avisos"]').innerHTML = `<div class="barra-lectura-fallida no-imprimir" role="alert"><p>${esc(error.message)}</p></div>`;
      return;
    }
    el('[data-pieza="blancos-estado"]').innerHTML = textoDeLasQueQuedanEnBlanco(modelo.casillasOpcionales);
    const todasEnBlanco = modelo.casillasOpcionales.every((o) => !o.imprime);
    const botonTodas = el('[data-accion="blancos-todas"]');
    if (botonTodas) botonTodas.textContent = todasEnBlanco ? 'Imprimir las nueve' : 'Dejar las nueve en blanco';
    el('[data-pieza="vista"]').innerHTML = htmlContratoImpreso(modelo, impresora.cal);
    pintarAvisos();
  }

  /** Deja las cajas de a quién se factura, el lugar y las tarifas como al abrir la pantalla. */
  function restablecerDatosDelPapel() {
    const inicial = inicialesDelPapel(entrada.contrato);
    DATOS_DEL_PAPEL.forEach((d) => { const caja = el(`#${d.id}`); if (caja) caja.value = inicial[d.clave]; });
    // y las nueve casillas de letra blanca, otra vez todas marcadas: dejar una en blanco vale para UN papel
    camposQueSePuedenDejarEnBlanco().forEach((c) => { const marca = el(`#${ID_BLANCO(c.id)}`); if (marca) marca.checked = true; });
  }

  /**
   * Borra el número completo y el CBC de las cajas, de la memoria y de la hoja, y deja a quién se factura, el lugar y las
   * tarifas como al abrir (lo corregido para una renta no se queda para la siguiente).
   */
  function vaciar() {
    tarjetasEfimeras = [];
    contenedor.querySelectorAll('.hc-tarjeta input').forEach((caja) => { caja.value = ''; });
    const delTraspaso = el('[data-pieza="traspaso"]');
    if (delTraspaso) delTraspaso.innerHTML = '';
    restablecerDatosDelPapel();
    // Al salir de la pantalla (hashchange) el enrutador ya dibujó OTRA encima, porque su oyente se puso antes que este: no hay hoja que
    // redibujar y buscarla daba un error sin atrapar en la consola en cada salida (lo vio la prueba en Chrome, 16 de octubre de 2026).
    if (el('[data-pieza="vista"]')) redibujar();
  }

  /**
   * Pone en las cajas lo que vino de «Sacar carro» (ver traspasoDeTarjetas.js), si es de ESTAS tarjetas. Es lo mismo que si el
   * mostrador lo hubiera tecleado aquí: de las cajas va a la hoja, y se vacían al terminar de imprimir y al salir (`vaciar`).
   */
  function precargarDelTraspaso(llegadas) {
    const lugar = tarjetasDelTraspasoParaElPapel(entrada.contrato.tarjetas, llegadas);
    for (const { i, numero, cbc } of lugar.puestas) {
      const caja = el(`#hc-t${i}-numero`);
      const cajaCbc = el(`#hc-t${i}-cbc`);
      if (caja) caja.value = numero;
      if (cajaCbc) cajaCbc.value = cbc;
    }
    el('[data-pieza="traspaso"]').innerHTML = notasDelTraspaso(lugar);
  }

  contenedor.querySelectorAll('.hc-tarjeta input').forEach((caja) => caja.addEventListener('input', redibujar));
  contenedor.querySelectorAll('.hc-datos input').forEach((caja) => caja.addEventListener('input', redibujar));
  contenedor.querySelectorAll('.hc-blancos input').forEach((marca) => marca.addEventListener('change', redibujar));
  // Un solo botón para las nueve: si todas se imprimen las deja todas en blanco, y si todas están en blanco las vuelve a imprimir.
  contenedor.querySelector('[data-accion="blancos-todas"]')?.addEventListener('click', () => {
    const todasEnBlanco = modelo.casillasOpcionales.every((o) => !o.imprime);
    camposQueSePuedenDejarEnBlanco().forEach((c) => { const marca = el(`#${ID_BLANCO(c.id)}`); if (marca) marca.checked = todasEnBlanco; });
    redibujar();
  });
  restablecerDatosDelPapel();
  precargarDelTraspaso(tarjetasDelTraspaso);
  redibujar();
  ponerPaginaSinMargen(papelDe(impresora.cal));
  // Al salir de la pantalla se vacía lo tecleado (la hoja ya no está a la vista, pero el DOM podría seguir en memoria).
  if (typeof window !== 'undefined') window.addEventListener('hashchange', vaciar, { once: true });

  const titulo = `Contrato ${modelo.numero ?? ''}`.trim();
  contenedor.querySelector('[data-accion="imprimir"]')?.addEventListener('click', () => {
    redibujar();
    imprimirConTitulo(titulo, imprimir, vaciar);
  });
  contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
  return modelo;
}

/** Lo que se ve si la lectura de un dato falla: nunca como si «no existiera». */
function textoSinLeer(que) {
  return `No se pudo leer ${que}. Revisa tu conexión e intenta de nuevo.`;
}

/**
 * La ruta '#/imprimir/:contratoId': lee el contrato, el cliente y el carro y dibuja la hoja. Cada lectura
 * que falla se avisa como falla (no como «no existe»), y sin cliente no hay hoja.
 */
export async function pintarImpresionDeContrato(contenedor, contratoId, {
  leer = { cargarContrato, cargarClientes, cargarFlota }, tomar = tomarTraspaso,
} = {}) {
  // Lo primero, antes de esperar nada: entrar aquí cierra el salto de «Sacar carro» (ver traspasoDeTarjetas.js). Lo que haya de ESTE
  // contrato se recoge ya y se borra del módulo; si la lectura del contrato falla, se pierde con esta función y se teclea como siempre.
  const delTraspaso = tomar(contratoId);
  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';
  const alVolver = () => { location.hash = contratoId ? `#/contratos/${contratoId}` : '#/contratos'; };
  const caer = (mensaje) => {
    contenedor.innerHTML = `<div class="barra-lectura-fallida"><p>${esc(mensaje)}</p></div>`;
  };

  let contrato = null;
  try {
    contrato = await leer.cargarContrato(contratoId);
  } catch {
    caer(textoSinLeer('este contrato'));
    return;
  }
  if (!contrato) {
    contenedor.innerHTML = `<p class="pendiente">No se encontró el contrato ${esc(contratoId)}.</p>`;
    return;
  }

  let clientes;
  try {
    clientes = await leer.cargarClientes();
  } catch {
    caer(textoSinLeer('la lista de clientes'));
    return;
  }
  if (clientes.fallo && !clientes.datos.length) {
    caer(textoSinLeer('la lista de clientes'));
    return;
  }
  const cliente = clientes.datos.find((c) => c.id === contrato.clienteId) ?? null;

  let carro = null;
  if (!contrato.ajeno) {
    let flota;
    try {
      flota = await leer.cargarFlota();
    } catch {
      caer(textoSinLeer('la flota'));
      return;
    }
    carro = flota.datos.find((c) => c.id === contrato.carroId) ?? null;
  }

  pintarContratoImpreso(contenedor, { contrato, cliente, carro }, { alVolver, tarjetasDelTraspaso: delTraspaso });
}

/**
 * La pantalla de calibrar (ruta '#/impresion/calibrar'): se imprime la hoja de prueba, se pone contra la luz sobre el
 * formulario y se corre TODA la hoja con las flechas (← → ↑ ↓; Shift = paso fino, Ctrl/Cmd = paso grueso; + y − para el
 * tamaño) hasta que calce; el ajuste se guarda con el nombre de la impresora.
 */
export function pintarCalibracion(contenedor, {
  almacen = almacenDelNavegador(), imprimir = () => window.print(), alVolver = () => history.back(),
} = {}) {
  const guardadas = leerCalibraciones(almacen);
  const inicial = calibracionActiva(almacen);
  let nombre = inicial.nombre ?? '';
  let cal = { ...inicial.cal };

  const volver = alVolver ? '<button type="button" class="btn" data-accion="volver">← Volver</button>' : '';
  contenedor.innerHTML = `<div class="hc-pantalla">
  <div class="comp-barra no-imprimir">
    ${volver}
    <button type="button" class="btn btn-primario" data-accion="imprimir-prueba">Imprimir hoja de prueba</button>
    <button type="button" class="btn" data-accion="guardar">Guardar ajuste</button>
    <button type="button" class="btn" data-accion="fabrica">Volver al ajuste de fábrica</button>
  </div>
  <div class="hc-calibracion no-imprimir">
    <h2>Calibrar la impresora (un minuto)</h2>
    <ol class="hc-pasos">
      ${PASOS_DE_CALIBRAR.map((p, i) => `<li><strong>${esc(p.titulo)}.</strong> ${esc(p.texto)}${i === 0 ? ` ${esc(ayudaDeImprimir(papelDe(cal)))}` : ''}</li>`).join('\n      ')}
    </ol>
    <label>Tamaño del papel
      <select id="hc-papel">${Object.values(PAPELES).map((p) => `<option value="${p.clave}"${p.clave === papelDe(cal).clave ? ' selected' : ''}>${esc(p.nombre)} (${p.anchoMm} × ${p.altoMm} mm)</option>`).join('')}</select>
    </label>
    <label>Nombre de la impresora
      <input type="text" id="hc-nombre" list="hc-nombres" value="${esc(nombre)}" placeholder="Oficina" autocomplete="off">
      <datalist id="hc-nombres">${Object.keys(guardadas.impresoras).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </label>
    <p class="hc-aviso-q" data-pieza="aviso-q">${esc(AVISO_DE_LA_Q)}</p>
    <p class="hc-lectura" data-pieza="lectura"></p>
    <p class="comp-ayuda"><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> mueven toda la hoja ${esc(TOQUE_MM)} mm · con <kbd>Shift</kbd> ${esc(aTexto(PASOS.fino.mm))} mm · con <kbd>Ctrl</kbd> o <kbd>Cmd</kbd> ${esc(aTexto(PASOS.grueso.mm))} mm · <kbd>+</kbd> y <kbd>−</kbd> la agrandan o la achican.</p>
  </div>
  <div class="hc-vista" data-pieza="vista"></div>
</div>`;

  const el = (id) => contenedor.querySelector(id);
  function pintar() {
    el('[data-pieza="lectura"]').textContent = lecturaDe(cal);
    const vista = el('[data-pieza="vista"]');
    vista.innerHTML = htmlHojaDePrueba(cal, { impresora: nombre || null });
    vista.className = papelDe(cal).clave === 'oficio' ? 'hc-vista hc-vista-oficio' : 'hc-vista';
    const selector = el('#hc-papel');
    if (selector) selector.value = papelDe(cal).clave;
    ponerPaginaSinMargen(papelDe(cal));
  }
  pintar();

  const alTeclear = (ev) => {
    // Teclear el nombre de la impresora no debe mover la hoja.
    if (ev.target?.matches?.('input, textarea, select')) return;
    const nueva = aplicarTecla(cal, ev);
    if (!nueva) return;
    ev.preventDefault();
    cal = nueva;
    pintar();
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', alTeclear);
    window.addEventListener('hashchange', () => {
      document.removeEventListener('keydown', alTeclear);
      quitarPaginaSinMargen();
    }, { once: true });
  }

  // El papel (carta u oficio) se escoge aquí y se guarda con la impresora, junto al corrimiento y la escala.
  el('#hc-papel')?.addEventListener('change', (ev) => {
    cal = { ...cal, papel: ev.target.value };
    pintar();
  });

  el('#hc-nombre')?.addEventListener('input', (ev) => {
    nombre = ev.target.value;
    // Elegir una impresora ya guardada trae su ajuste.
    const existente = leerCalibraciones(almacen).impresoras[nombre.trim()];
    if (existente) {
      cal = { ...existente };
      pintar();
    } else {
      el('[data-pieza="lectura"]').textContent = lecturaDe(cal);
    }
  });
  el('[data-accion="imprimir-prueba"]')?.addEventListener('click', () => imprimirConTitulo('Hoja de prueba', imprimir));
  el('[data-accion="fabrica"]')?.addEventListener('click', () => { cal = { ...CALIBRACION_DE_FABRICA }; pintar(); });
  el('[data-accion="guardar"]')?.addEventListener('click', () => {
    try {
      guardarCalibracion(almacen, nombre, cal);
      el('[data-pieza="lectura"]').textContent = lecturaDe(cal, `Guardado para «${nombre.trim()}». `);
    } catch (error) {
      el('[data-pieza="lectura"]').textContent = error.message;
    }
  });
  el('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
  return { cal: () => cal, nombre: () => nombre, valida: () => calibracionValida(cal) };
}
