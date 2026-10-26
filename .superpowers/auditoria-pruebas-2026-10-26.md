# Auditoría de las pruebas — 26 de octubre de 2026

**Pregunta:** los 2,589 verdes de `npm test`, ¿atrapan un error de verdad? No se puede saber por el número: se mide metiendo errores a propósito (mutantes) en una **copia** del código y viendo si alguna prueba se pone roja.

Línea base: rama `main`, árbol limpio, `npm test` = 2,589 pasan, 0 fallan (≈10 s).

---

## 1. Primero: ¿el arnés mide algo? (controles)

Por qué va primero: el 25 de octubre un agente reportó «12 mutantes, todos muertos» con un script que nunca corrió las pruebas (zsh no separaba los nombres de archivo). Un mutante que no cambia nada también «moría». Aquí el arnés vive fuera del repo, se escribió en Node (`child_process.spawn` con arreglo de argumentos, sin shell, así que no hay nada que separar mal), cada mutante se aplica en una copia del árbol y se registra el **código de salida real** del proceso y el conteo de pruebas que dice el reporte.

### Control 0 — la tubería (que un fallo llegue como código distinto de cero)

| Caso | Código de salida | Pruebas / pasan / fallan |
|---|---|---|
| Copia limpia, sin tocar | **0** | 2,589 / 2,589 / 0 |
| Copia + una prueba sembrada que hace `assert.equal(1, 2)` | **1** | 2,590 / 2,589 / 1 (la sembrada) |
| Copia + un archivo de prueba que lanza al cargar | **1** | el archivo aparece como fallado |

Un fallo real **sí llega** como código 1; una corrida limpia llega como 0 con las 2,589 pruebas contadas.

### Control 1 — mutantes que NO cambian nada (deben SOBREVIVIR)

| Control | Qué se hizo | Resultado |
|---|---|---|
| NOOP-A | Renombrar la variable local `escalado` → `escaladoRenombrado` en `dinero.js` (3 apariciones) | **SOBREVIVE** (suite completa: 2,589 pasan, código 0) |
| NOOP-B | Intercambiar el orden de `pagado` y `cubierto` en `resumen()` de `contrato.js` (son independientes) | **SOBREVIVE** |
| NOOP-C | Escribir `x < 0` como `0 > x` en `q()` | **SOBREVIVE** |
| NOOP-D | `base * porcentaje / 100` → `porcentaje * base / 100` en `comision.js` | **SOBREVIVE** |

Si alguno hubiera muerto, el arnés estaría reportando ruido. Los cuatro sobrevivieron.

### Control 2 — mutantes que rompen algo OBVIO (deben MORIR)

| Control | Qué se rompió | Resultado |
|---|---|---|
| ROMPE-A | `x < 0` → `x > 0` en el redondeo `q()` (signo del dinero) | **MUERE** — 102 pruebas rojas (código 1) |
| ROMPE-B | Recargo de tarjeta: `1 + porcentaje/100` → `1 - porcentaje/100` | **MUERE** — 1 prueba roja («el recargo de tarjeta del ejemplo del diseño») |
| ROMPE-C | `saldo = subtotal - cubierto` → `subtotal + cubierto` | **MUERE** — 29 pruebas rojas |
| ROMPE-D | Base de la comisión: `Math.max(0, …)` → `Math.min(0, …)` | **MUERE** — 96 pruebas rojas |
| ROMPE-E | `throw` al cargar `dinero.js` (prueba que la copia es lo que se ejecuta) | **MUERE** — `pruebas/dinero.test.mjs` no carga |

Los cinco murieron. **El arnés está validado:** distingue un cambio sin efecto (sobrevive) de uno que rompe (muere), y el código de salida del proceso real es el que decide.

Nota para quien lea la cifra de ROMPE-B: el recargo de tarjeta con el signo cambiado lo atrapa **una sola prueba** en `dinero.test.mjs` (se corta la corrida en cuanto una fase falla, por eso el conteo es chico). Más abajo se ve qué tan bien lo cubren las demás.

### Cómo se decide «sobrevive»
Un mutante solo cuenta como sobreviviente si (1) pasó las pruebas que alcanzan su archivo, (2) **y además** pasó la suite completa con código 0, (3) y el reporte contó exactamente 2,589 pruebas y 2,589 pasadas (si cambia el conteo se marca ANOMALÍA, no sobreviviente). Muere si el proceso sale distinto de cero. Un `timeout` (ciclo infinito) cuenta como muerto aparte.


---

## 2. Lo que sobrevivió (EN CURSO — se va completando; estado al 26 oct, tier 1 a 3 medidos, papeles en curso)

Cómo leer esta lista: cada fila es un error metido a propósito en el código que **las 2,589 pruebas dejaron pasar**. «Qué te habría pasado» es lo que le habría ocurrido a él en el negocio si ese error hubiera sido real. Ordenado de más caro a más barato.

### Cerrados (ya hay una prueba que falla con el error y pasa con el código bueno)

| # | Qué sobrevivió | Qué te habría pasado | Commit |
|---|---|---|---|
| 1 | **El contador del número de contrato no tenía NINGUNA prueba** (`siguienteNumeroContrato`): borrar su escritura, restarle uno, arrancarlo en 1 en vez de 0 | Todos los contratos nuevos saldrían con el mismo número en el papel que firma el cliente (o el primero con el 2), y como las hojas membretadas traen su número preimpreso, el sistema y el papel se separarían sin avisar | `eec2e2a` |
| 2 | Seguros por día de un atraso de **varios** días: `×` por `÷` | Al cliente que se atrasa 3 días con seguros de Q75/día se le cobrarían Q25 en vez de Q225 (Q200 de menos por renta). Con 1 día de atraso da lo mismo, y todas las pruebas usaban 1 | `5137401` |
| 3 | Un pago a dueño de **dos rentas** donde una se reabre y crece: la diferencia entraba a «Por pagar» con que **una** estuviera cerrada (`every` → `some`) | Le pagas al dueño del carro sobre una cifra que todavía puede cambiar | `6cdbe2b` |
| 4 | Un grupo con una renta cuyo **costo no se pudo leer** afirmaba «se le pagó de más» (`some` → `every`) | La ficha te dice que le pagaste de más Q1,200 a un dueño, y descuentas del siguiente pago plata que sí le debes | `6cdbe2b` |
| 5 | **Recibir el carro el mismo día que salió** se bloqueaba si se cambiaba `< 0` por `<= 0` | No podrías cerrar ninguna renta de un día que regresa en la tarde | `5137401` |
| 6 | Un **descuento que deja el cobro en Q0.00** (cortesía total) se bloqueaba con `<` por `<=` | No podrías registrar una renta regalada | `5137401` |
| 7 | **Liberar la garantía**: el camino bueno no tenía prueba (condición invertida, o guardar `garantiaLiberada: false`) | Aprietas «Liberar garantía», dice que sí y no libera nada (o nunca deja liberar) | `46f38bd` |
| 8 | `puedeLiberarse` con `saldo > 0` → `saldo > 1` | Un cliente que debe hasta Q1.00 se lleva su garantía: la regla «no la libero hasta que me pague» con un hueco | `46f38bd` |
| 9 | **Cancelar una reservación** (`cancelarReserva`): sin `return`, o guardando `cancelada: false` | El botón no cancela y no avisa | `46f38bd` |
| 10 | Leer un contrato (`cargarContrato`), los **ajustes** (el % de tarjeta de cada formulario) y el rango de fechas de **Contratos**: sin pruebas | Un mes que pierde su último día, que cuela el anterior, o un % de tarjeta que ignora lo que configuraste | `1917741` |
| 11 | La **copia local** de esta computadora: no se guardaba lo que trae la nube, no se quitaba lo que la nube ya borró, y se avisaba aunque no hubiera nada nuevo | Una pantalla que muestra lo viejo, o contratos fantasma que ya no existen | `1917741` |
| 12 | Una diferencia con un dueño de **menos de Q1.00** (`diferencia > 0` → `> 1`) | Una deuda de Q0.50 con el dueño de un carro se leía como «a mano» | `6cdbe2b` |
| 13 | El aviso «**tu pago cambió**» salía para pagos sin rentas o que cubren una renta que sigue afuera | Un aviso falso de que un pago de comisión ya no cuadra | `6cdbe2b` |
| 14 | El orden de las listas (rentas por pagar, rentas afuera, pagos de un grupo) y los desempates | Una lista que no va de la más vieja a la más nueva: pagas por quincena y te confundes de renglón | `6cdbe2b` |

### Un hueco en el propio instrumental de pruebas (también corregido, `1917741`)

La «nube de mentira» (`pruebas/fixtures/nubeEnMemoria.mjs`) aceptaba cosas que la de verdad rechaza: `doc(db, 'contratos', undefined)` (ruta vacía), un `where(…, '<', …)` o cualquier operador raro (lo leía como `<=` en silencio), y sus instantáneas no traían `id`. Con eso, una consulta mal escrita —por ejemplo dejar fuera el último día del mes— **habría pasado todas las pruebas**. Ahora lanza, como el SDK.

