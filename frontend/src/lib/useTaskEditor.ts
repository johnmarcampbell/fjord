import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskEvent, UpdateTaskRequest } from "@agentic-kanban/shared";
import { api, ApiError } from "./api.js";
import {
  useAddBlocker,
  useAddComment,
  useAddJournalEntry,
  useArchiveTask,
  useDeleteEvent,
  useDeleteTask,
  useRemoveBlocker,
  useUnarchiveTask,
  useUpdateEvent,
  useUpdateTask,
} from "./mutations.js";

export interface UseTaskEditor {
  task: Task | undefined;
  events: TaskEvent[];
  isLoading: boolean;
  /** Error from fetching the task (ApiError for 404 / 403, etc.). */
  error: ApiError | Error | null;
  conflict: string | null;
  clearConflict: () => void;
  update: (
    patch: Omit<UpdateTaskRequest, "version">,
    opts?: { onSuccess?: () => void },
  ) => void;
  addComment: (body: string, opts?: { onSuccess?: () => void }) => void;
  addJournal: (body: string, opts?: { onSuccess?: () => void }) => void;
  editEvent: (eventId: string, body: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  deleteEvent: (eventId: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  addBlocker: (blockerId: string) => void;
  removeBlocker: (blockerId: string) => void;
  // Pending state on event composers so callers can disable the submit
  // button while a request is in flight.
  commentPending: boolean;
  journalPending: boolean;
  addBlockerError: Error | null;
  archive: (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  unarchive: (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => void;
  delete: (opts?: { onSuccess?: () => void }) => void;
}

/**
 * Single source of truth for task mutation behavior. Both `TaskDrawer` and
 * `TaskDetail` consume this so the optimistic-concurrency handling, conflict
 * state, comment/journal/blocker plumbing, and archive/delete flows live in
 * exactly one place.
 *
 * `update(patch)` reads the current `task.version` from the cache and forwards
 * to `useUpdateTask` — callers never pass `version`.
 *
 * When `taskId` is `null` the hook returns an inert shape: task/events empty,
 * isLoading false, and every mutation is a no-op. This lets a route component
 * call it before `useParams()` is resolved.
 */
export function useTaskEditor(taskId: string | null): UseTaskEditor {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);

  // The mutation hooks are always called (rules of hooks). We pass an empty
  // string when there's no id; the underlying mutationFn is only invoked when
  // .mutate() is called, and we guard those calls below.
  const id = taskId ?? "";

  const {
    data: task,
    isLoading: taskLoading,
    error: taskError,
  } = useQuery({
    queryKey: ["task", id],
    queryFn: () => api.getTask(id),
    enabled: !!taskId,
    // Don't retry 403 / 404 — those are terminal for this id.
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return false;
      return failureCount < 2;
    },
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["task-events", id],
    queryFn: () => api.listEvents(id),
    enabled: !!taskId,
  });

  const updateMutation = useUpdateTask(id, {
    onSuccess: () => setConflict(null),
    onConflict: () =>
      setConflict("This task was modified by someone else. Re-fetching latest…"),
  });
  const deleteMutation = useDeleteTask(id);
  const commentMutation = useAddComment(id);
  const journalMutation = useAddJournalEntry(id);
  const addBlockerMutation = useAddBlocker(id);
  const removeBlockerMutation = useRemoveBlocker(id);
  const archiveMutation = useArchiveTask(id);
  const unarchiveMutation = useUnarchiveTask();
  const updateEventMutation = useUpdateEvent(id);
  const deleteEventMutation = useDeleteEvent(id);

  const clearConflict = useCallback(() => setConflict(null), []);

  const update = useCallback(
    (patch: Omit<UpdateTaskRequest, "version">, opts?: { onSuccess?: () => void }) => {
      if (!taskId) return;
      // Always read the freshest version from cache, not closed-over render data.
      const current = queryClient.getQueryData<Task>(["task", taskId]);
      const version = current?.version;
      if (version === undefined) return;
      updateMutation.mutate(
        { version, ...patch },
        { onSuccess: () => opts?.onSuccess?.() },
      );
    },
    [taskId, queryClient, updateMutation],
  );

  const addComment = useCallback(
    (body: string, opts?: { onSuccess?: () => void }) => {
      if (!taskId || !body.trim()) return;
      commentMutation.mutate(body, {
        onSuccess: () => opts?.onSuccess?.(),
      });
    },
    [taskId, commentMutation],
  );

  const addJournal = useCallback(
    (body: string, opts?: { onSuccess?: () => void }) => {
      if (!taskId || !body.trim()) return;
      journalMutation.mutate(body, {
        onSuccess: () => opts?.onSuccess?.(),
      });
    },
    [taskId, journalMutation],
  );

  const editEvent = useCallback(
    (eventId: string, body: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
      if (!taskId) return;
      updateEventMutation.mutate(
        { eventId, body },
        {
          onSuccess: () => opts?.onSuccess?.(),
          onError: (err) => opts?.onError?.(err instanceof Error ? err : new Error(String(err))),
        },
      );
    },
    [taskId, updateEventMutation],
  );

  const deleteEventFn = useCallback(
    (eventId: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
      if (!taskId) return;
      deleteEventMutation.mutate(eventId, {
        onSuccess: () => opts?.onSuccess?.(),
        onError: (err) => opts?.onError?.(err instanceof Error ? err : new Error(String(err))),
      });
    },
    [taskId, deleteEventMutation],
  );

  const addBlocker = useCallback(
    (blockerId: string) => {
      if (!taskId) return;
      addBlockerMutation.mutate(blockerId);
    },
    [taskId, addBlockerMutation],
  );

  const removeBlocker = useCallback(
    (blockerId: string) => {
      if (!taskId) return;
      removeBlockerMutation.mutate(blockerId);
    },
    [taskId, removeBlockerMutation],
  );

  const archive = useCallback(
    (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
      if (!taskId) return;
      archiveMutation.mutate(undefined, {
        onSuccess: () => opts?.onSuccess?.(),
        onError: (err) =>
          opts?.onError?.(err instanceof Error ? err : new Error(String(err))),
      });
    },
    [taskId, archiveMutation],
  );

  const unarchive = useCallback(
    (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => {
      if (!taskId) return;
      unarchiveMutation.mutate(taskId, {
        onSuccess: () => opts?.onSuccess?.(),
        onError: (err) =>
          opts?.onError?.(err instanceof Error ? err : new Error(String(err))),
      });
    },
    [taskId, unarchiveMutation],
  );

  const deleteFn = useCallback(
    (opts?: { onSuccess?: () => void }) => {
      if (!taskId) return;
      deleteMutation.mutate(undefined, {
        onSuccess: () => opts?.onSuccess?.(),
      });
    },
    [taskId, deleteMutation],
  );

  return {
    task: taskId ? task : undefined,
    events: taskId ? events : [],
    isLoading: !!taskId && (taskLoading || eventsLoading),
    error: taskId ? ((taskError as ApiError | Error | null) ?? null) : null,
    conflict,
    clearConflict,
    update,
    addComment,
    addJournal,
    editEvent,
    deleteEvent: deleteEventFn,
    addBlocker,
    removeBlocker,
    archive,
    unarchive,
    delete: deleteFn,
    commentPending: commentMutation.isPending,
    journalPending: journalMutation.isPending,
    addBlockerError: (addBlockerMutation.error as Error | null) ?? null,
  };
}
