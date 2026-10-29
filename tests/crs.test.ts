import { describe, it, expect } from 'vitest';
import {
  latLonToUtm,
  projectPointToCrs,
  generateWorldFileForCrs,
  SUPPORTED_CRS,
} from '../src/lib/crsService';

describe('crsService - Proyecciones Snyder 1987 WGS84 a UTM y Worldfiles (QUAL-01, D-02)', () => {
  describe('SUPPORTED_CRS', () => {
    it('soporta los sistemas de referencia estándar de Chile, referencia norte y WGS84', () => {
      expect(SUPPORTED_CRS['EPSG:32718']).toBeDefined();
      expect(SUPPORTED_CRS['EPSG:32718'].utmZone).toBe(18);
      expect(SUPPORTED_CRS['EPSG:32718'].isSouth).toBe(true);

      expect(SUPPORTED_CRS['EPSG:32719']).toBeDefined();
      expect(SUPPORTED_CRS['EPSG:32719'].utmZone).toBe(19);
      expect(SUPPORTED_CRS['EPSG:32719'].isSouth).toBe(true);

      expect(SUPPORTED_CRS['EPSG:32633']).toBeDefined();
      expect(SUPPORTED_CRS['EPSG:32633'].utmZone).toBe(33);
      expect(SUPPORTED_CRS['EPSG:32633'].isSouth).toBe(false);

      expect(SUPPORTED_CRS['EPSG:4326']).toBeDefined();
      expect(SUPPORTED_CRS['EPSG:4326'].isProjected).toBe(false);
    });
  });

  describe('latLonToUtm', () => {
    it('convierte coordenadas geográficas de Santiago a UTM Zona 19S con falso norte de 10,000,000m', () => {
      // Coordenadas de Santiago de Chile: -33.4489, -70.6693
      const utm = latLonToUtm(-33.4489, -70.6693, 19, true);

      // Easting esperado ~344,700m (con falso este 500,000m)
      expect(utm.easting).toBeGreaterThan(340000);
      expect(utm.easting).toBeLessThan(350000);

      // Northing esperado ~6,298,000m (con falso norte 10,000,000m en hemisferio sur)
      expect(utm.northing).toBeGreaterThan(6290000);
      expect(utm.northing).toBeLessThan(6305000);
    });

    it('previene singularidades polares acotando latitudes fuera del rango [-80, 84]', () => {
      const southPoleUtm = latLonToUtm(-89.9, -70.66, 19, true);
      expect(Number.isFinite(southPoleUtm.easting)).toBe(true);
      expect(Number.isFinite(southPoleUtm.northing)).toBe(true);

      const northPoleUtm = latLonToUtm(89.9, 15.0, 33, false);
      expect(Number.isFinite(northPoleUtm.easting)).toBe(true);
      expect(Number.isFinite(northPoleUtm.northing)).toBe(true);
    });
  });

  describe('projectPointToCrs', () => {
    it('proyecta a EPSG:4326 retornando { x: lon, y: lat }', () => {
      const pt = projectPointToCrs(-33.45, -70.66, 'EPSG:4326');
      expect(pt.x).toBe(-70.66);
      expect(pt.y).toBe(-33.45);
    });

    it('proyecta a EPSG:32719 retornando coordenadas métricas planas de UTM 19S', () => {
      const pt = projectPointToCrs(-33.4489, -70.6693, 'EPSG:32719');
      expect(pt.x).toBeGreaterThan(340000);
      expect(pt.x).toBeLessThan(350000);
      expect(pt.y).toBeGreaterThan(6290000);
      expect(pt.y).toBeLessThan(6305000);
    });
  });

  describe('generateWorldFileForCrs', () => {
    it('genera archivo Worldfile .JGW de 6 líneas con escala Y estrictamente negativa para EPSG:32719', () => {
      const jgw = generateWorldFileForCrs({
        bbox: { minLat: -33.45, maxLat: -33.44, minLon: -70.67, maxLon: -70.66 },
        width: 500,
        height: 500,
        crsCode: 'EPSG:32719',
      });

      const lines = jgw.split(/\r?\n/);
      expect(lines.length).toBe(6);

      const [xScale, rot1, rot2, yScale, xOrigin, yOrigin] = lines.map((l) => parseFloat(l));
      expect(xScale).toBeGreaterThan(0);
      expect(rot1).toBe(0);
      expect(rot2).toBe(0);
      expect(yScale).toBeLessThan(0);
      expect(Number.isFinite(xOrigin)).toBe(true);
      expect(Number.isFinite(yOrigin)).toBe(true);
    });

    it('genera Worldfile para EPSG:4326 en grados con escala Y negativa', () => {
      const jgw = generateWorldFileForCrs({
        bbox: { minLat: -33.5, maxLat: -33.4, minLon: -70.7, maxLon: -70.6 },
        width: 1000,
        height: 1000,
        crsCode: 'EPSG:4326',
      });

      const lines = jgw.split(/\r?\n/);
      expect(lines.length).toBe(6);

      const [xScale, rot1, rot2, yScale] = lines.map((l) => parseFloat(l));
      expect(xScale).toBeCloseTo(0.0001, 6);
      expect(rot1).toBe(0);
      expect(rot2).toBe(0);
      expect(yScale).toBeCloseTo(-0.0001, 6);
    });
  });
});
