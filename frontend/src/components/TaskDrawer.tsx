import { useEffect, useState } from "react";
import { Combobox } from "./Combobox.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { COLUMNS, type Column, type Task, type TaskEvent } from "@agentic-kanban/shared";
import { api, ApiError } from "../lib/api.js";
import { useUsers, useProjects } from "../lib/queries.js";
import { DateTimePicker } from "./DateTimePicker.js";

interface Props {
  taskId: string;
  allTasks: Task[];
  onClose: () => void;
  onOpenTask: (id: string) => void;
}

export function TaskDrawer({ taskId, allTasks, onClose, onOpenTask }: Props) {
  const queryClient = useQueryClient();
  const { data: task } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.getTask(taskId),
  });
  const { data: events = [] } = useQuery({
    queryKey: ["task-events", taskId],
    queryFn: () => api.listEvents(taskId),
  });
  const { data: users = [] } = useUsers();
  const { data: projects = [] } = useProjects();

  const [editingDesc, setEditingDesc] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [comment, setComment] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  useEffect(() => {
    if (task) {
      setDraftTitle(task.title);
      setDraftDesc(task.description);
    }
  }, [task?.id]);

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateTask>[1]) =>
      api.updateTask(taskId, patch),
    onSuccess: () => {
      setConflict(null);
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-events", taskId] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setConflict("This task was modified by someone else. Re-fetching latest…");
        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => api.addComment(taskId, { body: comment }),
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["task-events", taskId] });
    },
  });

  const addBlockerMutation = useMutation({
    mutationFn: (blocker_id: string) => api.addBlocker(taskId, { blocker_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const removeBlockerMutation = useMutation({
    mutationFn: (blocker_id: string) => api.removeBlocker(taskId, blocker_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      toast.success("Task archived");
      onClose();
    },
    onError: (error) => {
      console.error("Archive error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to archive task");
    },
  });

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="text-sm text-ink-muted">Loading…</div>
      </div>
    );
  }

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const allTags = Array.from(new Set(allTasks.flatMap((t) => t.tags))).sort();

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed right-0 top-0 z-50 h-full w-[520px] max-w-full overflow-y-auto border-l border-border bg-surface shadow-modal">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => {
              if (draftTitle !== task.title && draftTitle.trim()) {
                updateMutation.mutate({ version: task.version, title: draftTitle });
              }
            }}
            className="flex-1 bg-transparent text-base font-bold text-ink outline-none placeholder:text-ink-subtle focus:bg-surface-hover px-1 py-0.5 rounded-lg transition-colors"
          />
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

          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Column">
              <select
                value={task.column}
                onChange={(e) =>
                  updateMutation.mutate({
                    version: task.version,
                    column: e.target.value as Column,
                  })
                }
                className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
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
                  updateMutation.mutate({
                    version: task.version,
                    assigned_to: e.target.value || null,
                  })
                }
                className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
              >
                <option value="">— unassigned —</option>
                {users.map((u) => (
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
                onChange={(iso) => updateMutation.mutate({ version: task.version, due_at: iso })}
              />
            </Field>

            <Field label="Project">
              <select
                value={task.project_id ?? ""}
                onChange={(e) =>
                  updateMutation.mutate({
                    version: task.version,
                    project_id: e.target.value || null,
                  })
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

          {/* Tags */}
          <div className="mt-4">
            <Field label="Tags">
              <TagInput
                value={task.tags}
                allTags={allTags}
                onChange={(tags) => updateMutation.mutate({ version: task.version, tags })}
              />
            </Field>
          </div>

          {/* Description */}
          <section className="mt-5">
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
                  rows={7}
                  className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink focus:border-border-focus focus:outline-none transition-colors resize-none"
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
                      updateMutation.mutate(
                        { version: task.version, description: draftDesc },
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
              <div className="markdown min-h-[60px] rounded-lg border border-border bg-surface-subtle p-3">
                {task.description ? (
                  <ReactMarkdown>{task.description}</ReactMarkdown>
                ) : (
                  <span className="text-sm text-ink-subtle">No description</span>
                )}
              </div>
            )}
          </section>

          {/* Blockers */}
          <section className="mt-5">
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
                      onClick={() => onOpenTask(id)}
                      className={
                        blocker?.column === "Done" || blocker?.archived
                          ? "text-ink-subtle line-through hover:underline"
                          : "text-ink-muted hover:underline"
                      }
                    >
                      {blocker?.title ?? id.slice(0, 8)}
                    </button>
                    <button
                      onClick={() => removeBlockerMutation.mutate(id)}
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
                items={allTasks.filter((t) => t.id !== task.id && !task.blocked_by.includes(t.id))}
                getLabel={(t) => t.title}
                onSelect={(t) => addBlockerMutation.mutate(t.id)}
                placeholder="Search tasks to block on…"
              />
            </div>
            {addBlockerMutation.isError && (
              <div className="mt-1 text-xs text-danger">
                {(addBlockerMutation.error as Error).message}
              </div>
            )}
          </section>

          {/* Timeline */}
          <section className="mt-5">
            <SectionLabel className="mb-3">Timeline</SectionLabel>
            <div className="space-y-2">
              {events.map((e) => (
                <EventItem key={e.id} event={e} allTasks={allTasks} projects={projects} />
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim()) commentMutation.mutate();
              }}
              className="mt-4"
            >
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (markdown)"
                rows={2}
                className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors resize-none"
              />
              <div className="mt-1.5 flex justify-end">
                <button
                  type="submit"
                  disabled={!comment.trim() || commentMutation.isPending}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
                >
                  Comment
                </button>
              </div>
            </form>
          </section>

          {/* Archive & Delete */}
          <div className="mt-6 border-t border-border pt-4 space-y-2">
            {task.column === "Done" && !task.archived && (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="block text-xs font-medium text-ink-subtle transition-colors hover:text-accent"
              >
                Archive task
              </button>
            )}
            <button
              onClick={() => {
                if (confirm("Delete this task?")) deleteMutation.mutate();
              }}
              className="block text-xs font-medium text-ink-subtle transition-colors hover:text-danger"
            >
              Delete task
            </button>
          </div>
        </div>

        {showArchiveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg">
              <h3 className="font-semibold text-ink">Archive task?</h3>
              <p className="mt-2 text-sm text-ink-muted">
                This task will be moved to the archive and hidden from the board.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setShowArchiveConfirm(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-subtle hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    archiveMutation.mutate();
                    setShowArchiveConfirm(false);
                  }}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover transition-colors"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-[11px] font-bold uppercase tracking-widest text-ink-muted ${className ?? ""}`}>
      {children}
    </h3>
  );
}

function TagInput({
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

function EventItem({
  event,
  allTasks,
  projects,
}: {
  event: TaskEvent;
  allTasks: Task[];
  projects: import("@agentic-kanban/shared").Project[];
}) {
  const title = (id: string | null) =>
    allTasks.find((t) => t.id === id)?.title ?? id?.slice(0, 8) ?? "?";
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? id ?? "(none)";
  const time = new Date(event.created_at).toLocaleString();

  if (event.kind === "comment") {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle p-3">
        <div className="mb-1.5 text-xs text-ink-muted">
          <span className="font-semibold text-ink">{event.actor_id}</span>
          <span className="ml-2 text-ink-subtle">{time}</span>
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
      <span className="font-semibold text-ink">{event.actor_id}</span>{" "}
      {summary}
      <span className="ml-1.5 text-ink-subtle">· {time}</span>
    </div>
  );
}


