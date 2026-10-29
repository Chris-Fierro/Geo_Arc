# Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Garantizar una experiencia de usuario fluida, reactiva y persistente:
1. Persistencia automática del proyecto en almacenamiento local del navegador (`IndexedDB`) ante recargas (`F5`).
2. Rendimiento sostenido a 60 FPS en el visor 2.5D (`ContourViewer`) al rotar/orbitar con sombras solares activas mediante memoización de raymarching.
3. Estabilidad de memoria GPU en el visor 3D (`ThreeTerrainViewer`) mediante liberación recursiva (`dispose()`) de geometrías, materiales y texturas WebGL.
4. Extracción de terreno limpia sin doble interpolación redundante y depuración de controles sin efecto en la barra lateral.

Esta fase aborda los requerimientos `PERF-01`, `PERF-02`, `PERF-03` y `PERF-04`.

</domain>

<decisions>
## Implementation Decisions

### Persistencia Automática en IndexedDB (`PERF-01`)
- **D-01:** Implementar un servicio de almacenamiento local puro en TypeScript (`src/lib/storageService.ts`) utilizando la API nativa `IndexedDB` (`geoarc_db`, store `project_session`).
  - Guardar el estado completo de la sesión: `meshData` (incluyendo grilla DEM, dimensiones, cotas, BBox y textura satelital), `customLotPts`, `ogucParams`, `solarParams`, `analysisMode`, `crs` y `activeTab`.
  - Guardado reactivo con debounce de 500ms al modificar estados clave.
  - Restauración automática al inicializar `App.tsx` (`useEffect`), mostrando un breve indicador/toast sutil "Sesión restaurada".
  - En la barra de navegación superior o panel lateral, añadir control visible "Restablecer Sesión" / "Nueva Sesión" con confirmación para limpiar `IndexedDB` y volver al estado inicial.

### Memoización de Raymarching Solar a 60 FPS (`PERF-02`)
- **D-02:** En `src/components/ContourViewer.tsx`, desacoplar el cálculo 3D de sombras solares (`getSolarShadowPolygon`) del bucle de renderizado JSX.
  - Encapsular el cálculo de polígonos 3D de sombra en un hook `useMemo` dependiente únicamente de `[analysisMode, solarParams?.showShadows, sunPosition, buildings3D, projectVolume, meshData]`.
  - En el ciclo de renderizado (incluyendo auto-órbita y arrastre con puntero), únicamente proyectar a 2D los polígonos ya calculados (`render3DPath`), garantizando 60 FPS estables sin llamadas redundantes a las 2,000 iteraciones de raymarching por vértice.

### Prevención de Fugas de Memoria GPU WebGL (`PERF-03`)
- **D-03:** En `src/components/ThreeTerrainViewer.tsx` (y utilidades de escena Three.js):
  - Crear la función canónica `disposeObjectTree(obj: THREE.Object3D)` que recorre recursivamente el árbol con `obj.traverse(...)` y libera:
    - Geometrías (`child.geometry?.dispose()`).
    - Materiales individuales y arreglos de materiales (`child.material?.dispose()`), liberando sus mapas de textura asociados (`map`, `normalMap`, etc.).
  - Invocar `disposeObjectTree` antes de `scene.remove(obj)` al reconstruir grupos base (`Terrain_Group`, `Building_Group`, `Roads_Group`, etc.) y capas dinámicas (`Overlay_Lot`, `Overlay_OGUC`, `Overlay_Heliodon`, `Helper_SunRay`).
  - Invocar limpieza completa en la función de desmontaje del componente (`useEffect cleanup`).

### Optimización de Extracción DEM y Limpieza de UI (`PERF-04`)
- **D-04:** En `src/App.tsx` y `src/components/OsmImporter.tsx`:
  - Eliminar el botón ficticio `"Generar Visualización 3D"` (`handleSimulateProcess` y estado `isProcessing3d`) de la barra lateral, ya que `isDone(true)` ya se activa al finalizar la importación.
  - Eliminar la doble interpolación bilineal redundante en `handleOsmDataFetched` asegurando que la grilla DEM pase directamente sin conversiones innecesarias de tipos ni loops duplicados.
  - Limpiar estados huérfanos (`osmDataRaw`, `terrainCurtains`) identificados en la auditoría de deuda técnica.

### the agent's Discretion
- Manejo de cuota de almacenamiento: si `IndexedDB` no estuviera disponible (modo incógnito estricto o permisos denegados), atrapar la excepción y continuar en memoria sin interrumpir la operación.
- Diseño visual del botón "Nueva Sesión" / "Restablecer" respetando los lineamientos de diseño técnico oscuro de Geo_Arc.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auditoría y Código Base
- `.planning/codebase/CONCERNS.md` — Secciones *Performance Bottlenecks*, *Tech Debt* y *Missing Critical Features*.
- `.planning/codebase/ARCHITECTURE.md` — Flujo de datos y ciclo de vida de componentes.
- `.planning/REQUIREMENTS.md` — Requerimientos `PERF-01` a `PERF-04`.
- `.planning/ROADMAP.md` — Criterios de éxito de Phase 3.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets & Key Locations
- `src/components/ContourViewer.tsx` (líneas 762-819, 1443-1456): función `getSolarShadowPolygon` que debe ser memoizada.
- `src/components/ThreeTerrainViewer.tsx` (líneas 303-321, 668-684): efectos de escena donde se debe integrar `disposeObjectTree`.
- `src/App.tsx` (líneas 167-175, 912-928): botón dummy `handleSimulateProcess` a eliminar.
- `src/App.tsx` (líneas 180-290): `handleOsmDataFetched` para optimizar interpolación.

</code_context>

<deferred>
## Deferred Ideas

- Web Workers para raymarching de sombras en segundo plano — diferido para versiones futuras; la memoización con `useMemo` es suficiente para garantizar 60 FPS en la vista.
- Sincronización en la nube (Cloud Sync) — fuera del alcance de la versión client-side pura.

</deferred>

---

*Phase: 03-rendimiento-60-fps-memoria-webgl-y-persistencia-local*
*Context gathered: 2026-10-29*
