import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Download, Settings2,
  MapPin, SlidersHorizontal, Beaker, Map as MapIcon,
  Sun, Moon, Globe, Layers, Box, Image as ImageIcon,
  PanelLeftClose, PanelLeftOpen,
  RotateCcw, CheckCircle2, AlertTriangle, X
} from 'lucide-react';
import ContourViewer from './components/ContourViewer';
import ThreeTerrainViewer from './components/ThreeTerrainViewer';
import { MeshData, processMeshFile } from './lib/meshProcessor';
import OsmImporter from './components/OsmImporter';
import { getSunPosition, parseLocalSolarDate } from './lib/SunPosition';
import { exportToObjZip, exportToGlb, exportToSvg, triggerBrowserDownload } from './lib/exportService';
import { fetchOsmLayersForBBox } from './lib/ogucService';
import { SUPPORTED_CRS } from './lib/crsService';
import { saveSession, loadSession, clearSession } from './lib/storageService';

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="ml-1 flex h-3 w-3 items-center justify-center rounded-full bg-bg-input text-[8px] font-bold text-accent cursor-help border border-border-faded">
        ?
      </div>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute left-1/2 bottom-full mb-2 w-48 -translate-x-1/2 p-2 rounded-md bg-bg-surface border border-border-main text-[9px] text-text-main shadow-lg z-50 text-center leading-tight normal-case font-sans"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type AnalysisMode = 'topographic' | 'oguc' | 'solar';

export default function App() {
  const [interval, setInterval] = useState<number>(1.0);
  const [zExaggeration, setZExaggeration] = useState<number>(1.5);
  const [crs, setCrs] = useState<string>('EPSG:32719');

  // Local 3D Mesh state
  const [terrainSourceTab, setTerrainSourceTab] = useState<'osm' | 'mesh'>('osm');
  const [isMeshUploading, setIsMeshUploading] = useState<boolean>(false);
  const [meshUploadError, setMeshUploadError] = useState<string | null>(null);
  const [isLocalMeshActive, setIsLocalMeshActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Controles topográficos didácticos
  const [minElevation, setMinElevation] = useState<number | ''>('');
  const [maxElevation, setMaxElevation] = useState<number | ''>('');
  const [colorPalette, setColorPalette] = useState<'termico' | 'tecnico' | 'hipso'>('tecnico');
  const [masterIntervalCount, setMasterIntervalCount] = useState<number>(5);
  const [showContourLabels, setShowContourLabels] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Session Persistence State
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showRestoreToast, setShowRestoreToast] = useState<boolean>(false);
  const isRestoringSessionRef = useRef<boolean>(true);

  // Mode and Location
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('topographic');
  const [locationLat, setLocationLat] = useState<number>(-38.7359);
  const [locationLon, setLocationLon] = useState<number>(-72.5904);

  // OGUC
  const [ogucAngle, setOgucAngle] = useState<number>(70); // Kept for persistence compatibility
  const [ogucRegionGroup, setOgucRegionGroup] = useState<1 | 2 | 3>(3);
  const [ogucRasanteStartHeight, setOgucRasanteStartHeight] = useState<number>(2.5);
  const [ogucApplyExtraSetback, setOgucApplyExtraSetback] = useState<boolean>(false);
  const [ogucContinuousBaseHeight, setOgucContinuousBaseHeight] = useState<number>(0);
  const [ogucMaxHeight, setOgucMaxHeight] = useState<number>(14);
  const [ogucMinSetback, setOgucMinSetback] = useState<number>(3);
  const [showOgucShadows, setShowOgucShadows] = useState<boolean>(true);

  // Auto-select Region Group based on latitude
  useEffect(() => {
    if (locationLat > -26.0) {
      setOgucRegionGroup(1);
    } else if (locationLat > -36.5) {
      setOgucRegionGroup(2);
    } else {
      setOgucRegionGroup(3);
    }
  }, [locationLat]);

  // Solar
  const [solarDate, setSolarDate] = useState<string>('2024-06-21'); // Winter solstice in southern hemisphere
  const [solarTime, setSolarTime] = useState<number>(12); // 12:00
  const [solarDayPreset, setSolarDayPreset] = useState<"custom" | "solstice_winter" | "solstice_summer" | "equinox">("solstice_winter");
  const [showSunPath, setShowSunPath] = useState<boolean>(true);
  const [showSolarShadows, setShowSolarShadows] = useState<boolean>(true);

  // Layers
  const [showContextBuildings, setShowContextBuildings] = useState<boolean>(true);
  const [showHighways, setShowHighways] = useState<boolean>(true);
  const [showWaterways, setShowWaterways] = useState<boolean>(true);
  const [showSatelliteLayer, setShowSatelliteLayer] = useState<boolean>(true);
  const [viewerMode, setViewerMode] = useState<'realistic' | 'technical'>('realistic');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Theme state
  const [isLightMode, setIsLightMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Lot Drawing State
  const [isDrawingLot, setIsDrawingLot] = useState<boolean>(false);
  const [customLotPts, setCustomLotPts] = useState<{x: number, y: number, elev: number}[] | null>(null);

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, [isLightMode]);

  // File and Mesh state
  const [fileName, setFileName] = useState<string>('terreno_osm.json');
  const [meshData, setMeshData] = useState<MeshData | undefined>(undefined);
  const [osmDataRaw, setOsmDataRaw] = useState<any>(null);

  // Auto-sanitize coastal bathymetry (< 0m submarine trench values) in active or imported meshData
  useEffect(() => {
    if (!meshData || !Array.isArray(meshData.grid) || meshData.minEv >= 0) return;
    let newMin = Infinity;
    let newMax = -Infinity;
    const sanitizedGrid = meshData.grid.map((v: number) => {
      const clamped = Number.isFinite(v) ? Math.max(0, v) : 0;
      if (clamped < newMin) newMin = clamped;
      if (clamped > newMax) newMax = clamped;
      return clamped;
    });
    if (newMin === Infinity) { newMin = 0; newMax = 10; }
    if (newMax <= newMin) newMax = newMin + 1;
    setMeshData({ ...meshData, grid: sanitizedGrid, minEv: newMin, maxEv: newMax });
    if (customLotPts && customLotPts.length > 0) {
      const cols = meshData.cols || meshData.size || 150;
      const rows = meshData.rows || meshData.size || 150;
      setCustomLotPts(
        customLotPts.map((pt) => {
          const r = Math.min(rows - 1, Math.max(0, Math.floor(pt.y)));
          const c = Math.min(cols - 1, Math.max(0, Math.floor(pt.x)));
          return { ...pt, elev: sanitizedGrid[r * cols + c] ?? newMin };
        })
      );
    }
  }, [meshData]);

  // Auto-recover missing OSM buildings/highways if an active terrain has bbox but buildings failed earlier
  useEffect(() => {
    if (
      !meshData ||
      !meshData.bbox ||
      (meshData.buildings && Array.isArray(meshData.buildings.elements))
    ) {
      return;
    }
    let cancelled = false;
    fetchOsmLayersForBBox(meshData.bbox).then((recovered) => {
      if (!cancelled && recovered && Array.isArray(recovered.elements)) {
        setMeshData((prev) =>
          prev && prev.bbox === meshData.bbox ? { ...prev, buildings: recovered } : prev
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [meshData]);

  // Initial mount: restore session from IndexedDB if available
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const session = await loadSession();
        if (cancelled) return;
        if (session && session.meshData) {
          setMeshData(session.meshData);
          if (session.customLotPts !== undefined) setCustomLotPts(session.customLotPts);
          if (session.fileName) setFileName(session.fileName);
          if (session.analysisMode) setAnalysisMode(session.analysisMode as AnalysisMode);
          if (session.crs) setCrs(session.crs);
          if (session.location) {
            setLocationLat(session.location.lat);
            setLocationLon(session.location.lon);
          }
          if (session.interval !== undefined) setInterval(session.interval);
          if (session.zExaggeration !== undefined) setZExaggeration(session.zExaggeration);
          if (session.viewerMode) setViewerMode(session.viewerMode as any);
          if (session.colorPalette) setColorPalette(session.colorPalette as any);

          if (session.ogucParams) {
            if (session.ogucParams.ogucAngle !== undefined) setOgucAngle(session.ogucParams.ogucAngle);
            if (session.ogucParams.ogucRegionGroup !== undefined) setOgucRegionGroup(session.ogucParams.ogucRegionGroup);
            if (session.ogucParams.ogucRasanteStartHeight !== undefined) setOgucRasanteStartHeight(session.ogucParams.ogucRasanteStartHeight);
            if (session.ogucParams.ogucApplyExtraSetback !== undefined) setOgucApplyExtraSetback(session.ogucParams.ogucApplyExtraSetback);
            if (session.ogucParams.ogucContinuousBaseHeight !== undefined) setOgucContinuousBaseHeight(session.ogucParams.ogucContinuousBaseHeight);
            if (session.ogucParams.ogucMaxHeight !== undefined) setOgucMaxHeight(session.ogucParams.ogucMaxHeight);
            if (session.ogucParams.ogucMinSetback !== undefined) setOgucMinSetback(session.ogucParams.ogucMinSetback);
            if (session.ogucParams.showOgucShadows !== undefined) setShowOgucShadows(session.ogucParams.showOgucShadows);
          }

          if (session.solarParams) {
            if (session.solarParams.solarDate !== undefined) setSolarDate(session.solarParams.solarDate);
            if (session.solarParams.solarTime !== undefined) setSolarTime(session.solarParams.solarTime);
            if (session.solarParams.solarDayPreset !== undefined) setSolarDayPreset(session.solarParams.solarDayPreset);
            if (session.solarParams.showSunPath !== undefined) setShowSunPath(session.solarParams.showSunPath);
            if (session.solarParams.showSolarShadows !== undefined) setShowSolarShadows(session.solarParams.showSolarShadows);
          }

          setIsDone(true);
          setShowRestoreToast(true);
          setTimeout(() => {
            if (!cancelled) setShowRestoreToast(false);
          }, 4000);
        }
      } catch (err) {
        console.warn('[App] Error restaurando sesión desde IndexedDB:', err);
      } finally {
        if (!cancelled) {
          isRestoringSessionRef.current = false;
        }
      }
    }

    restore();

    return () => {
      cancelled = true;
    };
  }, []);

  // Reactive auto-save to IndexedDB with 500ms debounce
  useEffect(() => {
    if (isRestoringSessionRef.current || !meshData) return;

    const timer = setTimeout(() => {
      saveSession({
        version: 1,
        timestamp: Date.now(),
        fileName,
        meshData,
        customLotPts,
        analysisMode,
        crs,
        interval,
        zExaggeration,
        location: { lat: locationLat, lon: locationLon },
        viewerMode,
        colorPalette,
        ogucParams: {
          ogucAngle,
          ogucRegionGroup,
          ogucRasanteStartHeight,
          ogucApplyExtraSetback,
          ogucContinuousBaseHeight,
          ogucMaxHeight,
          ogucMinSetback,
          showOgucShadows
        },
        solarParams: {
          solarDate,
          solarTime,
          solarDayPreset,
          showSunPath,
          showSolarShadows
        }
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [
    meshData, customLotPts, analysisMode, crs, fileName, interval, zExaggeration,
    locationLat, locationLon, viewerMode, colorPalette,
    ogucAngle, ogucRegionGroup, ogucRasanteStartHeight, ogucApplyExtraSetback,
    ogucContinuousBaseHeight, ogucMaxHeight, ogucMinSetback, showOgucShadows,
    solarDate, solarTime, solarDayPreset, showSunPath, showSolarShadows
  ]);

  const handleResetConfirm = async () => {
    try {
      await clearSession();
    } catch (err) {
      console.warn('[App] Error al limpiar sesión en IndexedDB:', err);
    }
    setMeshData(undefined);
    setCustomLotPts(null);
    setFileName('terreno_osm.json');
    setIsDone(false);
    setIsLocalMeshActive(false);
    setOgucAngle(70);
    setOgucRegionGroup(3);
    setOgucRasanteStartHeight(2.5);
    setOgucApplyExtraSetback(false);
    setOgucContinuousBaseHeight(0);
    setOgucMaxHeight(14);
    setOgucMinSetback(3);
    setShowOgucShadows(true);
    setSolarDate('2024-06-21');
    setSolarTime(12);
    setSolarDayPreset('solstice_winter');
    setShowSunPath(true);
    setShowSolarShadows(true);
    setShowResetConfirm(false);
  };

  const handleSimulateProcess = async () => {
    setIsProcessing(true);
    setIsDone(false);

    await new Promise(r => setTimeout(r, 600));

    setIsProcessing(false);
    setIsDone(true);
  };

  const handleOsmDataFetched = (data: any, name: string) => {
    setOsmDataRaw(data);
    setFileName(name);

    if (data && data.type === 'topo' && data.topoData && data.topoData.results) {
      const steps = data.steps || 10;

      // Build a 10x10 elevation array
      const elevArray = new Float32Array(steps * steps);
      let minEv = Infinity;
      let maxEv = -Infinity;

      data.topoData.results.forEach((res: any) => {
        let elevation = res.elevation;
        if (elevation !== null && elevation !== undefined && elevation > -10000) {
          elevation = Math.max(0, elevation);
          if (elevation < minEv) minEv = elevation;
          if (elevation > maxEv) maxEv = elevation;
        }
      });

      if (minEv === Infinity) { minEv = 0; maxEv = 10; }
      if (maxEv === minEv) { maxEv = minEv + 1; }

      const fallbackEv = minEv;

      data.topoData.results.forEach((res: any, idx: number) => {
        let elevation = res.elevation;
        if (elevation == null || Number.isNaN(elevation) || elevation < -10000) elevation = fallbackEv;
        else elevation = Math.max(0, elevation);
        elevArray[idx] = elevation;
      });

      // We want to interpolate this to a maxDim grid (e.g. 150x150)
      const maxDim = 150;
      const { minLat, maxLat, minLon, maxLon } = data.bbox;
      const latRange = maxLat - minLat || 1;
      const lonRange = (maxLon - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180) || 1;

      let cols, rows;
      if (lonRange > latRange) {
        cols = maxDim;
        rows = Math.max(10, Math.floor(maxDim * (latRange / lonRange)));
      } else {
        rows = maxDim;
        cols = Math.max(10, Math.floor(maxDim * (lonRange / latRange)));
      }

      const grid = new Float32Array(cols * rows);

      // Bilinear interpolation from steps x steps to cols x rows
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // position in original grid (0 to steps - 1)
          const srcY = (r / Math.max(1, rows - 1)) * (steps - 1);
          const srcX = (c / Math.max(1, cols - 1)) * (steps - 1);

          const y0 = Math.floor(srcY);
          const y1 = Math.min(steps - 1, y0 + 1);
          const x0 = Math.floor(srcX);
          const x1 = Math.min(steps - 1, x0 + 1);

          const ty = srcY - y0;
          const tx = srcX - x0;

          const v00 = elevArray[y0 * steps + x0];
          const v10 = elevArray[y0 * steps + x1];
          const v01 = elevArray[y1 * steps + x0];
          const v11 = elevArray[y1 * steps + x1];

          const val = (1 - ty) * ((1 - tx) * v00 + tx * v10) + ty * ((1 - tx) * v01 + tx * v11);
          grid[r * cols + c] = val;
        }
      }

      // A light smooth to remove any pixel stepping artifacts from the Terrarium DEM
      let currentGrid = grid;
      let tempGrid = new Float32Array(cols * rows);
      const BLUR_PASSES = 1;

      for (let pass = 0; pass < BLUR_PASSES; pass++) {
        // Horizontal pass
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let sum = 0, count = 0;
            for (let dc = -1; dc <= 1; dc++) {
              const nc = c + dc;
              if (nc >= 0 && nc < cols) {
                sum += currentGrid[r * cols + nc];
                count++;
              }
            }
            tempGrid[r * cols + c] = sum / count;
          }
        }

        // Vertical pass
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let sum = 0, count = 0;
            for (let dr = -1; dr <= 1; dr++) {
              const nr = r + dr;
              if (nr >= 0 && nr < rows) {
                sum += tempGrid[nr * cols + c];
                count++;
              }
            }
            currentGrid[r * cols + c] = sum / count;
          }
        }
      }

      setMeshData({
        grid: Array.from(currentGrid),
        minEv,
        maxEv,
        w: Math.abs(lonRange * 111320),
        h: Math.abs(latRange * 111320),
        size: Math.max(cols, rows),
        cols,
        rows,
        buildings: data.buildings,
        bbox: data.bbox,
        satelliteTexture: data.satellite?.dataUrl,
        satelliteWorldFile: data.satellite?.worldFile,
      } as any);

      // Auto-assign the drawn polygon as the lot in the 3D viewer
      if (data.lotPolygon && Array.isArray(data.lotPolygon) && data.lotPolygon.length >= 3) {
        const rawLonRange = maxLon - minLon || 1;
        const lotPts = data.lotPolygon.map(([pLat, pLon]: [number, number]) => {
          const x = Math.max(0, Math.min(cols - 1, ((pLon - minLon) / rawLonRange) * cols));
          const y = Math.max(0, Math.min(rows - 1, ((maxLat - pLat) / latRange) * rows));
          const r = Math.min(rows - 1, Math.max(0, Math.floor(y)));
          const c = Math.min(cols - 1, Math.max(0, Math.floor(x)));
          const elev = currentGrid[r * cols + c] || minEv;
          return { x, y, elev };
        });
        setCustomLotPts(lotPts);
      }

      if (data.bbox) {
        setLocationLat((data.bbox.minLat + data.bbox.maxLat) / 2);
        setLocationLon((data.bbox.minLon + data.bbox.maxLon) / 2);
      }

    } else {
      setMeshData(undefined);
    }

    setIsDone(true);
    setIsLocalMeshActive(false);
  };

  const handleExportGeoarc = () => {
    const sceneState = {
      version: "1.0",
      topographic: {
        interval,
        zExaggeration,
        crs,
        minElevation,
        maxElevation,
        colorPalette,
        masterIntervalCount,
        showContourLabels,
        analysisMode,
        locationLat,
        locationLon
      },
      oguc: {
        ogucAngle,
        ogucRegionGroup,
        ogucRasanteStartHeight,
        ogucApplyExtraSetback,
        ogucContinuousBaseHeight,
        ogucMaxHeight,
        ogucMinSetback,
        showOgucShadows,
        customLotPts
      },
      solar: {
        solarDate,
        solarTime,
        solarDayPreset,
        showSunPath,
        showSolarShadows
      },
      layers: {
        showContextBuildings,
        showHighways,
        showWaterways
      },
      meshData,
      fileName,
      dataSource: 'osm'
    };

    const jsonString = JSON.stringify(sceneState);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/\.[^/.]+$/, "") + ".geoarc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportGeoarc = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const content = ev.target?.result as string;
          const state = JSON.parse(content);
          
          if (state.topographic) {
            if (state.topographic.interval !== undefined) setInterval(state.topographic.interval);
            if (state.topographic.zExaggeration !== undefined) setZExaggeration(state.topographic.zExaggeration);
            if (state.topographic.crs !== undefined) setCrs(state.topographic.crs);
            if (state.topographic.minElevation !== undefined) setMinElevation(state.topographic.minElevation);
            if (state.topographic.maxElevation !== undefined) setMaxElevation(state.topographic.maxElevation);
            if (state.topographic.colorPalette !== undefined) setColorPalette(state.topographic.colorPalette);
            if (state.topographic.masterIntervalCount !== undefined) setMasterIntervalCount(state.topographic.masterIntervalCount);
            if (state.topographic.showContourLabels !== undefined) setShowContourLabels(state.topographic.showContourLabels);
            if (state.topographic.analysisMode !== undefined) setAnalysisMode(state.topographic.analysisMode);
            if (state.topographic.locationLat !== undefined) setLocationLat(state.topographic.locationLat);
            if (state.topographic.locationLon !== undefined) setLocationLon(state.topographic.locationLon);
          }
          
          if (state.oguc) {
            if (state.oguc.ogucAngle !== undefined) setOgucAngle(state.oguc.ogucAngle);
            if (state.oguc.ogucRegionGroup !== undefined) setOgucRegionGroup(state.oguc.ogucRegionGroup);
            if (state.oguc.ogucRasanteStartHeight !== undefined) setOgucRasanteStartHeight(state.oguc.ogucRasanteStartHeight);
            if (state.oguc.ogucApplyExtraSetback !== undefined) setOgucApplyExtraSetback(state.oguc.ogucApplyExtraSetback);
            if (state.oguc.ogucContinuousBaseHeight !== undefined) setOgucContinuousBaseHeight(state.oguc.ogucContinuousBaseHeight);
            if (state.oguc.ogucMaxHeight !== undefined) setOgucMaxHeight(state.oguc.ogucMaxHeight);
            if (state.oguc.ogucMinSetback !== undefined) setOgucMinSetback(state.oguc.ogucMinSetback);
            if (state.oguc.showOgucShadows !== undefined) setShowOgucShadows(state.oguc.showOgucShadows);
            if (state.oguc.customLotPts !== undefined) setCustomLotPts(state.oguc.customLotPts);
          }
          
          if (state.solar) {
            if (state.solar.solarDate !== undefined) setSolarDate(state.solar.solarDate);
            if (state.solar.solarTime !== undefined) setSolarTime(state.solar.solarTime);
            if (state.solar.solarDayPreset !== undefined) setSolarDayPreset(state.solar.solarDayPreset);
            if (state.solar.showSunPath !== undefined) setShowSunPath(state.solar.showSunPath);
            if (state.solar.showSolarShadows !== undefined) setShowSolarShadows(state.solar.showSolarShadows);
          }
          
          if (state.layers) {
            if (state.layers.showContextBuildings !== undefined) setShowContextBuildings(state.layers.showContextBuildings);
            if (state.layers.showHighways !== undefined) setShowHighways(state.layers.showHighways);
            if (state.layers.showWaterways !== undefined) setShowWaterways(state.layers.showWaterways);
          }
          
          if (state.meshData) {
            setMeshData(state.meshData);
            setIsDone(true);
          }
          
          if (state.fileName) setFileName(state.fileName);
          
        } catch (err) {
          alert("Error al cargar el archivo .geoarc");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleExportObjZip = async () => {
    if (!meshData) return;
    setIsExporting(true);
    try {
      await exportToObjZip({
        meshData,
        satelliteDataUrl: showSatelliteLayer ? meshData.satelliteTexture : undefined,
        worldFile: meshData.satelliteWorldFile,
        crs,
        zExaggeration,
        fileName: fileName.replace(/\.[^/.]+$/, ''),
        includeBuildings: showContextBuildings
      });
    } catch (err) {
      console.error(err);
      alert('Error al exportar archivo OBJ.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportGlbBinary = async () => {
    if (!meshData) return;
    setIsExporting(true);
    try {
      await exportToGlb({
        meshData,
        satelliteDataUrl: showSatelliteLayer ? meshData.satelliteTexture : undefined,
        zExaggeration,
        fileName: fileName.replace(/\.[^/.]+$/, ''),
        includeBuildings: showContextBuildings
      });
    } catch (err) {
      console.error(err);
      alert('Error al exportar archivo GLB para SketchUp.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadOrthophoto = async () => {
    if (!meshData?.satelliteTexture) return;
    try {
      const res = await fetch(meshData.satelliteTexture);
      const blob = await res.blob();
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      triggerBrowserDownload(blob, `${baseName}_ortofoto.jpg`);
      if (meshData.satelliteWorldFile) {
        const jgwBlob = new Blob([meshData.satelliteWorldFile], { type: 'text/plain' });
        triggerBrowserDownload(jgwBlob, `${baseName}_ortofoto.jgw`);
      }
    } catch (err) {
      console.error(err);
      alert('Error al descargar ortofoto.');
    }
  };

  const handleMeshUpload = async (file: File) => {
    if (!file) return;
    setMeshUploadError(null);
    if (file.size > 50 * 1024 * 1024) {
      setMeshUploadError(
        'El archivo supera el límite recomendado de 50 MB. Simplifica la densidad de polígonos en Blender o CloudCompare antes de importarlo.'
      );
      return;
    }

    setIsMeshUploading(true);
    try {
      const processed = await processMeshFile(file, 150);
      setMeshData(processed);
      setFileName(file.name);
      setIsDone(true);
      setCustomLotPts(null);
      setIsLocalMeshActive(true);
      setViewerMode('technical');
    } catch (err: any) {
      console.error('Error al procesar malla 3D local:', err);
      setMeshUploadError(
        err?.message ||
          'El archivo no contiene vértices válidos o el formato no es compatible. Exporta la malla en formato .PLY binario o .FBX estándar con escala métrica e inténtalo nuevamente.'
      );
    } finally {
      setIsMeshUploading(false);
    }
  };

  const handleMeshFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleMeshUpload(file);
      e.target.value = '';
    }
  };

  const handleMeshFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleMeshUpload(file);
    }
  };

  const handleDiscardMesh = () => {
    const confirm = window.confirm(
      'Descartar Malla 3D: ¿Deseas descartar la malla cargada y volver a la selección de terreno por mapa? Se perderán las cotas actuales.'
    );
    if (!confirm) return;
    setMeshData(undefined);
    setIsDone(false);
    setIsLocalMeshActive(false);
    setCustomLotPts(null);
    setTerrainSourceTab('osm');
  };

  const handleExportSvgSheet = () => {
    if (!meshData) return;
    exportToSvg({
      meshData,
      fileName,
      crs,
      interval,
      masterIntervalCount,
      showContourLabels,
      customLotPts,
      layerVisibility: {
        buildings: showContextBuildings,
        highways: showHighways,
        waterways: showWaterways,
      },
    });
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg-base text-text-main font-sans flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-border-main flex items-center justify-between px-5 bg-bg-surface z-30 transition-colors duration-300">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-8 h-8 rounded-sm border border-border-main hover:border-accent bg-bg-elevated flex items-center justify-center text-text-faded hover:text-accent transition-colors cursor-pointer"
              title={isSidebarOpen ? "Ocultar panel lateral (Pantalla completa)" : "Mostrar panel lateral"}
            >
              {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
            <h1 className="text-lg tracking-[0.2em] font-light text-text-main flex items-center">
              GEO<span className="text-accent font-bold">·</span>ARC
            </h1>
            <p className="text-[10px] text-text-faded uppercase tracking-tighter italic border-l border-border-main pl-4 hidden md:block">
              ASISTENTE SIG PARA ARQUITECTURA
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-text-faded hover:text-accent transition-colors border border-border-main hover:border-accent bg-bg-surface px-3 py-1.5 rounded-sm cursor-pointer"
              title="Restablecer proyecto y limpiar almacenamiento local IndexedDB"
              aria-label="Restablecer sesión activa y comenzar nuevo proyecto"
            >
              <RotateCcw size={13} />
              <span>Nueva Sesión</span>
            </button>
            <button onClick={handleExportGeoarc} className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-text-faded hover:text-accent transition-colors border border-border-main hover:border-accent bg-bg-surface px-3 py-1.5 rounded-sm cursor-pointer" title="Exportar Escena (.geoarc)">
               <Download size={13} /> Exportar
            </button>
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-text-faded hover:text-accent transition-colors border border-border-main hover:border-accent bg-bg-surface px-3 py-1.5 rounded-sm cursor-pointer" title="Importar Escena (.geoarc)">
               <Upload size={13} /> Importar
               <input type="file" accept=".geoarc" className="hidden" onChange={handleImportGeoarc} />
            </label>
            <div className="w-[1px] h-5 bg-border-main mx-1"></div>
            <button
              onClick={() => setIsLightMode(!isLightMode)}
              className="w-8 h-8 rounded-full border border-border-strong bg-bg-elevated flex items-center justify-center text-text-faded hover:text-accent transition-colors cursor-pointer"
              title={isLightMode ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
            >
              {isLightMode ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <div className="w-8 h-8 rounded-full border border-accent/30 bg-bg-elevated flex items-center justify-center">
              <MapPin className="text-accent" size={14} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-3 gap-3 w-full h-[calc(100vh-3.5rem)]">
        {/* Left Column - Input Panel (Collapsible & Scrollable) */}
        <AnimatePresence initial={false}>
          {isSidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="shrink-0 h-full flex flex-col gap-3 overflow-y-auto pr-1 custom-scrollbar overflow-x-hidden"
            >
              <div className="bg-bg-surface p-4 rounded-sm border border-border-main transition-colors duration-300">
                <div className="flex items-center justify-between mb-3 border-b border-border-main pb-3">
                  <h2 className="text-[10px] uppercase tracking-[0.15em] text-accent font-semibold flex items-center gap-2">
                    <Globe size={14} />
                    1. Selección de terreno
                  </h2>
                </div>

                {/* Segmented Control for Terrain Source */}
                <div className="flex bg-bg-elevated p-1 rounded-sm border border-border-main mb-3">
                  <button
                    onClick={() => setTerrainSourceTab('osm')}
                    className={`flex-1 text-[9px] uppercase tracking-widest font-bold py-1.5 rounded-sm transition-colors cursor-pointer ${
                      terrainSourceTab === 'osm'
                        ? 'bg-bg-surface text-accent shadow-sm'
                        : 'text-text-faded hover:text-text-main'
                    }`}
                  >
                    Satelital OSM
                  </button>
                  <button
                    onClick={() => setTerrainSourceTab('mesh')}
                    className={`flex-1 text-[9px] uppercase tracking-widest font-bold py-1.5 rounded-sm transition-colors cursor-pointer ${
                      terrainSourceTab === 'mesh'
                        ? 'bg-bg-surface text-accent shadow-sm'
                        : 'text-text-faded hover:text-text-main'
                    }`}
                  >
                    Malla 3D (.PLY / .FBX)
                  </button>
                </div>

                {terrainSourceTab === 'osm' ? (
                  <OsmImporter onDataFetched={handleOsmDataFetched} />
                ) : (
                  <div className="space-y-3">
                    {/* Error Banner */}
                    {meshUploadError && (
                      <div className="p-3 rounded-sm bg-red-950/30 border border-red-500/40 text-xs text-red-200 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="leading-relaxed text-[11px]">{meshUploadError}</span>
                          <button
                            onClick={() => setMeshUploadError(null)}
                            className="text-red-400 hover:text-red-100 cursor-pointer font-bold shrink-0"
                            title="Descartar aviso"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Processing State */}
                    {isMeshUploading ? (
                      <div className="flex flex-col items-center justify-center p-6 bg-bg-elevated/40 rounded-sm border border-border-main text-center">
                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p className="text-[10px] font-mono text-accent uppercase tracking-widest">
                          Procesando geometría 3D y calculando cotas...
                        </p>
                      </div>
                    ) : isLocalMeshActive && meshData ? (
                      /* Populated Active Mesh Card */
                      <div className="bg-bg-elevated/60 border border-border-main rounded-sm p-3.5 space-y-3">
                        <div className="flex items-center justify-between border-b border-border-main pb-2">
                          <span className="text-xs font-bold text-text-main truncate max-w-[180px]" title={fileName}>
                            {fileName}
                          </span>
                          <span className="text-[9px] font-mono text-green-400 bg-green-950/40 border border-green-500/30 px-1.5 py-0.5 rounded-xs">
                            ✓ Malla 3D Activa
                          </span>
                        </div>
                        <div className="space-y-1.5 text-[10px] font-mono text-text-faded">
                          <div className="flex justify-between">
                            <span>Dimensiones:</span>
                            <span className="text-text-main">{meshData.w.toFixed(1)}m × {meshData.h.toFixed(1)}m</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Elevación:</span>
                            <span className="text-text-main">
                              Min: {meshData.minEv.toFixed(1)}m | Max: {meshData.maxEv.toFixed(1)}m (Δ: {(meshData.maxEv - meshData.minEv).toFixed(1)}m)
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Grilla:</span>
                            <span className="text-text-main">{meshData.cols || 150} × {meshData.rows || 150} celdas</span>
                          </div>
                          {!meshData.bbox && (
                            <p className="text-[9px] text-text-subtle italic pt-1">
                              Malla Local sin capas OSM contextuales
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1 border-t border-border-main">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 bg-bg-surface border border-border-main hover:border-accent text-[9px] font-bold uppercase tracking-wider py-1.5 px-2 rounded-sm text-text-main transition-colors cursor-pointer text-center"
                          >
                            Reemplazar Malla
                          </button>
                          <button
                            onClick={handleDiscardMesh}
                            className="flex-1 bg-red-950/30 border border-red-800/40 hover:border-red-600 text-[9px] font-bold uppercase tracking-wider py-1.5 px-2 rounded-sm text-red-300 hover:text-red-100 transition-colors cursor-pointer text-center"
                          >
                            Descartar Malla
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Idle / Dropzone State */
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={handleMeshFileDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className="border-dashed border border-border-strong hover:border-accent bg-bg-elevated/40 p-5 rounded-sm text-center transition-colors cursor-pointer group"
                      >
                        <Upload size={20} className="mx-auto text-accent mb-2 group-hover:scale-110 transition-transform" />
                        <p className="text-xs font-bold text-text-main mb-1">Arrastra tu malla 3D aquí</p>
                        <p className="text-[10px] text-text-faded leading-relaxed mb-3">
                          Formatos: .PLY (Point Cloud / Mesh) o .FBX (ASCII / Binary) hasta 50MB
                        </p>
                        <button
                          type="button"
                          className="bg-bg-surface border border-border-main hover:border-accent text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-sm text-text-main transition-colors"
                        >
                          Seleccionar Archivo Local
                        </button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".ply,.fbx"
                      onChange={handleMeshFileInputChange}
                      className="hidden"
                    />
                  </div>
                )}
              </div>

              <div className="bg-bg-surface p-4 rounded-sm border border-border-main transition-colors duration-300">
                <h2 className="text-[10px] uppercase tracking-[0.15em] text-accent mb-4 font-semibold underline underline-offset-8 decoration-1 flex items-center gap-2">
                  <Settings2 size={14} />
                  2. Parámetros de Extracción
                </h2>

            <div className="space-y-4">
              {/* Selector de Modo */}
              <div>
                <label className="text-[10px] text-text-faded block mb-3 uppercase tracking-wide">
                  Modo de Análisis
                </label>
                <div className="flex bg-bg-elevated p-1 rounded-sm border border-border-main">
                  {(['topographic', 'oguc', 'solar'] as const).map(mode => (
                    <button key={mode} onClick={() => setAnalysisMode(mode)} className={`flex-1 text-[9px] uppercase tracking-widest font-bold py-1.5 rounded-sm transition-colors ${analysisMode === mode ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-faded hover:text-text-main'}`}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ubicación (Común para OGUC/Solar pero útil general) */}
              <div className="grid grid-cols-2 gap-4 border-b border-border-main pb-4">
                 <div>
                   <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide">Latitud</label>
                   <input type="number" step="0.0001" value={locationLat} onChange={e => setLocationLat(Number(e.target.value))} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" />
                 </div>
                 <div>
                   <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide">Longitud</label>
                   <input type="number" step="0.0001" value={locationLon} onChange={e => setLocationLon(Number(e.target.value))} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" />
                 </div>
                 <div className="col-span-2 flex gap-2">
                   <button onClick={() => { setLocationLat(-38.7359); setLocationLon(-72.5904); }} className="flex-1 text-[9px] bg-bg-elevated border border-border-main px-1 py-1 rounded-sm hover:border-accent text-text-faded hover:text-text-main transition-colors uppercase tracking-widest text-center">
                     Temuco
                   </button>
                   <button onClick={() => { setLocationLat(-36.83); setLocationLon(-73.05); }} className="flex-1 text-[9px] bg-bg-elevated border border-border-main px-1 py-1 rounded-sm hover:border-accent text-text-faded hover:text-text-main transition-colors uppercase tracking-widest text-center">
                     Concepción
                   </button>
                   <button onClick={() => { setLocationLat(-33.4489); setLocationLon(-70.6693); }} className="flex-1 text-[9px] bg-bg-elevated border border-border-main px-1 py-1 rounded-sm hover:border-accent text-text-faded hover:text-text-main transition-colors uppercase tracking-widest text-center">
                     Santiago
                   </button>
                 </div>
              </div>

              {/* Controles Topográficos */}
              {analysisMode === 'topographic' && (
                <>
                  <div>
                    <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide flex justify-between">
                      Intervalo de Curvas (metros)
                      <span className="text-accent font-mono">{interval}m</span>
                    </label>
                    <div className="flex gap-1.5 mb-3">
                      {[0.25, 0.5, 1, 5, 10].map(val => (
                        <button key={val} onClick={() => setInterval(val)} className={`flex-1 py-1 rounded-sm text-[9px] font-mono border transition-colors ${interval === val ? 'bg-accent/10 border-accent text-accent font-bold' : 'border-border-main text-text-faded hover:text-text-main'}`}>
                          {val}m
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="10"
                      step="0.25"
                      value={interval}
                      onChange={(e) => setInterval(parseFloat(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <p className="text-[9px] text-text-subtle tracking-widest mt-2 uppercase">Distancia vertical entre cada curva de nivel</p>
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-text-faded block mb-3 uppercase tracking-wide flex justify-between">
                      Paleta de Colores
                    </label>
                    <div className="flex bg-bg-elevated p-1 rounded-sm border border-border-main">
                      {(['tecnico', 'termico', 'hipso'] as const).map(p => (
                        <button key={p} onClick={() => setColorPalette(p)} className={`flex-1 text-[9px] uppercase tracking-widest font-bold py-1.5 rounded-sm transition-colors ${colorPalette === p ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-faded hover:text-text-main'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-text-subtle tracking-widest mt-2 uppercase">Estilo visual didáctico para el mapa</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide">Cota Mínima</label>
                       <input type="number" value={minElevation} onChange={e => setMinElevation(e.target.value ? Number(e.target.value) : '')} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" placeholder="Auto" />
                     </div>
                     <div>
                       <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide">Cota Máxima</label>
                       <input type="number" value={maxElevation} onChange={e => setMaxElevation(e.target.value ? Number(e.target.value) : '')} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" placeholder="Auto" />
                     </div>
                     <div className="col-span-2">
                        <p className="text-[9px] text-text-subtle tracking-widest uppercase">Filtra el rango visible (opcional)</p>
                     </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-text-faded block mb-3 uppercase tracking-wide flex justify-between">
                      Exageración Vertical (Eje Z)
                      <span className="text-accent font-mono">{zExaggeration}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={zExaggeration}
                      onChange={(e) => setZExaggeration(parseFloat(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <p className="text-[9px] text-text-subtle tracking-widest mt-2 uppercase">Ajusta la escala altimétrica visual</p>
                  </div>

                  <div>
                    <label className="text-[10px] text-text-faded block mb-3 uppercase tracking-wide">
                      Sistema de Referencia (CRS)
                    </label>
                    <select
                      value={crs}
                      onChange={(e) => setCrs(e.target.value)}
                      className="w-full bg-bg-elevated border border-border-main text-xs p-2.5 rounded-sm outline-none text-text-main focus:border-accent transition-colors cursor-pointer"
                    >
                      {Object.values(SUPPORTED_CRS).map((def) => (
                        <option key={def.code} value={def.code}>
                          {def.code} — {def.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[9px] text-text-subtle tracking-widest mt-2 uppercase">Normalización de coordenadas métricas</p>
                  </div>

                  <div className="flex items-center gap-2 mt-2 border-t border-border-main pt-4">
                    <input type="checkbox" id="showContourLabels" checked={showContourLabels} onChange={e => setShowContourLabels(e.target.checked)} className="accent-accent w-4 h-4" />
                    <label htmlFor="showContourLabels" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Mostrar cotas (Planta)</label>
                  </div>
                </>
              )}

              {/* Controles OGUC */}
              {analysisMode === 'oguc' && (
                <>
                  <div className="bg-accent/10 border border-accent/20 p-3 rounded-sm mb-4">
                    <p className="text-[9px] text-text-main italic">Las sombras OGUC usan ángulos normativos simplificados para docencia. No corresponde a un cálculo oficial para DOM.</p>
                  </div>

                  <div className="mb-6 flex gap-2">
                    <button 
                      onClick={() => {
                        if (!isDrawingLot) {
                          setCustomLotPts([]);
                          setIsDrawingLot(true);
                        } else {
                          if (!customLotPts || customLotPts.length < 3) {
                            setCustomLotPts(null);
                          }
                          setIsDrawingLot(false);
                        }
                      }} 
                      className={`flex-1 flex items-center justify-center gap-2 text-[9px] uppercase tracking-widest border px-2 py-2 rounded-sm transition-colors cursor-pointer ${isDrawingLot ? 'bg-accent/20 border-accent text-accent font-bold' : 'bg-bg-elevated border-border-main text-text-faded hover:text-text-main'}`}
                    >
                      <MapPin size={12} />
                      {isDrawingLot ? `Terminar (${customLotPts?.length || 0} pts)` : 'Dibujar Lote'}
                    </button>
                    {customLotPts && customLotPts.length > 0 && (
                      <button 
                        onClick={() => {setCustomLotPts(null); setIsDrawingLot(false);}} 
                        className="text-[9px] uppercase tracking-widest border border-border-main px-2 py-2 rounded-sm text-text-faded hover:text-accent transition-colors cursor-pointer"
                        title="Restaurar lote por defecto"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Bloque A — Rasantes (Art. 2.6.3) */}
                  <div className="mt-4 pt-4 border-t border-border-faded">
                    <h4 className="text-[10px] font-bold text-accent uppercase tracking-widest mb-3">A. Rasantes (Art. 2.6.3)</h4>
                    
                    <div className="mb-4">
                      <label className="text-[9px] text-text-faded block mb-1 uppercase tracking-wide">Grupo de Región</label>
                      <select 
                        value={ogucRegionGroup} 
                        onChange={e => setOgucRegionGroup(Number(e.target.value) as 1 | 2 | 3)}
                        className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors"
                      >
                        <option value={1}>Grupo 1 (Norte): Sur 63°, O/P 28°</option>
                        <option value={2}>Grupo 2 (Centro): Sur 57°, O/P 26°</option>
                        <option value={3}>Grupo 3 (Sur): Sur 51°, O/P 24°</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] text-text-faded block mb-1 uppercase tracking-wide flex items-center">
                        Arranque Rasante (m)
                        <InfoTooltip text="Altura desde la cual comienza a aplicarse el plano de rasante desde el deslinde (Art. 2.6.3 OGUC)." />
                      </label>
                      <input type="number" step="0.5" value={ogucRasanteStartHeight} onChange={e => setOgucRasanteStartHeight(Number(e.target.value))} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" />
                    </div>
                  </div>

                  {/* Bloque B — Distanciamientos (Art. 2.6.3) */}
                  <div className="mt-4 pt-4 border-t border-border-faded">
                    <h4 className="text-[10px] font-bold text-accent uppercase tracking-widest mb-3">B. Distanciamientos</h4>
                    
                    <div className="mb-4">
                      <label className="text-[9px] text-text-faded block mb-1 uppercase tracking-wide flex items-center">
                        Mínimo a deslindes (m)
                      </label>
                      <input type="number" step="0.5" value={ogucMinSetback} onChange={e => setOgucMinSetback(Number(e.target.value))} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" />
                    </div>

                    <div className="flex items-start gap-2">
                      <input type="checkbox" id="ogucApplyExtraSetback" checked={ogucApplyExtraSetback} onChange={e => setOgucApplyExtraSetback(e.target.checked)} className="accent-accent w-4 h-4 mt-0.5 shrink-0" />
                      <label htmlFor="ogucApplyExtraSetback" className="text-[9px] text-text-main uppercase tracking-widest cursor-pointer leading-tight flex items-center">
                        Adicional {'>'} 10.5m (Art. 2.6.12)
                        <InfoTooltip text="Aplica un % de aumento según el grupo de región sobre los pisos que superen 10.5m de altura." />
                      </label>
                    </div>
                  </div>

                  {/* Bloque C — Parámetros del volumen teórico */}
                  <div className="mt-4 pt-4 border-t border-border-faded">
                    <h4 className="text-[10px] font-bold text-accent uppercase tracking-widest mb-3">C. Volumen Teórico</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] text-text-faded block mb-1 uppercase tracking-wide flex items-center">
                          Altura Máx (m)
                          <InfoTooltip text="Según Plan Regulador Comunal aplicable." />
                        </label>
                        <input type="number" step="1" value={ogucMaxHeight} onChange={e => setOgucMaxHeight(Number(e.target.value))} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" />
                      </div>
                      <div>
                        <label className="text-[9px] text-text-faded block mb-1 uppercase tracking-wide flex items-center">
                          Edif. Continua (m)
                        </label>
                        <input type="number" step="1" value={ogucContinuousBaseHeight} onChange={e => setOgucContinuousBaseHeight(Number(e.target.value))} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-faded">
                    <input type="checkbox" id="showOgucShadows" checked={showOgucShadows} onChange={e => setShowOgucShadows(e.target.checked)} className="accent-accent w-4 h-4 shrink-0" />
                    <label htmlFor="showOgucShadows" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Mostrar Sombras Normativas</label>
                  </div>
                </>
              )}

              {/* Controles Solar */}
              {analysisMode === 'solar' && (
                <>
                  <div className="bg-accent/10 border border-accent/20 p-3 rounded-sm">
                    <p className="text-[9px] text-text-main italic">Modo Solar: sombras basadas en la trayectoria real del sol según ubicación y fecha/hora.</p>
                  </div>

                  <div>
                    <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide">Fecha</label>
                    <input type="date" value={solarDate} onChange={e => {setSolarDate(e.target.value); setSolarDayPreset('custom');}} className="w-full bg-bg-elevated border border-border-main text-xs p-2 rounded-sm outline-none text-text-main focus:border-accent transition-colors [color-scheme:dark]" />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => { setSolarDate('2024-06-21'); setSolarDayPreset('solstice_winter'); }} className={`flex-1 text-[9px] border px-1 py-1.5 rounded-sm uppercase tracking-widest transition-colors ${solarDayPreset === 'solstice_winter' ? 'bg-accent/20 border-accent text-accent' : 'bg-bg-elevated border-border-main text-text-faded hover:text-text-main'}`}>Solsticio Inv.</button>
                    <button onClick={() => { setSolarDate('2024-03-21'); setSolarDayPreset('equinox'); }} className={`flex-1 text-[9px] border px-1 py-1.5 rounded-sm uppercase tracking-widest transition-colors ${solarDayPreset === 'equinox' ? 'bg-accent/20 border-accent text-accent' : 'bg-bg-elevated border-border-main text-text-faded hover:text-text-main'}`}>Equinoccio</button>
                    <button onClick={() => { setSolarDate('2024-12-21'); setSolarDayPreset('solstice_summer'); }} className={`flex-1 text-[9px] border px-1 py-1.5 rounded-sm uppercase tracking-widest transition-colors ${solarDayPreset === 'solstice_summer' ? 'bg-accent/20 border-accent text-accent' : 'bg-bg-elevated border-border-main text-text-faded hover:text-text-main'}`}>Solsticio Ver.</button>
                  </div>

                  <div>
                    <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide flex justify-between">
                      Hora
                      <span className="text-accent font-mono">{Math.floor(solarTime).toString().padStart(2, '0')}:{((solarTime % 1) * 60).toFixed(0).padStart(2, '0')}</span>
                    </label>
                    <input type="range" min="6" max="20" step="0.25" value={solarTime} onChange={(e) => setSolarTime(Number(e.target.value))} className="w-full accent-accent" />
                  </div>

                  <div className="flex flex-col gap-3 mt-4 border-t border-border-main pt-4">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="showSunPath" checked={showSunPath} onChange={e => setShowSunPath(e.target.checked)} className="accent-accent w-4 h-4" />
                      <label htmlFor="showSunPath" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Mostrar Arco Solar</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="showSolarShadows" checked={showSolarShadows} onChange={e => setShowSolarShadows(e.target.checked)} className="accent-accent w-4 h-4" />
                      <label htmlFor="showSolarShadows" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Mostrar Sombras</label>
                    </div>
                  </div>
                </>
              )}

              {/* Visibilidad de Capas */}
              <div className="border-t border-border-main pt-4 space-y-3">
                <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide">Visibilidad de Capas OSM</label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="showContextBuildings" checked={showContextBuildings} onChange={e => setShowContextBuildings(e.target.checked)} className="accent-accent w-4 h-4" />
                    <label htmlFor="showContextBuildings" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Edificios de Contexto</label>
                  </div>
                  {meshData?.buildings && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-accent/10 text-accent font-semibold" title="Cantidad de edificios contextuales">
                      {meshData.buildings.elements?.filter((e: any) => e.tags?.building).length || 0}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="showHighways" checked={showHighways} onChange={e => setShowHighways(e.target.checked)} className="accent-accent w-4 h-4" />
                    <label htmlFor="showHighways" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Vías (Calles y Caminos)</label>
                  </div>
                  {meshData?.buildings && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-bg-elevated text-text-main font-semibold" title="Cantidad de trazados viales">
                      {meshData.buildings.elements?.filter((e: any) => e.tags?.highway).length || 0}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="showWaterways" checked={showWaterways} onChange={e => setShowWaterways(e.target.checked)} className="accent-accent w-4 h-4" />
                    <label htmlFor="showWaterways" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer">Cuerpos de Agua</label>
                  </div>
                  {meshData?.buildings && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-bg-elevated text-blue-400 font-semibold" title="Cantidad de cursos de agua">
                      {meshData.buildings.elements?.filter((e: any) => e.tags?.waterway).length || 0}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border-faded">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="showSatelliteLayer" checked={showSatelliteLayer} onChange={e => setShowSatelliteLayer(e.target.checked)} className="accent-accent w-4 h-4 cursor-pointer" />
                    <label htmlFor="showSatelliteLayer" className="text-[10px] text-text-main uppercase tracking-widest cursor-pointer font-semibold">Ortofoto Satelital</label>
                  </div>
                  {meshData?.satelliteTexture ? (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-xs bg-emerald-500/15 text-emerald-500 font-bold" title="Ortofoto satelital de alta resolución cargada">
                      HD ✓
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-text-subtle">
                      Pendiente
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleSimulateProcess}
              disabled={isProcessing}
              className="mt-5 w-full py-2.5 bg-accent text-white text-[10px] font-bold uppercase tracking-widest hover:bg-accent-hover transition-colors rounded-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Procesando Malla...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Beaker size={14} />
                  Generar Visualización 3d
                </span>
              )}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>

    {/* Right Column - Results / Studio Viewport */}
    <section className="flex-1 h-full min-w-0 bg-bg-surface border border-border-main rounded-sm flex flex-col relative overflow-hidden shadow-sm">
      <div className="bg-bg-input flex-1 flex flex-col h-full min-h-0 relative w-full overflow-hidden transition-colors duration-300">

            {/* Grid Overlay inside the panel */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-5" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            {/* Header Panel */}
            <div className="h-11 shrink-0 flex bg-bg-surface border-b border-border-main px-4 items-center justify-between relative z-10 transition-colors duration-300 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <MapIcon size={14} className="text-accent" />
                <span className="text-[10px] uppercase tracking-widest font-semibold text-accent">Visualización</span>

                {meshData && (
                  <div className="flex bg-bg-elevated p-0.5 rounded-sm border border-border-main ml-1">
                    <button
                      onClick={() => setViewerMode('realistic')}
                      className={`px-3 py-1 text-[9px] uppercase tracking-wider font-bold rounded-xs transition-colors cursor-pointer flex items-center gap-1.5 ${viewerMode === 'realistic' ? 'bg-accent text-white shadow-xs' : 'text-text-faded hover:text-text-main'}`}
                      title="Visor 3D WebGL con textura satelital y edificios extruidos (Estilo SketchUp)"
                    >
                      <span>3D Satelital</span>
                      {meshData.satelliteTexture && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
                    </button>
                    <button
                      onClick={() => setViewerMode('technical')}
                      className={`px-3 py-1 text-[9px] uppercase tracking-wider font-bold rounded-xs transition-colors cursor-pointer ${viewerMode === 'technical' ? 'bg-bg-surface text-accent shadow-xs' : 'text-text-faded hover:text-text-main'}`}
                      title="Visor Técnico vectorial con curvas de nivel, cotas métricas y rasantes OGUC"
                    >
                      Topográfico (SVG)
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Export Actions */}
              {meshData && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportObjZip}
                    disabled={isExporting}
                    className="px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold border border-border-main hover:border-accent text-text-faded hover:text-accent rounded-sm bg-bg-elevated transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Descargar paquete 3D .OBJ + .MTL + Textura Satelital para Rhino, Blender, AutoCAD y 3ds Max"
                  >
                    <Download size={12} />
                    <span>Modelo 3D (.OBJ ZIP)</span>
                  </button>
                  <button
                    onClick={handleExportGlbBinary}
                    disabled={isExporting}
                    className="px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold border border-border-main hover:border-accent text-text-faded hover:text-accent rounded-sm bg-bg-elevated transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Descargar modelo 3D en formato .GLB compatible nativamente con SketchUp (con textura satelital incrustada)"
                  >
                    <Download size={12} />
                    <span>SketchUp (.GLB)</span>
                  </button>
                  <button
                    onClick={handleExportSvgSheet}
                    disabled={!meshData}
                    className="px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold border border-border-main hover:border-accent text-text-faded hover:text-accent rounded-sm bg-bg-elevated transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Descargar lámina topográfica vectorial en formato SVG con curvas de nivel y capas activas"
                  >
                    <Download size={12} />
                    <span>Lámina (.SVG)</span>
                  </button>
                  {meshData.satelliteTexture && (
                    <button
                      onClick={handleDownloadOrthophoto}
                      className="px-2.5 py-1 text-[9px] uppercase tracking-wider font-bold border border-border-main hover:border-accent text-text-faded hover:text-accent rounded-sm bg-bg-elevated transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Descargar imagen satelital de alta resolución y archivo .jgw de georreferenciación"
                    >
                      <Download size={12} />
                      <span>Ortofoto (.JPG + .JGW)</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 relative z-10 overflow-hidden w-full h-full flex flex-col p-0">
              {(!isDone && !isProcessing) ? (
                <div className="h-full flex flex-col items-center justify-center text-text-subtle p-6 text-center max-w-md mx-auto">
                  <MapIcon size={36} className="mb-3 opacity-40 text-accent" />
                  <h3 className="text-sm font-bold text-text-main mb-1">Ningún terreno seleccionado</h3>
                  <p className="text-xs text-text-faded leading-relaxed">
                    Delimita un área predial en el mapa satelital OSM o carga una malla 3D local (.PLY / .FBX) para visualizar curvas de nivel y normativa.
                  </p>
                </div>
              ) : isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="flex flex-col gap-4 text-accent animate-pulse items-center">
                    <SlidersHorizontal size={24} />
                    <p className="text-[10px] uppercase tracking-[0.15em] font-semibold">Calculando álgebra de mapas e interpolando vértices...</p>
                  </div>
                </div>
              ) : (
                <div className="w-full flex-1 h-full min-h-0 flex justify-center items-center relative overflow-hidden">
                  {viewerMode === 'realistic' && meshData ? (
                    <ThreeTerrainViewer
                      meshData={meshData}
                      satelliteTextureUrl={showSatelliteLayer ? meshData.satelliteTexture : null}
                      zExaggeration={zExaggeration}
                      interval={interval}
                      locationLat={locationLat}
                      locationLon={locationLon}
                      analysisMode={analysisMode}
                      ogucParams={{
                        regionGroup: ogucRegionGroup,
                        rasanteStartHeight: ogucRasanteStartHeight,
                        minSetback: ogucMinSetback,
                        applyExtraSetback: ogucApplyExtraSetback,
                        maxHeight: ogucMaxHeight,
                        continuousBaseHeight: ogucContinuousBaseHeight,
                        showShadows: showOgucShadows,
                        angle: ogucRegionGroup === 1 ? 63 : ogucRegionGroup === 2 ? 57 : 51
                      }}
                      solarParams={{
                        date: parseLocalSolarDate(solarDate),
                        time: solarTime,
                        showSunPath,
                        showShadows: showSolarShadows
                      }}
                      layerVisibility={{
                        buildings: showContextBuildings,
                        highways: showHighways,
                        waterways: showWaterways
                      }}
                      isDrawingLot={isDrawingLot}
                      setIsDrawingLot={setIsDrawingLot}
                      customLotPts={customLotPts}
                      setCustomLotPts={setCustomLotPts}
                    />
                  ) : (
                    <ContourViewer 
                      interval={interval} 
                      fileName={fileName} 
                      crs={crs}
                      meshData={meshData} 
                      zExaggeration={zExaggeration} 
                      colorPalette={colorPalette}
                      minVisibleElev={minElevation === '' ? undefined : minElevation}
                      maxVisibleElev={maxElevation === '' ? undefined : maxElevation}
                      masterIntervalCount={masterIntervalCount}
                      showContourLabels={showContourLabels}
                      analysisMode={analysisMode}
                      locationLat={locationLat}
                      locationLon={locationLon}
                      ogucParams={{
                        regionGroup: ogucRegionGroup,
                        rasanteStartHeight: ogucRasanteStartHeight,
                        minSetback: ogucMinSetback,
                        applyExtraSetback: ogucApplyExtraSetback,
                        maxHeight: ogucMaxHeight,
                        continuousBaseHeight: ogucContinuousBaseHeight,
                        showShadows: showOgucShadows,
                        angle: ogucRegionGroup === 1 ? 63 : ogucRegionGroup === 2 ? 57 : 51 // Legacy fallback
                      }}
                      solarParams={{
                        date: parseLocalSolarDate(solarDate),
                        time: solarTime,
                        showSunPath,
                        showShadows: showSolarShadows
                      }}
                      layerVisibility={{
                        buildings: showContextBuildings,
                        highways: showHighways,
                        waterways: showWaterways
                      }}
                      isDrawingLot={isDrawingLot}
                      setIsDrawingLot={setIsDrawingLot}
                      customLotPts={customLotPts}
                      setCustomLotPts={setCustomLotPts}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Embedded Bottom Status Bar in Right Panel */}
            <div className="flex border-t border-border-main bg-bg-surface px-4 py-2 items-center justify-between relative z-10 shrink-0 transition-colors duration-300">
              <div className="text-[9px] font-mono text-text-subtle uppercase tracking-widest flex items-center gap-2">
                Render Engine: TopoGen Precision v2.1
                {isDone && <span className="w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_5px_var(--theme-accent)] ml-2"></span>}
              </div>
            </div>

          </div>
        </section>

      </main>

      {/* Toast de Notificación de Sesión Restaurada */}
      {showRestoreToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-14 right-4 z-50 flex items-start gap-3 p-3.5 bg-bg-surface/95 backdrop-blur-sm border border-green-500/30 rounded-sm shadow-xl max-w-sm animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-text-main leading-tight">
              Sesión de trabajo restaurada
            </h4>
            <p className="text-[10px] text-text-faded leading-normal mt-1">
              Se recuperó el terreno y los parámetros previos desde el almacenamiento local IndexedDB.
            </p>
          </div>
          <button
            onClick={() => setShowRestoreToast(false)}
            className="text-text-subtle hover:text-text-main cursor-pointer p-0.5 rounded-xs transition-colors shrink-0"
            title="Cerrar notificación"
            aria-label="Cerrar Notificación"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Modal de Confirmación de Restablecer Sesión */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowResetConfirm(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowResetConfirm(false); }}
          tabIndex={-1}
        >
          <div
            className="bg-bg-surface border border-border-strong rounded-sm p-6 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-accent shrink-0" />
              <h3 id="reset-modal-title" className="text-sm font-bold text-text-main">
                Restablecer Sesión de Trabajo
              </h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              ¿Deseas restablecer la sesión activa? Se eliminarán los datos temporales del terreno, cotas y polígonos almacenados en IndexedDB y se reiniciará el visor al estado base. Los archivos ya exportados (.geoarc, .DXF, .SVG) no se verán afectados.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-main">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="border border-border-main hover:border-border-strong bg-bg-elevated px-4 py-2 rounded-sm text-xs font-semibold text-text-main cursor-pointer transition-colors"
              >
                Conservar Sesión Actual
              </button>
              <button
                type="button"
                onClick={handleResetConfirm}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors shadow-sm"
              >
                Confirmar Restablecimiento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
