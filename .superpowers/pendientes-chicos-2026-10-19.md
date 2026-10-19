# Tres pendientes chicos — 19 de octubre de 2026

Base: `main`, `npm test` = 2194 pasan / 0 fallan, árbol limpio. Handoff: `.superpowers/donde-quedamos-2026-10-16.md` (puntos 2, 3 y la migaja de `mapa.js` del 4).

## 1. Guardar una salida siempre lleva a imprimir  (HECHO)

Palabras del dueño, 16 de octubre: «La tarjeta siempre se imprime al contrato para que el cliente la vea.»

**Qué cambió.** `destinoDespuesDeGuardar` (`js/pantallas/sacarCarro.js`) ahora contesta dos preguntas separadas:
- `ruta` = `#/imprimir/<contrato>` siempre que haya id y `sigueAqui`; si no, `#/flota`.
- `llevaTarjetas` NO cambió (`sigueAqui && contratoId && hay número o CBC`) y sigue siendo lo único que decide si se deja algo en el traspaso.

**Por qué existe `sigueAqui`.** Si la pantalla ya no está a la vista (se fue a otra parte mientras se guardaba) no se le lleva a una hoja que no esperaba, y no se deja nada en el traspaso (la defensa 3 lo borraría de todos modos).

**Pruebas** (`pruebas/sacarCarro.test.mjs`):
- `destinoDespuesDeGuardar`: partida en dos. Con tarjeta, solo CBC, vacías, `undefined`, `[]` → imprimir; `llevaTarjetas` solo cuando hay algo tecleado. Con `sigueAqui` falso/`undefined` o sin id (`''`, `null`, `undefined`) → flota y `llevaTarjetas` falso.
- Prueba nueva «a dónde voy y hay tarjeta que llevar son preguntas distintas»: con un espía en `dejar`, una salida sin nada tecleado va a imprimir y deja `[]` (no la lista de cajas vacías).
- «EL CASO FEO» actualizado a la nueva intención: tarjeta de un cliente sin imprimir → la renta en efectivo siguiente llega a SU hoja de imprimir con `[]` y la tarjeta anterior ya no existe. Se conservó lo que protegía.
- La prueba de «pantalla ya no a la vista» se conserva y se le agrega el caso sin tarjeta.

**Mutaciones (todas matadas):** ruta vieja (solo con tarjeta); `llevaTarjetas = hayAdonde` (mezclar las dos preguntas); quitar `sigueAqui`; quitar `contratoId`; ruta siempre imprimir; ruta siempre flota; `llevaTarjetas` sin `sigueAqui`.

**Diseño:** §8b punto 17 (nuevo) y una frase del 16 que decía «se va a la flota».

## 2. La hora de entrada REAL en el respaldo  (HECHO)

Palabras del dueño, 16 de octubre: «El lugar siempre va a ser en la oficina. La hora es lo que importa porque si se pasa de la hora yo decido cuánto le cobro.»

**Lo que se encontró.** Nombre del campo confirmado en §7b («Del cierre»: `fechaReal`, `horaReal`, `lugarEntrada`, ...) y en el código (`construirCierre`, `recibirCarro.js`). `mapa.js` YA llevaba `AF: { hora: cierre?.horaReal }` y `AG: aTexto(cierre?.lugarEntrada)` desde el 14 de octubre, anotadas en `.superpowers/respaldo-excel-2026-10-12.md` §6 como «mapeadas por parecido de nombre, a confirmar con él». O sea: la columna ya iba bien; lo que faltaba era que su palabra lo fijara, escribirlo en el diseño y pruebas que lo sostengan.

**Qué cambió en `js/respaldo/mapa.js`.**
- AF y AG se llenan solo si `yaVolvio(c)` (`nucleo/estados.js`, la única regla de «el carro regresó»: `cierre.fechaReal`). Antes bastaba que existiera `cierre`. Una hora o un lugar sueltos en un cierre sin fecha de regreso ya no se escriben.
- Comentario junto a las dos columnas con la decisión, la fecha y sus palabras.
- `AG` NO se vuelve un «OFICINA» fijo: ver Preocupaciones.

**Pruebas** (`pruebas/respaldo-excel.test.mjs`, 6 nuevas; fixtures con `construirCierre` sobre `F.rentadoAlDia()`, nada a mano):
- AF de cada contrato de 2026 = `fraccionDeHora(cierre.horaReal)` si ya volvió, vacía si no; el 102 sale a las 15:00 y regresa a las 11:15 y el archivo dice 11:15; el 101 (afuera) tiene AD y AF vacía.
- Recibida con `horaReal: ''` o sin la llave (cierre de antes del campo): celda sin `<v>`, ni cero, ni la hora de salida, ni aviso.
- `00:00` se escribe como 0 (es una hora); vacío es vacío.
- Hora que no se entiende (`25:99`, `9am`, `1030`): celda vacía y el aviso existente («no se entiende y quedó en blanco»). Esta prueba cierra un hueco que no tenía ninguna: antes `fraccion ?? 0` sobrevivía a todo.
- AF/AG con hora y lugar pero sin `fechaReal`: vacías; con `fechaReal`: llenas.
- AG es el lugar de la recepción, no el de salida (102: AE Aeropuerto, AG Oficina; 101: AE Oficina, AG vacía).

**Mutaciones (todas matadas):** AF ← `horaSalida`; sin `yaVolvio` (AF y AG por separado); `|| '00:00'`; `|| c.horaSalida`; AG ← `c.lugar`; AG constante; AF siempre vacía; `valorDe`: `fraccion || null`, `?? 0`, hora vacía → 0.

**Diseño:** §10, viñeta nueva «La hora y el lugar de entrada (columnas AF y AG)» con la fecha y sus palabras.

## 3. La pantalla del respaldo dice que el mantenimiento no va  (HECHO)

**Qué cambió.** `NO_SE_RESPALDA` (`js/respaldo/mapa.js`, la lista que dibuja `js/pantallas/respaldo.js` en el bloque «Lo que este archivo NO lleva», siempre visible y abierto) tiene una línea más, junto a la del «fuera de servicio»:
«El mantenimiento de la flota (la pantalla Mantenimiento): los servicios que se le han hecho a cada carro y cada cuánto le toca cada uno. Su hoja VEHICULOS no tiene dónde guardarlos.»
Cubre `servicios[]` e `intervalos{}`. No se enumeran los seis tipos de servicio en el texto a propósito: si mañana hay un séptimo, la frase no se queda vieja.

**Pruebas** (`pruebas/respaldo-pantalla.test.mjs`, 2 nuevas):
- La lista de `mapa.js` tiene exactamente UNA línea sobre el mantenimiento y dice «servicios», «cada cuánto» y «VEHICULOS»; la pantalla la dibuja dentro de `rs-no-lleva` en los cinco estados (normal, cargando, armando, con error, con resultado). La prueba que ya existía (`for (const punto of NO_SE_RESPALDA)`) NO habría fallado si la línea desaparecía.
- Que la frase sea verdad: `armarCeldas` con un carro con servicios (`carroConServicios`) e intervalos (`carroConIntervalo`), ambos de los constructores del sistema, da celdas IDÉNTICAS (y los mismos avisos) que el mismo carro sin ellos, y las únicas columnas de VEHICULOS que se escriben son B–H.

**Mutaciones (todas matadas):** quitar la línea; quitarle «VEHICULOS»; quitarle «servicios»; escribir el número de servicios en la columna I; escribir un intervalo en la columna J.

**Diseño:** §10 (la viñeta que decía «falta agregarle una línea» ahora dice que se agregó y cómo se vigila); §7b «Del respaldo, de campo a columna»: Carros (`servicios[]`/`intervalos{}` sin columna) y Contratos (HORA/LUGAR ENTRADA salen de `cierre.horaReal`/`cierre.lugarEntrada`; esa frase es del punto 2 y quedó en este commit).

## Preocupaciones

1. **AG: no lo volví un «OFICINA» fijo.** «Deja de ser pregunta» lo leí como: ya no hay que confirmar con él qué lleva la columna. AG sigue llevando `cierre.lugarEntrada` (lo anotado al recibir) y vacío si el carro no ha vuelto. Escribir «OFICINA» a todos habría sobrescrito un lugar anotado distinto y puesto un lugar de entrada en rentas que todavía no regresan. Si lo que quiso decir es «AG siempre dice OFICINA», es una línea en `armarContrato` (`mapa.js`) y dos pruebas que cambiar (`AG LUGAR ENTRADA es el lugar anotado al RECIBIR…` y la de `yaVolvio`).
2. **Dos hallazgos de su palabra que NO toqué (no eran lo pedido):**
   - El campo «Lugar de entrada» de «Recibir carro» es texto libre sin valor por omisión; si «siempre es la oficina», lo lógico es que venga puesto «Oficina». Hoy, si el mostrador lo deja en blanco, AG sale vacía en el respaldo.
   - La hoja impresa precarga «lugar de entrada» con el lugar de SALIDA (`hojaContrato.js`, decisión del 14 de octubre: «casi toda renta vuelve donde salió»). Su frase del 16 («siempre va a ser en la oficina») la contradice; la decisión de qué precargar es suya.
3. **La hora real no es obligatoria al recibir** (`problemasDelCierre` no la pide). Si la deja en blanco, AF queda vacía en el respaldo, y es justo la hora con la que él decide el cobro. No lo cambié ni lo avisé («no avisos que no pidió»); es una decisión suya si debe pedirse.
4. **AF mezcla dos significados en su hoja:** las filas que escribe el respaldo traen la hora real; las que él agregue a mano con su método traen la que esperaba. Está dicho en §10, no en pantalla.
5. **«Lo que este archivo NO lleva» está debajo de los botones de bajar**, no antes (el aviso de privacidad sí va antes). Está `open`, y no lo moví porque no era lo pedido.
6. **Guardar cuando la pantalla ya no está a la vista** sigue mandando a `#/flota` (comportamiento fijado por una prueba existente desde el 16; era `location.hash = '#/flota'` incondicional antes). Quien se fue a otra pantalla mientras se guardaba aterriza en la flota. El comentario viejo decía «no se le quita su pantalla»; lo reescribí para no prometer eso.
