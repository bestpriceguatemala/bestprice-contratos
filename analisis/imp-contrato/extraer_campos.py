"""Lee la hoja «IMP. CONTRATO» del Excel del dueño y escribe, de cada celda con algo adentro, lo que importa para
imprimirla: su rango combinado, de dónde saca el dato (celda de «INGRESO DE DATOS»), fuente, tamaño, si la letra
es BLANCA (Excel la imprime pero no se ve), alineación, si ajusta el texto y el formato del número.

Es análisis, no es parte del sistema. Solo LEE el archivo (pásale una copia). Uso:
    python3 -I extraer_campos.py <libro.xlsx> <salida.json>
(openpyxl vive en el sitio de paquetes del usuario; con -I hay que decirle dónde está.)
"""
import json
import re
import sys

sys.path.insert(0, '/Users/estebanurizar/Library/Python/3.9/lib/python/site-packages')
import openpyxl  # noqa: E402

libro = openpyxl.load_workbook(sys.argv[1])
hoja = libro['IMP. CONTRATO']
rangos = {r.coord.split(':')[0]: r.coord for r in hoja.merged_cells.ranges}
salida = []
for fila in hoja.iter_rows(min_row=1, max_row=60, max_col=26):
    for c in fila:
        v = c.value
        if v is None or (isinstance(v, str) and v.strip() == '' and not str(v).startswith('=')):
            continue
        origen = None
        if isinstance(v, str) and v.startswith('='):
            m = re.search(r"'INGRESO DE DATOS'!\$([A-Z]+)\$(\d+)", v)
            origen = f'{m.group(1)}{m.group(2)}' if m else v
        color = c.font.color
        blanca = bool(color is not None and color.type == 'theme' and color.theme == 0)
        salida.append({
            'celda': c.coordinate,
            'rango': rangos.get(c.coordinate, c.coordinate),
            'origen': origen,
            'literal': None if origen else v,
            'fuente': c.font.name,
            'pt': c.font.sz,
            'negrita': bool(c.font.b),
            'blanca': blanca,
            'alinea': c.alignment.horizontal,
            'valinea': c.alignment.vertical,
            'ajusta': bool(c.alignment.wrap_text),
            'formato': c.number_format,
        })
json.dump(salida, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(len(salida), 'celdas')
