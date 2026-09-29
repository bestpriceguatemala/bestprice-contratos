// Pantalla de calendario (§12b del diseño, "Reservaciones y calendario"): el
// mes que el dueño hojea para ver qué pasa esta semana — qué carro sale, cuál
// regresa y qué ya está atrasado. La abre casi tanto como Flota.
//
// Sigue la misma forma de trabajo que flota.js (el cuadro que se escanea de
// un vistazo) y reservas.js (cómo carga datos, dibuja la barra roja de una
// lectura fallida, y registra su ruta con parámetro). No reinventa ninguna
// regla del negocio: cuadriculaDelMes y movimientosDelDia (nucleo/calendario.js)
// ya hacen todo el cálculo — esta pantalla solo pinta lo que contestan.
import { cuadriculaDelMes, movimientosDelDia } from '../nucleo/calendario.js';
import { textoAnticipo } from '../nucleo/reserva.js';
import { resumen } from '../nucleo/contrato.js';
import { diasEntre, hoyISO, textoFecha } from '../nucleo/fechas.js';
import { cargarReservas, cargarContratosAbiertos, cargarFlota } from '../datos.js';
import { dinero } from '../ui.js';

// El texto libre (nombre de cliente, nota...) se escapa antes de entrar al
// HTML, igual que en flota.js/reservas.js, para que un "&" o un "<" sueltos
// no rompan la pantalla.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pluralDias = (n) => `${n} día${n === 1 ? '' : 's'}`;

// ---------- Reglas puras: mes, fechas y textos ----------
//
// Separadas de todo lo que dibuja HTML para poder probarlas sin DOM, igual
// que en reservas.js (queSeAparto, reservasVisibles...).

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es una fecha ISO 'YYYY-MM-DD' con forma válida? */
export function esFechaValida(fecha) {
  return typeof fecha === 'string' && RE_FECHA.test(fecha);
}

/** El mes ('YYYY-MM') de una fecha ISO válida, o '' si la fecha no lo es. */
export function mesDeFecha(fecha) {
  return esFechaValida(fecha) ? fecha.slice(0, 7) : '';
}

/**
 * El mes siguiente a `mes` ('YYYY-MM'), rodando el año en diciembre→enero.
 *
 * A propósito no usa aritmética de `Date` sobre un día del mes (hallazgo que
 * el brief marca como riesgo: retroceder de marzo y volver a avanzar tiene
 * que aterrizar en marzo otra vez) — aquí solo se suma 1 al número de mes, sin
 * pasar nunca por un día que podría no existir en el mes vecino.
 */
export function mesSiguiente(mes) {
  const [anioTexto, mesTexto] = String(mes || '').split('-');
  const anio = Number(anioTexto);
  const numeroMes = Number(mesTexto);
  if (!anio || !numeroMes) return mes;
  const siguiente = numeroMes === 12 ? 1 : numeroMes + 1;
  const anioSiguiente = numeroMes === 12 ? anio + 1 : anio;
  return `${anioSiguiente}-${String(siguiente).padStart(2, '0')}`;
}

/** El mes anterior a `mes` ('YYYY-MM'), rodando el año en enero→diciembre. */
export function mesAnterior(mes) {
  const [anioTexto, mesTexto] = String(mes || '').split('-');
  const anio = Number(anioTexto);
  const numeroMes = Number(mesTexto);
  if (!anio || !numeroMes) return mes;
  const anterior = numeroMes === 1 ? 12 : numeroMes - 1;
  const anioAnterior = numeroMes === 1 ? anio - 1 : anio;
  return `${anioAnterior}-${String(anterior).padStart(2, '0')}`;
}

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'YYYY-MM' en el título que lee el dueño: 'Septiembre 2026'. */
export function tituloMes(mes) {
  const [anioTexto, mesTexto] = String(mes || '').split('-');
  const numeroMes = Number(mesTexto);
  if (!anioTexto || !numeroMes || numeroMes < 1 || numeroMes > 12) return '';
  const nombre = NOMBRES_MES[numeroMes - 1];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anioTexto}`;
}

/**
 * El carro o el tipo que apartó una reservación, para la lista de "Salen".
 * Mismo criterio que queSeAparto (reservas.js), escrito aparte porque cada
 * pantalla trae su propia capa de presentación (igual que esc() se repite en
 * cada una) — no es una regla de negocio, solo cómo se rotula un renglón.
 */
export function descripcionVehiculoReserva(reserva, flota) {
  if (reserva?.carroId) {
    const carro = (flota || []).find((c) => c.id === reserva.carroId);
    if (carro) return [carro.placas, carro.marca, carro.linea].filter(Boolean).join(' · ');
    return reserva?.carroPlacas || 'Carro apartado';
  }
  if (reserva?.tipoVehiculo) return reserva.tipoVehiculo;
  return 'Sin tipo';
}

/**
 * "Pendiente de pagar QX" o "Ya pagó", para la lista de "Regresan" (brief,
 * Paso 2). El número sale de resumen(c).saldo — nunca se escribe a mano ni se
 * recorta: si el saldo es 0 o negativo (un sobrepago real, ver el comentario
 * de resumen() en nucleo/contrato.js) ya pagó lo que debía.
 */
export function textoSaldoContrato(c) {
  const { saldo } = resumen(c);
  return saldo > 0 ? `Pendiente de pagar ${dinero(saldo)}` : 'Ya pagó';
}

const descripcionVehiculoContrato = (c) => [c?.carroPlacas, c?.carroDescripcion].filter(Boolean).join(' · ') || 'Carro sin datos';

// ---------- El botón "Sacar carro" de un renglón de "Salen" ----------
//
// Los dos caminos llevan la reservación consigo, y eso es el punto.
//
// Con carro exacto se va directo a ese carro, pero CON `?reserva=` pegado: sin
// eso el formulario se abría en blanco y el anticipo ya pagado no se
// descontaba, así que el botón del calendario — el que de verdad se usa, al
// abrir el día — no habría servido para nada y el dueño habría vuelto a
// cobrar lo que el cliente ya depositó.
//
// Apartado solo por tipo no hay carro al cual mandar: se va a la ficha de la
// reservación (#/reservas/:id), que es donde se elige el carro exacto y de
// ahí se sale con la reservación en la mano. Antes (Tarea 6) esto mandaba a
// Flota como remiendo, un enlace que perdía la reservación de camino.
export function botonSacarCarro(reserva) {
  const ruta = reserva?.carroId
    ? `#/sacar/${esc(reserva.carroId)}?reserva=${esc(reserva.id)}`
    : `#/reservas/${esc(reserva.id)}`;
  return `<a class="btn" href="${ruta}">Sacar carro</a>`;
}

// ---------- La barra roja de una lectura fallida ----------
//
// Mismo patrón que flota.js y reservas.js (hallazgo crítico de la revisión
// final de ese plan): una lectura que falló nunca se dibuja como un mes
// vacío y tranquilo. La cuadrícula del mes se sigue mostrando (el cálculo del
// calendario no depende de la nube), pero con este aviso arriba diciendo que
// los números pueden estar incompletos.
function barraFallo(falloReservas, falloContratos, falloFlota) {
  const mensajes = [];
  if (falloReservas) mensajes.push('No se pudieron leer las reservaciones. Los que salen pueden estar incompletos.');
  if (falloContratos) mensajes.push('No se pudieron leer los contratos. Los que regresan o están atrasados pueden estar incompletos.');
  if (falloFlota) mensajes.push('No se pudo leer la flota. La descripción del carro apartado puede estar incompleta.');
  if (!mensajes.length) return '';
  return `<div class="barra-lectura-fallida">${mensajes.map((m) => `<p>${esc(m)}</p>`).join('')}</div>`;
}

// ---------- Vista: una celda del mes ----------

/**
 * Una celda del mes: el número del día y sus dos flechas (brief, Paso 1).
 * `movs` viene de la MISMA llamada a movimientosDelDia que arma el detalle de
 * abajo (ver plantillaMes) — nunca se vuelve a calcular aparte, para que el
 * número de la celda y la lista del detalle siempre cuadren entre sí.
 *
 * ↓ cuenta `regresan` (vencía hoy y todavía no ha vuelto), no `yaRegresaron`:
 * un carro que ya está en el patio no debe leerse como trabajo pendiente.
 *
 * Verde el que sale, rojo el que entra: es como lo lee el dueño de un
 * vistazo, sin traducir nada. Eso deja los atrasados compartiendo el rojo
 * con los regresos, así que dejan de distinguirse por color y pasan a
 * distinguirse por FORMA — una pastilla roja rellena con el texto en
 * blanco. Un aviso tiene que seguir saltando aunque su color ya no sea
 * exclusivo; si se quedara como un número rojo más, se perdería entre los
 * regresos del mismo día, que es justo cuando más importa verlo.
 */
function celdaDia(fecha, hoy, diaSeleccionado, movs) {
  if (!fecha) return '<div class="cal-vacio" style="min-height:76px;background:var(--fondo);border-radius:6px;"></div>';

  const dia = Number(fecha.slice(8, 10));
  const esHoy = fecha === hoy;
  const esSeleccionado = fecha === diaSeleccionado;
  const salen = movs.salen.length;
  const regresan = movs.regresan.length;
  const atrasados = movs.atrasados.length;

  const borde = esSeleccionado ? 'border:2px solid var(--azul);' : 'border:1px solid var(--borde);';
  const fondo = esHoy ? 'background:#eaf2fc;' : 'background:var(--blanco);';

  return `
    <div class="cal-dia" data-fecha="${esc(fecha)}"
      style="${borde}${fondo}border-radius:6px;padding:8px;min-height:76px;cursor:pointer;">
      <div style="font-weight:600;${esHoy ? 'color:var(--azul);' : ''}">${dia}</div>
      <div style="display:flex;gap:10px;font-size:0.9em;font-weight:600;margin-top:4px;">
        ${salen ? `<span style="color:var(--verde);">↑ ${salen}</span>` : ''}
        ${regresan ? `<span style="color:var(--rojo);">↓ ${regresan}</span>` : ''}
      </div>
      ${atrasados ? `<div style="display:inline-block;background:var(--rojo);color:var(--blanco);font-weight:700;font-size:0.8em;border-radius:10px;padding:1px 7px;margin-top:3px;">⚠ ${atrasados}</div>` : ''}
    </div>`;
}

// ---------- Vista: el detalle del día elegido ----------

function listaSalen(salen, flota) {
  if (!salen.length) return '';
  const filas = salen.map((r) => `
    <li>
      <strong>${esc(r?.clienteNombre || 'Cliente sin nombre')}</strong>
      <span>${esc(descripcionVehiculoReserva(r, flota))}</span>
      <span>${esc(pluralDias(Number(r?.dias) || 0))}</span>
      <span>${esc(textoAnticipo(r))}</span>
      ${botonSacarCarro(r)}
    </li>`).join('');
  return `<div class="cal-lista"><h3>Salen</h3><ul class="lista-pendientes">${filas}</ul></div>`;
}

function listaRegresan(regresan) {
  if (!regresan.length) return '';
  const filas = regresan.map((c) => `
    <li>
      <strong>${esc(c?.clienteNombre || 'Cliente sin nombre')}</strong>
      <span>${esc(descripcionVehiculoContrato(c))}</span>
      <span>${esc(textoSaldoContrato(c))}</span>
      <a class="btn" href="#/recibir/${esc(c?.id)}">Recibir carro</a>
    </li>`).join('');
  return `<div class="cal-lista"><h3>Regresan</h3><ul class="lista-pendientes">${filas}</ul></div>`;
}

/**
 * Los que ya volvieron ese día: aparte y en gris (brief no lo pide, pero lo
 * deja al criterio de quien implementa — "un carro sentado en su patio no
 * debe leerse como trabajo pendiente"). Sin botón: ya no hay nada que sacar
 * ni recibir aquí, "Recibir carro" ya se usó.
 */
function listaYaRegresaron(lista) {
  if (!lista.length) return '';
  const filas = lista.map((c) => `
    <li style="opacity:0.6;">
      <strong>${esc(c?.clienteNombre || 'Cliente sin nombre')}</strong>
      <span>${esc(descripcionVehiculoContrato(c))}</span>
      <span>Ya está de vuelta</span>
    </li>`).join('');
  return `<div class="cal-lista"><h3 style="color:var(--gris);">Ya de vuelta</h3><ul class="lista-pendientes">${filas}</ul></div>`;
}

/**
 * Los atrasados de ESE día (estaAtrasado se mide contra la fecha que se está
 * viendo, no contra hoy — ver el comentario de esa función en
 * nucleo/calendario.js), con su propio botón "Recibir carro": siguen sin
 * regresar, el mostrador puede recibirlos desde aquí igual que desde Flota.
 */
function listaAtrasados(lista, fecha) {
  if (!lista.length) return '';
  const filas = lista.map((c) => `
    <li>
      <strong>${esc(c?.clienteNombre || 'Cliente sin nombre')}</strong>
      <span>${esc(descripcionVehiculoContrato(c))}</span>
      <span style="color:var(--rojo);font-weight:600;">Atrasado ${esc(pluralDias(diasEntre(c?.devolucionPrevista, fecha)))}</span>
      <a class="btn" href="#/recibir/${esc(c?.id)}">Recibir carro</a>
    </li>`).join('');
  return `<div class="cal-lista"><h3 style="color:var(--rojo);">Atrasados</h3><ul class="lista-pendientes">${filas}</ul></div>`;
}

function seccionDetalle(fecha, movs, flota, hoy) {
  const titulo = `${textoFecha(fecha)}${fecha === hoy ? ' — hoy' : ''}`;
  const listas = [
    listaSalen(movs.salen, flota),
    listaRegresan(movs.regresan),
    listaYaRegresaron(movs.yaRegresaron),
    listaAtrasados(movs.atrasados, fecha),
  ].filter(Boolean);

  const cuerpo = listas.length ? listas.join('') : '<p class="pendiente">Sin movimientos este día.</p>';
  return `<h2>${esc(titulo)}</h2>${cuerpo}`;
}

// ---------- Vista: el mes completo ----------

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function plantillaMes(estado) {
  const {
    mesActual, diaSeleccionado, hoy, reservas, contratos, flota,
    falloReservas, falloContratos, falloFlota,
  } = estado;

  const barra = barraFallo(falloReservas, falloContratos, falloFlota);
  const semanas = cuadriculaDelMes(mesActual);

  // Un solo cálculo por día (requisito del brief: la celda y el detalle
  // tienen que cuadrar porque vienen de la MISMA llamada), guardado aquí y
  // reusado tanto por las celdas como por el detalle de abajo.
  const movimientosPorDia = new Map();
  semanas.flat().forEach((fecha) => {
    if (fecha) movimientosPorDia.set(fecha, movimientosDelDia(fecha, { reservas, contratos }));
  });

  const celdas = semanas
    .map((semana) => semana.map((fecha) => celdaDia(fecha, hoy, diaSeleccionado, movimientosPorDia.get(fecha))).join(''))
    .join('');

  const detalle = diaSeleccionado && movimientosPorDia.has(diaSeleccionado)
    ? seccionDetalle(diaSeleccionado, movimientosPorDia.get(diaSeleccionado), flota, hoy)
    : '<p class="sc-nota">Haz clic en un día para ver el detalle.</p>';

  return `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <h1>Calendario</h1>
      </div>
      ${barra}
      <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin:4px 0 16px;">
        <button type="button" class="btn" data-accion="mes-anterior">‹ Mes anterior</button>
        <strong style="font-size:1.15em;min-width:180px;text-align:center;">${esc(tituloMes(mesActual))}</strong>
        <button type="button" class="btn" data-accion="mes-siguiente">Mes siguiente ›</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7, 1fr);gap:6px;margin-bottom:20px;">
        ${DIAS_SEMANA.map((d) => `<div style="text-align:center;font-weight:600;color:var(--gris);font-size:0.82em;padding-bottom:2px;">${d}</div>`).join('')}
        ${celdas}
      </div>
      <section class="carro-seccion">${detalle}</section>
    </div>`;
}

// ---------- Punto de entrada principal ----------

// Cuenta cuántas veces se ha llamado pintarCalendario, mismo patrón que
// flota.js/reservas.js: para que una sincronía que llega tarde sepa si su
// llamada sigue siendo la vigente antes de repintar.
let ultimoToken = 0;

/**
 * Dibuja la pantalla del calendario dentro de `contenedor`. `fecha` (opcional,
 * de la ruta '#/calendario/:fecha') abre el mes que la contiene con ese día
 * ya seleccionado — navegar de mes o elegir otro día después es puro estado
 * en memoria, no vuelve a tocar el hash (igual que el filtro de reservas.js).
 */
export async function pintarCalendario(contenedor, fecha) {
  const miToken = ++ultimoToken;
  const sigoVigente = () => location.hash.startsWith('#/calendario') && miToken === ultimoToken;

  const hoy = hoyISO();
  const fechaInicial = esFechaValida(fecha) ? fecha : null;

  let mesActual = mesDeFecha(fechaInicial) || mesDeFecha(hoy);
  let diaSeleccionado = fechaInicial;

  let reservas = [];
  let contratos = [];
  let flota = [];
  let falloReservas = false;
  let falloContratos = false;
  let falloFlota = false;

  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';

  function dibujar() {
    contenedor.innerHTML = plantillaMes({
      mesActual, diaSeleccionado, hoy, reservas, contratos, flota, falloReservas, falloContratos, falloFlota,
    });
  }

  const repintar = () => {
    if (!sigoVigente()) return;
    dibujar();
  };

  // Único manejador de clics, asignado una sola vez: `contenedor.onclick` es
  // una propiedad del contenedor, no de sus hijos, así que sobrevive a cada
  // `innerHTML` nuevo sin volver a cablearse (mismo motivo que flota.js).
  contenedor.onclick = (ev) => {
    if (ev.target.closest('[data-accion="mes-anterior"]')) {
      mesActual = mesAnterior(mesActual);
      diaSeleccionado = null; // el detalle abierto ya no pertenece al mes que se ve
      dibujar();
      return;
    }
    if (ev.target.closest('[data-accion="mes-siguiente"]')) {
      mesActual = mesSiguiente(mesActual);
      diaSeleccionado = null;
      dibujar();
      return;
    }
    const celda = ev.target.closest('[data-fecha]');
    if (celda?.dataset.fecha) {
      diaSeleccionado = celda.dataset.fecha;
      dibujar();
    }
  };

  repintar();

  const [rReservas, rFlota, rContratos] = await Promise.all([
    cargarReservas((r) => { reservas = r.datos; falloReservas = r.fallo; repintar(); }),
    cargarFlota((r) => { flota = r.datos; falloFlota = r.fallo; repintar(); }),
    cargarContratosAbiertos((r) => { contratos = r.datos; falloContratos = r.fallo; repintar(); }),
  ]);
  reservas = rReservas.datos; falloReservas = rReservas.fallo;
  flota = rFlota.datos; falloFlota = rFlota.fallo;
  contratos = rContratos.datos; falloContratos = rContratos.fallo;

  repintar();
}
