#!/usr/bin/env node
/**
 * 版本自动升级脚本
 *
 * 用法:
 *   node scripts/bump-version.mjs patch   # 1.0.0 -> 1.0.1（修复）
 *   node scripts/bump-version.mjs minor   # 1.0.0 -> 1.1.0（新功能）
 *   node scripts/bump-version.mjs major   # 1.0.0 -> 2.0.0（大版本）
 *   node scripts/bump-version.mjs 1.2.3   # 指定版本号
 *
 * 输出: 新版本号（如 1.0.1），同时同步更新 package.json 与 package-lock.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

const arg = (process.argv[2] || 'patch').trim();
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
const isExplicitVersion = /^\d+\.\d+\.\d+$/.test(arg);

let next;
if (isExplicitVersion) {
  next = arg;
} else {
  const [major, minor, patch] = current.split('.').map(Number);
  if (arg === 'major') next = `${major + 1}.0.0`;
  else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
  else if (arg === 'patch') next = `${major}.${minor}.${patch + 1}`;
  else {
    console.error(`无效的版本参数: ${arg}（支持 patch / minor / major / x.y.z）`);
    process.exit(1);
  }
}

// 显式指定当前版本是幂等操作：这允许在版本已提前写入 package.json、
// 但尚未创建 Git tag 的情况下继续发布，同时也能修复 package-lock.json。
// bump 类型仍然必须产生新版本，避免误触发重复发布。
if (next === current && !isExplicitVersion) {
  console.error(`版本未变化: ${current}（如需重新构建请使用 build 工作流）`);
  process.exit(1);
}

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 同步 package-lock.json 的版本（根 version + packages[""].version）
try {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if ('version' in lock) lock.version = next;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = next;
  }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
} catch {
  // package-lock.json 不存在时忽略
}

console.log(next);
