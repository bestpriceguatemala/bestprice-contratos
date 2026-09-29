# ADR-003: Los PDF salen por el botón Imprimir, no por una librería

- **Status**: accepted
- **Date**: 2026-09-29
- **Deciders**: Esteban Urízar
- **Tags**: impresion, dependencias, documentos

## Context

El sistema tiene que producir papeles que salen de la empresa hacia terceros:
el **comprobante de pago a los dueños** de carros subarrendados, el **contrato
impreso** sobre la papelería preimpresa, y más adelante los **reportes de
comisiones**.

Hay dos maneras de llegar a un PDF desde una página web:

1. **Armar la hoja en HTML y usar el diálogo de imprimir del navegador**, que
   ofrece "Guardar como PDF" en Mac, Windows y Linux.
2. **Generar el PDF en código**, con una librería (jsPDF, pdfmake) cargada
   desde un CDN.

El programa entero está hecho sin paso de compilación y sin dependencias
propias: HTML y módulos ES nativos servidos tal cual desde GitHub Pages. Lo
único externo es el SDK de Firebase, y se carga por CDN porque no hay otra
forma de hablar con Firestore.

El dueño eligió la primera opción cuando se le presentaron las dos.

## Decision

**Los documentos formales se arman como una vista de impresión en HTML**, con
su hoja de estilos `@media print`, y el PDF lo produce el navegador con
`Cmd + P → Guardar como PDF`.

No se agrega ninguna librería de generación de PDF.

## Consequences

### Positive
- El programa no crece ni se vuelve más lento: cero kilobytes nuevos.
- La hoja se diseña con CSS, que es lo que el resto del sistema ya usa — el
  resultado se ve mejor y se ajusta más fino que lo que arma una librería.
- Un documento se puede revisar mirándolo en pantalla antes de imprimirlo, sin
  generar un archivo.
- El mismo mecanismo sirve para el contrato sobre papelería preimpresa, que es
  el caso que de verdad exige control milimétrico del papel.
- Una dependencia menos que pueda romperse, quedar sin mantenimiento o cambiar
  de licencia.

### Negative
- Son dos pasos para el dueño, no uno: imprimir y luego guardar como PDF.
- El nombre del archivo lo decide él en el diálogo, no el sistema.
- No se puede generar un PDF sin que haya alguien frente a la pantalla — no
  sirve para nada automático ni programado.
- El encabezado y pie que agrega el navegador hay que apagarlos desde el
  diálogo la primera vez.

### Neutral
- Si algún día hace falta un PDF sin intervención humana (un envío automático
  al dueño, por ejemplo), esta decisión habría que revisarla con un ADR nuevo
  que la supere.

## Links
- Diseño de la liquidación §6: `docs/superpowers/specs/2026-09-29-liquidacion-a-duenos-design.md`
- Diseño general §8 (Impresión): `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`
