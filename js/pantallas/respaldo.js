// La pantalla del respaldo en Excel (§10 del diseño) y el aviso al entrar.
//
// Cuelga de `#/dinero/respaldo`, detrás de la segunda contraseña: el archivo lleva lo que Best Price le paga a cada
// dueño de carro, y ADR-002 dice que toda pantalla que necesite ese costo pide la credencial de dinero.
//
// Ninguna regla de negocio vive aquí. Cuándo se recuerda, qué años faltan y cómo se llama el archivo están en
// nucleo/respaldo.js; cómo se arma el .xlsx, en js/respaldo/. Esta pantalla lee, pide armar, entrega el archivo y anota
// la fecha. Dos cosas no se negocian y por eso tienen su prueba:
//
//   1. LA ADVERTENCIA VA JUNTO AL BOTÓN, no en un documento: el archivo lleva el DPI, la licencia y el teléfono de los
//      clientes (§10). Se dibuja antes de cualquier botón de descarga y se repite en el aviso de «Listo».
//   2. LA FECHA SE ANOTA DESPUÉS DE ENTREGAR EL ARCHIVO, nunca antes (ver `crearElRespaldo`).
import { hoyISO } from '../nucleo/fechas.js';
import {
  estadoDeLosAnios, ultimoRespaldo, respaldoVencido, nombreDelArchivo,
} from '../nucleo/respaldo.js';
import { armarRespaldo, MENSAJE_VISTA_PROTEGIDA } from '../respaldo/excel.js';
import { ErrorDeRespaldo, NO_SE_RESPALDA } from '../respaldo/mapa.js';
import { leerDatosDelRespaldo, leerRegistroDeRespaldos, anotarRespaldo } from '../respaldo/nube.js';
import { fecha } from '../ui.js';

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const RUTA_DEL_RESPALDO = '#/dinero/respaldo';
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ANIO_MAS_VIEJO = 2000;

export const MENSAJE_GENERICO = 'No se pudo armar el respaldo. Revisa tu internet e intenta de nuevo; si sigue igual, recarga la página o avisa a quien lleva el sistema.';

/** La advertencia de §10. Lleva las tres cosas que el archivo trae de los clientes, por su nombre. */
export const AVISO_DE_PRIVACIDAD = {
  titulo: 'Cuidado con este archivo',
  texto: 'Lleva el DPI, la licencia y el teléfono de tus clientes, y lo que le pagas a cada dueño de carro. '
    + 'Merece el mismo cuidado que el Excel que ya guardas hoy: no lo mandes por WhatsApp ni por correo, no lo subas a una carpeta compartida ni a un sitio público, y guárdalo donde solo entres tú.',
};

// ---------------------------------------------------------------------------
// Armar y entregar
// ---------------------------------------------------------------------------

/** La plantilla que viaja con el sistema (su Excel, sin datos de nadie). `no-cache`: si se actualiza, se baja la nueva. */
export async function bajarLaPlantilla(pedir = fetch) {
  const respuesta = await pedir(new URL('../../plantilla/best-price.xlsx', import.meta.url), { cache: 'no-cache' });
  if (!respuesta.ok) throw new ErrorDeRespaldo('No se pudo bajar la plantilla del archivo de Excel. Revisa tu internet e intenta de nuevo.');
  return new Uint8Array(await respuesta.arrayBuffer());
}

/** Le entrega el archivo al navegador, que lo guarda en descargas. Solo en el navegador. */
export function descargarArchivo(bytes, nombre) {
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_XLSX }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // El navegador necesita un momento para empezar a leer el archivo antes de que se suelte.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Lee, arma, entrega y anota. En ese orden, y el orden importa:
 *   - si falta cualquier dato o el armado se niega, NO se entrega nada y NO se anota nada: el aviso del año sigue;
 *   - la fecha se anota DESPUÉS de entregar. Si la anotación falla, lo peor es que el aviso vuelva a salir; anotarla
 *     antes de saber que el archivo salió callaría el aviso un año con el dueño creyendo que tiene un respaldo.
 *
 * Devuelve `{ nombre, cuenta, avisos, anotado }`. Las dependencias se pueden inyectar solo para probar el orden.
 */
export async function crearElRespaldo({
  anio, hoy, leer = leerDatosDelRespaldo, cargarPlantilla = bajarLaPlantilla, armar = armarRespaldo, entregar = descargarArchivo, anotar = anotarRespaldo,
}) {
  const datos = await leer(anio);
  const plantilla = await cargarPlantilla();
  const { bytes, avisos, cuenta } = await armar({
    plantilla, anio, hoy, ...datos,
  });
  const nombre = nombreDelArchivo(anio);
  entregar(bytes, nombre);
  let anotado = true;
  try {
    await anotar(anio, hoy);
  } catch (error) {
    console.error('Se bajó el respaldo pero no se pudo anotar la fecha:', error);
    anotado = false;
  }
  return {
    nombre, cuenta, avisos, anotado,
  };
}

// ---------------------------------------------------------------------------
// Lo que dice la pantalla
// ---------------------------------------------------------------------------

/** Lo que se sabe de un año, en una frase para el dueño. */
export function textoDelEstadoDelAnio(estado) {
  const { bajadoEl, completo, esDelAnioEnCurso } = estado;
  if (!bajadoEl) {
    return esDelAnioEnCurso
      ? 'Todavía no has bajado el respaldo de este año.'
      : 'Todavía no has bajado el respaldo de ese año, y este es el momento de cerrarlo.';
  }
  if (completo) return `Completo: lo bajaste el ${fecha(bajadoEl)}, cuando el año ya había terminado.`;
  if (esDelAnioEnCurso) return `Lo bajaste el ${fecha(bajadoEl)}. Lleva las rentas hasta ese día; si bajas otra vez, lleva también las de después.`;
  return `Lo bajaste el ${fecha(bajadoEl)}, antes de que terminara el año: no lleva las rentas de después. Bájalo otra vez para completarlo.`;
}

function htmlDeUnAnio(estado, { trabajando }) {
  const cuando = estado.esDelAnioEnCurso ? 'este año' : 'año anterior';
  const ocupado = trabajando !== null;
  return `
    <article class="rs-anio${estado.completo ? ' rs-anio-completo' : ''}">
      <div>
        <h3>${estado.anio} <span class="rs-cuando">${cuando}</span></h3>
        <p>${esc(textoDelEstadoDelAnio(estado))}</p>
      </div>
      <button type="button" class="btn btn-primario" data-bajar="${estado.anio}"${ocupado ? ' disabled' : ''}>${
  trabajando === estado.anio ? 'Armando el archivo…' : `Bajar ${esc(nombreDelArchivo(estado.anio))}`}</button>
    </article>`;
}

function htmlDelResultado(r) {
  if (!r) return '';
  const { cuenta } = r;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const avisos = r.avisos.length
    ? `<div class="barra-lectura-fallida rs-avisos"><p><strong>Revisa esto del archivo:</strong></p>${r.avisos.map((a) => `<p>${esc(a)}</p>`).join('')}</div>`
    : '';
  const sinAnotar = r.anotado ? '' : '<p class="rs-sin-anotar">El archivo se bajó, pero no se pudo anotar la fecha en el sistema: el aviso del respaldo puede volver a salir. No pasa nada si lo bajas otra vez.</p>';
  return `
    <div class="rs-listo" role="status">
      <p><strong>Listo: ${esc(r.nombre)}</strong> se bajó a tu carpeta de descargas. Lleva ${
  plural(cuenta.clientes, 'cliente', 'clientes')}, ${plural(cuenta.vehiculos, 'carro', 'carros')} y ${plural(cuenta.contratos, 'contrato', 'contratos')}.</p>
      <p>${esc(MENSAJE_VISTA_PROTEGIDA)}</p>
      <p class="rs-recuerda"><strong>Recuerda:</strong> lleva el DPI, la licencia y el teléfono de tus clientes. Guárdalo con el mismo cuidado que tu Excel de siempre.</p>
      ${sinAnotar}
    </div>
    ${avisos}`;
}

/**
 * La pantalla entera. Función pura: lo que cambia es `ui` — `anios` (de `estadoDeLosAnios`, ya filtrados por `ofrecer`),
 * `trabajando` (el año que se está armando, o `null`), `error`, `resultado` y `registroFallo`.
 *
 * La advertencia de privacidad se dibuja ANTES de cualquier botón de descarga.
 */
export function htmlDeLaPantalla({
  anios = [], trabajando = null, error = '', resultado = null, registroFallo = false, anioMaximo = 2026, cargando = false,
} = {}) {
  const lista = cargando
    ? '<p class="pendiente rs-cargando">Revisando cuándo bajaste el último respaldo…</p>'
    : anios.map((a) => htmlDeUnAnio(a, { trabajando })).join('');
  return `
    <section class="rs-pantalla">
      <h2>Respaldo en Excel</h2>
      <p class="rs-intro">Un archivo de Excel por año, armado sobre tu Excel de siempre: con las mismas diez hojas, los mismos colores y las mismas fórmulas,
        y los datos reales en CLIENTES, VEHICULOS y CONTRATOS. Si un día el sistema no estuviera disponible, con ese archivo se puede rentar esa misma tarde.</p>
      <div class="rs-cuidado" role="note">
        <strong>${esc(AVISO_DE_PRIVACIDAD.titulo)}</strong>
        <p>${esc(AVISO_DE_PRIVACIDAD.texto)}</p>
      </div>
      ${registroFallo ? '<div class="barra-lectura-fallida"><p>No se pudo ver cuándo bajaste el último respaldo. Puedes bajar uno igual.</p></div>' : ''}
      <div class="rs-anios">${lista}</div>
      <form class="rs-otro" id="rs-otro" novalidate>
        <label for="rs-otro-anio">Otro año:</label>
        <input type="number" id="rs-otro-anio" min="${ANIO_MAS_VIEJO}" max="${anioMaximo}" step="1" inputmode="numeric" placeholder="${anioMaximo - 1}"${trabajando !== null ? ' disabled' : ''}>
        <button type="submit" class="btn"${trabajando !== null ? ' disabled' : ''}>Bajar ese año</button>
      </form>
      <div id="rs-estado" aria-live="polite">
        ${trabajando !== null ? '<p class="rs-trabajando">Leyendo de la nube y armando el archivo… puede tardar unos segundos. No cierres esta pantalla.</p>' : ''}
        ${error ? `<div class="barra-lectura-fallida rs-error"><p>${esc(error)}</p></div>` : ''}
        ${htmlDelResultado(resultado)}
      </div>
      <details class="rs-no-lleva" open>
        <summary>Lo que este archivo NO lleva</summary>
        <p>Es tu Excel de trabajo, no una copia de todo el sistema. No lleva:</p>
        <ul>${NO_SE_RESPALDA.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <p>Lo que tu hoja no puede mostrar de una renta queda escrito en su columna COMENTARIOS, en una frase que empieza con «Del sistema:».
          Los totales (subtotal, total cobrado, utilidad) los calcula tu hoja con sus fórmulas, no el sistema.</p>
        <p><strong>Ojo con los totales:</strong> tu hoja no suma la hora tardía ni los «varios» de la devolución. Si una renta los tiene, su total en el Excel
          sale menos que el del sistema, y su COMENTARIO empieza con «OJO» y dice cuánto falta y por qué.</p>
      </details>
    </section>`;
}

/** El aviso de arriba cuando pasó un año sin respaldo. Función pura. */
export function htmlDelRecordatorio({ ultimo }) {
  const frase = ultimo
    ? `Hace más de un año que no bajas el respaldo de tus contratos en Excel (el último fue el ${esc(fecha(ultimo))}).`
    : 'Todavía no has bajado ningún respaldo de tus contratos en Excel.';
  return `
    <p class="rs-recordatorio-texto"><strong>Respaldo en Excel.</strong> ${frase} Se baja con la contraseña del área de dinero.</p>
    <a class="btn btn-primario" href="${RUTA_DEL_RESPALDO}" data-respaldo-ir>Bajar el respaldo</a>
    <button type="button" class="btn" data-respaldo-despues>Ahora no</button>`;
}

// ---------------------------------------------------------------------------
// El aviso al entrar
// ---------------------------------------------------------------------------

const ID_DEL_RECORDATORIO = 'rs-recordatorio';
// «Ahora no» vale mientras no se recargue la página: es un aviso, no una puerta.
let descartado = false;

/** Para las pruebas: vuelve a permitir el aviso después de un «Ahora no». */
export function olvidarElDescarteDelRecordatorio() {
  descartado = false;
}

/** Quita el aviso de arriba si está. */
export function quitarElRecordatorio(documento = document) {
  documento.getElementById(ID_DEL_RECORDATORIO)?.remove();
}

/**
 * Al entrar: si pasó un año desde el último respaldo (o nunca se bajó), pone el aviso arriba de la pantalla, con el botón.
 *
 * Si no se pudo LEER cuándo fue, no hace nada: no se sabe, y decirle «hace más de un año» a quien lo bajó ayer es
 * un aviso falso que se aprende a ignorar. `hoy` es el calendario de Guatemala (hoyISO), nunca el reloj dentro de la regla.
 * Devuelve `true` si lo puso.
 */
export async function mostrarElRecordatorioDeRespaldo({
  hoy = hoyISO(), leer = leerRegistroDeRespaldos, documento = document,
} = {}) {
  if (descartado) return false;
  const registro = await leer();
  if (registro.fallo) return false;
  const ultimo = ultimoRespaldo(registro.porAnio);
  if (!respaldoVencido(ultimo, hoy)) {
    quitarElRecordatorio(documento);
    return false;
  }
  const app = documento.getElementById('app');
  const pantalla = documento.getElementById('pantalla');
  if (!app || !pantalla) return false;
  let aviso = documento.getElementById(ID_DEL_RECORDATORIO);
  if (!aviso) {
    aviso = documento.createElement('div');
    aviso.id = ID_DEL_RECORDATORIO;
    // `no-imprimir`: la hoja de estilos de impresión lo esconde (estilos.css). Este aviso se dibuja ENCIMA de cualquier pantalla, y
    // el contrato se imprime sobre papel membretado: si la hoja del contrato no logra armarse, lo único que tapa el aviso es
    // nada, y saldría impreso sobre el papel que el cliente firma.
    aviso.className = 'rs-recordatorio no-imprimir';
    aviso.setAttribute('role', 'status');
    app.insertBefore(aviso, pantalla);
  }
  aviso.innerHTML = htmlDelRecordatorio({ ultimo });
  aviso.querySelector('[data-respaldo-despues]').addEventListener('click', () => {
    descartado = true;
    quitarElRecordatorio(documento);
  });
  aviso.querySelector('[data-respaldo-ir]').addEventListener('click', () => quitarElRecordatorio(documento));
  return true;
}

// ---------------------------------------------------------------------------
// La pantalla, en el navegador
// ---------------------------------------------------------------------------

let ultimoToken = 0;

/** `#/dinero/respaldo`. Llega ya detrás de la puerta de la contraseña de dinero (app.js). */
export async function pintarRespaldo(contenedor) {
  quitarElRecordatorio();
  const miToken = ++ultimoToken;
  const hoy = hoyISO();
  const anioMaximo = Number(hoy.slice(0, 4));
  const raiz = document.createElement('div');
  contenedor.replaceChildren(raiz);

  const ui = {
    anios: [], trabajando: null, error: '', resultado: null, registroFallo: false, cargando: true,
  };
  const vigente = () => miToken === ultimoToken && raiz.isConnected;
  const dibujar = () => {
    if (!vigente()) return;
    raiz.innerHTML = htmlDeLaPantalla({ ...ui, anioMaximo });
  };

  async function leerElRegistro() {
    const registro = await leerRegistroDeRespaldos();
    if (!vigente()) return;
    ui.registroFallo = registro.fallo;
    ui.anios = estadoDeLosAnios(registro.porAnio, hoy).filter((a) => a.ofrecer);
    ui.cargando = false;
  }

  async function bajar(anio) {
    if (ui.trabajando !== null) return;
    ui.trabajando = anio;
    ui.error = '';
    ui.resultado = null;
    dibujar();
    try {
      ui.resultado = await crearElRespaldo({ anio, hoy });
      await leerElRegistro();
    } catch (error) {
      // Una frase del propio respaldo se le dice tal cual; lo demás, el detalle va a la consola y a él una frase general.
      if (!(error instanceof ErrorDeRespaldo)) console.error('El respaldo falló:', error);
      ui.error = error instanceof ErrorDeRespaldo ? error.message : MENSAJE_GENERICO;
    } finally {
      ui.trabajando = null;
      dibujar();
    }
  }

  raiz.addEventListener('click', (ev) => {
    const boton = ev.target.closest?.('[data-bajar]');
    if (boton) bajar(Number(boton.dataset.bajar));
  });
  raiz.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const texto = raiz.querySelector('#rs-otro-anio')?.value ?? '';
    const anio = Number(texto);
    if (!Number.isInteger(anio) || anio < ANIO_MAS_VIEJO || anio > anioMaximo) {
      ui.error = `Escribe un año entre ${ANIO_MAS_VIEJO} y ${anioMaximo}.`;
      ui.resultado = null;
      dibujar();
      return;
    }
    bajar(anio);
  });

  dibujar();
  await leerElRegistro();
  dibujar();
}
