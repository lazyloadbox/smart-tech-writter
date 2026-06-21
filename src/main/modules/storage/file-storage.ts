import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';

export function getProjectsDir(): string {
  const base = path.join(app.getPath('userData'), 'projects');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return base;
}

export function getProjectDir(projectId: string): string {
  const dir = path.join(getProjectsDir(), projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeProjectFile(
  projectId: string,
  fileName: string,
  content: string
): string {
  const dir = getProjectDir(projectId);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');
  log.info(`Wrote project file: ${filePath}`);
  return filePath;
}

export function readProjectFile(
  projectId: string,
  fileName: string
): string | null {
  const filePath = path.join(getProjectDir(projectId), fileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeProjectBinaryFile(
  projectId: string,
  fileName: string,
  content: Buffer
): string {
  const dir = getProjectDir(projectId);
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}
