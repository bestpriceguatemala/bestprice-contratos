# Arreglo de concurrencia y reintentos (9 oct 2026)

Tres defectos de dinero de la prueba del sistema (`prueba-sistema-2026-10-07.md`: H-1, H-2, H-3). Son de
una misma familia —escrituras que se cruzan y reintentos— y se resuelven con DOS ideas, no con tres parches:

1. **Un documento que ya existe solo se reescribe si sigue siendo el que se abrió.** La comprobación vive
   dentro de la MISMA transacción que escribe, así que entre «leí» y «escribí» no cabe nadie (H-1 y H-3).
2. **Un alta nueva decide su identificador antes del primer intento** (`nuevoId*`), y el reintento cae en el
   mismo documento (H-2).

**Estado:** en curso. Este archivo se escribe a medida que avanzo (un agente anterior perdió su informe
entero por un límite de uso mientras sus commits sobrevivían).

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
