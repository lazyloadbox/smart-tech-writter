// Types for the standalone DITA localization feature.

import type { LocalizeLanguage, ReviewComment } from './document.types';

/**
 * Workflow stage of the standalone localization tool.
 *
 * Mirrors the localization portion of the document-generation workflow:
 *   localize → review_localize → localize_ai_review → human_localize_review
 *   → post_edit_review → human_confirm → export
 */
export type LocalizationStage =
  | 'localize'
  | 'review_localize'
  | 'localize_ai_review'
  | 'human_localize_review'
  | 'post_edit_review'
  | 'human_confirm'
  | 'export';

/** Overall status of a localization run. */
export type LocalizationStatus =
  | 'idle'
  | 'running'
  | 'paused:review_localize'
  | 'paused:human_localize_review'
  | 'paused:human_confirm'
  | 'done'
  | 'failed';

/** Per-file translation result. */
export interface LocalizationFileResult {
  /** Absolute path of the source .dita file. */
  sourcePath: string;
  /** Original file name (basename). */
  fileName: string;
  /** File name the exported file is written as (`<basename>.<lang>.dita`). */
  exportFileName: string;
  /** Target language the file was translated to. */
  targetLanguage: LocalizeLanguage;
  /** Original source DITA XML (for side-by-side review). */
  originalContent: string;
  /** AI translation (before any human edits). */
  aiContent: string;
  /** Content after the human_localize_review edits (before post_edit_review). */
  humanLocalizeContent?: string;
  /** Current effective content (AI translation + human edits). */
  content: string;
  /** Per-file status. */
  status: 'done' | 'failed';
  /** Error message when status === 'failed'. */
  error?: string;
  /** Whether the final content passed validateDitaXml (after auto-repair). */
  validated: boolean;
  /** Whether auto-repair was applied to make the XML well-formed. */
  repaired?: boolean;
  /** Validation errors remaining after auto-repair (empty when validated). */
  validationErrors?: string[];
  /** AI review comments from localize_ai_review. */
  reviewComments: ReviewComment[];
  /** AI review comments from post_edit_review (after human edits). */
  postEditComments: ReviewComment[];
}

/** Summary of a persisted localization run (shown in the overview list). */
export interface LocalizeRun {
  id: string;
  status: LocalizationStatus;
  stage: LocalizationStage;
  targetLanguage: LocalizeLanguage;
  createdAt: string;
  updatedAt: string;
  /** Number of files in this run (done + failed). */
  fileCount: number;
}

/** Full persisted localization run state (used to restore a run). */
export interface LocalizeRunState extends LocalizeRun {
  results: LocalizationFileResult[];
}