// Build-time helpers for authoring lesson HTML.

export function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Strip a leading/trailing blank line and the common leading indentation,
// so code can be written naturally indented inside a template literal.
function dedent(raw) {
  let lines = raw.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indents = lines
    .filter((l) => l.trim().length)
    .map((l) => l.match(/^ */)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

// A fenced TypeScript code block, optionally with a file/path caption above it.
export function code(raw, caption) {
  const cap = caption ? `<div class="code-caption">${esc(caption)}</div>` : "";
  return `${cap}<pre><code>${esc(dedent(raw))}</code></pre>`;
}

// Convenience callout builders.
export function callout(kind, head, html) {
  return `<div class="callout ${kind}"><div class="callout-head">${head}</div>${html}</div>`;
}
export const py = (html) => callout("py", "🐍 Python analogy", html);
export const idiom = (html) => callout("idiom", "✓ Idiom &amp; best practice", html);
export const gotcha = (html) => callout("gotcha", "⚠ Gotcha", html);
export const cb = (html) => callout("codebase", "⛓ In the fjord codebase", html);
