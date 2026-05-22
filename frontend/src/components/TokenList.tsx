import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { TokenCreateDialog } from "./TokenCreateDialog.js";

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function TokenList({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [showRevoked, setShowRevoked] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["user-tokens", userId, showRevoked],
    queryFn: () => api.listUserTokens(userId, showRevoked),
  });

  const revoke = useMutation({
    mutationFn: (tokenId: string) => api.revokeUserToken(userId, tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-tokens", userId] }),
  });

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-ink">API tokens</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-ink-subtle">
            <input
              type="checkbox"
              checked={showRevoked}
              onChange={(e) => setShowRevoked(e.target.checked)}
              className="rounded border-border"
            />
            Show revoked
          </label>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            + New token
          </button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-xs text-ink-subtle">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-ink-subtle">
          No tokens yet. Create one to authenticate as this user from scripts or agents.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {tokens.map((t) => {
            const revoked = !!t.revoked_at;
            const expired = !!t.expires_at && new Date(t.expires_at).getTime() < Date.now();
            return (
              <li
                key={t.id}
                className={`flex items-center justify-between gap-3 py-2 ${revoked || expired ? "opacity-60" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{t.name}</div>
                  <div className="text-[11px] text-ink-subtle">
                    <span className="font-mono">{t.preview}</span>
                    {" · created "}{fmt(t.created_at)}
                    {t.last_used_at ? <> · last used {fmt(t.last_used_at)}</> : null}
                    {t.expires_at ? <> · expires {fmt(t.expires_at)}</> : <> · no expiry</>}
                    {revoked ? <> · revoked {fmt(t.revoked_at)}</> : null}
                  </div>
                </div>
                {!revoked && (
                  <button
                    type="button"
                    onClick={() => revoke.mutate(t.id)}
                    disabled={revoke.isPending}
                    className="rounded-lg border border-danger-border bg-danger-bg px-2 py-1 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-bg/80 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {creating && <TokenCreateDialog userId={userId} onClose={() => setCreating(false)} />}
    </section>
  );
}
