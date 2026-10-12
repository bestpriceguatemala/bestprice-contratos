# Punto ciego de «Sacar carro»: la reservación por tipo (12 oct 2026)

Estado: EN CURSO (se va escribiendo sobre la marcha). Núcleo, pantalla, pruebas y especificación hechos y commiteados;
falta la verificación en el navegador y el cierre del informe.

Línea base al empezar: `npm test` = 1377 pasan, rama `main`, HEAD `cce945b`. Hay otro agente trabajando en
`js/nucleo/liquidacion.js`, `js/datos.js`, `js/pantallas/dinero.js`, `js/pantallas/comprobante.js`: no los toco.

## El problema

`avisosDeSalida` (js/nucleo/avisos.js) solo mira `reservasDelCarro`, las reservaciones clavadas a ESE carro. Sacar la
Ranger no decía nada de una reservación «Pickup» sin carro elegido que ya cuenta con la única pickup. El mismo
defecto que H-5 arregló en el formulario de reservaciones, del otro lado.

## Plan

1. `reserva.js`: la pregunta «¿apartar/sacar este carro deja sin carro a una reservación por tipo?» ya vive en
   `cabeEnElTipo`. Se extrae a una función exportada que la usan los DOS lados (el formulario de reservaciones y
   Sacar carro), y que además dice A QUIÉN afecta. No se escribe una segunda versión del razonamiento.
2. `avisos.js`: un aviso nuevo, con la voz del archivo (quién, desde cuándo, una frase).
3. `sacarCarro.js`: la pantalla solo le pasa lo que ya tiene (flota, reservaciones, contratos abiertos, y la
   reservación de la que sale, que no compite contra sí misma).
4. Pruebas con nombre (Ranger/Pickup) y verificación en pantalla.

## Lo hecho hasta aquí (commits)

- `e4fb7cc` núcleo: `reserva.js` (`analizar`, `cabeEnElTipo` apoyada en ella, `reservasQueSeQuedanSinCarro`) y `avisos.js`.
- `861c045` pantalla: `entradaDeAvisos` (sacarCarro.js) arma lo que se le pasa a `avisosDeSalida`; pruebas del cableado y el examen.
- siguiente: la prueba del contrato propio ahora distingue (una mutación sobrevivía) y §12b.

## La regla, una sola vez

`cabeEnElTipo` ya contestaba «¿esto deja sin carro a alguien?». Para poder NOMBRAR a quién, la pregunta se partió en
`analizar` (cuántas se pierden y cuáles entran en la cuenta); `cabeEnElTipo` es `analizar(...).perdida === 0`. La
función nueva `reservasQueSeQuedanSinCarro` es esa pregunta vista desde un carro, y la usan LAS DOS pantallas: el
formulario de reservaciones (carro exacto, con el texto de siempre, sin cambiar ni una palabra) y Sacar carro. El
examen comprueba además, en 1500 escenarios, que las dos pantallas contestan lo mismo.

## A quién se nombra (la parte difícil)

«Se queda sin carro» no siempre tiene un culpable único: con dos que podrían ser la que pierda, señalar a una es
mentir. Una reservación es *posible afectada* si, sin ella, la renta ya cabe. Si hoy todas están acomodadas, las
posibles son EXACTAMENTE quienes pueden perder el carro (se demuestra: toda forma óptima de perder está contenida en las
posibles, y si son tantas como las que se pierden, es la única forma). Entonces:

- Se sabe quién (`seguro`): «Si sacas este carro, la reservación de Pickup de Carlos Méndez (desde el 3 nov 2026) se
  queda sin carro: solo tienes 1 Pickup.» (varias: «las reservaciones de Pickup de A (desde…) y B (desde…) se quedan…»).
- Podría ser cualquiera de varias, o ya había más reservaciones que carros (entonces no se sabe a quién culpar): «alguna
  de las reservaciones de Camioneta sin carro elegido se queda sin carro (la de A desde…, la de B desde… o la de C
  desde…): tienes 2 Camioneta y los 2 quedan comprometidos.»
- Se nombran hasta tres y se cuentan las demás (como el aviso de las apartadas de este carro).
