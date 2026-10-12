# Descuento al registrar un pago a un dueño (12 oct 2026)

**Estado:** en curso. Este informe se va escribiendo mientras trabajo (un agente anterior perdió uno entero por un límite de uso).

**Base:** `main` en `cce945b`, `npm test` = 1377 en verde. Árbol limpio salvo `.claude-flow/` y dos informes viejos sin seguir.

## Lo que decidió él

- Un descuento **al registrar el pago**: al marcar las rentas puede restar lo que ya se le había pagado de más. El comprobante muestra
  las rentas, el descuento y lo que de verdad entregó.

## Cómo estoy leyendo el código (antes de tocar nada)

- Un pago guarda `monto` = lo que suman las rentas que cubre, y `contratos[]` = esas rentas; los dos nacen de `elegirParaPago`
  (`construirPagoDueno`). Todo lo demás compara contra ese `monto`: los grupos (`gruposDePago`: `pagado` contra `ahora`), la nota «cambiaron»
  del comprobante y `pagadoDeMas`. Por eso **`monto` no se toca**: si el descuento lo bajara, la renta de Q1,200 pagada con Q600 en efectivo
  se leería como «le faltan Q600» (una diferencia por pagar), o sea media renta pagada, que es justo lo que él no quiere.
- El descuento es un campo aparte del pago, `descuento`, y lo entregado es `monto − descuento`. Un pago viejo no lo trae y se lee como sin descuento.
- `descuento` ya existe en §7b, pero en `cierre{}` (lo que se le rebaja al CLIENTE al recibir el carro). El del pago a un dueño es otra cosa y
  va a decir «Ojo con el nombre», como ya lo hacen `forma` y `dueno`.
