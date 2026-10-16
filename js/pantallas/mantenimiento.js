// El bloque de mantenimiento de la ficha de un carro propio (§12b del diseño): cuándo se hizo cada servicio, a qué
// kilometraje, cuánto falta para el siguiente, y el formulario para registrar uno. Vive DENTRO de la ficha
// (`#/carros/:carroId`, pantallas/carros.js): no tiene ruta ni entrada de menú.
//
// Esta pantalla solo dibuja. Si toca o no toca un servicio, cuánto falta, en cuántos kilómetros anda el carro, qué cuenta
// y qué no: todo eso lo contesta nucleo/mantenimiento.js, y nada de aquí lo vuelve a calcular (hay una prueba que lo vigila:
// no se lee ningún kilometraje de un contrato, no se hace ninguna cuenta de fechas, no se compara contra ningún intervalo).
//
// Dos reglas de dibujo que vienen de errores que este proyecto ya pagó:
// - Un dato que NO se sabe se dice así —«no se sabe», «sin registro»—, nunca como un cero ni como un «al día». Y una
//   lectura que falló (la flota o los contratos) lo dice arriba, en la barra roja de siempre: «no se pudo leer» no es
//   «no hay», y la buena noticia que nadie audita es la peor.
// - Los kilómetros son enteros: `textoEntero`, nunca `textoDosDecimales`.
import {
  SERVICIOS, estadoDeMantenimiento, textoDelKilometraje, kilometrajeDelCarro, historialDeServicios, intervaloDe,
  construirServicio, revisarIntervalo,
} from '../nucleo/mantenimiento.js';
import { textoEntero } from '../nucleo/dinero.js';
import {
  registrarServicioDelCarro, anularServicioDelCarro, cambiarIntervaloDelCarro, altaConIdFijo, nuevoIdServicio,
  CODIGO_DOCUMENTO_NO_ESTA,
} from '../datos.js';
import { fecha, aviso } from '../ui.js';

// Lo que viene de datos guardados (el nombre de un servicio, un id) entra escapado, igual que en las demás pantallas.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Las frases en rojo de arriba del bloque cuando una lectura falló. Función pura. */
export function mensajesDeFalloDeMantenimiento({ falloFlota = false, falloContratos = false } = {}) {
  const mensajes = [];
  if (falloFlota) {
    mensajes.push('No se pudo leer la flota: los servicios de este carro pueden estar atrasados.');
  }
  if (falloContratos) {
    mensajes.push('No se pudieron leer los contratos: el kilometraje del carro puede estar atrasado o faltar.');
  }
  return mensajes;
}

const kmDeUnServicio = (km) => (km ? `a los ${textoEntero(km)} km` : 'sin kilometraje');

function celdaUltimo(ultimo) {
  if (!ultimo) return '<span class="mant-nada">—</span>';
  return `${esc(fecha(ultimo.fecha))}<span class="mant-intervalo">${esc(kmDeUnServicio(ultimo.km))}</span>`;
}

function celdaFalta(s) {
  if (!s.ultimo) return `<p class="mant-lado">${esc(s.texto)}</p>`;
  const lado = (nombre, parte) => (parte.texto
    ? `<p class="mant-lado mant-lado-${parte.estado}"><strong>${nombre}:</strong> ${esc(parte.texto)}</p>`
    : '');
  return lado('Kilómetros', s.km) + lado('Tiempo', s.tiempo);
}

function filaDeServicio(s) {
  const cada = `cada ${textoEntero(s.intervalo.km)} km o ${s.intervalo.meses} ${s.intervalo.meses === 1 ? 'mes' : 'meses'}`;
  return `
    <tr class="mant-fila mant-fila-${s.estado}" data-tipo="${esc(s.tipo)}">
      <td><strong>${esc(s.nombre)}</strong><span class="mant-intervalo">${esc(cada)}${s.intervalo.propio ? ' (de este carro)' : ''}</span></td>
      <td>${celdaUltimo(s.ultimo)}</td>
      <td>${celdaFalta(s)}</td>
      <td><span class="mant-etiqueta mant-etiqueta-${s.estado}">${esc(s.etiqueta)}</span></td>
    </tr>`;
}

function itemDelHistorial(h) {
  const quien = esc(h.nombre);
  const cuando = h.fecha ? esc(fecha(h.fecha)) || esc(h.fecha) : 'sin fecha';
  const nota = h.cuenta
    ? ''
    : `<span class="mant-hist-nota">${esc(h.razon)}${h.anulado && h.anuladoEn ? ` el ${esc(fecha(h.anuladoEn))}` : ''}</span>`;
  const boton = h.cuenta && h.id
    ? `<button type="button" class="btn mant-anular" data-anular="${esc(h.id)}">Anular</button>`
    : '';
  return `
    <li class="mant-hist-item${h.cuenta ? '' : ' mant-hist-no-cuenta'}">
      <span class="mant-hist-fecha">${cuando}</span>
      <strong>${quien}</strong>
      <span class="mant-hist-km">${esc(kmDeUnServicio(h.km))}</span>
      ${nota}${boton}
    </li>`;
}

/**
 * Lo que se vuelve a dibujar cuando algo cambia: la barra de lectura fallida, en cuántos kilómetros anda el carro, la
 * tabla de los seis servicios y el historial. Todo sale del núcleo; el formulario y los intervalos se dibujan aparte para no
 * borrar lo que se está escribiendo. Se exporta para probarlo sin DOM.
 */
export function htmlEstadoDeMantenimiento({
  carro, contratos, hoy, falloFlota = false, falloContratos = false,
}) {
  const kilometraje = kilometrajeDelCarro(carro?.id, contratos);
  const estado = estadoDeMantenimiento({
    carro, kilometraje, hoy, falloFlota, falloContratos,
  });
  const fallos = mensajesDeFalloDeMantenimiento({ falloFlota, falloContratos });
  const barra = fallos.length
    ? `<div class="barra-lectura-fallida">${fallos.map((m) => `<p>${esc(m)}</p>`).join('')}</div>`
    : '';
  const historial = historialDeServicios(carro?.servicios, hoy);
  const vacio = falloFlota
    ? 'No se pudo leer el historial de servicios de este carro.'
    : 'Todavía no se ha registrado ningún servicio.';
  return `
    ${barra}
    <p class="mant-km${estado.kilometraje ? '' : ' mant-km-desconocido'}">${esc(textoDelKilometraje(estado.kilometraje, { falloContratos }))}</p>
    <table class="mant-tabla">
      <thead>
        <tr><th>Servicio</th><th>Último</th><th>Lo que falta</th><th>Estado</th></tr>
      </thead>
      <tbody>${estado.servicios.map(filaDeServicio).join('')}</tbody>
    </table>
    <h3>Historial</h3>
    ${historial.length
    ? `<ul class="mant-historial">${historial.map(itemDelHistorial).join('')}</ul>`
    : `<p class="mant-nada">${esc(vacio)}</p>`}`;
}

/** El formulario de «Registrar un servicio». `propuesta` es el último kilometraje que se sabe del carro, o `null`. */
export function htmlFormularioDeServicio({ hoy, propuesta = null }) {
  const ayuda = propuesta
    ? `Propuesto: ${textoEntero(propuesta)} km, lo último que se sabe de este carro. Corrígelo si el odómetro marca otra cosa.`
    : 'No se sabe en cuántos kilómetros anda este carro. Escribe el del odómetro, o déjalo vacío si no lo sabes: '
      + 'entonces ese servicio solo cuenta por fecha.';
  return `
    <form id="mant-form" class="mant-form" novalidate>
      <h3>Registrar un servicio</h3>
      <div class="mant-campos">
        <label class="carro-campo">Servicio
          <select id="mant-tipo">${SERVICIOS.map((s) => `<option value="${esc(s.tipo)}">${esc(s.nombre)}</option>`).join('')}</select>
        </label>
        <label class="carro-campo">Fecha en que se hizo
          <input type="date" id="mant-fecha" value="${esc(hoy)}">
        </label>
        <label class="carro-campo">Kilometraje del carro ese día
          <input type="number" id="mant-km" min="1" step="1" inputmode="numeric" value="${propuesta ? esc(propuesta) : ''}">
        </label>
      </div>
      <p class="mant-ayuda">${esc(ayuda)}</p>
      <p class="mant-problemas" id="mant-problemas" role="alert" hidden></p>
      <button type="submit" class="btn btn-primario" id="mant-registrar">Registrar servicio</button>
    </form>`;
}

/** Los intervalos de este carro, uno por servicio, con el de siempre y por qué. */
export function htmlIntervalos({ carro }) {
  const filas = SERVICIOS.map((s) => {
    const rige = intervaloDe(carro, s.tipo);
    const deSiempre = `${textoEntero(s.km)} km o ${s.meses} ${s.meses === 1 ? 'mes' : 'meses'}`;
    return `
      <div class="mant-intervalo-fila" data-tipo="${esc(s.tipo)}">
        <strong class="mant-intervalo-nombre">${esc(s.nombre)}</strong>
        <label>Cada <input type="number" min="1" step="1" inputmode="numeric" data-km value="${esc(rige.km)}" aria-label="Kilómetros de ${esc(s.nombre)}"> km</label>
        <label>o cada <input type="number" min="1" step="1" inputmode="numeric" data-meses value="${esc(rige.meses)}" aria-label="Meses de ${esc(s.nombre)}"> meses</label>
        <button type="button" class="btn" data-guardar-intervalo="${esc(s.tipo)}">Guardar</button>
        ${rige.propio ? `<button type="button" class="btn" data-volver-intervalo="${esc(s.tipo)}">Volver a los de siempre (${esc(deSiempre)})</button>` : ''}
        <p class="mant-porque">De siempre: ${esc(deSiempre)}. ${esc(s.porque)}</p>
      </div>`;
  });
  return `
    <summary>Intervalos de este carro</summary>
    <p class="mant-ayuda">Cada servicio toca con el intervalo que llegue primero, kilómetros o tiempo. Los «de siempre» son una
      propuesta pensada para carros de renta; cámbialos aquí para este carro si tu taller recomienda otra cosa.</p>
    ${filas.join('')}`;
}

/** Lo que se le dice al dueño cuando un cambio no se pudo guardar. */
function textoDelFallo(error, queSeIntentaba) {
  if (error?.codigo === CODIGO_DOCUMENTO_NO_ESTA) return error.message;
  return `No se pudo ${queSeIntentaba}. Revisa tu conexión e intenta de nuevo.`;
}

/**
 * Dibuja el bloque dentro de `raiz` (un elemento vacío de la ficha) y conecta sus botones. Devuelve `{ actualizar }` para
 * cuando una lectura que llegó tarde trae datos distintos, y avisa con `alCambiar(carro)` cada vez que un cambio deja al
 * carro de otra forma, para que la ficha no guarde después una copia vieja de sus servicios.
 */
export function pintarMantenimiento(raiz, {
  carro, contratos, hoy, falloFlota = false, falloContratos = false, alCambiar = () => {},
}) {
  const ctx = {
    carro, contratos, falloFlota, falloContratos,
  };
  const alta = altaConIdFijo(nuevoIdServicio);
  let ocupado = false;
  let intervalosPintados = null;

  const propuesta = () => estadoDeMantenimiento({
    carro: ctx.carro, kilometraje: kilometrajeDelCarro(ctx.carro.id, ctx.contratos), hoy,
  }).kilometraje?.km ?? null;

  raiz.innerHTML = `
    <h2>Mantenimiento</h2>
    <div class="mant-bloque">
      <div id="mant-estado"></div>
    </div>
    <div class="mant-bloque">${htmlFormularioDeServicio({ hoy, propuesta: propuesta() })}</div>
    <details class="mant-bloque mant-intervalos" id="mant-intervalos"></details>`;

  const caja = (id) => raiz.querySelector(`#${id}`);

  function pintarEstado() {
    caja('mant-estado').innerHTML = htmlEstadoDeMantenimiento({
      carro: ctx.carro, contratos: ctx.contratos, hoy, falloFlota: ctx.falloFlota, falloContratos: ctx.falloContratos,
    });
  }

  function pintarIntervalos() {
    intervalosPintados = JSON.stringify(ctx.carro.intervalos ?? null);
    caja('mant-intervalos').innerHTML = htmlIntervalos({ carro: ctx.carro });
  }

  pintarEstado();
  pintarIntervalos();

  /** Un cambio ya guardado: el carro nuevo se recuerda, la ficha se entera y todo se vuelve a dibujar. */
  function aplicar(guardado) {
    ctx.carro = guardado;
    alCambiar(guardado);
    pintarEstado();
    pintarIntervalos();
  }

  function decirLosProblemas(problemas) {
    const lugar = caja('mant-problemas');
    lugar.textContent = problemas.join(' ');
    lugar.hidden = problemas.length === 0;
  }

  caja('mant-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (ocupado) return;
    const { servicio, problemas } = construirServicio({
      tipo: caja('mant-tipo').value, fecha: caja('mant-fecha').value, km: caja('mant-km').value,
    }, hoy);
    decirLosProblemas(problemas);
    if (!servicio) return;

    ocupado = true;
    caja('mant-registrar').disabled = true;
    try {
      // El id se decide UNA vez por servicio: si el guardado venció pero sí llegó, el reintento cae en el mismo y no se duplica.
      const conId = await alta.paraGuardar(servicio);
      const guardado = await registrarServicioDelCarro(ctx.carro.id, conId, { hoy });
      alta.terminada();
      aplicar(guardado);
      caja('mant-fecha').value = hoy;
      caja('mant-km').value = propuesta() ?? '';
      aviso('Servicio registrado.', 'exito');
    } catch (error) {
      console.error(error);
      decirLosProblemas([textoDelFallo(error, 'guardar el servicio')]);
    } finally {
      ocupado = false;
      caja('mant-registrar').disabled = false;
    }
  });

  raiz.addEventListener('click', async (ev) => {
    const anular = ev.target.closest?.('[data-anular]');
    const guardarIntervalo = ev.target.closest?.('[data-guardar-intervalo]');
    const volverIntervalo = ev.target.closest?.('[data-volver-intervalo]');
    if (!anular && !guardarIntervalo && !volverIntervalo) return;
    if (ocupado) return;

    let cambio;
    let queSeIntentaba;
    if (anular) {
      const id = anular.dataset.anular;
      const fila = historialDeServicios(ctx.carro.servicios, hoy).find((h) => h.id === id);
      const texto = fila ? `«${fila.nombre}» del ${fecha(fila.fecha)}` : 'este servicio';
      if (!confirm(`¿Anular el servicio ${texto}? Deja de contar para los plazos, pero se queda en el historial.`)) return;
      cambio = () => anularServicioDelCarro(ctx.carro.id, id, { fecha: hoy });
      queSeIntentaba = 'anular el servicio';
    } else {
      const tipo = (guardarIntervalo || volverIntervalo).dataset[guardarIntervalo ? 'guardarIntervalo' : 'volverIntervalo'];
      if (guardarIntervalo) {
        const fila = guardarIntervalo.closest('[data-tipo]');
        const { intervalo, problemas } = revisarIntervalo({ km: fila.querySelector('[data-km]').value, meses: fila.querySelector('[data-meses]').value });
        if (!intervalo) {
          aviso(problemas.join(' '), 'error');
          return;
        }
        cambio = () => cambiarIntervaloDelCarro(ctx.carro.id, tipo, intervalo);
      } else {
        cambio = () => cambiarIntervaloDelCarro(ctx.carro.id, tipo, null);
      }
      queSeIntentaba = 'guardar los intervalos';
    }

    ocupado = true;
    try {
      aplicar(await cambio());
      aviso(anular ? 'Servicio anulado.' : 'Intervalos guardados.', 'exito');
    } catch (error) {
      console.error(error);
      aviso(textoDelFallo(error, queSeIntentaba), 'error');
    } finally {
      ocupado = false;
    }
  });

  return {
    /** Una lectura que llegó tarde: se vuelve a dibujar lo que cambió, sin tocar el formulario que se está llenando. */
    actualizar(nuevo) {
      Object.assign(ctx, {
        carro: nuevo.carro ?? ctx.carro,
        contratos: nuevo.contratos ?? ctx.contratos,
        falloFlota: nuevo.falloFlota ?? ctx.falloFlota,
        falloContratos: nuevo.falloContratos ?? ctx.falloContratos,
      });
      pintarEstado();
      if (JSON.stringify(ctx.carro.intervalos ?? null) !== intervalosPintados) pintarIntervalos();
    },
  };
}
