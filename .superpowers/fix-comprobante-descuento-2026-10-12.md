# El comprobante dice el descuento (12 oct 2026)

**Estado:** terminado. Commits `02080a5` (el papel), `c4308dc` (la prueba del CSS y las mutaciones), `8c7ad73` (la prueba cruzada con la ficha, los documentos
de diseño y limpieza) y el de este informe.

**Base:** `main` en `9261878`, `npm test` = 1449 en verde. Al final: **1475 en verde** (+26: 21 en `comprobante.test.mjs`, 4 en `liquidacion.test.mjs`, 1 en `dinero.test.mjs`).

## Qué heredé

- `monto` de un pago NO se toca: sigue siendo lo que suman las rentas que cubre. `descuento` (opcional) es la parte de ese `monto` que no se
  entregó. Lo entregado es `monto − descuento` y lo calcula el núcleo (`entregadoDelPago`, `descuentoDelPago`).
- Por eso los grupos de pagos (`gruposDePago`) comparan `monto` contra lo que las rentas cuestan hoy y el descuento NO los descuadra: una
  renta de Q1,200 pagada con Q600 de descuento está pagada, no a medias.
- `comprobante.js` no sabía nada de esto: imprimía «Total pagado» = `monto`, o sea Q1,200, cuando de la mano de él salieron Q600.

## Lo que decidí antes de tocar nada

- **La palabra «descuento» no sale en el papel.** La prueba de lo prohibido (`PALABRAS_PROHIBIDAS`) la tiene en su lista porque en el contrato
  `descuento` es lo que se le rebaja al CLIENTE (`cierre.descuento`), y esa prueba no distingue de qué descuento se habla. Quitarla de la lista
  para que pase sería debilitar la prueba que protege al papel. El papel dice lo mismo con otras palabras («lo que ya se le había pagado de más»),
  que además es lo que un proveedor entiende sin conocer el sistema.
- **No nombra de cuál comprobante viene lo pagado de más.** El pago guarda cuánto se descontó, no contra cuál (un descuento se reparte entre los
  pagos de más que haya). Decirlo calculándolo hoy haría que la reimpresión dijera otra cosa que el papel que ya tiene el dueño del carro.

## Hecho: el papel dice el descuento — `comprobante.js`, núcleo, CSS

- **Modelo** (`pagado`): `total` sigue siendo el `monto` guardado (lo que suman las rentas), y se agregan `descuento` y `entregado`, los dos del núcleo:
  `comprobante.js` no suma ni resta nada (una prueba lee el código y falla si aparece una suma o una resta; `suma` ya ni se importa).
- **Pie de «Le pagué»**: sin descuento es la fila de siempre, «Total pagado». Con descuento son tres renglones que se leen de arriba abajo:
  «Rentas pagadas con este comprobante Q1,200.00», «Menos: lo que ya se le había pagado de más -Q600.00», «Total pagado Q600.00».
  Debajo, una nota con palabras: «antes se le pagaron Q600.00 de más. Esa cantidad no se entrega otra vez: se resta de este pago. Las rentas de esta lista
  quedan pagadas por completo (Q1,200.00) y lo que se entregó con este comprobante fue Q600.00.»
- **Un pago de antes del descuento se imprime idéntico, byte por byte.** Corrí las 34 hojas que producen las pruebas viejas contra el árbol de `9261878`
  y contra el nuevo: 34 de 34 iguales.
- **Reimpresión**: todo sale de lo que el pago guardó (`monto`, `descuento`), nunca del costo de hoy. Prueba: mismo pie con otra fecha de «hoy», con la renta
  corregida hacia abajo y hacia arriba, con el costo sin poder leerse, con el comprobante que había pagado de más anulado, y con los pagos llegando en otro orden.
- **Lo entregado en cero** (se descontó todo): la forma de pago dice «Sin entrega de dinero» (no «Efectivo» sobre Q0.00) y la nota lo dice con palabras.
- **Un descuento imposible no se imprime** (negativo, mayor que el monto, no numérico, una lista…): `armarComprobante` lanza. El núcleo lo recorta para que una
  cuenta no entregue de más (`descuentoDelPago`), pero un papel que sale de la empresa con una cifra recortada diría algo que nadie decidió. Nuevo: `descuentoInvalido`.
- **Núcleo**: `totalesDePagos(pagos)` → `{monto, descuento, entregado}`. Los grupos de pagos (`pagado`, `descuento`) y el comprobante (la suma de la cadena de
  pagos «este pago completa a otros») usan la misma; antes el comprobante sumaba `monto` por su cuenta.
- **Cadena**: un pago que completa a otro con descuento nombra el «Total pagado» de ese papel (lo entregado, Q600.00 y no Q1,200.00), y el «en total» dice
  cuánto de eso ya se había pagado de más, para que la cuenta cuadre (600 + 240 + 600 = 1,440).
- **Documentos de diseño**: §7b del diseño general ahora tiene `descuento` del pago a un dueño, con su «Ojo con el nombre» (no es el del cierre); §6 de la
  liquidación describe el pie de tres renglones, la palabra que no sale y que una reimpresión dice lo mismo; §7 de la liquidación lista el campo.

## «Lo pagado ya no cuadra con el detalle» y el descuento

- El descuento NO lo dispara: la nota compara las rentas contra `monto`, y `monto` no se tocó. Prueba con constructores reales: sin cambios no sale ni la nota ni
  el aviso en pantalla. En el navegador, igual (Ofelia, N.° 7: cero avisos).
- Cuando las rentas SÍ cambian después de un pago con descuento, la nota de siempre diría «lo pagado fue Q600.00 … el detalle ya no suma esa cifra», que sería
  falso (el detalle sumaba Q1,200). Lleva su propia versión: «al hacer este pago las rentas sumaban Q1,200.00 … Lo entregado, Q600.00, no cambia». Lo mismo en el
  aviso de pantalla (que no sale en el papel).
- **Concern 5 de H-7** (el papel contesta con su propia comparación y no con los grupos del núcleo): probé en tres estados de la renta pagada con descuento
  (sin cambios, corregida hacia abajo, corregida hacia arriba, todas cerradas) que el papel y `gruposDePago` contestan igual. El descuento no los separa, así que
  **no agregué una tercera comparación ni moví la del papel**. Lo que SÍ los separa, con o sin descuento, es una renta pagada que se REABRE: ver el concern 3.

## Verificado imprimiendo de verdad

- **Arnés propio**, no el de otro agente: carpeta nueva, servidor en el puerto **4391** (comprobé con `lsof` que estaba libre antes de arrancar, y que quedó cerrado
  al terminar; PID 21147), que sirve `git archive` de un commit exacto (`c4308dc` para lo hecho a mano, `8c7ad73` = HEAD para la corrida final; el script imprime
  qué commit sirve y cuántos archivos de `js`/`css` están sucios, y comprueba que el árbol servido trae `comp-pie-menos` y `totalesDePagos`). Las tres URL de
  Firebase se cambian por falsos locales con un import map (los copié del arnés de H-7 y los leí: no tienen una sola llamada de red; todos los recursos cargados
  eran de `localhost:4391`). IndexedDB `bestprice-contratos` **versión 3**, sembrada de nuevo antes de cada medición, con los constructores reales (`construirContrato`,
  `construirCierre`, `agregarPago`, `construirPagoDueno`, `pagoDuenoParaGuardar`). Nadie dio credenciales ni se tocó el proyecto real: la contraseña del área de
  dinero es un texto de prueba contra la autenticación falsa.
- **Flujo completo con clics reales** (Ofelia Ramos: pagada Q2,100, corregida a Q1,500, renta nueva de Q1,200 con tarjeta, comisión y daños): la ficha dice «Se le pagó
  de más: Q600.00»; marqué la renta, «Registrar pago», tecleé 600; la pantalla dice «Entregas ahora Q600.00 (rentas por Q1,200.00, menos Q600.00 de descuento)» y el
  botón «Guardar pago de Q600.00»; se guardó con `monto` 1,200 y `descuento` 600; «Ver comprobante» trae los tres renglones, la nota, cero avisos y el pendiente
  de Q760.00. La línea de «se le pagó de más» desapareció de la ficha. Lo mismo, automatizado, sobre el HEAD final.
- **Nada del negocio en el DOM real**: busqué en el papel y la pantalla las cifras y textos del contrato con margen (850, 3,400, 4,321, 7 %, 6.5 %, Ana, BAC, 3343,
  la observación del mostrador, los ids) y las palabras prohibidas: ninguna. Tampoco aparece el otro comprobante (placas, cliente, Q2,100, Q1,500).
- **Reimpresión en el navegador** (Berta Solís, pago N.° 4 con descuento ya guardado): cambié el costo de su renta en la nube falsa y recargué: el pie sigue
  Q1,200.00 / -Q600.00 / Q600.00, la fila dice el costo de hoy (Q1,000.00), sale la nota de cambio con su versión de descuento y el aviso de pantalla. Anulé con el botón
  real el N.° 3 (el que había pagado de más): el pie del N.° 4 no cambió. (La ficha sí dice entonces que se descontó de más: ver concern 6.)
- **Impresión real**: Chrome headless propio (perfil temporal), `Emulation.setEmulatedMedia('print')`, estilos calculados y `Page.printToPDF` en Carta, y el PDF
  convertido a PNG para verlo. Con el medio de impresión: barra, menú, botones y `.no-imprimir` salen ocultos, la hoja visible; en el pie con descuento los dos primeros
  renglones pesan 400 y el total 700; un pago sin descuento sigue con su sola fila en negrita. Páginas: 1 por comprobante normal (Berta, Carlos con lo entregado en
  cero, Mario sin descuento). Con tablas largas (12 a 26 rentas, un pago con descuento cada una) probé dónde cae el pie: a 17 rentas cabe en la hoja 1 y la forma de pago
  y la nota pasan a la 2; a 18 rentas el pie entero (los tres renglones) pasa junto a la hoja 2 con el encabezado de la tabla repetido. **Con o sin mi regla de
  `break-after: avoid` Chrome sale igual** (la quité del árbol servido y comparé 17, 18 y 19): la regla es defensiva por otros navegadores y no la pude medir en Safari ni
  en Firefox.

## Pruebas y mutaciones

- **Contra el código de `9261878` (sin mis cambios de producción) fallan 18 de las 75 pruebas de `comprobante.test.mjs` y la prueba nueva de `dinero.test.mjs`**, y
  `liquidacion.test.mjs` ni carga (no existe `descuentoInvalido`): cada cambio tiene una prueba que se cae sin él. Las que pasan en los dos lados son las que guardan que
  NO se filtre nada (ver las fugas inyectadas, más abajo).
- 41 mutaciones sobre `comprobante.js`, `liquidacion.js` y `estilos.css` (cada condición, cada cifra, el signo de la resta, las etiquetas, el orden de las notas, el orden de
  la cadena, la forma de pago en cero, los topes del descuento imposible, la clase de cada renglón, el `break-after`): **40 matan**. La que sobrevive es un equivalente
  (quitar `crudo === ''` de `descuentoInvalido` no cambia nada: `Number('')` ya es 0). La mutación del CSS sobrevivía al principio (la prueba solo buscaba el nombre de la
  clase) y pidió endurecer la prueba: ahora exige la regla con sus declaraciones.
- **Tres fugas inyectadas a propósito en la nota del descuento** (la palabra «descuento», una garantía de Q4,321.00, quién rentó) las ve la batería nueva de lo prohibido;
  las pruebas de lo prohibido que ya había NO las ven, porque ninguna imprime un pago con descuento. Por eso la batería se repite sobre este escenario (el pago con
  descuento es de un contrato con margen de verdad).
- Las dos pruebas de llaves permitidas se actualizaron: `.pagado.descuento`, `.pagado.entregado`, `.pagado.acumuladoDescuento` son cifras del propio dueño del carro,
  decididas con la lista a la vista. Otra prueba exige que con y sin descuento el modelo tenga exactamente las mismas llaves.

## Concerns (lo que no es mío decidir o no pude cerrar)

1. **La pantalla del descuento en `dinero.js` (el commit `9261878`) casi no tiene pruebas.** Ese commit agregó a `dinero.test.mjs` los imports de `resumenDelDescuento`,
   `textoDelProblemaDelDescuento`, `textoDeDescuentoSinRespaldo` y `MENSAJE_PAGO_DESCUENTO`, y ninguna prueba los usa. Yo la recorrí a mano en el navegador y funciona (el campo,
   el tope, «Entregas ahora», el botón), y agregué una prueba cruzada (la cifra de «Ya pagado» y el «Total pagado» del papel son la misma), pero `resumenDelDescuento`,
   el parcheo en vivo y el reenvío al guardar no tienen una prueba que se caiga si se rompen. No era lo que me pidieron.
2. **El papel no dice de cuál comprobante viene lo pagado de más.** Quien concilia su cuenta con él lee «antes se le pagaron Q600.00 de más» y tiene que buscar cuál fue.
   Lo correcto sería guardar al registrar el pago contra qué comprobante se descontó (un campo nuevo en §7b), no calcularlo al imprimir. Decisión de él.
3. **Una renta pagada que se REABRE hace que el papel diga «cambiaron» aunque su costo no cambió** (cuenta solo rentas cerradas, `totalSeleccionado`; el grupo del núcleo no
   pregunta por «cerrada»). Las filas siguen sumando el `monto` y la nota afirma que «su detalle ya no suma». Es del concern 5 de H-7, hay una prueba vieja que lo fija a
   propósito (`una renta ya pagada que ya no está cerrada también hace que el detalle no coincida`), y el descuento no lo causa ni lo arregla (la versión con descuento de la nota
   lo hereda). Si él lo quiere corregir, la pregunta es del núcleo (`diferencia` del grupo), no una comparación nueva en el papel.
4. **Un papel con «Total pagado Q0.00»** (se descontó todo) existe y se imprime: es verdad y la pantalla deja guardarlo, pero que salga un comprobante sin dinero entregado
   puede ser algo que él prefiera no mandar. Lo dejé explícito («Sin entrega de dinero») en vez de bloquearlo.
5. **La palabra «Descuento» no está en el papel, y él le dice así.** Si la quiere ahí, hay que decidir cómo permitirla en la prueba de palabras prohibidas para ese solo
   caso; yo no toqué esa lista.
6. **Un descuento sin respaldo se ve en la ficha, no en la pantalla del comprobante.** Si se anula el comprobante que había pagado de más (o esa renta vuelve a subir), la ficha
   dice «Se le descontaron Q400.00 de más…», pero al reimprimir el comprobante con descuento la pantalla no avisa nada (el papel no debe cambiar: es lo que se entregó ese día).
   `descuentoSinRespaldo` es de toda la cuenta, no de un pago, así que no se puede atribuir a un papel sin inventar una regla.
7. **En una tabla larga la nota del descuento (y la forma de pago) puede quedar sola arriba de la hoja 2**, lejos de los renglones que explica (a 16 y 17 rentas, medido).
   Ya pasaba con «Forma de pago» y con la nota de «cambiaron»; no lo toqué.
8. Nombres nuevos, todos derivados (nada guardado, §7b solo ganó `descuento`, que ya existía en los pagos): `totalesDePagos`, `descuentoInvalido`, y en el modelo
   `pagado.descuento`, `pagado.entregado`, `pagado.acumuladoDescuento`. El arnés vive en el `scratchpad` de la sesión (`comp/arnes`), fuera del repositorio.
