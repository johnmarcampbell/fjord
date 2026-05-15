import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { api } from "./lib/api.js";
import { Board } from "./components/Board.js";
import { NewTaskDialog } from "./components/NewTaskDialog.js";
import { UserPicker } from "./components/UserPicker.js";
import { ArchiveView } from "./components/ArchiveView.js";
import { useStreamSubscription } from "./lib/stream.js";

export default function App() {
  const queryClient = useQueryClient();
  useStreamSubscription(queryClient);
  const { data: serverConfig } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
    staleTime: Infinity,
  });
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"board" | "archive">("board");
  return (
    <div className="flex h-full flex-col">
      {serverConfig?.demo && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-sm text-amber-300">
          Demo mode — changes will revert after a short time
        </div>
      )}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <h1 className="text-lg font-semibold">Agentic Kanban</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setView("board")}
              className={`rounded px-3 py-1 text-sm ${
                view === "board"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("archive")}
              className={`rounded px-3 py-1 text-sm ${
                view === "archive"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              Archive
            </button>
          </div>
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
        {view === "board" ? (
          <Board openTaskId={openTaskId} setOpenTaskId={setOpenTaskId} />
        ) : (
          <ArchiveView />
        )}
      </main>
      {creating && <NewTaskDialog onClose={() => setCreating(false)} />}
      <Toaster position="bottom-right" />
    </div>
  );
}
