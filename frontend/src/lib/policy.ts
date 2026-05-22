import type { Space, User } from "@agentic-kanban/shared";

export function isAdmin(user: User): boolean {
  return user.role === "Admin";
}

export function isSpaceOwner(user: User, space: Space): boolean {
  return space.created_by === user.id;
}

export function canManageSpace(user: User, space: Space): boolean {
  return isAdmin(user) || isSpaceOwner(user, space);
}
