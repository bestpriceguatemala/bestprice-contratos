// Vigilancia de versión: detecta cuando hay una nueva versión disponible y
// ofrece al usuario recargar con la versión más reciente. Se ejecuta cada 15
// minutos y también cuando el navegador vuelve a la pestaña después de estar
// en otra ventana.

const VERSION = '2026-09-23.1';

/** Recarga los archivos CSS y JS sin usar caché, luego recarga la página. */
async function recargarConVersionNueva() {
  try {
    // Buscar todos los <link rel="stylesheet"> y <script> de módulo, y hacerles
    // un fetch con cache: 'reload' para forzar una descarga desde el servidor.
    const hojas = document.querySelectorAll('link[rel="stylesheet"]');
    const scripts = document.querySelectorAll('script[type="module"]');

    const promesas = [];
    hojas.forEach(hoja => {
      promesas.push(fetch(hoja.href, { cache: 'reload' }));
    });
    scripts.forEach(script => {
      promesas.push(fetch(script.src, { cache: 'reload' }));
    });

    await Promise.all(promesas);
  } catch (err) {
    console.error('Error al precargar archivos nuevos:', err);
    // Aunque falle la precarga, recargamos de todas formas para que el navegador
    // traiga la versión nueva del servidor.
  }

  // Recargar la página después de traer la versión nueva.
  window.location.reload();
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

  barra.querySelector('.btn-actualizar').addEventListener('click', async () => {
    barra.remove();
    await recargarConVersionNueva();
  });
}

/** Oculta la barra de aviso de versión. */
function ocultarAvisoVersion() {
  const barra = document.getElementById('barra-version');
  if (barra) barra.remove();
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
