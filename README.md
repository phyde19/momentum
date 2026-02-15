# Personal Productivity System

Custom-built tasks/goals/reasons platform using:

- **Backend:** FastAPI + SQLAlchemy + PostgreSQL
- **Human UI:** Vite + React + TypeScript
- **Auth:** local dev bypass now, Cloudflare Access-ready for deployment
- **Infra:** Docker Compose (local and deployment variants)

## What is implemented

- Goals with hierarchy (`path`, `vehicle`, `general`)
- Tasks linked to one or more goals
- Default goal auto-link behavior (`Task Maintenance`)
- Soft delete and separate hard-delete operations
- Reasons on both tasks and goals (create/read/update/delete)
- Immutable audit events for all mutations
- Health endpoints (`/health/live`, `/health/ready`)

## Project layout

- `backend/` - FastAPI service and relational model
- `web/` - human interface
- `infra/` - Docker Compose and backup scripts
- `docs/deployment/` - Cloudflare + env setup guides

## Local-first run (no Cloudflare required)

1. Copy env file:

   ```bash
   cp .env.example .env
   ```

2. Keep these defaults for local testing:

   - `AUTH_MODE=dev`
   - `VITE_API_BASE_URL=http://localhost:8000`

3. Start stack:

   ```bash
   docker compose --env-file .env -f infra/docker-compose.local.yml up --build
   ```

   Or with Make:

   ```bash
   make local-up
   ```

4. Open:

   - Web UI: `http://localhost:5173`
   - API docs: `http://localhost:8000/docs`
   - API health: `http://localhost:8000/health/live`

To stop:

```bash
make local-down
```

## Cloudflare setup (when ready)

Follow:

- `docs/deployment/cloudflare-setup.md`
- `docs/deployment/env-reference.md`
- `docs/deployment/cloudflare-access-policy-template.md`

The app is already wired for:

- `AUTH_MODE=cloudflare`
- Access JWT validation using:
  - `CLOUDFLARE_TEAM_DOMAIN`
  - `CLOUDFLARE_ACCESS_AUDIENCE`
- Cloudflare Tunnel via:
  - `CLOUDFLARE_TUNNEL_TOKEN`

## Backups (Cloudflare R2)

Scripts:

- `infra/backup/backup_to_r2.sh`
- `infra/backup/restore_from_r2.sh`

They expect R2 S3-compatible variables in `.env` and require `aws` CLI on the host.

## Notes

- Default goal (`Task Maintenance`) cannot be deleted.
- Hard-delete endpoints require explicit `confirm=true`.
- Local dev identity is set with `X-Dev-User-Email` header from the web app.
