import type { Column, Task, User } from "@agentic-kanban/shared";

export type SortField = "progress" | "due_date";
export type SortDir = "asc" | "desc";

const COLUMN_RANK: Record<Column, number> = {
  Backlog: 0,
  "To Do": 1,
  "In Progress": 2,
  "In Review": 3,
  Done: 4,
};

const COLUMN_CHIP: Record<Column, string> = {
  Backlog: "bg-surface-subtle text-ink-subtle",
  "To Do": "bg-surface-hover text-ink-muted",
  "In Progress": "bg-accent/15 text-accent",
  "In Review": "bg-tag-bg text-tag-text",
  Done: "bg-surface-hover text-ink",
};

export function compareTasks(a: Task, b: Task, field: SortField, dir: SortDir): number {
  let cmp = 0;
  if (field === "progress") {
    cmp = COLUMN_RANK[a.column] - COLUMN_RANK[b.column];
  } else {
    const av = a.due_at === null ? Number.POSITIVE_INFINITY : Date.parse(a.due_at);
    const bv = b.due_at === null ? Number.POSITIVE_INFINITY : Date.parse(b.due_at);
    cmp = av - bv;
  }
  if (cmp === 0) cmp = a.position - b.position;
  if (cmp === 0) cmp = a.created_at.localeCompare(b.created_at);
  return dir === "asc" ? cmp : -cmp;
}

function formatDue(due: string | null): string {
  if (!due) return "—";
  try {
    const d = new Date(due);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return due;
  }
}

export function TaskRow({
  task,
  users,
  onOpen,
}: {
  task: Task;
  users: User[];
  onOpen: () => void;
}) {
  const assignee = users.find((u) => u.id === task.assigned_to);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-focus hover:bg-surface-hover"
    >
      <span className="flex-1 truncate text-sm font-medium text-ink">{task.title}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${COLUMN_CHIP[task.column]}`}
      >
        {task.column}
      </span>
      <span className="shrink-0 text-xs text-ink-subtle tabular-nums">{formatDue(task.due_at)}</span>
      <span className="shrink-0 w-24 truncate text-xs text-ink-muted">
        {assignee ? `@${assignee.handle}` : "—"}
      </span>
    </button>
  );
}

/**
 * Sort field selector + direction toggle. Shared by the Space detail page's
 * per-project tree and the single-project page so the two surfaces stay in
 * lockstep.
 */
export function SortControls({
  sortField,
  sortDir,
  onChangeField,
  onToggleDir,
}: {
  sortField: SortField;
  sortDir: SortDir;
  onChangeField: (field: SortField) => void;
  onToggleDir: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-1.5 text-ink-subtle">
        Sort by
        <select
          value={sortField}
          onChange={(e) => onChangeField(e.target.value as SortField)}
          className="rounded-lg border border-border bg-surface-subtle px-2 py-1 text-xs text-ink focus:border-border-focus focus:outline-none transition-colors"
        >
          <option value="progress">Progress</option>
          <option value="due_date">Due date</option>
        </select>
      </label>
      <button
        type="button"
        onClick={onToggleDir}
        aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
        title={sortDir === "asc" ? "Ascending — click to flip" : "Descending — click to flip"}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-subtle text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: sortDir === "desc" ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 120ms",
          }}
        >
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>
    </div>
  );
}
