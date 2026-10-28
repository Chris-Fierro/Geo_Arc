# Geo_Arc — Asistente SIG, Normativo OGUC y Topografía 3D para Arquitectura

## What This Is

**Geo_Arc** es una aplicación web cliente (React 19 + TypeScript + Three.js WebGL + D3.js SVG + Leaflet) diseñada para arquitectos y urbanistas en Chile. Permite extraer terrenos reales desde cualquier ubicación geográfica (elevación DEM AWS Terrarium, edificios/vías/aguas OpenStreetMap y ortofotos satelitales HD Esri/Google), simular envolventes normativas y sombras comparativas según la **Ordenanza General de Urbanismo y Construcciones (OGUC Art. 2.6.3 y Art. 2.6.12)**, analizar asoleamiento mediante un **Heliodón Solar 3D/2.5D**, y exportar modelos listos para CAD/BIM/GIS (`.geoarc`, `.dxf`, `.stl`, `.obj/.mtl` ZIP, `.glb`, `.jpg + .jgw`, `.svg`).

## Core Value

Permitir a un arquitecto delimitar un lote real a escala predial, evaluar con precisión matemática y normativa su envolvente y sombra OGUC junto con su contexto urbano/topográfico, y exportar geometrías 2D/3D fieles y georreferenciadas para su flujo de diseño en CAD/BIM.

## Requirements

### Validated

- ✓ **Extracción Geoespacial Integrada (DEM + OSM + Ortofoto HD):** Búsqueda Nominatim, delimitación por polígono regular, irregular (con cierre de precisión en píxeles `<= 10px` y zoom catastral hasta nivel 22) o punto, decodificación de tiles AWS Terrarium (con saneamiento de batimetría costera `< 0m`), consulta resiliente a OpenStreetMap API v0.6 / proxy Overpass (`/api/overpass`), y composición de ortofotos Esri World Imagery / Google Satellite (Zoom 14–19) con Worldfile `.JGW` — `existing (v1.3.1)`
- ✓ **Doble Motor de Visualización Sincronizado (3D WebGL + 2.5D SVG):** Visor `3D Satelital` (`ThreeTerrainViewer.tsx`) con textura satelital drapeada, edificios extruidos con empotramiento en pendiente (`0.35m`), cámara orbital con presets (`ISO`, `PLANTA`, `FRENTE`, `LOTE`) y visor `Topográfico (SVG)` (`ContourViewer.tsx`) con curvas de nivel D3 (`0.25m`–`10m`), proyección isométrica 2.5D y enfoque a lote — `existing (v1.3.1)`
- ✓ **Motor Normativo OGUC Base y Heliodón Solar:** Cálculo de rasantes por zona geográfica de Chile (Grupos 1, 2 y 3 según latitud, Art. 2.6.3), distanciamientos mínimos y escalonados sobre `10.5m` (Art. 2.6.12), comparación de áreas de sombra (azimuts `135°`, `180°`, `225°`), y cálculo astronómico de posición solar (`SunPosition.ts`) con domo celeste 3D y sombras topográficas 2.5D — `existing (v1.3.1)`
- ✓ **Exportación Multiformato y Proyectos `.geoarc`:** Descarga de paquetes `.OBJ + .MTL + .JPG + .JGW` en `.ZIP`, modelos `.GLB` para SketchUp, curvas y capas en `.DXF`, mallas `.STL` y serialización de sesión en archivos `.geoarc` — `existing (v1.3.1)`

### Active

- [ ] **Precisión Normativa OGUC y Motor Solar:**
  - Proyección de sombra propuesta OGUC multinivel (Art. 2.6.12) considerando la unión de huellas de todos los niveles (`continuous`, `main`, `upper_stepped`) y no solo el nivel superior.
  - Sincronización bidireccional del desplazamiento (`volumeOffset` / arrastre de lote y volumen) entre el visor 2.5D (`ContourViewer.tsx`), el visor 3D (`ThreeTerrainViewer.tsx`) y el archivo `.geoarc`.
  - Robustez geométrica de distanciamientos (`insetPolygonBisector`) en lotes irregulares cóncavos (en "L" o "U") previniendo auto-intersecciones de aristas.
  - Corrección de huso horario dinámico (incluyendo horario de verano UTC-3 / longitud geográfica) y parseo de fechas locales sin desfase UTC en `SunPosition.ts` y `App.tsx`.
- [ ] **Interoperabilidad CAD / GIS / 3D y Funciones Completas en UI:**
  - Recorte exacto de vías y cuerpos de agua al BBox (`clipWayToBBox`), soporte de edificios multipolígono (`relation`) e interpolación bilineal de cotas Z en la exportación `.DXF`.
  - Unificación geométrica de la exportación `.STL` con `buildThreeSceneFromMeshData` (misma normalización Z y empotramiento de edificios que `.GLB` y `.OBJ`).
  - Conexión real del selector `Sistema de Referencia (CRS)` (soporte de husos UTM chilenos `EPSG:32718` / `EPSG:32719`, `EPSG:32633` y `EPSG:4326`) en exportaciones `.DXF`, `.JGW` y visualización de coordenadas.
  - Habilitación en la UI de la importación local de mallas 3D (`.PLY` / `.FBX` vía `processMeshFile`) y botón de exportación directa de lámina vectorial `.SVG` (`topografia_*.svg`).
- [ ] **Rendimiento, Gestión de Memoria WebGL y UX (Persistencia Local):**
  - Autoguardado y restauración automática de la sesión activa en el navegador (`IndexedDB` / almacenamiento local) para evitar pérdida de terreno y lote ante recargas (`F5`).
  - Memoización (`useMemo`) del raymarching solar 2.5D (`getSolarShadowPolygon`) en `ContourViewer.tsx` para mantener 60 FPS al orbitar la cámara.
  - Liberación recursiva de geometrías y materiales GPU (`disposeObjectTree`) en `ThreeTerrainViewer.tsx` al actualizar overlays dinámicos (lote, OGUC, heliodón) y escena base.
  - Optimización de texturas satelitales en memoria y eliminación del botón redundante `"Generar Visualización 3D"` (`handleSimulateProcess`).
- [ ] **Arquitectura, Seguridad y Suite de Tests Automatizados:**
  - Configuración de `Vitest` y suite de tests unitarios para motores críticos (`ogucService.ts`, `SunPosition.ts`, métricas de polígonos, proyecciones CRS y constructores de exportación).
  - Consolidación de la construcción de escenas Three.js en un módulo compartido y eliminación de la doble interpolación `150x150` del DEM entre `OsmImporter.tsx` y `App.tsx`.
  - Validación de esquema e integridad al importar archivos `.geoarc`, límite de payload (`64 KB`) y cabeceras limpias en el proxy `/api/overpass` (`vite.config.ts`), remoción de `GEMINI_API_KEY` del bundle cliente y limpieza de dependencias no utilizadas en `package.json`.

### Out of Scope

- **Backend dedicado con cuentas de usuario y base de datos en la nube** — `Geo_Arc` mantiene su arquitectura 100% *client-side* sin costo de servidor; la persistencia se resuelve con `IndexedDB` local y archivos portables `.geoarc`.
- **Motor BIM paramétrico completo (muros, losas, puertas IFC)** — El alcance volumétrico de `Geo_Arc` es el estudio de cabida, envolvente normativa OGUC, asoleamiento y contexto topográfico previo al desarrollo detallado en software BIM/CAD (Archicad, Revit, SketchUp, AutoCAD).

## Context

- **Estado del Repositorio:** Proyecto *brownfield* activo en versión `v1.3.1` (commit base `bc98eb5` + mapeo `.planning/codebase/` en `3ace7e7`).
- **Ecosistema Técnico:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, Three.js `0.184`, D3.js v7, Leaflet 1.9, `fast-png` y `fflate`.
- **Contexto de Dominio:** Normativa urbanística chilena (OGUC Art. 2.6.3 rasantes según tabla regional de Chile y Art. 2.6.12 distanciamientos para alturas sobre `10.5m` y sombra proyectada comparativa).

## Constraints

- **Compatibilidad Client-Side (Zero-Backend Compute):** Todo el procesamiento geométrico, reproyección CRS/UTM, generación CAD/3D y persistencia debe ejecutarse en el navegador sin requerir servidores de cómputo externos.
- **Preservación de Paridad Visual 2.5D / 3D:** Cualquier cambio en el motor geométrico (`ogucService.ts`, `SunPosition.ts`, `customLotPts`) debe reflejarse de forma idéntica tanto en `ThreeTerrainViewer.tsx` como en `ContourViewer.tsx` y en los archivos exportados (`.dxf`, `.glb`, `.obj`, `.stl`).
- **Entorno Windows y Sincronización:** El repositorio de trabajo se encuentra en `C:\Users\conta\.gemini\antigravity\scratch\Geo_Arc` y mantiene espejo sincronizado en Google Drive (`G:\Mi unidad\CEREBRO II\CEREBRO II\04 Proyectos Personales\NeoArquitecto\Geo_Arc`). Los scripts de `package.json` deben ser compatibles con Windows PowerShell.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Priorizar API oficial OpenStreetMap v0.6 (`map.json`) antes de Overpass | Reduce la descarga de edificios y vías a ~2.6s evitando colas y errores HTTP 406/504 de servidores Overpass públicos | ✓ Good |
| Cierre de polígono irregular por distancia en pantalla (`<= 10px`) | Evita cierres prematuros en triángulo al trabajar con alto nivel de zoom (predios pequeños) | ✓ Good |
| Ortofoto Satelital HD hasta Zoom 19 (`~0.29 m/px`) y visor hasta Zoom 22 | Permite delimitar lotes catastrales con precisión predial para análisis OGUC | ✓ Good |
| Consolidar constructores 3D en un único servicio compartido | Elimina discrepancias de elevación y empotramiento entre el visor WebGL, `.GLB`/`.OBJ` y `.STL` | — Pending |
| Persistencia de sesión local mediante `IndexedDB` | Soporta almacenar `MeshData` con grillas DEM y texturas satelitales de varios megabytes sin el límite de 5 MB de `localStorage` | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-28 after onboarding initialization*
