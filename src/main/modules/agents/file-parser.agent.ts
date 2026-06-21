import { BaseAgent } from './base.agent';
import type { DocGenState } from '../../../shared/types/workflow.types';
import type { UploadedFile } from '../../../shared/types/document.types';

// Parses a single file's extracted text and produces a structured AI summary
export class FileParserAgent extends BaseAgent {
  get systemPrompt(): string {
    return this.config.systemPromptTemplate ?? `You are a technical document analyst for industrial automation systems.
Given raw extracted text from a document, produce a JSON object with:
- summary: a concise summary of the document content
- keyPoints: array of key technical points (max 10)
- keywords: array of relevant technical keywords (max 20)
- technicalTerms: array of domain-specific terms found (e.g., PLC, HMI, SCADA)

Respond ONLY with valid JSON, no markdown fences.`;
  }

  async execute(state: DocGenState): Promise<Partial<DocGenState>> {
    const updatedFiles: UploadedFile[] = [];
    for (const file of state.inputFiles) {
      if (file.parseStatus !== 'parsing' || !file.extractedText) {
        updatedFiles.push(file);
        continue;
      }
      try {
        const prompt = `Document name: ${file.name}\n\nExtracted text (truncated to 4000 chars):\n${file.extractedText.slice(0, 4000)}`;
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
