import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

async function createTask(
  ctx: Awaited<ReturnType<typeof makeTestApp>>,
  actor: string,
  payload: Record<string, unknown>,
) {
  return (
    await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-user-id": actor },
      payload,
    })
  ).json();
}

async function postComment(
  ctx: Awaited<ReturnType<typeof makeTestApp>>,
  taskId: string,
  actor: string,
  body: string,
) {
  return ctx.inject({
    method: "POST",
    url: `/api/tasks/${taskId}/comments`,
    headers: { "x-user-id": actor },
    payload: { body },
  });
}

async function postJournal(
  ctx: Awaited<ReturnType<typeof makeTestApp>>,
  taskId: string,
  actor: string,
  body: string,
) {
  return ctx.inject({
    method: "POST",
    url: `/api/tasks/${taskId}/journal`,
    headers: { "x-user-id": actor },
    payload: { body },
  });
}

describe("literal \\n normalization in comments and journal entries", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("converts literal \\n in a comment body to a real newline", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const res = await postComment(ctx, t.id, "alice", "a\\nb");
    expect(res.statusCode).toBe(201);
    expect(res.json().body).toBe("a\nb");
  });

  it("converts literal \\n in a journal body to a real newline", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const res = await postJournal(ctx, t.id, "alice", "line1\\nline2");
    expect(res.statusCode).toBe(201);
    expect(res.json().body).toBe("line1\nline2");
  });

  it("converts literal \\r\\n in a comment body to a real newline", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const res = await postComment(ctx, t.id, "alice", "a\\r\\nb");
    expect(res.statusCode).toBe(201);
    expect(res.json().body).toBe("a\nb");
  });

  it("does not touch content inside triple-backtick fences", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const body = "before\\n```\\ncode\\nhere\\n```\\nafter\\n";
    const res = await postComment(ctx, t.id, "alice", body);
    expect(res.statusCode).toBe(201);
    // Outside fences: literal \n -> real \n
    // Inside fences: literal \n is preserved as-is
    const stored = res.json().body as string;
    expect(stored.startsWith("before\n")).toBe(true);
    expect(stored.includes("```\\ncode\\nhere\\n```")).toBe(true);
    expect(stored.endsWith("after\n")).toBe(true);
  });

  it("passes through bodies with real newlines unchanged", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const res = await postComment(ctx, t.id, "alice", "a\nb");
    expect(res.statusCode).toBe(201);
    expect(res.json().body).toBe("a\nb");
  });
});
