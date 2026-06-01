import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { Project, User } from "@fjord/shared";
import { api } from "../lib/api.js";
import { useProjects, useUsers } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useFilterContext, UNASSIGNED_SENTINEL } from "../lib/FilterContext.js";
import { useCurrentUser } from "../lib/auth.js";
import { ProjectFormDialog } from "./ProjectFormDialog.js";

interface FilterBarProps {
  allTags: string[];
}

export function FilterBar({ allTags }: FilterBarProps) {
  const {
    selectedProject,
    setSelectedProject,
    selectedTags,
    setSelectedTags,
    selectedUsers,
    setSelectedUsers,
  } = useFilterContext();

  const { activeSpaceId } = useActiveSpace();
  const { data: projects = [] } = useProjects(activeSpaceId);
  const { data: allUsers = [] } = useUsers();
  const users = allUsers.filter((u) => !u.deleted_at);
  const [projectOpen, setProjectOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | "new" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: me } = useCurrentUser();
  const currentUserId = me?.id ?? null;
  const selectedProjectObj = projects.find((p) => p.id === selectedProject);

  const suggestions = allTags.filter(
    (t) => t.includes(tagInput.toLowerCase()) && !selectedTags.includes(t),
  );
  const hasFilters = selectedProject !== null || selectedTags.length > 0 || selectedUsers.length > 0;

  const userDropdownLabel = useMemo(() => {
    if (selectedUsers.length === 0) return "All users";
    if (selectedUsers.length === 1) {
      if (selectedUsers[0] === UNASSIGNED_SENTINEL) return "Unassigned";
      const u = allUsers.find((u) => u.id === selectedUsers[0]);
      return u?.display_name ?? "1 user";
    }
    return `${selectedUsers.length} users`;
  }, [selectedUsers, allUsers]);

  const isAssignedToMeActive =
    currentUserId !== null &&
    selectedUsers.length === 1 &&
    selectedUsers[0] === currentUserId;

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (clean && !selectedTags.includes(clean)) {
      setSelectedTags([...selectedTags, clean]);
    }
    setTagInput("");
    setShowSuggestions(false);
  }

  function toggleUser(id: string) {
    if (selectedUsers.includes(id)) {
      setSelectedUsers(selectedUsers.filter((u) => u !== id));
    } else {
      setSelectedUsers([...selectedUsers, id]);
    }
  }

  function handleAssignedToMe() {
    if (!currentUserId) return;
    if (isAssignedToMeActive) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers([currentUserId]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5 sm:px-5">
      {/* Project picker */}
      <div className="relative">
        <button
          onClick={() => setProjectOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-border-focus hover:text-ink"
        >
          {selectedProjectObj ? (
            <>
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: selectedProjectObj.color }}
              />
              <span>{selectedProjectObj.name}</span>
            </>
          ) : (
            <span>All projects</span>
          )}
          <span className="ml-0.5 text-ink-subtle">▾</span>
        </button>

        {projectOpen && (
          <ProjectDropdown
            projects={projects}
            selectedId={selectedProject}
            onSelect={(id) => {
              setSelectedProject(id);
              setProjectOpen(false);
            }}
            onClose={() => setProjectOpen(false)}
            onEdit={(p) => {
              setEditingProject(p);
              setProjectOpen(false);
            }}
            onNew={() => {
              setEditingProject("new");
              setProjectOpen(false);
            }}
            onDeletedSelected={() => setSelectedProject(null)}
          />
        )}
      </div>

      {/* User picker */}
      <div className="relative">
        <button
          onClick={() => setUserOpen((v) => !v)}
          className={clsx(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
            selectedUsers.length > 0
              ? "border-accent/40 bg-accent/10 text-accent hover:border-accent/60"
              : "border-border bg-surface-subtle text-ink-muted hover:border-border-focus hover:text-ink",
          )}
        >
          <span>{userDropdownLabel}</span>
          <span className="ml-0.5 text-ink-subtle">▾</span>
        </button>

        {userOpen && (
          <UserDropdown
            users={users}
            selectedUsers={selectedUsers}
            onToggle={toggleUser}
            onClose={() => setUserOpen(false)}
          />
        )}
      </div>

      {/* Assigned to me */}
      {currentUserId && (
        <button
          onClick={handleAssignedToMe}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
            isAssignedToMeActive
              ? "border-accent/40 bg-accent/10 text-accent hover:border-accent/60"
              : "border-border bg-surface-subtle text-ink-muted hover:border-border-focus hover:text-ink",
          )}
        >
          Assigned to me
        </button>
      )}

      {/* Active tag pills */}
      {selectedTags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-tag-bg px-2.5 py-1 text-xs font-semibold text-tag-text"
        >
          {tag}
          <button
            onClick={() => setSelectedTags(selectedTags.filter((t) => t !== tag))}
            className="ml-0.5 text-tag-text opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </span>
      ))}

      {/* Tag input */}
      <div className="relative">
        <input
          value={tagInput}
          onChange={(e) => {
            setTagInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="Filter by tag…"
          className="w-32 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-border bg-surface-elevated py-1 shadow-modal">
            {suggestions.slice(0, 8).map((tag) => (
              <button
                key={tag}
                onMouseDown={() => addTag(tag)}
                className="block w-full px-3 py-1.5 text-left text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasFilters && (
        <button
          onClick={() => {
            setSelectedProject(null);
            setSelectedTags([]);
            setSelectedUsers([]);
          }}
          className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted"
        >
          Clear filters
        </button>
      )}

      {editingProject !== null && (
        <ProjectFormDialog
          initial={editingProject === "new" ? null : editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
    </div>
  );
}

function UserDropdown({
  users,
  selectedUsers,
  onToggle,
  onClose,
}: {
  users: User[];
  selectedUsers: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-border bg-surface-elevated py-1 shadow-modal"
    >
      <button
        onClick={() => onToggle(UNASSIGNED_SENTINEL)}
        className={clsx(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-surface-hover",
          selectedUsers.includes(UNASSIGNED_SENTINEL) ? "text-accent" : "text-ink-muted",
        )}
      >
        <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full border border-current opacity-50" />
        Unassigned
      </button>
      {users.map((u) => (
        <button
          key={u.id}
          onClick={() => onToggle(u.id)}
          className={clsx(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-surface-hover",
            selectedUsers.includes(u.id) ? "text-accent" : "text-ink-muted",
          )}
        >
          <span
            className={clsx(
              "inline-block h-2 w-2 flex-shrink-0 rounded-full",
              u.kind === "agent" ? "rounded-sm" : "rounded-full",
            )}
            style={{ background: "currentColor", opacity: 0.5 }}
          />
          <span className="truncate">{u.display_name}</span>
          {u.kind === "agent" && (
            <span className="ml-auto flex-shrink-0 text-[10px] font-normal opacity-50">bot</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ProjectDropdown({
  projects,
  selectedId,
  onSelect,
  onClose,
  onEdit,
  onNew,
  onDeletedSelected,
}: {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  onEdit: (p: Project) => void;
  onNew: () => void;
  onDeletedSelected: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border bg-surface-elevated py-1 shadow-modal">
      <button
        onClick={() => onSelect(null)}
        className={clsx(
          "block w-full px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-surface-hover",
          !selectedId ? "text-accent" : "text-ink-muted",
        )}
      >
        All projects
      </button>
      {projects.map((p) => (
        <div key={p.id} className="group flex items-center">
          <button
            onClick={() => onSelect(p.id)}
            className={clsx(
              "flex flex-1 items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-surface-hover",
              selectedId === p.id ? "text-accent" : "text-ink-muted",
            )}
          >
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="truncate">{p.name}</span>
          </button>
          <div className="flex items-center gap-1 pr-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => onEdit(p)}
              className="text-ink-subtle transition-colors hover:text-ink-muted"
              title="Edit project"
            >
              ✎
            </button>
            <DeleteProjectButton
              projectId={p.id}
              onDeleted={() => {
                if (selectedId === p.id) onDeletedSelected();
                onClose();
              }}
            />
          </div>
        </div>
      ))}
      <div className="mt-1 border-t border-border pt-1">
        <button
          onClick={onNew}
          className="block w-full px-3 py-2 text-left text-xs font-semibold text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted"
        >
          + New project
        </button>
      </div>
    </div>
  );
}

function DeleteProjectButton({
  projectId,
  onDeleted,
}: {
  projectId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onDeleted();
    },
  });
  return (
    <button
      onClick={() => {
        if (confirm("Delete this project? Tasks will lose their project assignment.")) {
          del.mutate();
        }
      }}
      className="text-ink-subtle transition-colors hover:text-danger"
      title="Delete project"
    >
      ✕
    </button>
  );
}
