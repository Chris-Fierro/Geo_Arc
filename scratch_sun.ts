import { getSunPosition } from './src/lib/SunPosition.js';

const sunPos = getSunPosition(
  -33.45,
  -70.65,
  new Date(2024, 11, 21), // Dec 21
  12.75
);

console.log(sunPos);
