---
phase: 01-precisi-n-normativa-oguc-y-motor-solar
verified: 2026-10-29T01:36:42.511Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-01-PLAN.md
  - .planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-01-SUMMARY.md
  - .planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-02-PLAN.md
  - .planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-02-SUMMARY.md
  - src/App.tsx
  - src/components/ContourViewer.tsx
  - src/lib/SunPosition.ts
  - src/lib/ogucService.ts
covered_digest: "v4:sha256:451116e6b68b2fa63a5bca1042155a91080b165b67e1d75d22d83bdcacfbde5c"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 01: Precisión Normativa OGUC y Motor Solar Verification Report

**Phase Goal:** Los arquitectos pueden evaluar envolventes, distanciamientos y sombras normativas OGUC (Art. 2.6.3 y Art. 2.6.12) junto con trayectorias solares astronómicas exactas y sincronizadas sin desfase entre el visor 2.5D, el visor 3D y los archivos `.geoarc`.
**Verified:** 2026-10-29T01:36:42.511Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Al activar pisos escalonados sobre 10.5m (Art. 2.6.12) o basamento continuo en Modo OGUC, el polígono de sombra propuesta proyecta y evalúa la envolvente combinada de todos los niveles activos (`continuous`, `main`, `upper_stepped`) en los azimuts `135°`, `180°` y `225°`, sin encogerse artificialmente al área de la terraza superior (`OGUC-01`, `D-01`). | ✓ VERIFIED | `src/lib/ogucService.ts:684-745` (`projectMultiTierDirectionalShadowOnTerrain`) y `1022-1034` (`computeOgucModel`). Cada nivel se aterriza en el DEM mediante `getGridElevAt` y se combina con `convexHull3D`. Ejecución programática demostró 3 azimuts y área de sombra escalonada (`1692.42 m²`) >= sombra sin escalonamiento (`1597.45 m²`). |
| 2 | Al arrastrar la posición del volumen o lote en el visor `Topográfico (SVG)`, el desplazamiento se refleja inmediatamente al cambiar al visor `3D Satelital` y se preserva íntegramente al exportar y volver a cargar un archivo `.geoarc` (`OGUC-02`, `D-02`). | ✓ VERIFIED | En `src/components/ContourViewer.tsx` (líneas 744-797), `handleVolumePointerDown` y `handleUp` usan `latestDragOffsetRef`, `clampLotDragOffset` y `translateLotPolygon`, resetean `dragOffset` a `{ x: 0, y: 0 }` y guardan los vértices en `setCustomLotPts`. `src/App.tsx` suministra `customLotPts` a `ThreeTerrainViewer` (líneas 1051-1052) y lo serializa/deserializa en `.geoarc` (líneas 355, 418). |
| 3 | Al dibujar un lote irregular cóncavo (en forma de "L" o "U"), el algoritmo de distanciamiento interior (`insetPolygonBisector`) genera polígonos válidos sin aristas auto-intersectadas ni artefactos en la extrusión 3D ni en el cálculo de superficie (`OGUC-03`, `D-03`). | ✓ VERIFIED | `src/lib/ogucService.ts:367-484` ejecuta pipeline en 4 etapas: `cleanPolygonVertices`, bisectriz con `miterScale <= 2.5`, `collapseInvertedEdges` y `pruneSelfIntersections`. Se verificó programáticamente con lote cóncavo en L produciendo un polígono simple cerrado de 6 vértices, sin auto-intersección y con área positiva acotada. |
| 4 | Cuando el retranqueo de un lote cóncavo reduce la cantidad de vértices respecto a `lotPolygon`, `rasantePlanes` proyecta planos de rasante hacia el interior sin desfase de índices (`OGUC-03`, `D-03`). | ✓ VERIFIED | `src/lib/ogucService.ts:939-972` cuenta con la guardia `hasMatchingRoofVertices = topRoofPtsForRasante.length === lotPolygon.length`, proyectando vectores hacia el interior si la cardinalidad no coincide en vez de acceder a índices desfasados. |
| 5 | Al seleccionar cualquier fecha del año (incluyendo `YYYY-01-01` y periodos de horario de verano UTC-3 o invierno UTC-4 en Chile, o ubicaciones en otras longitudes), el Heliodón calcula la altitud y azimut solar en hora local exacta sin desfase de medianoche UTC (`OGUC-04`, `D-04`). | ✓ VERIFIED | `src/lib/SunPosition.ts:10-39` (`parseLocalSolarDate`) reconstruye la fecha a las 12:00:00 hora local; líneas 47-89 (`getSolarTimezoneOffset`) determinan huso dinámico (-3 en verano, -4 en invierno, -3 en Magallanes, `Math.round(lon/15)` global); líneas 102-104 calculan día del año `N` con `Date.UTC`. |
| 6 | Las funciones puras `clampLotDragOffset` y `translateLotPolygon` están exportadas en `src/lib/ogucService.ts` para trasladar el polígono del lote como cuerpo rígido dentro de los límites `[0, n-1] x [0, m-1]` y remuestrear `elev` con `getGridElevAt` (`D-02`). | ✓ VERIFIED | Exportadas en `src/lib/ogucService.ts:490-540`. Prueba unitaria demostró acotamiento exacto en bordes inferior `{ x: -10, y: -10 }` y superior `{ x: 129, y: 129 }`, y remuestreo de cota en `translateLotPolygon`. |
| 7 | `parseLocalSolarDate(solarDate)` normaliza la fecha solar antes de entregarla a `ThreeTerrainViewer` y `ContourViewer` en `src/App.tsx`, y en el `useMemo` de `ContourViewer.tsx` (`OGUC-04`, `D-04`). | ✓ VERIFIED | Enlazado en `src/App.tsx:1039` (`ThreeTerrainViewer`), `src/App.tsx:1079` (`ContourViewer`), y `src/components/ContourViewer.tsx:444` (`sunPosition useMemo`). |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/lib/ogucService.ts` | Motor normativo OGUC con retranqueo robusto para lotes cóncavos (`insetPolygonBisector`), proyección multinivel de sombras (`projectMultiTierDirectionalShadowOnTerrain`) y traslación rígida de lote (`clampLotDragOffset`, `translateLotPolygon`) | ✓ VERIFIED | 1343 líneas, exporta `insetPolygonBisector`, `cleanPolygonVertices`, `collapseInvertedEdges`, `pruneSelfIntersections`, `projectMultiTierDirectionalShadowOnTerrain`, `clampLotDragOffset`, `translateLotPolygon`, `computeOgucModel`. |
| `src/lib/SunPosition.ts` | Calculadora de efemérides solares con huso horario dinámico (`getSolarTimezoneOffset`) y normalización de fecha local (`parseLocalSolarDate`) | ✓ VERIFIED | 154 líneas, exporta `parseLocalSolarDate`, `getSolarTimezoneOffset`, `getSunPosition`. |
| `src/components/ContourViewer.tsx` | Visor 2.5D con arrastre de lote/volumen sincronizado hacia `setCustomLotPts` usando `clampLotDragOffset`, `translateLotPolygon` y `latestDragOffsetRef` | ✓ VERIFIED | 2264 líneas, integra `latestDragOffsetRef`, `effectiveLotBasePts`, `handleVolumePointerDown` en grupos de lote y volumen, protección de filtro `d3.zoom`, y normalización solar con `parseLocalSolarDate`. |
| `src/App.tsx` | Orquestador principal que normaliza `solarDate` mediante `parseLocalSolarDate(solarDate)` antes de enviarlo a `ThreeTerrainViewer` y `ContourViewer`, y persiste `customLotPts` en `.geoarc` | ✓ VERIFIED | 1114 líneas, integra `parseLocalSolarDate(solarDate)` en líneas 1039 y 1079, y gestiona `customLotPts` para ambos visores e importación/exportación `.geoarc`. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/lib/ogucService.ts` (`computeOgucModel`) | `src/lib/ogucService.ts` (`insetPolygonBisector`) | Cálculo de `mainInset` y `upperInset` sin auto-intersecciones | ✓ WIRED | Líneas 796 y 883 invocan `insetPolygonBisector(lotPolygon, ...)`. |
| `src/lib/ogucService.ts` (`computeOgucModel`) | `src/lib/ogucService.ts` (`projectMultiTierDirectionalShadowOnTerrain`) | Proyección combinada de todos los tiers activos en azimuts 135°, 180° y 225° | ✓ WIRED | Línea 1023 invoca `projectMultiTierDirectionalShadowOnTerrain(tiers, ...)` en las 3 direcciones normativas. |
| `src/App.tsx` | `src/lib/SunPosition.ts` (`parseLocalSolarDate`) | Normalización de `solarParams.date` en `ThreeTerrainViewer` y `ContourViewer` | ✓ WIRED | Líneas 1039 y 1079 invocan `parseLocalSolarDate(solarDate)`. |
| `src/components/ContourViewer.tsx` | `src/lib/ogucService.ts` (`clampLotDragOffset`, `translateLotPolygon`) | Commit del arrastre de lote/volumen hacia `setCustomLotPts` en `pointerup`/`pointercancel` | ✓ WIRED | Líneas 737, 766 y 780 invocan `clampLotDragOffset` y `translateLotPolygon`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/lib/ogucService.ts` | `proposedPolygons` / `proposedAreaM2` | `tiers` combinados + `getGridElevAt(x, y)` | Sí, proyecta huellas de terreno sobre la grilla topográfica DEM | ✓ FLOWING |
| `src/components/ContourViewer.tsx` | `effectiveLotBasePts` | `baseLotPtsWithoutOffset` + `clampLotDragOffset` | Sí, coordenadas en espacio de grilla dinámico | ✓ FLOWING |
| `src/components/ContourViewer.tsx` | `committedPts` | `translateLotPolygon` + `getGridElevAt` | Sí, traslada polígono y remuestrea cotas z en DEM | ✓ FLOWING |
| `src/App.tsx` | `customLotPts` | `ContourViewer: setCustomLotPts` / `.geoarc` | Sí, fluye reactivamente hacia `ThreeTerrainViewer` y persistencia `.geoarc` | ✓ FLOWING |
| `src/lib/SunPosition.ts` | `azimuth`, `elevation` | `lat, lon, parseLocalSolarDate, getSolarTimezoneOffset` | Sí, cálculo astronómico real basado en efemérides solares | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Pipeline de retranqueo cóncavo (`insetPolygonBisector`) | `npx tsx verify_phase01.ts` | L-Shape Inset produce polígono simple de 6 vértices sin auto-intersección | ✓ PASS |
| Limpieza de duplicados (`cleanPolygonVertices`) | `npx tsx verify_phase01.ts` | 6 vértices con 2 duplicados reducidos exactamente a 4 vértices | ✓ PASS |
| Acotamiento rígido (`clampLotDragOffset`) | `npx tsx verify_phase01.ts` | Offset acotado rígidamente a `[-10, -10]` y `[129, 129]` en grilla 150x150 | ✓ PASS |
| Traslación y remuestreo (`translateLotPolygon`) | `npx tsx verify_phase01.ts` | Coordenadas trasladadas a `(20, 15)` y cota calculada en `102` | ✓ PASS |
| Proyección multinivel (`computeOgucModel`) | `npx tsx verify_phase01.ts` | 3 tiers activos (`continuous`, `main`, `upper_stepped`), 3 sombras, área 1692.42 m² >= 1597.45 m² | ✓ PASS |
| Normalización fecha local (`parseLocalSolarDate`) | `npx tsx verify_phase01.ts` | `2024-01-01` normalizado a las 12:00:00 local sin desfase UTC | ✓ PASS |
| Huso horario dinámico (`getSolarTimezoneOffset`) | `npx tsx verify_phase01.ts` | Verano: -3, Invierno: -4, Magallanes: -3, Londres: 0, Tokio: 9 | ✓ PASS |
| Cálculo solar Heliodón (`getSunPosition`) | `npx tsx verify_phase01.ts` | Santiago mediodía 1 de enero: elevación 64.46°, azimut 72.84° | ✓ PASS |
| Verificación de tipos TypeScript | `npm run lint` (`tsc --noEmit`) | Salida limpia, 0 errores | ✓ PASS |
| Compilación de producción Vite | `npm run build` | Compilado exitosamente en 8.28s, 0 errores | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| `OGUC-01` | 01-01-PLAN.md | Sombra propuesta OGUC proyectada a partir de la unión de todos los niveles activos (`continuous`, `main`, `upper_stepped`) en azimuts 135°, 180° y 225° aterrizados al DEM. | ✓ SATISFIED | `projectMultiTierDirectionalShadowOnTerrain` y `computeOgucModel` en `src/lib/ogucService.ts`. |
| `OGUC-02` | 01-02-PLAN.md | Arrastre bidireccional de lote/volumen en visor 2.5D reflejado inmediatamente en visor 3D y conservado en archivos `.geoarc`. | ✓ SATISFIED | `handleVolumePointerDown` y `handleUp` con `latestDragOffsetRef`, `clampLotDragOffset` y `translateLotPolygon` en `ContourViewer.tsx`, persistiendo en `customLotPts` en `App.tsx` e import/export `.geoarc`. |
| `OGUC-03` | 01-01-PLAN.md | Distanciamiento interior robusto para lotes cóncavos en L o U sin auto-intersecciones de aristas ni deformaciones en extrusión 3D. | ✓ SATISFIED | Pipeline en 4 etapas en `insetPolygonBisector` y guardia `hasMatchingRoofVertices` en `rasantePlanes` (`src/lib/ogucService.ts`). |
| `OGUC-04` | 01-02-PLAN.md | Efemérides solares con huso horario dinámico según fecha/ubicación y parseo de fecha en mediodía local sin desfase UTC. | ✓ SATISFIED | `parseLocalSolarDate` y `getSolarTimezoneOffset` en `src/lib/SunPosition.ts`, conectados a `App.tsx` y `ContourViewer.tsx`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| - | - | Ninguno | - | No se encontraron marcadores de deuda técnica (`TBD`, `FIXME`, `XXX`), `TODO` huérfanos ni stubs en los archivos modificados. |

### Human Verification Required

None required. Todos los comportamientos matemáticos, normativos, de persistencia y de sincronización de estado fueron comprobados de forma determinista mediante pruebas de ejecución automatizadas y verificación de compilación.

### Gaps Summary

No gaps identified. La fase cumplió completamente su objetivo y sus cuatro requerimientos normativos (`OGUC-01`, `OGUC-02`, `OGUC-03`, `OGUC-04`) junto con las cuatro decisiones de arquitectura (`D-01`, `D-02`, `D-03`, `D-04`).

---

_Verified: 2026-10-29T01:36:42.511Z_
_Verifier: the agent (gsd-verifier)_
