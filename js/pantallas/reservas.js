// Pantalla de reservaciones (§12b del diseño, "Reservaciones y calendario"):
// donde el dueño aparta un carro para alguien que llamó, cambia la unidad
// cuando el plan cambia a última hora, y cancela cuando el cliente no llega.
// La usa en el mostrador, muchas veces con el cliente enfrente por teléfono.
//
// Sigue la misma forma de trabajo que clientes.js (su hermana más cercana):
// una lista con su filtro, una ficha para ver/crear/editar un registro, y las
// mismas clases de CSS (carros-contenido, carro-formulario, tabla-carros,
// carro-seccion, carro-campos, sc-campos/sc-campo para el <select> que
// carro-campo no sabe vestir — mismo préstamo que ya hace contratos.js) para
// que esta pantalla se vea como parte del mismo sistema, sin hoja de estilos
// nueva. El buscador de cliente (sc-cliente-buscar/resultados) es el mismo
// que ya usa sacarCarro.js.
//
// Nada de esto reinventa una regla del negocio: construirReserva, estadoReserva,
// choquesDeReserva, faltaAlgoEnReserva y textoAnticipo vienen todas de
// nucleo/reserva.js — esta pantalla solo lee el formulario, arma el borrador
// con esas funciones, y pinta lo que contestan.
import {
  construirReserva, estadoReserva, choquesDeReserva, faltaAlgoEnReserva, textoAnticipo,
} from '../nucleo/reserva.js';
import { nombreCompleto } from '../nucleo/cliente.js';
import { hoyISO } from '../nucleo/fechas.js';
import {
  cargarReservas, cargarFlota, cargarContratosAbiertos, guardarReserva, cancelarReserva, buscarClientes,
} from '../datos.js';
import { fecha, aviso } from '../ui.js';

// El texto libre (nombre suelto por teléfono, nota, tipo de vehículo...) se
// escapa antes de entrar al HTML, igual que en clientes.js/carros.js/flota.js,
// para que un "&" o un "<" sueltos no rompan la pantalla.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value ?? '';
const texto = (id) => val(id).trim();

// ---------- Reglas puras: qué se ve y en qué orden ----------
//
// Separadas de todo lo que dibuja HTML para poder probarlas sin DOM, igual
// que en clientes.js (alertasDe, saldoPendienteDe...) y contratos.js
// (contratosVisibles, filtrarPorEstado...).

/**
 * Qué se apartó: el carro exacto (con su descripción si todavía está en la
 * flota, o solo las placas guardadas si ya no) o, si no hay carro exacto, el
 * tipo de vehículo. Nunca las dos cosas a la vez en el mismo renglón — es lo
 * que de verdad se cruza en `choquesDeReserva` (carroId manda sobre
 * tipoVehiculo cuando los dos existen).
 */
export function queSeAparto(reserva, flota) {
  if (reserva?.carroId) {
    const carro = (flota || []).find((c) => c.id === reserva.carroId);
    if (carro) return [carro.placas, carro.marca, carro.linea].filter(Boolean).join(' · ');
    return reserva.carroPlacas || 'Carro apartado';
  }
  if (reserva?.tipoVehiculo) return reserva.tipoVehiculo;
  return '—';
}

export const ETIQUETAS_ESTADO_RESERVA = { pendiente: 'Pendiente', entregada: 'Entregada', cancelada: 'Cancelada' };
const CLASE_ESTADO_RESERVA = { pendiente: 'es-rentado', entregada: 'es-fuera', cancelada: 'es-fuera' };

/**
 * Lo que de verdad se pinta en la lista, según el filtro.
 *
 * Regla del brief: "las pendientes primero, por fecha de salida ascendente —
 * lo próximo que pasa arriba. Las entregadas y canceladas detrás de un
 * filtro, no mezcladas." Por eso 'pendientes' es el filtro por defecto y el
 * único que se ve sin tocar nada; 'todas' sigue poniendo las pendientes
 * primero (ascendente) y el resto después (más reciente primero, como un
 * historial — mismo criterio que ordenarPorSalida en contratos.js), en vez de
 * mezclarlas por fecha sin distinguir cuáles ya se resolvieron.
 */
export function reservasVisibles(reservas, filtro = 'pendientes') {
  const todas = reservas || [];
  const pendientes = todas
    .filter((r) => estadoReserva(r) === 'pendiente')
    .sort((a, b) => String(a?.fechaSalida || '').localeCompare(String(b?.fechaSalida || '')));
  const resueltas = todas
    .filter((r) => estadoReserva(r) !== 'pendiente')
    .sort((a, b) => String(b?.fechaSalida || '').localeCompare(String(a?.fechaSalida || '')));

  if (filtro === 'entregadas') return resueltas.filter((r) => estadoReserva(r) === 'entregada');
  if (filtro === 'canceladas') return resueltas.filter((r) => estadoReserva(r) === 'cancelada');
  if (filtro === 'todas') return [...pendientes, ...resueltas];
  return pendientes;
}

/**
 * El mensaje del confirm() antes de cancelar (Paso 4 del brief): nombra al
 * cliente y la fecha, mismo patrón que textoConfirmarLiberar (flota.js) y
 * textoConfirmarAnular (contratos.js). Función pura para poder probarla sin
 * DOM ni confirm().
 */
export function textoConfirmarCancelar(reserva) {
  const cliente = reserva?.clienteNombre || 'este cliente';
  return `¿Cancelar la reservación de ${cliente} del ${fecha(reserva?.fechaSalida)}? `
    + 'Va a quedar marcada como cancelada, no desaparece de la lista.';
}

/** Las <option> del selector de carro exacto: vacío primero ("solo el tipo"), luego la flota ordenada por placas. */
export function opcionesCarro(flota, carroIdSeleccionado) {
  const ordenada = [...(flota || [])].sort(
    (a, b) => String(a?.placas || '').localeCompare(String(b?.placas || ''), 'es'),
  );
  const opciones = ordenada.map((c) => {
    const etiqueta = [c.placas, c.marca, c.linea].filter(Boolean).join(' · ')
      + (c.fueraDeServicio ? ' (fuera de servicio)' : '');
    const selected = c.id === carroIdSeleccionado ? ' selected' : '';
    return `<option value="${esc(c.id)}"${selected}>${esc(etiqueta)}</option>`;
  }).join('');
  return `<option value="">Solo el tipo, sin carro exacto</option>${opciones}`;
}

// Los choques rojos primero (brief, Paso 2): hoy choquesDeReserva solo
// produce nivel 'alto', pero se ordena de todos modos por si el núcleo agrega
// otro nivel más adelante — la misma idea que ya separa nivel-alto/nivel-medio
// en sc-avisos-lista (sacarCarro.js).
const ORDEN_NIVEL = { alto: 0, medio: 1 };
function ordenarChoques(choques) {
  return [...(choques || [])].sort((a, b) => (ORDEN_NIVEL[a?.nivel] ?? 2) - (ORDEN_NIVEL[b?.nivel] ?? 2));
}

/**
 * La barra roja de arriba cuando una lectura falló (mismo patrón que
 * flota.js: nunca se inventa una lista vacía o un mundo tranquilo a partir de
 * un fallo — el brief lo pide explícito: "una lectura fallida nunca se pinta
 * como 'no hay reservaciones'").
 */
function barraFallo(falloReservas, falloFlota, falloContratos) {
  const mensajes = [];
  if (falloReservas) mensajes.push('No se pudieron leer las reservaciones. Puede que falten o que la lista esté incompleta.');
  if (falloFlota) mensajes.push('No se pudo leer la flota. El carro o la capacidad del tipo pueden estar mal.');
  if (falloContratos) mensajes.push('No se pudieron leer los contratos. Los choques que ves pueden estar incompletos.');
  if (!mensajes.length) return '';
  return `<div class="barra-lectura-fallida">${mensajes.map((m) => `<p>${esc(m)}</p>`).join('')}</div>`;
}

// ---------- Vista: lista de reservaciones ----------

function filaReserva(r, flota) {
  const estado = estadoReserva(r);
  const clase = CLASE_ESTADO_RESERVA[estado] || '';
  const tachada = estado === 'cancelada' ? ' fila-anulada' : '';
  return `
    <tr class="${clase}${tachada}" data-id="${esc(r.id)}">
      <td><a href="#/reservas/${esc(r.id)}">${esc(r?.clienteNombre || 'Cliente sin nombre')}</a></td>
      <td>${esc(queSeAparto(r, flota))}</td>
      <td>${esc(fecha(r?.fechaSalida))} → ${esc(fecha(r?.devolucionPrevista))}</td>
      <td>${esc(textoAnticipo(r))}</td>
      <td><span class="etiqueta-estado">${esc(ETIQUETAS_ESTADO_RESERVA[estado] || estado)}</span></td>
    </tr>`;
}

function filasCuerpo(visibles, flota) {
  if (!visibles.length) return '<tr><td colspan="5" class="pendiente">Sin reservaciones que mostrar.</td></tr>';
  return visibles.map((r) => filaReserva(r, flota)).join('');
}

function dibujarLista(contenedor, reservas, flota, { falloReservas = false, falloFlota = false, falloContratos = false } = {}) {
  const barra = barraFallo(falloReservas, falloFlota, falloContratos);

  // Una lista vacía por un fallo de lectura no es lo mismo que "todavía no
  // hay reservaciones" (mismo cuidado que flota.js con CRÍTICO 2 de su
  // revisión): sin copia local y con la nube caída no se sabe si hay algo o
  // no, así que no se invita a "apartar la primera" como si el negocio
  // arrancara de cero.
  if (!reservas.length) {
    contenedor.innerHTML = `
      <div class="carros-contenido">
        ${barra}
        ${falloReservas
    ? '<p class="pendiente">No se pudieron leer las reservaciones. Intenta de nuevo o revisa la conexión.</p>'
    : '<p class="pendiente">Todavía no hay reservaciones.<br>'
      + '<a href="#/reservas/nueva" class="btn btn-primario">Apartar la primera</a></p>'}
      </div>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <h1>Reservaciones</h1>
        <a href="#/reservas/nueva" class="btn btn-primario">Nueva reservación</a>
      </div>
      ${barra}
      <div class="sc-campos" style="margin-bottom: 20px;">
        <label class="sc-campo">Mostrar
          <select id="rs-filtro">
            <option value="pendientes">Pendientes</option>
            <option value="todas">Todas</option>
            <option value="entregadas">Entregadas</option>
            <option value="canceladas">Canceladas</option>
          </select>
        </label>
      </div>
      <table class="tabla-carros">
        <thead>
          <tr><th>Cliente</th><th>Qué se apartó</th><th>Fechas</th><th>Anticipo</th><th>Estado</th></tr>
        </thead>
        <tbody id="rs-filas">${filasCuerpo(reservasVisibles(reservas, 'pendientes'), flota)}</tbody>
      </table>
    </div>`;

  function cablearFilas() {
    el('rs-filas').querySelectorAll('tr[data-id]').forEach((f) => {
      f.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'A') return; // Dejar pasar clicks en links
        location.hash = `#/reservas/${f.dataset.id}`;
      });
    });
  }
  cablearFilas();

  // El filtro solo redibuja el cuerpo de la tabla (como el buscador de
  // clientes.js): nunca vuelve a pedirle nada a la nube, ya está todo en
  // memoria.
  el('rs-filtro').addEventListener('change', () => {
    el('rs-filas').innerHTML = filasCuerpo(reservasVisibles(reservas, val('rs-filtro')), flota);
    cablearFilas();
  });
}

// ---------- Vista: la ficha (nueva o editar) ----------

function filaClienteResultado(c) {
  const nombre = nombreCompleto(c) || 'Sin nombre';
  const detalle = [c?.documento && `DPI ${c.documento}`, c?.telefono].filter(Boolean).join(' · ');
  return `<li data-id="${esc(c.id)}"><strong>${esc(nombre)}</strong>${detalle ? `<span>${esc(detalle)}</span>` : ''}</li>`;
}

function plantillaFicha(reserva, esNueva, estado, flota) {
  const titulo = esNueva ? 'Nueva reservación' : (reserva?.clienteNombre || 'Reservación');
  return `
    <div class="carros-contenido">
      <div class="carro-formulario">
        <div class="carros-encabezado">
          <h1>${esc(titulo)}</h1>
          ${!esNueva ? `<span class="etiqueta-estado">${esc(ETIQUETAS_ESTADO_RESERVA[estado] || estado)}</span>` : ''}
        </div>
        <form id="rs-form" novalidate>

          <section class="carro-seccion">
            <h2>Cliente</h2>
            <p class="sc-nota">
              Muchas reservaciones llegan por teléfono de alguien que todavía no es cliente: escribe su
              nombre y teléfono abajo, no hace falta darlo de alta. Si ya está registrado, búscalo aquí.
            </p>
            <div class="sc-cliente-buscar">
              <label class="carro-campo">Buscar cliente ya registrado (opcional)
                <input type="search" id="rs-cliente-buscar" placeholder="Escribe para buscar...">
              </label>
              <ul id="rs-cliente-resultados" class="sc-cliente-resultados" hidden></ul>
            </div>
            <p class="sc-nota" id="rs-cliente-vinculo" hidden>
              Vinculado a un cliente registrado.
              <button type="button" id="rs-cliente-quitar" class="btn">Quitar vínculo</button>
            </p>
            <div class="carro-campos">
              <label class="carro-campo">Nombre del cliente
                <input type="text" id="rs-cliente-nombre" value="${esc(reserva?.clienteNombre || '')}">
              </label>
              <label class="carro-campo">Teléfono
                <input type="tel" id="rs-cliente-telefono" value="${esc(reserva?.telefono || '')}">
              </label>
            </div>
          </section>

          <section class="carro-seccion">
            <h2>Fechas</h2>
            <div class="carro-campos">
              <label class="carro-campo">Fecha de salida
                <input type="date" id="rs-fecha-salida" value="${esc(reserva?.fechaSalida || hoyISO())}">
              </label>
              <label class="carro-campo">Días
                <input type="number" id="rs-dias" min="1" step="1" value="${esc(reserva?.dias ?? '')}">
              </label>
            </div>
            <p class="sc-nota">Devolución prevista: <strong id="rs-devolucion-prevista">—</strong></p>
          </section>

          <section class="carro-seccion">
            <h2>Vehículo</h2>
            <p class="sc-nota">
              Un tipo sin carro exacto ("un microbús") es una reservación completa. Cambiar la unidad más
              adelante es solo volver a elegir aquí — el aviso de abajo se recalcula al instante.
            </p>
            <div class="sc-campos">
              <label class="sc-campo">Tipo de vehículo
                <input type="text" id="rs-tipo" value="${esc(reserva?.tipoVehiculo || '')}" placeholder="Ej. MICROBÚS">
              </label>
              <label class="sc-campo">Carro exacto (opcional)
                <select id="rs-carro">${opcionesCarro(flota, reserva?.carroId)}</select>
              </label>
            </div>
          </section>

          <section class="carro-seccion">
            <h2>Precio y anticipo</h2>
            <div class="carro-campos">
              <label class="carro-campo">Precio por día
                <input type="number" id="rs-precio-dia" step="0.01" min="0" value="${esc(reserva?.precioDia ?? '')}">
              </label>
              <label class="carro-campo">Anticipo
                <input type="number" id="rs-anticipo" step="0.01" min="0" value="${esc(reserva?.anticipo ?? '')}">
              </label>
            </div>
            <label class="sc-checkbox">
              <input type="checkbox" id="rs-anticipo-pagado" ${reserva?.anticipoPagado ? 'checked' : ''}> Ya pagó el anticipo
            </label>
            <p class="sc-nota" id="rs-anticipo-texto"></p>
          </section>

          <section class="carro-seccion">
            <h2>Nota</h2>
            <label class="carro-campo">
              <textarea id="rs-nota" rows="3" placeholder="Cualquier detalle que el dueño deba recordar">${esc(reserva?.nota || '')}</textarea>
            </label>
          </section>

          <ul id="rs-avisos" class="sc-avisos-lista"></ul>

          <div class="carro-botones">
            <button type="button" id="rs-volver" class="btn">Cancelar</button>
            ${!esNueva && estado === 'pendiente' ? '<button type="button" id="rs-cancelar" class="btn">Cancelar reservación</button>' : ''}
            <button type="submit" id="rs-guardar" class="btn btn-primario">Guardar reservación</button>
          </div>
        </form>
      </div>
    </div>`;
}

async function dibujarFicha(contenedor, reservaId, { reservas, flota, contratos }, sigoVigente) {
  const esNueva = reservaId === 'nueva';
  let reserva = null;

  if (!esNueva) {
    reserva = reservas.find((r) => r.id === reservaId);
    if (!reserva) {
      contenedor.innerHTML = '<p class="pendiente">No se encontró esta reservación.</p>';
      return;
    }
  }

  const estado = reserva ? estadoReserva(reserva) : 'pendiente';
  let clienteIdElegido = reserva?.clienteId || null;
  let ultimosResultados = [];

  contenedor.innerHTML = plantillaFicha(reserva, esNueva, estado, flota);

  function leerFormulario() {
    const carroId = val('rs-carro') || null;
    const carro = carroId ? flota.find((c) => c.id === carroId) : null;
    return {
      clienteId: clienteIdElegido,
      clienteNombre: texto('rs-cliente-nombre'),
      telefono: texto('rs-cliente-telefono'),
      fechaSalida: texto('rs-fecha-salida') || hoyISO(),
      dias: val('rs-dias'),
      carroId,
      carroPlacas: carro?.placas || '',
      tipoVehiculo: texto('rs-tipo'),
      precioDia: val('rs-precio-dia'),
      anticipo: val('rs-anticipo'),
      anticipoPagado: Boolean(el('rs-anticipo-pagado')?.checked),
      nota: texto('rs-nota'),
    };
  }

  /**
   * Arma el borrador con construirReserva (nunca a mano) y recalcula los
   * choques al instante (Paso 3 del brief: cambiar la unidad, o cualquier
   * otro campo, recalcula sin esperar a guardar). Devuelve el borrador para
   * que guardar() reutilice exactamente lo mismo que ya se le mostró al dueño.
   */
  function recalcular() {
    const borrador = construirReserva(reserva || {}, leerFormulario());
    el('rs-devolucion-prevista').textContent = borrador.devolucionPrevista ? fecha(borrador.devolucionPrevista) : '—';
    el('rs-anticipo-texto').textContent = textoAnticipo(borrador);

    const choques = choquesDeReserva({
      reserva: borrador, flota, reservas, contratos,
    });
    // Los rojos primero (brief, Paso 2); los choques nunca bloquean — el
    // botón de guardar sigue habilitado pase lo que pase aquí.
    el('rs-avisos').innerHTML = ordenarChoques(choques)
      .map((c) => `<li class="nivel-${esc(c.nivel)}">${esc(c.mensaje)}</li>`).join('');

    return borrador;
  }

  function elegirCliente(c) {
    clienteIdElegido = c.id;
    el('rs-cliente-buscar').value = '';
    el('rs-cliente-resultados').hidden = true;
    el('rs-cliente-nombre').value = nombreCompleto(c) || '';
    el('rs-cliente-telefono').value = c?.telefono || '';
    el('rs-cliente-vinculo').hidden = false;
    recalcular();
  }

  async function buscarYMostrarClientes(consulta) {
    if (!consulta.trim()) { el('rs-cliente-resultados').hidden = true; return; }
    const resultados = await buscarClientes(consulta);
    // Se llegó a escribir otra cosa mientras la búsqueda contestaba, o se
    // salió de esta pantalla: esta respuesta ya no sirve.
    if (!sigoVigente() || el('rs-cliente-buscar').value.trim() !== consulta.trim()) return;
    ultimosResultados = resultados;
    const lista = el('rs-cliente-resultados');
    lista.innerHTML = resultados.length
      ? resultados.slice(0, 8).map(filaClienteResultado).join('')
      : '<li class="sc-vacio">Sin resultados. Escribe el nombre y teléfono abajo, no hace falta darlo de alta.</li>';
    lista.hidden = false;
  }

  async function guardar(ev) {
    ev.preventDefault();
    const borrador = recalcular();
    const falta = faltaAlgoEnReserva(borrador);
    if (falta.length) {
      aviso(`Falta completar: ${falta.join(', ')}.`, 'error');
      return;
    }

    const boton = el('rs-guardar');
    boton.disabled = true;
    try {
      // guardarReserva (datos.js) sella id/actualizado/estado — nunca se
      // escriben a mano aquí (§7b del diseño: devolucionPrevista y estado se
      // derivan, no se autorizan a mano).
      const guardada = await guardarReserva(borrador);
      aviso(`Reservación de ${guardada.clienteNombre || 'cliente'} guardada.`, 'exito');
      location.hash = '#/reservas';
    } catch (error) {
      aviso('No se pudo guardar la reservación. Intenta de nuevo.', 'error');
      console.error(error);
    } finally {
      boton.disabled = false;
    }
  }

  async function cancelarDesdeFicha() {
    if (!reserva || !window.confirm(textoConfirmarCancelar(reserva))) return;
    const boton = el('rs-cancelar');
    boton.disabled = true;
    try {
      await cancelarReserva(reserva);
      aviso('Reservación cancelada.', 'exito');
      location.hash = '#/reservas';
    } catch (error) {
      aviso('No se pudo cancelar la reservación. Intenta de nuevo.', 'error');
      console.error(error);
      boton.disabled = false;
    }
  }

  el('rs-form').addEventListener('input', () => recalcular());
  el('rs-form').addEventListener('change', () => recalcular());
  el('rs-form').addEventListener('submit', guardar);
  el('rs-cliente-buscar').addEventListener('input', (ev) => buscarYMostrarClientes(ev.target.value));
  el('rs-cliente-resultados').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    const c = ultimosResultados.find((r) => r.id === li.dataset.id);
    if (c) elegirCliente(c);
  });
  el('rs-cliente-quitar')?.addEventListener('click', () => {
    clienteIdElegido = null;
    el('rs-cliente-vinculo').hidden = true;
  });
  el('rs-volver').addEventListener('click', () => { location.hash = '#/reservas'; });
  el('rs-cancelar')?.addEventListener('click', cancelarDesdeFicha);

  if (!esNueva && clienteIdElegido) el('rs-cliente-vinculo').hidden = false;
  recalcular();
}

// ---------- Punto de entrada principal ----------

let ultimoToken = 0;

/** Dibuja la pantalla de reservaciones dentro de `contenedor`: la lista o la ficha de `reservaId`. */
export async function pintarReservas(contenedor, reservaId) {
  const miToken = ++ultimoToken;
  const hash = location.hash;
  const sigoVigente = () => location.hash.startsWith('#/reservas') && miToken === ultimoToken;

  contenedor.innerHTML = '<p class="pendiente">Cargando…</p>';

  let reservas = [];
  let flota = [];
  let contratos = [];
  let falloReservas = false;
  let falloFlota = false;
  let falloContratos = false;

  const repintar = () => {
    if (!sigoVigente()) return;
    // Igual que clientes.js: solo la lista se redibuja sola cuando llega algo
    // nuevo por detrás. Una ficha abierta a medio llenar no se pisa con un
    // repintado de fondo.
    if (hash === '#/reservas') {
      dibujarLista(contenedor, reservas, flota, { falloReservas, falloFlota, falloContratos });
    }
  };

  // cargarReservas/cargarFlota/cargarContratosAbiertos (datos.js) devuelven
  // { datos, fallo } (resultadoLectura): un fallo de nube nunca se pinta como
  // "no hay reservaciones" (T9, y el hallazgo que ya le costó una vuelta de
  // revisión a flota.js) — `datos` cae a la copia local en vez de a un
  // arreglo vacío inventado, y `fallo` es lo que decide qué avisa barraFallo.
  const [rReservas, rFlota, rContratos] = await Promise.all([
    cargarReservas((r) => { reservas = r.datos; falloReservas = r.fallo; repintar(); }),
    cargarFlota((r) => { flota = r.datos; falloFlota = r.fallo; repintar(); }),
    cargarContratosAbiertos((r) => { contratos = r.datos; falloContratos = r.fallo; repintar(); }),
  ]);
  reservas = rReservas.datos; falloReservas = rReservas.fallo;
  flota = rFlota.datos; falloFlota = rFlota.fallo;
  contratos = rContratos.datos; falloContratos = rContratos.fallo;

  if (!sigoVigente()) return;

  if (hash === '#/reservas') {
    dibujarLista(contenedor, reservas, flota, { falloReservas, falloFlota, falloContratos });
  } else if (reservaId) {
    await dibujarFicha(contenedor, reservaId, { reservas, flota, contratos }, sigoVigente);
  }
}
