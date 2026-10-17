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

## 3. Tareas de Desarrollo Completadas en v1.3 (Prioridades 1 a 4)

### Prioridad 1 — Corrección del "Modo Dibujo Libre" de Lote en el Visor SVG 2.5D ✅
- **Archivo involucrado:** [`src/components/ContourViewer.tsx`](../src/components/ContourViewer.tsx)
- [x] Implementada función `screenToGrid(clientX, clientY)` que invierte `getScreenCTM()`, `d3.zoomTransform` y la matriz ortográfica/isométrica con refinamiento iterativo de elevación $Z$.
- [x] Habilitado el trazado preciso de lotes tanto en vista **Planta (2D)** como en **Perspectiva Isométrica (2.5D)** y previsualización en vivo desde el primer vértice.

### Prioridad 2 — Módulo 2 OGUC: Rasantes Reales, Fachadas y Art. 2.6.12 ✅
- **Archivos involucrados:** [`src/lib/ogucService.ts`](../src/lib/ogucService.ts), [`src/components/ContourViewer.tsx`](../src/components/ContourViewer.tsx) y [`src/components/ThreeTerrainViewer.tsx`](../src/components/ThreeTerrainViewer.tsx)
- [x] Renderizado de caras laterales del volumen teórico ordenadas por profundidad y con sombreado diferenciado por orientación (Sur más oscura, Oriente/Poniente tono medio, Norte iluminada).
- [x] Proyección de planos de rasante inclinados 3D desde cada deslinde partiendo desde `rasanteStartHeight` con ángulos diferenciados por orientación (`Sur` vs. `O/P` vs. `Norte`) según el `regionGroup` (`1 | 2 | 3`).
- [x] Aplicado escalonamiento automático sobre $10.5\text{ m}$ de altura cuando `applyExtraSetback` está activo (Art. 2.6.12 OGUC) y soporte de placa continua (`continuousBaseHeight`).

### Prioridad 3 — Módulo 3 OGUC: Sombras Comparativas y Reactivas ✅
- **Archivos involucrados:** [`src/lib/ogucService.ts`](../src/lib/ogucService.ts) y [`src/components/ContourViewer.tsx`](../src/components/ContourViewer.tsx)
- [x] Superposición visual de **Sombra Teórica Normativa (Envolvente máxima permitida)** en azul/cian (`#38bdf8`) y **Sombra del Volumen Propuesto** en rojo/magenta (`#f43f5e`).
- [x] Comparativo en vivo en $\text{m}^2$ (`Sombra Permitida` vs. `Sombra Propuesta`) e indicador automático de cumplimiento normativo (`✓ Cumple Sombra OGUC` / `⚠ Excede Sombra Teórica`).
- [x] Recálculo reactivo en tiempo real al arrastrar el volumen sobre la topografía o modificar parámetros OGUC.

### Prioridad 4 — Sincronización de Herramientas Normativas y Solares en el Visor 3D WebGL ✅
- **Archivo involucrado:** [`src/components/ThreeTerrainViewer.tsx`](../src/components/ThreeTerrainViewer.tsx)
- [x] Sincronizados el polígono de lote, el volumen OGUC multicapa (placa continua, cuerpo base y retranqueo $>10.5\text{ m}$), los planos de rasantes 3D, las sombras comparativas y la bóveda celeste del **Heliodon 3D** (3 arcos estacionales + sol activo), además de dibujo de lote 3D mediante Raycasting.

