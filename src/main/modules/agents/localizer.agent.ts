import { BaseAgent } from './base.agent';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { DocumentDraft, LocalizeLanguage } from '../../../shared/types/document.types';
import { v4 as uuidv4 } from 'uuid';

const LANGUAGE_PROMPTS: Record<LocalizeLanguage, { label: string; instruction: string }> = {
  'zh-CN': {
    label: 'Simplified Chinese (简体中文)',
    instruction: `Translate and localize the technical document to Simplified Chinese (zh-CN / 简体中文).
Use standard Simplified Chinese technical terminology commonly used in mainland China.
For industrial automation terms, use PRC standard terminology.
Preserve all Markdown formatting, code blocks, and document structure.`,
  },
  'zh-TW': {
    label: 'Traditional Chinese - Taiwan (繁體中文-台灣)',
    instruction: `Translate and localize the technical document to Traditional Chinese as used in Taiwan (zh-TW / 繁體中文-台灣).
Use Taiwan-specific technical terminology and conventions:
- "程式" not "程序" for program
- "檔案" not "文件" for file
- "資訊" not "信息" for information
- "軟體" not "軟件" for software
- "硬體" not "硬件" for hardware
- "伺服器" not "服務器" for server
- "資料庫" not "數據庫" for database
- "網路" not "網絡" for network
- "數位" not "數字" for digital
- "佇列" not "隊列" for queue
- "物件" not "對象" for object
- "指標" not "指針" for pointer
- "匯流排" not "總線" for bus
- "韌體" not "固件" for firmware
Use Taiwan customary expressions and measurement units (公制 with Taiwan conventions).
Preserve all Markdown formatting, code blocks, and document structure.`,
  },
  'zh-HK': {
    label: 'Traditional Chinese - Hong Kong (繁體中文-香港)',
    instruction: `Translate and localize the technical document to Traditional Chinese as used in Hong Kong (zh-HK / 繁體中文-香港).
Use Hong Kong-specific technical terminology and conventions:
- "程式" not "程序" for program
- "檔案" not "文件" for file
- "資訊" not "信息" for information
- "軟件" or "軟體" (HK commonly uses both, prefer 軟件 in formal docs)
- "硬件" (HK prefers 硬件 over 硬體)
- "伺服器" not "服務器" for server
- "資料庫" not "數據庫" for database
- "網絡" not "網路" for network (HK prefers 網絡)
- "數碼" not "數字" for digital (HK convention: 數碼)
- "隊列" or "佇列" (HK uses 隊列 more commonly)
- "物件" not "對象" for object
- "地址" not "指標" for pointer (context-dependent, HK prefers 指標 for programming)
- "匯流排" or "總線" (HK commonly uses 總線)
- "韌體" or "固件" (HK uses 固件 more in industrial contexts)
Use Hong Kong customary expressions. Note that HK Chinese sometimes borrows English terms directly.
Preserve all Markdown formatting, code blocks, and document structure.`,
  },
};

export class LocalizerAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.config.systemPromptTemplate ?? `You are an expert technical translator and localizer.
Translate and localize technical documents accurately while preserving all formatting.
Use the target language's standard technical terminology and conventions.`;
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const targetLang: LocalizeLanguage = state.targetLanguage || 'zh-CN';
    const langConfig = LANGUAGE_PROMPTS[targetLang];
    const localizedDrafts: DocumentDraft[] = [];

    for (const draft of state.drafts) {
      const prompt = `${langConfig.instruction}\n\n---\n\nDocument to translate:\n\n${draft.content}`;
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
