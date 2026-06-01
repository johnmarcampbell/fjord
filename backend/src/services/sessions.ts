import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { sessions } from "../db/schema.js";
import { nowIso } from "./tasks.js";

export const SESSION_COOKIE = "fjord_session";

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export interface CreatedSession {
  id: string;
  expiresAt: string;
  maxAgeSeconds: number;
}

export function createSession(db: DB, userId: string, idleDays: number): CreatedSession {
  const id = newSessionId();
  const now = new Date();
  const expiresAt = addDays(now, idleDays);
  db.insert(sessions)
    .values({
      id,
      userId,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    .run();
  return {
    id,
    expiresAt: expiresAt.toISOString(),
    maxAgeSeconds: idleDays * 24 * 60 * 60,
  };
}

export interface ResolvedSession {
  userId: string;
  expiresAt: string;
  lastSeenAt: string;
  sessionId: string;
}

export function resolveSession(db: DB, sessionId: string): ResolvedSession | null {
  const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }
  return { userId: row.userId, expiresAt: row.expiresAt, lastSeenAt: row.lastSeenAt, sessionId: row.id };
}

const BUMP_INTERVAL_MS = 60 * 1000;

export function bumpLastSeen(db: DB, sessionId: string, idleDays: number, lastSeenAt: string): void {
  const last = new Date(lastSeenAt).getTime();
  if (Number.isFinite(last) && Date.now() - last < BUMP_INTERVAL_MS) return;
  const now = new Date();
  const expiresAt = addDays(now, idleDays).toISOString();
  db.update(sessions)
    .set({ lastSeenAt: now.toISOString(), expiresAt })
    .where(eq(sessions.id, sessionId))
    .run();
}

export function deleteSession(db: DB, sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function deleteSessionsForUser(db: DB, userId: string, exceptSessionId?: string): void {
  if (exceptSessionId) {
    db.delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)))
      .run();
  } else {
    db.delete(sessions).where(eq(sessions.userId, userId)).run();
  }
}

export function nowIsoExport(): string {
  return nowIso();
}
