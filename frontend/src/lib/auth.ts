const KEY = "ak-auth-token";

export function getStoredToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
}

export function dispatchLogout(): void {
  window.dispatchEvent(new CustomEvent("auth:logout"));
}
