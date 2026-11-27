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
/**
 * Las etiquetas que NO pueden contener nada: no llevan cierre. Sin esta lista, un `<input>` quedaría
 * «abierto» para siempre y sería padre de todo lo que viniera después.
 */
const SIN_CIERRE = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'col', 'area', 'embed']);

/**
 * Lee el HTML de verdad: con PILA, no contando cierres a ojo, y saltándose los comentarios.
 *
 * Esto reemplaza (26 de noviembre de 2026 → corregido el 27) a un recorrido que solo buscaba etiquetas de
 * apertura con una expresión regular y decidía quién era ancestro de quién CONTANDO cierres y aperturas en
 * el texto de por medio. Esa cuenta se equivocaba de tres maneras distintas, todas encontradas apretando:
 *
 * 1. Un HERMANO que ya se había cerrado salía como ancestro, porque otra etiqueta del mismo nombre abierta
 *    después tapaba su cierre en la cuenta. `closest('[data-dn]')` desde un botón devolvía el `[data-dn]`
 *    del bloque de al lado — y ése es el cable con el que las DOS pantallas de dinero enrutan sus clics.
 * 2. Por lo mismo, un evento burbujeaba hacia hermanos ya cerrados: un Enter en el buscador de empleados
 *    despertaba al alta de cliente Y a la de dueño, y la pantalla «guardaba un cliente» sin que nadie
 *    estuviera ahí.
 * 3. Lo que estaba DENTRO de un comentario de HTML se encontraba y se podía apretar, aunque el navegador
 *    no lo dibuje. Las dos plantillas que este instrumento mide traen comentarios hoy, y comentar un
 *    bloque es la forma más corta de apagar un botón.
 *
 * Con la pila, `padre` es el índice del padre de verdad (o -1), y los ancestros son una cadena, no una
 * adivinanza.
 */
function etiquetasDe(html) {
  const fuera = [];
  const pila = [];
  let i = 0;
  while (i < html.length) {
    const abre = html.indexOf('<', i);
    if (abre < 0) break;
    // Un comentario no se dibuja: se salta entero, con todo lo que tenga adentro.
    if (html.startsWith('<!--', abre)) {
      const cierra = html.indexOf('-->', abre + 4);
      i = cierra < 0 ? html.length : cierra + 3;
      continue;
    }
    if (html.startsWith('</', abre)) {
      const m = /^<\/([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(abre));
      if (m) {
        const tag = m[1].toLowerCase();
        const donde = pila.map((n) => fuera[n].tag).lastIndexOf(tag);
        if (donde >= 0) pila.length = donde;
      }
      i = html.indexOf('>', abre);
      i = i < 0 ? html.length : i + 1;
      continue;
    }
    // El `>` de cierre se busca RESPETANDO las comillas: con `[^>]*` un valor como `value="2 > 1"` cortaba
    // la etiqueta a la mitad y los atributos de después desaparecían en silencio. (27 de noviembre de 2026.)
    const m = /^<([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(html.slice(abre));
    if (!m) { i = abre + 1; continue; }
    const tag = m[1].toLowerCase();
    fuera.push({
      tag,
      texto: m[0],
      desde: abre,
      padre: pila.length ? pila[pila.length - 1] : -1,
      ...atributosDe(m[0]),
    });
    if (!SIN_CIERRE.has(tag) && !m[0].endsWith('/>')) pila.push(fuera.length - 1);
    i = abre + m[0].length;
  }
  return fuera;
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
    if (SIN_CIERRE.has(etiqueta.tag)) return '';
    const desde = etiqueta.desde + etiqueta.texto.length;
    // Hasta SU cierre, no hasta el primero que aparezca: con `<div>antes<div>adentro</div>después</div>`
    // el corte ingenuo daba «antesadentro» y se comía «después». Cualquier `doesNotMatch` sobre el texto
    // de una caja con cajas adentro pasaba sin medir nada. (27 de noviembre de 2026.)
    let hondo = 1;
    let i = desde;
    while (i < html.length && hondo > 0) {
      const abre = html.indexOf(`<${etiqueta.tag}`, i);
      const cierra = html.indexOf(`</${etiqueta.tag}>`, i);
      if (cierra < 0) { i = html.length; break; }
      if (abre >= 0 && abre < cierra) { hondo += 1; i = abre + 1; continue; }
      hondo -= 1;
      if (hondo === 0) { i = cierra; break; }
      i = cierra + 1;
    }
    return html.slice(desde, Math.min(i, html.length)).replace(/<[^>]*>/g, '');
  };

  /** El valor de un `<select>`: el de su opción marcada, o el de la primera si ninguna lo está. */
  const valorDelMenu = (etiqueta) => {
    const todas = etiquetas();
    const yo = todas.findIndex((e) => e.desde === etiqueta.desde);
    const opciones = todas.filter((e) => e.tag === 'option' && e.padre === yo);
    if (!opciones.length) return '';
    const marcada = opciones.find((o) => / selected(?=[ >/])/.test(o.texto) || 'selected' in o.attrs);
    const escogida = marcada ?? opciones[0];
    return escogida.attrs.value ?? '';
  };

  /**
   * ¿La etiqueta trae este atributo? Mirando los VALORES vaciados: `class="caja hidden grande"` daba
   * `hidden: true` por la palabra dentro del valor, y `disabled="disabled"` daba `false` porque buscaba
   * la palabra suelta. Los dos son marcas con las que las pantallas prenden y apagan bloques.
   */
  const hayAtributo = (etiqueta, nombre) => {
    if (nombre in etiqueta.attrs) return true;
    const pelado = etiqueta.texto.replace(/="[^"]*"/g, '=""').replace(/='[^']*'/g, "=''");
    return new RegExp(`[ \t]${nombre}(?=[ >/=])`).test(pelado);
  };

  const nodoDeEtiqueta = (etiqueta) => {
    // La clave es dónde empieza en el HTML: dentro de un mismo dibujo, el mismo elemento es el mismo nodo
    // (lo que una prueba le deje escrito se queda). Al redibujar, `escribirHtml` los tira todos.
    const clave = etiqueta.desde;
    if (campos.has(clave)) return campos.get(clave);
    const nodo = {
      id: etiqueta.attrs.id ?? '',
      tag: etiqueta.tag,
      // En MAYÚSCULAS, como en el navegador. «Sacar carro» lo mira para no mandar el formulario con Enter
      // (`ev.target.tagName !== 'INPUT'`): sin esto, Enter no hacía NADA y en silencio. Es el mismo agujero
      // que ya había con `matches`. (26 de noviembre de 2026.)
      tagName: etiqueta.tag.toUpperCase(),
      attrs: etiqueta.attrs,
      dataset: etiqueta.dataset,
      etiqueta,
      // Un `<select>` NO lleva atributo `value`: el suyo es el de su opción marcada, y si ninguna lo está,
      // el de la primera. Leerlo como '' hacía que el instrumento no pudiera distinguir un menú que se lee
      // bien de uno que no se lee en absoluto — y esta pantalla tiene menús para la forma de pago, el
      // carro de la flota y los subarrendados usados. (27 de noviembre de 2026.)
      value: etiqueta.tag === 'select' ? valorDelMenu(etiqueta) : (etiqueta.attrs.value ?? ''),
      checked: 'checked' in etiqueta.attrs || / checked(?=[ >])/.test(etiqueta.texto),
      // Atributos de verdad, no palabras que aparezcan en cualquier parte: `class="caja hidden grande"`
      // daba `hidden: true` y `disabled="disabled"` daba `disabled: false`. Y `hidden` es justo la marca
      // con la que se prenden y apagan los bloques nuevos. (27 de noviembre de 2026.)
      disabled: hayAtributo(etiqueta, 'disabled'),
      hidden: hayAtributo(etiqueta, 'hidden'),
      // Escribir `innerHTML` BORRA el texto que había, como en el navegador. Aquí vivían aparte, así que
      // lo escrito con `textContent` se quedaba para siempre y una prueba podía leer el texto de la pasada
      // anterior con la caja ya mostrando otra cosa. Pasó de verdad, midiendo el cuadro del carro.
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(valor) { this._html = String(valor); this.textContent = ''; },
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
    for (let i = yo; i >= 0; i = todas[i].padre) {
      if (haceJuego(todas[i], selector)) return nodoDeEtiqueta(todas[i]);
    }
    return null;
  };

  const ancestrosDe = (etiqueta) => {
    const todas = etiquetas();
    const yo = todas.findIndex((e) => e.desde === etiqueta.desde);
    const fuera = [];
    for (let i = yo < 0 ? -1 : todas[yo].padre; i >= 0; i = todas[i].padre) fuera.push(todas[i]);
    return fuera;
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
    /**
     * Colgar una caja: lo que traía escrito pasa a ser la página, y desde entonces lo que se le escriba a
     * esa caja se ve. Sin hijo, la página queda vacía.
     */
    replaceChildren(hijo) {
      escribirHtml(hijo?._html ?? '');
      if (hijo) hijo.isConnected = true;
    },
    addEventListener(tipo, fn) { (oyentes[tipo] ??= []).push(fn); },
  };

  const documento = {
    /**
     * `getElementById` con la MISMA regla que todo lo demás de aquí: solo encuentra lo que la pantalla
     * dibujó de verdad. «Sacar carro» busca sus campos así; si un manejador apunta a un id que el HTML ya
     * no trae, tiene que salir `null` —y la prueba caerse— en vez de quedarse verde apretando campos
     * imaginarios.
     */
    getElementById: (id) => buscar(`#${id}`),
    /**
     * Un nodo NUEVO cada vez, como el navegador — pero que solo se VE cuando se cuelga.
     *
     * Antes devolvía siempre `raiz`, la caja que ES la página: dos cajas creadas serían el mismo objeto y
     * el error parecería de la pantalla. El primer arreglo (devolver una caja suelta cualquiera) rompió
     * 133 pruebas de un golpe, porque lo que la pantalla dibujaba ya no llegaba a la página: la caja
     * suelta se lo guardaba y nadie la colgaba de verdad.
     *
     * Así queda como en el navegador: escribir en una caja SUELTA no se ve; al colgarla con
     * `replaceChildren`, su contenido pasa a ser la página y desde entonces lo que se le escriba se ve.
     * (27 de noviembre de 2026.)
     */
    createElement: (tag = 'div') => {
      const caja = {
        tag: String(tag).toLowerCase(),
        tagName: String(tag).toUpperCase(),
        id: '',
        attrs: {},
        dataset: {},
        isConnected: false,
        oyentes: {},
        _html: '',
        get innerHTML() { return caja.isConnected ? html : caja._html; },
        set innerHTML(valor) {
          caja._html = String(valor);
          if (caja.isConnected) escribirHtml(valor);
        },
        textContent: '',
        addEventListener(tipo, fn) { (oyentes[tipo] ??= []).push(fn); },
        replaceChildren() { caja._html = ''; if (caja.isConnected) escribirHtml(''); },
        querySelector: buscar,
        querySelectorAll: (selector) => etiquetas().filter((e) => haceJuego(e, selector)).map(nodoDeEtiqueta),
      };
      return caja;
    },
  };

  /**
   * Lanza un evento sobre un elemento —por selector, o el nodo mismo— como lo haría el navegador: primero
   * sus propios manejadores y después los de la caja de arriba, que es donde esta pantalla engancha casi
   * todo (un solo manejador para toda la tabla).
   */
  const lanzar = (tipo, cual, cambios = {}) => {
    const nodo = typeof cual === 'string' ? buscar(cual) : cual;
    if (!nodo) throw new Error(`No hay ningún «${cual}» en lo que la pantalla dibujó`);
    Object.assign(nodo, cambios);
    const ev = {
      type: tipo,
      preventDefault() { ev.seEvito = true; ev.defaultPrevented = true; },
      seEvito: false,
      defaultPrevented: false,
      // Sin `stopPropagation` un manejador que quiera parar el evento revienta con un TypeError; y ahora
      // que los eventos burbujean de verdad, pararlos es justo lo que alguien va a querer hacer.
      stopPropagation() { ev.sePropaga = false; },
      sePropaga: true,
      ...cambios,
    };
    ev.target = nodo;
    for (const fn of nodo.oyentes?.[tipo] ?? []) fn(ev);
    // Y después los de cada ancestro, de adentro hacia afuera, como burbujea en el navegador: un
    // manejador enganchado en el `<form>` de en medio tiene que enterarse de lo que pasó en un campo.
    // Quien llame a `stopPropagation()` lo para aquí, igual que allá.
    for (const padre of nodo.etiqueta ? ancestrosDe(nodo.etiqueta) : []) {
      if (!ev.sePropaga) return ev;
      for (const fn of campos.get(padre.desde)?.oyentes?.[tipo] ?? []) fn(ev);
    }
    if (!ev.sePropaga) return ev;
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
