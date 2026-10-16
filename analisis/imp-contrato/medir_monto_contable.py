"""Mide, en un PDF que Excel exportó de «IMP. CONTRATO» CON los datos de ejemplo de su libro (INGRESO DE DATOS), dónde pone Excel la «Q» y
el número en las celdas con formato de número CONTABLE (`_("Q"* #,##0.00_)`): la Q pegada al borde izquierdo de la casilla y el número al
derecho, con un hueco en medio. Las posiciones salen en milímetros desde la esquina de arriba a la izquierda de la hoja.

Uso (análisis, NO es parte del sistema):  python3 -I medir_monto_contable.py <pdf> <salida.json>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdftext as P  # noqa: E402

PT_A_MM = 25.4 / 72
ORIGEN_X_PT, ORIGEN_Y_PT = 50.73, 739.49
ANCHO_PAGINA_1_PT = 586.51 - 50.73
# celda de Excel -> (campo del sistema, texto del número que se espera ver)
CELDAS = {'V10': ('horaTardia', '150.00'), 'V27': ('seguroTerceros', '120.00'), 'V28': ('seguro', '72.00'), 'V34': ('combustiblePrecio', '65.00')}

objs = P.cargar(sys.argv[1])
salida = {}
for n, (_pg, contenido, recursos) in enumerate(P.paginas(objs)):
    desplazo = ANCHO_PAGINA_1_PT if n == 1 else 0
    for t in P.leer_pagina(objs, contenido, recursos):
        if t['clip'] is None:
            continue
        mat = t['mat']
        x = (mat[0] * t['tmx'] + mat[4] - ORIGEN_X_PT + desplazo) * PT_A_MM
        base = (ORIGEN_Y_PT - (mat[3] * t['tmy'] + mat[5])) * PT_A_MM
        texto = t['texto'].strip()
        for celda, (campo, numero) in CELDAS.items():
            e = salida.setdefault(celda, {'campo': campo, 'numero': numero})
            if texto == numero:
                e.update({'numeroX': round(x, 2), 'baseY': round(base, 2), 'pt': round(t['pt'], 2)})
            elif texto == 'Q' and abs(base - e.get('baseY', base)) < 0.5 and 'qX' not in e and t['pt'] > 0:
                e['qX'] = round(x, 2)
json.dump(salida, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(json.dumps(salida))
