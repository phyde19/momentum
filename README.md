# Momentum — Personal Productivity System

A custom-built task and goal management platform designed for a single power user.
The system is optimized for two kinds of access: a polished web UI reachable from
any authenticated device (laptop, phone, tablet), and a structured API surface for
personal AI agents (OpenClaw via Telegram, future integrations).

---

## Why this exists

Off-the-shelf task managers don't model the distinction between *tasks* (concrete,
closable work items) and *goals* (longer-term pursuits that may never have a clean
"done" state). They also can't answer the question *"why am I doing this?"* in a
way that's queryable later. This system makes those concepts first-class so you can
track what you're working on, why, and how it connects to where you want to go.

---

## Domain model

There are three core primitives. Understanding these is a prerequisite for working
in this codebase.

### Tasks

Concrete, well-defined work items you intend to close — usually within a day to a
month. Every task must link to at least one goal. If none is specified at creation,
the system auto-links to the **default goal** (`Task Maintenance`).

Fields: `title`, `description`, `status`, `priority`, `due_at`.

| Status        | Meaning                                  |
|---------------|------------------------------------------|
| `todo`        | Not started                              |
| `in_progress` | Actively being worked on                 |
| `blocked`     | Waiting on something external            |
| `done`        | Completed                                |
| `archived`    | Soft-deleted, excluded from default views|

| Priority   |
|------------|
| `low`      |
| `medium`   |
| `high`     |
| `critical` |

### Goals

Larger-scale gaps between the current state of the world and where you want to be.
Goals can be open-ended and intentionally ambiguous ("become a better systems
architect"). They can be paused, abandoned, or completed. Goals support parent/child
hierarchy.

Fields: `title`, `description`, `goal_type`, `state`, `parent_goal_id`.

Goals are categorized into one of three types:

| Type        | Purpose                                                                          |
|-------------|----------------------------------------------------------------------------------|
| **Path**    | Open-ended pursuits — career development, public identity, skill building. Can nest as subpaths. |
| **Vehicle** | Existing systems that need maintenance — job duties, household ops, recurring obligations.       |
| **General** | Uncategorized.                                                                   |

| State        | Meaning                                              |
|--------------|------------------------------------------------------|
| `active`     | Currently being pursued                              |
| `paused`     | Intentionally deferred                               |
| `completed`  | Reached a satisfactory stopping point                |
| `abandoned`  | Dropped in favor of a better goal or changed context |
| `archived`   | Soft-deleted                                         |

### Reasons

Free-text annotations on tasks or goals that answer *"why am I doing this?"*.
Not required, but designed for later NLP clustering to surface motivation patterns.
Each reason records its author (human, agent, or system).

### Invariants

- Every task must be linked to at least one goal at all times.
- The default goal (`Task Maintenance`, type `vehicle`) cannot be deleted or archived.
- No hard deletes in normal operation; everything uses soft-delete/archive states.
- Hard-delete endpoints exist but require explicit `confirm=true`.
- Every mutation is recorded as an immutable audit event with actor identity and request ID.
- Optimistic concurrency via a `version` field on tasks and goals.

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  Human (browser)  │     │  OpenClaw agent   │
│  any device       │     │  on VPS/Telegram  │
└────────┬─────────┘     └────────┬─────────┘
         │  IdP login             │  Service token (phase 2)
         ▼                        ▼
┌──────────────────────────────────────────┐
│           Cloudflare Access              │
│  (JWT validation, identity gate)         │
└──────────────────┬───────────────────────┘
                   │  Cloudflare Tunnel (outbound-only)
                   ▼
     ┌─────────────────────────────┐
     │        VPS (Docker)         │
     │  ┌─────┐  ┌─────┐  ┌────┐  │
     │  │ web │  │ api │  │ pg │  │
     │  │:5173│  │:8000│  │:5432│ │
     │  └─────┘  └─────┘  └────┘  │
     └─────────────────────────────┘
```

**Key decisions:**

- **Single VPS** running Docker Compose — `api`, `web`, `postgres`, `cloudflared`.
- **Zero inbound ports.** Cloudflare Tunnel makes outbound-only connections.
- **Human auth:** Cloudflare Access + GitHub IdP. The API validates the
  `Cf-Access-Jwt-Assertion` header and maps JWT claims to a local actor.
- **Agent auth (phase 2):** Cloudflare Access service token scoped to `/agent/v1/*`
  routes with mandatory `actor_type=agent` audit events.
- **Backups:** Nightly encrypted `pg_dump` to Cloudflare R2 (S3-compatible).

---

## Tech stack

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| Backend    | Python 3.12, FastAPI, SQLAlchemy 2.x, Pydantic v2      |
| Database   | PostgreSQL 16                                           |
| Frontend   | React 19, TypeScript, React Router 7, TanStack Query 5 |
| Styling    | Tailwind CSS 3                                          |
| Icons      | Lucide React                                            |
| Build      | Vite 6                                                  |
| Infra      | Docker Compose, Cloudflare Tunnel + Access              |
| Backups    | `pg_dump` + GPG encryption to Cloudflare R2             |

---

## Project layout

```
├── backend/              # FastAPI service
│   ├── app/
│   │   ├── main.py       # Routes and startup
│   │   ├── models.py     # SQLAlchemy ORM models
│   │   ├── schemas.py    # Pydantic request/response schemas
│   │   ├── domain.py     # Business rules and invariants
│   │   ├── auth.py       # Actor resolution (dev bypass / Cloudflare JWT)
│   │   ├── config.py     # Pydantic settings from env
│   │   └── database.py   # Engine, session, Base
│   ├── Dockerfile
│   └── requirements.txt
│
├── web/                  # React frontend (Momentum UI)
│   ├── src/
│   │   ├── main.tsx      # Router + QueryClient setup
│   │   ├── routes/       # Page components (tasks, goals, detail views)
│   │   ├── components/   # Sidebar, badges, toast, reason editor, etc.
│   │   └── lib/          # API client, react-query hooks, types, utils
│   ├── Dockerfile
│   └── package.json
│
├── infra/                # Deployment
│   ├── docker-compose.local.yml    # Local dev (ports exposed)
│   ├── docker-compose.deploy.yml   # Production (Cloudflare Tunnel)
│   └── backup/                     # R2 backup + restore scripts
│
├── docs/                 # Design and deployment documentation
│   ├── system-design.md
│   └── deployment/       # Cloudflare setup, env reference, policy templates
│
├── Makefile              # Shortcuts for docker compose commands
└── .env.example          # All environment variables with comments
```

---

## API surface

All endpoints are prefixed with `/v1`. Auth is required on every route (dev mode
uses the `X-Dev-User-Email` header; production validates Cloudflare Access JWTs).

### Goals

| Method   | Path                               | Purpose                    |
|----------|------------------------------------|----------------------------|
| `GET`    | `/v1/goals`                        | List goals (filter by type, state) |
| `POST`   | `/v1/goals`                        | Create a goal              |
| `GET`    | `/v1/goals/{id}`                   | Get single goal            |
| `PATCH`  | `/v1/goals/{id}`                   | Update goal fields         |
| `DELETE` | `/v1/goals/{id}`                   | Archive goal (soft delete) |
| `DELETE` | `/v1/goals/{id}/hard-delete`       | Permanent delete (requires `confirm=true`) |
| `GET`    | `/v1/goals/tree`                   | Goals as nested tree       |
| `GET`    | `/v1/goals/{id}/reasons`           | List goal reasons          |
| `POST`   | `/v1/goals/{id}/reasons`           | Add a reason               |
| `PATCH`  | `/v1/goals/reasons/{reason_id}`    | Update a reason            |
| `DELETE` | `/v1/goals/reasons/{reason_id}`    | Soft-delete a reason       |

### Tasks

| Method   | Path                                      | Purpose                    |
|----------|-------------------------------------------|----------------------------|
| `GET`    | `/v1/tasks`                               | List tasks (filter by status, priority, goal, search) |
| `POST`   | `/v1/tasks`                               | Create a task              |
| `GET`    | `/v1/tasks/{id}`                          | Get single task            |
| `PATCH`  | `/v1/tasks/{id}`                          | Update task fields         |
| `DELETE` | `/v1/tasks/{id}`                          | Archive task (soft delete) |
| `DELETE` | `/v1/tasks/{id}/hard-delete`              | Permanent delete (requires `confirm=true`) |
| `POST`   | `/v1/tasks/{id}/links/goals`              | Link goal(s) to task       |
| `DELETE` | `/v1/tasks/{id}/links/goals/{goal_id}`    | Unlink a goal from task    |
| `GET`    | `/v1/tasks/{id}/reasons`                  | List task reasons          |
| `POST`   | `/v1/tasks/{id}/reasons`                  | Add a reason               |
| `PATCH`  | `/v1/tasks/reasons/{reason_id}`           | Update a reason            |
| `DELETE` | `/v1/tasks/reasons/{reason_id}`           | Soft-delete a reason       |

### System

| Method | Path              | Purpose                    |
|--------|-------------------|----------------------------|
| `GET`  | `/health/live`    | Liveness check             |
| `GET`  | `/health/ready`   | Readiness check (DB ping)  |
| `GET`  | `/v1/audit-events`| Query audit log            |

Interactive API docs are available at `/docs` (Swagger UI) when the backend is running.

---

## Local development

### Prerequisites

- Docker and Docker Compose
- (Optional) Node 20+ and Python 3.12+ for IDE type-checking outside containers

### Quick start

```bash
# 1. Clone and configure
cp .env.example .env
# Review defaults — they work out of the box for local dev

# 2. Start everything
make local-up

# 3. Open
#    Web UI:   http://localhost:5173
#    API docs: http://localhost:8000/docs
#    Health:   http://localhost:8000/health/live
```

### Useful commands

```bash
make local-up       # Start all services (detached, rebuild)
make local-down     # Stop and remove containers
make local-logs     # Tail all service logs
make local-ps       # Show service status
```

### How auth works locally

With `AUTH_MODE=dev` (the default), the API skips Cloudflare JWT validation and
identifies every request by the `X-Dev-User-Email` header. The web app sends this
header automatically using the `VITE_DEV_USER_EMAIL` env var.

### Frontend dev

The web container runs `vite --host` with the source directory bind-mounted, so
file saves trigger hot module replacement instantly. If you need to install new
npm packages, either shell into the container or run locally:

```bash
cd web && npm install <package>
```

Then restart the web container to pick up the new dependency:

```bash
docker compose --env-file .env -f infra/docker-compose.local.yml restart web
```

---

## Production deployment

Deployment runs on a single VPS behind Cloudflare Tunnel. No inbound ports are
opened on the server.

### Setup steps

1. **Cloudflare prerequisites** — follow `docs/deployment/cloudflare-setup.md`:
   - Add your domain to Cloudflare
   - Configure GitHub as an Identity Provider in Zero Trust
   - Create a Tunnel and copy the token
   - Add hostname routes (`tasks.<domain>` -> web, `tasks-api.<domain>` -> api)
   - Create Access applications with your email allowlisted

2. **Configure `.env`** — see `docs/deployment/env-reference.md`:
   ```env
   AUTH_MODE=cloudflare
   CLOUDFLARE_TEAM_DOMAIN=<team>.cloudflareaccess.com
   CLOUDFLARE_ACCESS_AUDIENCE=<audience-tag>
   CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>
   ```

3. **Deploy:**
   ```bash
   make deploy-up
   ```

4. **Verify:**
   - Visit `https://tasks.<domain>` — GitHub login should be required
   - Confirm API calls work through Access
   - Check `https://tasks-api.<domain>/health/live`

### Backups

Nightly encrypted `pg_dump` to Cloudflare R2:

```bash
infra/backup/backup_to_r2.sh     # Manual backup
infra/backup/restore_from_r2.sh   # Restore from latest
```

Requires R2 credentials in `.env` — see `docs/deployment/env-reference.md`.

---

## Agent access (phase 2 — designed, not yet implemented)

The OpenClaw agent running on the VPS will access the API through a dedicated
namespace (`/agent/v1/*`) authenticated via Cloudflare Access service tokens.

**What's already in place:**

- Actor model supports `human`, `agent`, and `system` types
- Audit events record `actor_type` on every mutation
- Cloudflare Access policy templates are documented in `docs/deployment/`
- Service token env placeholders exist in `.env.example`

**What needs to be built:**

- `/agent/v1/*` route namespace in the backend
- Service token validation middleware
- Idempotency keys on agent writes
- Scoped permissions per tool route
- Optional request signature/HMAC for defense in depth

See `docs/deployment/cloudflare-access-policy-template.md` for the planned
Access policy that isolates agent traffic from human traffic.

---

## Design principles

- **Local-first.** The full stack runs on `localhost` with `AUTH_MODE=dev` and zero
  external dependencies beyond Docker.
- **Single source of truth.** Tasks, goals, and their relationships live in Postgres.
  The API is the only writer. The UI and future agents are read/write clients.
- **Auditability.** Every mutation creates an immutable `audit_event` with before/after
  snapshots, actor identity, and request ID.
- **Soft delete by default.** Archive states and `deleted_at` timestamps. Hard delete
  is available but gated behind explicit confirmation.
- **Goal-linked work.** No orphan tasks. Every task connects to at least one goal,
  making it possible to ask "what am I doing and why?" at any time.

---

## Key files for new contributors

If you're an AI agent or human developer getting oriented, start here:

| File | What you'll learn |
|------|-------------------|
| `backend/app/models.py` | All database tables and relationships |
| `backend/app/schemas.py` | Every request/response shape the API accepts |
| `backend/app/domain.py` | Business rules and invariants |
| `backend/app/main.py` | Complete API route map |
| `backend/app/auth.py` | How identity works (dev mode vs Cloudflare) |
| `web/src/lib/types.ts` | TypeScript mirrors of backend schemas |
| `web/src/lib/api.ts` | Frontend API client |
| `web/src/lib/hooks.ts` | React Query hooks for all endpoints |
| `docs/system-design.md` | Original architecture decisions and constraints |
