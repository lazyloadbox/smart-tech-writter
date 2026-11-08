import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { makeFiller, normalizeEn, visibilityOf } from '../../scripts/eval-glossary.mjs';

const ROOT = process.cwd();

describe('glossary eval — matching helpers', () => {
  const dutyCycle = { en: 'Duty cycle', zhCN: '占空比' };

  it('normalizes English per design §2.4.3', () => {
    expect(normalizeEn('  Duty   Cycle. ')).toBe('duty cycle');
    expect(normalizeEn('Zero\u200BWidth')).toBe('zerowidth');
  });

  it('detects exact matches on both language sides', () => {
    expect(visibilityOf('占空比设为 50%', dutyCycle)).toEqual({ exact: true, variant: false });
    expect(visibilityOf('Set the duty cycle to 50%', dutyCycle)).toEqual({ exact: true, variant: false });
  });

  it('detects L2-style variants', () => {
    const entry = { en: 'Duty cycle register', zhCN: '占空比寄存器' };
    expect(visibilityOf('The duty-cycle register is latched.', entry)).toEqual({ exact: false, variant: true });

    const frequency = { en: 'Frequency', zhCN: '频率' };
    expect(visibilityOf('different frequencies', frequency)).toEqual({ exact: false, variant: true });

    const wakeUp = { en: 'Wake-up', zhCN: '唤醒' };
    expect(visibilityOf('after wakeup', wakeUp)).toEqual({ exact: false, variant: true });
  });

  it('treats colloquial wording as concept-only', () => {
    const entry = { en: 'Duty cycle register', zhCN: '占空比寄存器' };
    expect(visibilityOf('调节比较寄存器', entry)).toEqual({ exact: false, variant: false });
  });

  it('generates deterministic, isolated synthetic entries', () => {
    const filler = makeFiller(3);
    expect(filler[0].en).toBe('Auxiliary actuator 0001');
    expect(filler[2].zhCN).toBe('合成术语 0003');
  });
});

describe('glossary eval — fixture check', () => {
  it('passes `--check` and reports the baseline', () => {
    const script = path.join(ROOT, 'scripts/eval-glossary.mjs');
    const result = spawnSync(process.execPath, [script, '--check'], { cwd: ROOT, encoding: 'utf-8' });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('fixture check: expected labels');
    expect(result.stdout).toContain('baseline injectable recall');
  }, 120_000);
});
