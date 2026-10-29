import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildThreeSceneFromMeshData,
  generateDxfContent,
  generateSvgTopographicSheet,
} from '../src/lib/exportService';
import { validateGeoarcPayload } from '../src/lib/geoarcValidator';
import type { MeshData } from '../src/lib/meshProcessor';

describe('exportService y geoarcValidator - Escena Three.js, DXF/SVG y Validación de Esquema (QUAL-01, QUAL-03, D-02, D-03)', () => {
  const sampleMesh: MeshData = {
    grid: [10, 12, 11, 15],
    minEv: 10,
    maxEv: 15,
    w: 100,
    h: 100,
    size: 2,
    cols: 2,
    rows: 2,
    buildings: {
      elements: [
        {
          type: 'way',
          tags: { building: 'yes', height: '6.0' },
          geometry: [
            { lat: -33.441, lon: -70.669 },
            { lat: -33.441, lon: -70.668 },
            { lat: -33.442, lon: -70.668 },
            { lat: -33.442, lon: -70.669 },
          ],
        },
      ],
    },
    bbox: { minLat: -33.445, maxLat: -33.440, minLon: -70.670, maxLon: -70.665 },
  };

  describe('buildThreeSceneFromMeshData', () => {
    it('construye escena Three.js con objetos Terreno_Topografico y Edificios_Contexto', () => {
      const scene = buildThreeSceneFromMeshData(sampleMesh, {
        zExaggeration: 1.0,
        includeBuildings: true,
      });

      expect(scene).toBeInstanceOf(THREE.Scene);
      expect(scene.name).toBe('GeoArc_Terrain_Scene');

      const terrainMesh = scene.getObjectByName('Terreno_Topografico') as THREE.Mesh;
      expect(terrainMesh).toBeDefined();
      expect(terrainMesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);

      const buildingsGroup = scene.getObjectByName('Edificios_Contexto') as THREE.Group;
      expect(buildingsGroup).toBeDefined();
      expect(buildingsGroup.children.length).toBeGreaterThan(0);
    });

    it('normaliza la cota Z/Y del terreno respecto a minEv', () => {
      const scene = buildThreeSceneFromMeshData(sampleMesh, {
        zExaggeration: 1.0,
        includeBuildings: false,
      });

      const terrainMesh = scene.getObjectByName('Terreno_Topografico') as THREE.Mesh;
      const pos = terrainMesh.geometry.attributes.position;

      // El punto de elevación mínima (10) debe normalizarse a Y = 0 (10 - 10 = 0)
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      expect(minY).toBeCloseTo(0, 4);
      expect(maxY).toBeCloseTo(5, 4); // maxEv (15) - minEv (10) = 5
    });

    it('aplica empotramiento en pendiente de 0.35m a los edificios contextuales', () => {
      const scene = buildThreeSceneFromMeshData(sampleMesh, {
        zExaggeration: 1.0,
        includeBuildings: true,
      });

      const buildingsGroup = scene.getObjectByName('Edificios_Contexto') as THREE.Group;
      const buildingMesh = buildingsGroup.children[0] as THREE.Mesh;
      expect(buildingMesh).toBeDefined();

      // La geometría de extrusión del edificio contempla el empotramiento base de 0.35m
      const geom = buildingMesh.geometry as THREE.ExtrudeGeometry;
      expect(geom).toBeInstanceOf(THREE.ExtrudeGeometry);
      const params = (geom as any).parameters;
      expect(params.options.depth).toBeGreaterThanOrEqual(6.0 + 0.35);
    });
  });

  describe('generateDxfContent', () => {
    it('genera archivo DXF R15 métrico con encabezado AC1015, $MEASUREMENT y capas requeridas', () => {
      const dxf = generateDxfContent({
        meshData: sampleMesh,
        contours: [],
        crs: 'EPSG:32719',
      });

      expect(dxf).toContain('AC1015');
      expect(dxf).toContain('$MEASUREMENT');
      expect(dxf).toContain('CONTOURS');
      expect(dxf).toContain('BUILDINGS');
      expect(dxf).toContain('HIGHWAYS');
    });
  });

  describe('generateSvgTopographicSheet', () => {
    it('genera lámina vectorial SVG con namespace XML válido y estructura completa', () => {
      const svg = generateSvgTopographicSheet({
        meshData: sampleMesh,
        interval: 1.0,
      });

      expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(svg).toContain('<svg');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('</svg>');
    });
  });

  describe('validateGeoarcPayload', () => {
    const validPayload = {
      meshData: {
        w: 100,
        h: 100,
        cols: 2,
        rows: 2,
        minEv: 10,
        maxEv: 15,
        grid: [10, 12, 11, 15],
        satelliteTexture: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      },
    };

    it('acepta una carga útil .geoarc íntegra y válida', () => {
      const res = validateGeoarcPayload(validPayload);
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rechaza archivos cuando grid.length !== cols * rows', () => {
      const invalidPayload = {
        meshData: {
          ...validPayload.meshData,
          grid: [10, 12, 11], // 3 elementos en vez de 4
        },
      };
      const res = validateGeoarcPayload(invalidPayload);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/no coincide con cols \* rows/);
    });

    it('rechaza grillas con valores no finitos (NaN o Infinity)', () => {
      const nanPayload = {
        meshData: {
          ...validPayload.meshData,
          grid: [10, NaN, 11, 15],
        },
      };
      const resNaN = validateGeoarcPayload(nanPayload);
      expect(resNaN.valid).toBe(false);
      expect(resNaN.error).toMatch(/Valor no finito/);

      const infPayload = {
        meshData: {
          ...validPayload.meshData,
          grid: [10, 12, Infinity, 15],
        },
      };
      const resInf = validateGeoarcPayload(infPayload);
      expect(resInf.valid).toBe(false);
      expect(resInf.error).toMatch(/Valor no finito/);
    });

    it('rechaza texturas con URLs remotas no autorizadas (SSRF/XSS protection)', () => {
      const ssrfPayload = {
        meshData: {
          ...validPayload.meshData,
          satelliteTexture: 'https://attacker.com/malicious.jpg',
        },
      };
      const res = validateGeoarcPayload(ssrfPayload);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/protocolo no permitido/);
    });

    it('permite texturas con URLs locales blob: o data:image/png;base64,', () => {
      const blobPayload = {
        meshData: {
          ...validPayload.meshData,
          satelliteTexture: 'blob:http://localhost:3000/1234-5678',
        },
      };
      expect(validateGeoarcPayload(blobPayload).valid).toBe(true);

      const pngPayload = {
        meshData: {
          ...validPayload.meshData,
          satelliteTexture: 'data:image/png;base64,iVBORw0KGgo...',
        },
      };
      expect(validateGeoarcPayload(pngPayload).valid).toBe(true);
    });
  });
});
