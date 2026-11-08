import { describe, expect, it } from 'vitest';
import {
  buildSplitPlan,
  buildSplitDitaMap,
  composeSplitFiles,
  summarizeSplit,
} from '../../src/main/modules/document-builder/split-document';
import { validateDitaXml } from '../../src/main/modules/document-builder/dita.builder';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="esp32-pwm">
  <title>ESP32 PWM</title>
  <conbody>
    <p>Intro paragraph.</p>
    <section><title>Executive Summary</title><p>Summary text.</p></section>
    <section><title>Technical Specifications</title><p>Specs text.</p></section>
  </conbody>
</concept>`;

const baseOptions = {
  selected: [1, 2],
  formats: ['dita' as const],
  includeIntro: 'none' as const,
  createMap: false,
  titleFromSection: false,
};

describe('split-document (S2/S3)', () => {
  it('builds preview rows with safe file names', () => {
    const plan = buildSplitPlan(XML, 'ESP32 PWM');
    const preview = summarizeSplit(plan);
    expect(preview.sections.map((section) => section.fileName)).toEqual([
      '01_Executive Summary.dita',
      '02_Technical Specifications.dita',
    ]);
    // The document has content before the first section; the dialog says so.
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toContain('before the first section');
  });

  it('produces valid DITA files that share the header byte-for-byte', () => {
    const plan = buildSplitPlan(XML, 'ESP32 PWM');
    const files = composeSplitFiles(plan, baseOptions);
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(file.valid).toBe(true);
      expect(validateDitaXml(file.ditaContent).valid).toBe(true);
      expect(file.ditaContent.startsWith(plan.split.header)).toBe(true);
      expect(file.ditaContent).toContain('<concept id="esp32-pwm">');
      expect(file.ditaContent).toContain('</concept>');
    }
  });

  it('renumbers only the selected sections', () => {
    const plan = buildSplitPlan(XML, 'ESP32 PWM');
    const files = composeSplitFiles(plan, { ...baseOptions, selected: [2] });
    expect(files).toHaveLength(1);
    expect(files[0].baseName).toBe('01_Technical Specifications');
  });

  it('includes the intro only where requested', () => {
    const plan = buildSplitPlan(XML, 'ESP32 PWM');
    const firstOnly = composeSplitFiles(plan, { ...baseOptions, includeIntro: 'first' });
    expect(firstOnly[0].ditaContent).toContain('Intro paragraph.');
    expect(firstOnly[1].ditaContent).not.toContain('Intro paragraph.');

    const all = composeSplitFiles(plan, { ...baseOptions, includeIntro: 'all' });
    expect(all[0].ditaContent).toContain('Intro paragraph.');
    expect(all[1].ditaContent).toContain('Intro paragraph.');
  });

  it('can replace the topic title with the section title', () => {
    const plan = buildSplitPlan(XML, 'ESP32 PWM');
    const files = composeSplitFiles(plan, { ...baseOptions, titleFromSection: true });
    expect(files[0].ditaContent).toContain('<title>Executive Summary</title>');
    expect(files[0].ditaContent).not.toContain('<title>ESP32 PWM</title>');
  });

  it('builds a ditamap listing the exported files', () => {
    const map = buildSplitDitaMap('ESP32 PWM', ['01_Executive Summary.dita']);
    expect(map).toContain('<map>');
    expect(map).toContain('<topicref href="01_Executive Summary.dita"/>');
  });

  it('drops the source numbering from the file name but keeps it in the content', () => {
    const numbered = XML.replace('<title>Executive Summary</title>', '<title>1. Executive Summary</title>').replace(
      '<title>Technical Specifications</title>',
      '<title>2. Technical Specifications</title>',
    );
    const plan = buildSplitPlan(numbered, 'ESP32 PWM');
    const preview = summarizeSplit(plan);
    expect(preview.sections.map((section) => section.fileName)).toEqual([
      '01_Executive Summary.dita',
      '02_Technical Specifications.dita',
    ]);
    const files = composeSplitFiles(plan, baseOptions);
    expect(files[0].baseName).toBe('01_Executive Summary');
    expect(files[0].ditaContent).toContain('<title>1. Executive Summary</title>');
  });

  it('recognises tags written with capitals (AI-edited DITA)', () => {
    const mixedCase = XML.replace('<section><title>Executive Summary</title>', '<Section><title>Executive Summary</title>');
    const plan = buildSplitPlan(mixedCase, 'ESP32 PWM');
    expect(plan.split.sections).toHaveLength(2);
    expect(summarizeSplit(plan).sections[0].fileName).toBe('01_Executive Summary.dita');
    const files = composeSplitFiles(plan, baseOptions);
    expect(files.every((file) => file.valid)).toBe(true);
    expect(files[0].ditaContent).not.toContain('<Section>');
  });

  it('repairs a capitalised XML declaration', () => {
    const badDeclaration = XML.replace('<?xml version="1.0"', '<?xml Version="1.0"');
    const plan = buildSplitPlan(badDeclaration, 'ESP32 PWM');
    const files = composeSplitFiles(plan, baseOptions);
    for (const file of files) {
      expect(file.ditaContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(validateDitaXml(file.ditaContent).valid).toBe(true);
    }
    expect(plan.warnings.join(' ')).toContain('Element names were normalised');
  });
});
