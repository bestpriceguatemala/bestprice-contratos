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

## 3. Las dos pantallas de dinero

(Esta sección se llena cuando termine la corrida: 1,068 errores en `js/pantallas/dinero.js` y 1,040 en
`js/pantallas/comisiones.js`, 2,108 en total.)

---

## 4. Lo que todavía NO se ha medido

`contar.mjs` dice el tamaño del trabajo entero: **14,769 errores posibles sobre 13,987 líneas ejecutables,
en 60 archivos.** Después de estas dos pantallas, lo más grande que sigue sin medir es:
`js/pantallas/contratos.js`, `js/pantallas/reservas.js`, `js/pantallas/carros.js`,
`js/pantallas/clientes.js`, `js/pantallas/contratoImpreso.js`, `js/pantallas/flota.js`, el respaldo a
Excel (`js/respaldo/*`) y `js/app.js`, `js/auth.js`, `js/router.js`, `js/ui.js`.
