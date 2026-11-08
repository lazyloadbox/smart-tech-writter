/* Temporary verification script: inspect the packaged app.asar main bundle. */
const asar = require('@electron/asar');

const p = 'out/smart-tech-writter-win32-x64/resources/app.asar';
const main = asar.extractFile(p, '.vite\\build\\index.js').toString('utf8');

const idx = main.indexOf('file:downloadZip');
console.log('offset:', idx);
console.log('---- snippet ----');
console.log(main.slice(Math.max(0, idx - 200), idx + 2200));
