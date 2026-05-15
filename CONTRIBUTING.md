# Contributing to agentic-kanban

## Workflow

When working on a GitHub issue:

1. **Pull latest code** from main
2. **Create a branch** with the format: `<prefix>/issue-<number>-<short-title>`
   - Example: `fix/issue-42-task-version-mismatch`
   - Prefix must be one of:
     - `fix` — bug fixes
     - `feat` — new features
     - `refactor` — code cleanup, restructuring
     - `docs` — documentation only
     - `chore` — dependencies, config, tooling, maintenance

3. **Make small, testable commits** with clear messages
   - Imperative mood, present tense: "Add dark mode toggle", not "Added dark mode toggle"
   - Capital letter, concise: "Fix race condition in task update"
   - No prefix (branch already indicates type)

4. **Before opening a PR**, verify all checks pass:
   - `npm test` — backend tests
   - `npm run typecheck` — type checking
   - `npm run build` — full build (shared, frontend, backend)
   - `docker build -t agentic-kanban .` — production image build

5. **Open a PR** linking the issue in the body
   - Reference the issue: "Fixes #42" or "Resolves #42"
   - Describe what you did and why

That's it. Small commits, clear history, all checks green before review.
