// Contratos en los cuatro puntos de una cuenta, tal como QUEDAN GUARDADOS: armados con las mismas funciones que
// los arman de verdad — `construirContrato` («Sacar carro»), `construirCierre` («Recibir carro») y
// `contratoParaGuardar` (datos.js, que sella `estado`) —, no objetos escritos a mano con las llaves que la prueba
// necesita. Llevan cada llave y cada tipo de uno guardado (§7b del diseño).
//
//   rentadoAlDia()         -> sigue afuera, pagado completo (Q2,800): ni debe ni se le debe.
//   rentadoConSobrepago()  -> sigue afuera, pero se cobró de más al salir (Q3,000 por Q2,800): Q200 a favor.
//   devueltoDebiendo()     -> ya volvió con Q200 de daños sin cobrar: carro en el patio, contrato abierto.
//   cerradoAlDia()         -> ya volvió, pagó todo, sin tarjeta que soltar: cerrado, saldo 0.
//   cerradoConCredito()    -> el caso de H-9: un cierre limpio ya guardado y pagado al que después se le CORRIGE
//                             el descuento a Q1,400 desde «Recibir carro»; la corrección pasa por las funciones de
//                             esa pantalla (`valoresIniciales` y `construirCierre`) y deja Q1,400 a favor.
import { construirContrato } from '../../js/pantallas/sacarCarro.js';
import { valoresIniciales } from '../../js/pantallas/recibirCarro.js';
import { construirCierre } from '../../js/nucleo/cierre.js';
import { contratoParaGuardar } from '../../js/datos.js';
import { contratoDeUnCarro } from './contratoDeUnCarro.mjs';

const AHORA = 1790000000000;

/** Un carro de la flota, 4 días a Q700 (Q2,800), pagado completo en efectivo al salir. `montoPago` cambia lo pagado. */
function salidaPagada({ id, numero, montoPago = 2800 }) {
  return construirContrato({
    id,
    numero,
    cliente: { id: 'k1', nombres: 'Juan', apellidos: 'Pérez' },
    ajeno: false,
    carro: { id: 'v1', placas: 'P-111AAA', marca: 'Toyota', linea: 'Hilux', color: 'Blanco' },
    fechaSalida: '2026-10-03',
    dias: 4,
    precioDia: 700,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  });
}

const CIERRE_LIMPIO = {
  fechaReal: '2026-10-07', horaReal: '10:00', lugarEntrada: 'Oficina', kmEntrada: 100, combustible: 0, danos: 0, varios: 0, descuento: 0,
};

/** Lo que queda guardado en la nube. */
const guardadoDe = (c) => contratoParaGuardar(c, { id: c.id, numero: c.numero, ahora: AHORA });

/** Todavía afuera, pagado completo: no debe ni se le debe. */
export const rentadoAlDia = () => guardadoDe(salidaPagada({ id: 'c-afuera', numero: 61 }));
/** Todavía afuera, pero el mostrador cobró de más en la salida (Q3,000 por una renta de Q2,800). */
export const rentadoConSobrepago = () => guardadoDe(salidaPagada({ id: 'c-sobrepago', numero: 62, montoPago: 3000 }));
/** Ya volvió con Q200 de daños sin cobrar: el carro está en el patio pero el contrato sigue abierto. */
export const devueltoDebiendo = () => contratoDeUnCarro({
  id: 'c-debe', numero: 63, fechaSalida: '2026-10-03', dias: 4, recibidoEl: '2026-10-07', danos: 200,
});
/** Ya volvió, pagó todo y no hay tarjeta que soltar: cerrado, saldo 0. */
export const cerradoAlDia = () => contratoDeUnCarro({
  id: 'c-cerrado', numero: 64, fechaSalida: '2026-10-03', dias: 4, recibidoEl: '2026-10-07', danos: 0,
});
/**
 * El caso de H-9, tal como lo hizo el dueño: un cierre limpio ya guardado y pagado (Q2,800) al que después se le
 * CORRIGE el descuento a Q1,400 desde «Recibir carro». La corrección pasa por las mismas funciones que usa esa
 * pantalla (`valoresIniciales` y `construirCierre`) y deja al cliente con Q1,400 a favor.
 */
export const cerradoConCredito = () => {
  const cerrado = guardadoDe(construirCierre(salidaPagada({ id: 'c-credito', numero: 65 }), CIERRE_LIMPIO));
  const corregido = construirCierre(cerrado, { ...valoresIniciales(cerrado), descuento: 1400 });
  return guardadoDe(corregido);
};

