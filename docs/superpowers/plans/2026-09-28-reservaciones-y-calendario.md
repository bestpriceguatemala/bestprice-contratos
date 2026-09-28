# Reservaciones y calendario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apartar carros antes de que salgan, ver el mes de un vistazo, y saber al entrar si el día viene tranquilo o hay algo que atender.

**Architecture:** Igual que los planes 1 y 2: página estática (HTML + módulos ES nativos, sin compilación), Firebase Auth y Firestore, todo el cálculo en módulos puros bajo `js/nucleo/` probados con `node --test`. Se agrega una colección `reservas` y una pantalla de calendario; el resto se apoya en lo que ya existe.

**Tech Stack:** JavaScript con módulos ES nativos, Firebase 12 por CDN, `node --test`, IndexedDB para la copia local.

**Spec:** `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md` — §12b describe esta parte.

## Global Constraints

- **Nunca ajustar una cifra para que cuadre.** Todo monto sale del núcleo.
- **Redondeo a 2 decimales** con `q()` de `js/nucleo/dinero.js`.
- **Las fechas son texto `'YYYY-MM-DD'`** y se cuentan con `js/nucleo/fechas.js`; el "hoy" es el de Guatemala (`hoyISO`), nunca el de UTC.
- **Los nombres de los campos** salen del glosario §7b del diseño. Un dato nuevo se agrega ahí antes de escribirlo en código: tres veces un mismo dato quedó con dos nombres y cada una costó una vuelta de revisión.
- Todo el texto que ve el usuario va **en español**, sin tecnicismos.
- Los comentarios del código se escriben **en español**, explicando el porqué.
- Sin dependencias de npm, sin fotos, sin compilación.
- **Una lectura que falla nunca se dibuja como "no hay nada"** (`resultadoLectura`), y **un borrado solo se propaga dentro del alcance leído** (`idsQueSobran`).
- **El porcentaje de comisión y el costo del dueño no se muestran** en ninguna pantalla de este plan.
- ADR-001: nada de datos de tarjeta más allá de los últimos 4 dígitos.

## Lo que ya existe y se usa tal cual

- `js/nucleo/fechas.js` → `hoyISO`, `sumarDias`, `diasEntre`, `devolucionPrevista`, `diasAtraso`.
- `js/nucleo/contrato.js` → `resumen(c)`, `lineasSalida`, `lineasDevolucion`.
- `js/nucleo/estados.js` → `estadoContrato`, `pendientesDe`, `estadoCarro`.
- `js/nucleo/avisos.js` → `avisosDeSalida({cliente, carro, contrato, contratosDelCliente, contratosDelCarro, hoy})`. **Este plan le agrega las reservaciones.**
- `js/nucleo/busqueda.js`, `js/nucleo/cliente.js`, `js/nucleo/dinero.js`.
- `js/datos.js` → `cargarFlota`, `cargarClientes`, `cargarContratosAbiertos`, `cargarContratos`, `cargarContrato`, `guardarContrato`, `cargarAjustes`, `resultadoLectura`, `idsQueSobran`.
- `js/pantallas/flota.js`, `clientes.js`, `carros.js`, `contratos.js`, `sacarCarro.js`, `recibirCarro.js` — **léelos antes de escribir una pantalla nueva**; esta debe parecer del mismo sistema y no inventar CSS.
- `js/ui.js` → `dinero`, `fecha`, `aviso`. `js/router.js` → `registrarPantalla`, `emparejar`.

## Estructura de archivos

```
js/nucleo/
  reserva.js          armar una reservación, su estado, y los choques de fechas
  calendario.js       armar la cuadrícula del mes y contar lo de cada día
js/pantallas/
  reservas.js         lista, alta, edición, cambiar unidad, cancelar
  calendario.js       el mes y el detalle de un día
js/datos.js           + cargarReservas, guardarReserva
pruebas/
  reserva.test.mjs
  calendario.test.mjs
```

---

### Task 1: El núcleo de una reservación

**Files:**
- Create: `js/nucleo/reserva.js`
- Test: `pruebas/reserva.test.mjs`

**Interfaces:**
- Produces:
  - `construirReserva(existente, campos) -> reserva` — arrastra lo existente hacia adelante, como `construirCliente`.
  - `estadoReserva(r) -> 'pendiente' | 'entregada' | 'cancelada'`.
  - `seCruzan(a, b) -> boolean` — dos rangos `{fechaSalida, devolucionPrevista}`; **tocarse no es cruzarse** (un carro que regresa el 20 puede salir el 20).
  - `faltaAlgoEnReserva(r) -> string[]` — las etiquetas de lo que falta para poder guardar.
  - `textoAnticipo(r) -> string` — *"Anticipo Q500.00 pagado"*, *"Anticipo Q500.00 pendiente"* o *"Sin anticipo"*.
- Forma de una reserva: `{id, clienteId, clienteNombre, telefono, fechaSalida, dias, devolucionPrevista, tipoVehiculo, carroId, carroPlacas, precioDia, anticipo, anticipoPagado, nota, estado, contratoId, actualizado}`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/reserva.test.mjs`:

```js
// Pruebas de una reservación.
//
// Una reservación aparta un carro antes de que salga. Puede apartar un carro
// exacto ("el Montero blanco", cuando el cliente lo pide) o solo un tipo ("un
// microbús"), y cambiar de unidad es un clic: el dueño lo pidió así porque los
// planes cambian a última hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirReserva, estadoReserva, seCruzan, faltaAlgoEnReserva, textoAnticipo } from '../js/nucleo/reserva.js';

const campos = {
  clienteNombre: 'JONATÁN URIZAR', telefono: '3078-4155',
  fechaSalida: '2026-10-10', dias: 4,
  tipoVehiculo: 'MICROBÚS', precioDia: 600,
  anticipo: 500, anticipoPagado: true, nota: 'Llega a las 8',
};

test('la devolución prevista se calcula sola', () => {
  const r = construirReserva({}, campos);
  assert.equal(r.devolucionPrevista, '2026-10-14');
});

test('cambiar la unidad no pierde la reservación', () => {
  // Lo que él pidió: "me gustaría poder cambiar la unidad en dado caso cambie
  // el plan". Es la misma reservación; solo cambia qué carro la cumple.
  const original = construirReserva({}, { ...campos, carroId: 'v1', carroPlacas: 'P-111AAA' });
  const cambiada = construirReserva(original, { carroId: 'v2', carroPlacas: 'P-222BBB' });
  assert.equal(cambiada.carroId, 'v2');
  assert.equal(cambiada.carroPlacas, 'P-222BBB');
  assert.equal(cambiada.clienteNombre, 'JONATÁN URIZAR', 'el cliente sigue siendo el mismo');
  assert.equal(cambiada.anticipo, 500, 'y su anticipo también');
});

test('una reservación nace pendiente y termina entregada o cancelada', () => {
  const r = construirReserva({}, campos);
  assert.equal(estadoReserva(r), 'pendiente');
  assert.equal(estadoReserva({ ...r, contratoId: 'c9' }), 'entregada');
  assert.equal(estadoReserva({ ...r, cancelada: true }), 'cancelada');
  assert.equal(estadoReserva({ ...r, cancelada: true, contratoId: 'c9' }), 'entregada',
    'si ya se entregó, una cancelación tardía no la borra');
});

test('tocarse no es cruzarse', () => {
  // La misma regla que en los avisos de salida: un carro que regresa el 20
  // puede volver a salir el 20, y eso pasa a diario.
  const a = { fechaSalida: '2026-10-10', devolucionPrevista: '2026-10-14' };
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-14', devolucionPrevista: '2026-10-18' }), false);
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-06', devolucionPrevista: '2026-10-10' }), false);
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-13', devolucionPrevista: '2026-10-18' }), true);
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-12' }), true, 'una adentro de la otra');
  assert.equal(seCruzan(a, { fechaSalida: '2026-10-01', devolucionPrevista: '2026-10-30' }), true, 'una encima de la otra');
});

test('sin fechas o sin cliente no se puede guardar', () => {
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, campos)), []);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...campos, clienteNombre: '' })), ['Cliente']);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...campos, fechaSalida: '' })), ['Fecha de salida']);
  assert.deepEqual(faltaAlgoEnReserva(construirReserva({}, { ...campos, dias: 0 })), ['Días']);
});

test('el anticipo se dice en una línea', () => {
  assert.equal(textoAnticipo(construirReserva({}, campos)), 'Anticipo Q500.00 pagado');
  assert.equal(textoAnticipo(construirReserva({}, { ...campos, anticipoPagado: false })), 'Anticipo Q500.00 pendiente');
  assert.equal(textoAnticipo(construirReserva({}, { ...campos, anticipo: 0 })), 'Sin anticipo');
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/reserva.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/reserva.js`. `construirReserva` sigue el patrón ya probado (`{ ...existente, ...campos }`, montos por `q()`, `devolucionPrevista` recalculada con `devolucionPrevista()` de `fechas.js`). `seCruzan` usa comparación estricta, con el mismo comentario que `seEnciman` en `avisos.js`.

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 228 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/reserva.js pruebas/reserva.test.mjs
git commit -m "Nucleo de las reservaciones: apartar, cambiar de unidad y cruces de fechas"
```

---

### Task 2: Los choques — carro exacto y capacidad por tipo

**Files:**
- Modify: `js/nucleo/reserva.js`
- Test: `pruebas/reserva.test.mjs`

**Interfaces:**
- Produces: `choquesDeReserva({reserva, flota, reservas, contratos}) -> [{nivel, mensaje}]`, con `nivel` `'alto'` o `'medio'`, los altos primero — la misma forma que `avisosDeSalida`.

Esta es la parte que de verdad protege al negocio, y tiene dos casos distintos:

- **Reservación con carro exacto:** choca si ese carro tiene otra reservación o un contrato encima de esas fechas.
- **Reservación por tipo:** no hay un carro contra el cual chocar. Lo que importa es la **capacidad**: cuántos carros de ese tipo hay, contra cuántos ya están comprometidos esos días. Con dos microbuses y dos ya apartados, la tercera reservación tiene que avisar.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `pruebas/reserva.test.mjs`:

```js
import { choquesDeReserva } from '../js/nucleo/reserva.js';

const flota = [
  { id: 'v1', placas: 'P-111AAA', tipo: 'MICROBÚS' },
  { id: 'v2', placas: 'P-222BBB', tipo: 'MICROBÚS' },
  { id: 'v3', placas: 'P-333CCC', tipo: 'SEDÁN' },
];
const del10al14 = { fechaSalida: '2026-10-10', dias: 4, devolucionPrevista: '2026-10-14' };

test('un carro exacto ya apartado esas fechas avisa', () => {
  const reservas = [{ id: 'r1', carroId: 'v1', fechaSalida: '2026-10-12', devolucionPrevista: '2026-10-16' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, carroId: 'v1' }, flota, reservas, contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /apartad/i);
});

test('un carro exacto que ya salió rentado esas fechas avisa', () => {
  const contratos = [{ id: 'c1', carroId: 'v1', fechaSalida: '2026-10-09', devolucionPrevista: '2026-10-12', estado: 'rentado' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, carroId: 'v1' }, flota, reservas: [], contratos });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /rentado|contrato/i);
});

test('por tipo: mientras haya un carro libre, no se avisa', () => {
  // Dos microbuses, uno comprometido: todavía queda uno.
  const reservas = [{ id: 'r1', carroId: 'v1', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' }];
  assert.deepEqual(choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota, reservas, contratos: [] }), []);
});

test('por tipo: sin carros libres, avisa y dice cuántos hay', () => {
  const reservas = [
    { id: 'r1', carroId: 'v1', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' },
    { id: 'r2', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-09', devolucionPrevista: '2026-10-13' },
  ];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota, reservas, contratos: [] });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /2 MICROBÚS|dos/i, 'dice cuántos tiene');
});

test('una reservación cancelada o ya entregada no estorba', () => {
  const reservas = [
    { id: 'r1', carroId: 'v1', fechaSalida: '2026-10-12', devolucionPrevista: '2026-10-16', cancelada: true },
    { id: 'r2', carroId: 'v1', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15', contratoId: 'c5' },
  ];
  assert.deepEqual(choquesDeReserva({ reserva: { ...del10al14, carroId: 'v1' }, flota, reservas, contratos: [] }), []);
});

test('una reservación no choca consigo misma al editarla', () => {
  const reservas = [{ id: 'r1', carroId: 'v1', fechaSalida: '2026-10-10', devolucionPrevista: '2026-10-14' }];
  const misma = { id: 'r1', ...del10al14, carroId: 'v1' };
  assert.deepEqual(choquesDeReserva({ reserva: misma, flota, reservas, contratos: [] }), []);
});

test('un carro fuera de servicio no cuenta como disponible', () => {
  const flotaConTaller = [{ ...flota[0], fueraDeServicio: true }, flota[1], flota[2]];
  const reservas = [{ id: 'r1', carroId: 'v2', tipoVehiculo: 'MICROBÚS', fechaSalida: '2026-10-11', devolucionPrevista: '2026-10-15' }];
  const r = choquesDeReserva({ reserva: { ...del10al14, tipoVehiculo: 'MICROBÚS' }, flota: flotaConTaller, reservas, contratos: [] });
  assert.equal(r.length, 1, 'el del taller no salva la capacidad');
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `choquesDeReserva` no existe.

- [ ] **Step 3: Escribirlo**

Los contratos y reservaciones que cuentan son los vivos: una reservación cancelada o ya entregada no aparta nada, y un contrato cerrado tampoco. Un carro fuera de servicio no suma capacidad.

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 235 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/reserva.js pruebas/reserva.test.mjs
git commit -m "Choques de reserva: por carro exacto y por capacidad del tipo"
```

---

### Task 3: El calendario, en cálculo

**Files:**
- Create: `js/nucleo/calendario.js`
- Test: `pruebas/calendario.test.mjs`

**Interfaces:**
- Produces:
  - `diasDelMes(mes) -> ['2026-10-01', ...]` con `mes` `'YYYY-MM'`.
  - `cuadriculaDelMes(mes) -> [[fecha|null × 7], ...]` — semanas de lunes a domingo, con huecos al principio y al final.
  - `movimientosDelDia(fecha, {reservas, contratos}) -> {salen, regresan, yaRegresaron, atrasados}` — cada uno una lista, no solo un número, para que la pantalla no tenga que volver a filtrar. `regresan` es lo que vencía ese día y **todavía no vuelve**; `yaRegresaron` es lo que vencía ese día y ya entró (o el contrato está cerrado). Se parten porque el encabezado es una lista de pendientes — un carro que ya está parqueado no puede seguir contando como "regresa hoy" — mientras que el mes sí quiere ver el día completo.
  - `resumenDeHoy(hoy, {reservas, contratos}) -> {salen, regresan, atrasados, garantias}` — los cuatro números del encabezado.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/calendario.test.mjs` cubriendo: que un mes de 31 días trae 31 fechas; que la cuadrícula empieza en lunes y completa la última semana; que un contrato aparece en *regresan* el día de su devolución prevista y en *atrasados* si ya pasó y no ha regresado; que una reservación entregada o cancelada no aparece en *salen*; que `resumenDeHoy` cuenta las garantías por liberar con la misma regla de `pendientesDe` (solo si hay monto bloqueado).

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/calendario.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Sin tocar el DOM y sin `new Date()` para decidir "hoy": el `hoy` se recibe, como en `estadoCarro`.

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, con las pruebas del calendario en verde.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/calendario.js pruebas/calendario.test.mjs
git commit -m "Calendario en calculo: la cuadricula del mes y lo que pasa cada dia"
```

---

### Task 4: Guardar reservaciones

**Files:**
- Modify: `js/datos.js`, `firestore.rules`
- Test: `pruebas/reserva.test.mjs` (la parte pura que se agregue)

**Interfaces:**
- Produces: `cargarReservas(alLlegar)`, `guardarReserva(reserva)`, `cancelarReserva(reserva)`.

`cargarReservas` sigue a `cargarClientes` al pie de la letra: copia local primero, sincronía por detrás, `resultadoLectura` para no confundir "vacío" con "falló", y `idsQueSobran` para propagar los borrados. `guardarReserva` sella `actualizado` y reusa `reserva.id` cuando ya existe, como `guardarContrato`.

En `firestore.rules`, `reservas` se lee y escribe con sesión, como `clientes` y `vehiculos`. **El archivo completo se le entrega al dueño para que lo pegue en la consola** — él las publica a mano.

- [ ] **Step 1: Las tres funciones** — siguiendo los patrones existentes.
- [ ] **Step 2: La regla nueva** en `firestore.rules`.
- [ ] **Step 3: Correr las pruebas.**
- [ ] **Step 4: Commit**

```bash
git add js/datos.js firestore.rules pruebas/
git commit -m "Guardar reservaciones, con su regla de Firestore"
```

---

### Task 5: Pantalla de reservaciones

**Files:**
- Create: `js/pantallas/reservas.js`
- Modify: `js/app.js` (`#/reservas`, `#/reservas/nueva`, `#/reservas/:id`), `index.html` (entrada **Reservas** en el menú)

**Interfaces:**
- Consumes: `construirReserva`, `estadoReserva`, `choquesDeReserva`, `faltaAlgoEnReserva`, `textoAnticipo`; `cargarReservas`, `guardarReserva`, `cancelarReserva`, `cargarFlota`, `cargarContratosAbiertos`, `buscarClientes`; `filtrar` de `busqueda.js`.

- [ ] **Step 1: La lista** — las reservaciones pendientes primero, ordenadas por fecha de salida; las entregadas y canceladas detrás de un filtro. Cada renglón: cliente, qué se apartó (el carro o el tipo), fechas, y el anticipo con `textoAnticipo`.
- [ ] **Step 2: El formulario** — cliente (buscador o nombre y teléfono sueltos, porque muchas reservaciones llegan por teléfono de alguien que todavía no es cliente), fechas y días, **tipo de vehículo y, opcionalmente, el carro exacto**, precio por día, anticipo con su casilla de *ya pagó*, y una nota. Los choques de `choquesDeReserva` se muestran arriba del botón, los rojos primero, y **no bloquean**: el dueño decide.
- [ ] **Step 3: Cambiar la unidad** — en la ficha, un selector de carro que se puede cambiar en cualquier momento; al cambiarlo se recalculan los choques al instante.
- [ ] **Step 4: Cancelar** — con confirmación, dejando la reservación visible como *cancelada*, nunca borrándola.
- [ ] **Step 5: Verificar en el navegador** — crear una reservación por tipo y otra por carro exacto; provocar un choque y ver el aviso; cambiar la unidad y ver que el choque desaparece.
- [ ] **Step 6: Commit**

```bash
git add js/pantallas/reservas.js js/app.js index.html
git commit -m "Pantalla de reservaciones: apartar, cambiar unidad y cancelar"
```

---

### Task 6: El calendario en pantalla

**Files:**
- Create: `js/pantallas/calendario.js`
- Modify: `js/app.js` (`#/calendario`, `#/calendario/:fecha`), `index.html` (entrada **Calendario**)

- [ ] **Step 1: El mes** — cuadrícula de lunes a domingo. Cada día muestra dos números con su flecha: **↑ salen** y **↓ regresan**, y en rojo **⚠ atrasados** cuando los hay. El día de hoy va marcado. Botones para el mes anterior y el siguiente.
- [ ] **Step 2: El detalle de un día** — al darle clic a un día se abre debajo (sin salir de la pantalla): **Salen** con cliente, carro o tipo, días y `textoAnticipo`, y botón **Sacar carro**; **Regresan** con cliente, carro, y *"pendiente de pagar QX"* o *"ya pagó"*, y botón **Recibir carro**.
- [ ] **Step 3: Verificar en el navegador** — un mes con reservaciones y contratos sembrados: los números del día cuadran con el detalle, y los botones llevan a las pantallas correctas.
- [ ] **Step 4: Commit**

```bash
git add js/pantallas/calendario.js js/app.js index.html
git commit -m "Calendario del mes, con el detalle de cada dia"
```

---

### Task 7: El resumen del día al entrar

**Files:**
- Modify: `js/pantallas/flota.js`

- [ ] **Step 1: Los cuatro números** — arriba de la flota, `resumenDeHoy`: **hoy salen**, **hoy regresan**, **atrasados**, **garantías por liberar**. Un número en cero se ve apagado; los atrasados en rojo cuando los hay.
- [ ] **Step 2: Cada número lleva a su detalle** — salen y regresan al día de hoy en el calendario; atrasados y garantías a lo que ya existe en la misma pantalla.
- [ ] **Step 3: Nada de dinero** — el resumen son cuatro cuentas, no montos. Las dos listas de pendientes siguen como están.
- [ ] **Step 4: Verificar en el navegador.**
- [ ] **Step 5: Commit**

```bash
git add js/pantallas/flota.js
git commit -m "El resumen del dia al entrar: cuatro numeros y nada mas"
```

---

### Task 8: El aviso de carro comprometido mira las reservaciones

**Files:**
- Modify: `js/nucleo/avisos.js`, `js/pantallas/sacarCarro.js`
- Test: `pruebas/avisos.test.mjs`

Hoy `avisosDeSalida` solo mira contratos. Con reservaciones en el sistema, el carro que el dueño está por entregar puede estar apartado para otro cliente pasado mañana — y ahí es donde se pierde un cliente.

- [ ] **Step 1: La prueba** — `avisosDeSalida` recibe `reservasDelCarro` y avisa en rojo si alguna se cruza con las fechas del contrato que se está por hacer; una reservación cancelada o ya entregada no avisa; el aviso dice para quién está apartado y desde cuándo.
- [ ] **Step 2: Implementarlo**, reusando `seCruzan` de `reserva.js` en vez de una segunda versión de la misma regla.
- [ ] **Step 3: Pasárselo desde la pantalla** — `sacarCarro.js` carga las reservaciones y se las manda.
- [ ] **Step 4: Correr las pruebas.**
- [ ] **Step 5: Commit**

```bash
git add js/nucleo/avisos.js js/pantallas/sacarCarro.js pruebas/avisos.test.mjs
git commit -m "Avisar si el carro esta apartado para otro cliente"
```

---

### Task 9: Sacar el carro desde una reservación

**Files:**
- Modify: `js/pantallas/sacarCarro.js`, `js/pantallas/reservas.js`, `js/pantallas/calendario.js`

- [ ] **Step 1: Entrar con la reservación** — `#/sacar/:carroId?reserva=:reservaId` abre el formulario **ya lleno** con lo que la reservación sabe: cliente, fechas, días, precio por día y el carro (o, si era por tipo, con el tipo elegido y el carro por escoger).
- [ ] **Step 2: El anticipo entra como pago** — si la reservación tenía anticipo **pagado**, se registra como un pago ya hecho de la salida, con su fecha. Si estaba **pendiente**, se deja cargado en el monto a cobrar. Los dos casos se prueban.
- [ ] **Step 3: La reservación queda entregada** — al guardar el contrato, se marca con `contratoId`, y deja de estorbar en los choques y de aparecer en *salen*.
- [ ] **Step 4: Verificar en el navegador** — sacar un carro desde una reservación con anticipo pagado y comprobar que el total a cobrar ya lo descuenta; verificar que la reservación queda entregada y el contrato guardado con el pago.
- [ ] **Step 5: Commit**

```bash
git add js/pantallas/
git commit -m "Sacar el carro desde una reservacion, con su anticipo"
```

---

### Task 10: Publicar

**Files:**
- Modify: `version.txt`, `js/version.js`, `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`

- [ ] **Step 1: Subir la versión** en los dos archivos, que tienen que coincidir exactamente.
- [ ] **Step 2: Agregar al glosario (§7b)** los campos de una reservación, para que la próxima pantalla no invente nombres.
- [ ] **Step 3: `npm test`** — todo en verde.
- [ ] **Step 4: Commit**

```bash
git add version.txt js/version.js docs/
git commit -m "Version nueva: reservaciones y calendario"
```

---

## Al terminar el plan

1. `npm test` en verde.
2. Revisión final de la rama con el modelo más capaz, apuntándola al ledger. **Incluir expresamente los tres arreglos del 26-27 de septiembre** (cobro claro, anular pagos, sincronizar los borrados): se verificaron a mano porque cuatro agentes se cayeron seguidos, y nunca pasaron por una revisión independiente.
3. Entregarle al dueño: qué commits faltan subir y el `firestore.rules` nuevo para pegar en la consola.
4. Siguiente plan: **impresión** del contrato sobre su formulario preimpreso.
