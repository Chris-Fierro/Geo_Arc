# Phase 4: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura - Context

**Gathered:** 2026-10-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Garantizar la confiabilidad matemática, la seguridad de las entradas externas y la higiene del empaquetado del proyecto:
1. Suite de pruebas unitarias automatizadas con `Vitest` para validar todos los motores geométricos, normativos, solares, cartográficos y de exportación.
2. Validación estricta de esquemas e integridad al importar archivos `.geoarc` para prevenir datos corruptos o inyección de URLs maliciosas.
3. Blindaje del proxy de desarrollo `/api/overpass` en `vite.config.ts` con límite de tamaño de carga (64 KB) y cabeceras legítimas.
4. Eliminación de la inyección de `GEMINI_API_KEY` en el bundle cliente y depuración de dependencias obsoletas en `package.json`.

Esta fase aborda los requerimientos `QUAL-01` y `QUAL-03`.

</domain>

<decisions>
## Implementation Decisions

### Configuración de Vitest y Suite de Pruebas (`QUAL-01`)
- **D-01:** Incorporar `vitest` como `devDependency` en `package.json` y agregar los scripts `"test": "vitest run"` y `"test:watch": "vitest"`.
- **D-02:** Diseñar una suite de pruebas completa en `tests/` que cubra:
  1. `tests/oguc.test.ts`: `insetPolygonBisector` con lotes cóncavos en L/U (ausencia de auto-intersecciones), cálculo de volumen y rasantes en `computeOgucModel`, y recorte Liang-Barsky en `clipWayToBBox`.
  2. `tests/solar.test.ts`: `getSunPosition`, husos horarios dinámicos según longitud y fecha (Chile horario de verano UTC-3 y estándar UTC-4), y parseo de fechas `YYYY-MM-DD` sin desfase de medianoche.
  3. `tests/crs.test.ts`: Proyecciones cartográficas Snyder 1987 WGS84 a UTM (`EPSG:32718`, `EPSG:32719`, `EPSG:32633`, `EPSG:4326`) y generación afín de Worldfile `.JGW`.
  4. `tests/export.test.ts`: Generación y estructura de archivos `.DXF` (capas `BUILDINGS`, `HIGHWAYS`, `CONTOURS`), cota Z normalizada y empotramiento de 0.35m en `buildThreeSceneFromMeshData`, y exportación vectorial `.SVG`.
  5. `tests/storage.test.ts`: Contrato de persistencia y serialización en `storageService.ts`.

### Seguridad de Entradas y Validación `.geoarc` (`QUAL-03`)
- **D-03:** En `handleImportGeoarc` (`src/App.tsx`), validar rigurosamente la estructura del archivo JSON importado:
  - Comprobar presencia y tipo de campos obligatorios (`w`, `h`, `cols`, `rows`, `minEv`, `maxEv`, `grid`).
  - Validar coherencia numérica: `grid.length === cols * rows`, cotas numéricas finitas (`Number.isFinite`), y `minEv <= maxEv`.
  - Validar `satelliteTexture`: aceptar únicamente cadenas con prefijo `data:image/jpeg;base64,`, `data:image/png;base64,` o `blob:`, rechazando URLs remotas arbitrarias para evitar SSRF / ataques XSS.
  - En caso de error de validación, desplegar alerta clara y no mutar el estado.

### Higiene de Configuración y Seguridad del Servidor (`QUAL-03`)
- **D-04:** En `vite.config.ts` y `package.json`:
  - **Proxy Overpass seguro (`vite.config.ts`):** Imponer límite estricto de tamaño (`MAX_BODY_SIZE = 64 * 1024` bytes) en la captura de chunks del request POST a `/api/overpass`, respondiendo con HTTP 413 si se excede. Usar cabecera `User-Agent: GeoArc/1.4 (Architectural SIG Assistant)`.
  - **Protección de API Keys:** Eliminar `'process.env.GEMINI_API_KEY'` del bloque `define` de `vite.config.ts` para que no se filtre en el bundle de producción compilado.
  - **Depuración de dependencias en `package.json`:** Remover paquetes backend no utilizados (`@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`).
  - **Script de limpieza multiplataforma:** Reemplazar `"clean": "rm -rf dist"` en `package.json` por un comando compatible con Windows/Linux: `"clean": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\""`.

### the agent's Discretion
- Estructura de archivos de test bajo `tests/*.test.ts` asegurando compatibilidad con el entorno Node.js y el DOM simulado si fuera necesario.
- Preservar `npm run dev`, `npm run build` y `npm run lint` funcionales al 100%.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auditoría y Código Base
- `.planning/codebase/CONCERNS.md` — Secciones *Security Considerations*, *Unused Packages and Misclassified Dependencies* y *Test Coverage Gaps*.
- `.planning/REQUIREMENTS.md` — Requerimientos `QUAL-01` y `QUAL-03`.
- `.planning/ROADMAP.md` — Criterios de éxito de Phase 4.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets & Key Locations
- `src/lib/ogucService.ts`: motores normativos y de recorte.
- `src/lib/SunPosition.ts`: motor solar astronómico.
- `src/lib/crsService.ts`: conversor cartográfico Snyder WGS84/UTM y Worldfile.
- `src/lib/exportService.ts`: serializadores DXF, Three.js y SVG.
- `src/lib/storageService.ts`: servicio de persistencia IndexedDB.
- `src/App.tsx`: `handleImportGeoarc`.
- `vite.config.ts`: proxy Overpass y configuración `define`.
- `package.json`: dependencias y scripts de construcción.

</code_context>

<deferred>
## Deferred Ideas

- Pruebas end-to-end con Playwright/Cypress — diferidas para versiones futuras v2.0; las pruebas unitarias y de integración con Vitest cubren exhaustivamente la lógica matemática y de serialización.

</deferred>

---

*Phase: 04-suite-de-pruebas-vitest-seguridad-e-higiene-de-arquitectura*
*Context gathered: 2026-10-29*
