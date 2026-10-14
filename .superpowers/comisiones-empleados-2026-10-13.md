# Comisiones de empleados — informe (13 y 14 de octubre de 2026)

**Estado: hecho y verificado en el navegador.** `npm test`: **1924 pruebas, 0 rojas** (base 1475; en el árbol hay también las pruebas de
la impresión del contrato y del respaldo en Excel, que escriben otros agentes). De las nuevas, **unas 198 son de este trabajo**: 175 en
cinco archivos nuevos y 24 en `pruebas/sacarCarro.test.mjs` (una se reemplazó).

## Commits

| sha | qué |
|---|---|
| `4936787` | núcleo del empleado (`js/nucleo/empleado.js`): código, nombre, porcentaje que puede ser 0 |
| `c5f73d5` | cuenta de comisiones (`js/nucleo/comisiones.js`): solo lo firme se paga; `empleadoId` en el contrato |
| `edf84c3` | datos (`js/datos.js`): `empleados`, `pagosComision`, enlazar rentas viejas |
| `eb324e8` | «Sacar carro»: el campo del porcentaje desaparece, se escoge al empleado por código o nombre |
| `1bcedb8` | las dos pantallas (Empleados y Comisiones) — lo commiteó el coordinador al cortarse mi sesión; **también trae el botón y las rutas de la impresión del contrato**, que no son mías |
| `267d50e`, `7edb221` | pruebas de la pantalla de empleados y dos mutaciones más atrapadas |
| `35f2398` | glosario §7b y pendientes del dinero; enlazar rentas viejas pasa a la credencial de dinero |
| `c914062` | ADR-002: actualización con la decisión |
| `cf9a9b2` | arreglo que encontró el navegador (ver «Lo que encontró el navegador») |

No toqué `version.txt` ni `js/version.js`. No hay ningún cambio en `firestore.rules`.

## ADR-002: la pregunta abierta de `porcentajeComision` — decisión

**Esta tarea NO lo mueve, y moverlo no habría cerrado nada.** Está escrito en §7b («Pendientes conocidos del dinero») y en una
actualización al final de ADR-002. Las razones, de más a menos importante:

1. **El mostrador tiene que LEER el porcentaje del empleado para poder sellarlo.** §12b y §5 piden que el contrato se quede con el
   porcentaje que el empleado tenga guardado, y quien escribe el contrato es la sesión del mostrador. Ese número vive en
   `empleados/{id}`, que la regla del dueño (la que ya estaba, `allow read: if haySesion()`) deja leer a cualquier sesión justo para
   escoger quién rentó. Mover el campo del contrato no lo esconde: sigue legible, en vivo, en `empleados`. Esconderlo pide sellarlo de
   otra manera (que lo escriba alguien con la credencial de dinero, o un historial de porcentajes por fecha que solo se lea con ella) y
   una regla nueva (`empleados/{id}/privado/…`). Eso es rediseño, y el encargo era no tocar las reglas.
2. **La lectura no es el hueco que pesa; la escritura sí.** §12b dice que el porcentaje no se *cambia* en el mostrador. Hoy se cumple
   en `empleados` (solo escribe dinero) pero **no en el contrato**: `contratos/{id}` lo escribe cualquier sesión, y
   `contratos/{id}/privado/{doc}` también (`allow create, update: if haySesion()`). Un empleado con las herramientas del navegador
   podría subir el `porcentajeComision` de sus propios contratos antes de que se pague, y la cuenta de comisiones —que lee el del
   contrato— lo pagaría. **Mover el campo a `privado/dinero` tampoco lo arregla** (ahí también escribe cualquier sesión). Lo cierra una
   regla de pocas líneas: que `porcentajeComision` de un contrato no cambie al actualizarlo (salvo con la credencial de dinero) y que al
   crearlo sea igual al del empleado que dice `empleadoId`. **Es lo que hay que decidir antes de que un empleado use el mostrador.** Por
   eso dejé el enlace de rentas viejas (`enlazarContratosAlEmpleado`) escribiendo con la credencial de dinero: el día que esa regla
   exista, esa escritura ya viene con la credencial correcta.
3. **La copia local de contratos (IndexedDB) sí lleva `porcentajeComision`** (lo comprobé en el navegador: los cinco contratos lo
   traen). A diferencia del costo del dueño no la limpié: nada se migra, no hay un segundo botón de «mover» que correr.

Lo que hice para no empeorar la lectura: **la lista de empleados no tiene copia local** (IndexedDB sigue en la versión 3, sin tienda
`empleados`; lo comprobé en el navegador). Así el porcentaje del empleado no queda escrito en el navegador del mostrador, y además el
que se sella es el de ahora y no el de la última vez que esa computadora sincronizó.

## Qué se construyó

- **`js/nucleo/empleado.js`** — la ficha: `codigo` (texto, no se repite ni contando bajas), `nombre`, `porcentajeComision`, `activo`.
  `porcentajeAnotado` distingue el 0 de Wilder de lo vacío (nada usa `||` para decidirlo). `buscarEmpleados`: el código exacto primero
  («6» da a Wilder antes que a «16»), después texto sin acentos. `datosDelContratoPara`: lo que el contrato sella (id, nombre de ese
  día, porcentaje de ese día).
- **`js/nucleo/comisiones.js`** — la gemela de `liquidacion.js`. `cuentaDeEmpleado`: `porPagar` (firmes, con monto), `noFirmes`
  (estimadas: el carro no ha vuelto), `pagados`, `sinComision` (firmes en Q0.00: el 0 % de Wilder o una base que el descuento se comió),
  `sinPorcentaje` (el contrato no trae un número legible: se aparta, no se paga), `pagosQueCambiaron` (se corrigió un cierre después de
  pagar: se dice, no se arregla solo). La comisión de cada renta sigue siendo `comisionDe` (`comision.js` no se tocó). Lanza ante una
  lista que no es lista: una lectura fallida nunca es «no le debes nada a nadie».
- **`js/datos.js`** — `cargarEmpleados` (con la sesión normal, sin copia local, `null` si falla), `guardarEmpleado` (solo con la
  credencial de dinero; se niega sin nombre, código o porcentaje legible), `construirPagoComision` / `guardarPagoComision` /
  `cargarPagosComision` / `anularPagoComision` / `nuevoIdPagoComision` (solo dinero, sin copia local, id antes del primer intento),
  `enlazarContratosAlEmpleado`. `cargarPagosDueno` y `cargarPagosComision` comparten `cargarPagosDe`, para que «un fallo no es una lista
  vacía» no quede en una sola.
- **«Sacar carro»** — el campo editable del porcentaje **salió** (y con él el 5 % de respaldo de `construirContrato`, que ahora guarda
  `null` si no le llega un número, y el `porcentajeComision: 5` de `ajustes`). «¿Quién lo rentó?» es un buscador de la lista de activos,
  por código o por nombre, con Enter para el código exacto; no muestra el porcentaje (ni en la fila ni en el recuadro del escogido) y no
  tiene alta rápida (dar de alta fija un porcentaje: solo el dueño). Sin empleado no se guarda, y cada razón se dice distinto: la lista no
  llegó, no hay empleados registrados, el escogido no tiene porcentaje. La lista se lee de la nube **en cada apertura**, no una por sesión.
  Pruebas que fijan la **ausencia** del campo: en la plantilla (id, etiqueta y la palabra «comisión»), en el código fuente y en
  `leerFormularioDe`.
- **`js/pantallas/empleados.js`** (`#/dinero/empleados`) — lista con buscador, ficha, alta y baja. Código propuesto = el siguiente libre;
  porcentaje propuesto = 5. Con la lista sin leer no deja guardar (no puede comprobar que el código no se repita). La baja no borra.
- **`js/pantallas/comisiones.js`** (`#/dinero/comisiones`) — la gemela de `dinero.js`: por empleado, lo que se le debe; ficha con
  **Por pagar** (casillas, y por fila la base, el % y la comisión), **Aún no es firme** (con el estimado aparte, sin casilla),
  **Ya pagado**; el total marcado se suma a la vista antes de registrar; «marcar todas»; pago con forma y fecha; anular con rastro
  (queda en «Ya pagado», tachado, con su `anuladoEn`, y sus rentas vuelven a «por pagar»). Las rentas de antes salen como «Sin enlazar»
  y se enlazan a un empleado; **cambiar el porcentaje de las que aún no se han pagado es una casilla que hay que marcar** (lo ya pagado no
  se toca nunca). Lo leído se suelta cuando la sesión de dinero se cierra (`alOlvidarElDinero` en `dinero.js`).
- Tocados de pasada: `dinero.js` (el gancho de olvido, los dos enlaces «Comisiones» y «Empleados» en la lista de dueños, `etiquetaDeForma`
  exportada), `app.js` (cuatro rutas, todas por `conPuertaDeDinero`), `css/estilos.css` (dos clases `dn-casilla*`).
- **§7b del diseño**: el campo `empleadoId`; `rentadoPor` ahora es el nombre de ese día y **por qué sigue siendo texto en los contratos
  viejos**; `porcentajeComision` como el sellado (y que el 0 es un porcentaje); «Del empleado»; «Del pago de comisión»; el puente de
  lectura `agruparPorEmpleado`; §7 y §12b al día.

## Decisiones mías (no del dueño) y por qué

- **Solo se paga lo firme, y «firme» es que el carro volvió** (`cierre.fechaReal`), no que el cliente haya pagado todo: así lo dice §5 y
  así lo pidió el encargo. Un contrato `devuelto` con daños sin cobrar sí tiene comisión pagable (los daños no entran a la base).
- **Un pago de comisión no lleva `numero`.** El de un pago a un dueño es el correlativo del comprobante que se le entrega; a un
  empleado no se le imprime nada. Tampoco hice comprobante. Los campos son los mismos donde es el mismo dato (`monto`, `forma`,
  `contratos[]`, `anulado`, `anuladoEn`), y `anularPagoComision` delega en `anularPagoDueno`: un solo modo de anular.
- **Wilder al 0 %** no tiene casilla ni forma de pagar: sus rentas firmes salen como «N rentas ya regresaron y no generan comisión: su
  porcentaje es 0 %», y ni marcándolas a la fuerza se arma un pago (hay prueba). Un 0 sellado en un contrato es un porcentaje; uno que
  falta (`undefined`, `''`, un texto) no es 0 ni 5: es «sin porcentaje», se aparta y se dice.
- **No hice la agrupación «por mes»** de §6: la lista de «Por pagar» va ordenada por fecha de regreso (el mes en que cuenta la comisión) y
  trae esa fecha, más «marcar todas». El encargo describía la pantalla sin meses (gemela de la de dueños).
- **La lista de empleados no se vuelve a leer al guardar el contrato**, solo al abrir «Sacar carro». Queda una ventana de minutos entre
  que el dueño cambia un porcentaje en otra computadora y que el mostrador que ya tenía la pantalla abierta lo vea. Es chica y tiene
  arreglo barato (releer al guardar) si algún día importa.

## Verificado en el navegador

Arnés propio, **no el de otro agente**: `scratchpad/comis/harness`. Puerto **4527**, comprobado libre con `lsof` antes de arrancar y
cerrado al terminar. Sirve un `git archive` de un commit exacto (primero `c914062`, luego `cf9a9b2`; el script de sincronía imprime
qué commit es y comprueba que el árbol trae `sc-empleado-buscar` y NO trae `sc-porcentaje-comision`). Las tres URL de Firebase se cambian
por falsos locales con un import map (copiados del arnés de H-7; los releí: ninguna llamada de red); al falso de Firestore le agregué
**las reglas de `firestore.rules` que importan** (`empleados` solo se escribe con la app `dinero`; `pagosComision`, `pagosDueno` y
`privado/*` solo se leen y escriben con ella) y un registro de quién escribió qué. IndexedDB `bestprice-contratos` **versión 3**,
resembrada con los constructores reales (`construirContrato`, `construirCierre`, `agregarPago`, `contratoParaGuardar`) antes de medir:
tres carros, dos clientes y tres rentas de antes de la lista (el nombre «Wilder» y «Pedro» escritos a mano, 5 %, sin la llave
`empleadoId`). La contraseña del área de dinero fue un texto inventado contra la autenticación falsa; no se tocó el proyecto real.

Con clics reales, de punta a punta:

1. **Alta**: Wilder (código 6, **0 %**) y Ana López (código 1, 5 %). Un código repetido (6) se negó con «El código 6 ya es de Wilder».
   Wilder salió en la lista como «0 % · No gana comisión». Ambos se escribieron con la base `dinero`, y el 0 quedó como número `0`.
2. **Sacar carro**: el campo del porcentaje no existe y no hay texto de «comisión» en la pantalla. Escribí `6` → «Wilder · Código 6» (sin
   porcentaje), Enter lo escogió («6 · Wilder»), y el formulario no se envió. Segundo carro: escribí `ana` y hice clic en la fila.
   Contrato 6: `empleadoId` de Wilder, `rentadoPor: Wilder`, `porcentajeComision: 0`. Contrato 7: Ana, 5.
3. **Recibir** los dos (botones reales): ambos quedaron `cerrado` y **conservaron `empleadoId` y el porcentaje**.
4. **Comisiones**: Ana Q70.00 por pagar (2 días × Q700 × 5 %), **Wilder Q0.00 con 0 rentas por pagar**, Pedro (rentas de antes) Q140.00.
   Mientras los carros seguían afuera, las comisiones salían como «estimada» y sin casilla.
5. **Enlazar la renta vieja «Wilder» (5 %)** al empleado Wilder con la casilla de cambiar el porcentaje: el confirm dice qué cambia y el
   contrato viejo pasó a 0 %; su cuenta quedó en Q0.00. La escritura fue con la base `dinero`.
6. **Pagar**: marqué la casilla (el total marcado sumó Q70.00 antes de registrar), «Registrar pago», «Guardar pago de Q70.00». Quedó en
   `pagosComision` (base `dinero`) con `monto: 70` y sus `contratos[]`. **Anular**: el confirm nombra a quién, cuánto y de cuándo; el pago
   quedó con `anulado: true` y `anuladoEn`, su `monto` y rentas intactos, tachado en «Ya pagado» y sin botón; la renta volvió a «Por pagar».
7. **Un porcentaje que sube no mueve lo ganado**: Ana pasó a 7 % en su ficha; la renta 7 siguió en 5 % y Q70.00, y la ficha dice «Gana el
   7 %». Pagar a «Pedro» (rentas de antes, `empleadoId: null`) funcionó.
8. **Una lectura fallida nunca es «no le debes nada»**: con `pagosComision` caído, la pantalla muestra una barra roja, ninguna cifra y
   «Volver a leer». Con `empleados` caído, las cifras salen (vienen de las rentas y los pagos) con una barra roja que lo dice. En
   «Sacar carro», con `empleados` caído: «No se pudo leer la lista de empleados» y el botón de reintentar (no «Sin resultados»); al
   volver la red, el reintento cargó la lista.
9. Salir del área de dinero la cierra (vuelve a pedir contraseña). IndexedDB: versión 3, sin tienda `empleados`.

**Lo que encontró el navegador y las pruebas no** (`cf9a9b2`): con la lista de empleados sin poder leerse, las cuentas de Ana y de
Wilder salían marcadas «No está en la lista de empleados» —se leía una lectura fallida como un empleado que no existe—. Ahora solo se
afirma cuando la lista se leyó. Y el confirm de enlazar decía «en 1 renta que aún no se han pagado»: ahora concuerda en plural y se prueba.
Nota para quien repita esto: la captura de pantalla de este panel suele salir **un cuadro atrasada**; me fié del DOM (`innerText`, valores,
estado de la nube falsa) y no de la imagen.

## Mutaciones (para que cada prueba pese)

Metí unas **115 mutaciones** al código nuevo con un script que aplica una, corre el archivo de pruebas y restaura: núcleo del empleado y
de las comisiones, datos, «Sacar carro» y las dos pantallas. Todas atrapadas salvo equivalentes: una (`rentas.some((c) => !c)` en
`pagosQueCambiaron`) es redundante con la que sigue (`estadoDeComision(undefined)` ya es «estimada»), y se deja por claridad. Tres
sobrevivieron al principio y dieron pruebas: el sello `actualizado` al enlazar (la fixture usaba el mismo número), que anular guarde la
copia de la nube y no la de la pantalla, y que el total de todos pase por `q()` (hacía falta un caso con dos empleados).

## Preocupaciones (lo que él debería saber)

1. **La escritura de `porcentajeComision`** (ver ADR-002 arriba): cualquier sesión puede cambiarla en un contrato. Hoy él es el único
   usuario. Antes de que un empleado use el mostrador hace falta la regla de arriba, o la comisión se paga sobre un número que quien la
   cobra puede editar.
2. **Orden al publicar:** en cuanto se publique esto el mostrador **no puede guardar una salida sin escoger un empleado**, y la lista
   empieza vacía. Lo primero que hay que hacer es dar de alta a los empleados (Dinero → Empleados). Si no, «Sacar carro» dice «Todavía no
   hay empleados registrados. El dueño los da de alta en Dinero, en Empleados.» La regla `empleados` ya está en `firestore.rules` desde el
   primer commit de reglas; conviene comprobar que la consola la tenga (si no, la lista falla y «Sacar carro» lo dice como fallo).
3. **Las rentas de antes de «Wilder» (5 %)**: el formulario de antes traía 5 % por omisión, así que lo que él haya rentado a su nombre
   quedó sellado en 5 %. Enlazarlas **no cambia el porcentaje** (sellado es sellado); si quiere que no cuenten, hay que marcar la casilla
   al enlazar (solo cambia las que no están pagadas). Si no lo hace, esas rentas siguen apareciendo como deuda con Wilder.
4. **«Firme» no espera al cliente**: una comisión se paga en cuanto el carro volvió, aunque el cliente todavía deba daños. Es lo que dice
   §5 y lo que pidió el encargo; lo anoto por si el dueño prefiere esperar al cierre del contrato (sería un cambio de una línea en
   `estadoDeComision`, pero es decisión suya).
5. Sin comprobante impreso de comisiones, sin número de pago, y sin agrupación por mes (ver arriba). Si lo quiere, es trabajo aparte.
6. Menor y heredado: en las listas vacías, el botón «Agregar el primero» (clase `dn-boton-ancho-auto` dentro de una celda) sale con poco
   contraste; es el mismo de la lista de dueños y no lo toqué.
7. Cuando corrí la suite completa hubo un rojo de `pruebas/respaldo-excel.test.mjs` que era trabajo a medias del agente del respaldo
   (archivos `js/respaldo/*` sin commitear); a la última corrida está en verde.
