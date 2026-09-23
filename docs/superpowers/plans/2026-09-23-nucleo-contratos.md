# Núcleo de contratos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llegar del login a un contrato guardado: flota en pantalla, cliente buscado o creado, carro sacado, contrato calculado y grabado, con el motor de cobro y comisión cubierto por pruebas.

**Architecture:** Página web estática (HTML + módulos ES, sin compilación) servida por GitHub Pages, con Firebase Auth y Firestore. Toda la aritmética de dinero vive en módulos puros bajo `js/nucleo/`, sin tocar el DOM ni la red, para poder probarla con `node --test`. Las pantallas (`js/pantallas/`) solo leen datos y llaman a esos módulos.

**Tech Stack:** JavaScript con módulos ES nativos, Firebase 12 (Auth + Firestore) por CDN, `node --test` para las pruebas (sin dependencias), IndexedDB para la copia local.

**Spec:** `docs/superpowers/specs/2026-09-23-sistema-contratos-best-price-design.md`

## Global Constraints

- **Nunca ajustar una cifra para que cuadre.** Si un número no da, se arregla la causa.
- **Redondeo a 2 decimales** en todo monto que se muestre o se guarde, con `q()` de `js/nucleo/dinero.js`. Nada de `toFixed` suelto por ahí.
- **El precio por día ya incluye** seguro y seguro de terceros: nunca se suman aparte.
- **Sin dependencias de npm** en el código que se publica. Las pruebas usan solo `node:test` y `node:assert`.
- **No se guarda el número completo de tarjeta ni el CBC** (ADR-001): solo últimos 4 dígitos, vencimiento, banco, autorización y monto autorizado.
- **Sin fotos ni archivos pesados** en la base de datos.
- Todo el texto que ve el usuario va **en español**, sin tecnicismos.
- Los comentarios del código se escriben **en español**, explicando el porqué, no el qué.
- Objetivos de velocidad: pantalla principal en menos de 1 segundo, buscador respondiendo en menos de 100 ms.

## Cómo se buscan los errores

- Después de cada tarea: `npm test` (corre todo `pruebas/`). Ninguna tarea se da por terminada con una prueba roja.
- Al cerrar cada tarea, se manda el cambio a revisión con un agente de ruflo (`code-analyzer` para el código, `tester` para los huecos de prueba) y se atienden los hallazgos antes de seguir.
- Al terminar el plan, `production-validator` revisa que no queden pedazos a medias antes de publicar.
- El ejemplo de la §5 del diseño (los Q4,345.60) es la prueba que manda: si alguna vez deja de dar ese número, algo se rompió.

## Estructura de archivos

```
index.html                  pantalla de entrada y cascarón de la app
css/estilos.css             estilos, colores de la marca
version.txt                 versión publicada (para el aviso de actualizar)
firestore.rules             reglas que el dueño pega en la consola de Firebase
js/
  app.js                    arranque: sesión, rutas, primera pantalla
  firebase-config.js        conexión a Firebase
  auth.js                   entrar y salir
  router.js                 qué pantalla se muestra
  ui.js                     avisos, formato de dinero y fechas, ayudas de pantalla
  version.js                aviso de versión nueva
  datos.js                  leer y escribir en Firestore + copia local
  cache.js                  copia local en IndexedDB
  nucleo/
    dinero.js               redondeo y sumas de dinero
    fechas.js               días, devolución prevista, atraso
    contrato.js             el cobro: líneas, subtotal, saldo, utilidad
    comision.js             base y monto de la comisión
    estados.js              estado del contrato y del carro
    busqueda.js             búsqueda sin acentos
    avisos.js               las alertas del formulario de salida
  pantallas/
    flota.js                pantalla principal
    sacarCarro.js           formulario de salida
pruebas/
  dinero.test.mjs
  fechas.test.mjs
  contrato.test.mjs
  comision.test.mjs
  estados.test.mjs
  busqueda.test.mjs
  avisos.test.mjs
  cache.test.mjs
```

---

### Task 1: Esqueleto del proyecto y motor de dinero

**Files:**
- Create: `package.json`
- Create: `js/nucleo/dinero.js`
- Test: `pruebas/dinero.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `q(n) -> number`, `suma(...montos) -> number`, `conTarjeta(monto, porcentaje) -> number`, `recargoTarjeta(monto, porcentaje) -> number`. Todos devuelven números redondeados a 2 decimales; una entrada vacía, nula o no numérica vale 0.

- [ ] **Step 1: Crear el package.json**

```json
{
  "name": "bestprice-contratos",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test 'pruebas/**/*.test.mjs'"
  }
}
```

- [ ] **Step 2: Escribir la prueba que falla**

Crear `pruebas/dinero.test.mjs`:

```js
// Pruebas del manejo de dinero.
// Correr con:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { q, suma, conTarjeta, recargoTarjeta } from '../js/nucleo/dinero.js';

test('redondea a dos decimales', () => {
  assert.equal(q(3.005), 3.01);
  assert.equal(q(1234.567), 1234.57);
  assert.equal(q(700), 700);
});

test('el medio centavo sube, sin importar el tamaño del monto', () => {
  assert.equal(q(5.015), 5.02);
  assert.equal(q(1234.565), 1234.57);
  assert.equal(q(0.615), 0.62);
});

test('un monto negativo se redondea igual que su positivo', () => {
  assert.equal(q(-3.005), -3.01);
  assert.equal(q(-5.015), -5.02);
  assert.ok(Object.is(q(-0.001), 0), 'no queda un menos cero suelto');
});

test('lo vacío vale cero, no rompe la cuenta', () => {
  assert.equal(q(undefined), 0);
  assert.equal(q(null), 0);
  assert.equal(q(''), 0);
  assert.equal(q('abc'), 0);
  assert.equal(q('350'), 350);
});

test('suma sin arrastrar errores de centavos', () => {
  assert.equal(suma(0.1, 0.2), 0.3);
  assert.equal(suma(2800, 350, 200, 130), 3480);
  assert.equal(suma(700, undefined, null, '130'), 830);
});

test('el recargo de tarjeta del ejemplo del diseño', () => {
  assert.equal(conTarjeta(3150, 12), 3528);
  assert.equal(conTarjeta(730, 12), 817.6);
  assert.equal(recargoTarjeta(3150, 12), 378);
  assert.equal(recargoTarjeta(730, 12), 87.6);
});

test('sin porcentaje, el monto no cambia', () => {
  assert.equal(conTarjeta(3150, 0), 3150);
  assert.equal(conTarjeta(3150, undefined), 3150);
  assert.equal(recargoTarjeta(3150, 0), 0);
});
```

- [ ] **Step 3: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/dinero.js` todavía no existe.

> Nota: en Node 24 `node --test pruebas/` ya no acepta una carpeta suelta; por eso el script usa el patrón `pruebas/**/*.test.mjs`.

- [ ] **Step 4: Escribir el módulo**

Crear `js/nucleo/dinero.js`:

```js
// Todo el dinero del sistema pasa por aquí.
//
// Las computadoras no guardan bien los decimales: 0.1 + 0.2 da 0.30000000000000004.
// Un centavo perdido por contrato no se nota, pero al final del mes el reporte no
// cuadra con la caja y nadie sabe por qué. Por eso cada monto se redondea a dos
// decimales en el momento en que se calcula, no al mostrarlo.

/** Redondea a dos decimales. Lo vacío o lo que no sea número vale cero. */
export function q(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  // Se corre el punto con el texto decimal del número ('5.015' -> '5.015e2')
  // en vez de multiplicar por 100: multiplicar arrastra el error binario y hace
  // que 5.015 se redondee para abajo. Se redondea el valor absoluto para que un
  // negativo caiga del mismo lado que su positivo.
  const escalado = Number(`${Math.abs(x)}e2`);
  if (!Number.isFinite(escalado)) return Math.round(x * 100) / 100;
  const redondeado = Math.round(escalado) / 100;
  return x < 0 ? -redondeado : redondeado;
}

/** Suma montos redondeando el resultado. */
export function suma(...montos) {
  return q(montos.reduce((total, m) => total + q(m), 0));
}

/** El monto con el porcentaje de tarjeta encima (12 significa 12 %). */
export function conTarjeta(monto, porcentaje) {
  return q(q(monto) * (1 + q(porcentaje) / 100));
}

/** Solo el recargo: lo que se le suma al cliente por pagar con tarjeta. */
export function recargoTarjeta(monto, porcentaje) {
  return q(conTarjeta(monto, porcentaje) - q(monto));
}
```

- [ ] **Step 5: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 7 pruebas.

- [ ] **Step 6: Commit**

```bash
git add package.json js/nucleo/dinero.js pruebas/dinero.test.mjs
git commit -m "Motor de dinero: redondeo, sumas y recargo de tarjeta"
```

---

### Task 2: Fechas y días

**Files:**
- Create: `js/nucleo/fechas.js`
- Test: `pruebas/fechas.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `sumarDias(iso, dias) -> 'YYYY-MM-DD'`, `diasEntre(desde, hasta) -> number` (puede ser negativo), `devolucionPrevista(fechaSalida, dias) -> 'YYYY-MM-DD'`, `diasAtraso(prevista, fechaReal) -> number` (nunca negativo), `hoyISO() -> 'YYYY-MM-DD'`. Todas las fechas son textos `'YYYY-MM-DD'`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/fechas.test.mjs`:

```js
// Pruebas de fechas y días.
//
// Las fechas se manejan como texto 'YYYY-MM-DD' y se cuentan en UTC a propósito:
// si se usara la hora local, un contrato que sale a las 3 de la tarde en
// Guatemala podía contar un día de más o de menos según el horario de verano de
// otro país. Un día de diferencia son Q700.
process.env.TZ = 'America/Guatemala';

import test from 'node:test';
import assert from 'node:assert/strict';
import { sumarDias, diasEntre, devolucionPrevista, diasAtraso, hoyISO } from '../js/nucleo/fechas.js';

test('suma días cruzando fin de mes y fin de año', () => {
  assert.equal(sumarDias('2026-08-20', 5), '2026-08-25');
  assert.equal(sumarDias('2026-08-30', 3), '2026-09-02');
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
});

test('cuenta días entre fechas, incluso en año bisiesto', () => {
  assert.equal(diasEntre('2026-08-20', '2026-08-25'), 5);
  assert.equal(diasEntre('2028-02-28', '2028-03-01'), 2);
  assert.equal(diasEntre('2026-08-25', '2026-08-20'), -5);
});

test('la devolución prevista es la salida más los días', () => {
  assert.equal(devolucionPrevista('2026-08-20', 4), '2026-08-24');
  assert.equal(devolucionPrevista('2026-08-20', 0), '2026-08-20');
});

test('el atraso nunca es negativo', () => {
  assert.equal(diasAtraso('2026-08-24', '2026-08-25'), 1);
  assert.equal(diasAtraso('2026-08-24', '2026-08-24'), 0);
  assert.equal(diasAtraso('2026-08-24', '2026-08-22'), 0, 'devolver antes no da crédito');
});

test('sin fecha real todavía no hay atraso que cobrar', () => {
  assert.equal(diasAtraso('2026-08-24', ''), 0);
  assert.equal(diasAtraso('2026-08-24', undefined), 0);
});

test('hoy es el día del calendario de aquí, no el de Londres', () => {
  // Las ocho de la noche del 22 de septiembre en Guatemala ya son las dos de la
  // madrugada del 23 en UTC. En el mostrador todavía es 22.
  assert.equal(hoyISO(new Date('2026-09-23T02:00:00Z')), '2026-09-22');
  assert.equal(hoyISO(new Date('2026-09-22T18:00:00Z')), '2026-09-22');
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/fechas.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/fechas.js`:

```js
// Fechas del contrato, en texto 'YYYY-MM-DD' y contadas en UTC.
//
// Se cuenta en UTC para que el resultado no dependa de la zona horaria ni del
// horario de verano: un día de diferencia en la devolución vale el precio de un
// día de renta.

const MS_DIA = 24 * 60 * 60 * 1000;

function aUTC(iso) {
  if (typeof iso !== 'string') return NaN;
  const [anio, mes, dia] = iso.split('-').map(Number);
  if (!anio || !mes || !dia) return NaN;
  return Date.UTC(anio, mes - 1, dia);
}

function aISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * La fecha de hoy, en texto, según el calendario de aquí.
 *
 * No se usa `toISOString()` a propósito: eso da el día de UTC, y Guatemala va
 * seis horas atrás. De seis de la tarde a medianoche, un carro que regresa hoy
 * quedaría registrado mañana — y un día de más es un día de renta de más.
 */
export function hoyISO(momento = new Date()) {
  const mes = String(momento.getMonth() + 1).padStart(2, '0');
  const dia = String(momento.getDate()).padStart(2, '0');
  return `${momento.getFullYear()}-${mes}-${dia}`;
}

/** Una fecha más (o menos) días. */
export function sumarDias(iso, dias) {
  const base = aUTC(iso);
  if (Number.isNaN(base)) return '';
  return aISO(base + Math.trunc(Number(dias) || 0) * MS_DIA);
}

/** Días completos entre dos fechas. Negativo si la segunda es anterior. */
export function diasEntre(desde, hasta) {
  const a = aUTC(desde);
  const b = aUTC(hasta);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

/** Cuándo debería regresar el carro. */
export function devolucionPrevista(fechaSalida, dias) {
  return sumarDias(fechaSalida, dias);
}

/** Días de atraso. Devolver antes de tiempo no descuenta nada. */
export function diasAtraso(prevista, fechaReal) {
  if (!prevista || !fechaReal) return 0;
  return Math.max(0, diasEntre(prevista, fechaReal));
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 13 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/fechas.js pruebas/fechas.test.mjs
git commit -m "Fechas del contrato: devolucion prevista y dias de atraso"
```

---

### Task 3: El motor de cobro

**Files:**
- Create: `js/nucleo/contrato.js`
- Test: `pruebas/contrato.test.mjs`

**Interfaces:**
- Consumes: `q`, `suma`, `conTarjeta`, `recargoTarjeta` de `dinero.js`; `devolucionPrevista`, `diasAtraso` de `fechas.js`.
- Produces:
  - `atrasoDe(c) -> number` — los días de atraso, 0 si todavía no regresa.
  - `lineasSalida(c) -> [{concepto, detalle, monto}]` — lo que se cobra al salir.
  - `lineasDevolucion(c) -> [{concepto, detalle, monto}]` — lo que se cobra al recibir; el descuento va con monto negativo.
  - `resumen(c) -> {diasAtraso, totalSalida, totalDevolucion, subtotal, pagado, saldo, totalCobrado, costoSubarriendo, utilidad}`. El `saldo` va **sin** recargo de tarjeta: el recargo se conoce hasta saber cómo va a pagar.
  - `saldoConTarjeta(c, porcentaje) -> {saldo, recargo, total}` — lo que hay que cobrarle si ese saldo lo paga con tarjeta.
  - Forma del contrato `c`: `{dias, precioDia, seguroMenoresDia, seguroPaiDia, deducibleBajo, cartaPoderPrecio, variosPrecio, devolucionPrevista, subarriendo: {costoDia}, cierre: {fechaReal, danos, combustible, descuento}, pagos: [{monto, porcentajeTarjeta}]}`. Todo campo ausente vale 0.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/contrato.test.mjs`:

```js
// Pruebas del cobro de un contrato.
//
// La prueba que manda es "el ejemplo del diseño": 4 días a Q700, devuelto un día
// tarde, con carta poder, daños, combustible, descuento y 12 % de tarjeta. Tiene
// que dar Q4,345.60. Si algún día deja de dar ese número, algo se rompió.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineasSalida, lineasDevolucion, resumen, saldoConTarjeta } from '../js/nucleo/contrato.js';

/** El contrato del ejemplo de la §5 del diseño, ya cobrado por completo. */
const ejemplo = () => ({
  dias: 4,
  precioDia: 700,
  seguroMenoresDia: 0,
  seguroPaiDia: 0,
  deducibleBajo: 0,
  cartaPoderPrecio: 350,
  variosPrecio: 0,
  devolucionPrevista: '2026-08-24',
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
  pagos: [
    { monto: 3150, porcentajeTarjeta: 12 },   // al salir: renta y carta poder
    { monto: 730, porcentajeTarjeta: 12 },    // al devolver: atraso, daños, combustible, menos descuento
  ],
});

test('al salir se cobra la renta, la carta poder y los varios', () => {
  const lineas = lineasSalida(ejemplo());
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [
    ['Renta', 2800],
    ['Carta poder', 350],
  ]);
});

test('los seguros por día se cobran por los días contratados', () => {
  const c = { ...ejemplo(), seguroMenoresDia: 50, seguroPaiDia: 25, deducibleBajo: 400 };
  const lineas = lineasSalida(c);
  const extra = lineas.find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 700, '(50 + 25) × 4 días + 400 de deducible bajo');
});

test('en la devolución se cobran los seguros por día de los días de atraso', () => {
  const c = { ...ejemplo(), seguroMenoresDia: 50, seguroPaiDia: 25, deducibleBajo: 400 };
  const extra = lineasDevolucion(c).find((l) => l.concepto === 'Seguros extra');
  assert.equal(extra.monto, 75, '(50 + 25) × 1 día de atraso, sin repetir el deducible bajo');
});

test('en la devolución se cobra el atraso, los daños y el combustible, menos el descuento', () => {
  const lineas = lineasDevolucion(ejemplo());
  assert.deepEqual(lineas.map((l) => [l.concepto, l.monto]), [
    ['Cobro días de atraso', 700],
    ['Daños', 200],
    ['Combustible', 130],
    ['Descuento', -300],
  ]);
});

test('el ejemplo del diseño da Q4,345.60', () => {
  const r = resumen(ejemplo());
  assert.equal(r.diasAtraso, 1);
  assert.equal(r.totalSalida, 3150, 'renta más carta poder');
  assert.equal(r.totalDevolucion, 730, 'atraso más daños más combustible menos descuento');
  assert.equal(r.subtotal, 3880, 'lo mismo que daría la hoja CONTRATOS del Excel');
  assert.equal(r.pagado, 4345.6, 'los dos pagos, cada uno con su 12 %');
  assert.equal(r.saldo, 0, 'ya no debe nada');
  assert.equal(r.totalCobrado, 4345.6);
});

test('mientras no paga la devolución, se ve lo que falta y lo que costaría con tarjeta', () => {
  const c = { ...ejemplo(), pagos: [{ monto: 3150, porcentajeTarjeta: 12 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3528, 'lo que pagó al salir, con su 12 %');
  assert.equal(r.saldo, 730, 'el saldo se ve sin recargo: todavía no se sabe cómo va a pagar');
  assert.deepEqual(saldoConTarjeta(c, 12), { saldo: 730, recargo: 87.6, total: 817.6 });
  assert.deepEqual(saldoConTarjeta(c, 0), { saldo: 730, recargo: 0, total: 730 });
});

test('sin devolución todavía, solo se debe lo de la salida', () => {
  const c = { ...ejemplo(), cierre: null, pagos: [] };
  const r = resumen(c);
  assert.equal(r.diasAtraso, 0);
  assert.equal(r.totalDevolucion, 0);
  assert.equal(r.saldo, 3150, 'la renta y la carta poder');
  assert.equal(r.totalCobrado, 0);
});

test('lo que se paga en efectivo no lleva recargo', () => {
  const c = { ...ejemplo(), pagos: [{ monto: 3150, porcentajeTarjeta: 0 }, { monto: 730, porcentajeTarjeta: 0 }] };
  const r = resumen(c);
  assert.equal(r.pagado, 3880, 'el subtotal pelado, sin un centavo de recargo');
  assert.equal(r.saldo, 0);
});

test('un carro ajeno deja utilidad después de pagarle al dueño', () => {
  const c = { ...ejemplo(), subarriendo: { costoDia: 400 } };
  const r = resumen(c);
  assert.equal(r.costoSubarriendo, 2000, 'Q400 × (4 días + 1 de atraso)');
  assert.equal(r.utilidad, 2345.6, 'Q4,345.60 cobrados menos Q2,000 del dueño');
});

test('un carro propio no tiene costo de subarriendo', () => {
  const r = resumen(ejemplo());
  assert.equal(r.costoSubarriendo, 0);
  assert.equal(r.utilidad, 4345.6);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/contrato.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/contrato.js`:

```js
// El cobro de un contrato, de principio a fin.
//
// El cobro sucede en dos momentos, como en el mostrador: al salir el carro se
// cobra todo lo que ya se sabe (renta, seguros por día de los días contratados,
// deducible bajo, carta poder, varios) y al recibirlo solo lo que apareció
// después (atraso, seguros por día de esos días, daños, combustible, descuento).
//
// El porcentaje de tarjeta se aplica a CADA pago, no una sola vez al final:
// el cliente puede pagar la renta con tarjeta y el saldo en efectivo, y solo lo
// que se pagó con tarjeta lleva recargo. Cuando todo se paga con tarjeta, el
// total coincide con el de la hoja CONTRATOS del Excel.
import { q, suma, conTarjeta, recargoTarjeta } from './dinero.js';
import { diasAtraso as calcularAtraso } from './fechas.js';

/** Los días de atraso de un contrato, 0 si todavía no ha regresado. */
export function atrasoDe(c) {
  return calcularAtraso(c?.devolucionPrevista, c?.cierre?.fechaReal);
}

/** Lo que se cobra al salir el carro. */
export function lineasSalida(c) {
  const dias = q(c?.dias);
  const precio = q(c?.precioDia);
  const lineas = [];

  if (dias && precio) {
    lineas.push({ concepto: 'Renta', detalle: `${dias} días × Q${precio}`, monto: q(dias * precio) });
  }

  const porDia = suma(c?.seguroMenoresDia, c?.seguroPaiDia);
  const extra = suma(porDia * dias, c?.deducibleBajo);
  if (extra) {
    lineas.push({ concepto: 'Seguros extra', detalle: 'menores, PAI, deducible bajo', monto: extra });
  }

  if (q(c?.cartaPoderPrecio)) {
    lineas.push({ concepto: 'Carta poder', detalle: c?.cartaPoderDestino || '', monto: q(c.cartaPoderPrecio) });
  }
  if (q(c?.variosPrecio)) {
    lineas.push({ concepto: 'Varios', detalle: c?.variosDescripcion || '', monto: q(c.variosPrecio) });
  }
  return lineas;
}

/** Lo que se cobra al recibir el carro. El descuento va en negativo. */
export function lineasDevolucion(c) {
  if (!c?.cierre) return [];
  const atraso = atrasoDe(c);
  const precio = q(c?.precioDia);
  const lineas = [];

  if (atraso) {
    lineas.push({ concepto: 'Cobro días de atraso', detalle: `${atraso} × Q${precio}`, monto: q(atraso * precio) });
  }

  const porDia = suma(c?.seguroMenoresDia, c?.seguroPaiDia);
  const extraAtraso = q(porDia * atraso);
  if (extraAtraso) {
    lineas.push({ concepto: 'Seguros extra', detalle: `por ${atraso} día(s) de atraso`, monto: extraAtraso });
  }

  if (q(c.cierre.danos)) lineas.push({ concepto: 'Daños', detalle: c.cierre.danosDetalle || '', monto: q(c.cierre.danos) });
  if (q(c.cierre.combustible)) lineas.push({ concepto: 'Combustible', detalle: '', monto: q(c.cierre.combustible) });
  if (q(c.cierre.descuento)) lineas.push({ concepto: 'Descuento', detalle: '', monto: q(-c.cierre.descuento) });

  return lineas;
}

const sumarLineas = (lineas) => suma(...lineas.map((l) => l.monto));

/** Todo el dinero del contrato en un solo vistazo. */
export function resumen(c) {
  const totalSalida = sumarLineas(lineasSalida(c));
  const totalDevolucion = sumarLineas(lineasDevolucion(c));
  const subtotal = suma(totalSalida, totalDevolucion);

  const pagos = Array.isArray(c?.pagos) ? c.pagos : [];
  const pagado = suma(...pagos.map((p) => conTarjeta(p.monto, p.porcentajeTarjeta)));
  const cubierto = suma(...pagos.map((p) => q(p.monto)));

  // El saldo se muestra sin recargo mientras no se sepa cómo lo va a pagar; el
  // recargo se le suma en el momento de recibir el pago con tarjeta.
  const saldo = q(Math.max(0, subtotal - cubierto));

  const atraso = atrasoDe(c);
  const costoDia = q(c?.subarriendo?.costoDia);
  const costoSubarriendo = q(costoDia * (q(c?.dias) + atraso));

  return {
    diasAtraso: atraso,
    totalSalida,
    totalDevolucion,
    subtotal,
    pagado,
    saldo,
    totalCobrado: pagado,
    costoSubarriendo,
    utilidad: q(pagado - costoSubarriendo),
  };
}

/** Cuánto hay que cobrarle si paga ese saldo con tarjeta. */
export function saldoConTarjeta(c, porcentaje) {
  const { saldo } = resumen(c);
  return { saldo, recargo: recargoTarjeta(saldo, porcentaje), total: conTarjeta(saldo, porcentaje) };
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 23 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/contrato.js pruebas/contrato.test.mjs
git commit -m "Motor de cobro del contrato, con el ejemplo del diseño como prueba"
```

---

### Task 4: La comisión del empleado

**Files:**
- Create: `js/nucleo/comision.js`
- Test: `pruebas/comision.test.mjs`

**Interfaces:**
- Consumes: `q` de `dinero.js`; `atrasoDe` de `contrato.js`.
- Produces: `baseComision(c) -> number`, `comisionDe(c) -> {base, porcentaje, monto, firme}`. `firme` es `true` solo cuando el carro ya regresó. El porcentaje sale de `c.porcentajeComision`, que el contrato guarda el día que se hace.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/comision.test.mjs`:

```js
// Pruebas de la comisión del empleado.
//
// La regla, dicha por el dueño: 5 % de los días rentados por el precio por día,
// contando los días de atraso y restando el descuento. Nada más entra: ni daños,
// ni combustible, ni carta poder, ni el recargo de tarjeta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseComision, comisionDe } from '../js/nucleo/comision.js';

const base = () => ({
  dias: 4,
  precioDia: 700,
  porcentajeComision: 5,
  devolucionPrevista: '2026-08-24',
  cartaPoderPrecio: 350,
  cierre: { fechaReal: '2026-08-25', danos: 200, combustible: 130, descuento: 300 },
});

test('el ejemplo que dio el dueño: 4 días a Q600 dan Q120', () => {
  const c = { dias: 4, precioDia: 600, porcentajeComision: 5 };
  assert.equal(baseComision(c), 2400);
  assert.equal(comisionDe(c).monto, 120);
});

test('el precio por día va completo, con los seguros adentro', () => {
  const c = { dias: 4, precioDia: 700, seguroDia: 72, seguroTercerosDia: 120, porcentajeComision: 5 };
  assert.equal(baseComision(c), 2800, 'no se descuentan los Q192 de seguros');
  assert.equal(comisionDe(c).monto, 140);
});

test('los días de atraso suman a la comisión', () => {
  const c = { ...base(), cierre: { fechaReal: '2026-08-25', descuento: 0 } };
  assert.equal(baseComision(c), 3500, '5 días × Q700');
  assert.equal(comisionDe(c).monto, 175);
});

test('el descuento le baja la comisión', () => {
  assert.equal(baseComision(base()), 3200, '5 días × Q700 − Q300 de descuento');
  assert.equal(comisionDe(base()).monto, 160);
});

test('no entran daños, combustible, carta poder ni recargo de tarjeta', () => {
  const con = { ...base(), cierre: { ...base().cierre, danos: 5000, combustible: 900 } };
  assert.equal(baseComision(con), 3200, 'los Q5,900 extra no mueven la comisión');
});

test('cada empleado puede tener su porcentaje', () => {
  assert.equal(comisionDe({ ...base(), porcentajeComision: 7 }).monto, 224);
  assert.equal(comisionDe({ ...base(), porcentajeComision: 0 }).monto, 0);
});

test('un descuento mayor que la renta no genera comisión negativa', () => {
  const c = { dias: 1, precioDia: 300, porcentajeComision: 5, cierre: { fechaReal: '2026-08-21', descuento: 500 } };
  assert.equal(baseComision(c), 0);
  assert.equal(comisionDe(c).monto, 0);
});

test('la comisión queda firme hasta que el carro regresa', () => {
  const rentado = { ...base(), cierre: null };
  assert.equal(comisionDe(rentado).firme, false);
  assert.equal(comisionDe(rentado).monto, 140, 'se estima con los días contratados');
  assert.equal(comisionDe(base()).firme, true);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/comision.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/comision.js`:

```js
// La comisión del empleado que rentó el carro.
//
// Regla del dueño, confirmada el 23 de septiembre de 2026:
//   comisión = porcentaje × [(días contratados + días de atraso) × precio por día − descuento]
//
// El precio por día va COMPLETO: ya lleva el seguro y el seguro de terceros
// adentro, y esos solo se desglosan en el contrato impreso. No entran daños,
// combustible, carta poder, seguros extra, varios ni el recargo de tarjeta.
//
// El porcentaje se guarda en el contrato el día que se hace, para que subirle el
// porcentaje a un empleado no mueva las comisiones de meses ya pagados.
import { q } from './dinero.js';
import { atrasoDe } from './contrato.js';

/** Sobre cuánto se calcula la comisión. Nunca menos de cero. */
export function baseComision(c) {
  const dias = q(c?.dias) + atrasoDe(c);
  const renta = q(dias * q(c?.precioDia));
  const descuento = q(c?.cierre?.descuento);
  return q(Math.max(0, renta - descuento));
}

/**
 * La comisión del contrato.
 *
 * Mientras el carro no regresa se puede ver una estimación con los días
 * contratados, pero `firme: false` avisa que todavía puede cambiar: un día de
 * atraso la sube y un descuento la baja. Solo las firmes se pagan.
 */
export function comisionDe(c) {
  const base = baseComision(c);
  const porcentaje = q(c?.porcentajeComision);
  return {
    base,
    porcentaje,
    monto: q(base * porcentaje / 100),
    firme: Boolean(c?.cierre?.fechaReal),
  };
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 31 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/comision.js pruebas/comision.test.mjs
git commit -m "Comision del empleado: 5 por ciento configurable, con atraso y descuento"
```

---

### Task 5: Estados del contrato y del carro

**Files:**
- Create: `js/nucleo/estados.js`
- Test: `pruebas/estados.test.mjs`

**Interfaces:**
- Consumes: `resumen` de `contrato.js`; `diasAtraso` de `fechas.js`.
- Produces: `estadoContrato(c) -> 'rentado' | 'devuelto' | 'cerrado'`, `puedeCerrar(c) -> boolean`, `pendientesDe(c) -> {saldo, garantia}`, `estadoCarro(carro, contratos, hoy) -> {estado, contrato, diasAtraso}` con estado `'disponible' | 'rentado' | 'atrasado' | 'fuera de servicio'`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/estados.test.mjs`:

```js
// Pruebas de los estados.
//
// La regla que más importa: el carro se libera cuando REGRESA, no cuando se
// cierra el contrato. El dueño puede tardar días en liberar la garantía —
// sobre todo si hubo daños y está esperando que le paguen — y mientras tanto
// ese carro tiene que poder volver a salir rentado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoContrato, puedeCerrar, pendientesDe, estadoCarro } from '../js/nucleo/estados.js';

const rentado = {
  id: 'c1', carroId: 'v1', dias: 4, precioDia: 700,
  devolucionPrevista: '2026-08-24',
  pagos: [{ monto: 2800, porcentajeTarjeta: 0 }],
};
const devuelto = {
  ...rentado,
  cierre: { fechaReal: '2026-08-25', danos: 200, descuento: 0 },
  garantiaLiberada: false,
};
const cerrado = {
  ...devuelto,
  pagos: [{ monto: 2800, porcentajeTarjeta: 0 }, { monto: 900, porcentajeTarjeta: 0 }],
  garantiaLiberada: true,
};

test('los tres estados del contrato', () => {
  assert.equal(estadoContrato(rentado), 'rentado');
  assert.equal(estadoContrato(devuelto), 'devuelto');
  assert.equal(estadoContrato(cerrado), 'cerrado');
});

test('no se cierra un contrato con saldo pendiente', () => {
  assert.equal(puedeCerrar(devuelto), false);
  assert.deepEqual(pendientesDe(devuelto), { saldo: 900, garantia: true });
});

test('no se cierra un contrato con la garantía todavía bloqueada', () => {
  const pagadoPeroBloqueado = { ...cerrado, garantiaLiberada: false };
  assert.equal(puedeCerrar(pagadoPeroBloqueado), false);
  assert.deepEqual(pendientesDe(pagadoPeroBloqueado), { saldo: 0, garantia: true });
});

test('se cierra cuando ya no debe nada y la garantía está liberada', () => {
  assert.equal(puedeCerrar(cerrado), true);
  assert.deepEqual(pendientesDe(cerrado), { saldo: 0, garantia: false });
});

test('el carro queda disponible al recibirlo, aunque el contrato siga abierto', () => {
  const carro = { id: 'v1', placas: 'P-234IFN' };
  assert.equal(estadoCarro(carro, [rentado], '2026-08-22').estado, 'rentado');
  assert.equal(estadoCarro(carro, [devuelto], '2026-08-26').estado, 'disponible',
    'el contrato sigue pendiente de cobro y de liberar, pero el carro ya puede salir');
});

test('un carro que no ha regresado y ya pasó la fecha sale atrasado', () => {
  const carro = { id: 'v1', placas: 'P-234IFN' };
  const estado = estadoCarro(carro, [rentado], '2026-08-26');
  assert.equal(estado.estado, 'atrasado');
  assert.equal(estado.diasAtraso, 2);
  assert.equal(estado.contrato.id, 'c1');
});

test('un carro marcado fuera de servicio no se puede rentar', () => {
  const carro = { id: 'v1', placas: 'P-234IFN', fueraDeServicio: true, motivoFueraDeServicio: 'En el taller' };
  assert.equal(estadoCarro(carro, [], '2026-08-26').estado, 'fuera de servicio');
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/estados.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/estados.js`:

```js
// En qué anda cada contrato y cada carro.
//
// El carro y el contrato llevan caminos separados a propósito. El carro se
// libera al regresar; el contrato sigue abierto hasta que el cliente pague lo
// que falte y se le suelte la garantía de la tarjeta. Si se amarraran, un
// cliente que no paga unos daños dejaría el carro parado sin necesidad.
import { resumen } from './contrato.js';
import { diasAtraso } from './fechas.js';

/** Lo que falta para poder cerrar: saldo por cobrar y garantía por liberar. */
export function pendientesDe(c) {
  return {
    saldo: resumen(c).saldo,
    garantia: !c?.garantiaLiberada,
  };
}

/** Un contrato se cierra cuando no debe nada y la garantía ya se liberó. */
export function puedeCerrar(c) {
  const { saldo, garantia } = pendientesDe(c);
  return saldo === 0 && !garantia;
}

/** 'rentado' mientras el carro anda fuera, 'devuelto' hasta cerrarlo, 'cerrado' al final. */
export function estadoContrato(c) {
  if (!c?.cierre?.fechaReal) return 'rentado';
  return puedeCerrar(c) ? 'cerrado' : 'devuelto';
}

/**
 * El estado del carro para la pantalla principal.
 *
 * `contratos` son los de ese carro; se busca el que todavía no ha regresado.
 */
export function estadoCarro(carro, contratos = [], hoy) {
  if (carro?.fueraDeServicio) {
    return { estado: 'fuera de servicio', contrato: null, diasAtraso: 0 };
  }

  const afuera = contratos.find((c) => c.carroId === carro?.id && !c?.cierre?.fechaReal);
  if (!afuera) return { estado: 'disponible', contrato: null, diasAtraso: 0 };

  const atraso = diasAtraso(afuera.devolucionPrevista, hoy);
  return {
    estado: atraso > 0 ? 'atrasado' : 'rentado',
    contrato: afuera,
    diasAtraso: atraso,
  };
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 38 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/estados.js pruebas/estados.test.mjs
git commit -m "Estados: el carro se libera al regresar, el contrato al cobrar y liberar"
```

---

### Task 6: Búsqueda sin acentos

**Files:**
- Create: `js/nucleo/busqueda.js`
- Test: `pruebas/busqueda.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizar(texto) -> string` (minúsculas, sin acentos, sin signos), `coincide(textoBuscable, consulta) -> boolean` (todas las palabras, en cualquier orden), `textoDeCliente(cliente) -> string`, `textoDeContrato(contrato) -> string`, `filtrar(items, consulta, textoDe) -> items`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/busqueda.test.mjs`:

```js
// Pruebas del buscador.
//
// En el mostrador nadie escribe acentos ni recuerda si el apellido va antes del
// nombre. El buscador tiene que encontrar igual: "urizar jonatan" y "Jonatán
// Urízar" son la misma persona, y "3786" encuentra al del DPI que empieza así.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, coincide, textoDeCliente, filtrar } from '../js/nucleo/busqueda.js';

const cliente = {
  id: 'k1',
  apellido1: 'URIZAR', apellido2: 'ROLDÁN',
  nombre1: 'JONATÁN', nombre2: 'ESTEBAN',
  documento: 'DPI 3786 73238 0101',
  licencia: 'LIC 3786732380101',
  telefono: '3078-4155',
  correo: 'FASTERESTEBAN07@GMAIL.COM',
};

test('quita acentos, mayúsculas y signos', () => {
  assert.equal(normalizar('JONATÁN Urízar'), 'jonatan urizar');
  assert.equal(normalizar('3078-4155'), '3078 4155');
  assert.equal(normalizar('  doble   espacio '), 'doble espacio');
});

test('encuentra en cualquier orden y sin acentos', () => {
  const texto = textoDeCliente(cliente);
  assert.ok(coincide(texto, 'urizar jonatan'));
  assert.ok(coincide(texto, 'jonatan urizar'));
  assert.ok(coincide(texto, 'URÍZAR'));
  assert.ok(coincide(texto, 'roldan esteban'));
});

test('encuentra por DPI, licencia, teléfono o correo, aunque sea un pedazo', () => {
  const texto = textoDeCliente(cliente);
  assert.ok(coincide(texto, '3786'));
  assert.ok(coincide(texto, '30784155'), 'el teléfono sin guion');
  assert.ok(coincide(texto, 'fasteresteban07'));
});

test('no encuentra lo que no está', () => {
  const texto = textoDeCliente(cliente);
  assert.equal(coincide(texto, 'marcela'), false);
  assert.equal(coincide(texto, 'urizar marcela'), false, 'tienen que estar TODAS las palabras');
});

test('una búsqueda vacía devuelve todo', () => {
  const lista = [cliente, { ...cliente, id: 'k2', apellido1: 'BRIONES' }];
  assert.equal(filtrar(lista, '', textoDeCliente).length, 2);
  assert.equal(filtrar(lista, '   ', textoDeCliente).length, 2);
  assert.equal(filtrar(lista, 'briones', textoDeCliente).length, 1);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/busqueda.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/busqueda.js`:

```js
// El buscador.
//
// Busca sobre un texto armado de antemano con todo lo buscable de cada ficha.
// Se normaliza una sola vez, no en cada tecla: así el buscador responde mientras
// se escribe aunque haya miles de clientes.

/** Minúsculas, sin acentos y sin signos: '3078-4155' queda '3078 4155'. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Cierto si TODAS las palabras buscadas están en el texto, en cualquier orden. */
export function coincide(textoBuscable, consulta) {
  const texto = normalizar(textoBuscable);
  const sinEspacios = texto.replace(/ /g, '');
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return true;
  return palabras.every((p) => texto.includes(p) || sinEspacios.includes(p));
}

/** Todo lo buscable de un cliente, en un solo texto. */
export function textoDeCliente(c) {
  return [c?.apellido1, c?.apellido2, c?.nombre1, c?.nombre2,
    c?.documento, c?.licencia, c?.telefono, c?.telefonoAdicional, c?.correo].filter(Boolean).join(' ');
}

/** Todo lo buscable de un contrato. */
export function textoDeContrato(c) {
  return [c?.numero, c?.clienteNombre, c?.carroPlacas, c?.carroDescripcion, c?.rentadoPor]
    .filter(Boolean).join(' ');
}

/** Filtra una lista con el texto buscable que le corresponde a cada elemento. */
export function filtrar(items, consulta, textoDe) {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return items;
  return items.filter((item) => coincide(textoDe(item), consulta));
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 43 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/busqueda.js pruebas/busqueda.test.mjs
git commit -m "Buscador sin acentos, en cualquier orden"
```

---

### Task 7: Los avisos del formulario de salida

**Files:**
- Create: `js/nucleo/avisos.js`
- Test: `pruebas/avisos.test.mjs`

**Interfaces:**
- Consumes: `diasEntre` de `fechas.js`; `resumen` de `contrato.js`.
- Produces: `avisosDeSalida({cliente, carro, contrato, contratosDelCliente, contratosDelCarro, ajustes, hoy}) -> [{nivel, mensaje}]` con `nivel` `'alto'` (rojo) o `'medio'` (ámbar). Orden: primero los altos.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/avisos.test.mjs`:

```js
// Pruebas de los avisos al sacar un carro.
//
// Son las cosas que el Excel deja pasar y que cuestan dinero: rentarle a alguien
// con la licencia vencida, rentarle al que quedó debiendo, prometer un carro que
// ya está comprometido, o rentar por debajo del mínimo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosDeSalida } from '../js/nucleo/avisos.js';

const ajustes = { precioMinimoDia: 300, diasMinimos: 2 };
const cliente = { id: 'k1', licenciaExpira: '2030-02-09', documentoExpira: '2030-02-09' };
const carro = { id: 'v1', placas: 'P-234IFN' };
const contrato = { carroId: 'v1', dias: 4, precioDia: 700, fechaSalida: '2026-08-20', devolucionPrevista: '2026-08-24' };
const base = { cliente, carro, contrato, contratosDelCliente: [], contratosDelCarro: [], ajustes, hoy: '2026-08-20' };
const mensajes = (r) => r.map((a) => a.mensaje);

test('un contrato normal no dispara ningún aviso', () => {
  assert.deepEqual(avisosDeSalida(base), []);
});

test('avisa si la licencia está vencida', () => {
  const r = avisosDeSalida({ ...base, cliente: { ...cliente, licenciaExpira: '2026-08-01' } });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /licencia/i);
});

test('avisa si el DPI o pasaporte está vencido', () => {
  const r = avisosDeSalida({ ...base, cliente: { ...cliente, documentoExpira: '2026-08-19' } });
  assert.match(mensajes(r).join(' '), /documento/i);
});

test('avisa si el cliente quedó debiendo de otra renta', () => {
  const deudor = [{
    id: 'c9', dias: 2, precioDia: 600,
    devolucionPrevista: '2026-07-10',
    cierre: { fechaReal: '2026-07-10' },
    pagos: [{ monto: 400, porcentajeTarjeta: 0 }],
  }];
  const r = avisosDeSalida({ ...base, contratosDelCliente: deudor });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /debe|saldo/i);
  assert.match(r[0].mensaje, /800/, 'dice cuánto debe');
});

test('avisa si el cliente ya devolvió tarde antes', () => {
  const tarde = [{
    id: 'c8', dias: 2, precioDia: 600,
    devolucionPrevista: '2026-07-08',
    cierre: { fechaReal: '2026-07-10' },
    pagos: [{ monto: 2400, porcentajeTarjeta: 0 }],
    garantiaLiberada: true,
  }];
  const r = avisosDeSalida({ ...base, contratosDelCliente: tarde });
  assert.equal(r[0].nivel, 'medio');
  assert.match(r[0].mensaje, /tarde/i);
});

test('avisa si el carro ya está comprometido en esas fechas', () => {
  const encima = [{ id: 'c7', carroId: 'v1', fechaSalida: '2026-08-22', devolucionPrevista: '2026-08-27' }];
  const r = avisosDeSalida({ ...base, contratosDelCarro: encima });
  assert.equal(r[0].nivel, 'alto');
  assert.match(r[0].mensaje, /otro contrato|comprometido/i);
});

test('no avisa si las fechas no se enciman', () => {
  const despues = [{ id: 'c7', carroId: 'v1', fechaSalida: '2026-08-25', devolucionPrevista: '2026-08-28' }];
  assert.deepEqual(avisosDeSalida({ ...base, contratosDelCarro: despues }), []);
});

test('avisa si el precio está por debajo del mínimo o son menos de dos días', () => {
  const barato = avisosDeSalida({ ...base, contrato: { ...contrato, precioDia: 250 } });
  assert.match(mensajes(barato).join(' '), /mínimo/i);

  const corto = avisosDeSalida({ ...base, contrato: { ...contrato, dias: 1 } });
  assert.match(mensajes(corto).join(' '), /días mínimos/i);
});

test('los avisos altos van primero', () => {
  const r = avisosDeSalida({
    ...base,
    cliente: { ...cliente, licenciaExpira: '2026-08-01' },
    contrato: { ...contrato, dias: 1 },
  });
  assert.equal(r[0].nivel, 'alto');
  assert.equal(r[r.length - 1].nivel, 'medio');
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/nucleo/avisos.js` no existe.

- [ ] **Step 3: Escribir el módulo**

Crear `js/nucleo/avisos.js`:

```js
// Los avisos que aparecen mientras se saca un carro.
//
// Son advertencias, no candados: el dueño decide. Puede rentarle a un conocido
// con la licencia recién vencida si así lo quiere. Lo que no puede es que nadie
// se lo haya dicho.
import { diasEntre } from './fechas.js';
import { resumen } from './contrato.js';

const alto = (mensaje) => ({ nivel: 'alto', mensaje });
const medio = (mensaje) => ({ nivel: 'medio', mensaje });

/** ¿Se encima [a1, a2] con [b1, b2]? */
function seEnciman(a1, a2, b1, b2) {
  if (!a1 || !a2 || !b1 || !b2) return false;
  return diasEntre(a1, b2) >= 0 && diasEntre(b1, a2) >= 0;
}

export function avisosDeSalida({ cliente, carro, contrato, contratosDelCliente = [], contratosDelCarro = [], ajustes = {}, hoy }) {
  const avisos = [];

  if (cliente?.licenciaExpira && diasEntre(cliente.licenciaExpira, hoy) > 0) {
    avisos.push(alto(`La licencia del cliente venció el ${cliente.licenciaExpira}.`));
  }
  if (cliente?.documentoExpira && diasEntre(cliente.documentoExpira, hoy) > 0) {
    avisos.push(alto(`El documento del cliente venció el ${cliente.documentoExpira}.`));
  }

  const deuda = contratosDelCliente.reduce((total, c) => total + resumen(c).saldo, 0);
  if (deuda > 0) {
    avisos.push(alto(`Este cliente debe Q${deuda.toFixed(2)} de una renta anterior.`));
  }

  const tardes = contratosDelCliente.filter((c) => resumen(c).diasAtraso > 0).length;
  if (tardes > 0) {
    avisos.push(medio(`Este cliente ya devolvió tarde ${tardes} vez(ces).`));
  }

  const encimado = contratosDelCarro.find((otro) =>
    otro.id !== contrato?.id &&
    seEnciman(contrato?.fechaSalida, contrato?.devolucionPrevista, otro.fechaSalida, otro.devolucionPrevista));
  if (encimado) {
    avisos.push(alto(`Este carro tiene otro contrato del ${encimado.fechaSalida} al ${encimado.devolucionPrevista}.`));
  }

  if (ajustes.precioMinimoDia && contrato?.precioDia && contrato.precioDia < ajustes.precioMinimoDia) {
    avisos.push(medio(`El precio está por debajo del mínimo de Q${ajustes.precioMinimoDia} por día.`));
  }
  if (ajustes.diasMinimos && contrato?.dias && contrato.dias < ajustes.diasMinimos) {
    avisos.push(medio(`Son menos de los ${ajustes.diasMinimos} días mínimos de renta.`));
  }

  return [...avisos.filter((a) => a.nivel === 'alto'), ...avisos.filter((a) => a.nivel === 'medio')];
}
```

- [ ] **Step 4: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 52 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add js/nucleo/avisos.js pruebas/avisos.test.mjs
git commit -m "Avisos al sacar un carro: licencia, deuda, fechas encimadas y minimos"
```

---

### Task 8: Firebase, entrada al sistema y cascarón

**Files:**
- Create: `index.html`, `css/estilos.css`, `js/firebase-config.js`, `js/auth.js`, `js/ui.js`, `js/router.js`, `js/app.js`, `version.txt`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: nada del núcleo.
- Produces: `iniciarFirebase() -> {app, auth, db}` de `firebase-config.js`; `entrar(usuario, clave)`, `salir()`, `alCambiarSesion(cb)` de `auth.js`; `mostrar(ruta)`, `registrarPantalla(ruta, fn)` de `router.js`; `dinero(n) -> 'Q1,234.56'`, `fecha(iso) -> '25 ago 2026'`, `aviso(texto, tipo)` de `ui.js`.

- [ ] **Step 1: Crear la configuración de Firebase**

Crear `js/firebase-config.js` con el proyecto nuevo de Firebase (los valores salen de la consola de Firebase del dueño, proyecto `bestprice-contratos`):

```js
// Conexión a Firebase. Los datos de este archivo son públicos por diseño: lo que
// protege la información son las reglas de Firestore, no esconder estas claves.
const SDK = '12.0.0';

export const CONFIG = {
  apiKey: 'PEGAR_DE_LA_CONSOLA',
  authDomain: 'bestprice-contratos.firebaseapp.com',
  projectId: 'bestprice-contratos',
  storageBucket: 'bestprice-contratos.firebasestorage.app',
  messagingSenderId: 'PEGAR_DE_LA_CONSOLA',
  appId: 'PEGAR_DE_LA_CONSOLA',
};

let listo = null;

/** Levanta Firebase una sola vez y devuelve lo que usa el resto del sistema. */
export function iniciarFirebase() {
  if (listo) return listo;
  listo = (async () => {
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`);
    const auth = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`);
    const fs = await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`);
    const app = initializeApp(CONFIG);
    return { app, auth: auth.getAuth(app), db: fs.getFirestore(app), authMod: auth, fsMod: fs };
  })();
  return listo;
}
```

> Nota para quien ejecute: el proyecto de Firebase lo crea el dueño en la consola (§13 del diseño). Mientras no existan las claves, esta tarea se prueba con la pantalla de entrada mostrando el error de conexión, que es comportamiento correcto.

- [ ] **Step 2: Escribir el HTML de entrada y el cascarón**

Crear `index.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Best Price — Contratos</title>
<link rel="stylesheet" href="css/estilos.css?v=1">
</head>
<body>
  <div id="entrada" class="entrada">
    <form id="forma-entrada" class="tarjeta-entrada">
      <h1>Best Price</h1>
      <p class="sub">Contratos de renta</p>
      <label>Usuario <input type="email" id="usuario" autocomplete="username" required></label>
      <label>Contraseña <input type="password" id="clave" autocomplete="current-password" required></label>
      <button type="submit" class="btn btn-primario">Entrar</button>
      <p id="error-entrada" class="error" hidden></p>
    </form>
  </div>

  <div id="app" hidden>
    <header class="barra">
      <strong>Best Price — Contratos</strong>
      <input type="search" id="buscador" placeholder="Buscar cliente, placas o número de contrato">
      <nav>
        <a href="#/flota">Flota</a>
        <a href="#/clientes">Clientes</a>
        <a href="#/contratos">Contratos</a>
        <a href="#/dinero">Dinero</a>
        <a href="#/ajustes">Ajustes</a>
      </nav>
      <button id="salir" class="btn">Salir</button>
    </header>
    <main id="pantalla"></main>
  </div>

  <div id="avisos" class="avisos"></div>
  <script type="module" src="js/app.js?v=1"></script>
</body>
</html>
```

- [ ] **Step 3: Escribir los estilos, la sesión, el enrutador y el arranque**

Crear `css/estilos.css` con los colores de la marca (azul `#025AB3`, amarillo `#FFBC01`, fondo `#F3F5F8`, titulares `#073A7A`), `js/ui.js` con `dinero()`, `fecha()` y `aviso()`, `js/auth.js` con `entrar`, `salir` y `alCambiarSesion` sobre `signInWithEmailAndPassword` y `onAuthStateChanged`, `js/router.js` con un registro de pantallas por ruta de `location.hash`, y `js/app.js` que junta todo: muestra la entrada, al haber sesión muestra el cascarón y navega a `#/flota`.

Crear `version.txt` con `2026-09-23.1`.

Crear `.claude/launch.json` para poder ver la página:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "contratos", "runtimeExecutable": "npx", "runtimeArgs": ["-y", "serve", "-l", "4173", "."], "port": 4173 }
  ]
}
```

- [ ] **Step 4: Verificar en el navegador**

Abrir la vista previa con el servidor `contratos` y comprobar:
- Se ve la pantalla de entrada con el nombre del negocio.
- Con usuario o contraseña equivocados aparece un mensaje en español, no un error técnico de Firebase.
- Con la sesión correcta se ve el cascarón con la barra y la palabra Flota.
- La consola del navegador no tiene errores en rojo.

- [ ] **Step 5: Commit**

```bash
git add index.html css/estilos.css js/ version.txt .claude/launch.json
git commit -m "Entrada al sistema, cascaron y conexion con Firebase"
```

---

### Task 9: Datos y copia local

**Files:**
- Create: `js/cache.js`, `js/datos.js`
- Test: `pruebas/cache.test.mjs`

**Interfaces:**
- Consumes: `iniciarFirebase` de `firebase-config.js`.
- Produces:
  - `js/cache.js`: `mezclar(locales, remotos) -> items` (pura, probada), `guardarLocal(coleccion, items)`, `leerLocal(coleccion) -> items`.
  - `js/datos.js`: `cargarFlota()`, `cargarContratosAbiertos()`, `buscarClientes(consulta)`, `guardarCliente(cliente)`, `guardarContrato(contrato)`, `siguienteNumeroContrato()`. Todas devuelven promesas y sirven primero lo local.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `pruebas/cache.test.mjs`:

```js
// Pruebas de la mezcla entre la copia local y lo que viene de la nube.
//
// El sistema dibuja primero con la copia local para abrir rápido, y después
// llega lo de la nube. Si esa mezcla se hace mal, el mostrador ve un dato viejo
// encima de uno nuevo — o peor, se le borra algo que sí existía.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mezclar } from '../js/cache.js';

const local = [
  { id: 'a', placas: 'P-1', actualizado: 100 },
  { id: 'b', placas: 'P-2', actualizado: 100 },
];

test('lo más nuevo gana', () => {
  const remotos = [{ id: 'a', placas: 'P-1 NUEVA', actualizado: 200 }];
  const r = mezclar(local, remotos);
  assert.equal(r.find((x) => x.id === 'a').placas, 'P-1 NUEVA');
});

test('lo viejo de la nube no pisa lo nuevo de aquí', () => {
  const remotos = [{ id: 'a', placas: 'VIEJA', actualizado: 50 }];
  const r = mezclar(local, remotos);
  assert.equal(r.find((x) => x.id === 'a').placas, 'P-1');
});

test('lo que solo está en la nube se agrega', () => {
  const r = mezclar(local, [{ id: 'c', placas: 'P-3', actualizado: 10 }]);
  assert.equal(r.length, 3);
});

test('lo que solo está local se conserva', () => {
  const r = mezclar(local, []);
  assert.equal(r.length, 2);
});

test('lo borrado en la nube desaparece', () => {
  const r = mezclar(local, [{ id: 'a', borrado: true, actualizado: 300 }]);
  assert.deepEqual(r.map((x) => x.id), ['b']);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Correr: `npm test`
Se espera: FALLA, porque `js/cache.js` no existe.

- [ ] **Step 3: Escribir la copia local**

Crear `js/cache.js` con `mezclar` pura y las funciones de IndexedDB:

```js
// La copia local del negocio, para que el sistema abra al instante.
//
// Se dibuja con esto y la nube llega después. La mezcla se decide por el sello
// `actualizado` de cada ficha: gana el más nuevo, y lo marcado como borrado se
// va. Sin esa regla, una respuesta lenta de la nube podía pisar algo que el
// mostrador acababa de guardar.

/** Mezcla la copia local con lo que llegó de la nube. Función pura. */
export function mezclar(locales = [], remotos = []) {
  const porId = new Map(locales.map((x) => [x.id, x]));
  for (const r of remotos) {
    const actual = porId.get(r.id);
    if (actual && Number(actual.actualizado || 0) > Number(r.actualizado || 0)) continue;
    if (r.borrado) porId.delete(r.id);
    else porId.set(r.id, r);
  }
  return [...porId.values()];
}

const BD = 'bestprice-contratos';
const VERSION_BD = 1;
const TIENDAS = ['clientes', 'vehiculos', 'contratos', 'ajustes'];

function abrir() {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(BD, VERSION_BD);
    req.onupgradeneeded = () => {
      for (const t of TIENDAS) {
        if (!req.result.objectStoreNames.contains(t)) req.result.createObjectStore(t, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

/** Guarda una colección completa en la copia local. */
export async function guardarLocal(coleccion, items) {
  const bd = await abrir();
  await new Promise((ok, mal) => {
    const tx = bd.transaction(coleccion, 'readwrite');
    for (const item of items) tx.objectStore(coleccion).put(item);
    tx.oncomplete = ok;
    tx.onerror = () => mal(tx.error);
  });
}

/** Lee una colección de la copia local. Si algo falla, devuelve vacío: la nube manda. */
export async function leerLocal(coleccion) {
  try {
    const bd = await abrir();
    return await new Promise((ok, mal) => {
      const req = bd.transaction(coleccion).objectStore(coleccion).getAll();
      req.onsuccess = () => ok(req.result || []);
      req.onerror = () => mal(req.error);
    });
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Escribir la capa de datos**

Crear `js/datos.js` sobre `firebase-config.js` y `cache.js`: lee primero de la copia local, dibuja, y en paralelo consulta Firestore y vuelve a dibujar cuando llega. `guardarContrato` sella `actualizado: Date.now()` y toma el número con `siguienteNumeroContrato()`, que incrementa el documento `contadores/contratos` dentro de una transacción para que nunca se repita un correlativo.

- [ ] **Step 5: Correr las pruebas y ver que pasan**

Correr: `npm test`
Se espera: PASA, 57 pruebas en total.

- [ ] **Step 6: Commit**

```bash
git add js/cache.js js/datos.js pruebas/cache.test.mjs
git commit -m "Copia local y capa de datos: abre al instante y sincroniza detras"
```

---

### Task 10: Pantalla de la flota

**Files:**
- Create: `js/pantallas/flota.js`
- Modify: `js/app.js` (registrar la ruta `#/flota`)

**Interfaces:**
- Consumes: `estadoCarro` de `estados.js`; `resumen` de `contrato.js`; `cargarFlota`, `cargarContratosAbiertos` de `datos.js`; `dinero`, `fecha` de `ui.js`.
- Produces: `pintarFlota(contenedor) -> void`.

- [ ] **Step 1: Pintar los carros con su estado**

`pintarFlota` arma un cuadro por carro con placas, marca y línea, y el estado que devuelve `estadoCarro`:
- `disponible`: punto verde y botón **Sacar carro**.
- `rentado`: punto azul, nombre del cliente, *vuelve el 25 ago*, botón **Recibir carro**.
- `atrasado`: cuadro rojo, *atrasado 2 días*, botón **Recibir carro**.
- `fuera de servicio`: cuadro gris con el motivo y botón **Volver a habilitar**.

- [ ] **Step 2: Agregar las dos listas de pendientes**

Debajo de la flota, y solo si tienen algo:
- **Garantías por liberar**: contratos devueltos con `garantiaLiberada: false`, con cliente, monto autorizado y días esperando.
- **Pendientes de cobro**: contratos con `resumen(c).saldo > 0`, con cliente, saldo y días.

Ningún otro monto aparece en esta pantalla (§6 del diseño).

- [ ] **Step 3: Verificar en el navegador**

Con dos carros y un contrato de prueba en Firestore:
- Un carro sale *disponible* y el otro *rentado* con el nombre del cliente.
- Adelantando la fecha de devolución, ese carro se ve rojo y dice los días de atraso.
- Marcando un carro fuera de servicio, se ve gris y sin botón de sacar.
- La pantalla termina de dibujarse en menos de un segundo (medir con la pestaña Red del navegador, recarga con caché vacía).

- [ ] **Step 4: Commit**

```bash
git add js/pantallas/flota.js js/app.js
git commit -m "Pantalla principal: la flota con su estado y los pendientes"
```

---

### Task 11: Sacar un carro

**Files:**
- Create: `js/pantallas/sacarCarro.js`
- Modify: `js/app.js` (registrar la ruta `#/sacar/:carroId`)

**Interfaces:**
- Consumes: `lineasSalida`, `resumen` de `contrato.js`; `avisosDeSalida` de `avisos.js`; `devolucionPrevista` de `fechas.js`; `filtrar`, `textoDeCliente` de `busqueda.js`; `guardarContrato`, `guardarCliente`, `siguienteNumeroContrato` de `datos.js`.
- Produces: `pintarSacarCarro(contenedor, carroId) -> void`; el contrato guardado con la forma que describe la §7 del diseño.

- [ ] **Step 1: Armar los seis bloques del formulario**

Cliente (buscador y alta rápida), carro (con la casilla *carro ajeno*), renta, cobros extra, tarjetas y cierre del formulario, tal como los describe la §6 del diseño. La casilla *carro ajeno* muestra placas, tipo, marca, color, modelo, dueño y costo por día; esos datos van dentro del contrato y **no** se agregan a la flota.

- [ ] **Step 2: Calcular mientras se escribe**

Al cambiar días, precio o extras se vuelve a pintar el detalle con `lineasSalida` y el total con `resumen`, y la devolución prevista con `devolucionPrevista`. Los avisos de `avisosDeSalida` se muestran arriba del botón de guardar, los rojos primero.

- [ ] **Step 3: Guardar el contrato**

Al guardar:
- Se pide el correlativo con `siguienteNumeroContrato()`.
- Del número de tarjeta se guardan **solo los últimos 4 dígitos**; el CBC no se guarda (ADR-001). El número completo queda en una variable de la pantalla, se usa para imprimir y se descarta al salir.
- Se guarda el pago de la salida con su forma de pago y su porcentaje de tarjeta.
- Se guarda `porcentajeComision` copiado del empleado elegido.

- [ ] **Step 4: Verificar en el navegador**

- Sacar un carro con el ejemplo del diseño (4 días a Q700, carta poder Q350, 12 % de tarjeta) y comprobar que el total a cobrar dice **Q3,528.00**.
- Verificar en Firestore que el contrato guardado **no** tiene el número completo de la tarjeta ni el CBC.
- Volver a la flota: ese carro ya aparece *rentado*, con el nombre del cliente y la fecha de devolución.
- Sacar un carro ajeno y verificar que no aparece en la flota.

- [ ] **Step 5: Commit**

```bash
git add js/pantallas/sacarCarro.js js/app.js
git commit -m "Sacar carro: formulario, avisos, calculo en vivo y contrato guardado"
```

---

### Task 12: Reglas de Firestore y aviso de versión

**Files:**
- Create: `firestore.rules`, `js/version.js`
- Modify: `index.html` (cargar el aviso de versión), `version.txt`

**Interfaces:**
- Consumes: nada.
- Produces: `vigilarVersion() -> void`.

- [ ] **Step 1: Escribir las reglas de Firestore**

Crear `firestore.rules`: solo usuarios con sesión leen y escriben `clientes`, `vehiculos`, `contratos`, `empleados`, `ajustes` y `contadores`; la subcolección `contratos/{id}/privado` y `pagosComision` solo se leen y escriben con la credencial del área de dinero (§11 del diseño), que se identifica por su `uid`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function haySesion() { return request.auth != null; }
    function esDinero() { return request.auth != null && request.auth.uid == 'UID_DE_LA_CUENTA_DE_DINERO'; }

    match /clientes/{id}   { allow read, write: if haySesion(); }
    match /vehiculos/{id}  { allow read, write: if haySesion(); }
    match /empleados/{id}  { allow read: if haySesion(); allow write: if esDinero(); }
    match /ajustes/{id}    { allow read: if haySesion(); allow write: if haySesion(); }
    match /contadores/{id} { allow read, write: if haySesion(); }

    match /contratos/{id} {
      allow read, write: if haySesion();
      // El costo del dueño y la comisión se escriben al crear el contrato,
      // pero solo se pueden LEER con la credencial del área de dinero.
      match /privado/{doc} {
        allow create, update: if haySesion();
        allow read, delete: if esDinero();
      }
    }

    match /pagosComision/{id} { allow read, write: if esDinero(); }
  }
}
```

- [ ] **Step 2: Escribir el aviso de versión**

Crear `js/version.js` con `VERSION = '2026-09-23.1'`, que consulta `version.txt` sin caché cada 15 minutos y al volver a la pestaña, y si no coinciden muestra una barra con el botón **Actualizar ahora** que recarga los archivos saltándose la caché.

- [ ] **Step 3: Verificar**

- Cambiar `version.txt` a `2026-09-23.2` y recargar: aparece la barra de aviso.
- Darle a **Actualizar ahora**: la barra desaparece y la página queda en la versión nueva.
- Con las reglas puestas en la consola, intentar leer `contratos/{id}/privado/dinero` con la cuenta normal: debe fallar.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules js/version.js index.html version.txt
git commit -m "Reglas de Firestore y aviso de version nueva"
```

---

## Al terminar el plan

1. Correr `npm test`: todo en verde.
2. Mandar el trabajo completo a revisión con `production-validator` de ruflo y atender lo que salga.
3. Entregar al dueño: qué commits faltan subir, el archivo `firestore.rules` para pegar en la consola de Firebase, y los tres datos que él tiene que crear (proyecto de Firebase, repositorio en `bestpriceguatemala`, registro del dominio).
4. Siguientes planes, en este orden: **recibir y cobrar** (cierre, saldo, liberar garantía), **impresión** (contrato sobre el formulario y calibración), **dinero** (área con contraseña, comisiones, dueños) y **respaldo** (el Excel del dueño como plantilla).
