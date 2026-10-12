// Lo que ya existe: placas repetidas en la flota y documento (DPI) repetido entre clientes.
//
// Dos carros con las mismas placas, o la misma persona dada de alta dos veces, parten el historial de renta
// en dos, y quien lleva el negocio no puede saber cuál registro es el de verdad (H-10, prueba del sistema
// del 7 oct 2026). Esto lo detecta ANTES de guardar.
//
// Por qué se AVISA, y por qué nunca se bloquea: él tiene una regla clara contra los avisos
// («yo pongo el precio que yo quiera, así que no me tires avisos»). Esa regla es sobre su JUICIO de negocio
// —precio, días, riesgo— que es suyo y no del sistema. Una placa repetida no es un juicio: es casi seguro
// un desliz, y él quiere enterarse antes de guardar. Pero puede ser a propósito (un carro que volvió a
// entrar a la flota), así que:
//   - el aviso NOMBRA lo que ya existe (qué carro, qué cliente) para que él distinga un error de un
//     registro hecho a propósito, y
//   - dice que puede guardar de todos modos. Estas funciones solo devuelven texto; ninguna pantalla las
//     consulta para decidir si guarda, y ninguna lo hace modal.
//
// Todo es puro, sin DOM ni Firestore, para probarlo solo. Los nombres de los campos son los de §7b:
// del carro `codigo`, `placas`, `marca`, `linea`, `color`, `modelo`, `fueraDeServicio`; del cliente
// `documento` (la «Cédula o pasaporte» de la ficha, el DPI de todos los días) y `telefono`.
import { normalizar } from './busqueda.js';
import { nombreCompleto } from './cliente.js';

/**
 * La clave con la que se comparan dos placas o dos documentos: sin mayúsculas, acentos, espacios ni
 * guiones. 'P-234IFN', 'p 234 ifn' y 'P234-IFN' son la misma placa; '2345 67890 0101' y '2345678900101' son
 * el mismo DPI. Vacío ('') si lo escrito no puede ser un número de verdad —una placa, un DPI y un
 * pasaporte siempre traen al menos un dígito—, y entonces NO se compara: quien no tiene documento a veces
 * escribe «N/A» o «ninguno», y dos así no son la misma persona (ni dos carros «sin placas», el mismo carro).
 */
export function claveDeNumero(texto) {
  const clave = normalizar(texto).replace(/ /g, '');
  return /\d/.test(clave) ? clave : '';
}

function conLaMismaClave(lista, clave, campo, exceptoId) {
  if (!clave || !Array.isArray(lista)) return [];
  return lista.filter((r) => r && r.id !== exceptoId && claveDeNumero(r[campo]) === clave);
}

/**
 * Los carros de la flota que ya tienen estas placas. `exceptoId` es el carro que se está EDITANDO: él mismo
 * no cuenta como repetido de sí mismo.
 */
export function carrosConLasMismasPlacas(placas, flota, { exceptoId } = {}) {
  return conLaMismaClave(flota, claveDeNumero(placas), 'placas', exceptoId);
}

/** Los clientes que ya tienen este documento. `exceptoId` es el cliente que se está editando. */
export function clientesConElMismoDocumento(documento, clientes, { exceptoId } = {}) {
  return conLaMismaClave(clientes, claveDeNumero(documento), 'documento', exceptoId);
}

// Lo que puede hacer, según sea un registro nuevo (todavía se puede evitar) o uno que ya existe y se está
// editando (si es el mismo, ya quedó repetido). En los dos dice que puede guardar: no se bloquea.
const PIE_CARRO = 'Si es el mismo carro, no hace falta registrarlo dos veces; si es otro, puedes guardar de todos modos.';
const PIE_CARRO_EDITANDO = 'Si es el mismo carro, ya está registrado dos veces; si es otro, puedes guardar de todos modos.';
const PIE_CLIENTE = 'Si es la misma persona, búscala en la lista en lugar de darla de alta otra vez: su historial de rentas '
  + 'quedaría partido en dos. Si es otra, puedes guardar de todos modos.';
const PIE_CLIENTE_EDITANDO = 'Si es la misma persona, ya está registrada dos veces y su historial de rentas queda partido en dos. '
  + 'Si es otra, puedes guardar de todos modos.';

/** «Carro 12 · P-234IFN · Toyota Hilux · Blanco · 2022», sin huecos ni puntos sueltos si falta algo. */
function renglonDeCarro(c) {
  return [
    c.codigo ? `Carro ${c.codigo}` : '',
    c.placas,
    [c.marca, c.linea].filter(Boolean).join(' '),
    c.color,
    c.modelo,
    c.fueraDeServicio ? 'fuera de servicio' : '',
  ].filter(Boolean).join(' · ');
}

/** «Juan Pérez · documento 2345 67890 0101 · tel. 5555-0000», tal como se escribió en la ficha. */
function renglonDeCliente(c) {
  return [
    nombreCompleto(c) || 'Cliente sin nombre',
    c.documento ? `documento ${c.documento}` : '',
    c.telefono ? `tel. ${c.telefono}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * El aviso de placas repetidas, o `null` si no hay nada que decir.
 *
 * `{ titulo, filas, pie }`: la frase, un renglón por carro que ya existe, y lo que puede hacer. `exceptoId`
 * es el carro que se edita (si lo hay, el título dice «otro carro»). `noSePudoLeer` es que la lista de la
 * flota no llegó completa: si no se encontró coincidencia no se calla, porque «no encontré nada» en una
 * lista que falló no significa «no hay nada» (la regla más vieja de este sistema, vacío ≠ falló). Sin
 * placas escritas no hay nada que comprobar y tampoco nada que decir.
 */
export function avisoDeCarroRepetido({
  placas, flota, exceptoId, noSePudoLeer = false,
}) {
  if (!claveDeNumero(placas)) return null;
  const repetidos = carrosConLasMismasPlacas(placas, flota, { exceptoId });
  if (repetidos.length) {
    const otro = exceptoId ? 'otro ' : '';
    const titulo = repetidos.length === 1
      ? `Ya hay ${otro ? 'otro carro' : 'un carro'} con estas placas.`
      : `Ya hay ${repetidos.length} ${otro ? 'otros ' : ''}carros con estas placas.`;
    return { titulo, filas: repetidos.map(renglonDeCarro), pie: exceptoId ? PIE_CARRO_EDITANDO : PIE_CARRO };
  }
  if (noSePudoLeer) {
    return {
      titulo: 'No se pudo leer la flota, así que no se sabe si estas placas ya están registradas.',
      filas: [],
      pie: '',
    };
  }
  return null;
}

/** El aviso de documento repetido entre clientes: lo mismo que `avisoDeCarroRepetido`, para personas. */
export function avisoDeClienteRepetido({
  documento, clientes, exceptoId, noSePudoLeer = false,
}) {
  if (!claveDeNumero(documento)) return null;
  const repetidos = clientesConElMismoDocumento(documento, clientes, { exceptoId });
  if (repetidos.length) {
    const otro = exceptoId ? 'otro ' : '';
    const titulo = repetidos.length === 1
      ? `Ya hay ${otro ? 'otro cliente' : 'un cliente'} con este documento.`
      : `Ya hay ${repetidos.length} ${otro ? 'otros ' : ''}clientes con este documento.`;
    return { titulo, filas: repetidos.map(renglonDeCliente), pie: exceptoId ? PIE_CLIENTE_EDITANDO : PIE_CLIENTE };
  }
  if (noSePudoLeer) {
    return {
      titulo: 'No se pudo leer la lista de clientes, así que no se sabe si este documento ya está registrado.',
      filas: [],
      pie: '',
    };
  }
  return null;
}
