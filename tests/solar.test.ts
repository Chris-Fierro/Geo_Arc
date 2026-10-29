import { describe, it, expect } from 'vitest';
import {
  parseLocalSolarDate,
  getSolarTimezoneOffset,
  getSunPosition,
} from '../src/lib/SunPosition';

describe('SunPosition - Motor Solar Astronómico y Husos Horarios Dinámicos (QUAL-01, D-02)', () => {
  describe('parseLocalSolarDate', () => {
    it('normaliza cadenas YYYY-MM-DD a mediodía local (12:00:00)', () => {
      const d = parseLocalSolarDate('2026-06-21');
      expect(d.getHours()).toBe(12);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    });

    it('normaliza instancias Date en medianoche UTC a mediodía local sin desfase de fecha', () => {
      const utcDate = new Date('2026-01-15T00:00:00.000Z');
      const normalized = parseLocalSolarDate(utcDate);
      expect(normalized.getHours()).toBe(12);
      expect(normalized.getMinutes()).toBe(0);
    });
  });

  describe('getSolarTimezoneOffset', () => {
    it('Santiago de Chile (-33.45, -70.66): offset de -4 en invierno (junio) y -3 en verano (enero)', () => {
      const winterDate = new Date(2026, 5, 21); // Junio (Invierno austral)
      const summerDate = new Date(2026, 0, 15); // Enero (Verano austral)

      const offsetWinter = getSolarTimezoneOffset(-33.45, -70.66, winterDate);
      const offsetSummer = getSolarTimezoneOffset(-33.45, -70.66, summerDate);

      expect(offsetWinter).toBe(-4);
      expect(offsetSummer).toBe(-3);
    });

    it('Región de Magallanes (-53.16, -70.91): offset permanente de -3 en verano e invierno', () => {
      const winterDate = new Date(2026, 5, 21); // Junio
      const summerDate = new Date(2026, 0, 15); // Enero

      const puntaArenasWinter = getSolarTimezoneOffset(-53.16, -70.91, winterDate);
      const puntaArenasSummer = getSolarTimezoneOffset(-53.16, -70.91, summerDate);

      expect(puntaArenasWinter).toBe(-3);
      expect(puntaArenasSummer).toBe(-3);
    });

    it('aproximación astronómica para ubicaciones internacionales fuera de Chile', () => {
      // Greenwich (lon ~ 0°): offset 0
      const londonOffset = getSolarTimezoneOffset(51.5, -0.1, new Date(2026, 5, 21));
      expect(londonOffset).toBe(0);

      // Tokio (lon ~ 139.7°): offset ~ 9
      const tokyoOffset = getSolarTimezoneOffset(35.68, 139.7, new Date(2026, 5, 21));
      expect(tokyoOffset).toBe(9);
    });
  });

  describe('getSunPosition', () => {
    it('calcula mediodía solar de verano en Santiago con elevación alta (> 60°) y acimut norte', () => {
      const summerDate = new Date(2026, 0, 15);
      const pos = getSunPosition(-33.45, -70.66, summerDate, 13.5);

      // En verano al mediodía solar en Santiago, elevación > 60° y sol apuntando hacia el norte (acimut próximo a 0° / 360°)
      expect(pos.elevation).toBeGreaterThan(60);
      const devFromNorth = Math.min(pos.azimuth, 360 - pos.azimuth);
      expect(devFromNorth).toBeLessThan(30);
    });

    it('calcula elevación solar negativa (bajo el horizonte) en horas nocturnas', () => {
      const date = new Date(2026, 5, 21);
      const nightPos = getSunPosition(-33.45, -70.66, date, 2.0); // 02:00 AM

      expect(nightPos.elevation).toBeLessThan(0);
    });

    it('calcula solsticio de invierno en Santiago al mediodía con elevación moderada (> 30° y < 40°)', () => {
      const winterDate = new Date(2026, 5, 21);
      const pos = getSunPosition(-33.45, -70.66, winterDate, 12.8);

      expect(pos.elevation).toBeGreaterThan(30);
      expect(pos.elevation).toBeLessThan(40);
    });
  });
});
