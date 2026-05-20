import { useMemo, useState } from "react";
import type { Column, Project, Task, User } from "@agentic-kanban/shared";

type SortField = "progress" | "due_date";
type SortDir = "asc" | "desc";

const NO_PROJECT_KEY = "__no_project__";

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

function compareTasks(a: Task, b: Task, field: SortField, dir: SortDir): number {
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

function TaskRow({
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface SectionConfig {
  key: string;
  label: string;
  color?: string;
  tasks: Task[];
}

export function SpaceProjectTree({
  projects,
  tasks,
  users,
  onOpenTask,
}: {
  projects: Project[];
  tasks: Task[];
  users: User[];
  onOpenTask: (taskId: string) => void;
}) {
  const [sortField, setSortField] = useState<SortField>("progress");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const p of projects) init.add(p.id);
    init.add(NO_PROJECT_KEY);
    return init;
  });

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);

  const sections: SectionConfig[] = useMemo(() => {
    const tasksByProject = new Map<string, Task[]>();
    const noProjectTasks: Task[] = [];
    for (const t of activeTasks) {
      if (t.project_id) {
        const arr = tasksByProject.get(t.project_id) ?? [];
        arr.push(t);
        tasksByProject.set(t.project_id, arr);
      } else {
        noProjectTasks.push(t);
      }
    }
    const cmp = (a: Task, b: Task) => compareTasks(a, b, sortField, sortDir);
    const projectSections: SectionConfig[] = [...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        key: p.id,
        label: p.name,
        color: p.color,
        tasks: (tasksByProject.get(p.id) ?? []).sort(cmp),
      }));
    if (noProjectTasks.length > 0) {
      projectSections.push({
        key: NO_PROJECT_KEY,
        label: "No project",
        tasks: noProjectTasks.sort(cmp),
      });
    }
    return projectSections;
  }, [projects, activeTasks, sortField, sortDir]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="py-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Projects</h2>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-ink-subtle">
            Sort by
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="rounded-lg border border-border bg-surface-subtle px-2 py-1 text-xs text-ink focus:border-border-focus focus:outline-none transition-colors"
            >
              <option value="progress">Progress</option>
              <option value="due_date">Due date</option>
            </select>
          </label>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setSortDir("asc")}
              className={`px-2 py-1 text-xs font-medium transition-colors ${
                sortDir === "asc"
                  ? "bg-accent text-accent-fg"
                  : "bg-surface-subtle text-ink-muted hover:bg-surface-hover"
              }`}
              aria-label="Sort ascending"
            >
              Asc
            </button>
            <button
              type="button"
              onClick={() => setSortDir("desc")}
              className={`px-2 py-1 text-xs font-medium transition-colors ${
                sortDir === "desc"
                  ? "bg-accent text-accent-fg"
                  : "bg-surface-subtle text-ink-muted hover:bg-surface-hover"
              }`}
              aria-label="Sort descending"
            >
              Desc
            </button>
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm italic text-ink-subtle">No projects in this space yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            return (
              <li key={section.key} className="rounded-xl border border-border bg-surface-subtle">
                <button
                  type="button"
                  onClick={() => toggle(section.key)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  <ChevronIcon open={!isCollapsed} />
                  {section.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: section.color }}
                    />
                  )}
                  <span className="text-sm font-semibold text-ink">{section.label}</span>
                  <span className="text-xs text-ink-subtle">({section.tasks.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
                    {section.tasks.length === 0 ? (
                      <p className="text-xs italic text-ink-subtle">No tasks</p>
                    ) : (
                      section.tasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          users={users}
                          onOpen={() => onOpenTask(t.id)}
                        />
                      ))
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
