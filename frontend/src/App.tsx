import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { api } from "./lib/api.js";
import { Board } from "./components/Board.js";
import { NewTaskDialog } from "./components/NewTaskDialog.js";
import { TaskDrawer } from "./components/TaskDrawer.js";
import { UserPicker } from "./components/UserPicker.js";
import { ArchiveView } from "./components/ArchiveView.js";
import { useStreamSubscription } from "./lib/stream.js";
import { useTasks } from "./lib/queries.js";

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  useStreamSubscription(queryClient);
  const { data: serverConfig } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
    staleTime: Infinity,
  });
  const { data: tasks = [] } = useTasks();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"board" | "archive">("board");
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "light",
  );

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ak-theme", next);
    setTheme(next);
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {serverConfig?.demo && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-sm text-[rgb(202,168,55)]">
          Demo mode — changes will revert after a short time
        </div>
      )}
      <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3 shadow-[0_1px_0_var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-ink">Agentic Kanban</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-4">
            <button
              onClick={() => setView("board")}
              className={`border-b-2 px-1 pb-1 pt-1 text-sm font-medium transition-colors ${
                view === "board"
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-subtle hover:text-ink"
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setView("archive")}
              className={`border-b-2 px-1 pb-1 pt-1 text-sm font-medium transition-colors ${
                view === "archive"
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-subtle hover:text-ink"
              }`}
            >
              Archive
            </button>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            + New task
          </button>
          <UserPicker />
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-2 py-1.5 text-xs text-ink-subtle transition-colors hover:text-ink-muted"
          >
            API docs
          </a>
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        {view === "board" ? (
          <Board setOpenTaskId={setOpenTaskId} />
        ) : (
          <ArchiveView onOpenTask={setOpenTaskId} />
        )}
      </main>
      {creating && <NewTaskDialog onClose={() => setCreating(false)} />}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          allTasks={tasks}
          onClose={() => setOpenTaskId(null)}
          onOpenTask={setOpenTaskId}
        />
      )}
      <Toaster position="bottom-right" />
    </div>
  );
}
