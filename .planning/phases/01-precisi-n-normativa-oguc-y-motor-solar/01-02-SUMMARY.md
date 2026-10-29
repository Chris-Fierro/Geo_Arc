---
phase: 01-precisi-n-normativa-oguc-y-motor-solar
plan: 02
subsystem: solar-and-interaction-engine
tags: [typescript, react, solar-ephemeris, timezone, d3-zoom, drag-and-drop, state-synchronization]

# Dependency graph
requires:
  - 01-01
provides:
  - "Huso horario astronómico y legal dinámico getSolarTimezoneOffset con soporte DST chileno (UTC-3/UTC-4) y Magallanes (UTC-3 permanente) (OGUC-04)"
  - "Normalizador de fecha solar parseLocalSolarDate inmune a transiciones DST y desfases de medianoche UTC (OGUC-04)"
  - "Sincronización bidireccional reactiva del arrastre de lote y volumen en ContourViewer.tsx persistiendo hacia customLotPts en App.tsx (OGUC-02)"
affects:
  - src/lib/SunPosition.ts
  - src/App.tsx
  - src/components/ContourViewer.tsx
  - src/components/ThreeTerrainViewer.tsx

actuals:
  tokens: 7066
  tasks: 2
  commits: 2
plan_head_before: f85160b8edfca5498de6dca0f6d2f875cdf2b196
plan_head_after: a38e1913eac103b5e6c07528cf7e3e56c22b4876

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detección dinámica de huso horario mediante Intl.DateTimeFormat con timeZone America/Santiago y shortOffset, con fallback determinista de invierno/verano"
    - "Cálculo de día del año solar N inmune a saltos DST mediante Date.UTC sobre año, mes y día nominales"
    - "Arrastre interactivo de lote como cuerpo rígido con clampLotDragOffset, desacople de closures con latestDragOffsetRef y commit a customLotPts en pointerup con remuestreo de elevación"

key-files:
  created: []
  modified:
    - src/lib/SunPosition.ts
    - src/App.tsx
    - src/components/ContourViewer.tsx

key-decisions:
  - "D-04: En getSolarTimezoneOffset, para Chile continental (lat entre -56° y -17°, lon entre -76° y -66°), Magallanes (lat <= -49°) mantiene UTC-3 permanente y el resto consulta America/Santiago a las 16:00 UTC (evitando saltos a medianoche), con aproximación Math.round(lon / 15) acotada a [-12, 14] para el resto del mundo"
  - "D-02: En ContourViewer.tsx, desacoplar el estado React dragOffset de latestDragOffsetRef.current durante el arrastre, y volcar los vértices trasladados mediante translateLotPolygon y getGridElevAt hacia setCustomLotPts al soltar el puntero, reseteando dragOffset a { x: 0, y: 0 } para sincronizar instantáneamente con ThreeTerrainViewer.tsx y los archivos .geoarc"

patterns-established:
  - "Normalización obligatoria de fechas solares mediante parseLocalSolarDate(solarDate) a mediodía local (12:00:00) en todos los visores"
  - "Protección del filtro d3.zoom contra arrastres activos de volumen mediante isDraggingVolumeRef.current"

requirements-completed:
  - OGUC-02
  - OGUC-04

coverage:
  - id: D3
    description: "Huso horario dinámico y parseo de fecha en mediodía local en motor solar (OGUC-04, D-04)"
    requirement: OGUC-04
    verification:
      - kind: unit
        ref: "npx tsx verification of parseLocalSolarDate and getSolarTimezoneOffset with Chile/Magallanes/Global cases"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sincronización bidireccional del arrastre de lote/volumen en ContourViewer.tsx hacia customLotPts (OGUC-02, D-02)"
    requirement: OGUC-02
    verification:
      - kind: unit
        ref: "npx tsx verification of translateLotPolygon and clampLotDragOffset wiring in ContourViewer.tsx and npm run build clean compile"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-28
status: complete
---

# Phase 01 Plan 02: Huso Horario Dinámico y Sincronización Bidireccional de Lote Summary

**Huso horario astronómico y legal dinámico (UTC-3 verano / UTC-4 invierno / UTC-3 Magallanes / `lon/15` global), normalización de fecha local en `SunPosition.ts`, y sincronización interactiva bidireccional del arrastre de lote/volumen en `ContourViewer.tsx` hacia `customLotPts` en `App.tsx`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-28T22:18:43Z
- **Completed:** 2026-10-28T22:27:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Implementadas y exportadas `parseLocalSolarDate` y `getSolarTimezoneOffset` en `src/lib/SunPosition.ts`, eliminando el `tzOffset = -4` estático y el desfase de 1 día provocado por medianoche UTC.
- En `getSunPosition`, el cálculo del día del año `N` (`1..366`) utiliza `Date.UTC` sobre los componentes locales para ser inmune a cambios de horario de verano/invierno (DST), y el ángulo del meridiano local se calcula dinámicamente según la ubicación y fecha.
- Conectado `parseLocalSolarDate(solarDate)` en `src/App.tsx` (para `ThreeTerrainViewer` y `ContourViewer`) y en `src/components/ContourViewer.tsx` (`sunPosition` `useMemo`).
- En `src/components/ContourViewer.tsx`, separado `baseLotPtsWithoutOffset` del estado acotado `effectiveLotBasePts` mediante `clampLotDragOffset` importado desde `src/lib/ogucService.ts`, asegurando traslación de cuerpo rígido sin deformaciones en los límites `[0, n-1] x [0, m-1]`.
- Elevado `handleVolumePointerDown` al ámbito del componente `ContourViewer` utilizando `latestDragOffsetRef` para prevenir clausuras obsoletas en los eventos de puntero de `window`. Al finalizar el arrastre (`pointerup` / `pointercancel`), las coordenadas trasladadas se remuestrean en cota de terreno con `getGridElevAt` mediante `translateLotPolygon` y se persisten en `setCustomLotPts`, reseteando el delta de arrastre local a `{ x: 0, y: 0 }`.
- Enlazado el arrastre tanto al polígono de lote como al volumen propuesto en Modo OGUC y Modo Solar, y protegido el filtro de paneo de `d3.zoom` para evitar paneo involuntario durante el arrastre.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implementar parseLocalSolarDate y getSolarTimezoneOffset en SunPosition.ts y conectar fecha local en App.tsx y ContourViewer.tsx (OGUC-04, D-04)** - `3561843` (feat)
2. **Task 2: Sincronizar bidireccionalmente el arrastre de lote/volumen en ContourViewer.tsx hacia customLotPts en App.tsx (OGUC-02, D-02)** - `a38e191` (feat)

## Files Created/Modified
- `src/lib/SunPosition.ts` - Funciones `parseLocalSolarDate` y `getSolarTimezoneOffset`, y actualización de `getSunPosition` con huso dinámico y día del año inmune a DST.
- `src/App.tsx` - Normalización de `solarParams.date` con `parseLocalSolarDate(solarDate)`.
- `src/components/ContourViewer.tsx` - Sincronización de arrastre de lote/volumen con `clampLotDragOffset`, `translateLotPolygon`, `latestDragOffsetRef`, `setCustomLotPts`, y protección de `d3.zoom`.

## Decisions Made
- `D-04`: `getSolarTimezoneOffset` evalúa si las coordenadas caen en Chile continental. Si `lat <= -49` (Magallanes), retorna `-3` fijo. Si no, consulta `Intl.DateTimeFormat` para `America/Santiago` a las 16:00 UTC con fallback determinista de meses invernales (abril-agosto = -4, resto = -3). Fuera de Chile continental, aproxima astronómicamente con `Math.round(lon / 15)` acotado a `[-12, 14]`.
- `D-02`: Al finalizar el arrastre de lote o volumen en `ContourViewer.tsx`, se computan los vértices definitivos mediante `translateLotPolygon` remuestreando la elevación de cada vértice con la grilla DEM (`getGridElevAt`), se resetea `dragOffset` a `{ x: 0, y: 0 }`, y se emite `setCustomLotPts(committedPts)`, asegurando paridad visual inmediata al alternar con `ThreeTerrainViewer.tsx` o exportar a `.geoarc`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Con la finalización de los planes `01-01` y `01-02`, la **Fase 01 (Precisión Normativa OGUC y Motor Solar)** ha completado el 100% de sus requerimientos (`OGUC-01`, `OGUC-02`, `OGUC-03`, `OGUC-04`).
- El proyecto se encuentra listo para avanzar a la **Fase 02 (Interoperabilidad CAD / GIS / 3D y Escena Unificada)**.

## Self-Check: PASSED
- Found `src/lib/SunPosition.ts`
- Found `src/App.tsx`
- Found `src/components/ContourViewer.tsx`
- Found `.planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-02-SUMMARY.md`
- Verified task commits `3561843` and `a38e191` are ancestors of `HEAD`

---
*Phase: 01-precisi-n-normativa-oguc-y-motor-solar*
*Completed: 2026-10-28*
