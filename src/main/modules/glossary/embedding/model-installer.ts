// Model installation: staging → verify → trial inference → atomic enable
// (design §2.5.6.6 / P2b-1).
//
// All three install channels (online download / offline package / folder) share
// this pipeline, so a partially written model can never become "ready":
//
//   source ──▶ models/.staging/<id>-<ts> ──▶ verify (size + SHA-256)
//          ──▶ trial inference ──▶ atomic rename to models/<id>
//
// Custom models (not in the built-in allow-list) are allowed but must be
// confirmed explicitly; their hashes are recorded from the local copy.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import log from 'electron-log';
import { app } from 'electron';
import { ZipError, createZip, isSafeEntryName, listZipEntries, readZipEntry } from './zip';
import { getModelSpec, MODEL_REQUIRED_FILES, MODEL_WEIGHT_FILES } from './model-manifest';
import { createLocalEmbedder, MODEL_FILE_CANDIDATES } from './local-embedder';
import { ModelError } from './backends/types';
import type { GlossaryRuntimeBackend } from '../../../../shared/types/glossary.types';

/** Hard caps that make a zip-bomb / abuse attempt harmless. */
const MAX_ZIP_ENTRIES = 12;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB
/** Staging folders older than this are removed on start-up. */
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface InstalledFileInfo {
  size: number;
  sha256: string;
}

/** `installed.json` contents (design §2.5.6.6). */
export interface InstalledModelInfo {
  modelId: string;
  revision: string;
  dims: number;
  custom: boolean;
  source: 'download' | 'package' | 'folder';
  installedAt: string;
  verifiedAt?: string;
  modelFile: string;
  files: Record<string, InstalledFileInfo>;
}

export interface InstallOptions {
  /** Explicit model id override; otherwise derived from the manifest / folder. */
  modelId?: string;
  /** Confirm installation of a model that is not in the built-in allow-list. */
  confirmCustom?: boolean;
  /** Runtime backend preference used for the trial inference. */
  runtimeBackend?: GlossaryRuntimeBackend;
  preferWasm?: boolean;
}

export type InstallResult =
  | { status: 'installed'; info: InstalledModelInfo; backend: 'native' | 'wasm'; nativeError?: string }
  | { status: 'needs_confirm'; modelId: string; files: string[]; reason: string };

/** Root directory holding all installed models. */
export function modelsRoot(): string {
  return path.join(app.getPath('userData'), 'models');
}

export function modelDirectory(modelId: string): string {
  return path.join(modelsRoot(), modelId);
}

function stagingRoot(): string {
  return path.join(modelsRoot(), '.staging');
}

export function installedJsonPath(modelDir: string): string {
  return path.join(modelDir, 'installed.json');
}

/** Read `installed.json`, or `null` when missing/invalid. */
export function readInstalledInfo(modelDir: string): InstalledModelInfo | null {
  const file = installedJsonPath(modelDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as InstalledModelInfo;
  } catch (err) {
    log.warn('[Glossary][Model] installed.json is unreadable:', err);
    return null;
  }
}

function sha256File(file: string): { sha256: string; size: number } {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(file);
  hash.update(buffer);
  return { sha256: hash.digest('hex'), size: buffer.length };
}

/** Fast integrity check: every expected file exists with the recorded size. */
export function quickCheckInstalled(modelDir: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const info = readInstalledInfo(modelDir);
  if (!info) return { ok: false, problems: ['installed.json is missing or invalid'] };

  for (const [name, expected] of Object.entries(info.files)) {
    const full = path.join(modelDir, name);
    if (!fs.existsSync(full)) {
      problems.push(`${name} is missing`);
      continue;
    }
    const size = fs.statSync(full).size;
    if (size !== expected.size) problems.push(`${name}: size ${size} != ${expected.size}`);
  }
  return { ok: problems.length === 0, problems };
}

/** Full SHA-256 verification (install time and "verify again"). */
export function verifyInstalledHashes(modelDir: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const info = readInstalledInfo(modelDir);
  if (!info) return { ok: false, problems: ['installed.json is missing or invalid'] };

  for (const [name, expected] of Object.entries(info.files)) {
    const full = path.join(modelDir, name);
    if (!fs.existsSync(full)) {
      problems.push(`${name} is missing`);
      continue;
    }
    const actual = sha256File(full);
    if (actual.size !== expected.size) problems.push(`${name}: size ${actual.size} != ${expected.size}`);
    if (expected.sha256 && actual.sha256 !== expected.sha256) problems.push(`${name}: SHA-256 mismatch`);
  }
  return { ok: problems.length === 0, problems };
}

/** Locate the weight file inside a directory. */
function findWeightFile(dir: string): string | null {
  for (const candidate of MODEL_FILE_CANDIDATES) {
    if (fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  return null;
}

/** Validate that a directory looks like an embedding model. */
function inspectModelDir(dir: string): { modelFile: string; missing: string[] } {
  const missing: string[] = [];
  for (const file of MODEL_REQUIRED_FILES) {
    if (!fs.existsSync(path.join(dir, file))) missing.push(file);
  }
  const modelFile = findWeightFile(dir);
  if (!modelFile) missing.push(MODEL_WEIGHT_FILES.join('/'));
  return { modelFile: modelFile ?? '', missing };
}

/**
 * Verify a staged directory against the built-in allow-list.
 * Returns the digest map to record in `installed.json`.
 */
function verifyAgainstManifest(
  staged: string,
  modelId: string
): { files: Record<string, InstalledFileInfo>; custom: boolean } {
  const spec = getModelSpec(modelId);
  const names = new Set<string>([...MODEL_REQUIRED_FILES]);
  const modelFile = findWeightFile(staged);
  if (modelFile) names.add(modelFile);
  if (spec) for (const name of Object.keys(spec.files)) names.add(name);

  const files: Record<string, InstalledFileInfo> = {};
  const problems: string[] = [];
  for (const name of names) {
    const full = path.join(staged, name);
    if (!fs.existsSync(full)) {
      problems.push(`${name} is missing`);
      continue;
    }
    const actual = sha256File(full);
    files[name] = actual;
    const expected = spec?.files[name];
    if (expected) {
      if (expected.size !== actual.size) problems.push(`${name}: size ${actual.size} != ${expected.size}`);
      if (expected.sha256 !== actual.sha256) problems.push(`${name}: SHA-256 mismatch`);
    }
  }

  if (problems.length > 0) {
    throw new ModelError('checksum', `model files failed verification: ${problems.join('; ')}`);
  }
  return { files, custom: !spec };
}

/** Run one inference on a staged model so a corrupt graph never becomes ready. */
async function trialInference(
  modelDir: string,
  options: InstallOptions
): Promise<{ backend: 'native' | 'wasm'; nativeError?: string }> {
  const embedder = await createLocalEmbedder({
    modelDir,
    runtimeBackend: options.runtimeBackend ?? 'auto',
    preferWasm: options.preferWasm,
  });
  try {
    await embedder.selfTest();
    return { backend: embedder.backend, nativeError: embedder.nativeError };
  } finally {
    await embedder.dispose();
  }
}

/** Atomically move a verified staging directory into place. */
function promote(staged: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let backup: string | null = null;
  if (fs.existsSync(target)) {
    backup = `${target}.old-${Date.now()}`;
    fs.renameSync(target, backup);
  }
  try {
    fs.renameSync(staged, target);
  } catch (err) {
    if (backup) {
      try {
        fs.renameSync(backup, target);
      } catch {
        /* best effort restore */
      }
    }
    throw err;
  }
  if (backup) {
    try {
      fs.rmSync(backup, { recursive: true, force: true });
    } catch {
      /* leftover is harmless */
    }
  }
}

function createStagingDir(modelId: string): string {
  const dir = path.join(stagingRoot(), `${modelId}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeQuietly(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Install from a plain directory (channel ③).
 * `needs_confirm` is returned for models outside the built-in allow-list.
 */
export async function installFromFolder(sourceDir: string, options: InstallOptions = {}): Promise<InstallResult> {
  const modelId = options.modelId ?? path.basename(path.resolve(sourceDir));
  const { modelFile, missing } = inspectModelDir(sourceDir);
  if (missing.length > 0) {
    throw new ModelError('incompatible', `the folder is not a valid model: missing ${missing.join(', ')}`);
  }

  const spec = getModelSpec(modelId);
  if (!spec && !options.confirmCustom) {
    return {
      status: 'needs_confirm',
      modelId,
      files: [...MODEL_REQUIRED_FILES, modelFile],
      reason: `"${modelId}" is not a built-in model. Thresholds will use defaults and should be re-calibrated.`,
    };
  }

  const staged = createStagingDir(modelId);
  try {
    for (const name of new Set([...MODEL_REQUIRED_FILES, modelFile])) {
      fs.copyFileSync(path.join(sourceDir, name), path.join(staged, name));
    }
    return await finalizeStagedDirectory(staged, modelId, 'folder', options);
  } catch (err) {
    removeQuietly(staged);
    throw err;
  }
}

/**
 * Shared tail of every install channel: verify → trial inference → atomic
 * enable. `staged` is removed on failure so no half-installed model survives.
 */
export async function finalizeStagedDirectory(
  staged: string,
  modelId: string,
  source: 'download' | 'package' | 'folder',
  options: InstallOptions = {}
): Promise<InstallResult> {
  const { modelFile, missing } = inspectModelDir(staged);
  if (missing.length > 0) {
    throw new ModelError('incompatible', `model is incomplete: missing ${missing.join(', ')}`);
  }
  const verified = verifyAgainstManifest(staged, modelId);
  const backend = await trialInference(staged, options);
  const spec = getModelSpec(modelId);

  const info: InstalledModelInfo = {
    modelId,
    revision: spec?.revision ?? 'custom',
    dims: spec?.dims ?? readDims(staged),
    custom: verified.custom,
    source,
    installedAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    modelFile,
    files: verified.files,
  };
  writeInstalledJson(staged, info);
  promote(staged, modelDirectory(modelId));
  log.info('[Glossary][Model] installed', { modelId, source, backend: backend.backend });
  return { status: 'installed', info, ...backend };
}

/** Install from an offline package (`stw-embedding-<id>-<rev>.zip`). */
export async function installFromPackage(zipBuffer: Buffer, options: InstallOptions = {}): Promise<InstallResult> {
  let entries;
  try {
    entries = listZipEntries(zipBuffer);
  } catch (err) {
    throw new ModelError('unzip', err instanceof ZipError ? err.message : String(err));
  }
  if (entries.length === 0) throw new ModelError('unzip', 'the package is empty');
  if (entries.length > MAX_ZIP_ENTRIES) throw new ModelError('unzip', 'too many files in the package');

  const totalBytes = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new ModelError('unzip', 'the package is too large');
  for (const entry of entries) {
    if (!isSafeEntryName(entry.name)) {
      throw new ModelError('unzip', `the package contains an unsafe path: ${entry.name}`);
    }
  }

  // The package manifest declares the model id and the files it carries.
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');
  let packageManifest: { modelId?: string; revision?: string; files?: Record<string, { sha256?: string; size?: number }> } = {};
  if (manifestEntry) {
    try {
      packageManifest = JSON.parse(readZipEntry(zipBuffer, manifestEntry).toString('utf-8')) as typeof packageManifest;
    } catch (err) {
      throw new ModelError('unzip', `package manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const allowed = new Set<string>(['manifest.json', ...MODEL_REQUIRED_FILES, ...MODEL_WEIGHT_FILES]);
  for (const name of Object.keys(packageManifest.files ?? {})) allowed.add(name);
  for (const entry of entries) {
    if (!allowed.has(entry.name)) {
      throw new ModelError('unzip', `the package contains an unexpected file: ${entry.name}`);
    }
  }

  const modelId = options.modelId ?? packageManifest.modelId ?? 'custom-embedding';
  const spec = getModelSpec(modelId);
  if (!spec && !options.confirmCustom) {
    return {
      status: 'needs_confirm',
      modelId,
      files: entries.map((entry) => entry.name),
      reason: `"${modelId}" is not a built-in model. Thresholds will use defaults and should be re-calibrated.`,
    };
  }

  const staged = createStagingDir(modelId);
  try {
    for (const entry of entries) {
      if (entry.name === 'manifest.json') continue;
      fs.writeFileSync(path.join(staged, entry.name), readZipEntry(zipBuffer, entry));
    }

    // Integrity first: compare against the manifest shipped inside the package.
    const problems: string[] = [];
    for (const [name, expected] of Object.entries(packageManifest.files ?? {})) {
      const full = path.join(staged, name);
      if (!fs.existsSync(full)) {
        problems.push(`${name} is missing`);
        continue;
      }
      const actual = sha256File(full);
      if (expected?.size !== undefined && expected.size !== actual.size) {
        problems.push(`${name}: size mismatch`);
      }
      if (expected?.sha256 && expected.sha256 !== actual.sha256) {
        problems.push(`${name}: SHA-256 mismatch`);
      }
    }
    if (problems.length > 0) throw new ModelError('checksum', `package verification failed: ${problems.join('; ')}`);

    const { modelFile, missing } = inspectModelDir(staged);
    if (missing.length > 0) throw new ModelError('incompatible', `package is incomplete: missing ${missing.join(', ')}`);

    // The package manifest is authoritative for the model id it carries.
    const result = await finalizeStagedDirectory(staged, modelId, 'package', options);
    if (result.status === 'installed' && packageManifest.revision) {
      result.info.revision = packageManifest.revision;
      writeInstalledJson(modelDirectory(modelId), result.info);
    }
    void modelFile;
    return result;
  } catch (err) {
    removeQuietly(staged);
    throw err;
  }
}

/** Export an installed model as an offline package (design §2.5.6.6). */
export function exportPackage(modelId: string, destZipPath: string): { path: string; files: number } {
  const dir = modelDirectory(modelId);
  const info = readInstalledInfo(dir);
  if (!info) throw new ModelError('incompatible', `model "${modelId}" is not installed`);

  const files: { name: string; data: Buffer }[] = [];
  const manifestFiles: Record<string, { size: number; sha256: string }> = {};
  for (const [name, expected] of Object.entries(info.files)) {
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) throw new ModelError('checksum', `${name} is missing from the installation`);
    const data = fs.readFileSync(full);
    files.push({ name, data });
    manifestFiles[name] = { size: expected.size, sha256: expected.sha256 };
  }

  const spec = getModelSpec(modelId);
  const manifest = {
    format: 1,
    modelId,
    revision: info.revision,
    dims: info.dims,
    maxTokens: spec?.maxTokens ?? 64,
    prefix: spec?.prefix ?? { query: 'query: ', passage: 'passage: ' },
    files: manifestFiles,
  };
  files.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') });

  const zip = createZip(files);
  fs.mkdirSync(path.dirname(destZipPath), { recursive: true });
  fs.writeFileSync(destZipPath, zip);
  log.info('[Glossary][Model] exported offline package', { modelId, path: destZipPath, files: files.length });
  return { path: destZipPath, files: files.length };
}

/** Delete an installed model (optionally keeping nothing behind). */
export function removeModel(modelId: string): void {
  const dir = modelDirectory(modelId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  log.info('[Glossary][Model] removed', { modelId });
}

/** Remove stale staging directories left behind by a crashed install. */
export function cleanupStaging(maxAgeMs = STAGING_MAX_AGE_MS): number {
  const root = stagingRoot();
  if (!fs.existsSync(root)) return 0;
  let removed = 0;
  const now = Date.now();
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(full, { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* ignore */
    }
  }
  if (removed > 0) log.info('[Glossary][Model] removed stale staging folders', { removed });
  return removed;
}

function writeInstalledJson(dir: string, info: InstalledModelInfo): void {
  fs.writeFileSync(installedJsonPath(dir), JSON.stringify(info, null, 2), 'utf8');
}

function readDims(dir: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8')) as {
      hidden_size?: number;
      d_model?: number;
    };
    return parsed.hidden_size ?? parsed.d_model ?? 384;
  } catch {
    return 384;
  }
}
