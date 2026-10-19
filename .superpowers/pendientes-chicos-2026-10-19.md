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
