// Los avisos que aparecen mientras se saca un carro.
//
// Son advertencias, no candados: el dueño decide. Puede rentarle a un conocido
// con la licencia recién vencida si así lo quiere. Lo que no puede es que nadie
// se lo haya dicho.
import { diasEntre } from './fechas.js';
import { resumen } from './contrato.js';

const alto = (mensaje) => ({ nivel: 'alto', mensaje });
const medio = (mensaje) => ({ nivel: 'medio', mensaje });

/**
 * ¿Se encima [a1, a2] con [b1, b2]?
 *
 * Tocarse no es encimarse: un carro que regresa el 20 puede volver a salir el
 * 20, y eso pasa a diario. Solo hay choque cuando de verdad se traslapan días,
 * por eso la comparación es estricta.
 */
function seEnciman(a1, a2, b1, b2) {
  if (!a1 || !a2 || !b1 || !b2) return false;
  return diasEntre(a1, b2) > 0 && diasEntre(b1, a2) > 0;
}

// El precio y los días NO se avisan: el dueño pone el precio que quiera en cada
// renta y el sistema no opina. Un aviso que él no quiere lo entrena a ignorar
// los que sí importan.
export function avisosDeSalida({ cliente, carro, contrato, contratosDelCliente = [], contratosDelCarro = [], hoy }) {
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
    const plural = tardes === 1 ? 'vez' : 'veces';
    avisos.push(medio(`Este cliente ya devolvió tarde ${tardes} ${plural}.`));
  }

  const encimado = contratosDelCarro.find((otro) =>
    otro.id !== contrato?.id &&
    seEnciman(contrato?.fechaSalida, contrato?.devolucionPrevista, otro.fechaSalida, otro.devolucionPrevista));
  if (encimado) {
    avisos.push(alto(`Este carro tiene otro contrato del ${encimado.fechaSalida} al ${encimado.devolucionPrevista}.`));
  }

  return [...avisos.filter((a) => a.nivel === 'alto'), ...avisos.filter((a) => a.nivel === 'medio')];
}
