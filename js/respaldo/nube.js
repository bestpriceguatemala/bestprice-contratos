// Lo que el respaldo lee de la nube, y dónde anota cuándo se bajó.
//
// Dos reglas que este sistema aprendió a golpes y que aquí valen más que en ningún otro lado:
//
// 1. UN RESPALDO NO SE ARMA CON UNA COPIA VIEJA, NI A MEDIAS. Las pantallas sirven primero la copia de esta
//    computadora y la nube después, y eso está bien para mirar; para un respaldo es el peor error posible, porque el
//    archivo parecería completo. Todo se lee de la NUBE, y si cualquier lectura falla —contratos, clientes, carros,
//    pagos a dueños, o el costo de un dueño— no se arma nada y se dice cuál.
// 2. EL COSTO DEL DUEÑO VIVE TRAS LA SEGUNDA CONTRASEÑA (ADR-002: «cualquier pantalla futura que necesite ese costo
//    tendrá que pedir la credencial de dinero»). El archivo lleva ese costo (SUBARR. COSTO X DIA) y si cada renta ya
//    se le pagó al dueño, así que la pantalla del respaldo cuelga de `#/dinero` y esto se niega sin esa sesión.
//
// La fecha del último respaldo vive en `ajustes/respaldo` (Firestore), no en esta computadora: es un hecho del negocio,
// no del navegador. Si viviera en el navegador, bajarlo en la computadora de la casa no callaría el aviso de la oficina,
// y vaciar el historial del navegador lo haría volver. Las reglas de Firestore ya dejan leer y escribir `ajustes` con la
// sesión normal.
import { iniciarFirebase } from '../firebase-config.js';
import { dbDeDinero } from '../dinero-sesion.js';
import { cargarContratosParaDinero, cargarPagosDueno } from '../datos.js';
import { rangoDelAnio } from '../nucleo/respaldo.js';
import { ErrorDeRespaldo } from './mapa.js';

/** Leer 2,000 clientes puede tardar más que una pantalla cualquiera, y es una vez al año. */
const LIMITE_MS = 30000;

export const MENSAJE_SIN_DINERO = 'Primero entra al área de dinero: el respaldo lleva lo que le pagas a cada dueño de carro, y eso solo se lee con la segunda contraseña.';

const conLimite = (promesa, ms = LIMITE_MS) => new Promise((ok, mal) => {
  const reloj = setTimeout(() => mal(new Error('La nube no respondió a tiempo.')), ms);
  promesa.then((v) => { clearTimeout(reloj); ok(v); }, (e) => { clearTimeout(reloj); mal(e); });
});

/** Toda una colección de la NUBE, con el id de cada documento. Lanza si no se pudo leer. */
async function leerColeccion(nombre, iniciar) {
  const { db, fsMod } = await iniciar();
  const instantanea = await conLimite(fsMod.getDocs(fsMod.collection(db, nombre)));
  return instantanea.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Lo que se le dice para volver a intentar: el botón sigue ahí, y recargar es lo último. */
const COMO_REINTENTAR = 'Revisa tu internet y vuelve a apretar el botón; si sigue igual, recarga la página.';

/** «los clientes», «los clientes y los carros», «los clientes, los carros y los pagos a dueños». */
function enLista(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/**
 * Todo lo que el respaldo de ese año necesita, leído de la nube: `{ clientes, vehiculos, contratos, pagosDueno }`.
 * Los contratos son los de ese año (por `fechaSalida`) y traen el costo del dueño ya puesto en `subarriendo.costoDia`.
 *
 * LANZA `ErrorDeRespaldo` con una frase para el dueño si falta la sesión de dinero o si CUALQUIER lectura falló, y la
 * frase dice CUÁL (o cuáles) y cómo volver a intentar. Un respaldo que se baja con una lectura caída es la peor falla
 * posible de esta pantalla: el archivo abre, las fórmulas calculan, todo se ve bien, y le faltan los clientes — y nadie
 * audita un archivo que abre. Por eso no se entrega NADA: ni un archivo parcial, ni uno con una hoja vacía, ni uno con una
 * nota adentro. Se esperan todas las lecturas (no solo la primera que falle) para decir todas las que fallaron.
 */
export async function leerDatosDelRespaldo(anio, {
  iniciar = iniciarFirebase, dbDinero = dbDeDinero, cargarContratos = cargarContratosParaDinero, cargarPagos = cargarPagosDueno,
} = {}) {
  if (!dbDinero()) throw new ErrorDeRespaldo(MENSAJE_SIN_DINERO);

  const lecturas = [
    ['los contratos', () => cargarContratos(rangoDelAnio(anio), undefined, { iniciar, dbDinero })],
    ['los pagos a los dueños de carros', () => cargarPagos({ iniciar, dbDinero })],
    ['los clientes', () => leerColeccion('clientes', iniciar)],
    ['los carros de la flota', () => leerColeccion('vehiculos', iniciar)],
  ];
  const resultados = await Promise.allSettled(lecturas.map(([, leer]) => leer()));
  const [contratos, pagos, clientes, vehiculos] = resultados.map((r) => (r.status === 'fulfilled' ? r.value : null));

  // Una lectura puede fallar de dos maneras: lanzando, o devolviendo `fallo: true` (las pantallas sirven la copia de esta
  // computadora en ese caso, y para un respaldo esa copia podría estar atrasada). Las dos son lo mismo aquí.
  const cayeron = new Set();
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`El respaldo no pudo leer ${lecturas[i][0]} de la nube:`, r.reason);
      cayeron.add(i);
    }
  });
  if (contratos && (contratos.fallo || !Array.isArray(contratos.datos))) cayeron.add(0);
  if (pagos && (pagos.fallo || !Array.isArray(pagos.datos))) cayeron.add(1);
  // En el orden en que se leen, no en el orden en que se descubrió el fallo: el mensaje sale igual cada vez.
  const fallaron = lecturas.filter((_, i) => cayeron.has(i)).map(([que]) => que);
  const sinCosto = contratos && !cayeron.has(0) ? (contratos.costoSinLeer?.length ?? 0) : 0;
  if (sinCosto) fallaron.push(`el costo del dueño de ${sinCosto} renta${sinCosto === 1 ? '' : 's'}`);

  if (fallaron.length) {
    const unicas = [...new Set(fallaron)];
    // «no se pudo leer el costo…» (una sola cosa, en singular) / «no se pudieron leer los clientes y los carros…» (todo lo demás).
    const verbo = unicas.length === 1 && unicas[0].startsWith('el costo') ? 'no se pudo leer' : 'no se pudieron leer';
    throw new ErrorDeRespaldo(
      `No se bajó nada: ${verbo} ${enLista(unicas)} de la nube, y sin eso el archivo quedaría incompleto aunque pareciera completo. ${COMO_REINTENTAR}`,
    );
  }
  return { clientes, vehiculos, contratos: contratos.datos, pagosDueno: pagos.datos };
}

// ---------- cuándo se bajó ----------

/**
 * Cuándo se bajó el respaldo de cada año: `{ porAnio: { '2026': '2026-10-12' }, fallo }`. Si no se pudo leer, `fallo` es
 * `true` y `porAnio` vacío: quien llama NO debe tomar eso por «nunca se bajó» para alarmar, ni por «está al día» para callar.
 */
export async function leerRegistroDeRespaldos({ iniciar = iniciarFirebase } = {}) {
  try {
    const { db, fsMod } = await iniciar();
    const doc = await conLimite(fsMod.getDoc(fsMod.doc(db, 'ajustes', 'respaldo')), 8000);
    return { porAnio: doc.exists() ? (doc.data().porAnio ?? {}) : {}, fallo: false };
  } catch {
    return { porAnio: {}, fallo: true };
  }
}

/**
 * Anota que el respaldo de ese año se bajó hoy. `merge: true` para no pisar los otros años. Se llama DESPUÉS de entregarle el
 * archivo al navegador, nunca antes: si la anotación fallara, lo peor es que el aviso vuelva a salir; si se anotara un
 * respaldo que no llegó a bajarse, el aviso callaría un año con el dueño creyendo que lo tiene.
 */
export async function anotarRespaldo(anio, hoy, { iniciar = iniciarFirebase } = {}) {
  const { db, fsMod } = await iniciar();
  await conLimite(fsMod.setDoc(fsMod.doc(db, 'ajustes', 'respaldo'), { porAnio: { [anio]: hoy } }, { merge: true }), 8000);
}
