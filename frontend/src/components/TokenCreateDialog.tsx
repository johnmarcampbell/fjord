import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { FormInput, FormSelect, ErrorBanner } from "./ui/Form.js";

type ExpiryPreset = "30d" | "90d" | "1y" | "never";

function expiryAt(preset: ExpiryPreset): string | null {
  if (preset === "never") return null;
  const days = preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function TokenCreateDialog({
  userId,
  ownerHandle,
  onClose,
}: {
  userId: string;
  ownerHandle?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [expires, setExpires] = useState<ExpiryPreset>("never");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createUserToken(userId, { name: name.trim(), expires_at: expiryAt(expires) }),
    onSuccess: (res) => {
      setCreated(res.token);
      qc.invalidateQueries({ queryKey: ["user-tokens", userId] });
    },
  });

  async function onCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
      <div>
        {!created ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length === 0) return;
              create.mutate();
            }}
          >
            <h2 className="mb-1 text-base font-bold text-ink">New API token</h2>
            {ownerHandle && (
              <p className="mb-3 text-xs text-ink-subtle">
                Authenticates as <span className="font-mono">@{ownerHandle}</span>. Inherits their role.
              </p>
            )}
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Name</span>
              <FormInput
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. cli-laptop"
                maxLength={80}
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Expires</span>
              <FormSelect
                value={expires}
                onChange={(e) => setExpires(e.target.value as ExpiryPreset)}
              >
                <option value="30d">In 30 days</option>
                <option value="90d">In 90 days</option>
                <option value="1y">In 1 year</option>
                <option value="never">Never</option>
              </FormSelect>
            </label>
            <ErrorBanner className="mb-3">
              {create.error ? (create.error as Error).message ?? "Failed to create token." : null}
            </ErrorBanner>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <h2 className="mb-2 text-base font-bold text-ink">Token created</h2>
            <p className="mb-3 text-sm text-ink-muted">
              Copy this token now — it won't be shown again. Anyone with this
              token can act as <span className="font-mono">{ownerHandle ? `@${ownerHandle}` : "this user"}</span> until it's revoked.
            </p>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 font-mono text-sm text-ink">
              <span className="flex-1 overflow-x-auto whitespace-nowrap">{created}</span>
              <button
                type="button"
                onClick={onCopy}
                className="rounded bg-accent px-3 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={onClose}>I've saved it</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
