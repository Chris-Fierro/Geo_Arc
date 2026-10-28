---
last_mapped_commit: bc98eb591951bb810fb9d4da1e8e5ef5b526257a
last_mapped_at: 2026-10-28
---
<!-- refreshed: 2026-10-28 -->
# Technology Stack

**Analysis Date:** 2026-10-28

## Languages

**Primary:**
- TypeScript `~5.8.2` - All application source code (`src/App.tsx`, `src/main.tsx`, `src/components/*.tsx`, `src/lib/*.ts`) and build/proxy configuration (`vite.config.ts`)

**Secondary:**
- CSS3 (with Tailwind CSS v4 `@theme` directives and CSS custom properties) - Design tokens, light/dark themes, and custom scrollbars (`src/index.css`)
- HTML5 - Application entry shell (`index.html`)
- Python (Template generation only) - Pedagogical GIS script template (`trimesh`, `numpy`, `geopandas`, `shapely`, `scipy`, `matplotlib`) generated as text in `src/lib/templates.ts` (not executed by the runtime)

## Runtime

**Environment:**
- Browser (ES2022, DOM, WebGL 2.0, HTML5 Offscreen/2D Canvas, File & Blob APIs) - Primary execution environment for all GIS, 3D rendering, solar geometry, and CAD export operations
- Node.js `>=18` (`v24.18.1` detected locally; `@types/node` `^22.14.0`) - Runs the Vite development server, build pipeline, and custom Overpass API proxy middleware (`vite.config.ts`)

**Package Manager:**
- npm (`11.12.0` detected locally)
- Lockfile: `package-lock.json` present (`lockfileVersion: 3`)

## Frameworks

**Core:**
- React `^19.0.0` & React DOM `^19.0.0` - Declarative UI component tree, hooks-based state management, and portal rendering (`src/main.tsx`, `src/App.tsx`, `src/components/OsmImporter.tsx`)
- Three.js `^0.184.0` (`three`, `@types/three` `^0.184.0`, `three-stdlib` `^2.36.1`) - Real-time WebGL 3D terrain rendering, OrbitControls, building footprint extrusion, directional sunlight shadow mapping, 3D Heliodon sun paths, and CAD/3D mesh loaders/exporters (`src/components/ThreeTerrainViewer.tsx`, `src/lib/exportService.ts`, `src/lib/meshProcessor.ts`, `src/components/ContourViewer.tsx`)
- D3.js `^7.9.0` (`d3`, `@types/d3` `^7.4.3`) - Topographic isoline computation (`d3.contours`), GeoJSON path projection (`d3.geoPath`), SVG pan/zoom interaction (`d3.zoom`), and hypsometric/thermal color interpolation (`src/components/ContourViewer.tsx`)
- Leaflet `^1.9.4` & React-Leaflet `^5.0.0` (`leaflet`, `react-leaflet`, `@types/leaflet` `^1.9.21`) - Interactive 2D slippy map, multi-provider tile switching, and regular/irregular polygon lot drawing (`src/components/OsmImporter.tsx`)
- Tailwind CSS `^4.1.14` (`tailwindcss`, `@tailwindcss/vite`) - Utility-first CSS framework integrated directly as a Vite plugin (`vite.config.ts`, `src/index.css`)

**Testing:**
- Not detected (No unit or E2E test runner is configured in `package.json`)

**Build/Dev:**
- Vite `^6.2.0` (`vite`, `@vitejs/plugin-react` `^5.0.4`) - ES module dev server (`port=3000`, `host=0.0.0.0`), production bundler, and Connect middleware host for `/api/overpass` (`vite.config.ts`)
- TypeScript `~5.8.2` - Static type checker invoked via `npm run lint` (`tsc --noEmit`) (`tsconfig.json`, `package.json`)
- `tsx` `^4.21.0` - Installed in `devDependencies` for TypeScript execution (`package.json`)
- `autoprefixer` `^10.4.21` - Installed in `devDependencies` (`package.json`)

## Key Dependencies

**Critical:**
- `three` (`^0.184.0`) & `three-stdlib` (`^2.36.1`) - Provides core 3D scene graph (`THREE.Scene`, `THREE.PlaneGeometry`, `THREE.ExtrudeGeometry`, `THREE.WebGLRenderer`), camera controls (`OrbitControls` in `src/components/ThreeTerrainViewer.tsx`), 3D exporters (`OBJExporter`, `GLTFExporter` in `src/lib/exportService.ts`; `STLExporter` in `src/components/ContourViewer.tsx`), and local mesh parsers (`PLYLoader`, `FBXLoader` in `src/lib/meshProcessor.ts`)
- `d3` (`^7.9.0`) - Generates topographic contour MultiPolygons from 1D elevation arrays and manages interactive SVG coordinate transformations (`src/components/ContourViewer.tsx`)
- `leaflet` (`^1.9.4`) & `react-leaflet` (`^5.0.0`) - Powers geospatial search visualization, bounding box selection, and real-time polygon area/perimeter/centroid metrics (`src/components/OsmImporter.tsx`)
- `fast-png` (`^8.0.0`) - Decodes 24-bit RGB PNG elevation tiles (`decode(ArrayBuffer)`) fetched from AWS Terrarium into raw pixel channel arrays in the browser (`src/components/OsmImporter.tsx`)
- `fflate` (`^0.8.2`) - Compresses multi-file 3D exports (`.obj`, `.mtl`, `.jpg` orthophoto, `.jgw` worldfile, and `.txt` instructions) into a single downloadable `.zip` archive in memory (`fflate.zipSync`, `fflate.strToU8` in `src/lib/exportService.ts`)
- `motion` (`^12.23.24`) - Imported as `motion/react` for smooth layout transitions, collapsible sidebars, tooltips, and modal overlays (`src/App.tsx`, `src/components/OsmImporter.tsx`)
- `lucide-react` (`^0.546.0`) - Provides UI iconography across all toolbars and HUD overlays (`src/App.tsx`, `src/components/OsmImporter.tsx`, `src/components/ThreeTerrainViewer.tsx`, `src/components/ContourViewer.tsx`)

**Infrastructure / Provisioned (Currently Unused in `src/`):**
- `@google/genai` (`^1.29.0`) - Listed in `package.json` `dependencies` with `process.env.GEMINI_API_KEY` defined in `vite.config.ts`, but not imported by any module under `src/`
- `express` (`^4.21.2`) & `@types/express` (`^4.17.21`) - Listed in `package.json`, though backend proxying is handled directly by Vite's built-in Connect server middleware in `vite.config.ts`
- `dotenv` (`^17.2.3`) - Listed in `package.json`; environment loading uses Vite's `loadEnv` in `vite.config.ts`

## Configuration

**Environment:**
- Configured via Vite's `loadEnv(mode, '.', '')` in `vite.config.ts` (lines 106–112)
- `.env.example` is present in the repository root; `.env*` files (except `.env.example`) are ignored via `.gitignore`
- Environment variables consumed in `vite.config.ts`:
  - `GEMINI_API_KEY`: Injected at build/dev time into `process.env.GEMINI_API_KEY` (`vite.config.ts` line 111)
  - `DISABLE_HMR`: Disables Vite Hot Module Replacement when set to `'true'` (`vite.config.ts` line 119)

**Build:**
- `vite.config.ts` - Configures React (`@vitejs/plugin-react`), Tailwind CSS v4 (`@tailwindcss/vite`), custom `overpassProxyPlugin()` middleware (`POST /api/overpass`), `@` path alias mapped to project root (`.`), and HMR server options
- `tsconfig.json` - Targets `ES2022` with `DOM` and `DOM.Iterable` libs, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`, `"allowImportingTsExtensions": true`, `"noEmit": true`, and path alias `"@/*": ["./*"]`
- `package.json` - ESM package (`"type": "module"`) defining scripts:
  - `npm run dev` → `vite --port=3000 --host=0.0.0.0`
  - `npm run build` → `vite build`
  - `npm run preview` → `vite preview`
  - `npm run clean` → `rm -rf dist`
  - `npm run lint` → `tsc --noEmit`

## Platform Requirements

**Development:**
- Node.js `>=18` and `npm`
- Modern web browser supporting WebGL 2.0, `createImageBitmap`, HTML5 `<canvas>`, and ES2022 (`Promise.any`, `ResizeObserver`)
- Active internet connection to reach public GIS endpoints (AWS S3 Terrain Tiles, OpenStreetMap API v0.6, Overpass API, Nominatim, Esri World Imagery, Google Satellite tiles, and Google Fonts)

**Production:**
- Compiles to static assets in `dist/` (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`) deployable to any static host or Node server
- When deployed as a pure static bundle without the Vite dev server middleware (`/api/overpass`), `fetchOsmLayersForBBox` in `src/lib/ogucService.ts` automatically uses direct CORS requests to OpenStreetMap API v0.6 (`map.json`) and public Overpass API mirrors

---

*Stack analysis: 2026-10-28*
