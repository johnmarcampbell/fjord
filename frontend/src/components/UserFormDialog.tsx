import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AVATAR_EMOJI_LIST,
  DEFAULT_ADMINISTRATOR_ID,
  slugify,
  validateAvatar,
  validateHandle,
  type Role,
  type UserKind,
} from "@agentic-kanban/shared";
import { api, ApiError } from "../lib/api.js";
import { useUsers } from "../lib/queries.js";
import { useCurrentUser, useInvalidateMe } from "../lib/auth.js";
import { isAdmin } from "../lib/policy.js";
import { TokenList } from "./TokenList.js";

type FormState = {
  display_name: string;
  handle: string;
  kind: UserKind;
  role: Role;
  title: string;
  bio: string;
  avatar: string;
};

type FieldErrors = {
  display_name?: string | null;
  handle?: string | null;
  avatar?: string | null;
};

export function UserFormDialog({
  mode,
  userId,
  onClose,
}: {
  mode: "create" | "edit";
  userId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: users = [] } = useUsers();
  const existing = useMemo(
    () => (mode === "edit" && userId ? users.find((u) => u.id === userId) : undefined),
    [mode, userId, users],
  );
  const { data: me } = useCurrentUser();
  const invalidateMe = useInvalidateMe();
  const currentUser = me ? users.find((u) => u.id === me.id) : undefined;
  const currentIsAdmin = currentUser ? isAdmin(currentUser) : false;
  const isDefaultAdmin = userId === DEFAULT_ADMINISTRATOR_ID;

  const [form, setForm] = useState<FormState>(() => {
    if (existing) {
      return {
        display_name: existing.display_name,
        handle: existing.handle,
        kind: existing.kind,
        role: existing.role,
        title: existing.title ?? "",
        bio: existing.bio ?? "",
        avatar: existing.avatar || AVATAR_EMOJI_LIST[0],
      };
    }
    return {
      display_name: "",
      handle: "",
      kind: "human",
      role: "Member",
      title: "",
      bio: "",
      avatar: AVATAR_EMOJI_LIST[0],
    };
  });
  const [handleTouched, setHandleTouched] = useState(mode === "edit");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (mode !== "create") return;
    if (handleTouched) return;
    setForm((prev) => ({ ...prev, handle: slugify(prev.display_name) }));
  }, [form.display_name, handleTouched, mode]);

  const createMutation = useMutation({
    mutationFn: (body: { id: string } & FormState) => api.createUser(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FormState> }) =>
      api.updateUser(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: (_, id) => {
      if (me?.id === id) void invalidateMe();
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => api.resetUserPassword(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const [confirmingReset, setConfirmingReset] = useState(false);
  const canResetOthersPassword =
    mode === "edit" &&
    currentIsAdmin &&
    !!existing &&
    existing.kind === "human" &&
    existing.id !== me?.id;

  useEffect(() => {
    const err = createMutation.error ?? updateMutation.error ?? deleteMutation.error;
    if (!err) {
      setServerError(null);
      return;
    }
    if (err instanceof ApiError) {
      const code = (err.body as { code?: string } | undefined)?.code;
      if (code === "handle_taken") {
        setFieldErrors((prev) => ({ ...prev, handle: err.message }));
        setServerError(null);
        return;
      }
      setServerError(err.message);
      return;
    }
    setServerError((err as Error).message ?? "Something went wrong");
  }, [createMutation.error, updateMutation.error, deleteMutation.error]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setAvatar(value: string) {
    setForm((prev) => ({ ...prev, avatar: value }));
    setFieldErrors((prev) => ({ ...prev, avatar: null }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const displayNameTrimmed = form.display_name.trim();
    const handleResult = validateHandle(form.handle);
    const avatarResult = validateAvatar(form.avatar);
    const nameErr = displayNameTrimmed.length === 0 ? "Required" : null;
    const handleErr = handleResult.ok ? null : handleResult.message;
    const avatarErr = avatarResult.ok ? null : avatarResult.message;
    setFieldErrors({ display_name: nameErr, handle: handleErr, avatar: avatarErr });
    if (nameErr || handleErr || avatarErr) return;

    const body: FormState = {
      display_name: displayNameTrimmed,
      handle: form.handle.toLowerCase(),
      kind: form.kind,
      role: currentIsAdmin ? form.role : (existing?.role ?? "Member"),
      title: form.title.trim(),
      bio: form.bio,
      avatar: form.avatar,
    };

    if (mode === "create") {
      createMutation.mutate({ id: crypto.randomUUID(), ...body });
    } else {
      updateMutation.mutate({ id: userId!, body });
    }
  }

  const pending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-modal border border-border bg-surface shadow-modal">
      <form onSubmit={onSubmit} className="p-5">
        <h2 className="mb-4 text-base font-bold text-ink">
          {mode === "create" ? "New user" : `Edit ${existing?.display_name ?? "user"}`}
        </h2>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Display name
        </label>
        <input
          autoFocus={mode === "create"}
          value={form.display_name}
          onChange={(e) => update("display_name", e.target.value)}
          maxLength={128}
          className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
          placeholder="Ada Lovelace"
        />
        {fieldErrors.display_name && (
          <p className="mt-1 text-xs text-danger-text">{fieldErrors.display_name}</p>
        )}

        <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Handle
        </label>
        <div className="flex items-center rounded-lg border border-border bg-surface-subtle focus-within:border-border-focus transition-colors">
          <span className="pl-3 text-sm text-ink-subtle">@</span>
          <input
            value={form.handle}
            onChange={(e) => {
              setHandleTouched(true);
              update("handle", e.target.value);
            }}
            onFocus={() => setHandleTouched(true)}
            maxLength={32}
            className="w-full bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            placeholder="ada"
          />
        </div>
        {fieldErrors.handle && (
          <p className="mt-1 text-xs text-danger-text">{fieldErrors.handle}</p>
        )}

        <div className={`mt-4 grid gap-4 ${currentIsAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Kind
            </label>
            <select
              value={form.kind}
              onChange={(e) => update("kind", e.target.value as UserKind)}
              className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
            >
              <option value="human">Human</option>
              <option value="agent">Agent (bot)</option>
            </select>
          </div>
          {currentIsAdmin && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Role
              </label>
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value as Role)}
                disabled={isDefaultAdmin}
                className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors disabled:opacity-60"
              >
                <option value="Member">Member</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Title
            </label>
            <input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              maxLength={128}
              className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
              placeholder="Mathematician"
            />
          </div>
        </div>

        <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Bio
        </label>
        <textarea
          value={form.bio}
          onChange={(e) => update("bio", e.target.value)}
          rows={3}
          maxLength={1024}
          className="w-full resize-none rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
          placeholder="A few words about yourself…"
        />

        <label className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Avatar
        </label>
        <div className="grid grid-cols-6 gap-1.5">
          {AVATAR_EMOJI_LIST.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setAvatar(e)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors ${
                form.avatar === e
                  ? "border-accent ring-2 ring-accent"
                  : "border-border hover:bg-surface-hover"
              }`}
              aria-label={`Pick emoji ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={form.avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="🦊 or https://…"
          maxLength={2048}
          className="mt-2 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
        />
        {fieldErrors.avatar && (
          <p className="mt-1 text-xs text-danger-text">{fieldErrors.avatar}</p>
        )}

        {serverError && (
          <div className="mt-4 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {serverError}
          </div>
        )}

        {canResetOthersPassword && (
          <div className="mt-6 border-t border-border pt-4">
            {!confirmingReset ? (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="text-xs font-semibold text-ink-muted transition-colors hover:text-ink hover:underline"
                title="Clear this user's password. They can sign in once with no password to set a new one."
              >
                Reset password
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-ink-muted">
                  Clear @{existing?.handle}'s password? They'll set a new one on next login.
                </span>
                <button
                  type="button"
                  onClick={() => resetPasswordMutation.mutate(userId!)}
                  disabled={resetPasswordMutation.isPending}
                  className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-hover disabled:opacity-40"
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            )}
            {resetPasswordMutation.isSuccess && !confirmingReset && (
              <p className="mt-2 text-[11px] text-ink-subtle">Password cleared. Their sessions have been signed out.</p>
            )}
          </div>
        )}

        {mode === "edit" && !isDefaultAdmin && (
          <div className="mt-6 border-t border-border pt-4">
            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-xs font-semibold text-danger-text transition-colors hover:underline"
              >
                Delete user
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-danger-text">This cannot be undone.</span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(userId!)}
                  disabled={pending}
                  className="rounded-lg border border-danger-border bg-danger-bg px-3 py-1.5 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-bg/80 disabled:opacity-40"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            )}
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
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </form>

      {mode === "edit" && userId && existing && !existing.deleted_at && (
        <div className="border-t border-border px-5 pb-5">
          <TokenList userId={userId} ownerHandle={existing.handle} />
        </div>
      )}
      </div>
    </div>
  );
}
