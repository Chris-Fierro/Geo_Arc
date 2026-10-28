# Phase 1: Precisión Normativa OGUC y Motor Solar - Context

**Gathered:** 2026-10-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Los arquitectos pueden evaluar envolventes, distanciamientos y sombras normativas OGUC (Art. 2.6.3 y Art. 2.6.12) junto con trayectorias solares astronómicas exactas y sincronizadas sin desfase entre el visor 2.5D (`ContourViewer.tsx`), el visor 3D (`ThreeTerrainViewer.tsx`) y los archivos `.geoarc`.

Esta fase aborda los 4 requerimientos `OGUC-01`, `OGUC-02`, `OGUC-03` y `OGUC-04`.

</domain>

<decisions>
## Implementation Decisions

### Sombras OGUC Multinivel (`OGUC-01`)
- **D-01:** En `computeOgucModel` (`src/lib/ogucService.ts`), el cálculo de la sombra propuesta (`proposedPolygons` y `proposedAreaM2`) debe proyectar todos los niveles volumétricos activos (`tiers`: `continuous`, `main`, `upper_stepped`) en los 3 azimuts reglamentarios (`135°`, `180°`, `225°`) y calcular la envolvente/unión de sus polígonos de sombra proyectados sobre el terreno, evitando que la sombra se encoja al activar el retranqueo adicional de Art. 2.6.12 sobre `10.5m` o la edificación continua.

### Sincronización Bidireccional de Lote y Volumen (`OGUC-02`)
- **D-02:** En `src/components/ContourViewer.tsx`, el arrastre interactivo del volumen propuesto (`handleVolumePointerDown` / `volumeOffset`) debe actualizar o persistir las coordenadas del lote (`customLotPts` en `src/App.tsx`, con sus cotas de terreno `elev` remuestreadas con `getGridElevAt`) al finalizar el arrastre (o de forma reactiva), eliminando la desincronización donde `volumeOffset` quedaba atrapado únicamente en el estado local de `ContourViewer.tsx` y se perdía al pasar a `ThreeTerrainViewer.tsx` o al exportar `.geoarc`.

### Distanciamientos Robustos en Lotes Cóncavos (`OGUC-03`)
- **D-03:** En `insetPolygonBisector` (`src/lib/ogucService.ts`), limitar el factor de inglete (`miterScale`) en esquinas agudas/cóncavas y detectar/resolver cruces o auto-intersecciones de aristas adyacentes en polígonos irregulares cóncavos (en forma de "L" o "U"), garantizando que los polígonos de retranqueo (`mainPoly`, `upperPoly`) mantengan orientación válida y no corrompan `THREE.ExtrudeGeometry` en `ThreeTerrainViewer.tsx` ni el área normativa.

### Huso Horario Dinámico y Fecha Local en Motor Solar (`OGUC-04`)
- **D-04:** En `src/lib/SunPosition.ts` (`getSunPosition`), reemplazar el `tzOffset = -4` estático por el cálculo dinámico del huso horario según la fecha y ubicación geográfica (soportando horario de verano/invierno de Chile `America/Santiago` UTC-3 / UTC-4 para longitudes chilenas y aproximación longitudinal `Math.round(lon / 15)` fuera de Chile), y en `src/App.tsx` / `ThreeTerrainViewer.tsx` / `ContourViewer.tsx` parsear `solarDate` (`YYYY-MM-DD`) en mediodía local (`new Date(`${solarDate}T12:00:00`)`) para eliminar el desfase de 1 día provocado por medianoche UTC.

### the agent's Discretion
- Elección del algoritmo geométrico exacto para combinar las huellas de sombra proyectadas de múltiples `tiers` (envolvente convexa combinada o unión poligonal/rasterizada de alta precisión) siempre que sea determinista, rápido en el hilo principal y garantice que `proposedAreaM2` nunca disminuya al agregar pisos inferiores más anchos.
- Mecanismo de commit del arrastre en `ContourViewer.tsx` (aplicar `volumeOffset` en tiempo real durante el drag y volcar a `setCustomLotPts` en `pointerup` reseteando `volumeOffset` a `{ x: 0, y: 0 }`, o actualizar `customLotPts` directamente).

</decisions>

<specifics>
## Specific Ideas

- Mantener 100% de paridad visual y numérica entre `ContourViewer.tsx` (2.5D SVG) y `ThreeTerrainViewer.tsx` (3D WebGL).
- Cero dependencias pesadas nuevas si se puede resolver con geometría computacional limpia en TypeScript dentro de `src/lib/ogucService.ts` y `src/lib/SunPosition.ts`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auditoría y Arquitectura del Código Base
- `.planning/codebase/CONCERNS.md` — Detalla los 4 bugs exactos (`Volume Drag Offset Desynchronization`, `Hardcoded UTC-4 Timezone and UTC Date Parsing in Solar Engine`, `OGUC Proposed Shadow Ignores Lower Tiers`, `Polygon Inset Bisector Algorithm on Non-Convex Lots`) con números de línea.
- `.planning/codebase/ARCHITECTURE.md` — Explica el flujo de datos entre `src/App.tsx`, `src/lib/ogucService.ts`, `src/lib/SunPosition.ts`, `src/components/ContourViewer.tsx` y `src/components/ThreeTerrainViewer.tsx`.

### Requerimientos y Hoja de Ruta
- `.planning/REQUIREMENTS.md` — Definición formal de `OGUC-01`, `OGUC-02`, `OGUC-03`, `OGUC-04`.
- `.planning/ROADMAP.md` — Criterios de éxito observables de la Phase 1.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `projectDirectionalShadowOnTerrain` (`src/lib/ogucService.ts:290-335`): Proyecta los vértices superiores e inferiores de un polígono 3D sobre la topografía DEM y calcula su envolvente convexa (`convexHull2D`) y área (`polygonAreaGrid`).
- `convexHull2D` y `polygonAreaGrid` (`src/lib/ogucService.ts:71-102`): Funciones geométricas puras listas para combinar múltiples nubes de puntos proyectados de distintos niveles (`tiers`).
- `insetPolygonBisector` (`src/lib/ogucService.ts:104-198`): Algoritmo actual de retranqueo por bisectriz interior.
- `getSunPosition` (`src/lib/SunPosition.ts:7-63`): Calculadora de efemérides solares (declinación, ecuación del tiempo, ángulo horario).

### Established Patterns
- Todas las coordenadas de lotes (`customLotPts`) se almacenan en espacio de grilla normalizado `{ x: [0..cols-1], y: [0..rows-1], elev: meters }` en `src/App.tsx` y se pasan por props a ambos visores.
- Tanto `ThreeTerrainViewer.tsx` como `ContourViewer.tsx` invocan `computeOgucModel(meshData, effectiveLotPts, ogucParams)` mediante `useMemo`.

### Integration Points
- `src/lib/ogucService.ts` (`insetPolygonBisector`, `computeOgucModel`)
- `src/lib/SunPosition.ts` (`getSunPosition`)
- `src/App.tsx` (parseo de `solarDate`, estado `customLotPts`, serialización `.geoarc`)
- `src/components/ContourViewer.tsx` (`volumeOffset`, `handleVolumePointerDown`, `handlePointerMove`, `handlePointerUp`)
- `src/components/ThreeTerrainViewer.tsx` (consumo de `customLotPts`, `ogucModel` y `sunPos`)

</code_context>

<deferred>
## Deferred Ideas

- Ninguna — todos los puntos corresponden directamente al alcance de la Phase 1.

</deferred>

---

*Phase: 01-precisi-n-normativa-oguc-y-motor-solar*
*Context gathered: 2026-10-28*
