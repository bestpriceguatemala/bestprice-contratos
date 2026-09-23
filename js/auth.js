// Sesión del sistema: una sola cuenta, la del dueño o de quien él autorice
// (§11 del diseño). Aquí se traduce cualquier error de Firebase a una frase
// que él pueda leer: nunca debe aparecer en pantalla un código como
// 'auth/invalid-credential'.
import { iniciarFirebase } from './firebase-config.js';

const MENSAJES = {
  'auth/invalid-email': 'Ese correo no es válido.',
  'auth/user-not-found': 'Usuario o contraseña incorrectos.',
  'auth/wrong-password': 'Usuario o contraseña incorrectos.',
  'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada. Avisa al encargado.',
  'auth/too-many-requests': 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.',
  'auth/network-request-failed': 'No se pudo conectar. Revisa tu conexión a internet.',
};

const MENSAJE_GENERICO = 'No se pudo conectar con el sistema. Intenta de nuevo en unos minutos.';

/** Convierte un error de Firebase (o de conexión) en un mensaje en español simple. */
function mensajeDeError(error) {
  return MENSAJES[error?.code] || MENSAJE_GENERICO;
}

/** Entra con usuario y clave. Si falla, lanza un Error con mensaje ya en español. */
export async function entrar(usuario, clave) {
  try {
    const { auth, authMod } = await iniciarFirebase();
    await authMod.signInWithEmailAndPassword(auth, usuario, clave);
  } catch (error) {
    throw new Error(mensajeDeError(error));
  }
}

/** Cierra la sesión actual. */
export async function salir() {
  try {
    const { auth, authMod } = await iniciarFirebase();
    await authMod.signOut(auth);
  } catch (error) {
    throw new Error(mensajeDeError(error));
  }
}

/**
 * Avisa cada vez que cambia la sesión: `cb(usuario)` con el usuario de Firebase,
 * o `cb(null)` cuando no hay nadie. Devuelve la función para dejar de escuchar.
 */
export async function alCambiarSesion(cb) {
  const { auth, authMod } = await iniciarFirebase();
  return authMod.onAuthStateChanged(auth, cb);
}
