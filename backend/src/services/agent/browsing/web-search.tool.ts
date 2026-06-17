import { z } from "zod";
import { webSearch } from "./web-search.service.js";

export const WEB_SEARCH_TOOL_NAME = "web_search" as const;

const webSearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  count: z.number().int().min(1).max(10).optional(),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export const webSearchToolDefinition = {
  name: WEB_SEARCH_TOOL_NAME,
  description:
    "Search the web for real-time information. Returns a list of results with titles, URLs, and snippets. " +
    "Use when the user asks to research a topic, find current information, look up documentation, " +
    "check prices from non-DeFi sources, find news, or any question that needs up-to-date web data. " +
    "Follow up with browse_webpage to read the full content of a promising result.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The search query — be specific for better results.",
      },
      count: {
        type: "number",
        description: "Number of results to return (1-10, default 5).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export async function runWebSearchTool(
  privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const parsed = webSearchInputSchema.parse(input);
  return webSearch(parsed.query, parsed.count, privyUserId);
}
