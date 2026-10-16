export interface SunPosition {
  elevation: number; // grados, positivo = sobre horizonte
  azimuth: number;   // grados, 0=Norte, 90=Este, 180=Sur, 270=Oeste
}

export function getSunPosition(
  lat: number,      // latitud en grados (negativo para hemisferio sur)
  lon: number,      // longitud en grados (negativo para Chile, ej. -70.65)
  date: Date,       // fecha local
  timeHours: number // hora local como número decimal (ej. 12.75 = 12:45)
): SunPosition {
  // 1. Día del año (1–365)
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const N = Math.floor(diff / (1000 * 60 * 60 * 24));

  // 2. Declinación solar (en grados)
  const declination = -23.45 * Math.cos((360 / 365) * (N + 10) * (Math.PI / 180));

  // 3. Meridiano de la zona horaria
  // tzOffset es la diferencia en horas respecto a UTC de la fecha actual.
  // El user especificó usar -4 de manera estática para sus pruebas
  const tzOffset = -4;
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
