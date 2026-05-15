import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { COLUMNS, type Column, type Task, type TaskEvent } from "@agentic-kanban/shared";
import { api, ApiError } from "../lib/api.js";
import { useUsers, useProjects } from "../lib/queries.js";

interface Props {
  taskId: string;
  allTasks: Task[];
  onClose: () => void;
}

export function TaskDrawer({ taskId, allTasks, onClose }: Props) {
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
        setConflict(
          "This task was modified by someone else. Re-fetching latest…",
        );
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

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="text-slate-400">Loading…</div>
      </div>
    );
  }

  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const allTags = Array.from(new Set(allTasks.flatMap((t) => t.tags))).sort();

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fixed right-0 top-0 z-50 h-full w-[520px] max-w-full overflow-y-auto border-l border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => {
              if (draftTitle !== task.title && draftTitle.trim()) {
                updateMutation.mutate({ version: task.version, title: draftTitle });
              }
            }}
            className="flex-1 bg-transparent text-lg font-semibold outline-none focus:bg-slate-800 px-1 rounded"
          />
          <button
            onClick={onClose}
            className="ml-2 text-slate-400 hover:text-slate-200"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        {conflict && (
          <div className="mb-3 rounded border border-amber-700/60 bg-amber-900/30 px-2 py-1 text-xs text-amber-200">
            {conflict}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Column">
            <select
              value={task.column}
              onChange={(e) =>
                updateMutation.mutate({
                  version: task.version,
                  column: e.target.value as Column,
                })
              }
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1"
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
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1"
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
            <div className="px-1 py-1 text-slate-300">{task.reported_by}</div>
          </Field>
          <Field label="Due">
            <input
              type="datetime-local"
              value={task.due_at ? toLocalInputValue(task.due_at) : ""}
              onChange={(e) =>
                updateMutation.mutate({
                  version: task.version,
                  due_at: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1"
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
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1"
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

        <div className="mt-3 text-sm">
          <Field label="Tags">
            <TagInput
              value={task.tags}
              allTags={allTags}
              onChange={(tags) =>
                updateMutation.mutate({ version: task.version, tags })
              }
            />
          </Field>
        </div>

        <section className="mt-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wide text-slate-400">
              Description
            </h3>
            <button
              onClick={() => setEditingDesc((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {editingDesc ? "preview" : "edit"}
            </button>
          </div>
          {editingDesc ? (
            <>
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                rows={6}
                className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm font-mono"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setDraftDesc(task.description);
                    setEditingDesc(false);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200"
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
                  className="rounded bg-blue-600 px-2 py-1 text-xs hover:bg-blue-500"
                >
                  save
                </button>
              </div>
            </>
          ) : (
            <div className="markdown rounded border border-slate-800 bg-slate-950/50 p-2 min-h-[60px]">
              {task.description ? (
                <ReactMarkdown>{task.description}</ReactMarkdown>
              ) : (
                <span className="text-slate-500">No description</span>
              )}
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
            Blocked by
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {task.blocked_by.map((id) => {
              const blocker = taskById.get(id);
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs"
                >
                  <span className={blocker?.column === "Done" ? "text-slate-500 line-through" : ""}>
                    {blocker?.title ?? id.slice(0, 8)}
                  </span>
                  <button
                    onClick={() => removeBlockerMutation.mutate(id)}
                    className="text-slate-500 hover:text-red-300"
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addBlockerMutation.mutate(e.target.value);
            }}
            className="mt-2 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs"
          >
            <option value="">+ add blocker…</option>
            {allTasks
              .filter(
                (t) =>
                  t.id !== task.id &&
                  !task.blocked_by.includes(t.id),
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
          {addBlockerMutation.isError && (
            <div className="mt-1 text-xs text-red-400">
              {(addBlockerMutation.error as Error).message}
            </div>
          )}
        </section>

        <section className="mt-5">
          <h3 className="mb-1 text-xs uppercase tracking-wide text-slate-400">
            Timeline
          </h3>
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
            className="mt-3"
          >
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (markdown)"
              rows={2}
              className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm font-mono"
            />
            <div className="mt-1 flex justify-end">
              <button
                type="submit"
                disabled={!comment.trim() || commentMutation.isPending}
                className="rounded bg-blue-600 px-2 py-1 text-xs hover:bg-blue-500 disabled:opacity-50"
              >
                Comment
              </button>
            </div>
          </form>
        </section>

        <div className="mt-6 border-t border-slate-800 pt-3">
          <button
            onClick={() => {
              if (confirm("Delete this task?")) deleteMutation.mutate();
            }}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete task
          </button>
        </div>
      </div>
    </div>
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
      <div className="flex min-h-[32px] flex-wrap items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-0.5 rounded-full bg-slate-600 px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-slate-400 hover:text-slate-200"
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
          className="min-w-[80px] flex-1 bg-transparent text-xs outline-none placeholder:text-slate-500"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded border border-slate-700 bg-slate-800 shadow-lg">
          {suggestions.slice(0, 6).map((tag) => (
            <button
              key={tag}
              onMouseDown={() => addTag(tag)}
              className="block w-full px-2 py-1 text-left text-xs hover:bg-slate-700"
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
      <div className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
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
      <div className="rounded border border-slate-800 bg-slate-950/40 p-2 text-sm">
        <div className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">{event.actor_id}</span>
          <span className="ml-2">{time}</span>
        </div>
        <div className="markdown mt-1">
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
      summary = `tags updated`;
      break;
  }
  return (
    <div className="text-xs text-slate-400">
      <span className="font-semibold text-slate-300">{event.actor_id}</span>{" "}
      {summary} <span className="ml-1 text-slate-500">· {time}</span>
    </div>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
