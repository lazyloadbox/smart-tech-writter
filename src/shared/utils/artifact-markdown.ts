import type {
  AnalysisResult,
  ExtractedItem,
  FileExtractionResult,
  UploadedFile,
} from '../types/document.types';

/**
 * Markdown is the human-readable, reviewable representation passed between
 * the parsing and analysis stages. Structured fields remain available for
 * validation/backwards compatibility, but these renderers never discard
 * evidence when creating the Markdown artifact.
 */
export function fileExtractionToMarkdown(
  extraction: Partial<FileExtractionResult> | undefined,
  file: Pick<UploadedFile, 'id' | 'name' | 'type' | 'metadata' | 'extractedText'>,
): string {
  const items = extraction?.items ?? [];
  const lines: string[] = [
    `# Parsed source: ${file.name}`,
    '',
    `- **File ID:** \`${file.id}\``,
    `- **Type:** ${file.type || 'unknown'}`,
  ];
  if (file.metadata && Object.keys(file.metadata).length > 0) {
    lines.push(`- **Metadata:** ${Object.entries(file.metadata).map(([key, value]) => `${key}=${value}`).join('; ')}`);
  }
  lines.push('', '## Orientation', '', extraction?.overview?.trim() || 'No orientation was produced.', '');
  lines.push('## Complete extracted information', '');
  if (items.length === 0) {
    lines.push('No structured extraction items were returned.', '');
  } else {
    items.forEach((item, index) => appendExtractedItem(lines, item, index + 1));
  }
  appendListSection(lines, 'Terminology', extraction?.terminology ?? []);
  appendListSection(lines, 'Conflicts found in source', extraction?.conflicts ?? []);
  appendListSection(lines, 'Unresolved or ambiguous points', extraction?.unresolved ?? []);
  if (extraction?.coverage) {
    lines.push(
      '## Extraction coverage',
      '',
      `- **Chunks processed:** ${extraction.coverage.processedChunks}/${extraction.coverage.totalChunks}`,
      '',
    );
  }
  lines.push(
    '## Source text baseline',
    '',
    '> The extracted source text is retained below so a reviewer and downstream agent can verify every interpretation against the original reader output.',
    '',
    '```text',
    file.extractedText?.trim() || '(No source text was available.)',
    '```',
  );
  return lines.join('\n').trim();
}

export function analysisResultToMarkdown(result: Partial<AnalysisResult>, sourceMarkdown?: string): string {
  const lines: string[] = [
    `# Content analysis: ${result.fileName ?? 'Unnamed source'}`,
    '',
    `- **File ID:** \`${result.fileId ?? ''}\``,
    '',
    '## Analytical orientation',
    '',
    result.summary?.trim() || 'No analytical orientation was produced.',
    '',
    '## Key findings',
    '',
  ];
  appendBullets(lines, result.keyPoints ?? []);
  lines.push('', '## Keywords', '', ...(result.keywords ?? []).map((value) => `- ${value}`), '');
  lines.push('## Technical terminology', '', ...(result.technicalTerms ?? []).map((value) => `- ${value}`), '');
  lines.push('## Evidence and implications', '');
  if ((result.extractedItems ?? []).length === 0) {
    lines.push('No additional analytical evidence was returned.', '');
  } else {
    (result.extractedItems ?? []).forEach((item, index) => appendExtractedItem(lines, item, index + 1));
  }
  lines.push(
    '## Source extraction used for analysis',
    '',
    sourceMarkdown?.trim() || 'Source extraction Markdown was not available.',
  );
  return lines.join('\n').trim();
}

function appendExtractedItem(lines: string[], item: ExtractedItem, index: number): void {
  lines.push(`### ${index}. ${item.title}`, '', `- **Category:** ${item.category}`, `- **Importance:** ${item.importance}`, '', item.content.trim());
  if (item.details.length > 0) {
    lines.push('', '**Details:**', '', ...item.details.map((detail) => `- **${detail.key}:** ${detail.value}`));
  }
  if (item.sourceLocation) lines.push('', `- **Source location:** ${item.sourceLocation}`);
  if (item.sourceQuote) lines.push('', `> **Source evidence:** ${item.sourceQuote}`);
  lines.push('');
}

function appendListSection(lines: string[], title: string, values: string[]): void {
  lines.push(`## ${title}`, '');
  if (values.length === 0) lines.push('None recorded.', '');
  else lines.push(...values.map((value) => `- ${value}`), '');
}

function appendBullets(lines: string[], values: string[]): void {
  if (values.length === 0) lines.push('None recorded.');
  else lines.push(...values.map((value) => `- ${value}`));
}

/** Stable separators used by the review editor to edit several artifacts as one Markdown document. */
export function buildMarkdownArtifactBundle(
  entries: Array<{ id: string; title: string; markdown: string }>,
  heading: string,
): string {
  return [
    `# ${heading}`,
    '',
    ...entries.flatMap((entry) => [
      `<!-- smart-tech-writer:artifact:${entry.id} -->`,
      `## ${entry.title}`,
      '',
      entry.markdown.trim(),
      '',
      `<!-- smart-tech-writer:end-artifact:${entry.id} -->`,
      '',
    ]),
  ].join('\n').trim();
}

export function extractMarkdownArtifact(bundle: string, id: string): string | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = bundle.match(new RegExp(`<!-- smart-tech-writer:artifact:${escaped} -->\\s*[\\s\\S]*?\\n([\\s\\S]*?)\\n<!-- smart-tech-writer:end-artifact:${escaped} -->`, 'm'));
  return match?.[1]?.trim();
}
