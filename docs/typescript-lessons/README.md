# TypeScript by fjord — a guided course

A self-contained set of HTML lessons that teach TypeScript (basics → intermediate
→ advanced) using **real code from this repository** as the worked examples. Built
for someone who knows Python well and TypeScript not at all.

## Read it

Open [`index.html`](index.html) in any browser — no server, no internet, no build
step required to read. Click through the lessons in order; the collapsible sidebar
(☰ button) is the table of contents and expands to show the current lesson's
sections, which highlight as you scroll.

## What's here

| File | Purpose |
| --- | --- |
| `index.html`, `NN-*.html` | The generated, ready-to-read lessons. |
| `content.mjs` | The lesson prose + code samples (the source you edit). |
| `build.mjs` | Wraps each lesson in the shared shell (sidebar, nav) and writes the HTML. |
| `helpers.mjs` | Authoring helpers (HTML-escaping, code blocks, callouts). |
| `assets/style.css` | All styling. |
| `assets/app.js` | Sidebar toggle, scroll-spy, and a tiny self-contained TS syntax highlighter. |

## Regenerate after editing `content.mjs`

```bash
node docs/typescript-lessons/build.mjs
```

This rewrites `index.html` and every `NN-*.html`. The HTML is committed so the
course is readable straight from the repo, but it is fully derived from
`content.mjs` — edit there, never the generated HTML.

## The two interleaved syllabuses

1. **TypeScript concepts** — the type system, interfaces, unions/literals,
   functions & async, `as const`, narrowing, generics, utility types,
   discriminated unions, classes & errors, modules, advanced boundary types
   (Zod/Drizzle/`satisfies`), and React + TypeScript.
2. **fjord implementation details** — used as the examples throughout: the shared
   workspace, the derived `Column` type, the `Task` model & optimistic
   concurrency, the `Validated<T,C>` result type, the blocking graph, Zod config,
   Drizzle inferred rows, typed-error→HTTP mapping, the `runTaskMutation` seam,
   the `StreamEvent` bus, the auth/actor model, the frontend `api` wrapper, and
   React Query / context / `useTaskEditor`.
