import { useState } from "react";
import { changePassword } from "../lib/auth.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { FormInput, ErrorBanner } from "./ui/Form.js";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    try {
      await changePassword({ current_password: current, new_password: next });
      setDone(true);
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? "Could not change password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
      <form onSubmit={onSubmit}>
        <h2 className="mb-4 text-base font-bold text-ink">Change password</h2>
        {done ? (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              Password changed. Any other sessions you had open have been signed out.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Current password</span>
              <FormInput
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">New password</span>
              <FormInput
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">Confirm</span>
              <FormInput
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <ErrorBanner className="mb-3">{error}</ErrorBanner>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Change password"}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
