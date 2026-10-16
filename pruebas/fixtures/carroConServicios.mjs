// Un carro de la flota propia tal como queda guardado, y con servicios registrados como los registra el sistema: el carro
// sale de `construirVehiculo` (pantallas/carros.js) sellado como lo sella `guardarVehiculo` (id, código, `actualizado`), y
// cada servicio pasa por `construirServicio` y `carroConServicio` (nucleo/mantenimiento.js), no se escribe a mano.
//
//   carroPropio()                                         -> un carro recién comprado: sin servicios ni intervalos.
//   carroConServicios(carroPropio(), [
//     { tipo: 'aceite', fecha: '2026-07-03', km: 15000 },
//   ], '2026-10-16')                                       -> con un cambio de aceite hecho el 3 de julio a los 15,000 km.
import { construirVehiculo } from '../../js/pantallas/carros.js';
import { construirServicio, carroConServicio } from '../../js/nucleo/mantenimiento.js';

export function carroPropio({
  id = 'v1', codigo = 1, placas = 'P-111AAA', tipo = 'Pickup', marca = 'Toyota', linea = 'Hilux', color = 'Blanco', modelo = '2022',
} = {}) {
  return {
    ...construirVehiculo({}, {
      id, codigo, placas, tipo, marca, linea, color, modelo,
    }),
    actualizado: 1790000000000,
  };
}

/** Registra `servicios` (`{ tipo, fecha, km }`) en el carro, en ese orden, con ids `s1`, `s2`… Lanza si alguno no pasa `construirServicio`. */
export function carroConServicios(carro, servicios, hoy) {
  return servicios.reduce((actual, crudo, i) => {
    const { servicio, problemas } = construirServicio(crudo, hoy);
    if (!servicio) throw new Error(`El servicio de la prueba no es válido: ${problemas.join(' ')}`);
    return carroConServicio(actual, { ...servicio, id: crudo.id ?? `s${i + 1}` });
  }, carro);
}
