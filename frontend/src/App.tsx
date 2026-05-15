import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Board } from "./components/Board.js";
import { NewTaskDialog } from "./components/NewTaskDialog.js";
import { UserPicker } from "./components/UserPicker.js";
import { useStreamSubscription } from "./lib/stream.js";

export default function App() {
  const queryClient = useQueryClient();
  useStreamSubscription(queryClient);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <h1 className="text-lg font-semibold">Agentic Kanban</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCreating(true)}
            className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500"
          >
            + New task
          </button>
          <UserPicker />
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            API docs
          </a>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Board openTaskId={openTaskId} setOpenTaskId={setOpenTaskId} />
      </main>
      {creating && <NewTaskDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
