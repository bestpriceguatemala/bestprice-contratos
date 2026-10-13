# Impresión del contrato sobre el papel preimpreso — informe en curso

> Se escribe a medida que avanza. Si falta el final, mirar los commits.

## Hallazgos del Excel (hoja «IMP. CONTRATO»), en orden de importancia

1. **La hoja NO cabe en una carta con la configuración que trae guardada.** Medido con el propio Excel de
   esta Mac (copia del archivo, exportada a PDF): a escala 89 % la hoja mide 250 mm de ancho (columnas A–Z) y
   la carta solo deja 193 mm entre sus márgenes (izq. 18 mm, der. 5 mm). Excel la corta en DOS páginas:
   la primera con las columnas A–V y la segunda con W–Z (fechas de entrada, horas, los Q de precios).
   El archivo no guarda papel ni «ajustar a una página». Cómo la imprime él de verdad hoy NO se puede saber
   del archivo: es la pregunta número 1.
2. La hoja no tiene ni un borde, ni una línea, ni una imagen (la de las otras hojas es la del buscador):
   es solo texto sobre blanco, hecha para caer sobre un formulario preimpreso.
3. Hay etiquetas escritas en la hoja (ACEPTO LOS CARGOS…, TARJETA 1 No:, EXPIRA:, CODIGO CBC, BANCO EMISOR,
   CODIGO, GUATEMALA, «+ iva») junto a valores. Esas NO se imprimen en el sistema (solo datos) hasta que él
   confirme qué trae ya el papel.
4. Hay 14 celdas con letra BLANCA (color de tema 0): Excel las imprime pero no se ven. No se sabe si es
   un «no imprimir» a propósito. El sistema no las imprime por defecto; pregunta para él.

## Cómo se midió (para que se pueda repetir)

- El archivo guarda anchos de columna en «caracteres» y alturas de fila en puntos, y Excel los convierte a la
  hora de imprimir con redondeos propios. Calcular la geometría a mano da cifras que Excel no imprime.
  Por eso se midió con el propio Excel de esta Mac: se abrió UNA COPIA del libro en la carpeta de trabajo (nunca el
  original), se le puso borde fino a todas las celdas de A1:Z60 y se exportó la hoja a PDF; de ese PDF se leyeron
  las líneas (posición exacta en puntos de cada borde de columna y de fila). Con eso salen los milímetros.
  Un segundo PDF, con la dirección de cada celda escrita dentro de ella, dio la posición real del texto.
- Resultado de la cuadrícula: la hoja se imprime a 0.89 de su tamaño en pantalla; las columnas A–Z suman 797
  unidades de pantalla = 250.2 mm, las filas (sin las 4 ocultas: 18, 52, 54, 55) 666.6 pt = 235.2 mm. El origen
  de la hoja cae a 17.9 mm del borde izquierdo y 18.5 mm del borde superior de la carta (los márgenes
  guardados son 18.0 y 19.0 mm).
- Los anchos de columna son enteros en unidades de pantalla (26 por columna de 3.71 caracteres, etc.) y las
  filas imprimen 1 unidad menos de lo que dice el archivo en casi todos los casos (la línea del borde): esa es la
  diferencia entre «lo que dice el archivo» y «lo que Excel imprime», y por eso no se calculó desde el archivo.
