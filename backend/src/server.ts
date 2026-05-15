import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { eq } from "drizzle-orm";
import type { Config } from "./config.js";
import { openDatabase, runMigrations, type DB, type DBHandle } from "./db/index.js";
import { users } from "./db/schema.js";
import { EventBus } from "./event_bus.js";
import { usersRoutes } from "./routes/users.js";
import { tasksRoutes } from "./routes/tasks.js";
import { streamRoutes } from "./routes/stream.js";
import { nowIso } from "./services/tasks.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DB;
    events: EventBus;
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
  seedUsers(dbHandle, config.seedUsers);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
          : undefined,
    },
  });

  app.decorate("db", dbHandle.db);
  app.decorate("events", new EventBus());

  if (config.corsOrigins && config.corsOrigins.length > 0) {
    await app.register(fastifyCors, { origin: config.corsOrigins });
  }

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Agentic Kanban API",
        description:
          "REST API for the agentic kanban board. All write endpoints require an X-User-Id header identifying the caller.",
        version: "0.1.0",
      },
      tags: [
        { name: "tasks", description: "Task CRUD and timeline" },
        { name: "users", description: "User management" },
        { name: "stream", description: "Server-sent event stream" },
      ],
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: "/api/docs" });

  app.get("/api/health", { schema: { tags: ["health"] } }, async () => ({
    status: "ok",
    time: nowIso(),
  }));

  await app.register(usersRoutes);
  await app.register(tasksRoutes);
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
  for (const seed of seeds) {
    const existing = handle.db.select().from(users).where(eq(users.id, seed.id)).get();
    if (existing) continue;
    handle.db
      .insert(users)
      .values({
        id: seed.id,
        displayName: seed.id,
        kind: seed.kind,
        createdAt: nowIso(),
      })
      .run();
  }
}
