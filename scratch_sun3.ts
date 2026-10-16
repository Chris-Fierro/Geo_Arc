function getSunPosition(
  lat: number,
  lon: number,
  date: Date,
  timeHours: number
) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const N = Math.floor(diff / (1000 * 60 * 60 * 24));

  const declination = -23.45 * Math.cos((360 / 365) * (N + 10) * (Math.PI / 180));

  const tzOffset = -(date.getTimezoneOffset() / 60);
  const lstMeridian = tzOffset * 15;

  const B = (360 / 365) * (N - 81) * (Math.PI / 180);
  const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  const TC = 4 * (lon - lstMeridian) + eqTime;

  const localTimeMin = timeHours * 60;
  const TST = localTimeMin + TC;

  const H = (TST / 4) - 180;

  const latRad   = lat * (Math.PI / 180);
  const decRad   = declination * (Math.PI / 180);
  const HRad     = H * (Math.PI / 180);

  const sinElevation = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(HRad);
  const elevationRad  = Math.asin(sinElevation);
  const elevationDeg  = elevationRad * (180 / Math.PI);

  const cosAzimuth = (Math.sin(decRad) - Math.sin(latRad) * sinElevation) / (Math.cos(latRad) * Math.cos(elevationRad));
  let azimuthDeg = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * (180 / Math.PI);

  if (H > 0) {
    azimuthDeg = 360 - azimuthDeg;
  }

  console.log({ N, tzOffset, elevationDeg, azimuthDeg });
  return { elevationDeg, azimuthDeg };
}

getSunPosition(-33.45, -70.65, new Date(2024, 11, 21), 12.75);
