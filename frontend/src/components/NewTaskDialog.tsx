import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.createTask({ title, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
        className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl"
      >
        <h2 className="mb-3 text-lg font-semibold">New task</h2>
        <label className="block text-xs text-slate-400">Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm"
        />
        <label className="mt-3 block text-xs text-slate-400">
          Description (markdown)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm font-mono"
        />
        {create.isError && (
          <div className="mt-2 text-sm text-red-400">
            {(create.error as Error).message}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1 text-sm hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || create.isPending}
            className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
