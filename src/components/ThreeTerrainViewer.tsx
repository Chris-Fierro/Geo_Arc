import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import type { MeshData } from '../lib/meshProcessor';
import type { AnalysisMode } from '../App';
import { getSunPosition } from '../lib/SunPosition';
import {
  OgucParams,
  computeOgucModel,
  computePolygonAreaM2,
  clipWayToBBox,
} from '../lib/ogucService';
import {
  Sun,
  Layers,
  Box,
  Building2,
  Route,
  Crosshair,
  Compass,
  Ruler,
} from 'lucide-react';

interface ThreeTerrainViewerProps {
  meshData: MeshData;
  satelliteTextureUrl?: string | null;
  zExaggeration?: number;
  interval?: number;
  locationLat?: number;
  locationLon?: number;
  analysisMode?: AnalysisMode;
  ogucParams?: OgucParams;
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
  isDrawingLot?: boolean;
  setIsDrawingLot?: (val: boolean) => void;
  customLotPts?: { x: number; y: number; elev: number }[] | null;
  setCustomLotPts?: (pts: { x: number; y: number; elev: number }[] | null) => void;
}

export default function ThreeTerrainViewer({
  meshData,
  satelliteTextureUrl,
  zExaggeration = 1.0,
  locationLat = -33.4,
  locationLon = -70.5,
  analysisMode = 'topographic',
  ogucParams,
  solarParams,
  layerVisibility = { buildings: true, highways: true, waterways: true },
  isDrawingLot = false,
  setIsDrawingLot,
  customLotPts,
  setCustomLotPts,
}: ThreeTerrainViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const cameraInitializedKeyRef = useRef<string | null>(null);

  // Viewer interactive toggles
  const [useTexture, setUseTexture] = useState<boolean>(true);
  const [showAxes, setShowAxes] = useState<boolean>(true);
  const [showBuildings3D, setShowBuildings3D] = useState<boolean>(true);
  const [showHighways3D, setShowHighways3D] = useState<boolean>(true);
  const [showWaterways3D, setShowWaterways3D] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showHeliodon3D, setShowHeliodon3D] = useState<boolean>(true);
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(null);

  const cols = meshData.cols || meshData.size || 150;
  const rows = meshData.rows || meshData.size || 150;
  const widthM = meshData.w || 500;
  const heightM = meshData.h || 500;
  const minEv = Math.max(0, meshData.minEv || 0);
  const maxEv = Math.max(minEv + 1, meshData.maxEv || 10);

  const getGridElevAt = (x: number, y: number) => {
    const grid = meshData.grid;
    const x0 = Math.max(0, Math.min(cols - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(rows - 1, Math.floor(y)));
    const x1 = Math.min(x0 + 1, cols - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
    const dx = Math.max(0, Math.min(1, x - x0));
    const dy = Math.max(0, Math.min(1, y - y0));

    const v00 = Math.max(minEv, grid[y0 * cols + x0] ?? minEv);
    const v10 = Math.max(minEv, grid[y0 * cols + x1] ?? v00);
    const v01 = Math.max(minEv, grid[y1 * cols + x0] ?? v00);
    const v11 = Math.max(minEv, grid[y1 * cols + x1] ?? v01);

    return (
      v00 * (1 - dx) * (1 - dy) +
      v10 * dx * (1 - dy) +
      v01 * (1 - dx) * dy +
      v11 * dx * dy
    );
  };

  const gridToWorld = (gx: number, gy: number, elev: number, extraYOffset: number = 0) => {
    const wx = (gx / Math.max(1, cols - 1) - 0.5) * widthM;
    const wz = (gy / Math.max(1, rows - 1) - 0.5) * heightM;
    const wy = (elev - minEv) * zExaggeration + extraYOffset;
    return new THREE.Vector3(wx, wy, wz);
  };

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

  // Compute OGUC normative model (shared with SVG viewer)
  const activeOgucParams: OgucParams = useMemo(
    () =>
      ogucParams || {
        regionGroup: 3,
        rasanteStartHeight: 2.5,
        minSetback: 3,
        applyExtraSetback: false,
        maxHeight: 14,
        continuousBaseHeight: 0,
        showShadows: true,
        angle: 51,
      },
    [ogucParams]
  );

  const effectiveLotBasePts = useMemo(() => {
    if (customLotPts && customLotPts.length >= 3) {
      return customLotPts.map((p) => ({ x: p.x, y: p.y }));
    }
    if (isDrawingLot) return null;
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const hw = cols * 0.11;
    const hh = rows * 0.11;
    return [
      { x: cx - hw, y: cy - hh },
      { x: cx + hw, y: cy - hh },
      { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh },
    ];
  }, [customLotPts, isDrawingLot, cols, rows]);

  const ogucModel = useMemo(() => {
    if (!effectiveLotBasePts) return null;
    return computeOgucModel({
      rawLotPts: effectiveLotBasePts,
      ogucParams: activeOgucParams,
      meshData,
      n: cols,
      m: rows,
      getGridElevAt,
    });
  }, [effectiveLotBasePts, activeOgucParams, meshData, cols, rows]);

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

    // 2. Camera setup (initialize immediately at 3D isometric position so it never starts at 0,0,0)
    cameraInitializedKeyRef.current = null;
    const initMaxDim = Math.max(widthM, heightM, 100);
    const initCenterY = ((maxEv - minEv) * 0.4) * zExaggeration;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.25, 30000);
    camera.position.set(
      initMaxDim * 0.8,
      initMaxDim * 0.65 + initCenterY,
      initMaxDim * 0.8
    );
    camera.lookAt(0, initCenterY, 0);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
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
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 1.5;
    controls.maxDistance = 15000;
    controls.target.set(0, initCenterY, 0);
    controls.update();

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

  // Enable/disable OrbitControls left-click rotate when drawing lot in 3D
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enableRotate = !isDrawingLot;
    }
  }, [isDrawingLot]);

  // Update Base Scene Objects (Terrain, OSM Buildings, Roads, Waterways, Axes)
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls || !meshData) return;

    const oldObjects = scene.children.filter(
      (c) =>
        c.name.startsWith('Terrain_') ||
        c.name.startsWith('Building_') ||
        c.name.startsWith('Roads_') ||
        c.name.startsWith('Waterways_') ||
        c.name.startsWith('Helper_Axes')
    );
    for (const obj of oldObjects) {
      scene.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    // 1. Terrain Geometry
    const geom = new THREE.PlaneGeometry(widthM, heightM, cols - 1, rows - 1);
    geom.rotateX(-Math.PI / 2);

    const posAttr = geom.attributes.position;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const vertIdx = r * cols + c;
        const elev = Math.max(minEv, meshData.grid[r * cols + c] ?? minEv);
        const yVal = (elev - minEv) * zExaggeration;
        posAttr.setY(vertIdx, yVal);
      }
    }
    geom.computeVertexNormals();

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
    terrainMeshRef.current = terrainMesh;

    const bbox = meshData.bbox || { minLon: 0, maxLon: 1, minLat: 0, maxLat: 1 };
    const { minLon, maxLon, minLat, maxLat } = bbox;
    const widthSpan = maxLon - minLon || 1;
    const heightSpan = maxLat - minLat || 1;

    const getElevAtM = (lon: number, lat: number) => {
      const u = ((lon - minLon) / widthSpan) * (cols - 1);
      const v = ((maxLat - lat) / heightSpan) * (rows - 1);
      return getGridElevAt(u, v) - minEv;
    };

    // 2. Extruded Context Buildings
    if (
      showBuildings3D &&
      layerVisibility.buildings &&
      meshData.buildings?.elements &&
      meshData.bbox
    ) {
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
        const geometriesToProcess: { lat: number; lon: number }[][] = [];
        if (el.type === 'way' && el.tags?.building && el.geometry?.length >= 3) {
          geometriesToProcess.push(el.geometry);
        } else if (
          el.type === 'relation' &&
          el.tags?.building &&
          Array.isArray(el.members)
        ) {
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
            const pts = [...geomCoords];
            if (pts.length > 3) {
              const first = pts[0];
              const last = pts[pts.length - 1];
              if (
                Math.abs(first.lat - last.lat) < 1e-7 &&
                Math.abs(first.lon - last.lon) < 1e-7
              ) {
                pts.pop();
              }
            }
            if (pts.length < 3) continue;

            // Skip buildings whose centroid falls outside the terrain bounding box
            let sumLon = 0;
            let sumLat = 0;
            for (const pt of pts) {
              sumLon += pt.lon;
              sumLat += pt.lat;
            }
            const avgLon = sumLon / pts.length;
            const avgLat = sumLat / pts.length;
            if (
              avgLon < minLon ||
              avgLon > maxLon ||
              avgLat < minLat ||
              avgLat > maxLat
            ) {
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

            const shapePts = worldCoords.map(
              (c) => new THREE.Vector2(c.wx - avgX, -(c.wz - avgZ))
            );

            if (THREE.ShapeUtils.isClockWise(shapePts)) {
              shapePts.reverse();
            }

            const shape = new THREE.Shape(shapePts);

            const baseEmbed = 0.35;
            const baseLevelM = Math.max(0, minFootprintElev - baseEmbed) * zExaggeration;
            const slopeDelta =
              Math.max(0, maxFootprintElev - minFootprintElev) * zExaggeration;
            const totalDepth =
              height * zExaggeration + slopeDelta + baseEmbed * zExaggeration;

            const extrudeGeom = new THREE.ExtrudeGeometry(shape, {
              depth: totalDepth,
              bevelEnabled: false,
            });

            extrudeGeom.rotateX(-Math.PI / 2);

            const bMesh = new THREE.Mesh(extrudeGeom, buildingMat);
            bMesh.position.set(avgX, baseLevelM, avgZ);
            bMesh.castShadow = true;
            bMesh.receiveShadow = true;

            const edges = new THREE.EdgesGeometry(extrudeGeom);
            const line = new THREE.LineSegments(edges, edgeMat);
            bMesh.add(line);

            buildingsGroup.add(bMesh);
          } catch (_) {}
        }
      }

      scene.add(buildingsGroup);
    }

    // 3. Highways / Road Network (clipped to terrain BBox & subdivided on terrain surface)
    if (
      showHighways3D &&
      layerVisibility.highways &&
      meshData.buildings?.elements &&
      meshData.bbox
    ) {
      const roadMat = new THREE.LineBasicMaterial({
        color: 0x475569,
        linewidth: 1.5,
      });

      const roadsGroup = new THREE.Group();
      roadsGroup.name = 'Roads_Group';

      for (const el of meshData.buildings.elements) {
        if (
          el.type === 'way' &&
          el.tags?.highway &&
          Array.isArray(el.geometry) &&
          el.geometry.length >= 2
        ) {
          const clippedLines = clipWayToBBox(el.geometry, meshData.bbox, 15);
          for (const lineCoords of clippedLines) {
            const pts: THREE.Vector3[] = [];
            for (const pt of lineCoords) {
              const wx = ((pt.lon - minLon) / widthSpan - 0.5) * widthM;
              const wz = ((maxLat - pt.lat) / heightSpan - 0.5) * heightM;
              const wy = getElevAtM(pt.lon, pt.lat) * zExaggeration + 0.18;
              pts.push(new THREE.Vector3(wx, wy, wz));
            }
            if (pts.length >= 2) {
              const geomR = new THREE.BufferGeometry().setFromPoints(pts);
              roadsGroup.add(new THREE.Line(geomR, roadMat));
            }
          }
        }
      }

      if (roadsGroup.children.length > 0) scene.add(roadsGroup);
    }

    // 4. Waterways (clipped to terrain BBox & subdivided on terrain surface)
    if (
      showWaterways3D &&
      layerVisibility.waterways &&
      meshData.buildings?.elements &&
      meshData.bbox
    ) {
      const waterMat = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        linewidth: 2,
      });

      const waterGroup = new THREE.Group();
      waterGroup.name = 'Waterways_Group';

      for (const el of meshData.buildings.elements) {
        if (
          el.type === 'way' &&
          el.tags?.waterway &&
          Array.isArray(el.geometry) &&
          el.geometry.length >= 2
        ) {
          const clippedLines = clipWayToBBox(el.geometry, meshData.bbox, 15);
          for (const lineCoords of clippedLines) {
            const pts: THREE.Vector3[] = [];
            for (const pt of lineCoords) {
              const wx = ((pt.lon - minLon) / widthSpan - 0.5) * widthM;
              const wz = ((maxLat - pt.lat) / heightSpan - 0.5) * heightM;
              const wy = getElevAtM(pt.lon, pt.lat) * zExaggeration + 0.18;
              pts.push(new THREE.Vector3(wx, wy, wz));
            }
            if (pts.length >= 2) {
              const geomW = new THREE.BufferGeometry().setFromPoints(pts);
              waterGroup.add(new THREE.Line(geomW, waterMat));
            }
          }
        }
      }

      if (waterGroup.children.length > 0) scene.add(waterGroup);
    }

    // 5. SketchUp-style Coordinate Axes
    if (showAxes) {
      const axesGroup = new THREE.Group();
      axesGroup.name = 'Helper_Axes';
      const axisLen = Math.max(widthM, heightM) * 0.7;

      const createAxis = (
        dir: THREE.Vector3,
        color: number,
        isDotted: boolean = false
      ) => {
        const mat = isDotted
          ? new THREE.LineDashedMaterial({
              color,
              dashSize: axisLen * 0.02,
              gapSize: axisLen * 0.015,
            })
          : new THREE.LineBasicMaterial({ color, linewidth: 2 });
        const geomA = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          dir.clone().multiplyScalar(axisLen),
        ]);
        const line = new THREE.Line(geomA, mat);
        if (isDotted) line.computeLineDistances();
        return line;
      };

      axesGroup.add(createAxis(new THREE.Vector3(1, 0, 0), 0xdc2626));
      axesGroup.add(createAxis(new THREE.Vector3(-1, 0, 0), 0xdc2626, true));
      axesGroup.add(createAxis(new THREE.Vector3(0, 1, 0), 0x2563eb));
      axesGroup.add(createAxis(new THREE.Vector3(0, -1, 0), 0x2563eb, true));
      axesGroup.add(createAxis(new THREE.Vector3(0, 0, -1), 0x16a34a));
      axesGroup.add(createAxis(new THREE.Vector3(0, 0, 1), 0x16a34a, true));

      axesGroup.position.set(0, 0, 0);
      scene.add(axesGroup);
    }

    // 6. Initialize camera when terrain dimensions or elevation range changes (or if camera was left in a degenerate state)
    const meshKey = `${widthM.toFixed(0)}_${heightM.toFixed(0)}_${minEv.toFixed(1)}_${maxEv.toFixed(1)}`;
    const horizDist = Math.hypot(
      camera.position.x - controls.target.x,
      camera.position.z - controls.target.z
    );
    if (cameraInitializedKeyRef.current !== meshKey || horizDist < 5) {
      cameraInitializedKeyRef.current = meshKey;
      const maxDim = Math.max(widthM, heightM, 100);
      const centerSurfaceY =
        (getGridElevAt((cols - 1) / 2, (rows - 1) / 2) - minEv) * zExaggeration;
      const targetY = Math.max(centerSurfaceY, ((maxEv - minEv) * 0.35) * zExaggeration);
      camera.position.set(maxDim * 0.8, maxDim * 0.65 + targetY, maxDim * 0.8);
      controls.target.set(0, targetY, 0);
      camera.lookAt(0, targetY, 0);
      controls.update();
    }
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

  // Synchronized Layer (Priority 4): Lot Polygon, OGUC Volume & Rasantes, Comparative Shadows, and 3D Heliodon
  useEffect(() => {
    const scene = sceneRef.current;
    const dirLight = dirLightRef.current;
    if (!scene || !meshData) return;

    // Remove previous dynamic overlays
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

    // 1. Update Sunlight Position & Shadow Camera
    const maxDim = Math.max(widthM, heightM);
    const sunRadius = maxDim * 1.3;
    const azRad = (sunPos.azimuth * Math.PI) / 180;
    const elRad = (Math.max(2, sunPos.elevation) * Math.PI) / 180;

    const sunX = sunRadius * Math.sin(azRad) * Math.cos(elRad);
    const sunY = sunRadius * Math.sin(elRad);
    const sunZ = -sunRadius * Math.cos(azRad) * Math.cos(elRad);

    if (dirLight) {
      dirLight.position.set(sunX, sunY, sunZ);
      dirLight.target.position.set(0, 0, 0);
      dirLight.castShadow = solarParams?.showShadows !== false;

      const d = maxDim * 0.9;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.camera.updateProjectionMatrix();
    }

    // 2. Render Lot Polygon (Active in all modes if customLotPts exists, or in OGUC/Solar mode)
    const lotGroup = new THREE.Group();
    lotGroup.name = 'Overlay_Lot';

    const ptsToRender =
      isDrawingLot && customLotPts && customLotPts.length > 0
        ? customLotPts
        : ogucModel?.lotPolygon &&
          (analysisMode === 'oguc' ||
            analysisMode === 'solar' ||
            (customLotPts && customLotPts.length >= 3))
        ? ogucModel.lotPolygon
        : null;

    if (ptsToRender && ptsToRender.length >= 1) {
      const closedPts =
        !isDrawingLot && ptsToRender.length >= 3
          ? [...ptsToRender, ptsToRender[0]]
          : ptsToRender;

      const lotVecs: THREE.Vector3[] = [];
      for (let i = 0; i < closedPts.length - 1; i++) {
        const p1 = closedPts[i];
        const p2 = closedPts[i + 1];
        const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const steps = Math.max(1, Math.ceil(segDist / 1.5));
        for (let s = 0; s <= steps; s++) {
          if (s === steps && i < closedPts.length - 2) continue;
          const t = s / steps;
          const gx = p1.x + (p2.x - p1.x) * t;
          const gy = p1.y + (p2.y - p1.y) * t;
          const gElev = getGridElevAt(gx, gy);
          lotVecs.push(gridToWorld(gx, gy, gElev, 0.5));
        }
      }

      if (lotVecs.length >= 2) {
        const lotGeom = new THREE.BufferGeometry().setFromPoints(lotVecs);
        const lotMat = new THREE.LineBasicMaterial({
          color: 0xec4899,
          linewidth: 3,
        });
        lotGroup.add(new THREE.Line(lotGeom, lotMat));
      }

      // Corner markers
      const markerGeom = new THREE.SphereGeometry(Math.max(0.6, maxDim * 0.004), 12, 12);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xec4899 });
      ptsToRender.forEach((p) => {
        const mMesh = new THREE.Mesh(markerGeom, markerMat);
        mMesh.position.copy(gridToWorld(p.x, p.y, p.elev, 0.4));
        lotGroup.add(mMesh);
      });
    }
    if (lotGroup.children.length > 0) {
      scene.add(lotGroup);
    }

    // 3. Render Proposed OGUC / Solar Volume Tiers, Rasante Planes & Comparative Shadows
    if (
      (analysisMode === 'oguc' || analysisMode === 'solar') &&
      ogucModel &&
      !ogucModel.collapsed
    ) {
      const ogucGroup = new THREE.Group();
      ogucGroup.name = 'Overlay_OGUC';

      // 3a. Volume Tiers (Placa Continua, Cuerpo Base <=10.5m, Cuerpo >10.5m Art. 2.6.12)
      for (const tier of ogucModel.tiers) {
        if (tier.basePts.length < 3) continue;
        let avgX = 0;
        let avgZ = 0;
        let minGroundY = Infinity;

        const worldPts = tier.basePts.map((p, i) => {
          const wBase = gridToWorld(p.x, p.y, p.elev, 0);
          const wRoof = gridToWorld(
            tier.roofPts[i].x,
            tier.roofPts[i].y,
            tier.roofPts[i].elev,
            0
          );
          avgX += wBase.x;
          avgZ += wBase.z;
          if (wBase.y < minGroundY) minGroundY = wBase.y;
          return { bx: wBase.x, by: wBase.y, bz: wBase.z, ry: wRoof.y };
        });

        avgX /= worldPts.length;
        avgZ /= worldPts.length;
        const maxRoofY = Math.max(...worldPts.map((w) => w.ry));
        const depthY = Math.max(0.5, maxRoofY - minGroundY);

        const shapePts = worldPts.map(
          (w) => new THREE.Vector2(w.bx - avgX, -(w.bz - avgZ))
        );
        if (THREE.ShapeUtils.isClockWise(shapePts)) {
          shapePts.reverse();
        }

        const shape = new THREE.Shape(shapePts);
        const extrudeGeom = new THREE.ExtrudeGeometry(shape, {
          depth: depthY,
          bevelEnabled: false,
        });
        extrudeGeom.rotateX(-Math.PI / 2);

        const isUpper = tier.id === 'upper_stepped';
        const isCont = tier.id === 'continuous';

        const volMat = new THREE.MeshStandardMaterial({
          color: isUpper ? 0xfbbf24 : isCont ? 0x64748b : 0xf59e0b,
          roughness: 0.35,
          metalness: 0.1,
          transparent: true,
          opacity: isCont ? 0.65 : 0.88,
        });

        const volMesh = new THREE.Mesh(extrudeGeom, volMat);
        volMesh.position.set(avgX, minGroundY, avgZ);
        volMesh.castShadow = true;
        volMesh.receiveShadow = true;

        const edges = new THREE.EdgesGeometry(extrudeGeom);
        const edgeLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: isUpper ? 0xfef08a : 0x78350f,
            linewidth: 2,
          })
        );
        volMesh.add(edgeLine);
        ogucGroup.add(volMesh);
      }

      // 3b. Inclined Rasante Planes & Comparative Shadows (when in OGUC mode)
      if (analysisMode === 'oguc') {
        for (const plane of ogucModel.rasantePlanes) {
          const v1 = gridToWorld(plane.p1.x, plane.p1.y, plane.p1.elev, 0.2);
          const v2 = gridToWorld(plane.p2.x, plane.p2.y, plane.p2.elev, 0.2);
          const vt2 = gridToWorld(plane.top2.x, plane.top2.y, plane.top2.elev, 0.2);
          const vt1 = gridToWorld(plane.top1.x, plane.top1.y, plane.top1.elev, 0.2);

          const quadGeom = new THREE.BufferGeometry();
          const vertices = new Float32Array([
            v1.x, v1.y, v1.z,
            v2.x, v2.y, v2.z,
            vt2.x, vt2.y, vt2.z,
            v1.x, v1.y, v1.z,
            vt2.x, vt2.y, vt2.z,
            vt1.x, vt1.y, vt1.z,
          ]);
          quadGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
          quadGeom.computeVertexNormals();

          const isSur = plane.orientation === 'Sur';
          const colorHex = isSur ? 0xf97316 : 0x38bdf8;

          const planeMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          ogucGroup.add(new THREE.Mesh(quadGeom, planeMat));

          const borderGeom = new THREE.BufferGeometry().setFromPoints([
            v1,
            v2,
            vt2,
            vt1,
            v1,
          ]);
          const borderLine = new THREE.Line(
            borderGeom,
            new THREE.LineDashedMaterial({
              color: colorHex,
              dashSize: 2,
              gapSize: 1.5,
            })
          );
          borderLine.computeLineDistances();
          ogucGroup.add(borderLine);
        }

        // Comparative Shadow Outlines on 3D Terrain
        if (activeOgucParams.showShadows) {
          // Allowed Theoretical Shadow (Cyan)
          ogucModel.shadows.theoreticalPolygons.forEach((poly) => {
            if (poly.length < 3) return;
            const pts = poly.map((p) => gridToWorld(p.x, p.y, p.elev, 0.25));
            pts.push(pts[0].clone());
            const lGeom = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(
              lGeom,
              new THREE.LineDashedMaterial({
                color: 0x38bdf8,
                dashSize: 2.5,
                gapSize: 1.5,
              })
            );
            line.computeLineDistances();
            ogucGroup.add(line);
          });

          // Proposed Volume Shadow (Rose/Red)
          ogucModel.shadows.proposedPolygons.forEach((poly) => {
            if (poly.length < 3) return;
            const pts = poly.map((p) => gridToWorld(p.x, p.y, p.elev, 0.32));
            pts.push(pts[0].clone());
            const lGeom = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(
              lGeom,
              new THREE.LineBasicMaterial({ color: 0xf43f5e, linewidth: 2 })
            );
            ogucGroup.add(line);
          });
        }
      }

      scene.add(ogucGroup);
    }

    // 4. 3D Heliodon (Bóveda Celeste: Arcos Solares + Horizonte + Sol Activo)
    const shouldRenderHeliodon =
      showHeliodon3D && (solarParams?.showSunPath !== false);

    if (shouldRenderHeliodon) {
      const heliodonGroup = new THREE.Group();
      heliodonGroup.name = 'Overlay_Heliodon';

      const domeRadius = maxDim * 0.62;
      const baseCenterY = 0;

      // Target on the terrain surface (active lot centroid if drawn, else terrain center)
      let rayTarget = new THREE.Vector3(
        0,
        (getGridElevAt((cols - 1) / 2, (rows - 1) / 2) - minEv) * zExaggeration,
        0
      );
      if (ptsToRender && ptsToRender.length >= 3) {
        let sumX = 0;
        let sumY = 0;
        for (const p of ptsToRender) {
          sumX += p.x;
          sumY += p.y;
        }
        const cx = sumX / ptsToRender.length;
        const cy = sumY / ptsToRender.length;
        const cElev = getGridElevAt(cx, cy);
        rayTarget = gridToWorld(cx, cy, cElev, 0.5);
      }

      // Horizon Ring & Elevation Rings (0°, 30°, 60°)
      [0, 30, 60].forEach((elevDeg) => {
        const elR = (elevDeg * Math.PI) / 180;
        const r = domeRadius * Math.cos(elR);
        const y = baseCenterY + domeRadius * Math.sin(elR);
        const ringPts: THREE.Vector3[] = [];
        for (let a = 0; a <= 360; a += 5) {
          const rad = (a * Math.PI) / 180;
          ringPts.push(new THREE.Vector3(r * Math.sin(rad), y, -r * Math.cos(rad)));
        }
        const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPts);
        const ringMat = new THREE.LineDashedMaterial({
          color: 0x94a3b8,
          dashSize: maxDim * 0.015,
          gapSize: maxDim * 0.012,
          transparent: true,
          opacity: elevDeg === 0 ? 0.55 : 0.25,
        });
        const ringLine = new THREE.Line(ringGeom, ringMat);
        ringLine.computeLineDistances();
        heliodonGroup.add(ringLine);
      });

      // North-South & East-West Base Compass Cross on the Horizon Plane
      const nsLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, baseCenterY, -domeRadius * 1.04),
        new THREE.Vector3(0, baseCenterY, domeRadius * 1.04),
      ]);
      const ewLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-domeRadius * 1.04, baseCenterY, 0),
        new THREE.Vector3(domeRadius * 1.04, baseCenterY, 0),
      ]);
      const compassMat = new THREE.LineDashedMaterial({
        color: 0x64748b,
        dashSize: maxDim * 0.012,
        gapSize: maxDim * 0.012,
        transparent: true,
        opacity: 0.35,
      });
      const nsLine = new THREE.Line(nsLineGeom, compassMat);
      nsLine.computeLineDistances();
      const ewLine = new THREE.Line(ewLineGeom, compassMat);
      ewLine.computeLineDistances();
      heliodonGroup.add(nsLine, ewLine);

      // Seasonal Solar Arcs (Summer Solstice, Equinox, Winter Solstice)
      const seasonalDates = [
        { date: new Date('2024-12-21T12:00:00'), color: 0xf87171 }, // Verano
        { date: new Date('2024-03-21T12:00:00'), color: 0xfbbf24 }, // Equinoccio
        { date: new Date('2024-06-21T12:00:00'), color: 0x60a5fa }, // Invierno
      ];

      seasonalDates.forEach((sd) => {
        const arcPts: THREE.Vector3[] = [];
        for (let h = 5; h <= 21; h += 0.25) {
          const pos = getSunPosition(locationLat, locationLon, sd.date, h);
          if (pos.elevation >= 0) {
            const elR = (pos.elevation * Math.PI) / 180;
            const azR = (pos.azimuth * Math.PI) / 180;
            const sx = domeRadius * Math.sin(azR) * Math.cos(elR);
            const sy = baseCenterY + domeRadius * Math.sin(elR);
            const sz = -domeRadius * Math.cos(azR) * Math.cos(elR);
            arcPts.push(new THREE.Vector3(sx, sy, sz));
          }
        }
        if (arcPts.length >= 2) {
          const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
          const arcMat = new THREE.LineBasicMaterial({
            color: sd.color,
            linewidth: 2,
            transparent: true,
            opacity: 0.85,
          });
          heliodonGroup.add(new THREE.Line(arcGeom, arcMat));
        }
      });

      // Active Sun Orb & Ray on the Heliodon Dome
      if (sunPos.elevation > 0) {
        const domeSunX = domeRadius * Math.sin(azRad) * Math.cos(elRad);
        const domeSunY = baseCenterY + domeRadius * Math.sin(elRad);
        const domeSunZ = -domeRadius * Math.cos(azRad) * Math.cos(elRad);

        const sunSphereGeom = new THREE.SphereGeometry(maxDim * 0.018, 20, 20);
        const sunSphereMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
        const sunOrb = new THREE.Mesh(sunSphereGeom, sunSphereMat);
        sunOrb.position.set(domeSunX, domeSunY, domeSunZ);
        heliodonGroup.add(sunOrb);

        const haloGeom = new THREE.SphereGeometry(maxDim * 0.032, 16, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.3,
        });
        const sunHalo = new THREE.Mesh(haloGeom, haloMat);
        sunHalo.position.set(domeSunX, domeSunY, domeSunZ);
        heliodonGroup.add(sunHalo);

        const rayPts = [
          rayTarget,
          new THREE.Vector3(domeSunX, domeSunY, domeSunZ),
        ];
        const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPts);
        const rayMat = new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 2,
        });
        heliodonGroup.add(new THREE.Line(rayGeom, rayMat));
      }

      scene.add(heliodonGroup);
    }
  }, [
    sunPos,
    meshData,
    zExaggeration,
    analysisMode,
    ogucModel,
    activeOgucParams.showShadows,
    customLotPts,
    isDrawingLot,
    showHeliodon3D,
    solarParams?.showSunPath,
    solarParams?.showShadows,
    locationLat,
    locationLon,
  ]);

  // Interactive 3D Lot Drawing on Terrain via Raycasting
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawingLot || e.button !== 0) return;
    const container = containerRef.current;
    const camera = cameraRef.current;
    const terrainMesh = terrainMeshRef.current;
    if (!container || !camera || !terrainMesh) return;

    if (e.detail >= 2 && customLotPts && customLotPts.length >= 3) {
      if (setIsDrawingLot) setIsDrawingLot(false);
      return;
    }

    const rect = container.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObject(terrainMesh, false);
    if (hits.length === 0) return;

    const hitPt = hits[0].point;
    const gx = Math.max(0, Math.min(cols - 1, (hitPt.x / widthM + 0.5) * (cols - 1)));
    const gy = Math.max(0, Math.min(rows - 1, (hitPt.z / heightM + 0.5) * (rows - 1)));
    const elev = getGridElevAt(gx, gy);

    if (customLotPts && customLotPts.length >= 3) {
      const first = customLotPts[0];
      const firstWorld = gridToWorld(first.x, first.y, first.elev, 0.4).project(camera);
      const firstScreenX = ((firstWorld.x + 1) * 0.5) * rect.width + rect.left;
      const firstScreenY = ((-firstWorld.y + 1) * 0.5) * rect.height + rect.top;
      const distPx = Math.hypot(e.clientX - firstScreenX, e.clientY - firstScreenY);
      if (distPx <= 10) {
        if (setIsDrawingLot) setIsDrawingLot(false);
        return;
      }
    }

    const nextPts = customLotPts ? [...customLotPts] : [];
    nextPts.push({ x: gx, y: gy, elev });
    if (setCustomLotPts) setCustomLotPts(nextPts);
  };

  const resetCamera = (type: 'iso' | 'top' | 'front' | 'lot') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !meshData) return;

    const maxDim = Math.max(widthM, heightM);
    const centerY = ((maxEv - minEv) / 2) * zExaggeration;

    if (type === 'lot') {
      const lotPts =
        ogucModel?.lotPolygon ||
        (customLotPts && customLotPts.length >= 3 ? customLotPts : null) ||
        effectiveLotBasePts;
      if (lotPts && lotPts.length >= 3) {
        let minX = Infinity,
          maxX = -Infinity,
          minZ = Infinity,
          maxZ = -Infinity,
          sumX = 0,
          sumZ = 0,
          sumY = 0;
        for (const p of lotPts) {
          const elev = (p as any).elev ?? getGridElevAt(p.x, p.y);
          const w = gridToWorld(p.x, p.y, elev, 0);
          sumX += w.x;
          sumZ += w.z;
          sumY += w.y;
          if (w.x < minX) minX = w.x;
          if (w.x > maxX) maxX = w.x;
          if (w.z < minZ) minZ = w.z;
          if (w.z > maxZ) maxZ = w.z;
        }
        const cx = sumX / lotPts.length;
        const cz = sumZ / lotPts.length;
        const cy = sumY / lotPts.length;
        const lotSpan = Math.max(25, Math.hypot(maxX - minX, maxZ - minZ));
        camera.position.set(cx + lotSpan * 1.15, cy + lotSpan * 0.95, cz + lotSpan * 1.15);
        controls.target.set(cx, cy, cz);
        camera.lookAt(cx, cy, cz);
        controls.update();
        return;
      }
    }

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
      <div
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        className={`w-full h-full flex-1 ${
          isDrawingLot ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      />

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
            onClick={() => setShowHeliodon3D(!showHeliodon3D)}
            className={`px-2 py-1.5 rounded-sm text-[9px] uppercase tracking-wider font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              showHeliodon3D
                ? 'bg-bg-surface text-accent border border-accent/30'
                : 'text-text-subtle hover:text-text-main'
            }`}
            title="Mostrar / Ocultar Bóveda Solar Heliodon 3D"
          >
            <Compass size={13} />
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
            onClick={() => resetCamera('lot')}
            className="px-2 py-1 bg-accent/15 text-accent hover:bg-accent hover:text-white rounded-xs cursor-pointer uppercase tracking-wider font-bold transition-colors"
            title="Enfocar cámara sobre el Lote / Predio activo"
          >
            Lote
          </button>
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

      {/* Floating Solar, OGUC & Elevation HUD (Bottom-Left) */}
      <div className="absolute bottom-4 left-4 z-20 bg-bg-surface/90 backdrop-blur-md border border-border-main p-3 rounded-sm shadow-xl font-mono text-[10px] space-y-1.5 max-w-xs">
        <div className="flex items-center justify-between border-b border-border-faded pb-1 gap-4">
          <span className="text-accent uppercase tracking-widest font-bold flex items-center gap-1.5">
            <Sun size={12} /> Sol y Relieve 3D
          </span>
          <span className="text-text-subtle">
            Alt: {sunPos.elevation.toFixed(1)}° | Az: {sunPos.azimuth.toFixed(0)}°
          </span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Relieve (Z):</span>
          <span className="text-text-main font-bold">
            {minEv.toFixed(1)}m — {maxEv.toFixed(1)}m (Δ{(maxEv - minEv).toFixed(1)}m)
          </span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Escala 3D:</span>
          <span>
            {Math.round(widthM)}m × {Math.round(heightM)}m ({zExaggeration}x Z)
          </span>
        </div>

        {analysisMode === 'oguc' && ogucModel && !ogucModel.collapsed && (
          <div className="pt-1.5 border-t border-border-faded space-y-1">
            <div className="flex justify-between items-center text-[9px]">
              <span className="text-[#ec4899] font-bold flex items-center gap-1">
                <Ruler size={10} /> Lote / Vol. OGUC:
              </span>
              <span className="text-text-main font-bold">
                {Math.round(ogucModel.lotAreaM2)} m² | h={ogucModel.effectiveHeight.toFixed(1)}m
              </span>
            </div>
            <div className="flex justify-between items-center text-[9px]">
              <span className="text-[#38bdf8]">Sombra Perm. / Prop.:</span>
              <span className="font-bold">
                <span className="text-[#38bdf8]">
                  {Math.round(ogucModel.shadows.allowedAreaM2)}m²
                </span>{' '}
                /{' '}
                <span className="text-[#f43f5e]">
                  {Math.round(ogucModel.shadows.proposedAreaM2)}m²
                </span>
              </span>
            </div>
          </div>
        )}

        {loadedTexture && (
          <div className="text-[9px] text-accent/80 pt-1 border-t border-border-faded">
            ✓ Ortofoto Satelital + Heliodon 3D sincronizados
          </div>
        )}
      </div>

      {/* Instruction Overlay Pill */}
      <div className="absolute bottom-4 right-4 z-20 text-[9px] font-mono text-text-subtle bg-bg-surface/80 backdrop-blur-xs px-2.5 py-1 rounded-sm border border-border-faded">
        {isDrawingLot
          ? 'Modo Dibujo 3D: Click sobre terreno para trazar lote | Doble click para cerrar'
          : 'Girar: Click Izq. | Desplazar: Click Der. | Zoom: Rueda'}
      </div>
    </div>
  );
}
