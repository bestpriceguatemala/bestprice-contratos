# Arreglo de concurrencia y reintentos (9 oct 2026)

Tres defectos de dinero de la prueba del sistema (`prueba-sistema-2026-10-07.md`: H-1, H-2, H-3). Son de
una misma familia —escrituras que se cruzan y reintentos— y se resuelven con DOS ideas, no con tres parches:

1. **Un documento que ya existe solo se reescribe si sigue siendo el que se abrió.** La comprobación vive
   dentro de la MISMA transacción que escribe, así que entre «leí» y «escribí» no cabe nadie (H-1 y H-3).
2. **Un alta nueva decide su identificador antes del primer intento** (`nuevoId*`), y el reintento cae en el
   mismo documento (H-2).

**Estado:** terminado. `npm test`: de **1090** a **1146** en verde (56 pruebas nuevas, todas en
`pruebas/concurrencia.test.mjs`; cada arreglo se comprobó quitándolo y viendo que sus pruebas fallan). El informe se
fue escribiendo a medida que avanzaba (un agente anterior perdió el suyo por un límite de uso).

## Cómo se midió (y qué NO)

- Baseline: `npm test` = **1090** en verde, árbol limpio.
- Puerto 4173 libre al empezar. Había un servidor viejo de un agente anterior en el **4377** (`node
  servidor.mjs`, PID 86931, sirve una copia desactualizada del árbol): no lo usé ni lo apagué; no es mío.
- Navegador: mi propio arnés (Firebase falso, la «nube» vive en el servidor para que dos pestañas la
  compartan), nunca el proyecto real y nunca una credencial.

## Decisiones


### H-1 — el pago que desaparecía (`438c124`)

**Qué se eligió:** un contrato que ya existía (trae `actualizado`) se escribe ahora dentro de una **transacción**
que lee el documento de la nube y se niega (`CODIGO_COPIA_VIEJA`, frase propia) si su `actualizado` no es el
que la pantalla abrió. No se mezclan los dos arreglos de pagos: ni uno ni otro se pisan, el que llega tarde no
escribe nada. El patrón es el del área de dinero (`MENSAJE_PAGO_CAMBIO`): no se registra, se dice qué hacer.

**Dos detalles que NO son obvios y quedaron decididos:**
- **Igualdad, no orden.** `mezclar` (cache.js) usa `actualizado` para decidir qué copia MOSTRAR; aquí la pregunta
  es otra: «¿es la misma versión que abrí?». Se compara con `!==`. Con `>` bastaban dos relojes desfasados por
  unos minutos para que el cambio de la otra computadora pasara por viejo y el pago se perdiera igual (hay una
  prueba que lo reproduce). La nube con sello MENOR también se niega.
- **Al negarse, la copia local de esta computadora se queda con lo que dice la nube.** `cargarContrato` sirve la
  copia local primero: sin eso, «recarga la página» mostraba la misma copia vieja y el intento siguiente se
  negaba otra vez, para siempre.

**Dónde dice la frase:** Recibir carro, «Cobrar» (el modo de solo cobro, que tenía un «intenta de nuevo» suelto),
Anular un pago y Liberar la garantía. «Intenta de nuevo» no sirve aquí: la copia en memoria sigue vieja.

### H-3 — la reservación que salía dos veces (`34744f6`)

**Qué se eligió: una transacción**, no releer-y-luego-escribir. Releer inmediatamente antes de escribir deja el
mismo hueco, más angosto (entre el `getDoc` y el `setDoc` cabe otra pestaña); la transacción lee la reservación
y escribe el contrato Y la marca de «entregada» juntos, y Firestore descarta y repite la que perdió el cruce.
Era además un guardado en dos pasos (contrato, luego marca): ahora es uno, y desaparece el aviso «guardado, pero
la reservación NO se pudo marcar» porque ya no puede pasar una mitad sin la otra.

La guardia se niega si la reservación **ya salió en otro contrato**, **se canceló** o **cambió** (su `actualizado`
ya no es el que la pantalla usó para llenar el formulario: si cambió el anticipo de pagado a pendiente, el pago
de Q400 que el formulario ya había copiado sería un pago que nadie recibió). Una reservación que ya apunta a ESTE
contrato es un reintento de un guardado que sí llegó: pasa.

**Lo que SIGUE sin poder impedir (dicho sin adornos):**
- Dos salidas del **mismo carro sin reservación**, o de **dos reservaciones distintas del mismo carro**: la guardia
  mira un solo documento. La disponibilidad del carro sigue dependiendo de lo que la pantalla leyó al abrir.
- Una salida **sin red** ya no se deja en cola (una transacción no funciona sin red): se niega. Antes la escritura
  quedaba en la cola del SDK y aterrizaba después, sin que nadie la controlara. Es un cambio de comportamiento a
  propósito, pero es un cambio.
- El **número de contrato** se toma antes de la transacción (el papel lo lleva impreso): la pestaña que pierde
  gasta un número que queda sin usar, un hueco en la numeración. Y el costo del dueño de un carro ajeno se
  escribe en `privado/dinero` antes también: la que pierde deja un `privado` huérfano que nadie lee.
- No es el SDK real: la imitación es fiel a lo documentado, pero no se comprobó contra un servidor.

### H-2 — el reintento que duplicaba (`5c42dd0`)

**Mismo patrón, mismas funciones, ninguno nuevo.** `nuevoIdCliente`, `nuevoIdReserva`, `nuevoIdVehiculo` y
`nuevoIdDueno` son `nuevoIdContrato` para las otras cuatro colecciones (las cinco salen de un solo helper
interno; `nuevoIdPagoDueno` se queda como está porque usa la base de dinero). Tres decisiones:

- **El guardado se niega sin id** (`MENSAJE_ALTA_SIN_ID`), como ya hacía `guardarPagoDueno`. Así una pantalla
  futura que se olvide de pedir el id falla en la primera prueba y no duplica en silencio una vez al año. Las
  ediciones ya traen su id y no cambian.
- **`altaConIdFijo` decide cuándo se suelta el id**, que era el riesgo que el informe de la prueba dejó anotado
  («si el id acuñado se reutilizara DESPUÉS de un guardado bueno, la alta siguiente pisaría a la persona
  anterior»): se conserva mientras el alta no salió bien y se suelta cuando sale bien. Un doble clic es una sola
  alta (la promesa se comparte); si pedir el id falla, el siguiente intento lo vuelve a pedir (no se guarda una
  promesa rechazada: el error viejo de `firebase-config.js`).
- **Son SIETE lugares, no seis**: las cuatro fichas, las dos altas rápidas de Sacar carro y **«Dar de alta como
  dueño y enlazar» del área de dinero** (`dinero.js`), que el informe de la prueba no contaba y que creaba otro
  dueño en cada reintento. Ahí el id va por grupo (`entrada.clave`): un intento fallido de «Pablo Soto» no le
  pega su id a «Mario López». Una prueba de estructura cuenta las llamadas de cada pantalla.

**Un hueco que se explica:** un carro nuevo reintentado cae en el mismo documento pero el código correlativo se
pide en cada intento (una transacción aparte), así que el reintento gasta otro y deja un hueco en la numeración. Un
hueco se explica; un carro repetido, no (mismo criterio que el número de comprobante).

## Lo que se verificó en el navegador (el arnés, no el SDK real)

Arnés propio en `scratchpad/conc/arnes` (Firebase falso con la nube en el servidor, así dos pestañas comparten
la misma; transacciones con versión y reintento; cola de escrituras sin red; latencia ajustable), sirviendo una
copia del árbol (`sincronizar.sh` imprime el HEAD y los archivos sucios: **HEAD `04f5b5e`, 0 sucios** en la pasada
final). Cada medición con IndexedDB borrada y la nube vuelta a sembrar. Clics REALES del ratón en los botones.

| Qué | Resultado |
|---|---|
| H-1, dos pestañas, Cobrar Q500 (A) y Q300 (B) | A: «Falta cobrar Q1,300». B: la frase del rechazo, nada escrito; la nube conserva `[1000, 500]`. Recargar en B, «Cobrar» desde Pendientes de cobro: ahora dice Q1,300, y al cobrar Q300 queda `[1000, 500, 300]`. |
| H-1, Anular un pago desde dos fichas abiertas | A anula el de Q500; B (copia vieja) anula el de Q300: rechazo, solo quedó anulado el primero. |
| H-1, el ejemplo del informe: liberar la garantía desde una lista vieja | B corrigió el cierre (daños Q100 y los cobró) y A, con la lista vieja, apretó «Liberar garantía»: rechazo; los daños siguen en la nube. |
| H-1, internet lento: el primer intento llega a los 10 s pero la pantalla se rindió a los 8 | «No se pudo registrar el abono. Intenta de nuevo.»; la nube ya tenía el pago; al apretar otra vez: **la frase del rechazo** (no un segundo pago). Ver «Fricción» abajo. |
| H-3, dos pestañas con la misma reservación | A: «Contrato N° 5 guardado… La reservación quedó entregada.»; B: «Esta reservación ya salió en otro contrato…»; en la nube un contrato con `[2400, 400]`, la reservación apunta a él, el contador quedó en 6 (el número que gastó B). |
| H-3, las dos a la vez con 700 ms de latencia | Igual: una gana, la otra se niega; el contador de B pasó por `tx.reintento` (conflicto real entre las dos). |
| H-2 en el código ANTERIOR (`a7157d3`, otro puerto) | Reproduce el defecto: sin red, «No se pudo guardar el cliente», vuelve la red, la cola aterriza, se aprieta otra vez: **dos «Ana López» con el mismo DPI**. Valida que el arnés sí lo ve. |
| H-2 en el código nuevo: clientes, reservaciones, dueños, alta rápida de dueño, «Dar de alta y enlazar» | Mismo recorrido (sin red, 8 s, vuelve la red, otra vez): **un solo documento** en los cinco. Carros: el recorrido sin red falla antes (el código correlativo es una transacción y sin red no corre), así que el cierre del tiempo vencido lo cubre la prueba unitaria. |
| H-2, dos altas rápidas seguidas en la misma pantalla de Sacar carro (Pedro Gómez, luego Luis Mora) | Dos clientes distintos: el id se soltó al salir bien. |
| Regresión de la historia completa (la lección del «Cobrar» que dejó de responder) | Reservar con anticipo → «Sacar el carro» desde la ficha → guardar → «Cobrar» de Pendientes de cobro (clic real) → «Recibir carro» → Contratos y la ficha del contrato (cerrado, Pagado). Un colector de errores de la página: cero excepciones. Ediciones de carros (fuera de servicio / habilitar) y la salida de un carro ajeno, también. Sin barra amarilla de versión. |

## Lo que queda abierto, dicho sin adornos

1. **H-3 no impide** (ver arriba): dos salidas del mismo carro SIN reservación o de dos reservaciones del mismo
   carro; una salida sin red (ya no se deja en cola, se niega); el hueco en la numeración del contrato que pierde.
2. **Fricción conocida, a propósito.** Con internet lento, si el primer intento de un cobro sí llegó y él aprieta
   «intenta de nuevo», el segundo se NIEGA («cambió desde que lo abriste… o un intento tuyo que sí había llegado»)
   en vez de salir como un éxito idempotente. Es lo seguro y la frase ya dice qué pasó, pero es un clic más. Si
   duele, el arreglo es detectar «lo que iba a escribir ya está» dentro de la misma transacción; no se hizo porque
   el dueño pidió «negarse y decir», y una comparación de más es una puerta más por donde equivocarse con dinero.
3. **Sin red, un cobro sobre un contrato que ya existía y una salida desde reservación se niegan** (antes se
   quedaban en la cola del SDK y aterrizaban después, sin que nadie lo controlara). Y cada uno cuesta dos idas y
   vueltas a la nube (leer y escribir) en vez de una.
4. **Lo que se escribe sin subir `actualizado` no lo ve el candado**: la migración del costo del dueño (no toca
   `pagos`) y, claro, una edición a mano en la consola de Firebase (en el arnés, una edición así se pisó con la
   copia de memoria, como antes). Y un documento viejo sin sello no se puede comparar.
5. **Un rechazo de más, una vez**: `enlazarContratosAlDueno` sube `actualizado` en la nube pero no actualiza la copia
   local de esta computadora; si él abre ese contrato antes de que la lista lo sincronice y guarda algo, se niega una
   vez. El propio rechazo deja la copia local al día, así que «recargar» sí funciona.
6. **Solo los contratos tienen el candado.** Reservaciones, clientes, carros y dueños siguen siendo «el último que
   guarda gana» sobre el documento entero. No tienen un arreglo de pagos, pero una reservación editada desde dos
   pestañas puede perder un cambio de anticipo. No era de este encargo.
7. **Reintentar un contrato NUEVO cuyo primer intento sí llegó** sobrescribe con `merge` (como antes): si entre los dos
   intentos otra pestaña cobró algo sobre ese contrato, el reintento lo borraría. Requiere un tiempo vencido y otra
   pestaña cobrando en esos segundos; no se cubrió.
8. **No es el SDK real.** La transacción del arnés imita la documentada (versiones, descartar y repetir, leer antes de
   escribir); no se probó contra Firebase ni con credenciales. Conviene una pasada del dueño con dos pestañas
   reales antes de confiar en los números de «Lo que se verificó».

## Para quien publique

- **Subí la versión** (`04f5b5e`, `version.txt` y `js/version.js` a `2026-10-09.1`, los DOS lados). A diferencia de la
  pasada anterior esto sí lo pide: el candado y los id solo protegen a quien corre el código nuevo, y una pestaña
  abierta con el viejo sigue reescribiendo el contrato entero. Si todavía no quiere el aviso amarillo, ese commit se
  puede quitar solo.
- No cambió ninguna regla de Firestore (las transacciones leen y escriben `contratos` y `reservas`, que ya lo permiten).
- El área de dinero, `liquidacion.js` y todo el dinero de §5 no se tocaron.
- Se quitó el aviso «guardado, pero la reservación NO se pudo marcar como entregada» de Sacar carro: con una sola
  transacción no puede pasar una mitad sin la otra.
- Se actualizó §7b del diseño (el uso nuevo de `actualizado` y los `nuevoId*`); sin campos nuevos.
- Mis servidores del arnés (4173 y 4174) quedaron apagados. El del puerto 4377 es de un agente anterior y no lo toqué.
