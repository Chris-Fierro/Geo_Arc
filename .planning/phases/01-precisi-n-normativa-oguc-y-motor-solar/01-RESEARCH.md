# Phase 1: Precisión Normativa OGUC y Motor Solar - Research

**Researched:** 2026-10-28
**Domain:** Geometría Computacional Normativa (OGUC Art. 2.6.3 / Art. 2.6.12), Efemérides Solares y Sincronización de Estado Reactivo 2.5D/3D
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Sombras OGUC Multinivel (`OGUC-01`)
- **D-01:** En `computeOgucModel` (`src/lib/ogucService.ts`), el cálculo de la sombra propuesta (`proposedPolygons` y `proposedAreaM2`) debe proyectar todos los niveles volumétricos activos (`tiers`: `continuous`, `main`, `upper_stepped`) en los 3 azimuts reglamentarios (`135°`, `180°`, `225°`) y calcular la envolvente/unión de sus polígonos de sombra proyectados sobre el terreno, evitando que la sombra se encoja al activar el retranqueo adicional de Art. 2.6.12 sobre `10.5m` o la edificación continua.

#### Sincronización Bidireccional de Lote y Volumen (`OGUC-02`)
- **D-02:** En `src/components/ContourViewer.tsx`, el arrastre interactivo del volumen propuesto (`handleVolumePointerDown` / `volumeOffset`) debe actualizar o persistir las coordenadas del lote (`customLotPts` en `src/App.tsx`, con sus cotas de terreno `elev` remuestreadas con `getGridElevAt`) al finalizar el arrastre (o de forma reactiva), eliminando la desincronización donde `volumeOffset` quedaba atrapado únicamente en el estado local de `ContourViewer.tsx` y se perdía al pasar a `ThreeTerrainViewer.tsx` o al exportar `.geoarc`.

#### Distanciamientos Robustos en Lotes Cóncavos (`OGUC-03`)
- **D-03:** En `insetPolygonBisector` (`src/lib/ogucService.ts`), limitar el factor de inglete (`miterScale`) en esquinas agudas/cóncavas y detectar/resolver cruces o auto-intersecciones de aristas adyacentes en polígonos irregulares cóncavos (en forma de "L" o "U"), garantizando que los polígonos de retranqueo (`mainPoly`, `upperPoly`) mantengan orientación válida y no corrompan `THREE.ExtrudeGeometry` en `ThreeTerrainViewer.tsx` ni el área normativa.

#### Huso Horario Dinámico y Fecha Local en Motor Solar (`OGUC-04`)
- **D-04:** En `src/lib/SunPosition.ts` (`getSunPosition`), reemplazar el `tzOffset = -4` estático por el cálculo dinámico del huso horario según la fecha y ubicación geográfica (soportando horario de verano/invierno de Chile `America/Santiago` UTC-3 / UTC-4 para longitudes chilenas y aproximación longitudinal `Math.round(lon / 15)` fuera de Chile), y en `src/App.tsx` / `ThreeTerrainViewer.tsx` / `ContourViewer.tsx` parsear `solarDate` (`YYYY-MM-DD`) en mediodía local (`new Date(`${solarDate}T12:00:00`)`) para eliminar el desfase de 1 día provocado por medianoche UTC.

### the agent's Discretion
- Elección del algoritmo geométrico exacto para combinar las huellas de sombra proyectadas de múltiples `tiers` (envolvente convexa combinada o unión poligonal/rasterizada de alta precisión) siempre que sea determinista, rápido en el hilo principal y garantice que `proposedAreaM2` nunca disminuya al agregar pisos inferiores más anchos.
- Mecanismo de commit del arrastre en `ContourViewer.tsx` (aplicar `volumeOffset` en tiempo real durante el drag y volcar a `setCustomLotPts` en `pointerup` reseteando `volumeOffset` a `{ x: 0, y: 0 }`, o actualizar `customLotPts` directamente).

### Deferred Ideas (OUT OF SCOPE)
- Ninguna — todos los puntos corresponden directamente al alcance de la Phase 1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **OGUC-01** | El usuario puede visualizar y evaluar la sombra propuesta OGUC (Art. 2.6.12) proyectada a partir de la unión de huellas de todos los niveles volumétricos activos (`continuous`, `main`, `upper_stepped`) en lugar de considerar únicamente la terraza superior. | En `src/lib/ogucService.ts:607-625`, reemplazar la proyección exclusiva de `tiers[tiers.length - 1]` por una función `projectMultiTierDirectionalShadowOnTerrain` que proyecte cada `VolumeTier` activo usando la cota real de terreno (`getGridElevAt(p.x, p.y)`) como base para `heightAboveGround = Math.max(0, roofZ - groundElev)` y combine las nubes proyectadas mediante `convexHull3D`. |
| **OGUC-02** | El usuario puede arrastrar la posición del volumen/lote en el visor Topográfico 2.5D (`ContourViewer`) y ver reflejado el mismo desplazamiento inmediatamente en el visor 3D Satelital (`ThreeTerrainViewer`) y al guardar/cargar archivos `.geoarc`. | En `src/components/ContourViewer.tsx:70, 616-618, 712-732, 1566-1603`, almacenar el delta de arrastre en un `useRef` (`latestDragOffsetRef`) para evitar clausuras obsoletas (`stale closures`), restringir el desplazamiento como cuerpo rígido dentro de `[0, n-1] × [0, m-1]`, y al soltar el puntero (`pointerup` / `pointercancel`) volcar los vértices desplazados y remuestreados (`elev: getGridElevAt(nx, ny)`) hacia `setCustomLotPts` reseteando `dragOffset` a `{ x: 0, y: 0 }`. |
| **OGUC-03** | El usuario puede dibujar lotes irregulares cóncavos (ej. en forma de "L" o "U") y obtener polígonos de distanciamiento interior (`insetPolygonBisector`) sin auto-intersecciones de aristas que deformen la extrusión 3D ni el área normativa. | En `src/lib/ogucService.ts:104-198`, pre-filtrar vértices duplicados/colineales, acotar de forma continua el factor de inglete (`miterScale <= 2.5`), colapsar aristas cortas invertidas ($\Delta P' \cdot \vec{v}_i \le 0$) y podar iterativamente lazos de auto-intersección (`pruneSelfIntersections`) conservando el sub-lazo simple de igual orientación y mayor área positiva. Además, proteger `rasantePlanes` (`src/lib/ogucService.ts:528-529`) cuando `topRoofPtsForRasante.length !== lotPolygon.length`. |
| **OGUC-04** | El usuario obtiene cálculos de posición solar (`altitud` y `azimut` en `SunPosition.ts`) con huso horario preciso según longitud/fecha (incluyendo horario de verano/invierno en Chile UTC-3/UTC-4) y parseo de fechas `YYYY-MM-DD` en hora local sin desfase de medianoche UTC. | En `src/lib/SunPosition.ts:12-25`, añadir `parseLocalSolarDate` y `getSolarTimezoneOffset` (usando `Intl.DateTimeFormat` con `timeZone: 'America/Santiago'` / `'America/Punta_Arenas'` para Chile continental y `Math.round(lon / 15)` para el resto del mundo) y calcular el día del año `N` con `Date.UTC(year, month, day)`. Actualizar `src/App.tsx:1039, 1079`, `src/components/ContourViewer.tsx:441` y `src/components/ThreeTerrainViewer.tsx:145`. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

Las siguientes directivas extraídas de `./GEMINI.md` son obligatorias para el planificador y ejecutor [VERIFIED: GEMINI.md:11-16, 88-154]:

1. **Compatibilidad Client-Side (Zero-Backend Compute):** Todo el procesamiento geométrico, normativo y astronómico debe ejecutarse 100% en el navegador sin requerir servidores externos ni dependencias pesadas nuevas (`GEMINI.md:13`).
2. **Preservación de Paridad Visual 2.5D / 3D:** Cualquier cambio en el motor geométrico (`src/lib/ogucService.ts`, `src/lib/SunPosition.ts`, `customLotPts`) debe reflejarse de forma idéntica tanto en `src/components/ThreeTerrainViewer.tsx` como en `src/components/ContourViewer.tsx` y en los archivos `.geoarc` (`GEMINI.md:14`).
3. **Entorno Windows y Scripts:** Los comandos de verificación y scripts deben ser compatibles con Windows PowerShell en `C:\Users\conta\.gemini\antigravity\scratch\Geo_Arc` (`GEMINI.md:15`).
4. **Convenciones de Código y Módulos:**
   - Mantener funciones matemáticas y geométricas puras en `src/lib/` (`ogucService.ts`, `SunPosition.ts`) usando exclusivamente *named exports* (`export function`, `export interface`) (`GEMINI.md:142-152`).
   - Usar sufijos de unidad explícitos (`Meters`, `M2`, `Deg`, `Rad`, `Grid`) para evitar confusión entre índices de grilla `[0..cols-1]`, grados, radianes y metros reales (`GEMINI.md:95`).
   - Retornar `null` o `{ collapsed: true }` ante geometrías degeneradas en lugar de lanzar excepciones no controladas (`GEMINI.md:123, 147`).
   - Verificar tipos estáticos mediante `npm run lint` (`tsc --noEmit`) (`GEMINI.md:107`).

---

## Summary

La Fase 1 aborda cuatro defectos matemáticos y de sincronización de estado que afectan la precisión regulatoria y astronómica de **Geo_Arc**. La inspección directa del código fuente reveló no solo las causas reportadas en la auditoría inicial, sino también **dos defectos acoplados críticos** que deben corregirse simultáneamente para que los criterios de éxito se cumplan al 100%:

1. En **`OGUC-01`** (`src/lib/ogucService.ts:478-482, 608-625`), cuando se activa el retranqueo adicional de Art. 2.6.12 (`upper_stepped`) o la placa continua (`continuous`), la sombra propuesta se encoge drásticamente por **doble motivo**: primero, `computeOgucModel` solo proyecta `tiers[tiers.length - 1]`; segundo, `tier.basePts` en `upper_stepped` almacena la cota del piso intermedio (`baseZ105 = mainBaseElev + 10.5`) en lugar de la cota del terreno natural (`getGridElevAt(p.x, p.y)`). Como `projectDirectionalShadowOnTerrain` (`src/lib/ogucService.ts:313`) calcula `heightAboveGround = Math.max(0, roofZ - p.elev)`, un edificio de `14m` con retranqueo a `10.5m` proyectaba una sombra equivalente a solo `3.5m` de altura (`14 - 10.5`) y dejaba los vértices base del polígono de sombra flotando a `10.5m` sobre el terreno en el visor 3D.
2. En **`OGUC-02`** (`src/components/ContourViewer.tsx:70, 1566-1603`), el estado local `dragOffset` (referido conceptualmente como `volumeOffset` en `01-CONTEXT.md`) desplaza visualmente `effectiveLotBasePts` en el visor SVG pero nunca invoca `setCustomLotPts` al finalizar el arrastre (`handleUp`). Además, `handleUp` se define como una clausura dentro de `handleVolumePointerDown`, por lo que leer `dragOffset` directamente desde el estado de React dentro de `handleUp` leería el valor obsoleto inicial (`{ x: 0, y: 0 }`).
3. En **`OGUC-03`** (`src/lib/ogucService.ts:104-198`), `insetPolygonBisector` aplica un corte discontinuo de inglete (`Math.abs(dot) > 0.25 ? offsetGrid / dot : offsetGrid * 2`) y carece de detección de colapso de aristas cortas y de poda de lazos auto-intersectados en polígonos cóncavos ("L" o "U"). Adicionalmente, cuando una arista colapsa y el polígono interior tiene menos vértices que `lotPolygon`, el bucle de `rasantePlanes` (`src/lib/ogucService.ts:528-529`) indexa `topRoofPtsForRasante[i]` asumiendo correspondencia 1:1.
4. En **`OGUC-04`** (`src/lib/SunPosition.ts:13-25` y `src/App.tsx:1039, 1079`), `new Date(solarDate)` interpreta `'YYYY-MM-DD'` como medianoche UTC (`00:00:00Z`), restando un día completo en longitudes occidentales (ej. `2024-01-01` se convierte en `2023-12-31 21:00` en Chile, arrojando día del año `N = 365` en vez de `N = 1`), mientras que `const tzOffset = -4` ignora el horario de verano chileno (`UTC-3`) y ubicaciones fuera de `UTC-4`.

**Primary recommendation:** Implementar las correcciones directamente en los módulos puros `src/lib/ogucService.ts` y `src/lib/SunPosition.ts` (exportando helpers deterministas para traslación de lote, limpieza de auto-intersecciones, proyección multinivel de sombras y huso horario/fecha local) y conectar el commit de arrastre en `src/components/ContourViewer.tsx` y el parseo de fecha local en `src/App.tsx`, `src/components/ContourViewer.tsx` y `src/components/ThreeTerrainViewer.tsx`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Proyección de sombras normativas OGUC multinivel (`OGUC-01`) | **Domain Service (`src/lib/ogucService.ts`)** | Viewports (`ContourViewer.tsx`, `ThreeTerrainViewer.tsx`) | Ambos visores consumen `ogucModel.shadows.proposedPolygons` y `proposedAreaM2` directamente desde `computeOgucModel`. Resolverlo en `ogucService.ts` garantiza paridad automática 2.5D/3D. |
| Sincronización de arrastre de volumen y lote (`OGUC-02`) | **Interactive Viewport (`src/components/ContourViewer.tsx`) & State Orchestrator (`src/App.tsx`)** | Domain Service (`src/lib/ogucService.ts`) | `ContourViewer.tsx` captura los eventos de puntero (`pointerdown`/`pointermove`/`pointerup`), transforma coordenadas con `screenToGrid` y persiste el lote desplazado hacia `customLotPts` en `App.tsx`, desde donde fluye a `ThreeTerrainViewer.tsx` y `.geoarc`. |
| Retranqueo interior robusto sin auto-intersección en lotes cóncavos (`OGUC-03`) | **Domain Service (`src/lib/ogucService.ts`)** | WebGL 3D Viewport (`ThreeTerrainViewer.tsx`) | `insetPolygonBisector` genera los anillos base para `tiers` (`main` y `upper_stepped`). Entregar un polígono simple libre de cruces evita que `THREE.ExtrudeGeometry` y `computePolygonAreaM2` fallen. |
| Cálculo de huso horario dinámico y parseo de fecha solar local (`OGUC-04`) | **Domain Service (`src/lib/SunPosition.ts`)** | State Orchestrator (`src/App.tsx`) & Viewports | `SunPosition.ts` encapsula la mecánica celeste y la resolución de zona horaria (`America/Santiago` / longitud), mientras `App.tsx` y ambos visores normalizan el `Date` local al mediodía (`T12:00:00`). |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | `~5.8.2` (`5.8.3` installed) | Tipado estático y verificación de contratos (`npm run lint`) | Estándar del proyecto configurado en `package.json` y `tsconfig.json` [VERIFIED: package.json:41]. |
| `react` / `react-dom` | `^19.0.0` | Estado reactivo centralizado (`customLotPts`, `solarDate`, `useMemo`) | Motor de UI existente en `src/App.tsx` y visores [VERIFIED: package.json:26-27]. |
| `three` | `^0.184.0` | Renderizado WebGL 3D, `THREE.Shape`, `THREE.ExtrudeGeometry` | Motor 3D activo en `src/components/ThreeTerrainViewer.tsx` [VERIFIED: package.json:29]. |
| `d3` | `^7.9.0` | Zoom/pan SVG (`d3.zoom`) y contornos topográficos en 2.5D | Motor vectorial activo en `src/components/ContourViewer.tsx` [VERIFIED: package.json:18]. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.21.0` | Ejecución directa de scripts de verificación TypeScript en Node.js | Para ejecutar pruebas deterministas de `ogucService.ts` y `SunPosition.ts` durante la validación de la fase [VERIFIED: package.json:40]. |
| `Intl.DateTimeFormat` | Nativo ES2022 | Resolución exacta de horario de verano/invierno IANA (`America/Santiago`, `America/Punta_Arenas`) | Para obtener el offset horario real (`GMT-3` vs `GMT-4`) en Chile sin librerías externas de zonas horarias [VERIFIED: Node v24.18.1 runtime probe]. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Geometría computacional propia en `src/lib/ogucService.ts` (`convexHull3D` + poda de lazos auto-intersectados) | `clipper2-js` / `martinez-polygon-clipping` | `01-CONTEXT.md` especifica explícitamente *"Cero dependencias pesadas nuevas si se puede resolver con geometría computacional limpia en TypeScript dentro de `src/lib/ogucService.ts` y `src/lib/SunPosition.ts`"* [VERIFIED: .planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-CONTEXT.md:40]. |
| `Intl.DateTimeFormat` nativo + aproximación longitudinal `Math.round(lon / 15)` | `luxon` / `@iana/tz` / `tz-lookup` | `Intl.DateTimeFormat` está integrado en todos los navegadores modernos y Node 24, resuelve exactamente las reglas oficiales de DST de Chile (`America/Santiago`) con 0 KB adicionales en el bundle. |

**Installation:**
```bash
# No se requieren paquetes externos nuevos en la Fase 1.
```

---

## Package Legitimacy Audit

Esta fase no instala paquetes externos nuevos (`01-CONTEXT.md:40`). Todas las capacidades se implementan sobre TypeScript estándar y las dependencias ya instaladas en `package.json`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                              `src/App.tsx`                                   │
│  • customLotPts: { x, y, elev }[] | null   (Estado canónico del predio)      │
│  • solarDate: 'YYYY-MM-DD' -> parseLocalSolarDate(solarDate) ('...T12:00:00')│
│  • handleExportGeoarc / handleImportGeoarc (Persistencia JSON de sesión)     │
└───────────────┬──────────────────────────────────────────────┬───────────────┘
                │ props (customLotPts, setCustomLotPts,        │ props (customLotPts,
                │        ogucParams, solarParams)              │        ogucParams, solarParams)
                ▼                                              ▼
┌───────────────────────────────────────────┐  ┌───────────────────────────────────────────┐
│      `src/components/ContourViewer.tsx`   │  │   `src/components/ThreeTerrainViewer.tsx` │
│  • Drag interactivo:                      │  │  • Recibe `customLotPts` sincronizado     │
│    pointerdown -> screenToGrid            │  │  • Invoca `computeOgucModel(...)`         │
│    pointermove -> dragOffset + ref        │  │  • Extruye `tier.basePts` con             │
│    pointerup   -> translateLotPolygon()   │  │    `THREE.ExtrudeGeometry` (sin cruces)   │
│                   setCustomLotPts(...)    │  │  • Dibuja `proposedPolygons` multinivel   │
│                   setDragOffset({0,0})    │  │  • Heliodón 3D con `getSunPosition(...)`  │
└─────────────────────┬─────────────────────┘  └─────────────────────┬─────────────────────┘
                      │                                              │
                      └──────────────────────┬───────────────────────┘
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Motores Matemáticos Puros (`src/lib/`)                │
│                                                                              │
│  1. `src/lib/ogucService.ts`                                                 │
│     • `insetPolygonBisector`: Limpia duplicados -> Clampa miterScale <= 2.5  │
│       -> Colapsa aristas invertidas -> Poda lazos de auto-intersección       │
│     • `computeOgucModel`: Construye `tiers` (`continuous`, `main`,           │
│       `upper_stepped`) -> Proyecta sombras de TODOS los tiers activos con    │
│       altura real sobre terreno (`roofZ - getGridElevAt`) -> `convexHull3D`  │
│                                                                              │
│  2. `src/lib/SunPosition.ts`                                                 │
│     • `parseLocalSolarDate`: Normaliza 'YYYY-MM-DD' y Date UTC-00:00 a       │
│       mediodía local (12:00:00)                                              │
│     • `getSolarTimezoneOffset`: Chile (`America/Santiago` UTC-3/UTC-4 via    │
│       `Intl.DateTimeFormat`) | Global (`Math.round(lon / 15)`)               │
│     • `getSunPosition`: Día del año `N` vía `Date.UTC` + hora solar exacta   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── App.tsx                          # Parseo de solarDate con parseLocalSolarDate y estado customLotPts
├── components/
│   ├── ContourViewer.tsx            # Commit de dragOffset -> setCustomLotPts en pointerup + parseLocalSolarDate
│   └── ThreeTerrainViewer.tsx       # Consumo de customLotPts sincronizado, ogucModel y parseLocalSolarDate
└── lib/
    ├── ogucService.ts               # insetPolygonBisector robusto, translateLotPolygon, sombra multinivel OGUC
    └── SunPosition.ts               # parseLocalSolarDate, getSolarTimezoneOffset y getSunPosition dinámico
```

---

### Pattern 1: Proyección de Sombra Propuesta OGUC Multinivel (`OGUC-01`)

**What:** Reemplazar la proyección de sombra de un único nivel en `computeOgucModel` (`src/lib/ogucService.ts:607-625`) por la proyección combinada de todos los niveles activos (`tiers`: `continuous`, `main`, `upper_stepped`) utilizando siempre la cota del terreno natural (`getGridElevAt(p.x, p.y)`) como referencia basal.

**Exact Code Inspection (`[VERIFIED: src/lib/ogucService.ts:311-315, 478-482, 607-625]`):**
Actualmente, `projectDirectionalShadowOnTerrain` (`src/lib/ogucService.ts:311-315`) calcula:
```typescript
  const projectedPts: Point3D[] = footprintPts.map((p, idx) => {
    const roofZ = topElevs[idx] ?? p.elev;
    const heightAboveGround = Math.max(0, roofZ - p.elev);
    const horizDistMeters = heightAboveGround / tanAngle;
```
Y en `computeOgucModel` (`src/lib/ogucService.ts:478-482` y `607-625`):
```typescript
    const baseZ105 = mainBaseElev + threshold105;
    const topZ = mainBaseElev + effectiveHeight;

    const basePts = upperGroundPts.map((p) => ({ x: p.x, y: p.y, elev: baseZ105 }));
    const roofPts = upperGroundPts.map((p) => ({ x: p.x, y: p.y, elev: topZ }));
```
```typescript
  // Proposed Volume Shadow: combines the highest active tier footprint & height
  const activeTier = tiers[tiers.length - 1];
  const proposedFootprint = activeTier ? activeTier.basePts : mainGroundPts;
  const proposedTopElevs = activeTier
    ? activeTier.roofPts.map((rp) => rp.elev)
    : mainGroundPts.map((p) => p.elev + effectiveHeight);

  const proposedPolygons: Point3D[][] = directions.map((d) =>
    projectDirectionalShadowOnTerrain(
      proposedFootprint,
      proposedTopElevs,
      d.angle,
      d.azimuth,
      meshData,
      n,
      m,
      getGridElevAt
    )
  );
```

**Why it fails:**
1. Cuando `tiers` contiene `main` (hasta `10.5m`) y `upper_stepped` (sobre `10.5m`), `tiers[tiers.length - 1]` selecciona únicamente `upper_stepped`, descartando la huella más ancha de `main` y de `continuous`.
2. Peor aún, si `continuousBaseHeight === maxHeight` (ej. placa continua de `14m` y retranqueo adicional activado), `upper_stepped` se agrega al arreglo `tiers` con un retranqueo mayor, reduciendo la sombra de la placa continua. Además, cuando `mainTopH <= mainStartH + 0.05` (ej. `continuousBaseHeight = 12m`, `maxHeight = 12m`, `applyExtraSetback = false`), `tiers` solo tiene `continuous`, pero si `applyExtraSetback = true`, `upper_stepped` entra como último tier con `baseZ105`.
3. En `upper_stepped`, `p.elev` en `tier.basePts` vale `baseZ105` (`mainBaseElev + 10.5`), NO la cota del suelo `getGridElevAt(p.x, p.y)`. Por tanto, `roofZ - p.elev` resta `baseZ105` y proyecta únicamente el diferencial de altura sobre `10.5m` (`effectiveHeight - 10.5`) en vez de la altura total de la terraza superior sobre el terreno (`roofZ - groundElev`). Asimismo, `basePts` dentro del polígono de sombra queda con `elev = baseZ105` (flotando en el aire en el visor 3D).

**Technical Solution:**
- Para cada dirección reglamentaria `d` en `directions` (`135°`, `180°`, `225°`):
  - Si `tiers.length > 0`, iterar sobre **todos** los `tier` en `tiers`.
  - Para cada `tier`, construir su huella aterrizada al terreno natural:
    ```typescript
    const tierGroundPts: Point3D[] = tier.basePts.map((p) => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y),
    }));
    const tierTopElevs: number[] = tier.roofPts.map((rp) => rp.elev);
    ```
  - Proyectar la sombra direccional de ese `tier` con `projectDirectionalShadowOnTerrain(tierGroundPts, tierTopElevs, d.angle, d.azimuth, meshData, n, m, getGridElevAt)`.
  - Acumular los polígonos proyectados de todos los `tiers` activos en esa dirección y calcular su envolvente combinada con `convexHull3D(allTierShadowPts)`.
- También en `computeOgucModel` (`src/lib/ogucService.ts:470`), si `contBaseH >= effectiveHeight - 0.05`, no debe generarse un `upper_stepped` redundante por debajo o igual a la placa continua (`hasUpperStep` solo aplica sobre niveles retranqueados por encima de `Math.max(threshold105, contBaseH)`).

---

### Pattern 2: Sincronización Bidireccional del Arrastre de Lote/Volumen (`OGUC-02`)

**What:** Persistir el desplazamiento interactivo del volumen/lote realizado en `ContourViewer.tsx` hacia el estado superior `customLotPts` en `src/App.tsx`, asegurando que el movimiento sea de cuerpo rígido (sin aplastar vértices contra los bordes de la grilla), que remuestree la cota `elev` con `getGridElevAt` y que no sufra de clausuras obsoletas (`stale closures`).

**Exact Code Inspection (`[VERIFIED: src/components/ContourViewer.tsx:70-72, 616-618, 712-732, 1566-1603]`):**
En `src/components/ContourViewer.tsx`:
- Línea 70: `const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });` (nota: llamado conceptualmente `volumeOffset` en `01-CONTEXT.md`).
- Líneas 616-618:
```typescript
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [customLotPts]);
```
- Líneas 712-732:
```typescript
  const effectiveLotBasePts = useMemo(() => {
    if (customLotPts && customLotPts.length >= 3) {
      return customLotPts.map((p) => ({
        x: Math.max(0, Math.min(n - 1, p.x + dragOffset.x)),
        y: Math.max(0, Math.min(m - 1, p.y + dragOffset.y)),
      }));
    }
    if (isDrawingLot) return null;

    // Lote por defecto centrado en el terreno cuando aún no se ha dibujado uno personalizado
    const cx = (n - 1) / 2 + dragOffset.x;
    const cy = (m - 1) / 2 + dragOffset.y;
    const hw = n * 0.11;
    const hh = m * 0.11;
    return [
      { x: cx - hw, y: cy - hh },
      { x: cx + hw, y: cy - hh },
      { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh },
    ];
  }, [customLotPts, isDrawingLot, n, m, dragOffset]);
```
- Líneas 1595-1599:
```typescript
                  const handleUp = () => {
                    isDraggingVolumeRef.current = false;
                    window.removeEventListener('pointermove', handleMove);
                    window.removeEventListener('pointerup', handleUp);
                  };
```

**Technical Solution:**
1. Crear y exportar en `src/lib/ogucService.ts` una función pura `translateLotPolygon`:
   ```typescript
   export function translateLotPolygon(
     basePts: { x: number; y: number }[],
     dx: number,
     dy: number,
     n: number,
     m: number,
     getGridElevAt: (x: number, y: number) => number
   ): Point3D[]
   ```
   que calcule el bounding box `[minX, maxX] × [minY, maxY]` de `basePts`, acote `(dx, dy)` como cuerpo rígido (`clampedDx = Math.max(-minX, Math.min(n - 1 - maxX, dx))`, `clampedDy = Math.max(-minY, Math.min(m - 1 - maxY, dy))`), y retorne los nuevos puntos `{ x: p.x + clampedDx, y: p.y + clampedDy, elev: getGridElevAt(nx, ny) }`.
2. En `ContourViewer.tsx`:
   - Definir `baseLotPtsWithoutOffset` (que devuelve `customLotPts` si tiene $\ge 3$ puntos, o los 4 vértices del lote por defecto centrado si `!isDrawingLot`).
   - Agregar `const latestDragOffsetRef = useRef({ x: 0, y: 0 });`.
   - Elevar `handleVolumePointerDown` al cuerpo principal de `ContourViewer` para poder enlazarlo tanto al `<g>` del volumen propuesto en Modo OGUC (`ContourViewer.tsx:1607`), como al `<g>` del polígono de lote (`ContourViewer.tsx:1539`) y al volumen en Modo Solar (`ContourViewer.tsx:1864-1907`).
   - En `handleMove`, calcular el delta `(dx, dy)` acotado como cuerpo rígido, guardarlo en `latestDragOffsetRef.current = { x: clampedDx, y: clampedDy }` y llamar a `setDragOffset({ x: clampedDx, y: clampedDy })`.
   - En `handleUp` (registrado en `pointerup` y `pointercancel`), leer `const finalOffset = latestDragOffsetRef.current;`. Si `Math.hypot(finalOffset.x, finalOffset.y) > 1e-4` y existe `setCustomLotPts`:
     - Calcular `const committedPts = translateLotPolygon(baseLotPtsWithoutOffset, finalOffset.x, finalOffset.y, n, m, getGridElevAt);`
     - Invocar `setCustomLotPts(committedPts)` y resetear `latestDragOffsetRef.current = { x: 0, y: 0 }` y `setDragOffset({ x: 0, y: 0 })`.
   - Prevenir que `d3.zoom` en modo Planta arrastre el mapa simultáneamente agregando `!isDraggingVolumeRef.current` en el filtro de `d3.zoom` (`ContourViewer.tsx:849`) y `onMouseDown={(e) => { if (!isDrawingLot && e.button === 0) e.stopPropagation(); }}` en el grupo arrastrable.

---

### Pattern 3: Distanciamientos Robustos en Lotes Cóncavos (`OGUC-03`)

**What:** Rediseñar `insetPolygonBisector` (`src/lib/ogucService.ts:104-198`) para soportar polígonos cóncavos en forma de "L", "U" o con ángulos agudos sin generar auto-intersecciones ("lazos de corbata" / *bowties*) ni colapsar prematuramente cuando solo una aleta estrecha se cierra.

**Exact Code Inspection (`[VERIFIED: src/lib/ogucService.ts:178-197]`):**
```typescript
    const dot = n1x * bx + n1y * by;
    // Clamp miter spike on very acute angles
    const dist = Math.abs(dot) > 0.25 ? offsetGrid / dot : offsetGrid * 2;

    newPts.push({
      x: curr.x + bx * dist,
      y: curr.y + by * dist,
    });
  }

  let newArea = 0;
  for (let i = 0; i < newPts.length; i++) {
    const j = (i + 1) % newPts.length;
    newArea += newPts[i].x * newPts[j].y - newPts[j].x * newPts[i].y;
  }
  if ((isClockwise && newArea <= 0) || (!isClockwise && newArea >= 0)) {
    return null;
  }

  return newPts;
```

**Why it fails on Concave ("L" / "U") Lots:**
1. **Vértices duplicados por doble clic:** Al cerrar un polígono con doble clic (`ContourViewer.tsx:1270`, `ThreeTerrainViewer.tsx:1099`), el primer clic inserta un vértice idéntico al anterior (`len1 = 0`), produciendo vectores normales nulos en `insetPolygonBisector`.
2. **Discontinuidad de inglete (`dot`):** Cuando `dot` baja de `0.26` a `0.24`, `dist` salta de `3.85 * offsetGrid` a `2.0 * offsetGrid`.
3. **Inversión de aristas cortas y cruce de aristas en brazos de "L" o "U":** Cuando un brazo de una "L" o la garganta de una "U" tiene ancho menor a `2 * offsetGrid` (o cuando un vértice reflejo cóncavo avanza en diagonal hacia adentro), las aristas desplazadas se cruzan entre sí formando un polígono auto-intersectado cuya área firmada total (`newArea`) sigue siendo del mismo signo porque el cuerpo principal del lote es más grande que el lazo invertido. Al pasar ese polígono auto-intersectado a `THREE.ExtrudeGeometry` (`ThreeTerrainViewer.tsx:808-812`), la triangulación genera caras cruzadas corruptas y `computePolygonAreaM2` resta el área del lazo invertido en lugar de medir solo la envolvente interior válida.

**Technical Solution (Pipeline de 4 etapas en `insetPolygonBisector`):**
1. **Etapa 1 — Saneamiento de Vértices (`cleanPolygonVertices`):**
   - Eliminar vértices consecutivos duplicados (`Math.hypot(curr.x - prev.x, curr.y - prev.y) < 1e-4`).
   - Eliminar vértices colineales redundantes donde `|cross(v1, v2)| < 1e-4 && dot(v1, v2) > 0`.
   - Si quedan menos de 3 vértices, retornar `null`.
2. **Etapa 2 — Desplazamiento por Bisectriz con Limitación Continua de Inglete (`computeRawBisectorInset`):**
   - Calcular normales interiores unitarias `n1`, `n2` y bisectriz unitaria `b`.
   - Si `blen < 1e-4` (aristas antiparalelas a $180^\circ$), usar `b = n1`.
   - Calcular `const miterScale = dot > 1e-4 ? Math.min(2.5, 1 / dot) : 1.0;` y `const dist = offsetGrid * miterScale;`.
3. **Etapa 3 — Colapso Iterativo de Aristas Invertidas Locales (`collapseInvertedEdges`):**
   - Si una arista desplazada $P'_i \to P'_{i+1}$ invierte su dirección respecto a la arista original $P_i \to P_{i+1}$ (`(P'_{i+1} - P'_i) · (P_{i+1} - P_i) <= 0`), la arista corta ha colapsado en el frente de onda.
   - Reemplazar los dos extremos de la arista invertida por la intersección de las rectas de offset adyacentes $L'_{i-1}$ y $L'_{i+1}$ (o su punto medio acotado si son casi paralelas), reduciendo en 1 el número de vértices del anillo antes de evaluar cruces globales.
4. **Etapa 4 — Detección y Poda Iterativa de Lazos de Auto-Intersección (`resolvePolygonSelfIntersections`):**
   - Buscar cualquier par de segmentos no adyacentes $e_a = (Q_a, Q_{a+1})$ y $e_b = (Q_b, Q_{b+1})$ que se intersecten propiamente en un punto $I$ (`intersectSegments2D`).
   - Al encontrar una intersección en $I$, dividir el anillo cerrado en dos sub-lazos simples en $I$:
     - `loopA = [I, Q_{a+1}, ..., Q_b]`
     - `loopB = [Q_0, ..., Q_a, I, Q_{b+1}, ..., Q_{k-1}]`
   - Evaluar el área firmada de ambos sub-lazos (`signedArea2D(loop) * sign`): descartar el lazo invertido (área firmada $< 0$, correspondiente a la "corbata" o esquina cruzada) y conservar el sub-lazo con orientación válida (`signedArea * sign > 0`) de mayor área.
   - Repetir iterativamente (hasta `maxIter = pts.length * 3`) hasta que `hasSelfIntersections(ring)` sea `false`.
   - Finalmente, filtrar los vértices resultantes para garantizar que todos permanezcan dentro del bounding box del lote original y que el área resultante cumpla `0 < absNewArea < absOrigArea`. Si el polígono colapsa por completo, retornar `null`.
5. **Protección en `rasantePlanes` (`src/lib/ogucService.ts:528-529`):**
   - En `computeOgucModel`, reemplazar:
     ```typescript
     const hasOneToOneRoof = topRoofPtsForRasante.length === lotPolygon.length;
     const insetP1 = hasOneToOneRoof ? topRoofPtsForRasante[i] : undefined;
     const insetP2 = hasOneToOneRoof ? topRoofPtsForRasante[j] : undefined;
     ```
     para que si un lote cóncavo simplificó el número de vértices de `mainInset` o `upperInset`, los planos de rasante proyecten limpiamente hacia adentro usando `inDxGrid` / `inDyGrid` sin enlazar índices desfasados.

---

### Pattern 4: Huso Horario Dinámico y Fecha Local en Motor Solar (`OGUC-04`)

**What:** Eliminar el `tzOffset = -4` estático en `src/lib/SunPosition.ts:23` y el parseo UTC de `new Date(solarDate)` en `src/App.tsx:1039, 1079`.

**Exact Code Inspection (`[VERIFIED: src/lib/SunPosition.ts:12-25, src/App.tsx:1039, 1079]`):**
En `src/lib/SunPosition.ts:12-25`:
```typescript
  // 1. Día del año (1–365)
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const N = Math.floor(diff / (1000 * 60 * 60 * 24));

  // 2. Declinación solar (en grados)
  const declination = -23.45 * Math.cos((360 / 365) * (N + 10) * (Math.PI / 180));

  // 3. Meridiano de la zona horaria
  // tzOffset es la diferencia en horas respecto a UTC de la fecha actual.
  // El user especificó usar -4 de manera estática para sus pruebas
  const tzOffset = -4;
  const lstMeridian = tzOffset * 15;
```
Y en `src/App.tsx:1039` y `1079`:
```typescript
                      solarParams={{
                        date: new Date(solarDate),
                        time: solarTime,
                        showSunPath,
                        showShadows: showSolarShadows
                      }}
```

**Technical Solution:**
1. **Función `parseLocalSolarDate(dateInput: string | Date): Date` en `src/lib/SunPosition.ts`:**
   - Si `dateInput` es un string `'YYYY-MM-DD'`, retorna `new Date(`${dateInput}T12:00:00`)` (mediodía local).
   - Si `dateInput` es un objeto `Date` que fue instanciado como medianoche UTC exacta (`getUTCHours() === 0 && getUTCMinutes() === 0 && getUTCSeconds() === 0 && getUTCMilliseconds() === 0`), reconstruye `new Date(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate(), 12, 0, 0)` para preservar el año, mes y día nominales sin desfase de zona horaria.
2. **Cálculo de Día del Año `N` inmune a DST en `getSunPosition`:**
   - Extraer `year = localDate.getFullYear()`, `month = localDate.getMonth()`, `day = localDate.getDate()`.
   - Calcular `N = Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 0)) / 86400000)`. Usar `Date.UTC` sobre los componentes locales evita que el cambio de hora de primavera/otoño introduzca $\pm 1$ hora en `diff` y altere `Math.floor`.
3. **Función `getSolarTimezoneOffset(lat: number, lon: number, date: Date): number` en `src/lib/SunPosition.ts`:**
   - **Caso Chile Continental (`lat >= -56 && lat <= -17 && lon >= -76 && lon <= -66`):**
     - Para la Región de Magallanes (`lat <= -49`), usar `timeZone = 'America/Punta_Arenas'` (`UTC-3` permanente).
     - Para el resto de Chile continental (`lat > -49`), usar `timeZone = 'America/Santiago'`.
     - Consultar `Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(localDate)` en el mediodía de la fecha consultada (`new Date(Date.UTC(year, month, day, 16, 0, 0))`), extrayendo el offset de `'GMT-3'` o `'GMT-4'` mediante `/GMT([+-]\d+)(?::(\d+))?/`.
     - Si por cualquier razón `Intl` fallara, aplicar fallback determinista del calendario oficial chileno (primer sábado de abril a primer sábado de septiembre $\rightarrow -4$, resto del año $\rightarrow -3$).
   - **Caso Internacional (fuera del bounding box de Chile continental):**
     - Retornar `Math.max(-12, Math.min(14, Math.round(lon / 15) || 0))`.

---

### Anti-Patterns to Avoid
- **Leer `dragOffset` directamente desde el estado React dentro del listener `handleUp` de `window`:** Como `handleUp` se registra dentro de `handleVolumePointerDown`, captura la clausura del render inicial (`dragOffset = { x: 0, y: 0 }`). Siempre debe leerse desde un `useRef` actualizado en `handleMove` (`latestDragOffsetRef.current`).
- **Usar `tier.basePts[i].elev` como cota de terreno al proyectar sombras de pisos superiores:** En los niveles `main` (sobre placa continua) y `upper_stepped` (sobre `10.5m`), `tier.basePts[i].elev` es la cota donde nace ese piso intermedio (`baseZ105`), no el suelo. Siempre se debe muestrear `const groundElev = getGridElevAt(p.x, p.y)` para calcular la altura total `roofZ - groundElev`.
- **Clamping individual por vértice durante el arrastre del lote:** Hacer `Math.max(0, Math.min(n - 1, p.x + dx))` vértice por vértice deforma el polígono cuando toca el borde del terreno. Se debe acotar el vector `(dx, dy)` respecto al bounding box completo del lote.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reglas históricas/actuales de cambio de hora (DST) en Chile | Tablas manuales por año codificadas a mano como única fuente | `Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'shortOffset' })` con fallback calendárico | El motor ICU de V8/navegadores ya contiene la base de datos IANA `tzdata` oficial para `America/Santiago` y `America/Punta_Arenas` [VERIFIED: Node v24.18.1 runtime probe]. |
| Envolvente convexa 2D con preservación de cota Z | Nuevo algoritmo de envolvente desde cero | `convexHull3D` existente en `src/lib/ogucService.ts:200-228` | Ya implementa la cadena monótona de Andrew en $O(V \log V)$ conservando `Point3D` (`{ x, y, elev }`) [VERIFIED: src/lib/ogucService.ts:200-228]. |
| Cálculo de superficie métrica de polígonos en grilla | Nuevas fórmulas de área | `computePolygonAreaM2` existente en `src/lib/ogucService.ts:230-248` | Escala correctamente de coordenadas normalizadas `(n, m)` a metros reales `(w, h)` [VERIFIED: src/lib/ogucService.ts:230-248]. |

**Key insight:** `src/lib/ogucService.ts` ya contiene las primitivas `convexHull3D` y `computePolygonAreaM2` (nota: en `01-CONTEXT.md:63-64` se mencionaron conceptualmente como `convexHull2D` y `polygonAreaGrid`, pero sus nombres reales en el repositorio son `convexHull3D` y `computePolygonAreaM2` `[VERIFIED: src/lib/ogucService.ts:200-248]`). Reutilizar exactamente estas funciones evita duplicación y mantiene intactos los tipos exportados.

---

## Common Pitfalls

### Pitfall 1: Sombra de `upper_stepped` calculada con `heightAboveGround = roofZ - baseZ105` y vértices base flotando en Z
**What goes wrong:** Al proyectar `upper_stepped`, si se pasa `tier.basePts` directamente a `projectDirectionalShadowOnTerrain`, `p.elev` vale `mainBaseElev + 10.5` (`baseZ105`). Entonces `roofZ - p.elev` da `3.5m` en lugar de `14m`, y los puntos base del polígono de sombra quedan con `elev = baseZ105` (flotando a `10.5m` de altura en `ThreeTerrainViewer.tsx`).
**Why it happens:** `tier.basePts` representa la cara inferior del bloque 3D escalonado, no su proyección vertical sobre el terreno natural.
**How to avoid:** Antes de invocar `projectDirectionalShadowOnTerrain` para cualquier `tier`, construir `const groundFootprint = tier.basePts.map(p => ({ x: p.x, y: p.y, elev: getGridElevAt(p.x, p.y) }))`.
**Warning signs:** `proposedAreaM2` disminuye al activar `applyExtraSetback` o las líneas rojas de sombra en 3D tienen vértices elevados sobre la malla de terreno.

### Pitfall 2: Clausura obsoleta (`Stale Closure`) en `handleUp` al arrastrar el volumen en `ContourViewer.tsx`
**What goes wrong:** El usuario arrastra el volumen en `ContourViewer.tsx`, lo suelta, y el lote vuelve a su posición original o no actualiza `customLotPts`.
**Why it happens:** `handleUp` se registra en `window.addEventListener('pointerup', handleUp)` dentro de `handleVolumePointerDown`. Si `handleUp` lee `dragOffset` del `useState`, lee el valor capturado cuando inició el clic (`{ x: 0, y: 0 }`).
**How to avoid:** Mantener `latestDragOffsetRef.current = { x: clampedDx, y: clampedDy }` sincronizado dentro de `handleMove` y leer `latestDragOffsetRef.current` dentro de `handleUp`.
**Warning signs:** El volumen se mueve durante el `pointermove`, pero al soltar el botón del ratón o cambiar a `3D Satelital` regresa al centro.

### Pitfall 3: Vértices duplicados por doble clic al cerrar lotes irregulares en `insetPolygonBisector`
**What goes wrong:** Al terminar de dibujar un lote con doble clic, los dos últimos vértices tienen la misma coordenada `(x, y)`, causando `len = 0` en el cálculo de normales de `insetPolygonBisector` y deformando una esquina.
**Why it happens:** En `ContourViewer.tsx:1270-1293` y `ThreeTerrainViewer.tsx:1099-1132`, el primer clic del doble clic (`e.detail === 1`) agrega un vértice antes de que el segundo clic (`e.detail === 2`) cierre el modo de dibujo.
**How to avoid:** Limpiar siempre vértices consecutivos a distancia `< 1e-4` y vértices colineales al inicio de `insetPolygonBisector`.
**Warning signs:** Un vértice del volumen extruido presenta una muesca o pico anómalo en el punto donde se hizo doble clic.

### Pitfall 4: Desfase de índices en `rasantePlanes` cuando `insetPolygonBisector` simplifica aristas colapsadas
**What goes wrong:** En un lote en "L" o "U" donde una arista estrecha colapsa durante el retranqueo, `topRoofPtsForRasante.length` pasa a ser menor que `lotPolygon.length` (ej. 5 vértices vs 6). El bucle de `rasantePlanes` (`src/lib/ogucService.ts:528-529`) conecta `lotPolygon[i]` con `topRoofPtsForRasante[i]`, cruzando planos de rasante entre fachadas distintas.
**How to avoid:** Verificar `const hasMatchingVertices = topRoofPtsForRasante.length === lotPolygon.length;` antes de indexar `topRoofPtsForRasante[i]`; si no coinciden, usar la proyección normal interior (`p1.x + inDxGrid`, `p1.y + inDyGrid`) que ya existe como fallback en `src/lib/ogucService.ts:540-544, 555-559`.
**Warning signs:** Planos de rasante inclinados torcidos diagonalmente sobre lotes en "L".

---

## Code Examples

Patrones verificados contra las firmas y tipos reales del repositorio:

### 1. Proyección Multinivel de Sombra Propuesta (`OGUC-01` — `src/lib/ogucService.ts`)
```typescript
// Source: Verificado contra src/lib/ogucService.ts:290-335, 607-626
function projectMultiTierDirectionalShadowOnTerrain(
  tiers: VolumeTier[],
  fallbackFootprintPts: Point3D[],
  fallbackTopElevs: number[],
  angleDeg: number,
  azimuthDeg: number,
  meshData: MeshData | undefined,
  n: number,
  m: number,
  getGridElevAt: (x: number, y: number) => number
): Point3D[] {
  if (!tiers || tiers.length === 0) {
    return projectDirectionalShadowOnTerrain(
      fallbackFootprintPts,
      fallbackTopElevs,
      angleDeg,
      azimuthDeg,
      meshData,
      n,
      m,
      getGridElevAt
    );
  }

  const combinedShadowPts: Point3D[] = [];
  for (const tier of tiers) {
    if (!tier.basePts || tier.basePts.length < 3) continue;
    // Aterrizar cada vértice base a la cota real del terreno para medir la altura total del techo sobre el suelo
    const groundedBasePts: Point3D[] = tier.basePts.map((p) => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y),
    }));
    const roofElevs: number[] = tier.roofPts.map((rp) => rp.elev);
    const tierShadowHull = projectDirectionalShadowOnTerrain(
      groundedBasePts,
      roofElevs,
      angleDeg,
      azimuthDeg,
      meshData,
      n,
      m,
      getGridElevAt
    );
    combinedShadowPts.push(...tierShadowHull);
  }

  if (combinedShadowPts.length < 3) {
    return projectDirectionalShadowOnTerrain(
      fallbackFootprintPts,
      fallbackTopElevs,
      angleDeg,
      azimuthDeg,
      meshData,
      n,
      m,
      getGridElevAt
    );
  }

  return convexHull3D(combinedShadowPts);
}
```

### 2. Traslación Rígida de Lote y Commit en `pointerup` (`OGUC-02` — `src/lib/ogucService.ts` & `src/components/ContourViewer.tsx`)
```typescript
// Source: Verificado contra src/lib/ogucService.ts:14-18 y src/components/ContourViewer.tsx:712-732
export function clampLotDragOffset(
  basePts: { x: number; y: number }[],
  dx: number,
  dy: number,
  n: number,
  m: number
): { x: number; y: number } {
  if (!basePts || basePts.length === 0) return { x: 0, y: 0 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of basePts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const maxStepX = Math.max(0, n - 1);
  const maxStepY = Math.max(0, m - 1);
  const clampedDx = Math.max(-minX, Math.min(maxStepX - maxX, dx));
  const clampedDy = Math.max(-minY, Math.min(maxStepY - maxY, dy));
  return {
    x: Number.isFinite(clampedDx) ? clampedDx : 0,
    y: Number.isFinite(clampedDy) ? clampedDy : 0,
  };
}

export function translateLotPolygon(
  basePts: { x: number; y: number }[],
  dx: number,
  dy: number,
  n: number,
  m: number,
  getGridElevAt: (x: number, y: number) => number
): Point3D[] {
  const { x: cdx, y: cdy } = clampLotDragOffset(basePts, dx, dy, n, m);
  return basePts.map((p) => {
    const nx = Math.max(0, Math.min(n - 1, p.x + cdx));
    const ny = Math.max(0, Math.min(m - 1, p.y + cdy));
    return {
      x: nx,
      y: ny,
      elev: getGridElevAt(nx, ny),
    };
  });
}
```

### 3. Retranqueo Robusto en Lotes Cóncavos con Poda de Lazos Auto-Intersectados (`OGUC-03` — `src/lib/ogucService.ts`)
```typescript
// Source: Verificado contra src/lib/ogucService.ts:104-198
interface Pt2D {
  x: number;
  y: number;
}

function signedPolygonArea2D(pts: Pt2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area * 0.5;
}

function intersectSegmentsStrict(
  a1: Pt2D,
  a2: Pt2D,
  b1: Pt2D,
  b2: Pt2D
): Pt2D | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;

  const s = ((a1.x - b1.x) * dby - (a1.y - b1.y) * dbx) / -denom;
  const t = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  const eps = 1e-6;
  if (s > eps && s < 1 - eps && t > eps && t < 1 - eps) {
    return {
      x: a1.x + s * dax,
      y: a1.y + s * day,
    };
  }
  return null;
}

function pruneSelfIntersections(pts: Pt2D[], expectedSign: number): Pt2D[] {
  let ring = pts.slice();
  const maxPasses = pts.length * 3;
  for (let pass = 0; pass < maxPasses; pass++) {
    let splitDone = false;
    const len = ring.length;
    if (len < 4) break;

    for (let i = 0; i < len && !splitDone; i++) {
      const iNext = (i + 1) % len;
      for (let j = i + 2; j < len && !splitDone; j++) {
        if (i === 0 && j === len - 1) continue; // Aristas adyacentes comparten vértice
        const jNext = (j + 1) % len;
        const hit = intersectSegmentsStrict(ring[i], ring[iNext], ring[j], ring[jNext]);
        if (hit) {
          // Dividir el polígono en el punto de cruce `hit` en dos sub-lazos cerrados
          const loop1: Pt2D[] = [hit, ...ring.slice(i + 1, j + 1)];
          const loop2: Pt2D[] = [...ring.slice(0, i + 1), hit, ...ring.slice(j + 1)];

          const score1 = signedPolygonArea2D(loop1) * expectedSign;
          const score2 = signedPolygonArea2D(loop2) * expectedSign;

          if (score1 >= score2 && score1 > 1e-5 && loop1.length >= 3) {
            ring = loop1;
          } else if (score2 > 1e-5 && loop2.length >= 3) {
            ring = loop2;
          } else {
            return [];
          }
          splitDone = true;
        }
      }
    }
    if (!splitDone) break;
  }
  return ring;
}
```

### 4. Huso Horario Dinámico y Fecha Local (`OGUC-04` — `src/lib/SunPosition.ts`)
```typescript
// Source: Verificado contra src/lib/SunPosition.ts:1-68 y Node v24 Intl.DateTimeFormat
export function parseLocalSolarDate(dateInput: string | Date): Date {
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T12:00:00`);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    // Si fue creado con new Date('YYYY-MM-DD'), sus componentes UTC son 00:00:00.000Z
    if (
      dateInput.getUTCHours() === 0 &&
      dateInput.getUTCMinutes() === 0 &&
      dateInput.getUTCSeconds() === 0 &&
      dateInput.getUTCMilliseconds() === 0
    ) {
      return new Date(
        dateInput.getUTCFullYear(),
        dateInput.getUTCMonth(),
        dateInput.getUTCDate(),
        12,
        0,
        0
      );
    }
    return new Date(dateInput.getTime());
  }
  return new Date();
}

export function getSolarTimezoneOffset(lat: number, lon: number, date: Date): number {
  const localDate = parseLocalSolarDate(date);
  const year = localDate.getFullYear();
  const month = localDate.getMonth(); // 0 = Enero .. 11 = Diciembre
  const day = localDate.getDate();

  // Chile Continental (incluyendo Magallanes y territorio continental entre -56° y -17° lat, -76° y -66° lon)
  const isContinentalChile = lat >= -56 && lat <= -17 && lon >= -76 && lon <= -66;
  if (isContinentalChile) {
    if (lat <= -49) {
      return -3; // Región de Magallanes mantiene UTC-3 permanente
    }
    try {
      const utcMidday = new Date(Date.UTC(year, month, day, 16, 0, 0));
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago',
        timeZoneName: 'shortOffset',
      }).formatToParts(utcMidday);
      const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
      const match = tzPart.match(/GMT([+-]\d+)(?::(\d+))?/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const mins = match[2] ? parseInt(match[2], 10) / 60 : 0;
        return hours + (hours < 0 ? -mins : mins);
      }
    } catch (_) {
      // Fallback determinista para Chile central (horario de invierno Abr-Ago = -4, verano Sep-Mar = -3)
    }
    return month >= 3 && month <= 7 ? -4 : -3;
  }

  // Resto del mundo: aproximación astronómica por huso longitudinal (15° = 1 hora)
  const approxOffset = Math.round(lon / 15) || 0;
  return Math.max(-12, Math.min(14, approxOffset));
}
```

---

## State of the Art

| Old Approach (v1.3.1) | Current Approach (v1.4 Phase 1) | When Changed | Impact |
|-----------------------|---------------------------------|--------------|--------|
| Proyectar solo `tiers[tiers.length - 1]` con `p.elev = baseZ105` en `computeOgucModel` | Proyectar todos los `tiers` activos aterrizados al DEM (`getGridElevAt`) y combinar sus huellas con `convexHull3D` | Phase 1 | Elimina el encogimiento irreal de la sombra propuesta al activar Art. 2.6.12 (`> 10.5m`) o edificación continua. |
| `dragOffset` efímero en `ContourViewer.tsx` | Traslación rígida `translateLotPolygon` volcada a `customLotPts` en `pointerup` con remuestreo de cota `elev` | Phase 1 | Paridad 100% inmediata entre `ContourViewer`, `ThreeTerrainViewer` y archivos `.geoarc`. |
| Bisectriz simple sin limpieza de lazos ni colapso de aristas cortas | Pipeline de saneamiento + miter acotado + colapso de aristas invertidas + poda de auto-intersecciones | Phase 1 | Permite lotes irregulares cóncavos ("L", "U") sin corromper `THREE.ExtrudeGeometry` ni el área normativa. |
| `tzOffset = -4` fijo y `new Date('YYYY-MM-DD')` (medianoche UTC) | `getSolarTimezoneOffset` (`America/Santiago` UTC-3/UTC-4 + `Math.round(lon / 15)`) y `parseLocalSolarDate` (`T12:00:00`) | Phase 1 | Elimina el error de 1 día en fechas ISO y corrige la hora solar en verano chileno y en ubicaciones globales. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| *(empty)* | Todas las afirmaciones, nombres de funciones, números de línea y comportamientos del runtime fueron verificados directamente en la sesión actual con `view_file`, `grep_search` y `node -e`. | — | — |

---

## Open Questions

1. **¿Qué ocurre si el usuario arrastra el lote por defecto (cuando `customLotPts` aún es `null`) en `ContourViewer.tsx`?**
   - **What we know:** Cuando `customLotPts` es `null`, `ContourViewer.tsx:721-731` y `ThreeTerrainViewer.tsx:171-180` generan un lote rectangular por defecto centrado en `((n-1)/2, (m-1)/2)` con semianchos `0.11 * n` y `0.11 * m`.
   - **Resolution:** Al finalizar el arrastre de ese lote por defecto en `ContourViewer.tsx`, `handleUp` materializará los 4 vértices desplazados llamando a `setCustomLotPts(committedPts)`. Así `ThreeTerrainViewer.tsx` y la exportación `.geoarc` reciben inmediatamente la nueva ubicación del lote sin necesidad de que el usuario haya usado primero "Dibujar Lote".

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Compilación TypeScript y ejecución de pruebas | ✓ | `v24.18.1` [VERIFIED: CLI probe] | — |
| npm | Ejecución de scripts (`npm run lint`, `npm run build`) | ✓ | `11.12.0` [VERIFIED: CLI probe] | — |
| TypeScript (`tsc`) | Verificación estática (`npm run lint`) | ✓ | `~5.8.2` [VERIFIED: package.json:41] | — |
| `tsx` | Ejecución de scripts de verificación TypeScript | ✓ | `^4.21.0` [VERIFIED: package.json:40] | `node --experimental-strip-types` en Node 24 |

**Missing dependencies with no fallback:**
- Ninguna.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | TypeScript Compiler (`tsc --noEmit`) + Script de verificación determinista con `npx tsx` (Nota: la suite completa `Vitest` corresponde a `QUAL-01` en la Phase 4 según `REQUIREMENTS.md:31, 67`) |
| Config file | `tsconfig.json` [VERIFIED: tsconfig.json:1-27] |
| Quick run command | `npm run lint` |
| Full suite command | `npm run lint && npx tsx scripts/verify-phase1.ts` (o comando inline `npx tsx -e "..."`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **OGUC-01** | Con `maxHeight = 16`, `minSetback = 3`, `continuousBaseHeight = 7`, `applyExtraSetback = true`, `ogucModel.shadows.proposedAreaM2` proyecta los 3 `tiers` (`continuous`, `main`, `upper_stepped`) y es mayor o igual que la sombra de `main` solo y mayor que la de `upper_stepped` solo; todos los puntos de `proposedPolygons` tienen cota de terreno (`elev === getGridElevAt(x, y)`). | unit (deterministic script) | `npx tsx -e "import { computeOgucModel } from './src/lib/ogucService'; ..."` | ✅ Verificable vía `npx tsx` sobre `src/lib/ogucService.ts` |
| **OGUC-02** | `translateLotPolygon` desplaza un lote de forma rígida, acota contra `[0, n-1] × [0, m-1]` sin deformar dimensiones, remuestrea `elev` con `getGridElevAt`, y `ContourViewer.tsx` invoca `setCustomLotPts` en `pointerup` reseteando `dragOffset` a `{ x: 0, y: 0 }`. | unit + static check | `npm run lint && npx tsx -e "import { translateLotPolygon } from './src/lib/ogucService'; ..."` | ✅ Verificable vía `npx tsx` y `tsc --noEmit` |
| **OGUC-03** | `insetPolygonBisector` sobre lotes cóncavos en forma de "L" y "U" (incluyendo vértices duplicados y esquinas agudas) retorna un polígono con 0 auto-intersecciones de aristas, misma orientación de giro y área positiva menor al lote original. | unit (deterministic script) | `npx tsx -e "import { insetPolygonBisector, computeOgucModel } from './src/lib/ogucService'; ..."` | ✅ Verificable vía `npx tsx` sobre `src/lib/ogucService.ts` |
| **OGUC-04** | `getSunPosition` en Santiago (`-33.45, -70.67`) usa `UTC-3` en verano (`2024-12-21`) y `UTC-4` en invierno (`2024-06-21`), usa `Math.round(lon / 15)` fuera de Chile (ej. Madrid `lon = -3.7 -> 0`), y `new Date('2024-01-01')` produce idéntico resultado que `new Date('2024-01-01T12:00:00')` (`N = 1`, sin desfase a `2023-12-31`). | unit (deterministic script) | `npx tsx -e "import { getSunPosition, parseLocalSolarDate, getSolarTimezoneOffset } from './src/lib/SunPosition'; ..."` | ✅ Verificable vía `npx tsx` sobre `src/lib/SunPosition.ts` |

### Sampling Rate
- **Per task commit:** `npm run lint` + comando `npx tsx -e "..."` específico de la tarea (< 5 segundos).
- **Per wave merge:** `npm run lint` + verificación integrada de `OGUC-01`..`OGUC-04` + `npm run build`.
- **Phase gate:** Compilación limpia (`npm run lint` y `npm run build`) y 100% de aserciones matemáticas de `OGUC-01`..`OGUC-04` en verde.

### Wave 0 Gaps
None — `typescript` (`tsc`) y `tsx` (`^4.21.0`) ya están instalados en `node_modules` y operativos en Windows PowerShell `[VERIFIED: package.json:40-41]`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Aplicación 100% client-side sin autenticación (`REQUIREMENTS.md:47`). |
| V3 Session Management | no | Sin sesiones de servidor. |
| V4 Access Control | no | Sin control de acceso multiusuario. |
| V5 Input Validation | yes | Validación numérica (`Number.isFinite`), acotamiento de rangos (`Math.max`/`Math.min`), límite de iteraciones en `pruneSelfIntersections` (`maxPasses = pts.length * 3`) para evitar bucles infinitos (DoS en hilo principal) ante polígonos degenerados, y validación de `Date` (`!Number.isNaN(date.getTime())`). |
| V6 Cryptography | no | No aplica en cálculos geométricos/astronómicos. |

### Known Threat Patterns for Client-Side Computational Geometry

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bucle infinito en resolución de auto-intersecciones poligonales o raymarching | Denial of Service (UI Freeze) | Acotar estrictamente el número máximo de pasadas en `pruneSelfIntersections` (`maxPasses = pts.length * 3`) y retornar `null` (`collapsed: true`) si persiste degeneración geométrica. |
| Propagación de `NaN` / `Infinity` por división por cero en ángulos de $0^\circ$ o $180^\circ$ (`len = 0`, `dot = 0`) | Denial of Service / Tampering | Pre-filtrar vértices duplicados (`len < 1e-4`), acotar denominadores (`Math.max(dot, 1e-4)`) y validar `Number.isFinite` en desplazamientos de lote. |

---

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: src/lib/ogucService.ts:1-661]` — Inspección directa de `insetPolygonBisector`, `convexHull3D`, `computePolygonAreaM2`, `projectDirectionalShadowOnTerrain` y `computeOgucModel`.
- `[VERIFIED: src/lib/SunPosition.ts:1-68]` — Inspección directa de `getSunPosition`, cálculo de día del año `N` y `tzOffset = -4`.
- `[VERIFIED: src/components/ContourViewer.tsx:46-73, 439-502, 597-618, 712-760, 841-908, 1260-1310, 1502-1690]` — Inspección directa de `dragOffset`, `effectiveLotBasePts`, `handleVolumePointerDown`, `screenToGrid` y `sunPosition`.
- `[VERIFIED: src/components/ThreeTerrainViewer.tsx:143-194, 708-930, 1007-1134]` — Inspección directa de `sunPos`, `effectiveLotBasePts`, `ogucModel` y extrusión con `THREE.ExtrudeGeometry`.
- `[VERIFIED: src/App.tsx:82-104, 330-449, 1020-1095]` — Inspección directa de `solarDate`, `customLotPts`, `handleExportGeoarc`, `handleImportGeoarc` y paso de props a ambos visores.
- `[VERIFIED: .planning/phases/01-precisi-n-normativa-oguc-y-motor-solar/01-CONTEXT.md:1-92]` — Decisiones bloqueadas `D-01` a `D-04`.
- `[VERIFIED: .planning/REQUIREMENTS.md:10-14]` y `[VERIFIED: .planning/ROADMAP.md:22-33]` — Criterios de éxito de `OGUC-01`, `OGUC-02`, `OGUC-03`, `OGUC-04`.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — Cero dependencias externas nuevas; todas las herramientas (`tsc`, `tsx`, `Intl.DateTimeFormat`, `three`, `d3`, `react`) están instaladas y probadas en el entorno local.
- Architecture: **HIGH** — Se inspeccionaron todas las líneas relevantes de los 5 archivos objetivo (`ogucService.ts`, `SunPosition.ts`, `ContourViewer.tsx`, `ThreeTerrainViewer.tsx`, `App.tsx`).
- Pitfalls: **HIGH** — Se identificaron causas raíz exactas, incluyendo el bug acoplado de `tier.basePts[i].elev = baseZ105` en `OGUC-01`, la clausura obsoleta de `handleUp` en `OGUC-02` y el desfase de índices de `rasantePlanes` en `OGUC-03`.

**Research date:** 2026-10-28
**Valid until:** 2026-11-28 (30 days — pure mathematical/geometric domain in stable local codebase)
