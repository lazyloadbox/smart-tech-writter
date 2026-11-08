import { describe, expect, it } from 'vitest';
import type { DocumentDraft } from '../../src/shared/types/document.types';
import { buildDitaXml, validateDitaXml } from '../../src/main/modules/document-builder/dita.builder';
import {
  buildDitaMap,
  composeSectionFile,
  splitDitaBySections,
} from '../../src/main/modules/document-builder/section-splitter';

function ditaDocument(body: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">',
    '<concept id="test-topic">',
    '  <title>Test Topic</title>',
    '  <conbody>',
    body,
    '  </conbody>',
    '</concept>',
  ].join('\n');
}

const draft: DocumentDraft = {
  id: 'draft-1',
  title: 'ESP32 PWM Technical Document',
  content: [
    '# ESP32 PWM Technical Document',
    '',
    'Intro paragraph before sections.',
    '',
    '## Executive Summary',
    '',
    'Summary text.',
    '',
    '## Product Overview',
    '',
    '- item one',
    '- item two',
    '',
    '## Technical Specifications',
    '',
    'Spec text.',
  ].join('\n'),
  createdAt: '2026-11-08T00:00:00.000Z',
  updatedAt: '2026-11-08T00:00:00.000Z',
};

describe('splitDitaBySections — standard builder output', () => {
  const xml = buildDitaXml(draft);
  const result = splitDitaBySections(xml);

  it('finds every top-level section in document order', () => {
    expect(result.sections.map((s) => s.title)).toEqual([
      'Executive Summary',
      'Product Overview',
      'Technical Specifications',
    ]);
    expect(result.sections.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it('puts everything up to <conbody> into the header', () => {
    expect(result.header.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(result.header).toContain('<!DOCTYPE concept');
    expect(result.header).toContain('<concept id="esp32-pwm-technical-document">');
    expect(result.header).toContain('<title>ESP32 PWM Technical Document</title>');
    expect(result.header.trimEnd().endsWith('<conbody>')).toBe(true);
  });

  it('extracts the intro content before the first section', () => {
    expect(result.intro).toBe('<p>Intro paragraph before sections.</p>');
  });

  it('keeps the section fragments verbatim', () => {
    expect(result.sections[0].xml.startsWith('<section><title>Executive Summary</title>')).toBe(true);
    expect(result.sections[0].xml.endsWith('</section>')).toBe(true);
    expect(result.sections[1].xml).toContain('<li><p>item one</p></li>');
  });

  it('has no warnings for a well-formed builder document', () => {
    expect(result.warnings).toEqual([]);
  });

  it('reuses the header byte-for-byte in every sub-file', () => {
    const files = result.sections.map((section, i) =>
      composeSectionFile(result, section, { includeIntro: 'none', isFirst: i === 0 }),
    );
    expect(files).toHaveLength(3);
    for (const file of files) {
      expect(file.startsWith(result.header)).toBe(true);
      expect(file).toContain('</conbody>');
      expect(file).toContain('</concept>');
    }
  });

  it('produces well-formed DITA for every sub-file', () => {
    for (const [i, section] of result.sections.entries()) {
      const file = composeSectionFile(result, section, { includeIntro: 'none', isFirst: i === 0 });
      expect(validateDitaXml(file).errors).toEqual([]);
      expect(validateDitaXml(file).valid).toBe(true);
    }
  });
});

describe('splitDitaBySections — intro placement', () => {
  const xml = buildDitaXml(draft);
  const result = splitDitaBySections(xml);
  const [first, second] = result.sections;

  it('includeIntro=none never inserts the intro', () => {
    const file = composeSectionFile(result, first, { includeIntro: 'none', isFirst: true });
    expect(file).not.toContain('Intro paragraph before sections.');
  });

  it('includeIntro=first inserts the intro only into the first file', () => {
    const file1 = composeSectionFile(result, first, { includeIntro: 'first', isFirst: true });
    const file2 = composeSectionFile(result, second, { includeIntro: 'first', isFirst: false });
    expect(file1).toContain('Intro paragraph before sections.');
    expect(file2).not.toContain('Intro paragraph before sections.');
  });

  it('includeIntro=all inserts the intro into every file', () => {
    const file1 = composeSectionFile(result, first, { includeIntro: 'all', isFirst: true });
    const file2 = composeSectionFile(result, second, { includeIntro: 'all', isFirst: false });
    expect(file1).toContain('Intro paragraph before sections.');
    expect(file2).toContain('Intro paragraph before sections.');
  });
});

describe('splitDitaBySections — edge cases', () => {
  it('reports documents without a <conbody>', () => {
    const result = splitDitaBySections(
      '<?xml version="1.0" encoding="UTF-8"?>\n<concept id="x"><title>X</title></concept>',
    );
    expect(result.sections).toEqual([]);
    expect(result.warnings.join(' ')).toContain('<conbody>');
  });

  it('reports documents without any section', () => {
    const result = splitDitaBySections(ditaDocument('    <p>Only an intro paragraph.</p>'));
    expect(result.sections).toEqual([]);
    expect(result.intro).toContain('Only an intro paragraph.');
    expect(result.warnings.join(' ')).toContain('No top-level <section>');
    expect(result.header.endsWith('<conbody>')).toBe(true);
  });

  it('falls back to "Section {index}" when a section has no title', () => {
    const result = splitDitaBySections(
      ditaDocument([
        '    <section><title>Has Title</title><p>a</p></section>',
        '    <section><p>no title here</p></section>',
      ].join('\n')),
    );
    expect(result.sections).toHaveLength(2);
    expect(result.sections[1].title).toBe('Section 2');
    expect(result.warnings.join(' ')).toContain('Section 2 has no <title>');
  });

  it('keeps a nested section inside its parent and warns', () => {
    const result = splitDitaBySections(
      ditaDocument([
        '    <section><title>Outer</title><p>a</p><section><title>Inner</title><p>b</p></section></section>',
        '    <section><title>Second</title><p>c</p></section>',
      ].join('\n')),
    );
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe('Outer');
    expect(result.sections[0].xml).toContain('Inner');
    expect(result.sections[1].title).toBe('Second');
    expect(result.warnings.join(' ')).toContain('Nested <section>');
  });

  it('attaches content after the last section to that section and warns', () => {
    const result = splitDitaBySections(
      ditaDocument([
        '    <section><title>One</title><p>a</p></section>',
        '    <p>Trailing paragraph</p>',
      ].join('\n')),
    );
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].xml).toContain('Trailing paragraph');
    expect(result.warnings.join(' ')).toContain('attached to section 1');

    const file = composeSectionFile(result, result.sections[0], {
      includeIntro: 'none',
      isFirst: true,
    });
    expect(validateDitaXml(file).valid).toBe(true);
  });

  it('ignores <section> text inside comments and CDATA', () => {
    const result = splitDitaBySections(
      ditaDocument([
        '    <!-- <section><title>Fake</title><p>x</p></section> -->',
        '    <p><![CDATA[<section><title>CData</title></section>]]></p>',
        '    <section><title>Real</title><p>ok</p></section>',
      ].join('\n')),
    );
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe('Real');
  });

  it('matches element names case-insensitively (AI-edited DITA)', () => {
    const result = splitDitaBySections(
      ditaDocument([
        '    <Section><Title>1. Executive Summary</Title><p>a</p></section>',
        '    <section><title>2. Overview</title><p>b</p></section>',
      ].join('\n')),
    );
    expect(result.sections.map((section) => section.title)).toEqual([
      '1. Executive Summary',
      '2. Overview',
    ]);
  });

  it('decodes entities and strips inline tags from titles', () => {
    const result = splitDitaBySections(
      ditaDocument(
        '    <section><title>Product &amp; <b>Feature</b> Overview &#65;</title><p>x</p></section>',
      ),
    );
    expect(result.sections[0].title).toBe('Product & Feature Overview A');
  });

  it('uses only the direct child title, not a nested one', () => {
    const result = splitDitaBySections(
      ditaDocument(
        '    <section><p><title>Nested</title></p><title>Direct</title><p>x</p></section>',
      ),
    );
    expect(result.sections[0].title).toBe('Direct');
  });

  it('returns an empty result for empty input', () => {
    const result = splitDitaBySections('   ');
    expect(result.sections).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('buildDitaXml — empty headings', () => {
  it('keeps headings that have no body content', () => {
    const xml = buildDitaXml({
      ...draft,
      content: ['# ESP32 PWM', '', '## 1. Overview', '', '## 2. Details', '', 'Body text.'].join('\n'),
    });
    const result = splitDitaBySections(xml);
    expect(result.sections.map((section) => section.title)).toEqual(['1. Overview', '2. Details']);
    expect(validateDitaXml(xml).valid).toBe(true);
  });
});

describe('buildDitaMap', () => {
  it('builds a map referencing every exported file in order', () => {
    const map = buildDitaMap('ESP32 & PWM', ['01_Executive Summary.dita', '02_Overview.dita']);
    expect(map).toContain('<title>ESP32 &amp; PWM</title>');
    expect(map).toContain('<topicref href="01_Executive Summary.dita"/>');
    expect(map).toContain('<topicref href="02_Overview.dita"/>');
    expect(map.indexOf('01_')).toBeLessThan(map.indexOf('02_'));
    expect(map.trimEnd().endsWith('</map>')).toBe(true);
  });
});
