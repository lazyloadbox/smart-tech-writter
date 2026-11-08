// Persisted vector-index snapshot (P4-7).
//
// Loading ~50k × 384 float vectors from SQLite BLOBs costs tens of MB of row
// parsing on every start-up. The snapshot stores the already-normalized matrix
// as one contiguous buffer plus the id table, so a matching snapshot can be
// mapped/read in a single `readFileSync`.
//
// The snapshot is invalidated by the caller: `fingerprint` covers the model id,
// dimensionality and every `(entryId, contentHash)` pair, so any glossary or
// model change forces a rebuild from the authoritative SQLite rows.
//
// File layout (little endian):
//   magic     8 bytes  "STWVEC1\0"
//   version   u32
//   dims      u32
//   count     u32
//   fpLen     u32 + utf8 fingerprint
//   idsLen    u32 + utf8 JSON string array
//   vectors   count * dims * f32

import fs from 'node:fs';
import path from 'node:path';

const MAGIC = Buffer.from('STWVEC1\0', 'latin1');
const SNAPSHOT_VERSION = 1;

export interface VectorSnapshot {
  dims: number;
  ids: string[];
  data: Float32Array;
  fingerprint: string;
}

/** Serialize + write a snapshot atomically (temp file + rename). */
export function saveVectorSnapshot(filePath: string, snapshot: VectorSnapshot): void {
  const { dims, ids, data, fingerprint } = snapshot;
  if (dims <= 0 || ids.length * dims !== data.length) {
    throw new Error('invalid vector snapshot shape');
  }
  const fp = Buffer.from(fingerprint, 'utf-8');
  const idBuffer = Buffer.from(JSON.stringify(ids), 'utf-8');
  const header = Buffer.alloc(MAGIC.length + 16);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(SNAPSHOT_VERSION, MAGIC.length);
  header.writeUInt32LE(dims, MAGIC.length + 4);
  header.writeUInt32LE(ids.length, MAGIC.length + 8);
  header.writeUInt32LE(fp.length, MAGIC.length + 12);

  const idLength = Buffer.alloc(4);
  idLength.writeUInt32LE(idBuffer.length, 0);

  const vectorBuffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

  const tmp = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, Buffer.concat([header, fp, idLength, idBuffer, vectorBuffer]));
  fs.renameSync(tmp, filePath);
}

/** Read a snapshot; returns null when missing / corrupt / shape-mismatched. */
export function loadVectorSnapshot(filePath: string): VectorSnapshot | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < MAGIC.length + 16) return null;
    if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) return null;
    const offset = MAGIC.length;
    const version = buffer.readUInt32LE(offset);
    if (version !== SNAPSHOT_VERSION) return null;
    const dims = buffer.readUInt32LE(offset + 4);
    const count = buffer.readUInt32LE(offset + 8);
    const fpLength = buffer.readUInt32LE(offset + 12);
    let cursor = offset + 16;
    const fingerprint = buffer.subarray(cursor, cursor + fpLength).toString('utf-8');
    cursor += fpLength;
    const idLength = buffer.readUInt32LE(cursor);
    cursor += 4;
    const ids = JSON.parse(buffer.subarray(cursor, cursor + idLength).toString('utf-8')) as string[];
    cursor += idLength;
    const expected = count * dims * 4;
    if (buffer.length - cursor !== expected) return null;
    if (!Array.isArray(ids) || ids.length !== count || dims <= 0) return null;
    const data = new Float32Array(count * dims);
    buffer.copy(Buffer.from(data.buffer, data.byteOffset, data.byteLength), 0, cursor, cursor + expected);
    return { dims, ids, data, fingerprint };
  } catch {
    return null;
  }
}

/** Deterministic fingerprint over the model + all (entryId, contentHash) pairs. */
export function snapshotFingerprint(
  modelId: string,
  dims: number,
  entries: { entryId: string; contentHash: string }[]
): string {
  const parts = entries
    .map((entry) => `${entry.entryId}:${entry.contentHash}`)
    .sort()
    .join('|');
  // FNV-1a keeps this dependency free and is enough for cache invalidation.
  let hash = 0x811c9dc5;
  const text = `${modelId}|${dims}|${parts}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}:${entries.length}:${dims}`;
}
