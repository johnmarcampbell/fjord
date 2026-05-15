import { loadConfig } from "./config.js";
import { buildApp } from "./server.js";

function parseCliArgs(): { demo: boolean; demoResetMinutes?: number } {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const minutesArg = args.find((a) => a.startsWith("--demo-reset-minutes="));
  const demoResetMinutes = minutesArg ? parseInt(minutesArg.split("=")[1], 10) : undefined;
  return { demo, demoResetMinutes };
}

async function main(): Promise<void> {
  const config = loadConfig(process.env, parseCliArgs());
  const { app, dbHandle } = await buildApp({ config });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      dbHandle.close();
    } catch (err) {
      app.log.error({ err }, "error during shutdown");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
