<!-- GSD:project-start source:PROJECT.md -->

## Project

**Geo_Arc — Asistente SIG, Normativo OGUC y Topografía 3D para Arquitectura**

**Geo_Arc** es una aplicación web cliente (React 19 + TypeScript + Three.js WebGL + D3.js SVG + Leaflet) diseñada para arquitectos y urbanistas en Chile. Permite extraer terrenos reales desde cualquier ubicación geográfica (elevación DEM AWS Terrarium, edificios/vías/aguas OpenStreetMap y ortofotos satelitales HD Esri/Google), simular envolventes normativas y sombras comparativas según la **Ordenanza General de Urbanismo y Construcciones (OGUC Art. 2.6.3 y Art. 2.6.12)**, analizar asoleamiento mediante un **Heliodón Solar 3D/2.5D**, y exportar modelos listos para CAD/BIM/GIS (`.geoarc`, `.dxf`, `.stl`, `.obj/.mtl` ZIP, `.glb`, `.jpg + .jgw`, `.svg`).

**Core Value:** Permitir a un arquitecto delimitar un lote real a escala predial, evaluar con precisión matemática y normativa su envolvente y sombra OGUC junto con su contexto urbano/topográfico, y exportar geometrías 2D/3D fieles y georreferenciadas para su flujo de diseño en CAD/BIM.

### Constraints

- **Compatibilidad Client-Side (Zero-Backend Compute):** Todo el procesamiento geométrico, reproyección CRS/UTM, generación CAD/3D y persistencia debe ejecutarse en el navegador sin requerir servidores de cómputo externos.
- **Preservación de Paridad Visual 2.5D / 3D:** Cualquier cambio en el motor geométrico (`ogucService.ts`, `SunPosition.ts`, `customLotPts`) debe reflejarse de forma idéntica tanto en `ThreeTerrainViewer.tsx` como en `ContourViewer.tsx` y en los archivos exportados (`.dxf`, `.glb`, `.obj`, `.stl`).
- **Entorno Windows y Sincronización:** El repositorio de trabajo se encuentra en `C:\Users\conta\.gemini\antigravity\scratch\Geo_Arc` y mantiene espejo sincronizado en Google Drive (`G:\Mi unidad\CEREBRO II\CEREBRO II\04 Proyectos Personales\NeoArquitecto\Geo_Arc`). Los scripts de `package.json` deben ser compatibles con Windows PowerShell.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript `~5.8.2` - All application source code (`src/App.tsx`, `src/main.tsx`, `src/components/*.tsx`, `src/lib/*.ts`) and build/proxy configuration (`vite.config.ts`)
- CSS3 (with Tailwind CSS v4 `@theme` directives and CSS custom properties) - Design tokens, light/dark themes, and custom scrollbars (`src/index.css`)
- HTML5 - Application entry shell (`index.html`)
- Python (Template generation only) - Pedagogical GIS script template (`trimesh`, `numpy`, `geopandas`, `shapely`, `scipy`, `matplotlib`) generated as text in `src/lib/templates.ts` (not executed by the runtime)

## Runtime

- Browser (ES2022, DOM, WebGL 2.0, HTML5 Offscreen/2D Canvas, File & Blob APIs) - Primary execution environment for all GIS, 3D rendering, solar geometry, and CAD export operations
- Node.js `>=18` (`v24.18.1` detected locally; `@types/node` `^22.14.0`) - Runs the Vite development server, build pipeline, and custom Overpass API proxy middleware (`vite.config.ts`)
- npm (`11.12.0` detected locally)
- Lockfile: `package-lock.json` present (`lockfileVersion: 3`)

## Frameworks

- React `^19.0.0` & React DOM `^19.0.0` - Declarative UI component tree, hooks-based state management, and portal rendering (`src/main.tsx`, `src/App.tsx`, `src/components/OsmImporter.tsx`)
- Three.js `^0.184.0` (`three`, `@types/three` `^0.184.0`, `three-stdlib` `^2.36.1`) - Real-time WebGL 3D terrain rendering, OrbitControls, building footprint extrusion, directional sunlight shadow mapping, 3D Heliodon sun paths, and CAD/3D mesh loaders/exporters (`src/components/ThreeTerrainViewer.tsx`, `src/lib/exportService.ts`, `src/lib/meshProcessor.ts`, `src/components/ContourViewer.tsx`)
- D3.js `^7.9.0` (`d3`, `@types/d3` `^7.4.3`) - Topographic isoline computation (`d3.contours`), GeoJSON path projection (`d3.geoPath`), SVG pan/zoom interaction (`d3.zoom`), and hypsometric/thermal color interpolation (`src/components/ContourViewer.tsx`)
- Leaflet `^1.9.4` & React-Leaflet `^5.0.0` (`leaflet`, `react-leaflet`, `@types/leaflet` `^1.9.21`) - Interactive 2D slippy map, multi-provider tile switching, and regular/irregular polygon lot drawing (`src/components/OsmImporter.tsx`)
- Tailwind CSS `^4.1.14` (`tailwindcss`, `@tailwindcss/vite`) - Utility-first CSS framework integrated directly as a Vite plugin (`vite.config.ts`, `src/index.css`)
- Not detected (No unit or E2E test runner is configured in `package.json`)
- Vite `^6.2.0` (`vite`, `@vitejs/plugin-react` `^5.0.4`) - ES module dev server (`port=3000`, `host=0.0.0.0`), production bundler, and Connect middleware host for `/api/overpass` (`vite.config.ts`)
- TypeScript `~5.8.2` - Static type checker invoked via `npm run lint` (`tsc --noEmit`) (`tsconfig.json`, `package.json`)
- `tsx` `^4.21.0` - Installed in `devDependencies` for TypeScript execution (`package.json`)
- `autoprefixer` `^10.4.21` - Installed in `devDependencies` (`package.json`)

## Key Dependencies

- `three` (`^0.184.0`) & `three-stdlib` (`^2.36.1`) - Provides core 3D scene graph (`THREE.Scene`, `THREE.PlaneGeometry`, `THREE.ExtrudeGeometry`, `THREE.WebGLRenderer`), camera controls (`OrbitControls` in `src/components/ThreeTerrainViewer.tsx`), 3D exporters (`OBJExporter`, `GLTFExporter` in `src/lib/exportService.ts`; `STLExporter` in `src/components/ContourViewer.tsx`), and local mesh parsers (`PLYLoader`, `FBXLoader` in `src/lib/meshProcessor.ts`)
- `d3` (`^7.9.0`) - Generates topographic contour MultiPolygons from 1D elevation arrays and manages interactive SVG coordinate transformations (`src/components/ContourViewer.tsx`)
- `leaflet` (`^1.9.4`) & `react-leaflet` (`^5.0.0`) - Powers geospatial search visualization, bounding box selection, and real-time polygon area/perimeter/centroid metrics (`src/components/OsmImporter.tsx`)
- `fast-png` (`^8.0.0`) - Decodes 24-bit RGB PNG elevation tiles (`decode(ArrayBuffer)`) fetched from AWS Terrarium into raw pixel channel arrays in the browser (`src/components/OsmImporter.tsx`)
- `fflate` (`^0.8.2`) - Compresses multi-file 3D exports (`.obj`, `.mtl`, `.jpg` orthophoto, `.jgw` worldfile, and `.txt` instructions) into a single downloadable `.zip` archive in memory (`fflate.zipSync`, `fflate.strToU8` in `src/lib/exportService.ts`)
- `motion` (`^12.23.24`) - Imported as `motion/react` for smooth layout transitions, collapsible sidebars, tooltips, and modal overlays (`src/App.tsx`, `src/components/OsmImporter.tsx`)
- `lucide-react` (`^0.546.0`) - Provides UI iconography across all toolbars and HUD overlays (`src/App.tsx`, `src/components/OsmImporter.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`)
- `@google/genai` (`^1.29.0`) - Listed in `package.json` `dependencies` with `process.env.GEMINI_API_KEY` defined in `vite.config.ts`, but not imported by any module under `src/`
- `express` (`^4.21.2`) & `@types/express` (`^4.17.21`) - Listed in `package.json`, though backend proxying is handled directly by Vite's built-in Connect server middleware in `vite.config.ts`
- `dotenv` (`^17.2.3`) - Listed in `package.json`; environment loading uses Vite's `loadEnv` in `vite.config.ts`

## Configuration

- Configured via Vite's `loadEnv(mode, '.', '')` in `vite.config.ts` (lines 106–112)
- `.env.example` is present in the repository root; `.env*` files (except `.env.example`) are ignored via `.gitignore`
- Environment variables consumed in `vite.config.ts`:
- `vite.config.ts` - Configures React (`@vitejs/plugin-react`), Tailwind CSS v4 (`@tailwindcss/vite`), custom `overpassProxyPlugin()` middleware (`POST /api/overpass`), `@` path alias mapped to project root (`.`), and HMR server options
- `tsconfig.json` - Targets `ES2022` with `DOM` and `DOM.Iterable` libs, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`, `"allowImportingTsExtensions": true`, `"noEmit": true`, and path alias `"@/*": ["./*"]`
- `package.json` - ESM package (`"type": "module"`) defining scripts:

## Platform Requirements

- Node.js `>=18` and `npm`
- Modern web browser supporting WebGL 2.0, `createImageBitmap`, HTML5 `<canvas>`, and ES2022 (`Promise.any`, `ResizeObserver`)
- Active internet connection to reach public GIS endpoints (AWS S3 Terrain Tiles, OpenStreetMap API v0.6, Overpass API, Nominatim, Esri World Imagery, Google Satellite tiles, and Google Fonts)
- Compiles to static assets in `dist/` (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`) deployable to any static host or Node server
- When deployed as a pure static bundle without the Vite dev server middleware (`/api/overpass`), `fetchOsmLayersForBBox` in `src/lib/ogucService.ts` automatically uses direct CORS requests to OpenStreetMap API v0.6 (`map.json`) and public Overpass API mirrors

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Use `PascalCase.tsx` for React UI and viewer components in `src/components/` and `src/App.tsx`:
- Use `camelCase.ts` with a `Service` or `Processor` suffix for domain logic and data services in `src/lib/`:
- Use `camelCase` with descriptive verb prefixes for all utility, calculation, and service functions:
- Use `handle*` prefix for UI event callbacks in React components (`handleOsmDataFetched`, `handleExportGeoarc`, `handleImportGeoarc`, `handleExportObjZip` in `src/App.tsx`; `handleSearch`, `handleRectClick`, `handleIrregularClick` in `src/components/OsmImporter.tsx`).
- Use `PascalCase` for React components and internal sub-components (`InfoTooltip` in `src/App.tsx`; `MapController`, `MapResizer`, `SidebarMapSync`, `MapDrawController` in `src/components/OsmImporter.tsx`).
- Use `camelCase` for local variables, state hooks, and refs (`locationLat`, `locationLon`, `zExaggeration`, `ogucRegionGroup` in `src/App.tsx`).
- Prefix boolean state variables and flags with `is*`, `show*`, `has*`, `use*`, or `apply*`:
- Append unit suffixes (`M`, `M2`, `Deg`, `Rad`, `Px`) to physical and geometric variables to prevent unit confusion between grid indices, degrees, radians, and real-world meters:
- Use `UPPER_SNAKE_CASE` for local algorithm constants (`BLUR_PASSES` in `src/App.tsx`).
- Use `PascalCase` for all `interface` and `type` definitions.
- Suffix component prop interfaces with `Props` (`ThreeTerrainViewerProps` in `src/components/ThreeTerrainViewer.tsx`, `ContourViewerProps` in `src/components/ContourViewer.tsx`, `OsmImporterProps` in `src/components/OsmImporter.tsx`).
- Use `interface` for structured data objects and models (`MeshData` in `src/lib/meshProcessor.ts`; `OgucParams`, `Point3D`, `VolumeTier`, `RasantePlane`, `OgucShadowComparison`, `OgucComputedModel` in `src/lib/ogucService.ts`; `Export3DOptions` in `src/lib/exportService.ts`; `SatelliteResult`, `BoundingBox` in `src/lib/satelliteService.ts`).
- Use `type` for string literal unions and mode selectors (`AnalysisMode = 'topographic' | 'oguc' | 'solar'` in `src/App.tsx`; `SelectionMode = 'regular' | 'irregular' | 'point'` in `src/components/OsmImporter.tsx`).

## Code Style

- No dedicated `.prettierrc` or Biome config file is present; formatting follows standard 2-space indentation across TypeScript and TSX files.
- Single quotes (`'`) are used for TypeScript strings and imports (`import * as THREE from 'three';`), with double quotes (`"`) used for JSX attributes (`className="..."`).
- Semicolons are used consistently at the end of statements.
- Linting is performed via the TypeScript compiler (`npm run lint` executes `tsc --noEmit` as defined in `package.json`).
- `tsconfig.json` targets `ES2022` with `"moduleResolution": "bundler"`, `"isolatedModules": true`, and `"jsx": "react-jsx"`.
- Strict null/undefined checks are not globally enforced in `tsconfig.json`, so functions explicitly guard against invalid inputs at runtime (`if (!pts || pts.length < 3) return null;`, `Number.isFinite(v)`, `Math.max(0, ...)`).
- Use Tailwind CSS v4 (`@import "tailwindcss";` in `src/index.css`) paired with CSS custom properties for theming.
- Always use semantic theme tokens defined in `src/index.css` instead of hardcoded neutral colors in UI panels:
- Theme switching is controlled via `document.documentElement.setAttribute('data-theme', isLightMode ? 'light' : 'dark')` in `src/App.tsx`.

## Import Organization

- `@/*` is mapped to `./*` (project root) in `tsconfig.json` and `vite.config.ts`.
- Despite the alias configuration, existing files in `src/` exclusively use relative imports (`./lib/...`, `../lib/...`, `./components/...`). Prefer relative imports within `src/` for consistency, and use `import type` when importing only TypeScript interfaces under `isolatedModules`.

## Error Handling

- **Multi-tier network fallbacks for external GIS APIs:** Never rely on a single external GIS endpoint when alternatives exist. Wrap each tier in a `try / catch` with an `AbortController` timeout and fall through to secondary providers:
- **Graceful geometry degradation:** When processing hundreds of OSM buildings or polygon offsets, wrap individual polygon extrusions in `try { ... } catch (_) {}` (`src/lib/exportService.ts:142-220`, `src/components/ThreeTerrainViewer.tsx:418-506`) so a single malformed OSM way does not abort rendering the entire urban context.
- **Degenerate polygon / math guards:** Return `null` or a marked `collapsed: true` state rather than throwing when geometric operations become invalid (e.g., `insetPolygonBisector` and `computeOgucModel` in `src/lib/ogucService.ts` when setbacks exceed half the lot width).
- **User-facing operational errors:** In top-level UI actions (`src/App.tsx`, `src/components/OsmImporter.tsx`), log the exception with `console.error(err)` and notify the user with a Spanish message via `alert(...)`, always resetting loading states (`setIsExporting(false)`, `setIsExtracting(false)`) in a `finally` block.

## Logging

- Prefix diagnostic logs from GIS/satellite pipelines with bracketed module tags in Spanish:
- Use `console.warn` for recoverable fallback events (e.g., tile load failure, primary API timeout, texture load warning).
- Use `console.error` before `alert(...)` when an interactive user action (search, extraction, file export) fails completely.

## Comments

- Write numbered step-by-step comments for mathematical, astronomical, and geometric pipelines (e.g., `// 1. Día del año (1–365)` through `// 10. Acimut solar` in `src/lib/SunPosition.ts`; `// 1. Terrain Mesh` and `// 2. Extruded Context Buildings` in `src/lib/exportService.ts`).
- Document coordinate system conventions and axis orientations inline whenever converting between geographic (`lat`/`lon`), 2D grid (`cols`/`rows`), SVG 2.5D matrix (`X`/`Y`/`zOffset`), and Three.js world space (`+X` East, `+Y` Up, `-Z` North).
- Reference specific Chilean urban regulatory articles where applicable (`// Art. 2.6.3`, `// Art. 2.6.12: Extra setback above 10.5m` in `src/lib/ogucService.ts`).
- Comments and UI strings are written in **Spanish** (with occasional English technical terms for Three.js/WebGL internals).
- Add concise JSDoc block comments (`/** ... */`) above exported service functions in `src/lib/exportService.ts`, `src/lib/ogucService.ts`, `src/lib/satelliteService.ts`, and complex coordinate helpers like `screenToGrid` in `src/components/ContourViewer.tsx`.

## Function Design

- Pure mathematical and geometric helper functions in `src/lib/` are kept focused (20–90 lines each, such as `getSunPosition`, `clipSegmentToBBox`, `clipWayToBBox`, `convexHull3D`, `computePolygonAreaM2`).
- React viewer components (`src/components/ContourViewer.tsx` at 2,229 lines, `src/components/ThreeTerrainViewer.tsx` at 1,376 lines, `src/components/OsmImporter.tsx` at 1,276 lines, `src/App.tsx` at 1,114 lines) are large, self-contained modules. When adding new domain calculations, extract them into `src/lib/` (like `src/lib/ogucService.ts` or `src/lib/exportService.ts`) rather than growing component files further.
- Use an options object interface when a function accepts more than 4–5 parameters or optional configuration:
- Provide sensible default parameter values (`zExaggeration: number = 1.0`, `gridSize = 150`, `maxStepMeters: number = 15`).
- Return strongly typed result interfaces (`OgucComputedModel | null`, `Promise<SatelliteResult>`, `Promise<MeshData>`, `SunPosition`).
- Return `null` for invalid or insufficient geometric inputs (e.g., fewer than 3 polygon vertices) and check for `null` at the call site.

## Module Design

- **Components (`src/App.tsx`, `src/components/*.tsx`):** Use `export default function ComponentName(...)` for the primary React component, and named exports (`export type`, `export interface`, `export function`) for shared types or pure helpers (`AnalysisMode` in `src/App.tsx`, `calculatePolygonMetrics` in `src/components/OsmImporter.tsx`).
- **Library Services (`src/lib/*.ts`):** Use named exports exclusively (`export function`, `export interface`, `export const`) — never default exports.
- Barrel files (`index.ts`) are not used. Import directly from the specific module path (e.g., `import { computeOgucModel } from '../lib/ogucService'`).

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Application Shell & State Orchestrator | Owns top-level reactive state (`meshData`, `analysisMode`, OGUC/Solar/Topographic parameters, layer toggles, `.geoarc` project serialization, and 3D export triggers). | `src/App.tsx` |
| Geospatial Importer & Polygon Drawer | Renders interactive Leaflet mini-map and full-screen modal (`createPortal`), handles Nominatim search, regular/irregular lot polygon drawing, and orchestrates DEM + OSM + Satellite extraction. | `src/components/OsmImporter.tsx` |
| WebGL 3D Terrain & Heliodon Viewer | Renders hardware-accelerated Three.js scene with satellite-draped terrain mesh, extruded OSM buildings, clipped road/waterway polylines, 3D OGUC envelopes/rasantes, celestial heliodon dome, and raycasted lot drawing. | `src/components/ThreeTerrainViewer.tsx` |
| Vector 2D/2.5D Topographic & Normative Viewer | Generates D3 contour isolines (`d3.contours`), projects 2D plan and 2.5D isometric SVG views via custom affine matrices, supports interactive lot drawing/dragging, and exports `.dxf` and `.stl`. | `src/components/ContourViewer.tsx` |
| OGUC Normative & OSM Geometry Engine | Computes Chilean OGUC regulatory envelopes (Art. 2.6.3 rasantes, Art. 2.6.12 stepped setbacks, comparative shadow compliance), clips OSM ways via Liang-Barsky, and fetches/normalizes OSM vector layers. | `src/lib/ogucService.ts` |
| Satellite Orthophoto Compositor | Downloads Web Mercator tiles from Esri World Imagery (with Google Satellite fallback), stitches and crops them to the exact BBox on an offscreen `<canvas>`, and generates ESRI `.jgw` Worldfiles. | `src/lib/satelliteService.ts` |
| 3D Scene Builder & CAD/BIM Exporter | Builds standalone `THREE.Scene` graphs from `MeshData` and exports binary `.glb` (SketchUp native) or compressed `.zip` bundles containing `.obj`, `.mtl`, `.jpg`, `.jgw`, and instructions via `fflate`. | `src/lib/exportService.ts` |
| Solar Ephemeris Calculator | Calculates astronomical solar altitude (`elevation`) and compass `azimuth` from latitude, longitude, date, and decimal hour. | `src/lib/SunPosition.ts` |
| Local 3D Mesh Processor | Parses uploaded `.ply` and `.fbx` files via `three-stdlib`, infers up-axis (Y-up vs Z-up), rasterizes vertices into a regular DEM grid, fills holes by iterative diffusion, and applies box-blur smoothing. | `src/lib/meshProcessor.ts` |
| Pedagogical Script Templates | Generates downloadable/displayable Python (`trimesh`, `scipy`, `geopandas`) and JSON metadata templates explaining the Mesh-to-DEM pipeline. | `src/lib/templates.ts` |
| Vite Dev Server & Overpass Proxy | Configures React/Tailwind plugins and mounts the `/api/overpass` Node middleware that races multiple upstream Overpass interpreters using `Promise.any`. | `vite.config.ts` |

## Pattern Overview

- **Zero-Backend Compute Architecture:** All DEM decoding (`fast-png` Terrarium RGB elevation math), bilinear grid resampling, polygon offsetting, solar raymarching, and binary CAD/3D file generation (`.glb`, `.obj`, `.dxf`, `.stl`, `.jgw`, `.geoarc`) execute entirely in the browser.
- **Synchronized Dual Viewports:** `src/App.tsx` maintains a single canonical terrain and normative state (`meshData`, `customLotPts`, `ogucParams`, `solarParams`) and passes identical props to either `src/components/ThreeTerrainViewer.tsx` (`viewerMode === 'realistic'`) or `src/components/ContourViewer.tsx` (`viewerMode === 'technical'`).
- **Shared Pure Geometric Core:** Both rendering engines delegate regulatory math, polygon bisector offsetting, Liang-Barsky bounding-box clipping, and shadow polygon projection to pure TypeScript functions in `src/lib/ogucService.ts` and `src/lib/SunPosition.ts`.
- **Multi-Tier Network Resilience:** External geospatial queries use cascading fallbacks—OSM vector extraction in `src/lib/ogucService.ts` tries official OSM API v0.6 (`map.json`) first, falls back to the local Vite middleware proxy (`/api/overpass` racing 4 mirrors via `Promise.any`), and finally falls back to direct client-side Overpass mirror requests.

## Layers

- Purpose: Bootstraps React 19 root and defines CSS custom properties for light/dark architectural themes.
- Location: `index.html`, `src/main.tsx`, `src/index.css`
- Contains: DOM mount point, Tailwind v4 `@theme` token definitions, theme variables (`--theme-bg-base`, `--theme-accent`, etc.).
- Depends on: `react`, `react-dom/client`, `tailwindcss`
- Used by: Vite bundler entry
- Purpose: Manages application layout (collapsible sidebar + main studio viewport), user parameter controls, post-import data sanitization, and project import/export (`.geoarc`).
- Location: `src/App.tsx`
- Contains: Top-level React component `App`, `AnalysisMode` type definition, `InfoTooltip` helper, DEM bilinear resampling and 1-pass box blur in `handleOsmDataFetched`.
- Depends on: `src/components/*`, `src/lib/*`, `motion/react`, `lucide-react`
- Used by: `src/main.tsx`
- Purpose: Provide specialized interactive canvases (Leaflet 2D map, Three.js WebGL 3D canvas, D3/SVG 2D/2.5D canvas).
- Location: `src/components/OsmImporter.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`
- Contains: Map drawing controllers, WebGL render loops, SVG affine projection matrices, pointer/raycaster event handlers, and local format exporters (`.dxf`, `.stl`).
- Depends on: `src/lib/ogucService.ts`, `src/lib/satelliteService.ts`, `src/lib/SunPosition.ts`, `src/lib/meshProcessor.ts`, `leaflet`, `react-leaflet`, `three`, `three-stdlib`, `d3`
- Used by: `src/App.tsx`
- Purpose: Encapsulates mathematical, regulatory (Chilean OGUC), astronomical, raster-stitching, and 3D file-packaging logic without React dependencies.
- Location: `src/lib/` (`ogucService.ts`, `satelliteService.ts`, `exportService.ts`, `SunPosition.ts`, `meshProcessor.ts`, `templates.ts`)
- Contains: Pure TypeScript functions and typed interfaces (`MeshData`, `OgucParams`, `OgucComputedModel`, `SatelliteResult`, `Export3DOptions`, `SunPosition`).
- Depends on: `three`, `three-stdlib`, `fflate`
- Used by: `src/App.tsx`, `src/components/*`
- Purpose: Bypasses browser CORS/rate-limiting on Overpass API requests during local development.
- Location: `vite.config.ts` (`overpassProxyPlugin`)
- Contains: Connect middleware listening on `POST /api/overpass`.
- Depends on: Node `fetch`, `AbortController`
- Used by: `fetchOsmLayersForBBox` in `src/lib/ogucService.ts`

## Data Flow

### Primary Request Path: Geospatial Terrain & Context Extraction

### Secondary Flow: Normative OGUC & Solar Analysis Pipeline

### Secondary Flow: CAD / 3D / Project Export Pipeline

- **Top-Down Props + Lifting State Up:** `src/App.tsx` owns all cross-cutting state using React `useState` hooks. Shared interactive state (`isDrawingLot`, `customLotPts`) is passed down with setter callbacks (`setIsDrawingLot`, `setCustomLotPts`) so edits made in `OsmImporter`, `ThreeTerrainViewer`, or `ContourViewer` immediately synchronize across all views.
- **Derived Memoized State:** Heavy geometric transformations (`contours`, `buildings3D`, `ogucModel`, `sunPos`, `sunPaths`, `heliodonGuides`) are computed on-the-fly via `useMemo` inside `ThreeTerrainViewer` and `ContourViewer` rather than stored in redundant state variables.
- **Imperative Scene Refs:** `ThreeTerrainViewer` stores mutable Three.js instances (`rendererRef`, `sceneRef`, `cameraRef`, `controlsRef`, `dirLightRef`, `terrainMeshRef`) in `useRef` containers and updates scene graph groups (`Terrain_Mesh`, `Building_Group`, `Roads_Group`, `Waterways_Group`, `Overlay_Lot`, `Overlay_OGUC`, `Overlay_Heliodon`) inside targeted `useEffect` hooks.

## Key Abstractions

- Purpose: Canonical intermediate representation of a terrain patch and its urban context.
- Examples: `src/lib/meshProcessor.ts`, `src/App.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`, `src/lib/exportService.ts`
- Pattern: Normalized data transfer object containing a flat row-major elevation array (`grid: number[]`), grid dimensions (`cols`, `rows`, `size`), physical metric span (`w`, `h`), elevation bounds (`minEv`, `maxEv`), geographic `bbox`, normalized OSM `buildings` elements, and `satelliteTexture` / `satelliteWorldFile`.
- Purpose: Encapsulates all inputs and geometric outputs for Chilean urban regulatory analysis (Art. 2.6.3 and Art. 2.6.12 OGUC).
- Examples: `src/lib/ogucService.ts`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`
- Pattern: Pure functional output model containing `lotPolygon`, `lotAreaM2`, `collapsed` status, stepped 3D `tiers: VolumeTier[]`, oriented `rasantePlanes: RasantePlane[]`, and `shadows: OgucShadowComparison`.
- Purpose: Bridges three distinct coordinate systems used across the codebase:

## Entry Points

- Location: `index.html` → `src/main.tsx`
- Triggers: Browser page load (`http://localhost:3000/` in dev or static hosting in prod).
- Responsibilities: Mounts `<App />` inside `<StrictMode>` on `#root` and loads global styles from `src/index.css`.
- Location: `vite.config.ts`
- Triggers: `npm run dev` / `npm run build` / `npm run preview`.
- Responsibilities: Configures Vite bundler, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@` path alias, and registers `overpassProxyPlugin()` middleware at `/api/overpass`.

## Architectural Constraints

- **Threading:** Single-threaded main browser event loop. All DEM PNG decoding, bilinear interpolation, D3 contour generation, solar raymarching (up to 2,000 steps per vertex in `src/components/ContourViewer.tsx:797`), and synchronous ZIP compression (`fflate.zipSync` in `src/lib/exportService.ts:348`) run on the UI thread without Web Workers.
- **Grid Resolution Cap:** Terrain grids are capped at `150x150` (`maxDim = 150` in `src/App.tsx:211` and `steps = 150` in `src/components/OsmImporter.tsx:707`) and contour thresholds auto-scale to a maximum of `180` isolines (`src/components/ContourViewer.tsx:120`) to prevent main-thread freezes and SVG DOM node exhaustion.
- **Global State:** No external state library (Redux/Zustand) or React Context is used; state lives in `src/App.tsx` and is passed 1 level deep to `OsmImporter`, `ThreeTerrainViewer`, and `ContourViewer`. Theme state mutates `document.documentElement.setAttribute('data-theme', ...)` (`src/App.tsx:105-111`).
- **Circular Imports:** `src/components/ThreeTerrainViewer.tsx` and `src/components/ContourViewer.tsx` import `type { AnalysisMode } from '../App'`, while `src/App.tsx` imports both viewer components as values. Because `AnalysisMode` is a TypeScript type erased at compile time (`isolatedModules: true` in `tsconfig.json`), this does not cause a runtime circular dependency, but shared types should not be converted to runtime values inside `src/App.tsx`.
- **Static Timezone Assumption in Solar Engine:** `src/lib/SunPosition.ts:23` hardcodes `const tzOffset = -4;` (Chile Standard Time UTC-4) for solar time meridian calculation.

## Anti-Patterns

### Duplicated 3D Scene Construction Logic

### Redundant Double-Resampling of DEM Grids on Import

### Monolithic View Components Mixing Math, Export Serialization, and UI

## Error Handling

- **Cascading Network Fallbacks (`src/lib/ogucService.ts:839-931`, `src/lib/satelliteService.ts:90-131`):** Non-critical context layers (OSM buildings/highways and satellite tiles) catch fetch/timeout errors per endpoint or per tile, log warnings (`console.warn`), and continue extraction so terrain DEM generation still succeeds even if Overpass or Esri tiles fail.
- **Degenerate Geometry Guards (`src/lib/ogucService.ts:126-140`, `src/App.tsx:120-143`):** Geometric operations guard against division-by-zero, `NaN` elevations, submarine trenches (`< 0m`), and polygon self-inversion during setback offsetting (setting `ogucModel.collapsed = true` and rendering a non-blocking UI warning banner in `src/components/ContourViewer.tsx:2122`).
- **Interactive Action Alerts (`src/App.tsx:442-444`, `src/App.tsx:463-466`, `src/components/OsmImporter.tsx:478-483`):** User-triggered file imports/exports and Nominatim searches wrap async work in `try / catch / finally` blocks, resetting loading spinners (`setIsExporting(false)`, `setIsSearching(false)`) and notifying the user via `alert(...)` on failure.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.agents/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
