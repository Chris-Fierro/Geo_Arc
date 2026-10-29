/**
 * crsService.ts - Pure cartographic geodetic projection service (Snyder 1987)
 * Implements Transverse Mercator for WGS84 ellipsoid and ESRI Worldfile .JGW generation.
 * Zero external npm dependencies.
 */

// WGS84 Ellipsoid constants and UTM central scale factor
export const WGS84_A = 6378137.0; // Semi-major axis in meters
export const WGS84_F = 1 / 298.257223563; // Flattening
export const E2 = WGS84_F * (2 - WGS84_F); // First eccentricity squared (~0.00669437999014)
export const EP2 = E2 / (1 - E2); // Second eccentricity squared (~0.00673949674228)
export const K0 = 0.9996; // Central scale factor for UTM

export interface CrsDefinition {
  code: string;
  name: string;
  isProjected: boolean;
  utmZone?: number;
  isSouth?: boolean;
}

export const SUPPORTED_CRS: Record<string, CrsDefinition> = {
  'EPSG:32718': { code: 'EPSG:32718', name: 'WGS 84 / UTM Zona 18S (Chile Costa / Sur)', isProjected: true, utmZone: 18, isSouth: true },
  'EPSG:32719': { code: 'EPSG:32719', name: 'WGS 84 / UTM Zona 19S (Chile Centro / Santiago)', isProjected: true, utmZone: 19, isSouth: true },
  'EPSG:32633': { code: 'EPSG:32633', name: 'WGS 84 / UTM Zona 33N (Referencia Proyectada)', isProjected: true, utmZone: 33, isSouth: false },
  'EPSG:4326': { code: 'EPSG:4326', name: 'WGS 84 Geográficas (Latitud / Longitud en Grados)', isProjected: false },
};

/**
 * Converts geographic latitude and longitude (WGS84 in decimal degrees)
 * to UTM projected coordinates (Easting, Northing in meters) using Snyder (1987) series.
 * Bounds latitude to [-80, 84] to prevent polar singularities (T-02-01 mitigation).
 */
export function latLonToUtm(
  latDeg: number,
  lonDeg: number,
  zone: number,
  isSouth: boolean
): { easting: number; northing: number } {
  // Bound latitude to [-80, 84] to prevent polar singularities & verify finite numbers
  const safeLat = Math.max(-80, Math.min(84, Number.isFinite(latDeg) ? latDeg : 0));
  const safeLon = Number.isFinite(lonDeg) ? lonDeg : 0;

  const rad = Math.PI / 180;
  const phi = safeLat * rad;
  const lambda = safeLon * rad;
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * rad;
  const dLambda = lambda - lambda0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = WGS84_A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = EP2 * cosPhi * cosPhi;
  const A = cosPhi * dLambda;

  // Meridian arc distance M (Snyder eq 3-21)
  const M = WGS84_A * (
    (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * Math.pow(E2, 3) / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * Math.pow(E2, 3) / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * Math.pow(E2, 3) / 1024) * Math.sin(4 * phi)
    - (35 * Math.pow(E2, 3) / 3072) * Math.sin(6 * phi)
  );

  // Easting with false Easting of 500,000 meters (Snyder eq 8-9)
  const easting = K0 * N * (
    A
    + (1 - T + C) * Math.pow(A, 3) / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Math.pow(A, 5) / 120
  ) + 500000;

  // Northing with false Northing of 10,000,000 meters in Southern Hemisphere (Snyder eq 8-10)
  let northing = K0 * (
    M + N * tanPhi * (
      A * A / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(A, 6) / 720
    )
  );
  if (isSouth) {
    northing += 10000000;
  }

  return { easting, northing };
}

/**
 * Projects a geographic (lat, lon) coordinate to the specified CRS.
 * If CRS is unprojected (EPSG:4326), returns { x: lon, y: lat }.
 * If CRS is projected (e.g. UTM), returns { x: easting, y: northing }.
 */
export function projectPointToCrs(
  lat: number,
  lon: number,
  crsCode: string
): { x: number; y: number } {
  const def = SUPPORTED_CRS[crsCode] || (crsCode === 'EPSG:4326' ? SUPPORTED_CRS['EPSG:4326'] : SUPPORTED_CRS['EPSG:32719']);
  if (!def || !def.isProjected || def.utmZone === undefined) {
    return { x: lon, y: lat };
  }
  const utm = latLonToUtm(lat, lon, def.utmZone, def.isSouth ?? true);
  return { x: utm.easting, y: utm.northing };
}

/**
 * Generates the 6-line ESRI Worldfile .JGW affine transformation matrix.
 * Supports both unprojected (degrees) and projected (meters) CRS with negative Y-scale.
 */
export function generateWorldFileForCrs(params: {
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  width: number;
  height: number;
  crsCode: string;
}): string {
  const { bbox, width, height, crsCode } = params;
  const def = SUPPORTED_CRS[crsCode] || (crsCode === 'EPSG:4326' ? SUPPORTED_CRS['EPSG:4326'] : SUPPORTED_CRS['EPSG:32719']);

  if (!def || !def.isProjected) {
    // Standard WGS84 EPSG:4326 in decimal degrees
    const xScale = (bbox.maxLon - bbox.minLon) / width;
    const yScale = (bbox.maxLat - bbox.minLat) / height;
    return [
      xScale.toFixed(10),
      '0.0000000000',
      '0.0000000000',
      (-yScale).toFixed(10),
      (bbox.minLon + xScale / 2).toFixed(10),
      (bbox.maxLat - yScale / 2).toFixed(10),
    ].join('\r\n');
  }

  // Real metric UTM projection
  const topLeft = projectPointToCrs(bbox.maxLat, bbox.minLon, crsCode);
  const bottomRight = projectPointToCrs(bbox.minLat, bbox.maxLon, crsCode);

  const xScale = Math.abs(bottomRight.x - topLeft.x) / width;
  const yScale = Math.abs(topLeft.y - bottomRight.y) / height;

  return [
    xScale.toFixed(6),
    '0.000000',
    '0.000000',
    (-yScale).toFixed(6),
    (topLeft.x + xScale / 2).toFixed(6),
    (topLeft.y - yScale / 2).toFixed(6),
  ].join('\r\n');
}
