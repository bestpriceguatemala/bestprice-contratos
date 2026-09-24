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

/** Cierto si TODAS las palabras buscadas están en el texto, en cualquier orden. */
export function coincide(textoBuscable, consulta) {
  const texto = normalizar(textoBuscable);
  const sinEspacios = texto.replace(/ /g, '');
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return true;
  return palabras.every((p) => texto.includes(p) || sinEspacios.includes(p));
}

/** Todo lo buscable de un cliente, en un solo texto. */
export function textoDeCliente(c) {
  return [c?.apellido1, c?.apellido2, c?.nombre1, c?.nombre2,
    c?.documento, c?.licencia, c?.telefono, c?.telefonoAdicional, c?.correo].filter(Boolean).join(' ');
}

/** Todo lo buscable de un contrato. */
export function textoDeContrato(c) {
  return [c?.numero, c?.clienteNombre, c?.carroPlacas, c?.carroDescripcion, c?.rentadoPor]
    .filter(Boolean).join(' ');
}

/** Filtra una lista con el texto buscable que le corresponde a cada elemento. */
export function filtrar(items, consulta, textoDe) {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return items;
  return items.filter((item) => {
    const texto = normalizar(textoDe(item));
    const sinEspacios = texto.replace(/ /g, '');
    return palabras.every((p) => texto.includes(p) || sinEspacios.includes(p));
  });
}
