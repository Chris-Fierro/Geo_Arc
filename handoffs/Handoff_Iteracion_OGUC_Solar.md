# Handoff: Consolidación de Modos de Análisis (Topográfico, OGUC, Solar) en GEO·ARC

Este documento es el resumen técnico del trabajo realizado en la última iteración. Detalla la integración exitosa de los módulos docentes en la plataforma y sirve como punto de reanudación para futuros desarrollos.

---

## 1. Arquitectura de Estado y Modos de Análisis (`App.tsx`)
El estado global de la aplicación ha sido refactorizado para soportar un flujo de trabajo estructurado en tres grandes enfoques pedagógicos.
*   **Selector de Modos (`AnalysisMode`):** Se introdujo una tipología estricta `"topographic" | "oguc" | "solar"`.
*   **Controles Centralizados Compartidos:**
    *   **Geolocalización:** `locationLat` y `locationLon`, integrados con presets rápidos para **Temuco** y **Santiago**. Estos afectan tanto a la malla topográfica (orientación futura) como a la exactitud del cálculo astronómico.
    *   **Gestor de Capas OSM:** Sistema unificado de visibilidad booleana para encender/apagar dinámicamente Edificios de Contexto, Vías (Calles/Caminos) y Cuerpos de Agua.

## 2. Desarrollo del Motor Astronómico (`SunPosition.ts`)
Se implementó un módulo matemático agnóstico y puramente funcional para resolver la mecánica celeste en tiempo real.
*   **Modelo de Cálculo:** Incluye resolución de la Ecuación del Tiempo (`eqTime`), Declinación Solar, Tiempo Solar Verdadero y Ángulo Cenital.
*   **Inputs:** Latitud, Longitud, Fecha y Hora Local.
*   **Outputs:** Ángulo de **Elevación** (en grados) y **Acimut** (0 = Norte, 90 = Este, 180 = Sur, 270 = Oeste).

## 3. Ampliación del Motor 2.5D / SVG (`ContourViewer.tsx`)
El visor isométrico principal ha sido ampliado drásticamente sin introducir un canvas WebGL pesado, manteniendo toda la docencia renderizada nativamente en el DOM (SVG).

### A. Modo Normativo (OGUC)
*   **Volumen Teórico y Lote:** Se generan dinámicamente un `lotPolygon` base y un `projectVolume` geométrico centrado para emular una propuesta arquitectónica básica.
*   **Algoritmo de Sombras Radiales:** Implementación de `getOgucShadowPolygon` que proyecta la volumetría superior hacia el suelo topográfico (Z=base) usando un ángulo de rasante fijo manipulable (`ogucAngle`) y orientaciones prefijadas.
*   **Cuantificación Analítica:** Uso de una función `polygonArea` (algoritmo _Shoelace_) que computa en tiempo real la superficie aproximada en **m²** de la sombra propuesta y la expone en la leyenda de la interfaz.

### B. Modo Físico (Solar)
*   **Sombras Dinámicas Direccionales:** `getSolarShadowPolygon` consume los vectores de elevación y acimut desde `SunPosition.ts`. Genera una proyección de las aristas superiores del bloque de proyecto calculando iterativamente los deltas `X/Y` hasta que tocan la pendiente base. Solo proyecta sombra si el sol está sobre el horizonte (`elevation > 0`).
*   **Bóveda Celeste Visual:** 
    *   Se calcula y traza un **Arco Solar** tridimensional (`sunPathLine`) extrapolando las posiciones solares de todo el día (desde 05:00 hasta 21:00 hrs).
    *   Un indicador de **Sol** (orbe naranja brillante) recorre este riel en perfecta sincronía bidireccional con el *slider* temporal de la interfaz.

### C. Sistema de Leyendas HUD Híbrido
*   La Leyenda Topográfica de la esquina inferior izquierda muta su contenido según el modo activo:
    *   **Topográfico:** Expresa métricas de isolíneas y contornos.
    *   **OGUC:** Muestra la relación entre lote, volumen normativo propuesto y el metraje cuadrado de la sombra aproximada.
    *   **Solar:** Muestra telemetría de latitud/longitud, e indicadores variables en tiempo real del Acimut y la Elevación Astronómica.

## 4. Estabilidad y Corrección de Bugs
*   **Hotfix Typescript (Blob):** Se resolvió un falso positivo en tiempo de compilación con el analizador IDE (Error de asignación de `ArrayBufferLike` a `BlobPart`). Se corrigió mediante aserción `as ArrayBuffer` estricta sobre el `dataView.buffer` utilizado para la exportación de geometrías `.stl`.

---

### Siguientes Pasos (Próxima Iteración Sugerida)
1.  **Edición Manual de Lotes (OGUC):** Cambiar los polígonos hardcodeados del predio a nodos manipulables con el ratón por el usuario en modo Planta.
2.  **Topografía Intersectante:** Refinar las sombras (que hoy se proyectan sobre el plano Z-base del modelo) para que colisionen tridimensionalmente contorneando la pendiente irregular de las curvas de nivel.
3.  **Exportación PDF / Reportes:** Compilar los resultados gráficos de sombras o perfiles en un reporte académico exportable para estudiantes.
