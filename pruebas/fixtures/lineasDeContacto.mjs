// Las líneas del bloque de contacto del membrete tal como las lee quien recibe el papel: sin etiquetas (los <span class="comp-sin-corte"> no
// cambian ni una letra), con los saltos de <br> como separación y las entidades de vuelta a su carácter. Sirve para comprobar que el
// membrete que sale es EXACTAMENTE el que el dueño aprobó (`MEMBRETE.contacto`), aunque lleve etiquetas alrededor de los números.
const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function lineasDeContacto(html) {
  const bloque = /<p class="comp-contacto">([^]*?)<\/p>/.exec(html);
  if (!bloque) throw new Error('el HTML no trae el bloque de contacto del membrete');
  return bloque[1]
    .split('<br>')
    .map((linea) => linea.replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e]));
}
