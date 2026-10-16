# ADR-001: No guardar números de tarjeta

- **Status**: accepted
- **Date**: 2026-09-23
- **Deciders**: Esteban Urízar
- **Tags**: seguridad, datos-de-clientes, contratos

## Context

El contrato de renta se imprime sobre un formulario de papel que lleva los datos
de la tarjeta del cliente: número, vencimiento, CBC, banco emisor, número de
autorización y monto autorizado. El cliente firma ese papel y la tarjeta queda
bloqueada con una garantía mientras el carro anda fuera.

El Excel que hoy hace este trabajo guarda en la hoja CONTRATOS el **número
completo de las dos tarjetas** de cada contrato, junto con su vencimiento, banco,
autorización y monto. El CBC no lo guarda: solo se teclea en INGRESO DE DATOS y
sale impreso.

Al pasar eso a un sistema web, el archivo deja de estar en una computadora y
pasa a estar en internet. Un Excel con tarjetas vive en una máquina; una base de
datos con tarjetas es un objetivo. Si alguien entra, se lleva las tarjetas de
todos los clientes de la empresa, y el dueño queda respondiendo por eso.

La pregunta que decidió el asunto fue práctica: **¿alguna vez se necesita ver el
número completo después de que el carro se fue?** La respuesta del dueño fue no;
con los últimos cuatro dígitos se ubica cuál tarjeta se usó.

## Decision

El sistema **no guarda el número completo de la tarjeta ni el CBC**.

- El número completo y el CBC se escriben al sacar el carro, se imprimen en el
  contrato de papel y no quedan en ningún lado: van del teclado a la impresora.
- De cada tarjeta se guardan **los últimos cuatro dígitos**, el vencimiento, el
  banco emisor, el número de autorización y el monto autorizado. Es suficiente
  para identificar la tarjeta, reclamar un cargo y llevar el control de la
  garantía bloqueada.
- Una reimpresión de un contrato viejo sale con el número enmascarado
  (`•••• 3343`), porque el completo nunca existió en la base de datos.

## Consequences

### Positive

- Si alguien entra al sistema, no hay tarjetas que llevarse.
- El dueño deja de tener una responsabilidad legal y económica que hoy carga sin
  darse cuenta.
- La copia de respaldo en Excel, que sale del sistema y se guarda en su
  computadora, tampoco lleva tarjetas completas.

### Negative

- No se puede reimprimir un contrato viejo con la tarjeta completa. Si se
  necesita, hay que pedírsela otra vez al cliente.
- No se puede pasar un cobro posterior tomando el número del sistema; hay que
  usar el papel firmado o la autorización ya registrada.

### Neutral

- El contrato impreso sigue llevando todos los datos, igual que hoy. Para el
  cliente y para el trámite con el banco, nada cambia.
- La decisión se aparta del Excel actual, que sí guarda el número completo. El
  respaldo generado por el sistema escribirá esa columna enmascarada.

## Aclaración (16 de octubre de 2026): el salto de «Sacar carro» a «Imprimir contrato»

«Van del teclado a la impresora» sigue siendo cierto, pero antes el mostrador tecleaba el número y el CBC **dos
veces** con el cliente enfrente: al sacar el carro (de donde solo se guardaban los últimos 4) y otra vez en la pantalla
de imprimir. El dueño aprobó llevarlos de una pantalla a la otra. Lo que NO cambia la decisión: siguen sin guardarse en
ningún lado (ni en el contrato, ni en IndexedDB, ni en Firestore, ni en `localStorage` o `sessionStorage`, ni en la
dirección, el título o el historial, ni en la red ni en la consola). Viven en **una variable de memoria**
(`js/pantallas/traspasoDeTarjetas.js`), y solo así:

- Van **atados al id del contrato**: la pantalla de imprimir de otro contrato no ve nada. Es el peor caso posible (la
  tarjeta de un cliente en el papel de otro) y la primera defensa. La pantalla de imprimir además comprueba que el número
  termine en los últimos 4 dígitos que el contrato guardó, y si no, no lo pone.
- Se entregan **una sola vez**: entrar a cualquier pantalla de imprimir los borra. Quien vuelva a entrar, recargue o escriba
  la dirección a mano ve las cajas vacías y los teclea como siempre.
- Se borran **al cambiar de pantalla** a cualquier lado que no sea imprimir ese contrato, y **al minuto** (el salto real dura
  milisegundos; un temporizador los borra de la memoria y además se comprueba la hora al tomarlos).
- Guardar otra renta los reemplaza, y una renta sin tarjeta también los borra: lo del primero no sale en el segundo.

Una vez en la pantalla de imprimir son las mismas cajas de siempre: se vacían al terminar de imprimir (`afterprint`, imprima o
cancele) y al salir. La advertencia de no guardar la hoja como PDF sigue en pie.

## Links

- [Diseño del sistema](../superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md) — §3, §5 y §11
