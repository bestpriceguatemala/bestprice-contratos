// Tests para la pantalla de carros: construirVehiculo() y casos críticos.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { construirVehiculo } from '../js/pantallas/carros.js';

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
