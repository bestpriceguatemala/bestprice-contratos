// Un libro de Excel armado desde cero, con el mismo zip y las mismas celdas del respaldo.
//
// El respaldo anual (excel.js) parcha SU plantilla porque tiene que servir para rentar con sus colores y sus fórmulas
// (ADR-004, opción A). Un archivo que es solo una cuenta —filas y columnas para mirar, filtrar y guardar— no necesita nada
// de eso, y ADR-004 ya había dicho para qué sirve la opción C («un libro nuevo desde cero: poco código»): esto es esa
// opción, y solo para eso. No inventa una segunda manera de escribir un .xlsx:
//   - el zip es `escribirZip` (zip.js), con el CRC-32 y la compresión del navegador;
//   - cada celda es `celdaNueva` (hojas.js): texto en línea que nunca se lee como fórmula, números que Excel abre, vacías;
//   - las letras de columna son `columnaDeNumero` y el texto se escapa con `escaparXml`.
// Lo único nuevo son las partes que una plantilla ya traía hechas: los tipos, las relaciones, el libro y los estilos.
//
// SIN FÓRMULAS, a propósito. Excel abre en «Vista protegida» lo que baja de internet y ahí no calcula (ADR-004): una
// suma escrita como fórmula se vería en blanco hasta «Habilitar edición». Todo lo que el archivo dice es un valor, y lo
// que se suma lo suma quien arma el libro con las funciones del núcleo, no la hoja.
//
// Qué se le pide a una hoja (`HojaDeLibro`):
//   nombre     el de la pestaña (hasta 31 letras, sin \ / ? * [ ] :)
//   columnas   [{ titulo, tipo, ancho }] con `tipo` en 'texto' | 'fecha' | 'dinero' | 'entero' | 'numero'
//   filas      [[valor, ...]] un valor por columna: texto, número, o null/'' para una celda vacía. Una fecha ya viene como el
//              número de serie de Excel (`serialDeFecha`, hojas.js); la columna le pone el formato.
//   notas      [{ texto, estilo }] líneas sueltas arriba de la tabla (el título, de qué fecha es, los avisos); `estilo` es una
//              clave de ESTILO ('titulo', 'nota' o 'aviso').
//   congelar   deja la fila de títulos fija al bajar (solo si la tabla empieza en la fila 1, o sea sin `notas`)
//   filtro     pone las flechas de filtrar en los títulos
import { escribirZip } from './zip.js';
import { celdaNueva, columnaDeNumero, escaparXml } from './hojas.js';

/** Los estilos del libro, por clave. El número es la posición en `cellXfs` de `ESTILOS_XML`. */
export const ESTILO = {
  texto: 0, titulo: 1, encabezado: 2, fecha: 3, dinero: 4, entero: 5, nota: 6, aviso: 7, numero: 8,
};

/** Qué estilo lleva cada tipo de columna. */
const ESTILO_DE_TIPO = {
  texto: ESTILO.texto, fecha: ESTILO.fecha, dinero: ESTILO.dinero, entero: ESTILO.entero, numero: ESTILO.numero,
};

export const MAX_NOMBRE_DE_HOJA = 31;

const PROHIBIDAS_EN_EL_NOMBRE = /[\\/?*[\]:]/;

const aBytes = (texto) => new TextEncoder().encode(texto);

const CABECERA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_HOJA = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Escapa un valor que va entre comillas dentro de un atributo XML. */
const escaparAtributo = (texto) => escaparXml(texto).replace(/"/g, '&quot;');

// ---------- estilos ----------

// Pocos y sobrios: negrita para los títulos, un fondo suave en el encabezado de la tabla, fechas como dd/mm/aaaa y dinero como
// Q1,234.50 (con el signo antes de la Q, igual que `dinero()` en pantalla). Las posiciones de `cellXfs` son las de ESTILO.
const FORMATO_FECHA = 'dd/mm/yyyy';
const FORMATO_DINERO = '"Q"#,##0.00;-"Q"#,##0.00';

const ESTILOS_XML = `${CABECERA}<styleSheet xmlns="${NS_HOJA}">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${escaparAtributo(FORMATO_FECHA)}"/><numFmt numFmtId="165" formatCode="${escaparAtributo(FORMATO_DINERO)}"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="11"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// ---------- una hoja ----------

/** `'Rentas'` o `'\'Mis rentas\''`: como se nombra una hoja dentro de una referencia. */
const nombreEnReferencia = (nombre) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre) ? nombre : `'${nombre.replace(/'/g, "''")}'`);

function comprobarHoja(hoja, vistas) {
  const nombre = String(hoja?.nombre ?? '');
  if (!nombre.trim()) throw new Error('Una hoja del libro no tiene nombre.');
  if (nombre.length > MAX_NOMBRE_DE_HOJA || PROHIBIDAS_EN_EL_NOMBRE.test(nombre) || nombre.startsWith("'") || nombre.endsWith("'")) {
    throw new Error(`El nombre de hoja «${nombre}» no sirve en Excel (hasta ${MAX_NOMBRE_DE_HOJA} letras, sin \\ / ? * [ ] : ni comillas simples en los bordes).`);
  }
  if (vistas.has(nombre.toLowerCase())) throw new Error(`Dos hojas se llaman «${nombre}»: Excel no abre un libro con nombres repetidos.`);
  vistas.add(nombre.toLowerCase());
  if (!Array.isArray(hoja.columnas) || !hoja.columnas.length) throw new Error(`La hoja «${nombre}» no tiene columnas.`);
  for (const col of hoja.columnas) {
    if (!Object.hasOwn(ESTILO_DE_TIPO, col?.tipo)) throw new Error(`La hoja «${nombre}» trae una columna de tipo «${col?.tipo}», que no existe.`);
  }
  if (!Array.isArray(hoja.filas)) throw new Error(`La hoja «${nombre}» no trae sus filas como una lista.`);
  for (const fila of hoja.filas) {
    if (!Array.isArray(fila) || fila.length !== hoja.columnas.length) {
      throw new Error(`La hoja «${nombre}» tiene una fila con ${Array.isArray(fila) ? fila.length : 'ningún'} valores y ${hoja.columnas.length} columnas.`);
    }
  }
  if (hoja.congelar && (hoja.notas ?? []).length) {
    throw new Error(`La hoja «${nombre}» pide congelar la fila de títulos, pero con notas arriba la tabla no empieza en la fila 1.`);
  }
  return nombre;
}

/** El XML de una hoja y el rango de su tabla (para el filtro). */
function xmlDeHoja(hoja, { seleccionada }) {
  const notas = hoja.notas ?? [];
  const filaDeTitulos = notas.length ? notas.length + 2 : 1;
  const ultimaColumna = columnaDeNumero(hoja.columnas.length);
  const ultimaFila = filaDeTitulos + hoja.filas.length;
  const filas = [];

  notas.forEach(({ texto, estilo }, i) => {
    const clave = Object.hasOwn(ESTILO, estilo) ? estilo : 'texto';
    filas.push(`<row r="${i + 1}">${celdaNueva(`A${i + 1}`, ESTILO[clave], texto)}</row>`);
  });
  filas.push(`<row r="${filaDeTitulos}">${hoja.columnas.map((col, i) => celdaNueva(`${columnaDeNumero(i + 1)}${filaDeTitulos}`, ESTILO.encabezado, col.titulo)).join('')}</row>`);
  hoja.filas.forEach((fila, i) => {
    const r = filaDeTitulos + 1 + i;
    filas.push(`<row r="${r}">${fila.map((valor, k) => celdaNueva(`${columnaDeNumero(k + 1)}${r}`, ESTILO_DE_TIPO[hoja.columnas[k].tipo], valor)).join('')}</row>`);
  });

  const anchos = hoja.columnas.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(col.ancho) > 0 ? Number(col.ancho) : 14}" customWidth="1"/>`).join('');
  const vista = hoja.congelar
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : '';
  const filtro = hoja.filtro ? `<autoFilter ref="A${filaDeTitulos}:${ultimaColumna}${ultimaFila}"/>` : '';

  return `${CABECERA}<worksheet xmlns="${NS_HOJA}">`
    + `<dimension ref="A1:${ultimaColumna}${ultimaFila}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${seleccionada ? ' tabSelected="1"' : ''}>${vista}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${anchos}</cols>`
    + `<sheetData>${filas.join('')}</sheetData>${filtro}`
    + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
    + '</worksheet>';
}

// ---------- el libro ----------

/**
 * Arma un .xlsx desde cero y devuelve sus bytes.
 *
 * - `hojas`: las hojas, en el orden de las pestañas (ver arriba).
 * - `titulo`, `asunto`: lo que Excel muestra en las propiedades del archivo.
 * - `hoy`: 'YYYY-MM-DD'. Es la fecha que lleva el archivo adentro; aquí NUNCA se lee el reloj, así que los mismos datos y la
 *   misma fecha dan siempre los mismos bytes.
 */
export async function escribirLibro({
  hojas, titulo = '', asunto = '', hoy,
}) {
  if (!Array.isArray(hojas) || !hojas.length) throw new Error('Un libro necesita por lo menos una hoja.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoy ?? ''))) throw new Error('Falta la fecha de hoy (hoy): el archivo lleva adentro el día en que se armó y no se lee del reloj.');
  const vistas = new Set();
  const nombres = hojas.map((h) => comprobarHoja(h, vistas));

  const partes = [];
  partes.push(['[Content_Types].xml', aBytes(`${CABECERA}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '</Types>')]);
  partes.push(['_rels/.rels', aBytes(`${CABECERA}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '</Relationships>')]);
  partes.push(['docProps/core.xml', aBytes(`${CABECERA}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:title>${escaparXml(titulo)}</dc:title><dc:subject>${escaparXml(asunto)}</dc:subject><dc:creator>Best Price</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${hoy}T12:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${hoy}T12:00:00Z</dcterms:modified>`
    + '</cp:coreProperties>')]);

  // Las flechas de filtrar viven en la hoja, pero Excel además espera el nombre oculto `_FilterDatabase` que apunta a su rango.
  const nombresDefinidos = hojas.map((hoja, i) => {
    if (!hoja.filtro) return '';
    const fila = (hoja.notas ?? []).length ? hoja.notas.length + 2 : 1;
    const rango = `${nombreEnReferencia(nombres[i])}!$A$${fila}:$${columnaDeNumero(hoja.columnas.length)}$${fila + hoja.filas.length}`;
    return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escaparXml(rango)}</definedName>`;
  }).join('');
  partes.push(['xl/workbook.xml', aBytes(`${CABECERA}<workbook xmlns="${NS_HOJA}" xmlns:r="${NS_REL}">`
    + '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>'
    + `<sheets>${nombres.map((n, i) => `<sheet name="${escaparAtributo(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
    + (nombresDefinidos ? `<definedNames>${nombresDefinidos}</definedNames>` : '')
    + '</workbook>')]);
  partes.push(['xl/_rels/workbook.xml.rels', aBytes(`${CABECERA}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>')]);
  partes.push(['xl/styles.xml', aBytes(ESTILOS_XML)]);
  hojas.forEach((hoja, i) => partes.push([`xl/worksheets/sheet${i + 1}.xml`, aBytes(xmlDeHoja(hoja, { seleccionada: i === 0 }))]));

  return escribirZip(partes);
}
