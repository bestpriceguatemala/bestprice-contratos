# Auditoría de las pruebas — 26 de octubre de 2026

**La pregunta:** los 2,589 verdes de `npm test`, ¿atrapan un error de verdad? El número no lo dice. Se mide metiendo errores a propósito en una **copia** del código (cambiar un `<` por `<=`, un `×` por `÷`, borrar una línea…) y viendo si alguna prueba se pone roja. Un error que ninguna prueba nota es un hueco: ahí el verde no vale nada.

Línea base: rama `main`, commit `ece77da`, `npm test` = 2,589 pasan, 0 fallan. Al terminar: **2,698 pasan, 0 fallan** (se agregaron 109 pruebas, 15 archivos nuevos `pruebas/auditoria-*.test.mjs` y 2 de apoyo).

---

## 0. La respuesta corta

- **El verde no era mentira, pero era menos de lo que parecía.** De 4,794 errores metidos a propósito, las 2,589 pruebas atraparon 79.0 %. 1,009 (21.0 %) pasaron sin que nada se pusiera rojo.
- **Lo que está sólido:** las reglas principales del dinero. De 22 errores graves puestos a mano (recorte del saldo en cero, recargo de tarjeta aplicado una sola vez en vez de por pago, pago anulado que sigue contando, porcentaje 0 % leído como «falta», descuento ignorado, días de atraso ignorados…), **21 los atrapó la suite original**. Los espías que cuidan que el número de la tarjeta nunca se guarde (ADR-001) también tienen dientes: 8 de 8.
- **Lo que no estaba:** tres huecos que cuestan dinero de verdad y que ninguna prueba veía (arriba de la lista de abajo): *el contador del número de contrato no tenía una sola prueba*; *un pago en efectivo podía guardarse con el 12 % de la tarjeta*; *los seguros por día de un atraso de varios días se podían dividir en vez de multiplicar*. Los tres están cerrados.
- **Y un instrumento descalibrado:** la «nube de mentira» con la que se prueban los guardados dejaba pasar una consulta que pierde el último día del mes, una ruta vacía y un operador raro. Ya no.
- **Lo que NO medí (dicho con todas sus letras):** más de la mitad del código (57.1 %) no se midió — casi todas las pantallas y el respaldo a Excel. De las dos pantallas más grandes de cobro medí una muestra y **más de la mitad de los errores sobreviven** (casi todos en el pintado de la pantalla, que no se puede ejercitar sin navegador). Detalle en la sección 4.

---

## 1. Primero: ¿el arnés mide algo? (controles)

Por qué va primero: el 25 de octubre un agente reportó «12 mutantes, todos muertos» con un script que nunca corrió las pruebas (zsh no separaba los nombres de archivo), y un mutante que no cambiaba nada también «moría». Aquí el arnés vive fuera del repo, está escrito en Node (`child_process.spawn` con arreglo de argumentos, sin shell, así que no hay nada que separar mal), cada mutante se aplica en una copia del árbol y se registra el **código de salida real** del proceso y cuántas pruebas dice el reporte que corrió.

### Control 0 — la tubería

| Caso | Código de salida | Pruebas / pasan / fallan |
|---|---|---|
| Copia limpia, sin tocar | **0** | 2,589 / 2,589 / 0 |
| Copia + una prueba sembrada con `assert.equal(1, 2)` | **1** | 2,590 / 2,589 / 1 (la sembrada) |
| Copia + un archivo de prueba que lanza al cargar | **1** | el archivo aparece como fallado |

### Control 1 — mutantes que NO cambian nada (deben SOBREVIVIR)

| Control | Qué se hizo | Resultado |
|---|---|---|
| NOOP-A | Renombrar la variable local `escalado` en `dinero.js` (3 apariciones) | **SOBREVIVE** |
| NOOP-B | Intercambiar el orden de `pagado` y `cubierto` en `resumen()` (independientes entre sí) | **SOBREVIVE** |
| NOOP-C | Escribir `x < 0` como `0 > x` en `q()` | **SOBREVIVE** |
| NOOP-D | `base * porcentaje / 100` → `porcentaje * base / 100` | **SOBREVIVE** |

### Control 2 — mutantes que rompen algo OBVIO (deben MORIR)

| Control | Qué se rompió | Resultado |
|---|---|---|
| ROMPE-A | `x < 0` → `x > 0` en el redondeo `q()` (signo del dinero) | **MUERE** — 102 pruebas rojas, código 1 |
| ROMPE-B | Recargo de tarjeta: `1 + porcentaje/100` → `1 - porcentaje/100` | **MUERE** — código 1 |
| ROMPE-C | `saldo = subtotal - cubierto` → `subtotal + cubierto` | **MUERE** — código 1 |
| ROMPE-D | Base de comisión: `Math.max(0, …)` → `Math.min(0, …)` | **MUERE** — código 1 |
| ROMPE-E | `throw` al cargar `dinero.js` (prueba que la copia es lo que se ejecuta) | **MUERE** — `dinero.test.mjs` no carga |

Los nueve controles se corrieron **dos veces**: con la primera versión del arnés y otra vez con la versión final (la que corre un archivo de prueba a la vez y se detiene en el primero que falla). Mismo resultado. Además se repitieron con la versión final **80 resultados escogidos al azar** de las corridas anteriores (50 muertos y 30 sobrevivientes): **80 de 80 coinciden**.

### Cómo se decide cada resultado
Un mutante **muere** solo si algún archivo de prueba salió con código distinto de cero. **Sobrevive** solo si *todos* los archivos de prueba que lo alcanzan (por `import`, directo o indirecto, o porque nombran el archivo) y los que escanean el árbol de fuentes corrieron con código 0 **y** el reporte contó exactamente las pruebas de la línea base de cada archivo (si el conteo cambia es «anomalía», no sobreviviente). Un error del arnés nunca cuenta como muerto. Un mutante que se queda en un ciclo infinito (se mata el grupo entero de procesos al vencer el tiempo) cuenta aparte.

### Tropiezos del propio arnés (porque el informe tiene que ser honesto sobre sí mismo)
1. Dos corridas usaron los mismos directorios de trabajo a la vez: **80 resultados salieron «error del arnés»** (no «muertos»; el arnés los marcó por no coincidir el texto del archivo). Se descartaron y se repitieron.
2. Una tanda corrió sobre el árbol de trabajo cuando ya traía pruebas nuevas mías: sus **59 resultados se repitieron** sobre el commit puro `ece77da` (toda la línea base se midió sobre `git archive ece77da`, nunca sobre pruebas posteriores).
3. Los mutantes con ciclo infinito dejaban procesos huérfanos girando y saturaron la computadora (carga de 40): se arregló matando el grupo de procesos entero.

---

## 2. Lo que sobrevivió y se cerró (ordenado por lo que te habría costado)

Cada fila es un error metido a propósito que **las 2,589 pruebas dejaron pasar** y que ahora una prueba nueva atrapa (falla con el error puesto, pasa con el código bueno; cada una se probó mutante por mutante antes de commitearla). «Qué te habría pasado» es lo que le ocurriría al negocio si ese error fuera real.

| # | Qué sobrevivió | Qué te habría pasado | Commit |
|---|---|---|---|
| 1 | **El contador del número de contrato no tenía NINGUNA prueba** (`siguienteNumeroContrato`): borrar su escritura, restarle uno, o arrancarlo en 1 en vez de 0 | Todos los contratos nuevos saldrían con el mismo número en el papel que firma el cliente (o el primero con el 2). Ese número es el que cruzas con la hoja membretada que ya trae su número rojo: el sistema y el papel se separarían sin avisar y buscar un número impreso traería el contrato de OTRO cliente | `eec2e2a` |
| 2 | **Un pago en efectivo al sacar el carro podía guardarse con el 12 % de la tarjeta** (`construirContrato`: se quitaba «solo si la forma es tarjeta») | El formulario trae el 12 % escrito de arranque. Cada pago en efectivo quedaría registrado como si el cliente hubiera pagado 12 % más de lo que entregó: en una renta de Q2,800, el saldo saldría **Q336 de menos**. No había ninguna prueba con efectivo y un porcentaje distinto de cero | `2c4e170` |
| 3 | **Seguros por día de un atraso de varios días:** `×` por `÷` | Al cliente que se atrasa 3 días con seguros de Q75/día se le cobrarían Q25 en vez de Q225 (**Q200 de menos por renta**). Con 1 día de atraso da lo mismo, y todas las pruebas usaban 1 | `5137401` |
| 4 | Pago a un dueño de **dos rentas** donde una se reabre y crece: la diferencia entraba a «Por pagar» con que **una sola** estuviera cerrada (`every` → `some`) | Le pagas al dueño del carro sobre una cifra que todavía puede cambiar | `6cdbe2b` |
| 5 | Un grupo con una renta cuyo **costo no se pudo leer** afirmaba «se le pagó de más» (`some` → `every`) — en la ficha **y en el papel** | La ficha (y el comprobante, que sale de la empresa) te dice que le pagaste de más Q1,200 a un dueño; descuentas del siguiente pago plata que sí le debes. En el papel también salía «el detalle ya no suma» sin que nada hubiera cambiado | `6cdbe2b`, `42d7e86` |
| 6 | En el comprobante a un dueño, una **diferencia con una sola renta sin costo anotado** se imprimía con una cifra (y con el total) armada sobre un dato que falta | El papel firmaría «te debo Q3,600» sobre un costo que nadie escribió | `42d7e86` |
| 7 | **La consulta por rango de fechas** que lee Contratos (`<=` → `<`) y la copia local de esta computadora (no se guardaba lo que trae la nube, no se quitaba lo que la nube ya borró, y se avisaba aunque no hubiera nada nuevo) | Contratos que salieron el **último día del mes** desaparecen de la lista —y la copia local los da por borrados—; una pantalla que muestra lo viejo; contratos fantasma que ya no existen | `1917741`, `1d16b05` |
| 8 | **Recibir el carro el mismo día que salió** se bloqueaba con `<` por `<=`; un **descuento que deja el cobro en Q0.00** (cortesía total) también | No podrías cerrar ninguna renta de un día que regresa en la tarde, ni registrar una renta regalada | `5137401` |
| 9 | **Liberar la garantía:** el camino bueno no tenía prueba (condición invertida, o guardar `garantiaLiberada: false`); `puedeLiberarse` con `saldo > 0` → `> 1` | Aprietas «Liberar garantía», dice que sí y no libera nada (o nunca deja liberar). Y un cliente que debe hasta Q1.00 se lleva su garantía: la regla «no la libero hasta que me pague» con un hueco | `46f38bd` |
| 10 | **Un carro con UN día de atraso se veía «rentado, a tiempo»** (`atraso > 0` → `> 1`); un contrato con hasta Q1.00 por cobrar aparecía «cerrado» (`saldo <= 0` → `<= 1`) | El atraso más común no se marcaba en el mostrador; y de «cerrado» salen lo que se le paga al dueño del carro y a quien rentó | `f3b7ccf` |
| 11 | **Avisos de salida:** la licencia que venció AYER no avisaba (`> 0` → `> 1`); el último día que sirve sí avisaba (`>= 0`); un cliente que debía Q0.50 no se avisaba | Le rentas el carro a alguien sin licencia vigente sin un solo aviso | `a91fec1` |
| 12 | **Mantenimiento:** «la lectura está incompleta» (`falloFlota \|\| falloContratos`) con `&&` | Si solo falló UNA de las dos lecturas la ficha decía «al día» como si lo supiera todo | `014d981` |
| 13 | **Cancelar una reservación** (`cancelarReserva`): sin `return`, o guardando `cancelada: false` | El botón no cancela y no avisa | `46f38bd` |
| 14 | `construirReserva` no probaba que días, precio y anticipo se guarden como número redondeado; «hay cambios sin guardar» comparaba números como texto; la capacidad por tipo, cuando la búsqueda se rinde, decía «ya no cabe» en vez de «no se pudo comprobar» | El anticipo que se descuenta al sacar el carro podía quedar como texto sin redondear; un falso «guarda antes de sacar el carro»; un falso «te quedas sin carro» | `f3b7ccf` |
| 15 | **El papel del contrato:** la tabla de días por mes aceptaba un 31 de abril o un 30 de febrero; el aviso «esto se sale de su casilla/del papel» perdía una orilla o dejaba de bajar de renglón en direcciones y nombres largos | Un contrato impreso con una fecha que no existe; un nombre largo fuera de su casilla sin aviso | `7e084cb` |
| 16 | **Un calendario de enero salía vacío** con un solo cambio (`mes < 1` → `<= 1`): ninguna prueba abría enero | Pantalla de enero en blanco. `diasEntre` devolvía NaN con una sola fecha ilegible, y NaN se cuela en los cobros | `7e084cb` |
| 17 | **Comprobante a un dueño:** un descuento de menos de un quetzal no salía en el papel; la nota «de los cuales Q0.00 ya se le habían pagado de más» podía aparecer en un pago sin descuento; una copia del pago no se reconocía dentro de su grupo (el papel no decía que completaba otro comprobante); la lista de 3 comprobantes anteriores, «1 renta/2 rentas», el orden de filas, y **el botón de imprimir** (borrar la llamada a `imprimir()` dejaba todo en verde) | El total pagado no cuadra con las rentas; una cifra sin explicación en un papel que sale de la empresa; el botón no imprime | `42d7e86` |
| 18 | **Lo que `datos.js` escribe:** el sello `actualizado` de un cambio podía quedarse pegado en vez de avanzar con el reloj (la copia de otra computadora le ganaba); enlazar rentas a un dueño o empleado intentaba escribir un documento «contratos/» con un id vacío; un pago de menos de Q1.00 se rechazaba como si fuera Q0.00; el mensaje de «no se puede pagar» mezclaba las rentas sin costo anotado con las que no se pudieron leer; la migración del costo del dueño reemplazaba `privado/dinero` entero en vez de mezclarlo; las guardias de «nunca pisar un costo que ya está» contaban un costo de menos de Q1.00 como si no hubiera | Dinero detrás de la contraseña que se borra o se pisa en silencio; un pago chico que no se puede registrar | `a8e0e71` |
| 19 | Una diferencia con un dueño de **menos de Q1.00** se leía como «a mano»; el aviso «tu pago de comisión cambió» salía para pagos sin rentas; el orden de las listas de rentas, pagos y comisiones y sus desempates | Una deuda de Q0.50 sin ver; un aviso falso; pagar por quincena y confundirte de renglón | `6cdbe2b`, `a280380` |
| 20 | Buscador: «es el número de este contrato» devolvía verdadero con dos palabras; la búsqueda vacía podía no encontrar nada | El número rojo del papel traía contratos que no eran | `e3f6831` |
| 21 | Un contador de comprobantes dañado daba `NaN`; la lista de empleados sin lista tronaba; un id vacío en la lista de rentas de un pago descomponía el aviso, el comprobante o la ficha del dueño | Un comprobante con número `NaN`; una pantalla rota | `a280380` |

Además, **una prueba que no mata ningún mutante pero cierra una brecha de medición** (está a propósito): *el ejemplo del diseño (Q4,345.60) armado con los constructores de verdad* (`344576d`). La prueba que manda del dinero usaba un objeto escrito a mano; si un constructor cambiara el nombre de un campo que el cobro lee, esa prueba seguiría verde.

### Un instrumento descalibrado (el hallazgo más peligroso, aunque no es un error del sistema)

La «nube de mentira» (`pruebas/fixtures/nubeEnMemoria.mjs`) con la que se prueban los guardados aceptaba cosas que la de verdad rechaza o evalúa distinto:
- `doc(db, 'contratos', undefined)` (una ruta vacía) pasaba;
- `where(…, '<', …)` y cualquier operador distinto de `>=` se evaluaba como `<=` **en silencio** — una consulta que dejaba fuera el último día del mes habría pasado las 2,589;
- sus instantáneas de un documento no traían `id`, así que `cargarContrato` podía devolver un contrato con `id: undefined` sin que nada se enterara.

Ya lanza en los dos primeros casos, evalúa `<`, `<=`, `==`, `>=`, `>` y `!=` como la de verdad, y trae el `id` (`1917741`, `1d16b05`). Es el caso que más cuesta de ver: una suite entera «verde» porque el instrumento no medía.

### Un defecto latente (el único error vivo que apareció)

- **Latente, sin cerrar (decisión tuya):** `q()` (`js/nucleo/dinero.js`) devuelve `-0` para un negativo diminuto como `-5.55e-17` (la rama de números con exponente no normaliza el cero como sí lo hace la rama normal), y `textoDosDecimales(-5.55e-17)` imprime `-0.00`. Hoy ningún camino lo alcanza (toda cifra ya pasa por `q()` con dos decimales antes de restarse), así que **no lo toqué**; la prueba `auditoria-dinero` compara con `== 0` a propósito. El arreglo es de una línea.

---

## 3. Errores vivos en el código (lo que estaba MAL de verdad) — lista aparte

Esta lista y la de la sección 2 son distintas. La 2 dice «ninguna prueba lo vigilaba»; esta dice «el código hacía algo mal». **Hasta donde llegó la auditoría, la lista de errores vivos está casi vacía: todo lo que apareció fue un hueco de prueba.** Eso es una buena noticia, y hay que decirla tal cual.

### 3.1 El caso del 12 % en efectivo — era un hueco de prueba, NO un error vivo

`construirContrato` (`js/pantallas/sacarCarro.js:209`) guarda el porcentaje de tarjeta solo si la forma de pago es tarjeta (`forma === 'tarjeta' ? q(porcentajeTarjeta) : 0`). Esa condición **está en el código y estuvo desde el 25 de septiembre** (commit `733d4c1`, donde solo se le cambió el nombre al campo). Lo que la auditoría encontró es que **nadie la vigilaba**: al quitarla a propósito, las 2,589 pruebas seguían en verde. El formulario trae el 12 % escrito de arranque, así que si esa condición se perdiera algún día, cada pago en efectivo quedaría guardado con 12 %.

Revisé todos los lugares que escriben un porcentaje de tarjeta en un pago: `construirContrato` (`sacarCarro.js:209`), `conAnticipoComoPago` (`sacarCarro.js:676`) y los tres cobros de `recibirCarro.js` (`:713`, `:782`, `:836`), y **los cinco llevan la condición**. No encontré ningún camino que guarde un pago en efectivo con porcentaje.

**Si alguna renta ya salió así (no tengo cómo saberlo: no leí la base de datos real, nunca me autentiqué contra Firebase):** en el detalle del contrato, la tabla de pagos tiene las columnas *Forma*, *Monto*, *% de tarjeta* y *Cobrado*. Un pago con *Forma = Efectivo* y un *% de tarjeta* distinto de «—» (y un *Cobrado* mayor que el *Monto*) es la señal. Por lo que dice el código y el historial de git, no debería existir ninguno.

### 3.2 El único defecto vivo: `-0.00` (latente, no cobra mal hoy)

Ver la sección 2, «Un defecto latente». `q()` devuelve `-0` para un negativo diminuto (menos de un milésimo de centavo, como `-5.55e-17`, el residuo de `0.3 - (0.1 + 0.2)`) y `textoDosDecimales` lo imprimiría como `-0.00`. **Ningún camino actual lo alcanza** (toda cifra ya pasa por `q()` con dos decimales antes de restarse), así que no cobra ni muestra mal hoy. No lo toqué porque es dinero y no era lo que se me pidió; el arreglo es una línea en la rama de números con exponente (`return redondeado === 0 ? 0 : …`). Rentas afectadas: ninguna.

### 3.3 Instrumentos de medición descalibrados (no son errores del sistema)

Los tres de la «nube de mentira» de la sección 2. Son los que más cuestan de ver porque no se notan como error: una consulta que perdía el último día del mes habría pasado todas las pruebas.

---

## 4. Cuánto del sistema medí de verdad y cuánto NO

Con esas palabras, porque es lo único que le dice cuánto vale el número verde:

> **Medí a fondo poco más de una cuarta parte del código (28.3 %): todo lo que decide dinero, lo que no se puede perder o pisar, las reglas de pantalla del mostrador y los papeles.** De otro 12.8 % (las dos pantallas de cobro, «Sacar carro» y «Recibir carro») medí una muestra de 400 errores, y **más de la mitad sobrevive (246 de 400)**. Y **no medí el 57.1 %**: casi todas las demás pantallas y el respaldo a Excel. **El número verde de 2,589 (hoy 2,698) dice poco sobre ese 57 %.**

«Código» = líneas ejecutables de `js/` (sin comentarios ni líneas en blanco): 13,872 líneas.

| | Líneas | % | Qué es |
|---|---:|---:|---|
| **Medido a fondo** (todos los errores que mi generador produce) | 3,929 | 28.3 % | `dinero`, `contrato`, `cierre`, `comision`, `comisiones`, `liquidacion`, `datos`, `estados`, `reserva`, `asignacion`, `historial`, `avisos`, `mantenimiento`, `empleado`, `busqueda`, `lecturas`, `hojaContrato`, `comprobante`, `comprobanteComision`, `carro`, `cache`, `fechas`, `calendario` |
| **Muestra** | 1,782 | 12.8 % | `sacarCarro.js` y `recibirCarro.js` (400 de 1,349 errores, escogidos al azar con semilla fija), y los espías de la tarjeta (`traspasoDeTarjetas.js`, 9 errores a mano) |
| **Solo unos cuantos tipos de error** | 246 | 1.8 % | `cliente`, `dueno`, `repetidos`, `buscadorGeneral` (solo quitar filtros/órdenes/límites y cruzar fechas) |
| **NO medido** | 7,915 | 57.1 % | ver abajo |

**Lo que NO se midió**, de mayor a menor: `pantallas/dinero.js` (1,221 líneas: el área de dinero), `pantallas/comisiones.js` (1,122), `pantallas/contratoImpreso.js` (666: la pantalla que imprime el contrato; sí se midió `hojaContrato.js`, que decide dónde cae cada dato), `pantallas/contratos.js` (506), `reservas.js` (470), `carros.js` (391), `clientes.js` (347), todo el respaldo a Excel (`js/respaldo/*`, ≈ 960), `calendario`, `buscador`, `mantenimiento`, `respaldo`, `flota`, `empleados`, `duenos` (pantallas), y `app.js`, `auth.js`, `router.js`, `ui.js`, `dinero-sesion.js`, `firebase-config.js`.

**Lo que esos números NO dicen todavía** (para no prometer de más):
- Medir una función no la demuestra correcta: dice que *si alguien la rompe de las maneras que mi generador sabe romper, una prueba se pone roja*. Un error que ya está en el código y que nadie especificó, no lo veo.
- En las pantallas de cobro medidas por muestra, **193 de los 247 errores que sobreviven están en el «pintado» de la pantalla** (`pintarSacarCarro`, `pintarRecibirCarro`: la conexión entre lo que teclea el mostrador y las funciones de cobro). Esas funciones de cobro sí están medidas y vigiladas (cuentas, recargo, anticipo); el cableado no se puede ejercitar en Node sin navegador, y unas 55 lecturas de pruebas del proyecto miran el *texto* del código en vez de ejecutarlo (confirmar que una pantalla llama a algo no confirma que funcione).
- Los sobrevivientes que quedan en lo medido a fondo están clasificados abajo; no todos son «equivalentes».

---

## 5. Lo que sigue vivo en lo medido a fondo (después de las pruebas nuevas)

De 4,394 errores en lo medido a fondo, las 2,589 pruebas dejaron pasar 762 (17.3 %); las pruebas nuevas matan 270; **siguen vivos 492 (11.2 %)**:

| Qué son | Cuántos | Costo para él |
|---|---:|---|
| **Equivalentes** (el «error» no cambia lo que hace el programa; una frase de razón por familia, abajo) | 300 | ninguno |
| **Envoltura de IndexedDB** (`cache.js`: guardar/leer/borrar la copia local de esta computadora) | 53 | La copia local podría dejar de guardarse y todo abriría lento; la nube sigue siendo la verdad. No hay IndexedDB en Node: haría falta un doble del navegador |
| **Frases de mensajes** (singular/plural, «y N más», la fecha dentro de un mensaje) | 27 | Una frase mal escrita |
| **Huecos reales de bajo costo sin cerrar** | 112 | ver la lista |

**Huecos reales sin cerrar, de más a menos caro:**
1. **La caché de sesión de clientes y de dueños** (`buscarClientes`, `buscarDuenos`; ≈ 20): la regla «si la primera sincronización no trae nada, se olvida para reintentar» no tiene prueba (no se le puede inyectar la nube). Costo: con el internet caído al primer intento, la caja de clientes podría quedarse vacía toda la sesión y el mostrador daría de alta a quien ya existía.
2. **Los caminos de error y de aviso de `datos.js`** (≈ 20): que salga el aviso «Quedó guardado en la nube, pero puede que aquí tarde en verse», que se limpie el temporizador de 8 segundos, los `console.warn`. Costo: un aviso que no aparece.
3. **La migración única del costo del dueño** (≈ 12): conteos y frases en singular/plural, y el caso de un contrato que solo trae el costo en una de sus dos llaves. Costo: bajo (se corrió una vez).
4. **Mantenimiento** (15): `intervalos` defensivos y el texto de «recibido el…». Costo: una frase.
5. **Comprobante a un dueño** (17): la nota de «cambió» con descuento menor de Q1.00, las advertencias de pantalla («sin costo anotado»), y la ruta defensiva de un pago sin lista. Costo: una nota o un aviso de pantalla (no el papel en sí).
6. **Avisos** (3): la lista con un solo nombre en el aviso de reservaciones sin carro («A, B y C» con 1 elemento). Costo: una frase.

### Por archivo

| Archivo | Mutantes | Mueren (prueba roja) | Mueren por ciclo/tiempo | Sobreviven (2,589 originales) | Las pruebas nuevas matan | Siguen vivos |
|---|---:|---:|---:|---:|---:|---:|
| `js/datos.js` | 846 | 637 | 9 | 200 | 81 | 119 |
| `js/pantallas/sacarCarro.js` | 285 | 105 | 1 | 179 | 0 | 179 |
| `js/pantallas/comprobante.js` | 358 | 256 | 12 | 90 | 38 | 52 |
| `js/pantallas/recibirCarro.js` | 115 | 47 | 0 | 68 | 0 | 68 |
| `js/nucleo/liquidacion.js` | 285 | 222 | 3 | 60 | 30 | 30 |
| `js/nucleo/comisiones.js` | 287 | 229 | 0 | 58 | 25 | 33 |
| `js/nucleo/hojaContrato.js` | 566 | 508 | 1 | 57 | 18 | 39 |
| `js/nucleo/mantenimiento.js` | 482 | 425 | 2 | 55 | 14 | 41 |
| `js/cache.js` | 126 | 66 | 5 | 55 | 0 | 55 |
| `js/nucleo/reserva.js` | 297 | 263 | 3 | 31 | 17 | 14 |
| `js/nucleo/asignacion.js` | 126 | 95 | 6 | 25 | 0 | 25 |
| `js/pantallas/comprobanteComision.js` | 83 | 63 | 0 | 20 | 0 | 20 |
| `js/nucleo/fechas.js` | 147 | 127 | 0 | 20 | 9 | 11 |
| `js/nucleo/empleado.js` | 132 | 109 | 4 | 19 | 7 | 12 |
| `js/nucleo/avisos.js` | 133 | 120 | 0 | 13 | 6 | 7 |
| `js/nucleo/dinero.js` | 61 | 49 | 0 | 12 | 8 | 4 |
| `js/nucleo/busqueda.js` | 67 | 55 | 0 | 12 | 2 | 10 |
| `js/nucleo/estados.js` | 69 | 61 | 0 | 8 | 5 | 3 |
| `js/nucleo/cierre.js` | 58 | 51 | 0 | 7 | 6 | 1 |
| `js/nucleo/calendario.js` | 81 | 73 | 1 | 7 | 2 | 5 |
| `js/nucleo/contrato.js` | 92 | 86 | 0 | 6 | 2 | 4 |
| `js/nucleo/historial.js` | 43 | 41 | 0 | 2 | 0 | 2 |
| `js/nucleo/carro.js` | 13 | 11 | 0 | 2 | 0 | 2 |
| `js/nucleo/cliente.js` | 2 | 0 | 0 | 2 | 0 | 2 |
| `js/pantallas/traspasoDeTarjetas.js` | 9 | 8 | 0 | 1 | 0 | 1 |
| `js/nucleo/comision.js` | 18 | 18 | 0 | 0 | 0 | 0 |
| `js/nucleo/lecturas.js` | 9 | 9 | 0 | 0 | 0 | 0 |
| `js/nucleo/repetidos.js` | 4 | 4 | 0 | 0 | 0 | 0 |
| **Total** | **4794** | **3738** | **47** | **1009** | **270** | **739** |

Notas: «Mueren por ciclo/tiempo» son errores que dejan el programa en un ciclo infinito (la suite se colgaría; cuenta como detectado pero es evidencia más débil). Las dos filas de pantallas son una **muestra** (400 errores) y no se volvieron a medir tras las pruebas nuevas, salvo uno que se cerró a mano (el 12 % en efectivo). `datos.js` trae 9 pruebas-de-medición extra que no son del arnés base. La suma de «sobreviven» incluye 247 de la muestra de pantallas; sin ella, 762 en lo medido a fondo.

**Las razones de las familias equivalentes (una frase cada una):**
- *Un valor ausente contra uno vacío* (`x ?? ''` por `x || ''` y al revés, 147): difieren solo si el valor es `0`, `''` o `false` sin ser nulo; en esos campos el valor es texto, lista, objeto o ausente, nunca un cero ni un `false`.
- *Los dos lados de una resta con el mismo valor por omisión* (`(Number(a.n) || 0) - (Number(b.n) || 0)`, 9): el mismo valor en ambos lados se cancela.
- *Un ordenamiento solo distingue «menor» de «no menor»* (20): cambiar lo que devuelve un comparador cuando son iguales o mayor no cambia el orden (lo probé con listas de hasta 40 elementos).
- *Orden y poda de la búsqueda de asignaciones* (`asignacion.js`, 25): cambian cuántos pasos da la búsqueda, no el resultado (la búsqueda es exhaustiva con poda correcta).
- *Un id o una palabra vacía en un Set, un Map o un includes* (13): nunca se consulta.
- *Tamaño de letra de textos fijos que no se imprimen y casillas de una sola línea* (`hojaContrato.js`, 26): lo que se imprime son solo los datos; en una casilla de una línea, `ajusta` da lo mismo.
- *Revisados uno por uno* (60): por ejemplo `q()` con `x < 0` frente a `x <= 0` (el cero ya regresó antes), `maximumFractionDigits` de 2 a 3 (el monto ya trae dos decimales), `'conflicto'` por `undefined` en la migración (el que llama solo compara con `'movido'`), un `<` por `<=` en un ciclo de lotes (un lote vacío de más), días de un mes que las fechas ya validan por otro lado.

---

## 6. Pruebas de teatro, y qué hice con cada una

- **Instrumento descalibrado** (corregido): la nube de mentira, tres huecos (sección 2).
- **`escrituras()` de la nube de mentira ignora las escrituras en transacción y por lote.** Las pruebas que dicen «no se escribió nada» con `escrituras().length === 0` son válidas para lo que se guarda con `setDoc` (casi todo), pero no verían una escritura por `tx.set` o `commit`. Lo probé: incluir `tx.set` rompe cuatro pruebas que cuentan escrituras exactas. Todas las negativas que revisé están acompañadas de una prueba del estado final o de `escriturasEnTransaccion()`, así que **no encontré una que pase vacía**; lo dejo anotado.
- **`respaldo-paridad.test.mjs`** evalúa las fórmulas de su hoja con una réplica escrita a mano (`laHojaCalcula`), no con Excel; fija el *texto* de las fórmulas, pero si alguien cambia la réplica y el texto a la vez, la prueba seguiría verde. La cabecera del archivo lo dice. Sin cambio.
- **Objetos de contrato escritos a mano** en `contrato.test.mjs`, `comision.test.mjs`, `estados.test.mjs`, `contratos.test.mjs`, `datos.test.mjs` y `calendario-pantalla.test.mjs` (unas 60 líneas con `dias:`/`precioDia:`): si un constructor cambiara el nombre de un campo, esas pruebas seguirían verdes. Cerré el caso principal (`344576d`: el ejemplo del diseño con constructores de verdad); el resto lo dejo.
- **Pruebas que leen el *texto* del código** (unas 55 lecturas con `leerFuente`/`readFileSync` sobre `js/`): confirman que una línea existe, no que funcione. Ejemplo: «`recibirCarro.js` contiene `aviso(textoFalloAlRegistrarElAbono(error), 'error')`». Sin cambio.
- **Un ciclo con `continue` y sin contador** en `hoja-contrato.test.mjs` («el tamaño de letra de cada campo…»): probé que **no** es vacío (los errores en `pt` de campos que sí se imprimen mueren); el vecino «cada campo cae donde Excel recorta» sí lleva su contador (`comparados >= 60`).
- **Los espías de la tarjeta (ADR-001) tienen dientes**: guardar el número completo en `localStorage`, `sessionStorage`, la consola o la red, entregarlo sin borrarlo, entregarlo en el papel de otro contrato, entregarlo vencido y no borrarlo al cambiar de pantalla — los 8 mueren.
- **Mi propio teatro:** la prueba de `-0` compara con `==` a propósito (para no fijar el defecto); la del ejemplo del diseño con constructores de verdad no mata ningún mutante a propósito (es un puente, dicho en la sección 2). Dos veces escribí una aserción que no podía fallar (`|| length > 0`; una prueba de 40 elementos que no distinguía nada) y las quité al revisarlas.

---

## 7. Cambios al código de producción (solo parámetros opcionales con el mismo valor por omisión)

Para poder probar lo que no se podía, **sin cambiar lo que hace** (el valor por omisión es el de siempre), en `js/datos.js`:
`siguienteNumeroContrato({ iniciar })`, `liberarGarantia(contrato, deps)`, `cancelarReserva(reserva, deps)`, `cargarContrato(id, { iniciar, leerCopia })`, `cargarAjustes({ iniciar })`, `cargarDuenos(alLlegar, deps)` y `cargarReservas(alLlegar, deps)`. Quince líneas cambiadas, ninguna con otra lógica. Ningún otro archivo de `js/` se tocó; no toqué `version.txt` ni `js/version.js`.

---

## 8. Cómo repetirlo

El arnés vive fuera del repo (en el directorio temporal de la sesión; no es parte del sistema): genera los errores recorriendo el árbol sintáctico de cada archivo con el analizador que trae Node (`--expose-internals`), los aplica uno a uno en una **copia** del árbol (la línea base sobre `git archive ece77da`, nunca sobre el árbol de trabajo), corre los archivos de prueba que alcanzan ese archivo (por `import` o por nombrarlo) más los que escanean el árbol, de uno en uno y en el orden que más ha matado, y cuenta que cada archivo corra exactamente las pruebas que corría limpio. Operadores: `<`↔`<=`, `>`↔`>=`, `+`↔`-`, `*`↔`/`, operandos cruzados, `&&`↔`||`, `??`↔`||`, condición negada, rama del ternario, `return` vacío, sentencia borrada, número ±1, `Math.round/abs/floor` quitado, `Math.max/min` sin un argumento, predicado de `filter/find/some/every` invertido, `.filter/.sort` quitado, fechas cruzadas, y 31 errores escritos a mano (los de la lista del encargo: saldo recortado, recargo una sola vez, pago anulado que cuenta, 0 % como faltante, fechas del atraso al revés, `where` con `<`, `merge: true` quitado, id acuñado en cada intento…, más los 9 de la tarjeta).
