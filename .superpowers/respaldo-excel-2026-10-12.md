# Respaldo en Excel (§10): informe de trabajo, 12–13 oct 2026

Se escribe sobre la marcha: si esta sesión se corta, lo que sigue es lo que ya se sabía.

## 1. Lo que se leyó antes de diseñar

**Su plantilla** (`Contratos Best Price Rent a Car.xlsx`, copia leída en una carpeta temporal; el original no se tocó):
diez hojas, todas protegidas **sin contraseña**; 19,059 fórmulas solo en CONTRATOS y ~10,000 en CLIENTES.

| Hoja | Qué es | ¿Dato o fórmula? |
|---|---|---|
| CLIENTES | 2,000 filas (3–2002), columnas A–Y de datos, AF–AI auxiliares del buscador | datos en B–Y; A es `=A3+1`; AF–AI fórmulas |
| VEHICULOS | 200 filas (3–202), A–H | datos en B–H; A es `=A3+1` |
| CONTRATOS | 1,000 filas (6–1005), A–CA; la fila 5 es de fórmulas que leen INGRESO DE DATOS | A–BD valores pegados; BE, BF, BI–BL, BN, BP–BQ, BT–BW fórmulas; BG, BH, BM, BO, BR, BS, BX–CA se llenan «al regresar» |
| INGRESO DE DATOS | el formulario con que se renta | entradas y fórmulas |
| BUSCAR, CIERRE, IMP. CONTRATO, IMP. CIERRE DE CONTRATO, FICHA CLIENTE, FICHA VEHICULO | solo leen de las tres de arriba | fórmulas |

Cómo se renta con ese archivo (lo dice su propia hoja): se llena INGRESO DE DATOS, se copia `A5:BD5` de CONTRATOS y se
**pega como valores** en la primera fila vacía (`COUNT(A6:A1005)+6`). Por eso las filas del respaldo tienen que ser
**contiguas desde la 6** y `A` tiene que ser un número: si queda un hueco, la próxima renta se pega encima de otra.

**El repositorio es público** (`bestpriceguatemala/bestprice-contratos`, `private: false`, confirmado con la API pública de
GitHub sin credenciales). La plantilla trae datos personales de verdad (un DPI, una licencia, un teléfono y un correo en
CLIENTES; números de tarjeta de prueba y una licencia en INGRESO DE DATOS; los mismos textos otra vez en la tabla de
textos compartidos y en los valores en caché de las fórmulas). **No se puede subir tal cual.** Hay que depurarla.

## 2. Qué es posible (el trabajo que se pidió reportar antes de comprometerse)

La pregunta no es «¿necesita una librería?». Es «¿qué hace el código que se envía en el instante del clic, y cuánto cuesta?».

Un `.xlsx` es un zip de XML. Los navegadores de hoy traen **`DecompressionStream` y `CompressionStream('deflate-raw')`**
(Chrome/Edge 103, Safari 16.4, Firefox 113) y Node 18+ también, así que **abrir y volver a armar el zip no necesita nada de
afuera**: lo medí con su plantilla, 17 ms para descomprimir la hoja de 3 MB y 16 ms para volver a comprimirla. Lo que queda
es el zip en sí (cabeceras y CRC-32) y escribir los datos en tres hojas.

| Opción | Qué hace en el clic | Conserva sus colores, fórmulas, validaciones y protección | Costo | Riesgo |
|---|---|---|---|---|
| **A. Parchar su plantilla con código propio** (zip nativo + reemplazo de celdas en el XML) | Abre la plantilla, escribe solo las celdas de datos, vuelve a comprimir | **Sí, byte por byte** lo que no se toca: es el mismo archivo con celdas cambiadas | ~600–800 líneas propias (zip, hojas, mapa, pantalla) + la plantilla enviada con el sistema (~0.5 MB, depurada) | Si cambia el diseño de su Excel hay que re-depurar la plantilla y ajustar el mapa (el código comprueba los encabezados y se niega si no calzan) |
| B. Librería de CDN para el zip (JSZip) | Igual que A | Igual que A | Ahorra ~120 líneas de zip; el parche del XML, el mapa y la pantalla se escriben igual | Una dependencia que puede caerse el día del respaldo, cambiar de licencia o de versión (la razón de ADR-003) |
| B'. Librería que lee y reescribe el libro (ExcelJS, SheetJS) | Carga el libro entero en objetos y lo vuelve a escribir | **No garantizado.** SheetJS de comunidad no escribe estilos; ExcelJS reserializa todo (formatos condicionales, extensiones, imagen, protección) y no hay forma de comprobar que no se perdió algo | ~1–2 MB desde un CDN; leer una hoja de 3 MB con 19 mil fórmulas pesa en memoria | Cambia lo que él no pidió cambiar, sin avisar |
| C. Armar un libro nuevo desde cero (escritor mínimo, sin plantilla) | Escribe tres hojas planas | **No**: sin fórmulas, sin colores, sin las otras siete hojas | Poco código | No sirve para rentar esa tarde: incumple §10 |
| D. CSV (o tabla HTML que Excel abre como .xls) | Texto | **No** | Mínimo | Es el «CSV que se llama respaldo»; no se hace |
| E. Variante de A: él escoge su Excel actual al bajar | Lee la plantilla del archivo que escoja | Igual que A | El repo no lleva plantilla (nada que depurar) y siempre se arma sobre su versión de hoy | Un paso manual más cada año, y el archivo que escoja trae todos sus datos viejos; si escoge otro, solo lo atajan los encabezados |

**Lo que se hizo: A**, por esto y no por lo fácil de construir (la más fácil sería D): es la única que cumple la frase de §10
(«armado sobre el archivo actual … conserva sus diez hojas, sus colores y sus fórmulas») con una garantía comprobable, y
ninguna librería la cumple mejor. B ahorra el zip y trae la dependencia que ADR-003 quiso evitar. Lo que cambiaría la
decisión: que él prefiera E (nada suyo en el repo público a cambio de un paso manual al año).

(Las secciones siguientes se agregan a medida que se construye.)
