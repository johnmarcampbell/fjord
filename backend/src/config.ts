import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FJORD_PORT: z.coerce.number().int().positive().default(3000),
  FJORD_HOST: z.string().default("0.0.0.0"),
  FJORD_DB_PATH: z.string().default("./data/fjord.db"),
  FJORD_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  FJORD_CORS_ORIGINS: z.string().optional(),
  FJORD_SEED_USERS: z.string().optional(),
  FJORD_STATIC_DIR: z.string().optional(),
  FJORD_BOOTSTRAP_PASSWORD: z.string().optional(),
  FJORD_SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(30),
  FJORD_EDIT_WINDOW_MINUTES: z.coerce.number().int().nonnegative().default(5),
  FJORD_DEMO_MODE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  FJORD_DEMO_RESET_MINUTES: z.coerce.number().int().positive().default(10),
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
  editWindowMinutes: number;
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
  const demo = overrides.demo ?? parsed.FJORD_DEMO_MODE;
  let dbPath = parsed.FJORD_DB_PATH;
  if (demo) {
    if (env.FJORD_DB_PATH && env.FJORD_DB_PATH !== ":memory:") {
      console.warn(
        `[config] Demo mode is enabled — ignoring FJORD_DB_PATH=${env.FJORD_DB_PATH} and using an in-memory database to protect persistent data.`,
      );
    }
    dbPath = ":memory:";
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.FJORD_PORT,
    host: parsed.FJORD_HOST,
    dbPath,
    logLevel: parsed.FJORD_LOG_LEVEL,
    corsOrigins: parsed.FJORD_CORS_ORIGINS
      ? parsed.FJORD_CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
      : null,
    seedUsers: parsed.FJORD_SEED_USERS
      ? parsed.FJORD_SEED_USERS.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((entry) => {
            const [id, kind] = entry.split(":");
            if (!id || (kind !== "human" && kind !== "agent")) {
              throw new Error(
                `Invalid FJORD_SEED_USERS entry "${entry}". Expected "id:human" or "id:agent".`,
              );
            }
            return { id, kind };
          })
      : [],
    staticDir: parsed.FJORD_STATIC_DIR ?? null,
    bootstrapPassword: parsed.FJORD_BOOTSTRAP_PASSWORD ?? null,
    sessionIdleDays: parsed.FJORD_SESSION_IDLE_DAYS,
    editWindowMinutes: parsed.FJORD_EDIT_WINDOW_MINUTES,
    demo,
    demoResetMinutes: overrides.demoResetMinutes ?? parsed.FJORD_DEMO_RESET_MINUTES,
  };
}
