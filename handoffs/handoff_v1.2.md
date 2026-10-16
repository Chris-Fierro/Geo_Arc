# Handoff GEO·ARC v1.2

## Stack Tecnológico Completo
- **Frontend Framework**: React 18 con TypeScript
- **Build Tool**: Vite
- **Estilos**: TailwindCSS
- **Gráficos 2D/3D (Isométricos)**: D3.js (v7) *(Nota: No se utiliza Three.js; el motor 3D isométrico está construido matemáticamente desde cero en SVG con D3)*
- **Mapas y Geodata**: Leaflet (implícito), OpenStreetMap API (Overpass), Terrarium DEM
- **Procesamiento Matemático**: Algoritmos custom para proyección matricial isométrica y contracción de polígonos (`insetPolygonBisector`)

## Arquitectura de Archivos Principales
- `src/App.tsx`: Orquestador principal. Maneja el estado global (parámetros OGUC, solares, capas, modo de análisis), coordina la importación de archivos/OSM y renderiza el layout de la interfaz (panel de controles lateral).
- `src/components/ContourViewer.tsx`: Motor core de renderizado SVG. Maneja la proyección isométrica, interacciones de D3 zoom/pan, interpolación de mallas de terreno, lógica de dibujo interactivo de polígonos de lote, arrastre de volúmenes y renderizado de geometría normativa.
- `src/components/OsmImporter.tsx`: Módulo de conexión con OpenStreetMap. Extrae cajas delimitadoras, polígonos de edificios, calles, cuerpos de agua y obtiene elevaciones para generar mallas topográficas procedimentales.
- `src/lib/meshProcessor.ts`: Procesa archivos 3D locales (PLY/FBX) parseándolos en mallas de elevación regulares consumibles por el visor 2.5D.
- `src/lib/SunPosition.ts`: Algoritmo astronómico para calcular la posición exacta del sol (acimut e inclinación) según fecha, hora, latitud y longitud.
- `src/lib/templates.ts`: Generadores de código/scripts para funcionalidades de exportación en Python.

## Funcionalidades Implementadas y Verificadas
- Extracción automatizada de topografía y contexto urbano 3D directamente desde OpenStreetMap.
- Importación de modelos de terreno locales (pointclouds o mallas).
- Visualización dual con transiciones fluidas: Planta (ortográfica) y Perspectiva (Isométrica 2.5D).
- Panel normativo OGUC interactivo segmentado (Bloques A, B, C) con tooltips descriptivos incorporados.
- Autoselección del grupo de región normativa OGUC evaluando la latitud geográfica de extracción.
- Generador de volumen teórico extruido automáticamente desde el polígono del lote con garantía de techo plano.
- Algoritmo matemático `insetPolygonBisector` para retraer polígonos en base a distanciamientos normativos exactos en metros.
- Arrastre interactivo de volúmenes sobre el terreno con muestreo dinámico y ajuste automático de cota base.
- Renderizado de sombras astronómicas reales (Modo Solar).
- Exportación/Importación de estados completos de escena (`.geoarc`).

## Bug Activo Sin Resolver (Modo Dibujo Libre)
**Síntoma:** 
Al utilizar la herramienta "Dibujar Lote" en el visor, el polígono dibujado aparece desvinculado del terreno, renderizándose en una posición incorrecta y desplazada dentro del lienzo SVG respecto a la punta del cursor.

**Intentos Fallidos:**
- *Intento 1:* Calcular coordenadas relativas usando `getBoundingClientRect()` y restando los píxeles desde el centro de la pantalla. No funcionó porque ignora el escalado interno y ratio del atributo `viewBox` del SVG.
- *Intento 2:* Multiplicar las distancias por un `ratioX / ratioY` (360/width). Fracasó debido a que las transformaciones internas del `<g>` aplicadas por `d3.zoom` operan de forma inconsistente según el tamaño de la ventana y el nivel de paneo.
- *Intento 3:* Aplicar compensaciones directas con `transform.x` y `transform.y`. El resultado es errático en distintas resoluciones de pantalla debido a anidación de transformaciones no lineales.

**Causa Probable:**
La conversión de coordenadas pantalla → grid en los handlers `onPointerDown` y `onPointerMove` del modo dibujo no es consistente con la lógica del `handleMove` del arrastre de volumen, que sí funciona perfectamente para mapear el movimiento del cursor a la grilla isométrica.

**Código Correcto de Referencia:**
La lógica estable se encuentra dentro de `ContourViewer.tsx` en el handler `handleVolumePointerDown` → función interna `handleMove`. Esta secuencia convierte de manera robusta y precisa los deltas de píxeles de pantalla a coordenadas absolutas del grid invertiendo la matriz del proyector isométrico. Esta misma lógica de inversión matricial debe ser adaptada y trasplantada de forma íntegra a los eventos de dibujo.

## Roadmap Pendiente

- **Módulo 2 (OGUC: Rasantes Reales y Fachadas)**
  - Extrusión de paredes laterales del volumen propuesto en lugar de simple extrusión visual.
  - Sombreado diferenciado por caras (cara Sur más oscura para potenciar la tridimensionalidad).
  - Cálculo de planos de rasante reales e inclinados proyectados desde cada fachada (Ángulo Sur vs Ángulos Oriente/Poniente).
  - Integración del arranque inclinado de rasante (`rasanteStartHeight`).
  - Validación visual con aumento de distanciamiento sobre los 10.5m de altura (`applyExtraSetback`).
- **Módulo 3 (Sombras Comparativas)**
  - Cálculo de áreas de sombra superpuestas (Volumen Propuesto vs Sombra Normativa Máxima).
- **Feature C (Sombras Reactivas)**
  - Actualización en tiempo real de los perímetros de sombra al interactuar, dibujar y modificar parámetros normativos del volumen.

## Parámetros OGUC Disponibles (`ogucParams`)
Los siguientes parámetros ya están inyectados en el estado global y pasados exitosamente al motor de visualización gráfico, listos para integrarse en el Roadmap:
- `regionGroup`: `1 | 2 | 3` (Grupo de zona climática/latitud).
- `rasanteStartHeight`: `number` (Altura en metros desde el suelo donde inicia la inclinación de la rasante, usualmente 2.5m).
- `minSetback`: `number` (Distanciamiento mínimo a deslindes en metros).
- `applyExtraSetback`: `boolean` (Toggle para aumentar distanciamiento si altura > 10.5m, según Art. 2.6.12).
- `maxHeight`: `number` (Altura máxima permitida por plan regulador comunal).
- `continuousBaseHeight`: `number` (Altura de placa de edificación continua en línea oficial).
- `showShadows`: `boolean` (Toggle de visibilidad para renderizado de las sombras OGUC proyectadas).
- `angle`: `number` (Ángulo consolidado pre-calculado para fallback simplificado, ej. 51°, 57°, 63°).
