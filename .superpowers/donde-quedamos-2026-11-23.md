# Dónde quedamos — 23 y 24 de noviembre de 2026

Escrito al parar a media tarea, a pedido suyo. Se actualiza en cada parada: lo de abajo es el estado de la
ÚLTIMA (24 de noviembre, por la tarde).

**Estado del árbol:** limpio. `npm test` = **2,845 pasan, 0 fallan**.
**Último commit:** `5499e9e`. Falta subir ese (lo anterior sí está subido).
**Versión publicada:** `2026-11-23.2`. **Nada pendiente de publicar**: todo lo del 24 son pruebas y
cañería interna, no cambia nada de lo que él ve, y no hace falta darle «Actualizar».
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

## Lo que se hizo el 24 de noviembre

Todo sobre `pintarCuentas`, que pasó de atrapar el **26.9 %** al **55.8 %** de los errores que se le meten
(373 en total; 208 atrapados, 165 pasan, ninguno colgado).

1. **Enlazar un dueño** (no se puede deshacer): que no pregunte sin haber escogido; que pregunte antes con
   cuántos contratos y a quién; que enlace SUS contratos a ESE dueño; que «dar de alta» cree al dueño con
   el nombre de la cuenta; y que **un reintento tras un enlace fallido NO cree un segundo dueño**.
2. **Ver comprobante** (el de ESE pago; uno anulado no abre papel) y **la migración** (pregunta antes; si
   falla nunca dice «0 contratos movidos»).
3. **Cerrar el área**: vacía lo dibujado, cada pantalla suelta lo suyo, una que falle no corta a las
   demás, y la pantalla suelta LO QUE ELLA LEYÓ. Para esto la pantalla registra su lector como olvidador
   al montarse y da de baja el de la vuelta anterior.
4. **`guardarCosto`** (era el peor, 22 de 25 pasaban; ahora 7): el costo le queda a ESA renta y no a las
   demás; la casilla se cierra al guardar y NO se cierra si falla; dos clics no lo anotan dos veces.
5. **`anularPagoDeDueno`** (27 → 10) y **`guardarPago`** (39 → 23): las ramas de la RESPUESTA —
   `ya-guardado`, `cambio`, `no-esta`, `ya-anulado`—, y que el reintento lleve la MISMA marca `enCurso`,
   que es lo que evita el pago doble cuando se cae el internet al guardar.

**Dos avisos del proceso, por si sirven:**
- Una prueba propia era TEATRO (pasaba con el error puesto, porque miraba un lector que el módulo nunca
  había llenado). Se descubrió metiéndole el mutante a propósito. **Cada prueba nueva de valor se
  comprueba así antes de darla por buena.**
- Dos mutantes se revisaron y NO eran huecos (`ui.altaDeDueno.terminada()` y `ui.anotando = null`): son
  redundantes por razones que están escritas en los commits. No se inventó una prueba para un problema
  que no existe.

## Lo que se hizo el 23 de noviembre, en orden

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

1. **Seguir en `comisiones.js`**, que va en **66.0 %** (de 56.8 % el 23 de noviembre). Hecho el 26: bajar
   el Excel, ver el comprobante, registrar, enlazar (con el porcentaje que NO toca lo ya pagado) y anular.
   Lo que queda, por tamaño: los oyentes de eventos (50 de 77), `avisoDelPapelQueNoCambia` (45 de 134 —
   lo que cambió en las rentas desde que salió el papel), `guardarPago` (23), `enlazar` (22),
   `armarVistaDeComisiones` (15), `modeloDeComisionesEnExcel` (15) y `anularPago` (14).

   `js/pantallas/dinero.js` quedó en **71.8 %**. Las dos juntas, en **69.0 %** (de 51.6 % el 23).

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

## 26 de noviembre: la sesión en guardarPago y enlazar (hecho)

Las dos pantallas de dinero vuelven a mirar si la sesión sigue abierta **después** de guardar, no solo si
el lector sigue teniendo algo. Firebase puede cerrar la sesión mientras el guardado viaja; el lector sigue
con lo de antes en la mano, así que el pago nuevo entraba en memoria y se cantaba «Pago registrado» sobre
una sesión que ya no existía.

- `guardarPago` (dueños y comisiones): `if (!haySesion() || !elLector.actual) return;`
- `enlazar` (las dos): `if (!haySesion()) return;`, **después** de `ui.altaDeDueno.terminada()` — el enlace
  ya quedó escrito en la nube, y soltar el alta antes haría que un reintento creara otro dueño.

Cuatro pruebas nuevas, escritas primero y rojas antes del arreglo. Medido quitando cada guardia con el
`diff` confirmado: las cuatro mueren (1, 1, 2, 1). Control sin mutar 0 en rojo; control que sí rompe 85.
Commit `ea99217`. 2944 pruebas pasan.

Después se cerró también en `anularPagoDeDueno`, `anularPago` (comisiones) y `guardarCosto`. Con eso,
**los seis lugares** de las dos pantallas donde se escribe dinero vuelven a mirar la sesión al terminar.
Cada guardia medida contra SU PROPIA prueba (no contra la suite entera: ahí un mutante puede morir por
otra prueba y parecer cubierto). Controles: 0 en rojo sin mutar, 6 en rojo con un mutante que sí rompe.

Dato útil para más adelante: `haySesion()` no solo responde — cuando la sesión está cerrada **suelta la
lectura y dibuja la pantalla de la contraseña**. Por eso una prueba que lea por `p.lector.actual?.…`
después de que se cierre la sesión está leyendo una lista vacía que no puede fallar nunca: hay que
capturar la lectura ANTES de apretar.

## 26 de noviembre, tarde: los dos oyentes de «click» (hecho)

De **78 % a 97.3 %** los dos juntos (72 de 74). Ocho pruebas nuevas, todas de cableado: «Actualizar» vuelve
a leer de verdad, «Volver a leer» tras un fallo, «Cancelar» cierra el formulario, el clic en la fila abre
la cuenta de ese empleado, el clic en el nombre deja seguir el enlace, y un clic en lo que no es botón no
hace nada.

Queda **un** sobreviviente en cada pantalla y es el mismo: `default: return;`, equivalente comprobado (las
únicas acciones sin atender son las casillas, y no viven dentro de una fila con clave). Se deja como
defensa, dicho.

Al arnés se le agregó `--lineas D-H` para medir solo una parte de un archivo.

**El número viejo del informe estaba mal atribuido:** el «34 / 99» eran los CUATRO oyentes juntos, no el de
«click». El de «click» de dueños ya estaba al 95 %. Antes de recomendar un objetivo por un número viejo,
medirlo de nuevo con `--lineas`.

## 26 de noviembre, noche: lo que él pidió al revisar, y las vistas de dinero

**Lo que él pidió** (hecho y comiteado): borrar carros, «Nuevo contrato» sin pasar por la flota, y que los
subarrendados queden guardados sin entrar a la flotilla. Los tres en sus commits, con el detalle ahí.

**Tres fallos que solo se vieron abriendo el navegador** (la suite entera pasaba en verde): una clase de
CSS que no existía dejaba el botón de borrar idéntico al de «Cancelar»; el `?v=1` de las hojas nunca
cambiaba, así que publicar un cambio de CSS y no verlo era normal; y el botón «Sí, borrar» era del mismo
rojo que su caja. **Lección: node no mira el CSS. Hay que abrir el programa.**

**Las dos vistas de dinero**: comisiones 76 % → 87 %, dueños 74 % → 88.4 %. Lo más serio que tapaban no
eran cifras mal sumadas: eran pantallas en blanco (una lectura sin una llave, una ficha dañada).

**Lo que sigue sin probarse, y es lo que más importa ahora**: el CABLEADO de las pantallas de carros y de
sacar carro. Ninguna de las dos tiene su «pantalla de mentira» como las de dinero, y en sacar carro el
cable es lo que decide **qué carro sale en el contrato**.

## Cómo se trabaja esto

- Agentes de a dos como mucho: comparten el cupo y mueren juntos a media tarea.
- Cada paso verde se committea; el informe se escribe por partes, no al final.
- Nunca `git add -A`: rutas explícitas.
- Ningún agente pide credenciales ni toca el proyecto real de Firebase.
- **Ninguna medición vale sin sus controles corridos antes.** Y un número que salió de un instrumento
  descalibrado no se reporta: se tira y se vuelve a medir.
