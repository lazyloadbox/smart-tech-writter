// Build the offline embedding-model package (design §2.5.6.6 / P2b-6).
//
//   node scripts/build-model-package.mjs [--out <path>]
//
// Downloads the official model files listed in the built-in allow-list,
// verifies every SHA-256 digest, and writes:
//
//   stw-embedding-multilingual-e5-small-int8-r1.zip
//     manifest.json
//     model_quantized.onnx
//     tokenizer.json
//     config.json
//
// The result can be attached to a GitHub Release and installed through
// "Install from package (.zip)" on machines without internet access.
//
// Uses only Node built-ins (fetch is available in Node 18+), so no extra
// dependency and no bundler involvement.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MANIFEST_PATH = path.resolve('src/main/modules/glossary/embedding/model-manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

const modelId = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : manifest.defaultModelId;
const spec = manifest.models[modelId];
if (!spec) {
  console.error(`[model-package] unknown model id: ${modelId}`);
  process.exit(1);
}

const outPath = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : path.resolve(`stw-embedding-${modelId}-${spec.revision}.zip`);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal deflated ZIP writer (mirrors the runtime exporter). */
function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + deflated.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, eocd]);
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const files = [];
  const recorded = {};
  for (const [name, expected] of Object.entries(spec.files)) {
    const url = `${spec.downloadSources[0].replace(/\/$/, '')}/${encodeURIComponent(name)}`;
    console.log(`[model-package] downloading ${name} …`);
    const data = await download(url);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (sha256 !== expected.sha256) {
      throw new Error(`${name}: SHA-256 mismatch (expected ${expected.sha256}, got ${sha256})`);
    }
    files.push({ name, data });
    recorded[name] = { size: data.length, sha256 };
    console.log(`[model-package] ${name}: ${(data.length / 1024 / 1024).toFixed(1)} MB, SHA-256 OK`);
  }

  const packageManifest = {
    format: 1,
    modelId,
    revision: spec.revision,
    dims: spec.dims,
    maxTokens: spec.maxTokens,
    prefix: spec.prefix,
    files: recorded,
  };
  files.unshift({
    name: 'manifest.json',
    data: Buffer.from(JSON.stringify(packageManifest, null, 2), 'utf8'),
  });

  const zip = createZip(files);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, zip);
  console.log(`[model-package] wrote ${outPath} (${(zip.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error('[model-package] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
