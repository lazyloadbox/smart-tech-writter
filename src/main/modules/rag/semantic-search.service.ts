import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import type { AIProvider } from '../ai-providers/base.provider';
import type { SearchResult } from '../../../shared/types/document.types';
import { getDatabase } from '../storage/database';
import { createReader } from '../file-readers';
import { chunkText } from '../file-readers/base.reader';
import { LocalSearchService, type DocumentSearchService, type SearchOptions } from './local-search.service';

export interface AddDocumentResult {
  success: boolean;
  indexedChunks: number;
  error?: string;
}

/**
 * RAG service contract: semantic search over an indexed corpus plus
 * index-management operations. Implemented by SemanticSearchService.
 */
export interface RagService extends DocumentSearchService {
  readonly mode: 'semantic' | 'keyword';
  addDocument(filePath: string): Promise<AddDocumentResult>;
  removeDocument(filePath: string): Promise<void>;
  clearIndex(): Promise<void>;
  indexedCount(): number;
}

/**
 * SemanticSearchService — real RAG over the local corpus (fixes R1).
 *
 * - `addDocument()` reads a file with the existing file-readers, chunks the
 *   text, embeds every chunk via `provider.embed()` and persists
 *   (chunk, embedding) rows in the `rag_chunks` SQLite table.
 * - `search()` embeds the query and ranks chunks by cosine similarity,
 *   returning the best-matching chunk per file.
 * - Degrades gracefully to the keyword-based LocalSearchService when the
 *   index is empty or embedding is unavailable (e.g. no API key configured).
 */
export class SemanticSearchService implements RagService {
  readonly mode = 'semantic' as const;
  private fallback: LocalSearchService;

  constructor(
    private provider: AIProvider,
    private defaultDirectory = ''
  ) {
    this.fallback = new LocalSearchService(defaultDirectory);
  }

  async addDocument(filePath: string): Promise<AddDocumentResult> {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, indexedChunks: 0, error: `File not found: ${filePath}` };
      }

      const reader = createReader(filePath);
      const result = await reader.read(filePath);
      const chunks = (result.chunks.length > 0 ? result.chunks : chunkText(result.text))
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      const db = getDatabase();
      // Re-indexing a file replaces its previous chunks.
      db.prepare('DELETE FROM rag_chunks WHERE file_path = ?').run(filePath);

      let indexed = 0;
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.provider.embed(chunks[i]);
        if (!embedding || embedding.length === 0) continue;
        db.prepare(
          `INSERT INTO rag_chunks (file_path, file_name, chunk_index, content, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          filePath,
          path.basename(filePath),
          i,
          chunks[i],
          JSON.stringify(embedding),
          new Date().toISOString()
        );
        indexed++;
      }

      log.info('[RAG] addDocument indexed', { filePath, chunks: chunks.length, indexed });
      return { success: true, indexedChunks: indexed };
    } catch (err) {
      log.error('[RAG] addDocument failed', { filePath, error: String(err) });
      return { success: false, indexedChunks: 0, error: String(err) };
    }
  }

  async removeDocument(filePath: string): Promise<void> {
    getDatabase().prepare('DELETE FROM rag_chunks WHERE file_path = ?').run(filePath);
  }

  async clearIndex(): Promise<void> {
    getDatabase().prepare('DELETE FROM rag_chunks').run();
  }

  indexedCount(): number {
    const row = getDatabase().prepare('SELECT COUNT(*) AS count FROM rag_chunks').get() as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const rows = getDatabase()
      .prepare('SELECT file_path, file_name, content, embedding FROM rag_chunks')
      .all() as Array<{ file_path: string; file_name: string; content: string; embedding: string }>;

    if (rows.length === 0) {
      log.info('[RAG] index empty — falling back to keyword search');
      return this.fallback.search(query, options);
    }

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.provider.embed(query);
    } catch (err) {
      log.warn('[RAG] embed failed — falling back to keyword search', { error: String(err) });
      return this.fallback.search(query, options);
    }
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return this.fallback.search(query, options);
    }

    // Rank chunks by cosine similarity; keep the best-matching chunk per file.
    const bestPerFile = new Map<
      string,
      { filePath: string; fileName: string; score: number; snippet: string; matched: string[] }
    >();
    for (const row of rows) {
      let embedding: number[];
      try {
        embedding = JSON.parse(row.embedding);
      } catch {
        continue;
      }
      const sim = cosineSimilarity(queryEmbedding, embedding);
      if (!Number.isFinite(sim) || sim <= 0) continue;
      const existing = bestPerFile.get(row.file_path);
      if (!existing || sim > existing.score) {
        bestPerFile.set(row.file_path, {
          filePath: row.file_path,
          fileName: row.file_name,
          score: sim,
          snippet: makeSnippet(row.content),
          matched: extractMatchedKeywords(query, row.content),
        });
      }
    }

    return [...bestPerFile.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((r) => ({
        filePath: r.filePath,
        fileName: r.fileName,
        relevanceScore: Math.round(r.score * 100),
        snippet: r.snippet,
        matchedKeywords: r.matched,
      }));
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function makeSnippet(content: string, maxLen = 240): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed;
}

function extractMatchedKeywords(query: string, content: string): string[] {
  const lower = content.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 2 && lower.includes(k));
}