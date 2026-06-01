import { DEFAULT_SPACE_ID } from "@fjord/shared";

const KEY = "fjord.active_space_id";

export function getStoredSpaceId(): string {
  return localStorage.getItem(KEY) ?? DEFAULT_SPACE_ID;
}

export function setStoredSpaceId(id: string): void {
  localStorage.setItem(KEY, id);
}
