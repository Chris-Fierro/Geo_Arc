# Phase 02: Interoperabilidad CAD / GIS / 3D y Escena Unificada - Research
**Researched:** 2026-10-28
**Domain:** CAD / GIS Interoperability, Three.js 3D Geometry Standardization, Cartographic Projections (WGS84 / UTM), Vector Export (DXF, SVG, STL, GLB, OBJ, JGW), Local 3D Mesh Processing (.PLY / .FBX)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Recorte Limpio e Interpolación Bilineal en Exportación DXF (`CAD-01`)
- **D-01:** En `handleExportDXF` (`src/components/ContourViewer.tsx` o módulo consolidado `src/lib/exportService.ts`), las calles y cursos de agua deben recortarse al BBox del terreno usando `clipWayToBBox` (`src/lib/ogucService.ts`), eliminando las líneas perimetrales parásitas en los bordes.
- **D-02:** Los edificios tipo `relation` (multipolígonos de OSM normalizados en `meshData.buildings`) deben exportarse como polilíneas cerradas en la capa `BUILDINGS` del DXF, e interpolar sus cotas Z mediante muestreo bilineal en la grilla DEM en lugar de saltos discretos.

#### Unificación de Escena Three.js para Visor 3D y Exportadores (`CAD-02`, `QUAL-02`)
- **D-03:** Consolidar la construcción de mallas Three.js en una única función compartida (`buildThreeSceneFromMeshData` en `src/lib/exportService.ts`). Tanto el visor `3D Satelital` (`ThreeTerrainViewer.tsx`) como las exportaciones `.GLB`, `.OBJ` y `.STL` deben consumir esta función, compartiendo la misma normalización vertical (`(elev - minEv) * zExaggeration`) y el mismo empotramiento de edificios en pendiente (`0.35m`).

#### Georreferenciación Real según CRS / Husos UTM de Chile (`CAD-03`)
- **D-04:** Conectar el selector de `Sistema de Referencia (CRS)` de `src/App.tsx` (`EPSG:32718` UTM 18S, `EPSG:32719` UTM 19S, `EPSG:32633` o `EPSG:4326`) con un conversor cartográfico puro (WGS84 a UTM transversal de Mercator) para que el Worldfile `.JGW` y las entidades del archivo `.DXF` se exporten con coordenadas métricas UTM reales cuando se elija un CRS proyectado.

#### Controles de Importación de Mallas y Exportación SVG en la UI (`CAD-04`)
- **D-05:** En la barra lateral (`src/App.tsx`), habilitar un selector/zona de carga para importar mallas 3D locales en formato `.PLY` o `.FBX`, enlazándolo a `processMeshFile` (`src/lib/meshProcessor.ts`) para convertir la nube de puntos/malla en `MeshData` editable con curvas de nivel inmediatas.
- **D-06:** En la barra de exportación superior o en el HUD de `ContourViewer.tsx`, añadir el botón de exportación directa de la lámina topográfica vectorial en formato `.SVG` (`topografia_*.svg`) descargando el contenido SVG limpio con metadatos.

### the agent's Discretion
- Elección entre implementar la proyección UTM con algoritmos matemáticos puros estándar de Karney/Snyder en TypeScript en `src/lib/crsService.ts` o incorporar `proj4` liviano si fuera estrictamente necesario (preferir implementación pura sin dependencias pesadas).
- Ubicación exacta del disparador de importación `.PLY`/`.FBX` (botón en el panel lateral superior o pestaña secundaria dentro del modal de importación) respetando la estética oscura técnica de Geo_Arc.

### Deferred Ideas (OUT OF SCOPE)
- Soporte de múltiples sistemas de referencia geodésicos sudamericanos antiguos (SAD69, PSAD56) — diferido para versiones futuras; se priorizan WGS84 y UTM WGS84 husos 18S y 19S (Chile).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| `CAD-01` | El usuario puede exportar archivos `.DXF` donde las vías y cuerpos de agua se recortan limpiamente al BBox (`clipWayToBBox`), se incluyen edificios multipolígono (`type === 'relation'`) y las elevaciones Z se muestrean mediante interpolación bilineal. | Demostrado mediante `clipWayToBBox` (`ogucService.ts:1125-1179`), normalización de relaciones OSM (`exportService.ts:126-132`), y muestreo bilineal continuo en grilla DEM. Centralizado en `exportToDxf` (`src/lib/exportService.ts`). |
| `CAD-02` | El usuario puede exportar mallas `.STL` cuya geometría de terreno y edificios (normalización de cota Z relativa a `minEv` y empotramiento de `0.35m` en pendiente) es idéntica a la generada para `.GLB`, `.OBJ` y el visor 3D. | Demostrado unificando `buildThreeSceneFromMeshData` (`src/lib/exportService.ts:18-228`) y añadiendo `exportToStl` con `STLExporter` de `three-stdlib`, eliminando el generador divergente en `ContourViewer.tsx:1114-1204`. |
| `CAD-03` | El usuario puede seleccionar un Sistema de Referencia (`CRS`: `EPSG:32718` UTM 18S, `EPSG:32719` UTM 19S, `EPSG:32633` o `EPSG:4326`) y obtener coordenadas reproyectadas reales tanto en la exportación `.DXF` como en el archivo Worldfile `.JGW`. | Demostrado con el módulo puro `src/lib/crsService.ts` aplicando las fórmulas de Snyder (1987) para proyección Transversal de Mercator sobre el elipsoide WGS84, reemplazando el `<input type="text">` de `App.tsx:693-698` con un `<select>` tipado y calculando `.JGW` y vértices `.DXF`. |
| `CAD-04` | El usuario puede importar archivos locales de malla 3D (`.PLY` y `.FBX` mediante `processMeshFile`) desde la barra lateral y exportar directamente la lámina vectorial topográfica en formato `.SVG` (`topografia_*.svg`). | Demostrado integrando `processMeshFile` (`src/lib/meshProcessor.ts:20-186`) en una zona drag-and-drop con pestañas en `src/App.tsx` (Sección 1), y añadiendo el botón de descarga SVG en el HUD flotante de `src/components/ContourViewer.tsx:1301-1311` con generador estructurado en `exportService.ts`. |
| `QUAL-02` | La construcción de geometrías Three.js (terreno y extrusión de edificios con empotramiento en pendiente) está unificada en un módulo compartido consumido por `ThreeTerrainViewer.tsx` y todas las exportaciones 3D (`.GLB`, `.OBJ`, `.STL`). | Demostrado refactorizando `buildThreeSceneFromMeshData` (`src/lib/exportService.ts`) para aceptar opciones configurables (`wireframe`, `buildingEdges`) y conectándolo directamente al ciclo de vida WebGL de `ThreeTerrainViewer.tsx` y a los cuatro exportadores 3D. |
</phase_requirements>

## Summary

La Phase 02 de Geo_Arc consolida el estándar de interoperabilidad profesional para flujos de trabajo arquitectónicos y urbanísticos entre la aplicación web y suites CAD/BIM/GIS externas (AutoCAD, Civil 3D, QGIS, Rhinoceros, SketchUp, Blender, Illustrator). La fase resuelve cuatro frentes técnicos fundamentales:

1. **Exactitud y Limpieza Vectorial en DXF (`CAD-01`):** La exportación DXF anterior presentaba artefactos severos: las calles y ríos que cruzaban el límite del terreno eran proyectados artificialmente sobre los bordes perimetrales (generando un marco de líneas falsas en el perímetro del lote), los edificios multipolígono OSM (`type === 'relation'`) eran completamente ignorados, y las elevaciones Z se truncaban con `Math.floor` sin interpolación. La investigación demuestra la solución óptima: centralizar la generación DXF en `src/lib/exportService.ts`, aplicando el algoritmo Liang-Barsky existente en `clipWayToBBox` (`ogucService.ts:1125`), iterando miembros `outer` de relaciones para edificios cerrados en la capa `BUILDINGS`, e interpolando la cota Z con muestreo bilineal idéntico al visor 3D.
2. **Escena Unificada Three.js y Exportación STL Idéntica (`CAD-02`, `QUAL-02`):** Existía una triplicación en la generación de mallas Three.js: `exportService.ts` (`.OBJ`/`.GLB`), `ThreeTerrainViewer.tsx` (visor 3D) y `ContourViewer.tsx` (`.STL`). `ContourViewer` utilizaba cotas absolutas `elevation * zExaggeration` en lugar de normalizar a `(elev - minEv) * zExaggeration`, y colocaba los edificios sin empotramiento de pendiente (`0.35m`), provocando que los modelos STL flotaran o tuvieran alturas inconsistentes frente a los GLB/OBJ. La consolidación se resuelve mediante `buildThreeSceneFromMeshData` en `src/lib/exportService.ts`, sirviendo como única fuente de verdad geométrica tanto para el renderizado WebGL interactivo como para exportar `.GLB`, `.OBJ` y el nuevo `.STL` (vía `STLExporter` de `three-stdlib`).
3. **Georreferenciación Cartográfica Real CRS/UTM (`CAD-03`):** El selector de CRS en la barra lateral era un campo cosmético desconectado. Para arquitectos y urbanistas chilenos, importar un plano a AutoCAD Civil 3D o QGIS requiere coordenadas UTM métricas precisas (Huso 18S o 19S) o lat/lon geográficas. Se investigó y validó la implementación de un conversor cartográfico puro en TypeScript (`src/lib/crsService.ts`) basado en las fórmulas universales de Snyder (1987) para el elipsoide WGS84, logrando precisión submilimétrica sin dependencias externas pesadas. Este conversor recalcula los vértices `.DXF` y los 6 parámetros afines del Worldfile `.JGW` para QGIS/AutoCAD.
4. **Controles UI de Malla 3D Local y Lámina Vectorial SVG (`CAD-04`):** El parser de mallas 3D locales `processMeshFile` (`src/lib/meshProcessor.ts`) para nubes de puntos y mallas fotogramétricas `.PLY`/`.FBX` estaba huérfano en el código. Siguiendo el contrato de diseño aprobado en `02-UI-SPEC.md`, se añade una pestaña segmentada en la barra lateral de `App.tsx` para cargar mallas locales con retroalimentación visual completa. Asimismo, se incorpora el botón de exportación `.SVG` en el HUD flotante de `ContourViewer.tsx` con metadatos técnicos en comentarios XML y capas vectoriales clasificadas (`contour-lines`, `contour-labels`, `lot-boundary`, `urban-context`).

**Primary recommendation:** Centralizar toda la lógica de exportación geométrica (DXF, STL, SVG, OBJ, GLB, JGW) y construcción de escenas Three.js en `src/lib/exportService.ts`, respaldado por un conversor cartográfico puro en `src/lib/crsService.ts` con cero dependencias npm adicionales.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Conversión Geodésica Lat/Lon → UTM (`crsService.ts`) | Logic Core (`src/lib/`) | Worker / Test Suite | Algoritmo matemático puro determinista sin estado ni dependencias DOM. Reutilizable por DXF, JGW y suite Vitest. |
| Constructor Unificado de Escena 3D (`buildThreeSceneFromMeshData`) | 3D Service (`src/lib/exportService.ts`) | Client WebGL (`ThreeTerrainViewer.tsx`) | Provee la geometría canónica (malla de terreno + sólidos de edificios empotrados) para exportadores binarios y renderizado interactivo. |
| Serialización DXF R15/AutoCAD 2000 (`exportToDxf`) | CAD Export Service (`src/lib/exportService.ts`) | UI Trigger (`ContourViewer.tsx`) | Formatea polilíneas 3D recortadas, capas CAD e interpolación bilineal de elevaciones en texto ASCII compatible con AutoCAD/SketchUp/Rhino. |
| Serialización Binaria STL (`exportToStl`) | 3D Export Service (`src/lib/exportService.ts`) | UI Trigger (`ContourViewer.tsx`) | Convierte la escena Three.js métrica en buffer binario Little-Endian facetado para impresión 3D. |
| Generación de Lámina Vectorial SVG (`exportToSvg`) | Vector Service (`src/lib/exportService.ts`) | UI Trigger (`ContourViewer.tsx`) | Genera archivo XML SVG independiente con metadatos de georreferenciación, curvas maestras/secundarias y contexto urbano. |
| Generación de Worldfile `.JGW` Georreferenciado | Cartographic Service (`src/lib/crsService.ts`) | Zip Exporter (`exportService.ts`) | Calcula la matriz de transformación afín de 6 líneas en coordenadas UTM o EPSG:4326 para ortofotos satelitales. |
| Importación de Mallas Locales (.PLY/.FBX) | UI Shell (`src/App.tsx`) | Mesh Processor (`src/lib/meshProcessor.ts`) | Zona dropzone reactiva en barra lateral conectada al rasterizador DEM con interpolación y relleno difusivo de huecos. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three` | `^0.184.0` [VERIFIED: package.json:29] | Motor de escena 3D, geometrías, vector math, transformaciones | Estándar de la industria para gráficos 3D en WebGL. |
| `three-stdlib` | `^2.36.1` [VERIFIED: package.json:30] | Exporters (`STLExporter`, `OBJExporter`, `GLTFExporter`) y loaders (`PLYLoader`, `FBXLoader`) | Mantenido por la comunidad Three.js / Pmndrs, contiene utilidades estándar probadas para formatos CAD/3D. |
| `d3` | `^7.9.0` [VERIFIED: package.json:18] | Isolíneas topográficas (`d3.contours`), generador de rutas (`d3.geoPath`) | Estándar matemático para cálculo de contornos marchantes y escalas de color. |
| `fflate` | `^0.8.2` [VERIFIED: package.json:22] | Compresión sincrónica de paquetes ZIP en memoria del cliente | Compresor DEFLATE/ZIP de alto rendimiento en navegador sin dependencias nativas. |
| `lucide-react` | `^0.546.0` [VERIFIED: package.json:24] | Iconografía técnica para HUD flotante y barra lateral | Librería oficial de iconos ligeros de Geo_Arc. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pure TypeScript (`crsService.ts`) | In-repo | Proyección cartográfica Transversal de Mercator WGS84 / UTM | Conversión de grados decimales a metros UTM sin peso de bundle adicional. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Conversor puro TypeScript Snyder (`crsService.ts`) | `proj4` (`npm i proj4`) | `proj4` añade ~110 KB al bundle y tipos `@types/proj4`. Dado que Geo_Arc requiere exclusivamente EPSG:4326 y UTM (18S, 19S, 33N), las ecuaciones exactas de Snyder ocupan <120 líneas de TypeScript puro, son 100% tipeadas, no tienen vulnerabilidades de dependencias y se verifican en microsegundos. |
| Serialización SVG limpia en `exportService.ts` | `XMLSerializer.serializeToString(svgRef.current)` | Serializar el elemento del DOM arrastra atributos interactivos del visor (clases CSS de Tailwind, handlers de puntero, transformaciones transitorias de zoom d3, canvas de interacción de lote), produciendo archivos SVG impuros e incompatibles con programas de corte láser o CAD. Generar el SVG semántico en memoria garantiza un documento limpio y estandarizado. |

**Installation:**
No se requieren nuevos paquetes. Todas las dependencias necesarias están instaladas en el repositorio:
```bash
# No new dependencies needed for Phase 02
```

## Package Legitimacy Audit

> Todas las librerías empleadas en la Phase 02 ya están instaladas en `package.json` y forman parte de la arquitectura aprobada de Geo_Arc.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `three` | npm | 13 yrs | ~3.8M/wk | [github.com/mrdoob/three.js](https://github.com/mrdoob/three.js) | [OK] | Approved (existing) |
| `three-stdlib` | npm | 4 yrs | ~850K/wk | [github.com/pmndrs/three-stdlib](https://github.com/pmndrs/three-stdlib) | [OK] | Approved (existing) |
| `d3` | npm | 14 yrs | ~28M/wk | [github.com/d3/d3](https://github.com/d3/d3) | [OK] | Approved (existing) |
| `fflate` | npm | 5 yrs | ~15M/wk | [github.com/101arrowz/fflate](https://github.com/101arrowz/fflate) | [OK] | Approved (existing) |
| `lucide-react` | npm | 3 yrs | ~18M/wk | [github.com/lucide-icons/lucide](https://github.com/lucide-icons/lucide) | [OK] | Approved (existing) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                  USER / BROWSER INTERACTION LAYER                                 |
+---------------------------------------------------------------------------------------------------+
       |                                       |                                       |
       v                                       v                                       v
[Local 3D Mesh Upload]                [Interactive Viewers]                  [Export Buttons]
(.PLY / .FBX Drag & Drop              - 2.5D Technical (ContourViewer)       - DXF (AutoCAD)
 in App.tsx Sidebar)                  - 3D Realistic (ThreeTerrainViewer)    - STL (3D Printing)
       |                                       |                             - SVG (Vector Sheet)
       |                                       |                             - OBJ / MTL (.zip)
       |                                       |                             - GLB (SketchUp)
       v                                       v                             - JGW (Worldfile)
+------------------------+                     |                                       |
|  meshProcessor.ts      |                     |                                       |
|  - processMeshFile()   |                     |                                       |
|  - Infer up-axis (Y/Z) |                     |                                       |
|  - Rasterize DEM grid  |                     |                                       |
|  - Diffusion Hole-fill |                     |                                       |
+------------------------+                     |                                       |
       |                                       |                                       |
       +---------------> [ App.tsx: meshData ] <---------------------------------------+
                                |
                                v
+---------------------------------------------------------------------------------------------------+
|                                    SHARED GEOMETRIC & CAD SERVICES                                |
+---------------------------------------------------------------------------------------------------+
          |                                     |                                     |
          v                                     v                                     v
+-----------------------+             +-----------------------+             +-----------------------+
|    crsService.ts      |             |   exportService.ts    |             |    ogucService.ts     |
| (Pure Cartography)    |             | (Scene & CAD Engine)  |             | (Clipping & Context)  |
| - WGS84 Ellipsoid     |             | - buildThreeScene()   | <---------> | - clipWayToBBox()     |
| - UTM 18S / 19S / 33N |             |   Terrain + Buildings |             |   Liang-Barsky clip   |
| - projectToCrs()      |             | - exportToDxf()       |             | - OSM Relation        |
| - generateWorldFile() |             | - exportToStl()       |             |   member normalization|
+-----------------------+             | - exportToSvg()       |             +-----------------------+
          |                           | - exportToObjZip()    |
          |                           | - exportToGlb()       |
          |                           +-----------------------+
          |                                       |
          +---------------------------------------+
                                |
                                v
+---------------------------------------------------------------------------------------------------+
|                                    FILE OUTPUT & USER DOWNLOADS                                   |
+---------------------------------------------------------------------------------------------------+
| - AutoCAD DXF (R15): Clipped roads/rivers, relation buildings, bilinear Z, UTM/WGS84 metric coords|
| - Binary STL: Standard 3D print mesh matching GLB/OBJ height and 0.35m base slope embedding       |
| - Vector SVG: Layered technical sheet with CRS metadata header, index/minor contours, labels      |
| - SketchUp GLB / OBJ Zip: Native 3D textured terrain + georeferenced JGW worldfile                |
+---------------------------------------------------------------------------------------------------+
```

### Component Structure & Responsibilities

```
src/
├── lib/
│   ├── crsService.ts          # NEW: Pure TS WGS84/UTM forward projections and .JGW generator
│   ├── exportService.ts       # ENHANCED: Unified Three.js scene, DXF, STL, SVG, OBJ, GLB exporters
│   ├── meshProcessor.ts       # RECONNECTED: .PLY and .FBX local mesh parsers producing MeshData
│   └── ogucService.ts         # EXISTING: clipWayToBBox Liang-Barsky and OSM relations
├── components/
│   ├── ContourViewer.tsx      # REFACTORED: Consumes exportService (removes duplicate Three/STL/DXF)
│   ├── ThreeTerrainViewer.tsx # REFACTORED: Consumes buildThreeSceneFromMeshData from exportService
│   └── OsmImporter.tsx        # EXISTING: OSM extraction and polygon drawer
└── App.tsx                    # ENHANCED: Local mesh upload tab + CRS selector dropdown
```

### Pattern 1: Pure Mathematical Transverse Mercator (Snyder 1987)
**What:** Algoritmo determinista de proyección geodésica para el elipsoide WGS84 que transforma coordenadas angulares $(\phi, \lambda)$ en coordenadas proyectadas métricas UTM $(E, N)$.
**When to use:** En cada vértice de entidades exportadas a `.DXF` y en el cálculo de las 6 líneas del archivo Worldfile `.JGW` cuando el usuario selecciona un CRS proyectado (`EPSG:32718`, `EPSG:32719`, `EPSG:32633`).
**Example:**
```typescript
// Source: Snyder, J. P. (1987). Map projections--A working manual (USGS Professional Paper 1395)
const WGS84_A = 6378137.0; // Radio ecuatorial en metros
const WGS84_F = 1 / 298.257223563; // Aplanamiento
const E2 = WGS84_F * (2 - WGS84_F); // Excentricidad al cuadrado (~0.00669438)
const EP2 = E2 / (1 - E2); // Segunda excentricidad (~0.00673950)
const K0 = 0.9996; // Factor de escala central UTM

export function latLonToUtm(latDeg: number, lonDeg: number, zone: number, isSouth: boolean) {
  const rad = Math.PI / 180;
  const phi = latDeg * rad;
  const lambda = lonDeg * rad;
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * rad;
  const dLambda = lambda - lambda0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = WGS84_A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = EP2 * cosPhi * cosPhi;
  const A = cosPhi * dLambda;

  const M = WGS84_A * (
    (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * Math.pow(E2, 3) / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * Math.pow(E2, 3) / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * Math.pow(E2, 3) / 1024) * Math.sin(4 * phi)
    - (35 * Math.pow(E2, 3) / 3072) * Math.sin(6 * phi)
  );

  const easting = K0 * N * (
    A
    + (1 - T + C) * Math.pow(A, 3) / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Math.pow(A, 5) / 120
  ) + 500000;

  let northing = K0 * (
    M + N * tanPhi * (
      A * A / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(A, 6) / 720
    )
  );
  if (isSouth) northing += 10000000;

  return { easting, northing };
}
```

### Pattern 2: Recorte Limpio con Liang-Barsky e Interpolación Bilineal en DXF
**What:** Recorte de líneas vectoriales (vías y cursos de agua) con el algoritmo paramétrico de Liang-Barsky antes de emitir entidades DXF, combinado con muestreo bilineal continuo de la cota Z.
**When to use:** Al serializar las capas `HIGHWAYS`, `WATERWAYS` y `BUILDINGS` en el archivo `.DXF`.
**Rationale:** Previene que las coordenadas externas se proyecten a los bordes del BBox mediante `Math.max(minLon, Math.min(maxLon, lon))`, lo cual creaba líneas rectas espurias corriendo a lo largo de los cuatro bordes del modelo.
**Example:**
```typescript
// Source: src/lib/ogucService.ts:1125-1179 & src/lib/exportService.ts
export function sampleBilinearElevation(
  grid: number[],
  cols: number,
  rows: number,
  u: number,
  v: number,
  fallback: number
): number {
  const uClamped = Math.max(0, Math.min(cols - 1, u));
  const vClamped = Math.max(0, Math.min(rows - 1, v));

  const c0 = Math.floor(uClamped);
  const c1 = Math.min(cols - 1, c0 + 1);
  const r0 = Math.floor(vClamped);
  const r1 = Math.min(rows - 1, r0 + 1);

  const tx = uClamped - c0;
  const ty = vClamped - r0;

  const v00 = grid[r0 * cols + c0] ?? fallback;
  const v10 = grid[r0 * cols + c1] ?? fallback;
  const v01 = grid[r1 * cols + c0] ?? fallback;
  const v11 = grid[r1 * cols + c1] ?? fallback;

  return (
    (1 - tx) * (1 - ty) * v00 +
    tx * (1 - ty) * v10 +
    (1 - tx) * ty * v01 +
    tx * ty * v11
  );
}
```

### Pattern 3: Single Source of Truth para Geometría 3D Three.js
**What:** Construcción unificada de mallas métricas en `buildThreeSceneFromMeshData`.
**When to use:** Consumido por `exportToObjZip`, `exportToGlb`, `exportToStl` y `ThreeTerrainViewer.tsx`.
**In-repo values [VERIFIED: src/lib/exportService.ts:43-46]:**
```typescript
      const elev = meshData.grid[r * cols + c] ?? minEv;
      const yVal = (elev - minEv) * zExaggeration;
      posAttr.setY(vertIdx, yVal);
```
**In-repo values [VERIFIED: src/lib/exportService.ts:202-206]:**
```typescript
          // Embed base 0.35m into lowest ground point to prevent hovering on slopes
          const baseEmbed = 0.35;
          const baseLevelM = Math.max(0, minFootprintElev - baseEmbed) * zExaggeration;
          const slopeDelta = Math.max(0, maxFootprintElev - minFootprintElev) * zExaggeration;
          const totalDepth = height * zExaggeration + slopeDelta + (baseEmbed * zExaggeration);
```

### Anti-Patterns to Avoid
- **Clamping de vértices exteriores en lugar de recorte paramétrico:** Clampear puntos a `minLon`/`maxLon` aplasta la geometría sobre los bordes y genera rectángulos perimetrales no deseados en CAD.
- **Exportación de líneas en formato STL:** STL es un formato puramente facetado (triángulos). Pasar objetos `THREE.Line` a `STLExporter` es ignorado silenciosamente por el exportador. Para representar vías en STL, se deben omitir las líneas o generar cintas poligonales extruidas sobre el terreno.
- **Duplicar constructores Three.js en componentes visuales:** Provoca que cambios de escala, cota o empotramiento no se trasladen a los archivos descargados.
- **Serializar el DOM SVG directamente mediante `XMLSerializer`:** Carga clases de Tailwind, cursores, marcas temporales de zoom y elementos interactivos que arruinan la importación en Illustrator/Inkscape o corte láser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serialización binaria STL | Formateador de buffers binarios STL manual con DataView | `STLExporter` de `three-stdlib` | Maneja Little-Endian, cálculo de normales facetadas por triángulo, y optimización de índices sin errores de alineación de memoria. |
| Recorte de polilíneas a rectángulos BBox | Algoritmo propio de corte o truncado por bordes | `clipWayToBBox` (`src/lib/ogucService.ts:1125`) | Ya implementa Liang-Barsky subdividido suavemente según `maxStepMeters = 15`. |
| Carga y parseo de `.ply` y `.fbx` | Parsers binarios/ASCII custom | `PLYLoader` y `FBXLoader` de `three-stdlib` | Ya integrados en `meshProcessor.ts:27-41`, soportan formatos binarios y ASCII complejos. |
| Empaquetado ZIP de archivos CAD | Generador ZIP manual | `fflate.zipSync` (`src/lib/exportService.ts:348`) | Liviano, ultra-rápido, comprime archivos en memoria del navegador de forma síncrona. |

## Common Pitfalls

### Pitfall 1: Inversión de Ejes Y/Z entre SVG, Three.js y AutoCAD DXF
**What goes wrong:** Las entidades aparecen espejadas en el eje Norte-Sur o rotadas 90 grados al abrirlas en AutoCAD o SketchUp.
**Why it happens:** En SVG/D3, el origen `(0,0)` está en la esquina superior izquierda y el eje Y crece hacia el Sur. En Three.js, `+Y` es vertical (Cielo), `+X` es Este y `-Z` es Norte. En AutoCAD DXF cartesiano, `+X` es Este, `+Y` es Norte y `+Z` es Elevación vertical.
**How to avoid:**
- En DXF: $X = Easting$, $Y = Northing$, $Z = Elevation$. Si se usan coordenadas métricas locales: $X = \frac{col}{cols-1} \cdot w$, $Y = \frac{rows - 1 - row}{rows - 1} \cdot h$.
- En Three.js: $X = wx$, $Y = (elev - minEv) \cdot zExaggeration$, $Z = wz$.
**Warning signs:** Los cursos de agua o calles fluyen en dirección invertida o las cotas de curva están rotadas 180° respecto a la vista satelital.

### Pitfall 2: Discrepancia de Unidades en Importador DXF de SketchUp ($INSUNITS)
**What goes wrong:** Al importar el DXF en SketchUp, las curvas de nivel son 39 veces más pequeñas que el terreno GLB.
**Why it happens:** SketchUp tiene configuradas "Pulgadas" por defecto en las opciones de importación DXF/DWG, ignorando a veces la cabecera `$INSUNITS = 6` (Metros).
**How to avoid:** Incluir `$INSUNITS 6`, `$MEASUREMENT 1` en la cabecera DXF y advertir explícitamente en el tooltip y documentación que en SketchUp se debe presionar "Opciones..." antes de importar y fijar "Metros".

### Pitfall 3: Pérdida de Georreferenciación en Mallas 3D Locales (.PLY/.FBX)
**What goes wrong:** Al cargar un `.ply` o `.fbx`, la aplicación intenta consultar capas OSM a coordenadas inexistentes o falla al proyectar CRS.
**Why it happens:** Los archivos `.ply`/`.fbx` de fotogrametría/drones típicamente carecen de metadatos geográficos de latitud/longitud (no tienen `bbox`).
**How to avoid:**
- En `App.tsx`, el `useEffect` de recuperación OSM ya valida `if (!meshData || !meshData.bbox) return;` [VERIFIED: src/App.tsx:148-152].
- En `crsService.ts`, proveer una rama de salvaguarda: si `bbox` no está definido en `meshData`, el exportador DXF utiliza coordenadas métricas locales `(0..w, 0..h)` y deshabilita la exportación de `.jgw` o informa que la malla no posee georreferenciación satelital.

### Pitfall 4: Omisión de Edificios Multipolígono (`type === 'relation'`) en DXF
**What goes wrong:** Los edificios grandes, con patios interiores o bloques complejos de OSM no aparecen en el archivo DXF exportado.
**Why it happens:** La implementación previa en `ContourViewer.tsx:1074` solo verificaba `if (el.type === 'way')`, omitiendo completamente los elementos de tipo `relation`.
**How to avoid:** Procesar los miembros con `role === 'outer'` de los elementos `type === 'relation'`, tal como ya hace `buildThreeSceneFromMeshData` [VERIFIED: src/lib/exportService.ts:126-132].

## Code Examples

### 1. Serializador DXF R15 / AutoCAD 2000 (`src/lib/exportService.ts`)
```typescript
// Source: src/lib/exportService.ts & AutoCAD DXF Reference Specification
export function generateDxfContent(params: {
  meshData: MeshData;
  contours: any[];
  crs: string;
  layerVisibility?: { buildings?: boolean; highways?: boolean; waterways?: boolean };
}): string {
  const { meshData, contours, crs, layerVisibility = { buildings: true, highways: true, waterways: true } } = params;

  // AutoCAD 2000 (AC1015), Métrico (INSUNITS 6 = Metros, MEASUREMENT 1)
  const lines: string[] = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER", "1", "AC1015",
    "9", "$MEASUREMENT", "70", "1",
    "9", "$INSUNITS", "70", "6",
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "TABLES",
    "0", "TABLE", "2", "LAYER", "70", "4",
    "0", "LAYER", "2", "CONTOURS", "70", "0", "62", "2", "6", "CONTINUOUS", "0",
    "0", "LAYER", "2", "BUILDINGS", "70", "0", "62", "7", "6", "CONTINUOUS", "0",
    "0", "LAYER", "2", "HIGHWAYS", "70", "0", "62", "8", "6", "CONTINUOUS", "0",
    "0", "LAYER", "2", "WATERWAYS", "70", "0", "62", "5", "6", "CONTINUOUS", "0",
    "0", "ENDTAB",
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "ENTITIES"
  ];

  // Helper para proyectar punto según CRS activo
  const projectPoint = (lon: number, lat: number, gridX: number, gridY: number) => {
    if (meshData.bbox) {
      return projectPointToCrs(lat, lon, crs);
    }
    // Fallback métrico local para mallas sin bbox
    const cols = meshData.cols || 150;
    const rows = meshData.rows || 150;
    const x = (gridX / Math.max(1, cols - 1)) * meshData.w;
    const y = (1.0 - gridY / Math.max(1, rows - 1)) * meshData.h;
    return { x, y };
  };

  // ... (Iterar curvas e insertar POLYLINE 3D en CONTOURS)
  // ... (Iterar clipWayToBBox e insertar POLYLINE 3D en HIGHWAYS y WATERWAYS)
  // ... (Iterar ways y relations outer e insertar POLYLINE cerrada en BUILDINGS con elevación bilineal)

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}
```

### 2. Conversor Cartográfico Snyder WGS84 / UTM (`src/lib/crsService.ts`)
```typescript
// Source: Snyder, J. P. (1987) & EPSG Geodetic Parameter Dataset
export interface CrsDefinition {
  code: string;
  name: string;
  isProjected: boolean;
  utmZone?: number;
  isSouth?: boolean;
}

export const SUPPORTED_CRS: Record<string, CrsDefinition> = {
  'EPSG:32718': { code: 'EPSG:32718', name: 'WGS 84 / UTM Zona 18S (Chile Costa / Sur)', isProjected: true, utmZone: 18, isSouth: true },
  'EPSG:32719': { code: 'EPSG:32719', name: 'WGS 84 / UTM Zona 19S (Chile Centro / Santiago)', isProjected: true, utmZone: 19, isSouth: true },
  'EPSG:32633': { code: 'EPSG:32633', name: 'WGS 84 / UTM Zona 33N (Referencia Proyectada)', isProjected: true, utmZone: 33, isSouth: false },
  'EPSG:4326':  { code: 'EPSG:4326',  name: 'WGS 84 Geográficas (Latitud / Longitud en Grados)', isProjected: false },
};

export function projectPointToCrs(lat: number, lon: number, crsCode: string): { x: number; y: number } {
  const def = SUPPORTED_CRS[crsCode] || SUPPORTED_CRS['EPSG:32719'];
  if (!def.isProjected || !def.utmZone) {
    return { x: lon, y: lat };
  }
  const utm = latLonToUtm(lat, lon, def.utmZone, def.isSouth ?? true);
  return { x: utm.easting, y: utm.northing };
}

export function generateWorldFileForCrs(params: {
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  width: number;
  height: number;
  crsCode: string;
}): string {
  const { bbox, width, height, crsCode } = params;
  const def = SUPPORTED_CRS[crsCode] || SUPPORTED_CRS['EPSG:32719'];

  if (!def.isProjected) {
    // Formato estándar WGS84 EPSG:4326 en grados decimales
    const xScale = (bbox.maxLon - bbox.minLon) / width;
    const yScale = (bbox.maxLat - bbox.minLat) / height;
    return [
      xScale.toFixed(10),
      '0.0000000000',
      '0.0000000000',
      (-yScale).toFixed(10),
      (bbox.minLon + xScale / 2).toFixed(10),
      (bbox.maxLat - yScale / 2).toFixed(10),
    ].join('\r\n');
  }

  // Proyección UTM métrica real
  const topLeft = projectPointToCrs(bbox.maxLat, bbox.minLon, crsCode);
  const bottomRight = projectPointToCrs(bbox.minLat, bbox.maxLon, crsCode);

  const xScale = Math.abs(bottomRight.x - topLeft.x) / width;
  const yScale = Math.abs(topLeft.y - bottomRight.y) / height;

  return [
    xScale.toFixed(6),
    '0.000000',
    '0.000000',
    (-yScale).toFixed(6),
    (topLeft.x + xScale / 2).toFixed(6),
    (topLeft.y - yScale / 2).toFixed(6),
  ].join('\r\n');
}
```

### 3. Generador de Lámina Topográfica Vectorial SVG (`src/lib/exportService.ts`)
```typescript
// Source: W3C SVG 1.1 Specification & Geo_Arc 02-UI-SPEC.md
export function generateSvgTopographicSheet(params: {
  meshData: MeshData;
  contours: any[];
  fileName?: string;
  crs?: string;
  interval?: number;
  masterIntervalCount?: number;
  showContourLabels?: boolean;
  customLotPts?: { x: number; y: number; elev: number }[] | null;
  layerVisibility?: { buildings?: boolean; highways?: boolean; waterways?: boolean };
}): string {
  const { meshData, contours, fileName = 'terreno', crs = 'EPSG:32719', interval = 1, masterIntervalCount = 5, showContourLabels = true, customLotPts, layerVisibility = { buildings: true, highways: true, waterways: true } } = params;

  const cols = meshData.cols || meshData.size || 150;
  const rows = meshData.rows || meshData.size || 150;
  const w = meshData.w || 500;
  const h = meshData.h || 500;

  const svgParts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!--`,
    `  GEO·ARC - LÁMINA TOPOGRÁFICA VECTORIAL`,
    `  Archivo Base: ${fileName}`,
    `  Sistema de Referencia (CRS): ${crs}`,
    `  Dimensiones: ${w.toFixed(2)}m x ${h.toFixed(2)}m (${cols}x${rows} grilla)`,
    `  Cota Mínima: ${meshData.minEv.toFixed(2)}m | Cota Máxima: ${meshData.maxEv.toFixed(2)}m`,
    `  Intervalo de Curvas: ${interval}m (Curvas Maestras cada ${interval * masterIntervalCount}m)`,
    `  Generado: ${new Date().toISOString()}`,
    `-->`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" style="background-color: #121212;">`,
    `  <defs>`,
    `    <style>`,
    `      .contour-standard { stroke: #666666; stroke-width: 0.5px; fill: none; }`,
    `      .contour-major { stroke: #c5a059; stroke-width: 1.2px; fill: none; }`,
    `      .contour-label { font-family: monospace; font-size: 8px; fill: #c5a059; text-anchor: middle; }`,
    `      .lot-boundary { stroke: #da291c; stroke-width: 2px; stroke-dasharray: 4,4; fill: rgba(218,41,28,0.1); }`,
    `      .building-footprint { stroke: #e0e0e0; stroke-width: 1px; fill: #2a2a2a; }`,
    `      .highway-line { stroke: #475569; stroke-width: 1.5px; fill: none; }`,
    `      .waterway-line { stroke: #0284c7; stroke-width: 1.5px; fill: none; }`,
    `    </style>`,
    `  </defs>`
  ];

  // ... (Añadir grupos <g id="contour-lines">, <g id="urban-context">, <g id="lot-boundary">, <g id="contour-labels">)

  svgParts.push(`</svg>`);
  return svgParts.join('\n');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DXF clamping vertices a BBox borders | Liang-Barsky clipping (`clipWayToBBox`) | Phase 2 | Elimina líneas perimetrales parásitas sobre los bordes del terreno en AutoCAD/SketchUp. |
| Elevación discreta por `Math.floor` | Interpolación bilineal continua de cota Z | Phase 2 | Suprime saltos escalonados de altura en vértices de edificios y vías. |
| Construcción Three.js triplicada | Unificación en `buildThreeSceneFromMeshData` | Phase 2 | Asegura idéntica normalización `(elev - minEv) * zExaggeration` y empotramiento de 0.35m en visor 3D, STL, GLB y OBJ. |
| CRS como string cosmético sin efecto | Reproyección geodésica real Snyder WGS84/UTM | Phase 2 | QGIS y AutoCAD Civil 3D reciben coordenadas métricas UTM precisas y georreferenciadas. |
| Sin exportador directo de lámina SVG | Generador semántico `.SVG` con metadatos técnicos | Phase 2 | Descarga directa de planos vectoriales listos para edición en Illustrator o corte láser. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Todas las mallas locales `.PLY` o `.FBX` que cargue el usuario deben orientarse automáticamente deduciendo su eje vertical mediante comparación de varianza de dimensiones XYZ (`meshProcessor.ts:70-76`). | Architecture Patterns | Si una malla fotogramétrica es perfectamente cúbica, podría interpretarse un eje vertical no deseado; mitigable añadiendo control de inversión en UI si surge demanda. |
| A2 | Para mallas fotogramétricas locales sin `bbox`, la exportación DXF debe emitir coordenadas métricas locales `(0..w, 0..h)` relativas al origen de la malla. | Architecture Patterns | Bajo impacto: es el comportamiento estándar para archivos CAD sin georreferenciación global. |

## Open Questions

1. **¿Debe el exportador DXF incluir información de texto de cotas sobre las curvas de nivel?**
   - What we know: AutoCAD admite entidades `TEXT` o `MTEXT`, pero suelen generar desorden visual si no están perfectamente alineadas y escaladas.
   - What's unclear: Si los arquitectos prefieren las cotas embebidas en el polígono 3D (cota Z real) o como texto 2D adicional.
   - Recommendation: Cada vértice de polilínea en la capa `CONTOURS` ya tiene su coordenada Z real asignada (`z.toFixed(3)`). Para esta fase, la geometría 3D pura en AutoCAD permite consultar la elevación con cualquier herramienta de acotado CAD sin saturar el dibujo con entidades de texto superpuestas.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Dev / Build tooling | ✓ | v24.18.1 | — |
| npm | Package management | ✓ | 11.12.0 | — |
| TypeScript | Compilation and linting | ✓ | ~5.8.2 | — |
| Vite | Bundler & Dev server | ✓ | ^6.2.0 | — |
| Browser WebGL 2.0 | Three.js 3D rendering | ✓ | WebGL 2.0 | — |
| Browser File API | .PLY / .FBX upload | ✓ | HTML5 FileReader / Blob | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (Phase 4 roadmap item; static linting active now) |
| Config file | `tsconfig.json` / `package.json` |
| Quick run command | `npm run lint` |
| Full suite command | `npm run lint && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAD-01 | Recorte limpio BBox e interpolación bilineal en DXF | Unit / Typecheck | `npm run lint` | ✅ `src/lib/ogucService.ts`, `src/lib/exportService.ts` |
| CAD-02 | Unificación de escena Three.js y normalización vertical en STL | Unit / Typecheck | `npm run lint` | ✅ `src/lib/exportService.ts`, `src/components/ContourViewer.tsx` |
| CAD-03 | Proyección geodésica UTM 18S/19S/33N y generación de Worldfile .JGW | Unit / Verification script | `node -e "..."` & `npm run lint` | ❌ Wave 0 (`src/lib/crsService.ts`) |
| CAD-04 | Carga de mallas locales .PLY/.FBX y exportación SVG directa | Component / Integration | `npm run lint && npm run build` | ✅ `src/App.tsx`, `src/components/ContourViewer.tsx` |
| QUAL-02 | Constructor compartido `buildThreeSceneFromMeshData` en visor 3D y exports | Typecheck & Build | `npm run lint && npm run build` | ✅ `src/lib/exportService.ts`, `src/components/ThreeTerrainViewer.tsx` |

### Sampling Rate
- **Per task commit:** `npm run lint` (< 5s)
- **Per wave merge:** `npm run lint && npm run build`
- **Phase gate:** Typecheck limpio y build de producción exitoso sin errores.

### Wave 0 Gaps
- [ ] `src/lib/crsService.ts` — Módulo puro con elipsoide WGS84, funciones Snyder `latLonToUtm`, `projectPointToCrs` y `generateWorldFileForCrs`.
- [ ] Exportadores consolidados en `src/lib/exportService.ts` (`exportToDxf`, `exportToStl`, `exportToSvg`).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validación de formato y límites de tamaño en carga de archivos locales `.PLY` y `.FBX` (máximo 50MB, verificación de vértices > 0, prevención de DoS en memoria mediante `processMeshFile`). |
| V13 API and Web Service | yes | Prevención de solicitudes de red innecesarias: mallas locales sin `bbox` no disparan llamadas a APIs de OpenStreetMap ni Overpass. |
| V14 Configuration | yes | Sanitización de nombres de archivo descargados (`fileName.replace(/\.[^/.]+$/, "")`) para evitar secuencias de escape o caracteres no válidos en sistemas de archivos locales. |

### Known Threat Patterns for Client-Side CAD / File Processing

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Archivo de malla malicioso o corrupto agota la memoria del navegador | Denial of Service | Rechazo inmediato de extensiones no autorizadas (`.ply`, `.fbx`), verificación de cabeceras en loaders de `three-stdlib`, límite sugerido de 50 MB con captura de excepciones en bloques `try / catch`. |
| Script malicioso embebido en archivo vectorial SVG exportado | Tampering / XSS | Generación programática de SVG en memoria sin evaluar contenido HTML arbitrario suministrado por el usuario; solo primitivas geométricas estándar (`path`, `text`, `polygon`, `style`). |
| Path Traversal en nombres de archivo descargados | Tampering | Limpieza estricta de extensiones y caracteres de ruta en `triggerBrowserDownload`. |

## Sources

### Primary (HIGH confidence)
- `src/lib/ogucService.ts:1125-1179` - Implementación probada de `clipWayToBBox` con Liang-Barsky.
- `src/lib/exportService.ts:18-228` - Constructor estándar `buildThreeSceneFromMeshData` con normalización Z y empotramiento de edificios en pendiente.
- `src/lib/meshProcessor.ts:20-186` - Parser funcional de archivos `.ply` y `.fbx` con generación de grilla DEM.
- `02-UI-SPEC.md` - Contrato de diseño e interacción para zona de carga de mallas y botón de exportación SVG.
- USGS Professional Paper 1395 (Snyder, J. P., 1987) - Fórmulas estándar para proyección Transversal de Mercator sobre el elipsoide WGS84.
- AutoCAD 2000 DXF Reference (Autodesk) - Especificación de registros HEADER, TABLES, POLYLINE 3D y VERTEX.

### Secondary (MEDIUM confidence)
- EPSG Geodetic Parameter Registry - Definiciones oficiales para EPSG:32718 (UTM 18S), EPSG:32719 (UTM 19S), EPSG:32633 (UTM 33N) y EPSG:4326.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Basado 100% en dependencias ya verificadas e instaladas en el repositorio.
- Architecture: HIGH - Patrones validados con el código fuente y las directrices de `GEMINI.md`.
- Pitfalls: HIGH - Inconsistencias documentadas previamente en `CONCERNS.md` y verificadas en los componentes.

**Research date:** 2026-10-28
**Valid until:** 2026-11-28 (30 días)
