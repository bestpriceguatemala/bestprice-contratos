// Dónde del archivo es CÓDIGO y dónde no (comentarios, textos, expresiones regulares).
// Mutar dentro de un comentario o de un texto no prueba nada: el primero no se ejecuta y el segundo
// casi siempre da un mutante equivalente. Esto recorre el archivo una vez y devuelve, por cada
// posición, si está en código. Se trata aparte lo de dentro de `${...}` de una plantilla: eso SÍ es código.

export function regionesDeCodigo(src) {
  const esCodigo = new Uint8Array(src.length); // 1 = código
  let i = 0;
  // pila para plantillas anidadas: cada entrada es la profundidad de llaves dentro de un ${}
  const plantillas = [];
  let enPlantilla = false;

  const anterior = (desde) => {
    for (let k = desde - 1; k >= 0; k--) {
      const c = src[k];
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return c;
    }
    return '';
  };

  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    // comentario de línea
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    // comentario de bloque
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // texto con comilla simple o doble
    if (c === "'" || c === '"') {
      const cierre = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === cierre) { i++; break; }
        if (src[i] === '\n') break; // texto sin cerrar: no se arrastra el archivo entero
        i++;
      }
      continue;
    }
    // plantilla: el texto no es código, lo de dentro de ${} sí
    if (c === '`') {
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') {
          esCodigo[i] = 0; esCodigo[i + 1] = 0;
          i += 2;
          let llaves = 1;
          // dentro del ${}: marcar como código, respetando textos y comentarios anidados
          while (i < src.length && llaves > 0) {
            const e = src[i]; const f = src[i + 1];
            if (e === '/' && f === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
            if (e === '/' && f === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
            if (e === "'" || e === '"') {
              const cierre2 = e; i++;
              while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === cierre2) { i++; break; }
                if (src[i] === '\n') break;
                i++;
              }
              continue;
            }
            if (e === '`') {
              // plantilla anidada: se deja como no-código (poco frecuente, y vale más no equivocarse)
              i++;
              while (i < src.length) {
                if (src[i] === '\\') { i += 2; continue; }
                if (src[i] === '`') { i++; break; }
                i++;
              }
              continue;
            }
            if (e === '{') llaves++;
            if (e === '}') { llaves--; if (llaves === 0) { i++; break; } }
            esCodigo[i] = 1;
            i++;
          }
          continue;
        }
        i++;
      }
      continue;
    }
    // expresión regular (se distingue de una división por lo que viene antes)
    if (c === '/') {
      const prev = anterior(i);
      const divisionPosible = /[\w$)\]]/.test(prev) || prev === '';
      if (!divisionPosible) {
        i++;
        let enClase = false;
        while (i < src.length) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') enClase = true;
          else if (src[i] === ']') enClase = false;
          else if (src[i] === '/' && !enClase) { i++; break; }
          else if (src[i] === '\n') break;
          i++;
        }
        while (i < src.length && /[a-z]/.test(src[i])) i++; // banderas
        continue;
      }
    }
    esCodigo[i] = 1;
    i++;
  }
  return esCodigo;
}

/** El número de renglón (desde 1) de cada posición. */
export function renglones(src) {
  const r = new Int32Array(src.length + 1);
  let n = 1;
  for (let i = 0; i < src.length; i++) { r[i] = n; if (src[i] === '\n') n++; }
  r[src.length] = n;
  return r;
}
