import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Toaster } from "sonner";
import { api } from "./lib/api.js";
import { useStreamSubscription } from "./lib/stream.js";
import { useUsers } from "./lib/queries.js";
import { FilterProvider } from "./lib/FilterContext.js";
import { SpaceProvider } from "./lib/SpaceContext.js";
import { BoardViewProvider } from "./lib/BoardViewContext.js";
import { Header } from "./components/Header.js";
import { BoardPage } from "./pages/BoardPage.js";
import { UsersPage } from "./pages/UsersPage.js";

export default function App() {
  return (
    <BrowserRouter>
      <SpaceProvider>
        <FilterProvider>
          <BoardViewProvider>
            <AppShell />
          </BoardViewProvider>
        </FilterProvider>
      </SpaceProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const queryClient = useQueryClient();
  useStreamSubscription(queryClient);
  const { data: serverConfig } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
    staleTime: Infinity,
  });
  const { data: users, isSuccess: usersLoaded } = useUsers();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (document.documentElement.getAttribute("data-theme") as "light" | "dark") ?? "light",
  );

  useEffect(() => {
    if (!usersLoaded) return;
    if (users && users.length === 0 && location.pathname !== "/users") {
      navigate("/users", { replace: true });
    }
  }, [usersLoaded, users, location.pathname, navigate]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ak-theme", next);
    setTheme(next);
  }

  function onNewTask() {
    if (location.pathname !== "/") navigate("/");
    setCreating(true);
  }

  return (
    <div className="flex h-full flex-col overflow-x-hidden bg-bg">
      {serverConfig?.demo && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-sm text-[rgb(202,168,55)]">
          Demo mode — changes will revert after a short time
        </div>
      )}
      <Header theme={theme} onToggleTheme={toggleTheme} onNewTask={onNewTask} />
      <Routes>
        <Route
          path="/"
          element={
            <BoardPage creating={creating} onCloseCreating={() => setCreating(false)} />
          }
        />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster
        position="bottom-right"
        theme={theme}
        style={
          {
            "--normal-bg": "var(--color-surface-elevated)",
            "--normal-text": "var(--color-text)",
            "--normal-border": "var(--color-border)",
            "--success-bg": "var(--color-surface-elevated)",
            "--success-text": "var(--color-text)",
            "--success-border": "var(--color-border)",
            "--error-bg": "var(--color-surface-elevated)",
            "--error-text": "var(--color-danger-text)",
            "--error-border": "var(--color-danger-border)",
          } as CSSProperties
        }
        toastOptions={{
          classNames: {
            toast: "!font-sans !shadow-modal",
            actionButton: "!bg-accent !text-accent-fg hover:!bg-accent-hover !font-semibold",
            title: "!text-ink",
            description: "!text-ink-muted",
          },
        }}
      />
    </div>
  );
}
