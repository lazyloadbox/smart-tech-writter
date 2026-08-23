import { BaseAgent } from './base.agent';
import { PROMPTS, LOCALIZE_LANGUAGE_PROMPTS, buildLocalizerUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentDraft, LocalizeLanguage } from '../../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';

export class LocalizerAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.localizer);
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const targetLang: LocalizeLanguage = state.targetLanguage || 'zh-CN';
    // Fallback for legacy persisted values (e.g. zh-HK) that are no longer supported.
    const langConfig = LOCALIZE_LANGUAGE_PROMPTS[targetLang] ?? LOCALIZE_LANGUAGE_PROMPTS['zh-CN'];
    const localizedDrafts: DocumentDraft[] = [];

    for (const draft of state.drafts) {
      const prompt = buildLocalizerUserPrompt(langConfig.instruction, draft.content);
      const localizedContent = await this.callLLM(prompt);
      const now = new Date().toISOString();
      localizedDrafts.push({
        id: uuidv4(),
        title: `${draft.title} (${langConfig.label})`,
        content: localizedContent,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { localizedDrafts };
  }
}
