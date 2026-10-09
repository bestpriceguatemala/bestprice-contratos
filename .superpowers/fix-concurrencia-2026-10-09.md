# Arreglo de concurrencia y reintentos (9 oct 2026)

Tres defectos de dinero de la prueba del sistema (`prueba-sistema-2026-10-07.md`: H-1, H-2, H-3). Son de
una misma familia —escrituras que se cruzan y reintentos— y se resuelven con DOS ideas, no con tres parches:

1. **Un documento que ya existe solo se reescribe si sigue siendo el que se abrió.** La comprobación vive
   dentro de la MISMA transacción que escribe, así que entre «leí» y «escribí» no cabe nadie (H-1 y H-3).
2. **Un alta nueva decide su identificador antes del primer intento** (`nuevoId*`), y el reintento cae en el
   mismo documento (H-2).

**Estado:** en curso. Este archivo se escribe a medida que avanzo (un agente anterior perdió su informe
entero por un límite de uso mientras sus commits sobrevivían).

## Cómo se midió (y qué NO)

- Baseline: `npm test` = **1090** en verde, árbol limpio.
- Puerto 4173 libre al empezar. Había un servidor viejo de un agente anterior en el **4377** (`node
  servidor.mjs`, PID 86931, sirve una copia desactualizada del árbol): no lo usé ni lo apagué; no es mío.
- Navegador: mi propio arnés (Firebase falso, la «nube» vive en el servidor para que dos pestañas la
  compartan), nunca el proyecto real y nunca una credencial.

## Decisiones

(se llenan abajo, junto a cada commit)
