import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTasks } from "../lib/queries.js";
import { useTaskEditor } from "../lib/useTaskEditor.js";
import { ApiError } from "../lib/api.js";
import { TaskDetail } from "../components/TaskDetail.js";
import { TaskDrawer } from "../components/TaskDrawer.js";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-6 py-6">{children}</div>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1 text-sm font-medium text-ink-subtle transition-colors hover:text-ink"
    >
      ← Board
    </Link>
  );
}

/**
 * Full task detail at `/tasks/:id`. Shareable, deep-linkable surface.
 *
 * - Gates rendering on the task's own load state (404 / 403 are inline errors).
 * - Sets `document.title` to the task title; restores on unmount.
 * - Detects "deleted while viewing" by tracking whether the task was ever
 *   loaded; if it transitions to undefined after that, toast + redirect.
 * - Hosts a `TaskDrawer` overlay for blocker chip clicks so the in-page
 *   navigation stays consistent with the board (drawer-as-peek).
 *
 * Note: `useTaskEditor` is called both here (for gating) and inside
 * `TaskDetail` (for editing). The underlying React Query deduplicates,
 * so this is essentially free.
 */
export function TaskPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editor = useTaskEditor(id || null);
  const { task, isLoading, error } = editor;

  // Blocker chip → drawer (peek). Always opens over the page; doesn't
  // navigate away.
  const [openBlockerId, setOpenBlockerId] = useState<string | null>(null);

  // For the drawer's `allTasks` prop (blocker title resolution).
  const { data: allTasks = [] } = useTasks(task?.space_id);

  // document.title
  useEffect(() => {
    if (!task) return;
    const previous = document.title;
    document.title = `${task.title} · agentic-kanban`;
    return () => {
      document.title = previous;
    };
  }, [task?.title]);

  // Deleted-while-viewing detection.
  // If the task transitioned from "loaded" to "gone" without an explicit
  // 404 error, treat it as a remote deletion (e.g. SSE-driven invalidation
  // that then re-fetched and returned 404 / empty).
  const wasLoadedRef = useRef(false);
  useEffect(() => {
    if (task) {
      wasLoadedRef.current = true;
    } else if (
      wasLoadedRef.current &&
      !isLoading &&
      error instanceof ApiError &&
      error.status === 404
    ) {
      // Reset so we don't fire twice on a remount loop.
      wasLoadedRef.current = false;
      toast.success("This task was deleted");
      navigate("/");
    }
  }, [task, isLoading, error, navigate]);

  if (!id) {
    return (
      <PageShell>
        <BackLink />
        <ErrorCard
          title="Task not found."
          message="The link is missing a task id."
        />
      </PageShell>
    );
  }

  if (isLoading && !task) {
    return (
      <PageShell>
        <BackLink />
        <div className="mt-6 text-sm text-ink-subtle">Loading…</div>
      </PageShell>
    );
  }

  if (error instanceof ApiError) {
    if (error.status === 404) {
      return (
        <PageShell>
          <BackLink />
          <ErrorCard
            title="Task not found."
            message="The task may have been deleted or the link is incorrect."
          />
        </PageShell>
      );
    }
    if (error.status === 403) {
      return (
        <PageShell>
          <BackLink />
          <ErrorCard
            title="You don't have access to this task."
            message="It belongs to a space you can't see. Ask an Admin or the Space Owner for access."
          />
        </PageShell>
      );
    }
  }

  if (error) {
    return (
      <PageShell>
        <BackLink />
        <ErrorCard
          title="Couldn't load this task."
          message={(error as Error).message ?? "Something went wrong."}
        />
      </PageShell>
    );
  }

  if (!task) {
    // Defensive: query settled with no data and no error.
    return (
      <PageShell>
        <BackLink />
        <div className="mt-6 text-sm text-ink-subtle">Loading…</div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell>
        <div className="mb-4">
          <BackLink />
        </div>
        <TaskDetail taskId={id} onOpenBlockerInDrawer={setOpenBlockerId} />
      </PageShell>
      {openBlockerId && (
        <TaskDrawer
          taskId={openBlockerId}
          allTasks={allTasks}
          onClose={() => setOpenBlockerId(null)}
          onOpenTask={setOpenBlockerId}
        />
      )}
    </>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-6 rounded-modal border border-border bg-surface-subtle p-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-2 text-xs text-ink-subtle">{message}</p>
    </div>
  );
}
