---
phase: 01-precisi-n-normativa-oguc-y-motor-solar
plan: 01
subsystem: geometry-engine
tags: [typescript, oguc, computational-geometry, polygon-offset, shadow-projection]

# Dependency graph
requires: []
provides:
  - "Pipeline determinista de 4 etapas en insetPolygonBisector libre de auto-intersecciones para lotes cóncavos ('L', 'U') y vértices duplicados (OGUC-03)"
  - "Proyección de sombra propuesta OGUC multinivel (projectMultiTierDirectionalShadowOnTerrain) aterrizada a la cota real del terreno DEM en azimuts 135°, 180° y 225° (OGUC-01)"
  - "Funciones puras de traslación rígida de lote clampLotDragOffset y translateLotPolygon con remuestreo de elevación (D-02)"
affects:
  - 01-02-PLAN
  - src/components/ContourViewer.tsx
  - src/components/ThreeTerrainViewer.tsx

actuals:
  tokens: 10075
  tasks: 2
  commits: 2
plan_head_before: 86767b1f9217360ae79d50ae66d5cfb1c516d697
plan_head_after: 2a71f891d24b2f2120da210ef320e11c7a59dce4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pipeline de retranqueo poligonal en 4 etapas: cleanPolygonVertices -> bisectriz con miterScale <= 2.5 -> collapseInvertedEdges -> pruneSelfIntersections"
    - "Proyección de sombras OGUC multinivel aterrizando cada tier.basePts sobre getGridElevAt antes de proyectar y unificar con convexHull3D"
    - "Traslación de polígonos de lote como cuerpo rígido acotando el bounding box completo contra [0, n-1] x [0, m-1]"

key-files:
  created: []
  modified:
    - src/lib/ogucService.ts

key-decisions:
  - "Acotar de forma continua el factor de inglete (miterScale <= 2.5) y preservar aristas antiparalelas de brazos estrechos en collapseInvertedEdges para que pruneSelfIntersections corte exactamente el lazo invertido contra el cuerpo principal del lote"
  - "Aterrizar cada tier.basePts a la cota del terreno natural (getGridElevAt) dentro de projectMultiTierDirectionalShadowOnTerrain para evitar que la sombra de upper_stepped reste baseZ105 o flote sobre el terreno"
  - "Condicionar la creación de upper_stepped a effectiveHeight > Math.max(10.5, contBaseH) + 0.05 para impedir tiers escalonados redundantes bajo una placa continua de igual altura"

patterns-established:
  - "Validación geométrica defensiva en insetPolygonBisector: retorno null ante auto-intersección remanente, inversión de signo de área o salida del bounding box original"
  - "Guardia de correspondencia de cardinalidad (hasMatchingRoofVertices) al conectar vértices de borde con vértices retranqueados en rasantePlanes"

requirements-completed:
  - OGUC-01
  - OGUC-03

coverage:
  - id: D1
    description: "Retranqueo interior robusto sin auto-intersecciones en lotes cóncavos ('L', 'U') con guardia de rasantes y helpers de traslación rígida de lote (OGUC-03, D-03, D-02)"
    requirement: OGUC-03
    verification:
      - kind: unit
        ref: "npx tsx verification of insetPolygonBisector on L/U concave lots and translateLotPolygon rigid body clamping"
        status: pass
    human_judgment: false
  - id: D2
    description: "Proyección multinivel de sombras propuestas OGUC (continuous, main, upper_stepped) aterrizadas al terreno natural en azimuts 135°, 180° y 225° (OGUC-01, D-01)"
    requirement: OGUC-01
    verification:
      - kind: unit
        ref: "npx tsx verification of computeOgucModel stepped shadow union and terrain elevation grounding"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-28
status: complete
---

# Phase 01 Plan 01: Motor Geométrico OGUC Multinivel y Retranqueo Cóncavo Summary

**Pipeline de retranqueo poligonal de 4 etapas libre de auto-intersecciones para lotes cóncavos ("L", "U"), proyección multinivel de sombras OGUC aterrizada al DEM y helpers de traslación rígida de lote en `src/lib/ogucService.ts`**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-28T20:01:24Z
- **Completed:** 2026-10-28T20:06:58Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Reemplazado `insetPolygonBisector` en `src/lib/ogucService.ts` por un pipeline determinista de 4 etapas (`cleanPolygonVertices`, bisectriz con `miterScale <= 2.5`, `collapseInvertedEdges` y `pruneSelfIntersections`) que resuelve lotes cóncavos en forma de "L" y "U" y vértices duplicados sin producir lazos cruzados que corrompan `THREE.ExtrudeGeometry`.
- Incorporada la guardia `hasMatchingRoofVertices` en la generación de `rasantePlanes` dentro de `computeOgucModel` para evitar desfase de índices cuando el retranqueo de un lote cóncavo simplifica aristas cortas colapsadas.
- Implementada y conectada `projectMultiTierDirectionalShadowOnTerrain` en `computeOgucModel` para proyectar y combinar mediante `convexHull3D` todos los niveles volumétricos activos (`continuous`, `main`, `upper_stepped`) aterrizados a la cota real del terreno (`getGridElevAt`) en los azimuts `135°`, `180°` y `225°`.
- Exportadas las funciones puras `clampLotDragOffset` y `translateLotPolygon` en `src/lib/ogucService.ts` para soportar el arrastre de lote como cuerpo rígido con remuestreo de cota `elev`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implementar retranqueo robusto para lotes cóncavos (insetPolygonBisector), guardia de rasantePlanes y helpers de traslación rígida de lote (OGUC-03, D-03, D-02)** - `3979e91` (feat)
2. **Task 2: Implementar proyección multinivel de sombras OGUC aterrizada al terreno (projectMultiTierDirectionalShadowOnTerrain) en computeOgucModel (OGUC-01, D-01)** - `2a71f89` (feat)

## Files Created/Modified
- `src/lib/ogucService.ts` - Nuevas funciones geométricas `signedPolygonArea2D`, `cleanPolygonVertices`, `intersectSegmentsStrict`, `collapseInvertedEdges`, `pruneSelfIntersections`, actualización de `insetPolygonBisector`, helpers `clampLotDragOffset` y `translateLotPolygon`, y proyección multinivel `projectMultiTierDirectionalShadowOnTerrain` en `computeOgucModel`.

## Decisions Made
- En `collapseInvertedEdges`, cuando las aristas adyacentes anterior y siguiente a una arista invertida son antiparalelas (caso típico del extremo de un brazo estrecho en un lote en "L" o "U"), se preserva el cruce para que `pruneSelfIntersections` corte el sub-lazo invertido exactamente en la intersección ortogonal con el cuerpo principal del lote, manteniendo ángulos rectos limpios.
- En `projectMultiTierDirectionalShadowOnTerrain`, cada vértice basal de cada `VolumeTier` se remuestrea con `getGridElevAt(p.x, p.y)` antes de invocar `projectDirectionalShadowOnTerrain`, garantizando que `heightAboveGround = roofZ - groundElev` mida la altura total del nivel sobre el suelo natural y que el polígono de sombra no flote a cota `baseZ105` en el visor 3D.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/lib/ogucService.ts` exporta `clampLotDragOffset` y `translateLotPolygon` listos para ser consumidos por `src/components/ContourViewer.tsx` en el Plan `01-02` (`OGUC-02`).
- Tanto `ContourViewer.tsx` como `ThreeTerrainViewer.tsx` reciben automáticamente desde `computeOgucModel` los polígonos de retranqueo sin auto-intersecciones y las sombras multinivel aterrizadas al terreno.

## Self-Check: PASSED
- Found `src/lib/ogucService.ts`
- Found `.planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-01-SUMMARY.md`
- Verified task commits `3979e91` and `2a71f89` are ancestors of `HEAD`

---
*Phase: 01-precisi-n-normativa-oguc-y-motor-solar*
*Completed: 2026-10-28*
