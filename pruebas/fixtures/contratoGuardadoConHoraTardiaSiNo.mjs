// Un contrato tal como QUEDÓ GUARDADO mientras «Hora tardía» era una casilla
// de sí/no: `horaTardia: true`, sin ningún monto.
//
// No es un contrato inventado para la prueba: es exactamente lo que escribían
// `construirContrato` (pantallas/sacarCarro.js) y `contratoParaGuardar`
// (datos.js) en el commit bf3041e, cuando se les daba la casilla marcada —
// cada llave, cada tipo, y también la que esos contratos NO traían todavía (no
// hay `cierre`, porque el carro seguía afuera al guardarse). Así una prueba que
// lo use ve el documento que de verdad hay en la nube, no la forma que hoy
// armaría el código.
//
// Por qué importa: `true` quiere decir «hubo una hora tardía y nadie anotó
// cuánto», y la cifra no se sabe. Ninguna regla puede convertirlo en un monto
// (con `q()` a secas valdría Q1.00), ni cambiar el total de un contrato que ya
// se cobró y se cerró con él.
//
// Es una función, y devuelve un objeto nuevo cada vez, para que una prueba
// pueda tocarlo sin contagiar a la siguiente.
export const contratoGuardadoConHoraTardiaSiNo = () => ({
  id: 'c-viejo-1',
  numero: 42,
  clienteId: 'k1',
  clienteNombre: 'Juan Pérez',
  ajeno: false,
  carroId: 'v1',
  carroAjeno: null,
  duenoId: null,
  subarriendo: null,
  carroPlacas: 'P-999TST',
  carroDescripcion: 'Toyota Corolla',
  fechaSalida: '2026-09-23',
  horaSalida: '22:30',
  lugar: 'Oficina',
  dias: 4,
  precioDia: 700,
  kmSalida: 45000,
  combustibleSalida: 'Lleno',
  horaTardia: true,
  devolucionPrevista: '2026-09-27',
  seguroDia: 0,
  seguroTercerosDia: 0,
  seguroMenoresDia: 0,
  seguroPaiDia: 0,
  deducible: 0,
  deducibleBajo: 0,
  cartaPoderDestino: 'Ciudad de Guatemala',
  cartaPoderPrecio: 350,
  variosDescripcion: '',
  variosPrecio: 0,
  tarjetas: [{
    ultimos4: '3343', vencimiento: '08/28', banco: 'BAC', autorizacion: 'A1', montoAutorizado: 5000,
  }],
  garantiaMonto: 5000,
  garantiaLiberada: false,
  pagos: [{
    monto: 3150, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-09-23',
  }],
  rentadoPor: 'Ana',
  porcentajeComision: 5,
  conductorAdicional: { nombre: '', licencia: '', identificacion: '' },
  observaciones: '',
  estado: 'rentado',
  actualizado: 1790000000300,
});
