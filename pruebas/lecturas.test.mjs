// Lo que la nube trajo por detrás no lo pisa la copia local que se devolvió primero.
//
// Las lecturas con sincronía de fondo (datos.js) devuelven al instante la copia LOCAL y avisan por `alLlegar` si la nube trae algo distinto o falla.
// Las pantallas que esperan varias juntas (`Promise.all`) esperan lo que tarda la más lenta: una que no tiene copia local (nadie ha hecho una
// reservación) o una que va a la red (`cargarAjustes()`). La nube de las OTRAS puede contestar antes de que la espera termine, y lo que la pantalla
// asignaba al terminar de esperar era la copia local —más vieja—, que pisaba lo que la nube ya había traído. Probado en el navegador: en «Sacar carro», un
// carro que OTRA computadora mandó al taller se ofrecía sin ningún aviso (la copia de esta computadora todavía lo tenía disponible) y un contrato que otra
// computadora acababa de abrir sobre ese carro tampoco avisaba; en el calendario, un carro que otra computadora ya había recibido seguía «atrasado». Y
// se perdía el aviso de que la nube había fallado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lecturaConNubeDetras } from '../js/nucleo/lecturas.js';

test('lecturaConNubeDetras: lo que llega por detrás de la nube es lo más nuevo, llegue antes o después de la respuesta inmediata', () => {
  const local = { datos: ['carro disponible (copia local)'], fallo: false };
  const nube = { datos: ['carro en el taller (nube)'], fallo: false };

  const despues = lecturaConNubeDetras(); // primero la copia local, después la nube: el orden «normal»
  despues.inmediata(local);
  despues.deLaNube(nube);
  assert.deepEqual(despues.actual, nube);

  const antes = lecturaConNubeDetras(); // la nube contesta ANTES de que la pantalla termine de esperar: el orden que perdía datos
  antes.deLaNube(nube);
  antes.inmediata(local);
  assert.deepEqual(antes.actual, nube, 'la respuesta inmediata (la copia local) no pisa lo que la nube ya trajo');

  const sola = lecturaConNubeDetras(); // sin nada por detrás, vale la copia local
  sola.inmediata(local);
  assert.deepEqual(sola.actual, local);
});

test('lecturaConNubeDetras: un fallo que llegó por detrás no se borra con la respuesta inmediata (una lectura caída nunca se dibuja como buena)', () => {
  const l = lecturaConNubeDetras();
  l.deLaNube({ datos: ['copia local'], fallo: true });
  l.inmediata({ datos: ['copia local'], fallo: false });
  assert.equal(l.actual.fallo, true);
});

test('lecturaConNubeDetras: antes de que llegue algo no hay lectura (null), y quien la lee no inventa un «no hay nada»', () => {
  assert.equal(lecturaConNubeDetras().actual, null);
});

// Las pantallas que esperan varias lecturas juntas pasan CADA una por el ayudante, y ya no asignan lo inmediato al terminar de esperar. Lo que
// pisaba lo de la nube era `flota = rFlota.datos` (y su `fallo`) después del `await`: ninguna pantalla debe volver a escribirlo.
const PANTALLAS = {
  'sacarCarro.js': ['flota', 'contratos', 'reservas'],
  'calendario.js': ['reservas', 'flota', 'contratos'],
  'reservas.js': ['reservas', 'flota', 'contratos'],
  'clientes.js': ['clientes', 'contratos'],
  'carros.js': ['flota', 'contratos'],
};
const Capital = (t) => t[0].toUpperCase() + t.slice(1);

for (const [archivo, lecturas] of Object.entries(PANTALLAS)) {
  test(`${archivo} pasa sus lecturas con sincronía de fondo por lecturaConNubeDetras y no asigna lo inmediato al terminar de esperar`, () => {
    const fuente = readFileSync(new URL(`../js/pantallas/${archivo}`, import.meta.url), 'utf8');
    assert.match(fuente, /import \{ lecturaConNubeDetras \} from '\.\.\/nucleo\/lecturas\.js';/);
    for (const lectura of lecturas) {
      assert.match(fuente, new RegExp(`${lectura}\\.deLaNube\\(r\\)`), `${lectura}: lo que llega por detrás se anota como de la nube`);
      assert.match(fuente, new RegExp(`${lectura}\\.inmediata\\(`), `${lectura}: la respuesta inmediata entra solo si la nube no llegó antes`);
      // (`const flota = rFlota.datos` de una lectura suelta, sin callback —habilitar un carro—, no es esto)
      const antes = new RegExp(`(?<!const )\\b(?:${lectura}|fallo${Capital(lectura)}) = r${Capital(lectura)}\\.(?:datos|fallo)\\b`);
      assert.doesNotMatch(fuente, antes, `${lectura}: lo que pisaba lo de la nube (${antes})`);
    }
    assert.doesNotMatch(fuente, /contratosAbiertosDe\(rContratos\.datos\)/);
  });
}
