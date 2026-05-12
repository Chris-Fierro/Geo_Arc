import React, { useMemo, useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Map, Layers, ZoomIn, ZoomOut, Maximize, RotateCw, Download } from 'lucide-react';
import { MeshData } from '../lib/meshProcessor';

interface ContourViewerProps {
  interval: number;
  fileName: string;
  meshData?: MeshData;
  zExaggeration?: number;
  colorPalette?: 'termico' | 'tecnico' | 'hipso';
  minVisibleElev?: number;
  maxVisibleElev?: number;
  masterIntervalCount?: number;
}

export default function ContourViewer({
  interval, fileName, meshData, zExaggeration = 1.0,
  colorPalette = 'tecnico', minVisibleElev, maxVisibleElev, masterIntervalCount = 5
}: ContourViewerProps) {
  const [viewMode, setViewMode] = useState<'plan' | 'perspective'>('plan');
  const isPerspective = viewMode === 'perspective';

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomGroupRef = useRef<SVGGElement>(null);
  const zoomBehavior = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [rotation, setRotation] = useState({ x: 60, z: 45 });
  const [isAutoOrbit, setIsAutoOrbit] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

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

    const safeInterval = Math.max(0.1, interval);

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

        // Auto-escalamiento: Si el intervalo del usuario es muy grande para la malla (ej. malla es 0.5 de alto pero intervalo es 1m)
        // o muy pequeña (malla 1000 de alto, intervalo 0.1, generaría 10000 curvas), lo ajustamos.
        if (delta / actualInterval > 120) {
          actualInterval = delta / 120; // Máximo 120 curvas de nivel funcionales
        } else if (delta / actualInterval < 5) {
          actualInterval = delta / 25; // Forzar al menos 25 curvas para apreciación estética si es muy plana
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
              pts.push({ x, y, elev });
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
      .scaleExtent([0.3, 5])
      .filter((event) => {
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
      });

    svg.call(zoomBehavior.current).on("contextmenu", (e) => {
      // Bloquear menú contextual de clic derecho para que sirva para pan en perspectiva
      e.preventDefault();
    });
  }, []);

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

    let dxf = "0\nSECTION\n2\nENTITIES\n";
    contours.forEach(c => {
      const z = c.value;
      const lines = c.type === 'MultiLineString' ? c.coordinates : (c.coordinates as any).flat();

      lines.forEach((line: any) => {
        dxf += "0\nPOLYLINE\n8\nContours\n66\n1\n70\n8\n10\n0.0\n20\n0.0\n30\n" + z + "\n";
        line.forEach((pt: number[]) => {
          let realX = pt[0];
          let realY = pt[1];

          if (meshData && n > 0 && m > 0) {
            realX = (pt[0] / n) * meshData.w;
            realY = (1.0 - (pt[1] / m)) * meshData.h;
          }

          dxf += "0\nVERTEX\n8\nContours\n70\n32\n10\n" + realX + "\n20\n" + realY + "\n30\n" + z + "\n";
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
            dxf += "0\nVERTEX\n8\n" + layerName + "\n70\n32\n10\n" + x + "\n20\n" + y + "\n30\n" + z + "\n";
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
    const blob = new Blob([dataView.buffer], { type: 'application/octet-stream' });
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
        <div className="flex bg-bg-surface p-1 rounded-sm border border-border-main shadow-lg transition-colors duration-300">
          <button
            onClick={() => setViewMode('plan')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-sm transition-colors text-[10px] font-bold uppercase tracking-widest ${!isPerspective ? 'bg-bg-elevated text-accent' : 'text-text-faded hover:text-text-main'}`}
          >
            <Map size={14} /> Planta
          </button>
          <button
            onClick={() => setViewMode('perspective')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-sm transition-colors text-[10px] font-bold uppercase tracking-widest ${isPerspective ? 'bg-bg-elevated text-accent' : 'text-text-faded hover:text-text-main'}`}
          >
            <Layers size={14} /> Perspectiva
          </button>
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
          <button onClick={handleExportDXF} className="py-2 text-text-faded hover:text-accent transition-colors flex flex-col items-center justify-center gap-1" title="Exportar a AutoCAD (DXF)">
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
        className="w-full h-full object-contain origin-center overflow-visible z-10 drop-shadow-[0_0_15px_rgba(197,160,89,0.15)] cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Main Zoom Group */}
        <g ref={zoomGroupRef}>
          {/* Pedestal de extrusión y Base removidos por solicitud del usuario */}

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
              const poly = c.type === 'MultiLineString' ? c.coordinates[0][0] : (c.coordinates[0] as any);
              if (poly && poly.length > 10) {
                const midIdx = Math.floor(poly.length * 0.25);
                const pt1 = poly[midIdx];
                const pt2 = poly[midIdx + 1];
                if (pt1 && pt2) {
                  labelPt = { X: pt1[0], Y: pt1[1] };
                  labelAngle = Math.atan2(pt2[1] - pt1[1], pt2[0] - pt1[0]) * 180 / Math.PI;
                  if (labelAngle > 90 || labelAngle < -90) labelAngle += 180;
                }
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
                {labelPt && (
                  <text
                    x={labelPt.X}
                    y={labelPt.Y}
                    transform={`rotate(${labelAngle}, ${labelPt.X}, ${labelPt.Y})`}
                    fill={strokeColor}
                    fontSize="6"
                    fontWeight="bold"
                    textAnchor="middle"
                    dy="-2"
                    className="pointer-events-none"
                    style={{ textShadow: "0px 0px 2px var(--theme-bg-base)" }}
                  >
                    {c.value.toFixed(1)}m
                  </text>
                )}
              </g>
            );
          })}

          {/* Vías Extruidas (2.5D visual) */}
          {highways3D.map((hw, i) => (
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
          {waterways3D.map((ww, i) => (
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

          {/* Huellas de Edificios con Extrusión Visual a Tierra */}
          {buildings3D.map((obj, i) => {
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
        </g>
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
