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
```

**El precio por día ya incluye** el seguro y el seguro de terceros; esos dos
montos solo se desglosan en el contrato impreso, nunca se suman aparte.
El **deducible bajo** se cobra una sola vez, no por día.
Los **daños** y el **combustible** se escriben a mano al recibir el carro.

### Qué se cobra en cada momento

Al salir el carro se cobra **todo lo que ya se sabe**: la renta de los días
contratados, los seguros por día de esos días, el deducible bajo, la carta poder
y los varios.

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

No entran daños, combustible, carta poder, seguros extra, varios ni el
porcentaje de tarjeta. El porcentaje por defecto es 5 % y **cada empleado puede
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
   de salida, combustible, hora tardía. La devolución prevista se calcula sola.
4. **Cobros extra** — desglose de seguro y seguro de terceros, seguro de
   menores, seguro PAI, deducible, deducible bajo, carta poder (destino y
   precio), varios.
5. **Tarjetas** — número, vencimiento, CBC, banco, autorización y monto
   autorizado; segunda tarjeta opcional.
6. **Cierre del formulario** — quién lo rentó (empleado), conductor adicional
   (nombre, licencia, identificación) y observaciones.

Avisos mientras se escribe:

- Licencia o DPI del cliente vencidos.
- El cliente tiene saldo pendiente de otro contrato.
- El cliente ya devolvió tarde antes.
- El carro tiene otro contrato encima de esas fechas.
- El precio está por debajo del mínimo configurado, o son menos de dos días.

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
- **El negocio**: cobrado del mes, utilidad, pendientes de cobro y cuánto ha
  producido cada carro.

### Ajustes

Empleados y su porcentaje, precios sugeridos por tipo de vehículo, porcentaje de
tarjeta por defecto, mínimos que disparan avisos, calibración de impresión,
contraseña del área de dinero y botón de respaldo.

## 7. Datos

Colecciones en Firestore:

- `clientes` — datos personales, documentos y sus vencimientos, direcciones,
  teléfonos, correo, a quién se factura.
- `vehiculos` — flota propia: código, placas, tipo, marca y línea, color,
  modelo, propiedad, dueño, estado y motivo si está fuera de servicio.
- `contratos` — el contrato completo: cliente, carro (o los datos del carro
  ajeno), fechas, días, precios, seguros, extras, tarjetas enmascaradas,
  empleado, conductor, observaciones, estado, cierre y pagos.
- `contratos/{id}/privado/dinero` — costo por día del dueño, comisión calculada
  y pagos al dueño. **Lo escribe el sistema al crear el contrato, pero solo se
  puede leer con la contraseña** (ver §11).
- `empleados` — nombre, porcentaje de comisión, activo.
- `pagosComision` — fecha, empleado, contratos incluidos, total, forma de pago.
- `ajustes` — configuración y calibración.
- `contadores` — el correlativo del número de contrato (empieza en 1).

Los carros subarrendados **no entran a `vehiculos`**: sus datos viven dentro del
contrato, igual que en el Excel.

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
- Reservas en línea o desde la página web.
- Uso en celular (se usa en computadora de escritorio).
- Varias cuentas de usuario con permisos distintos.
- Facturación electrónica (FEL), contabilidad y control de mantenimiento.
- Seguimiento por GPS.

## 13. Publicación

- Repositorio `bestprice-contratos` en la cuenta de GitHub `bestpriceguatemala`,
  publicado con GitHub Pages.
- Dominio propio enfrente (`sistema.bestpricegt.com` o el que él decida). El
  cambio en el panel del dominio lo hace él o quien le lleva la página.
- El dueño sube los commits desde GitHub Desktop; al terminar cada trabajo se le
  dice qué falta subir.
- Al publicar un cambio se sube el número de versión para que salga el aviso de
  **Actualizar**, igual que en la aceitera.
