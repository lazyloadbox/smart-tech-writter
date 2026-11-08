/**
 * Section-split export helpers (design §3.2–§3.6 / S2 + S3).
 *
 * Pure functions that turn one final DITA concept topic into the preview rows
 * and per-section file contents. The IPC layer is responsible for dialogs,
 * directory creation and writing; keeping the composition here makes the whole
 * flow unit-testable.
 */

import {
  splitDitaBySections,
  type DitaSplitResult,
} from './section-splitter';
import { buildSectionBaseName, buildSectionFileName, toSafeFileName } from './file-naming';
import { buildDitaMap } from './section-splitter';
import { normalizeDitaMarkup, validateAndRepairDitaXml } from './dita.builder';
import { en as ui, formatUi } from '../../../shared/i18n';
import type {
  IncludeIntroMode,
  SplitExportOptions,
  SplitPreviewResult,
  SplitSectionSummary,
} from '../../../shared/types/ipc.types';

export interface SplitPlan {
  docTitle: string;
  split: DitaSplitResult;
  warnings: string[];
}

/** Split the XML (repairing it first when necessary) and collect warnings. */
export function buildSplitPlan(xml: string, docTitle: string): SplitPlan {
  const source = xml ?? '';
  const normalized = normalizeDitaMarkup(source);
  const repaired = validateAndRepairDitaXml(source);
  const split = splitDitaBySections(repaired.content);
  const warnings = [...split.warnings];
  if (repaired.repaired) {
    // Tag-case normalisation is reported separately: it is a common AI-editing
    // artefact (`<Section>`) that used to hide whole sections from the split.
    warnings.unshift(
      normalized === repaired.content
        ? formatUi(ui.backend.splitTagCaseNormalized, {})
        : 'The DITA XML was auto-repaired before splitting.',
    );
  }
  return { docTitle, split, warnings };
}

/** Preview rows shown in the split-export dialog. */
export function summarizeSplit(plan: SplitPlan): SplitPreviewResult {
  const total = plan.split.sections.length;
  const sections: SplitSectionSummary[] = plan.split.sections.map((section, position) => ({
    index: section.index,
    title: section.title,
    fileName: buildSectionFileName(position + 1, total, section.title, 'dita'),
    chars: section.xml.length,
  }));
  const warnings = [...plan.warnings];
  if (plan.split.intro) {
    // Content before the first <section> is only exported when the user selects
    // an intro placement, so surface it instead of silently dropping it.
    warnings.push(formatUi(ui.backend.splitIntroSkipped, { characters: plan.split.intro.length }));
  }
  return {
    docTitle: plan.docTitle,
    sections,
    warnings,
  };
}

export interface ComposedSplitFile {
  /** 1-based position among the exported files. */
  index: number;
  /** Original section index (1-based, document order). */
  sectionIndex: number;
  title: string;
  /** File name without extension. */
  baseName: string;
  ditaContent: string;
  valid: boolean;
  errors: string[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Replace the topic `<title>` in the shared header (used by `titleFromSection`). */
function replaceTopicTitle(header: string, title: string): string {
  return header.replace(/<title\b[^>]*>[\s\S]*?<\/title>/, `<title>${escapeXml(title)}</title>`);
}

function introFor(mode: IncludeIntroMode, intro: string, isFirst: boolean): string {
  if (!intro) return '';
  if (mode === 'all') return intro;
  if (mode === 'first' && isFirst) return intro;
  return '';
}

/**
 * Compose the selected section files. Section numbering is continuous across
 * the **exported** files (unselected sections do not consume a number), as
 * decided in design §3.4 (Q7). Each file reuses the original header
 * byte-for-byte unless `titleFromSection` is enabled.
 */
export function composeSplitFiles(plan: SplitPlan, options: SplitExportOptions): ComposedSplitFile[] {
  const selected = [...new Set(options.selected)]
    .filter((index) => Number.isFinite(index))
    .sort((a, b) => a - b);
  const total = selected.length;
  if (total === 0) return [];

  const files: ComposedSplitFile[] = [];
  selected.forEach((sectionIndex, position) => {
    const section = plan.split.sections.find((candidate) => candidate.index === sectionIndex);
    if (!section) return;

    const isFirst = position === 0;
    const header = options.titleFromSection
      ? replaceTopicTitle(plan.split.header, section.title)
      : plan.split.header;
    const intro = introFor(options.includeIntro, plan.split.intro, isFirst);
    const raw = [header, intro, section.xml, plan.split.footer]
      .filter((part) => part && part.trim())
      .join('\n');
    const validated = validateAndRepairDitaXml(raw);

    files.push({
      index: position + 1,
      sectionIndex: section.index,
      title: section.title,
      baseName: buildSectionBaseName(position + 1, total, section.title),
      ditaContent: validated.content,
      valid: validated.valid,
      errors: validated.errors,
    });
  });
  return files;
}

/** File name for a `.docx` sibling of a section file (`.dita` is optional). */
export function toSectionDocxName(ditaFileName: string): string {
  return `${ditaFileName.replace(/\.dita$/i, '')}.docx`;
}

/** Build the `.ditamap` listing every exported section. */
export function buildSplitDitaMap(docTitle: string, ditaFileNames: string[]): string {
  return buildDitaMap(docTitle, ditaFileNames);
}

/** Safe sub-directory name for one split export (`{SafeDocTitle}_sections`). */
export function buildSplitDirectoryName(docTitle: string): string {
  return `${toSafeFileName(docTitle)}_sections`;
}
