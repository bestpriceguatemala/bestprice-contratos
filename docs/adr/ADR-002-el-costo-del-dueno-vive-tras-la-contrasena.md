# ADR-002: El costo del dueño vive tras la contraseña de dinero

- **Status**: accepted
- **Date**: 2026-09-29
- **Deciders**: Esteban Urízar
- **Tags**: dinero, seguridad, datos

## Context

Cuando Best Price subarrienda el carro de otra persona, guarda cuánto le paga
a ese dueño por día (`subarriendo.costoDia`). De ese número salen dos cosas
que son el negocio mismo: **lo que le debe al dueño** y **la utilidad de esa
renta**.

El diseño general (§7) siempre dijo que ese dato pertenece a
`contratos/{id}/privado/dinero`, la subcolección que solo se lee con la
credencial del área de dinero. Pero cuando se construyó "Sacar carro" esa área
todavía no existía, así que se guardó provisionalmente en el documento del
contrato — legible por cualquiera que tenga la sesión normal. El propio diseño
anotó esa deuda en su momento.

Hoy se construye la liquidación a dueños, que **es** el área de dinero. La
deuda vence.

Hay una razón para no moverlo: hoy solo el dueño entra al sistema, así que en
la práctica nadie más lo ve, y migrar los contratos ya guardados cuesta trabajo
y una vuelta de revisión. Pero el día que entre un empleado al mostrador —que
es a dónde va este sistema, porque ya hay comisiones por empleado en el
diseño— esa persona vería lo que Best Price paga por cada carro ajeno y lo que
gana con él. Mover el dato después, con más contratos guardados, solo será más
caro.

## Decision

`subarriendo.costoDia` **se mueve a `contratos/{id}/privado/dinero`**, donde la
lectura exige la credencial de dinero.

- Los contratos ya guardados se migran **una sola vez**.
- El código conserva un **puente de lectura** para los que aún no se hayan
  migrado, igual que los puentes que ya existen (§7b del diseño general).
- El área de dinero es el único lugar del sistema que lo lee.

## Consequences

### Positive
- Lo que Best Price paga por cada carro ajeno, y su utilidad, dejan de estar al
  alcance de una sesión normal.
- El modelo de datos deja de contradecir al diseño; §7 vuelve a ser cierto.
- Cuando entre un empleado al mostrador, no hay nada que apagar a las carreras.

### Negative
- Hay que migrar los contratos existentes, con su tarea y su revisión.
- Queda un puente de lectura más que el sistema arrastra para siempre.
- Cualquier pantalla futura que necesite ese costo tendrá que pedir la
  credencial de dinero, no basta con la sesión.

### Neutral
- Para el dueño, que hoy es el único usuario, no cambia nada visible.

## Links
- Diseño general §7, §7b, §11: `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`
- Diseño de la liquidación §7: `docs/superpowers/specs/2026-09-29-liquidacion-a-duenos-design.md`
