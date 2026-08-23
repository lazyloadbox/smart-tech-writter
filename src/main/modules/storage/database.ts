import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';
import { DEFAULT_MAPPINGS } from '../localization/default-mappings';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'smart-tech-writer.db');
  log.info('Opening database at', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

/**
 * Seed the default translation mappings (glossary) into the database.
 * Uses INSERT OR IGNORE so existing user data is never overwritten.
 */
function seedDefaultMappings(database: Database.Database): void {
  const insert = database.prepare(
    `INSERT OR IGNORE INTO translation_mappings (id, en, zh_cn, zh_tw, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  const insertAll = database.transaction((rows: typeof DEFAULT_MAPPINGS) => {
    for (const row of rows) {
      insert.run(
        `default-${row.en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        row.en,
        row.zhCN,
        row.zhTW,
        now,
        now
      );
    }
  });
  insertAll(DEFAULT_MAPPINGS);
  log.info(`Seeded ${DEFAULT_MAPPINGS.length} default translation mappings`);
}

function runMigrations(db: Database.Database): void {
  // The translation_mappings table previously used a source/target pair schema
  // (source_lang/target_lang/source_text/target_text). The glossary is now a
  // three-column mapping (en / zh_cn / zh_tw). Drop the old schema if present.
  const tableInfo = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'translation_mappings'`)
    .get() as { name: string } | undefined;
  if (tableInfo) {
    const cols = db.prepare(`PRAGMA table_info(translation_mappings)`).all() as { name: string }[];
    if (cols.some((c) => c.name === 'source_lang')) {
      log.warn('[DB] Dropping legacy translation_mappings table (old pair schema)');
      db.exec('DROP TABLE translation_mappings');
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'IDLE',
      current_stage TEXT NOT NULL DEFAULT 'upload_parse',
      state_json   TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    -- Semantic RAG index: one row per embedded text chunk.
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path   TEXT NOT NULL,
      file_name   TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_file_path ON rag_chunks(file_path);

    -- Standalone localization runs: one row per translation run, mirroring
    -- the full service state (results + stage + status) so runs survive restarts.
    CREATE TABLE IF NOT EXISTS localization_runs (
      id              TEXT PRIMARY KEY,
      status          TEXT NOT NULL,
      stage           TEXT NOT NULL,
      target_language TEXT NOT NULL,
      state_json      TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    -- Translation mappings (glossary): one row = English term + Simplified
    -- Chinese + Taiwan Traditional Chinese translations. Used to guide the AI
    -- during localization (extracted per target language into the prompt).
    CREATE TABLE IF NOT EXISTS translation_mappings (
      id          TEXT PRIMARY KEY,
      en          TEXT NOT NULL,
      zh_cn       TEXT NOT NULL,
      zh_tw       TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_mappings_en
      ON translation_mappings(en COLLATE NOCASE);
  `);

  // Seed the built-in glossary (INSERT OR IGNORE — never overwrites user data).
  seedDefaultMappings(db);
}

export function getSetting(key: string): string | null {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string | number | boolean): void {
  const db = getDatabase();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    String(value)
  );
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
