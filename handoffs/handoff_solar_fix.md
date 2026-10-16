# Handoff: Consolidación del Motor Solar y Heliodon Dinámico en GEO·ARC

Este documento resume las implementaciones críticas realizadas en el modo Solar (`SunPosition` y `ContourViewer`), asegurando rigor astronómico y una representación visual coherente y dinámica de la bóveda celeste.

---

## 1. Corrección del Módulo Astronómico (`SunPosition.ts`)
Se reescribió por completo la lógica para calcular la posición física del sol, resolviendo problemas de imprecisión en el hemisferio sur y desfases temporales.
*   **Hora Solar Verdadera (TST):** Se incorporó la Ecuación del Tiempo y la corrección por longitud, asegurando que el mediodía solar coincida con el cenit astronómico local.
*   **Declinación Precisa:** Se actualizaron las fórmulas trigonométricas de declinación y ángulo horario.
*   **Resultados de Validación:** En el solsticio de verano (21 Dic) al mediodía para Santiago/Concepción, el modelo arroja acimuts alineados al Norte (0° / 360°) y elevaciones de casi ~80°, validando el modelo matemático frente a referencias formales.

## 2. Refactorización de la Geometría de Sombras
*   Se corrigió la proyección en `ContourViewer` para dejar de depender de simples multiplicadores vectoriales Z.
*   Se implementó la fórmula trigonométrica formal: `longitud = altura / Math.tan(elevación)`, garantizando elongaciones reales (sombras largas al atardecer/amanecer y nulas o muy cortas al mediodía en verano).
*   Se introdujo una mitigación que oculta sombras y orbe solar si el sol está por debajo del horizonte (`elevation < 0.5`).

## 3. Heliodon Dinámico y HUD 2D
El problema del "heliodon que desaparece" al hacer zoom se solucionó desacoplando su renderizado según el modo de cámara activo.

### A) Vista Perspectiva (2.5D)
*   **Coordenadas de Mundo:** La bóveda solar sigue anclada físicamente al mapa.
*   **Clamping Automático de Escala:** Implementamos un factor (`zoomK` obtenido directamente de `d3.zoom`) que recorta matemáticamente el radio del heliodon si el nivel de zoom amenaza con sacarlo del encuadre visual (`Math.min(baseRadius, maxRadius / zoomK)`).
*   **Anulación de Factor Z (`zScale`):** Se corrigió el aplanamiento de la bóveda inyectando `1 / zScale` en la componente altimétrica, contrarrestando la compresión del terreno y manteniendo la esfera geométrica perfecta sin distorsión ovalada.

### B) Vista Planta (2D)
*   **HUD Vectorial Desacoplado:** El heliodon se extrajo del `zoomGroupRef` (el contenedor que d3 arrastra/escala). 
*   **Proyección Azimutal Fija:** Se programó una proyección clásica de carta solar cenital en el centro del *viewBox*. El radio y la orientación están anclados a la pantalla (viewport).
*   **Interactividad Independiente:** Ahora el usuario puede encuadrar detalles milimétricos del mapa topográfico de fondo, mientras el compás solar permanece flotante como una brújula HUD técnica.

## 4. Inserción de Guías Celestes (Heliodon Académico)
Para potenciar el carácter docente (al estilo Andrew Marsh), se generó `heliodonGuides`:
*   Un **Ecuador perimetral** en el horizonte.
*   Líneas de **Elevación de Referencia** a 30° y 60°.
*   El **Meridiano Norte**, una guía cenital fundamental para visualizar el culmen solar.
*   **Puntos Cardinales Dinámicos** anclados a la base del compás.

---

### Estado Actual de la Compilación
*   **Estabilidad:** El proyecto compila limpiamente bajo TypeScript (`tsc 0 errores`). Todas las dependencias React y hooks están debidamente encadenados.
*   **Rendimiento:** Las matemáticas del heliodon y sombras fueron fuertemente optimizadas mediante envolventes `useMemo` con dependencias mínimas (e.g. `zoomK`, `isPerspective`, `meshData`).

### Próximos Pasos Sugeridos
1.  **Edición Interactiva de Polígonos:** Habilitar a los usuarios a dibujar/manipular los vértices de un lote OGUC/Solar directamente en la malla SVG mediante herramientas de puntero.
2.  **Topografía Sombreable:** Implementar que las polilíneas de sombra no caigan sobre el plano Z-0 plano constante, sino que su deformación lea la altura `elev` en cada punto del terreno usando un raycaster interno o la red `meshData.grid`.
