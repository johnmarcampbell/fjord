import { describe, expect, it } from "vitest";
import type { Actor } from "../src/auth/actor.js";
import {
  canAccessSpace,
  canDeleteUser,
  canEditUser,
  canGrantAccessForSpace,
  canManageSpace,
  canManageUsers,
} from "../src/auth/policy.js";
import { DEFAULT_ADMINISTRATOR_ID } from "@agentic-kanban/shared";

const admin: Actor = { id: "admin-1", role: "Admin", accessibleSpaceIds: "all", authMethod: "session" };
const member: Actor = { id: "member-1", role: "Member", accessibleSpaceIds: new Set(["s1", "s2"]), authMethod: "session" };
const memberNoGrants: Actor = { id: "member-2", role: "Member", accessibleSpaceIds: new Set(), authMethod: "session" };

const ownedSpace = { created_by: "member-1" };
const otherSpace = { created_by: "someone-else" };

describe("policy.canAccessSpace", () => {
  it("admin can access every space", () => {
    expect(canAccessSpace(admin, "anything")).toBe(true);
  });
  it("member can access spaces in their set", () => {
    expect(canAccessSpace(member, "s1")).toBe(true);
    expect(canAccessSpace(member, "s2")).toBe(true);
  });
  it("member cannot access spaces outside their set", () => {
    expect(canAccessSpace(member, "s3")).toBe(false);
    expect(canAccessSpace(memberNoGrants, "any")).toBe(false);
  });
});

describe("policy.canManageSpace", () => {
  it("admin can manage any space", () => {
    expect(canManageSpace(admin, otherSpace)).toBe(true);
  });
  it("owner can manage their own space", () => {
    expect(canManageSpace(member, ownedSpace)).toBe(true);
  });
  it("non-owner non-admin cannot manage", () => {
    expect(canManageSpace(member, otherSpace)).toBe(false);
  });
});

describe("policy.canGrantAccessForSpace", () => {
  it("mirrors canManageSpace", () => {
    expect(canGrantAccessForSpace(admin, otherSpace)).toBe(true);
    expect(canGrantAccessForSpace(member, ownedSpace)).toBe(true);
    expect(canGrantAccessForSpace(member, otherSpace)).toBe(false);
  });
});

describe("policy.canManageUsers", () => {
  it("admin only", () => {
    expect(canManageUsers(admin)).toBe(true);
    expect(canManageUsers(member)).toBe(false);
  });
});

describe("policy.canEditUser", () => {
  it("admin can edit anyone", () => {
    expect(canEditUser(admin, "any")).toBe(true);
  });
  it("member can edit self", () => {
    expect(canEditUser(member, member.id)).toBe(true);
  });
  it("member cannot edit others", () => {
    expect(canEditUser(member, "other")).toBe(false);
  });
});

describe("policy.canDeleteUser", () => {
  it("never deletes the default administrator", () => {
    expect(canDeleteUser(admin, DEFAULT_ADMINISTRATOR_ID)).toBe(false);
    expect(canDeleteUser(member, DEFAULT_ADMINISTRATOR_ID)).toBe(false);
  });
  it("admin can delete other users", () => {
    expect(canDeleteUser(admin, "someone")).toBe(true);
  });
  it("member can delete self", () => {
    expect(canDeleteUser(member, member.id)).toBe(true);
  });
  it("member cannot delete others", () => {
    expect(canDeleteUser(member, "other")).toBe(false);
  });
});
