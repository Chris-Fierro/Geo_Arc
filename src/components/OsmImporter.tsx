import React, { useState, useEffect } from 'react';
import { Search, MapPin, Download } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { decode } from 'fast-png';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

interface OsmImporterProps {
  onDataFetched: (data: any, name: string) => void;
}

// Component to handle map clicks
function LocationSelector({ position, setPosition }: { position: [number, number], setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return <Marker position={position} icon={customIcon} />;
}

// Component to fly map to search result
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 15);
  }, [center, map]);
  return null;
}

export default function OsmImporter({ onDataFetched }: OsmImporterProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [position, setPosition] = useState<[number, number]>([-33.4489, -70.6693]); // Santiago de Chile
  const [center, setCenter] = useState<[number, number]>([-33.4489, -70.6693]);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleSearch = async () => {
    if (!query) return;
    setIsSearching(true);
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await resp.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setCenter([lat, lon]);
        setPosition([lat, lon]);
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

  const extractOsmData = async () => {
    setIsExtracting(true);
    try {
      // Create a bounding box around the selected point (~1km)
      const delta = 0.005; 
      const minLat = position[0] - delta;
      const maxLat = position[0] + delta;
      const minLon = position[1] - delta;
      const maxLon = position[1] + delta;
      
      const z = 14; 
      const lon2tile = (lon: number, zoom: number) => (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
      const lat2tile = (lat: number, zoom: number) => (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
      const tile2lon = (x: number, z: number) => (x / Math.pow(2, z) * 360 - 180);
      const tile2lat = (y: number, z: number) => {
        const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
        return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
      };

      const minTx = lon2tile(minLon, z);
      const maxTx = lon2tile(maxLon, z);
      const minTy = lat2tile(maxLat, z); // maxLat is North, smaller Y
      const maxTy = lat2tile(minLat, z); // minLat is South, larger Y

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
        return (r * 256 + g + b / 256) - 32768;
      };

      const getElevation = (lat: number, lon: number) => {
        const x = ((lon - canvasWest) / (canvasEast - canvasWest)) * width;
        // Invert Y: north is pixel 0, but maxLat is north. 
        // canvasNorth > lat > canvasSouth. y = 0 at canvasNorth, y = height at canvasSouth.
        const y = ((canvasNorth - lat) / (canvasNorth - canvasSouth)) * height;
        
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

      const steps = 150; // Output high-res directly!
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
      try {
        const overpassQuery = `[out:json];(way["building"](${minLat},${minLon},${maxLat},${maxLon});relation["building"](${minLat},${minLon},${maxLat},${maxLon});way["highway"](${minLat},${minLon},${maxLat},${maxLon});way["waterway"](${minLat},${minLon},${maxLat},${maxLon}););out geom;`;
        const overpassResp = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Omit User-Agent in browser environments as it might be blocked or automatically added by the browser
          },
          body: 'data=' + encodeURIComponent(overpassQuery)
        });
        if (overpassResp.ok) {
           buildingsData = await overpassResp.json();
        }
      } catch (e) {
        console.warn('Failed to fetch building data', e);
      }

      onDataFetched({ 
        type: 'topo', 
        topoData: { results }, 
        buildings: buildingsData,
        bbox: { minLat, maxLat, minLon, maxLon }, 
        steps 
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
      <div className="flex gap-2">
        <input 
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Buscar ciudad o dirección..."
          className="flex-1 bg-bg-elevated border border-border-main text-xs p-2.5 rounded-sm outline-none text-text-main focus:border-accent transition-colors"
        />
        <button 
          onClick={handleSearch}
          disabled={isSearching}
          className="bg-bg-elevated border border-border-main px-3 rounded-sm hover:border-accent transition-colors text-text-faded hover:text-accent"
        >
          {isSearching ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <Search size={16} />}
        </button>
      </div>

      <div className="h-[200px] w-full rounded-sm overflow-hidden border border-border-strong relative z-0">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Standard">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Tracestrack Topo">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                maxZoom={17}
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <MapController center={center} />
          <LocationSelector position={position} setPosition={setPosition} />
        </MapContainer>
      </div>

      <div className="flex items-center justify-between text-[10px] uppercase font-mono tracking-widest text-text-subtle">
        <span>Lat: {position[0].toFixed(5)}</span>
        <span>Lon: {position[1].toFixed(5)}</span>
      </div>

      <button 
        onClick={extractOsmData}
        disabled={isExtracting}
        className="w-full py-2 border border-accent text-accent text-[10px] font-bold uppercase tracking-widest hover:bg-accent hover:text-white transition-colors rounded-sm flex items-center justify-center gap-2"
      >
        {isExtracting ? (
          <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div> Extrayendo...</>
        ) : (
          <><Download size={14} /> Extraer Área</>
        )}
      </button>
    </div>
  );
}
