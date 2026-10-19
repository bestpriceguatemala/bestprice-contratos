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
