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
