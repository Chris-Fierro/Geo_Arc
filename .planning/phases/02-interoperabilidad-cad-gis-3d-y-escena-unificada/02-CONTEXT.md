# Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada - Context

**Gathered:** 2026-10-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Los usuarios pueden importar mallas locales y exportar modelos 2D/3D (`.DXF`, `.STL`, `.GLB`, `.OBJ/.MTL`, `.JGW`, `.SVG`) geométricamente consistentes entre sí y georreferenciados en el sistema de coordenadas (`CRS`) seleccionado.

Esta fase aborda los requerimientos `CAD-01`, `CAD-02`, `CAD-03`, `CAD-04` y `QUAL-02`.

</domain>

<decisions>
## Implementation Decisions

### Recorte Limpio e Interpolación Bilineal en Exportación DXF (`CAD-01`)
- **D-01:** En `handleExportDXF` (`src/components/ContourViewer.tsx` o módulo consolidado `src/lib/exportService.ts`), las calles y cursos de agua deben recortarse al BBox del terreno usando `clipWayToBBox` (`src/lib/ogucService.ts`), eliminando las líneas perimetrales parásitas en los bordes.
- **D-02:** Los edificios tipo `relation` (multipolígonos de OSM normalizados en `meshData.buildings`) deben exportarse como polilíneas cerradas en la capa `BUILDINGS` del DXF, e interpolar sus cotas Z mediante muestreo bilineal en la grilla DEM en lugar de saltos discretos.

### Unificación de Escena Three.js para Visor 3D y Exportadores (`CAD-02`, `QUAL-02`)
- **D-03:** Consolidar la construcción de mallas Three.js en una única función compartida (`buildThreeSceneFromMeshData` en `src/lib/exportService.ts`). Tanto el visor `3D Satelital` (`ThreeTerrainViewer.tsx`) como las exportaciones `.GLB`, `.OBJ` y `.STL` deben consumir esta función, compartiendo la misma normalización vertical (`(elev - minEv) * zExaggeration`) y el mismo empotramiento de edificios en pendiente (`0.35m`).

### Georreferenciación Real según CRS / Husos UTM de Chile (`CAD-03`)
- **D-04:** Conectar el selector de `Sistema de Referencia (CRS)` de `src/App.tsx` (`EPSG:32718` UTM 18S, `EPSG:32719` UTM 19S, `EPSG:32633` o `EPSG:4326`) con un conversor cartográfico puro (WGS84 a UTM transversal de Mercator) para que el Worldfile `.JGW` y las entidades del archivo `.DXF` se exporten con coordenadas métricas UTM reales cuando se elija un CRS proyectado.

### Controles de Importación de Mallas y Exportación SVG en la UI (`CAD-04`)
- **D-05:** En la barra lateral (`src/App.tsx`), habilitar un selector/zona de carga para importar mallas 3D locales en formato `.PLY` o `.FBX`, enlazándolo a `processMeshFile` (`src/lib/meshProcessor.ts`) para convertir la nube de puntos/malla en `MeshData` editable con curvas de nivel inmediatas.
- **D-06:** En la barra de exportación superior o en el HUD de `ContourViewer.tsx`, añadir el botón de exportación directa de la lámina topográfica vectorial en formato `.SVG` (`topografia_*.svg`) descargando el contenido SVG limpio con metadatos.

### the agent's Discretion
- Elección entre implementar la proyección UTM con algoritmos matemáticos puros estándar de Karney/Snyder en TypeScript en `src/lib/crsService.ts` o incorporar `proj4` liviano si fuera estrictamente necesario (preferir implementación pura sin dependencias pesadas).
- Ubicación exacta del disparador de importación `.PLY`/`.FBX` (botón en el panel lateral superior o pestaña secundaria dentro del modal de importación) respetando la estética oscura técnica de Geo_Arc.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auditoría y Código Base
- `.planning/codebase/CONCERNS.md` — Errores en DXF (`DXF Export Clamps Out-of-Bounds Roads`), inconsistencia de Z en `.STL` (`Triplicated Three.js Scene Construction`), y funciones faltantes en UI (`.PLY/.FBX Local Import and .SVG Export Buttons Missing from UI`).
- `.planning/codebase/ARCHITECTURE.md` — Capas de exportación y servicios 3D (`src/lib/exportService.ts`, `src/lib/meshProcessor.ts`).
- `.planning/REQUIREMENTS.md` — Requerimientos `CAD-01` a `CAD-04` y `QUAL-02`.
- `.planning/ROADMAP.md` — Criterios de éxito de la Phase 2.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildThreeSceneFromMeshData` (`src/lib/exportService.ts:18-228`): Constructor Three.js métrico listo para unificar `.STL`, `.GLB` y `.OBJ`.
- `processMeshFile` (`src/lib/meshProcessor.ts:20-186`): Parser ya implementado de `.ply` y `.fbx` que produce un `MeshData` listo para usarse.
- `clipWayToBBox` (`src/lib/ogucService.ts:716-758`): Función de recorte Liang-Barsky probada.

</code_context>

<deferred>
## Deferred Ideas

- Soporte de múltiples sistemas de referencia geodésicos sudamericanos antiguos (SAD69, PSAD56) — diferido para versiones futuras; se priorizan WGS84 y UTM WGS84 husos 18S y 19S (Chile).

</deferred>

---

*Phase: 02-interoperabilidad-cad-gis-3d-y-escena-unificada*
*Context gathered: 2026-10-28*
