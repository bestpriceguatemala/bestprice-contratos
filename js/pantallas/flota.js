// Pantalla principal: la flota con su estado (§6 del diseño, "Principal — la
// flota").
//
// El principio es "se ve el carro, no el papeleo": un cuadro por carro, y el
// botón para recibirlo vive en el carro que está afuera — nunca hay que ir a
// buscar un número de contrato en otra pantalla.
//
// Esta pantalla no muestra ningún monto cobrado, utilidad ni comisión: esa
// promesa es del "área de dinero" bajo contraseña (§6, §11). Las dos listas de
// pendientes de abajo son la única excepción que permite el diseño, porque ahí
// el monto es lo que falta para poder cerrar el contrato, no una cifra de
// negocio.
import { estadoCarro, pendientesDe } from '../nucleo/estados.js';
import { resumen } from '../nucleo/contrato.js';
import { diasEntre, hoyISO } from '../nucleo/fechas.js';
import { cargarFlota, cargarContratosAbiertos } from '../datos.js';
import { dinero, fecha } from '../ui.js';

const ESTADOS = {
  disponible: { clase: 'es-disponible', etiqueta: 'Disponible' },
  rentado: { clase: 'es-rentado', etiqueta: 'Rentado' },
  atrasado: { clase: 'es-atrasado', etiqueta: 'Atrasado' },
  'fuera de servicio': { clase: 'es-fuera', etiqueta: 'Fuera de servicio' },
};

// El nombre del cliente y el motivo de "fuera de servicio" son texto libre que
// el dueño escribió en algún formulario; se escapan antes de entrar al HTML
// para que un "&" o un "<" sueltos no rompan el cuadro del carro.
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pluralDias = (n) => `${n} día${n === 1 ? '' : 's'}`;

function botonAccion(texto, ruta, primario = true) {
  return `<a class="btn ${primario ? 'btn-primario' : ''}" href="${ruta}">${esc(texto)}</a>`;
}

/** El cuadro de un carro: placas, marca y línea, y su estado. */
function tarjetaCarro(carro, info) {
  const { estado, contrato, diasAtraso, fueraDeServicio, motivo } = info;
  const cfg = ESTADOS[estado];
  const encabezado = [carro?.placas, carro?.marca, carro?.linea].filter(Boolean).join(' · ');

  let cuerpo = '';
  let boton;
  if (estado === 'disponible') {
    boton = botonAccion('Sacar carro', `#/sacar/${carro.id}`);
  } else if (estado === 'fuera de servicio') {
    cuerpo = `<p class="carro-detalle">${esc(motivo || 'Sin motivo registrado')}</p>`;
    boton = botonAccion('Volver a habilitar', `#/habilitar/${carro.id}`, false);
  } else {
    // rentado o atrasado: en los dos manda quién tiene el carro (§5, Estados).
    const detalle = estado === 'atrasado'
      ? `Atrasado ${pluralDias(diasAtraso)}`
      : `Vuelve el ${esc(fecha(contrato?.devolucionPrevista))}`;
    cuerpo = `
      <p class="carro-cliente">${esc(contrato?.clienteNombre || 'Cliente sin nombre')}</p>
      <p class="carro-detalle ${estado === 'atrasado' ? 'carro-atraso' : ''}">${detalle}</p>`;
    boton = botonAccion('Recibir carro', `#/recibir/${contrato.id}`);
  }

  // Un carro marcado fuera de servicio que además anda rentado no pierde su
  // cuadro azul o rojo (dónde está el carro manda); el motivo se ve aparte,
  // en una etiqueta gris, sin tapar al cliente ni el botón de recibir.
  const etiqueta = fueraDeServicio && estado !== 'fuera de servicio'
    ? `<span class="etiqueta-fuera">${esc(motivo || 'Fuera de servicio')}</span>`
    : '';

  return `
    <article class="tarjeta-carro ${cfg.clase}">
      <header><span class="punto"></span><strong>${esc(encabezado)}</strong></header>
      <p class="carro-estado">${cfg.etiqueta}</p>
      ${etiqueta}
      ${cuerpo}
      ${boton}
    </article>`;
}

function filaPendiente(cliente, montoTexto, diasTexto) {
  return `<li><strong>${esc(cliente)}</strong><span>${esc(montoTexto)}</span><span>${esc(diasTexto)}</span></li>`;
}

/** Solo aparece si hay algo que mostrar (§6: las listas son la excepción, no la regla). */
function seccionPendientes(titulo, filas) {
  if (!filas.length) return '';
  return `<section class="pendientes"><h2>${esc(titulo)}</h2><ul class="lista-pendientes">${filas.join('')}</ul></section>`;
}

/**
 * La barra roja de arriba cuando una lectura falló (hallazgo crítico de la
 * revisión final). Nunca se inventa un mundo vacío o verde a partir de un
 * fallo: en vez de eso se avisa, arriba de lo que sí se pudo mostrar, que lo
 * que se ve puede estar mal o incompleto.
 */
function barraFallo(falloFlota, falloContratos) {
  const mensajes = [];
  if (falloFlota) {
    mensajes.push('No se pudo leer la flota. Puede que falten carros o que la lista esté incompleta.');
  }
  if (falloContratos) {
    mensajes.push('No se pudieron leer los contratos. Los estados que ves pueden estar equivocados.');
  }
  if (!mensajes.length) return '';
  return `<div class="barra-lectura-fallida">${mensajes.map((m) => `<p>${esc(m)}</p>`).join('')}</div>`;
}

function dibujar(contenedor, flota, contratos, hoy, { falloFlota = false, falloContratos = false } = {}) {
  const barra = barraFallo(falloFlota, falloContratos);

  if (!flota.length) {
    // Una flota vacía por un fallo de lectura no es lo mismo que una flota
    // vacía de verdad (CRÍTICO 2): con la nube caída y sin copia local no se
    // sabe si hay carros o no, así que no se invita a "agregar el primero"
    // como si el negocio estuviera arrancando de cero.
    contenedor.innerHTML = falloFlota
      ? `${barra}<p class="pendiente">No se pudo leer la flota. Intenta de nuevo o revisa la conexión.</p>`
      : `${barra}<p class="pendiente">Todavía no hay carros en la flota.<br>
        <a href="#/carros/nuevo" class="btn btn-primario">Agregar el primer carro</a></p>`;
    return;
  }

  const tarjetas = flota
    .map((carro) => tarjetaCarro(carro, estadoCarro(carro, contratos, hoy)))
    .join('');

  // Garantías por liberar: solo contratos que ya regresaron (tienen cierre) y
  // cuya garantía sigue bloqueada — mientras el carro sigue afuera, la
  // garantía está bien retenida, eso no es algo "por liberar" todavía.
  //
  // pendientesDe(c).garantia (no `garantiaLiberada === false`): un contrato
  // guardado sin ese campo cuenta como pendiente, igual que en el resto del
  // sistema — olvidar una garantía bloqueada es peor que mostrarla de más.
  const filasGarantia = contratos
    .filter((c) => c?.cierre?.fechaReal && pendientesDe(c).garantia)
    .map((c) => filaPendiente(
      c?.clienteNombre || 'Cliente sin nombre',
      dinero(c?.garantiaMonto),
      `${pluralDias(Math.max(0, diasEntre(c.cierre.fechaReal, hoy)))} esperando`,
    ));

  // Pendientes de cobro: cualquier contrato con saldo, haya regresado o no —
  // un cliente puede quedar debiendo desde el día que sacó el carro.
  const filasCobro = contratos
    .filter((c) => resumen(c).saldo > 0)
    .map((c) => filaPendiente(
      c?.clienteNombre || 'Cliente sin nombre',
      dinero(resumen(c).saldo),
      pluralDias(Math.max(0, diasEntre(c?.cierre?.fechaReal || c?.fechaSalida, hoy))),
    ));

  contenedor.innerHTML = `
    ${barra}
    <div class="flota-cuadros">${tarjetas}</div>
    ${seccionPendientes('Garantías por liberar', filasGarantia)}
    ${seccionPendientes('Pendientes de cobro', filasCobro)}
  `;
}

const RUTA = '#/flota';

// Cuenta cuántas veces se ha llamado pintarFlota, para que una sincronía que
// llega tarde sepa si su llamada sigue siendo la última (ver `repintar` más
// abajo). El router de esta pantalla reutiliza siempre el mismo <main
// id="pantalla">, solo le cambia el contenido — por eso comprobar si el nodo
// sigue "conectado" al documento no serviría de nada, nunca deja de estarlo.
let ultimoToken = 0;

/** Dibuja la pantalla principal dentro de `contenedor`. */
export async function pintarFlota(contenedor) {
  const miToken = ++ultimoToken;
  const hoy = hoyISO();
  let flota = [];
  let contratos = [];
  let falloFlota = false;
  let falloContratos = false;
  let flotaLista = false;

  // Redibuja en el mismo cuadro de carros cuando la nube trae algo distinto
  // de lo que ya se sirvió, o cuando falla (T9/CRÍTICO 2). Antes de pintar se
  // comprueba que esta llamada siga siendo la vigente: que el hash no se haya
  // ido a otra pantalla, y que no haya entrado una llamada más nueva a
  // pintarFlota (por ejemplo, salir de la flota y volver a entrar).
  // Cualquiera de las dos formas de quedar obsoleto se ignora en silencio.
  const sigoVigente = () => location.hash === RUTA && miToken === ultimoToken;
  const repintar = () => {
    if (!sigoVigente()) return;
    // Mientras los carros todavía no llegan ni una sola vez no hay nada
    // confiable que dibujar: se avisa que se está cargando en vez de dejar
    // la pantalla en blanco (hallazgo importante de la revisión final).
    if (!flotaLista) { contenedor.innerHTML = '<p class="pendiente">Cargando…</p>'; return; }
    dibujar(contenedor, flota, contratos, hoy, { falloFlota, falloContratos });
  };
  repintar();

  // Los contratos se piden sin esperarlos: cargarContratosAbiertos ya avisa
  // por su cuenta (alLlegar) en cuanto tiene algo, y su propia promesa
  // también se recoge aquí para el primer dato. No se hace `await` de esto
  // antes de pedir la flota — ese `await` era justo el problema (importante
  // 5): con Promise.all, un primer arranque sin copia local de contratos
  // (hasta los 8 s de LIMITE_NUBE_MS en datos.js) bloqueaba también el dibujo
  // de los carros, que la mayoría de las veces sí tenían copia local lista.
  cargarContratosAbiertos((r) => { contratos = r.datos; falloContratos = r.fallo; repintar(); })
    .then((r) => { contratos = r.datos; falloContratos = r.fallo; repintar(); });

  // La flota sí se espera: es lo mínimo que hace falta para dibujar algo con
  // sentido (el diseño promete la pantalla principal en menos de un segundo,
  // y cargarFlota() sirve la copia local al instante casi siempre).
  const rFlota = await cargarFlota((r) => { flota = r.datos; falloFlota = r.fallo; repintar(); });
  flota = rFlota.datos;
  falloFlota = rFlota.fallo;
  flotaLista = true;
  repintar();
}
