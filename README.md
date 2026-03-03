# Momentum — Personal Productivity System

Momentum is a personal task execution system built around four primitives:

- **Tasks**: concrete actions to execute.
- **Initiatives**: broader work streams that can own many task children.
- **Drivers**: top-level organizing categories (`obligation`, `risk`, `leverage`, `surplus`) with one optional subdriver layer.
- **Reasons**: free-text context answering why a task or initiative matters.

The app is optimized for one power user and designed for two clients:

- a responsive browser UI
- structured API access for future automation agents

---

## Why this exists

Typical task tools collapse planning and execution into one flat list. Momentum keeps execution fast while preserving strategic context:

- capture new actions quickly
- optionally link actions to initiatives
- classify work against durable drivers
- retain reasoning context for future review and analysis

---

## Domain model

### Tasks

Action items you can complete, archive, and review.

Core fields:

- `title`, `description`
- `status`: `todo`, `in_progress`, `blocked`, `done`, `archived`
- `priority`: `low`, `medium`, `high`, `critical`
- `initiative_id` (optional)
- schedule window: `due_start_at`, `due_end_at`
- recurrence: `recurrence`, `recurrence_interval`, `recurrence_rule`, `recurrence_until`
- `checklist_json` (simple in-task checklist; not subtasks)

Tasks may link to zero or more drivers.

### Initiatives

Larger work streams with task children.

Core fields:

- `title`, `description`
- `state`: `active`, `paused`, `completed`, `abandoned`, `archived`
- `due_start_at`, `due_end_at`

Initiatives may link to zero or more drivers and can have many linked tasks.

### Drivers

Organizational anchors used by both tasks and initiatives.

Core fields:

- `title`, `description`
- `driver_type`: `obligation`, `risk`, `leverage`, `surplus`
- `state`: `active`, `archived`
- `parent_driver_id` (optional, max one hierarchy layer)

Hierarchy rule:

- root drivers may have children
- child drivers cannot have children

### Reasons

Free-text annotations on tasks and initiatives for motivation/context tracking.

### Invariants

- Task-to-initiative link is optional.
- Tasks and initiatives may each link to multiple drivers.
- Driver hierarchy depth is limited to one child layer.
- Archived/deleted drivers/initiatives cannot be newly linked.
- Soft delete/archive is default behavior.
- Hard delete requires `confirm=true`.
- Every mutation writes an immutable audit event.
- Optimistic concurrency is tracked by `version`.

---

## Clean-break cutover (from older schema)

This refactor is a **clean break**. Legacy schema/data is not migrated.

1. Stop running services.
2. Remove old Postgres data (drop database or recreate volume).
3. Start stack with `AUTO_MIGRATE=true` so current tables are created.
4. Verify `/health/ready`.
5. Create fresh seed data manually (drivers, initiatives, tasks).

Important:

- Old data modeled with previous primitives will not be restored automatically.
- Run one backup before the cutover if you need an offline snapshot.

---

## Architecture

```text
Human Browser                Agent Runtime (future)
     |                              |
     | IdP login                    | Service token (future)
     v                              v
Cloudflare Access
     |
Cloudflare Tunnel (outbound only)
     |
VPS (Docker Compose)
  |- web
  |- api
  `- postgres
```

---

## API surface

All routes are under `/v1`.

### Drivers

- `GET /v1/drivers`
- `GET /v1/drivers/tree`
- `GET /v1/drivers/{id}`
- `POST /v1/drivers`
- `PATCH /v1/drivers/{id}`
- `DELETE /v1/drivers/{id}`
- `DELETE /v1/drivers/{id}/hard-delete?confirm=true`

### Initiatives

- `GET /v1/initiatives`
- `GET /v1/initiatives/{id}`
- `POST /v1/initiatives`
- `PATCH /v1/initiatives/{id}`
- `DELETE /v1/initiatives/{id}`
- `DELETE /v1/initiatives/{id}/hard-delete?confirm=true`
- `POST /v1/initiatives/{id}/links/drivers`
- `DELETE /v1/initiatives/{id}/links/drivers/{driver_id}`
- `GET /v1/initiatives/{id}/reasons`
- `POST /v1/initiatives/{id}/reasons`
- `PATCH /v1/initiatives/reasons/{reason_id}`
- `DELETE /v1/initiatives/reasons/{reason_id}`

### Tasks

- `GET /v1/tasks`
- `GET /v1/tasks/{id}`
- `POST /v1/tasks`
- `PATCH /v1/tasks/{id}`
- `DELETE /v1/tasks/{id}`
- `DELETE /v1/tasks/{id}/hard-delete?confirm=true`
- `POST /v1/tasks/{id}/links/drivers`
- `DELETE /v1/tasks/{id}/links/drivers/{driver_id}`
- `GET /v1/tasks/{id}/reasons`
- `POST /v1/tasks/{id}/reasons`
- `PATCH /v1/tasks/reasons/{reason_id}`
- `DELETE /v1/tasks/reasons/{reason_id}`

### System

- `GET /health/live`
- `GET /health/ready`
- `GET /v1/audit-events`

---

## Local development

```bash
cp .env.example .env
make local-up
```

Then open:

- Web UI: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health/live`

Helpful commands:

```bash
make local-up
make local-down
make local-logs
make local-ps
```

---

## Production deployment

Deployment is single-VPS behind Cloudflare Tunnel + Access.

Setup docs:

- `docs/deployment/cloudflare-setup.md`
- `docs/deployment/env-reference.md`
- `DEPLOYMENT_GUIDE.md`

Backups:

- `infra/backup/backup_to_r2.sh`
- `infra/backup/restore_from_r2.sh`

---

## Project layout

```text
backend/
  app/
    main.py
    models.py
    schemas.py
    domain.py
web/
  src/
    routes/
      tasks.tsx
      task-detail.tsx
      initiatives.tsx
      initiative-detail.tsx
      drivers.tsx
docs/
  system-design.md
```

---

## Key files for contributors

- `backend/app/models.py` — ORM tables and relationships
- `backend/app/schemas.py` — API payload contracts
- `backend/app/domain.py` — invariant helpers and audit utilities
- `backend/app/main.py` — route handlers
- `web/src/lib/types.ts` — frontend type mirror
- `web/src/lib/api.ts` — API client
- `web/src/lib/hooks.ts` — React Query hooks
