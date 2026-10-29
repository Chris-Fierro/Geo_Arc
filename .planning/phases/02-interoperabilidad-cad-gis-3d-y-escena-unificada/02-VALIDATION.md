---
phase: "02"
slug: "02-interoperabilidad-cad-gis-3d-y-escena-unificada"
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-28"
---

# Phase 02 — Validation Strategy: Interoperabilidad CAD / GIS / 3D y Escena Unificada

> Per-phase validation contract for feedback sampling during execution. Ensures that CAD, GIS, 3D and UI requirements are verified with sub-10s automated feedback loops.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript Compiler (`tsc --noEmit`) + `npx tsx` deterministic mathematical & geometric assertions |
| **Config file** | `tsconfig.json` |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run lint && npm run build` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint` + task-specific `npx tsx` deterministic assertion command
- **After every plan wave:** Run `npm run lint && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green with zero TypeScript diagnostics and zero Vite compilation errors
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CAD-03 | T-02-01 | Snyder WGS84 Transverse Mercator (UTM 18S, 19S, 33N, EPSG:4326) with bounded latitudes and 6-line affine Worldfile `.JGW` matrix | unit | `npx tsx` CRS & JGW assertion + `npm run lint` | ❌ Wave 0 (`src/lib/crsService.ts`) | ⬜ pending |
| 02-01-02 | 01 | 1 | CAD-01, CAD-03 | T-02-02 | DXF generator in `exportService.ts` with `clipWayToBBox`, relation multipolygons in `BUILDINGS`, bilinear Z, and CRS UTM coords | unit/integration | `npx tsx` DXF clipping & bilinear Z assertion + `npm run lint` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | CAD-02, QUAL-02 | T-02-05 | Unified `buildThreeSceneFromMeshData` shared by `ThreeTerrainViewer`, `.GLB`, `.OBJ`, and `.STL` (`STLExporter`) with identical Z normalization `(elev - minEv) * zExaggeration` and 0.35m slope embedding | unit/3D | `npx tsx` Three.js scene & STL assertion + `npm run lint` | ✅ | ⬜ pending |
| 02-02-02 | 02 | 2 | CAD-04 | T-02-03, T-02-04 | Local `.PLY`/`.FBX` mesh upload in `App.tsx` sidebar with 50MB bound; CRS `<select>` dropdown; semantic SVG vector sheet export button in `ContourViewer.tsx` HUD | component/integration | `npm run lint && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- `src/lib/crsService.ts` — Pure TypeScript cartographic conversion module implementing Snyder (1987) WGS84 Transverse Mercator for `EPSG:32718`, `EPSG:32719`, `EPSG:32633`, `EPSG:4326`, `projectPointToCrs`, and `generateWorldFileForCrs`.
- Zero new external dependencies required: `three`, `three-stdlib`, `d3`, `fflate`, and `lucide-react` are already installed and verified in `package.json`.

---

## Manual-Only Verifications

*All phase behaviors have automated verification via `npx tsx` geometric/cartographic assertions, `npm run lint` (typecheck), and `npm run build` (production Vite bundle).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter once plans are verified

**Approval:** pending
