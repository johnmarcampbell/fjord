import { describe, expect, it } from "vitest";
import {
  AVATAR_EMOJI_LIST,
  DEFAULT_ADMINISTRATOR_ID,
  pickAvatar,
  slugify,
  validateAvatar,
  validateHandle,
} from "@agentic-kanban/shared";

describe("DEFAULT_ADMINISTRATOR_ID", () => {
  it("is the documented constant", () => {
    expect(DEFAULT_ADMINISTRATOR_ID).toBe("default-administrator");
  });
});

describe("slugify", () => {
  it("lowercases", () => {
    expect(slugify("HELLO")).toBe("hello");
  });
  it("collapses whitespace to dash", () => {
    expect(slugify("Jane  Wong")).toBe("jane-wong");
  });
  it("returns empty string on all-emoji input", () => {
    expect(slugify("🦄")).toBe("");
  });
  it("truncates to 32 chars", () => {
    expect(slugify("a".repeat(50))).toHaveLength(32);
  });
});

describe("pickAvatar", () => {
  it("is deterministic for a given id", () => {
    expect(pickAvatar("alice")).toBe(pickAvatar("alice"));
  });
  it("returns a value from the curated list", () => {
    expect(AVATAR_EMOJI_LIST).toContain(pickAvatar("alice"));
    expect(AVATAR_EMOJI_LIST).toContain(pickAvatar("xx"));
  });
});

describe("validateHandle", () => {
  it("accepts a simple valid handle", () => {
    const r = validateHandle("jane");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("jane");
  });
  it("lowercases input", () => {
    const r = validateHandle("JANE");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("jane");
  });
  it("returns handle_invalid for spaces", () => {
    const r = validateHandle("has spaces");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("handle_invalid");
  });
  it("returns handle_invalid for empty string", () => {
    const r = validateHandle("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("handle_invalid");
  });
  it("returns handle_reserved for reserved words", () => {
    const r = validateHandle("admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("handle_reserved");
  });
  it("rejects handles longer than 32 chars", () => {
    const r = validateHandle("a".repeat(33));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("handle_invalid");
  });
  it("accepts handles exactly 32 chars", () => {
    const r = validateHandle("a".repeat(32));
    expect(r.ok).toBe(true);
  });
  it("provides a message on failure", () => {
    const r = validateHandle("has spaces");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/handle/i);
  });
});

describe("validateAvatar", () => {
  it("accepts a single emoji", () => {
    const r = validateAvatar("🦊");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("🦊");
  });
  it("rejects multi-emoji strings with avatar_invalid", () => {
    const r = validateAvatar("🦊🦁");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("avatar_invalid");
  });
  it("accepts an https URL", () => {
    const r = validateAvatar("https://example.com/a.png");
    expect(r.ok).toBe(true);
  });
  it("accepts an http URL", () => {
    const r = validateAvatar("http://example.com/a.png");
    expect(r.ok).toBe(true);
  });
  it("rejects URL over 2048 chars", () => {
    const r = validateAvatar("https://x.com/" + "a".repeat(2040));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("avatar_invalid");
  });
  it("rejects plain ASCII (no scheme, no emoji)", () => {
    const r = validateAvatar("abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("avatar_invalid");
  });
  it("rejects empty string", () => {
    const r = validateAvatar("");
    expect(r.ok).toBe(false);
  });
});
