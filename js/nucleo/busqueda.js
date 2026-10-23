// El buscador.
//
// Cada búsqueda normaliza el texto de cada ficha: quita acentos, mayúsculas y
// signos para comparar. Se midió con 5,000 clientes y tarda unas 7 milésimas de
// segundo, así que responde mientras se escribe sin necesidad de guardar el
// texto ya normalizado. Si algún día el negocio crece tanto que se sienta lento,
// ahí sí habría que guardarlo — mientras tanto sería complicar por gusto.

/** Minúsculas, sin acentos y sin signos: '3078-4155' queda '3078 4155'. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // La ñ ya viene convertida en n por la línea de arriba: normalize('NFD')
    // la separa en n + tilde combinatoria, y la anterior la quitó. Así "Peña"
    // se encuentra escribiendo "pena", como debe ser.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Cuántas cifras imprime la hoja en su número rojo: «014591» son seis. Es el único ejemplo que se tiene de la hoja (el dueño la leyó el
 * 23 de octubre de 2026); si la imprenta cambia el ancho, se cambia aquí y en ningún otro lado.
 */
export const DIGITOS_DEL_NUMERO_IMPRESO = 6;

/**
 * Un número tal como se compara contra el del contrato: '014591' -> '14591'. Solo para texto de puros dígitos; cualquier otra cosa devuelve
 * '' (y los ceros solos, '0000', también: no son el número de ningún contrato).
 */
export function numeroSinCeros(texto) {
  const digitos = String(texto ?? '').trim();
  if (!/^\d+$/.test(digitos)) return '';
  return digitos.replace(/^0+/, '');
}

/**
 * Si esta palabra de la consulta es el número de la HOJA —«014591», con sus ceros— devuelve ese número sin ceros ('14591'); si no, ''.
 *
 * Qué cuenta, y por qué tan poco: solo puros dígitos, con un cero adelante y al menos las seis cifras que imprime la hoja. La hoja nunca
 * imprime menos de seis, así que un «012» o un «0123» es un pedazo de otra cosa —unas placas P-012ABC, un teléfono, un DPI— y convertirlo
 * en el contrato 12 o el 123 traería un contrato que nadie pidió. Un buscador que normaliza de más devuelve el contrato de OTRO cliente,
 * y eso es peor que no devolver ninguno. Una palabra que no cumple esto se busca exactamente como siempre.
 */
function numeroDeLaHoja(palabra) {
  if (!palabra.startsWith('0') || palabra.length < DIGITOS_DEL_NUMERO_IMPRESO) return '';
  return numeroSinCeros(palabra);
}

/**
 * ¿La consulta ENTERA es el número de este contrato —«14591», o «014591» tal como lo imprime la hoja— y nada más? Sirve para ponerlo
 * primero entre lo que se encuentra: «459» está dentro de muchos números, pero «14591» es de uno solo.
 */
export function esElNumeroDe(contrato, consulta) {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (palabras.length !== 1) return false;
  const numero = numeroSinCeros(contrato?.numero);
  return Boolean(numero) && (palabras[0] === numero || numeroDeLaHoja(palabras[0]) === numero);
}

/** ¿Está esta palabra en el texto (ya normalizado), tal cual o saltándose los espacios de por medio? */
function palabraEnTexto(texto, sinEspacios, palabra) {
  return texto.includes(palabra) || sinEspacios.includes(palabra);
}

/** Cierto si TODAS las palabras buscadas están en el texto, en cualquier orden. */
export function coincide(textoBuscable, consulta) {
  const texto = normalizar(textoBuscable);
  const sinEspacios = texto.replace(/ /g, '');
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return true;
  return palabras.every((p) => palabraEnTexto(texto, sinEspacios, p));
}

/**
 * Todo lo buscable de un cliente, en un solo texto.
 *
 * `nombres` y `apellidos` (nucleo/cliente.js, Tarea 1) van cada uno en un solo
 * campo, no en los viejos `nombre1`/`nombre2`/`apellido1`/`apellido2` de
 * cuatro campos — esta función tenía que alinearse con eso, si no la pantalla
 * de clientes (Tarea 6) no encontraría a nadie que ella misma diera de alta.
 *
 * Puente (fix round 1, hallazgo Crítico de la revisión): también se buscan
 * los cuatro campos viejos, además de los dos nuevos. `sacarCarro.js`
 * todavía guarda clientes con la forma vieja (se migra en la Tarea 7), y ya
 * hay clientes guardados así antes de este cambio — sin este puente, el
 * mostrador busca "Mendoza", no encuentra a nadie que sí existe, y da de
 * alta al mismo cliente otra vez.
 */
export function textoDeCliente(c) {
  return [c?.nombres, c?.apellidos, c?.nombre1, c?.nombre2, c?.apellido1, c?.apellido2,
    c?.documento, c?.licencia, c?.telefono, c?.telefonoAdicional, c?.correo].filter(Boolean).join(' ');
}

/**
 * Todo lo buscable de un contrato.
 *
 * `numero` es el del contador de la nube, que el dueño dijo (23 de octubre de 2026) que coincide con el número rojo preimpreso de sus
 * hojas. Si algún día deja de coincidir —una hoja echada a perder, una usada fuera de orden, un contrato guardado dos veces— buscar aquí
 * el número impreso en el papel de un cliente encuentra el contrato de OTRO cliente, o ninguno, sin ningún aviso: ver el riesgo en
 * `siguienteNumeroContrato` (datos.js) y §8b punto 18 del diseño.
 *
 * El papel imprime «014591», con ceros a la izquierda, y aquí el número es 14591. Eso lo resuelve `filtrarContratos` (abajo), no este
 * texto: por eso todo lo que filtra contratos tiene que pasar por ella y no por `filtrar(…, textoDeContrato)` a secas.
 */
export function textoDeContrato(c) {
  return [c?.numero, c?.clienteNombre, c?.carroPlacas, c?.carroDescripcion, c?.rentadoPor]
    .filter(Boolean).join(' ');
}

/**
 * Todo lo buscable de un carro de la flota: las placas, que es lo que se teclea con el carro enfrente, y la marca y la línea, que es lo que
 * dice el cuadro del carro en la flota. No lleva el color, el tipo ni el dueño: «blanco» o «sedán» traerían media flota.
 */
export function textoDeCarro(c) {
  return [c?.placas, c?.marca, c?.linea].filter(Boolean).join(' ');
}

/**
 * Filtra una lista con el texto buscable que le corresponde a cada elemento.
 *
 * `numerosDe(item)`, si se da, devuelve los NÚMEROS de ese elemento que el papel imprime (para un contrato, `[numero]`). Con ella, una
 * palabra de la consulta escrita como en la hoja («014591») encuentra el elemento cuyo número vale lo mismo sin los ceros, y ese número y
 * no otro: la comparación es de igualdad, no de «está dentro», así que «014591» no trae el 114591 ni el 145910. Sin ella, ninguna palabra
 * se trata como número de hoja y todo busca como siempre: clientes, carros y dueños no pasan nada y no cambian.
 */
export function filtrar(items, consulta, textoDe, numerosDe) {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return items;
  // Una sola vez por búsqueda, no por contrato: casi nunca hay una palabra así, y entonces no se mira ningún número.
  const deLaHoja = numerosDe ? palabras.map(numeroDeLaHoja) : [];
  const hayAlguna = deLaHoja.some(Boolean);
  return items.filter((item) => {
    const texto = normalizar(textoDe(item));
    const sinEspacios = texto.replace(/ /g, '');
    const numeros = hayAlguna ? numerosDe(item).map(numeroSinCeros).filter(Boolean) : [];
    return palabras.every((p, i) => palabraEnTexto(texto, sinEspacios, p) || (deLaHoja[i] && numeros.includes(deLaHoja[i])));
  });
}

/**
 * Filtra contratos: su texto buscable (`textoDeContrato`) y, además, su número tal como lo imprime la hoja. Es el ÚNICO camino para
 * buscar contratos —«Contratos» y la caja de arriba de todo pasan por aquí—, para que la regla de los ceros viva una sola vez.
 */
export function filtrarContratos(contratos, consulta) {
  return filtrar(contratos, consulta, textoDeContrato, (c) => [c?.numero]);
}
