# El comprobante dice el descuento (12 oct 2026)

**Estado:** en curso. Este informe se va escribiendo mientras trabajo (los agentes anteriores perdieron informes enteros por límites de uso).

**Base:** `main` en `9261878`, `npm test` = 1449 en verde. Árbol limpio salvo `.claude-flow/` y dos informes viejos sin seguir.

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

## Hecho (1): el papel dice el descuento — `js/pantallas/comprobante.js`, núcleo, CSS

- **Modelo** (`pagado`): `total` sigue siendo el `monto` guardado (lo que suman las rentas), y se agregan `descuento` y `entregado`, los dos del núcleo
  (`descuentoDelPago`, `entregadoDelPago`): `comprobante.js` no suma ni resta nada (una prueba lee el código y falla si aparece una suma o una resta).
- **Pie de «Le pagué»**: sin descuento es la fila de siempre, «Total pagado». Con descuento son tres renglones que se leen de arriba abajo:
  «Rentas pagadas con este comprobante Q1,200.00», «Menos: lo que ya se le había pagado de más -Q600.00», «Total pagado Q600.00».
  Debajo, una nota con palabras: «antes se le pagaron Q600.00 de más. Esa cantidad no se entrega otra vez: se resta de este pago. Las rentas de esta lista
  quedan pagadas por completo (Q1,200.00) y lo que se entregó con este comprobante fue Q600.00.»
- **Un pago antes del descuento se imprime idéntico, byte por byte.** Comprobado corriendo las 34 hojas que producen las pruebas viejas contra el árbol
  de `9261878` y contra el nuevo: 34 de 34 iguales.
- **Reimpresión**: todo sale de lo que el pago guardó (`monto`, `descuento`), nunca del costo de hoy. Prueba: mismo pie con otra fecha de «hoy», con la renta
  corregida hacia abajo y hacia arriba, con el comprobante que había pagado de más anulado, y con los pagos llegando en otro orden.
- **Lo entregado en cero** (se descontó todo): la línea de forma dice «Sin entrega de dinero» (no «Efectivo» sobre Q0.00) y la nota lo dice con palabras.
- **Un descuento imposible no se imprime** (negativo, mayor que el monto, no numérico, una lista…): `armarComprobante` lanza. El núcleo lo recorta para que una
  cuenta no entregue de más (`descuentoDelPago`), pero un papel que sale de la empresa con una cifra recortada diría algo que nadie decidió.
  Nuevo en el núcleo: `descuentoInvalido`.
- **Núcleo**: `totalesDePagos(pagos)` → `{monto, descuento, entregado}`. Los grupos de pagos (`pagado`, `descuento`) y el comprobante (la suma de la cadena de
  pagos «completa a otros») usan la misma; antes el comprobante sumaba `monto` por su cuenta (`suma` ya no se importa en `comprobante.js`).
- **Cadena**: un pago que completa a otro con descuento nombra el «Total pagado» de ese papel (lo entregado, Q600.00 y no Q1,200.00), y el «en total» dice
  cuánto de eso ya se había pagado de más, para que la cuenta cuadre: 600 + 240 + 600 = 1,440.

## «Lo pagado ya no cuadra con el detalle» y el descuento

- El descuento NO lo dispara: la nota compara las rentas contra `monto`, y `monto` no se tocó (una renta de Q1,200 pagada con Q600 de descuento sigue siendo un
  pago de Q1,200). Prueba, con constructores reales: sin cambios no sale ni la nota ni el aviso en pantalla.
- Cuando las rentas SÍ cambian después de un pago con descuento, la nota de siempre diría «lo pagado fue Q600.00 … el detalle ya no suma esa cifra», que sería
  falso (el detalle sumaba Q1,200). Lleva su propia versión: «al hacer este pago las rentas sumaban Q1,200.00 … Lo entregado, Q600.00, no cambia». Lo mismo en el
  aviso de pantalla.
- **Concern 5 de H-7 (el papel contesta con su propia comparación, no con los grupos del núcleo)**: probé en tres estados de la renta pagada con descuento
  (sin cambios, corregida hacia abajo, corregida hacia arriba, todas cerradas) que el papel y `gruposDePago` contestan igual. El descuento no los separa, así que
  no agregué una tercera comparación ni moví la del papel. Lo que SÍ sigue separándolos, con o sin descuento, es una renta pagada que se REABRE: el papel dice
  «cambiaron» (cuenta solo rentas cerradas, `totalSeleccionado`) y el grupo dice a mano (`ahora` no pregunta por «cerrada»). Hay una prueba vieja que fija ese
  comportamiento a propósito, no es de este cambio, y no lo toqué.
