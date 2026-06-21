import fs from 'node:fs';
import path from 'node:path';
import type { SearchResult } from '../../../shared/types/document.types';

export interface SearchOptions {
  maxResults?: number;
  directory?: string;
}

export interface DocumentSearchService {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export class LocalSearchService implements DocumentSearchService {
  constructor(private defaultDirectory: string = '') {}

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const dir = options?.directory ?? this.defaultDirectory;
    if (!dir || !fs.existsSync(dir)) return [];

    const maxResults = options?.maxResults ?? 10;
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);

    const results: SearchResult[] = [];
    this.walkDirectory(dir, results, keywords, maxResults);

    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  private walkDirectory(
    dir: string,
    results: SearchResult[],
    keywords: string[],
    maxResults: number
  ): void {
    if (results.length >= maxResults * 2) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults * 2) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          this.walkDirectory(fullPath, results, keywords, maxResults);
        }
      } else if (this.isReadableFile(entry.name)) {
        const result = this.scoreFile(fullPath, entry.name, keywords);
        if (result) results.push(result);
      }
    }
  }

  private isReadableFile(name: string): boolean {
    return /\.(txt|md|docx|pdf|ts|js|py|json|xml|yaml|yml)$/i.test(name);
  }

  private scoreFile(
    filePath: string,
    fileName: string,
    keywords: string[]
  ): SearchResult | null {
    const nameLower = fileName.toLowerCase();
    let score = 0;
    const matched: string[] = [];

    for (const kw of keywords) {
      if (nameLower.includes(kw)) {
        score += 30;
        matched.push(kw);
      }
    }

    let snippet = '';
    if (/\.(txt|md|ts|js|py|json|xml|yaml|yml)$/i.test(fileName)) {
      try {
        const text = fs.readFileSync(filePath, 'utf-8').slice(0, 5000).toLowerCase();
        for (const kw of keywords) {
          if (text.includes(kw)) {
            score += 10;
            if (!matched.includes(kw)) matched.push(kw);
            const idx = text.indexOf(kw);
            snippet = text.slice(Math.max(0, idx - 50), idx + 150).replace(/\n/g, ' ');
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    if (score === 0) return null;
    return {
      filePath,
      fileName,
      relevanceScore: Math.min(score, 100),
      snippet: snippet || `File: ${fileName}`,
      matchedKeywords: matched,
    };
  }
}
