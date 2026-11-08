import { describe, expect, it } from 'vitest';
import { buildImportPlan, MAX_PLAN_ISSUES, type ExistingGlossaryEntry } from '../../src/main/modules/glossary/deduper';
import type { ParsedGlossaryRow } from '../../src/shared/types/mapping.types';

/** Rows mirroring test/mock-case-02/glossary-sample.xlsx sheet "Terms". */
const FIXTURE_ROWS: ParsedGlossaryRow[] = [
  { row: 3, seq: 1, en: 'Duty cycle', zhCN: '占空比', zhTW: '' },
  { row: 4, seq: 2, en: 'PWM (Pulse Width Modulation)', zhCN: '脉宽调制', zhTW: '' },
  { row: 5, seq: 3, en: 'Duty cycle', zhCN: '占空比', zhTW: '' },
  { row: 6, seq: 4, en: 'Duty   Cycle', zhCN: '占空比', zhTW: '' },
  { row: 7, seq: 5, en: 'Duty cycle', zhCN: '占空比寄存器', zhTW: '' },
  { row: 9, seq: 6, en: 'Dead time', zhCN: '死区时间', zhTW: '' },
  { row: 10, seq: 7, en: 'Dead   time', zhCN: '死区时间', zhTW: '' },
  { row: 11, seq: 8, en: 'dead-time', zhCN: '死区时间', zhTW: '' },
  { row: 12, seq: 9, en: 'Reset', zhCN: '复位', zhTW: '' },
  { row: 13, seq: 10, en: 'Restore', zhCN: '恢复', zhTW: '' },
  { row: 14, seq: 11, en: 'Firmware update', zhCN: '固件升级', zhTW: '' },
  { row: 15, seq: 12, en: '', zhCN: '仅中文条目', zhTW: '' },
  { row: 16, seq: 13, en: 'ESP32 PWM controller', zhCN: '', zhTW: '' },
  { row: 17, seq: 14, en: 'Zero\u200BWidth timer', zhCN: '零宽字符定时器', zhTW: '' },
  { row: 18, seq: 15, en: 'LEDC', zhCN: '外设\u00A0时钟', zhTW: '' },
  { row: 19, seq: 16, en: 'Duty cycle.', zhCN: '占空比', zhTW: '' },
];

const EMPTY_PLAN_INPUT = {
  rows: FIXTURE_ROWS,
  existing: [] as ExistingGlossaryEntry[],
  existingTotal: 0,
  mode: 'append' as const,
  strategy: 'overwrite' as const,
  keepDefaults: false,
};

const DUTY_ENTRY: ExistingGlossaryEntry = {
  id: 'e-duty',
  enKey: 'duty cycle',
  en: 'Duty cycle',
  zhCN: '占空比',
  zhTW: '佔空比',
  origin: 'manual',
};

describe('buildImportPlan — fixture workbook', () => {
  it('reproduces the manifest classification (10 new, 4 dup, 1 conflict, 1 invalid)', () => {
    const { plan } = buildImportPlan(EMPTY_PLAN_INPUT);
    const counts = plan.issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.kind] = (acc[issue.kind] ?? 0) + 1;
      return acc;
    }, {});

    expect(plan.totalRows).toBe(16);
    expect(plan.toInsert).toBe(10);
    expect(plan.toUpdate).toBe(0);
    expect(plan.toDelete).toBe(0);
    expect(plan.skipped).toBe(5);
    expect(counts.dupInFile).toBe(4);
    expect(counts.conflictInFile).toBe(1);
    expect(counts.invalid).toBe(1);
  });

  it('lets the later in-file conflict win when overwriting', () => {
    const { operations } = buildImportPlan(EMPTY_PLAN_INPUT);
    const duty = operations.inserts.find((i) => i.enKey === 'duty cycle');
    expect(duty?.zhCN).toBe('占空比寄存器');
  });

  it('keeps the first occurrence with keepExisting', () => {
    const { plan, operations } = buildImportPlan({ ...EMPTY_PLAN_INPUT, strategy: 'keepExisting' });
    const duty = operations.inserts.find((i) => i.enKey === 'duty cycle');
    expect(duty?.zhCN).toBe('占空比');
    expect(plan.skipped).toBe(6);
  });

  it('normalizes zero-width, NBSP and trailing punctuation into single entries', () => {
    const { operations } = buildImportPlan(EMPTY_PLAN_INPUT);
    const keys = operations.inserts.map((i) => i.enKey);
    expect(keys).toContain('zerowidth timer');
    expect(keys.filter((k) => k === 'duty cycle')).toHaveLength(1);
    expect(operations.inserts.find((i) => i.enKey === 'ledc')?.zhCN).toBe('外设 时钟');
  });

  it('classifies short entries as terms', () => {
    const { operations } = buildImportPlan(EMPTY_PLAN_INPUT);
    expect(operations.inserts.every((i) => i.kind === 'term')).toBe(true);
  });
});

describe('buildImportPlan — database conflicts', () => {
  it('skips entries that are already identical', () => {
    const rows: ParsedGlossaryRow[] = [
      { row: 2, en: 'Duty cycle', zhCN: '占空比', zhTW: '' },
      { row: 3, en: 'Brand new', zhCN: '全新', zhTW: '' },
    ];
    const { plan } = buildImportPlan({
      ...EMPTY_PLAN_INPUT,
      rows,
      existing: [DUTY_ENTRY],
      existingTotal: 1,
    });
    expect(plan.toInsert).toBe(1);
    expect(plan.skipped).toBe(1);
    expect(plan.issues[0].kind).toBe('sameAsDb');
  });

  it('updates the existing row on overwrite and preserves its zh-TW', () => {
    const rows: ParsedGlossaryRow[] = [
      { row: 2, en: 'Duty cycle', zhCN: '占空比寄存器', zhTW: '' },
    ];
    const { plan, operations } = buildImportPlan({
      ...EMPTY_PLAN_INPUT,
      rows,
      existing: [DUTY_ENTRY],
      existingTotal: 1,
    });
    expect(plan.toUpdate).toBe(1);
    expect(plan.toInsert).toBe(0);
    expect(operations.updates[0]).toMatchObject({
      id: 'e-duty',
      zhCN: '占空比寄存器',
      zhTW: '佔空比',
    });
  });

  it('keeps the stored row with keepExisting', () => {
    const rows: ParsedGlossaryRow[] = [
      { row: 2, en: 'Duty cycle', zhCN: '占空比寄存器', zhTW: '' },
    ];
    const { plan, operations } = buildImportPlan({
      ...EMPTY_PLAN_INPUT,
      rows,
      existing: [DUTY_ENTRY],
      existingTotal: 1,
      strategy: 'keepExisting',
    });
    expect(plan.toUpdate).toBe(0);
    expect(operations.updates).toHaveLength(0);
    expect(plan.issues[0]).toMatchObject({ kind: 'conflictWithDb', resolution: 'kept' });
  });

  it('reports every row a replace import will delete', () => {
    const defaults: ExistingGlossaryEntry = { ...DUTY_ENTRY, id: 'default-x', origin: 'default' };
    const plain = buildImportPlan({
      ...EMPTY_PLAN_INPUT,
      rows: [{ row: 2, en: 'Fresh', zhCN: '新', zhTW: '' }],
      existingTotal: 3,
      mode: 'replace',
    });
    expect(plain.plan.toDelete).toBe(3);
    expect(plain.plan.toInsert).toBe(1);

    const keeping = buildImportPlan({
      ...EMPTY_PLAN_INPUT,
      rows: [{ row: 2, en: 'Fresh', zhCN: '新', zhTW: '' }],
      existing: [defaults],
      existingTotal: 3,
      mode: 'replace',
      keepDefaults: true,
    });
    expect(keeping.plan.toDelete).toBe(2);
  });
});

describe('buildImportPlan — issue capping', () => {
  it('caps detail rows while keeping exact counts', () => {
    const rows: ParsedGlossaryRow[] = Array.from({ length: 600 }, (_, i) => ({
      row: i + 2,
      en: '',
      zhCN: `无效 ${i}`,
      zhTW: '',
    }));
    const { plan } = buildImportPlan({ ...EMPTY_PLAN_INPUT, rows });
    expect(plan.issueCount).toBe(600);
    expect(plan.issues).toHaveLength(MAX_PLAN_ISSUES);
    expect(plan.skipped).toBe(600);
  });
});
