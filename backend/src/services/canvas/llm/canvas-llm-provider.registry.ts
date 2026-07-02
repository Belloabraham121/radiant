import type {
  CanvasLlmProvider,
  CanvasLlmProviderId,
} from "./canvas-llm.types.js";

const providers = new Map<CanvasLlmProviderId, CanvasLlmProvider>();

export function registerCanvasLlmProvider(provider: CanvasLlmProvider): void {
  providers.set(provider.id, provider);
}

export function getCanvasLlmProvider(id: CanvasLlmProviderId): CanvasLlmProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new Error(`Canvas LLM provider "${id}" is not registered`);
  }
  return provider;
}

export function listCanvasLlmProviders(): CanvasLlmProviderId[] {
  return [...providers.keys()];
}

export type { CanvasLlmProvider };

// Register built-in providers at module load.
import { openAiV1CanvasLlmProvider } from "./providers/openai-v1.provider.js";

registerCanvasLlmProvider(openAiV1CanvasLlmProvider);
