---
last_mapped_commit: bc98eb591951bb810fb9d4da1e8e5ef5b526257a
last_mapped_at: 2026-10-28
---
<!-- refreshed: 2026-10-28 -->
# Architecture

**Analysis Date:** 2026-10-28

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                   Presentation & Orchestration Layer                      │
│                           `src/App.tsx`                                   │
├──────────────────────┬───────────────────────────┬────────────────────────┤
│  Geospatial Input    │   WebGL 3D Viewport       │  Technical 2.5D Engine │
│  `src/components/    │   `src/components/        │  `src/components/      │
│   OsmImporter.tsx`   │    ThreeTerrainViewer.tsx`│   ContourViewer.tsx`   │
└──────────┬───────────┴─────────────┬─────────────┴────────────┬───────────┘
           │                         │                          │
           ▼                         ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    Domain & Geospatial Services Layer                     │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌───────────────────┐  │
│  │ `src/lib/            │ │ `src/lib/            │ │ `src/lib/         │  │
│  │  ogucService.ts`     │ │  satelliteService.ts`│ │  SunPosition.ts`  │  │
│  ├──────────────────────┤ └──────────────────────┘ ├───────────────────┤  │
│  │ `src/lib/            │                          │ `src/lib/         │  │
│  │  exportService.ts`   │                          │  meshProcessor.ts`│  │
│  └──────────────────────┘                          └───────────────────┘  │
└──────────┬─────────────────────────┬──────────────────────────┬───────────┘
           │                         │                          │
           ▼                         ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│            External Geospatial Providers & Dev Proxy Middleware           │
│  • AWS Terrarium DEM Tiles (`s3.amazonaws.com/elevation-tiles-prod`)      │
│  • OpenStreetMap v0.6 (`api.openstreetmap.org`) & Overpass API            │
│  • Vite Overpass Race Proxy (`vite.config.ts` -> `/api/overpass`)         │
│  • Esri World Imagery & Google Satellite Tiles + Nominatim Geocoding      │
└───────────────────────────────────────────────────────────────────────────┘
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

**Overall:** Client-Side Geospatial & CAD Pipeline with Centralized React State and Dual Rendering Engines (Three.js WebGL + D3/SVG 2.5D).

**Key Characteristics:**
- **Zero-Backend Compute Architecture:** All DEM decoding (`fast-png` Terrarium RGB elevation math), bilinear grid resampling, polygon offsetting, solar raymarching, and binary CAD/3D file generation (`.glb`, `.obj`, `.dxf`, `.stl`, `.jgw`, `.geoarc`) execute entirely in the browser.
- **Synchronized Dual Viewports:** `src/App.tsx` maintains a single canonical terrain and normative state (`meshData`, `customLotPts`, `ogucParams`, `solarParams`) and passes identical props to either `src/components/ThreeTerrainViewer.tsx` (`viewerMode === 'realistic'`) or `src/components/ContourViewer.tsx` (`viewerMode === 'technical'`).
- **Shared Pure Geometric Core:** Both rendering engines delegate regulatory math, polygon bisector offsetting, Liang-Barsky bounding-box clipping, and shadow polygon projection to pure TypeScript functions in `src/lib/ogucService.ts` and `src/lib/SunPosition.ts`.
- **Multi-Tier Network Resilience:** External geospatial queries use cascading fallbacks—OSM vector extraction in `src/lib/ogucService.ts` tries official OSM API v0.6 (`map.json`) first, falls back to the local Vite middleware proxy (`/api/overpass` racing 4 mirrors via `Promise.any`), and finally falls back to direct client-side Overpass mirror requests.

## Layers

**Entry & Styling Shell:**
- Purpose: Bootstraps React 19 root and defines CSS custom properties for light/dark architectural themes.
- Location: `index.html`, `src/main.tsx`, `src/index.css`
- Contains: DOM mount point, Tailwind v4 `@theme` token definitions, theme variables (`--theme-bg-base`, `--theme-accent`, etc.).
- Depends on: `react`, `react-dom/client`, `tailwindcss`
- Used by: Vite bundler entry

**State Orchestration Layer:**
- Purpose: Manages application layout (collapsible sidebar + main studio viewport), user parameter controls, post-import data sanitization, and project import/export (`.geoarc`).
- Location: `src/App.tsx`
- Contains: Top-level React component `App`, `AnalysisMode` type definition, `InfoTooltip` helper, DEM bilinear resampling and 1-pass box blur in `handleOsmDataFetched`.
- Depends on: `src/components/*`, `src/lib/*`, `motion/react`, `lucide-react`
- Used by: `src/main.tsx`

**Interactive Viewport & Ingestion Components:**
- Purpose: Provide specialized interactive canvases (Leaflet 2D map, Three.js WebGL 3D canvas, D3/SVG 2D/2.5D canvas).
- Location: `src/components/OsmImporter.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`
- Contains: Map drawing controllers, WebGL render loops, SVG affine projection matrices, pointer/raycaster event handlers, and local format exporters (`.dxf`, `.stl`).
- Depends on: `src/lib/ogucService.ts`, `src/lib/satelliteService.ts`, `src/lib/SunPosition.ts`, `src/lib/meshProcessor.ts`, `leaflet`, `react-leaflet`, `three`, `three-stdlib`, `d3`
- Used by: `src/App.tsx`

**Domain & Geospatial Services Layer:**
- Purpose: Encapsulates mathematical, regulatory (Chilean OGUC), astronomical, raster-stitching, and 3D file-packaging logic without React dependencies.
- Location: `src/lib/` (`ogucService.ts`, `satelliteService.ts`, `exportService.ts`, `SunPosition.ts`, `meshProcessor.ts`, `templates.ts`)
- Contains: Pure TypeScript functions and typed interfaces (`MeshData`, `OgucParams`, `OgucComputedModel`, `SatelliteResult`, `Export3DOptions`, `SunPosition`).
- Depends on: `three`, `three-stdlib`, `fflate`
- Used by: `src/App.tsx`, `src/components/*`

**Dev Server Proxy Layer:**
- Purpose: Bypasses browser CORS/rate-limiting on Overpass API requests during local development.
- Location: `vite.config.ts` (`overpassProxyPlugin`)
- Contains: Connect middleware listening on `POST /api/overpass`.
- Depends on: Node `fetch`, `AbortController`
- Used by: `fetchOsmLayersForBBox` in `src/lib/ogucService.ts`

## Data Flow

### Primary Request Path: Geospatial Terrain & Context Extraction

1. **Area Selection (`src/components/OsmImporter.tsx:489-546`):** User searches a location via Nominatim (`handleSearch` at `src/components/OsmImporter.tsx:465`) and draws a regular rectangle, irregular polygon, or center pin on the Leaflet map (`MapDrawController` at `src/components/OsmImporter.tsx:229`). Real-time metric area ($\text{m}^2$/$\text{ha}$), perimeter, and geometric centroid are computed in `calculatePolygonMetrics` (`src/components/OsmImporter.tsx:83`).
2. **BBox & DEM Tile Fetching (`src/components/OsmImporter.tsx:582-720`):** Clicking "Extraer Terreno" triggers `extractOsmData`. It adds a proportional contextual margin (`45%` of lot span, minimum `0.00045°` ~48m) around the drawn polygon, selects zoom `15` or `14`, downloads AWS Mapzen Terrarium PNG tiles in parallel, decodes raw RGB bytes via `fast-png` (`(r * 256 + g + b / 256) - 32768`), clamping submarine negative values to `0`, and samples a `150x150` elevation array.
3. **OSM Vector Context Extraction (`src/components/OsmImporter.tsx:721-735` → `src/lib/ogucService.ts:839-931`):** `fetchOsmLayersForBBox` queries OpenStreetMap API v0.6 (`map.json`), falling back to `/api/overpass` (`vite.config.ts:6-104`) and direct Overpass mirrors, then normalizes nodes, ways, and `building:part` / `outer` relations into unified `{ lat, lon }[]` geometries via `normalizeOsmElementsToGeom` (`src/lib/ogucService.ts:776`).
4. **Satellite Orthophoto Stitching (`src/components/OsmImporter.tsx:737-745` → `src/lib/satelliteService.ts:41-202`):** `fetchSatelliteOrthophoto` selects an adaptive zoom (`14`–`19` based on physical span in meters), downloads `256x256` tiles from Esri World Imagery (falling back per-tile to Google Satellite `mt1.google.com`), stitches and subpixel-crops them onto a `768px`–`2048px` HTML5 `<canvas>`, encodes a JPEG data URL (`0.92` quality), and computes a 6-line ESRI `.jgw` Worldfile.
5. **Grid Resampling & Lot Mapping (`src/App.tsx:177-328`):** `handleOsmDataFetched` receives the raw bundle, computes aspect-corrected grid dimensions (`cols` $\times$ `rows`, max `150`), performs bilinear interpolation and a 1-pass separable box blur, constructs the canonical `MeshData` object, and projects the geographic `lotPolygon` coordinates (`[lat, lon]`) into normalized grid coordinates (`customLotPts`: `{ x, y, elev }[]`).
6. **Sanitization & Auto-Recovery Hooks (`src/App.tsx:119-165`):** Two `useEffect` hooks in `src/App.tsx` automatically clamp any residual `< 0m` coastal bathymetry values in `meshData.grid` and retry `fetchOsmLayersForBBox` in the background if `meshData.bbox` is present but `meshData.buildings` is missing.

### Secondary Flow: Normative OGUC & Solar Analysis Pipeline

1. **Parameter Updates (`src/App.tsx:578-910`):** User switches `analysisMode` (`'topographic' | 'oguc' | 'solar'`) and adjusts OGUC parameters (region group `1 | 2 | 3`, `rasanteStartHeight`, `minSetback`, `applyExtraSetback`, `maxHeight`, `continuousBaseHeight`) or Solar parameters (`solarDate`, `solarTime`). Latitude changes automatically select the Chilean OGUC region group (`src/App.tsx:71-80`).
2. **Normative Model Computation (`src/lib/ogucService.ts:337-661`):** Both `ThreeTerrainViewer` (`src/components/ThreeTerrainViewer.tsx:183`) and `ContourViewer` (`src/components/ContourViewer.tsx:734`) invoke `computeOgucModel` via `useMemo`.
   - `insetPolygonBisector` (`src/lib/ogucService.ts:104`) shrinks the lot polygon inward by `minSetback` (and `totalUpperSetbackMeters` above `10.5m` per Art. 2.6.12), checking for self-inversion (`collapsed`).
   - Up to 3 `VolumeTier` extrusions (`continuous`, `main`, `upper_stepped`) are generated on top of the terrain elevation.
   - `classifyEdgeOrientation` (`src/lib/ogucService.ts:250`) classifies each lot boundary edge as `Norte`, `Sur`, `Oriente`, or `Poniente` relative to the lot centroid and builds inclined `RasantePlane` quads using regional angles (e.g., Group 3 South `51°`, O/P `24°`, North `65°`).
   - `projectDirectionalShadowOnTerrain` (`src/lib/ogucService.ts:290`) projects theoretical vs. proposed shadow hulls across azimuths `135°`, `180°`, and `225°` to determine regulatory compliance (`Proposed Area <= Allowed Area * 1.03`).
3. **Interactive Lot Editing in Viewports:**
   - In 3D (`src/components/ThreeTerrainViewer.tsx:1092-1133`), `handleCanvasPointerDown` casts a `THREE.Raycaster` onto `terrainMeshRef.current` to convert 3D clicks into grid coordinates `{ x, y, elev }`.
   - In 2D/2.5D (`src/components/ContourViewer.tsx:624-695`), `screenToGrid` inverts the SVG screen CTM, `d3.zoomTransform`, and the 2.5D isometric projection matrix (using 4-step fixed-point iteration over terrain elevation `Z`) to place vertices or drag the proposed volume across the topography (`handleVolumePointerDown` at `src/components/ContourViewer.tsx:1566`).

### Secondary Flow: CAD / 3D / Project Export Pipeline

1. **SketchUp `.GLB` & CAD `.OBJ` ZIP (`src/App.tsx:451-488` → `src/lib/exportService.ts:247-375`):** `buildThreeSceneFromMeshData` constructs a metric `THREE.Scene` where 1 unit = 1 meter (`PlaneGeometry(widthM, heightM)` rotated `-Math.PI / 2` on X, with buildings embedded `0.35m` into slopes). `exportToGlb` serializes a binary glTF via `GLTFExporter.parseAsync`, while `exportToObjZip` serializes `.obj` + `.mtl` + satellite `.jpg` + `.jgw` + `LEEME_INSTRUCCIONES_3D.txt` into a ZIP archive via `fflate.zipSync`.
2. **AutoCAD `.DXF` & 3D Print `.STL` (`src/components/ContourViewer.tsx:949-1166`):** `handleExportDXF` writes an AC1015 AutoCAD 2000 ASCII DXF with metric header flags (`$INSUNITS = 6`, `$MEASUREMENT = 1`) containing 3D `POLYLINE` entities on `Contours`, `Buildings`, `Highways`, and `Waterways` layers. `handleExportSTL` dynamically imports `STLExporter` and exports a binary `.stl` mesh.
3. **Session Persistence (`.geoarc`) (`src/App.tsx:330-449`):** `handleExportGeoarc` and `handleImportGeoarc` serialize and restore the entire React state tree (including `meshData` and embedded `satelliteTexture` data URL) as a JSON `.geoarc` file.

**State Management:**
- **Top-Down Props + Lifting State Up:** `src/App.tsx` owns all cross-cutting state using React `useState` hooks. Shared interactive state (`isDrawingLot`, `customLotPts`) is passed down with setter callbacks (`setIsDrawingLot`, `setCustomLotPts`) so edits made in `OsmImporter`, `ThreeTerrainViewer`, or `ContourViewer` immediately synchronize across all views.
- **Derived Memoized State:** Heavy geometric transformations (`contours`, `buildings3D`, `ogucModel`, `sunPos`, `sunPaths`, `heliodonGuides`) are computed on-the-fly via `useMemo` inside `ThreeTerrainViewer` and `ContourViewer` rather than stored in redundant state variables.
- **Imperative Scene Refs:** `ThreeTerrainViewer` stores mutable Three.js instances (`rendererRef`, `sceneRef`, `cameraRef`, `controlsRef`, `dirLightRef`, `terrainMeshRef`) in `useRef` containers and updates scene graph groups (`Terrain_Mesh`, `Building_Group`, `Roads_Group`, `Waterways_Group`, `Overlay_Lot`, `Overlay_OGUC`, `Overlay_Heliodon`) inside targeted `useEffect` hooks.

## Key Abstractions

**`MeshData` (`src/lib/meshProcessor.ts:5-18`):**
- Purpose: Canonical intermediate representation of a terrain patch and its urban context.
- Examples: `src/lib/meshProcessor.ts`, `src/App.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`, `src/lib/exportService.ts`
- Pattern: Normalized data transfer object containing a flat row-major elevation array (`grid: number[]`), grid dimensions (`cols`, `rows`, `size`), physical metric span (`w`, `h`), elevation bounds (`minEv`, `maxEv`), geographic `bbox`, normalized OSM `buildings` elements, and `satelliteTexture` / `satelliteWorldFile`.

**`OgucComputedModel` & `OgucParams` (`src/lib/ogucService.ts:3-69`):**
- Purpose: Encapsulates all inputs and geometric outputs for Chilean urban regulatory analysis (Art. 2.6.3 and Art. 2.6.12 OGUC).
- Examples: `src/lib/ogucService.ts`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`
- Pattern: Pure functional output model containing `lotPolygon`, `lotAreaM2`, `collapsed` status, stepped 3D `tiers: VolumeTier[]`, oriented `rasantePlanes: RasantePlane[]`, and `shadows: OgucShadowComparison`.

**Coordinate Space Conversions:**
- Purpose: Bridges three distinct coordinate systems used across the codebase:
  1. **Geographic WGS84 (`lat`, `lon`):** Used in `OsmImporter.tsx`, `satelliteService.ts`, and `fetchOsmLayersForBBox`.
  2. **Normalized Grid Space (`x` $\in [0, \text{cols}-1]$, `y` $\in [0, \text{rows}-1]$, `elev` in meters):** Used in `MeshData.grid`, `customLotPts`, `ogucService.ts`, and `ContourViewer.tsx` (`+X` = East/Oriente, `+Y` = South/Sur).
  3. **Centered Metric 3D World Space (`wx` $\in [-w/2, w/2]$, `wy` = elevation above `minEv` $\times$ `zExaggeration`, `wz` $\in [-h/2, h/2]$):** Used in `ThreeTerrainViewer.tsx` (`gridToWorld` at `src/components/ThreeTerrainViewer.tsx:113`) and `exportService.ts`.

## Entry Points

**Browser Application Entry:**
- Location: `index.html` → `src/main.tsx`
- Triggers: Browser page load (`http://localhost:3000/` in dev or static hosting in prod).
- Responsibilities: Mounts `<App />` inside `<StrictMode>` on `#root` and loads global styles from `src/index.css`.

**Dev Server & Proxy Entry:**
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

**What happens:** Context building extrusion and terrain `PlaneGeometry` construction are implemented in three separate places: `buildThreeSceneFromMeshData` (`src/lib/exportService.ts:18-228`), `ThreeTerrainViewer` (`src/components/ThreeTerrainViewer.tsx:322-511`), and `buildThreeScene` inside `ContourViewer` (`src/components/ContourViewer.tsx:1049-1139`, used only for STL export). Notice that `ContourViewer.buildThreeScene` uses a simpler building extrusion without the `0.35m` slope embed (`baseEmbed`) present in `exportService.ts` and `ThreeTerrainViewer.tsx`.
**Why it's wrong:** Changes to building height heuristics, slope embedding, or coordinate winding must be manually synchronized across three files, leading to subtle geometric discrepancies between the live 3D viewer, `.glb`/`.obj` exports, and `.stl` exports.
**Do this instead:** Consolidate all Three.js terrain and building geometry generation into `src/lib/exportService.ts` (or a dedicated `src/lib/threeSceneBuilder.ts`) and reuse it across `ThreeTerrainViewer.tsx`, `.glb`/`.obj` export, and `.stl` export.

### Redundant Double-Resampling of DEM Grids on Import

**What happens:** `OsmImporter.extractOsmData` (`src/components/OsmImporter.tsx:707-719`) already samples the decoded Terrarium tiles onto a `150x150` bilinear grid (`steps = 150`). It then passes `results` (`22,500` objects) to `handleOsmDataFetched` in `src/App.tsx:181-288`, which unpacks those objects into a `150x150` `Float32Array` and runs a second bilinear interpolation pass to `cols x rows` (`maxDim = 150`) followed by a box blur.
**Why it's wrong:** Allocating `22,500` intermediate `{ latitude, longitude, elevation }` objects and interpolating twice wastes memory and CPU cycles during extraction, and bloats `osmDataRaw` in `src/App.tsx:116` (which is stored in state but never read again).
**Do this instead:** Compute the aspect-corrected `cols x rows` dimensions directly inside `OsmImporter.tsx` (or a shared `src/lib/demService.ts` helper) and pass a typed `Float32Array` directly into `MeshData`.

### Monolithic View Components Mixing Math, Export Serialization, and UI

**What happens:** `src/components/ContourViewer.tsx` (2,229 lines), `src/components/ThreeTerrainViewer.tsx` (1,376 lines), `src/components/OsmImporter.tsx` (1,276 lines), and `src/App.tsx` (1,114 lines) combine complex mathematical/file-format logic (e.g., ASCII DXF generation at `src/components/ContourViewer.tsx:949-1047`, solar raymarching at `src/components/ContourViewer.tsx:762-819`, Terrarium PNG decoding at `src/components/OsmImporter.tsx:615-705`) with large JSX HUD trees.
**Why it's wrong:** Makes unit testing geometric algorithms or export serializers difficult without mounting heavy DOM/WebGL components, and increases cognitive load when modifying UI controls.
**Do this instead:** Extract file serializers (`handleExportDXF`, `handleExportSTL`) into `src/lib/exportService.ts` and extract DEM tile fetching/decoding into a dedicated `src/lib/demService.ts`.

## Error Handling

**Strategy:** Graceful degradation with multi-endpoint fallbacks for background geospatial layers, paired with user-facing `alert()` dialogs and `console.warn`/`console.error` logging for fatal interactive actions.

**Patterns:**
- **Cascading Network Fallbacks (`src/lib/ogucService.ts:839-931`, `src/lib/satelliteService.ts:90-131`):** Non-critical context layers (OSM buildings/highways and satellite tiles) catch fetch/timeout errors per endpoint or per tile, log warnings (`console.warn`), and continue extraction so terrain DEM generation still succeeds even if Overpass or Esri tiles fail.
- **Degenerate Geometry Guards (`src/lib/ogucService.ts:126-140`, `src/App.tsx:120-143`):** Geometric operations guard against division-by-zero, `NaN` elevations, submarine trenches (`< 0m`), and polygon self-inversion during setback offsetting (setting `ogucModel.collapsed = true` and rendering a non-blocking UI warning banner in `src/components/ContourViewer.tsx:2122`).
- **Interactive Action Alerts (`src/App.tsx:442-444`, `src/App.tsx:463-466`, `src/components/OsmImporter.tsx:478-483`):** User-triggered file imports/exports and Nominatim searches wrap async work in `try / catch / finally` blocks, resetting loading spinners (`setIsExporting(false)`, `setIsSearching(false)`) and notifying the user via `alert(...)` on failure.

## Cross-Cutting Concerns

**Logging:** Native browser `console.log`, `console.warn`, and `console.error` with bracketed subsystem prefixes (`[GeoArc OSM]`, `[GeoArc Satelital]`) in `src/lib/ogucService.ts` and `src/components/OsmImporter.tsx`.
**Validation:** Runtime boundary clamping and `Number.isFinite` / `Number.isNaN` sanitization on elevation grids (`src/App.tsx:120-131`, `src/lib/meshProcessor.ts:156`) and polygon vertex counts (`pts.length >= 3`). Static type checking via `npm run lint` (`tsc --noEmit`).
**Authentication:** None required. All consumed geospatial endpoints (AWS Terrarium S3, OpenStreetMap v0.6 / Overpass, Nominatim, Esri World Imagery) are public unauthenticated APIs. `vite.config.ts:111` exposes `process.env.GEMINI_API_KEY` from `.env` if present, though it is currently unused in `src/`.

---

*Architecture analysis: 2026-10-28*
