import { describe, expect, it } from 'vitest';
import {
  assembleDocumentChunks,
  planDocumentChunks,
} from '../../src/main/modules/localization/chunked-translation';
import { validateDitaXml } from '../../src/main/modules/document-builder/dita.builder';

const DOC = `<?xml version="1.0" encoding="UTF-8"?>
<concept id="pwm">
  <title>PWM Overview</title>
  <conbody>
    <p>Intro paragraph about PWM.</p>
    <section><title>Duty cycle</title><p>The duty cycle is 50%.</p></section>
    <section><title>Frequency</title><p>The frequency is 1 kHz.</p></section>
  </conbody>
</concept>`;

/** Fake translator: prefixes text nodes so we can assert the reassembly. */
function translate(chunk: string): string {
  return chunk
    .replace('Intro paragraph about PWM.', 'INTRO パラグラフ')
    .replace('The duty cycle is 50%.', 'デューティ比は 50% です。')
    .replace('The frequency is 1 kHz.', '周波数は 1 kHz です。')
    .replace('<title>Duty cycle</title>', '<title>デューティ比</title>')
    .replace('<title>Frequency</title>', '<title>周波数</title>')
    .replace('<title>PWM Overview</title>', '<title>PWM 概要</title>');
}

describe('planDocumentChunks', () => {
  it('returns null for small documents', () => {
    expect(planDocumentChunks(DOC, 10_000)).toBeNull();
  });

  it('returns null when the document has no splittable sections', () => {
    const single = `<?xml version="1.0" encoding="UTF-8"?>
<concept id="x"><title>X</title><conbody><p>Only one paragraph.</p></conbody></concept>`;
    expect(planDocumentChunks(single, 1)).toBeNull();
  });

  it('produces one complete DITA document per intro / section', () => {
    const chunks = planDocumentChunks(DOC, 10);
    expect(chunks).not.toBeNull();
    expect(chunks).toHaveLength(3); // intro + 2 sections
    expect(chunks![0].kind).toBe('intro');
    expect(chunks!.slice(1).every((c) => c.kind === 'section')).toBe(true);
    for (const chunk of chunks!) {
      expect(validateDitaXml(chunk.xml).valid).toBe(true);
      expect(chunk.xml.startsWith('<?xml')).toBe(true);
      expect(chunk.xml).toContain('<concept id="pwm">');
    }
  });

  it('shares the identical header across chunks', () => {
    const chunks = planDocumentChunks(DOC, 10)!;
    // XML declaration, `<concept>`, document title and `<conbody>` are shared.
    const heads = chunks.map((c) => c.xml.split('\n').slice(0, 4).join('\n'));
    expect(new Set(heads).size).toBe(1);
  });
});

describe('assembleDocumentChunks', () => {
  it('reassembles translated sections under the original header', () => {
    const chunks = planDocumentChunks(DOC, 10)!;
    const translated = chunks.map((c) => translate(c.xml));
    const assembled = assembleDocumentChunks(DOC, translated);

    expect(validateDitaXml(assembled).valid).toBe(true);
    expect(assembled).toContain('INTRO パラグラフ');
    expect(assembled).toContain('デューティ比は 50% です。');
    expect(assembled).toContain('周波数は 1 kHz です。');
    expect(assembled).toContain('<title>PWM Overview</title>');
    // Original sections are replaced, not duplicated.
    expect(assembled.match(/<section>/g)).toHaveLength(2);
  });

  it('keeps the original fragment when a translated chunk is missing', () => {
    const chunks = planDocumentChunks(DOC, 10)!;
    const translated = chunks.slice(0, 1).map((c) => translate(c.xml)); // intro only
    const assembled = assembleDocumentChunks(DOC, translated);
    expect(validateDitaXml(assembled).valid).toBe(true);
    expect(assembled).toContain('The duty cycle is 50%.');
    expect(assembled).toContain('The frequency is 1 kHz.');
  });
});
