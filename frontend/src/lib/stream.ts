import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { StreamEvent } from "@agentic-kanban/shared";

export function useStreamSubscription(queryClient: QueryClient): void {
  useEffect(() => {
    const source = new EventSource("/api/events/stream");
    const onMessage = (raw: MessageEvent) => {
      try {
        const event = JSON.parse(raw.data) as StreamEvent;
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
            queryClient.invalidateQueries({
              queryKey: ["task-events", event.task_id],
            });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            break;
          case "demo.reset":
            void queryClient.invalidateQueries();
            break;
        }
      } catch {
        // ignore
      }
    };
    for (const t of ["task.created", "task.updated", "task.deleted", "task.event_added", "demo.reset"]) {
      source.addEventListener(t, onMessage as EventListener);
    }
    source.onerror = () => {
      // EventSource auto-reconnects; no action needed.
    };
    return () => source.close();
  }, [queryClient]);
}
