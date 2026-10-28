---
last_mapped_commit: bc98eb591951bb810fb9d4da1e8e5ef5b526257a
last_mapped_at: 2026-10-28
---
<!-- refreshed: 2026-10-28 -->
# Testing Patterns

**Analysis Date:** 2026-10-28

## Test Framework

**Runner:**
- Automated test runner: Not detected in `package.json` (no `vitest`, `jest`, or `@playwright/test` currently installed).
- Static verification runner: TypeScript compiler (`typescript` `~5.8.2`) configured via `tsconfig.json`.
- Build verification runner: Vite (`vite` `^6.2.0`) configured via `vite.config.ts`.
- Recommended runner when adding automated tests: **Vitest** (native compatibility with `vite.config.ts`, ESModules `"type": "module"`, and path alias `@/*`).

**Assertion Library:**
- Not currently installed. Use Vitest's built-in `expect` API when introducing unit tests.

**Run Commands:**
```bash
npm run lint           # Static type-checking verification (tsc --noEmit)
npm run build          # Production bundle verification (vite build)
npm run dev            # Interactive development server on http://localhost:3000 (with /api/overpass proxy)
```

When Vitest is added to `package.json`:
```bash
npx vitest run         # Run all unit tests once
npx vitest             # Watch mode
npx vitest run --coverage # Coverage report
```

## Test File Organization

**Location:**
- No `*.test.ts` or `*.spec.ts` files are currently present in `src/`.
- Place new unit tests co-located alongside the domain services in `src/lib/` or in a dedicated `src/lib/__tests__/` directory.

**Naming:**
- Use `<moduleName>.test.ts` for pure TypeScript mathematical, geometric, and GIS service tests.
- Use `<ComponentName>.test.tsx` for React component tests.

**Structure:**
```text
src/
├── lib/
│   ├── SunPosition.ts
│   ├── SunPosition.test.ts        # Astronomical azimuth/elevation unit tests
│   ├── ogucService.ts
│   ├── ogucService.test.ts        # Polygon inset, Liang-Barsky clipping, & OGUC envelope tests
│   ├── meshProcessor.ts
│   ├── meshProcessor.test.ts      # PLY/FBX vertex grid interpolation & hole-filling tests
│   ├── exportService.ts
│   └── satelliteService.ts
└── components/
    ├── OsmImporter.tsx
    ├── ThreeTerrainViewer.tsx
    └── ContourViewer.tsx
```

## Test Structure

**Suite Organization:**
Pure domain modules in `src/lib/` are already structured as deterministic, side-effect-free functions that accept plain TypeScript objects and return typed results. Structure test suites around these exported functions:

```typescript
import { describe, it, expect } from 'vitest';
import { getSunPosition } from './SunPosition';
import {
  getRegionRasanteInfo,
  insetPolygonBisector,
  clipSegmentToBBox,
  computeOgucModel,
} from './ogucService';

describe('getSunPosition (src/lib/SunPosition.ts)', () => {
  it('computes winter solstice noon sun position in Santiago (-33.4489, -70.6693)', () => {
    const date = new Date('2024-06-21T12:00:00');
    const pos = getSunPosition(-33.4489, -70.6693, date, 12.0);

    // In Southern Hemisphere winter, sun at solar noon is due North (~0/360 deg)
    // with elevation around 90 - 33.45 - 23.45 = ~33.1 deg
    expect(pos.elevation).toBeGreaterThan(28);
    expect(pos.elevation).toBeLessThan(36);
  });
});

describe('ogucService geometry helpers (src/lib/ogucService.ts)', () => {
  it('clips a 2D segment against a bounding box using Liang-Barsky', () => {
    const p1 = { lon: -70.68, lat: -33.45 };
    const p2 = { lon: -70.64, lat: -33.45 };
    const clipped = clipSegmentToBBox(p1, p2, -70.67, -70.65, -33.46, -33.44);

    expect(clipped).not.toBeNull();
    expect(clipped!.c1.lon).toBeCloseTo(-70.67, 5);
    expect(clipped!.c2.lon).toBeCloseTo(-70.65, 5);
  });

  it('returns null when inset offset collapses a narrow polygon', () => {
    const narrowLot = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    // 50m setback on a small lot should collapse and return null
    const res = insetPolygonBisector(narrowLot, 50, undefined, 150);
    expect(res).toBeNull();
  });
});
```

**Patterns:**
- **Floating-point assertions:** Always use `expect(val).toBeCloseTo(expected, precision)` for trigonometric, Web Mercator tile, and 3D coordinate assertions (`src/lib/SunPosition.ts`, `src/lib/ogucService.ts`, `src/components/OsmImporter.tsx`).
- **Degenerate geometry assertions:** Explicitly test boundary conditions where functions return `null` or `{ collapsed: true }` (e.g., `pts.length < 3`, zero-area bounding boxes, or setbacks exceeding half the lot span in `computeOgucModel` at `src/lib/ogucService.ts:386-408`).

## Mocking

**Framework:** Use `vi.fn()` and `vi.stubGlobal('fetch', ...)` from `vitest` when testing network-dependent services.

**Patterns:**
```typescript
import { vi, describe, it, expect, afterEach } from 'vitest';
import { fetchOsmLayersForBBox } from './ogucService';

describe('fetchOsmLayersForBBox fallback chain', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to /api/overpass when official OSM v0.6 API fails', async () => {
    const fetchMock = vi.fn()
      // 1st call: official OSM API v0.6 fails
      .mockRejectedValueOnce(new Error('OSM v0.6 timeout'))
      // 2nd call: local Vite proxy succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'way',
              id: 101,
              tags: { building: 'yes', 'building:levels': '3' },
              geometry: [
                { lat: -33.45, lon: -70.66 },
                { lat: -33.451, lon: -70.66 },
                { lat: -33.451, lon: -70.661 },
              ],
            },
          ],
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchOsmLayersForBBox({
      minLat: -33.46,
      maxLat: -33.44,
      minLon: -70.67,
      maxLon: -70.65,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res?.elements).toHaveLength(1);
    expect(res?.elements[0].tags.building).toBe('yes');
  });
});
```

**What to Mock:**
- External HTTP requests (`fetch`) to:
  - `https://api.openstreetmap.org/api/0.6/map.json` and Overpass mirrors in `src/lib/ogucService.ts`
  - `https://nominatim.openstreetmap.org/search` and `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/...` in `src/components/OsmImporter.tsx`
  - `https://server.arcgisonline.com/...` and `https://mt1.google.com/...` in `src/lib/satelliteService.ts`
- Browser DOM/Canvas APIs (`document.createElement('canvas')`, `URL.createObjectURL`, `URL.revokeObjectURL`, `createImageBitmap`) when testing `src/lib/satelliteService.ts` and `triggerBrowserDownload` in `src/lib/exportService.ts`.
- WebGL context creation (`THREE.WebGLRenderer`) when mounting `src/components/ThreeTerrainViewer.tsx` in a headless JSDOM environment.

**What NOT to Mock:**
- Pure geometry and math engines (`getSunPosition` in `src/lib/SunPosition.ts`, `computeOgucModel`, `insetPolygonBisector`, `convexHull3D`, `clipSegmentToBBox`, `clipWayToBBox`, `normalizeOsmElementsToGeom` in `src/lib/ogucService.ts`, `calculatePolygonMetrics` in `src/components/OsmImporter.tsx`).
- Three.js scene graph construction (`buildThreeSceneFromMeshData` in `src/lib/exportService.ts`) — `THREE.Scene`, `THREE.PlaneGeometry`, and `THREE.ExtrudeGeometry` run in Node/Vitest without needing a WebGL context.
- Binary compression (`fflate.zipSync`, `fflate.strToU8`) and `OBJExporter` in `src/lib/exportService.ts`.

## Fixtures and Factories

**Test Data & Built-in Synthetic Fallbacks:**
The codebase includes a deterministic pseudo-random terrain generator in `src/components/ContourViewer.tsx:129-170` used when `meshData` is `undefined`, seeded by `fileName`. For unit tests requiring a `MeshData` fixture, use a factory helper:

```typescript
import type { MeshData } from '../lib/meshProcessor';

export function createMockMeshData(overrides: Partial<MeshData> = {}): MeshData {
  const cols = overrides.cols ?? 20;
  const rows = overrides.rows ?? 20;
  const minEv = overrides.minEv ?? 100;
  const maxEv = overrides.maxEv ?? 120;
  // Flat or gently sloped synthetic elevation grid
  const grid = Array.from({ length: cols * rows }, (_, idx) => {
    const r = Math.floor(idx / cols);
    return minEv + (r / Math.max(1, rows - 1)) * (maxEv - minEv);
  });

  return {
    grid,
    minEv,
    maxEv,
    w: 200,
    h: 200,
    size: Math.max(cols, rows),
    cols,
    rows,
    bbox: {
      minLat: -33.4500,
      maxLat: -33.4482,
      minLon: -70.6700,
      maxLon: -70.6678,
    },
    buildings: { elements: [] },
    ...overrides,
  };
}
```

**Session State Fixtures (`.geoarc`):**
- Full application state (terrain grid, OGUC parameters, custom lot polygon, solar date/time, and layer visibility) can be exported and re-imported as JSON `.geoarc` files via `handleExportGeoarc` and `handleImportGeoarc` in `src/App.tsx:330-449`. Use saved `.geoarc` JSON snapshots for manual regression testing across all three analysis modes (`topographic`, `oguc`, `solar`).

## Coverage

**Requirements:** None enforced currently.

**Priority Targets for Unit Test Coverage:**
1. `src/lib/ogucService.ts` — Normative Chilean urban calculations (`getRegionRasanteInfo`, `insetPolygonBisector`, `classifyEdgeOrientation`, `computeOgucModel`, `clipSegmentToBBox`, `clipWayToBBox`, `normalizeOsmElementsToGeom`).
2. `src/lib/SunPosition.ts` — Solar declination, equation of time, elevation, and quadrant-corrected azimuth (`getSunPosition`).
3. `src/components/OsmImporter.tsx` — Geodesic polygon area, perimeter, and centroid calculation (`calculatePolygonMetrics`, `formatArea`, `formatDistance`).
4. `src/lib/meshProcessor.ts` — `.ply` / `.fbx` parsing, Y-up vs. Z-up axis heuristic detection, iterative hole-filling, and 3x3 smoothing (`processMeshFile`).
5. `src/lib/exportService.ts` — 3D scene generation (`buildThreeSceneFromMeshData`) and `.obj`/`.mtl` ZIP packaging (`exportToObjZip`).

## Test Types

**Unit Tests:**
- Target pure TypeScript functions in `src/lib/` and exported calculation helpers in `src/components/OsmImporter.tsx`.
- Fast execution (<50ms), zero network calls, deterministic inputs.

**Integration Tests:**
- Test the pipeline from raw OSM/Terrarium responses (`normalizeOsmElementsToGeom` + DEM bilinear interpolation in `src/App.tsx:177-328`) into `computeOgucModel` (`src/lib/ogucService.ts`) and `buildThreeSceneFromMeshData` (`src/lib/exportService.ts`).
- Verify Vite's custom dev middleware `overpassProxyPlugin` in `vite.config.ts:6-104` by sending POST requests to `/api/overpass` with `data=...` or JSON bodies.

**E2E / Manual Verification Workflow:**
- Currently performed interactively via `npm run dev` using the built-in city presets (`Santiago`, `Concepción`, `Temuco`, `Valparaíso`, `Puerto Montt` in `src/components/OsmImporter.tsx:1035-1041` and `src/App.tsx:604-613`) and verifying:
  1. Polygon drawing (Regular, Irregular, Point) and live area/perimeter HUD in `src/components/OsmImporter.tsx`.
  2. Terrain extraction (AWS Terrarium DEM + OSM buildings/highways/waterways + Esri satellite orthophoto).
  3. Dual viewer synchronization between `src/components/ThreeTerrainViewer.tsx` (`realistic` mode) and `src/components/ContourViewer.tsx` (`technical` SVG mode).
  4. File exports (`.glb`, `.obj` ZIP, `.jpg` + `.jgw`, `.dxf`, `.stl`, `.svg`, `.geoarc`).

## Common Patterns

**Async & File Buffer Testing:**
```typescript
import { describe, it, expect } from 'vitest';
import { processMeshFile } from './meshProcessor';

describe('processMeshFile (src/lib/meshProcessor.ts)', () => {
  it('rejects unsupported file extensions with a descriptive Spanish error', async () => {
    const fakeObjFile = new File(['v 0 0 0'], 'terreno.obj', { type: 'text/plain' });
    await expect(processMeshFile(fakeObjFile)).rejects.toThrow(
      'Formato no soportado. Por favor sube un archivo en formato FBX o PLY.'
    );
  });
});
```

**Error & Edge-Case Testing:**
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeOsmElementsToGeom } from './ogucService';

describe('normalizeOsmElementsToGeom edge cases', () => {
  it('returns null on malformed or empty payloads', () => {
    expect(normalizeOsmElementsToGeom(null)).toBeNull();
    expect(normalizeOsmElementsToGeom({})).toBeNull();
  });

  it('reconstructs way geometry from node references in OSM v0.6 format', () => {
    const osmV06Payload = {
      elements: [
        { type: 'node', id: 1, lat: -33.45, lon: -70.66 },
        { type: 'node', id: 2, lat: -33.451, lon: -70.66 },
        { type: 'node', id: 3, lat: -33.451, lon: -70.661 },
        { type: 'way', id: 10, nodes: [1, 2, 3], tags: { building: 'residential' } },
      ],
    };

    const result = normalizeOsmElementsToGeom(osmV06Payload);
    expect(result?.elements).toHaveLength(1);
    expect(result?.elements[0].geometry).toEqual([
      { lat: -33.45, lon: -70.66 },
      { lat: -33.451, lon: -70.66 },
      { lat: -33.451, lon: -70.661 },
    ]);
  });
});
```

---

*Testing analysis: 2026-10-28*
