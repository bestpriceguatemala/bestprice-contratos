// Pruebas que cierran lo que la auditoría de mutaciones del 26 de octubre de 2026 encontró en el mantenimiento de la flota:
// cuándo el sistema dice que una lectura quedó incompleta, en qué orden se ve el historial de servicios y cuál servicio manda
// cuando hay empate. Cada una nació de un mutante que SOBREVIVIÓ: se le metió a propósito un error al código y las 2,589
// pruebas de entonces seguían en verde. Aquí cada una falla con ese error puesto y pasa con el código bueno.
// Qué le habría costado al dueño cada uno: .superpowers/auditoria-pruebas-2026-10-26.md.
//
// Los carros y sus servicios salen de los constructores de verdad (pruebas/fixtures/carroConServicios.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoDeMantenimiento, estadoDeServicio, historialDeServicios, ultimoServicioDe,
} from '../js/nucleo/mantenimiento.js';
import { carroPropio, carroConServicios } from './fixtures/carroConServicios.mjs';

const HOY = '2026-10-26';

test('la lectura está incompleta si falló CUALQUIERA de las dos (flota o contratos), no solo si fallaron las dos', () => {
  // `falloFlota || falloContratos` -> `&&`: con una sola lectura caída la ficha decía «al día» como si lo supiera todo.
  const carro = carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-10-01', km: 90000 }], HOY);
  const lectura = (falloFlota, falloContratos) => estadoDeMantenimiento({
    carro, kilometraje: { km: 90100 }, hoy: HOY, falloFlota, falloContratos,
  });
  assert.equal(lectura(false, false).lecturaIncompleta, false);
  assert.equal(lectura(true, false).lecturaIncompleta, true);
  assert.equal(lectura(false, true).lecturaIncompleta, true);
  assert.equal(lectura(true, true).lecturaIncompleta, true);
  // Y con una lectura caída, lo que parecía bien ya no se da por bueno.
  const aceite = (falloFlota, falloContratos) => lectura(falloFlota, falloContratos).servicios.find((s) => s.tipo === 'aceite').estado;
  assert.equal(aceite(false, false), 'al-dia');
  assert.equal(aceite(true, false), 'sin-confirmar');
  assert.equal(aceite(false, true), 'sin-confirmar');
});

test('el historial va del servicio más reciente al más viejo; a igual fecha, primero el que se anotó después; sin fecha válida, al final', () => {
  const carro = carroConServicios(carroPropio(), [
    { id: 's1', tipo: 'aceite', fecha: '2026-01-10', km: 10000 },
    { id: 's2', tipo: 'frenos', fecha: '2026-03-01', km: 20000 },
    { id: 's3', tipo: 'alineacion', fecha: '2026-03-01', km: 20100 },
    { id: 's4', tipo: 'general', fecha: '2026-06-15', km: 30000 },
  ], HOY);
  // Un servicio viejo de antes de las fechas validadas: sin fecha legible.
  const servicios = [{ ...carro.servicios[0], id: 'sx', fecha: 'ayer' }, ...carro.servicios];
  const orden = (lista) => historialDeServicios(lista, HOY).map((f) => f.id);
  assert.deepEqual(orden(servicios), ['s4', 's3', 's2', 's1', 'sx']);
  assert.deepEqual(orden([...servicios].reverse()), ['s4', 's2', 's3', 's1', 'sx'], 'a igual fecha manda el orden en que se anotaron');
  assert.equal(historialDeServicios(servicios, HOY).at(-1).cuenta, false);
  assert.equal(historialDeServicios(servicios, HOY).at(-1).razon, 'Sin fecha válida: no cuenta');
});

test('el último servicio de un tipo: gana la fecha más reciente; a igual fecha, el de más kilómetros; a igual todo, el anotado después', () => {
  // `km >= ultimo.km` -> `>`: en un empate se quedaba con el primero que se anotó.
  const ultimoDe = (servicios) => ultimoServicioDe(carroConServicios(carroPropio(), servicios, HOY).servicios, 'aceite', HOY).id;
  assert.equal(ultimoDe([
    { id: 'a', tipo: 'aceite', fecha: '2026-08-01', km: 50000 },
    { id: 'b', tipo: 'aceite', fecha: '2026-09-01', km: 40000 },
  ]), 'b', 'la fecha manda sobre los kilómetros');
  assert.equal(ultimoDe([
    { id: 'a', tipo: 'aceite', fecha: '2026-09-01', km: 40000 },
    { id: 'b', tipo: 'aceite', fecha: '2026-09-01', km: 41000 },
  ]), 'b', 'misma fecha: más kilómetros');
  assert.equal(ultimoDe([
    { id: 'a', tipo: 'aceite', fecha: '2026-09-01', km: 41000 },
    { id: 'b', tipo: 'aceite', fecha: '2026-09-01', km: 40000 },
  ]), 'a', 'misma fecha: gana el de más kilómetros aunque se anotó antes');
  assert.equal(ultimoDe([
    { id: 'a', tipo: 'aceite', fecha: '2026-09-01', km: 40000 },
    { id: 'b', tipo: 'aceite', fecha: '2026-09-01', km: 40000 },
  ]), 'b', 'empate total: el anotado después');
  assert.equal(ultimoDe([
    { id: 'a', tipo: 'aceite', fecha: '2026-09-01' },
    { id: 'b', tipo: 'aceite', fecha: '2026-09-01' },
  ]), 'b', 'sin kilómetros en ninguno: el anotado después');
});

test('un carro sin ningún servicio dice que falta el primero; con uno, ya no lo dice', () => {
  const sin = estadoDeServicio({ tipo: 'aceite', servicios: [], kilometraje: { km: 90000 }, hoy: HOY });
  assert.equal(sin.estado, 'sin-registro');
  assert.equal(sin.texto, 'Falta registrar el primer servicio.');
  const con = estadoDeServicio({
    tipo: 'aceite', servicios: carroConServicios(carroPropio(), [{ tipo: 'aceite', fecha: '2026-10-01', km: 90000 }], HOY).servicios,
    kilometraje: { km: 90100 }, hoy: HOY,
  });
  assert.equal(con.texto, '');
  assert.equal(con.intervalo.propio, false, 'sin intervalo propio usa el de siempre');
  assert.deepEqual([con.intervalo.km, con.intervalo.meses], [5000, 3]);
});
