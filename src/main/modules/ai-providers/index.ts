import type { AIProvider, ProviderConfig } from './base.provider';
import { OpenAIProvider } from './openai.provider';

export type { AIProvider, AIMessage, CompletionOptions, ProviderConfig, ProviderType } from './base.provider';

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.type) {
    case 'openai':
      return new OpenAIProvider(config);
    // Future: case 'anthropic': return new AnthropicProvider(config);
    // Future: case 'ollama': return new OllamaProvider(config);
    default:
      throw new Error(`Provider "${(config as ProviderConfig).type}" not yet implemented`);
  }
}
