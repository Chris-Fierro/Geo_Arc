---
last_mapped_commit: bc98eb591951bb810fb9d4da1e8e5ef5b526257a
last_mapped_at: 2026-10-28
---
<!-- refreshed: 2026-10-28 -->
# Coding Conventions

**Analysis Date:** 2026-10-28

## Naming Patterns

**Files:**
- Use `PascalCase.tsx` for React UI and viewer components in `src/components/` and `src/App.tsx`:
  - `src/App.tsx`
  - `src/components/ContourViewer.tsx`
  - `src/components/OsmImporter.tsx`
  - `src/components/ThreeTerrainViewer.tsx`
- Use `camelCase.ts` with a `Service` or `Processor` suffix for domain logic and data services in `src/lib/`:
  - `src/lib/exportService.ts`
  - `src/lib/ogucService.ts`
  - `src/lib/satelliteService.ts`
  - `src/lib/meshProcessor.ts`
  - `src/lib/templates.ts`
  - Exception: `src/lib/SunPosition.ts` uses `PascalCase.ts` matching its primary exported interface `SunPosition`. New library modules in `src/lib/` should prefer `camelCase.ts`.

**Functions:**
- Use `camelCase` with descriptive verb prefixes for all utility, calculation, and service functions:
  - Calculation / geometry: `computeOgucModel`, `computePolygonAreaM2`, `calculatePolygonMetrics`, `insetPolygonBisector`, `convexHull3D`, `clipSegmentToBBox`, `clipWayToBBox` in `src/lib/ogucService.ts` and `src/components/OsmImporter.tsx`
  - Data fetching / normalization: `fetchOsmLayersForBBox`, `normalizeOsmElementsToGeom` in `src/lib/ogucService.ts`; `fetchSatelliteOrthophoto` in `src/lib/satelliteService.ts`
  - Scene & export builders: `buildThreeSceneFromMeshData`, `exportToObjZip`, `exportToGlb`, `triggerBrowserDownload` in `src/lib/exportService.ts`
  - Coordinate converters: `lon2tile`, `lat2tile`, `tile2lon`, `tile2lat` in `src/lib/satelliteService.ts`; `gridToWorld`, `getGridElevAt` in `src/components/ThreeTerrainViewer.tsx`; `screenToGrid`, `projectPoint`, `getMatrix` in `src/components/ContourViewer.tsx`
- Use `handle*` prefix for UI event callbacks in React components (`handleOsmDataFetched`, `handleExportGeoarc`, `handleImportGeoarc`, `handleExportObjZip` in `src/App.tsx`; `handleSearch`, `handleRectClick`, `handleIrregularClick` in `src/components/OsmImporter.tsx`).
- Use `PascalCase` for React components and internal sub-components (`InfoTooltip` in `src/App.tsx`; `MapController`, `MapResizer`, `SidebarMapSync`, `MapDrawController` in `src/components/OsmImporter.tsx`).

**Variables:**
- Use `camelCase` for local variables, state hooks, and refs (`locationLat`, `locationLon`, `zExaggeration`, `ogucRegionGroup` in `src/App.tsx`).
- Prefix boolean state variables and flags with `is*`, `show*`, `has*`, `use*`, or `apply*`:
  - `isProcessing`, `isDone`, `isLightMode`, `isSidebarOpen`, `isDrawingLot`, `isExporting` in `src/App.tsx`
  - `showContourLabels`, `showOgucShadows`, `showSunPath`, `showSolarShadows`, `showContextBuildings` in `src/App.tsx`
  - `useTexture`, `showWireframe`, `showHeliodon3D` in `src/components/ThreeTerrainViewer.tsx`
- Append unit suffixes (`M`, `M2`, `Deg`, `Rad`, `Px`) to physical and geometric variables to prevent unit confusion between grid indices, degrees, radians, and real-world meters:
  - `widthM`, `heightM`, `areaM2`, `perimeterM`, `offsetMeters`, `angleDeg`, `azimuthDeg`, `latRad`, `elevationRad` in `src/lib/ogucService.ts`, `src/lib/SunPosition.ts`, and `src/lib/exportService.ts`.
- Use `UPPER_SNAKE_CASE` for local algorithm constants (`BLUR_PASSES` in `src/App.tsx`).

**Types:**
- Use `PascalCase` for all `interface` and `type` definitions.
- Suffix component prop interfaces with `Props` (`ThreeTerrainViewerProps` in `src/components/ThreeTerrainViewer.tsx`, `ContourViewerProps` in `src/components/ContourViewer.tsx`, `OsmImporterProps` in `src/components/OsmImporter.tsx`).
- Use `interface` for structured data objects and models (`MeshData` in `src/lib/meshProcessor.ts`; `OgucParams`, `Point3D`, `VolumeTier`, `RasantePlane`, `OgucShadowComparison`, `OgucComputedModel` in `src/lib/ogucService.ts`; `Export3DOptions` in `src/lib/exportService.ts`; `SatelliteResult`, `BoundingBox` in `src/lib/satelliteService.ts`).
- Use `type` for string literal unions and mode selectors (`AnalysisMode = 'topographic' | 'oguc' | 'solar'` in `src/App.tsx`; `SelectionMode = 'regular' | 'irregular' | 'point'` in `src/components/OsmImporter.tsx`).

## Code Style

**Formatting:**
- No dedicated `.prettierrc` or Biome config file is present; formatting follows standard 2-space indentation across TypeScript and TSX files.
- Single quotes (`'`) are used for TypeScript strings and imports (`import * as THREE from 'three';`), with double quotes (`"`) used for JSX attributes (`className="..."`).
- Semicolons are used consistently at the end of statements.

**Linting & Type Checking:**
- Linting is performed via the TypeScript compiler (`npm run lint` executes `tsc --noEmit` as defined in `package.json`).
- `tsconfig.json` targets `ES2022` with `"moduleResolution": "bundler"`, `"isolatedModules": true`, and `"jsx": "react-jsx"`.
- Strict null/undefined checks are not globally enforced in `tsconfig.json`, so functions explicitly guard against invalid inputs at runtime (`if (!pts || pts.length < 3) return null;`, `Number.isFinite(v)`, `Math.max(0, ...)`).

**Styling & Theming:**
- Use Tailwind CSS v4 (`@import "tailwindcss";` in `src/index.css`) paired with CSS custom properties for theming.
- Always use semantic theme tokens defined in `src/index.css` instead of hardcoded neutral colors in UI panels:
  - Backgrounds: `bg-bg-base`, `bg-bg-surface`, `bg-bg-elevated`, `bg-bg-input`
  - Text: `text-text-main`, `text-text-muted`, `text-text-faded`, `text-text-subtle`
  - Borders: `border-border-main`, `border-border-strong`, `border-border-faded`
  - Brand Accent: `text-accent`, `bg-accent`, `border-accent`, `hover:bg-accent-hover` (`#DA291C` institutional red)
- Theme switching is controlled via `document.documentElement.setAttribute('data-theme', isLightMode ? 'light' : 'dark')` in `src/App.tsx`.

## Import Organization

**Order:**
1. Core framework and animation/icon packages (`react`, `react-dom`, `motion/react`, `lucide-react`)
2. Third-party visualization and geometry libraries (`three`, `three-stdlib`, `d3`, `leaflet`, `react-leaflet`, `fflate`, `fast-png`)
3. Local components (`./components/ContourViewer`, `./components/ThreeTerrainViewer`, `./components/OsmImporter`)
4. Local domain services and types (`./lib/meshProcessor`, `./lib/ogucService`, `./lib/exportService`, `./lib/satelliteService`, `./lib/SunPosition`)

Example from `src/components/ThreeTerrainViewer.tsx`:
```typescript
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import type { MeshData } from '../lib/meshProcessor';
import type { AnalysisMode } from '../App';
import { getSunPosition } from '../lib/SunPosition';
import {
  OgucParams,
  computeOgucModel,
  computePolygonAreaM2,
  clipWayToBBox,
} from '../lib/ogucService';
import { Sun, Layers, Box, Building2, Route, Crosshair, Compass, Ruler } from 'lucide-react';
```

**Path Aliases:**
- `@/*` is mapped to `./*` (project root) in `tsconfig.json` and `vite.config.ts`.
- Despite the alias configuration, existing files in `src/` exclusively use relative imports (`./lib/...`, `../lib/...`, `./components/...`). Prefer relative imports within `src/` for consistency, and use `import type` when importing only TypeScript interfaces under `isolatedModules`.

## Error Handling

**Patterns:**
- **Multi-tier network fallbacks for external GIS APIs:** Never rely on a single external GIS endpoint when alternatives exist. Wrap each tier in a `try / catch` with an `AbortController` timeout and fall through to secondary providers:
  - In `src/lib/ogucService.ts` (`fetchOsmLayersForBBox`): Tier 1 queries official OSM API v0.6 (`map.json`, 12s timeout) → Tier 2 queries the local Vite middleware `/api/overpass` → Tier 3 iterates over direct Overpass mirrors (`overpass-api.de`, `lz4.overpass-api.de`, `z.overpass-api.de`, 25s timeout).
  - In `src/lib/satelliteService.ts` (`fetchSatelliteOrthophoto`): Primary tile fetch uses Esri World Imagery with per-tile fallback to Google Satellite (`mt1.google.com`), and `createImageBitmap` falls back to `HTMLImageElement` + `URL.createObjectURL`.
  - In `vite.config.ts` (`overpassProxyPlugin`): Uses `Promise.any(endpoints.map(...))` across 4 Overpass instances.
- **Graceful geometry degradation:** When processing hundreds of OSM buildings or polygon offsets, wrap individual polygon extrusions in `try { ... } catch (_) {}` (`src/lib/exportService.ts:142-220`, `src/components/ThreeTerrainViewer.tsx:418-506`) so a single malformed OSM way does not abort rendering the entire urban context.
- **Degenerate polygon / math guards:** Return `null` or a marked `collapsed: true` state rather than throwing when geometric operations become invalid (e.g., `insetPolygonBisector` and `computeOgucModel` in `src/lib/ogucService.ts` when setbacks exceed half the lot width).
- **User-facing operational errors:** In top-level UI actions (`src/App.tsx`, `src/components/OsmImporter.tsx`), log the exception with `console.error(err)` and notify the user with a Spanish message via `alert(...)`, always resetting loading states (`setIsExporting(false)`, `setIsExtracting(false)`) in a `finally` block.

```typescript
// Pattern from src/App.tsx:451-469
const handleExportObjZip = async () => {
  if (!meshData) return;
  setIsExporting(true);
  try {
    await exportToObjZip({
      meshData,
      satelliteDataUrl: showSatelliteLayer ? meshData.satelliteTexture : undefined,
      worldFile: meshData.satelliteWorldFile,
      zExaggeration,
      fileName: fileName.replace(/\.[^/.]+$/, ''),
      includeBuildings: showContextBuildings
    });
  } catch (err) {
    console.error(err);
    alert('Error al exportar archivo OBJ.');
  } finally {
    setIsExporting(false);
  }
};
```

## Logging

**Framework:** Native browser `console` (`console.log`, `console.warn`, `console.error`).

**Patterns:**
- Prefix diagnostic logs from GIS/satellite pipelines with bracketed module tags in Spanish:
  - `[GeoArc OSM]` in `src/lib/ogucService.ts:863` and `src/components/OsmImporter.tsx:729`
  - `[GeoArc Satelital]` in `src/components/OsmImporter.tsx:742`
- Use `console.warn` for recoverable fallback events (e.g., tile load failure, primary API timeout, texture load warning).
- Use `console.error` before `alert(...)` when an interactive user action (search, extraction, file export) fails completely.

## Comments

**When to Comment:**
- Write numbered step-by-step comments for mathematical, astronomical, and geometric pipelines (e.g., `// 1. Día del año (1–365)` through `// 10. Acimut solar` in `src/lib/SunPosition.ts`; `// 1. Terrain Mesh` and `// 2. Extruded Context Buildings` in `src/lib/exportService.ts`).
- Document coordinate system conventions and axis orientations inline whenever converting between geographic (`lat`/`lon`), 2D grid (`cols`/`rows`), SVG 2.5D matrix (`X`/`Y`/`zOffset`), and Three.js world space (`+X` East, `+Y` Up, `-Z` North).
- Reference specific Chilean urban regulatory articles where applicable (`// Art. 2.6.3`, `// Art. 2.6.12: Extra setback above 10.5m` in `src/lib/ogucService.ts`).
- Comments and UI strings are written in **Spanish** (with occasional English technical terms for Three.js/WebGL internals).

**JSDoc/TSDoc:**
- Add concise JSDoc block comments (`/** ... */`) above exported service functions in `src/lib/exportService.ts`, `src/lib/ogucService.ts`, `src/lib/satelliteService.ts`, and complex coordinate helpers like `screenToGrid` in `src/components/ContourViewer.tsx`.

## Function Design

**Size:**
- Pure mathematical and geometric helper functions in `src/lib/` are kept focused (20–90 lines each, such as `getSunPosition`, `clipSegmentToBBox`, `clipWayToBBox`, `convexHull3D`, `computePolygonAreaM2`).
- React viewer components (`src/components/ContourViewer.tsx` at 2,229 lines, `src/components/ThreeTerrainViewer.tsx` at 1,376 lines, `src/components/OsmImporter.tsx` at 1,276 lines, `src/App.tsx` at 1,114 lines) are large, self-contained modules. When adding new domain calculations, extract them into `src/lib/` (like `src/lib/ogucService.ts` or `src/lib/exportService.ts`) rather than growing component files further.

**Parameters:**
- Use an options object interface when a function accepts more than 4–5 parameters or optional configuration:
  - `computeOgucModel(params: { rawLotPts, ogucParams, meshData, n, m, getGridElevAt })` in `src/lib/ogucService.ts`
  - `exportToObjZip(options: Export3DOptions)` and `exportToGlb(options: Export3DOptions)` in `src/lib/exportService.ts`
- Provide sensible default parameter values (`zExaggeration: number = 1.0`, `gridSize = 150`, `maxStepMeters: number = 15`).

**Return Values:**
- Return strongly typed result interfaces (`OgucComputedModel | null`, `Promise<SatelliteResult>`, `Promise<MeshData>`, `SunPosition`).
- Return `null` for invalid or insufficient geometric inputs (e.g., fewer than 3 polygon vertices) and check for `null` at the call site.

## Module Design

**Exports:**
- **Components (`src/App.tsx`, `src/components/*.tsx`):** Use `export default function ComponentName(...)` for the primary React component, and named exports (`export type`, `export interface`, `export function`) for shared types or pure helpers (`AnalysisMode` in `src/App.tsx`, `calculatePolygonMetrics` in `src/components/OsmImporter.tsx`).
- **Library Services (`src/lib/*.ts`):** Use named exports exclusively (`export function`, `export interface`, `export const`) — never default exports.

**Barrel Files:**
- Barrel files (`index.ts`) are not used. Import directly from the specific module path (e.g., `import { computeOgucModel } from '../lib/ogucService'`).

---

*Convention analysis: 2026-10-28*
