---
phase: 04-suite-de-pruebas-vitest-seguridad-e-higiene-de-arquitectura
plan: 01
subsystem: security
tags: [security, proxy, dos-protection, overpass, input-validation, ssrf-prevention, xss-prevention, dependency-hygiene, vitest]

requires:
  - phase: 03-rendimiento-memoria-webgl-y-persistencia-local
    provides: Desasignación recursiva de GPU, servicio de almacenamiento IndexedDB y optimización de extracción DEM en un solo paso
provides:
  - Blindaje DoS en /api/overpass con MAX_BODY_SIZE de 64 KB, HTTP 413 y req.destroy()
  - Cabecera User-Agent legítima GeoArc/1.4 y remoción de GEMINI_API_KEY en client define
  - Módulo puro validateGeoarcPayload con comprobación atómica de grilla, finitud y protocolo de texturas (base64/blob)
  - Integración en handleImportGeoarc (App.tsx) rechazando archivos corruptos o maliciosos sin mutar estado
  - Purga de dependencias huérfanas (@google/genai, express, dotenv, @types/express, tsx) y script clean multiplataforma con fs.rmSync
  - Instalación de vitest ^3.2.7 como devDependency
affects: [04-02-PLAN.md, tests]

actuals:
  tokens: 26796
  tasks: 3
  commits: 3
  plan_head_before: d6dba3affd3c4b829418671f872f13299e5a6f94
  plan_head_after: 69671002f4d664cd486fb2acff1902a5398c4b03

tech-stack:
  added: [vitest@^3.2.7]
  patterns: [Streaming body guard with size threshold and socket destruction, Atomic input validation before state mutation, Native cross-platform Node.js scripts via node -e fs.rmSync]

key-files:
  created:
    - src/lib/geoarcValidator.ts
  modified:
    - vite.config.ts
    - src/App.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Blindar /api/overpass con 64 KB de buffer y HTTP 413 con req.destroy() para mitigar DoS en Node.js dev server"
  - "Eliminar la inyección de GEMINI_API_KEY en define de vite.config.ts para evitar fugas en el cliente de producción"
  - "Crear src/lib/geoarcValidator.ts como función pura para validar esquemas .geoarc de forma determinista y comprobable"
  - "Restringir satelliteTexture en .geoarc a prefijos data:image/jpeg;base64,, data:image/png;base64, o blob: para neutralizar vectores SSRF y XSS"
  - "Remover 5 dependencias huérfanas en package.json y sustituir rm -rf dist por node -e fs.rmSync nativo para compatibilidad multiplataforma"

patterns-established:
  - "Pattern DoS Guard: acumular chunks en streaming con contador y destruir socket inmediatamente al exceder MAX_BODY_SIZE"
  - "Pattern Fail-Fast Validation: validar la totalidad del payload externo antes de ejecutar cualquier setter de estado de React"

requirements-completed: [QUAL-03]

coverage:
  - id: D1
    description: "Blindaje del proxy Overpass con límite de 64 KB, HTTP 413, User-Agent GeoArc/1.4 y remoción de GEMINI define"
    requirement: "QUAL-03"
    verification:
      - kind: other
        ref: "node -e proxy guard & define AST check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Validación atómica y sanitización estricta de archivos .geoarc contra corrupción, SSRF y XSS"
    requirement: "QUAL-03"
    verification:
      - kind: unit
        ref: "node -e validateGeoarcPayload check with valid/corrupt/insecure mocks"
        status: pass
    human_judgment: false
  - id: D3
    description: "Purga de dependencias huérfanas, script clean multiplataforma e instalación de Vitest"
    requirement: "QUAL-03"
    verification:
      - kind: integration
        ref: "npm run clean && npm run lint"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-29
status: complete
---

# Phase 04 Plan 01: Seguridad de Entradas, Servidor de Desarrollo e Higiene de Arquitectura Summary

**Blindaje DoS/413 en proxy Overpass, remoción de secretos en bundle, validación atómica anti-SSRF/XSS de archivos .geoarc e higiene de dependencias con Vitest instalado**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-29T21:11:53Z
- **Completed:** 2026-10-29T21:18:00Z
- **Tasks:** 3
- **Files modified:** 4 (vite.config.ts, src/lib/geoarcValidator.ts, src/App.tsx, package.json / package-lock.json)

## Accomplishments

- **Protección de streaming contra DoS en middleware de desarrollo:** Se implementó un límite estricto de 64 KB (`MAX_BODY_SIZE = 64 * 1024`) en el evento `data` del proxy `/api/overpass`, respondiendo inmediatamente con código HTTP 413 y destruyendo el socket (`req.destroy()`) para evitar saturación de memoria.
- **Cabecera legítima y protección de secretos:** Se configuró `User-Agent: GeoArc/1.4 (Architectural SIG Assistant)` para llamadas upstream a Overpass y se eliminó la directiva `'process.env.GEMINI_API_KEY'` del bloque `define` de `vite.config.ts`, previniendo fugas accidentales en el cliente compilado.
- **Validación atómica y sanitización anti-SSRF/XSS en .geoarc:** Se creó el módulo puro `src/lib/geoarcValidator.ts` que valida dimensiones positivas, enteros de grilla, congruencia `grid.length === cols * rows`, cotas numéricas finitas y restringe texturas satelitales exclusivamente a cadenas base64 seguras (`data:image/jpeg;base64,`, `data:image/png;base64,`) o URLs locales `blob:`. `handleImportGeoarc` en `src/App.tsx` invoca esta validación antes de cualquier llamada a `set*`.
- **Higiene de dependencias y script multiplataforma:** Se purgaron 5 dependencias huérfanas en `package.json` (`@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`) y la entrada duplicada de `vite`, se reemplazó el script `clean` por el comando universal `node -e "fs.rmSync('dist', { recursive: true, force: true })"`, y se incorporó `vitest` `^3.2.7` como `devDependency` con `tsc --noEmit` y `npm run clean` limpios.

## Task Commits

Each task was committed atomically:

1. **Task 1: Blindaje del proxy /api/overpass (límite 64 KB, HTTP 413, User-Agent GeoArc/1.4) y remoción de GEMINI_API_KEY en vite.config.ts (QUAL-03, D-04)** - `8daabfe` (feat)
2. **Task 2: Validación estricta y sanitización de archivos .geoarc en src/lib/geoarcValidator.ts y src/App.tsx (QUAL-03, D-03)** - `dba373a` (feat)
3. **Task 3: Higiene de dependencias en package.json, script clean multiplataforma e instalación de vitest (QUAL-03, D-01, D-04)** - `6967100` (chore)

## Files Created/Modified

- `vite.config.ts` - Proxy Overpass con límite 64 KB, respuesta 413, `req.destroy()`, cabecera `GeoArc/1.4` y remoción de `GEMINI_API_KEY` en `define`.
- `src/lib/geoarcValidator.ts` - Módulo de validación pura `validateGeoarcPayload` para esquemas `.geoarc`.
- `src/App.tsx` - Integración de validación previa en `handleImportGeoarc` impidiendo mutaciones con datos corruptos o URLs remotas.
- `package.json` - Purgado de 5 librerías huérfanas, script `clean` nativo multiplataforma e instalación de `vitest` `^3.2.7`.
- `package-lock.json` - Actualización sincronizada del árbol de módulos.

## Decisions Made

- Imponer límite de 64 KB en streaming en lugar de depender de parsers externos para mantener `vite.config.ts` libre de dependencias pesadas.
- Eliminar por completo el bloque `define` de `GEMINI_API_KEY` en `vite.config.ts` ya que la aplicación es puramente client-side sin llamadas a la API de Gemini en `src/`.
- Modularizar `validateGeoarcPayload` en `src/lib/geoarcValidator.ts` como función pura desacoplada de React para facilitar su reutilización y pruebas unitarias en Plan 02.
- Emplear `node -e "fs.rmSync(...)"` nativo en lugar del paquete `rimraf` para mantener limpio el árbol de dependencias.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All automated assertions, type checks (`tsc --noEmit`), and clean scripts passed cleanly on the first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Entorno preparado con `vitest` instalado y empaquetador saneado para proceder con `04-02-PLAN.md` (configuración de `vitest.config.ts` y suite exhaustiva de pruebas unitarias para `oguc`, `solar`, `crs`, `export`, y `storage`).

---
*Phase: 04-suite-de-pruebas-vitest-seguridad-e-higiene-de-arquitectura*
*Completed: 2026-10-29*

## Self-Check: PASSED
- FOUND FILE: vite.config.ts
- FOUND FILE: src/lib/geoarcValidator.ts
- FOUND FILE: src/App.tsx
- FOUND FILE: package.json
- FOUND FILE: .planning/phases/04-suite-de-pruebas-vitest-seguridad-e-higiene-de-arquitectura/04-01-SUMMARY.md
- FOUND COMMIT: 8daabfe
- FOUND COMMIT: dba373a
- FOUND COMMIT: 6967100

