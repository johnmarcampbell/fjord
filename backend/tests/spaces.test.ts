import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

describe("spaces API", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("lists the default space out of the box", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/spaces" });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.find((s: { id: string }) => s.id === "default")).toBeDefined();
  });

  it("creates, gets, updates, and deletes a space", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/spaces",
      payload: { name: "Personal", description: "side projects" },
    });
    expect(created.statusCode).toBe(201);
    const space = created.json();
    expect(space.name).toBe("Personal");

    const got = await ctx.app.inject({ method: "GET", url: `/api/spaces/${space.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().name).toBe("Personal");

    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/api/spaces/${space.id}`,
      payload: { name: "Renamed" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe("Renamed");
    expect(patched.json().description).toBe("side projects");

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/spaces/${space.id}` });
    expect(del.statusCode).toBe(204);

    const gone = await ctx.app.inject({ method: "GET", url: `/api/spaces/${space.id}` });
    expect(gone.statusCode).toBe(404);
  });

  it("refuses to delete the default space", async () => {
    const res = await ctx.app.inject({ method: "DELETE", url: "/api/spaces/default" });
    expect(res.statusCode).toBe(400);
  });

  it("deleting a space with empty projects cascades them", async () => {
    const space = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "S" },
      })
    ).json();
    const project = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P", space_id: space.id },
      })
    ).json();

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/spaces/${space.id}` });
    expect(del.statusCode).toBe(204);

    // Project should be gone too.
    const projects = (
      await ctx.app.inject({ method: "GET", url: "/api/projects" })
    ).json();
    expect(projects.find((p: { id: string }) => p.id === project.id)).toBeUndefined();
  });

  it("refuses to delete a space that has project-less tasks", async () => {
    const space = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "S" },
      })
    ).json();
    await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-user-id": "alice" },
      payload: { title: "T", space_id: space.id },
    });
    const del = await ctx.app.inject({ method: "DELETE", url: `/api/spaces/${space.id}` });
    expect(del.statusCode).toBe(400);
  });

  it("filters tasks and projects by space_id", async () => {
    const sandbox = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "Sandbox" },
      })
    ).json();
    await ctx.app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Sandbox proj", space_id: sandbox.id },
    });
    await ctx.app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Default proj" },
    });

    const sandboxProjects = await ctx.app.inject({
      method: "GET",
      url: `/api/projects?space_id=${sandbox.id}`,
    });
    expect(sandboxProjects.statusCode).toBe(200);
    const list = sandboxProjects.json();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Sandbox proj");
  });

  it("moves a project between spaces and drags its tasks along", async () => {
    const sandbox = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "Sandbox" },
      })
    ).json();
    const project = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P" },
      })
    ).json();
    expect(project.space_id).toBe("default");

    // Two tasks in the project; one project-less task in default that should NOT move.
    const t1 = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T1", project_id: project.id },
      })
    ).json();
    const t2 = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T2", project_id: project.id },
      })
    ).json();
    const tFree = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "free" },
      })
    ).json();
    expect(t1.space_id).toBe("default");
    expect(t2.space_id).toBe("default");

    const moved = await ctx.app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { space_id: sandbox.id },
      headers: { "x-user-id": "alice" },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().space_id).toBe(sandbox.id);

    const t1After = (await ctx.app.inject({ method: "GET", url: `/api/tasks/${t1.id}` })).json();
    const t2After = (await ctx.app.inject({ method: "GET", url: `/api/tasks/${t2.id}` })).json();
    const tFreeAfter = (
      await ctx.app.inject({ method: "GET", url: `/api/tasks/${tFree.id}` })
    ).json();
    expect(t1After.space_id).toBe(sandbox.id);
    expect(t1After.version).toBe(2);
    expect(t2After.space_id).toBe(sandbox.id);
    expect(tFreeAfter.space_id).toBe("default");

    // Each moved task gets a space_changed event in its timeline.
    const t1Events = (
      await ctx.app.inject({
        method: "GET",
        url: `/api/tasks/${t1.id}/events?kind=space_changed`,
      })
    ).json();
    expect(t1Events).toHaveLength(1);
    expect(t1Events[0].from_value).toBe("default");
    expect(t1Events[0].to_value).toBe(sandbox.id);
  });
});

describe("task ↔ space invariants on create/update", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  async function makeSpace(name: string) {
    return (
      await ctx.app.inject({ method: "POST", url: "/api/spaces", payload: { name } })
    ).json();
  }

  it("creating a task with a project derives the task's space from the project", async () => {
    const sandbox = await makeSpace("Sandbox");
    const project = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P", space_id: sandbox.id },
      })
    ).json();
    const task = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T", project_id: project.id },
      })
    ).json();
    expect(task.space_id).toBe(sandbox.id);
  });

  it("rejects create with mismatched project_id and space_id", async () => {
    const sandbox = await makeSpace("Sandbox");
    const project = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P", space_id: sandbox.id },
      })
    ).json();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-user-id": "alice" },
      payload: { title: "T", project_id: project.id, space_id: "default" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH with new project_id auto-updates space_id", async () => {
    const sandbox = await makeSpace("Sandbox");
    const projDefault = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "PD" },
      })
    ).json();
    const projSandbox = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "PS", space_id: sandbox.id },
      })
    ).json();
    const task = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T", project_id: projDefault.id },
      })
    ).json();
    expect(task.space_id).toBe("default");

    const moved = await ctx.app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: task.version, project_id: projSandbox.id },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().space_id).toBe(sandbox.id);
  });

  it("rejects PATCH that sets space_id on a project-bound task without changing project", async () => {
    const sandbox = await makeSpace("Sandbox");
    const project = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P" },
      })
    ).json();
    const task = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T", project_id: project.id },
      })
    ).json();
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: task.version, space_id: sandbox.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("allows direct space change on a project-less task", async () => {
    const sandbox = await makeSpace("Sandbox");
    const task = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T" },
      })
    ).json();
    expect(task.space_id).toBe("default");

    const moved = await ctx.app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: task.version, space_id: sandbox.id },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().space_id).toBe(sandbox.id);
  });
});

describe("space archive / unarchive", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  async function makeSpace(name: string) {
    return (
      await ctx.app.inject({ method: "POST", url: "/api/spaces", payload: { name } })
    ).json();
  }

  it("archives an empty space and excludes it from the default list", async () => {
    const sp = await makeSpace("Empty");

    const archived = await ctx.app.inject({
      method: "POST",
      url: `/api/spaces/${sp.id}/archive`,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().archived_at).not.toBeNull();

    const list = (await ctx.app.inject({ method: "GET", url: "/api/spaces" })).json();
    expect(list.find((s: { id: string }) => s.id === sp.id)).toBeUndefined();

    const listAll = (
      await ctx.app.inject({ method: "GET", url: "/api/spaces?include_archived=true" })
    ).json();
    expect(listAll.find((s: { id: string }) => s.id === sp.id)).toBeDefined();
  });

  it("archives a space whose tasks are all archived", async () => {
    const sp = await makeSpace("To freeze");
    const task = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T", space_id: sp.id, column: "Done" },
      })
    ).json();
    await ctx.app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/archive`,
      headers: { "x-user-id": "alice" },
    });

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/spaces/${sp.id}/archive`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("refuses to archive a space that has unarchived tasks", async () => {
    const sp = await makeSpace("Still alive");
    await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-user-id": "alice" },
      payload: { title: "T", space_id: sp.id },
    });

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/spaces/${sp.id}/archive`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("unarchives a space", async () => {
    const sp = await makeSpace("Frozen");
    await ctx.app.inject({ method: "POST", url: `/api/spaces/${sp.id}/archive` });
    const res = await ctx.app.inject({ method: "POST", url: `/api/spaces/${sp.id}/unarchive` });
    expect(res.statusCode).toBe(200);
    expect(res.json().archived_at).toBeNull();
  });
});

describe("write guards on archived spaces", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  async function makeArchivedSpace() {
    const sp = (
      await ctx.app.inject({ method: "POST", url: "/api/spaces", payload: { name: "Frozen" } })
    ).json();
    await ctx.app.inject({ method: "POST", url: `/api/spaces/${sp.id}/archive` });
    return sp;
  }

  it("refuses to create a task in an archived space", async () => {
    const sp = await makeArchivedSpace();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { "x-user-id": "alice" },
      payload: { title: "T", space_id: sp.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to create a project in an archived space", async () => {
    const sp = await makeArchivedSpace();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "P", space_id: sp.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to move a project into an archived space", async () => {
    const sp = await makeArchivedSpace();
    const project = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "P" },
      })
    ).json();
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      headers: { "x-user-id": "alice" },
      payload: { space_id: sp.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses to move a project-less task into an archived space via PATCH", async () => {
    const sp = await makeArchivedSpace();
    const task = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "T" },
      })
    ).json();
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: task.version, space_id: sp.id },
    });
    expect(res.statusCode).toBe(400);
  });
});
