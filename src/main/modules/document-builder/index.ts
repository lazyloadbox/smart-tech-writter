export { buildDocx } from './docx.builder';
export { buildDita, buildDitaXml } from './dita.builder';
export {
  splitDitaBySections,
  composeSectionFile,
  buildDitaMap,
} from './section-splitter';
export type {
  SplitSection,
  DitaSplitResult,
  ComposeSectionOptions,
  IntroPlacement,
} from './section-splitter';
export {
  toSafeFileName,
  stripLeadingSectionNumber,
  formatIndex,
  computeIndexWidth,
  buildSectionBaseName,
  buildSectionFileName,
  MAX_SAFE_TITLE_LENGTH,
} from './file-naming';
export { ditaToMarkdown } from './dita-to-markdown';
export {
  buildSplitPlan,
  summarizeSplit,
  composeSplitFiles,
  toSectionDocxName,
  buildSplitDitaMap,
  buildSplitDirectoryName,
} from './split-document';
export type { SplitPlan, ComposedSplitFile } from './split-document';
