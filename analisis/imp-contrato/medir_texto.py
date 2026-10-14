"""Mide, en un PDF que Excel exportó de «IMP. CONTRATO» con la dirección de cada celda escrita dentro de ella, dónde
cae de verdad cada texto: la casilla que Excel le recorta (su celda, sin el grosor de la línea) y dónde pone su línea
base. Las posiciones salen en milímetros desde la esquina de arriba a la izquierda de la hoja (borde de A1).

La hoja no cabe en una carta al 89 %: Excel la parte en dos páginas (A–V y W–Z). Aquí se vuelven a unir: lo que
cae en la página 2 se corre el ancho de la página 1.

Uso (análisis, NO es parte del sistema):  python3 -I medir_texto.py <pdf-con-direcciones> <salida.json>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdftext as P  # noqa: E402

PT_A_MM = 25.4 / 72
ORIGEN_X_PT = 50.73      # borde izquierdo de A1 en la página (medido: medir_cuadricula.py)
ORIGEN_Y_PT = 739.49     # borde superior de A1, medido desde abajo de la página
ANCHO_PAGINA_1_PT = 586.51 - 50.73   # lo que cabe de A a V: al terminar V empieza la página 2

objs = P.cargar(sys.argv[1])
visto = {}
for n, (_pg, contenido, recursos) in enumerate(P.paginas(objs)):
    pagina = n + 1
    for t in P.leer_pagina(objs, contenido, recursos):
        m = re.match(r'^([A-Z]+\d+)', t['texto'].strip())
        if not m or t['clip'] is None:
            continue
        celda = m.group(1)
        x, y, w, h = t['clip']
        desplazo = ANCHO_PAGINA_1_PT if pagina == 2 else 0
        x0 = x - ORIGEN_X_PT + desplazo
        x1 = x0 + w
        y0 = ORIGEN_Y_PT - (y + h)       # desde arriba
        y1 = ORIGEN_Y_PT - y
        mat = t['mat']
        base_x = mat[0] * t['tmx'] + mat[4] - ORIGEN_X_PT + desplazo
        base_y = ORIGEN_Y_PT - (mat[3] * t['tmy'] + mat[5])
        previo = visto.get(celda)
        if previo:   # la misma celda partida entre las dos páginas: se une
            x0, x1 = min(x0, previo['x0']), max(x1, previo['x1'])
            y0, y1 = min(y0, previo['y0']), max(y1, previo['y1'])
            if pagina == 1:
                base_x, base_y = base_x, base_y
            else:
                base_x, base_y = previo['baseX'], previo['baseY']
        visto[celda] = {'x0': x0, 'x1': x1, 'y0': y0, 'y1': y1, 'baseX': base_x, 'baseY': base_y,
                        'pt': round(t['pt'], 2), 'blanca': t['color'] == '1 1 1'}

salida = {}
for celda, v in sorted(visto.items()):
    salida[celda] = {
        'casillaMm': {'x': round(v['x0'] * PT_A_MM, 2), 'y': round(v['y0'] * PT_A_MM, 2),
                      'ancho': round((v['x1'] - v['x0']) * PT_A_MM, 2), 'alto': round((v['y1'] - v['y0']) * PT_A_MM, 2)},
        'lineaBaseMm': {'x': round(v['baseX'] * PT_A_MM, 2), 'y': round(v['baseY'] * PT_A_MM, 2)},
        'pt': v['pt'], 'blanca': v['blanca'],
    }
json.dump(salida, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(len(salida), 'celdas medidas')
