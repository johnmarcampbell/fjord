import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useArchivedTasks } from "../lib/queries.js";
import { api } from "../lib/api.js";

export function ArchiveView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { data: tasks, isLoading } = useArchivedTasks();
  const queryClient = useQueryClient();

  const handleUnarchive = async (taskId: string) => {
    try {
      await api.unarchiveTask(taskId);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      toast.success("Task unarchived");
    } catch (error) {
      toast.error("Failed to unarchive task");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="text-ink-subtle">Loading archived tasks...</div>
      </div>
    );
  }

  const sortedTasks = (tasks ?? []).sort((a, b) => {
    const aTime = a.archived_at ? new Date(a.archived_at).getTime() : 0;
    const bTime = b.archived_at ? new Date(b.archived_at).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="h-full bg-bg overflow-auto">
      <div className="mx-auto max-w-3xl p-6">
        <h2 className="text-2xl font-bold text-ink mb-6">Archived Tasks</h2>

        {sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-ink-muted mb-2">No archived tasks yet</div>
            <div className="text-sm text-ink-subtle">
              Archive completed tasks to keep your board focused
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-subtle p-4 hover:bg-surface transition-colors"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onOpenTask(task.id)}
                >
                  <div className="font-medium text-ink truncate">{task.title}</div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
                    {task.assigned_to && (
                      <span className="inline-block rounded bg-surface px-2 py-1 text-ink-subtle">
                        {task.assigned_to}
                      </span>
                    )}
                    {task.archived_at && (
                      <span className="text-ink-subtle">
                        {new Date(task.archived_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnarchive(task.id); }}
                  className="flex-shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-fg hover:bg-accent-hover transition-colors"
                >
                  Unarchive
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
