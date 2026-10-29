---
phase: 02-interoperabilidad-cad-gis-3d-y-escena-unificada
plan: 02
subsystem: 3d-cad-ui
tags:
  - threejs
  - stl
  - svg
  - cad
  - gis
  - mesh-import
requires:
  - 02-01
provides:
  - unified-three-scene
  - stl-export
  - svg-export
  - local-mesh-importer
  - crs-selector
affects:
  - three-viewer
  - contour-viewer
  - app-sidebar
tech-stack:
  added: []
  patterns:
    - "Unified Three.js scene constructor pattern in exportService.ts"
    - "Binary STL generation via STLExporter from three-stdlib"
    - "Semantic SVG topographic sheet generation with XML metadata comments"
    - "Segmented terrain source toggle with 50MB bound and client-side mesh rasterization"
key-files:
  created: []
  modified:
    - src/lib/exportService.ts
    - src/components/ThreeTerrainViewer.tsx
    - src/components/ContourViewer.tsx
    - src/App.tsx
decisions:
  - "D-03: Consolidate Three.js scene creation in buildThreeSceneFromMeshData ensuring strict (elev - minEv) * zExaggeration normalization and 0.35m slope embedding across ThreeTerrainViewer, GLB, OBJ, and STL."
  - "D-05: Implement segmented toggle in App.tsx Section 1 for local 3D mesh import (.PLY/.FBX) with 50MB safety limit, live processing status, and active mesh technical card."
  - "D-06: Incorporate direct SVG export button in ContourViewer floating HUD and App top nav bar producing clean vector sheets with styled contour lines, labels, and metadata."
  - "D-04: Replace free-text CRS input with structured select dropdown bound to SUPPORTED_CRS (EPSG:32718, EPSG:32719, EPSG:32633, EPSG:4326)."
metrics:
  duration: 18m
  completed_date: "2026-10-29"
status: complete
actuals:
  tokens: 11364
  tasks: 2
  commits: 2
  plan_head_before: 770325b2aa9b4870dc53ee02752b0fa44b16e9b0
  plan_head_after: 8379d61e5119aaf709f6a210c793dd7cef691bcd
---

# Phase 02 Plan 02: Consolidación de Escena 3D e Interoperabilidad CAD/UI Summary

**Unificación canónica de la geometría Three.js entre el visor interactivo y los exportadores (.GLB, .OBJ, .STL) con normalización relativa a `minEv` y empotramiento de 0.35m en edificios, incorporación de zona drag-and-drop para mallas 3D locales (.PLY/.FBX), selector tipado de CRS y exportador de láminas vectoriales SVG con metadatos técnicos.**

---

## What was built

1. **Constructor Canónico de Escenas Three.js (`buildThreeSceneFromMeshData` en `src/lib/exportService.ts`):**
   - Soporta interfaz de opciones `ThreeSceneBuildOptions` con soporte retrocompatible para llamadas numéricas heredadas.
   - Normalización altimétrica estricta a nivel de suelo: `(elev - minEv) * zExaggeration` con elevación mínima en `Y = 0`.
   - Empotramiento paramétrico de `0.35m` en pendiente para edificios de contexto OSM (tanto ways como multipolígonos `relation`).
   - Opción para trazar aristas con `EdgesGeometry` en edificios y materiales configurables con soporte wireframe y colores temáticos.

2. **Exportador Binario STL (`exportToStl` en `src/lib/exportService.ts`):**
   - Consume directamente `buildThreeSceneFromMeshData`, garantizando que la malla sólida `.STL` coincida al 100% con los modelos `.GLB` y `.OBJ`.
   - Utiliza `STLExporter` de `three-stdlib` con `{ binary: true }` y descarga limpia vía `triggerBrowserDownload`.

3. **Refactorización de Visores 3D y 2.5D:**
   - `src/components/ThreeTerrainViewer.tsx`: eliminada la duplicación manual de `PlaneGeometry` y el bucle de extrusión de edificios, delegando la construcción base a `buildThreeSceneFromMeshData`.
   - `src/components/ContourViewer.tsx`: eliminada la función interna desincronizada `buildThreeScene`, delegando `handleExportSTL` a `exportToStl`.

4. **Generador y Exportador de Lámina Topográfica Vectorial SVG (`generateSvgTopographicSheet` y `exportToSvg`):**
   - Construye documentos SVG puros con `viewBox="0 0 w h"` y fondo oscuro técnico `#121212`.
   - Incluye cabecera XML de metadatos en comentarios técnicos (archivo base, CRS, dimensiones métricas `w x h`, grilla, cotas mín/máx, intervalo de curvas maestras e ISO timestamp).
   - Genera grupos clasificados `<g id="urban-context">`, `<g id="contour-lines">`, `<g id="contour-labels">`, y `<g id="lot-boundary">` con clases CSS semánticas para Illustrator o corte láser.
   - Auto-calcula isolíneas D3 si no se suministran explícitamente.

5. **Controles de Interfaz en `src/App.tsx` y `src/components/ContourViewer.tsx`:**
   - **HUD de `ContourViewer.tsx`:** Nuevo botón `SVG` en la barra vertical de herramientas flotante (`w-10`) inmediatamente debajo de `STL`.
   - **Barra de navegación de `App.tsx`:** Botón rápido de descarga `Lámina (.SVG)` activo cuando existe terreno cargado.
   - **Sección 1 de Barra Lateral:** Control segmentado de dos pestañas: `Satelital OSM` y `Malla 3D (.PLY / .FBX)`.
   - **Dropzone de Malla Local:** Soporta arrastrar o seleccionar archivos `.PLY` y `.FBX` con validación estricta de tamaño `<= 50MB`, estado de procesamiento animado, captura de errores con banner informativo y tarjeta técnica de resumen con dimensiones, rango altimétrico y botones para reemplazar o descartar malla.
   - **Selector de CRS Estructurado:** Reemplazado el input de texto libre por un elemento `<select>` con las opciones oficiales `SUPPORTED_CRS` (`EPSG:32718`, `EPSG:32719`, `EPSG:32633`, `EPSG:4326`).
   - **Estado Vacío:** Texto descriptivo actualizado conforme al contrato `02-UI-SPEC.md`.

---

## Verification Evidence

- `npm run lint` (`tsc --noEmit`) finalizó exitosamente con 0 errores de tipos en todo el proyecto.
- `test-three.ts` (`npx tsx`): validó que `buildThreeSceneFromMeshData` normaliza la cota mínima exactamente a `minY = 0` y genera los grupos `Terreno_Topografico` y `Edificios_Contexto`.
- `test-svg.ts` (`npx tsx`): validó que `generateSvgTopographicSheet` inicia con cabecera XML válida, genera el elemento `<svg viewBox="0 0 100 80">`, contiene el grupo `<g id="contour-lines">` e incrusta el CRS `EPSG:32719` en los comentarios de metadatos.
- `npm run build` (`vite build`) finalizó exitosamente en 15.19s empaquetando 2993 módulos en `dist/` sin advertencias críticas.

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Known Stubs

None. No placeholder data or mock values remain in the implemented workflows.

---

## Commits

- `01dae75`: `feat(02-02): unify Three.js scene builder and implement binary STL exporter`
- `8379d61`: `feat(02-02): add local 3D mesh dropzone, structured CRS select, and SVG export`

---

## Self-Check: PASSED

- All key files modified exist and pass static type checks.
- Commits `01dae75` and `8379d61` exist in HEAD history.
- Production build verified with Vite.
