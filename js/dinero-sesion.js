// La segunda credencial del área de dinero (§11 del diseño).
//
// No es una cortina en pantalla: es una segunda cuenta de Firebase Authentication,
// y las reglas de Firestore solo dejan leer lo del dinero (comisiones, utilidad,
// lo que se le debe a cada dueño) a esa cuenta. Una contraseña revisada en
// JavaScript sería peor que nada: parecería seguridad, y cualquiera que abriera
// la consola del navegador leería todo igual.
//
// Tres decisiones que hay que conservar:
//
// 1. Va en una app de Firebase APARTE, con nombre ('dinero'). Así su Auth no es
//    el del mostrador: el dueño puede entrar aquí con un cliente enfrente sin
//    que se le cierre la sesión del contrato que tiene a medias, ni al revés.
//    Por eso este archivo solo importa CONFIG de firebase-config.js, y nunca
//    iniciarFirebase(): esa función levanta la app del mostrador, y pedirle su
//    Auth a esa app por descuido le daría esta sesión al lugar equivocado.
//
// 2. La sesión vive solo en memoria. Con la persistencia normal sobreviviría a
//    cerrar el navegador y el área quedaría abierta para quien se siente después.
//    En memoria, recargar la página la vuelve a cerrar.
//
// 3. Un fallo no se queda guardado en NUESTRAS variables. Es la lección de
//    firebase-config.js (hallazgo de la revisión final): si el primer intento
//    fallaba y se guardaba la promesa rechazada, todos los intentos siguientes
//    devolvían ese mismo fallo aunque el internet ya hubiera vuelto, y el dueño
//    podía escribir bien su contraseña cien veces y ver el mismo error cien
//    veces. Aquí lo resuelve `unaVezConReintento`.
//
//    Pero hay un límite que ningún código nuestro puede quitar: el navegador
//    recuerda por su cuenta que un import() falló. Si Firebase no se pudo
//    descargar, volver a pedir ese mismo URL falla al instante, sin salir a la
//    red, aunque el internet ya haya vuelto (lo comprobó la revisión en Chrome).
//    Lo único que lo limpia es recargar la página, así que esa falla tiene su
//    propia frase (MENSAJE_RECARGAR) que le dice justo eso. En la práctica no
//    debería ocurrir: ver SDK_VERSION. El fallo de conexión al TECLEAR la
//    contraseña es otra cosa: ese sí se recupera con solo intentar de nuevo.
import { CONFIG, SDK } from './firebase-config.js';

/** El nombre que separa esta app de la del mostrador. Sin él, sería la misma. */
export const NOMBRE_APP = 'dinero';

// La versión sale de firebase-config.js y no se repite aquí. El área de dinero
// solo se abre con la sesión del mostrador ya iniciada, y esa sesión ya descargó
// estos mismos tres URL (iniciarFirebase), así que el navegador los tiene en su
// caché de módulos y el import() de abajo no depende del internet. Eso es lo
// que protege que el URL sea idéntico, y no que "se baje una sola vez": con otra
// versión este import() tendría que descargar Firebase por su cuenta, y una
// descarga fallida ya no se recupera sin recargar la página (ver
// MENSAJE_RECARGAR). Con una sola constante para las dos, esa garantía no
// depende de que alguien se acuerde de subir ambas.
export const SDK_VERSION = SDK;

// ---------------------------------------------------------------------------
// Lo que lee el dueño
// ---------------------------------------------------------------------------

// Contraseña incorrecta y sin internet piden acciones distintas: corregir lo
// escrito, o revisar el wifi. Confundirlas lo haría reescribir cien veces una
// contraseña que estaba bien.
export const MENSAJE_CLAVE_INCORRECTA = 'Esa contraseña no abre el área de dinero.';
// Se cayó la red al comprobar la contraseña. Aquí "intenta de nuevo" es cierto:
// cada intento es una petición nueva.
export const MENSAJE_SIN_CONEXION = 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
// Firebase no se pudo DESCARGAR. Distinta de la anterior a propósito: aquí
// "intenta de nuevo" es falso, porque el navegador recuerda que ese import()
// falló y lo vuelve a fallar al instante, aunque el internet ya haya vuelto. Lo
// único que funciona es recargar la página, así que primero se le dice eso, y
// después la pista del internet por si la recarga tampoco abre.
export const MENSAJE_RECARGAR = 'No se pudo cargar el área de dinero. Recarga la página e intenta de nuevo; si falla otra vez, revisa tu internet.';
// De respaldo: no sabemos si fue la contraseña o el internet, y acusar a uno
// en falso lo mandaría por el camino equivocado.
export const MENSAJE_GENERICO = 'No se pudo abrir el área de dinero. Intenta de nuevo; si sigue igual, recarga la página.';

const MENSAJE_NO_SE_CERRO = 'No se pudo cerrar el área de dinero. Recarga la página para cerrarla.';

// Un Map y no un objeto: con un objeto, un "código" como 'constructor' o
// 'toString' encontraría una función heredada en vez de caer en el respaldo, y
// un arreglo ['auth/wrong-password'] se convertiría en texto al buscarlo y
// pasaría por un código válido. En un Map la búsqueda es por identidad: ninguno
// de los dos engaña, y lo que no es texto cae en el respaldo sin más.
const MENSAJES = new Map([
  // Según la versión de Firebase y según si el correo existe, la contraseña
  // mala llega con uno u otro código. Para él es una sola cosa.
  ['auth/wrong-password', MENSAJE_CLAVE_INCORRECTA],
  ['auth/invalid-credential', MENSAJE_CLAVE_INCORRECTA],
  ['auth/invalid-login-credentials', MENSAJE_CLAVE_INCORRECTA],
  ['auth/user-not-found', MENSAJE_CLAVE_INCORRECTA],
  ['auth/network-request-failed', MENSAJE_SIN_CONEXION],
  ['auth/timeout', MENSAJE_SIN_CONEXION],
  // Código propio: Firebase ni siquiera se pudo descargar. Pide recargar, no
  // "intentar de nuevo". Ver MENSAJE_RECARGAR y cargarFirebaseDeDinero.
  ['dinero/sin-conexion', MENSAJE_RECARGAR],
  ['auth/too-many-requests', 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.'],
  ['auth/user-disabled', 'La cuenta del área de dinero está deshabilitada.'],
  ['auth/missing-password', 'Escribe la contraseña del área de dinero.'],
  // El correo de esta cuenta es una constante del sistema: él solo teclea la
  // contraseña. Si este código llegara sería un error de configuración que él
  // no puede arreglar, y "ese correo no es válido" lo mandaría a buscar un
  // campo que no ve. Cae en la frase de respaldo, como cualquier otro.
  ['auth/invalid-email', MENSAJE_GENERICO],
]);

/**
 * Convierte el código de un error en la frase que se le muestra al dueño.
 * Nunca devuelve el código ni el texto crudo de Firebase: un código que no
 * conocemos, o algo que ni siquiera es texto, cae en la frase de respaldo.
 */
export function mensajeDeErrorDeDinero(codigo) {
  return MENSAJES.get(codigo) ?? MENSAJE_GENERICO;
}

// ---------------------------------------------------------------------------
// Una carga que se reintenta (la lección de firebase-config.js)
// ---------------------------------------------------------------------------

/**
 * Envuelve una carga costosa para que se haga una sola vez, pero SOLO si salió
 * bien. Dos llamadas seguidas comparten el mismo intento; si el intento falla,
 * se olvida, y la siguiente llamada vuelve a intentar desde cero.
 *
 * `obtener.olvidar()` descarta también un intento que sí salió bien, para
 * obligar a cargar de nuevo (al cerrar el área).
 *
 * Esto limpia lo que guardamos NOSOTROS. No puede limpiar la caché de módulos
 * del navegador: un import() fallido se vuelve a fallar al instante, así que
 * para esa carga en particular reintentar no recupera nada hasta recargar la
 * página (ver MENSAJE_RECARGAR).
 */
export function unaVezConReintento(cargar) {
  let listo = null;

  function obtener() {
    if (listo) return listo;
    // `async () => cargar()` convierte un fallo instantáneo (un throw antes de
    // cualquier espera) en una promesa rechazada normal. Así `listo` ya tiene
    // asignada la promesa cuando se corre el reinicio de abajo, que siempre es
    // en un turno posterior; si el reinicio estuviera dentro de la misma
    // función que se ejecuta, un fallo inmediato borraría `listo` ANTES de
    // asignarlo, y la promesa rechazada se quedaría guardada para siempre.
    const intento = (async () => cargar())();
    listo = intento;
    intento.catch(() => {
      // El `if` evita que un intento viejo, que falla tarde, borre uno más
      // nuevo que se pidió después de olvidar().
      if (listo === intento) listo = null;
    });
    return intento;
  }

  obtener.olvidar = () => { listo = null; };
  return obtener;
}

// ---------------------------------------------------------------------------
// La instancia secundaria
// ---------------------------------------------------------------------------

/**
 * Arma la app 'dinero' con su propio Auth y su propio Firestore. Recibe los
 * módulos de Firebase ya descargados, para poder probarla con unos de mentira.
 */
export function armarInstanciaDeDinero({ appMod, authMod, fsMod }) {
  // El segundo argumento es lo que la hace otra app. Sin él, sería la app por
  // defecto: la misma del mostrador.
  const app = appMod.initializeApp(CONFIG, NOMBRE_APP);
  // initializeAuth(app, ...) y NO getAuth(app): getAuth crea el Auth con la
  // persistencia normal, y esta sesión tiene que vivir solo en memoria.
  const auth = authMod.initializeAuth(app, { persistence: authMod.inMemoryPersistence });
  // Después del Auth, no antes: así el Auth de esta app ya existe, con su
  // persistencia en memoria, cuando Firestore se arma y le pide el suyo.
  const db = fsMod.getFirestore(app);
  return { app, auth, db, appMod, authMod, fsMod };
}

/**
 * Baja Firebase de la misma versión que usa el mostrador y arma la instancia.
 * `importar` es el import() dinámico; se recibe para poder probar sin red.
 */
export async function cargarFirebaseDeDinero(importar = (url) => import(url)) {
  let modulos;
  try {
    const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
    const [appMod, authMod, fsMod] = await Promise.all([
      importar(`${base}/firebase-app.js`),
      importar(`${base}/firebase-auth.js`),
      importar(`${base}/firebase-firestore.js`),
    ]);
    modulos = { appMod, authMod, fsMod };
  } catch (causa) {
    // Un import() que falla lanza un TypeError sin código. Se le pone el código
    // propio para que el dueño lea la frase que le dice que recargue, y no la
    // de respaldo. Reintentar el mismo import() no sirve: el navegador ya
    // recordó el fallo (ver MENSAJE_RECARGAR).
    throw Object.assign(new Error('No se pudo descargar Firebase.', { cause: causa }), {
      code: 'dinero/sin-conexion',
    });
  }
  return armarInstanciaDeDinero(modulos);
}

// ---------------------------------------------------------------------------
// Entrar, salir y quién está adentro
// ---------------------------------------------------------------------------

/**
 * Crea una sesión de dinero. `cargar` entrega la instancia (ver
 * cargarFirebaseDeDinero); se recibe para poder probar sin Firebase.
 */
export function crearSesionDeDinero(cargar) {
  const obtener = unaVezConReintento(cargar);
  // La instancia con alguien adentro. Hasta que la contraseña no sirva, esto
  // sigue en null aunque Firebase ya esté descargado: sin credencial no se
  // entrega la base de datos.
  let dentro = null;

  // Entrar y salir van de uno en uno, en el orden en que se pidieron. Sin esto:
  // - entrar mientras se está cerrando armaría la app nueva con la vieja a
  //   medio borrar, y Firebase (mismo nombre) devolvería la vieja;
  // - salir mientras se está entrando no encontraría nada que cerrar, y el
  //   área quedaría abierta sin que él lo sepa cuando terminara de entrar.
  // Un fallo no se guarda en la cola: el siguiente pedido corre normal.
  let cola = Promise.resolve();
  function enOrden(tarea) {
    const resultado = cola.then(tarea);
    cola = resultado.catch(() => {});
    return resultado;
  }

  /** El uid de quien está adentro, o null. Se lee del Auth: no puede mentir. */
  function sesionDeDinero() {
    return dentro?.auth?.currentUser?.uid ?? null;
  }

  /** La base de datos autenticada como dinero, o null si no hay sesión. */
  function dbDeDinero() {
    return sesionDeDinero() ? dentro.db : null;
  }

  /** Entra con la segunda credencial. Devuelve el uid; si falla, lanza un Error con la frase en español. */
  function entrarADinero(correo, clave) {
    return enOrden(async () => {
      try {
        const instancia = await obtener();
        const credencial = await instancia.authMod.signInWithEmailAndPassword(instancia.auth, correo, clave);
        dentro = instancia;
        return credencial.user.uid;
      } catch (error) {
        // El error crudo de Firebase queda en `cause` para quien depure; lo
        // que se muestra es solo `message`, que es la frase en español.
        throw new Error(mensajeDeErrorDeDinero(error?.code), { cause: error });
      }
    });
  }

  /**
   * Cierra la sesión y desecha la app. Sin haber entrado, no hace nada (y no
   * baja Firebase solo para cerrar). Si cerrar la sesión falla, NO finge que se
   * cerró: sigue marcando que hay sesión y avisa, porque mentir aquí dejaría el
   * área abierta sin que él lo sepa.
   */
  function salirDeDinero() {
    return enOrden(async () => {
      if (!dentro) return;
      const instancia = dentro;
      try {
        await instancia.authMod.signOut(instancia.auth);
      } catch (error) {
        throw new Error(MENSAJE_NO_SE_CERRO, { cause: error });
      }
      // Desde aquí la sesión ya está cerrada, pase lo que pase con el borrado.
      dentro = null;
      obtener.olvidar();
      try {
        // Borrar la app, además de cerrar la sesión: así lo que Firestore
        // guardó en memoria no queda al alcance de nadie. Si esto falla, la
        // sesión igual ya está cerrada: no se le avisa de un error que no le
        // cambia nada, y la próxima entrada arma una instancia nueva.
        await instancia.appMod.deleteApp(instancia.app);
      } catch {
        // Ver arriba.
      }
    });
  }

  return { entrarADinero, salirDeDinero, sesionDeDinero, dbDeDinero };
}

// La sesión única del sistema: la que usan las pantallas del área de dinero.
// Esta es la única línea que une todo lo de arriba con el Firebase de verdad, y
// tiene que LLAMAR a la carga (con paréntesis): `() => cargarFirebaseDeDinero`
// entregaría la función en vez de la instancia, no entraría nadie, y como falla
// cerrado nadie lo notaría. La cubren las pruebas de "La línea que conecta...".
const sesion = crearSesionDeDinero(() => cargarFirebaseDeDinero());

export const { entrarADinero, salirDeDinero, sesionDeDinero, dbDeDinero } = sesion;
