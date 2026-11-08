import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';
import { DEFAULT_MAPPINGS } from '../localization/default-mappings';
import { classifyEntryKind, normalizeEn } from '../glossary/normalize';

let db: Database.Database | null = null;

/** Settings key recording that the built-in glossary was seeded once. */
export const GLOSSARY_DEFAULTS_SEEDED_KEY = 'glossary.defaultsSeeded';
/** Settings key holding the glossary index version (bumped on every write). */
export const GLOSSARY_VERSION_KEY = 'glossary.version';

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
 *
 * Runs only once per installation: the `glossary.defaultsSeeded` settings flag
 * prevents the defaults from reappearing after a `replace` import cleared the
 * table (design §2.3.2).
 */
function seedDefaultMappings(database: Database.Database): void {
  const seeded = database
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(GLOSSARY_DEFAULTS_SEEDED_KEY) as { value: string } | undefined;
  if (seeded) return;

  const insert = database.prepare(
    `INSERT OR IGNORE INTO translation_mappings
       (id, seq_no, en, zh_cn, zh_tw, en_key, kind, origin, batch_id, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, 'default', NULL, ?, ?)`
  );
  const now = new Date().toISOString();
  const insertAll = database.transaction((rows: typeof DEFAULT_MAPPINGS) => {
    for (const row of rows) {
      const enKey = normalizeEn(row.en);
      if (!enKey) continue;
      insert.run(
        `default-${row.en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        row.en,
        row.zhCN,
        row.zhTW,
        enKey,
        classifyEntryKind(row.en),
        now,
        now
      );
    }
  });
  insertAll(DEFAULT_MAPPINGS);

  database
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(GLOSSARY_DEFAULTS_SEEDED_KEY, '1');
  log.info(`Seeded ${DEFAULT_MAPPINGS.length} default translation mappings`);
}

/** Persist the old glossary rows before a destructive migration. */
function backupMappingsBeforeMigration(rows: Record<string, unknown>[]): string | null {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `glossary-migration-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf-8');
    return file;
  } catch (err) {
    log.error('[DB] Failed to back up glossary before migration:', err);
    return null;
  }
}

/**
 * Rebuild `translation_mappings` from the three-column schema
 * (`en / zh_cn / zh_tw`, all NOT NULL) to the glossary schema with a normalized
 * dedupe key, entry kind, origin and import metadata.
 *
 * Idempotent: returns immediately when `en_key` already exists.
 */
function migrateTranslationMappings(database: Database.Database): void {
  const cols = database.prepare('PRAGMA table_info(translation_mappings)').all() as {
    name: string;
  }[];
  if (cols.length === 0 || cols.some((c) => c.name === 'en_key')) return;

  const oldRows = database
    .prepare(
      `SELECT id, en, zh_cn, zh_tw, created_at, updated_at FROM translation_mappings`
    )
    .all() as {
    id: string;
    en: string;
    zh_cn: string;
    zh_tw: string;
    created_at: string;
    updated_at: string;
  }[];

  const backupPath = backupMappingsBeforeMigration(oldRows);
  log.warn('[DB] Rebuilding translation_mappings for the glossary schema', {
    rows: oldRows.length,
    backupPath,
  });

  // Deduplicate by normalized key, keeping the most recently updated row.
  const deduped = new Map<string, (typeof oldRows)[number] & { enKey: string }>();
  for (const row of oldRows) {
    const enKey = normalizeEn(row.en);
    if (!enKey) {
      log.warn('[DB] Dropping glossary row without a usable English term', { id: row.id });
      continue;
    }
    const prev = deduped.get(enKey);
    if (!prev || (row.updated_at ?? '') >= (prev.updated_at ?? '')) {
      deduped.set(enKey, { ...row, enKey });
    }
  }

  const rebuild = database.transaction(() => {
    database.exec(`
      CREATE TABLE translation_mappings_new (
        id          TEXT PRIMARY KEY,
        seq_no      INTEGER,
        en          TEXT NOT NULL,
        zh_cn       TEXT NOT NULL DEFAULT '',
        zh_tw       TEXT NOT NULL DEFAULT '',
        en_key      TEXT NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'term',
        origin      TEXT NOT NULL DEFAULT 'manual',
        batch_id    TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `);
    const insert = database.prepare(
      `INSERT INTO translation_mappings_new
         (id, seq_no, en, zh_cn, zh_tw, en_key, kind, origin, batch_id, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    );
    for (const row of deduped.values()) {
      insert.run(
        row.id,
        row.en,
        row.zh_cn ?? '',
        row.zh_tw ?? '',
        row.enKey,
        classifyEntryKind(row.en),
        row.id.startsWith('default-') ? 'default' : 'manual',
        row.created_at,
        row.updated_at
      );
    }
    database.exec(`
      DROP TABLE translation_mappings;
      ALTER TABLE translation_mappings_new RENAME TO translation_mappings;
    `);
  });

  try {
    rebuild();
    log.info('[DB] translation_mappings migration complete', { rows: deduped.size });
  } catch (err) {
    log.error('[DB] translation_mappings migration failed:', err);
    throw err;
  }
}

/** Create the glossary support tables introduced in P1 (all safe to be empty). */
function ensureGlossaryTables(database: Database.Database): void {
  database.exec(`
    -- One row per applied import (append/replace) for auditing and undo (P4-2).
    CREATE TABLE IF NOT EXISTS glossary_import_batches (
      id          TEXT PRIMARY KEY,
      file_name   TEXT NOT NULL,
      mode        TEXT NOT NULL,
      stats_json  TEXT NOT NULL,
      backup_path TEXT,
      created_at  TEXT NOT NULL
    );

    -- Alias expansion (abbreviations, slash variants) used by the L1/L2 layers.
    CREATE TABLE IF NOT EXISTS glossary_aliases (
      entry_id   TEXT NOT NULL,
      lang       TEXT NOT NULL,
      alias      TEXT NOT NULL,
      alias_key  TEXT NOT NULL,
      alias_kind TEXT NOT NULL DEFAULT 'variant',
      PRIMARY KEY (entry_id, lang, alias_key)
    );
    CREATE INDEX IF NOT EXISTS idx_glossary_aliases_key ON glossary_aliases(alias_key);

    -- Local ONNX embeddings (P2b). Stored as Float32 BLOB.
    CREATE TABLE IF NOT EXISTS glossary_embeddings (
      entry_id     TEXT NOT NULL,
      model        TEXT NOT NULL,
      dims         INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      vector       BLOB NOT NULL,
      PRIMARY KEY (entry_id, model, dims)
    );

    -- Query-side embedding cache (short candidate strings).
    CREATE TABLE IF NOT EXISTS embedding_cache (
      hash       TEXT NOT NULL,
      model      TEXT NOT NULL,
      dims       INTEGER NOT NULL,
      vector     BLOB NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (hash, model, dims)
    );
  `);

  // Unique dedupe key replaces the old `en COLLATE NOCASE` index.
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_mappings_en_key
      ON translation_mappings(en_key);
    CREATE INDEX IF NOT EXISTS idx_translation_mappings_zh_cn
      ON translation_mappings(zh_cn);
    CREATE INDEX IF NOT EXISTS idx_translation_mappings_kind
      ON translation_mappings(kind);
  `);

  // P4-6: optional "Do not use" wordings, stored as a JSON string array.
  ensureColumn(database, 'translation_mappings', 'do_not_use', "TEXT NOT NULL DEFAULT ''");
  // P4-2: per-batch snapshot (previous values of touched rows) + undo marker.
  ensureColumn(database, 'glossary_import_batches', 'snapshot_json', 'TEXT');
  ensureColumn(database, 'glossary_import_batches', 'undone_at', 'TEXT');
}

/** Add a column when it does not exist yet (SQLite has no ADD COLUMN IF NOT EXISTS). */
function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  ddl: string
): void {
  try {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.some((c) => c.name === column)) return;
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    log.info('[DB] Added column', { table, column });
  } catch (err) {
    log.warn('[DB] Failed to ensure column', { table, column, error: String(err) });
  }
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
    -- Chinese + Taiwan Traditional Chinese translations, plus import metadata.
    CREATE TABLE IF NOT EXISTS translation_mappings (
      id          TEXT PRIMARY KEY,
      seq_no      INTEGER,
      en          TEXT NOT NULL,
      zh_cn       TEXT NOT NULL DEFAULT '',
      zh_tw       TEXT NOT NULL DEFAULT '',
      do_not_use  TEXT NOT NULL DEFAULT '',
      en_key      TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'term',
      origin      TEXT NOT NULL DEFAULT 'manual',
      batch_id    TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);

  // Upgrade the pre-P1 three-column table (drops the old en unique index and
  // computes en_key / kind / origin for every existing row).
  migrateTranslationMappings(db);
  ensureGlossaryTables(db);

  // Initial glossary index version (bumped by every write).
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
    GLOSSARY_VERSION_KEY,
    '1'
  );

  // Seed the built-in glossary once (INSERT OR IGNORE — never overwrites data).
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
