# `guardarVehiculo`: el historial de mantenimiento ya no retrocede (19 de octubre de 2026)

**Estado: terminado, árbol verde, todo commiteado.** `npm test` = **2243 pasan, 0 fallan** al cerrar (el encargo decía 2194; otros agentes
suben commits al mismo árbol y el total sube solo: lo mío son **39 pruebas nuevas**, 26 en `pruebas/guardar-vehiculo.test.mjs` y 13 en
`pruebas/nube-en-memoria.test.mjs`). `pruebas/concurrencia.test.mjs`: **56 de 56, sin tocar una sola línea** (`git diff 4c73a00 HEAD` sobre ese archivo está vacío).

## Commits (en orden)

| sha | qué |
|---|---|
| `4656934` | `carros.js`: `construirFueraDeServicio` y `construirHabilitado` (antes tres literales copiados dentro de los botones). Sin cambio de comportamiento |
| `1d81c2a` | **el arreglo**: `guardarVehiculo`, `carroConLoDeLaFicha`, `CAMPOS_DEL_MANTENIMIENTO`, `textoFalloAlGuardarElCarro` y las pruebas |
| `6dccdcb` | migaja 1: la nube falsa de las pruebas **rechaza `undefined` como el SDK**, con 13 pruebas |
| `9eae53e` | migaja 2: §7b, «Ojo con los nombres» (y una línea de qué escribe y qué no un guardado del carro entero) |
| `36bce48` | el alta también deja fuera el mantenimiento y los `undefined` (la regla es de TODO guardado del carro) |
| `eef14f3` | una prueba más de la función pura |

## El hueco, reproducido antes de arreglarlo (y con clic real)

`guardarVehiculo` escribía el carro ENTERO desde la copia de la pantalla (`setDoc` con `merge`). Cuatro caras del mismo hueco, las cuatro con
prueba que FALLA sin el arreglo:

1. **El historial retrocede.** B anota un servicio; A, con la copia de antes, guarda el carro: `servicios[]` vuelve a la lista de A.
2. **Un servicio anulado se «desanula»** (A lo trae sin la marca `anulado`).
3. **Un intervalo quitado resucita.** Esto el informe de quien lo encontró no lo decía: `intervalos{}` es un mapa y `merge` mezcla los mapas por
   dentro, así que la copia vieja volvía a poner la llave que B había quitado con «Volver a los de siempre».
4. **La copia LOCAL de A** (que se reemplaza entera con lo que se mandó) quedaba sin el servicio de B hasta la siguiente sincronización, aunque la
   nube no se hubiera perdido nada.

Cómo se reproduce (para la próxima prueba): con un carro SIN servicios todavía, la copia vieja no trae la llave `servicios` y el `merge` no la toca,
así que la nube no pierde nada. El hueco pide que la copia vieja traiga una lista MÁS CORTA. Por eso la prueba parte de un carro con un servicio de antes.

**Contra el `guardarVehiculo` original** (todo lo demás intacto) fallan **14** de las 26 pruebas nuevas y ninguna de las otras 2217: 8 son el hueco
(las cuatro caras, también «Marcar fuera de servicio» y «Volver a habilitar»), y 6 son comportamientos nuevos del camino de edición (sello que no baja,
nube caída, carro que ya no existe, `undefined`, alta sin código).

**En el navegador, con botones reales** (arnés propio en `scratchpad/gv/`, Firebase falso con la nube en `localStorage` y, a diferencia del de antes,
**estricto con `undefined`** como el SDK; cero llamadas de red, ninguna credencial; puertos 4741 y 4742 comprobados libres antes y después, servidores apagados).
«Otra computadora» = editar la nube falsa mientras la ficha de ésta sigue abierta:

| qué se hizo | resultado con el arreglo (`1d81c2a`) |
|---|---|
| otra computadora anota un servicio y QUITA el intervalo de aceite; aquí «Guardar carro» con el color cambiado (clic real en el campo y en el botón) | nube: color nuevo, `servicios` = `[s-0, s-1]`, `intervalos` = `{}`; la copia local igual; **una** escritura (`tx.set`) |
| otra computadora anota un servicio y anula el primero; aquí «Marcar fuera de servicio» | fuera de servicio + motivo, y los tres servicios con la anulación intacta |
| otra computadora anota un servicio; aquí «Volver a habilitar» (ficha) | habilitado y sin motivo; los cuatro servicios |
| `#/habilitar/vB` con la copia local de antes (un servicio) y la nube con dos | habilitado; la nube conserva los dos y la copia local queda con los dos |
| **el mismo recorrido de «Guardar carro» con el árbol de ANTES (`4656934`)** | nube: `servicios` = `[s-0]` (se perdió `s-1`) e `intervalos.aceite` **resucitó**; la copia local también. El arnés sí ve el hueco |

Ninguna escritura fue rechazada por `undefined` en todo el recorrido.

## Qué se hizo

| capa | cambio |
|---|---|
| `js/nucleo/mantenimiento.js` | `CAMPOS_DEL_MANTENIMIENTO = ['servicios', 'intervalos']` (la lista, una sola vez) y `carroConLoDeLaFicha(fresco, deLaFicha)`, pura |
| `js/datos.js` | `guardarVehiculo` de un carro que YA existe (trae `codigo`) pasa por `cambiarEnNubeYLocal`: lee el carro DENTRO de la transacción y le pone encima lo de la pantalla, menos el mantenimiento. Un carro nuevo se sigue escribiendo con `setDoc` |
| `js/pantallas/carros.js` | los dos constructores, y `textoFalloAlGuardarElCarro` (un carro que ya no está dice por qué, no «intenta de nuevo»); el comentario de `construirVehiculo` al día |
| `pruebas/fixtures/nubeEnMemoria.mjs` | rechaza `undefined` en `setDoc`, `tx.set`, `updateDoc` y lote; exporta `valoresIndefinidos` |
| `docs/…-design.md` §7b | el glosario y la regla de quién escribe qué |

## Evaluación de lo que propuso quien lo encontró

«Que `guardarVehiculo`, cuando el carro ya existe, lea el carro fresco DENTRO de la transacción y aplique solo los campos del formulario.»

**La forma es la correcta y es el patrón que ya tenía el archivo** (`cambiarEnNubeYLocal`, el mismo de anotar/anular/intervalos). Cuatro cosas distintas:

1. **No hay una lista blanca de «campos del formulario».** Es la parte que pide el encargo mirar con cuidado, y la respuesta es que la lista correcta es la
   contraria: se escribe TODO lo que trae la pantalla, EXCEPTO lo que tiene su propio escritor (`servicios`, `intervalos`). Una lista blanca
   (`codigo, placas, tipo… motivoFueraDeServicio`) es exactamente el error de al revés: el día que alguien agrega un campo al carro (`dueno`, un `km`, lo
   que sea) o un campo que el formulario «no conoce», esa edición no se guarda y nada lo dice. Con la lista negra ese error no se puede cometer por campos
   sueltos: cada campo del §7b, y uno inventado, se prueba que se guarda (`cada campo del carro que no es del mantenimiento se guarda…`). La lista negra
   sí puede quedarse corta, y para eso hay una prueba que la compara con lo que de verdad tocan `carroConServicio`, `carroConServicioAnulado` y
   `carroConIntervalo`: si un cuarto cambio toca otra llave, la prueba falla hasta que se agregue a la lista.
2. **La base es la nube, no la pantalla** (`{ ...fresco, ...lo de la pantalla }`, y no al revés): lo que la nube tiene y la pantalla no conoce se conserva, como con
   el `merge` de antes.
3. **Un `undefined` de la pantalla es «no sé», no «bórralo».** Firestore los rechaza; el SDK real habría roto el guardado.
4. **El alta también pasa por la misma función** (`36bce48`): un carro que ya existía pero llegó sin código entraba por el alta y mandaba su lista vieja.
   Ahora «`guardarVehiculo` no escribe `servicios` ni `intervalos` nunca» es una propiedad de la función entera, no de una de sus dos ramas.

## La decisión: ¿se mezcla o se niega?

**Se mezcla.** Y se mezcla porque aquí no hay nada que mezclar: el historial no se edita en ese formulario, así que la lista de la nube es la buena
por construcción. Dicho de otra forma, no es un caso de «dos escrituras que compiten», es un caso de «una escritura que no debería llevar ese campo».

Por qué NO es un `CODIGO_COPIA_VIEJA`:

1. **La razón por la que los contratos se niegan no existe aquí.** Se niega porque dos listas de pagos no se pueden mezclar sin adivinar (un pago que está en las
   dos se cuenta doble). Aquí no se mezclan dos listas; se deja la de la nube como está.
2. **El sello `actualizado` de un carro sube con CADA servicio** (`cambiarEnNubeYLocal` lo sube a propósito para que `mezclar` muestre la copia nueva). Una guardia
   por igualdad de sello negaría «guardar el color» a cualquiera que hubiera anotado un servicio en la otra computadora: se negaría por nada. Y un rechazo
   que casi siempre es falsa alarma («recarga y vuelve a hacerlo») le enseña a ignorarlo el día que sea verdad.
3. **`#/habilitar/:id` escribe apenas abre**, desde una copia local que la app dibuja primero y sincroniza después. Con la guardia, el primer clic después de
   cualquier cambio de la otra computadora fallaría, con una pantalla que dice «intenta de nuevo» (que no sirve hasta refrescar la copia).
4. **No se pierde lo que él acaba de hacer.** El miedo del encargo —una mezcla silenciosa que descarta una edición suya— no pasa: todo lo que la pantalla trae
   se escribe, salvo las dos llaves que esa pantalla no puede editar. Está probado campo por campo, y con la lista negra no hay un campo que se pueda olvidar.

**Lo que SÍ sigue siendo «el último que guarda gana», y hay que decirlo** (es lo de siempre, no lo hice peor ni mejor; el informe del 9 de octubre ya lo dejó anotado
para carros, reservaciones, clientes y dueños): los campos sueltos del carro. Si dos computadoras cambian el MISMO campo, queda el de la última. Y hay una versión
más fea del mismo hecho, que prefiero decir con todas sus letras:

- **La copia vieja de A puede devolver un campo suelto que B cambió.** «Marcar fuera de servicio» y «Volver a habilitar» escriben el carro entero que la pantalla
  tiene (`{ ...carro, fueraDeServicio: … }`), así que si B cambió el color mientras tanto, A lo devuelve al de antes. Y la peor, comprobada con el código de verdad: **B marca el
  carro fuera de servicio (está en el taller) y A, con la ficha abierta de antes, aprieta «Guardar carro» para corregir el color: si ese carro ya había pasado alguna vez por
  «Volver a habilitar» (que guarda `fueraDeServicio: false` de forma explícita), la copia de A trae esa marca y la devuelve a `false`: el carro reaparece como rentable.** Un carro
  que nunca se ha marcado no tiene esa llave y no sufre esto. Requiere dos computadoras, la ficha abierta justo en esa ventana, y que se guarde desde esa copia; por eso no lo traté
  como parte de este hueco, que pierde algo que no se puede reconstruir (un historial), pero es de la misma especie y **lo más grave que queda**.
- Arreglarlo es una decisión de política que no me toca: (a) dejarlo como está; (b) **negar** solo si cambió un campo suelto desde que se abrió la ficha (la pantalla
  tendría que pasar la copia que abrió, `abierto`, y la regla sería «cambió algo que no es del mantenimiento» —ese sí es un caso de rechazo, con su frase—); o (c) que cada
  botón mande SOLO lo que cambia (`{ id, codigo, fueraDeServicio, motivoFueraDeServicio }` en marcar y habilitar), con la base fresca que `guardarVehiculo` ya pone.
  Yo haría (c) para los dos botones del taller —es barato y no necesita frase nueva— y preguntaría por (b) para «Guardar carro». No lo hice porque (c) cambia lo que mandan
  tres botones y (b) agrega una frase nueva que el dueño va a leer, y ninguna de las dos estaba en el encargo.

## Lo que `concurrencia.test.mjs` decía y cómo se respetó

Las dos pruebas que encargo mandaba leer no se tocan y pasan:

- **~530, `H-2 (vehiculos)`** (`nubeLenta`): inyecta el tiempo vencido en `setDoc`. Por eso el **alta tiene que seguir siendo un `setDoc`** y no una transacción: si el alta
  pasara por `cambiarEnNubeYLocal`, el primer intento nunca recibiría el fallo inyectado y la prueba se rompería (lo comprobé con un mutante: 7 pruebas mueren). Las
  pruebas de edición del mismo bloque (`editar un registro que ya existe sigue siendo editar`) pasan por el camino nuevo sin cambios.
- **~678, el reintento del alta**: el reintento de un carro nuevo cuyo primer intento sí llegó **toma un código nuevo** y deja un hueco en la numeración (`guardado.codigo === 5`).
  Si «el carro ya existe» se decidiera leyendo la nube, ese reintento conservaría el código 4 y la prueba, que dice «se deja dicho para que nadie lo "arregle" mal», se rompería.
  Por eso «ya existe» es **«trae su código»** (lo que ya decía el comentario de la función desde el primer commit: «si ya lo trae, edición de un carro existente»), no una lectura.
  Todo carro guardado por la app trae código desde el primer commit (`305f72e`).

## Mutaciones (todas matadas)

Sobre una COPIA del árbol (`scratchpad/mut/`; nunca el árbol compartido, porque hay otros agentes corriendo pruebas), con `mutar.mjs`: sustitución exacta, suite entera, restaura.
**32 mutantes, 32 muertos.** Entre ellos:

| mutante | quién lo mata |
|---|---|
| el mantenimiento de la pantalla SÍ se escribe | 8 pruebas (las cuatro caras) |
| solo `servicios` es del mantenimiento | las dos de intervalos |
| la lista dice una llave de más (`dueno`, `id`) | «cada campo se guarda» y la que compara la lista con lo que tocan los tres cambios |
| una edición que no se queda (la nube le gana a la pantalla; se ignora `motivoFueraDeServicio`) | 4–8 pruebas |
| partir de `{}` y no de lo que la nube tiene | 11 pruebas |
| un `undefined` de la pantalla pisa la nube | 2 |
| el camino de edición apagado / TODO guardado por la transacción (el alta también) | 12 / 7 (las de `concurrencia`, incluidas) |
| escribir la copia de la pantalla sin leer la nube dentro de la transacción | 10 |
| el alta vuelve a mandar la copia entera | 2 |
| el sello baja con un reloj atrasado; escribir con `merge` | 2 y 2 |
| la copia local se arma con lo que mandó la pantalla | 4 |
| la nube falsa deja pasar `undefined` en cada una de sus cuatro formas, o solo mira el primer nivel | 1–6 cada uno |
| los botones vuelven a armar el carro con un literal / habilitar usa el constructor de marcar | la prueba de estructura |
| «ya existe» se decide por el sello en vez de por el código | la del carro sin código |

Los que sobrevivían al principio eran código redundante (`?? {}` en `carroConLoDeLaFicha`): se probó en vez de quitar, porque es una función pura exportada.

## Las dos migajas

1. **Nada que se escriba a Firestore lleva `undefined`.** En vez de una prueba que recorra una escritura, se arregló la causa: **la nube falsa compartida rechaza `undefined`** como el SDK
   (`firebase-config.js` usa `getFirestore(app)` sin `ignoreUndefinedProperties`) en `setDoc`, `tx.set`, `updateDoc` y lote, con el mensaje del SDK (campo y documento) y sin dejar
   nada escrito. Probé antes, en una copia, que las 2196 pruebas de ese momento pasaban con la nube estricta (ninguna escribía un `undefined`), así que no rompe nada.
   Además, una prueba recorre los siete caminos de escritura de un carro (alta con `id` y `codigo` en `undefined` como la arma la pantalla, guardar, marcar, habilitar, servicio,
   anular, intervalo; ocho escrituras)  y mira lo escrito Y la copia local, sin depender de que la nube falsa sea estricta. **Efecto para otros agentes:** una prueba nueva que escriba un `undefined` ahora
   falla, y debe: en producción habría fallado el guardado.
2. **§7b**: «Ojo con los nombres: la misma palabra, otro dato». `servicios[].tipo` no es el `tipo` del carro; `servicios[].km` no es `kmSalida` ni `kmEntrada`; y un tercero que no estaba en el
   encargo: `intervalos{x}.km` es una distancia ENTRE servicios, no una lectura del odómetro. No se renombra nada; se exige que nadie lea uno como otro.

## Lo que cambia para el dueño (y lo que hay que saber)

- **Hay que subir la versión y publicar** (no la toqué: era de otro agente). El arreglo solo protege a quien corra el código nuevo: una pestaña abierta con el código viejo sigue
  reescribiendo el carro entero hasta que se actualice (lo mismo que dijo el informe del 9 de octubre). Sin cambio en `firestore.rules`: las transacciones leen y escriben `vehiculos`, que ya lo permite.
- **Sin internet, guardar un carro que ya existe ahora se NIEGA** (una transacción no se deja en cola), en vez de quedar la escritura en la cola del SDK y aterrizar después desde una copia
  posiblemente vieja. Es el mismo cambio que ya tienen los contratos y los servicios, y es lo que se quiere, pero es un cambio de comportamiento: dice «No se pudo guardar el carro. Intenta de nuevo.».
- **Un carro que ya no está en la flota** (alguien lo quitó desde la consola de Firebase) ya no se vuelve a crear en silencio al guardarlo desde una ficha vieja: dice «Este carro ya no está en la
  flota, así que no se guardó nada. Recarga la página.».
- Cada guardado de un carro existente cuesta dos idas y vueltas a la nube (leer y escribir) en vez de una.
- No es el SDK real: la transacción de las pruebas y del arnés imita la documentada. Conviene una pasada del dueño con dos computadoras reales antes de confiar del todo.

## Lo que NO toqué

`js/pantallas/sacarCarro.js`, `js/respaldo/*`, `version.txt`, `js/version.js`, `pruebas/concurrencia.test.mjs`, `firestore.rules`.
Del «Dónde quedamos» (punto 4), con esto quedan cerradas la línea de §7b y la prueba de `undefined`; la del respaldo (`mapa.js`) ya la hizo otro agente (`2cc02f2`).
