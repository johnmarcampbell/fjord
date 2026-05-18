import { createContext, useContext, useState, type ReactNode } from "react";

export const UNASSIGNED_SENTINEL = "__unassigned__";

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
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

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
