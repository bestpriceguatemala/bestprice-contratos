# Respaldo en Excel (§10): informe, 12–15 oct 2026

**Estado: hecho y verificado bajando el archivo de verdad desde el navegador y abriéndolo en Excel.** Lo que queda abierto
está al final (§8) y es de decisión del dueño, no de código.

Commits (todos en `main`, con pathspecs explícitos): `534c033` (este informe, primera versión), `a2cf2be` (el armado del
archivo), `f098d45` (lectura de la nube y prueba del CRC; lo subió el coordinador), `bb1ee41` (la pantalla, el aviso, la
ruta), `40335c6` (lo que la hoja no suma se dice primero), `c6c6f97` (el aviso no sale en el papel membretado), `ee35e45`
(plantilla sin recálculo completo, §10, §7b, ADR-004), `f17ade3` (si cualquier lectura falla no se baja nada, y dice cuál),
`f28e1c2` (el botón de cada año ya no aplasta su texto), `5571722` (concordancia del mensaje).

Pruebas: **152 pruebas nuevas** en `pruebas/respaldo-*.test.mjs` (zip, hojas, plantilla, recordatorio, mapa/archivo, paridad con `resumen()`,
nube, pantalla), todas verdes, y un cambio de una línea en `pruebas/dinero.test.mjs` (las rutas del área de dinero pasan de ocho a nueve). La suite completa
corrió **2,020 de 2,020 verdes** en `f17ade3`; al cerrar, con el árbol de otros agentes a medias, corre **2,028, de las que 2 están rojas y son del agente de la
impresión del contrato** (`hoja-contrato`: trabajo suyo sin commitear en `js/nucleo/hojaContrato.js` y `js/pantallas/contratoImpreso.js`), no de este trabajo.
Cada prueba se comprobó rompiendo a propósito el código que cuida (mutaciones): las que sobrevivieron (el CRC de una parte sin comprimir) ganaron su prueba.
No toqué `version.txt` ni `js/version.js`.

## 1. Lo que se leyó antes de diseñar

**Su plantilla** (`Contratos Best Price Rent a Car.xlsx`; se trabajó sobre una copia, el original no se tocó): diez hojas, todas
protegidas **sin contraseña**; 19,059 fórmulas solo en CONTRATOS y ~10,000 en CLIENTES.

| Hoja | Qué es | Dato o fórmula |
|---|---|---|
| CLIENTES | 2,000 filas (3–2002), datos en B–X; AF–AI auxiliares del buscador | A es `=A3+1`; AF–AI fórmulas |
| VEHICULOS | 200 filas (3–202), A–H | A es `=A3+1` |
| CONTRATOS | 1,000 filas (6–1005), A–CA; la fila 5 son fórmulas que leen INGRESO DE DATOS | A–BD valores pegados; BE, BF, BI–BL, BN, BP–BQ, BT–BW fórmulas; BG, BH, BM, BO, BR, BS, BX–CA «al regresar» |
| INGRESO DE DATOS | el formulario con que se renta | entradas y fórmulas |
| BUSCAR, CIERRE, IMP. CONTRATO, IMP. CIERRE DE CONTRATO, FICHA CLIENTE, FICHA VEHICULO | solo leen de las tres de arriba | fórmulas |

Cómo se renta con ese archivo (lo dice su propia hoja): se llena INGRESO DE DATOS, se copia `A5:BD5` de CONTRATOS y se **pega como
valores** en la primera fila vacía (`COUNT(A6:A1005)+6`). Por eso las filas del respaldo son **contiguas desde la 6** y `A` es un número.

**El repositorio es público** (`bestpriceguatemala/bestprice-contratos`, `private: false`, confirmado con la API pública de GitHub
sin credenciales). Su Excel trae datos personales de verdad, no solo en las celdas sino en la tabla de textos compartidos (donde
Excel guarda un texto aunque la celda se borre) y en los valores en caché de las fórmulas. **La plantilla no puede subirse tal cual**:
se prepara con `herramientas/preparar-plantilla.mjs` (ver §3).

## 2. Las opciones, con su costo (lo que se pidió traer antes de comprometerse)

La pregunta no era «¿necesita una librería?», sino «¿qué hace el código que se envía en el instante del clic, y cuánto cuesta?».
`CompressionStream` / `DecompressionStream` con `deflate-raw` vienen en el navegador (Chrome y Edge 103, Safari 16.4, Firefox 113; Node 18+):
abrir y volver a armar un zip no necesita nada de afuera. Medido con su plantilla: 17 ms para descomprimir la hoja de 3 MB, 16 ms para comprimirla.

| Opción | Conserva sus colores, fórmulas, validaciones y protección | Costo | Riesgo |
|---|---|---|---|
| **A. Parchar su plantilla con código propio** (zip nativo + reemplazo de celdas en el XML) **— lo hecho** | **Sí**: lo que no se toca son los mismos bytes | ~1,800 líneas con pantalla y herramienta; la plantilla viaja en el repositorio (~0.7 MB, depurada) | Si cambia el diseño de su Excel hay que re-depurar la plantilla y ajustar el mapa; los encabezados se comprueban y el respaldo se niega en voz alta |
| B. Librería de CDN para el zip (JSZip) | Igual que A | Ahorra ~120 líneas; el parche, el mapa y la pantalla se escriben igual | Una dependencia que puede caerse el día del respaldo o cambiar de licencia (la razón de ADR-003) |
| B'. Librería que lee y reescribe el libro (ExcelJS, SheetJS) | **No garantizado**: SheetJS de comunidad no escribe estilos; ExcelJS reserializa todo y no hay forma de comprobar que no perdió algo | 1–2 MB desde un CDN; una hoja de 3 MB con 19 mil fórmulas pesa | Cambia lo que él no pidió cambiar, sin avisar |
| C. Libro nuevo desde cero | **No**: sin fórmulas ni colores | Poco código | No sirve para rentar esa tarde: incumple §10 |
| D. CSV | **No** | Mínimo | Es el «CSV que se llama respaldo» |
| E. Él escoge su Excel al bajar (variante de A) | Igual que A | El repositorio no lleva plantilla, pero es un paso manual más al año y el archivo que escoja trae todos sus datos viejos | Si escoge otro, solo lo atajan los encabezados |

**Se hizo A**, por esto y no por lo fácil de construir (lo más fácil era D): es la única que cumple la frase de §10 con una garantía comprobable, y
ninguna librería la cumple mejor. Lo que cambiaría la decisión: que él prefiera E (nada suyo en el repositorio público a cambio de un paso manual al año).
Decisión escrita en `docs/adr/ADR-004-el-respaldo-parcha-su-excel-sin-libreria.md`.

### Las cuatro decisiones que se llevaron al coordinador, y cómo se resolvieron
1. **¿Pide la segunda contraseña?** Sí: `#/dinero/respaldo`, detrás de `conPuertaDeDinero`. El archivo lleva el costo por día de cada dueño y si cada renta ya se
   le pagó; sin eso la utilidad saldría falsa (costo en cero). ADR-002. (La alternativa, sin contraseña y con costos vacíos, se descartó.)
2. **¿Qué clientes?** Todos (su hoja es la base para rentar esa tarde); solo los contratos son por año. Con más de 2,000 se arma igual: entran primero los clientes de
   las rentas del año y se avisa en pantalla cuántos no cupieron.
3. **El hueco entre «un archivo por año» y «recuérdalo al año».** El archivo de 2026 bajado en octubre no lleva noviembre ni diciembre y el de 2027 empieza en enero:
   esas semanas no vivirían en ningún archivo. Cerrado guardando la fecha de cada año bajado (`ajustes/respaldo`); un año solo está completo si se bajó después de
   terminar; la pantalla ofrece el año en curso y, solo si hay algo que hacer, el anterior. El aviso sigue siendo a los 365 días (§10). **No hace falta ninguna regla
   nueva de Firestore**: `firestore.rules` ya tiene `match /ajustes/{id}` con lectura y escritura de sesión (releído antes de guardar nada).
4. **Su fórmula no suma la hora tardía ni los «varios» de la devolución.** No se tocó su plantilla. Se le contó al dueño (con el ejemplo Q1,400 contra Q1,600) y
   **no quiso decidirlo todavía**. Queda como está: la cifra en su columna y el comentario diciendo lo que falta (ver §5).

## 3. Cómo funciona (código en `js/respaldo/`, sin dependencias)

- `zip.js`: zip con los flujos del navegador y CRC-32 propio; se niega ante una parte dañada (comprobado con un byte cambiado en una parte comprimida y en una sin comprimir).
- `hojas.js`: escribe celdas dentro del XML. **No pisa una fórmula, no inventa una celda que la plantilla no trae, no escribe un número que Excel no abriría.** Un texto que empieza con «=» queda como texto.
- `diseno.js`: sus encabezados. **Antes de escribir una celda se comprueban**; si el diseño cambió, el respaldo se niega («pondría el DPI en la columna de la licencia»).
- `mapa.js`: de cada campo de §7b a su columna. Los totales **no se escriben**: son sus fórmulas.
- `nube.js`: todo se lee de la **nube**, nunca de la copia de la computadora. La fecha del respaldo vive en `ajustes/respaldo` (nube, no navegador: es un hecho del negocio; bajarlo en otra computadora debe callar el aviso en todas).
- `pantallas/respaldo.js` + `css/respaldo.css`: la pantalla y el aviso de arriba. `nucleo/respaldo.js`: cuándo se recuerda y qué años faltan (sin leer el reloj: `hoy` llega de fuera).
- `herramientas/preparar-plantilla.mjs` → `plantilla/best-price.xlsx`: su Excel **sin datos de nadie** (celdas, textos compartidos, valores en caché, hipervínculo, autor) y con todo lo demás (las 10 hojas, 19,059 + 9,999 + … fórmulas, validaciones, formatos condicionales, protección, logo, áreas de impresión).
  Una prueba exige que la herramienta reproduzca la plantilla **byte por byte**.

Hallazgos de esa preparación: faltaban cuatro celdas de CLIENTES en su archivo (`I27`, `G545`, `D605`, `N1345`: el estilo de la celda se había perdido); se completaron con el estilo de su columna.
El formulario INGRESO DE DATOS sale en blanco salvo las tarifas fijas del negocio (C24, C25, C26, C37).

## 4. Verificado de verdad

**En Excel (Microsoft Excel 16.113, abriendo el archivo que armó el navegador):** las diez hojas están; el archivo abre sin pedir «reparar»; las fórmulas calculan (G3 dice «Contratos: 8 | Cobrado: 23,043.00 | Utilidad: 20,643.00 | Debes a dueños: 1,200.00»,
BUSCAR dice «4 cliente(s)», «Pega en la FILA 14», el siguiente número es 109); y **se rentó un carro con él**: se llenó INGRESO DE DATOS (cliente 4, carro 2, fecha, días, precio) y salió el contrato 109 en la fila 5 con el cliente y el carro buscados por código.
CIERRE del contrato 102 reproduce el desglose del sistema (renta 2,800; atraso 700; seguros 350; daños 200; carta poder 350; combustible 80; varios 75; descuento 100; **4,455.00**).

| Contrato | Hoja (TOTAL COBRADO) | Sistema | |
|---|---|---|---|
| 101 rentado al día | 3,500.00 | 3,500.00 | igual |
| 102 con de todo | 4,455.00 | 4,455.00 | igual |
| 103 pagó con tarjeta (12 %) | 2,688.00 | 2,688.00 | igual |
| 104 / 105 carro ajeno | 3,600.00; costo 1,200; utilidad 2,400 | 3,600; 1,200; 2,400 | igual |
| 108 devuelto con saldo | 2,400.00 | 2,400.00 (saldo 300 en COMENTARIOS) | igual |
| **106** hora tardía + varios | **1,400.00** | **1,600.00** | **faltan Q200; lo dice el COMENTARIO** |
| **107** efectivo + tarjeta | **1,400.00** | **1,420.00** | **faltan Q20 de recargo; lo dice el COMENTARIO** |

Una prueba (`respaldo-paridad`) repite esto sin Excel: evalúa las fórmulas de su hoja (fijadas por su texto) sobre lo escrito y las compara con `resumen()`; falla si un dato cae en la columna equivocada.

**En el navegador (arnés propio, puerto 4617, comprobado libre antes de arrancar y cerrado al terminar; sirve un `git archive` de un commit exacto; Firebase falso con import map, cero llamadas de red; IndexedDB `bestprice-contratos` **versión 3** sembrada con los constructores reales; claves de prueba inventadas contra una autenticación falsa; no se tocó el proyecto real):**
- Entrar → aparece el aviso «Todavía no has bajado ningún respaldo» → clic en «Bajar el respaldo» → la contraseña de dinero → la pantalla, con la advertencia de privacidad **arriba del botón**.
- Clic real en «Bajar Best Price 2026.xlsx»: 684 KB, `unzip -t` limpio; lee `privado/dinero` y `pagosDueno` con la base de **dinero**, clientes y carros con la del mostrador, y anota la fecha **después** de entregar.
- **Cada lectura caída, con el clic de verdad en el botón de verdad:** clientes; carros; contratos (con la copia local sembrada de relleno: no se usa); pagos a dueños; el costo de un dueño (`privado/dinero`); la plantilla (404); y clientes+carros juntos. En las siete: **no se baja nada** (cero archivos), **no se anota nada** en `ajustes/respaldo`, el botón queda listo, y el mensaje dice **cuál** falló y cómo reintentar. Ejemplo: «No se bajó nada: no se pudieron leer los clientes y los carros de la flota de la nube, y sin eso el archivo quedaría incompleto aunque pareciera completo. Revisa tu internet y vuelve a apretar el botón; si sigue igual, recarga la página.» Después de restaurar la nube, el mismo botón baja el archivo (un solo archivo en total).
- El aviso al entrar en el borde: con el último respaldo de hace **364 días no sale**; de hace **365 sale** y dice «el último fue el 15 oct 2025».
- **Mirándolo se encontró un defecto que ninguna prueba de texto veía**: el `.btn` global es de ancho completo y aplastaba el texto del año a una columna de 50 px. Corregido (`f28e1c2`) con una prueba que fija la regla con sus declaraciones.
- Un año completo en el borde de lo que cabe (2,000 clientes, 150 carros, 990 contratos): el navegador lo arma en **2.1 s**, 788 KB, 30 MB de memoria; Excel lo abre y calcula («Pega en la FILA 996», 2000 clientes).

## 5. Lo que el archivo no puede decir igual que el sistema (y cómo se dice)

Su fórmula de SUBTOTAL suma renta, atraso, seguros, daños, carta poder, combustible y varios **de la salida**, y su TOTAL aplica **un solo** porcentaje de tarjeta. Por eso el total de la hoja sale **menor** que el del sistema en tres casos:
la **hora tardía** (su hoja la anota en HORA TARDIA pero no la suma), los **«varios» de la devolución** (no tienen columna) y el **recargo de tarjeta** cuando se pagó con más de una forma (su hoja no puede repartirlo). Es el mismo hueco que el dueño encontró el 6 de octubre en su Excel.
**No se tocó su fórmula.** Lo que se hizo para que sea imposible no verlo:
- el COMENTARIO del contrato **abre** con «OJO: el total de esta hoja sale Q200.00 menos que el del sistema (Q1,600.00): la hoja anota la hora tardía (Q150.00) pero no la suma; los varios de la devolución (Q50.00, Llave perdida) no tienen dónde sumarse». Se comprobó en su hoja CIERRE, **al lado de «TOTAL A COBRAR»**;
- al bajar el archivo, la pantalla lista cada contrato así con lo que le falta («106 (faltan Q200.00), 107 (faltan Q20.00)»), arriba de los demás avisos, y la lista de «lo que este archivo NO lleva» lo advierte antes de bajarlo;
- un contrato que cuadra **no** lleva el «OJO» (una prueba lo exige).
Si él decide arreglar su plantilla, es un cambio a **una** fórmula suya (`BQ` para sumar `AH` y una celda para los varios): hay una prueba que fija el texto de las fórmulas de las que depende el mapa, y fallará para obligar a revisar las notas.

## 6. Columnas y campos que no se pudieron mapear (para no adivinar)

**Columnas de su Excel sin campo en §7b (quedan vacías):** CONTRATOS `W` PERSONA O EMPRESA, `X` NIT, `Y` y `Z` T. CIRCULACION (original, auténtica), `AI` SEMANA, `AJ` MES, `AK` COMBUSTIBLE X GALON. CLIENTES: `C` y `E` (2do apellido y 2do nombre: el sistema guarda `apellidos` y `nombres` enteros y **no se adivina dónde cortar**; van enteros en `B` y `D`), `P` (oculta, sin encabezado), `Y` FACTURAR A (no hay celda en sus filas de datos; el sistema quitó `facturarA` el 3 de octubre) y `Z`–`AD` (sin encabezado).
**Mapeadas por parecido de nombre, a confirmar con él:** `AF` HORA ENTRADA ← `cierre.horaReal` y `AG` LUGAR ENTRADA ← `cierre.lugarEntrada` (su hoja las pega al salir; las del sistema son las de la devolución). `AH` HORA TARDIA ← suma de `horaTardiaDe` (al salir + al recibir).
**Campos del sistema sin columna en su hoja:** `porcentajeComision`; `garantiaLiberada` y `garantiaLiberadaEn` (si la garantía sigue sin soltar, COMENTARIOS lo dice); `cierre.varios` y `cierre.variosDetalle` (COMENTARIOS); `cierre.danosDetalle` (COMENTARIOS); el detalle de cada pago (COMENTARIOS cuando fueron varios); la tercera tarjeta en adelante (COMENTARIOS; su hoja tiene dos); `fueraDeServicio` y `motivoFueraDeServicio` del carro; `licenciaEmision` (una fecha; LUGAR EMISION es `licenciaEmitidaEn`).
**Colecciones que el archivo no lleva (su Excel no tiene hoja para ellas):** reservaciones y calendario, empleados y comisiones, pagos a dueños uno por uno, fichas de dueños (teléfono, NIT, nota). La pantalla se lo dice antes de bajar.
**Cosmético:** CONTRATOS `C` sale «APELLIDOS NOMBRES» (como lo arma su fila 5), y no «NOMBRES APELLIDOS» como se lee en el papel; se arma del cliente y, si el cliente ya no existe, queda el nombre del contrato.

## 7. Descubrimientos que conviene recordar

- **`fullCalcOnLoad` cuesta minutos.** La primera versión de la plantilla pedía recálculo completo al abrir. En Excel de verdad, con una renta llena abrir tardó **186 s** (y **454 s** otra vez, con la máquina ocupada) contra **19 s** sin la bandera; en un año chico, 9 s contra 1 s. Las cifras son **idénticas celda por celda** (8 contratos × 20 columnas y los resúmenes de VEHICULOS, BUSCAR e INGRESO). La plantilla ya no la pide (`ee35e45`, con prueba y explicación en ADR-004). Las fórmulas no traen valor guardado, así que Excel las calcula al abrir igual.
- **Vista protegida.** Excel abre lo que baja de internet en Vista protegida y ahí no calcula: las fórmulas se ven en blanco hasta «Habilitar edición». Se lo digo en pantalla y en el «Listo». **No lo pude ver con mis ojos**: el vocabulario de AppleScript de este Excel no controla la Vista protegida, y un archivo con la marca de cuarentena que abrí así quedó como un libro normal. Lo que sostengo se desprende de que las fórmulas no traen valor guardado y de cómo Excel documenta la Vista protegida; no lo he observado.
- **Excel se reinició durante mis pruebas.** Mi sesión de pruebas con AppleScript abrió y cerró **solo libros míos** (por nombre). En un momento el proceso de Excel cambió (PID nuevo) y `grid-imp.xlsx`, el libro que tenía abierto el agente de la impresión, ya no estaba. No sé si fue por mis pruebas (abrí un archivo grande que tardó minutos en abrir y varias llamadas se cortaron por tiempo) o si alguien cerró Excel. Es un archivo generado que se puede volver a abrir, pero lo digo para que quien lo usaba lo sepa.
- **Las pruebas de texto no ven el dibujo.** El botón aplastado solo se vio abriendo la pantalla; ahora hay una prueba, pero la lección es que el clic real y una captura valen.
- **El aviso no debía imprimirse.** El agente de la impresión notó que el aviso de arriba salía impreso sobre el papel membretado cuando la hoja del contrato no lograba armarse. Ahora lleva `no-imprimir` y una prueba exige la regla de impresión con sus declaraciones (`display: none !important` dentro de `@media print`).

## 8. Lo que queda abierto

1. **Su fórmula (decisión suya):** `BQ` no suma `AH` ni hay dónde sumar los «varios» de la devolución, y `BT` aplica un solo porcentaje de tarjeta. No quiso decidirlo; el archivo avisa contrato por contrato. Mientras tanto, la hora tardía y los varios se pierden en su Excel igual que el 6 de octubre.
2. **El primer inicio de sesión tras publicar saldrá el aviso** («Todavía no has bajado ningún respaldo»): es lo correcto, no hay ninguno. Se puede cerrar con «Ahora no» (vale hasta recargar la página).
3. **Si él cambia su Excel** (una columna nueva, una hoja nueva): `node herramientas/preparar-plantilla.mjs "<su Excel>.xlsx" plantilla/best-price.xlsx`, y ajustar `js/respaldo/diseno.js` y `mapa.js`. Los encabezados comprobados hacen que falle en voz alta, no en silencio.
4. **Más de 1,000 contratos en un año** (el tope de su hoja): el respaldo **no se arma** y lo dice. Si el negocio llega ahí, hay que decidir cómo partir el año (otro archivo por semestre, o ampliar las filas de su plantilla).
5. **Navegadores:** probado en el navegador de la app (Chromium). Safari 16.4+ y Firefox 113+ traen los mismos flujos de compresión según su documentación, pero **no los probé**; sin ellos la pantalla dice, en español, que se abra con Chrome, Edge o Safari actualizados.
6. **Versión:** no se subió (`version.txt` y `js/version.js` los mueve el coordinador).
7. **Escritura en `ajustes/respaldo`:** la regla actual de `ajustes` ya lo permite; si algún día `ajustes` se cierra, el respaldo deja de poder anotar su fecha (se dice «el archivo se bajó, pero no se pudo anotar»; el aviso volvería a salir).
