// Pantalla de carros: la flota propia del dueño. Aquí es donde se agregan,
// editan y marcan fuera de servicio los carros de la empresa. Los carros
// subarrendados (ajenos) viven dentro de sus contratos y no aparecen aquí.
//
// Esta pantalla maneja cuatro vistas:
// - #/carros: lista de todos los carros
// - #/carros/nuevo: formulario para agregar un carro nuevo
// - #/carros/:id: formulario para editar un carro existente
// - #/habilitar/:id: marcar un carro como disponible de nuevo
import { estadoCarro } from '../nucleo/estados.js';
import { hoyISO } from '../nucleo/fechas.js';
import { cargarFlota, cargarContratosAbiertos, guardarVehiculo } from '../datos.js';
import { aviso } from '../ui.js';

/**
 * Construye el objeto vehículo para guardar, preservando campos que no vienen
 * del formulario (como fueraDeServicio). La copia local en IndexedDB se reemplaza
 * entera, así que lo que no se copia aquí desaparece de la pantalla aunque
 * siga en la nube — por eso es crítico hacer un merge.
 */
export function construirVehiculo(carroExistente, campos) {
  return {
    // Preservar el carro existente (si hay), luego sobreescribir con campos nuevos
    ...carroExistente,
    ...campos,
    // Garantizar que propiedad sea siempre 'Propio' en esta pantalla
    propiedad: 'Propio',
  };
}

// El texto libre que escribe el usuario se escapa antes de entrar al HTML
// para que un "&" o un "<" sueltos no rompan la pantalla.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Estados visuales del carro en la lista
const ESTADOS = {
  disponible: { clase: 'es-disponible', etiqueta: 'Disponible' },
  rentado: { clase: 'es-rentado', etiqueta: 'Rentado' },
  atrasado: { clase: 'es-atrasado', etiqueta: 'Atrasado' },
  'fuera de servicio': { clase: 'es-fuera', etiqueta: 'Fuera de servicio' },
};

const el = (id) => document.getElementById(id);
const val = (id) => el(id)?.value ?? '';
const texto = (id) => val(id).trim();

// ---------- Vista: lista de carros ----------

function filaCarro(carro, info) {
  const { estado, motivo, fueraDeServicio } = info;
  const cfg = ESTADOS[estado];

  // Escapar campos de texto libre
  const placas = esc(carro?.placas || '');
  const tipo = esc(carro?.tipo || '');
  const marca = esc(carro?.marca || '');
  const linea = esc(carro?.linea || '');
  const color = esc(carro?.color || '');
  const modelo = esc(carro?.modelo || '');
  const propiedad = esc(carro?.propiedad || 'Propio');
  const dueno = esc(carro?.dueno || '');

  return `
    <tr class="${cfg.clase}" data-id="${esc(carro.id)}">
      <td><strong>${carro?.codigo || '—'}</strong></td>
      <td><a href="#/carros/${esc(carro.id)}">${placas}</a></td>
      <td>${tipo}</td>
      <td>${marca} ${linea}</td>
      <td>${color}</td>
      <td>${modelo}</td>
      <td>${propiedad}${dueno ? ` (${dueno})` : ''}</td>
      <td>
        <span class="etiqueta-estado">${cfg.etiqueta}</span>
        ${fueraDeServicio ? `<span class="etiqueta-fuera">${esc(motivo || 'Sin motivo')}</span>` : ''}
      </td>
    </tr>`;
}

function dibujarLista(contenedor, flota, contratos, hoy) {
  if (!flota.length) {
    contenedor.innerHTML = `
      <div class="carros-contenido">
        <p class="pendiente">Todavía no hay carros en la flota.<br>
        <a href="#/carros/nuevo" class="btn btn-primario">Agregar el primer carro</a></p>
      </div>`;
    return;
  }

  const filas = flota
    .map((carro) => filaCarro(carro, estadoCarro(carro, contratos, hoy)))
    .join('');

  contenedor.innerHTML = `
    <div class="carros-contenido">
      <div class="carros-encabezado">
        <h1>Flota de carros</h1>
        <a href="#/carros/nuevo" class="btn btn-primario">Agregar carro</a>
      </div>
      <table class="tabla-carros">
        <thead>
          <tr>
            <th>Código</th>
            <th>Placas</th>
            <th>Tipo</th>
            <th>Marca y línea</th>
            <th>Color</th>
            <th>Modelo</th>
            <th>Propiedad</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>
    </div>`;

  // Click en una fila para editar
  contenedor.querySelectorAll('tbody tr').forEach((fila) => {
    fila.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'A') return; // Dejar pasar clicks en links
      const id = fila.dataset.id;
      if (id) location.hash = `#/carros/${id}`;
    });
  });
}

// ---------- Vista: formulario nuevo/editar ----------

function formularioHTML() {
  return `
    <form id="frm-carro" class="carro-forma" novalidate>
      <div class="carro-contenido">
        <div class="carro-formulario">
          <h1 id="frm-titulo">Nuevo carro</h1>

          <section class="carro-seccion">
            <h2>Datos del carro</h2>
            <div class="carro-campos">
              <label class="carro-campo">Código (se asigna automáticamente)
                <input type="text" id="frm-codigo" disabled readonly>
              </label>
              <label class="carro-campo">Placas
                <input type="text" id="frm-placas" required>
              </label>
              <label class="carro-campo">Tipo de vehículo
                <input type="text" id="frm-tipo">
              </label>
              <label class="carro-campo">Marca
                <input type="text" id="frm-marca">
              </label>
              <label class="carro-campo">Línea
                <input type="text" id="frm-linea">
              </label>
              <label class="carro-campo">Color
                <input type="text" id="frm-color">
              </label>
              <label class="carro-campo">Modelo (año)
                <input type="text" id="frm-modelo">
              </label>
            </div>
          </section>

          <section class="carro-seccion" id="frm-motivo-seccion" style="display: none;">
            <h2>Fuera de servicio</h2>
            <div class="carro-campos">
              <label class="carro-campo">Motivo
                <input type="text" id="frm-motivo-display" disabled readonly>
              </label>
            </div>
          </section>

          <div class="carro-botones">
            <button type="button" id="frm-volver" class="btn">Cancelar</button>
            <button type="submit" id="frm-guardar" class="btn btn-primario">Guardar carro</button>
            <button type="button" id="frm-fuera" class="btn" style="display: none;">Marcar fuera de servicio</button>
            <button type="button" id="frm-habilitar" class="btn" style="display: none;">Volver a habilitar</button>
          </div>
        </div>
      </div>
    </form>`;
}

async function dibujarFormulario(contenedor, carroId, flota, contratos, hoy) {
  const esNuevo = carroId === 'nuevo';
  let carro = null;

  if (!esNuevo) {
    carro = flota.find((c) => c.id === carroId);
    if (!carro) {
      contenedor.innerHTML = '<p class="pendiente">No se encontró este carro.</p>';
      return;
    }
  }

  contenedor.innerHTML = formularioHTML();

  // Setear valores iniciales
  if (carro) {
    el('frm-titulo').textContent = 'Editar carro';
    el('frm-codigo').value = carro.codigo || '';
    el('frm-placas').value = carro.placas || '';
    el('frm-tipo').value = carro.tipo || '';
    el('frm-marca').value = carro.marca || '';
    el('frm-linea').value = carro.linea || '';
    el('frm-color').value = carro.color || '';
    el('frm-modelo').value = carro.modelo || '';

    // Mostrar motivo si está fuera de servicio
    if (carro.fueraDeServicio) {
      el('frm-motivo-seccion').style.display = 'block';
      el('frm-motivo-display').value = carro.motivoFueraDeServicio || 'Sin motivo registrado';
    }

    // Mostrar botones de fuera de servicio
    const info = estadoCarro(carro, contratos, hoy);
    const btnFuera = el('frm-fuera');
    const btnHabilitar = el('frm-habilitar');

    if (info.fueraDeServicio) {
      btnHabilitar.style.display = 'inline-block';
    } else {
      btnFuera.style.display = 'inline-block';
    }
  }

  // Validar y guardar
  async function guardar(ev) {
    ev.preventDefault();

    const placas = texto('frm-placas');
    if (!placas) {
      aviso('Las placas son obligatorias.', 'error');
      return;
    }

    el('frm-guardar').disabled = true;
    try {
      // Leer campos del formulario
      const campos = {
        id: carro?.id,
        codigo: carro?.codigo,
        placas,
        tipo: texto('frm-tipo'),
        marca: texto('frm-marca'),
        linea: texto('frm-linea'),
        color: texto('frm-color'),
        modelo: texto('frm-modelo'),
      };

      // Usar construirVehiculo para preservar campos del servidor
      // (fueraDeServicio, motivoFueraDeServicio, etc.)
      const vehiculo = construirVehiculo(carro || {}, campos);

      // guardarVehiculo() (datos.js) es quien de verdad asigna el código a un
      // carro nuevo (vehiculo.codigo sale vacío hasta ese momento) — por eso
      // el aviso usa lo que devuelve guardarVehiculo, no el objeto que se le
      // mandó. Antes se usaba `vehiculo.codigo`, y el primer carro que el
      // dueño daba de alta se guardaba bien pero el aviso decía "Carro
      // undefined guardado" (hallazgo importante de la revisión final).
      const guardado = await guardarVehiculo(vehiculo);
      aviso(`Carro ${guardado.codigo} guardado.`, 'exito');
      location.hash = '#/carros';
    } catch (error) {
      aviso('No se pudo guardar el carro. Intenta de nuevo.', 'error');
      console.error(error);
    } finally {
      el('frm-guardar').disabled = false;
    }
  }

  async function marcarFueraDeServicio() {
    const motivo = prompt('¿Por qué está fuera de servicio? (taller, golpe, revisión, etc.)');
    if (motivo === null) return; // Canceló

    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      aviso('Escribe un motivo para marcar el carro fuera de servicio.', 'error');
      return;
    }

    el('frm-fuera').disabled = true;
    try {
      const actualizado = {
        id: carro.id,
        ...carro,
        fueraDeServicio: true,
        motivoFueraDeServicio: motivoTrim,
      };
      await guardarVehiculo(actualizado);
      aviso('Carro marcado fuera de servicio.', 'exito');
      location.hash = '#/carros';
    } catch (error) {
      aviso('No se pudo marcar el carro. Intenta de nuevo.', 'error');
      console.error(error);
    } finally {
      el('frm-fuera').disabled = false;
    }
  }

  async function habilitar() {
    el('frm-habilitar').disabled = true;
    try {
      const actualizado = {
        id: carro.id,
        ...carro,
        fueraDeServicio: false,
        motivoFueraDeServicio: '',
      };
      await guardarVehiculo(actualizado);
      aviso('Carro habilitado de nuevo.', 'exito');
      location.hash = '#/carros';
    } catch (error) {
      aviso('No se pudo habilitar el carro. Intenta de nuevo.', 'error');
      console.error(error);
    } finally {
      el('frm-habilitar').disabled = false;
    }
  }

  // Eventos
  el('frm-carro').addEventListener('submit', guardar);
  el('frm-volver').addEventListener('click', () => {
    location.hash = '#/carros';
  });
  el('frm-fuera').addEventListener('click', marcarFueraDeServicio);
  el('frm-habilitar').addEventListener('click', habilitar);
}

// ---------- Vista: habilitar desde la flota ----------

async function habilitarDesdeFlota(contenedor, carroId) {
  try {
    // cargarFlota/cargarContratosAbiertos devuelven { datos, fallo } (T9,
    // CRÍTICO 2 de la revisión final) — aquí solo se necesitan los datos: si
    // la lectura falló, `find` simplemente no encuentra el carro y cae en el
    // mismo aviso de error de abajo.
    const [rFlota] = await Promise.all([
      cargarFlota(),
      cargarContratosAbiertos(),
    ]);
    const flota = rFlota.datos;

    const carro = flota.find((c) => c.id === carroId);
    if (!carro) {
      aviso('No se encontró este carro.', 'error');
      location.hash = '#/carros';
      return;
    }

    // Habilitar
    const actualizado = {
      id: carro.id,
      ...carro,
      fueraDeServicio: false,
      motivoFueraDeServicio: '',
    };
    await guardarVehiculo(actualizado);
    aviso('Carro habilitado.', 'exito');
    location.hash = '#/carros';
  } catch (error) {
    aviso('No se pudo habilitar el carro. Intenta de nuevo.', 'error');
    console.error(error);
    location.hash = '#/carros';
  }
}

// ---------- Punto de entrada principal ----------

let ultimoToken = 0;

/** Dibuja la pantalla de carros dentro de `contenedor`, manejando todas las vistas. */
export async function pintarCarros(contenedor, carroId) {
  const miToken = ++ultimoToken;
  const hash = location.hash;
  const sigoVigente = () => (location.hash.startsWith('#/carros') || location.hash.startsWith('#/habilitar')) && miToken === ultimoToken;

  // Si es habilitar desde la flota, manejarlo directamente
  if (hash.startsWith('#/habilitar/')) {
    await habilitarDesdeFlota(contenedor, carroId);
    return;
  }

  // Cargar datos
  let flota = [];
  let contratos = [];
  // hoyISO() (nucleo/fechas.js), no new Date().toISOString(): esta última da
  // el día en UTC, y Guatemala va seis horas atrás — de seis de la tarde en
  // adelante un carro que regresa hoy salía "Rentado" en la flota y
  // "Atrasado" aquí, un día antes de tiempo (hallazgo importante de la
  // revisión final, el mismo bug que ya se había corregido en fechas.js).
  const hoy = hoyISO();

  const repintar = () => {
    if (!sigoVigente()) return;
    if (hash === '#/carros') {
      dibujarLista(contenedor, flota, contratos, hoy);
    }
  };

  // cargarFlota/cargarContratosAbiertos devuelven { datos, fallo } (T9,
  // CRÍTICO 2 de la revisión final); esta pantalla todavía no tiene una barra
  // de error como la de flota.js, así que por ahora solo toma `datos` — un
  // fallo aquí se ve como "sigue como estaba", nunca como "se vació la
  // flota", porque `datos` cae a la copia local en vez de a un arreglo vacío
  // inventado.
  const [rFlota, rContratos] = await Promise.all([
    cargarFlota((r) => { flota = r.datos; repintar(); }),
    cargarContratosAbiertos((r) => { contratos = r.datos; repintar(); }),
  ]);
  flota = rFlota.datos;
  contratos = rContratos.datos;

  if (!sigoVigente()) return;

  // Decidir qué vista dibujar
  if (hash === '#/carros') {
    dibujarLista(contenedor, flota, contratos, hoy);
  } else if (carroId) {
    // Es #/carros/nuevo o #/carros/:id
    await dibujarFormulario(contenedor, carroId, flota, contratos, hoy);
  }
}
