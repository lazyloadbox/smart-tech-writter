/* Temporary helper: print the tail of the packaged app's main log. */
const fs = require('node:fs');
const path = require('node:path');

const logPath = path.join(process.env.APPDATA, 'smart-tech-writter', 'logs', 'main.log');
const text = fs.readFileSync(logPath, 'utf8');
const lines = text.split(/\r?\n/).filter(Boolean);
console.log(`log bytes: ${text.length}, lines: ${lines.length}`);
console.log('---- last 18 lines ----');
console.log(lines.slice(-18).join('\n'));
const errors = lines.slice(-300).filter((line) => /\[error\]|Cannot find module|ERR_DLOPEN|Uncaught/.test(line));
console.log('---- recent errors ----');
console.log(errors.length === 0 ? 'none' : errors.join('\n'));
