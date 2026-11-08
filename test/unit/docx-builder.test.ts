import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildDocx } from '../../src/main/modules/document-builder/docx.builder';
import { listZipEntries } from '../../src/main/modules/glossary/embedding/zip';
import type { DocumentDraft } from '../../src/shared/types/document.types';

const draft = (content: string, title = 'ESP32 PWM Technical Document'): DocumentDraft => ({
  id: 'draft-1',
  title,
  content,
  createdAt: '2026-11-08T00:00:00.000Z',
  updatedAt: '2026-11-08T00:00:00.000Z',
});

/** Read one entry without the zip-slip guard (docx entries live in `word/`). */
function readEntry(buffer: Buffer, name: string): string {
  const entry = listZipEntries(buffer).find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`missing entry: ${name}`);
  const local = entry.localHeaderOffset;
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  return (entry.method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf-8');
}

describe('buildDocx', () => {
  it('never emits an invalid numeric id for ordered lists', async () => {
    const buffer = await buildDocx(draft('1. First step\n2. Second step\n\n3. Another list'));
    const documentXml = readEntry(buffer, 'word/document.xml');
    const numberingXml = readEntry(buffer, 'word/numbering.xml');

    const numIds = [...documentXml.matchAll(/<w:numId w:val="([^"]+)"/g)].map((match) => match[1]);
    expect(numIds.length).toBeGreaterThan(0);
    for (const id of numIds) expect(id).toMatch(/^\d+$/);
    expect(documentXml).not.toContain('{default-numbering');
    expect(numberingXml).toContain('<w:numFmt w:val="decimal"/>');
  });

  it('converts inline Markdown instead of showing the markers', async () => {
    const buffer = await buildDocx(
      draft('A **bold** word, an *italic* word and `code` plus [site](https://example.com).')
    );
    const documentXml = readEntry(buffer, 'word/document.xml');

    expect(documentXml).toContain('<w:b/>');
    expect(documentXml).toContain('<w:i/>');
    expect(documentXml).toContain('<w:hyperlink');
    expect(documentXml).not.toContain('**bold**');
    expect(documentXml).not.toContain('`code`');
    expect(readEntry(buffer, 'word/_rels/document.xml.rels')).toContain('https://example.com');
  });

  it('renders code blocks with a monospace font', async () => {
    const buffer = await buildDocx(draft('```c\nledcSetup(0, 5000, 8);\n```'));
    const documentXml = readEntry(buffer, 'word/document.xml');
    expect(documentXml).toContain('Consolas');
    expect(documentXml).toContain('ledcSetup(0, 5000, 8);');
    expect(documentXml).not.toContain('```');
  });

  it('strips characters that are illegal in XML', async () => {
    const buffer = await buildDocx(draft('before\u0001after'));
    const documentXml = readEntry(buffer, 'word/document.xml');
    expect(documentXml).toContain('beforeafter');
    expect(documentXml).not.toContain('\u0001');
  });

  it('writes the header text shared by split files', async () => {
    const buffer = await buildDocx(draft('body'), { headerText: 'Shared Header' });
    const headerXml = readEntry(buffer, 'word/header1.xml');
    expect(headerXml).toContain('Shared Header');
  });

  it('does not repeat the document title from the Markdown body', async () => {
    const buffer = await buildDocx(draft('# ESP32 PWM Technical Document\n\nBody text.'));
    const documentXml = readEntry(buffer, 'word/document.xml');
    const occurrences = documentXml.split('ESP32 PWM Technical Document').length - 1;
    expect(occurrences).toBe(1);
  });
});
