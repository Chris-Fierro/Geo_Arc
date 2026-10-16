import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import type { MeshData } from '../lib/meshProcessor';
import { getSunPosition } from '../lib/SunPosition';
import { 
  Maximize2, 
  RotateCcw, 
  Sun, 
  Layers, 
  Eye, 
  Compass, 
  Box, 
  Building2, 
  Route, 
  Crosshair 
} from 'lucide-react';

interface ThreeTerrainViewerProps {
  meshData: MeshData;
  satelliteTextureUrl?: string | null;
  zExaggeration?: number;
  interval?: number;
  locationLat?: number;
  locationLon?: number;
  solarParams?: {
    date: Date;
    time: number;
    showSunPath?: boolean;
    showShadows?: boolean;
  };
  layerVisibility?: {
    buildings?: boolean;
    highways?: boolean;
    waterways?: boolean;
  };
}

export default function ThreeTerrainViewer({
  meshData,
  satelliteTextureUrl,
  zExaggeration = 1.0,
  interval = 1.0,
  locationLat = -33.4,
  locationLon = -70.5,
  solarParams,
  layerVisibility = { buildings: true, highways: true, waterways: true },
}: ThreeTerrainViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunRayRef = useRef<THREE.Line | null>(null);

  // Viewer interactive toggles
  const [useTexture, setUseTexture] = useState<boolean>(true);
  const [showAxes, setShowAxes] = useState<boolean>(true);
  const [showBuildings3D, setShowBuildings3D] = useState<boolean>(true);
  const [showHighways3D, setShowHighways3D] = useState<boolean>(true);
  const [showWaterways3D, setShowWaterways3D] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(null);

  // Load satellite texture when URL is available
  useEffect(() => {
    if (!satelliteTextureUrl) {
      setLoadedTexture(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.load(
      satelliteTextureUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        setLoadedTexture(tex);
      },
      undefined,
      (err) => {
        console.warn('Error al cargar textura satelital ThreeJS:', err);
      }
    );
  }, [satelliteTextureUrl]);

  // Sun calculation
  const sunPos = useMemo(() => {
    const date = solarParams?.date ? new Date(solarParams.date) : new Date();
    const time = solarParams?.time ?? 12;
    return getSunPosition(locationLat, locationLon, date, time);
  }, [locationLat, locationLon, solarParams?.date, solarParams?.time]);

  // Main Scene Initialization and Render Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x1a1c1e);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 30000);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.replaceChildren(renderer.domElement);

    // 4. Orbit Controls (SketchUp / CAD feel: Rotate, Pan, Zoom)
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground horizon
    controls.minDistance = 10;
    controls.maxDistance = 15000;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.4);
    hemiLight.position.set(0, 500, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 10000;
    dirLight.shadow.bias = -0.0003;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  // Update Scene Objects when meshData, textures, or settings change
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls || !meshData) return;

    // Remove old terrain, buildings, roads, waterways, helpers
    const oldObjects = scene.children.filter(
      (c) =>
        c.name.startsWith('Terrain_') ||
        c.name.startsWith('Building_') ||
        c.name.startsWith('Roads_') ||
        c.name.startsWith('Waterways_') ||
        c.name.startsWith('Helper_')
    );
    for (const obj of oldObjects) {
      scene.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    const cols = meshData.cols || meshData.size || 150;
    const rows = meshData.rows || meshData.size || 150;
    const widthM = meshData.w || 500;
    const heightM = meshData.h || 500;
    const minEv = meshData.minEv || 0;
    const maxEv = meshData.maxEv || 10;

    // 1. Terrain Geometry
    const geom = new THREE.PlaneGeometry(widthM, heightM, cols - 1, rows - 1);
    geom.rotateX(-Math.PI / 2); // Horizontal XZ plane, +Y is UP

    const posAttr = geom.attributes.position;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const vertIdx = r * cols + c;
        const elev = meshData.grid[r * cols + c] ?? minEv;
        const yVal = (elev - minEv) * zExaggeration;
        posAttr.setY(vertIdx, yVal);
      }
    }
    geom.computeVertexNormals();

    // Terrain Material (Satellite vs Shaded Technical)
    let terrainMat: THREE.Material;
    if (useTexture && loadedTexture) {
      terrainMat = new THREE.MeshStandardMaterial({
        map: loadedTexture,
        roughness: 0.82,
        metalness: 0.04,
        wireframe: showWireframe,
        side: THREE.DoubleSide,
      });
    } else {
      terrainMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.85,
        wireframe: showWireframe,
        side: THREE.DoubleSide,
      });
    }

    const terrainMesh = new THREE.Mesh(geom, terrainMat);
    terrainMesh.name = 'Terrain_Mesh';
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Bilinear Elevation Sampler for smooth vertex elevation matching the terrain surface
    const bbox = meshData.bbox || { minLon: 0, maxLon: 1, minLat: 0, maxLat: 1 };
    const { minLon, maxLon, minLat, maxLat } = bbox;
    const widthSpan = maxLon - minLon || 1;
    const heightSpan = maxLat - minLat || 1;

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

    // 2. Extruded Context Buildings (White Architectural Massing with Edges)
    if (showBuildings3D && layerVisibility.buildings && meshData.buildings?.elements && meshData.bbox) {
      const buildingMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.25,
        metalness: 0.05,
      });

      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x222222,
        linewidth: 1.5,
      });

      const buildingsGroup = new THREE.Group();
      buildingsGroup.name = 'Building_Group';

      for (const el of meshData.buildings.elements) {
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

            // Architectural outline edges
            const edges = new THREE.EdgesGeometry(extrudeGeom);
            const line = new THREE.LineSegments(edges, edgeMat);
            bMesh.add(line);

            buildingsGroup.add(bMesh);
          } catch (_) {}
        }
      }

      scene.add(buildingsGroup);
    }

    // 3. Highways / Road Network (Linework draped over 3D terrain)
    if (showHighways3D && layerVisibility.highways && meshData.buildings?.elements && meshData.bbox) {
      const roadMat = new THREE.LineBasicMaterial({
        color: 0x475569, // Slate gray
        linewidth: 1.5,
      });

      const roadsGroup = new THREE.Group();
      roadsGroup.name = 'Roads_Group';

      for (const el of meshData.buildings.elements) {
        if (el.type === 'way' && el.tags?.highway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
          const pts: THREE.Vector3[] = [];
          for (const pt of el.geometry) {
            const wx = ((pt.lon - minLon) / widthSpan - 0.5) * widthM;
            const wz = ((maxLat - pt.lat) / heightSpan - 0.5) * heightM;
            const wy = getElevAtM(pt.lon, pt.lat) * zExaggeration + 0.15;
            pts.push(new THREE.Vector3(wx, wy, wz));
          }
          const geomR = new THREE.BufferGeometry().setFromPoints(pts);
          roadsGroup.add(new THREE.Line(geomR, roadMat));
        }
      }

      if (roadsGroup.children.length > 0) scene.add(roadsGroup);
    }

    // 4. Waterways (Rivers, streams, canals)
    if (showWaterways3D && layerVisibility.waterways && meshData.buildings?.elements && meshData.bbox) {
      const waterMat = new THREE.LineBasicMaterial({
        color: 0x0284c7, // Vibrant blue
        linewidth: 2,
      });

      const waterGroup = new THREE.Group();
      waterGroup.name = 'Waterways_Group';

      for (const el of meshData.buildings.elements) {
        if (el.type === 'way' && el.tags?.waterway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
          const pts: THREE.Vector3[] = [];
          for (const pt of el.geometry) {
            const wx = ((pt.lon - minLon) / widthSpan - 0.5) * widthM;
            const wz = ((maxLat - pt.lat) / heightSpan - 0.5) * heightM;
            const wy = getElevAtM(pt.lon, pt.lat) * zExaggeration + 0.15;
            pts.push(new THREE.Vector3(wx, wy, wz));
          }
          const geomW = new THREE.BufferGeometry().setFromPoints(pts);
          waterGroup.add(new THREE.Line(geomW, waterMat));
        }
      }

      if (waterGroup.children.length > 0) scene.add(waterGroup);
    }

    // 5. SketchUp-style Coordinate Axes (Red = X, Green = Z-up in SketchUp, Blue = Y)
    if (showAxes) {
      const axesGroup = new THREE.Group();
      axesGroup.name = 'Helper_Axes';
      const axisLen = Math.max(widthM, heightM) * 0.7;

      // Solid Axes + Dotted negative extensions
      const createAxis = (dir: THREE.Vector3, color: number, isDotted: boolean = false) => {
        const mat = isDotted
          ? new THREE.LineDashedMaterial({ color, dashSize: axisLen * 0.02, gapSize: axisLen * 0.015 })
          : new THREE.LineBasicMaterial({ color, linewidth: 2 });
        const geomA = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          dir.clone().multiplyScalar(axisLen),
        ]);
        const line = new THREE.Line(geomA, mat);
        if (isDotted) line.computeLineDistances();
        return line;
      };

      // X: Red (East)
      axesGroup.add(createAxis(new THREE.Vector3(1, 0, 0), 0xdc2626));
      axesGroup.add(createAxis(new THREE.Vector3(-1, 0, 0), 0xdc2626, true));

      // Y (Up in ThreeJS, Blue in Sketchup Z-up): Blue
      axesGroup.add(createAxis(new THREE.Vector3(0, 1, 0), 0x2563eb));
      axesGroup.add(createAxis(new THREE.Vector3(0, -1, 0), 0x2563eb, true));

      // Z (North in ThreeJS, Green in Sketchup): Green
      axesGroup.add(createAxis(new THREE.Vector3(0, 0, -1), 0x16a34a));
      axesGroup.add(createAxis(new THREE.Vector3(0, 0, 1), 0x16a34a, true));

      axesGroup.position.set(0, 0, 0);
      scene.add(axesGroup);
    }

    // 6. Position Camera for a beautiful initial Isometric / Bird's Eye View
    const maxDim = Math.max(widthM, heightM);
    camera.position.set(maxDim * 0.85, maxDim * 0.75, maxDim * 0.85);
    camera.lookAt(0, ((maxEv - minEv) / 2) * zExaggeration, 0);
    controls.target.set(0, ((maxEv - minEv) / 2) * zExaggeration, 0);
    controls.update();
  }, [
    meshData,
    loadedTexture,
    useTexture,
    showWireframe,
    showBuildings3D,
    showHighways3D,
    showWaterways3D,
    showAxes,
    zExaggeration,
    layerVisibility.buildings,
    layerVisibility.highways,
    layerVisibility.waterways,
  ]);

  // Update Sunlight Position and Shadow Projection
  useEffect(() => {
    const dirLight = dirLightRef.current;
    const scene = sceneRef.current;
    if (!dirLight || !scene || !meshData) return;

    // Remove existing sun ray
    const oldSunRay = scene.getObjectByName('Helper_SunRay');
    if (oldSunRay) scene.remove(oldSunRay);

    const maxDim = Math.max(meshData.w || 500, meshData.h || 500);
    const radius = maxDim * 1.5;

    // Sun altitude and azimuth to Cartesian coordinates
    const azRad = (sunPos.azimuth * Math.PI) / 180;
    const elRad = (Math.max(2, sunPos.elevation) * Math.PI) / 180;

    const sunX = radius * Math.sin(azRad) * Math.cos(elRad);
    const sunY = radius * Math.sin(elRad);
    const sunZ = -radius * Math.cos(azRad) * Math.cos(elRad);

    dirLight.position.set(sunX, sunY, sunZ);
    dirLight.target.position.set(0, 0, 0);

    // Update shadow camera bounds to encapsulate terrain
    const d = maxDim * 0.9;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.updateProjectionMatrix();

    // Orange Sun Vector Ray (as seen in the reference screenshot)
    if (sunPos.elevation > 0) {
      const rayLen = maxDim * 0.9;
      const rayDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();
      const rayPts = [
        new THREE.Vector3(0, ((meshData.maxEv - meshData.minEv) / 2) * zExaggeration, 0),
        new THREE.Vector3(0, ((meshData.maxEv - meshData.minEv) / 2) * zExaggeration, 0).add(
          rayDir.clone().multiplyScalar(rayLen)
        ),
      ];
      const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPts);
      const rayMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
      const sunRay = new THREE.Line(rayGeom, rayMat);
      sunRay.name = 'Helper_SunRay';
      scene.add(sunRay);
      sunRayRef.current = sunRay;
    }
  }, [sunPos, meshData, zExaggeration]);

  const resetCamera = (type: 'iso' | 'top' | 'front') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !meshData) return;

    const maxDim = Math.max(meshData.w || 500, meshData.h || 500);
    const centerY = ((meshData.maxEv - meshData.minEv) / 2) * zExaggeration;

    if (type === 'iso') {
      camera.position.set(maxDim * 0.85, maxDim * 0.75, maxDim * 0.85);
    } else if (type === 'top') {
      camera.position.set(0, maxDim * 1.6, 0.001);
    } else if (type === 'front') {
      camera.position.set(0, centerY + maxDim * 0.2, maxDim * 1.3);
    }

    controls.target.set(0, centerY, 0);
    controls.update();
  };

  return (
    <div className="relative w-full h-full min-h-0 flex flex-col bg-bg-elevated overflow-hidden select-none">
      {/* 3D WebGL Canvas */}
      <div ref={containerRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Floating Toolbar (Top-Right) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <div className="flex bg-bg-surface/90 backdrop-blur-md border border-border-main p-1 rounded-sm shadow-xl gap-1">
          <button
            onClick={() => setUseTexture(!useTexture)}
            className={`px-2.5 py-1.5 rounded-sm text-[9px] uppercase tracking-wider font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              useTexture && loadedTexture
                ? 'bg-accent text-white shadow-sm'
                : 'text-text-faded hover:text-text-main bg-bg-elevated'
            }`}
            title="Alternar textura satelital / sombreado analítico"
          >
            <Layers size={13} />
            <span>{useTexture && loadedTexture ? 'Satelital' : 'Sombreado'}</span>
          </button>

          <button
            onClick={() => setShowBuildings3D(!showBuildings3D)}
            className={`px-2 py-1.5 rounded-sm text-[9px] uppercase tracking-wider font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              showBuildings3D
                ? 'bg-bg-surface text-accent border border-accent/30'
                : 'text-text-subtle hover:text-text-main'
            }`}
            title="Mostrar / Ocultar Edificios 3D"
          >
            <Building2 size={13} />
          </button>

          <button
            onClick={() => setShowHighways3D(!showHighways3D)}
            className={`px-2 py-1.5 rounded-sm text-[9px] uppercase tracking-wider font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              showHighways3D
                ? 'bg-bg-surface text-accent border border-accent/30'
                : 'text-text-subtle hover:text-text-main'
            }`}
            title="Mostrar / Ocultar Vialidad y Calles (OSM)"
          >
            <Route size={13} />
          </button>

          <button
            onClick={() => setShowAxes(!showAxes)}
            className={`px-2 py-1.5 rounded-sm text-[9px] uppercase tracking-wider font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              showAxes
                ? 'bg-bg-surface text-accent border border-accent/30'
                : 'text-text-subtle hover:text-text-main'
            }`}
            title="Mostrar / Ocultar Ejes CAD (Estilo SketchUp)"
          >
            <Crosshair size={13} />
          </button>

          <button
            onClick={() => setShowWireframe(!showWireframe)}
            className={`px-2 py-1.5 rounded-sm text-[9px] uppercase tracking-wider font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              showWireframe
                ? 'bg-bg-surface text-accent border border-accent/30'
                : 'text-text-subtle hover:text-text-main'
            }`}
            title="Alternar Malla de Alambre (Wireframe)"
          >
            <Box size={13} />
          </button>
        </div>

        {/* Camera Views Preset Pills */}
        <div className="flex bg-bg-surface/90 backdrop-blur-md border border-border-main p-1 rounded-sm shadow-xl gap-1 justify-end font-mono text-[9px]">
          <button
            onClick={() => resetCamera('iso')}
            className="px-2 py-1 bg-bg-elevated text-text-faded hover:text-text-main rounded-xs cursor-pointer uppercase tracking-wider"
            title="Vista Isométrica 3D"
          >
            Iso
          </button>
          <button
            onClick={() => resetCamera('top')}
            className="px-2 py-1 bg-bg-elevated text-text-faded hover:text-text-main rounded-xs cursor-pointer uppercase tracking-wider"
            title="Vista Cenital (Planta)"
          >
            Planta
          </button>
          <button
            onClick={() => resetCamera('front')}
            className="px-2 py-1 bg-bg-elevated text-text-faded hover:text-text-main rounded-xs cursor-pointer uppercase tracking-wider"
            title="Vista Frontal (Elevación)"
          >
            Frente
          </button>
        </div>
      </div>

      {/* Floating Solar & Elevation HUD (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 z-20 bg-bg-surface/90 backdrop-blur-md border border-border-main p-3 rounded-sm shadow-xl font-mono text-[10px] space-y-1.5 max-w-xs">
        <div className="flex items-center justify-between border-b border-border-faded pb-1">
          <span className="text-accent uppercase tracking-widest font-bold flex items-center gap-1.5">
            <Sun size={12} /> Sol y Asombro
          </span>
          <span className="text-text-subtle">
            Alt: {sunPos.elevation.toFixed(1)}° | Az: {sunPos.azimuth.toFixed(0)}°
          </span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Relieve (Z):</span>
          <span className="text-text-main font-bold">
            {meshData.minEv.toFixed(1)}m — {meshData.maxEv.toFixed(1)}m (Δ{(meshData.maxEv - meshData.minEv).toFixed(1)}m)
          </span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Escala 3D:</span>
          <span>
            {Math.round(meshData.w)}m × {Math.round(meshData.h)}m ({zExaggeration}x Z)
          </span>
        </div>
        {loadedTexture && (
          <div className="text-[9px] text-accent/80 pt-1 border-t border-border-faded">
            ✓ Ortofoto Satelital proyectada en malla 3D
          </div>
        )}
      </div>

      {/* Instruction Overlay Pill */}
      <div className="absolute bottom-4 right-4 z-20 text-[9px] font-mono text-text-subtle bg-bg-surface/80 backdrop-blur-xs px-2.5 py-1 rounded-sm border border-border-faded">
        Girar: Click Izq. | Desplazar: Click Der. | Zoom: Rueda
      </div>
    </div>
  );
}
