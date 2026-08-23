import { BaseAgent } from './base.agent';
import { summarizeLongText } from '../context';
import { PROMPTS, buildFileParserUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { UploadedFile } from '../../../shared/types/document.types';

// Parses a single file's extracted text and produces a structured AI summary
export class FileParserAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.buildSystemPrompt(PROMPTS.fileParser);
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const updatedFiles: UploadedFile[] = [];
    for (const file of state.inputFiles) {
      if (file.parseStatus !== 'parsing' || !file.extractedText) {
        updatedFiles.push(file);
        continue;
      }
      try {
        // 单文件提示词优先，其次使用全局解析提示词。
        const instruction = file.parseInstruction?.trim() || this.config.parseInstruction?.trim() || undefined;
        // Long documents go through map-reduce summarization instead of a hard
        // head-only truncation, so key facts from the whole document survive.
        const context = await summarizeLongText(file.extractedText ?? '', {
          provider: this.provider,
          signal: this.config.signal,
          onProgress: (msg) => this.config.onProgress?.(msg),
          promptOverrides: this.config.promptOverrides,
          instruction,
        });
        const prompt = buildFileParserUserPrompt(file.name, context, instruction);
        const response = await this.callLLM(prompt);
        let parsed: { summary: string; keyPoints: string[]; keywords: string[]; technicalTerms: string[] };
        try {
          parsed = JSON.parse(response);
        } catch {
          parsed = { summary: response, keyPoints: [], keywords: [], technicalTerms: [] };
        }
        updatedFiles.push({
          ...file,
          parseStatus: 'done',
          parseSummary: parsed.summary,
        });
      } catch (err) {
        updatedFiles.push({ ...file, parseStatus: 'error', parseError: String(err) });
      }
    }
    return { inputFiles: updatedFiles };
  }
}
