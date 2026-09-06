import { BaseAgent } from './base.agent';
import { summarizeLongText } from '../context';
import { chunkText } from '../file-readers/base.reader';
import { PROMPTS, buildFileParserUserPrompt } from '../prompts';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { UploadedFile } from '../../../shared/types/document.types';
import { fileExtractionContract } from '../ai-providers/output-contracts';
import { fileExtractionToMarkdown } from '../../../shared/utils/artifact-markdown';

// Parses a single file's extracted text and produces an evidence-first extraction.
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
        const sourceChunkCount = Math.max(1, chunkText(file.extractedText, 4000, 200).length);
        // Long documents go through exhaustive map-reduce extraction instead of
        // a hard head-only truncation, so key facts from the whole document are
        // available to the structured extraction call.
        const context = await summarizeLongText(file.extractedText ?? '', {
          provider: this.provider,
          signal: this.config.signal,
          onProgress: (msg) => this.config.onProgress?.(msg),
          promptOverrides: this.config.promptOverrides,
          instruction,
        });
        const prompt = buildFileParserUserPrompt(file.id, file.name, context, instruction);
        const parsed = await this.callStructuredLLM(prompt, fileExtractionContract);
        const extraction = {
          ...parsed,
          // IDs are application-owned; never trust a model-generated identity.
          fileId: file.id,
          fileName: file.name,
          coverage: {
            totalChunks: sourceChunkCount,
            processedChunks: sourceChunkCount,
          },
        };
        const canonicalMarkdown = fileExtractionToMarkdown(extraction, file);
        // Keep the model's ordered narrative, then append a deterministic
        // evidence/source baseline so a compact model response can never
        // silently remove details from the reviewable artifact.
        const markdown = parsed.markdown?.trim()
          ? `${parsed.markdown.trim()}\n\n---\n\n${canonicalMarkdown}`
          : canonicalMarkdown;
        updatedFiles.push({
          ...file,
          parseStatus: 'done',
          parseSummary: extraction.overview,
          parseExtraction: { ...extraction, markdown },
          parseMarkdown: markdown,
        });
      } catch (err) {
        updatedFiles.push({ ...file, parseStatus: 'error', parseError: String(err) });
      }
    }
    return { inputFiles: updatedFiles };
  }
}
