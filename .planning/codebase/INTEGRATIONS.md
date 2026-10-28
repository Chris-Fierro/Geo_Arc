---
last_mapped_commit: bc98eb591951bb810fb9d4da1e8e5ef5b526257a
last_mapped_at: 2026-10-28
---
<!-- refreshed: 2026-10-28 -->
# External Integrations

**Analysis Date:** 2026-10-28

## APIs & External Services

**Digital Elevation Model (DEM):**
- **AWS Terrarium Elevation Tiles (Mapzen Terrain Tiles)** - Extracts real-world topographic elevation grids at zoom levels `14` or `15` depending on bounding box span
  - Endpoint: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
  - Implementation: `src/components/OsmImporter.tsx` (`extractOsmData`, lines 615–706) fetches 256×256 PNG tiles in parallel via `fetch()`, decodes 24-bit RGB channels using `fast-png` (`decode`), decodes elevation in meters using `(R * 256 + G + B / 256) - 32768`, and bilinearly resamples a 150×150 grid (subsequently smoothed in `src/App.tsx`, lines 211–288)
  - Auth: None (Public AWS S3 bucket)

**Urban Context Vector Data (Buildings, Highways, Waterways):**
- **OpenStreetMap API v0.6 (`map.json`)** - Primary low-latency source (~1.5–2.5s via Fastly CDN with CORS) for extracting OSM nodes, ways, and relations within the terrain bounding box
  - Endpoint: `GET https://api.openstreetmap.org/api/0.6/map.json?bbox={minLon},{minLat},{maxLon},{maxLat}`
  - Implementation: `src/lib/ogucService.ts` (`fetchOsmLayersForBBox`, lines 848–870) with a 12-second `AbortController` timeout; raw nodes/ways/relations are normalized into `{ elements }` with resolved vertex coordinates by `normalizeOsmElementsToGeom` (`src/lib/ogucService.ts`, lines 776–832)
  - Auth: None

- **Overpass API (OpenStreetMap Query Service)** - Secondary/fallback source for querying `way["building"]`, `relation["building"]`, `way["highway"]`, and `way["waterway"]` with `[out:json][timeout:25]; ... out geom;`
  - Endpoints:
    - Local Vite proxy: `POST /api/overpass` (`src/lib/ogucService.ts`, lines 881–900; handled by `overpassProxyPlugin` in `vite.config.ts`, lines 6–104)
    - Upstream mirrors (raced in parallel via `Promise.any` in `vite.config.ts` lines 32–37, and queried sequentially as client-side fallback in `src/lib/ogucService.ts` lines 903–928):
      - `https://overpass-api.de/api/interpreter`
      - `https://lz4.overpass-api.de/api/interpreter`
      - `https://z.overpass-api.de/api/interpreter`
      - `https://overpass.kumi.systems/api/interpreter` (used in `vite.config.ts` proxy)
  - Implementation: `src/lib/ogucService.ts` (`fetchOsmLayersForBBox`) and `vite.config.ts` (`overpassProxyPlugin`)
  - Auth: None

**Geocoding & Place Search:**
- **Nominatim (OpenStreetMap Search API)** - Forward geocoding of user-entered city names or street addresses into `[lat, lon]` coordinates
  - Endpoint: `GET https://nominatim.openstreetmap.org/search?format=json&q={encodeURIComponent(searchQuery)}`
  - Implementation: `src/components/OsmImporter.tsx` (`handleSearch`, lines 465–486)
  - Auth: None

**Satellite Orthophoto Imagery & Map Tiles:**
- **Esri World Imagery (ArcGIS Online)** - Primary high-resolution satellite imagery source for both 3D/2D terrain texture stitching (zoom levels `14` to `19`, up to ~0.29 m/pixel) and interactive Leaflet map base layers
  - Endpoint: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
  - Implementation:
    - Orthophoto stitching & cropping: `src/lib/satelliteService.ts` (`fetchSatelliteOrthophoto`, lines 41–202) downloads tiles covering the bounding box in parallel, stitches them onto an HTML5 `<canvas>`, crops to exact Web Mercator subpixel coordinates, resamples to `768px–2048px`, encodes a JPEG (`0.92` quality), and computes a 6-line ESRI `.jgw` Worldfile
    - Interactive basemap layer: `src/components/OsmImporter.tsx` (lines 1078–1085)
  - Auth: None

- **Google Satellite Tiles** - Automatic per-tile fallback when an Esri World Imagery tile fails to load during orthophoto composition
  - Endpoint: `https://mt1.google.com/vt/lyrs=s&x={tx}&y={ty}&z={zoom}`
  - Implementation: `src/lib/satelliteService.ts` (`fetchSatelliteOrthophoto`, lines 92, 104–111)
  - Auth: None

- **OpenStreetMap & OpenTopoMap Basemap Tiles** - Interactive 2D slippy map base layers in sidebar mini-map and expanded lot drawing modal
  - Endpoints:
    - Standard OSM: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (`src/components/OsmImporter.tsx`, lines 805, 1073)
    - OpenTopoMap: `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` (`src/components/OsmImporter.tsx`, lines 813, 1089)
  - Client: `react-leaflet` `<TileLayer />` (`src/components/OsmImporter.tsx`)
  - Auth: None

**CDN Assets:**
- **Unpkg CDN** - Hosts Leaflet default marker pin icons (`marker-icon.png`, `marker-icon-2x.png`, `marker-shadow.png`) in `src/components/OsmImporter.tsx` (lines 18–21)
- **Google Fonts** - Loads `Montserrat` font family (`weights 300, 400, 500, 600, 700`) in `src/index.css` (line 1)

**Provisioned / Unused AI SDK:**
- **Google GenAI SDK (`@google/genai`)** - Listed in `package.json` (`^1.29.0`) with `process.env.GEMINI_API_KEY` injected in `vite.config.ts` (line 111), but not currently called in `src/`

## Vite Dev Proxy Architecture

**Overpass Multi-Mirror Proxy (`overpassProxyPlugin`):**
- Location: `vite.config.ts` (lines 6–104)
- Route: `POST /api/overpass`
- Behavior:
  1. Reads incoming request payload (supports URL-encoded `data=...`, JSON `{ data, query }`, or raw Overpass QL body).
  2. Dispatches parallel `POST` requests via `Promise.any` to four upstream Overpass API endpoints (`overpass-api.de`, `lz4.overpass-api.de`, `z.overpass-api.de`, `overpass.kumi.systems`) with a 25-second `AbortController` timeout per endpoint.
  3. Sends browser-compatible headers (`Referer: https://overpass-turbo.eu/`, `Origin: https://overpass-turbo.eu`, `User-Agent`, `Accept-Language: es-CL,es;q=0.9,en;q=0.8`) to avoid upstream rate-limit blocks.
  4. Validates that the upstream response is HTTP 200 and parses as JSON containing an `elements` array before returning `200 OK` with the first winning payload (or `502 Bad Gateway` if all mirrors fail).

## Data Storage & File Formats

**Databases:**
- None (Stateless client-side application; all state lives in React memory during the session)

**File Storage (Client-Side Import & Export Formats):**
- **Session Project (`.geoarc`)**:
  - Format: JSON file storing full application state (`version: "1.0"`, `topographic`, `oguc`, `solar`, `layers`, `meshData` including elevation grid, OSM buildings, satellite data URL, and custom lot polygon)
  - Implementation: `handleExportGeoarc` and `handleImportGeoarc` in `src/App.tsx` (lines 330–449)
- **AutoCAD 3D DXF (`.dxf`)**:
  - Format: AutoCAD 2000 (`AC1015`) ASCII DXF in real metric units (`$INSUNITS = 6` Meters, `$MEASUREMENT = 1` Metric, `$LUNITS = 2` Decimal) containing 3D `POLYLINE` and `VERTEX` entities organized into layers: `Contours`, `Buildings` (closed polylines), `Highways`, and `Waterways`
  - Implementation: `handleExportDXF` in `src/components/ContourViewer.tsx` (lines 949–1047)
- **3D Printing Solid Mesh (`.stl`)**:
  - Format: Binary STL (`application/octet-stream`) generated from a Three.js scene containing terrain mesh, extruded buildings, road/waterway lines, and contour lines
  - Implementation: `handleExportSTL` and `buildThreeScene` in `src/components/ContourViewer.tsx` (lines 1049–1166) using `STLExporter` from `three-stdlib`
- **Wavefront OBJ + MTL + Orthophoto Package (`*_3d_obj.zip`)**:
  - Format: In-memory compressed ZIP archive (`application/zip`) created via `fflate.zipSync` containing:
    - `<fileName>.obj` (3D terrain mesh + extruded context buildings in meters, prefixed with `mtllib <fileName>.mtl`)
    - `<fileName>.mtl` (Material definitions `Terreno_Satelital_Mat` with `map_Kd textura_satelital.jpg` and `Edificios_Contexto_Mat`)
    - `textura_satelital.jpg` (Cropped high-resolution satellite orthophoto JPEG)
    - `<fileName>.jgw` (ESRI Worldfile for GIS/CAD georeferencing)
    - `LEEME_INSTRUCCIONES_3D.txt` (Import guide for Rhinoceros, Blender, AutoCAD, Revit, 3ds Max, and SketchUp)
  - Implementation: `exportToObjZip` and `buildThreeSceneFromMeshData` in `src/lib/exportService.ts` (lines 18–228, 247–351), triggered from `src/App.tsx` (`handleExportObjZip`, lines 451–469)
- **Binary glTF 2.0 for SketchUp (`*_sketchup.glb`)**:
  - Format: Standalone binary `.glb` (`model/gltf-binary`) at 1:1 metric scale with embedded satellite texture and extruded context buildings for native SketchUp import
  - Implementation: `exportToGlb` in `src/lib/exportService.ts` (lines 356–375) using `GLTFExporter.parseAsync(scene, { binary: true })` from `three-stdlib`, triggered from `src/App.tsx` (`handleExportGlbBinary`, lines 471–488)
- **Georeferenced Satellite Orthophoto (`.jpg` + `.jgw`)**:
  - Format: High-resolution stitched JPEG (`*_ortofoto.jpg`) paired with a 6-line plain-text ESRI Worldfile (`*_ortofoto.jgw`) in WGS84 (`EPSG:4326`) decimal degrees (`xScale`, `0`, `0`, `-yScale`, `minLon + xScale/2`, `maxLat - yScale/2`)
  - Implementation: Generated in `src/lib/satelliteService.ts` (lines 176–192) and downloaded via `handleDownloadOrthophoto` in `src/App.tsx` (lines 490–505)
- **Local 3D Mesh Import (`.ply`, `.fbx`)**:
  - Format: Local polygon/point-cloud files parsed in-browser into a normalized `MeshData` elevation grid with iterative hole-filling and 3×3 box smoothing
  - Implementation: `processMeshFile` in `src/lib/meshProcessor.ts` (lines 20–186) using `PLYLoader` and `FBXLoader` from `three-stdlib`

**Caching:**
- In-memory React state (`meshData` in `src/App.tsx`) caches fetched DEM grids, OSM elements, and satellite data URLs; `useEffect` in `src/App.tsx` (lines 146–165) automatically retries `fetchOsmLayersForBBox` if `meshData.bbox` is present but `meshData.buildings` is missing

## Authentication & Identity

**Auth Provider:**
- None (No user authentication, login, or session identity system; all external GIS APIs used are public and unauthenticated)

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- Browser `console.log`, `console.warn`, and `console.error` diagnostics prefixed with `[GeoArc OSM]` and `[GeoArc Satelital]` (`src/lib/ogucService.ts`, `src/components/OsmImporter.tsx`)

## CI/CD & Deployment

**Hosting:**
- Local development via Vite (`http://localhost:3000`); static bundle build output in `dist/`

**CI Pipeline:**
- None detected (No `.github/workflows/` or CI configuration files in repository)

## Environment Configuration

**Required env vars:**
- None required for core GIS, 3D visualization, OGUC, solar, or CAD export functionality
- Optional:
  - `GEMINI_API_KEY` (injected in `vite.config.ts` line 111)
  - `DISABLE_HMR` (read in `vite.config.ts` line 119)

**Secrets location:**
- Local `.env` file (gitignored via `.gitignore`; `.env.example` template present in repo root)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-10-28*
