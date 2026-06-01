import { Link, useLocation, useNavigate } from "react-router-dom";
import { UserMenu } from "./UserMenu.js";
import { SpaceSwitcher } from "./SpaceSwitcher.js";
import { useTasks, useArchivedTasks } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useBoardView, type BoardView } from "../lib/BoardViewContext.js";

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

  function countBadge(value: number) {
    return (
      <span className="ml-1.5 hidden rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-muted sm:inline-block">
        {value}
      </span>
    );
  }

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2.5 shadow-[0_1px_0_var(--color-border)] sm:flex-nowrap sm:gap-x-5 sm:px-5 sm:py-3">
      {/* Location: brand + active space */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <Link to="/" className="shrink-0 text-base font-bold tracking-tight text-ink sm:text-lg">
          Fjord
        </Link>
        <span aria-hidden className="shrink-0 text-ink-subtle/50">/</span>
        <SpaceSwitcher />
      </div>

      {/* View tabs — wraps to its own row on mobile */}
      <nav className="order-last flex w-full items-center gap-3 border-t border-border pt-2 sm:order-none sm:w-auto sm:gap-4 sm:border-t-0 sm:pl-1 sm:pt-0">
        <button onClick={() => gotoView("backlog")} className={tabClass("backlog")}>
          Backlog
          {countBadge(backlogCount)}
        </button>
        <button onClick={() => gotoView("board")} className={tabClass("board")}>
          Board
          {countBadge(boardCount)}
        </button>
        <button onClick={() => gotoView("archive")} className={tabClass("archive")}>
          Archive
          {countBadge(archiveCount ?? 0)}
        </button>
      </nav>

      {/* Actions + account */}
      <div className="ml-auto flex flex-shrink-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onNewTask}
          className="whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:px-4"
        >
          <span className="sm:hidden">+&nbsp;New</span>
          <span className="hidden sm:inline">+ New task</span>
        </button>
        <Link
          to="/users"
          className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
            onUsers ? "font-medium text-ink" : "text-ink-muted hover:bg-surface-hover hover:text-ink"
          }`}
        >
          Users
        </Link>
        <UserMenu theme={theme} onToggleTheme={onToggleTheme} />
      </div>
    </header>
  );
}
