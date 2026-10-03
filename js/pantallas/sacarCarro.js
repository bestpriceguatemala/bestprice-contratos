// Sacar un carro (§6 del diseño, "Sacar carro"): el formulario donde el
// mostrador atiende al cliente que se lleva un carro. Seis bloques —
// cliente, carro, renta, cobros extra, tarjetas y cierre del formulario— con
// el detalle y el total recalculándose mientras se escribe, y los avisos
// justo arriba del botón de guardar.
//
// Sigue la misma forma de trabajo que flota.js: una plantilla que se pinta
// una sola vez y un solo repintado de las partes que dependen de lo
// escrito, para no perder el foco del campo donde está escribiendo el
// mostrador.
//
// ADR-001 (docs/adr/ADR-001-no-guardar-numeros-de-tarjeta.md): el número
// completo de la tarjeta y el CBC nunca deben llegar a guardarse. Por eso
// `construirContrato` — la función que arma lo que de verdad se guarda— ni
// siquiera puede recibirlos: quien la llama ya le pasa solo los últimos 4
// dígitos (ver `leerTarjetas` más abajo). El CBC no se lee en ningún lado de
// este archivo.
import { lineasSalida, resumen } from '../nucleo/contrato.js';
import { avisosDeSalida } from '../nucleo/avisos.js';
import { estadoReserva } from '../nucleo/reserva.js';
import { devolucionPrevista, hoyISO } from '../nucleo/fechas.js';
import { q, suma, recargoTarjeta } from '../nucleo/dinero.js';
import {
  cargarFlota, cargarContratosAbiertos, cargarReservas, cargarAjustes, cargarClientes,
  guardarCliente, guardarContrato, siguienteNumeroContrato, nuevoIdContrato, agregarPago, guardarReserva,
  cargarDuenos, guardarDueno,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';
import { filtrar, textoDeCliente } from '../nucleo/busqueda.js';
// El alta rápida de aquí y la ficha de clientes.js tienen que pedir
// exactamente los mismos campos (Tarea 7) — por eso esta pantalla ya no
// inventa su propia lista de siete campos sueltos ni su propia forma de
// armar el objeto a guardar: se dibuja desde CAMPOS_CLIENTE y se guarda con
// construirCliente, igual que la ficha.
import {
  CAMPOS_CLIENTE, construirCliente, nombreCompleto, faltaAlgo,
} from '../nucleo/cliente.js';
// El dueño del carro ajeno se escoge de una lista, con el mismo buscador y la
// misma alta rápida que el cliente: por la misma razón y con el mismo remedio.
// Escrito a mano, "Juan Pérez" y "juan perez" eran dos personas distintas para
// el sistema, y lo que se le debe a uno se partía en dos cuentas.
import {
  CAMPOS_DUENO, construirDueno, faltaAlgoEnDueno, textoDeDueno,
} from '../nucleo/dueno.js';

// El diseño (§5) dice: "el porcentaje por defecto es 5 %". Este plan todavía
// no tiene una lista de empleados con su propio porcentaje (eso es de un
// plan futuro), así que el mostrador escribe quién rentó y puede ajustar el
// porcentaje a mano. En pantalla el campo arranca con el de cargarAjustes()
// (datos.js) en cuanto llega; esta constante es el respaldo de
// construirContrato() — una función pura, sin acceso a los ajustes ya
// cargados — para que, si el campo llegara vacío por cualquier motivo,
// nunca se guarde el contrato sin porcentajeComision.
const PORCENTAJE_COMISION_DEFECTO = 5;

// Mismo respaldo que PORCENTAJE_COMISION_DEFECTO, pero para el recargo de
// tarjeta (§5 del diseño: "12 % de tarjeta"). Sin este valor el campo nacía
// vacío en la plantilla y, si el mostrador elegía "Tarjeta" y guardaba antes
// de que cargarAjustes() (datos.js) contestara, el recargo se leía como 0 —
// cada renta pagada con tarjeta se cobraba de menos por ese 12 % (hallazgo
// crítico de la revisión final).
const PORCENTAJE_TARJETA_DEFECTO = 12;

// El texto libre que escribe el mostrador (nombre del cliente, destino de la
// carta poder, observaciones...) se escapa antes de entrar al HTML, igual
// que en flota.js, para que un "&" o un "<" sueltos no rompan la pantalla.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Solo los últimos 4 dígitos de un número de tarjeta (ADR-001: es lo único que se guarda). */
export function ultimos4Digitos(numero) {
  return String(numero ?? '').replace(/\D/g, '').slice(-4);
}

/**
 * Tarea 9 ("Sacar el carro desde una reservación"): la ruta es
 * '#/sacar/:carroId?reserva=:reservaId'. El enrutador (router.js) empareja
 * por pedazos separados con "/" y no sabe nada de "?", así que aquí se
 * separa el id del carro del id de la reservación — mismo patrón que
 * recibirCarro.js:leerParametroRuta() con "?cobro=1". Función pura, sin
 * `location` ni DOM, para poder probarla sola.
 */
export function leerParametroRuta(parametroRuta) {
  const [carroId, consulta] = String(parametroRuta || '').split('?');
  const reservaId = new URLSearchParams(consulta || '').get('reserva') || null;
  return { carroId, reservaId };
}

const descripcionCarroPropio = (c) => [c?.marca, c?.linea].filter(Boolean).join(' ');
const descripcionCarroAjeno = (c) => [c?.marca, c?.modelo].filter(Boolean).join(' ');

/**
 * ¿Esta tarjeta tiene algo escrito? La primera tarjeta del formulario
 * siempre se leía (ver `leerTarjetas` más abajo) aunque el mostrador nunca
 * hubiera tocado esos campos, así que un contrato pagado en efectivo
 * guardaba una tarjeta vacía de todos modos — el detalle del contrato
 * mostraba un renglón de "•••• / — / — / Q0.00" que no era ninguna tarjeta
 * de verdad.
 */
const tarjetaTieneDatos = (t) => Boolean(t?.ultimos4 || t?.vencimiento || t?.banco || t?.autorizacion || q(t?.montoAutorizado));

/**
 * Arma el contrato tal como se guarda (§7 del diseño), a partir de lo que ya
 * se leyó del formulario. Función pura: no toca el DOM, así que se puede
 * probar sola con el ejemplo del diseño.
 *
 * OJO de seguridad (ADR-001): esta función no recibe en ningún parámetro el
 * número completo de la tarjeta ni el CBC — `tarjetas` ya viene con
 * `ultimos4` puesto de antemano. No hay ningún campo de este objeto de
 * salida que pueda filtrar ese dato porque nunca entra aquí.
 *
 * `id` es opcional: si quien llama ya decidió el id del documento (para que
 * un reintento de guardar caiga en el mismo contrato, ver `guardar()` más
 * abajo), se conserva tal cual; si no, se deja en null y guardarContrato()
 * (datos.js) le asigna uno nuevo la primera vez que de verdad se guarde.
 */
export function construirContrato(datos) {
  const {
    id, numero, cliente, ajeno, carro, carroAjeno, duenoId,
    fechaSalida, horaSalida, lugar, dias, precioDia, kmSalida, combustibleSalida, horaTardia,
    seguroDia, seguroTercerosDia, seguroMenoresDia, seguroPaiDia, deducible, deducibleBajo,
    cartaPoderDestino, cartaPoderPrecio, variosDescripcion, variosPrecio,
    tarjetas = [], forma, porcentajeTarjeta, montoPago,
    rentadoPor, porcentajeComision,
    conductorAdicional, observaciones,
  } = datos;

  const diasNum = q(dias);
  const precioDiaNum = q(precioDia);
  const fechaSalidaVal = fechaSalida || hoyISO();

  // Solo se guardan las tarjetas que de verdad traen algo escrito (ver
  // tarjetaTieneDatos arriba): así una renta en efectivo no arrastra un
  // renglón de tarjeta vacío en `tarjetas`, y garantiaMonto no cuenta un
  // Q0.00 que tampoco era una tarjeta.
  const tarjetasConDatos = tarjetas.filter(tarjetaTieneDatos);
  const garantiaMonto = suma(...tarjetasConDatos.map((t) => t.montoAutorizado));

  const montoPagoNum = q(montoPago);
  // §7b del diseño: un pago es {monto, forma, porcentajeTarjeta, fecha}. Sin
  // `fecha` aquí, el pago más grande de cada contrato (el de la salida)
  // quedaba con la celda de Fecha vacía en el detalle del contrato — el único
  // pago de todo el sistema que no la traía.
  const pagos = montoPagoNum
    ? [{
      monto: montoPagoNum, forma: forma || 'efectivo', porcentajeTarjeta: forma === 'tarjeta' ? q(porcentajeTarjeta) : 0, fecha: fechaSalidaVal,
    }]
    : [];

  // Nunca se guarda un contrato sin porcentajeComision: sin él la comisión
  // saldría en cero sin avisar (T4, comision.js). Un campo vacío no es lo
  // mismo que un 0 % a propósito, así que solo el vacío cae al default.
  const porcentajeComisionNum = (porcentajeComision === '' || porcentajeComision === undefined || porcentajeComision === null)
    ? PORCENTAJE_COMISION_DEFECTO
    : q(porcentajeComision);

  return {
    id: id || null,
    numero: numero ?? null,
    clienteId: cliente?.id ?? null,
    clienteNombre: nombreCompleto(cliente),

    ajeno: Boolean(ajeno),
    // Un carro ajeno nunca toca `carroId`: así estadoCarro() (nucleo/estados.js)
    // jamás lo cruza con un carro de la flota, y los carros subarrendados no
    // aparecen ahí (§7 del diseño: "no entran a vehiculos").
    carroId: ajeno ? null : (carro?.id ?? null),
    carroAjeno: ajeno ? { ...carroAjeno } : null,
    // El dueño escogido de la lista. `carroAjeno.dueno` (arriba) se queda con
    // el nombre tal como se vio ese día: es un dato de ESTE contrato, no solo
    // un puntero — si el registro del dueño se corrige o se renombra después,
    // el contrato sigue diciendo a quién se le rentó el carro. Es null (y no
    // ausente) cuando no se escogió ninguno, y los contratos de antes de hoy
    // ni siquiera traen la llave: nada de lo que lee este campo puede exigirlo.
    duenoId: ajeno ? (duenoId || null) : null,
    // resumen() (nucleo/contrato.js) solo cobra costo de subarriendo cuando
    // este campo existe; en un carro propio se deja en null a propósito.
    // Esta es la forma en MEMORIA: el costo del dueño (aquí y en
    // `carroAjeno.costoDia`) NO se guarda en el documento del contrato.
    // guardarContrato (datos.js) lo manda a `privado/dinero` — ADR-002.
    subarriendo: ajeno ? { costoDia: q(carroAjeno?.costoDia) } : null,
    carroPlacas: ajeno ? (carroAjeno?.placas || '') : (carro?.placas || ''),
    carroDescripcion: ajeno ? descripcionCarroAjeno(carroAjeno) : descripcionCarroPropio(carro),

    fechaSalida: fechaSalidaVal,
    horaSalida: horaSalida || '',
    lugar: lugar || '',
    dias: diasNum,
    precioDia: precioDiaNum,
    kmSalida: q(kmSalida),
    combustibleSalida: combustibleSalida || '',
    horaTardia: Boolean(horaTardia),
    devolucionPrevista: devolucionPrevista(fechaSalidaVal, diasNum),

    // El precio por día ya incluye el seguro y el seguro de terceros (§5):
    // estos dos montos solo se guardan para desglosarlos en el contrato
    // impreso más adelante, nunca se suman a ningún total.
    seguroDia: q(seguroDia),
    seguroTercerosDia: q(seguroTercerosDia),
    seguroMenoresDia: q(seguroMenoresDia),
    seguroPaiDia: q(seguroPaiDia),
    // "deducible" (el normal) es también solo informativo para el impreso;
    // el que sí se cobra es deducibleBajo, una sola vez (lineasSalida).
    deducible: q(deducible),
    deducibleBajo: q(deducibleBajo),
    cartaPoderDestino: cartaPoderDestino || '',
    cartaPoderPrecio: q(cartaPoderPrecio),
    variosDescripcion: variosDescripcion || '',
    variosPrecio: q(variosPrecio),

    tarjetas: tarjetasConDatos,
    garantiaMonto,
    garantiaLiberada: false,

    pagos,

    rentadoPor: rentadoPor || '',
    porcentajeComision: porcentajeComisionNum,
    conductorAdicional: { ...conductorAdicional },
    observaciones: observaciones || '',

    estado: 'rentado',
  };
}

/**
 * Tarea 9, Reglas 1 y 3 del dueño sobre el anticipo de una reservación:
 *
 * - Pagado: ya no hace falta cobrarlo otra vez a la salida, así que el monto
 *   que se sugiere cobrar HOY se reduce por exactamente ese anticipo — el
 *   mismo error que ya le costó una vuelta cara al dueño (§ arriba: "recibir
 *   sin cobrar" con el cliente ya pagado) fue justo no hacer esta resta por
 *   él. El anticipo en sí se registra aparte (ver conAnticipoComoPago), así
 *   que lo cobrado en total sigue siendo el total de la salida, ni un
 *   centavo de más ni de menos.
 * - Pendiente: no se resta nada. Sigue siendo parte de lo que se cobra
 *   ahora, tal cual lo pide la Regla 3 ("do not subtract it from anything").
 *
 * Función pura: recibe el totalSalida ya calculado (lineasSalida/resumen) y
 * la reservación, nunca toca el DOM, para poder probarla con los montos
 * exactos del ejemplo.
 */
export function montoSalidaConAnticipo(totalSalida, reserva) {
  const total = q(totalSalida);
  if (!reserva?.anticipoPagado) return total;
  const anticipo = q(reserva.anticipo);
  if (!(anticipo > 0)) return total;
  return Math.max(0, q(total - anticipo));
}

/**
 * Tarea 9, Regla 1: un anticipo ya pagado se agrega al contrato como un pago
 * de verdad, con la fecha de la reservación (no la de hoy) — nunca a mano,
 * siempre por `agregarPago` (datos.js), que es el único lugar que calcula el
 * recargo de tarjeta y reconstruye `pagos[]` sin pisar lo que ya había. Un
 * anticipo pendiente (Regla 3) no agrega nada: nunca existió como pago.
 *
 * `forma` por defecto es 'efectivo' (Regla 2: una reservación no sabe cómo
 * se pagó el anticipo, y adivinar 'tarjeta' le sumaría un 12% que nadie pidió).
 */
export function conAnticipoComoPago(contrato, reserva, { forma, porcentajeTarjeta } = {}) {
  if (!reserva?.anticipoPagado) return contrato;
  const anticipo = q(reserva.anticipo);
  if (!(anticipo > 0)) return contrato;
  const formaAnticipo = forma || 'efectivo';
  return agregarPago(contrato, {
    monto: anticipo,
    forma: formaAnticipo,
    porcentajeTarjeta: formaAnticipo === 'tarjeta' ? q(porcentajeTarjeta) : 0,
    fecha: reserva.fechaSalida,
  });
}

// ---------- Los buscadores de cliente y de dueño: qué se dibuja ----------
//
// Funciones puras, sin DOM, para poder probar la regla que más cuesta aquí:
// una lectura que FALLÓ no se dibuja como "no hay nada". El mostrador vería
// "Sin resultados. Puedes darlo de alta abajo", daría de alta a quien ya
// existía, y la historia de esa persona (o la cuenta de ese dueño) se partiría
// en dos — el mismo daño que estos buscadores existen para evitar. Los dos
// buscadores dicen lo mismo y por la misma razón, así que comparten estas
// funciones: lo único que cambia es el sustantivo y el texto buscable.
//
// (Las demás lecturas de esta pantalla —flota, contratos, reservaciones— no
// tienen una barra de fallo; ver el comentario de la carga más abajo.)

/** Cuántos resultados se dibujan a lo más. */
const MAX_RESULTADOS = 8;

/** Lo que cambia entre un buscador y otro: cómo se nombra la lista y qué se busca en cada ficha. */
const LISTAS = {
  clientes: { plural: 'clientes', singular: 'cliente', textoDe: textoDeCliente },
  duenos: { plural: 'dueños', singular: 'dueño', textoDe: textoDeDueno },
};

/**
 * Lo que va debajo de una caja de búsqueda: las filas que coinciden y, si no
 * hay ninguna, la frase que explica por qué.
 *
 * - `tipo`: 'clientes' o 'duenos'.
 * - `leida`: la primera lectura de la lista ya llegó (bien o mal). Antes de
 *   eso la lista vacía no significa nada.
 * - `fallo`: la nube no contestó (`{ datos, fallo }` de cargarClientes y
 *   cargarDuenos).
 *
 * Sin coincidencias, "Sin resultados" solo se dice cuando la lista se leyó de
 * verdad. Con la lectura caída, no encontrar a alguien no prueba que no exista.
 */
export function resultadosDeLista({
  tipo, items, fallo, leida, consulta,
}) {
  const { plural, textoDe } = LISTAS[tipo];
  if (!String(consulta ?? '').trim()) return { filas: [], mensaje: '' };
  if (!leida) return { filas: [], mensaje: `Leyendo la lista de ${plural}...` };

  const lista = Array.isArray(items) ? items : [];
  const filas = filtrar(lista, consulta, textoDe).slice(0, MAX_RESULTADOS);
  if (filas.length) return { filas, mensaje: '' };

  if (fallo && !lista.length) {
    return { filas, mensaje: `No se pudo leer la lista de ${plural}, así que no se sabe si ya está registrado.` };
  }
  if (fallo) {
    return {
      filas,
      mensaje: 'No aparece en la lista de este equipo, que puede estar desactualizada: puede que sí esté registrado.',
    };
  }
  return { filas, mensaje: 'Sin resultados. Puedes darlo de alta abajo.' };
}

/**
 * La frase fija que acompaña a una caja de búsqueda mientras la lectura esté
 * caída — vacía cuando todo va bien o todavía no se sabe. Es aparte de
 * resultadosDeLista porque tiene que verse aunque no haya nada escrito: el
 * mostrador debe enterarse ANTES de decidir dar de alta a alguien.
 */
export function avisoDeLista({
  tipo, leida, fallo, cantidad,
}) {
  const { plural, singular } = LISTAS[tipo];
  if (!leida || !fallo) return '';
  if (!cantidad) {
    return `No se pudo leer la lista de ${plural}, así que no se sabe si el ${singular} ya está registrado. `
      + 'Vuelve a intentar antes de dar de alta a uno nuevo.';
  }
  return `No se pudo actualizar la lista de ${plural}. Se usa la de este equipo, que puede estar desactualizada.`;
}

/**
 * La lista que llegó de la nube más las altas hechas en esta misma pantalla.
 * La sincronía de atrás trae la lista tal como estaba cuando se pidió: si el
 * mostrador dio de alta a alguien mientras tanto, esa persona no viene en
 * ella, y sin esto el buscador "no la encontraría" y se daría de alta dos
 * veces. Si la nube ya la trae, manda la versión de la nube.
 */
export function conAltasDeHoy(datos, altas) {
  const lista = Array.isArray(datos) ? datos : [];
  const ids = new Set(lista.map((d) => d.id));
  return [...lista, ...altas.filter((a) => !ids.has(a.id))];
}

// ---------- La plantilla estática (se pinta una sola vez) ----------

function campo(id, etiqueta, opciones = {}) {
  const { tipo = 'text', ancho = false, paso, minimo, valor = '', autocompletar } = opciones;
  const attrs = [
    paso !== undefined && `step="${paso}"`,
    minimo !== undefined && `min="${minimo}"`,
    autocompletar !== undefined && `autocomplete="${autocompletar}"`,
  ].filter(Boolean).join(' ');
  return `
    <label class="sc-campo${ancho ? ' ancho' : ''}">${esc(etiqueta)}
      <input type="${tipo}" id="${id}" value="${esc(valor)}" ${attrs}>
    </label>`;
}

// El tipo de input HTML que le corresponde a cada tipo de CAMPOS_CLIENTE
// (nucleo/cliente.js) — misma tabla que usa la ficha en clientes.js, para que
// un campo de fecha o de correo se vea y valide igual en las dos pantallas.
const TIPO_INPUT_CLIENTE = { fecha: 'date', correo: 'email', telefono: 'tel' };

/**
 * Detrás de "Más datos" va SOLO la segunda dirección — los campos que dicen
 * "adicional" — y nada más.
 *
 * Antes se escondía ahí todo lo que no fuera lo mínimo para entregar el
 * carro: nacionalidad, fecha de nacimiento, dónde se extendió el documento,
 * dónde y cuándo se emitió la licencia, municipio, país y a quién facturar.
 * El dueño lo corrigió: todo eso **va impreso en el contrato**, así que
 * esconderlo lo obliga a abrir el bloque en cada alta, que es justo lo
 * contrario de lo que "Más datos" debería ahorrarle.
 *
 * La segunda dirección sí es excepcional de verdad: es para el cliente que
 * vive en un lado y responde en otro, y la mayoría de altas no la llevan.
 */
const CAMPOS_ALTA_ADICIONALES = [
  'direccionAdicional', 'ciudadAdicional', 'estadoAdicional',
  'paisAdicional', 'telefonoAdicional',
];

/** El campo de CAMPOS_CLIENTE `c`, dibujado con el input id `sc-nc-<id>`. */
function campoAlta(c) {
  return campo(`sc-nc-${c.id}`, c.etiqueta, { tipo: TIPO_INPUT_CLIENTE[c.tipo] || 'text' });
}

/**
 * El campo de CAMPOS_DUENO `c`, dibujado con el input id `sc-nd-<id>`. Misma
 * tabla de tipos que el alta del cliente: un teléfono se ve como teléfono aquí
 * igual que allá.
 */
function campoAltaDueno(c) {
  return campo(`sc-nd-${c.id}`, c.etiqueta, { tipo: TIPO_INPUT_CLIENTE[c.tipo] || 'text' });
}

function plantilla() {
  // novalidate: la validación nativa del navegador sale en el idioma del
  // navegador, no en español. Los avisos de guardar() (aviso(), en ui.js)
  // son los que de verdad hablan con el mostrador.
  return `
    <form id="sc-form" class="sacar-carro" novalidate>
      <div class="sc-bloques">

        <section class="sc-bloque">
          <h2>1. Cliente</h2>
          <div class="sc-cliente-buscar">
            <label class="sc-campo ancho">Buscar por nombre, apellido, DPI, licencia o teléfono
              <input type="search" id="sc-cliente-buscar" placeholder="Escribe para buscar...">
            </label>
            <ul id="sc-cliente-resultados" class="sc-cliente-resultados" hidden></ul>
          </div>
          <div id="sc-cliente-aviso" class="sc-carro-info sc-carro-aviso" hidden>
            <span id="sc-cliente-aviso-texto"></span>
            <button type="button" id="sc-cliente-reintentar" class="btn" hidden>Volver a intentar</button>
          </div>
          <div id="sc-cliente-elegido" class="sc-cliente-elegido" hidden>
            <span id="sc-cliente-elegido-nombre"></span>
            <button type="button" id="sc-cliente-cambiar" class="btn">Cambiar</button>
          </div>
          <p class="sc-nota">
            ¿No está en la lista?
            <button type="button" id="sc-cliente-nuevo" class="btn">+ Nuevo cliente</button>
          </p>
          <div id="sc-cliente-alta" hidden>
            <div class="sc-campos">
              ${CAMPOS_CLIENTE.filter((c) => !CAMPOS_ALTA_ADICIONALES.includes(c.id)).map(campoAlta).join('')}
            </div>
            <label class="sc-checkbox">
              <input type="checkbox" id="sc-nc-mas-datos"> Segunda dirección (opcional)
            </label>
            <div id="sc-nc-mas-datos-campos" class="sc-campos" hidden>
              ${CAMPOS_CLIENTE.filter((c) => CAMPOS_ALTA_ADICIONALES.includes(c.id)).map(campoAlta).join('')}
            </div>
            <div class="sc-campo ancho">
              <button type="button" id="sc-cliente-guardar" class="btn btn-primario">Guardar cliente</button>
            </div>
          </div>
        </section>

        <section class="sc-bloque">
          <h2>2. Carro</h2>
          <div id="sc-carro-info" class="sc-carro-info">Cargando...</div>
          <label class="sc-checkbox">
            <input type="checkbox" id="sc-ajeno"> Carro ajeno (no es de la flota propia)
          </label>
          <div id="sc-ajeno-campos" class="sc-campos" hidden>
            ${campo('sc-ajeno-placas', 'Placas')}
            ${campo('sc-ajeno-tipo', 'Tipo de vehículo')}
            ${campo('sc-ajeno-marca', 'Marca')}
            ${campo('sc-ajeno-color', 'Color')}
            ${campo('sc-ajeno-modelo', 'Modelo')}
            <div class="sc-campo ancho" id="sc-dueno">
              <div class="sc-cliente-buscar">
                <label class="sc-campo ancho">Dueño del carro — buscar por nombre, teléfono o NIT
                  <input type="search" id="sc-dueno-buscar" placeholder="Escribe para buscar..." autocomplete="off">
                </label>
                <ul id="sc-dueno-resultados" class="sc-cliente-resultados" hidden></ul>
              </div>
              <div id="sc-dueno-aviso" class="sc-carro-info sc-carro-aviso" hidden>
                <span id="sc-dueno-aviso-texto"></span>
                <button type="button" id="sc-dueno-reintentar" class="btn" hidden>Volver a intentar</button>
              </div>
              <div id="sc-dueno-elegido" class="sc-cliente-elegido" hidden>
                <span id="sc-dueno-elegido-nombre"></span>
                <button type="button" id="sc-dueno-cambiar" class="btn">Cambiar</button>
              </div>
              <p class="sc-nota">
                ¿No está en la lista?
                <button type="button" id="sc-dueno-nuevo" class="btn">+ Nuevo dueño</button>
              </p>
              <div id="sc-dueno-alta" hidden>
                <div class="sc-campos">
                  ${CAMPOS_DUENO.map(campoAltaDueno).join('')}
                </div>
                <div class="sc-campo ancho">
                  <button type="button" id="sc-dueno-guardar" class="btn btn-primario">Guardar dueño</button>
                </div>
              </div>
            </div>
            ${campo('sc-ajeno-costo', 'Costo por día', { tipo: 'number', paso: '0.01', minimo: '0' })}
          </div>
        </section>

        <section class="sc-bloque">
          <h2>3. Renta</h2>
          <div class="sc-campos">
            ${campo('sc-fecha-salida', 'Fecha de salida', { tipo: 'date', valor: hoyISO() })}
            ${campo('sc-hora-salida', 'Hora de salida', { tipo: 'time' })}
            ${campo('sc-lugar', 'Lugar')}
            ${campo('sc-dias', 'Días', { tipo: 'number', paso: '1', minimo: '1' })}
            ${campo('sc-precio-dia', 'Precio por día', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-km-salida', 'Kilometraje de salida', { tipo: 'number', paso: '1', minimo: '0' })}
            <label class="sc-campo">Combustible
              <select id="sc-combustible-salida">
                <option value=""></option>
                <option value="Lleno">Lleno</option>
                <option value="3/4">3/4</option>
                <option value="1/2">1/2</option>
                <option value="1/4">1/4</option>
                <option value="Vacío">Vacío</option>
              </select>
            </label>
            <label class="sc-checkbox"><input type="checkbox" id="sc-hora-tardia"> Hora tardía</label>
          </div>
          <p class="sc-nota">Devolución prevista: <strong id="sc-devolucion-prevista">—</strong></p>
        </section>

        <section class="sc-bloque">
          <h2>4. Cobros extra</h2>
          <div class="sc-campos">
            ${campo('sc-seguro-dia', 'Seguro (por día, informativo)', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-seguro-terceros-dia', 'Seguro de terceros (por día, informativo)', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-seguro-menores-dia', 'Seguro de menores (por día)', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-seguro-pai-dia', 'Seguro PAI (por día)', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-deducible', 'Deducible (informativo)', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-deducible-bajo', 'Deducible bajo', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-carta-poder-destino', 'Carta poder — destino')}
            ${campo('sc-carta-poder-precio', 'Carta poder — precio', { tipo: 'number', paso: '0.01', minimo: '0' })}
            ${campo('sc-varios-descripcion', 'Varios — descripción')}
            ${campo('sc-varios-precio', 'Varios — precio', { tipo: 'number', paso: '0.01', minimo: '0' })}
          </div>
        </section>

        <section class="sc-bloque">
          <h2>5. Tarjetas</h2>
          <p class="sc-nota">
            El número completo y el CBC solo se usan para imprimir el contrato; nunca se guardan
            (ver ADR-001). Del sistema solo quedan los últimos 4 dígitos.
          </p>
          <div class="sc-campos">
            ${campo('sc-t1-numero', 'Número completo', { autocompletar: 'off' })}
            ${campo('sc-t1-vencimiento', 'Vencimiento (MM/AA)')}
            ${campo('sc-t1-cbc', 'CBC', { autocompletar: 'off' })}
            ${campo('sc-t1-banco', 'Banco')}
            ${campo('sc-t1-autorizacion', 'Número de autorización')}
            ${campo('sc-t1-monto', 'Monto autorizado', { tipo: 'number', paso: '0.01', minimo: '0' })}
          </div>
          <label class="sc-checkbox"><input type="checkbox" id="sc-t2-agregar"> Agregar segunda tarjeta</label>
          <div id="sc-t2-campos" class="sc-campos" hidden>
            ${campo('sc-t2-numero', 'Número completo', { autocompletar: 'off' })}
            ${campo('sc-t2-vencimiento', 'Vencimiento (MM/AA)')}
            ${campo('sc-t2-cbc', 'CBC', { autocompletar: 'off' })}
            ${campo('sc-t2-banco', 'Banco')}
            ${campo('sc-t2-autorizacion', 'Número de autorización')}
            ${campo('sc-t2-monto', 'Monto autorizado', { tipo: 'number', paso: '0.01', minimo: '0' })}
          </div>
        </section>

        <section class="sc-bloque">
          <h2>6. Cierre del formulario</h2>
          <div class="sc-campos">
            ${campo('sc-rentado-por', '¿Quién lo rentó?')}
            ${campo('sc-porcentaje-comision', 'Porcentaje de comisión', { tipo: 'number', paso: '0.01', minimo: '0', valor: String(PORCENTAJE_COMISION_DEFECTO) })}
            ${campo('sc-conductor-nombre', 'Conductor adicional — nombre')}
            ${campo('sc-conductor-licencia', 'Conductor adicional — licencia')}
            ${campo('sc-conductor-identificacion', 'Conductor adicional — identificación')}
            <label class="sc-campo ancho">Observaciones
              <textarea id="sc-observaciones" rows="2"></textarea>
            </label>
          </div>
        </section>

      </div>

      <aside class="sc-resumen">
        <h2>Detalle de la salida</h2>
        <ul id="sc-lineas" class="sc-lineas"><li class="sc-vacio">Todavía no hay nada que cobrar.</li></ul>

        <div id="sc-anticipo-pagado-bloque" hidden>
          <p class="sc-nota">
            Esta salida viene de una reservación con un anticipo <strong>ya pagado</strong>:
            <strong id="sc-anticipo-monto">Q0.00</strong> el <strong id="sc-anticipo-fecha">—</strong>.
            Se registra como un pago aparte, con esa fecha — no hace falta cobrarlo de nuevo, por eso ya
            está descontado del monto de abajo.
          </p>
          <div class="sc-campos">
            <label class="sc-campo">Forma en que se pagó el anticipo
              <select id="sc-anticipo-forma">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
            <label class="sc-campo" id="sc-anticipo-porcentaje-campo" hidden>% de tarjeta del anticipo
              <input type="number" id="sc-anticipo-porcentaje" step="0.01" min="0" value="${PORCENTAJE_TARJETA_DEFECTO}">
            </label>
          </div>
          <p id="sc-anticipo-recargo" class="sc-nota" hidden></p>
        </div>
        <p id="sc-anticipo-pendiente-bloque" class="sc-nota" hidden>
          Esta salida viene de una reservación con un anticipo de
          <strong id="sc-anticipo-pendiente-monto">Q0.00</strong> todavía <strong>pendiente</strong> — sigue
          incluido en el monto de abajo, no se ha cobrado todavía.
        </p>

        <div class="sc-campos">
          <label class="sc-campo">Forma de pago
            <select id="sc-pago-forma">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </label>
          <label class="sc-campo" id="sc-pago-porcentaje-campo" hidden>% de tarjeta
            <input type="number" id="sc-pago-porcentaje" step="0.01" min="0" value="${PORCENTAJE_TARJETA_DEFECTO}">
          </label>
          <label class="sc-campo">Monto sin recargo de tarjeta
            <input type="number" id="sc-pago-monto" step="0.01" min="0">
          </label>
        </div>

        <div class="sc-garantia-linea">
          <span>Garantía a bloquear en tarjeta</span>
          <strong id="sc-garantia">Q0.00</strong>
        </div>

        <ul id="sc-avisos" class="sc-avisos-lista"></ul>

        <div class="sc-garantia-linea">
          <span>Recargo de tarjeta</span>
          <strong id="sc-recargo-tarjeta">Q0.00</strong>
        </div>

        <div class="sc-total-linea">
          <strong>Total a cobrar</strong>
          <span id="sc-total">Q0.00</span>
        </div>

        <button type="submit" id="sc-guardar" class="btn btn-primario">Guardar e imprimir contrato</button>
      </aside>
    </form>`;
}

// ---------- Piezas del repintado ----------

function filaLinea(l) {
  const detalle = l.detalle ? ` <small>${esc(l.detalle)}</small>` : '';
  return `<li><span>${esc(l.concepto)}${detalle}</span><strong>${dinero(l.monto)}</strong></li>`;
}

function lineaAviso(a) {
  return `<li class="nivel-${esc(a.nivel)}">${esc(a.mensaje)}</li>`;
}

function filaCliente(c) {
  const nombre = nombreCompleto(c) || 'Sin nombre';
  const detalle = [c?.documento && `DPI ${c.documento}`, c?.telefono].filter(Boolean).join(' · ');
  return `<li data-id="${esc(c.id)}"><strong>${esc(nombre)}</strong>${detalle ? `<span>${esc(detalle)}</span>` : ''}</li>`;
}

function filaDueno(d) {
  const nombre = (d?.nombre || '').trim() || 'Sin nombre';
  const detalle = [d?.telefono, d?.nit && `NIT ${d.nit}`].filter(Boolean).join(' · ');
  return `<li data-id="${esc(d.id)}"><strong>${esc(nombre)}</strong>${detalle ? `<span>${esc(detalle)}</span>` : ''}</li>`;
}

const PREFIJO_RUTA = '#/sacar/';
let ultimoToken = 0;

/**
 * Dibuja "Sacar carro" dentro de `contenedor`, para el carro y, si viene de
 * una reservación (Tarea 9), la reservación de origen — los dos vienen
 * juntos en `parametroRuta` ('carroId' o 'carroId?reserva=reservaId'), ver
 * leerParametroRuta() arriba.
 */
export async function pintarSacarCarro(contenedor, parametroRuta) {
  const { carroId, reservaId } = leerParametroRuta(parametroRuta);
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith(PREFIJO_RUTA) && miToken === ultimoToken;

  let flota = [];
  let contratosAbiertos = [];
  let reservas = [];
  let ajustes = {};
  let clienteSeleccionado = null;
  // Los dos buscadores (cliente y dueño del carro ajeno) llevan el mismo estado
  // y se arman con crearBuscador, más abajo. El del dueño pide su lista la
  // primera vez que se marca "carro ajeno", no al abrir la pantalla: la
  // mayoría de las salidas son de carros propios y no la usan.
  let duenoSeleccionado = null;
  let montoPagoTocado = false;
  let comisionTocada = false;
  let tarjetaTocada = false;
  let anticipoTarjetaTocada = false;
  let guardando = false;
  // La reservación de origen (Tarea 9), una vez encontrada entre `reservas`
  // — puede tardar (copia local vacía, primera sincronía) así que se
  // reintenta en cada sincronía de reservas hasta encontrarla o hasta que ya
  // no haya más sincronías (ver intentarAplicarReserva() más abajo).
  // `reservaAplicada` evita volver a pisar el formulario si el mostrador ya
  // empezó a escribir: la reservación se aplica UNA sola vez.
  let reservaOrigen = null;
  let reservaAplicada = false;
  // El id y el número de este alquiler se deciden una sola vez, la primera
  // vez que se intenta guardar (ver guardar() más abajo), y se quedan fijos
  // para cualquier reintento: si el internet se pone lento y hay que
  // reintentar, el reintento tiene que caer en el mismo contrato — dos
  // contratos del mismo alquiler significan un carro comprometido dos veces
  // y una tarjeta autorizada dos veces.
  let contratoId = null;
  let numeroContrato = null;

  contenedor.innerHTML = plantilla();

  const el = (id) => document.getElementById(id);
  const val = (id) => el(id)?.value ?? '';
  const num = (id) => q(val(id));
  const texto = (id) => val(id).trim();
  const marcado = (id) => Boolean(el(id)?.checked);
  const carroPropio = () => flota.find((c) => c.id === carroId) || null;

  function leerTarjetas() {
    // ADR-001: este es el único lugar de todo el archivo donde se leen los
    // campos del número completo, y solo para quedarse con los últimos 4
    // dígitos. El CBC (sc-t1-cbc / sc-t2-cbc) no se lee en ningún lado: no
    // hace falta todavía porque este plan no imprime nada, así ninguna línea
    // de código puede copiarlo a otro sitio por error.
    const tarjetas = [{
      ultimos4: ultimos4Digitos(val('sc-t1-numero')),
      vencimiento: texto('sc-t1-vencimiento'),
      banco: texto('sc-t1-banco'),
      autorizacion: texto('sc-t1-autorizacion'),
      montoAutorizado: num('sc-t1-monto'),
    }];
    if (marcado('sc-t2-agregar')) {
      tarjetas.push({
        ultimos4: ultimos4Digitos(val('sc-t2-numero')),
        vencimiento: texto('sc-t2-vencimiento'),
        banco: texto('sc-t2-banco'),
        autorizacion: texto('sc-t2-autorizacion'),
        montoAutorizado: num('sc-t2-monto'),
      });
    }
    return tarjetas;
  }

  function leerFormulario(numero) {
    const ajeno = marcado('sc-ajeno');
    return {
      id: contratoId,
      numero,
      cliente: clienteSeleccionado,
      ajeno,
      carro: ajeno ? null : carroPropio(),
      carroAjeno: ajeno ? {
        placas: texto('sc-ajeno-placas'), tipo: texto('sc-ajeno-tipo'), marca: texto('sc-ajeno-marca'),
        color: texto('sc-ajeno-color'), modelo: texto('sc-ajeno-modelo'),
        // El nombre tal como se vio ese día (ver construirContrato): el del
        // dueño escogido, o vacío si no se escogió ninguno. Ya no se escribe
        // a mano — era lo que partía en dos la cuenta de una misma persona.
        dueno: duenoSeleccionado?.nombre ?? '',
        costoDia: num('sc-ajeno-costo'),
      } : null,
      duenoId: ajeno ? (duenoSeleccionado?.id ?? null) : null,
      fechaSalida: texto('sc-fecha-salida') || hoyISO(),
      horaSalida: texto('sc-hora-salida'),
      lugar: texto('sc-lugar'),
      dias: num('sc-dias'),
      precioDia: num('sc-precio-dia'),
      kmSalida: num('sc-km-salida'),
      combustibleSalida: texto('sc-combustible-salida'),
      horaTardia: marcado('sc-hora-tardia'),
      seguroDia: num('sc-seguro-dia'),
      seguroTercerosDia: num('sc-seguro-terceros-dia'),
      seguroMenoresDia: num('sc-seguro-menores-dia'),
      seguroPaiDia: num('sc-seguro-pai-dia'),
      deducible: num('sc-deducible'),
      deducibleBajo: num('sc-deducible-bajo'),
      cartaPoderDestino: texto('sc-carta-poder-destino'),
      cartaPoderPrecio: num('sc-carta-poder-precio'),
      variosDescripcion: texto('sc-varios-descripcion'),
      variosPrecio: num('sc-varios-precio'),
      tarjetas: leerTarjetas(),
      forma: texto('sc-pago-forma') || 'efectivo',
      porcentajeTarjeta: num('sc-pago-porcentaje'),
      montoPago: num('sc-pago-monto'),
      rentadoPor: texto('sc-rentado-por'),
      porcentajeComision: texto('sc-porcentaje-comision'),
      conductorAdicional: {
        nombre: texto('sc-conductor-nombre'),
        licencia: texto('sc-conductor-licencia'),
        identificacion: texto('sc-conductor-identificacion'),
      },
      observaciones: texto('sc-observaciones'),
    };
  }

  function refrescarCarro() {
    const caja = el('sc-carro-info');
    const ajeno = marcado('sc-ajeno');
    el('sc-ajeno-campos').hidden = !ajeno;
    if (ajeno) {
      caja.hidden = true;
      return;
    }
    caja.hidden = false;
    const carro = carroPropio();
    if (!carro) {
      caja.className = 'sc-carro-info sc-carro-aviso';
      caja.textContent = 'No se encontró este carro, o ya no está disponible. Marca "carro ajeno" si es de otra persona.';
      return;
    }
    caja.className = 'sc-carro-info';
    const encabezado = [carro.placas, carro.marca, carro.linea].filter(Boolean).join(' · ');
    const detalle = [carro.tipo, carro.color, carro.modelo].filter(Boolean).join(' · ');
    caja.innerHTML = `<strong>${esc(encabezado || 'Sin datos')}</strong>${detalle ? esc(detalle) : ''}`;
  }

  /**
   * El recargo de tarjeta del anticipo, A LA VISTA antes de guardar.
   *
   * El recargo se calculaba bien al guardar, pero no se veía hasta entonces:
   * el dueño elegía "Tarjeta", veía Q500 y solo después descubría que al
   * cliente se le cobraron Q560. Toda la disciplina de dinero de este sistema
   * es que él nunca tenga que sacar una cuenta de cabeza, y un número que
   * aparece después de guardar es la forma exacta del error que ya le costó
   * Q4,800 una vez. El cálculo no se repite aquí: es el mismo que hace
   * agregarPago (datos.js) sobre este mismo pago.
   */
  function mostrarRecargoAnticipo() {
    const linea = el('sc-anticipo-recargo');
    if (!linea) return;
    const anticipo = q(reservaOrigen?.anticipo);
    const esTarjeta = texto('sc-anticipo-forma') === 'tarjeta';
    if (!reservaOrigen?.anticipoPagado || !(anticipo > 0) || !esTarjeta) {
      linea.hidden = true;
      return;
    }
    const recargo = recargoTarjeta(anticipo, num('sc-anticipo-porcentaje'));
    linea.hidden = false;
    linea.textContent = `Con el recargo de tarjeta, al cliente se le cobraron `
      + `${dinero(q(anticipo + recargo))} (${dinero(anticipo)} + ${dinero(recargo)}).`;
  }

  function recalcular() {
    mostrarRecargoAnticipo();
    const ajeno = marcado('sc-ajeno');
    const datos = leerFormulario(null);
    const borrador = construirContrato(datos);

    el('sc-devolucion-prevista').textContent = borrador.devolucionPrevista ? fecha(borrador.devolucionPrevista) : '—';

    const lineas = lineasSalida(borrador);
    el('sc-lineas').innerHTML = lineas.length
      ? lineas.map(filaLinea).join('')
      : '<li class="sc-vacio">Todavía no hay nada que cobrar.</li>';

    // El monto que se recibe sigue el total mientras el mostrador no lo haya
    // tocado a mano — lo normal es cobrar todo lo de la salida de una vez.
    // Si esta salida viene de una reservación con anticipo YA PAGADO (Tarea
    // 9, Regla 1), ese anticipo ya no hace falta cobrarlo de nuevo: el monto
    // sugerido sale de montoSalidaConAnticipo(), que lo resta. Un anticipo
    // PENDIENTE (Regla 3) no cambia nada aquí — sigue siendo parte de lo que
    // se cobra ahora, tal cual.
    const totalSalida = resumen(borrador).totalSalida;
    const montoSugerido = reservaOrigen ? montoSalidaConAnticipo(totalSalida, reservaOrigen) : totalSalida;
    if (!montoPagoTocado) el('sc-pago-monto').value = montoSugerido || '';

    // Se vuelve a leer el formulario a propósito: el paso de arriba puede
    // haber cambiado el campo del monto, y "Total a cobrar" tiene que
    // reflejar ese valor ya sincronizado, no el que había antes de sincronizarlo.
    const conPago = construirContrato(leerFormulario(null));
    const r = resumen(conPago);
    // "Monto sin recargo de tarjeta" es lo que el mostrador escribe (lo que
    // dice la terminal antes del recargo); el recargo se calcula aparte para
    // que nunca se confunda con el total. Si se mostrara solo el total, un
    // mostrador que cobrara mirando la terminal (que ya muestra el monto sin
    // recargo) terminaría cobrando el recargo dos veces (hallazgo importante
    // de la revisión final).
    const montoSinRecargo = q(conPago.pagos[0]?.monto ?? 0);
    const recargoTarjetaCobrado = q(r.pagado - montoSinRecargo);
    el('sc-total').textContent = dinero(r.pagado);
    el('sc-recargo-tarjeta').textContent = dinero(recargoTarjetaCobrado);
    el('sc-garantia').textContent = dinero(borrador.garantiaMonto);

    const contratosDelCliente = clienteSeleccionado
      ? contratosAbiertos.filter((c) => c.clienteId === clienteSeleccionado.id)
      : [];
    const contratosDelCarro = ajeno || !carroId
      ? []
      : contratosAbiertos.filter((c) => c.carroId === carroId);
    // Mismo filtro que contratosDelCarro arriba: solo las reservaciones de
    // ESTE carro exacto (por placa), no las que piden "un microbús" sin
    // unidad asignada — avisosDeSalida (avisos.js) es sobre este carro, no
    // sobre la capacidad del tipo.
    //
    // Y se excluye la reservación de la que se está saliendo (`reservaId`),
    // igual que avisosDeSalida excluye el contrato que se está escribiendo
    // (`otro.id !== contrato?.id`). Sin esto, CADA renta empezada desde
    // "Sacar el carro" pintaba un aviso rojo diciendo que el carro está
    // apartado... para el mismo cliente que está enfrente. Un aviso que se
    // equivoca siempre enseña a ignorar los que no se equivocan, y este
    // sistema ya quitó los avisos de precio y días por esa misma razón.
    const reservasDelCarro = ajeno || !carroId
      ? []
      : reservas.filter((r) => r.carroId === carroId && r.id !== reservaId);

    // avisosDeSalida (avisos.js) ya no avisa por precio ni por días mínimos
    // a propósito — pedido del dueño: "yo pongo el precio que yo quiera" —
    // así que esta pantalla ni siquiera le manda esos dos campos.
    const avisos = avisosDeSalida({
      cliente: clienteSeleccionado,
      carro: ajeno ? null : carroPropio(),
      contrato: borrador,
      contratosDelCliente,
      contratosDelCarro,
      reservasDelCarro,
      hoy: hoyISO(),
    });
    el('sc-avisos').innerHTML = avisos.map(lineaAviso).join('');
  }

  // ---------- Tarea 9: entrar con una reservación ----------

  /**
   * Llena el formulario con lo que la reservación sabe (Paso 1 del brief):
   * cliente, fechas, días y precio por día. El carro NUNCA sale de aquí —
   * lo decide la URL (carroId), igual que en cualquier otra salida; por eso
   * una reservación por tipo (sin carroId) prefil la igual, el carro ya se
   * eligió antes de llegar a esta pantalla (reservas.js).
   *
   * También muestra, bien visible, si el anticipo ya se pagó o sigue
   * pendiente — "money that is already paid must be visible as paid, and
   * money still owed must be visible as owed" — para que el mostrador nunca
   * tenga que hacer esa cuenta en la cabeza.
   */
  function aplicarReserva(reserva) {
    if (reserva.fechaSalida) el('sc-fecha-salida').value = reserva.fechaSalida;
    if (reserva.dias) el('sc-dias').value = reserva.dias;
    if (reserva.precioDia !== undefined && reserva.precioDia !== null && reserva.precioDia !== '') {
      el('sc-precio-dia').value = reserva.precioDia;
    }
    if (reserva.clienteNombre) {
      el('sc-cliente-buscar').value = reserva.clienteNombre;
      buscadorClientes.pintar();
    }

    const anticipo = q(reserva.anticipo);
    if (anticipo > 0 && reserva.anticipoPagado) {
      el('sc-anticipo-pagado-bloque').hidden = false;
      el('sc-anticipo-monto').textContent = dinero(anticipo);
      el('sc-anticipo-fecha').textContent = fecha(reserva.fechaSalida);
    } else if (anticipo > 0) {
      el('sc-anticipo-pendiente-bloque').hidden = false;
      el('sc-anticipo-pendiente-monto').textContent = dinero(anticipo);
    }
  }

  /**
   * Si la reservación trae un cliente ya vinculado (clienteId), lo
   * preselecciona de verdad — no solo el nombre suelto en el buscador — para
   * que el contrato salga con el mismo clienteId que la reservación, sin que
   * el mostrador tenga que volver a buscarlo. `cargarClientes` (datos.js) es
   * la misma lectura que usa la pantalla de Clientes: se pide solo aquí,
   * cuando de verdad hace falta, para no cargarla en cada "Sacar carro" que
   * no viene de una reservación.
   */
  async function preseleccionarClienteDeReserva(reserva) {
    if (!reserva?.clienteId) return;
    try {
      const { datos: clientes } = await cargarClientes();
      if (!sigoVigente()) return;
      const cliente = clientes.find((c) => c.id === reserva.clienteId);
      if (cliente) elegirCliente(cliente);
    } catch {
      // Sin el cliente vinculado disponible: el mostrador lo busca a mano o
      // da de alta uno nuevo, como en cualquier otra salida.
    }
  }

  /**
   * Busca la reservación de origen entre `reservas` y, en cuanto aparece
   * (puede tardar: copia local vacía, primera sincronía todavía en curso),
   * la aplica UNA sola vez. Se llama en cada sincronía de reservas hasta
   * encontrarla — sin esto, abrir esta pantalla justo cuando la copia local
   * de reservas está vacía dejaría el formulario en blanco para siempre.
   */
  function intentarAplicarReserva() {
    if (reservaAplicada || !reservaId) return;
    const encontrada = reservas.find((r) => r.id === reservaId);
    if (!encontrada) return;
    reservaAplicada = true;
    // Una reservación que ya se entregó (o se canceló) no vuelve a llenar el
    // formulario. Las dos entradas vivas —el calendario y la ficha— esconden
    // su botón en cuanto deja de estar pendiente, así que aquí solo se llega
    // con un enlace viejo o guardado en favoritos; pero rellenar desde ella
    // haría un SEGUNDO contrato de la misma reservación, y deshacer eso
    // después es caro y confuso. Se avisa y no se bloquea: el mostrador
    // puede seguir armando una salida normal para ese carro.
    //
    // OJO — el `return` va ANTES de tocar `reservaOrigen`, y ese orden es el
    // arreglo (crítico de la revisión final): `reservaOrigen` no es solo para
    // pintar. De él salen tres cosas que mueven dinero — el descuento de
    // montoSalidaConAnticipo, el pago que agrega conAnticipoComoPago, y el
    // contratoId con que guardar() reapunta la reservación. Cuando se
    // asignaba arriba, el guardia tapaba el formulario pero dejaba pasar las
    // tres: con el botón "atrás" del navegador sobre una reservación ya
    // entregada, la pantalla mostraba "Renta Q2,800.00" y "Total a cobrar
    // Q2,300.00" con el bloque del anticipo ESCONDIDO —nada explicaba la
    // diferencia— y al guardar registraba un pago fantasma de Q500 que nadie
    // recibió, dejaba el saldo en cero y soltaba el candado de la garantía.
    // Q500 de caja perdidos sin que un solo aviso se enterara.
    if (estadoReserva(encontrada) !== 'pendiente') {
      aviso('Esa reservación ya no está pendiente, así que no se usó para llenar el formulario.'
        + ' Puedes hacer la salida normal de este carro.', 'error');
      return;
    }
    reservaOrigen = encontrada;
    aplicarReserva(encontrada);
    preseleccionarClienteDeReserva(encontrada);
    recalcular();
  }

  // ---------- Cliente: buscar, elegir, alta rápida ----------

  function elegirCliente(c) {
    clienteSeleccionado = c;
    el('sc-cliente-resultados').hidden = true;
    el('sc-cliente-buscar').value = '';
    el('sc-cliente-alta').hidden = true;
    el('sc-cliente-elegido').hidden = false;
    el('sc-cliente-elegido-nombre').textContent = nombreCompleto(c) || 'Cliente sin nombre';
    recalcular();
  }

  /**
   * Un buscador con su lista, su aviso de fallo y su botón de reintentar. Lo
   * usan el cliente y el dueño del carro ajeno, así los dos dicen lo mismo y
   * por la misma razón: una lectura que falló (o que todavía no llega) nunca
   * se dibuja como "no hay nada" — el mostrador daría de alta a quien ya
   * existe y su historia quedaría partida en dos. Los ids de la pantalla son
   * `sc-<prefijo>-buscar`, `-resultados`, `-aviso`, `-aviso-texto` y
   * `-reintentar`.
   *
   * `cargar` es cargarClientes o cargarDuenos: sirven la copia local al
   * instante, nunca rechazan, y entregan `{ datos, fallo }`; cada sincronía de
   * atrás (también la que trae el fallo de la nube) vuelve a pintar por
   * `alLlegar`. Se busca en la lista que ya está en memoria, igual de rápido
   * que antes — sin pedirle a la nube nada por letra.
   */
  function crearBuscador({
    tipo, prefijo, cargar, fila,
  }) {
    let items = [];
    const altas = [];
    let leida = false;
    let fallo = false;
    let pedida = false;
    let ultimos = [];

    const lista = () => conAltasDeHoy(items, altas);

    function pintar() {
      const textoAviso = avisoDeLista({
        tipo, leida, fallo, cantidad: items.length,
      });
      el(`sc-${prefijo}-aviso`).hidden = !textoAviso;
      el(`sc-${prefijo}-aviso-texto`).textContent = textoAviso;
      // Reintentar solo cuando no hay nada que mostrar: con una copia local, la
      // lista ya sirve y la nube se vuelve a intentar sola la próxima vez.
      el(`sc-${prefijo}-reintentar`).hidden = !textoAviso || items.length > 0;

      const consulta = el(`sc-${prefijo}-buscar`).value;
      const caja = el(`sc-${prefijo}-resultados`);
      if (!consulta.trim()) {
        caja.hidden = true;
        return;
      }
      const { filas, mensaje } = resultadosDeLista({
        tipo, items: lista(), fallo, leida, consulta,
      });
      ultimos = filas;
      caja.innerHTML = filas.length
        ? filas.map(fila).join('')
        : `<li class="sc-vacio">${esc(mensaje)}</li>`;
      caja.hidden = false;
    }

    function recibir(r) {
      items = Array.isArray(r?.datos) ? r.datos : [];
      // Una lectura sin forma de lectura (no debería pasar) cuenta como fallo:
      // nunca como "no hay nada".
      fallo = r ? Boolean(r.fallo) : true;
      leida = true;
      if (sigoVigente()) pintar();
    }

    // El `catch` es solo por si IndexedDB mismo falla.
    async function leer() {
      try {
        recibir(await cargar(recibir));
      } catch {
        recibir({ datos: items, fallo: true });
      }
    }

    return {
      pintar,
      leer,
      pedir() {
        if (pedida) return;
        pedida = true;
        leer();
      },
      registrarAlta(ficha) { altas.push(ficha); },
      porId(id) { return ultimos.find((r) => r.id === id); },
    };
  }

  const buscadorClientes = crearBuscador({
    tipo: 'clientes', prefijo: 'cliente', cargar: cargarClientes, fila: filaCliente,
  });
  const buscadorDuenos = crearBuscador({
    tipo: 'duenos', prefijo: 'dueno', cargar: cargarDuenos, fila: filaDueno,
  });

  /**
   * Enter dentro de un buscador o de su alta NO puede mandar el formulario:
   * son cajas de texto dentro del <form>, y Enter después de escribir un
   * nombre es reflejo de cualquiera. Sin esto guardaría el contrato entero —
   * con el carro saliendo — mientras todavía se está buscando a alguien. En un
   * alta, Enter guarda esa ficha, que es lo que quien escribe espera
   * (`alEnter`); en una búsqueda, no hace nada. El teclado en una casilla
   * ("Más datos") tampoco manda el formulario.
   */
  function alReintentar(idBoton, buscador) {
    el(idBoton).addEventListener('click', async () => {
      const boton = el(idBoton);
      boton.disabled = true;
      try {
        await buscador.leer();
      } finally {
        boton.disabled = false;
      }
    });
  }

  function sinEnviarConEnter(contenedor, alEnter) {
    contenedor.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
      ev.preventDefault();
      if (alEnter && ev.target.type !== 'checkbox') alEnter();
    });
  }

  // Recorre CAMPOS_CLIENTE, igual que clientes.js — nunca a mano campo por
  // campo — así el alta rápida lee tanto los visibles como los de "Más
  // datos" con el mismo código, y un campo nuevo que se agregue ahí algún
  // día se lee solo.
  function leerCamposAlta() {
    const campos = {};
    CAMPOS_CLIENTE.forEach((c) => { campos[c.id] = texto(`sc-nc-${c.id}`); });
    return campos;
  }

  async function guardarClienteNuevo() {
    // Enter en el alta también llega aquí (ver sinEnviarConEnter): con la tecla
    // sostenida, una segunda llamada no debe dar de alta a la misma persona.
    if (el('sc-cliente-guardar').disabled) return;
    // construirCliente(nucleo/cliente.js) con {} como "existente": es un
    // cliente nuevo, no hay nada previo que arrastrar. faltaAlgo es la misma
    // regla que usa la ficha (solo nombres y apellidos son obligatorios), así
    // las dos pantallas nunca piden cosas distintas para dar de alta.
    const nuevo = construirCliente({}, leerCamposAlta());
    const falta = faltaAlgo(nuevo);
    if (falta.length) {
      aviso(`Falta completar: ${falta.join(', ')}.`, 'error');
      return;
    }
    const boton = el('sc-cliente-guardar');
    boton.disabled = true;
    try {
      const cliente = await guardarCliente(nuevo);
      buscadorClientes.registrarAlta(cliente);
      // Si mientras se guardaba el mostrador ya salió de esta pantalla, el
      // cliente quedó guardado y no hay nada más que pintar (ver
      // guardarDuenoNuevo).
      if (!sigoVigente()) return;
      elegirCliente(cliente);
      aviso('Cliente guardado.', 'exito');
    } catch {
      aviso('No se pudo guardar el cliente. Intenta de nuevo.', 'error');
    } finally {
      boton.disabled = false;
    }
  }

  // ---------- Dueño del carro ajeno: buscar, elegir, alta rápida ----------
  //
  // Es el mismo buscador y la misma alta rápida que el cliente, por la misma
  // razón: el dueño de un carro prestado aparece por primera vez con el carro
  // ya afuera y el cliente esperando. Si dar de alta a alguien obligara a salir
  // de esta pantalla, el mostrador escribiría un nombre a mano y volveríamos a
  // tener dos cuentas para una misma persona.

  function elegirDueno(d) {
    duenoSeleccionado = d;
    el('sc-dueno-resultados').hidden = true;
    el('sc-dueno-buscar').value = '';
    el('sc-dueno-alta').hidden = true;
    el('sc-dueno-elegido').hidden = false;
    el('sc-dueno-elegido-nombre').textContent = (d?.nombre || '').trim() || 'Dueño sin nombre';
  }

  // Recorre CAMPOS_DUENO, igual que el alta del cliente recorre CAMPOS_CLIENTE.
  function leerCamposDueno() {
    const campos = {};
    CAMPOS_DUENO.forEach((c) => { campos[c.id] = texto(`sc-nd-${c.id}`); });
    return campos;
  }

  async function guardarDuenoNuevo() {
    const boton = el('sc-dueno-guardar');
    if (boton.disabled) return;
    // construirDueno (nucleo/dueno.js) con {} como "existente": es un dueño
    // nuevo. faltaAlgoEnDueno es la misma regla que usará la ficha de dueños
    // (solo el nombre es obligatorio), así las dos pantallas piden lo mismo.
    const nuevo = construirDueno({}, leerCamposDueno());
    const falta = faltaAlgoEnDueno(nuevo);
    if (falta.length) {
      aviso(`Falta completar: ${falta.join(', ')}.`, 'error');
      return;
    }
    boton.disabled = true;
    try {
      const dueno = await guardarDueno(nuevo);
      buscadorDuenos.registrarAlta(dueno);
      // Si mientras se guardaba el mostrador ya salió de esta pantalla, el
      // dueño quedó guardado y no hay nada más que pintar: seguir aquí
      // tocaría campos que ya no existen y terminaría diciendo "no se pudo
      // guardar" de algo que sí se guardó.
      if (!sigoVigente()) return;
      // A diferencia del alta del cliente, aquí se vacían los campos: si se
      // abriera otra vez con los mismos datos todavía escritos, un clic más
      // daría de alta a la misma persona dos veces.
      CAMPOS_DUENO.forEach((c) => { el(`sc-nd-${c.id}`).value = ''; });
      elegirDueno(dueno);
      aviso('Dueño guardado.', 'exito');
    } catch {
      aviso('No se pudo guardar el dueño. Intenta de nuevo.', 'error');
    } finally {
      boton.disabled = false;
    }
  }

  // ---------- Guardar el contrato ----------

  async function guardar(ev) {
    ev.preventDefault();
    if (guardando) return;

    if (!clienteSeleccionado) {
      aviso('Elige o da de alta un cliente antes de guardar.', 'error');
      return;
    }
    const ajeno = marcado('sc-ajeno');
    if (!ajeno && !carroPropio()) {
      aviso('Este carro ya no está disponible. Vuelve a la flota e intenta de nuevo.', 'error');
      return;
    }
    if (ajeno && !texto('sc-ajeno-placas')) {
      aviso('Completa al menos las placas del carro ajeno.', 'error');
      return;
    }
    if (!num('sc-dias') || !num('sc-precio-dia')) {
      aviso('Faltan los días o el precio por día.', 'error');
      return;
    }
    if (!texto('sc-rentado-por')) {
      aviso('Falta quién lo rentó.', 'error');
      return;
    }

    guardando = true;
    const boton = el('sc-guardar');
    boton.disabled = true;
    try {
      // El id y el número se piden una sola vez por alquiler (arriba, junto
      // con el resto del estado de la pantalla) y de ahí en adelante se
      // reutilizan: si esta llamada es un reintento porque la anterior se
      // dio por vencida sin saberse si en verdad llegó a guardar, tiene que
      // caer en el mismo documento y no gastar un número nuevo.
      if (!contratoId) contratoId = await nuevoIdContrato();
      if (!numeroContrato) numeroContrato = await siguienteNumeroContrato();
      const base = construirContrato(leerFormulario(numeroContrato));
      // Tarea 9, Regla 1: el anticipo YA PAGADO de la reservación de origen
      // se agrega como un pago de verdad, por agregarPago (datos.js) — nunca
      // a mano — con la forma que el mostrador confirmó arriba (por defecto
      // efectivo, Regla 2) y la fecha de la reservación, no la de hoy. Un
      // anticipo pendiente no cambia nada aquí (Regla 3).
      const contrato = reservaOrigen
        ? conAnticipoComoPago(base, reservaOrigen, {
          forma: texto('sc-anticipo-forma') || 'efectivo',
          porcentajeTarjeta: num('sc-anticipo-porcentaje'),
        })
        : base;
      const guardado = await guardarContrato(contrato);

      // Tarea 9, Regla 4: el contrato ya quedó guardado a partir de aquí,
      // pase lo que pase con la reservación — nunca se deshace. Si viene de
      // una reservación, se marca aparte con contratoId (guardarReserva
      // sella el estado con estadoReserva(), nunca se escribe a mano) para
      // que estadoReserva() la deje 'entregada' y deje de estorbar en los
      // choques y en "salen" del calendario. Un fallo AQUÍ se cuenta tal
      // cual, en español llano, para que el dueño lo arregle a mano en vez
      // de descubrir después que la reservación sigue bloqueando fechas.
      if (reservaOrigen) {
        try {
          await guardarReserva({ ...reservaOrigen, contratoId: guardado.id });
          aviso(`Contrato N° ${guardado.numero} guardado. ${guardado.clienteNombre} se lleva el carro. La reservación quedó entregada.`, 'exito');
        } catch {
          aviso(`Contrato N° ${guardado.numero} guardado y ${guardado.clienteNombre} se lleva el carro, pero la reservación NO se pudo marcar como entregada. Entra a Reservaciones y revísala a mano — puede seguir bloqueando esas fechas.`, 'error');
        }
      } else {
        aviso(`Contrato N° ${guardado.numero} guardado. ${guardado.clienteNombre} se lleva el carro.`, 'exito');
      }
      location.hash = '#/flota';
    } catch {
      aviso('No se pudo guardar el contrato. Intenta de nuevo.', 'error');
    } finally {
      guardando = false;
      boton.disabled = false;
    }
  }

  // ---------- Cablear los eventos ----------

  el('sc-form').addEventListener('input', (ev) => {
    if (ev.target.id === 'sc-pago-monto') montoPagoTocado = true;
    if (ev.target.id === 'sc-porcentaje-comision') comisionTocada = true;
    if (ev.target.id === 'sc-pago-porcentaje') tarjetaTocada = true;
    if (ev.target.id === 'sc-anticipo-porcentaje') anticipoTarjetaTocada = true;
    recalcular();
  });
  el('sc-form').addEventListener('change', (ev) => {
    if (ev.target.id === 'sc-ajeno') {
      refrescarCarro();
      if (marcado('sc-ajeno')) buscadorDuenos.pedir();
    }
    if (ev.target.id === 'sc-t2-agregar') el('sc-t2-campos').hidden = !marcado('sc-t2-agregar');
    if (ev.target.id === 'sc-nc-mas-datos') el('sc-nc-mas-datos-campos').hidden = !marcado('sc-nc-mas-datos');
    if (ev.target.id === 'sc-pago-forma') el('sc-pago-porcentaje-campo').hidden = texto('sc-pago-forma') !== 'tarjeta';
    // Regla 2 del dueño: la forma en que se pagó el anticipo se elige aquí,
    // nunca se adivina — mostrar el % de tarjeta solo cuando de verdad se
    // eligió "Tarjeta" evita que alguien lo confunda con un campo obligatorio.
    if (ev.target.id === 'sc-anticipo-forma') {
      el('sc-anticipo-porcentaje-campo').hidden = texto('sc-anticipo-forma') !== 'tarjeta';
    }
    recalcular();
  });
  el('sc-form').addEventListener('submit', guardar);

  el('sc-cliente-buscar').addEventListener('input', () => buscadorClientes.pintar());
  el('sc-cliente-resultados').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    const c = buscadorClientes.porId(li.dataset.id);
    if (c) elegirCliente(c);
  });
  alReintentar('sc-cliente-reintentar', buscadorClientes);
  sinEnviarConEnter(el('sc-cliente-buscar'));
  sinEnviarConEnter(el('sc-cliente-alta'), guardarClienteNuevo);
  el('sc-cliente-nuevo').addEventListener('click', () => { el('sc-cliente-alta').hidden = false; });
  el('sc-cliente-cambiar').addEventListener('click', () => {
    clienteSeleccionado = null;
    el('sc-cliente-elegido').hidden = true;
    recalcular();
  });
  el('sc-cliente-guardar').addEventListener('click', guardarClienteNuevo);

  el('sc-dueno-buscar').addEventListener('input', () => buscadorDuenos.pintar());
  el('sc-dueno-resultados').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    const d = buscadorDuenos.porId(li.dataset.id);
    if (d) elegirDueno(d);
  });
  el('sc-dueno-nuevo').addEventListener('click', () => { el('sc-dueno-alta').hidden = false; });
  el('sc-dueno-cambiar').addEventListener('click', () => {
    duenoSeleccionado = null;
    el('sc-dueno-elegido').hidden = true;
  });
  el('sc-dueno-guardar').addEventListener('click', guardarDuenoNuevo);
  alReintentar('sc-dueno-reintentar', buscadorDuenos);
  sinEnviarConEnter(el('sc-dueno-buscar'));
  sinEnviarConEnter(el('sc-dueno-alta'), guardarDuenoNuevo);

  refrescarCarro();
  recalcular();
  // El cliente se busca en CADA salida, así que su lista se pide al abrir (la
  // del dueño espera a que se marque "carro ajeno"). Fuera del Promise.all de
  // abajo a propósito: una nube lenta no debe retrasar el resto de la pantalla.
  buscadorClientes.pedir();

  // cargarFlota/cargarContratosAbiertos/cargarReservas sirven la copia local
  // al instante y nunca rechazan (T9), igual que en flota.js; entregan
  // { datos, fallo } (CRÍTICO 2 de la revisión final) — esta pantalla
  // todavía no tiene dónde mostrar ese fallo (no hay una barra como la de
  // flota.js), así que por ahora solo toma `datos`, que nunca inventa un
  // arreglo vacío: cae a la copia local si la nube falló, así que un fallo
  // de red nunca se ve aquí como "no hay reservaciones" cuando sí las hay.
  // Las únicas lecturas de esta pantalla que SÍ dicen cuando fallan son las de
  // los buscadores de cliente y de dueño (ver crearBuscador): ahí un "no hay"
  // falso empuja a dar de alta a alguien que ya existe.
  // cargarAjustes() tampoco rechaza (se queda con los valores del dueño si
  // la nube falla o el documento no existe todavía), así que tampoco hace
  // falta un try/catch.
  const [rFlota, rContratos, rReservas, ajustesCargados] = await Promise.all([
    cargarFlota((r) => { flota = r.datos; if (sigoVigente()) refrescarCarro(); }),
    cargarContratosAbiertos((r) => { contratosAbiertos = r.datos; if (sigoVigente()) recalcular(); }),
    // Tarea 9: cada sincronía de reservas es también una oportunidad de
    // encontrar la reservación de origen (`reservaId`) si la primera lectura
    // (copia local, abajo) todavía no la tenía — intentarAplicarReserva() ya
    // se cuida de aplicarla una sola vez.
    cargarReservas((r) => {
      reservas = r.datos;
      if (!sigoVigente()) return;
      intentarAplicarReserva();
      recalcular();
    }),
    cargarAjustes(),
  ]);
  flota = rFlota.datos;
  contratosAbiertos = rContratos.datos;
  reservas = rReservas.datos;
  ajustes = ajustesCargados;
  if (!sigoVigente()) return;
  intentarAplicarReserva();
  // `!reservaAplicada` y no `!reservaOrigen`: una reservación que SÍ apareció
  // pero ya no está pendiente deja `reservaOrigen` en null a propósito (ver
  // intentarAplicarReserva), y ya avisó por su cuenta. Preguntando por
  // `reservaOrigen` se le encimaba un segundo aviso diciendo que no se
  // encontró, que además es mentira: sí se encontró.
  if (reservaId && !reservaAplicada) {
    // La reservación que traía la URL no apareció ni en la copia local ni en
    // la nube (borrada, o un enlace viejo): se avisa en vez de quedarse
    // callado, pero no bloquea — el mostrador puede seguir armando la salida
    // a mano, como cualquier otra.
    aviso('No se encontró la reservación de origen. Puedes seguir llenando el formulario a mano.', 'error');
  }
  // El % de comisión del formulario arranca en el default fijo de esta
  // pantalla (por si la nube tarda); en cuanto llegan los ajustes reales se
  // actualiza al de verdad, salvo que el mostrador ya lo haya cambiado a mano.
  if (!comisionTocada && ajustes.porcentajeComision !== undefined) {
    el('sc-porcentaje-comision').value = ajustes.porcentajeComision;
  }
  // Mismo mecanismo para el recargo de tarjeta (hallazgo crítico de la
  // revisión final): el campo arranca en PORCENTAJE_TARJETA_DEFECTO (por si
  // la nube tarda) y se actualiza al valor real de cargarAjustes() en cuanto
  // llega, salvo que el mostrador ya lo haya tocado a mano — para que su
  // propio valor escrito nunca se pise con una lectura de ajustes que llega
  // tarde.
  if (!tarjetaTocada && ajustes.porcentajeTarjeta !== undefined) {
    el('sc-pago-porcentaje').value = ajustes.porcentajeTarjeta;
  }
  // Mismo mecanismo para el % de tarjeta del anticipo (Regla 2): arranca en
  // PORCENTAJE_TARJETA_DEFECTO por si la nube tarda, y se actualiza al valor
  // real en cuanto llega, salvo que el mostrador ya lo haya tocado.
  if (!anticipoTarjetaTocada && ajustes.porcentajeTarjeta !== undefined) {
    el('sc-anticipo-porcentaje').value = ajustes.porcentajeTarjeta;
  }
  refrescarCarro();
  recalcular();
}
