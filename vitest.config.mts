import { defineConfig } from 'vitest/config';

/**
 * Unit tests for pure modules (glossary engine, section splitter, document
 * builders …). Integration tests that need SQLite/Electron still run through
 * a separate Electron script, because better-sqlite3 only loads inside
 * Electron.
 *
 * Run with `npm run test:unit` (CI) or `npm run test:unit:watch` (local).
 */
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
});
