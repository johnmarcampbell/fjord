import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { Project } from "@agentic-kanban/shared";
import { api } from "../lib/api.js";
import { useProjects } from "../lib/queries.js";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

interface FilterBarProps {
  selectedProject: string | null;
  selectedTags: string[];
  onProjectChange: (id: string | null) => void;
  onTagsChange: (tags: string[]) => void;
  allTags: string[];
}

export function FilterBar({
  selectedProject,
  selectedTags,
  onProjectChange,
  onTagsChange,
  allTags,
}: FilterBarProps) {
  const { data: projects = [] } = useProjects();
  const [projectOpen, setProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | "new" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedProjectObj = projects.find((p) => p.id === selectedProject);
  const suggestions = allTags.filter(
    (t) => t.includes(tagInput.toLowerCase()) && !selectedTags.includes(t),
  );
  const hasFilters = selectedProject !== null || selectedTags.length > 0;

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (clean && !selectedTags.includes(clean)) {
      onTagsChange([...selectedTags, clean]);
    }
    setTagInput("");
    setShowSuggestions(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/50 px-4 py-2">
      {/* Project picker */}
      <div className="relative">
        <button
          onClick={() => setProjectOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:border-slate-600"
        >
          {selectedProjectObj ? (
            <>
              <span
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{ background: selectedProjectObj.color }}
              />
              <span>{selectedProjectObj.name}</span>
            </>
          ) : (
            <span className="text-slate-400">All projects</span>
          )}
          <span className="ml-0.5 text-slate-500">▾</span>
        </button>

        {projectOpen && (
          <ProjectDropdown
            projects={projects}
            selectedId={selectedProject}
            onSelect={(id) => {
              onProjectChange(id);
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
            onDeletedSelected={() => onProjectChange(null)}
          />
        )}
      </div>

      {/* Active tag pills */}
      {selectedTags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-xs"
        >
          {tag}
          <button
            onClick={() => onTagsChange(selectedTags.filter((t) => t !== tag))}
            className="text-slate-400 hover:text-slate-200"
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
          className="w-32 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded border border-slate-700 bg-slate-800 shadow-lg">
            {suggestions.slice(0, 8).map((tag) => (
              <button
                key={tag}
                onMouseDown={() => addTag(tag)}
                className="block w-full px-2 py-1 text-left text-xs hover:bg-slate-700"
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
            onProjectChange(null);
            onTagsChange([]);
          }}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Clear filters
        </button>
      )}

      {editingProject !== null && (
        <ProjectForm
          initial={editingProject === "new" ? null : editingProject}
          onClose={() => setEditingProject(null)}
        />
      )}
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
  return (
    <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded border border-slate-700 bg-slate-800 shadow-lg">
      <button
        onClick={() => onSelect(null)}
        className={clsx(
          "block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-700",
          !selectedId && "text-blue-400",
        )}
      >
        All projects
      </button>
      {projects.map((p) => (
        <div key={p.id} className="group flex items-center">
          <button
            onClick={() => onSelect(p.id)}
            className={clsx(
              "flex flex-1 items-center gap-1.5 px-3 py-1.5 text-left text-xs hover:bg-slate-700",
              selectedId === p.id && "text-blue-400",
            )}
          >
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="truncate">{p.name}</span>
          </button>
          <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => onEdit(p)}
              className="text-slate-400 hover:text-slate-200"
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
      <div className="mt-1 border-t border-slate-700 pt-1">
        <button
          onClick={onNew}
          className="block w-full px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
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
      className="text-slate-500 hover:text-red-400"
      title="Delete project"
    >
      ✕
    </button>
  );
}

function ProjectForm({
  initial,
  onClose,
}: {
  initial: Project | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueAt, setDueAt] = useState(
    initial?.due_at ? toLocalInputValue(initial.due_at) : "",
  );

  const isEditing = initial !== null;

  const createMutation = useMutation({
    mutationFn: () =>
      api.createProject({
        name,
        color,
        description,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateProject(initial!.id, {
        name,
        color,
        description,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });

  const mutation = isEditing ? updateMutation : createMutation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold">
          {isEditing ? "Edit project" : "New project"}
        </h2>

        <label className="mb-1 block text-xs text-slate-400">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
        />

        <label className="mb-1 block text-xs text-slate-400">Color</label>
        <div className="mb-3 flex gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={clsx(
                "h-5 w-5 rounded-full",
                color === c && "ring-2 ring-white ring-offset-1 ring-offset-slate-900",
              )}
              style={{ background: c }}
            />
          ))}
        </div>

        <label className="mb-1 block text-xs text-slate-400">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
        />

        <label className="mb-1 block text-xs text-slate-400">Due date</label>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="mb-4 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
        />

        {mutation.isError && (
          <div className="mb-2 text-xs text-red-400">
            {(mutation.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-sm hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (name.trim()) mutation.mutate();
            }}
            disabled={!name.trim() || mutation.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            {isEditing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
