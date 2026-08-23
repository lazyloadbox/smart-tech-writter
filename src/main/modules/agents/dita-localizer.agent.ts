import { BaseAgent } from './base.agent';
import { PROMPTS, LOCALIZE_LANGUAGE_PROMPTS, buildDitaLocalizerUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { LocalizeLanguage } from '../../../shared/types/document.types';

/**
 * Standalone DITA localization agent (independent feature).
 *
 * Translates an already-generated DITA XML document into a target language
 * while preserving the XML structure. Not part of the workflow graph — the
 * abstract `execute()` is implemented as a no-op to satisfy BaseAgent.
 */
export class DitaLocalizerAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.ditaLocalizer);
  }

  /** Not used by the workflow — satisfies the abstract BaseAgent contract. */
  async execute(_state: DocGenState): Promise<Partial<DocGenState>> {
    return {};
  }

  /**
   * Translate a DITA XML document into the target language.
   * Uses streaming (when a stream callback is set) with the empty-result
   * fallback built into BaseAgent.callLLM.
   *
   * @param mappingContext optional glossary block (from MappingService) that
   *   the AI should reference for established terminology.
   */
  async translateDita(
    ditaXml: string,
    targetLanguage: LocalizeLanguage,
    mappingContext?: string
  ): Promise<string> {
    // Fallback for legacy persisted values (e.g. zh-HK) that are no longer supported.
    const langConfig = LOCALIZE_LANGUAGE_PROMPTS[targetLanguage] ?? LOCALIZE_LANGUAGE_PROMPTS['zh-CN'];
    const prompt = buildDitaLocalizerUserPrompt(langConfig.instruction, ditaXml, mappingContext);
    return this.callLLM(prompt, { maxTokens: 128000 });
  }
}