// Espías para las pruebas de ADR-001: apuntan todo lo que se guardaría o se mandaría a otro lado.
// Lo usan pruebas/contrato-impreso.test.mjs y pruebas/traspaso-de-tarjetas.test.mjs.

/**
 * Corre `fn` con todo lo que podría guardar o mandar algo (localStorage, sessionStorage, IndexedDB, fetch, la consola)
 * reemplazado por espías que apuntan cada llamada, y devuelve todo lo apuntado como un solo texto. Si el número de la
 * tarjeta o el CBC llegaran a cualquiera de esos lugares, estarían en ese texto.
 */
export async function conEspias(fn) {
  const apuntes = [];
  const guardado = {};
  const espia = (nombre) => new Proxy({}, {
    get: (_o, propiedad) => (...args) => { apuntes.push([nombre, String(propiedad), ...args.map((a) => { try { return JSON.stringify(a) ?? String(a); } catch { return String(a); } })]); return null; },
    set: (_o, propiedad, valor) => { apuntes.push([nombre, `set ${String(propiedad)}`, String(valor)]); return true; },
  });
  const sustituir = (nombre, valor) => { guardado[nombre] = Object.getOwnPropertyDescriptor(globalThis, nombre); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }); };
  sustituir('localStorage', espia('localStorage'));
  sustituir('sessionStorage', espia('sessionStorage'));
  sustituir('indexedDB', espia('indexedDB'));
  sustituir('fetch', (...args) => { apuntes.push(['fetch', ...args.map(String)]); return Promise.reject(new Error('sin red en las pruebas')); });
  const consola = {};
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug']) {
    consola[metodo] = console[metodo];
    console[metodo] = (...args) => apuntes.push(['console', metodo, ...args.map((a) => { try { return JSON.stringify(a) ?? String(a); } catch { return String(a); } })]);
  }
  try {
    await fn();
  } finally {
    for (const [nombre, descriptor] of Object.entries(guardado)) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor); else delete globalThis[nombre];
    }
    for (const [metodo, original] of Object.entries(consola)) console[metodo] = original;
  }
  return apuntes;
}
