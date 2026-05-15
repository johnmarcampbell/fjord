import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useArchivedTasks } from "../lib/queries.js";
import { api } from "../lib/api.js";

export function ArchiveView() {
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
      <div className="flex h-full items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading archived tasks...</div>
      </div>
    );
  }

  const sortedTasks = (tasks ?? []).sort((a, b) => {
    const aTime = a.archived_at ? new Date(a.archived_at).getTime() : 0;
    const bTime = b.archived_at ? new Date(b.archived_at).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="h-full bg-slate-900 overflow-auto">
      <div className="mx-auto max-w-4xl p-4">
        <h2 className="text-xl font-semibold text-slate-100 mb-6">Archived Tasks</h2>

        {sortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-slate-400 mb-2">No archived tasks yet</div>
            <div className="text-xs text-slate-500">
              Archive completed tasks to keep your board focused
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-4 rounded-md border border-slate-700 bg-slate-800 px-4 py-3 hover:border-slate-600"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-100 truncate">{task.title}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    {task.assigned_to && (
                      <span className="inline-block rounded bg-slate-700 px-2 py-0.5">
                        {task.assigned_to}
                      </span>
                    )}
                    {task.archived_at && (
                      <span className="text-slate-500">
                        {new Date(task.archived_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleUnarchive(task.id)}
                  className="flex-shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 active:bg-blue-700 transition-colors"
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
