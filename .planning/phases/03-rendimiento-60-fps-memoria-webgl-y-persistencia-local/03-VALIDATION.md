---
phase: "03"
slug: "03-rendimiento-60-fps-memoria-webgl-y-persistencia-local"
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-29"
---

# Phase 03 — Validation Strategy: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local

> Per-phase validation contract for feedback sampling during execution. Ensures that rendering performance (60 FPS), WebGL GPU memory disposal, IndexedDB persistence, and DEM extraction optimizations are verified with sub-10s automated feedback loops.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript Compiler (`tsc --noEmit`) + `npx tsx` deterministic assertions + Vite production bundler (`vite build`) |
| **Config file** | `tsconfig.json` |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run lint && npm run build` |
| **Estimated runtime** | ~10 seconds |

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
| 03-01-01 | 01 | 1 | PERF-02 | T-03-01 | Decouple 3D solar raymarching from 2.5D SVG render loop using `useMemo` hooks (`buildingSolarShadows3D`, `projectSolarShadow3D`); remove orphaned `terrainCurtains` | unit/perf | `npm run lint` + `npx tsx` memoization & AST assertion | ✅ (`src/components/ContourViewer.tsx`) | ⬜ pending |
| 03-01-02 | 01 | 1 | PERF-03 | T-03-02 | Recursive WebGL GPU memory disposal (`disposeObjectTree`) traversing geometries, materials and textures before `scene.remove()` and upon unmount | unit/lifecycle | `npm run lint` + `npx tsx` Three.js disposal assertion | ✅ (`src/components/ThreeTerrainViewer.tsx`) | ⬜ pending |
| 03-02-01 | 02 | 2 | PERF-01 | T-03-03 | Pure TypeScript IndexedDB client storage service (`geoarc_db` / `project_session`) with quota handling and graceful private-mode fallback | unit/storage | `npm run lint` + `npx tsx` storage contract assertion | ❌ Wave 0 (`src/lib/storageService.ts`) | ⬜ pending |
| 03-02-02 | 02 | 2 | PERF-01 | T-03-03, T-03-04 | React session integration with 500ms debounce, mount restoration without overwrite loop, "Nueva Sesión" confirmation modal, and restore toast in `App.tsx` | component/UI | `npm run lint && npm run build` | ✅ (`src/App.tsx`) | ⬜ pending |
| 03-02-03 | 02 | 2 | PERF-04 | T-03-04 | Single-pass aspect DEM extraction in `OsmImporter.tsx` / `App.tsx`, deletion of dummy simulation button (`handleSimulateProcess`), and elimination of orphaned states (`osmDataRaw`) | integration/perf | `npm run lint && npm run build` | ✅ (`src/components/OsmImporter.tsx`, `src/App.tsx`) | 0 pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- `src/lib/storageService.ts` — Native client-side storage service encapsulating IndexedDB database opening (`geoarc_db` v1), object store (`project_session`), session key (`active_project`), and typed methods `saveSession`, `loadSession`, `clearSession`.
- Zero new external dependencies required: `three`, `react`, `d3`, `fast-png`, and `lucide-react` are already installed and verified in `package.json`.

---

## Manual-Only Verifications

*All phase behaviors have automated verification via `npx tsx` deterministic lifecycle and AST assertions, `npm run lint` (typecheck), and `npm run build` (production Vite bundle).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter once plans are verified

**Approval:** pending
