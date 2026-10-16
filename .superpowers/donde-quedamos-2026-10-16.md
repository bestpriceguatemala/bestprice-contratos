# Dónde quedamos — 16 de octubre de 2026

Escrito al parar por cupo, para que la sesión que siga no tenga que reconstruir nada.

**Estado del árbol:** limpio, `npm test` = **2194 pasan, 0 fallan**. Todo commiteado.
**Publicado:** hasta la versión `2026-10-16.1`. Lo de después de ese commit **todavía no se publica**.
**Reglas de Firestore:** sin cambios pendientes. Nada que pegar en la consola.

## Lo que falta, en orden

1. **Cerrar el hueco de `guardarVehiculo`** (`js/datos.js`). Es lo único serio.
   Guardar un carro, marcarlo fuera de servicio o habilitarlo escribe el carro ENTERO
   desde la copia de la pantalla. Con dos computadoras y una copia local atrasada, eso
   puede devolver `servicios[]` a una lista vieja **en silencio**: se le borra el
   historial de mantenimiento sin que nada lo diga.
   Arreglo propuesto por quien lo encontró: que `guardarVehiculo`, cuando el carro ya
   existe, lea el carro fresco DENTRO de la transacción y aplique solo los campos del
   formulario. Antes de tocarlo hay que leer `pruebas/concurrencia.test.mjs` (~530 y
   ~678). Detalle completo en `.superpowers/mantenimiento-2026-10-16.md`.

2. **Guardar una salida siempre lleva a imprimir.** Decisión del dueño del 16 de
   octubre: *«La tarjeta siempre se imprime al contrato para que el cliente la vea»*.
   Hoy `destinoDespuesDeGuardar` (`js/pantallas/sacarCarro.js:134`) manda a imprimir
   solo cuando hay tarjeta tecleada, y a `#/flota` cuando no. Pasa a imprimir siempre.
   `llevaTarjetas` NO cambia: sigue siendo «hay tarjeta que llevar», que es lo que
   decide si se deja algo en el traspaso. Hay pruebas que fijan el comportamiento de
   hoy y hay que actualizarlas.

3. **La hora de entrada real en el respaldo.** Decisión del dueño del 16 de octubre:
   *«El lugar siempre va a ser en la oficina. La hora es lo que importa porque si se
   pasa de la hora yo decido cuánto le cobro»*. La columna `AF HORA ENTRADA` de su hoja
   CONTRATOS lleva `cierre.horaReal` (la real), no la prevista. `AG LUGAR ENTRADA` deja
   de ser pregunta. Es del agente del respaldo, que conoce `js/respaldo/mapa.js`.

4. **Dos migajas de documentación** (del informe de mantenimiento):
   - §7b: `servicios[].tipo` no es el `tipo` del carro, y `servicios[].km` no es
     `kmSalida` ni `kmEntrada`.
   - `js/respaldo/mapa.js`, en «lo que este archivo NO lleva»: una línea sobre el
     mantenimiento. Ya está dicho en §10 del diseño, pero falta en la pantalla.
   - Falta una prueba de que a Firestore no se escriben valores `undefined` (el SDK real
     los rechaza y el falso de las pruebas no).

5. **Subir la versión** (`version.txt` y `js/version.js`, LAS DOS o el aviso de
   Actualizar nunca sale) y decirle que publique.

## Lo que él tiene que hacer, en su orden

1. **Dar de alta a los empleados** en Dinero → Empleados, con la contraseña de dinero.
   El mostrador ya no deja sacar un carro sin escoger uno y la lista empieza vacía.
2. **Calibrar la impresión** en su Epson **LX-350** (matriz de puntos, de impacto —
   casi seguro porque su formulario lleva copias al carbón, y ninguna láser las marca).
   Hoja de prueba al 100 %, márgenes «Ninguno», sin encabezados, contra su papelería.
   Su diálogo de Excel dice **Carta**, que es el valor por omisión del sistema.
   Con el papel enfrente tiene que mirar: si «PREPARADO POR (CODIGO)» cae en sus 16 mm;
   la casilla DERIVADA de la autorización de la tarjeta 1 (la única de las 71 que no
   salió de una medición); si hay una casilla por apellido y por nombre; la parte de
   abajo del papel; E27 e I27; la nacionalidad; y **si en «LDW Q.» le sale una Q o dos**.
3. **Confirmar los seis intervalos de mantenimiento** viéndolos en pantalla.

## Decisiones suyas que siguen abiertas

- Si arregla la fórmula de su Excel (`BQ` no suma la hora tardía `AH`, y los «varios»
  de la devolución no tienen columna). El respaldo ya se lo grita en cada contrato
  descuadrado; arreglar su plantilla es decisión suya sobre su archivo.
- La **regla de escritura de `porcentajeComision`** en Firestore: hoy cualquier sesión
  puede escribir un contrato, así que un empleado con las herramientas del navegador
  podría subirse el porcentaje. No urge mientras él sea el único usuario; hay que
  decidirlo **antes de que un empleado use el mostrador**. Ver ADR-002.
- Una segunda impresión de la columna de liquidación del papel (daños, total cargos,
  importe a pagar…) al recibir el carro, con datos que el sistema ya tiene.

## Cómo se trabaja esto

- Agentes de a dos como mucho, no tres: comparten el cupo y mueren juntos a media tarea.
- Revisar el cupo con `get_usage` entre tarea y tarea; al 85 % de la ventana de 5 horas,
  decirles que cierren limpio (árbol verde, todo commiteado, dónde quedaron por escrito).
- Cada agente committea **cada paso verde**, no al final.
- Nunca `git add -A`: casi siempre hay otro agente en el mismo árbol.
- Ningún agente pide credenciales ni toca el proyecto real de Firebase.
