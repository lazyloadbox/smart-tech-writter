import { describe, expect, it } from 'vitest';
import {
  repairDitaXml,
  validateAndRepairDitaXml,
  validateDitaXml,
} from '../../src/main/modules/document-builder/dita.builder';

/**
 * Smoke test proving the unit-test harness works on pure (Electron-free)
 * modules. `dita.builder` is imported by the section splitter work (S1) and
 * was chosen because it has zero runtime dependencies besides TypeScript.
 */
describe('unit test harness (dita.builder smoke)', () => {
  it('accepts a minimal, well-formed concept topic', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">',
      '<concept id="demo"><title>Demo</title><conbody><p>Hello</p></conbody></concept>',
    ].join('\n');

    expect(validateDitaXml(xml)).toEqual({ valid: true, errors: [] });
  });

  it('reports unescaped ampersands and repairs them', () => {
    const broken = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<concept id="x"><title>A & B</title><conbody><p>x</p></conbody></concept>',
    ].join('\n');

    const validation = validateDitaXml(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    expect(repairDitaXml(broken)).toContain('A &amp; B');
    expect(validateAndRepairDitaXml(broken).valid).toBe(true);
  });
});
