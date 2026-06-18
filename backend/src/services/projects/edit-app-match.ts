import { normalizeArtifactFileContent, unescapeJsonString } from "./artifact-file-content.js";

/**
 * Build a regex from `needle` where each whitespace run becomes `\s+`,
 * so indentation / newline differences are tolerated.
 * Returns the first match from `haystack` (the actual file text) or null.
 */
export function findWhitespaceNormalizedMatch(haystack: string, needle: string): string | null {
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Guard against catastrophic backtracking on very large inputs
  if (tokens.length > 500) return null;

  const pattern = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  try {
    const match = haystack.match(new RegExp(pattern));
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/**
 * Normalize all quote styles to ASCII double-quotes for comparison:
 *   - single quotes '
 *   - backtick template literals `
 *   - curly/smart quotes " " ' ' (from rich-text editors / copy-paste)
 */
function normalizeQuotes(s: string): string {
  return s.replace(/[''`\u201C\u201D\u2018\u2019]/g, '"');
}

/**
 * Resolve the actual text in `fileContent` that corresponds to the LLM's `oldString`.
 *
 * LLMs commonly produce old_string values that differ from the real file in
 * predictable ways. This function applies a chain of increasingly tolerant
 * fallback strategies. Each one targets a **general** editing mistake that
 * can happen with any React/Next.js app — not specific to any domain.
 *
 * Fallback chain:
 *   1. Exact match
 *   2. JSON-escape normalization  (streaming parser produces \\n, \\", etc.)
 *   3. Quote normalization        (single↔double↔backtick↔curly quotes)
 *   4. Case-insensitive match     (LLM capitalises differently)
 *   5. Whitespace-normalized      (indentation, newline, spacing drift)
 *   6. Combined normalizations    (unescape + whitespace, quotes + whitespace)
 *
 * Returns the actual substring from `fileContent` that should be replaced,
 * or null if no strategy found a match.
 */
export function resolveEditOldString(fileContent: string, oldString: string): string | null {
  // ── 0. Exact match ────────────────────────────────────────────────
  if (fileContent.includes(oldString)) return oldString;

  // ── 1. JSON-escape normalization ──────────────────────────────────
  // Streaming tool-call parsers sometimes produce \\n instead of real
  // newlines, or \\" instead of ". Try the full normalizer first (with
  // heuristic guards for double-encoding), then a direct unescape for
  // snippets the heuristic skips (CSS, plain HTML, short strings).
  const unescaped = normalizeArtifactFileContent(oldString);
  if (unescaped !== oldString && fileContent.includes(unescaped)) {
    return unescaped;
  }

  const directUnescaped = unescapeJsonString(oldString);
  if (directUnescaped !== oldString && directUnescaped !== unescaped && fileContent.includes(directUnescaped)) {
    return directUnescaped;
  }

  // ── 2. Quote normalization ────────────────────────────────────────
  // LLMs freely swap between quote styles:
  //   import X from 'react'  vs  "react"  vs  `react`
  //   className='p-4'        vs  "p-4"
  //   <h1>It's a title</h1>  vs  "It's a title"
  // Also handles curly/smart quotes from copy-pasted text.
  // normalizeQuotes is a 1-to-1 char replacement so lengths are preserved.
  const normFileQuotes = normalizeQuotes(fileContent);
  const normOldQuotes = normalizeQuotes(oldString);
  const qIdx = normFileQuotes.indexOf(normOldQuotes);
  if (qIdx >= 0) {
    return fileContent.slice(qIdx, qIdx + oldString.length);
  }

  // ── 3. Case-insensitive match ─────────────────────────────────────
  // LLMs sometimes capitalise CSS values, HTML tags, or variable names
  // differently (e.g. "Background" vs "background", "onClick" vs "onclick").
  const lowerContent = fileContent.toLowerCase();
  const lowerOld = oldString.toLowerCase();
  const caseIdx = lowerContent.indexOf(lowerOld);
  if (caseIdx >= 0) {
    return fileContent.slice(caseIdx, caseIdx + oldString.length);
  }

  // ── 4. Whitespace-normalized match ────────────────────────────────
  // The most common LLM drift: wrong indentation, collapsed multi-line
  // blocks into one line, extra blank lines, tabs vs spaces, etc.
  // Works for any file type — CSS, JSX, TSX, plain JS.
  const wsMatch = findWhitespaceNormalizedMatch(fileContent, oldString);
  if (wsMatch) return wsMatch;

  // ── 5. Combined normalizations ────────────────────────────────────
  // When multiple types of drift stack (e.g. JSON-escaped + wrong
  // whitespace, or wrong quotes + wrong whitespace).
  const candidates = new Set<string>();
  if (unescaped !== oldString) candidates.add(unescaped);
  if (directUnescaped !== oldString) candidates.add(directUnescaped);

  for (const candidate of candidates) {
    const wsCombined = findWhitespaceNormalizedMatch(fileContent, candidate);
    if (wsCombined) return wsCombined;
  }

  // quotes + whitespace: normalize quotes in the needle, then
  // whitespace-match against the quote-normalized file content,
  // mapping the result back to the original file text
  const wsQuote = findWhitespaceNormalizedMatch(normFileQuotes, normOldQuotes);
  if (wsQuote) {
    const wsIdx = normFileQuotes.indexOf(wsQuote);
    if (wsIdx >= 0) {
      return fileContent.slice(wsIdx, wsIdx + wsQuote.length);
    }
  }

  return null;
}
