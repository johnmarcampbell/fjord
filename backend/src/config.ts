import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  KANBAN_PORT: z.coerce.number().int().positive().default(3000),
  KANBAN_HOST: z.string().default("0.0.0.0"),
  KANBAN_DB_PATH: z.string().default("./data/kanban.db"),
  KANBAN_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  KANBAN_CORS_ORIGINS: z.string().optional(),
  KANBAN_SEED_USERS: z.string().optional(),
  KANBAN_STATIC_DIR: z.string().optional(),
  KANBAN_BOOTSTRAP_PASSWORD: z.string().optional(),
  KANBAN_SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(30),
  KANBAN_DEMO_MODE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  KANBAN_DEMO_RESET_MINUTES: z.coerce.number().int().positive().default(10),
});

export type Config = {
  nodeEnv: "development" | "production" | "test";
  port: number;
  host: string;
  dbPath: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  corsOrigins: string[] | null;
  seedUsers: Array<{ id: string; kind: "human" | "agent" }>;
  staticDir: string | null;
  bootstrapPassword: string | null;
  sessionIdleDays: number;
  demo: boolean;
  demoResetMinutes: number;
};

export interface LoadConfigOverrides {
  demo?: boolean;
  demoResetMinutes?: number;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: LoadConfigOverrides = {},
): Config {
  const parsed = EnvSchema.parse(env);
  const demo = overrides.demo ?? parsed.KANBAN_DEMO_MODE;
  let dbPath = parsed.KANBAN_DB_PATH;
  if (demo) {
    if (env.KANBAN_DB_PATH && env.KANBAN_DB_PATH !== ":memory:") {
      console.warn(
        `[config] Demo mode is enabled — ignoring KANBAN_DB_PATH=${env.KANBAN_DB_PATH} and using an in-memory database to protect persistent data.`,
      );
    }
    dbPath = ":memory:";
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.KANBAN_PORT,
    host: parsed.KANBAN_HOST,
    dbPath,
    logLevel: parsed.KANBAN_LOG_LEVEL,
    corsOrigins: parsed.KANBAN_CORS_ORIGINS
      ? parsed.KANBAN_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
      : null,
    seedUsers: parsed.KANBAN_SEED_USERS
      ? parsed.KANBAN_SEED_USERS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((entry) => {
            const [id, kind] = entry.split(":");
            if (!id || (kind !== "human" && kind !== "agent")) {
              throw new Error(
                `Invalid KANBAN_SEED_USERS entry "${entry}". Expected "id:human" or "id:agent".`,
              );
            }
            return { id, kind };
          })
      : [],
    staticDir: parsed.KANBAN_STATIC_DIR ?? null,
    bootstrapPassword: parsed.KANBAN_BOOTSTRAP_PASSWORD ?? null,
    sessionIdleDays: parsed.KANBAN_SESSION_IDLE_DAYS,
    demo,
    demoResetMinutes: overrides.demoResetMinutes ?? parsed.KANBAN_DEMO_RESET_MINUTES,
  };
}
