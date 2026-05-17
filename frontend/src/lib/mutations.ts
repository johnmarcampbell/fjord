import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api.js";
import type { UpdateTaskRequest } from "@agentic-kanban/shared";

export function useUpdateTask(
  taskId: string,
  options?: { onSuccess?: () => void; onConflict?: () => void },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateTaskRequest) => api.updateTask(taskId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task-events", taskId] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
        options?.onConflict?.();
      }
    },
  });
}

export function useDeleteTask(taskId: string, options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      options?.onSuccess?.();
    },
  });
}

export function useAddComment(taskId: string, options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addComment(taskId, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-events", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      options?.onSuccess?.();
    },
  });
}

export function useAddJournalEntry(taskId: string, options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addJournalEntry(taskId, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-events", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      options?.onSuccess?.();
    },
  });
}

export function useAddBlocker(taskId: string, options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockerId: string) => api.addBlocker(taskId, { blocker_id: blockerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      options?.onSuccess?.();
    },
  });
}

export function useRemoveBlocker(taskId: string, options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockerId: string) => api.removeBlocker(taskId, blockerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      options?.onSuccess?.();
    },
  });
}

export function useArchiveTask(
  taskId: string,
  options?: { onSuccess?: () => void; onError?: (error: Error) => void },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.archiveTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      options?.onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  });
}

// taskId is passed at mutate() time since ArchiveView iterates over many tasks
export function useUnarchiveTask(options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.unarchiveTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      options?.onError?.(err instanceof Error ? err : new Error(String(err)));
    },
  });
}
