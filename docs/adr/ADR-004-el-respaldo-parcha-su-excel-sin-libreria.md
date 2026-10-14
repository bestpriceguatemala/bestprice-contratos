# ADR-004: El respaldo parcha su Excel con el zip del navegador, sin librería

- **Status**: accepted
- **Date**: 2026-10-14
- **Deciders**: Esteban Urízar
- **Tags**: respaldo, dependencias, datos personales

## Context

§10 del diseño pide un botón que baje un archivo de Excel por año, armado sobre el
Excel actual del dueño como plantilla: sus diez hojas, sus colores y sus fórmulas, con
los datos reales en CLIENTES, VEHICULOS y CONTRATOS. El archivo tiene que *servir para
trabajar*: si el sistema no está disponible un martes, se renta con él esa tarde.

El sistema no trae dependencias ni paso de compilación (ADR-003 eligió el diálogo de
imprimir del navegador antes que una librería de PDF por las mismas razones que aplican
aquí). Un `.xlsx` es un zip de XML, así que la pregunta no era «¿hace falta una librería?»
sino «¿qué hace el código que se envía en el instante del clic, y cuánto cuesta?».

Dos hechos acotaron la decisión:

1. Los navegadores de hoy traen `CompressionStream` y `DecompressionStream` con
   `deflate-raw` (Chrome y Edge 103, Safari 16.4, Firefox 113; Node 18 también, donde corren
   las pruebas). Abrir y volver a armar un zip no necesita nada de afuera.
2. **El repositorio es público.** El Excel de trabajo del dueño trae datos de personas de
   verdad, no solo en las celdas sino en la tabla de textos compartidos y en los valores en
   caché de las fórmulas. La plantilla que viaja con el sistema no puede ser ese archivo.

## Options

| Opción | Conserva sus colores, fórmulas, validaciones y protección | Costo |
|---|---|---|
| **A. Parchar su plantilla en XML con zip nativo** | Sí: lo que no se toca son los mismos bytes | ~700 líneas propias; la plantilla viaja en el repositorio (~0.7 MB, depurada); si él cambia el diseño de su Excel hay que re-depurarla y ajustar el mapa |
| B. Una librería de CDN para el zip (JSZip) | Igual que A | Ahorra ~120 líneas de zip y trae una dependencia que puede caerse el día del respaldo o cambiar de licencia |
| B'. Una librería que lee y reescribe el libro (ExcelJS, SheetJS) | No garantizado: SheetJS de comunidad no escribe estilos; ExcelJS reserializa todo y no hay forma de comprobar que no perdió nada | 1–2 MB desde un CDN; leer una hoja de 3 MB con 19 mil fórmulas pesa |
| C. Un libro nuevo desde cero | No: sin fórmulas ni colores | Poco código; no sirve para rentar esa tarde |
| D. CSV | No | Mínimo; no es un respaldo |
| E. Variante de A: él escoge su Excel al bajar | Igual que A | El repositorio no lleva plantilla, pero es un paso manual más al año y el archivo que escoja trae todos sus datos viejos |

## Decision

**A.** Es la única que cumple §10 con una garantía que se puede comprobar, y ninguna
librería la cumple mejor. El código vive en `js/respaldo/`:

- `zip.js`: leer y escribir el zip con los flujos del navegador y CRC-32 propio; se niega
  ante una parte dañada.
- `hojas.js`: escribir celdas dentro del XML de una hoja. **No pisa una fórmula, no
  inventa una celda que la plantilla no trae y no escribe un número que Excel no abriría.**
- `diseno.js`: los encabezados de su Excel. Antes de escribir una celda se comprueban; si
  no calzan, el respaldo se niega.
- `mapa.js`: de cada campo de §7b a su columna. Lo que su hoja no tiene dónde guardar no se
  mete en la columna que más se le parece.

La plantilla (`plantilla/best-price.xlsx`) sale de su archivo con
`herramientas/preparar-plantilla.mjs`: sin datos de nadie, con cuatro celdas de CLIENTES
completadas con el estilo de su columna (en su archivo lo habían perdido) y **sin** el
recálculo completo al abrir.

### Por qué la plantilla NO pide «recalcular todo al abrir»

Se probó en Excel de verdad con una renta completa (2,000 clientes, 150 carros, 990
contratos). Con `fullCalcOnLoad="1"` el archivo tardó **186 s** en abrir la primera vez y **454 s** la
segunda (la máquina estaba ocupada); sin él, **19 s**. En un año chico, 9 s contra 1 s. Las fórmulas no traen valores guardados, así que Excel las
calcula al abrir de todos modos, y se comprobó celda por celda (8 contratos × 20 columnas y
los resúmenes de VEHICULOS, BUSCAR e INGRESO DE DATOS) que el resultado es idéntico con y sin la
bandera. Quitarla cambia el tiempo, no las cifras.

## Consequences

### Positive
- Cero dependencias nuevas; el respaldo se arma en el navegador en ~2 s para un año
  completo, sin enviar nada a ningún servidor.
- Sus colores, fórmulas, validaciones, protección y áreas de impresión son los suyos.
- Un archivo mal armado se niega antes de escribirse; no hay un modo de que el DPI caiga en
  la columna de la licencia sin que una prueba lo note.

### Negative
- Si el dueño cambia su Excel (una columna nueva), hay que re-depurar la plantilla y ajustar
  `diseno.js` y `mapa.js`. Los encabezados comprobados lo hacen fallar en voz alta, no en
  silencio.
- Su fórmula de SUBTOTAL no suma la hora tardía ni los «varios» de la devolución, y su
  TOTAL aplica un solo porcentaje de tarjeta. El respaldo **no corrige su fórmula**; avisa,
  contrato por contrato, qué cifra falta (§10).
- Excel abre en «Vista protegida» lo que baja de internet, y ahí las fórmulas se ven en
  blanco hasta «Habilitar edición». Se le dice en pantalla.

### Neutral
- El archivo lleva DPI, licencias y teléfonos de los clientes y lo que se le paga a cada
  dueño: la pantalla lo advierte donde se baja, y por eso cuelga de `#/dinero` (ADR-002).

## Links
- Diseño general §10 y §7b («Del respaldo»): `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`
- ADR-002 (el costo del dueño vive tras la contraseña) y ADR-003 (sin librerías para los PDF)
- Informe: `.superpowers/respaldo-excel-2026-10-12.md`
