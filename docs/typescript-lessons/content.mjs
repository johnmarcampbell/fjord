import { code, py, idiom, gotcha, cb } from "./helpers.mjs";

// Each lesson: { slug, title, level, blurb, sections:[{id,title}], body }
// `level` drives grouping + the difficulty badge.

export const lessons = [
  /* ════════════════════════════════════════════════════════════════
     1 · WHY TYPESCRIPT
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "01-why-typescript",
    title: "Why TypeScript exists",
    level: "basic",
    blurb: "Static types over JavaScript, structural typing, inference, and the all-important fact that types vanish at runtime.",
    sections: [
      { id: "what", title: "What TypeScript is" },
      { id: "structural", title: "Structural ('duck') typing" },
      { id: "inference", title: "Inference: you annotate less than you think" },
      { id: "strict", title: "Strict mode — how fjord is configured" },
      { id: "erased", title: "Types are erased at runtime" },
      { id: "build", title: "The build & the three workspaces" },
    ],
    body: `
<p class="lede">You already know Python's type hints. TypeScript is what happens when a type system stops being optional documentation and becomes a compiler that refuses to ship broken code.</p>

<h2 id="what">What TypeScript is<a class="anchor" href="#what">#</a></h2>
<p>TypeScript (TS) is JavaScript (JS) plus a static type system. You write <code>.ts</code> / <code>.tsx</code> files, a compiler (<code>tsc</code>) checks the types, and what comes out the other end is ordinary JavaScript with every type annotation deleted. The browser and Node never see a single type.</p>
<p>That last point is the whole mental model, so hold onto it: <strong>types are a compile-time conversation between you and the compiler.</strong> At runtime they're gone.</p>

${py(`
<p>Python type hints (<code>def f(x: int) -> str:</code>) are <em>also</em> erased — they live in <code>__annotations__</code> and are ignored by the interpreter unless a tool like <code>mypy</code> or <code>pydantic</code> looks at them. TypeScript is like running <code>mypy</code> on every save, with <code>--strict</code>, and <em>refusing to build</em> if it fails. The difference is enforcement, not concept.</p>
`)}

<h2 id="structural">Structural ("duck") typing<a class="anchor" href="#structural">#</a></h2>
<p>TypeScript checks types by <em>shape</em>, not by name. If a value has the right properties, it fits — it doesn't matter what you "declared" it as. This is duck typing, but verified before the program runs.</p>
${code(`
interface User {
  id: string;
  handle: string;
}

// This object was never "declared" a User, but it has the right shape,
// so it is accepted everywhere a User is expected.
function greet(u: User) {
  return \`hello @\${u.handle}\`;
}

greet({ id: "u1", handle: "jane", extra: true });
//     └─ a plain object literal — structurally a User
`)}

${py(`
<p>This is exactly Python's "if it walks like a duck" — except the duck-check happens at compile time. It's closer to <code>typing.Protocol</code> (structural) than to nominal <code>isinstance</code> checks against a concrete class.</p>
`)}

<h2 id="inference">Inference: you annotate less than you think<a class="anchor" href="#inference">#</a></h2>
<p>You do <em>not</em> annotate every variable. The compiler infers types from the values you assign and the functions you call. Good TypeScript annotates <strong>boundaries</strong> (function parameters, public return types, exported data shapes) and lets inference handle the interior.</p>
${code(`
const handle = "jane";          // inferred: string
const columns = 5;              // inferred: number
const ids = ["u1", "u2"];       // inferred: string[]

// Annotate the boundary (the parameter), let the body infer the rest:
function initials(name: string) {
  const parts = name.split(" "); // inferred: string[]
  return parts.map((p) => p[0]).join("");
}
`)}
${idiom(`
<p>Annotate function <strong>parameters</strong> and <strong>exported</strong> values. Let local variables infer. Over-annotating (<code>const x: string = "a"</code>) is noise that the reviewer's eye learns to skip — and it can <em>hide</em> bugs by overriding a more precise inferred type.</p>
`)}

<h2 id="strict">Strict mode — how fjord is configured<a class="anchor" href="#strict">#</a></h2>
<p>Every workspace in fjord inherits one root config. This is the single most important file for understanding the rules the compiler will hold you to:</p>
${code(`
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,                         // ← the big one
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,                  // unused variable = build error
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
`, "tsconfig.base.json")}
<p><code>"strict": true</code> turns on a bundle of checks. The two you'll feel daily:</p>
<ul>
  <li><strong><code>strictNullChecks</code></strong> — <code>null</code> and <code>undefined</code> are not silently part of every type. If a value can be <code>null</code>, the type must say so (<code>string | null</code>), and you must handle it. This single rule eliminates an entire category of "cannot read property of null" crashes.</li>
  <li><strong><code>noImplicitAny</code></strong> — a parameter the compiler can't infer a type for is an error, not a silent <code>any</code> (the "anything goes, checks off" escape hatch).</li>
</ul>
${gotcha(`
<p><code>noUnusedLocals</code> and <code>noUnusedParameters</code> mean an imported-but-unused symbol or a leftover variable <em>fails the build</em>, not just lints. Coming from Python where unused imports are a style nit, this surprises people. Delete dead code as you go.</p>
`)}

<h2 id="erased">Types are erased at runtime<a class="anchor" href="#erased">#</a></h2>
<p>Because types disappear, you <em>cannot</em> trust them at the edges of your program — anything crossing the wire (HTTP bodies, env vars, the database) is <code>unknown</code> until something <em>at runtime</em> checks it. TypeScript can't validate a JSON payload for you; the type annotation is a promise <em>you</em> made, not one the runtime keeps.</p>
<p>This is why fjord uses <strong>Zod</strong> to validate environment variables and <strong>Drizzle</strong> to model the database — they bridge the runtime world back into the type world. We'll meet both later. For now, just internalize: <em>a type assertion is not a runtime check.</em></p>

<h2 id="build">The build & the three workspaces<a class="anchor" href="#build">#</a></h2>
<p>fjord is a single repo with three npm <em>workspaces</em> under one <code>package.json</code>:</p>
<ul>
  <li><span class="fileref">shared/</span> — types &amp; constants used by both sides (<code>Task</code>, <code>User</code>, <code>Column</code>, request/response shapes). The single source of truth.</li>
  <li><span class="fileref">backend/</span> — Node 24, Fastify, Drizzle, <code>node:sqlite</code>.</li>
  <li><span class="fileref">frontend/</span> — React 18, Vite, React Query.</li>
</ul>
<p><code>npm run build</code> compiles <code>shared</code> first (the others depend on it), then frontend, then backend. The frontend imports backend-shared types by the package name <code>@fjord/shared</code> — never by reaching across folders. That import boundary is what lets one <code>Task</code> definition keep the client and server honest with each other.</p>
${cb(`
<p>When you change an API response shape, you change it in <span class="fileref">shared/src/index.ts</span> <em>once</em>. The backend route that builds the response and the frontend component that renders it will both fail to compile until they match the new shape. That compile error is the feature.</p>
`)}
`,
  },

  /* ════════════════════════════════════════════════════════════════
     2 · INTERFACES & OBJECT TYPES
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "02-interfaces",
    title: "Interfaces & object shapes",
    level: "basic",
    blurb: "Describing the shape of data with interfaces — optional fields, nullability, readonly, and extends. The Task and User models.",
    sections: [
      { id: "interface", title: "The interface keyword" },
      { id: "optional", title: "Optional vs nullable (? vs | null)" },
      { id: "task", title: "Reading a real model: Task" },
      { id: "extends", title: "Composition with extends" },
      { id: "type-vs-interface", title: "interface vs type" },
      { id: "readonly", title: "readonly & immutability" },
    ],
    body: `
<p class="lede">Most of what you'll read in this codebase is data-shaped: a task, a user, a request body. An <code>interface</code> is how TypeScript writes down that shape.</p>

<h2 id="interface">The <code>interface</code> keyword<a class="anchor" href="#interface">#</a></h2>
${code(`
export type UserKind = "human" | "agent";
export type Role = "Admin" | "Member";

export interface User {
  id: string;
  display_name: string;
  handle: string;
  kind: UserKind;       // a field can be another named type
  role: Role;
  title: string;
  bio: string;
  avatar: string;
  created_at: string;
  deleted_at: string | null;
}
`, "shared/src/index.ts:15")}
<p>Each line is <code>name: Type</code>. An interface is purely a compile-time description — it produces <em>no</em> JavaScript. It's a contract: "any value typed <code>User</code> has exactly these properties with these types."</p>

${py(`
<p>The closest Python analogues are <code>TypedDict</code> (a dict with a known set of keys/types) and <code>@dataclass</code> (a class with typed fields). An <code>interface</code> is most like <code>TypedDict</code>: it describes a plain object's keys, but generates no constructor and no runtime class.</p>
${code(`# Python
from typing import TypedDict, Literal, Optional

class User(TypedDict):
    id: str
    handle: str
    kind: Literal["human", "agent"]
    deleted_at: Optional[str]   # str | None`)}
`)}

<h2 id="optional">Optional vs nullable — <code>?</code> is not <code>| null</code><a class="anchor" href="#optional">#</a></h2>
<p>This distinction trips up newcomers and matters a lot in this codebase:</p>
<ul>
  <li><strong><code>field?: T</code></strong> — the key <em>may be absent entirely</em>. Its type is <code>T | undefined</code>.</li>
  <li><strong><code>field: T | null</code></strong> — the key is <em>always present</em>, but its value may be <code>null</code>.</li>
</ul>
<p>fjord uses both deliberately. Compare a <em>create request</em> (fields you may omit) with the stored <em>model</em> (every field present, some explicitly null):</p>
${code(`
export interface CreateUserRequest {
  id: string;
  display_name: string;
  kind: UserKind;
  role?: Role;        // optional — omit it and the server defaults to "Member"
  handle?: string;    // optional — derived from display_name if absent
  title?: string;
  bio?: string;
  avatar?: string;
}
`, "shared/src/index.ts:125")}
<p>Versus the <code>User</code> model above, where <code>deleted_at: string | null</code> is <em>always there</em> — it's <code>null</code> for a live user and a timestamp for a soft-deleted one. The presence of the key is part of the data model; the create request, by contrast, is "here are the bits I'm giving you."</p>
${idiom(`
<p>Rule of thumb in fjord: <strong>request/input types use <code>?</code></strong> (the caller may not supply a field), while <strong>stored models use <code>| null</code></strong> (the field exists; its value is sometimes empty). Mixing these up produces confusing APIs where "did the caller mean to clear this, or just not mention it?" becomes ambiguous.</p>
`)}

<h2 id="task">Reading a real model: <code>Task</code><a class="anchor" href="#task">#</a></h2>
<p>Here's the central data structure of the whole app. You can read it top to bottom now:</p>
${code(`
export interface Task {
  id: string;
  title: string;
  description: string;
  column: Column;            // one of the five fixed columns (next lesson)
  position: number;
  reported_by: string;       // a User id
  assigned_to: string | null;// nullable: a task can be unassigned
  due_at: string | null;
  project_id: string | null;
  space_id: string;
  tags: string[];            // an array of strings
  created_at: string;
  updated_at: string;
  version: number;           // optimistic-concurrency counter (lesson 3 & 13)
  archived: boolean;
  archived_at: string | null;
  blocked_by: string[];      // task ids that block this one
  blocking: string[];        // task ids this one blocks
  comment_count: number;
  journal_count: number;
}
`, "shared/src/index.ts:69")}
<p>Notice the vocabulary already paying off: <code>string[]</code> is "array of string", <code>X | null</code> is "X or null", <code>Column</code> is a named type we'll define next lesson. Nothing here is mysterious once you can read the shapes.</p>

<h2 id="extends">Composition with <code>extends</code><a class="anchor" href="#extends">#</a></h2>
<p>An interface can build on another, inheriting all its fields and adding more:</p>
${code(`
export interface CreateApiTokenResponse extends ApiTokenSummary {
  // everything ApiTokenSummary has, plus:
  /** Plaintext token. Returned exactly once; never readable again. */
  token: string;
}
`, "shared/src/index.ts:164")}
<p>This models the real rule precisely: listing a token gives you the <em>summary</em>; <em>creating</em> one gives you the summary <strong>plus</strong> the one-time plaintext. The type encodes the policy.</p>

<h2 id="type-vs-interface"><code>interface</code> vs <code>type</code><a class="anchor" href="#type-vs-interface">#</a></h2>
<p>You'll see both <code>interface User {…}</code> and <code>type Column = …</code>. They overlap a lot. The practical split this codebase follows:</p>
<ul>
  <li><strong><code>interface</code></strong> for object shapes you might extend (<code>User</code>, <code>Task</code>, request/response bodies).</li>
  <li><strong><code>type</code></strong> for everything an interface can't express: unions (<code>"human" | "agent"</code>), function types, generics over unions, tuples, and "derived" types like <code>(typeof COLUMNS)[number]</code> (lesson 5).</li>
</ul>
${idiom(`
<p>When either works for an object shape, prefer <code>interface</code> — its error messages are nicer and it supports declaration merging. Reach for <code>type</code> the moment you need a union or a computed/derived type. That's the convention you'll see throughout <span class="fileref">shared/src/index.ts</span>.</p>
`)}

<h2 id="readonly"><code>readonly</code> &amp; immutability<a class="anchor" href="#readonly">#</a></h2>
<p>Prefix a field with <code>readonly</code> to forbid reassignment after construction, or use <code>readonly T[]</code> / <code>ReadonlyArray&lt;T&gt;</code> for arrays that can't be mutated. fjord uses this for constants that must never be edited:</p>
${code(`
export const RESERVED_HANDLES: readonly string[] = [
  "me", "admin", "system", "api", "app", "root",
  "support", "help", "fjord", "agent",
  "user", "users", "openclaw",
] as const;
`, "shared/src/index.ts:198")}
<p><code>readonly</code> is compile-time only (like everything else, it's erased) — it won't <code>Object.freeze</code> anything at runtime. It just makes the compiler reject <code>RESERVED_HANDLES.push(…)</code>. We'll unpack that trailing <code>as const</code> in lesson 5; it's doing something subtle and powerful.</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     3 · UNIONS & LITERAL TYPES
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "03-unions-literals",
    title: "Union & literal types",
    level: "basic",
    blurb: "The feature that makes TypeScript feel different from everything else: types built from specific values, combined with |.",
    sections: [
      { id: "literals", title: "Literal types" },
      { id: "unions", title: "Unions with |" },
      { id: "fixed-columns", title: "Modelling the five fixed columns" },
      { id: "null-unions", title: "Unions with null" },
      { id: "why", title: "Why this beats string constants" },
    ],
    body: `
<p class="lede">If you learn one thing that makes TypeScript click, it's this: a type can be a <em>specific value</em>, and you can OR types together with <code>|</code>. Whole categories of bug disappear.</p>

<h2 id="literals">Literal types<a class="anchor" href="#literals">#</a></h2>
<p>A type doesn't have to be "some string". It can be <em>the exact string</em> <code>"Admin"</code>. That's a <strong>literal type</strong> — a type with exactly one value:</p>
${code(`
type Role = "Admin";       // the ONLY value this type allows is "Admin"
const r: Role = "Admin";   // ok
// const r: Role = "admin"; // ✗ Type '"admin"' is not assignable to type '"Admin"'
`)}
<p>On its own that's a curiosity. Combined with unions, it's transformative.</p>

<h2 id="unions">Unions with <code>|</code><a class="anchor" href="#unions">#</a></h2>
<p>A <strong>union</strong> type is "one of these". Read <code>|</code> as "or":</p>
${code(`
export type UserKind = "human" | "agent";
export type Role = "Admin" | "Member";
`, "shared/src/index.ts:11")}
<p>A <code>UserKind</code> is <em>either</em> the string <code>"human"</code> or the string <code>"agent"</code> — and nothing else. Pass <code>"robot"</code> and the build fails. Your editor autocompletes the two valid options. There is no separate enum class to import, no constant to typo.</p>

${py(`
<p>This is Python's <code>Literal["human", "agent"]</code> from <code>typing</code>, or an <code>enum.Enum</code> — but more ergonomic. In Python you'd often reach for an <code>Enum</code> class and write <code>UserKind.HUMAN</code>; in TS the <em>string itself</em> is the value, so you just write <code>"human"</code> and the type system guarantees it's valid. No import, no <code>.value</code>.</p>
`)}

<h2 id="fixed-columns">Modelling the five fixed columns<a class="anchor" href="#fixed-columns">#</a></h2>
<p>fjord's columns are a fixed set — a core product constraint ("configurable columns: not supported"). The type makes that constraint <em>unbreakable</em>:</p>
${code(`
export type Column = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done";
`)}
<p>Now <code>Task.column</code> is typed <code>Column</code>. A typo like <code>"In progress"</code> (lowercase p) won't compile. A function that handles columns can be checked for handling <em>all five</em> (we'll see exhaustiveness in lesson 9). And your editor offers the five options as you type.</p>
${cb(`
<p>In reality fjord doesn't hand-write that union — it <em>derives</em> it from the <code>COLUMNS</code> array so the list and the type can never drift apart. That's lesson 5. But the resulting <code>Column</code> type is exactly the five-way union above.</p>
`)}

<h2 id="null-unions">Unions with <code>null</code><a class="anchor" href="#null-unions">#</a></h2>
<p>You've already seen the most common union in the codebase: a real type OR <code>null</code>.</p>
${code(`
assigned_to: string | null;   // a user id, or null when unassigned
due_at: string | null;        // an ISO date, or null when no due date
`)}
<p>Under <code>strictNullChecks</code> (which fjord has on), this is enforced: if a field is <code>string | null</code>, you <em>cannot</em> call <code>.toUpperCase()</code> on it until you've proven it isn't null. The compiler forces the null-check. That's the next lesson — narrowing.</p>

${gotcha(`
<p>TypeScript has <em>two</em> "empty" values: <code>null</code> and <code>undefined</code>. They're distinct types. fjord leans on <code>null</code> for "intentionally absent" stored values and <code>undefined</code> for "not provided / optional" (the <code>?</code> from lesson 2). Don't assume they're interchangeable — <code>string | null</code> will reject <code>undefined</code>.</p>
`)}

<h2 id="why">Why this beats string constants<a class="anchor" href="#why">#</a></h2>
<p>In dynamically-typed code you'd guard against bad column names with runtime checks, tests, and hope. With literal unions the guarantee moves to compile time and costs nothing at runtime. The set of valid values <em>is</em> the type. This idea — types as precise sets of allowed values — underpins the discriminated unions, the domain error codes, and the event kinds you'll meet throughout fjord.</p>
${code(`
export type DomainErrorCode =
  | "handle_invalid" | "handle_reserved" | "handle_taken"
  | "avatar_invalid" | "set_password_required" | "version_conflict"
  | "subsequent_activity" | "edit_window_expired";
`)}
<p>Every error the domain can raise, enumerated as a type. A route that returns <code>code: "verison_conflict"</code> (typo) won't compile. That's the payoff.</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     4 · FUNCTIONS, ASYNC & PROMISES
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "04-functions-async",
    title: "Functions, async & Promises",
    level: "basic",
    blurb: "Typing parameters and return values, default params, void/never, and the async/await + Promise<T> model that runs the backend.",
    sections: [
      { id: "params", title: "Typing parameters & returns" },
      { id: "defaults", title: "Optional & default parameters" },
      { id: "void-never", title: "void and never" },
      { id: "promises", title: "Promise<T>, async & await" },
      { id: "fn-types", title: "Functions as values (callback types)" },
    ],
    body: `
<p class="lede">Functions are where you'll spend most of your annotation effort: type the inputs, type the output, let the body infer itself.</p>

<h2 id="params">Typing parameters &amp; returns<a class="anchor" href="#params">#</a></h2>
${code(`
// (param: Type, …): ReturnType
export function canAccessSpace(actor: Actor, spaceId: string): boolean {
  if (actor.accessibleSpaceIds === "all") return true;
  return actor.accessibleSpaceIds.has(spaceId);
}
`, "backend/src/auth/policy.ts:4")}
<p>Parameters <em>must</em> be annotated (the compiler can't guess them under <code>noImplicitAny</code>). The return type — <code>: boolean</code> here — is optional because TS can infer it, but writing it on exported functions is a good habit: it documents intent and catches mistakes <em>inside</em> the function rather than at every call site.</p>

${py(`
<p>Identical idea to Python: <code>def can_access_space(actor: Actor, space_id: str) -&gt; bool:</code>. The arrow becomes a colon (<code>-&gt;</code> → <code>:</code>), and the rules are enforced by the compiler instead of an optional checker.</p>
`)}

<h2 id="defaults">Optional &amp; default parameters<a class="anchor" href="#defaults">#</a></h2>
${code(`
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,   // default value
  overrides: LoadConfigOverrides = {},    // default value
): Config {
  const parsed = EnvSchema.parse(env);
  // …
}
`, "backend/src/config.ts:45")}
<p>A parameter with <code>= value</code> is optional and falls back to that value when the caller omits it — exactly like Python's <code>def f(env=os.environ):</code>. You can also mark a param optional with <code>?</code> (making it <code>T | undefined</code>) when there's no sensible default.</p>

<h2 id="void-never"><code>void</code> and <code>never</code><a class="anchor" href="#void-never">#</a></h2>
<ul>
  <li><strong><code>void</code></strong> — "returns nothing useful". The function runs for its side effects.</li>
  <li><strong><code>never</code></strong> — "never returns at all" (always throws, or loops forever). You'll meet <code>never</code> again in lesson 9 as the secret behind exhaustiveness checking.</li>
</ul>
${code(`
publish(event: StreamEvent): void {
  this.emitter.emit(EVENT_NAME, event);   // side effect, no return value
}
`, "backend/src/event_bus.ts:12")}

<h2 id="promises"><code>Promise&lt;T&gt;</code>, <code>async</code> &amp; <code>await</code><a class="anchor" href="#promises">#</a></h2>
<p>Anything asynchronous in JS/TS returns a <strong>Promise</strong> — a placeholder for a value that will exist later. <code>Promise&lt;T&gt;</code> reads "a promise that will resolve to a <code>T</code>". An <code>async</code> function <em>always</em> returns a Promise; <code>await</code> unwraps one.</p>
${code(`
export async function hashPassword(plaintext: string): Promise&lt;string&gt; {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  const salt = randomBytes(SALT_BYTES);
  // await unwraps Promise&lt;Buffer&gt; into Buffer:
  const derived = await scrypt(plaintext, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return \`scrypt$N=\${N},r=\${R},p=\${P}$\${salt.toString("base64")}$\${derived.toString("base64")}\`;
}
`, "backend/src/services/passwords.ts:19")}
<p>Read the signature as a contract: "give me a string, I'll eventually give you back a string (the hash)." Because the function is <code>async</code>, callers must <code>await hashPassword(pw)</code> (or <code>.then(…)</code>) to get the string out.</p>

${py(`
<p>This is Python's <code>async def</code> / <code>await</code> almost verbatim. <code>async def hash_password(pw: str) -&gt; str:</code> returns a coroutine you must <code>await</code>; <code>Promise&lt;str&gt;</code> is the JS coroutine result. One nuance: in JS an <code>async</code> function's declared return type is the <em>resolved</em> type wrapped in <code>Promise&lt;…&gt;</code>, so you write <code>Promise&lt;string&gt;</code>, not <code>string</code>.</p>
`)}

${gotcha(`
<p>Forgetting <code>await</code> is the #1 async bug. <code>const h = hashPassword(pw)</code> gives you a <em>Promise object</em>, not the hash — and TypeScript will usually catch it because the types won't line up (<code>Promise&lt;string&gt;</code> isn't a <code>string</code>). Let the red squiggle save you.</p>
`)}

<h2 id="fn-types">Functions as values (callback types)<a class="anchor" href="#fn-types">#</a></h2>
<p>Functions are values you can pass around, and their types are written with a fat arrow <code>(args) =&gt; ReturnType</code>. fjord's event bus takes a <em>listener function</em> and returns an <em>unsubscribe function</em>:</p>
${code(`
//          param is a function …            … and the return value is ALSO a function
subscribe(listener: (event: StreamEvent) =&gt; void): () =&gt; void {
  this.emitter.on(EVENT_NAME, safe);
  return () =&gt; this.emitter.off(EVENT_NAME, safe);  // call this to unsubscribe
}
`, "backend/src/event_bus.ts:17")}
<p>Read <code>(event: StreamEvent) =&gt; void</code> as "a function taking a <code>StreamEvent</code>, returning nothing", and <code>() =&gt; void</code> as "a function taking nothing, returning nothing". This "subscribe returns its own cleanup" pattern is everywhere in JS — you'll see the identical shape in React's <code>useEffect</code> in lesson 13.</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     5 · AS CONST & DERIVING TYPES
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "05-as-const",
    title: "as const & deriving types from values",
    level: "intermediate",
    blurb: "The single-source-of-truth trick: write the list of values once, derive the type from it automatically. typeof and indexed access.",
    sections: [
      { id: "problem", title: "The drift problem" },
      { id: "as-const", title: "What as const does" },
      { id: "typeof", title: "typeof: from a value to its type" },
      { id: "indexed", title: "Indexed access: [number]" },
      { id: "payoff", title: "The payoff across the codebase" },
    ],
    body: `
<p class="lede">In lesson 3 I showed <code>Column</code> as a hand-written union. fjord doesn't actually write it twice. This lesson is the trick that keeps a runtime list and its compile-time type permanently in sync.</p>

<h2 id="problem">The drift problem<a class="anchor" href="#problem">#</a></h2>
<p>You often need a value <em>and</em> a type for the same set. The columns must exist at runtime (to render them, iterate them) <em>and</em> as a type (to constrain <code>Task.column</code>). Write them twice and they'll eventually drift — someone adds <code>"Blocked"</code> to the array but forgets the union, and now you have a runtime/type mismatch that the compiler can't see.</p>
<p>The fix: write the values once, and <em>derive</em> the type from them.</p>

<h2 id="as-const">What <code>as const</code> does<a class="anchor" href="#as-const">#</a></h2>
${code(`
export const COLUMNS = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Done",
] as const;
`, "shared/src/index.ts:1")}
<p>Without <code>as const</code>, TypeScript infers <code>COLUMNS</code> as <code>string[]</code> — a mutable array of <em>any</em> strings. That throws away exactly the information we want. <code>as const</code> tells the compiler: "treat this literally and make it deeply immutable." The inferred type becomes:</p>
${code(`
readonly ["Backlog", "To Do", "In Progress", "In Review", "Done"]
//  ↑ a readonly tuple of the EXACT string literals — not string[]
`)}
<p>Now the compiler knows the precise values <em>and</em> that the array can't be mutated.</p>

<h2 id="typeof"><code>typeof</code>: from a value back to its type<a class="anchor" href="#typeof">#</a></h2>
<p>TypeScript has a <code>typeof</code> operator that works <em>in type positions</em> — it takes a runtime value and gives you its static type. (This is a different <code>typeof</code> from the JavaScript runtime one; context decides which.)</p>
${code(`
type ColumnsTuple = typeof COLUMNS;
//   = readonly ["Backlog", "To Do", "In Progress", "In Review", "Done"]
`)}

<h2 id="indexed">Indexed access: <code>[number]</code><a class="anchor" href="#indexed">#</a></h2>
<p>You can index <em>into</em> a type the way you'd index into a value. <code>Tuple[0]</code> is the type of the first element; <code>Tuple[number]</code> means "the type at <em>any</em> numeric index" — which, for our tuple, is the union of every element:</p>
${code(`
export type Column = (typeof COLUMNS)[number];
//   = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done"
`, "shared/src/index.ts:9")}
<p>Read it inside-out: <code>typeof COLUMNS</code> (the tuple type) <code>[number]</code> (every element's type, unioned). One line, and <code>Column</code> is guaranteed to be exactly the array's contents. Add <code>"Blocked"</code> to the array and the <code>Column</code> type grows automatically — and now every <code>switch</code> that was exhaustive becomes a compile error until you handle the new case. That's the dream.</p>

${py(`
<p>Python has no real equivalent — its type system can't compute a <code>Literal</code> union from a runtime list. The nearest mindset is an <code>Enum</code>, where the members are the single source of truth, but you'd still reference them as <code>Column.DONE</code> rather than getting a plain-string union for free. This derive-the-type-from-the-value pattern is genuinely a TypeScript superpower with no Python twin.</p>
`)}

<h2 id="payoff">The payoff across the codebase<a class="anchor" href="#payoff">#</a></h2>
<p>fjord uses this exact pattern for every closed set of strings:</p>
${code(`
export const EVENT_KINDS = [
  "comment", "journal_entry", "task_created", "column_changed",
  "assigned_to_changed", "reported_by_changed", "due_date_changed",
  "blocker_added", "blocker_removed", "project_changed",
  "space_changed", "tags_changed", "task_archived", "task_unarchived",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const DOMAIN_ERROR_CODES = [ /* … */ ] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];
`, "shared/src/index.ts:92")}
<p>The array is used at runtime (to validate incoming <code>?kind=</code> filters); the type is used everywhere a kind is referenced. They can't disagree. And because the array exists at runtime, a route can build a fast lookup from it:</p>
${code(`
const KNOWN_EVENT_KINDS: ReadonlySet&lt;EventKind&gt; = new Set(EVENT_KINDS);
`, "backend/src/routes/tasks.ts:48")}
${idiom(`
<p>Whenever you have "a fixed set of strings I need both at runtime and as a type", reach for <code>const X = [...] as const</code> + <code>type T = (typeof X)[number]</code>. It's the most fjord-idiomatic pattern in the repo. Hand-writing the union next to the array is a code smell.</p>
`)}
`,
  },

  /* ════════════════════════════════════════════════════════════════
     6 · NARROWING & TYPE GUARDS
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "06-narrowing",
    title: "Narrowing & type guards",
    level: "intermediate",
    blurb: "How TypeScript follows your control flow to turn 'string | null' into 'string'. Truthiness, typeof, instanceof, in, custom guards, and the ! escape hatch.",
    sections: [
      { id: "what", title: "What narrowing is" },
      { id: "truthiness", title: "Truthiness & null checks" },
      { id: "in", title: "The in operator" },
      { id: "instanceof", title: "instanceof for classes" },
      { id: "guards", title: "User-defined type guards (x is T)" },
      { id: "bang", title: "The non-null assertion !" },
    ],
    body: `
<p class="lede">Strict null checks force you to handle <code>null</code> — but the compiler is smart enough to <em>track</em> your checks. Once you've tested a value, TypeScript narrows its type for the rest of that branch.</p>

<h2 id="what">What narrowing is<a class="anchor" href="#what">#</a></h2>
<p>"Narrowing" is the compiler following your control flow and shrinking a type within a branch. After <code>if (x !== null)</code>, inside the <code>if</code> the type of <code>x</code> no longer includes <code>null</code>. You don't cast anything — the compiler just <em>knows</em>.</p>

<h2 id="truthiness">Truthiness &amp; null checks<a class="anchor" href="#truthiness">#</a></h2>
${code(`
export function actorRequiresPasswordSet(db: DB, actor: Actor, demo: boolean): boolean {
  if (demo) return false;
  const row = db.select({ passwordHash: users.passwordHash, kind: users.kind })
    .from(users).where(eq(users.id, actor.id)).get();
  if (!row) return false;          // row: Row | undefined  →  after this, row: Row
  if (row.kind !== "human") return false;  // narrows the kind union
  return row.passwordHash === null;
}
`, "backend/src/auth/actor.ts:100")}
<p>The <code>if (!row) return false</code> is an <strong>early return</strong> that eliminates <code>undefined</code>; below it, <code>row</code> is the non-null row type and <code>row.passwordHash</code> is safe to touch. This "guard clause then proceed" shape is everywhere in the backend.</p>
${code(`
for (const r of rows) {
  if (r.handle) takenLower.add(r.handle.toLowerCase());
  //  ↑ r.handle is 'string | null'; inside the if it's narrowed to 'string',
  //    so .toLowerCase() is allowed.
}
`, "backend/src/services/users.ts:88")}

${py(`
<p>Same instinct as Python's <code>if row is None: return</code> then proceed, or <code>if r.handle:</code>. The difference: in Python this is just runtime logic; in TS the <em>type</em> of the variable actually changes below the check, and the compiler enforces that you did the check before the dereference.</p>
`)}

<h2 id="in">The <code>in</code> operator<a class="anchor" href="#in">#</a></h2>
<p>For a union of object shapes, testing whether a <em>property exists</em> narrows which member you have. fjord's auth resolver returns "either an actor or an error", and the caller narrows with <code>in</code>:</p>
${code(`
export type ResolveActorResult =
  | { actor: Actor }
  | { error: string; status: 401 };

// at the call site:
if ("error" in result) {
  return reply.code(result.status).send({ error: result.error });
  //                 ↑ TS knows result is the {error, status} shape here
}
req.actor = result.actor;  // and the {actor} shape here
`, "backend/src/auth/actor.ts:27")}
<p>This is a <strong>discriminated union</strong> narrowed structurally — a pattern important enough to get its own lesson (9).</p>

<h2 id="instanceof"><code>instanceof</code> for classes<a class="anchor" href="#instanceof">#</a></h2>
<p>For real runtime classes (like Error subclasses), <code>instanceof</code> narrows to the specific class — and gives you access to that class's extra fields. fjord maps domain errors to HTTP responses this way:</p>
${code(`
if (err instanceof TaskNotFoundError) {
  notFound(reply, "Task");
} else if (err instanceof VersionConflictError) {
  reply.code(409).send({
    error: "Version conflict",
    code: "version_conflict" satisfies DomainErrorCode,
    current_version: err.currentVersion,   // ← only exists on VersionConflictError
  });
} else if (err instanceof EventEditForbiddenError) {
  if (err.code === "not_author") { /* … */ }   // err.code typed & narrowed
}
`, "backend/src/routes/tasks.ts:88")}
<p>Inside the <code>VersionConflictError</code> branch, <code>err.currentVersion</code> is reachable because the compiler knows <code>err</code> is that class. We'll build those error classes in lesson 10.</p>

${py(`
<p><code>err instanceof VersionConflictError</code> is precisely Python's <code>except VersionConflictError as err:</code> / <code>isinstance(err, VersionConflictError)</code> — and just like Python, after the check you can read the subclass-specific attributes.</p>
`)}

<h2 id="guards">User-defined type guards (<code>x is T</code>)<a class="anchor" href="#guards">#</a></h2>
<p>You can teach the compiler your own narrowing rule by writing a function whose return type is a <strong>type predicate</strong>: <code>param is T</code>. When it returns <code>true</code>, the compiler narrows the argument to <code>T</code>.</p>
${code(`
// A plain boolean function checks a condition:
function isBlockerSatisfied(blocker: Pick&lt;Task, "column" | "archived"&gt;): boolean {
  return blocker.column === "Done" || blocker.archived;
}

// A *type guard* additionally re-types its argument for the caller:
function isColumn(x: string): x is Column {
  return (COLUMNS as readonly string[]).includes(x);
}
// after \`if (isColumn(raw))\`, \`raw\` is typed Column, not string
`)}
<p>fjord's <code>isBlockerSatisfied</code> (real, in <span class="fileref">shared</span>) is an ordinary predicate; the <code>isColumn</code> form shows the <code>is</code> syntax you'll reach for when validating untrusted input into a precise type.</p>

<h2 id="bang">The non-null assertion <code>!</code><a class="anchor" href="#bang">#</a></h2>
<p>Sometimes <em>you</em> know a value isn't null but the compiler can't prove it. A trailing <code>!</code> says "trust me, this isn't null/undefined" and removes them from the type:</p>
${code(`
const current = stack.pop()!;       // pop() is T | undefined; we just checked length
if (ch.codePointAt(0)! &gt; 127) { … } // codePointAt may be undefined; index is valid here
`, "backend/src/services/tasks.ts:293")}
${gotcha(`
<p><code>!</code> is an <em>unchecked</em> override of the type system — if you're wrong, you get the exact runtime crash strict-null-checks was meant to prevent. Use it only when an invariant guarantees non-null (e.g. right after a <code>while (stack.length)</code>). Prefer a real check when you can. Treat every <code>!</code> as a small note that says "I checked this by hand."</p>
`)}
`,
  },

  /* ════════════════════════════════════════════════════════════════
     7 · GENERICS
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "07-generics",
    title: "Generics",
    level: "intermediate",
    blurb: "Functions and types parameterised by other types. The api.request<T> wrapper, the runTaskMutation<T> seam, and a generic <T> React component.",
    sections: [
      { id: "why", title: "Why generics" },
      { id: "request", title: "The api request<T> wrapper" },
      { id: "constraints", title: "Constraints with extends" },
      { id: "mutation", title: "runTaskMutation<T>: a generic seam" },
      { id: "containers", title: "Generic containers: Map, Set" },
    ],
    body: `
<p class="lede">A generic is a type with a hole in it — a placeholder filled in at the point of use. It's how you write one function that stays fully type-safe across many concrete types.</p>

<h2 id="why">Why generics<a class="anchor" href="#why">#</a></h2>
<p>You've used generics already: <code>string[]</code> is sugar for <code>Array&lt;string&gt;</code>, <code>Promise&lt;Buffer&gt;</code> is a promise parameterised by <code>Buffer</code>. The angle brackets hold a <em>type argument</em>. Writing your own generic means introducing a type <em>parameter</em>, conventionally <code>T</code>:</p>
${code(`
function identity&lt;T&gt;(value: T): T {
  return value;   // works for any T, and the return type matches the input
}
const a = identity("hi");   // T inferred as string  → a: string
const b = identity(42);     // T inferred as number  → b: number
`)}

${py(`
<p>This is <code>typing.TypeVar</code> + <code>Generic</code> in Python: <code>T = TypeVar("T"); def identity(value: T) -&gt; T:</code>. Same concept, lighter syntax — and inference usually fills <code>T</code> in for you, so you rarely write the type argument explicitly.</p>
`)}

<h2 id="request">The api <code>request&lt;T&gt;</code> wrapper<a class="anchor" href="#request">#</a></h2>
<p>The frontend's entire HTTP layer is one generic function. <code>T</code> is "the shape this endpoint returns":</p>
${code(`
async function request&lt;T&gt;(path: string, init: RequestInit = {}): Promise&lt;T&gt; {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (isWriteMethod(init.method)) headers.set(CSRF_HEADER, CSRF_VALUE);
  const res = await fetch(path, { ...init, credentials: "include", headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) dispatchLogout();
    const message = (body &amp;&amp; (body.error || body.message)) || \`HTTP \${res.status}\`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;   // we *assert* the parsed JSON matches T (see the warning)
}
`, "frontend/src/lib/api.ts:47")}
<p>Each endpoint method supplies the concrete <code>T</code>, and callers get a precisely-typed result with zero extra annotation:</p>
${code(`
export const api = {
  listUsers: () =&gt; request&lt;User[]&gt;("/api/users"),
  createUser: (body: CreateUserRequest) =&gt;
    request&lt;User&gt;("/api/users", { method: "POST", body: JSON.stringify(body) }),
  deleteUser: (id: string) =&gt;
    request&lt;void&gt;(\`/api/users/\${id}\`, { method: "DELETE" }),
};
`, "frontend/src/lib/api.ts:64")}
<p><code>api.listUsers()</code> is typed <code>Promise&lt;User[]&gt;</code>; <code>api.createUser(body)</code> is <code>Promise&lt;User&gt;</code>. One wrapper, total type safety across dozens of endpoints.</p>
${gotcha(`
<p>Notice <code>return body as T</code>. That <code>as T</code> is a <strong>type assertion</strong> — you're <em>telling</em> the compiler the parsed JSON is a <code>T</code>; nothing checks it at runtime (remember lesson 1: types are erased). It's a deliberate trust boundary: the frontend trusts the backend's contract. If you needed to defend against a lying server, you'd validate with Zod here instead (lesson 12).</p>
`)}

<h2 id="constraints">Constraints with <code>extends</code><a class="anchor" href="#constraints">#</a></h2>
<p>Sometimes <code>T</code> can't be <em>anything</em> — it must at least have certain capabilities. <code>T extends Constraint</code> bounds it. fjord's click-outside hook only makes sense for DOM elements, and defaults <code>T</code> when unspecified:</p>
${code(`
export function useClickOutside&lt;T extends HTMLElement = HTMLElement&gt;(
  active: boolean,
  onDismiss: () =&gt; void,
): RefObject&lt;T&gt; {
  const ref = useRef&lt;T&gt;(null);
  // …
  return ref;   // a ref the caller can attach to a &lt;div&gt;, &lt;input&gt;, etc.
}
`, "frontend/src/lib/useClickOutside.ts:10")}
<p>Read <code>&lt;T extends HTMLElement = HTMLElement&gt;</code> as "<code>T</code> is some kind of HTML element; if you don't say which, assume the base <code>HTMLElement</code>." The same generic shape powers a reusable component — a <code>Combobox</code> that works for a list of <em>any</em> item type:</p>
${code(`
interface ComboboxProps&lt;T&gt; {
  items: T[];
  getLabel: (item: T) =&gt; string;
  onSelect: (item: T) =&gt; void;
  placeholder?: string;
}
export function Combobox&lt;T&gt;({ items, getLabel, onSelect }: ComboboxProps&lt;T&gt;) { … }
`, "frontend/src/components/Combobox.tsx:3")}
<p>Use it with <code>User</code>s, <code>Project</code>s, whatever — <code>T</code> flows through and <code>getLabel</code>/<code>onSelect</code> stay type-checked against the item type you passed.</p>

<h2 id="mutation"><code>runTaskMutation&lt;T&gt;</code>: a generic seam<a class="anchor" href="#mutation">#</a></h2>
<p>The backend's most important internal function is generic. Every task write runs through it; <code>T</code> is "whatever the body produces" (a <code>Task</code>, a <code>TaskEvent</code>, nothing…):</p>
${code(`
function runTaskMutation&lt;T&gt;(ctx: TaskCtx, fn: (db: DB, publish: PublishFn) =&gt; T): T {
  const pending: StreamEvent[] = [];
  let result!: T;
  ctx.db.transaction(() =&gt; {
    result = fn(ctx.db, (event) =&gt; pending.push(event));  // run the body in a txn
  });
  for (const event of pending) ctx.bus.publish(event);     // publish only after COMMIT
  return result;
}
`, "backend/src/services/tasks.ts:328")}
<p>Because it's generic, the wrapper imposes the transaction-and-publish discipline without caring what each mutation returns — <code>createTask</code> gets back a <code>Task</code>, <code>addComment</code> gets back a <code>TaskEvent</code>, and both are correctly typed. This is the architectural "Task mutation seam" from CONTEXT.md; we'll return to its <em>behaviour</em> in lesson 10.</p>

<h2 id="containers">Generic containers: <code>Map</code>, <code>Set</code><a class="anchor" href="#containers">#</a></h2>
<p>The built-in collections are generic, and fjord annotates them explicitly when inference needs help:</p>
${code(`
const visited = new Set&lt;string&gt;();              // a set of strings
const stack: string[] = [blockedId];
const taskById = new Map&lt;string, Pick&lt;Task, "column" | "archived"&gt;&gt;();
//                    ↑ keys are string, values are a partial Task
`)}
<p><code>Map&lt;K, V&gt;</code> and <code>Set&lt;T&gt;</code> carry their element types, so <code>taskById.get(id)</code> returns <code>V | undefined</code> and the compiler makes you handle the miss. (That <code>Pick&lt;…&gt;</code> is a utility type — exactly the next lesson.)</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     8 · UTILITY TYPES
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "08-utility-types",
    title: "Utility types",
    level: "intermediate",
    blurb: "Built-in type transformers — Pick, Omit, Partial, Readonly, Record — that build new types from existing ones instead of repeating yourself.",
    sections: [
      { id: "idea", title: "Types that transform types" },
      { id: "pick", title: "Pick<T, K>" },
      { id: "omit", title: "Omit<T, K>" },
      { id: "partial", title: "Partial<T> & Required<T>" },
      { id: "record-readonly", title: "Record, Readonly & friends" },
    ],
    body: `
<p class="lede">You rarely need to hand-write a type that's "the <code>Task</code> type but only these two fields" or "<code>UpdateRequest</code> but without <code>version</code>". Utility types compute those for you, and stay in sync when the source type changes.</p>

<h2 id="idea">Types that transform types<a class="anchor" href="#idea">#</a></h2>
<p>TypeScript ships a standard library of <em>generic type operators</em>. They take a type in and give a derived type out. The advantage over copy-pasting fields: when the source interface changes, the derived type updates automatically. DRY, but for types.</p>

<h2 id="pick"><code>Pick&lt;T, K&gt;</code> — keep only some keys<a class="anchor" href="#pick">#</a></h2>
<p><code>Pick&lt;T, K&gt;</code> builds a type with <em>just</em> the keys <code>K</code> from <code>T</code>. fjord uses it so a helper can accept "any object that has at least these fields" — not a whole hydrated <code>Task</code>:</p>
${code(`
export function canArchive(task: Pick&lt;Task, "column" | "archived"&gt;): boolean {
  return task.column === "Done" &amp;&amp; !task.archived;
}

export function isTaskBlocked(
  task: Pick&lt;Task, "blocked_by"&gt;,
  taskById: Map&lt;string, Pick&lt;Task, "column" | "archived"&gt;&gt;,
): boolean {
  for (const blockerId of task.blocked_by) {
    const blocker = taskById.get(blockerId);
    if (blocker &amp;&amp; !isBlockerSatisfied(blocker)) return true;
  }
  return false;
}
`, "shared/src/index.ts:389")}
<p>This is a deliberate design choice: <code>isTaskBlocked</code> declares it needs <em>only</em> <code>blocked_by</code> (and the map needs only <code>column</code> + <code>archived</code>). Callers can pass lightweight objects, tests can build tiny fixtures, and the function's true dependencies are documented in its signature. Asking for the minimum is a hallmark of good TypeScript.</p>
${idiom(`
<p>Prefer <code>Pick&lt;Task, …&gt;</code> over taking the whole <code>Task</code> when a function only touches a couple of fields. It widens what callers can pass and narrows what the function can secretly depend on. The shared blocking helpers do this throughout.</p>
`)}

<h2 id="omit"><code>Omit&lt;T, K&gt;</code> — everything except some keys<a class="anchor" href="#omit">#</a></h2>
<p>The complement of <code>Pick</code>. fjord's task editor exposes an <code>update</code> that takes a patch <em>without</em> <code>version</code> — because the hook injects the current version itself (optimistic concurrency, lesson 13):</p>
${code(`
update: (
  patch: Omit&lt;UpdateTaskRequest, "version"&gt;,   // all of UpdateTaskRequest minus version
  opts?: { onSuccess?: () =&gt; void },
) =&gt; void;
`, "frontend/src/lib/useTaskEditor.ts:25")}
<p>The caller can't even <em>try</em> to set <code>version</code> — the type removed it. The hook owns that field. Encoding "who is responsible for which field" in the type prevents a whole class of concurrency mistakes.</p>

<h2 id="partial"><code>Partial&lt;T&gt;</code> &amp; <code>Required&lt;T&gt;</code><a class="anchor" href="#partial">#</a></h2>
<p><code>Partial&lt;T&gt;</code> makes every field optional — perfect for "a bag of columns to update". fjord builds a database update object this way:</p>
${code(`
const updates: Partial&lt;typeof users.$inferInsert&gt; = {};
if (body.display_name !== undefined) updates.displayName = body.display_name;
if (body.handle !== undefined) updates.handle = body.handle;
// … only the provided fields end up in \`updates\`
`, "backend/src/services/users.ts:96")}
<p>Here <code>typeof users.$inferInsert</code> is the full set of columns you could insert (we'll meet that Drizzle type in lesson 12); <code>Partial&lt;…&gt;</code> turns it into "any subset of them". <code>Required&lt;T&gt;</code> is the mirror image — it makes every optional field mandatory.</p>

${py(`
<p>Python's <code>typing</code> has nothing this composable. <code>TypedDict</code> has a <code>total=False</code> flag (roughly <code>Partial</code>) but you can't compute "this TypedDict minus one key" or "only these two keys" as first-class operations. Utility types are one of the places TypeScript's type system is meaningfully more expressive than Python's.</p>
`)}

<h2 id="record-readonly"><code>Record</code>, <code>Readonly</code> &amp; friends<a class="anchor" href="#record-readonly">#</a></h2>
<p>A few more you'll bump into:</p>
<ul>
  <li><strong><code>Record&lt;K, V&gt;</code></strong> — an object type with keys <code>K</code> and values <code>V</code>. <code>Record&lt;string, number&gt;</code> is "a dictionary from string to number" (Python's <code>dict[str, int]</code>).</li>
  <li><strong><code>Readonly&lt;T&gt;</code></strong> — every field of <code>T</code> becomes <code>readonly</code>. And <code>ReadonlySet&lt;T&gt;</code> / <code>ReadonlyArray&lt;T&gt;</code> are the immutable views you saw in lesson 5 (<code>ReadonlySet&lt;EventKind&gt;</code>).</li>
  <li><strong><code>NonNullable&lt;T&gt;</code></strong> — <code>T</code> with <code>null</code> and <code>undefined</code> removed.</li>
</ul>
<p>These all compose: <code>Partial&lt;Pick&lt;Task, "title" | "column"&gt;&gt;</code> is a valid, readable type meaning "maybe a title, maybe a column, nothing else". Reach for the standard transformers before you hand-roll a near-duplicate interface.</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     9 · DISCRIMINATED UNIONS
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "09-discriminated-unions",
    title: "Discriminated unions & exhaustiveness",
    level: "advanced",
    blurb: "The pattern that models 'one of several shapes, tagged by a field' — StreamEvent, the Validated result type — plus compiler-checked exhaustiveness with never.",
    sections: [
      { id: "idea", title: "A tag field + a union" },
      { id: "stream", title: "StreamEvent: the canonical example" },
      { id: "result", title: "Validated<T,C>: results without exceptions" },
      { id: "exhaustive", title: "Exhaustiveness with never" },
      { id: "satisfies", title: "satisfies for safe tags" },
    ],
    body: `
<p class="lede">This is the pattern that, more than any other, makes well-typed code feel airtight. A union where each member carries a literal "tag" field lets the compiler know <em>exactly</em> which shape you have after one check — and warn you when you forget a case.</p>

<h2 id="idea">A tag field + a union<a class="anchor" href="#idea">#</a></h2>
<p>A <strong>discriminated union</strong> (a.k.a. tagged union) is a union of object types that all share one field — the <em>discriminant</em> — set to a distinct literal in each member. Check the discriminant, and the compiler narrows to that member, exposing exactly its fields.</p>

<h2 id="stream"><code>StreamEvent</code>: the canonical example<a class="anchor" href="#stream">#</a></h2>
<p>fjord's real-time events are a textbook discriminated union, tagged by <code>type</code>:</p>
${code(`
export type StreamEvent =
  | { type: "task.created"; task_id: string; space_id: string }
  | { type: "task.updated"; task_id: string; version: number; space_id: string }
  | { type: "task.deleted"; task_id: string; space_id: string }
  | { type: "task.event_added"; task_id: string; event_id: string; kind: EventKind; space_id: string }
  | { type: "task.event_updated"; task_id: string; event_id: string; space_id: string }
  | { type: "task.event_deleted"; task_id: string; event_id: string; space_id: string }
  | { type: "demo.reset" };
`, "shared/src/index.ts:375")}
<p>Notice each member has different fields: <code>task.updated</code> carries a <code>version</code>; <code>demo.reset</code> carries nothing but its tag. Switch on <code>type</code> and the compiler grants access to precisely the right fields:</p>
${code(`
export function shouldForwardEvent(event: StreamEvent, affiliatedSpaceIds: Set&lt;string&gt;): boolean {
  if (event.type === "demo.reset") return true;     // this member has no space_id…
  return affiliatedSpaceIds.has(event.space_id);    // …and here TS knows it does
}
`, "backend/src/routes/stream.ts:4")}
<p>After <code>event.type === "demo.reset"</code> is handled and returned, the compiler knows every <em>remaining</em> member has a <code>space_id</code>, so <code>event.space_id</code> is legal on the last line. Try to read <code>event.version</code> there and it would error, because not every remaining member has one. The tag <em>is</em> the proof.</p>

${py(`
<p>The Python analogue is a dict with a <code>"type"</code> key that you branch on, or modern <code>match</code> statements over tagged shapes. But Python won't stop you from reading <code>event["version"]</code> on the wrong variant — you'd find out with a <code>KeyError</code> at runtime. TypeScript turns that into a compile error.</p>
`)}

<h2 id="result"><code>Validated&lt;T, C&gt;</code>: results without exceptions<a class="anchor" href="#result">#</a></h2>
<p>fjord models domain validation as a discriminated union instead of throwing — a "result type", tagged by <code>ok</code>. This is the same idea as Rust's <code>Result</code> or the functional <code>Either</code>:</p>
${code(`
export type Validated&lt;T, C extends DomainErrorCode&gt; =
  | { ok: true; value: T }
  | { ok: false; code: C; message: string };
`, "shared/src/index.ts:220")}
<p>It's <em>generic</em> (lesson 7): <code>T</code> is the success value, and <code>C</code> is constrained (<code>extends DomainErrorCode</code>, lesson 3) to the specific error codes this validation can produce. <code>validateHandle</code> declares exactly which two it might return:</p>
${code(`
export function validateHandle(
  input: string,
): Validated&lt;string, "handle_invalid" | "handle_reserved"&gt; {
  const lower = input.toLowerCase();
  if (!HANDLE_REGEX.test(lower)) {
    return { ok: false, code: "handle_invalid", message: \`Handle must match …\` };
  }
  if (RESERVED_HANDLE_SET.has(lower)) {
    return { ok: false, code: "handle_reserved", message: \`Handle "\${lower}" is reserved\` };
  }
  return { ok: true, value: lower };
}

// caller:
const result = validateHandle(raw);
if (!result.ok) return badRequest(reply, result.message);  // result narrowed to error
const handle = result.value;                                // narrowed to success
`)}
<p>The caller <em>cannot</em> read <code>result.value</code> without first checking <code>result.ok</code> — the type forbids it until you've narrowed. Errors become impossible to ignore, without any exception machinery.</p>
${idiom(`
<p>Use a <code>Validated</code>/result type when failure is an <em>expected, named outcome</em> the caller should handle (bad handle, reserved name). Reserve thrown errors (lesson 10) for <em>exceptional</em> conditions that should unwind to a central handler. fjord uses both, deliberately — validation returns results; "task not found" throws.</p>
`)}

<h2 id="exhaustive">Exhaustiveness with <code>never</code><a class="anchor" href="#exhaustive">#</a></h2>
<p>Here's the superpower. Recall <code>never</code> (lesson 4) — the type with no values. In the <code>default</code> branch of a <code>switch</code> over a discriminated union, if you've handled every case, the remaining type is <code>never</code>. Assign the variable to a <code>never</code> and the compiler will <em>error if any case is unhandled</em>:</p>
${code(`
function describe(event: StreamEvent): string {
  switch (event.type) {
    case "task.created": return "created";
    case "task.updated": return "updated";
    case "task.deleted": return "deleted";
    case "task.event_added":
    case "task.event_updated":
    case "task.event_deleted": return "timeline changed";
    case "demo.reset": return "reset";
    default: {
      const _exhaustive: never = event;  // ✗ compile error if a case is missing
      return _exhaustive;
    }
  }
}
`)}
<p>Add a new member to <code>StreamEvent</code> and every non-exhaustive switch like this lights up red until you handle it. Combined with lesson 5's "derive the union from an array", you get a system where adding one string ripples out to every place that must care. That's the endgame of static typing.</p>

<h2 id="satisfies"><code>satisfies</code> for safe tags<a class="anchor" href="#satisfies">#</a></h2>
<p>When you write a literal that's <em>meant</em> to be a member of a union, <code>satisfies</code> checks it against the union <strong>without widening or narrowing</strong> its type. fjord uses it so a typo'd error code can't slip into a response:</p>
${code(`
reply.code(409).send({
  error: "Version conflict",
  code: "version_conflict" satisfies DomainErrorCode,  // must be a real DomainErrorCode
  current_version: err.currentVersion,
});
`, "backend/src/routes/tasks.ts:92")}
<p><code>"version_conflict" satisfies DomainErrorCode</code> says: "verify this string is a valid <code>DomainErrorCode</code>, but keep its precise literal type." If you wrote <code>"verison_conflict"</code>, it wouldn't compile. Unlike <code>as DomainErrorCode</code> (an assertion that would happily accept a typo if the string were widened), <code>satisfies</code> <em>checks</em> rather than <em>asserts</em> — prefer it whenever you're writing a literal that must conform to a type.</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     10 · CLASSES & ERROR HANDLING
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "10-classes-errors",
    title: "Classes & error handling",
    level: "intermediate",
    blurb: "Classes, parameter properties, and the custom-Error pattern that lets the service layer throw typed domain errors the routes map to HTTP — plus the transactional mutation seam.",
    sections: [
      { id: "classes", title: "Classes & parameter properties" },
      { id: "errors", title: "Custom Error classes" },
      { id: "carry", title: "Errors that carry data" },
      { id: "mapping", title: "Throw in the service, map in the route" },
      { id: "seam", title: "The mutation seam in practice" },
    ],
    body: `
<p class="lede">TypeScript classes will feel familiar from Python, with a couple of conveniences. fjord uses them sparingly but pointedly — most of all for a clean, typed error architecture.</p>

<h2 id="classes">Classes &amp; parameter properties<a class="anchor" href="#classes">#</a></h2>
<p>Classes look much like Python's, but TS adds a shorthand that removes the boilerplate of "assign every constructor argument to <code>this</code>". Mark a constructor parameter <code>public</code>/<code>private</code>/<code>readonly</code> and it becomes a field automatically:</p>
${code(`
export class EventBus {
  private emitter = new EventEmitter();   // a private field with an initializer

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(event: StreamEvent): void {
    this.emitter.emit(EVENT_NAME, event);
  }
}
`, "backend/src/event_bus.ts:6")}

${py(`
<p>Python equivalent: <code>class EventBus:</code> with <code>self._emitter = …</code> in <code>__init__</code>. The "parameter property" shorthand (next section) is like Python's <code>@dataclass</code> auto-assigning fields — <code>def __init__(self, status): self.status = status</code> collapses to one line.</p>
`)}

<h2 id="errors">Custom Error classes<a class="anchor" href="#errors">#</a></h2>
<p>fjord's service layer never returns HTTP status codes — it throws <em>typed</em> errors that describe <em>what went wrong in domain terms</em>. Each is a tiny class extending the built-in <code>Error</code>:</p>
${code(`
export class TaskNotFoundError extends Error {
  readonly name = "TaskNotFoundError";
}
export class UnknownUserError extends Error {
  readonly name = "UnknownUserError";
}
export class CycleError extends Error {
  readonly name = "CycleError";
}
`, "backend/src/services/tasks.ts:20")}
<p>The <code>readonly name = "…"</code> overrides <code>Error.name</code> so logs and debuggers show the specific class. These empty subclasses exist purely so callers can distinguish them with <code>instanceof</code> (lesson 6).</p>

<h2 id="carry">Errors that carry data<a class="anchor" href="#carry">#</a></h2>
<p>When an error needs to convey more than its identity, a parameter property carries it. The version-conflict error packs the current version so the route can tell the client what to re-sync to:</p>
${code(`
export class VersionConflictError extends Error {
  readonly name = "VersionConflictError";
  constructor(public readonly currentVersion: number) {
    super();
  }
}

export class EventEditForbiddenError extends Error {
  readonly name = "EventEditForbiddenError";
  constructor(
    public readonly code:
      | "subsequent_activity" | "edit_window_expired"
      | "not_author" | "not_editable_kind",
  ) {
    super(code);
  }
}
`, "backend/src/services/tasks.ts:24")}
<p>That <code>public readonly currentVersion: number</code> in the constructor signature <em>is</em> the field declaration, assignment, and parameter all at once. And <code>EventEditForbiddenError.code</code> is a literal union — so after you've narrowed to that class, <code>err.code</code> is itself one of four exact strings you can switch on exhaustively.</p>

${py(`
<p>Same as Python's <code>class VersionConflictError(Exception):</code> with <code>def __init__(self, current_version): self.current_version = current_version</code>. The TS <code>public readonly</code> shorthand is the only real difference — and <code>super()</code> is the <code>Error</code> base constructor, like <code>super().__init__()</code>.</p>
`)}

<h2 id="mapping">Throw in the service, map in the route<a class="anchor" href="#mapping">#</a></h2>
<p>This separation is a core fjord pattern. Services speak <em>domain</em>; a single route-layer function translates each domain error into an HTTP response. You saw the start of it in lesson 6 — here's the shape of the whole translator:</p>
${code(`
function mapServiceError(err: unknown, reply: FastifyReply): void {
  if (mapSpaceWriteError(reply, err)) return;
  if (err instanceof TaskNotFoundError) {
    notFound(reply, "Task");
  } else if (err instanceof VersionConflictError) {
    reply.code(409).send({
      error: "Version conflict",
      code: "version_conflict" satisfies DomainErrorCode,
      current_version: err.currentVersion,
    });
  } else if (err instanceof CycleError) {
    badRequest(reply, "Adding this dependency would create a cycle");
  } else if (err instanceof EventEditForbiddenError) {
    if (err.code === "not_author") forbidden(reply, "…");
    // …each err.code handled
  } else {
    throw err;   // unknown error: let it propagate to the framework handler
  }
}
`, "backend/src/routes/tasks.ts:88")}
<p>Two things worth copying: the parameter is typed <code>unknown</code> (the honest type of "a caught value" — you must narrow before using it, which <code>instanceof</code> does), and the final <code>else throw err</code> re-raises anything unrecognised rather than swallowing it. <strong>Never silently absorb an error you didn't expect.</strong></p>
${gotcha(`
<p>In <code>catch (err)</code>, <code>err</code> is typed <code>unknown</code> in this codebase's strict setup — you can't assume it's an <code>Error</code>. That's why everything goes through <code>instanceof</code> checks. Reaching for <code>err.message</code> directly won't compile until you've proven <code>err</code> is an <code>Error</code>.</p>
`)}

<h2 id="seam">The mutation seam in practice<a class="anchor" href="#seam">#</a></h2>
<p>Now lesson 7's generic <code>runTaskMutation&lt;T&gt;</code> pays off behaviorally. Every task write is wrapped so its row changes <em>and</em> its task events commit atomically, and stream events publish <strong>only after COMMIT</strong>:</p>
${code(`
export function addComment(ctx: TaskCtx, actor: string, taskId: string, body: string): TaskEvent {
  return runTaskMutation(ctx, (db, publish) =&gt;
    addTimelineEntry(db, publish, actor, taskId, "comment", body),
  );
}
`, "backend/src/services/tasks.ts:565")}
<p>The body receives <code>(db, publish)</code> and does its work; if it throws (say, <code>TaskNotFoundError</code>), the transaction rolls back and <em>nothing</em> is published — subscribers never hear about a write that didn't happen. The error then bubbles up to <code>mapServiceError</code>. Types, classes, generics, and error handling all converging on one guarantee: <strong>committed-or-silent, never half-announced.</strong></p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     11 · MODULES & THE MONOREPO
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "11-modules-monorepo",
    title: "Modules, imports & the monorepo",
    level: "intermediate",
    blurb: "ES modules, named vs default exports, import type, the surprising .js extension on relative imports, and how @fjord/shared ties the workspaces together.",
    sections: [
      { id: "esm", title: "ES modules: import / export" },
      { id: "named-default", title: "Named vs default exports" },
      { id: "import-type", title: "import type" },
      { id: "js-ext", title: "Why imports end in .js" },
      { id: "shared", title: "@fjord/shared & barrels" },
    ],
    body: `
<p class="lede">Module mechanics are the least glamorous TypeScript topic and the one most likely to confuse a newcomer to this repo — especially the <code>.js</code> extensions on TypeScript imports. Let's demystify it.</p>

<h2 id="esm">ES modules: <code>import</code> / <code>export</code><a class="anchor" href="#esm">#</a></h2>
<p>Every <code>.ts</code> file is a module. Anything marked <code>export</code> is public; everything else is private to the file. You bring names in with <code>import</code>:</p>
${code(`
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import { EventBus } from "./event_bus.js";
`, "backend/src/server.ts")}

${py(`
<p>Direct parallels to Python: <code>export</code> ≈ a top-level name in a module (Python exports everything not underscore-prefixed; TS exports only what you mark). <code>import { eq } from "drizzle-orm"</code> ≈ <code>from drizzle_orm import eq</code>. <code>import * as schema from "./schema.js"</code> ≈ <code>import schema</code> / <code>from . import schema</code>.</p>
`)}

<h2 id="named-default">Named vs default exports<a class="anchor" href="#named-default">#</a></h2>
<p>Two flavors:</p>
<ul>
  <li><strong>Named</strong>: <code>export function foo()</code> / <code>export const bar</code>, imported with braces: <code>import { foo, bar } from "…"</code>. The name must match. This is what fjord uses almost everywhere.</li>
  <li><strong>Default</strong>: <code>export default …</code>, imported <em>without</em> braces and renameable: <code>import Fastify from "fastify"</code>. Common for a library's single main export.</li>
</ul>
${code(`
import Fastify, { type FastifyInstance } from "fastify";
//     ↑ default     ↑ a named (type) export, in the same statement
`, "backend/src/server.ts:3")}
${idiom(`
<p>fjord favors <strong>named exports</strong> for app code — they're greppable, autocomplete well, and rename safely. Default exports are mostly left to third-party libraries and React component files. When in doubt, export by name.</p>
`)}

<h2 id="import-type"><code>import type</code><a class="anchor" href="#import-type">#</a></h2>
<p>Because types are erased (lesson 1!), importing something <em>only</em> for its type shouldn't generate a runtime <code>import</code>. <code>import type</code> (or an inline <code>type</code> modifier) makes that explicit, and the compiler strips it entirely:</p>
${code(`
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { Actor } from "../auth/actor.js";
import type { DB } from "../db/index.js";

// inline form — mix value and type imports in one line:
import { openDatabase, runMigrations, type DB, type DBHandle } from "./db/index.js";
`, "backend/src/routes/tasks.ts:1")}
<p>This matters under <code>isolatedModules</code> (set in fjord's tsconfig): the compiler processes each file alone and needs you to be explicit about which imports are type-only so it can erase them safely. It's also good documentation — <code>import type</code> signals "this is a compile-time-only dependency."</p>

<h2 id="js-ext">Why imports end in <code>.js</code> (not <code>.ts</code>)<a class="anchor" href="#js-ext">#</a></h2>
<p>This is the single most "wait, what?" thing in the backend. You'll see TypeScript files importing their siblings with a <code>.js</code> extension:</p>
${code(`
import { users } from "../db/schema.js";   // …but the file is schema.ts!
`)}
<p>The reason: TypeScript deliberately does <em>not</em> rewrite import paths. The <em>output</em> of compiling <code>schema.ts</code> is <code>schema.js</code>, and that's what actually exists when Node runs the compiled backend. So you write the path to the <em>emitted</em> file. You're importing "what this will be at runtime", and the compiler maps <code>./schema.js</code> back to <code>./schema.ts</code> for type-checking. Native ES modules in Node require the extension, so it can't be omitted.</p>
${gotcha(`
<p>Write <code>.js</code>, never <code>.ts</code>, in relative import paths in the backend — even though you're pointing at a <code>.ts</code> file. It looks wrong; it's correct. (The frontend, bundled by Vite, is more relaxed and usually omits extensions — another reason the two workspaces feel slightly different.)</p>
`)}

<h2 id="shared"><code>@fjord/shared</code> &amp; barrel files<a class="anchor" href="#shared">#</a></h2>
<p>Both backend and frontend import shared types by a <em>package name</em>, not a relative path — that's the workspace boundary doing its job:</p>
${code(`
import { COLUMNS, EVENT_KINDS, type DomainErrorCode } from "@fjord/shared";
import {
  DEFAULT_ADMINISTRATOR_ID, pickAvatar, type DomainErrorCode,
} from "@fjord/shared";
`, "backend/src/routes/tasks.ts / server.ts")}
<p><code>@fjord/shared</code> resolves to the <span class="fileref">shared/</span> workspace via npm. Its single <span class="fileref">shared/src/index.ts</span> re-exports everything — that's a <strong>barrel file</strong>: one entry point that gathers a module's public surface so consumers have a single import source. The backend also barrels its schema:</p>
${code(`
export * as schema from "./schema.js";   // re-export the whole module as a namespace
`, "backend/src/db/index.ts:39")}
<p>Now <code>schema.users</code>, <code>schema.tasks</code>, etc. are all reachable through one import. Barrels keep import lists short and give you one obvious place to look for "what does this module offer".</p>
`,
  },

  /* ════════════════════════════════════════════════════════════════
     12 · ADVANCED TYPES AT THE BOUNDARY
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "12-boundary-types",
    title: "Advanced types at the runtime boundary",
    level: "advanced",
    blurb: "keyof & indexed access, typeof-for-types, Zod runtime validation with inferred types, Drizzle's $inferSelect/$inferInsert, and the snake_case ↔ camelCase mapping seam.",
    sections: [
      { id: "indexed", title: "keyof & indexed access types" },
      { id: "typeof-type", title: "typeof in type position, again" },
      { id: "zod", title: "Zod: parse, don't validate" },
      { id: "drizzle", title: "Drizzle's inferred row types" },
      { id: "mapping", title: "The mapping seam: DB ↔ API" },
    ],
    body: `
<p class="lede">The hardest, most valuable TypeScript lives where your program meets the untyped world — env vars, JSON, the database. This lesson is about the tools that carry type safety across that boundary, and they're exactly the tools fjord leans on hardest.</p>

<h2 id="indexed"><code>keyof</code> &amp; indexed access types<a class="anchor" href="#indexed">#</a></h2>
<p><code>keyof T</code> is the union of <em>T's keys</em> as a type. And <code>T["key"]</code> (indexed access, which you met for tuples in lesson 5) reads the <em>type of a field</em>. Together they let you talk about a type's structure programmatically:</p>
${code(`
type TaskKeys = keyof Task;        // "id" | "title" | "column" | "position" | …
type ColumnType = Task["column"];  // Column   (the field's type, by name)
type TagsType = Task["tags"];      // string[]
`)}
<p>fjord uses indexed access to avoid restating a type that already exists. When building a task event, the <code>kind</code> parameter is typed by reaching <em>into</em> the <code>TaskEvent</code> interface rather than re-importing <code>EventKind</code>:</p>
${code(`
kind: TaskEvent["kind"],   // exactly TaskEvent's kind field type — stays in sync
`, "backend/src/services/tasks.ts:160")}
<p>If <code>TaskEvent.kind</code> ever changes, this parameter changes with it. No second source of truth.</p>

<h2 id="typeof-type"><code>typeof</code> in type position, again<a class="anchor" href="#typeof-type">#</a></h2>
<p>Lesson 5 used <code>typeof</code> to turn a <em>value</em> into a type. The same operator captures the type of a whole module or object — fjord types its database handle as "a Drizzle database parameterised by the type of the schema module":</p>
${code(`
export type DB = NodeSQLiteDatabase&lt;typeof schema&gt;;
//                                   ↑ the static type of the entire schema namespace
`, "backend/src/db/index.ts:8")}
<p>This is how the ORM knows about every table and column you defined — the schema's <em>value</em> (the table definitions) doubles as the source of its <em>type</em>.</p>

<h2 id="zod">Zod: "parse, don't validate"<a class="anchor" href="#zod">#</a></h2>
<p>Recall the central truth from lesson 1: types are erased, so <em>nothing</em> checks data crossing into your program at runtime. <strong>Zod</strong> closes that gap. You declare a schema as a runtime value; Zod both validates data <em>and</em> hands you a TypeScript type derived from the schema. fjord validates its entire environment this way:</p>
${code(`
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FJORD_PORT: z.coerce.number().int().positive().default(3000),
  FJORD_DB_PATH: z.string().default("./data/fjord.db"),
  FJORD_SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(30),
  FJORD_DEMO_MODE: z.enum(["true", "false"]).transform((v) =&gt; v === "true").default("false"),
  // …
});
`, "backend/src/config.ts:1")}
<p>At startup, one call turns the raw, all-strings <code>process.env</code> into a validated, correctly-typed object — coercing numbers, applying defaults, transforming <code>"true"</code> into a real boolean, and <em>throwing</em> on anything invalid:</p>
${code(`
export function loadConfig(env: NodeJS.ProcessEnv = process.env, …): Config {
  const parsed = EnvSchema.parse(env);   // validates + coerces, or throws
  // \`parsed\` is now fully typed — parsed.FJORD_PORT is a number, not a string
}
`, "backend/src/config.ts:45")}
<p>The phrase <strong>"parse, don't validate"</strong> captures the idea: instead of checking data and then continuing to treat it as untrusted, you <em>parse</em> it once into a trusted, precisely-typed shape and work with that everywhere downstream. After <code>EnvSchema.parse</code>, the rest of the app never re-checks the env.</p>
${py(`
<p>Zod is TypeScript's <strong>Pydantic</strong>. <code>z.object({...})</code> ≈ a <code>BaseModel</code>; <code>EnvSchema.parse(env)</code> ≈ <code>Settings(**env)</code> with validators and coercion. The bonus TypeScript gets that Pydantic doesn't need: Zod can <em>infer the static type</em> from the schema via <code>z.infer&lt;typeof EnvSchema&gt;</code>, so you never write the type and the runtime validator separately.</p>
`)}
${idiom(`
<p>Validate at the edges, trust the interior. Every untrusted input — env, request bodies, third-party responses — should be parsed into a known type <em>once</em>, at the boundary. fjord does env via Zod and request bodies via Fastify's JSON schema; downstream code just uses the typed result.</p>
`)}

<h2 id="drizzle">Drizzle's inferred row types<a class="anchor" href="#drizzle">#</a></h2>
<p>The database is another boundary. fjord defines each table once with Drizzle, as a runtime value:</p>
${code(`
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  handle: text("handle").notNull(),
  kind: text("kind", { enum: ["human", "agent"] }).notNull(),
  role: text("role", { enum: ["Admin", "Member"] }).notNull().default("Member"),
  passwordHash: text("password_hash"),         // nullable (no .notNull())
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});
`, "backend/src/db/schema.ts:3")}
<p>From that single definition Drizzle derives two types: <code>$inferSelect</code> (a row as read) and <code>$inferInsert</code> (a row as written, with defaults optional). You reference them with the <code>typeof</code>-for-types trick:</p>
${code(`
function getTaskOrThrow(db: DB, id: string): typeof tasks.$inferSelect {
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) throw new TaskNotFoundError();
  return task;
}
`, "backend/src/services/tasks.ts:247")}
<p>The schema is the single source of truth: change a column and every function typed by <code>$inferSelect</code> updates. There's no hand-maintained "row interface" to drift. (Compare with <code>Partial&lt;typeof users.$inferInsert&gt;</code> from lesson 8 — a partial update bag, derived the same way.)</p>

<h2 id="mapping">The mapping seam: DB ↔ API<a class="anchor" href="#mapping">#</a></h2>
<p>Here's a subtlety you'll hit constantly. The <em>database</em> uses <code>camelCase</code> (<code>displayName</code>, <code>passwordHash</code>, <code>createdAt</code>); the <em>API and shared types</em> use <code>snake_case</code> (<code>display_name</code>, <code>created_at</code>). These are two different worlds, and fjord translates between them at the service boundary with small mapper functions:</p>
${code(`
export function toEvent(row: typeof taskEvents.$inferSelect): TaskEvent {
  return {
    id: row.id,
    task_id: row.taskId,        // snake_case API  ←  camelCase DB row
    actor_id: row.actorId,
    kind: row.kind as TaskEvent["kind"],
    created_at: row.createdAt,
    updated_at: row.updatedAt ?? null,
    body: row.body,
    // …
  };
}
`, "backend/src/services/tasks.ts:131")}
<p>The parameter is typed by the schema (<code>$inferSelect</code>); the return is typed by the shared API contract (<code>TaskEvent</code>). The function body is the only place the two naming conventions meet, and the compiler verifies that <em>every</em> field of <code>TaskEvent</code> is produced and correctly typed. Miss a field or misname one and it won't compile.</p>
${cb(`
<p>This <code>toX(row): ApiType</code> mapper pattern is everywhere in <span class="fileref">backend/src/services/</span> (<code>toEvent</code>, <code>toSpace</code>, <code>hydrateTask</code>, …). When you add a field, the work is: add the column (schema), add it to the shared interface, and add the mapping line. The compiler walks you through the other two the moment you do one.</p>
`)}
`,
  },

  /* ════════════════════════════════════════════════════════════════
     13 · REACT + TYPESCRIPT
     ════════════════════════════════════════════════════════════════ */
  {
    slug: "13-react-typescript",
    title: "React + TypeScript",
    level: "advanced",
    blurb: "Where it all lands on the frontend: typed props, generic hooks (useState/useRef), typed events, React Query, typed context, and the useTaskEditor orchestrator.",
    sections: [
      { id: "props", title: "Typing component props" },
      { id: "hooks", title: "Hooks: useState & useRef generics" },
      { id: "events", title: "Typed event handlers" },
      { id: "query", title: "React Query: typed server state" },
      { id: "optimistic", title: "Optimistic updates & ApiError" },
      { id: "context", title: "Typed context & a hook contract" },
    ],
    body: `
<p class="lede">React with TypeScript is where every concept so far converges: interfaces describe props, generics type the hooks, unions model UI state, and discriminated narrowing handles errors. If you can read this lesson, you can read the frontend.</p>

<h2 id="props">Typing component props<a class="anchor" href="#props">#</a></h2>
<p>A React component is a function that takes one object — its <em>props</em> — and returns markup. You type the props with an interface (or inline object type) and destructure them:</p>
${code(`
interface Props {
  task: Task;
  isBlocked: boolean;
  project: Project | undefined;
  showProject: boolean;
  assigneeLabel: string;
}

export function TaskCard({ task, isBlocked, project, showProject, assigneeLabel }: Props) {
  // …returns JSX
}
`, "frontend/src/components/TaskCard.tsx:33")}
<p>That's it — props are "just an interface" (lesson 2), and the component is "just a typed function" (lesson 4). Optional props use <code>?</code> and often a default:</p>
${code(`
export function SectionLabel({ children, className }: {
  children: React.ReactNode;     // anything renderable: text, elements, arrays…
  className?: string;            // optional
}) {
  return &lt;h3 className={\`… \${className ?? ""}\`}&gt;{children}&lt;/h3&gt;;
}
`, "frontend/src/components/form-fields.tsx:9")}
<p><code>React.ReactNode</code> is the standard type for "valid React children". And <code>className ?? ""</code> is the <strong>nullish coalescing</strong> operator — "use the left side unless it's null/undefined, then use the right". Its cousin <code>?.</code> (optional chaining, <code>blocker?.title</code>) safely reads through possibly-absent values. Both exist because of strict null checks (lesson 3).</p>

<h2 id="hooks">Hooks: <code>useState</code> &amp; <code>useRef</code> generics<a class="anchor" href="#hooks">#</a></h2>
<p>React's hooks are generic functions (lesson 7). Often the type is inferred from the initial value; when the initial value doesn't tell the whole story (e.g. it starts <code>null</code> but will hold a <code>Project</code>), you supply the type argument:</p>
${code(`
const [editingDesc, setEditingDesc] = useState(false);        // inferred: boolean
const [draftTitle, setDraftTitle] = useState("");             // inferred: string
const [conflict, setConflict] = useState&lt;string | null&gt;(null);// explicit union
const [editingProject, setEditingProject] =
  useState&lt;Project | "new" | null&gt;(null);                     // a 3-way union as UI state
`, "frontend/src/components/… (TaskDetail, FilterBar, useTaskEditor)")}
<p>That last one is lovely: a single state variable that is <em>either</em> an existing <code>Project</code> (editing it), the literal <code>"new"</code> (creating one), or <code>null</code> (closed) — the three UI states encoded as a union you must narrow before use.</p>
<p><code>useRef</code> is the same story — a mutable box whose <code>.current</code> is typed by the generic:</p>
${code(`
const abortRef = useRef&lt;AbortController | null&gt;(null);  // holds a controller or null
const inputRef = useRef&lt;HTMLInputElement&gt;(null);        // points at a DOM &lt;input&gt;
`, "frontend/src/lib/stream.ts:7 / Combobox.tsx:19")}

<h2 id="events">Typed event handlers<a class="anchor" href="#events">#</a></h2>
<p>DOM events are typed by React's synthetic-event generics — they tell you both the kind of event and which element fired it, so <code>e.target.value</code> and <code>e.key</code> are fully typed:</p>
${code(`
function handleKeyDown(e: React.KeyboardEvent&lt;HTMLInputElement&gt;) {
  if (e.key === "ArrowDown") { e.preventDefault(); /* … */ }
  else if (e.key === "Enter") { /* … */ }
}

&lt;input onChange={(e) =&gt; setQuery(e.target.value)} onKeyDown={handleKeyDown} /&gt;
`, "frontend/src/components/Combobox.tsx:38")}
<p>The common ones: <code>React.ChangeEvent&lt;HTMLInputElement&gt;</code> (input edits), <code>React.KeyboardEvent</code> (keys), <code>React.MouseEvent</code> (clicks), <code>React.FormEvent</code> (submits). Inline arrow handlers usually infer the event type from where they're attached, so you only annotate when you extract the handler into a named function.</p>

<h2 id="query">React Query: typed server state<a class="anchor" href="#query">#</a></h2>
<p>fjord never stores server data in <code>useState</code>. It uses React Query, whose <code>useQuery</code> infers its data type straight from the typed <code>api</code> functions (lesson 7) — so <code>data</code> is correctly typed end-to-end with no annotation:</p>
${code(`
export function useProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () =&gt; api.getProject(projectId!),  // returns Promise&lt;Project&gt;
    enabled: !!projectId,                        // skip the query while id is absent
  });
}
// data is inferred as Project | undefined
`, "frontend/src/lib/queries.ts:30")}
<p>Mutations mirror it: <code>useMutation</code> takes a typed <code>mutationFn</code> and typed callbacks. The <code>mutationFn</code>'s argument type is whatever you pass to <code>.mutate(…)</code>, checked at the call site:</p>
${code(`
export function useCreateTask(options?: { onSuccess?: (task: Task) =&gt; void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskRequest) =&gt; api.createTask(body),
    onSuccess: (task) =&gt; {                       // task: Task, inferred
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      options?.onSuccess?.(task);                // optional chaining on the callback
    },
  });
}
`, "frontend/src/lib/mutations.ts:10")}

<h2 id="optimistic">Optimistic updates &amp; <code>ApiError</code><a class="anchor" href="#optimistic">#</a></h2>
<p>Dragging a card updates the UI <em>before</em> the server confirms, then rolls back on failure. The types make the rollback safe — <code>onMutate</code> returns a context object that <code>onError</code> receives, fully typed:</p>
${code(`
mutationFn: (args: { id: string; version: number; column: Column; position: number }) =&gt;
  api.updateTask(args.id, { version: args.version, column: args.column, position: args.position }),
onMutate: async (args) =&gt; {
  await queryClient.cancelQueries({ queryKey: ["tasks"] });
  const previous = queryClient.getQueryData&lt;Task[]&gt;(["tasks"]);  // snapshot for rollback
  queryClient.setQueryData&lt;Task[]&gt;(["tasks"], (old) =&gt;
    old?.map((t) =&gt; (t.id === args.id ? { ...t, column: args.column, position: args.position } : t)) ?? []);
  return { previous };                                          // becomes onError's context
},
onError: (_err, _vars, context) =&gt; {
  if (context?.previous) queryClient.setQueryData(["tasks"], context.previous);  // undo
},
`, "frontend/src/lib/mutations.ts:120")}
<p>And the custom <code>ApiError</code> (lesson 10) lets the UI react to specific HTTP statuses — note the <code>instanceof</code> narrowing (lesson 6) to reach <code>err.status</code>:</p>
${code(`
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
  }
}

// in a mutation's onError — a 409 means the version was stale:
if (err instanceof ApiError &amp;&amp; err.status === 409) {
  queryClient.invalidateQueries({ queryKey: ["task", taskId] });  // refetch fresh version
  options?.onConflict?.();
}
`, "frontend/src/lib/api.ts:32 / mutations.ts:34")}
<p>This is the optimistic-concurrency story (the <code>version</code> field from lesson 2) completing its loop: the server returns 409, the typed error carries the status, and the client knows to refetch.</p>

<h2 id="context">Typed context &amp; a hook contract<a class="anchor" href="#context">#</a></h2>
<p>React Context shares state down the tree. <code>createContext</code> is generic; fjord types it as "the value, or <code>null</code> when used outside a provider", then a custom hook narrows away the <code>null</code> with a runtime guard so consumers never deal with it:</p>
${code(`
interface SpaceContextValue {
  activeSpaceId: string;
  activeSpace: Space | undefined;
  spaces: Space[];
  setActiveSpaceId: (id: string) =&gt; void;
}

const SpaceContext = createContext&lt;SpaceContextValue | null&gt;(null);

export function useActiveSpace(): SpaceContextValue {
  const v = useContext(SpaceContext);
  if (!v) throw new Error("useActiveSpace must be used inside &lt;SpaceProvider&gt;");
  return v;   // narrowed: SpaceContextValue, never null, for every caller
}
`, "frontend/src/lib/SpaceContext.tsx:15")}
<p>The guard turns a possible bug (using the hook outside its provider) into a loud, immediate error — and gives every caller a non-null, fully-typed value. That same "describe the whole surface as an interface" idea scales up to <code>useTaskEditor</code>, whose return type is a 20-method <code>UseTaskEditor</code> interface documenting everything a task drawer can do:</p>
${code(`
export interface UseTaskEditor {
  task: Task | undefined;
  events: TaskEvent[];
  isLoading: boolean;
  error: ApiError | Error | null;
  conflict: string | null;
  update: (patch: Omit&lt;UpdateTaskRequest, "version"&gt;, opts?: { onSuccess?: () =&gt; void }) =&gt; void;
  addComment: (body: string, opts?: { onSuccess?: () =&gt; void }) =&gt; void;
  addBlocker: (blockerId: string) =&gt; void;
  archive: (opts?: { onSuccess?: () =&gt; void; onError?: (err: Error) =&gt; void }) =&gt; void;
  // …~12 more, every capability typed
}
`, "frontend/src/lib/useTaskEditor.ts:18")}
<p>Read that interface and you know exactly what the editor offers without reading its implementation — interfaces as documentation, the idea we opened with in lesson 2, now carrying a whole feature. You've come full circle. <strong>Welcome to the codebase.</strong></p>
`,
  },
];
