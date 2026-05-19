import { useEffect, useState } from "react";
import { getCurrentUserId, setCurrentUserId } from "../lib/user.js";
import { useUsers } from "../lib/queries.js";

export function UserPicker() {
  const { data: users = [], isLoading, isSuccess } = useUsers();
  const [current, setCurrent] = useState<string | null>(getCurrentUserId());

  useEffect(() => {
    if (!isSuccess) return;
    const valid = current !== null && users.some((u) => u.id === current);
    if (valid) return;
    const next = users[0]?.id ?? null;
    if (next === current) return;
    setCurrentUserId(next);
    setCurrent(next);
  }, [users, current, isSuccess]);

  if (isLoading) return <div className="text-xs text-ink-subtle">Loading…</div>;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-ink-subtle sm:inline">Acting as</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          setCurrentUserId(e.target.value || null);
          setCurrent(e.target.value || null);
        }}
        className="max-w-[140px] rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs font-medium text-ink focus:border-border-focus focus:outline-none transition-colors"
      >
        <option value="" disabled>
          (none)
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name}
            {u.kind === "agent" ? " (agent)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
