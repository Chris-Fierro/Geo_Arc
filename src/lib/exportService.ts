import * as THREE from 'three';
import { OBJExporter, GLTFExporter, STLExporter } from 'three-stdlib';
import * as fflate from 'fflate';
import * as d3 from 'd3';
import type { MeshData } from './meshProcessor';
import { clipWayToBBox } from './ogucService';
import { projectPointToCrs, generateWorldFileForCrs } from './crsService';

export interface Export3DOptions {
  meshData: MeshData;
  satelliteDataUrl?: string;
  worldFile?: string;
  crs?: string;
  zExaggeration?: number;
  fileName?: string;
  includeBuildings?: boolean;
}

export interface DxfExportParams {
  meshData: MeshData;
  contours: any[];
  crs?: string;
  layerVisibility?: { buildings?: boolean; highways?: boolean; waterways?: boolean };
  customLotPts?: { x: number; y: number; elev: number }[] | null;
}

export interface SvgExportParams {
  meshData: MeshData;
  contours?: any[];
  fileName?: string;
  crs?: string;
  interval?: number;
  masterIntervalCount?: number;
  showContourLabels?: boolean;
  customLotPts?: { x: number; y: number; elev: number }[] | null;
  layerVisibility?: { buildings?: boolean; highways?: boolean; waterways?: boolean };
}

export interface ThreeSceneBuildOptions {
  zExaggeration?: number;
  satelliteTexture?: THREE.Texture | null;
  includeBuildings?: boolean;
  wireframe?: boolean;
  terrainColor?: number;
  buildingEdges?: boolean;
  baseTerrainName?: string;
  buildingsGroupName?: string;
}

/**
 * Samples continuous elevation from a DEM grid using bilinear interpolation.
 * Avoids discrete staircasing artifacts on buildings and roads.
 */
export function sampleBilinearElevation(
  grid: number[],
  cols: number,
  rows: number,
  u: number,
  v: number,
  fallback: number = 0
): number {
  if (!grid || grid.length === 0 || cols <= 0 || rows <= 0) return fallback;
  const uClamped = Math.max(0, Math.min(cols - 1, Number.isFinite(u) ? u : 0));
  const vClamped = Math.max(0, Math.min(rows - 1, Number.isFinite(v) ? v : 0));

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

/**
 * Builds a Three.js Scene containing the 3D terrain and extruded context buildings.
 */
export function buildThreeSceneFromMeshData(
  meshData: MeshData,
  options: number | ThreeSceneBuildOptions = 1.0,
  legacySatelliteTexture?: THREE.Texture | null,
  legacyIncludeBuildings: boolean = true
): THREE.Scene {
  const opts: ThreeSceneBuildOptions =
    typeof options === 'number'
      ? {
          zExaggeration: options,
          satelliteTexture: legacySatelliteTexture,
          includeBuildings: legacyIncludeBuildings,
        }
      : options;

  const zExaggeration = opts.zExaggeration ?? 1.0;
  const satelliteTexture = opts.satelliteTexture ?? null;
  const includeBuildings = opts.includeBuildings !== false;
  const wireframe = opts.wireframe ?? false;
  const terrainColor = opts.terrainColor ?? 0x88aa77;
  const buildingEdges = opts.buildingEdges ?? false;
  const baseTerrainName = opts.baseTerrainName ?? 'Terreno_Topografico';
  const buildingsGroupName = opts.buildingsGroupName ?? 'Edificios_Contexto';

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
      wireframe,
      side: THREE.DoubleSide,
      name: 'Terreno_Satelital_Mat',
    });
  } else {
    terrainMat = new THREE.MeshStandardMaterial({
      color: terrainColor,
      roughness: 0.9,
      wireframe,
      side: THREE.DoubleSide,
      name: 'Terreno_Base_Mat',
    });
  }

  const terrainMesh = new THREE.Mesh(geom, terrainMat);
  terrainMesh.name = baseTerrainName;
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

    const edgeMat = buildingEdges
      ? new THREE.LineBasicMaterial({
          color: 0x222222,
          linewidth: 1.5,
        })
      : null;

    const getElevAtM = (lon: number, lat: number) => {
      const u = ((lon - minLon) / widthSpan) * (cols - 1);
      const v = ((maxLat - lat) / heightSpan) * (rows - 1);
      return sampleBilinearElevation(meshData.grid, cols, rows, u, v, minEv) - minEv;
    };

    const buildingsGroup = new THREE.Group();
    buildingsGroup.name = buildingsGroupName;

    const elements = meshData.buildings.elements;
    for (const el of elements) {
      // Process ways and outer relation members
      const geometriesToProcess: { lat: number; lon: number }[][] = [];
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
          const pts = [...geomCoords];
          if (pts.length > 3) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (Math.abs(first.lat - last.lat) < 1e-7 && Math.abs(first.lon - last.lon) < 1e-7) {
              pts.pop();
            }
          }
          if (pts.length < 3) continue;

          let sumLon = 0;
          let sumLat = 0;
          for (const pt of pts) {
            sumLon += pt.lon;
            sumLat += pt.lat;
          }
          const avgLon = sumLon / pts.length;
          const avgLat = sumLat / pts.length;
          if (avgLon < minLon || avgLon > maxLon || avgLat < minLat || avgLat > maxLat) {
            continue;
          }

          let avgX = 0;
          let avgZ = 0;
          let minFootprintElev = Infinity;
          let maxFootprintElev = -Infinity;

          const worldCoords: { wx: number; wz: number; elev: number }[] = [];
          for (const pt of pts) {
            const cLon = Math.max(minLon, Math.min(maxLon, pt.lon));
            const cLat = Math.max(minLat, Math.min(maxLat, pt.lat));
            const wx = ((cLon - minLon) / widthSpan - 0.5) * widthM;
            const wz = ((maxLat - cLat) / heightSpan - 0.5) * heightM;
            const elev = getElevAtM(cLon, cLat);
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

          if (edgeMat) {
            const edges = new THREE.EdgesGeometry(extrudeGeom);
            const line = new THREE.LineSegments(edges, edgeMat);
            bMesh.add(line);
          }

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
 * Generates AutoCAD 2000 (AC1015) DXF format content in meters ($INSUNITS 6, $MEASUREMENT 1).
 * Features Liang-Barsky way clipping, OSM relation multipolygon buildings, bilinear Z elevation,
 * and deterministic reprojection according to active CRS.
 */
export function generateDxfContent(params: DxfExportParams): string {
  const {
    meshData,
    contours,
    crs = 'EPSG:32719',
    layerVisibility = { buildings: true, highways: true, waterways: true },
    customLotPts,
  } = params;

  const cols = meshData.cols || meshData.size || 150;
  const rows = meshData.rows || meshData.size || 150;

  // Header and layer definitions
  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1015',
    '9', '$HANDSEED', '5', 'FFFF',
    '9', '$MEASUREMENT', '70', '1', // 1 = Metric
    '9', '$INSUNITS', '70', '6', // 6 = Meters
    '9', '$LUNITS', '70', '2', // 2 = Decimal
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '5',
    '0', 'LAYER', '2', 'CONTOURS', '70', '0', '62', '2', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'BUILDINGS', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'HIGHWAYS', '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'WATERWAYS', '70', '0', '62', '5', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'LOT_BOUNDARY', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES'
  ];

  // Projection helper for point coordinates
  const projectCoord = (lon: number, lat: number, gx: number, gy: number): { x: number; y: number } => {
    if (meshData.bbox) {
      return projectPointToCrs(lat, lon, crs);
    }
    const x = (gx / Math.max(1, cols - 1)) * meshData.w;
    const y = (1.0 - gy / Math.max(1, rows - 1)) * meshData.h;
    return { x, y };
  };

  // 1. Contours (CONTOURS)
  if (Array.isArray(contours)) {
    for (const c of contours) {
      const z = Number(c.value) || 0;
      let rawLines: any[] = [];
      if (c.type === 'LineString') {
        rawLines = [c.coordinates];
      } else if (c.type === 'MultiLineString' || c.type === 'Polygon') {
        rawLines = c.coordinates;
      } else if (c.type === 'MultiPolygon') {
        rawLines = c.coordinates.flat(1);
      } else if (Array.isArray(c.coordinates)) {
        if (c.coordinates.length > 0 && typeof c.coordinates[0][0] === 'number') {
          rawLines = [c.coordinates];
        } else {
          rawLines = c.coordinates.flat(1);
        }
      }

      for (const line of rawLines) {
        if (!Array.isArray(line) || line.length < 2) continue;
        lines.push(
          '0', 'POLYLINE',
          '8', 'CONTOURS',
          '66', '1',
          '70', '8', // 3D polyline
          '10', '0.0', '20', '0.0', '30', z.toFixed(3)
        );
        for (const pt of line) {
          const px = pt[0];
          const py = pt[1];
          let proj: { x: number; y: number };
          if (meshData.bbox) {
            const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
            const lon = minLon + (px / Math.max(1, cols - 1)) * (maxLon - minLon);
            const lat = maxLat - (py / Math.max(1, rows - 1)) * (maxLat - minLat);
            proj = projectCoord(lon, lat, px, py);
          } else {
            proj = projectCoord(0, 0, px, py);
          }
          lines.push(
            '0', 'VERTEX',
            '8', 'CONTOURS',
            '70', '32', // 3D vertex
            '10', proj.x.toFixed(3),
            '20', proj.y.toFixed(3),
            '30', z.toFixed(3)
          );
        }
        lines.push('0', 'SEQEND');
      }
    }
  }

  // 2. Highways & Waterways with Liang-Barsky clipping (HIGHWAYS, WATERWAYS)
  if (meshData.buildings?.elements && meshData.bbox) {
    const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
    const widthSpan = maxLon - minLon || 1;
    const heightSpan = maxLat - minLat || 1;

    for (const el of meshData.buildings.elements) {
      const isHighway = !!el.tags?.highway && layerVisibility.highways !== false;
      const isWaterway = !!el.tags?.waterway && layerVisibility.waterways !== false;
      if (!isHighway && !isWaterway) continue;
      if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;

      const layerName = isHighway ? 'HIGHWAYS' : 'WATERWAYS';
      const clippedLines = clipWayToBBox(el.geometry, meshData.bbox, 15);

      for (const line of clippedLines) {
        if (line.length < 2) continue;
        lines.push(
          '0', 'POLYLINE',
          '8', layerName,
          '66', '1',
          '70', '8', // 3D open polyline
          '10', '0.0', '20', '0.0', '30', '0.0'
        );
        for (const pt of line) {
          const gx = ((pt.lon - minLon) / widthSpan) * (cols - 1);
          const gy = ((maxLat - pt.lat) / heightSpan) * (rows - 1);
          const z = sampleBilinearElevation(meshData.grid, cols, rows, gx, gy, meshData.minEv);
          const proj = projectCoord(pt.lon, pt.lat, gx, gy);
          lines.push(
            '0', 'VERTEX',
            '8', layerName,
            '70', '32',
            '10', proj.x.toFixed(3),
            '20', proj.y.toFixed(3),
            '30', z.toFixed(3)
          );
        }
        lines.push('0', 'SEQEND');
      }
    }
  }

  // 3. Buildings with OSM relations support & bilinear Z (BUILDINGS)
  if (layerVisibility.buildings !== false && meshData.buildings?.elements && meshData.bbox) {
    const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
    const widthSpan = maxLon - minLon || 1;
    const heightSpan = maxLat - minLat || 1;

    for (const el of meshData.buildings.elements) {
      if (!el.tags?.building) continue;

      const geometries: { lon: number; lat: number }[][] = [];
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
        geometries.push(el.geometry);
      } else if (el.type === 'relation' && Array.isArray(el.members)) {
        for (const m of el.members) {
          if (m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 3) {
            geometries.push(m.geometry);
          }
        }
      }

      for (const geom of geometries) {
        let sumLon = 0;
        let sumLat = 0;
        for (const pt of geom) {
          sumLon += pt.lon;
          sumLat += pt.lat;
        }
        const avgLon = sumLon / geom.length;
        const avgLat = sumLat / geom.length;
        if (avgLon < minLon || avgLon > maxLon || avgLat < minLat || avgLat > maxLat) {
          continue;
        }

        lines.push(
          '0', 'POLYLINE',
          '8', 'BUILDINGS',
          '66', '1',
          '70', '9', // Closed 3D polyline (8 + 1)
          '10', '0.0', '20', '0.0', '30', '0.0'
        );

        for (const pt of geom) {
          const gx = ((pt.lon - minLon) / widthSpan) * (cols - 1);
          const gy = ((maxLat - pt.lat) / heightSpan) * (rows - 1);
          const z = sampleBilinearElevation(meshData.grid, cols, rows, gx, gy, meshData.minEv);
          const proj = projectCoord(pt.lon, pt.lat, gx, gy);
          lines.push(
            '0', 'VERTEX',
            '8', 'BUILDINGS',
            '70', '32',
            '10', proj.x.toFixed(3),
            '20', proj.y.toFixed(3),
            '30', z.toFixed(3)
          );
        }
        lines.push('0', 'SEQEND');
      }
    }
  }

  // 4. Custom Lot Boundary (LOT_BOUNDARY)
  if (customLotPts && customLotPts.length >= 3) {
    lines.push(
      '0', 'POLYLINE',
      '8', 'LOT_BOUNDARY',
      '66', '1',
      '70', '9', // Closed 3D polyline
      '10', '0.0', '20', '0.0', '30', '0.0'
    );
    for (const pt of customLotPts) {
      let x = 0;
      let y = 0;
      if (meshData.bbox) {
        const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
        const lon = minLon + (pt.x / Math.max(1, cols - 1)) * (maxLon - minLon);
        const lat = maxLat - (pt.y / Math.max(1, rows - 1)) * (maxLat - minLat);
        const proj = projectCoord(lon, lat, pt.x, pt.y);
        x = proj.x;
        y = proj.y;
      } else {
        x = (pt.x / Math.max(1, cols - 1)) * meshData.w;
        y = (1.0 - pt.y / Math.max(1, rows - 1)) * meshData.h;
      }
      const z = Number.isFinite(pt.elev)
        ? pt.elev
        : sampleBilinearElevation(meshData.grid, cols, rows, pt.x, pt.y, meshData.minEv);
      lines.push(
        '0', 'VERTEX',
        '8', 'LOT_BOUNDARY',
        '70', '32',
        '10', x.toFixed(3),
        '20', y.toFixed(3),
        '30', z.toFixed(3)
      );
    }
    lines.push('0', 'SEQEND');
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

/**
 * Serializes and triggers browser download of the DXF file.
 */
export function exportToDxf(params: DxfExportParams & { fileName?: string }): void {
  const dxf = generateDxfContent(params);
  const rawName = params.fileName || 'terreno';
  const cleanName = rawName.replace(/\.[^/.]+$/, '');
  const blob = new Blob([dxf], { type: 'application/dxf' });
  triggerBrowserDownload(blob, `isolineas_${cleanName}.dxf`);
}

/**
 * Generates a clean, structured SVG topographic vector sheet with technical metadata,
 * hypsometric isolines, labeled master contours, lot boundaries, and urban context.
 */
export function generateSvgTopographicSheet(params: SvgExportParams): string {
  const {
    meshData,
    fileName = 'terreno',
    crs = 'EPSG:32719',
    interval = 1.0,
    masterIntervalCount = 5,
    showContourLabels = true,
    customLotPts,
    layerVisibility = { buildings: true, highways: true, waterways: true },
  } = params;

  const w = meshData.w || 500;
  const h = meshData.h || 500;
  const cols = meshData.cols || meshData.size || 150;
  const rows = meshData.rows || meshData.size || 150;
  const minEv = meshData.minEv || 0;
  const maxEv = meshData.maxEv || 10;

  // Sanitize filename for XML comment
  const cleanName = fileName.replace(/\.[^/.]+$/, '');
  const escapedFileName = cleanName.replace(/--/g, '__').replace(/[<>&]/g, '');

  const normCols = Math.max(1, cols - 1);
  const normRows = Math.max(1, rows - 1);

  // Compute or reuse D3 contours
  let contours = params.contours || [];
  if (contours.length === 0 && meshData.grid && meshData.grid.length > 0) {
    const thresholds: number[] = [];
    const start = Math.ceil(minEv / interval) * interval;
    for (let v = start; v <= maxEv; v += interval) {
      thresholds.push(v);
      if (thresholds.length >= 180) break;
    }
    if (thresholds.length === 0) thresholds.push(minEv);
    contours = d3.contours().size([cols, rows]).thresholds(thresholds)(meshData.grid);
  }

  const masterStep = interval * masterIntervalCount;

  // 1. Process Contour Lines & Labels
  const contourPathElements: string[] = [];
  const labelElements: string[] = [];

  for (const c of contours) {
    const val = Number(c.value) || 0;
    const isMaster =
      masterStep > 0 && Math.abs(Math.round(val / interval) % masterIntervalCount) === 0;
    const cls = isMaster ? 'contour-major' : 'contour-standard';

    let rawLines: any[] = [];
    if (c.type === 'LineString') {
      rawLines = [c.coordinates];
    } else if (c.type === 'MultiLineString' || c.type === 'Polygon') {
      rawLines = c.coordinates;
    } else if (c.type === 'MultiPolygon') {
      rawLines = c.coordinates.flat(1);
    } else if (Array.isArray(c.coordinates)) {
      if (c.coordinates.length > 0 && typeof c.coordinates[0][0] === 'number') {
        rawLines = [c.coordinates];
      } else {
        rawLines = c.coordinates.flat(1);
      }
    }

    for (const line of rawLines) {
      if (!Array.isArray(line) || line.length < 2) continue;

      let d = '';
      for (let i = 0; i < line.length; i++) {
        const pt = line[i];
        const sx = (pt[0] / normCols) * w;
        const sy = (pt[1] / normRows) * h;
        d += i === 0 ? `M ${sx.toFixed(2)} ${sy.toFixed(2)}` : ` L ${sx.toFixed(2)} ${sy.toFixed(2)}`;
      }
      contourPathElements.push(`    <path class="${cls}" d="${d}" />`);

      if (showContourLabels && isMaster && line.length >= 2) {
        const midIdx = Math.floor(line.length / 2);
        const midPt = line[midIdx];
        const lx = (midPt[0] / normCols) * w;
        const ly = (midPt[1] / normRows) * h;
        labelElements.push(
          `    <text class="contour-label" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}">${val.toFixed(1)}m</text>`
        );
      }
    }
  }

  // 2. Process Urban Context (Highways, Waterways, Buildings)
  const urbanElements: string[] = [];
  if (meshData.buildings?.elements && meshData.bbox) {
    const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
    const widthSpan = maxLon - minLon || 1;
    const heightSpan = maxLat - minLat || 1;

    for (const el of meshData.buildings.elements) {
      const isHw = !!el.tags?.highway && layerVisibility.highways !== false;
      const isWw = !!el.tags?.waterway && layerVisibility.waterways !== false;

      if ((isHw || isWw) && Array.isArray(el.geometry) && el.geometry.length >= 2) {
        const cls = isHw ? 'highway-line' : 'waterway-line';
        const clipped = clipWayToBBox(el.geometry, meshData.bbox, 15);
        for (const line of clipped) {
          if (line.length < 2) continue;
          let d = '';
          for (let i = 0; i < line.length; i++) {
            const pt = line[i];
            const sx = ((pt.lon - minLon) / widthSpan) * w;
            const sy = ((maxLat - pt.lat) / heightSpan) * h;
            d += i === 0 ? `M ${sx.toFixed(2)} ${sy.toFixed(2)}` : ` L ${sx.toFixed(2)} ${sy.toFixed(2)}`;
          }
          urbanElements.push(`    <path class="${cls}" d="${d}" />`);
        }
      }

      // Buildings
      if (layerVisibility.buildings !== false && el.tags?.building) {
        const geometries: { lon: number; lat: number }[][] = [];
        if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 3) {
          geometries.push(el.geometry);
        } else if (el.type === 'relation' && Array.isArray(el.members)) {
          for (const m of el.members) {
            if (m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 3) {
              geometries.push(m.geometry);
            }
          }
        }

        for (const geom of geometries) {
          let sumLon = 0;
          let sumLat = 0;
          for (const pt of geom) {
            sumLon += pt.lon;
            sumLat += pt.lat;
          }
          const avgLon = sumLon / geom.length;
          const avgLat = sumLat / geom.length;
          if (avgLon < minLon || avgLon > maxLon || avgLat < minLat || avgLat > maxLat) continue;

          let ptsStr = '';
          for (const pt of geom) {
            const sx = ((pt.lon - minLon) / widthSpan) * w;
            const sy = ((maxLat - pt.lat) / heightSpan) * h;
            ptsStr += `${sx.toFixed(2)},${sy.toFixed(2)} `;
          }
          urbanElements.push(`    <polygon class="building-footprint" points="${ptsStr.trim()}" />`);
        }
      }
    }
  }

  // 3. Process Lot Boundary
  const lotElements: string[] = [];
  if (customLotPts && customLotPts.length >= 3) {
    let ptsStr = '';
    for (const pt of customLotPts) {
      const sx = (pt.x / normCols) * w;
      const sy = (pt.y / normRows) * h;
      ptsStr += `${sx.toFixed(2)},${sy.toFixed(2)} `;
    }
    lotElements.push(`    <polygon class="lot-boundary" points="${ptsStr.trim()}" />`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  ========================================================================
  GEO·ARC - LÁMINA TOPOGRÁFICA VECTORIAL (.SVG)
  ========================================================================
  Archivo Base: ${escapedFileName}
  Sistema de Referencia (CRS): ${crs}
  Dimensiones Métricas: ${w}m x ${h}m
  Grilla DEM: ${cols} x ${rows}
  Rango Altimétrico: Min ${minEv.toFixed(2)}m | Max ${maxEv.toFixed(2)}m
  Intervalo de Curvas: ${interval}m (Maestras cada ${masterStep}m)
  Fecha de Generación: ${new Date().toISOString()}
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
  <defs>
    <style>
      .contour-standard { stroke: #666666; stroke-width: 0.5px; fill: none; }
      .contour-major { stroke: #c5a059; stroke-width: 1.2px; fill: none; }
      .contour-label { font-family: monospace; font-size: 8px; fill: #c5a059; text-anchor: middle; dominant-baseline: central; }
      .lot-boundary { stroke: #da291c; stroke-width: 2px; stroke-dasharray: 4,4; fill: rgba(218,41,28,0.1); }
      .building-footprint { stroke: #e0e0e0; stroke-width: 1px; fill: #2a2a2a; }
      .highway-line { stroke: #475569; stroke-width: 1.5px; fill: none; }
      .waterway-line { stroke: #0284c7; stroke-width: 1.5px; fill: none; }
    </style>
  </defs>
  <rect width="${w}" height="${h}" fill="#121212" />
  <g id="urban-context">
${urbanElements.join('\n')}
  </g>
  <g id="contour-lines">
${contourPathElements.join('\n')}
  </g>
  <g id="contour-labels">
${labelElements.join('\n')}
  </g>
  <g id="lot-boundary">
${lotElements.join('\n')}
  </g>
</svg>
`;
}

/**
 * Serializes and triggers browser download of the SVG topographic sheet.
 */
export function exportToSvg(params: SvgExportParams & { fileName?: string }): void {
  const svgString = generateSvgTopographicSheet(params);
  const rawName = params.fileName || 'terreno';
  const cleanName = rawName.replace(/\.[^/.]+$/, '');
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  triggerBrowserDownload(blob, `topografia_${cleanName}.svg`);
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

  // Compute or reuse georeferenced Worldfile
  const effectiveWorldFile = worldFile || (meshData.bbox ? generateWorldFileForCrs({
    bbox: meshData.bbox,
    width: meshData.cols || 150,
    height: meshData.rows || 150,
    crsCode: options.crs || 'EPSG:32719',
  }) : undefined);

  const readmeString = [
    `========================================================================`,
    `  GEO·ARC - MODELO 3D DE TERRENO Y CONTEXTO SATELITAL`,
    `========================================================================`,
    ``,
    `Archivos incluidos:`,
    `- ${fileName}.obj          : Malla 3D del relieve y volúmenes de contexto en metros.`,
    `- ${fileName}.mtl          : Definición de materiales con proyección UV.`,
    `- ${textureFileName}    : Ortofoto satelital de alta resolución capturada.`,
    effectiveWorldFile ? `- ${fileName}.jgw          : Archivo de georreferenciación Worldfile para QGIS/AutoCAD.` : '',
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
  if (effectiveWorldFile) {
    zipEntries[`${fileName}.jgw`] = fflate.strToU8(effectiveWorldFile);
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

/**
 * Exports the complete 3D scene as a standalone binary .STL file.
 */
export async function exportToStl(options: Export3DOptions): Promise<void> {
  const { meshData, zExaggeration = 1.0, fileName = 'terreno_geoarc' } = options;
  const cleanName = fileName.replace(/\.[^/.]+$/, '');

  const scene = buildThreeSceneFromMeshData(meshData, {
    zExaggeration,
    includeBuildings: options.includeBuildings !== false,
  });

  const exporter = new STLExporter();
  const result = exporter.parse(scene, { binary: true });

  const dataView = result as any as DataView;
  const blob = new Blob([dataView.buffer], { type: 'application/octet-stream' });
  triggerBrowserDownload(blob, `modelo_${cleanName}.stl`);
}

