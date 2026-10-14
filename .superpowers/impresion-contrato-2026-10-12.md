# Impresión del contrato sobre el papel preimpreso — informe final (14 de octubre de 2026)

**Estado: construido, probado y verificado imprimiendo a PDF en un Chrome real. Falta lo único que solo el dueño puede hacer: imprimir la hoja de prueba en
su impresora y calibrar.** Hasta entonces, la escala 0.77 es una hipótesis (muy probable: ver «Lo que se encontró»).

## Commits (explícitos, sin `git add -A`)

| sha | qué |
|---|---|
| `fc09f2a`, `b49af23` | este informe, en curso (hallazgos y cómo se midió) |
| `fb81c4f`, `1bcedb8` | (los hizo el coordinador con mi trabajo del primer corte) la tabla `CAMPOS` medida, la calibración, la pantalla, el CSS, `analisis/imp-contrato/`, las rutas en `app.js`, el `<link>` en `index.html` y el botón «Imprimir contrato» |
| `c707c4f` | las pruebas de lo puro y de la pantalla, y cuatro huecos que esas pruebas encontraron |
| `a5e0740` | las cuatro respuestas del dueño pasan a la tabla, cada una con su razón escrita |
| `e3dee27` | la hoja de prueba: cuatro casillas con número, los pasos en palabras, marcas que no dependen de «Gráficos de fondo» |
| `411224b` | aviso cuando una casilla se saldría de la carta (calibrar e imprimir) |
| `424a5b6` | el texto de arriba y el del medio bajan medio milímetro (medido contra Excel) |
| `7662971` | §8b del diseño, con lo que decidió el dueño y la fecha |
| `6a3802b` | pantalla de imprimir: cajas con su nombre, la tarjeta enmascarada es una nota y no una alarma roja |
| `7a8eb08` | la primera versión de este informe |
| `e7ef495`, `2c6d6ba` | las respuestas del 14 de octubre sobre la hora de entrada, la Q, el combustible y la autorización de la tarjeta 1 (casilla derivada), y su marca en la hoja de prueba |
| `f48ac20`, `85eaf3a` | §8b: esas respuestas, el número de contrato preimpreso y lo que se mira el día de la calibración |

**Pruebas:** el árbol completo está verde, **2006 pruebas, 0 fallan** (el basal que se me dio era 1475; subió porque los otros dos agentes también agregaron). Las mías son
**154**: `pruebas/hoja-contrato.test.mjs` (66) y `pruebas/contrato-impreso.test.mjs` (88). Se mutaron `hojaContrato.js` (≈70 mutaciones), `contratoImpreso.js`
(≈115) y el CSS (13): sobreviven solo 5, todas equivalentes (un `>=` contra `>` sobre un flotante exacto, una copia defensiva de un objeto que ya sale nuevo de `JSON.parse`,
un `>= 0` cuando `monto(0)` ya devuelve vacío, un título que se calcula antes de teclear, y un `null` contra `''` que `filter(Boolean)` borra).

## Qué cubren las pruebas y qué solo se ve mirando

- **Cubierto por pruebas:** la cuadrícula contra lo que Excel imprimió (`cuadricula.json` con sus líneas crudas); cada campo contra los recortes de texto que Excel dejó en su PDF
  (60 casillas, tolerancia 0.05 mm); `cajaDeRango` (celda, rango, columna/fila oculta, al revés, inexistente); las fechas del papel (sin `Date`, probado); la calibración
  (teclas, límites, un solo `transform`, almacén que lanza / con basura / vacío); `armarContratoImpreso` (de dónde sale cada casilla, ajeno, sin cliente, sin dato, dinero con `q()` y `dinero()`);
  el HTML escapado; la hoja de prueba; la pantalla con un DOM de mentira; la hoja de estilos **como texto**; y ADR-001 de punta a punta contra espías.
- **Solo por mirar (hecho, ver abajo):** que Chrome respete la página sin margen y la carta; que el `transform` del navegador sea la misma cuenta que `cajaEnPapel`; que las marcas salgan sin «Gráficos de fondo»;
  que el texto caiga donde lo pone Excel. **Y lo que nadie más que él puede ver: que el papel calce con su formulario.**

## Verificado imprimiendo de verdad

Arnés propio (carpeta de trabajo, no el de otro agente): servidor en el puerto **4437** (comprobé con `lsof` que estaba libre y que quedó cerrado), sirve `git archive` de un commit exacto
(se registra cuál), las tres URL de Firebase cambiadas por falsos locales con un import map (no hacen red; **el falso de Firestore apunta toda escritura**), IndexedDB `bestprice-contratos`
**versión 3** sembrada con las mismas funciones que arman contratos de verdad (`construirContrato`, `contratoParaGuardar`, `construirCliente`), `#entrada` escondida y `#app` a la vista. Nadie dio credenciales ni se
tocó el proyecto real. Chrome headless propio, `Emulation.setEmulatedMedia('print')` y `Page.printToPDF` en Carta, sin «Gráficos de fondo» (como lo deja el diálogo de Chrome).

- **Una sola hoja, Carta, sin margen** en los tres contratos (propio con dos tarjetas, ajeno, en efectivo) y con lo tecleado. La caja de cada campo medida en el navegador contra lo que dice la tabla: **0.00 mm de diferencia**
  en las 52 a 67 casillas de cada uno (el `transform` del navegador es exactamente `cajaEnPapel`).
- **Ninguna casilla se sale de la carta** (el texto más a la derecha llega a 209.9 mm de 215.9; el más abajo a 194 de 279.4) y **ningún texto pisa a otro**, incluidos los diez rótulos nuevos y los nueve de letra blanca,
  que salen visibles y en su casilla. Lo único que se sale de su casilla son los dos «EXPIRA:», que Excel también deja salirse hacia una celda vacía.
- **Contra el PDF de Excel**, con la dirección de cada celda como texto en los dos lados: el inicio del texto, 0.10 mm de media; la línea base, **0.02 mm de media y 0.42 mm la peor** (después de bajar medio milímetro
  el texto de arriba y el del medio: antes salía 0.47 y 0.24 mm más arriba). Los tamaños de letra coinciden en las 60.
- **La hoja de prueba**, rasterizada a 300 dpi y medida: la marca de 100 mm cae a 100.08 mm (la raya misma mide 0.15 mm), las 44 marcas de arriba y las 56 de la izquierda están, el marco y las cruces caen a 0.1 mm de lo esperado, los pasos
  (de 246 a 268 mm) quedan dentro de lo que imprime cualquier impresora. Corrida con las flechas de verdad (+1.5 mm, +1 mm, 0.80): el marco queda a 19.40 / 19.52 mm y mide 200.19 × 188.13 mm, y la pantalla dice
  «2 casillas se salen de la carta: Hora de salida, Hora de entrada».
- **Un contrato sin cliente se niega** con «No se encontró al cliente del contrato N.° 80: sin sus datos el papel saldría sin nombre ni documento», sin hoja y sin botón de imprimir.
- **ADR-001 en el navegador:** tecleé número, CBC, NIT y empresa; en el momento de llamar a imprimir la hoja los llevaba (y el título era «Contrato 77», sin nada de la tarjeta); al terminar (`afterprint`) las cajas quedaron vacías, el lugar y
  las tarifas de vuelta a como estaban y la hoja enmascarada. Busqué el número, el CBC, el NIT y la empresa en `localStorage`, `sessionStorage`, la dirección, el título, el historial, las seis tiendas de IndexedDB, las escrituras del Firestore falso (0), los recursos
  cargados, las peticiones de red y la consola: **no aparecen en ninguna.**
- **La escala importa:** a tamaño de Excel (1.0) quince casillas caen fuera de la carta; a 0.80, las dos columnas de horas. Hasta 0.79 todo cabe. Por eso la pantalla de calibrar y la de imprimir lo avisan.

## Lo que se encontró en el Excel (hoja «IMP. CONTRATO»)

1. **La hoja no cabe en una carta con la configuración que trae guardada.** Medida con el propio Excel (una copia del libro, con borde fino a A1:Z60, exportada a PDF; de ahí salen las líneas exactas): a 89 % mide **250.2 × 235.2 mm** y
   la carta deja 193 mm de ancho entre sus márgenes (18 mm a la izquierda, 5 a la derecha). Excel la parte en dos hojas (A–V y W–Z). El dueño dijo: «Así como está en la hoja de Excel, así la imprimo y casi siempre sale bien»: su impresora (o el diálogo)
   la encoge. 193 / 250.2 = 0.771: `ESCALA_QUE_CABE`. Es la hipótesis más probable, no una prueba; la calibración la confirma o la corrige.
2. La hoja no tiene bordes ni líneas ni imágenes: solo texto, hecha para caer sobre un formulario preimpreso. Los textos fijos que trae (rótulos) el dueño dijo que **el papel no los trae**: los imprime el sistema.
3. **Once celdas con letra blanca** (no catorce): nueve tienen fuente en el sistema y se imprimen ahora por decisión suya; **E27** (ciudad adicional: el 3 de octubre dijo que la segunda dirección no se imprime) e **I27** (un `0` fijo) no se agregaron.
4. **Excel no imprime el número de contrato** en ningún lado (ninguna celda lee `INGRESO!F1`): viene preimpreso en su papelería, como él lo dijo.
5. La hora de entrada que imprime Excel es la hora de **salida** (las dos casillas leen la misma celda). Se replicó, y él dijo «Igual que el Excel».
6. Excel no imprime la autorización de la tarjeta 1 (su casilla, M29:P31, queda vacía; ahora se imprime, derivada) ni el banco de la tarjeta 2.
7. El archivo guarda anchos en «caracteres» y alturas en puntos y Excel los redondea al imprimir (cada fila imprime una unidad menos): por eso se **midió** con Excel y no se calculó desde el archivo.

## Cómo se manejó el CBC (ADR-001), exactamente

El número completo y el CBC **solo existen en dos cajas de la pantalla de imprimir**. Viajan como el argumento `tarjetasEfimeras` de `armarContratoImpreso`, que **no los copia al contrato ni a ningún objeto que se parezca a uno** (las pruebas congelan el contrato,
el cliente y el carro y arman la hoja: no lanza y no cambia), hasta el HTML de la hoja. Se borran al terminar el diálogo de imprimir (`afterprint`, imprima o cancele) y al salir de la pantalla; la hoja se vuelve a dibujar enmascarada (`•••• 3343`). Ningún
módulo de `datos.js` se llama desde el flujo de imprimir. La pantalla dice en voz alta que **no se guarde esa hoja como PDF**, y el título del documento solo lleva «Contrato 77». Lo mismo se hizo con a quién se factura.
**Lo que NO hice:** `sacarCarro.js` es de otro agente y sigue sin leer el CBC (lo teclea y lo descarta); por eso al imprimir se vuelve a teclear. Pasarlo desde «Sacar carro» pide una variable en memoria con el contrato y las dos cajas, y un cambio en ese archivo.

## La tabla de campos (71; posiciones medidas, en mm desde la esquina de arriba a la izquierda de la hoja, a tamaño de Excel; la segunda columna de posición es en la carta con el ajuste de fábrica 0.77)

**Hay un solo campo que NO sale de una medición: `Tarjeta 1: autorización` (M29:P31) es DERIVADO, no medido.** Excel nunca imprimió nada ahí. Su rectángulo es la celda combinada vacía de Excel (la posición sí está en la cuadrícula medida) y su alineación es la que el autor le dejó (centrada); la fuente y el tamaño (Arial 10) son los de la autorización de la tarjeta 2, que sí está medida. La hoja de prueba la dibuja con raya de trazos y la nombra «DERIVADA, no medida». (Se puso en la celda combinada de Excel y no en «el mismo ancho que la de la tarjeta 2» porque así queda pegada a su monto autorizado, como están las de la tarjeta 2; si él prefiere lo otro es cambiar el rango `M29:P31` por `M29:O31`.)

| Campo | Celda(s) | x / y / ancho × alto (mm, tamaño Excel) | x / y en la carta (0.77) | De dónde sale (§7b) | Estado |
|---|---|---|---|---|---|
| Código del cliente | J5:K5 | 75.7 / 18.8 / 39.3 × 4.7 | 76.2 / 33.0 | SIN FUENTE: se queda vacío |  |
| Tarjeta 1: número | D6:L7 | 26.7 / 23.6 / 94.5 × 7.2 | 38.5 / 36.7 | lo teclea en la pantalla de imprimir (ADR-001); en una reimpresión, `tarjetas[0].ultimos4` enmascarado |  |
| Tarjeta 1: vence | C8:D8 | 18.5 / 30.8 / 16.3 × 3.8 | 32.2 / 42.2 | `tarjetas[0].vencimiento` |  |
| Tarjeta 1: CBC | H8:I8 | 59.3 / 30.8 / 16.3 × 3.8 | 63.6 / 42.2 | lo teclea en la pantalla de imprimir (ADR-001); nunca se guarda | se teclea, no se guarda |
| Tarjeta 1: banco emisor | D9:L9 | 26.7 / 34.5 / 94.5 × 7.2 | 38.5 / 45.1 | `tarjetas[0].banco` |  |
| Tarjeta 2: número | A10:M10 | 0.0 / 41.8 / 121.2 × 4.4 | 17.9 / 50.7 | igual que la 1, con `tarjetas[1]` |  |
| Tarjeta 2: vence | C11:D11 | 18.5 / 46.1 / 16.3 × 2.8 | 32.2 / 54.1 | `tarjetas[1].vencimiento` |  |
| Tarjeta 2: CBC | H11:I11 | 59.3 / 46.1 / 16.3 × 2.8 | 63.6 / 54.1 | igual que el de la 1 | se teclea, no se guarda |
| Texto fijo: ACEPTO LOS CARGOS A MI TARJETA NUMERO | A4:L4 | 0.0 / 13.5 / 121.2 × 5.3 | 17.9 / 28.9 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: CODIGO | H5:I5 | 59.3 / 18.8 / 16.3 × 4.7 | 63.6 / 33.0 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: TARJETA 1 No: | A6:C7 | 0.0 / 23.6 / 26.7 × 7.2 | 17.9 / 36.7 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: EXPIRA: | A8 | 0.0 / 30.8 / 10.4 × 3.8 | 17.9 / 42.2 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: CODIGO CBC | E8:G8 | 34.9 / 30.8 / 24.5 × 3.8 | 44.7 / 42.2 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: BANCO EMISOR | A9:C9 | 0.0 / 34.5 / 26.7 × 7.2 | 17.9 / 45.1 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: EXPIRA: (tarjeta 2) | A11 | 0.0 / 46.1 / 10.4 × 2.8 | 17.9 / 54.1 | texto fijo de Excel (el papel no lo trae) |  |
| Texto fijo: CODIGO CBC (tarjeta 2) | E11:G11 | 34.9 / 46.1 / 24.5 × 2.8 | 44.7 / 54.1 | texto fijo de Excel (el papel no lo trae) |  |
| Tipo de vehículo | N4:Q5 | 121.2 / 13.5 / 33.9 × 10.1 | 111.2 / 28.9 | carro de la flota: `tipo`; ajeno: `carroAjeno.tipo` |  |
| Marca y línea | N6:Q7 | 121.2 / 23.6 / 33.9 × 7.2 | 111.2 / 36.7 | `carroDescripcion` (propio: marca y línea); ajeno: `carroAjeno.marca` |  |
| Placas | N8:Q9 | 121.2 / 30.8 / 33.9 × 11.0 | 111.2 / 42.2 | `carroPlacas` |  |
| Color | N10:Q10 | 121.2 / 41.8 / 33.9 × 4.4 | 111.2 / 50.7 | flota: `color`; ajeno: `carroAjeno.color` |  |
| Modelo | N11:Q12 | 121.2 / 46.1 / 33.9 × 5.7 | 111.2 / 54.1 | flota: `modelo`; ajeno: `carroAjeno.modelo` |  |
| Kilometraje de salida | O14:Q15 | 127.8 / 55.9 / 27.3 × 14.8 | 116.3 / 61.6 | `kmSalida` | blanca en Excel, ahora se ve |
| Combustible de salida | N23:O25 | 121.2 / 100.5 / 12.9 × 9.7 | 111.2 / 95.9 | `combustibleSalida` | **no se imprime**: lo escribe él |
| Lugar de entrada | T7:W8 | 166.4 / 27.3 / 30.8 × 7.2 | 146.0 / 39.6 | `lugar` (el de la salida), precargado en la pantalla de imprimir y corregible ahí; no se guarda aparte | precargado, corregible |
| Fecha de salida | X7:Y8 | 197.2 / 27.3 / 29.5 × 7.2 | 169.7 / 39.6 | `fechaSalida` |  |
| Hora de salida | Z7:Z8 | 226.7 / 27.3 / 23.6 × 7.2 | 192.5 / 39.6 | `horaSalida` |  |
| Lugar de salida | T9:V9 | 166.4 / 34.5 / 22.6 × 7.2 | 146.0 / 45.1 | `lugar` |  |
| Fecha de entrada | W9:Y9 | 189.0 / 34.5 / 37.7 × 7.2 | 163.4 / 45.1 | `devolucionPrevista` |  |
| Hora de entrada | Z9:Z10 | 226.7 / 34.5 / 23.6 × 11.6 | 192.5 / 45.1 | `horaSalida` | repite la salida (decisión suya) |
| Hora tardía (precio) | V10:X12 | 182.7 / 41.8 / 26.4 × 10.1 | 158.6 / 50.7 | `TARIFAS_DEL_PAPEL.horaTardia` (Q150, del INGRESO DE DATOS de su Excel), precargada y corregible al imprimir | precargado, corregible |
| NIT (persona o empresa) | A13:D14 | 0.0 / 51.8 / 34.9 × 12.9 | 17.9 / 58.4 | lo teclea en la pantalla de imprimir; no se guarda en ninguna parte | se teclea, no se guarda |
| Persona o empresa | E13:L14 | 34.9 / 51.8 / 86.3 × 12.9 | 44.7 / 58.4 | lo teclea en la pantalla de imprimir; no se guarda en ninguna parte | se teclea, no se guarda |
| Primer apellido | B15:H16 | 10.4 / 64.7 / 57.1 × 7.5 | 25.9 / 68.3 | `apellidos` completo (el sistema guarda los dos apellidos juntos) |  |
| Segundo apellido | B17:I17 | 10.4 / 72.2 / 65.3 × 5.7 | 25.9 / 74.1 | SIN FUENTE: Ver el primer apellido: no se separa solo. |  |
| Primer nombre | B19:H20 | 10.4 / 77.9 / 57.1 × 10.7 | 25.9 / 78.5 | `nombres` completo |  |
| Segundo nombre | B21:H22 | 10.4 / 88.5 / 57.1 × 11.9 | 25.9 / 86.7 | SIN FUENTE: Ver el primer nombre. |  |
| Nacionalidad | A23:E24 | 0.0 / 100.5 / 43.0 × 7.2 | 17.9 / 95.9 | `nacionalidad` del cliente (solo la traen los clientes viejos) |  |
| Fecha de nacimiento | F23:L24 | 43.0 / 100.5 / 78.2 × 7.2 | 51.0 / 95.9 | `fechaNacimiento` del cliente |  |
| Correo electrónico | A25:L26 | 0.0 / 107.7 / 121.2 × 5.0 | 17.9 / 101.4 | `correo` del cliente |  |
| Dirección de referencia | A31:L32 | 0.0 / 139.1 / 121.2 × 7.8 | 17.9 / 125.6 | `direccionReferencia` del cliente |  |
| Municipio | A33:D34 | 0.0 / 146.9 / 34.9 × 6.6 | 17.9 / 131.7 | `municipio` del cliente |  |
| GUATEMALA (texto fijo) | E33:H34 | 34.9 / 146.9 / 32.6 × 6.6 | 44.7 / 131.7 | texto fijo de Excel (el papel no lo trae) |  |
| Teléfono | I33:L34 | 67.5 / 146.9 / 53.7 × 6.6 | 69.9 / 131.7 | `telefono` del cliente |  |
| Cédula o pasaporte | A38:G39 | 0.0 / 167.3 / 59.3 × 6.6 | 17.9 / 147.4 | `documento` del cliente |  |
| Documento extendido en | H38:J39 | 59.3 / 167.3 / 24.5 × 6.6 | 63.6 / 147.4 | `documentoExtendidoEn` del cliente |  |
| Documento: fecha de expiración | K38:M39 | 83.8 / 167.3 / 37.4 × 6.6 | 82.4 / 147.4 | `documentoExpira` del cliente |  |
| Licencia de conducir | A41:G43 | 0.0 / 180.8 / 59.3 × 6.9 | 17.9 / 157.8 | `licencia` del cliente |  |
| Licencia: lugar de emisión | H41:J42 | 59.3 / 180.8 / 24.5 × 5.0 | 63.6 / 157.8 | `licenciaEmitidaEn` del cliente |  |
| Licencia: fecha de expiración | K41:M43 | 83.8 / 180.8 / 37.4 × 6.9 | 82.4 / 157.8 | `licenciaExpira` del cliente | blanca en Excel, ahora se ve |
| Conductor adicional: nombre | N35:R38 | 121.2 / 153.5 / 37.0 × 17.6 | 111.2 / 136.7 | `conductorAdicional.nombre` | blanca en Excel, ahora se ve |
| Conductor adicional: licencia | N39:R40 | 121.2 / 171.1 / 37.0 × 9.7 | 111.2 / 150.3 | `conductorAdicional.licencia` |  |
| Precio por día (sin seguros) | V13:X14 | 182.7 / 51.8 / 26.4 × 12.9 | 158.6 / 58.4 | `precioDia` menos `seguroDia` menos `seguroTercerosDia` |  |
| Seguro de terceros (por día) | V27:X27 | 182.7 / 112.7 / 26.4 × 10.1 | 158.6 / 105.3 | `seguroTercerosDia` |  |
| Seguro (por día) | V28:X28 | 182.7 / 122.8 / 26.4 × 8.5 | 158.6 / 113.0 | `seguroDia` |  |
| Combustible a (por galón) | V34:X35 | 182.7 / 150.7 / 26.4 × 7.5 | 158.6 / 134.6 | `TARIFAS_DEL_PAPEL.galon` (Q65, del INGRESO DE DATOS de su Excel), precargada y corregible al imprimir | precargado, corregible |
| Deducible | U36:X37 | 174.6 / 158.2 / 34.5 × 9.1 | 152.3 / 140.4 | `deducible` |  |
| « + iva » (texto fijo) | Y36:Y37 | 209.1 / 158.2 / 17.6 × 9.1 | 178.9 / 140.4 | texto fijo de Excel (el papel no lo trae) |  |
| Deducible (segunda vez, abajo) | O46:Q46 | 127.8 / 195.0 / 27.3 × 4.4 | 116.3 / 168.7 | `deducible` |  |
| Seguro (segunda vez, abajo) | O47:Q47 | 127.8 / 199.4 / 27.3 × 4.7 | 116.3 / 172.0 | `seguroDia` |  |
| Carta poder: destino | R21:V22 | 155.1 / 88.5 / 33.9 × 11.9 | 137.3 / 86.7 | `lineasSalida`: detalle de la línea «Carta poder» |  |
| Carta poder: precio | W21:X22 | 189.0 / 88.5 / 20.1 × 11.9 | 163.4 / 86.7 | `lineasSalida`: monto de la línea «Carta poder» |  |
| Deducible bajo | V23:X24 | 182.7 / 100.5 / 26.4 × 7.2 | 158.6 / 95.9 | `deducibleBajo` | blanca en Excel, ahora se ve |
| Seguro de menores (por día) | V25:X26 | 182.7 / 107.7 / 26.4 × 5.0 | 158.6 / 101.4 | `seguroMenoresDia` | blanca en Excel, ahora se ve |
| Seguro PAI (por día) | U30:X31 | 174.6 / 136.6 / 34.5 × 7.2 | 152.3 / 123.7 | `seguroPaiDia` | blanca en Excel, ahora se ve |
| Varios: descripción | V32:X32 | 182.7 / 143.8 / 26.4 × 3.1 | 158.6 / 129.2 | `variosDescripcion` | blanca en Excel, ahora se ve |
| Varios: precio | V33:X33 | 182.7 / 146.9 / 26.4 × 3.8 | 158.6 / 131.7 | `variosPrecio` | blanca en Excel, ahora se ve |
| Tarjeta 1: autorización | M29:P31 | 121.2 / 131.2 / 21.0 × 12.6 | 111.2 / 119.6 | `tarjetas[0].autorizacion` | **DERIVADA, NO MEDIDA** |
| Tarjeta 1: monto autorizado | Q29:T31 | 142.2 / 131.2 / 32.3 × 12.6 | 127.4 / 119.6 | `tarjetas[0].montoAutorizado` |  |
| Tarjeta 2: monto autorizado | P32:R33 | 134.1 / 143.8 / 24.2 × 6.9 | 121.1 / 129.2 | `tarjetas[1].montoAutorizado` |  |
| Tarjeta 2: autorización | M32:O33 | 121.2 / 143.8 / 12.9 × 6.9 | 111.2 / 129.2 | `tarjetas[1].autorizacion` | blanca en Excel, ahora se ve |
| Rentado por | T58:U59 | 166.4 / 220.7 / 16.3 × 10.7 | 146.0 / 188.5 | `rentadoPor` |  |

Todos con la fuente y el tamaño de Excel por 0.89 (Arial o Arial Narrow), la alineación de Excel y el origen de la hoja en la carta a 17.90 / 18.52 mm.

## Lo que hay que mirar con el papel enfrente el día de la calibración

Ese día él tiene la hoja de prueba en una mano y su formulario en la otra: puede contestar todo esto mirando.

1. **La calibración misma.** Imprimir la hoja de prueba (escala 100 %, márgenes «Ninguno», sin encabezados) y seguir los pasos que trae. Hasta entonces la escala 0.77 es una hipótesis. Si con flechas y +/− no calza, hace falta saber qué papel y qué escala usa hoy el diálogo de Excel.
2. **La casilla derivada** (autorización de la tarjeta 1, la de raya de trazos): ¿cae en su casilla del formulario? Es la única que no se midió.
3. **Apellidos y nombres:** ¿el papel tiene una casilla por apellido y una por nombre? El sistema los guarda en un solo texto, así que hoy el texto completo sale en la primera casilla y la segunda queda en blanco.
4. **E27 e I27**, las dos celdas de letra blanca de Excel que no se agregaron: ¿hay casilla para ellas en el papel? (E27 sería la ciudad adicional; I27 es un `0` fijo.)
5. **Nacionalidad:** el papel la pide (Excel la imprime) y la ficha del cliente dejó de pedirla el 3 de octubre, así que los clientes nuevos salen sin ella.

### Ya contestadas por él (no volver a preguntar)

- **Cómo imprime hoy:** «Así como está en la hoja de Excel, así la imprimo y casi siempre sale bien.»
- **Los rótulos:** el papel no los trae. **La letra blanca:** sí se imprime. **Lo que el sistema no guarda:** «lo que tú creas conveniente» (se resolvió: a quién se factura se teclea; lugar y tarifas precargados; código del cliente vacío).
- **Hora de entrada:** «Igual que el Excel» (repite la de salida). **La «Q»:** su papel no la trae (se imprime). **Combustible de salida:** «Yo lo escribo mejor» (no se imprime).
- **Autorización de la tarjeta 1:** sí, se imprime (casilla derivada).
- **Número de contrato:** «yo pongo el número de contrato porque es el que está en las hojas membretadas»: viene preimpreso en su papelería, por eso no se imprime.

## Para el coordinador

- El aviso amarillo «Respaldo en Excel» de otro agente **sí se imprime** cuando la pantalla de imprimir no pudo armar la hoja (le falta `no-imprimir`); con una hoja a la vista no sale, porque la regla del contrato esconde todo lo demás.
- «Nueve textos» en el encargo eran **ocho** (diez campos: «EXPIRA:» y «CODIGO CBC» van dos veces) y «catorce» de letra blanca eran **nueve** con fuente (once celdas en Excel).
- No toqué `version.txt` ni `js/version.js`. `app.js` e `index.html` los commiteó el coordinador con mis líneas.
- El arnés (servidor, falsos de Firebase, scripts de CDP y las medidas) quedó en la carpeta de trabajo de esta sesión; los datos son de mentira.
