"""Mide, en un PDF que Excel exportó de la hoja «IMP. CONTRATO» con borde fino en cada celda, dónde cae de
verdad cada línea de la cuadrícula.

Por qué existe: el archivo .xlsx guarda anchos en «caracteres» y alturas en puntos, y Excel los vuelve a
redondear a la hora de imprimir (cada fila imprime una unidad menos que lo que dice el archivo; cada columna
es un número entero de unidades de pantalla). Calcular los milímetros desde el archivo da cifras que Excel no
imprime. Esto lee las líneas del PDF y devuelve las posiciones exactas.

Uso (herramienta de análisis, NO es parte del sistema ni se carga en el navegador):
    python3 -I medir_cuadricula.py <pdf-con-bordes> <salida.json>

El PDF se obtiene abriendo una COPIA del libro en Excel, poniendo borde fino a A1:Z60 y exportando solo esa hoja.
Cada borde sale como un rectángulo negro de 0.89 pt de grosor (la escala de impresión, 89 %).
"""
import json
import re
import sys

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import pdftext as P  # noqa: E402

ESCALA = 0.89           # «Ajustar a: 89 %» del archivo
PT_A_MM = 25.4 / 72

objs = P.cargar(sys.argv[1])
paginas = {}
for n, (_pg, contenido, _res) in enumerate(P.paginas(objs)):
    s = re.sub(r'\s+', ' ', P.stream(objs[contenido]).decode('latin1'))
    horizontales, verticales = set(), set()
    for m in re.finditer(r'0 0 0 sc ([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l ([\d.]+) ([\d.]+) l ([\d.]+) ([\d.]+) l h f', s):
        x0, y0, x1, _y1, _x2, y2, _x3, _y3 = map(float, m.groups())
        ancho, alto = abs(x1 - x0), abs(_y1 - y2)
        if alto < 1.2 and ancho > 3:
            horizontales.add(round(max(y0, y2), 2))
        elif ancho < 1.2 and alto > 3:
            verticales.add(round(min(x0, x1), 2))
    paginas[n + 1] = {'h': sorted(horizontales, reverse=True), 'v': sorted(verticales)}

p1, p2 = paginas[1], paginas[2]
# Filas visibles de arriba abajo (las ocultas del archivo no dejan línea): 18, 52, 54 y 55.
ocultas = {18, 52, 54, 55}
visibles = [r for r in range(1, 61) if r not in ocultas]
assert len(p1['h']) == len(visibles) + 1, (len(p1['h']), len(visibles))
alturas = {}
for i, fila in enumerate(visibles):
    alturas[fila] = round((p1['h'][i] - p1['h'][i + 1]) / ESCALA)
for fila in ocultas:
    alturas[fila] = 0

# Columnas: A–V salen en la página 1 y W–Z en la 2 (la carta no alcanza para las 26).
letras = [chr(ord('A') + i) for i in range(26)]
anchos = {}
v1 = p1['v']
# v1 empieza en el borde izquierdo de A; M está oculta (sin línea), así que se salta
orden1 = [c for c in letras[:22] if c != 'M']
assert len(v1) == len(orden1) + 1, (len(v1), len(orden1))
for i, col in enumerate(orden1):
    anchos[col] = round((v1[i + 1] - v1[i]) / ESCALA)
anchos['M'] = 0
v2 = p2['v']
for i, col in enumerate(letras[22:]):
    anchos[col] = round((v2[i + 1] - v2[i]) / ESCALA)

origen_x_pt = v1[0]
origen_y_pt = p1['h'][0]
salida = {
    'escala': ESCALA,
    'origenPapelMm': {'x': round(origen_x_pt * PT_A_MM, 2), 'y': round((792 - origen_y_pt) * PT_A_MM, 2)},
    'anchosUnidades': anchos,
    'alturasUnidades': {str(k): v for k, v in sorted(alturas.items())},
    'mmPorUnidad': round(ESCALA * PT_A_MM, 5),
    # Lo medido sin tocar, en puntos desde abajo/izquierda de la página: de aquí salen las unidades de arriba.
    'lineasMedidasPt': {'pagina1': p1, 'pagina2': p2},
}
json.dump(salida, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(json.dumps(salida, ensure_ascii=False)[:600])
print('ancho total A-Z (unidades):', sum(anchos.values()), 'alto total (unidades):', sum(alturas.values()))
