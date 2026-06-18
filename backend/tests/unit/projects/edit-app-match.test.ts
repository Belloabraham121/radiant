import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findWhitespaceNormalizedMatch,
  resolveEditOldString,
} from "../../../src/services/projects/edit-app-match.js";

// ═══════════════════════════════════════════════════════════════════
// findWhitespaceNormalizedMatch — low-level whitespace tolerance
// ═══════════════════════════════════════════════════════════════════

describe("findWhitespaceNormalizedMatch", () => {
  it("returns null for empty needle", () => {
    assert.equal(findWhitespaceNormalizedMatch("hello world", ""), null);
    assert.equal(findWhitespaceNormalizedMatch("hello world", "   "), null);
  });

  it("matches despite different indentation", () => {
    const file = "html, body {\n  margin: 0;\n  background: #0b1020;\n}";
    const needle = "html, body {\nmargin: 0;\nbackground: #0b1020;\n}";
    const result = findWhitespaceNormalizedMatch(file, needle);
    assert.equal(result, file);
  });

  it("matches collapsed single-line against multi-line", () => {
    const file = "<div\n  className=\"p-4\"\n  onClick={handler}\n>";
    const needle = "<div className=\"p-4\" onClick={handler} >";
    const result = findWhitespaceNormalizedMatch(file, needle);
    assert.ok(result);
    assert.ok(file.includes(result));
  });

  it("matches tabs vs spaces", () => {
    const file = "function foo() {\n\treturn bar;\n}";
    const needle = "function foo() {\n  return bar;\n}";
    const result = findWhitespaceNormalizedMatch(file, needle);
    assert.ok(result);
  });

  it("returns null when content genuinely differs", () => {
    const file = "background: blue;";
    const needle = "background: red;";
    assert.equal(findWhitespaceNormalizedMatch(file, needle), null);
  });

  it("handles regex-special characters in needle", () => {
    const file = "if (a > 0 && b.match(/test/)) { return true; }";
    const needle = "if (a > 0 &&\n  b.match(/test/)) {\n  return true;\n}";
    const result = findWhitespaceNormalizedMatch(file, needle);
    assert.ok(result);
  });

  it("guards against extremely long tokens", () => {
    const longNeedle = Array(600).fill("x").join(" ");
    assert.equal(findWhitespaceNormalizedMatch("x x x", longNeedle), null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// resolveEditOldString — full fallback chain
// ═══════════════════════════════════════════════════════════════════

describe("resolveEditOldString", () => {

  // ── Exact match ─────────────────────────────────────────────────
  describe("exact match", () => {
    it("returns the string when found verbatim", () => {
      const file = "<h1>Hello World</h1>";
      assert.equal(resolveEditOldString(file, "<h1>Hello World</h1>"), "<h1>Hello World</h1>");
    });
  });

  // ── JSON-escape normalization ───────────────────────────────────
  describe("JSON-escape normalization", () => {
    it("resolves escaped newlines from streamed tool args", () => {
      const file = "function greet() {\n  return 'hi';\n}";
      const needle = "function greet() {\\n  return 'hi';\\n}";
      const result = resolveEditOldString(file, needle);
      assert.equal(result, file);
    });

    it("resolves escaped double-quotes in CSS font-family", () => {
      const file = 'font-family: "Segoe UI", sans-serif;';
      const needle = 'font-family: \\"Segoe UI\\", sans-serif;';
      const result = resolveEditOldString(file, needle);
      assert.equal(result, file);
    });

    it("resolves escaped quotes in JSX attributes", () => {
      const file = '<input placeholder="Enter your name" />';
      const needle = '<input placeholder=\\"Enter your name\\" />';
      const result = resolveEditOldString(file, needle);
      assert.equal(result, file);
    });
  });

  // ── Quote normalization ─────────────────────────────────────────
  describe("quote normalization", () => {
    it("resolves single vs double quotes in imports", () => {
      const file = "import { useState } from 'react';";
      const needle = 'import { useState } from "react";';
      assert.equal(resolveEditOldString(file, needle), "import { useState } from 'react';");
    });

    it("resolves backtick vs single-quote strings", () => {
      const file = "const title = `My Todo App`;";
      const needle = "const title = 'My Todo App';";
      const result = resolveEditOldString(file, needle);
      assert.ok(result);
      assert.ok(file.includes(result));
    });

    it("resolves curly/smart quotes from copy-paste", () => {
      const file = '<h1 className="text-xl">Welcome</h1>';
      const needle = '<h1 className=\u201Ctext-xl\u201D>Welcome</h1>';
      const result = resolveEditOldString(file, needle);
      assert.ok(result);
      assert.ok(file.includes(result));
    });

    it("resolves mixed quote styles in JSX props", () => {
      const file = "<Button variant='primary' size='lg'>Submit</Button>";
      const needle = '<Button variant="primary" size="lg">Submit</Button>';
      const result = resolveEditOldString(file, needle);
      assert.ok(result);
      assert.ok(file.includes(result));
    });
  });

  // ── Case-insensitive match ──────────────────────────────────────
  describe("case-insensitive match", () => {
    it("resolves different casing on CSS properties", () => {
      const file = "Background: #0b1020;";
      const needle = "background: #0b1020;";
      assert.equal(resolveEditOldString(file, needle), "Background: #0b1020;");
    });

    it("resolves different casing on HTML tags", () => {
      const file = "<DIV className='container'>content</DIV>";
      const needle = "<div className='container'>content</div>";
      const result = resolveEditOldString(file, needle);
      assert.ok(result);
    });
  });

  // ── Whitespace normalization ────────────────────────────────────
  describe("whitespace normalization", () => {
    it("resolves collapsed CSS block", () => {
      const file = [
        "html, body {",
        "  margin: 0;",
        "  padding: 0;",
        "  background: #0b1020;",
        "}",
      ].join("\n");
      const needle = "html, body { margin: 0; padding: 0; background: #0b1020; }";
      const result = resolveEditOldString(file, needle);
      assert.ok(result, "should find a match");
      assert.ok(file.includes(result));
    });

    it("resolves multi-line JSX collapsed to one line", () => {
      const file = '<button\n  data-radiant-id="submit"\n  className="bg-blue-500"\n  onClick={handleSubmit}>\n  Save\n</button>';
      const needle = '<button data-radiant-id="submit" className="bg-blue-500" onClick={handleSubmit}> Save </button>';
      const result = resolveEditOldString(file, needle);
      assert.ok(result, "should match despite whitespace differences");
    });

    it("resolves extra blank lines in component", () => {
      const file = "const [items, setItems] = useState([]);\n\nconst addItem = () => {";
      const needle = "const [items, setItems] = useState([]);\nconst addItem = () => {";
      const result = resolveEditOldString(file, needle);
      assert.ok(result);
    });
  });

  // ── Combined normalizations ─────────────────────────────────────
  describe("combined normalizations", () => {
    it("resolves unescape + whitespace together", () => {
      const file = 'html, body {\n  background: "#dark";\n}';
      const needle = 'html, body {\\n  background: \\"#dark\\";\\n}';
      assert.ok(resolveEditOldString(file, needle));
    });

    it("resolves quotes + whitespace together", () => {
      const file = "<input\n  type='text'\n  placeholder='Search...'\n/>";
      const needle = '<input type="text" placeholder="Search..." />';
      const result = resolveEditOldString(file, needle);
      assert.ok(result, "should match with quote + whitespace normalization");
    });
  });

  // ── No match (should return null) ───────────────────────────────
  describe("no false positives", () => {
    it("returns null when content is genuinely different", () => {
      assert.equal(resolveEditOldString("background: blue;", "color: red;"), null);
    });

    it("returns null when only some tokens match", () => {
      const file = '<h1 className="text-2xl font-bold">My App</h1>';
      const needle = '<h1 className="text-sm">Different App</h1>';
      assert.equal(resolveEditOldString(file, needle), null);
    });
  });

  // ── Real-world scenarios across app types ───────────────────────
  describe("real-world scenarios", () => {
    it("todo app: edit title with wrong whitespace", () => {
      const file = [
        '"use client";',
        "import { useState } from 'react';",
        "",
        "export default function TodoApp() {",
        "  return (",
        '    <div className="min-h-screen bg-gray-900 text-white p-8">',
        '      <h1 className="text-3xl font-bold mb-4">My Todos</h1>',
      ].join("\n");
      const needle = '<h1 className="text-3xl font-bold mb-4">My Todos</h1>';
      assert.ok(resolveEditOldString(file, needle));
    });

    it("fitness app: change background color", () => {
      const file = [
        "html, body {",
        "  margin: 0;",
        "  padding: 0;",
        "  font-family: Inter, sans-serif;",
        "  background: #1a1a2e;",
        "  color: #eee;",
        "}",
      ].join("\n");
      const needle = "background: #1a1a2e;";
      assert.equal(resolveEditOldString(file, needle), "background: #1a1a2e;");
    });

    it("notes app: edit a React component with wrong quotes", () => {
      const file = `export function NoteCard({ title, body }: { title: string; body: string }) {
  return (
    <div className='rounded-lg bg-gray-800 p-4'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      <p className='text-gray-400 mt-2'>{body}</p>
    </div>
  );
}`;
      const needle = `<div className="rounded-lg bg-gray-800 p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-gray-400 mt-2">{body}</p>
    </div>`;
      const result = resolveEditOldString(file, needle);
      assert.ok(result, "should resolve despite quote style differences");
    });

    it("general React: edit useState initializer with different formatting", () => {
      const file = "  const [count, setCount] = useState<number>(0);";
      const needle = "const [count, setCount] = useState<number>(0);";
      const result = resolveEditOldString(file, needle);
      assert.ok(result);
    });

    it("CSS: the exact error scenario from the user report", () => {
      const file = [
        '@import "tailwindcss";',
        "@tailwind base;",
        "@tailwind components;",
        "@tailwind utilities;",
        "",
        "html, body {",
        "  margin: 0;",
        "  padding: 0;",
        '  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        "  background: #0b1020;",
        "}",
        "",
        "* {",
        "  box-sizing: border-box;",
        "}",
      ].join("\n");
      assert.equal(
        resolveEditOldString(file, "background: #0b1020;"),
        "background: #0b1020;",
      );
    });
  });
});
