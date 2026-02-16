

Tasks System Plan: Backend + Human UI First

Scope

Build and deploy only:





backend domain + API for tasks/goals/reasons



human web interface (mobile-friendly)



production deployment and authentication

Define now (but implement later):





agent auth and connection model for OpenClaw

Architecture Decisions (Final)





Deploy target: single VPS (Docker Compose) for app + Postgres.



Internet exposure: Cloudflare Tunnel (outbound-only) instead of opening inbound ports.



Human auth: Cloudflare Access + your IdP (Google/GitHub/OIDC), no local password system in app.



App identity model: API validates Cloudflare Access JWT (Cf-Access-Jwt-Assertion) and maps claim email/sub to local actor.



Agent auth (next phase): Cloudflare Access service token + scoped policy for /agent/* routes.

Topology

flowchart LR
  humanUser[HumanUserOnAnyDevice] -->|IdPLogin| cfAccess[CloudflareAccess]
  cfAccess --> webUi[WebUI]
  webUi --> tasksApi[TasksAPI]
  tasksApi --> postgres[(Postgres)]
  openClaw[OpenClawOnVPS] -->|ServiceTokenLater| cfAccess
  cfAccess --> agentRoutes[AgentRoutesFuture]
  agentRoutes --> tasksApi

Domain + Relational Model

Core tables:





goals (id, title, description, goal_type, state, parent_goal_id, timestamps)



tasks (id, title, description, status, priority, due_at, timestamps, created_by, updated_by, version)



task_goal_links (task_id, goal_id, is_primary, linked_at) composite PK



task_reasons (id, task_id, reason_text, author_type, author_id, created_at)



goal_reasons (id, goal_id, reason_text, author_type, author_id, created_at)



audit_events (id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, request_id, created_at)



system_settings (store default goal id and config values)

Non-negotiable constraints:





Every task must have at least one linked goal.



If task create payload omits goals, API auto-links configured default goal.



Goal hierarchy supports parent/child trees.



No hard deletes in MVP; use archived states/soft-delete flags.

Backend Structure (MVP)

Primary files to create:





backend/app/main.py



backend/app/api/



backend/app/domain/



backend/app/auth/cloudflare_access.py



backend/app/db/models.py



backend/app/db/migrations/



backend/tests/

Backend decisions:





Thin-controller, domain-service architecture (rules in domain layer, not handlers).



Explicit transaction boundaries for mutating operations.



Optimistic concurrency via version field on tasks/goals.



Request-scoped request_id propagated to audit_events.

Human Web Interface (MVP)

Primary files to create:





web/src/



web/src/pages/goals.tsx



web/src/pages/tasks.tsx



web/src/pages/task/[id].tsx



web/src/lib/api.ts

UI capabilities:





Goal explorer with hierarchy and path/vehicle/general labels.



Task list with filters (goal, status, priority, due date, archived).



Task create/edit flow with required goal linkage UX.



Reason timeline on task and goal detail views.



Responsive layout for phone and laptop.

Deployment and Ops

Infrastructure files:





infra/docker-compose.yml



infra/cloudflare/tunnel.md



infra/cloudflare/access-policies.md



infra/backup/backup.sh

Deployment plan:





Containers: api, web, postgres, cloudflared.



Postgres on private Docker network only (no public port).



Cloudflare routes:





tasks.yourdomain.com -> web



tasks-api.yourdomain.com -> api



Nightly encrypted backups (pg_dump) to object storage; weekly restore test.



Health endpoints: /health/live, /health/ready.

Authentication Design (Human)





Cloudflare Access policy for human users (email/IdP group allowlist).



App verifies Access JWT on every API request.



App creates/updates local user record from JWT claims on first access.



API enforces authorization roles (owner, trusted_writer, future roles).

Agent Auth + Connection (Defined Now, Implemented Next)





OpenClaw connection endpoint: https://tasks-api.yourdomain.com/agent/v1/*.



Access policy: service token allowed only on /agent/*.



Additional guardrails for next phase:





idempotency key on writes



scoped permissions per tool route



mandatory audit event with actor_type=agent



optional request signature/HMAC for defense in depth

API Surface for Phase 1 (Human)





GET/POST /v1/goals



PATCH /v1/goals/{id}



GET /v1/goals/tree



GET/POST /v1/tasks



GET/PATCH /v1/tasks/{id}



POST /v1/tasks/{id}/links/goals



GET/POST /v1/tasks/{id}/reasons



GET/POST /v1/goals/{id}/reasons



GET /v1/audit-events (owner only)

Delivery Sequence





Bootstrap backend skeleton + migration system + core schema.



Implement domain services and invariants (especially task-goal enforcement).



Implement human API endpoints + tests.



Build web UI pages and mobile-responsive flows.



Stand up Docker Compose + Cloudflare Tunnel/Access.



Add backups, readiness checks, and deployment runbook.

Acceptance Criteria





You can securely log in from any device and manage goals/tasks/reasons.



Task creation cannot result in unlinked tasks.



Every mutation is auditable by actor and request id.



System runs on a VPS with zero publicly open app ports.



Agent auth path and policy are documented and ready for phase 2 enablement.