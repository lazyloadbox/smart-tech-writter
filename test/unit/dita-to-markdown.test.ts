import { describe, expect, it } from 'vitest';
import { ditaToMarkdown } from '../../src/main/modules/document-builder/dita-to-markdown';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="pwm">
  <title>PWM Guide</title>
  <conbody>
    <p>Intro with <b>bold</b>, <i>italic</i>, <codeph>code</codeph> and <xref href="https://example.com">link</xref>.</p>
    <section>
      <title>Setup</title>
      <p>Steps:</p>
      <ul>
        <li>First</li>
        <li>Second</li>
      </ul>
      <codeblock outputclass="language-c">int main() { return 0; }</codeblock>
    </section>
  </conbody>
</concept>`;

describe('ditaToMarkdown (S3-1)', () => {
  it('converts topic and section titles to Markdown headings', () => {
    const md = ditaToMarkdown(XML);
    expect(md).toContain('# PWM Guide');
    expect(md).toContain('## Setup');
  });

  it('converts inline elements, lists and code blocks', () => {
    const md = ditaToMarkdown(XML);
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('`code`');
    expect(md).toContain('[link](https://example.com)');
    expect(md).toContain('- First');
    expect(md).toContain('```c');
    expect(md).toContain('int main()');
  });

  it('never emits raw XML tags or the XML declaration', () => {
    const md = ditaToMarkdown(XML);
    expect(md).not.toContain('<?xml');
    expect(md).not.toContain('<!DOCTYPE');
    expect(md).not.toContain('<conbody>');
    expect(md).not.toContain('<section>');
  });

  it('handles empty input', () => {
    expect(ditaToMarkdown('')).toBe('');
  });
});
