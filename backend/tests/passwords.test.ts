import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/services/passwords.js";

describe("passwords", () => {
  it("hashes are unique per call (random salt)", async () => {
    const h1 = await hashPassword("hunter2");
    const h2 = await hashPassword("hunter2");
    expect(h1).not.toBe(h2);
  });

  it("verify succeeds with the original password", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
  });

  it("verify fails with the wrong password", async () => {
    const h = await hashPassword("right");
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("verify fails on malformed input", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$N=16384,r=8,p=1$bad")).toBe(false);
    expect(await verifyPassword("anything", "argon2$x$y$z")).toBe(false);
  });

  it("stored format is self-describing", async () => {
    const h = await hashPassword("x");
    expect(h.startsWith("scrypt$N=16384,r=8,p=1$")).toBe(true);
  });
});
