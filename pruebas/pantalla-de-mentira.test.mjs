// Los CONTROLES de la pantalla de mentira. Van antes de usarla para probar nada, por la misma razón que
// el arnés de mutaciones corre sus controles antes de medir: un instrumento sin controles no mide,
// adivina. En octubre de 2026 la «nube de mentira» aceptaba consultas que el Firestore de verdad rechaza,
// y durante semanas hubo pruebas verdes que no probaban nada.
//
// Lo que esta pantalla TIENE que cumplir:
//   1. Encuentra lo que la pantalla dibujó.
//   2. NO encuentra lo que no dibujó (si no, se probaría cableado contra botones imaginarios).
//   3. Lo que él teclea sobrevive a que la pantalla se redibuje, como en el navegador.
//   4. `closest` sube de verdad por el HTML, y no se salta una etiqueta ya cerrada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pantallaDeMentira } from './fixtures/pantallaDeMentira.mjs';

const conHtml = (html) => {
  const p = pantallaDeMentira();
  p.raiz.innerHTML = html;
  return p;
};

test('CONTROL 1: encuentra lo que la pantalla dibujó, con sus atributos', () => {
  const p = conHtml('<input id="dn-descuento" value="500"><button id="dn-guardar-pago" disabled>Guardar</button>');
  assert.equal(p.buscar('#dn-descuento').value, '500');
  assert.equal(p.buscar('#dn-guardar-pago').disabled, true);
  assert.equal(p.buscar('#dn-descuento').disabled, false);
  assert.equal(p.hay('#dn-guardar-pago'), true);
});

test('CONTROL 2: NO encuentra lo que la pantalla no dibujó', () => {
  // Es la regla que hace que estas pruebas sirvan: si el manejador apunta a un id que el HTML ya no trae,
  // la prueba se cae en vez de quedarse verde apretando un botón imaginario.
  const p = conHtml('<input id="dn-descuento">');
  assert.equal(p.buscar('#dn-guardar-pago'), null);
  assert.equal(p.hay('#dn-guardar-pago'), false);
  assert.throws(() => p.clic('#dn-guardar-pago'), /No hay ningún «#dn-guardar-pago»/);
});

test('CONTROL 3: redibujar BORRA lo tecleado, como en el navegador de verdad', () => {
  // Este control empezó al revés el 23 de noviembre de 2026 («lo tecleado sobrevive») y era MENTIRA: en
  // el navegador, `innerHTML = ...` destruye el campo y lo que él llevaba escrito se va con él. Por eso la
  // pantalla de dinero no redibuja la ficha mientras él escribe el descuento. Una pantalla de mentira que
  // guardara el valor dejaría pasar justamente ese error.
  const p = conHtml('<input id="dn-descuento" value=""><button id="b" data-dn="uno">x</button>');
  p.buscar('#dn-descuento').value = '500';
  assert.equal(p.buscar('#dn-descuento').value, '500', 'mientras no se redibuje, ahí sigue');
  p.raiz.innerHTML = '<input id="dn-descuento" value="7"><button id="b" data-dn="dos">x</button>';
  assert.equal(p.buscar('#dn-descuento').value, '7', 'después de redibujar manda el HTML nuevo');
  assert.equal(p.buscar('#b').dataset.dn, 'dos');
});

test('CONTROL 15: `matches` contesta como el del navegador', () => {
  // La pantalla de dinero decide con `caja.matches?.('[data-dn=\"marcar\"]')` si hay que marcar la renta.
  // Sin `matches`, el `?.` lo deja en undefined y marcar NO HACE NADA, en silencio.
  const p = conHtml('<input data-dn="marcar" data-id="m1" id="c"><button id="b" data-dn="registrar"></button>');
  assert.equal(p.buscar('#c').matches('[data-dn="marcar"]'), true);
  assert.equal(p.buscar('#b').matches('[data-dn="marcar"]'), false);
});

test('CONTROL 16: el texto de un elemento se lee del HTML que la pantalla dibujó', () => {
  const p = conHtml('<strong id="dn-total-marcado" class="x">Q0.00</strong><span id="v">2 <b>rentas</b></span>');
  assert.equal(p.buscar('#dn-total-marcado').textContent, 'Q0.00');
  assert.equal(p.buscar('#v').textContent, '2 rentas', 'sin las etiquetas de adentro');
});

test('CONTROL 4: `closest` sube por el HTML de verdad', () => {
  const p = conHtml('<tr data-dn-clave="id:d1"><td><input id="m" data-dn="marcar" data-id="c1"></td></tr>');
  const nodo = p.buscar('#m');
  assert.equal(nodo.closest('[data-dn]').dataset.dn, 'marcar', 'él mismo cuenta');
  assert.equal(nodo.closest('tr[data-dn-clave]').dataset.dnClave, 'id:d1');
  assert.equal(nodo.closest('a'), null, 'lo que no está arriba no se inventa');
});

test('CONTROL 5: `closest` NO se salta una etiqueta que ya se cerró', () => {
  // Si se la saltara, una prueba diría que un clic en la fila de abajo abre la ficha de la fila de arriba.
  const p = conHtml('<tr data-dn-clave="id:d1"><td>x</td></tr><div><input id="m"></div>');
  assert.equal(p.buscar('#m').closest('tr[data-dn-clave]'), null);
});

test('CONTROL 6: los data-* se leen como los lee el navegador (data-dn-clave -> dnClave)', () => {
  const p = conHtml('<tr data-dn-clave="texto:Don Mario" data-id="c1" id="f"></tr>');
  assert.deepEqual(p.buscar('#f').dataset, { dnClave: 'texto:Don Mario', id: 'c1' });
});

test('CONTROL 7: un evento llega a los oyentes con el target que es', () => {
  const p = conHtml('<input id="a"><input id="b">');
  const vistos = [];
  p.raiz.addEventListener('input', (ev) => vistos.push([ev.target.id, ev.target.value]));
  p.teclear('#a', '7');
  p.teclear('#b', '9');
  assert.deepEqual(vistos, [['a', '7'], ['b', '9']]);
  assert.equal(p.buscar('#a').value, '7', 'y el valor se queda en la casilla');
});

test('CONTROL 8: marcar una casilla deja `checked`, y se lee del HTML cuando viene marcada', () => {
  const p = conHtml('<input id="a" type="checkbox"><input id="b" type="checkbox" checked>');
  assert.equal(p.buscar('#a').checked, false);
  assert.equal(p.buscar('#b').checked, true);
  const ev = p.marcar('#a');
  assert.equal(ev.target.checked, true);
  assert.equal(p.buscar('#a').checked, true);
});

test('CONTROL 9: querySelectorAll devuelve solo lo que hace juego, en el orden del HTML', () => {
  const p = conHtml('<input id="a" data-dn="marcar"><b id="x"></b><input id="c" data-dn="marcar">');
  assert.deepEqual(p.raiz.querySelectorAll('[data-dn]').map((n) => n.id), ['a', 'c']);
  assert.deepEqual(p.raiz.querySelectorAll('input').map((n) => n.id), ['a', 'c']);
});

test('CONTROL 10: un selector que no se entiende se NIEGA en vez de adivinar', () => {
  const p = conHtml('<div class="x" id="d"></div>');
  assert.throws(() => p.raiz.querySelectorAll('.x > span'), /no entiende el selector/);
});

test('CONTROL 11: un nodo suelto también puede tener sus propios manejadores, y el evento sube', () => {
  // `dibujarEntrada` engancha el formulario de la contraseña al nodo mismo, no a la caja de arriba.
  const p = conHtml('<form id="dn-entrada"><input id="c"></form>');
  const orden = [];
  p.buscar('#dn-entrada').addEventListener('submit', () => orden.push('el formulario'));
  p.raiz.addEventListener('submit', () => orden.push('la caja de arriba'));
  p.lanzar('submit', '#dn-entrada');
  assert.deepEqual(orden, ['el formulario', 'la caja de arriba'], 'primero el suyo, después el de arriba');
});

test('CONTROL 12: se puede apretar un nodo que no tiene id (una fila de la tabla)', () => {
  const p = conHtml('<tr data-dn-clave="id:d1"><td>Mario</td></tr>');
  const fila = p.raiz.querySelectorAll('tr[data-dn-clave]')[0];
  let visto = null;
  p.raiz.addEventListener('click', (ev) => { visto = ev.target.closest('tr[data-dn-clave]')?.dataset.dnClave; });
  p.lanzar('click', fila);
  assert.equal(visto, 'id:d1');
});

test('CONTROL 13: los selectores con atributo y VALOR distinguen un elemento de otro', () => {
  // Los recuadros de marcar una renta no tienen id: se distinguen por su data-id. Sin esto, una prueba
  // que creyera estar marcando la renta de Q1,200 estaría marcando la primera que encontrara.
  const p = conHtml('<input data-dn="marcar" data-id="m1"><input data-dn="marcar" data-id="m2"><button data-dn="registrar"></button>');
  assert.equal(p.buscar('[data-dn="marcar"][data-id="m2"]').dataset.id, 'm2');
  assert.equal(p.buscar('[data-dn="registrar"]').tag, 'button');
  assert.equal(p.buscar('[data-dn="marcar"][data-id="m9"]'), null, 'lo que no está, no está');
  assert.deepEqual(p.raiz.querySelectorAll('[data-dn="marcar"]').map((n) => n.dataset.id), ['m1', 'm2']);
});

test('CONTROL 14: `id=` y `data-id=` no se confunden', () => {
  // Buscar «id=» dentro del HTML a lo bruto también encuentra «data-id=»: por ahí se coló una prueba que
  // creía que los recuadros de marcar tenían id, y no lo tienen.
  const p = conHtml('<tr data-id="m1"><td><input id="de-verdad"></td></tr>');
  assert.equal(p.buscar('#m1'), null, 'data-id="m1" NO es id="m1"');
  assert.equal(p.buscar('#de-verdad').id, 'de-verdad');
});

test('CONTROL 17: la caja no está «conectada» hasta que se cuelga del contenedor', () => {
  // El área de dinero mira `raizActual?.isConnected` antes de vaciar lo dibujado al cerrarse. Si la
  // pantalla de mentira dijera siempre que no, ese camino no se tocaría nunca y la prueba quedaría verde
  // sin haber comprobado que la página se vacía.
  const p = pantallaDeMentira();
  const caja = p.documento.createElement('div');
  assert.equal(caja.isConnected, false, 'recién creada no está en la página');
  p.contenedor.replaceChildren(caja);
  assert.equal(caja.isConnected, true, 'colgada del contenedor, sí');
});

test('control 18: getElementById encuentra lo dibujado y devuelve null para lo que no está', () => {
  // «Sacar carro» busca TODOS sus campos con `getElementById`. Si esto devolviera un nodo inventado para
  // cualquier id, un manejador que apunte a un campo que ya no se dibuja pasaría en verde sin hacer nada.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<input id="sc-dias" value="3"><button id="sc-guardar">Guardar</button>';
  assert.equal(p.documento.getElementById('sc-dias').value, '3', 'lo dibujado se encuentra, con su valor');
  assert.equal(p.documento.getElementById('sc-guardar').id, 'sc-guardar');
  assert.equal(p.documento.getElementById('sc-no-existe'), null, 'lo que no se dibujó es null, no un nodo de mentira');
});

test('control 19: getElementById devuelve EL MISMO nodo dentro de un dibujo, y uno nuevo al redibujar', () => {
  // Lo que una prueba (o la pantalla) le deje escrito a un campo tiene que seguir ahí al volver a pedirlo
  // por id; y al redibujar se pierde, como en el navegador.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<input id="sc-dias">';
  p.documento.getElementById('sc-dias').value = '7';
  assert.equal(p.documento.getElementById('sc-dias').value, '7', 'el mismo nodo dentro del mismo dibujo');
  p.contenedor.innerHTML = '<input id="sc-dias">';
  assert.notEqual(p.documento.getElementById('sc-dias').value, '7', 'redibujar se lleva lo tecleado');
});

test('control 20: un evento BURBUJEA hasta los manejadores de en medio, no solo al nodo y a la caja', () => {
  // «Sacar carro» engancha TODO su `change` en el `<form>`, un nodo de en medio. Sin burbujeo, apretar un
  // campo no avisaba a nadie y la prueba quedaba verde sin que pasara nada.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<form id="f"><div id="caja"><input id="dias"></div></form><input id="fuera">';
  const vistos = [];
  p.buscar('#f').addEventListener('change', (ev) => vistos.push(`form:${ev.target.id}`));
  p.buscar('#caja').addEventListener('change', (ev) => vistos.push(`caja:${ev.target.id}`));
  p.buscar('#dias').addEventListener('change', (ev) => vistos.push(`campo:${ev.target.id}`));

  p.lanzar('change', '#dias', { value: '5' });
  assert.deepEqual(vistos, ['campo:dias', 'caja:dias', 'form:dias'], 'de adentro hacia afuera, y el target es el campo');

  // Y un campo que NO está dentro del formulario no despierta a su manejador.
  vistos.length = 0;
  p.lanzar('change', '#fuera');
  assert.deepEqual(vistos, [], 'lo de fuera no burbujea hacia adentro');
});

test('control 21: una etiqueta que no se cierra (<input>) nunca es ancestro de nadie', () => {
  // Lo encontró el control 20: un `<input>` no lleva cierre, así que la cuenta de «¿ya se cerró?» lo daba
  // siempre por abierto y lo tomaba por ancestro de todo lo que viniera después. En el navegador un
  // `<input>` no puede contener nada.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<div data-dn="caja"><input id="a"><span id="b">x</span></div>';
  assert.equal(p.buscar('#b').closest('[data-dn]').dataset.dn, 'caja', 'el ancestro de verdad es el div');
  const vistos = [];
  p.buscar('#a').addEventListener('click', () => vistos.push('input'));
  p.lanzar('click', '#b');
  assert.deepEqual(vistos, [], 'el input de al lado no se entera de lo que pasa en su hermano');
});

test('control 22: cada nodo trae su tagName en MAYÚSCULAS, como en el navegador', () => {
  // «Sacar carro» decide con `ev.target.tagName !== 'INPUT'` si Enter manda el formulario o escoge de la
  // lista. Con un `tagName` ausente, esa comparación es siempre cierta y Enter no hace NADA, en silencio.
  const p = pantallaDeMentira();
  p.contenedor.innerHTML = '<form id="f"><input id="a"><button id="b">x</button></form>';
  assert.equal(p.buscar('#a').tagName, 'INPUT');
  assert.equal(p.buscar('#b').tagName, 'BUTTON');
  assert.equal(p.buscar('#f').tagName, 'FORM');
});
