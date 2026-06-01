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

  it("forces dbPath to :memory: when FJORD_DEMO_MODE=true", () => {
    const cfg = loadConfig({
      FJORD_DEMO_MODE: "true",
      FJORD_DB_PATH: "./data/fjord.db",
    });
    expect(cfg.demo).toBe(true);
    expect(cfg.dbPath).toBe(":memory:");
  });

  it("forces dbPath to :memory: when demo is enabled via CLI override", () => {
    const cfg = loadConfig({ FJORD_DB_PATH: "./data/fjord.db" }, { demo: true });
    expect(cfg.demo).toBe(true);
    expect(cfg.dbPath).toBe(":memory:");
  });

  it("warns when a persistent FJORD_DB_PATH is ignored in demo mode", () => {
    loadConfig({ FJORD_DEMO_MODE: "true", FJORD_DB_PATH: "./data/fjord.db" });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("./data/fjord.db");
  });

  it("does not warn when FJORD_DB_PATH is unset in demo mode", () => {
    loadConfig({ FJORD_DEMO_MODE: "true" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("keeps the configured dbPath when demo mode is off", () => {
    const cfg = loadConfig({ FJORD_DB_PATH: "./data/fjord.db" });
    expect(cfg.demo).toBe(false);
    expect(cfg.dbPath).toBe("./data/fjord.db");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
