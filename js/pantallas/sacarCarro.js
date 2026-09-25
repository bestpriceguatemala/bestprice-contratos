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
import { devolucionPrevista, hoyISO } from '../nucleo/fechas.js';
import { q, suma } from '../nucleo/dinero.js';
import {
  cargarFlota, cargarContratosAbiertos, cargarAjustes, buscarClientes,
  guardarCliente, guardarContrato, siguienteNumeroContrato, nuevoIdContrato,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';
// El alta rápida de aquí y la ficha de clientes.js tienen que pedir
// exactamente los mismos campos (Tarea 7) — por eso esta pantalla ya no
// inventa su propia lista de siete campos sueltos ni su propia forma de
// armar el objeto a guardar: se dibuja desde CAMPOS_CLIENTE y se guarda con
// construirCliente, igual que la ficha.
import {
  CAMPOS_CLIENTE, construirCliente, nombreCompleto, faltaAlgo,
} from '../nucleo/cliente.js';

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

const descripcionCarroPropio = (c) => [c?.marca, c?.linea].filter(Boolean).join(' ');
const descripcionCarroAjeno = (c) => [c?.marca, c?.modelo].filter(Boolean).join(' ');

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
    id, numero, cliente, ajeno, carro, carroAjeno,
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

  const garantiaMonto = suma(...tarjetas.map((t) => t.montoAutorizado));

  const montoPagoNum = q(montoPago);
  const pagos = montoPagoNum
    ? [{ monto: montoPagoNum, forma: forma || 'efectivo', porcentajeTarjeta: forma === 'tarjeta' ? q(porcentajeTarjeta) : 0 }]
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
    // resumen() (nucleo/contrato.js) solo cobra costo de subarriendo cuando
    // este campo existe; en un carro propio se deja en null a propósito.
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

    tarjetas,
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
 * Lo que hace falta para entregar el carro con el cliente esperando en el
 * mostrador: su nombre, sus documentos y cómo contactarlo. El resto de
 * CAMPOS_CLIENTE (nacionalidad, direcciones adicionales, facturación...) se
 * pide igual, pero detrás de "Más datos" — nadie debería tener que escribir
 * una nacionalidad para que el carro salga del lote.
 */
const CAMPOS_ALTA_VISIBLES = [
  'nombres', 'apellidos', 'documento', 'documentoExpira',
  'licencia', 'licenciaExpira', 'telefono', 'correo', 'direccionReferencia',
];

/** El campo de CAMPOS_CLIENTE `c`, dibujado con el input id `sc-nc-<id>`. */
function campoAlta(c) {
  return campo(`sc-nc-${c.id}`, c.etiqueta, { tipo: TIPO_INPUT_CLIENTE[c.tipo] || 'text' });
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
              ${CAMPOS_CLIENTE.filter((c) => CAMPOS_ALTA_VISIBLES.includes(c.id)).map(campoAlta).join('')}
            </div>
            <label class="sc-checkbox">
              <input type="checkbox" id="sc-nc-mas-datos"> Más datos
            </label>
            <div id="sc-nc-mas-datos-campos" class="sc-campos" hidden>
              ${CAMPOS_CLIENTE.filter((c) => !CAMPOS_ALTA_VISIBLES.includes(c.id)).map(campoAlta).join('')}
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
            ${campo('sc-ajeno-dueno', 'Dueño')}
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

const PREFIJO_RUTA = '#/sacar/';
let ultimoToken = 0;

/** Dibuja "Sacar carro" dentro de `contenedor`, para el carro `carroId`. */
export async function pintarSacarCarro(contenedor, carroId) {
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith(PREFIJO_RUTA) && miToken === ultimoToken;

  let flota = [];
  let contratosAbiertos = [];
  let ajustes = {};
  let clienteSeleccionado = null;
  let ultimosResultados = [];
  let montoPagoTocado = false;
  let comisionTocada = false;
  let tarjetaTocada = false;
  let guardando = false;
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
        color: texto('sc-ajeno-color'), modelo: texto('sc-ajeno-modelo'), dueno: texto('sc-ajeno-dueno'),
        costoDia: num('sc-ajeno-costo'),
      } : null,
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

  function recalcular() {
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
    const totalSalida = resumen(borrador).totalSalida;
    if (!montoPagoTocado) el('sc-pago-monto').value = totalSalida || '';

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

    // avisosDeSalida (avisos.js) ya no avisa por precio ni por días mínimos
    // a propósito — pedido del dueño: "yo pongo el precio que yo quiera" —
    // así que esta pantalla ni siquiera le manda esos dos campos.
    const avisos = avisosDeSalida({
      cliente: clienteSeleccionado,
      carro: ajeno ? null : carroPropio(),
      contrato: borrador,
      contratosDelCliente,
      contratosDelCarro,
      hoy: hoyISO(),
    });
    el('sc-avisos').innerHTML = avisos.map(lineaAviso).join('');
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

  async function buscarYMostrarClientes(consulta) {
    if (!consulta.trim()) {
      el('sc-cliente-resultados').hidden = true;
      return;
    }
    const resultados = await buscarClientes(consulta);
    if (!sigoVigente() || el('sc-cliente-buscar').value.trim() !== consulta.trim()) return;
    ultimosResultados = resultados;
    const lista = el('sc-cliente-resultados');
    lista.innerHTML = resultados.length
      ? resultados.slice(0, 8).map(filaCliente).join('')
      : '<li class="sc-vacio">Sin resultados. Puedes darlo de alta abajo.</li>';
    lista.hidden = false;
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
      elegirCliente(cliente);
      aviso('Cliente guardado.', 'exito');
    } catch {
      aviso('No se pudo guardar el cliente. Intenta de nuevo.', 'error');
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
      const contrato = construirContrato(leerFormulario(numeroContrato));
      const guardado = await guardarContrato(contrato);
      aviso(`Contrato N° ${guardado.numero} guardado. ${guardado.clienteNombre} se lleva el carro.`, 'exito');
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
    recalcular();
  });
  el('sc-form').addEventListener('change', (ev) => {
    if (ev.target.id === 'sc-ajeno') refrescarCarro();
    if (ev.target.id === 'sc-t2-agregar') el('sc-t2-campos').hidden = !marcado('sc-t2-agregar');
    if (ev.target.id === 'sc-nc-mas-datos') el('sc-nc-mas-datos-campos').hidden = !marcado('sc-nc-mas-datos');
    if (ev.target.id === 'sc-pago-forma') el('sc-pago-porcentaje-campo').hidden = texto('sc-pago-forma') !== 'tarjeta';
    recalcular();
  });
  el('sc-form').addEventListener('submit', guardar);

  el('sc-cliente-buscar').addEventListener('input', (ev) => buscarYMostrarClientes(ev.target.value));
  el('sc-cliente-resultados').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    const c = ultimosResultados.find((r) => r.id === li.dataset.id);
    if (c) elegirCliente(c);
  });
  el('sc-cliente-nuevo').addEventListener('click', () => { el('sc-cliente-alta').hidden = false; });
  el('sc-cliente-cambiar').addEventListener('click', () => {
    clienteSeleccionado = null;
    el('sc-cliente-elegido').hidden = true;
    recalcular();
  });
  el('sc-cliente-guardar').addEventListener('click', guardarClienteNuevo);

  refrescarCarro();
  recalcular();

  // cargarFlota/cargarContratosAbiertos sirven la copia local al instante y
  // nunca rechazan (T9), igual que en flota.js; ahora entregan { datos, fallo
  // } (CRÍTICO 2 de la revisión final) — esta pantalla todavía no tiene dónde
  // mostrar ese fallo (no hay una barra como la de flota.js), así que por
  // ahora solo toma `datos`, que nunca inventa un arreglo vacío: cae a la
  // copia local si la nube falló. cargarAjustes() tampoco rechaza (se queda
  // con los valores del dueño si la nube falla o el documento no existe
  // todavía), así que tampoco hace falta un try/catch.
  const [rFlota, rContratos, ajustesCargados] = await Promise.all([
    cargarFlota((r) => { flota = r.datos; if (sigoVigente()) refrescarCarro(); }),
    cargarContratosAbiertos((r) => { contratosAbiertos = r.datos; if (sigoVigente()) recalcular(); }),
    cargarAjustes(),
  ]);
  flota = rFlota.datos;
  contratosAbiertos = rContratos.datos;
  ajustes = ajustesCargados;
  if (!sigoVigente()) return;
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
  refrescarCarro();
  recalcular();
}
