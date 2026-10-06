// Un contrato tal como QUEDÓ GUARDADO durante las pocas horas en que «Hora
// tardía — precio» se escribía al SALIR el carro: `horaTardia: 150`, un número
// en el contrato mismo (no en `cierre`), cobrado dentro del total de la salida.
//
// No es un contrato inventado para la prueba: es exactamente lo que escribían
// `construirContrato` (pantallas/sacarCarro.js) y `contratoParaGuardar`
// (datos.js) en el commit 9d17437, corridos con 150 en ese campo — cada llave y
// cada tipo, y sin `cierre`, porque el carro seguía afuera al guardarse. El
// pago de la salida es el total de entonces: 2,800 de renta + 150 de hora tardía
// + 350 de carta poder = 3,300, con 12 % de tarjeta.
//
// Por qué importa: el dueño dijo después que la hora tardía se cobra «solo al
// devolver», y el cobro se mudó al cierre (`cierre.horaTardia`). Pero este
// contrato ya se guardó, ya se cobró así y ya mostró Q3,300.00 al salir: moverle
// el cobro a otro lado sin avisar le cambiaría el total y le dejaría un saldo
// que nadie anotó. Por eso este número se sigue leyendo donde se guardó.
//
// Es una función, y devuelve un objeto nuevo cada vez, para que una prueba
// pueda tocarlo sin contagiar a la siguiente.
export const contratoGuardadoConHoraTardiaAlSalir = () => ({
  id: 'c-viejo-2',
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
  horaTardia: 150,
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
    monto: 3300, forma: 'tarjeta', porcentajeTarjeta: 12, fecha: '2026-09-23',
  }],
  rentadoPor: 'Ana',
  porcentajeComision: 5,
  conductorAdicional: { nombre: '', licencia: '', identificacion: '' },
  observaciones: '',
  estado: 'rentado',
  actualizado: 1790000000400,
});
