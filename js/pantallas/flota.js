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
import { estadoCarro, garantiaPorLiberar, puedeCerrar } from '../nucleo/estados.js';
import { resumen } from '../nucleo/contrato.js';
import { resumenDeHoy } from '../nucleo/calendario.js';
import { diasEntre, hoyISO } from '../nucleo/fechas.js';
import {
  cargarFlota, cargarContratosAbiertos, cargarReservas, liberarGarantia, puedeLiberarse,
} from '../datos.js';
import { dinero, fecha, aviso } from '../ui.js';

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

// ---------- El resumen del día (§12b del diseño, "Al entrar al sistema") ----------
//
// "Cuatro números y nada más [...] Es para saber de un vistazo si el día
// viene tranquilo, no para leerlo." Por eso nada de esto cuenta ni filtra
// nada: las cuatro cifras salen ya calculadas de resumenDeHoy() (núcleo/
// calendario.js) — aquí solo se deciden colores, texto y hacia dónde apunta
// cada una.

/**
 * Cómo se pinta una cifra del resumen: 'apagado' en cero (para que un día
 * tranquilo SE VEA tranquilo), 'alerta' solo para atrasados y solo cuando
 * los hay, 'normal' en cualquier otro caso. El rojo no se reparte a las
 * otras tres aunque salgan en positivo — "hoy salen 3" no es un problema,
 * es el día de trabajo normal; un aviso que el dueño no necesitaba le
 * enseña a ignorar los que sí importan. Función pura para poder probarla
 * sin DOM.
 */
export function estiloCifraResumen(valor, esAtrasados = false) {
  if (valor === 0) return 'apagado';
  return esAtrasados ? 'alerta' : 'normal';
}

const COLOR_CIFRA = { apagado: 'var(--gris)', alerta: 'var(--rojo)', normal: 'var(--navy)' };

/**
 * Una de las cuatro cifras: el número, su etiqueta y el enlace a su detalle
 * ("cada número lleva a su detalle", brief Paso 2). `incompleto` cambia el
 * número por "—" en vez de una cifra que podría estar mintiendo — una
 * lectura fallida nunca se dibuja como si el día estuviera tranquilo
 * (hallazgo ya conocido de esta pantalla, ver barraFallo). El enlace sigue
 * ahí aunque el número no se pueda confiar: el destino no depende de si la
 * cifra cuadra.
 */
function cifraResumen({
  etiqueta, valor, href, dataAccion, esAtrasados = false, incompleto = false,
}) {
  const estilo = incompleto ? 'apagado' : estiloCifraResumen(valor, esAtrasados);
  const texto = incompleto ? '—' : String(valor);
  const pesoLetra = estilo === 'alerta' ? '700' : '600';
  const atributoAccion = dataAccion ? ` data-accion="${esc(dataAccion)}"` : '';
  return `
    <a class="resumen-cifra"${atributoAccion} href="${esc(href)}"
      style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 18px;min-width:120px;text-decoration:none;">
      <strong style="font-size:1.9em;line-height:1;font-weight:${pesoLetra};color:${COLOR_CIFRA[estilo]};">${texto}</strong>
      <span style="font-size:0.82em;color:var(--gris);text-align:center;">${esc(etiqueta)}</span>
    </a>`;
}

/**
 * El bloque completo, arriba de la flota (brief: "un preview con la
 * información necesaria pero no detallada"). Salen y regresan van al día de
 * hoy en el calendario (`#/calendario/:fecha`, la ruta que registra esa
 * pantalla); atrasados y garantías apuntan a lo que ya existe más abajo en
 * esta misma pantalla — el grupo de tarjetas y la lista de "Garantías por
 * liberar" — así que viajan con un data-accion que el manejador de clics de
 * pintarFlota resuelve haciendo scroll, en vez de inventar una ruta nueva.
 *
 * "regresan" se rotula "Regresan hoy", no "Hoy regresan": son citas de HOY
 * que TODAVÍA no volvieron (movimientosDelDia ya saca del conteo el carro
 * que ya está en el patio) — es una lista de pendientes, no el total del
 * día, y el rótulo tiene que decirlo así para no sugerir lo contrario.
 */
function seccionResumen(numeros, hoy, { falloReservas = false, falloContratos = false } = {}) {
  const rutaCalendario = `#/calendario/${hoy}`;
  const cifras = [
    cifraResumen({
      etiqueta: 'Salen hoy', valor: numeros.salen, href: rutaCalendario, incompleto: falloReservas,
    }),
    cifraResumen({
      etiqueta: 'Regresan hoy', valor: numeros.regresan, href: rutaCalendario, incompleto: falloContratos,
    }),
    cifraResumen({
      etiqueta: 'Atrasados',
      valor: numeros.atrasados,
      href: '#/flota',
      dataAccion: 'ver-atrasados',
      esAtrasados: true,
      incompleto: falloContratos,
    }),
    cifraResumen({
      etiqueta: 'Garantías por liberar',
      valor: numeros.garantias,
      href: '#/flota',
      dataAccion: 'ver-garantias',
      incompleto: falloContratos,
    }),
  ].join('');
  return `<section class="resumen-dia" aria-label="Resumen del día"
    style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-bottom:24px;">${cifras}</section>`;
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

/**
 * El mensaje del confirm() antes de soltar una garantía (Tarea 5, Paso 1):
 * nombra al cliente y el monto porque, según el dueño, esto "no se deshace
 * desde el sistema" — una vez suelta, la tarjeta ya no vuelve a quedar
 * retenida sin sacar un contrato nuevo. Función pura para poder probarla sin
 * DOM ni `confirm()`.
 */
export function textoConfirmarLiberar(contrato) {
  const cliente = contrato?.clienteNombre || 'este cliente';
  return `¿Liberar la garantía de ${dinero(contrato?.garantiaMonto)} de ${cliente}? `
    + 'Esto no se puede deshacer desde el sistema.';
}

/**
 * El aviso de éxito al soltar la garantía. Se apoya en `puedeCerrar`
 * (nucleo/estados.js, parte de las interfaces de esta tarea) en vez de
 * asumir que el contrato queda cerrado: `liberarGarantia` ya garantiza que el
 * saldo está en cero antes de dejar pasar (puedeLiberarse), así que en la
 * práctica siempre cierra — pero el mensaje se arma preguntándole al núcleo,
 * no repitiendo esa regla por su cuenta aquí.
 */
export function textoAvisoGarantiaLiberada(contrato) {
  return puedeCerrar(contrato)
    ? `Garantía liberada. Contrato N.° ${contrato?.numero ?? '—'} cerrado.`
    : 'Garantía liberada.';
}

function filaGarantia(contrato, montoTexto, diasTexto) {
  // `puedeLiberarse` (datos.js) decide aquí, antes de que se apriete nada,
  // si este botón de verdad puede soltar la garantía; si no puede, su motivo
  // ("Todavía debe Qxxx...") queda de una vez en el título del botón, para
  // que el mostrador lo vea sin tener que apretar primero. El candado real
  // sigue siendo `liberarGarantia`, que se llama igual al hacer clic — este
  // adelanto es solo para que el botón no engañe con un "sí se puede" falso.
  const motivo = puedeLiberarse(contrato);
  const titulo = motivo ? ` title="${esc(motivo)}"` : '';
  return `<li>
    <strong>${esc(contrato?.clienteNombre || 'Cliente sin nombre')}</strong>
    <span>${esc(montoTexto)}</span>
    <span>${esc(diasTexto)}</span>
    <button type="button" class="btn" data-accion="liberar" data-id="${esc(contrato?.id)}"${titulo}>Liberar garantía</button>
  </li>`;
}

function filaCobro(contrato, montoTexto, diasTexto) {
  // "Cobrar" abre Recibir carro en modo de solo cobro (Tarea 5, Paso 3): el
  // "?cobro=1" viaja pegado al id porque el enrutador (router.js) empareja
  // rutas por pedazos separados con "/", sin saber nada de parámetros de
  // consulta — recibirCarro.js es quien separa el id real de ese sufijo.
  return `<li>
    <strong>${esc(contrato?.clienteNombre || 'Cliente sin nombre')}</strong>
    <span>${esc(montoTexto)}</span>
    <span>${esc(diasTexto)}</span>
    <a class="btn" href="#/recibir/${esc(contrato?.id)}?cobro=1">Cobrar</a>
  </li>`;
}

/**
 * Solo aparece si hay algo que mostrar (§6: las listas son la excepción, no
 * la regla). `id`, cuando se da, es el destino al que apunta la cifra
 * "Garantías por liberar" del resumen de arriba (seccionResumen) — sin
 * inventar una ruta nueva, solo hace scroll hasta aquí.
 */
function seccionPendientes(titulo, filas, id) {
  if (!filas.length) return '';
  const atributoId = id ? ` id="${esc(id)}"` : '';
  return `<section class="pendientes"${atributoId}><h2>${esc(titulo)}</h2><ul class="lista-pendientes">${filas.join('')}</ul></section>`;
}

/**
 * La barra roja de arriba cuando una lectura falló (hallazgo crítico de la
 * revisión final). Nunca se inventa un mundo vacío o verde a partir de un
 * fallo: en vez de eso se avisa, arriba de lo que sí se pudo mostrar, que lo
 * que se ve puede estar mal o incompleto.
 */
function barraFallo(falloFlota, falloContratos, falloReservas) {
  const mensajes = [];
  if (falloFlota) {
    mensajes.push('No se pudo leer la flota. Puede que falten carros o que la lista esté incompleta.');
  }
  if (falloContratos) {
    mensajes.push('No se pudieron leer los contratos. Los estados que ves pueden estar equivocados.');
  }
  if (falloReservas) {
    mensajes.push('No se pudieron leer las reservaciones. Lo que sale hoy puede estar incompleto.');
  }
  if (!mensajes.length) return '';
  return `<div class="barra-lectura-fallida">${mensajes.map((m) => `<p>${esc(m)}</p>`).join('')}</div>`;
}

function dibujar(contenedor, flota, contratos, reservas, hoy, {
  falloFlota = false, falloContratos = false, falloReservas = false,
} = {}) {
  const barra = barraFallo(falloFlota, falloContratos, falloReservas);
  // El resumen va arriba de todo (brief: "arriba de la flota"), incluso
  // cuando la flota misma no se pudo leer o está vacía — sus cuatro números
  // no dependen de la lista de carros, solo de reservas y contratos.
  //
  // Se llama `bloqueResumen`, no `resumen`: esta función ya importa
  // `resumen` de nucleo/contrato.js (el saldo de un contrato, usado más
  // abajo en filasGarantia/filasCobro) — un nombre igual aquí lo taparía
  // silenciosamente y `resumen(c).saldo` reventaría más abajo.
  const bloqueResumen = seccionResumen(
    resumenDeHoy(hoy, { reservas, contratos }),
    hoy,
    { falloReservas, falloContratos },
  );

  if (!flota.length) {
    // Una flota vacía por un fallo de lectura no es lo mismo que una flota
    // vacía de verdad (CRÍTICO 2): con la nube caída y sin copia local no se
    // sabe si hay carros o no, así que no se invita a "agregar el primero"
    // como si el negocio estuviera arrancando de cero.
    contenedor.innerHTML = falloFlota
      ? `${barra}${bloqueResumen}<p class="pendiente">No se pudo leer la flota. Intenta de nuevo o revisa la conexión.</p>`
      : `${barra}${bloqueResumen}<p class="pendiente">Todavía no hay carros en la flota.<br>
        <a href="#/carros/nuevo" class="btn btn-primario">Agregar el primer carro</a></p>`;
    return;
  }

  const tarjetas = flota
    .map((carro) => tarjetaCarro(carro, estadoCarro(carro, contratos, hoy)))
    .join('');

  // Garantías por liberar: la regla vive en núcleo/estados.js
  // (garantiaPorLiberar), no aquí — es la misma función que usa
  // resumenDeHoy() para la cifra del bloque de arriba, para que esa cifra y
  // esta lista, en la misma pantalla, no puedan volver a decir números
  // distintos (bug real que encontró Tarea 7: la cifra contaba también las
  // garantías de carros todavía afuera).
  const filasGarantia = contratos
    .filter(garantiaPorLiberar)
    .map((c) => filaGarantia(
      c,
      dinero(c?.garantiaMonto),
      `${pluralDias(Math.max(0, diasEntre(c.cierre.fechaReal, hoy)))} esperando`,
    ));

  // Pendientes de cobro: cualquier contrato con saldo, haya regresado o no —
  // un cliente puede quedar debiendo desde el día que sacó el carro.
  const filasCobro = contratos
    .filter((c) => resumen(c).saldo > 0)
    .map((c) => filaCobro(
      c,
      dinero(resumen(c).saldo),
      pluralDias(Math.max(0, diasEntre(c?.cierre?.fechaReal || c?.fechaSalida, hoy))),
    ));

  contenedor.innerHTML = `
    ${barra}
    ${bloqueResumen}
    <div class="flota-cuadros" id="flota-cuadros">${tarjetas}</div>
    ${seccionPendientes('Garantías por liberar', filasGarantia, 'pendientes-garantia')}
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
  let reservas = [];
  let falloFlota = false;
  let falloContratos = false;
  let falloReservas = false;
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
    dibujar(contenedor, flota, contratos, reservas, hoy, { falloFlota, falloContratos, falloReservas });
  };

  // Único manejador de clics para los botones que viven dentro de las listas
  // de pendientes (por ahora solo "Liberar garantía": "Cobrar" es un enlace
  // normal, el enrutador ya lo resuelve solo) y para las dos cifras del
  // resumen que no van al calendario ("Atrasados" y "Garantías por liberar"):
  // esas apuntan a algo que ya existe más abajo en esta misma pantalla
  // (brief, Paso 2), así que el clic no navega — solo hace scroll hasta ahí.
  // Se asigna con `onclick`, no `addEventListener`: el router reutiliza
  // siempre el mismo <main id="pantalla">, así que un `addEventListener` aquí
  // se iría acumulando cada vez que se vuelve a entrar a esta pantalla en la
  // misma sesión, y un solo clic terminaría llamando a `liberarGarantia`
  // varias veces (o repitiendo el scroll varias veces).
  contenedor.onclick = (ev) => {
    const salto = ev.target.closest('[data-accion="ver-atrasados"], [data-accion="ver-garantias"]');
    if (salto) {
      ev.preventDefault();
      const destino = salto.dataset.accion === 'ver-atrasados' ? 'flota-cuadros' : 'pendientes-garantia';
      document.getElementById(destino)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const boton = ev.target.closest('[data-accion="liberar"]');
    if (!boton) return;
    const contrato = contratos.find((c) => c?.id === boton.dataset.id);
    if (contrato) liberarDesdeLaLista(contrato, boton);
  };

  /**
   * Suelta la garantía de un contrato desde su renglón en "Garantías por
   * liberar", sin recargar la pantalla (Tarea 5, Pasos 1 y 2).
   */
  async function liberarDesdeLaLista(contrato, boton) {
    // El candado rápido: si `puedeLiberarse` ya sabe que no se puede, se
    // avisa de una vez —con el mismo motivo que daría `liberarGarantia`— sin
    // molestar con un confirm() para una acción que de todas formas fallaría.
    const motivo = puedeLiberarse(contrato);
    if (motivo) { aviso(motivo, 'error'); return; }

    // Soltar una garantía "no se deshace desde el sistema" (regla del
    // dueño): se confirma nombrando al cliente y el monto antes de tocar nada.
    if (!window.confirm(textoConfirmarLiberar(contrato))) return;

    boton.disabled = true;
    try {
      const actualizado = await liberarGarantia(contrato);
      aviso(textoAvisoGarantiaLiberada(actualizado), 'exito');
      // El contrato recién cerrado sale de la lista en memoria: los filtros
      // de `dibujar` (garantía liberada, saldo en cero) ya lo excluirían
      // solos, pero quitarlo aquí evita arrastrar en `contratos` un cerrado
      // que cargarContratosAbiertos() tampoco volvería a traer.
      contratos = contratos.filter((c) => c?.id !== actualizado.id);
      repintar();
    } catch (error) {
      // liberarGarantia es el candado de verdad (por si el saldo cambió
      // entre que se pintó la lista y este clic — otro cobro desde otra
      // pestaña, por ejemplo); su mensaje ya dice cuánto debe.
      aviso(error.message, 'error');
      boton.disabled = false;
    }
  }

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

  // Las reservaciones, mismo patrón: solo alimentan el resumen de arriba
  // ("salen hoy"), no el resto de la pantalla, así que tampoco vale la pena
  // esperarlas antes de dibujar algo.
  cargarReservas((r) => { reservas = r.datos; falloReservas = r.fallo; repintar(); })
    .then((r) => { reservas = r.datos; falloReservas = r.fallo; repintar(); });

  // La flota sí se espera: es lo mínimo que hace falta para dibujar algo con
  // sentido (el diseño promete la pantalla principal en menos de un segundo,
  // y cargarFlota() sirve la copia local al instante casi siempre).
  const rFlota = await cargarFlota((r) => { flota = r.datos; falloFlota = r.fallo; repintar(); });
  flota = rFlota.datos;
  falloFlota = rFlota.fallo;
  flotaLista = true;
  repintar();
}
