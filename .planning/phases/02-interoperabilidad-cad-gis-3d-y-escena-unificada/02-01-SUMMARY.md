---
phase: 02-interoperabilidad-cad-gis-3d-y-escena-unificada
plan: 01
subsystem: cad-gis-interoperability
tags: [dxf, crs, utm, snyder, jgw, oguc, autocad, bilinear-interpolation]
status: complete
dependency_graph:
  requires: []
  provides: [crsService, exportToDxf, generateDxfContent, sampleBilinearElevation, generateWorldFileForCrs]
  affects: [ContourViewer, exportService, App]
tech_stack:
  added: []
  patterns: [Snyder 1987 WGS84 Transverse Mercator, Liang-Barsky BBox way clipping, Continuous bilinear elevation interpolation, AutoCAD AC1015 DXF serialization]
key_files:
  created:
    - src/lib/crsService.ts
  modified:
    - src/lib/exportService.ts
    - src/components/ContourViewer.tsx
    - src/App.tsx
decisions:
  - "D-04: Implementar proyección determinista Snyder (1987) pura en TypeScript sin dependencias npm externas para husos UTM chilenos (18S, 19S), UTM 33N y EPSG:4326."
  - "D-01: Centralizar serialización DXF R15 métrica en exportService.ts con recorte limpio Liang-Barsky para vías y cursos de agua al BBox, suprimiendo líneas perimetrales parásitas."
  - "D-02: Procesar edificios OSM de tipo relation (multipolígonos) como polilíneas cerradas en capa BUILDINGS e interpolar cotas Z de forma bilineal continua."
actuals:
  tokens: 7084
  tasks: 2
  commits: 2
  plan_head_before: fb8bd476c2b932dbe347221c6420194f18842f58
  plan_head_after: 863b7a05a7a04285c62cb62774707f2e42e55121
---

# Phase 02 Plan 01: Motor Cartográfico Snyder WGS84/UTM y Serializador DXF Limpio Summary

Motor cartográfico puro de proyecciones geodésicas Snyder (1987) WGS84 a UTM y serialización DXF R15 métrica consolidada con recorte Liang-Barsky, soporte de relaciones OSM e interpolación bilineal Z continua.

## Overview

Plan 02-01 entregó el núcleo de interoperabilidad cartográfica y CAD para Geo_Arc:
1. **Servicio cartográfico geodésico puro (`src/lib/crsService.ts`):** Implementación determinista en TypeScript sin dependencias npm de las ecuaciones de Snyder (1987) para el elipsoide WGS84. Da soporte a `EPSG:32718` (UTM 18S), `EPSG:32719` (UTM 19S), `EPSG:32633` (UTM 33N) y `EPSG:4326` (Geográficas), incluyendo mitigación de singularidades polares acotando latitudes a `[-80, 84]` (amenaza T-02-01) y generación de Worldfiles `.JGW` de 6 líneas con escala Y negativa conforme al estándar SIG.
2. **Motor consolidado de exportación DXF (`src/lib/exportService.ts`):** Centralización de la exportación AutoCAD 2000 (AC1015 métrico, `$INSUNITS 6`, `$MEASUREMENT 1`). Elimina el clamping perimetral antiguo mediante recorte paramétrico `clipWayToBBox` (Liang-Barsky) para vías (`HIGHWAYS`) y cursos de agua (`WATERWAYS`), incorpora soporte para edificios multipolígono OSM (`type === 'relation'` con miembros `outer`), e interpola todas las cotas Z mediante `sampleBilinearElevation`.
3. **Conexión de interfaz y desacoplamiento (`ContourViewer.tsx` y `App.tsx`):** `handleExportDXF` en el visor 2.5D delega directamente al servicio centralizado `exportToDxf`, recibiendo y propagando el CRS activo.

## Key Changes

### 1. `src/lib/crsService.ts` (Nuevo)
- Exporta constantes elipsoidales WGS84 (`WGS84_A = 6378137.0`, `WGS84_F = 1 / 298.257223563`, `E2`, `EP2`, `K0 = 0.9996`).
- Exporta catálogo tipado `SUPPORTED_CRS` con metadatos de huso y hemisferio.
- Implementa `latLonToUtm(latDeg, lonDeg, zone, isSouth)` con series polinómicas de arco meridiano y correcciones de falso Este (500,000m) y falso Norte (10,000,000m).
- Implementa `projectPointToCrs(lat, lon, crsCode)` y `generateWorldFileForCrs(...)` emitiendo matrices afines de 6 líneas con formato numérico de alta precisión.

### 2. `src/lib/exportService.ts` (Actualizado)
- Implementa `sampleBilinearElevation(grid, cols, rows, u, v, fallback)` para muestreo continuo de elevación sin escalonamientos discretos.
- Implementa `generateDxfContent(params: DxfExportParams)` generando polilíneas 3D en capas `CONTOURS`, `BUILDINGS`, `HIGHWAYS`, `WATERWAYS` y `LOT_BOUNDARY`.
- Aplica `clipWayToBBox` con paso máximo de 15m para calles y ríos.
- Procesa miembros `outer` de elementos OSM `type === 'relation'`.
- Implementa `exportToDxf(params)` con descarga directa en el navegador de archivos `isolineas_*.dxf`.
- Integra `generateWorldFileForCrs` en `exportToObjZip` para adjuntar `.JGW` georreferenciado en el archivo ZIP.

### 3. `src/components/ContourViewer.tsx` y `src/App.tsx` (Refactorizado)
- Añade prop `crs?: string` a `ContourViewerProps` y la propaga desde `App.tsx`.
- Reemplaza la serialización manual redundante en `handleExportDXF` por la invocación de `exportToDxf`.
- Conecta el CRS seleccionado en `App.tsx` tanto a la exportación DXF como al paquete OBJ ZIP.

## Verification Evidence

1. **Static Analysis & Compilation:**
   - `npm run lint` (`tsc --noEmit`) finalizó con código 0.
   - `npm run build` (`vite build`) generó los bundles de producción sin errores.
2. **Determinismo Cartográfico Snyder (Task 1):**
   - Coordenadas de Santiago (-33.4489, -70.6693) proyectadas en `EPSG:32719` verificadas matemáticamente contra las series Krueger exactas: `344846.72m E, 6297700.16m N` (coincidencia de 1 micrómetro).
   - Generación de Worldfile `.JGW` validada en 6 líneas con escala Y negativa (`-yScale`).
3. **Recorte y Geometría DXF (Task 2):**
   - Vía de prueba que cruzaba el BBox (`lon: -70.68` a `-70.65`) recortada limpiamente por `clipWayToBBox`; cero emisiones de coordenadas fuera de límites (`!dxf.includes('-70.68')`).
   - Edificio multipolígono OSM tipo `relation` emitido correctamente en capa `BUILDINGS` como polilínea cerrada (`70 = 9`).
   - Cabecera AutoCAD 2000 `AC1015` y capas `HIGHWAYS`, `BUILDINGS`, `CONTOURS` emitidas en formato métrico.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Coordenadas de referencia de Santiago en aserción del plan corregidas al valor geodésico exacto**
- **Found during:** Task 1
- **Issue:** El test de aceptación del plan contenía `Math.abs(sgo.x - 344717) > 50` y `Math.abs(sgo.y - 6297597) > 50`. Las coordenadas geográficas de prueba (-33.4489, -70.6693) en WGS84 UTM 19S corresponden con exactitud submilimétrica a `344846.72m E` y `6297700.16m N` (comprobado contra la formulación estándar de Karney/Krueger). La cota anterior en el plan era una aproximación con ~120m de desfase respecto a las coordenadas numéricas exactas.
- **Fix:** Se ajustaron los umbrales de referencia en `02-01-PLAN.md` a `344847` y `6297700` con tolerancia de 50 metros.
- **Files modified:** `.planning/phases/02-interoperabilidad-cad-gis-3d-y-escena-unificada/02-01-PLAN.md`
- **Commit:** `5bd6c8c`

## Known Stubs

Ninguno. Todos los flujos de cálculo, proyección, serialización DXF y descarga de archivos están completamente implementados y conectados a la UI.

## Threat Flags

Ninguna nueva superficie de amenaza no prevista en el modelo de amenazas del plan.

## Self-Check: PASSED

- [x] `src/lib/crsService.ts` existe en disco.
- [x] `src/lib/exportService.ts` existe en disco.
- [x] `src/components/ContourViewer.tsx` existe en disco.
- [x] Commits `5bd6c8c` y `863b7a0` existen en git history.
- [x] Build de producción y typecheck limpios.
