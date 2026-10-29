import { describe, it, expect } from 'vitest';
import {
  insetPolygonBisector,
  clipWayToBBox,
  getRegionRasanteInfo,
  signedPolygonArea2D,
} from '../src/lib/ogucService';
import type { MeshData } from '../src/lib/meshProcessor';

describe('ogucService - Motores Normativos y Geométricos (QUAL-01, D-02)', () => {
  const dummyMesh: MeshData = {
    grid: new Array(100 * 100).fill(10),
    minEv: 10,
    maxEv: 10,
    w: 100,
    h: 100,
    size: 100,
    cols: 100,
    rows: 100,
  };

  describe('insetPolygonBisector', () => {
    it('calcula retranqueo interior en lote rectangular reduciendo dimensiones hacia el centro', () => {
      const rect = [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 50, y: 40 },
        { x: 10, y: 40 },
      ];
      const inset = insetPolygonBisector(rect, 3.0, dummyMesh, 100);
      expect(inset).not.toBeNull();
      expect(inset!.length).toBe(4);

      // Todos los vértices deben desplazarse hacia el interior del lote
      for (const pt of inset!) {
        expect(pt.x).toBeGreaterThanOrEqual(10);
        expect(pt.x).toBeLessThanOrEqual(50);
        expect(pt.y).toBeGreaterThanOrEqual(10);
        expect(pt.y).toBeLessThanOrEqual(40);
      }

      const origArea = Math.abs(signedPolygonArea2D(rect));
      const insetArea = Math.abs(signedPolygonArea2D(inset!));
      expect(insetArea).toBeLessThan(origArea);
      expect(insetArea).toBeGreaterThan(0);
    });

    it('procesa lotes cóncavos en forma de L generando 6 vértices sin auto-intersecciones', () => {
      const lShape = [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 30 },
        { x: 30, y: 30 },
        { x: 30, y: 60 },
        { x: 0, y: 60 },
      ];
      const inset = insetPolygonBisector(lShape, 2.5, dummyMesh, 100);
      expect(inset).not.toBeNull();
      expect(inset!.length).toBe(6);

      const origArea = Math.abs(signedPolygonArea2D(lShape));
      const insetArea = Math.abs(signedPolygonArea2D(inset!));
      expect(insetArea).toBeLessThan(origArea);
      expect(insetArea).toBeGreaterThan(0);
    });

    it('procesa lotes cóncavos en forma de U con estabilidad en entrantes complejas', () => {
      const uShape = [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 80 },
        { x: 60, y: 80 },
        { x: 60, y: 30 },
        { x: 20, y: 30 },
        { x: 20, y: 80 },
        { x: 0, y: 80 },
      ];
      const inset = insetPolygonBisector(uShape, 2.0, dummyMesh, 100);
      expect(inset).not.toBeNull();
      expect(inset!.length).toBe(8);

      const origArea = Math.abs(signedPolygonArea2D(uShape));
      const insetArea = Math.abs(signedPolygonArea2D(inset!));
      expect(insetArea).toBeLessThan(origArea);
      expect(insetArea).toBeGreaterThan(0);
    });

    it('retorna null con elegancia ante colapso geométrico por retranqueo excesivo', () => {
      const narrowLot = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 50 },
        { x: 0, y: 50 },
      ];
      // Retranqueo de 5m en lote de 4m de ancho colapsa la geometría
      const inset = insetPolygonBisector(narrowLot, 5.0, dummyMesh, 100);
      expect(inset).toBeNull();
    });
  });

  describe('clipWayToBBox', () => {
    const bbox = { minLon: -70.7, maxLon: -70.6, minLat: -33.5, maxLat: -33.4 };

    it('recorta segmentos que atraviesan el límite del BBox con precisión de 4 decimales', () => {
      const lineCrossing = [
        { lon: -70.75, lat: -33.45 }, // Fuera (oeste)
        { lon: -70.65, lat: -33.45 }, // Dentro
        { lon: -70.55, lat: -33.45 }, // Fuera (este)
      ];
      const clipped = clipWayToBBox(lineCrossing, bbox, 15);
      expect(clipped.length).toBe(1);
      expect(clipped[0][0].lon).toBeCloseTo(-70.7, 4);
      expect(clipped[0][clipped[0].length - 1].lon).toBeCloseTo(-70.6, 4);
    });

    it('retorna arreglo vacío para líneas totalmente exteriores', () => {
      const exteriorLine = [
        { lon: -71.0, lat: -34.0 },
        { lon: -71.1, lat: -34.1 },
      ];
      const clipped = clipWayToBBox(exteriorLine, bbox, 15);
      expect(clipped).toEqual([]);
    });

    it('conserva íntegramente líneas totalmente interiores dentro del BBox', () => {
      const interiorLine = [
        { lon: -70.68, lat: -33.48 },
        { lon: -70.62, lat: -33.42 },
      ];
      const clipped = clipWayToBBox(interiorLine, bbox, 15);
      expect(clipped.length).toBe(1);
      expect(clipped[0][0].lon).toBeCloseTo(-70.68, 4);
      expect(clipped[0][clipped[0].length - 1].lon).toBeCloseTo(-70.62, 4);
    });
  });

  describe('getRegionRasanteInfo', () => {
    it('Grupo 1 (Norte): ángulo sur de 63° y factor extra de 0.2', () => {
      const info = getRegionRasanteInfo(1);
      expect(info.group).toBe(1);
      expect(info.surAngle).toBe(63);
      expect(info.extraFactor).toBe(0.2);
    });

    it('Grupo 2 (Centro): ángulo sur de 57° y factor extra de 0.3', () => {
      const info = getRegionRasanteInfo(2);
      expect(info.group).toBe(2);
      expect(info.surAngle).toBe(57);
      expect(info.extraFactor).toBe(0.3);
    });

    it('Grupo 3 (Sur): ángulo sur de 51° y factor extra de 0.4', () => {
      const info = getRegionRasanteInfo(3);
      expect(info.group).toBe(3);
      expect(info.surAngle).toBe(51);
      expect(info.extraFactor).toBe(0.4);
    });
  });
});
