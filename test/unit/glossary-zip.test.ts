import { describe, expect, it } from 'vitest';
import {
  ZipError,
  createZip,
  crc32,
  isSafeEntryName,
  isSafeZipPath,
  listZipEntries,
  readZipEntry,
} from '../../src/main/modules/glossary/embedding/zip';

describe('safe entry names', () => {
  it('accepts plain file names', () => {
    expect(isSafeEntryName('model_quantized.onnx')).toBe(true);
    expect(isSafeEntryName('tokenizer.json')).toBe(true);
  });

  it('rejects zip-slip and absolute paths', () => {
    expect(isSafeEntryName('../escape.txt')).toBe(false);
    expect(isSafeEntryName('dir/file.txt')).toBe(false);
    expect(isSafeEntryName('dir\\file.txt')).toBe(false);
    expect(isSafeEntryName('C:/windows/system32/x.dll')).toBe(false);
    expect(isSafeEntryName('/etc/passwd')).toBe(false);
    expect(isSafeEntryName('..')).toBe(false);
    expect(isSafeEntryName('')).toBe(false);
  });

  it('allows nested paths only when every segment is safe', () => {
    expect(isSafeZipPath('ESP32 PWM_sections/01_Intro.dita')).toBe(true);
    expect(isSafeZipPath('ESP32 PWM_sections/')).toBe(true);
    expect(isSafeZipPath('../escape/file.dita')).toBe(false);
    expect(isSafeZipPath('dir/../file.dita')).toBe(false);
    expect(isSafeZipPath('/abs/file.dita')).toBe(false);
    expect(isSafeZipPath('C:/abs/file.dita')).toBe(false);
    expect(isSafeZipPath('dir\\file.dita')).toBe(false);
    expect(isSafeZipPath('dir//file.dita')).toBe(false);
  });
});

describe('zip round-trip', () => {
  it('writes deflated entries and reads them back', () => {
    const files = [
      { name: 'manifest.json', data: Buffer.from(JSON.stringify({ format: 1, modelId: 'x' })) },
      { name: 'tokenizer.json', data: Buffer.from('a'.repeat(5000)) },
    ];
    const zip = createZip(files);
    const entries = listZipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual(['manifest.json', 'tokenizer.json']);

    const manifest = readZipEntry(zip, entries[0]);
    expect(JSON.parse(manifest.toString('utf-8'))).toEqual({ format: 1, modelId: 'x' });
    expect(readZipEntry(zip, entries[1]).toString('utf-8')).toBe('a'.repeat(5000));
  });

  it('records the CRC-32 of each entry', () => {
    const data = Buffer.from('hello world');
    const zip = createZip([{ name: 'file.txt', data }]);
    const [entry] = listZipEntries(zip);
    expect(entry.crc32).toBe(crc32(data));
  });

  it('rejects unsafe names on write', () => {
    expect(() => createZip([{ name: '../evil', data: Buffer.from('x') }])).toThrow(ZipError);
  });

  it('supports nested paths with directory entries', () => {
    const zip = createZip([
      { name: 'root.dita', data: Buffer.from('root') },
      { name: 'Doc_sections/01_Intro.dita', data: Buffer.from('one') },
      { name: 'Doc_sections/02_Body.dita', data: Buffer.from('two') },
    ]);
    const names = listZipEntries(zip).map((entry) => entry.name);
    expect(names).toContain('Doc_sections/01_Intro.dita');
    expect(names).toContain('Doc_sections/02_Body.dita');
    // Directories are stored as their own entries and filtered from the listing.
    expect(names).not.toContain('Doc_sections/');
  });

  it('rejects non-zip input', () => {
    expect(() => listZipEntries(Buffer.from('definitely not a zip archive'))).toThrow(ZipError);
  });
});
