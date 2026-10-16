# Brief: mantenimiento de la flota propia

Preparado el 13 de octubre de 2026, para despachar en cuanto se libere uno de
los tres agentes que hoy comparten el árbol de trabajo (impresión del contrato,
respaldo en Excel, comisiones y empleados).

Es el punto **6** del orden de construcción (§12b del diseño general). El 7, el
respaldo en Excel, ya va adelantado; este queda como el último de los cuatro
grandes.

## Lo que dice la especificación, textual (§12b)

> Cada carro propio lleva el control de sus servicios: **aceite y filtro,
> pastillas de freno, llantas, batería, alineación y balanceo, y servicio
> general**. Cada uno con dos intervalos — kilómetros y tiempo — y **toca con el
> que llegue primero**.
>
> El kilometraje no se escribe aparte: sale del que ya se anota al recibir cada
> carro. En la ficha se ve cuándo se hizo cada servicio, a qué kilometraje, y
> cuánto falta para el siguiente. Cuando falte poco, aparece donde ya aparecen
> los demás avisos.

Seis servicios, dos intervalos cada uno, el que llegue primero. Nada más.

## Lo que ya existe y hay que usar, no reinventar

- **El kilometraje no vive en el carro.** Vive en los contratos: `kmSalida` en
  el contrato (con su puente de lectura `kilometrajeSalida`, en
  `pantallas/recibirCarro.js:conKmSalidaNormalizado`) y `cierre.kmEntrada` al
  recibirlo. El kilometraje de hoy de un carro es el **mayor `cierre.kmEntrada`
  de sus contratos**, y si el carro está afuera, el `kmSalida` del contrato
  abierto puede ser mayor. Esa pregunta — «¿en cuántos kilómetros anda este
  carro?» — es una regla y vive **una sola vez** en el núcleo.
- **Un carro recién comprado no tiene kilometraje conocido.** Ningún contrato,
  ningún dato. Eso no es cero kilómetros: es «no se sabe». Un servicio que se
  calcula sobre un cero inventado avisa mal el primer día y lo entrena a
  ignorar los avisos. Este proyecto ya arregló ese error exacto tres veces
  (un número ausente dibujado como un cero de verdad, §7b).
- **Solo carros propios.** `pantallas/carros.js` es la flota propia y fuerza
  `propiedad: 'Propio'`. Los ajenos viven dentro de sus contratos y no llevan
  mantenimiento: el carro no es de él.
- **Los avisos.** `nucleo/avisos.js:avisosDeSalida` es donde «ya aparecen los
  demás avisos»: niveles `alto` y `medio`, advertencia y no candado. Un servicio
  vencido es `medio` — él decide si renta el carro igual. Leer el comentario de
  cabecera del archivo antes de tocarlo: dice por qué el precio y los días no se
  avisan, y ese criterio manda.
- **La ficha.** `#/carros/:carroId` ya la dibuja `pantallas/carros.js`. El
  bloque de servicios va **ahí dentro**, sin ruta nueva y sin entrada nueva en
  el menú: así se cumple «en la ficha se ve» y no se toca `js/app.js` ni
  `index.html`, que otros dos agentes están editando.

## Decisiones ya tomadas (no volver a abrirlas)

1. **El kilometraje de un servicio se guarda con el servicio.** Él hace el
   cambio de aceite hoy, pero el carro volvió hace tres semanas: el odómetro de
   hoy no es el último `kmEntrada`. Así que el formulario propone el último
   kilometraje conocido y **lo deja corregir**, y el servicio guarda el número
   que él puso. Eso no contradice la especificación: lo que ella prohíbe es
   llevar un kilometraje aparte por carro, no anotar a qué kilometraje se hizo
   un servicio.
2. **Intervalos por omisión, editables por carro.** La especificación pide dos
   intervalos por servicio pero no fija los números, y los números son suyos (su
   taller, sus carros). Van valores por omisión y se pueden cambiar en cada
   carro. Un valor por omisión equivocado le cuesta una corrección; un aviso
   inventado le cuesta la confianza en todos los avisos.
3. **Sin aviso no se adivina.** Si no se sabe el kilometraje del carro, el
   bloque dice «falta registrar el primer servicio» o «no se sabe el
   kilometraje», y el intervalo por tiempo sigue funcionando solo. Nunca un
   «faltan 5,000 km» calculado sobre un dato que no existe.

## Lo que hay que preguntarle a él cuando esto llegue a pantalla

Van a su revisión, con el trabajo ya hecho y funcionando, no antes:

- Los seis intervalos por omisión (km y meses de cada servicio).
- Con cuánto de antelación quiere el aviso: ¿a 500 km / 15 días del servicio?
- Si quiere ver el costo de cada servicio. No está en la especificación, y si lo
  quiere, va detrás de la contraseña de dinero (§11) como todo lo que es cifra
  de negocio.

## Restricciones del proyecto

Las de siempre: módulos ES planos, sin build, sin dependencias, DOM nativo;
todo lo que él lee en español y los comentarios explicando el **por qué**;
dinero con `q()` y `dinero()`, kilometrajes **enteros** (`textoEntero`, nunca
`textoDosDecimales` — ese error ya se cometió aquí y se arregló); fechas ISO por
`diasEntre()` recibiendo `hoy`; nombres de campos en §7b **textuales**, y todo
campo nuevo se agrega ahí con su por qué; fixtures de los constructores reales;
ninguna regla de negocio escrita dentro de una pantalla; cada cambio con una
prueba que falle sin él.

**Archivos que este trabajo NO toca:** `js/app.js`, `index.html`,
`js/pantallas/sacarCarro.js`, `js/nucleo/comision.js`, `js/pantallas/dinero.js`,
`js/pantallas/comprobante.js`, `version.txt`, `js/version.js`.
