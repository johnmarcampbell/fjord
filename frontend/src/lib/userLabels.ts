import type { User } from "@fjord/shared";

export type UserLookup = Map<string, User>;

export function createUserLookup(users: User[]): UserLookup {
  return new Map(users.map((user) => [user.id, user]));
}

function formatResolvedHandle(user: User, includeDeletedSuffix: boolean): string {
  if (includeDeletedSuffix && user.deleted_at) {
    return `@${user.handle} (deleted)`;
  }
  return `@${user.handle}`;
}

export function formatAssigneeLabel(usersById: UserLookup, assigneeId: string | null): string {
  if (!assigneeId) return "unassigned";
  const user = usersById.get(assigneeId);
  if (!user) return "@unknown";
  return formatResolvedHandle(user, false);
}

export function formatReporterLabel(usersById: UserLookup, reporterId: string): string {
  const user = usersById.get(reporterId);
  if (!user) return "@unknown";
  return formatResolvedHandle(user, true);
}

export function formatActorLabel(usersById: UserLookup, actorId: string): string {
  const user = usersById.get(actorId);
  if (!user) return "@unknown";
  return formatResolvedHandle(user, true);
}

export function formatMaybeUserLabel(
  usersById: UserLookup,
  userId: string | null,
  options?: { nullLabel?: string; includeDeletedSuffix?: boolean },
): string {
  const nullLabel = options?.nullLabel ?? "(none)";
  const includeDeletedSuffix = options?.includeDeletedSuffix ?? true;
  if (!userId) return nullLabel;
  const user = usersById.get(userId);
  if (!user) return "@unknown";
  return formatResolvedHandle(user, includeDeletedSuffix);
}