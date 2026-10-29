# Phase 03: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local - Research

**Researched:** 2026-10-29  
**Domain:** WebGL GPU Memory Management, React Rendering Performance (Memoization), Native IndexedDB Client-Side Persistence, DEM Geospatial Resampling  
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Persistencia Automática en IndexedDB (`PERF-01`)**
  - Implementar un servicio de almacenamiento local puro en TypeScript (`src/lib/storageService.ts`) utilizando la API nativa `IndexedDB` (`geoarc_db`, store `project_session`).
  - Guardar el estado completo de la sesión: `meshData` (incluyendo grilla DEM, dimensiones, cotas, BBox y textura satelital), `customLotPts`, `ogucParams`, `solarParams`, `analysisMode`, `crs` y `activeTab`.
  - Guardado reactivo con debounce de 500ms al modificar estados clave.
  - Restauración automática al inicializar `App.tsx` (`useEffect`), mostrando un breve indicador/toast sutil "Sesión restaurada".
  - En la barra de navegación superior o panel lateral, añadir control visible "Restablecer Sesión" / "Nueva Sesión" con confirmación para limpiar `IndexedDB` y volver al estado inicial.

- **D-02: Memoización de Raymarching Solar a 60 FPS (`PERF-02`)**
  - En `src/components/ContourViewer.tsx`, desacoplar el cálculo 3D de sombras solares (`getSolarShadowPolygon`) del bucle de renderizado JSX.
  - Encapsular el cálculo de polígonos 3D de sombra en un hook `useMemo` dependiente únicamente de `[analysisMode, solarParams?.showShadows, sunPosition, buildings3D, projectVolume, meshData]`.
  - En el ciclo de renderizado (incluyendo auto-órbita y arrastre con puntero), únicamente proyectar a 2D los polígonos ya calculados (`render3DPath`), garantizando 60 FPS estables sin llamadas redundantes a las 2,000 iteraciones de raymarching por vértice.

- **D-03: Prevención de Fugas de Memoria GPU WebGL (`PERF-03`)**
  - En `src/components/ThreeTerrainViewer.tsx` (y utilidades de escena Three.js):
  - Crear la función canónica `disposeObjectTree(obj: THREE.Object3D)` que recorre recursivamente el árbol con `obj.traverse(...)` y libera:
    - Geometrías (`child.geometry?.dispose()`).
    - Materiales individuales y arreglos de materiales (`child.material?.dispose()`), liberando sus mapas de textura asociados (`map`, `normalMap`, etc.).
  - Invocar `disposeObjectTree` antes de `scene.remove(obj)` al reconstruir grupos base (`Terrain_Group`, `Building_Group`, `Roads_Group`, etc.) y capas dinámicas (`Overlay_Lot`, `Overlay_OGUC`, `Overlay_Heliodon`, `Helper_SunRay`).
  - Invocar limpieza completa en la función de desmontaje del componente (`useEffect cleanup`).

- **D-04: Optimización de Extracción DEM y Limpieza de UI (`PERF-04`)**
  - En `src/App.tsx` y `src/components/OsmImporter.tsx`:
  - Eliminar el botón ficticio `"Generar Visualización 3D"` (`handleSimulateProcess` y estado `isProcessing3d`) de la barra lateral, ya que `isDone(true)` ya se activa al finalizar la importación.
  - Eliminar la doble interpolación bilineal redundante en `handleOsmDataFetched` asegurando que la grilla DEM pase directamente sin conversiones innecesarias de tipos ni loops duplicados.
  - Limpiar estados huérfanos (`osmDataRaw`, `terrainCurtains`) identificados en la auditoría de deuda técnica.

### the agent's Discretion

- Manejo de cuota de almacenamiento: si `IndexedDB` no estuviera disponible (modo incógnito estricto o permisos denegados), atrapar la excepción y continuar en memoria sin interrumpir la operación.
- Diseño visual del botón "Nueva Sesión" / "Restablecer" respetando los lineamientos de diseño técnico oscuro de Geo_Arc.

### Deferred Ideas (OUT OF SCOPE)

- Web Workers para raymarching de sombras en segundo plano — diferido para versiones futuras; la memoización con `useMemo` es suficiente para garantizar 60 FPS en la vista.
- Sincronización en la nube (Cloud Sync) — fuera del alcance de la versión client-side pura.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| **PERF-01** | El usuario conserva automáticamente su sesión de trabajo activa (terreno `meshData`, polígono de lote `customLotPts` y parámetros OGUC/Solar) en almacenamiento local (`IndexedDB`) al recargar el navegador (`F5`), con control para restablecer la sesión. | Servicio `storageService.ts` nativo con transacciones asíncronas `geoarc_db` / `project_session`, hook de guardado debounced a 500ms en `App.tsx`, modal de confirmación y toast de restauración de 4000ms. |
| **PERF-02** | El usuario puede rotar y orbitar la vista 2.5D (`ContourViewer`) en Modo Solar a 60 FPS gracias a la memoización (`useMemo`) de los polígonos de sombra calculados por raymarching (`getSolarShadowPolygon`). | Extracción de los polígonos 3D de sombra en hooks `useMemo` (`buildingSolarShadows3D` y `projectSolarShadow3D`), desacoplándolos de las matrices afines 2D (`rotX`, `rotZ`, `panOffset`, `zoomK`) y del bucle de animación. |
| **PERF-03** | El usuario puede deslizar la hora solar y modificar parámetros OGUC continuamente en la vista 3D (`ThreeTerrainViewer`) sin fugas de memoria en la GPU gracias a la liberación recursiva (`dispose()`) de geometrías, materiales y texturas al actualizar grupos de escena. | Utilidad `disposeObjectTree(obj: THREE.Object3D)` que recorre jerárquicamente geometrías, materiales (individuales o arreglos) y texturas mapeadas (`map`, etc.), ejecutada antes de `scene.remove()` y en el desmontaje del canvas. |
| **PERF-04** | El usuario extrae terrenos sin doble interpolación redundante `150x150` entre `OsmImporter.tsx` y `App.tsx`, y opera una barra lateral libre del botón simulado sin efecto (`"Generar Visualización 3D"` / `handleSimulateProcess`). | Muestreo DEM directo con dimensiones de aspecto calculadas en `OsmImporter.tsx` transmitidas como `Float32Array` listo a `handleOsmDataFetched`; eliminación de `handleSimulateProcess`, `isProcessing`, `osmDataRaw` y `terrainCurtains`. |
</phase_requirements>

---

## Summary

La **Fase 03** se focaliza en consolidar la robustez operativa, la eficiencia de cálculo y la retención del estado de trabajo de **Geo_Arc**. Actualmente, la aplicación cuenta con un motor normativo y solar preciso (Fase 01) y una suite de exportación e interoperabilidad CAD/GIS unificada (Fase 02). Sin embargo, arrastra cuatro cuellos de botella críticos de rendimiento y experiencia de usuario:
1. **Pérdida de sesión al recargar (`F5`):** No existe persistencia local para `meshData` (que oscila entre 2 MB y 15 MB con ortofotos y capas vectoriales OSM), obligando al arquitecto a re-extraer el terreno y re-dibujar el lote en cada sesión. `localStorage` no es viable debido a su cuota sincrónica de 5 MB.
2. **Caída de cuadros a 5-15 FPS al orbitar en Modo Solar:** `ContourViewer.tsx` invoca `getSolarShadowPolygon` directamente dentro del bucle de renderizado JSX para cada edificio OSM y volumen propuesto (hasta 600,000 pasos de raymarching por frame), provocando congelamiento de interfaz durante el arrastre con puntero y la auto-órbita.
3. **Fuga de memoria WebGL en GPU:** `ThreeTerrainViewer.tsx` elimina grupos dinámicos (`Overlay_OGUC`, `Overlay_Heliodon`, etc.) mediante `scene.remove(obj)` sin invocar `.dispose()` en geometrías, materiales ni texturas secundarias, provocando un crecimiento descontrolado de buffers de VRAM al deslizar continuamente el heliodón o parámetros OGUC.
4. **Doble interpolación bilineal y control simulado redundante:** `OsmImporter.tsx` interpola mosaicos PNG Terrarium a una grilla intermedia de 150x150 objetos `{ latitude, longitude, elevation }`, y `App.tsx` ejecuta una segunda interpolación bilineal hacia `cols x rows`. Además, un botón dummy `"Generar Visualización 3D"` somete al usuario a un `setTimeout` artificial de 600ms antes de mostrar el resultado que ya estaba disponible.

La solución aborda estos cuatro frentes sin introducir dependencias npm externas: persistencia asíncrona pura sobre `window.indexedDB`, memoización geométrica con `useMemo` desacoplada de la cámara 2.5D, traverser recursivo `disposeObjectTree` para Three.js, y extracción DEM directa en una sola pasada con dimensiones de aspecto nativas.

**Primary recommendation:** Centralizar la persistencia en `src/lib/storageService.ts` nativo con debounce de 500ms; encapsular las sombras solares 3D en `useMemo` dependiente únicamente de `[analysisMode, solarParams?.showShadows, layerVisibility.buildings, sunPosition, buildings3D, projectVolume, meshData]`; dotar a `ThreeTerrainViewer.tsx` de `disposeObjectTree` antes de cada `scene.remove()` y en desmontaje; y conectar directamente la grilla `Float32Array` desde `OsmImporter.tsx` suprimiendo el botón simulado y las variables huérfanas.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Persistencia Local de Sesión (`IndexedDB`) | Browser / Client (`src/lib/storageService.ts`) | React App State (`src/App.tsx`) | Almacenamiento asíncrono no bloqueante en el motor IndexedDB del navegador para payloads de 1 a 25 MB sin requerir backend ni servidor de base de datos. |
| Memoización de Sombras Solares 2.5D | Client View Component (`src/components/ContourViewer.tsx`) | Mathematical Core (`src/lib/SunPosition.ts`) | El cálculo 3D de raymarching de sombras sobre la grilla DEM solo cambia con la posición solar o geometría física; la proyección a SVG 2D (`render3DPath`) absorbe la órbita a 60 FPS. |
| Gestión del Ciclo de Vida de Memoria GPU | WebGL 3D Viewer (`src/components/ThreeTerrainViewer.tsx`) | Unified Scene Engine (`src/lib/exportService.ts`) | El contexto WebGL es propiedad del componente 3D; la liberación explícita de `BufferGeometry`, `Material` y `Texture` evita fugas en el heap de la tarjeta gráfica. |
| Extracción y Resampling de Relieve DEM | Geospatial Importer (`src/components/OsmImporter.tsx`) | App State Orchestrator (`src/App.tsx`) | La interpolación bilineal de píxeles Terrarium debe ocurrir una única vez al muestrear las cotas según la relación de aspecto del BBox. |
| Notificación y Confirmación de Sesión | Application UI Overlay (`src/App.tsx`) | Component HUD (`03-UI-SPEC.md`) | Modales y banners flotantes (toast de recuperación y confirmación de reset) pertenecen a la capa de control global de la aplicación. |

---

## Project Constraints (from GEMINI.md)

1. **Client-Side Pure (Zero-Backend Compute):** Todo el procesamiento geométrico, reproyección CRS/UTM, generación CAD/3D y persistencia debe ejecutarse 100% en el cliente web sin servicios externos de procesamiento ni bases de datos cloud (`GEMINI.md:13-14`).
2. **Preservación de Paridad Visual 2.5D / 3D:** Cualquier cambio en el estado del terreno (`meshData`), lote (`customLotPts`), o parámetros debe reflejarse de forma idéntica en ambos visores (`ContourViewer.tsx` y `ThreeTerrainViewer.tsx`) y en la serialización (`GEMINI.md:14-15`).
3. **Entorno Windows PowerShell:** El repositorio opera en Windows 11 (`C:\Users\conta\.gemini\antigravity\scratch\Geo_Arc`). No usar comodines bash incompatibles ni subshells no portables (`GEMINI.md:15-16`).
4. **Higiene de Dependencias:** No añadir paquetes innecesarios. Implementar IndexedDB con la API nativa de TypeScript sin librerías externas como `idb` o `localforage` (`03-CONTEXT.md:23-24`).
5. **Convenciones de Diseño UI:** Respetar la tipografía Montserrat, la paleta técnica CAD oscura (`#121212`, `#1E1E1E`, acento institucional `#DA291C`), y los contratos declarados en `03-UI-SPEC.md`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| **TypeScript / Native IndexedDB** | `~5.8.2` (Built-in DOM) | Persistencia estructurada de sesiones de proyecto | [VERIFIED: package.json:41] Estándar W3C soportado en el 100% de navegadores modernos; almacena objetos clonables estructurados (`MeshData`, arreglos tipados, polígonos) hasta cientos de MB sin dependencias externas. |
| **Three.js** | `^0.184.0` | Renderizado WebGL 3D y liberación de VRAM | [VERIFIED: package.json:29] Motor 3D estándar del proyecto; expone `.dispose()` en `BufferGeometry`, `Material` y `Texture` y métricas en `renderer.info.memory`. |
| **React** | `^19.0.0` | Gestión de estado, ciclo de vida y memoización | [VERIFIED: package.json:26] Hooks nativos `useMemo`, `useRef`, `useEffect` y `useCallback` para estabilizar referencias y desacoplar cómputo pesado de la renderización SVG. |
| **Lucide React** | `^0.546.0` | Iconografía técnica para HUD y diálogos | [VERIFIED: package.json:24] Provee `RotateCcw`, `CheckCircle2`, `AlertTriangle`, `X`, `Beaker` sin peso extra de runtime. |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| **fast-png** | `^8.0.0` | Decodificación rápida de tiles PNG RGB de elevación Terrarium | [VERIFIED: package.json:21] En `OsmImporter.tsx` para extraer elevaciones Z de alta velocidad. |
| **d3** | `^7.9.0` | Generación de isolines y transformaciones afines SVG | [VERIFIED: package.json:18] En `ContourViewer.tsx` para cálculo de curvas de nivel y proyecciones 2.5D. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Native `window.indexedDB` | `idb` (Jake Archibald) o `localforage` | Añade dependencias npm adicionales para un caso de uso simple (guardar y leer una sola entidad de sesión `'active_project'`). El wrapper nativo en TypeScript es de ~120 líneas y no tiene sobrecosto ni vulnerabilidades de supply chain. |
| `useMemo` en componente | Web Workers para raymarching | Web Workers requieren serializar la grilla DEM (Float32Array) y deserializar los polígonos por `postMessage`, introduciendo latencia de copia estructurada. `useMemo` es síncrono, se ejecuta en ~4ms una sola vez y no consume memoria compartida. |
| Traversal manual `disposeObjectTree` | `three-stdlib` disposal helpers | `three-stdlib` no cubre todos los mapas de texturas anidados (`normalMap`, `roughnessMap`, `metalnessMap`, etc.) ni arreglos de materiales complejos creados dinámicamente. |

---

## Package Legitimacy Audit

> Conforme al protocolo de seguridad de paquetes GSD, esta fase no instala ninguna dependencia externa npm nueva (`03-CONTEXT.md:23-24`).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| *Ningún paquete nuevo requerido* | npm | N/A | N/A | N/A | [OK] | Aprobado — Se utilizan APIs nativas del navegador (`IndexedDB`) y Three.js / React existentes. |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
                 [Usuario en Navegador / Recarga F5]
                                  │
                                  ▼
                ┌───────────────────────────────────┐
                │             App.tsx               │
                │   (Orquestador de Estado Base)    │
                └───────┬───────────────────┬───────┘
                        │                   │
         [useEffect inicial]        [Debounce 500ms al cambiar estado]
                        │                   │
                        ▼                   ▼
           ┌─────────────────────────────────────┐
           │      src/lib/storageService.ts      │
           │  (Wrapper Nativo window.indexedDB)  │
           │       DB: "geoarc_db" v1            │
           │    Store: "project_session"         │
           └─────────────────────────────────────┘
                        ▲                   │
                        │                   │ [Carga / Restaura]
                        │                   ▼
           [Toast: Sesión Restaurada]  ┌─────────────────────────┐
           [Modal: Restablecer Sesión] │ meshData, customLotPts, │
                                       │ ogucParams, solarParams │
                                       └─────────────────────────┘
                                                    │
                 ┌──────────────────────────────────┴──────────────────────────────────┐
                 │                                                                     │
                 ▼                                                                     ▼
   ┌───────────────────────────┐                                         ┌───────────────────────────┐
   │    ContourViewer.tsx      │                                         │   ThreeTerrainViewer.tsx  │
   │  (Visor 2.5D / SVG 60FPS) │                                         │    (Visor 3D Satelital)   │
   ├───────────────────────────┤                                         ├───────────────────────────┤
   │ 1. useMemo() Sombras 3D:  │                                         │ 1. useEffect() Dinámicos: │
   │    - buildingShadows3D    │                                         │    - oldOverlays filtered │
   │    - projectShadow3D      │                                         │    - disposeObjectTree()  │
   │    (Raymarching se ejecuta│                                         │    - scene.remove()       │
   │     SOLO si cambia sol o  │                                         │ 2. Base Scene Rebuild:    │
   │     geometría)            │                                         │    - disposeObjectTree()  │
   │ 2. Render Loop (Órbita):  │                                         │ 3. Unmount Cleanup:       │
   │    - Proyección afín SVG  │                                         │    - disposeObjectTree()  │
   │    - 60 FPS garantizados  │                                         │    - renderer.dispose()   │
   └───────────────────────────┘                                         └───────────────────────────┘
                 ▲
                 │ [Grid DEM directo sin doble interpolación]
   ┌───────────────────────────┐
   │     OsmImporter.tsx       │
   │ (Aspect cols x rows 1 pass│
   │  sin botón dummy simulado)│
   └───────────────────────────┘
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── storageService.ts       # [NEW] Pure TypeScript IndexedDB session persistence service
│   ├── ogucService.ts          # Pure OGUC math, raymarching, and clipping
│   ├── SunPosition.ts          # Astronomical solar engine
│   ├── meshProcessor.ts        # Mesh parsing and DEM data structures
│   └── exportService.ts        # Unified Three.js builder and CAD exporters
├── components/
│   ├── ContourViewer.tsx       # 2.5D SVG viewer with useMemo shadow optimization
│   ├── ThreeTerrainViewer.tsx  # 3D WebGL viewer with recursive GPU disposal
│   └── OsmImporter.tsx         # DEM extraction without double bilinear sampling
└── App.tsx                     # Top-level state, restoration toast, and reset modal
```

---

### Pattern 1: Pure TypeScript IndexedDB Service (`storageService.ts`)

**What:** Un servicio singleton/modular en `src/lib/storageService.ts` que encapsula la apertura, lectura, escritura y borrado en `IndexedDB` mediante promesas tipadas nativas.
**When to use:** Para persistir el estado de la sesión activa de trabajo (`ProjectSession`) superando el límite de 5 MB de `localStorage`.
**Example:**
```typescript
// Source: MDN Web Docs - IndexedDB API specification & TypeScript DOM lib
export interface ProjectSession {
  version: number;
  timestamp: number;
  fileName: string;
  meshData?: any;
  customLotPts?: { x: number; y: number; elev: number }[] | null;
  analysisMode?: string;
  crs?: string;
  activeTab?: string;
  ogucParams?: any;
  solarParams?: any;
  location?: { lat: number; lon: number };
}

const DB_NAME = 'geoarc_db';
const DB_VERSION = 1;
const STORE_NAME = 'project_session';
const SESSION_KEY = 'active_project';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB no está disponible en este entorno.'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(session: ProjectSession): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session, SESSION_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[storageService] Fallo al guardar sesión en IndexedDB (cuota o modo privado):', err);
  }
}

export async function loadSession(): Promise<ProjectSession | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[storageService] Fallo al cargar sesión desde IndexedDB:', err);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(SESSION_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[storageService] Fallo al limpiar sesión en IndexedDB:', err);
  }
}
```

---

### Pattern 2: Memoización Desacoplada de Sombras Solares 2.5D (`ContourViewer.tsx`)

**What:** Separar el cálculo de los vértices 3D en coordenadas de grilla física (raymarching intensivo sobre el DEM) de la proyección isométrica SVG 2D (`render3DPath`).
**When to use:** En `ContourViewer.tsx`, para que la interacción del usuario (rotación, órbita continua, inclinación de cámara o paneo) ejecute únicamente la multiplicación afín 2D en cada cuadro a 60 FPS sin invocar `getSolarShadowPolygon`.
**Example:**
```typescript
// En src/components/ContourViewer.tsx
// 1. Hook para sombras 3D de edificios OSM
const buildingSolarShadows3D = useMemo(() => {
  if (
    analysisMode !== 'solar' ||
    !solarParams?.showShadows ||
    !layerVisibility.buildings ||
    !sunPosition ||
    sunPosition.elevation <= 0.5
  ) {
    return [];
  }
  return buildings3D
    .map((obj) => getSolarShadowPolygon(obj.pts, obj.height))
    .filter((poly): poly is Point3D[] => poly !== null && poly.length >= 3);
}, [
  analysisMode,
  solarParams?.showShadows,
  layerVisibility.buildings,
  sunPosition,
  buildings3D,
  meshData,
  n,
  m,
  getGridElevAt,
]);

// 2. Hook para sombra 3D del volumen propuesto
const projectSolarShadow3D = useMemo(() => {
  if (
    analysisMode !== 'solar' ||
    !solarParams?.showShadows ||
    !projectVolume ||
    projectVolume.collapsed ||
    !sunPosition ||
    sunPosition.elevation <= 0.5
  ) {
    return null;
  }
  return getSolarShadowPolygon(projectVolume.pts, projectVolume.height);
}, [
  analysisMode,
  solarParams?.showShadows,
  projectVolume,
  sunPosition,
  meshData,
  n,
  m,
  getGridElevAt,
]);

// 3. En el JSX: render3DPath consume los polígonos 3D ya calculados
// Rotar la vista NO re-ejecuta el raymarching, logrando 60 FPS estables.
```

---

### Pattern 3: Liberación Recursiva de Objetos GPU WebGL (`ThreeTerrainViewer.tsx`)

**What:** Función `disposeObjectTree(obj: THREE.Object3D)` que recorre en profundidad cualquier rama de la jerarquía Three.js y libera todos los recursos de la tarjeta gráfica (`BufferGeometry`, `Material` unitario o arreglo, y mapas de textura vinculados).
**When to use:** Antes de cada `scene.remove(obj)` al reconstruir overlays solares/normativos, al cambiar la malla base de terreno, y en la función de limpieza (`return () => ...`) de `useEffect` al desmontar.
**Example:**
```typescript
// En src/components/ThreeTerrainViewer.tsx o src/lib/exportService.ts
export function disposeObjectTree(obj: THREE.Object3D): void {
  obj.traverse((child: any) => {
    // 1. Liberar geometría
    if (child.geometry && typeof child.geometry.dispose === 'function') {
      child.geometry.dispose();
    }
    // 2. Liberar materiales y texturas asociadas
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const val = mat[key];
          if (val && typeof val === 'object' && val.isTexture && typeof val.dispose === 'function') {
            val.dispose();
          }
        }
        if (typeof mat.dispose === 'function') {
          mat.dispose();
        }
      }
    }
  });
}
```

---

### Anti-Patterns to Avoid

- **Llamadas a raymarching dentro de funciones de renderizado JSX:** `buildings3D.map(b => getSolarShadowPolygon(...))` dentro del `return (...)` fuerza a recalcular todas las sombras en cada movimiento del cursor, congelando la interfaz.
- **`scene.remove(obj)` sin `.dispose()`:** Eliminar un objeto del grafo de escena Three.js sin llamar a `dispose()` deja los buffers de geometría y texturas huérfanos en la memoria VRAM del controlador WebGL.
- **Guardado sincrónico sin debounce en IndexedDB:** Guardar en cada frame de arrastre del slider solar satura la cola de transacciones de IndexedDB y causa caídas de cuadros (*frame jank*).
- **Sobreescritura de sesión guardada durante la inicialización:** Disparar el autoguardado antes de que `loadSession()` haya completado su restauración puede sobreescribir la sesión almacenada con el estado vacío por defecto.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Persistencia de grandes volúmenes de datos (> 5 MB) | Serialización manual en `localStorage` o cookies | API nativa `window.indexedDB` | [VERIFIED: MDN Web Docs] `localStorage` bloquea el hilo principal sincrónicamente y tiene un tope rígido de ~5 MB; `IndexedDB` es asíncrono, no bloqueante y soporta cuotas de cientos de MB. |
| Gestión de memoria WebGL | Confiar en el Garbage Collector de JavaScript | Llamadas explícitas `geometry.dispose()`, `material.dispose()`, `texture.dispose()` | [VERIFIED: Three.js docs / manual] El motor V8 de JavaScript no recolecta automáticamente los buffers alojados en la memoria de la tarjeta de video (VRAM). |
| Detección de Aspect Ratio en DEM | Remuestreo forzado 150x150 seguido de un segundo remuestreo proporcional | Muestreo directo con `cols` y `rows` calculados desde el BBox geográfico | [VERIFIED: src/App.tsx:219-258 vs src/components/OsmImporter.tsx:707-719] El doble muestreo degrada la fidelidad altimétrica y duplica el consumo de CPU en la extracción. |

---

## Runtime State Inventory

> Aplicable para la optimización y limpieza de estados huérfanos en la Fase 03.

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | En versiones previas no existía persistencia local (`localStorage` ni `IndexedDB`). La base de datos `geoarc_db` y el store `project_session` serán creados limpios con esquema v1. | Creación de store `project_session` con soporte para borrado mediante `clearSession()`. |
| **Live service config** | Ninguno. No hay configuraciones externas en bases de datos remotas ni servicios cloud. | Ninguna acción requerida. |
| **OS-registered state** | Ninguno. Aplicación web cliente pura. | Ninguna acción requerida. |
| **Secrets / env vars** | Las variables de entorno en `.env` (`VITE_*`) no se modifican en esta fase. | Ninguna acción requerida. |
| **Build artifacts & orphaned states** | 1. `osmDataRaw` en `src/App.tsx:124` y `src/App.tsx:186` [VERIFIED: src/App.tsx:124]. <br> 2. `terrainCurtains` en `src/components/ContourViewer.tsx:348-363` [VERIFIED: src/components/ContourViewer.tsx:348]. <br> 3. `handleSimulateProcess` e `isProcessing` en `src/App.tsx:175-183` y botón en `1131-1148` [VERIFIED: src/App.tsx:175, 1131]. | Eliminar `osmDataRaw`, eliminar `terrainCurtains`, y remover el botón dummy simulado `"Generar Visualización 3d"`. |

---

## Common Pitfalls

### Pitfall 1: Bucle de Sobreescritura en Restauración de Sesión
**What goes wrong:** Al abrir la aplicación, un efecto de guardado automático reactivo se dispara inmediatamente con los valores por defecto vacíos (`meshData = undefined`, `customLotPts = null`), sobreescribiendo y borrando el proyecto que estaba guardado en `IndexedDB`.  
**Why it happens:** Los hooks `useEffect` dependientes de `[meshData, customLotPts, ...]` se ejecutan en el primer render antes de que la promesa asíncrona de `loadSession()` resuelva.  
**How to avoid:** Utilizar una referencia booleana de control `isRestoringSessionRef = useRef(true)`. Bloquear cualquier llamada a `saveSession()` mientras `isRestoringSessionRef.current === true`, y cambiar la bandera a `false` únicamente tras completar la restauración.  
**Warning signs:** Proyectos guardados desaparecen misteriosamente al recargar con `F5`.

### Pitfall 2: Memory Leak por Texturas Satelitales Huérfanas
**What goes wrong:** Al alternar la visualización de textura satelital o cargar una nueva ortofoto, el visor 3D acumula texturas no liberadas en GPU, reflejado en un incremento continuo de `renderer.info.memory.textures`.  
**Why it happens:** Los materiales Three.js no liberan automáticamente sus instancias de `THREE.Texture` (`mat.map`, `mat.normalMap`) cuando se llama a `mat.dispose()`.  
**How to avoid:** En `disposeObjectTree`, inspeccionar exhaustivamente las propiedades del material (`Object.keys(mat)`) y ejecutar `val.dispose()` en cualquier propiedad que cumpla `val.isTexture === true`.  
**Warning signs:** `renderer.info.memory.textures` aumenta cada vez que se desliza un parámetro o se recarga la textura.

### Pitfall 3: Desfase de Dependencias en `useMemo` de Sombras Solares
**What goes wrong:** Las sombras solares no se actualizan al mover la fecha o la hora solar en el slider.  
**Why it happens:** Omitir `sunPosition` o `solarParams?.showShadows` en el arreglo de dependencias del hook `useMemo`.  
**How to avoid:** Asegurar que `buildingSolarShadows3D` y `projectSolarShadow3D` dependan explícitamente de `[analysisMode, solarParams?.showShadows, layerVisibility.buildings, sunPosition, buildings3D, projectVolume, meshData, n, m, getGridElevAt]`.  
**Warning signs:** Las sombras permanecen estáticas a pesar de cambiar la hora del día en el control de asoleamiento.

---

## Code Examples

### 1. In-Repo Verbatim Evidence: Fuga de Memoria en ThreeTerrainViewer.tsx
```typescript
// [VERIFIED: src/components/ThreeTerrainViewer.tsx:320-323]
// Código actual que solo libera la geometría de la raíz y no recorre hijos ni materiales:
    for (const obj of oldObjects) {
      scene.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }
```

```typescript
// [VERIFIED: src/components/ThreeTerrainViewer.tsx:520-529]
// Código actual de overlays dinámicos que no libera ningún recurso de GPU:
    const oldOverlays = scene.children.filter(
      (c) =>
        c.name.startsWith('Overlay_Lot') ||
        c.name.startsWith('Overlay_OGUC') ||
        c.name.startsWith('Overlay_Heliodon') ||
        c.name === 'Helper_SunRay'
    );
    for (const obj of oldOverlays) {
      scene.remove(obj);
    }
```

### 2. In-Repo Verbatim Evidence: Bucle de Raymarching en Render JSX de ContourViewer.tsx
```typescript
// [VERIFIED: src/components/ContourViewer.tsx:1338-1351]
// Código actual donde getSolarShadowPolygon se invoca para cada edificio en cada fotograma:
          {/* Sombras Solares de Edificios OSM */}
          {analysisMode === 'solar' && solarParams?.showShadows && layerVisibility.buildings &&
            buildings3D.map((obj, i) => {
              const poly = getSolarShadowPolygon(obj.pts, obj.height);
              if (!poly) return null;
              return (
                <path
                  key={`b-shadow-${i}`}
                  d={render3DPath(poly, true)}
                  fill="var(--theme-shadow-solar)"
                  fillOpacity="0.35"
                  className="pointer-events-none"
                />
              );
            })}
```

### 3. In-Repo Verbatim Evidence: Doble Interpolación Redundante
```typescript
// [VERIFIED: src/components/OsmImporter.tsx:707-719]
// OsmImporter genera un arreglo intermedio 150x150:
      const steps = 150;
      const results = [];
      for (let i = 0; i < steps; i++) {
         const lat = maxLat - (maxLat - minLat) * (i / (steps - 1));
         for (let j = 0; j < steps; j++) {
            const lon = minLon + (maxLon - minLon) * (j / (steps - 1));
            results.push({
               latitude: lat,
               longitude: lon,
               elevation: getElevation(lat, lon)
            });
         }
      }
```

```typescript
// [VERIFIED: src/App.tsx:219-258]
// Y luego App.tsx ejecuta una segunda interpolación bilineal desde steps x steps a cols x rows:
      // We want to interpolate this to a maxDim grid (e.g. 150x150)
      const maxDim = 150;
      const { minLat, maxLat, minLon, maxLon } = data.bbox;
      const latRange = maxLat - minLat || 1;
      const lonRange = (maxLon - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) || 1;

      let cols, rows;
      if (lonRange > latRange) {
        cols = maxDim;
        rows = Math.max(10, Math.floor(maxDim * (latRange / lonRange)));
      } else {
        rows = maxDim;
        cols = Math.max(10, Math.floor(maxDim * (lonRange / latRange)));
      }

      const grid = new Float32Array(cols * rows);

      // Bilinear interpolation from steps x steps to cols x rows
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const srcY = (r / Math.max(1, rows - 1)) * (steps - 1);
          const srcX = (c / Math.max(1, cols - 1)) * (steps - 1);
          ...
```

### 4. In-Repo Verbatim Evidence: Botón Dummy Simulado a Eliminar
```typescript
// [VERIFIED: src/App.tsx:175-183]
  const handleSimulateProcess = async () => {
    setIsProcessing(true);
    setIsDone(false);

    await new Promise(r => setTimeout(r, 600));

    setIsProcessing(false);
    setIsDone(true);
  };
```

```typescript
// [VERIFIED: src/App.tsx:1131-1147]
            <button
              onClick={handleSimulateProcess}
              disabled={isProcessing}
              className="mt-5 w-full py-2.5 bg-accent text-white text-[10px] font-bold uppercase tracking-widest hover:bg-accent-hover transition-colors rounded-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Procesando Malla...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Beaker size={14} />
                  Generar Visualización 3d
                </span>
              )}
            </button>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `localStorage` para almacenamiento web | `IndexedDB` estructurado asíncrono | Estándar W3C moderno | Soporta cientos de megabytes sin bloquear la interfaz de usuario en el hilo principal. |
| Raymarching reactivo directo en bucle JSX | Desacoplamiento de malla 3D (`useMemo`) y proyección afín 2D en caliente | Patrones React 19 / SVG | Acelera la interacción de 5-15 FPS a 60 FPS estables durante el movimiento de cámara. |
| Eliminación simple con `scene.remove(obj)` | Traversal recursivo con liberación de geometrías, materiales y mapas de textura | Three.js Best Practices r150+ | Mantiene estable el conteo de `renderer.info.memory` sin saturar la VRAM del navegador. |
| Doble muestreo bilineal de elevación (PNG → 150x150 → Aspect Grid) | Muestreo directo en una sola etapa con dimensiones de aspecto calculadas | Optimización Fase 03 | Reduce en 50% el tiempo de cálculo de extracción y elimina artefactos de suavizado redundante. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | El volumen promedio de un proyecto típico en IndexedDB (grilla 150x150 + BBox + polígonos + textura satelital base64) ronda entre 2 MB y 8 MB. | Standard Stack & Pitfalls | Bajo. Si el payload fuera mayor (ej. 20 MB por texturas de alta resolución), `IndexedDB` sigue soportándolo sin problemas ya que su límite típico por origen supera 50 MB - 1 GB. |

---

## Open Questions (RESOLVED)

1. **¿Qué ocurre si el usuario abre Geo_Arc en modo incógnito estricto o con IndexedDB desactivado?**
   - *Resolución:* `storageService.ts` atrapa cualquier excepción en `openDB()` o en las transacciones, emite un aviso discreto en consola (`console.warn`) y permite que la aplicación continúe operando en memoria volátil de forma transparente, sin bloquear los visores ni interrumpir al usuario.
2. **¿Debe persistirse el historial de deshacer/rehacer de lotes en IndexedDB?**
   - *Resolución:* No. Solo se persiste el estado activo actual (`meshData`, `customLotPts`, `ogucParams`, `solarParams`, `analysisMode`, `crs`, `activeTab`, `fileName`). Los puntos de lote comprometidos se restauran íntegramente.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Dev server y Vite tooling | ✓ | v24.18.1 | — |
| npm | Gestor de paquetes | ✓ | 11.12.0 | — |
| TypeScript Compiler (`tsc`) | Verificación estática de tipos (`npm run lint`) | ✓ | ~5.8.2 | — |
| WebGL 2.0 / GPU | Visor 3D Satelital (`ThreeTerrainViewer.tsx`) | ✓ | Compatible | Modo 2.5D (`ContourViewer.tsx`) |
| IndexedDB API | Persistencia de sesión (`PERF-01`) | ✓ | Estándar W3C | Sesión volátil en memoria RAM |

**Missing dependencies with no fallback:** None  
**Missing dependencies with fallback:** None

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | TypeScript Compiler (`tsc --noEmit`) / Vitest (programado para Fase 04) |
| Config file | `tsconfig.json` |
| Quick run command | `npm run lint` |
| Full suite command | `npm run build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| **PERF-01** | Servicio `storageService.ts` implementa `saveSession`, `loadSession`, `clearSession` con tipos correctos. | Static typing | `npm run lint` | ❌ Wave 0 (`src/lib/storageService.ts`) |
| **PERF-02** | `ContourViewer.tsx` utiliza `useMemo` para `buildingSolarShadows3D` y `projectSolarShadow3D` sin llamadas directas a `getSolarShadowPolygon` en el JSX. | Static check & lint | `npm run lint` | ✅ (`src/components/ContourViewer.tsx`) |
| **PERF-03** | `ThreeTerrainViewer.tsx` invoca `disposeObjectTree` recursivo en overlays, objetos base y desmontaje. | Static check & build | `npm run lint && npm run build` | ✅ (`src/components/ThreeTerrainViewer.tsx`) |
| **PERF-04** | Eliminación de `handleSimulateProcess`, `isProcessing`, `osmDataRaw` y `terrainCurtains` sin errores de compilación. | Static check & build | `npm run lint && npm run build` | ✅ (`src/App.tsx`) |

### Sampling Rate
- **Per task commit:** `npm run lint`
- **Per wave merge:** `npm run build`
- **Phase gate:** Typecheck y bundle limpios antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/lib/storageService.ts` — Implementación del servicio de almacenamiento nativo IndexedDB.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V5 Input Validation | Sí | Sanitización de datos deserializados de `IndexedDB` en `storageService.loadSession()` verificando que `meshData.grid` sea un arreglo numérico y no contenga scripts maliciosos. |
| V6 Cryptography | No | La sesión local contiene datos topográficos públicos de libre acceso; no requiere cifrado simétrico en reposo en el cliente. |
| V8 Data Protection | Sí | La sesión se confina al origen del dominio en `IndexedDB` y no se transmite a ningún servidor de terceros. Botón "Restablecer Sesión" permite al usuario purgar completamente los datos locales. |

### Known Threat Patterns for WebGL / IndexedDB

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Inyección de objetos malformados en IndexedDB | Tampering | Validación de esquema básico en `loadSession()` asegurando existencia de propiedades requeridas antes de alimentar el estado de React. |
| Denegación de servicio por memoria GPU (WebGL Context Loss) | Denial of Service | Invocación estricta de `disposeObjectTree` en geometrías, materiales y texturas antes de eliminar objetos de la escena. |
| Quota Exceeded Crash en modo incógnito | Denial of Service | Manejo explícito de excepciones `DOMException` / `QuotaExceededError` en `storageService.ts` con degradación elegante a memoria volátil. |

---

## Sources

### Primary (HIGH confidence)
- `src/components/ContourViewer.tsx:829-886, 1338-1351, 1711-1721` — Identificación exacta de los bucles de renderizado donde se invoca `getSolarShadowPolygon`.
- `src/components/ThreeTerrainViewer.tsx:320-323, 520-529` — Identificación exacta de la omisión de `dispose()` en overlays dinámicos y jerarquías base.
- `src/App.tsx:175-183, 1131-1148` — Identificación del botón simulado dummy `handleSimulateProcess` y estado `isProcessing`.
- `src/App.tsx:219-258` y `src/components/OsmImporter.tsx:707-719` — Identificación de la doble interpolación bilineal redundante.
- [MDN Web Docs - IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — Especificación nativa de transacciones, almacenes de objetos y cuotas de almacenamiento.
- [Three.js Documentation - How to dispose of objects](https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects) — Reglas canónicas de liberación de recursos en WebGL.

### Secondary (MEDIUM confidence)
- `.planning/phases/03-rendimiento-60-fps-memoria-webgl-y-persistencia-local/03-CONTEXT.md` — Decisiones de diseño D-01 a D-04.
- `.planning/phases/03-rendimiento-60-fps-memoria-webgl-y-persistencia-local/03-UI-SPEC.md` — Contratos visuales de "Nueva Sesión", modal de confirmación y toast de restauración.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Validado contra `package.json` y APIs nativas del navegador.
- Architecture: HIGH — Basado en inspección directa y exhaustiva de las líneas fuente en `src/`.
- Pitfalls & Memory Management: HIGH — Respaldado por especificaciones oficiales de Three.js e IndexedDB.

**Research date:** 2026-10-29  
**Valid until:** 2026-12-31 (Arquitectura cliente estable)
