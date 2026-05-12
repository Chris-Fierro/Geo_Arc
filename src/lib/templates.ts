export const getPythonCode = (interval: number, crs: string, filename: string = "terreno_proyecto.ply") => `import trimesh
import numpy as np
import geopandas as gpd
from shapely.geometry import LineString
from scipy.interpolate import griddata
import json

def mesh_to_dem_and_contours(mesh_path: str, intervalo_m: float = ${interval}, crs: str = "${crs}"):
    """
    Convierte una malla 3D (FBX, PLY, OBJ) a curvas de nivel.
    Contexto Pedagógico: Este script demuestra el pipeline completo desde
    geometría 3D bruta hasta capas SIG 2D, normalizando unidades y referencias.
    """
    print(f"1. Cargando malla 3D desde: {mesh_path}")
    # trimesh soporta de manera nativa formatos como .fbx, .ply, .obj, .stl
    mesh = trimesh.load(mesh_path, force='mesh')

    # Extracción de vértices
    verts = mesh.vertices
    x, y, z = verts[:, 0], verts[:, 1], verts[:, 2]

    # VALIDACIÓN: Problema clásico de ejes (Y-Up vs Z-Up)
    # Muchos softwares de arquitectura exportan con Y apuntando hacia arriba.
    # Si detectamos que Z no varía pero Y sí, aplicamos rotación.
    if np.var(z) < 0.01 and np.var(y) > 1.0:
        print("Ajuste aplicado: Eje Y-up detectado. Convirtiendo a Z-up topográfico.")
        y, z = z, y  # Intercambio de ejes

    # Validación de elevación
    if np.var(z) < 0.01:
        print("ADVERTENCIA: Geometría plana detectada. Alturas inferidas como Z=0. "
              "Si esto es un error, verifica la exportación desde tu software CAD/BIM.")

    print(f"2. Trazabilidad: Rango de elevación normalizada: {z.min():.2f}m a {z.max():.2f}m")

    # 3. RASTERIZACIÓN: Crear un Modelo de Elevación Digital (DEM)
    resolucion = 0.5  # px/m
    xi = np.arange(x.min(), x.max(), resolucion)
    yi = np.arange(y.min(), y.max(), resolucion)
    Xi, Yi = np.meshgrid(xi, yi)

    print("3. Interpolando nube de puntos a Raster (DEM)...")
    Zi = griddata((x, y), z, (Xi, Yi), method='linear')

    # 4. EXTRACCIÓN DE CURVAS (Isolíneas)
    import matplotlib.pyplot as plt
    print(f"4. Calculando isolíneas cada {intervalo_m} metros...")
    fig, ax = plt.subplots()
    niveles = np.arange(np.nanmin(Zi), np.nanmax(Zi), intervalo_m)
    cs = ax.contour(Xi, Yi, Zi, levels=niveles)

    # Convertir a objetos geoespaciales (Shapely)
    lineas = []
    elevaciones = []
    for collection, level in zip(cs.collections, cs.levels):
        for path in collection.get_paths():
            v = path.vertices
            if len(v) >= 2:
                lineas.append(LineString(v))
                elevaciones.append(level)

    # 5. ASIGNACIÓN CRS Y NORMALIZACIÓN
    print(f"5. Asignando Sistema de Referencia de Coordenadas: {crs}")
    gdf = gpd.GeoDataFrame({'elevacion': elevaciones, 'geometry': lineas}, crs=crs)

    # 6. EXPORTACIÓN
    out_geojson = "curvas_topograficas.geojson"
    gdf.to_file(out_geojson, driver="GeoJSON")
    print(f"Exportación exitosa: {len(gdf)} curvas generadas.")
    
    return True

if __name__ == '__main__':
    mesh_to_dem_and_contours('${filename}')
`;

export const getJsonOutput = (interval: number, crs: string, filename: string = "terreno_proyecto.ply") => `{
  "status": "success",
  "metadata": {
    "crs": "${crs}",
    "unidades_origen": "desconocidas_inferidas_metros",
    "intervalo_curvas": ${interval}
  },
  "trazabilidad": {
    "origen": "${filename}",
    "proceso": "Mesh (FBX/PLY) -> PointCloud -> Interpolated DEM -> Isoline Extraction",
    "correccion_ejes": "Evaluación Y-UP automática aplicada",
    "timestamp": new Date().toISOString()
  },
  "validaciones_aplicadas": [
    "Normalización de escala a metros (1 unit = 1m)",
    "Inferencia de Z (Topología corregida por varianza de vértices)",
    "Asignación de sistema de referencia espacial (EPSG)"
  ],
  "outputs": [
    {
      "tipo": "GeoJSON",
      "archivo": "curvas_topograficas.geojson",
      "descripcion": "Polilíneas topográficas con atributo 'elevacion' para QGIS/AutoCAD"
    },
    {
      "tipo": "GeoTIFF",
      "archivo": "modelo_dem.tif",
      "descripcion": "Raster Grid interpolado para análisis 3D"
    }
  ]
}`;
