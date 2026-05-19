import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";

export const UNASSIGNED_SENTINEL = "__unassigned__";

const STORAGE_KEY = "ak-filters";

interface PersistedFilters {
  selectedProject: string | null;
  selectedTags: string[];
  selectedUsers: string[];
}

function loadFilters(): PersistedFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { selectedProject: null, selectedTags: [], selectedUsers: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    return {
      selectedProject: parsed.selectedProject ?? null,
      selectedTags: Array.isArray(parsed.selectedTags) ? parsed.selectedTags : [],
      selectedUsers: Array.isArray(parsed.selectedUsers) ? parsed.selectedUsers : [],
    };
  } catch {
    return { selectedProject: null, selectedTags: [], selectedUsers: [] };
  }
}

interface FilterState {
  selectedProject: string | null;
  setSelectedProject: (id: string | null) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  selectedUsers: string[];
  setSelectedUsers: (users: string[]) => void;
}

const FilterContext = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const initial = loadFilters();
  const filtersRef = useRef<PersistedFilters>(initial);

  const [selectedProject, setSelectedProjectState] = useState<string | null>(initial.selectedProject);
  const [selectedTags, setSelectedTagsState] = useState<string[]>(initial.selectedTags);
  const [selectedUsers, setSelectedUsersState] = useState<string[]>(initial.selectedUsers);

  const setSelectedProject = useCallback((id: string | null) => {
    filtersRef.current = { ...filtersRef.current, selectedProject: id };
    setSelectedProjectState(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtersRef.current));
  }, []);

  const setSelectedTags = useCallback((tags: string[]) => {
    filtersRef.current = { ...filtersRef.current, selectedTags: tags };
    setSelectedTagsState(tags);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtersRef.current));
  }, []);

  const setSelectedUsers = useCallback((users: string[]) => {
    filtersRef.current = { ...filtersRef.current, selectedUsers: users };
    setSelectedUsersState(users);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtersRef.current));
  }, []);

  return (
    <FilterContext.Provider
      value={{
        selectedProject,
        setSelectedProject,
        selectedTags,
        setSelectedTags,
        selectedUsers,
        setSelectedUsers,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilterContext() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilterContext must be used within FilterProvider");
  return ctx;
}
