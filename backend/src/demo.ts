import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DBHandle } from "./db/index.js";

export class DemoResetter {
  private lastResetAt = 0;
  private readonly seedSql: string;

  constructor(private readonly intervalMs: number) {
    const here = dirname(fileURLToPath(import.meta.url));
    this.seedSql = readFileSync(join(here, "..", "demo", "seed.sql"), "utf-8");
  }

  shouldReset(): boolean {
    return Date.now() - this.lastResetAt >= this.intervalMs;
  }

  reset(handle: DBHandle): void {
    handle.sqlite.exec(this.seedSql);
    this.lastResetAt = Date.now();
  }
}
