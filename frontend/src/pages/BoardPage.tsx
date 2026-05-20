import { useState } from "react";
import { Link } from "react-router-dom";
import { Board } from "../components/Board.js";
import { BacklogView } from "../components/BacklogView.js";
import { ArchiveView } from "../components/ArchiveView.js";
import { NewTaskDialog } from "../components/NewTaskDialog.js";
import { TaskDrawer } from "../components/TaskDrawer.js";
import { useTasks, useUsers } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useBoardView } from "../lib/BoardViewContext.js";
import { getCurrentUserId } from "../lib/user.js";

export function BoardPage({
  creating,
  onCloseCreating,
}: {
  creating: boolean;
  onCloseCreating: () => void;
}) {
  const { view } = useBoardView();
  const { activeSpaceId, spaces } = useActiveSpace();
  const { data: tasks = [] } = useTasks(activeSpaceId);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { data: users = [] } = useUsers();
  const currentUser = users.find((u) => u.id === getCurrentUserId());

  if (spaces.length === 0 && users.length > 0) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium text-ink">No spaces accessible</p>
          <p className="mt-2 text-xs text-ink-subtle">
            {currentUser
              ? <>Head to <Link to="/spaces" className="font-medium text-accent hover:underline">Spaces</Link> to create one or browse what you have access to.</>
              : "Sign in to see your spaces."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-hidden">
        {view === "board" && <Board setOpenTaskId={setOpenTaskId} />}
        {view === "backlog" && <BacklogView setOpenTaskId={setOpenTaskId} />}
        {view === "archive" && <ArchiveView onOpenTask={setOpenTaskId} />}
      </main>
      {creating && (
        <NewTaskDialog
          onClose={onCloseCreating}
          defaultColumn={view === "board" ? "To Do" : view === "backlog" ? "Backlog" : "To Do"}
        />
      )}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          allTasks={tasks}
          onClose={() => setOpenTaskId(null)}
          onOpenTask={setOpenTaskId}
        />
      )}
    </>
  );
}
