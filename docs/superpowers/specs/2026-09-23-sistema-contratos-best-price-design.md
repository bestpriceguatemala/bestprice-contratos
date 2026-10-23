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
La **hora tardía** es un monto que el mostrador escribe **al recibir el carro**
(Q150 en el ejemplo del Excel) y se cobra una sola vez, con la devolución: el
dueño la cobra «solo al devolver». El Excel la tenía en el bloque de entrada de
la renta, la copiaba a la hoja CONTRATOS y la imprimía en el contrato, pero
**ninguna fórmula de esa hoja la sumaba**: BQ no la incluye, así que el dueño la
cobraba aparte, a mano. El sistema sí la suma, y por eso, en un contrato con
hora tardía, el subtotal ya no coincide con el de BQ: la diferencia es
exactamente ese monto.

### Qué se cobra en cada momento

Al salir el carro se cobra **todo lo que ya se sabe**: la renta de los días
contratados, los seguros por día de esos días, el deducible bajo, la carta poder
y los varios.

En la devolución se cobra **solo lo que apareció después**: los días de atraso,
los seguros por día de esos días de atraso, los daños, el combustible y la hora
tardía, menos el descuento que se le dé.

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

La comisión **se conoce al recibir el carro**, que es cuando se saben los días de
atraso y el descuento, y se cuenta en el mes de esa fecha de devolución. Un
contrato que sigue rentado todavía no genera comisión, solo un estimado: un día
de atraso la sube y un descuento la baja.

**Se paga cuando el contrato está CERRADO, no cuando el carro vuelve** (14 de
octubre de 2026). Este diseño decía antes que la comisión «queda firme al recibir
el carro», y el dueño lo corrigió al preguntársele cuándo mira lo que le debe a
cada empleado: *«Lo miro cuando el contrato está cerrado y tengo que pagar
quincena o final de mes. Yo decido cuándo lo pago.»* Por eso una comisión solo es
pagable con **la misma regla con la que se le paga al dueño de un carro ajeno**:
`estadoContrato(c) === 'cerrado'` (`nucleo/estados.js`), que ya exige que el carro
haya vuelto, que no se deba saldo y que la garantía esté liberada. Esa regla vive
en un solo lugar y las dos cuentas le preguntan ahí; ninguna la repite. Dos cosas
que se parecen y no son la misma: `comisionDe(c).firme` (`nucleo/comision.js`) dice
si el MONTO ya se conoce (el carro volvió) y sirve para llamarla «estimada» o no;
lo que decide si se PAGA es que el contrato cierre. Una renta cuyo carro volvió
pero cuyo cliente todavía debe tiene su monto y no se paga todavía, y la pantalla
dice por qué con las mismas palabras que la ficha del dueño de un carro ajeno
(«Saldo pendiente: Q200.00.», «Garantía sin liberar: Q5,000.00.»).

**El dueño paga por quincena y por fin de mes, y decide él cuándo** (14 de octubre
de 2026). Eso no estaba en este diseño. La primera quincena es del 1 al 15 y la
segunda del 16 al fin de mes; una renta cuenta en el período de la fecha en que
**regresó** el carro (`cierre.fechaReal`), no en el de la fecha en que cerró el
contrato, que no se guarda: una renta que regresó el 10 y cerró el 18, cuando el
cliente pagó, vuelve a salir en la primera quincena aunque ya se haya pagado esa
quincena. La ficha ofrece, por mes, un botón para el mes completo y uno para cada
quincena con algo, y **marcar un período es un clic** (`periodosDePago`,
`nucleo/comisiones.js`). Tres cosas que «yo decido cuándo» exige: el sistema **no
pone plazos**, no dice que algo lleve días sin pagarse y no pinta nada de rojo por
no haber pagado; **nada se marca en silencio** (lo que queda fuera de lo marcado
sigue a la vista con su total, «Sin marcar: N rentas · Q…»); y el total de lo
marcado se suma a la vista antes de registrar nada.

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
   menores, seguro PAI, deducible, deducible bajo, carta poder (destino y
   precio), varios. La hora tardía **no** va aquí: se escribe al recibir el carro.
5. **Tarjetas** — número, vencimiento, CBC, banco, autorización y monto
   autorizado; segunda tarjeta opcional.
6. **Cierre del formulario** — quién lo rentó (empleado), conductor adicional
   (nombre, licencia, identificación) y observaciones.

Avisos mientras se escribe:

- Licencia o DPI del cliente vencidos.
- El cliente tiene saldo pendiente de otro contrato.
- El cliente ya devolvió tarde antes. Cuenta **el último año** de sus rentas, cerradas o no (decisión del dueño, 7–12 de octubre de
  2026: no todo su historial, porque cada cliente que se escoge sería una lectura más grande, y una devolución tarde de hace tres años
  no informa la decisión de hoy). La regla es una sola, `nucleo/historial.js`, y la comparten este aviso y la marca «Devolvió tarde» de
  Clientes; las dos leen TODOS los contratos (`cargarTodosLosContratos`) y la regla aplica la ventana. Estuvo hecha a medias hasta el 21 de
  octubre: la regla existía, pero ninguna pantalla le entregaba lo cerrado y el aviso seguía mirando solo lo abierto. Si la lectura falla,
  el aviso lo dice («no se pudo revisar…», «al menos…»): una lectura caída no es un cliente sin historial.
- El carro tiene otro contrato encima de esas fechas.

Al final: el total estimado, el pago que se recibe (monto, forma de pago,
porcentaje de tarjeta si aplica) y el botón **Guardar e imprimir contrato**.

### Recibir carro

Se abre desde el carro, con los datos del contrato ya puestos. Se llena: fecha y
hora real de entrada, kilometraje, combustible, daños, hora tardía (precio),
varios, descuento y forma de pago del saldo. El sistema muestra el detalle del cobro (§5), y al guardar
libera el carro e imprime el cierre.

La **hora real de entrada** no es obligatoria, pero si queda en blanco la pantalla lo
dice —en ámbar, sin apagar el botón—: *«La hora real de entrada está en blanco, y sobre ella
decides cuánto cobrar si el cliente se pasó de la hora.»* Decisión del dueño del 19 de
octubre de 2026, a la pregunta de si el sistema debía pedirla: *«Que te avise, sin
bloquear.»* La regla es `avisosDelCierre` (`nucleo/cierre.js`), una lista aparte de
`problemasDelCierre`, que es la que sí impide guardar: si los avisos entraran ahí, el botón
se apagaría por algo que es suyo decidir. Solo sale al recibir por primera vez; un contrato
que ya se recibió (se está corrigiendo, o es uno de antes que se cerró sin hora) no se queja.
Esa hora es la que el respaldo lleva en `AF HORA ENTRADA` (§10).

Botón aparte, **Liberar garantía**, que cierra el contrato cuando ya no queda
saldo.

### Clientes

Buscador y ficha: datos personales (los mismos campos de la hoja CLIENTES),
historial completo de rentas y, arriba en rojo cuando aplica, licencia o DPI
vencidos, saldo pendiente y devoluciones tardías anteriores.

### Carros

Ficha con sus datos, propiedad y dueño, historial de rentas con kilometrajes y
días trabajados, y el **mantenimiento** de los carros de la flota propia (§12b): cuándo se hizo
cada servicio, a qué kilometraje y cuánto falta para el siguiente. **Esta pantalla no muestra
montos cobrados ni utilidad por carro.** Este diseño decía que se verían con la contraseña; esa
pantalla no se construyó ni se va a construir (decisión del 23 de octubre de 2026, al final de
«Área de dinero»): lo que cada carro ha producido lo da el respaldo.

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
  la fecha. Los pagados se separan de los pendientes. **No se baja a Excel ni a PDF**:
  este diseño lo prometía y ninguna pantalla de comisiones baja un archivo (al final de
  «Área de dinero»). Solo se paga lo de un contrato cerrado, y un período (quincena o mes)
  se marca de un clic: ver §5, «Comisión del empleado».
- **Dueños de carros ajenos**: lo que se le debe a cada uno, contrato por
  contrato, con las mismas casillas de selección y marcado de pago.
- **Empleados**: alta, baja y el porcentaje de comisión de cada uno. Se ven
  desde el mostrador (para elegir quién rentó el carro) pero solo se cambian
  aquí.
- **El negocio: no se construye.** Este diseño prometía aquí una pantalla con «lo cobrado del
  mes, la utilidad, lo pendiente de cobro y cuánto ha producido cada carro». El dueño decidió el
  23 de octubre de 2026 que no la quiere; la decisión y sus razones están abajo.

**Lo que este diseño prometió y no se va a construir (decisión del 23 de octubre de 2026).**
§6 prometió dos cosas que ninguna pantalla hizo. El 21 de octubre se comprobó en el código
(no hay ruta ni función que las calcule; las rutas del área de dinero son Comisiones, Dueños,
Empleados y Respaldo) y se le preguntó al dueño si las seguía queriendo. Quedan escritas con lo
que se prometió, para que nadie las dé por hechas ni las vuelva a descubrir como un hueco:

1. **La pantalla «El negocio»**: cobrado del mes, utilidad, pendientes de cobro y cuánto ha
   producido cada carro. Respondió: *«Con el respaldo me basta.»* La razón, dicha por él: sus
   propias fórmulas de Excel le dan la utilidad cuando baja el respaldo. Es coherente con lo que
   ya decide §10 («Los totales son los de su hoja, no los del sistema»): el respaldo no escribe
   ningún total, y SUBTOTAL, TOTAL COBRADO y UTILIDAD son fórmulas de su hoja. En su plantilla
   esas cifras ya existen **por contrato** (hoja CIERRE), **por carro** (hoja FICHA VEHICULO:
   rentas, días, kilómetros, cobrado, pagado al dueño y utilidad), **por cliente** (FICHA
   CLIENTE) y en total de carros propios y subarrendados (hoja VEHICULOS). Lo que su plantilla
   **no** trae es un total «del mes»: es una suma que él arma sobre CONTRATOS, y este diseño no
   afirma que ya la tenga. De las cuatro cosas, «pendientes de cobro» sí está en el sistema, en
   la lista del mismo nombre de la pantalla principal (arriba). Las demás se miran en el
   archivo, que es una foto del día en que se bajó: para ver el mes en curso hay que bajarlo de
   nuevo (§10).
2. **«Se baja en Excel y PDF» de las comisiones.** Ninguna pantalla de comisiones baja un
   archivo, y el diseño deja de prometerlo. Ojo: aquí la razón de arriba **no** alcanza. El
   respaldo no lleva las comisiones ni sus pagos (§10, «lo que este archivo NO lleva»), así que
   las comisiones se ven y se pagan **solo en la pantalla**. Si algún día las quiere en un
   archivo, es trabajo nuevo y se le pregunta entonces.

Lo que no cambió: quien quiera ver la utilidad de un contrato o de un carro en pantalla, hoy, no
puede. Ese hueco ya no es un olvido, es una decisión.

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
  modelo, propiedad, dueño, estado y motivo si está fuera de servicio, y su
  mantenimiento: los servicios hechos y los intervalos que cambió el dueño en ese
  carro (`servicios[]` e `intervalos{}`, §7b; viven DENTRO del documento del carro y
  no en una colección aparte, §12b).
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
- `empleados` — quien renta los carros y cobra comisión: código, nombre, porcentaje
  de comisión y si trabaja aquí (los campos, en §7b). **Se lee con la sesión
  normal** —el mostrador escoge de ahí quién rentó, y de ahí sale el porcentaje que
  se sella en el contrato— y **se escribe solo con la credencial de dinero**
  (`firestore.rules`): el porcentaje solo se cambia detrás de la contraseña (§12b).
  Sin copia local: lo que se sella en un contrato tiene que ser el porcentaje de
  ahora, no el de la última vez que esa computadora sincronizó.
- `pagosComision` — lo que se le ha pagado a cada empleado de comisión: fecha,
  forma, monto y las rentas que cubre (los campos, en §7b; el «total» que decía esta
  lista es `monto`, el mismo nombre de todo otro pago). **Solo con la contraseña de
  dinero**, para leer y para escribir, y sin copia local, igual que `pagosDueno`.
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
- `horaTardia` es el **cobro por hora tardía**, y **vive en el cierre**:
  `cierre.horaTardia`, un monto en quetzales que se escribe al recibir el carro
  en «Hora tardía — precio» (bloque «Al recibir el carro», junto a `varios`).
  Pasa por `q()` como todo el dinero y **sí se cobra, al recibirlo y no al
  salir**: `lineasDevolucion` emite la línea «Hora tardía» solo si el monto no es
  cero, y entra al total de la devolución. Se cobra al devolver porque así lo
  cobra el dueño: cuando se le preguntó directamente dijo «solo al devolver». El
  formulario de «Sacar carro» ya no la pide ni la guarda. **No entra a la
  comisión**: `baseComision` no lo lee (§5), igual que los daños, el combustible
  y los varios. Es el mismo dato que el Excel guardaba en la celda «HORA TARDIA»
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

  **Hay tres formas guardadas, y las tres siguen en la nube.**
  `horaTardiaDe` (`nucleo/contrato.js`) es el único lugar que las lee y devuelve
  `{ alSalir, alRecibir, sinMonto }`:
  1. `cierre.horaTardia` (número): la de hoy. `alRecibir`, y entra a la
     devolución.
  2. `horaTardia` en la raíz del contrato (número): la de unas pocas horas, cuando
     se escribía al salir y se cobraba dentro del total de la salida. `alSalir`.
     Esos contratos ya se cobraron con ese total y se siguen leyendo donde se
     guardaron: moverlos le cambiaría el total a un contrato ya cobrado. Ningún
     contrato nuevo la escribe.
  3. `horaTardia: true` en la raíz: la casilla original. Quiere decir «hubo una
     hora tardía y nadie anotó cuánto»: la cifra **no se sabe y nunca se convierte
     en un número** (ni en Q1, que es lo que daría `q(true)`, ni en Q150), así
     que no es `alSalir` ni `alRecibir` (valen 0) y `sinMonto` deja que el
     detalle diga la verdad: «Hora tardía: Marcada al salir, sin monto
     registrado». Si después se anota un monto al recibir, deja de decirlo.

  Por eso ningún total de un contrato que ya se cobró y se cerró se movió, y no
  hay migración ni debe haberla: reescribir esos valores sería inventar un cobro
  que nadie hizo. Un contrato nuevo no trae `horaTardia` en la raíz.
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
  es `clienteId` y `clienteNombre`). Hasta el 13 de octubre se escribía a mano en
  «¿Quién lo rentó?»; desde entonces **se escoge de la lista de empleados**, por
  código o por nombre, y se guarda su nombre **tal como se vio ese día**: es un dato
  de *ese* contrato y no solo un puntero, como `carroAjeno.dueno` — si después se
  corrige el nombre en la ficha del empleado, el contrato sigue diciendo quién lo
  rentó. **Los contratos de antes traen ahí el texto que se escribió a mano, y siguen
  mostrándolo, buscándose por él y pagándose**: la cuenta de comisiones los junta por
  ese texto (grupo «sin enlazar») hasta que él los enlaza a un empleado de la lista
  (`empleadoId`, abajo). «Juan» y «juan» son dos grupos distintos hasta entonces: no
  se adivina que son la misma persona. Es la persona a quien le toca la comisión del
  contrato (`porcentajeComision`), y la búsqueda de contratos también lo encuentra
  por este nombre.
- `empleadoId` es el id del empleado escogido de la lista `empleados`, para que la
  cuenta de comisiones junte en una sola todo lo de la misma persona. Es el mismo
  patrón que `duenoId`: es `null`, no ausente, cuando no hay empleado, y los
  contratos de antes de este campo **ni siquiera traen la llave** — nada que lo lea
  puede exigirlo. «Sacar carro» no deja guardar sin escoger a un empleado (de él sale
  el porcentaje), así que en un contrato nuevo no es `null`; lo es en el que
  `construirContrato` arma sin empleado, que no se guarda. Enlazar los viejos es
  escribirles solo este campo y el sello `actualizado` (`enlazarContratosAlEmpleado`,
  `js/datos.js`), con `update` y no con el contrato entero y **con la credencial de
  dinero** (es una decisión suya sobre dinero, y así el día que una regla distinga quién
  toca `porcentajeComision` ya viene con la credencial correcta); `rentadoPor` no se toca.
- `empleadoCodigo` es el **código del empleado ese día** (15 de octubre de 2026), texto
  (`'6'`), sellado junto al nombre y al porcentaje. Existe porque la casilla del papel
  preimpreso donde cae «quién lo rentó» se llama **«PREPARADO POR (CODIGO)»**, con la palabra
  CÓDIGO impresa y 16 mm de ancho: el papel pide el código, no el nombre (y por eso el Excel
  del dueño trabaja por código, y él dijo desde el principio «normalmente usa el código 6»).
  Se sella, y no se lee de la lista de hoy, por la razón del porcentaje y más fuerte: **el
  papel impreso ese día llevó ese código, y una reimpresión tiene que decir lo mismo que el
  original**, aunque después le cambien el código al empleado en su ficha (es el mismo principio
  que rige el comprobante del dueño de un carro ajeno: lo que ya se entregó no cambia por lo
  que cambie la ficha). Es `null`, no `''`, cuando el empleado no tiene un código escrito: un
  vacío no se parece a un código. **`rentadoPor` se queda como está**: el nombre es lo que se
  lee en pantalla, y los contratos de antes solo tienen eso. **Los contratos de antes de este
  campo ni siquiera traen la llave y no se les inventa uno**: ni buscándolo en la lista de hoy
  (el código de hoy no es necesariamente el que escribió el papel de aquel día) ni dejando un
  vacío que parezca un código. Un contrato viejo se imprime sin código y el dueño lo escribe a
  mano, como hace hoy con todo el papel. Por lo mismo **enlazar** las rentas viejas a un empleado
  (`enlazarContratosAlEmpleado`) no lo escribe: el enlace afirma quién fue, no qué código llevaba
  el papel. Quien imprime lo lee de aquí (`js/nucleo/empleado.js:datosDelContratoPara` lo sella;
  `construirContrato` lo guarda); ausente, `null` y vacío significan «sin código».
- `porcentajeComision` es el porcentaje de comisión **de ese contrato, sellado el día
  que se rentó**: el que su empleado tenía guardado entonces (`datosDelContratoPara`,
  `nucleo/empleado.js`). Por eso subirle el porcentaje a alguien no mueve lo que ya
  ganó (§5), y por eso la cuenta de comisiones (`nucleo/comisiones.js`) lee **este** y
  nunca el de la ficha del empleado. Es un número, y el **0 es un porcentaje**: Wilder,
  el dueño, no gana comisión, y sus contratos llevan `0`. Un contrato que no trae un
  número legible (`undefined`, `''`, un texto) no se lee como 0 % ni como 5 %: se
  aparta como «sin porcentaje» y no se paga. Ya no hay un 5 % de respaldo en
  `construirContrato` ni un porcentaje por defecto en `ajustes`: el 5 % solo es lo que
  el formulario de un empleado nuevo propone.
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
  `guardarContrato` le da uno la primera vez que de verdad se guarda. Lo mismo
  hacen ahora el cliente, la reservación, el carro y el dueño (`nuevoIdCliente`,
  `nuevoIdReserva`, `nuevoIdVehiculo`, `nuevoIdDueno`), y sus `guardar*` se niegan
  sin `id`; `altaConIdFijo` (`js/datos.js`) decide cuándo se suelta (cuando el alta
  salió bien, y no antes: un `id` reutilizado después de un guardado bueno haría
  que el alta siguiente pisara a la anterior).
- `actualizado` es la hora del guardado, en milisegundos (`Date.now()`), y se
  pone de nuevo en cada guardado. Sirve para tres cosas. La copia local lo usa para
  decidir cuál de dos versiones gana (`mezclar`, `js/cache.js`: gana la de
  `actualizado` mayor). `guardarContrato` lo usa para saber si el contrato **ya
  existía**: uno que lo trae vino de la nube o de la copia local, y por eso no
  vuelve a escribir su costo del dueño en `privado/dinero` (la sesión normal no
  puede leer qué hay ahí). Un contrato nuevo no lo trae; si uno nuevo lo trajera
  copiado de uno viejo, se tomaría por uno que ya existía y su costo no se
  escribiría. Y es lo que impide que un guardado pise a otro sin saberlo: un
  contrato que ya existía solo se reescribe si en la nube su `actualizado` **es
  el mismo** que el de la copia con la que se abrió la pantalla (`cambioDesdeQueSeAbrio`,
  `js/datos.js`); si es otro, se niega y no guarda nada. Se compara por igualdad y
  no por orden, a diferencia de `mezclar`: «¿es la misma versión?» no depende de que
  dos computadoras tengan el reloj igual, «¿cuál es más nueva?» sí.

La lista viva sigue siendo lo que arma `construirContrato`
(`js/pantallas/sacarCarro.js`) y lo que sella `contratoParaGuardar`
(`js/datos.js`), igual que `CAMPOS_CLIENTE` lo es para el cliente.

**De un pago:**
`monto`, `forma`, `porcentajeTarjeta`, `fecha`, y los dos de la anulación,
`anulado` y `anuladoEn` (agregados el 11 de octubre: `anularPago` los escribe
desde que existe el botón «Anular» y esta lista no los nombraba).
- `anulado` es `true` en un pago que se anuló, y no existe en uno que no. El pago
  **no se borra ni se le toca el monto**: dinero recibido y luego revertido es
  algo que el dueño puede tener que explicarle a un cliente. `resumen()`
  (`nucleo/contrato.js`) es el único lugar donde un pago anulado deja de contar.
- `anuladoEn` es la fecha (ISO) en que se anuló, no la del pago. Un pago que ya
  estaba anulado no vuelve a cambiar su fecha.

**Del cierre:**
`fechaReal`, `horaReal`, `lugarEntrada`, `kmEntrada`, `combustible`, `danos`,
`danosDetalle`, `horaTardia`, `varios`, `variosDetalle`, `descuento`.

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
`dueno`, `fueraDeServicio`, `motivoFueraDeServicio`, y los dos del mantenimiento
(agregados el 16 de octubre de 2026): `servicios[]` e `intervalos{}`.

- `servicios[]` son los servicios que se le han hecho al carro, cada uno
  `{ id, tipo, fecha, km }` (y, si se anuló, `anulado` y `anuladoEn`). `tipo` es una de
  seis llaves SIN acento y en este orden: `aceite` (aceite y filtro), `frenos` (pastillas
  de freno), `llantas`, `bateria` (batería), `alineacion` (alineación y balanceo) y
  `general` (servicio general). `fecha` es el día en que se hizo (ISO) y **es obligatoria**:
  un servicio que no se puede fechar no cuenta para nada, ni resetea un plazo ni calla un
  aviso. `km` es el kilometraje del odómetro CUANDO se hizo el servicio: un entero mayor
  que cero, o `null` si no se sabe (nunca `0`: un cero guardado se leería como «anotado»).
  **El kilometraje de un servicio se guarda con el servicio** porque él puede hacer el cambio
  de aceite tres semanas después de que el carro volvió: el odómetro de hoy no es el último
  `kmEntrada`. Eso no contradice §12b —lo que ella prohíbe es llevar un kilometraje aparte por
  carro—; es anotar a qué kilometraje se hizo UN servicio. `id` se decide una vez por intención
  (`altaConIdFijo(nuevoIdServicio)`, `js/datos.js`) para que un reintento tras un tiempo vencido
  no lo agregue dos veces. `anulado` y `anuladoEn` se llaman **igual que en un pago** (§7b, «De
  un pago»), a propósito: se anula y no se borra, porque un servicio mal tecleado (el
  kilometraje con un cero de más) corrompería el plazo para siempre, y anulado deja de contar y
  se ve en el historial. Uno que ya estaba anulado no vuelve a cambiar su fecha.
- `intervalos{}` son los intervalos que el dueño cambió **en este carro**, `{ aceite: { km, meses } }`
  con solo las llaves de los servicios que cambió. Un servicio que no está aquí rige por los
  intervalos de siempre (`SERVICIOS`, `js/nucleo/mantenimiento.js`): así, el día que se cambie un
  valor por omisión llega a los carros que nunca lo tocaron, y escribir justo los de siempre no
  guarda nada. Un intervalo a medias, en cero o ilegible no rige: se usa el de siempre, nunca un hueco.
- **El kilometraje de un carro NO es un campo.** Sale de sus contratos y se calcula en un solo
  lugar, `kilometrajeDelCarro` (`js/nucleo/mantenimiento.js`): el mayor `cierre.kmEntrada` de los
  que ya regresaron y el `kmSalida` de los demás (con su puente de lectura `kilometrajeSalida`,
  abajo). **Sin contratos —o con contratos que nunca anotaron kilometraje— es «no se sabe», `null`,
  y no cero**: un servicio calculado sobre un cero inventado avisa mal el primer día. Un
  kilometraje guardado en `0` en un contrato es «no se anotó» (así lo trata `problemasDelCierre`).
  Un carro ajeno no lleva mantenimiento (`Boolean(c.ajeno)` sigue siendo el único criterio).
- Se escriben **dentro de una transacción que lee el carro** (`cambiarEnNubeYLocal`, `js/datos.js`),
  nunca reescribiendo la copia que la pantalla tenía en memoria: un arreglo dentro de un documento se
  pisa si dos pestañas lo guardan a ciegas, y un servicio perdido deja un aviso que no sale.
  **El guardado de la ficha («Guardar carro», `guardarVehiculo`) tampoco los escribe**, ni escribe las dos marcas
  del taller, `fueraDeServicio` y `motivoFueraDeServicio`: cada mano escribe lo suyo
  (`js/nucleo/carro.js`, `CAMPOS_CON_SU_PROPIO_ESCRITOR`). Las marcas del taller las escriben solo
  «Marcar fuera de servicio» y «Volver a habilitar» (también `#/habilitar/:id`), que mandan SOLO esas dos
  llaves y no el carro entero (`marcarCarroFueraDeServicio` y `habilitarCarro`). Para un carro que ya existe,
  la ficha lee el carro DENTRO de la transacción, le pone encima lo que trae la pantalla y deja lo ajeno
  como la nube lo tiene (`carroConLoDeLaFicha`). Es una mezcla y no un rechazo (`CODIGO_COPIA_VIEJA` es de
  los contratos) porque la ficha no edita ni el historial ni el taller: no hay dos listas que reconciliar, y
  negarse por el sello `actualizado` —que sube con cada servicio anotado— sería negarse por nada. Lo que
  la copia vieja de una pantalla podía hacer, y ya no hace, es devolver el historial a una lista de ayer
  o, peor, volver «disponible» un carro que otra computadora acababa de mandar al taller. Lo que sí sigue
  igual, y se dice: los campos que la ficha escribe (placas, tipo, marca, línea, color, modelo) los
  escribe la pantalla tal como los trae, y el último que guarda gana. Un carro NUEVO no tiene nada que leer
  y se crea como siempre (sin marcas del taller: nace disponible).
- **Ojo con los nombres: la misma palabra, otro dato.** Es lo contrario de «un dato, dos
  nombres» y cuesta igual, porque tampoco da error: da una respuesta equivocada.
  `servicios[].tipo` (`'aceite'`, `'frenos'`…) **no** es el `tipo` del carro (`'Pickup'`, `'Sedán'`):
  los dos viven en el mismo documento. `servicios[].km` es el odómetro CUANDO se hizo ese servicio y
  **no** es `kmSalida` ni `kmEntrada` del contrato (el odómetro al salir y al regresar en una renta): se
  teclea en la ficha del carro, vale solo para ese servicio y no sube el kilometraje del carro, que sale
  de los contratos. Y `intervalos{ aceite: { km, meses } }.km` es una distancia ENTRE servicios (5,000),
  no una lectura del odómetro. No se renombra ninguno —cada uno es lo que dice su lugar—; lo que se
  exige es que nadie lea uno como si fuera otro.

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
`duenoId`, `fecha`, `forma`, `monto`, `contratos[]`, `numero`, `actualizado`, los
dos de la anulación, `anulado` y `anuladoEn` (agregados el 11 de octubre), y
`descuento` (agregado el 12 de octubre, opcional).

- `descuento` es, de lo que suman las rentas que cubre el pago (`monto`), la parte
  que **no se entregó** porque a ese dueño ya se le había pagado de más antes
  (H-7). **`monto` no se toca:** sigue siendo lo que suman las rentas, y todo lo que
  se compara contra lo que esas rentas cuestan hoy (`gruposDePago`, la nota de
  «cambiaron» del comprobante) compara contra él, así que una renta de Q1,200
  pagada con Q600 de descuento está pagada y no «a medias». Lo que de verdad salió
  de las manos de él es `monto − descuento`, y esa resta está en un solo lugar,
  `entregadoDelPago` (`nucleo/liquidacion.js`); con `descuentoDelPago` y
  `totalesDePagos` son lo que ninguna pantalla repite. Solo se guarda cuando hay
  uno (un pago de antes del descuento no trae el campo, y se lee como sin
  descuento), y `guardarPagoDueno` no deja guardar uno negativo ni mayor que el
  `monto`. **Ojo con el nombre:** `descuento` también es un campo del cierre (arriba,
  `cierre{}`: lo que se le rebaja al CLIENTE al recibir el carro). No es el mismo
  campo ni el mismo dinero, y por eso la palabra «descuento» no sale en el
  comprobante del dueño (ver §6 de la liquidación).

- `anulado` y `anuladoEn` se llaman **igual que en un pago del cliente** (arriba), a
  propósito: es la misma idea y la misma forma, y un segundo nombre sería un segundo
  lugar donde equivocarse. `anularPagoDueno` (`js/datos.js`) los escribe y no toca
  nada más: **el pago conserva su `numero`, su `monto` y sus `contratos[]`**. Se
  anula en vez de borrar porque ese dueño ya tiene un papel con el número del
  comprobante, y un número de comprobante no se reutiliza ni se pierde. Un pago
  anulado sigue en «Ya pagado», marcado, y su comprobante no se vuelve a armar.
- Un pago anulado **deja de cubrir sus rentas**: `contratos[]` ya no dice que se
  pagaron, y vuelven a «por pagar». Eso se decide en un solo lugar,
  `pagoAnulado` en `nucleo/liquidacion.js` (por donde `cuentaDeDueno` y los grupos
  de pagos reciben los pagos), igual que `resumen()` lo es para el cliente. Si el
  mismo pago llega dos veces, gana la copia de `actualizado` mayor, que es la
  anulada: anular vuelve a sellar el pago (`pagoDuenoParaGuardar`).

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

**Del empleado** (colección `empleados`; agregado el 13 de octubre):
`codigo`, `nombre`, `porcentajeComision`, `activo`, `actualizado`.

Los cuatro primeros son los de `CAMPOS_EMPLEADO` (`js/nucleo/empleado.js`), que es la
lista viva: la ficha dibuja su formulario desde ahí.
- `codigo` es el código del empleado, **texto** y no número (se compara sin espacios ni
  mayúsculas): la hoja de Excel del dueño trabaja por código, y en el mostrador teclea
  `6` o busca «Wilder», lo que sea más rápido (los dos). **No se repite entre empleados,
  contando a los dados de baja**: teclear `6` tiene que dar a uno solo. Buscar `6` da
  primero al empleado cuyo código es exactamente 6 (`buscarEmpleados`).
- `nombre` es el nombre del empleado, el que se muestra. Obligatorio.
- `porcentajeComision` es el porcentaje **de hoy**. Se llama igual que el del contrato
  (arriba) a propósito, porque es el mismo dato: el del contrato es una copia que se
  sella el día que se renta. Un número de 0 a 100 con centavos, **obligatorio y el 0
  vale**: no se deja guardar un empleado sin él, ni se asume 5. Solo se escribe con la
  credencial de dinero.
- `activo` es si trabaja aquí. **Dar de baja no borra**: sus contratos viejos siguen
  siendo suyos y siguen pagándose, y su código sigue siendo suyo. Un empleado sin la
  llave `activo` trabaja aquí. Solo los activos salen al escoger quién rentó.
- `actualizado` lo sella `empleadoParaGuardar` al guardar, y `id` se decide antes del
  primer intento (`nuevoIdEmpleado`), como el de un dueño.

**Del pago de comisión** (colección `pagosComision`; agregado el 13 de octubre):
`empleadoId`, `fecha`, `forma`, `monto`, `contratos[]`, `actualizado`, y los dos de la
anulación, `anulado` y `anuladoEn`.

Es la gemela del pago a un dueño y se llama igual donde es el mismo dato. **No lleva
`numero`**: el de un pago a un dueño es el correlativo del comprobante que se le
entrega, y a un empleado no se le imprime nada.
- `empleadoId` es `null` en un pago hecho a un grupo de rentas viejas con el nombre
  escrito a mano; el pago sigue siendo de ese empleado si después se enlazan, porque
  se reconoce por las rentas que cubre (`contratos[]`), no por este campo.
- `monto` y `contratos[]` nacen juntos, de la misma lista y en un solo lugar,
  `construirPagoComision`, que toma de `elegirParaPagoDeComision`
  (`nucleo/comisiones.js`) lo que se paga. **Solo entra una renta de un contrato
  CERRADO** (§5, corregido el 14 de octubre de 2026): `estadoContrato(c) ===
  'cerrado'`, la misma pregunta que decide si se le puede pagar al dueño de un carro
  ajeno. Una renta cuyo carro sigue afuera (su comisión es un estimado: un día de
  atraso la sube y un descuento la baja) o que volvió pero cuyo cliente todavía debe
  saldo o tiene la garantía sin liberar no entra, ni con su dinero ni con su id,
  aunque su casilla siga marcada. Una renta con comisión de Q0.00 (el 0 % de Wilder, o
  una base que el descuento se comió) tampoco entra: un pago en cero no prueba que se
  pagó nada, y `guardarPagoComision` se niega.
- `forma` es efectivo, transferencia o cheque (`FORMAS_DE_PAGO`), el mismo conjunto que
  el pago a un dueño. Sin `porcentajeTarjeta`.
- `anulado` y `anuladoEn` se llaman **igual que en un pago del cliente y en uno a un
  dueño**, y son la misma función (`anularPagoComision` delega en `anularPagoDueno`):
  un segundo modo de anular sería un segundo lugar donde equivocarse. El pago conserva
  su `monto` y sus `contratos[]` y sigue en «Ya pagado», marcado; sus rentas vuelven a
  «por pagar» (`pagoAnulado`, `nucleo/liquidacion.js`, es el único lugar que lo decide).
- Que una renta esté pagada lo dice **solo** que su id aparezca en el `contratos[]` de
  un pago vigente. El contrato no lleva un campo «pagado», por lo mismo que no lo lleva
  el pago a un dueño. Si después de pagar se corrige un cierre y las rentas de un pago
  ya suman otra cosa que su `monto`, la ficha lo dice con palabras
  (`pagosQueCambiaron`) y no cambia lo que se debe: no se paga ni se descuenta nada solo.

**Del respaldo** (documento `ajustes/respaldo`; agregado el 14 de octubre):
`porAnio`, un mapa de año a la fecha ISO en que se bajó el respaldo de ese año:
`{ "2026": "2026-10-12" }`. Es la única llave. `anotarRespaldo` la escribe con
`merge` y por año (bajar 2027 no pisa la fecha de 2026), después de entregar el archivo
(§10). El último respaldo es la fecha más reciente (`ultimoRespaldo`) y un año está
completo solo si se bajó después de que terminó (`estadoDeLosAnios`,
`nucleo/respaldo.js`). Una fecha que no se entiende nunca silencia el aviso.

**Del respaldo, de campo a columna** (`js/respaldo/mapa.js` es la lista viva, como
`CAMPOS_CLIENTE` lo es del cliente; los encabezados de su Excel que se comprueban están
en `js/respaldo/diseno.js`). Lo que no es obvio:
- **Clientes.** Su hoja parte el nombre en cuatro columnas y el sistema guarda
  `apellidos` y `nombres` enteros: no se adivina dónde cortar «María del Carmen López de
  Pérez». Los apellidos enteros van en 1er APELLIDO y los nombres enteros en 1er NOMBRE;
  las columnas del 2do quedan vacías (su hoja las junta igual). El CODIGO de su hoja es
  la posición de la fila: los clientes van en orden alfabético y `clienteId` de cada
  contrato se traduce a ese código. `nacionalidad` y `pais` (de antes de que la ficha los
  quitara) se conservan; `licenciaEmision` (una fecha) no tiene columna: LUGAR EMISION es
  `licenciaEmitidaEn`. `facturarA` no tiene celda en sus filas de datos.
- **Carros.** El carro con `codigo` k va en la fila k+2, para que la columna CODIGO de su
  hoja (que cuenta sola) diga lo mismo que la pantalla de Carros. `fueraDeServicio` y
  `motivoFueraDeServicio` no tienen columna, ni `servicios[]` e `intervalos{}` (el mantenimiento, §10).
- **Contratos.** `numero` va en A y las filas son contiguas desde la 6 (su hoja pega la
  siguiente renta en `COUNT(A6:A1005)+6`: un hueco la pegaría encima de otra). `clienteId`
  y `carroId` se traducen a los códigos de su hoja; un carro ajeno deja COD. CARRO vacío y
  llena las columnas SUBARR. con `carroAjeno{placas, tipo, marca, color, modelo, dueno,
  costoDia}`. `tarjetas[]` entran como `XXXX XXXX XXXX` y `ultimos4` (ADR-001); su hoja
  tiene dos, de la tercera en adelante van a COMENTARIOS. Las fechas son fechas de Excel y
  las horas fracciones del día. HORA ENTRADA y LUGAR ENTRADA salen de `cierre.horaReal` y
  `cierre.lugarEntrada` (la hora **real**, no la prevista; vacías mientras el carro no haya
  vuelto: §10). `pagos[]` se resume en FORMA DE PAGO (una forma, o MIXTO)
  y en % TARJETA (solo si todo se pagó con tarjeta con un mismo porcentaje).
  `duenoId`/`pagosDueno` dicen PAGADO AL DUEÑO (SI/NO) y su fecha. `empleadoCodigo` va a RENTADO
  POR (vacía si el contrato no lo trae) y `rentadoPor` a COMENTARIOS, «Rentado por: …» (§10).
- **Sin campo en el sistema:** PERSONA O EMPRESA y NIT, T. CIRCULACION ORIGINAL y
  AUTENTICA, SEMANA, MES y COMBUSTIBLE X GALON (en CONTRATOS) quedan vacías.
- **Sin columna en su hoja:** `porcentajeComision`, `garantiaLiberada` y
  `garantiaLiberadaEn` (si la garantía sigue sin soltar, COMENTARIOS lo dice),
  `cierre.varios` y `cierre.variosDetalle`, `cierre.danosDetalle` (va a COMENTARIOS) y el
  detalle de cada pago. Las colecciones `reservas`, `empleados`, `pagosComision`,
  `pagosDueno` y `duenos` no se respaldan (§10).
- **Una hora tardía de una sola forma.** `horaTardiaDe` (`nucleo/contrato.js`) es quien
  la lee, igual que en el resto del sistema: lo escrito al salir y lo escrito al recibir
  suman en la columna HORA TARDIA.

**Los puentes de lectura que siguen en el código:**
- `nucleo/comisiones.js:agruparPorEmpleado()` — junta las rentas por `empleadoId` y, si
  no lo traen (las de antes de la lista de empleados), por el texto de `rentadoPor`,
  sin recortar más que los espacios. Ninguna renta se queda fuera de la vista por no
  estar enlazada.
- `pantallas/contratos.js:formaDePago()` — lee `forma` o `formaPago`, por los pagos de la salida que
  salieron guardados con el segundo nombre.
- `nucleo/contrato.js:conKmSalidaNormalizado()` (la pantalla de Recibir carro lo vuelve a exportar) — el
  puente real entre `kmSalida` y `kilometrajeSalida`, por los contratos antiguos que lo salvaron con el
  nombre viejo. Bajó de `pantallas/recibirCarro.js` al núcleo el 16 de octubre de 2026 porque el
  mantenimiento lo necesita para saber en cuántos kilómetros anda un carro, y un núcleo no importa de una
  pantalla; una sola copia.
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

### Hasta cuándo ocupa un contrato su carro

Una sola regla, `finDelContrato(c, hoy)` en `nucleo/estados.js`. Todo lo que
pregunte «¿este carro está libre de tal día en adelante?» — el aviso al sacar un
carro (`avisosDeSalida`), los choques de una reservación (`choquesDeReserva`) —
pregunta ahí, vía `seCruzanConContrato` y `textoDeOcupacion` (`nucleo/reserva.js`),
y ninguno vuelve a mirar `devolucionPrevista` por su cuenta:

- **El carro ya volvió** (`cierre.fechaReal`, la única marca de un regreso): el
  contrato ocupa el carro hasta ese día, sea antes o después de lo previsto. Un
  contrato `devuelto` (carro en el patio, saldo por cobrar) NO bloquea el carro.
- **El carro sigue afuera, a tiempo:** hasta la `devolucionPrevista`.
- **El carro sigue afuera y ya pasó su fecha prevista:** no queda libre ni hoy
  (mañana, como pronto), con `hoy` recibido y nunca leído del reloj dentro de la
  regla: está registrado como afuera, así que hoy no puede salir otra vez. Una
  renta que empieza hoy avisa; una que empieza mañana o después no, porque nadie
  sabe cuándo volverá. El aviso lo dice como es («debía volver el 8 oct 2026 y
  sigue afuera»), no como si «mañana» fuera una fecha de regreso. (El pendiente
  de la revisión de reservaciones proponía «el mayor entre la fecha prevista y
  hoy»; con eso, como tocarse no es cruzarse, una renta que empieza hoy nunca
  avisaría, y era justo el caso que había que atajar.)

Solo se aplica a contratos: una reservación no tiene `cierre` ni se «atrasa».
`seCruzan` compara dos rangos previstos y es solo para reservaciones.

Salió de dos hallazgos que eran el mismo error visto de los dos lados. Primero el
del dueño, con el carro ya recibido: «recibí el carro antes y ya quedó libre, pero
me sigue apareciendo que lo devuelven el 12» (el contrato seguía abierto por un
saldo y se comparaba contra la fecha prevista). Y el que la revisión final del plan
de reservaciones (29 de septiembre) había diferido a propósito: un carro atrasado no
bloqueaba una reservación posterior, justo el carro con menos probabilidad de estar
libre. Arreglar uno sin el otro habría dejado dos reglas de «fin de un contrato».

Lo que se revisó y NO cambia: `estadoCarro` (usa `cierre.fechaReal` para saber si
está afuera, y la fecha prevista solo para contar el atraso de un carro que sí lo
está) y el calendario (`regresan` y `atrasados` solo miran contratos que siguen
afuera; `yaRegresaron` lista los citados ese día que ya volvieron). Para que
«atrasado» y «ya volvió» tampoco tengan dos copias, el calendario importa esas
dos preguntas de `estados.js`.

### Pendientes conocidos del dinero

Hallados en las revisiones del plan de liquidación a dueños (5 de octubre) y
**diferidos a propósito**, no olvidados.

**`porcentajeComision` sigue en el documento del contrato**, legible con una
sesión normal. *(13 de octubre: el plan de empleados y comisiones lo decidió y NO lo
movió; la decisión y sus razones están abajo, tras este párrafo, que se deja como se
escribió.)* §7 ya decía que el plan de dinero tenía que mover **los dos**
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

**La decisión del 13 de octubre (plan de empleados y comisiones): no se mueve, y mover
solo el campo del contrato no habría cerrado nada.** Tres razones, de la más a la menos
importante:

1. **El mostrador tiene que LEER el porcentaje del empleado para poder sellarlo.** El
   contrato se queda con el porcentaje que el empleado tenga guardado ese día (§12b y
   §5), y quien escribe el contrato es la sesión del mostrador. Ese número vive en
   `empleados/{id}`, que la regla del dueño deja leer con cualquier sesión
   (`allow read: if haySesion()`) justo para escoger quién rentó. Un empleado en el
   mostrador que abre las herramientas del navegador lo lee de ahí, haya movido o no el
   campo del contrato. Para que el mostrador no lo viera habría que sellarlo de otra
   manera —que lo escriba alguien con la credencial de dinero, o guardar un historial
   de porcentajes por fecha donde solo se lea con ella—, y las dos cosas piden una
   regla nueva (`empleados/{id}/privado/…`) y rediseñar el sellado: no es el trabajo de
   este plan, que además tenía el encargo de no tocar `firestore.rules`.
2. **La lectura no es el hueco que pesa. La escritura sí.** §12b dice que el porcentaje
   no se *cambia* en el mostrador, y eso hoy se cumple en `empleados` (escribe solo
   dinero) pero **no en el contrato**: `contratos/{id}` lo escribe cualquier sesión, y
   `privado/{doc}` también (`allow create, update: if haySesion()`), así que un
   empleado con las herramientas del navegador podría subir el `porcentajeComision` de
   sus propios contratos antes de que se pague, y la cuenta de comisiones, que lee el
   del contrato, lo pagaría. Moverlo a `privado/dinero` no lo arregla (ahí también
   escribe cualquier sesión). Lo que sí lo cerraría es una regla: que `porcentajeComision`
   de un contrato no cambie al actualizarlo (salvo con la credencial de dinero, que es
   con la que se enlazan las rentas viejas) y que al crearlo sea igual al del empleado
   que dice `empleadoId`. Es una regla de pocas líneas, y es lo que hay que decidir
   **antes de que un empleado use el mostrador**.
3. **Mientras tanto, los contratos ya guardados no se pierden ni se mueven.** El campo se
   queda donde estaba, `construirContrato` lo sigue sellando y la copia local de
   contratos lo sigue llevando (a diferencia del costo del dueño, que sí se limpia de
   ahí). Nada se migra, así que no hay un segundo botón de «mover» que correr.

Hoy él es el único que usa el sistema, así que nada de esto corre prisa. Lo que queda
anotado para el día que no sea así: (1) decidir si basta con que el mostrador vea los
porcentajes (se leen, no se cambian) o no; (2) la regla de la escritura, aunque se decida
lo primero. Ninguna de las dos se resuelve cambiando de lugar el campo.

**Actualización del 21 de octubre de 2026.** El punto (2) se decidió y está escrito en
`firestore.rules` (§11 y ADR-002): el porcentaje de un contrato que ya existe no cambia
salvo con la credencial de dinero, y borrar contratos también la pide. **La parte de la
razón 2 que decía «y que al crearlo sea igual al del empleado que dice `empleadoId`» NO se
hizo**: crear sigue abierto a cualquier sesión, con las razones en ADR-002 (falla cerrada, no se
puede probar aquí, y hay maneras reales de bloquear una salida legítima). El punto (1) sigue
pendiente: el mostrador sigue leyendo los porcentajes.

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

### 8b. El contrato sobre el papel, tal como se construyó (14 y 15 de octubre de 2026)

Dónde vive: `js/nucleo/hojaContrato.js` (la tabla `CAMPOS` y la calibración, sin DOM),
`js/pantallas/contratoImpreso.js` (la hoja, la hoja de prueba y las dos pantallas) y
`css/contrato-papel.css`. La ruta es `#/imprimir/:contratoId` (botón «Imprimir
contrato» en la ficha del contrato) y `#/impresion/calibrar`. Cómo se midió la hoja de
Excel, con qué, y los números crudos: `analisis/imp-contrato/`.

**Lo que decidió el dueño el 14 de octubre de 2026, y de dónde sale cada decisión.**
Cada una está también escrita, con su fecha, en la nota del campo de la tabla
`CAMPOS`: dentro de seis meses «¿por qué sale el kilometraje aquí?» tiene respuesta
en el código.

1. **Cómo imprime hoy: «Así como está en la hoja de Excel, así la imprimo y casi
   siempre sale bien.»** La geometría de la hoja IMP. CONTRATO **es** la verdad y el
   sistema la reproduce. Se midió con el propio Excel (una copia del libro exportada a
   PDF con borde en cada celda), porque el archivo guarda anchos en «caracteres» y
   Excel los redondea al imprimir: 797 × 749 unidades de pantalla, a 0.89 de su
   tamaño, son **250.2 × 235.2 mm**, y la carta solo deja 193 mm de ancho entre los
   márgenes que él le puso a Excel (18 mm a la izquierda, 5 a la derecha). Con la
   configuración guardada, Excel la parte en dos hojas (A–V y W–Z). Que a él «casi
   siempre le salga bien» significa que su impresora, o el diálogo de imprimir, la
   encoge. Por eso la escala por omisión es la que cabe (`ESCALA_QUE_CABE` = 0.77,
   193 / 250.2), y la **calibración** es el instrumento para confirmar eso sin teoría.
2. **La calibración es UN solo cambio para toda la hoja:** corrimiento (`dx`, `dy`, en
   mm) y tamaño (`escala`), aplicados una sola vez sobre la esquina de la hoja
   (`transform` del lienzo). Ningún campo tiene su propio ajuste: si uno no calza y
   los demás sí, el problema es la tabla y se arregla en la tabla. Se guarda por
   impresora, con el nombre que él le ponga, **en esa computadora** (`localStorage`: una
   impresora está conectada a una computadora y el ajuste no es un dato del negocio).
   La hoja de prueba lleva una regla en milímetros, cuatro casillas numeradas (una por
   esquina) y los pasos en palabras: primero que la impresora no encoja (la marca 10 a
   la 110 mide 100 mm), después la posición (casilla 1) y al final el tamaño (casilla
   4). Si una calibración deja casillas fuera de la carta, la pantalla lo dice.
3. **Los rótulos: «el papel NO los trae».** Los imprime el sistema: `ACEPTO LOS CARGOS
   A MI TARJETA NUMERO`, `TARJETA 1  No:`, `EXPIRA:` (dos veces), `CODIGO CBC` (dos
   veces), `BANCO EMISOR`, `CODIGO`, `GUATEMALA` y ` + iva`: diez campos, ocho textos,
   con la fuente, el tamaño y el lugar de Excel y sus espacios tal cual.
4. **La letra blanca, sí se imprime.** En Excel nueve datos con fuente en el sistema
   están en letra blanca (kilometraje de salida, vencimiento de la licencia, nombre
   del conductor adicional, seguro de menores, seguro PAI, deducible bajo, varios:
   descripción y precio, y la autorización de la tarjeta 2): se imprimían pero no se
   veían en el papel que firma el cliente. Desde esta fecha se ven, por decisión suya
   con la lista delante. Hay dos celdas más en blanco en Excel que **no** se agregaron:
   E27 (la ciudad adicional, que el 3 de octubre él dijo que no se imprime) e I27 (un
   `0` fijo que no significa nada).
5. **Lo que el papel lleva y el sistema no guarda: «lo que tú creas conveniente».**
   - *A quién se factura* (`facturarNombre`, `facturarNit`) se teclea en la pantalla
     de imprimir y no se guarda: varía de renta en renta y guardarlo obligaría a tocar
     la ficha del cliente. Mismo camino que el CBC (ADR-001).
   - *El lugar de entrada* se precarga con el `lugar` de la salida y se corrige ahí.
   - *Las dos tarifas del papel* —hora tardía **Q150** y combustible **Q65** por
     galón, las del `INGRESO DE DATOS` de su Excel— son constantes del código
     (`TARIFAS_DEL_PAPEL`), precargadas y corregibles al imprimir. No hay colección ni
     pantalla de ajustes: si algún día cambian, es una línea.
   - *El código del cliente* se queda **vacío**: en Excel es el número de fila de su
     hoja CLIENTES y no significa nada en este sistema.
   - Todo esto se borra al terminar de imprimir y al salir de la pantalla.
6. **El número completo de la tarjeta y el CBC** se teclean en esa misma pantalla, solo
   para ese papel (ADR-001): no van al contrato, ni a la nube, ni a la copia local, ni
   al almacén del navegador, y se borran cuando termina el diálogo de imprimir
   (`afterprint`, imprima o cancele) y al salir de la pantalla. Sin ellos, la hoja
   lleva `•••• 3343`. **No se debe guardar esa hoja como PDF**: quedaría un archivo con
   la tarjeta en la computadora; la pantalla lo dice. (Desde el 16 de octubre, si se llega a
   esa pantalla directo desde guardar la salida en «Sacar carro», ya vienen puestos: punto 16.)
7. **La hora de entrada: «Igual que el Excel».** La casilla de la hora de entrada repite la
   hora de salida (en Excel las dos leen la misma celda). Es decisión suya, no una copia
   heredada sin preguntar; el contrato no guarda una hora de entrada prevista.
8. **La «Q»: su papel no la trae.** Por eso los montos se imprimen con ella
   (`QUETZAL_EN_EL_PAPEL`, una línea si algún día cambia de papelería).
9. **El nivel del tanque no se imprime: «Yo lo escribo mejor».** `combustibleSalida` queda
   fuera (`imprime: false` en la tabla): el sistema guarda «Lleno, 3/4…», el papel dice
   «FULL», y traducir entre los dos vocabularios habría sido una tabla de conversión que se
   desactualiza sola el día que él agregue una opción. La tarifa por galón (Q65) sí sale.
10. **La autorización de la tarjeta 1 sí se imprime, y su casilla es la única DERIVADA, no
    medida.** En Excel su celda (la combinada vacía `M29:P31`, pegada al monto autorizado)
    nunca imprimió nada, así que no hay un texto medido: del rectángulo y de la alineación
    se tomaron de la propia celda de Excel; la fuente y el tamaño (Arial 10) son los de
    la autorización de la tarjeta 2, que sí está medida. La hoja de prueba la dibuja con
    raya de trazos y la nombra como derivada, porque es la que hay que mirar con más
    atención contra el papel.
11. **El número de contrato no se imprime, y no es un olvido.** Dijo: «yo pongo el número de
    contrato porque es el que está en las hojas membretadas». Viene preimpreso en su
    papelería, por eso ni Excel ni el sistema lo imprimen y por eso el sistema le deja
    teclearlo a él al sacar el carro. No hay un campo `numero` en la tabla a propósito.

**Lo que dijo el 15 de octubre de 2026, con la foto de su hoja membretada en blanco.** (El
coordinador la describió; el orden de las casillas de la columna derecha del papel, de arriba
abajo, es exactamente el orden de los campos medidos en el PDF de Excel: una comprobación
independiente de la medición. El bloque de la tarjeta no existe en el papel, hay un área en blanco
justo donde la tabla lo coloca; y el número de contrato viene preimpreso en rojo arriba a la
derecha.)

12. **«PREPARADO POR (CODIGO)»: el papel pide el código del empleado, no su nombre.** La casilla
    (`T58:U59`, 16 mm) dice la palabra CÓDIGO impresa. El campo `empleadoCodigo` reemplazó a
    `rentadoPor`: imprime lo que el contrato **selló** ese día en `empleadoCodigo`. Con la llave
    ausente, `null` o `''` (un contrato viejo, o un empleado sin código escrito) la casilla sale en
    **blanco** y él la escribe a mano, como el resto del papel. Nunca el nombre y nunca un código
    buscado en la lista de empleados de hoy: el papel de aquel día llevaba el código de aquel día.
    Al lado hay otra casilla, «COMPUTADO POR (CODIGO)», que ni Excel ni el sistema llenan; se deja así.
13. **«LDW Q.» y «PAI Q.» traen la Q impresa en el papel.** Su «el papel no la trae» (punto 8) vale
    para el resto de los montos. Esas dos casillas dicen la Q con punto, así que `seguro` y
    `seguroPai` salen **sin** la Q, para que no se lea «Q. Q150.00». No es un `if` en el dibujo: es la
    marca `sinQ` en la tabla `CAMPOS`, con su razón y su fecha, porque es un dato del papel y no una
    preferencia del código. `deducibleCopia` (el deducible de abajo) también lleva `sinQ`, por otra
    razón: el formato de su celda en Excel es «0.00», sin Q; esa parte del papel no se vio en la foto.
14. **Carta u Oficio, por impresora.** `PAPELES` tiene `carta` (215.9 × 279.4 mm) y `oficio`
    (8.5 × 13 pulgadas = 215.9 × 330.2 mm: **no** es Legal, que mide 14 pulgadas). Se escoge en la
    pantalla de calibrar y se guarda con el resto del ajuste de esa impresora (`papel`). El ancho es
    el mismo, así que la escala horizontal no cambia y la tabla de campos no se toca. Mientras él no
    conteste cuál usa, la hoja nace en Carta: `PAPEL_POR_OMISION` es **una línea**.
15. **Formato contable de seis casillas.** En Excel, las celdas de hora tardía, seguro de terceros,
    LDW, combustible por galón, seguro de menores y varios (precio) tienen el formato
    `_("Q"* #,##0.00_)`: la Q pegada al borde izquierdo y el número al derecho, con un hueco en
    medio. Se midió en el PDF de Excel (la Q a unos 2.5 mm del borde izquierdo; el número termina a
    unos 2.2 mm del derecho) y la hoja las dibuja así (`contable: true` en la tabla). **Duda abierta
    en LDW:** Excel imprime su propia Q en el borde izquierdo de una casilla cuyo papel ya trae
    «LDW Q.»: o la de Excel se encima justo sobre la impresa, o su papel de hoy sale con dos Q sin
    que nadie lo note. No se sabe sin el papel enfrente. El sistema imprime solo el número, donde
    Excel pone el suyo.
16. **El número y el CBC pasan de «Sacar carro» a imprimir sin guardarse (16 de octubre de 2026).**
    Aprobado por el dueño: con el cliente enfrente, no se teclean dos veces. Es una aclaración del
    ADR-001, que la lleva escrita. Al guardar la salida **con número o CBC tecleados**, la pantalla va
    directo a imprimir ESE contrato y las dos tarjetas ya vienen puestas; sin ellos (una renta en
    efectivo) no se deja nada en el traspaso (a dónde se va en ese caso lo cambió el punto 17: antes
    iba a la flota, desde el 19 de octubre también va a imprimir). Los datos viven en una variable de memoria
    (`js/pantallas/traspasoDeTarjetas.js`) y en ningún almacén. Se cierra por cuatro lados: atados al
    id del contrato (la hoja de otro contrato no los ve), entregados una sola vez, borrados al cambiar
    de pantalla a cualquier lado que no sea imprimir ese contrato, y vencidos al minuto. Guardar otra
    renta los reemplaza, y una sin tarjeta también los borra. La pantalla de imprimir los pone solo si
    el número termina en los últimos 4 dígitos que el contrato guardó. Si no llegó nada (dirección
    escrita a mano, recargar, volver otro día) las cajas están vacías y se teclean como siempre.
17. **Guardar una salida siempre lleva a imprimir (decisión del 16 de octubre de 2026; construido el
    19).** Dicho por el dueño: *«La tarjeta siempre se imprime al contrato para que el cliente la
    vea.»* Él imprime un contrato por cada renta, en su papel membretado. El botón ya decía
    «Guardar e imprimir contrato», pero hacía dos cosas según cómo pagó el cliente (con número o CBC
    tecleados iba a imprimir; en efectivo, a la flota), y eso es lo que rechazó. Ahora
    `destinoDespuesDeGuardar` (`js/pantallas/sacarCarro.js`) contesta **dos preguntas que no se
    mezclan**: la *ruta* es la hoja de imprimir de ESE contrato siempre que haya id de contrato y la
    pantalla siga a la vista (`sigueAqui`; si se fue a otra parte mientras guardaba, no se le lleva a
    una hoja que no esperaba y la ruta es la flota de siempre); y `llevaTarjetas`, que sigue
    significando «hay número o CBC tecleados» y es lo **único** que decide si se deja algo en el
    traspaso del punto 16. Una renta en efectivo llega a imprimir con las cajas vacías, y lo que
    hubiera dejado la renta anterior ya se borró. Deducir lo segundo de lo primero («voy a imprimir,
    luego hay tarjeta») sería volver a dejar en memoria lo que no hay, que es el camino a que la
    tarjeta de un cliente salga en la hoja de otro. Las cuatro defensas del punto 16 no cambian.

**Lo que el papel permitiría y hoy no se hace (no es para ahora; decisión suya).** El papel tiene
toda una columna de liquidación (DAÑOS, COMBUSTIBLE, VARIOS, DEDUCIBLE, TOTAL CARGOS, MENOS
DEPOSITO, IMPORTE A PAGAR, TOTAL DUE, FIRMA DE LIQUIDACION) que su Excel **no imprime** y de la que
el sistema ya tiene todos los datos al cerrar el contrato: una segunda impresión sobre el mismo
papel al recibir el carro es una opción real. También hay casillas que el sistema podría llenar y no
llena: RESERVACION No., CARRO DEVUELTO EN con su fecha y hora de entrada, MANEJADOS (los kilómetros
recorridos, que el sistema sabe restando) y DIAS A / SEMANAS A. En TARJETA DE CIRCULACION el papel trae
preimpresos «ORIGINAL Q 1,000.00» y «AUTENTICA Q 150.00»; el sistema no tiene ese dato y ahí no imprime.

**Lo que hay que mirar con el papel enfrente el día de la calibración.** Ese día él tiene la
hoja de prueba en una mano y su formulario en la otra, y puede contestar todo mirando:
la calibración misma (la escala 0.77 es una hipótesis hasta entonces); si el papel tiene una
casilla por apellido y por nombre (el sistema los guarda en un solo texto, así que hoy el
texto completo sale en la primera casilla y la segunda queda en blanco); si hay casilla en
el papel para las dos celdas blancas de Excel que no se agregaron (E27, la ciudad adicional,
e I27, un `0` fijo); y la nacionalidad, que el papel pide y la ficha del cliente dejó de
pedir el 3 de octubre.
Desde el 15 de octubre se suman: si el papel es Carta u Oficio (y se deja su opción en la pantalla
de calibrar); si en LDW se lee una sola Q o dos (punto 15); si «PREPARADO POR (CODIGO)» cae en su
casilla de 16 mm y «COMPUTADO POR (CODIGO)», al lado, queda libre; y la parte de abajo del papel
(el deducible y el seguro «segunda vez»), que no se vio en la foto.

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

**Cómo es hoy** (construido el 14 de octubre de 2026; la decisión y sus
alternativas están en `docs/adr/ADR-004-el-respaldo-parcha-su-excel-sin-libreria.md`):

- **Dónde está el botón.** En `#/dinero/respaldo`, **detrás de la segunda
  contraseña**: el archivo lleva el costo por día de cada dueño de carro ajeno y
  si cada renta ya se le pagó al dueño, y ADR-002 manda que toda pantalla que
  necesite ese costo pida la credencial de dinero. Un respaldo sin esos números
  parecería completo y diría una utilidad falsa (el costo en cero), que es peor
  que no tenerlo. El aviso de arriba, al entrar, lleva a esa pantalla.
- **Cómo se arma.** Sin librerías. Un `.xlsx` es un zip de XML y el navegador ya
  trae la compresión (`CompressionStream`), así que se abre `plantilla/best-price.xlsx`
  —su Excel, sin datos de nadie—, se escriben solo las celdas de datos y se vuelve a
  cerrar (`js/respaldo/`). Lo que no se toca —estilos, fórmulas, validaciones,
  protección, imagen, áreas de impresión— son los mismos bytes que tiene su archivo.
  La plantilla vive en el repositorio, que es **público**, así que se prepara
  quitándole todo dato personal (`herramientas/preparar-plantilla.mjs`: celdas, textos
  compartidos y valores en caché). Antes de escribir una celda se comprueba que los
  encabezados de la plantilla sean los que el mapa espera; si no, el respaldo se
  niega: nunca pone el DPI donde antes iba la licencia.
- **Qué lleva.** Todos los clientes y todos los carros (su hoja es la base para
  rentar esa tarde), y los contratos de ese año por `fechaSalida`. Los datos salen
  de la **nube**, nunca de la copia de la computadora; si cualquier lectura falla
  (contratos, clientes, carros, pagos a dueños o el costo de un dueño) no se arma
  nada. Lo que no cabe se dice: su hoja tiene 2,000 filas de clientes (si hay más
  entran primero los de las rentas del año y se avisa cuántos no cupieron), 200 de
  carros y 1,000 de contratos (con más contratos en el año **no se arma**, porque
  un respaldo al que le faltan contratos y parece completo es peor que ninguno).
- **De campo a columna.** Las columnas de su hoja y los campos de §7b (el
  glosario de «Del respaldo», en §7b) se corresponden en `js/respaldo/mapa.js`. Lo
  que su hoja no tiene dónde guardar **no se mete en la columna que más se le
  parece**: queda vacío, o se escribe en COMENTARIOS con el monto y la razón, o se
  lista en pantalla como «lo que este archivo NO lleva» (reservaciones, comisiones,
  pagos a dueños uno por uno, fichas de dueños, si un carro está fuera de servicio). **Tampoco lleva
  el mantenimiento** (los servicios de cada carro, `servicios[]`, ni sus intervalos): su hoja
  VEHICULOS no tiene dónde guardarlos. Esa lista sale de `js/respaldo/mapa.js` (`NO_SE_RESPALDA`) y la
  pantalla donde se baja el archivo la dibuja siempre; el mantenimiento entró a ella el 19 de octubre
  de 2026 (se construyó el 16 sin tocar esa lista, que era de otro trabajo: un hueco que solo está
  dicho en este documento es un hueco que nadie conoce hasta el día que se necesita el respaldo). Una prueba compara el
  respaldo de un carro con servicios e intervalos contra el de uno sin ellos y exige que sea
  idéntico, para que la lista no pueda decir algo que ya no es verdad.
- **La hora y el lugar de entrada (columnas AF y AG): la hora REAL.** Decisión del dueño del
  16 de octubre de 2026: *«El lugar siempre va a ser en la oficina. La hora es lo que importa
  porque si se pasa de la hora yo decido cuánto le cobro.»* En su hoja esas dos columnas se llenan
  **al salir el carro**, con la hora que se espera; el sistema no guarda una hora prevista de
  entrada, pero sí la real, que es la que sirve para decidir el cobro. Por eso `AF HORA ENTRADA`
  lleva `cierre.horaReal` (§7b, «Del cierre») y `AG LUGAR ENTRADA` lleva `cierre.lugarEntrada`, lo
  anotado al recibir el carro. Hasta ese día estaban mapeadas «por parecido de nombre, a confirmar
  con él»; ya no son pregunta. Las dos se llenan **solo cuando el carro ya volvió**
  (`cierre.fechaReal`, la única marca de un regreso): un contrato que todavía no se recibe no tiene
  hora real y AF queda **vacía**, igual que una renta recibida sin que se anotara la hora o de
  antes de que se pidiera (al recibir, la pantalla avisa si la hora queda en blanco: §6). Nunca se rellena con la hora de salida ni con un cero (las 00:00 sí se
  escriben: son una hora). AG tampoco se escribe como un «OFICINA» fijo: si la oficina es siempre
  el lugar, lo anotado al recibir ya lo dice, y un valor puesto por el respaldo taparía el día que
  no fuera así. Una consecuencia que hay que saber: en las filas que el respaldo escribe AF es la
  hora **real**, y en las que él agregue a mano con su método de siempre seguirá siendo la que
  esperaba; son dos cosas distintas en la misma columna.
- **Quién rentó (columna AL «RENTADO POR»): el código en la columna y el nombre en COMENTARIOS.**
  Decisión del dueño del 23 de octubre de 2026. Su Excel trabaja por código y su papel pide el
  código («PREPARADO POR (CODIGO)», §8b punto 12), pero la columna recibía el nombre
  (`rentadoPor`): una fórmula suya que sumara o contara por esa columna con el código no se
  alimentaba. Preguntado si AL debía llevar el código, contestó: *«Los dos.»* Entonces:
  - **AL lleva `empleadoCodigo`**, lo que el contrato **selló** ese día. Un código que es un
    número entero positivo y sin ceros a la izquierda va como **número** (es lo que su hoja guarda
    cuando él teclea un 6, y como son ya el código de cliente y el de carro de la misma fila);
    cualquier otro («W1», «007», «0») va como texto tal cual, para no perder el «00» ni volver
    «celda vacía» a un código «0».
  - **El nombre (`rentadoPor`) va al final del COMENTARIO** del contrato, «Rentado por: Ana»,
    después de todo lo demás: el «OJO» sigue abriendo, y lo que cambia cómo se lee el dinero de esa
    renta va antes que quién la rentó. El archivo no lleva la lista de empleados, así que sin esa
    frase no diría quién es el «6».
  - **Sin código, AL queda vacía.** Hoy hay tres modos de «sin código» en sus datos: un contrato de
    antes de la lista de empleados (`rentadoPor` es texto escrito a mano y el contrato ni siquiera
    trae la llave `empleadoCodigo`), un empleado registrado sin código (`null`) y uno vacío o de solo
    espacios. En los tres: nunca un cero, nunca un código buscado en la lista de hoy y **nunca el
    nombre como sustituto** en una columna cuyas fórmulas esperan un código. El nombre sigue
    saliendo en COMENTARIOS. El archivo no avisa de estos casos: no se pidió.
  - **Consecuencia que hay que saber:** como todo contrato con nombre lleva ahora esa frase, casi
    todos los contratos del archivo tienen COMENTARIOS. Antes una celda de COMENTARIOS con algo
    significaba «hay algo que mirar»; ahora lo que avisa es que **empiece con «OJO»**. Solo un
    contrato sin nadie que nombrar queda sin comentario.
- **Los totales son los de su hoja, no los del sistema.** El respaldo no escribe
  ningún total: SUBTOTAL, TOTAL COBRADO y UTILIDAD son sus fórmulas, que siguen en el
  archivo y se calculan al abrirlo. Sus fórmulas suman todo lo que el sistema cobra
  **salvo tres cosas**: la hora tardía, los «varios» de la devolución y el recargo de
  tarjeta cuando se pagó con más de una forma (su hoja aplica un solo porcentaje a
  todo el total). Una renta con alguna de esas tres sale en la hoja con un total
  **menor** que el del sistema, y por eso su COMENTARIO **abre** con «OJO», la cifra
  que falta y por qué («la hoja anota la hora tardía pero no la suma: faltan Q200»),
  y al bajar el archivo la pantalla lista cada contrato así. El respaldo **no corrige
  la fórmula de su hoja**: arreglarla es decisión suya sobre su propio archivo.
- **La advertencia va donde se baja.** La pantalla dibuja, antes de cualquier botón de
  descarga, que el archivo lleva DPI, licencia y teléfono de los clientes y lo que se
  le paga a cada dueño, y la repite en el aviso de «Listo».
- **Vista protegida.** Excel abre en «Vista protegida» lo que baja de internet, y ahí
  no calcula fórmulas: se ven en blanco hasta apretar «Habilitar edición». La
  pantalla lo dice junto al botón.

**El hueco entre «un archivo por año» y «recuérdalo al año»** (hallado el 14 de octubre
de 2026 al construirlo). Tal como estaba escrito, el archivo de 2026 bajado en octubre
de 2026 no lleva noviembre ni diciembre, y el de 2027 empieza en enero: lo que pasara
entre una cosa y otra no viviría en **ningún** archivo, y el aviso de «pasó un año»
no lo atrapaba. Queda cerrado así: el sistema guarda **la fecha en que se bajó el
respaldo de cada año** (`ajustes/respaldo`, ver §7b), un año solo cuenta como
**completo** si se bajó cuando el año ya había terminado, y la pantalla ofrece el año
en curso y —solo cuando hay algo que hacer con él— el anterior: bajado antes de
terminar (se vuelve a ofrecer, «no lleva las rentas de después») o sin bajar en el
primer trimestre. Cualquier otro año se baja con «Otro año». El aviso de arriba sigue
siendo el de §10: **365 días** desde el último respaldo de cualquier año (o ninguno
nunca bajado). La regla recibe `hoy` y no lee el reloj (`nucleo/respaldo.js`).

La fecha se guarda en la nube y no en el navegador porque es un hecho del negocio:
bajarlo en una computadora debe callar el aviso en todas, y vaciar el historial de
una no debe hacerlo volver. Se anota **después** de entregar el archivo, nunca antes:
si la anotación falla, lo peor es que el aviso vuelva a salir; anotar un respaldo que
no salió lo callaría un año. Si no se puede LEER cuándo fue, el aviso no dice nada (no
se sabe, y un aviso falso se aprende a ignorar). No hace falta ninguna regla nueva de
Firestore: `ajustes` ya se lee y se escribe con la sesión normal.

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
- **El porcentaje de comisión de un contrato no lo cambia el mostrador** (21 de octubre
  de 2026; las palabras del dueño: *«Sí, no quiero que nadie se suba el porcentaje.»*). El
  porcentaje se sella en el contrato cuando el carro sale, y la pantalla de comisiones paga
  ese número; antes cualquier sesión del mostrador podía reescribirlo desde las
  herramientas del navegador. Ahora `firestore.rules` exige, en un contrato que ya existe:
  **actualizar** solo si el porcentaje queda igual (con la credencial de dinero, siempre: así
  enlaza el dueño las rentas viejas a un empleado) y **borrar** solo con la credencial de
  dinero (el sistema no borra contratos; sin cerrar el borrado, bastaría borrar y volver a
  crear el contrato con otro porcentaje). **Crear queda abierto a propósito**: cerrarlo
  pide comparar contra el porcentaje del empleado con un `get()` que, si se equivoca, deja
  al mostrador sin poder sacar un carro con el cliente enfrente, y desde este repositorio no
  se puede probar (no hay emulador). Qué se decidió, por qué, qué no cierra (leer, `empleadoId`,
  crear) y cuándo valdría la pena cerrar crear: ADR-002, actualización del 21 de octubre.
  **El archivo de reglas no es lo que Firebase aplica hasta que el dueño lo pega**, y cuando
  lo cambia se le entrega también el archivo de antes (`firestore.rules.anterior-2026-10-21.txt`) para que pueda
  deshacerlo. Una prueba (`pruebas/regla-porcentaje.test.mjs`) fija lo que la regla da por
  hecho del código —que ningún camino del mostrador cambia el porcentaje, que el único que lo
  cambia sale por la app de dinero—, pero **no prueba la regla en Firebase**.

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

**La capacidad por tipo es una asignación, no una cuenta** (H-5, 12 oct 2026). Una
reservación «Pickup» sin carro elegido termina con UN carro de ese tipo, el mismo todos
sus días, y un carro no puede estar en dos compromisos que se cruzan. El aviso de una
reservación nueva contesta: *¿esto deja sin carro a alguien que hoy sí lo tiene?* Compara
el máximo de reservaciones por tipo que pueden tener carro CON la nueva contra SIN ella
(`choquesDeReserva`, `nucleo/reserva.js`; la búsqueda exacta, `maximoConCarro`, en
`nucleo/asignacion.js`). Los compromisos con carro exacto (reservaciones y contratos) están
clavados a su carro; los de solo tipo toman cualquiera libre. Se miran los compromisos
conectados con las fechas de la nueva, **también los que se cruzan solo con otro que se
cruza** (un carro que se manda a otro lado le quita su lugar al siguiente, en cadena), y se
usa la misma regla de cruce de siempre: tocarse no es cruzarse. Contar cuántos tocan las
fechas avisaba de más (dos sedanes, uno apartado 15–20 y otra por tipo 21–24: no coinciden
ningún día) y calla de menos (la Ranger exacta no avisaba de la «Pickup» por tipo que ya
contaba con la única pickup); contar el máximo simultáneo tampoco sirve (un carro ocupado
1–5 y otro 6–10 no dejan ninguno libre 1–10). Un carro clavado a uno del taller o de otro
tipo no gasta unidades de este. Si la búsqueda se pasara de su límite, el aviso lo dice en
vez de callar o adivinar. Un carro exacto que apartas también pregunta lo mismo al revés:
si dejarías sin unidad a una reservación por tipo.

**«Sacar carro» hace esa misma pregunta** (12 oct 2026). Darle la Ranger a un cliente podía dejar
sin carro a una reservación «Pickup» que solo pidió el tipo, y la salida no decía nada: solo
miraba las reservaciones clavadas a ESE carro. Ahora, además, pregunta lo mismo que el
formulario de reservaciones con un carro exacto, y lo contesta **la misma función**
(`reservasQueSeQuedanSinCarro`, `nucleo/reserva.js`, sobre la misma `cabeEnElTipo`): no hay una
segunda copia de la regla. El aviso dice, en una frase, a quién afecta y desde cuándo; si se
sabe con certeza quién se queda sin carro, lo dice, y si podría ser cualquiera de varias dice
«alguna de» sin señalar a una persona que quizás no es la afectada. La reservación de la que se
está saliendo no compite contra sí misma. Avisa y no bloquea: él puede conocer a ese cliente, o
saber que el carro vuelve antes.

### Mantenimiento de la flota propia

Cada carro propio lleva el control de sus servicios: **aceite y filtro, pastillas
de freno, llantas, batería, alineación y balanceo, y servicio general**. Cada uno
con dos intervalos — kilómetros y tiempo — y **toca con el que llegue primero**.

El kilometraje no se escribe aparte: sale del que ya se anota al recibir cada
carro. En la ficha se ve cuándo se hizo cada servicio, a qué kilometraje, y
cuánto falta para el siguiente. Cuando falte poco, aparece donde ya aparecen los
demás avisos.

**Cómo se construyó** (16 de octubre de 2026). La regla vive una sola vez, en
`js/nucleo/mantenimiento.js`; la ficha del carro (`#/carros/:carroId`, bloque «Mantenimiento»
debajo del formulario, `js/pantallas/mantenimiento.js`) y el aviso de «Sacar carro» solo dibujan lo que
ella contesta. No hay ruta ni entrada de menú nuevas, ni colección ni regla de Firestore nuevas: los
servicios viven dentro del documento del carro (`servicios[]` e `intervalos{}`, §7b).

- **Qué pregunta y cómo contesta.** *¿En cuántos kilómetros anda el carro?* El mayor kilometraje de sus
  contratos (`kilometrajeDelCarro`), y **si ninguno lo trae es «no se sabe», nunca cero**. *¿Toca?* Cada
  servicio mide los kilómetros (kilometraje del último servicio + su intervalo − el kilometraje del
  carro) y el tiempo (fecha del último servicio + sus meses de calendario − hoy); toca con el que llegue
  primero. Un lado que no se sabe no es «ok»: sin kilometraje, el tiempo sigue funcionando solo y el
  renglón dice «Al día por fecha», no «Al día». Un servicio sin fecha válida, de fecha futura o anulado no
  cuenta. Una lectura que falló (la flota, los contratos) nunca se dibuja como «al día»: lo que estaba bien
  queda en «No se pudo confirmar» y la barra roja de siempre lo dice; lo malo se dice igual.
- **Los intervalos de siempre son una PROPUESTA, no del dueño.** La especificación no los fija. Pensados
  para carros de renta en Guatemala (muchos conductores, trancones, baches, calor y lluvia; unos 2,000 a
  3,000 km al mes por carro, que no se midió), cada servicio lleva escrito su porqué en
  `js/nucleo/mantenimiento.js` y en la ficha:

  | Servicio | Km | Meses |
  |---|---|---|
  | Aceite y filtro | 5,000 | 3 |
  | Pastillas de freno | 30,000 | 12 |
  | Llantas | 40,000 | 48 |
  | Batería | 60,000 | 36 |
  | Alineación y balanceo | 10,000 | 6 |
  | Servicio general | 20,000 | 12 |

  Se pueden cambiar por carro en la ficha («Intervalos de este carro») y volver a los de siempre.
- **Cuándo avisa.** A **500 km o 15 días** de que toque (`ANTELACION`): un carro de renta anda unos 80 km al
  día, así que 500 km son más o menos una semana para meterlo al taller entre una renta y otra. Es
  una propuesta también.
- **Dónde aparece el aviso.** Donde ya aparecen los demás: la lista de avisos de «Sacar carro»
  (`avisosDeSalida`, `js/nucleo/avisos.js`), **nivel medio** —advertencia y no candado: él decide si
  renta el carro igual—. Avisa solo de lo que SABE: un carro sin servicios anotados no dice nada, y sin
  kilometraje solo se mide el tiempo. Como «Sacar carro» solo lee los contratos abiertos (el kilometraje
  de un carro con las rentas cerradas no está ahí), el kilometraje de AHORA es el que el mostrador escribe
  como kilometraje de salida —el odómetro de ese momento—; vacío (0) es «no se anotó». Un carro ajeno no
  lleva mantenimiento.
- **Lo que NO tiene, a propósito.** Costo de cada servicio (no está en la especificación; si lo quiere,
  va detrás de la contraseña de dinero, §11, como toda cifra de negocio) y notas libres. Un servicio mal
  registrado se anula, no se borra.
- **Pendientes para su revisión en pantalla.** Los seis intervalos, cuánta antelación quiere, y si quiere
  el costo de cada servicio.

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

**Hecho el 13 de octubre de 2026** (plan de empleados y comisiones): el campo salió de
«Sacar carro» —una prueba fija su ausencia, porque es lo que una comodidad posterior
pondría de vuelta sin que nada falle—, «¿Quién lo rentó?» se escoge de la lista de
empleados por código o por nombre, el contrato sella el porcentaje del empleado sin
mostrarlo, y la lista de empleados con su porcentaje vive en Dinero → Empleados, detrás
de la contraseña. Quien no tiene a quién escoger (la lista no se pudo leer, o todavía
no hay empleados) no puede guardar la salida, y cada razón se dice con sus palabras.

**Cerrado también en las reglas el 21 de octubre de 2026** (§11): el porcentaje que el
contrato sella ya no se puede cambiar desde el mostrador en un contrato que existe. Ese
mismo día quedó dicho lo que no se cierra: quien sabe crear un contrato con las herramientas
del navegador todavía puede crearlo con el porcentaje que quiera (ADR-002).

### Orden de construcción

1. Núcleo (sacar carros, flota, cálculos) — el plan 1.
2. Recibir y cobrar: cerrar el contrato, cobrar el saldo, liberar la garantía.
3. Reservaciones y calendario.
4. Impresión sobre el formulario preimpreso.
5. Dinero: comisiones, pagos a dueños, empleados.
6. Mantenimiento (hecho el 16 de octubre de 2026; ver «Cómo se construyó» arriba).
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
