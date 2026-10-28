// Service to download, stitch, and georeference high-resolution satellite orthophotos

export interface SatelliteResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  worldFile: string;
  zoom: number;
  attribution: string;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
const lat2tile = (lat: number, z: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
const lon2tileFloat = (lon: number, z: number) => ((lon + 180) / 360) * Math.pow(2, z);
const lat2tileFloat = (lat: number, z: number) =>
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
  Math.pow(2, z);
const tile2lon = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/**
 * Downloads satellite tiles from Esri World Imagery (with Google Satellite fallback),
 * stitches them in an offscreen canvas, crops them to the exact BoundingBox,
 * and produces a georeferenced orthophoto texture.
 */
export async function fetchSatelliteOrthophoto(bbox: BoundingBox): Promise<SatelliteResult> {
  const { minLat, maxLat, minLon, maxLon } = bbox;

  // Calculate terrain dimensions in approximate meters
  const meanLat = (minLat + maxLat) / 2;
  const latSpan = Math.abs(maxLat - minLat);
  const lonSpan = Math.abs(maxLon - minLon);
  const widthM = lonSpan * 111320 * Math.cos((meanLat * Math.PI) / 180);
  const heightM = latSpan * 111320;
  const maxSpanM = Math.max(widthM, heightM);

  // Dynamic zoom selection: Ultra-HD zoom 19/18 for urban lots, 17/16/15 for larger areas
  let zoom = 16;
  if (maxSpanM <= 320) {
    zoom = 19; // ~0.29 m/pixel (Nivel Predial / Lote)
  } else if (maxSpanM <= 700) {
    zoom = 18; // ~0.59 m/pixel (Manzana Urbana)
  } else if (maxSpanM <= 1500) {
    zoom = 17; // ~1.19 m/pixel
  } else if (maxSpanM <= 3200) {
    zoom = 16; // ~2.38 m/pixel
  } else if (maxSpanM <= 6500) {
    zoom = 15; // ~4.77 m/pixel
  } else {
    zoom = 14; // ~9.54 m/pixel
  }

  const minTx = lon2tile(minLon, zoom);
  const maxTx = lon2tile(maxLon, zoom);
  const minTy = lat2tile(maxLat, zoom);
  const maxTy = lat2tile(minLat, zoom);

  const numX = maxTx - minTx + 1;
  const numY = maxTy - minTy + 1;

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = numX * 256;
  fullCanvas.height = numY * 256;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('No se pudo inicializar el contexto 2D del Canvas');

  // Load each tile in parallel
  const tilePromises: Promise<void>[] = [];

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const posX = (tx - minTx) * 256;
      const posY = (ty - minTy) * 256;

      const p = (async () => {
        const esriUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        const googleUrl = `https://mt1.google.com/vt/lyrs=s&x=${tx}&y=${ty}&z=${zoom}`;

        let imgBlob: Blob | null = null;
        try {
          const res = await fetch(esriUrl);
          if (res.ok) {
            imgBlob = await res.blob();
          }
        } catch (_) {
          // Fallback to Google Satellite
        }

        if (!imgBlob) {
          try {
            const resG = await fetch(googleUrl);
            if (resG.ok) {
              imgBlob = await resG.blob();
            }
          } catch (_) {}
        }

        if (imgBlob) {
          try {
            const imgBitmap = await createImageBitmap(imgBlob);
            fullCtx.drawImage(imgBitmap, posX, posY, 256, 256);
          } catch (_) {
            // Fallback for environments where createImageBitmap might fail
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                fullCtx.drawImage(img, posX, posY, 256, 256);
                resolve();
              };
              img.onerror = () => resolve();
              img.src = URL.createObjectURL(imgBlob!);
            });
          }
        }
      })();

      tilePromises.push(p);
    }
  }

  await Promise.all(tilePromises);

  // Geographic bounds of the full tile mosaic
  const canvasWest = tile2lon(minTx, zoom);
  const canvasEast = tile2lon(maxTx + 1, zoom);
  const canvasNorth = tile2lat(minTy, zoom);
  const canvasSouth = tile2lat(maxTy + 1, zoom);

  // Exact Web Mercator tile subpixel coordinates matching the exact BoundingBox
  const cropX = Math.max(0, (lon2tileFloat(minLon, zoom) - minTx) * 256);
  const cropWidth = Math.min(fullCanvas.width - cropX, (lon2tileFloat(maxLon, zoom) - lon2tileFloat(minLon, zoom)) * 256);
  const cropY = Math.max(0, (lat2tileFloat(maxLat, zoom) - minTy) * 256);
  const cropHeight = Math.min(fullCanvas.height - cropY, (lat2tileFloat(minLat, zoom) - lat2tileFloat(maxLat, zoom)) * 256);

  // High-resolution target canvas (clamped between 1024 and 2048 for optimal GPU texture memory & crispness)
  const targetWidth = Math.max(768, Math.min(2048, Math.round(cropWidth)));
  const targetHeight = Math.max(768, Math.min(2048, Math.round(cropHeight)));

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = targetWidth;
  croppedCanvas.height = targetHeight;
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('No se pudo inicializar canvas de recorte');

  // Smooth resampling
  croppedCtx.imageSmoothingEnabled = true;
  croppedCtx.imageSmoothingQuality = 'high';
  croppedCtx.drawImage(
    fullCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.92);
  const blob = await new Promise<Blob>((resolve) =>
    croppedCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92)
  );

  // Generate ESRI .jgw Worldfile for GIS / AutoCAD georeferencing
  const xScale = (maxLon - minLon) / targetWidth;
  const yScale = (maxLat - minLat) / targetHeight;
  const worldFile = [
    xScale.toFixed(10),
    '0.0000000000',
    '0.0000000000',
    (-yScale).toFixed(10),
    (minLon + xScale / 2).toFixed(10),
    (maxLat - yScale / 2).toFixed(10),
  ].join('\r\n');

  return {
    dataUrl,
    blob,
    width: targetWidth,
    height: targetHeight,
    worldFile,
    zoom,
    attribution: 'Esri World Imagery / Maxar, Earthstar Geographics',
  };
}
