import type { JsonObject } from "../types";

export interface LlmResult {
  output: JsonObject;
  modelName: string;
  latencyMs: number;
}

export interface LlmClient {
  generate: (args: { system: string; user: string }) => Promise<LlmResult>;
}

export function createStubLlmClient(modelName = "stub-v2-model"): LlmClient {
  return {
    async generate(): Promise<LlmResult> {
      throw new Error(
        `No pipeline_v2 LLM client configured for model ${modelName}. Inject a concrete LlmClient implementation.`
      );
    }
  };
}
