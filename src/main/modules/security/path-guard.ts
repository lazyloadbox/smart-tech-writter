import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { getProjectsDir } from '../storage/file-storage';
import { getSetting } from '../storage/database';

/**
 * Path-scope guard for renderer-supplied file paths (fixes R4).
 *
 * `file:read` must only serve files the user explicitly picked (via the open
 * dialog / workflow start) or files inside trusted app-owned directories
 * (the projects output dir, the configured RAG search directory). This
 * prevents a compromised renderer from reading arbitrary system files.
 */

/** Text/code extensions that file:read is allowed to serve (preview only). */
const READABLE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.log',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h',
  '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.sh', '.bash',
  '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.cfg',
]);

/** Explicitly user-approved absolute file paths (dialog / workflow start). */
const allowedFiles = new Set<string>();

export function allowFileRead(filePath: string): void {
  if (typeof filePath === 'string' && filePath) {
    allowedFiles.add(normalize(filePath));
  }
}

export function allowFileReadMany(filePaths: string[]): void {
  for (const p of filePaths ?? []) allowFileRead(p);
}

function normalize(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(normalize(root), normalize(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function isFileReadAllowed(filePath: string): boolean {
  if (typeof filePath !== 'string' || !filePath) return false;
  const resolved = path.resolve(filePath);
  if (!path.isAbsolute(resolved)) return false;

  // 1. Explicitly approved files (user picked them via dialog / workflow start).
  if (allowedFiles.has(normalize(resolved))) return true;

  // 2. Files under the app's own projects directory (output documents).
  try {
    if (isWithin(getProjectsDir(), resolved)) return true;
  } catch {
    // ignore — projects dir unavailable
  }

  // 3. Files under the configured RAG search directory.
  const ragDir = getSetting('rag.searchDirectory');
  if (ragDir && fs.existsSync(ragDir)) {
    if (isWithin(ragDir, resolved)) return true;
  }

  return false;
}

export function assertFileReadAllowed(filePath: string): void {
  if (!isFileReadAllowed(filePath)) {
    log.warn('[Security] file:read blocked (path not allowed)', { filePath });
    throw new Error(`Access denied: reading "${filePath}" is not allowed.`);
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!READABLE_EXTENSIONS.has(ext)) {
    log.warn('[Security] file:read blocked (unsupported extension)', { filePath, ext });
    throw new Error(`Access denied: file type "${ext || '(none)'}" is not readable.`);
  }
}