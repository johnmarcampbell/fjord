import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { Project } from "@agentic-kanban/shared";
import { api } from "../lib/api.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { DateTimePicker } from "./DateTimePicker.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { FormLabel, FormInput, ErrorBanner } from "./ui/Form.js";

const PRESET_COLORS = [
  "#4A7FA5", "#6B9E8A", "#C9A94A", "#6B7F8E",
  "#9E4B4B", "#4A6B5A", "#7B9AAF", "#8B7355",
];

/**
 * Create or edit a project. `initial === null` creates a new project in the
 * active space; passing a project edits it.
 */
export function ProjectFormDialog({
  initial,
  onClose,
}: {
  initial: Project | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { activeSpaceId } = useActiveSpace();
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
        space_id: activeSpaceId,
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
    <Modal onClose={onClose} className="w-80">
      <h2 className="mb-4 text-base font-bold text-ink">
        {isEditing ? "Edit project" : "New project"}
      </h2>

      <FormLabel>Name</FormLabel>
      <FormInput
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-4"
      />

      <FormLabel className="mb-2">Color</FormLabel>
      <div className="mb-4 flex gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={clsx(
              "h-6 w-6 rounded-full transition-transform hover:scale-110",
              color === c && "ring-2 ring-border-focus ring-offset-2 ring-offset-surface",
            )}
            style={{ background: c }}
          />
        ))}
      </div>

      <FormLabel>Description</FormLabel>
      <FormInput
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="mb-4"
      />

      <FormLabel>Due date</FormLabel>
      <div className="mb-5">
        <DateTimePicker
          value={dueAt ? new Date(dueAt).toISOString() : ""}
          onChange={(iso) => setDueAt(iso ? toLocalInputValue(iso) : "")}
        />
      </div>

      <ErrorBanner className="mb-3">
        {mutation.isError ? (mutation.error as Error).message : null}
      </ErrorBanner>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (name.trim()) mutation.mutate();
          }}
          disabled={!name.trim() || mutation.isPending}
        >
          {isEditing ? "Save" : "Create"}
        </Button>
      </div>
    </Modal>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
