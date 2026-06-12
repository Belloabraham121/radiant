export type AgentToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type OpenAiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** Convert Radiant agent tool definitions to OpenAI Chat Completions tools format. */
export function toOpenAiTools(definitions: readonly AgentToolDefinition[]): OpenAiTool[] {
  return definitions.map((definition) => ({
    type: "function",
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.input_schema,
    },
  }));
}
