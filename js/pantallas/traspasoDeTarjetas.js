// El traspaso del número de la tarjeta y del CBC, de «Sacar carro» a «Imprimir contrato» (ADR-001, aclaración del
// 16 de octubre de 2026).
//
// Para qué: el mostrador teclea el número completo y el CBC con el cliente enfrente, al sacar el carro, y un minuto
// después tenía que volver a teclearlos en la pantalla de imprimir. Esto los lleva de una pantalla a la otra SIN
// guardarlos: ni en el contrato, ni en IndexedDB, ni en Firestore, ni en `localStorage` o `sessionStorage`, ni en la
// dirección, ni en el título, ni en el historial, ni en la consola. Viven en una variable de este módulo, y nada más.
//
// Esto no es un almacén, es un SALTO. Por eso se cierra por cuatro lados, y cada uno cubre un hueco que los otros no:
//
//  1. Va con el id del contrato. La pantalla de imprimir de OTRO contrato no ve nada. Es el peor caso posible (la
//     tarjeta de un cliente impresa en el papel de otro, que se firma y ya no se corrige) y el único que no se arregla
//     después, así que es la primera defensa y no depende de que nadie se acuerde de borrar.
//  2. Se entrega UNA sola vez. Entrar a cualquier pantalla de imprimir (la de este contrato o la de otro) lo borra: lo
//     que alcance a salir en ese salto sale, y quien vuelva a entrar teclea de nuevo, como siempre. Por eso no hay un
//     «reimprimir con los mismos datos»: el que reimprime es el caso en que el cliente ya se fue con su tarjeta.
//  3. Al cambiar de pantalla a cualquier lado que no sea la de imprimir de ESTE contrato, se borra. Si la ruta de
//     imprimir no llegó a dibujarse (la sesión se cayó, el enrutador mandó a otra parte), los datos no se quedan
//     esperando a que alguien llegue después.
//  4. Un tiempo corto. El salto dura milisegundos; un minuto solo cubre un aparato lento cargando la pantalla. No
//     puede quedarse en memoria porque el mostrador se fue a almorzar entre una cosa y la otra. Se comprueba al tomar
//     (no depende de que el temporizador alcance a correr: una computadora dormida lo deja pendiente) y además un
//     temporizador lo borra de verdad de la memoria. El reloj aquí NO es una regla del negocio —no decide ninguna
//     fecha ni ningún cobro—: es un seguro de memoria, por eso se puede leer y se puede inyectar para probar.
//
// Dejar uno nuevo borra siempre el anterior (sacar un carro y luego otro: el segundo no trae nada del primero), y dejar
// «nada» (una renta sin tarjeta) también lo borra.
//
// Lo que NO hace: no hay `export` que devuelva lo que hay sin borrarlo, ni uno que diga «qué hay» (las pruebas miran
// lo guardado llamando a `tomarTraspaso`, que es la única salida), no escribe en ningún almacén, no llama a la red y no
// escribe en la consola. Lo prueba pruebas/traspaso-de-tarjetas.test.mjs contra espías.

/** Cuánto se queda esperando en memoria un traspaso que nadie tomó. Ver (4) arriba. */
export const VIDA_DEL_TRASPASO_MS = 60 * 1000;

/** La ruta de imprimir un contrato: la misma que registra `app.js` y que usa el botón de la ficha. */
export const rutaDeImprimir = (contratoId) => `#/imprimir/${contratoId}`;

const REAL = {
  ahora: () => Date.now(),
  programar: (accion, ms) => setTimeout(accion, ms),
  cancelar: (temporizador) => clearTimeout(temporizador),
  ventana: () => globalThis.window,
};

// Lo único que hay: UN traspaso a la vez, o nada.
let traspaso = null;
// La ventana en la que está puesto el oyente de «cambió de pantalla», para quitarlo cuando ya no hay nada que cuidar.
let ventanaConOyente = null;

const texto = (v) => String(v ?? '').trim();
const tieneAlgo = (t) => Boolean(texto(t?.numero) || texto(t?.cbc));

function alCambiarDePantalla() {
  if (!traspaso) return;
  const hash = ventanaConOyente?.location?.hash ?? '';
  if (hash !== rutaDeImprimir(traspaso.contratoId)) olvidar();
}

function olvidar() {
  if (traspaso) {
    traspaso.cancelar();
    traspaso = null;
  }
  if (ventanaConOyente) {
    ventanaConOyente.removeEventListener?.('hashchange', alCambiarDePantalla);
    ventanaConOyente = null;
  }
}

/** Borra lo que hubiera, sin entregarlo. Para quien sabe que ya no hace falta (salir de la pantalla, cerrar sesión). */
export function olvidarTraspaso() {
  olvidar();
}

/**
 * Deja las tarjetas de ESTE contrato para el salto a imprimir. `tarjetas` es `[{ numero, cbc }]`, una por cada tarjeta
 * del contrato y en su mismo orden (la pantalla de imprimir las junta por posición, y además comprueba los últimos 4).
 * Sin id, o si ninguna tiene número ni CBC, no deja nada: y de todos modos borra lo anterior.
 */
export function dejarTraspaso(contratoId, tarjetas, entorno = {}) {
  olvidar();
  const lista = Array.isArray(tarjetas) ? tarjetas : [];
  if (!contratoId || !lista.some(tieneAlgo)) return;

  const { ahora, programar, cancelar, ventana } = { ...REAL, ...entorno };
  const temporizador = programar(olvidar, VIDA_DEL_TRASPASO_MS);
  // En Node un temporizador pendiente impediría que un proceso (las pruebas) termine; en el navegador no existe `unref`.
  temporizador?.unref?.();
  traspaso = {
    contratoId: String(contratoId),
    tarjetas: lista.map((t) => ({ numero: texto(t?.numero), cbc: texto(t?.cbc) })),
    vence: ahora() + VIDA_DEL_TRASPASO_MS,
    ahora,
    cancelar: () => cancelar(temporizador),
  };
  const v = typeof ventana === 'function' ? ventana() : ventana;
  if (v?.addEventListener) {
    v.addEventListener('hashchange', alCambiarDePantalla);
    ventanaConOyente = v;
  }
}

/**
 * Entrega lo que haya para este contrato y lo BORRA, siempre: entrar a una pantalla de imprimir cierra el salto sea de
 * quien sea el traspaso. `[]` si no había nada, era de otro contrato o ya se venció. Quien lo recibe es la pantalla de
 * imprimir, y ahí se queda solo en las cajas (que se vacían al terminar de imprimir y al salir).
 */
export function tomarTraspaso(contratoId) {
  const mio = traspaso;
  olvidar();
  if (!mio || !contratoId || mio.contratoId !== String(contratoId)) return [];
  if (mio.ahora() > mio.vence) return [];
  return mio.tarjetas.map((t) => ({ numero: t.numero, cbc: t.cbc }));
}
