import type { Actor } from "./actor.js";
import { DEFAULT_ADMINISTRATOR_ID } from "@fjord/shared";

export function canAccessSpace(actor: Actor, spaceId: string): boolean {
  if (actor.accessibleSpaceIds === "all") return true;
  return actor.accessibleSpaceIds.has(spaceId);
}

export function canManageSpace(actor: Actor, space: { created_by: string }): boolean {
  if (actor.accessibleSpaceIds === "all") return true;
  return space.created_by === actor.id;
}

export function canGrantAccessForSpace(actor: Actor, space: { created_by: string }): boolean {
  return canManageSpace(actor, space);
}

export function canManageUsers(actor: Actor): boolean {
  return actor.role === "Admin";
}

export function canEditUser(actor: Actor, targetUserId: string): boolean {
  if (actor.role === "Admin") return true;
  return actor.id === targetUserId;
}

export function canDeleteUser(actor: Actor, targetUserId: string): boolean {
  if (targetUserId === DEFAULT_ADMINISTRATOR_ID) return false;
  if (actor.role === "Admin") return true;
  return actor.id === targetUserId;
}
