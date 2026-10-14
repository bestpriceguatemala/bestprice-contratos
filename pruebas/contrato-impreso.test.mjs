// Pruebas del contrato impreso sobre el papel preimpreso (pantallas/contratoImpreso.js, §8 del diseño, ADR-001 y ADR-003).
//
// QUÉ CUBREN Y QUÉ NO. Cubren lo que decide QUÉ SE ESCRIBE en cada casilla del papel (de qué campo del contrato,
// del cliente o del carro sale, y qué pasa cuando falta), que nada del texto tecleado por el mostrador rompa la hoja,
// que la calibración sea UN solo `transform`, y —lo que más importa— que el número completo de la tarjeta y el CBC
// no salgan del camino teclado → hoja → impresora. NO cubren que el papel salga alineado ni que el navegador
// respete la página sin margen: eso solo se ve imprimiendo en un navegador de verdad (ver el informe), y el CSS aquí
// solo se prueba como texto: que la regla exista con sus declaraciones, no que Chrome la obedezca.
//
// Los contratos de estas pruebas NO están inventados: se arman con las mismas funciones que arman los reales
// (`construirContrato`, la de «Sacar carro», y `contratoParaGuardar`, la de datos.js) y el cliente con
// `construirCliente`. Así llevan exactamente los campos de §7b y ninguno que no exista.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  armarContratoImpreso, htmlContratoImpreso, htmlHojaDePrueba, pintarContratoImpreso, pintarImpresionDeContrato,
  pintarCalibracion, HITOS, PASOS_DE_CALIBRAR, MARCAS_DE_ESCALA,
} from '../js/pantallas/contratoImpreso.js';
import {
  CAMPOS, ORIGEN_MM, PAPEL, ESCALA_EXCEL, cajaDeRango, campoPorId, leerCalibraciones, calibracionActiva, CALIBRACION_DE_FABRICA,
  CLAVE_DE_CALIBRACIONES, guardarCalibracion, PASOS,
} from '../js/nucleo/hojaContrato.js';
import { construirContrato } from '../js/pantallas/sacarCarro.js';
import { contratoParaGuardar } from '../js/datos.js';
import { construirCliente } from '../js/nucleo/cliente.js';
import { lineasSalida } from '../js/nucleo/contrato.js';
import { plantillaDetalle, accionDeImpresion } from '../js/pantallas/contratos.js';
import { emparejar } from '../js/router.js';

const AHORA = 1790000000000;

// ---------------------------------------------------------------------------
// Los datos de prueba, armados con las funciones de verdad
// ---------------------------------------------------------------------------

const CAMPOS_DEL_CLIENTE = {
  nombres: 'Juan Carlos',
  apellidos: 'Pérez Gómez',
  fechaNacimiento: '1990-03-15',
  documento: '2380 10120 0101',
  documentoExtendidoEn: 'Guatemala',
  documentoExpira: '2031-11-02',
  licencia: '1234 56789 0101',
  licenciaEmitidaEn: 'Guatemala',
  licenciaExpira: '2029-06-30',
  direccionReferencia: '7a avenida 15-90 zona 13',
  municipio: 'Guatemala',
  telefono: '5555-1234',
  correo: 'juan@example.com',
  // la nacionalidad ya no la pide la ficha (3 de octubre) pero los clientes viejos la conservan
  nacionalidad: 'GUATEMALTECA',
};

function cliente(extra = {}) {
  return construirCliente({ id: 'k1' }, { ...CAMPOS_DEL_CLIENTE, ...extra });
}

const CARRO = {
  id: 'v1', codigo: 2, placas: 'P-234IFN', tipo: 'CAMIONETA', marca: 'MITSUBISHI', linea: 'MONTERO', color: 'PLATEADO', modelo: '2024', propiedad: 'Propio',
};

const TARJETAS = [
  { ultimos4: '3343', vencimiento: '04/30', banco: 'BAC GUATEMALA', autorizacion: '1234', montoAutorizado: 15000 },
  { ultimos4: '1111', vencimiento: '11/28', banco: 'BANRURAL', autorizacion: '9876', montoAutorizado: 5000 },
];

/** Un contrato de un carro de la flota, tal como QUEDA GUARDADO, con todos los datos que el papel usa. */
function contrato(extra = {}) {
  const salida = construirContrato({
    id: 'c1',
    numero: 77,
    cliente: cliente(),
    ajeno: false,
    carro: CARRO,
    carroAjeno: null,
    duenoId: null,
    fechaSalida: '2026-08-20',
    horaSalida: '15:00',
    lugar: 'OFICINA',
    dias: 5,
    precioDia: 700,
    kmSalida: 234343,
    combustibleSalida: '3/4',
    seguroDia: 72,
    seguroTercerosDia: 120,
    seguroMenoresDia: 10,
    seguroPaiDia: 5,
    deducible: 55000,
    deducibleBajo: 250,
    cartaPoderDestino: 'EL SALVADOR',
    cartaPoderPrecio: 350,
    variosDescripcion: 'Lavado',
    variosPrecio: 80,
    tarjetas: TARJETAS,
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 3500,
    rentadoPor: 'DENNIS',
    porcentajeComision: 5,
    conductorAdicional: { nombre: 'ESTEBAN URIZAR', licencia: '2380 10120 0101', identificacion: '' },
    observaciones: 'una nota',
    ...extra,
  });
  return contratoParaGuardar(salida, { id: 'c1', numero: 77, ahora: AHORA });
}

/** Un contrato de un carro de otra persona (subarrendado): sus datos viven en `carroAjeno`, no en la flota. */
function contratoAjeno(extra = {}) {
  return contrato({
    ajeno: true,
    carro: null,
    carroAjeno: {
      placas: 'P-999ZZZ', tipo: 'PICKUP', marca: 'FORD', color: 'ROJO', modelo: '2019', dueno: 'Mario López', costoDia: 300,
    },
    duenoId: 'd1',
    ...extra,
  });
}

/** Un contrato sin nada de lo opcional: lo que deja un mostrador que solo llenó lo obligatorio. */
function contratoMinimo() {
  return contratoParaGuardar(construirContrato({
    id: 'c2',
    numero: 78,
    cliente: { id: 'k2', nombres: 'Ana', apellidos: 'Ruiz' },
    ajeno: false,
    carro: { id: 'v2', placas: 'P-000AAA' },
    carroAjeno: null,
    duenoId: null,
    fechaSalida: '2026-09-01',
    dias: 1,
    precioDia: 500,
    tarjetas: [],
    forma: 'efectivo',
    porcentajeTarjeta: 0,
    montoPago: 500,
    rentadoPor: 'Ana',
    porcentajeComision: 5,
  }), { id: 'c2', numero: 78, ahora: AHORA });
}

const entrada = (extra = {}) => ({ contrato: contrato(), cliente: cliente(), carro: CARRO, ...extra });
const valores = (extra) => armarContratoImpreso(entrada(extra)).valores;

/** Congela un objeto y todo lo que cuelga de él: una función que intente escribir en él lanza. */
function congelar(objeto) {
  if (objeto && typeof objeto === 'object' && !Object.isFrozen(objeto)) {
    Object.freeze(objeto);
    Object.values(objeto).forEach(congelar);
  }
  return objeto;
}

// ---------------------------------------------------------------------------
// armarContratoImpreso: qué dato alimenta cada casilla
// ---------------------------------------------------------------------------

test('un contrato sin id, o ni siquiera un contrato, se niega: no hay nada guardado que imprimir', () => {
  for (const malo of [undefined, null, {}, { numero: 1 }, 'c1', 7]) {
    assert.throws(() => armarContratoImpreso({ contrato: malo, cliente: cliente() }), /Falta el contrato guardado/, JSON.stringify(malo));
  }
  assert.throws(() => armarContratoImpreso(), /Falta el contrato guardado/);
  assert.throws(() => armarContratoImpreso({}), /Falta el contrato guardado/);
});

test('un contrato sin cliente se niega, con un mensaje en español que dice cuál contrato', () => {
  for (const sin of [undefined, null, 'Juan', 5]) {
    assert.throws(
      () => armarContratoImpreso({ contrato: contrato(), cliente: sin, carro: CARRO }),
      (error) => /No se encontró al cliente del contrato N\.° 77/.test(error.message) && /nombre ni documento/.test(error.message),
      JSON.stringify(sin),
    );
  }
  // y no deja salir una hoja a medias: ni siquiera se arma el modelo
  let modelo;
  assert.throws(() => { modelo = armarContratoImpreso({ contrato: contrato(), cliente: null }); });
  assert.equal(modelo, undefined);
});

test('el contrato rico llena cada casilla con el dato que le toca', () => {
  const v = valores();
  const esperado = {
    // el carro (de la flota)
    carroTipo: 'CAMIONETA', carroMarcaLinea: 'MITSUBISHI MONTERO', carroPlacas: 'P-234IFN', carroColor: 'PLATEADO', carroModelo: '2024',
    kmSalida: '234343', combustibleSalida: '3/4',
    // fechas, horas y lugares
    fechaSalida: '20-08-26', fechaEntrada: '25-08-26', horaSalida: '15:00', horaEntrada: '15:00', lugarSalida: 'OFICINA',
    // el cliente
    apellido1: 'Pérez Gómez', nombre1: 'Juan Carlos', nacionalidad: 'GUATEMALTECA',
    fechaNacimiento: '15         03         1990', correo: 'juan@example.com', direccion: '7a avenida 15-90 zona 13',
    municipio: 'Guatemala', telefono: '5555-1234',
    documento: '2380 10120 0101', documentoExtendidoEn: 'Guatemala', documentoExpira: '02  11    31',
    licencia: '1234 56789 0101', licenciaEmitidaEn: 'Guatemala', licenciaExpira: '30  06    29',
    conductorNombre: 'ESTEBAN URIZAR', conductorLicencia: '2380 10120 0101',
    // el dinero
    precioBase: 'Q508.00', seguroTerceros: 'Q120.00', seguro: 'Q72.00', seguroCopia: 'Q72.00',
    deducible: 'Q55,000.00', deducibleCopia: '55,000.00', deducibleBajo: 'Q250.00',
    seguroMenores: 'Q10.00', seguroPai: 'Q5.00', variosDescripcion: 'Lavado', variosPrecio: 'Q80.00',
    cartaPoderDestino: 'EL SALVADOR', cartaPoderPrecio: 'Q350.00',
    // las tarjetas (enmascaradas: el número completo nunca se guardó)
    tarjeta1Numero: '•••• 3343', tarjeta1Vence: '04/30', tarjeta1Banco: 'BAC GUATEMALA', tarjeta1Monto: 'Q15,000.00',
    tarjeta2Numero: '•••• 1111', tarjeta2Vence: '11/28', tarjeta2Monto: 'Q5,000.00', tarjeta2Autorizacion: '9876',
    rentadoPor: 'DENNIS',
  };
  for (const [id, texto] of Object.entries(esperado)) assert.equal(v[id], texto, id);
});

test('el modelo trae una entrada por cada campo de la tabla, y todas son texto', () => {
  const v = valores();
  assert.deepEqual(Object.keys(v).sort(), CAMPOS.map((c) => c.id).sort());
  for (const [id, texto] of Object.entries(v)) assert.equal(typeof texto, 'string', id);
});

test('cada campo que el sistema SÍ tiene sale con texto, y cada uno que NO tiene sale vacío aunque el contrato traiga cosas parecidas', () => {
  // Datos tentadores en los lugares donde alguien podría ir a buscar lo que el sistema no guarda.
  const tentador = { codigoCliente: 2, codigo: 2, numeroDeCliente: 2 };
  const v = valores({
    contrato: { ...contrato(), ...tentador },
    cliente: cliente({ codigo: 2, codigoCliente: 2, apellido2: 'Gómez', nombre2: 'Carlos' }),
  });
  for (const campo of CAMPOS) {
    if (campo.tipo === 'etiqueta') continue;
    // lo que viene del teclado al imprimir (el CBC, a quién se factura) está en blanco hasta que se teclea
    if (campo.tecleado) { assert.equal(v[campo.id], '', `${campo.id}: nunca sale del contrato`); continue; }
    if (campo.de === null) assert.equal(v[campo.id], '', `${campo.id}: el sistema no tiene este dato y no se inventa`);
    else assert.notEqual(v[campo.id], '', `${campo.id}: tiene fuente (${campo.de}) y salió vacío`);
  }
  assert.equal(v.codigoCliente, '', 'el código del cliente se queda vacío (decisión del 14 de octubre de 2026)');
  assert.equal(v.apellido2, '');
  assert.equal(v.nombre2, '');
});

test('los textos fijos de Excel salen en el modelo con su texto, espacios incluidos', () => {
  const v = valores();
  assert.equal(v.etiquetaAcepto, 'ACEPTO LOS CARGOS A MI TARJETA NUMERO');
  assert.equal(v.etiquetaCodigo, 'CODIGO');
  assert.equal(v.etiquetaTarjeta1, 'TARJETA 1  No:');
  assert.equal(v.etiquetaExpira1, 'EXPIRA:');
  assert.equal(v.etiquetaExpira2, 'EXPIRA:');
  assert.equal(v.etiquetaCbc1, 'CODIGO CBC');
  assert.equal(v.etiquetaCbc2, 'CODIGO CBC');
  assert.equal(v.etiquetaBanco, 'BANCO EMISOR');
  assert.equal(v.departamento, 'GUATEMALA');
  assert.equal(v.deducibleIva, ' + iva');
});

test('los textos fijos no cuentan como «se sale de su casilla»: Excel los deja salirse a propósito', () => {
  const modelo = armarContratoImpreso(entrada());
  assert.ok(!modelo.avisos.some((a) => /Texto fijo/.test(a)), modelo.avisos.join('\n'));
  // «EXPIRA:» no cabe en su celda (una sola columna) y aun así es lo que Excel imprime
  assert.equal(modelo.valores.etiquetaExpira1, 'EXPIRA:');
});

// ---------------------------------------------------------------------------
// Lo que el papel lleva y el sistema no guarda (decisión del 14 de octubre de 2026)
// ---------------------------------------------------------------------------

const papel = (datosDelPapel) => valores({ datosDelPapel });

test('a quién se factura sale de lo que se tecleó al imprimir, y en blanco si no se tecleó', () => {
  assert.equal(valores().facturarNombre, '');
  assert.equal(valores().facturarNit, '');
  const v = papel({ facturarNombre: ' Transportes López, S.A. ', facturarNit: ' 1234567-8 ' });
  assert.equal(v.facturarNombre, 'Transportes López, S.A.');
  assert.equal(v.facturarNit, '1234567-8');
  // lo del cliente o del contrato NO se usa para facturar: son datos que el sistema no tiene
  const tentador = valores({ cliente: cliente({ nit: '9999999-9', facturarA: 'X' }), contrato: { ...contrato(), nit: '8888888-8', facturarA: 'Y' } });
  assert.equal(tentador.facturarNit, '');
  assert.equal(tentador.facturarNombre, '');
});

test('el lugar de entrada se precarga con el lugar de la salida y se puede corregir; borrarlo lo deja en blanco', () => {
  assert.equal(valores().lugarEntrada, 'OFICINA', 'sin tocar: el de la salida');
  assert.equal(papel({ lugarEntrada: 'AEROPUERTO' }).lugarEntrada, 'AEROPUERTO', 'corregido');
  assert.equal(papel({ lugarEntrada: '' }).lugarEntrada, '', 'borrado a propósito: en blanco, no el de la salida');
  assert.equal(papel({ lugarEntrada: null }).lugarEntrada, 'OFICINA');
  assert.equal(papel({ lugarEntrada: undefined }).lugarEntrada, 'OFICINA');
  // y si la salida no tenía lugar, queda en blanco
  assert.equal(valores({ contrato: contrato({ lugar: '' }) }).lugarEntrada, '');
});

test('las dos tarifas del papel vienen del código (Q150 y Q65), se pueden corregir y pasan por q() y dinero()', () => {
  const v = valores();
  assert.equal(v.horaTardia, 'Q150.00');
  assert.equal(v.combustiblePrecio, 'Q65.00');
  assert.equal(papel({ horaTardia: '200', combustiblePrecio: '70.5' }).horaTardia, 'Q200.00');
  assert.equal(papel({ horaTardia: '200', combustiblePrecio: '70.5' }).combustiblePrecio, 'Q70.50');
  assert.equal(papel({ horaTardia: 1234.567 }).horaTardia, 'Q1,234.57', 'q() redondea los centavos');
  // una tarifa borrada, en cero o que no es un número sale en blanco, nunca «Q0.00» ni «NaN»
  for (const nada of ['', '0', 0, 'abc', '   ']) {
    assert.equal(papel({ horaTardia: nada }).horaTardia, '', JSON.stringify(nada));
    assert.equal(papel({ combustiblePrecio: nada }).combustiblePrecio, '', JSON.stringify(nada));
  }
  // tocar una no toca la otra
  assert.equal(papel({ horaTardia: '' }).combustiblePrecio, 'Q65.00');
  assert.equal(papel({ combustiblePrecio: '' }).horaTardia, 'Q150.00');
  // y NO salen del contrato: el cobro de hora tardía que se anota al recibir es otra cosa
  const conCobro = valores({ contrato: { ...contrato(), horaTardia: 999, cierre: { horaTardia: 888 } } });
  assert.equal(conCobro.horaTardia, 'Q150.00');
});

test('datosDelPapel que no es un objeto no rompe nada: todo cae a los valores de siempre', () => {
  for (const raro of [undefined, null, 'x', 5, [], true]) {
    const v = valores({ datosDelPapel: raro });
    assert.equal(v.lugarEntrada, 'OFICINA', JSON.stringify(raro));
    assert.equal(v.horaTardia, 'Q150.00');
    assert.equal(v.facturarNombre, '');
  }
});

test('lo tecleado para este papel no toca el contrato, el cliente ni el carro', () => {
  const c = congelar(contrato());
  const k = congelar(cliente());
  const antes = JSON.stringify([c, k]);
  const modelo = armarContratoImpreso({ contrato: c, cliente: k, carro: CARRO, datosDelPapel: congelar({ facturarNombre: 'ZZZ', facturarNit: '777', lugarEntrada: 'QQQ', horaTardia: '999', combustiblePrecio: '888' }) });
  assert.equal(JSON.stringify([c, k]), antes);
  assert.equal(modelo.valores.facturarNit, '777');
  assert.ok(!antes.includes('ZZZ') && !antes.includes('777') && !antes.includes('QQQ'));
});

test('un carro AJENO se lee de carroAjeno, nunca de la flota, aunque venga una ficha de flota con otros datos', () => {
  const v = valores({
    contrato: contratoAjeno(),
    carro: { ...CARRO, tipo: 'DE LA FLOTA', color: 'DE LA FLOTA', modelo: '1999', placas: 'P-FLOTA' },
  });
  assert.equal(v.carroTipo, 'PICKUP');
  assert.equal(v.carroColor, 'ROJO');
  assert.equal(v.carroModelo, '2019');
  assert.equal(v.carroMarcaLinea, 'FORD', 'un carro ajeno trae marca y no línea');
  assert.equal(v.carroPlacas, 'P-999ZZZ');
  assert.ok(!JSON.stringify(v).includes('DE LA FLOTA'));
  assert.ok(!JSON.stringify(v).includes('P-FLOTA'));
  // el costo que se le paga al dueño nunca llega a un papel que firma el cliente
  assert.ok(!JSON.stringify(v).includes('300'), 'el costo del dueño no sale');
  assert.ok(!JSON.stringify(v).includes('Mario López'), 'ni el nombre del dueño');
});

test('un carro de la flota que no se encontró deja tipo, color y modelo en blanco y lo avisa; lo guardado en el contrato sí sale', () => {
  const modelo = armarContratoImpreso({ contrato: contrato(), cliente: cliente(), carro: null });
  assert.equal(modelo.valores.carroTipo, '');
  assert.equal(modelo.valores.carroColor, '');
  assert.equal(modelo.valores.carroModelo, '');
  assert.equal(modelo.valores.carroPlacas, 'P-234IFN');
  assert.equal(modelo.valores.carroMarcaLinea, 'MITSUBISHI MONTERO');
  assert.ok(modelo.avisos.some((a) => /No se encontró la ficha del carro/.test(a)));
  // con el carro encontrado no hay tal aviso
  assert.ok(!armarContratoImpreso(entrada()).avisos.some((a) => /ficha del carro/.test(a)));
  // y uno ajeno nunca la necesita
  assert.ok(!armarContratoImpreso({ contrato: contratoAjeno(), cliente: cliente(), carro: null }).avisos.some((a) => /ficha del carro/.test(a)));
});

test('lo que falta sale vacío: ni «0», ni «undefined», ni «null», ni «NaN», ni «Q0.00»', () => {
  const v = armarContratoImpreso({ contrato: contratoMinimo(), cliente: { id: 'k2', nombres: 'Ana', apellidos: 'Ruiz' }, carro: { id: 'v2', placas: 'P-000AAA' } }).valores;
  for (const [id, texto] of Object.entries(v)) {
    assert.equal(typeof texto, 'string', id);
    assert.ok(!/undefined|null|NaN|Infinity/.test(texto), `${id}: «${texto}»`);
    assert.ok(!/^-?Q?0(\.00)?$/.test(texto), `${id}: un cero en vez de una casilla en blanco («${texto}»)`);
  }
  assert.equal(v.kmSalida, '');
  assert.equal(v.deducible, '');
  assert.equal(v.seguro, '');
  assert.equal(v.seguroTerceros, '');
  assert.equal(v.cartaPoderPrecio, '');
  assert.equal(v.tarjeta1Numero, '');
  assert.equal(v.tarjeta1Monto, '');
  assert.equal(v.fechaNacimiento, '');
  assert.equal(v.horaSalida, '');
  assert.equal(v.apellido1, 'Ruiz');
  assert.equal(v.nombre1, 'Ana');
  // lo que sí hay
  assert.equal(v.fechaSalida, '01-09-26');
  assert.equal(v.precioBase, 'Q500.00');
});

test('el nombre del cliente sale de la forma vieja de cuatro campos si es la que tiene', () => {
  const viejo = { id: 'k9', nombre1: 'Rosa', nombre2: 'María', apellido1: 'Díaz', apellido2: 'Lara' };
  const v = valores({ cliente: viejo });
  assert.equal(v.nombre1, 'Rosa María');
  assert.equal(v.apellido1, 'Díaz Lara');
});

test('el precio por día sale SIN los seguros, que van aparte: 700 − 72 − 120 = 508', () => {
  const v = valores();
  assert.equal(v.precioBase, 'Q508.00');
  assert.equal(v.seguroTerceros, 'Q120.00');
  assert.equal(v.seguro, 'Q72.00');
  // sin seguros, el precio entero
  const sinSeguros = valores({ contrato: contrato({ seguroDia: 0, seguroTercerosDia: 0 }) });
  assert.equal(sinSeguros.precioBase, 'Q700.00');
  assert.equal(sinSeguros.seguro, '');
  assert.equal(sinSeguros.seguroTerceros, '');
});

test('si los seguros igualan o pasan el precio por día, NO sale una cifra negativa o cero: sale en blanco y la pantalla avisa', () => {
  for (const [seguro, terceros] of [[400, 300], [700, 0], [500, 500]]) {
    const modelo = armarContratoImpreso(entrada({ contrato: contrato({ seguroDia: seguro, seguroTercerosDia: terceros }) }));
    assert.equal(modelo.valores.precioBase, '', `${seguro} + ${terceros}`);
    assert.ok(modelo.avisos.some((a) => /no pasa de lo que suman el seguro y el seguro de terceros/.test(a)), `${seguro} + ${terceros}`);
  }
  // un precio de cero no es un precio por debajo de los seguros: no hay aviso, solo no hay precio
  const sinPrecio = armarContratoImpreso(entrada({ contrato: contrato({ precioDia: 0, seguroDia: 0, seguroTercerosDia: 0 }) }));
  assert.equal(sinPrecio.valores.precioBase, '');
  assert.ok(!sinPrecio.avisos.some((a) => /seguro de terceros/.test(a)));
});

test('el dinero sale con dinero(): la Q, los miles y dos decimales; y los centavos se redondean con q()', () => {
  const v = valores({ contrato: contrato({ deducible: 1234.5, seguroDia: 72.005, tarjetas: [{ ...TARJETAS[0], montoAutorizado: 1234567.891 }] }) });
  assert.equal(v.deducible, 'Q1,234.50');
  assert.equal(v.deducibleCopia, '1,234.50', 'la copia de abajo va sin la Q (así la imprime Excel)');
  assert.equal(v.seguro, 'Q72.01');
  assert.equal(v.tarjeta1Monto, 'Q1,234,567.89');
});

test('la carta poder: el precio sale de la línea «Carta poder» de lineasSalida, el destino se imprime aunque no tenga precio', () => {
  const con = contrato();
  const linea = lineasSalida(con).find((l) => l.concepto === 'Carta poder');
  assert.equal(linea.monto, 350, 'el cobro que ve el mostrador al salir');
  const v = valores({ contrato: con });
  assert.equal(v.cartaPoderPrecio, 'Q350.00');
  assert.equal(v.cartaPoderDestino, 'EL SALVADOR');
  // sin precio: no hay cobro, pero el destino se imprime (el Excel lo hace así)
  const sinPrecio = valores({ contrato: contrato({ cartaPoderPrecio: 0 }) });
  assert.equal(sinPrecio.cartaPoderPrecio, '');
  assert.equal(sinPrecio.cartaPoderDestino, 'EL SALVADOR');
  // sin destino: el precio sí
  const sinDestino = valores({ contrato: contrato({ cartaPoderDestino: '' }) });
  assert.equal(sinDestino.cartaPoderPrecio, 'Q350.00');
  assert.equal(sinDestino.cartaPoderDestino, '');
  // y sin nada, nada
  const nada = valores({ contrato: contrato({ cartaPoderDestino: '', cartaPoderPrecio: 0 }) });
  assert.equal(nada.cartaPoderPrecio, '');
  assert.equal(nada.cartaPoderDestino, '');
});

test('una fecha que no es de calendario sale en blanco y la pantalla lo dice, nunca «NaN» en el papel', () => {
  const modelo = armarContratoImpreso(entrada({
    cliente: cliente({ fechaNacimiento: '1990-02-30', documentoExpira: '2031-13-02' }),
    contrato: { ...contrato(), fechaSalida: '2026-13-01', devolucionPrevista: '2026-08-32' },
  }));
  assert.equal(modelo.valores.fechaNacimiento, '');
  assert.equal(modelo.valores.documentoExpira, '');
  assert.equal(modelo.valores.fechaSalida, '');
  assert.equal(modelo.valores.fechaEntrada, '');
  const avisos = modelo.avisos.join('\n');
  assert.match(avisos, /fecha de salida no es una fecha válida \(«2026-13-01»\)/);
  assert.match(avisos, /devolución prevista no es una fecha válida/);
  assert.match(avisos, /fecha de nacimiento del cliente no es una fecha válida/);
  assert.match(avisos, /expiración del documento no es una fecha válida/);
  // una fecha vacía, en cambio, no es un error: simplemente no hay dato
  const vacia = armarContratoImpreso(entrada({ cliente: cliente({ fechaNacimiento: '' }) }));
  assert.equal(vacia.valores.fechaNacimiento, '');
  assert.ok(!vacia.avisos.some((a) => /nacimiento/.test(a)));
});

test('un texto más largo que su casilla se avisa; uno que cabe, no', () => {
  const largo = armarContratoImpreso(entrada({ cliente: cliente({ apellidos: 'De la Cruz y Fernández de Córdoba y Montenegro' }) }));
  assert.ok(largo.avisos.some((a) => /«Primer apellido» es más largo que su casilla/.test(a)), largo.avisos.join('\n'));
  assert.ok(!armarContratoImpreso(entrada()).avisos.some((a) => /más largo que su casilla/.test(a)));
});

test('un contrato en efectivo (sin tarjetas) deja en blanco el bloque de la tarjeta y no avisa de ninguna', () => {
  const modelo = armarContratoImpreso(entrada({ contrato: contrato({ tarjetas: [] }) }));
  for (const id of ['tarjeta1Numero', 'tarjeta1Vence', 'tarjeta1Cbc', 'tarjeta1Banco', 'tarjeta1Monto', 'tarjeta2Numero', 'tarjeta2Monto']) {
    assert.equal(modelo.valores[id], '', id);
  }
  assert.deepEqual(modelo.tarjetas, []);
  assert.ok(!modelo.avisos.some((a) => /Tarjeta/.test(a)));
});

// ---------------------------------------------------------------------------
// ADR-001: el número completo de la tarjeta y el CBC
// ---------------------------------------------------------------------------

const NUMERO_COMPLETO = '4111 1111 1111 3343';
const CBC = '7391';

test('ADR-001: sin lo tecleado, la tarjeta sale enmascarada con los últimos 4 y el CBC en blanco', () => {
  const modelo = armarContratoImpreso(entrada());
  assert.equal(modelo.valores.tarjeta1Numero, '•••• 3343');
  assert.equal(modelo.valores.tarjeta1Cbc, '');
  assert.equal(modelo.valores.tarjeta2Numero, '•••• 1111');
  assert.equal(modelo.valores.tarjeta2Cbc, '');
  assert.deepEqual(modelo.tarjetas, [{ completa: false }, { completa: false }]);
  assert.equal(modelo.avisos.filter((a) => /enmascarado/.test(a)).length, 2);
  // sin número tecleado no hay nada que comparar con los últimos 4: ningún aviso de «no termina como la tarjeta»
  assert.ok(!modelo.avisos.some((a) => /no termina/.test(a)));
});

test('ADR-001: lo tecleado para este papel sale tal cual en la hoja, y solo en los dos campos de la tarjeta', () => {
  const modelo = armarContratoImpreso(entrada({ tarjetasEfimeras: [{ numero: ` ${NUMERO_COMPLETO} `, cbc: ` ${CBC} ` }] }));
  assert.equal(modelo.valores.tarjeta1Numero, NUMERO_COMPLETO);
  assert.equal(modelo.valores.tarjeta1Cbc, CBC);
  // la segunda tarjeta no se tecleó: sigue enmascarada
  assert.equal(modelo.valores.tarjeta2Numero, '•••• 1111');
  assert.deepEqual(modelo.tarjetas, [{ completa: true }, { completa: false }]);
  // el número y el CBC no aparecen en NINGÚN otro lugar del modelo: ni en otro campo ni en los avisos
  const resto = { ...modelo, valores: { ...modelo.valores, tarjeta1Numero: '', tarjeta1Cbc: '' } };
  const texto = JSON.stringify(resto);
  assert.ok(!texto.includes('4111'), 'el número completo se coló fuera de su campo');
  assert.ok(!texto.includes(CBC), 'el CBC se coló fuera de su campo');
});

test('ADR-001: armar la hoja NO toca el contrato, el cliente ni el carro (se les congela para probarlo)', () => {
  const c = congelar(contrato());
  const k = congelar(cliente());
  const v = congelar({ ...CARRO });
  const antes = JSON.stringify([c, k, v]);
  const modelo = armarContratoImpreso({ contrato: c, cliente: k, carro: v, tarjetasEfimeras: [{ numero: NUMERO_COMPLETO, cbc: CBC }] });
  assert.equal(JSON.stringify([c, k, v]), antes);
  assert.ok(!JSON.stringify(c).includes('4111') && !JSON.stringify(c).includes(CBC));
  assert.equal(modelo.valores.tarjeta1Cbc, CBC);
  // y lo tecleado tampoco queda cargado en las listas que se le pasaron
  const efimeras = congelar([{ numero: NUMERO_COMPLETO, cbc: CBC }]);
  armarContratoImpreso({ contrato: c, cliente: k, carro: v, tarjetasEfimeras: efimeras });
});

test('ADR-001: un número en blanco o de más no cambia lo que sale', () => {
  const enBlanco = armarContratoImpreso(entrada({ tarjetasEfimeras: [{ numero: '   ', cbc: CBC }] }));
  assert.equal(enBlanco.valores.tarjeta1Numero, '•••• 3343', 'sin número no hay tarjeta completa');
  assert.deepEqual(enBlanco.tarjetas[0], { completa: false });
  // el CBC solo, sin número, SÍ se imprime: es lo que se tecleó (el número puede haberse puesto a mano en el papel)
  assert.equal(enBlanco.valores.tarjeta1Cbc, CBC);
  // una tarjeta tecleada de más (el contrato solo tiene dos) no se imprime en ningún lado
  const demas = armarContratoImpreso(entrada({
    tarjetasEfimeras: [{ numero: NUMERO_COMPLETO, cbc: CBC }, { numero: '5500 0000 0000 1111', cbc: '123' }, { numero: '9999 9999 9999 9999', cbc: '999' }],
  }));
  assert.ok(!JSON.stringify(demas).includes('9999'));
  // algo que no es una lista no rompe nada
  for (const raro of [undefined, null, 'x', 5, {}]) {
    assert.equal(armarContratoImpreso(entrada({ tarjetasEfimeras: raro })).valores.tarjeta1Numero, '•••• 3343');
  }
});

test('ADR-001: un número que no termina como la tarjeta del contrato se avisa, sin repetir lo tecleado', () => {
  const mala = armarContratoImpreso(entrada({ tarjetasEfimeras: [{ numero: '4111 1111 1111 9999', cbc: CBC }] }));
  const aviso = mala.avisos.find((a) => /no termina en los últimos 4 dígitos/.test(a));
  assert.ok(aviso, mala.avisos.join('\n'));
  assert.ok(aviso.includes('•••• 3343'));
  assert.ok(!mala.avisos.join('').includes('9999'), 'el aviso no repite lo que se tecleó');
  assert.ok(!mala.avisos.join('').includes(CBC));
  // el que coincide no avisa de nada
  const buena = armarContratoImpreso(entrada({ tarjetasEfimeras: [{ numero: NUMERO_COMPLETO, cbc: CBC }, { numero: '5500 0000 0000 1111', cbc: '123' }] }));
  assert.deepEqual(buena.avisos, []);
});

// ---------------------------------------------------------------------------
// htmlContratoImpreso
// ---------------------------------------------------------------------------

const html = (extra, cal) => htmlContratoImpreso(armarContratoImpreso(entrada(extra)), cal);

/** El estilo en línea de un campo de la hoja, partido en sus declaraciones. */
function estiloDe(texto, id) {
  const m = new RegExp(`<div class="([^"]*)" data-campo="${id}" style="([^"]*)">`).exec(texto);
  assert.ok(m, `la hoja no trae el campo ${id}`);
  return { clase: m[1].split(' '), css: Object.fromEntries(m[2].split(';').filter(Boolean).map((d) => d.split(':'))) };
}

test('el texto que teclea el mostrador entra escapado: un & o un < no rompen ni inyectan nada en la hoja', () => {
  const malo = `O'Brien & <b>Hijos</b> "SA" <script>x</script>`;
  const hoja = html({ cliente: cliente({ apellidos: malo, direccionReferencia: '<img src=x onerror=alert(1)>', nombres: '& < > " \'' }) });
  assert.ok(hoja.includes('O&#39;Brien &amp; &lt;b&gt;Hijos&lt;/b&gt; &quot;SA&quot; &lt;script&gt;x&lt;/script&gt;'));
  assert.ok(hoja.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(hoja.includes('&amp; &lt; &gt; &quot; &#39;'));
  assert.ok(!/<b>|<script|<img/.test(hoja), 'quedó una etiqueta sin escapar');
});

test('lo tecleado en las cajas de la tarjeta también entra escapado, y el número del contrato en la etiqueta de la hoja', () => {
  const hoja = html({ tarjetasEfimeras: [{ numero: '4111 <i>1111</i> & 3343', cbc: '"7"' }] });
  assert.ok(hoja.includes('4111 &lt;i&gt;1111&lt;/i&gt; &amp; 3343'));
  assert.ok(hoja.includes('&quot;7&quot;'));
  assert.ok(!hoja.includes('<i>'));
  assert.match(hoja, /aria-label="Contrato N\.° 77"/);
  assert.match(htmlContratoImpreso({ numero: '"><x', valores: {} }), /aria-label="Contrato N\.° &quot;&gt;&lt;x"/);
});

test('la calibración es UN solo transform, el del lienzo: ningún campo tiene el suyo', () => {
  const hoja = html();
  assert.equal((hoja.match(/transform:/g) || []).length, 1, 'un solo transform en toda la hoja');
  assert.equal((hoja.match(/transform-origin:/g) || []).length, 1);
  assert.match(hoja, /<div class="hc-lienzo" style="transform-origin:17\.9mm 18\.52mm;transform:translate\(0mm, 0mm\) scale\(0\.77\);">/);
  const campos = hoja.match(/<div class="hc-campo[^>]*>/g);
  assert.ok(campos.length > 20);
  assert.ok(campos.every((c) => !/transform|translate|scale/.test(c)), 'un campo trae su propio corrimiento');
});

test('la calibración recibida es la que se escribe en el transform', () => {
  const hoja = html({}, { dx: 1.5, dy: -0.5, escala: 0.98 });
  assert.ok(hoja.includes('transform:translate(1.5mm, -0.5mm) scale(0.98);'));
  assert.equal((hoja.match(/transform:/g) || []).length, 1);
  // sin pasarla, la de fábrica (la que cabe en la carta)
  assert.ok(html().includes(`scale(${CALIBRACION_DE_FABRICA.escala})`));
});

test('cada campo cae en su caja de la tabla (más el origen de la hoja en la carta), con la letra de Excel por 0.89', () => {
  const hoja = html();
  for (const id of ['carroPlacas', 'fechaSalida', 'nombre1', 'tarjeta1Banco', 'rentadoPor', 'seguroTerceros', 'documentoExpira']) {
    const campo = campoPorId(id);
    const caja = cajaDeRango(campo.rango);
    const { css } = estiloDe(hoja, id);
    const mm = (clave) => Number.parseFloat(css[clave]);
    assert.ok(css.left.endsWith('mm') && css.top.endsWith('mm') && css.width.endsWith('mm') && css.height.endsWith('mm'), id);
    assert.ok(Math.abs(mm('left') - (ORIGEN_MM.x + caja.x)) < 0.002, `${id}: izquierda`);
    assert.ok(Math.abs(mm('top') - (ORIGEN_MM.y + caja.y)) < 0.002, `${id}: arriba`);
    assert.ok(Math.abs(mm('width') - caja.ancho) < 0.002, `${id}: ancho`);
    assert.ok(Math.abs(mm('height') - caja.alto) < 0.002, `${id}: alto`);
    assert.ok(css['font-size'].endsWith('pt'));
    assert.ok(Math.abs(Number.parseFloat(css['font-size']) - campo.pt * ESCALA_EXCEL) < 0.002, `${id}: tamaño de letra`);
  }
});

test('la hoja trae todo lo que Excel imprime Y tiene dato, rótulos y letra blanca incluidos, y nada de las casillas vacías', () => {
  const hoja = html({ tarjetasEfimeras: [{ numero: NUMERO_COMPLETO, cbc: CBC }], datosDelPapel: { facturarNombre: 'Empresa', facturarNit: '1234567-8' } });
  // los rótulos que el papel no trae
  for (const id of ['etiquetaAcepto', 'etiquetaCodigo', 'etiquetaTarjeta1', 'etiquetaExpira1', 'etiquetaExpira2', 'etiquetaCbc1', 'etiquetaCbc2', 'etiquetaBanco', 'departamento', 'deducibleIva']) {
    assert.ok(hoja.includes(`data-campo="${id}"`), `${id} no salió`);
  }
  // la letra blanca de Excel, que por decisión del dueño ahora se ve
  for (const id of ['kmSalida', 'licenciaExpira', 'conductorNombre', 'deducibleBajo', 'seguroMenores', 'seguroPai', 'variosDescripcion', 'variosPrecio', 'tarjeta2Autorizacion']) {
    assert.ok(hoja.includes(`data-campo="${id}"`), `${id} no salió`);
  }
  // lo tecleado y lo precargado
  for (const id of ['tarjeta1Numero', 'tarjeta1Cbc', 'facturarNombre', 'facturarNit', 'lugarEntrada', 'horaTardia', 'combustiblePrecio', 'carroPlacas', 'nombre1']) {
    assert.ok(hoja.includes(`data-campo="${id}"`), id);
  }
  // sin dato no hay caja: lo que el sistema no tiene (el código del cliente, el segundo apellido) queda sin su div
  for (const id of ['codigoCliente', 'apellido2', 'nombre2']) assert.ok(!hoja.includes(`data-campo="${id}"`), `${id} no tiene dato`);
  // el CBC y a quién se factura, sin teclear, tampoco tienen caja
  const sinTeclear = html();
  for (const id of ['tarjeta1Cbc', 'tarjeta2Cbc', 'facturarNombre', 'facturarNit']) assert.ok(!sinTeclear.includes(`data-campo="${id}"`), id);
});

test('un campo con `imprime: false` no sale en la hoja (la tabla conserva ese interruptor)', () => {
  const campo = campoPorId('kmSalida');
  assert.ok(html().includes('data-campo="kmSalida"'));
  try {
    campo.imprime = false;
    assert.ok(!html().includes('data-campo="kmSalida"'));
  } finally {
    delete campo.imprime;
  }
  assert.ok(html().includes('data-campo="kmSalida"'));
});

test('los textos fijos llevan sus espacios de Excel tal cual: dos en «TARJETA 1  No:» y uno delante de « + iva»', () => {
  const hoja = html();
  assert.ok(hoja.includes('<span class="hc-t">TARJETA 1  No:</span>'));
  assert.ok(hoja.includes('<span class="hc-t"> + iva</span>'));
  for (const id of ['etiquetaTarjeta1', 'deducibleIva', 'etiquetaAcepto']) assert.ok(estiloDe(hoja, id).clase.includes('hc-pre'), `${id}: el navegador no debe juntar sus espacios`);
  // y en su caja de la tabla, con la letra de Excel por 0.89
  const iva = estiloDe(hoja, 'deducibleIva');
  const caja = cajaDeRango('Y36:Y37');
  assert.ok(Math.abs(Number.parseFloat(iva.css.left) - (ORIGEN_MM.x + caja.x)) < 0.002);
  assert.ok(Math.abs(Number.parseFloat(iva.css['font-size']) - 10 * ESCALA_EXCEL) < 0.002);
});

test('cada campo lleva las clases de su fuente, su alineación y su ajuste', () => {
  const hoja = html();
  const placas = estiloDe(hoja, 'carroPlacas').clase;          // Arial 12, centrada, arriba
  assert.deepEqual(placas, ['hc-campo', 'hc-arial', 'hc-centro', 'hc-arriba']);
  const banco = estiloDe(hoja, 'tarjeta1Banco').clase;         // Arial Narrow, centrada, abajo
  assert.ok(banco.includes('hc-narrow') && banco.includes('hc-centro') && banco.includes('hc-abajo'));
  const salida = estiloDe(hoja, 'fechaSalida').clase;          // Arial Narrow, a la derecha, arriba
  assert.ok(salida.includes('hc-der') && salida.includes('hc-arriba') && !salida.includes('hc-pre'));
  const correo = estiloDe(hoja, 'correo').clase;               // ajusta renglón
  assert.ok(correo.includes('hc-ajusta'));
  assert.ok(!placas.includes('hc-ajusta'));
  // las fechas con espacios entre sus partes no se juntan: hc-pre
  for (const id of ['fechaNacimiento', 'documentoExpira']) assert.ok(estiloDe(hoja, id).clase.includes('hc-pre'), id);
  assert.ok(hoja.includes('<span class="hc-t">15         03         1990</span>'), 'los espacios de la fecha llegan intactos al HTML');
});

test('una hoja sin ningún dato no dibuja ninguna caja, pero sí el lienzo', () => {
  const vacia = htmlContratoImpreso({ numero: 1, valores: {} });
  assert.ok(vacia.includes('hc-lienzo'));
  assert.ok(!vacia.includes('hc-campo'));
});

// ---------------------------------------------------------------------------
// La hoja de prueba
// ---------------------------------------------------------------------------

test('la hoja de prueba trae una caja por cada campo de la tabla, de puntos las que no se imprimen', () => {
  const prueba = htmlHojaDePrueba();
  const cajas = prueba.match(/<div class="hp-caja[^"]*" data-campo="[^"]+"/g);
  assert.equal(cajas.length, CAMPOS.length);
  for (const campo of CAMPOS) {
    const caja = new RegExp(`<div class="(hp-caja[^"]*)" data-campo="${campo.id}"`).exec(prueba);
    assert.ok(caja, campo.id);
    assert.equal(caja[1].includes('hp-no'), campo.imprime === false, `${campo.id}: raya de puntos solo si no se imprime`);
    assert.equal(caja[1].includes('hp-hito-caja'), HITOS.some((h) => h.id === campo.id), `${campo.id}: grueso solo si es una de las cuatro`);
  }
  // sin letra: son cajas, no datos
  assert.ok(!/class="hp-caja[^"]*"[^>]*font-size/.test(prueba));
});

test('las cajas de la prueba están exactamente donde se imprimiría el dato', () => {
  const prueba = htmlHojaDePrueba();
  const hoja = html();
  const estiloDeCaja = (texto, id, clase) => new RegExp(`<div class="${clase}[^"]*" data-campo="${id}" style="([^"]*)"`).exec(texto)[1];
  const sinLetra = (estilo) => estilo.replace(/font-size:[^;]+;/, '');
  for (const id of ['carroPlacas', 'nombre1', 'fechaSalida', 'rentadoPor']) {
    assert.equal(estiloDeCaja(prueba, id, 'hp-caja'), sinLetra(estiloDeCaja(hoja, id, 'hc-campo')), id);
  }
});

test('la regla de la hoja de prueba marca cada 5 mm, numera cada 10 y NO se corre con la calibración', () => {
  const calibrada = htmlHojaDePrueba({ dx: 7, dy: -9, escala: 0.9 });
  assert.equal((calibrada.match(/hp-marca-x/g) || []).length, 44, 'de 0 a 215 mm, cada 5');
  assert.equal((calibrada.match(/hp-marca-y/g) || []).length, 56, 'de 0 a 275 mm, cada 5');
  assert.equal((calibrada.match(/hp-larga/g) || []).length, 22 + 28, 'una larga cada 10 mm en cada borde');
  assert.equal((calibrada.match(/class="hp-num hp-num-x"/g) || []).length, 21, 'números 10 a 210');
  assert.equal((calibrada.match(/class="hp-num hp-num-y"/g) || []).length, 27, 'números 10 a 270');
  assert.ok(calibrada.includes('<b class="hp-num hp-num-x" style="left:100mm">100</b>'), 'la marca de 100 mm, la que se mide con una regla de verdad');
  // la regla queda ANTES del lienzo: no es hija suya y no hereda su transform
  const regla = calibrada.indexOf('class="hp-regla"');
  const lienzo = calibrada.indexOf('class="hc-lienzo"');
  assert.ok(regla > 0 && lienzo > regla);
  assert.ok(calibrada.indexOf('</div>', regla) < lienzo, 'la regla se cierra antes de abrir el lienzo');
  assert.equal((calibrada.match(/transform:/g) || []).length, 1, 'un solo transform: el del lienzo');
  assert.ok(calibrada.includes('translate(7mm, -9mm) scale(0.9)'));
});

test('la hoja de prueba marca las cuatro esquinas de la hoja y su marco, dentro del lienzo', () => {
  const prueba = htmlHojaDePrueba();
  for (const clase of ['hp-nw', 'hp-ne', 'hp-sw', 'hp-se']) assert.ok(prueba.includes(`class="hp-cruz ${clase}"`), clase);
  assert.ok(prueba.includes('class="hp-marco"'));
  const lienzo = prueba.indexOf('class="hc-lienzo"');
  assert.ok(prueba.indexOf('class="hp-marco"') > lienzo && prueba.indexOf('class="hp-cruz hp-nw"') > lienzo);
  assert.ok(prueba.includes(`left:${ORIGEN_MM.x}mm;top:${ORIGEN_MM.y}mm`), 'la esquina de arriba a la izquierda es el origen');
});

test('el rótulo de la hoja de prueba dice la impresora (escapada) y la calibración con la que se imprimió', () => {
  const prueba = htmlHojaDePrueba({ dx: 1.5, dy: -0.5, escala: 0.98 }, { impresora: 'Oficina <1> & "2"' });
  assert.ok(prueba.includes('Oficina &lt;1&gt; &amp; &quot;2&quot;'));
  assert.ok(prueba.includes('1.5 mm a la derecha, 0.5 mm hacia arriba, 98.0 % del tamaño de Excel'));
  assert.ok(!htmlHojaDePrueba().includes(' · null'));
  // y dice, antes que nada, que NO es el contrato
  assert.match(prueba, /<strong>HOJA DE PRUEBA<\/strong> \(no es el contrato\)/);
});

test('cuatro casillas con número, una en cada esquina, son con las que se compara', () => {
  assert.equal(HITOS.length, 4);
  assert.deepEqual(HITOS.map((h) => h.n), [1, 2, 3, 4]);
  const prueba = htmlHojaDePrueba();
  const lienzo = prueba.indexOf('class="hc-lienzo"');
  const cajas = campoPorId;
  const posiciones = HITOS.map((h) => {
    const campo = cajas(h.id); // lanza si la tabla ya no tiene ese campo
    const caja = cajaDeRango(campo.rango);
    // la caja va en grueso
    assert.match(prueba, new RegExp(`<div class="hp-caja hp-hito-caja" data-campo="${h.id}"`), `${h.id}: caja gruesa`);
    // y su número, dentro del lienzo, en la esquina de arriba a la izquierda de su casilla
    const m = new RegExp(`<b class="hp-hito" data-hito="${h.n}" style="left:([\\d.]+)mm;top:([\\d.]+)mm">${h.n}</b>`).exec(prueba);
    assert.ok(m, `${h.n}: falta su número`);
    assert.ok(prueba.indexOf(m[0]) > lienzo, `${h.n}: el número debe ir dentro del lienzo, para que se corra con la hoja`);
    assert.ok(Math.abs(Number(m[1]) - (ORIGEN_MM.x + caja.x)) < 0.002 && Math.abs(Number(m[2]) - (ORIGEN_MM.y + caja.y)) < 0.002, `${h.n}: posición`);
    return { x: caja.x, y: caja.y, h };
  });
  // una en cada esquina: dos de cada lado, arriba y abajo, izquierda y derecha
  const [uno, dos, tres, cuatro] = posiciones;
  assert.ok(uno.x < dos.x && tres.x < cuatro.x, '1 y 3 a la izquierda; 2 y 4 a la derecha');
  assert.ok(uno.y < tres.y && dos.y < cuatro.y, '1 y 2 arriba; 3 y 4 abajo');
  assert.ok(cuatro.x > 150 && cuatro.y > 200, 'la 4 está lejos de la 1: de ella depende ver el tamaño');
  // ninguna otra caja va en grueso
  assert.equal((prueba.match(/hp-hito-caja/g) || []).length, 4);
  assert.equal((prueba.match(/class="hp-hito"/g) || []).length, 4);
});

test('los pasos salen en la hoja impresa, abajo y FUERA del lienzo (no se corren con la calibración)', () => {
  const prueba = htmlHojaDePrueba({ dx: 7, dy: -9, escala: 0.9 });
  const pasos = prueba.indexOf('class="hp-pasos"');
  const lienzo = prueba.indexOf('class="hc-lienzo"');
  assert.ok(pasos > 0 && pasos < lienzo, 'los pasos van antes del lienzo, no dentro');
  assert.equal((prueba.match(/<li><b>\d\.<\/b>/g) || []).length, PASOS_DE_CALIBRAR.length);
  assert.equal(PASOS_DE_CALIBRAR.length, 5);
  for (const paso of PASOS_DE_CALIBRAR) assert.ok(prueba.includes(paso.corto.replace(/&/g, '&amp;')), paso.corto);
  assert.equal((prueba.match(/transform:/g) || []).length, 1, 'sigue habiendo un solo transform');
});

test('los pasos dicen qué comparar y en qué orden: escala, formulario, posición, tamaño, guardar', () => {
  const [escala, formulario, posicion, tamano, guardar] = PASOS_DE_CALIBRAR;
  // 1. que la impresora no encoja la hoja, medido con la regla de la hoja
  assert.match(escala.texto, /marca 10 y la marca 110/);
  assert.match(escala.texto, /100 mm/);
  assert.match(escala.texto, /escala «100 %»/);
  assert.equal(MARCAS_DE_ESCALA.hasta - MARCAS_DE_ESCALA.desde, 100);
  // 2. ponerla sobre el formulario y mirar las cuatro casillas, que se nombran todas
  for (const h of HITOS) assert.ok(formulario.texto.includes(`${h.n} = ${h.que} (${h.donde})`), `${h.n} sin nombrar`);
  // 3. posición, con la casilla 1 y las flechas, dicha en cuánto mueve cada toque (de las constantes, no de memoria)
  assert.match(posicion.texto, /casilla 1/);
  assert.ok(posicion.texto.includes(`${PASOS.normal.mm} mm`) && posicion.texto.includes(`${PASOS.fino.mm} mm`) && posicion.texto.includes(`${PASOS.grueso.mm} mm`));
  assert.match(posicion.texto, /flecha contraria/);
  // 4. tamaño, con la casilla 4, y que la 1 no se mueve
  assert.match(tamano.texto, /casilla 4/);
  assert.match(tamano.texto, /La casilla 1 no se mueve/);
  assert.match(tamano.texto, /pulsa −/);
  assert.match(tamano.texto, /pulsa \+/);
  // 5. comprobar y guardar con el nombre de la impresora
  assert.match(guardar.texto, /nombre de esta impresora/);
  assert.match(guardar.texto, /Guardar ajuste/);
  // el orden: la posición se arregla antes que el tamaño
  assert.ok(PASOS_DE_CALIBRAR.indexOf(posicion) < PASOS_DE_CALIBRAR.indexOf(tamano));
  // y las dos versiones, la larga y la corta, dicen lo mismo de lo mismo
  for (const paso of PASOS_DE_CALIBRAR) assert.ok(paso.titulo && paso.texto.length > paso.corto.length - 20 && paso.corto);
  assert.match(posicion.corto, new RegExp(`${PASOS.normal.mm} mm`));
});

// ---------------------------------------------------------------------------
// La pantalla: un DOM de mentira, lo mínimo que necesita para dibujar y enganchar botones
// ---------------------------------------------------------------------------

/**
 * Un contenedor sin DOM de verdad. Cada selector devuelve SIEMPRE el mismo nodo (con su `innerHTML`, su `value` y sus
 * oyentes), así lo que la pantalla escribe en un lugar se puede leer después. Las cajas de la tarjeta se descubren
 * en lo que la pantalla dibujó.
 */
function contenedorFalso() {
  const nodos = new Map();
  const nodo = (selector) => {
    if (!nodos.has(selector)) {
      nodos.set(selector, {
        selector, innerHTML: '', textContent: '', value: '', oyentes: {},
        addEventListener(evento, fn) { this.oyentes[evento] = fn; },
      });
    }
    return nodos.get(selector);
  };
  let dibujado = '';
  return {
    nodo,
    get innerHTML() { return dibujado; },
    set innerHTML(valor) { dibujado = valor; },
    querySelector: (selector) => nodo(selector),
    querySelectorAll(selector) {
      if (selector === '.hc-tarjeta input') return [...dibujado.matchAll(/<input[^>]*id="(hc-t\d+-(?:numero|cbc))"/g)].map((m) => nodo(`#${m[1]}`));
      if (selector === '.hc-datos input') return [...dibujado.matchAll(/<input[^>]*id="(hc-(?:facturar|lugar|tarifa)-[a-z-]+)"/g)].map((m) => nodo(`#${m[1]}`));
      return [];
    },
    vista: () => nodo('[data-pieza="vista"]').innerHTML,
    avisos: () => nodo('[data-pieza="avisos"]').innerHTML,
  };
}

/** Un almacén en memoria con la forma de localStorage, que además apunta cada escritura. */
function almacenEspia(inicial = null) {
  const datos = new Map();
  if (inicial !== null) datos.set(CLAVE_DE_CALIBRACIONES, inicial);
  const escrituras = [];
  return {
    datos,
    escrituras,
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => { escrituras.push([clave, String(valor)]); datos.set(clave, String(valor)); },
  };
}

/**
 * Corre `fn` con todo lo que podría guardar o mandar algo (localStorage, sessionStorage, IndexedDB, fetch, la consola)
 * reemplazado por espías que apuntan cada llamada, y devuelve todo lo apuntado como un solo texto. Si el número de la
 * tarjeta o el CBC llegaran a cualquiera de esos lugares, estarían en ese texto.
 */
async function conEspias(fn) {
  const apuntes = [];
  const guardado = {};
  const espia = (nombre) => new Proxy({}, {
    get: (_o, propiedad) => (...args) => { apuntes.push([nombre, String(propiedad), ...args.map((a) => { try { return JSON.stringify(a) ?? String(a); } catch { return String(a); } })]); return null; },
    set: (_o, propiedad, valor) => { apuntes.push([nombre, `set ${String(propiedad)}`, String(valor)]); return true; },
  });
  const sustituir = (nombre, valor) => { guardado[nombre] = Object.getOwnPropertyDescriptor(globalThis, nombre); Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true }); };
  sustituir('localStorage', espia('localStorage'));
  sustituir('sessionStorage', espia('sessionStorage'));
  sustituir('indexedDB', espia('indexedDB'));
  sustituir('fetch', (...args) => { apuntes.push(['fetch', ...args.map(String)]); return Promise.reject(new Error('sin red en las pruebas')); });
  const consola = {};
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug']) {
    consola[metodo] = console[metodo];
    console[metodo] = (...args) => apuntes.push(['console', metodo, ...args.map((a) => { try { return JSON.stringify(a) ?? String(a); } catch { return String(a); } })]);
  }
  try {
    await fn();
  } finally {
    for (const [nombre, descriptor] of Object.entries(guardado)) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor); else delete globalThis[nombre];
    }
    for (const [metodo, original] of Object.entries(consola)) console[metodo] = original;
  }
  return apuntes;
}

test('pintarContratoImpreso dibuja la hoja con las tarjetas enmascaradas y engancha el botón de imprimir', () => {
  const c = contenedorFalso();
  let impresiones = 0;
  const modelo = pintarContratoImpreso(c, entrada(), { imprimir: () => { impresiones += 1; }, almacen: almacenEspia(), alVolver() {} });
  assert.equal(modelo.numero, 77);
  assert.ok(c.innerHTML.includes('data-accion="imprimir"') && c.innerHTML.includes('data-accion="volver"') && c.innerHTML.includes('data-accion="calibrar"'));
  assert.ok(c.innerHTML.includes('href="#/impresion/calibrar"'));
  assert.ok(c.vista().includes('class="hoja-contrato"') || c.vista().includes('class="hoja-contrato '), 'la hoja está a la vista');
  assert.ok(c.vista().includes('•••• 3343') && c.vista().includes('•••• 1111'));
  assert.equal(c.querySelectorAll('.hc-tarjeta input').length, 4, 'número y CBC de cada una de las dos tarjetas');
  c.nodo('[data-accion="imprimir"]').oyentes.click();
  assert.equal(impresiones, 1);
  c.nodo('[data-accion="volver"]');
});

test('un contrato en efectivo no pide número de tarjeta ni CBC', () => {
  const c = contenedorFalso();
  pintarContratoImpreso(c, entrada({ contrato: contrato({ tarjetas: [] }) }), { almacen: almacenEspia() });
  assert.equal(c.querySelectorAll('.hc-tarjeta input').length, 0);
  assert.ok(!c.innerHTML.includes('hc-tarjetas'));
  assert.ok(c.vista().includes('hoja-contrato'));
});

test('sin cliente no se dibuja una hoja: se dibuja una barra roja que dice por qué', () => {
  const c = contenedorFalso();
  const modelo = pintarContratoImpreso(c, entrada({ cliente: null }), { almacen: almacenEspia(), alVolver() {} });
  assert.equal(modelo, null);
  assert.ok(c.innerHTML.includes('barra-lectura-fallida'));
  assert.match(c.innerHTML, /No se pudo armar el contrato para imprimir\. No se encontró al cliente del contrato N\.° 77/);
  assert.ok(!c.innerHTML.includes('hoja-contrato'), 'ninguna hoja a medias');
  assert.ok(!c.innerHTML.includes('data-accion="imprimir"'), 'ni botón de imprimir');
  assert.equal(c.querySelectorAll('.hc-tarjeta input').length, 0);
});

test('una calibración guardada se usa en la hoja, y sin ninguna la pantalla avisa que el primer papel sale corrido', () => {
  const sin = contenedorFalso();
  pintarContratoImpreso(sin, entrada(), { almacen: almacenEspia() });
  assert.match(sin.innerHTML, /todavía no tiene una impresora calibrada: el primer papel sale corrido/);
  assert.ok(sin.vista().includes(`scale(${CALIBRACION_DE_FABRICA.escala})`));

  const almacen = almacenEspia();
  guardarCalibracion(almacen, 'Oficina <1>', { dx: 1.5, dy: -0.5, escala: 0.98 });
  const con = contenedorFalso();
  pintarContratoImpreso(con, entrada(), { almacen });
  assert.ok(con.vista().includes('translate(1.5mm, -0.5mm) scale(0.98)'));
  assert.match(con.innerHTML, /Impresora «Oficina &lt;1&gt;»: 1\.5 mm a la derecha, 0\.5 mm hacia arriba, 98\.0 % del tamaño de Excel/);
  assert.ok(!con.innerHTML.includes('no tiene una impresora calibrada'));
});

test('ADR-001, de punta a punta: el número y el CBC llegan a la hoja que se imprime y a NINGÚN otro lugar', async () => {
  const almacen = almacenEspia();
  const c = contenedorFalso();
  let enElDialogo = null;
  const apuntes = await conEspias(() => {
    pintarContratoImpreso(c, entrada(), {
      almacen,
      imprimir: () => { enElDialogo = c.vista(); },
    });
    // quien atiende teclea la primera tarjeta
    c.nodo('#hc-t0-numero').value = NUMERO_COMPLETO;
    c.nodo('#hc-t0-cbc').value = CBC;
    c.nodo('#hc-t0-numero').oyentes.input();
    // ya se ve en la hoja, y los avisos de «va enmascarado» de esa tarjeta se apagaron
    assert.ok(c.vista().includes(NUMERO_COMPLETO));
    assert.ok(c.vista().includes(`<span class="hc-t">${CBC}</span>`));
    assert.ok(!/Tarjeta 1: el papel llevará/.test(c.avisos()));
    assert.ok(/Tarjeta 2: el papel llevará/.test(c.avisos()), 'la segunda sigue enmascarada y lo dice');
    // se imprime
    c.nodo('[data-accion="imprimir"]').oyentes.click();
  });

  // 1. En el momento de imprimir, la hoja llevaba el número completo y el CBC
  assert.ok(enElDialogo.includes(NUMERO_COMPLETO), 'la hoja que se mandó a imprimir no llevaba el número');
  assert.ok(enElDialogo.includes(`<span class="hc-t">${CBC}</span>`), 'ni el CBC');

  // 2. Terminó la impresión (afterprint): cajas vacías, hoja enmascarada otra vez
  assert.equal(c.nodo('#hc-t0-numero').value, '');
  assert.equal(c.nodo('#hc-t0-cbc').value, '');
  assert.ok(!c.vista().includes('4111') && !c.vista().includes(CBC), 'la hoja de pantalla se quedó con la tarjeta');
  assert.ok(c.vista().includes('•••• 3343'));
  assert.ok(!c.innerHTML.includes('4111') && !c.innerHTML.includes(CBC));
  assert.ok(!c.avisos().includes('4111') && !c.avisos().includes(CBC));

  // 3. Nada se guardó ni se mandó: ni el almacén de la calibración, ni localStorage, sessionStorage, IndexedDB, red o consola
  assert.deepEqual(almacen.escrituras, [], 'la pantalla de imprimir no guarda nada en el almacén');
  const todo = JSON.stringify(apuntes);
  assert.ok(!todo.includes('4111'), `el número llegó a otro lugar: ${todo}`);
  assert.ok(!todo.includes(CBC), `el CBC llegó a otro lugar: ${todo}`);
  assert.ok(!todo.includes('1111 1111'));
});

test('las cajas de lo que el sistema no guarda traen el lugar de la salida y las dos tarifas ya puestos, y a quién se factura vacío', () => {
  const c = contenedorFalso();
  pintarContratoImpreso(c, entrada(), { almacen: almacenEspia() });
  assert.equal(c.querySelectorAll('.hc-datos input').length, 5);
  assert.equal(c.nodo('#hc-facturar-nombre').value, '');
  assert.equal(c.nodo('#hc-facturar-nit').value, '');
  assert.equal(c.nodo('#hc-lugar-entrada').value, 'OFICINA');
  assert.equal(c.nodo('#hc-tarifa-hora-tardia').value, '150');
  assert.equal(c.nodo('#hc-tarifa-galon').value, '65');
  // la hoja ya los lleva
  assert.ok(c.vista().includes('data-campo="lugarEntrada"') && c.vista().includes('Q150.00') && c.vista().includes('Q65.00'));
  assert.ok(!c.vista().includes('data-campo="facturarNit"'));
  // y la pantalla dice que no se guardan
  assert.match(c.innerHTML, /NO se guardan en el sistema: se borran al terminar de imprimir/);
  // también en una renta en efectivo, que no pide tarjeta
  const efectivo = contenedorFalso();
  pintarContratoImpreso(efectivo, entrada({ contrato: contrato({ tarjetas: [] }) }), { almacen: almacenEspia() });
  assert.equal(efectivo.querySelectorAll('.hc-tarjeta input').length, 0);
  assert.equal(efectivo.querySelectorAll('.hc-datos input').length, 5);
});

test('lo que se teclea en esas cajas sale en la hoja, y al terminar de imprimir todo vuelve a como estaba', () => {
  const c = contenedorFalso();
  let enElDialogo = null;
  pintarContratoImpreso(c, entrada(), { almacen: almacenEspia(), imprimir: () => { enElDialogo = c.vista(); } });
  const teclear = (id, valor) => { c.nodo(id).value = valor; c.nodo(id).oyentes.input(); };
  teclear('#hc-facturar-nombre', 'Transportes López, S.A.');
  teclear('#hc-facturar-nit', '1234567-8');
  teclear('#hc-lugar-entrada', 'AEROPUERTO');
  teclear('#hc-tarifa-hora-tardia', '200');
  teclear('#hc-tarifa-galon', '70.5');
  const hoja = c.vista();
  assert.ok(hoja.includes('Transportes López, S.A.') && hoja.includes('1234567-8') && hoja.includes('AEROPUERTO') && hoja.includes('Q200.00') && hoja.includes('Q70.50'));
  assert.ok(!hoja.includes('Q150.00') && !hoja.includes('Q65.00'), 'las tarifas corregidas reemplazan a las de siempre');

  c.nodo('[data-accion="imprimir"]').oyentes.click();
  assert.ok(enElDialogo.includes('1234567-8') && enElDialogo.includes('AEROPUERTO') && enElDialogo.includes('Q200.00'), 'lo que se imprimió es lo tecleado');

  // terminó: a quién se factura se borra, y lo corregido para esta renta no se queda para la siguiente
  assert.equal(c.nodo('#hc-facturar-nombre').value, '');
  assert.equal(c.nodo('#hc-facturar-nit').value, '');
  assert.equal(c.nodo('#hc-lugar-entrada').value, 'OFICINA');
  assert.equal(c.nodo('#hc-tarifa-hora-tardia').value, '150');
  assert.equal(c.nodo('#hc-tarifa-galon').value, '65');
  assert.ok(!c.vista().includes('1234567-8') && !c.vista().includes('Transportes') && !c.vista().includes('AEROPUERTO'));
  assert.ok(c.vista().includes('Q150.00') && c.vista().includes('Q65.00') && c.vista().includes('OFICINA'));
});

test('una tarifa borrada en la caja sale en blanco en la hoja (no vuelve a la de siempre)', () => {
  const c = contenedorFalso();
  pintarContratoImpreso(c, entrada(), { almacen: almacenEspia() });
  c.nodo('#hc-tarifa-hora-tardia').value = '';
  c.nodo('#hc-tarifa-hora-tardia').oyentes.input();
  assert.ok(!c.vista().includes('data-campo="horaTardia"'));
  assert.ok(c.vista().includes('data-campo="combustiblePrecio"'));
  c.nodo('#hc-lugar-entrada').value = '';
  c.nodo('#hc-lugar-entrada').oyentes.input();
  assert.ok(!c.vista().includes('data-campo="lugarEntrada"'));
});

test('a quién se factura tampoco se guarda ni se manda a ningún lado, y se borra al salir de la pantalla', async () => {
  const almacen = almacenEspia();
  const oyentes = {};
  const ventana = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { addEventListener: (evento, fn) => { oyentes[evento] = fn; } };
  const c = contenedorFalso();
  try {
    const apuntes = await conEspias(() => {
      pintarContratoImpreso(c, entrada(), { almacen });
      c.nodo('#hc-facturar-nit').value = '7654321-0';
      c.nodo('#hc-facturar-nombre').value = 'Empresa Secreta, S.A.';
      c.nodo('#hc-facturar-nit').oyentes.input();
      assert.ok(c.vista().includes('7654321-0'));
      oyentes.hashchange();
    });
    assert.equal(c.nodo('#hc-facturar-nit').value, '', 'al salir se borra');
    assert.ok(!c.vista().includes('7654321-0'));
    assert.deepEqual(almacen.escrituras, []);
    const todo = JSON.stringify(apuntes);
    assert.ok(!todo.includes('7654321') && !todo.includes('Empresa Secreta'), todo);
  } finally {
    if (ventana) Object.defineProperty(globalThis, 'window', ventana); else delete globalThis.window;
  }
});

test('lo que quedó en las cajas sin avisar (autocompletar, pegar) también va en la hoja al imprimir', () => {
  const c = contenedorFalso();
  let enElDialogo = null;
  pintarContratoImpreso(c, entrada(), { almacen: almacenEspia(), imprimir: () => { enElDialogo = c.vista(); } });
  // el navegador puso el valor sin disparar el evento `input`
  c.nodo('#hc-t0-numero').value = NUMERO_COMPLETO;
  c.nodo('#hc-t0-cbc').value = CBC;
  assert.ok(!c.vista().includes(CBC), 'todavía no se enteró');
  c.nodo('[data-accion="imprimir"]').oyentes.click();
  assert.ok(enElDialogo.includes(NUMERO_COMPLETO) && enElDialogo.includes(CBC), 'la hoja que se imprime tiene que ser la de lo que dicen las cajas');
});

test('ADR-001: al salir de la pantalla (hashchange) también se vacían las cajas y la hoja', () => {
  const oyentes = {};
  const ventana = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { addEventListener: (evento, fn) => { oyentes[evento] = fn; } };
  try {
    const c = contenedorFalso();
    pintarContratoImpreso(c, entrada(), { almacen: almacenEspia() });
    c.nodo('#hc-t0-numero').value = NUMERO_COMPLETO;
    c.nodo('#hc-t0-cbc').value = CBC;
    c.nodo('#hc-t0-numero').oyentes.input();
    assert.ok(c.vista().includes(NUMERO_COMPLETO));
    assert.equal(typeof oyentes.hashchange, 'function', 'la pantalla escucha el cambio de dirección');
    oyentes.hashchange();
    assert.equal(c.nodo('#hc-t0-numero').value, '');
    assert.equal(c.nodo('#hc-t0-cbc').value, '');
    assert.ok(!c.vista().includes('4111') && !c.vista().includes(CBC));
  } finally {
    if (ventana) Object.defineProperty(globalThis, 'window', ventana); else delete globalThis.window;
  }
});

test('el título del documento mientras se imprime lleva solo el número del contrato, nunca la tarjeta', () => {
  const guardados = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'), window: Object.getOwnPropertyDescriptor(globalThis, 'window') };
  const oyentes = {};
  const documento = { title: 'Best Price — Contratos', head: { appendChild() {} }, getElementById: () => null, createElement: () => ({}) };
  globalThis.document = documento;
  globalThis.window = {
    addEventListener: (evento, fn) => { oyentes[evento] = fn; },
    removeEventListener() {},
  };
  try {
    const c = contenedorFalso();
    let tituloAlImprimir = null;
    pintarContratoImpreso(c, entrada(), { almacen: almacenEspia(), imprimir: () => { tituloAlImprimir = documento.title; } });
    c.nodo('#hc-t0-numero').value = NUMERO_COMPLETO;
    c.nodo('#hc-t0-numero').oyentes.input();
    c.nodo('[data-accion="imprimir"]').oyentes.click();
    assert.equal(tituloAlImprimir, 'Contrato 77');
    assert.ok(!tituloAlImprimir.includes('4111'));
    // al terminar el diálogo se devuelve el título de antes
    assert.equal(typeof oyentes.afterprint, 'function');
    oyentes.afterprint();
    assert.equal(documento.title, 'Best Price — Contratos');
    // y las cajas se vaciaron
    assert.equal(c.nodo('#hc-t0-numero').value, '');
  } finally {
    for (const [nombre, d] of Object.entries(guardados)) {
      if (d) Object.defineProperty(globalThis, nombre, d); else delete globalThis[nombre];
    }
  }
});

test('si lo que se teclea deja la hoja sin poderse armar, NO queda a la vista la hoja de antes', () => {
  const c = contenedorFalso();
  const datos = entrada();
  pintarContratoImpreso(c, datos, { almacen: almacenEspia() });
  assert.ok(c.vista().includes('Pérez Gómez'));
  // el cliente desaparece (se borró, o la copia se refrescó sin él) y alguien sigue tecleando
  datos.cliente = null;
  c.nodo('#hc-t0-numero').value = NUMERO_COMPLETO;
  c.nodo('#hc-t0-numero').oyentes.input();
  assert.equal(c.vista(), '', 'una hoja vieja es una hoja que alguien imprime');
  assert.match(c.avisos(), /barra-lectura-fallida[^]*No se encontró al cliente del contrato N\.° 77/);
});

/** Un document y un window de mentira que apuntan lo que la pantalla les pide. */
function navegadorFalso() {
  const doc = {};
  const win = {};
  const estilos = [];
  const quitados = [];
  const documento = {
    title: 'Best Price — Contratos',
    head: { appendChild: (el) => estilos.push(el) },
    createElement: () => ({ id: '', textContent: '', remove() { quitados.push(this); estilos.splice(estilos.indexOf(this), 1); } }),
    getElementById: (id) => estilos.find((e) => e.id === id) ?? null,
    addEventListener: (evento, fn) => { doc[evento] = fn; },
    removeEventListener: (evento, fn) => { if (doc[evento] === fn) delete doc[evento]; },
  };
  const ventana = {
    addEventListener: (evento, fn, opciones) => { (win[evento] ??= []).push({ fn, una: Boolean(opciones?.once) }); },
    removeEventListener: (evento, fn) => { win[evento] = (win[evento] ?? []).filter((o) => o.fn !== fn); },
  };
  /** Dispara un evento de la ventana: llama a todos los oyentes, y quita los que eran de una sola vez. */
  const disparar = (evento) => {
    const oyentes = [...(win[evento] ?? [])];
    win[evento] = (win[evento] ?? []).filter((o) => !o.una);
    oyentes.forEach((o) => o.fn());
  };
  const antes = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'), window: Object.getOwnPropertyDescriptor(globalThis, 'window') };
  globalThis.document = documento;
  globalThis.window = ventana;
  return {
    doc, win, estilos, quitados, documento, disparar,
    restaurar() {
      for (const [nombre, d] of Object.entries(antes)) { if (d) Object.defineProperty(globalThis, nombre, d); else delete globalThis[nombre]; }
    },
  };
}

test('mientras la pantalla de imprimir está abierta la página de impresión es la carta SIN margen, y al salir se quita', () => {
  const nav = navegadorFalso();
  try {
    pintarContratoImpreso(contenedorFalso(), entrada(), { almacen: almacenEspia() });
    assert.equal(nav.estilos.length, 1);
    assert.equal(nav.estilos[0].id, 'hc-estilo-de-pagina');
    assert.equal(nav.estilos[0].textContent, '@page { size: 215.9mm 279.4mm; margin: 0; }');
    // pintar otra vez no deja dos
    pintarContratoImpreso(contenedorFalso(), entrada(), { almacen: almacenEspia() });
    assert.equal(nav.estilos.length, 1);
    nav.disparar('hashchange');
    assert.equal(nav.estilos.length, 0, 'al cambiar de pantalla el margen de los demás papeles vuelve a ser el suyo');
  } finally {
    nav.restaurar();
  }
});

test('en la pantalla de calibrar las flechas, Shift, Ctrl y +/− mueven la hoja de prueba; escribir el nombre no', () => {
  const nav = navegadorFalso();
  try {
    const c = contenedorFalso();
    const pantalla = pintarCalibracion(c, { almacen: almacenEspia() });
    const tecla = (key, extra = {}, objetivo = { matches: () => false }) => {
      let evitado = false;
      nav.doc.keydown({ key, target: objetivo, preventDefault() { evitado = true; }, ...extra });
      return evitado;
    };
    const inicial = pantalla.cal();
    assert.equal(tecla('ArrowRight'), true, 'la flecha no debe además desplazar la página');
    assert.deepEqual(pantalla.cal(), { ...inicial, dx: 0.5 });
    assert.equal(tecla('ArrowDown', { shiftKey: true }), true);
    assert.equal(pantalla.cal().dy, 0.1);
    tecla('ArrowLeft', { ctrlKey: true });
    assert.equal(pantalla.cal().dx, -4.5);
    tecla('+');
    assert.equal(pantalla.cal().escala, inicial.escala + 0.005);
    // la hoja de prueba se volvió a dibujar con lo nuevo
    assert.ok(c.vista().includes('translate(-4.5mm, 0.1mm)'));
    // una tecla ajena no se traga ni cambia nada
    const antes = { ...pantalla.cal() };
    assert.equal(tecla('a'), false);
    assert.equal(tecla('Enter'), false);
    assert.deepEqual(pantalla.cal(), antes);
    // escribiendo el nombre de la impresora (un campo de texto) las flechas son del campo, no de la hoja
    assert.equal(tecla('ArrowRight', {}, { matches: (selector) => /input/.test(selector) }), false);
    assert.deepEqual(pantalla.cal(), antes);
    // al salir se deja de escuchar el teclado y se quita la página sin margen
    assert.equal(typeof nav.doc.keydown, 'function');
    nav.disparar('hashchange');
    assert.equal(nav.doc.keydown, undefined, 'una pantalla que ya no está no debe seguir moviendo nada');
    assert.equal(nav.estilos.length, 0);
  } finally {
    nav.restaurar();
  }
});

// ---------------------------------------------------------------------------
// pintarImpresionDeContrato: las lecturas, con datos.js reemplazado por lecturas inyectadas
// ---------------------------------------------------------------------------

function lecturas({ contratoLeido = contrato(), clientes = { datos: [cliente()], fallo: false }, flota = { datos: [CARRO], fallo: false }, falla = {} } = {}) {
  const llamadas = [];
  const leer = {
    cargarContrato: async (id) => { llamadas.push(['contrato', id]); if (falla.contrato) throw new Error('sin red'); return contratoLeido; },
    cargarClientes: async () => { llamadas.push(['clientes']); if (falla.clientes) throw new Error('sin red'); return clientes; },
    cargarFlota: async () => { llamadas.push(['flota']); if (falla.flota) throw new Error('sin red'); return flota; },
  };
  return { leer, llamadas };
}

test('pintarImpresionDeContrato lee el contrato, su cliente y su carro y dibuja la hoja', async () => {
  const c = contenedorFalso();
  const { leer, llamadas } = lecturas();
  await pintarImpresionDeContrato(c, 'c1', { leer });
  assert.deepEqual(llamadas, [['contrato', 'c1'], ['clientes'], ['flota']]);
  assert.ok(c.vista().includes('hoja-contrato'));
  assert.ok(c.vista().includes('Pérez Gómez') && c.vista().includes('CAMIONETA'));
});

test('de la flota se toma el carro de ESTE contrato, no el primero de la lista', async () => {
  const c = contenedorFalso();
  const otro = { ...CARRO, id: 'v9', placas: 'P-OTRO', tipo: 'OTRO TIPO', color: 'OTRO COLOR', modelo: '1999' };
  await pintarImpresionDeContrato(c, 'c1', { leer: lecturas({ flota: { datos: [otro, CARRO], fallo: false } }).leer });
  assert.ok(c.vista().includes('CAMIONETA') && c.vista().includes('PLATEADO'));
  assert.ok(!c.vista().includes('OTRO TIPO') && !c.vista().includes('OTRO COLOR'));
});

test('de los clientes se toma el de ESTE contrato, no el primero de la lista', async () => {
  const c = contenedorFalso();
  const otro = { id: 'k9', nombres: 'Otra', apellidos: 'Persona' };
  await pintarImpresionDeContrato(c, 'c1', { leer: lecturas({ clientes: { datos: [otro, cliente()], fallo: false } }).leer });
  assert.ok(c.vista().includes('Pérez Gómez'));
  assert.ok(!c.vista().includes('Persona'));
});

test('un carro AJENO no lee la flota', async () => {
  const c = contenedorFalso();
  const { leer, llamadas } = lecturas({ contratoLeido: contratoAjeno() });
  await pintarImpresionDeContrato(c, 'c1', { leer });
  assert.deepEqual(llamadas, [['contrato', 'c1'], ['clientes']]);
  assert.ok(c.vista().includes('PICKUP'));
});

test('un contrato que no existe se dice así; uno que no se pudo leer se dice distinto, nunca como si no existiera', async () => {
  const noExiste = contenedorFalso();
  await pintarImpresionDeContrato(noExiste, 'zzz', { leer: lecturas({ contratoLeido: null }).leer });
  assert.match(noExiste.innerHTML, /No se encontró el contrato zzz/);
  assert.ok(!noExiste.innerHTML.includes('barra-lectura-fallida'));

  const sinLeer = contenedorFalso();
  await pintarImpresionDeContrato(sinLeer, 'c1', { leer: lecturas({ falla: { contrato: true } }).leer });
  assert.match(sinLeer.innerHTML, /No se pudo leer este contrato\. Revisa tu conexión/);
  assert.ok(sinLeer.innerHTML.includes('barra-lectura-fallida'));
  assert.ok(!sinLeer.innerHTML.includes('No se encontró'));
});

test('si la lista de clientes no se pudo leer, no hay hoja; y si el cliente simplemente no está, tampoco', async () => {
  const falla = contenedorFalso();
  await pintarImpresionDeContrato(falla, 'c1', { leer: lecturas({ falla: { clientes: true } }).leer });
  assert.match(falla.innerHTML, /No se pudo leer la lista de clientes/);
  assert.ok(!falla.innerHTML.includes('hoja-contrato'));

  const vacia = contenedorFalso();
  await pintarImpresionDeContrato(vacia, 'c1', { leer: lecturas({ clientes: { datos: [], fallo: true } }).leer });
  assert.match(vacia.innerHTML, /No se pudo leer la lista de clientes/);

  const ausente = contenedorFalso();
  await pintarImpresionDeContrato(ausente, 'c1', { leer: lecturas({ clientes: { datos: [{ id: 'otro', nombres: 'X', apellidos: 'Y' }], fallo: false } }).leer });
  assert.match(ausente.innerHTML, /No se encontró al cliente del contrato N\.° 77/);
  assert.ok(!ausente.innerHTML.includes('class="hoja-contrato'), 'sin cliente no sale una hoja con el nombre en blanco');
});

test('una copia vieja de los clientes (la nube no contestó) sirve si el cliente está en ella', async () => {
  const c = contenedorFalso();
  await pintarImpresionDeContrato(c, 'c1', { leer: lecturas({ clientes: { datos: [cliente()], fallo: true } }).leer });
  assert.ok(c.vista().includes('Pérez Gómez'));
});

test('si la flota no se pudo leer se dice; si no trae el carro, la hoja sale con un aviso', async () => {
  const falla = contenedorFalso();
  await pintarImpresionDeContrato(falla, 'c1', { leer: lecturas({ falla: { flota: true } }).leer });
  assert.match(falla.innerHTML, /No se pudo leer la flota/);
  const sinCarro = contenedorFalso();
  await pintarImpresionDeContrato(sinCarro, 'c1', { leer: lecturas({ flota: { datos: [], fallo: false } }).leer });
  assert.match(sinCarro.avisos(), /No se encontró la ficha del carro/);
  assert.ok(sinCarro.vista().includes('P-234IFN'));
});

// ---------------------------------------------------------------------------
// La pantalla de calibrar
// ---------------------------------------------------------------------------

test('la pantalla de calibrar empieza en la calibración de fábrica y dibuja la hoja de prueba', () => {
  const c = contenedorFalso();
  const pantalla = pintarCalibracion(c, { almacen: almacenEspia(), alVolver() {} });
  assert.deepEqual(pantalla.cal(), { ...CALIBRACION_DE_FABRICA });
  assert.ok(c.vista().includes('hoja-de-prueba'));
  assert.match(c.nodo('[data-pieza="lectura"]').textContent, /^Ajuste: sin corrimiento, 77\.0 % del tamaño de Excel\.$/);
  for (const accion of ['imprimir-prueba', 'guardar', 'fabrica', 'volver']) assert.ok(c.innerHTML.includes(`data-accion="${accion}"`), accion);
});

test('la pantalla de calibrar trae los cinco pasos en palabras, el nombre de la impresora y qué hace cada tecla', () => {
  const c = contenedorFalso();
  pintarCalibracion(c, { almacen: almacenEspia() });
  const pasos = c.innerHTML.match(/<ol class="hc-pasos">[^]*?<\/ol>/)[0];
  assert.equal((pasos.match(/<li>/g) || []).length, 5);
  PASOS_DE_CALIBRAR.forEach((paso, i) => {
    assert.ok(pasos.includes(`<strong>${paso.titulo}.</strong>`), `paso ${i + 1}`);
    assert.ok(pasos.includes(paso.texto.replace(/&/g, '&amp;')), `texto del paso ${i + 1}`);
  });
  // el primer paso trae además cómo se configura el diálogo de imprimir
  assert.match(pasos, /márgenes «Ninguno»/);
  assert.match(c.innerHTML, /<kbd>←<\/kbd> <kbd>→<\/kbd> <kbd>↑<\/kbd> <kbd>↓<\/kbd> mueven toda la hoja 0\.5 mm · con <kbd>Shift<\/kbd> 0\.1 mm · con <kbd>Ctrl<\/kbd> o <kbd>Cmd<\/kbd> 5 mm/);
  assert.match(c.innerHTML, /<kbd>\+<\/kbd> y <kbd>−<\/kbd> la agrandan o la achican/);
  assert.ok(c.innerHTML.includes('id="hc-nombre"'));
});

test('guardar sin nombre lo dice y no guarda; con nombre guarda, activa esa impresora y lo confirma', () => {
  const almacen = almacenEspia();
  const c = contenedorFalso();
  pintarCalibracion(c, { almacen });
  c.nodo('[data-accion="guardar"]').oyentes.click();
  assert.match(c.nodo('[data-pieza="lectura"]').textContent, /Ponle un nombre a la impresora/);
  assert.deepEqual(almacen.escrituras, []);

  c.nodo('#hc-nombre').oyentes.input({ target: { value: '  Oficina ' } });
  c.nodo('[data-accion="guardar"]').oyentes.click();
  assert.match(c.nodo('[data-pieza="lectura"]').textContent, /^Guardado para «Oficina»\./);
  assert.deepEqual(leerCalibraciones(almacen), { activa: 'Oficina', impresoras: { Oficina: { ...CALIBRACION_DE_FABRICA } } });
  assert.deepEqual(calibracionActiva(almacen).cal, { ...CALIBRACION_DE_FABRICA });
});

test('guardar en un navegador que no deja guardar lo dice en vez de decir «Guardado»', () => {
  const almacen = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  const c = contenedorFalso();
  pintarCalibracion(c, { almacen });
  c.nodo('#hc-nombre').oyentes.input({ target: { value: 'Oficina' } });
  c.nodo('[data-accion="guardar"]').oyentes.click();
  const texto = c.nodo('[data-pieza="lectura"]').textContent;
  assert.match(texto, /No se pudo guardar el ajuste en esta computadora/);
  assert.ok(!/Guardado/.test(texto));
});

test('sin almacén del navegador (ventana privada, datos bloqueados) la pantalla de calibrar sigue funcionando y no dice «Guardado»', () => {
  // en Node no existe localStorage: es el caso de un navegador que no lo ofrece
  const sinAlmacen = contenedorFalso();
  const pantalla = pintarCalibracion(sinAlmacen);
  assert.deepEqual(pantalla.cal(), { ...CALIBRACION_DE_FABRICA });
  sinAlmacen.nodo('#hc-nombre').oyentes.input({ target: { value: 'Oficina' } });
  sinAlmacen.nodo('[data-accion="guardar"]').oyentes.click();
  assert.match(sinAlmacen.nodo('[data-pieza="lectura"]').textContent, /No se pudo guardar el ajuste en esta computadora/);

  // y uno donde el solo acceso a localStorage lanza (lo que hace Safari con los datos bloqueados)
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('SecurityError'); }, configurable: true });
  try {
    const bloqueado = contenedorFalso();
    const otra = pintarCalibracion(bloqueado);
    assert.deepEqual(otra.cal(), { ...CALIBRACION_DE_FABRICA });
    bloqueado.nodo('#hc-nombre').oyentes.input({ target: { value: 'Oficina' } });
    bloqueado.nodo('[data-accion="guardar"]').oyentes.click();
    assert.match(bloqueado.nodo('[data-pieza="lectura"]').textContent, /No se pudo guardar/);
    // la pantalla de imprimir también abre sin él, con la calibración de fábrica
    const imprimir = contenedorFalso();
    pintarContratoImpreso(imprimir, entrada());
    assert.ok(imprimir.vista().includes(`scale(${CALIBRACION_DE_FABRICA.escala})`));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage;
  }
});

test('al escribir el nombre de una impresora ya guardada se trae su ajuste', () => {
  const almacen = almacenEspia();
  guardarCalibracion(almacen, 'Mostrador', { dx: 2, dy: -1, escala: 0.9 });
  guardarCalibracion(almacen, 'Oficina', { dx: 0.5, dy: 0.5, escala: 1 });
  const c = contenedorFalso();
  const pantalla = pintarCalibracion(c, { almacen });
  assert.deepEqual(pantalla.cal(), { dx: 0.5, dy: 0.5, escala: 1 }, 'arranca con la activa, que es la última que se guardó');
  c.nodo('#hc-nombre').oyentes.input({ target: { value: 'Mostrador' } });
  assert.deepEqual(pantalla.cal(), { dx: 2, dy: -1, escala: 0.9 });
  assert.ok(c.vista().includes('translate(2mm, -1mm) scale(0.9)'));
  assert.equal(pantalla.nombre(), 'Mostrador');
  // un nombre nuevo conserva el ajuste que ya tenía la pantalla
  c.nodo('#hc-nombre').oyentes.input({ target: { value: 'Casa' } });
  assert.deepEqual(pantalla.cal(), { dx: 2, dy: -1, escala: 0.9 });
});

test('«Volver al ajuste de fábrica» devuelve la calibración de fábrica y repinta la hoja de prueba', () => {
  const almacen = almacenEspia();
  guardarCalibracion(almacen, 'Oficina', { dx: 5, dy: 5, escala: 1.1 });
  const c = contenedorFalso();
  const pantalla = pintarCalibracion(c, { almacen });
  assert.deepEqual(pantalla.cal(), { dx: 5, dy: 5, escala: 1.1 });
  c.nodo('[data-accion="fabrica"]').oyentes.click();
  assert.deepEqual(pantalla.cal(), { ...CALIBRACION_DE_FABRICA });
  assert.ok(c.vista().includes(`scale(${CALIBRACION_DE_FABRICA.escala})`));
});

test('«Imprimir hoja de prueba» llama al diálogo de imprimir', () => {
  const c = contenedorFalso();
  let impresiones = 0;
  pintarCalibracion(c, { almacen: almacenEspia(), imprimir: () => { impresiones += 1; } });
  c.nodo('[data-accion="imprimir-prueba"]').oyentes.click();
  assert.equal(impresiones, 1);
});

// ---------------------------------------------------------------------------
// El botón en la ficha del contrato, las rutas y las hojas de estilo
// ---------------------------------------------------------------------------

test('la ficha del contrato trae el enlace «Imprimir contrato» a su hoja', () => {
  assert.deepEqual(accionDeImpresion({ id: 'c1' }), { ruta: '#/imprimir/c1', texto: 'Imprimir contrato' });
  assert.equal(accionDeImpresion({}), null, 'sin id no hay enlace: #/imprimir/undefined no lleva a ningún lado');
  assert.equal(accionDeImpresion(null), null);
  const ficha = plantillaDetalle(contrato());
  assert.match(ficha, /<a class="btn" href="#\/imprimir\/c1" data-accion="imprimir"[^>]*>Imprimir contrato<\/a>/);
  assert.ok(!plantillaDetalle({ ...contrato(), id: undefined }).includes('data-accion="imprimir"'));
  // un id con caracteres raros no rompe el atributo
  assert.ok(plantillaDetalle({ ...contrato(), id: 'a"b' }).includes('href="#/imprimir/a&quot;b"'));
});

test('las dos rutas de la hoja están registradas en app.js y el enrutador las entiende', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ pintarImpresionDeContrato, pintarCalibracion \} from '\.\/pantallas\/contratoImpreso\.js';/);
  assert.match(app, /registrarPantalla\('#\/imprimir\/:contratoId', pintarImpresionDeContrato\);/);
  assert.match(app, /registrarPantalla\('#\/impresion\/calibrar', \(caja\) => pintarCalibracion\(caja\)\);/);
  assert.deepEqual(emparejar('#/imprimir/abc123', '#/imprimir/:contratoId'), ['abc123']);
  assert.equal(emparejar('#/imprimir', '#/imprimir/:contratoId'), null, 'un id vacío no es un id');
  assert.equal(emparejar('#/impresion/calibrar', '#/imprimir/:contratoId'), null, 'la ruta de calibrar no se confunde con un contrato');
});

/** El bloque `{ ... }` que empieza en `inicio` (cuenta llaves). */
function bloqueDesde(css, inicio) {
  const abre = css.indexOf('{', inicio);
  let nivel = 0;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') nivel += 1;
    if (css[i] === '}') { nivel -= 1; if (nivel === 0) return css.slice(abre + 1, i); }
  }
  throw new Error('llaves sin cerrar');
}

test('la hoja de estilos: la página es la carta sin margen, la hoja ocupa la carta entera y al imprimir solo sale ella', () => {
  const css = readFileSync(new URL('../css/contrato-papel.css', import.meta.url), 'utf8');
  const pagina = bloqueDesde(css, css.indexOf('@page contrato-papel'));
  assert.match(pagina, /size:\s*215\.9mm 279\.4mm;/);
  assert.match(pagina, /margin:\s*0;/);

  // `.hoja-contrato` (la regla suelta, no la de @media)
  const hoja = bloqueDesde(css, css.indexOf('\n.hoja-contrato {'));
  for (const declaracion of [/width:\s*215\.9mm;/, /height:\s*279\.4mm;/, /overflow:\s*hidden;/, /page:\s*contrato-papel;/, /position:\s*relative;/]) assert.match(hoja, declaracion);

  // la calibración vive SOLO en el `transform` en línea del lienzo
  const lienzo = bloqueDesde(css, css.indexOf('\n.hc-lienzo {'));
  assert.ok(!/transform/.test(lienzo), 'el CSS del lienzo no puede traer su propio transform');
  assert.match(lienzo, /position:\s*absolute;/);
  const campo = bloqueDesde(css, css.indexOf('\n.hc-campo {'));
  assert.match(campo, /position:\s*absolute;/);
  assert.ok(!/transform/.test(campo));

  // el texto no baja de renglón salvo que el campo lo pida, y las fechas con espacios no se juntan
  assert.match(bloqueDesde(css, css.indexOf('\n.hc-t {')), /white-space:\s*nowrap;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hc-ajusta .hc-t {')), /white-space:\s*normal;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hc-pre .hc-t {')), /white-space:\s*pre;/);

  // al imprimir
  const impresion = bloqueDesde(css, css.indexOf('@media print'));
  assert.match(impresion, /body:has\(\.hoja-contrato\) \*:not\(:has\(\.hoja-contrato\)\):not\(\.hoja-contrato\):not\(\.hoja-contrato \*\) \{\s*display:\s*none !important;/);
  assert.match(impresion, /\.hoja-contrato \{[^}]*transform:\s*none;/);
  assert.match(impresion, /html,\s*body \{[^}]*margin:\s*0 !important;/);
});

test('lo que tiene que verse en la hoja de prueba no depende de «Gráficos de fondo» (Chrome los trae apagados)', () => {
  const css = readFileSync(new URL('../css/contrato-papel.css', import.meta.url), 'utf8');
  // las marcas de la regla, la cruz y la caja gruesa son BORDES: siempre salen en el papel
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-marca-x {')), /border-left:\s*0\.15mm solid #000;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-marca-y {')), /border-top:\s*0\.15mm solid #000;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-cruz::before,')), /content:\s*'';/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-cruz::before { left')), /border-left:\s*0\.2mm solid #000;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-cruz::after { top')), /border-top:\s*0\.2mm solid #000;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-caja.hp-hito-caja {')), /border:\s*0\.5mm solid #000;/);
  assert.match(bloqueDesde(css, css.indexOf('\n.hp-hito {')), /border:\s*0\.4mm solid #000;/);
  for (const regla of ['\n.hp-marca-x {', '\n.hp-marca-y {', '\n.hp-cruz {']) {
    assert.ok(!/background/.test(bloqueDesde(css, css.indexOf(regla))), `${regla.trim()} no debe llevar fondo`);
  }
  // y por si algún fondo se cuela, se pide imprimirlo igual
  assert.match(bloqueDesde(css, css.indexOf('\n.hoja-de-prueba,')), /print-color-adjust:\s*exact;/);
  // los pasos van fijos al papel, abajo, y no se corren con la calibración
  const pasos = bloqueDesde(css, css.indexOf('\n.hp-pasos {'));
  assert.match(pasos, /position:\s*absolute;/);
  assert.match(pasos, /top:\s*250mm;/);
  assert.ok(!/transform/.test(pasos));
});

test('index.html carga la hoja de estilos del contrato', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /<link rel="stylesheet" href="css\/contrato-papel\.css\?v=1">/);
});

test('la hoja de estilos no toca el @page de los demás papeles', () => {
  // El comprobante del dueño usa el @page de estilos.css (con margen). El del contrato es una página CON NOMBRE: solo
  // aplica a lo que declare `page: contrato-papel`.
  const css = readFileSync(new URL('../css/contrato-papel.css', import.meta.url), 'utf8');
  const sueltas = css.match(/@page\s*\{/g);
  assert.equal(sueltas, null, 'un @page sin nombre en esta hoja cambiaría el margen del comprobante');
  assert.equal((css.match(/@page contrato-papel/g) || []).length, 1);
  assert.equal(PAPEL.anchoMm, 215.9);
});
