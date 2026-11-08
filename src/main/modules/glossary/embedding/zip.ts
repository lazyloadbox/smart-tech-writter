// Minimal, dependency-free ZIP reader/writer (design §2.5.6.6 / P2b-1).
//
// The design nominates `yauzl`, but the offline model package only ever holds a
// handful of files. Implementing the subset we need keeps the dependency
// surface (and the packaged app size) unchanged and lets us enforce the zip-slip
// / zip-bomb protections explicitly:
//
//   - only file names listed by the caller are accepted
//   - names containing a path separator, `..` or an absolute path are rejected
//   - entry count and total uncompressed size are capped by the caller
//
// Supports stored (0) and deflate (8) entries, which covers archives produced by
// Windows Explorer, 7-Zip and our own exporter.

import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError('not a ZIP archive (end of central directory not found)');
}

/** List the file entries of a ZIP archive. Directories are skipped. */
export function listZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset >= buffer.length) throw new ZipError('central directory offset is out of range');

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ZipError('corrupt central directory');
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({
      name,
      method: buffer.readUInt16LE(offset + 10),
      crc32: buffer.readUInt32LE(offset + 16),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries.filter((entry) => !entry.name.endsWith('/'));
}

/** Reject unsafe entry names (zip slip). */
export function isSafeEntryName(name: string): boolean {
  if (!name) return false;
  if (name.includes('\\')) return false;
  if (name.includes('/')) return false;
  if (name === '.' || name === '..' || name.includes('..')) return false;
  if (/^[a-zA-Z]:/.test(name)) return false; // absolute Windows path
  if (name.startsWith('/')) return false;
  return true;
}

/**
 * Allow `folder/file.ext` style names (used by the document ZIP download where
 * each split document gets its own `_sections` folder). Every segment must be
 * a safe plain name, so zip-slip (`..`, absolute paths, drive letters,
 * backslashes) is still rejected.
 */
export function isSafeZipPath(name: string): boolean {
  if (!name) return false;
  if (name.includes('\\')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  const trimmed = name.endsWith('/') ? name.slice(0, -1) : name;
  const segments = trimmed.split('/');
  if (segments.length === 0) return false;
  return segments.every((segment) => isSafeEntryName(segment));
}

/** Read and (when deflated) inflate one entry. */
export function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  if (!isSafeEntryName(entry.name)) throw new ZipError(`unsafe entry name: ${entry.name}`);
  const local = entry.localHeaderOffset;
  if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
    throw new ZipError(`corrupt local header for ${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new ZipError(`truncated entry: ${entry.name}`);
  const raw = buffer.subarray(dataStart, dataEnd);

  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) {
    const inflated = zlib.inflateRawSync(raw);
    // Defend against a lying header (zip bomb): the real size must match.
    if (entry.uncompressedSize > 0 && inflated.length !== entry.uncompressedSize) {
      throw new ZipError(`size mismatch for ${entry.name}`);
    }
    return inflated;
  }
  throw new ZipError(`unsupported compression method ${entry.method} for ${entry.name}`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a deflated ZIP archive from `{ name, data }` pairs. */
export function createZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  // Bit 11 of the general-purpose flags marks the entry name as UTF-8. Without
  // it Windows Explorer decodes non-ASCII names (e.g. Chinese document titles)
  // with the OEM code page and shows mojibake.
  const generalPurposeFlags = (name: string): number => (/[^\x20-\x7E]/.test(name) ? 0x0800 : 0);

  // Nested names (`folder/file.dita`) get explicit directory entries so every
  // unzip tool creates the folder even when it is empty.
  const directories: string[] = [];
  for (const file of files) {
    const parts = file.name.split('/');
    parts.pop();
    let prefix = '';
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const directory = `${prefix}/`;
      if (!directories.includes(directory)) directories.push(directory);
    }
  }
  const archiveEntries = [
    ...directories.sort().map((name) => ({ name, data: Buffer.alloc(0) })),
    ...files,
  ];

  for (const file of archiveEntries) {
    if (!isSafeZipPath(file.name)) throw new ZipError(`unsafe entry name: ${file.name}`);
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const deflated = zlib.deflateRawSync(file.data);
    const flags = generalPurposeFlags(file.name);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(flags, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + deflated.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(archiveEntries.length, 8);
  eocd.writeUInt16LE(archiveEntries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, eocd]);
}
