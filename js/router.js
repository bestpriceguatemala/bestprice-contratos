// Enrutador mínimo basado en location.hash. Cada tarea futura registra su
// pantalla una vez con registrarPantalla('#/flota', fn); la ruta que todavía
// no tiene dueño simplemente muestra un aviso en vez de romper la página.
//
// Desde "Sacar carro" (T11) algunas rutas llevan un id adentro, como
// '#/sacar/:carroId': el patrón se registra tal cual, con los dos puntos, y
// mostrar() se encarga de encontrar qué patrón calza con la ruta real y de
// sacarle el pedazo capturado para pasárselo a la pantalla.
const pantallas = new Map();

/** Registra qué función dibuja el contenido de <main id="pantalla"> para esa ruta o patrón. */
export function registrarPantalla(ruta, fn) {
  pantallas.set(ruta, fn);
}

/**
 * Compara una ruta real contra un patrón registrado (por ejemplo
 * '#/sacar/:carroId'). Devuelve los valores capturados en el orden del
 * patrón, o null si no calza. Función pura, sin tocar el DOM, para poder
 * probarla sola.
 */
export function emparejar(ruta, patron) {
  const partesRuta = String(ruta || '').split('/');
  const partesPatron = String(patron || '').split('/');
  if (partesRuta.length !== partesPatron.length) return null;
  const valores = [];
  for (let i = 0; i < partesPatron.length; i++) {
    if (partesPatron[i].startsWith(':')) {
      if (!partesRuta[i]) return null; // un ":carroId" vacío no es un id
      valores.push(decodeURIComponent(partesRuta[i]));
    } else if (partesPatron[i] !== partesRuta[i]) {
      return null;
    }
  }
  return valores;
}

/** Dibuja la pantalla de esa ruta dentro de <main id="pantalla">. */
export function mostrar(ruta) {
  const caja = document.getElementById('pantalla');
  if (!caja) return;

  const directa = pantallas.get(ruta);
  if (directa) {
    directa(caja);
    return;
  }

  // Ruta exacta no encontrada: se prueba contra los patrones con parámetro,
  // en el orden en que se registraron.
  for (const [patron, fn] of pantallas) {
    if (!patron.includes(':')) continue;
    const valores = emparejar(ruta, patron);
    if (valores) {
      fn(caja, ...valores);
      return;
    }
  }

  caja.innerHTML = '<p class="pendiente">Todavía no está lista esta pantalla.</p>';
}

// La navegación por los links de la barra (#/flota, #/clientes, ...) cambia el
// hash del navegador; el enrutador reacciona solo, sin que cada pantalla tenga
// que escuchar el evento por su cuenta.
//
// La comprobación de `window` es para que este archivo se pueda importar
// desde las pruebas (Node, sin navegador) solo para probar emparejar(), que
// es una función pura y no necesita nada de esto.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => mostrar(location.hash));
}
