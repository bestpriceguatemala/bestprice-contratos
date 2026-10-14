// Cuándo se le recuerda el respaldo, y qué años le faltan (§10 del diseño).
//
// §10 dice «un archivo de Excel por año» y «al entrar, si pasó un año desde el último respaldo, el sistema lo
// recuerda». Juntas esas dos reglas dejan un hueco que aquí se cierra: el archivo de 2026 que se baja en octubre de
// 2026 no lleva noviembre ni diciembre, y el de 2027 empieza en enero. Si el aviso solo mirara «¿pasó un año?», lo
// que ocurra entre el día del respaldo y el 31 de diciembre no estaría en ningún archivo. Por eso se guarda la fecha
// de cada año bajado, y un año solo cuenta como completo si se bajó DESPUÉS de que terminó.
//
// Aquí no se lee el reloj: `hoy` llega de fuera, en texto 'YYYY-MM-DD' (hoyISO(), que cuenta el día de Guatemala). Los
// días se cuentan con diasEntre, como todas las fechas del sistema.
import { diasEntre, esFechaISO } from './fechas.js';

/** Un año de días. Con un año bisiesto de por medio avisa un día antes que el aniversario exacto, y ese día de más es inofensivo. */
export const DIAS_PARA_RECORDAR = 365;

// Un reloj atrasado o adelantado en otra computadora no debe hacer saltar el aviso de más.
const TOLERANCIA_DE_RELOJ_DIAS = 2;

/**
 * ¿Hay que recordarle el respaldo? Sí si pasó un año o más desde el último, si nunca se bajó, o si la fecha guardada no
 * se entiende o está en el futuro lejano: un dato dañado nunca apaga el aviso (callar es lo peligroso aquí, avisar de
 * más no cuesta nada).
 */
export function respaldoVencido(ultimo, hoy) {
  if (!esFechaISO(ultimo) || !esFechaISO(hoy)) return true;
  const dias = diasEntre(ultimo, hoy);
  if (dias < -TOLERANCIA_DE_RELOJ_DIAS) return true;
  return dias >= DIAS_PARA_RECORDAR;
}

/** La fecha del respaldo más reciente de todos los años bajados, o `null`. `porAnio` es `{ '2026': '2026-10-12' }`. */
export function ultimoRespaldo(porAnio) {
  const fechas = Object.values(porAnio ?? {}).filter(esFechaISO).sort();
  return fechas.length ? fechas[fechas.length - 1] : null;
}

/**
 * Los años que se pueden bajar ahora —el de hoy y el anterior—, con lo que se sabe de cada uno:
 * `{ anio, bajadoEl, completo, esDelAnioEnCurso, ofrecer }`. El más nuevo primero.
 *
 * `completo` es que el archivo de ese año se bajó cuando el año ya había terminado. El año en curso nunca lo está.
 *
 * `ofrecer` es si la pantalla debe ponerlo a la vista. El año en curso siempre. El anterior solo cuando hay algo que
 * hacer con él: ya se bajó pero antes de que terminara (le faltan las rentas del final), o todavía no se baja y estamos
 * en el primer trimestre, que es cuando se cierra el año anterior. En octubre de 2026 no se le ofrece un «2025»: el
 * sistema ni existía. Cualquier otro año se baja con «Otro año».
 */
export function estadoDeLosAnios(porAnio, hoy) {
  const anioDeHoy = Number(String(hoy).slice(0, 4));
  const mesDeHoy = Number(String(hoy).slice(5, 7));
  return [anioDeHoy, anioDeHoy - 1].map((anio) => {
    const fecha = porAnio?.[anio] ?? porAnio?.[String(anio)];
    const bajadoEl = esFechaISO(fecha) ? fecha : null;
    const esDelAnioEnCurso = anio === anioDeHoy;
    const completo = Boolean(bajadoEl) && !esDelAnioEnCurso && bajadoEl >= `${anio + 1}-01-01`;
    const ofrecer = esDelAnioEnCurso || (bajadoEl ? !completo : mesDeHoy <= 3);
    return {
      anio, bajadoEl, esDelAnioEnCurso, completo, ofrecer,
    };
  });
}

/** Del 1 de enero al 31 de diciembre, en el formato de `fechaSalida`. */
export function rangoDelAnio(anio) {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

/** Cómo se llama el archivo que baja (§10: `Best Price 2026.xlsx`). */
export function nombreDelArchivo(anio) {
  return `Best Price ${anio}.xlsx`;
}
