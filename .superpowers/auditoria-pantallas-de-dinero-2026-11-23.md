# Auditoría de las pruebas, segunda parte: las pantallas de dinero — 23 de noviembre de 2026

**De dónde viene esto.** La auditoría del 26 de octubre midió a fondo el 28.3 % del código y dejó dicho,
con todas sus letras, que **no midió el 57.1 %**: casi todas las pantallas y el respaldo a Excel. Lo más
grande sin medir eran las dos pantallas de dinero. El dueño pidió el 23 de noviembre: *«Sí, arranca con
todo. Y corre tú todas las pruebas que necesite.»*

Línea base: commit `ee134cf`, árbol limpio, `npm test` = **2,738 pasan, 0 fallan**.

---

## 0. Primero el instrumento

El arnés de octubre vivía fuera del repositorio y **se había perdido**. Se reconstruyó y esta vez vive
dentro: `analisis/mutaciones/` (ver su `LEEME.md`). La razón es la del 25 de octubre, cuando un script
reportó «12 mutantes, todos muertos» sin haber corrido ninguna prueba: **un arnés sin controles no mide,
adivina.**

### Los nueve controles, antes de medir nada

| Control | Qué se hizo | Se espera | Salió |
|---|---|---|---|
| TUBERÍA | Una prueba sembrada con `assert.equal(1, 2)` | código 1 | **código 1** |
| NOOP-A | `n === 1` → `1 === n` en `dinero.js` | sobrevive | **sobrevive** |
| NOOP-B | Una orden que no hace nada dentro de `armarVista` | sobrevive | **sobrevive** |
| NOOP-C | Lo mismo en `armarVistaDeComisiones` | sobrevive | **sobrevive** |
| NOOP-D | El mismo juicio escrito en otro orden (`comisiones.js`) | sobrevive | **sobrevive** |
| ROMPE-A | `throw` al cargar `dinero.js` | muere | **muere** (13 pruebas lo alcanzan) |
| ROMPE-B | `throw` al cargar `comisiones.js` | muere | **muere** (12) |
| ROMPE-C | `return { ok: false }` → `{ ok: true }` en `armarVista` | muere | **muere** (8 rojas) |
| ROMPE-D | Lo mismo en `armarVistaDeComisiones` | muere | **muere** (2 rojas) |

Los nueve pasan. El arnés mide algo.

---

## 1. El primer hueco, y el peor: 26 mensajes del dueño se podían dejar en blanco

Esto salió antes de terminar de medir las pantallas, y es el hallazgo más grande del día.

**Lo que pasaba.** Vaciar `MENSAJE_FALLO_RENTAS` (`export const MENSAJE_FALLO_RENTAS = '';`) dejaba las
**144 pruebas de comisiones verdes**. En la pantalla eso no es un detalle: es la barra roja de «no se
pudieron leer las rentas» dibujada **sin una palabra adentro**, y el dueño mirando una pantalla sin cuentas
y sin ninguna explicación de por qué.

**Cuánto.** Se barrieron los 63 mensajes de una línea del sistema, uno por uno, vaciándolos y corriendo
todas las pruebas que los alcanzan:

| | Mensajes | Se podían vaciar sin que nadie lo notara |
|---|---:|---:|
| Antes | 63 | **26 (41 %)** |
| Después del arreglo | 63 | **0** |

Los 26 eran, casi todos, los de **«no se pudo leer / no se pudo guardar / no se pudo anular»** — justo los
que aparecen cuando algo sale mal, que es cuando la pantalla más tiene que hablar:

- `comisiones.js` (11): fallo de rentas, de pagos, de datos, de empleados; «mientras tanto cambió la
  cuenta»; anular no está / falló; comprobante falló / no está; enlace falló.
- `dinero.js` (7): fallo de contratos, de pagos, de datos; anular falló; costo falló; enlace falló;
  comprobante falló.
- `datos.js` (3): el carro ya no está; quedó en la nube pero no aquí; «primero entra al área de dinero».
- `empleados.js` (3), `duenos.js` (1), `nucleo/carro.js` (1: falta el motivo), `respaldo/nube.js` (1).

**Por qué ninguna prueba lo veía.** Siete de ellas armaban su expectativa **con la misma constante que
estaban revisando**:

```js
assert.match(texto(html), new RegExp(MENSAJE_FALLO_RENTAS.slice(0, 30)));
```

Con el mensaje vacío, el patrón queda vacío; y un patrón vacío hace juego con cualquier cosa. **Esa prueba
no podía ponerse roja nunca.** De paso, armar una expresión regular con texto sin escapar es frágil por su
cuenta: un paréntesis en el mensaje la reventaría.

**El arreglo** (commit `6b6daa9`):
1. Las siete ahora revisan el mensaje **completo** con `includes`, sin armar patrones.
2. `pruebas/mensajes-del-dueno.test.mjs` cierra la clase entera, también para los mensajes que se escriban
   después: la lista de archivos con mensajes tiene que estar completa (si una pantalla nueva declara uno y
   nadie la registra, se pone roja); ningún mensaje está vacío, ni mide menos de 20 letras, ni tiene menos
   de 4 palabras, ni trae relleno (`undefined`, `TODO`, `[object `); y ninguno se repite con otro nombre
   salvo los siete pares de dueños y comisiones que hoy dicen lo mismo a propósito.

Al escribir la prueba, su propio guardia encontró que **`js/cache.js` también declara mensajes** y se había
quedado fuera de la lista. Ya está dentro.

---

## 2. Lo que se revisó y NO era problema

Hay que decirlo igual que los hallazgos, o el informe solo cuenta la mitad.

- **Siete pruebas parecían no afirmar nada** (`buscador-pantalla`, `hoja-contrato` ×2, `respaldo-nube` ×4).
  Se abrieron una por una: todas afirman a través de un ayudante (`cerca`, `seNiega`, `esperar`), y
  `esperar` llama a `assert.fail` si la condición nunca se cumple. **No hay pruebas vacías en el sistema.**
- **Ninguna prueba tiene una sola afirmación trivial** (`assert.ok(true)` y parientes): cero.

---

## 3. El arnés estaba descalibrado, y hubo que medir dos veces

La primera corrida terminó y **no se dio ese número**. El operador de textos tenía dos defectos que
jalaban en direcciones contrarias — la peor forma de estar mal, porque el resultado parecía razonable:

1. Metía errores en los textos que viven **dentro de un comentario**. Un comentario no se ejecuta: esos
   mutantes no se podían matar nunca, eran sobrevivientes garantizados y **bajaban** el puntaje de a gratis
   (17 en las dos pantallas).
2. Leía como un texto el **hueco entre dos textos pegados**. En `{ '&': '&amp;', '<': '&lt;' }` tomaba
   `': '` por un texto y lo vaciaba, lo que deja código roto: esos mueren siempre y **subían** el puntaje
   (65, casi todos en el escapador de HTML).

Arreglado (los textos salen de `regionesDeCodigo`, que ya distingue un comentario de un texto porque
recorre el archivo una sola vez), los nueve controles pasaron otra vez y **las dos mediciones se repitieron
completas**. Lo de abajo es la segunda corrida, sobre el commit `ca4997e`, con las pruebas nuevas del
descuento ya dentro.

## 3b. Las dos pantallas de dinero, medidas

| Archivo | Errores metidos | Atrapados | Pasan sin que nadie lo note | Atrapa |
|---|---:|---:|---:|---:|
| `js/pantallas/dinero.js` (23 nov) | 1,042 | 484 | 558 | **46.4 %** |
| `js/pantallas/dinero.js` (25 nov, mañana) | 1,058 | 714 | 344 | **67.5 %** |
| **`js/pantallas/dinero.js` (25 nov, tarde)** | **1,058** | **760** | **298** | **71.8 %** |
| `js/pantallas/comisiones.js` (23 nov) | 1,008 | 573 | 435 | **56.8 %** |
| **`js/pantallas/comisiones.js` (26 nov)** | **1,008** | **665** | **343** | **66.0 %** |

El 23 de noviembre las dos juntas atrapaban el 51.6 %. Al 26 de noviembre, **las dos juntas atrapan el
69.0 %** (1,425 de 2,066): `dinero.js` el 71.8 % y `comisiones.js` el 66.0 %.

### Lo que le queda a `comisiones.js` (26 de noviembre)

| Pasan / total | Dentro de |
|---:|---|
| 50 / 77 | los oyentes de eventos (el reparto de cada botón a su acción) |
| 45 / 134 | `avisoDelPapelQueNoCambia` (lo que cambió en las rentas desde que salió el papel) |
| 23 / 50 | `guardarPago` |
| 22 / 41 | `enlazar` |
| 15 / 46 | `armarVistaDeComisiones` |
| 15 / 55 | `modeloDeComisionesEnExcel` |
| 14 / 37 | `anularPago` |
| 11 / 24 | `dibujar` |
| 8 / 26 | `bajarExcel` |

Lo trabajado el 26 bajó así, en errores que pasan: `bajarExcel` de 26 a 8, `verComprobante` a 4,
`guardarPago` de 39 a 23, `anularPago` a 14, `enlazar` a 22.

Cero anomalías y cero mutantes colgados: cada uno de los 2,050 terminó con un veredicto.

Para comparar: en lo medido a fondo en octubre (el núcleo del dinero, los estados, los papeles) la suite
atrapaba el **79 %**. En estas dos pantallas atrapa la mitad.

### Dónde están los que pasan

**El 59 % de todos los sobrevivientes (581 de 993) está en las dos funciones que se llaman `pintarCuentas`**
— el cableado entre lo que él aprieta en la pantalla y las funciones que deciden el dinero:

| Función | Sobreviven / total | Atrapa |
|---|---:|---:|
| `pintarCuentas` (dinero) | 335 / 354 | **5 %** |
| `pintarCuentas` (comisiones) | 246 / 321 | **23 %** |
| `avisoDelPapelQueNoCambia` (comisiones) | 45 / 134 | 66 % |
| `dibujarEntrada` (dinero) | 22 / 23 | 4 % |
| `textoConfirmarAnularPagoDueno` (dinero) | 18 / 31 | 42 % |
| `armarVistaDeComisiones` | 15 / 46 | 67 % |
| `modeloDeComisionesEnExcel` | 15 / 55 | 73 % |
| `instalarLatidos` + `alExpirarPorInactividad` + `olvidarLosDatos` (el candado del área de dinero) | 29 / 35 | 17 % |

Es el mismo retrato que en octubre con «Sacar carro» y «Recibir carro»: **las funciones que DECIDEN están
vigiladas; el cableado que las conecta con la pantalla, no.** Ese cableado no se puede ejercitar en Node
sin navegador — pero el proyecto ya tiene un navegador de mentira (`navegadorFalso`, `contenedorFalso`) con
el que se prueban otras pantallas, así que es trabajo pendiente, no trabajo imposible.

### Lo que se cerró en esta tanda

**El descuento de un pago de más no tenía NI UNA prueba.** `resumenDelDescuento`,
`textoDelProblemaDelDescuento` y `textoDeDescuentoSinRespaldo` estaban **importadas** en
`pruebas/dinero.test.mjs` y no las llamaba ninguna prueba: de un vistazo el archivo parecía cubrirlas.
31 errores sobrevivían ahí. Lo que se podía romper en silencio era dinero:

- que el descuento tecleado se leyera como 0 (él cree que descontó Q500 y entrega los Q600 completos);
- que un descuento igual al tope se rechazara, o que uno ilegible se aceptara como válido;
- que un valor ilegible se volviera un descuento de Q1;
- que la pantalla bloqueara el guardado **sin decir por qué**, con el texto del problema vacío.

Diez pruebas nuevas sobre una cuenta de verdad (una renta pagada con 3 días de atraso y corregida después
a 0: Q900 de más, con otra de Q600 por pagar). **De los 34 errores que sobrevivían en esa zona, 25 ya
mueren.** Los 9 que siguen vivos, uno por uno y sin maquillaje:

| Sigue vivo | Por qué |
|---|---|
| `texto ?? ''` → `|| ''` (×2) y `marcados ?? new Set()` → `||` | De verdad no cambian nada: el valor nunca es `0`, `false` ni `''`. **Equivalentes.** |
| `.trim()` borrado | `Number(' 100 ')` ya vale 100 y `Number(' ')` ya vale 0. **Equivalente.** |
| `ilegible ? 0 : q(pedido)` → `? 1 :` | Ese valor no sale de la función: abajo, `valido ? descuento : 0` lo deja en 0 igual. **Equivalente.** |
| `deMas > 0` → `deMas > 1` | Borde real de UN quetzal, pero no se pudo armar una cuenta con exactamente Q1 de más con los ayudantes que hay. **Pendiente, dicho.** |
| `c?.id` → `c.id` | Defensa contra un dato dañado en la lista. Matarlo pide armar una cuenta con una entrada nula a mano. **Pendiente, dicho.** |

**Y el escapador se comía los apóstrofos.** La prueba del nombre con signos raros cubría `<`, `>`, `"` y
`&`, pero no el apóstrofo; por eso nadie veía que si esa parte se rompía, «D'Angelo» salía en pantalla como
«DAngelo» — el apóstrofo no se escapaba mal, **desaparecía**. Ya está cubierto en los dos lugares donde se
dibuja un nombre.

---

## 3c. La hora y las fechas

A pedido del dueño («solo ten en cuenta lo de la hora y fechas»). `js/ui.js` estaba dentro del 57 % que
octubre dejó sin medir, a pesar de que ahí vive `hora24`, que decide a qué hora regresó un carro y por
tanto cuánto se cobra de atraso.

| Archivo | Errores | Atrapados | Pasan | Atrapa |
|---|---:|---:|---:|---:|
| `js/ui.js` | 155 | 116 | 39 | **74.8 %** |
| `js/nucleo/fechas.js` | 125 | 105 | 20 | **84.0 %** |

**`hora24` sola atrapa el 91 %** de 74 errores: la hora está bien cuidada. Lo que estaba flojo era otra
cosa, y se cerró:

1. **Una fecha con un mes o un día imposible se volvía OTRA fecha.** Sin el guardia de `aUTC`,
   `'2026-00-10'` pasaba a `Date.UTC(2026, -1, 10)` y se convertía en **diciembre de 2025**: `sumarDias`
   devolvía `'2025-12-11'` y `diasEntre` contaba **31 días que no existieron**. Aquí los días son dinero.
2. **Los nombres de los meses no estaban todos probados.** Vaciar `'feb'` dejaba «14  2026» —una fecha sin
   mes, en un mensaje que él lee— y ninguna de las 2,772 pruebas se daba cuenta. Pasaba en los dos lugares
   que tienen la lista a propósito (`fecha` en ui.js y `textoFecha` en el núcleo).
3. **`montoTecleado` aceptaba notación que nadie teclea como dinero**: `'1e5'` se volvía cien mil quetzales
   y `'0x10'` dieciséis.

**Y uno que parecía hueco y no lo era:** el guardia de `diasAtraso` se puede borrar sin que nada se ponga
rojo, pero no porque falte una prueba — `diasEntre` ya devuelve 0 por su cuenta cuando una fecha no se
entiende. Se comprobó a mano antes de escribir una prueba para un problema que no existía.

**Lo que queda sin vigilar en `ui.js`:** `aviso()` (11 de 11 errores sobreviven), el aviso flotante que
sale arriba cuando algo se guarda. Toca el DOM y la suite corre en Node sin navegador — está dicho en la
cabecera del archivo de pruebas desde que se escribió. Es el mismo caso que `pintarCuentas`: trabajo
pendiente, no imposible, porque el proyecto ya tiene un navegador de mentira.

## 3d. `pintarCuentas`, el hueco más grande, medido otra vez

El 59 % de todo lo que pasaba sin que nadie lo notara estaba en las dos funciones que pintan la pantalla.
Se atacó la de dinero. **No estaba rota: no se PODÍA probar** — hacía falta un navegador, una sesión de
Firebase de verdad y la nube, así que ninguna prueba podía apretar un botón.

| `pintarCuentas` (dinero) | Errores | Atrapados | Pasan | Atrapa |
|---|---:|---:|---:|---:|
| Al empezar (commit `ca4997e`) | 354 | 19 | 335 | **5.4 %** |
| 23 de noviembre (commit `8d9fe2a`) | 370 | 97 | 263 | **26.9 %** |
| 24 de noviembre, mañana (commit `133488c`) | 373 | 159 | 214 | **42.6 %** |
| **24 de noviembre, tarde** (commit `95cae7c`) | 373 | 208 | 165 | **55.8 %** |

El 25 de noviembre se midió el **archivo entero** en vez de solo `pintarCuentas`, porque el trabajo de ese
día tocó también la puerta (`dibujarEntrada`), que vive fuera: **`dinero.js` pasó de 46.4 % a 67.5 %.**

(El 23 hubo 10 mutantes colgados, que se cuentan aparte y nunca como muertos; después, ninguno.)

**De atrapar uno de cada veinte a atrapar más de la mitad.** Y lo que falta también se dice: **165 errores
siguen pasando**. Dónde están, medido:

**Una corrección de cuenta (25 de noviembre).** Lo que el 24 se apuntó como «`migrar`: 59 de 123 errores
pasan» mezclaba dos cosas, porque el reparto por función ponía bajo `migrar` todo lo que venía después.
Separados: **`migrar` son 24 errores** y **los oyentes de eventos, 99**. Al 25 de noviembre, con el
despachador y la mudanza ya probados, van así:

Al cerrar el 25 de noviembre, lo que queda es esto:

| Pasan / total | Dentro de |
|---:|---|
| 34 / 99 | **los oyentes de eventos** (el reparto de cada botón a su acción) |
| 18 / 52 | `enlazar` |
| 16 / 54 | `guardarPago` |
| 13 / 49 | `registrarElPago` (el guardado, que ya tenía sus pruebas aparte) |
| 12 / 21 | `cargarYDibujar` |
| 11 / 43 | `armarVista` |
| 11 / 31 | `textoConfirmarAnularPagoDueno` |
| 10 / 20 | `etiquetaDeForma` |
| 10 / 13 | `pagosDeLaCuenta` |
| 10 / 31 | `dibujar` |
| 10 / 35 | `anularPagoDeDueno` |
| 10 / 24 | `migrar` |
| 9 / 14 | `alExpirarPorInactividad` |

Lo trabajado bajó así, en errores que pasan: la puerta (`dibujarEntrada`) de 22 a 1, `guardarCosto` de 22
a 7, `anularPagoDeDueno` de 27 a 10, `guardarPago` de 39 a 16, `instalarLatidos` de 14 a 0,
`conPuertaDeDinero` de 5 a 0, `textoConfirmarAnularPagoDueno` de 18 a 11, `dibujar` de 16 a 10, los
oyentes de 44 a 34, `migrar` de 15 a 10, `enlazar` de 22 a 18.

**Ya no hay un bulto grande.** Lo que queda está repartido en pedazos de diez o menos, y una buena parte
son guardias defensivos que desde la pantalla no se pueden alcanzar (se revisaron uno por uno y están
dichos en los commits). El siguiente paso con más provecho ya no es seguir aquí, sino
**`js/pantallas/comisiones.js`**, que sigue en 56.8 % y tiene su propio `pintarCuentas` con 246 errores
que pasan — y la pantalla de mentira que se construyó aquí sirve igual.

### Cómo se midió, y una trampa que costó una corrida entera

Primero se intentó el atajo: volver a aplicar sobre el código de hoy los 335 errores que sobrevivían
antes. **No sirve.** El refactor que hizo testeable la pantalla renombró cosas (`lector` → `elLector`,
`window.confirm` → `preguntar`, `hoyISO()` → `ahora()`), así que **215 de los 335 ya no se podían ni
aplicar** y el cociente que salía no decía nada sobre el archivo. Ese número se tiró sin publicarlo y se
midió de nuevo, entero, sobre el código de hoy. Es la misma regla de siempre: **un número que salió de un
instrumento que ya no apunta al mismo sitio no se reporta.**

### El instrumento nuevo, con sus controles

`pruebas/fixtures/pantallaDeMentira.mjs`: un navegador chico cuya regla es que **solo encuentra lo que la
pantalla dibujó de verdad**. Si un manejador apunta a un id que el HTML ya no trae, la prueba se cae en vez
de quedarse verde apretando botones imaginarios. Tiene **16 controles** propios, y dos de ellos corrigieron
a quien lo escribió:

- Faltaba `matches`. El manejador que marca una renta hace `caja.matches?.('[data-dn="marcar"]')`: **sin
  esa función el `?.` lo deja en undefined y marcar no hace NADA, en silencio.**
- El control 3 afirmaba que redibujar conserva lo tecleado. **Era mentira**: en el navegador
  `innerHTML = ...` destruye el campo y se lleva lo escrito. Es justo el error del que la pantalla se cuida
  al no redibujar mientras él escribe el descuento; guardarlo lo habría tapado.

## 4. Lo que todavía NO se ha medido

`contar.mjs` dice el tamaño del trabajo entero: **14,769 errores posibles sobre 13,987 líneas ejecutables,
en 60 archivos.** Después de estas dos pantallas, lo más grande que sigue sin medir es:
`js/pantallas/contratos.js`, `js/pantallas/reservas.js`, `js/pantallas/carros.js`,
`js/pantallas/clientes.js`, `js/pantallas/contratoImpreso.js`, `js/pantallas/flota.js`, el respaldo a
Excel (`js/respaldo/*`) y `js/app.js`, `js/auth.js`, `js/router.js`, `js/ui.js`.
