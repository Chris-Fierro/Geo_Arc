# Feature A: Dibujo libre del polígono de lote

## Propuesta de Implementación

Para cumplir con el trazado libre del lote sobre el canvas SVG, realizaré los siguientes cambios:

### `src/App.tsx`
- Añadir el estado `isDrawingLot` (boolean) y `drawnLotPts` (array de puntos 2D).
- En el panel izquierdo (sección OGUC), agregar el botón **"Dibujar lote"** (con ícono de lápiz/polígono) y el botón **"Limpiar lote"**.
- Deshabilitar el paneo (arrastre del mapa) pasando un prop `isDrawingLot` a `ContourViewer` para suprimir la propagación de eventos o modificar la clase CSS del cursor (`cursor-crosshair`).
- Pasar un callback `onLotDrawn` o gestionar los puntos directamente compartiendo el estado.

### `src/components/ContourViewer.tsx`
- Modificar el `<svg>` para interceptar `onClick` y `onPointerMove` (para la línea de previsualización) cuando `isDrawingLot` esté activo.
- Al hacer clic: capturar las coordenadas de pantalla `(e.clientX, e.clientY)`. Usar la matriz inversa (ya implementada en la Etapa 1) para convertir estos píxeles físicos a coordenadas de la grilla `(x, y)`.
- Extraer la altura en ese punto utilizando `getGridElevAt(x, y)`.
- Si el usuario hace doble clic o hace clic cerca del primer punto (radio de ~10px en espacio de pantalla), el polígono se cierra.
- Renderizar dinámicamente el polígono en construcción: una polyline punteada que una los puntos ya confirmados y el último segmento que siga en tiempo real al cursor del mouse.
- Si estamos en `isPerspective === true` (vista Perspectiva), bloquear el botón o mostrar la alerta solicitada *"El dibujo de lote está disponible en vista Planta."*

## Open Questions

> [!IMPORTANT]
> Dado que el estado del polígono dibujado dictará el volumen proyectado, guardaremos los vértices finales en `App.tsx` y los inyectaremos a `ContourViewer`.
> ¿Deberíamos permitir que el usuario dibuje polígonos cóncavos o solo convexos? Por defecto, el dibujo libre permite cualquier forma, pero asumiré que el renderizado 3D soportará formas complejas sin problemas gracias a SVG.

## Verificación
1. Entrar al Modo OGUC en vista Planta.
2. Hacer clic en "Dibujar lote". Confirmar que el cursor cambia y no se puede panear.
3. Hacer clics sucesivos en el terreno y ver cómo se va formando el polígono (con elevaciones correctas).
4. Cerrar el polígono haciendo clic en el origen.
