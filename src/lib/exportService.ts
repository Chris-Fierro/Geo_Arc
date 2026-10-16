import * as THREE from 'three';
import { OBJExporter, GLTFExporter } from 'three-stdlib';
import * as fflate from 'fflate';
import type { MeshData } from './meshProcessor';

export interface Export3DOptions {
  meshData: MeshData;
  satelliteDataUrl?: string;
  worldFile?: string;
  zExaggeration?: number;
  fileName?: string;
  includeBuildings?: boolean;
}

/**
 * Builds a Three.js Scene containing the 3D terrain and extruded context buildings.
 */
export function buildThreeSceneFromMeshData(
  meshData: MeshData,
  zExaggeration: number = 1.0,
  satelliteTexture?: THREE.Texture | null,
  includeBuildings: boolean = true
): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = 'GeoArc_Terrain_Scene';

  const cols = meshData.cols || meshData.size || 150;
  const rows = meshData.rows || meshData.size || 150;
  const widthM = meshData.w || 500;
  const heightM = meshData.h || 500;
  const minEv = meshData.minEv || 0;

  // 1. Terrain Mesh (PlaneGeometry oriented horizontally, Z-up for architecture)
  const geom = new THREE.PlaneGeometry(widthM, heightM, cols - 1, rows - 1);
  // PlaneGeometry default is in XY plane. Rotate -90 deg on X so it lies on XZ plane, with Y pointing up (or Z-up in export).
  geom.rotateX(-Math.PI / 2);

  const posAttr = geom.attributes.position;
  // Apply elevations to Y coordinate (Three.js up-axis)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const vertIdx = r * cols + c;
      const elev = meshData.grid[r * cols + c] ?? minEv;
      const yVal = (elev - minEv) * zExaggeration;
      posAttr.setY(vertIdx, yVal);
    }
  }
  geom.computeVertexNormals();

  // Terrain Material
  let terrainMat: THREE.Material;
  if (satelliteTexture) {
    satelliteTexture.colorSpace = THREE.SRGBColorSpace;
    terrainMat = new THREE.MeshStandardMaterial({
      map: satelliteTexture,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
      name: 'Terreno_Satelital_Mat',
    });
  } else {
    terrainMat = new THREE.MeshStandardMaterial({
      color: 0x88aa77,
      roughness: 0.9,
      side: THREE.DoubleSide,
      name: 'Terreno_Base_Mat',
    });
  }

  const terrainMesh = new THREE.Mesh(geom, terrainMat);
  terrainMesh.name = 'Terreno_Topografico';
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // 2. Extruded Context Buildings
  if (includeBuildings && meshData.buildings?.elements && meshData.bbox) {
    const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
    const widthSpan = maxLon - minLon || 1;
    const heightSpan = maxLat - minLat || 1;

    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0xfafafa,
      roughness: 0.4,
      metalness: 0.1,
      name: 'Edificios_Contexto_Mat',
    });

    const getElevAtM = (lon: number, lat: number) => {
      const u = ((lon - minLon) / widthSpan) * (cols - 1);
      const v = ((maxLat - lat) / heightSpan) * (rows - 1);
      const uClamped = Math.max(0, Math.min(cols - 1, u));
      const vClamped = Math.max(0, Math.min(rows - 1, v));

      const c0 = Math.floor(uClamped);
      const c1 = Math.min(cols - 1, c0 + 1);
      const r0 = Math.floor(vClamped);
      const r1 = Math.min(rows - 1, r0 + 1);

      const tx = uClamped - c0;
      const ty = vClamped - r0;

      const v00 = meshData.grid[r0 * cols + c0] ?? minEv;
      const v10 = meshData.grid[r0 * cols + c1] ?? minEv;
      const v01 = meshData.grid[r1 * cols + c0] ?? minEv;
      const v11 = meshData.grid[r1 * cols + c1] ?? minEv;

      const interpolated =
        (1 - tx) * (1 - ty) * v00 +
        tx * (1 - ty) * v10 +
        (1 - tx) * ty * v01 +
        tx * ty * v11;

      return interpolated - minEv;
    };

    const buildingsGroup = new THREE.Group();
    buildingsGroup.name = 'Edificios_Contexto';

    const elements = meshData.buildings.elements;
    for (const el of elements) {
      // Process ways and outer relation members
      let geometriesToProcess: { lat: number; lon: number }[][] = [];
      if (el.type === 'way' && el.tags?.building && el.geometry?.length >= 3) {
        geometriesToProcess.push(el.geometry);
      } else if (el.type === 'relation' && el.tags?.building && Array.isArray(el.members)) {
        for (const m of el.members) {
          if (m.role === 'outer' && m.geometry?.length >= 3) {
            geometriesToProcess.push(m.geometry);
          }
        }
      }

      let height = 4.0;
      if (el.tags?.height) {
        height = parseFloat(el.tags.height) || 4.0;
      } else if (el.tags?.['building:levels']) {
        height = (parseFloat(el.tags['building:levels']) || 1) * 3.5;
      }

      for (const geomCoords of geometriesToProcess) {
        try {
          // Strip duplicate closing coordinate if present
          let pts = [...geomCoords];
          if (pts.length > 3) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (Math.abs(first.lat - last.lat) < 1e-7 && Math.abs(first.lon - last.lon) < 1e-7) {
              pts.pop();
            }
          }
          if (pts.length < 3) continue;

          let avgX = 0;
          let avgZ = 0;
          let minFootprintElev = Infinity;
          let maxFootprintElev = -Infinity;

          const worldCoords: { wx: number; wz: number; elev: number }[] = [];
          for (const pt of pts) {
            const wx = ((pt.lon - minLon) / widthSpan - 0.5) * widthM;
            const wz = ((maxLat - pt.lat) / heightSpan - 0.5) * heightM;
            const elev = getElevAtM(pt.lon, pt.lat);
            avgX += wx;
            avgZ += wz;
            if (elev < minFootprintElev) minFootprintElev = elev;
            if (elev > maxFootprintElev) maxFootprintElev = elev;
            worldCoords.push({ wx, wz, elev });
          }

          avgX /= pts.length;
          avgZ /= pts.length;

          // 2D shape in local coordinates centered at (avgX, avgZ)
          // Three.js 2D shape: +X is East (wx - avgX), +Y is North (-(wz - avgZ))
          const shapePts = worldCoords.map(
            (c) => new THREE.Vector2(c.wx - avgX, -(c.wz - avgZ))
          );

          // Ensure Counter-Clockwise (CCW) winding order for outward normals
          if (THREE.ShapeUtils.isClockWise(shapePts)) {
            shapePts.reverse();
          }

          const shape = new THREE.Shape(shapePts);

          // Embed base 0.35m into lowest ground point to prevent hovering on slopes
          const baseEmbed = 0.35;
          const baseLevelM = Math.max(0, minFootprintElev - baseEmbed) * zExaggeration;
          const slopeDelta = Math.max(0, maxFootprintElev - minFootprintElev) * zExaggeration;
          const totalDepth = height * zExaggeration + slopeDelta + (baseEmbed * zExaggeration);

          const extrudeGeom = new THREE.ExtrudeGeometry(shape, {
            depth: totalDepth,
            bevelEnabled: false,
          });

          // Rotate -90 deg on X so +Z extrusion becomes +Y up, and -Y becomes +Z
          extrudeGeom.rotateX(-Math.PI / 2);

          const bMesh = new THREE.Mesh(extrudeGeom, buildingMat);
          bMesh.position.set(avgX, baseLevelM, avgZ);
          bMesh.castShadow = true;
          bMesh.receiveShadow = true;
          buildingsGroup.add(bMesh);
        } catch (_) {}
      }
    }

    scene.add(buildingsGroup);
  }

  return scene;
}

/**
 * Downloads a binary or text file to the user's browser.
 */
export function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Exports the complete 3D scene as a ZIP containing .OBJ + .MTL + Texture JPG for SketchUp/Rhino/CAD.
 */
export async function exportToObjZip(options: Export3DOptions) {
  const { meshData, satelliteDataUrl, worldFile, zExaggeration = 1.0, fileName = 'terreno_geoarc' } = options;

  let satTexture: THREE.Texture | null = null;
  let imageU8Array: Uint8Array | null = null;

  if (satelliteDataUrl) {
    try {
      const res = await fetch(satelliteDataUrl);
      const imgBuf = await res.arrayBuffer();
      imageU8Array = new Uint8Array(imgBuf);
      satTexture = new THREE.TextureLoader().load(satelliteDataUrl);
    } catch (_) {}
  }

  const scene = buildThreeSceneFromMeshData(meshData, zExaggeration, satTexture, options.includeBuildings !== false);

  const exporter = new OBJExporter();
  const rawObjString = exporter.parse(scene);

  // Inject material library reference at the beginning of OBJ
  const mtlFileName = `${fileName}.mtl`;
  const textureFileName = 'textura_satelital.jpg';
  const objString = `mtllib ${mtlFileName}\n` + rawObjString;

  // Build standard MTL file
  const mtlString = [
    `# Archivo de materiales Geo_Arc para SketchUp / Rhino / AutoCAD`,
    `newmtl Terreno_Satelital_Mat`,
    `Ka 1.000 1.000 1.000`,
    `Kd 1.000 1.000 1.000`,
    `Ks 0.100 0.100 0.100`,
    `Ns 10.0`,
    `d 1.0`,
    `illum 2`,
    imageU8Array ? `map_Kd ${textureFileName}` : '',
    ``,
    `newmtl Edificios_Contexto_Mat`,
    `Ka 0.950 0.950 0.950`,
    `Kd 0.950 0.950 0.950`,
    `Ks 0.200 0.200 0.200`,
    `Ns 20.0`,
    `d 1.0`,
    `illum 2`,
    ``,
  ].join('\n');

  const readmeString = [
    `========================================================================`,
    `  GEO·ARC - MODELO 3D DE TERRENO Y CONTEXTO SATELITAL`,
    `========================================================================`,
    ``,
    `Archivos incluidos:`,
    `- ${fileName}.obj          : Malla 3D del relieve y volúmenes de contexto en metros.`,
    `- ${fileName}.mtl          : Definición de materiales con proyección UV.`,
    `- ${textureFileName}    : Ortofoto satelital de alta resolución capturada.`,
    worldFile ? `- ${fileName}.jgw          : Archivo de georreferenciación Worldfile para QGIS/AutoCAD.` : '',
    ``,
    `CÓMO ABRIR EN RHINOCEROS / BLENDER / AUTOCAD / REVIT / 3DS MAX:`,
    `- Rhinoceros: File -> Import -> '${fileName}.obj'`,
    `- Blender: File -> Import -> Wavefront (.obj)`,
    `- AutoCAD / Civil 3D: Comando 'IMPORT' o insertar ortofoto con archivo .jgw.`,
    `- 3ds Max: File -> Import -> '${fileName}.obj'`,
    ``,
    `IMPORTANTE PARA USUARIOS DE SKETCHUP:`,
    `1. MODELO 3D REALISTA (.GLB):`,
    `   SketchUp admite de forma nativa la importación de modelos en formato glTF / GLB.`,
    `   Para importar directamente en SketchUp sin necesidad de extensiones:`,
    `   a. En Geo_Arc, utiliza el botón de descarga 'SketchUp (.GLB)'.`,
    `   b. En SketchUp ve a: Archivo -> Importar...`,
    `   c. Selecciona formato 'Archivos glTF (*.gltf, *.glb)'.`,
    `   d. Selecciona el archivo '${fileName}_sketchup.glb' e importa.`,
    `   e. ¡Listo! El terreno y edificios aparecerán en metros reales y con su textura satelital.`,
    ``,
    `2. IMPORTACIÓN DE CURVAS DE NIVEL (.DXF) EN SKETCHUP (ESCALA 1:1):`,
    `   Geo_Arc genera todos los archivos DXF en METROS reales ($INSUNITS = 6).`,
    `   Sin embargo, por defecto, SketchUp suele tener configuradas las 'Pulgadas' en su importador DXF/DWG.`,
    `   Para que el DXF no se reduzca a 1/39 de su tamaño:`,
    `   a. En SketchUp, ve a: Archivo -> Importar...`,
    `   b. Selecciona el archivo '.dxf'.`,
    `   c. ¡MUY IMPORTANTE! Haz clic en el botón 'Opciones...' (Options) antes de presionar Importar.`,
    `   d. En el menú desplegable 'Unidades' (Units), selecciona 'Metros'.`,
    `   e. Haz clic en Aceptar e Importar. Las curvas coincidirán exactamente al 100% con el modelo GLB.`,
    ``,
    `Generado por Geo_Arc - Asistente SIG para Arquitectura y Urbanismo.`,
  ].join('\r\n');

  // Package all files into a ZIP archive using fflate
  const zipEntries: Record<string, Uint8Array> = {
    [`${fileName}.obj`]: fflate.strToU8(objString),
    [mtlFileName]: fflate.strToU8(mtlString),
    ['LEEME_INSTRUCCIONES_3D.txt']: fflate.strToU8(readmeString),
  };

  if (imageU8Array) {
    zipEntries[textureFileName] = imageU8Array;
  }
  if (worldFile) {
    zipEntries[`${fileName}.jgw`] = fflate.strToU8(worldFile);
  }

  const zipBytes = fflate.zipSync(zipEntries);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  triggerBrowserDownload(blob, `${fileName}_3d_obj.zip`);
}

/**
 * Exports the complete 3D scene as a standalone binary .GLB file (Native SketchUp compatible).
 */
export async function exportToGlb(options: Export3DOptions) {
  const { meshData, satelliteDataUrl, zExaggeration = 1.0, fileName = 'terreno_geoarc' } = options;

  let satTexture: THREE.Texture | null = null;
  if (satelliteDataUrl) {
    try {
      satTexture = await new Promise<THREE.Texture>((resolve) => {
        new THREE.TextureLoader().load(satelliteDataUrl, (t) => resolve(t));
      });
    } catch (_) {}
  }

  const scene = buildThreeSceneFromMeshData(meshData, zExaggeration, satTexture, options.includeBuildings !== false);

  const exporter = new GLTFExporter();
  const glbArrayBuffer = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;

  const blob = new Blob([glbArrayBuffer], { type: 'model/gltf-binary' });
  triggerBrowserDownload(blob, `${fileName}_sketchup.glb`);
}
