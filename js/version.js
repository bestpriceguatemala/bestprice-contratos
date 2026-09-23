// Vigilancia de versión: detecta cuando hay una nueva versión disponible y
// ofrece al usuario recargar con la versión más reciente. Se ejecuta cada 15
// minutos y también cuando el navegador vuelve a la pestaña después de estar
// en otra ventana.

const VERSION = '2026-09-23.1';

/** Recarga los archivos CSS y JS sin usar caché, luego recarga la página. */
async function recargarConVersionNueva() {
  try {
    // Preguntarle al navegador qué archivos ya cargó (el performance API), que
    // incluye todos los módulos del gráfico de importaciones, no solo los nodos
    // del DOM. Recargar todos ellos con cache: 'reload' evita el cache de 10
    // minutos de GitHub Pages y garantiza que el código nuevo está descargado
    // y guardado antes de recargar la página.
    const archivos = performance.getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => n.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(n));

    // Usar allSettled para que si falla alguno, los otros siguen intentando.
    // Sin cache: 'reload', fetch() puede devolver los módulos de la caché
    // mientras no venzan, y la página quedaría con código viejo. Con cache:
    // 'reload', obligamos al navegador a ir al servidor ahora mismo.
    await Promise.allSettled(archivos.map((n) => fetch(n, { cache: 'reload' })));
  } catch (err) {
    console.error('Error al precargar archivos nuevos:', err);
    // Aunque falle la precarga, recargamos de todas formas para que el navegador
    // traiga la versión nueva del servidor.
  }

  // Recargar la página después de traer la versión nueva con cache: 'reload'.
  location.reload();
}

/** Muestra la barra de aviso de versión con un botón para actualizar. */
function mostrarAvisoVersion() {
  // Si ya hay una barra de versión, no crear otra.
  if (document.getElementById('barra-version')) return;

  const barra = document.createElement('div');
  barra.id = 'barra-version';
  barra.className = 'barra-version';
  barra.innerHTML = `
    <span>Hay una versión nueva disponible.</span>
    <button class="btn-actualizar">Actualizar ahora</button>
  `;

  document.body.insertBefore(barra, document.body.firstChild);

  // La barra empuja el sistema hacia abajo en vez de taparlo: mientras el aviso
  // está arriba, él tiene que poder seguir usando su buscador y sus menús.
  // Medir la altura de la barra (no hard-codear) porque el texto se ajusta
  // diferente según el ancho de la ventana.
  const alturaBarra = barra.offsetHeight;
  document.body.style.paddingTop = `${alturaBarra}px`;

  barra.querySelector('.btn-actualizar').addEventListener('click', async () => {
    barra.remove();
    await recargarConVersionNueva();
  });
}

/** Oculta la barra de aviso de versión. */
function ocultarAvisoVersion() {
  const barra = document.getElementById('barra-version');
  if (barra) {
    barra.remove();
    // Quitar el espacio que la barra dejó en la parte superior de la página.
    document.body.style.paddingTop = '';
  }
}

/** Consulta el servidor por la versión actual, sin usar caché. */
async function obtenerVersionServidor() {
  try {
    const resp = await fetch('version.txt', { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const texto = await resp.text();
    return texto.trim();
  } catch (err) {
    console.error('Error al obtener versión del servidor:', err);
    return null;
  }
}

/** Comprueba si hay una versión nueva y muestra u oculta el aviso según sea necesario. */
async function verificarVersion() {
  const versionServidor = await obtenerVersionServidor();
  if (versionServidor && versionServidor !== VERSION) {
    mostrarAvisoVersion();
  } else {
    ocultarAvisoVersion();
  }
}

/**
 * Comienza a vigilar la versión: comprueba cada 15 minutos y también cuando
 * el usuario vuelve a la pestaña después de estar en otra.
 */
export function vigilarVersion() {
  // Primera comprobación al arrancar.
  verificarVersion();

  // Comprobación cada 15 minutos.
  setInterval(verificarVersion, 15 * 60 * 1000);

  // Comprobación cuando el usuario vuelve a la pestaña.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      verificarVersion();
    }
  });
}
