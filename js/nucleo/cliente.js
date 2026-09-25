// La ficha del cliente.
//
// Los campos salen de la hoja CLIENTES de su Excel, con un cambio que él pidió:
// nombres y apellidos van en dos campos y no en cuatro. Todo lo demás se queda
// porque va impreso en el contrato: se necesita la dirección de referencia, el
// correo y los datos del documento y la licencia.

/**
 * Lista de campos que va impreso en el contrato, en el orden en que se piden.
 * Cada campo describe id, etiqueta (lo que ve el dueño) y tipo.
 * Las pantallas dibujan el formulario desde aquí, así el alta rápida y la ficha
 * nunca se desincronizan.
 */
export const CAMPOS_CLIENTE = [
  { id: 'nombres', etiqueta: 'Nombres', tipo: 'texto' },
  { id: 'apellidos', etiqueta: 'Apellidos', tipo: 'texto' },
  { id: 'nacionalidad', etiqueta: 'Nacionalidad', tipo: 'texto' },
  { id: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha' },
  { id: 'documento', etiqueta: 'Documento', tipo: 'texto' },
  { id: 'documentoExtendidoEn', etiqueta: 'Documento extendido en', tipo: 'texto' },
  { id: 'documentoExpira', etiqueta: 'Documento expira', tipo: 'fecha' },
  { id: 'licencia', etiqueta: 'Licencia', tipo: 'texto' },
  { id: 'licenciaEmitidaEn', etiqueta: 'Licencia emitida en', tipo: 'texto' },
  { id: 'licenciaEmision', etiqueta: 'Licencia emisión', tipo: 'fecha' },
  { id: 'licenciaExpira', etiqueta: 'Licencia expira', tipo: 'fecha' },
  { id: 'direccionReferencia', etiqueta: 'Dirección de referencia', tipo: 'texto' },
  { id: 'municipio', etiqueta: 'Municipio', tipo: 'texto' },
  { id: 'pais', etiqueta: 'País', tipo: 'texto' },
  { id: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
  { id: 'correo', etiqueta: 'Correo', tipo: 'correo' },
  { id: 'direccionAdicional', etiqueta: 'Dirección adicional', tipo: 'texto' },
  { id: 'ciudadAdicional', etiqueta: 'Ciudad adicional', tipo: 'texto' },
  { id: 'estadoAdicional', etiqueta: 'Estado adicional', tipo: 'texto' },
  { id: 'paisAdicional', etiqueta: 'País adicional', tipo: 'texto' },
  { id: 'telefonoAdicional', etiqueta: 'Teléfono adicional', tipo: 'telefono' },
  { id: 'facturarA', etiqueta: 'Facturar a', tipo: 'texto' },
];

/**
 * Construye el objeto cliente para guardar, preservando campos que no vienen
 * del formulario. La copia local en IndexedDB se reemplaza entera, así que lo
 * que no se copia aquí desaparece de la pantalla aunque siga en la nube —
 * por eso es crítico hacer un merge. El mismo error que nos costó un carro:
 * si no se arrastra el existente, campos que la pantalla no mostró se pierden.
 */
export function construirCliente(existente, campos) {
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
 * Nombres y apellidos ya resueltos: los de la forma nueva (`nombres`,
 * `apellidos`) si el cliente ya los tiene, o si no, los que se puedan armar
 * con la forma vieja de cuatro campos (`nombre1`, `nombre2`, `apellido1`,
 * `apellido2`) — la que `sacarCarro.js` todavía escribe hoy (se migra en la
 * Tarea 7) y la que ya tienen los clientes guardados antes de este cambio.
 *
 * Puente de solo lectura, igual en espíritu al de `recibirCarro.js` para
 * `kilometrajeSalida` → `kmSalida`: no escribe nada, solo dice qué mostrar.
 * Sin esto, un cliente guardado con la forma vieja se ve sin nombre en toda
 * la pantalla de clientes (la lista, el buscador, la ficha) — el mostrador
 * busca "Mendoza", no encuentra a nadie, y crea al mismo señor otra vez.
 */
export function nombresResueltos(cliente) {
  const nombres = (cliente?.nombres || '').trim()
    || [cliente?.nombre1, cliente?.nombre2].filter(Boolean).join(' ').trim();
  const apellidos = (cliente?.apellidos || '').trim()
    || [cliente?.apellido1, cliente?.apellido2].filter(Boolean).join(' ').trim();
  return { nombres, apellidos };
}

/** El nombre completo como se lee en el contrato: "NOMBRES APELLIDOS". */
export function nombreCompleto(cliente) {
  const { nombres, apellidos } = nombresResueltos(cliente);

  if (!nombres || !apellidos) return '';

  return `${nombres} ${apellidos}`;
}

/**
 * Nombres de los campos obligatorios que están vacíos. Solo nombres y apellidos
 * son obligatorios — el resto es opcional porque el contrato se puede guardar
 * sin algunos datos adicionales.
 */
export function faltaAlgo(cliente) {
  const falta = [];

  const nombres = (cliente?.nombres || '').trim();
  if (!nombres) falta.push('Nombres');

  const apellidos = (cliente?.apellidos || '').trim();
  if (!apellidos) falta.push('Apellidos');

  return falta;
}
