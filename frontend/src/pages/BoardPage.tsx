import { useState } from "react";
import { Link } from "react-router-dom";
import { Board } from "../components/Board.js";
import { BacklogView } from "../components/BacklogView.js";
import { ArchiveView } from "../components/ArchiveView.js";
import { TaskDrawer } from "../components/TaskDrawer.js";
import { useTasks, useUsers } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useBoardView } from "../lib/BoardViewContext.js";
import { useCurrentUser } from "../lib/auth.js";

export function BoardPage() {
  const { view } = useBoardView();
  const { activeSpaceId, spaces } = useActiveSpace();
  const { data: tasks = [] } = useTasks(activeSpaceId);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { data: users = [] } = useUsers();
  const { data: me } = useCurrentUser();
  const currentUser = me ? users.find((u) => u.id === me.id) : undefined;

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
