# Core Data Model

This document is the canonical reference for the Momentum data model — from the PostgreSQL schema through SQLAlchemy ORM models, Pydantic schemas, and the API route layer. The UI is a thin window layer; every screen is ultimately reading from or writing to the state machine described here.

---

## Table of Contents

1. [Conceptual Overview](#conceptual-overview)
2. [Enumerations](#enumerations)
3. [Entity Reference](#entity-reference)
   - [Driver](#driver)
   - [Initiative](#initiative)
   - [Task](#task)
   - [Join Tables](#join-tables)
   - [Reasons](#reasons)
   - [Audit Events](#audit-events)
4. [Relationships & Cardinality](#relationships--cardinality)
5. [Timing Mode System](#timing-mode-system)
6. [Invariants & Guards](#invariants--guards)
7. [Soft Delete & Lifecycle Patterns](#soft-delete--lifecycle-patterns)
8. [API Route Reference](#api-route-reference)
9. [Audit Trail](#audit-trail)
10. [Pydantic Schema Reference](#pydantic-schema-reference)
11. [Known Gaps & Design Notes](#known-gaps--design-notes)

---

## Conceptual Overview

The system models personal productivity through three primary entities that exist in a strict DAG:

```
Driver (root)
  └── Driver (child, max one subdriver layer)
        ├── Initiative (many-to-many via initiative_driver_links)
        │     └── Task (one-to-many via initiative_id FK)
        └── Task (many-to-many via task_driver_links, independent of initiative)
```

**Drivers** answer the question *"why does work exist?"* — they are top-level responsibility categories (obligation, risk, leverage, surplus) that frame decision-making. Both tasks and initiatives are *linked* to drivers through explicit join tables.

**Initiatives** are durable streams of work — projects, goals, or campaigns that can own many tasks and have their own lifecycle.

**Tasks** are atomic units of action. They can exist standalone or belong to an initiative via a foreign key. They are additionally cross-referenced to drivers through the M2M link table.

**Reasons** are free-text annotations attached to tasks or initiatives to capture why something exists or why a decision was made. They are actor-attributed (human, agent, or system).

**Audit events** form an immutable append-only log of every write that ever touches any entity.

---

## Enumerations

All enums are stored as native PostgreSQL `ENUM` types.

### `InitiativeState`
Lifecycle state of an initiative.

| Value | Meaning |
|-------|---------|
| `active` | Currently in progress |
| `paused` | Temporarily suspended |
| `abandoned` | Intentionally stopped without completing |
| `completed` | Successfully finished |
| `archived` | Soft-deleted; hidden from default views |

Transitions are not strictly enforced by the API — any state can be set on `PATCH`. `archived` is set implicitly by the `DELETE /initiatives/{id}` route (the soft-archive endpoint) and cannot be un-archived through the normal flow.

### `DriverType`
Semantic category of a driver.

| Value | Meaning |
|-------|---------|
| `obligation` | External commitment or duty |
| `risk` | Threat to mitigate |
| `leverage` | Opportunity to exploit |
| `surplus` | Discretionary or exploratory work |

### `DriverState`
| Value | Meaning |
|-------|---------|
| `active` | Usable; can be linked |
| `archived` | Soft-deleted; cannot be newly linked |

### `TaskStatus`
Lifecycle status of a task.

| Value | Meaning |
|-------|---------|
| `todo` | Not yet started (default) |
| `in_progress` | Actively being worked |
| `blocked` | Cannot proceed; waiting on something |
| `done` | Completed successfully |
| `archived` | Soft-deleted; hidden from default views |

`archived` is set implicitly by the `DELETE /tasks/{id}` route.

### `TaskPriority`
| Value | Ordering |
|-------|---------|
| `low` | 1 |
| `medium` | 2 (default) |
| `high` | 3 |
| `critical` | 4 |

### `TimingMode`
Controls which timing fields are required/forbidden. Applies to both tasks and initiatives, but with entity-specific restrictions (see [Timing Mode System](#timing-mode-system)).

| Value | Description |
|-------|-------------|
| `none` | No scheduling; default |
| `indefinite` | Open-ended; initiatives only |
| `deadline` | Hard due date |
| `flexible` | Soft due date with a grace window |
| `periodic` | Recurring; tasks only |

### `PeriodicType`
Cadence of a periodic task.

| Value |
|-------|
| `weekly` |
| `monthly` |
| `yearly` |
| `interval` |

### `PeriodicEndMode`
When a periodic task stops recurring.

| Value | Meaning |
|-------|---------|
| `never` | Runs indefinitely |
| `until_date` | Stops on a specific date (`periodic_end_at`) |
| `after_count` | Stops after N completions (`periodic_end_count`) |

### `ActorType`
Who performed an action (used in audit events and reasons).

| Value |
|-------|
| `human` |
| `agent` |
| `system` |

---

## Entity Reference

### Driver

**Table:** `drivers`

Drivers are the top-level organizational primitives. They answer *why* work is being done and provide a two-level taxonomy (parent/child).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `VARCHAR(36)` | No | UUID v4 | PK |
| `title` | `VARCHAR(255)` | No | — | |
| `description` | `TEXT` | Yes | `NULL` | |
| `driver_type` | `driver_type` enum | No | — | |
| `state` | `driver_state` enum | No | `active` | |
| `parent_driver_id` | `VARCHAR(36)` | Yes | `NULL` | FK → `drivers.id` ON DELETE SET NULL |
| `created_at` | `TIMESTAMPTZ` | No | `utcnow()` | |
| `updated_at` | `TIMESTAMPTZ` | No | `utcnow()` | Auto-updated on ORM flush |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Set on soft archive |
| `version` | `INTEGER` | No | `1` | Incremented on every mutating operation |

**ORM relationships:**
- `parent` → `Driver | None` (self-referential, remote side = `id`)
- `children` → `list[Driver]` (self-referential back-populate)
- `task_links` → `list[TaskDriverLink]` (cascade all/delete-orphan)
- `initiative_links` → `list[InitiativeDriverLink]` (cascade all/delete-orphan)

**Hierarchy constraint:** A driver that itself has a parent (`parent_driver_id IS NOT NULL`) cannot be set as a parent of another driver. Maximum depth is two levels: root → child.

---

### Initiative

**Table:** `initiatives`

Initiatives are medium-to-long-term work streams that aggregate tasks and are anchored to strategic drivers.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `VARCHAR(36)` | No | UUID v4 | PK |
| `title` | `VARCHAR(255)` | No | — | |
| `description` | `TEXT` | Yes | `NULL` | |
| `state` | `initiative_state` enum | No | `active` | |
| `timing_mode` | `timing_mode` enum | No | `none` | |
| `deadline_at` | `TIMESTAMPTZ` | Yes | `NULL` | Required for `deadline`/`flexible` modes |
| `grace_days` | `INTEGER` | Yes | `NULL` | Required (≥ 1) for `flexible` mode |
| `created_by` | `VARCHAR(255)` | No | — | Actor ID from auth context |
| `updated_by` | `VARCHAR(255)` | No | — | Actor ID from auth context |
| `created_at` | `TIMESTAMPTZ` | No | `utcnow()` | |
| `updated_at` | `TIMESTAMPTZ` | No | `utcnow()` | |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Set on soft archive |
| `version` | `INTEGER` | No | `1` | |

**ORM relationships:**
- `tasks` → `list[Task]` (back-populates `initiative`)
- `driver_links` → `list[InitiativeDriverLink]` (cascade all/delete-orphan)
- `reasons` → `list[InitiativeReason]` (cascade all/delete-orphan)

**Valid timing modes:** `none`, `indefinite`, `deadline`, `flexible`. `periodic` is forbidden on initiatives.

---

### Task

**Table:** `tasks`

Tasks are atomic, actionable units of work. They are the leaf nodes of the system — everything else exists to organize and contextualize them.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `VARCHAR(36)` | No | UUID v4 | PK |
| `title` | `VARCHAR(255)` | No | — | |
| `description` | `TEXT` | Yes | `NULL` | |
| `status` | `task_status` enum | No | `todo` | |
| `priority` | `task_priority` enum | No | `medium` | |
| `initiative_id` | `VARCHAR(36)` | Yes | `NULL` | FK → `initiatives.id` ON DELETE SET NULL |
| `timing_mode` | `timing_mode` enum | No | `none` | |
| `deadline_at` | `TIMESTAMPTZ` | Yes | `NULL` | Required for `deadline`/`flexible` modes |
| `grace_days` | `INTEGER` | Yes | `NULL` | Required (≥ 1) for `flexible` mode |
| `periodic_type` | `periodic_type` enum | Yes | `NULL` | Required for `periodic` mode |
| `periodic_spec` | `JSON` | Yes | `NULL` | Freeform recurrence spec; required for `periodic` mode |
| `periodic_end_mode` | `periodic_end_mode` enum | Yes | `NULL` | Optional end condition |
| `periodic_end_at` | `TIMESTAMPTZ` | Yes | `NULL` | Used when `periodic_end_mode = until_date` |
| `periodic_end_count` | `INTEGER` | Yes | `NULL` | Used when `periodic_end_mode = after_count` |
| `checklist_json` | `JSON` | No | `[]` | Array of `{title: str, is_done: bool}` |
| `created_by` | `VARCHAR(255)` | No | — | Actor ID |
| `updated_by` | `VARCHAR(255)` | No | — | Actor ID |
| `created_at` | `TIMESTAMPTZ` | No | `utcnow()` | |
| `updated_at` | `TIMESTAMPTZ` | No | `utcnow()` | |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Set on soft archive |
| `version` | `INTEGER` | No | `1` | |

**ORM relationships:**
- `initiative` → `Initiative | None` (many tasks → one initiative)
- `driver_links` → `list[TaskDriverLink]` (cascade all/delete-orphan)
- `reasons` → `list[TaskReason]` (cascade all/delete-orphan)

**Valid timing modes:** `none`, `deadline`, `flexible`, `periodic`. `indefinite` is forbidden on tasks.

**`periodic_spec` shape:** Intentionally open (`extra="allow"` on the Pydantic model). Currently carries whatever recurrence fields the client sends — no server-side schema enforcement beyond requiring the field to be present when `timing_mode = periodic`.

---

### Join Tables

#### `task_driver_links`

Many-to-many between tasks and drivers.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `task_id` | `VARCHAR(36)` | No | PK; FK → `tasks.id` ON DELETE CASCADE |
| `driver_id` | `VARCHAR(36)` | No | PK; FK → `drivers.id` ON DELETE CASCADE |
| `linked_at` | `TIMESTAMPTZ` | No | `utcnow()` at link creation |

Composite PK `(task_id, driver_id)` enforces uniqueness. Addition is idempotent — the API checks for an existing link before inserting.

#### `initiative_driver_links`

Many-to-many between initiatives and drivers.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `initiative_id` | `VARCHAR(36)` | No | PK; FK → `initiatives.id` ON DELETE CASCADE |
| `driver_id` | `VARCHAR(36)` | No | PK; FK → `drivers.id` ON DELETE CASCADE |
| `linked_at` | `TIMESTAMPTZ` | No | `utcnow()` at link creation |

Same composite PK + idempotency semantics as above.

---

### Reasons

Free-text annotations tied to a specific task or initiative. Used to capture rationale, context, or decisions.

#### `task_reasons`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `VARCHAR(36)` | No | PK, UUID v4 |
| `task_id` | `VARCHAR(36)` | No | FK → `tasks.id` ON DELETE CASCADE |
| `reason_text` | `TEXT` | No | |
| `author_type` | `actor_type` enum | No | Who wrote it |
| `author_id` | `VARCHAR(255)` | No | Actor identifier string |
| `created_at` | `TIMESTAMPTZ` | No | |
| `updated_at` | `TIMESTAMPTZ` | No | |
| `deleted_at` | `TIMESTAMPTZ` | Yes | Soft-deleted; `NULL` = active |

#### `initiative_reasons`

Identical structure to `task_reasons`, but with `initiative_id` instead of `task_id`.

---

### Audit Events

**Table:** `audit_events`

Append-only, immutable event log. Every write operation in the system inserts one row in the same database transaction. There are no update or delete routes for this table.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `INTEGER` | No | PK, autoincrement |
| `actor_type` | `actor_type` enum | No | |
| `actor_id` | `VARCHAR(255)` | No | Email or system identifier |
| `action` | `VARCHAR(120)` | No | e.g. `task.create`, `initiative.archive` |
| `entity_type` | `VARCHAR(80)` | No | e.g. `task`, `driver`, `task_reason` |
| `entity_id` | `VARCHAR(36)` | Yes | UUID of the affected entity |
| `request_id` | `VARCHAR(120)` | Yes | Trace ID from the HTTP request |
| `before_json` | `JSON` | Yes | Full serialized state before the change |
| `after_json` | `JSON` | Yes | Full serialized state after the change |
| `metadata_json` | `JSON` | Yes | Extra context (e.g. parent `task_id` for a reason event) |
| `created_at` | `TIMESTAMPTZ` | No | `utcnow()` |

**Action strings used:**

| Entity | Actions |
|--------|---------|
| `driver` | `driver.create`, `driver.update`, `driver.archive`, `driver.hard_delete` |
| `initiative` | `initiative.create`, `initiative.update`, `initiative.archive`, `initiative.hard_delete`, `initiative.link_drivers`, `initiative.unlink_driver` |
| `task` | `task.create`, `task.update`, `task.archive`, `task.hard_delete`, `task.link_drivers`, `task.unlink_driver` |
| `task_reason` | `task_reason.create`, `task_reason.update`, `task_reason.delete` |
| `initiative_reason` | `initiative_reason.create`, `initiative_reason.update`, `initiative_reason.delete` |

---

## Relationships & Cardinality

```
drivers  ──┐
  1         │ (parent_driver_id, optional, max one level deep)
  │         │
  0..N    drivers (children)

drivers  ──< initiative_driver_links >── initiatives
  (M)                                        (M)

drivers  ──< task_driver_links >── tasks
  (M)                                 (M)

initiatives ──────────────────────── tasks
  (1)                                  (0..N)   via initiative_id FK

tasks ──────────── task_reasons
  (1)                  (0..N)

initiatives ──────── initiative_reasons
  (1)                     (0..N)
```

Key observations:
- The **initiative → task** relationship is a direct FK (`initiative_id` on `tasks`), not a join table. This means a task can belong to at most one initiative.
- The **driver → task** and **driver → initiative** relationships are both M2M through explicit join tables. A task or initiative can be linked to zero or many drivers simultaneously.
- If an initiative is deleted (hard), all tasks that reference it have their `initiative_id` set to `NULL` via `ON DELETE SET NULL`. The tasks themselves survive.
- If a driver is deleted (hard), its task/initiative links are `CASCADE` deleted. But hard-delete is blocked if any links exist, so cascades on the link tables function as safety nets, not the primary mechanism.

---

## Timing Mode System

The `timing_mode` field controls which scheduling fields are meaningful. The validation function (`_validate_timing` in `main.py`) is enforced on both create and update, merging incoming changes with existing stored values to produce the final validated state.

### Mode Compatibility Matrix

| Mode | `deadline_at` | `grace_days` | `periodic_type` | `periodic_spec` | Tasks | Initiatives |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| `none` | forbidden | forbidden | forbidden | forbidden | ✓ | ✓ |
| `indefinite` | forbidden | forbidden | forbidden | forbidden | ✗ | ✓ |
| `deadline` | **required** | forbidden | forbidden | forbidden | ✓ | ✓ |
| `flexible` | **required** | **required ≥ 1** | forbidden | forbidden | ✓ | ✓ |
| `periodic` | — | — | **required** | **required** | ✓ | ✗ |

### Field Semantics

- **`deadline_at`**: A point-in-time UTC timestamp marking the hard or target due date.
- **`grace_days`**: For `flexible` mode — the number of days past `deadline_at` where the task/initiative is considered "in grace" rather than overdue. Minimum 1.
- **`periodic_type`**: The cadence class (`weekly`, `monthly`, `yearly`, `interval`).
- **`periodic_spec`**: An open JSON blob that carries cadence detail (e.g. which day of the week, interval length in days, etc.). The server does not validate the shape — this is owned by the client/UI layer.
- **`periodic_end_mode`** / **`periodic_end_at`** / **`periodic_end_count`**: Optional fields that define when periodic recurrence terminates. Not validated at the API level beyond type correctness; their interpretation is a UI concern.

### Update Behavior

On `PATCH`, the timing validation runs against the *merged* state: incoming values override existing ones, but unset fields in the payload inherit from the stored entity. This means you can change just `deadline_at` without re-specifying `timing_mode`, and the validation still passes correctly.

---

## Invariants & Guards

These are enforced synchronously in the route handlers and `domain.py` before any writes commit.

### Driver Hierarchy

1. **Max depth = 1 child layer.** A driver with `parent_driver_id IS NOT NULL` cannot be used as a parent. Checked in `ensure_driver_parent_is_valid`.
2. **No self-parenting.** A driver cannot be set as its own parent. Checked in `ensure_driver_is_not_descendant`.
3. **No cycle.** A driver cannot be assigned as a parent to any driver that is already an ancestor. Because depth is capped at 1, the only possible cycle is the 2-node case (A→B, then trying to set B as parent of A), which is caught explicitly.
4. **Parent must be active.** `ensure_driver_parent_is_valid` calls `ensure_driver_is_linkable` on the parent — archived/deleted drivers cannot be parents.

### Linkability

5. **Archived or deleted drivers cannot be newly linked** to tasks or initiatives (`ensure_driver_is_linkable`). Existing links on an entity that gets archived are preserved — only new link creation is blocked.
6. **Archived or deleted initiatives cannot be newly linked** to tasks (`ensure_initiative_is_linkable`). Checked when setting `initiative_id` on create or update.

### Deletion Guards

7. **Archive a driver:** blocked if it has active (non-deleted) child drivers, or if any active tasks/initiatives are currently linked to it. Must clean up downstream first.
8. **Hard-delete a driver:** blocked if it has *any* children (including deleted) or *any* link rows (regardless of the linked entity's deleted status). Requires explicit `?confirm=true`.
9. **Archive an initiative:** blocked if any active (non-deleted) tasks reference it via `initiative_id`. Tasks must be archived or unlinked first.
10. **Hard-delete an initiative:** blocked if any tasks at all reference it (including archived tasks). Requires explicit `?confirm=true`.

### Version Tracking

Every entity carries a `version: int` field that increments by 1 on every mutating operation (create starts at 1, each subsequent write adds 1). This includes: field updates, driver link/unlink operations, and archive. It is currently tracked but not used as an optimistic concurrency guard (no `If-Match` enforcement) — this is a known gap (see [Known Gaps](#known-gaps--design-notes)).

---

## Soft Delete & Lifecycle Patterns

The system uses a **soft-delete-first** pattern across all primary entities:

| Entity | Soft archive sets | Guard before archive |
|--------|-------------------|-----------------------|
| `Driver` | `state = archived`, `deleted_at = now()` | No active children; no active linked tasks/initiatives |
| `Initiative` | `state = archived`, `deleted_at = now()` | No active linked tasks |
| `Task` | `status = archived`, `deleted_at = now()` | None |
| `TaskReason` / `InitiativeReason` | `deleted_at = now()` | None |

Default list queries filter `deleted_at IS NULL`. Passing `include_deleted=true` surfaces archived records.

Hard-delete is the irreversible path:
- Route: `DELETE /{entity}/{id}/hard-delete?confirm=true`
- Requires `confirm=true` query param
- Additional referential guards (more restrictive than soft-archive guards)
- Cascades in the DB handle cleaning up link rows; reason rows are cascade-deleted at the DB level

**Note:** There is no un-archive route. Once an entity is soft-archived, it can only be resurrected by hard-deleting and recreating, or by directly patching `state`/`status` back to an active value via `PATCH`. The API does not block this — it's a policy choice, not an enforcement.

---

## API Route Reference

All routes under the `/v1` prefix require authentication (Cloudflare JWT in production; `X-Dev-User-Email` header in dev mode).

### Drivers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/drivers` | List drivers. Filters: `include_deleted`, `driver_type`, `state`, `parent_driver_id`. Ordered by `created_at ASC`. |
| `GET` | `/v1/drivers/tree` | Return root nodes with nested children as a tree. |
| `GET` | `/v1/drivers/{driver_id}` | Get single driver by ID. |
| `POST` | `/v1/drivers` | Create a driver. Validates parent depth. |
| `PATCH` | `/v1/drivers/{driver_id}` | Update a driver. Validates cycle-prevention and depth if `parent_driver_id` changes. |
| `DELETE` | `/v1/drivers/{driver_id}` | Soft archive. Sets `state=archived`, `deleted_at`. Blocked if active children or active links exist. |
| `DELETE` | `/v1/drivers/{driver_id}/hard-delete?confirm=true` | Hard delete. Blocked if any children or any links exist at all. |

### Initiatives

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/initiatives` | List initiatives. Filters: `include_deleted`, `state`, `driver_id`, `query` (ilike title+desc), `limit`, `offset`. Ordered by `created_at DESC`. |
| `GET` | `/v1/initiatives/{initiative_id}` | Get single initiative. |
| `POST` | `/v1/initiatives` | Create initiative + link drivers atomically. Validates timing mode. |
| `PATCH` | `/v1/initiatives/{initiative_id}` | Update initiative. If `driver_ids` is present, **replaces** the full driver link set atomically (add missing, remove extra). |
| `DELETE` | `/v1/initiatives/{initiative_id}` | Soft archive. Blocked if active tasks are linked. |
| `DELETE` | `/v1/initiatives/{initiative_id}/hard-delete?confirm=true` | Hard delete. Blocked if any tasks reference it. |
| `POST` | `/v1/initiatives/{initiative_id}/links/drivers` | Add driver links (idempotent per driver). |
| `DELETE` | `/v1/initiatives/{initiative_id}/links/drivers/{driver_id}` | Remove a single driver link. |
| `GET` | `/v1/initiatives/{initiative_id}/reasons` | List reasons. Filter: `include_deleted`. |
| `POST` | `/v1/initiatives/{initiative_id}/reasons` | Add a reason. |
| `PATCH` | `/v1/initiatives/reasons/{reason_id}` | Update reason text. |
| `DELETE` | `/v1/initiatives/reasons/{reason_id}` | Soft-delete reason (sets `deleted_at`). |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/tasks` | List tasks. Filters: `include_deleted`, `initiative_id`, `driver_id`, `status`, `priority`, `query` (ilike title+desc), `limit`, `offset`. Ordered by `created_at DESC`. |
| `GET` | `/v1/tasks/{task_id}` | Get single task. |
| `POST` | `/v1/tasks` | Create task + link drivers atomically. Validates timing mode and initiative linkability. |
| `PATCH` | `/v1/tasks/{task_id}` | Update task. If `driver_ids` is present, **replaces** the full driver link set atomically. Validates initiative linkability if `initiative_id` changes. |
| `DELETE` | `/v1/tasks/{task_id}` | Soft archive. Sets `status=archived`, `deleted_at`. No pre-condition guards. |
| `DELETE` | `/v1/tasks/{task_id}/hard-delete?confirm=true` | Hard delete. No referential guards (cascades handle links and reasons). |
| `POST` | `/v1/tasks/{task_id}/links/drivers` | Add driver links (idempotent per driver). |
| `DELETE` | `/v1/tasks/{task_id}/links/drivers/{driver_id}` | Remove a single driver link. |
| `GET` | `/v1/tasks/{task_id}/reasons` | List reasons. Filter: `include_deleted`. |
| `POST` | `/v1/tasks/{task_id}/reasons` | Add a reason. |
| `PATCH` | `/v1/tasks/reasons/{reason_id}` | Update reason text. |
| `DELETE` | `/v1/tasks/reasons/{reason_id}` | Soft-delete reason. |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health/live` | Liveness check. No DB query. Always returns `ok`. |
| `GET` | `/health/ready` | Readiness check. Executes `SELECT 1`. |
| `GET` | `/v1/audit-events` | List audit events. Filters: `entity_type`, `entity_id`, `limit` (max 500, default 200). Ordered by `created_at DESC`. |
| `GET` | `/` | Service metadata (name, api_prefix, auth_mode, docs_url). |

### Driver Link Semantics: Replace vs. Additive

There are two ways to update driver links on a task or initiative:

| Approach | Endpoint | Behavior |
|----------|----------|----------|
| **Replace** | `PATCH /v1/{entity}/{id}` with `driver_ids` in body | Computes diff; adds new, removes missing. Atomic. |
| **Additive** | `POST /v1/{entity}/{id}/links/drivers` | Adds the specified drivers; leaves existing links untouched. Idempotent. |
| **Remove one** | `DELETE /v1/{entity}/{id}/links/drivers/{driver_id}` | Removes exactly one link. |

The `PATCH` replace-on-presence semantic means: if `driver_ids` is **absent** from the payload, driver links are untouched. If `driver_ids` is **present** (even as an empty list `[]`), it replaces the entire set.

---

## Audit Trail

Every mutating route calls `create_audit_event(...)` within the same database transaction. The pattern is:

1. Load entity, capture `before_json = serialize_model(entity)` (or the full response shape for initiative/task, which includes denormalized `driver_ids`).
2. Apply mutations.
3. Insert `AuditEvent` row with `before_json`, `after_json`, `action`, `entity_type`, `entity_id`, `actor_*`, `request_id`.
4. `db.commit()` — entity + audit event land atomically.

`serialize_model` iterates `model.__table__.columns` and serializes enum values to their `.value` string, datetimes to ISO 8601, and other fields as-is.

**Important:** For initiative and task updates that include driver link changes, the audit event uses the full response shape (including `driver_ids`) for before/after — not just the raw column snapshot.

---

## Pydantic Schema Reference

### Inheritance Chain

```
DriverBase → DriverCreate
           → DriverResponse (from_attributes=True)
DriverUpdate (standalone, all-optional)
DriverTreeNode (standalone, includes recursive children)

InitiativeBase → InitiativeCreate (adds driver_ids: list[str])
               → InitiativeResponse (from_attributes=True, adds driver_ids, actor fields)
InitiativeUpdate (standalone, all-optional, includes driver_ids: list[str] | None)

TaskBase → TaskCreate (adds driver_ids: list[str])
         → TaskResponse (from_attributes=True, adds driver_ids, actor fields)
TaskUpdate (standalone, all-optional, includes driver_ids: list[str] | None)
```

### Key Schema Details

**`DriverUpdate`** — All fields optional. `parent_driver_id` can be set to `None` to detach a child driver from its parent. There is no explicit `null`-clear mechanism at the HTTP level; any field set to `None` in the JSON will clear the column.

**`InitiativeCreate` / `InitiativeUpdate`** — `driver_ids` is the mechanism for setting initiative-driver links. On create it defaults to `[]`. On update, `None` (absent) means "don't touch links"; an explicit list (including `[]`) replaces them.

**`TaskCreate` / `TaskUpdate`** — Same `driver_ids` semantics as initiative. Additionally has `initiative_id: str | None` — setting this links the task to an initiative FK. Setting to `None` detaches it.

**`ChecklistItem`** — `{title: str (1–255), is_done: bool (default false)}`. Stored as a JSON array in `checklist_json`. The entire array is replaced atomically on update (no item-level patch endpoint).

**`PeriodicSpec`** — `model_config = ConfigDict(extra="allow")`. This is an intentionally open schema — it passes through whatever JSON the client sends. Server only validates that the field is present (non-null) when `timing_mode = periodic`.

**`LinkDriversRequest`** — `{driver_ids: list[str]}` with `min_length=1` — must supply at least one driver ID.

**Response schemas** denormalize `driver_ids: list[str]` by querying the join table at response-build time (see `get_task_driver_ids` / `get_initiative_driver_ids` in `domain.py`). The join table is not loaded via ORM relationship eager loading — it's a separate scalar query in `_task_response` and `_initiative_response`.

---

## Known Gaps & Design Notes

These are areas where the current data model is intentionally simplified or has acknowledged limitations — relevant context for feature work.

### No Optimistic Concurrency Enforcement
`version` is tracked but the API does not enforce `If-Match` / `ETag` semantics. Concurrent writes from the same actor (e.g. two open browser tabs) can silently overwrite each other. The version field exists to support this in the future.

### `periodic_spec` Is Unvalidated
The recurrence spec JSON blob has no server-side schema. This means the UI fully owns the interpretation of recurrence rules. When building UI for periodic scheduling, the client must define and consistently serialize this structure.

### No Task → Initiative Link Endpoint
Tasks link to an initiative via the `initiative_id` FK field on the task itself. There is no dedicated `POST /tasks/{id}/links/initiative` endpoint — you must `PATCH` the task with `initiative_id`. This is a UX friction point: the current UI has no flow for linking an *existing* task to an initiative after creation.

### No `PATCH` Un-archive Route
Once a driver, initiative, or task is archived (soft-deleted), there is no dedicated un-archive endpoint. You can technically re-activate by PATCHing `state`/`status` back to an active value, but the UI does not expose this. The archived state is treated as terminal in practice.

### `initiative_id` FK ON DELETE SET NULL
If an initiative is hard-deleted, all tasks that referenced it silently lose their `initiative_id` (set to `NULL`). They are not deleted or notified. This is intentional — tasks outlive initiatives — but is worth tracking for UI consistency.

### Schema Management: `create_all`, No Migrations
There is no Alembic or migration history. The schema is created via `Base.metadata.create_all` at startup (`AUTO_MIGRATE=true`). Adding columns or changing types requires a manual schema intervention. Any future column additions need to be nullable or have DB-level defaults to avoid breaking existing rows on the next deploy.

### Single-user Design
The `created_by`/`updated_by` fields store actor IDs, but there is no user management, permissions system, or multi-tenancy. The system is designed for a single power user with an optional agent actor.
