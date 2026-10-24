# Comprobante de pago de comisión — informe (decidido el 23 de octubre de 2026, construido el 23 y 24)

**Estado: hecho y verificado.** Base: `main` en `f0c192c`, `npm test` = 2498 pasando, 0 rojas. Al terminar: **2577 pasando, 0 rojas** (+79, todas nuevas: 77 en
`pruebas/comprobante-comision.test.mjs`, 1 en el Excel y 1 en `comisiones-datos`; además reescribí o ajusté pruebas viejas que fijaban la forma del pago sin comprobante: ver abajo). No toqué `version.txt`, `js/version.js`, `js/nucleo/busqueda.js`,
`js/pantallas/buscador.js`, `index.html` ni `firestore.rules`.

## Commits

| sha | qué |
|---|---|
| `4944e16` | núcleo: `filaDeDetalle`, el detalle dentro de `elegirParaPagoDeComision`, `estadoDelComprobante` (listo / de antes / dañado) |
| `c78f65e` | datos y registro: contador propio, `numero` + `detalle` en el pago, anular un pago de antes no se los pone, número tomado una vez por intención |
| `ead1304` | el papel: `js/pantallas/comprobanteComision.js` |
| `5e45c03` | la ficha: número en «Ya pagado», «Ver comprobante», nota de «sin comprobante», relectura antes de abrirlo |
| `41e9b46` | Excel: columna «Comprobante N°» en «Pagos»; regla CSS de la nota; el papel solo usa clases del papel de los dueños |
| `6d42d6c` | este informe (versión en curso) |
| `5f845c5` | diseño: §5, §6 (apartado nuevo «El comprobante de pago de comisión»), §7, §7b, liquidación §6, ADR-003 |

## Lo que se decidió, con su razón

1. **Dos campos nuevos en el pago de comisión, y solo dos: `numero` y `detalle[]`.** §7b los explica con su *por qué* y con sus nombres.
   Dentro de `detalle[]` cada dato se llama como en el contrato donde es el mismo (`numero`, `carroPlacas`, `clienteNombre`, `dias`, `porcentajeComision`); `fechaReal` es la de
   `cierre.fechaReal`; `diasAtraso`, `base` y `monto` salen de `atrasoDe` y `comisionDe` (no se calcula nada aparte). Ojo anotado en §7b: el `numero` de una fila es el del **contrato**.
2. **Ninguna regla de Firestore cambia** (no tuve que detenerme): `contadores/{id}` es `haySesion()` y `pagosComision` es `esDinero()` sin mirar campos. Una prueba fija esas dos líneas de
   `firestore.rules`, y el arnés de navegador (que aplica las mismas reglas) lo confirmó: el contador lo escribió la sesión del **mostrador** y el pago la de **dinero**.
3. **El número tiene su propia serie** (`contadores/comprobantesComision`), no la de los dueños: si compartieran, la serie de los dueños —que ya tienen papeles con su número— saltaría números
   que no son suyos. Mismo mecanismo (la transacción es una sola función, `tomarSiguienteDe`, que ahora usan las dos).
4. **El número se toma una vez por intención de pagar** (`enCurso`, como el id), **después** de comprobar que nada cambió. Reintento = mismo documento, mismo número; un «cambio» no gasta número.
5. **Lo que se guarda es lo que él vio, renta por renta** (`detallesIguales`), no solo la misma suma: dos rentas pueden cambiar en sentidos opuestos y seguir sumando lo mismo, y el papel diría renta por renta algo que él nunca vio.
6. **Un pago nuevo que no trae número y detalle coherentes no se guarda** (`guardarPagoComision`). Anular pasa `{ reescritura: true }`: se reescribe tal como está en la nube.

## Qué lleva el papel y qué NO (y por qué)

**Lleva:** el membrete de `MEMBRETE` (sin NIT; hay prueba), el empleado (nombre y código), número y fecha del pago, y una fila por renta con **cuándo regresó, contrato, placas, cliente, días (con atraso), base,
porcentaje de ese día y comisión**; el **total pagado** (el `monto` guardado), la forma de pago y la línea de firma. Es exactamente lo que ya enseña la fila de «Por pagar» de su cuenta.

**Cómo razoné qué excluir:** el del dueño de un carro excluye lo que el cliente pagó y la utilidad porque un proveedor no tiene por qué ver los libros de Best Price. Con un empleado el razonamiento es el mismo con
**una diferencia que decide**: la base de su comisión (días × precio − descuento) ya está en su pantalla, así que no es un secreto para quien rentó el carro. Lo que sigue siendo ajeno es lo que está del otro lado del mostrador.

**No lleva:**
- Lo que el cliente pagó, su saldo, su garantía, su tarjeta (ni el recargo). De la renta se **toma** lo permitido, no se quita lo prohibido.
- El costo de un carro ajeno y su dueño (sí salen las placas, que identifican la renta que él hizo).
- La utilidad, el precio por día y el descuento por separado (solo la base, que ya es el neto).
- Nada de otro empleado, ni de otras rentas del mismo: solo las del pago.
- **«Queda pendiente»**, que el del dueño sí lleva: sería una cifra «al día de hoy» que una reimpresión no podría repetir, mezclaría lo estimado con lo firme, y es una promesa de pago sobre una fecha que decide él («yo decido cuándo lo pago»). Si lo quiere, es un campo más en el pago y una decisión suya.
- La nota de «las rentas cambiaron» (la del dueño sí la lleva): con el detalle guardado el papel siempre suma su total, así que esa frase sería falsa.

Pruebas: busca cada cifra y cada palabra prohibida (con fronteras de número: el 125 del descuento no es una fuga por estar dentro de un 4,125.00) en el HTML, en la pantalla y en el modelo, sobre rentas de carro ajeno con garantía, tarjeta con recargo, daños, descuento y atraso, con el costo del dueño **de vuelta en memoria** (el peor caso).
Una lista blanca de llaves del modelo hace fallar cualquier llave nueva; un campo de más en el pago o en una fila no llega al papel.

## Pagos hechos antes de hoy: **no se imprimen, y la ficha dice por qué**

No tienen número ni detalle. Lo que decidí, y por qué:
- **No se recalcula con las cifras de hoy** (ni callado ni con un aviso): sería decir «esto fue lo que se pagó» sobre algo que nadie guardó.
- **No se les pone número al imprimir**: sería de una serie que el empleado nunca vio y volvería «nuevo» a un pago viejo.
- **Anular uno de antes tampoco les pone número ni detalle** (comprobado con clic real en el arnés: el pago anulado quedó sin ninguno de los dos y el contador no se movió).
- Su tarjeta sigue llamándose «Pago del 24 sep 2026» (no «Comprobante N.° …»), no trae botón y escribe: *«Este pago se registró antes de que existieran los comprobantes de comisión, así que no tiene número ni guardó lo que se pagó renta por renta. Armarlo ahora con las cifras de hoy podría decir algo distinto de lo que se pagó ese día, y por eso no se arma. Los pagos que se registran desde ahora sí lo traen.»*
- **La salida que existe** (no la puse en pantalla; es decisión suya): anular ese pago y volver a registrarlo con las mismas rentas y la fecha en que de verdad se pagó. El pago nuevo sí trae su papel. Cuesta un pago anulado más en «Ya pagado».
- Un pago con solo uno de los dos campos, o con un detalle que no suma, está **dañado**: tampoco se imprime y dice cuál es el daño.

## Anulado, y «hoy suman otra cosa»: lo que ya había decidido el papel de los dueños

- **Anulado:** el papel se niega (ya no pagó nada), el **número se conserva** (el empleado tiene el papel viejo) y la ficha no ofrece el botón. El diálogo de anular nombra el comprobante y dice que ese papel deja de valer y que el número no se reutiliza.
- **Las rentas hoy suman otra cosa:** el total sigue siendo lo guardado y a quien manda el papel se le dice **en pantalla**, antes de imprimir (`no-imprimir`), con las palabras de siempre. Lo único distinto del de los dueños: el papel **no** lleva nota (con el detalle guardado sería falsa y la reimpresión tiene que ser igual al original).
- **De qué copia sale:** «Ver comprobante» **vuelve a leer los pagos** (como anular) y arma el papel del pago como está ahora en la nube; si no se pueden leer, no se abre. Si otra pestaña lo anuló mientras tanto, se niega en vez de imprimir «comisiones pagadas».

## Lo que vi cuando lo imprimí

Arnés propio: árbol servido por mí en el puerto **4747** (comprobado libre con `lsof`, cerrado al terminar), falsos locales de los tres módulos de Firebase (import map inyectado al servir, `index.html` no se tocó; los falsos aplican las reglas de `firestore.rules`),
IndexedDB `bestprice-contratos` **v3** sembrada con los constructores reales, **mi propia pestaña** del navegador. Contraseña del área = el texto inventado del arnés contra la autenticación FALSA; no se tocó el proyecto real.

- **Clics reales:** área de dinero → Comisiones → Ana → «Todo octubre» → Registrar pago → Guardar. «Pago registrado: Q450.00. Comprobante N.° 1.». En la nube falsa: `contadores/comprobantesComision = 1` (sesión mostrador), el pago con `numero: 1` y tres filas de `detalle` (sesión dinero), sin un solo `undefined`.
  «Ver comprobante» dibuja la hoja; el botón de imprimir llamó a `window.print()` una vez con el título «Comprobante de comisión 1 - Ana López» (el nombre que Chrome propone para el PDF).
- **El PDF** (`Page.printToPDF` de Chrome sobre la pantalla real, Carta): **1 página**, el papel solo —sin el menú, sin el aviso de respaldo, sin botones, sin el aviso rojo—, tabla de ocho columnas legible, total y forma de pago, firma. Lo miré como imagen. Con 44 rentas son 3 páginas: el encabezado de la tabla se repite, ninguna fila se parte y el total sale una sola vez.
- **Reimpresión tras corregir un cierre** (un regreso corrido un día en la nube falsa): la ficha dice «Lo que se pagó el 24 oct 2026 fue Q450.00, y hoy esas rentas suman Q485.00»; la pantalla del papel lleva ese aviso en barra roja y **el texto de la hoja es idéntico** al primero (los dos PDF pesan 220,407 bytes).
- **Anular con clic real:** el pago N.° 1 queda con su número y «Anulado el 24 oct 2026», sin botón de papel; el siguiente pago recibió el **N.° 2** (el 1 no se reutiliza). El pago de antes, anulado con otro clic, quedó **sin número ni detalle**.
- **«Imprimirlo otra vez» tras anular:** la tarjeta no ofrece botón. Con la **pantalla vieja** (se anuló «desde otra pestaña» escribiendo en la nube falsa) y apretando «Ver comprobante» en la copia vieja: el sistema leyó de nuevo y, en vez de la hoja, dijo «El pago N° 1 está anulado desde el 24 oct 2026: ya no cuenta como pagado, y un comprobante de pago diría lo contrario.». Si se imprimiera esa pantalla, sale una página en blanco.
- **Cerrar la sesión de dinero con el papel en pantalla** (`cerrarElDinero`): la hoja desaparece y la pantalla queda vacía. Consola sin errores en todo el recorrido.

## Mutaciones

Unas 90 corridas (un script aplica una mutación, corre las pruebas de esa parte, restaura y dice MUERTA / SOBREVIVIÓ): el núcleo (cada comprobación de `estadoDelComprobante`, cada campo de `filaDeDetalle`, `detallesIguales`), datos (el guardado estricto, la reescritura, el sellado, el contador, la
suma de filas), el registro (número una vez, después de comprobar, mismo id y número al reintentar, el detalle comparado), el papel (anulado/de antes/dañado, orden, total guardado, atraso, qué se esconde al imprimir, escape de avisos), la ficha (cuándo hay botón, cuándo hay nota, el nombre del pago, la relectura, el aviso de «hoy suman»), el Excel.
En las primeras pasadas **sobrevivieron 17, todas explicadas, y ahora no sobrevive ninguna**:
- **8 eran código redundante** (los quité en vez de dejar código muerto): una comprobación de ids repetidos que ya cubría la de cantidad, `!fila.contratoId`, `Array.isArray(fila)`, un `!anulado &&` que ya estaba implícito, un `estado !== 'de-antes'` imposible con número, el `q()` de un porcentaje ya redondeado, la rama «porcentaje que no se lee» del papel y la comprobación de monto cero del papel que `estadoDelComprobante` ya hace.
- **9 mostraron pruebas que faltaban**, ya agregadas y vueltas a mutar (todas muertas): una fila de comisión cero que aun así suma el monto, un pago vacío en cero, un id de renta que no es texto, el orden de las filas y su desempate por contrato, la raya del contrato que falta, un aviso que se calla para otro pago, un pago de antes anulado con nota de más, el aviso de «ya no está» y un detalle de otro tamaño.

## Pruebas viejas que cambié (y por qué no es aflojarlas)

Fijaban la forma del pago **sin** comprobante, que es justo lo que cambia: `elegirParaPagoDeComision` devuelve `detalle` (4 `deepEqual` de la selección vacía), `construirPagoComision` trae `detalle`, `guardarPagoComision` de un pago nuevo exige `numero` y `detalle` (el helper `pagoNuevo` de `comisiones-datos` ahora los trae y
una prueba afirma que sin ellos se niega), `registrarElPagoDeComision` pide el número (los falsos de la pantalla traen `nuevoNumero`), la hoja «Pagos» del Excel tiene una columna más (la lista exacta de columnas y tres posiciones fijas, ahora buscadas por título), y `regla-porcentaje` ahora lista `pantallas/comprobanteComision.js` entre los que
nombran `porcentajeComision` (con su respuesta: lo LEE del detalle guardado, no escribe ningún contrato). `comprobante.js` solo exporta cinco ayudas que ya tenía (`esc`, `algo`, `RAYA`, `textoDeForma`, `imprimirConTitulo`) y corrige una frase («el único papel…»).

## Preocupaciones

1. **Pagos de antes de hoy sin papel.** Todo pago registrado hasta hoy (desde el 13 de octubre) no se puede imprimir. Si el empleado reclama uno, la salida es anular y registrar de nuevo, o un papel a mano. Es una decisión suya, no la puse en pantalla.
2. **El nombre y el código del empleado son los de su ficha de HOY**, no están congelados (no son una cifra y no quise un tercer campo, `empleadoNombre`, que sería un segundo nombre para el `rentadoPor` del contrato). Si corrige una letra, el papel que reimprima lleva la corrección. Si prefiere estricto, es un campo más en el pago.
3. **«Queda pendiente» no está.** Es la diferencia más grande con el papel de los dueños; está argumentada arriba y en §6. Agregarlo es un campo más guardado.
4. **Con muchas rentas la firma puede quedar sola en una hoja de más** (con ~24 rentas o más): es el CSS de impresión que comparte con el papel de los dueños. Probé `break-before: avoid` en la firma y no cambió nada; lo dejé como estaba.
5. **El membrete parte el número «5770-5278» en dos renglones** al imprimir (el texto está confirmado por él; el acomodo es del CSS compartido con el papel de los dueños). No lo toqué.
6. **No lo probé contra Firebase de verdad** (nunca me autentiqué contra el proyecto real): la afirmación de «ninguna regla cambia» se apoya en leer `firestore.rules`, en la prueba que fija esas líneas y en el arnés que las reimplementa. El primer pago después de publicar crea `contadores/comprobantesComision` (empieza en 1), igual que cuando se creó `contadores/comprobantes`.
7. **El nombre del cliente de cada renta ahora también se guarda en `pagosComision`** (dentro de `detalle[]`). Esa colección solo la lee la credencial de dinero y el contrato ya trae el nombre legible por el mostrador, así que no hay una exposición nueva; lo anoto por si él no lo esperaba.
8. **El PDF lo saqué de Chrome sin cabeza**, no del cuadro de diálogo de imprimir de su navegador (en el panel del navegador no se puede abrir). Lo que sí probé con clic real fue que el botón llama a imprimir con el título correcto.
9. Si el guardado de un pago falla *después* de tomar el número y él cancela, queda un hueco en la numeración. Un hueco se explica (§7b); un número repetido no.
