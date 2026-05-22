import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { apiTokens } from "../db/schema.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { nowIso } from "./tasks.js";

export const TOKEN_PREFIX = "ak_";
const TOKEN_BODY_LEN = 32;
const TOTAL_TOKEN_LEN = TOKEN_PREFIX.length + TOKEN_BODY_LEN;
const TOKEN_BODY_REGEX = /^[a-z2-7]{32}$/;

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function randomBase32(chars: number): string {
  const bytes = randomBytes(chars);
  let out = "";
  for (let i = 0; i < chars; i++) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildPreview(body: string): string {
  return `${TOKEN_PREFIX}${body.slice(0, 4)}...${body.slice(-4)}`;
}

export interface GeneratedToken {
  plaintext: string;
  lookupHash: string;
  tokenHash: string;
  preview: string;
}

export async function generateToken(): Promise<GeneratedToken> {
  const body = randomBase32(TOKEN_BODY_LEN);
  const plaintext = `${TOKEN_PREFIX}${body}`;
  const lookupHash = sha256Hex(plaintext);
  const tokenHash = await hashPassword(plaintext);
  return { plaintext, lookupHash, tokenHash, preview: buildPreview(body) };
}

export interface IssueTokenInput {
  userId: string;
  name: string;
  expiresAt?: string | null;
}

export interface IssuedToken {
  id: string;
  userId: string;
  name: string;
  plaintext: string;
  preview: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function issueToken(db: DB, input: IssueTokenInput): Promise<IssuedToken> {
  const generated = await generateToken();
  const id = randomUUID();
  const createdAt = nowIso();
  db.insert(apiTokens)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      lookupHash: generated.lookupHash,
      tokenHash: generated.tokenHash,
      preview: generated.preview,
      createdAt,
      lastUsedAt: null,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
    })
    .run();
  return {
    id,
    userId: input.userId,
    name: input.name,
    plaintext: generated.plaintext,
    preview: generated.preview,
    createdAt,
    expiresAt: input.expiresAt ?? null,
  };
}

export function parseBearer(headerValue: string | string[] | undefined): string | null {
  if (!headerValue) return null;
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!value) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(value);
  if (!m) return null;
  return m[1];
}

export function tokenLooksValid(token: string): boolean {
  if (token.length !== TOTAL_TOKEN_LEN) return false;
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  return TOKEN_BODY_REGEX.test(token.slice(TOKEN_PREFIX.length));
}

export interface VerifiedToken {
  userId: string;
  tokenId: string;
  lastUsedAt: string | null;
}

const BUMP_INTERVAL_MS = 60 * 1000;

export async function verifyBearer(db: DB, token: string): Promise<VerifiedToken | null> {
  if (!tokenLooksValid(token)) return null;
  const lookupHash = sha256Hex(token);
  const row = db.select().from(apiTokens).where(eq(apiTokens.lookupHash, lookupHash)).get();
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt !== null) {
    const ms = Date.parse(row.expiresAt);
    // Fail closed: an unparseable expires_at is treated as expired, not as
    // never-expiring. The route layer already rejects bad input on issuance,
    // so this only triggers on data corruption — but we'd rather reject a
    // mystery row than authenticate one.
    if (!Number.isFinite(ms) || ms <= Date.now()) return null;
  }
  const ok = await verifyPassword(token, row.tokenHash);
  if (!ok) return null;
  return { userId: row.userId, tokenId: row.id, lastUsedAt: row.lastUsedAt };
}

export function bumpLastUsed(db: DB, tokenId: string, lastUsedAt: string | null): void {
  if (lastUsedAt) {
    const last = new Date(lastUsedAt).getTime();
    if (Number.isFinite(last) && Date.now() - last < BUMP_INTERVAL_MS) return;
  }
  db.update(apiTokens).set({ lastUsedAt: nowIso() }).where(eq(apiTokens.id, tokenId)).run();
}

export function revokeToken(db: DB, tokenId: string): void {
  db.update(apiTokens).set({ revokedAt: nowIso() }).where(eq(apiTokens.id, tokenId)).run();
}
