import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { COLUMNS, type Column } from "@agentic-kanban/shared";
import {
  useProjects,
  useSpace,
  useSpaceAccess,
  useSpaces,
  useTasks,
  useUsers,
} from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useCreateTask } from "../lib/mutations.js";
import { Field, SectionLabel, TagInput } from "../components/TaskDetail.js";
import { DateTimePicker } from "../components/DateTimePicker.js";
import { Markdown } from "../components/Markdown.js";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-6 py-6">{children}</div>
    </main>
  );
}

const FIELD_SELECT_CLASS =
  "w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors";

/**
 * Full-page task creation at `/tasks/new`. Mirrors the `/tasks/:id` detail
 * page's shell and design language, but holds all fields in buffered local
 * state and POSTs exactly once — there is no persisted task, version,
 * blockers, timeline, or archive/delete here (those live on `/tasks/:id`).
 *
 * Pre-fills initial context from `?column=`, `?project_id=`, `?space_id=`
 * query params; everything stays editable. Resolves a target space the actor
 * can actually post to (query param → active space → first accessible) and
 * redirects to `/spaces` if none can be resolved. On success it switches the
 * active space when needed and redirects to the new task, replacing the
 * `/tasks/new` history entry.
 */
export function NewTaskPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const { activeSpaceId, setActiveSpaceId } = useActiveSpace();
  const { data: accessibleSpaces = [], isLoading: spacesLoading } = useSpaces();

  // Resolve the single target space before rendering the scoped pickers.
  const requestedSpaceId = searchParams.get("space_id");
  const targetSpaceId = useMemo(() => {
    const candidates = [requestedSpaceId, activeSpaceId].filter(Boolean) as string[];
    for (const candidate of candidates) {
      if (accessibleSpaces.some((s) => s.id === candidate)) return candidate;
    }
    return null;
  }, [requestedSpaceId, activeSpaceId, accessibleSpaces]);

  // Redirect (not during render) when no accessible space can be resolved.
  useEffect(() => {
    if (spacesLoading) return;
    if (!targetSpaceId) {
      toast("Pick a space to create a task in.");
      navigate("/spaces", { replace: true });
    }
  }, [spacesLoading, targetSpaceId, navigate]);

  // Buffered form state.
  const [title, setTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [editingDesc, setEditingDesc] = useState(true);
  const [column, setColumn] = useState<Column>(() => {
    const c = searchParams.get("column");
    return c && (COLUMNS as readonly string[]).includes(c) ? (c as Column) : "Backlog";
  });
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(
    searchParams.get("project_id"),
  );
  const [tags, setTags] = useState<string[]>([]);

  // Picker data, scoped to the resolved target space.
  const { data: space } = useSpace(targetSpaceId);
  const { data: spaceGrants = [] } = useSpaceAccess(targetSpaceId);
  const { data: users = [] } = useUsers();
  const { data: projects = [] } = useProjects(targetSpaceId ?? undefined);
  const { data: spaceTasks = [] } = useTasks(targetSpaceId ?? undefined);

  const assignableUsers = useMemo(() => {
    if (!space) return [];
    const affiliated = new Set([space.created_by, ...spaceGrants.map((g) => g.user_id)]);
    return users.filter((u) => !u.deleted_at && affiliated.has(u.id));
  }, [users, space, spaceGrants]);

  const allTags = useMemo(
    () => Array.from(new Set(spaceTasks.flatMap((t) => t.tags))).sort(),
    [spaceTasks],
  );

  const create = useCreateTask({
    onSuccess: (task) => {
      if (targetSpaceId && targetSpaceId !== activeSpaceId) {
        setActiveSpaceId(targetSpaceId);
      }
      navigate(`/tasks/${task.id}`, { replace: true });
    },
  });

  useEffect(() => {
    const previous = document.title;
    document.title = "New task · agentic-kanban";
    return () => {
      document.title = previous;
    };
  }, []);

  function handleCancel() {
    navigate(from ?? "/");
  }

  function handleSubmit() {
    if (!title.trim() || !targetSpaceId) return;
    create.mutate({
      title: title.trim(),
      description: draftDesc,
      column,
      assigned_to: assignedTo,
      due_at: dueAt,
      project_id: projectId,
      space_id: targetSpaceId,
      tags,
    });
  }

  // While spaces load (or the redirect-on-failure effect runs), show a shell.
  if (spacesLoading || !targetSpaceId) {
    return (
      <PageShell>
        <div className="mt-6 text-sm text-ink-subtle">Loading…</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-subtle transition-colors hover:text-ink"
        >
          ← Back
        </button>
        <span className="rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-medium text-ink-muted">
          Creating in{" "}
          <span className="font-semibold text-ink">{space?.name ?? "…"}</span>
        </span>
      </div>

      <div className="space-y-5">
        {/* Title (large) */}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title…"
          className="w-full bg-transparent text-2xl font-bold text-ink outline-none placeholder:text-ink-subtle focus:bg-surface-hover px-2 py-1 -mx-2 rounded-lg transition-colors"
        />

        {create.isError && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {(create.error as Error).message}
          </div>
        )}

        {/* Two-column grid: left = body, right = metadata */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          {/* Left column */}
          <div className="space-y-6 min-w-0">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <SectionLabel>Description</SectionLabel>
                <button
                  type="button"
                  onClick={() => setEditingDesc((v) => !v)}
                  className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted"
                >
                  {editingDesc ? "preview" : "edit"}
                </button>
              </div>
              {editingDesc ? (
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  rows={10}
                  placeholder="Optional description… (markdown)"
                  className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors resize-y"
                />
              ) : (
                <div className="markdown min-h-[80px] rounded-lg border border-border bg-surface-subtle p-3">
                  {draftDesc ? (
                    <Markdown>{draftDesc}</Markdown>
                  ) : (
                    <span className="text-sm text-ink-subtle">No description</span>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Right column: metadata */}
          <aside className="space-y-4">
            <Field label="Status">
              <select
                value={column}
                onChange={(e) => setColumn(e.target.value as Column)}
                className={FIELD_SELECT_CLASS}
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
                value={assignedTo ?? ""}
                onChange={(e) => setAssignedTo(e.target.value || null)}
                className={FIELD_SELECT_CLASS}
              >
                <option value="">— unassigned —</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Due">
              <DateTimePicker value={dueAt ?? ""} onChange={setDueAt} />
            </Field>

            <Field label="Project">
              <select
                value={projectId ?? ""}
                onChange={(e) => setProjectId(e.target.value || null)}
                className={FIELD_SELECT_CLASS}
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
              <TagInput value={tags} allTags={allTags} onChange={setTags} />
            </Field>
          </aside>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || create.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Create task
          </button>
        </div>
      </div>
    </PageShell>
  );
}
