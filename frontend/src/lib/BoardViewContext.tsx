import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type BoardView = "board" | "backlog" | "archive";

const STORAGE_KEY = "fjord-view";

function readStoredView(): BoardView {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "board" || stored === "backlog" || stored === "archive") return stored;
  return "board";
}

type BoardViewContextValue = {
  view: BoardView;
  setView: (view: BoardView) => void;
};

const BoardViewContext = createContext<BoardViewContextValue | null>(null);

export function BoardViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<BoardView>(() => readStoredView());

  const setView = useCallback((next: BoardView) => {
    localStorage.setItem(STORAGE_KEY, next);
    setViewState(next);
  }, []);

  return (
    <BoardViewContext.Provider value={{ view, setView }}>{children}</BoardViewContext.Provider>
  );
}

export function useBoardView(): BoardViewContextValue {
  const ctx = useContext(BoardViewContext);
  if (!ctx) throw new Error("useBoardView must be used inside a BoardViewProvider");
  return ctx;
}
