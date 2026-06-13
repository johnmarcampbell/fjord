// Generates index.html + one HTML page per lesson from content.mjs.
// Run: node docs/typescript-lessons/build.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lessons } from "./content.mjs";
import { esc } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const LEVELS = [
  { key: "basic", label: "Basics" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
];
const LEVEL_LABEL = { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced" };

// ── sidebar, shared by every page ────────────────────────────────
function sidebar(activeSlug) {
  let html = `
  <aside class="sidebar">
    <a class="brand" href="index.html" style="text-decoration:none;color:inherit">
      <span class="logo">⛰️</span>
      <span>
        <div class="title">TypeScript by fjord</div>
        <div class="subtitle">Learn TS from a real codebase</div>
      </span>
    </a>
    <nav class="nav">
      <a class="lesson-link${activeSlug === "index" ? " active" : ""}" href="index.html">
        <span class="num">★</span><span>Overview &amp; the two lists</span>
      </a>`;

  for (const { key, label } of LEVELS) {
    html += `\n      <div class="nav-group-label">${label}</div>`;
    for (const lesson of lessons.filter((l) => l.level === key)) {
      const n = lessons.indexOf(lesson) + 1;
      const active = lesson.slug === activeSlug;
      html += `
      <a class="lesson-link${active ? " active" : ""}" href="${lesson.slug}.html">
        <span class="num">${n}</span><span>${esc(lesson.title)}</span>
      </a>`;
      // sub-toc only shown (via CSS) under the active lesson
      html += `\n      <div class="subtoc">`;
      for (const s of lesson.sections) {
        html += `<a href="${lesson.slug}.html#${s.id}">${esc(s.title)}</a>`;
      }
      html += `</div>`;
    }
  }
  html += `\n    </nav>\n  </aside>`;
  return html;
}

function shell({ slug, title, crumb, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · TypeScript by fjord</title>
  <link rel="stylesheet" href="assets/style.css" />
</head>
<body>
  <div class="layout">
    ${sidebar(slug)}
    <div class="content-wrap">
      <div style="flex:1 1 auto;min-width:0">
        <div class="topbar">
          <button class="icon-btn" data-toggle-nav title="Toggle contents (sidebar)">☰</button>
          <div class="crumb">${crumb}</div>
        </div>
        <main class="content">
${bodyHtml}
        </main>
      </div>
    </div>
  </div>
  <script src="assets/app.js"></script>
</body>
</html>
`;
}

// ── lesson pages ─────────────────────────────────────────────────
lessons.forEach((lesson, i) => {
  const n = i + 1;
  const prev = i > 0 ? lessons[i - 1] : null;
  const next = i < lessons.length - 1 ? lessons[i + 1] : null;

  const pager = `
<div class="pager">
  ${
    prev
      ? `<a class="prev" href="${prev.slug}.html"><div class="dir">← Previous</div><div class="lbl">${esc(prev.title)}</div></a>`
      : `<a class="prev disabled" href="index.html"><div class="dir">← Previous</div><div class="lbl">Overview</div></a>`
  }
  ${
    next
      ? `<a class="next" href="${next.slug}.html"><div class="dir">Next →</div><div class="lbl">${esc(next.title)}</div></a>`
      : `<a class="next disabled" href="index.html"><div class="dir">Next →</div><div class="lbl">You're done 🎉</div></a>`
  }
</div>`;

  const header = `
<div class="lesson-eyebrow">
  <span>Lesson ${n} of ${lessons.length}</span>
  <span class="badge ${lesson.level}">${LEVEL_LABEL[lesson.level]}</span>
</div>
<h1>${esc(lesson.title)}</h1>`;

  const body = header + "\n" + lesson.body + "\n" + pager;
  const crumb = `<b>Lesson ${n}</b> · ${esc(lesson.title)}`;
  writeFileSync(
    join(here, `${lesson.slug}.html`),
    shell({ slug: lesson.slug, title: lesson.title, crumb, bodyHtml: body }),
  );
});

// ── index page ───────────────────────────────────────────────────
function indexBody() {
  const startRows = lessons
    .map((l, i) => {
      return `<a class="start-row" href="${l.slug}.html">
        <span class="n">${i + 1}</span>
        <span class="meta">
          <span class="t">${esc(l.title)} <span class="badge ${l.level}" style="margin-left:.4rem">${LEVEL_LABEL[l.level]}</span></span>
          <span class="d">${esc(l.blurb)}</span>
        </span>
      </a>`;
    })
    .join("\n");

  return `
<div class="hero">
  <div class="lesson-eyebrow"><span>A guided course</span><span class="badge start">Start here</span></div>
  <h1>Learn TypeScript by reading fjord</h1>
  <p class="lede">A progressive course that teaches TypeScript using real code from this codebase as the examples — so you learn the language and the project at the same time. Built for someone who knows Python well and TypeScript not at all.</p>
</div>

<p>Work top to bottom: each lesson assumes the previous ones. Code samples are quoted verbatim from the repo with a <span class="fileref">file:line</span> caption so you can open the real thing alongside. Look for the coloured callouts:</p>
<ul>
  <li><strong style="color:var(--py)">🐍 Python analogy</strong> — the nearest idea you already know.</li>
  <li><strong style="color:var(--idiom)">✓ Idiom &amp; best practice</strong> — how good TypeScript is actually written.</li>
  <li><strong style="color:var(--gotcha)">⚠ Gotcha</strong> — the traps that bite newcomers.</li>
  <li><strong style="color:var(--accent)">⛓ In the fjord codebase</strong> — how the concept shows up here specifically.</li>
</ul>

<h2>The two lists this course braids together</h2>
<p>The lessons deliberately interleave two syllabuses: the TypeScript concepts a good developer needs, taught through the implementation details you need to work on fjord.</p>
<div class="two-cols">
  <div class="list-card">
    <h3>1 · TypeScript concepts</h3>
    <p style="color:var(--ink-muted);font-size:.85rem;margin-top:0">basic → intermediate → advanced</p>
    <ol>
      <li>The type system, strict mode, structural typing, inference</li>
      <li>Interfaces &amp; object shapes; optional vs nullable</li>
      <li>Union &amp; literal types</li>
      <li>Functions, <code>async</code>/<code>await</code>, <code>Promise&lt;T&gt;</code></li>
      <li><code>as const</code> &amp; deriving types from values</li>
      <li>Narrowing &amp; type guards</li>
      <li>Generics &amp; constraints</li>
      <li>Utility types (<code>Pick</code>, <code>Omit</code>, <code>Partial</code>…)</li>
      <li>Discriminated unions &amp; exhaustiveness</li>
      <li>Classes, custom errors, <code>unknown</code></li>
      <li>Modules, <code>import type</code>, the monorepo</li>
      <li><code>keyof</code>/indexed access, Zod, Drizzle inference, <code>satisfies</code></li>
      <li>React + TypeScript</li>
    </ol>
  </div>
  <div class="list-card">
    <h3>2 · fjord implementation details</h3>
    <p style="color:var(--ink-muted);font-size:.85rem;margin-top:0">used as the examples, left to right</p>
    <ul>
      <li>The shared workspace as the single source of truth</li>
      <li>The five fixed <code>Column</code>s, derived from <code>COLUMNS</code></li>
      <li>The <code>Task</code> model &amp; optimistic concurrency (<code>version</code>)</li>
      <li>Domain validation via the <code>Validated&lt;T,C&gt;</code> result type</li>
      <li>The blocking graph &amp; derived blocked state</li>
      <li>Config loading &amp; validation with Zod</li>
      <li>Drizzle schema &amp; inferred row types</li>
      <li>Typed domain errors → HTTP mapping</li>
      <li>The Task-mutation seam (<code>runTaskMutation</code>)</li>
      <li>The event bus &amp; <code>StreamEvent</code> union; SSE filtering</li>
      <li>The actor / auth model</li>
      <li>The frontend <code>api</code> wrapper &amp; <code>ApiError</code></li>
      <li>React Query, optimistic updates, context, <code>useTaskEditor</code></li>
    </ul>
  </div>
</div>

<h2>The lessons</h2>
<div class="start-grid">
${startRows}
</div>

<hr class="sep" />
<p style="color:var(--ink-muted);font-size:.9rem">Tip: the <strong>☰</strong> button (top-left) collapses the contents sidebar. On any lesson page the sidebar expands to show that lesson's sections, and they highlight as you scroll. This site is fully self-contained — no internet required.</p>
`;
}

writeFileSync(
  join(here, "index.html"),
  shell({ slug: "index", title: "Overview", crumb: `<b>TypeScript by fjord</b> · a guided course`, bodyHtml: indexBody() }),
);

console.log(`Built index.html + ${lessons.length} lesson pages in ${here}`);
