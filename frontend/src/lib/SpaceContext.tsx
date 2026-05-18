import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_SPACE_ID, type Space } from "@agentic-kanban/shared";
import { getStoredSpaceId, setStoredSpaceId } from "./space.js";
import { useSpaces } from "./queries.js";

interface SpaceContextValue {
  activeSpaceId: string;
  activeSpace: Space | undefined;
  spaces: Space[];
  setActiveSpaceId: (id: string) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: spaces = [] } = useSpaces();
  const [activeSpaceId, setActiveSpaceIdState] = useState<string>(getStoredSpaceId);

  // If the active space disappears (deleted elsewhere), fall back to default.
  useEffect(() => {
    if (spaces.length === 0) return;
    if (!spaces.some((s) => s.id === activeSpaceId)) {
      setActiveSpaceIdState(DEFAULT_SPACE_ID);
      setStoredSpaceId(DEFAULT_SPACE_ID);
    }
  }, [spaces, activeSpaceId]);

  const setActiveSpaceId = useCallback(
    (id: string) => {
      setStoredSpaceId(id);
      setActiveSpaceIdState(id);
      // Force list queries scoped to the old space to refetch.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
    },
    [queryClient],
  );

  const activeSpace = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId),
    [spaces, activeSpaceId],
  );

  const value = useMemo<SpaceContextValue>(
    () => ({ activeSpaceId, activeSpace, spaces, setActiveSpaceId }),
    [activeSpaceId, activeSpace, spaces, setActiveSpaceId],
  );

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useActiveSpace(): SpaceContextValue {
  const v = useContext(SpaceContext);
  if (!v) throw new Error("useActiveSpace must be used inside <SpaceProvider>");
  return v;
}
