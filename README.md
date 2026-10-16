# GEO·ARC — Asistente SIG 3D, Topografía, Ortofoto Satelital y Normativa OGUC

**GEO·ARC** es una plataforma web interactiva para arquitectura y urbanismo que permite seleccionar cualquier terreno del mundo, extraer su topografía real (DEM), ortofoto satelital de alta resolución y contexto urbano 3D (edificaciones, vialidad e hidrografía desde OpenStreetMap), analizar asoleamiento real (Heliodon) y envolventes normativas (OGUC Chile), y exportar modelos listos para **SketchUp, AutoCAD, Rhinoceros, Blender, Revit y QGIS**.

---

## Características Principales

### 1. Selección Interactiva de Terreno y Extracción Geoespacial
- **Mapa expandible con animación fluida:** El panel del mapa se amplía automáticamente al buscar una ubicación para facilitar la selección del área de estudio.
- **Dibujo de polígonos regulares e irregulares:** Trazado de rectángulos/cuadrados o polígonos libres con visualización en tiempo real de dimensiones por lado, área ($\text{m}^2$ / $\text{ha}$) y **centro geométrico (centroide)**.
- **Fuentes de datos integradas:**
  - **Elevación (DEM):** Extracción de grillas altimétricas mediante tiles *Terrarium* (AWS/Mapzen) y *Open-Elevation*.
  - **Contexto Urbano (OpenStreetMap / Overpass API):** Volúmenes de edificaciones existentes, redes viales (`highways`) y cursos de agua (`waterways`).
  - **Ortofoto Satelital (Esri World Imagery):** Captura compuesta de mosaicos satelitales de alta resolución con archivo de georreferenciación Worldfile (`.jgw`).
  - **Importación Local:** Soporte para mallas y nubes de puntos locales en formato `.PLY` y `.FBX`.

### 2. Visualización Dual: 3D Satelital (WebGL) y Topográfico Técnico (SVG 2.5D)
- **Visor 3D Satelital (`ThreeTerrainViewer`):**
  - Malla topográfica suavizada con textura satelital ortorrectificada proyectada sobre el relieve.
  - Extrusión 3D de edificios de contexto emplazados sobre su cota real de terreno.
  - Iluminación solar dinámica y sombras proyectadas en tiempo real.
- **Visor Topográfico Técnico (`ContourViewer`):**
  - Generación vectorial de curvas de nivel (intervalos desde **`0.25m`** hasta **`10m`**, con diferenciación de curvas maestras e intermedias y etiquetas de cota).
  - Modos de vista en **Planta Ortográfica (2D)** e **Isométrica / Perspectiva (2.5D)**.

### 3. Módulos de Análisis Arquitectónico
- **Análisis Normativo (OGUC - Chile):**
  - Preselección automática del grupo de región según latitud geográfica (Norte, Centro, Sur).
  - Configuración de ángulos de rasante, altura de arranque de rasante, distanciamientos mínimos (incluyendo recargo sobre $10.5\text{ m}$ según Art. 2.6.12), altura máxima y placa continua.
  - Retracción geométrica exacta del polígono de lote mediante bisectrices (`insetPolygonBisector`) y proyección de sombras normativas.
- **Análisis Solar y Heliodon (Bóveda Celeste):**
  - Cálculo astronómico preciso (`SunPosition`) según latitud, longitud, fecha y hora del día.
  - Visualización de arcos solares para **Solsticio de Verano (21 Dic)**, **Equinoccios (21 Mar / 21 Sep)** y **Solsticio de Invierno (21 Jun)** con proyección de sombras reales sobre la topografía.

---

## Formatos de Exportación CAD / BIM / 3D

| Botón / Formato | Archivo Generado | Software Destino | Detalles Técnicos |
| :--- | :--- | :--- | :--- |
| **SketchUp (.GLB)** | `*_sketchup.glb` | **SketchUp** (nativo), Blender, Rhino 8 | Modelo binario glTF 2.0 en **metros reales (1:1)** con malla de terreno, edificios 3D y textura satelital incrustada. En SketchUp: *Archivo $\rightarrow$ Importar... $\rightarrow$ Archivos glTF (\*.glb)*. |
| **Modelo 3D (.OBJ ZIP)** | `*_3d_obj.zip` | **Rhinoceros, Blender, AutoCAD, 3ds Max, Revit** | Paquete comprimido con geometría `.obj`, material `.mtl`, ortofoto `.jpg`, georreferenciación `.jgw` e instrucciones (`LEEME_INSTRUCCIONES_3D.txt`). |
| **Ortofoto (.JPG + .JGW)** | `*.jpg` + `*.jgw` | **QGIS, AutoCAD Civil 3D, ArcGIS** | Imagen satelital de alta resolución acompañada de su archivo *Worldfile* en grados decimales (WGS84 / EPSG:4326). |
| **DXF (Curvas + Contexto)** | `isolineas_*.dxf` | **AutoCAD, SketchUp, Civil 3D, Rhino, Revit** | Polilíneas 3D en **metros reales** (`$INSUNITS = 6`, `$MEASUREMENT = 1`) organizadas en capas (`Contours`, `Buildings`, `Highways`, `Waterways`). *(Nota para SketchUp: en Opciones de importación DWG/DXF, seleccionar **Unidades: Metros**)*. |
| **Malla Sólida (.STL)** | `terreno_*.stl` | **Impresión 3D / Laminadores (Cura, Bambu, Prusa)** | Malla 3D para fabricación digital y maquetación física. |
| **Vectorial (.SVG)** | `topografia_*.svg` | **Adobe Illustrator, Inkscape, CorelDRAW** | Lámina vectorial limpia de curvas de nivel, contexto y análisis para postproducción gráfica. |
| **Proyecto (.GEOARC)** | `*.geoarc` | **GEO·ARC** | Guarda y restaura el estado íntegro de la sesión (terreno, parámetros OGUC, fecha solar y capas). |

---

## Instalación y Ejecución Local

### Requisitos previos
- **Node.js** (v18 o superior)
- **npm**

### Pasos
```bash
# 1. Clonar el repositorio
git clone https://github.com/Chris-Fierro/Geo_Arc.git
cd Geo_Arc

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:3000/`.

### Scripts disponibles
- `npm run dev` — Levanta el servidor de desarrollo Vite en el puerto `3000` (con proxy interno para Overpass OSM y Open-Elevation).
- `npm run build` — Compila la aplicación para producción en la carpeta `dist/`.
- `npm run lint` — Ejecuta la verificación estática de tipos con TypeScript (`tsc --noEmit`).

---

## Estructura del Proyecto

```text
Geo_Arc/
├── src/
│   ├── App.tsx                        # Orquestador de estado global, layout e interfaz lateral
│   ├── main.tsx                       # Punto de entrada React
│   ├── index.css                      # Sistema de diseño y variables CSS (temas claro/oscuro)
│   ├── components/
│   │   ├── OsmImporter.tsx            # Mapa Leaflet, dibujo de polígonos (regular/irregular) y extracción DEM/OSM
│   │   ├── ThreeTerrainViewer.tsx     # Visor 3D WebGL (Three.js) con textura satelital, edificios y sol
│   │   └── ContourViewer.tsx          # Visor técnico SVG 2.5D (D3.js), Heliodon, rasantes OGUC y exportador DXF/STL/SVG
│   └── lib/
│       ├── exportService.ts           # Exportadores 3D (.GLB para SketchUp y paquete .OBJ + .MTL + .JPG ZIP)
│       ├── satelliteService.ts        # Descarga y composición de ortofotos Esri World Imagery + Worldfile (.JGW)
│       ├── meshProcessor.ts           # Procesador de mallas locales (.PLY / .FBX) a grillas topográficas
│       ├── SunPosition.ts             # Motor astronómico de posición solar (acimut y elevación)
│       └── templates.ts               # Plantillas auxiliares
├── handoffs/                          # Documentación técnica de iteraciones y handoffs
└── Implementation Plans/              # Planes de implementación de módulos normativos y visuales
```

---

## Créditos y Fuentes de Datos
- **Cartografía y Vectores Urbanos:** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (vía Overpass API & Nominatim).
- **Imágenes Satelitales:** © Esri, Maxar, Earthstar Geographics, GIS User Community (*Esri World Imagery*).
- **Modelos de Elevación Digital (DEM):** AWS Terrain Tiles / Mapzen Terrarium & Open-Elevation.
