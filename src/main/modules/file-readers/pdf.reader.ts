import fs from 'node:fs';
import type { FileReader, ReadResult } from './base.reader';
import { chunkText } from './base.reader';

type LegacyPdfParse = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

type PdfParseV2Ctor = new (options: { data: Uint8Array }) => {
  getText(): Promise<{ text: string; total: number }>;
  destroy?: () => Promise<void>;
};

function resolvePdfParseModule(): {
  legacy?: LegacyPdfParse;
  v2Ctor?: PdfParseV2Ctor;
} {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('pdf-parse') as unknown;

  if (typeof mod === 'function') {
    return { legacy: mod as LegacyPdfParse };
  }

  if (!mod || typeof mod !== 'object') {
    return {};
  }

  const maybeV2 = (mod as { PDFParse?: unknown }).PDFParse;
  if (typeof maybeV2 === 'function') {
    return { v2Ctor: maybeV2 as PdfParseV2Ctor };
  }

  const defaultExport = (mod as { default?: unknown }).default;
  if (typeof defaultExport === 'function') {
    return { legacy: defaultExport as LegacyPdfParse };
  }

  if (defaultExport && typeof defaultExport === 'object') {
    const nestedV2 = (defaultExport as { PDFParse?: unknown }).PDFParse;
    if (typeof nestedV2 === 'function') {
      return { v2Ctor: nestedV2 as PdfParseV2Ctor };
    }
  }

  return {};
}

export class PdfReader implements FileReader {
  canRead(filePath: string): boolean {
    return /\.pdf$/i.test(filePath);
  }

  async read(filePath: string): Promise<ReadResult> {
    const buffer = fs.readFileSync(filePath);

    const parser = resolvePdfParseModule();
    if (parser.legacy) {
      const data = await parser.legacy(buffer);
      const text = data.text;
      return {
        text,
        metadata: {
          pages: data.numpages,
          wordCount: text.split(/\s+/).filter(Boolean).length,
        },
        chunks: chunkText(text),
      };
    }

    if (parser.v2Ctor) {
      const v2 = new parser.v2Ctor({ data: new Uint8Array(buffer) });
      try {
        const data = await v2.getText();
        const text = data.text;
        return {
          text,
          metadata: {
            pages: data.total,
            wordCount: text.split(/\s+/).filter(Boolean).length,
          },
          chunks: chunkText(text),
        };
      } finally {
        if (typeof v2.destroy === 'function') {
          await v2.destroy();
        }
      }
    }

    throw new Error('Unable to load a compatible pdf-parse API. Please ensure pdf-parse v1 or v2 is installed correctly.');

  }
}
