# Momentum Architecture and Implementation Plan

Status: proposed master plan  
Date: 2026-02-16  
Scope: Phase 1 (secure web app), Phase 2 (branch-to-deploy automation), Phase 3 (OpenClaw agent integration)

---

## 1) Product Intent and Domain Language

Momentum is a personal productivity system with three first-class concepts:

- **Task**: a concrete, closable unit of work.
- **Goal**: a larger target state, categorized as:
  - **Path**: a growth pursuit with meaningful gap from current state.
  - **Vehicle**: a maintenance system that protects existing stability and freedom.
  - **General**: uncategorized goal.
- **Reason**: explicit "why this matters" context attached to tasks/goals.

Core invariants:

- Every task must always be linked to at least one goal.
- Default goal (`Task Maintenance`) cannot be deleted/archived.
- Soft-delete/archive by default; hard-delete is explicit and audited.
- Every mutation must emit immutable audit events with actor identity.

---

## 2) Current Baseline (Repository Reality)

What is already implemented:

- FastAPI backend with CRUD routes for tasks, goals, links, reasons, audit events.
- SQLAlchemy models for tasks/goals/reasons/link table/audit events.
- Auth modes:
  - `dev` mode via `X-Dev-User-Email`.
  - `cloudflare` mode validating `Cf-Access-Jwt-Assertion`.
- React web app (tasks/goals list/detail flows + reasons editing).
- Docker Compose local/deploy stacks, including `cloudflared` in deploy stack.
- Existing docs for system design, Cloudflare setup, and deployment workflow.

Gaps to close before full Phase 1-3 target:

- No migration framework yet (uses `Base.metadata.create_all`).
- Deploy web currently runs Vite dev server in production compose.
- Backup scripts currently execute against local compose file.
- No CI/CD GitHub workflows are in repo yet.
- No automated tests in backend or frontend.
- No agent namespace (`/agent/v1/*`) or agent auth/guardrail layer yet.

This plan treats the current code as a strong MVP base and closes these gaps in sequence.

---

## 3) Target End-State Architecture

```text
Human Browser                OpenClaw Agent VPS
     |                              |
     | IdP login                    | Service token + signed request
     v                              v
Cloudflare Access (separate human and agent policies)
     |
Cloudflare Tunnel (outbound only from VPS)
     |
VPS (/opt/momentum, deploy user, Docker Compose)
  |- web (production static app server)
  |- api (FastAPI)
  |- postgres
  `- cloudflared
```

Trust boundaries:

1. **Public edge**: Cloudflare Access + DNS + TLS.
2. **App boundary**: API re-validates Access JWT and internal authorization.
3. **Data boundary**: Postgres isolated on internal Docker network only.
4. **Automation boundary**: GitHub Actions deploy key scoped to `deploy` user.

---

## 4) Phase 1 - Secure Web App Accessible Anywhere

Goal: production-ready human web usage with external IdP auth and VPS deployment under `/opt/momentum` as `deploy`.

### 4.1 Domain and DNS Strategy

Recommended options:

- **Cloudflare Registrar** (best cost, direct integration, no markup renewal model).
- **Porkbun** (good pricing and clean UX).
- **Namecheap** (familiar, fine to use if you prefer continuity).

Practical recommendation:

- Register where comfortable, but keep DNS authoritative in Cloudflare.
- Use hostnames:
  - `momentum.<base-domain>` for web.
  - `momentum-api.<base-domain>` for API.
- Keep existing env var names if desired (`TASKS_WEB_DOMAIN`, `TASKS_API_DOMAIN`) to avoid immediate refactors.

### 4.2 VPS Runtime and User Model

Production host conventions:

- Runtime checkout path: `/opt/momentum`
- Runtime account: `deploy` (non-root)
- Dev workspace remains separate from deploy checkout

Hardening baseline:

- Keep inbound firewall open only for SSH (and optionally restrict SSH source).
- No direct public app ports.
- Cloudflared is the only public ingress path.
- Secrets only in `/opt/momentum/.env` (never in git).

### 4.3 Required Production Runtime Changes

Before "Phase 1 done", implement:

1. **Serve web as production static assets**
   - Replace `npm run dev` in deploy with built assets + static server (Nginx/Caddy or equivalent).
   - Keep Vite dev server only in local compose.
2. **Add healthchecks in deploy compose**
   - `api`: `/health/ready`
   - `web`: static response check
3. **Lock down deploy networking**
   - No published `ports` for app services in deploy compose.
4. **Pin critical image versions**
   - Avoid unbounded `latest` for core infrastructure.

### 4.4 Auth and Authorization (Human)

Identity flow:

- Cloudflare Access authenticates with GitHub or Google.
- API validates JWT audience/team domain and maps claims to actor identity.

Authorization baseline:

- Keep single-user owner model for now.
- Restrict sensitive endpoints (`hard-delete`, full audit export) to owner actor.
- Keep CORS restricted to production web domain only in deploy.

### 4.5 Data Reliability

Replace auto-create tables with migrations:

- Adopt Alembic migration flow.
- Disable schema creation at startup in production.
- Add pre-deploy migration step in deployment script.

Backups:

- Fix backup/restore scripts to target deploy compose in production.
- Nightly encrypted backup to R2.
- Monthly restore drill (non-negotiable).

### 4.6 Phase 1 Acceptance Criteria

- You can log in from any device through Cloudflare Access.
- Web + API are reachable only through tunnel/access, not exposed directly.
- Production uses static frontend serving, not Vite dev runtime.
- DB migration system exists and is used for schema evolution.
- Nightly backups run and at least one restore test is validated.

---

## 5) Phase 2 - GitHub Actions CI/CD (PR -> Main -> VPS)

Goal: efficient, safe loop from feature branch to production without manual SSH deploy steps.

### 5.1 Git Model

- `main` is always deployable production branch.
- All work starts in `dev/<feature-name>`.
- No direct pushes to `main`.
- Merge to `main` triggers deployment automatically.

### 5.2 Required GitHub Repository Controls

Branch protection on `main`:

- Require PR before merge.
- Require at least one approval.
- Require status checks to pass.
- Require branch up-to-date before merge.
- Prevent bypassing protections.

### 5.3 CI Workflow (`ci.yml`) on PRs

Minimum checks:

- Frontend: `npm ci`, `npm run typecheck`, `npm run build`
- Backend: install deps, `ruff check`, `python -m compileall`, tests once present
- Optional: smoke test against local compose services

Additions over time:

- Backend tests with a Postgres service container.
- Frontend component/integration tests.
- Security/dependency scanning.

### 5.4 CD Workflow (`deploy.yml`) on Main

Deployment strategy:

1. GitHub Action SSH into VPS as `deploy`.
2. Update `/opt/momentum` checkout to `origin/main`.
3. Pull/build/restart via deploy compose.
4. Run health checks and fail workflow if not healthy.

Recommended deploy script path:

- `scripts/deploy_production.sh`

Script responsibilities:

- Validate required env vars.
- Optional pre-deploy DB backup.
- Run migrations.
- Bring up compose stack.
- Verify health endpoints.

### 5.5 Secrets and Access

GitHub Action secrets:

- `VPS_HOST`
- `VPS_USER` (`deploy`)
- `VPS_SSH_KEY`
- `VPS_DEPLOY_PATH` (`/opt/momentum`)

Rules:

- Deploy key only grants SSH to deploy user.
- No cloud provider credentials in GitHub Actions unless needed.
- Production app secrets remain only on VPS `.env`.

### 5.6 Rollback Strategy

Preferred rollback:

- Revert bad commit via PR and re-merge to `main`.

Emergency rollback:

- SSH to VPS, reset to last-known-good commit, redeploy, then reconcile `main`.

### 5.7 Phase 2 Acceptance Criteria

- PR checks gate all merges to `main`.
- Merge to `main` triggers fully automated deployment.
- Deployment failures are visible in GitHub Actions.
- Rollback runbook is tested once end-to-end.

---

## 6) Phase 3 - OpenClaw Agent Access via Secure Tool Workflow

Goal: allow your Telegram-driven OpenClaw agents (on separate VPS) to query and mutate Momentum safely.

### 6.1 Agent Integration Architecture

```text
Telegram chat
  -> OpenClaw runtime (separate VPS)
  -> Momentum tool adapter/skills
  -> Cloudflare Access service-token policy (agent path only)
  -> Momentum API /agent/v1/*
  -> Postgres + audit trail
```

### 6.2 Agent Authentication and Defense-in-Depth

Required controls:

1. Cloudflare Access application scoped to `/agent/v1/*`.
2. Service token allowed only for agent policy.
3. API still validates `Cf-Access-Jwt-Assertion`.
4. Require request signing (`X-Momentum-Signature`, timestamp, nonce) using shared secret.
5. Reject replayed/stale signatures.

### 6.3 Agent Authorization Model

Introduce per-agent scopes, example:

- `task.read`
- `task.write`
- `goal.read`
- `goal.write`
- `reason.write`

Keep initial role narrow:

- Start read-only in production.
- Gradually allow writes for trusted agents.

### 6.4 Agent API Surface (`/agent/v1`)

Recommended start:

- Read:
  - `GET /agent/v1/tasks`
  - `GET /agent/v1/goals`
  - `GET /agent/v1/tasks/{id}`
  - `GET /agent/v1/goals/{id}`
- Write:
  - `POST /agent/v1/tasks`
  - `PATCH /agent/v1/tasks/{id}`
  - `POST /agent/v1/tasks/{id}/reasons`
  - `POST /agent/v1/goals/{id}/reasons`

Guardrails on all write endpoints:

- Mandatory `Idempotency-Key`.
- Optional dry-run mode for planning actions.
- Explicit actor context fields in audit metadata (agent id, conversation id, tool name).

### 6.5 Tool/Skill Contract for OpenClaw

Define stable tool contracts:

- `momentum.list_tasks(filters)`
- `momentum.get_task(task_id)`
- `momentum.create_task(payload)`
- `momentum.update_task(task_id, patch)`
- `momentum.add_reason(target_type, target_id, reason_text)`

Behavior rules:

- Destructive operations require explicit user confirmation in chat.
- Tools return structured machine-readable errors for retry logic.
- Every write echoes resulting entity id/version for deterministic follow-up.

### 6.6 Agent Safety and Observability

- Rate limit per agent id.
- Write budget limits per time window.
- Alert on repeated failed writes or auth violations.
- Dedicated audit queries/exports for `actor_type=agent`.

### 6.7 Phase 3 Acceptance Criteria

- Agent can read tasks/goals through `/agent/v1/*`.
- Agent can perform scoped writes with idempotency.
- Every agent action is attributable and traceable in audit events.
- Revoking service token immediately cuts off agent access.

---

## 7) Cross-Phase Implementation Backlog (Ordered)

P0 (immediate):

1. Add this master architecture doc and align team docs around it.
2. Convert deploy web runtime from Vite dev to production static serving.
3. Add healthchecks and deploy-time health validation.
4. Introduce migrations (Alembic) and disable startup auto-create in production.
5. Fix backup scripts to use deploy compose in production context.

P1 (near-term):

6. Add `.github/workflows/ci.yml`.
7. Add `.github/workflows/deploy.yml`.
8. Add `scripts/deploy_production.sh` with migration + health steps.
9. Configure branch protections and required checks.
10. Run first end-to-end PR-to-deploy test.

P2 (agent foundation):

11. Add `/agent/v1` route namespace with separate dependency chain.
12. Add service-token aware actor resolution (`actor_type=agent`).
13. Add write idempotency store/table and middleware.
14. Add request-signature verification for defense in depth.
15. Implement first read-only OpenClaw tools.

P3 (agent writes):

16. Enable scoped write routes for agents.
17. Add confirmation policy for destructive mutations.
18. Add rate limits and anomaly alerts.
19. Run controlled production pilot with one agent.
20. Expand toolset after stability period.

---

## 8) Recommended Delivery Sequence

### Step A - Production Hardening (Phase 1 closeout)

- Finalize domain + Cloudflare setup.
- Ship production web serving and migration flow.
- Validate backup + restore drill.

### Step B - Delivery Automation (Phase 2)

- Add CI workflow.
- Add deploy workflow.
- Enforce branch protection and test merge-triggered deployment.

### Step C - Agent Read-Only Integration (Phase 3A)

- Implement `/agent/v1` read endpoints.
- Integrate service token auth path and audit attribution.
- Validate from OpenClaw VPS.

### Step D - Agent Controlled Writes (Phase 3B)

- Enable write endpoints with idempotency and signatures.
- Roll out confirmation gates and rate limits.

---

## 9) Definition of Done for "Momentum v1 Platform"

Momentum is considered fully established when all are true:

- Human users can securely access web + API from anywhere through Cloudflare Access.
- Production runs under `deploy` user at `/opt/momentum` with no exposed app ports.
- Merge to `main` automatically deploys via GitHub Actions and health checks.
- Schema changes are migration-driven, not runtime auto-create.
- Backups are automated and restorations are tested.
- OpenClaw agents can safely query and mutate scoped data through `/agent/v1`.
- All human and agent writes are fully auditable with traceable actor metadata.

---

## 10) Relationship to Existing Docs

This file is the **master architecture + implementation plan**.

Existing docs remain useful as operational detail:

- `README.md` for high-level orientation.
- `DEPLOYMENT_GUIDE.md` for tactical deployment commands.
- `docs/deployment/*` for Cloudflare and env specifics.
- `docs/ops/plan.md` for branch/deploy workflow context.

If there is any conflict, treat this file as the canonical plan and update the others to match.

