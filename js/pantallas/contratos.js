// Historial de contratos (§6 del diseño, "Historial de contratos"): la
// pantalla que reemplaza la hoja CONTRATOS del Excel, que hoy el dueño
// recorre a mano. Es donde busca la renta de un cliente que llamó el mes
// pasado, o revisa cómo quedó un contrato ya cerrado — la flota (flota.js)
// solo muestra lo pendiente, esto es lo que se necesita cuando ya no está.
//
// Dos vistas, mismo patrón que clientes.js/carros.js (sus hermanas más
// cercanas): una lista con filtros y buscador, y una ficha de solo lectura
// para ver el contrato completo. Reutiliza sus mismas clases de CSS
// (carros-contenido, carros-encabezado, tabla-carros, carro-seccion,
// carro-campos, carro-campo, etiqueta-estado, pendiente,
// barra-lectura-fallida) y, para el detalle del cobro, las clases del
// resumen de sacarCarro.js/recibirCarro.js (sc-lineas, sc-total-linea,
// sc-garantia-linea, sc-campos/sc-campo para el filtro con su <select>, que
// carro-campo no sabe vestir). Nada de esto es una hoja de estilos nueva.
//
// Sin cálculos nuevos: todo el dinero que se ve aquí sale de lineasSalida,
// lineasDevolucion y resumen (nucleo/contrato.js) — esta pantalla solo
// pregunta y formatea, nunca suma ni resta por su cuenta.
import { lineasSalida, lineasDevolucion, resumen } from '../nucleo/contrato.js';
import { estadoContrato, pendientesDe } from '../nucleo/estados.js';
import { filtrar, textoDeContrato } from '../nucleo/busqueda.js';
import { textoDosDecimales, textoEntero } from '../nucleo/dinero.js';
import { hoyISO } from '../nucleo/fechas.js';
import { cargarContratos, cargarContrato } from '../datos.js';
import { dinero, fecha } from '../ui.js';
// El puente entre kmSalida y kilometrajeSalida (contratos antiguos que
// guardaron el kilometraje de salida con el nombre viejo) vive en
// recibirCarro.js: conKmSalidaNormalizado(). Esta pantalla lo reutiliza tal
// cual en vez de reimplementarlo, para que exista un solo lugar que decida
// cómo leer ese campo (§7b del diseño).
import { conKmSalidaNormalizado } from './recibirCarro.js';

// Mismo escape que clientes.js/carros.js/flota.js: el texto libre del
// contrato (nombre del cliente, observaciones, destino de la carta poder...)
// nunca entra al HTML sin pasar por aquí.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value ?? '';

// ---------- Reglas puras: fechas, filtros y textos ----------
//
// Separadas de todo lo que dibuja HTML para poder probarlas sin DOM, igual
// que en clientes.js (estaVencido, alertasDe...) y flota.js.

/** El primer día del mes de una fecha ISO ('2026-09-25' -> '2026-09-01'). */
export function primerDiaMes(iso) {
  const [anio, mes] = String(iso || '').split('-');
  if (!anio || !mes) return '';
  return `${anio}-${mes}-01`;
}

/**
 * El último día del mes de una fecha ISO. Se pide el "día 0" del mes
 * siguiente en UTC — igual que el resto de fechas.js: sin tocar la zona
 * horaria local — que siempre cae en el último día del mes anterior, así
 * que no hace falta una tabla de "30 o 31, y febrero según el año".
 */
export function ultimoDiaMes(iso) {
  const [anio, mes] = String(iso || '').split('-').map(Number);
  if (!anio || !mes) return '';
  const ultimo = new Date(Date.UTC(anio, mes, 0));
  const dia = String(ultimo.getUTCDate()).padStart(2, '0');
  const mesTexto = String(ultimo.getUTCMonth() + 1).padStart(2, '0');
  return `${ultimo.getUTCFullYear()}-${mesTexto}-${dia}`;
}

// Los cinco filtros de estado que pide el brief. Cada criterio se apoya en
// estadoContrato/pendientesDe (nucleo/estados.js) — las mismas funciones que
// ya deciden qué se ve en la flota (flota.js) — para que los dos lados nunca
// se desacuerden sobre qué cuenta como "pendiente de cobro" o "garantía sin
// liberar".
const CRITERIOS_ESTADO = {
  rentados: (c) => estadoContrato(c) === 'rentado',
  devueltos: (c) => estadoContrato(c) === 'devuelto',
  cerrados: (c) => estadoContrato(c) === 'cerrado',
  pendientesCobro: (c) => resumen(c).saldo > 0,
  // Igual que filasGarantia en flota.js: mientras el carro sigue afuera la
  // garantía está bien retenida, eso no es "por liberar" todavía.
  garantiasSinLiberar: (c) => Boolean(c?.cierre?.fechaReal) && pendientesDe(c).garantia,
};

/** Filtra por uno de los cinco estados de arriba; sin filtro (o 'todos') no filtra nada. */
export function filtrarPorEstado(contratos, filtro) {
  const criterio = CRITERIOS_ESTADO[filtro];
  return criterio ? contratos.filter(criterio) : contratos;
}

/** Lo que de verdad se pinta: por estado primero, el buscador encima (filtrar/textoDeContrato, busqueda.js). */
export function contratosVisibles(contratos, { filtro, consulta } = {}) {
  return filtrar(filtrarPorEstado(contratos, filtro), consulta, textoDeContrato);
}

/** La clase de la fila en tabla-carros, reutilizando los mismos colores que carros.js/flota.js. */
export function claseFilaContrato(c) {
  const estado = estadoContrato(c);
  if (estado === 'rentado') return 'es-rentado';
  if (estado === 'cerrado') return 'es-fuera';
  return resumen(c).diasAtraso > 0 ? 'es-atrasado' : '';
}

/** "Cómo quedó la cuenta": para el renglón de la lista y el encabezado de la ficha. */
export function textoCuenta(c) {
  const estado = estadoContrato(c);
  if (estado === 'rentado') return 'En curso';
  const r = resumen(c);
  const partes = [];
  if (r.saldo > 0) partes.push(`Debe ${dinero(r.saldo)}`);
  else if (r.saldo < 0) partes.push(`A favor del cliente ${dinero(-r.saldo)}`);
  else partes.push('Pagado');
  if (estado === 'devuelto' && pendientesDe(c).garantia) partes.push('garantía sin liberar');
  return partes.join(' · ');
}

/**
 * Los últimos 4 dígitos de cualquier texto, mostrados como '•••• 3343'
 * (ADR-001: el número completo de la tarjeta nunca se guarda). Los contratos
 * de este sistema ya guardan solo `tarjetas[].ultimos4` con 4 dígitos, pero
 * esta función igual se queda solo con los últimos 4 de lo que reciba, por
 * si algún contrato viejo o corrupto trajera algo más largo: nunca se
 * muestra más que eso, pase lo que pase.
 */
export function numeroEnmascarado(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '').slice(-4);
  return digitos ? `•••• ${digitos}` : '••••';
}

/** 'Saldo' o 'A favor del cliente', con el monto ya en positivo — mismo criterio que recibirCarro.js (textoSaldo). */
function textoSaldoDetalle(saldo) {
  return saldo < 0 ? { etiqueta: 'A favor del cliente', monto: -saldo } : { etiqueta: 'Saldo', monto: saldo };
}

const FORMA_PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

/**
 * La forma de pago de un abono, en español. El primer pago (el de la salida)
 * lo arma `construirContrato` (sacarCarro.js) con el campo `formaPago`;
 * cualquier abono agregado después pasa por `agregarPago` (datos.js), que lo
 * guarda como `forma` — dos nombres para lo mismo dentro del mismo arreglo
 * `pagos`. A `resumen()` nunca le importó (no lee ninguno de los dos para
 * calcular dinero), así que nadie lo había notado hasta que esta pantalla
 * necesitó mostrarlo. Puente de solo lectura, igual que el de `kmSalida`
 * (Tarea 4) y el de `nombres`/`nombre1` (Tarea 6): se leen los dos nombres,
 * sin tocar lo ya guardado ni el código que los escribe.
 */
function formaDePago(p) {
  const clave = p?.forma || p?.formaPago;
  return FORMA_PAGO[clave] || clave || '—';
}

const pluralDias = (n) => `${n} día${n === 1 ? '' : 's'}`;
const ETIQUETAS_ESTADO = { rentado: 'Rentado', devuelto: 'Devuelto', cerrado: 'Cerrado' };

// ---------- Vista: lista ----------

function filaContrato(c) {
  const carro = [c?.carroPlacas, c?.carroDescripcion].filter(Boolean).join(' · ') || '—';
  const regreso = c?.cierre?.fechaReal
    ? fecha(c.cierre.fechaReal)
    : `prevista ${fecha(c?.devolucionPrevista) || '—'}`;
  const estado = estadoContrato(c);

  return `
    <tr class="${claseFilaContrato(c)}" data-id="${esc(c.id)}">
      <td><a href="#/contratos/${esc(c.id)}">${esc(c?.numero ?? '—')}</a></td>
      <td>${esc(c?.clienteNombre || 'Cliente sin nombre')}</td>
      <td>${esc(carro)}</td>
      <td>${esc(fecha(c?.fechaSalida))} → ${esc(regreso)}</td>
      <td><span class="etiqueta-estado">${esc(ETIQUETAS_ESTADO[estado] || estado)}</span></td>
      <td>${esc(textoCuenta(c))}</td>
    </tr>`;
}

function filasCuerpo(contratos) {
  if (!contratos.length) return '<tr><td colspan="6" class="pendiente">Sin resultados.</td></tr>';
  return contratos.map(filaContrato).join('');
}

function ordenarPorSalida(contratos) {
  // Más reciente primero: es como se busca "el contrato de la semana
  // pasada" a simple vista, igual que el historial de clientes.js.
  return [...contratos].sort((a, b) => String(b?.fechaSalida || '').localeCompare(String(a?.fechaSalida || '')));
}

async function dibujarListaEntrada(contenedor, sigoVigente) {
  const hoy = hoyISO();
  // Abre con el mes en curso (§9 del diseño: "los años viejos no se cargan
  // al abrir"); cambiar el rango es lo único de esta pantalla que vuelve a
  // pedirle algo a la nube — el estado y el buscador filtran en memoria.
  let desde = primerDiaMes(hoy);
  let hasta = ultimoDiaMes(hoy);
  let filtro = 'todos';
  let consulta = '';
  let contratos = [];
  let falloNube = false;

  function cablearFilas() {
    el('ct-filas')?.querySelectorAll('tr[data-id]').forEach((f) => {
      f.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'A') return; // Dejar pasar clicks en links
        location.hash = `#/contratos/${f.dataset.id}`;
      });
    });
  }

  function repintarFilas() {
    const cuerpo = el('ct-filas');
    if (!cuerpo) return;
    cuerpo.innerHTML = filasCuerpo(contratosVisibles(ordenarPorSalida(contratos), { filtro, consulta }));
    cablearFilas();
  }

  function pintarPantalla() {
    if (!sigoVigente()) return;
    const barra = falloNube
      ? '<div class="barra-lectura-fallida"><p>No se pudieron leer todos los contratos de este rango. Lo que ves puede estar incompleto.</p></div>'
      : '';

    contenedor.innerHTML = `
      <div class="carros-contenido">
        <div class="carros-encabezado"><h1>Contratos</h1></div>
        ${barra}
        <div class="sc-campos" style="margin-bottom: 20px;">
          <label class="sc-campo">Desde
            <input type="date" id="ct-desde" value="${esc(desde)}">
          </label>
          <label class="sc-campo">Hasta
            <input type="date" id="ct-hasta" value="${esc(hasta)}">
          </label>
          <label class="sc-campo">Estado
            <select id="ct-estado">
              <option value="todos">Todos</option>
              <option value="rentados">Rentados</option>
              <option value="devueltos">Devueltos</option>
              <option value="pendientesCobro">Pendientes de cobro</option>
              <option value="garantiasSinLiberar">Garantías sin liberar</option>
              <option value="cerrados">Cerrados</option>
            </select>
          </label>
        </div>
        <label class="carro-campo">Buscar por número, cliente, placas o carro
          <input type="search" id="ct-buscar" placeholder="Escribe para buscar..." value="${esc(consulta)}">
        </label>
        <table class="tabla-carros">
          <thead>
            <tr><th>N.°</th><th>Cliente</th><th>Carro</th><th>Fechas</th><th>Estado</th><th>Cuenta</th></tr>
          </thead>
          <tbody id="ct-filas">${filasCuerpo(contratosVisibles(ordenarPorSalida(contratos), { filtro, consulta }))}</tbody>
        </table>
      </div>`;

    el('ct-estado').value = filtro;
    cablearFilas();

    el('ct-estado').addEventListener('change', () => { filtro = val('ct-estado'); repintarFilas(); });
    el('ct-buscar').addEventListener('input', () => { consulta = val('ct-buscar'); repintarFilas(); });
    // Cambiar el rango sí vuelve a pedirle a la nube (ver cargar() abajo);
    // es la única parte de este filtro que no se resuelve con lo que ya
    // está en memoria.
    el('ct-desde').addEventListener('change', () => { desde = val('ct-desde'); cargar(); });
    el('ct-hasta').addEventListener('change', () => { hasta = val('ct-hasta'); cargar(); });
  }

  async function cargar() {
    if (!sigoVigente()) return;
    const r = await cargarContratos({ desde, hasta }, (res) => {
      if (!sigoVigente()) return;
      contratos = res.datos;
      falloNube = res.fallo;
      pintarPantalla();
    });
    if (!sigoVigente()) return;
    contratos = r.datos;
    falloNube = r.fallo;
    pintarPantalla();
  }

  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';
  await cargar();
}

// ---------- Vista: ficha del contrato (solo lectura) ----------

function campoSoloLectura(etiqueta, valor) {
  const texto = (valor === undefined || valor === null || valor === '') ? '—' : valor;
  return `
    <label class="carro-campo">${esc(etiqueta)}
      <input type="text" value="${esc(texto)}" disabled readonly>
    </label>`;
}

function filaLinea(l) {
  const detalle = l.detalle ? ` <small>${esc(l.detalle)}</small>` : '';
  return `<li><span>${esc(l.concepto)}${detalle}</span><strong>${dinero(l.monto)}</strong></li>`;
}

// Un carro ajeno (no es de la flota propia) guarda tipo, color, modelo y
// dueño en `carroAjeno` (sacarCarro.js) — se guardaban pero nunca se veían
// en este detalle, que es la única pantalla donde se puede consultar cómo
// era el carro de una renta pasada (hallazgo de la revisión final). Marca y
// modelo ya viajan combinados en `carroDescripcion` (mostrado como "Carro"
// arriba); aquí se agregan los que faltaban.
function camposCarroAjeno(c) {
  if (!c?.ajeno || !c?.carroAjeno) return '';
  return `
        ${campoSoloLectura('Tipo de vehículo', c.carroAjeno.tipo)}
        ${campoSoloLectura('Color', c.carroAjeno.color)}
        ${campoSoloLectura('Modelo', c.carroAjeno.modelo)}
        ${campoSoloLectura('Dueño del carro', c.carroAjeno.dueno)}`;
}

function seccionSalida(c) {
  const carro = [c?.carroPlacas, c?.carroDescripcion].filter(Boolean).join(' · ') || '—';
  const conductor = c?.conductorAdicional?.nombre || '';
  const conductorLicencia = c?.conductorAdicional?.licencia || '';
  const conductorIdentificacion = c?.conductorAdicional?.identificacion || '';
  return `
    <section class="carro-seccion">
      <h2>Datos de la salida</h2>
      <div class="carro-campos">
        ${campoSoloLectura('Carro', carro)}
        ${campoSoloLectura('Fecha de salida', fecha(c?.fechaSalida))}
        ${campoSoloLectura('Hora de salida', c?.horaSalida)}
        ${campoSoloLectura('Lugar', c?.lugar)}
        ${campoSoloLectura('Días contratados', c?.dias)}
        ${campoSoloLectura('Precio por día', c?.precioDia != null ? dinero(c.precioDia) : '')}
        ${campoSoloLectura('Kilometraje de salida', c?.kmSalida != null ? textoEntero(c.kmSalida) : '')}
        ${campoSoloLectura('Combustible de salida', c?.combustibleSalida)}
        ${camposCarroAjeno(c)}
        ${campoSoloLectura('Devolución prevista', fecha(c?.devolucionPrevista))}
        ${campoSoloLectura('Quién lo rentó', c?.rentadoPor)}
        ${campoSoloLectura('Conductor adicional', conductor)}
        ${campoSoloLectura('Licencia del conductor', conductorLicencia)}
        ${campoSoloLectura('Identificación del conductor', conductorIdentificacion)}
      </div>
    </section>`;
}

function seccionCobroSalida(c, r) {
  const lineas = lineasSalida(c);
  return `
    <section class="carro-seccion">
      <h2>Cobro al salir</h2>
      <ul class="sc-lineas">
        ${lineas.length ? lineas.map(filaLinea).join('') : '<li class="sc-vacio">Nada que cobrar al salir.</li>'}
      </ul>
      <div class="sc-total-linea"><strong>Total al salir</strong><span>${dinero(r.totalSalida)}</span></div>
    </section>`;
}

function seccionCobroDevolucion(c, r) {
  if (!c?.cierre?.fechaReal) {
    return `
      <section class="carro-seccion">
        <h2>Cobro al recibir</h2>
        <p class="pendiente">Todavía no se ha recibido el carro.</p>
      </section>`;
  }
  const lineas = lineasDevolucion(c);
  return `
    <section class="carro-seccion">
      <h2>Cobro al recibir</h2>
      <div class="carro-campos">
        ${campoSoloLectura('Fecha real de entrada', fecha(c.cierre.fechaReal))}
        ${campoSoloLectura('Hora real de entrada', c.cierre.horaReal)}
        ${campoSoloLectura('Lugar de entrada', c.cierre.lugarEntrada)}
        ${campoSoloLectura('Kilometraje de entrada', c.cierre.kmEntrada)}
        ${campoSoloLectura('Días de atraso', r.diasAtraso > 0 ? pluralDias(r.diasAtraso) : 'Sin atraso')}
      </div>
      <ul class="sc-lineas">
        ${lineas.length ? lineas.map(filaLinea).join('') : '<li class="sc-vacio">Sin cargos adicionales al recibir.</li>'}
      </ul>
      <div class="sc-total-linea"><strong>Total al recibir</strong><span>${dinero(r.totalDevolucion)}</span></div>
    </section>`;
}

// El % de comisión y el costo del dueño (subarriendo) NO se muestran aquí a
// propósito: son del área de dinero (plan 5), aunque resumen() los calcule
// (costoSubarriendo, utilidad) — esta sección solo toma de resumen() lo que
// sí le toca a esta pantalla: subtotal, lo cobrado y el saldo.
function seccionResumenCobro(r) {
  const { etiqueta, monto } = textoSaldoDetalle(r.saldo);
  return `
    <section class="carro-seccion">
      <h2>Resumen del cobro</h2>
      <div class="sc-garantia-linea"><span>Subtotal</span><strong>${dinero(r.subtotal)}</strong></div>
      <div class="sc-garantia-linea"><span>Total cobrado</span><strong>${dinero(r.totalCobrado)}</strong></div>
      <div class="sc-total-linea"><strong>${esc(etiqueta)}</strong><span>${dinero(monto)}</span></div>
    </section>`;
}

function seccionPagos(c) {
  const pagos = Array.isArray(c?.pagos) ? c.pagos : [];
  const filas = pagos.length
    ? pagos.map((p) => `
        <tr>
          <td>${esc(fecha(p?.fecha))}</td>
          <td>${esc(formaDePago(p))}</td>
          <td>${dinero(p?.monto)}</td>
          <td>${p?.porcentajeTarjeta ? `${textoDosDecimales(p.porcentajeTarjeta)}%` : '—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="pendiente">Todavía no hay pagos registrados.</td></tr>';

  return `
    <section class="carro-seccion">
      <h2>Pagos</h2>
      <table class="tabla-carros">
        <thead><tr><th>Fecha</th><th>Forma</th><th>Monto</th><th>% de tarjeta</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </section>`;
}

function seccionGarantia(c) {
  const pend = pendientesDe(c);
  const tarjetas = Array.isArray(c?.tarjetas) ? c.tarjetas : [];
  const filasTarjetas = tarjetas.length
    ? tarjetas.map((t) => `
        <tr>
          <td>${numeroEnmascarado(t?.ultimos4)}</td>
          <td>${esc(t?.vencimiento || '—')}</td>
          <td>${esc(t?.banco || '—')}</td>
          <td>${esc(t?.autorizacion || '—')}</td>
          <td>${dinero(t?.montoAutorizado)}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="pendiente">Sin tarjetas registradas.</td></tr>';
  const estadoGarantia = pend.garantia
    ? 'Sin liberar'
    : `Liberada${c?.garantiaLiberadaEn ? ` el ${esc(fecha(c.garantiaLiberadaEn))}` : ''}`;

  return `
    <section class="carro-seccion">
      <h2>Garantía</h2>
      <div class="sc-garantia-linea"><span>Monto bloqueado</span><strong>${dinero(c?.garantiaMonto)}</strong></div>
      <div class="sc-garantia-linea"><span>Estado</span><strong>${estadoGarantia}</strong></div>
      <table class="tabla-carros">
        <thead><tr><th>Tarjeta</th><th>Vencimiento</th><th>Banco</th><th>Autorización</th><th>Monto autorizado</th></tr></thead>
        <tbody>${filasTarjetas}</tbody>
      </table>
    </section>`;
}

function seccionObservaciones(c) {
  const texto = c?.observaciones ? esc(c.observaciones) : '<span class="pendiente">Sin observaciones.</span>';
  return `<section class="carro-seccion"><h2>Observaciones</h2><p>${texto}</p></section>`;
}

function plantillaDetalle(c) {
  const r = resumen(c);
  const estado = estadoContrato(c);
  return `
    <div class="carros-contenido">
      <div class="carro-formulario">
        <div class="carros-encabezado">
          <h1>Contrato N.° ${esc(c?.numero ?? '—')}</h1>
          <button type="button" id="ct-volver" class="btn">Volver</button>
        </div>
        <p class="sc-carro-info">
          <strong>${esc(c?.clienteNombre || 'Cliente sin nombre')}</strong>
          <span class="etiqueta-estado">${esc(ETIQUETAS_ESTADO[estado] || estado)}</span> — ${esc(textoCuenta(c))}
        </p>
        ${seccionSalida(c)}
        ${seccionCobroSalida(c, r)}
        ${seccionCobroDevolucion(c, r)}
        ${seccionResumenCobro(r)}
        ${seccionPagos(c)}
        ${seccionGarantia(c)}
        ${seccionObservaciones(c)}
      </div>
    </div>`;
}

async function dibujarDetalleEntrada(contenedor, contratoId, sigoVigente) {
  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';

  // cargarContrato (datos.js) devuelve `null` cuando de verdad no existe,
  // pero puede rechazar cuando la nube no contesta a tiempo y no hay copia
  // local — mismo cuidado que recibirCarro.js: las dos cosas se avisan
  // distinto, nunca como si el contrato sencillamente no existiera.
  let contrato = null;
  let fallo = false;
  try {
    contrato = await cargarContrato(contratoId);
  } catch {
    fallo = true;
  }
  if (!sigoVigente()) return;

  if (fallo) {
    contenedor.innerHTML = '<div class="barra-lectura-fallida"><p>No se pudo leer este contrato. Revisa tu conexión e intenta de nuevo.</p></div>';
    return;
  }
  if (!contrato) {
    contenedor.innerHTML = `<p class="pendiente">No se encontró el contrato ${esc(contratoId)}.</p>`;
    return;
  }

  // IMPORTANTE de la revisión final: sin este puente, un contrato viejo
  // (guardado antes de que "Sacar carro" empezara a escribir `kmSalida`)
  // mostraba "Kilometraje de salida —" aquí, y este detalle es el único
  // lugar donde se puede consultar el kilometraje de una renta pasada.
  contrato = conKmSalidaNormalizado(contrato);

  contenedor.innerHTML = plantillaDetalle(contrato);
  el('ct-volver')?.addEventListener('click', () => { location.hash = '#/contratos'; });
}

// ---------- Punto de entrada principal ----------

const RUTA = '#/contratos';
let ultimoToken = 0;

/** Dibuja la pantalla de contratos dentro de `contenedor`: la lista o la ficha de `contratoId`. */
export async function pintarContratos(contenedor, contratoId) {
  const miToken = ++ultimoToken;
  const hash = location.hash;
  const sigoVigente = () => location.hash.startsWith(RUTA) && miToken === ultimoToken;

  if (hash === RUTA) {
    await dibujarListaEntrada(contenedor, sigoVigente);
  } else if (contratoId) {
    await dibujarDetalleEntrada(contenedor, contratoId, sigoVigente);
  }
}
