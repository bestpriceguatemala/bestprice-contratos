// Lo que una pantalla tiene de una lectura con sincronía de fondo.
//
// `cargarFlota`, `cargarClientes`, `cargarReservas`, `cargarContratosAbiertos` y `cargarTodosLosContratos` (datos.js) entregan DOS veces: la promesa
// devuelve al instante la copia LOCAL y, si la nube trae algo distinto o falla, `alLlegar` avisa después. Cuando una pantalla espera varias lecturas
// juntas (`Promise.all`) y una de ellas no tiene copia local (una tienda vacía: nadie ha hecho reservaciones, por ejemplo) o es de la red (los
// ajustes), la espera dura lo que tarda esa red, y la nube de las OTRAS lecturas puede contestar antes de que la espera termine. Si la pantalla asigna lo
// que devolvieron las promesas al terminar de esperar, la copia local —más vieja— pisa lo que la nube ya trajo, y esa pantalla se queda con lo viejo
// hasta la próxima visita: un carro que otra computadora mandó al taller se ofrece sin aviso, un carro que ya regresó sigue «atrasado» en el calendario,
// y el aviso de que la nube falló se borra. Probado en el navegador en «Sacar carro» y en el calendario.
//
// Esto guarda lo que llegó de la nube como lo más nuevo, llegue antes o después de la respuesta inmediata. `actual` es la última lectura
// `{ datos, fallo }`, o `null` mientras no llega ninguna.

export function lecturaConNubeDetras() {
  let actual = null;
  let llegoLaNube = false;
  return {
    /** Lo que devolvió la promesa (la copia local): vale solo si la nube todavía no trajo nada. */
    inmediata(lectura) { if (!llegoLaNube) actual = lectura; },
    /** Lo que llegó por `alLlegar` (la nube trajo algo distinto, o falló): siempre más nuevo. */
    deLaNube(lectura) { actual = lectura; llegoLaNube = true; },
    get actual() { return actual; },
  };
}
