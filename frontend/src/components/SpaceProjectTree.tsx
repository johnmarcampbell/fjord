import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, Task, User } from "@fjord/shared";
import {
  SortControls,
  TaskRow,
  compareTasks,
  type SortDir,
  type SortField,
} from "./taskList.js";

const NO_PROJECT_KEY = "__no_project__";

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
  const navigate = useNavigate();
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
        <div className="ml-auto">
          <SortControls
            sortField={sortField}
            sortDir={sortDir}
            onChangeField={setSortField}
            onToggleDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          />
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
                <div className="relative">
                  {/* Full-row toggle, layered behind the header content so a click
                      anywhere on the row (except the ↗) expands/collapses. */}
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${section.label}`}
                    className={`absolute inset-0 h-full w-full rounded-t-xl transition-colors hover:bg-surface-hover ${
                      isCollapsed ? "rounded-b-xl" : ""
                    }`}
                  />
                  {/* Content sits on top but lets clicks fall through to the toggle
                      button; the ↗ re-enables pointer events to catch its own click. */}
                  <div className="pointer-events-none relative flex items-center gap-2 px-3 py-2">
                    <ChevronIcon open={!isCollapsed} />
                    {section.color && (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: section.color }}
                      />
                    )}
                    <span className="text-sm font-semibold text-ink">{section.label}</span>
                    <span className="text-xs text-ink-subtle">({section.tasks.length})</span>
                    {section.key !== NO_PROJECT_KEY && (
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${section.key}`)}
                        aria-label="Open project page"
                        title="Open project page"
                        className="pointer-events-auto flex-shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
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
                        >
                          <path d="M7 17L17 7" />
                          <path d="M8 7H17V16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
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
