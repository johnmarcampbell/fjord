import { useState } from "react";
import { toast } from "sonner";
import type { Project, Task, TaskEvent } from "@fjord/shared";
import { Markdown } from "../Markdown.js";
import {
  formatActorLabel,
  formatMaybeUserLabel,
  type UserLookup,
} from "../../lib/userLabels.js";

export function EventItem({
  event,
  allTasks,
  projects,
  usersById,
  currentUserId,
  onEdit,
  onDelete,
}: {
  event: TaskEvent;
  allTasks: Task[];
  projects: Project[];
  usersById: UserLookup;
  currentUserId: string | null;
  onEdit: (body: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  onDelete: (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmingDel, setConfirmingDel] = useState(false);

  const title = (id: string | null) =>
    allTasks.find((t) => t.id === id)?.title ?? id?.slice(0, 8) ?? "?";
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? id ?? "(none)";
  const actorLabel = formatActorLabel(usersById, event.actor_id);
  const time = new Date(event.created_at).toLocaleString();
  const isAuthor = currentUserId !== null && event.actor_id === currentUserId;
  const isEditable = event.kind === "comment" || event.kind === "journal_entry";

  const editedLabel = event.updated_at ? (
    <span
      className="text-ink-subtle cursor-default"
      title={`Edited ${new Date(event.updated_at).toLocaleString()}`}
    >
      (edited)
    </span>
  ) : null;

  function startEdit() {
    setDraft(event.body ?? "");
    setEditing(true);
  }

  function submitEdit() {
    if (!draft.trim()) return;
    onEdit(draft.trim(), {
      onSuccess: () => setEditing(false),
      onError: (err) => toast.error(err.message || "Failed to save edit"),
    });
  }

  function handleDelete() {
    onDelete({
      onSuccess: () => setConfirmingDel(false),
      onError: (err) => {
        setConfirmingDel(false);
        toast.error(err.message || "Failed to delete entry");
      },
    });
  }

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
          <span className="font-semibold text-ink">{actorLabel}</span>
          <span className="text-ink-subtle">{time}</span>
          {editedLabel}
          {isAuthor && isEditable && !editing && (
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={startEdit}
                className="text-ink-subtle transition-colors hover:text-ink-muted"
                title="Edit"
              >
                edit
              </button>
              {!confirmingDel ? (
                <button
                  onClick={() => setConfirmingDel(true)}
                  className="text-ink-subtle transition-colors hover:text-danger"
                  title="Delete"
                >
                  delete
                </button>
              ) : (
                <span className="flex items-center gap-1">
                  <button
                    onClick={handleDelete}
                    className="text-danger transition-colors hover:underline"
                  >
                    confirm
                  </button>
                  <button
                    onClick={() => setConfirmingDel(false)}
                    className="text-ink-subtle transition-colors hover:text-ink-muted"
                  >
                    cancel
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-ink focus:border-border-focus focus:outline-none transition-colors resize-y"
              autoFocus
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
              >
                cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={!draft.trim()}
                className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                save
              </button>
            </div>
          </div>
        ) : (
          <div className="markdown">
            <Markdown>{event.body ?? ""}</Markdown>
          </div>
        )}
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
          <span className="font-semibold text-ink">{actorLabel}</span>
          <span className="text-ink-subtle">{time}</span>
          {editedLabel}
          {isAuthor && isEditable && !editing && (
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={startEdit}
                className="text-ink-subtle transition-colors hover:text-ink-muted"
                title="Edit"
              >
                edit
              </button>
              {!confirmingDel ? (
                <button
                  onClick={() => setConfirmingDel(true)}
                  className="text-ink-subtle transition-colors hover:text-danger"
                  title="Delete"
                >
                  delete
                </button>
              ) : (
                <span className="flex items-center gap-1">
                  <button
                    onClick={handleDelete}
                    className="text-danger transition-colors hover:underline"
                  >
                    confirm
                  </button>
                  <button
                    onClick={() => setConfirmingDel(false)}
                    className="text-ink-subtle transition-colors hover:text-ink-muted"
                  >
                    cancel
                  </button>
                </span>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono text-ink focus:border-border-focus focus:outline-none transition-colors resize-y"
              autoFocus
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
              >
                cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={!draft.trim()}
                className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                save
              </button>
            </div>
          </div>
        ) : (
          <div className="markdown">
            <Markdown>{event.body ?? ""}</Markdown>
          </div>
        )}
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
      summary = `assigned to ${formatMaybeUserLabel(usersById, event.to_value, {
        nullLabel: "(unassigned)",
        includeDeletedSuffix: false,
      })}`;
      break;
    case "reported_by_changed":
      summary = `reporter set to ${formatMaybeUserLabel(usersById, event.to_value)}`;
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
      <span className="font-semibold text-ink">{actorLabel}</span> {summary}
      <span className="ml-1.5 text-ink-subtle">· {time}</span>
    </div>
  );
}
