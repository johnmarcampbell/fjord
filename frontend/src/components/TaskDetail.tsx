import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isBlockerSatisfied } from "@fjord/shared";
import { useTaskEditor } from "../lib/useTaskEditor.js";
import { useTasks, useUsers, useProjects, useSpace, useSpaceAccess } from "../lib/queries.js";
import { useCurrentUser } from "../lib/auth.js";
import { useTimelineFilter } from "../lib/useTimelineFilter.js";
import { createUserLookup, formatReporterLabel } from "../lib/userLabels.js";
import { Markdown } from "./Markdown.js";
import { Combobox } from "./Combobox.js";
import { SectionLabel } from "./form-fields.js";
import { TimelineSection } from "./task-detail/TimelineSection.js";
import { TaskMetadataSidebar } from "./task-detail/TaskMetadataSidebar.js";

interface TaskDetailProps {
  taskId: string;
}

/**
 * Full task editor body — no page/drawer chrome of its own. Used by
 * `TaskPage`. Could also back a future modal without further refactor.
 *
 * Orchestrates the data fetches and lays out the title, description, and
 * blockers inline, delegating the timeline to `TimelineSection` and the
 * metadata/actions column to `TaskMetadataSidebar`. All mutation behavior
 * (optimistic concurrency, conflict state, comments, journal, blockers,
 * archive/delete) is owned by `useTaskEditor`.
 */
export function TaskDetail({ taskId }: TaskDetailProps) {
  const editor = useTaskEditor(taskId);
  const { task, events, conflict } = editor;

  const { data: users = [] } = useUsers();
  const { data: space } = useSpace(task?.space_id);
  const { data: spaceGrants = [] } = useSpaceAccess(task?.space_id ?? null);
  const assignableUsers = useMemo(() => {
    if (!space) return [];
    const affiliated = new Set([space.created_by, ...spaceGrants.map((g) => g.user_id)]);
    return users.filter((u) => !u.deleted_at && affiliated.has(u.id));
  }, [users, space, spaceGrants]);
  const usersById = useMemo(() => createUserLookup(users), [users]);
  // Resolve blocker titles against tasks in the same space. Matches the
  // board's keying so the cache is shared.
  const { data: allTasks = [] } = useTasks(task?.space_id);
  const { data: projects = [] } = useProjects(task?.space_id);

  const { data: me } = useCurrentUser();
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const { filter: timelineFilter, toggle: toggleTimeline, solo: soloTimeline } = useTimelineFilter();

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
  const reporterLabel = formatReporterLabel(usersById, task.reported_by);

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
                  <Markdown>{task.description}</Markdown>
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
                    <Link
                      to={`/tasks/${id}`}
                      className={
                        blocker && isBlockerSatisfied(blocker)
                          ? "text-ink-subtle line-through hover:underline"
                          : "text-ink-muted hover:underline"
                      }
                    >
                      {blocker?.title ?? id.slice(0, 8)}
                    </Link>
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
            usersById={usersById}
            filter={timelineFilter}
            toggle={toggleTimeline}
            solo={soloTimeline}
            currentUserId={me?.id ?? null}
            editor={editor}
          />
        </div>

        {/* Right column: metadata + actions */}
        <TaskMetadataSidebar
          task={task}
          editor={editor}
          users={users}
          assignableUsers={assignableUsers}
          projects={projects}
          allTags={allTags}
          reporterLabel={reporterLabel}
        />
      </div>
    </div>
  );
}
