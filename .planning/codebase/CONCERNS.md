---
last_mapped_commit: bc98eb591951bb810fb9d4da1e8e5ef5b526257a
last_mapped_at: 2026-10-28
---
<!-- refreshed: 2026-10-28 -->
# Codebase Concerns

**Analysis Date:** 2026-10-28

## Tech Debt

**Orphaned and Dead Modules:**
- Issue: Several modules and state pipelines exist in the repository and are advertised in `README.md`, but are completely disconnected from the active UI:
  1. `processMeshFile` in `src/lib/meshProcessor.ts` (lines 20–186) implements `.ply` and `.fbx` 3D mesh parsing, but `src/App.tsx` (line 11) only imports the `MeshData` TypeScript interface. No `<input type="file">` or dropzone in `src/App.tsx` invokes `processMeshFile`.
  2. `getPythonCode` and `getJsonOutput` in `src/lib/templates.ts` (lines 1–107) are never imported anywhere in `src/`.
  3. `terrainCurtains` in `src/components/ContourViewer.tsx` (lines 343–358) is computed inside a `useMemo` hook whenever `meshData` changes, and `osmDataRaw` in `src/App.tsx` (line 116) is stored via `setOsmDataRaw`, but neither value is ever read or rendered.
  4. `handleSimulateProcess` in `src/App.tsx` (lines 167–175, bound to the `"Generar Visualización 3d"` button at lines 912–928) only runs `await new Promise(r => setTimeout(r, 600))` to toggle a loading spinner without performing any computation (`handleOsmDataFetched` already sets `isDone(true)` at line 327).
- Files: `src/lib/meshProcessor.ts`, `src/lib/templates.ts`, `src/components/ContourViewer.tsx`, `src/App.tsx`
- Impact: Increases maintenance burden, misleads developers and users reading `README.md`, and wastes CPU cycles on unused `useMemo` calculations.
- Fix approach: Either wire `processMeshFile` back into a local file upload control in `src/App.tsx` or remove `src/lib/templates.ts`, `terrainCurtains`, `osmDataRaw`, and the dummy `handleSimulateProcess` button.

**Triplicated Three.js Scene Construction with Divergent Elevation Math:**
- Issue: Three separate functions build a Three.js terrain and building scene from `MeshData`:
  1. `buildThreeSceneFromMeshData` in `src/lib/exportService.ts` (lines 18–228) for `.OBJ` and `.GLB` exports.
  2. The base scene `useEffect` in `src/components/ThreeTerrainViewer.tsx` (lines 303–665) for the interactive WebGL viewer.
  3. `buildThreeScene` in `src/components/ContourViewer.tsx` (lines 1049–1139) for `.STL` export.
- Files: `src/lib/exportService.ts`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`
- Impact: `exportService.ts` (line 44) and `ThreeTerrainViewer.tsx` (line 331) normalize terrain vertex heights relative to minimum elevation (`(elev - minEv) * zExaggeration`) and embed building bases by `0.35m` into slopes, whereas `buildThreeScene` in `src/components/ContourViewer.tsx` (lines 1081, 1101) uses absolute `elevation * zExaggeration` and places buildings at `b.pts[0].elev` without slope embedding. Exporting `.STL` vs `.GLB`/`.OBJ` produces models at different Z elevations and with floating buildings on sloped terrain.
- Fix approach: Consolidate all Three.js terrain/building mesh generation into `buildThreeSceneFromMeshData` in `src/lib/exportService.ts` and reuse it for `.STL`, `.OBJ`, `.GLB`, and `ThreeTerrainViewer.tsx`.

**Monolithic Component Files and Prop Drilling:**
- Issue: Core components combine UI chrome, pointer state machines, cartographic projection math, and CAD file serializers in single files exceeding 1,000–2,200 lines: `src/components/ContourViewer.tsx` (2,229 lines), `src/components/ThreeTerrainViewer.tsx` (1,376 lines), `src/components/OsmImporter.tsx` (1,276 lines), and `src/App.tsx` (1,114 lines). `src/App.tsx` holds 28 `useState` hooks (lines 43–116) and passes them down as props to both viewers.
- Files: `src/App.tsx`, `src/components/ContourViewer.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/OsmImporter.tsx`
- Impact: High cognitive load when modifying rendering or interaction logic; state updates in `src/App.tsx` trigger re-renders across the entire tree.
- Fix approach: Extract DXF/STL/SVG exporters from `src/components/ContourViewer.tsx` into `src/lib/exportService.ts`, extract solar raymarching into `src/lib/solarService.ts`, and move shared terrain/OGUC/solar state into a React Context or Zustand store.

**Unused Packages and Misclassified Dependencies:**
- Issue: `package.json` includes unused backend/AI packages in `dependencies` (`@google/genai`, `express`, `dotenv` at lines 14, 19–20) and `devDependencies` (`@types/express`, `tsx` at lines 35, 40). Build tools (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@types/three`) are placed in `dependencies` (lines 15–17, 31), with `vite` listed in both `dependencies` and `devDependencies` (lines 31, 42). Additionally, `"clean": "rm -rf dist"` (`package.json` line 10) fails on native Windows PowerShell/CMD.
- Files: `package.json`
- Impact: Bloated `node_modules` installation footprint and broken `npm run clean` on Windows environments.
- Fix approach: Prune unused packages (`@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`), move build/type packages to `devDependencies`, and replace `rm -rf dist` with `npx rimraf dist` or Node's `fs.rmSync`.

**Non-Strict TypeScript Configuration and `any` Usage:**
- Issue: `tsconfig.json` omits `"strict": true`, and core interfaces rely on untyped `any` payloads (`buildings?: any` in `src/lib/meshProcessor.ts:14`, `osmDataRaw: any` in `src/App.tsx:116`, `setMeshData({...} as any)` in `src/App.tsx:302`, `normalizeOsmElementsToGeom(data: any)` in `src/lib/ogucService.ts:776`).
- Files: `tsconfig.json`, `src/App.tsx`, `src/lib/meshProcessor.ts`, `src/lib/ogucService.ts`
- Impact: Type mismatches (such as extra properties `satelliteTexture` and `satelliteWorldFile` initially requiring `as any` casts) bypass compile-time checks (`npm run lint`).
- Fix approach: Define explicit TypeScript interfaces for Overpass/OSM elements (`OsmElement`, `OsmFeatureCollection`) in `src/lib/ogucService.ts` and enable `"strict": true` in `tsconfig.json`.

## Known Bugs

**Volume Drag Offset Desynchronization Between 2.5D SVG and 3D WebGL Viewers:**
- Symptoms: When a user drags the proposed OGUC volume in `src/components/ContourViewer.tsx`, the volume and its lot boundary move on screen, but switching to `3D Satelital` (`src/components/ThreeTerrainViewer.tsx`) or exporting a `.geoarc` project file loses the dragged position.
- Files: `src/components/ContourViewer.tsx` (lines 70, 616–618, 712–732, 1566–1603), `src/components/ThreeTerrainViewer.tsx` (lines 166–181), `src/App.tsx` (lines 346–356)
- Trigger: Switch `Modo de Análisis` to `OGUC`, switch viewer to `Topográfico (SVG)`, drag the orange volume across the terrain, then switch viewer to `3D Satelital` or click `Exportar (.geoarc)`.
- Workaround: Draw the lot at the target location using `Dibujar Lote` rather than dragging the volume.

**DXF Export Clamps Out-of-Bounds Roads/Waterways to Bounding Box Edges and Skips Relation Buildings:**
- Symptoms: Exported `isolineas_*.dxf` files contain artificial straight lines running along the outer border of the terrain for streets/rivers that extend beyond the BBox, and multipolygon buildings (`type === 'relation'`) are missing. Also, road/building Y coordinates use `(clampedLat - minLat) / heightSpan` while `getElevAt` samples elevation using `(maxLat - lat) / heightSpan` without bilinear interpolation.
- Files: `src/components/ContourViewer.tsx` (lines 994–1034)
- Trigger: Click the `DXF` export button in `ContourViewer.tsx` on any urban terrain where highways/waterways cross the BBox boundary or where buildings are mapped as OSM relations.
- Workaround: None in DXF export; users must manually trim border lines in AutoCAD/SketchUp. Fix by using `clipWayToBBox` (`src/lib/ogucService.ts:716`) and bilinear `getGridElevAt` inside `handleExportDXF`, matching `buildings3D`/`highways3D` generation (lines 280–337).

**Hardcoded UTC-4 Timezone and UTC Date Parsing in Solar Engine:**
- Symptoms: Solar azimuth/elevation calculations use a static `tzOffset = -4` (`lstMeridian = -60°`) regardless of whether Chile is on Daylight Saving Time (UTC-3) or whether the user extracts terrain in another country/timezone. Furthermore, `new Date(solarDate)` in `src/App.tsx` parses `'YYYY-MM-DD'` as UTC midnight, which shifts the local date back by one day in Western Hemisphere timezones (breaking day-of-year calculation on January 1st).
- Files: `src/lib/SunPosition.ts` (lines 13–25), `src/App.tsx` (lines 1039, 1079)
- Trigger: Select a location outside UTC-4 (e.g., Europe, Asia, or Chile during summer UTC-3) or select `2024-01-01` in `Modo Solar`.
- Workaround: Manually offset the hour slider. Fix by parsing `solarDate` as local noon (`new Date(`${solarDate}T12:00:00`)`) and computing timezone offset from longitude (`Math.round(lon / 15)`) or `Intl.DateTimeFormat`.

**OGUC Proposed Shadow Ignores Lower Tiers When Extra Setback (`Art. 2.6.12`) Is Active:**
- Symptoms: Enabling `Adicional > 10.5m (Art. 2.6.12)` or `Edif. Continua (m)` can cause the red proposed shadow polygon (`proposedPolygons`) to shrink unrealistically because shadow projection only projects the topmost tier (`tiers[tiers.length - 1]`) and ignores the wider `main` (≤10.5m) and `continuous` base tiers.
- Files: `src/lib/ogucService.ts` (lines 608–625)
- Trigger: In `Modo OGUC`, set `Altura Máx` > 10.5m and check `Adicional > 10.5m (Art. 2.6.12)`, or set `Edif. Continua` = `Altura Máx`.
- Workaround: None. Fix by projecting shadows for all active `tiers` and computing the union / convex hull of their projected footprints.

**Negative Elevations Clamped to Sea Level (`0m`):**
- Symptoms: Any terrain with true elevation below `0m` (inland depressions, excavations, or local coordinates) is clamped to `0m`.
- Files: `src/App.tsx` (lines 119–143, 192, 206), `src/components/OsmImporter.tsx` (line 680)
- Trigger: Extract terrain in a sub-sea-level basin or load a `.geoarc` mesh with negative elevations.
- Workaround: None; clamping is hardcoded in both extraction and a `useEffect` sanitizer on `meshData`.

## Security Considerations

**Plaintext `GEMINI_API_KEY` Injection into Client Bundle:**
- Risk: `vite.config.ts` injects `process.env.GEMINI_API_KEY` directly into client code via Vite's `define` option. Any secret key present in `.env` at build time is embedded in plaintext inside `dist/assets/*.js`.
- Files: `vite.config.ts` (lines 107–112)
- Current mitigation: `@google/genai` is not currently called in `src/`, so if `.env` is empty no key is bundled.
- Recommendations: Remove `'process.env.GEMINI_API_KEY'` from `vite.config.ts` `define` block; if AI features are added later, route requests through a backend proxy.

**Unbounded Request Body and Spoofed Headers in `/api/overpass` Proxy:**
- Risk: The custom Vite middleware at `/api/overpass` concatenates incoming `req.on('data')` chunks into memory (`let body = ''`) with no byte limit, and `package.json` binds the dev server to `0.0.0.0` (`--host=0.0.0.0`). A large POST request on the local network can exhaust Node.js heap memory. Additionally, the proxy spoofs `Origin: https://overpass-turbo.eu` and `Referer: https://overpass-turbo.eu/` headers when querying public Overpass instances.
- Files: `vite.config.ts` (lines 10–57), `package.json` (line 7)
- Current mitigation: Only active during `npm run dev` on `POST /api/overpass`.
- Recommendations: Enforce a maximum body size (e.g., 64 KB) before buffering chunks, use an honest application `User-Agent` (`GeoArc/1.3`), and remove `--host=0.0.0.0` from the default `dev` script unless LAN access is explicitly needed.

**Unvalidated `.geoarc` Project File Deserialization:**
- Risk: `handleImportGeoarc` parses user-provided `.geoarc` JSON files with `JSON.parse` and assigns `state.meshData` (`grid`, `buildings`, `satelliteTexture`) directly into React state without schema validation or URL sanitization. Malformed `grid` arrays or non-`data:image/` strings in `satelliteTexture` can crash both viewers or trigger unexpected external network requests.
- Files: `src/App.tsx` (lines 386–449)
- Current mitigation: Basic `try / catch` around `JSON.parse` with `alert("Error al cargar el archivo .geoarc")`.
- Recommendations: Validate imported JSON structure, numeric bounds (`cols`, `rows`, `grid.length === cols * rows`), and restrict `satelliteTexture` to `data:image/jpeg;base64,` or `data:image/png;base64,` prefixes.

## Performance Bottlenecks

**Unmemoized 2,000-Step Solar Raymarching Inside SVG Render Loop:**
- Problem: In `src/components/ContourViewer.tsx`, `getSolarShadowPolygon` executes up to `2,000` raymarching steps per vertex for every context building (`buildings3D.map`) and for `projectVolume` directly inside the JSX render body without `useMemo`.
- Files: `src/components/ContourViewer.tsx` (lines 762–819, 1443–1456, 1852–1862)
- Cause: Because `getSolarShadowPolygon` is called during render rather than memoized on `[buildings3D, sunPosition, meshData]`, rotating the 2.5D camera (`handlePointerMove` at lines 886–900 or `isAutoOrbit` `requestAnimationFrame` at lines 78–87) recalculates thousands of raymarching steps on every single frame (60 FPS), even though the sun position has not changed.
- Improvement path: Memoize the computed 3D shadow polygons for `buildings3D` and `projectVolume` in a `useMemo` keyed only on `[analysisMode, solarParams?.showShadows, sunPosition, buildings3D, projectVolume, meshData]`, leaving only `render3DPath` projection for the render pass.

**WebGL Geometry and Material Memory Leaks on Overlay Updates:**
- Problem: Dragging the solar time slider or modifying OGUC parameters in `ThreeTerrainViewer.tsx` leaks GPU memory (`BufferGeometry`, `ExtrudeGeometry`, `SphereGeometry`, `EdgesGeometry`, `MeshStandardMaterial`, `LineBasicMaterial`, `LineDashedMaterial`).
- Files: `src/components/ThreeTerrainViewer.tsx` (lines 309–320, 674–683)
- Cause: The dynamic overlay `useEffect` (lines 674–683) removes `Overlay_Lot`, `Overlay_OGUC`, and `Overlay_Heliodon` (`THREE.Group` instances) via `scene.remove(obj)` without traversing child meshes/lines to call `geometry.dispose()` and `material.dispose()`. Similarly, the base scene `useEffect` (lines 317–320) only checks `(obj as THREE.Mesh).geometry` on top-level objects, failing to dispose geometries/materials nested inside `Building_Group`, `Roads_Group`, `Waterways_Group`, and `Helper_Axes`.
- Improvement path: Create a helper `disposeObjectTree(obj: THREE.Object3D)` that recursively traverses `obj.traverse(...)` and disposes all geometries and materials before calling `scene.remove(obj)`.

**Redundant Double Grid Interpolation During Terrain Extraction:**
- Problem: Extracting terrain interpolates the `150 × 150` elevation grid twice and allocates intermediate object arrays.
- Files: `src/components/OsmImporter.tsx` (lines 707–719), `src/App.tsx` (lines 181–291)
- Cause: `OsmImporter.tsx` samples `150 × 150` (`22,500`) bilinear points into an array of `{ latitude, longitude, elevation }` objects. `handleOsmDataFetched` in `src/App.tsx` then copies those `22,500` objects into a `Float32Array`, performs a second bilinear interpolation onto a `cols × rows` (`maxDim = 150`) grid, runs a 2-pass blur, and converts `Float32Array` back to `number[]` (`Array.from(currentGrid)`).
- Improvement path: Compute the exact `cols × rows` aspect-ratio grid and 1-pass smoothing directly inside `OsmImporter.tsx` (or a dedicated `terrainService.ts` module) and pass the final `grid` array once.

**Multi-Megabyte Base64 Orthophoto Strings Stored in React State:**
- Problem: High-resolution (`2048 × 2048`) satellite orthophotos are converted to base64 `dataUrl` strings (`croppedCanvas.toDataURL('image/jpeg', 0.92)`) and stored directly inside `meshData.satelliteTexture`.
- Files: `src/lib/satelliteService.ts` (lines 152–179), `src/App.tsx` (lines 131, 158, 300, 369)
- Cause: Storing a 1.5–3 MB base64 string inside `meshData` increases memory pressure when cloning state (`{ ...meshData }`) and bloats `.geoarc` JSON serialization.
- Improvement path: Use `URL.createObjectURL(blob)` for runtime rendering in `ThreeTerrainViewer` and `ContourViewer`, and only convert to base64 on demand when exporting a `.geoarc` file.

## Fragile Areas

**Vite-Only `/api/overpass` Proxy Middleware:**
- Files: `vite.config.ts` (lines 6–104), `src/lib/ogucService.ts` (lines 881–900)
- Why fragile: `overpassProxyPlugin` is registered via Vite's `configureServer` hook, which only exists in `vite dev`. In production (`vite build` / static hosting), `/api/overpass` returns HTTP 404. While `fetchOsmLayersForBBox` falls back to `api.openstreetmap.org/api/0.6/map.json` and direct Overpass mirrors, those direct browser requests are subject to strict CORS policies, HTTP 429 rate-limiting, and OSM v0.6 node count limits.
- Safe modification: Keep the 3-tier fallback in `fetchOsmLayersForBBox` intact, and if deploying to production (e.g., Vercel/Cloudflare/Node), provide a serverless function or Express route matching `/api/overpass`.
- Test coverage: Untested (0 automated tests).

**Polygon Inset Bisector Algorithm on Non-Convex Lots:**
- Files: `src/lib/ogucService.ts` (lines 104–198)
- Why fragile: `insetPolygonBisector` offsets vertices along angle bisectors and only checks whether the overall polygon area inverted sign (`lines 188–195`) or whether `offsetGrid * 2 >= minSpan * 0.96`. On concave or L-shaped lots drawn with `Polígono Irregular`, inward bisector offsets can cause adjacent edges to cross each other (self-intersection) while total signed area remains positive, corrupting `THREE.ExtrudeGeometry` triangulation in `src/components/ThreeTerrainViewer.tsx` (lines 808–812).
- Safe modification: Add edge-segment intersection detection after computing `newPts`, or use a robust polygon clipping/offsetting algorithm (such as Clipper2 / Martinez-Rueda) for complex lot shapes.
- Test coverage: Untested.

**2.5D Screen-to-Grid Fixed-Point Inversion (`screenToGrid`):**
- Files: `src/components/ContourViewer.tsx` (lines 624–695)
- Why fragile: `screenToGrid` inverts the 2.5D isometric projection by running 4 fixed-point iterations (`estElev = getGridElevAt(gridX, gridY)`). When `isPerspective` is active with steep pitch (`rotation.x > 75°`) and high vertical exaggeration (`zExaggeration > 3`), a single screen pixel can intersect multiple terrain folds, causing fixed-point iteration to jump or oscillate while drawing lots or dragging volumes.
- Safe modification: Do not reduce iteration count or remove clamping (`lines 690–691`); if modifying projection math in `getMatrix`/`projectPoint`, `screenToGrid` must be updated in lockstep.
- Test coverage: Untested.

**Unauthenticated Direct Tile and Geocoding Requests:**
- Files: `src/lib/satelliteService.ts` (lines 90–131), `src/components/OsmImporter.tsx` (lines 19–21, 469, 642)
- Why fragile: Relies on direct browser fetches to `server.arcgisonline.com`, `mt1.google.com/vt/lyrs=s`, `s3.amazonaws.com/elevation-tiles-prod/terrarium`, `nominatim.openstreetmap.org/search`, and `unpkg.com`. Nominatim blocks requests lacking proper identification or exceeding 1 req/s, and Google/Esri tile servers can throttle or restrict cross-origin canvas access (`crossOrigin = 'anonymous'`).
- Safe modification: Always preserve `try / catch` fallbacks around tile decoding and `createImageBitmap`, and add request debouncing/throttling to `handleSearch` in `OsmImporter.tsx`.
- Test coverage: Untested.

## Scaling Limits

**Fixed `150 × 150` DEM Grid Resolution vs. Unbounded Tile Fetching:**
- Current capacity: Terrain elevation is fixed to a maximum of `150 × 150` (`22,500`) grid cells (`src/components/OsmImporter.tsx:707`, `src/App.tsx:211`), while tile fetching scales linearly with bounding box area at zoom `14`–`19` (`src/components/OsmImporter.tsx:615`, `src/lib/satelliteService.ts:53–66`).
- Limit:
  1. Selecting a very large polygon (e.g., > 10 km × 10 km) fires hundreds of concurrent `fetch()` requests via `Promise.all` with no concurrency limit or maximum BBox area guard, saturating browser connections and memory (`fullCanvas` in `satelliteService.ts:76` can exceed browser maximum canvas dimensions of `16,384 × 16,384` px).
  2. Conversely, because the DEM grid is capped at `150 × 150`, a 6 km × 6 km site has only `40m` per grid cell, degrading building base elevation accuracy and 0.25m/0.5m contour fidelity.
- Scaling path: Enforce a maximum selectable polygon area (e.g., `25 km²`) in `OsmImporter.tsx`, cap `numX * numY` tile count in `satelliteService.ts` by dynamically stepping down `zoom` if total tiles exceed `64` (`8 × 8`), and use a concurrency limiter (`p-limit` pattern) for tile downloads.

## Dependencies at Risk

**`three-stdlib` (`^2.36.1`) Paired with `three` (`^0.184.0`):**
- Risk: `package.json` pairs a very recent `three` (`^0.184.0`) with `three-stdlib` (`^2.36.1`). `three-stdlib` re-bundles Three.js examples (`OrbitControls`, `GLTFExporter`, `OBJExporter`, `STLExporter`, `PLYLoader`, `FBXLoader`) that frequently lag behind internal `THREE.BufferGeometry` and `THREE.Material` API changes in newer `three` releases.
- Files: `package.json` (lines 29–30), `src/lib/exportService.ts` (line 2), `src/components/ThreeTerrainViewer.tsx` (line 3), `src/components/ContourViewer.tsx` (line 1146), `src/lib/meshProcessor.ts` (line 2)
- Impact: Potential runtime errors in `GLTFExporter` / `OBJExporter` or duplicate Three.js module instances when upgrading `three`.
- Migration plan: Replace `three-stdlib` imports with official `three/examples/jsm/...` (or `three/addons/...`) paths included directly inside the `three` package, which are guaranteed to match `three@0.184.0`.

## Missing Critical Features

**advertised `.PLY`/`.FBX` Local Import and `.SVG` Export Buttons Missing from UI:**
- Problem: `README.md` (lines 16, 47, 91, 95) documents local `.PLY`/`.FBX` mesh import and clean `.SVG` vector sheet export (`topografia_*.svg`), and `src/lib/meshProcessor.ts` contains the parser implementation, but neither feature has a trigger button in `src/App.tsx` or `src/components/ContourViewer.tsx`.
- Files: `src/App.tsx`, `src/components/ContourViewer.tsx`, `src/lib/meshProcessor.ts`, `README.md`
- Blocks: Users cannot upload custom drone/photogrammetry `.ply`/`.fbx` meshes or export `.svg` vector sheets directly for Illustrator/Inkscape without using browser DevTools.

**Cosmetic CRS Input (`EPSG:32633`) Not Connected to Georeferencing or Exports:**
- Problem: The `Sistema de Referencia (CRS)` text input (`crs` state, defaulting to `'EPSG:32633'` in `src/App.tsx:45, 688–700`) is never used in any projection, `.jgw` worldfile, or `.dxf` export. All metric projections use a local equirectangular approximation (`111320 * Math.cos(lat)`), and `.jgw` worldfiles (`src/lib/satelliteService.ts:182–191`) always output unprojected WGS84 decimal degrees (`EPSG:4326`).
- Files: `src/App.tsx` (lines 45, 688–700), `src/lib/satelliteService.ts` (lines 182–191), `src/components/ContourViewer.tsx` (lines 978–991)
- Blocks: GIS professionals importing `.jgw` or `.dxf` into QGIS/AutoCAD Civil 3D expecting UTM coordinates matching the selected `CRS` (`EPSG:32633` / `EPSG:32718` / `EPSG:32719` for Chile) receive local meter offsets `(0..w, 0..h)` for `.dxf` and `EPSG:4326` degrees for `.jgw`.

**No Local Session Persistence (IndexedDB / LocalStorage):**
- Problem: All application state (`meshData`, `customLotPts`, `ogucParams`, `solarParams`) lives exclusively in volatile React memory.
- Files: `src/App.tsx` (lines 43–116)
- Blocks: Accidental page reload (`F5`) or browser tab closure destroys the extracted terrain and drawn lot unless the user manually downloaded a `.geoarc` file beforehand.

## Test Coverage Gaps

**Zero Automated Test Suite Across All Geometric, Astronomical, and Normative Engines:**
- What's not tested: There is no test runner (`vitest`) configured in `package.json` and zero `*.test.ts` / `*.spec.ts` files in the repository. Critical pure algorithms have no automated verification:
  1. Normative OGUC geometry & clipping (`insetPolygonBisector`, `classifyEdgeOrientation`, `computeOgucModel`, `clipSegmentToBBox`, `clipWayToBBox`, `normalizeOsmElementsToGeom` in `src/lib/ogucService.ts`).
  2. Solar position mechanics (`getSunPosition` in `src/lib/SunPosition.ts`).
  3. Polygon area, perimeter, and centroid calculations (`calculatePolygonMetrics` in `src/components/OsmImporter.tsx`).
  4. 3D scene and CAD export scale/coordinate integrity (`buildThreeSceneFromMeshData`, `exportToObjZip`, `exportToGlb` in `src/lib/exportService.ts`, and `handleExportDXF` in `src/components/ContourViewer.tsx`).
- Files: `src/lib/ogucService.ts`, `src/lib/SunPosition.ts`, `src/components/OsmImporter.tsx`, `src/lib/exportService.ts`, `src/components/ContourViewer.tsx`
- Risk: Regressions in coordinate orientation (North/South Y-axis inversion between SVG, WebGL, and DXF), setback math, or OGUC shadow compliance ratios go unnoticed until manual CAD import testing.
- Priority: High

---

*Concerns audit: 2026-10-28*
