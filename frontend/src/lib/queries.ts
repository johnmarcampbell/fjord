import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: () => api.listTasks() });
}

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.listUsers() });
}

export function useTaskEvents(taskId: string | null) {
  return useQuery({
    queryKey: ["task-events", taskId],
    queryFn: () => api.listEvents(taskId!),
    enabled: !!taskId,
  });
}
