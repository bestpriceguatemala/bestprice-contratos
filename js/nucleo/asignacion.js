// ¿Cuántos compromisos pueden tener un carro propio?
//
// Es la mitad matemática del aviso de capacidad de una reservación (nucleo/reserva.js). Una reservación «por
// tipo» (un microbús, sin decir cuál) tiene que terminar con UN carro de ese tipo, el mismo todos sus días, y
// ese carro no puede estar en dos compromisos que se cruzan. Contar cuántos compromisos tocan unas fechas NO
// contesta eso: con un carro ocupado del 1 al 5 y otro del 6 al 10 nunca hay más de uno ocupado a la vez, y
// aun así ninguno de los dos está libre del 1 al 10. Es un problema de ASIGNACIÓN, y esto lo contesta exacto.
//
// Aquí no hay fechas ni reglas del negocio. Quien llama (reserva.js) decide quién se cruza con quién, con la
// única regla de cruce que existe («tocarse no es cruzarse»), y qué carros ya están ocupados por un
// compromiso clavado a ellos. Este archivo recibe eso ya resuelto, como dos tablas:
//
//   choques[i][j]   verdadero si el compromiso i y el j se cruzan (la tabla es simétrica)
//   vetados[i][c]   verdadero si el compromiso i no puede usar el carro c (ahí hay uno clavado que se le cruza)
//
// y devuelve el MÁXIMO de compromisos que pueden tener carro a la vez. Si ese máximo es todos, todos caben.
//
// La búsqueda es exacta (prueba las asignaciones, descartando las que ya no pueden mejorar lo mejor que se
// encontró), no una aproximación. En general el problema es difícil, pero la flota de un negocio de renta
// tiene un puñado de carros por tipo y unos cuantos compromisos cruzados: se resuelve al instante. Para que
// una entrada absurda no congele la pantalla hay un límite de pasos; si se pasa, devuelve `null` («no se
// pudo saber») en vez de adivinar, y quien llama lo dice con todas sus letras.

/** Pasos de búsqueda antes de rendirse. Una flota real usa unos cientos, a lo mucho. */
export const LIMITE_DE_PASOS = 200000;

/**
 * El máximo de compromisos que pueden tener un carro propio, o `null` si la búsqueda se pasó de `limite` pasos.
 *
 * @param {object} p
 * @param {number} p.carros       cuántos carros hay; se numeran de 0 a carros-1
 * @param {boolean[][]} p.choques   choques[i][j]: el compromiso i y el j se cruzan
 * @param {boolean[][]} p.vetados   vetados[i][c]: el compromiso i no puede usar el carro c
 * @param {number} [p.limite]     pasos de búsqueda permitidos
 */
export function maximoConCarro({
  carros, choques, vetados, limite = LIMITE_DE_PASOS,
}) {
  const n = choques.length;
  if (n === 0) return 0;

  // Los más enredados primero (más cruces, menos carros posibles): si algo no cabe, se descubre pronto y se
  // poda más.
  const cruces = (i) => choques[i].filter(Boolean).length;
  const posibles = (i) => vetados[i].filter((v) => !v).length;
  const orden = [...Array(n).keys()].sort((a, b) =>
    (cruces(b) - cruces(a)) || (posibles(a) - posibles(b)) || (a - b));

  // Dos carros todavía sin ningún compromiso y vetados para exactamente los mismos compromisos son
  // intercambiables: probar el segundo repite lo mismo con otro nombre. Sin esto, 12 compromisos y 12 carros
  // iguales serían 12! caminos.
  const firma = Array.from({ length: carros }, (_, c) => vetados.map((fila) => (fila[c] ? '1' : '0')).join(''));

  const enCarro = Array.from({ length: carros }, () => []);
  let mejor = 0;
  let pasos = 0;
  let sinLimite = false;

  const buscar = (k, puestos) => {
    pasos += 1;
    if (pasos > limite) { sinLimite = true; return; }
    if (puestos > mejor) mejor = puestos;
    if (k === n || mejor === n) return;
    // Aunque todos los que faltan cupieran, no se superaría lo ya encontrado.
    if (puestos + (n - k) <= mejor) return;

    const i = orden[k];
    const probadosVacios = new Set();
    for (let c = 0; c < carros; c += 1) {
      if (vetados[i][c]) continue;
      if (enCarro[c].some((j) => choques[i][j])) continue;
      if (enCarro[c].length === 0) {
        if (probadosVacios.has(firma[c])) continue;
        probadosVacios.add(firma[c]);
      }
      enCarro[c].push(i);
      buscar(k + 1, puestos + 1);
      enCarro[c].pop();
      if (sinLimite || mejor === n) return;
    }
    // O se queda sin carro: así se cuentan los que sí caben cuando no caben todos.
    buscar(k + 1, puestos);
  };

  buscar(0, 0);
  return sinLimite ? null : mejor;
}
