# Momentum Architecture and Implementation Plan

Status: active baseline  
Date: 2026-03-02  
Scope: domain baseline, delivery flow, and clean-break cutover policy

---

## 1) Product intent

Momentum is an execution-focused personal system designed to:

- capture intended work immediately
- keep execution organized and visible
- preserve context for why work matters

The core primitives are:

- **Task**: concrete executable action item
- **Initiative**: larger ongoing work stream with task children
- **Driver**: organizational category (`obligation`, `risk`, `leverage`, `surplus`) with one optional subdriver layer
- **Reason**: free-text motivation/context on tasks and initiatives

---

## 2) Canonical relationships

```text
Driver (root) -> Driver (child, optional one layer)
Driver -> Task (many-to-many)
Driver -> Initiative (many-to-many)
Initiative -> Task (one-to-many, optional on task side)
Task -> TaskReason (one-to-many)
Initiative -> InitiativeReason (one-to-many)
```

Non-negotiable constraints:

- Tasks may exist without initiatives.
- Drivers may be linked to many tasks/initiatives.
- Child drivers cannot have children.
- Archived/deleted drivers/initiatives cannot be linked.
- Every mutation emits immutable audit events.

---

## 3) Technical architecture

```text
Human Browser             Future Agent Runtime
      |                            |
      | IdP login                  | Service token (future)
      v                            v
Cloudflare Access
      |
Cloudflare Tunnel (outbound only)
      |
Single VPS (Docker Compose)
  |- web
  |- api
  `- postgres
```

---

## 4) API baseline

### Drivers

- list/get/create/update/archive/hard-delete
- tree endpoint

### Initiatives

- list/get/create/update/archive/hard-delete
- link/unlink drivers
- list/add/update/delete reasons

### Tasks

- list/get/create/update/archive/hard-delete
- optional `initiative_id`
- link/unlink drivers
- checklist + due window + recurrence fields
- list/add/update/delete reasons

### System

- liveness/readiness health
- audit event listing

---

## 5) Delivery workflow

- Work on `dev/*` branches.
- Validate with local typecheck/build/compile checks.
- Open PR and merge to protected `main`.
- Deploy via VPS compose flow.

---

## 6) Clean-break cutover policy

This architecture intentionally uses a clean-break migration from the prior schema.

Required steps:

1. Export backup snapshot if historical retention is desired.
2. Recreate database/volume using the new schema.
3. Start updated stack and verify health endpoints.
4. Seed new driver/initiative/task data manually.

Explicitly not included:

- automatic transform scripts for older primitives
- compatibility routes for deprecated entity names

---

## 7) Post-cutover validation

- Create standalone task (no initiative).
- Create initiative and link task child.
- Create root driver and subdriver.
- Link drivers to tasks and initiatives.
- Create/update/delete task and initiative reasons.
- Confirm audit events for each mutation path.
