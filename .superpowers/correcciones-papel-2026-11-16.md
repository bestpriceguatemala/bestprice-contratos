# Tres correcciones del dueño sobre lo que imprime el contrato (16 de noviembre de 2026)

Estado: hecho, probado y visto impreso a PDF. Base: 2699 pruebas; ahora 2727, 0 fallan.

## Qué se hizo
1. **Combustible de salida**: `combustibleSalida` se imprime otra vez (sin `imprime: false`; la nota del campo conserva la lectura equivocada del 14 de octubre y la corrección). En «Sacar carro» es una casilla de texto (`sc-combustible-salida`, igual que la hora). Consumidores revisados: recibir carro, detalle, respaldo (columna AC, texto inline, nunca fórmula), papel; todos escapan. Nada calcula con él (prueba lo comprueba; otra prueba fija la lista de archivos que lo leen).
2. **Q en todo monto**: se quitó `sinQ` de LDW, PAI y deducible de abajo. Hoja de prueba: marca `papelTraeLaQ`, muestra «Q150.00» con borde grueso dibujada por el mismo código del contrato, aviso en la hoja impresa y en la pantalla de calibrar. No se discute en el código.
3. **Nueve casillas en blanco**: ver diseño abajo.

## Verificado y NO tocado
CODIGO del cliente: vacío (sin fuente). Tarjetas: número, vence, CBC, autorización y monto de las dos y banco de la 1 se imprimen. El banco de la tarjeta 2 NO tiene casilla en el Excel (solo un «BANCO EMISOR»), así que nunca se imprimió.

## Diseño del interruptor
Pantalla de imprimir, nueve marcas (una por casilla, todas puestas), botón «Dejar las nueve en blanco / Imprimir las nueve», y renglón destacado junto al botón Imprimir: «En blanco en este papel (n de 9): …». Cada marca enseña el dato que llevaría. No se guarda en ningún lado; vuelve a las nueve marcadas tras imprimir/cancelar (`afterprint`) y al salir. Por casilla porque las razones difieren; por papel porque recordarlo dejaría vacías casillas en el contrato de otro cliente. No va en calibración (esa es de la impresora, no del cliente). Costo conocido: cancelar el diálogo también reinicia las marcas (mismo trato que los datos tecleados para el papel).

## Mutaciones
Arnés propio (compara tests corridos y fallos; ERROR si no corrió nada). Controles: comentario SOBREVIVE, Q apagada MUERE, archivo de pruebas inexistente ERROR. Ronda 1: 12 muertas de 12. Ronda 2: 23 muertas de 25; 1 sobrevivía por filtro redundante (se simplificó el código y la mutación equivalente pasó a ser una muerta) .

## PDF (Chrome headless propio, puerto de la app 4533, CDP 9333, Firebase falso por import map, IndexedDB v3 sembrada con constructores reales)
Una página Carta en las cinco. «Lleno» (contrato viejo) y texto libre impresos; LDW «Q   72.00», PAI «Q5.00», deducible de abajo «Q55,000.00»; con km y PAI en blanco desaparecen solo esos; con las nueve en blanco, igual. Hoja de prueba: aviso + muestras visibles, sin pisar el marco (se bajó el interlineado del rótulo). Hallazgo: una frase larga («FULL, falta una rayita») desborda la casilla de 13 mm y pisa el año de nacimiento; la pantalla ya avisa («se saldría de su casilla»), aviso existente, no nuevo.
