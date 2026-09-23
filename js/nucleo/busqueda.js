// El buscador.
//
// Busca sobre un texto armado de antemano con todo lo buscable de cada ficha.
// Se normaliza una sola vez, no en cada tecla: así el buscador responde mientras
// se escribe aunque haya miles de clientes.

/** Minúsculas, sin acentos y sin signos: '3078-4155' queda '3078 4155'. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
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
  return items.filter((item) => coincide(textoDe(item), consulta));
}
