# Best Price — Contratos · Diseño del sistema

Fecha: 23 de septiembre de 2026
Autor: Esteban Urízar (decisiones) · Claude (redacción)
Estado: aprobado el diseño en conversación; pendiente de revisión escrita

## 1. Qué es esto

Un sistema web para llevar los contratos de renta de **Best Price Rent a Car
Guatemala**: clientes, flota, salida del carro, cobro, devolución, comisiones de
los empleados y pagos a los dueños de los carros subarrendados.

Reemplaza al archivo `~/Documents/Contratos Best Price Rent a Car.xlsx`, que hoy
hace ese trabajo con diez hojas de Excel. Ese archivo queda como respaldo vivo
(ver §10) y como la especificación de las reglas de cobro y del formato impreso.

El Excel actual solo tiene datos de prueba: un cliente (el propio dueño) y un
contrato. **No hay información que migrar**: el sistema arranca vacío.

## 2. Qué lo hace distinto del Excel

El Excel guarda datos. El sistema tiene que resolver el trabajo del día:

1. **Se ve el carro, no el papeleo.** La pantalla principal es la flota, cada
   carro con su estado. Recibir un carro no exige acordarse del número de
   contrato.
2. **Avisa de lo que el Excel deja pasar**: licencias vencidas, clientes con
   saldo pendiente, carros con dos rentas encima, garantías de tarjeta que
   llevan días sin liberarse.
3. **El contrato queda guardado** y se puede volver a ver y reimprimir.
4. **Es rápido con el negocio entero adentro** (§9).

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Usuarios | Una sola cuenta para entrar. El área de dinero pide contraseña aparte. |
| Comisión | 5 % por defecto, **configurable por empleado**. |
| Base de la comisión | (días contratados + días de atraso) × precio por día − descuento. |
| Seguros en la comisión | Cuentan: el precio por día va completo, con los seguros adentro. |
| Tarjetas | Se imprimen completas; se guardan solo los últimos 4 dígitos, banco, autorización y monto. El CBC nunca se guarda. |
| Impresión del contrato | Sobre el formulario de papel preimpreso, con pantalla de calibración. |
| Impresión del cierre | Documento completo en hoja blanca. |
| Respaldo | Archivo por año, **usando el Excel actual como plantilla**, con aviso anual. |
| Fotos | No se suben fotos de ningún tipo. |
| Dónde vive | Cuenta de GitHub `bestpriceguatemala`, repositorio `bestprice-contratos`, proyecto de Firebase nuevo, dominio propio (`sistema.bestpricegt.com` u otro subdominio suyo). |
| Relación con la aceitera | Ninguna. Otra cuenta, otra base de datos, otras reglas, otro código. |

## 4. Los tres momentos de un contrato

El negocio real funciona así, y el sistema lo sigue tal cual:

1. **Sale el carro.** El cliente paga la renta en ese momento y deja una
   garantía bloqueada en su tarjeta (el monto autorizado).
2. **Regresa el carro.** Se revisa: kilometraje, combustible, daños. El carro
   queda disponible para rentarse otra vez, aunque el contrato siga abierto.
3. **Se libera.** Cuando el cliente pagó todo lo que faltaba, se suelta el
   bloqueo de la tarjeta y el contrato se cierra.

### Estados

**Contrato**: `rentado` → `devuelto` → `cerrado`.
Un contrato `devuelto` puede tener saldo por cobrar, garantía sin liberar, o
las dos cosas. Se cierra cuando no queda ninguna de las dos.

**Carro**: `disponible` · `rentado` · `fuera de servicio`.
El carro vuelve a `disponible` al recibirlo, sin esperar a que el contrato
cierre. `fuera de servicio` se marca a mano, con una nota del motivo (taller,
golpe, revisión), y saca al carro de la lista de disponibles.

## 5. Reglas de cobro

Son las mismas de la hoja CONTRATOS del Excel. Los nombres entre paréntesis son
las columnas de ese archivo, para poder compararlo celda por celda.

```
renta            = días × precio por día                        (K = G × J)
devolución prevista = fecha salida + días                       (H)
días de atraso   = máx(0, fecha real de ingreso − prevista)     (BJ)
cobro de atraso  = días de atraso × precio por día              (BK)
seguros extra    = (seguro menores + seguro PAI)
                   × (días + días de atraso) + deducible bajo   (BL)
km recorridos    = km entrada − km salida                       (BI)
subtotal         = renta + cobro de atraso + seguros extra
                   + daños + carta poder + combustible + varios (BQ)
                   + hora tardía                (no está en BQ: ver abajo)
```

**El precio por día ya incluye** el seguro y el seguro de terceros; esos dos
montos solo se desglosan en el contrato impreso, nunca se suman aparte.
El **deducible bajo** se cobra una sola vez, no por día.
Los **daños** y el **combustible** se escriben a mano al recibir el carro.
La **hora tardía** es un monto que el mostrador escribe al sacar el carro (Q150
en el ejemplo del Excel) y se cobra una sola vez, con la salida. El Excel la
copiaba a la hoja CONTRATOS y la imprimía en el contrato, pero **ninguna
fórmula de esa hoja la sumaba**: BQ no la incluye, así que el dueño la cobraba
aparte, a mano. El sistema sí la suma, y por eso, en un contrato con hora
tardía, el subtotal ya no coincide con el de BQ: la diferencia es exactamente
ese monto.

### Qué se cobra en cada momento

Al salir el carro se cobra **todo lo que ya se sabe**: la renta de los días
contratados, los seguros por día de esos días, el deducible bajo, la hora
tardía, la carta poder y los varios.

En la devolución se cobra **solo lo que apareció después**: los días de atraso,
los seguros por día de esos días de atraso, los daños y el combustible, menos el
descuento que se le dé.

### El porcentaje de tarjeta

En el Excel el porcentaje de tarjeta se aplica una sola vez, al final. Aquí se
aplica **a cada cobro que se paga con tarjeta**, porque el cobro sucede en dos
momentos distintos. El resultado es el mismo cuando todo se paga con tarjeta, y
es el correcto cuando una parte se paga en efectivo.

```
monto cobrado = redondear((lo que se cobra − descuento) × (1 + % / 100), 2)
total cobrado = suma de todos los pagos del contrato
saldo         = subtotal ajustado − lo ya pagado
```

### Ejemplo que debe cuadrar

Contrato de 4 días a Q700 por día, devuelto 1 día tarde, con Q200 de daños,
Q350 de carta poder, Q130 de combustible, Q300 de descuento y 12 % de tarjeta:

| Momento | Concepto | Monto |
|---|---|---:|
| Salida | Renta (4 × 700) | 2,800.00 |
| Salida | Carta poder | 350.00 |
| Salida | 12 % de tarjeta sobre 3,150 | 378.00 |
| Salida | **Pagado** | **3,528.00** |
| Devolución | Atraso (1 × 700) | 700.00 |
| Devolución | Daños | 200.00 |
| Devolución | Combustible | 130.00 |
| Devolución | ( − ) Descuento | −300.00 |
| Devolución | 12 % de tarjeta sobre 730 | 87.60 |
| Devolución | **Saldo por cobrar** | **817.60** |
| | **Total cobrado** | **4,345.60** |

El subtotal sin recargos de tarjeta es 3,880.00, que es lo que daría la hoja
CONTRATOS del Excel: 2,800 de renta + 700 de atraso + 350 de carta poder + 200
de daños + 130 de combustible − 300 de descuento.

### Carros subarrendados

```
costo del subarriendo = costo por día del dueño × (días + días de atraso)  (BV)
utilidad              = total cobrado − costo del subarriendo              (BW)
```

Cada contrato de carro ajeno queda pendiente en la lista de **lo que se le debe
al dueño** hasta que se marque pagado, con su fecha y forma de pago.

### Comisión del empleado

```
base     = (días + días de atraso) × precio por día − descuento   (mínimo 0)
comisión = base × porcentaje del empleado
```

No entran daños, combustible, hora tardía, carta poder, seguros extra, varios ni
el porcentaje de tarjeta. El porcentaje por defecto es 5 % y **cada empleado puede
tener el suyo**. Cada contrato guarda el porcentaje que estaba vigente el día
que se hizo, para que un cambio de porcentaje no mueva los meses ya pagados.

La comisión **queda firme al recibir el carro**, que es cuando se conocen los
días de atraso y el descuento, y se cuenta en el mes de esa fecha de
devolución. Un contrato que sigue rentado todavía no genera comisión.

## 6. Pantallas

### Principal — la flota

Un cuadro por carro con placas, marca y estado: *disponible*, *rentado · vuelve
el 25* con el nombre del cliente, o en rojo *atrasado 2 días*. Botón `Sacar
carro` en los disponibles y `Recibir carro` en los rentados.

Debajo, dos listas cortas que solo aparecen cuando tienen algo:

- **Garantías por liberar**: cliente, monto bloqueado, días esperando.
- **Pendientes de cobro**: cliente, saldo, días que lleva.

**En esta pantalla no aparece ningún monto cobrado, utilidad ni comisión.**

### Sacar carro

Un solo formulario, seis bloques, uno debajo del otro:

1. **Cliente** — buscador por nombre, apellido, DPI, licencia o teléfono. Se
   puede crear un cliente nuevo sin salir de la pantalla.
2. **Carro** — solo los disponibles. Casilla *carro ajeno*: al marcarla
   aparecen placas, tipo, marca, color, modelo, dueño y costo por día, y no se
   toca la flota propia.
3. **Renta** — fecha y hora de salida, lugar, días, precio por día, kilometraje
   de salida, combustible. La devolución prevista se calcula sola.
4. **Cobros extra** — desglose de seguro y seguro de terceros, seguro de
   menores, seguro PAI, deducible, deducible bajo, hora tardía (precio), carta
   poder (destino y precio), varios.
5. **Tarjetas** — número, vencimiento, CBC, banco, autorización y monto
   autorizado; segunda tarjeta opcional.
6. **Cierre del formulario** — quién lo rentó (empleado), conductor adicional
   (nombre, licencia, identificación) y observaciones.

Avisos mientras se escribe:

- Licencia o DPI del cliente vencidos.
- El cliente tiene saldo pendiente de otro contrato.
- El cliente ya devolvió tarde antes.
- El carro tiene otro contrato encima de esas fechas.

Al final: el total estimado, el pago que se recibe (monto, forma de pago,
porcentaje de tarjeta si aplica) y el botón **Guardar e imprimir contrato**.

### Recibir carro

Se abre desde el carro, con los datos del contrato ya puestos. Se llena: fecha y
hora real de entrada, kilometraje, combustible, daños, varios, descuento y forma
de pago del saldo. El sistema muestra el detalle del cobro (§5), y al guardar
libera el carro e imprime el cierre.

Botón aparte, **Liberar garantía**, que cierra el contrato cuando ya no queda
saldo.

### Clientes

Buscador y ficha: datos personales (los mismos campos de la hoja CLIENTES),
historial completo de rentas y, arriba en rojo cuando aplica, licencia o DPI
vencidos, saldo pendiente y devoluciones tardías anteriores.

### Carros

Ficha con sus datos, propiedad y dueño, historial de rentas con kilometrajes y
días trabajados. **Los montos cobrados y la utilidad de cada carro solo se ven
con la contraseña.**

### Historial de contratos

Lista con filtros por fecha y estado (rentado, devuelto, pendiente de cobro,
garantía sin liberar, cerrado). Cada contrato se abre completo y se reimprime.

### Buscador general

Una sola caja arriba de todo: nombre, apellido, DPI, licencia, teléfono, placas
o número de contrato. Sin acentos y en cualquier orden, como la hoja BUSCAR.

### Área de dinero (con contraseña)

Se abre con contraseña y se cierra sola por inactividad o al salir del sistema.

- **Comisiones**, por mes y por empleado, con el detalle de cada contrato y de
  dónde sale cada número. **Casillas para seleccionar** qué contratos se van a
  pagar, con el total de lo seleccionado y el botón de pagar; queda registrada
  la fecha. Los pagados se separan de los pendientes. Se baja en Excel y PDF.
- **Dueños de carros ajenos**: lo que se le debe a cada uno, contrato por
  contrato, con las mismas casillas de selección y marcado de pago.
- **Empleados**: alta, baja y el porcentaje de comisión de cada uno. Se ven
  desde el mostrador (para elegir quién rentó el carro) pero solo se cambian
  aquí.
- **El negocio**: cobrado del mes, utilidad, pendientes de cobro y cuánto ha
  producido cada carro.

### Ajustes

Precios sugeridos por tipo de vehículo, porcentaje de tarjeta por defecto,
calibración de impresión, contraseña del área de dinero y botón de respaldo.

**Los empleados y su porcentaje de comisión NO viven aquí**: viven dentro del
área de dinero, detrás de la contraseña. El porcentaje de un empleado es dinero
suyo, y quien puede cambiarlo puede subirse la comisión. Quien esté en el
mostrador puede ver la lista para decir quién rentó el carro, pero no tocarla.

## 7. Datos

Colecciones en Firestore:

- `clientes` — datos personales, documentos y sus vencimientos, direcciones,
  teléfonos, correo, a quién se factura.
- `vehiculos` — flota propia: código, placas, tipo, marca y línea, color,
  modelo, propiedad, dueño, estado y motivo si está fuera de servicio.
- `contratos` — el contrato completo: cliente, carro (o los datos del carro
  ajeno), fechas, días, precios, seguros, extras, tarjetas enmascaradas,
  empleado, conductor, observaciones, estado, cierre y pagos.
- `contratos/{id}/privado/dinero` — el costo por día del dueño del carro
  (`costoDia`), que es lo único que hoy guarda. **Lo escribe el sistema al crear
  el contrato, pero solo se puede leer con la contraseña** (ver §11). La
  comisión calculada y los pagos al dueño, que este diseño también le asignaba a
  este documento, no viven aquí: la comisión sigue en el contrato (ver el
  pendiente de `porcentajeComision` al final de §7b) y los pagos al dueño tienen
  su propia colección, `pagosDueno`.
- `empleados` — nombre, porcentaje de comisión, activo.
- `pagosComision` — fecha, empleado, contratos incluidos, total, forma de pago.
- `duenos` — la ficha de cada dueño de un carro ajeno: nombre, teléfono, NIT y
  una nota (los campos, en §7b). Se lee y se escribe con la sesión normal,
  porque el alta rápida ocurre en el mostrador, con el carro afuera y el cliente
  esperando.
- `pagosDueno` — lo que se le ha pagado a cada dueño de un carro ajeno: fecha,
  forma, monto, los contratos que cubre y el número de su comprobante (los
  campos, en §7b). **Solo con la contraseña de dinero**, para leer y para
  escribir, y sin copia local: la copia local se lee sin credencial, y lo que se
  le paga a cada dueño no puede quedar ahí.
- `ajustes` — configuración y calibración.
- `contadores` — el correlativo del número de contrato (empieza en 1).

Los carros subarrendados **no entran a `vehiculos`**: sus datos viven dentro del
contrato, igual que en el Excel.

**La deuda de `subarriendo.costoDia`, pagada** (ADR-002:
`docs/adr/ADR-002-el-costo-del-dueno-vive-tras-la-contrasena.md`). Cuando se
construyó el núcleo (plan 1), la subcolección `contratos/{id}/privado/dinero`
todavía no tenía quién la escribiera —era del plan de dinero, que no
existía—, así que "Sacar carro" guardó `subarriendo.costoDia` (el costo por día
del dueño en un carro ajeno) y `porcentajeComision` directo en `contratos/{id}`,
donde los lee cualquier sesión con acceso a `contratos` (ver `firestore.rules`),
no solo quien tiene la contraseña de dinero. Fue a propósito, para no bloquear
el núcleo por un plan que todavía no se diseñaba, pero era una concesión, no el
destino final.

El plan de liquidación a dueños construyó esa área de dinero, y con ella la
concesión venció: **el costo del dueño del carro se guarda ahora en
`contratos/{id}/privado/dinero`**, y los contratos nuevos ya no lo llevan en su
documento. No bastaba con cambiar dónde escribe el sistema de ahora en
adelante: los contratos que el núcleo ya había escrito se quedarían con el dato
expuesto. Por eso hay una migración, que se corre **una sola vez y a mano**, con
el botón «Mover el costo ahora» del área de dinero (`migrarCostosDelDueno` en
`js/datos.js`). Hasta que se corra, esos contratos siguen trayendo el costo en
su documento, y el puente de lectura de §7b es lo que los mantiene
funcionando.

**Lo que esa nota pedía y no se pagó:** que el plan de dinero moviera **los
dos** campos, el costo del dueño del carro y `porcentajeComision`. ADR-002 movió
solo el primero. El segundo sigue en el documento del contrato: ver
«Pendientes conocidos del dinero» al final de §7b.

## 7b. Los nombres de los campos

El mismo dato ha quedado guardado bajo dos nombres distintos en tres ocasiones:
`kilometrajeSalida` y `kmSalida`, `nombre1` y `nombres`, `formaPago` y `forma`.
Cada vez costó una vuelta de revisión y dejó un puente de lectura que el
sistema arrastra. Para evitarlo en el futuro, aquí está la lista canónica de
los nombres que el sistema entero usa.

**Del contrato:**
`numero`, `clienteId`, `clienteNombre`, `carroId`, `carroPlacas`, `carroDescripcion`,
`fechaSalida`, `dias`, `devolucionPrevista`, `precioDia`, `kmSalida`, `garantiaMonto`,
`garantiaLiberada`, `garantiaLiberadaEn`, `estado`, `porcentajeComision`, `pagos[]`, `cierre{}`.

**Del contrato, lo nuevo y lo que faltaba** (agregado el 5 de octubre, al
construir la liquidación a dueños). `duenoId` es nuevo de ese plan. Los otros
cuatro el contrato los guarda desde que existe "Sacar carro", y este glosario
no los nombraba justo en la parte que ese plan más usa:
`ajeno`, `carroAjeno{placas, tipo, marca, color, modelo, dueno, costoDia}`,
`duenoId`, `subarriendo{costoDia}`, `tarjetas[]`.

- `ajeno` es verdadero cuando el carro es de otra persona y falso cuando es de
  la flota. **Es el único criterio:** «¿este contrato es de un carro ajeno?» se
  contesta con `Boolean(c.ajeno)` y con nada más. No se deduce de que exista
  `carroAjeno`, y menos de que exista `subarriendo`: en un contrato guardado hoy
  esa llave puede no estar (ver abajo), y un carro ajeno sin ella sigue siendo
  ajeno. Hoy la pregunta se hace en `esDeCarroAjeno` (`nucleo/liquidacion.js`) y
  en `esAjeno` (`datos.js`), que dicen exactamente lo mismo: si el criterio
  cambia alguna vez, cambian las dos. La pantalla del detalle también mira
  `ajeno`, y pide además que `carroAjeno` exista, pero eso es solo para no leer
  de un objeto que no está.
- `carroAjeno{…}` son los datos del carro del dueño tal como se escribieron ese
  día, porque un carro ajeno no entra a `vehiculos` (§7); es `null` en un carro
  de la flota. `dueno` es el nombre del dueño del carro y `costoDia` lo que Best
  Price le paga por día, que **ya no se guarda en el documento** (ver
  `subarriendo`).
- `duenoId` es el id del dueño escogido de la lista `duenos`, para que la
  liquidación junte en una sola cuenta todo lo que se le debe a la misma
  persona. Es `null`, no ausente, cuando no se escogió a nadie o el carro es de
  la flota, y los contratos de antes de este campo ni siquiera traen la llave:
  nada que lo lea puede exigirlo. **`carroAjeno.dueno` se queda con el nombre
  tal como se vio ese día**, porque es un dato de *ese* contrato y no solo un
  puntero: si después se corrige o se cambia el nombre en la ficha del dueño, el
  contrato sigue diciendo a quién se le rentó. Y si se escribió un nombre a mano
  sin escoger a nadie de la lista, ese nombre se conserva igual, con `duenoId`
  en `null`: la liquidación junta esos contratos por el texto («sin enlazar»)
  hasta que alguien los enlaza a un dueño de la lista.
- `subarriendo{costoDia}` es lo que Best Price le paga al dueño del carro por
  día, y es la forma en que ese costo vive **en memoria**: `resumen()`
  (`nucleo/contrato.js`) lo lee de aquí para sacar el costo del subarriendo y,
  de ese costo, la utilidad y lo que se le debe al dueño. En un contrato
  guardado desde ADR-002 **ya no está en el documento**: `contratoParaGuardar`
  lo quita, y la llave `subarriendo` entera desaparece si el costo era lo único
  que traía. En un carro de la flota es `null`. Dónde está de verdad el costo
  hoy: en `contratos/{id}/privado/dinero`, campo `costoDia`; y quien lo vuelve a
  poner aquí, en memoria, es el puente de lectura de más abajo.
- `tarjetas[]` son las tarjetas con que se garantizó la renta, cada una
  `{ultimos4, vencimiento, banco, autorizacion, montoAutorizado}`. Solo entran
  las que traen algo escrito (una renta en efectivo no guarda una tarjeta
  vacía), y `garantiaMonto` es la suma de sus `montoAutorizado`. Del número
  queda solo `ultimos4`: el número completo y el CBC nunca se guardan (§11).

**Del contrato, el resto de lo que guarda «Sacar carro»** (agregado el 6 de
octubre, al cerrar el último hueco de esta lista). Son diecinueve campos que
`construirContrato` y `contratoParaGuardar` escriben en cada contrato y que esta
sección no nombraba. Un hueco aquí es peor que una ausencia obvia: quien busca un
campo y no lo encuentra no piensa «falta anotarlo en la lista», piensa «ese campo
no existe», y le pone un nombre. Es el mismo tipo de hueco por el que entró la
cuarta ocurrencia (más abajo). Van agrupados como los bloques de la pantalla
«Sacar carro» (§6) y no en el orden del código; el bloque de las tarjetas ya está
arriba (`tarjetas[]`). En un contrato que se arma hoy ninguno falta, salvo
`actualizado`, que se sella al guardar: lo que se dejó en blanco queda en `0`, en
`''` o en `false`, no ausente.

*La renta* (bloque «Renta»):
- `horaSalida` es la hora en que salió el carro, en texto de 24 horas
  (`'13:45'`). Se corrige al salir del campo (`hora24`, `js/ui.js`): «1345» queda
  `'13:45'`, y lo que no sea una hora válida se guarda vacío, `''`, en vez de una
  hora a medias. La de regreso es `cierre.horaReal`.
- `lugar` es dónde se entregó el carro, en texto libre. **Se llama `lugar` a
  secas, sin «Salida» al final**, aunque el de regreso sí lleva apellido,
  `cierre.lugarEntrada`: quien lo busque con el nombre largo no lo va a encontrar,
  y no debe inventarlo.
- `combustibleSalida` es el nivel del tanque al salir, que se escoge de una lista
  (`Lleno`, `3/4`, `1/2`, `1/4`, `Vacío`) y queda vacío si no se escogió. **No es
  el `combustible` del cierre**: ese es un monto de dinero que se escribe a mano
  al recibir el carro, porque el sistema no calcula nada por nivel de tanque. Uno
  es lo que había en el tanque; el otro, lo que se cobra.

*Los cobros extra* (bloque «Cobros extra»). Aquí lo que importa es saber cuáles
entran en la cuenta y cuáles solo se anotan:
- `seguroDia` y `seguroTercerosDia` son lo que cuestan por día el seguro y el
  seguro de terceros. **Solo informativos:** el precio por día ya los incluye
  (§5), así que se guardan para desglosarlos cuando se imprima el contrato (§8) y
  no entran a ningún total. `lineasSalida` no los lee, y hoy nada más lo hace.
- `seguroMenoresDia` y `seguroPaiDia` son el seguro de menores y el seguro PAI,
  por día, y **estos sí se cobran**: se multiplican por los días contratados al
  salir y por los días de atraso al recibir (`lineasSalida`, `lineasDevolucion`),
  y salen en la línea «Seguros extra».
- `deducible` es el deducible normal, también **solo informativo**: se anota para
  el contrato impreso y no se cobra.
- `deducibleBajo` es la opción de deducible bajo: un monto que el mostrador anota
  y que **sí se cobra, una sola vez** (no por día), al salir, dentro de «Seguros
  extra». Los dos nombres se parecen y no se tratan igual: uno no entra a ninguna
  cuenta y el otro sí. Filtrar por `deducible` a secas trae los dos.
- `horaTardia` es el **cobro por hora tardía**: un monto en quetzales, el que se
  escribe en «Hora tardía — precio». Pasa por `q()` como todo el dinero y **sí se
  cobra, al salir el carro y no al recibirlo**: `lineasSalida` emite la línea
  «Hora tardía» solo si el monto no es cero, igual que la carta poder, y el campo
  vive en el formulario de «Sacar carro» (junto a la hora de salida), no en el
  cierre. **No entra a la comisión**: `baseComision` no lo lee (§5), igual que la
  carta poder. Es el mismo dato que el Excel guardaba en la celda «HORA TARDIA»
  (`INGRESO DE DATOS!C33`, Q150 en el ejemplo), que se copiaba a `CONTRATOS!AH` y
  se imprimía en el contrato.

  **Se perdió en la migración desde el Excel**, y queda escrito aquí porque es el
  tipo de cosa que vuelve a pasar. Al armar «Sacar carro» esa celda se volvió una
  casilla de sí/no (`Boolean(horaTardia)`) que se guardaba y que ninguna regla
  leía: un monto leído como una marca. Este glosario la anotó como «hay que
  preguntarle al dueño qué significa» y se quedó ahí; mientras tanto, desde que el
  sistema salió en vivo, ninguna hora tardía se cobró. El dueño lo confirmó el 6
  de octubre de 2026: «Es un cobro, y lo estoy perdiendo.» Dos cosas que habrían
  atajado esto: (1) al traducir una celda del Excel, el tipo se traduce también
  —una celda con un número es dinero, no una casilla—, y (2) un campo que «solo
  se guarda» es una pregunta pendiente, no un dato resuelto: se pregunta antes de
  dar el glosario por terminado. Tampoco la habría atajado comparar contra la
  hoja CONTRATOS celda por celda, porque BQ nunca la sumó (§5): lo que el Excel
  imprime y no suma también hay que mirarlo.

  **Hay dos formas guardadas.** Todo contrato guardado antes de este cambio trae
  `horaTardia` como verdadero o falso. `true` quiere decir «hubo una hora tardía
  y nadie anotó cuánto»: la cifra **no se sabe y nunca se convierte en un
  número** (ni en Q1, que es lo que daría `q(true)`, ni en Q150). `horaTardiaDe`
  (`nucleo/contrato.js`) es el único lugar que lee el campo: un número es el
  monto; `true` vale 0 en el cobro y el detalle del contrato lo dice tal cual,
  «Hora tardía: Sí, sin monto registrado»; `false`, `0` o la ausencia no son
  nada. Por eso ningún total de un contrato que ya se cobró y se cerró se movió,
  y no hay migración ni debe haberla: reescribir esos `true` sería inventar un
  cobro que nadie hizo. Un contrato nuevo siempre guarda un número, `0` si no
  hubo hora tardía.
- `cartaPoderDestino` y `cartaPoderPrecio` son la carta poder: el destino que se
  anota para ella (texto libre) y lo que se cobra por ella. Van de a par, pero no
  pesan lo mismo: la línea «Carta poder» del cobro existe solo si el precio no es
  cero, y el destino solo se muestra como el detalle de esa línea. Un destino sin
  precio no cobra nada y tampoco se vuelve a ver en el contrato guardado.
- `variosDescripcion` y `variosPrecio` son un cargo libre al salir: qué es y
  cuánto. Igual que la carta poder, la línea «Varios» solo existe si el precio no
  es cero. **No son `varios` y `variosDetalle` del cierre**: esos son el cargo
  libre que aparece al recibir el carro (la llave perdida, el lavado). Es la misma
  idea en dos momentos, con dos pares de nombres, y cada par lo lee una sola
  función: `lineasSalida` el de aquí y `lineasDevolucion` el del cierre.

*Quién lo rentó y el cierre del formulario* (bloque «Cierre del formulario»). Ojo
con el nombre: es el último bloque de la pantalla «Sacar carro» y **no tiene nada
que ver con `cierre{}`**, que es lo que se anota al recibir el carro.
- `rentadoPor` es el **empleado** que atendió la renta, no el cliente (el cliente
  es `clienteId` y `clienteNombre`). Se escribe a mano en «¿Quién lo rentó?» y se
  guarda como texto, no como una referencia: hoy no hay una lista de empleados de
  donde escoger (§12b), así que «Juan» y «juan» son dos nombres distintos para el
  sistema. Es la persona a quien le toca la comisión del contrato
  (`porcentajeComision`), y la búsqueda de contratos también lo encuentra por
  este nombre.
- `conductorAdicional{nombre, licencia, identificacion}` es el segundo conductor
  de la renta, cuando lo hay. Siempre es un objeto con esas tres llaves, vacías
  (`''`) si no hay conductor adicional: no es `null`. Ojo con `identificacion`,
  que va sin acento.
- `observaciones` es la nota libre del mostrador sobre esa renta, `''` si no hay.
  En el contrato se llama `observaciones`; `nota` es el nombre que usan la
  reservación y el dueño, y no hay que pasarlo de uno a otro.

*Lo que se sella al guardar.* Estos dos no se escriben a mano nunca:
`contratoParaGuardar` los pone, y con ellos `numero` y `estado` (el `estado` que
traiga el contrato en memoria se pisa siempre con `estadoContrato()`).
- `id` es el nombre del documento del contrato en la nube, y lo que lo une a su
  `contratos/{id}/privado/dinero`. «Sacar carro» lo pide una sola vez por alquiler
  (`nuevoIdContrato`), antes del primer intento, y lo reusa en cada reintento: así
  un guardado que venció y se repite cae en el mismo contrato y no crea un
  segundo, que sería un carro comprometido dos veces y una tarjeta autorizada dos
  veces. `construirContrato` lo deja en `null` si quien lo llama no trae uno, y
  `guardarContrato` le da uno la primera vez que de verdad se guarda.
- `actualizado` es la hora del guardado, en milisegundos (`Date.now()`), y se
  pone de nuevo en cada guardado. Sirve para dos cosas. La copia local lo usa para
  decidir cuál de dos versiones gana (`mezclar`, `js/cache.js`: gana la de
  `actualizado` mayor). Y `guardarContrato` lo usa para saber si el contrato **ya
  existía**: uno que lo trae vino de la nube o de la copia local, y por eso no
  vuelve a escribir su costo del dueño en `privado/dinero` (la sesión normal no
  puede leer qué hay ahí). Un contrato nuevo no lo trae; si uno nuevo lo trajera
  copiado de uno viejo, se tomaría por uno que ya existía y su costo no se
  escribiría.

La lista viva sigue siendo lo que arma `construirContrato`
(`js/pantallas/sacarCarro.js`) y lo que sella `contratoParaGuardar`
(`js/datos.js`), igual que `CAMPOS_CLIENTE` lo es para el cliente.

**De un pago:**
`monto`, `forma`, `porcentajeTarjeta`, `fecha`.

**Del cierre:**
`fechaReal`, `horaReal`, `lugarEntrada`, `kmEntrada`, `combustible`, `danos`,
`danosDetalle`, `varios`, `variosDetalle`, `descuento`.

**De la reservación** (agregado el 28 de septiembre, al notar que §12b describía
las reservaciones sin dejar sus campos en esta lista — el hueco por donde entró
la cuarta ocurrencia de más abajo):
`clienteId`, `clienteNombre`, `telefono`, `fechaSalida`, `dias`,
`devolucionPrevista`, `carroId`, `carroPlacas`, `tipoVehiculo`, `precioDia`,
`anticipo`, `anticipoPagado`, `nota`, `cancelada`, `contratoId`, `estado`,
`actualizado`.

Cuatro de estos no se escriben a mano nunca: `devolucionPrevista` la calcula
`construirReserva` a partir de `fechaSalida` y `dias`, y `estado`, `id` y
`actualizado` los sella `reservaParaGuardar` al guardar — `estado` con
`estadoReserva()`. Una reservación tiene `carroId`
(una unidad apartada con placa) **o** `tipoVehiculo` (cualquier carro de ese
tipo), y el sistema descuenta capacidad del tipo en ambos casos.

**Del cliente:**
`nombres`, `apellidos`, y el resto de las claves en `CAMPOS_CLIENTE`
(`js/nucleo/cliente.js`), que es la lista viva.

**Del carro:**
`codigo`, `placas`, `tipo`, `marca`, `linea`, `color`, `modelo`, `propiedad`,
`dueno`, `fueraDeServicio`, `motivoFueraDeServicio`.

**Del dueño de un carro ajeno** (colección `duenos`; agregado el 5 de octubre):
`nombre`, `telefono`, `nit`, `nota`, `actualizado`.

Los cuatro primeros son los de `CAMPOS_DUENO` (`js/nucleo/dueno.js`), que es la
lista viva: la ficha y el alta rápida dibujan su formulario desde ahí, así no se
desacuerdan. Solo `nombre` es obligatorio — se puede guardar un dueño sin datos
de contacto. `id` y `actualizado` no se escriben a mano: los sella
`duenoParaGuardar` al guardar. `actualizado` es lo que la copia local usa para
decidir cuál de dos versiones gana, así que uno copiado de la ficha vieja
perdería contra la que ya está en la nube. Y `duenoParaGuardar` conserva el `id`
de un dueño que ya lo tiene aunque quien llama lo omita —a propósito, a
diferencia de lo que hace el contrato—: un guardado sin `id` es un documento
nuevo, o sea un dueño duplicado. Los campos que el formulario no conoce se
arrastran tal cual (`construirDueno`), para no perder ninguno al guardar.

Ojo con el nombre: `dueno` aparece en tres lugares que no son el mismo campo. En
la ficha de un carro de la flota (arriba) es el dueño anotado de ese carro; en el
contrato es `carroAjeno.dueno`, el texto de ese día; y la ficha de la lista es la
colección `duenos`, a la que apunta `duenoId`.

**Del pago a un dueño** (colección `pagosDueno`; agregado el 5 de octubre):
`duenoId`, `fecha`, `forma`, `monto`, `contratos[]`, `numero`, `actualizado`.

- `contratos[]` son los ids de los contratos que ese pago cubre, y **es lo único
  que dice que un contrato ya se le pagó al dueño del carro**. El contrato no
  lleva un campo «pagado», y no debe llevarlo: sería la misma verdad en dos
  lugares, y este glosario existe por eso. Un contrato está pagado cuando su id
  aparece en el `contratos[]` de algún pago (`cuentaDeDueno`,
  `nucleo/liquidacion.js`).
- `monto` y `contratos[]` nacen juntos, de la misma lista y en un solo lugar,
  `construirPagoDueno`. Por eso no pueden contradecirse —lo que él ve sumar
  mientras marca casillas es exactamente lo que se guarda— y por eso un contrato
  que ya no está por pagar no entra al pago aunque su casilla siga marcada.
  `pagoDuenoParaGuardar` vuelve a pasar `monto` por `q()`: el dinero nunca se
  redondea a mano.
- `forma` se llama igual que en un pago del contrato, pero es otro conjunto de
  valores: efectivo, transferencia o cheque (`FORMAS_DE_PAGO`,
  `js/pantallas/dinero.js`). No lleva `porcentajeTarjeta`.
- `numero` es el correlativo del comprobante que se le entrega al dueño del
  carro. Sale de `siguienteNumeroComprobante()`, una transacción sobre
  `contadores/comprobantes`, el mismo mecanismo del número de contrato. Un pago
  que ya existe conserva su número aunque se le pase otro: un comprobante que se
  renumera solo es peor que ninguno, porque el dueño del carro ya tiene el papel
  con el número anterior. Si el guardado falla después de tomar un número, queda
  un hueco en la numeración; un hueco se explica, un número repetido no.
- `id`, `numero` y `actualizado` los sella `pagoDuenoParaGuardar`. El `id` se
  pide con `nuevoIdPagoDueno()` **antes del primer intento** y se reusa en cada
  reintento: así, un doble clic, o un reintento después de que el primer intento
  venció, cae en el mismo documento y no crea un segundo comprobante por las
  mismas rentas.

**Los puentes de lectura que siguen en el código:**
- `pantallas/contratos.js:formaDePago()` — lee `forma` o `formaPago`, por los pagos de la salida que
  salieron guardados con el segundo nombre.
- `pantallas/recibirCarro.js:conKmSalidaNormalizado()` — el puente real entre `kmSalida` y
  `kilometrajeSalida`, por los contratos antiguos que lo salvaron con el nombre viejo.
  `pantallas/contratos.js:dibujarDetalleEntrada()` llama a esta misma función antes de pintar el
  detalle de un contrato, para que un contrato viejo también muestre su kilometraje ahí — corregido en
  la revisión final de este plan, que encontró esta nota apuntando al lugar equivocado (decía que el
  puente vivía en `contratos.js:seccionSalida()` y en `nucleo/contrato.js`, y ninguno de los dos lo
  tiene).
- `pantallas/clientes.js` y `nucleo/cliente.js` — leen `nombres` o `nombre1`, por los clientes que
  llegaron con ambos del Excel.
- `datos.js:conCostoDelDueno()` — el costo por día que Best Price le paga al
  dueño de un carro ajeno puede estar en dos lugares: dentro del documento del
  contrato (`subarriendo.costoDia`, y su gemelo `carroAjeno.costoDia`; así lo
  guardaban los contratos de antes de ADR-002) o en
  `contratos/{id}/privado/dinero` (así lo guarda el sistema ahora). El puente
  lee los dos, y **si los dos traen un número, gana `privado`**: es donde el
  costo vive hoy, y el que siga en el documento es el que quedó sin migrar. Lo
  aplica `cargarContratosParaDinero()` al cargar los contratos del área de
  dinero —que los lee de la nube: el costo nunca sale de la copia local— y deja
  el costo puesto en `subarriendo.costoDia`, que es donde lo lee `resumen()`.
  Si ninguno de los dos lugares trae un número, el contrato queda tal cual, sin
  inventarle un `costoDia: 0`: sigue siendo una renta «sin costo anotado» y no
  un costo real que resultó ser cero. Y si `privado` no se pudo leer, la lectura
  lo marca (`costoSinLeer`) para que la pantalla diga «no se pudo leer» en vez
  de pintar Q0.00 como si fuera un costo.

  **Por qué vive en `datos.js` y no en el núcleo.** `resumen()` es el único
  lugar que calcula el costo del subarriendo, y de ese mismo cálculo salen, a la
  vez, lo que se le debe al dueño del carro y la utilidad del negocio. Un puente
  metido en la regla de la liquidación habría hecho que la deuda y la utilidad
  usaran costos distintos sobre el mismo contrato, y nada lo habría avisado. Y
  meterlo en `resumen()` tampoco sirve: el núcleo es puro y no sabe leer de
  Firestore. `datos.js` es quien lee, así que ahí se mezcla el costo dentro del
  contrato **antes** de que el núcleo lo vea, y `resumen()` no se entera de
  dónde vino el número. Por eso el núcleo no cambió ni una línea, y por eso
  sigue habiendo un solo lugar que calcula ese costo.

Estos puentes no van a desaparecer nunca: son la forma de que los datos de
hace un año sigan mostrándose bien cuando se abre el sistema hoy.

**La cuarta vez (28 de septiembre), y de dónde vino.** El calendario se escribió
contra `contrato.fechaDevolucion` y `contrato.cerrado`. Ninguno de los dos existe:
el regreso del carro se marca con `cierre.fechaReal`, y "cerrado" no se guarda —
lo deriva `estadoContrato()`. Contra datos reales, todo carro devuelto se quedaba
en "regresa hoy" para siempre y no salía nunca de la lista de atrasados.

Lo nuevo de esta ocasión no es el error, es por dónde entró: los dos nombres
inventados venían **del encargo escrito**, no del código. Quien implementó los
copió de ahí, con razón. Y las 259 pruebas pasaron en verde porque los datos de
prueba también se habían construido con la forma inventada — la suite estaba
comprobando sus propios datos de prueba, no el sistema.

De ahí salen las dos reglas que cierran esta clase de error:

1. **Los nombres de los campos se copian de esta lista, nunca de la memoria de
   nadie ni de un encargo escrito.** Un encargo puede traer un nombre equivocado;
   esta sección es la que manda.
2. **Cada dato de prueba tiene que tener la forma real de un contrato guardado.**
   Una prueba escrita sobre un contrato inventado pasa en verde sin decir nada
   sobre el sistema. Si un campo no aparece en esta lista, no debería aparecer en
   una prueba.

**La quinta vez (3 de octubre), y por qué mover un campo no es mover un
número.** Al mover el costo del dueño del carro tras la contraseña de dinero
(ADR-002), el encargo contaba dos lugares donde vivía ese número: el documento
del contrato, en `subarriendo.costoDia`, y la copia que el navegador guarda de
él. Eran **tres**. `construirContrato` no arma `carroAjeno` campo por campo: lo
copia entero (`{ ...carroAjeno }`), y `carroAjeno` lleva su propio `costoDia`.
Así que el mismo costo se guardaba también como `carroAjeno.costoDia` —un campo
que nada leía, y por eso nadie lo había visto—: otra vez un dato bajo dos
nombres, esta vez dentro del mismo documento. Mover solo `subarriendo.costoDia`
habría dejado el número a la vista de cualquiera con la sesión normal, en las
herramientas del navegador, y el candado habría sido de adorno, con todas las
pruebas en verde.

Lo encontró quien lo implementó, al leer lo que `construirContrato` de verdad
escribe en vez de fiarse de la lista de lugares del encargo. Hoy los dos nombres
se quitan juntos (`sinCostoDelDueno`), y la migración limpia los dos.

La copia del navegador, que el encargo sí nombraba, resultó tener su propio
hueco, y lo encontró la revisión que siguió. Esa copia (IndexedDB) es del
navegador y no de la cuenta, y sobrevive a cerrar sesión: cualquier computadora
que corrió el sistema antes de ADR-002, como la del mostrador, guarda el costo
de todos los subarriendos que abrió, y la migración —que se corre en la
computadora de él— solo limpia la suya. Además, la sincronía de fondo volvía a
escribir ahí el costo de cualquier documento que aún no estuviera migrado. De
ahí que el costo se quite en las tres puertas por las que algo entra a esa
copia: lo que se guarda (`contratoParaGuardar`), lo que se sincroniza, y lo que
la copia ya tenía de antes (`limpiarCopiaLocalDelCosto`, una vez por
computadora al arrancar). La regla, haya corrido la migración o no: **la copia
local nunca guarda el costo de un subarriendo**. Y el área de dinero lee los
contratos de la nube, no de esa copia.

De aquí sale una tercera regla, que se suma a las dos de arriba:

3. **Cuando se mueve un dato detrás de un límite —una contraseña, una regla de
   lectura, otro documento—, no basta con buscar el nombre del campo que uno
   espera: hay que buscar el *valor*.** Se toma un número real de un contrato
   real y se busca dónde más aparece: bajo otros nombres, dentro de objetos que
   se copian enteros, y en cada copia que el sistema guarda por su cuenta. Un
   candado se mide por lo que queda afuera, no por lo que se movió adentro. Y la
   prueba tiene que hacer la misma pregunta: no «¿se fue el campo?», sino
   «¿queda ese número en alguna parte de lo que se guardó?».

### Pendiente conocido: el carro atrasado no bloquea una reservación futura

Hallado en la revisión final del plan de reservaciones (29 de septiembre) y
**diferido a propósito**, no olvidado.

`choquesDeReserva` mide el cruce contra la `devolucionPrevista` del contrato.
Un contrato vivo pero **atrasado** ya pasó esa fecha, así que una reservación
posterior no se cruza con él y no avisa — justo en el carro con menos
probabilidad de estar libre, porque el cliente anterior todavía no lo trae.

Arreglarlo bien pide que la regla sepa qué día es hoy (el fin efectivo de un
contrato vivo es el mayor entre su `devolucionPrevista` y hoy), y eso cambia
la firma de `choquesDeReserva` y de quienes la llaman. Es un cambio con
alcance propio: no se mete al final de una rama, después de que la revisión
final ya pasó, que es justo como se cuelan los errores que nadie vuelve a
mirar. Va como primera tarea del siguiente plan.

### Pendientes conocidos del dinero

Hallados en las revisiones del plan de liquidación a dueños (5 de octubre) y
**diferidos a propósito**, no olvidados.

**`porcentajeComision` sigue en el documento del contrato**, legible con una
sesión normal. §7 ya decía que el plan de dinero tenía que mover **los dos**
campos —el costo del dueño del carro y el porcentaje de comisión— a
`privado/dinero`; ADR-002 movió solo el costo, que era lo que la liquidación
necesitaba. Mientras él sea el único que usa el sistema, nadie más lo ve y no
corre prisa. Pero el día que un empleado trabaje en el mostrador podrá leer, en
las herramientas del navegador, el porcentaje de cada contrato y, con él, el de
cada empleado, y §12b ya dice que ese porcentaje solo lo controla él. Necesita
**su propia decisión antes de ese día**, y no se resuelve de pasada dentro de
otro plan. Moverlo reusa la maquinaria que ya existe para el costo (la
migración, el puente de lectura, la limpieza de la copia local), y hacerlo
ahora, con pocos contratos guardados, es más barato que hacerlo después.

**Una renta cuyo costo de verdad no se puede leer no se puede pagar, y eso es
correcto.** `construirPagoDueno` se niega, con una frase que dice cuáles rentas
son. Hay dos causas y piden cosas distintas: que el costo nunca se anotó (el
campo no es obligatorio al sacar el carro, y vacío queda en 0: es el
`sinCostoAnotado` de `cuentaDeDueno`), o que no se pudo leer `privado/dinero`
(sin la sesión de dinero, o falló la nube: es el `costoSinLeer` de la lectura).
Pagarla de todos modos saldría en Q0.00: borraría de la lista la deuda con el
dueño del carro y dejaría un comprobante que no prueba que se pagó nada.

La salida existe y es **`anotarCostoDelDueno`** (`js/datos.js`; es el botón
«Anotar costo» del área de dinero): escribe el costo en `privado/dinero` con la
credencial de dinero. Es para llenar lo que falta, no para cambiar lo que ya
está: se niega a escribir encima de un costo existente —lo mira en `privado` en
el momento de escribir, y si no lo puede leer tampoco escribe—, porque lo que se
negoció con el dueño del carro no se cambia con un campo de texto. Y la pantalla
solo lo ofrece cuando el costo falta de verdad, no cuando solo no se pudo leer: a
quien tuvo un fallo de internet se le dice que revise y reintente, no que
escriba de memoria un costo que ya existe. **Nadie debe «arreglar» la negativa**
dejando pasar esas rentas: sin ella, una deuda real se borra en silencio.


## 8. Impresión

**Contrato sobre el formulario preimpreso.** El sistema imprime únicamente los
datos, en las posiciones que hoy tiene la hoja IMP. CONTRATO, medidas en
milímetros. Pantalla de **calibración**: se imprime una hoja de prueba y se
corre todo con flechas hasta que calce; el ajuste se guarda por impresora.

**Cierre en hoja blanca.** Documento completo con los datos del contrato y el
detalle del cobro, como la hoja IMP. CIERRE DE CONTRATO.

En una reimpresión, el número de tarjeta sale enmascarado (`•••• 3343`), porque
el completo nunca se guardó.

## 9. Velocidad

Objetivos medibles, verificados antes de entregar:

- Pantalla principal visible en **menos de 1 segundo**.
- Buscador respondiendo **mientras se escribe** (menos de 100 milisegundos).
- El sistema abre y deja trabajar aunque el internet ande lento.

Cómo se logra:

- **Copia local** de clientes, flota y contratos del año en curso, guardada en
  la computadora; la pantalla se dibuja con eso y la nube se sincroniza por
  detrás.
- **Solo lo vivo al abrir**: flota y contratos abiertos. Los años anteriores se
  traen cuando se buscan.
- **Búsqueda local** sobre un índice sin acentos, sin consultar internet por
  cada letra.
- **Listas dibujadas por partes**: solo se dibuja lo que cabe en pantalla.
- **Sin fotos ni archivos pesados**: es la decisión que hace posible todo lo
  anterior.

## 10. Respaldo

Un botón baja un archivo de Excel **por año** (`Best Price 2026.xlsx`), armado
sobre el archivo actual como plantilla: conserva sus diez hojas, sus colores y
sus fórmulas, y se le escriben los datos reales en CLIENTES, VEHICULOS y
CONTRATOS. El archivo bajado sirve para trabajar: si el sistema no está
disponible, se renta con él esa misma tarde.

Al entrar, si pasó un año desde el último respaldo, el sistema lo recuerda con
un aviso y el botón para bajarlo.

Se le advierte al dueño que ese archivo lleva DPI, licencias y teléfonos de sus
clientes, y merece el mismo cuidado que el Excel de hoy.

## 11. Seguridad

- **Entrar al sistema**: una cuenta con su usuario y contraseña.
- **Área de dinero**: una segunda contraseña. No es una cortina en pantalla: los
  datos de esa área viven en documentos que las reglas de Firestore solo
  permiten leer con esa segunda credencial. Quien no la tenga no los puede ver
  ni entrando por debajo del sistema.
- **Tarjetas**: el número completo y el CBC viajan del teclado a la impresora y
  no se guardan en ningún lado. Del número queda el último grupo de 4 dígitos.
- **Reglas de Firestore**: las publica el dueño a mano en la consola de
  Firebase, como en el sistema de la aceitera. Cuando cambien, se le entrega el
  archivo completo para pegar.

## 12. Lo que este sistema NO hace

Queda afuera a propósito, para que sea simple y rápido:

- Fotos de los vehículos, de los daños o de los documentos.
- Reservas hechas por el cliente desde la página web. Las reservaciones las
  anota él (ver §14); lo que queda afuera es que el público reserve solo.
- Uso en celular (se usa en computadora de escritorio).
- Varias cuentas de usuario con permisos distintos.
- Facturación electrónica (FEL) y contabilidad.
- Seguimiento por GPS.

## 12b. Lo que se agregó después de aprobar el diseño

El 24 de septiembre de 2026, con el plan 1 casi terminado, el dueño pidió tres
cosas más. Quedan aquí para que el diseño no mienta sobre lo que el sistema va
a ser:

### Reservaciones y calendario

Una **reservación** aparta un carro antes de que salga: cliente (o solo nombre y
teléfono si todavía no está registrado), fechas, **tipo de vehículo y, cuando el
cliente lo pide, el carro exacto**, precio por día acordado, anticipo y una nota.
Estados: *pendiente*, *entregada* (ya se volvió contrato) o *cancelada*.

**Cambiar la unidad es un clic**: la reservación es la misma, solo cambia qué
carro la cumple. Él lo pidió así porque los planes cambian a última hora.

El **calendario** es su propia pestaña, para verlo cuando quiera. Muestra el mes
con dos cosas por día: cuántos carros salen (reservaciones) y cuántos regresan
(contratos). Al abrir un día: quién sale, con qué carro o qué tipo, y si dejó
anticipo; y quién regresa, con *"pendiente de pagar Q817.60"* o *"ya pagó"*.
Desde ahí se saca o se recibe el carro sin buscar nada.

Al entrar al sistema, arriba de la flota, un **resumen del día** de cuatro
números y nada más: hoy salen, hoy regresan, atrasados, garantías por liberar.
Cada número lleva a su detalle. Es para saber de un vistazo si el día viene
tranquilo, no para leerlo.

El aviso de **"este carro ya está comprometido"** pasa a mirar también las
reservaciones, no solo los contratos: ahí es donde se pierde un cliente.

### Mantenimiento de la flota propia

Cada carro propio lleva el control de sus servicios: **aceite y filtro, pastillas
de freno, llantas, batería, alineación y balanceo, y servicio general**. Cada uno
con dos intervalos — kilómetros y tiempo — y **toca con el que llegue primero**.

El kilometraje no se escribe aparte: sale del que ya se anota al recibir cada
carro. En la ficha se ve cuándo se hizo cada servicio, a qué kilometraje, y
cuánto falta para el siguiente. Cuando falte poco, aparece donde ya aparecen los
demás avisos.

### El porcentaje de comisión no se toca en el mostrador

Al probar el sistema publicado (24-sep-2026) el dueño lo dijo claro: hay cosas
que solo él, como administrador, debe controlar, y el porcentaje de comisión es
una de ellas. Hoy el formulario de salida lo muestra como un campo editable con
5 % por defecto, porque todavía no existe la lista de empleados.

Cuando se construya el área de dinero (plan 5), ese campo **desaparece del
formulario de salida**: en su lugar se elige al empleado de una lista, y el
contrato se queda con el porcentaje que ese empleado tenga guardado, sin
mostrarlo ni dejarlo cambiar desde el mostrador. El porcentaje solo se edita
detrás de la contraseña.

### Orden de construcción

1. Núcleo (sacar carros, flota, cálculos) — el plan 1.
2. Recibir y cobrar: cerrar el contrato, cobrar el saldo, liberar la garantía.
3. Reservaciones y calendario.
4. Impresión sobre el formulario preimpreso.
5. Dinero: comisiones, pagos a dueños, empleados.
6. Mantenimiento.
7. Respaldo en su propio Excel.

El cierre va antes que las reservaciones por una razón práctica: hoy el sistema
puede sacar un carro pero no recibirlo, así que un contrato se quedaría abierto
para siempre.

## 13. Publicación

- Repositorio `bestprice-contratos` en la cuenta de GitHub `bestpriceguatemala`,
  publicado con GitHub Pages.
- Dominio propio enfrente (`sistema.bestpricegt.com` o el que él decida). El
  cambio en el panel del dominio lo hace él o quien le lleva la página.
- El dueño sube los commits desde GitHub Desktop; al terminar cada trabajo se le
  dice qué falta subir.
- Al publicar un cambio se sube el número de versión para que salga el aviso de
  **Actualizar**, igual que en la aceitera.
