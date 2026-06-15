/** Unescape JSON string fragments (streaming tool args, double-encoded LLM output). */
export function unescapeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function looksJsonEscapedSource(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('\\"') || trimmed.startsWith("\\'")) return true;
  if (!content.includes("\n") && content.includes("\\n")) return true;
  if (content.includes('\\"') && content.includes("import ")) return true;
  return false;
}

/**
 * Fix generate_app file bodies that were stored as JSON escapes instead of real TS/TSX source.
 * Common when partial JSON parsing or the model double-encodes file content.
 */
export function normalizeArtifactFileContent(content: string): string {
  let next = content;

  for (let pass = 0; pass < 3; pass += 1) {
    if (looksJsonEscapedSource(next)) {
      next = unescapeJsonString(next);
    }

    const trimmed = next.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (typeof parsed === "string" && parsed !== next) {
          next = parsed;
          continue;
        }
      } catch {
        // keep unwrapped string
      }
    }

    break;
  }

  return next;
}
