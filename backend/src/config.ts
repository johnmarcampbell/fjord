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
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.KANBAN_PORT,
    host: parsed.KANBAN_HOST,
    dbPath: parsed.KANBAN_DB_PATH,
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
    demo: overrides.demo ?? false,
    demoResetMinutes: overrides.demoResetMinutes ?? parsed.KANBAN_DEMO_RESET_MINUTES,
  };
}
