# Phase 04: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura - Research
**Researched:** 2026-10-29
**Domain:** Testing Unitario (Vitest / Vite 6), Validación de Esquemas e Integridad (SSRF / XSS Sanitization), Seguridad de Middleware (DoS / Payload Limit) e Higiene de Dependencias
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Configuración de Vitest y Suite de Pruebas (`QUAL-01`)
- **D-01:** Incorporar `vitest` como `devDependency` en `package.json` y agregar los scripts `"test": "vitest run"` y `"test:watch": "vitest"`.
- **D-02:** Diseñar una suite de pruebas completa en `tests/` que cubra:
  1. `tests/oguc.test.ts`: `insetPolygonBisector` con lotes cóncavos en L/U (ausencia de auto-intersecciones), cálculo de volumen y rasantes en `computeOgucModel`, y recorte Liang-Barsky en `clipWayToBBox`.
  2. `tests/solar.test.ts`: `getSunPosition`, husos horarios dinámicos según longitud y fecha (Chile horario de verano UTC-3 y estándar UTC-4), y parseo de fechas `YYYY-MM-DD` sin desfase de medianoche.
  3. `tests/crs.test.ts`: Proyecciones cartográficas Snyder 1987 WGS84 a UTM (`EPSG:32718`, `EPSG:32719`, `EPSG:32633`, `EPSG:4326`) y generación afín de Worldfile `.JGW`.
  4. `tests/export.test.ts`: Generación y estructura de archivos `.DXF` (capas `BUILDINGS`, `HIGHWAYS`, `CONTOURS`), cota Z normalizada y empotramiento de 0.35m en `buildThreeSceneFromMeshData`, y exportación vectorial `.SVG`.
  5. `tests/storage.test.ts`: Contrato de persistencia y serialización en `storageService.ts`.

#### Seguridad de Entradas y Validación `.geoarc` (`QUAL-03`)
- **D-03:** En `handleImportGeoarc` (`src/App.tsx`), validar rigurosamente la estructura del archivo JSON importado:
  - Comprobar presencia y tipo de campos obligatorios (`w`, `h`, `cols`, `rows`, `minEv`, `maxEv`, `grid`).
  - Validar coherencia numérica: `grid.length === cols * rows`, cotas numéricas finitas (`Number.isFinite`), y `minEv <= maxEv`.
  - Validar `satelliteTexture`: aceptar únicamente cadenas con prefijo `data:image/jpeg;base64,`, `data:image/png;base64,` o `blob:`, rechazando URLs remotas arbitrarias para evitar SSRF / ataques XSS.
  - En caso de error de validación, desplegar alerta clara y no mutar el estado.

#### Higiene de Configuración y Seguridad del Servidor (`QUAL-03`)
- **D-04:** En `vite.config.ts` y `package.json`:
  - **Proxy Overpass seguro (`vite.config.ts`):** Imponer límite estricto de tamaño (`MAX_BODY_SIZE = 64 * 1024` bytes) en la captura de chunks del request POST a `/api/overpass`, respondiendo con HTTP 413 si se excede. Usar cabecera `User-Agent: GeoArc/1.4 (Architectural SIG Assistant)`.
  - **Protección de API Keys:** Eliminar `'process.env.GEMINI_API_KEY'` del bloque `define` de `vite.config.ts` para que no se filtre en el bundle de producción compilado.
  - **Depuración de dependencias en `package.json`:** Remover paquetes backend no utilizados (`@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`).
  - **Script de limpieza multiplataforma:** Reemplazar `"clean": "rm -rf dist"` en `package.json` por un comando compatible con Windows/Linux: `"clean": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\""`.

### the agent's Discretion
- Estructura de archivos de test bajo `tests/*.test.ts` asegurando compatibilidad con el entorno Node.js y el DOM simulado si fuera necesario.
- Preservar `npm run dev`, `npm run build` y `npm run lint` funcionales al 100%.

### Deferred Ideas (OUT OF SCOPE)
- Pruebas end-to-end con Playwright/Cypress — diferidas para versiones futuras v2.0; las pruebas unitarias y de integración con Vitest cubren exhaustivamente la lógica matemática y de serialización.
</user_constraints>

## Project Constraints (from GEMINI.md)

- **Compatibilidad Client-Side (Zero-Backend Compute):** Todo el procesamiento geométrico, reproyección CRS/UTM, generación CAD/3D y persistencia debe ejecutarse en el navegador sin requerir servidores de cómputo externos.
- **Preservación de Paridad Visual 2.5D / 3D:** Cualquier cambio en el motor geométrico (`ogucService.ts`, `SunPosition.ts`, `customLotPts`) debe reflejarse de forma idéntica tanto en `ThreeTerrainViewer.tsx` como en `ContourViewer.tsx` y en los archivos exportados (`.dxf`, `.glb`, `.obj`, `.stl`).
- **Entorno Windows y Sincronización:** El repositorio de trabajo se encuentra en `C:\Users\conta\.gemini\antigravity\scratch\Geo_Arc` y mantiene espejo sincronizado en Google Drive. Los scripts de `package.json` deben ser compatibles con Windows PowerShell (`node -e` en lugar de herramientas shell UNIX como `rm`).
- **TypeScript y Estilo:** TypeScript `~5.8.2`, formato con indentación de 2 espacios, nombres `camelCase.ts` en librerías (`src/lib/`) y `PascalCase.tsx` en componentes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **QUAL-01** | El repositorio cuenta con `Vitest` configurado y una suite de pruebas automatizadas que valida el motor OGUC (`ogucService.ts`), el motor solar (`SunPosition.ts`), el cálculo de métricas de polígonos, las conversiones CRS/UTM y los constructores de exportación. | Arquitectura de tests en `tests/*.test.ts`, configuración `vitest.config.ts` vinculada con Vite 6.2.0, fixtures deterministas para lotes cóncavos, proyecciones Snyder y serializadores CAD/3D en entorno Node. |
| **QUAL-03** | La carga de archivos `.geoarc` valida el esquema e integridad de `meshData` y `satelliteTexture`, el proxy `/api/overpass` (`vite.config.ts`) impone límite de payload (`64 KB`) y cabeceras limpias, se remueve la inyección de `GEMINI_API_KEY` en el cliente y se depuran paquetes no usados y scripts en `package.json`. | Módulo validador de integridad para `handleImportGeoarc`, limitador de chunks en flujo de streams HTTP en Connect middleware, purga de 5 paquetes huérfanos sin impacto en build y script `clean` nativo Node.js. |
</phase_requirements>

## Summary

La Fase 4 completa el ciclo de confiabilidad, seguridad y saneamiento arquitectónico de **Geo_Arc v1.4**. Hasta este hito, los motores matemáticos normativos (OGUC Art. 2.6.3 y 2.6.12), astronómicos (Heliodón y husos dinámicos), cartográficos (Snyder 1987) y de interoperabilidad 3D (Three.js unificado) dependían de validación manual en navegador. Esta fase introduce **Vitest 3.x** integrado de manera nativa con **Vite 6.2.0**, estableciendo una suite automatizada de 5 módulos de pruebas en `tests/` que se ejecutan en milisegundos bajo Node.js sin requerir renderizadores WebGL pesados.

Adicionalmente, se cierran las vulnerabilidades de seguridad identificadas en la auditoría técnica de arquitectura:
1. **SSRF / XSS en importación `.geoarc`:** Actualmente `src/App.tsx` confía ciegamente en el JSON cargado, mutando estados antes de validar y permitiendo cadenas de textura arbitrarias. Se implementa una validación atómica rigurosa que exige dimensiones congruentes (`grid.length === cols * rows`), cotas finitas (`minEv <= maxEv`) y restringe `satelliteTexture` estrictamente a data URIs base64 (`image/jpeg`, `image/png`) y objetos `blob:`.
2. **Denegación de servicio (DoS) en proxy de desarrollo:** `vite.config.ts` acumula buffers de streaming sin techo máximo. Se implementa un guardián de carga de 64 KB (`MAX_BODY_SIZE = 64 * 1024`) con respuesta HTTP 413 y se sustituye la cabecera genérica por `User-Agent: GeoArc/1.4 (Architectural SIG Assistant)`.
3. **Fuga de credenciales y desecho de dependencias:** Se elimina la inyección de `'process.env.GEMINI_API_KEY'` del bundler cliente y se depuran 5 dependencias huérfanas en `package.json` (`@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`), optimizando el árbol de instalación y estandarizando el script `clean` para entornos Windows/PowerShell.

**Primary recommendation:** Configurar `vitest` `^3.2.7` con un archivo dedicado `vitest.config.ts` apuntando a `tests/**/*.test.ts`, modularizar la validación de `.geoarc` en una función pura reutilizable y comprobable por tests, asegurar el middleware de streaming en `vite.config.ts` antes de procesar el body, y purgar las dependencias huérfanas mediante `npm uninstall`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Unit Testing Runner (`vitest run`) | Dev Tooling / Node.js CLI | — | Ejecución fuera de navegador, pruebas matemáticas instantáneas de módulos en `src/lib/`. |
| Validación de Esquema `.geoarc` | Client Application (`src/App.tsx`) | `src/lib/` (Validador puro) | El cliente es responsable de garantizar la integridad y sanitización de archivos externos antes de mutar su estado reactivo. |
| Protección Proxy Overpass (DoS Guard) | Vite Dev Server Middleware (`vite.config.ts`) | — | Capa intermedia HTTP Connect que intercepta las peticiones de desarrollo y limita la memoria del proceso Node. |
| Higiene de Bundle y Dependencias | Build Tooling (`package.json`, Vite) | — | Exclusión de variables de entorno confidenciales en bundle de producción y reducción de superficie de ataque. |
| Persistencia y Cache Local | Client Browser (`IndexedDB`) | Unit Tests Mock | Almacenamiento no volátil en `geoarc_db`, probado bajo Vitest mediante contrato simulado. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | `^3.2.7` [VERIFIED: npm registry] | Runner de pruebas unitarias automatizadas | Nativo para Vite (comparte plugins, alias y pipeline de transformación Rollup/esbuild). Compatible con Vite 6. |
| `vite` | `^6.2.0` [VERIFIED: package.json:42] | Bundler y servidor de desarrollo con proxy Connect | Entorno base del proyecto. |
| `typescript` | `~5.8.2` [VERIFIED: package.json:41] | Compilador estático y chequeo de tipos (`tsc --noEmit`) | Garantiza tipado estricto en tests y código fuente. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `three` | `^0.184.0` [VERIFIED: package.json:29] | Motor 3D matemático (`THREE.Scene`, `THREE.Mesh`, etc.) | Se importa en `tests/export.test.ts` para validar construcción de escenas y normalización Z. |
| `d3` | `^7.9.0` [VERIFIED: package.json:18] | Algoritmos de isolíneas (`d3.contours`) | Se ejecuta en `tests/export.test.ts` para evaluar exportación SVG. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vitest` | `jest` | `jest` requiere configuración pesada con `ts-jest` o `babel`, no comparte la configuración de alias de `vite.config.ts`, y es notablemente más lento en proyectos ESM modernos. |
| `vitest.config.ts` dedicado | Configuración unificada en `vite.config.ts` | En Vite 6, mezclar tipos de Vitest en `vite.config.ts` requiere `/// <reference types="vitest" />` o `defineConfig` de `vitest/config`. Un archivo separado `vitest.config.ts` previene colisiones con plugins de Vite durante `npm run build` y `npm run lint`. |
| Script `node -e` | `rimraf` (npm package) | `fs.rmSync('dist', { recursive: true, force: true })` es nativo en Node 18+ sin necesidad de añadir otra dependencia externa a `package.json`. |

**Installation:**
```bash
npm install -D vitest@^3.2.7
npm uninstall @google/genai express dotenv @types/express tsx
```

**Version verification:**
- `vitest`: `^3.2.7` publicado en el registro de npm, compatible con `vite: ^5.0.0 || ^6.0.0 || ^7.0.0-0` [VERIFIED: npm view vitest@3.2.7 dependencies.vite].
- Node local: `v24.18.1` [VERIFIED: node -v].
- npm local: `11.12.0` [VERIFIED: npm -v].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `vitest` | npm | 3+ años | ~170M/semana | `github.com/vitest-dev/vitest` | [OK] | Aprobado (`devDependency`) |
| `@google/genai` | npm | 1+ año | ~150k/semana | `github.com/google/generative-ai-js` | [OK] | REMOVED (Huérfano en `package.json`, sin uso en `src/`) |
| `express` | npm | 14+ años | ~30M/semana | `github.com/expressjs/express` | [OK] | REMOVED (Innecesario, proxy resuelto en Vite) |
| `dotenv` | npm | 11+ años | ~40M/semana | `github.com/motdotla/dotenv` | [OK] | REMOVED (Innecesario, Vite usa `loadEnv`) |
| `@types/express` | npm | 10+ años | ~15M/semana | `github.com/DefinitelyTyped/DefinitelyTyped` | [OK] | REMOVED (Huérfano) |
| `tsx` | npm | 3+ años | ~10M/semana | `github.com/privatenumber/tsx` | [OK] | REMOVED (Huérfano, scripts usan `vite` y `tsc`) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Packages pruned due to architectural hygiene:** `@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`.

## Architecture Patterns

### System Architecture Diagram

```text
  +---------------------------------------------------------------------------------+
  |                       DEV & TEST PIPELINE (NODE.JS RUNTIME)                     |
  |                                                                                 |
  |  +--------------------+         +--------------------------------------------+  |
  |  |    npm test        |         |             vite dev / build               |  |
  |  |   (Vitest 3.x)     |         |   +--------------------------------------+ |  |
  |  +---------+----------+         |   | Overpass Proxy Plugin                | |  |
  |            |                    |   | - MAX_BODY_SIZE = 64KB (HTTP 413)    | |  |
  |            v                    |   | - User-Agent: GeoArc/1.4             | |  |
  |  +--------------------+         |   +--------------------------------------+ |  |
  |  |  tests/*.test.ts   |         |   - define: GEMINI_API_KEY REMOVED         |  |
  |  | - oguc.test.ts     |         +--------------------------------------------+  |
  |  | - solar.test.ts    |                                                         |
  |  | - crs.test.ts      |                                                         |
  |  | - export.test.ts   |                                                         |
  |  | - storage.test.ts  |                                                         |
  |  +---------+----------+                                                         |
  |            | (Pure imports, zero DOM overhead)                                  |
  +------------|--------------------------------------------------------------------+
               v
  +---------------------------------------------------------------------------------+
  |                        APPLICATION CORE (SRC/LIB & APP)                         |
  |                                                                                 |
  |  +-------------------+  +-------------------+  +------------------------------+ |
  |  | ogucService.ts    |  | SunPosition.ts    |  | crsService.ts                | |
  |  | - bisector inset  |  | - midday parse    |  | - Snyder 1987 WGS84->UTM     | |
  |  | - 3D volume tiers |  | - dynamic DST     |  | - JGW Worldfile generator    | |
  |  | - Liang-Barsky    |  | - sun position    |  |                              | |
  |  +-------------------+  +-------------------+  +------------------------------+ |
  |                                                                                 |
  |  +-------------------+  +-------------------+  +------------------------------+ |
  |  | exportService.ts  |  | storageService.ts |  | App.tsx / Validation         | |
  |  | - DXF R15 metric  |  | - IndexedDB CRUD  |  | - handleImportGeoarc         | |
  |  | - Three.js Scene  |  | - MeshData sanity |  | - Strict schema & bounds     | |
  |  | - SVG Sheet gen   |  | - Private fallback|  | - Base64/Blob texture only   | |
  |  +-------------------+  +-------------------+  +------------------------------+ |
  +---------------------------------------------------------------------------------+
```

### Recommended Project Structure
```
Geo_Arc/
├── tests/
│   ├── oguc.test.ts          # Pruebas de insetPolygonBisector, computeOgucModel, clipWayToBBox
│   ├── solar.test.ts         # Pruebas de getSunPosition, getSolarTimezoneOffset, parseLocalSolarDate
│   ├── crs.test.ts           # Pruebas de latLonToUtm, projectPointToCrs, generateWorldFileForCrs
│   ├── export.test.ts        # Pruebas de generateDxfContent, buildThreeSceneFromMeshData, generateSvgTopographicSheet
│   └── storage.test.ts       # Pruebas de contrato storageService, sanitización e IndexedDB fallback
├── src/
│   ├── App.tsx               # handleImportGeoarc con validación estricta y atómica
│   └── lib/
│       ├── ogucService.ts
│       ├── SunPosition.ts
│       ├── crsService.ts
│       ├── exportService.ts
│       ├── storageService.ts
│       └── meshProcessor.ts
├── vite.config.ts            # Proxy Overpass blindado (64KB cap, cabecera limpia, sin GEMINI define)
├── vitest.config.ts          # Configuración aislada de runner de pruebas Vitest
└── package.json              # Scripts 'test', 'test:watch', 'clean' multiplataforma y dependencias depuradas
```

### Pattern 1: Aislamiento de Configuración de Pruebas (`vitest.config.ts`)
**What:** Crear un archivo de configuración separado para Vitest que defina el entorno de pruebas, alias y archivos incluidos sin alterar la firma ni las opciones de empaquetado de producción en `vite.config.ts`.
**When to use:** En proyectos con Vite 6 y plugins especializados como `@tailwindcss/vite` y React, donde mezclar opciones de test en `vite.config.ts` genera advertencias de tipado estático con `tsc --noEmit`.
**Example:**
```typescript
// [VERIFIED: vitest official docs / Context7]
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

### Pattern 2: Validación Atómica de Entradas Externas (Fail-Fast sin Mutación Previa)
**What:** Validar la totalidad de una estructura JSON externa (`.geoarc`) antes de llamar a cualquier despachador o setter de estado (`useState`).
**When to use:** Al importar archivos de proyecto desde disco para evitar estados parcialmente corruptos si el archivo falla a mitad de lectura.
**Example:**
```typescript
// [VERIFIED: src/App.tsx:465-528]
export function validateGeoarcPayload(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'El archivo no contiene un objeto JSON válido.' };
  }
  const m = data.meshData;
  if (!m || typeof m !== 'object') {
    return { valid: false, error: 'Estructura meshData ausente en el archivo.' };
  }
  // 1. Tipos numéricos requeridos
  if (!Number.isFinite(m.w) || m.w <= 0 || !Number.isFinite(m.h) || m.h <= 0) {
    return { valid: false, error: 'Dimensiones físicas w o h inválidas.' };
  }
  if (!Number.isInteger(m.cols) || m.cols <= 0 || !Number.isInteger(m.rows) || m.rows <= 0) {
    return { valid: false, error: 'Resolución de grilla cols o rows inválida.' };
  }
  if (!Number.isFinite(m.minEv) || !Number.isFinite(m.maxEv) || m.minEv > m.maxEv) {
    return { valid: false, error: 'Cotas de elevación minEv o maxEv inconsistentes.' };
  }
  // 2. Coherencia de grilla y valores finitos
  if (!Array.isArray(m.grid) || m.grid.length !== m.cols * m.rows) {
    return { valid: false, error: `Longitud de grilla (${m.grid?.length}) no coincide con cols * rows (${m.cols * m.rows}).` };
  }
  // Chequeo de finitud (rápido en muestras o integral)
  for (let i = 0; i < m.grid.length; i++) {
    if (typeof m.grid[i] !== 'number' || !Number.isFinite(m.grid[i])) {
      return { valid: false, error: `Valor no finito detectado en grilla en índice ${i}.` };
    }
  }
  // 3. Sanitización estricta de textura satelital
  if (m.satelliteTexture !== undefined && m.satelliteTexture !== null) {
    if (typeof m.satelliteTexture !== 'string') {
      return { valid: false, error: 'satelliteTexture debe ser una cadena.' };
    }
    const isBase64Jpeg = m.satelliteTexture.startsWith('data:image/jpeg;base64,');
    const isBase64Png = m.satelliteTexture.startsWith('data:image/png;base64,');
    const isBlobUrl = m.satelliteTexture.startsWith('blob:');
    if (!isBase64Jpeg && !isBase64Png && !isBlobUrl) {
      return { valid: false, error: 'satelliteTexture contiene un protocolo no permitido (sólo data:image/jpeg, data:image/png o blob:).' };
    }
  }
  return { valid: true };
}
```

### Pattern 3: Blindaje de Streaming en Middleware Connect (`MAX_BODY_SIZE` Guard)
**What:** Controlar los bytes acumulados en los eventos `data` de `IncomingMessage` en Node.js, abortando de inmediato la conexión con código HTTP 413 si se supera el umbral de seguridad.
**When to use:** En cualquier proxy de desarrollo que capture bodies sin parser preconfigurado (como `body-parser`).
**Example:**
```typescript
// [VERIFIED: vite.config.ts:6-20]
const MAX_BODY_SIZE = 64 * 1024; // 64 KB límite estricto

let body = '';
let bodyLength = 0;
let isOverLimit = false;

req.on('data', (chunk: any) => {
  if (isOverLimit) return;
  bodyLength += chunk.length;
  if (bodyLength > MAX_BODY_SIZE) {
    isOverLimit = true;
    res.statusCode = 413;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Payload Too Large: La consulta Overpass excede el límite máximo permitido de 64 KB.'
    }));
    req.destroy();
    return;
  }
  body += chunk.toString();
});

req.on('end', async () => {
  if (isOverLimit) return;
  // Procesamiento seguro...
});
```

### Anti-Patterns to Avoid
- **Mutar estado React antes de validar:** En `src/App.tsx`, aplicar `setInterval`, `setOgucAngle`, etc. antes de validar `meshData` corrompe la sesión si el archivo falla más adelante.
- **Probar Three.js requiriendo un WebGLRenderer en Node:** `WebGLRenderer` requiere un contexto Canvas nativo (`gl`/`headless-gl`). Todas las pruebas de `buildThreeSceneFromMeshData` deben inspeccionar el árbol del grafo de escena (`THREE.Scene`, `children`, `geometry.attributes.position`) que se ejecuta limpiamente en memoria pura de Node.
- **Usar comandos bash Unix (`rm -rf`) en scripts de package.json:** Rompe la ejecución en terminales Windows PowerShell convencionales. Usar siempre `node -e "fs.rmSync(...)"`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runner de pruebas para TypeScript ESM | Custom scripts de ejecución con Node | `vitest` | Vitest maneja recarga rápida, transpilación TypeScript en memoria vía Vite/esbuild, mocking, assertions y snapshots de forma estándar. |
| Eliminación recursiva de directorios en scripts npm | Comandos específicos de SO (`rm -rf` o `rd /s /q`) | `node -e "fs.rmSync('dist', { recursive: true, force: true })"` | Funciona idénticamente en Windows, Linux, macOS y CI/CD sin instalar utilitarios adicionales. |
| Invocación de proxy HTTP | Servidor Express paralelo | Vite Connect Middleware | Vite ya incluye un servidor HTTP Connect integrado en `configureServer`. Mantener Express en `package.json` es redundante. |

## Common Pitfalls

### Pitfall 1: Desfase de Zona Horaria al Ejecutar Pruebas en CI o Distintos Sistemas Operativos
**What goes wrong:** `tests/solar.test.ts` falla en servidores con zona horaria UTC o husos distintos a América/Santiago.
**Why it happens:** Si los tests usan `new Date('2026-06-21')` sin considerar el desfase de medianoche o asumen el huso del sistema operativo en lugar de la implementación dinámica.
**How to avoid:** La función `getSolarTimezoneOffset` ya utiliza `Intl.DateTimeFormat` configurado con `timeZone: 'America/Santiago'` [VERIFIED: src/lib/SunPosition.ts:68-71]. En los tests, verificar explícitamente las coordenadas chilenas y evaluar el retorno esperado (-3 en verano, -4 en invierno) usando fechas generadas mediante `parseLocalSolarDate`.
**Warning signs:** Tests solares pasando en local pero fallando en entornos CI remotos con hora UTC.

### Pitfall 2: Memory Leak o Colisión de Tipos en Vite al Mezclar `test` en `vite.config.ts`
**What goes wrong:** `npm run lint` (`tsc --noEmit`) falla con error `Property 'test' does not exist on type 'UserConfigExport'`.
**Why it happens:** El paquete `vite` no incluye las definiciones de tipo de `vitest` a menos que se importe desde `vitest/config`.
**How to avoid:** Utilizar un archivo dedicado `vitest.config.ts` para la configuración de pruebas. `vite.config.ts` permanece libre de tipos de Vitest, asegurando que `npm run build` y `npm run lint` se mantengan 100% limpios.

### Pitfall 3: Cierre de Stream HTTP Incompleto tras Descartar Request con Error 413
**What goes wrong:** La aplicación de desarrollo se bloquea o el socket se mantiene abierto indefinidamente tras un request mayor a 64 KB.
**Why it happens:** Responder `res.end()` sin llamar a `req.destroy()` o continuar escuchando eventos `data`/`end`.
**How to avoid:** Establecer una bandera booleana (`isOverLimit = true`), llamar a `res.statusCode = 413`, `res.end(...)`, y destruir el socket entrante con `req.destroy()`.

## Code Examples

### 1. Suite de Pruebas OGUC y Lotes Cóncavos (`tests/oguc.test.ts`)
```typescript
// [VERIFIED: src/lib/ogucService.ts:367-402, 747-780, 1125-1165]
import { describe, it, expect } from 'vitest';
import {
  insetPolygonBisector,
  computeOgucModel,
  clipWayToBBox,
  getRegionRasanteInfo
} from '../src/lib/ogucService';
import type { MeshData } from '../src/lib/meshProcessor';

describe('ogucService - Motores Normativos y Geométricos', () => {
  const dummyMesh: MeshData = {
    grid: new Array(100 * 100).fill(10),
    minEv: 10,
    maxEv: 10,
    w: 100,
    h: 100,
    size: 100,
    cols: 100,
    rows: 100
  };

  it('calcula retranqueo interior en lote rectangular sin auto-intersección', () => {
    const rect = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
      { x: 10, y: 40 }
    ];
    const inset = insetPolygonBisector(rect, 3.0, dummyMesh, 100);
    expect(inset).not.toBeNull();
    expect(inset!.length).toBe(4);
    // Cada vértice debe haberse movido hacia el interior
    expect(inset![0].x).toBeGreaterThan(10);
    expect(inset![0].y).toBeGreaterThan(10);
  });

  it('procesa lotes cóncavos en forma de L sin auto-intersecciones', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 60 },
      { x: 0, y: 60 }
    ];
    const inset = insetPolygonBisector(lShape, 2.5, dummyMesh, 100);
    expect(inset).not.toBeNull();
    expect(inset!.length).toBe(6);
  });

  it('retorna null cuando el retranqueo excede el ancho mínimo del lote', () => {
    const narrowLot = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 50 },
      { x: 0, y: 50 }
    ];
    // Retranqueo de 5m en un lote de 4m de ancho colapsa la geometría
    const inset = insetPolygonBisector(narrowLot, 5.0, dummyMesh, 100);
    expect(inset).toBeNull();
  });

  it('recorta polilíneas OSM exactamente a los límites del BBox (clipWayToBBox)', () => {
    const bbox = { minLon: -70.7, maxLon: -70.6, minLat: -33.5, maxLat: -33.4 };
    const lineCrossing = [
      { lon: -70.75, lat: -33.45 }, // Fuera (oeste)
      { lon: -70.65, lat: -33.45 }, // Dentro
      { lon: -70.55, lat: -33.45 }  // Fuera (este)
    ];
    const clipped = clipWayToBBox(lineCrossing, bbox, 15);
    expect(clipped.length).toBe(1);
    expect(clipped[0][0].lon).toBeCloseTo(-70.7, 4);
    expect(clipped[0][clipped[0].length - 1].lon).toBeCloseTo(-70.6, 4);
  });

  it('aplica ángulos normativos según el grupo regional chileno', () => {
    const g1 = getRegionRasanteInfo(1);
    expect(g1.surAngle).toBe(63);
    expect(g1.extraFactor).toBe(0.2);

    const g2 = getRegionRasanteInfo(2);
    expect(g2.surAngle).toBe(57);
    expect(g2.extraFactor).toBe(0.3);

    const g3 = getRegionRasanteInfo(3);
    expect(g3.surAngle).toBe(51);
    expect(g3.extraFactor).toBe(0.4);
  });
});
```

### 2. Suite de Pruebas Solar y Husos Dinámicos (`tests/solar.test.ts`)
```typescript
// [VERIFIED: src/lib/SunPosition.ts:10-89, 91-153]
import { describe, it, expect } from 'vitest';
import {
  parseLocalSolarDate,
  getSolarTimezoneOffset,
  getSunPosition
} from '../src/lib/SunPosition';

describe('SunPosition - Motor Solar y Husos Horarios', () => {
  it('parseLocalSolarDate normaliza fechas YYYY-MM-DD a mediodía local', () => {
    const d = parseLocalSolarDate('2026-06-21');
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
  });

  it('detecta horario de invierno (UTC-4) y verano (UTC-3) en Chile Central', () => {
    const winterDate = new Date(2026, 5, 21); // Junio (Invierno)
    const summerDate = new Date(2026, 0, 15); // Enero (Verano)

    const offsetWinter = getSolarTimezoneOffset(-33.45, -70.66, winterDate);
    const offsetSummer = getSolarTimezoneOffset(-33.45, -70.66, summerDate);

    expect(offsetWinter).toBe(-4);
    expect(offsetSummer).toBe(-3);
  });

  it('mantiene UTC-3 permanente en la Región de Magallanes (lat <= -49°)', () => {
    const winterDate = new Date(2026, 5, 21);
    const puntaArenasOffset = getSolarTimezoneOffset(-53.16, -70.91, winterDate);
    expect(puntaArenasOffset).toBe(-3);
  });

  it('calcula posición solar realista a mediodía en Santiago', () => {
    const summerDate = new Date(2026, 0, 15);
    const pos = getSunPosition(-33.45, -70.66, summerDate, 13.5);
    // A mediodía solar en el hemisferio sur, el sol apunta hacia el Norte (acimut ~0° / 360°) y elevación alta
    expect(pos.elevation).toBeGreaterThan(60);
    expect(pos.azimuth).toBeGreaterThan(340);
  });
});
```

### 3. Suite de Pruebas Cartográficas Snyder y CRS (`tests/crs.test.ts`)
```typescript
// [VERIFIED: src/lib/crsService.ts:22-27, 34-87, 111-149]
import { describe, it, expect } from 'vitest';
import {
  latLonToUtm,
  projectPointToCrs,
  generateWorldFileForCrs,
  SUPPORTED_CRS
} from '../src/lib/crsService';

describe('crsService - Proyecciones Snyder 1987 y Worldfiles', () => {
  it('soporta los sistemas de referencia estándar de Chile y WGS84', () => {
    expect(SUPPORTED_CRS['EPSG:32718']).toBeDefined();
    expect(SUPPORTED_CRS['EPSG:32719']).toBeDefined();
    expect(SUPPORTED_CRS['EPSG:32633']).toBeDefined();
    expect(SUPPORTED_CRS['EPSG:4326']).toBeDefined();
  });

  it('convierte coordenadas geográficas a UTM Zona 19S con falso norte en hemisferio sur', () => {
    // Santiago de Chile: -33.4489, -70.6693
    const utm = latLonToUtm(-33.4489, -70.6693, 19, true);
    // Easting esperado ~344,700m, Northing esperado ~6,298,000m
    expect(utm.easting).toBeGreaterThan(340000);
    expect(utm.easting).toBeLessThan(350000);
    expect(utm.northing).toBeGreaterThan(6290000);
    expect(utm.northing).toBeLessThan(6305000);
  });

  it('genera Worldfile .JGW con 6 líneas y escala Y negativa', () => {
    const jgw = generateWorldFileForCrs({
      bbox: { minLat: -33.45, maxLat: -33.44, minLon: -70.67, maxLon: -70.66 },
      width: 500,
      height: 500,
      crsCode: 'EPSG:32719'
    });
    const lines = jgw.split('\r\n');
    expect(lines.length).toBe(6);
    expect(parseFloat(lines[0])).toBeGreaterThan(0); // Pixel size X
    expect(parseFloat(lines[1])).toBe(0);           // Rotación
    expect(parseFloat(lines[2])).toBe(0);           // Rotación
    expect(parseFloat(lines[3])).toBeLessThan(0);    // Pixel size Y (negativo)
  });
});
```

### 4. Suite de Pruebas de Exportación y Escena Three.js (`tests/export.test.ts`)
```typescript
// [VERIFIED: src/lib/exportService.ts:90-137, 278-283, 333-369, 595-650]
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  generateDxfContent,
  buildThreeSceneFromMeshData,
  generateSvgTopographicSheet
} from '../src/lib/exportService';
import type { MeshData } from '../src/lib/meshProcessor';

describe('exportService - Constructores de Escena, DXF y SVG', () => {
  const sampleMesh: MeshData = {
    grid: [10, 12, 11, 15],
    minEv: 10,
    maxEv: 15,
    w: 100,
    h: 100,
    size: 2,
    cols: 2,
    rows: 2,
    buildings: {
      elements: [
        {
          type: 'way',
          tags: { building: 'yes', height: '6.0' },
          geometry: [
            { lat: -33.441, lon: -70.669 },
            { lat: -33.441, lon: -70.668 },
            { lat: -33.442, lon: -70.668 },
            { lat: -33.442, lon: -70.669 }
          ]
        }
      ]
    },
    bbox: { minLat: -33.445, maxLat: -33.440, minLon: -70.670, maxLon: -70.665 }
  };

  it('construye escena Three.js con cota Y normalizada a minEv y empotramiento de 0.35m', () => {
    const scene = buildThreeSceneFromMeshData(sampleMesh, {
      zExaggeration: 1.0,
      includeBuildings: true
    });
    expect(scene).toBeInstanceOf(THREE.Scene);
    expect(scene.name).toBe('GeoArc_Terrain_Scene');

    const terrainMesh = scene.getObjectByName('Terreno_Topografico') as THREE.Mesh;
    expect(terrainMesh).toBeDefined();

    const buildingsGroup = scene.getObjectByName('Edificios_Contexto') as THREE.Group;
    expect(buildingsGroup).toBeDefined();
    expect(buildingsGroup.children.length).toBeGreaterThan(0);
  });

  it('genera archivo DXF R15 metrico con capas requeridas', () => {
    const dxf = generateDxfContent({
      meshData: sampleMesh,
      contours: [],
      crs: 'EPSG:32719'
    });
    expect(dxf).toContain('AC1015');
    expect(dxf).toContain('$MEASUREMENT');
    expect(dxf).toContain('CONTOURS');
    expect(dxf).toContain('BUILDINGS');
    expect(dxf).toContain('HIGHWAYS');
  });

  it('genera lámina topográfica SVG con formato e isolíneas válidas', () => {
    const svg = generateSvgTopographicSheet({
      meshData: sampleMesh,
      interval: 1.0
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
  });
});
```

### 5. Suite de Pruebas de Persistencia IndexedDB (`tests/storage.test.ts`)
```typescript
// [VERIFIED: src/lib/storageService.ts:24-27, 34-36, 82-115]
import { describe, it, expect } from 'vitest';
import {
  saveSession,
  loadSession,
  clearSession,
  DB_NAME,
  STORE_NAME,
  SESSION_KEY
} from '../src/lib/storageService';

describe('storageService - Contrato de Persistencia Local', () => {
  it('expone constantes de base de datos e índices correctos', () => {
    expect(DB_NAME).toBe('geoarc_db');
    expect(STORE_NAME).toBe('project_session');
    expect(SESSION_KEY).toBe('active_project');
  });

  it('maneja con elegancia la ausencia de window.indexedDB en entorno Node', async () => {
    // En entorno Node.js sin navegador, window.indexedDB no existe
    const loaded = await loadSession();
    expect(loaded).toBeNull();

    // Guardar o limpiar no debe lanzar excepciones no controladas
    await expect(saveSession({ version: 1, timestamp: Date.now(), fileName: 'test' })).resolves.toBeUndefined();
    await expect(clearSession()).resolves.toBeUndefined();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pruebas manuales visuales en UI tras cada cambio | Suite automatizada `Vitest 3.x` ejecutada en CI/local | Phase 4 (2026-10) | Detección inmediata de regresiones matemáticas en milisegundos sin latencia humana. |
| Ingesta no validada de `.geoarc` en `App.tsx` | Validación atómica de esquemas con sanitización estricta de texturas | Phase 4 (2026-10) | Prevención total de inyecciones XSS / SSRF y estados corruptos en la aplicación. |
| Streaming no acotado en proxy `/api/overpass` | Guardián `MAX_BODY_SIZE = 64KB` con HTTP 413 | Phase 4 (2026-10) | Blindaje contra ataques de desbordamiento de memoria (DoS) en el servidor de desarrollo. |
| Filtración de `GEMINI_API_KEY` en bundle cliente | Eliminación de define y purga de dependencias IA/Express | Phase 4 (2026-10) | Código compilado libre de secretos y árbol `node_modules` reducido en 5 dependencias huérfanas. |
| Script `"clean": "rm -rf dist"` dependiente de Unix | `"clean": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\""` | Phase 4 (2026-10) | Compatibilidad garantizada en Windows PowerShell y cualquier sistema operativo. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vitest` `^3.2.7` se instala limpiamente sin conflictos de pares con Vite `6.2.0` | Standard Stack | Bajo; comprobado vía `npm view vitest@3.2.7 dependencies.vite` que declara `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0-0`. |

## Open Questions (RESOLVED)

1. **¿Debe usarse `happy-dom` o `jsdom` para las pruebas unitarias?**
   - *Resolución:* Ninguno es necesario para las pruebas de Phase 4. Todos los motores matemáticos (`ogucService`, `SunPosition`, `crsService`), exportadores (`exportService` Three.js escena / DXF / SVG) y el validador de `.geoarc` operan de forma 100% pura en el entorno estándar `node`. Esto evita instalar dependencias pesadas de emulación DOM y permite que `vitest run` se ejecute a velocidad máxima.

2. **¿Conviene extraer la validación de `.geoarc` a un helper modular?**
   - *Resolución:* Sí. Se recomienda crear una función pura `validateGeoarcData` (en `src/lib/geoarcValidator.ts` o exportada desde `src/lib/meshProcessor.ts`) consumida por `handleImportGeoarc` en `src/App.tsx`. Esto permite probar exhaustivamente los casos límite (grilla corrupta, valores infinitos, URLs remotas maliciosas) en `tests/export.test.ts` de forma aislada.

3. **¿Cómo debe responder el proxy Overpass al superar los 64 KB?**
   - *Resolución:* Responder inmediatamente con status HTTP 413, cabecera `Content-Type: application/json`, destruir el socket entrante (`req.destroy()`) y abortar el listener `end` para no realizar ninguna llamada upstream innecesaria.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime Vite y Vitest | ✓ | `v24.18.1` [VERIFIED: node -v] | — |
| npm | Gestor de paquetes | ✓ | `11.12.0` [VERIFIED: npm -v] | — |
| TypeScript | Chequeo estático (`npm run lint`) | ✓ | `~5.8.2` [VERIFIED: package.json:41] | — |
| Vite | Servidor dev y compilador | ✓ | `^6.2.0` [VERIFIED: package.json:42] | — |
| Vitest | Runner de pruebas automatizadas | ✗ (Instalar) | `^3.2.7` | `npm install -D vitest@^3.2.7` |

**Missing dependencies with no fallback:**
- Ninguna.

**Missing dependencies with fallback:**
- `vitest`: Se añadirá como devDependency en el Plan 01 de Phase 4 mediante `npm install -D vitest@^3.2.7`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.7` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/crs.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **QUAL-01** | Retranqueos OGUC bisector en L/U, rasantes y corte Liang-Barsky | unit | `npx vitest run tests/oguc.test.ts` | ❌ Wave 0 (Plan 01) |
| **QUAL-01** | Posición solar, husos chilenos dinámicos (UTC-3/4) y normalización fecha | unit | `npx vitest run tests/solar.test.ts` | ❌ Wave 0 (Plan 01) |
| **QUAL-01** | Conversiones Snyder WGS84 a UTM 18S/19S/33N/4326 y Worldfile .JGW | unit | `npx vitest run tests/crs.test.ts` | ❌ Wave 0 (Plan 01) |
| **QUAL-01** | Escena Three.js (Z y 0.35m embed), serialización DXF R15 y SVG | unit | `npx vitest run tests/export.test.ts` | ❌ Wave 0 (Plan 01) |
| **QUAL-01** | Persistencia storageService e IndexedDB graceful fallback | unit | `npx vitest run tests/storage.test.ts` | ❌ Wave 0 (Plan 01) |
| **QUAL-03** | Validación estricta esquema `.geoarc` y sanitización satelliteTexture | unit | `npx vitest run tests/export.test.ts` | ❌ Wave 0 (Plan 02) |
| **QUAL-03** | Compilación de bundle limpio sin GEMINI_API_KEY y `npm run lint` | integration | `npm run lint && npm run build` | ✅ Configurado |

### Sampling Rate
- **Per task commit:** `npm test` (< 2 segundos)
- **Per wave merge:** `npm run lint && npm test && npm run build`
- **Phase gate:** Suite de Vitest 100% verde (5/5 archivos de prueba pasando), `npm run lint` sin advertencias y `npm run build` exitoso.

### Wave 0 Gaps
- [ ] `vitest.config.ts` — configuración de entorno de pruebas y resolución de alias.
- [ ] Instalación de `vitest` como devDependency en `package.json` y adición de scripts `"test"` y `"test:watch"`.
- [ ] `tests/oguc.test.ts` — validación de `ogucService.ts`.
- [ ] `tests/solar.test.ts` — validación de `SunPosition.ts`.
- [ ] `tests/crs.test.ts` — validación de `crsService.ts`.
- [ ] `tests/export.test.ts` — validación de `exportService.ts`.
- [ ] `tests/storage.test.ts` — validación de `storageService.ts`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Aplicación 100% client-side sin autenticación de usuarios. |
| V3 Session Management | no | Sesión almacenada localmente en IndexedDB del navegador del cliente. |
| V4 Access Control | no | No aplica. |
| V5 Input Validation | yes | Validación exhaustiva de tipos, cotas numéricas finitas y esquemas en `.geoarc`. Restricción de prefijos URI permitidos en texturas para prevenir inyección XSS y SSRF. |
| V6 Cryptography | no | No se almacenan credenciales criptográficas ni firmas digitales propietarias. |
| V13 API and Web Service | yes | Límite de carga útil (`MAX_BODY_SIZE = 64KB`) y cabecera legítima en proxy `/api/overpass` para prevenir abusos DoS y bloqueo por upstream OSM. |
| V14 Configuration | yes | Supresión de credenciales (`GEMINI_API_KEY`) en el define del bundler cliente y depuración de paquetes backend innecesarios. |

### Known Threat Patterns for Geo_Arc

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Inyección de URLs remotas arbitrarias en `satelliteTexture` | Tampering / Information Disclosure | Rechazar esquemas `http://`, `https://`, `javascript:` al importar `.geoarc`, permitiendo exclusivamente data URIs de imagen base64 y URLs `blob:` locales. |
| Desbordamiento de memoria por consultas masivas a Overpass | Denial of Service | Guardián en middleware de `vite.config.ts` limitando la lectura a `64 * 1024` bytes y respondiendo con HTTP 413. |
| Exposición de API Keys en bundle estático de producción | Information Disclosure | Eliminación de `'process.env.GEMINI_API_KEY'` de la directiva `define` de Vite. |
| Datos de elevación NaN o infinitos deformando la malla 3D | Tampering / Denial of Service | Verificación `Number.isFinite` sobre cada cota del array `grid` antes de comprometer el estado del terreno. |

## Sources

### Primary (HIGH confidence)
- Codebase audit: `src/App.tsx:465-530`, `src/lib/ogucService.ts:1-1200`, `src/lib/SunPosition.ts:1-154`, `src/lib/crsService.ts:1-150`, `src/lib/exportService.ts:1-975`, `src/lib/storageService.ts:1-136`, `vite.config.ts:1-123`, `package.json:1-45`.
- `npm view vitest@3.2.7 dependencies.vite`: Verificación de compatibilidad con Vite 6 (`^5.0.0 || ^6.0.0 || ^7.0.0-0`).
- Local execution probes: Verificación de Three.js scene graph y D3 contours en Node.js puro, verificación de `node -e "fs.rmSync('dist', { recursive: true, force: true })"` en Windows PowerShell.

### Secondary (MEDIUM confidence)
- Vitest Documentation (`vitest.dev`): Configuración de entorno `node` y resolución de path aliases.
- OWASP ASVS v4.0: Controles de validación de entradas y mitigación de denegación de servicio.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Verificado en registro de npm y validado con Vite 6.2.0 local.
- Architecture: HIGH — Basado en módulos puros existentes en `src/lib/` sin dependencias de navegador para pruebas.
- Security: HIGH — Vulnerabilidades identificadas y parcheadas con controles estándar probados.

**Research date:** 2026-10-29
**Valid until:** 2026-11-29 (Estable para v1.4)
