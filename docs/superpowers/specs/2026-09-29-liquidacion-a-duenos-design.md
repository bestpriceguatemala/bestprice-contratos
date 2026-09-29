# Liquidación a dueños de carros subarrendados

Diseño acordado con el dueño el 29 de septiembre de 2026.

Amplía el diseño general (`2026-09-23-sistema-contratos-best-price-design.md`),
que sigue siendo la autoridad: §5 (reglas de cobro), §7 (modelo de datos), §7b
(el glosario de campos), §10 (el área de dinero) y §11 (seguridad). Donde este
documento y aquel se contradigan, manda aquel — salvo en lo que este cambia a
propósito, que se señala abajo.

## 1. Qué problema resuelve

El dueño subarrienda carros de otras personas. A veces **varios carros del
mismo dueño**. Hoy el sistema sabe cuánto le costó cada carro por día, pero no
puede contestar la pregunta que él hace de verdad:

> «¿Cuánto le debo a Fulano?»

Y cuando le paga, no tiene cómo mandarle un papel que diga qué le pagó.

Sus palabras, que son los requisitos:

> «los carros que sub arriendo, me gustaría saber qué le debo al dueño de los
> carros porque hay veces que son varios carros del mismo dueño. Dame esa
> opción y la capacidad de elegir qué le voy a pagar y qué queda restante,
> también necesito que se pueda convertir a un PDF formal detallado […] para
> así yo poder mandarles a los dueños de esos vehículos que les pagué.»

## 2. Decisiones que tomó él

Preguntadas una por una antes de escribir esto.

1. **Solo se pagan contratos ya cerrados.** Sus palabras: *«los contratos que
   ya cerré, de esos escojo a pagar, porque ya están cerrados con el precio
   final»*. Un contrato abierto todavía puede cambiar de monto — días de
   atraso, daños — así que pagarle al dueño antes de cerrar sería pagar sobre
   una cifra que aún se mueve.
2. **Los dueños pasan a ser una lista**, como los clientes. Hoy el nombre se
   escribe a mano en cada contrato: «Juan Pérez» y «juan perez» son dos
   personas distintas para el sistema, y la cuenta se partiría en dos sin que
   nada lo avise.
3. **El documento dice lo pagado Y lo que queda.** Para que el dueño no tenga
   que preguntar «¿y lo demás?».
4. **El PDF sale por el botón Imprimir** del navegador, no por una librería.
   Sin peso extra en el programa, igual en cualquier computadora, y es el mismo
   camino que va a usar la impresión de contratos.
5. **El costo por día del dueño se mueve detrás de la contraseña ahora**, con
   migración de los contratos ya guardados. Ver §7.

## 3. Qué se le debe a un dueño

Por cada contrato de carro ajeno, ya cerrado y no pagado:

```
costo del subarriendo = costoDia × (días + días de atraso)
```

Es la misma fórmula del diseño general §5, sin cambios. Los días de atraso
también se le pagan al dueño: el carro estuvo fuera esos días.

**Solo cuentan los contratos cerrados.** `estadoContrato(c) === 'cerrado'`
(`js/nucleo/estados.js`), que ya exige saldo saldado y garantía liberada. Un
contrato devuelto pero sin cerrar aparece en la ficha del dueño en una lista
aparte, en gris, rotulada *«aún no cierra»*: él ve que viene, pero no puede
marcarlo pagado.

Esa regla vive en el núcleo, una sola vez, y tanto la lista como el documento
se la preguntan ahí. Este proyecto ya perdió cinco vueltas de revisión por
reglas escritas en dos lugares, y una de ellas — «garantía por liberar» —
apareció en un tercer sitio solo porque dos números se contradijeron en
pantalla.

## 4. Los dueños

Colección nueva `duenos`, con la misma forma de trabajo que `clientes`.

Campos: `nombre`, `telefono`, `nit`, `nota`, `actualizado`.

`nit` porque algunos dueños facturan y el comprobante tiene que llevarlo.
Ninguno es obligatorio salvo `nombre`.

**Al sacar un carro ajeno** se escoge el dueño de la lista, con el mismo
buscador que ya usa el cliente, y con alta rápida ahí mismo para el dueño que
aparece por primera vez con el carro afuera y el cliente esperando.

**Los contratos viejos no se rompen.** Los que ya tienen `carroAjeno.dueno`
como texto siguen mostrando ese texto, y la ficha del dueño ofrece
**enlazarlos**: escoger a qué dueño de la lista corresponde ese nombre escrito
a mano. Hasta que se enlacen, aparecen agrupados bajo el texto tal cual, para
que ningún monto desaparezca de la vista.

## 5. La pantalla

Vive dentro del área de dinero, detrás de la contraseña (§11 del diseño
general), junto a comisiones.

**Lista de dueños.** Una fila por dueño: nombre, cuántas rentas cerradas le
debe, y el total. Ordenada por lo que más debe primero. Un dueño sin nada
pendiente no desaparece, pero se ve apagado.

**Ficha de un dueño.** Tres bloques, en este orden:

1. **Por pagar** — una fila por contrato cerrado sin pagar, con **casilla**:
   fecha de salida, placas, cliente, días (con los de atraso señalados),
   costo por día y monto. Al marcar casillas, **el total de lo marcado se suma
   abajo, a la vista**, antes de registrar nada.
2. **Aún no cierra** — los contratos de ese dueño que todavía no cerraron, en
   gris y sin casilla, con la razón por la que no cierran (saldo pendiente o
   garantía sin liberar). No suman al total.
3. **Ya pagado** — los pagos hechos, cada uno con su fecha, forma y monto, y
   las rentas que cubrió.

**Registrar un pago:** con las casillas marcadas, botón *Registrar pago* →
forma de pago (efectivo, transferencia, cheque) y fecha, que por defecto es
hoy. Se guarda y las rentas marcadas pasan al bloque de abajo.

## 6. El comprobante

Una vista de impresión, no un archivo generado: el sistema arma la hoja y el
navegador la convierte en PDF con `Cmd + P → Guardar como PDF`.

Contenido, en orden:

- **Encabezado:** membrete de Best Price Rent a Car, y los datos del dueño
  (nombre, teléfono, NIT).
- **Número de comprobante y fecha.** El número es correlativo, con el mismo
  mecanismo de `contadores` que ya numera los contratos.
- **«Le pagué»** — tabla con una fila por renta cubierta: fecha, placas,
  cliente, días, costo por día, monto. Al pie, el **total pagado** y la forma
  de pago.
- **«Queda pendiente»** — tabla con las rentas cerradas que aún se le deben, y
  su total. Si no queda nada, dice *«No queda nada pendiente»* en vez de una
  tabla vacía.
- **Pie:** línea de firma para el dueño.

La hoja de estilos de impresión esconde el menú, los botones y todo lo que no
sea el comprobante. Se imprime en carta, vertical.

**Lo que NO lleva:** ni la comisión del empleado, ni lo que el cliente pagó,
ni la utilidad. El dueño del carro no tiene por qué ver el negocio de Best
Price; solo lo suyo.

## 7. Dónde se guardan los datos

### Lo que cambia a propósito respecto al diseño general

El diseño general §7 dice que `contratos/{id}/privado/dinero` guarda el costo
por día del dueño, y anota que mientras no existiera el área de dinero eso se
guardaba provisionalmente en el contrato mismo (`subarriendo.costoDia`). El
área de dinero es justo lo que este plan construye, así que **la deuda se
paga ahora**:

- `subarriendo.costoDia` se mueve a `contratos/{id}/privado/dinero`.
- Los contratos ya guardados se migran una sola vez, y el código conserva un
  **puente de lectura** para los que no se hayan migrado todavía, igual que los
  puentes que ya existen (§7b del diseño general).
- Un contrato migrado deja de exponer lo que el dueño paga por ese carro a
  quien solo tenga la sesión normal.

### Colecciones

- `duenos/{id}` — `nombre`, `telefono`, `nit`, `nota`, `actualizado`.
  Se lee con sesión (hace falta para sacar el carro); **se escribe con sesión**
  también, porque el alta rápida ocurre en el mostrador.
- `pagosDueno/{id}` — `duenoId`, `fecha`, `forma`, `monto`, `contratos[]` (los
  ids que cubre), `numero` (correlativo del comprobante), `actualizado`.
  **Solo con la credencial de dinero**, igual que `pagosComision`.
- `contratos/{id}/privado/dinero` — ahora también `costoDia`. Lectura solo con
  la credencial de dinero, como ya está.

### Campos nuevos, para el glosario §7b

**Del dueño:** `nombre`, `telefono`, `nit`, `nota`, `actualizado`.

**Del pago a un dueño:** `duenoId`, `fecha`, `forma`, `monto`, `contratos[]`,
`numero`, `actualizado`.

**Del contrato:** `duenoId` (nuevo, junto a `carroAjeno`), que apunta a la
lista. `carroAjeno.dueno` se conserva como texto para los contratos viejos y
como respaldo de lo que se escribió ese día.

## 8. Reglas de Firestore

Se agregan dos bloques al archivo que el dueño pega a mano en la consola:

```
match /duenos/{id}      { allow read, write: if haySesion(); }
match /pagosDueno/{id}  { allow read, write: if esDinero(); }
```

`pagosDueno` queda cerrado a todos mientras `UID_DE_LA_CUENTA_DE_DINERO` siga
siendo un placeholder — el mismo estado seguro que ya tienen `privado` y
`pagosComision`.

## 9. Qué no entra

- **Facturación.** El comprobante no es una factura ni pretende serlo.
- **Pagos parciales de una renta.** Él dijo que escoge contratos completos. Si
  algún día abona sobre una renta suelta, se diseña entonces.
- **Recordatorios automáticos.** Nada que mande correos ni mensajes solo.

## 10. Pendiente heredado que toca esta área

El plan de reservaciones dejó escrito un pendiente que vive cerca de aquí y
**no se resuelve en este plan**: un contrato vivo pero atrasado no bloquea una
reservación futura sobre ese mismo carro (ver la sección correspondiente del
diseño general). Sigue siendo primera tarea del plan que venga después.
