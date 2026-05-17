import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { StreamEvent } from "@agentic-kanban/shared";
import { getStoredToken, setStoredToken, dispatchLogout } from "./auth.js";

export function useStreamSubscription(queryClient: QueryClient): void {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;

    async function connect() {
      while (active) {
        abortRef.current = new AbortController();
        try {
          const token = getStoredToken();
          const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch("/api/events/stream", {
            headers,
            signal: abortRef.current.signal,
          });

          if (res.status === 401) {
            setStoredToken(null);
            dispatchLogout();
            return;
          }

          if (!res.body) return;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let data = "";

          while (active) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                data = line.slice(6).trim();
              } else if (line === "") {
                if (data) {
                  try {
                    const event = JSON.parse(data) as StreamEvent;
                    handleEvent(event, queryClient);
                  } catch {
                    // ignore parse errors
                  }
                }
                data = "";
              }
            }
          }
        } catch {
          if (!active) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    void connect();

    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [queryClient]);
}

function handleEvent(event: StreamEvent, queryClient: QueryClient): void {
  switch (event.type) {
    case "task.created":
    case "task.deleted":
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      break;
    case "task.updated":
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", event.task_id] });
      break;
    case "task.event_added":
      queryClient.invalidateQueries({ queryKey: ["task-events", event.task_id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      break;
    case "demo.reset":
      void queryClient.invalidateQueries();
      break;
  }
}
