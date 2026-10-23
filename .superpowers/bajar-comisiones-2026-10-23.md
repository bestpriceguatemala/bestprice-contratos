# Bajar las comisiones — informe (23 de octubre de 2026)

**Estado: hecho y verificado.** Base: `main` en `6128e00`, `npm test` = 2322 pasando, 0 rojas. Al terminar: **2498 pasando, 0 rojas**
(+176 en total; **75 son de este trabajo**: `pruebas/libro-nuevo.test.mjs` 18 y `pruebas/comisiones-excel.test.mjs` 57. El resto son de otro
agente que trabajaba en el buscador general al mismo tiempo; no toqué `version.txt`, `js/version.js`, `index.html`, `js/app.js` ni
`js/nucleo/busqueda.js`).

## Commits

| sha | qué |
|---|---|
| `b3ee377` | `js/respaldo/libroNuevo.js` (un .xlsx desde cero con el zip y las celdas del respaldo; `celdaNueva` se exporta de `hojas.js`) y sus 16 pruebas |
| `e735cfa` | la función y los botones en `js/pantallas/comisiones.js`, con 54 pruebas |
| `2058c2a` | pruebas que faltaban tras mutar, y dos endurecimientos de `libroNuevo.js` (`Object.hasOwn`) |
| `5557315` | diseño §6, §7b y §10 al día |
| `9f004e6` | la lista «lo que el respaldo NO lleva» (`NO_SE_RESPALDA`) dice dónde se bajan las comisiones aparte y que no se bajan solas |

## La decisión: el botón es el Excel de la cuenta (la copia del dueño), no el comprobante del empleado

Él dijo «un botón de bajar» después de que se le contó que el respaldo anual no lleva comisiones ni pagos: si pierde el acceso a Firebase,
esa historia no existe en nada suyo. Eso es una necesidad de **registro**, y solo un archivo con la cuenta entera la cierra. **Construí una cosa y
no dos mitades.**

### Por qué el Excel y no el papel

1. **El motivo que él dio es el archivo.** El papel de un pago no cierra el hueco: cubre un solo pago, solo después de hecho, y solo si se acuerda
   de imprimirlo y guardarlo; deja fuera lo que hace que una cuenta sea una cuenta (lo por pagar, lo que todavía no es firme, los pagos
   anulados). El Excel lleva todo eso, con la fecha en que se bajó.
2. **Paga por quincena y fin de mes, y decide cuándo.** No hay un momento fijo que dispare el archivo: se baja cuando él quiere, sin cambiar nada
   en la nube. «Rentas» trae el mes y la quincena de cada renta (de `quincenaDe`, la regla del núcleo) para que filtre el período que está pagando.
3. **El comprobante no se puede hacer honesto con lo que hay guardado.**
   - Un pago de comisión **no tiene `numero`** (§7b lo decidió a propósito: «a un empleado no se le imprime nada»). Un papel sin número no se
     puede citar ni se distingue de otro. Ponerle uno es un campo nuevo y un correlativo nuevo.
   - «Una reimpresión dice lo que dijo el original» exige que el pago guarde lo pagado **renta por renta**. Hoy guarda `monto`, `fecha`, `forma` y
     `contratos[]`; el detalle se armaría con las rentas de HOY. El comprobante de los dueños lo tolera con una nota («las rentas cambiaron después
     del pago»); el de un empleado, que tiene el papel en la mano, merece el campo guardado. Los pagos de antes no lo traerían.
   - Es un papel que SALE de la empresa hacia una persona. Que los empleados reciban papeles es una decisión de él, no mía.
4. **Lo que el Excel no hace, dicho:** no sirve para la persona que espera su pago. Si él se lo mandara, vería su propia cuenta (nada de otros
   empleados ni de lo que pagó el cliente) pero también lo estimado y lo que todavía no cierra. No lo presenté como comprobante en ningún texto.

### Lo que sería el otro (no construido)

Un «Imprimir comprobante» en cada pago de «Ya pagado»: una hoja con el membrete (`MEMBRETE`), el nombre del empleado, fecha, forma, **el monto
guardado**, las rentas cubiertas y una línea de firma, por el botón Imprimir (ADR-003). Pide **dos campos nuevos en el pago de comisión** (irían a §7b
con su razón): `numero` (correlativo, p. ej. en `contadores/comprobantesComision`) y un detalle guardado por renta (`detalle[]`).
**Ni colección nueva ni regla nueva de Firestore**: `contadores/{id}` ya se lee y se escribe con la sesión normal, y `pagosComision` solo
exige la credencial de dinero. Para ese trabajo **no hay que pegar nada en la consola**. Y una pregunta de él: ¿quiere que los empleados reciban
papeles? Esa pregunta es lo que falta, no la técnica.

## Qué se construyó

- **Dos botones**, dentro de lo que ya está detrás de la contraseña de dinero (no hay ruta nueva: `app.js` no se tocó): «Bajar esta cuenta en Excel»
  en la ficha de cada empleado y «Bajar todas las cuentas en Excel» en la lista (solo si hay cuentas).
- **Junto al botón se dice lo que el archivo es y lo que no**: «No se baja solo, y el respaldo del año no lleva las comisiones: si no lo bajas de
  vez en cuando, esta historia solo existe en el sistema. Lleva el nombre de los clientes de cada renta: guárdalo donde solo entres tú.»
- **Un libro nuevo** (`js/respaldo/libroNuevo.js`, ADR-004 opción C, que es para lo que sirve: mirar y guardar, no rentar con él). Reutiliza
  `escribirZip` (zip.js) y `celdaNueva`/`columnaDeNumero`/`escaparXml` (hojas.js); lo único nuevo son las partes que una plantilla ya traía hechas
  (tipos, relaciones, libro, estilos). **Sin fórmulas** (Excel abre en «Vista protegida» y no las calcula): todo es un valor.
- **Tres hojas**: «Resumen» (una fila por cuenta + «Todos» si son varias, con la advertencia y la fecha), «Rentas» (una fila por renta, filtro y fila
  de títulos fija) y «Pagos» (cada pago, también los anulados).
- **Nombre**: `Comisiones de Ana López 2026-10-23.xlsx` o `Comisiones de todos 2026-10-23.xlsx`.

### Lo que lleva y lo que no (y por qué)

Por la misma lógica del comprobante de los dueños (un papel es sobre quien lo recibe):

| lleva | no lleva |
|---|---|
| de cada renta: contrato, salió, regresó, mes y quincena, placas, **nombre del cliente**, días, atraso, base, % y comisión | lo que el cliente pagó, su saldo, su garantía (la pantalla dice por qué una renta no cierra, con cifras del cliente; el archivo solo dice que no ha cerrado) |
| de cada pago: fecha, forma, **monto guardado**, estado, fecha de anulación, qué contratos cubre, y si hoy suman otra cosa | el costo y el dueño de un carro ajeno, los datos de la tarjeta, la utilidad |
| el código y el porcentaje **de hoy** del empleado, y su total | nada de otro empleado en el archivo de uno |

El nombre del cliente sí va (identifica la renta cuando el sistema ya no esté, que es justo el caso); por eso la advertencia. Una prueba compara
las columnas de las tres hojas contra una lista exacta, otra busca el costo/dueño/tarjeta/garantía en todo lo que sale (con una renta de carro ajeno y
una con garantía retenida), y otra comprueba que el archivo de uno no tenga una sola celda de otro.

### Cómo cumple lo que obliga

- **Detrás de la contraseña, y lo leído se suelta.** Vive en la pantalla de comisiones. **Lee de nuevo de la nube** en cada clic (nunca la copia que
  la pantalla tiene en memoria; un archivo que se guarda como historia no puede salir de una copia vieja), no guarda nada en variables del módulo
  (una prueba lo exige: ni `let`/`var` ni toca el `lector` ni storage) y mira la sesión **antes de leer, después de leer y antes de entregar**: si se
  cierra en medio, no sale nada. Comprobado en el navegador: cerré la sesión a media lectura y volvió la pantalla de contraseña, sin archivo.
- **Ninguna regla se repite.** Cada cifra es `comisionDe`, `cuentaDeEmpleado` (`totalPorPagar`, `totalEstimado`, `totalPorCerrar`,
  `pagosQueCambiaron`), `totalesDePagos`, `totalGeneralDeComisiones`, `estadoDeComision` y `quincenaDe`. Una prueba busca que la sección no multiplique
  por el porcentaje, no use `estadoContrato`/`pendientesDe`/`.firme`, no parta fechas, no sume por su cuenta y no lea el reloj.
- **Lo que es deuda no se mezcla con lo que no lo es.** «Por pagar», «Estimada» y «Ya regresó, falta que cierre» son tres columnas de dinero
  distintas; sumar una columna entera da una cifra que significa algo, y coincide con la del núcleo (prueba).
- **Lo pagado es lo guardado** (la regla del comprobante de los dueños). «Monto pagado» es el `monto` del pago; si hoy esas rentas suman otra cosa, lo
  dice la columna «Hoy esas rentas suman» y el aviso con las palabras de la pantalla. «Ya pagada (lo que suma hoy)» lo dice en su nombre. El archivo
  lleva su fecha («Cuenta al 23 oct 2026… una foto del día en que se bajó»), así que bajarlo dos veces son dos fotos fechadas, no una reimpresión.
- **Una lectura caída nunca es «no se le debe nada».** Si falla la lectura de rentas, de pagos o hay un pago dañado: no se arma ni se entrega nada y se dice
  cuál, con las mismas frases de la pantalla, en una barra roja que **se queda escrita** (no un aviso de cinco segundos). El modelo lanza ante una vista
  mala, pagos que no son lista o sin `hoy`. Si falla solo la lista de empleados, baja con el aviso escrito adentro (las cifras no dependen de ella).
  La pantalla de fallo no ofrece ningún botón de bajar.
- **`q()` y `dinero()`, fechas ISO, `hoy` recibido.** El dinero de cada celda es el número que ya salió de `q()` con formato `Q#,##0.00`; las fechas son
  fechas de Excel (`serialDeFecha`, que usa `diasEntre`); una fecha que no se puede escribir queda como **texto** (no se pierde) y se avisa en pantalla y
  adentro del archivo. Ningún `new Date`/`hoyISO()` en la sección ni en `libroNuevo.js` (el archivo trae adentro el día y los mismos datos dan los mismos
  bytes). No hay kilómetros en el archivo.
- **Nombres de campo de §7b verbatim, y ningún campo nuevo**: el archivo no guarda nada. §7b lo dice, para que nadie crea que hubo uno. **Ninguna colección ni
  regla de Firestore** (`firestore.rules` intacto).

## Verificado abriendo el archivo de verdad

Armé el archivo con el código real (cuenta de Ana con 9 rentas de todos los tipos y 3 pagos, uno anulado y uno que cambió; y la de todos).
- **Microsoft Excel 16.114** (el de la máquina), con AppleScript: abrió sin pedir «reparar», tres pestañas (Resumen, Rentas, Pagos), fechas como
  `16/09/2026`, dinero como `Q2,800.00`, `Ñandú & Hijos <S.A.> "El Rápido"` intacto, el rango usado `A1:R10`, y una captura de la hoja Resumen con el título en
  negrita, las notas en cursiva y el encabezado azul. El archivo de todas las cuentas también (Resumen con «Todos» en Q690.00).
- **openpyxl 3.1.5**, un lector que no es el del proyecto: lee los tres libros; las fechas son `datetime`, el dinero tiene su formato, el filtro es `A1:R10` y la
  fila 2 está congelada.
- **Quick Look de macOS** produjo la miniatura de los dos (otro lector más).
- `unzip -t`: «No errors detected».

## Verificado en pantalla con clics reales

Árbol servido = `git archive 2058c2a` (no el árbol de trabajo, donde otros agentes tenían cambios a medias). Puerto **4731**, comprobado libre con `lsof`
antes de arrancar y cerrado al terminar (solo queda una conexión CLOSE_WAIT del propio navegador). Las tres URL de Firebase se cambian por falsos locales con un
import map; revisé los falsos: ninguna llamada de red (`grep fetch` vacío). IndexedDB `bestprice-contratos` **versión 3**, sembrada con los constructores reales
(`construirContrato`, `construirCierre`, `agregarPago`, `contratoParaGuardar`): 11 rentas (cinco situaciones de Ana, Luis, Wilder al 0 %, «Pedro» escrito a mano, un
carro ajeno), 2 pagos. La contraseña del área fue el texto inventado del arnés contra la autenticación FALSA; no se tocó el proyecto real.

1. Entré al área de dinero → Comisiones: la lista sale con el botón y la frase; Ana Q560.00, Luis Q270.00, Pedro Q140.00, Wilder Q0.00, total Q970.00.
2. «Bajar todas las cuentas en Excel»: el aviso dice «4 cuentas, 11 rentas y 2 pagos. Se debe Q970.00», **igual que el total de la pantalla**. El navegador dio un clic de
   descarga con el nombre `Comisiones de todos 2026-10-23.xlsx`; **tomé ese blob** (lo hizo `CompressionStream` del navegador, no Node), lo mandé a mi servidor local y lo
   leí con openpyxl: 7,053 bytes, los datos correctos, el carro ajeno sale con sus placas y sin Don Mario, Ford ni costo.
3. En la ficha de Ana: «Bajar esta cuenta en Excel» → 8 rentas, 2 pagos, «Se debe Q560.00»; el archivo no trae a nadie más.
4. Con `pagosComision` caído (falla inyectada): barra roja **«No se bajó nada. No se pudieron leer los pagos de comisión…»**, ningún archivo nuevo y el botón vuelve a quedar activo.
5. Con la lectura lenta, apreté el botón (se vio «Armando el archivo…») y cerré la sesión de dinero a media lectura: ningún archivo, y volvió la pantalla de contraseña.
6. Consola sin errores.

## Mutaciones

Unas **110 corridas** (script que aplica una mutación, corre las tres suites —`comisiones-excel`, `libro-nuevo`, `comisiones-pantalla`— y restaura): 79 al código de comisiones
(las cifras, qué columna lleva cada cosa, el alcance de un empleado, las guardas de sesión y de lectura, los botones y el mensaje de fallo) y 27 a `libroNuevo.js`.
En la primera pasada **sobrevivieron 12**: 2 eran equivalentes (dos guardas redundantes, «Pagada el» y «aviso de pago anulado»; las quité del código en vez de dejar código muerto),
1 era una mutación mía que no cambiaba nada, y **9 mostraron pruebas que faltaban**, ya agregadas y vueltas a mutar (todas muertas): una renta repetida o vacía en la lista de un pago,
pagos que llegan copiados (se reconoce por el id y no solo por el objeto), las propiedades del archivo (título y asunto), `hoy` validado **antes** de leer, que el mensaje de fallo
se dibuje en la lista, el ancho de columna, que solo la primera pestaña quede seleccionada, y `'toString' in ESTILO` (un nombre que todo objeto trae pasaba por estilo o por tipo de
columna: ahora `Object.hasOwn`, con prueba).

## Preocupaciones

1. **Que lo baje.** No se baja solo: si no aprieta el botón de vez en cuando, las comisiones siguen existiendo solo en el sistema. Lo dice el texto junto al botón y la lista
   «lo que el respaldo NO lleva», pero el aviso de «pasó un año» **no** lo cuenta (no anota nada en `ajustes/respaldo`, a propósito: anotar un archivo que no es el respaldo
   callaría el aviso del que sí lo es). Si quiere que el sistema se lo recuerde, es una decisión aparte.
2. **El archivo lleva el nombre de los clientes** de cada renta, y el del archivo de todas las cuentas, el porcentaje de cada empleado. Está dicho junto al botón y dentro del archivo.
   Si lo manda por WhatsApp a un empleado, ese ve lo estimado y lo que no ha cerrado de su cuenta (nada de los demás).
3. **El archivo de «todas» junta a todos los empleados.** El de uno solo es seguro de compartir con esa persona; el de todos no. Se dice «todas las cuentas» en el título y el nombre.
4. **Lo pagado renta por renta no está guardado**; el archivo muestra el monto guardado del pago y lo que las rentas suman hoy en columnas separadas, pero no puede decir cuánto se
   pagó por cada renta de un pago de varias. Es el mismo límite del comprobante de los dueños, y lo cerraría el detalle guardado del comprobante (arriba).
5. **El Excel del navegador** (el blob real) lo abrí con openpyxl y Quick Look y pasa `unzip -t`, pero **no lo abrí en Excel**: al pedírselo, Excel mostró su aviso de permiso de
   archivos («Grant File Access», en otro escritorio del Mac) que no pude responder sin tomar la pantalla. El mismo código, escrito por Node, sí lo abrió Excel (arriba). Si queda un
   aviso así abierto en su Excel, es el mío: se cancela.
6. **El Blob de la descarga** queda 60 s en memoria del navegador (lo hace `descargarArchivo`, del respaldo, y no lo cambié). El archivo ya está en su carpeta de descargas; no
   lo suelta `alOlvidarElDinero`. Es menor.
7. La barra roja de un fallo se queda hasta el siguiente intento o hasta cambiar de pantalla (no se borra sola a propósito).
