# Postgres vs. Code: Where Does Each Thing Actually Live?

This document maps every concept from the data model to its physical home — either a persistent PostgreSQL construct or a purely in-code construct — and explains the patterns used to bridge the two.

---

## Table of Contents

1. [What Lives in Postgres](#what-lives-in-postgres)
2. [What Lives Only in Code](#what-lives-only-in-code)
3. [Bridging Patterns](#bridging-patterns)
4. [Column-by-Column Annotation](#column-by-column-annotation)

---

## What Lives in Postgres

These things have a physical, durable representation in the database. They survive a process restart. They exist independently of any Python process.

### Tables

Eleven tables are created via `Base.metadata.create_all(bind=engine)` at startup:

```
drivers
initiatives
tasks
blocks
task_driver_links
initiative_driver_links
block_driver_links
task_reasons
initiative_reasons
block_reasons
audit_events
```

No Alembic migrations exist. The schema is defined entirely in `backend/app/models.py` and materialized by SQLAlchemy's DDL generation at first boot (when `AUTO_MIGRATE=true`).

### Native PostgreSQL ENUM Types

SQLAlchemy's `Enum(PythonEnum, name="pg_name")` construct creates **native PG enum types** in the database — not `VARCHAR` columns with a `CHECK` constraint. These are first-class PG objects that appear in `pg_type`:

| PG Type Name | Values |
|---|---|
| `initiative_state` | `active`, `paused`, `abandoned`, `completed`, `archived` |
| `driver_type` | `obligation`, `risk`, `leverage`, `surplus` |
| `driver_state` | `active`, `archived` |
| `task_status` | `todo`, `in_progress`, `blocked`, `done`, `archived` |
| `task_priority` | `low`, `medium`, `high`, `critical` |
| `timing_mode` | `none`, `indefinite`, `deadline`, `flexible`, `periodic` |
| `periodic_type` | `weekly`, `monthly`, `yearly`, `interval` |
| `periodic_end_mode` | `never`, `until_date`, `after_count` |
| `actor_type` | `human`, `agent`, `system` |

These are declared globally in `models.py` as module-level SQLAlchemy objects (e.g. `TIMING_MODE_ENUM = Enum(TimingMode, name="timing_mode")`) and reused across table definitions. **Changing a PG enum — adding or removing a value — requires a DDL migration** (`ALTER TYPE ... ADD VALUE`). `create_all` will not alter existing types.

### Foreign Key Constraints

Declared in SQLAlchemy `ForeignKey(...)` calls; materialized as actual PG FK constraints. The `ON DELETE` behavior is enforced by Postgres, not the application:

| FK | On Delete |
|---|---|
| `drivers.parent_driver_id → drivers.id` | `SET NULL` — child drivers become root drivers if parent is hard-deleted |
| `tasks.initiative_id → initiatives.id` | `SET NULL` — tasks survive initiative deletion, become orphaned |
| `task_driver_links.task_id → tasks.id` | `CASCADE` — link row deleted when task is hard-deleted |
| `task_driver_links.driver_id → drivers.id` | `CASCADE` — link row deleted when driver is hard-deleted |
| `initiative_driver_links.initiative_id → initiatives.id` | `CASCADE` |
| `initiative_driver_links.driver_id → drivers.id` | `CASCADE` |
| `blocks.initiative_id → initiatives.id` | `SET NULL` — blocks survive initiative deletion |
| `block_driver_links.block_id → blocks.id` | `CASCADE` |
| `block_driver_links.driver_id → drivers.id` | `CASCADE` |
| `task_reasons.task_id → tasks.id` | `CASCADE` |
| `initiative_reasons.initiative_id → initiatives.id` | `CASCADE` |
| `block_reasons.block_id → blocks.id` | `CASCADE` |

The application never relies on these cascades in normal flow (hard-delete is blocked by application guards before a cascade would fire). The PG cascades are safety nets.

### Composite Primary Keys on Join Tables

`task_driver_links`, `initiative_driver_links`, and `block_driver_links` have composite PKs `(entity_id, driver_id)` — enforced as a PG unique constraint. The application code checks for existing links before inserting, but the PK is the true uniqueness guarantee.

### JSON Columns

These columns are typed `JSON` in Postgres (not `JSONB`). Postgres stores them as text and parses on read; there are no GIN indexes or JSON path queries:

| Column | Table | Shape |
|---|---|---|
| `checklist_json` | `tasks` | `[{title: str, is_done: bool}]` |
| `periodic_spec` | `tasks`, `blocks` | Open — any JSON object |
| `before_json` | `audit_events` | Serialized entity snapshot (dict) |
| `after_json` | `audit_events` | Serialized entity snapshot (dict) |
| `metadata_json` | `audit_events` | Freeform context dict |

### Autoincrement PK on audit_events

`audit_events.id` is a PG `SERIAL` (integer autoincrement). All other PKs are application-generated UUID strings set before insert, so the DB never generates them. The audit table is the only place Postgres controls ID assignment.

### Timezone-Aware Timestamps

All `TIMESTAMPTZ` columns store with timezone. The application always writes UTC (`datetime.now(timezone.utc)`). PG stores these in UTC and returns them with timezone offset.

---

## What Lives Only in Code

These things have no representation in Postgres. They exist as Python objects, runtime validation logic, or computed values that are derived from DB state but never persisted.

### Python Enum Classes (Mirror of PG Enums)

Every PG enum has a corresponding Python `str, enum.Enum` class in `models.py`:

```python
class TimingMode(str, enum.Enum):
    none = "none"
    indefinite = "indefinite"
    deadline = "deadline"
    flexible = "flexible"
    periodic = "periodic"
```

These are **not** the database objects themselves — they are Python-side mirrors. SQLAlchemy reads the string value from PG and instantiates the Python enum member. When writing, SQLAlchemy calls `.value` on the Python enum to produce the string written to PG.

The PG type and the Python class must stay in sync manually. There is no code-generation or drift detection.

### Pydantic Field Constraints

All validation that Pydantic enforces exists only in memory at request time. None of it is reflected in the DB schema:

| Constraint | Where declared | DB equivalent |
|---|---|---|
| `title: str = Field(min_length=1, max_length=255)` | Pydantic | Only `VARCHAR(255)` max; empty string is legal to PG |
| `grace_days: int = Field(ge=1)` | Pydantic | Column is nullable `INTEGER`; PG has no `CHECK` constraint |
| `periodic_end_count: int = Field(ge=1)` | Pydantic | Same — no DB check |
| `driver_ids: list[str] = Field(min_length=1)` on `LinkDriversRequest` | Pydantic | No DB representation at all |

If someone writes directly to PG bypassing the API, none of these constraints apply.

### Business Invariants (`domain.py` and `main.py`)

All of these are pure Python executed before DB writes. They raise HTTP 400s on violation. Nothing in Postgres enforces them:

| Invariant | Where | What it checks |
|---|---|---|
| Driver max depth = 1 | `ensure_driver_parent_is_valid` | Queries `parent.parent_driver_id IS NOT NULL` |
| No driver self-parenting | `ensure_driver_is_not_descendant` | Checks `driver_id == parent_driver_id` |
| No 2-node cycle | `ensure_driver_is_not_descendant` | Checks `parent.parent_driver_id == driver_id` |
| Archived drivers not linkable | `ensure_driver_is_linkable` | Checks `driver.deleted_at IS NOT NULL or state == archived` |
| Archived initiatives not linkable | `ensure_initiative_is_linkable` | Same pattern |
| Timing mode field consistency | `_validate_timing` | Pure logic against the incoming payload + stored state |
| Archive driver guard | `archive_driver` route | Queries active child count + active link count |
| Archive initiative guard | `archive_initiative` route | Queries active task count |
| Hard-delete driver guard | `hard_delete_driver` route | Queries all children + all links |
| Hard-delete initiative guard | `hard_delete_initiative` route | Queries all tasks |
| Hard-delete confirmation | All hard-delete routes | Checks `?confirm=true` query param |

### Denormalized `driver_ids` in Responses

The `driver_ids: list[str]` field that appears on `TaskResponse` and `InitiativeResponse` does not exist as a column. It is computed at response-build time via a separate query:

```python
# domain.py
def get_task_driver_ids(db: Session, task_id: str) -> list[str]:
    return list(db.scalars(
        select(TaskDriverLink.driver_id).where(TaskDriverLink.task_id == task_id)
    ))
```

This query runs inside `_task_response(...)` and `_initiative_response(...)`, which are called for every task/initiative returned from every endpoint — including list endpoints. For a list of 100 tasks, this is 100 additional queries (N+1). There is no eager loading, no join, no caching.

### `DriverTreeNode` Hierarchy (In-Memory Tree Assembly)

The `GET /v1/drivers/tree` endpoint fetches all drivers as a **flat list** from Postgres, then assembles the parent-child tree entirely in Python:

```python
def _driver_tree_nodes(drivers: list[Driver]) -> list[DriverTreeNode]:
    node_by_id: dict[str, DriverTreeNode] = {}
    children_by_parent: dict[str | None, list[DriverTreeNode]] = {}
    for driver in drivers:
        node = DriverTreeNode(...)
        node_by_id[driver.id] = node
        children_by_parent.setdefault(driver.parent_driver_id, []).append(node)
    for driver in drivers:
        node_by_id[driver.id].children = children_by_parent.get(driver.id, [])
    return children_by_parent.get(None, [])  # root nodes only
```

Postgres has no knowledge of this tree structure beyond the `parent_driver_id` FK column. There is no recursive CTE, no `WITH RECURSIVE`, no materialized path. The tree exists only transiently in memory during the request.

### `version` Increment

The `version` integer is stored in Postgres, but the increment logic is purely in Python:

```python
entity.version += 1
```

This is applied in Python before `db.commit()`. There is no Postgres trigger, sequence, or `DEFAULT` expression driving it. If you write directly to PG without incrementing `version`, no error occurs.

### Soft-Delete Filtering

The `deleted_at IS NULL` filter that most list queries apply is not a PG partial index or view — it's a Python `where` clause appended conditionally:

```python
if not include_deleted:
    stmt = stmt.where(Driver.deleted_at.is_(None))
```

Postgres executes this as a normal predicate. There is no row-level security, no view filtering out deleted rows, no partial index (which means full-table scans touch deleted rows too).

### Audit Event Creation

Audit events are inserted by application code within the same transaction as the mutating write — not by Postgres triggers. If a route omits the `create_audit_event(...)` call, no audit row is written and Postgres is unaware anything was missed.

### `updated_at` via `onupdate`

The `updated_at` column has a Python-side `onupdate=utcnow` clause on the SQLAlchemy `mapped_column`. This means SQLAlchemy sets the value in Python before the `UPDATE` statement is issued — it's not a PG trigger or `DEFAULT NOW()`. A direct SQL `UPDATE` bypassing the ORM will not update `updated_at`.

---

## Bridging Patterns

These are the specific programming patterns used to connect the in-memory Python world to the persistent Postgres world.

### 1. SQLAlchemy ORM (`Mapped` + `mapped_column` + `relationship`)

The primary bridge. `models.py` is the single source of truth for both Python type annotations and DDL shape.

```python
class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    status: Mapped[TaskStatus] = mapped_column(TASK_STATUS_ENUM, nullable=False, default=TaskStatus.todo)
    initiative_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("initiatives.id", ondelete="SET NULL"), nullable=True
    )
```

`Mapped[T]` is a Python type annotation that SQLAlchemy introspects to build the ORM machinery. The `mapped_column(...)` call configures the DB-side representation. They are always paired. The Python type (`str | None`) must be consistent with the DB nullability (`nullable=True`/`False`) — SQLAlchemy does not enforce this automatically.

### 2. Pydantic `from_attributes=True` (ORM → Response Schema)

Response models use `ConfigDict(from_attributes=True)` to allow constructing a Pydantic model directly from an ORM object:

```python
class DriverResponse(DriverBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    version: int
    ...
```

This enables `DriverResponse.model_validate(driver_orm_object)` — Pydantic reads attributes from the ORM instance using `getattr` instead of dict lookup. However, for `TaskResponse` and `InitiativeResponse`, the route handlers **do not use this** — they explicitly construct the response object by passing each field manually in `_task_response(...)` and `_initiative_response(...)`. This is necessary because `driver_ids` doesn't exist on the ORM object; it must be fetched separately.

### 3. `model_dump(exclude_unset=True)` for Partial Updates (PATCH Semantics)

Update payloads use all-optional Pydantic models (`TaskUpdate`, `DriverUpdate`, etc.). The route handler extracts only the fields that were actually sent in the request body:

```python
changes = payload.model_dump(exclude_unset=True)
for key, value in changes.items():
    setattr(task, key, value)
```

This distinguishes between:
- Field **absent** from request JSON → not in `changes` → ORM attribute untouched
- Field **explicitly set to `null`** in request JSON → in `changes` with value `None` → ORM attribute set to `None`

Without `exclude_unset=True`, every optional field would default to `None` and every PATCH would overwrite unrelated fields with nulls.

### 4. `db.flush()` Before Audit Event (ID Materialization)

ORM objects are inserted with a Python-generated UUID. But until `flush()` is called, the row hasn't actually been sent to PG and the ORM object may not have all DB-assigned values. The pattern:

```python
db.add(task)
db.flush()   # sends INSERT to PG within the transaction; populates id
create_audit_event(db, ..., entity_id=task.id, after_json=serialize_model(task))
db.commit()  # commits both the task row and the audit event row
```

`flush()` executes the SQL within the current transaction without committing. This ensures `serialize_model(task)` reads the actual persisted state and `task.id` is available for the audit event's `entity_id`.

### 5. `serialize_model` for Audit Snapshots (ORM → Plain Dict)

A custom serializer is used for `before_json`/`after_json` in audit events instead of Pydantic's `model_dump`:

```python
def serialize_model(model: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        if hasattr(value, "value"):        # enum → string
            payload[column.name] = value.value
        elif isinstance(value, datetime):  # datetime → ISO 8601 string
            payload[column.name] = value.isoformat()
        else:
            payload[column.name] = value
    return payload
```

This iterates `model.__table__.columns` — a SQLAlchemy introspection of the actual table columns — and normalizes enum values and datetimes to JSON-serializable primitives. It captures only what's in the DB row (no virtual fields like `driver_ids`). For initiative and task updates that involve link changes, the routes use `_initiative_response(...).model_dump(mode="json")` instead, which does include the denormalized `driver_ids`.

### 6. JSON Column Round-Trip (Pydantic → dict → JSON → Pydantic)

`checklist_json` and `periodic_spec` go through a translation at every boundary:

**On write:**
```python
# Pydantic validates the incoming list[ChecklistItem]
# Before storing, convert to plain dicts (JSON-serializable):
checklist_json=[item.model_dump() for item in payload.checklist_json]
periodic_spec_dict = payload.periodic_spec.model_dump() if payload.periodic_spec else None
```

**On read:**
```python
# SQLAlchemy returns the JSON column as a Python list/dict (psycopg3 deserializes JSON automatically)
# The route builds the response by passing the raw value directly:
checklist_json=task.checklist_json or []
periodic_spec=task.periodic_spec  # raw dict, not a PeriodicSpec instance
```

The `TaskResponse.checklist_json` field is typed `list[ChecklistItem]` and Pydantic will validate the raw dicts from PG into `ChecklistItem` instances when building the response (because `ChecklistItem` accepts dicts in model construction). `periodic_spec` in `TaskResponse` is `PeriodicSpec | None`, and Pydantic similarly coerces the raw dict.

The key pattern: **Pydantic models are used at the API boundary for validation; plain dicts/lists are what actually enter and exit the JSON columns in Postgres**.

### 7. Python Enum ↔ PG Enum via SQLAlchemy Type Object

The module-level type objects (e.g. `TIMING_MODE_ENUM = Enum(TimingMode, name="timing_mode")`) serve two purposes:

1. **DDL creation**: SQLAlchemy uses them to emit `CREATE TYPE timing_mode AS ENUM (...)` during `create_all`
2. **Value translation**: SQLAlchemy uses them during reads/writes to convert between the PG string `"flexible"` and the Python `TimingMode.flexible` enum member

Because `TimingMode` inherits from `str`, `TimingMode.flexible == "flexible"` is `True`. This means enum values can be compared directly to strings in Python without calling `.value`, which reduces conversion boilerplate but means accidental `str` usage in code would not be caught by a type checker.

### 8. In-Memory Deduplication Before DB Operations

Before inserting link rows, the application deduplicates the incoming IDs in Python to avoid hitting the composite PK uniqueness constraint:

```python
def _dedupe_ids(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))  # preserves insertion order, removes duplicates
```

The additive link endpoints (e.g. `POST /tasks/{id}/links/drivers`) also query for existing links before inserting:

```python
if not task_has_driver_link(db, task.id, driver_id):
    db.add(TaskDriverLink(...))
```

This is belt-and-suspenders: the PK would reject duplicates at the DB level, but the application prefers to handle it explicitly rather than rely on a DB exception.

---

## Column-by-Column Annotation

A quick reference marking each column/concept with its physical home.

**Legend:**
- `[PG]` — Physically in Postgres; survives process restart; enforced by the DB engine
- `[PY]` — In Python code only; enforced at runtime by the application; invisible to Postgres

### `drivers`

| Column/Concept | Home | Notes |
|---|---|---|
| `id` (UUID string) | `[PG]` column | Generated in Python (`uuid.uuid4()`) before insert, but stored in PG |
| `title` VARCHAR(255) | `[PG]` column | 255-char max enforced by PG; 1-char min enforced by `[PY]` Pydantic only |
| `description` TEXT | `[PG]` column | |
| `driver_type` | `[PG]` native enum | |
| `state` | `[PG]` native enum | |
| `parent_driver_id` FK | `[PG]` FK + SET NULL | |
| `created_at` / `updated_at` | `[PG]` column | `updated_at` set by `[PY]` ORM `onupdate`; not a PG trigger |
| `deleted_at` | `[PG]` column | Soft-delete timestamp |
| `version` | `[PG]` column | Increment logic is `[PY]` only |
| Max depth = 1 rule | `[PY]` only | No DB constraint; pure application logic |
| No-cycle rule | `[PY]` only | |
| Archive guard (active children/links) | `[PY]` only | |
| `children` (list) | `[PY]` ORM relationship | In-memory; not a column |
| Tree structure | `[PY]` in-memory | Assembled from flat rows at request time |

### `initiatives`

| Column/Concept | Home | Notes |
|---|---|---|
| `id`, `title`, `description`, `state` | `[PG]` | |
| `timing_mode` | `[PG]` native enum | |
| `deadline_at`, `grace_days` | `[PG]` columns | Nullable; field-presence rules enforced by `[PY]` |
| `created_by`, `updated_by` | `[PG]` columns | Values stamped by `[PY]` from auth context |
| `deleted_at`, `version` | `[PG]` columns | Logic in `[PY]` |
| `driver_ids: list[str]` | `[PY]` only | Computed from join table at response time; not a column |
| `indefinite` mode allowed | `[PY]` only | Validated in `_validate_timing`; no DB constraint |
| `periodic` mode forbidden | `[PY]` only | Same |
| Archive guard (active tasks) | `[PY]` only | |

### `tasks`

| Column/Concept | Home | Notes |
|---|---|---|
| `id`, `title`, `description`, `status`, `priority` | `[PG]` | |
| `initiative_id` FK | `[PG]` FK + SET NULL | |
| `timing_mode` | `[PG]` native enum | |
| `deadline_at`, `grace_days` | `[PG]` columns | |
| `periodic_type`, `periodic_end_mode` | `[PG]` native enums | |
| `periodic_spec` | `[PG]` JSON column | Shape is `[PY]` Pydantic `extra="allow"`; PG stores whatever dict arrives |
| `periodic_end_at`, `periodic_end_count` | `[PG]` columns | |
| `checklist_json` | `[PG]` JSON column | Shape `[{title, is_done}]` validated by `[PY]` Pydantic; PG stores raw JSON |
| `scheduled_at` | `[PG]` column | Nullable TIMESTAMPTZ; lightweight scheduling primitive for pinning a task to a time |
| `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`, `version` | `[PG]` columns | Logic `[PY]` |
| `driver_ids: list[str]` | `[PY]` only | Computed at response time |
| `indefinite` mode forbidden | `[PY]` only | |
| Timing field consistency | `[PY]` only | |
| Initiative linkability check | `[PY]` only | |

### `audit_events`

| Column/Concept | Home | Notes |
|---|---|---|
| `id` (autoincrement) | `[PG]` SERIAL | Only PG-generated PK in the system |
| All other columns | `[PG]` | |
| Event creation | `[PY]` only | Application code calls `create_audit_event`; no PG triggers |
| `before_json` / `after_json` shape | `[PY]` only | Produced by `serialize_model` or `model_dump`; PG stores opaque JSON |
