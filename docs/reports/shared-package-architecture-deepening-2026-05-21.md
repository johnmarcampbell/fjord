# Shared Package Architecture Deepening Report

Date: 2026-05-21
Validated against main: ae5bda5 (PR #85)

## Scope

This report focuses on deepening opportunities in the shared package, primarily [shared/src/index.ts](../../shared/src/index.ts), and adjacent seams in backend and frontend modules that currently duplicate or leak domain behavior.

## Inputs Reviewed

- Domain language: [CONTEXT.md](../../CONTEXT.md)
- Architecture vocabulary: improve-codebase-architecture language guide
- Relevant ADRs:
  - [docs/adr/0004-soft-delete-users.md](../adr/0004-soft-delete-users.md)
  - [docs/adr/0005-role-column-on-users.md](../adr/0005-role-column-on-users.md)
  - [docs/adr/0006-default-administrator-user.md](../adr/0006-default-administrator-user.md)
  - [docs/adr/0007-open-space-creation-and-space-owner.md](../adr/0007-open-space-creation-and-space-owner.md)
  - [docs/adr/0008-password-authentication.md](../adr/0008-password-authentication.md)
  - [docs/adr/0009-password-hash-format.md](../adr/0009-password-hash-format.md)
  - [docs/adr/0010-api-token-format-and-storage.md](../adr/0010-api-token-format-and-storage.md)

## Current State Summary

The shared package is a broad type-and-constants Module with a mostly flat Interface:

- Domain data shapes (User, Task, Space, Project, Task event)
- Request and update data shapes
- Authentication and token data shapes (`LoginRequest`, `AuthMe`, `ChangePasswordRequest`, token request/response shapes)
- Domain constants and regex values
- Stream event shape
- One behavior helper: blocked-state predicate

This gives good compile-time consistency, but several domain invariants still live outside shared. That lowers depth and weakens seams for both maintainers and callers.

## Friction Observed

1. User identity rules are duplicated across backend and frontend implementations.
2. Authorization decisions for Role and Space access are split between backend and frontend Modules.
3. Domain error semantics are implicit and spread across many files.
4. Task lifecycle rules are partially shared and partially hidden in backend implementation code.
5. Stream event handling has low leverage because event meaning is not rich enough for precise caller behavior.
6. Session and bearer transport rules (including CSRF and force-set-password write gating) are represented by implementation code across backend and frontend, not by one shared Interface.

## Deepening Opportunities

1. User Identity Rules Module

Files:
- [shared/src/index.ts](../../shared/src/index.ts)
- [backend/src/services/users.ts](../../backend/src/services/users.ts)
- [backend/src/routes/users.ts](../../backend/src/routes/users.ts)
- [frontend/src/components/UserFormDialog.tsx](../../frontend/src/components/UserFormDialog.tsx)

Problem:
The Interface for Handle and Avatar invariants is shallow and duplicated. Changes to invariants require edits in multiple Modules, reducing locality.

Solution:
Create a shared User identity rules Module that owns normalization and validation behavior for Handle and Avatar, plus deterministic avatar selection.

Benefits:
- Locality: identity rule changes happen in one place.
- Leverage: backend and frontend call one Interface.
- Testing: interface-level tests can verify invariants without duplicating test logic.

2. Authorization Decision Module for Role and Space access

Files:
- [shared/src/index.ts](../../shared/src/index.ts)
- [backend/src/auth/actor.ts](../../backend/src/auth/actor.ts)
- [backend/src/auth/policy.ts](../../backend/src/auth/policy.ts)
- [frontend/src/lib/policy.ts](../../frontend/src/lib/policy.ts)

Problem:
The project shares Role values but not a shared authorization decision Interface. Similar policy logic is implemented in separate Modules, which weakens the seam.

Solution:
Introduce a shared authorization decision Module that encodes decisions in domain language (Admin, Member, Space Owner, Space access) while each side supplies an adapter for local facts.

Benefits:
- Locality: policy changes are centralized.
- Leverage: one Interface is reused by backend and frontend.
- Testing: policy behavior can be tested through the shared Interface with side-specific adapter tests.

3. Authentication Transport Contract Module

Files:
- [shared/src/index.ts](../../shared/src/index.ts)
- [backend/src/auth/actor.ts](../../backend/src/auth/actor.ts)
- [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts)
- [backend/src/routes/tokens.ts](../../backend/src/routes/tokens.ts)
- [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
- [frontend/src/components/AuthGate.tsx](../../frontend/src/components/AuthGate.tsx)

Problem:
Issue #80 added password authentication and API tokens, but the caller-facing Interface for transport semantics remains shallow. Session cookie behavior, CSRF requirements, bearer behavior, and force-set-password semantics are encoded across modules instead of one shared contract.

Solution:
Add a shared authentication transport contract Module that expresses request/response and error semantics for session login, bearer auth, CSRF write requirements, and set-password-required gating.

Benefits:
- Locality: transport and auth edge-case semantics live in one place.
- Leverage: backend and frontend can rely on one contract for authentication flows.
- Testing: auth transport behavior becomes interface-testable rather than route-by-route only.

4. Domain Error Catalog Module

Files:
- [shared/src/index.ts](../../shared/src/index.ts)
- [backend/src/services/tasks.ts](../../backend/src/services/tasks.ts)
- [backend/src/routes/tasks.ts](../../backend/src/routes/tasks.ts)
- [backend/src/routes/users.ts](../../backend/src/routes/users.ts)
- [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts)
- [frontend/src/components/UserFormDialog.tsx](../../frontend/src/components/UserFormDialog.tsx)

Problem:
Failure modes are represented by many local error classes and string messages. Caller handling is therefore shallow and message-dependent.

Solution:
Define a shared domain error catalog Module with stable kinds and payload shapes for Task, User, Space, Blocker, and authentication/token workflows.

Benefits:
- Locality: error semantics are maintained once.
- Leverage: callers branch on stable kinds instead of string text.
- Testing: error contracts become explicit and straightforward to verify.

5. Task Lifecycle Rules Module

Files:
- [shared/src/index.ts](../../shared/src/index.ts)
- [backend/src/services/tasks.ts](../../backend/src/services/tasks.ts)
- [backend/src/routes/tasks.ts](../../backend/src/routes/tasks.ts)
- [frontend/src/components/Board.tsx](../../frontend/src/components/Board.tsx)
- [frontend/src/components/BacklogView.tsx](../../frontend/src/components/BacklogView.tsx)

Problem:
Task lifecycle invariants are split between shared helpers and backend implementation logic, so callers do not get a complete Interface for Task state behavior.

Solution:
Create a shared Task lifecycle rules Module that owns domain predicates and validation decisions for blocked state, archive eligibility, and key state transitions.

Benefits:
- Locality: Task rule changes are concentrated.
- Leverage: one Interface supports both backend enforcement and frontend affordances.
- Testing: lifecycle rules can be verified once at the shared seam.

6. Event Semantics Module Connecting Task event and Stream event meaning

Files:
- [shared/src/index.ts](../../shared/src/index.ts)
- [backend/src/event_bus.ts](../../backend/src/event_bus.ts)
- [backend/src/services/tasks.ts](../../backend/src/services/tasks.ts)
- [frontend/src/lib/stream.ts](../../frontend/src/lib/stream.ts)

Problem:
Task event taxonomy and stream event reactions are only loosely connected. This keeps the stream Interface shallow for callers and forces broad invalidation behavior.

Solution:
Add a shared event semantics Module that defines how stream events map to Task event meaning and expected caller reactions.

Benefits:
- Locality: event-to-reaction logic is centralized.
- Leverage: callers can react more precisely through one Interface.
- Testing: stream reaction behavior can be tested using shared semantics.

## Deletion Test Summary

For each opportunity above, deleting the proposed Module would cause the same complexity to reappear across multiple callers. That indicates these are likely deep Modules rather than pass-through extractions.

## ADR Alignment

No candidate above directly contradicts ADR-0004 through ADR-0010. The opportunities preserve those decisions and focus on improving seam quality and depth.

## Recommended Starting Point

Start with Opportunity 3 (authentication transport contract) or Opportunity 1 (User identity rules). Issue #80 expanded auth complexity, so those two give the highest immediate leverage and locality improvements with controlled migration risk.

## Decision Request

Which opportunity should be explored first in a grilling loop?