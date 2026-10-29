---
phase: "04"
slug: "04-suite-de-pruebas-vitest-seguridad-e-higiene-de-arquitectura"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-29"
---

# Phase 04 — Validation Strategy: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura

> Per-phase validation contract for feedback sampling during execution. Ensures that mathematical normative motors, solar calculations, CRS/UTM reprojections, CAD/3D exporters, `.geoarc` payload validation, Overpass proxy guards, and dependency hygiene are verified with sub-10s automated feedback loops.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^3.2.7` + TypeScript Compiler (`tsc --noEmit`) + Vite production bundler (`vite build`) |
| **Config file** | `vitest.config.ts` & `tsconfig.json` |
| **Quick run command** | `npx vitest run tests/crs.test.ts` |
| **Full suite command** | `npm test && npm run lint && npm run build` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run task-specific `npx vitest run tests/<file>.test.ts` or `npm run lint` assertion
- **After every plan wave:** Run `npm test && npm run lint && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green (5/5 test files passing with 100% assertions), zero TypeScript diagnostics, and zero Vite compilation errors
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | QUAL-03 | T-04-01, T-04-02 | Blindaje del proxy `/api/overpass` con límite estricto de 64 KB, HTTP 413, User-Agent `GeoArc/1.4`, y remoción de `GEMINI_API_KEY` en `vite.config.ts` | security/middleware | `node -e "import('./vite.config.ts'); console.log('CONFIG OK')"` + AST guard check | ✅ (`vite.config.ts`) | ⬜ pending |
| 04-01-02 | 01 | 1 | QUAL-03 | T-04-03 | Validación atómica y sanitización de esquemas `.geoarc` en `src/lib/geoarcValidator.ts` y consumo seguro en `handleImportGeoarc` (`src/App.tsx`) | unit/validation | `npm run lint` + `node -e "import('./src/lib/geoarcValidator.ts'); console.log('VALIDATOR OK')"` | ❌ Wave 0 (`src/lib/geoarcValidator.ts`) | ⬜ pending |
| 04-01-03 | 01 | 1 | QUAL-03 | T-04-04, T-04-SC | Purga de dependencias huérfanas en `package.json`, script `clean` multiplataforma (`node -e`), e instalación de `vitest` como devDependency | config/hygiene | `npm run clean && npm run lint` | ✅ (`package.json`) | ⬜ pending |
| 04-02-01 | 02 | 2 | QUAL-01 | T-04-SC | Configuración de `vitest.config.ts` en entorno node con alias `@` y scripts `"test"` / `"test:watch"` en `package.json` | test/runner | `npx vitest run --passWithNoTests` | ❌ Wave 0 (`vitest.config.ts`) | ⬜ pending |
| 04-02-02 | 02 | 2 | QUAL-01 | T-04-05, T-04-06 | Implementación exhaustiva de 5 suites unitarias en `tests/` (`oguc`, `solar`, `crs`, `export`, `storage`) | unit/math | `npm test` | ❌ Wave 0 (`tests/*.test.ts`) | ⬜ pending |
| 04-02-03 | 02 | 2 | QUAL-01, QUAL-03 | T-04-01 to T-04-06 | Verificación integral del proyecto: 100% tests unitarios pasando, cero errores TypeScript, y compilación limpia de bundle sin secretos | integration/build | `npm test && npm run lint && npm run build` | ✅ (`src/`, `tests/`) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- `vitest.config.ts` — Archivo de configuración dedicado para Vitest en entorno Node.js con alias `@` apuntando a la raíz del proyecto.
- `src/lib/geoarcValidator.ts` — Módulo puro para validación estricta de esquema y cotas numéricas de archivos `.geoarc`.
- `tests/oguc.test.ts` — Suite de pruebas para `insetPolygonBisector`, lotes cóncavos en L/U, rasantes chilenas y `clipWayToBBox`.
- `tests/solar.test.ts` — Suite de pruebas para `getSunPosition`, husos dinámicos en Chile (UTC-3/UTC-4/Magallanes) y `parseLocalSolarDate`.
- `tests/crs.test.ts` — Suite de pruebas para proyecciones Snyder 1987 WGS84 a UTM (18S, 19S, 33N, 4326) y Worldfile `.JGW`.
- `tests/export.test.ts` — Suite de pruebas para serialización DXF R15, constructor unificado de escena Three.js, lámina SVG y validación `.geoarc`.
- `tests/storage.test.ts` — Suite de pruebas de contrato para `storageService.ts` y fallback ante ausencia de IndexedDB nativo.
- Dependencia `vitest` instalada como `devDependency` en `package.json`.

---

## Manual-Only Verifications

*Todas las verificaciones de la Fase 4 están 100% automatizadas mediante Vitest 3.x (`npm test`), verificación de tipos con TypeScript (`npm run lint`), comprobación de script multiplataforma (`npm run clean`) y empaquetado de producción (`npm run build`).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags in automated commands
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter once plans are verified

**Approval:** pending
