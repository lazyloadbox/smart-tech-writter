import fs from 'node:fs';
import type { FileReader, ReadResult } from './base.reader';
import { chunkText } from './base.reader';

export class TextReader implements FileReader {
  canRead(filePath: string): boolean {
    return /\.(txt|md|markdown|csv|log)$/i.test(filePath);
  }

  async read(filePath: string): Promise<ReadResult> {
    const text = fs.readFileSync(filePath, 'utf-8');
    return {
      text,
      metadata: { wordCount: text.split(/\s+/).length },
      chunks: chunkText(text),
    };
  }
}
