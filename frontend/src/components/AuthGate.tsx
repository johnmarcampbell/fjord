import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { login, useCurrentUser, useInvalidateMe } from "../lib/auth.js";
import { LoginPage } from "../pages/LoginPage.js";
import { SetPasswordPage } from "../pages/SetPasswordPage.js";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const invalidateMe = useInvalidateMe();
  const { data: serverConfig } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
    staleTime: Infinity,
  });
  const { data: me, isLoading, isFetched } = useCurrentUser();
  const demoLoginAttempted = useRef(false);

  // In demo mode, auto-log-in as default-administrator on first load.
  useEffect(() => {
    if (!serverConfig?.demo) return;
    if (demoLoginAttempted.current) return;
    if (me) return;
    if (!isFetched) return;
    demoLoginAttempted.current = true;
    void (async () => {
      try {
        await login({});
        await invalidateMe();
      } catch {
        // surface as login page below
      }
    })();
  }, [serverConfig?.demo, me, isFetched, invalidateMe]);

  // Listen for 401s from anywhere in the app and bounce to the login screen.
  useEffect(() => {
    function onLogout() {
      qc.setQueryData(["auth", "me"], null);
    }
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, [qc]);

  if (isLoading || !serverConfig) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-sm text-ink-subtle">Loading…</div>
      </div>
    );
  }

  if (!me) {
    if (serverConfig.demo) {
      return (
        <div className="flex h-screen items-center justify-center bg-bg">
          <div className="text-sm text-ink-subtle">Starting demo session…</div>
        </div>
      );
    }
    return <LoginPage />;
  }

  if (me.requires_password_set) {
    return <SetPasswordPage />;
  }

  return <>{children}</>;
}
