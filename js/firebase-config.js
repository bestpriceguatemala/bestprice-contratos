// Conexión a Firebase. Los datos de este archivo son públicos por diseño: lo que
// protege la información son las reglas de Firestore, no esconder estas claves.
const SDK = '12.0.0';

export const CONFIG = {
  apiKey: 'PEGAR_DE_LA_CONSOLA',
  authDomain: 'bestprice-contratos.firebaseapp.com',
  projectId: 'bestprice-contratos',
  storageBucket: 'bestprice-contratos.firebasestorage.app',
  messagingSenderId: 'PEGAR_DE_LA_CONSOLA',
  appId: 'PEGAR_DE_LA_CONSOLA',
};

let listo = null;

/** Levanta Firebase una sola vez y devuelve lo que usa el resto del sistema. */
export function iniciarFirebase() {
  if (listo) return listo;
  listo = (async () => {
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`);
    const auth = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`);
    const fs = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`);
    const app = initializeApp(CONFIG);
    return { app, auth: auth.getAuth(app), db: fs.getFirestore(app), authMod: auth, fsMod: fs };
  })();
  return listo;
}
