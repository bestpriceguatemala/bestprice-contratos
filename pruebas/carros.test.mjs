// Tests para la pantalla de carros: construirVehiculo() y casos críticos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  construirVehiculo, mensajesDeFalloDeCarros, htmlListaVaciaDeCarros, textoCarroNoEncontrado,
} from '../js/pantallas/carros.js';

test('construirVehiculo: un carro nuevo tiene propiedad Propio y sin fuera de servicio', () => {
  const campos = {
    placas: 'P-234IFN',
    tipo: 'Sedán',
    marca: 'Kia',
    linea: 'Rio',
    color: 'Blanco',
    modelo: '2022',
  };
  const vehiculo = construirVehiculo({}, campos);
  assert.equal(vehiculo.propiedad, 'Propio');
  assert.equal(vehiculo.fueraDeServicio, undefined);
  assert.equal(vehiculo.motivoFueraDeServicio, undefined);
});

test('construirVehiculo: editar un carro fuera de servicio preserva los flags', () => {
  const carroExistente = {
    id: 'carro-1',
    codigo: 1,
    placas: 'P-234IFN',
    tipo: 'Sedán',
    marca: 'Kia',
    linea: 'Rio',
    color: 'Blanco',
    modelo: '2022',
    fueraDeServicio: true,
    motivoFueraDeServicio: 'Taller de choque',
    actualizado: Date.now(),
  };

  const camposEditados = {
    placas: 'P-234IFN-NEW', // Solo cambió las placas
  };

  const vehiculo = construirVehiculo(carroExistente, camposEditados);

  // Las placas nuevas llegan
  assert.equal(vehiculo.placas, 'P-234IFN-NEW');

  // Pero fuera de servicio se conserva
  assert.equal(vehiculo.fueraDeServicio, true);
  assert.equal(vehiculo.motivoFueraDeServicio, 'Taller de choque');

  // Y propiedad es siempre Propio
  assert.equal(vehiculo.propiedad, 'Propio');
});

test('construirVehiculo: los campos del formulario ganan sobre los viejos', () => {
  const carroExistente = {
    id: 'carro-2',
    placas: 'P-235IFN',
    color: 'Gris',
    fueraDeServicio: false,
  };

  const camposEditados = {
    placas: 'P-235IFN-NUEVO',
    color: 'Blanco',
  };

  const vehiculo = construirVehiculo(carroExistente, camposEditados);

  // Los nuevos valores ganan
  assert.equal(vehiculo.placas, 'P-235IFN-NUEVO');
  assert.equal(vehiculo.color, 'Blanco');

  // Los que no se editan se preservan
  assert.equal(vehiculo.fueraDeServicio, false);
});

test('construirVehiculo: siempre fuerza propiedad a Propio', () => {
  const carroExistente = {
    id: 'carro-3',
    propiedad: 'Propio',
  };

  const campos = {
    placas: 'P-999ZZZ',
    // Si alguien intentara pasar propiedad: 'Subarrendado', sería ignorado
  };

  const vehiculo = construirVehiculo(carroExistente, campos);
  assert.equal(vehiculo.propiedad, 'Propio');
});

// «No hay carros» y «no se pudo leer la flota» no son lo mismo (prueba del sistema, 7 oct 2026):
// con el internet caído y sin copia local, esta lista decía «Todavía no hay carros en la flota.
// Agregar el primer carro» sin ninguna barra roja; la pantalla principal sí la tiene.
test('mensajesDeFalloDeCarros: sin fallos no hay nada que decir; cada lectura caída se nombra', () => {
  assert.deepEqual(mensajesDeFalloDeCarros({}), []);
  assert.deepEqual(mensajesDeFalloDeCarros({ falloFlota: true }), [
    'No se pudo leer la flota. Puede que falten carros o que la lista esté incompleta.',
  ]);
  assert.deepEqual(mensajesDeFalloDeCarros({ falloContratos: true }), [
    'No se pudieron leer los contratos. Los estados que ves pueden estar equivocados.',
  ]);
  assert.equal(mensajesDeFalloDeCarros({ falloFlota: true, falloContratos: true }).length, 2);
});

test('htmlListaVaciaDeCarros: sin carros de verdad invita a agregar el primero; si falló la lectura, no', () => {
  const vacia = htmlListaVaciaDeCarros({ falloFlota: false });
  assert.match(vacia, /Todavía no hay carros en la flota\./);
  assert.match(vacia, /Agregar el primer carro/);
  const fallo = htmlListaVaciaDeCarros({ falloFlota: true });
  assert.match(fallo, /No se pudo leer la flota\. Intenta de nuevo o revisa la conexión\./);
  assert.ok(!/Todavía no hay carros/.test(fallo));
  assert.ok(!/Agregar el primer carro/.test(fallo));
});

test('textoCarroNoEncontrado: «no se encontró» solo si la lectura salió bien', () => {
  assert.equal(textoCarroNoEncontrado(false), 'No se encontró este carro.');
  assert.equal(textoCarroNoEncontrado(true), 'No se pudo leer la flota, así que no se sabe si este carro existe. Revisa tu conexión e intenta de nuevo.');
});

test('la pantalla de carros pasa los fallos al dibujar la lista', () => {
  const fuente = readFileSync(new URL('../js/pantallas/carros.js', import.meta.url), 'utf8');
  assert.match(fuente, /dibujarLista\(contenedor, flota, contratos, hoy, \{ falloFlota, falloContratos \}\)/);
  assert.match(fuente, /r\.fallo/);
});
