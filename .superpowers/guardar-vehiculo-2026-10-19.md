# `guardarVehiculo`: el historial de mantenimiento ya no retrocede (19 de octubre de 2026)

Este informe se escribe sobre la marcha: si se corta, lo que ya está aquí es lo verdadero hasta el último commit que menciona.

Línea base al empezar: `npm test` = **2194 pasan, 0 fallan** (el encargo). Mientras trabajo otros agentes suben commits al mismo árbol, así que
los totales crecen solos: cuento solo lo mío.

## El hueco, reproducido antes de arreglarlo

`guardarVehiculo` escribía el carro ENTERO desde la copia de la pantalla (`setDoc` con `merge`). Con dos computadoras: B anota un servicio; A, cuya
copia es de antes, aprieta «Guardar carro» (o «Marcar fuera de servicio», o «Volver a habilitar», o abre `#/habilitar/:id`): `servicios[]` de la nube
vuelve a la lista de A. Tres variantes del mismo hueco, las tres con prueba que FALLA sin el arreglo (`pruebas/guardar-vehiculo.test.mjs`, 12 de 24 fallaban):

1. **El historial retrocede** (la lista de A es más corta que la de la nube).
2. **Un servicio anulado se «desanula»** (A trae el servicio sin la marca `anulado`).
3. **Un intervalo quitado resucita**: `intervalos{}` es un mapa y `merge` mezcla los mapas por dentro, así que la copia vieja volvía a poner la llave que B
   había quitado con «Volver a los de siempre». Esto el informe de quien lo encontró no lo decía: era el mismo hueco en `intervalos{}`.
4. (Cuarta cara, sin pérdida en la nube pero igual de visible) **la copia LOCAL de A**, que se reemplaza entera con lo que se mandó, quedaba sin el
   servicio de B: la pantalla de A dejaba de verlo hasta la siguiente sincronización.

Un detalle de cómo se reproduce, para quien escriba la próxima prueba: con un carro SIN servicios todavía, la copia vieja no trae la llave `servicios` y el
`merge` no la toca, así que la nube no se pierde; el hueco pide que la copia vieja traiga una lista más corta. Por eso la prueba parte de un carro con un
servicio de antes.

## Qué se hizo

| capa | cambio |
|---|---|
| `js/nucleo/mantenimiento.js` | `CAMPOS_DEL_MANTENIMIENTO = ['servicios', 'intervalos']` (la lista, una sola vez) y `carroConLoDeLaFicha(fresco, deLaFicha)` (pura) |
| `js/datos.js` | `guardarVehiculo` de un carro que YA existe (trae `codigo`) pasa por `cambiarEnNubeYLocal`: lee el carro DENTRO de la transacción y le pone encima lo de la pantalla, menos el mantenimiento. Un carro nuevo se escribe como siempre |
| `js/pantallas/carros.js` | `construirFueraDeServicio` y `construirHabilitado` (antes tres literales copiados dentro de los botones: las pruebas arman el carro con LA MISMA función) y `textoFalloAlGuardarElCarro` |
| `pruebas/guardar-vehiculo.test.mjs` | 24 pruebas nuevas |

## La decisión: ¿se mezcla o se niega?

(Se completa al final del informe.)
