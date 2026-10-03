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
// El orden NO es decorativo: es el del contrato de papel, columna por columna,
// tal como el dueño lo pasó el 3 de octubre:
//
//   FECHA NAC. | CEDULA O PASAPORTE | EXTENDIDA EN | FECHA EXPIRA |
//   LICENCIA CONDUCIR | LUGAR EMISION | FECHA EXPIRA |
//   DIRECCION REFERENCIA | MUNICIPIO | TELEFONO | CORREO ELECTRONICO
//
// Llenar el formulario es copiar del documento al papel, y el mostrador lo
// hace con el cliente enfrente. Si la pantalla pide los datos en otro orden,
// hay que ir saltando de un lado a otro y ahí es donde se escribe la fecha de
// vencimiento del documento en la casilla de la licencia.
//
// La lista es EXACTAMENTE la del contrato, ni un campo más. El 3 de octubre
// el dueño pidió que quedara igual a lo que él mandó: se quitaron
// `nacionalidad`, `pais`, `licenciaEmision` (la FECHA de emisión — en el papel
// solo va el LUGAR, y ese campo de más era el que hacía parecer que la
// licencia se pedía dos veces) y `facturarA`. Un campo que no se imprime y que
// él no usa es una casilla más que llenar con el cliente esperando.
//
// Quitarlos de esta lista NO borra nada de lo ya guardado: `construirDueno` y
// `construirCliente` arrastran hacia adelante los campos que no conocen (ver
// abajo), así que un cliente viejo conserva su nacionalidad aunque la pantalla
// ya no la pida. Si alguna vez hacen falta, vuelven a esta lista y reaparecen
// con su dato intacto.
//
// Al final van los "adicional": la segunda dirección, que tampoco se imprime.
export const CAMPOS_CLIENTE = [
  { id: 'nombres', etiqueta: 'Nombres', tipo: 'texto' },
  { id: 'apellidos', etiqueta: 'Apellidos', tipo: 'texto' },
  // --- de aquí en adelante, el orden del contrato impreso ---
  { id: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha' },
  { id: 'documento', etiqueta: 'Cédula o pasaporte', tipo: 'texto' },
  { id: 'documentoExtendidoEn', etiqueta: 'Extendida en', tipo: 'texto' },
  { id: 'documentoExpira', etiqueta: 'Fecha expira', tipo: 'fecha' },
  { id: 'licencia', etiqueta: 'Licencia de conducir', tipo: 'texto' },
  { id: 'licenciaEmitidaEn', etiqueta: 'Lugar de emisión', tipo: 'texto' },
  { id: 'licenciaExpira', etiqueta: 'Licencia expira', tipo: 'fecha' },
  { id: 'direccionReferencia', etiqueta: 'Dirección de referencia', tipo: 'texto' },
  { id: 'municipio', etiqueta: 'Municipio', tipo: 'texto' },
  { id: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
  { id: 'correo', etiqueta: 'Correo electrónico', tipo: 'correo' },
  // --- "adicional": la segunda dirección, no se imprime ---
  { id: 'direccionAdicional', etiqueta: 'Dirección adicional', tipo: 'texto' },
  { id: 'ciudadAdicional', etiqueta: 'Ciudad adicional', tipo: 'texto' },
  { id: 'estadoAdicional', etiqueta: 'Estado adicional', tipo: 'texto' },
  { id: 'paisAdicional', etiqueta: 'País adicional', tipo: 'texto' },
  { id: 'telefonoAdicional', etiqueta: 'Teléfono adicional', tipo: 'telefono' },
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
