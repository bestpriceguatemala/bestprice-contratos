# Prueba del sistema, segunda pasada (7 oct 2026)

Continúa la prueba que cortó el límite de sesión (commits `5a4889f`..`2249aa7`, ya resueltos y **no
repetidos aquí**). Esta pasada camina el negocio desde Reservaciones hasta el calendario y el resumen del
día, y después intenta romperlo.

**Estado:** terminada. 15 commits de arreglos pequeños, cada uno con su prueba (`npm test`: de 1054 a
**1090** en verde). Quedan 10 hallazgos sin arreglar, descritos abajo con la receta para reproducirlos, porque piden
una decisión suya o son más grandes de lo que una pasada de pruebas debe tocar. **Las cifras del dinero
no se movieron en ninguna parte**: ni un solo número de §5 ni de la cadena del dueño estuvo mal.

## Cómo se probó

- **Arnés.** Copia del árbol en `scratchpad/mi-prueba/arbol` (se re-sincroniza con `sincronizar.sh` antes
  de cada medición; la línea que imprime dice el `HEAD` y cuántos archivos sucios hay), servida por
  `servidor.mjs` en `localhost:4173` con un import map que cambia las tres URL de Firebase por falsas.
  La "nube" falsa vive en el servidor, así que sobrevive a recargar y la comparten dos pestañas. Imita
  `firestore.rules` (`privado/*` y `pagosDueno` solo con la sesión de dinero), la cola de escrituras del
  SDK sin red (la promesa no se cancela cuando `conLimiteDeTiempo` se rinde) y los `undefined` que el SDK
  real rechaza. **Nunca se tocó el proyecto real ni se pidió ninguna credencial**; la contraseña de dinero
  del arnés es una constante del falso.
- El puerto 4173 estaba libre al empezar (el servidor viejo del agente anterior quedó en 4377 y no se
  usó). Al terminar, mi servidor de 4173 se apagó para no dejar otro leftover.
- Reloj falso por `localStorage.__fijo` (15, 18, 20, 22 oct; 31 oct 19:30; 1 y 2 nov). Origen nuevo
  (`[::1]:4173`) para probar con la copia local vacía.
- Al final se volvió a correr toda la historia sobre el código ya arreglado, con un recolector de errores
  de la página: 56 verificaciones y cero excepciones de la página (las 3 que quedaron en rojo eran
  expectativas mías mal escritas, no del sistema: un filtro que sí incluía una renta con saldo, una
  expresión sobre un texto que la hoja de estilos pone en mayúsculas). Esa repetición también encontró un
  error **mío**, `e059fdf`; ver abajo.

## La historia, paso por paso

| # | Paso | Resultado |
|---|---|---|
| 1 | Reservar a futuro: carro exacto (Yaris, anticipo Q500 pagado) y solo por tipo (SUV, anticipo Q300 pendiente) | Bien. Hallazgos de capacidad por tipo: H-5 y el arreglo `49b3b55`. |
| 2 | Sacar desde la reservación con anticipo pagado | Monto sugerido Q3,000.00; contrato con dos pagos (Q3,000 + Q500 fechado el día de salida); reservación «entregada». Bien. |
| 3 | Carro ajeno: dueño escogido de la lista, costo Q300/día, carta poder Q350, tarjeta al 12 % con garantía Q5,000 | **Total a cobrar Q3,528.00** (renta 2,800 + carta 350 + recargo 378.00). Costo del dueño solo en `privado/dinero`; ni el número de la tarjeta ni el CBC existen en ningún documento. |
| 3b | Otro ajeno con seguros de menores y PAI, deducible bajo, varios, garantía Q4,000 | Q2,160.00 = 1,800 + 310 + 50. |
| 4a | Recibir un carro propio ANTES de la fecha | Cierra sin cobrar, sin descuento de nada. |
| 4b | Recibir tarde (2 días) con hora tardía Q150, daños Q500, combustible Q80, descuento Q100; pago parcial Q1,000 y luego «Cobrar» Q970 con tarjeta | Devolución Q1,970.00 = 1,200 + 140 + 500 + 80 + 150 − 100. Cobrar Q970 al 12 % = **Q1,086.40**. |
| 4c | El ejemplo de §5 (1 día tarde, daños 200, combustible 130, descuento 300, tarjeta 12 %) | Pagado a la salida **Q3,528.00**; recargo Q87.60 → **Q817.60**; detalle: Subtotal **Q3,880.00**, Total cobrado **Q4,345.60**, Saldo Q0.00. |
| 5 | Liberar las dos garantías; contratos pasan a `cerrado` | Bien: «Garantía liberada. Contrato N.° X cerrado.» |
| 6 | Dinero: lista (Q2,750.00 = 300 × 5 + 250 × 5), ficha, marcar una renta («Marcado: 1 renta»), registrar, comprobante N.° 1 | Bien. El comprobante trae el total pagado y lo que queda pendiente. |
| 7 | Corregir una renta cerrada DESPUÉS de pagarle al dueño (más días de atraso) | Sin cobrar a la clienta, se niega y dice qué hacer. Cobrando en el mismo guardado: la ficha muestra la **diferencia** (Q600.00) como fila con su casilla, la lista dice «Incluye Q600.00 de rentas ya pagadas cuyo monto cambió», se paga con el comprobante N.° 2 y el papel dice «este pago completa el comprobante N° 1». Bien. |
| 8 | Calendario y resumen del día | Las cuatro cifras coinciden con un conteo aparte sobre lo guardado. Dos defectos corregidos (`55a1230`, `4adae68`). |

## Corregido (cada uno con una prueba que falla sin el arreglo)

| Commit | Qué |
|---|---|
| `55a1230` | **Calendario: «⚠ 3» en cada día que falta.** `movimientosDelDia` mide el atraso contra el día que se mira; para un día futuro eso supone que nadie regresa nunca, así que tres carros que vuelven HOY pintaban una pastilla roja en los 28 días siguientes y el detalle de un día futuro decía «Atrasado 14 días». Nuevo `movimientosParaPintar` (`nucleo/calendario.js`) vacía solo `atrasados` después de hoy; `salen` y `regresan` se quedan. |
| `4adae68` | **«Atrasados» no coincidía con su detalle.** Llevaba a los cuadros de la flota, donde un carro ajeno no tiene cuadro: dos ajenos vencidos daban «2 Atrasados» y cuatro cuadros «Disponible». Ahora lleva al calendario de hoy, cuya sección «Atrasados» es la misma lista que se cuenta y trae «Recibir carro». |
| `41c5acd` | **Dos frases que mentían en Recibir carro.** El «Cobrar» de «Pendientes de cobro» sobre una renta con el carro todavía afuera decía «El cierre de este contrato ya está hecho». Y con el cliente a favor de Q1,400 el aviso final decía «recibido y cobrado», contradiciendo a la pantalla de un segundo antes. Cambia la expectativa de dos pruebas viejas que fijaban esa frase. |
| `75e57b1` | **Anticipo de Q5,000 en una renta de Q1,400.** Con «Ya pagó» marcado, la salida lo descontaba, dejaba el monto en Q0.00 y no decía nada; el contrato salía con un pago de Q5,000 y Q3,600 a favor del cliente (un pago que nadie hizo, por un cero de más en la reservación). Mismo aviso que ya da «cobrar de más». |
| `1cb6814` | **Fecha de entrada en el futuro.** «2062» por «2026»: 13,149 días de atraso, «Falta cobrar Q8,546,850.00» ya escrito en «Monto», y «Recibir y cobrar» lo registraba como pagado. Un carro no se recibe mañana. |
| `081deb2` | **Carro fuera de servicio.** Sin botón «Sacar» en la flota, pero el «Sacar carro» de una reservación que lo apartó antes del taller (calendario y ficha) lo abría sin decir nada. `avisosDeSalida` recibía el carro y no lo miraba. |
| `49b3b55` | **Capacidad por tipo.** «Cambiar la unidad» deja el tipo escrito como estaba: una reservación «Sedán» con la Ranger (pickup) contaba contra los sedanes (aviso falso) y dejaba libre la única pickup. Ahora manda el tipo real del carro asignado. |
| `e059fdf` + `c0e9e44` | **Fecha de un cobro al corregir un cierre.** Un cobro de Q1,400 hecho hoy quedó fechado el 22 de octubre (la fecha tecleada en el campo de entrada). Ahora se fecha hoy. **`e059fdf` tuvo un error mío**: leía `campos.fechaReal` siempre y el «Cobrar» de «Pendientes de cobro» (donde `campos` es null) dejó de responder; las 1074 pruebas no lo vieron y la repetición de la historia en el navegador sí. `c0e9e44` lo arregla y agrega la prueba que lo habría atrapado. |
| `d065902` | **«Liberar garantía» sin red** decía «La nube no respondió a tiempo.» (sin decir qué hacer; con una sesión vencida habría salido el inglés del SDK). Ahora «No se pudo liberar la garantía. Revisa tu conexión e intenta de nuevo.»; el rechazo por saldo conserva su frase con la cifra. |
| `6425321` | **«Sin resultados.» en Contratos** el 2 de noviembre al buscar a un cliente que salió en octubre y sigue afuera: la lista trae solo el mes de la salida y no lo decía. Ahora dice el rango y qué cambiar. |
| `9d8ce92` | **«Historial de rentas» con una fila de cuatro.** La ficha del cliente solo carga contratos abiertos; el título prometía el historial. Pasa a «Rentas abiertas» con una línea que manda a Contratos. (El arreglo de fondo es H-4.) |
| `ba3025c` | **Días con decimales y montos negativos.** «2.5 días» cobraba 2.5 × el precio y calculaba la devolución con 2. «Varios -200» era un descuento escondido en una línea de cobro; en Recibir carro «Daños -300» bajaba la cuenta y «Descuento -100» salía como «Descuento Q100.00» en positivo que **cobraba de más**. Los campos ya declaraban paso 1 y mínimo 0; ahora el código lo exige. |
| `d264132` | **Reservación de −3 días a −Q500 con −Q100 de anticipo** se guardó, con la devolución antes de la salida. Mismo defecto que `ea466ee` atacó en la salida. |
| `73bed06` | **Pago a un dueño fechado en el futuro** («2062»). Como no hay dónde corregir un pago guardado, se quedaba así. |

## Hallazgos que NO se arreglaron, de más a menos grave

### H-1. Dos pestañas (o dos computadoras) cobrando la misma renta: un pago SE PIERDE en silencio
**Repro (dos pestañas del mismo navegador, probado).** Contrato N.° 4 con saldo Q1,700. Las dos
pestañas abren `#/recibir/<id>?cobro=1`. La A cobra Q500: «Abono registrado… Falta cobrar Q1,200». La B
(que sigue mostrando «Falta cobrar Q1,700») cobra Q300. Lo guardado: `pagos = [1000, 300]`. **Los Q500 de
la A desaparecieron**: el cliente entregó Q1,800 y el sistema dice Q1,300.
**Causa.** `agregarPago` arma `pagos` sobre el contrato que la pantalla tenía en memoria y
`guardarContrato` lo escribe con `setDoc(merge:true)`; Firestore reemplaza el arreglo entero. Nada vuelve
a leer la nube ni compara `actualizado`. Vale igual para anular un pago, liberar una garantía o corregir
un cierre desde una copia vieja: p. ej. liberar la garantía desde una lista vieja pisa con el cierre viejo
los daños que otra pestaña acababa de agregar.
**Por qué se deja.** Es una decisión de qué hace el sistema con una copia vieja (¿se niega y pide
recargar?, ¿se mezcla el arreglo?) y toca el único punto que escribe contratos. Una forma concreta, si la
quiere: dentro de `guardarContrato`, para un contrato que ya trae `actualizado`, leer el documento y negarse
si el de la nube es más nuevo, con un código propio (como `CODIGO_GARANTIA_LIBERADA_CON_SALDO`) y una
frase en cada pantalla que guarda contratos (Recibir, Cobrar, Anular, Liberar), porque «intenta de nuevo»
no sirve: la copia en memoria sigue vieja. **Gravedad alta (dinero que desaparece); probabilidad baja con
una persona y una pestaña, y sube con dos computadoras.** No está en el ledger: el diferido que sí está es
pagarle a un DUEÑO desde dos pestañas, y ese ya se detecta («Mientras tanto cambió la cuenta de este dueño…»;
lo probé con dos pestañas y la segunda no registra nada).

### H-2. Con internet lento, «No se pudo guardar. Intenta de nuevo» y el reintento duplica la reservación, el cliente (y el carro y el dueño)
**Repro (red caída, luego vuelta).** Se llena «Nueva reservación» (o «Nuevo cliente») y se guarda sin red.
A los 8 s sale «No se pudo guardar la reservación. Intenta de nuevo.» Vuelve la red: la primera escritura,
que el SDK mantiene en cola, **sí llega** (1 documento). Él aprieta otra vez porque leyó «intenta de
nuevo»: **2 documentos**. Para el cliente quedan dos fichas con el mismo DPI.
**Causa.** El contrato y el pago a dueño acuñan su id una vez por intención (`nuevoIdContrato`,
`nuevoIdPagoDueno`) y el reintento cae en el mismo documento. Reservaciones, clientes, carros y dueños no:
`guardarEnNubeYLocal` hace `doc(collection(...))` en cada intento.
**Por qué se deja.** El patrón es conocido, pero son seis lugares (`reservas.js`, `clientes.js`,
`carros.js`, `duenos.js` y las dos altas rápidas de `sacarCarro.js`), cada uno con su ciclo de «después de
guardar se limpia el formulario». Si el id acuñado se reutilizara DESPUÉS de un guardado bueno, la alta
siguiente pisaría a la persona anterior, que es peor que el duplicado. Pide su propio plan con una prueba
por pantalla.

### H-3. Dos pestañas sacando el carro de la misma reservación: dos contratos, dos anticipos
**Repro.** Reservación pendiente con anticipo pagado de Q400. Las dos pestañas abren
`#/sacar/v3?reserva=<id>` y guardan: contratos N.° 6 y N.° 7 del mismo carro, los dos con
`pagos = [1200, 400]` (el anticipo registrado dos veces), y la reservación apunta al 7; el 6 queda
huérfano. **Causa:** `guardar()` usa la reservación y la disponibilidad que leyó al abrir. Mismo origen
que H-1. (Un clic repetido SÍ está cubierto.)

### H-4. «Este cliente ya devolvió tarde» y la alerta «Devolvió tarde» casi nunca se prenden
Las dos miran solo los contratos **abiertos** (`cargarContratosAbiertos`). Un cliente que devolvió tarde y
ya pagó y cerró (el caso normal) no avisa. Probado: Juan devolvió 3 días tarde (contrato cerrado) y al
sacarle otro carro no sale nada. El comentario de `clientes.js` lo sabe («la Tarea 8 … se
apoyará en eso cuando exista») y nunca se cableó; no está en el ledger. Arreglarlo de verdad pide una
lectura por cliente que hoy no existe (`where('clienteId','==',id)`) y decidir cuánto historial se trae.
Mientras tanto la ficha ya no promete un historial completo (`9d8ce92`).

### H-5. Reservaciones: el aviso por tipo se equivoca en las dos direcciones
- **Aviso falso.** Con 2 sedanes y las reservaciones A (carro exacto, 15–20 oct) y D (por tipo, 21–24
  oct), que no se tocan entre sí, apartar un sedán del 14 al 25 dice en rojo «Tienes 2 Sedán y los 2 ya
  están comprometidos». Es falso: el segundo sedán está libre. `choquesDeReserva` cuenta cuántas
  reservaciones del tipo tocan el rango, no cuántas coinciden el mismo día.
- **Aviso que falta.** Una reservación por carro exacto (Ranger, 3–5 nov) NO avisa de una reservación
  «Pickup» sin carro (3–5 nov) que ya tiene la única pickup: el exacto solo mira otras reservaciones con
  ese mismo `carroId`.
No se arregló: el arreglo correcto no es contar el máximo simultáneo (con v1 ocupado 1–5 y v4 ocupado 6–10
no hay un carro libre para 1–10 aunque nunca haya más de uno ocupado a la vez). Es un problema de
asignación, y qué tan estricto o laxo quiere el aviso es decisión suya.

### H-6. No hay forma de deshacer un pago a un dueño
El pago a un cliente se anula (con rastro); el pago a un dueño no: ni editar, ni anular. Si registra las
rentas equivocadas o la forma equivocada, esas rentas salen de «por pagar» (una deuda que se lee como
cero) y la única salida es tocar Firestore a mano. Lo protege el paso doble («Registrar pago» → «Guardar
pago de Q…») y, desde `73bed06`, la fecha futura. El comentario de `problemaDeLaFechaDelPago` ya lo dice
(«no hay dónde corregir un pago ya guardado»). Pide su propio diseño (¿anular con rastro y que el número
de comprobante queda?).

### H-7. Una renta corregida HACIA ABAJO después de pagarle al dueño deja un pago de más que nadie ve
Corregí la renta N.° 2 de 3 días de atraso a 1: el costo bajó de Q2,100 a Q1,500 y ya se le habían pagado
Q2,100. «Lo que baja después de pagado no es deuda y no aparece» es una decisión escrita (commit `1b4f748`),
y está bien que no sea deuda, pero Q600 pagados de más no se ven en ninguna pantalla de dinero; el
comprobante N.° 2, reimpreso, pasa a decir «4 + 1 de atraso, Q1,500.00 … Total pagado Q600.00» con una nota
genérica (el Hallazgo 5 de `revision-final.md` ya describía la fila que contradice el total). Es una
buena/mala noticia que se queda sin avisar; decide él si quiere un aviso en la ficha del dueño.

### H-8. Un carro ajeno que regresa ANTES de su fecha no tiene entrada; y corregir un cierre no tiene botón
El detalle del contrato (`#/contratos/<id>`) no trae «Recibir carro» (rentado) ni «Corregir» (cerrado); la
flota no tiene cuadro para un ajeno; el calendario lo lista solo el día de su devolución prevista (y
«Atrasados» si ya pasó). Corregir el cierre de una renta cerrada solo se alcanza con «atrás» del navegador
o escribiendo la dirección. No es un error de cuentas, pero es el camino que usa para arreglar dinero.

### H-9. El crédito a favor de un cliente solo se ve en el detalle de su contrato y en su fila de Contratos
Ninguna lista de la flota ni de Clientes lo marca (`saldo > 0` en «Pendientes de cobro» y «Saldo pendiente»,
a propósito). Probado con Q1,400 a favor tras una corrección. No hay
filtro «A favor del cliente» en Contratos. Si se le debe un reembolso, solo lo recuerda quien abra ese
contrato.

### H-10. Menores (para que no se vuelvan a descubrir)
- La fecha de un cobro al recibir por primera vez es la fecha de entrada tecleada (`fechaDelCobro`); si se
  anota tarde un regreso de hace días, el dinero queda fechado cuando volvió el carro, no cuando entró. Es
  ambiguo, por eso solo se arregló la corrección.
- «Devolución prevista: 31 oct 2026» sale con 0 días (reservación y salida), con aspecto de dato real.
- `#/calendario/2026-13-45` abre un mes inexistente (31 días, sin título): solo por dirección escrita.
- No se avisa de placas repetidas en la flota ni de un DPI repetido al dar de alta un cliente.
- Del Hallazgo 6 de `revision-final.md` (ya reportado, sin tocar): con la flota vacía no se dibujan las
  listas de garantías ni de cobros, y la fila de la garantía no dice las placas.
- `precio por día` y demás precios no tienen tope: Q1,000,000 por día pasa (a propósito: «yo pongo el
  precio»).

## Verificado y bien (para que nadie lo vuelva a revisar)

- **§5 reproduce en pantalla y en lo guardado** (tabla de arriba), y la cadena del dueño: Q1,500.00 + Q1,250.00
  = Q2,750.00; con costo anotado a mano Q250.56 × 2 = Q501.12.
- **Aritmética a ciegas.** 11 salidas y sus 11 recepciones con cifras al azar (1 a 400 días, precios con
  centavos, seguros, deducible, carta poder, varios, tarjeta al 12 %, 3.5 % o 2.75 %, pagos parciales,
  recibidos antes, a tiempo y hasta 5 días tarde, con daños, combustible, hora tardía, varios y descuento):
  la pantalla de salida, la de recibir, lo guardado y el detalle del contrato coinciden **al centavo** con
  un cálculo aparte en centavos enteros. Cero diferencias.
- El recargo de tarjeta del anticipo se aplica **una sola vez**: Q900 en efectivo + Q500 al 12 % = Total
  cobrado Q1,460.00 sobre Q1,400.00 de subtotal, saldo Q0.00.
- **Vacío ≠ falló**, con internet cortado y con copia local vacía (origen nuevo), en las doce pantallas
  que tocan datos: todas ponen su barra roja, ninguna dice «no hay». Dinero sin red no muestra Q0.00 como
  cuenta. Una cuenta de dueño inexistente o un enlace viejo (`texto:…` ya enlazado) dicen «No se encontró
  esta cuenta», no una cuenta vacía.
- **Fin de mes y de año:** a las 19:30 del 31 de octubre (01:30 UTC del 1 de noviembre) las fechas por
  omisión, la devolución prevista, la fecha de los pagos y «hoy» son del 31. Aritmética de fechas y
  cuadrícula del calendario verificadas de 2024 a 2032 (bisiestos, fin de año, lunes primero).
- **Nombres hostiles** (`<b>`, `<img onerror>`, comillas, `/`, `#`, `?`, `%`, `&`) no inyectan nada en
  ninguna pantalla; los enlaces de «Sin enlazar» abren bien.
- **Número de tarjeta y CBC** no aparecen en ningún documento de la nube.
- **Una dirección vieja** (`?reserva=` de una reservación entregada o cancelada) se ignora y lo dice;
  recargar siempre aterriza en Flota, así que un marcador viejo no reabre un formulario.
- Filtros de Contratos, alertas de Clientes, «Anular» (el pago queda marcado, no se borra, y la cuenta se
  recalcula), «Anotar costo» (rechaza negativo, cero, vacío y texto; redondea 250.555 a 250.56), «Mover el
  costo ahora» (dice «No había nada que mover»), «Enlazar» (pide confirmación y mueve la renta de grupo).

## Para quien publique

- **No subí la versión** (`version.txt` y `js/version.js`). Ninguno de estos cambios mueve dónde se guarda
  nada, así que una pestaña abierta con el código anterior no corrompe datos; solo seguiría sin los
  avisos nuevos. Si quiere que las pestañas abiertas se enteren, hay que subirla en los DOS lados (el aviso
  amarillo solo sale cuando coinciden).
- En esta máquina quedó un servidor viejo del agente anterior en el puerto 4377 (`node servidor.mjs`,
  sirve una copia desactualizada del árbol). No es del proyecto; conviene apagarlo antes de la próxima
  medición.

## Lo que esta prueba NO cubre

- Firebase real: las reglas, los tiempos y el comportamiento exacto de la cola de escrituras están
  imitados. H-1, H-2 y H-3 dependen de la semántica del SDK real; la imitación es fiel a la documentada,
  pero no se comprobó contra un servidor.
- Impresión (PDF del comprobante) y el contrato sobre el formulario preimpreso: no se miró el papel.
- La inactividad de 10 minutos del área de dinero y la barra amarilla de versión.
- Safari y Firefox: solo el Chrome del panel de vista previa.
