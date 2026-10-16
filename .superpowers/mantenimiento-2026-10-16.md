# Mantenimiento de la flota propia: informe (16 de octubre de 2026)

Este informe se escribe sobre la marcha: si se corta, lo que ya está aquí es lo verdadero hasta el último commit que menciona.

Línea base al empezar: `npm test` = **2072 pasan, 0 fallan** (el encargo decía 2048; entre el encargo y mi arranque otro agente subió
dos commits de «Sacar carro», 8426704 y a0d7a5e). Los totales siguen subiendo mientras trabajo porque otros agentes comparten el árbol:
cuento solo lo mío.

## Commits (en orden)

| sha | qué |
|---|---|
| 4313313 | `sumarMeses` en `nucleo/fechas.js` (meses de calendario; el 31 no pasa al mes siguiente) |
| 5b07b10 | el puente `kilometrajeSalida` → `kmSalida` baja de `pantallas/recibirCarro.js` al núcleo (`nucleo/contrato.js`); la pantalla lo vuelve a exportar |
| 4779c56 | `nucleo/mantenimiento.js`: la regla, entera, y sus 54 pruebas |
| f13733c | `avisosDeSalida` agrega el aviso de mantenimiento (nivel medio) |
| 4e0e173 | `datos.js`: anotar/anular/cambiar intervalos DENTRO de una transacción, y `cargarTodosLosContratos` |
| 3b94a62 | el bloque de la ficha (`pantallas/mantenimiento.js`, `carros.js`, CSS) |
| 9da5753 | redacción del aviso con dos lados; el nombre del servicio no se parte |

## Decisión de almacenamiento (leída antes de escribir nada)

**Los servicios y los intervalos de un carro viven dentro del documento del carro (`vehiculos/{id}`), como `servicios[]` e `intervalos{}`.
Sin colección nueva y sin cambio de `firestore.rules`: no hay nada que pegar.**

Por qué ahí y no en otro lado:

1. **`firestore.rules` ya lo permite** (`match /vehiculos/{id} { allow read, write: if haySesion(); }`). Una subcolección
   (`vehiculos/{id}/servicios`) NO queda cubierta por esa regla —en Firestore una regla de un documento no cubre sus subcolecciones, por eso
   `contratos/{id}/privado` tiene la suya—, y una colección `servicios` aparte tampoco. Las dos habrían pedido pegar reglas a mano.
2. **La copia local ya la lleva.** IndexedDB (versión 3) tiene la tienda `vehiculos`; una tienda nueva exigía subir la versión de la base.
3. **Llega sola a donde se necesita.** «Sacar carro» ya recibe el carro de la flota (`avisosDeSalida({ carro })`), así que el aviso no necesita
   que `sacarCarro.js` (que no se toca) cargue nada nuevo: los servicios viajan en el carro.
4. **El tamaño no es problema.** Un servicio pesa ~100 bytes; seis tipos × cuatro veces al año × diez años son ~25 KB, lejos del megabyte de un documento.

El costo y cómo se paga: un arreglo dentro de un documento se pisa si dos pestañas lo reescriben a ciegas. Por eso agregar, anular y cambiar
intervalos **leen el documento DENTRO de la transacción que lo escribe y escriben sobre lo que leyeron** (`cambiarEnNubeYLocal`, `datos.js`),
no sobre la copia que la pantalla tenía en memoria; un reintento tras un tiempo vencido no duplica nada porque cada servicio trae su `id`
(decidido una vez por intención, `altaConIdFijo(nuevoIdServicio)`). Se escribe el documento entero y sin `merge`, porque volver un intervalo a
los de siempre tiene que QUITAR la llave y `merge` solo suma. Un servicio se **anula** (`anulado`, `anuladoEn`, los nombres del pago) y no se borra.

## Los seis intervalos por omisión y cuánto antes avisa — **SON MÍOS, esperan su confirmación**

La especificación pide dos intervalos por servicio y no fija los números. Se pensó en carros de renta en Guatemala: muchos conductores,
trancones y pendientes, baches y túmulos, calor y lluvia de mayo a octubre, y un supuesto de **2,000 a 3,000 km al mes** por carro (no se midió:
él lo corrige). Todo se cambia por carro en la ficha («Intervalos de este carro»), y la ficha muestra el «por qué» de cada uno.

| Servicio | Km | Meses | Por qué |
|---|---|---|---|
| Aceite y filtro | 5,000 | 3 | 5,000 km es el intervalo que suele recomendarse para uso pesado (el manual dice 7,500–10,000 con uso normal; un carro de renta es uso severo). Los 3 meses porque el aceite envejece aunque el carro esté parado entre rentas. |
| Pastillas de freno | 30,000 | 12 | Duran 30,000–50,000 km; con pendientes, trancones y conductores que no son el dueño se acercan al extremo bajo. A los 12 meses se revisan igual: la lluvia y la humedad también las gastan. |
| Llantas | 40,000 | 48 | Con baches y túmulos una llanta rinde unos 40,000 km. El hule envejece aunque no ruede: 4 años es margen de seguridad (el fabricante dice hasta 6), porque una llanta reventada con un cliente adentro es un problema de otro tamaño. |
| Batería | 60,000 | 36 | Una batería de plomo se acaba por edad más que por kilómetros: 3 años es lo que dura en el calor. Se cambia antes de que falle porque un cliente varado cuesta más que la batería. Los 60,000 km son solo un respaldo para un carro muy usado. |
| Alineación y balanceo | 10,000 | 6 | Cada 10,000 km es lo normal y los baches de aquí la sacan de punto más seguido. A los 6 meses se revisa aunque haya andado poco. |
| Servicio general | 20,000 | 12 | La revisión completa (filtros de aire, bujías, líquidos, correas, suspensión) cae a los 20,000 km en el programa de casi todos los fabricantes; a los 12 meses se hace aunque no haya llegado. |

**Cuánto antes avisa: 500 km o 15 días.** Un carro de renta anda unos 80 km al día, así que 500 km son más o menos una semana: tiempo para
meterlo al taller entre una renta y otra sin cancelar nada. 15 días es media agenda de un mes. Más antelación avisaría durante demasiado tiempo de
cada ciclo y el aviso se vuelve decoración; menos, no deja tiempo. **Nivel `medio`** para lo que ya toca y para lo que está por tocar (el brief
dice «un servicio vencido es medio»; el encargo decía «al nivel de una licencia vencida» —que es `alto`—: seguí el brief, que explica por qué:
advertencia y no candado, él decide si renta el carro igual. Cambiarlo a `alto` es una palabra en `avisosDeMantenimiento`).

## Cómo contesta cada pregunta (todo en `nucleo/mantenimiento.js`, nada en una pantalla)

- **¿En cuántos kilómetros anda el carro?** (`kilometrajeDelCarro`) El mayor kilometraje anotado en sus contratos: `cierre.kmEntrada` de los que
  regresaron (solo si hay `cierre.fechaReal`), `kmSalida` de los demás, con el puente `kilometrajeSalida`. Los carros ajenos no cuentan
  (`Boolean(c.ajeno)`, el único criterio). **Sin contratos, o con contratos que nunca anotaron kilometraje, es `null` («no se sabe»), no cero.**
  Un `0` guardado es «no se anotó», como ya lo trata `problemasDelCierre`. La puerta (`lecturaValida`) es una sola: aunque alguien llame con
  `{ km: 0 }` no se fabrica un «faltan 20,000 km». Dice de qué contrato sale el número y de qué fecha (un cero de más tecleado en un contrato se encuentra así).
- **¿Toca?** Cada servicio mide el lado de kilómetros (último servicio + intervalo − kilometraje) y el de tiempo (último servicio + meses de
  calendario − hoy, con `hoy` recibido); toca con el que llegue primero. Un lado que no se sabe NO es «ok»: el renglón dice «Al día por fecha», no «Al día».
  «Al día» solo si los dos lados se midieron y ninguno está cerca.
- **Un servicio que no se puede fechar no cuenta:** sin fecha válida, con fecha de mañana o anulado. No resetea un plazo ni calla un aviso.
- **Una lectura caída nunca es «al día»:** con la flota o los contratos sin poder leerse, lo que estaba bien queda «No se pudo confirmar» y
  la ficha pone la barra roja de siempre; lo malo se dice igual (el kilometraje solo sube: si una copia vieja ya dice que toca, toca).
- **Kilómetros enteros** (`textoEntero`), nunca con centavos.

## Dónde sale el aviso, y el hallazgo que casi lo deja mudo

El aviso va donde ya van los demás: `avisosDeSalida` (`nucleo/avisos.js`), nivel `medio`, después de los serios.

**Hallazgo:** «Sacar carro» solo lee los contratos ABIERTOS (`cargarContratosAbiertos`), así que de ahí nunca saldría el kilometraje de un carro cuyas
rentas ya se cerraron: casi todos. Y `sacarCarro.js` no se toca. Lo que sí trae «Sacar carro» a `avisosDeSalida` es el carro de la flota (con
sus `servicios[]`) y el borrador del contrato con el **kilometraje de salida que el mostrador escribe**: el odómetro de ESE momento, mejor dato que
cualquier contrato anterior. El aviso usa ese. Vacío es 0 y 0 es «no se anotó»: solo se mide el tiempo, sin inventar kilómetros. Un número a
medio teclear es más chico que el final, así que puede callar un aviso un instante pero no inventar uno. Un carro ajeno llega como `null`: nada.
La ficha, en cambio, lee TODOS los contratos (`cargarTodosLosContratos`: la misma lectura de la colección que ya hacía, sin el filtro).
Probado a través de la `entradaDeAvisos` de verdad (sin tocarla): si alguien le quita el carro o el borrador, falla.

## DÓNDE QUEDÉ (cierre ordenado por cupo, 16 oct 2026; leer esto primero)

**Estado: la función está construida, probada y verificada en el navegador. El árbol está verde y todo está commiteado** (HEAD de mi trabajo:
`b04dbfd`; `npm test` = 2194 pasan, 0 fallan en ese momento; el total sube solo porque otros agentes comparten el árbol). Lo único NO hecho son los
tres pendientes de abajo, ninguno bloquea la entrega.

Commits míos, en orden: `4313313` `5b07b10` `4779c56` `f13733c` `4e0e173` `3b94a62` `9da5753` `3714088` `b04dbfd` (los primeros siete están en la tabla de arriba;
`3714088` = diseño §7/§7b/§12b/§10; `b04dbfd` = los intervalos ya no afirman lo que «recomiendan los talleres», que no verifiqué).
Pruebas nuevas mías: `pruebas/mantenimiento.test.mjs` (56), `mantenimiento-datos.test.mjs` (21), `mantenimiento-pantalla.test.mjs` (22), 7 en `avisos.test.mjs`,
3 en `fechas.test.mjs`, 1 en `recibirCarro.test.mjs`, y dos fixtures con los constructores reales (`pruebas/fixtures/contratoConKilometraje.mjs`, `carroConServicios.mjs`).

### Pendientes (ninguno rompe nada; en este orden)

1. **Un hueco real que NO cerré: la copia vieja pisa los servicios.** `guardarVehiculo` (usado por «Guardar carro», «Marcar fuera de servicio», «Volver a habilitar» en
   la ficha, y por `habilitarDesdeFlota` en `#/habilitar/:id`) escribe el carro ENTERO con `merge: true` a partir de la copia que la pantalla tenía. Si otra computadora
   anotó un servicio después de que ésta sincronizó, esa escritura devuelve `servicios[]` a la lista vieja, en silencio. Dentro de la ficha ya está atajado en la misma pestaña
   (`alCambiar: (guardado) => { carro = guardado; }`, probado a clic real: «Guardar carro» después de anotar conservó los 8 servicios), y **anotar/anular/intervalos nunca pisan**
   (transacción que lee el carro). Lo que queda es el cruce entre dos computadoras con la copia local atrasada, sobre todo `#/habilitar/:id`, que escribe apenas abre.
   **Arreglo propuesto (un solo punto):** que `guardarVehiculo` de un carro que YA existe pase por `cambiarEnNubeYLocal('vehiculos', id, (actual) => ({ ...actual, ...lo que traiga
   menos servicios e intervalos }))`, es decir, leer el carro fresco dentro de la transacción y aplicar solo los campos del formulario; un carro nuevo se crea como hoy. Hay que
   mirar `pruebas/concurrencia.test.mjs` (líneas ~530 y ~678, el alta con id fijo de un carro) antes de tocarlo: no lo toqué. Es el mismo patrón que ya tienen `fueraDeServicio`
   y compañía (preexistente), pero un servicio perdido deja un aviso que no sale, y eso él lo odia.
2. **Una prueba que falta:** que lo que se escribe a Firestore no lleve valores `undefined` (el SDK de verdad los rechaza y la nube falsa de las pruebas no). A ojo no hay ninguno
   (`km` es `null`, nunca ausente), pero no está probado: recorrer `nube.escriturasEnTransaccion('vehiculos/v1')` recursivamente en `pruebas/mantenimiento-datos.test.mjs`.
3. **Una línea de documentación:** en §7b, bajo `servicios[]`, un «Ojo con el nombre»: `servicios[].tipo` (`'aceite'`…) NO es el `tipo` del carro (`'Pickup'`, `'Sedán'`), y `servicios[].km`
   no es `kmSalida` ni `kmEntrada`. (Mismo tipo de choque que ya tuvo `dueno`.)

### Cosas que tiene que hacer OTRO (por los archivos prohibidos)

- **Subir el número de versión** (`version.txt`, `js/version.js`) al publicar, para que salga el aviso de «Actualizar» (§13). No lo toqué.
- **`js/respaldo/mapa.js`**: agregarle a «lo que este archivo NO lleva» una línea: el mantenimiento (los servicios y los intervalos de cada carro) no entra al Excel de respaldo, su hoja
  VEHICULOS no tiene dónde. Ya está dicho en el diseño §10; falta en la pantalla del respaldo.
- **`firestore.rules`: NADA que pegar.** `vehiculos` ya se lee y escribe con la sesión normal, y los servicios viven dentro del documento del carro. IndexedDB sigue en la versión 3.
- **`sacarCarro.js` no necesitó ningún cambio** (ver «Dónde sale el aviso» arriba): el aviso llega por el carro de la flota y el kilometraje de salida que el mostrador escribe.

## Lo verificado en el navegador, con clic real

Arnés propio en `scratchpad/mant/` (**no el de otro agente**): `servidor.mjs` sirve un `git archive` de un commit exacto (primero `3b94a62`, luego `9da5753`) en el puerto **4731**,
comprobado libre con `lsof` antes de arrancar y **apagado al terminar** (vuelve a salir libre). Las tres URL de Firebase se cambian por falsos locales con un import map (cero llamadas
de red; auth falsa, ninguna credencial pedida ni usada; no se tocó el proyecto real). Firestore falso persistente en `localStorage`, con transacciones que repiten si el documento cambió y
fallas/demoras inyectables. IndexedDB `bestprice-contratos` **versión 3**, resembrada con los constructores reales (`sembrar.html`) antes de medir: A recién comprado, B historia solo con
contratos CERRADOS, C con una renta abierta ahora, D con contratos sin kilometraje. Todo con botones reales (la hora de hoy del sistema es el 16 oct 2026):

- **Carro sin contratos (A):** «No se sabe en cuántos kilómetros anda este carro…», los seis servicios «SIN REGISTRO» con «Falta registrar el primer servicio.», ningún «faltan N km», ningún
  «Al día», historial «Todavía no se ha registrado ningún servicio».
- **Validación:** kilometraje `15000.5` → «El kilometraje va en un número entero mayor que cero…» y **0 escrituras** a la nube.
- **Registrar** aceite con 15,000 km en A: queda en la nube (`tx.set` en `vehiculos/vA`, id propio); el renglón dice «Kilómetros: Toca a los 20,000 km, pero no se sabe en cuántos kilómetros
  anda el carro. Tiempo: Faltan 92 días (el 16 ene 2027). **AL DÍA POR FECHA**» (no «Al día»).
- **Carro con historia (B, todos sus contratos cerrados):** «Anda en 14,800 km, según el kilometraje de entrada del contrato 2, recibido el 5 sep 2026» (prueba de que lee los cerrados);
  aceite TOCA (el tiempo llegó primero, 26 días pasado, aunque a los kilómetros les faltaban 200), alineación PRONTO (9 días), frenos AL DÍA. El formulario propuso 14,800 y lo dejó corregir a
  14,950, que es lo que se guardó.
- **Anular** (confirm instrumentado, el botón fue el real): el servicio queda en la nube con `anulado: true, anuladoEn`, tachado en el historial sin botón, y el plazo vuelve al de junio (TOCA).
- **Intervalos por carro:** 4,000 km en aceite → «cada 4,000 km o 3 meses (de este carro)», servicios intactos; «Volver a los de siempre» → la llave de aceite desaparece de la nube.
- **Carro afuera (C):** el kilometraje sale del `kmSalida` del contrato abierto (30,250, «salió el 10 oct 2026»). **Contratos sin kilometraje (D):** «No se sabe…», y por tiempo TOCA hoy.
- **Lectura que llega tarde:** la ficha dibujó con la copia local (batería «SIN REGISTRO») y 2 s después, al llegar la nube con un servicio anotado «desde otra computadora», se repintó (6 en el historial).
- **Dos computadoras:** con la ficha abierta, «otra computadora» anotó un servicio en la nube; al registrar otro aquí quedaron **los dos** (8 en total) y la pantalla los mostró.
- **«Guardar carro»** (cambiar el color) después de anotar: la nube conservó los 8 servicios.
- **Lectura fallida:** con la nube caída la barra roja dice «No se pudo leer la flota…» y «No se pudieron leer los contratos…», los renglones que estaban «AL DÍA» pasaron a «NO SE PUDO CONFIRMAR» y el TOCA se quedó TOCA; el kilometraje agrega «Puede estar atrasado».
- **El aviso en «Sacar carro» de verdad** (sin tocar `sacarCarro.js`): carro D, sin kilometraje → «A este carro le toca servicio: aceite y filtro (tocaba el 16 oct 2026).» en ámbar (medio); al
  teclear 17500 de kilometraje de salida → «…(tocaba a los 17,000 km y el carro anda en 17,500; por fecha, el 16 oct 2026).»; carro A (sin servicios) → **ningún aviso**; carro B → «tocaba el 20 sep 2026».
- La captura de pantalla de este panel suele salir un cuadro atrasada: me fié del DOM (`innerText`, valores, estado de la nube falsa).

## Mutaciones (todas matadas; las que sobrevivían eran código redundante y lo quité)

`scratchpad/mut/mutar.mjs` aplica una sustitución exacta, corre las pruebas y restaura. Núcleo: 52 mutantes, 50 muertos al primer intento y los 2 que sobrevivían eran equivalentes
(un guardia redundante de `kmLeido` y otro de `ladoDeTiempo`: los quité). `avisosDeSalida`: 4, el que sobrevivía era un `if (carro)` redundante (quitado). Datos: 13/13. Pantalla y `carros.js`: 12/12.
Entre lo matado: umbrales exactos (500 km/501, 15 días/16), `kmLeido` con 0/vacío/booleano, el cero inventado, el carro ajeno, el cierre sin `fechaReal`, el puente `kilometrajeSalida`, el mayor y no el último,
el servicio anulado/sin fecha/futuro que no cuenta, la degradación a «No se pudo confirmar» (y que NO degrade lo malo), `merge` en lugar de reemplazo, leer fuera de la transacción, el id de reintento,
la copia local que falla, `{ km: 0 }` que no se vuelva «faltan 20,000», y «sin kilometraje» dibujado como 0 km.

## Preguntas abiertas para él (en pantalla, con el trabajo hecho)

Los seis intervalos (tabla de arriba: **son míos, de criterio general, no medidos ni verificados con un taller**, supuesto de 2,000–3,000 km/mes), cuánto antes avisar (500 km / 15 días),
si el aviso debe ser `alto` en vez de `medio` (el encargo dijo «al nivel de una licencia vencida»; el brief dijo `medio`; seguí el brief), y si quiere el costo de cada servicio (no está en la
especificación; si lo quiere, va detrás de la contraseña de dinero, §11). Un matiz que conviene que sepa: el kilometraje que muestra la ficha es el de sus contratos y puede ir atrasado
(la ficha dice de qué contrato y de qué fecha sale); el que se teclea en un servicio queda con el servicio y no sube ese número.

