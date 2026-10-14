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
// ===== LA TARJETA Y EL CBC (ADR-001) =====
// El número completo de la tarjeta y el CBC NUNCA se guardan: ni en Firestore, ni en la copia local, ni en
// localStorage, ni en la dirección de la página. Este archivo es el único lugar del sistema que los lee, y solo así:
//   - Los teclea quien atiende, aquí, en dos cajas que solo existen mientras la pantalla está abierta.
//   - Viajan por parámetros de funciones (`tarjetasEfimeras`, nunca un campo del contrato) hasta el HTML de la
//     hoja, y de ahí a la impresora. `armarContratoImpreso` no los copia al contrato ni los devuelve en nada que se
//     parezca a un contrato.
//   - Al terminar de imprimir (o cancelar: `afterprint` avisa en los dos casos) y al salir de la pantalla, las
//     cajas se vacían y la hoja se vuelve a dibujar ENMASCARADA. Un papel que se reimprime sale con `•••• 3343`,
//     porque el número completo nunca existió en el sistema (§8 y ADR-001).
//   - La hoja con el número completo no debe guardarse como PDF: sería un archivo con tarjeta y CBC en la computadora.
//     La pantalla lo dice en voz alta, y el título del documento solo lleva el número de contrato.
import { lineasSalida } from '../nucleo/contrato.js';
import { nombresResueltos } from '../nucleo/cliente.js';
import { q } from '../nucleo/dinero.js';
import {
  CAMPOS, ESCALA_EXCEL, ORIGEN_MM, PAPEL, HOJA_MM, cajaDeRango, fechaParaPapel, textoSeSale,
  transformacionCss, textoDeCalibracion, aplicarTecla, calibracionActiva, guardarCalibracion,
  leerCalibraciones, CALIBRACION_DE_FABRICA, calibracionValida, camposQueSeImprimen,
} from '../nucleo/hojaContrato.js';
import { dinero } from '../ui.js';
import { cargarContrato, cargarClientes, cargarFlota } from '../datos.js';

// El texto libre (nombre, dirección, observaciones) nunca entra al HTML sin pasar por aquí: mismo escape que el resto.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * ¿El papel ya trae la «Q» impresa junto a las casillas de dinero? El Excel la imprime (`Q150.00`); el papel
 * podría traerla y entonces saldría doble. Es una de las preguntas abiertas para el dueño. Con `false` los montos
 * salen sin la Q.
 */
export const QUETZAL_EN_EL_PAPEL = true;

const limpio = (x) => String(x ?? '').trim();

/** Un monto para el papel: con dinero() (la Q y los miles), y en blanco si es cero (una casilla sin dato, no «Q0.00»). */
function monto(n, { plano = false } = {}) {
  const x = q(n);
  if (x === 0) return '';
  const texto = dinero(x);
  return plano || !QUETZAL_EN_EL_PAPEL ? texto.replace(/^(-?)Q/, '$1') : texto;
}

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
  deducibleCopia: ({ contrato }) => monto(contrato.deducible, { plano: true }),
  deducibleBajo: ({ contrato }) => monto(contrato.deducibleBajo),
  seguroMenores: ({ contrato }) => monto(contrato.seguroMenoresDia),
  seguroPai: ({ contrato }) => monto(contrato.seguroPaiDia),
  variosDescripcion: ({ contrato }) => limpio(contrato.variosDescripcion),
  variosPrecio: ({ contrato }) => monto(contrato.variosPrecio),
  // El destino de la carta poder se imprime aunque no tenga precio (el Excel lo hace así); el precio, de la
  // línea «Carta poder» de lineasSalida: lo mismo que ve el mostrador al salir el carro.
  cartaPoderDestino: ({ contrato }) => limpio(contrato.cartaPoderDestino),
  cartaPoderPrecio: ({ contrato }) => monto(lineasSalida(contrato).find((l) => l.concepto === 'Carta poder')?.monto),
  rentadoPor: ({ contrato }) => limpio(contrato.rentadoPor),
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
 */
export function armarContratoImpreso({
  contrato, cliente, carro = null, tarjetasEfimeras = [],
} = {}) {
  if (!contrato || typeof contrato !== 'object' || !contrato.id) {
    throw new Error('Falta el contrato guardado que se va a imprimir.');
  }
  if (!cliente || typeof cliente !== 'object') {
    throw new Error(
      `No se encontró al cliente del contrato N.° ${contrato.numero ?? '—'}: sin sus datos el papel saldría sin nombre ni documento. Recarga la pantalla e intenta de nuevo.`,
    );
  }
  const ajeno = Boolean(contrato.ajeno);
  const guardadas = Array.isArray(contrato.tarjetas) ? contrato.tarjetas : [];
  const efimeras = Array.isArray(tarjetasEfimeras) ? tarjetasEfimeras : [];
  const tarjetas = guardadas.map((t, i) => tarjetaParaImprimir(t, efimeras[i]));

  const contexto = { contrato, cliente, carro, tarjetas, ajeno };
  const valores = {};
  const avisos = [];

  for (const campo of CAMPOS) {
    if (campo.tipo === 'etiqueta') {
      valores[campo.id] = TEXTO_FIJO(campo);
    } else if (VALOR[campo.id]) {
      valores[campo.id] = VALOR[campo.id](contexto);
    } else {
      // Sin fuente en el sistema (`de: null`): en blanco, y la hoja de prueba lo dice.
      valores[campo.id] = '';
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
    if (!t.completa) {
      avisos.push(
        `Tarjeta ${i + 1}: el papel llevará el número enmascarado (${t.numero || '••••'}) y el CBC en blanco, porque el sistema nunca guarda el número completo ni el CBC. `
        + 'Para imprimirlos, tecléalos abajo: solo se usan para este papel.',
      );
    }
  });
  for (const campo of camposQueSeImprimen()) {
    if (campo.tipo !== 'etiqueta' && textoSeSale(campo, valores[campo.id])) {
      avisos.push(`«${campo.etiqueta}» es más largo que su casilla del papel y se saldría de ella.`);
    }
  }

  return {
    contratoId: contrato.id,
    numero: contrato.numero ?? null,
    valores,
    tarjetas: tarjetas.map((t) => ({ completa: t.completa })),
    avisos,
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

// Los campos de fecha con espacios entre sus partes (los espacios caen en las casillas DD / MM / AAAA del papel):
// el navegador no debe juntarlos.
const CON_ESPACIOS = new Set(['fechaLarga', 'fechaDoc']);

function claseDeCampo(campo) {
  return [
    'hc-campo', FUENTE_CSS[campo.fuente], ALINEA_CSS[campo.alinea] ?? 'hc-izq', VALINEA_CSS[campo.valinea] ?? 'hc-abajo',
    campo.ajusta ? 'hc-ajusta' : '', CON_ESPACIOS.has(campo.tipo) ? 'hc-pre' : '',
  ].filter(Boolean).join(' ');
}

function campoHtml(campo, texto) {
  return `<div class="${claseDeCampo(campo)}" data-campo="${esc(campo.id)}" style="${estiloDeCaja(campo)}"><span class="hc-t">${esc(texto)}</span></div>`;
}

/**
 * La hoja, como texto HTML. Función pura: recibe el modelo de `armarContratoImpreso` y la calibración, y nada más.
 * Una caja del tamaño de la carta, sin margen, y dentro un solo lienzo con el único `transform` de la hoja.
 */
export function htmlContratoImpreso(modelo, cal = CALIBRACION_DE_FABRICA) {
  const campos = camposQueSeImprimen()
    .filter((c) => c.tipo !== 'etiqueta' && modelo.valores[c.id])
    .map((c) => campoHtml(c, modelo.valores[c.id]))
    .join('\n    ');
  return `<article class="hoja-contrato" aria-label="Contrato N.° ${esc(modelo.numero ?? '')}">
  <div class="hc-lienzo" style="transform-origin:${mm(ORIGEN_MM.x)} ${mm(ORIGEN_MM.y)};transform:${transformacionCss(cal)};">
    ${campos}
  </div>
</article>`;
}

// ---------- La hoja de prueba ----------

const NUMERAR_CADA_MM = 10;

/** Una regla en los dos bordes de la carta: marcas cada 5 mm, número cada 10 mm. NO se corre con la calibración. */
function reglaHtml() {
  const marcas = [];
  for (let x = 0; x <= PAPEL.anchoMm; x += 5) {
    const larga = x % NUMERAR_CADA_MM === 0;
    marcas.push(`<i class="hp-marca hp-marca-x${larga ? ' hp-larga' : ''}" style="left:${x}mm"></i>`);
    if (larga && x > 0 && x < PAPEL.anchoMm) marcas.push(`<b class="hp-num hp-num-x" style="left:${x}mm">${x}</b>`);
  }
  for (let y = 0; y <= PAPEL.altoMm; y += 5) {
    const larga = y % NUMERAR_CADA_MM === 0;
    marcas.push(`<i class="hp-marca hp-marca-y${larga ? ' hp-larga' : ''}" style="top:${y}mm"></i>`);
    if (larga && y > 0 && y < PAPEL.altoMm) marcas.push(`<b class="hp-num hp-num-y" style="top:${y}mm">${y}</b>`);
  }
  return marcas.join('');
}

/**
 * La hoja de prueba: lo que se imprime en papel blanco y se pone contra la luz sobre el formulario preimpreso para
 * que calce.
 *   - Una regla en los bordes de la carta, en milímetros. No se corre con la calibración: dice dónde mete la
 *     impresora el papel, y si la escala de la impresión es de verdad 100 % (la marca de 100 mm tiene que caer a 100 mm
 *     de una regla de verdad).
 *   - El rectángulo de la hoja entera y una cruz en cada una de sus cuatro esquinas.
 *   - Una caja por cada campo, con su nombre, en el lugar donde se imprimiría (raya continua si se imprime, de
 *     puntos si no). Sirve para ver, campo por campo, qué cae dentro de su casilla del papel y qué no.
 * Todo lo que no es regla va dentro del mismo lienzo con el mismo `transform` que la hoja del contrato.
 */
export function htmlHojaDePrueba(cal = CALIBRACION_DE_FABRICA, { impresora = null } = {}) {
  const cajas = CAMPOS.map((c) => {
    const imprime = c.imprime !== false;
    return `<div class="hp-caja${imprime ? '' : ' hp-no'}" data-campo="${esc(c.id)}" style="${estiloDeCaja(c).replace(/font-size:[^;]+;/, '')}"><span>${esc(c.id)}</span></div>`;
  }).join('\n    ');
  const esquina = (x, y, clase) => `<i class="hp-cruz ${clase}" style="left:${mm(ORIGEN_MM.x + x)};top:${mm(ORIGEN_MM.y + y)}"></i>`;
  const marco = `<div class="hp-marco" style="left:${mm(ORIGEN_MM.x)};top:${mm(ORIGEN_MM.y)};width:${mm(HOJA_MM.ancho)};height:${mm(HOJA_MM.alto)}"></div>`;
  const rotulo = `Hoja de prueba${impresora ? ` · ${esc(impresora)}` : ''} · ${esc(textoDeCalibracion(cal))}`;
  return `<article class="hoja-contrato hoja-de-prueba" aria-label="Hoja de prueba">
  <div class="hp-regla">${reglaHtml()}</div>
  <p class="hp-rotulo">${rotulo}</p>
  <div class="hc-lienzo" style="transform-origin:${mm(ORIGEN_MM.x)} ${mm(ORIGEN_MM.y)};transform:${transformacionCss(cal)};">
    ${marco}
    ${esquina(0, 0, 'hp-nw')}${esquina(HOJA_MM.ancho, 0, 'hp-ne')}${esquina(0, HOJA_MM.alto, 'hp-sw')}${esquina(HOJA_MM.ancho, HOJA_MM.alto, 'hp-se')}
    ${cajas}
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
  return { getItem: () => null, setItem: () => {} };
}

/** Pone, mientras esta pantalla esté abierta, la regla de página sin margen (la carta entera es del papel). */
const ID_ESTILO_DE_PAGINA = 'hc-estilo-de-pagina';
function ponerPaginaSinMargen() {
  if (typeof document === 'undefined') return;
  quitarPaginaSinMargen();
  const estilo = document.createElement('style');
  estilo.id = ID_ESTILO_DE_PAGINA;
  estilo.textContent = `@page { size: ${PAPEL.anchoMm}mm ${PAPEL.altoMm}mm; margin: 0; }`;
  document.head.appendChild(estilo);
  window.addEventListener('hashchange', quitarPaginaSinMargen, { once: true });
}
function quitarPaginaSinMargen() {
  if (typeof document === 'undefined') return;
  document.getElementById(ID_ESTILO_DE_PAGINA)?.remove();
}

const textoDeImpresora = ({ nombre, cal, calibrada }) => (calibrada
  ? `Impresora «${esc(nombre)}»: ${esc(textoDeCalibracion(cal))}.`
  : `Esta computadora todavía no tiene una impresora calibrada: el primer papel sale corrido. ${esc(textoDeCalibracion(cal))}.`);

const AYUDA_DE_IMPRIMIR = 'En el diálogo de imprimir: tamaño Carta, escala 100 % (no «Ajustar a la página»), márgenes «Ninguno» y sin encabezados ni pies de página.';
const AVISO_DE_TARJETA = 'Este papel lleva el número completo de la tarjeta y el CBC: imprímelo directo a la impresora. NO lo guardes como PDF: quedaría un archivo con la tarjeta en la computadora (ADR-001).';

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

/**
 * Dibuja el contrato impreso en `contenedor`. Devuelve el modelo, o `null` si no se pudo armar.
 *
 * Si `armarContratoImpreso` lanza NO se dibuja una hoja: se dibuja una barra roja que dice por qué (como el comprobante).
 * `entrada` es `{ contrato, cliente, carro }`; `imprimir`, `almacen` y `alVolver` se pueden inyectar para probar.
 */
export function pintarContratoImpreso(contenedor, entrada, {
  imprimir = () => window.print(), almacen = almacenDelNavegador(), alVolver,
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
  <p class="comp-ayuda no-imprimir" data-pieza="impresora">${textoDeImpresora(impresora)}</p>
  <p class="comp-ayuda no-imprimir">${esc(AYUDA_DE_IMPRIMIR)}</p>
  ${cajasDeTarjetas(entrada.contrato)}
  <div data-pieza="avisos"></div>
  <div class="hc-vista" data-pieza="vista"></div>
</div>`;

  const el = (id) => contenedor.querySelector(id);

  function pintarAvisos() {
    const caja = el('[data-pieza="avisos"]');
    caja.innerHTML = modelo.avisos.length
      ? `<div class="barra-lectura-fallida no-imprimir" role="alert">${modelo.avisos.map((a) => `<p>${esc(a)}</p>`).join('')}</div>`
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
    try {
      modelo = armarContratoImpreso({ ...entrada, tarjetasEfimeras });
    } catch (error) {
      el('[data-pieza="vista"]').innerHTML = '';
      el('[data-pieza="avisos"]').innerHTML = `<div class="barra-lectura-fallida no-imprimir" role="alert"><p>${esc(error.message)}</p></div>`;
      return;
    }
    el('[data-pieza="vista"]').innerHTML = htmlContratoImpreso(modelo, impresora.cal);
    pintarAvisos();
  }

  /** Borra el número completo y el CBC de las cajas, de la memoria y de la hoja. */
  function vaciar() {
    tarjetasEfimeras = [];
    contenedor.querySelectorAll('.hc-tarjeta input').forEach((caja) => { caja.value = ''; });
    redibujar();
  }

  contenedor.querySelectorAll('.hc-tarjeta input').forEach((caja) => caja.addEventListener('input', redibujar));
  redibujar();
  ponerPaginaSinMargen();
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
export async function pintarImpresionDeContrato(contenedor, contratoId) {
  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';
  const alVolver = () => { location.hash = contratoId ? `#/contratos/${contratoId}` : '#/contratos'; };
  const caer = (mensaje) => {
    contenedor.innerHTML = `<div class="barra-lectura-fallida"><p>${esc(mensaje)}</p></div>`;
  };

  let contrato = null;
  try {
    contrato = await cargarContrato(contratoId);
  } catch {
    caer(textoSinLeer('este contrato'));
    return;
  }
  if (!contrato) {
    contenedor.innerHTML = `<p class="pendiente">No se encontró el contrato ${esc(contratoId)}.</p>`;
    return;
  }

  const clientes = await cargarClientes();
  if (clientes.fallo && !clientes.datos.length) {
    caer(textoSinLeer('la lista de clientes'));
    return;
  }
  const cliente = clientes.datos.find((c) => c.id === contrato.clienteId) ?? null;

  let carro = null;
  if (!contrato.ajeno) {
    const flota = await cargarFlota();
    carro = flota.datos.find((c) => c.id === contrato.carroId) ?? null;
  }

  pintarContratoImpreso(contenedor, { contrato, cliente, carro }, { alVolver });
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
    <label>Nombre de la impresora
      <input type="text" id="hc-nombre" list="hc-nombres" value="${esc(nombre)}" placeholder="Oficina" autocomplete="off">
      <datalist id="hc-nombres">${Object.keys(guardadas.impresoras).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </label>
    <p class="comp-ayuda" data-pieza="lectura"></p>
    <p class="comp-ayuda">1) Imprime la hoja de prueba en papel blanco. ${esc(AYUDA_DE_IMPRIMIR)} 2) Mide con una regla de verdad la marca de 100 mm de la hoja impresa: si no mide 100 mm, la escala de la impresión no es 100 %. 3) Ponla contra la luz sobre el formulario preimpreso y mira, en la pantalla, qué hay que mover: las flechas corren toda la hoja (Shift: más fino; Ctrl o Cmd: más grueso) y + / − la agrandan o la achican. 4) Vuelve a imprimir hasta que calce y guarda.</p>
  </div>
  <div class="hc-vista" data-pieza="vista"></div>
</div>`;

  const el = (id) => contenedor.querySelector(id);
  function pintar() {
    el('[data-pieza="lectura"]').textContent = `Ajuste: ${textoDeCalibracion(cal)}.`;
    el('[data-pieza="vista"]').innerHTML = htmlHojaDePrueba(cal, { impresora: nombre || null });
  }
  pintar();
  ponerPaginaSinMargen();

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

  el('#hc-nombre')?.addEventListener('input', (ev) => {
    nombre = ev.target.value;
    // Elegir una impresora ya guardada trae su ajuste.
    const existente = leerCalibraciones(almacen).impresoras[nombre.trim()];
    if (existente) {
      cal = { ...existente };
      pintar();
    } else {
      el('[data-pieza="lectura"]').textContent = `Ajuste: ${textoDeCalibracion(cal)}.`;
    }
  });
  el('[data-accion="imprimir-prueba"]')?.addEventListener('click', () => imprimirConTitulo('Hoja de prueba', imprimir));
  el('[data-accion="fabrica"]')?.addEventListener('click', () => { cal = { ...CALIBRACION_DE_FABRICA }; pintar(); });
  el('[data-accion="guardar"]')?.addEventListener('click', () => {
    try {
      guardarCalibracion(almacen, nombre, cal);
      el('[data-pieza="lectura"]').textContent = `Guardado para «${nombre.trim()}». Ajuste: ${textoDeCalibracion(cal)}.`;
    } catch (error) {
      el('[data-pieza="lectura"]').textContent = error.message;
    }
  });
  el('[data-accion="volver"]')?.addEventListener('click', () => alVolver?.());
  return { cal: () => cal, nombre: () => nombre, valida: () => calibracionValida(cal) };
}
