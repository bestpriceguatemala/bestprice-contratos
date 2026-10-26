// Lee las reglas de css/estilos.css para las pruebas de la hoja de impresión: lo único que se puede comprobar desde Node de algo que solo
// se ve en el papel. Una regla cuenta SI TRAE SUS DECLARACIONES (no basta con que el nombre de la clase aparezca en algún lado del archivo,
// ni dentro de un comentario), y se sabe si está dentro de `@media print`.
//
//   const css = reglasDeCss(leer('../css/estilos.css'));
//   css.declara('.comp-sin-corte', 'white-space: nowrap')              // en cualquier parte
//   css.declaraAlImprimir('.comp-cola', 'break-inside: avoid')         // solo dentro de @media print
//
// Un selector se busca TAL CUAL está escrito en una lista (`a, b { ... }` declara para `a` y para `b`), con los espacios normalizados.

const normaliza = (texto) => texto.replace(/\s+/g, ' ').trim();

/** Dónde empieza y dónde termina el bloque `@media print { ... }` (emparejando llaves), en el texto ya sin comentarios. */
function bloqueDeImpresion(texto) {
  const desde = texto.indexOf('@media print');
  if (desde < 0) return [-1, -1];
  let nivel = 0;
  for (let i = texto.indexOf('{', desde); i < texto.length; i += 1) {
    if (texto[i] === '{') nivel += 1;
    if (texto[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return [desde, i];
    }
  }
  return [desde, texto.length];
}

export function reglasDeCss(css) {
  const texto = css.replace(/\/\*[^]*?\*\//g, '');
  const [desdeImpresion, hastaImpresion] = bloqueDeImpresion(texto);
  const reglas = [...texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => !m[1].trim().startsWith('@media'))
    .map((m) => ({
      selectores: m[1].split(',').map(normaliza),
      declaraciones: m[2].split(';').map(normaliza).filter(Boolean),
      alImprimir: m.index > desdeImpresion && m.index < hastaImpresion,
    }));
  const buscar = (selector, declaracion, { soloImpresion = false } = {}) => reglas.some((r) => (
    r.selectores.includes(normaliza(selector))
    && r.declaraciones.includes(normaliza(declaracion))
    && (!soloImpresion || r.alImprimir)
  ));
  return {
    reglas,
    declara: (selector, declaracion) => buscar(selector, declaracion),
    declaraAlImprimir: (selector, declaracion) => buscar(selector, declaracion, { soloImpresion: true }),
  };
}
