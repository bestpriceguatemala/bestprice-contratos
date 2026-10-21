# Regla del porcentaje de comisión — informe (21 de octubre de 2026)

**Estado: hecho y commiteado; NO está publicada en Firebase** (el dueño la pega a mano). **La regla nunca se ejecutó**: aquí no hay
emulador de Firestore ni Java, y no descargué nada. Lo que se probó es el *código* contra una nube de mentira, y la *forma* del
archivo de reglas como texto. Ver «Qué verifiqué y qué no» antes de confiar en nada de esto.

`npm test`: **2308 pasan, 0 fallan** (base 2259; +35 son de este trabajo, `pruebas/regla-porcentaje.test.mjs`; +14 los agregó en paralelo
el agente de `sacarCarro`). Una corrida intermedia salió con `sacarCarro.test.mjs` en rojo a nivel de archivo, mientras ese agente tenía su
edición a medias en el árbol; al repetirla estaba en verde. No toqué `version.txt` ni `js/version.js`.

## Qué entrego

| archivo | qué es |
|---|---|
| `firestore.rules` | **el archivo completo, listo para pegar**. Solo cambió el bloque `match /contratos/{id}`; todo lo demás es idéntico al de antes (lo comprobé con `diff`) |
| `firestore.rules.anterior-2026-10-21.txt` | **el archivo de antes, byte por byte** (`cmp` contra el archivo de trabajo y contra `git show 3fbcd0f:firestore.rules`; sha256 `8c462d69…0f59b`). **Es el botón de deshacer**: se pega entero en la consola y todo vuelve a como estaba hoy |
| `pruebas/regla-porcentaje.test.mjs` | 35 pruebas, ver «Qué fija la prueba» |
| `docs/adr/ADR-002-…md` | actualización del 21 de octubre: la decisión, por qué crear queda abierto, lo que no cierra |
| `docs/superpowers/specs/2026-09-23-…-design.md` | §11 (Seguridad), «Pendientes conocidos del dinero» (§7b) y §12b, con la fecha y las palabras del dueño |
| `js/datos.js` | solo un comentario: el de `enlazarContratosAlEmpleado` decía «el día que la regla distinga…»; la regla ya existe y el comentario habría mentido |

## 1. Todos los caminos que escriben `contratos` (leí `js/datos.js` entero y busqué en TODO el árbol)

Busqué `setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|commit` en `js/`, `herramientas/` y `analisis/`. Fuera de `js/datos.js`
ninguna pantalla escribe a Firestore directo (`js/respaldo/nube.js` solo escribe `ajustes/respaldo`). **No existe ningún `deleteDoc` en el
sistema: nadie borra contratos.**

La instancia: `iniciarFirebase()` (`js/firebase-config.js`) = app por defecto, la sesión del mostrador. `dbDeDinero()` (`js/dinero-sesion.js`)
= `initializeApp(CONFIG, 'dinero')` con su propio Auth en memoria; devuelve `null` si nadie entró.

| # | Quién / cuándo | Función (archivo) | Crea o actualiza | ¿Toca `porcentajeComision`? | Instancia |
|---|---|---|---|---|---|
| 1 | «Sacar carro»: el contrato de la salida | `guardarContrato` (`datos.js:919`) ← `sacarCarro.js:1966`; escribe por `guardarEnNubeYLocal` (`datos.js:93`), con `runTransaction` si trae reservación de origen | **CREA** (el id lo decide `nuevoIdContrato` antes del primer intento). Un reintento de un guardado que sí había llegado cae en el mismo id y es **actualización** | **SÍ: aquí se sella** (`construirContrato`, `sacarCarro.js:289`: el del empleado escogido, o `null`) | mostrador |
| 2 | «Recibir carro»: el cierre (con o sin cobro) | `guardarContrato` ← `recibirCarro.js:841` | actualiza (transacción con la guardia `copia-vieja`) | manda el documento **entero** con el valor que leyó: el mismo | mostrador |
| 3 | Cobrar un saldo de un contrato ya devuelto | `guardarContrato` ← `recibirCarro.js:785` | actualiza (misma guardia) | el mismo valor | mostrador |
| 4 | Anular un pago mal registrado | `guardarContrato(anularPago(...))` ← `contratos.js:777` | actualiza (misma guardia) | el mismo valor | mostrador |
| 5 | Liberar la garantía de la tarjeta | `liberarGarantia` (`datos.js:1059`) ← `flota.js:436` → `guardarContrato` | actualiza (misma guardia) | el mismo valor | mostrador |
| 6 | Costo del dueño al crear el contrato | `escribirCostoDelDueno` (`datos.js:746`), desde `guardarContrato` | escribe **otro documento**: `contratos/{id}/privado/dinero` (su regla es aparte) | no | mostrador |
| 7 | «Anotar costo» del área de dinero | `anotarCostoDelDueno` (`datos.js:1765`): `updateDoc` a `contratos/{id}` quitando `subarriendo.costoDia` / `carroAjeno.costoDia` | actualiza (parcial, `deleteField`) | no | **dinero** |
| 8 | Mover el costo de todos los dueños (botón único) | `migrarCostosDelDueno` → `moverElCostoDe` (`datos.js:1558`): `updateDoc` igual que arriba | actualiza (parcial) | no | **dinero** |
| 9 | Enlazar rentas viejas a un **dueño** de carro | `enlazarContratosAlDueno` (`datos.js:1822`): `writeBatch.update` de `{ duenoId, actualizado }` | actualiza (parcial) | no | mostrador |
| 10 | Enlazar rentas viejas a un **empleado** | `enlazarContratosAlEmpleado` (`datos.js:2460`) ← `comisiones.js:955`: `writeBatch.update` de `{ empleadoId, actualizado }` y, **solo si el dueño marca la casilla**, `porcentajeComision` | actualiza (parcial) | **SÍ, y es el único que lo cambia después del sello** | **dinero** (verificado abajo) |
| — | Pagos de comisión y pagos a dueños | `guardarPagoComision`, `guardarPagoDueno` | escriben `pagosComision` / `pagosDueno`, **no** `contratos` | no | dinero |
| — | Reservaciones (la marca «entregada») | guardia de `guardarContrato` | escribe `reservas/{id}`, **no** `contratos` | no | mostrador |
| — | Borrar un contrato | **nadie** | — | — | — |

### Lo que verifiqué yo en el código (porque toda la regla cuelga de ello)

- **`enlazarContratosAlEmpleado` escribe con la credencial de dinero.** `datos.js:2467`: `const db = dbDinero();` y si es `null` lanza
  `MENSAJE_ENLACE_SIN_DINERO` *antes* de escribir; de `iniciar()` toma **solo** `fsMod` (`const { fsMod } = await iniciar();`, línea 2478),
  nunca su `db`; el lote es `fsMod.writeBatch(db)` con ese `db` de dinero. La pantalla (`comisiones.js:955`) no le pasa ningún `dbDinero`
  propio, así que corre el valor por defecto, `dbDeDinero`. Es el mismo patrón («`fsMod` del mostrador, `db` de dinero») que ya usan en
  producción `anotarCostoDelDueno` y `guardarPagoDueno`. La prueba existente (`comisiones-datos.test.mjs:275`) ya fijaba que el `commit`
  sale con la base `dinero`, pero solo para el caso SIN porcentaje; el caso CON porcentaje no lo fijaba. Ahora sí.
- **`guardarContrato` manda el contrato entero, con `merge: true`** (`datos.js:101-109`). Para las reglas esto es una actualización cuyo
  `request.resource.data` es el documento ENTERO tal como quedará (lo que no se menciona, se conserva), no un parche.
- **Lo que manda en una actualización es lo que leyó** (`{ ...contrato, ... }` en `agregarPago`/`anularPago`/`construirCierre`). Si esa
  copia quedó atrás del porcentaje, la guardia `copia-vieja` (compara `actualizado` DENTRO de la transacción) la rechaza antes de
  escribir, con su frase en español; las reglas no llegan a verla. Probado.
- **Todo contrato guardado desde el 23 de septiembre trae el campo** (`git log -S`: está en el primer commit de «Sacar carro», `cc5f9e5`). Aun
  así la regla sobrevive a uno que no lo traiga, y la prueba lo cubre.
- **`privado/dinero` solo se lee por `costoDia`** (`leerCostoPrivado`, `datos.js:1375`); nada del sistema lee un porcentaje de ahí.

## 2. El diseño: mi propuesta de partida, mejorada en una cosa y rechazada en otra

| pieza | propuesta de partida | decisión | por qué |
|---|---|---|---|
| **actualizar** | el porcentaje igual, salvo con dinero | **adoptada** | es la defensa contra el ataque barato y probable: abrir un contrato y cambiar el número después |
| **borrar** | (no se mencionaba) | **añadida: solo dinero** | sin esto la regla de actualizar es decorativa: la sesión del mostrador borra el contrato y lo vuelve a crear con el mismo id y otro porcentaje (crear está abierto). Nadie borra contratos en el sistema (comprobado), así que cerrarlo no cuesta nada |
| **crear** | igual al del empleado, con `get()` | **rechazada: queda abierto** | ver abajo |

### Por qué crear queda abierto (el argumento, honesto)

El `get()` a `empleados/{empleadoId}` cuesta una lectura por contrato (nada), pero **falla cerrada**, y esa es la parte cara:

1. **Si se equivoca, nadie saca un carro.** Una actualización que se equivoca bloquea un cobro; un alta que se equivoca bloquea el negocio,
   con el cliente enfrente y el dueño solo.
2. **No se puede probar desde aquí.** Un error de *significado* (no de sintaxis, que la consola sí detecta) en esa regla bloquearía todas las
   salidas, y el primero en enterarse sería el dueño.
3. **Hay maneras reales de bloquear una salida legítima:** (a) el dueño cambia el porcentaje de un empleado mientras el formulario de
   salida está abierto (la lista se lee al abrir y no se relee al guardar; el informe del 13 de octubre lo anotó como ventana chica con
   arreglo barato); el contrato saldría con el número viejo, la regla lo negaría y la pantalla diría «No se pudo guardar el contrato. Intenta
   de nuevo.», sin explicar nada, y reintentar no lo arregla; (b) un empleado creado o editado a mano en la consola con el porcentaje como
   texto o con más de dos decimales (el formulario sella `porcentajeAnotado`, un número redondeado a centavos); (c) un `empleadoId` vacío o de
   un empleado que no existe (la pantalla no deja guardar así, pero la regla fallaría cerrada ante cualquier otra puerta).
4. **Lo que compra es poco.** Impide *doctorar un alta*, pero quien sabe hacer eso con las herramientas del navegador también puede fabricar
   un contrato entero o cambiar `empleadoId`, los días o el precio de uno ya existente: el mostrador escribe todos esos campos y la regla solo
   cuida uno.

**Defensa que queda mientras crear esté abierto:** el dueño ve el porcentaje de CADA renta en la tabla «Por pagar» de Comisiones
(`comisiones.js:518`) antes de marcar nada como pagado, y cada contrato real tiene su número impreso en papel.

**Cuándo cerrarlo:** cuando entre un empleado al mostrador, y con (1) «Sacar carro» releyendo al empleado *al guardar*, (2) la regla probada
en el emulador en una máquina con Java, (3) un mensaje de fallo que diga qué pasó. El borrador (sin probar, no pegado) está en ADR-002.

### Los casos que rompen reglas en producción y no en pruebas, uno por uno

- **Campo ausente vs presente-y-null.** `resource.data.porcentajeComision` en un documento que NO trae el campo es un *error* de la regla,
  y un error deniega: un contrato sin el campo no se podría ni cobrar. Por eso ambos lados usan `.get('porcentajeComision', null)`: ausente y
  `null` cuentan igual (un `null` es «sin porcentaje» y no paga nada, no es un aumento). Lo que sí se niega es que un contrato **reciba** un
  porcentaje que no tenía, o que pierda el que tenía. El `0` de Wilder **no** es `null`: `0 → null` cuenta como cambio.
- **Contrato de antes de que existiera el campo.** En producción no debería haber ninguno (el campo está desde el 23 de septiembre), pero la
  regla y la prueba lo cubren: se guarda, y el guardado no le inventa ni un 0 ni un `null`.
- **Borrar.** Solo dinero, y ningún código lo intenta.
- **Un guardado que no menciona el campo.** Con `merge: true` y con `update`, `request.resource.data` es el documento entero ya fusionado: trae
  el mismo porcentaje, la igualdad se cumple y pasa. Un `setDoc` *sin* merge reemplazaría el documento y se llevaría el campo: la regla lo
  rechazaría, y el código nunca lo hace (`guardarEnNubeYLocal` siempre usa merge; `cambiarEnNubeYLocal`, el único sin merge, es solo de `vehiculos`).
- **`request.resource.data` es el documento entero, no un parche.** Por eso un lote de `update` que solo manda `{ duenoId, actualizado }` pasa.
- **Reintento de una salida que sí había llegado.** Mismo id, mismo contrato: es una actualización con el mismo porcentaje. Probado.
- **Una pantalla vieja.** Con `enlazar` (dinero) el porcentaje y `actualizado` suben juntos, y la guardia de copia vieja niega el guardado
  atrasado antes de que lo vea la regla. Si el dueño corrige un porcentaje **a mano en la consola sin subir `actualizado`** y una pantalla del
  mostrador seguía abierta con el número viejo, la regla rechaza su siguiente guardado (antes de la regla, ese guardado habría deshecho la
  corrección en silencio); recargar lo arregla, y la copia local se corrige sola en la siguiente sincronía (`mezclar` deja ganar a la nube en
  empates).
- **int vs float.** El SDK escribe un número entero de JS como entero, así que un porcentaje que se lee y se reescribe sigue siendo del mismo tipo.
  No lo pude verificar en Firestore (si `5 == 5.0` es verdadero en las reglas), pero con datos escritos por esta aplicación no se presenta.

## 3. La regla

En `firestore.rules`, dentro de `match /contratos/{id}` (el comentario completo, con fecha y con lo que NO protege, está en el archivo):

```
function sinTocarElPorcentaje() {
  return request.resource.data.get('porcentajeComision', null) == resource.data.get('porcentajeComision', null);
}
allow read: if haySesion();
allow create: if haySesion();
allow update: if haySesion() && (esDinero() || sinTocarElPorcentaje());
allow delete: if esDinero();
```

Separadas en `create`/`update`/`delete` a propósito: `resource` no existe al crear, y una regla que lo mencione ahí falla. La subcolección
`privado` y las demás colecciones no cambian.

## 4. Qué verifiqué y qué no

**Verifiqué:**
- Los caminos de escritura y la instancia de cada uno, leyendo el código (tabla de arriba), y que `enlazarContratosAlEmpleado` usa la base de dinero.
- Que los guardados del mostrador **no cambian** el porcentaje, ejecutando el código real (`guardarContrato`, `agregarPago`, `anularPago`,
  `construirCierre`, `enlazarContratosAlDueno`, `enlazarContratosAlEmpleado`) contra la nube de mentira para Ana (5 %), Wilder (0 %) y Luis (7.5 %).
- Que el archivo de reglas tiene la forma esperada, y que el archivo anterior es idéntico al de antes.
- **19 mutaciones** en una copia del proyecto (no en el árbol compartido), todas atrapadas — ver abajo.
- La lógica del bloque de verificación para el dueño, ejecutada contra la nube de mentira con la regla «activa» y «apagada».
- Que el archivo de reglas tiene llaves y paréntesis balanceados.

**NO pude verificar (y no lo doy por cierto):**
- **Que Firestore ejecute esta regla como yo la leo.** Nunca corrió. Me apoyo en cuatro cosas de las reglas que conozco pero no observé aquí:
  que `Map.get(clave, valorPorOmisión)` existe en `request.resource.data`/`resource.data`; que en una actualización parcial o con `merge`
  `request.resource.data` es el documento fusionado; que `null == null` es verdadero; y que el entero y el decimal con el mismo valor son iguales.
  La consola rechaza errores de sintaxis al publicar, **pero no de significado**.
- **Que `request.auth.uid` llegue como el de dinero en las escrituras de la app `dinero`.** Está probado indirectamente: es lo que ya hacen en
  producción `pagosDueno` y `pagosComision` con `esDinero()`. No lo probé para `contratos`.
- **El bloque de la consola del navegador** (paso 10 de abajo) contra la página real: ejecuté su lógica, no el `import('./js/firebase-config.js')` en
  un navegador con la sesión del dueño.
- **Los datos reales.** No leí Firestore ni toqué el proyecto; no sé qué porcentajes tienen hoy los contratos guardados, ni si la consola
  tiene hoy exactamente el archivo del repositorio (por eso el paso 2 de abajo le pide guardar lo que la consola tenga).

## 5. Pasos para el dueño (para pegarlas tal cual)

**Hazlo con el mostrador tranquilo, sin cliente enfrente, con unos 10 minutos.**

**Antes de pegar**
1. Abre la consola de Firebase → proyecto **bestprice-contratos** → **Firestore Database** → pestaña **Reglas**.
2. **Guarda lo que hay ahí ahora:** haz clic en la ventana de reglas, Cmd+A, Cmd+C, y pégalo en un documento de texto nuevo. Guárdalo como
   `reglas-de-la-consola-antes.txt`. Así tienes tu deshacer exacto, aunque lo que la consola tenga hoy no sea idéntico al archivo de la carpeta.

**Pegar**
3. Abre el archivo **`firestore.rules`** de la carpeta del sistema. Cmd+A, Cmd+C.
4. Vuelve a la consola, haz clic en la ventana de reglas, Cmd+A y Cmd+V (reemplaza todo) y pulsa **Publicar**. **Si la consola marca algún error
   en rojo, no publiques**: recarga la página (no se guardó nada) y avísame.
5. Espera un minuto. En el sistema, recarga con **Cmd+Shift+R**.

**Lo normal tiene que seguir funcionando** (usa un cliente y un carro de prueba; ese contrato queda guardado porque el sistema no borra contratos, así que anótalo como de prueba)
6. **Sacar carro:** haz una salida completa, escogiendo al empleado. **Tiene que decir «Contrato N° … guardado. … se lleva el carro.»** Si dice
   «No se pudo guardar el contrato. Intenta de nuevo.» → ve a **Deshacer**.
7. Con ese mismo carro, **Recibir carro**, y guarda. **Tiene que decir «Contrato … recibido…»**. Si dice «No se pudo guardar el cierre.
   Intenta de nuevo.» → **Deshacer**.
8. Si queda saldo, **Cobrar** un abono. **Tiene que decir «Abono registrado en el contrato…»**. Si dice «No se pudo registrar el abono.» → **Deshacer**.
9. **Dinero → Comisiones:** el empleado de la prueba tiene la renta, con **su** porcentaje (el que tiene en Dinero → Empleados).

**Lo que ahora tiene que fallar** (opcional, 2 minutos; si la regla funciona no cambia nada, y si no funciona el bloque deja todo como estaba)
10. Abre el contrato de prueba en el sistema (**Contratos**, y haz clic en él). Copia lo que aparece **al final de la dirección**, después de
    `#/contratos/` (es su id). Abre las herramientas del navegador (Chrome: **Cmd+Opt+J**) → pestaña **Console**. Si pide escribir
    «allow pasting», escríbelo y Enter. Pega este bloque **cambiando `PEGA_AQUI_EL_ID` por ese id**, y Enter:

```js
const ID = 'PEGA_AQUI_EL_ID';
const { iniciarFirebase } = await import('./js/firebase-config.js');
const { db, fsMod } = await iniciarFirebase();
const ref = fsMod.doc(db, 'contratos', ID);
const antes = (await fsMod.getDoc(ref)).data().porcentajeComision;
try {
  await fsMod.updateDoc(ref, { porcentajeComision: (antes ?? 0) + 1 });
  await fsMod.updateDoc(ref, { porcentajeComision: antes ?? null });
  console.log('MAL: la regla NO bloqueó el cambio. Ya dejé el porcentaje como estaba (' + antes + ').');
} catch (e) {
  console.log(e.code === 'permission-denied' ? 'BIEN: la regla rechazó el cambio.' : 'Falló por otra razón: ' + e.code + ' ' + e.message);
}
```
    - **«BIEN: la regla rechazó el cambio.»** → está funcionando.
    - **«MAL: la regla NO bloqueó el cambio…»** → la regla nueva no está publicada (el bloque ya devolvió el porcentaje a como estaba); repite desde el paso 4.
    - **«Falló por otra razón…»** → cópiame el mensaje completo.

**Deshacer (si algo de los pasos 6 a 9 falla, o ves «No se pudo guardar… Intenta de nuevo» en el mostrador después de esto):** consola → Firestore → Reglas → Cmd+A →
pega el contenido de **`firestore.rules.anterior-2026-10-21.txt`** (o el de tu `reglas-de-la-consola-antes.txt`) → **Publicar** → espera un minuto. Todo vuelve a como estaba hoy. Después
cuéntame cuál paso falló y el mensaje exacto.

## 6. Mutaciones (para que la prueba pese)

Corrí 19 mutaciones, una por una, en una copia del proyecto en el scratchpad (no en el árbol compartido). **Todas atrapadas:** enlazar con
porcentaje usando la base del mostrador (6 pruebas rojas) · `enlazarContratosAlDueno` agregando un `porcentajeComision` (4) · `contratoParaGuardar`
rellenando un 5 % o normalizando con `q()` (6 cada una) · `agregarPago` reponiendo un 5 % (10) · un archivo nuevo que nombra el porcentaje (2) ·
un `deleteDoc` (2) y un `tx.delete` (2) · una línea que junta `privado` con el porcentaje (4) · `liberarGarantia` escribiendo directo (2) · y en el
archivo de reglas: volver a `allow read, write` (4), borrar con cualquier sesión (4), actualizar solo con dinero (4), actualizar sin la
excepción de dinero (4), `==` por `!=` (2), quitar el `null` por omisión (2), `privado` solo para dinero (2), quitar la fecha y el «Lo que NO protege» (2),
y contaminar el archivo de deshacer (2). Una lección: con Ana al 5 % la mutación «repone un 5 %» no se vería; por eso las pruebas usan también a Wilder (0) y Luis (7.5).

## 7. Qué fija la prueba, y qué no

Fija: ningún camino del mostrador cambia el porcentaje (cobrar, recibir, anular un pago, liberar la garantía, enlazar a un dueño, el alta y su
reintento, el contrato sin el campo, el contrato con `null`, la copia atrasada); el único camino que lo cambia sale por la base de dinero (y si
alguien lo cambiara a la del mostrador, el «vigilante» lo ve); nadie borra (`deleteDoc`, `tx.delete`); ningún archivo nuevo nombra el porcentaje
sin que alguien lo revise; en `datos.js` el porcentaje solo se nombra en dos funciones; ninguna línea junta `privado` con el porcentaje; el archivo de
reglas conserva su forma (qué se exige, y que cada `esDinero()` corresponde a un camino de dinero o a ninguno); el comentario de la regla dice la
fecha y lo que NO protege; el archivo de deshacer sigue siendo el de antes.

**No fija que la regla funcione en Firebase.** El «vigilante» y el espejo de la prueba (`elPorcentajeCambio`) son mi lectura de la regla, no
Firestore; la prueba que fija la expresión exacta del archivo obliga a que cambien juntos.

## 8. Commits

| sha | qué |
|---|---|
| `f4ba5fa` | la regla, el archivo de deshacer y la prueba |
| (el siguiente) | ADR-002, §11/§7b/§12b del diseño, el comentario de `datos.js` y este informe |

## 9. Preocupaciones

1. **Crear queda abierto** (decisión mía, argumentada arriba). Con las herramientas del navegador, un mostrador puede crear un contrato *nuevo* con
   el porcentaje que quiera. Lo que se cierra es el ataque barato (cambiarlo después); lo que queda es el caro (fabricarlo desde cero).
2. **`empleadoId` tampoco está protegido.** Un mostrador podría reasignarle una renta ya sellada a otro empleado (o a sí mismo) y con ella el porcentaje
   sellado. Ningún código lo cambia al actualizar, así que añadirlo a la regla sería de pocas líneas; no lo hice porque pidió el porcentaje y cada línea
   más es una línea que no puedo probar. **Decisión suya**, y si la toma conviene probarla en un emulador primero.
3. **La regla no vale hasta que se pega**, y la consola puede tener hoy algo distinto al archivo del repositorio. Por eso el paso 2.
4. **El mensaje de fallo no explica nada.** Si algún día la regla rechaza un guardado legítimo, el mostrador solo lee «No se pudo guardar… Intenta de nuevo»
   (`textoFalloAlGuardarElContrato`, `textoFalloAlGuardarElCierre`, `textoFalloAlRegistrarElAbono` no distinguen `permission-denied`). Cambiarlo es
   trabajo de pantalla, aparte; no lo hice para no mezclarlo con la regla.
5. **Corregir el porcentaje de una renta ya enlazada no tiene pantalla** (Enlazar solo existe para las rentas sin enlazar). Se haría en la consola, y
   ahí hay que subir también `actualizado` (ver ADR-002).
6. **Leer sigue abierto**: cualquier sesión lee los porcentajes, en el contrato y en `empleados`. Es el punto (1) de «Pendientes conocidos del dinero», que sigue pendiente.
7. Menor: este informe depende de que el otro agente no cambie, en su trabajo en curso, ninguna de las funciones de la tabla 1. Si cambia alguna, la prueba lo dirá.
