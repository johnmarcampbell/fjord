import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api.js";

export function NewSpaceDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSpace({
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success(`Space "${s.name}" created`);
      onClose();
      navigate(`/spaces/${s.id}`);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.message : (err as Error).message ?? "Create failed";
      setServerError(msg);
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!name.trim()) return;
    createMutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-lg rounded-modal border border-border bg-surface p-5 shadow-modal"
      >
        <h2 className="mb-4 text-base font-bold text-ink">New space</h2>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
          placeholder="Marketing"
        />

        <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2048}
          className="w-full resize-none rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
          placeholder="Optional"
        />

        {serverError && (
          <div className="mt-4 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {serverError}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
