# Cómo salió el carro, en «Recibir carro» (9 oct 2026)

Lo que pidió el dueño: *«Acá no me dice a qué hora salió el vehículo, dame una prevista de cómo salió el carro.»*
La pantalla mostraba cuatro datos de la salida (fecha, devolución prevista, kilometraje, lo pagado) y la hora no era
uno. Es el dato con el que decide si se debe una hora tardía, que ya es un cobro de esta misma pantalla.

**Estado:** terminado. Commit del código `35c4776`. `npm test`: de **1146** a **1164** en verde (18 pruebas nuevas,
todas en `pruebas/recibirCarro.test.mjs`). Archivos tocados: `js/pantallas/recibirCarro.js`,
`pruebas/recibirCarro.test.mjs`, `css/estilos.css`.

## Qué se ve ahora

- **Siempre a la vista** (tres tarjetas, la hora primero): *Hora de salida*, *Kilometraje de salida*, *Combustible al salir*.
  Son los tres que lee en la pantalla y compara con el carro que tiene enfrente. El kilometraje se mudó aquí desde la
  ficha de arriba (no se repite).
- **Detrás de «Ver todo de la salida»**: lugar, días, precio por día, quién lo rentó, conductor adicional, observaciones,
  y «Cobrado al salir» (las líneas de `lineasSalida` y su total, de `resumen().totalSalida`). Abierto dice «Ocultar».

Los nombres de los campos son los de §7b, leídos del glosario y no de memoria: `horaSalida`, `lugar`,
`combustibleSalida`, `kmSalida` (con el puente de `kilometrajeSalida`), `dias`, `precioDia`, `rentadoPor`,
`conductorAdicional{nombre}`, `observaciones`. `lugar` va a secas, sin «Salida»; `combustibleSalida` no es el
`combustible` del cierre (ese es un monto).

## Decisiones

1. **`<details>`/`<summary>` nativo, sin JavaScript.** El navegador lo abre y lo cierra solo: no hay un oyente que pueda
   dejar de responder en silencio (el botón que dejó de responder aquí no lo notaron 1074 pruebas verdes). Tampoco lleva
   un `<button>`: dentro de este formulario uno sin `type="button"` lo enviaría, y enviarlo RECIBE el carro y COBRA el
   saldo. Una prueba fija las dos cosas. El texto «Ver todo»/«Ocultar» lo cambia el CSS según `[open]`.
2. **Un dato que no se anotó vale `null` y se pinta «sin anotar»**, chico, en cursiva y gris (`.rc-vacio`), distinto de un
   dato real, que sale grande y en azul marino. `datosDeSalida()` (pura, exportada) nunca devuelve `''` ni `0` para lo que
   falta. Cubre las dos formas que hay guardadas: la llave ausente (contratos de antes) y `''`/`0` (el mostrador se saltó
   el campo; `construirContrato` los deja así).
3. **El kilometraje que falta dejó de salir «0».** Antes `conKmSalidaNormalizado` lo volvía 0 y la ficha lo pintaba tal
   cual: un cero seguro de sí mismo en la pantalla que se compara con el tablero. Ahora 0 o falta = «sin anotar»
   (la validación del cierre, `cierre.js`, ya trata `kmSalida` en 0 como «no se anotó»). El puente del nombre viejo
   sigue funcionando (prueba: `kilometrajeSalida: 61250` se ve «61,250»).
4. **La hora pasa por `hora24`** (el camino que la normaliza al escribirla) y se ve tal cual, en 24 horas: «22:30» nunca
   es «10:30 PM». Si lo guardado no lo entiende `hora24` (§7b dice que no debería pasar), se muestra tal cual en vez de
   decir «sin anotar» sobre algo que sí está anotado.
5. **Ninguna regla de cobro se rehízo.** Lo cobrado sale de `lineasSalida` y `resumen`; por eso `seguroDia`,
   `seguroTercerosDia` y `deducible` (solo informativos, §7b) no aparecen como cobrados. Hay una prueba con cifras
   distintas para cada uno. Dinero por `q()` y `dinero()`; ningún aviso nuevo.
6. **Nada en línea.** Clases `rc-*` en `css/estilos.css` (ninguna existía: no había tarjetas ni lista de definiciones ni
   estilo para un `<details>`). Dos pruebas, al estilo de las de dinero: ningún `style=` en el código ni en lo que se
   dibuja, y cada clase `rc-*` dibujada está definida en el CSS y ninguna definida sobra.
7. Se ve igual en el modo de solo cobro y en el de corrección: la ficha de arriba ya mostraba el kilometraje ahí.

## Cómo se comprobó

**Pruebas.** Cada una se verificó rompiendo lo que fija (13 mutaciones, las 13 las atrapó una prueba): quitar `hora24`,
pintar el km 0 como «0», pintar el combustible vacío, una hora de `00:00` inventada, no mostrar la hora rara, el
`<details>` abierto de entrada, un `<button>` dentro, un `style=`, sin escapar, el deducible como cobrado, una regla
del CSS cambiada, una clase sin definir, el km duplicado en la ficha. Incluye contratos sin `horaSalida` ni
`combustibleSalida` (llave ausente, `''`, `'   '` y `null`) y uno sin ninguna llave de la salida.

**«No cambió nada más».** Con el `plantilla` de `HEAD` y el nuevo, sobre los cuatro contratos de abajo y en los tres
modos (recibir, corregir, solo cobro) = 8 plantillas: idénticas byte a byte una vez que se quita mi bloque y la línea del
kilometraje que se mudó. Todos los campos, ids, el botón y el bloque de cobro son los mismos.

**En pantalla (navegador).** Servidor: `preview_start contratos` (`npx serve`, puerto 4173; el puerto estaba libre al
empezar y lo detuve al terminar, queda libre). IndexedDB `bestprice-contratos` versión 3 sembrada y vuelta a sembrar justo
antes de cada medición; `#app` visible y `#entrada` oculto; Firebase falso por import map inyectado desde una página 404
(no toqué ningún archivo del repo; nunca se pidió ni se usó una credencial). Una salvedad: `preview_start` abre por sí
solo `http://localhost:4173` y esa primera carga fue la página real una vez (baja el SDK de Firebase de gstatic y lo
inicia; sin sesión y sin ningún intento de entrar) antes de que pasara a mi arnés. Desde ahí, con el Firebase falso, no
hubo ninguna petición a gstatic (se miró con la lista de recursos de la página). Cuatro contratos: completo (`c-completo`), de antes sin hora/combustible/lugar y con el nombre viejo del
kilometraje (`c-viejo`), con la hora y el combustible saltados en `''` y km en 0 (`c-saltado`), y uno ya recibido
(`c-cerrado`, para corrección y solo cobro).

- Completo: se ven «13:45 · 45,000 · 3/4» sin abrir nada.
- Sin hora ni combustible: «sin anotar» en cursiva gris en esos dos (y en el km cuando es 0); lugar, quién lo rentó y
  observaciones también donde faltan.
- «Ver todo» abre y cierra con clic de verdad, con Enter y con espacio; el formulario no se envía (contador de
  `submit` en 0); abierto, escribir en un campo del cierre sigue recalculando y no lo cierra; Enter dentro de un campo
  sigue bloqueado.
- **El botón de verdad:** «Recibir y cobrar» sobre el completo (con el «ver todo» abierto) respondió: un solo envío,
  «Contrato 101 recibido y cobrado.», cierre y pago de Q2,380.00 escritos, ruta a `#/flota`. En solo cobro, «Cobrar» con el
  «ver todo» abierto: pago de Q2,580.00, «Contrato 104 cobrado por completo.». La «nube» fue un Firestore falso en
  memoria que implementa lo que usa `guardarContrato` (transacción con la guardia de copia vieja), no el SDK real.
- En 768 px mis tarjetas no se salen de su caja (se apilan una por fila).

## Lo que queda (dicho sin adornos)

- **«Seguros extra» sale como UNA línea**, la que arma `lineasSalida` («menores, PAI, deducible bajo»), así que no dice
  cuál de los tres se cobró. Desglosarlo bien pide que `lineasSalida` devuelva una línea por seguro (`nucleo/contrato.js`,
  fuera de mis archivos); hacerlo aquí leyendo los tres campos sería repetir en la pantalla qué se cobra y cómo.
- **0 se lee «sin anotar»** en kilometraje, días y precio por día: el sistema guarda 0 cuando el campo se dejó en blanco
  (§7b) y no hay forma de distinguirlo de un 0 puesto a propósito. Para el km ya era así en `cierre.js`. Para el precio
  por día, un Q0 puesto a propósito saldría «sin anotar» (y `lineasSalida` tampoco emite la línea «Renta» con precio 0).
  Si prefiere que un precio 0 se vea «Q0.00», es una línea.
- **Agregué dos filas que no estaban en su lista**: «Conductor adicional» (solo el nombre) y «Observaciones», por ser
  parte de cómo salió el carro. Se quitan borrando dos líneas de `bloqueDeSalida`.
- **Una hora tardía marcada al salir sin monto** (el `horaTardia: true` de unos contratos viejos) no aparece en esta vista;
  sí aparece en el detalle del contrato (`textoHoraTardia`). Una de numérica guardada al salir sí sale como línea
  «Hora tardía» en «Cobrado al salir». No lo agregué: no lo pidió.
- **Versión sin subir** (`version.txt`, `js/version.js`): las pestañas abiertas siguen con la pantalla anterior hasta que se
  suba. Es decisión suya al publicar; no era de mis archivos.
- **Solo escritorio**: la hoja de estilos no tiene reglas para pantalla angosta (solo `@media print`), y en un celular el
  panel de la derecha se encima con la primera columna. Es de antes y no lo toqué; lo mío no se sale de su caja.
- Quedó sin tocar un servidor viejo de otro agente (`node servidor.mjs`, PID 86931, puerto 4377, desde el 7 de octubre):
  no es mío y sirve una copia desactualizada del árbol.
