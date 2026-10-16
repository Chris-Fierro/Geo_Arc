import * as THREE from 'three';
import { PLYLoader, FBXLoader } from 'three-stdlib';
// Nota: OBJLoader se removió ya que OBJ queda como candidato para una futura extensión.

export interface MeshData {
  grid: number[];
  minEv: number;
  maxEv: number;
  w: number;
  h: number;
  size: number;
  cols?: number;
  rows?: number;
  buildings?: any;
  bbox?: { minLat: number; maxLat: number; minLon: number; maxLon: number; };
  satelliteTexture?: string;
  satelliteWorldFile?: string;
}

export async function processMeshFile(file: File, gridSize = 150): Promise<MeshData> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  let vertices: number[] = [];

  if (extension === 'ply') {
    const loader = new PLYLoader();
    const geometry = loader.parse(buffer);
    const position = geometry.attributes.position;
    if (position) {
      vertices = Array.from(position.array as ArrayLike<number>);
    }
  } else if (extension === 'fbx') {
    const loader = new FBXLoader();
    const object = loader.parse(buffer, '');
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
         const geom = (child as THREE.Mesh).geometry;
         vertices.push(...Array.from(geom.attributes.position.array as ArrayLike<number>));
      }
    });
  } else {
    // Validación explícita si llega algo diferente a fbx o ply
    throw new Error("Formato no soportado. Por favor sube un archivo en formato FBX o PLY.");
  }

  if (vertices.length === 0) {
    throw new Error("No se encontraron vértices o la malla está vacía.");
  }

  // Encontrar Bounding Box y eje vertical principal
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < vertices.length; i += 3) {
     if (vertices[i] < minX) minX = vertices[i];
     if (vertices[i] > maxX) maxX = vertices[i];
     if (vertices[i+1] < minY) minY = vertices[i+1];
     if (vertices[i+1] > maxY) maxY = vertices[i+1];
     if (vertices[i+2] < minZ) minZ = vertices[i+2];
     if (vertices[i+2] > maxZ) maxZ = vertices[i+2];
  }

  let planeX = 0, planeY = 2, planeZ = 1; 
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const rangeZ = maxZ - minZ;

  // Analítica heurística de orientaciones para terreno: 
  // La elevación suele tener la menor varianza general frente a latitud/longitud
  if (rangeZ < rangeX && rangeZ < rangeY) {
     planeX = 0; planeY = 1; planeZ = 2; // Z is elevation
  } else {
     planeX = 0; planeY = 2; planeZ = 1; // Y is elevation
  }

  let bMinX = Infinity, bMaxX = -Infinity;
  let bMinY = Infinity, bMaxY = -Infinity;
  let bMinElevation = Infinity, bMaxElevation = -Infinity;

  for (let i = 0; i < vertices.length; i += 3) {
     const px = vertices[i + planeX];
     const py = vertices[i + planeY];
     const pz = vertices[i + planeZ];

     if (px < bMinX) bMinX = px; if (px > bMaxX) bMaxX = px;
     if (py < bMinY) bMinY = py; if (py > bMaxY) bMaxY = py;
     if (pz < bMinElevation) bMinElevation = pz; if (pz > bMaxElevation) bMaxElevation = pz;
  }

  if (bMaxX === bMinX) bMaxX = bMinX + 1;
  if (bMaxY === bMinY) bMaxY = bMinY + 1;

  const w = bMaxX - bMinX;
  const h = bMaxY - bMinY;

  let cols = gridSize;
  let rows = gridSize;
  if (w > h && w > 0) {
     rows = Math.max(10, Math.floor(gridSize * (h / w)));
  } else if (h > w && h > 0) {
     cols = Math.max(10, Math.floor(gridSize * (w / h)));
  }

  let grid = new Array(cols * rows).fill(NaN);

  for (let i = 0; i < vertices.length; i += 3) {
     const px = vertices[i + planeX];
     const py = vertices[i + planeY];
     const pz = vertices[i + planeZ];

     const rawGx = Math.floor(((px - bMinX) / (bMaxX - bMinX)) * (cols - 1));
     const rawGy = Math.floor((1.0 - ((py - bMinY) / (bMaxY - bMinY))) * (rows - 1));

     const gX = Math.max(0, Math.min(cols - 1, rawGx || 0));
     const gY = Math.max(0, Math.min(rows - 1, rawGy || 0));

     const idx = gY * cols + gX;
     if (isNaN(grid[idx]) || pz > grid[idx]) {
         grid[idx] = pz; 
     }
  }

  // Hole-filling por difusión iterativa rápida
  let hasHoles = true;
  let maxIters = 50;
  while (hasHoles && maxIters > 0) {
    hasHoles = false;
    const nextGrid = [...grid];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = j * cols + i;
        if (isNaN(grid[idx])) {
          let sum = 0, count = 0;
          const neighbors = [[0,-1],[0,1],[-1,0],[1,0], [-1,-1], [1,1], [-1,1], [1,-1]];
          for (let [dx,dy] of neighbors) {
             const nx = i+dx, ny = j+dy;
             if(nx>=0 && nx<cols && ny>=0 && ny<rows) {
                const val = grid[ny*cols+nx];
                if (!isNaN(val)) { sum += val; count++; }
             }
          }
          if (count > 0) {
              nextGrid[idx] = sum / count;
          } else {
              hasHoles = true;
          }
        }
      }
    }
    grid = nextGrid;
    maxIters--;
  }

  grid = grid.map(v => isNaN(v) ? bMinElevation : v);

  // Pasada final de suavizado iterpolo para curvas armónicas
  const smoothed = new Array(cols * rows).fill(0);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
       let sum = 0, count = 0;
       for(let dj=-1; dj<=1; dj++){
         for(let di=-1; di<=1; di++){
            const ny = j+dj; const nx = i+di;
            if(ny>=0 && ny<rows && nx>=0 && nx<cols){
               sum += grid[ny*cols+nx];
               count++;
            }
         }
       }
       smoothed[j*cols+i] = sum / count;
    }
  }

  return {
      grid: smoothed,
      minEv: bMinElevation,
      maxEv: bMaxElevation,
      w: w,
      h: h,
      size: gridSize,
      cols,
      rows
  };
}
