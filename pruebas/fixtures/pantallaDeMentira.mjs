// Un navegador de mentira para probar el CABLEADO de una pantalla: qué pasa cuando él aprieta algo.
//
// Por qué existe (23 de noviembre de 2026). La medición de mutaciones encontró que `pintarCuentas` —el
// cableado entre lo que él aprieta y las funciones que deciden el dinero— atrapaba el 5 % de los errores
// que se le metían: 335 de 354 pasaban sin que nada se pusiera rojo. No porque nadie quisiera probarlo,
// sino porque no se podía: hace falta un navegador, y la suite corre en Node.
//
// LA REGLA QUE LO HACE SERVIR PARA ALGO: **solo encuentra lo que la pantalla DIBUJÓ de verdad.**
// `buscar('#dn-guardar-pago')` devuelve null si ese id no está en el HTML que la pantalla acaba de
// escribir. Sin esa regla, una prueba quedaría verde apretando botones imaginarios, y en octubre ya se
// aprendió lo que cuesta un instrumento descalibrado: «confirmar que una pantalla llama a algo no
// confirma que funcione». Aquí, si el manejador apunta a un id que el HTML ya no trae, la prueba se cae.
//
// Lo que NO es: no dibuja, no calcula estilos, no sabe de cajas ni de foco real. Para el HTML en sí ya hay
// pruebas aparte (htmlLista, htmlFicha); esto es para el cable.

/** Los atributos de una etiqueta HTML, ya partidos, con su `dataset` al estilo del navegador. */
function atributosDe(etiqueta) {
  const attrs = {};
  for (const [, nombre, valor] of etiqueta.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[nombre] = valor;
  const dataset = {};
  for (const [nombre, valor] of Object.entries(attrs)) {
    if (!nombre.startsWith('data-')) continue;
    // data-dn-clave -> dnClave, igual que el navegador
    const clave = nombre.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dataset[clave] = valor;
  }
  return { attrs, dataset };
}

/** Cada etiqueta de apertura del HTML, en orden, con dónde empieza y termina. */
function etiquetasDe(html) {
  return [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)].map((m) => ({
    tag: m[1].toLowerCase(),
    texto: m[0],
    desde: m.index,
    ...atributosDe(m[0]),
  }));
}

/**
 * La pantalla de mentira. `contenedor` es lo que se le pasa a `pintarX`; `documento` es el `document`
 * que la pantalla usa para crear su caja. Todo lo que la pantalla escriba en esa caja queda en `html()`.
 */
export function pantallaDeMentira() {
  const oyentes = {};        // tipo -> [fn]
  let campos = new Map();    // clave -> el nodo que se le devolvió a la pantalla, DE ESTE dibujo
  let html = '';
  const focos = [];

  /**
   * Redibujar BORRA los nodos, como en el navegador: `innerHTML = ...` destruye lo que había y crea otra
   * cosa, así que lo que él llevaba tecleado se pierde. Por eso la pantalla de dinero tiene cuidado de NO
   * redibujar la ficha mientras él escribe en el descuento («redibujarla le quitaría el cursor del
   * campo»). Si esto guardara los valores entre dibujos, una prueba podría quedarse verde encima de ese
   * error justamente.
   */
  const escribirHtml = (valor) => { html = String(valor); campos = new Map(); };

  /** Las etiquetas del HTML de ahora. Se vuelve a leer en cada búsqueda: la pantalla se redibuja sola. */
  const etiquetas = () => etiquetasDe(html);

  /** Lo que hay escrito entre la etiqueta y su cierre, sin otras etiquetas de adentro. */
  const textoDe = (etiqueta) => {
    const desde = etiqueta.desde + etiqueta.texto.length;
    const cierre = html.indexOf(`</${etiqueta.tag}>`, desde);
    const crudo = html.slice(desde, cierre < 0 ? desde : cierre);
    return crudo.replace(/<[^>]*>/g, '');
  };

  const nodoDeEtiqueta = (etiqueta) => {
    // La clave es dónde empieza en el HTML: dentro de un mismo dibujo, el mismo elemento es el mismo nodo
    // (lo que una prueba le deje escrito se queda). Al redibujar, `escribirHtml` los tira todos.
    const clave = etiqueta.desde;
    if (campos.has(clave)) return campos.get(clave);
    const nodo = {
      id: etiqueta.attrs.id ?? '',
      tag: etiqueta.tag,
      attrs: etiqueta.attrs,
      dataset: etiqueta.dataset,
      etiqueta,
      value: etiqueta.attrs.value ?? '',
      checked: 'checked' in etiqueta.attrs || / checked(?=[ >])/.test(etiqueta.texto),
      disabled: / disabled(?=[ >])/.test(etiqueta.texto),
      hidden: / hidden(?=[ >])/.test(etiqueta.texto),
      innerHTML: '',
      textContent: textoDe(etiqueta),
      oyentes: {},
      // Un nodo suelto también puede tener sus propios manejadores: `dibujarEntrada` los engancha al
      // formulario de la contraseña, no a la caja de arriba.
      addEventListener(tipo, fn) { (this.oyentes[tipo] ??= []).push(fn); },
      focus() { focos.push(this.id); },
      /** Lo mismo que el `closest` del navegador, mirando hacia afuera en el HTML de verdad. */
      closest(selector) { return masCercano(this.etiqueta, selector); },
      /** Lo mismo que el `matches` del navegador. Sin él, un manejador con `matches?.()` no haría NADA. */
      matches(selector) { return haceJuego(this.etiqueta, selector); },
    };
    campos.set(clave, nodo);
    return nodo;
  };

  /**
   * ¿Esta etiqueta hace juego con el selector? Entiende lo que el sistema usa de verdad: una etiqueta
   * (`tr`), un id (`#dn-fecha`) y atributos con o sin valor (`[data-dn]`, `[data-dn="marcar"]`), en
   * cualquier combinación. Lo que no entiende lo DICE en vez de adivinar: un selector mal leído devolvería
   * el elemento equivocado y la prueba quedaría verde probando otra cosa.
   */
  const haceJuego = (etiqueta, selector) => {
    const texto = selector.trim();
    const partes = texto.match(/^[a-zA-Z][a-zA-Z0-9]*|#[\w-]+|\[[a-zA-Z-]+(?:="[^"]*")?\]/g);
    if (!partes || partes.join('') !== texto) {
      throw new Error(`La pantalla de mentira no entiende el selector «${selector}»`);
    }
    for (const parte of partes) {
      if (parte.startsWith('#')) {
        if (etiqueta.attrs.id !== parte.slice(1)) return false;
      } else if (parte.startsWith('[')) {
        const [, nombre, valor] = /^\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/.exec(parte);
        if (!(nombre in etiqueta.attrs)) return false;
        if (valor !== undefined && etiqueta.attrs[nombre] !== valor) return false;
      } else if (etiqueta.tag !== parte.toLowerCase()) return false;
    }
    return true;
  };

  /**
   * El ancestro (o él mismo) más cercano que hace juego. Se resuelve por el ORDEN del HTML: la etiqueta
   * de apertura que hace juego, más cercana hacia atrás, que todavía no se ha cerrado. Alcanza para los
   * dos casos que usa el sistema (`[data-dn]` y `tr[data-dn-clave]`) y se niega a adivinar otros.
   */
  const masCercano = (etiqueta, selector) => {
    const todas = etiquetas();
    const yo = todas.findIndex((e) => e.desde === etiqueta.desde);
    if (yo < 0) return null;
    for (let i = yo; i >= 0; i--) {
      if (!haceJuego(todas[i], selector)) continue;
      if (i === yo) return nodoDeEtiqueta(todas[i]);
      // Que no se haya cerrado antes de mí: se cuenta su cierre en el texto de por medio.
      const enMedio = html.slice(todas[i].desde, etiqueta.desde);
      const cierres = (enMedio.match(new RegExp(`</${todas[i].tag}>`, 'g')) ?? []).length;
      const aperturas = (enMedio.match(new RegExp(`<${todas[i].tag}\\b`, 'g')) ?? []).length - 1;
      if (cierres <= aperturas) return nodoDeEtiqueta(todas[i]);
    }
    return null;
  };

  const buscar = (selector) => {
    const etiqueta = etiquetas().find((e) => haceJuego(e, selector));
    return etiqueta ? nodoDeEtiqueta(etiqueta) : null;
  };

  const raiz = {
    get innerHTML() { return html; },
    set innerHTML(valor) { escribirHtml(valor); },
    // `isConnected` es falso hasta que la caja se cuelga del contenedor, igual que en el navegador. El
    // área de dinero lo mira antes de vaciar lo dibujado al cerrarse («lo ya dibujado también es dinero»):
    // sin esto, ese camino no se ejercita nunca y la prueba se queda verde sin haberlo tocado.
    isConnected: false,
    replaceChildren() { escribirHtml(''); },
    querySelector: buscar,
    querySelectorAll: (selector) => etiquetas().filter((e) => haceJuego(e, selector)).map(nodoDeEtiqueta),
    addEventListener(tipo, fn) { (oyentes[tipo] ??= []).push(fn); },
  };

  const contenedor = {
    get innerHTML() { return html; },
    set innerHTML(valor) { escribirHtml(valor); },
    querySelector: buscar,
    querySelectorAll: raiz.querySelectorAll,
    replaceChildren(hijo) { escribirHtml(''); if (hijo) hijo.isConnected = true; },
    addEventListener(tipo, fn) { (oyentes[tipo] ??= []).push(fn); },
  };

  const documento = { createElement: () => raiz };

  /**
   * Lanza un evento sobre un elemento —por selector, o el nodo mismo— como lo haría el navegador: primero
   * sus propios manejadores y después los de la caja de arriba, que es donde esta pantalla engancha casi
   * todo (un solo manejador para toda la tabla).
   */
  const lanzar = (tipo, cual, cambios = {}) => {
    const nodo = typeof cual === 'string' ? buscar(cual) : cual;
    if (!nodo) throw new Error(`No hay ningún «${cual}» en lo que la pantalla dibujó`);
    Object.assign(nodo, cambios);
    const ev = { type: tipo, preventDefault() { ev.seEvito = true; }, seEvito: false, ...cambios };
    ev.target = nodo;
    for (const fn of nodo.oyentes?.[tipo] ?? []) fn(ev);
    for (const fn of oyentes[tipo] ?? []) fn(ev);
    return ev;
  };

  return {
    contenedor,
    documento,
    raiz,
    html: () => html,
    buscar,
    focos,
    hay: (selector) => Boolean(buscar(selector)),
    lanzar,
    /** Apretar algo: un clic sobre el elemento que tenga ese id o ese `data-dn`. */
    clic(selector) { return lanzar('click', selector); },
    /** Teclear en una casilla: deja el valor y lanza `input`; `salir()` lanza el `change`. */
    teclear(selector, valor) { return lanzar('input', selector, { value: valor }); },
    salir(selector) { return lanzar('change', selector); },
    marcar(selector, checked = true) { return lanzar('change', selector, { checked }); },
    tecla(selector, key) { return lanzar('keydown', selector, { key }); },
  };
}
