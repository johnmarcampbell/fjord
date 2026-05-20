import { useState } from "react";
import { Board } from "../components/Board.js";
import { BacklogView } from "../components/BacklogView.js";
import { ArchiveView } from "../components/ArchiveView.js";
import { NewTaskDialog } from "../components/NewTaskDialog.js";
import { TaskDrawer } from "../components/TaskDrawer.js";
import { useTasks, useUsers } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useBoardView } from "../lib/BoardViewContext.js";
import { getCurrentUserId } from "../lib/user.js";
import { isAdmin } from "../lib/policy.js";

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
  const currentIsAdmin = currentUser ? isAdmin(currentUser) : false;

  if (spaces.length === 0 && users.length > 0) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium text-ink">No spaces accessible</p>
          <p className="mt-2 text-xs text-ink-subtle">
            {currentIsAdmin
              ? "Create a space with \"+ New space\" in the header to get started."
              : "You don't have access to any spaces yet. Create one with \"+ New space\" or ask an Admin / Space Owner for access."}
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
