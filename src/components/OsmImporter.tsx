import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, MapPin, Download, Maximize2, Minimize2, Check, X,
  Square, Shapes, Trash2, CheckCircle2, Ruler
} from 'lucide-react';
import {
  MapContainer, TileLayer, Marker, useMap, useMapEvents, LayersControl,
  Polygon, Rectangle, Polyline, CircleMarker
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { decode } from 'fast-png';
import { fetchSatelliteOrthophoto, SatelliteResult } from '../lib/satelliteService';
import { fetchOsmLayersForBBox } from '../lib/ogucService';

const customPinIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

// Custom Icon for Centroid
const centroidIcon = new L.DivIcon({
  className: 'custom-centroid-marker',
  html: `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -50%);
      pointer-events: none;
    ">
      <div style="
        width: 22px;
        height: 22px;
        background: #DA291C;
        border: 2.5px solid #FFFFFF;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 14px rgba(218, 41, 28, 0.9), 0 2px 6px rgba(0,0,0,0.6);
      ">
        <div style="width: 5px; height: 5px; background: #FFFFFF; border-radius: 50%;"></div>
      </div>
      <div style="
        background: rgba(20, 20, 20, 0.92);
        color: #FFFFFF;
        border: 1px solid rgba(218, 41, 28, 0.8);
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 2px 7px;
        border-radius: 3px;
        white-space: nowrap;
        margin-top: 4px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.5);
      ">
        Centro Geométrico
      </div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [0, 0]
});

export interface PolygonMetrics {
  areaM2: number;
  perimeterM: number;
  widthM?: number;
  heightM?: number;
  centroid: [number, number];
}

export function calculatePolygonMetrics(pts: [number, number][], isRectangle = false): PolygonMetrics | null {
  if (!pts || pts.length < 3) return null;

  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lon0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const latFactor = 111320;
  const lonFactor = 111320 * Math.cos((lat0 * Math.PI) / 180);

  const metricPts = pts.map(p => ({
    x: (p[1] - lon0) * lonFactor,
    y: (p[0] - lat0) * latFactor,
  }));

  const n = metricPts.length;

  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const next = metricPts[(i + 1) % n];
    const dx = next.x - metricPts[i].x;
    const dy = next.y - metricPts[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  let areaSum = 0;
  let cxSum = 0;
  let cySum = 0;

  for (let i = 0; i < n; i++) {
    const p1 = metricPts[i];
    const p2 = metricPts[(i + 1) % n];
    const cross = p1.x * p2.y - p2.x * p1.y;
    areaSum += cross;
    cxSum += (p1.x + p2.x) * cross;
    cySum += (p1.y + p2.y) * cross;
  }

  const areaM2 = Math.abs(areaSum) / 2;

  let centroidX = 0;
  let centroidY = 0;

  if (Math.abs(areaSum) > 1e-6) {
    centroidX = cxSum / (3 * areaSum);
    centroidY = cySum / (3 * areaSum);
  } else {
    centroidX = metricPts.reduce((s, p) => s + p.x, 0) / n;
    centroidY = metricPts.reduce((s, p) => s + p.y, 0) / n;
  }

  const centroidLat = lat0 + centroidY / latFactor;
  const centroidLon = lon0 + centroidX / lonFactor;

  let widthM: number | undefined;
  let heightM: number | undefined;

  if (isRectangle && pts.length === 4) {
    const xs = metricPts.map(p => p.x);
    const ys = metricPts.map(p => p.y);
    widthM = Math.max(...xs) - Math.min(...xs);
    heightM = Math.max(...ys) - Math.min(...ys);
  }

  return {
    areaM2,
    perimeterM: perimeter,
    widthM,
    heightM,
    centroid: [centroidLat, centroidLon],
  };
}

export function formatArea(m2: number): string {
  if (m2 >= 10000) {
    const ha = m2 / 10000;
    return `${m2.toLocaleString('es-CL', { maximumFractionDigits: 0 })} m² (${ha.toFixed(2)} ha)`;
  }
  return `${m2.toLocaleString('es-CL', { maximumFractionDigits: 0 })} m²`;
}

export function formatDistance(m: number): string {
  if (m >= 1000) {
    return `${(m / 1000).toFixed(2)} km`;
  }
  return `${Math.round(m)} m`;
}

interface OsmImporterProps {
  onDataFetched: (data: any, name: string) => void;
}

export type SelectionMode = 'regular' | 'irregular' | 'point';

// Map Controller for flying to center
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, Math.max(map.getZoom() || 15, 15));
  }, [center, map]);
  return null;
}

// Invalidate size on mount / expansion
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 350);
    const t3 = setTimeout(() => map.invalidateSize(), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [map]);
  return null;
}

// Sidebar Map Synchronization
function SidebarMapSync({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 13);
    map.invalidateSize();
  }, [center, map]);
  return null;
}

// Interactive Map Drawing Controller
interface MapDrawControllerProps {
  mode: SelectionMode;
  polygon: [number, number][] | null;
  metrics: PolygonMetrics | null;
  rectStart: [number, number] | null;
  rectCurrent: [number, number] | null;
  irregularPoints: [number, number][];
  mousePos: [number, number] | null;
  onPointSelect: (pos: [number, number]) => void;
  onRectClick: (pos: [number, number]) => void;
  onRectMove: (pos: [number, number]) => void;
  onIrregularClick: (pos: [number, number]) => void;
  onIrregularMove: (pos: [number, number]) => void;
  onIrregularDblClick: () => void;
  pointPosition: [number, number];
}

function MapDrawController({
  mode,
  polygon,
  metrics,
  rectStart,
  rectCurrent,
  irregularPoints,
  mousePos,
  onPointSelect,
  onRectClick,
  onRectMove,
  onIrregularClick,
  onIrregularMove,
  onIrregularDblClick,
  pointPosition,
}: MapDrawControllerProps) {
  const map = useMap();

  useMapEvents({
    click(e) {
      const pos: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (mode === 'point') {
        onPointSelect(pos);
      } else if (mode === 'regular') {
        onRectClick(pos);
      } else if (mode === 'irregular') {
        // Close polygon ONLY if user clicks within 10 screen pixels of the first vertex (and has >= 3 vertices)
        if (irregularPoints.length >= 3) {
          const firstScreenPt = map.latLngToContainerPoint(irregularPoints[0]);
          const clickScreenPt = map.latLngToContainerPoint(e.latlng);
          if (firstScreenPt.distanceTo(clickScreenPt) <= 10) {
            onIrregularDblClick();
            return;
          }
        }
        // Ignore accidental duplicate click on the exact same pixel (e.g. second click of a double-click)
        if (irregularPoints.length >= 1) {
          const lastScreenPt = map.latLngToContainerPoint(
            irregularPoints[irregularPoints.length - 1]
          );
          const clickScreenPt = map.latLngToContainerPoint(e.latlng);
          if (lastScreenPt.distanceTo(clickScreenPt) <= 4) {
            return;
          }
        }
        onIrregularClick(pos);
      }
    },
    mousemove(e) {
      const pos: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (mode === 'regular' && rectStart) {
        onRectMove(pos);
      } else if (mode === 'irregular' && irregularPoints.length > 0) {
        onIrregularMove(pos);
      }
    },
    dblclick(e) {
      if (mode === 'irregular' && irregularPoints.length >= 3) {
        L.DomEvent.stopPropagation(e);
        onIrregularDblClick();
      }
    }
  });

  return (
    <>
      {/* 1. Point / Pin Mode Marker */}
      {mode === 'point' && !polygon && (
        <Marker position={pointPosition} icon={customPinIcon} />
      )}

      {/* 2. Committed Polygon (Regular or Irregular) */}
      {polygon && (
        <>
          <Polygon
            positions={polygon}
            pathOptions={{
              color: '#DA291C',
              weight: 2.5,
              fillColor: '#DA291C',
              fillOpacity: 0.22,
            }}
          />
          {polygon.map((pt, idx) => (
            <CircleMarker
              key={idx}
              center={pt}
              radius={4}
              pathOptions={{
                color: '#DA291C',
                fillColor: '#FFFFFF',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
          {/* Centroid / Geometric Center Marker */}
          {metrics && (
            <Marker position={metrics.centroid} icon={centroidIcon} />
          )}
        </>
      )}

      {/* 3. Regular Rectangle in-progress */}
      {mode === 'regular' && rectStart && rectCurrent && !polygon && (
        <>
          <Rectangle
            bounds={[rectStart, rectCurrent]}
            pathOptions={{
              color: '#DA291C',
              weight: 2,
              dashArray: '6, 6',
              fillColor: '#DA291C',
              fillOpacity: 0.18,
            }}
          />
          <CircleMarker
            center={rectStart}
            radius={5}
            pathOptions={{ color: '#DA291C', fillColor: '#FFFFFF', fillOpacity: 1, weight: 2 }}
          />
          <CircleMarker
            center={rectCurrent}
            radius={4}
            pathOptions={{ color: '#DA291C', fillColor: '#DA291C', fillOpacity: 1, weight: 1.5 }}
          />
        </>
      )}

      {/* 4. Irregular Polygon in-progress */}
      {mode === 'irregular' && irregularPoints.length > 0 && !polygon && (
        <>
          {irregularPoints.length >= 2 && (
            <Polyline
              positions={irregularPoints}
              pathOptions={{ color: '#DA291C', weight: 2 }}
            />
          )}

          {/* Elastic line to current cursor position */}
          {mousePos && irregularPoints.length > 0 && (
            <Polyline
              positions={[irregularPoints[irregularPoints.length - 1], mousePos]}
              pathOptions={{ color: '#DA291C', weight: 2, dashArray: '4, 4' }}
            />
          )}

          {/* Ghost closing line to first point */}
          {mousePos && irregularPoints.length >= 2 && (
            <Polyline
              positions={[mousePos, irregularPoints[0]]}
              pathOptions={{ color: '#DA291C66', weight: 1.5, dashArray: '2, 4' }}
            />
          )}

          {/* Vertices */}
          {irregularPoints.map((pt, i) => (
            <CircleMarker
              key={i}
              center={pt}
              radius={i === 0 ? 6 : 4}
              eventHandlers={
                i === 0 && irregularPoints.length >= 3
                  ? {
                      click: (ev) => {
                        L.DomEvent.stopPropagation(ev);
                        onIrregularDblClick();
                      },
                    }
                  : undefined
              }
              pathOptions={{
                color: '#DA291C',
                fillColor: i === 0 ? '#DA291C' : '#FFFFFF',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </>
      )}
    </>
  );
}

export default function OsmImporter({ onDataFetched }: OsmImporterProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [position, setPosition] = useState<[number, number]>([-33.4489, -70.6693]); // Santiago de Chile
  const [center, setCenter] = useState<[number, number]>([-33.4489, -70.6693]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Polygon and Drawing State
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('regular');
  const [polygon, setPolygon] = useState<[number, number][] | null>(null);
  const [metrics, setMetrics] = useState<PolygonMetrics | null>(null);

  // Regular drawing temp state
  const [rectStart, setRectStart] = useState<[number, number] | null>(null);
  const [rectCurrent, setRectCurrent] = useState<[number, number] | null>(null);

  // Irregular drawing temp state
  const [irregularPoints, setIrregularPoints] = useState<[number, number][]>([]);
  const [mousePos, setMousePos] = useState<[number, number] | null>(null);

  const resetDrawing = () => {
    setRectStart(null);
    setRectCurrent(null);
    setIrregularPoints([]);
    setMousePos(null);
  };

  const clearPolygon = () => {
    setPolygon(null);
    setMetrics(null);
    resetDrawing();
  };

  const closeExpanded = () => {
    resetDrawing();
    setIsExpanded(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        closeExpanded();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Search logic
  const handleSearch = async (searchQuery = query) => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await resp.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setCenter([lat, lon]);
        setPosition([lat, lon]);
        clearPolygon();
      } else {
        alert("Lugar no encontrado.");
      }
    } catch (e) {
      console.error(e);
      alert("Error al buscar el lugar.");
    } finally {
      setIsSearching(false);
    }
  };

  // 1. Regular Rectangle click handler
  const handleRectClick = (pos: [number, number]) => {
    if (!rectStart) {
      setPolygon(null);
      setMetrics(null);
      setRectStart(pos);
      setRectCurrent(pos);
    } else {
      const minLat = Math.min(rectStart[0], pos[0]);
      const maxLat = Math.max(rectStart[0], pos[0]);
      const minLon = Math.min(rectStart[1], pos[1]);
      const maxLon = Math.max(rectStart[1], pos[1]);

      const poly: [number, number][] = [
        [minLat, minLon],
        [maxLat, minLon],
        [maxLat, maxLon],
        [minLat, maxLon],
      ];

      const m = calculatePolygonMetrics(poly, true);
      setPolygon(poly);
      setMetrics(m);
      if (m) {
        setPosition(m.centroid);
        setCenter(m.centroid);
      }
      setRectStart(null);
      setRectCurrent(null);
    }
  };

  // 2. Irregular Polygon click handler (pixel-distance closing is handled in MapDrawController)
  const handleIrregularClick = (pos: [number, number]) => {
    if (irregularPoints.length === 0) {
      setPolygon(null);
      setMetrics(null);
    }
    setIrregularPoints((prev) => [...prev, pos]);
  };

  const finishIrregularPolygon = () => {
    if (irregularPoints.length < 3) return;
    const m = calculatePolygonMetrics(irregularPoints, false);
    setPolygon(irregularPoints);
    setMetrics(m);
    if (m) {
      setPosition(m.centroid);
    }
    setIrregularPoints([]);
    setMousePos(null);
  };

  // Point Selection handler
  const handlePointSelect = (pos: [number, number]) => {
    setPosition(pos);
    setCenter(pos);
    clearPolygon();
  };

  // Live Metric computation while drawing
  let liveWidth: number | undefined;
  let liveHeight: number | undefined;
  let liveArea = 0;
  let livePerimeter = 0;

  if (selectionMode === 'regular' && rectStart && rectCurrent) {
    const minLat = Math.min(rectStart[0], rectCurrent[0]);
    const maxLat = Math.max(rectStart[0], rectCurrent[0]);
    const minLon = Math.min(rectStart[1], rectCurrent[1]);
    const maxLon = Math.max(rectStart[1], rectCurrent[1]);
    const tempPoly: [number, number][] = [
      [minLat, minLon],
      [maxLat, minLon],
      [maxLat, maxLon],
      [minLat, maxLon],
    ];
    const liveM = calculatePolygonMetrics(tempPoly, true);
    if (liveM) {
      liveWidth = liveM.widthM;
      liveHeight = liveM.heightM;
      liveArea = liveM.areaM2;
      livePerimeter = liveM.perimeterM;
    }
  } else if (selectionMode === 'irregular' && irregularPoints.length > 0 && mousePos) {
    const tempPoly = [...irregularPoints, mousePos];
    const liveM = calculatePolygonMetrics(tempPoly, false);
    if (liveM) {
      liveArea = liveM.areaM2;
      livePerimeter = liveM.perimeterM;
    }
  }

  // Extract OSM Elevation and 3D Context
  const extractOsmData = async () => {
    setIsExtracting(true);
    setExtractionStatus('Descargando topografía DEM...');
    try {
      let minLat: number, maxLat: number, minLon: number, maxLon: number;

      if (polygon && polygon.length >= 3) {
        const lats = polygon.map(p => p[0]);
        const lons = polygon.map(p => p[1]);
        const polyMinLat = Math.min(...lats);
        const polyMaxLat = Math.max(...lats);
        const polyMinLon = Math.min(...lons);
        const polyMaxLon = Math.max(...lons);

        // Margen contextual proporcional (~45% del tamaño del lote, mínimo ~48m por lado para contexto OGUC de calle y vecinos)
        const latSpan = polyMaxLat - polyMinLat;
        const lonSpan = polyMaxLon - polyMinLon;
        const marginLat = Math.max(latSpan * 0.45, 0.00045);
        const marginLon = Math.max(lonSpan * 0.45, 0.00045);

        minLat = polyMinLat - marginLat;
        maxLat = polyMaxLat + marginLat;
        minLon = polyMinLon - marginLon;
        maxLon = polyMaxLon + marginLon;
      } else {
        const delta = 0.0035; 
        minLat = position[0] - delta;
        maxLat = position[0] + delta;
        minLon = position[1] - delta;
        maxLon = position[1] + delta;
      }
      
      // Use max Terrarium resolution (z=15) for lot/neighborhood scale, z=14 for larger areas
      const z = Math.max(maxLat - minLat, maxLon - minLon) < 0.015 ? 15 : 14; 
      const lon2tile = (lon: number, zoom: number) => (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
      const lat2tile = (lat: number, zoom: number) => (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
      const lon2tileFloat = (lon: number, zoom: number) => ((lon + 180) / 360 * Math.pow(2, zoom));
      const lat2tileFloat = (lat: number, zoom: number) => ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
      const tile2lon = (x: number, z: number) => (x / Math.pow(2, z) * 360 - 180);
      const tile2lat = (y: number, z: number) => {
        const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
        return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
      };

      const minTx = lon2tile(minLon, z);
      const maxTx = lon2tile(maxLon, z);
      const minTy = lat2tile(maxLat, z);
      const maxTy = lat2tile(minLat, z);

      const numX = maxTx - minTx + 1;
      const numY = maxTy - minTy + 1;

      const width = numX * 256;
      const height = numY * 256;

      const tilePromises = [];
      const tilesMap = new Map<string, { data: Uint8Array, channels: number }>();

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const promise = fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`)
            .then(res => res.arrayBuffer())
            .then(buf => {
               const png = decode(buf);
               tilesMap.set(`${tx},${ty}`, { data: png.data as Uint8Array, channels: png.channels });
            })
            .catch(e => {
               console.warn(`Falló al cargar tile: ${tx}/${ty}`, e);
            });
          tilePromises.push(promise);
        }
      }
      
      await Promise.all(tilePromises);

      const canvasWest = tile2lon(minTx, z);
      const canvasEast = tile2lon(maxTx + 1, z);
      const canvasNorth = tile2lat(minTy, z);
      const canvasSouth = tile2lat(maxTy + 1, z);

      const getDecodedElevation = (px: number, py: number) => {
        px = Math.max(0, Math.min(width - 1, px));
        py = Math.max(0, Math.min(height - 1, py));
        
        const tx = minTx + Math.floor(px / 256);
        const ty = minTy + Math.floor(py / 256);
        
        const localX = px % 256;
        const localY = py % 256;
        
        const tile = tilesMap.get(`${tx},${ty}`);
        if (!tile) return -32768;
        
        const idx = (localY * 256 + localX) * tile.channels;
        const r = tile.data[idx];
        const g = tile.data[idx+1];
        const b = tile.data[idx+2];
        const rawElev = (r * 256 + g + b / 256) - 32768;
        return rawElev < -20000 ? -32768 : Math.max(0, rawElev);
      };

      const getElevation = (lat: number, lon: number) => {
        const x = (lon2tileFloat(lon, z) - minTx) * 256;
        const y = (lat2tileFloat(lat, z) - minTy) * 256;
        
        const x0 = Math.floor(x);
        const x1 = x0 + 1;
        const y0 = Math.floor(y);
        const y1 = y0 + 1;

        const tx = x - x0;
        const ty = y - y0;

        const v00 = getDecodedElevation(x0, y0);
        const v10 = getDecodedElevation(x1, y0);
        const v01 = getDecodedElevation(x0, y1);
        const v11 = getDecodedElevation(x1, y1);

        if (v00 < -20000 || v10 < -20000 || v01 < -20000 || v11 < -20000) {
            return -32768;
        }

        return (1 - ty) * ((1 - tx) * v00 + tx * v10) + ty * ((1 - tx) * v01 + tx * v11);
      };

      const steps = 150;
      const results = [];
      for (let i = 0; i < steps; i++) {
         const lat = maxLat - (maxLat - minLat) * (i / (steps - 1));
         for (let j = 0; j < steps; j++) {
            const lon = minLon + (maxLon - minLon) * (j / (steps - 1));
            results.push({
               latitude: lat,
               longitude: lon,
               elevation: getElevation(lat, lon)
            });
         }
      }
      
      let buildingsData = null;
      setExtractionStatus('Consultando capas OSM (edificios y vialidad)...');
      try {
        buildingsData = await fetchOsmLayersForBBox({ minLat, maxLat, minLon, maxLon });
        if (buildingsData && Array.isArray(buildingsData.elements)) {
          const bCount = buildingsData.elements.filter((e: any) => e.tags?.building).length;
          const hCount = buildingsData.elements.filter((e: any) => e.tags?.highway).length;
          const wCount = buildingsData.elements.filter((e: any) => e.tags?.waterway).length;
          console.log(`[GeoArc OSM] Resumen de capas cargadas -> Edificios: ${bCount}, Vías: ${hCount}, Cursos de agua: ${wCount}`);
        } else {
          console.warn('[GeoArc OSM] No se pudieron cargar capas OSM de edificios ni vialidad desde ningún endpoint.');
        }
      } catch (e) {
        console.warn('Error en consulta de capas Overpass OSM:', e);
      }

      // 3. Captura y mosaico de la vista satelital ortorrectificada de alta resolución
      let satelliteResult: SatelliteResult | null = null;
      try {
        setExtractionStatus('Generando ortofoto satelital de alta resolución...');
        satelliteResult = await fetchSatelliteOrthophoto({ minLat, maxLat, minLon, maxLon });
        console.log(`[GeoArc Satelital] Ortofoto generada exitosamente: ${satelliteResult.width}x${satelliteResult.height}px (Zoom ${satelliteResult.zoom})`);
      } catch (satErr) {
        console.warn('[GeoArc Satelital] Error al generar ortofoto satelital:', satErr);
      }

      onDataFetched({ 
        type: 'topo', 
        topoData: { results }, 
        buildings: buildingsData,
        bbox: { minLat, maxLat, minLon, maxLon }, 
        lotPolygon: polygon,
        steps,
        satellite: satelliteResult
      }, `Relieve_${position[0].toFixed(4)}_${position[1].toFixed(4)}.json`);
    } catch (e) {
      console.error(e);
      alert("Error al extraer relieve con AWS Terrain Tiles.");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search Bar with Expand Trigger */}
      <div className="flex gap-2">
        <div 
          onClick={() => setIsExpanded(true)}
          className="flex-1 relative cursor-pointer group"
          title="Haz clic para abrir el mapa y dibujar el terreno"
        >
          <input 
            type="text"
            value={query}
            readOnly
            placeholder="Buscar ciudad o dirección..."
            className="w-full bg-bg-elevated border border-border-main text-xs p-2.5 pr-8 rounded-sm outline-none text-text-main group-hover:border-accent transition-colors cursor-pointer"
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faded group-hover:text-accent transition-colors p-1"
            title="Ampliar mapa"
          >
            <Maximize2 size={13} />
          </button>
        </div>
        <button 
          onClick={() => setIsExpanded(true)}
          className="bg-bg-elevated border border-border-main px-3 rounded-sm hover:border-accent transition-colors text-text-faded hover:text-accent flex items-center justify-center cursor-pointer"
          title="Ampliar mapa para dibujar terreno"
        >
          <Search size={15} />
        </button>
      </div>

      {/* Mini-map in Sidebar */}
      <div className="h-[165px] w-full rounded-sm overflow-hidden border border-border-strong relative z-0 group">
        <MapContainer center={center} zoom={15} maxZoom={22} style={{ height: '100%', width: '100%' }}>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Standard">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxNativeZoom={19}
                maxZoom={22}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Tracestrack Topo">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                maxNativeZoom={17}
                maxZoom={22}
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <SidebarMapSync center={center} />

          {/* Render polygon & centroid in mini-map */}
          {polygon ? (
            <>
              <Polygon
                positions={polygon}
                pathOptions={{
                  color: '#DA291C',
                  weight: 2,
                  fillColor: '#DA291C',
                  fillOpacity: 0.25,
                }}
              />
              {metrics && (
                <Marker position={metrics.centroid} icon={centroidIcon} />
              )}
            </>
          ) : (
            <Marker position={position} icon={customPinIcon} />
          )}
        </MapContainer>

        {/* Hover overlay inviting to expand */}
        <div 
          onClick={() => setIsExpanded(true)}
          className="absolute inset-0 bg-black/0 hover:bg-black/35 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer z-[400]"
        >
          <span className="bg-bg-surface/95 border border-accent/40 text-text-main text-[9px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-sm shadow-xl flex items-center gap-1.5 group-hover:scale-105 transition-transform">
            <Maximize2 size={11} className="text-accent" />
            Ampliar y Delimitar Terreno
          </span>
        </div>

        {/* Top-right corner expand button */}
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="absolute top-2 right-2 z-[450] bg-bg-surface/90 hover:bg-bg-surface border border-border-main hover:border-accent p-1.5 rounded-sm text-text-faded hover:text-accent shadow-md transition-colors cursor-pointer"
          title="Ampliar mapa"
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Information readout in sidebar */}
      {polygon && metrics ? (
        <div className="bg-bg-elevated p-2.5 rounded-sm border border-border-main space-y-1.5">
          <div className="flex justify-between items-center text-[10px] font-mono">
            <span className="text-text-subtle uppercase">Área Terreno:</span>
            <span className="text-accent font-bold">{formatArea(metrics.areaM2)}</span>
          </div>
          {metrics.widthM && metrics.heightM && (
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-text-subtle uppercase">Dimensiones:</span>
              <span className="text-text-main font-semibold">{Math.round(metrics.widthM)} m × {Math.round(metrics.heightM)} m</span>
            </div>
          )}
          <div className="flex justify-between items-center text-[10px] font-mono">
            <span className="text-text-subtle uppercase">Perímetro:</span>
            <span className="text-text-main font-semibold">{formatDistance(metrics.perimeterM)}</span>
          </div>
          <div className="flex justify-between items-center text-[9px] font-mono text-text-subtle pt-1 border-t border-border-faded">
            <span>Centroide:</span>
            <span>{metrics.centroid[0].toFixed(5)}, {metrics.centroid[1].toFixed(5)}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[10px] uppercase font-mono tracking-widest text-text-subtle">
          <span>Lat: {position[0].toFixed(5)}</span>
          <span>Lon: {position[1].toFixed(5)}</span>
        </div>
      )}

      {/* Extract Button */}
      <button 
        onClick={extractOsmData}
        disabled={isExtracting}
        className="w-full py-2.5 border border-accent text-accent text-[10px] font-bold uppercase tracking-widest hover:bg-accent hover:text-white transition-colors rounded-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {isExtracting ? (
          <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div> {extractionStatus || 'Extrayendo Terreno...'}</>
        ) : (
          <><Download size={14} /> Extraer Área de Terreno</>
        )}
      </button>

      {/* Expanded Modal Overlay via Portal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-5 md:p-6"
              onClick={closeExpanded}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 15 }}
                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-6xl h-[90vh] bg-bg-surface border border-border-strong rounded-lg shadow-2xl flex flex-col overflow-hidden text-text-main"
              >
                {/* 1. Modal Top Bar */}
                <div className="h-12 border-b border-border-main flex items-center justify-between px-4 bg-bg-surface shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
                      <MapPin size={13} className="text-accent" />
                    </div>
                    <h3 className="text-xs font-bold tracking-widest uppercase text-text-main">
                      Delimitación de Terreno
                    </h3>
                    <span className="hidden sm:inline-block text-[9px] uppercase font-bold tracking-wider text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-sm">
                      Modo Ampliado
                    </span>
                  </div>

                  {/* Mode Selector Buttons in Header */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-bg-elevated p-0.5 rounded-sm border border-border-main">
                      <button
                        type="button"
                        onClick={() => { setSelectionMode('regular'); resetDrawing(); }}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
                          selectionMode === 'regular'
                            ? 'bg-bg-surface text-accent shadow-sm border border-accent/20'
                            : 'text-text-faded hover:text-text-main'
                        }`}
                        title="Dibujar polígono regular (rectángulo)"
                      >
                        <Square size={12} />
                        <span className="hidden md:inline">Polígono Regular</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectionMode('irregular'); resetDrawing(); }}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
                          selectionMode === 'irregular'
                            ? 'bg-bg-surface text-accent shadow-sm border border-accent/20'
                            : 'text-text-faded hover:text-text-main'
                        }`}
                        title="Dibujar polígono irregular libre"
                      >
                        <Shapes size={12} />
                        <span className="hidden md:inline">Polígono Irregular</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectionMode('point'); resetDrawing(); }}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
                          selectionMode === 'point'
                            ? 'bg-bg-surface text-accent shadow-sm border border-accent/20'
                            : 'text-text-faded hover:text-text-main'
                        }`}
                        title="Fijar pin de ubicación simple"
                      >
                        <MapPin size={12} />
                        <span className="hidden md:inline">Punto</span>
                      </button>
                    </div>

                    {/* Clear / Redraw button */}
                    {(polygon || rectStart || irregularPoints.length > 0) && (
                      <button
                        type="button"
                        onClick={clearPolygon}
                        className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-text-faded hover:text-accent border border-border-main hover:border-accent rounded-sm flex items-center gap-1 transition-colors cursor-pointer bg-bg-surface"
                        title="Limpiar y redibujar polígono"
                      >
                        <Trash2 size={12} />
                        <span className="hidden sm:inline">Limpiar</span>
                      </button>
                    )}

                    <button
                      onClick={closeExpanded}
                      className="w-7 h-7 rounded-sm border border-border-main hover:border-accent text-text-faded hover:text-accent flex items-center justify-center transition-colors cursor-pointer ml-2"
                      title="Cerrar ventana [Esc]"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* 2. Modal Search Bar & Presets */}
                <div className="p-3 border-b border-border-main bg-bg-elevated/40 flex flex-col sm:flex-row gap-3 shrink-0">
                  <div className="flex-1 flex gap-2">
                    <div className="relative flex-1">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faded pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder="Buscar ciudad o dirección para centrar el mapa..."
                        className="w-full bg-bg-surface border border-border-main pl-9 pr-3 py-1.5 text-xs rounded-sm outline-none text-text-main focus:border-accent transition-colors"
                      />
                    </div>
                    <button
                      onClick={() => handleSearch()}
                      disabled={isSearching}
                      className="px-3.5 py-1.5 bg-accent text-white text-[11px] font-bold uppercase tracking-wider rounded-sm hover:bg-accent-hover transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      {isSearching ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search size={13} />}
                      <span>Buscar</span>
                    </button>
                  </div>

                  {/* Quick City Presets */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
                    <span className="text-[9px] uppercase font-bold tracking-widest text-text-subtle mr-1 shrink-0">Rápido:</span>
                    {[
                      { name: 'Santiago', lat: -33.4489, lon: -70.6693 },
                      { name: 'Concepción', lat: -36.8270, lon: -73.0503 },
                      { name: 'Temuco', lat: -38.7359, lon: -72.5904 },
                      { name: 'Valparaíso', lat: -33.0472, lon: -71.6127 },
                      { name: 'Puerto Montt', lat: -41.4693, lon: -72.9424 },
                    ].map(city => (
                      <button
                        key={city.name}
                        onClick={() => {
                          setCenter([city.lat, city.lon]);
                          setPosition([city.lat, city.lon]);
                          setQuery(city.name);
                          clearPolygon();
                        }}
                        className="text-[10px] bg-bg-surface border border-border-main hover:border-accent px-2 py-1 rounded-sm text-text-faded hover:text-accent transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {city.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Expanded Leaflet Map Canvas */}
                <div className="flex-1 w-full relative min-h-0 cursor-crosshair">
                  <MapContainer
                    center={center}
                    zoom={17}
                    maxZoom={22}
                    zoomSnap={0.5}
                    zoomDelta={0.5}
                    doubleClickZoom={false}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <LayersControl position="topright">
                      <LayersControl.BaseLayer checked name="Estándar Catastral (OSM)">
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          maxNativeZoom={19}
                          maxZoom={22}
                        />
                      </LayersControl.BaseLayer>
                      <LayersControl.BaseLayer name="Satelital HD (Esri)">
                        <TileLayer
                          attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
                          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                          maxNativeZoom={19}
                          maxZoom={22}
                        />
                      </LayersControl.BaseLayer>
                      <LayersControl.BaseLayer name="Topográfico (OpenTopoMap)">
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                          maxNativeZoom={17}
                          maxZoom={22}
                        />
                      </LayersControl.BaseLayer>
                    </LayersControl>
                    <MapController center={center} />
                    <MapDrawController
                      mode={selectionMode}
                      polygon={polygon}
                      metrics={metrics}
                      rectStart={rectStart}
                      rectCurrent={rectCurrent}
                      irregularPoints={irregularPoints}
                      mousePos={mousePos}
                      onPointSelect={handlePointSelect}
                      onRectClick={handleRectClick}
                      onRectMove={(p) => setRectCurrent(p)}
                      onIrregularClick={handleIrregularClick}
                      onIrregularMove={(p) => setMousePos(p)}
                      onIrregularDblClick={finishIrregularPolygon}
                      pointPosition={position}
                    />
                    <MapResizer />
                  </MapContainer>

                  {/* 4. Top Live Drawing HUD */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-auto">
                    {/* A. Live Regular Drawing */}
                    {selectionMode === 'regular' && rectStart && rectCurrent && !polygon && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 bg-bg-surface/95 backdrop-blur-md border border-accent/40 px-4 py-2 rounded-sm shadow-xl text-xs font-mono"
                      >
                        <div className="flex items-center gap-1.5 text-accent font-bold">
                          <Ruler size={13} />
                          <span>Dibujando</span>
                        </div>
                        <div className="w-[1px] h-3.5 bg-border-main" />
                        {liveWidth && liveHeight && (
                          <div>
                            <span className="text-text-subtle text-[10px] uppercase mr-1">Dim:</span>
                            <strong className="text-text-main">{Math.round(liveWidth)} m × {Math.round(liveHeight)} m</strong>
                          </div>
                        )}
                        <div className="w-[1px] h-3.5 bg-border-main" />
                        <div>
                          <span className="text-text-subtle text-[10px] uppercase mr-1">Área:</span>
                          <strong className="text-accent">{formatArea(liveArea)}</strong>
                        </div>
                        <div className="w-[1px] h-3.5 bg-border-main" />
                        <span className="text-[10px] text-text-faded italic">Clic en esquina opuesta para fijar</span>
                      </motion.div>
                    )}

                    {/* B. Live Irregular Drawing */}
                    {selectionMode === 'irregular' && irregularPoints.length > 0 && !polygon && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 bg-bg-surface/95 backdrop-blur-md border border-accent/40 px-4 py-2 rounded-sm shadow-xl text-xs font-mono"
                      >
                        <div className="flex items-center gap-1.5 text-accent font-bold">
                          <Shapes size={13} />
                          <span>Vértices: {irregularPoints.length}</span>
                        </div>
                        {livePerimeter > 0 && (
                          <>
                            <div className="w-[1px] h-3.5 bg-border-main" />
                            <div>
                              <span className="text-text-subtle text-[10px] uppercase mr-1">Perímetro:</span>
                              <strong className="text-text-main">{formatDistance(livePerimeter)}</strong>
                            </div>
                          </>
                        )}
                        {irregularPoints.length >= 2 && liveArea > 0 && (
                          <>
                            <div className="w-[1px] h-3.5 bg-border-main" />
                            <div>
                              <span className="text-text-subtle text-[10px] uppercase mr-1">Área:</span>
                              <strong className="text-accent">{formatArea(liveArea)}</strong>
                            </div>
                          </>
                        )}
                        {irregularPoints.length >= 3 && (
                          <button
                            type="button"
                            onClick={finishIrregularPolygon}
                            className="ml-2 px-2.5 py-1 bg-accent text-white text-[10px] font-bold uppercase tracking-wider rounded-sm hover:bg-accent-hover transition-colors flex items-center gap-1 shadow-md cursor-pointer animate-pulse"
                          >
                            <CheckCircle2 size={12} />
                            <span>Cerrar Polígono</span>
                          </button>
                        )}
                      </motion.div>
                    )}

                    {/* C. Instruction Pill when not yet drawing */}
                    {!polygon && !rectStart && irregularPoints.length === 0 && (
                      <div className="bg-bg-surface/90 backdrop-blur-md border border-border-strong px-4 py-1.5 rounded-full shadow-lg text-[10px] uppercase tracking-wider font-semibold text-text-main flex items-center gap-2">
                        {selectionMode === 'regular' && (
                          <>
                            <Square size={12} className="text-accent" />
                            <span>Haz clic en una esquina y luego en la esquina opuesta para delimitar el terreno</span>
                          </>
                        )}
                        {selectionMode === 'irregular' && (
                          <>
                            <Shapes size={12} className="text-accent" />
                            <span>Haz clics sucesivos en el mapa para trazar los vértices del polígono</span>
                          </>
                        )}
                        {selectionMode === 'point' && (
                          <>
                            <MapPin size={12} className="text-accent" />
                            <span>Haz clic sobre el mapa para fijar el punto del terreno</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 5. Bottom Completed Metrics HUD */}
                  {polygon && metrics && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-4 left-4 z-[500] bg-bg-surface/95 backdrop-blur-md border border-accent/40 p-3 rounded-sm shadow-2xl max-w-sm font-mono text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-border-faded pb-1.5 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-accent flex items-center gap-1.5">
                          <Check size={13} />
                          Terreno Delimitado ({selectionMode === 'regular' ? 'Regular' : 'Irregular'})
                        </span>
                        <button
                          type="button"
                          onClick={clearPolygon}
                          className="text-[9px] uppercase tracking-wider text-text-subtle hover:text-accent transition-colors cursor-pointer"
                        >
                          Redibujar
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-text-subtle uppercase text-[10px]">Área Total:</span>
                          <strong className="text-accent font-bold">{formatArea(metrics.areaM2)}</strong>
                        </div>
                        {metrics.widthM && metrics.heightM && (
                          <div className="flex justify-between">
                            <span className="text-text-subtle uppercase text-[10px]">Dimensiones:</span>
                            <strong className="text-text-main">{Math.round(metrics.widthM)} m × {Math.round(metrics.heightM)} m</strong>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-text-subtle uppercase text-[10px]">Perímetro:</span>
                          <strong className="text-text-main">{formatDistance(metrics.perimeterM)}</strong>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-border-faded text-[10px] text-text-muted">
                          <span className="uppercase text-[9px] text-text-subtle">Centroide:</span>
                          <span>Lat: {metrics.centroid[0].toFixed(5)}, Lon: {metrics.centroid[1].toFixed(5)}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* 6. Confirm and Return Action */}
                  <div className="absolute bottom-4 right-4 z-[500] flex gap-2">
                    <button
                      onClick={closeExpanded}
                      className="bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-sm shadow-xl text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Check size={14} />
                      <span>Confirmar Selección y Volver</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
