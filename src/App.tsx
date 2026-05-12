import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, FileCode, CheckCircle, ListTree, Settings2,
  MapPin, SlidersHorizontal, FileJson, Beaker, Terminal, Map as MapIcon,
  Sun, Moon, Globe
} from 'lucide-react';
import { getPythonCode, getJsonOutput } from './lib/templates';
import ContourViewer from './components/ContourViewer';
import { processMeshFile, MeshData } from './lib/meshProcessor';
import OsmImporter from './components/OsmImporter';

const TABS = [
  { id: 'plan', label: 'Plan de Ejecución', icon: ListTree },
  { id: 'viewer', label: 'Visualización', icon: MapIcon }
];

export default function App() {
  const [interval, setInterval] = useState<number>(1.0);
  const [zExaggeration, setZExaggeration] = useState<number>(1.5);
  const [crs, setCrs] = useState<string>('EPSG:32633');
  
  // Controles topográficos didácticos
  const [minElevation, setMinElevation] = useState<number | ''>('');
  const [maxElevation, setMaxElevation] = useState<number | ''>('');
  const [colorPalette, setColorPalette] = useState<'termico' | 'tecnico' | 'hipso'>('tecnico');
  const [masterIntervalCount, setMasterIntervalCount] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [activeTab, setActiveTab] = useState('plan');

  // Theme state
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, [isLightMode]);

  // File state
  const [fileName, setFileName] = useState<string>('terreno_proyecto.ply');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [meshData, setMeshData] = useState<MeshData | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dataSource, setDataSource] = useState<'file' | 'osm'>('file');
  const [osmDataRaw, setOsmDataRaw] = useState<any>(null);

  const handleSimulateProcess = async () => {
    setIsProcessing(true);
    setIsDone(false);

    if (dataSource === 'osm' && osmDataRaw) {
      // Simulate processing the OSM data into a mesh
      await new Promise(r => setTimeout(r, 2000));
      // The OSM data is already converted to meshData when fetched.
    } else if (dataSource === 'file' && uploadedFile) {
      try {
        const data = await processMeshFile(uploadedFile);
        setMeshData(data);
      } catch (e: any) {
        console.error(e);
        alert("Error procesando malla: " + e.message);
      }
    } else {
      await new Promise(r => setTimeout(r, 1500));
    }

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
        bbox: data.bbox
      } as any);

    } else {
      setMeshData(undefined);
    }

    setIsDone(false);
  };

  const processFile = (file: File) => {
    // Nota: Por ahora solo se soportan FBX y PLY. OBJ queda como candidato para una futura extensión.
    const validExtensions = ['.fbx', '.ply'];
    const isSupported = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    // Validar tamaño máximo (ej. 50 MB)
    const MAX_SIZE = 50 * 1024 * 1024;

    if (!isSupported) {
      alert("Formato no soportado. Por favor sube un archivo en formato FBX o PLY.");
      return;
    }

    if (file.size > MAX_SIZE) {
      alert("El archivo excede el tamaño máximo permitido de 50MB.");
      return;
    }

    setFileName(file.name);
    setUploadedFile(file);
    setIsDone(false);
    setMeshData(undefined);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
    // IMPORTANTE: Resetear el input logicialmente para forzar el evento onChange si se sube el mismo u otro archivo.
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-main font-sans flex flex-col overflow-x-hidden transition-colors duration-300">
      {/* Header */}
      <header className="h-16 border-b border-border-main flex items-center justify-between px-6 bg-bg-surface transition-colors duration-300">
        <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl tracking-[0.2em] font-light text-text-main">GEO<span className="text-accent font-bold">·</span>ARC</h1>
            <p className="text-[10px] text-text-faded uppercase tracking-tighter italic border-l border-border-main pl-6 hidden sm:block">ASISTENTE SIG PARA ARQUITECTURA</p>
          </div>
          <div className="flex items-center gap-4 hidden sm:flex">
            <button
              onClick={() => setIsLightMode(!isLightMode)}
              className="w-8 h-8 rounded-full border border-border-strong bg-bg-elevated flex items-center justify-center text-text-faded hover:text-accent transition-colors"
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

      <main className="w-full max-w-[1600px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">

        {/* Left Column - Input Panel */}
        <section className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-bg-surface p-6 rounded-sm border border-border-main transition-colors duration-300">
            <div className="flex items-center justify-between mb-4 border-b border-border-main pb-4">
              <h2 className="text-[10px] uppercase tracking-[0.15em] text-accent font-semibold flex items-center gap-2">
                <Upload size={14} />
                1. Carga de Geometría
              </h2>
            </div>

            <div className="flex bg-bg-elevated p-1 rounded-sm border border-border-main mb-6">
              <button
                onClick={() => setDataSource('file')}
                className={`flex-1 text-[10px] uppercase tracking-widest font-bold py-2 rounded-sm transition-colors ${dataSource === 'file' ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-faded hover:text-text-main'}`}
              >
                Archivo Local
              </button>
              <button
                onClick={() => setDataSource('osm')}
                className={`flex-1 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest font-bold py-2 rounded-sm transition-colors ${dataSource === 'osm' ? 'bg-bg-surface text-accent shadow-sm' : 'text-text-faded hover:text-text-main'}`}
              >
                <Globe size={12} /> Mapas (OSM)
              </button>
            </div>

            {dataSource === 'file' && (
              <>
                <input
                  type="file"
                  accept=".fbx,.ply"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileInput}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border border-dashed rounded-sm p-8 text-center transition-colors cursor-pointer ${isDragging ? 'bg-bg-elevated border-accent' : 'border-border-strong bg-bg-input hover:bg-bg-elevated hover:border-accent/70'
                    }`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <FileCode size={24} className={fileName !== 'terreno_proyecto.ply' ? 'text-accent' : 'text-accent/50'} />
                    <div className="flex flex-col gap-1 items-center">
                      <p className="text-xs font-mono text-text-main">Arrastra tu archivo FBX o PLY aquí</p>
                      <p className="text-[10px] text-text-subtle font-mono uppercase tracking-widest bg-bg-elevated px-2 py-0.5 rounded-sm border border-border-faded">Máx. 50 MB</p>
                    </div>
                    <p className="text-[10px] text-accent italic mt-1 bg-bg-surface px-3 py-1 rounded-sm border border-accent/20 truncate max-w-full relative group">
                      {fileName}
                    </p>
                    <p className="text-[9px] text-text-subtle uppercase mt-2">O haz clic para explorar</p>
                  </div>
                </div>
              </>
            )}

            {dataSource === 'osm' && (
              <OsmImporter onDataFetched={handleOsmDataFetched} />
            )}
          </div>

          <div className="bg-bg-surface p-6 rounded-sm border border-border-main transition-colors duration-300">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-accent mb-6 font-semibold underline underline-offset-8 decoration-1 flex items-center gap-2">
              <Settings2 size={14} />
              2. Parámetros de Extracción
            </h2>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] text-text-faded block mb-2 uppercase tracking-wide flex justify-between">
                  Intervalo de Curvas (metros)
                  <span className="text-accent font-mono">{interval}m</span>
                </label>
                <div className="flex gap-2 mb-3">
                  {[0.5, 1, 5, 10].map(val => (
                    <button key={val} onClick={() => setInterval(val)} className={`flex-1 py-1 rounded-sm text-[9px] font-mono border transition-colors ${interval === val ? 'bg-accent/10 border-accent text-accent' : 'border-border-main text-text-faded hover:text-text-main'}`}>
                      {val}m
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
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
                <input
                  type="text"
                  value={crs}
                  onChange={(e) => setCrs(e.target.value)}
                  className="w-full bg-bg-elevated border border-border-main text-xs p-2.5 rounded-sm outline-none appearance-none text-text-main focus:border-accent transition-colors"
                  placeholder="Ej. EPSG:32633"
                />
                <p className="text-[9px] text-text-subtle tracking-widest mt-2 uppercase">Normalización de coordenadas métricas</p>
              </div>
            </div>

            <button
              onClick={handleSimulateProcess}
              disabled={isProcessing}
              className="mt-8 w-full py-3 bg-accent text-white text-[10px] font-bold uppercase tracking-widest hover:bg-accent-hover transition-colors rounded-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
        </section>

        {/* Right Column - Results / Workflow */}
        <section className="lg:col-span-9 flex flex-col relative w-full overflow-hidden">
          <div className="bg-bg-input border border-border-main rounded-sm flex-1 flex flex-col min-h-[750px] 2xl:min-h-[850px] relative w-full overflow-hidden transition-colors duration-300">

            {/* Grid Overlay inside the panel */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-5" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            {/* Tabs */}
            <div className="flex bg-bg-surface border-b border-border-main overflow-x-auto relative z-10 scrollbar-hide transition-colors duration-300">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-[10px] uppercase tracking-widest transition-colors font-semibold whitespace-nowrap border-b-2 flex-shrink-0 ${activeTab === tab.id
                      ? 'border-accent text-accent bg-bg-elevated'
                      : 'border-transparent text-text-faded hover:text-text-main hover:bg-bg-elevated/50'
                    }`}
                >
                  <tab.icon size={12} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="p-6 flex-1 relative z-10 overflow-y-auto w-full">
              {(!isDone && !isProcessing) ? (
                <div className="h-full flex flex-col items-center justify-center text-text-subtle">
                  <ListTree size={32} className="mb-4 opacity-50" />
                  <p className="text-[10px] uppercase tracking-widest font-mono">En espera de parámetros e inicio</p>
                </div>
              ) : isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="flex flex-col gap-4 text-accent animate-pulse items-center">
                    <SlidersHorizontal size={24} />
                    <p className="text-[10px] uppercase tracking-[0.15em] font-semibold">Calculando álgebra de mapas e interpolando vértices...</p>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                  >
                    {/* tab 1: PLAN */}
                    {activeTab === 'plan' && (
                      <div className="space-y-6">
                        <div className="bg-accent/5 border border-accent/20 p-5 rounded-sm">
                          <h3 className="text-[10px] uppercase tracking-[0.15em] text-accent font-bold border-b border-accent/20 pb-3 mb-3">Objetivo Pedagógico</h3>
                          <p className="text-[10px] text-text-muted italic leading-relaxed">Este plan detalla la transformación de una geometría CAD/BIM opaca (FBX o PLY) en datos trazables del Sistema de Información Geográfica (SIG).</p>
                        </div>

                        <div className="relative border-l border-border-main ml-3 space-y-8 mt-8">
                          {[
                            { title: '1. Lectura y Deserialización', desc: 'El nodo carga la malla geométrica (FBX/PLY) extrayendo la nube de vértices en coordenadas locales.' },
                            { title: '2. Normalización de Ejes (Y-up / Z-up)', desc: 'Validación morfológica: Si el eje Z tiene varianza cercana a 0 pero Y tiene varianza alta, se aplican matrices de transformación para orientar topográficamente la malla.' },
                            { title: '3. Procesamiento DEM (Rasterización)', desc: 'Se genera un grid 2D. Las altitudes Z se interpolan sobre este grid usando una malla triangular de Delaunay, generando un Raster continuo.' },
                            { title: '4. Extracción de Isolíneas', desc: `Algoritmo de Marching Squares para encontrar curvas equipotenciales separadas por intervalos de contorno exactos (${interval}m).` },
                            { title: '5. Referenciación Espacial (CRS)', desc: `Asignación del sistema ${crs} para asegurar la integridad de la escala y ubicación en la tierra (Traducción de local-space a world-space).` },
                          ].map((step, idx) => (
                            <div key={idx} className="relative pl-6">
                              <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 bg-bg-elevated border border-accent rounded-full" />
                              <h4 className="text-xs text-text-main font-mono tracking-wide">{step.title}</h4>
                              <p className="text-[10px] text-text-faded mt-2 leading-relaxed">{step.desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* tab viewer: VISTA EN PLANTA */}
                    {activeTab === 'viewer' && (
                      <div className="w-full flex justify-center items-center h-full min-h-[600px]">
                        <ContourViewer 
                          interval={interval} 
                          fileName={fileName} 
                          meshData={meshData} 
                          zExaggeration={zExaggeration} 
                          colorPalette={colorPalette}
                          minVisibleElev={minElevation === '' ? undefined : minElevation}
                          maxVisibleElev={maxElevation === '' ? undefined : maxElevation}
                          masterIntervalCount={masterIntervalCount}
                        />
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>
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
    </div>
  );
}
