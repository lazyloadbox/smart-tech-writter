/* Temporary verification: check the electron-builder asar bundle for the export fixes. */
const asar = require('@electron/asar');

const p = 'dist/win-unpacked/resources/app.asar';
const files = asar.listPackage(p);
console.log('vite entries:', files.filter((f) => f.includes('vite')).slice(0, 10));
const mainPath = files.find((f) => /[\\/]\.vite[\\/]build[\\/]index\.js$/.test(f));
console.log('main bundle entry:', JSON.stringify(mainPath));

const main = asar.extractFile(p, mainPath.replace(/^[\\/]/, '')).toString('utf8');
console.log('bundle bytes:', main.length);
console.log('requires archiver:', main.includes('require("archiver")'));
console.log('zip writer in bundle:', main.includes('unsafe entry name'));
console.log('zip handler wired:', /"file:downloadZip"[\s\S]{0,1800}writeFileSync/.test(main));
console.log('tag-case normalisation:', main.includes('splitTagCaseNormalized'));
console.log('intro warning copy:', main.includes('before the first section'));
