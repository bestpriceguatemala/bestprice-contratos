// Lo que decide la caja de búsqueda de arriba de todo (§6 del diseño, «Buscador general»), sin DOM y sin nube.
//
// Aquí NO hay reglas de búsqueda: qué coincide con qué vive en `busqueda.js` (acentos, orden de las palabras, el número de la hoja…) y
// esto solo la llama, una vez por clase de cosa. Lo que sí se decide aquí es lo que la caja agrega: cuántas filas se enseñan de cada
// clase, en qué orden, a dónde lleva cada una y qué se le dice cuando no hay nada que enseñar.
//
// Tres clases de cosa, cada una con la ficha a la que lleva (las mismas que ya abren las pantallas de Clientes, Carros y Contratos):
//   - clientes  -> #/clientes/:id    (nombre, apellido, DPI, licencia, teléfono, correo)
//   - carros    -> #/carros/:id      (placas, marca, línea; solo la flota propia: un carro ajeno no entra a `vehiculos`)
//   - contratos -> #/contratos/:id   (número —también el de la hoja, «014591»—, cliente, placas, carro; no quién lo rentó)
// Un contrato de un carro ajeno se encuentra por sus placas aquí: es la única forma, porque ese carro no tiene ficha.
//
// Qué NO alcanza (a propósito, ver el informe del 23 de octubre de 2026): reservaciones (§6 no las nombra), dueños de carros y
// empleados (viven detrás de la contraseña de dinero y esta caja no la pide), comprobantes de pago.
import {
  filtrar, filtrarContratos, textoDeCliente, textoDeCarro, esElNumeroDe,
} from './busqueda.js';
import { nombreCompleto } from './cliente.js';

/** Cuántas filas se enseñan de cada clase. El resto se cuenta («y 14 más») y se alcanza escribiendo un poco más. */
export const FILAS_POR_GRUPO = 6;

export const TITULOS = { clientes: 'Clientes', carros: 'Carros', contratos: 'Contratos' };

// El orden de los grupos es el del letrero de la caja: «cliente, placas o número de contrato».
export const ORDEN_DE_LOS_GRUPOS = ['clientes', 'carros', 'contratos'];

const CARPETAS = { clientes: 'clientes', carros: 'carros', contratos: 'contratos' };

/** A dónde lleva una fila: la dirección de la ficha (la misma que usan las listas de cada pantalla). */
export function rutaDe(tipo, id) {
  return `#/${CARPETAS[tipo]}/${encodeURIComponent(id)}`;
}

/** Lo más reciente primero, como ordena «Contratos»; a igual fecha, el número mayor. */
function masNuevoPrimero(a, b) {
  const fa = a?.fechaSalida || '';
  const fb = b?.fechaSalida || '';
  if (fa !== fb) return fa < fb ? 1 : -1;
  return (Number(b?.numero) || 0) - (Number(a?.numero) || 0);
}

const porNombre = (a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es');
const porPlacas = (a, b) => String(a?.placas || '').localeCompare(String(b?.placas || ''), 'es');

/**
 * Los contratos que coinciden, en el orden en que se enseñan: primero el que ES el número escrito (si se escribió «14591», el contrato
 * 14591 antes que el 114591 o el 145910, que solo lo llevan dentro), después lo más reciente. Sin esto, con miles de contratos el que
 * se busca quedaría cortado por el límite de filas.
 */
function contratosEnOrden(contratos, consulta) {
  const encontrados = filtrarContratos(contratos, consulta, { empleado: false }).filter((c) => c?.id);
  const exactos = [];
  const demas = [];
  for (const c of encontrados) (esElNumeroDe(c, consulta) ? exactos : demas).push(c);
  return [...exactos.sort(masNuevoPrimero), ...demas.sort(masNuevoPrimero)];
}

function grupo(tipo, encontrados, limite) {
  const filas = encontrados.slice(0, limite).map((dato) => ({
    tipo, id: dato.id, ruta: rutaDe(tipo, dato.id), dato,
  }));
  return {
    tipo, titulo: TITULOS[tipo], total: encontrados.length, filas, faltan: encontrados.length - filas.length,
  };
}

/**
 * Busca `consulta` en las tres listas y devuelve los grupos que tienen algo (los que no, no salen), con `total` = todo lo que coincidió
 * (no solo lo que se enseña). `filas` es lo que se enseña, y es lo único que se puede abrir de un clic o con Enter.
 *
 * Sin palabras (vacía o solo espacios) no hay búsqueda: `vacia`, ningún grupo. No devuelve «todo» como hace `filtrar` con una lista:
 * una caja que contesta con la flota entera al primer espacio no está buscando.
 */
export function buscarEnTodo({ clientes = [], carros = [], contratos = [] } = {}, consulta, { limite = FILAS_POR_GRUPO } = {}) {
  const buscado = String(consulta ?? '');
  if (!buscado.trim()) return { vacia: true, grupos: [], total: 0 };

  const encontrados = {
    clientes: filtrar(clientes, buscado, textoDeCliente).filter((c) => c?.id).sort(porNombre),
    carros: filtrar(carros, buscado, textoDeCarro).filter((c) => c?.id).sort(porPlacas),
    contratos: contratosEnOrden(contratos, buscado),
  };
  // Si lo escrito ES el número de un contrato (los exactos van primero en su lista), los contratos suben al principio: con el papel en la
  // mano, «14591» no debe dejar arriba al cliente cuyo DPI lo lleva dentro. Es lo único que cambia el orden del letrero.
  const esUnNumero = esElNumeroDe(encontrados.contratos[0], buscado);
  const orden = esUnNumero ? ['contratos', ...ORDEN_DE_LOS_GRUPOS.filter((tipo) => tipo !== 'contratos')] : ORDEN_DE_LOS_GRUPOS;
  const grupos = orden
    .map((tipo) => grupo(tipo, encontrados[tipo], limite))
    .filter((g) => g.total > 0);
  return { vacia: false, grupos, total: grupos.reduce((suma, g) => suma + g.total, 0) };
}

/** Las filas que se enseñan, de corrido y en el orden de la pantalla (el de las flechas del teclado). */
export function filasVisibles(resultado) {
  return resultado.grupos.flatMap((g) => g.filas);
}

/**
 * La fila a la que lleva Enter cuando NO se escogió ninguna con las flechas: la única que hay, y solo si hay una sola. Con dos o más
 * coincidencias —un contrato y un cliente cuyo DPI lleva el mismo número, o un carro y sus contratos— nadie sabe cuál se quería, y
 * elegir por él es peor que enseñarle todas: devuelve `null` y la lista se queda a la vista.
 */
export function filaUnica(resultado) {
  if (resultado.total !== 1) return null;
  return filasVisibles(resultado)[0] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lo que se le dice cuando no hay nada, o cuando lo que ve puede estar incompleto
// ---------------------------------------------------------------------------------------------------------------------------------
//
// «No se pudo leer» y «no hay» son dos frases distintas: un cliente, un carro o un contrato que sí existe y que la caja no encontró
// porque la lectura no llegó es la falsa buena noticia que todo este sistema evita. Cada lista trae `{ fallo, asentada, servida }`:
//   fallo    la nube no contestó (y puede que lo que se tiene sea solo la copia de esta computadora, vieja o vacía);
//   asentada la nube ya contestó, bien o mal. Mientras no, lo que se tiene es la copia local y todavía puede llegar algo;
//   servida  la lista ya entregó algo, aunque sea la copia local. Una que no, no está en lo que se ve: ni siquiera es «lo local».

export const NOMBRE_DE_LA_LISTA = { clientes: 'los clientes', carros: 'la flota', contratos: 'los contratos' };

/** 'a', 'a y b', 'a, b y c' */
function enumerar(nombres) {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/** «se pudo leer la flota», «se pudieron leer los contratos»: el verbo concuerda con lo que falló. */
const verboDeLeer = (tipos) => (tipos.length === 1 && tipos[0] === 'carros' ? 'se pudo leer' : 'se pudieron leer');

const listasQue = (listas, condicion) => ORDEN_DE_LOS_GRUPOS.filter((tipo) => condicion(listas?.[tipo]));

/**
 * Lo que dice la caja cuando la búsqueda no encontró nada: `{ clase, texto }`, con `clase` 'fallo', 'buscando' o 'nada'.
 *   - alguna lista no se pudo leer -> NO se dice que no hay: se dice que no se sabe;
 *   - alguna sigue esperando la nube -> «Buscando…», no «Sin resultados»;
 *   - todas leídas -> «Sin resultados.»
 * Una lista que falló manda sobre una que espera: la que falló ya no va a llegar.
 */
export function textoSinNada(listas) {
  const fallaron = listasQue(listas, (l) => !l || l.fallo);
  if (fallaron.length) {
    const cuales = enumerar(fallaron.map((tipo) => NOMBRE_DE_LA_LISTA[tipo]));
    return {
      clase: 'fallo',
      texto: `No hay nada así en esta computadora, y no ${verboDeLeer(fallaron)} ${cuales} de la nube: no se sabe si existe. Revisa tu conexión e intenta de nuevo.`,
    };
  }
  if (listasQue(listas, (l) => !l.asentada).length) return { clase: 'buscando', texto: 'Buscando…' };
  return { clase: 'nada', texto: 'Sin resultados.' };
}

/**
 * Lo que se dice DEBAJO de lo que sí se encontró cuando una lista no se pudo leer: que lo que se ve puede estar incompleto. Vacío si todo
 * se leyó (y vacío también mientras la nube todavía está contestando: eso no es un fallo, y avisar de lo que no ha pasado es ruido).
 */
export function textoDeLoQueFalta(listas) {
  const fallaron = listasQue(listas, (l) => !l || l.fallo);
  if (!fallaron.length) return '';
  const cuales = enumerar(fallaron.map((tipo) => NOMBRE_DE_LA_LISTA[tipo]));
  return `No ${verboDeLeer(fallaron)} ${cuales} de la nube. Lo que ves puede estar incompleto.`;
}

/**
 * Lo que se dice DEBAJO de lo encontrado cuando todavía falta que llegue una lista entera (la primera vez que se toca la caja, o una
 * computadora sin copia local esperando a la nube): lo que se ve es de las demás y las que faltan aún no están. Vacío si todas ya
 * entregaron algo —aunque sea la copia local, que es lo que hacen todas las pantallas—: avisar de cada sincronía de fondo sería ruido.
 */
export function textoDeLoQueTarda(listas) {
  const sinServir = listasQue(listas, (l) => l && !l.fallo && !l.servida);
  return sinServir.length ? 'Buscando…' : '';
}
