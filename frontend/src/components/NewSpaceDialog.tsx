import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { FormLabel, FormInput, FormTextarea, ErrorBanner } from "./ui/Form.js";

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
    <Modal onClose={onClose} className="w-full max-w-lg">
      <form onSubmit={onSubmit}>
        <h2 className="mb-4 text-base font-bold text-ink">New space</h2>

        <FormLabel>Name</FormLabel>
        <FormInput
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={128}
          placeholder="Marketing"
        />

        <FormLabel className="mt-4">Description</FormLabel>
        <FormTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2048}
          placeholder="Optional"
        />

        <ErrorBanner className="mt-4">{serverError}</ErrorBanner>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
