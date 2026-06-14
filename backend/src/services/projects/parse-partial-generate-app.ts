export type PartialGenerateAppParse = {
  project_id?: string;
  name?: string;
  tagline?: string;
  template?: string;
  files: Array<{ path: string; content: string }>;
};

function unescapeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

/**
 * Best-effort parse of streaming / partial generate_app JSON tool arguments.
 */
export function parsePartialGenerateAppArgs(raw: string): PartialGenerateAppParse {
  const result: PartialGenerateAppParse = { files: [] };

  if (!raw.trim()) {
    return result;
  }

  try {
    const parsed = JSON.parse(raw) as PartialGenerateAppParse;
    if (Array.isArray(parsed.files)) {
      result.files = parsed.files.filter(
        (file) => typeof file?.path === "string" && typeof file?.content === "string",
      );
    }
    if (typeof parsed.name === "string") result.name = parsed.name;
    if (typeof parsed.tagline === "string") result.tagline = parsed.tagline;
    if (typeof parsed.project_id === "string") result.project_id = parsed.project_id;
    if (typeof parsed.template === "string") result.template = parsed.template;
    return result;
  } catch {
    // fall through to regex extraction
  }

  const nameMatch = raw.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (nameMatch) {
    result.name = unescapeJsonString(nameMatch[1]);
  }

  const taglineMatch = raw.match(/"tagline"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (taglineMatch) {
    result.tagline = unescapeJsonString(taglineMatch[1]);
  }

  const projectIdMatch = raw.match(/"project_id"\s*:\s*"([0-9a-f-]{36})"/i);
  if (projectIdMatch) {
    result.project_id = projectIdMatch[1];
  }

  const templateMatch = raw.match(/"template"\s*:\s*"([a-z_]+)"/);
  if (templateMatch) {
    result.template = templateMatch[1];
  }

  const fileRe =
    /"path"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"content"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = fileRe.exec(raw))) {
    result.files.push({
      path: unescapeJsonString(match[1]),
      content: unescapeJsonString(match[2]),
    });
  }

  return result;
}
