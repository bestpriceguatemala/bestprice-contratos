# Comisiones de empleados — informe en curso (13 oct 2026)

Estado: LEYENDO (nada commiteado todavía). Este archivo se actualiza conforme avanzo.

## Decisiones tomadas antes de escribir código

- Mensaje del coordinador: §12b del diseño es requisito. El campo editable de porcentaje desaparece de «Sacar carro»;
  se elige al empleado de una lista y el contrato se queda con el porcentaje que ese empleado tenga guardado, sin
  mostrarlo ni dejarlo cambiar. Una prueba fija la ausencia del campo.
- ADR-002, mitad estrecha (¿se queda legible `porcentajeComision` en el contrato con la sesión normal?): se decide
  abajo, en «ADR-002». Resumen de la razón: el mostrador tiene que LEER el porcentaje del empleado (`empleados`, regla
  `read: haySesion()`) para poder sellarlo en el contrato; moverlo del contrato no cierra nada mientras esa lectura exista.
- La lista de empleados NO lleva copia local (IndexedDB sigue en versión 3): una copia local se lee sin credencial, y el
  porcentaje sellado en un contrato tiene que ser el de AHORA, no el de la última vez que esta computadora sincronizó.

## Avance (commits en main)

- `4936787` núcleo del empleado (`js/nucleo/empleado.js`): código, nombre, porcentaje que puede ser 0.
- `c5f73d5` cuenta de comisiones (`js/nucleo/comisiones.js`): solo lo firme se paga; `empleadoId` en el contrato.
- `edf84c3` datos: `empleados` (lee el mostrador, escribe solo dinero), `pagosComision`, enlazar rentas viejas.
- siguiente: «Sacar carro» (el campo del % desaparece; se escoge al empleado por código o nombre).
- Pendiente: pantallas Empleados y Comisiones, §7b, verificación en navegador, ADR-002.
