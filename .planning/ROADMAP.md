# Roadmap: Geo_Arc

## Overview

Este roadmap consolida la versión **v1.4 (Consolidation & Normative Precision)** de **Geo_Arc** a partir de la base funcional existente (`v1.3.1`). El recorrido comienza asegurando la exactitud matemática y regulatoria del motor normativo chileno (OGUC Art. 2.6.3 / Art. 2.6.12) y del Heliodón Solar junto con la paridad interactiva 2.5D/3D (Phase 1); continúa unificando el constructor geométrico Three.js y completando la interoperabilidad CAD/GIS/3D con reproyección CRS/UTM real, importación `.PLY`/`.FBX` y exportación `.SVG`/`.DXF`/`.STL` sin artefactos (Phase 2); luego optimiza la fluidez a 60 FPS, la gestión de memoria GPU en WebGL y la persistencia automática de sesión en `IndexedDB` (Phase 3); y culmina blindando la arquitectura con una suite de pruebas automatizadas en `Vitest`, validación de esquemas `.geoarc` y endurecimiento del entorno de desarrollo (Phase 4).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Precisión Normativa OGUC y Motor Solar** - Sombra OGUC multinivel (Art. 2.6.12), sincronización 2.5D/3D de desplazamiento de lote/volumen, distanciamiento robusto en lotes cóncavos y huso horario solar dinámico. (completed 2026-10-28)
- [x] **Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada** - Escena Three.js compartida (`.GLB`/`.OBJ`/`.STL`/Visor 3D), `.DXF` con recorte BBox e interpolación bilineal, reproyección CRS/UTM real e importación `.PLY`/`.FBX` + exportación `.SVG`. (completed 2026-10-29)
- [x] **Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local** - Autoguardado de sesión en `IndexedDB`, memoización del raymarching solar 2.5D a 60 FPS, liberación recursiva de recursos GPU en WebGL y pipeline DEM sin doble muestreo. (completed 2026-10-29)
- [ ] **Phase 4: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura** - Suite de tests unitarios con `Vitest` para motores geométricos/normativos, validación de integridad `.geoarc`, límite de payload en proxy Overpass y limpieza de dependencias.

## Phase Details

### Phase 1: Precisión Normativa OGUC y Motor Solar
**Goal**: Los arquitectos pueden evaluar envolventes, distanciamientos y sombras normativas OGUC (Art. 2.6.3 y Art. 2.6.12) junto con trayectorias solares astronómicas exactas y sincronizadas sin desfase entre el visor 2.5D, el visor 3D y los archivos `.geoarc`.
**Depends on**: Nothing (first phase)
**Requirements**: OGUC-01, OGUC-02, OGUC-03, OGUC-04
**Success Criteria** (what must be TRUE):
  1. Al activar pisos escalonados sobre `10.5m` (Art. 2.6.12) o basamento continuo en Modo OGUC, el polígono de sombra propuesta proyecta y evalúa la envolvente combinada de todos los niveles activos (`continuous`, `main`, `upper_stepped`) en los azimuts `135°`, `180°` y `225°`, sin encogerse artificialmente al área de la terraza superior.
  2. Al arrastrar la posición del volumen o lote en el visor `Topográfico (SVG)`, el desplazamiento se refleja inmediatamente al cambiar al visor `3D Satelital` y se preserva íntegramente al exportar y volver a cargar un archivo `.geoarc`.
  3. Al dibujar un lote irregular cóncavo (en forma de "L" o "U"), el algoritmo de distanciamiento interior (`insetPolygonBisector`) genera polígonos válidos sin aristas auto-intersectadas ni artefactos en la extrusión 3D ni en el cálculo de superficie.
  4. Al seleccionar cualquier fecha del año (incluyendo `YYYY-01-01` y periodos de horario de verano UTC-3 o invierno UTC-4 en Chile, o ubicaciones en otras longitudes), el Heliodón calcula la altitud y azimut solar en hora local exacta sin desfase de medianoche UTC.
**Plans**: 2/2 plans complete
Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Retranqueo robusto en lotes cóncavos (`insetPolygonBisector`), proyección multinivel de sombras OGUC (`projectMultiTierDirectionalShadowOnTerrain`) y traslación rígida de lote (`translateLotPolygon`) (`OGUC-01`, `OGUC-03`)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — Huso horario dinámico y parseo de fecha local en `SunPosition.ts` / `App.tsx` y sincronización bidireccional de arrastre de lote/volumen en `ContourViewer.tsx` (`OGUC-02`, `OGUC-04`)
**UI hint**: no

### Phase 2: Interoperabilidad CAD / GIS / 3D y Escena Unificada
**Goal**: Los usuarios pueden importar mallas locales y exportar modelos 2D/3D (`.DXF`, `.STL`, `.GLB`, `.OBJ/.MTL`, `.JGW`, `.SVG`) geométricamente consistentes entre sí y georreferenciados en el sistema de coordenadas (`CRS`) seleccionado.
**Depends on**: Phase 1
**Requirements**: CAD-01, CAD-02, CAD-03, CAD-04, QUAL-02
**Success Criteria** (what must be TRUE):
  1. Al exportar un archivo `.DXF`, las vías y cursos de agua se recortan exactamente al borde del BBox (`clipWayToBBox`) sin líneas parásitas perimetrales, se incluyen edificios multipolígono (`relation`) y las cotas Z de todas las entidades se calculan con interpolación bilineal idéntica al visor.
  2. Al exportar un modelo `.STL`, `.GLB` o `.OBJ`, los tres formatos y el visor `3D Satelital` utilizan el mismo constructor unificado de escena Three.js, produciendo idéntica normalización de cota Z respecto a `minEv` y el mismo empotramiento de edificios (`0.35m`) en pendiente.
  3. Al seleccionar un Sistema de Referencia (`EPSG:32718` UTM 18S, `EPSG:32719` UTM 19S, `EPSG:32633` o `EPSG:4326`), tanto el archivo `.DXF` como el Worldfile `.JGW` se exportan con coordenadas reales reproyectadas al CRS elegido.
  4. El usuario dispone en la interfaz de controles activos para importar mallas locales `.PLY` y `.FBX` (convirtiéndolas en terreno editable) y para descargar directamente la lámina vectorial topográfica en formato `.SVG` (`topografia_*.svg`).
**Plans:** 2/2 plans complete
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Servicio de proyección cartográfica Snyder WGS84/UTM (`src/lib/crsService.ts`), Worldfile `.JGW` georreferenciado y serialización `.DXF` con recorte `clipWayToBBox`, edificios `relation` y cota Z bilineal (`CAD-01`, `CAD-03`)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Constructor unificado Three.js en `exportService.ts` (`.STL`/`.GLB`/`.OBJ`/Visor 3D) con empotramiento de 0.35m, dropzone local `.PLY`/`.FBX` en `App.tsx`, selector CRS y botón de lámina vectorial `.SVG` (`CAD-02`, `CAD-04`, `QUAL-02`)
**UI hint**: yes

### Phase 3: Rendimiento 60 FPS, Memoria WebGL y Persistencia Local
**Goal**: La aplicación mantiene sesiones de trabajo persistentes ante recargas del navegador, ejecuta la extracción topográfica sin reprocesamiento redundante y sostiene 60 FPS estables sin fugas de memoria GPU durante la edición interactiva 2.5D y 3D.
**Depends on**: Phase 2
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04
**Success Criteria** (what must be TRUE):
  1. Al recargar la página (`F5`) o reabrir el navegador tras haber extraído un terreno y trazado un lote, la sesión completa (`meshData`, `customLotPts` y parámetros OGUC/Solar) se restaura automáticamente desde `IndexedDB`, contando con una opción visible para limpiar/reiniciar la sesión.
  2. Al orbitar o inclinar la cámara en el visor `Topográfico (SVG)` con las sombras solares activas, la rotación se mantiene fluida a 60 FPS sin recalcular el raymarching solar mientras no cambien la hora, la fecha ni la geometría.
  3. Al deslizar continuamente la hora solar o ajustar parámetros OGUC en el visor `3D Satelital`, los grupos previos de la escena liberan recursivamente sus geometrías, materiales y texturas en GPU (`dispose()`), manteniendo estable el conteo de memoria WebGL (`renderer.info.memory`).
  4. La extracción de terreno genera la grilla DEM directamente con las dimensiones aspect-ratio finales sin doble interpolación `150x150`, y la barra lateral opera directamente sin el botón redundante `"Generar Visualización 3D"`.
**Plans:** 2/2 plans complete
Plans:
**Wave 1**
- [x] 03-01-PLAN.md — Memoización de raymarching solar en `ContourViewer.tsx` a 60 FPS y liberación recursiva de memoria GPU con `disposeObjectTree` en `ThreeTerrainViewer.tsx` (`PERF-02`, `PERF-03`)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-02-PLAN.md — Persistencia en `IndexedDB` (`src/lib/storageService.ts`), toast de restauración y modal 'Nueva Sesión' en `App.tsx`, y extracción DEM directa sin botón simulado (`PERF-01`, `PERF-04`)
**UI hint**: yes

### Phase 4: Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura
**Goal**: El repositorio cuenta con verificación automatizada de sus motores matemáticos/normativos, validación estricta de entradas externas y una configuración de empaquetado limpia y segura en Windows.
**Depends on**: Phase 3
**Requirements**: QUAL-01, QUAL-03
**Success Criteria** (what must be TRUE):
  1. Al ejecutar `npm test` (`Vitest`), pasa el 100% de la suite de pruebas unitarias cubriendo el motor OGUC (`insetPolygonBisector`, `computeOgucModel`, `clipWayToBBox`), el motor solar (`getSunPosition`), las métricas de polígonos, las conversiones CRS/UTM y los constructores de exportación.
  2. Al intentar cargar un archivo `.geoarc` corrupto, con dimensiones de grilla inconsistentes (`grid.length !== cols * rows`) o con una URL externa no segura en `satelliteTexture`, la aplicación rechaza el archivo de forma controlada mostrando un mensaje claro sin bloquear el visor.
  3. El middleware `/api/overpass` en `vite.config.ts` rechaza payloads superiores a `64 KB` y utiliza cabeceras `User-Agent` legítimas, mientras que el bundle de producción compilado (`npm run build`) no expone `GEMINI_API_KEY`.
  4. `package.json` se encuentra libre de paquetes inactivos (`@google/genai`, `express`, `dotenv`, `tsx`), separa correctamente `dependencies` y `devDependencies`, y todos sus scripts (`build`, `test`, `lint`, `clean`) se ejecutan sin errores en Windows PowerShell.
**Plans:** 2 plans
Plans:
**Wave 1**
- [ ] 04-01-PLAN.md — Seguridad, validación estricta de entradas .geoarc, blindaje de proxy Overpass e higiene de dependencias (QUAL-03)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 04-02-PLAN.md — Configuración de Vitest y suite exhaustiva de pruebas unitarias normativas, solares, cartográficas y de exportación (QUAL-01)
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Precisión Normativa OGUC y Motor Solar | 2/2 | Complete | 2026-10-28 |
| 2. Interoperabilidad CAD / GIS / 3D y Escena Unificada | 2/2 | Complete | 2026-10-29 |
| 3. Rendimiento 60 FPS, Memoria WebGL y Persistencia Local | 2/2 | Complete    | 2026-10-29 |
| 4. Suite de Pruebas Vitest, Seguridad e Higiene de Arquitectura | 0/2 | Not started | - |
