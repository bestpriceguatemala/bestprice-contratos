# Recibir y cobrar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el ciclo de un contrato: recibir el carro, cobrar lo que falte —de una vez o por abonos—, liberar la garantía de la tarjeta y dejar el contrato cerrado. Y la ficha del cliente completa, que hoy no existe.

**Architecture:** Igual que el plan 1: página estática (HTML + módulos ES nativos, sin compilación), Firebase Auth y Firestore, todo el cálculo en módulos puros bajo `js/nucleo/` probados con `node --test`. Este plan casi no toca el motor de cobro: `lineasDevolucion`, `resumen`, `saldoConTarjeta`, `pendientesDe` y `puedeCerrar` ya existen y están probados. Lo que falta son las pantallas y lo que se guarda.

**Tech Stack:** JavaScript con módulos ES nativos, Firebase 12 (Auth + Firestore) por CDN, `node --test`, IndexedDB para la copia local.

**Spec:** `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`

## Global Constraints

- **Nunca ajustar una cifra para que cuadre.** Si un número no da, se arregla la causa.
- **Redondeo a 2 decimales** en todo monto, con `q()` de `js/nucleo/dinero.js`.
- **El precio por día ya incluye** seguro y seguro de terceros: nunca se suman aparte.
- **El combustible se escribe a mano**: el sistema no lo calcula por nivel de tanque (decisión suya).
- **El carro queda disponible al recibirlo**, aunque el contrato siga abierto.
- **Se aceptan abonos**: el cliente puede pagar una parte del saldo. La garantía se libera **solo cuando ya no queda saldo**.
- **El porcentaje de comisión no se muestra ni se edita** en ninguna pantalla de este plan: es del área de dinero (plan 5).
- **No se guarda el número completo de tarjeta ni el CBC** (ADR-001).
- Sin dependencias de npm en el código publicado. Las pruebas usan solo `node:test` y `node:assert`.
- Todo el texto que ve el usuario va **en español**, sin tecnicismos.
- Los comentarios del código se escriben **en español**, explicando el porqué.
- Objetivos de velocidad: ninguna pantalla tarda más de un segundo en dibujarse; el buscador responde mientras se escribe.

## Lo que ya existe y se usa tal cual

- `js/nucleo/contrato.js` → `atrasoDe`, `lineasSalida`, `lineasDevolucion`, `resumen(c)` → `{diasAtraso, totalSalida, totalDevolucion, subtotal, pagado, saldo, totalCobrado, costoSubarriendo, utilidad}`, `saldoConTarjeta(c, pct)` → `{saldo, recargo, total}`.
- `js/nucleo/estados.js` → `pendientesDe(c)` → `{saldo, garantia}`, `puedeCerrar(c)`, `estadoContrato(c)`, `estadoCarro(...)`.
- `js/nucleo/busqueda.js` → `filtrar`, `textoDeCliente`, `normalizar`.
- `js/nucleo/fechas.js` → `hoyISO`, `diasEntre`, `diasAtraso`, `devolucionPrevista`.
- `js/datos.js` → `cargarFlota`, `cargarContratosAbiertos`, `cargarAjustes`, `buscarClientes`, `guardarCliente`, `guardarContrato`, `contratoParaGuardar`, `resultadoLectura`.
- `js/ui.js` → `dinero`, `fecha`, `aviso`. `js/router.js` → `registrarPantalla`, `emparejar`.
- `js/pantallas/flota.js` ya manda a `#/recibir/<contratoId>`; esa ruta es de este plan.

## Estructura de archivos

```
js/nucleo/
  cliente.js        campos del cliente, nombre completo, construir la ficha
  cierre.js         armar el cierre y validarlo antes de guardar
js/pantallas/
  clientes.js       lista, buscador, ficha, edición e historial
  recibirCarro.js   recibir el carro y cobrar
  contratos.js      historial de contratos y ver uno
js/datos.js         + cargarClientes, cargarContrato, registrarPago, liberarGarantia
pruebas/
  cliente.test.mjs
  cierre.test.mjs
  pagos.test.mjs
```

---

### Task 1: La ficha del cliente

**Files:**
- Create: `js/nucleo/cliente.js`
- Test: `pruebas/cliente.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CAMPOS_CLIENTE` — la lista de campos en el orden en que se piden, cada uno `{id, etiqueta, tipo}` con `tipo` `'texto' | 'fecha' | 'correo' | 'telefono'`. Las pantallas dibujan el formulario desde aquí, así el alta rápida y la ficha nunca se desincronizan.
  - `construirCliente(existente, campos) -> cliente` — mezcla lo que ya estaba con lo que se escribió, sin perder campos que la pantalla no muestre.
  - `nombreCompleto(cliente) -> string`.
  - `faltaAlgo(cliente) -> string[]` — los nombres de los campos obligatorios que están vacíos (nombres y apellidos).

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/cliente.test.mjs`:

```js
// Pruebas de la ficha del cliente.
//
// Los campos salen de la hoja CLIENTES de su Excel, con un cambio que él pidió:
// nombres y apellidos van en dos campos y no en cuatro. Todo lo demás se queda
// porque va impreso en el contrato.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_CLIENTE, construirCliente, nombreCompleto, faltaAlgo } from '../js/nucleo/cliente.js';

const campos = {
  nombres: 'JONATÁN ESTEBAN',
  apellidos: 'URIZAR ROLDÁN',
  documento: 'DPI 3786 73238 0101',
  telefono: '3078-4155',
  correo: 'fasteresteban07@gmail.com',
  direccionReferencia: 'CONDADO SAN NICOLÁS 2, ZONA 4, MIXCO',
};

test('la lista de campos trae lo que va impreso en el contrato', () => {
  const ids = CAMPOS_CLIENTE.map((c) => c.id);
  for (const necesario of ['nombres', 'apellidos', 'documento', 'licencia', 'telefono', 'correo', 'direccionReferencia']) {
    assert.ok(ids.includes(necesario), `falta el campo ${necesario}`);
  }
  assert.ok(!ids.includes('nombre2'), 'los nombres van en un solo campo');
  assert.ok(!ids.includes('apellido2'), 'los apellidos van en un solo campo');
});

test('construir un cliente nuevo deja solo lo que se escribió', () => {
  const c = construirCliente({}, campos);
  assert.equal(c.nombres, 'JONATÁN ESTEBAN');
  assert.equal(c.correo, 'fasteresteban07@gmail.com');
  assert.equal(c.direccionReferencia, 'CONDADO SAN NICOLÁS 2, ZONA 4, MIXCO');
});

test('editar un cliente no borra lo que la pantalla no mostró', () => {
  // El mismo error que nos costó un carro en el plan 1: la copia local se
  // reemplaza entera, así que lo que no se copia desaparece de la pantalla.
  const existente = { id: 'k1', codigo: 7, facturarA: 'BEST PRICE', actualizado: 100 };
  const c = construirCliente(existente, { ...campos, telefono: '5555-5555' });
  assert.equal(c.id, 'k1');
  assert.equal(c.codigo, 7);
  assert.equal(c.facturarA, 'BEST PRICE', 'un campo que el formulario no mostró se conserva');
  assert.equal(c.telefono, '5555-5555', 'lo que se escribió gana sobre lo viejo');
});

test('el nombre completo se lee como en el contrato', () => {
  assert.equal(nombreCompleto(construirCliente({}, campos)), 'JONATÁN ESTEBAN URIZAR ROLDÁN');
  assert.equal(nombreCompleto({}), '');
});

test('sin nombre o sin apellido no se puede guardar', () => {
  assert.deepEqual(faltaAlgo(construirCliente({}, campos)), []);
  assert.deepEqual(faltaAlgo(construirCliente({}, { ...campos, apellidos: '  ' })), ['Apellidos']);
  assert.deepEqual(faltaAlgo({}), ['Nombres', 'Apellidos']);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/cliente.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/cliente.js`. `CAMPOS_CLIENTE` lleva, en este orden: `nombres`, `apellidos`, `nacionalidad`, `fechaNacimiento` (fecha), `documento`, `documentoExtendidoEn`, `documentoExpira` (fecha), `licencia`, `licenciaEmitidaEn`, `licenciaEmision` (fecha), `licenciaExpira` (fecha), `direccionReferencia`, `municipio`, `pais`, `telefono`, `correo`, `direccionAdicional`, `ciudadAdicional`, `estadoAdicional`, `paisAdicional`, `telefonoAdicional`, `facturarA`.

`construirCliente` sigue el patrón ya probado en `construirVehiculo`: `{ ...existente, ...campos }`, recortando espacios. El comentario debe decir por qué se arrastra lo existente.

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 100 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/cliente.js pruebas/cliente.test.mjs
git commit -m "Ficha del cliente: los campos que van impresos en el contrato"
```

---

### Task 2: El motor del cierre

**Files:**
- Create: `js/nucleo/cierre.js`
- Test: `pruebas/cierre.test.mjs`

**Interfaces:**
- Consumes: `q` de `dinero.js`; `diasEntre` de `fechas.js`; `resumen`, `saldoConTarjeta` de `contrato.js`.
- Produces:
  - `construirCierre(contrato, campos) -> contrato` — devuelve el contrato con su `cierre`, sin perder nada de lo que ya tenía. `campos`: `{fechaReal, horaReal, lugarEntrada, kmEntrada, combustible, danos, danosDetalle, varios, variosDetalle, descuento}`.
  - `problemasDelCierre(contrato, cierre) -> string[]` — lo que impide guardar, en español y ya redactado para mostrarse.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/cierre.test.mjs`:

```js
// Pruebas de recibir el carro.
//
// El cálculo del cobro ya vive en contrato.js y está probado ahí. Lo que se
// prueba aquí es lo que puede salir mal al recibir: un kilometraje que retrocede,
// una fecha anterior a la salida, un descuento inventado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirCierre, problemasDelCierre } from '../js/nucleo/cierre.js';
import { resumen } from '../js/nucleo/contrato.js';

const contrato = () => ({
  id: 'c1', numero: 1, carroId: 'v1',
  dias: 4, precioDia: 700, kmSalida: 45000,
  fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24',
  cartaPoderPrecio: 350,
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
  estado: 'rentado',
});

const campos = {
  fechaReal: '2026-08-25', horaReal: '10:30', lugarEntrada: 'OFICINA',
  kmEntrada: 45600, combustible: 130, danos: 200, danosDetalle: 'Rayón en la puerta',
  varios: 0, descuento: 300,
};

test('el cierre no pierde nada de lo que ya traía el contrato', () => {
  const c = construirCierre(contrato(), campos);
  assert.equal(c.numero, 1);
  assert.equal(c.precioDia, 700);
  assert.equal(c.pagos.length, 1);
  assert.equal(c.cierre.fechaReal, '2026-08-25');
  assert.equal(c.cierre.kmEntrada, 45600);
});

test('el ejemplo del diseño cuadra al recibir', () => {
  const r = resumen(construirCierre(contrato(), campos));
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalDevolucion, 730, 'atraso más daños más combustible menos descuento');
  assert.equal(r.subtotal, 3880);
  assert.equal(r.saldo, 730, 'el saldo se ve sin recargo hasta saber cómo paga');
});

test('los kilómetros no pueden retroceder', () => {
  const p = problemasDelCierre(contrato(), { ...campos, kmEntrada: 44000 });
  assert.equal(p.length, 1);
  assert.match(p[0], /kilometraje/i);
  assert.match(p[0], /45,?000/, 'dice con cuánto salió');
});

test('no se puede recibir un carro antes de haberlo entregado', () => {
  const p = problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-19' });
  assert.equal(p.length, 1);
  assert.match(p[0], /antes/i);
});

test('sin fecha real no se puede cerrar', () => {
  assert.match(problemasDelCierre(contrato(), { ...campos, fechaReal: '' }).join(' '), /fecha/i);
});

test('un descuento mayor que todo lo cobrado se avisa', () => {
  const p = problemasDelCierre(contrato(), { ...campos, descuento: 99999 });
  assert.match(p.join(' '), /descuento/i);
});

test('un cierre normal no tiene problemas', () => {
  assert.deepEqual(problemasDelCierre(contrato(), campos), []);
});

test('devolver antes de tiempo no da crédito ni problema', () => {
  const c = construirCierre(contrato(), { ...campos, fechaReal: '2026-08-22', descuento: 0 });
  const r = resumen(c);
  assert.equal(r.diasAtraso, 0);
  assert.deepEqual(problemasDelCierre(contrato(), { ...campos, fechaReal: '2026-08-22' }), []);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/cierre.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/cierre.js`. `construirCierre` devuelve `{ ...contrato, cierre: { ...contrato.cierre, ...campos } }` con los montos pasados por `q()`. `problemasDelCierre` revisa, en este orden: falta la fecha real; la fecha real es anterior a la de salida; el kilometraje de entrada es menor que el de salida; el descuento deja el subtotal en negativo. Cada mensaje se escribe para que él lo entienda sin pensar, con los números adentro.

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 108 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/cierre.js pruebas/cierre.test.mjs
git commit -m "Motor del cierre: armar la devolucion y lo que impide guardarla"
```

---

### Task 3: Pagos y garantía en la capa de datos

**Files:**
- Modify: `js/datos.js`
- Test: `pruebas/pagos.test.mjs`

**Interfaces:**
- Produces:
  - `agregarPago(contrato, {monto, forma, porcentajeTarjeta, fecha}) -> contrato` — función **pura**, exportada para probarla: devuelve el contrato con el pago agregado a `pagos`, con su recargo ya calculado.
  - `registrarPago(contrato, pago) -> Promise<contrato>` — guarda el contrato con el pago nuevo.
  - `liberarGarantia(contrato) -> Promise<contrato>` — marca `garantiaLiberada: true` y `garantiaLiberadaEn` con la fecha de hoy. **Rechaza si todavía queda saldo**, con un mensaje en español.
  - `cargarContrato(id) -> Promise<contrato|null>` — de la copia local primero, y si no está, de la nube.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/pagos.test.mjs`:

```js
// Pruebas de los abonos y de la garantía.
//
// Él cobra la renta al salir y a veces el cliente abona el saldo en partes. La
// garantía de la tarjeta se libera SOLO cuando ya no debe nada: es la única
// palanca que le queda para que le terminen de pagar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agregarPago } from '../js/datos.js';
import { resumen } from '../js/nucleo/contrato.js';
import { puedeCerrar, pendientesDe } from '../js/nucleo/estados.js';

const conSaldo = () => ({
  id: 'c1', dias: 4, precioDia: 700, cartaPoderPrecio: 350,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [{ monto: 3150, porcentajeTarjeta: 12 }],
  garantiaLiberada: false,
});

test('un abono baja el saldo pero no lo cierra', () => {
  const c = agregarPago(conSaldo(), { monto: 500, forma: 'efectivo', porcentajeTarjeta: 0, fecha: '2026-08-25' });
  const r = resumen(c);
  assert.equal(r.saldo, 230, 'de los Q730 quedan Q230');
  assert.equal(puedeCerrar(c), false);
  assert.equal(pendientesDe(c).saldo, 230);
});

test('dos abonos que completan dejan el saldo en cero', () => {
  let c = agregarPago(conSaldo(), { monto: 500, forma: 'efectivo', porcentajeTarjeta: 0 });
  c = agregarPago(c, { monto: 230, forma: 'efectivo', porcentajeTarjeta: 0 });
  assert.equal(resumen(c).saldo, 0);
});

test('un abono con tarjeta cobra su recargo', () => {
  const c = agregarPago(conSaldo(), { monto: 730, forma: 'tarjeta', porcentajeTarjeta: 12 });
  const r = resumen(c);
  assert.equal(r.saldo, 0, 'el saldo se mide sin recargo');
  assert.equal(r.totalCobrado, 4345.6, 'y lo cobrado sí lo incluye');
});

test('el pago queda con su fecha y su forma, para saber después cómo pagó', () => {
  const c = agregarPago(conSaldo(), { monto: 500, forma: 'transferencia', porcentajeTarjeta: 0, fecha: '2026-08-26' });
  const ultimo = c.pagos[c.pagos.length - 1];
  assert.equal(ultimo.forma, 'transferencia');
  assert.equal(ultimo.fecha, '2026-08-26');
  assert.equal(ultimo.monto, 500);
});

test('un pago sin monto no se agrega', () => {
  const c = agregarPago(conSaldo(), { monto: 0, forma: 'efectivo' });
  assert.equal(c.pagos.length, 1, 'sigue teniendo solo el pago de la salida');
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `agregarPago` no existe.

- [ ] **Step 3: Escribir las cuatro funciones**

En `js/datos.js`, siguiendo los patrones que ya están ahí: `agregarPago` es pura; `registrarPago` y `liberarGarantia` la usan y guardan con `guardarContrato`, que ya sella `actualizado` y `estado`. `liberarGarantia` comprueba el saldo con `resumen()` y lanza un error con el texto exacto que verá el usuario si todavía debe.

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 113 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/datos.js pruebas/pagos.test.mjs
git commit -m "Abonos y liberacion de garantia en la capa de datos"
```

---

### Task 4: Pantalla de recibir el carro

**Files:**
- Create: `js/pantallas/recibirCarro.js`
- Modify: `js/app.js` (registrar `#/recibir/:contratoId`)

**Interfaces:**
- Consumes: `construirCierre`, `problemasDelCierre` de `cierre.js`; `lineasSalida`, `lineasDevolucion`, `resumen`, `saldoConTarjeta` de `contrato.js`; `cargarContrato`, `registrarPago`, `guardarContrato`, `cargarAjustes` de `datos.js`; `dinero`, `fecha`, `aviso` de `ui.js`.
- Produces: `pintarRecibirCarro(contenedor, contratoId)`.

- [ ] **Step 1: El encabezado y lo que ya se sabe**

Arriba, sin que él tenga que buscar nada: número de contrato, cliente, carro, fecha de salida, devolución prevista, kilometraje de salida y **lo que ya pagó al salir**. Es lo que necesita para saber que está en el contrato correcto.

- [ ] **Step 2: Lo que se llena al recibir**

Fecha y hora real de entrada (la fecha viene con hoy puesto), lugar de entrada, kilometraje de entrada, combustible **escrito a mano**, daños con su detalle, varios con su detalle, y descuento.

Mientras escribe, el detalle del cobro se vuelve a calcular con `lineasDevolucion` y `resumen`, y los problemas de `problemasDelCierre` se muestran arriba del botón de guardar, en rojo. **Con un problema, el botón no guarda.**

- [ ] **Step 3: El cobro**

Debajo del detalle, el resumen en el orden de su hoja CIERRE: lo que ya pagó al salir, cada cobro de la devolución, el descuento, el saldo, y —si elige tarjeta— el recargo en su propia línea y el total a cobrar.

Un bloque de **pago**: monto (viene con el saldo completo puesto, pero se puede cambiar para un abono), forma de pago y porcentaje de tarjeta si aplica. El botón dice **Recibir y cobrar**; si el monto es menor que el saldo, dice **Recibir y abonar**.

Si no cobra nada en ese momento, el botón dice **Recibir sin cobrar** y el contrato queda pendiente.

- [ ] **Step 4: Guardar**

Al guardar: se arma el cierre con `construirCierre`, se agrega el pago si lo hubo, se guarda el contrato, y se vuelve a la flota con un aviso que diga qué pasó — *"Contrato 14 recibido. Falta cobrar Q230.00."* o *"Contrato 14 recibido y cobrado."*

El carro queda disponible en el mismo momento, porque `estadoCarro` ya lo decide por la fecha real de entrada.

- [ ] **Step 5: Verificar en el navegador**

Con datos de prueba en la copia local, sin escribir en la base del dueño:
- El contrato del diseño (4 días a Q700, carta poder Q350, ya pagó Q3,528) recibido un día tarde con Q200 de daños, Q130 de combustible y Q300 de descuento debe mostrar **saldo Q730.00**, y con 12 % de tarjeta **Q817.60** a cobrar.
- Un kilometraje menor que el de salida bloquea el guardado y lo dice.
- Al guardar, el carro aparece disponible en la flota y el contrato sale en *pendientes de cobro* si quedó saldo.

- [ ] **Step 6: Commit**

```bash
git add js/pantallas/recibirCarro.js js/app.js
git commit -m "Recibir el carro: el cierre, el cobro y los abonos"
```

---

### Task 5: Liberar la garantía y cerrar el contrato

**Files:**
- Modify: `js/pantallas/flota.js`, `js/pantallas/recibirCarro.js`

**Interfaces:**
- Consumes: `liberarGarantia` de `datos.js`; `pendientesDe`, `puedeCerrar` de `estados.js`.

- [ ] **Step 1: El botón donde ya está la lista**

En la lista de **garantías por liberar** de la pantalla principal, cada renglón lleva su botón **Liberar garantía**. Pide confirmación diciendo el monto y el cliente, porque soltar una garantía no se deshace desde el sistema.

- [ ] **Step 2: Lo que pasa si todavía debe**

Si queda saldo, el botón no libera: avisa *"Este cliente todavía debe Q230.00. La garantía se libera cuando termine de pagar."* Esa es la regla del negocio y es la única palanca que le queda para cobrar.

- [ ] **Step 3: Cobrar desde la misma lista**

En **pendientes de cobro**, cada renglón lleva **Cobrar**, que abre la pantalla de recibir en modo de solo cobro: el cierre ya está hecho, solo se registra el abono.

- [ ] **Step 4: Verificar en el navegador**

- Un contrato devuelto con saldo: el botón de liberar avisa y no libera.
- Se cobra el saldo desde *pendientes de cobro*; el contrato desaparece de esa lista.
- Se libera la garantía: el contrato desaparece de las dos listas y queda cerrado.

- [ ] **Step 5: Commit**

```bash
git add js/pantallas/flota.js js/pantallas/recibirCarro.js
git commit -m "Liberar la garantia solo cuando ya no debe nada"
```

---

### Task 6: Pantalla de clientes

**Files:**
- Create: `js/pantallas/clientes.js`
- Modify: `js/app.js` (rutas `#/clientes`, `#/clientes/nuevo`, `#/clientes/:id`), `index.html` (el menú ya tiene Clientes)
- Modify: `js/datos.js` (`cargarClientes(alLlegar)`)

**Interfaces:**
- Consumes: `CAMPOS_CLIENTE`, `construirCliente`, `nombreCompleto`, `faltaAlgo` de `cliente.js`; `filtrar`, `textoDeCliente` de `busqueda.js`; `resumen` de `contrato.js`; `diasEntre` de `fechas.js`.
- Produces: `pintarClientes(contenedor, clienteId)`.

- [ ] **Step 1: La lista con su buscador**

`#/clientes` muestra la lista con el buscador arriba, que responde mientras se escribe usando `filtrar` sobre la copia local. Cada renglón: nombre completo, DPI o pasaporte, teléfono, y una marca roja si tiene la licencia vencida o un saldo pendiente. Botón **Agregar cliente**.

- [ ] **Step 2: La ficha**

`#/clientes/:id` muestra todos los campos de `CAMPOS_CLIENTE` para ver y editar, en grupos: quién es, sus documentos, dónde vive y cómo se le contacta. Arriba, en rojo cuando aplica: licencia vencida, documento vencido, saldo pendiente y cuántas veces devolvió tarde.

- [ ] **Step 3: El historial**

Debajo de la ficha, todas sus rentas: número de contrato, carro, fechas, días, si devolvió a tiempo y cómo quedó la cuenta. Cada renglón abre ese contrato.

- [ ] **Step 4: Verificar en el navegador**

- Buscar por apellido, por DPI a medias y por teléfono sin guion encuentra al mismo cliente.
- Editar el correo y ver el cambio en la lista.
- Un cliente con licencia vencida se ve marcado en la lista y en su ficha.

- [ ] **Step 5: Commit**

```bash
git add js/pantallas/clientes.js js/datos.js js/app.js
git commit -m "Pantalla de clientes: lista, ficha, edicion e historial"
```

---

### Task 7: El alta rápida usa los mismos campos

**Files:**
- Modify: `js/pantallas/sacarCarro.js`

- [ ] **Step 1: Cambiar el formulario de alta rápida**

Hoy pide siete campos sueltos. Pasa a dibujarse desde `CAMPOS_CLIENTE` y a guardar con `construirCliente`, para que el alta rápida y la ficha nunca pidan cosas distintas. Se mantienen visibles de entrada los que se necesitan para entregar el carro —nombres, apellidos, documento, licencia y sus vencimientos, teléfono, correo, dirección de referencia— y el resto queda detrás de **Más datos**, para no frenar la entrega con el cliente esperando.

- [ ] **Step 2: Verificar en el navegador**

- Dar de alta un cliente desde el formulario de salida y verlo completo en su ficha.
- Que los campos de *Más datos* se guarden cuando se llenan.

- [ ] **Step 3: Commit**

```bash
git add js/pantallas/sacarCarro.js
git commit -m "El alta rapida de clientes pide los mismos campos que la ficha"
```

---

### Task 8: Historial de contratos

**Files:**
- Create: `js/pantallas/contratos.js`
- Modify: `js/app.js` (rutas `#/contratos`, `#/contratos/:id`), `js/datos.js` (`cargarContratos({desde, hasta})`)

**Interfaces:**
- Consumes: `resumen`, `lineasSalida`, `lineasDevolucion` de `contrato.js`; `estadoContrato`, `pendientesDe` de `estados.js`; `filtrar`, `textoDeContrato` de `busqueda.js`.
- Produces: `pintarContratos(contenedor, contratoId)`.

- [ ] **Step 1: La lista**

`#/contratos` muestra los contratos del mes en curso, con filtros por fechas y por estado: rentados, devueltos, pendientes de cobro, garantías sin liberar, cerrados. Cada renglón: número, cliente, carro, fechas y cómo quedó la cuenta. El buscador de arriba también llega aquí.

**Los años viejos no se cargan al abrir**: se traen cuando se pide ese rango de fechas.

- [ ] **Step 2: Ver un contrato**

`#/contratos/:id` muestra el contrato completo: los datos de la salida, el detalle del cobro de las dos partes, los pagos con su fecha y forma, el estado de la garantía y las observaciones. La tarjeta aparece enmascarada (`•••• 3343`), porque el número completo nunca se guardó.

Sin cálculos nuevos: todo sale de `lineasSalida`, `lineasDevolucion` y `resumen`.

- [ ] **Step 3: Verificar en el navegador**

- Filtrar por estado y ver que los conteos cuadran con lo que muestra la flota.
- Abrir un contrato cerrado y ver su detalle completo.
- Comprobar que la tarjeta se ve enmascarada.

- [ ] **Step 4: Commit**

```bash
git add js/pantallas/contratos.js js/datos.js js/app.js
git commit -m "Historial de contratos y ver un contrato completo"
```

---

### Task 9: Publicar

**Files:**
- Modify: `version.txt`, `js/version.js`

- [ ] **Step 1: Subir la versión**

Subir el número en los dos archivos, para que al publicar le salga el aviso de **Actualizar**.

- [ ] **Step 2: Correr todo**

Correr: `npm test`. Todo en verde.

- [ ] **Step 3: Commit**

```bash
git add version.txt js/version.js
git commit -m "Version nueva: recibir y cobrar"
```

---

## Al terminar el plan

1. `npm test` en verde.
2. Revisión final de la rama con el modelo más capaz, apuntándola a los pendientes anotados en el ledger.
3. Decirle al dueño: qué commits faltan subir, y que ya puede cerrar un contrato completo.
4. Siguiente plan: **reservaciones y calendario**, con el resumen del día al entrar.
