import * as cheerio from "cheerio";
import { AppError } from "../../../errors/app-error.js";
import { logger } from "../../../shared/logger.js";

export type BrowseWebpageOutput = {
  url: string;
  title: string;
  content: string;
  word_count: number;
};

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
]);

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_OUTPUT_CHARS = 8000;

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return BLOCKED_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".internal");
  } catch {
    return true;
  }
}

function extractReadableText($: cheerio.CheerioAPI): string {
  // Remove noise elements
  $("script, style, noscript, nav, footer, header, iframe, svg, [role='navigation'], [role='banner'], .sidebar, .nav, .footer, .header, .menu, .ad, .ads, .advertisement").remove();

  const blocks: string[] = [];

  // Extract from main content areas first, fall back to body
  const mainContent = $("main, article, [role='main'], .content, .post, .entry, #content, #main");
  const root = mainContent.length > 0 ? mainContent.first() : $("body");

  root.find("h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, pre, dd, dt, figcaption").each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length < 3) return;

    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "";
    if (tag.startsWith("h")) {
      blocks.push(`\n## ${text}\n`);
    } else {
      blocks.push(text);
    }
  });

  if (blocks.length === 0) {
    const bodyText = root.text().replace(/\s+/g, " ").trim();
    return bodyText;
  }

  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function browseWebpage(url: string): Promise<BrowseWebpageOutput> {
  if (isBlockedUrl(url)) {
    throw new AppError(400, "BLOCKED_URL", "Cannot browse internal or local URLs.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError(400, "INVALID_URL", `Invalid URL: ${url}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "INVALID_PROTOCOL", "Only http and https URLs are supported.");
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "RadiantBot/1.0 (compatible; research assistant)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new AppError(502, "FETCH_FAILED", `Page returned HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text")) {
      throw new AppError(400, "NOT_HTML", `Page is not HTML (Content-Type: ${contentType}). Use fetchExternal for API calls.`);
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      throw new AppError(400, "PAGE_TOO_LARGE", `Page is too large (${contentLength} bytes).`);
    }

    html = await res.text();
    if (html.length > MAX_BODY_BYTES) {
      html = html.slice(0, MAX_BODY_BYTES);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("browse_webpage fetch error", { url, error: msg });
    throw new AppError(502, "FETCH_FAILED", `Could not fetch page: ${msg}`);
  }

  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim() || parsed.hostname;

  let content = extractReadableText($);

  if (content.length > MAX_OUTPUT_CHARS) {
    content = content.slice(0, MAX_OUTPUT_CHARS) + "\n\n... (content truncated)";
  }

  const words = content.split(/\s+/).length;

  return { url, title, content, word_count: words };
}
