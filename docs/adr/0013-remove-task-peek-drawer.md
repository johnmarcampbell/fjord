# Remove the task peek drawer — every task reference navigates to its page

The `TaskDrawer` started as the workhorse for editing, commenting, journalling, and
managing blockers. The pages-first redesign then introduced full-page surfaces —
the task detail page (`/tasks/:id`, [ADR-referenced plan](../plans/issue-58-task-detail-page.md)),
the project page (`/projects/:id`, #91), and the new-task page (`/tasks/new`, #82) —
and #58 deliberately slimmed the drawer down to a read-only "peek" with an
"Open full view" link. In practice the peek became an awkward middle layer that the
sole human users always clicked past on their way to the full page, so #109 removes
it entirely: `TaskDrawer.tsx` is deleted and every entry point — board cards, backlog
and archive rows, project/space task rows, and blocker chips on a task page — navigates
to `/tasks/:id` instead of opening an overlay. Cards and rows become real
`react-router` `<Link>`s, which (a) makes the URL the single source of truth for which
task you're looking at and (b) adds ⌘-click / middle-click "open in new tab" — a
capability the overlay could never offer. We considered keeping a lightweight peek for
just the blocker-chip case (the one spot where peeking a *different* task without leaving
the current one had non-redundant value), but keeping the whole component alive to serve
one narrow case was judged worse than the consistency of "every task reference behaves
identically." Reversal cost is moderate: the mutation logic still lives in the shared
`useTaskEditor` hook, so a future peek could be rebuilt as a thin alternate view — but
the muscle memory of "click a card to peek" is intentionally gone.
