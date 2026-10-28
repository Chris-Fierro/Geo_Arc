import React, { useMemo, useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Map, Layers, ZoomIn, ZoomOut, Maximize, RotateCw, Download } from 'lucide-react';
import { MeshData } from '../lib/meshProcessor';
import { AnalysisMode } from '../App';
import { getSunPosition } from '../lib/SunPosition';
import {
  OgucParams,
  computeOgucModel,
  computePolygonAreaM2,
  convexHull3D,
  clipWayToBBox,
} from '../lib/ogucService';

interface ContourViewerProps {
  interval: number;
  fileName: string;
  meshData?: MeshData;
  zExaggeration?: number;
  colorPalette?: 'termico' | 'tecnico' | 'hipso';
  minVisibleElev?: number;
  maxVisibleElev?: number;
  masterIntervalCount?: number;
  showContourLabels?: boolean;
  analysisMode?: AnalysisMode;
  locationLat?: number;
  locationLon?: number;
  ogucParams?: OgucParams;
  solarParams?: {
    date: Date;
    time: number;
    showSunPath: boolean;
    showShadows: boolean;
  };
  layerVisibility?: {
    buildings: boolean;
    highways: boolean;
    waterways: boolean;
  };
  isDrawingLot?: boolean;
  setIsDrawingLot?: (val: boolean) => void;
  customLotPts?: {x: number, y: number, elev: number}[] | null;
  setCustomLotPts?: (pts: {x: number, y: number, elev: number}[] | null) => void;
}

export default function ContourViewer({
  interval, fileName, meshData, zExaggeration = 1.0,
  colorPalette = 'tecnico', minVisibleElev, maxVisibleElev, masterIntervalCount = 5,
  showContourLabels = true,
  analysisMode = 'topographic', locationLat = -38.7359, locationLon = -72.5904,
  ogucParams, solarParams, layerVisibility = { buildings: true, highways: true, waterways: true },
  isDrawingLot = false, setIsDrawingLot, customLotPts, setCustomLotPts
}: ContourViewerProps) {
  const [viewMode, setViewMode] = useState<'plan' | 'perspective'>('plan');
  const isPerspective = viewMode === 'perspective';

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomGroupRef = useRef<SVGGElement>(null);
  const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [rotation, setRotation] = useState({ x: 60, z: 45 });
  const [drawingCursor, setDrawingCursor] = useState<{x: number, y: number} | null>(null);
  const [isAutoOrbit, setIsAutoOrbit] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [zoomK, setZoomK] = useState(1);
  const [showSatelliteInPlan, setShowSatelliteInPlan] = useState<boolean>(true);
  const [satelliteOpacity, setSatelliteOpacity] = useState<number>(0.85);

  // Estados para el arrastre del volumen (Etapa 1)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingVolumeRef = useRef(false);
  const dragStartRef = useRef({ cx: 0, cy: 0, ox: 0, oy: 0 });

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    if (isAutoOrbit && isPerspective) {
      const animate = (time: number) => {
        const delta = time - lastTime;
        lastTime = time;
        // Rota ~20 grados por segundo visualmente en Z
        setRotation(prev => ({ ...prev, z: prev.z + (20 / 1000) * delta }));
        animationFrameId = requestAnimationFrame(animate);
      };
      animationFrameId = requestAnimationFrame(animate);
    }
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isAutoOrbit, isPerspective]);

  const disableTransition = isAutoOrbit || isDraggingSlider;

  // Utiliza el tamaño dinámico del grid si existe, si no usa 150
  const n = meshData?.cols || meshData?.size || 150;
  const m = meshData?.rows || meshData?.size || 150;

  const contours = useMemo(() => {
    let values: number[];
    let thresholds: number[];

    const safeInterval = Math.max(0.05, interval);

    if (meshData) {
      // Usar los datos pre-procesados de ThreeJS
      values = meshData.grid;
      const minEv = meshData.minEv;
      const maxEv = meshData.maxEv;

      // Asegurar que haya al menos rango para evitar loops infinitos si el terreno es plano
      if (maxEv === minEv) {
        thresholds = [minEv];
      } else {
        const delta = maxEv - minEv;
        let actualInterval = safeInterval;

        // Auto-escalamiento: Si generaría demasiadas curvas (> 180), ajustamos por rendimiento.
        // Si el relieve total es menor al intervalo seleccionado, subdividimos para no dejar el mapa vacío.
        if (delta / actualInterval > 180) {
          actualInterval = delta / 180;
        } else if (delta < actualInterval && delta > 0.05) {
          actualInterval = delta / 8;
        }

        thresholds = d3.range(minEv, maxEv + (actualInterval * 0.1), actualInterval);
      }
    } else {
      // Generador pseudo-aleatorio de respaldo (Fallback Pedagógico)
      const maxElevation = 25;
      const getSeed = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        }
        return Math.abs(hash);
      };

      const seed = getSeed(fileName);
      const prng = (min: number, max: number, offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return min + (x - Math.floor(x)) * (max - min);
      };

      const cx1 = prng(-1.5, 1.5, 1);
      const cy1 = prng(-1.5, 1.5, 2);
      const rad1 = prng(1.5, 3.5, 3);
      const peak1 = prng(14, 22, 4);

      const cx2 = prng(-2, 2, 5);
      const cy2 = prng(-2, 2, 6);
      const rad2 = prng(1, 2.5, 7);
      const peak2 = prng(8, 16, 8);

      const noiseFreq = prng(1.5, 3.5, 9);
      const noiseAmp = prng(1, 3, 10);

      values = new Array(n * m);
      for (let j = 0; j < m; ++j) {
        for (let i = 0; i < n; ++i) {
          const x = (i / n - 0.5) * 5;
          const y = (j / m - 0.5) * 5;
          const h1 = peak1 * Math.exp(-(Math.pow(x - cx1, 2) + Math.pow(y - cy1, 2)) / (rad1 * 0.5));
          const h2 = peak2 * Math.exp(-(Math.pow(x - cx2, 2) + Math.pow(y - cy2, 2)) / (rad2 * 0.5));
          const noise = noiseAmp * Math.sin(x * noiseFreq) * Math.cos(y * noiseFreq);
          values[j * n + i] = Math.max(0, h1 + h2 + noise);
        }
      }
      thresholds = d3.range(0.1, maxElevation, safeInterval);
    }

    const contourGenerator = d3.contours()
      .size([n, m])
      .thresholds(thresholds);

    let rawContours = contourGenerator(values);

    // Filtro por rango altimétrico
    if (minVisibleElev !== undefined) {
      rawContours = rawContours.filter(c => c.value >= minVisibleElev);
    }
    if (maxVisibleElev !== undefined) {
      rawContours = rawContours.filter(c => c.value <= maxVisibleElev);
    }

    return rawContours;
  }, [interval, fileName, meshData, n, m, minVisibleElev, maxVisibleElev]);

  const { buildings3D, highways3D, waterways3D } = useMemo(() => {
    if (!meshData?.buildings || !meshData.bbox) return { buildings3D: [], highways3D: [], waterways3D: [] };

    const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
    const els = meshData.buildings.elements || [];

    const widthSpan = maxLon - minLon;
    const heightSpan = maxLat - minLat;

    if (widthSpan === 0 || heightSpan === 0) return { buildings3D: [], highways3D: [], waterways3D: [] };

    const buildings: { pts: { x: number, y: number, elev: number }[], height: number }[] = [];
    const highways: { pts: { x: number, y: number, elev: number }[], type: string, width: number }[] = [];
    const waterways: { pts: { x: number, y: number, elev: number }[], type: string, width: number }[] = [];

    const getElevAt = (lon: number, lat: number) => {
      const u = ((lon - minLon) / widthSpan) * (n - 1);
      const v = ((maxLat - lat) / heightSpan) * (m - 1);

      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(x0 + 1, n - 1);
      const y1 = Math.min(y0 + 1, m - 1);

      const dx = u - x0;
      const dy = v - y0;

      const grid = meshData.grid;
      const v00Idx = Math.max(0, Math.min(m - 1, y0)) * n + Math.max(0, Math.min(n - 1, x0));
      const v00Val = grid[v00Idx];
      const v00 = v00Val !== undefined && !Number.isNaN(v00Val) ? v00Val : meshData.minEv;

      const v10Idx = Math.max(0, Math.min(m - 1, y0)) * n + Math.max(0, Math.min(n - 1, x1));
      const v10Val = grid[v10Idx];
      const v10 = v10Val !== undefined && !Number.isNaN(v10Val) ? v10Val : v00;

      const v01Idx = Math.max(0, Math.min(m - 1, y1)) * n + Math.max(0, Math.min(n - 1, x0));
      const v01Val = grid[v01Idx];
      const v01 = v01Val !== undefined && !Number.isNaN(v01Val) ? v01Val : v00;

      const v11Idx = Math.max(0, Math.min(m - 1, y1)) * n + Math.max(0, Math.min(n - 1, x1));
      const v11Val = grid[v11Idx];
      const v11 = v11Val !== undefined && !Number.isNaN(v11Val) ? v11Val : v01;

      return v00 * (1 - dx) * (1 - dy) +
        v10 * dx * (1 - dy) +
        v01 * (1 - dx) * dy +
        v11 * dx * dy;
    };

    for (const el of els) {
      if (el.type === 'way' && el.geometry && el.geometry.length > 0) {
        const isBuilding = !!el.tags?.building;
        const isHighway = !!el.tags?.highway;
        const isWaterway = !!el.tags?.waterway;

        if (!isBuilding && !isHighway && !isWaterway) continue;

        if (isBuilding) {
          let sumLon = 0;
          let sumLat = 0;
          for (let i = 0; i < el.geometry.length; i++) {
            sumLon += el.geometry[i].lon;
            sumLat += el.geometry[i].lat;
          }
          const avgLon = sumLon / el.geometry.length;
          const avgLat = sumLat / el.geometry.length;
          if (avgLon < minLon || avgLon > maxLon || avgLat < minLat || avgLat > maxLat) {
            continue;
          }

          const pts = [];
          for (let i = 0; i < el.geometry.length; i++) {
            const pt = el.geometry[i];
            const clampedLon = Math.max(minLon, Math.min(maxLon, pt.lon));
            const clampedLat = Math.max(minLat, Math.min(maxLat, pt.lat));
            const x = ((clampedLon - minLon) / widthSpan) * (n - 1);
            const y = ((maxLat - clampedLat) / heightSpan) * (m - 1);
            const elev = getElevAt(clampedLon, clampedLat);
            pts.push({ x, y, elev });
          }

          let height = 4;
          if (el.tags?.height) {
            height = parseFloat(el.tags.height) || 4;
          } else if (el.tags?.['building:levels']) {
            height = (parseFloat(el.tags['building:levels']) || 1) * 3.5;
          }

          buildings.push({ pts, height });
        } else if (isHighway || isWaterway) {
          const clippedLines = clipWayToBBox(el.geometry, meshData.bbox, 15);
          for (const lineCoords of clippedLines) {
            const pts = lineCoords.map((pt) => {
              const x = ((pt.lon - minLon) / widthSpan) * (n - 1);
              const y = ((maxLat - pt.lat) / heightSpan) * (m - 1);
              const elev = getElevAt(pt.lon, pt.lat);
              return { x, y, elev: elev + 0.08 };
            });

            if (pts.length >= 2) {
              let width = 1.2;
              if (isHighway) {
                const hType = el.tags.highway;
                if (hType === 'motorway' || hType === 'trunk') width = 3.5;
                else if (hType === 'primary' || hType === 'secondary') width = 2.5;
                else if (hType === 'pedestrian' || hType === 'footway' || hType === 'path') width = 0.6;
                else width = 1.2;

                if (el.tags.width) width = parseFloat(el.tags.width) * 0.3 || width;
                highways.push({ pts, type: hType, width });
              } else {
                const wType = el.tags.waterway;
                if (wType === 'river') width = 4.0;
                else if (wType === 'stream' || wType === 'canal') width = 1.5;
                else width = 1.0;

                if (el.tags.width) width = parseFloat(el.tags.width) * 0.3 || width;
                waterways.push({ pts, type: wType, width });
              }
            }
          }
        }
      } else if (el.type === 'relation' && el.tags?.building && Array.isArray(el.members)) {
        let height = 4;
        if (el.tags?.height) {
          height = parseFloat(el.tags.height) || 4;
        } else if (el.tags?.['building:levels']) {
          height = (parseFloat(el.tags['building:levels']) || 1) * 3.5;
        }

        for (const member of el.members) {
          if (member.role === 'outer' && Array.isArray(member.geometry) && member.geometry.length > 2) {
            const pts = [];
            for (let i = 0; i < member.geometry.length; i++) {
              const pt = member.geometry[i];
              const clampedLon = Math.max(minLon, Math.min(maxLon, pt.lon));
              const clampedLat = Math.max(minLat, Math.min(maxLat, pt.lat));
              const x = ((clampedLon - minLon) / widthSpan) * (n - 1);
              const y = ((maxLat - clampedLat) / heightSpan) * (m - 1);
              const elev = getElevAt(clampedLon, clampedLat);
              pts.push({ x, y, elev: elev + 0.05 });
            }
            if (pts.length >= 3) {
              buildings.push({ pts, height });
            }
          }
        }
      }
    }

    return { buildings3D: buildings, highways3D: highways, waterways3D: waterways, getElevAt };
  }, [meshData, n, m]);

  const terrainCurtains = useMemo(() => {
    if (!meshData) return null;
    const base = meshData.minEv;

    // Create the 4 curtain paths
    // Bottom edge (y = m-1)
    const ptsB = d3.range(0, n, n / 20 || 1).map(x => ({ x, y: m - 1, elev: meshData.grid[(m - 1) * n + Math.floor(x)] || base }));
    // Top edge (y = 0)
    const ptsT = d3.range(0, n, n / 20 || 1).map(x => ({ x, y: 0, elev: meshData.grid[Math.floor(x)] || base }));
    // Left edge (x = 0)
    const ptsL = d3.range(0, m, m / 20 || 1).map(y => ({ x: 0, y, elev: meshData.grid[Math.floor(y) * n] || base }));
    // Right edge (x = n-1)
    const ptsR = d3.range(0, m, m / 20 || 1).map(y => ({ x: n - 1, y, elev: meshData.grid[Math.floor(y) * n + (n - 1)] || base }));

    return { ptsB, ptsT, ptsL, ptsR };
  }, [meshData, n, m]);

  const geoPath = d3.geoPath();

  // Escala-Z dinámica:
  // Calculamos la proporción real de Z vs XY considerando que mapeamos un terreno de meshData.w X meshData.h a un grid de n X m.
  const zScale = useMemo(() => {
    if (!meshData) return 4 * zExaggeration;
    // 1 unidad real de X vale (n / w) píxeles en SVG
    // 1 unidad real de Y vale (m / h) píxeles en SVG
    // Tomamos un promedio o el min/max (isométrico)
    const truePixelPerUnitScale = n / Math.max(meshData.w, meshData.h);

    // Si la escala es extremadamente pequeña/grande o division por zero, aplicamos un fallback funcional
    if (truePixelPerUnitScale === Infinity || isNaN(truePixelPerUnitScale) || truePixelPerUnitScale === 0) {
      return 4 * zExaggeration;
    }

    return truePixelPerUnitScale * zExaggeration;
  }, [meshData, n, m, zExaggeration]);

  const getMatrix = (zLevel: number) => {
    const normalizedZ = meshData ? (zLevel - meshData.minEv) : zLevel;

    // Centro original geométrico
    const cx = (n - 1) / 2;
    const cy = (m - 1) / 2;

    let pitch = isPerspective ? rotation.x : 0;
    let yaw = isPerspective ? rotation.z : 0;

    const radPitch = (pitch * Math.PI) / 180;
    const radYaw = (yaw * Math.PI) / 180;

    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);

    // Coeficientes de Transformación Ortográfica/Isométrica 3D pura
    const a = cosY;
    const b = sinY * cosP;
    const c = -sinY;
    const d = cosY * cosP;

    // Desplazamiento de Z atado a la inclinación
    const zEffect = isPerspective ? Math.max(0.1, sinP) : 0;
    const zOffset = normalizedZ * zScale * zEffect;

    // Recalcular offsets para centrar todo el ensamble en el origen 0,0 del viewport SVG
    const e = -a * cx - c * cy;
    const f = -b * cx - d * cy - zOffset;

    return `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}, ${d.toFixed(5)}, ${e.toFixed(5)}, ${f.toFixed(5)})`;
  };

  const projectPoint = (x: number, y: number, zRaw: number) => {
    const normalizedZ = meshData ? (zRaw - meshData.minEv) : zRaw;
    const cx = (n - 1) / 2;
    const cy = (m - 1) / 2;
    let pitch = isPerspective ? rotation.x : 0;
    let yaw = isPerspective ? rotation.z : 0;
    const radPitch = (pitch * Math.PI) / 180;
    const radYaw = (yaw * Math.PI) / 180;
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const a = cosY;
    const b = sinY * cosP;
    const c = -sinY;
    const d = cosY * cosP;
    const zEffect = isPerspective ? Math.max(0.1, sinP) : 0;
    const zOffset = normalizedZ * zScale * zEffect;
    const e = -a * cx - c * cy;
    const f = -b * cx - d * cy - zOffset;
    return {
      X: a * x + c * y + e,
      Y: b * x + d * y + f
    };
  };
  const sunPosition = useMemo(() => {
    if (analysisMode !== 'solar' || !solarParams) return null;
    const date = new Date(solarParams.date);
    return getSunPosition(locationLat, locationLon, date, solarParams.time);
  }, [analysisMode, solarParams, locationLat, locationLon]);

  const perspectiveHeliodonRadius = useMemo(() => {
    const baseRadius = Math.sqrt(n * n + m * m) / 2 * 1.4;
    return Math.min(baseRadius, 350 / Math.max(0.1, zoomK));
  }, [n, m, zoomK]);

  const sunPaths = useMemo(() => {
    if (analysisMode !== 'solar' || !solarParams?.showSunPath) return null;
    const dates = [
      { date: new Date('2024-12-21T12:00:00'), color: '#f87171', label: 'Verano (Dic)' },
      { date: new Date('2024-03-21T12:00:00'), color: '#fbbf24', label: 'Equinoccio' },
      { date: new Date('2024-06-21T12:00:00'), color: '#60a5fa', label: 'Invierno (Jun)' },
    ];

    if (!isPerspective) {
      // PLANTA: HUD 2D
      const rPx = 140;
      return dates.map(d => {
        const pts = [];
        for (let h = 5; h <= 21; h += 0.5) {
          const pos = getSunPosition(locationLat, locationLon, d.date, h);
          if (pos.elevation > -2) {
            const elRad = pos.elevation * (Math.PI / 180);
            const azRad = pos.azimuth * (Math.PI / 180);
            const r = rPx * Math.cos(elRad);
            pts.push({ x: r * Math.sin(azRad), y: -r * Math.cos(azRad), elev: 0 });
          }
        }
        return { ...d, pts };
      });
    }

    // PERSPECTIVA: Mundo 3D
    const cx = n / 2;
    const cy = m / 2;
    const radius = perspectiveHeliodonRadius;

    return dates.map(d => {
      const pts = [];
      for (let h = 5; h <= 21; h += 0.5) {
        const pos = getSunPosition(locationLat, locationLon, d.date, h);
        if (pos.elevation > -2) {
          const elevRad = pos.elevation * Math.PI / 180;
          const aziRad = pos.azimuth * Math.PI / 180;

          const dirX = Math.sin(aziRad) * Math.cos(elevRad);
          const dirY = Math.cos(aziRad) * Math.cos(elevRad);
          const dirZ = Math.sin(elevRad);

          const sx = cx + dirX * radius;
          const sy = cy - dirY * radius;
          const sz = (meshData?.minEv || 0) + (dirZ * radius) / zScale;
          pts.push({ x: sx, y: sy, elev: sz });
        }
      }
      return { ...d, pts };
    });
  }, [analysisMode, solarParams?.showSunPath, locationLat, locationLon, n, m, meshData, zScale, isPerspective, perspectiveHeliodonRadius]);

  const currentSunPos = useMemo(() => {
    if (analysisMode !== 'solar' || !solarParams?.showSunPath || !sunPosition) return null;
    const elevRad = sunPosition.elevation * Math.PI / 180;
    const aziRad = sunPosition.azimuth * Math.PI / 180;

    if (!isPerspective) {
      const rPx = 140;
      const r = rPx * Math.cos(elevRad);
      return { x: r * Math.sin(aziRad), y: -r * Math.cos(aziRad), elev: 0, dirX: 0, dirY: 0, dirZ: 0 };
    }

    const cx = n / 2;
    const cy = m / 2;
    const radius = perspectiveHeliodonRadius;

    const dirX = Math.sin(aziRad) * Math.cos(elevRad);
    const dirY = Math.cos(aziRad) * Math.cos(elevRad);
    const dirZ = Math.sin(elevRad);

    const sx = cx + dirX * radius;
    const sy = cy - dirY * radius;
    const sz = (meshData?.minEv || 0) + (dirZ * radius) / zScale;
    return { x: sx, y: sy, elev: sz, dirX, dirY, dirZ };
  }, [analysisMode, solarParams, sunPosition, n, m, meshData, zScale, isPerspective, perspectiveHeliodonRadius]);

  const heliodonGuides = useMemo(() => {
    if (analysisMode !== 'solar' || !solarParams?.showSunPath) return null;

    if (!isPerspective) {
      const rPx = 140;
      const horizonPts = [];
      for (let a = 0; a <= 360; a += 5) {
        const rad = a * Math.PI / 180;
        horizonPts.push({ x: Math.sin(rad) * rPx, y: -Math.cos(rad) * rPx, elev: 0 });
      }
      const elevLines = [30, 60].map(elev => {
        const elRad = elev * Math.PI / 180;
        const rCurrent = rPx * Math.cos(elRad);
        const pts = [];
        for (let a = 0; a <= 360; a += 5) {
          const azRad = a * Math.PI / 180;
          pts.push({ x: Math.sin(azRad) * rCurrent, y: -Math.cos(azRad) * rCurrent, elev: 0 });
        }
        return pts;
      });
      const northLine = [{ x: 0, y: -rPx, elev: 0 }, { x: 0, y: 0, elev: 0 }];
      const cardinals = [
        { label: 'N', x: 0, y: -rPx - 10, elev: 0 },
        { label: 'E', x: rPx + 10, y: 0, elev: 0 },
        { label: 'S', x: 0, y: rPx + 10, elev: 0 },
        { label: 'O', x: -rPx - 10, y: 0, elev: 0 }
      ];
      return { horizonPts, elevLines, northLine, cardinals };
    }

    const cx = n / 2;
    const cy = m / 2;
    const R = perspectiveHeliodonRadius;
    const baseElev = meshData?.minEv || 0;

    const horizonPts = [];
    for (let a = 0; a <= 360; a += 5) {
      const rad = a * Math.PI / 180;
      horizonPts.push({ x: cx + Math.sin(rad) * R, y: cy - Math.cos(rad) * R, elev: baseElev });
    }

    const elevLines = [30, 60].map(elev => {
      const elRad = elev * Math.PI / 180;
      const rCurrent = R * Math.cos(elRad);
      const zCurrent = baseElev + (Math.sin(elRad) * R) / zScale;
      const pts = [];
      for (let a = 0; a <= 360; a += 5) {
        const azRad = a * Math.PI / 180;
        pts.push({ x: cx + Math.sin(azRad) * rCurrent, y: cy - Math.cos(azRad) * rCurrent, elev: zCurrent });
      }
      return pts;
    });

    const northLine = [];
    for (let el = 0; el <= 90; el += 5) {
      const elRad = el * Math.PI / 180;
      northLine.push({ x: cx, y: cy - Math.cos(elRad) * R, elev: baseElev + (Math.sin(elRad) * R) / zScale });
    }

    const cardinals = [
      { label: 'N', x: cx, y: cy - R },
      { label: 'E', x: cx + R, y: cy },
      { label: 'S', x: cx, y: cy + R },
      { label: 'O', x: cx - R, y: cy }
    ].map(c => ({ ...c, elev: baseElev }));

    return { horizonPts, elevLines, northLine, cardinals };
  }, [analysisMode, solarParams?.showSunPath, n, m, meshData, zScale, isPerspective, perspectiveHeliodonRadius]);

  const getGridElevAt = (x: number, y: number) => {
    if (!meshData) return 0;
    const grid = meshData.grid;
    const x0 = Math.max(0, Math.min(n - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(m - 1, Math.floor(y)));
    const x1 = Math.min(x0 + 1, n - 1);
    const y1 = Math.min(y0 + 1, m - 1);
    const dx = x - x0;
    const dy = y - y0;
    
    const v00 = grid[y0 * n + x0] ?? meshData.minEv;
    const v10 = grid[y0 * n + x1] ?? v00;
    const v01 = grid[y1 * n + x0] ?? v00;
    const v11 = grid[y1 * n + x1] ?? v01;
    
    return v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
  };

  // Reset dragOffset whenever customLotPts changes externally
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [customLotPts]);

  /**
   * Convierte coordenadas de pantalla (clientX, clientY) a coordenadas exactas de la grilla (gridX, gridY, elev)
   * invirtiendo: 1) CTM del viewBox SVG, 2) d3.zoomTransform, y 3) Matriz de proyección ortográfica/isométrica 2.5D con cota Z.
   */
  const screenToGrid = (clientX: number, clientY: number): { x: number; y: number; elev: number } | null => {
    const svgEl = svgRef.current;
    if (!svgEl) return null;

    let zoomX = 0;
    let zoomY = 0;

    // 1. Convertir de píxeles de pantalla (clientX/Y) al sistema de coordenadas dentro de zoomGroupRef
    if (zoomGroupRef.current && zoomGroupRef.current.getScreenCTM()) {
      const ctm = zoomGroupRef.current.getScreenCTM()!;
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const localPt = pt.matrixTransform(ctm.inverse());
      zoomX = localPt.x;
      zoomY = localPt.y;
    } else if (svgEl.getScreenCTM()) {
      const ctm = svgEl.getScreenCTM()!;
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const t = d3.zoomTransform(svgEl);
      zoomX = (svgPt.x - t.x) / t.k;
      zoomY = (svgPt.y - t.y) / t.k;
    } else {
      return null;
    }

    // 2. Invertir la matriz de proyección 2D / 2.5D (incluyendo iteración de punto fijo para la elevación del terreno en Perspectiva)
    const pitch = isPerspective ? rotation.x : 0;
    const yaw = isPerspective ? rotation.z : 0;
    const radPitch = (pitch * Math.PI) / 180;
    const radYaw = (yaw * Math.PI) / 180;
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);

    const a = cosY;
    const b = sinY * cosP;
    const c = -sinY;
    const d = cosY * cosP;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-8) return null;

    const cx = (n - 1) / 2;
    const cy = (m - 1) / 2;
    const zEffect = isPerspective ? Math.max(0.1, sinP) : 0;

    let estElev = meshData ? (meshData.minEv + meshData.maxEv) / 2 : 0;
    let gridX = cx;
    let gridY = cy;

    const iterations = isPerspective ? 4 : 1;
    for (let iter = 0; iter < iterations; iter++) {
      const normalizedZ = meshData ? estElev - meshData.minEv : estElev;
      const zOffset = normalizedZ * zScale * zEffect;
      const eT = -a * cx - c * cy;
      const fT = -b * cx - d * cy - zOffset;

      gridX = (d * (zoomX - eT) - c * (zoomY - fT)) / det;
      gridY = (a * (zoomY - fT) - b * (zoomX - eT)) / det;
      estElev = getGridElevAt(gridX, gridY) ?? (meshData?.minEv || 0);
    }

    gridX = Math.max(0, Math.min(n - 1, gridX));
    gridY = Math.max(0, Math.min(m - 1, gridY));
    const finalElev = getGridElevAt(gridX, gridY) ?? (meshData?.minEv || 0);

    return { x: gridX, y: gridY, elev: finalElev };
  };

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
      return customLotPts.map((p) => ({
        x: Math.max(0, Math.min(n - 1, p.x + dragOffset.x)),
        y: Math.max(0, Math.min(m - 1, p.y + dragOffset.y)),
      }));
    }
    if (isDrawingLot) return null;

    // Lote por defecto centrado en el terreno cuando aún no se ha dibujado uno personalizado
    const cx = (n - 1) / 2 + dragOffset.x;
    const cy = (m - 1) / 2 + dragOffset.y;
    const hw = n * 0.11;
    const hh = m * 0.11;
    return [
      { x: cx - hw, y: cy - hh },
      { x: cx + hw, y: cy - hh },
      { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh },
    ];
  }, [customLotPts, isDrawingLot, n, m, dragOffset]);

  const ogucModel = useMemo(() => {
    if ((analysisMode !== 'oguc' && analysisMode !== 'solar') || !effectiveLotBasePts) return null;
    return computeOgucModel({
      rawLotPts: effectiveLotBasePts,
      ogucParams: activeOgucParams,
      meshData,
      n,
      m,
      getGridElevAt,
    });
  }, [analysisMode, effectiveLotBasePts, activeOgucParams, meshData, n, m]);

  const lotPolygon = ogucModel?.lotPolygon || null;

  const projectVolume = useMemo(() => {
    if (!ogucModel) return null;
    if (ogucModel.collapsed || ogucModel.tiers.length === 0) {
      return { pts: [], height: 0, collapsed: true };
    }
    const primaryTier =
      ogucModel.tiers.find((t) => t.id === 'main') || ogucModel.tiers[ogucModel.tiers.length - 1];
    return {
      pts: primaryTier.basePts,
      height: ogucModel.effectiveHeight,
      collapsed: false,
    };
  }, [ogucModel]);

  const getSolarShadowPolygon = (pts: { x: number, y: number, elev: number }[], height: number) => {
    if (!sunPosition || sunPosition.elevation <= 0.5) return null; // Solo dibuja si está sobre el horizonte
    const elevRad = sunPosition.elevation * Math.PI / 180;
    const aziRad = sunPosition.azimuth * Math.PI / 180;

    const projectedPts = pts.map(p => {
      const startZ = p.elev + height;
      
      // Vector direccional de la sombra en el mundo físico (unidad 1m)
      const realDx = -Math.sin(aziRad);
      const realDy = Math.cos(aziRad);

      // Convertir a unidades de grilla (map units)
      const rawMapDx = meshData ? (realDx / meshData.w) * n : realDx;
      const rawMapDy = meshData ? (realDy / meshData.h) * m : realDy;

      // Normalizar para que el paso (step) avance exactamente ~0.5 celdas de la grilla 
      // (mayor precisión en la intersección con el relieve)
      const len = Math.sqrt(rawMapDx * rawMapDx + rawMapDy * rawMapDy) || 1;
      const stepX = (rawMapDx / len) * 0.5;
      const stepY = (rawMapDy / len) * 0.5;

      // Distancia real de cada paso
      const realStepDx = meshData ? (stepX / n) * meshData.w : stepX;
      const realStepDy = meshData ? (stepY / m) * meshData.h : stepY;
      const stepDistReal = Math.sqrt(realStepDx * realStepDx + realStepDy * realStepDy);
      
      // Caída altimétrica por cada paso
      const stepZ = -stepDistReal * Math.tan(elevRad);

      let currX = p.x;
      let currY = p.y;
      let currZ = startZ;

      // Raymarching: Avanzar el rayo solar hasta que choque con el DEM
      for (let steps = 0; steps < 2000; steps++) {
        currX += stepX;
        currY += stepY;
        currZ += stepZ;

        if (currX < 0 || currX >= n || currY < 0 || currY >= m) {
          currZ = meshData?.minEv || 0; // Cae al plano base si sale del mapa
          break;
        }

        const groundZ = getGridElevAt(currX, currY);
        if (currZ <= groundZ) {
          currZ = groundZ; // Intersección confirmada
          break;
        }
      }

      return { x: currX, y: currY, elev: currZ };
    });

    const allPts = [...pts.map(p => ({ ...p, elev: p.elev })), ...projectedPts];
    return convexHull3D(allPts);
  };

  const polygonArea = (pts: { x: number, y: number }[]) =>
    computePolygonAreaM2(pts, meshData, n, m);

  const render3DPath = (pts: { x: number, y: number, elev: number }[], close: boolean = false) => {
    if (pts.length === 0) return "";
    const p0 = projectPoint(pts[0].x, pts[0].y, pts[0].elev);
    let pathStr = `M ${p0.X.toFixed(2)} ${p0.Y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = projectPoint(pts[i].x, pts[i].y, pts[i].elev);
      pathStr += ` L ${p.X.toFixed(2)} ${p.Y.toFixed(2)}`;
    }
    if (close) pathStr += " Z";
    return pathStr;
  };

  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    if (!svgRef.current || !zoomGroupRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(zoomGroupRef.current);

    zoomBehavior.current = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 120])
      .filter((event) => {
        if (isDrawingLot) return false;
        
        // En perspectiva: Left-click queda libre para rotar. Paneo se mueve a click derecho/central.
        if (viewModeRef.current === 'perspective') {
          if (event.type === 'wheel') return true;
          if (event.type === 'mousedown') return event.button === 1 || event.button === 2;
          if (event.type.startsWith('touch')) return true; // Permitir pan multi-touch
          return false;
        }
        // En planta: Left-click para pan (default D3)
        return (!event.ctrlKey || event.type === 'wheel') && !event.button;
      })
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
        setZoomK(event.transform.k);
      });

    svg.call(zoomBehavior.current).on("contextmenu", (e) => {
      // Bloquear menú contextual de clic derecho para que sirva para pan en perspectiva
      e.preventDefault();
    });
  }, [isDrawingLot]);

  // Control manual de órbita via arrastre (Perspective Mode)
  const isDraggingOrbitRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPerspective && e.button === 0) { // Solo clic izquierdo
      isDraggingOrbitRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      setIsDraggingSlider(true); // Deshabilita transiciones CSS molestas
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingOrbitRef.current && isPerspective) {
      const deltaX = e.clientX - lastPosRef.current.x;
      const deltaY = e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      setRotation(prev => {
        let newX = prev.x - deltaY * 0.5; // Pitch
        let newZ = prev.z - deltaX * 0.5; // Yaw
        // Restringir pitch de 0 (planta plana) a 90 (vista de calle 100% lateral)
        newX = Math.max(0, Math.min(90, newX));
        return { x: newX, z: newZ };
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingOrbitRef.current) {
      isDraggingOrbitRef.current = false;
      setIsDraggingSlider(false);
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
  };

  const handleZoomIn = () => {
    if (svgRef.current && zoomBehavior.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomBehavior.current.scaleBy, 1.4);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehavior.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomBehavior.current.scaleBy, 0.71);
    }
  };

  const handleResetZoom = () => {
    if (svgRef.current && zoomBehavior.current) {
      d3.select(svgRef.current).transition().duration(500).call(zoomBehavior.current.transform, d3.zoomIdentity);
    }
  };

  const handleFocusLot = () => {
    if (!svgRef.current || !zoomBehavior.current) return;
    const pts = lotPolygon || effectiveLotBasePts;
    if (!pts || pts.length < 3) return;
    const projected = pts.map((p: any) =>
      projectPoint(p.x, p.y, p.elev ?? getGridElevAt(p.x, p.y))
    );
    const xs = projected.map((p) => p.X);
    const ys = projected.map((p) => p.Y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const span = Math.max(8, maxX - minX, maxY - minY);
    const k = Math.min(80, Math.max(1.5, 160 / span));
    const transform = d3.zoomIdentity.scale(k).translate(-cx, -cy);
    d3.select(svgRef.current).transition().duration(450).call(zoomBehavior.current.transform, transform);
  };

  const handleExportDXF = () => {
    if (!contours) return;

    // AutoCAD DXF Header: specifies AC1015 (AutoCAD 2000), INSUNITS 6 (Meters), MEASUREMENT 1 (Metric)
    const headerLines = [
      "0", "SECTION",
      "2", "HEADER",
      "9", "$ACADVER",
      "1", "AC1015",
      "9", "$HANDSEED",
      "5", "FFFF",
      "9", "$MEASUREMENT",
      "70", "1", // 1 = Metric
      "9", "$INSUNITS",
      "70", "6", // 6 = Meters (0=Unitless, 1=Inches, 2=Feet, 4=mm, 5=cm, 6=Meters)
      "9", "$LUNITS",
      "70", "2", // 2 = Decimal
      "0", "ENDSEC",
      "0", "SECTION",
      "2", "ENTITIES\n"
    ];

    let dxf = headerLines.join("\n");

    contours.forEach(c => {
      const z = c.value;
      const lines = c.type === 'MultiLineString' ? c.coordinates : (c.coordinates as any).flat();

      lines.forEach((line: any) => {
        dxf += "0\nPOLYLINE\n8\nContours\n66\n1\n70\n8\n10\n0.0\n20\n0.0\n30\n" + z.toFixed(3) + "\n";
        line.forEach((pt: number[]) => {
          let realX = pt[0];
          let realY = pt[1];

          if (meshData && n > 0 && m > 0) {
            realX = (pt[0] / n) * meshData.w;
            realY = (1.0 - (pt[1] / m)) * meshData.h;
          }

          dxf += "0\nVERTEX\n8\nContours\n70\n32\n10\n" + realX.toFixed(3) + "\n20\n" + realY.toFixed(3) + "\n30\n" + z.toFixed(3) + "\n";
        });
        dxf += "0\nSEQEND\n";
      });
    });

    if (meshData?.buildings && meshData.bbox) {
      const els = meshData.buildings.elements || [];
      const { minLon, maxLon, minLat, maxLat } = meshData.bbox;
      const widthSpan = maxLon - minLon;
      const heightSpan = maxLat - minLat;

      const getElevAt = (lon: number, lat: number) => {
        const gx = Math.floor(((lon - minLon) / widthSpan) * (meshData.cols || n));
        const gy = Math.floor(((maxLat - lat) / heightSpan) * (meshData.rows || m));
        const gIdx = Math.max(0, Math.min((meshData.rows || m) - 1, gy)) * (meshData.cols || n) + Math.max(0, Math.min((meshData.cols || n) - 1, gx));
        const gridVal = meshData.grid[gIdx];
        return gridVal !== undefined && !Number.isNaN(gridVal) ? gridVal : meshData.minEv;
      };

      els.forEach((el: any) => {
        if (el.type === 'way' && el.geometry && el.geometry.length > 0) {
          const isBuilding = !!el.tags?.building;
          const isHighway = !!el.tags?.highway;
          const isWaterway = !!el.tags?.waterway;

          if (!isBuilding && !isHighway && !isWaterway) return;

          let layerName = "Buildings";
          if (isHighway) layerName = "Highways";
          if (isWaterway) layerName = "Waterways";

          const polylineFlag = isBuilding ? "9" : "8"; // 9: closed polyline, 8: 3D polyline

          dxf += "0\nPOLYLINE\n8\n" + layerName + "\n66\n1\n70\n" + polylineFlag + "\n10\n0.0\n20\n0.0\n30\n0.0\n";
          el.geometry.forEach((pt: any) => {
            const clampedLon = Math.max(minLon, Math.min(maxLon, pt.lon));
            const clampedLat = Math.max(minLat, Math.min(maxLat, pt.lat));
            const x = ((clampedLon - minLon) / widthSpan) * meshData.w;
            const y = ((clampedLat - minLat) / heightSpan) * meshData.h; // True Y Cartesian mapping vs SVG
            const z = getElevAt(clampedLon, clampedLat);
            dxf += "0\nVERTEX\n8\n" + layerName + "\n70\n32\n10\n" + x.toFixed(3) + "\n20\n" + y.toFixed(3) + "\n30\n" + z.toFixed(3) + "\n";
          });
          dxf += "0\nSEQEND\n";
        }
      });
    }

    dxf += "0\nENDSEC\n0\nEOF\n";

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `isolineas_${fileName.replace(/\.[^/.]+$/, "")}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buildThreeScene = (THREE: any) => {
    if (!meshData) return null;
    const scene = new THREE.Scene();

    const trueN = Math.max(1, n - 1);
    const trueM = Math.max(1, m - 1);

    // Mapeamos SVG coordenadas a Metros espaciales centrados en 0,0
    const mapXtoMeters = (x: number) => (x / trueN) * meshData.w - meshData.w / 2;
    const mapYtoMetersZ = (y: number) => (y / trueM) * meshData.h - meshData.h / 2; // Mapea Y de SVG (0 es Norte) a Z (-Z es Norte en 3D)

    // 1. TERRENO: Crear Malla Superficial
    const segX = meshData.cols ? meshData.cols - 1 : trueN;
    const segY = meshData.rows ? meshData.rows - 1 : trueM;
    const geo = new THREE.PlaneGeometry(meshData.w, meshData.h, segX, segY);
    geo.rotateX(-Math.PI / 2); // Recostar sobre el plano XZ

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      // Coordenadas normalizadas 0..1 para rescatar Z de la cuadrícula
      const normX = (vx + meshData.w / 2) / meshData.w;
      const normY = (vz + meshData.h / 2) / meshData.h;

      const gridX = Math.round(normX * (meshData.cols ? meshData.cols - 1 : trueN));
      const gridY = Math.round(normY * (meshData.rows ? meshData.rows - 1 : trueM));
      const gIdx = Math.max(0, Math.min((meshData.rows || trueM) - 1, gridY)) * (meshData.cols || trueN) + Math.max(0, Math.min((meshData.cols || trueN) - 1, gridX));

      const gridVal = meshData.grid[gIdx];
      const elevation = gridVal !== undefined && !Number.isNaN(gridVal) ? gridVal : meshData.minEv;
      pos.setY(i, elevation * zExaggeration);
    }
    geo.computeVertexNormals();
    const terrainMat = new THREE.MeshStandardMaterial({ color: 0x999999, flatShading: true, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(geo, terrainMat));

    // 2. EDIFICIOS: Extruir de la base en 3D
    buildings3D.forEach(b => {
      if (b.pts.length < 3) return;
      const shape = new THREE.Shape();
      b.pts.forEach((pt, i) => {
        const mx = mapXtoMeters(pt.x);
        const mz = mapYtoMetersZ(pt.y);
        // Para que rotateX(-PI/2) convierta el Extrude Z a elevación (Y), y Z original, asuguramos Y = -Z:
        const shapeY = -mz;
        if (i === 0) shape.moveTo(mx, shapeY);
        else shape.lineTo(mx, shapeY);
      });
      const bGeo = new THREE.ExtrudeGeometry(shape, { depth: b.height * zExaggeration, bevelEnabled: false });
      bGeo.rotateX(-Math.PI / 2);
      const baseElev = b.pts[0].elev * zExaggeration;
      bGeo.translate(0, baseElev, 0);
      const bMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
      scene.add(new THREE.Mesh(bGeo, bMat));
    });

    // 3. VÍAS Y AGUA: Exportar como Líneas a nivel de suelo + offset
    const lineMat = new THREE.LineBasicMaterial({ color: 0x333333 });
    highways3D.forEach(hw => {
      const lPts = hw.pts.map(p => new THREE.Vector3(mapXtoMeters(p.x), p.elev * zExaggeration + 0.1, mapYtoMetersZ(p.y)));
      const lGeo = new THREE.BufferGeometry().setFromPoints(lPts);
      scene.add(new THREE.Line(lGeo, lineMat));
    });

    const waterMat = new THREE.LineBasicMaterial({ color: 0x3b82f6 });
    waterways3D.forEach(ww => {
      const lPts = ww.pts.map(p => new THREE.Vector3(mapXtoMeters(p.x), p.elev * zExaggeration + 0.05, mapYtoMetersZ(p.y)));
      const lGeo = new THREE.BufferGeometry().setFromPoints(lPts);
      scene.add(new THREE.Line(lGeo, waterMat));
    });

    // 4. CURVAS DE NIVEL: Exportar como Líneas topográficas
    const cMat = new THREE.LineBasicMaterial({ color: 0xc5a059 });
    contours.forEach(c => {
      const elev = c.value * zExaggeration;
      const lines = c.type === 'MultiLineString' ? c.coordinates : (c.coordinates as any).flat();
      lines.forEach((line: any) => {
        const cPts = line.map((p: number[]) => {
          const mx = mapXtoMeters(p[0]);
          const mz = mapYtoMetersZ(p[1]);
          return new THREE.Vector3(mx, elev + 0.05, mz); // offset sutil
        });
        const cGeo = new THREE.BufferGeometry().setFromPoints(cPts);
        scene.add(new THREE.Line(cGeo, cMat));
      });
    });

    return scene;
  };

  const handleExportSTL = async () => {
    if (!meshData) return;

    // Importar dinámicamente
    const THREE = await import('three');
    const { STLExporter } = await import('three-stdlib');

    const scene = buildThreeScene(THREE);
    if (!scene) return;

    // EXPORTAR A STL (Binary)
    const exporter = new STLExporter();
    const result = exporter.parse(scene, { binary: true });

    // STL result es un DataView si usamos binary: true
    const dataView = result as any as DataView;
    const blob = new Blob([dataView.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo_${fileName.replace(/\.[^/.]+$/, "")}.stl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  return (
    <div className="w-full h-full flex items-center justify-center bg-bg-input relative overflow-hidden rounded-sm border border-border-faded transition-colors duration-300">

      {/* HUD UI Top Left: View Mode */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <div className="flex bg-bg-surface p-1 rounded-sm border border-border-main shadow-lg transition-colors duration-300 items-center">
          <button
            onClick={() => setViewMode('plan')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-sm transition-colors text-[10px] font-bold uppercase tracking-widest cursor-pointer ${!isPerspective ? 'bg-bg-elevated text-accent' : 'text-text-faded hover:text-text-main'}`}
          >
            <Map size={14} /> Planta
          </button>
          <button
            onClick={() => setViewMode('perspective')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-sm transition-colors text-[10px] font-bold uppercase tracking-widest cursor-pointer ${isPerspective ? 'bg-bg-elevated text-accent' : 'text-text-faded hover:text-text-main'}`}
          >
            <Layers size={14} /> Perspectiva
          </button>

          {!isPerspective && meshData?.satelliteTexture && (
            <div className="flex items-center gap-2 pl-3 border-l border-border-main text-[9px] font-mono text-text-faded ml-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-text-main">
                <input
                  type="checkbox"
                  checked={showSatelliteInPlan}
                  onChange={(e) => setShowSatelliteInPlan(e.target.checked)}
                  className="accent-accent w-3 h-3 cursor-pointer"
                />
                <span className="uppercase tracking-wider font-semibold">Foto Satelital</span>
              </label>
              {showSatelliteInPlan && (
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={satelliteOpacity}
                  onChange={(e) => setSatelliteOpacity(parseFloat(e.target.value))}
                  className="w-16 accent-accent h-1 cursor-pointer"
                  title={`Opacidad ortofoto: ${Math.round(satelliteOpacity * 100)}%`}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* HUD UI Controls Top Right */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-20 items-end">
        <div className="flex flex-col bg-bg-surface p-1 rounded-sm border border-border-main shadow-lg transition-colors duration-300">
          <button onClick={handleZoomIn} className="p-2 text-text-faded hover:text-accent transition-colors" title="Acercar">
            <ZoomIn size={14} />
          </button>
          <div className="w-full h-[1px] bg-border-main"></div>
          <button onClick={handleFocusLot} className="p-2 text-accent hover:bg-accent/10 transition-colors font-mono text-[8px] font-bold uppercase" title="Enfocar Lote / Predio Activo">
            LOTE
          </button>
          <div className="w-full h-[1px] bg-border-main"></div>
          <button onClick={handleResetZoom} className="p-2 text-text-faded hover:text-accent transition-colors" title="Restablecer Vista">
            <Maximize size={14} />
          </button>
          <div className="w-full h-[1px] bg-border-main"></div>
          <button onClick={handleZoomOut} className="p-2 text-text-faded hover:text-accent transition-colors" title="Alejar">
            <ZoomOut size={14} />
          </button>
        </div>

        <div className="flex flex-col bg-bg-surface p-1 rounded-sm border border-border-main shadow-lg transition-colors duration-300 w-10">
          <button onClick={handleExportDXF} className="py-2 text-text-faded hover:text-accent transition-colors flex flex-col items-center justify-center gap-1" title="Exportar a AutoCAD / SketchUp (DXF en Metros reales). En SketchUp: en Archivo > Importar > Opciones, asegurar Unidades: Metros.">
            <Download size={14} />
            <span className="text-[8px] font-bold tracking-widest uppercase">DXF</span>
          </button>
          <div className="w-full h-[1px] bg-border-main"></div>
          <button onClick={handleExportSTL} className="py-2 text-text-faded hover:text-accent transition-colors flex flex-col items-center justify-center gap-1" title="Exportar Malla Sólida (STL)">
            <Download size={14} />
            <span className="text-[8px] font-bold tracking-widest uppercase">STL</span>
          </button>
        </div>
      </div>

      {/* Grid Background Ambient */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, var(--theme-text-main) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      ></div>

      <svg
        ref={svgRef}
        viewBox="-180 -200 360 400"
        preserveAspectRatio="xMidYMid meet"
        className={`w-full h-full origin-center overflow-visible z-10 drop-shadow-[0_0_15px_rgba(197,160,89,0.15)] ${isDrawingLot ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={(e) => {
          if (isDrawingLot) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            const gridPt = screenToGrid(e.clientX, e.clientY);
            if (!gridPt) return;

            // Doble clic cierra el polígono
            if (e.detail >= 2 && customLotPts && customLotPts.length >= 3) {
              if (setIsDrawingLot) setIsDrawingLot(false);
              setDrawingCursor(null);
              return;
            }

            // Si hace clic cerca del primer vértice y ya hay >= 3 puntos, cierra el polígono
            if (customLotPts && customLotPts.length >= 3 && svgRef.current) {
              const transform = d3.zoomTransform(svgRef.current as any);
              const firstPt = customLotPts[0];
              const firstProj = projectPoint(firstPt.x, firstPt.y, firstPt.elev);
              const currProj = projectPoint(gridPt.x, gridPt.y, gridPt.elev);
              const dist =
                Math.hypot(currProj.X - firstProj.X, currProj.Y - firstProj.Y) * transform.k;
              if (dist < 10) {
                if (setIsDrawingLot) setIsDrawingLot(false);
                setDrawingCursor(null);
                return;
              }
            }

            const newPts = customLotPts ? [...customLotPts] : [];
            newPts.push(gridPt);
            if (setCustomLotPts) setCustomLotPts(newPts);
          } else {
            handlePointerDown(e);
          }
        }}
        onPointerMove={(e) => {
          if (isDrawingLot) {
            const gridPt = screenToGrid(e.clientX, e.clientY);
            if (gridPt) {
              setDrawingCursor({ x: gridPt.x, y: gridPt.y });
            }
          } else {
            handlePointerMove(e);
          }
        }}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Main Zoom Group */}
        <g ref={zoomGroupRef}>
          {/* Ortofoto Satelital de Fondo en Modo Planta */}
          {!isPerspective && showSatelliteInPlan && meshData?.satelliteTexture && (
            <image
              href={meshData.satelliteTexture}
              x={-(n - 1) / 2}
              y={-(m - 1) / 2}
              width={n - 1}
              height={m - 1}
              preserveAspectRatio="none"
              opacity={satelliteOpacity}
              className="pointer-events-none select-none"
            />
          )}

          {/* Contornos Topográficos Elevados */}
          {contours.map((c, i) => {
            const curveIndex = Math.round(c.value / interval);
            const isMajor = curveIndex % masterIntervalCount === 0;

            let strokeColor = "var(--theme-text-muted)";
            let strokeOp = isMajor ? 0.95 : 0.4;
            let fillCol = isMajor ? "var(--theme-accent)" : "var(--theme-bg-surface)";

            if (colorPalette === 'tecnico') {
              strokeColor = isMajor ? "var(--theme-text-main)" : "var(--theme-text-muted)";
            } else if (colorPalette === 'termico') {
              const min = meshData?.minEv || 0;
              const max = meshData?.maxEv || 25;
              const norm = Math.max(0, Math.min(1, (c.value - min) / (max - min || 1)));
              const col = d3.color(d3.interpolateInferno(norm));
              if (col) strokeColor = col.formatHex();
              fillCol = strokeColor;
            } else if (colorPalette === 'hipso') {
              const min = meshData?.minEv || 0;
              const max = meshData?.maxEv || 25;
              const norm = Math.max(0, Math.min(1, (c.value - min) / (max - min || 1)));
              // Custom Hypsometric scale (Green -> Yellow -> Brown -> White)
              const hipsoScale = d3.scaleLinear<string>().domain([0, 0.3, 0.7, 1]).range(["#74a089", "#c8c886", "#c39a6b", "#e0e0e0"]);
              const col = d3.color(hipsoScale(norm));
              if (col) strokeColor = col.formatHex();
              fillCol = strokeColor;
            }

            const strokeW = isMajor ? 1.0 : 0.3;

            let labelPt = null;
            let labelAngle = 0;
            if (isMajor && !isPerspective && c.coordinates.length > 0) {
              try {
                const firstPoly = c.coordinates[0] as any[];
                if (firstPoly && firstPoly.length > 0) {
                  const ring = firstPoly[0];
                  if (ring && ring.length > 10) {
                    const factor = 0.15 + ((i % 5) * 0.15);
                    const midIdx = Math.floor(ring.length * factor);
                    const pt1 = ring[midIdx];
                    const pt2 = ring[midIdx + 1];
                    if (pt1 && pt2 && typeof pt1[0] === 'number') {
                      labelPt = { X: pt1[0], Y: pt1[1] };
                      labelAngle = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]) * (180 / Math.PI);
                      if (labelAngle > 90 || labelAngle < -90) labelAngle += 180;
                    }
                  }
                }
              } catch (e) {
                // Ignore parsing errors for labels
              }
            }

            return (
              <g key={i} transform={getMatrix(c.value)}>
                <path
                  d={geoPath(c) as string}
                  fill={fillCol}
                  fillOpacity={isPerspective ? "0" : (isMajor ? "0.15" : "0.05")}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  strokeOpacity={strokeOp}
                  vectorEffect="non-scaling-stroke"
                />
                {showContourLabels && labelPt && (
                  <text
                    x={labelPt.X}
                    y={labelPt.Y}
                    transform={`rotate(${labelAngle}, ${labelPt.X}, ${labelPt.Y})`}
                    fill={strokeColor}
                    fontSize="1.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                    dy="-0.5"
                    className="pointer-events-none"
                    style={{ textShadow: "0px 0px 1px var(--theme-bg-base)", fontSize: "1.5px" }}
                  >
                    {c.value.toFixed(1)}m
                  </text>
                )}
              </g>
            );
          })}

          {/* Vías Extruidas (2.5D visual) */}
          {layerVisibility.highways && highways3D.map((hw, i) => (
            <path
              key={`h-${i}`}
              d={render3DPath(hw.pts, false)}
              fill="none"
              stroke="var(--theme-text-main)"
              strokeWidth={hw.width}
              strokeLinecap="round"
              strokeOpacity="0.7"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Cursos de Agua */}
          {layerVisibility.waterways && waterways3D.map((ww, i) => (
            <path
              key={`w-${i}`}
              d={render3DPath(ww.pts, false)}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={ww.width}
              strokeLinecap="round"
              strokeOpacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          ))}

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

          {/* Huellas de Edificios de Contexto OSM */}
          {layerVisibility.buildings && buildings3D.map((obj, i) => {
            const { pts, height } = obj;
            const roofPts = pts.map(p => ({ ...p, elev: p.elev + height }));
            const pathRoof = render3DPath(roofPts, true);

            return (
              <g key={`b-group-${i}`}>
                {/* Paredes de los edificios (extrusión 2.5D) */}
                {isPerspective && pts.map((p, j) => {
                  const pNext = pts[(j + 1) % pts.length];
                  const rNext = roofPts[(j + 1) % pts.length];
                  const rp = roofPts[j];

                  const ptsWall = [p, pNext, rNext, rp];
                  const dWall = render3DPath(ptsWall, true);

                  return (
                    <path
                      key={j}
                      d={dWall}
                      fill="var(--theme-accent)"
                      fillOpacity="0.4"
                      stroke="var(--theme-accent)"
                      strokeWidth="0.1"
                      strokeOpacity="0.5"
                    />
                  );
                })}

                {/* Techo */}
                <path
                  d={pathRoof}
                  fill="var(--theme-accent)"
                  fillOpacity="0.6"
                  stroke="var(--theme-accent)"
                  strokeWidth="0.8"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* MODO OGUC: Sombras Comparativas (Módulo 3), Lote, Rasantes (Módulo 2) y Volumen Escalonado */}
          {analysisMode === 'oguc' && ogucModel && (
            <g>
              {/* 1. SOMBRAS COMPARATIVAS (MÓDULO 3): Sombra Teórica Permitida (Cian) vs Sombra Propuesta (Rojo/Magenta) */}
              {activeOgucParams.showShadows && !ogucModel.collapsed && (
                <g className="oguc-comparative-shadows pointer-events-none">
                  {/* Sombra Teórica Normativa (Envolvente máxima permitida) - Azul/Cian */}
                  {ogucModel.shadows.theoreticalPolygons.map((shadowPoly, k) => (
                    <path
                      key={`oguc-theo-shadow-${k}`}
                      d={render3DPath(shadowPoly, true)}
                      fill="#06b6d4"
                      fillOpacity="0.16"
                      stroke="#38bdf8"
                      strokeWidth={1.1}
                      strokeDasharray="3,2"
                      strokeOpacity="0.85"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {/* Sombra del Volumen Propuesto - Rojo/Magenta */}
                  {ogucModel.shadows.proposedPolygons.map((shadowPoly, k) => (
                    <path
                      key={`oguc-prop-shadow-${k}`}
                      d={render3DPath(shadowPoly, true)}
                      fill="#f43f5e"
                      fillOpacity="0.24"
                      stroke="#ef4444"
                      strokeWidth={1.1}
                      strokeOpacity="0.85"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              )}

              {/* 2. POLÍGONO DE LOTE */}
              {!isDrawingLot && ogucModel.lotPolygon.length >= 3 && (
                <g>
                  <path
                    d={render3DPath(ogucModel.lotPolygon, true)}
                    fill="#ec4899"
                    fillOpacity="0.05"
                    stroke="#ec4899"
                    strokeWidth={1.4}
                    strokeDasharray="4,2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {ogucModel.lotPolygon.map((pt, idx) => {
                    const proj = projectPoint(pt.x, pt.y, pt.elev);
                    return (
                      <circle
                        key={`lot-v-${idx}`}
                        cx={proj.X}
                        cy={proj.Y}
                        r={1.1 / Math.max(0.5, zoomK)}
                        fill="#ec4899"
                      />
                    );
                  })}
                </g>
              )}

              {/* 3. VOLUMEN PROPUESTO (CON ESCALONAMIENTO ART. 2.6.12 Y PLACA CONTINUA) + ARRASTRE REACTIVO */}
              {!ogucModel.collapsed && ogucModel.tiers.length > 0 && (() => {
                const handleVolumePointerDown = (e: React.PointerEvent) => {
                  if (isDrawingLot || e.button !== 0) return;
                  e.stopPropagation();

                  const startGrid = screenToGrid(e.clientX, e.clientY);
                  if (!startGrid) return;

                  isDraggingVolumeRef.current = true;
                  dragStartRef.current = {
                    cx: startGrid.x,
                    cy: startGrid.y,
                    ox: dragOffset.x,
                    oy: dragOffset.y,
                  };

                  const handleMove = (ev: PointerEvent) => {
                    if (!isDraggingVolumeRef.current) return;
                    const currGrid = screenToGrid(ev.clientX, ev.clientY);
                    if (!currGrid) return;

                    const dx = currGrid.x - dragStartRef.current.cx;
                    const dy = currGrid.y - dragStartRef.current.cy;

                    setDragOffset({
                      x: dragStartRef.current.ox + dx,
                      y: dragStartRef.current.oy + dy,
                    });
                  };

                  const handleUp = () => {
                    isDraggingVolumeRef.current = false;
                    window.removeEventListener('pointermove', handleMove);
                    window.removeEventListener('pointerup', handleUp);
                  };

                  window.addEventListener('pointermove', handleMove);
                  window.addEventListener('pointerup', handleUp);
                };

                return (
                  <g
                    onPointerDown={handleVolumePointerDown}
                    className={!isDrawingLot ? 'cursor-grab active:cursor-grabbing' : ''}
                  >
                    {ogucModel.tiers.map((tier) => {
                      const { basePts, roofPts, id } = tier;
                      if (basePts.length < 3) return null;

                      const cxBase = basePts.reduce((s, p) => s + p.x, 0) / basePts.length;
                      const cyBase = basePts.reduce((s, p) => s + p.y, 0) / basePts.length;

                      const isUpper = id === 'upper_stepped';
                      const isContinuous = id === 'continuous';

                      // Build wall quads and sort back-to-front in perspective
                      const walls = basePts.map((p, j) => {
                        const pNext = basePts[(j + 1) % basePts.length];
                        const rNext = roofPts[(j + 1) % roofPts.length];
                        const rp = roofPts[j];

                        const midX = (p.x + pNext.x) / 2;
                        const midY = (p.y + pNext.y) / 2;
                        const dx = midX - cxBase;
                        const dy = midY - cyBase;

                        let fillColor = isUpper ? '#d97706' : isContinuous ? '#64748b' : '#b45309'; // Oriente/Poniente
                        let fillOpacity = isContinuous ? '0.45' : '0.68';
                        const strokeColor = isUpper ? '#fcd34d' : isContinuous ? '#94a3b8' : '#f59e0b';

                        if (Math.abs(dy) >= Math.abs(dx)) {
                          if (dy >= 0) {
                            // Cara Sur (+Y): más oscura para enfatizar orientación
                            fillColor = isUpper ? '#78350f' : isContinuous ? '#334155' : '#92400e';
                            fillOpacity = '0.88';
                          } else {
                            // Cara Norte (-Y): más iluminada
                            fillColor = isUpper ? '#fde68a' : isContinuous ? '#94a3b8' : '#fbbf24';
                            fillOpacity = '0.42';
                          }
                        }

                        const projMid = projectPoint(midX, midY, (p.elev + rp.elev) / 2);
                        return {
                          j,
                          quad: [p, pNext, rNext, rp],
                          fillColor,
                          fillOpacity,
                          strokeColor,
                          depthY: projMid.Y,
                        };
                      });

                      if (isPerspective) {
                        walls.sort((a, b) => a.depthY - b.depthY);
                      }

                      return (
                        <g key={`tier-${id}`}>
                          {isPerspective &&
                            walls.map((w) => (
                              <path
                                key={`wall-${id}-${w.j}`}
                                d={render3DPath(w.quad, true)}
                                fill={w.fillColor}
                                fillOpacity={w.fillOpacity}
                                stroke={w.strokeColor}
                                strokeWidth="0.6"
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          <path
                            d={render3DPath(roofPts, true)}
                            fill={isUpper ? '#fbbf24' : isContinuous ? '#94a3b8' : '#f59e0b'}
                            fillOpacity={isContinuous ? '0.35' : '0.75'}
                            stroke={isUpper ? '#fef08a' : '#f59e0b'}
                            strokeWidth={isUpper ? 1.2 : 0.9}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })()}

              {/* 4. PLANOS DE RASANTES REALES INCLINADOS (MÓDULO 2 - Art. 2.6.3) */}
              {!ogucModel.collapsed && ogucModel.rasantePlanes.length > 0 && (
                <g className="oguc-rasante-planes pointer-events-none">
                  {ogucModel.rasantePlanes.map((plane, idx) => {
                    const isSur = plane.orientation === 'Sur';
                    const planeColor = isSur ? '#f97316' : '#38bdf8';
                    const quad = [plane.p1, plane.p2, plane.top2, plane.top1];
                    const midLabelPt = projectPoint(
                      plane.midBase.x,
                      plane.midBase.y,
                      plane.midBase.elev
                    );
                    return (
                      <g key={`rasante-plane-${idx}`}>
                        {/* Línea vertical de arranque de rasante desde el suelo (rasanteStartHeight) */}
                        {isPerspective && activeOgucParams.rasanteStartHeight > 0 && (
                          <>
                            <path
                              d={render3DPath(
                                [
                                  {
                                    x: plane.p1.x,
                                    y: plane.p1.y,
                                    elev: plane.p1.elev - activeOgucParams.rasanteStartHeight,
                                  },
                                  plane.p1,
                                ],
                                false
                              )}
                              fill="none"
                              stroke="#ec4899"
                              strokeWidth="0.7"
                              strokeDasharray="1,1"
                              vectorEffect="non-scaling-stroke"
                            />
                            <path
                              d={render3DPath([plane.p1, plane.p2], false)}
                              fill="none"
                              stroke={planeColor}
                              strokeWidth="1"
                              strokeOpacity="0.8"
                              vectorEffect="non-scaling-stroke"
                            />
                          </>
                        )}
                        {/* Plano inclinado de rasante */}
                        {isPerspective && (
                          <path
                            d={render3DPath(quad, true)}
                            fill={planeColor}
                            fillOpacity="0.11"
                            stroke={planeColor}
                            strokeWidth="0.9"
                            strokeDasharray="3,2"
                            strokeOpacity="0.75"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {/* Etiqueta de ángulo y orientación por fachada */}
                        <text
                          x={midLabelPt.X}
                          y={midLabelPt.Y}
                          fill={planeColor}
                          fontSize={Math.max(1.8, 3.2 / Math.sqrt(Math.max(0.5, zoomK)))}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                          dy="-1.5"
                          style={{ textShadow: '0px 0px 2px var(--theme-bg-base)' }}
                        >
                          {plane.orientation} {plane.angleDeg}°
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </g>
          )}

          {/* MODO DIBUJO LIBRE DE LOTE: Previsualización interactiva desde el 1er vértice (Prioridad 1) */}
          {isDrawingLot && (
            <g className="lot-drawing-overlay pointer-events-none">
              {customLotPts && customLotPts.length >= 1 && (
                <>
                  <path
                    d={render3DPath(
                      [
                        ...customLotPts,
                        ...(drawingCursor
                          ? [
                              {
                                x: drawingCursor.x,
                                y: drawingCursor.y,
                                elev:
                                  getGridElevAt(drawingCursor.x, drawingCursor.y) ??
                                  (meshData?.minEv || 0),
                              },
                            ]
                          : []),
                      ],
                      false
                    )}
                    fill="rgba(236, 72, 153, 0.12)"
                    stroke="#ec4899"
                    strokeWidth="1.8"
                    strokeDasharray="3,2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {customLotPts.map((pt, i) => {
                    const proj = projectPoint(pt.x, pt.y, pt.elev);
                    const isFirst = i === 0 && customLotPts.length >= 3;
                    return (
                      <g key={`draw-pt-${i}`}>
                        {isFirst && (
                          <circle
                            cx={proj.X}
                            cy={proj.Y}
                            r={3.2 / Math.max(0.5, zoomK)}
                            fill="none"
                            stroke="#ec4899"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        <circle
                          cx={proj.X}
                          cy={proj.Y}
                          r={1.4 / Math.max(0.5, zoomK)}
                          fill={isFirst ? '#fff' : '#ec4899'}
                          stroke="#ec4899"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    );
                  })}
                </>
              )}
              {drawingCursor && (
                (() => {
                  const cElev =
                    getGridElevAt(drawingCursor.x, drawingCursor.y) ?? (meshData?.minEv || 0);
                  const cProj = projectPoint(drawingCursor.x, drawingCursor.y, cElev);
                  return (
                    <circle
                      cx={cProj.X}
                      cy={cProj.Y}
                      r={1.2 / Math.max(0.5, zoomK)}
                      fill="#ec4899"
                      opacity="0.85"
                    />
                  );
                })()
              )}
            </g>
          )}

          {/* MODO SOLAR: Proyecto y Arco Solar */}
          {analysisMode === 'solar' && (
            <g>
              {projectVolume && !projectVolume.collapsed && solarParams?.showShadows && (() => {
                const shadow = getSolarShadowPolygon(projectVolume.pts, projectVolume.height);
                return shadow && (
                  <path
                    d={render3DPath(shadow, true)}
                    fill="var(--theme-shadow-solar)"
                    fillOpacity="0.35"
                    className="pointer-events-none"
                  />
                );
              })()}

              {/* Lote y Volumen en Modo Solar */}
              {lotPolygon && (
                <path
                  d={render3DPath(lotPolygon, true)}
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {ogucModel && !ogucModel.collapsed && ogucModel.tiers.map((tier) => {
                const { basePts, roofPts, id } = tier;
                const pathRoof = render3DPath(roofPts, true);
                return (
                  <g key={`solar-tier-${id}`}>
                    {isPerspective && basePts.map((p, j) => {
                      const pNext = basePts[(j + 1) % basePts.length];
                      const rNext = roofPts[(j + 1) % roofPts.length];
                      const rp = roofPts[j];
                      return (
                        <path
                          key={j}
                          d={render3DPath([p, pNext, rNext, rp], true)}
                          fill="#f59e0b"
                          fillOpacity="0.5"
                          stroke="#f59e0b"
                          strokeWidth="0.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    })}
                    <path
                      d={pathRoof}
                      fill="#f59e0b"
                      fillOpacity="0.7"
                      stroke="#f59e0b"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {/* Heliodon: Guías (Horizonte, Elevaciones, Meridiano) en PERSPECTIVA */}
              {isPerspective && heliodonGuides && (
                <g className="heliodon-guides">
                  <path d={render3DPath(heliodonGuides.horizonPts, true)} fill="none" stroke="var(--theme-text-muted)" strokeWidth="1" strokeDasharray="2,4" opacity="0.4" />
                  {heliodonGuides.elevLines.map((pts, i) => (
                    <path key={`el-line-${i}`} d={render3DPath(pts, true)} fill="none" stroke="var(--theme-text-muted)" strokeWidth="0.5" opacity="0.2" />
                  ))}
                  <path d={render3DPath(heliodonGuides.northLine, false)} fill="none" stroke="var(--theme-text-muted)" strokeWidth="1" opacity="0.3" />
                  {heliodonGuides.cardinals.map((c, i) => {
                    const p = projectPoint(c.x, c.y, c.elev);
                    return (
                      <text key={`cardinal-${i}`} x={p.X} y={p.Y} fill="var(--theme-text-faded)" fontSize="8" fontWeight="bold" textAnchor="middle" dy="3" opacity="0.7">
                        {c.label}
                      </text>
                    );
                  })}
                </g>
              )}

              {/* Heliodon: Arcos Solares en PERSPECTIVA */}
              {isPerspective && solarParams?.showSunPath && sunPaths && currentSunPos && (
                <g>
                  {sunPaths.map((pathObj, k) => (
                    <path
                      key={`sun-path-${k}`}
                      d={render3DPath(pathObj.pts, false)}
                      fill="none"
                      stroke={pathObj.color}
                      strokeWidth="2"
                      strokeOpacity="0.8"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {(() => {
                    const p = projectPoint(currentSunPos.x, currentSunPos.y, currentSunPos.elev);
                    if (sunPosition && sunPosition.elevation > 0) {
                      return (
                        <g transform={`translate(${p.X}, ${p.Y})`}>
                          <circle r="5" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                          <circle r="12" fill="#fbbf24" opacity="0.3" vectorEffect="non-scaling-stroke" />
                          <circle r="20" fill="#fbbf24" opacity="0.1" vectorEffect="non-scaling-stroke" />
                        </g>
                      );
                    }
                    return null;
                  })()}
                </g>
              )}
            </g>
          )}
        </g>

        {/* HUD Overlay 2D para PLANTA (Fuera de zoomGroupRef) */}
        {!isPerspective && analysisMode === 'solar' && solarParams?.showSunPath && (
          <g className="heliodon-hud-plan pointer-events-none">
            {/* Guías HUD */}
            {heliodonGuides && (
              <g opacity="0.6">
                <path d={`M ${heliodonGuides.horizonPts.map(p => `${p.x},${p.y}`).join(' L ')} Z`} fill="none" stroke="var(--theme-text-muted)" strokeWidth="1" strokeDasharray="2,4" />
                {heliodonGuides.elevLines.map((pts, i) => (
                  <path key={`hud-el-${i}`} d={`M ${pts.map(p => `${p.x},${p.y}`).join(' L ')} Z`} fill="none" stroke="var(--theme-text-muted)" strokeWidth="0.5" opacity="0.4" />
                ))}
                <path d={`M ${heliodonGuides.northLine.map(p => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke="var(--theme-text-muted)" strokeWidth="1" opacity="0.5" />
                {heliodonGuides.cardinals.map((c, i) => (
                  <text key={`hud-c-${i}`} x={c.x} y={c.y} fill="var(--theme-text-faded)" fontSize="8" fontWeight="bold" textAnchor="middle" dy="3">
                    {c.label}
                  </text>
                ))}
              </g>
            )}

            {/* Arcos Solares HUD */}
            {sunPaths && sunPaths.map((pathObj, k) => (
              <path
                key={`hud-path-${k}`}
                d={`M ${pathObj.pts.map(p => `${p.x},${p.y}`).join(' L ')}`}
                fill="none"
                stroke={pathObj.color}
                strokeWidth="2"
                opacity="0.8"
              />
            ))}

            {/* Sol actual HUD */}
            {currentSunPos && sunPosition && sunPosition.elevation > 0 && (
              <g transform={`translate(${currentSunPos.x}, ${currentSunPos.y})`}>
                <circle r="5" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
                <circle r="12" fill="#fbbf24" opacity="0.3" />
              </g>
            )}
          </g>
        )}
      </svg>

      {/* HUD Metrics & Bottom Controls */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end z-20 pointer-events-none">

        {/* Left Side: Metrics & Didactic Legend */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-faded uppercase tracking-widest font-mono bg-bg-base/90 px-2 py-1 rounded-sm border border-border-main backdrop-blur-sm transition-colors duration-300">
              Proyección: {isPerspective ? 'Caballete Isométrica 2.5D' : 'Ortogonal 2D (Planta)'}
            </span>
            <span className="text-[10px] text-text-faded uppercase tracking-widest font-mono bg-bg-base/90 px-2 py-1 rounded-sm border border-border-main backdrop-blur-sm transition-colors duration-300 text-accent">
              {isDrawingLot ? 'Modo Dibujo: Clic para vértices • Doble clic o 1er punto para cerrar' : 'Zoom/Pan: Scroll y Arrastrar • Volumen arrastrable'}
            </span>
          </div>

          <div className="bg-bg-surface/95 border border-border-main p-3 rounded-sm backdrop-blur-sm shadow-lg w-72 mt-2 pointer-events-auto">
            {analysisMode === 'topographic' && (
              <>
                <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2 border-b border-border-main pb-1">Leyenda Topográfica</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main">
                    <span className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-text-main"></div> Curvas Maestras</span>
                    <span>Cada {(interval * masterIntervalCount).toFixed(1)}m</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded">
                    <span className="flex items-center gap-1.5"><div className="w-4 h-[1px] bg-text-muted"></div> Curvas Intermedias</span>
                    <span>Cada {interval}m</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded pt-1 border-t border-border-faded">
                    <span>Rango Visible</span>
                    <span>{contours.length > 0 ? `${contours[0].value.toFixed(1)}m - ${contours[contours.length - 1].value.toFixed(1)}m` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded">
                    <span>Total Isolíneas</span>
                    <span>{contours.length}</span>
                  </div>
                </div>
                <p className="text-[8px] text-text-subtle uppercase tracking-widest mt-3 leading-relaxed">
                  Las curvas agrupadas indican mayor pendiente. Las curvas separadas denotan un terreno llano.
                </p>
              </>
            )}

            {analysisMode === 'oguc' && ogucModel && (
              <>
                <div className="flex justify-between items-center mb-2 border-b border-border-main pb-1">
                  <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest">Análisis Normativo OGUC</h3>
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-xs bg-accent/15 text-accent font-bold">
                    {ogucModel.regionInfo.name}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main">
                    <span className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-[#ec4899]/30 border border-[#ec4899]"></div> Polígono de Lote
                    </span>
                    <span className="font-bold">{Math.round(ogucModel.lotAreaM2)} m²</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main">
                    <span className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-[#f59e0b]/70 border border-[#f59e0b]"></div> Volumen Propuesto
                    </span>
                    <span className="font-bold">h = {ogucModel.effectiveHeight.toFixed(1)}m</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded pt-1 border-t border-border-faded">
                    <span>Rasantes (Sur / O-P)</span>
                    <span className="text-text-main font-semibold">
                      {ogucModel.regionInfo.surAngle}° / {ogucModel.regionInfo.opAngle}° (Arr. {activeOgucParams.rasanteStartHeight}m)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded">
                    <span>Distanciamiento</span>
                    <span className="text-text-main">
                      {activeOgucParams.minSetback}m
                      {ogucModel.extraSetbackMeters > 0
                        ? ` → ${ogucModel.totalUpperSetbackMeters.toFixed(1)}m (>10.5m)`
                        : ''}
                    </span>
                  </div>

                  {activeOgucParams.showShadows && !ogucModel.collapsed && (
                    <div className="mt-2 pt-2 border-t border-border-main space-y-1.5">
                      <div className="text-[8px] font-bold uppercase tracking-wider text-text-faded">
                        Comparativa de Sombras (Módulo 3)
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-mono">
                        <span className="flex items-center gap-1.5 text-[#38bdf8]">
                          <div className="w-2.5 h-2.5 bg-[#06b6d4]/30 border border-[#38bdf8] border-dashed"></div>
                          Sombra Permitida
                        </span>
                        <span className="font-bold text-[#38bdf8]">
                          {Math.round(ogucModel.shadows.allowedAreaM2)} m²
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-mono">
                        <span className="flex items-center gap-1.5 text-[#f43f5e]">
                          <div className="w-2.5 h-2.5 bg-[#f43f5e]/40 border border-[#ef4444]"></div>
                          Sombra Propuesta
                        </span>
                        <span className="font-bold text-[#f43f5e]">
                          {Math.round(ogucModel.shadows.proposedAreaM2)} m²
                        </span>
                      </div>
                      <div
                        className={`mt-1 px-2 py-1 rounded-xs text-[8px] font-mono font-bold uppercase tracking-wider flex items-center justify-between ${
                          ogucModel.shadows.complies
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        <span>
                          {ogucModel.shadows.complies
                            ? '✓ Cumple Sombra OGUC'
                            : '⚠ Excede Sombra Teórica'}
                        </span>
                        <span>{ogucModel.shadows.complianceRatio.toFixed(0)}%</span>
                      </div>
                    </div>
                  )}

                  {ogucModel.collapsed && (
                    <div className="mt-2 p-1.5 rounded-xs bg-rose-500/15 border border-rose-500/30 text-[8px] text-rose-400 font-mono">
                      Aviso: El distanciamiento ({activeOgucParams.minSetback}m) supera el ancho del lote. Reduce el distanciamiento o dibuja un lote mayor.
                    </div>
                  )}
                </div>
              </>
            )}

            {analysisMode === 'solar' && (
              <>
                <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2 border-b border-border-main pb-1">Análisis Solar</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded">
                    <span>Latitud</span>
                    <span>{locationLat?.toFixed(4)}º</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded">
                    <span>Longitud</span>
                    <span>{locationLon?.toFixed(4)}º</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main pt-1 border-t border-border-faded">
                    <span>Altura Solar (Elev)</span>
                    <span className={sunPosition && sunPosition.elevation > 0 ? "text-[#f59e0b]" : "text-text-muted"}>
                      {sunPosition ? sunPosition.elevation.toFixed(1) : '--'}º
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main">
                    <span>Acimut</span>
                    <span>{sunPosition ? sunPosition.azimuth.toFixed(1) : '--'}º</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border-faded">
                  <h4 className="text-[9px] font-bold text-text-main mb-1 uppercase tracking-wider">Heliodon (Bóveda Celeste)</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[8px] font-mono text-text-faded">
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#f87171]"></div> Solsticio Verano</span>
                      <span>21 Dic</span>
                    </div>
                    <div className="flex justify-between items-center text-[8px] font-mono text-text-faded">
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div> Equinoccio</span>
                      <span>21 Mar / 21 Sep</span>
                    </div>
                    <div className="flex justify-between items-center text-[8px] font-mono text-text-faded">
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#60a5fa]"></div> Solsticio Invierno</span>
                      <span>21 Jun</span>
                    </div>
                  </div>
                </div>
                <p className="text-[8px] text-text-subtle uppercase tracking-widest mt-3 leading-relaxed">
                  La posición astronómica y sombras se calculan a tiempo real según la fecha y hora seleccionada.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Right Side: 3D Controls */}
        <div className="flex pointer-events-auto items-end">
          {/* Orbit Controls (only in perspective) */}
          <div
            className={`flex flex-col bg-bg-surface p-3 rounded-sm border border-border-main shadow-lg w-[240px] transition-all duration-300 origin-bottom-right ${isPerspective ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none translate-x-4 absolute right-0 bottom-0'}`}
          >
            <div className="flex justify-between items-center mb-3 border-b border-border-main pb-2">
              <span className="text-[10px] text-accent font-bold uppercase tracking-widest flex items-center gap-1.5">
                <RotateCw size={12} className={isAutoOrbit ? "animate-spin" : ""} style={{ animationDuration: '3s' }} /> Rotación 3D Libre
              </span>
              <button
                onClick={() => setIsAutoOrbit(!isAutoOrbit)}
                className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-sm transition-colors flex items-center gap-1 ${isAutoOrbit ? 'bg-accent text-white shadow-inner' : 'bg-bg-elevated text-text-faded hover:text-text-main'}`}
              >
                {isAutoOrbit ? 'Pausar' : 'Órbita'}
              </button>
            </div>

            {/* Yaw Slider */}
            <div className="flex justify-between items-center w-full px-1 mb-3 gap-3">
              <label className="text-[8px] text-text-subtle font-bold uppercase tracking-wider w-16">Acimut (Z)</label>
              <input
                type="range" min="0" max="360"
                value={(rotation.z % 360 + 360) % 360}
                onChange={(e) => { setIsAutoOrbit(false); setRotation(p => ({ ...p, z: Number(e.target.value) })); }}
                onMouseDown={() => setIsDraggingSlider(true)} onMouseUp={() => setIsDraggingSlider(false)}
                onTouchStart={() => setIsDraggingSlider(true)} onTouchEnd={() => setIsDraggingSlider(false)}
                className="flex-1 accent-accent cursor-ew-resize h-[3px] bg-border-faded rounded-full appearance-none outline-none"
              />
              <span className="text-[9px] text-accent font-mono font-bold w-6 text-right">{Math.round((rotation.z % 360 + 360) % 360)}º</span>
            </div>

            {/* Pitch Slider */}
            <div className="flex justify-between items-center w-full px-1 gap-3">
              <label className="text-[8px] text-text-subtle font-bold uppercase tracking-wider w-16">Inclin. (X)</label>
              <input
                type="range" min="0" max="90"
                value={rotation.x}
                onChange={(e) => { setIsDraggingSlider(true); setRotation(p => ({ ...p, x: Number(e.target.value) })); }}
                onMouseUp={() => setIsDraggingSlider(false)} onTouchEnd={() => setIsDraggingSlider(false)}
                className="flex-1 accent-accent cursor-ew-resize h-[3px] bg-border-faded rounded-full appearance-none outline-none"
              />
              <span className="text-[9px] text-accent font-mono font-bold w-6 text-right">{Math.round(rotation.x)}º</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
