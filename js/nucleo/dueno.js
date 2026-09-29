// La ficha del dueño de carro subarrendado.
//
// Un dueño es quien se deja usar el carro por Best Price a cambio de una renta
// diaria. Espejo simplificado de cliente.js: cuatro campos, uno obligatorio.

/**
 * Lista de campos que viven en la ficha del dueño, en el orden en que se piden.
 * Cada campo describe id, etiqueta (lo que ve el dueño) y tipo.
 * Las pantallas dibujan el formulario desde aquí, así la alta rápida y la ficha
 * nunca se desincronizan.
 */
export const CAMPOS_DUENO = [
  { id: 'nombre', etiqueta: 'Nombre', tipo: 'texto' },
  { id: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
  { id: 'nit', etiqueta: 'NIT', tipo: 'texto' },
  { id: 'nota', etiqueta: 'Nota', tipo: 'texto' },
];

/**
 * Construye el objeto dueño para guardar, preservando campos que no vienen
 * del formulario. La copia local en IndexedDB se reemplaza entera, así que lo
 * que no se copia aquí desaparece de la pantalla aunque siga en la nube —
 * por eso es crítico hacer un merge. El mismo error que nos costó un carro:
 * si no se arrastra el existente, campos que la pantalla no mostró se pierden.
 */
export function construirDueno(existente, campos) {
  const merged = { ...existente, ...campos };

  // Recortar espacios de todos los campos de texto
  Object.keys(merged).forEach((key) => {
    if (typeof merged[key] === 'string') {
      merged[key] = merged[key].trim();
    }
  });

  return merged;
}

/**
 * Nombres de los campos obligatorios que están vacíos. Solo nombre es
 * obligatorio — el resto es opcional porque se puede guardar un dueño
 * sin datos de contacto.
 */
export function faltaAlgoEnDueno(dueno) {
  const falta = [];

  const nombre = (dueno?.nombre || '').trim();
  if (!nombre) falta.push('Nombre');

  return falta;
}

/**
 * Nombre, teléfono y NIT juntos en un texto — para que el buscador encuentre
 * al dueño por cualquiera de los tres.
 */
export function textoDeDueno(dueno) {
  const partes = [];

  const nombre = (dueno?.nombre || '').trim();
  if (nombre) partes.push(nombre);

  const telefono = (dueno?.telefono || '').trim();
  if (telefono) partes.push(telefono);

  const nit = (dueno?.nit || '').trim();
  if (nit) partes.push(nit);

  return partes.join(' ');
}
