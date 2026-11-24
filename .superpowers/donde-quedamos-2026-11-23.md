# Dónde quedamos — 23 de noviembre de 2026

Escrito al parar a media tarea, a pedido suyo («perame, continuamos después; no pierdas nada»).

**Estado del árbol:** limpio. `npm test` = **2,811 pasan, 0 fallan**.
**Último commit:** `8d9fe2a`, y **todo está subido** (`main` = `origin/main`).
**Versión publicada:** `2026-11-23.2`. Nada pendiente de publicar.
**Reglas de Firestore:** sin cambios. Nada que pegar en la consola.

---

## Lo que quedó corriendo, y cómo se repite

Estaba midiendo `pintarCuentas` con el arnés de mutaciones cuando se paró. **Esa corrida se pierde al
cerrar la sesión, y no importa: se repite con tres comandos**, porque desde hoy el arnés vive dentro del
repositorio (`analisis/mutaciones/`, con su `LEEME.md`).

```sh
node analisis/mutaciones/correr.mjs preparar          # copia limpia del commit, confirma que sale verde
node analisis/mutaciones/controles.mjs                # LOS NUEVE CONTROLES, siempre antes de medir
node analisis/mutaciones/correr.mjs correr --archivo js/pantallas/dinero.js --trabajadores 5 \
  --desde 685 --hasta 1055 --salida /tmp/r-pintar.jsonl
```

Los índices 685 a 1055 son los **370 errores que caen dentro de `pintarCuentas`** en el archivo de hoy
(líneas 1567 a 1933). Si el archivo cambia, se vuelven a calcular: generar la lista y filtrar por renglón.

**Esa corrida alcanzó a terminar: 370 errores, 97 atrapados, 263 pasan, 10 colgados — 26.9 %**, contra el
**5.4 %** del que se partió. Está escrito en la sección 3d del informe. Los comandos de arriba sirven para
repetirlo y para medir lo que venga.

### Una trampa que ya costó una corrida entera

Se intentó medir el avance volviendo a aplicar los 335 errores que sobrevivían ANTES, sobre el código de
hoy. **No sirve**: el refactor que hizo testeable la pantalla renombró cosas (`lector` → `elLector`,
`window.confirm` → `preguntar`, `hoyISO()` → `ahora()`, `aviso(` → `avisar(`), así que **215 de los 335 ya
no se podían ni aplicar** y el cociente que salía no decía nada. Para comparar hay que **medir de nuevo
sobre el código de hoy**, no reaplicar errores viejos.

---

## Lo que se hizo hoy, en orden

1. **El arnés de mutaciones se mudó al repositorio** (`analisis/mutaciones/`). El de octubre vivía en una
   carpeta temporal y se había perdido; sin él no se podía repetir ni comprobar nada de su informe.
2. **Se le encontraron DOS defectos al propio arnés**, que jalaban en direcciones contrarias (metía
   errores dentro de comentarios, que no se pueden matar; y leía como texto el hueco entre dos textos
   pegados, que muere siempre). Corregidos, y las mediciones de las dos pantallas se repitieron enteras.
3. **26 de 63 mensajes del dueño se podían dejar en blanco** sin que ninguna prueba se enterara. Cerrado:
   hoy son **0**, con una prueba que cubre también los mensajes que se escriban después.
4. **El descuento de un pago de más no tenía ni una prueba** (las tres funciones estaban importadas en el
   archivo de pruebas y no las llamaba nadie). Diez pruebas nuevas; de 34 errores que pasaban, 25 mueren.
5. **El monto se escribe normal y las comas se ponen solas** (decisión suya). `montoTecleado` y
   `montoParaElCampo` en `ui.js`.
6. **El vencimiento de la tarjeta** se lee como se escribe («0430» → «04/30»), y lo que no se entiende no
   se imprime: se avisa.
7. **La hora y las fechas, medidas:** `ui.js` 74.8 %, `fechas.js` 84.0 %, `hora24` sola **91 %**. Tres
   huecos reales cerrados (una fecha imposible se volvía otra fecha; los nombres de los meses; la notación
   rara en el monto) y **uno que parecía hueco y no lo era** (el guardia de `diasAtraso` es redundante).
8. **`pintarCuentas` se puede probar**: recibe sus aparatos con los de hoy por omisión, y hay una pantalla
   de mentira (`pruebas/fixtures/pantallaDeMentira.mjs`) con **16 controles**. **20 cables probados.**

---

## Lo que sigue, en orden

1. **Seguir cableando `pintarCuentas`** (va en **55.8 %**, de 5.4 % al empezar). Hechos: enlazar, ver
   comprobante, el cierre del área, `guardarCosto`, `anularPagoDeDueno` y `guardarPago`. Lo que queda, por
   tamaño: **`migrar`** (59 errores pasan, de 123 — la mudanza del costo, que se corre una vez y no se
   deshace), el orden de las lecturas en `dibujar` + `cargarYDibujar` (30 entre las dos), lo que resta de
   `enlazar` (22) y de `guardarPago` (23), y `verComprobante` (5).
2. **`pintarCuentas` de comisiones** (`js/pantallas/comisiones.js`): 246 de 321 errores pasaban, 23 %. La
   pantalla de mentira ya está hecha y sirve igual.
3. **`avisoDelPapelQueNoCambia`** en comisiones: 45 de 134 pasaban.
4. **`aviso()` en ui.js**: 11 de 11 errores pasan. Es el mensajito flotante; toca el DOM. Ahora que se
   puede inyectar en la pantalla de dinero, se puede probar aparte.
5. **Lo que sigue sin medirse del todo**: `contratos.js`, `reservas.js`, `carros.js`, `clientes.js`,
   `contratoImpreso.js`, `flota.js`, todo el respaldo a Excel, `app.js`, `auth.js`, `router.js`.
   `contar.mjs` dice el tamaño: 14,769 errores posibles en 60 archivos.

## Decisiones suyas que siguen abiertas

- **Las comas en los otros cuatro campos de monto**: el monto del pago al recibir y al sacar, y el precio
  por día y el anticipo de una reservación. Hoy siguen siendo campos de número (sin comas). Extenderlo ahí
  toca además las cifras que el sistema sugiere solo, así que es trabajo aparte. Se le preguntó; no ha
  contestado.
- **El banco de la tarjeta 2** no tiene casilla en su Excel. Si lo quiere impreso, hay que decidir dónde.
- **La casilla de la autorización de la tarjeta 1** es la única de las 71 cuya posición se dedujo en vez de
  medirse: hay que mirarla contra el papel.
- **LDW y PAI** leerán «Q. Q150.00» porque su formulario ya trae la Q. Decidido dos veces por él; está
  construido como lo pidió.
- **Su fórmula del Excel**: `BQ` no suma la hora tardía `AH`, y los «varios» de la devolución no tienen
  columna. Es su archivo.
- **Lo suyo pendiente de siempre**: dar de alta a los empleados, revisar los seis intervalos de
  mantenimiento, una pasada de concurrencia con dos computadoras contra el Firebase de verdad, y mirar
  cuántas lecturas de Firebase se gastan al día (el plan gratuito se puede acabar a media tarde).

## Cómo se trabaja esto

- Agentes de a dos como mucho: comparten el cupo y mueren juntos a media tarea.
- Cada paso verde se committea; el informe se escribe por partes, no al final.
- Nunca `git add -A`: rutas explícitas.
- Ningún agente pide credenciales ni toca el proyecto real de Firebase.
- **Ninguna medición vale sin sus controles corridos antes.** Y un número que salió de un instrumento
  descalibrado no se reporta: se tira y se vuelve a medir.
