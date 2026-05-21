import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { COLUMNS, type Column, type Task } from "@agentic-kanban/shared";
import { useUsers, useProjects } from "../lib/queries.js";
import { useTaskEditor } from "../lib/useTaskEditor.js";
import { DateTimePicker } from "./DateTimePicker.js";
import { Field, SectionLabel } from "./TaskDetail.js";

interface Props {
  taskId: string;
  allTasks: Task[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}

/**
 * Sneak-peek surface for a single task. Trimmed in scope: only the four
 * quick-action metadata fields (status, assignee, due, project) are editable.
 * Title, description, tags, and blockers are read-only chips/text. The
 * timeline collapses to a one-line summary. To do anything substantial,
 * users click the ↗ button to open the full `TaskPage` at `/tasks/:id`.
 *
 * All mutation logic still flows through `useTaskEditor` so the drawer and
 * page can't drift.
 */
export function TaskDrawer({ taskId, allTasks, onClose, onOpenTask }: Props) {
  const navigate = useNavigate();
  const editor = useTaskEditor(taskId);
  const { task, events, conflict } = editor;

  const { data: users = [] } = useUsers();
  const activeUsers = users.filter((u) => !u.deleted_at);
  const { data: projects = [] } = useProjects(task?.space_id);

  const timelineSummary = useMemo(() => buildTimelineSummary(events), [events]);

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="text-sm text-ink-muted">Loading…</div>
      </div>
    );
  }

  const taskById = new Map(allTasks.map((t) => [t.id, t]));

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed right-0 top-0 z-50 h-full w-[520px] max-w-full overflow-y-auto border-l border-border bg-surface shadow-modal">
        {/* Header: title (read-only) + open-full-view ↗ + close ✕ */}
        <div className="flex items-start gap-2 border-b border-border px-5 py-4">
          <h2 className="flex-1 px-1 py-0.5 text-base font-bold text-ink break-words">
            {task.title}
          </h2>
          <button
            onClick={() => {
              onClose();
              navigate(`/tasks/${task.id}`);
            }}
            className="mt-0.5 flex-shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
            aria-label="Open full view"
            title="Open full view"
          >
            {/* Arrow up-right */}
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
          <button
            onClick={onClose}
            className="mt-0.5 flex-shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
            aria-label="close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {conflict && (
            <div className="mb-4 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
              {conflict}
            </div>
          )}

          {/* Quick-action fields — the only editable surface in the drawer */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Status">
              <select
                value={task.column}
                disabled={task.archived}
                onChange={(e) =>
                  editor.update({ column: e.target.value as Column })
                }
                className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assigned to">
              <select
                value={task.assigned_to ?? ""}
                onChange={(e) =>
                  editor.update({ assigned_to: e.target.value || null })
                }
                className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
              >
                <option value="">— unassigned —</option>
                {task.assigned_to &&
                  (() => {
                    const assignee = users.find((u) => u.id === task.assigned_to);
                    if (assignee && assignee.deleted_at) {
                      return (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.display_name} (deleted)
                        </option>
                      );
                    }
                    return null;
                  })()}
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Due">
              <DateTimePicker
                value={task.due_at ?? ""}
                onChange={(iso) => editor.update({ due_at: iso })}
              />
            </Field>

            <Field label="Project">
              <select
                value={task.project_id ?? ""}
                onChange={(e) =>
                  editor.update({ project_id: e.target.value || null })
                }
                className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
              >
                <option value="">— none —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Tags — read-only chips */}
          {task.tags.length > 0 && (
            <div className="mt-4">
              <SectionLabel className="mb-2">Tags</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-tag-bg px-2.5 py-0.5 text-[11px] font-semibold text-tag-text"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description — render-only, faded if long */}
          <section className="mt-5">
            <SectionLabel className="mb-2">Description</SectionLabel>
            {task.description ? (
              <div className="relative max-h-32 overflow-hidden rounded-lg border border-border bg-surface-subtle p-3">
                <div className="markdown">
                  <ReactMarkdown>{task.description}</ReactMarkdown>
                </div>
                {/* Bottom fade-out hint when content overflows */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-subtle to-transparent" />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-surface-subtle p-3">
                <span className="text-sm text-ink-subtle">No description</span>
              </div>
            )}
          </section>

          {/* Blockers — read-only chips, clickable to swap the drawer */}
          {task.blocked_by.length > 0 && (
            <section className="mt-5">
              <SectionLabel className="mb-2">Blocked by</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {task.blocked_by.map((id) => {
                  const blocker = taskById.get(id);
                  return (
                    <button
                      key={id}
                      onClick={() => onOpenTask(id)}
                      className={
                        "rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-hover " +
                        (blocker?.column === "Done" || blocker?.archived
                          ? "text-ink-subtle line-through"
                          : "text-ink-muted")
                      }
                    >
                      {blocker?.title ?? id.slice(0, 8)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Timeline summary (one line) — full timeline lives on the page */}
          {timelineSummary && (
            <div className="mt-5 text-xs text-ink-subtle">{timelineSummary}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildTimelineSummary(events: { kind: string }[]): string | null {
  if (events.length === 0) return null;
  let comments = 0;
  let journals = 0;
  let other = 0;
  for (const e of events) {
    if (e.kind === "comment") comments++;
    else if (e.kind === "journal_entry") journals++;
    else other++;
  }
  const parts: string[] = [];
  if (comments > 0) parts.push(`${comments} ${comments === 1 ? "comment" : "comments"}`);
  if (journals > 0)
    parts.push(`${journals} ${journals === 1 ? "journal entry" : "journal entries"}`);
  if (other > 0) parts.push(`${other} ${other === 1 ? "event" : "events"}`);
  return parts.join(" · ");
}
