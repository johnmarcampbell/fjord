import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";

type ExpiryPreset = "30d" | "90d" | "1y" | "never";

function expiryAt(preset: ExpiryPreset): string | null {
  if (preset === "never") return null;
  const days = preset === "30d" ? 30 : preset === "90d" ? 90 : 365;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function TokenCreateDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-modal border border-border bg-surface p-5 shadow-modal">
        {!created ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length === 0) return;
              create.mutate();
            }}
          >
            <h2 className="mb-3 text-base font-bold text-ink">New API token</h2>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. cli-laptop"
                maxLength={80}
                className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Expires</span>
              <select
                value={expires}
                onChange={(e) => setExpires(e.target.value as ExpiryPreset)}
                className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
              >
                <option value="30d">In 30 days</option>
                <option value="90d">In 90 days</option>
                <option value="1y">In 1 year</option>
                <option value="never">Never</option>
              </select>
            </label>
            {create.error && (
              <div className="mb-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
                {(create.error as Error).message ?? "Failed to create token."}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                {create.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h2 className="mb-2 text-base font-bold text-ink">Token created</h2>
            <p className="mb-3 text-sm text-ink-muted">
              Copy this token now — it won't be shown again.
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
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
              >
                I've saved it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
