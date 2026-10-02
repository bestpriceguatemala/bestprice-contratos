// Pruebas de la segunda credencial del área de dinero (§11 del diseño).
//
// No hay Firebase en el entorno de pruebas, así que aquí se prueba lo que sí se
// puede probar sin red: la frase que lee el dueño cuando algo sale mal, que un
// fallo de conexión al teclear la contraseña no deja el área cerrada, y que la
// instancia se arma con el nombre 'dinero' — que es lo que la aísla del
// mostrador. Lo que necesita a Firebase de verdad (que entrar aquí no cierre la
// sesión del mostrador) se verificó aparte, en el navegador, y queda dicho en
// el reporte de la tarea.
//
// Una cosa que estas pruebas NO pueden afirmar, y que una versión anterior sí
// afirmaba por error: que después de que Firebase no se descargue, el siguiente
// intento lo baje. El navegador recuerda que un import() falló y lo vuelve a
// fallar al instante; lo único que lo limpia es recargar la página. Por eso esa
// falla se prueba como lo que realmente hace: pedir que recarguen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as modulo from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  NOMBRE_APP,
  SDK_VERSION,
  MENSAJE_CLAVE_INCORRECTA,
  MENSAJE_SIN_CONEXION,
  MENSAJE_RECARGAR,
  MENSAJE_GENERICO,
  mensajeDeErrorDeDinero,
  unaVezConReintento,
  armarInstanciaDeDinero,
  cargarFirebaseDeDinero,
  crearSesionDeDinero,
  entrarADinero,
  salirDeDinero,
  sesionDeDinero,
  dbDeDinero,
} from '../js/dinero-sesion.js';
import { CONFIG, SDK } from '../js/firebase-config.js';

// ---------------------------------------------------------------------------
// Lo que lee el dueño
// ---------------------------------------------------------------------------

test('la contraseña incorrecta dice exactamente lo que el dueño necesita leer', () => {
  assert.equal(MENSAJE_CLAVE_INCORRECTA, 'Esa contraseña no abre el área de dinero.');
  // Firebase manda distinto código según la versión y según si el correo
  // existe; para él es una sola cosa: la contraseña no sirve.
  for (const codigo of [
    'auth/wrong-password',
    'auth/invalid-credential',
    'auth/invalid-login-credentials',
    'auth/user-not-found',
  ]) {
    assert.equal(mensajeDeErrorDeDinero(codigo), MENSAJE_CLAVE_INCORRECTA, codigo);
  }
});

test('sin conexión dice otra cosa que "contraseña incorrecta": son dos acciones distintas', () => {
  assert.equal(MENSAJE_SIN_CONEXION, 'No se pudo conectar. Revisa tu internet e intenta de nuevo.');
  assert.equal(mensajeDeErrorDeDinero('auth/network-request-failed'), MENSAJE_SIN_CONEXION);
  assert.equal(mensajeDeErrorDeDinero('auth/timeout'), MENSAJE_SIN_CONEXION);
  // Decirle "contraseña incorrecta" cuando el problema es el wifi lo haría
  // escribir cien veces una contraseña que estaba bien.
  assert.notEqual(MENSAJE_SIN_CONEXION, MENSAJE_CLAVE_INCORRECTA);
});

test('que Firebase no se descargue pide recargar la página: "intenta de nuevo" no sirve ahí', () => {
  // El código propio con el que se marca que Firebase ni siquiera se pudo
  // descargar. A diferencia de una red caída al teclear la contraseña, aquí
  // volver a intentar no recupera nada: el navegador recuerda que ese import()
  // falló y lo vuelve a fallar al instante, con o sin internet. Lo único que
  // funciona es recargar, y la frase tiene que decirle eso.
  assert.equal(mensajeDeErrorDeDinero('dinero/sin-conexion'), MENSAJE_RECARGAR);
  assert.match(MENSAJE_RECARGAR, /Recarga la página/);
  assert.notEqual(MENSAJE_RECARGAR, MENSAJE_SIN_CONEXION);
  assert.notEqual(MENSAJE_RECARGAR, MENSAJE_CLAVE_INCORRECTA);
  assert.notEqual(MENSAJE_RECARGAR, MENSAJE_GENERICO);
});

test('demasiados intentos, cuenta deshabilitada y contraseña vacía tienen su propia frase', () => {
  assert.equal(
    mensajeDeErrorDeDinero('auth/too-many-requests'),
    'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.',
  );
  assert.equal(
    mensajeDeErrorDeDinero('auth/user-disabled'),
    'La cuenta del área de dinero está deshabilitada.',
  );
  assert.equal(
    mensajeDeErrorDeDinero('auth/missing-password'),
    'Escribe la contraseña del área de dinero.',
  );
});

test('un correo inválido cae en la frase de respaldo: el correo es una constante, él solo teclea la contraseña', () => {
  // "Ese correo no es válido" lo mandaría a buscar un campo que no ve.
  assert.equal(mensajeDeErrorDeDinero('auth/invalid-email'), MENSAJE_GENERICO);
});

test('un código que no conocemos cae en una frase sensata, nunca en el código', () => {
  const desconocido = mensajeDeErrorDeDinero('auth/algo-que-firebase-invento-manana');
  assert.equal(desconocido, MENSAJE_GENERICO);
  assert.ok(!desconocido.includes('auth/'));
  assert.ok(!desconocido.includes('invento'));
  // La frase de respaldo no acusa a la contraseña ni al internet: no sabemos
  // cuál de los dos es, y decir uno en falso lo mandaría por el camino errado.
  assert.notEqual(desconocido, MENSAJE_CLAVE_INCORRECTA);
  assert.notEqual(desconocido, MENSAJE_SIN_CONEXION);
});

test('sin código (undefined, null, vacío, algo que no es texto) también cae en la frase de respaldo', () => {
  for (const raro of [undefined, null, '', 42, {}, ['auth/wrong-password']]) {
    assert.equal(mensajeDeErrorDeDinero(raro), MENSAJE_GENERICO, String(raro));
  }
});

test('ninguna frase que se le muestra al dueño lleva un código o la palabra Firebase', () => {
  const codigos = [
    'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials',
    'auth/user-not-found', 'auth/network-request-failed', 'auth/timeout', 'dinero/sin-conexion',
    'auth/too-many-requests', 'auth/user-disabled', 'auth/missing-password', 'auth/invalid-email',
    'auth/internal-error', 'auth/operation-not-allowed', 'auth/invalid-api-key', 'auth/lo-que-sea',
    undefined,
  ];
  for (const codigo of codigos) {
    const frase = mensajeDeErrorDeDinero(codigo);
    assert.ok(!/auth\/|dinero\/|firebase/i.test(frase), `${codigo} -> ${frase}`);
    assert.ok(frase.endsWith('.'), `${codigo} -> ${frase}`);
  }
});

// ---------------------------------------------------------------------------
// La lección de firebase-config.js: un fallo de conexión no puede quedar guardado
// ---------------------------------------------------------------------------

test('unaVezConReintento: dos llamadas seguidas comparten un solo intento', async () => {
  let intentos = 0;
  const obtener = unaVezConReintento(async () => { intentos++; return { ok: true }; });
  const [a, b] = await Promise.all([obtener(), obtener()]);
  assert.equal(a, b);
  assert.equal(intentos, 1);
  await obtener();
  assert.equal(intentos, 1, 'una vez que salió bien, no se vuelve a cargar');
});

test('unaVezConReintento: si el primer intento falla, el siguiente vuelve a intentar', async () => {
  // El error real que se corrigió en firebase-config.js: el fallo quedaba
  // guardado, y cada intento posterior devolvía ese mismo fallo aunque el
  // internet ya hubiera vuelto.
  let intentos = 0;
  const obtener = unaVezConReintento(async () => {
    intentos++;
    if (intentos === 1) throw new Error('se cayó la red');
    return { ok: true };
  });
  await assert.rejects(obtener(), /se cayó la red/);
  const segundo = await obtener();
  assert.deepEqual(segundo, { ok: true });
  assert.equal(intentos, 2, 'el segundo intento tuvo que ejecutar la carga otra vez');
});

test('unaVezConReintento: también reintenta si la carga falla al instante, sin esperar nada', async () => {
  // Trampa distinta a la de arriba: si el reinicio se hace dentro de la misma
  // función que se está ejecutando, un fallo inmediato borra `listo` ANTES de
  // que se le asigne la promesa, y esa promesa rechazada se queda guardada.
  let intentos = 0;
  const obtener = unaVezConReintento(() => {
    intentos++;
    if (intentos === 1) throw new Error('falló al instante');
    return { ok: true };
  });
  await assert.rejects(obtener(), /falló al instante/);
  assert.deepEqual(await obtener(), { ok: true });
  assert.equal(intentos, 2);
});

test('unaVezConReintento: fallar muchas veces seguidas nunca deja de reintentar', async () => {
  let intentos = 0;
  const obtener = unaVezConReintento(async () => {
    intentos++;
    if (intentos < 6) throw new Error('sin internet');
    return 'listo';
  });
  for (let i = 0; i < 5; i++) await assert.rejects(obtener(), /sin internet/);
  assert.equal(await obtener(), 'listo');
  assert.equal(intentos, 6);
});

test('unaVezConReintento: olvidar() obliga a cargar de nuevo aunque haya salido bien', async () => {
  let intentos = 0;
  const obtener = unaVezConReintento(async () => ({ n: ++intentos }));
  const primera = await obtener();
  obtener.olvidar();
  const segunda = await obtener();
  assert.notEqual(primera, segunda);
  assert.equal(intentos, 2);
});

// ---------------------------------------------------------------------------
// La instancia secundaria: es lo que aísla el área de dinero del mostrador
// ---------------------------------------------------------------------------

/** Firebase de mentira: anota cómo lo llaman, para probar CÓMO se arma la instancia. */
function modulosFalsos() {
  const llamadas = [];
  const app = { name: 'dinero-falsa' };
  const auth = { currentUser: null };
  const db = { tipo: 'firestore-falso' };
  const persistencia = { tipo: 'en-memoria' };
  return {
    llamadas, app, auth, db, persistencia,
    appMod: {
      initializeApp: (...args) => { llamadas.push(['initializeApp', ...args]); return app; },
      deleteApp: async (...args) => { llamadas.push(['deleteApp', ...args]); },
    },
    authMod: {
      inMemoryPersistence: persistencia,
      initializeAuth: (...args) => { llamadas.push(['initializeAuth', ...args]); return auth; },
      // getAuth(app) sobre la app por defecto sería justo el error: le devolvería
      // la sesión del mostrador. Si el módulo lo llama, la prueba lo ve.
      getAuth: (...args) => { llamadas.push(['getAuth', ...args]); return { currentUser: 'del-mostrador' }; },
    },
    fsMod: {
      getFirestore: (...args) => { llamadas.push(['getFirestore', ...args]); return db; },
    },
  };
}

test('la instancia se crea con el nombre "dinero", nunca como la app por defecto', () => {
  const f = modulosFalsos();
  const instancia = armarInstanciaDeDinero(f);
  assert.equal(NOMBRE_APP, 'dinero');
  const inicio = f.llamadas.find((l) => l[0] === 'initializeApp');
  assert.equal(inicio[1], CONFIG, 'usa la misma configuración del proyecto');
  assert.equal(inicio[2], 'dinero', 'sin el segundo argumento sería la app del mostrador');
  assert.equal(instancia.app, f.app);
  assert.equal(instancia.db, f.db);
  assert.equal(instancia.auth, f.auth);
});

test('el Auth y el Firestore son de la app "dinero", no los de la sesión normal', () => {
  const f = modulosFalsos();
  armarInstanciaDeDinero(f);
  const auth = f.llamadas.find((l) => l[0] === 'initializeAuth');
  assert.equal(auth[1], f.app);
  const fs = f.llamadas.find((l) => l[0] === 'getFirestore');
  assert.equal(fs[1], f.app);
  assert.ok(!f.llamadas.some((l) => l[0] === 'getAuth'), 'getAuth() devolvería la sesión del mostrador');
});

test('la sesión de dinero vive solo en memoria: recargar la página vuelve a cerrar el área', () => {
  // Con la persistencia normal, la sesión de dinero sobreviviría a cerrar el
  // navegador y el área quedaría abierta para el siguiente que se siente en el
  // mostrador. En memoria, se cierra sola al recargar.
  const f = modulosFalsos();
  armarInstanciaDeDinero(f);
  const auth = f.llamadas.find((l) => l[0] === 'initializeAuth');
  assert.equal(auth[2].persistence, f.persistencia);
});

test('la versión de Firebase es una sola, la del mostrador', () => {
  // Qué protege esto: el área de dinero solo se abre con la sesión del mostrador
  // ya iniciada, que ya descargó estos mismos URL. El navegador los tiene en su
  // caché de módulos, así que el import() de dinero-sesion.js no depende del
  // internet. Con otra versión tendría que descargar por su cuenta, y una
  // descarga fallida no se recupera sin recargar (ver la prueba de arriba).
  // No es que una versión distinta rompa algo por sí sola; es que dejaría
  // alcanzable un fallo que hoy no lo es. Por eso la versión sale de
  // firebase-config.js y no se repite: el acoplamiento es real, no un texto.
  assert.equal(SDK_VERSION, SDK);
});

test('cargarFirebaseDeDinero baja los tres módulos de la versión correcta y arma la instancia', async () => {
  const f = modulosFalsos();
  const pedidos = [];
  const importar = async (url) => {
    pedidos.push(url);
    if (url.endsWith('firebase-app.js')) return f.appMod;
    if (url.endsWith('firebase-auth.js')) return f.authMod;
    if (url.endsWith('firebase-firestore.js')) return f.fsMod;
    throw new Error(`no se esperaba ${url}`);
  };
  const instancia = await cargarFirebaseDeDinero(importar);
  assert.equal(pedidos.length, 3);
  for (const url of pedidos) {
    // SDK, la que exporta firebase-config.js, y no SDK_VERSION: lo que importa es
    // que el URL pedido sea el que ya descargó el mostrador.
    assert.ok(url.startsWith(`https://www.gstatic.com/firebasejs/${SDK}/`), url);
  }
  assert.deepEqual(
    pedidos.map((url) => url.split('/').pop()).sort(),
    ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'],
  );
  assert.equal(instancia.app, f.app);
  assert.equal(instancia.authMod, f.authMod);
  assert.equal(instancia.fsMod, f.fsMod);
  assert.equal(instancia.appMod, f.appMod);
});

test('si Firebase no se puede descargar, el error trae el código propio y la frase de recargar, no la de un TypeError', async () => {
  // Un import() que falla lanza un TypeError sin código. Sin marcarlo, caería
  // en la frase de respaldo y el dueño no sabría que lo que sirve es recargar.
  const falla = new TypeError('Failed to fetch dynamically imported module');
  const importar = async () => { throw falla; };
  const error = await cargarFirebaseDeDinero(importar).catch((e) => e);
  assert.equal(error.code, 'dinero/sin-conexion');
  assert.equal(mensajeDeErrorDeDinero(error.code), MENSAJE_RECARGAR);
  assert.equal(error.cause, falla, 'el fallo original queda a mano para depurar');
});

// ---------------------------------------------------------------------------
// entrar, salir y quién está adentro
// ---------------------------------------------------------------------------

/**
 * Una "instancia de Firebase" completa pero falsa, con una contraseña buena.
 * `auth.currentUser` se comporta como el real: se llena al entrar y se vacía al salir.
 */
function instanciaFalsa({ claveBuena = 'la-buena', uid = 'uid-de-dinero', alSalir } = {}) {
  const llamadas = [];
  const auth = { currentUser: null };
  const db = { tipo: 'firestore-de-dinero' };
  const app = { name: 'dinero' };
  return {
    llamadas, auth, db, app,
    appMod: { deleteApp: async (a) => { llamadas.push(['deleteApp', a]); await alSalir?.(); } },
    fsMod: {},
    authMod: {
      async signInWithEmailAndPassword(a, correo, clave) {
        llamadas.push(['signIn', a, correo, clave]);
        if (clave !== claveBuena) {
          throw Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), { code: 'auth/invalid-credential' });
        }
        a.currentUser = { uid };
        return { user: a.currentUser };
      },
      async signOut(a) { llamadas.push(['signOut', a]); a.currentUser = null; },
    },
  };
}

test('antes de entrar no hay sesión de dinero ni base de datos de dinero', () => {
  assert.equal(sesionDeDinero(), null);
  assert.equal(dbDeDinero(), null);
});

test('salirDeDinero sin haber entrado no falla ni intenta bajar Firebase', async () => {
  // Con el módulo real y sin Firebase disponible (como aquí), si salir
  // intentara cargarlo para poder cerrar, fallaría por nada.
  await salirDeDinero();
  assert.equal(sesionDeDinero(), null);
  assert.equal(dbDeDinero(), null);

  let cargas = 0;
  const s = crearSesionDeDinero(async () => { cargas++; return instanciaFalsa(); });
  await s.salirDeDinero();
  assert.equal(cargas, 0);
});

test('entrar con la contraseña buena abre la sesión y entrega el uid y la base de datos', async () => {
  const inst = instanciaFalsa();
  const s = crearSesionDeDinero(async () => inst);
  const uid = await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  assert.equal(uid, 'uid-de-dinero');
  assert.equal(s.sesionDeDinero(), 'uid-de-dinero');
  assert.equal(s.dbDeDinero(), inst.db);
  const [, auth, correo, clave] = inst.llamadas.find((l) => l[0] === 'signIn');
  assert.equal(auth, inst.auth, 'se entra por el Auth de la app de dinero');
  assert.equal(correo, 'dinero@ejemplo.com');
  assert.equal(clave, 'la-buena');
});

test('salirDeDinero devuelve la sesión y la base de datos a null, y desecha la instancia', async () => {
  const inst = instanciaFalsa();
  const s = crearSesionDeDinero(async () => inst);
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  assert.ok(s.sesionDeDinero());
  await s.salirDeDinero();
  assert.equal(s.sesionDeDinero(), null);
  assert.equal(s.dbDeDinero(), null);
  assert.ok(inst.llamadas.some((l) => l[0] === 'signOut'));
  // Además de cerrar la sesión, se borra la app: así lo que Firestore guardó en
  // memoria no queda al alcance de nadie después de cerrar el área.
  assert.ok(inst.llamadas.some((l) => l[0] === 'deleteApp' && l[1] === inst.app));
});

test('con la contraseña equivocada lanza la frase en español y la sesión sigue cerrada', async () => {
  const inst = instanciaFalsa();
  const s = crearSesionDeDinero(async () => inst);
  const error = await s.entrarADinero('dinero@ejemplo.com', 'la-mala').catch((e) => e);
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'Esa contraseña no abre el área de dinero.');
  assert.ok(!error.message.includes('auth/'));
  assert.ok(!error.message.includes('Firebase'));
  assert.equal(s.sesionDeDinero(), null);
  assert.equal(s.dbDeDinero(), null, 'sin credencial no se entrega la base de datos');
});

test('sin internet al abrir: dice que recargue, y seguir intentando sin recargar no entra ni miente', async () => {
  // Lo que pasa en el navegador: tras un import() fallido, pedir el mismo URL de
  // nuevo falla al instante. Esta prueba lo representa con una carga que SIEMPRE
  // falla, y no afirma que el siguiente intento vaya a entrar, porque con Chrome
  // no entra. Lo que sí tiene que cumplir el módulo: decir cada vez lo único que
  // funciona (recargar), no dejar la sesión abierta, y no quedarse con el fallo
  // guardado en sus propias variables (la lección de firebase-config.js): cada
  // intento vuelve a pedir la carga, así que en un navegador que sí reintente
  // funcionaría, y en uno que no, falla igual de claro.
  let intentos = 0;
  const s = crearSesionDeDinero(async () => {
    intentos++;
    throw Object.assign(new Error('no se descargó'), { code: 'dinero/sin-conexion' });
  });
  for (let i = 0; i < 3; i++) {
    const error = await s.entrarADinero('dinero@ejemplo.com', 'la-buena').catch((e) => e);
    assert.equal(error.message, MENSAJE_RECARGAR);
    assert.equal(s.sesionDeDinero(), null);
    assert.equal(s.dbDeDinero(), null);
  }
  assert.equal(intentos, 3);
});

test('la red se cae varias veces seguidas al teclear la contraseña y aun así el intento siguiente vuelve a probar', async () => {
  // Esta sí se recupera: cada intento de entrar es una petición nueva, no un
  // import() que el navegador recuerde (se comprobó con el SDK real).
  const inst = instanciaFalsa();
  const original = inst.authMod.signInWithEmailAndPassword;
  let caidas = 0;
  inst.authMod.signInWithEmailAndPassword = async (...args) => {
    if (caidas < 4) {
      caidas++;
      throw Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), { code: 'auth/network-request-failed' });
    }
    return original(...args);
  };
  const s = crearSesionDeDinero(async () => inst);
  for (let i = 0; i < 4; i++) {
    const e = await s.entrarADinero('dinero@ejemplo.com', 'la-buena').catch((err) => err);
    assert.equal(e.message, MENSAJE_SIN_CONEXION);
  }
  assert.equal(await s.entrarADinero('dinero@ejemplo.com', 'la-buena'), 'uid-de-dinero');
});

test('si la red se cae justo al teclear la contraseña, dice "sin conexión" y reintentar no recarga Firebase', async () => {
  const inst = instanciaFalsa();
  let cargas = 0;
  let cae = true;
  const original = inst.authMod.signInWithEmailAndPassword;
  inst.authMod.signInWithEmailAndPassword = async (...args) => {
    if (cae) throw Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), { code: 'auth/network-request-failed' });
    return original(...args);
  };
  const s = crearSesionDeDinero(async () => { cargas++; return inst; });

  const primero = await s.entrarADinero('dinero@ejemplo.com', 'la-buena').catch((e) => e);
  assert.equal(primero.message, MENSAJE_SIN_CONEXION);
  assert.notEqual(primero.message, MENSAJE_CLAVE_INCORRECTA);

  cae = false;
  assert.equal(await s.entrarADinero('dinero@ejemplo.com', 'la-buena'), 'uid-de-dinero');
  assert.equal(cargas, 1, 'Firebase ya estaba cargado; no hay por qué bajarlo otra vez');
});

test('un error inesperado al armar la instancia cae en la frase de respaldo, no en el texto del error', async () => {
  const s = crearSesionDeDinero(async () => { throw new Error('Cannot read properties of undefined (reading x)'); });
  const error = await s.entrarADinero('dinero@ejemplo.com', 'la-buena').catch((e) => e);
  assert.equal(error.message, MENSAJE_GENERICO);
});

test('cualquier código que devuelva Firebase al entrar sale traducido, aunque sea uno nuevo', async () => {
  for (const code of ['auth/too-many-requests', 'auth/user-disabled', 'auth/internal-error', 'auth/uno-nuevo']) {
    const inst = instanciaFalsa();
    inst.authMod.signInWithEmailAndPassword = async () => {
      throw Object.assign(new Error(`Firebase: Error (${code}).`), { code });
    };
    const s = crearSesionDeDinero(async () => inst);
    const error = await s.entrarADinero('dinero@ejemplo.com', 'x').catch((e) => e);
    assert.equal(error.message, mensajeDeErrorDeDinero(code));
    assert.ok(!/auth\/|firebase/i.test(error.message), error.message);
  }
});

test('después de salir, volver a entrar arma una instancia nueva', async () => {
  let cargas = 0;
  const instancias = [];
  const s = crearSesionDeDinero(async () => {
    cargas++;
    const inst = instanciaFalsa();
    instancias.push(inst);
    return inst;
  });
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  await s.salirDeDinero();
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  assert.equal(cargas, 2);
  assert.notEqual(instancias[0].db, instancias[1].db);
  assert.equal(s.dbDeDinero(), instancias[1].db);
});

test('si cerrar la sesión falla, no finge que se cerró: sigue marcando que hay sesión y avisa', async () => {
  const inst = instanciaFalsa();
  const s = crearSesionDeDinero(async () => inst);
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  inst.authMod.signOut = async () => { throw new Error('algo raro de Firebase'); };
  const error = await s.salirDeDinero().catch((e) => e);
  assert.equal(error.message, 'No se pudo cerrar el área de dinero. Recarga la página para cerrarla.');
  assert.equal(s.sesionDeDinero(), 'uid-de-dinero', 'mentir aquí dejaría el área abierta sin que él lo sepa');
});

test('entrar mientras se está cerrando espera a que termine de cerrar', async () => {
  // Si la app vieja todavía se está borrando cuando se arma la nueva, Firebase
  // devuelve la vieja (mismo nombre) y el dinero queda sin instancia.
  let soltar;
  const espera = new Promise((r) => { soltar = r; });
  const eventos = [];
  const primera = instanciaFalsa({ alSalir: () => espera });
  const s = crearSesionDeDinero(async () => {
    eventos.push('armar');
    return eventos.length === 1 ? primera : instanciaFalsa();
  });
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  const cerrando = s.salirDeDinero();
  const entrando = s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(eventos.length, 1, 'no se arma la nueva mientras la vieja se borra');
  soltar();
  await cerrando;
  await entrando;
  assert.equal(eventos.length, 2);
  assert.equal(s.sesionDeDinero(), 'uid-de-dinero');
});

// ---------------------------------------------------------------------------
// Lo que se agregó al escribir el módulo: huecos que las pruebas de arriba no
// cubrían (el módulo no existía cuando se escribieron)
// ---------------------------------------------------------------------------

test('un "código" que es un nombre heredado de los objetos (constructor, toString) no se cuela como mensaje', () => {
  // Si alguien cambia la tabla de mensajes de Map a objeto, estos devolverían
  // una función en vez de una frase.
  for (const raro of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.equal(mensajeDeErrorDeDinero(raro), MENSAJE_GENERICO, raro);
  }
});

test('la instancia crea el Auth de memoria ANTES que Firestore', () => {
  // Firestore toma el Auth de su app al armarse. Con el Auth ya creado y en
  // memoria, nadie crea uno con la persistencia normal por el camino.
  const f = modulosFalsos();
  armarInstanciaDeDinero(f);
  const nombres = f.llamadas.map((l) => l[0]);
  assert.ok(nombres.indexOf('initializeAuth') < nombres.indexOf('getFirestore'), nombres.join(', '));
});

test('el archivo no toca la app del mostrador: ni iniciarFirebase ni getAuth', async () => {
  // Las pruebas con Firebase de mentira ven cómo se arma la instancia, no si
  // otra ruta del archivo va por la app por defecto. Esta mira el código (sin
  // comentarios, que sí explican por qué): de firebase-config.js solo se toman
  // datos (CONFIG y SDK), nunca iniciarFirebase(), que levantaría la app del
  // mostrador, y su Auth no es el de dinero.
  const texto = await readFile(new URL('../js/dinero-sesion.js', import.meta.url), 'utf8');
  const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/iniciarFirebase/.test(codigo), 'usa iniciarFirebase');
  assert.ok(!/getAuth\s*\(/.test(codigo), 'usa getAuth');
  const imports = [...codigo.matchAll(/^import .*$/gm)].map((m) => m[0]);
  assert.deepEqual(imports, ["import { CONFIG, SDK } from './firebase-config.js';"]);
});

test('con la contraseña equivocada el mensaje es en español pero el error de Firebase queda en `cause` para depurar', async () => {
  const s = crearSesionDeDinero(async () => instanciaFalsa());
  const error = await s.entrarADinero('dinero@ejemplo.com', 'la-mala').catch((e) => e);
  assert.equal(error.message, MENSAJE_CLAVE_INCORRECTA);
  assert.equal(error.cause.code, 'auth/invalid-credential');
});

test('si Firebase cierra la sesión por su cuenta, ya no hay sesión ni base de datos de dinero', async () => {
  // Pasa, por ejemplo, si la cuenta se deshabilita o se vence la credencial.
  // La sesión se lee del Auth y no de una variable propia: no puede seguir
  // diciendo que hay alguien adentro cuando Firebase ya lo sacó.
  const inst = instanciaFalsa();
  const s = crearSesionDeDinero(async () => inst);
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  assert.ok(s.dbDeDinero());
  inst.auth.currentUser = null;
  assert.equal(s.sesionDeDinero(), null);
  assert.equal(s.dbDeDinero(), null);
  // Y cerrar el área sigue limpiando la instancia aunque ya no hubiera usuario.
  await s.salirDeDinero();
  assert.ok(inst.llamadas.some((l) => l[0] === 'deleteApp'));
});

test('salir mientras se está entrando: el área no se queda abierta cuando termina de entrar', async () => {
  // Escribe la contraseña, aprieta Entrar y se sale de la pantalla antes de
  // que Firebase conteste. Sin orden, salir no encontraría nada que cerrar, y
  // el área quedaría abierta sin que él lo sepa en cuanto contestara.
  const inst = instanciaFalsa();
  let soltar;
  const espera = new Promise((r) => { soltar = r; });
  const original = inst.authMod.signInWithEmailAndPassword;
  inst.authMod.signInWithEmailAndPassword = async (...args) => { await espera; return original(...args); };
  const s = crearSesionDeDinero(async () => inst);

  const entrando = s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  const saliendo = s.salirDeDinero();
  soltar();
  await entrando;
  await saliendo;

  assert.equal(s.sesionDeDinero(), null);
  assert.equal(s.dbDeDinero(), null);
  assert.ok(inst.llamadas.some((l) => l[0] === 'signOut'), 'tuvo que cerrar la sesión que acababa de abrirse');
});

test('si borrar la app falla, la sesión igual queda cerrada y salir no avisa de un error que no le cambia nada', async () => {
  const primera = instanciaFalsa();
  primera.appMod.deleteApp = async () => { throw new Error('no se pudo borrar'); };
  let cargas = 0;
  const s = crearSesionDeDinero(async () => (++cargas === 1 ? primera : instanciaFalsa()));
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  await s.salirDeDinero();
  assert.equal(s.sesionDeDinero(), null);
  assert.equal(s.dbDeDinero(), null);
  // Y no queda trabado: la siguiente entrada arma una instancia nueva.
  assert.equal(await s.entrarADinero('dinero@ejemplo.com', 'la-buena'), 'uid-de-dinero');
  assert.equal(cargas, 2);
});

test('un salir que falló no deja trabada la cola: reintentar cuando ya funciona cierra de verdad', async () => {
  const inst = instanciaFalsa();
  const s = crearSesionDeDinero(async () => inst);
  await s.entrarADinero('dinero@ejemplo.com', 'la-buena');
  const signOutBueno = inst.authMod.signOut;
  inst.authMod.signOut = async () => { throw new Error('se cayó'); };
  await assert.rejects(s.salirDeDinero(), /No se pudo cerrar el área de dinero/);
  assert.ok(s.sesionDeDinero());

  inst.authMod.signOut = signOutBueno;
  await s.salirDeDinero();
  assert.equal(s.sesionDeDinero(), null);
  assert.equal(s.dbDeDinero(), null);
});

// ---------------------------------------------------------------------------
// La línea que conecta lo anterior con el Firebase de verdad
// ---------------------------------------------------------------------------
//
// Todo lo de arriba prueba crearSesionDeDinero con una carga inyectada. Lo único
// que no veía ninguna prueba es la línea del final de dinero-sesion.js que arma
// la sesión REAL y exporta sus funciones: sin los paréntesis,
// `() => cargarFirebaseDeDinero` entrega la función en vez de la instancia, no
// entra nadie, el área queda cerrada y nada lo notaba (falla cerrado, justo por
// eso nadie se enteraría). Se prueba sin red porque Node no importa por https.

// Si algún día Node importara por https por su cuenta, estas pruebas saldrían a
// internet de verdad: mejor saltarlas que ir a Firebase con credenciales falsas.
const NODE_IMPORTA_POR_HTTPS = [...process.execArgv, process.env.NODE_OPTIONS ?? '']
  .join(' ').includes('network-imports');

test('las funciones que exporta el módulo van conectadas a la carga real de Firebase', {
  skip: NODE_IMPORTA_POR_HTTPS && 'este Node importa por https: la prueba saldría a la red',
}, async () => {
  // Aquí no hay Firebase, y el import() real de Node falla en el acto
  // (ERR_UNSUPPORTED_ESM_URL_SCHEME). Si la línea está bien conectada, ese fallo
  // llega hasta el dueño como la frase de recargar. Si está mal conectada, llega
  // otra cosa (un TypeError que cae en la frase de respaldo).
  for (let intento = 1; intento <= 2; intento++) {
    const error = await entrarADinero('prueba@ejemplo.invalid', 'no-es-una-clave').catch((e) => e);
    assert.equal(error.message, MENSAJE_RECARGAR, `intento ${intento}`);
    assert.equal(error.cause.code, 'dinero/sin-conexion');
    assert.equal(sesionDeDinero(), null);
    assert.equal(dbDeDinero(), null);
  }
  await salirDeDinero(); // sin haber entrado: no hace nada y no falla
  const directo = await cargarFirebaseDeDinero().catch((e) => e);
  assert.equal(directo.code, 'dinero/sin-conexion', 'el import() por defecto es el real');
});

test('de punta a punta con el Firebase de mentira servido por los URL reales: entrar, estar adentro y salir', {
  skip: (NODE_IMPORTA_POR_HTTPS && 'este Node importa por https: la prueba saldría a la red')
    || (typeof modulo.registerHooks !== 'function' && 'este Node no tiene module.registerHooks'),
}, async () => {
  // Se engancha la carga de módulos para que los tres URL de gstatic respondan
  // con Firebase de mentira. Así corren de verdad el import() por defecto, los
  // URL con la versión de SDK, la sesión única y las cuatro funciones exportadas:
  // lo que ninguna prueba con carga inyectada puede ver. Las llamadas a Firebase
  // se anotan en `f.llamadas`.
  const f = modulosFalsos();
  f.authMod.signInWithEmailAndPassword = async (a, correo, clave) => {
    f.llamadas.push(['signIn', a, correo, clave]);
    a.currentUser = { uid: 'uid-de-dinero' };
    return { user: a.currentUser };
  };
  f.authMod.signOut = async (a) => { f.llamadas.push(['signOut', a]); a.currentUser = null; };
  globalThis.__firebaseFalso = { ...f.appMod, ...f.authMod, ...f.fsMod, inMemoryPersistence: f.persistencia };

  const delega = (nombres) => nombres.map((n) => `export const ${n} = (...a) => globalThis.__firebaseFalso.${n}(...a);`).join('\n');
  const fuentes = {
    'firebase-app.js': delega(['initializeApp', 'deleteApp']),
    'firebase-auth.js': `${delega(['initializeAuth', 'signInWithEmailAndPassword', 'signOut'])}\nexport const inMemoryPersistence = globalThis.__firebaseFalso.inMemoryPersistence;`,
    'firebase-firestore.js': delega(['getFirestore']),
  };
  const base = `https://www.gstatic.com/firebasejs/${SDK}/`;
  const pedidos = [];
  const enganche = modulo.registerHooks({
    resolve: (especificador, contexto, siguiente) => (
      especificador.startsWith(base) ? { url: especificador, shortCircuit: true } : siguiente(especificador, contexto)
    ),
    load: (url, contexto, siguiente) => {
      if (!url.startsWith(base)) return siguiente(url, contexto);
      pedidos.push(url.slice(base.length));
      return { format: 'module', source: fuentes[url.slice(base.length)], shortCircuit: true };
    },
  });
  try {
    assert.equal(sesionDeDinero(), null);
    const uid = await entrarADinero('dinero@ejemplo.com', 'la-buena');
    assert.equal(uid, 'uid-de-dinero');
    // Las cuatro funciones exportadas hablan de la misma sesión.
    assert.equal(sesionDeDinero(), 'uid-de-dinero');
    assert.equal(dbDeDinero(), f.db);
    assert.deepEqual([...pedidos].sort(), ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']);
    // La app es la 'dinero', con su Auth en memoria: nada de la app del mostrador.
    const inicio = f.llamadas.find((l) => l[0] === 'initializeApp');
    assert.equal(inicio[1], CONFIG);
    assert.equal(inicio[2], 'dinero');
    assert.equal(f.llamadas.find((l) => l[0] === 'initializeAuth')[2].persistence, f.persistencia);
    assert.ok(!f.llamadas.some((l) => l[0] === 'getAuth'));

    await salirDeDinero();
    assert.equal(sesionDeDinero(), null);
    assert.equal(dbDeDinero(), null);
    assert.ok(f.llamadas.some((l) => l[0] === 'signOut'));
    assert.ok(f.llamadas.some((l) => l[0] === 'deleteApp' && l[1] === f.app));
  } finally {
    await salirDeDinero().catch(() => {}); // que ninguna otra prueba herede una sesión
    enganche.deregister();
    delete globalThis.__firebaseFalso;
  }
});
