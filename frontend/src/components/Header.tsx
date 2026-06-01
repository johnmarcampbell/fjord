import { Link, useLocation, useNavigate } from "react-router-dom";
import { UserMenu } from "./UserMenu.js";
import { useTasks, useArchivedTasks } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useBoardView, type BoardView } from "../lib/BoardViewContext.js";

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

export function Header({
  theme,
  onToggleTheme,
  onNewTask,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onNewTask: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { view, setView } = useBoardView();
  const { activeSpaceId } = useActiveSpace();
  const { data: tasks = [] } = useTasks(activeSpaceId);
  const { data: archivedTasks } = useArchivedTasks(activeSpaceId);

  const onBoard = location.pathname === "/";
  const onUsers = location.pathname === "/users";
  const onSpaces = location.pathname.startsWith("/spaces");
  const boardCount = tasks.filter((t) => t.column !== "Backlog").length;
  const backlogCount = tasks.filter((t) => t.column === "Backlog").length;
  const archiveCount = archivedTasks?.length ?? null;

  function gotoView(v: BoardView) {
    setView(v);
    if (location.pathname !== "/") navigate("/");
  }

  function tabClass(v: BoardView) {
    const active = onBoard && view === v;
    return `border-b-2 px-1 pb-1 pt-1 text-sm font-medium transition-colors ${
      active ? "border-accent text-ink" : "border-transparent text-ink-subtle hover:text-ink"
    }`;
  }

  function usersLinkClass() {
    return `rounded-lg px-2 py-1.5 text-xs transition-colors ${
      onUsers ? "text-ink" : "text-ink-subtle hover:text-ink-muted"
    }`;
  }

  function spacesLinkClass() {
    return `rounded-lg px-2 py-1.5 text-xs transition-colors ${
      onSpaces ? "text-ink" : "text-ink-subtle hover:text-ink-muted"
    }`;
  }

  return (
    <header className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-2.5 shadow-[0_1px_0_var(--color-border)] sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-5 sm:py-3">
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="truncate text-base font-bold tracking-tight text-ink sm:text-lg">Fjord</span>
        </div>
        <div className="flex items-center gap-1 sm:hidden">
          <Link to="/spaces" className={spacesLinkClass()}>
            Spaces
          </Link>
          <Link to="/users" className={usersLinkClass()}>
            Users
          </Link>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-2 py-1.5 text-xs text-ink-subtle transition-colors hover:text-ink-muted"
          >
            API
          </a>
          <button
            onClick={onToggleTheme}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex flex-shrink-0 gap-3 sm:gap-4">
          <button onClick={() => gotoView("backlog")} className={tabClass("backlog")}>
            Backlog
            <span className="ml-1.5 hidden rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-muted sm:inline-block">
              {backlogCount}
            </span>
          </button>
          <button onClick={() => gotoView("board")} className={tabClass("board")}>
            Board
            <span className="ml-1.5 hidden rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-muted sm:inline-block">
              {boardCount}
            </span>
          </button>
          <button onClick={() => gotoView("archive")} className={tabClass("archive")}>
            Archive
            <span className="ml-1.5 hidden rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-muted sm:inline-block">
              {archiveCount ?? 0}
            </span>
          </button>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={onNewTask}
            className="whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:px-4"
          >
            <span className="sm:hidden">+&nbsp;New</span>
            <span className="hidden sm:inline">+ New task</span>
          </button>
          <UserMenu />
          <Link to="/spaces" className={`hidden sm:inline-block ${spacesLinkClass()}`}>
            Spaces
          </Link>
          <Link to="/users" className={`hidden sm:inline-block ${usersLinkClass()}`}>
            Users
          </Link>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg px-2 py-1.5 text-xs text-ink-subtle transition-colors hover:text-ink-muted sm:inline-block"
          >
            API docs
          </a>
          <button
            onClick={onToggleTheme}
            className="hidden rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink sm:inline-flex"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
