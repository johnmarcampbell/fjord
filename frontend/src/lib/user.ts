/**
 * Identity is established by /api/auth/me — there is no longer a
 * localStorage-backed user. This file is kept as a tombstone so any
 * straggling import surfaces as a type error rather than a runtime crash.
 *
 * Use `useCurrentUser()` from `./auth.js` instead.
 */
export const DEPRECATED_USER_MODULE = true;
