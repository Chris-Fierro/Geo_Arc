import { MeshData } from './meshProcessor';

export interface OgucParams {
  regionGroup: 1 | 2 | 3;
  rasanteStartHeight: number;
  minSetback: number;
  applyExtraSetback: boolean;
  maxHeight: number;
  continuousBaseHeight: number;
  showShadows: boolean;
  angle: number;
}

export interface Point3D {
  x: number;
  y: number;
  elev: number;
}

export interface VolumeTier {
  id: 'continuous' | 'main' | 'upper_stepped';
  label: string;
  basePts: Point3D[];
  roofPts: Point3D[];
  baseOffsetZ: number;
  topOffsetZ: number;
  setbackApplied: number;
}

export interface RasantePlane {
  edgeIndex: number;
  orientation: 'Sur' | 'Norte' | 'Oriente' | 'Poniente';
  angleDeg: number;
  p1: Point3D;
  p2: Point3D;
  top1: Point3D;
  top2: Point3D;
  midBase: Point3D;
}

export interface OgucShadowComparison {
  proposedPolygons: Point3D[][];
  theoreticalPolygons: Point3D[][];
  proposedAreaM2: number;
  allowedAreaM2: number;
  complies: boolean;
  complianceRatio: number;
}

export interface OgucComputedModel {
  lotPolygon: Point3D[];
  lotAreaM2: number;
  collapsed: boolean;
  effectiveHeight: number;
  rasanteLimitHeightAtSetback: number;
  extraSetbackMeters: number;
  totalUpperSetbackMeters: number;
  regionInfo: {
    group: 1 | 2 | 3;
    name: string;
    surAngle: number;
    opAngle: number;
    norteAngle: number;
    extraFactor: number;
  };
  tiers: VolumeTier[];
  rasantePlanes: RasantePlane[];
  shadows: OgucShadowComparison;
}

export function getRegionRasanteInfo(regionGroup: 1 | 2 | 3) {
  switch (regionGroup) {
    case 1:
      return {
        group: 1 as const,
        name: 'Grupo 1 (Norte)',
        surAngle: 63,
        opAngle: 28,
        norteAngle: 75,
        extraFactor: 0.2, // +20% distanciamiento sobre 10.5m
      };
    case 2:
      return {
        group: 2 as const,
        name: 'Grupo 2 (Centro)',
        surAngle: 57,
        opAngle: 26,
        norteAngle: 70,
        extraFactor: 0.3, // +30% distanciamiento sobre 10.5m
      };
    case 3:
    default:
      return {
        group: 3 as const,
        name: 'Grupo 3 (Sur)',
        surAngle: 51,
        opAngle: 24,
        norteAngle: 65,
        extraFactor: 0.4, // +40% distanciamiento sobre 10.5m
      };
  }
}

export function insetPolygonBisector(
  pts: { x: number; y: number }[],
  offsetMeters: number,
  meshData: MeshData | undefined,
  n: number
): { x: number; y: number }[] | null {
  if (pts.length < 3) return null;
  if (offsetMeters <= 0.01) {
    return pts.map((p) => ({ x: p.x, y: p.y }));
  }

  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const isClockwise = area > 0;
  const sign = isClockwise ? 1 : -1;

  const wMeters = meshData && meshData.w > 0 ? meshData.w : 150;
  const offsetGrid = offsetMeters * (n / wMeters);

  // Also check polygon bounding box to prevent self-inversion on narrow lots
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const minSpan = Math.min(maxX - minX, maxY - minY);
  if (offsetGrid * 2 >= minSpan * 0.96) {
    return null;
  }

  const newPts: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];

    let v1x = curr.x - prev.x;
    let v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    v1x /= len1;
    v1y /= len1;

    let v2x = next.x - curr.x;
    let v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y) || 1;
    v2x /= len2;
    v2y /= len2;

    const n1x = -v1y * sign;
    const n1y = v1x * sign;

    const n2x = -v2y * sign;
    const n2y = v2x * sign;

    let bx = n1x + n2x;
    let by = n1y + n2y;
    const blen = Math.hypot(bx, by);

    if (blen < 0.0001) {
      bx = n1x;
      by = n1y;
    } else {
      bx /= blen;
      by /= blen;
    }

    const dot = n1x * bx + n1y * by;
    // Clamp miter spike on very acute angles
    const dist = Math.abs(dot) > 0.25 ? offsetGrid / dot : offsetGrid * 2;

    newPts.push({
      x: curr.x + bx * dist,
      y: curr.y + by * dist,
    });
  }

  let newArea = 0;
  for (let i = 0; i < newPts.length; i++) {
    const j = (i + 1) % newPts.length;
    newArea += newPts[i].x * newPts[j].y - newPts[j].x * newPts[i].y;
  }
  if ((isClockwise && newArea <= 0) || (!isClockwise && newArea >= 0)) {
    return null;
  }

  return newPts;
}

export function convexHull3D(points: Point3D[]): Point3D[] {
  if (points.length <= 3) return points;
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point3D, a: Point3D, b: Point3D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point3D[] = [];
  for (let i = 0; i < pts.length; i++) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0
    ) {
      lower.pop();
    }
    lower.push(pts[i]);
  }
  const upper: Point3D[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0
    ) {
      upper.pop();
    }
    upper.push(pts[i]);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function computePolygonAreaM2(
  pts: { x: number; y: number }[],
  meshData: MeshData | undefined,
  n: number,
  m: number
): number {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  const w = meshData?.w || 150;
  const h = meshData?.h || 150;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const x1 = (pts[i].x / n) * w;
    const y1 = (pts[i].y / m) * h;
    const x2 = (pts[j].x / n) * w;
    const y2 = (pts[j].y / m) * h;
    area += (x2 + x1) * (y2 - y1);
  }
  return Math.abs(area / 2);
}

export function classifyEdgeOrientation(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  centroid: { x: number; y: number },
  regionInfo: ReturnType<typeof getRegionRasanteInfo>
): { orientation: 'Sur' | 'Norte' | 'Oriente' | 'Poniente'; angleDeg: number; outNx: number; outNy: number } {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;

  // Candidate normal 1
  let nx = -dy / len;
  let ny = dx / len;

  // Ensure normal points outward from centroid
  const toEdgeX = midX - centroid.x;
  const toEdgeY = midY - centroid.y;
  if (nx * toEdgeX + ny * toEdgeY < 0) {
    nx = -nx;
    ny = -ny;
  }

  // In grid coordinates: +X = Oriente (East), -X = Poniente (West), +Y = Sur (South), -Y = Norte (North)
  if (Math.abs(ny) >= Math.abs(nx)) {
    if (ny >= 0) {
      return { orientation: 'Sur', angleDeg: regionInfo.surAngle, outNx: nx, outNy: ny };
    } else {
      return { orientation: 'Norte', angleDeg: regionInfo.norteAngle, outNx: nx, outNy: ny };
    }
  } else {
    if (nx >= 0) {
      return { orientation: 'Oriente', angleDeg: regionInfo.opAngle, outNx: nx, outNy: ny };
    } else {
      return { orientation: 'Poniente', angleDeg: regionInfo.opAngle, outNx: nx, outNy: ny };
    }
  }
}

function projectDirectionalShadowOnTerrain(
  footprintPts: Point3D[],
  topElevs: number[],
  angleDeg: number,
  azimuthDeg: number,
  meshData: MeshData | undefined,
  n: number,
  m: number,
  getGridElevAt: (x: number, y: number) => number
): Point3D[] {
  const safeAngle = Math.max(10, Math.min(85, angleDeg));
  const tanAngle = Math.tan((safeAngle * Math.PI) / 180);
  const azRad = (azimuthDeg * Math.PI) / 180;
  // Direction in meters (+X East, +Y South)
  const dirMetersX = Math.sin(azRad);
  const dirMetersY = -Math.cos(azRad);

  const wMeters = meshData?.w || 150;
  const hMeters = meshData?.h || 150;
  const baseZ = meshData?.minEv || 0;

  const projectedPts: Point3D[] = footprintPts.map((p, idx) => {
    const roofZ = topElevs[idx] ?? p.elev;
    const heightAboveGround = Math.max(0, roofZ - p.elev);
    const horizDistMeters = heightAboveGround / tanAngle;

    const mapDx = ((dirMetersX * horizDistMeters) / wMeters) * n;
    const mapDy = ((dirMetersY * horizDistMeters) / hMeters) * m;
    const targetX = p.x + mapDx;
    const targetY = p.y + mapDy;
    const groundZ =
      targetX >= 0 && targetX < n && targetY >= 0 && targetY < m
        ? getGridElevAt(targetX, targetY)
        : baseZ;

    return { x: targetX, y: targetY, elev: groundZ };
  });

  const basePts = footprintPts.map((p) => ({
    x: p.x,
    y: p.y,
    elev: p.elev,
  }));

  return convexHull3D([...basePts, ...projectedPts]);
}

export function computeOgucModel(params: {
  rawLotPts: { x: number; y: number }[];
  ogucParams: OgucParams;
  meshData: MeshData | undefined;
  n: number;
  m: number;
  getGridElevAt: (x: number, y: number) => number;
}): OgucComputedModel | null {
  const { rawLotPts, ogucParams, meshData, n, m, getGridElevAt } = params;
  if (!rawLotPts || rawLotPts.length < 3) return null;

  const regionInfo = getRegionRasanteInfo(ogucParams.regionGroup);
  const lotPolygon: Point3D[] = rawLotPts.map((p) => ({
    x: p.x,
    y: p.y,
    elev: getGridElevAt(p.x, p.y),
  }));

  const lotAreaM2 = computePolygonAreaM2(lotPolygon, meshData, n, m);

  const centroid = {
    x: lotPolygon.reduce((s, p) => s + p.x, 0) / lotPolygon.length,
    y: lotPolygon.reduce((s, p) => s + p.y, 0) / lotPolygon.length,
  };

  const minLotElev = Math.min(...lotPolygon.map((p) => p.elev));
  const avgLotElev = lotPolygon.reduce((s, p) => s + p.elev, 0) / lotPolygon.length;

  const startH = Math.max(0, ogucParams.rasanteStartHeight);
  const contBaseH = Math.max(0, Math.min(ogucParams.continuousBaseHeight, ogucParams.maxHeight));
  const maxH = Math.max(1, ogucParams.maxHeight);
  const baseSetback = Math.max(0, ogucParams.minSetback);

  // Height allowed by the South rasante at the base setback distance
  const rasanteLimitHeightAtSetback =
    startH + baseSetback * Math.tan((regionInfo.surAngle * Math.PI) / 180);

  // Proposed effective height uses user's maxHeight (up to PRC limit)
  const effectiveHeight = maxH;

  // Art. 2.6.12: Extra setback above 10.5m
  const threshold105 = 10.5;
  const hasUpperStep = ogucParams.applyExtraSetback && effectiveHeight > threshold105;
  const excessHeightAbove105 = hasUpperStep ? Math.max(0, effectiveHeight - threshold105) : 0;
  const extraSetbackMeters = hasUpperStep
    ? Number((excessHeightAbove105 * regionInfo.extraFactor + 1.0).toFixed(2))
    : 0;
  const totalUpperSetbackMeters = baseSetback + extraSetbackMeters;

  const mainInset = insetPolygonBisector(lotPolygon, baseSetback, meshData, n);
  if (!mainInset || mainInset.length < 3) {
    return {
      lotPolygon,
      lotAreaM2,
      collapsed: true,
      effectiveHeight: 0,
      rasanteLimitHeightAtSetback,
      extraSetbackMeters: 0,
      totalUpperSetbackMeters: baseSetback,
      regionInfo,
      tiers: [],
      rasantePlanes: [],
      shadows: {
        proposedPolygons: [],
        theoreticalPolygons: [],
        proposedAreaM2: 0,
        allowedAreaM2: 0,
        complies: false,
        complianceRatio: 0,
      },
    };
  }

  const tiers: VolumeTier[] = [];

  // 1. Optional Continuous Base Tier (Edificación Continua en línea oficial)
  if (contBaseH > 0.1) {
    const basePts = lotPolygon.map((p) => ({ ...p }));
    const roofZ = avgLotElev + contBaseH;
    const roofPts = lotPolygon.map((p) => ({ x: p.x, y: p.y, elev: roofZ }));
    tiers.push({
      id: 'continuous',
      label: `Placa Continua (${contBaseH.toFixed(1)}m)`,
      basePts,
      roofPts,
      baseOffsetZ: 0,
      topOffsetZ: contBaseH,
      setbackApplied: 0,
    });
  }

  // 2. Main Body Tier (from continuousBaseHeight up to min(effectiveHeight, 10.5m if stepped else effectiveHeight))
  const mainTopH = hasUpperStep ? Math.min(effectiveHeight, threshold105) : effectiveHeight;
  const mainStartH = Math.min(contBaseH, mainTopH);

  const mainGroundPts: Point3D[] = mainInset.map((p) => ({
    x: p.x,
    y: p.y,
    elev: getGridElevAt(p.x, p.y),
  }));
  const mainBaseElev = Math.min(...mainGroundPts.map((p) => p.elev));

  if (mainTopH > mainStartH + 0.05) {
    const basePts = mainGroundPts.map((p) => ({
      x: p.x,
      y: p.y,
      elev: mainStartH > 0.1 ? avgLotElev + mainStartH : p.elev,
    }));
    const roofPts = mainGroundPts.map((p) => ({
      x: p.x,
      y: p.y,
      elev: mainBaseElev + mainTopH,
    }));
    tiers.push({
      id: 'main',
      label: hasUpperStep
        ? `Cuerpo Base ≤ 10.5m (Dist. ${baseSetback.toFixed(1)}m)`
        : `Volumen Teórico (${effectiveHeight.toFixed(1)}m)`,
      basePts,
      roofPts,
      baseOffsetZ: mainStartH,
      topOffsetZ: mainTopH,
      setbackApplied: baseSetback,
    });
  }

  // 3. Upper Stepped Tier (> 10.5m with Art. 2.6.12 extra setback)
  let topRoofPtsForRasante = mainGroundPts.map((p) => ({
    x: p.x,
    y: p.y,
    elev: mainBaseElev + effectiveHeight,
  }));

  if (hasUpperStep && effectiveHeight > threshold105) {
    const upperInset =
      insetPolygonBisector(lotPolygon, totalUpperSetbackMeters, meshData, n) || mainInset;
    const upperGroundPts = upperInset.map((p) => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y),
    }));
    const baseZ105 = mainBaseElev + threshold105;
    const topZ = mainBaseElev + effectiveHeight;

    const basePts = upperGroundPts.map((p) => ({ x: p.x, y: p.y, elev: baseZ105 }));
    const roofPts = upperGroundPts.map((p) => ({ x: p.x, y: p.y, elev: topZ }));

    tiers.push({
      id: 'upper_stepped',
      label: `Cuerpo > 10.5m Art. 2.6.12 (Dist. ${totalUpperSetbackMeters.toFixed(1)}m)`,
      basePts,
      roofPts,
      baseOffsetZ: threshold105,
      topOffsetZ: effectiveHeight,
      setbackApplied: totalUpperSetbackMeters,
    });

    topRoofPtsForRasante = roofPts;
  }

  // 4. Rasante Planes from each lot boundary edge (Art. 2.6.3)
  const rasantePlanes: RasantePlane[] = [];
  const wMeters = meshData?.w || 150;
  const hMeters = meshData?.h || 150;

  for (let i = 0; i < lotPolygon.length; i++) {
    const j = (i + 1) % lotPolygon.length;
    const p1 = lotPolygon[i];
    const p2 = lotPolygon[j];
    const { orientation, angleDeg, outNx, outNy } = classifyEdgeOrientation(
      p1,
      p2,
      centroid,
      regionInfo
    );

    // Rasante starts at rasanteStartHeight above the boundary ground level
    const base1: Point3D = { x: p1.x, y: p1.y, elev: p1.elev + startH };
    const base2: Point3D = { x: p2.x, y: p2.y, elev: p2.elev + startH };

    // Project inward (opposite to outward normal) up to the theoretical roof height
    const riseMeters = Math.max(2, effectiveHeight - startH);
    const runMeters = riseMeters / Math.tan((angleDeg * Math.PI) / 180);
    // Clamp run to reach at most the centroid distance so planes don't cross wildly
    const maxRunMeters = Math.min(runMeters, Math.max(baseSetback * 1.6, 8));
    const actualRiseMeters = maxRunMeters * Math.tan((angleDeg * Math.PI) / 180);

    const inDxGrid = ((-outNx * maxRunMeters) / wMeters) * n;
    const inDyGrid = ((-outNy * maxRunMeters) / hMeters) * m;

    // Connect toward corresponding inset vertices or inward projection
    const insetP1 = topRoofPtsForRasante[i];
    const insetP2 = topRoofPtsForRasante[j];

    const top1: Point3D = insetP1
      ? {
          x: insetP1.x,
          y: insetP1.y,
          elev: Math.min(
            minLotElev + maxH + 2,
            p1.elev + startH + Math.max(actualRiseMeters, effectiveHeight - startH)
          ),
        }
      : {
          x: p1.x + inDxGrid,
          y: p1.y + inDyGrid,
          elev: p1.elev + startH + actualRiseMeters,
        };

    const top2: Point3D = insetP2
      ? {
          x: insetP2.x,
          y: insetP2.y,
          elev: Math.min(
            minLotElev + maxH + 2,
            p2.elev + startH + Math.max(actualRiseMeters, effectiveHeight - startH)
          ),
        }
      : {
          x: p2.x + inDxGrid,
          y: p2.y + inDyGrid,
          elev: p2.elev + startH + actualRiseMeters,
        };

    rasantePlanes.push({
      edgeIndex: i,
      orientation,
      angleDeg,
      p1: base1,
      p2: base2,
      top1,
      top2,
      midBase: {
        x: (base1.x + base2.x) / 2,
        y: (base1.y + base2.y) / 2,
        elev: (base1.elev + base2.elev) / 2,
      },
    });
  }

  // 5. Comparative Shadows (Module 3: Sombra Teórica Permitida vs. Sombra Volumen Propuesto)
  // Directions: Oriente (135° SE), Sur (180° S), Poniente (225° SW)
  const directions = [
    { azimuth: 135, angle: regionInfo.opAngle },
    { azimuth: 180, angle: regionInfo.surAngle },
    { azimuth: 225, angle: regionInfo.opAngle },
  ];

  // Theoretical Allowed Envelope:
  // Uses an envelope inset by minSetback with height governed by rasante at setback (plus rasanteStartHeight)
  // capped by maxHeight.
  const theoreticalAllowedHeight = Math.min(
    maxH,
    Math.max(contBaseH, rasanteLimitHeightAtSetback + (hasUpperStep ? 3.5 : 0))
  );
  const theoreticalElevs = mainGroundPts.map((p) => p.elev + theoreticalAllowedHeight);

  const theoreticalPolygons: Point3D[][] = directions.map((d) =>
    projectDirectionalShadowOnTerrain(
      mainGroundPts,
      theoreticalElevs,
      d.angle,
      d.azimuth,
      meshData,
      n,
      m,
      getGridElevAt
    )
  );

  // Proposed Volume Shadow: combines the highest active tier footprint & height
  const activeTier = tiers[tiers.length - 1];
  const proposedFootprint = activeTier ? activeTier.basePts : mainGroundPts;
  const proposedTopElevs = activeTier
    ? activeTier.roofPts.map((rp) => rp.elev)
    : mainGroundPts.map((p) => p.elev + effectiveHeight);

  const proposedPolygons: Point3D[][] = directions.map((d) =>
    projectDirectionalShadowOnTerrain(
      proposedFootprint,
      proposedTopElevs,
      d.angle,
      d.azimuth,
      meshData,
      n,
      m,
      getGridElevAt
    )
  );

  // Combined shadow metrics (average / sum of directional projections excluding lot footprint)
  const proposedAreaM2 =
    proposedPolygons.reduce((sum, poly) => sum + computePolygonAreaM2(poly, meshData, n, m), 0) /
    directions.length;

  const allowedAreaM2 =
    theoreticalPolygons.reduce(
      (sum, poly) => sum + computePolygonAreaM2(poly, meshData, n, m),
      0
    ) / directions.length;

  const complies = proposedAreaM2 <= allowedAreaM2 * 1.03;
  const complianceRatio = allowedAreaM2 > 0 ? (proposedAreaM2 / allowedAreaM2) * 100 : 100;

  return {
    lotPolygon,
    lotAreaM2,
    collapsed: false,
    effectiveHeight,
    rasanteLimitHeightAtSetback,
    extraSetbackMeters,
    totalUpperSetbackMeters,
    regionInfo,
    tiers,
    rasantePlanes,
    shadows: {
      proposedPolygons,
      theoreticalPolygons,
      proposedAreaM2,
      allowedAreaM2,
      complies,
      complianceRatio,
    },
  };
}
