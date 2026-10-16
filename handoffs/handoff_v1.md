# Handoff: Estado Actual de GEO·ARC (Versión Estable 1.0)

Este documento es un resumen exhaustivo de toda la arquitectura, herramientas y lógicas desarrolladas hasta el momento en **GEO·ARC**, diseñado para que sirva de punto de partida sólido para las futuras iteraciones de desarrollo.

---

## 1. Arquitectura Base y Entorno
*   **Stack Tecnológico:** React + TypeScript + Vite.
*   **Módulo de Visualización:** Implementación *custom* híbrida utilizando `d3` (para escalas, proyecciones matriciales y generación de curvas) renderizado directamente sobre **SVG vectorial 2.5D**. Se eliminó la dependencia exclusiva de WebGL/Three.js para el renderizado principal de interfaz a favor de un estilo arquitectónico de trazado de líneas ("blueprint/wireframe").
*   **Exportación:** Se incluye `three` y `three-stdlib` (STLExporter) como motor secundario "invisible" única y exclusivamente para tomar los datos vectoriales y exportarlos como mallas sólidas **.STL** para impresión 3D, además de la exportación nativa a **.DXF** (AutoCAD).

## 2. Carga de Geometría y Topografía (Módulo Topográfico)
La aplicación consolida dos flujos de adquisición de topografía:
1.  **Archivos Locales:** Soporte restringido explícitamente a mallas **.FBX** y nubes de puntos **.PLY**.
2.  **Extracción OSM (OpenStreetMap):** Una integración con la API de Overpass/Elevations. El usuario puede buscar una ciudad, mover el pin en el mapa (`Leaflet`) y extraer el cuadrante.
    *   **Procesamiento:** La data extraída se interpola en una cuadrícula (grid) interna de resolución parametrizable (usualmente `150x150`).
    *   **Curvas de Nivel:** Se utiliza `d3.contours` para generar isolíneas dinámicas. El usuario puede cambiar el intervalo (0.5m, 1m, 5m, 10m) y las curvas maestras se remarcan visualmente.
    *   **Paletas de Color:** Se implementaron los modos *Técnico* (monocromo), *Térmico* (Inferno) e *Hipso* (Hypsometric Tints).
    *   **Contexto Urbano:** Se extraen e interpolan las huellas y alturas de edificios, vías de tránsito (`highways`) y cuerpos de agua (`waterways`), proyectándolos en la cuadrícula 3D.

## 3. Modo de Análisis OGUC
Un módulo para estudios normativos (Ordenanza General de Urbanismo y Construcciones de Chile):
*   Permite cargar un polígono de lote y proyectar un volumen teórico (`projectVolume`).
*   Proyecta conos de sombra simplificados según ángulos rasantes normativos a diferentes orientaciones (ej: 135°, 180°, 225°).

## 4. Motor Astronómico y Análisis Solar
Este es el módulo más avanzado matemáticamente, implementando rigor físico:
*   **Cálculo Solar Verdadero (`SunPosition.ts`):** Corrige el Tiempo Universal a Tiempo Solar Verdadero (TST) usando la Ecuación del Tiempo y la corrección por longitud. Acepta latitud, longitud, fecha y hora local para calcular con extrema precisión la **Elevación** y el **Acimut**.
*   **Sombras Geométricas:** Se abandonó la proyección paralela simple. Ahora las sombras calculan su elongación usando trigonometría física real (`altura / Math.tan(elevación)`), resultando en sombras que se alargan dramáticamente al amanecer/atardecer y se acortan en el cénit.
*   **Heliodon Dinámico:**
    *   **Modo Perspectiva:** Dibuja una bóveda celeste tridimensional que encierra el modelo. Incorpora un **clamping dinámico** (usando la escala de `d3.zoom`) para que si el usuario hace zoom intensivo, el heliodon no desborde la pantalla, sino que adapte su radio preservando su proporción visual y las guías astronómicas (Ecuador, paralelos de 30°/60°, meridiano).
    *   **Modo Planta (HUD):** El heliodon se extrae del grupo de transformación del terreno y se dibuja como un **HUD estático superpuesto en pantalla** con proyección polar. Funciona como una brújula/carta solar clásica que permanece inamovible mientras el usuario arrastra o escala el mapa debajo.

## 5. UI / UX y Control de Vista
*   **Dualidad de Proyección:** Botones de alternancia entre **Planta (2D Ortho)** y **Perspectiva (2.5D Isométrica)** manejando matrices proyectivas matemáticas puras (`a, b, c, d, e, f`).
*   **Controles de Navegación:** Paneo nativo de arrastre, Zoom In/Out, restablecimiento de vista y rotación libre acimutal/pitch en el menú inferior derecho (Modo Perspectiva).
*   **Tematización:** Diseño oscuro estricto, utilizando variables CSS (`--theme-bg-input`, `--theme-accent`, etc.) para un look profesional, técnico y "neo-wireframe".

---

### Próximos Hitos del Roadmap (Sugerencias para el Desarrollador)
1.  **Interactividad de Polígonos:** Desarrollar manejadores de eventos (handlers) para que el usuario pueda editar los vértices del `lotPolygon` y posicionar el `projectVolume` arrastrándolos con el mouse sobre la malla SVG.
2.  **Sombras Adaptativas al Terreno:** Actualmente la proyección solar del volumen arroja una sombra plana en la base (Z constante). El siguiente nivel de fidelidad es deformar esa sombra para que "trepe" por la topografía cruzando los valores de elevación del grid (`getElevAt()`).
3.  **Persistencia:** Implementar exportación del `SceneState` a un archivo JSON propietario (ej. `.geoarc`) para que los alumnos guarden sus laboratorios.
