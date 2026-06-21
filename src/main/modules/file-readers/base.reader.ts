export interface ReadResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    created?: string;
    pages?: number;
    wordCount?: number;
  };
  chunks: string[];
}

export interface FileReader {
  canRead(filePath: string): boolean;
  read(filePath: string): Promise<ReadResult>;
}

export function chunkText(text: string, chunkSize = 1000, overlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}
