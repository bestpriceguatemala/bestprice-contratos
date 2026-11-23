# El arnés de mutaciones

Mide **cuánto valen las pruebas**, no cuántas son. El número verde de `npm test` no dice si una prueba
atraparía un error de verdad: eso se mide metiéndole errores a propósito al código, en una **copia**, y
viendo si alguna prueba se pone roja. Un error que ninguna prueba nota es un hueco; ahí el verde no vale.

Vive **dentro del repositorio** desde el 23 de noviembre de 2026, a propósito: el primer arnés (26 de
octubre) vivía en una carpeta temporal y se perdió, y sin él no se podía repetir ni comprobar nada de lo
que decía su informe.

## Cómo se usa

```sh
# 1. La copia limpia del commit en el que estás (nunca del árbol de trabajo: no se mide sobre
#    pruebas a medio escribir). Confirma que la copia sale verde antes de seguir.
node analisis/mutaciones/correr.mjs preparar

# 2. LOS CONTROLES. Van siempre, antes de cualquier medición.
node analisis/mutaciones/controles.mjs

# 3. Medir un archivo.
node analisis/mutaciones/contar.mjs      # cuántos errores saldrían (rápido, no corre pruebas)
node analisis/mutaciones/correr.mjs correr --archivo js/pantallas/dinero.js --trabajadores 5

# Barrido aparte: ¿se puede VACIAR un mensaje que lee el dueño sin que nadie lo note?
node analisis/mutaciones/mensajes.mjs 2
```

Las copias del árbol y los resultados van **fuera** del repositorio (`$TMPDIR/arnes-mutaciones`, o lo que
diga la variable `ARNES_CASA`): son gigas de copias y no tienen nada que hacer aquí.

## Los controles, y por qué van primero

El 25 de octubre de 2026 un agente reportó «12 mutantes, todos muertos» con un script que **nunca corrió
las pruebas** (zsh no separaba los nombres de archivo), y un mutante que no cambiaba nada también «moría».
De ahí salió la regla: **un arnés sin controles no mide, adivina.** `controles.mjs` corre nueve:

- **La tubería:** una prueba sembrada con `assert.equal(1, 2)` tiene que salir con código 1.
- **Cuatro que NO cambian nada** (comparar al revés, una orden que no hace nada, el mismo juicio escrito
  de otra forma): tienen que **SOBREVIVIR**. Si «mueren», el arnés miente.
- **Cuatro que rompen algo obvio** (reventar al cargar el módulo, dibujar una lectura caída como buena
  noticia): tienen que **MORIR**. Si «sobreviven», el arnés no está corriendo las pruebas.

## Cómo se decide cada resultado

- **MUERE** solo si algún archivo de prueba salió con código distinto de cero.
- **SOBREVIVE** solo si *todas* las pruebas que lo alcanzan salieron con código 0 **y** contaron
  exactamente las pruebas de la línea base de cada archivo.
- Si el conteo no cuadra es **ANOMALÍA**, no sobreviviente: un error del arnés nunca se cuenta como
  mutante muerto, porque eso subiría el puntaje de a gratis.
- Un mutante que se queda girando se mata con su grupo entero de procesos y se cuenta aparte.

«Alcanzan» (`alcance.mjs`) son tres caminos, los tres cuentan: la prueba lo importa (directo o a través de
otros módulos), nombra el archivo en su texto (hay pruebas que LEEN el código fuente en vez de ejecutarlo),
o recorre el árbol de fuentes con `readdirSync`.

Nada usa el shell: `spawn` con arreglo de argumentos, así que no hay nada que se separe mal.

## Lo que un mutante muerto NO demuestra

Que una prueba se ponga roja cuando se rompe una función dice que *si alguien la rompe de las maneras que
el generador sabe romper, alguien se da cuenta*. **No** dice que la función esté correcta: un error que ya
está en el código, y que nadie especificó, no lo ve.
