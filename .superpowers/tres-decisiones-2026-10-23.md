# Tres decisiones del dueño — informe (23 de octubre de 2026)

Estado: **hecho y probado.** Pruebas: **2313 → 2322**, 0 fallan. Commits (rama `main`, en este orden):

| # | Decisión | Commit |
|---|---|---|
| 1 | D4 — «RENTADO POR» del respaldo: «Los dos» | `ccbf421` |
| 2 | D5 — «Con el respaldo me basta» | `3040446` |
| 3 | D1 — «Sí coinciden, déjalo así.» | `3df31ef` |

No toqué `version.txt` ni `js/version.js`. Nada de Firebase real. Cada commit con rutas explícitas, nunca `git add -A`. El informe y las
tres notas «DECIDIDO» en `costuras-2026-10-21.md` van en un cuarto commit.

---

## 1. D4 — la columna AL lleva el código y el nombre pasa a COMENTARIOS (`ccbf421`)

**Qué cambió** (`js/respaldo/mapa.js`):
- `AL` ya no es `aTexto(c.rentadoPor)`: es `codigoParaSuHoja(c)`, que lee `empleadoCodigo`, lo que el contrato **selló** ese día.
- El nombre (`rentadoPor`) sale al **final** del COMENTARIO como `Rentado por: Ana`.
- **Sin código la columna queda VACÍA**, y la celda ni tiene valor: contrato de antes de la lista de empleados (`rentadoPor` es texto a mano
  y el contrato **ni trae la llave**), empleado sin código (`null`), vacío, solo espacios, y cualquier valor que no sea texto ni número finito.
  Nunca un cero, nunca el nombre como sustituto, nunca un código buscado en la lista de hoy (la misma regla que ya rige la hoja impresa,
  §8b punto 12). En esos casos el nombre **sí** sigue saliendo en COMENTARIOS: no se pierde nada.
- **El comentario y su orden.** Lo leí antes de tocarlo: se arma como `Del sistema: ` + frases con ` | `, y el orden es deliberado — «lo que
  descuadra el total va PRIMERO» (el «OJO»), luego lo que cambia cómo se lee el dinero (hora tardía sin monto, tarjetas 3+, daños, pagos,
  saldo, garantía). Una prueba existente exige `^Del sistema: OJO:`. El nombre es identidad, no una advertencia: va **al final**. Quedó dicho
  en el comentario de `notasDelContrato` y en una prueba nueva que fija el orden.
- Sin aviso nuevo.

**Una decisión mía que conviene que sepas** (no la pidió él, hay que escribir la celda de algún modo): un código que es un entero positivo sin
ceros a la izquierda (`'6'`) se escribe como **número**, y cualquier otro (`'W1'`, `'007'`, `'0'`, `'1.5'`) como **texto** tal cual. Por qué:
en su hoja el 6 que él teclea es un número, y el código de cliente y el de carro de la misma fila ya son números; una fórmula `=`, `BUSCARV` o
`COINCIDIR` contra un número no encuentra un «6» de texto (`CONTAR.SI` y `SUMAR.SI` aceptan los dos). Y se queda como texto el que no se puede
convertir sin perder algo (`007`) o sin vaciarlo (`aMonto` vacía los ceros: un código «0» es un código). Revisé las diez hojas de la plantilla:
**ninguna fórmula suya lee la columna AL** (las fórmulas de la fila 5 solo copian `INGRESO DE DATOS!C38`), así que nada se rompe hoy de ninguna
forma; lo de arriba protege las fórmulas que él agregue. Si prefiere texto siempre: es el `return texto` de `codigoParaSuHoja`.

**Pruebas.** Nueve nuevas en `pruebas/respaldo-excel.test.mjs` (más dos existentes que tuvieron que cambiar, abajo). Casos: con código; contrato
de antes de la lista (llave ausente, comprobado en la propia prueba); empleado sin código; vacío / espacios / `null` / `undefined` / booleano /
objeto / lista / `NaN` / `Infinity`; «nunca se busca otro código» (con `empleadoId`, porcentaje, el nombre `'6'` y el número del contrato al
lado como tentación); cómo se escribe cada forma de código (número vs texto, mirando el XML de la celda); orden del comentario; el nombre es el de
ese día; y que solo AL y CA cambian. Los fixtures usan los constructores reales (`construirEmpleado` + `datosDelContratoPara` +
`construirContrato`), no objetos a mano; el contrato «de antes» se arma con el constructor y se le **quitan** las llaves, como hace la prueba de
la hoja impresa.
- **Sin el código, 10 pruebas fallaban** (las 9 nuevas y la columna `AL`), antes de escribir una línea.
- **Mutación** (sobre una copia en el scratchpad, no sobre el repositorio): 15 mutantes, **14 muertos**. Muertos: AL vuelve al nombre; cae al
  nombre sin código; `?? '0'`; `?? número de contrato`; `aMonto(Number(null))`; el nombre no va a COMENTARIOS; el nombre abre el comentario
  antes del OJO; código siempre texto; código siempre número (pierde `007` y vacía `0`); comentario con nombre vacío; código sacado de `empleadoId`;
  etiqueta distinta; sin la guarda de tipo; sin la guarda de número finito. **Sobrevive 1, equivalente:** quitar `if (texto === '') return null`,
  porque `aTexto` río abajo ya vacía el texto vacío. (Un mutante `?? 0` también sobrevivía en la primera ronda y es equivalente por lo mismo:
  `aMonto(0)` es vacío; lo cambié por `?? '0'`, que sí se ve, y murió.)

**Pruebas existentes que cambiaron** (a propósito, y dicho en la prueba):
- «un contrato con de todo, columna por columna» esperaba `AL = 'Ana'`; ahora espera `'6'`. Los fixtures de los ocho contratos ahora sellan al
  empleado como lo hace «Sacar carro» (código `'6'`).
- «un contrato sin nada que anotar no lleva COMENTARIOS»: ya no puede usar el 101 ni el 104, porque ahora llevan «Rentado por: Ana». Usa un
  contrato **sin nadie que nombrar**.

**Lo que esto cambia y hay que saber** (escrito en §10 del diseño): casi todo contrato del archivo tiene ahora COMENTARIOS. Antes «CA con algo» era
«hay algo que mirar»; ahora la señal es que **empiece con «OJO»**. Si él filtra CA por «no vacío» buscando problemas, lo vería todo.

Documentado en §10 (bullet nuevo) y en el glosario de §7b (Contratos).

---

## 2. D5 — el diseño deja de prometer lo que nadie va a construir (`3040446`)

§6 se reescribió sin borrar la historia: dice **qué se prometió**, que el **23 de octubre de 2026** respondió *«Con el respaldo me basta»*, y
**por qué**. Tres lugares:
- «Carros»: ya no dice que los montos y la utilidad por carro «solo se ven con la contraseña»; dice que la pantalla no los muestra.
- «Comisiones»: «Se baja en Excel y PDF» pasa a «No se baja a Excel ni a PDF».
- «El negocio»: el bullet queda como «no se construye», y un bloque nuevo («Lo que este diseño prometió y no se va a construir») lo explica.

**Verifiqué la razón contra su plantilla** (no la tomé de oído): `FICHA VEHICULO` suma **por carro** rentas, días, kilómetros, cobrado, pagado
al dueño y **utilidad** (`SUMIFS` sobre `CONTRATOS!BT/BW` por código de carro, que el respaldo llena en la columna D); `CIERRE` da la utilidad
**por contrato**; `FICHA CLIENTE` **por cliente**; y `VEHICULOS!J1:J2` el cobrado y la utilidad de propios y subarrendados.

**Dos cosas que el texto dice a propósito porque son verdad y contradicen un poco la razón:**
1. **Las comisiones.** «El respaldo me basta» no alcanza para el Excel/PDF de comisiones: el respaldo **no lleva** las comisiones ni sus pagos
   (`NO_SE_RESPALDA`). Quedan solo en pantalla. Lo escribí así en lugar de decir que él declinó el Excel de comisiones, porque su respuesta
   fue a la pregunta tal como D5 la hizo («¿las sigue queriendo?», las dos juntas) y su razón no cubre ese caso. **Conviene preguntárselo aparte.**
2. **«Cobrado del mes».** Su plantilla **no trae** un total por mes (busqué: ninguna fórmula suma por mes). Trae por contrato, carro, cliente y
   tipo de propiedad. El mes es una suma que él arma sobre `CONTRATOS`, y el diseño dice que no se afirma que ya la tenga. Y el archivo es una
   foto del día en que se baja: para el mes en curso hay que bajarlo de nuevo.
Además: «pendientes de cobro» **sí** existe, en la lista del mismo nombre de la pantalla principal.

---

## 3. D1 — los números coinciden, y el riesgo queda escrito (`3df31ef`)

**Dónde quedó** (§8b del diseño): el **punto 11** conserva su texto y recibe al lado una corrección fechada («lo de "le deja teclearlo" nunca fue
verdad… no agregues la casilla ni arregles el contador, pero lee el punto 18»); un **punto 18 nuevo** registra la decisión con su fecha y sus
palabras, qué hace el código (contador de la nube, transacción, se pide al apretar «Guardar e imprimir»), y **el riesgo con todas las letras**:
- las tres cosas que separan las series **para siempre**: una hoja echada a perder, una usada fuera de orden, un contrato guardado dos veces o un
  número gastado que no llegó a guardarse (el número se saca al apretar guardar y se gasta aunque el guardado falle; reintentar en la misma
  pantalla lo reutiliza, recargar pide otro);
- **cómo se vería**: buscar el número del papel de un cliente encuentra el contrato de **otro** cliente, o ninguno, **sin ningún aviso**;
- cómo encontrar el día del desfase (los contratos anteriores siguen coincidiendo) y las dos salidas que se le ofrecieron el 21 de octubre.

**Dónde más está escrito, para encontrarlo cuando pase** (solo comentarios, ningún cambio de comportamiento; comprobé que las líneas de código
del diff son cero): `siguienteNumeroContrato` en `js/datos.js` (el comentario más completo, con «si estás aquí por eso, no es un defecto»),
el punto de `js/pantallas/sacarCarro.js` donde se pide el número, y `textoDeContrato` en `js/nucleo/busqueda.js` (donde el síntoma aparece).
No hay guardia ni aviso.

---

## Lo que encontré y no pedía nadie (para decidir, o para que lo sepas)

1. **Los ceros del número.** Su ejemplo, «№ 014591», lleva un cero a la izquierda; el sistema guarda `14591` (número) y el buscador de Contratos
   **no** ignora los ceros: escribir `014591` **no encuentra nada**, `14591` sí (lo corrí con `filtrar`/`textoDeContrato`). Aunque las series
   coincidan, buscar el número tal como está impreso falla. **No lo toqué** (no se pidió); está dicho en §8b y en el comentario de
   `textoDeContrato`. Arreglarlo sería quitar los ceros al buscar: pequeño, pero es decisión suya.
2. **El «Buscador general» tampoco está construido.** La caja de `index.html` está `hidden` y nada la conecta (lo dice el comentario del propio
   `index.html`). §6 todavía lo promete («Una sola caja arriba de todo…»). Es un **tercer hueco de §6 que D5 no listó**. No lo toqué; hace falta
   la misma pregunta que D5. Además, el informe de costuras decía que «la búsqueda general y el historial buscan por `numero`»: solo el
   historial (Contratos) lo hace. Lo corregí en §8b.
3. **El punto 11 nunca fue cierto**, no solo ahora: el sistema jamás dejó teclear el número.
4. Una nota de código que sigue en pie: `flota.js` (cabecera) dice que los montos son del «área de dinero bajo contraseña». Sigue siendo cierto
   para Comisiones y Dueños; no hay pantalla de negocio, pero no es falso. No lo toqué.

## Para quien lleve la memoria del proyecto

No toqué `~/.claude/projects/.../memory/` (fuera del repositorio). Lo que convendría que viva allí, en `sistema-contratos-best-price.md`:
- «Número de contrato: manda el contador de la nube; él dijo (23-oct-2026) que coincide con el rojo preimpreso. Si buscar el número de un papel
  trae otro cliente, las series se separaron: ver §8b punto 18. No agregar casilla ni guardia sin preguntarle.»
- «Respaldo: AL lleva el código del empleado; el nombre va en COMENTARIOS; sin código AL queda vacía.»
- «No hay pantalla del negocio ni Excel/PDF de comisiones: decidido 23-oct-2026 (§6). Pendiente de preguntarle: Excel de comisiones, y el Buscador general.»
