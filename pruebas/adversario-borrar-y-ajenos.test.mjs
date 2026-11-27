// Recorrido ADVERSARIO sobre lo nuevo de los commits 7e91abc..73a934b (27 de noviembre de 2026):
// «Borrar carro», los carros ajenos ya usados y el selector de carro de la flota de «Sacar carro».
//
// Todas las pruebas de este archivo están ROJAS a propósito: cada una es un hallazgo sin arreglar.
// Ninguna afirma nada que no se pueda ver corriéndola.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pintarSacarCarro } from '../js/pantallas/sacarCarro.js';
import { pantallaDeMentira } from './fixtures/pantallaDeMentira.mjs';
import { EMPLEADOS } from './fixtures/rentasConComision.mjs';

// ---------------------------------------------------------------------------------------------------
// El montaje de «Sacar carro», igual que el de sacarCarro.test.mjs, con una diferencia: aquí las
// lecturas GUARDAN su aviso, para poder hacer que la nube conteste DESPUÉS, como contesta de verdad
// (`cargarConSincronia` devuelve la copia local de una vez y avisa cuando la nube llega).
// ---------------------------------------------------------------------------------------------------

const HOY = '2026-11-26';
const LECTURA_OK = (datos) => ({ datos, fallo: false });
const esperar = () => new Promise((ok) => { setTimeout(ok, 0); });

const CLIENTES = [
  { id: 'k1', nombres: 'Juan', apellidos: 'Pérez', documento: '2345 67890 0101', licencia: 'L-445566', telefono: '5555-0000' },
];
const CARRO_PROPIO = {
  id: 'v1', codigo: 'A-07', placas: 'P-123ABC', tipo: 'Sedán', marca: 'Toyota', linea: 'Yaris', color: 'Blanco', modelo: '2021',
};
const OTRO_CARRO = {
  id: 'v2', codigo: 'A-08', placas: 'P-999ZZZ', tipo: 'Pickup', marca: 'Ford', linea: 'Ranger', color: 'Gris', modelo: '2022',
};

/** Una lista de sesión de mentira, con la misma forma que `crearListaDeSesion`. */
function listaDeMentira(items = []) {
  const altas = [];
  let alCambiar = null;
  let leida = false;
  return {
    estado: () => ({ items: [...items, ...altas], altas: [...altas], fallo: false, leida }),
    escuchar(fn) { alCambiar = fn; },
    registrarAlta(ficha) { altas.push(ficha); },
    olvidar() { leida = false; },
    async leer() { leida = true; if (alCambiar) alCambiar(); },
  };
}

async function pantallaDeSacar({ ruta = '', flota = [CARRO_PROPIO, OTRO_CARRO], contratos = [], duenos = [] } = {}) {
  const p = pantallaDeMentira();
  const guardados = [];
  const dichos = [];
  let avisarDeLaFlota = null;
  let avisarDeLosContratos = null;
  let n = 0;

  await pintarSacarCarro(p.contenedor, ruta, {
    doc: p.documento,
    rutaDeAhora: () => `#/sacar/${ruta}`,
    ahora: () => HOY,
    avisar: (texto, tipo) => dichos.push({ texto, tipo }),
    traerFlota: async (alLlegar) => { avisarDeLaFlota = alLlegar; const r = LECTURA_OK(flota); alLlegar(r); return r; },
    traerContratos: async (alLlegar) => { avisarDeLosContratos = alLlegar; const r = LECTURA_OK(contratos); alLlegar(r); return r; },
    traerReservas: async (alLlegar) => { const r = LECTURA_OK([]); alLlegar(r); return r; },
    traerAjustes: async () => ({ porcentajeTarjeta: 12 }),
    traerEmpleados: async () => LECTURA_OK(Object.values(EMPLEADOS).filter((e) => e.porcentajeComision > 0)),
    listaClientes: listaDeMentira(CLIENTES),
    listaDuenos: listaDeMentira(duenos),
    guardarElContrato: async (contrato, extra) => { guardados.push({ contrato, extra }); return { ...contrato, numero: 41 }; },
    guardarElCliente: async (c) => c,
    guardarElDueno: async (d) => d,
    acunarIdDeContrato: async () => `ct-${++n}`,
    acunarIdDeCliente: async () => 'k-nuevo',
    acunarIdDeDuenoNuevo: async () => 'd-nuevo',
    acunarNumeroDeContrato: async () => 41,
    irAlImprimir: () => {},
  });

  return {
    ...p,
    guardados,
    dichos,
    /** La nube contesta DESPUÉS, con una flota distinta: es lo que pasa cuando otra computadora cambió algo. */
    laFlotaCambia(nueva) { avisarDeLaFlota(LECTURA_OK(nueva)); },
    /** Lo mismo con los contratos: la copia local se dibujó y la nube llega después con uno más. */
    losContratosCambian(nuevos) { avisarDeLosContratos(LECTURA_OK(nuevos)); },
  };
}

/** Llena lo mínimo para poder guardar: cliente de alta aquí mismo, empleado, días y precio. */
async function listaParaGuardar(opciones = {}) {
  const p = await pantallaDeSacar(opciones);
  p.clic('#sc-cliente-nuevo');
  for (const [id, valor] of [
    ['sc-nc-nombres', 'Juan'], ['sc-nc-apellidos', 'Pérez'],
    ['sc-nc-documento', '2345 67890 0101'], ['sc-nc-licencia', 'L-445566'], ['sc-nc-telefono', '5555-0000'],
  ]) p.buscar(`#${id}`).value = valor;
  p.clic('#sc-cliente-guardar');
  await esperar();
  p.teclear('#sc-empleado-buscar', EMPLEADOS.ana.nombre);
  p.tecla('#sc-empleado-buscar', 'Enter');
  p.buscar('#sc-dias').value = '3';
  p.buscar('#sc-precio-dia').value = '350';
  return p;
}

// ===================================================================================================
// HALLAZGO 1: el menú de ajenos ya usados ofrece al DUEÑO y no lo pone en el contrato
// ===================================================================================================

/**
 * Escoge la primera opción de un menú, leyendo su valor del HTML dibujado en vez de suponerlo. Las dos
 * pruebas de abajo fijaban `'0'`, que era el número de orden; desde el 27 de noviembre de 2026 el valor es
 * la placa, justo para que la opción no cambie de carro cuando la lista se rearma. La PROPIEDAD que miden
 * sigue igual; lo que no puede quedar fijo es cómo se numeran las opciones.
 */
function escogerLaPrimera(p, idDelMenu) {
  const opciones = [...String(p.buscar(`#${idDelMenu}`).innerHTML).matchAll(/value="([^"]*)"/g)]
    .map((m) => m[1])
    .filter(Boolean);
  if (!opciones.length) throw new Error(`El menú «${idDelMenu}» no trae ninguna opción escogible`);
  p.lanzar('change', `#${idDelMenu}`, { value: opciones[0] });
  return opciones[0];
}

test('ADVERSARIO: escoger un ajeno YA USADO también tiene que traer a su DUEÑO, no solo el carro', async () => {
  // El renglón del menú dice «P-555EEE · Mazda · 2019 · (Don Beto)», así que quien lo escoge da por hecho
  // que el dueño vino con el carro. `carrosAjenosUsados` se toma el trabajo de devolver `dueno` y
  // `duenoId` —y una prueba suya los exige—, pero el manejador de `sc-ajeno-usados` los tira: solo copia
  // placas, tipo, marca, color y modelo.
  //
  // Lo que cuesta: el contrato se guarda con `duenoId: null` y `carroAjeno.dueno: ''`. En «Qué se le debe
  // a cada dueño» (`agruparPorDueno`, nucleo/liquidacion.js) la clave de ese contrato es `texto:` —la
  // MISMA para todo subarrendado sin dueño—, así que lo que se le debe a Don Beto cae en una sola cuenta
  // sin nombre, revuelto con lo de cualquier otro dueño. El dinero del subarriendo deja de tener a quién.
  const antes = {
    id: 'c-viejo', fechaSalida: '2026-09-10', duenoId: 'd-beto',
    carroAjeno: { placas: 'P-555EEE', tipo: 'Pickup', marca: 'Mazda', color: 'Azul', modelo: '2019', dueno: 'Don Beto' },
  };
  const p = await listaParaGuardar({ contratos: [antes], duenos: [{ id: 'd-beto', nombre: 'Don Beto' }] });
  p.marcar('#sc-ajeno');
  escogerLaPrimera(p, 'sc-ajeno-usados');
  assert.equal(p.buscar('#sc-ajeno-placas').value, 'P-555EEE', 'el carro sí se rellenó: la prueba no pasa por no haber apretado');

  p.lanzar('submit', '#sc-form');
  await esperar();
  assert.equal(p.guardados.length, 1, `se guardó un contrato (dichos: ${JSON.stringify(p.dichos)})`);
  const c = p.guardados[0].contrato;
  assert.equal(c.carroAjeno.dueno, 'Don Beto', 'el nombre del dueño que el menú ofreció');
  assert.equal(c.duenoId, 'd-beto', 'y su id, que es lo que junta su cuenta en la liquidación');
});

// ===================================================================================================
// HALLAZGO 2: el carro escogido se va al taller mientras él llena el formulario, y el contrato sale igual
// ===================================================================================================

test('ADVERSARIO: si el carro escogido pasa a FUERA DE SERVICIO, el contrato no puede salir con él', async () => {
  // El selector filtra los carros fuera de servicio («Lo que está en el taller no se puede rentar»), pero
  // `carroEscogidoId` se queda con el id viejo: cuando la nube contesta con el carro ya en el taller,
  // `ponerOpciones` le borra la selección al menú —en pantalla dice «— Escoge el carro —»— y
  // `carroPropio()` lo sigue encontrando, porque sigue en la flota. Ni `refrescarCarro` ni
  // `motivoParaNoGuardar` miran `fueraDeServicio`.
  //
  // Lo que cuesta: el menú muestra que no hay carro escogido y el contrato se guarda igual con el carro
  // que otra computadora acaba de mandar al taller. El cliente firma por un carro descompuesto.
  const p = await listaParaGuardar();
  p.lanzar('change', '#sc-carro-escoger', { value: 'v2' });
  assert.equal(p.buscar('#sc-carro-escoger').value, 'v2', 'quedó escogido');

  p.laFlotaCambia([CARRO_PROPIO, { ...OTRO_CARRO, fueraDeServicio: true, motivoFueraDeServicio: 'Frenos' }]);
  assert.equal(p.buscar('#sc-carro-escoger').value, '', 'el menú ya no lo muestra escogido: el carro no se ofrece');

  p.lanzar('submit', '#sc-form');
  await esperar();
  assert.deepEqual(p.guardados.map((g) => g.contrato.carroId), [],
    'no puede salir un contrato con el carro del taller');
});

test('ADVERSARIO: el cuadro del carro tiene que decir que el carro escogido está en el TALLER', async () => {
  // Lo mismo, visto desde lo que él LEE: `refrescarCarro` dibuja placas, marca y línea igual que siempre,
  // sin una palabra del taller ni del motivo. `estadoCarro` (nucleo/estados.js) ya sabe decirlo.
  const p = await pantallaDeSacar();
  p.lanzar('change', '#sc-carro-escoger', { value: 'v2' });
  p.laFlotaCambia([CARRO_PROPIO, { ...OTRO_CARRO, fueraDeServicio: true, motivoFueraDeServicio: 'Frenos' }]);
  const caja = p.buscar('#sc-carro-info');
  assert.match(String(caja.innerHTML ?? ''), /fuera de servicio|taller|Frenos/i,
    `el cuadro del carro no dice nada del taller: ${JSON.stringify(caja.innerHTML)}`);
});

// ===================================================================================================
// HALLAZGO 3: la opción del ajeno usado vale por su NÚMERO DE ORDEN, y el orden cambia solo
// ===================================================================================================

test('ADVERSARIO: la opción escogida de los ajenos usados tiene que seguir apuntando AL MISMO carro', async () => {
  // Las opciones valen '0', '1', '2'…: el número de orden dentro de `carrosAjenosUsados`, que ordena por
  // fecha de salida. Cuando la nube contesta con un subarriendo más nuevo y la lista se rearma, el '0' que
  // quedó escogido pasa a ser OTRO carro —`ponerOpciones` lo conserva porque '0' sigue siendo una opción
  // válida—, así que el menú señala un carro y los campos tienen otro. Con las placas como valor de la
  // opción esto no podría pasar.
  const viejo = {
    id: 'c1', fechaSalida: '2026-09-10', duenoId: 'd-beto',
    carroAjeno: { placas: 'P-555EEE', tipo: 'Pickup', marca: 'Mazda', color: 'Azul', modelo: '2019', dueno: 'Don Beto' },
  };
  const nuevo = {
    id: 'c2', fechaSalida: '2026-11-20', duenoId: 'd-mila',
    carroAjeno: { placas: 'P-777GGG', tipo: 'Sedán', marca: 'Kia', color: 'Rojo', modelo: '2023', dueno: 'Doña Mila' },
  };
  const p = await pantallaDeSacar({ contratos: [viejo] });
  p.marcar('#sc-ajeno');
  const primera = escogerLaPrimera(p, 'sc-ajeno-usados');
  assert.equal(p.buscar('#sc-ajeno-placas').value, 'P-555EEE', 'escogió el Mazda de Don Beto');

  // La nube contesta con un subarriendo más nuevo, y la lista se rearma en la siguiente vuelta.
  p.losContratosCambian([viejo, nuevo]);
  p.marcar('#sc-ajeno', false);
  p.marcar('#sc-ajeno', true);

  const escogida = p.buscar('#sc-ajeno-usados').value;
  assert.equal(escogida, primera, 'el menú sigue mostrando la misma opción escogida');
  // Y esa opción tiene que seguir siendo el carro que está en los campos: si al escogerla otra vez se
  // rellena con otras placas, el menú está mintiendo sobre qué carro está escogido.
  p.lanzar('change', '#sc-ajeno-usados', { value: escogida });
  assert.equal(p.buscar('#sc-ajeno-placas').value, 'P-555EEE',
    'la opción que sigue marcada apunta ahora a otro carro: el valor de la opción no puede ser el número de orden');
});

// ===================================================================================================
// HALLAZGO 4: la ficha del carro borra con los contratos de la COPIA LOCAL, no con los de la nube
// ===================================================================================================

test('ADVERSARIO: el aviso de «Borrar carro» no puede armarse con los contratos de la primera lectura', () => {
  // Esta prueba mide el TEXTO del archivo y lo dice de frente, porque la ficha del carro no se puede
  // apretar desde node: `dibujarFormulario` no se exporta y `el()` usa el `document` global.
  //
  // El fallo: `dibujarFormulario(contenedor, carroId, flota, contratos, hoy, falloFlota, { falloContratos })`
  // recibe los contratos POR VALOR. `cargarConSincronia` (datos.js) devuelve la copia local de una vez y
  // avisa cuando la nube llega, y ese aviso (`alLlegarTarde`) solo se le pasa a `mantenimiento.actualizar`:
  // ni `contratos` ni `falloContratos` de la ficha se vuelven a tocar nunca. `prepararElBorrado` lee esas
  // dos variables.
  //
  // Lo que cuesta, con la copia local de ayer: `loQueSePierdeAlBorrarElCarro` no ve el contrato que otra
  // computadora abrió hoy, así que el aviso NO dice «OJO: este carro está AFUERA ahora mismo» ni «Tiene N
  // contratos», y `textoDeLoQueNoSePudoLeer` tampoco avisa si la que falló fue la lectura de la nube. Él
  // borra creyendo que no se pierde nada: desaparece de la flota un carro que está con un cliente, se va
  // el kilometraje de todas sus rentas, y el contrato abierto queda apuntando a un carro que ya no existe
  // (`estadoCarro` nunca lo vuelve a mostrar y nadie persigue la devolución).
  const fuente = readFileSync(new URL('../js/pantallas/carros.js', import.meta.url), 'utf8');
  const alLlegarTarde = fuente.slice(fuente.indexOf('alLlegarTarde((nuevos) => {'));
  const cuerpo = alLlegarTarde.slice(0, alLlegarTarde.indexOf('});') + 3);
  assert.ok(cuerpo.includes('alLlegarTarde'), 'la prueba tiene que estar leyendo el manejador de verdad');
  assert.match(cuerpo, /contratos = nuevos\.contratos/,
    `cuando la nube contesta tarde, la ficha tiene que quedarse con ESOS contratos (hoy solo se los pasa al `
    + `bloque de mantenimiento):\n${cuerpo}`);
  assert.match(cuerpo, /falloContratos = nuevos\.falloContratos/,
    'y con ese fallo, que es lo que decide si el aviso dice que la cuenta puede estar incompleta');
});

// ===================================================================================================
// HALLAZGO 5: los ids del bloque de borrar pueden desaparecer del HTML sin que nada se ponga rojo
// ===================================================================================================

test('ADVERSARIO: cada id que la ficha del carro busca con el() existe en formularioHTML()', () => {
  // Medido el 27 de noviembre de 2026: se quitó a mano el `<button id="frm-borrar-si">` de
  // `formularioHTML()` y la suite entera siguió en 3009 de 3009. En el navegador eso tira un TypeError
  // dentro de `dibujarFormulario` (`null.addEventListener`) justo ANTES del bloque de mantenimiento, así
  // que la ficha queda dibujada y sin kilometraje, sin servicios y sin intervalos — en silencio.
  //
  // Esta prueba cierra ese hueco para los diez ids del formulario a la vez.
  const fuente = readFileSync(new URL('../js/pantallas/carros.js', import.meta.url), 'utf8');
  const html = fuente.slice(fuente.indexOf('export function formularioHTML()'));
  const plantilla = html.slice(0, html.indexOf('\n}\n'));
  const dibujados = new Set([...plantilla.matchAll(/id="(frm-[\w-]+)"/g)].map((m) => m[1]));
  assert.ok(dibujados.size > 5, `la prueba tiene que estar leyendo la plantilla de verdad (vio ${dibujados.size} ids)`);

  const buscados = [...new Set([...fuente.matchAll(/\bel\('(frm-[\w-]+)'\)/g)].map((m) => m[1]))];
  const faltan = buscados.filter((id) => !dibujados.has(id));
  assert.deepEqual(faltan, [],
    `la ficha busca ids que formularioHTML() no dibuja; en el navegador eso tumba el resto de la ficha: ${faltan.join(', ')}`);
});

// ===================================================================================================
// HALLAZGO 6: un carro borrado puede VOLVER A LA VIDA guardando la ficha desde otra computadora
// ===================================================================================================

test('ADVERSARIO: «Guardar carro» nunca puede revivir un carro que ya se borró', async () => {
  // `guardarVehiculo` tiene dos caminos. Con código va por `cambiarEnNubeYLocal`, que lee el documento
  // DENTRO de la transacción y rechaza con MENSAJE_CARRO_NO_ESTA si ya no está — es exactamente el caso
  // para el que existe esa frase y `textoFalloAlGuardarElCarro`. Sin código va por `guardarEnNubeYLocal`,
  // que escribe lo que le dan con `setDoc`: el carro vuelve a aparecer en la flota, y de paso se gasta un
  // código nuevo del contador (aquí salió `codigo: 1`, que ya es de otro carro).
  //
  // Antes del 26 de noviembre de 2026 esto no podía pasar: un carro no se podía borrar. Ahora sí, y la
  // ficha de un carro sin código (los de antes del contador) sigue teniendo ese camino abierto. El carro
  // «borrado» reaparece en la flota y en el selector de «Sacar carro».
  const { borrarCarro, guardarVehiculo } = await import('../js/datos.js');
  const { nubeEnMemoria, copiaLocalEnMemoria } = await import('./fixtures/nubeEnMemoria.mjs');

  const nube = nubeEnMemoria();
  nube.docs.set('vehiculos/v1', { placas: 'P-1AAA', marca: 'Toyota' }); // sin `codigo`, como los de antes
  const copia = copiaLocalEnMemoria([{ id: 'v1', placas: 'P-1AAA', marca: 'Toyota' }]);
  const deps = { iniciar: nube.iniciar, guardarCopia: copia.guardarCopia, avisar: () => {} };

  await borrarCarro('v1', { iniciar: nube.iniciar, borrarCopia: copia.borrarCopia, avisar: () => {} });
  assert.equal(nube.docs.has('vehiculos/v1'), false, 'la computadora A lo borró');

  // La computadora B tenía la ficha abierta y aprieta «Guardar carro».
  await assert.rejects(
    // `esAlta: false` es lo que manda la ficha al EDITAR, que es este caso: la computadora B tenía la ficha
    // abierta. La capa de datos no puede adivinarlo —crear un carro nuevo es legítimo—, así que lo dice
    // quien llama; que TODOS los llamadores lo digan lo vigila «todo guardado de un carro DICE si es un
    // alta» (guardar-vehiculo.test.mjs).
    guardarVehiculo({ id: 'v1', codigo: '', placas: 'P-1AAA', marca: 'Toyota' }, { ...deps, esAlta: false }),
    /ya no está en la flota/,
    'guardar la ficha de un carro borrado tiene que decirlo, no volverlo a crear',
  );
  assert.equal(nube.docs.has('vehiculos/v1'), false, 'y el carro borrado no vuelve a la flota');
});
