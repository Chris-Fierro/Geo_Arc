export interface SunPosition {
  elevation: number; // grados, positivo = sobre horizonte
  azimuth: number;   // grados, 0=Norte, 90=Este, 180=Sur, 270=Oeste
}

/**
 * Normaliza una entrada de fecha a mediodía local (12:00:00) para evitar
 * el desfase de 1 día provocado por medianoche UTC y husos horarios occidentales.
 */
export function parseLocalSolarDate(dateInput: string | Date): Date {
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T12:00:00`);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    // Si fue creado con new Date('YYYY-MM-DD'), sus componentes UTC son 00:00:00.000Z
    if (
      dateInput.getUTCHours() === 0 &&
      dateInput.getUTCMinutes() === 0 &&
      dateInput.getUTCSeconds() === 0 &&
      dateInput.getUTCMilliseconds() === 0
    ) {
      return new Date(
        dateInput.getUTCFullYear(),
        dateInput.getUTCMonth(),
        dateInput.getUTCDate(),
        12,
        0,
        0
      );
    }
    return new Date(dateInput.getTime());
  }
  return new Date();
}

/**
 * Determina el huso horario real (offset en horas respecto a UTC) para una ubicación y fecha dadas.
 * - En Chile continental: detecta horario de verano (UTC-3) / invierno (UTC-4) vía America/Santiago
 *   y UTC-3 permanente en Magallanes (lat <= -49°).
 * - Fuera de Chile: utiliza la aproximación astronómica longitudinal Math.round(lon / 15).
 */
export function getSolarTimezoneOffset(lat: number, lon: number, date: Date): number {
  const localDate = parseLocalSolarDate(date);
  const year = localDate.getFullYear();
  const month = localDate.getMonth(); // 0 = Enero .. 11 = Diciembre
  const day = localDate.getDate();

  // Chile Continental (incluyendo Magallanes entre -56° y -17° lat, -76° y -66° lon)
  const isContinentalChile =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -56 &&
    lat <= -17 &&
    lon >= -76 &&
    lon <= -66;

  if (isContinentalChile) {
    if (lat <= -49) {
      return -3; // Región de Magallanes mantiene UTC-3 permanente
    }
    try {
      const utcMidday = new Date(Date.UTC(year, month, day, 16, 0, 0));
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago',
        timeZoneName: 'shortOffset',
      }).formatToParts(utcMidday);
      const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
      const match = tzPart.match(/GMT([+-]\d+)(?::(\d+))?/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const mins = match[2] ? parseInt(match[2], 10) / 60 : 0;
        return hours + (hours < 0 ? -mins : mins);
      }
    } catch (_) {
      // Fallback determinista para Chile central (invierno Abr-Ago = -4, verano Sep-Mar = -3)
    }
    return month >= 3 && month <= 7 ? -4 : -3;
  }

  // Resto del mundo: aproximación astronómica por huso longitudinal (15° = 1 hora)
  const safeLon = Number.isFinite(lon) ? lon : 0;
  const approxOffset = Math.round(safeLon / 15) || 0;
  return Math.max(-12, Math.min(14, approxOffset));
}

export function getSunPosition(
  lat: number,      // latitud en grados (negativo para hemisferio sur)
  lon: number,      // longitud en grados (negativo para Chile, ej. -70.65)
  date: Date,       // fecha local
  timeHours: number // hora local como número decimal (ej. 12.75 = 12:45)
): SunPosition {
  const localDate = parseLocalSolarDate(date);
  const year = localDate.getFullYear();
  const month = localDate.getMonth();
  const day = localDate.getDate();

  // 1. Día del año (1–366) usando componentes locales en Date.UTC inmune a transiciones DST
  const N = Math.round((Date.UTC(year, month, day) - Date.UTC(year, 0, 0)) / 86400000);

  // 2. Declinación solar (en grados)
  const declination = -23.45 * Math.cos((360 / 365) * (N + 10) * (Math.PI / 180));

  // 3. Meridiano de la zona horaria dinámica
  const tzOffset = getSolarTimezoneOffset(lat, lon, localDate);
  const lstMeridian = tzOffset * 15;

  // 4. Ecuación del tiempo (minutos)
  const B = (360 / 365) * (N - 81) * (Math.PI / 180);
  const eqTime = 9.87 * Math.sin(2 * B) 
               - 7.53 * Math.cos(B) 
               - 1.5  * Math.sin(B);

  // 5. Corrección de tiempo (minutos)
  const TC = 4 * (lon - lstMeridian) + eqTime;

  // 6. Hora solar verdadera (en minutos desde medianoche)
  const localTimeMin = timeHours * 60;
  const TST = localTimeMin + TC;

  // 7. Ángulo horario (grados)
  const H = (TST / 4) - 180;

  // 8. Ángulos a radianes
  const latRad   = lat * (Math.PI / 180);
  const decRad   = declination * (Math.PI / 180);
  const HRad     = H * (Math.PI / 180);

  // 9. Elevación solar
  const sinElevation = Math.sin(latRad) * Math.sin(decRad)
                     + Math.cos(latRad) * Math.cos(decRad) * Math.cos(HRad);
  const elevationRad  = Math.asin(sinElevation);
  const elevationDeg  = elevationRad * (180 / Math.PI);

  // 10. Acimut solar (0 = Norte, 90 = Este)
  const cosAzimuth = (Math.sin(decRad) - Math.sin(latRad) * sinElevation)
                   / (Math.cos(latRad) * Math.cos(elevationRad));
  let azimuthDeg = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * (180 / Math.PI);

  // Corrección de cuadrante:
  if (H > 0) {
    azimuthDeg = 360 - azimuthDeg;
  }

  return {
    elevation: elevationDeg,
    azimuth:   azimuthDeg,
  };
}
