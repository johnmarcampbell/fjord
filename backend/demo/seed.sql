-- Demo seed: agentic-kanban building itself
-- Clears all tables and repopulates with a rich demo scenario.

DELETE FROM task_dependencies;
DELETE FROM task_events;
DELETE FROM tasks;
DELETE FROM projects;
DELETE FROM users;

-- Users
INSERT INTO users (id, display_name, kind, created_at) VALUES
  ('alice',           'Alice',            'human', '2025-01-10T09:00:00Z'),
  ('john',            'John',             'human', '2025-01-10T09:01:00Z'),
  ('agent-backend',   'Backend Dev',      'agent', '2025-01-10T09:02:00Z'),
  ('agent-frontend',  'Frontend Dev',     'agent', '2025-01-10T09:02:00Z'),
  ('agent-designer',  'Designer',         'agent', '2025-01-10T09:03:00Z');

-- Projects
INSERT INTO projects (id, name, color, description, due_at, created_at) VALUES
  ('proj-core',  'Agentic Kanban', '#6366f1', 'The kanban board app for human-agent collaboration', '2025-07-01T00:00:00Z', '2025-01-10T09:00:00Z'),
  ('proj-infra', 'Infrastructure', '#10b981', 'Deployment, Docker, CI/CD',                          NULL,                   '2025-01-15T10:00:00Z');

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

-- Blocking relationships
-- task-due-notifs is blocked by task-api-docs (webhook spec not written yet)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-api-docs', 'task-due-notifs');
-- task-mobile-layout is blocked by task-bulk-ops (touch interactions overlap)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-bulk-ops', 'task-mobile-layout');
-- task-nginx is blocked by task-docker (need compose setup before adding proxy layer)
INSERT INTO task_dependencies (blocker_id, blocked_id) VALUES ('task-docker', 'task-nginx');

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
  ('evt-nx-blocker',     'task-nginx',            'john',           'blocker_added',     '2025-02-11T11:05:00Z', NULL, NULL,         NULL,            'task-docker');

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
   NULL, NULL, NULL, 1);
