import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  COLUMNS,
  canArchive,
  isBlockerSatisfied,
  type Column,
  type Project,
  type Task,
  type TaskEvent,
} from "@agentic-kanban/shared";
import { useTaskEditor } from "../lib/useTaskEditor.js";
import { useTasks, useUsers, useProjects } from "../lib/queries.js";
import { Combobox } from "./Combobox.js";
import { DateTimePicker } from "./DateTimePicker.js";

type TimelineFilter = "all" | "comments" | "journal" | "system";

function matchesFilter(kind: TaskEvent["kind"], filter: TimelineFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "comments":
      return kind === "comment";
    case "journal":
      return kind === "journal_entry";
    case "system":
      return kind !== "comment" && kind !== "journal_entry";
  }
}

interface TaskDetailProps {
  taskId: string;
  onOpenBlockerInDrawer: (id: string) => void;
}

/**
 * Full task editor body — no page/drawer chrome of its own. Used by
 * `TaskPage`. Could also back a future modal without further refactor.
 *
 * All mutation behavior (optimistic concurrency, conflict state, comments,
 * journal, blockers, archive/delete) is owned by `useTaskEditor`.
 */
export function TaskDetail({ taskId, onOpenBlockerInDrawer }: TaskDetailProps) {
  const editor = useTaskEditor(taskId);
  const { task, events, conflict } = editor;

  const { data: users = [] } = useUsers();
  const activeUsers = users.filter((u) => !u.deleted_at);
  // Resolve blocker titles against tasks in the same space. Matches the
  // board's keying so the cache is shared.
  const { data: allTasks = [] } = useTasks(task?.space_id);
  const { data: projects = [] } = useProjects(task?.space_id);

  const [editingDesc, setEditingDesc] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [comment, setComment] = useState("");
  const [journal, setJournal] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (task) {
      setDraftTitle(task.title);
      setDraftDesc(task.description);
    }
  }, [task?.id]);

  if (!task) {
    // The page's own gating already handles loading / 404 / 403 — by the time
    // we render TaskDetail the task is loaded. This is a safety net.
    return <div className="text-sm text-ink-subtle">Loading…</div>;
  }

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const allTags = Array.from(new Set(allTasks.flatMap((t) => t.tags))).sort();

  return (
    <div className="space-y-5">
      {/* Title (large, inline-editable) */}
      <input
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onBlur={() => {
          if (draftTitle !== task.title && draftTitle.trim()) {
            editor.update({ title: draftTitle });
          }
        }}
        className="w-full bg-transparent text-2xl font-bold text-ink outline-none placeholder:text-ink-subtle focus:bg-surface-hover px-2 py-1 -mx-2 rounded-lg transition-colors"
      />

      {conflict && (
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {conflict}
        </div>
      )}

      {/* Two-column grid: left = body, right = metadata + actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left column */}
        <div className="space-y-6 min-w-0">
          {/* Description */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>Description</SectionLabel>
              <button
                onClick={() => setEditingDesc((v) => !v)}
                className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted"
              >
                {editingDesc ? "preview" : "edit"}
              </button>
            </div>
            {editingDesc ? (
              <>
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink focus:border-border-focus focus:outline-none transition-colors resize-y"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setDraftDesc(task.description);
                      setEditingDesc(false);
                    }}
                    className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted"
                  >
                    cancel
                  </button>
                  <button
                    onClick={() => {
                      editor.update(
                        { description: draftDesc },
                        { onSuccess: () => setEditingDesc(false) },
                      );
                    }}
                    className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
                  >
                    save
                  </button>
                </div>
              </>
            ) : (
              <div className="markdown min-h-[80px] rounded-lg border border-border bg-surface-subtle p-3">
                {task.description ? (
                  <ReactMarkdown>{task.description}</ReactMarkdown>
                ) : (
                  <span className="text-sm text-ink-subtle">No description</span>
                )}
              </div>
            )}
          </section>

          {/* Blockers */}
          <section>
            <SectionLabel className="mb-2">Blocked by</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {task.blocked_by.map((id) => {
                const blocker = taskById.get(id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium"
                  >
                    <button
                      onClick={() => onOpenBlockerInDrawer(id)}
                      className={
                        blocker && isBlockerSatisfied(blocker)
                          ? "text-ink-subtle line-through hover:underline"
                          : "text-ink-muted hover:underline"
                      }
                    >
                      {blocker?.title ?? id.slice(0, 8)}
                    </button>
                    <button
                      onClick={() => editor.removeBlocker(id)}
                      className="text-ink-subtle transition-colors hover:text-danger"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="mt-2">
              <Combobox
                items={allTasks.filter(
                  (t) => t.id !== task.id && !task.blocked_by.includes(t.id),
                )}
                getLabel={(t) => t.title}
                onSelect={(t) => editor.addBlocker(t.id)}
                placeholder="Search tasks to block on…"
              />
            </div>
            {editor.addBlockerError && (
              <div className="mt-1 text-xs text-danger">
                {editor.addBlockerError.message}
              </div>
            )}
          </section>

          {/* Timeline + composers */}
          <TimelineSection
            events={events}
            allTasks={allTasks}
            projects={projects}
            filter={timelineFilter}
            onFilterChange={setTimelineFilter}
            comment={comment}
            setComment={setComment}
            journal={journal}
            setJournal={setJournal}
            commentPending={editor.commentPending}
            journalPending={editor.journalPending}
            onSubmitComment={() =>
              editor.addComment(comment, { onSuccess: () => setComment("") })
            }
            onSubmitJournal={() =>
              editor.addJournal(journal, { onSuccess: () => setJournal("") })
            }
          />
        </div>

        {/* Right column: metadata + actions */}
        <aside className="space-y-4">
          <Field label="Status">
            <select
              value={task.column}
              disabled={task.archived}
              onChange={(e) => editor.update({ column: e.target.value as Column })}
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

          <Field label="Reporter">
            <div className="px-1 py-1.5 text-sm text-ink-muted">{task.reported_by}</div>
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

          <Field label="Tags">
            <TagInput
              value={task.tags}
              allTags={allTags}
              onChange={(tags) => editor.update({ tags })}
            />
          </Field>

          {/* Archive / Unarchive */}
          <div className="border-t border-border pt-4">
            {task.archived ? (
              <button
                onClick={() =>
                  editor.unarchive({
                    onSuccess: () => toast.success("Task unarchived"),
                    onError: (err) =>
                      toast.error(err.message || "Failed to unarchive task"),
                  })
                }
                className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Unarchive task
              </button>
            ) : (
              canArchive(task) && (
                <button
                  onClick={() =>
                    editor.archive({
                      onSuccess: () => toast.success("Task archived"),
                      onError: (err) =>
                        toast.error(err.message || "Failed to archive task"),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  Archive task
                </button>
              )
            )}
          </div>

          {/* Delete (danger, two-click confirm — matches UserFormDialog) */}
          <div className="border-t border-border pt-4">
            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-xs font-semibold text-danger-text transition-colors hover:underline"
              >
                Delete task
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-danger-text">This cannot be undone.</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      editor.delete({
                        onSuccess: () => toast.success("Task deleted"),
                      })
                    }
                    className="rounded-lg border border-danger-border bg-danger-bg px-3 py-1.5 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-bg/80"
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational helpers — also imported by TaskDrawer.
// ---------------------------------------------------------------------------

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-[11px] font-bold uppercase tracking-widest text-ink-muted ${className ?? ""}`}
    >
      {children}
    </h3>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

export function TagInput({
  value,
  allTags,
  onChange,
}: {
  value: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = allTags.filter(
    (t) => t.toLowerCase().includes(input.toLowerCase()) && !value.includes(t),
  );

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (clean && !value.includes(clean)) {
      onChange([...value, clean]);
    }
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="relative">
      <div className="flex min-h-[36px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-tag-bg px-2.5 py-0.5 text-[11px] font-semibold text-tag-text"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === "Backspace" && !input && value.length) {
              removeTag(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? "Add tags…" : ""}
          className="min-w-[80px] flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-subtle"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-border bg-surface-elevated py-1 shadow-modal">
          {suggestions.slice(0, 6).map((tag) => (
            <button
              key={tag}
              onMouseDown={() => addTag(tag)}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineSection({
  events,
  allTasks,
  projects,
  filter,
  onFilterChange,
  comment,
  setComment,
  journal,
  setJournal,
  commentPending,
  journalPending,
  onSubmitComment,
  onSubmitJournal,
}: {
  events: TaskEvent[];
  allTasks: Task[];
  projects: Project[];
  filter: TimelineFilter;
  onFilterChange: (f: TimelineFilter) => void;
  comment: string;
  setComment: (v: string) => void;
  journal: string;
  setJournal: (v: string) => void;
  commentPending: boolean;
  journalPending: boolean;
  onSubmitComment: () => void;
  onSubmitJournal: () => void;
}) {
  const visible = useMemo(
    () => events.filter((e) => matchesFilter(e.kind, filter)),
    [events, filter],
  );

  const counts = useMemo(() => {
    let comments = 0;
    let journals = 0;
    let system = 0;
    for (const e of events) {
      if (e.kind === "comment") comments++;
      else if (e.kind === "journal_entry") journals++;
      else system++;
    }
    return { comments, journals, system, all: events.length };
  }, [events]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Timeline</SectionLabel>
        <div className="flex items-center gap-1 text-[11px]">
          <FilterChip
            label="All"
            count={counts.all}
            active={filter === "all"}
            onClick={() => onFilterChange("all")}
          />
          <FilterChip
            label="Comments"
            count={counts.comments}
            active={filter === "comments"}
            onClick={() => onFilterChange("comments")}
          />
          <FilterChip
            label="Journal"
            count={counts.journals}
            active={filter === "journal"}
            onClick={() => onFilterChange("journal")}
          />
          <FilterChip
            label="System"
            count={counts.system}
            active={filter === "system"}
            onClick={() => onFilterChange("system")}
          />
        </div>
      </div>
      <div className="space-y-2">
        {visible.length === 0 && filter === "journal" && (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-ink-subtle">
            No journal entries yet. Agents and assignees use this space to record what they've
            tried and what's next.
          </div>
        )}
        {visible.length === 0 && filter !== "journal" && (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-ink-subtle">
            Nothing to show with this filter.
          </div>
        )}
        {visible.map((e) => (
          <EventItem key={e.id} event={e} allTasks={allTasks} projects={projects} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (comment.trim()) onSubmitComment();
        }}
        className="mt-4"
      >
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment — talk to other actors (markdown)"
          rows={2}
          className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors resize-none"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="submit"
            disabled={!comment.trim() || commentPending}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Comment
          </button>
        </div>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (journal.trim()) onSubmitJournal();
        }}
        className="mt-3"
      >
        <textarea
          value={journal}
          onChange={(e) => setJournal(e.target.value)}
          placeholder="Add a journal entry — durable working notes for your future self (markdown)"
          rows={2}
          className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors resize-none"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="submit"
            disabled={!journal.trim() || journalPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Journal entry
          </button>
        </div>
      </form>
    </section>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
        (active
          ? "bg-accent text-accent-fg"
          : "text-ink-subtle hover:bg-surface-hover hover:text-ink-muted")
      }
    >
      {label}
      <span className="ml-1 opacity-70">{count}</span>
    </button>
  );
}

function EventItem({
  event,
  allTasks,
  projects,
}: {
  event: TaskEvent;
  allTasks: Task[];
  projects: Project[];
}) {
  const title = (id: string | null) =>
    allTasks.find((t) => t.id === id)?.title ?? id?.slice(0, 8) ?? "?";
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? id ?? "(none)";
  const time = new Date(event.created_at).toLocaleString();

  if (event.kind === "comment") {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-semibold text-ink">{event.actor_id}</span>
          <span className="text-ink-subtle">{time}</span>
        </div>
        <div className="markdown">
          <ReactMarkdown>{event.body ?? ""}</ReactMarkdown>
        </div>
      </div>
    );
  }

  if (event.kind === "journal_entry") {
    const dim = !event.by_assignee;
    return (
      <div
        className={
          "rounded-xl border-l-2 border-l-accent border border-border bg-surface-subtle p-3 " +
          (dim ? "opacity-70" : "")
        }
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-shrink-0 text-accent"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <span className="font-semibold text-ink">{event.actor_id}</span>
          <span className="text-ink-subtle">{time}</span>
        </div>
        <div className="markdown">
          <ReactMarkdown>{event.body ?? ""}</ReactMarkdown>
        </div>
      </div>
    );
  }

  let summary = "did something";
  switch (event.kind) {
    case "task_created":
      summary = "created this task";
      break;
    case "column_changed":
      summary = `moved ${event.from_value} → ${event.to_value}`;
      break;
    case "assigned_to_changed":
      summary = `assigned to ${event.to_value ?? "(unassigned)"}`;
      break;
    case "reported_by_changed":
      summary = `reporter set to ${event.to_value}`;
      break;
    case "due_date_changed":
      summary = `due ${event.to_value ?? "(cleared)"}`;
      break;
    case "blocker_added":
      summary = `added blocker: ${title(event.blocker_id)}`;
      break;
    case "blocker_removed":
      summary = `removed blocker: ${title(event.blocker_id)}`;
      break;
    case "project_changed":
      summary = event.to_value
        ? `project set to ${projectName(event.to_value)}`
        : "project cleared";
      break;
    case "tags_changed":
      summary = "tags updated";
      break;
    case "task_archived":
      summary = "archived this task";
      break;
    case "task_unarchived":
      summary = "unarchived this task";
      break;
  }

  return (
    <div className="text-xs text-ink-muted">
      <span className="font-semibold text-ink">{event.actor_id}</span> {summary}
      <span className="ml-1.5 text-ink-subtle">· {time}</span>
    </div>
  );
}
