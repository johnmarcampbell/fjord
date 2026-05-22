import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifyCookie from "@fastify/cookie";
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
import { authRoutes } from "./routes/auth.js";
import { tokensRoutes } from "./routes/tokens.js";
import { nowIso } from "./services/tasks.js";
import {
  pickAvatar,
  slugify,
  resolveHandleCollision,
  backfillUserProfiles,
  seedDefaultAdministrator,
  DEFAULT_ADMINISTRATOR_ID,
} from "./services/users.js";
import { hashPassword } from "./services/passwords.js";
import { actorRequiresPasswordSet, resolveActor, type Actor } from "./auth/actor.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DB;
    events: EventBus;
    demo: boolean;
    config: Config;
  }
  interface FastifyRequest {
    actor?: Actor;
  }
}

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "agentic-kanban";

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

  await app.register(fastifyCookie);

  app.decorate("db", dbHandle.db);
  app.decorate("events", new EventBus());
  app.decorate("demo", config.demo);
  app.decorate("config", config);

  seedDefaultAdministrator(dbHandle);
  await applyBootstrapPassword(dbHandle, config, app);

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

  // Allow-list: routes that do not require an authenticated actor.
  // /api/auth/login is intentionally listed so unauthenticated callers can sign in.
  const ACTOR_SKIP = new Set(["/api/health", "/api/config", "/api/auth/login"]);

  app.addHook("preHandler", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (!url.startsWith("/api/")) return;
    if (ACTOR_SKIP.has(url) || url.startsWith("/api/docs")) return;

    const result = await resolveActor(app.db, {
      cookies: req.cookies ?? {},
      authorization: req.headers.authorization,
      idleDays: config.sessionIdleDays,
    });
    if ("error" in result) {
      return reply.code(result.status).send({ error: result.error });
    }
    req.actor = result.actor;

    const isWrite =
      req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE";

    // CSRF: cookie-authenticated writes require the X-Requested-With header.
    // Bearer-authenticated callers are exempt — no ambient credential, no CSRF risk.
    if (result.actor.authMethod === "session" && isWrite) {
      const provided = req.headers[CSRF_HEADER];
      const value = Array.isArray(provided) ? provided[0] : provided;
      if (value !== CSRF_VALUE) {
        return reply.code(403).send({ error: "Missing or invalid X-Requested-With header" });
      }
    }

    // Force-change-on-write gate: humans with no password set can read but cannot write.
    // /api/auth/change-password and /api/auth/logout are exempt so they can complete the flow.
    if (isWrite && url !== "/api/auth/change-password" && url !== "/api/auth/logout" && url !== "/api/auth/logout-all") {
      if (actorRequiresPasswordSet(app.db, result.actor, app.demo)) {
        return reply.code(403).send({ error: "set_password_required" });
      }
    }
  });

  if (config.corsOrigins && config.corsOrigins.length > 0) {
    await app.register(fastifyCors, { origin: config.corsOrigins, credentials: true });
  }

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Agentic Kanban API",
        description:
          "REST API for the agentic kanban board. Authenticated endpoints accept either an `ak_session` cookie (humans) or `Authorization: Bearer ak_...` (agents).",
        version: "0.3.0",
      },
      tags: [
        { name: "auth", description: "Authentication: sessions, change password, API tokens" },
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

  app.get(
    "/api/config",
    {
      schema: {
        summary: "Server configuration",
        description: "Returns public server configuration (demo mode settings).",
        tags: ["config"],
      },
    },
    async () => ({
      demo: config.demo,
      demo_reset_minutes: config.demo ? config.demoResetMinutes : null,
    }),
  );

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(tokensRoutes);
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

async function applyBootstrapPassword(
  handle: DBHandle,
  config: Config,
  app: FastifyInstance,
): Promise<void> {
  if (config.demo) return;
  const row = handle.db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, DEFAULT_ADMINISTRATOR_ID))
    .get();
  if (!row) return;
  if (row.passwordHash !== null) return;
  if (config.bootstrapPassword) {
    const hash = await hashPassword(config.bootstrapPassword);
    handle.db
      .update(users)
      .set({ passwordHash: hash })
      .where(eq(users.id, DEFAULT_ADMINISTRATOR_ID))
      .run();
    app.log.info("default-administrator password set from KANBAN_BOOTSTRAP_PASSWORD");
  } else {
    app.log.warn(
      "default-administrator has no password set. The server is accepting unauthenticated logins as administrator. Set KANBAN_BOOTSTRAP_PASSWORD on a fresh install, or log in and set a password through the UI.",
    );
  }
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
        passwordHash: null,
        createdAt: nowIso(),
      })
      .run();
  }
}
