import React, { useMemo, useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Map, Layers, ZoomIn, ZoomOut, Maximize, RotateCw, Download } from 'lucide-react';
import { MeshData } from '../lib/meshProcessor';
import { AnalysisMode } from '../App';
import { getSunPosition } from '../lib/SunPosition';

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
  ogucParams?: {
    regionGroup: 1 | 2 | 3;
    rasanteStartHeight: number;
    minSetback: number;
    applyExtraSetback: boolean;
    maxHeight: number;
    continuousBaseHeight: number;
    showShadows: boolean;
    angle: number; // For fallback until Module 2 is complete
  };
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

const insetPolygonBisector = (pts: {x: number, y: number}[], offsetMeters: number, meshData: any, n: number) => {
    if (pts.length < 3) return pts;
    
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        let j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    const isClockwise = area > 0;
    const sign = isClockwise ? 1 : -1;

    const offsetGrid = meshData && n > 0 ? offsetMeters * (n / meshData.w) : offsetMeters;
    
    const newPts = [];
    for (let i = 0; i < pts.length; i++) {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const curr = pts[i];
        const next = pts[(i + 1) % pts.length];

        let v1x = curr.x - prev.x;
        let v1y = curr.y - prev.y;
        const len1 = Math.hypot(v1x, v1y);
        v1x /= len1; v1y /= len1;

        let v2x = next.x - curr.x;
        let v2y = next.y - curr.y;
        const len2 = Math.hypot(v2x, v2y);
        v2x /= len2; v2y /= len2;

        const n1x = -v1y * sign;
        const n1y = v1x * sign;
        
        const n2x = -v2y * sign;
        const n2y = v2x * sign;

        let bx = n1x + n2x;
        let by = n1y + n2y;
        const blen = Math.hypot(bx, by);
        
        if (blen < 0.0001) {
            bx = n1x; by = n1y;
        } else {
            bx /= blen; by /= blen;
        }

        const dot = n1x * bx + n1y * by;
        const dist = Math.abs(dot) > 0.05 ? offsetGrid / dot : offsetGrid;

        newPts.push({
            x: curr.x + bx * dist,
            y: curr.y + by * dist,
        });
    }
    
    let newArea = 0;
    for (let i = 0; i < newPts.length; i++) {
        let j = (i + 1) % newPts.length;
        newArea += newPts[i].x * newPts[j].y - newPts[j].x * newPts[i].y;
    }
    if ((isClockwise && newArea <= 0) || (!isClockwise && newArea >= 0)) {
        return null;
    }
    
    return newPts;
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
          const pts = [];
          for (let i = 0; i < el.geometry.length - 1; i++) {
            const p1 = el.geometry[i];
            const p2 = el.geometry[i + 1];

            const d2 = Math.pow((p2.lon - p1.lon) * 111320, 2) + Math.pow((p2.lat - p1.lat) * 111320, 2);
            const d = Math.sqrt(d2);
            const steps = Math.max(1, Math.ceil(d / 20));

            for (let s = 0; s <= steps; s++) {
              if (s === steps && i < el.geometry.length - 2) continue;

              const f = s / steps;
              const lon = p1.lon + (p2.lon - p1.lon) * f;
              const lat = p1.lat + (p2.lat - p1.lat) * f;
              const clampedLon = Math.max(minLon, Math.min(maxLon, lon));
              const clampedLat = Math.max(minLat, Math.min(maxLat, lat));
              const x = ((clampedLon - minLon) / widthSpan) * (n - 1);
              const y = ((maxLat - clampedLat) / heightSpan) * (m - 1);
              const elev = getElevAt(clampedLon, clampedLat);
              pts.push({ x, y, elev: elev + 0.08 });
            }
          }
          if (pts.length > 0) {
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

  const lotPolygon = useMemo(() => {
    if (analysisMode !== 'oguc' || !ogucParams) return null;
    if (!customLotPts || customLotPts.length < 3) return null;
    
    return customLotPts.map(p => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y)
    }));
  }, [n, m, analysisMode, ogucParams, meshData, dragOffset, customLotPts]);

  const projectVolume = useMemo(() => {
    if (analysisMode !== 'oguc' || !ogucParams) return null;
    if (!customLotPts || customLotPts.length < 3) return null;
    
    const inset = insetPolygonBisector(customLotPts, ogucParams.minSetback, meshData, n);
    console.log('inset result:', inset, 'minSetback:', ogucParams.minSetback);
    if (!inset) return { pts: [], height: 0, collapsed: true };
    
    const pts = inset.map(p => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y) ?? (meshData?.minEv || 0)
    }));
    const calcHeight = ogucParams.minSetback * Math.tan(ogucParams.angle * Math.PI / 180);
    const height = Math.min(calcHeight, ogucParams.maxHeight);
    
    return { pts, height, collapsed: false };
  }, [n, m, analysisMode, ogucParams, meshData, dragOffset, customLotPts]);

  // ConvHull helper for shadows
  const convexHull = (points: { x: number, y: number, elev: number }[]) => {
    if (points.length <= 3) return points;
    const pts = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o: any, a: any, b: any) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  };

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
    return convexHull(allPts);
  };

  const getOgucShadowPolygon = (pts: { x: number, y: number, elev: number }[], height: number, angleDeg: number, orientation: number) => {
    const angleRad = angleDeg * Math.PI / 180;
    const Vz = Math.tan(angleRad);
    const Vx = Math.sin(orientation * Math.PI / 180);
    const Vy = -Math.cos(orientation * Math.PI / 180);

    const projectedPts = pts.map(p => {
      const z0 = meshData?.minEv || 0;
      const dz = (p.elev + height) - z0;
      const t = dz / Vz;
      const realDx = Vx * t;
      const realDy = Vy * t;
      const mapDx = meshData ? (realDx / meshData.w) * n : realDx;
      const mapDy = meshData ? (realDy / meshData.h) * m : realDy;
      return { x: p.x + mapDx, y: p.y + mapDy, elev: z0 };
    });

    const allPts = [...pts.map(p => ({ ...p, elev: meshData?.minEv || 0 })), ...projectedPts];
    return convexHull(allPts);
  };

  const polygonArea = (pts: { x: number, y: number }[]) => {
    if (!pts || pts.length < 3) return 0;
    let area = 0;
    const w = meshData?.w || 100;
    const h = meshData?.h || 100;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const x1 = (pts[i].x / n) * w;
      const y1 = (pts[i].y / m) * h;
      const x2 = (pts[j].x / n) * w;
      const y2 = (pts[j].y / m) * h;
      area += (x2 + x1) * (y2 - y1);
    }
    return Math.abs(area / 2);
  };

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
      .scaleExtent([0.3, 40])
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
        className={`w-full h-full object-contain origin-center overflow-visible z-10 drop-shadow-[0_0_15px_rgba(197,160,89,0.15)] ${isDrawingLot ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={(e) => {
          if (isDrawingLot) {
            if (isPerspective) {
               alert("El dibujo de lote está disponible en vista Planta.");
               if (setIsDrawingLot) setIsDrawingLot(false);
               return;
            }
            e.preventDefault();
            e.stopPropagation();
            
            if (!zoomGroupRef.current) return;
            const pt = d3.pointer(e.nativeEvent, zoomGroupRef.current);
            const svgX = pt[0];
            const svgY = pt[1];
            
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
            if (det === 0) return;
            
            const cx = (n - 1) / 2;
            const cy = (m - 1) / 2;
            const eT = -a * cx - c * cy;
            const fT = -b * cx - d * cy;
            
            const gridX = (d * (svgX - eT) - c * (svgY - fT)) / det;
            const gridY = (a * (svgY - fT) - b * (svgX - eT)) / det;
            
            const elev = getGridElevAt(gridX, gridY) ?? (meshData?.minEv || 0);

            if (e.detail === 2) {
              if (setIsDrawingLot) setIsDrawingLot(false);
              setDrawingCursor(null);
              return;
            }

            if (customLotPts && customLotPts.length >= 2) {
              const transform = d3.zoomTransform(svgRef.current as any);
              const firstPt = customLotPts[0];
              const firstProj = projectPoint(firstPt.x, firstPt.y, firstPt.elev);
              const currProj = projectPoint(gridX, gridY, elev);
              const dist = Math.sqrt(
                Math.pow(currProj.X - firstProj.X, 2) +
                Math.pow(currProj.Y - firstProj.Y, 2)
              ) * transform.k;
              if (dist < 10) {
                if (setIsDrawingLot) setIsDrawingLot(false);
                setDrawingCursor(null);
                return;
              }
            }

            const newPts = customLotPts ? [...customLotPts] : [];
            newPts.push({ x: gridX, y: gridY, elev });
            if (setCustomLotPts) setCustomLotPts(newPts);
          } else {
            handlePointerDown(e);
          }
        }}
        onPointerMove={(e) => {
          if (isDrawingLot) {
            if (!zoomGroupRef.current) return;
            const pt = d3.pointer(e.nativeEvent, zoomGroupRef.current);
            const svgX = pt[0];
            const svgY = pt[1];

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
            if (det === 0) return;
            
            const cx = (n - 1) / 2;
            const cy = (m - 1) / 2;
            const eT = -a * cx - c * cy;
            const fT = -b * cx - d * cy;
            
            const gridX = (d * (svgX - eT) - c * (svgY - fT)) / det;
            const gridY = (a * (svgY - fT) - b * (svgX - eT)) / det;
            const elev = getGridElevAt(gridX, gridY) ?? (meshData?.minEv || 0);
            
            setDrawingCursor({ x: gridX, y: gridY });
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
                // c.coordinates for MultiPolygon is: [ [ [ [x,y], [x,y]... ] ] ]
                const firstPoly = c.coordinates[0] as any[];
                if (firstPoly && firstPoly.length > 0) {
                  // The exterior ring
                  const ring = firstPoly[0];
                  if (ring && ring.length > 10) {
                    // Stagger the label position along the ring based on contour index 'i'
                    // This prevents all labels from aligning perfectly in a straight line
                    const factor = 0.15 + ((i % 5) * 0.15); // 15%, 30%, 45%, 60%, 75%
                    const midIdx = Math.floor(ring.length * factor);
                    const pt1 = ring[midIdx];
                    const pt2 = ring[midIdx + 1];
                    if (pt1 && pt2 && typeof pt1[0] === 'number') {
                      labelPt = { X: pt1[0], Y: pt1[1] };
                      labelAngle = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]) * (180 / Math.PI);
                      // Make text upright
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
            const baseElev = meshData?.minEv || 0;
            const roofPts = pts.map(p => ({ ...p, elev: p.elev + height }));

            const pathFloor = render3DPath(pts.map(p => ({ ...p, elev: baseElev })), true);
            const pathBase = render3DPath(pts, true);
            const pathRoof = render3DPath(roofPts, true);

            return (
              <g key={`b-group-${i}`}>
                {/* Sombra removida */}

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

          {/* MODO OGUC: Lote y Proyecto */}
          {analysisMode === 'oguc' && lotPolygon && projectVolume && ogucParams && (
            <g>
              {/* Sombras OGUC: Proyecto */}
              {ogucParams.showShadows && [135, 180, 225].map((angle, k) => {
                const shadow = getOgucShadowPolygon(projectVolume.pts, projectVolume.height, ogucParams.angle, angle);
                return shadow && (
                  <path
                    key={`oguc-shadow-${k}`}
                    d={render3DPath(shadow, true)}
                    fill="#ef4444"
                    fillOpacity="0.2"
                    stroke="#ef4444"
                    strokeWidth={0.3}
                    strokeOpacity="0.5"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-none"
                  />
                );
              })}

              {/* Lote (y Previsualización del Lote Dibujado) */}
              {(isDrawingLot && customLotPts && customLotPts.length >= 1 && drawingCursor) ? (
                <g>
                   <path
                     d={render3DPath([...customLotPts, ...(drawingCursor ? [{ x: drawingCursor.x, y: drawingCursor.y, elev: getGridElevAt(drawingCursor.x, drawingCursor.y) ?? (meshData?.minEv || 0) }] : [])], false)}
                     fill="none"
                     stroke="#ec4899"
                     strokeWidth="1.5"
                     strokeDasharray="1,1"
                     vectorEffect="non-scaling-stroke"
                   />
                   {customLotPts.map((pt, i) => {
                     const proj = projectPoint(pt.x, pt.y, pt.elev);
                     return (
                       <circle key={i} cx={proj.X} cy={proj.Y} r={0.2} fill="#ec4899" vectorEffect="non-scaling-stroke" />
                     )
                   })}
                </g>
              ) : lotPolygon ? (
                <path
                  d={render3DPath(lotPolygon, true)}
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}

              {/* Volumen Proyecto */}
              {(() => {
                if (analysisMode !== 'oguc' || !projectVolume || projectVolume.collapsed) return null;
                const { pts, height } = projectVolume;
                if (pts.length < 3) return null;
                const rawRoofPts = pts.map(p => ({ ...p, elev: p.elev + height }));
                const flatRoofElev = Math.min(...rawRoofPts.map(p => p.elev));
                const roofPts = pts.map(p => ({ ...p, elev: flatRoofElev }));
                
                const isPointInPolygon = (pt: {x: number, y: number}, polygon: {x: number, y: number}[]) => {
                  let inside = false;
                  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, yi = polygon[i].y;
                    const xj = polygon[j].x, yj = polygon[j].y;
                    const intersect = ((yi > pt.y) !== (yj > pt.y))
                        && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                  }
                  return inside;
                };

                const handleVolumePointerDown = (e: React.PointerEvent) => {
                  if (isDrawingLot || (customLotPts && customLotPts.length > 0)) return; // No independiente si hay lote dibujado
                  
                  e.stopPropagation();
                  isDraggingVolumeRef.current = true;
                  dragStartRef.current = { cx: e.clientX, cy: e.clientY, ox: dragOffset.x, oy: dragOffset.y };
                  
                  const handleMove = (ev: PointerEvent) => {
                    if (!isDraggingVolumeRef.current) return;
                    const transform = d3.zoomTransform(svgRef.current as any);
                    const zK = transform.k;
                    const dX = (ev.clientX - dragStartRef.current.cx) / zK;
                    const dY = (ev.clientY - dragStartRef.current.cy) / zK;

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
                    
                    const det = a * d - b * c;
                    if (det === 0) return;

                    const dx = (d * dX - c * dY) / det;
                    const dy = (a * dY - b * dX) / det;

                    setDragOffset({
                      x: dragStartRef.current.ox + dx,
                      y: dragStartRef.current.oy + dy
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

                const cxBase = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
                const cyBase = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;

                return (
                  <g onPointerDown={handleVolumePointerDown} className={(!customLotPts || customLotPts.length === 0) && !isDrawingLot ? 'cursor-grab active:cursor-grabbing' : ''}>
                    {isPerspective && pts.map((p, j) => {
                      const pNext = pts[(j + 1) % pts.length];
                      const rNext = roofPts[(j + 1) % pts.length];
                      const rp = roofPts[j];
                      
                      const midX = (p.x + pNext.x) / 2;
                      const midY = (p.y + pNext.y) / 2;
                      const dx = midX - cxBase;
                      const dy = midY - cyBase;

                      let fillColor = "#b45309"; // Oriente/Poniente
                      let fillOpacity = "0.6";
                      let strokeColor = "#f59e0b";

                      if (Math.abs(dy) > Math.abs(dx)) {
                        if (dy > 0) {
                          // Sur (+Y)
                          fillColor = "#92400e";
                          fillOpacity = "0.85";
                          strokeColor = "#f59e0b";
                        } else {
                          // Norte (-Y)
                          fillColor = "#fbbf24";
                          fillOpacity = "0.3";
                          strokeColor = "#f59e0b";
                        }
                      }

                      return (
                        <path
                          key={j}
                          d={render3DPath([p, pNext, rNext, rp], true)}
                          fill={fillColor}
                          fillOpacity={fillOpacity}
                          stroke={strokeColor}
                          strokeWidth="0.5"
                        />
                      );
                    })}
                    <path
                      d={render3DPath(roofPts, true)}
                      fill="#f59e0b"
                      fillOpacity="0.7"
                      stroke="#f59e0b"
                      strokeWidth={0.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    {roofPts.map((rp, k) => {
                      const proj = projectPoint(rp.x, rp.y, rp.elev);
                      return <circle key={`v-${k}`} cx={proj.X} cy={proj.Y} r={0.3} fill="#f59e0b" vectorEffect="non-scaling-stroke" />;
                    })}
                  </g>
                );
              })()}
            </g>
          )}

          {/* MODO SOLAR: Proyecto y Arco Solar */}
          {analysisMode === 'solar' && (
            <g>
              {projectVolume && solarParams?.showShadows && (() => {
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

              {/* Volumen Demo */}
              {projectVolume && (() => {
                const { pts, height } = projectVolume;
                const roofPts = pts.map(p => ({ ...p, elev: p.elev + height }));
                const pathRoof = render3DPath(roofPts, true);

                return (
                  <g>
                    {isPerspective && pts.map((p, j) => {
                      const pNext = pts[(j + 1) % pts.length];
                      const rNext = roofPts[(j + 1) % pts.length];
                      const rp = roofPts[j];
                      return (
                        <path
                          key={j}
                          d={render3DPath([p, pNext, rNext, rp], true)}
                          fill="#f59e0b"
                          fillOpacity="0.5"
                          stroke="#f59e0b"
                          strokeWidth="0.5"
                        />
                      );
                    })}
                    <path
                      d={pathRoof}
                      fill="#f59e0b"
                      fillOpacity="0.7"
                      stroke="#f59e0b"
                      strokeWidth="1"
                    />
                  </g>
                );
              })()}

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
                    // Dibuja el sol solo si está sobre el horizonte
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

        {/* Info HUD */}
        {analysisMode === 'oguc' && lotPolygon && projectVolume && ogucParams && (
            <div className="absolute bottom-4 left-4 bg-bg-surface/80 backdrop-blur-md border border-border-main p-3 rounded-md text-[10px] uppercase font-mono tracking-widest text-text-main flex flex-col gap-2 min-w-[250px] shadow-lg pointer-events-none">
              <div className="border-b border-border-strong pb-2 mb-1 flex justify-between items-center">
                <span className="text-accent font-bold">Análisis Normativo OGUC</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#ec4899] inline-block rounded-sm"></span>
                <span>Polígono de Lote</span>
                <span className="ml-auto text-text-faded">{polygonArea(lotPolygon).toFixed(0)} m²</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-accent inline-block rounded-sm"></span>
                <span>Volumen Propuesto</span>
                <span className="ml-auto text-text-faded font-bold">h = {projectVolume.height.toFixed(1)}m</span>
              </div>
              <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border-faded">
                <span className="text-text-subtle">Ángulo Rasante Base</span>
                <span className="ml-auto text-text-faded">{ogucParams.angle}º</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-subtle">Distanciamiento Aplicado</span>
                <span className="ml-auto text-text-faded">{ogucParams.minSetback}m</span>
              </div>
              {projectVolume.collapsed && (
                <div className="mt-2 text-[#ef4444] leading-tight">
                  <span className="font-bold">Aviso:</span> Distanciamiento mayor al tamaño del lote. Reduce el valor para generar el volumen.
                </div>
              )}
              {!projectVolume.collapsed && (
                <div className="mt-2 text-text-subtle text-[8px] leading-tight opacity-75">
                  PARA SIMPLIFICACIÓN DOCENTE SE<br/>CONSIDERA VOLUMEN TEÓRICO BASADO EN<br/>ÁNGULO RASANTE Y DISTANCIAMIENTO UNIFORME.
                </div>
              )}
            </div>
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
              Zoom/Pan: Scroll y Arrastrar
            </span>
          </div>

          <div className="bg-bg-surface/95 border border-border-main p-3 rounded-sm backdrop-blur-sm shadow-lg w-64 mt-2 pointer-events-auto">
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

            {analysisMode === 'oguc' && (
              <>
                <h3 className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2 border-b border-border-main pb-1">Análisis Normativo OGUC</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main">
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-[#ec4899] border border-[#ec4899]"></div> Polígono de Lote</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-main">
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-[#ef4444] opacity-50 border border-[#ef4444]"></div> Volumen Propuesto</span>
                    <span>h = {ogucParams?.maxHeight}m</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-text-faded pt-1 border-t border-border-faded">
                    <span>Ángulo Rasante Base</span>
                    <span>{ogucParams?.angle}º</span>
                  </div>
                  {ogucParams?.showShadows && projectVolume && (
                    <div className="flex justify-between items-center text-[9px] font-mono text-text-faded">
                      <span>Área Sombra Aprox.</span>
                      <span>{Math.round(polygonArea(getOgucShadowPolygon(projectVolume.pts, projectVolume.height, ogucParams.angle, 135) || []))} m²</span>
                    </div>
                  )}
                </div>
                <p className="text-[8px] text-text-subtle uppercase tracking-widest mt-3 leading-relaxed">
                  Para simplificación docente se considera comparación global de áreas de sombra (Teórica / Propuesta).
                </p>
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
