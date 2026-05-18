import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig demo mode", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("forces dbPath to :memory: when KANBAN_DEMO_MODE=true", () => {
    const cfg = loadConfig({
      KANBAN_DEMO_MODE: "true",
      KANBAN_DB_PATH: "./data/kanban.db",
    });
    expect(cfg.demo).toBe(true);
    expect(cfg.dbPath).toBe(":memory:");
  });

  it("forces dbPath to :memory: when demo is enabled via CLI override", () => {
    const cfg = loadConfig({ KANBAN_DB_PATH: "./data/kanban.db" }, { demo: true });
    expect(cfg.demo).toBe(true);
    expect(cfg.dbPath).toBe(":memory:");
  });

  it("warns when a persistent KANBAN_DB_PATH is ignored in demo mode", () => {
    loadConfig({ KANBAN_DEMO_MODE: "true", KANBAN_DB_PATH: "./data/kanban.db" });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("./data/kanban.db");
  });

  it("does not warn when KANBAN_DB_PATH is unset in demo mode", () => {
    loadConfig({ KANBAN_DEMO_MODE: "true" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("keeps the configured dbPath when demo mode is off", () => {
    const cfg = loadConfig({ KANBAN_DB_PATH: "./data/kanban.db" });
    expect(cfg.demo).toBe(false);
    expect(cfg.dbPath).toBe("./data/kanban.db");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
