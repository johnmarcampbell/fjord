# Contributing to agentic-kanban

When adding a feature or fixing a bug, the goal is not to introduce the minimal set of changes that leads to a correct implementation — be ambitious about how the new behavior fits into the codebase. Where applicable, introduce new abstractions to fold your feature in with existing behavior. Prefer that single well-scoped abstraction over scattering feature-specific logic across existing shared paths. If your change requires threading new conditionals through code that previously had nothing to do with your feature, treat that as a signal to introduce a proper boundary first rather than distribute the complexity. Any existing code you have to touch in the process should come away cleaner than it was — feature logic pushed behind a clean interface, not woven into the surrounding flow. Keep any single file under 1000 lines; if the feature would push past that, decompose before you build. Write direct, legible code without magic or clever indirection: the next person should be able to read your addition and understand immediately what it owns, what it doesn't, and why it lives where it does.

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
