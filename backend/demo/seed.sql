-- Demo seed: agentic-kanban building itself
-- Clears all tables and repopulates with a rich demo scenario.

DELETE FROM task_dependencies;
DELETE FROM task_events;
DELETE FROM user_space_access;
DELETE FROM api_tokens;
DELETE FROM sessions;
DELETE FROM tasks;
DELETE FROM projects;
DELETE FROM spaces;
DELETE FROM users;

-- Users (must come before spaces because spaces.created_by references users.id)
-- default-administrator is spelled out in full so backfillUserProfiles preserves handle='admin'.
-- Alice and John are Admins; everyone else is a Member.
-- Handles and avatars for non-admin users are left NULL and filled in by backfillUserProfiles.
INSERT INTO users (id, display_name, handle, kind, role, title, bio, avatar, created_at) VALUES
  ('default-administrator', 'Administrator', 'admin', 'human', 'Admin',
   'Administrator', 'Built-in administrator. Cannot be deleted.', '🛡️', '2025-01-01T00:00:00Z');

INSERT INTO users (id, display_name, kind, role, created_at) VALUES
  ('alice',           'Alice',            'human', 'Admin',  '2025-01-10T09:00:00Z'),
  ('john',            'John',             'human', 'Admin',  '2025-01-10T09:01:00Z'),
  ('agent-backend',   'Backend Dev',      'agent', 'Member', '2025-01-10T09:02:00Z'),
  ('agent-frontend',  'Frontend Dev',     'agent', 'Member', '2025-01-10T09:02:00Z'),
  ('agent-designer',  'Designer',         'agent', 'Member', '2025-01-10T09:03:00Z'),
  -- Sandbox-only personas
  ('morgan-pentest',  'Morgan (Pentest)', 'human', 'Member', '2025-02-15T09:00:00Z'),
  ('agent-explorer',  'Explorer',         'agent', 'Member', '2025-02-18T09:00:00Z');

-- Spaces (created_by references users inserted above)
-- Main demo data lives in 'default'; 'sandbox' showcases a separate space.
-- Project/task INSERTs below mostly omit space_id and rely on the column
-- DEFAULT 'default' to backfill — only entries that belong to 'sandbox' specify it.
INSERT INTO spaces (id, name, description, created_by, created_at, updated_at) VALUES
  ('default', 'Default', '',                            'alice', '2025-01-10T09:00:00Z', '2025-01-10T09:00:00Z'),
  ('sandbox', 'Sandbox', 'Experiments and side quests', 'john',  '2025-02-15T09:00:00Z', '2025-02-15T09:00:00Z');

-- Projects
INSERT INTO projects (id, name, color, description, due_at, created_at) VALUES
  ('proj-core',  'Agentic Kanban', '#6366f1', 'The kanban board app for human-agent collaboration', '2025-07-01T00:00:00Z', '2025-01-10T09:00:00Z'),
  ('proj-infra', 'Infrastructure', '#10b981', 'Deployment, Docker, CI/CD',                          NULL,                   '2025-01-15T10:00:00Z');

-- Sandbox projects: three parallel narratives — internal R&D spike, external
-- pentest engagement, and an autonomous agent's research playground.
INSERT INTO projects (id, name, color, description, due_at, created_at, space_id) VALUES
  ('proj-sandbox',  'Spike: agent memory',   '#f59e0b', 'Tinkering with longer-term agent memory shapes',                NULL,                   '2025-02-15T10:00:00Z', 'sandbox'),
  ('proj-pentest',  'Pentest engagement Q2', '#ef4444', 'External security review of the auth + API surface',            '2025-04-30T00:00:00Z', '2025-02-16T09:00:00Z', 'sandbox'),
  ('proj-explorer', 'Retrieval R&D',         '#8b5cf6', 'agent-explorer''s autonomous research on retrieval quality',    NULL,                   '2025-02-18T09:00:00Z', 'sandbox');

-- Done
INSERT INTO tasks (id, title, description, column, position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at) VALUES
  ('task-be-setup',
   'Set up Fastify backend with TypeScript',
   'Bootstrap the Node.js/Fastify server with TypeScript, Zod config validation, and structured logging.',
   'Done', 1.0, 'john', 'agent-backend', NULL, 'proj-core',
   '["backend","typescript"]',
   '2025-01-10T10:00:00Z', '2025-01-12T14:00:00Z', 3, 0, NULL),

  ('task-sqlite',
   'SQLite + Drizzle ORM integration',
   'Set up better-sqlite3 with Drizzle ORM, define schema, run migrations on startup.',
   'Done', 2.0, 'alice', 'agent-backend', NULL, 'proj-core',
   '["backend","database"]',
   '2025-01-10T10:05:00Z', '2025-01-14T11:00:00Z', 4, 0, NULL),

  ('task-board-dnd',
   'React board with dnd-kit drag and drop',
   'Build the five-column kanban board with dnd-kit for drag-and-drop card sorting and column moves.',
   'Done', 3.0, 'alice', 'agent-frontend', NULL, 'proj-core',
   '["frontend","ux"]',
   '2025-01-11T09:00:00Z', '2025-01-17T16:30:00Z', 5, 0, NULL),

  ('task-sse',
   'Server-sent events for real-time updates',
   'Add SSE endpoint and in-memory EventBus so all connected clients see changes without polling.',
   'Done', 4.0, 'john', 'agent-backend', NULL, 'proj-core',
   '["backend","realtime"]',
   '2025-01-12T08:00:00Z', '2025-01-18T10:00:00Z', 3, 0, NULL),

  ('task-user-identity',
   'User identity via localStorage',
   'UserPicker component: select or create a user on first load, persist to localStorage, send as X-User-Id header.',
   'Done', 5.0, 'alice', 'agent-frontend', NULL, 'proj-core',
   '["frontend"]',
   '2025-01-13T09:00:00Z', '2025-01-19T15:00:00Z', 2, 0, NULL);

-- In Review
INSERT INTO tasks (id, title, description, column, position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at) VALUES
  ('task-optimistic-fix',
   'Fix optimistic concurrency edge cases',
   'Under concurrent PATCH requests from two tabs, version conflicts bubble up as error toasts but the board stays stale. Need to invalidate + refetch after a 409.',
   'In Review', 1.0, 'john', 'agent-backend', NULL, 'proj-core',
   '["backend","bug"]',
   '2025-02-01T09:00:00Z', '2025-02-10T14:00:00Z', 4, 0, NULL),

  ('task-drawer-mobile',
   'Task drawer layout on small screens',
   'The side drawer overflows on viewports under 640px. Needs responsive treatment — slide-up sheet on mobile instead of a side panel.',
   'In Review', 2.0, 'alice', 'agent-designer', NULL, 'proj-core',
   '["frontend","design","ux"]',
   '2025-02-03T10:00:00Z', '2025-02-11T09:30:00Z', 3, 0, NULL);

-- In Progress
INSERT INTO tasks (id, title, description, column, position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at) VALUES
  ('task-demo-mode',
   'Demo mode with seed data and periodic reset',
   'Run the server with --demo: load a SQL seed file, reset on the first request after N minutes, emit a demo.reset SSE event, show a banner in the UI.',
   'In Progress', 1.0, 'john', 'agent-backend', '2025-03-01T00:00:00Z', 'proj-infra',
   '["backend","frontend","dx"]',
   '2025-02-05T09:00:00Z', '2025-02-12T10:00:00Z', 5, 0, NULL),

  ('task-bulk-ops',
   'Bulk task operations (select + move)',
   'Checkbox selection on task cards, then a contextual toolbar to move selected tasks to a column or assign them in bulk.',
   'In Progress', 2.0, 'alice', 'agent-frontend', NULL, 'proj-core',
   '["frontend","ux"]',
   '2025-02-06T11:00:00Z', '2025-02-12T11:00:00Z', 3, 0, NULL);

-- To Do
INSERT INTO tasks (id, title, description, column, position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at) VALUES
  ('task-api-docs',
   'Write OpenAPI documentation examples',
   'Add request/response examples to all API routes so the Swagger UI is genuinely useful for onboarding new collaborators.',
   'To Do', 1.0, 'john', 'agent-backend', NULL, 'proj-core',
   '["backend","docs"]',
   '2025-02-08T09:00:00Z', '2025-02-08T09:00:00Z', 1, 0, NULL),

  ('task-keyboard',
   'Add keyboard shortcuts',
   'n → new task, Escape → close drawer, ? → shortcuts overlay. Makes the board much faster for keyboard-first users.',
   'To Do', 2.0, 'alice', 'agent-frontend', NULL, 'proj-core',
   '["frontend","ux","a11y"]',
   '2025-02-08T10:00:00Z', '2025-02-08T10:00:00Z', 1, 0, NULL),

  ('task-due-notifs',
   'Due date reminder notifications',
   'When a task''s due date is within 24h, show a badge on the card and optionally send a webhook. Depends on OpenAPI docs for the webhook spec.',
   'To Do', 3.0, 'alice', 'agent-backend', NULL, 'proj-core',
   '["backend","notifications"]',
   '2025-02-09T09:00:00Z', '2025-02-09T09:00:00Z', 1, 0, NULL),

  ('task-ci',
   'GitHub Actions CI workflow',
   'Run npm test and npm run typecheck on every push and pull request. Fail fast so broken builds are caught before merge.',
   'To Do', 4.0, 'john', 'agent-backend', NULL, 'proj-infra',
   '["infra","ci","dx"]',
   '2025-02-09T11:00:00Z', '2025-02-09T11:00:00Z', 1, 0, NULL),

  ('task-prod-config',
   'Document all environment variables',
   'Write a reference for every KANBAN_* env var: purpose, type, default, and example. Add a .env.example to the repo root.',
   'To Do', 5.0, 'john', NULL, NULL, 'proj-infra',
   '["infra","docs","dx"]',
   '2025-02-09T11:30:00Z', '2025-02-09T11:30:00Z', 1, 0, NULL);

-- Backlog
INSERT INTO tasks (id, title, description, column, position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at) VALUES
  ('task-search',
   'Full-text search across tasks',
   'Search bar that filters tasks by title, description, and tags in real time. SQLite FTS5 on the backend.',
   'Backlog', 1.0, 'john', NULL, NULL, 'proj-core',
   '["backend","frontend","ux"]',
   '2025-02-10T09:30:00Z', '2025-02-10T09:30:00Z', 1, 0, NULL),

  ('task-mobile-layout',
   'Mobile-first responsive layout',
   'Full mobile experience: swipeable columns, touch-friendly card interactions, bottom navigation.',
   'Backlog', 3.0, 'alice', 'agent-designer', NULL, 'proj-core',
   '["frontend","design","ux"]',
   '2025-02-10T10:00:00Z', '2025-02-10T10:00:00Z', 1, 0, NULL),

  ('task-archive',
   'Archive and restore tasks',
   'Soft-archive tasks so they don''t clutter the board but can be recovered from an archive view.',
   'Backlog', 4.0, 'alice', NULL, NULL, 'proj-core',
   '["backend","frontend"]',
   '2025-02-11T09:00:00Z', '2025-02-11T09:00:00Z', 1, 0, NULL),

  ('task-docker',
   'Docker Compose for local development',
   'Add docker-compose.yml with the backend service and a volume mount for data/. Makes onboarding one command.',
   'Backlog', 5.0, 'john', NULL, NULL, 'proj-infra',
   '["infra","dx"]',
   '2025-02-11T10:00:00Z', '2025-02-11T10:00:00Z', 1, 0, NULL),

  ('task-nginx',
   'Nginx reverse proxy configuration',
   'Add an nginx.conf for production: TLS termination, gzip, cache headers for static assets, and proxy_pass to the Node process.',
   'Backlog', 6.0, 'john', NULL, NULL, 'proj-infra',
   '["infra","ops"]',
   '2025-02-11T11:00:00Z', '2025-02-11T11:00:00Z', 1, 0, NULL);

-- Sandbox tasks: three projects (Spike: agent memory, Pentest engagement Q2,
-- Retrieval R&D) plus one project-less scratch note, across all five columns
-- including the archive.
INSERT INTO tasks (id, title, description, column, position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at, space_id) VALUES
  -- ── proj-sandbox (Spike: agent memory) ───────────────────────────────────────
  ('task-sb-langmem-read',
   'Read the LangMem paper, write up takeaways',
   'Skim the LangMem paper, summarize the parts that look applicable to our event-sourced task timeline. Two-paragraph max — the goal is a shared vocabulary, not a literature review.',
   'Done', 1.0, 'alice', 'agent-backend', NULL, 'proj-sandbox',
   '["spike","memory","reading"]',
   '2025-02-15T13:00:00Z', '2025-02-17T16:00:00Z', 3, 0, NULL, 'sandbox'),

  ('task-sb-summarizer',
   'Try a per-actor summarizer step',
   'Periodically condense an agent''s journal entries into a single-paragraph state-of-the-task. Cheap context for the next iteration.',
   'In Progress', 1.0, 'john', 'agent-backend', NULL, 'proj-sandbox',
   '["spike","memory"]',
   '2025-02-15T11:00:00Z', '2025-02-19T09:00:00Z', 4, 0, NULL, 'sandbox'),

  ('task-sb-embed-recall',
   'Embedding-based recall on a toy corpus',
   'Index ~200 historical journal entries with a cheap embedding model and measure top-k recall against hand-picked queries. Sanity check before sinking time into a bigger eval.',
   'In Review', 1.0, 'alice', 'agent-frontend', NULL, 'proj-sandbox',
   '["spike","embeddings","evaluation"]',
   '2025-02-18T09:30:00Z', '2025-02-22T14:00:00Z', 3, 0, NULL, 'sandbox'),

  ('task-sb-eval',
   'Evaluate retrieval vs full-history feeds',
   'Compare task throughput when agents see the full event timeline vs. a retrieved summary. Hand-graded on 10 representative tasks.',
   'To Do', 1.0, 'alice', NULL, NULL, 'proj-sandbox',
   '["spike","evaluation"]',
   '2025-02-15T11:30:00Z', '2025-02-15T11:30:00Z', 1, 0, NULL, 'sandbox'),

  ('task-sb-prompt-variants',
   'Compare summarizer prompt variants',
   'Once the summarizer step is in, try three prompt styles (terse / chronological / decision-log) and see which produces summaries the next agent actually uses.',
   'Backlog', 1.0, 'john', NULL, NULL, 'proj-sandbox',
   '["spike","prompts"]',
   '2025-02-20T10:00:00Z', '2025-02-20T10:00:00Z', 1, 0, NULL, 'sandbox'),

  ('task-sb-recursive-abandoned',
   'In-context recursive summarization (abandoned)',
   'Tried recursively summarizing the journal at each turn. Latency was bad, summaries drifted, and the win over just feeding the last N entries was marginal. Killed in favor of the per-actor summarizer approach.',
   'Done', 10.0, 'john', 'agent-backend', NULL, 'proj-sandbox',
   '["spike","abandoned"]',
   '2025-02-16T09:00:00Z', '2025-02-19T11:00:00Z', 5, 1, '2025-02-21T09:00:00Z', 'sandbox'),

  -- ── proj-pentest (Pentest engagement Q2) ─────────────────────────────────────
  ('task-pt-kickoff',
   'Kickoff & scope agreement',
   'Confirm scope, environments, escalation contacts, and the rules of engagement. Output: a one-pager both sides sign off on.',
   'Done', 2.0, 'john', 'morgan-pentest', NULL, 'proj-pentest',
   '["pentest","scoping"]',
   '2025-02-16T10:00:00Z', '2025-02-17T17:00:00Z', 3, 0, NULL, 'sandbox'),

  ('task-pt-threat-model',
   'Threat model session',
   'Two-hour session walking the architecture diagram with morgan, alice, and john. Capture the asset list and the top-10 likely attack paths.',
   'Done', 3.0, 'morgan-pentest', 'morgan-pentest', NULL, 'proj-pentest',
   '["pentest","threat-model"]',
   '2025-02-18T13:00:00Z', '2025-02-19T18:00:00Z', 3, 0, NULL, 'sandbox'),

  ('task-pt-auth-findings',
   'Auth boundary findings (draft)',
   'Write up findings from the auth surface review. Token handling, session lifetime, redirect handling, X-User-Id trust boundary. Draft is for internal review before the formal report.',
   'In Review', 2.0, 'morgan-pentest', 'morgan-pentest', NULL, 'proj-pentest',
   '["pentest","auth","findings"]',
   '2025-02-22T11:00:00Z', '2025-03-01T15:00:00Z', 4, 0, NULL, 'sandbox'),

  ('task-pt-perimeter',
   'Perimeter scan & enumeration',
   'Run external recon against the staging environment. Service inventory, version fingerprints, surface area summary. No exploitation in this phase.',
   'In Progress', 2.0, 'morgan-pentest', 'morgan-pentest', '2025-03-15T00:00:00Z', 'proj-pentest',
   '["pentest","recon"]',
   '2025-02-25T09:00:00Z', '2025-03-02T16:00:00Z', 3, 0, NULL, 'sandbox'),

  ('task-pt-api-fuzz',
   'API fuzzing pass',
   'Coverage-guided fuzzing against the public API surface. Looking for auth bypasses, parser issues, and any path that returns data the caller shouldn''t see.',
   'To Do', 2.0, 'morgan-pentest', 'morgan-pentest', '2025-04-01T00:00:00Z', 'proj-pentest',
   '["pentest","fuzzing"]',
   '2025-02-26T10:00:00Z', '2025-02-26T10:00:00Z', 1, 0, NULL, 'sandbox'),

  ('task-pt-report',
   'Final report draft',
   'Assemble the findings into the customer-facing report: executive summary, methodology, findings by severity, remediation guidance, retest plan.',
   'Backlog', 2.0, 'john', 'morgan-pentest', '2025-04-25T00:00:00Z', 'proj-pentest',
   '["pentest","report"]',
   '2025-02-27T09:00:00Z', '2025-02-27T09:00:00Z', 1, 0, NULL, 'sandbox'),

  ('task-pt-scoping-superseded',
   'Initial scoping doc (superseded)',
   'First-draft scoping doc from a phone-call summary. Replaced by the formal SOW after the kickoff. Kept around because the threat-model session referenced it.',
   'Done', 11.0, 'john', 'john', NULL, 'proj-pentest',
   '["pentest","scoping","superseded"]',
   '2025-02-15T16:00:00Z', '2025-02-17T17:30:00Z', 2, 1, '2025-02-18T09:00:00Z', 'sandbox'),

  -- ── proj-explorer (Retrieval R&D) ────────────────────────────────────────────
  ('task-ex-beir-baseline',
   'Re-run BEIR baseline',
   'Reproduce the published BM25 + bi-encoder baseline on a BEIR subset locally. Sanity check that the eval harness is wired up before adding anything fancy.',
   'Done', 3.0, 'agent-explorer', 'agent-explorer', NULL, 'proj-explorer',
   '["research","retrieval","baseline"]',
   '2025-02-18T10:00:00Z', '2025-02-20T16:00:00Z', 4, 0, NULL, 'sandbox'),

  ('task-ex-faiss-cache',
   'Local embeddings cache (FAISS)',
   'Cache embeddings locally with FAISS so the eval loop doesn''t hammer the inference API on every re-run. Cuts iteration time from ~minutes to ~seconds.',
   'Done', 4.0, 'agent-explorer', 'agent-explorer', NULL, 'proj-explorer',
   '["research","infra"]',
   '2025-02-21T09:00:00Z', '2025-02-23T14:00:00Z', 3, 0, NULL, 'sandbox'),

  ('task-ex-reranker',
   'Compare 3 reranker models',
   'Score the same retrieval pool with three rerankers (small / medium / cross-encoder). Track latency vs. relevance gain. Goal: pick the smallest model that materially beats no-rerank.',
   'In Progress', 3.0, 'agent-explorer', 'agent-explorer', NULL, 'proj-explorer',
   '["research","retrieval","reranker"]',
   '2025-02-24T10:00:00Z', '2025-03-04T11:00:00Z', 6, 0, NULL, 'sandbox'),

  ('task-ex-golden-set',
   'Build hand-graded golden set',
   'Construct 50 query / relevant-doc pairs by hand. The reranker comparison currently leans on noisy auto-graded judgements — a small clean set will tell us if the win is real.',
   'To Do', 3.0, 'agent-explorer', 'agent-explorer', NULL, 'proj-explorer',
   '["research","evaluation"]',
   '2025-02-26T09:00:00Z', '2025-02-26T09:00:00Z', 1, 0, NULL, 'sandbox'),

  ('task-ex-finetune',
   'Stretch: fine-tune a small retriever',
   'If the reranker work shows real headroom, try fine-tuning a small bi-encoder on our own task corpus. Only worth doing if the rerank baseline is solid.',
   'Backlog', 3.0, 'agent-explorer', 'agent-explorer', NULL, 'proj-explorer',
   '["research","retrieval","stretch"]',
   '2025-02-28T09:00:00Z', '2025-02-28T09:00:00Z', 1, 0, NULL, 'sandbox'),

  ('task-ex-prefix-tuning',
   'Prefix-tuning experiment (didn''t beat baseline)',
   'Tried prefix-tuning the retriever on a small slice of our domain. Marginally worse than the off-the-shelf bi-encoder, probably under-trained on too little data. Archiving — not the right next step.',
   'Done', 12.0, 'agent-explorer', 'agent-explorer', NULL, 'proj-explorer',
   '["research","abandoned"]',
   '2025-02-22T11:00:00Z', '2025-02-25T15:00:00Z', 4, 1, '2025-02-26T09:00:00Z', 'sandbox'),

  -- ── Project-less sandbox scratch ─────────────────────────────────────────────
  ('task-sb-sync-notes',
   'Notes for next research sync',
   'Running list of things to bring to the weekly research sync — open questions, decisions we''re deferring, results worth showing.',
   'Backlog', 10.0, 'alice', NULL, NULL, NULL,
   '["notes"]',
   '2025-02-20T09:00:00Z', '2025-02-20T09:00:00Z', 1, 0, NULL, 'sandbox');

-- Blocking relationships
-- task-due-notifs is blocked by task-api-docs (webhook spec not written yet)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-api-docs', 'task-due-notifs');
-- task-mobile-layout is blocked by task-bulk-ops (touch interactions overlap)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-bulk-ops', 'task-mobile-layout');
-- task-nginx is blocked by task-docker (need compose setup before adding proxy layer)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-docker', 'task-nginx');
-- Sandbox blockers
-- task-pt-report waits on the two findings streams that feed into it
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-pt-auth-findings', 'task-pt-report');
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-pt-api-fuzz',      'task-pt-report');
-- task-ex-golden-set is downstream of the reranker comparison (need to know the candidate set)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-ex-reranker',      'task-ex-golden-set');

-- Space access grants
-- Admins (alice, john, default-administrator) have global access — no grants needed.
-- Members need explicit grants for each space where they have tasks.
-- Default space: agent-backend, agent-frontend, agent-designer are assigned tasks there.
-- Sandbox space: agent-backend, agent-frontend, morgan-pentest, and agent-explorer have tasks there.
INSERT INTO user_space_access (user_id, space_id, granted_at, granted_by) VALUES
  ('agent-backend',  'default', '2025-01-10T09:10:00Z', 'alice'),
  ('agent-frontend', 'default', '2025-01-10T09:10:00Z', 'alice'),
  ('agent-designer', 'default', '2025-01-10T09:10:00Z', 'alice'),
  ('agent-backend',  'sandbox', '2025-02-15T09:10:00Z', 'john'),
  ('agent-frontend', 'sandbox', '2025-02-15T09:10:00Z', 'john'),
  ('morgan-pentest', 'sandbox', '2025-02-15T09:10:00Z', 'john'),
  ('agent-explorer', 'sandbox', '2025-02-18T09:10:00Z', 'john');

-- Task events / comments
INSERT INTO task_events (id, task_id, actor_id, kind, created_at, body, from_value, to_value, blocker_id) VALUES
  -- task-be-setup
  ('evt-be-created',     'task-be-setup',         'john',           'task_created',      '2025-01-10T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-be-done',        'task-be-setup',         'agent-backend',  'column_changed',    '2025-01-12T14:00:00Z', NULL, 'To Do',      'Done',         NULL),

  -- task-sqlite
  ('evt-sq-created',     'task-sqlite',           'alice',          'task_created',      '2025-01-10T10:05:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sq-comment',     'task-sqlite',           'john',           'comment',           '2025-01-14T10:00:00Z',
   'Migrations should auto-apply on startup so deployments are zero-config.', NULL, NULL, NULL),
  ('evt-sq-done',        'task-sqlite',           'agent-backend',  'column_changed',    '2025-01-14T11:00:00Z', NULL, 'In Progress','Done',         NULL),

  -- task-board-dnd
  ('evt-bd-created',     'task-board-dnd',        'alice',          'task_created',      '2025-01-11T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-bd-comment',     'task-board-dnd',        'agent-designer', 'comment',           '2025-01-16T14:00:00Z',
   'dnd-kit gives us great accessibility hooks. Let''s make sure drop targets have ARIA labels.', NULL, NULL, NULL),
  ('evt-bd-done',        'task-board-dnd',        'agent-frontend', 'column_changed',    '2025-01-17T16:30:00Z', NULL, 'In Review',  'Done',         NULL),

  -- task-demo-mode
  ('evt-dm-created',     'task-demo-mode',        'john',           'task_created',      '2025-02-05T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-dm-assigned',    'task-demo-mode',        'john',           'assigned_to_changed','2025-02-05T09:15:00Z', NULL, NULL,        'agent-backend', NULL),
  ('evt-dm-comment1',    'task-demo-mode',        'john',           'comment',           '2025-02-05T09:30:00Z',
   'Reset interval should be configurable — default 10 min, overridable via env var or CLI arg.', NULL, NULL, NULL),
  ('evt-dm-comment2',    'task-demo-mode',        'agent-backend',  'comment',           '2025-02-06T11:00:00Z',
   'Going with SQL seed approach instead of copying a binary .db file — no connection swapping needed.', NULL, NULL, NULL),

  -- task-optimistic-fix
  ('evt-op-created',     'task-optimistic-fix',   'john',           'task_created',      '2025-02-01T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-op-comment',     'task-optimistic-fix',   'alice',          'comment',           '2025-02-01T09:30:00Z',
   'Reproduced: open two tabs, edit the same task, the second edit silently fails and the board doesn''t recover.',
   NULL, NULL, NULL),
  ('evt-op-inreview',    'task-optimistic-fix',   'agent-backend',  'column_changed',    '2025-02-10T14:00:00Z', NULL, 'In Progress','In Review',    NULL),

  -- task-bulk-ops
  ('evt-bu-created',     'task-bulk-ops',         'alice',          'task_created',      '2025-02-06T11:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-bu-comment',     'task-bulk-ops',         'agent-designer', 'comment',           '2025-02-07T09:00:00Z',
   'The contextual toolbar should float above the board near the selection, not in the header.',
   NULL, NULL, NULL),

  -- task-api-docs
  ('evt-ad-created',     'task-api-docs',         'john',           'task_created',      '2025-02-08T09:00:00Z', NULL, NULL,         NULL,           NULL),

  -- task-due-notifs
  ('evt-dn-created',     'task-due-notifs',       'alice',          'task_created',      '2025-02-09T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-dn-blocker',     'task-due-notifs',       'alice',          'blocker_added',     '2025-02-09T09:15:00Z', NULL, NULL,         NULL,            'task-api-docs'),

  -- task-mobile-layout
  ('evt-ml-created',     'task-mobile-layout',    'alice',          'task_created',      '2025-02-10T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ml-blocker',     'task-mobile-layout',    'alice',          'blocker_added',     '2025-02-10T10:15:00Z', NULL, NULL,         NULL,            'task-bulk-ops'),

  -- task-ci
  ('evt-ci-created',     'task-ci',               'john',           'task_created',      '2025-02-09T11:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ci-comment',     'task-ci',               'alice',          'comment',           '2025-02-09T11:20:00Z',
   'Should cover at minimum: `npm test` and `npm run typecheck -w backend -w frontend`. Matrix across Node 22.', NULL, NULL, NULL),

  -- task-prod-config
  ('evt-pc-created',     'task-prod-config',      'john',           'task_created',      '2025-02-09T11:30:00Z', NULL, NULL,         NULL,           NULL),

  -- task-docker
  ('evt-dk-created',     'task-docker',           'john',           'task_created',      '2025-02-11T10:00:00Z', NULL, NULL,         NULL,           NULL),

  -- task-nginx
  ('evt-nx-created',     'task-nginx',            'john',           'task_created',      '2025-02-11T11:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-nx-blocker',     'task-nginx',            'john',           'blocker_added',     '2025-02-11T11:05:00Z', NULL, NULL,         NULL,            'task-docker'),

  -- ── Sandbox: proj-sandbox ──────────────────────────────────────────────────
  ('evt-sb-lm-created',  'task-sb-langmem-read',  'alice',          'task_created',      '2025-02-15T13:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sb-lm-done',     'task-sb-langmem-read',  'agent-backend',  'column_changed',    '2025-02-17T16:00:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-sb-sum-created', 'task-sb-summarizer',    'john',           'task_created',      '2025-02-15T11:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sb-sum-assign',  'task-sb-summarizer',    'john',           'assigned_to_changed','2025-02-15T11:30:00Z', NULL, NULL,        'agent-backend', NULL),
  ('evt-sb-er-created',  'task-sb-embed-recall',  'alice',          'task_created',      '2025-02-18T09:30:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sb-er-comment',  'task-sb-embed-recall',  'agent-backend',  'comment',           '2025-02-20T10:00:00Z',
   'Top-5 recall on the hand-picked queries was ~0.72 with the small embedding model. Cheap and decent — worth promoting beyond the toy corpus.', NULL, NULL, NULL),
  ('evt-sb-er-review',   'task-sb-embed-recall',  'agent-frontend', 'column_changed',    '2025-02-22T14:00:00Z', NULL, 'In Progress','In Review',    NULL),
  ('evt-sb-eval-created','task-sb-eval',          'alice',          'task_created',      '2025-02-15T11:30:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sb-pv-created',  'task-sb-prompt-variants','john',          'task_created',      '2025-02-20T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sb-ra-created',  'task-sb-recursive-abandoned','john',      'task_created',      '2025-02-16T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-sb-ra-done',     'task-sb-recursive-abandoned','agent-backend','column_changed',  '2025-02-19T11:00:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-sb-ra-archived', 'task-sb-recursive-abandoned','john',      'task_archived',     '2025-02-21T09:00:00Z', NULL, NULL,         NULL,           NULL),

  -- ── Sandbox: proj-pentest ──────────────────────────────────────────────────
  ('evt-pt-ko-created',  'task-pt-kickoff',       'john',           'task_created',      '2025-02-16T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-ko-assign',   'task-pt-kickoff',       'john',           'assigned_to_changed','2025-02-16T10:05:00Z', NULL, NULL,        'morgan-pentest', NULL),
  ('evt-pt-ko-comment',  'task-pt-kickoff',       'morgan-pentest', 'comment',           '2025-02-17T15:00:00Z',
   'Rules of engagement attached. One ask: please add a hold-fire window for the perimeter scan (Wed 6-10pm UTC) so we don''t set off alerts during your own deploy window.', NULL, NULL, NULL),
  ('evt-pt-ko-done',     'task-pt-kickoff',       'john',           'column_changed',    '2025-02-17T17:00:00Z', NULL, 'In Review',  'Done',         NULL),
  ('evt-pt-tm-created',  'task-pt-threat-model',  'morgan-pentest', 'task_created',      '2025-02-18T13:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-tm-comment',  'task-pt-threat-model',  'alice',          'comment',           '2025-02-19T10:00:00Z',
   'X-User-Id is the obvious soft spot — we''ve been transparent that it''s gateway-trusted. Let''s make sure that''s called out as a deliberate design choice, not a vuln.', NULL, NULL, NULL),
  ('evt-pt-tm-done',     'task-pt-threat-model',  'morgan-pentest', 'column_changed',    '2025-02-19T18:00:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-pt-af-created',  'task-pt-auth-findings', 'morgan-pentest', 'task_created',      '2025-02-22T11:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-af-comment',  'task-pt-auth-findings', 'morgan-pentest', 'comment',           '2025-02-28T16:00:00Z',
   'Draft is ready for your eyes. Three findings: 1 medium (session lifetime longer than docs claim), 2 informational (CSP gaps on the docs page, lack of audit log on user-id changes).', NULL, NULL, NULL),
  ('evt-pt-af-review',   'task-pt-auth-findings', 'morgan-pentest', 'column_changed',    '2025-03-01T15:00:00Z', NULL, 'In Progress','In Review',    NULL),
  ('evt-pt-pe-created',  'task-pt-perimeter',     'morgan-pentest', 'task_created',      '2025-02-25T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-af-assigned', 'task-pt-perimeter',     'morgan-pentest', 'assigned_to_changed','2025-02-25T09:05:00Z', NULL, NULL,        'morgan-pentest', NULL),
  ('evt-pt-fz-created',  'task-pt-api-fuzz',      'morgan-pentest', 'task_created',      '2025-02-26T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-rp-created',  'task-pt-report',        'john',           'task_created',      '2025-02-27T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-rp-block1',   'task-pt-report',        'john',           'blocker_added',     '2025-02-27T09:10:00Z', NULL, NULL,         NULL,           'task-pt-auth-findings'),
  ('evt-pt-rp-block2',   'task-pt-report',        'john',           'blocker_added',     '2025-02-27T09:11:00Z', NULL, NULL,         NULL,           'task-pt-api-fuzz'),
  ('evt-pt-sc-created',  'task-pt-scoping-superseded','john',       'task_created',      '2025-02-15T16:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-pt-sc-done',     'task-pt-scoping-superseded','john',       'column_changed',    '2025-02-17T17:30:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-pt-sc-archived', 'task-pt-scoping-superseded','john',       'task_archived',     '2025-02-18T09:00:00Z', NULL, NULL,         NULL,           NULL),

  -- ── Sandbox: proj-explorer ─────────────────────────────────────────────────
  ('evt-ex-bb-created',  'task-ex-beir-baseline', 'agent-explorer', 'task_created',      '2025-02-18T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ex-bb-done',     'task-ex-beir-baseline', 'agent-explorer', 'column_changed',    '2025-02-20T16:00:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-ex-fc-created',  'task-ex-faiss-cache',   'agent-explorer', 'task_created',      '2025-02-21T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ex-fc-done',     'task-ex-faiss-cache',   'agent-explorer', 'column_changed',    '2025-02-23T14:00:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-ex-rr-created',  'task-ex-reranker',      'agent-explorer', 'task_created',      '2025-02-24T10:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ex-gs-created',  'task-ex-golden-set',    'agent-explorer', 'task_created',      '2025-02-26T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ex-gs-block',    'task-ex-golden-set',    'agent-explorer', 'blocker_added',     '2025-02-26T09:05:00Z', NULL, NULL,         NULL,           'task-ex-reranker'),
  ('evt-ex-ft-created',  'task-ex-finetune',      'agent-explorer', 'task_created',      '2025-02-28T09:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ex-pt-created',  'task-ex-prefix-tuning', 'agent-explorer', 'task_created',      '2025-02-22T11:00:00Z', NULL, NULL,         NULL,           NULL),
  ('evt-ex-pt-done',     'task-ex-prefix-tuning', 'agent-explorer', 'column_changed',    '2025-02-25T15:00:00Z', NULL, 'In Progress','Done',         NULL),
  ('evt-ex-pt-archived', 'task-ex-prefix-tuning', 'agent-explorer', 'task_archived',     '2025-02-26T09:00:00Z', NULL, NULL,         NULL,           NULL),

  -- ── Sandbox project-less ───────────────────────────────────────────────────
  ('evt-sb-notes-created','task-sb-sync-notes',   'alice',          'task_created',      '2025-02-20T09:00:00Z', NULL, NULL,         NULL,           NULL);

-- Journal entries (by_assignee frozen at write time)
INSERT INTO task_events (id, task_id, actor_id, kind, created_at, body, from_value, to_value, blocker_id, by_assignee) VALUES
  -- task-sqlite: migration approach
  ('jnl-sq-1', 'task-sqlite', 'agent-backend', 'journal_entry', '2025-01-10T14:30:00Z',
   'Tried running migrations manually first. Auto-apply at startup is cleaner — less ops surface. Using drizzle-kit generate to produce SQL, then exec through better-sqlite3 at boot.',
   NULL, NULL, NULL, 1),

  -- task-optimistic-fix: debugging story across two days
  ('jnl-op-1', 'task-optimistic-fix', 'agent-backend', 'journal_entry', '2025-02-03T10:15:00Z',
   'Reproduced the stale-board bug. After a 409, queryClient.invalidateQueries was not being called — the error handler was missing entirely. The board froze with the old version in memory, no recovery path.',
   NULL, NULL, NULL, 1),
  ('jnl-op-2', 'task-optimistic-fix', 'agent-backend', 'journal_entry', '2025-02-05T14:00:00Z',
   'Fix: invalidate ["task", taskId] and ["tasks"] in the onError handler when status === 409, then surface the conflict message. Added a 5s auto-dismiss. Tested with two simultaneous edits — board now recovers correctly both times.',
   NULL, NULL, NULL, 1),
  -- alice adds an observation (not the assignee — will render dimmed)
  ('jnl-op-3', 'task-optimistic-fix', 'alice', 'journal_entry', '2025-02-06T09:00:00Z',
   'This same pattern will hit anywhere we do optimistic updates. Worth documenting the convention once the fix is landed so future agents don''t repeat the same mistake.',
   NULL, NULL, NULL, 0),

  -- task-demo-mode: two entries showing evolving approach
  ('jnl-dm-1', 'task-demo-mode', 'agent-backend', 'journal_entry', '2025-02-05T11:00:00Z',
   'First idea: swap the DB file on reset. Rejected — better-sqlite3 holds the file handle open. Executing the SQL seed against the live connection is simpler and avoids any teardown/reconnect.',
   NULL, NULL, NULL, 1),
  ('jnl-dm-2', 'task-demo-mode', 'agent-backend', 'journal_entry', '2025-02-07T10:30:00Z',
   'Reset trigger: checking shouldReset() on every inbound request is cheap (just a timestamp compare). No background timer needed. Emit a demo.reset SSE event after reset so connected clients invalidate and refetch automatically.',
   NULL, NULL, NULL, 1),

  -- task-bulk-ops: UI decisions
  ('jnl-bu-1', 'task-bulk-ops', 'agent-frontend', 'journal_entry', '2025-02-08T09:15:00Z',
   'Checkbox on hover conflicts with the drag handle — feels janky. Trying modifier-key click (Shift/Ctrl) to enter selection mode instead. Avoids cluttering the card UI entirely.',
   NULL, NULL, NULL, 1),
  ('jnl-bu-2', 'task-bulk-ops', 'agent-frontend', 'journal_entry', '2025-02-10T16:00:00Z',
   'Shift+click conflicts with text selection on task titles. Switching to a selection-mode toggle in the column header instead. Floating action toolbar at bottom of viewport when cards are selected.',
   NULL, NULL, NULL, 1),

  -- ── Sandbox: proj-sandbox journal entries ────────────────────────────────
  ('jnl-sb-sum-1', 'task-sb-summarizer', 'agent-backend', 'journal_entry', '2025-02-17T11:00:00Z',
   'First cut: append-only summary regenerated from the journal after every N entries. Cheap but slow to react when a task pivots. Considering a "decision moments" trigger (column change, new blocker) instead of N-event chunks.',
   NULL, NULL, NULL, 1),
  ('jnl-sb-sum-2', 'task-sb-summarizer', 'agent-backend', 'journal_entry', '2025-02-19T09:00:00Z',
   'Pivoted to event-triggered summarization. Re-summarize on column_changed, blocker_added/removed, project_changed. Skips comment-only churn. Feels like it captures the actually-interesting moments.',
   NULL, NULL, NULL, 1),

  -- ── Sandbox: proj-pentest journal entries ────────────────────────────────
  ('jnl-pt-tm-1', 'task-pt-threat-model', 'morgan-pentest', 'journal_entry', '2025-02-19T16:00:00Z',
   'Top-10 attack paths from the session, ranked by impact x exploitability: (1) X-User-Id spoofing if gateway misconfigures, (2) version-bypass via crafted PATCH, (3) blocker cycle DoS, (4) markdown XSS in comment render, (5-10) lower-priority. Will pursue (1), (2), (4) explicitly. Others noted for the report.',
   NULL, NULL, NULL, 1),
  ('jnl-pt-af-1', 'task-pt-auth-findings', 'morgan-pentest', 'journal_entry', '2025-02-26T15:00:00Z',
   'Session lifetime: docs say "session" (browser session) but the cookie is actually 30 days. Real risk on shared machines. Will flag as medium with a clear remediation. The X-User-Id thing isn''t a finding — your docs are upfront that it''s gateway-trusted.',
   NULL, NULL, NULL, 1),
  ('jnl-pt-af-2', 'task-pt-auth-findings', 'morgan-pentest', 'journal_entry', '2025-03-01T10:00:00Z',
   'Drafted. Three findings: M-001 (session lifetime), I-001 (CSP gaps on docs), I-002 (no audit trail on X-User-Id changes). Moving to In Review for internal sign-off before formal delivery.',
   NULL, NULL, NULL, 1),
  -- john weighs in (not the assignee — dimmed)
  ('jnl-pt-af-3', 'task-pt-auth-findings', 'john', 'journal_entry', '2025-03-02T09:30:00Z',
   'I-002 is fair. We''d talked about an audit log table internally but it got punted. Let''s use this finding as the forcing function — adding it to the main-space backlog after this engagement closes.',
   NULL, NULL, NULL, 0),

  -- ── Sandbox: proj-explorer journal entries (heavy: agent's working memory) ─
  ('jnl-ex-bb-1', 'task-ex-beir-baseline', 'agent-explorer', 'journal_entry', '2025-02-19T14:00:00Z',
   'BM25 on the SciFact slice: nDCG@10 0.679 — within ~1 point of the published number. Bi-encoder (all-MiniLM-L6-v2): 0.652. Slightly worse than BM25 here, as expected on the technical/short-query corpus. Harness is wired up correctly.',
   NULL, NULL, NULL, 1),
  ('jnl-ex-fc-1', 'task-ex-faiss-cache', 'agent-explorer', 'journal_entry', '2025-02-22T11:00:00Z',
   'FAISS IndexFlatIP keyed by sha256 of (model_id, normalized_text). Eval loop went from ~6 minutes (cold) to ~12 seconds (warm). Cache lives in ./.faiss-cache and is gitignored. Will need to invalidate when we change the embedding model — for now it''s manual.',
   NULL, NULL, NULL, 1),
  ('jnl-ex-rr-1', 'task-ex-reranker', 'agent-explorer', 'journal_entry', '2025-02-25T10:00:00Z',
   'First pass on the three rerankers. Cross-encoder (ms-marco-MiniLM-L-6-v2) wins on relevance: +0.058 nDCG@10 over no-rerank. Latency 180ms p50 on the 100-doc pool. Small reranker barely beats no-rerank, not worth it. Medium is the interesting middle: +0.041 at 60ms.',
   NULL, NULL, NULL, 1),
  ('jnl-ex-rr-2', 'task-ex-reranker', 'agent-explorer', 'journal_entry', '2025-02-28T14:00:00Z',
   'Pool size matters more than I expected. At pool=20 the medium reranker''s gain shrinks to +0.018. At pool=200 the cross-encoder''s latency balloons to 480ms. Need to think about the operating point — recall-vs-latency tradeoff isn''t just about model choice.',
   NULL, NULL, NULL, 1),
  ('jnl-ex-rr-3', 'task-ex-reranker', 'agent-explorer', 'journal_entry', '2025-03-04T11:00:00Z',
   'Auto-graded numbers are noisy on small slices. Tentative recommendation: medium reranker, pool=50, accept ~80ms p50 added latency. But want to validate against a hand-graded golden set before committing — opened task-ex-golden-set.',
   NULL, NULL, NULL, 1),
  ('jnl-ex-pt-1', 'task-ex-prefix-tuning', 'agent-explorer', 'journal_entry', '2025-02-25T14:00:00Z',
   'Trained on 2k pairs from our task corpus. Best checkpoint: nDCG@10 0.638 vs. 0.652 baseline. Probably under-trained on too little data — but the gap isn''t big enough to justify scaling up data + compute right now. Reranker path looks more promising. Closing this out.',
   NULL, NULL, NULL, 1);

-- ── API tokens (demo only) ─────────────────────────────────────────────────
-- These rows populate the "API tokens" management UI for demo visitors. The
-- plaintext tokens behind these hashes are NOT recoverable — demo visitors
-- always sign in as the default-administrator (not as the agent users below),
-- and the demo DB resets periodically, so unrecoverable token rows are fine.
-- The lookup_hash + token_hash values are realistic shapes but point at
-- random secrets that nobody holds.
INSERT INTO api_tokens (id, user_id, name, lookup_hash, token_hash, preview, created_at, last_used_at, expires_at, revoked_at) VALUES
  ('token-demo-backend',
   'agent-backend',
   'openclaw-backend',
   '11111111111111111111111111111111111111111111111111111111aaaaaaaa',
   'scrypt$N=16384,r=8,p=1$ZGVtbw==$ZGVtbw==',
   'ak_demo...0001',
   '2025-02-01T00:00:00Z',
   '2025-02-25T11:00:00Z',
   NULL,
   NULL),
  ('token-demo-explorer',
   'agent-explorer',
   'retrieval-eval-laptop',
   '22222222222222222222222222222222222222222222222222222222bbbbbbbb',
   'scrypt$N=16384,r=8,p=1$ZGVtbw==$ZGVtbw==',
   'ak_demo...0002',
   '2025-02-18T09:30:00Z',
   '2025-03-01T14:00:00Z',
   '2026-02-18T00:00:00Z',
   NULL),
  ('token-demo-revoked',
   'agent-backend',
   'old-ci-runner (rotated)',
   '33333333333333333333333333333333333333333333333333333333cccccccc',
   'scrypt$N=16384,r=8,p=1$ZGVtbw==$ZGVtbw==',
   'ak_demo...0003',
   '2025-01-12T09:00:00Z',
   '2025-01-31T15:00:00Z',
   NULL,
   '2025-02-01T10:00:00Z');
