import type { ChatProvider } from '../provider.js';
import { anthropicProvider } from './anthropic.js';
import { openAiCompatibleProvider } from './openai-compatible.js';

const PROVIDERS: Record<string, ChatProvider> = {
  anthropic: anthropicProvider,
  openai: openAiCompatibleProvider,
};

export function resolveProvider(name: string): ChatProvider {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`unknown provider '${name}' — expected one of: ${Object.keys(PROVIDERS).join(', ')}`);
  return provider;
}

export { anthropicProvider, openAiCompatibleProvider };
