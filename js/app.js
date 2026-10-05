// Arranque del sistema: decide si se ve la entrada o el cascarón, conecta el
// formulario de entrada con la sesión y reacciona cuando esta cambia.
import { entrar, salir, alCambiarSesion } from './auth.js';
import { aviso } from './ui.js';
import { registrarPantalla, mostrar } from './router.js';
import { pintarFlota } from './pantallas/flota.js';
import { pintarSacarCarro } from './pantallas/sacarCarro.js';
import { pintarRecibirCarro } from './pantallas/recibirCarro.js';
import { pintarCarros } from './pantallas/carros.js';
import { pintarClientes } from './pantallas/clientes.js';
import { pintarContratos } from './pantallas/contratos.js';
import { pintarReservas } from './pantallas/reservas.js';
import { pintarCalendario } from './pantallas/calendario.js';
import {
  pintarDinero, pintarCuentaDeDueno, conPuertaDeDinero, enElAreaDeDinero, cerrarElDineroOReiniciar, salirDelSistema,
} from './pantallas/dinero.js';
import { pintarDuenos } from './pantallas/duenos.js';
import { vigilarVersion } from './version.js';
import { limpiarCopiaLocalDelCosto } from './datos.js';

registrarPantalla('#/flota', pintarFlota);
registrarPantalla('#/sacar/:carroId', pintarSacarCarro);
registrarPantalla('#/recibir/:contratoId', pintarRecibirCarro);
registrarPantalla('#/carros', pintarCarros);
registrarPantalla('#/carros/:carroId', pintarCarros);
registrarPantalla('#/habilitar/:carroId', pintarCarros);
// '#/clientes/nuevo' y '#/clientes/:id' comparten el mismo patrón con
// parámetro: no se registra '#/clientes/nuevo' aparte porque una ruta exacta
// en el Map de router.js se llama sin el id capturado (mostrar() hace
// `directa(caja)`, sin argumentos) — pintarClientes(contenedor, 'nuevo')
// necesita ese 'nuevo' para saber que es alta y no edición. Mismo patrón que
// ya usa carros.js para '#/carros/nuevo'.
registrarPantalla('#/clientes', pintarClientes);
registrarPantalla('#/clientes/:clienteId', pintarClientes);
registrarPantalla('#/contratos', pintarContratos);
registrarPantalla('#/contratos/:contratoId', pintarContratos);
// '#/reservas/nueva' y '#/reservas/:id' comparten el mismo patrón con
// parámetro, mismo motivo que clientes.js arriba: pintarReservas(contenedor,
// 'nueva') necesita ese 'nueva' capturado para saber que es alta y no edición.
registrarPantalla('#/reservas', pintarReservas);
registrarPantalla('#/reservas/:reservaId', pintarReservas);
// '#/calendario/:fecha' abre el mes que contiene esa fecha con el día ya
// seleccionado (por ejemplo, un enlace futuro desde otra pantalla); navegar
// de mes o elegir otro día después es estado en memoria de la propia
// pantalla, no vuelve a pasar por aquí.
registrarPantalla('#/calendario', pintarCalendario);
registrarPantalla('#/calendario/:fecha', pintarCalendario);
// El área de dinero (§11 del diseño): TODAS sus rutas pasan por conPuertaDeDinero,
// que pide la segunda contraseña si no hay sesión de dinero abierta. La lista de
// dueños y la ficha de uno comparten la ruta con parámetro por el mismo motivo que
// clientes.js: '#/dinero/duenos/nuevo' llega a pintarDuenos con 'nuevo' capturado.
registrarPantalla('#/dinero', conPuertaDeDinero(pintarDinero));
registrarPantalla('#/dinero/cuenta/:clave', conPuertaDeDinero(pintarCuentaDeDueno));
registrarPantalla('#/dinero/duenos', conPuertaDeDinero(pintarDuenos));
registrarPantalla('#/dinero/duenos/:duenoId', conPuertaDeDinero(pintarDuenos));

const pantallaEntrada = document.getElementById('entrada');
const pantallaApp = document.getElementById('app');
const forma = document.getElementById('forma-entrada');
const campoUsuario = document.getElementById('usuario');
const campoClave = document.getElementById('clave');
const elError = document.getElementById('error-entrada');
const botonEntrar = forma.querySelector('button[type="submit"]');
const botonSalir = document.getElementById('salir');

const RUTA_INICIAL = '#/flota';

function mostrarError(mensaje) {
  elError.textContent = mensaje;
  elError.hidden = false;
}

function limpiarError() {
  elError.hidden = true;
  elError.textContent = '';
}

function verEntrada() {
  pantallaApp.hidden = true;
  pantallaEntrada.hidden = false;
}

function verCascaron() {
  pantallaEntrada.hidden = true;
  pantallaApp.hidden = false;
  // Cambiar el hash no redibuja si ya era ese mismo valor (no hay 'hashchange'),
  // por eso también se llama mostrar() aquí de una vez.
  location.hash = RUTA_INICIAL;
  mostrar(RUTA_INICIAL);
}

forma.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarError();
  botonEntrar.disabled = true;
  try {
    await entrar(campoUsuario.value.trim(), campoClave.value);
    // El cambio a la pantalla del cascarón lo hace alCambiarSesion, no aquí:
    // así la entrada reacciona igual sin importar quién disparó la sesión.
  } catch (error) {
    mostrarError(error.message);
  } finally {
    botonEntrar.disabled = false;
  }
});

// «Salir» cierra TAMBIÉN el área de dinero, y primero: la sesión de dinero vive en
// una app de Firebase aparte, así que salir del mostrador no la cierra, y quien se
// sentara después leería dinero desde la consola sin ninguna de las dos
// contraseñas (§11). `salirDelSistema` espera el cierre —no lo dispara y se olvida:
// la cola de dinero-sesion.js se traga su rechazo— y, si no se pudo cerrar, recarga
// la página, que es lo único que mata esa sesión con seguridad.
botonSalir.addEventListener('click', () => {
  salirDelSistema({
    salirDelMostrador: salir,
    // Si fallara el cierre de sesión no hay nada más que decirle al dueño:
    // el aviso de sesión (alCambiarSesion) ya gobierna qué pantalla se ve.
    alFallarElMostrador: () => aviso('No se pudo cerrar la sesión. Intenta de nuevo.', 'error'),
  });
});

// Salir del área de dinero —a cualquier otra pantalla— la cierra. El enrutador no
// avisa cuando se deja una pantalla, así que se mira cada cambio de ruta. Sin
// sesión abierta esto no hace nada (ni baja Firebase para cerrar).
window.addEventListener('hashchange', () => {
  if (!enElAreaDeDinero(location.hash)) cerrarElDineroOReiniciar();
});

// Comienza a vigilar la versión desde el arranque.
vigilarVersion();

// Limpia, una vez por computadora, el costo de los dueños que la copia local de
// contratos haya guardado desde antes de ADR-002. Va aquí y no tras iniciar
// sesión: IndexedDB es del navegador y no de la cuenta, y sobrevive a «Salir»,
// así que quien se siente en esta computadora la lee igual. Corre por detrás y
// sin esperar: si falla (otra pestaña con la base bloqueada, por ejemplo) no hay
// marca puesta y el siguiente arranque lo reintenta; al dueño no le cambia nada.
limpiarCopiaLocalDelCosto().catch((error) => {
  console.warn('No se pudo limpiar el costo de los dueños de la copia local de contratos:', error);
});

// Escucha la sesión antes de dibujar nada: mientras Firebase no exista de
// verdad (claves sin pegar en firebase-config.js) esta promesa se rechaza, y
// eso es correcto — se avisa en español y la pantalla de entrada se queda
// visible, en vez de una página en blanco o un error técnico en consola.
alCambiarSesion((usuario) => {
  if (usuario) {
    verCascaron();
  } else {
    // Sea cual sea el motivo por el que el mostrador se quedó sin sesión (Salir, o
    // que Firebase la venciera), el área de dinero se cierra con ella.
    cerrarElDineroOReiniciar();
    verEntrada();
  }
}).catch(() => {
  mostrarError('No se pudo conectar con el sistema. Revisa tu conexión a internet o avisa al encargado.');
});
