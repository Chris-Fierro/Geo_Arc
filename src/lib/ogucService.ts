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

export function signedPolygonArea2D(pts: { x: number; y: number }[]): number {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area * 0.5;
}

export function cleanPolygonVertices(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (!pts || pts.length === 0) return [];
  // 1a. Filtrar vértices consecutivos duplicados (< 1e-4), incluyendo cierre último-primero
  const deduped: { x: number; y: number }[] = [];
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (deduped.length === 0) {
      deduped.push({ x: p.x, y: p.y });
    } else {
      const prev = deduped[deduped.length - 1];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 1e-4) {
        deduped.push({ x: p.x, y: p.y });
      }
    }
  }
  while (
    deduped.length > 1 &&
    Math.hypot(
      deduped[deduped.length - 1].x - deduped[0].x,
      deduped[deduped.length - 1].y - deduped[0].y
    ) < 1e-4
  ) {
    deduped.pop();
  }
  if (deduped.length < 3) return deduped;

  // 1b. Filtrar vértices colineales redundantes
  let ring = deduped;
  let changed = true;
  while (changed && ring.length >= 3) {
    changed = false;
    const nextRing: { x: number; y: number }[] = [];
    const len = ring.length;
    for (let i = 0; i < len; i++) {
      const prev = ring[(i - 1 + len) % len];
      const curr = ring[i];
      const next = ring[(i + 1) % len];
      const d1x = curr.x - prev.x;
      const d1y = curr.y - prev.y;
      const d2x = next.x - curr.x;
      const d2y = next.y - curr.y;
      const l1 = Math.hypot(d1x, d1y);
      const l2 = Math.hypot(d2x, d2y);
      if (l1 < 1e-4 || l2 < 1e-4) {
        changed = true;
        continue;
      }
      const u1x = d1x / l1;
      const u1y = d1y / l1;
      const u2x = d2x / l2;
      const u2y = d2y / l2;
      const cross = Math.abs(u1x * u2y - u1y * u2x);
      const dot = u1x * u2x + u1y * u2y;
      if (cross < 1e-4 && dot > 0 && len - (changed ? 1 : 0) > 3) {
        changed = true;
        continue;
      }
      nextRing.push(curr);
    }
    ring = nextRing;
  }
  return ring;
}

export function intersectSegmentsStrict(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): { x: number; y: number } | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-9) return null;

  const s = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  const t = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
  const eps = 1e-6;
  if (s > eps && s < 1 - eps && t > eps && t < 1 - eps) {
    return {
      x: a1.x + s * dax,
      y: a1.y + s * day,
    };
  }
  return null;
}

export function collapseInvertedEdges(
  rawPts: { x: number; y: number }[],
  origPts: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (!rawPts || rawPts.length < 3 || rawPts.length !== origPts.length) {
    return rawPts ? rawPts.map((p) => ({ x: p.x, y: p.y })) : [];
  }

  let nodes = rawPts.map((pt, i) => {
    const nextOrig = origPts[(i + 1) % origPts.length];
    return {
      pt: { x: pt.x, y: pt.y },
      dOrig: { x: nextOrig.x - origPts[i].x, y: nextOrig.y - origPts[i].y },
    };
  });

  const maxPasses = origPts.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (nodes.length <= 3) break;
    let collapsedInPass = false;
    const len = nodes.length;

    for (let i = 0; i < len; i++) {
      const prevIdx = (i - 1 + len) % len;
      const nextIdx = (i + 1) % len;
      const next2Idx = (i + 2) % len;

      const currRaw = nodes[i].pt;
      const nextRaw = nodes[nextIdx].pt;
      const dOrig = nodes[i].dOrig;
      const origLen = Math.hypot(dOrig.x, dOrig.y);
      if (origLen < 1e-6) continue;

      const dNewX = nextRaw.x - currRaw.x;
      const dNewY = nextRaw.y - currRaw.y;
      const dot = dNewX * dOrig.x + dNewY * dOrig.y;

      if (dot <= 0) {
        const prevRaw = nodes[prevIdx].pt;
        const next2Raw = nodes[next2Idx].pt;
        const dPrev = nodes[prevIdx].dOrig;
        const dNext = nodes[nextIdx].dOrig;
        const lPrev = Math.hypot(dPrev.x, dPrev.y) || 1;
        const lNext = Math.hypot(dNext.x, dNext.y) || 1;
        const adjCross = Math.abs((dPrev.x / lPrev) * (dNext.y / lNext) - (dPrev.y / lPrev) * (dNext.x / lNext));

        // Si las aristas adyacentes son antiparalelas (ej. brazo estrecho de un lote en L o U),
        // preservar el lazo para que pruneSelfIntersections lo corte exactamente contra el cuerpo principal
        const adjDot = (dPrev.x / lPrev) * (dNext.x / lNext) + (dPrev.y / lPrev) * (dNext.y / lNext);
        if (adjCross < 0.15 && adjDot < -0.5) {
          continue;
        }

        const mid = {
          x: 0.5 * (currRaw.x + nextRaw.x),
          y: 0.5 * (currRaw.y + nextRaw.y),
        };
        let mergedPt = mid;

        // Intersección de las rectas de las aristas adyacentes anterior y siguiente
        const a1 = prevRaw;
        const a2 = currRaw;
        const b1 = nextRaw;
        const b2 = next2Raw;
        const dax = a2.x - a1.x;
        const day = a2.y - a1.y;
        const dbx = b2.x - b1.x;
        const dby = b2.y - b1.y;
        const denom = dax * dby - day * dbx;
        if (Math.abs(denom) > 1e-7) {
          const s = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
          const hit = { x: a1.x + s * dax, y: a1.y + s * day };
          if (Math.hypot(hit.x - mid.x, hit.y - mid.y) < 3 * origLen) {
            mergedPt = hit;
          }
        }

        const updatedNode = {
          pt: mergedPt,
          dOrig: nodes[nextIdx].dOrig,
        };
        const nextNodes: typeof nodes = [];
        for (let k = 0; k < len; k++) {
          if (k === i) {
            nextNodes.push(updatedNode);
          } else if (k === nextIdx) {
            continue;
          } else {
            nextNodes.push(nodes[k]);
          }
        }
        nodes = nextNodes;
        collapsedInPass = true;
        break;
      }
    }
    if (!collapsedInPass) break;
  }

  return cleanPolygonVertices(nodes.map((n) => n.pt));
}

export function pruneSelfIntersections(
  pts: { x: number; y: number }[],
  expectedSign: number
): { x: number; y: number }[] {
  if (!pts || pts.length < 3) return [];
  let ring = pts.map((p) => ({ x: p.x, y: p.y }));
  const maxPasses = pts.length * 3;

  for (let pass = 0; pass < maxPasses; pass++) {
    let splitDone = false;
    const len = ring.length;
    if (len < 4) break;

    for (let i = 0; i < len && !splitDone; i++) {
      const iNext = (i + 1) % len;
      for (let j = i + 2; j < len && !splitDone; j++) {
        if (i === 0 && j === len - 1) continue;
        const jNext = (j + 1) % len;
        const hit = intersectSegmentsStrict(ring[i], ring[iNext], ring[j], ring[jNext]);
        if (hit) {
          const loop1 = [hit, ...ring.slice(i + 1, j + 1)];
          const loop2 = [...ring.slice(0, i + 1), hit, ...ring.slice(j + 1)];

          const score1 = signedPolygonArea2D(loop1) * expectedSign;
          const score2 = signedPolygonArea2D(loop2) * expectedSign;

          if (score1 >= score2 && score1 > 1e-5 && loop1.length >= 3) {
            ring = loop1;
          } else if (score2 > 1e-5 && loop2.length >= 3) {
            ring = loop2;
          } else {
            return [];
          }
          splitDone = true;
        }
      }
    }
    if (!splitDone) break;
  }
  return ring;
}

function hasAnySelfIntersection(pts: { x: number; y: number }[]): boolean {
  const len = pts.length;
  if (len < 4) return false;
  for (let i = 0; i < len; i++) {
    const iNext = (i + 1) % len;
    for (let j = i + 2; j < len; j++) {
      if (i === 0 && j === len - 1) continue;
      const jNext = (j + 1) % len;
      if (intersectSegmentsStrict(pts[i], pts[iNext], pts[j], pts[jNext])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calcula el polígono interior de retranqueo mediante bisectrices acotadas y
 * limpieza determinista de 4 etapas para lotes regulares y cóncavos ("L", "U").
 */
export function insetPolygonBisector(
  pts: { x: number; y: number }[],
  offsetMeters: number,
  meshData: MeshData | undefined,
  n: number
): { x: number; y: number }[] | null {
  const cleaned = cleanPolygonVertices(pts);
  if (cleaned.length < 3) return null;
  if (offsetMeters <= 0.01) {
    return cleaned.map((p) => ({ x: p.x, y: p.y }));
  }

  const origSignedArea = signedPolygonArea2D(cleaned);
  if (Math.abs(origSignedArea) <= 1e-4) return null;
  const isClockwise = origSignedArea > 0;
  const sign = isClockwise ? 1 : -1;
  const absOrigArea = Math.abs(origSignedArea);

  const wMeters = meshData && meshData.w > 0 ? meshData.w : 150;
  const offsetGrid = offsetMeters * (n / wMeters);

  // Verificar bounding box para prevenir auto-inversión en lotes demasiado angostos
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of cleaned) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const minSpan = Math.min(maxX - minX, maxY - minY);
  if (offsetGrid * 2 >= minSpan * 0.96) {
    return null;
  }

  const rawPts: { x: number; y: number }[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const prev = cleaned[(i - 1 + cleaned.length) % cleaned.length];
    const curr = cleaned[i];
    const next = cleaned[(i + 1) % cleaned.length];

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

    if (blen < 1e-4) {
      bx = n1x;
      by = n1y;
    } else {
      bx /= blen;
      by /= blen;
    }

    const dot = n1x * bx + n1y * by;
    // Acotamiento continuo del factor de inglete en esquinas agudas/cóncavas (per D-03)
    const miterScale = dot > 1e-4 ? Math.min(2.5, 1 / dot) : 1.0;
    const dist = offsetGrid * miterScale;

    rawPts.push({
      x: curr.x + bx * dist,
      y: curr.y + by * dist,
    });
  }

  const collapsedPts = collapseInvertedEdges(rawPts, cleaned);
  if (collapsedPts.length < 3) return null;

  const prunedPts = pruneSelfIntersections(collapsedPts, sign);
  if (prunedPts.length < 3) return null;

  const finalPts = cleanPolygonVertices(prunedPts);
  if (finalPts.length < 3) return null;

  // Validar contención en el bounding box original, ausencia de auto-intersecciones y área válida
  for (const p of finalPts) {
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < minX - 1e-3 ||
      p.x > maxX + 1e-3 ||
      p.y < minY - 1e-3 ||
      p.y > maxY + 1e-3
    ) {
      return null;
    }
  }

  if (hasAnySelfIntersection(finalPts)) {
    return null;
  }

  const finalSignedArea = signedPolygonArea2D(finalPts);
  if (finalSignedArea * sign <= 1e-4 || Math.abs(finalSignedArea) >= absOrigArea) {
    return null;
  }

  return finalPts;
}

/**
 * Acota el desplazamiento (dx, dy) de un polígono de lote como cuerpo rígido
 * dentro de los límites de la grilla [0, n - 1] x [0, m - 1] (per D-02).
 */
export function clampLotDragOffset(
  basePts: { x: number; y: number }[],
  dx: number,
  dy: number,
  n: number,
  m: number
): { x: number; y: number } {
  if (!basePts || basePts.length === 0) return { x: 0, y: 0 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of basePts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const maxStepX = Math.max(0, n - 1);
  const maxStepY = Math.max(0, m - 1);
  const clampedDx = Math.max(-minX, Math.min(maxStepX - maxX, dx));
  const clampedDy = Math.max(-minY, Math.min(maxStepY - maxY, dy));
  return {
    x: Number.isFinite(clampedDx) ? clampedDx : 0,
    y: Number.isFinite(clampedDy) ? clampedDy : 0,
  };
}

/**
 * Traslada el polígono del lote como cuerpo rígido dentro de [0, n - 1] x [0, m - 1]
 * y remuestrea la cota de terreno elev de cada vértice con getGridElevAt (per D-02).
 */
export function translateLotPolygon(
  basePts: { x: number; y: number }[],
  dx: number,
  dy: number,
  n: number,
  m: number,
  getGridElevAt: (x: number, y: number) => number
): Point3D[] {
  const { x: cdx, y: cdy } = clampLotDragOffset(basePts, dx, dy, n, m);
  return basePts.map((p) => {
    const nx = Math.max(0, Math.min(n - 1, p.x + cdx));
    const ny = Math.max(0, Math.min(m - 1, p.y + cdy));
    return {
      x: nx,
      y: ny,
      elev: getGridElevAt(nx, ny),
    };
  });
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

/**
 * Proyecta y une mediante convexHull3D las sombras direccionales de todos los niveles
 * volumétricos activos (continuous, main, upper_stepped), aterrizando cada huella a la
 * cota real del terreno natural (getGridElevAt) (per D-01).
 */
export function projectMultiTierDirectionalShadowOnTerrain(
  tiers: VolumeTier[],
  fallbackFootprintPts: Point3D[],
  fallbackTopElevs: number[],
  angleDeg: number,
  azimuthDeg: number,
  meshData: MeshData | undefined,
  n: number,
  m: number,
  getGridElevAt: (x: number, y: number) => number
): Point3D[] {
  if (!tiers || tiers.length === 0) {
    return projectDirectionalShadowOnTerrain(
      fallbackFootprintPts,
      fallbackTopElevs,
      angleDeg,
      azimuthDeg,
      meshData,
      n,
      m,
      getGridElevAt
    );
  }

  const combinedShadowPts: Point3D[] = [];
  for (const tier of tiers) {
    if (!tier.basePts || tier.basePts.length < 3) continue;
    // Aterrizar cada vértice base a la cota real del terreno para medir la altura total del techo sobre el suelo
    const groundedBasePts: Point3D[] = tier.basePts.map((p) => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y),
    }));
    const roofElevs: number[] = tier.roofPts.map((rp) => rp.elev);
    const tierShadowHull = projectDirectionalShadowOnTerrain(
      groundedBasePts,
      roofElevs,
      angleDeg,
      azimuthDeg,
      meshData,
      n,
      m,
      getGridElevAt
    );
    combinedShadowPts.push(...tierShadowHull);
  }

  if (combinedShadowPts.length < 3) {
    return projectDirectionalShadowOnTerrain(
      fallbackFootprintPts,
      fallbackTopElevs,
      angleDeg,
      azimuthDeg,
      meshData,
      n,
      m,
      getGridElevAt
    );
  }

  return convexHull3D(combinedShadowPts);
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

  const upperStepStartH = Math.max(threshold105, contBaseH);
  if (hasUpperStep && effectiveHeight > upperStepStartH + 0.05) {
    const upperInset =
      insetPolygonBisector(lotPolygon, totalUpperSetbackMeters, meshData, n) || mainInset;
    const upperGroundPts = upperInset.map((p) => ({
      x: p.x,
      y: p.y,
      elev: getGridElevAt(p.x, p.y),
    }));
    const baseZUpper = mainBaseElev + upperStepStartH;
    const topZ = mainBaseElev + effectiveHeight;

    const basePts = upperGroundPts.map((p) => ({ x: p.x, y: p.y, elev: baseZUpper }));
    const roofPts = upperGroundPts.map((p) => ({ x: p.x, y: p.y, elev: topZ }));

    tiers.push({
      id: 'upper_stepped',
      label: `Cuerpo > 10.5m Art. 2.6.12 (Dist. ${totalUpperSetbackMeters.toFixed(1)}m)`,
      basePts,
      roofPts,
      baseOffsetZ: upperStepStartH,
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
    const hasMatchingRoofVertices = topRoofPtsForRasante.length === lotPolygon.length;
    const insetP1 = hasMatchingRoofVertices ? topRoofPtsForRasante[i] : undefined;
    const insetP2 = hasMatchingRoofVertices ? topRoofPtsForRasante[j] : undefined;

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

  // Proposed Volume Shadow: combines the footprints and heights of all active tiers grounded on terrain (per D-01)
  const fallbackProposedElevs = mainGroundPts.map((p) => p.elev + effectiveHeight);

  const proposedPolygons: Point3D[][] = directions.map((d) =>
    projectMultiTierDirectionalShadowOnTerrain(
      tiers,
      mainGroundPts,
      fallbackProposedElevs,
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

/**
 * Recorta un segmento 2D (lon, lat) contra el bounding box [minLon, maxLon] x [minLat, maxLat]
 * usando el algoritmo paramétrico de Liang-Barsky.
 */
export function clipSegmentToBBox(
  p1: { lon: number; lat: number },
  p2: { lon: number; lat: number },
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number
): { c1: { lon: number; lat: number }; c2: { lon: number; lat: number }; t0: number; t1: number } | null {
  const dx = p2.lon - p1.lon;
  const dy = p2.lat - p1.lat;
  let t0 = 0;
  let t1 = 1;

  const clipSide = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) {
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    !clipSide(-dx, p1.lon - minLon) ||
    !clipSide(dx, maxLon - p1.lon) ||
    !clipSide(-dy, p1.lat - minLat) ||
    !clipSide(dy, maxLat - p1.lat)
  ) {
    return null;
  }

  return {
    c1: { lon: p1.lon + t0 * dx, lat: p1.lat + t0 * dy },
    c2: { lon: p1.lon + t1 * dx, lat: p1.lat + t1 * dy },
    t0,
    t1,
  };
}

/**
 * Recorta una polilínea OSM (vialidad o curso de agua) exactamente a los bordes del terreno
 * y subdivide cada tramo para que se adapte suavemente a la topografía 3D sin salirse del bbox.
 */
export function clipWayToBBox(
  geometry: { lon: number; lat: number }[],
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  maxStepMeters: number = 15
): { lon: number; lat: number }[][] {
  if (!Array.isArray(geometry) || geometry.length < 2) return [];
  const { minLon, maxLon, minLat, maxLat } = bbox;
  const polylines: { lon: number; lat: number }[][] = [];
  let currentLine: { lon: number; lat: number }[] = [];

  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    const clipped = clipSegmentToBBox(p1, p2, minLon, maxLon, minLat, maxLat);

    if (!clipped) {
      if (currentLine.length >= 2) {
        polylines.push(currentLine);
      }
      currentLine = [];
      continue;
    }

    const { c1, c2, t0, t1 } = clipped;
    if (t0 > 1e-6 || currentLine.length === 0) {
      if (currentLine.length >= 2) {
        polylines.push(currentLine);
      }
      currentLine = [c1];
    }

    const distM = Math.hypot((c2.lon - c1.lon) * 111320, (c2.lat - c1.lat) * 111320);
    const steps = Math.max(1, Math.ceil(distM / maxStepMeters));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      currentLine.push({
        lon: c1.lon + (c2.lon - c1.lon) * f,
        lat: c1.lat + (c2.lat - c1.lat) * f,
      });
    }

    if (t1 < 1 - 1e-6) {
      if (currentLine.length >= 2) {
        polylines.push(currentLine);
      }
      currentLine = [];
    }
  }

  if (currentLine.length >= 2) {
    polylines.push(currentLine);
  }

  return polylines;
}

/**
 * Normaliza la respuesta de OpenStreetMap API v0.6 (map.json con nodes/ways)
 * o de Overpass API (out geom) al formato unificado con `geometry: [{lat, lon}]`.
 */
export function normalizeOsmElementsToGeom(data: any): { elements: any[] } | null {
  if (!data || !Array.isArray(data.elements)) return null;

  const nodeMap = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const wayGeomMap = new Map<number, { lat: number; lon: number }[]>();
  for (const el of data.elements) {
    if (el.type === 'way') {
      if (!Array.isArray(el.geometry) && Array.isArray(el.nodes)) {
        el.geometry = el.nodes
          .map((nid: number) => nodeMap.get(nid))
          .filter(Boolean);
      }
      if (Array.isArray(el.geometry)) {
        wayGeomMap.set(el.id, el.geometry);
      }
    }
  }

  const filteredElements: any[] = [];
  for (const el of data.elements) {
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      if (
        el.tags?.building ||
        el.tags?.['building:part'] ||
        el.tags?.highway ||
        el.tags?.waterway
      ) {
        if (!el.tags.building && el.tags['building:part']) {
          el.tags.building = el.tags['building:part'];
        }
        filteredElements.push(el);
      }
    } else if (
      el.type === 'relation' &&
      (el.tags?.building || el.tags?.['building:part']) &&
      Array.isArray(el.members)
    ) {
      if (!el.tags.building && el.tags['building:part']) {
        el.tags.building = el.tags['building:part'];
      }
      for (const m of el.members) {
        if (!Array.isArray(m.geometry) && m.type === 'way' && wayGeomMap.has(m.ref)) {
          m.geometry = wayGeomMap.get(m.ref);
        }
      }
      filteredElements.push(el);
    }
  }

  return { elements: filteredElements };
}

/**
 * Obtiene edificios, vías y cursos de agua de OpenStreetMap para un BBox dado.
 * Prioriza la API oficial rápida de OSM v0.6 (map.json en ~2s) y el proxy local /api/overpass,
 * con fallback a mirrors de Overpass API.
 */
export async function fetchOsmLayersForBBox(bbox: {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}): Promise<{ elements: any[] } | null> {
  const { minLat, maxLat, minLon, maxLon } = bbox;

  // 1. Intentar API oficial de OpenStreetMap v0.6 map.json (~1.5 - 2.5 segundos, CDN Fastly con CORS)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const osmUrl = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${minLon},${minLat},${maxLon},${maxLat}`;
    const resp = await fetch(osmUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const rawJson = await resp.json();
      const normalized = normalizeOsmElementsToGeom(rawJson);
      if (normalized && normalized.elements.length > 0) {
        console.log(
          `[GeoArc OSM] ${normalized.elements.length} elementos obtenidos vía API oficial OSM v0.6 (map.json)`
        );
        return normalized;
      }
    }
  } catch (osmErr) {
    console.warn('[GeoArc OSM] API oficial v0.6 no disponible o excedida, intentando Overpass:', osmErr);
  }

  const overpassQuery = `[out:json][timeout:25];
(
  way["building"](${minLat},${minLon},${maxLat},${maxLon});
  relation["building"](${minLat},${minLon},${maxLat},${maxLon});
  way["highway"](${minLat},${minLon},${maxLat},${maxLon});
  way["waterway"](${minLat},${minLon},${maxLat},${maxLon});
);
out geom;`;

  // 2. Intentar a través del proxy local de Vite (/api/overpass)
  try {
    const proxyResp = await fetch('/api/overpass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(overpassQuery),
    });
    if (proxyResp.ok) {
      const data = await proxyResp.json();
      const normalized = normalizeOsmElementsToGeom(data);
      if (normalized) {
        console.log(
          `[GeoArc OSM] ${normalized.elements.length} elementos obtenidos vía proxy local /api/overpass`
        );
        return normalized;
      }
    }
  } catch (proxyErr) {
    console.warn('[GeoArc OSM] Proxy local /api/overpass falló:', proxyErr);
  }

  // 3. Fallback a mirrors directos de Overpass
  const directMirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
  ];

  for (const mirrorUrl of directMirrors) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const mirrorResp = await fetch(mirrorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'data=' + encodeURIComponent(overpassQuery),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (mirrorResp.ok) {
        const data = await mirrorResp.json();
        const normalized = normalizeOsmElementsToGeom(data);
        if (normalized) {
          return normalized;
        }
      }
    } catch (_) {}
  }

  return null;
}


