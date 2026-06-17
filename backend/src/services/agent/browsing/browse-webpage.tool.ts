import { z } from "zod";
import { browseWebpage } from "./browse-webpage.service.js";

export const BROWSE_WEBPAGE_TOOL_NAME = "browse_webpage" as const;

const browseWebpageInputSchema = z.object({
  url: z.string().url().max(2000),
});

export type BrowseWebpageInput = z.infer<typeof browseWebpageInputSchema>;

export const browseWebpageToolDefinition = {
  name: BROWSE_WEBPAGE_TOOL_NAME,
  description:
    "Fetch a webpage and extract its readable text content. " +
    "Use after web_search to read the full content of a result, or when the user shares a URL and asks about it. " +
    "Returns the page title and extracted text (HTML stripped, scripts/ads removed). " +
    "Best for articles, documentation, blog posts, and informational pages. " +
    "Not suitable for pages that require JavaScript rendering or authentication.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: "The full URL of the webpage to read (must start with http:// or https://).",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

export async function runBrowseWebpageTool(
  _privyUserId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const parsed = browseWebpageInputSchema.parse(input);
  return browseWebpage(parsed.url);
}
