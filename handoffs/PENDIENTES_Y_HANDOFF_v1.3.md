# GEO·ARC — Hoja de Ruta y Pendientes (Handoff v1.3)

**Fecha de actualización:** 16 de octubre de 2026  
**Repositorio oficial:** [https://github.com/Chris-Fierro/Geo_Arc](https://github.com/Chris-Fierro/Geo_Arc)  
**Rama principal:** `main` (sincronizada con `feature/topography-improvements`)

---

## 0. Cómo retomar el proyecto desde casa

```bash
# 1. Clonar el repositorio actualizado
git clone https://github.com/Chris-Fierro/Geo_Arc.git
cd Geo_Arc

# 2. Instalar dependencias
npm install

# 3. Levantar el servidor de desarrollo (puerto 3000)
npm run dev
```

---

## 1. Lo que ya quedó completado en las últimas sesiones (v1.2 $\rightarrow$ v1.3)

- [x] **Mapa expandible con animación UX:** En [`src/components/OsmImporter.tsx`](../src/components/OsmImporter.tsx), la ventana del mapa se expande al buscar o seleccionar terreno y vuelve a su tamaño compacto al finalizar.
- [x] **Selección de terreno con polígonos Regulares e Irregulares:** Cálculo en vivo de dimensiones por lado, superficie total ($\text{m}^2$ / $\text{ha}$) y marcador del **centro geométrico (centroide)**.
- [x] **Intervalo de curvas de nivel de `0.25m`:** Añadido para terrenos pequeños o de baja pendiente, y renombrado del panel a *"1. Selección de terreno"*.
- [x] **Visor 3D Satelital Integral (`ThreeTerrainViewer.tsx`):**
  - Captura automática de ortofoto satelital de alta resolución (*Esri World Imagery*) en [`src/lib/satelliteService.ts`](../src/lib/satelliteService.ts) con generación de archivo de georreferenciación `.jgw`.
  - Alineación exacta de volúmenes de edificios OSM y vialidad con la malla topográfica y la proyección satelital.
- [x] **Optimización del Layout UI (`src/App.tsx`):** Rediseño compacto para evitar exceso de altura vertical y aprovechar el espacio de pantalla.
- [x] **Exportaciones 3D y CAD corregidas (`src/lib/exportService.ts` y `src/components/ContourViewer.tsx`):**
  - Botón **`Modelo 3D (.OBJ ZIP)`**: Paquete `.obj` + `.mtl` + `.jpg` + `.jgw` para Rhino, Blender, AutoCAD y 3ds Max.
  - Botón **`SketchUp (.GLB)`**: Archivo binario `.glb` nativo para SketchUp con textura satelital incrustada y escala 1:1 en metros.
  - Botón **`Ortofoto (.JPG + .JGW)`**: Descarga directa de imagen satelital y Worldfile.
  - Exportación **`.DXF` en escala real (Metros):** Cabecera AutoCAD `AC1015` con `$INSUNITS = 6` (Metros) y `$MEASUREMENT = 1` (Métrico).

---

## 2. Checklist de Pruebas y Validaciones Pendientes (Corto Plazo)

### 2.1. Pruebas de Exportación en SketchUp y AutoCAD
- [ ] **Validar importación de `.GLB` en SketchUp:**
  - Ir a *Archivo $\rightarrow$ Importar... $\rightarrow$ Archivos glTF (\*.gltf, \*.glb)* y verificar que la malla de terreno, la ortofoto satelital y los edificios de contexto entren en un solo paso y con medidas reales en metros.
- [ ] **Validar importación de `.DXF` en SketchUp (Escala 1:1):**
  - Ir a *Archivo $\rightarrow$ Importar...*, seleccionar el archivo `isolineas_*.dxf`, abrir el botón **"Opciones..."** (esquina inferior derecha) y verificar que **Unidades** esté en **`Metros`** (no en *Pulgadas*, que reduce el dibujo 39.37 veces).
  - Confirmar que las curvas de nivel calcen exactamente sobre el modelo `.GLB`.
- [ ] **Validar paquete `Modelo 3D (.OBJ ZIP)` y `Ortofoto (.JPG + .JGW)`:**
  - Probar la apertura del `.obj` con su material `.mtl` en Rhino/Blender y el archivo `.jgw` en QGIS/AutoCAD Civil 3D.

---

## 3. Tareas de Desarrollo Pendientes (Roadmap Técnico)

### Prioridad 1 — Corrección del "Modo Dibujo Libre" de Lote en el Visor SVG 2.5D
- **Archivo involucrado:** [`src/components/ContourViewer.tsx`](../src/components/ContourViewer.tsx)
- **Síntoma actual:** Al usar el botón *"Dibujar Lote"* directamente dentro del visor topográfico SVG (especialmente con zoom/pan activo o en vista isométrica), los vértices dibujados aparecen desplazados respecto a la punta del cursor.
- **Solución técnica identificada:**
  - En `ContourViewer.tsx`, el evento de arrastrar el volumen (`handleVolumePointerDown` $\rightarrow$ `handleMove`) ya resuelve correctamente la transformación inversa de coordenadas de pantalla (`clientX`, `clientY`) a coordenadas de la grilla (`gridX`, `gridY`) considerando el `d3.zoomTransform` y la proyección isométrica.
  - Se debe extraer esa función de conversión inversa pantalla $\rightarrow$ grilla y aplicarla en los eventos `onPointerDown` y `onPointerMove` del modo de dibujo de lote.

### Prioridad 2 — Módulo 2 OGUC: Rasantes Reales, Fachadas y Art. 2.6.12
- **Archivos involucrados:** [`src/components/ContourViewer.tsx`](../src/components/ContourViewer.tsx) y [`src/components/ThreeTerrainViewer.tsx`](../src/components/ThreeTerrainViewer.tsx)
- **Contexto:** Los controles de la UI en [`src/App.tsx`](../src/App.tsx) ya entregan el objeto completo `ogucParams`:
  - `regionGroup`: `1 | 2 | 3` (Norte, Centro, Sur — preseleccionado automáticamente según latitud).
  - `rasanteStartHeight`: Altura de arranque de la rasante desde el nivel de suelo (default `2.5m`).
  - `minSetback`: Distanciamiento mínimo a deslindes.
  - `applyExtraSetback`: Toggle de distanciamiento adicional sobre $10.5\text{ m}$ de altura (Art. 2.6.12 OGUC).
  - `maxHeight`: Altura máxima permitida.
  - `continuousBaseHeight`: Altura de edificación continua en línea oficial.
- **Tareas a implementar:**
  - [ ] Renderizar caras laterales sólidas/semitransparentes del volumen teórico con sombreado diferenciado por orientación (ej. cara Sur más oscura).
  - [ ] Proyectar planos de rasante inclinados desde cada deslinde partiendo desde `rasanteStartHeight` y aplicando ángulos diferenciados según orientación (Sur vs. Oriente/Poniente/Norte) de acuerdo con la tabla del `regionGroup`.
  - [ ] Aplicar el escalonamiento o retracción adicional cuando `applyExtraSetback` está activo y la altura supera los $10.5\text{ m}$.

### Prioridad 3 — Módulo 3 OGUC: Sombras Comparativas y Reactivas
- **Archivo involucrado:** [`src/components/ContourViewer.tsx`](../src/components/ContourViewer.tsx)
- **Tareas a implementar:**
  - [ ] Calcular y superponer visualmente dos polígonos de sombra:
    1. **Sombra Teórica Normativa (Envolvente máxima permitida)** en tono azul/cian.
    2. **Sombra del Volumen Propuesto** en tono rojo/magenta.
  - [ ] Mostrar en la tarjeta de leyenda normativa el comparativo en $\text{m}^2$ (`Área Sombra Propuesta` vs. `Área Sombra Permitida`) y un indicador de cumplimiento normativo.
  - [ ] Hacer que el perímetro de sombra se recalcule de forma reactiva en tiempo real mientras se arrastra el volumen o se modifican los parámetros OGUC.

### Prioridad 4 — Sincronización de Herramientas Normativas y Solares en el Visor 3D WebGL
- **Archivo involucrado:** [`src/components/ThreeTerrainViewer.tsx`](../src/components/ThreeTerrainViewer.tsx)
- **Tareas opcionales para enriquecer el visor 3D realista:**
  - [ ] Mostrar también el polígono del lote seleccionado, el volumen normativo propuesto y el arco del Heliodon solar dentro del visor 3D WebGL (`3D Satelital`), de modo que ambos visores (`3D Satelital` y `Topográfico SVG`) compartan todas las capas de análisis.
