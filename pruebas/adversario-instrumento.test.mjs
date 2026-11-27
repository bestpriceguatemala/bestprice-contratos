// El INSTRUMENTO puesto a prueba: ¿en qué miente `pantallaDeMentira`?
// Recorrido adversario del 27 de noviembre de 2026.
//
// La regla que hace servir a este instrumento está escrita en su propio encabezado: «solo encuentra lo
// que la pantalla DIBUJÓ de verdad». Cada prueba de aquí es un lugar donde eso no se cumple, o donde el
// nodo que devuelve dice algo distinto de lo que diría el navegador. Todas están ROJAS a propósito: son
// los hallazgos. Un instrumento descalibrado no se nota en la suite — se nota cuando una pantalla que
// pasó en verde no funciona en el navegador, que es justo lo que este instrumento existe para evitar.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pantallaDeMentira } from './fixtures/pantallaDeMentira.mjs';

// ===================================================================================================
// 1. Encuentra —y deja APRETAR— lo que está dentro de un comentario de HTML
// ===================================================================================================

test('INSTRUMENTO: lo que está COMENTADO en el HTML no se dibuja, así que no se puede encontrar ni apretar', () => {
  // `etiquetasDe` lee el HTML con una expresión regular y no sabe de comentarios, así que una etiqueta
  // dentro de `<!-- -->` entra a la lista como cualquier otra. Las dos plantillas que este instrumento
  // mide traen comentarios de HTML hoy mismo (`plantilla()` de sacarCarro.js, `formularioHTML()` de
  // carros.js), así que no es un caso inventado: comentar un bloque es como se apaga un pedazo de
  // pantalla, y la forma más corta de apagar «Borrar carro» sería comentarlo.
  //
  // Lo que cuesta: una prueba apretaría «Sí, borrar este carro» y pasaría en verde sobre un botón que en
  // el navegador no existe.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div><!-- <button id="frm-borrar-si">Sí, borrar este carro</button> --><p>nada</p></div>';
  assert.equal(p.buscar('#frm-borrar-si'), null, 'un botón comentado no está dibujado');
  assert.equal(p.hay('#frm-borrar-si'), false);
});

// ===================================================================================================
// 2. `innerHTML` y `textContent` del mismo nodo viven aparte: se puede leer texto ya borrado
// ===================================================================================================

test('INSTRUMENTO: escribir innerHTML en un nodo tiene que borrarle el textContent, como en el navegador', () => {
  // En el navegador `caja.innerHTML = …` reemplaza TODO lo que había dentro, así que el `textContent`
  // pasa a ser el texto del HTML nuevo. Aquí son dos propiedades sueltas: lo que se escribió con
  // `textContent` se queda para siempre.
  //
  // Esto se toca de verdad: `refrescarCarro` (sacarCarro.js) escribe el cuadro del carro con
  // `caja.textContent = 'Escoge un carro…'` en unas ramas y con `caja.innerHTML = '<strong>…'` en otras,
  // y el ayudante `dentroDe()` de sacarCarro.test.mjs devuelve `innerHTML + ' ' + textContent`. Así, una
  // prueba puede dar por bueno un texto que el navegador ya borró — se midió el 27 de noviembre de 2026:
  // una afirmación sobre el cuadro del carro pasó leyendo el «Escoge un carro de la flota» de la pasada
  // anterior, con el cuadro ya mostrando otro carro.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div id="caja">original</div>';
  const caja = p.buscar('#caja');
  caja.textContent = 'Escoge un carro de la flota';
  caja.innerHTML = '<strong>P-999ZZZ · Ford</strong>';
  assert.doesNotMatch(caja.textContent, /Escoge un carro/,
    `el texto de antes sigue ahí después de reescribir el HTML del nodo: ${JSON.stringify(caja.textContent)}`);
});

// ===================================================================================================
// 3. Un `<select>` con una opción `selected` se lee VACÍO
// ===================================================================================================

test('INSTRUMENTO: el value de un <select> es el de su opción marcada, no el atributo value de la etiqueta', () => {
  // `nodoDeEtiqueta` hace `value: etiqueta.attrs.value ?? ''`, y un `<select>` no lleva atributo `value`:
  // lo lleva su `<option selected>`. Así que todo menú dibujado con `selected` se lee como ''.
  //
  // Dónde se dibuja así hoy: la forma de pago de las DOS pantallas de dinero (`#dn-forma`, `#cm-forma`),
  // el empleado a enlazar de comisiones, el carro de la pantalla de reservaciones y el papel del contrato
  // impreso. En dinero el daño se tapa por casualidad —`querySelector('#dn-forma')?.value || ui.forma`
  // cae al valor de memoria—, y eso es peor: significa que el instrumento no puede distinguir un menú
  // que se lee bien de uno que no se lee en absoluto.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<select id="dn-forma"><option value="efectivo">Efectivo</option>'
    + '<option value="cheque" selected>Cheque</option></select>';
  assert.equal(p.buscar('#dn-forma').value, 'cheque',
    'lo que el navegador leería del menú; aquí se lee ' + JSON.stringify(p.buscar('#dn-forma').value));
});

// ===================================================================================================
// 4. `hidden` y `disabled` se adivinan con una expresión regular sobre toda la etiqueta
// ===================================================================================================

test('INSTRUMENTO: hidden y disabled son ATRIBUTOS, no palabras que aparecen en cualquier parte de la etiqueta', () => {
  // `hidden: / hidden(?=[ >])/.test(etiqueta.texto)`: la palabra se busca en el texto COMPLETO de la
  // etiqueta, así que una clase que se llame `hidden` la deja «escondida» sin estarlo. Y al revés con
  // `disabled`: escrito en su forma larga (`disabled="disabled"`) no se ve, porque la expresión pide un
  // espacio o un `>` después y encuentra un `=`.
  //
  // `hidden` es justo la marca con la que se prenden y apagan los bloques nuevos (`#frm-borrar-caja`,
  // `#sc-ajeno-usados-campo`, `#sc-carro-escoger-campo`), y `disabled` es la que impide el doble clic en
  // «Sí, borrar este carro» y en «Guardar». Las dos son medidas por pruebas.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div id="a" class="caja hidden grande">y</div>'
    + '<button id="b" disabled="disabled">x</button>';
  assert.equal(p.buscar('#a').hidden, false, 'una CLASE llamada hidden no esconde nada: hidden es un atributo');
  assert.equal(p.buscar('#b').disabled, true, 'disabled="disabled" es un botón apagado');
});

// ===================================================================================================
// 5. El textContent se corta en el primer cierre, aunque sea de una etiqueta de adentro
// ===================================================================================================

test('INSTRUMENTO: el textContent de una caja trae TODO su texto, no solo hasta el primer cierre de adentro', () => {
  // `textoDe` busca `</div>` desde donde empieza la etiqueta y se queda con el primer cierre que
  // encuentra, que es el de la caja de ADENTRO. En una plantilla como la de «Sacar carro», donde los
  // `<div>` van anidados por todos lados, eso recorta el texto.
  //
  // Lo que cuesta: cualquier `assert.doesNotMatch(…textContent…)` sobre una caja con cajas dentro pasa
  // sin medir nada, porque el texto que debía estorbar quedó fuera del recorte.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div id="x">antes<div>adentro</div>después</div>';
  assert.equal(p.buscar('#x').textContent, 'antesadentrodespués',
    `el navegador trae todo el texto; aquí se cortó en ${JSON.stringify(p.buscar('#x').textContent)}`);
});

// ===================================================================================================
// 6. El evento no trae lo que trae el del navegador
// ===================================================================================================

test('INSTRUMENTO: el evento trae stopPropagation y defaultPrevented, como el del navegador', () => {
  // `lanzar` arma `{ type, preventDefault, seEvito }`. `seEvito` es un nombre propio de este instrumento:
  // si una pantalla llegara a mirar `ev.defaultPrevented` —el nombre de verdad— aquí leería `undefined`,
  // que es `false`, en silencio y para siempre. Y `ev.stopPropagation()` no existe: una pantalla que lo
  // use (para que un clic en una fila no despierte al manejador de la tabla) revienta aquí con un
  // TypeError que no tiene nada que ver con lo que la prueba quería medir.
  //
  // Hoy ninguna pantalla usa los dos, así que esto no está roto todavía: está sin red. Y el burbujeo que
  // se acaba de agregar es exactamente lo que hace que haga falta una forma de pararlo.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<form id="f"><input id="a"></form>';
  const ev = p.lanzar('click', '#a');
  assert.equal(typeof ev.stopPropagation, 'function', 'el evento se puede parar');
  const conEvitado = p.lanzar('keydown', '#a', { key: 'Enter' });
  conEvitado.preventDefault();
  assert.equal(conEvitado.defaultPrevented, true, 'y dice si se evitó con el nombre que usa el navegador');
});

// ===================================================================================================
// 7. `createElement` devuelve SIEMPRE el mismo nodo
// ===================================================================================================

test('INSTRUMENTO: createElement devuelve un nodo NUEVO cada vez, no siempre el mismo', () => {
  // `createElement: () => raiz`. Hoy cada pantalla crea una sola caja, así que no se nota; el día que una
  // cree dos, las dos serían el MISMO objeto —el mismo innerHTML, los mismos manejadores— y las pruebas
  // no podrían distinguirlas. Es un error que, cuando llegue, va a parecer un error de la pantalla.
  const p = pantallaDeMentira();
  assert.notEqual(p.documento.createElement('div'), p.documento.createElement('div'),
    'dos cajas creadas aparte son dos cajas');
});

// ===================================================================================================
// 8. Un valor de atributo con un '>' adentro rompe la lectura de la etiqueta
// ===================================================================================================

test('INSTRUMENTO: un valor con un > adentro no puede hacer desaparecer los demás atributos', () => {
  // `etiquetasDe` corta la etiqueta en el primer `>` (`[^>]*`), así que `value="2 > 1"` deja la etiqueta
  // partida y el `value` sin leer: el campo se lee VACÍO.
  //
  // Hoy todo el texto libre pasa por `esc()`, que convierte el `>` en `&gt;`, así que no se llega a este
  // caso desde lo que él teclea — pero cualquier HTML armado sin `esc` (o un `esc` que algún día deje de
  // escapar el `>`, que no hace falta escapar en HTML) lo abre, y el síntoma sería «el campo salió
  // vacío», que es imposible de relacionar con la causa.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<input id="a" value="2 > 1" data-dn="marcar">';
  assert.equal(p.buscar('#a').value, '2 > 1', `se leyó ${JSON.stringify(p.buscar('#a').value)}`);
  assert.equal(p.buscar('#a').dataset.dn, 'marcar', 'y los atributos de después del > tampoco se pierden');
});

// ===================================================================================================
// 9. La cuenta de «¿ya se cerró?» se engaña con un HERMANO del mismo nombre: el peor de todos
// ===================================================================================================
// `masCercano` y `ancestrosDe` deciden si una etiqueta de más atrás es ancestro contando cierres y
// aperturas de ESE nombre en el texto de por medio:
//
//     const cierres = (enMedio.match(/<\/div>/g) ?? []).length;
//     const aperturas = (enMedio.match(/<div\b/g) ?? []).length - 1;
//     if (cierres <= aperturas) return ...;   // «no se había cerrado»
//
// El problema es que `aperturas` cuenta TODAS las aperturas de por medio, también las de hermanos que
// abrieron DESPUÉS de que el candidato ya se cerró. Una sola `<div>` hermana tapa el `</div>` del
// candidato y lo convierte en ancestro de todo lo que venga después. `SIN_CIERRE` (el arreglo del control
// 20, del 26 de noviembre de 2026) tapó un caso de esta misma familia —`<input>`— pero no la cuenta.
//
// Con `<div>` envolviendo todo, como en las dos pantallas de dinero y en «Sacar carro», esto se dispara
// casi siempre.

test('INSTRUMENTO: un hermano YA CERRADO no es ancestro, así que no se entera de lo que pasa después', () => {
  // El alta del cliente de «Sacar carro» es una caja aparte del resto del formulario, y cada alta engancha
  // su propio Enter (`sinEnviarConEnter(el('sc-cliente-alta'), guardarClienteNuevo)`). Medido así: un
  // Enter en el buscador de empleados despertó al Enter del alta de cliente Y al del alta de dueño, y la
  // pantalla «guardó un cliente» y pidió el nombre del dueño sin que nadie estuviera en esas cajas.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div id="alta">campos del alta</div><div id="otro"><input id="campo"></div>';
  const vistos = [];
  p.buscar('#alta').addEventListener('keydown', () => vistos.push('alta'));
  p.buscar('#otro').addEventListener('keydown', () => vistos.push('otro'));
  p.lanzar('keydown', '#campo', { key: 'Enter' });
  assert.deepEqual(vistos, ['otro'], '«#alta» ya estaba cerrada cuando empezó «#otro»: no es su ancestro');
});

test('INSTRUMENTO: closest() no puede devolver un hermano cerrado, o un botón hace lo que no es', () => {
  // Es el cable con el que las DOS pantallas de dinero enrutan todos sus clics:
  // `const accion = ev.target.closest('[data-dn]')`. Con la cuenta engañada, un botón que en el navegador
  // no tiene ninguna acción encima toma la del renglón ANTERIOR.
  //
  // Lo que cuesta: una prueba puede medir un botón que en el navegador no hace nada y verlo «anular el
  // pago pg-7». Y al revés: una prueba que afirme «esto NO anula nada» sale roja por culpa del
  // instrumento. En un instrumento que existe para medir cables de dinero, las dos direcciones son caras.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div data-dn="anular" data-id="pg-7">Anular este pago</div>'
    + '<div class="pie"><button id="volver">Volver</button></div>';
  assert.equal(p.buscar('#volver').closest('[data-dn]'), null,
    '«Volver» no está dentro de ninguna acción');

  const acciones = [];
  p.raiz.addEventListener('click', (ev) => {
    const accion = ev.target.closest('[data-dn]');
    if (accion) acciones.push(`${accion.dataset.dn}:${accion.dataset.id}`);
  });
  p.clic('#volver');
  assert.deepEqual(acciones, [], 'apretar «Volver» no dispara ninguna acción');
});

test('INSTRUMENTO: un clic en una fila no despierta a las filas de ARRIBA', () => {
  // La lista de dueños es una tabla de `<tr data-dn-clave>`. Un clic en la tercera fila avisó también a la
  // segunda y a la primera: con un manejador por fila —que es lo que el burbujeo nuevo vino a permitir—
  // una sola acción se ejecutaría tres veces, cada vez sobre una cuenta distinta.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<table><tr data-dn-clave="id:d1"><td>uno</td></tr>'
    + '<tr data-dn-clave="id:d2"><td>dos</td></tr>'
    + '<tr data-dn-clave="id:d3"><td id="tercera">tres</td></tr></table>';
  const vistos = [];
  for (const clave of ['id:d1', 'id:d2', 'id:d3']) {
    p.buscar(`[data-dn-clave="${clave}"]`).addEventListener('click', () => vistos.push(clave));
  }
  p.lanzar('click', '#tercera');
  assert.deepEqual(vistos, ['id:d3'], 'solo la fila del clic');
});
