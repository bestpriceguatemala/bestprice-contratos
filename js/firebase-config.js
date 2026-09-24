// Conexión a Firebase. Los datos de este archivo son públicos por diseño: lo que
// protege la información son las reglas de Firestore, no esconder estas claves.
const SDK = '12.0.0';

export const CONFIG = {
  apiKey: 'AIzaSyB0NCVqgMhiy_cTpUv7WyYVn8C4LryeGO4',
  authDomain: 'bestprice-contratos.firebaseapp.com',
  projectId: 'bestprice-contratos',
  storageBucket: 'bestprice-contratos.firebasestorage.app',
  messagingSenderId: '222026060734',
  appId: '1:222026060734:web:0be7c3f50faca5efba9fef',
};

let listo = null;

/**
 * Levanta Firebase una sola vez y devuelve lo que usa el resto del sistema.
 *
 * Si ese primer intento falla (sin internet en ese momento, o un blip de la
 * red al cargar la página), `listo` se vuelve a poner en `null` en vez de
 * quedarse con la promesa ya rechazada — hallazgo importante de la revisión
 * final: antes, una conexión fallida una sola vez dejaba `listo` apuntando
 * para siempre a esa misma promesa rechazada, así que cada intento de
 * `entrar()` de ahí en adelante fallaba también, aunque el internet ya
 * hubiera vuelto — el dueño podía escribir bien su contraseña cien veces y
 * ver el mismo error cien veces, sin que recargar la página fuera necesario
 * para arreglarlo, pero sin que nada se lo dijera tampoco.
 */
export function iniciarFirebase() {
  if (listo) return listo;
  listo = (async () => {
    try {
      const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`);
      const auth = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`);
      const fs = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`);
      const app = initializeApp(CONFIG);
      return { app, auth: auth.getAuth(app), db: fs.getFirestore(app), authMod: auth, fsMod: fs };
    } catch (error) {
      listo = null;
      throw error;
    }
  })();
  return listo;
}
