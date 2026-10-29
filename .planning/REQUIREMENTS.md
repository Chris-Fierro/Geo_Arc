# Requirements: Geo_Arc (v1.4 Consolidation & Normative Precision)

**Defined:** 2026-10-28
**Core Value:** Permitir a un arquitecto delimitar un lote real a escala predial, evaluar con precisión matemática y normativa su envolvente y sombra OGUC junto con su contexto urbano/topográfico, y exportar geometrías 2D/3D fieles y georreferenciadas para su flujo de diseño en CAD/BIM.

## v1 Requirements (Milestone v1.4)

### Normativa OGUC y Motor Solar (`OGUC`)

- [x] **OGUC-01**: El usuario puede visualizar y evaluar la sombra propuesta OGUC (Art. 2.6.12) proyectada a partir de la unión de huellas de todos los niveles volumétricos activos (`continuous`, `main`, `upper_stepped`) en lugar de considerar únicamente la terraza superior.
- [x] **OGUC-02**: El usuario puede arrastrar la posición del volumen/lote en el visor Topográfico 2.5D (`ContourViewer`) y ver reflejado el mismo desplazamiento inmediatamente en el visor 3D Satelital (`ThreeTerrainViewer`) y al guardar/cargar archivos `.geoarc`.
- [x] **OGUC-03**: El usuario puede dibujar lotes irregulares cóncavos (ej. en forma de "L" o "U") y obtener polígonos de distanciamiento interior (`insetPolygonBisector`) sin auto-intersecciones de aristas que deformen la extrusión 3D ni el área normativa.
- [x] **OGUC-04**: El usuario obtiene cálculos de posición solar (`altitud` y `azimut` en `SunPosition.ts`) con huso horario preciso según longitud/fecha (incluyendo horario de verano/invierno en Chile UTC-3/UTC-4) y parseo de fechas `YYYY-MM-DD` en hora local sin desfase de medianoche UTC.

### Interoperabilidad CAD / GIS / 3D (`CAD`)

- [x] **CAD-01**: El usuario puede exportar archivos `.DXF` donde las vías y cuerpos de agua se recortan limpiamente al BBox (`clipWayToBBox`), se incluyen edificios multipolígono (`type === 'relation'`) y las elevaciones Z se muestrean mediante interpolación bilineal.
- [x] **CAD-02**: El usuario puede exportar mallas `.STL` cuya geometría de terreno y edificios (normalización de cota Z relativa a `minEv` y empotramiento de `0.35m` en pendiente) es idéntica a la generada para `.GLB`, `.OBJ` y el visor 3D.
- [x] **CAD-03**: El usuario puede seleccionar un Sistema de Referencia (`CRS`: `EPSG:32718` UTM 18S, `EPSG:32719` UTM 19S, `EPSG:32633` o `EPSG:4326`) y obtener coordenadas reproyectadas reales tanto en la exportación `.DXF` como en el archivo Worldfile `.JGW`.
- [x] **CAD-04**: El usuario puede importar archivos locales de malla 3D (`.PLY` y `.FBX` mediante `processMeshFile`) desde la barra lateral y exportar directamente la lámina vectorial topográfica en formato `.SVG` (`topografia_*.svg`).

### Rendimiento, Memoria WebGL y Persistencia (`PERF`)

- [ ] **PERF-01**: El usuario conserva automáticamente su sesión de trabajo activa (terreno `meshData`, polígono de lote `customLotPts` y parámetros OGUC/Solar) en almacenamiento local (`IndexedDB`) al recargar el navegador (`F5`), con control para restablecer la sesión.
- [x] **PERF-02**: El usuario puede rotar y orbitar la vista 2.5D (`ContourViewer`) en Modo Solar a 60 FPS gracias a la memoización (`useMemo`) de los polígonos de sombra calculados por raymarching (`getSolarShadowPolygon`).
- [x] **PERF-03**: El usuario puede deslizar la hora solar y modificar parámetros OGUC continuamente en la vista 3D (`ThreeTerrainViewer`) sin fugas de memoria en la GPU gracias a la liberación recursiva (`dispose()`) de geometrías, materiales y texturas al actualizar grupos de escena.
- [ ] **PERF-04**: El usuario extrae terrenos sin doble interpolación redundante `150x150` entre `OsmImporter.tsx` y `App.tsx`, y opera una barra lateral libre del botón simulado sin efecto (`"Generar Visualización 3D"` / `handleSimulateProcess`).

### Calidad, Arquitectura, Seguridad y Tests (`QUAL`)

- [ ] **QUAL-01**: El repositorio cuenta con `Vitest` configurado y una suite de pruebas automatizadas que valida el motor OGUC (`ogucService.ts`), el motor solar (`SunPosition.ts`), el cálculo de métricas de polígonos, las conversiones CRS/UTM y los constructores de exportación.
- [x] **QUAL-02**: La construcción de geometrías Three.js (terreno y extrusión de edificios con empotramiento en pendiente) está unificada en un módulo compartido consumido por `ThreeTerrainViewer.tsx` y todas las exportaciones 3D (`.GLB`, `.OBJ`, `.STL`).
- [ ] **QUAL-03**: La carga de archivos `.geoarc` valida el esquema e integridad de `meshData` y `satelliteTexture`, el proxy `/api/overpass` (`vite.config.ts`) impone límite de payload (`64 KB`) y cabeceras limpias, se remueve la inyección de `GEMINI_API_KEY` en el cliente y se depuran paquetes no usados y scripts en `package.json`.

## v2 Requirements (Deferred)

### Análisis Urbano Avanzado

- **URB-01**: Soporte para múltiples lotes simultáneos o subdivisión predial dentro de un mismo recorte topográfico.
- **URB-02**: Cálculo de horas acumuladas de radiación/asoleamiento diario sobre fachadas y terreno (mapa de calor solar continuo).
- **URB-03**: Biblioteca de plantillas de Planes Reguladores Comunales (PRC) chilenos preconfigurados por comuna (coeficiente de constructibilidad, ocupación de suelo, altura máxima y antejardín).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend con autenticación y base de datos cloud | Se mantiene arquitectura 100% *client-side* sin costos de servidor; la persistencia se resuelve con `IndexedDB` local y archivos `.geoarc`. |
| Modelado BIM detallado (muros, puertas, ventanas IFC) | `Geo_Arc` se enfoca en cabida urbana, normativa OGUC, topografía y asoleamiento; el desarrollo arquitectónico detallado se realiza en CAD/BIM externo. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| OGUC-01 | Phase 1: Precisión Normativa OGUC y Motor Solar | Complete |
| OGUC-02 | Phase 1: Precisión Normativa OGUC y Motor Solar | Complete |
| OGUC-03 | Phase 1: Precisión Normativa OGUC y Motor Solar | Complete |
| OGUC-04 | Phase 1: Precisión Normativa OGUC y Motor Solar | Complete |
| CAD-01 | Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada | Complete |
| CAD-02 | Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada | Complete |
| CAD-03 | Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada | Complete |
| CAD-04 | Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada | Complete |
| QUAL-02 | Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada | Complete |
| PERF-01 | Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local | Pending |
| PERF-02 | Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local | Complete |
| PERF-03 | Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local | Complete |
| PERF-04 | Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local | Pending |
| QUAL-01 | Phase 4: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura | Pending |
| QUAL-03 | Phase 4: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-28*
*Last updated: 2026-10-28 after roadmap creation*
