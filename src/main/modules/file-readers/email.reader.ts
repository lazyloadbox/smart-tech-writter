import { simpleParser } from 'mailparser';
import fs from 'node:fs';
import type { FileReader, ReadResult } from './base.reader';
import { chunkText } from './base.reader';

export class EmailReader implements FileReader {
  canRead(filePath: string): boolean {
    return /\.eml$/i.test(filePath);
  }

  async read(filePath: string): Promise<ReadResult> {
    const raw = fs.readFileSync(filePath);
    const parsed = await simpleParser(raw);
    const text = [
      parsed.subject ? `Subject: ${parsed.subject}` : '',
      parsed.from?.text ? `From: ${parsed.from.text}` : '',
      parsed.date ? `Date: ${parsed.date.toISOString()}` : '',
      '',
      parsed.text ?? parsed.html ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      text,
      metadata: {
        title: parsed.subject,
        author: parsed.from?.text,
        created: parsed.date?.toISOString(),
        wordCount: text.split(/\s+/).length,
      },
      chunks: chunkText(text),
    };
  }
}
