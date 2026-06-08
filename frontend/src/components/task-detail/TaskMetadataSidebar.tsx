import { useState } from "react";
import { toast } from "sonner";
import { COLUMNS, canArchive, type Column, type Project, type Task, type User } from "@fjord/shared";
import type { UseTaskEditor } from "../../lib/useTaskEditor.js";
import { DateTimePicker } from "../DateTimePicker.js";
import { Field, TagInput } from "../form-fields.js";

/**
 * Right-hand metadata + actions column of the task detail view: status,
 * assignee, reporter, due date, project, tags, plus archive and delete.
 */
export function TaskMetadataSidebar({
  task,
  editor,
  users,
  assignableUsers,
  projects,
  allTags,
  reporterLabel,
}: {
  task: Task;
  editor: UseTaskEditor;
  users: User[];
  assignableUsers: User[];
  projects: Project[];
  allTags: string[];
  reporterLabel: string;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
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
          {assignableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Reporter">
        <div className="px-1 py-1.5 text-sm text-ink-muted">{reporterLabel}</div>
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
  );
}
