import { toast } from "sonner";
import { ApiError } from "./api.js";

/**
 * Surface an error as a toast: the server-provided message when it's an
 * `ApiError`, otherwise the caller's fallback. Shared across mutation
 * `onError` handlers.
 */
export function handleError(err: unknown, fallback: string) {
  const msg = err instanceof ApiError ? err.message : fallback;
  toast.error(msg);
}
