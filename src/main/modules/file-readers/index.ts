import type { FileReader, ReadResult } from './base.reader';
import { WordReader } from './word.reader';
import { PdfReader } from './pdf.reader';
import { TextReader } from './text.reader';
import { CodeReader } from './code.reader';
import { EmailReader } from './email.reader';

export type { FileReader, ReadResult } from './base.reader';

const readers: FileReader[] = [
  new WordReader(),
  new PdfReader(),
  new EmailReader(),
  new TextReader(),
  new CodeReader(),
];

export function createReader(filePath: string): FileReader {
  const reader = readers.find((r) => r.canRead(filePath));
  if (!reader) throw new Error(`No reader available for file: ${filePath}`);
  return reader;
}

export function canRead(filePath: string): boolean {
  return readers.some((r) => r.canRead(filePath));
}
