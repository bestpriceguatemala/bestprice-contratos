# Liquidación a dueños de carros subarrendados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el dueño pueda ver cuánto le debe a cada dueño de carro subarrendado, escoger qué rentas le paga, registrar el pago, e imprimir un comprobante formal para mandárselo.

**Architecture:** Las reglas puras van a `js/nucleo/liquidacion.js` y se prueban sin DOM. Los dueños pasan a ser una colección propia (`duenos`) con la misma forma de trabajo que `clientes`. El área de dinero se abre con una **segunda credencial de Firebase** (§11 del diseño), no con una cortina en pantalla: una instancia secundaria de Firebase que no toca la sesión normal. El comprobante es una vista de impresión en HTML (ADR-003), no un PDF generado por código.

**Tech Stack:** HTML + módulos ES nativos, sin paso de compilación y sin dependencias propias. Firebase 12 (Auth + Firestore) por CDN. Pruebas con `node:test` + `node:assert/strict`, corridas con `npm test`.

**Spec:** `docs/superpowers/specs/2026-09-29-liquidacion-a-duenos-design.md`, que amplía `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md` (la autoridad).

**ADRs que gobiernan este plan:** ADR-001 (no guardar números de tarjeta), ADR-002 (el costo del dueño vive tras la contraseña), ADR-003 (los PDF salen por el botón Imprimir).

## Global Constraints

- Módulos ES nativos. **Sin paso de compilación y sin dependencias propias** en lo que se publica. Firebase se carga por CDN, como ya se hace.
- Pruebas con `node:test` + `node:assert/strict`, en `pruebas/*.test.mjs`, corridas con `npm test`.
- **Todo lo que el dueño lee va en español llano**, en palabras sobre las que pueda actuar. Los comentarios del código también en español, y explican el *porqué*, no lo que hace la línea siguiente.
- Las fechas son texto ISO `'YYYY-MM-DD'` y solo se comparan con `diasEntre()` de `js/nucleo/fechas.js`. **Nunca `new Date()` para decidir qué día es hoy**: `hoy` se recibe como parámetro. Guatemala está en UTC-6 y este sistema ya dijo una vez "mañana" desde las 6 de la tarde.
- **El dinero pasa por `q()`** (`js/nucleo/dinero.js`). Nunca se redondea a mano, nunca `toFixed` dentro de un número que se guarda. El recargo de tarjeta se calcula con `recargoTarjeta()`, nunca multiplicando a mano.
- **Ninguna regla del negocio se reimplementa en una pantalla.** Vive en `js/nucleo/`, una sola vez. Este proyecto ha perdido cinco vueltas de revisión por reglas escritas en dos lugares, y una de ellas apareció en un tercer sitio solo porque dos números se contradijeron en pantalla.
- **Los nombres de los campos se copian de §7b del diseño general, verbatim** — nunca de la memoria de nadie ni de un encargo escrito. **Cada dato de prueba tiene que tener la forma real de un registro guardado**: una tarea de este proyecto publicó 259 pruebas en verde contra campos que no existían, porque los datos de prueba también eran inventados.
- **No se agregan avisos que el dueño no pidió.** Sus palabras: *"yo pongo el precio que yo quiera, así que no me tires avisos"*. Un aviso que se dispara cuando no debe es un error, no una función.
- **Una lectura fallida nunca se dibuja como una lista vacía.** Las lecturas devuelven `{datos, fallo}`; este sistema una vez dibujó una lectura fallida como "todos los carros disponibles".
- Commits con pathspec explícito. **Nunca `git add -A`**: hay más de un agente trabajando en esta rama.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `js/nucleo/liquidacion.js` | **Nuevo.** Qué se le debe a un dueño, qué contratos son pagables, cómo se agrupa. Puro, sin DOM. |
| `js/nucleo/dueno.js` | **Nuevo.** `CAMPOS_DUENO`, `construirDueno`, `faltaAlgoEnDueno`. Espejo de `cliente.js`. |
| `js/dinero-sesion.js` | **Nuevo.** La segunda credencial: instancia secundaria de Firebase, entrar y salir del área de dinero. |
| `js/datos.js` | Modificar: `cargarDuenos`, `guardarDueno`, `cargarPagosDueno`, `guardarPagoDueno`, `siguienteNumeroComprobante`, y la migración de `costoDia`. |
| `js/cache.js` | Modificar: agregar `duenos` a `TIENDAS` y subir `VERSION_BD`. |
| `js/pantallas/duenos.js` | **Nuevo.** Alta y edición de dueños. |
| `js/pantallas/dinero.js` | **Nuevo.** Entrada al área, lista de dueños con lo que se les debe, ficha, registro de pago. |
| `js/pantallas/comprobante.js` | **Nuevo.** La vista de impresión del comprobante. |
| `js/pantallas/sacarCarro.js` | Modificar: escoger dueño de la lista, y escribir `costoDia` en `privado`. |
| `css/estilos.css` | Modificar: la hoja `@media print` del comprobante. |
| `firestore.rules` | Modificar: `duenos` y `pagosDueno`. |
| `index.html`, `js/app.js` | Modificar: rutas y entradas de menú. |

---

## Task 1: Qué se le debe a un dueño

**Files:**
- Create: `js/nucleo/liquidacion.js`
- Test: `pruebas/liquidacion.test.mjs`

**Interfaces:**
- Consumes: `q` (`dinero.js`), `atrasoDe` (`contrato.js`), `estadoContrato` (`estados.js`).
- Produces:
  - `costoDelSubarriendo(contrato) -> number` — `costoDia × (días + días de atraso)`, nunca negativo.
  - `esPagableAlDueno(contrato) -> boolean` — es de carro ajeno **y** `estadoContrato(c) === 'cerrado'`.
  - `cuentaDeDueno({contratos, pagos}) -> {porPagar: [], aunNoCierra: [], pagados: [], totalPorPagar}` — las tres listas y el total, sin volver a filtrar en la pantalla. `contratos` ya vienen de un solo dueño.
  - `agruparPorDueno(contratos, pagos) -> [{duenoId, nombre, cuenta}]` — una entrada por dueño, con su `cuenta` ya armada, ordenadas por `totalPorPagar` de mayor a menor. **La clave de agrupación es `duenoId` cuando existe y el texto de `carroAjeno.dueno` cuando no**, para que los contratos viejos sin `duenoId` sigan apareciendo bajo el nombre que se escribió ese día en vez de desaparecer de la vista. Una entrada sin `duenoId` se marca para que la pantalla pueda ofrecer enlazarla.
  - `totalSeleccionado(contratos, idsMarcados) -> number`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `pruebas/liquidacion.test.mjs`. Los contratos de prueba llevan la **forma real** de §7b (`carroAjeno`, `subarriendo`, `cierre: {fechaReal, ...}`, `pagos[]`, `garantiaMonto`, `garantiaLiberada`), nunca campos inventados.

Casos obligatorios:
- `costoDelSubarriendo`: 4 días a Q300 = **Q1,200.00**; con 2 días de atraso = **Q1,800.00**; sin `subarriendo` = **0**; con `costoDia` en 0 = **0**.
- `esPagableAlDueno`: un contrato ajeno **cerrado** sí; uno ajeno **devuelto sin cerrar** no; uno ajeno **todavía afuera** no; un contrato de **carro propio** cerrado no.
- `cuentaDeDueno`: separa las tres listas correctamente y `totalPorPagar` suma solo `porPagar`; un contrato ya cubierto por un pago cae en `pagados` y **no** suma.
- `totalSeleccionado`: con ningún id marcado da 0; con dos marcados da la suma exacta de esos dos, no de todos.
- `agruparPorDueno`: dos contratos del mismo `duenoId` caen en **una** entrada con el total sumado; un contrato viejo **sin `duenoId`** cae en su propia entrada bajo el texto de `carroAjeno.dueno` y queda marcado como no enlazado; dos contratos viejos con el **mismo texto** caen juntos; el orden es por `totalPorPagar` de mayor a menor.

- [ ] **Step 2: Correr y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/liquidacion.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Sin DOM. `hoy` no hace falta aquí: "cerrado" ya es un estado derivado, no depende del día.

`esPagableAlDueno` **pregunta a `estadoContrato`**, no reimplementa la regla de cerrado. Un contrato cerrado ya exige saldo saldado y garantía liberada.

- [ ] **Step 4: Correr y ver que pasan**

Correr: `npm test`

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/liquidacion.js pruebas/liquidacion.test.mjs
git commit -m "Que se le debe a cada dueno de carro subarrendado"
```

---

## Task 2: Los dueños como registro

**Files:**
- Create: `js/nucleo/dueno.js`
- Test: `pruebas/dueno.test.mjs`

**Interfaces:**
- Produces: `CAMPOS_DUENO` (lista viva de campos, como `CAMPOS_CLIENTE`), `construirDueno(existente, campos)`, `faltaAlgoEnDueno(dueno)`, `textoDeDueno(dueno)` para el buscador.

- [ ] **Step 1: Las pruebas**

Espejo de `pruebas/cliente.test.mjs`. Campos: `nombre`, `telefono`, `nit`, `nota`. Solo `nombre` es obligatorio.

Casos: recorta espacios en todos los campos de texto; **conserva campos desconocidos** que ya venían guardados (como hace `construirCliente`); `faltaAlgoEnDueno` devuelve `['Nombre']` sin nombre y `[]` con él; `textoDeDueno` junta nombre, teléfono y NIT para que el buscador encuentre por cualquiera de los tres.

- [ ] **Step 2: Correr y ver que falla.** `npm test`
- [ ] **Step 3: Escribir el módulo**, siguiendo `js/nucleo/cliente.js` al pie.
- [ ] **Step 4: Correr y ver que pasan.** `npm test`
- [ ] **Step 5: Commit**

```bash
git add js/nucleo/dueno.js pruebas/dueno.test.mjs
git commit -m "Los duenos de carros ajenos pasan a ser un registro"
```

---

## Task 3: Guardar dueños

**Files:**
- Modify: `js/datos.js`, `js/cache.js`
- Test: `pruebas/datos.test.mjs`

**Interfaces:**
- Produces: `cargarDuenos(alLlegar)`, `guardarDueno(dueno)`, `buscarDuenos(consulta)`, `duenoParaGuardar(dueno, {id, ahora})`.

- [ ] **Step 1: `cache.js`** — agregar `'duenos'` a `TIENDAS` y **subir `VERSION_BD` de 2 a 3**.

Sin subir la versión, `onupgradeneeded` no vuelve a correr en una computadora que ya tiene la base, y `guardarLocal('duenos', ...)` fallaría aunque `'duenos'` esté en el arreglo. Esto ya pasó con `reservas`. El manejador solo crea las tiendas que faltan, así que **no se pierde nada** de lo guardado.

- [ ] **Step 2: `datos.js`** — `cargarDuenos` es un envoltorio de una línea sobre `cargarConSincronia('duenos', alLlegar)`, igual que `cargarClientes`. No se reimplementa nada de la sincronía. `guardarDueno` sigue la forma de `guardarCliente`. `buscarDuenos` usa `filtrar` de `busqueda.js` con `textoDeDueno`.

- [ ] **Step 3: La prueba** de `duenoParaGuardar`: sella `id` y `actualizado`, conserva el `id` existente, y no pisa campos desconocidos.

- [ ] **Step 4: Correr.** `npm test`
- [ ] **Step 5: Commit**

```bash
git add js/datos.js js/cache.js pruebas/datos.test.mjs
git commit -m "Guardar duenos, con su tienda local"
```

---

## Task 4: La segunda credencial del área de dinero

**Files:**
- Create: `js/dinero-sesion.js`
- Test: `pruebas/dinero-sesion.test.mjs`

**Interfaces:**
- Produces: `entrarADinero(correo, clave)`, `salirDeDinero()`, `sesionDeDinero()` (devuelve el `uid` o `null`), `dbDeDinero()` (la instancia de Firestore autenticada como dinero).

§11 del diseño es explícito: **no es una cortina en pantalla**. Los datos viven en documentos que las reglas de Firestore solo dejan leer con la segunda credencial, así que hay que autenticarse de verdad.

- [ ] **Step 1: La instancia secundaria**

Firebase permite `initializeApp(CONFIG, 'dinero')` — una segunda instancia con su propio `Auth`, que **no toca la sesión normal**. Entrar al área de dinero no debe cerrar la sesión del mostrador ni al revés.

- [ ] **Step 2: Las pruebas puras**

Lo que se puede probar sin red: que `sesionDeDinero()` devuelve `null` antes de entrar; que `salirDeDinero()` lo devuelve a `null`; y el texto del error cuando la credencial es incorrecta, que tiene que ser español llano — *"Esa contraseña no abre el área de dinero."* — y nunca el mensaje crudo de Firebase.

- [ ] **Step 3: Escribir el módulo.** Si la conexión falla, `listo` vuelve a `null` para que el siguiente intento lo reintente, igual que `iniciarFirebase()` en `js/firebase-config.js` — un fallo de red no puede dejar el área cerrada para siempre.

- [ ] **Step 4: Correr.** `npm test`
- [ ] **Step 5: Commit**

```bash
git add js/dinero-sesion.js pruebas/dinero-sesion.test.mjs
git commit -m "La segunda credencial del area de dinero, sin tocar la sesion normal"
```

**OJO — esto necesita una acción del dueño:** crear una segunda cuenta en Firebase Authentication y poner su UID en `firestore.rules` donde hoy dice `UID_DE_LA_CUENTA_DE_DINERO`. Hasta que lo haga, el área queda cerrada a todos, que es el estado seguro. Se le pide en la Tarea 10, junto con las reglas.

---

## Task 5: Escoger el dueño al sacar un carro ajeno

**Files:**
- Modify: `js/pantallas/sacarCarro.js`
- Test: `pruebas/sacarCarro.test.mjs`

- [ ] **Step 1: El buscador**

Donde hoy hay un campo de texto `sc-ajeno-dueno`, va el mismo buscador que ya usa el cliente (`sc-cliente-buscar` / `sc-cliente-resultados`), con **alta rápida** ahí mismo: el dueño aparece por primera vez con el carro afuera y el cliente esperando.

El contrato guarda `duenoId` **y** conserva `carroAjeno.dueno` con el nombre tal como se escribió ese día — el nombre es también un dato del contrato, no solo un puntero.

- [ ] **Step 2: Las pruebas** — que `construirContrato` guarde `duenoId` cuando se escogió uno, que lo deje en `null` cuando no, y que **un contrato sin `duenoId` siga siendo válido** (los viejos lo son).

- [ ] **Step 3: Verificar en el navegador.** Sacar un carro ajeno escogiendo un dueño de la lista, y otro dando de alta uno nuevo desde ahí. `preview_start` con nombre `contratos`, sembrando IndexedDB. **Nunca pedir credenciales de ingreso.**

- [ ] **Step 4: Commit**

```bash
git add js/pantallas/sacarCarro.js pruebas/sacarCarro.test.mjs
git commit -m "El dueno del carro ajeno se escoge de la lista"
```

---

## Task 6: Mover el costo del dueño tras la contraseña (ADR-002)

**Files:**
- Modify: `js/datos.js`, `js/pantallas/sacarCarro.js`
- Test: `pruebas/datos.test.mjs`

Esta es la tarea que paga la deuda que el diseño general anotó en §7.

- [ ] **Step 1: Escribir en `privado`**

`guardarContrato` escribe `costoDia` en `contratos/{id}/privado/dinero`, no en el documento del contrato. Las reglas ya permiten `create, update` con sesión y `read` solo con la credencial de dinero.

- [ ] **Step 2: El puente de lectura — y dónde NO va**

**Corrección al plan original, a partir de un hallazgo de la Tarea 1.** El plan decía poner el puente en `costoDelSubarriendo` (`liquidacion.js`). Eso está mal: esa función no calcula nada, le pregunta a `resumen()` (`js/nucleo/contrato.js:112`), que es donde de verdad vive la fórmula y de donde sale **también la utilidad**. Un puente solo en `liquidacion.js` haría que la deuda al dueño y la utilidad usaran costos distintos sobre el mismo contrato, y nada lo avisaría.

Poner el puente dentro de `contrato.js` tampoco sirve: el núcleo es puro y no sabe leer de Firestore.

**El puente va en `js/datos.js`, al cargar.** Cuando el área de dinero lee un contrato ajeno, trae también su `privado/dinero` y **mezcla el costo dentro del contrato** antes de devolverlo, de modo que `c.subarriendo.costoDia` quede poblado venga de donde venga. Así:
- El núcleo no cambia ni una línea y sigue sin saber de almacenamiento.
- **Sigue habiendo un solo lugar** que calcula el costo: `resumen()`.
- Los contratos viejos, que ya traen el valor en el documento, funcionan sin tocarlos.

Si el documento privado no se puede leer (sin credencial de dinero), el costo queda en 0 y **la pantalla lo dice** — nunca muestra Q0.00 como si fuera un costo real.

**El puente se queda para siempre**, como los otros de §7b.

- [ ] **Step 3: La migración**

Una función que recorre los contratos ajenos con `subarriendo.costoDia` en el documento, lo copia a `privado/dinero` y lo borra del documento. **Se corre una sola vez, a mano, desde el área de dinero**, con un botón que dice cuántos contratos migró. No automática al abrir: una migración que corre sola es una migración que nadie vio correr.

- [ ] **Step 4: Las pruebas** — que el puente lea el valor viejo cuando está en el contrato, el nuevo cuando está en privado, y **prefiera el privado** si por alguna razón están los dos.

- [ ] **Step 5: Correr.** `npm test`
- [ ] **Step 6: Commit**

```bash
git add js/datos.js js/pantallas/sacarCarro.js pruebas/datos.test.mjs
git commit -m "ADR-002: el costo del dueno se guarda tras la contrasena, con puente y migracion"
```

---

## Task 7: Guardar los pagos a dueños

**Files:**
- Modify: `js/datos.js`
- Test: `pruebas/datos.test.mjs`

**Interfaces:**
- Produces: `cargarPagosDueno(alLlegar)`, `guardarPagoDueno(pago)`, `siguienteNumeroComprobante()`, `pagoDuenoParaGuardar(pago, {id, numero, ahora})`.

- [ ] **Step 1: La forma del pago** — `duenoId`, `fecha`, `forma`, `monto`, `contratos[]` (los ids que cubre), `numero`, `actualizado`. Los nombres van a §7b del diseño general en la Tarea 11.

- [ ] **Step 2: El correlativo** — `siguienteNumeroComprobante()` usa el mismo mecanismo de transacción que `siguienteNumeroContrato()`, sobre `contadores/comprobantes`. Copiarlo, no inventar otro: ese ya está probado contra dos pestañas guardando a la vez.

- [ ] **Step 3: Se lee y escribe con la credencial de dinero**, no con la sesión normal. Usa `dbDeDinero()` de la Tarea 4.

- [ ] **Step 4: Las pruebas** de `pagoDuenoParaGuardar`: sella `id`, `numero` y `actualizado`; **el monto pasa por `q()`**; `contratos[]` nunca queda `undefined`.

- [ ] **Step 5: Commit**

```bash
git add js/datos.js pruebas/datos.test.mjs
git commit -m "Guardar los pagos a duenos, con su comprobante correlativo"
```

---

## Task 8: La pantalla del área de dinero

**Files:**
- Create: `js/pantallas/dinero.js`, `js/pantallas/duenos.js`
- Modify: `js/app.js`, `index.html`
- Test: `pruebas/dinero.test.mjs`

- [ ] **Step 1: La entrada** — `#/dinero` pide la segunda contraseña. Con la sesión de dinero abierta, muestra la lista; sin ella, el formulario. La entrada del menú **deja de estar `hidden`**.

- [ ] **Step 2: La lista de dueños** — una fila por dueño: nombre, cuántas rentas cerradas se le deben, y el total. Ordenada por lo que más se debe primero. Un dueño sin nada pendiente se ve apagado, no desaparece.

Los contratos viejos con el nombre escrito a mano y sin `duenoId` se agrupan **bajo ese texto tal cual**, para que ningún monto desaparezca de la vista, con un botón para enlazarlos a un dueño de la lista.

- [ ] **Step 3: La ficha** — los tres bloques de §5 del diseño: **Por pagar** (con casillas), **Aún no cierra** (en gris, sin casillas, con la razón), **Ya pagado**. Al marcar casillas, **el total de lo marcado se suma abajo, a la vista**, antes de registrar nada.

- [ ] **Step 4: Registrar el pago** — forma (efectivo, transferencia, cheque) y fecha, que arranca en hoy. Al guardar, las rentas marcadas pasan al bloque de abajo.

- [ ] **Step 5: La pantalla de dueños** — alta y edición, siguiendo `js/pantallas/clientes.js`.

- [ ] **Step 6: Lecturas fallidas** — barra roja como en `flota.js`. **Una lectura fallida nunca se dibuja como "no le debes nada a nadie"**: eso le haría creer que está al día cuando no lo está.

- [ ] **Step 7: Verificar en el navegador**, sembrando contratos ajenos cerrados de dos dueños distintos y comprobando que los totales cuadran con lo sembrado.

- [ ] **Step 8: Commit**

```bash
git add js/pantallas/dinero.js js/pantallas/duenos.js js/app.js index.html pruebas/dinero.test.mjs
git commit -m "El area de dinero: lo que se le debe a cada dueno, y el pago"
```

---

## Task 9: El comprobante para imprimir (ADR-003)

**Files:**
- Create: `js/pantallas/comprobante.js`
- Modify: `css/estilos.css`
- Test: `pruebas/comprobante.test.mjs`

- [ ] **Step 1: La hoja** — el contenido y el orden están en §6 del diseño: membrete, datos del dueño, número y fecha, tabla **«Le pagué»** con su total y la forma de pago, tabla **«Queda pendiente»** con su total, y línea de firma.

Si no queda nada pendiente, dice *«No queda nada pendiente»* en vez de una tabla vacía.

- [ ] **Step 2: Lo que NO lleva** — ni la comisión del empleado, ni lo que el cliente pagó, ni la utilidad. **El dueño del carro solo ve lo suyo.** Una prueba tiene que fijarlo: armar un comprobante desde un contrato que tenga comisión y pagos del cliente, y assertar que ninguno de esos números aparece en la salida.

- [ ] **Step 3: La hoja de impresión** — `@media print` esconde menú, botones y todo lo que no sea el comprobante. Carta, vertical.

- [ ] **Step 4: Verificar en el navegador** — abrir el comprobante y comprobar en el DOM que están las dos tablas, que los totales cuadran con lo que se pagó, y que los números prohibidos del Paso 2 no aparecen.

- [ ] **Step 5: Commit**

```bash
git add js/pantallas/comprobante.js css/estilos.css pruebas/comprobante.test.mjs
git commit -m "El comprobante de pago al dueno, listo para imprimir"
```

---

## Task 10: Las reglas y lo que tiene que hacer el dueño

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Las dos reglas nuevas**

```
match /duenos/{id}      { allow read, write: if haySesion(); }
match /pagosDueno/{id}  { allow read, write: if esDinero(); }
```

`duenos` con sesión porque el alta rápida ocurre en el mostrador. `pagosDueno` solo con la credencial de dinero.

- [ ] **Step 2: Comprobar que nada más se aflojó** — `privado` y `pagosComision` siguen cerrados tras el placeholder. El archivo se lee limpio de arriba abajo: el dueño lo pega a mano.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "Reglas de duenos y pagos a duenos"
```

**Lo que el dueño tiene que hacer, y hay que entregárselo junto:**
1. Crear una **segunda cuenta** en Firebase Authentication (la del área de dinero).
2. Copiar su **UID** y reemplazar `UID_DE_LA_CUENTA_DE_DINERO` en el archivo.
3. Pegar el archivo completo en la consola y publicarlo.
4. Subir los commits desde GitHub Desktop.

---

## Task 11: El glosario y el cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`

- [ ] **Step 1: Agregar a §7b** los campos nuevos, verbatim:

**Del dueño:** `nombre`, `telefono`, `nit`, `nota`, `actualizado`.
**Del pago a un dueño:** `duenoId`, `fecha`, `forma`, `monto`, `contratos[]`, `numero`, `actualizado`.
**Del contrato:** `duenoId`.

**Además, campos que el contrato SÍ guarda y que §7b nunca listó** (hallazgo de la Tarea 1 — el glosario tenía un hueco justo en la parte que este plan usa más): `ajeno`, `carroAjeno{placas, tipo, marca, color, modelo, dueno, costoDia}`, `subarriendo{costoDia}`, `tarjetas[]`. Dejar anotado que **«es de carro ajeno» se decide con `Boolean(c.ajeno)`**, un solo criterio, para que nadie lo deduzca mirando si hay `carroAjeno`.

- [ ] **Step 2: Anotar el puente de lectura nuevo** — `costoDia` en el contrato contra `privado/dinero` — en la lista de puentes que el sistema arrastra.

- [ ] **Step 3: Marcar como pagada la deuda de §7** sobre `subarriendo.costoDia`, apuntando a ADR-002.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md
git commit -m "Glosario: los campos de dueno y de pago al dueno"
```
