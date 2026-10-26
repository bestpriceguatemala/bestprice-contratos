# Papel impreso: teléfonos partidos y firma sola (24 de octubre de 2026)

**Estado: hecho, verificado imprimiendo a PDF y mirando las hojas.** Base: `main` en `0da2ec4`, `npm test` = 2577 pasando. Al terminar: **2589 pasando, 0 fallando** (+12, todas nuevas).
No toqué `version.txt` ni `js/version.js`. Cuatro commits (los tres arreglos y este informe), con rutas explícitas (nunca `git add -A`):

| sha | qué |
|---|---|
| `5e243dd` | los teléfonos del membrete ya no se parten (los dos papeles) |
| `6fb0b10` | la firma ya no queda sola en una hoja de más (los dos papeles) |
| `96457db` | este informe (primera versión) y una nota en el diseño §6 |
| `6f2ae16` | la fecha y las placas de cada renta ya no se parten (los dos papeles) |
| (el commit que actualiza este informe) | |

## Lo que vi ANTES (PDF de Chrome sobre la pantalla real, Carta, mirado como imagen)

- **Teléfonos:** en TODOS los PDF de los dos papeles, de cualquier tamaño, el renglón salía «WhatsApp: 4019-3131 · 4001-2626 · 5770-» y abajo «5278».
  Medido a muchos anchos: se parte justo en el ancho de Carta (≈ 700 px de contenido) y en otros no (a 560 px el renglón baja entero): por eso un arreglo que
  «agrande el hueco» solo funciona a un ancho.
- **Firma sola (papel del empleado, rentas de un renglón):** con 14 a 21 rentas la última hoja traía el total y la firma, o solo la firma y la forma de pago, sin ninguna renta; otra vez con 44 a 52.
  (Con rentas más altas —nombres largos— las ventanas se corren: la «24» de la que hablaba el informe anterior es una de ellas.) Con 44 rentas el PDF del informe anterior mostraba la firma partida:
  «Firma del empleado» abajo en la hoja 2 y el nombre «Ana López» solo en la hoja 3.
- **Papel de los dueños** (sin pendientes): firma sola con 11 a 15 y con 42 a 45 rentas pagadas.

## Por qué `break-before: avoid` en la firma «no cambió nada» (medido, no adivinado)

1. `avoid` solo prohíbe el corte **en ese borde**; el navegador lo mueve al **borde anterior que no esté prohibido**. Antes de la firma hay otro borde libre (tabla → «Forma de pago»),
   y el corte se movió uno solo: la hoja de más quedó con «Forma de pago» y la firma (lo vi en la imagen: es lo mismo, con una línea más). Para que viajen renglones de verdad hay que prohibir **cada** borde
   de la cadena, de la firma hacia atrás (firma ← forma ← total ← últimas rentas), como ya hace `.comp-pie-suma` con el total.
2. Con la cadena completa **funciona en la primera hoja y falla en las siguientes**: en una hoja que *continúa* una tabla el navegador no sabe mover el corte hacia atrás cuando lo que sobra
   está después de las rentas (deja el total y la forma arriba y la firma sola abajo, con todos los bordes prohibidos). Lo reproduje en una página mínima sin nada del sistema (con la tabla
   empezando en una hoja nueva sí se cumple), y fallaron también: sin `thead` repetido, sin `tr {break-inside: avoid}`, con el total en `tfoot` o en `tbody`, con la forma y la firma dentro de la tabla,
   con `display: contents` para unir los cuerpos. Lo único que se cumple en **todas** las hojas es un bloque que no se parte.
3. Por eso, en el papel del empleado (una sola tabla larga que casi siempre continúa), el total, la forma de pago y la firma son filas de la misma tabla, junto con las últimas tres rentas, en
   `tbody.comp-cola { break-inside: avoid }`. Si no caben, pasan **enteras** a la hoja siguiente (con el encabezado repetido). El mecanismo que ya estaba, aprendido: filas que no se parten + encabezado que se repite.
   En el papel de los dueños (la firma va después de una sección que puede ser una frase, no una tabla) uso la cadena de `avoid`, que ahí sí se cumple (sus tablas empiezan en la hoja).

## Lo que cambié

- `js/pantallas/comprobante.js`: `htmlDelMembrete()` y `htmlDeLineaDeContacto()`. El texto de `MEMBRETE` **no cambia ni una letra** (la prueba que lo fija, sin NIT, sigue); cada número con guion va en `<span class="comp-sin-corte">`.
  El membrete estaba escrito dos veces; ahora es uno y lo usan los dos papeles.
- `js/pantallas/comprobanteComision.js`: usa el membrete compartido; el total, la forma y la firma pasan al bloque `tbody.comp-cola` (ya no hay `tfoot` ni `footer` en ese papel).
- `css/estilos.css`: `.comp-sin-corte { white-space: nowrap }` (la garantía a cualquier ancho); `.comp-marca { flex: 1 1 60mm }` y `.comp-contacto { flex: 0 1 auto }` con `flex-wrap` (en Carta el renglón de los WhatsApp sale en **uno solo**, como lo aprobó;
  si ya no caben lado a lado el contacto baja en vez de apretarse); `.comp-cola`, las filas `.comp-fila-total` / `.comp-fila-suelta`; la cadena de `avoid` del papel de los dueños; y `.comp-al-dia { break-after: avoid }`
  (al empujar la tabla y la firma a la hoja siguiente, el título «Queda pendiente» y su línea se quedaban huérfanos al pie: lo vi, lo arreglé y lo volví a mirar).
- Pruebas (`pruebas/comprobante.test.mjs` +7, `pruebas/comprobante-comision.test.mjs` +5) y dos ayudas en `pruebas/fixtures/`: `reglasCss.mjs` (lee las reglas de `estilos.css`: una regla cuenta **con sus declaraciones** y se sabe si está en `@media print`, como pide el precedente)
  y `lineasDeContacto.mjs`. Cubren: el texto del membrete es exactamente el aprobado; cada número está marcado entero; el membrete es el mismo en los dos papeles; la estructura del bloque (las últimas 3 rentas, en orden, con el total, la forma y la firma, con 1, 2, 3, 4 y 44 rentas);
  y cada regla de CSS con su declaración. Mutaciones sobre una copia: **19 y todas mueren** (CSS, marcado, cuántas rentas viajan, membrete compartido). Ojo: mi primer script de mutaciones tenía un error (no corría las pruebas y todo salía «muerta»); lo detecté porque una mutación que no cambia nada también salía «muerta». Lo arreglé, agregué ese control (debe sobrevivir, y sobrevive) y las repetí todas.
- **Pruebas viejas que ajusté (y por qué no es aflojarlas):** en `comprobante-comision.test.mjs` (1) el conteo de `<tr>` ahora cuenta también el total y las dos filas de forma y firma (`1 + 3 + 1 + 2`); (2) la comprobación del membrete compara las líneas
  **sin etiquetas** contra `MEMBRETE.contacto` con `deepEqual` (antes buscaba cada línea como subcadena, que las etiquetas rompen; ahora es más estricta, y la prueba de «sin NIT» no se tocó); (3) la de «ninguna clase sin regla» admite las tres clases propias del bloque final,
  que tienen su regla con declaraciones en otra prueba.

## Placas y fechas partidas (pedido después, mismo defecto que el teléfono)

- **Antes** (con nombres de cliente largos, como «Carlos Alberto Méndez Barrios»): la tabla aprieta las demás columnas y el navegador corta la placa tras el guion. Contado en el texto del PDF: papel del empleado con 60 rentas, **60 placas** («P-» / «100ABC») y **60 fechas** («5 ago» / «2026») partidas, o sea todas; papel de los dueños con 8 rentas, **8 placas** partidas.
  Con nombres cortos no se ve, por eso el informe anterior no lo notó.
- **Qué hice:** el mismo mecanismo, `comp-sin-corte` (`white-space: nowrap`), en la celda de la **fecha** y la de las **placas** de cada renta, en los dos papeles (`<td class="comp-sin-corte">`). El nombre del cliente NO lo lleva (es la columna que cede) ni la frase larga de una diferencia pendiente (si no se partiera saldría por la derecha de la hoja). El número de contrato no lo lleva: no tiene dónde partirse.
- **Después, mirado como imagen** (papel del empleado con 24 y 60 rentas, papel de los dueños con 8 y 30, nombres largos): **0 placas y 0 fechas partidas** (conteo en el texto del PDF y a la vista).
- **Qué se comió la columna (lo que vi, sin elegir por él):** la del **cliente** cede: «Carlos Alberto» / «Méndez Barrios» y «María Fernanda» / «González de Estrada» salen en dos renglones (antes la fecha y la placa ocupaban esos dos renglones, así que la fila no crece más que antes).
  En el papel de los dueños, además, el encabezado «Fecha de salida» pasa a dos renglones («FECHA DE» / «SALIDA») cuando hay un nombre largo, porque la columna de la fecha ya no se ensancha; es solo el rótulo, ningún dato. Con nombres cortos la tabla sale idéntica a antes.
- Las hojas de más y la firma siguen como antes: barridos con nombres largos, empleado 1–70 rentas y dueños 1–45 con 0 y 2 pendientes: ninguna firma sola. Pruebas nuevas: cada celda de fecha y de placas lleva la marca; el cliente y la frase de una diferencia no (7 mutaciones, todas mueren).

## Lo que vi DESPUÉS

Barridos automáticos, cada hoja imprimida con el PDF real y leída con su texto (PDFKit) y como imagen (`pdf2png`):
- **Papel del empleado:** 1 a 90 rentas con nombres cortos y 1 a 70 con nombres largos y rentas de dos renglones: **ninguna** hoja de más con menos de 3 rentas; la firma siempre entera con su rótulo y su nombre.
- **Papel de los dueños:** 1 a 60 pagadas con 0, 2 y 12 pendientes, y con descuento (pie de tres renglones) y 3 pendientes: ninguna firma sola; la última hoja siempre lleva al menos la sección «Queda pendiente» (tabla o «No queda nada pendiente») con la firma.
- **Teléfonos:** enteros en todos los PDF. Medido por DOM a 10 anchos (1100 → 150 px, en medio «impresión»): ningún teléfono en dos renglones, en los dos papeles (a 150 px sale por la derecha el correo, que no es un teléfono). También impreso a escala 1.3, 1.6 y 2.0.
- **Recorridos con clics reales** (pantalla real: área de dinero → registrar el pago → «Ver comprobante» → PDF): empleado con 44 rentas (el caso del informe anterior: ahora 3 hojas, la última con 3 rentas, total, forma y firma) y dueño con 26 rentas (2 hojas, la segunda con 6 rentas, total, forma, «Queda pendiente» y firma).
- **Pantalla** (en mi propia pestaña del panel, abierta por mí): el membrete, el total y la firma se ven igual que antes; el renglón de WhatsApp en uno solo.

## Lo que NO pude arreglar / lo que no hice

1. **Solo Chrome.** Todo lo medido es Chrome (el mismo motor del PDF que él imprime). `break-inside: avoid` en un cuerpo de tabla y `:has()` no los probé en Safari/Firefox; si no los entienden, el papel vuelve a salir como antes (nada peor).
2. **Costo de la solución:** al pasar el bloque final a la hoja siguiente queda un hueco al pie de la hoja de arriba (hasta ~80 mm). Es lo que se paga por no dejar la firma sola.
3. **Papel de los dueños, un caso límite sin cubrir:** si la tabla de *lo pendiente* es tan larga que ella misma continúa en otra hoja y el final cae justo en el borde, la cadena de `avoid` puede fallar como en el papel del empleado (el hallazgo 2 de arriba). Con 12 pendientes no apareció; no lo reestructuré porque habría movido la tabla `tfoot` que sus pruebas y su papel ya usan.
4. No tengo el barrido «antes» de los dueños con 2 y 12 pendientes: la corrida base se colgó y la cancelé. Sí tengo el de 0 pendientes.
5. No se probó contra Firebase de verdad (nunca me autentiqué contra el proyecto real).

## Arnés (para repetirlo)

Árbol servido por mí en el puerto **4747** (comprobado libre con `lsof` antes), falsos locales de los tres módulos de Firebase (import map inyectado al servir, `index.html` no se tocó), IndexedDB `bestprice-contratos` **v3** sembrada con los constructores reales,
Chrome sin cabeza propio con perfil propio (puertos de depuración 9355 a 9369) para los PDF; para la pantalla, una pestaña propia abierta por mí en el panel (el panel estaba cerrado, no navegué ninguna ajena). Contraseña del área = el texto inventado del arnés contra la autenticación FALSA.
Todo en `/private/tmp/claude-501/-Users-estebanurizar-Desktop-Programas-Claude/3da57dec-1425-4766-8c08-1bb0b2e9cede/scratchpad/papel/` (fuera del repositorio): `servidor.mjs`, `mapa.mjs` (barrido), `anchos.mjs`, `barrido.mjs`, `real-comision.mjs`, `real-dueno.mjs`, `sembrar/lib-papeles.js`, `pdf2png.swift`.
Al terminar cerré el servidor y los Chrome.
