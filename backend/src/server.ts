import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import { eq } from "drizzle-orm";
import type { Config } from "./config.js";
import { openDatabase, runMigrations, type DB, type DBHandle } from "./db/index.js";
import { users } from "./db/schema.js";
import { EventBus } from "./event_bus.js";
import { DemoResetter } from "./demo.js";
import { usersRoutes } from "./routes/users.js";
import { tasksRoutes } from "./routes/tasks.js";
import { projectsRoutes } from "./routes/projects.js";
import { spacesRoutes } from "./routes/spaces.js";
import { streamRoutes } from "./routes/stream.js";
import { nowIso } from "./services/tasks.js";
import { pickAvatar, slugify, resolveHandleCollision, backfillUserProfiles, seedDefaultAdministrator } from "./services/users.js";
import { ACTOR_HEADER, resolveActor, type Actor } from "./auth/actor.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DB;
    events: EventBus;
    demo: boolean;
  }
  interface FastifyRequest {
    actor?: Actor;
  }
}

export interface BuildAppOptions {
  config: Config;
  dbHandle?: DBHandle;
}

export async function buildApp(opts: BuildAppOptions): Promise<{
  app: FastifyInstance;
  dbHandle: DBHandle;
}> {
  const { config } = opts;
  const dbHandle = opts.dbHandle ?? openDatabase(config.dbPath);
  runMigrations(dbHandle);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
          : undefined,
    },
  });

  // Auth middleware — runs before routing on all requests
  if (config.authToken) {
    const token = config.authToken;
    app.addHook("onRequest", async (req, reply) => {
      if (!req.url.startsWith("/api/") || req.url === "/api/auth/validate" || req.url.startsWith("/api/docs")) return;
      if (req.headers.authorization !== `Bearer ${token}`) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    });
  }

  app.decorate("db", dbHandle.db);
  app.decorate("events", new EventBus());
  app.decorate("demo", config.demo);

  seedDefaultAdministrator(dbHandle);

  if (config.demo) {
    const resetter = new DemoResetter(config.demoResetMinutes * 60 * 1000);
    resetter.reset(dbHandle);
    app.addHook("preHandler", async () => {
      if (resetter.shouldReset()) {
        resetter.reset(dbHandle);
        backfillUserProfiles(dbHandle);
        app.events.publish({ type: "demo.reset" });
      }
    });
  } else {
    seedUsers(dbHandle, config.seedUsers);
  }

  backfillUserProfiles(dbHandle);

  // Actor resolution — runs on all API routes except the allow-list
  const ACTOR_SKIP = new Set(["/api/health", "/api/auth/validate", "/api/config"]);
  app.addHook("preHandler", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (!url.startsWith("/api/")) return;
    if (ACTOR_SKIP.has(url) || url.startsWith("/api/docs")) return;
    // GET /api/users and GET /api/users/:id are unauthenticated reads — needed so
    // the UserPicker can bootstrap even when no user is stored in localStorage.
    if (req.method === "GET" && (url === "/api/users" || url.startsWith("/api/users/"))) return;
    const result = await resolveActor(app.db, req.headers[ACTOR_HEADER], app.demo);
    if ("error" in result) {
      return reply.code(result.status).send({ error: result.error });
    }
    req.actor = result.actor;
  });

  if (config.corsOrigins && config.corsOrigins.length > 0) {
    await app.register(fastifyCors, { origin: config.corsOrigins });
  }

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Agentic Kanban API",
        description:
          "REST API for the agentic kanban board. All write endpoints require an X-User-Id header identifying the caller.",
        version: "0.2.1",
      },
      tags: [
        { name: "tasks", description: "Task CRUD and timeline" },
        { name: "projects", description: "Project management" },
        { name: "spaces", description: "Space management (top-level grouping for projects and tasks)" },
        { name: "users", description: "User management" },
        { name: "stream", description: "Server-sent event stream" },
      ],
    },
  });
  await app.register(import("@scalar/fastify-api-reference"), {
    routePrefix: "/api/docs",
  });

  app.get(
    "/api/health",
    {
      schema: {
        summary: "Health check",
        description: "Returns server liveness. Always accessible without authentication.",
        tags: ["health"],
      },
    },
    async () => ({ status: "ok", time: nowIso() }),
  );

  app.get("/api/auth/validate", { schema: { summary: "Validate auth token", description: "Returns whether a token is required and, if Authorization header is provided, whether it is valid. Always accessible without a valid token.", tags: ["auth"] } }, async (req, reply) => {
    if (!config.authToken) {
      return { required: false };
    }
    if (req.headers.authorization === `Bearer ${config.authToken}`) {
      return reply.send({ required: true, valid: true });
    }
    return reply.code(401).send({ required: true, valid: false });
  });

  app.get("/api/config", { schema: { summary: "Server configuration", description: "Returns public server configuration (demo mode settings).", tags: ["config"] } }, async () => ({
    demo: config.demo,
    demo_reset_minutes: config.demo ? config.demoResetMinutes : null,
  }));

  await app.register(usersRoutes);
  await app.register(tasksRoutes);
  await app.register(projectsRoutes);
  await app.register(spacesRoutes);
  await app.register(streamRoutes);

  if (config.staticDir) {
    const dir = resolve(config.staticDir);
    if (existsSync(dir)) {
      await app.register(fastifyStatic, { root: dir, wildcard: false });
      app.setNotFoundHandler(async (req, reply) => {
        if (req.url.startsWith("/api/")) {
          return reply.code(404).send({ error: "Not found" });
        }
        return reply.sendFile("index.html");
      });
    } else {
      app.log.warn({ dir }, "KANBAN_STATIC_DIR set but directory does not exist");
    }
  }

  return { app, dbHandle };
}

function seedUsers(
  handle: DBHandle,
  seeds: Array<{ id: string; kind: "human" | "agent" }>,
): void {
  if (!seeds.length) return;
  const existingRows = handle.db.select().from(users).all();
  const takenLower = new Set(existingRows.map((r) => r.handle?.toLowerCase()).filter((x): x is string => !!x));

  for (const seed of seeds) {
    const existing = handle.db.select().from(users).where(eq(users.id, seed.id)).get();
    if (existing) continue;
    const candidate = slugify(seed.id) || `user-${seed.id.slice(0, 8).toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
    const resolved = resolveHandleCollision(candidate, (h) => takenLower.has(h));
    takenLower.add(resolved);
    handle.db
      .insert(users)
      .values({
        id: seed.id,
        displayName: seed.id,
        handle: resolved,
        kind: seed.kind,
        role: "Admin",
        title: "",
        bio: "",
        avatar: pickAvatar(seed.id),
        tokenHash: null,
        createdAt: nowIso(),
      })
      .run();
  }
}
