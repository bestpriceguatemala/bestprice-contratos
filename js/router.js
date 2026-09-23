// Enrutador mínimo basado en location.hash. Cada tarea futura registra su
// pantalla una vez con registrarPantalla('#/flota', fn); la ruta que todavía
// no tiene dueño simplemente muestra un aviso en vez de romper la página.
const pantallas = new Map();

/** Registra qué función dibuja el contenido de <main id="pantalla"> para esa ruta. */
export function registrarPantalla(ruta, fn) {
  pantallas.set(ruta, fn);
}

/** Dibuja la pantalla de esa ruta dentro de <main id="pantalla">. */
export function mostrar(ruta) {
  const caja = document.getElementById('pantalla');
  if (!caja) return;
  const fn = pantallas.get(ruta);
  if (fn) {
    fn(caja);
  } else {
    caja.innerHTML = '<p class="pendiente">Todavía no está lista esta pantalla.</p>';
  }
}

// La navegación por los links de la barra (#/flota, #/clientes, ...) cambia el
// hash del navegador; el enrutador reacciona solo, sin que cada pantalla tenga
// que escuchar el evento por su cuenta.
window.addEventListener('hashchange', () => mostrar(location.hash));
