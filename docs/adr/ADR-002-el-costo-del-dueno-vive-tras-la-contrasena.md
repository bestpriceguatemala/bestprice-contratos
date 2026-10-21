# ADR-002: El costo del dueño vive tras la contraseña de dinero

- **Status**: accepted
- **Date**: 2026-09-29
- **Deciders**: Esteban Urízar
- **Tags**: dinero, seguridad, datos

## Context

Cuando Best Price subarrienda el carro de otra persona, guarda cuánto le paga
a ese dueño por día (`subarriendo.costoDia`). De ese número salen dos cosas
que son el negocio mismo: **lo que le debe al dueño** y **la utilidad de esa
renta**.

El diseño general (§7) siempre dijo que ese dato pertenece a
`contratos/{id}/privado/dinero`, la subcolección que solo se lee con la
credencial del área de dinero. Pero cuando se construyó "Sacar carro" esa área
todavía no existía, así que se guardó provisionalmente en el documento del
contrato — legible por cualquiera que tenga la sesión normal. El propio diseño
anotó esa deuda en su momento.

Hoy se construye la liquidación a dueños, que **es** el área de dinero. La
deuda vence.

Hay una razón para no moverlo: hoy solo el dueño entra al sistema, así que en
la práctica nadie más lo ve, y migrar los contratos ya guardados cuesta trabajo
y una vuelta de revisión. Pero el día que entre un empleado al mostrador —que
es a dónde va este sistema, porque ya hay comisiones por empleado en el
diseño— esa persona vería lo que Best Price paga por cada carro ajeno y lo que
gana con él. Mover el dato después, con más contratos guardados, solo será más
caro.

## Decision

`subarriendo.costoDia` **se mueve a `contratos/{id}/privado/dinero`**, donde la
lectura exige la credencial de dinero.

- Los contratos ya guardados se migran **una sola vez**.
- El código conserva un **puente de lectura** para los que aún no se hayan
  migrado, igual que los puentes que ya existen (§7b del diseño general).
- El área de dinero es el único lugar del sistema que lo lee.

## Consequences

### Positive
- Lo que Best Price paga por cada carro ajeno, y su utilidad, dejan de estar al
  alcance de una sesión normal.
- El modelo de datos deja de contradecir al diseño; §7 vuelve a ser cierto.
- Cuando entre un empleado al mostrador, no hay nada que apagar a las carreras.

### Negative
- Hay que migrar los contratos existentes, con su tarea y su revisión.
- Queda un puente de lectura más que el sistema arrastra para siempre.
- Cualquier pantalla futura que necesite ese costo tendrá que pedir la
  credencial de dinero, no basta con la sesión.

### Neutral
- Para el dueño, que hoy es el único usuario, no cambia nada visible.

## Links
- Diseño general §7, §7b, §11: `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`
- Diseño de la liquidación §7: `docs/superpowers/specs/2026-09-29-liquidacion-a-duenos-design.md`

## Actualización del 13 de octubre de 2026: la pregunta abierta del porcentaje de comisión

Esta decisión movió el costo del dueño del carro y dejó abierta la otra mitad de lo que §7 del diseño general pedía:
`porcentajeComision`, que sigue en el documento del contrato. Al construir los empleados y sus comisiones se decidió y
**no se movió**. Resumen (el detalle está en «Pendientes conocidos del dinero», §7b del diseño general):

- **El mostrador tiene que leer el porcentaje del empleado para poder sellarlo en el contrato**, y ese número vive en
  `empleados`, que la regla deja leer a cualquier sesión. Mover solo el campo del contrato no oculta nada.
- **El hueco que pesa es la escritura, no la lectura.** `contratos/{id}` y `contratos/{id}/privado/{doc}` los escribe
  cualquier sesión, así que mover el campo tampoco impediría que alguien cambiara el porcentaje de sus propios contratos.
  Lo que lo cierra es una regla (el porcentaje de un contrato no cambia al actualizarlo, salvo con la credencial de
  dinero, y al crearlo es el del empleado que dice `empleadoId`), no un cambio de lugar.
- **Antes de que un empleado use el mostrador** hay que decidir esa regla. Hoy él es el único usuario.

La lección de esta decisión es la misma de arriba, aplicada a otro campo: un candado se mide por lo que queda afuera, y
antes de mover un dato conviene preguntar quién lo lee **y quién lo escribe**.

## Actualización del 21 de octubre de 2026: la regla del porcentaje de comisión, decidida

La actualización del 13 de octubre dejó una decisión pendiente: la regla que cierra la **escritura** de `porcentajeComision`.
El dueño la pidió con sus palabras el 21 de octubre: *«Sí, no quiero que nadie se suba el porcentaje.»* Queda así en
`firestore.rules` (commit `f4ba5fa`), dentro de `match /contratos/{id}`:

| operación | quién | condición |
|---|---|---|
| leer | cualquier sesión | sin cambio |
| **actualizar** | cualquier sesión | **solo si el porcentaje queda igual**; con la credencial de dinero, siempre |
| crear | cualquier sesión | **sin cambio (abierto, a propósito: ver abajo)** |
| **borrar** | solo dinero | antes: cualquier sesión |

**Entra en vigor cuando el dueño la pega en la consola de Firebase** (las reglas las publica él a mano, §11). Hasta entonces
el archivo del repositorio y lo que Firebase aplica son cosas distintas. El archivo de antes quedó guardado byte por byte en
`firestore.rules.anterior-2026-10-21.txt`: es lo que se pega para deshacer. *Fecha en que se pegó en la consola: la anota el
dueño aquí cuando lo haga.*

### Lo que se midió antes de escribirla: quién escribe un contrato, con qué sesión

Se leyó `js/datos.js` entero y se buscó en todo el árbol (`setDoc`, `updateDoc`, `writeBatch`, `runTransaction`, `deleteDoc`).
La tabla completa está en `.superpowers/regla-porcentaje-2026-10-21.md`. Lo que decide la regla:

- **«Sacar carro» crea el contrato y es el único que sella el porcentaje**, con la sesión del mostrador. Todo lo demás que
  escribe el mostrador sobre un contrato que ya existe (cobrar, recibir el carro, anular un pago, liberar la garantía, enlazar a
  un dueño) manda el documento tal como lo leyó o un parche que no menciona el porcentaje: el porcentaje no cambia.
- **El único camino que cambia el porcentaje de un contrato ya sellado es `enlazarContratosAlEmpleado`, y escribe con la
  credencial de dinero.** Se comprobó en el código, no se supuso: `const db = dbDinero()` (`datos.js:2467`), de `iniciar()` toma
  solo el módulo (`fsMod`) y el lote es `fsMod.writeBatch(db)` con la base de dinero. Una regla que exige dinero sobre un camino que
  escribe con la sesión del mostrador falla en producción con todas las pruebas en verde; por eso `pruebas/regla-porcentaje.test.mjs`
  fija esto con una nube de mentira que distingue las dos bases.
- **Nadie borra contratos** (no hay un solo `deleteDoc` en `js/`).

### Por qué se cierra el borrado

Sin eso, la regla de actualizar no serviría de nada: bastaría borrar el contrato y volver a crearlo con el mismo id y otro
porcentaje (crear está abierto). Como el sistema no borra contratos, negarlo a la sesión del mostrador no rompe nada.

### Por qué CREAR queda abierto (la parte que no se cierra, dicha con honestidad)

La alternativa era exigir al crear que `porcentajeComision` fuera igual al de `empleados/{empleadoId}`, con un `get()` dentro de la
regla. **No se hizo**, por estas razones, de la más a la menos importante:

1. **Falla cerrada, y el costo de equivocarse es que nadie pueda sacar un carro.** Con el cliente enfrente, sin nadie más que
   pegue el archivo anterior. Una actualización que se equivoca bloquea un cobro; un alta que se equivoca bloquea el negocio.
2. **No se puede probar desde este repositorio.** No hay emulador de Firestore (ni Java). Un error de *significado* en esa regla
   —no de sintaxis, que la consola sí detecta— bloquearía todas las salidas, y el primero en descubrirlo sería el dueño.
3. **Hay maneras reales de que una salida legítima se bloquee.** (a) El dueño cambia el porcentaje de un empleado mientras el
   formulario de salida está abierto: la lista se lee al abrir y no se vuelve a leer al guardar (el informe de comisiones del
   13 de octubre lo anotó como ventana chica con arreglo barato); el contrato saldría con el número viejo y la regla lo negaría, con
   el mensaje «No se pudo guardar el contrato. Intenta de nuevo.», que no explica nada, y reintentar no lo arregla hasta
   reabrir la pantalla. (b) Un empleado dado de alta o editado a mano en la consola con el porcentaje como texto o con más de
   dos decimales: el formulario sella `porcentajeAnotado(...)` (un número, redondeado a centavos) y ya no sería igual. (c) Un
   `empleadoId` vacío o de un empleado que no existe: la pantalla no deja guardar así, pero la regla fallaría cerrada ante cualquier
   otra puerta.
4. **Lo que compra es poco.** Cerrar crear impide que alguien *doctore un alta*, pero quien sabe hacer eso con las herramientas del
   navegador también puede fabricar un contrato entero, o cambiar `empleadoId`, los días o el precio de uno que ya existe: el
   mostrador escribe todos esos campos, y la regla solo cuida uno.

**Lo que sí queda como defensa mientras crear esté abierto:** el dueño ve el porcentaje de CADA renta, en la tabla «Por pagar» de
Comisiones (`js/pantallas/comisiones.js:518`), antes de marcar nada como pagado, y cada contrato real tiene su número impreso en
papel: una renta que no existe en papel, o con un porcentaje que no es el del empleado, se ve antes de pagarla.

**Cuándo vale la pena cerrarlo** (hoy él es el único usuario del mostrador): cuando entre un empleado, y con tres cosas hechas
antes: (1) que «Sacar carro» relea al empleado *al guardar* (la ventana de minutos pasa a milisegundos); (2) que la regla se
pruebe en el emulador de Firebase en una máquina con Java; (3) que el mensaje de fallo diga qué pasó. El borrador, sin probar y
**no pegado en ningún lado**:

```
allow create: if haySesion()
  && request.resource.data.empleadoId is string
  && exists(/databases/$(database)/documents/empleados/$(request.resource.data.empleadoId))
  && request.resource.data.get('porcentajeComision', null)
     == get(/databases/$(database)/documents/empleados/$(request.resource.data.empleadoId)).data.get('porcentajeComision', null);
```

### Lo que esta regla NO hace

- **No esconde el porcentaje**: cualquier sesión lo sigue leyendo, en el contrato y en `empleados` (la razón de la actualización
  del 13 de octubre sigue en pie: el mostrador necesita leerlo para sellarlo).
- **No protege `empleadoId`.** Hoy un mostrador con las herramientas del navegador podría reasignarle a otro empleado (o a sí
  mismo) una renta ya sellada, y con ella el porcentaje que lleva sellado. Ningún camino del código cambia `empleadoId` al
  actualizar (solo enlazar, y ese va con dinero), así que añadirlo a la regla sería de pocas líneas; no se hizo porque el dueño
  pidió el porcentaje y cada línea más es una línea que no se puede probar aquí.
- **No toca `contratos/{id}/privado/*`**: ahí escribe cualquier sesión (`allow create, update: if haySesion()`), pero esa
  subcolección solo guarda `costoDia` y nada del sistema lee un porcentaje de ahí (una prueba vigila que ninguna línea junte
  `privado` con `porcentajeComision`).

### Lo que cambia para quien edite a mano en la consola

La consola de Firebase **no pasa por las reglas**: puede cambiar un porcentaje cuando quiera. Pero si lo hace sin subir también
`actualizado`, una pantalla del mostrador que ya estaba abierta con el número viejo lo mandará de vuelta en su siguiente
guardado. Antes de la regla eso deshacía la corrección en silencio; ahora la regla lo rechaza y el mostrador ve «No se pudo
guardar… Intenta de nuevo» hasta que recargue (la copia local se corrige sola en la siguiente sincronía: la nube gana los
empates). La única forma que hoy tiene el sistema de cambiar el porcentaje de unas rentas es Dinero → Comisiones → enlazar con
la casilla del porcentaje, que usa la credencial de dinero y sube `actualizado`; pero solo existe para las rentas SIN enlazar. Para
corregir el porcentaje de una renta que ya está enlazada no hay pantalla: se haría en la consola, y entonces `actualizado` también
hay que subirlo (un número mayor, en milisegundos, que el que tenía).
