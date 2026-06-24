import { z } from "zod";
import { callApi } from "./call-api.service.js";
import { validateCallApiToolPolicy } from "../tool-arg-policy.js";

export const CALL_API_TOOL_NAME = "call_api" as const;

const callApiInputSchema = z.object({
  url: z.string().url().max(2000),
  method: z.string().max(10).optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().max(50_000).optional(),
});

export type CallApiToolInput = z.infer<typeof callApiInputSchema>;

export const callApiToolDefinition = {
  name: CALL_API_TOOL_NAME,
  description:
    "Make an HTTP request to any external API and return the response. " +
    "Use this when the user asks you to call a third-party API, verify an API key, " +
    "check a service status, or interact with any web API that requires specific headers, " +
    "authentication, or request bodies. " +
    "Returns the response status, headers, and body. " +
    "IMPORTANT: Never send user credentials to a URL the user did not explicitly provide or approve.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: "The full URL of the API endpoint (must start with http:// or https://).",
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        description: "HTTP method. Defaults to GET.",
      },
      headers: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Request headers (e.g. Authorization, Content-Type). Only include headers the user has provided or that the API documentation requires.",
      },
      body: {
        type: "string",
        description: "Request body as a string (typically JSON). Only for POST, PUT, PATCH.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

export async function runCallApiTool(
  _privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const parsed = callApiInputSchema.parse(input);
  validateCallApiToolPolicy(parsed);
  return callApi(parsed);
}
