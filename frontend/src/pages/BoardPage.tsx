import { useState } from "react";
import { Board } from "../components/Board.js";
import { BacklogView } from "../components/BacklogView.js";
import { ArchiveView } from "../components/ArchiveView.js";
import { NewTaskDialog } from "../components/NewTaskDialog.js";
import { TaskDrawer } from "../components/TaskDrawer.js";
import { useTasks } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useBoardView } from "../lib/BoardViewContext.js";

export function BoardPage({
  creating,
  onCloseCreating,
}: {
  creating: boolean;
  onCloseCreating: () => void;
}) {
  const { view } = useBoardView();
  const { activeSpaceId } = useActiveSpace();
  const { data: tasks = [] } = useTasks(activeSpaceId);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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
