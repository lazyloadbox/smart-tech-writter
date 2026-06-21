import mammoth from 'mammoth';
import type { FileReader, ReadResult } from './base.reader';
import { chunkText } from './base.reader';

export class WordReader implements FileReader {
  canRead(filePath: string): boolean {
    return /\.docx$/i.test(filePath);
  }

  async read(filePath: string): Promise<ReadResult> {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    return {
      text,
      metadata: { wordCount: text.split(/\s+/).length },
      chunks: chunkText(text),
    };
  }
}
