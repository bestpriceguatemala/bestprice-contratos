# Comprobante de pago de comisión — informe (decidido el 23 de octubre de 2026, construido a partir del 24)

**Estado: EN CURSO.** Base: `main` en `f0c192c`, `npm test` = 2498 pasando, 0 rojas, árbol limpio.
(Se va escribiendo a medida que avanzo; si me cortan, lo último de «Dónde voy» dice el siguiente paso.)

## Dónde voy
- [x] 1. Núcleo (`4944e16`): el detalle por renta que el pago guarda (`detalle[]`) y su validación (`estadoDelComprobante`).
- [x] 2. Datos (`c78f65e`): contador `contadores/comprobantesComision`, `numero` + `detalle` en el pago, y que anular un pago de antes NO le ponga número.
- [x] 3. `registrarElPagoDeComision` (`c78f65e`): número tomado una vez por intención (como el id), el detalle que se guarda es el que él vio.
- [x] 4. El papel (`ead1304`): `js/pantallas/comprobanteComision.js` (modelo, hoja, pantalla).
- [x] 5. La ficha (`5e45c03`): número en «Ya pagado», botón «Ver comprobante», nota para los pagos de antes, nada para los anulados.
- [x] 5b. Excel «Pagos»: columna «Comprobante N°» (`41e9b46`).
- [x] 5c. Impreso a PDF y mirado (ver «Verificación»): una hoja Carta, sin menú ni botones ni avisos; sin CSS nuevo para el papel.
- [ ] 6. Diseño (§5, §6, §7, §7b, liquidación §6) y comentarios que dejaron de ser ciertos.
- [ ] 7. Verificación: imprimir a PDF y mirar; clics reales (pagar, imprimir, anular, imprimir otra vez).

## Decisiones (con su razón), tomadas al leer y antes de escribir código

1. **Dos campos nuevos en el pago, y solo dos**: `numero` y `detalle[]`. Ni colección nueva ni regla de Firestore:
   `contadores/{id}` ya es `haySesion()` y `pagosComision` es `esDinero()` sin mirar campos (`firestore.rules`, leído).
2. **El número tiene SU contador** (`contadores/comprobantesComision`), no el de los dueños: si compartieran, la serie de los
   dueños (que ya tienen papeles en la mano) saltaría números que no son suyos. Mismo mecanismo (transacción), otro documento.
3. **El número se toma UNA vez por intención de pagar**, igual que el id (`enCurso`): un reintento cae en el mismo documento
   con el mismo número, y no deja un hueco por cada reintento.
4. **Pagos de antes (sin `numero` ni `detalle`): el papel se NIEGA y dice por qué.** No se recalcula con las cifras de hoy (sería
   decir «esto fue lo que se pagó» sobre algo que nadie guardó), no se les pone número al imprimir (gastaría un número de una
   serie que el empleado nunca vio y los haría parecer nuevos), y **anular uno de antes tampoco les pone número ni detalle**
   (`guardarPagoComision` distingue crear de reescribir).
5. **Anulado: se sigue lo que ya decidió `comprobante.js`** — el papel se niega (ya no pagó nada), el número se conserva
   (el empleado tiene el papel viejo), y la ficha no ofrece el botón.
6. **Rentas que hoy suman otra cosa**: igual que el de los dueños, el total sigue siendo lo guardado y el dueño del negocio lo
   ve en pantalla antes de mandar (`no-imprimir`). Lo único que cambia: el papel NO lleva la nota «las rentas cambiaron»,
   porque con el detalle guardado esa frase sería falsa (el detalle sigue sumando el total) y porque una reimpresión tiene que
   ser igual al original.

## Verificación hecha (24 de octubre)

- Árbol servido por mi servidor en el puerto **4747** (comprobado libre con `lsof`; cerrado al terminar), con falsos locales de los tres módulos de Firebase
  (import map inyectado en el HTML al servirlo: `index.html` no se tocó), IndexedDB `bestprice-contratos` **v3** sembrada, y mi propia pestaña del navegador.
  La nube falsa aplica las reglas de `firestore.rules`: `contadores` con cualquier sesión, `pagosComision` solo con la de dinero.
- Clics reales: entrar al área de dinero → Comisiones → Ana → «Todo octubre» → Registrar pago → Guardar. Resultado: «Pago registrado: Q450.00. Comprobante N.° 1.»,
  `contadores/comprobantesComision = 1` escrito por la sesión del **mostrador**, el pago escrito por la de **dinero**, con `numero: 1` y las tres filas de `detalle`,
  ningún `undefined`. «Ver comprobante» dibuja la hoja; el botón de imprimir llama a `window.print()` una vez con el título «Comprobante de comisión 1 - Ana López».
- Anular con clic real: el diálogo dice «comprobante N.° 1 … el papel que el empleado tiene deja de valer, y ese número no se reutiliza»; la tarjeta queda con su
  número y «Anulado el …», sin botón de papel. Anular con clic real el **pago de antes** (p1): en la nube quedó SIN `numero` ni `detalle`, y el contador no se movió.
  El siguiente pago recibió el **N.° 2** (el 1, anulado, no se reutiliza).
- PDF (Chrome headless contra la pantalla real, `Page.printToPDF`, Carta): **1 página**; el papel sin el menú, sin el aviso de respaldo, sin botones y sin el aviso
  rojo. Mirado como imagen. La pantalla de «no se pudo armar» (pago anulado) impresa da una página en blanco: nada sale del sistema.
- Reimpresión tras corregir un cierre (el regreso de una renta se corrió un día en la nube falsa): la ficha dice «Lo que se pagó el 24 oct 2026 fue Q450.00, y hoy esas rentas
  suman Q485.00», la pantalla del papel lleva ese aviso en la barra roja (`no-imprimir`), y el **texto de la hoja es idéntico** al primero (el PDF pesa lo mismo, 220,407 bytes).
- Pantalla vieja: con la ficha abierta se anuló el pago «desde otra pestaña» (escribiendo en la nube falsa) y se apretó «Ver comprobante» en la copia vieja: el sistema
  **lee de nuevo**, y en vez de la hoja dice «El pago N° 1 está anulado desde el 24 oct 2026…». Consola sin errores en todo el recorrido.
