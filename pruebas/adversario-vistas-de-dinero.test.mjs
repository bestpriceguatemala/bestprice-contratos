// Recorrido ADVERSARIO sobre `armarVista` (pantallas/dinero.js), la función que decide a quién se le debe
// y cuánto. 27 de noviembre de 2026.
//
// La forma de encontrar esto fue comparar a los dos gemelos: `armarVistaDeComisiones` (comisiones.js) hace
// las MISMAS dos cosas y las hace distinto. Donde no coinciden, uno de los dos está mal, y en los dos
// casos el que está mal es el de dinero.
//
// Las tres pruebas están ROJAS a propósito: son los hallazgos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { armarVista } from '../js/pantallas/dinero.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { construirCierre } from '../js/nucleo/cierre.js';
import { contratoParaGuardar } from '../js/datos.js';

const HOY = '2026-11-26';

/** Una renta de carro AJENO ya cerrada, armada por las mismas funciones que arman las de verdad. */
function rentaAjena({ id, duenoId = null, dueno = '' }) {
  const salida = construirContrato({
    id,
    numero: 100,
    cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' },
    ajeno: true,
    carro: null,
    carroAjeno: { placas: `P-${id}`, tipo: 'Sedán', marca: 'Kia', color: 'Gris', modelo: '2020', dueno, costoDia: 100 },
    duenoId,
    fechaSalida: '2026-10-01',
    dias: 2,
    precioDia: 300,
    empleadoEscogido: null,
  });
  const cerrada = { ...salida, cierre: construirCierre(salida, { fechaReal: '2026-10-03', kmEntrada: 10 }, HOY).cierre };
  return { ...contratoParaGuardar(cerrada, { ahora: 1790000000000 }), id, duenoId };
}

const lectura = (contratos, duenos) => ({
  contratos: { datos: contratos, fallo: false, costoSinLeer: [] },
  pagos: { datos: [], fallo: false },
  duenos,
});

// ===================================================================================================
// 1. Con la lectura de dueños CAÍDA, a todos se les cuelga «No está en la lista de dueños»
// ===================================================================================================

// ===================================================================================================
// TRES HALLAZGOS QUE ESPERAN UNA DECISIÓN DE ÉL — NO SON FALLOS SIN ATENDER
// ===================================================================================================
// Los tres son reales y están reproducidos. Quedan en SALTADAS, no en rojo, porque arreglarlos no es una
// corrección obvia: cada uno pide que él escoja, y ninguno se puede decidir desde el código.
//
// 1 y 2. ¿Se marca «no está en la lista de dueños» cuando la lectura de dueños FALLÓ?
//    Las dos pantallas de dinero hacen lo CONTRARIO a propósito, y cada una lo explica en su comentario:
//    comisiones NO lo marca («decir "no está en la lista" de alguien que sí está sería inventar un
//    problema»); dueños SÍ lo marca («o que no se pudo leer»). Alguien escribió lo opuesto en cada
//    pantalla y las dos se defienden. Lo que cuesta dejarlo como está: con el internet malo, él lee «No
//    está en la lista de dueños» en TODAS las cuentas, y el riesgo es que vuelva a dar de alta dueños que
//    ya existen — que es justo como se parte en dos la cuenta de un dueño.
//
// 3. La clave con la que se abre la ficha de una cuenta sin dueño anotado.
//    `armarVista` la rearma desde el NOMBRE que se muestra, y dos cuentas distintas pueden quedar con la
//    misma: la segunda no se puede abrir ni pagar nunca, y lo que se registre desde esa dirección se le
//    aplica a las rentas de la primera. El arreglo es usar la clave del grupo (como ya hace comisiones),
//    pero eso CAMBIA la dirección de toda cuenta sin dueño y pone en rojo 71 pruebas. Se dispara solo si
//    alguien escribe un dueño llamado exactamente «Sin dueño anotado».
//
// Cuando él decida, se les quita el `skip` y se arreglan. (27 de noviembre de 2026.)
// ===================================================================================================

test('ADVERSARIO: con la lectura de dueños caída NO se puede afirmar que un dueño no está en la lista', { skip: 'Espera una decisión de él: ver la cabecera de este archivo.' }, () => {
  // `sinRegistro: Boolean(g.duenoId && !registro)`. Si la lectura de dueños falló, `registros` queda vacío
  // y TODA cuenta enlazada sale marcada. Su gemela de comisiones lo tiene resuelto desde siempre y dice
  // por qué en su propio comentario: «Solo se afirma si la lista se LEYÓ: con la lectura fallida no se
  // sabe, y decir "no está en la lista" de alguien que sí está sería inventar un problema»
  // (`sinRegistro: Boolean(g.empleadoId && !registro && !falloEmpleados)`).
  //
  // Lo que cuesta: con el internet malo él abre Dinero y lee «No está en la lista de dueños» en TODAS las
  // cuentas. La regla de esta casa es la contraria y está escrita por todo el sistema: una lectura que
  // falló no se dice «no hay». El riesgo de verdad es que vuelva a dar de alta a dueños que ya existen,
  // que es justo cómo se parte en dos la cuenta de un dueño.
  const v = armarVista(lectura([rentaAjena({ id: 'c1', duenoId: 'd1', dueno: 'Don Mario' })], { datos: [], fallo: true }));
  assert.equal(v.ok, true);
  assert.equal(v.falloDuenos, true, 'la pantalla sabe que la lectura falló');
  for (const e of v.entradas) {
    assert.equal(e.sinRegistro, false,
      `${e.nombre}: con los dueños sin leer no se sabe si tiene ficha, así que no se afirma que no la tiene`);
  }
});

test('ADVERSARIO: sin la llave «duenos» se marca el problema Y no se avisa de la lectura: lo peor de los dos', { skip: 'Espera una decisión de él: ver la cabecera de este archivo.' }, () => {
  // Es la misma entrada que mide la prueba nueva «armarVista: una lectura SIN la llave de dueños no
  // revienta la pantalla», que solo afirma `ok === true` y pasa de largo por esto: `falloDuenos` sale
  // `false` —así que la barra roja que explicaría todo NO se dibuja— y al mismo tiempo cada cuenta
  // enlazada sale con la etiqueta «No está en la lista de dueños». Se afirma un problema y se esconde el
  // motivo.
  const v = armarVista(lectura([rentaAjena({ id: 'c1', duenoId: 'd1', dueno: 'Don Mario' })], undefined));
  assert.equal(v.ok, true);
  const marcadas = v.entradas.filter((e) => e.sinRegistro).map((e) => e.nombre);
  assert.deepEqual(marcadas, [],
    `sin lista de dueños no se afirma que a nadie le falta su ficha (se marcó: ${marcadas.join(', ')})`);
});

// ===================================================================================================
// 2. Dos cuentas distintas pueden quedar con LA MISMA clave, y la segunda se vuelve inalcanzable
// ===================================================================================================

test('ADVERSARIO: dos cuentas nunca pueden compartir la clave con la que se abre su ficha', { skip: 'Espera una decisión de él: ver la cabecera de este archivo.' }, () => {
  // `agruparPorDueno` (nucleo/liquidacion.js) ya arma una clave ÚNICA por grupo y explica por qué le pone
  // prefijo: «Cada clave lleva su prefijo para que un texto que casualmente se parezca a un id no se junte
  // con el dueño enlazado». `armarVista` la tira (`.map(({ clave, ...entrada }) => entrada)` del núcleo) y
  // la vuelve a armar desde el NOMBRE que se va a mostrar: `claveDeEntrada({ duenoId, nombre })`. Dos
  // grupos distintos con el mismo nombre visible quedan con la misma clave. Su gemela de comisiones usa
  // `clave: g.clave`, la del grupo, y no tiene el problema.
  //
  // Lo que cuesta: la clave es la DIRECCIÓN de la ficha (`rutaDeCuenta`) y `pintarCuentaDeDueno` abre la
  // cuenta con `vista.entradas.find((e) => e.clave === claveActual)`, que devuelve siempre la PRIMERA. La
  // segunda cuenta no se puede abrir nunca —ni pagar—, y lo que se registre desde esa dirección se le
  // aplica a las rentas de la primera.
  const v = armarVista(lectura([
    // Un dueño escrito a mano con el mismo texto que el sistema usa cuando no hay ninguno...
    rentaAjena({ id: 'c1', dueno: 'Sin dueño anotado' }),
    // ...y una renta ajena a la que de verdad no se le anotó dueño.
    rentaAjena({ id: 'c2', dueno: '' }),
  ], { datos: [], fallo: false }));
  assert.equal(v.ok, true);
  assert.equal(v.entradas.length, 2, 'son dos cuentas distintas: dos grupos de `agruparPorDueno`');
  const claves = v.entradas.map((e) => e.clave);
  assert.equal(new Set(claves).size, claves.length,
    `dos cuentas con la misma dirección: solo se puede abrir la primera (${JSON.stringify(claves)})`);
});
