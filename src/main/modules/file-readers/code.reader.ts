import fs from 'node:fs';
import path from 'node:path';
import type { FileReader, ReadResult } from './base.reader';
import { chunkText } from './base.reader';

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h',
  '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.sh', '.bash',
  '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.cfg',
]);

export class CodeReader implements FileReader {
  canRead(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return CODE_EXTENSIONS.has(ext);
  }

  async read(filePath: string): Promise<ReadResult> {
    const ext = path.extname(filePath).toLowerCase();
    const raw = fs.readFileSync(filePath, 'utf-8');
    const text = `[File: ${path.basename(filePath)} | Language: ${ext.slice(1)}]\n\n${raw}`;
    return {
      text,
      metadata: { wordCount: raw.split(/\s+/).length },
      chunks: chunkText(text),
    };
  }
}
