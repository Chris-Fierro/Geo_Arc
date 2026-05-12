const d3 = require('d3');
const n = 3, m = 3;
const values = [0, 10, 0, 10, 20, 10, 0, 10, 0];
const contours = d3.contours().size([n, m]).thresholds([5])(values);
console.log(JSON.stringify(contours[0].coordinates));
