# Operations Plan — Dev to Deploy

## Overview

This document defines the workflow from local development to production for the
Momentum system. The goals are:

1. **No direct pushes to `main`.** All changes go through pull requests with
   manual approval. This is a hard rule because AI agents (Cursor, OpenClaw)
   will author code and run git operations — the PR gate is the human checkpoint.
2. **Automated validation on every PR.** Type checking, linting, and build
   verification run before a human even looks at the diff.
3. **Automated deploy on merge.** When a PR lands on `main`, the production
   VPS updates itself without manual SSH.
4. **Simple enough to maintain solo.** No Kubernetes, no multi-environment
   staging clusters, no deploy queues. One branch, one VPS, one command.

---

## Git strategy

### Branching model

```
main (protected, always deployable)
  └── dev/your-branch-name
        └── PR → main (requires approval)
```

- **`main`** is production. Every commit on `main` triggers a deploy.
  Branch protection rules enforce that all changes arrive via PR.
- **Feature branches** use the prefix `dev/` by convention — e.g.
  `dev/add-task-search`, `dev/fix-goal-archive`. No strict naming beyond the
  prefix; the PR title is what matters.
- **No long-lived branches.** Branches live for a single PR, then get deleted
  after merge.

### Branch protection rules (GitHub)

Configure on the `main` branch:

- [x] Require pull request before merging
- [x] Require 1 approval (you approve your own PRs — the point is preventing
      accidental direct push, especially from AI tooling)
- [x] Require status checks to pass (CI workflow)
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings
- [ ] Do NOT require signed commits (adds friction for no security gain here)

### Commit conventions

No formal commit message spec enforced, but the following intent:

- First line is a short imperative summary: `add task search filtering`
- Body (when useful) explains *why*, not *what*
- AI-authored commits should be identifiable from context (PR description
  mentions the tool, commit author is you either way)

---

## CI — Pull Request Validation

A GitHub Actions workflow runs on every PR targeting `main`. It gates merge.

### What it checks

| Check | Why |
|-------|-----|
| **Frontend typecheck** (`tsc --noEmit`) | Catch type errors before they reach production |
| **Frontend build** (`vite build`) | Verify the production bundle compiles |
| **Backend syntax** (`python -m compileall`) | Catch Python syntax errors |
| **Backend lint** (`ruff check`) | Catch obvious bugs and style issues |

### What it doesn't check (yet)

- No test suite (no tests exist yet — add this as the codebase matures)
- No E2E tests (future: Playwright against the local compose stack)
- No database migration validation (migrations are auto-applied on startup)

### Workflow file

Located at `.github/workflows/ci.yml`. Runs on `ubuntu-latest`. Installs
Node 20 and Python 3.12. Total runtime target: under 2 minutes.

---

## CD — Deploy on Merge

When a PR merges into `main`, a second GitHub Actions workflow deploys to the
production VPS via SSH.

### Why SSH from Actions (not polling, not webhooks)

| Alternative | Why not |
|-------------|---------|
| VPS polls `main` on a cron | Delay between merge and deploy. No deploy status visibility. Silent failures. |
| Webhook listener on VPS | Requires exposing an endpoint. Adds a service to maintain. Counter to the zero-inbound-port design. |
| Self-hosted runner on VPS | Overkill for one repo. Runner maintenance overhead. |
| **SSH from Actions** | Immediate. Deploy status visible in GitHub UI. Battle-tested. One secret (SSH key). |

### Deploy sequence

The deploy job SSHs into the VPS and runs:

```bash
cd /opt/momentum
git fetch origin main
git reset --hard origin/main
make deploy-up
```

`make deploy-up` runs:

```bash
docker compose --env-file .env -f infra/docker-compose.deploy.yml up -d --build
```

This rebuilds the `api` and `web` images from the updated source, restarts the
containers, and leaves `postgres` and `cloudflared` running (they use external
images and only restart if their config changes).

### Downtime

Container restart causes a few seconds of downtime. Acceptable for a single-user
system. If this becomes a problem later, we can add zero-downtime deploys with
Docker Compose `--wait` and health checks.

### Required GitHub secrets

| Secret | Value |
|--------|-------|
| `VPS_HOST` | IP address or hostname of the VPS |
| `VPS_USER` | SSH user on VPS (e.g. `deploy`) |
| `VPS_SSH_KEY` | Private key for `VPS_USER` (Ed25519 recommended) |
| `VPS_DEPLOY_PATH` | Absolute path to the repo on VPS (e.g. `/opt/momentum`) |

### Workflow file

Located at `.github/workflows/deploy.yml`. Runs on `ubuntu-latest`.
Uses `appleboy/ssh-action` for the SSH step.

---

## VPS — One-Time Setup

Run these steps once when provisioning the production server.

### 1. Create a deploy user

```bash
adduser --disabled-password deploy
usermod -aG docker deploy
```

### 2. Generate and install SSH key

On your local machine:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/momentum_deploy -C "momentum-deploy"
```

Copy the public key to the VPS:

```bash
ssh-copy-id -i ~/.ssh/momentum_deploy.pub deploy@<vps-ip>
```

Add the private key contents to GitHub as the `VPS_SSH_KEY` secret.

### 3. Clone the repo

```bash
sudo mkdir -p /opt/momentum
sudo chown deploy:deploy /opt/momentum
su - deploy
git clone https://github.com/<you>/momentum.git /opt/momentum
cd /opt/momentum
```

### 4. Create production `.env`

```bash
cp .env.example .env
# Edit with production values:
#   AUTH_MODE=cloudflare
#   Real database password
#   Cloudflare Tunnel token
#   Cloudflare Access audience
#   R2 backup credentials
#   Production domain names
```

### 5. Initial deploy

```bash
make deploy-up
```

### 6. Set up automated backups

```bash
# As root or deploy user:
crontab -e

# Add nightly backup at 03:00 UTC:
0 3 * * * cd /opt/momentum && ./infra/backup/backup_to_r2.sh >> /var/log/momentum-backup.log 2>&1
```

---

## Environment management

| Environment | `.env` source | Auth mode | Compose file |
|-------------|---------------|-----------|--------------|
| **Local dev** | Committed `.env.example` copied to `.env` | `dev` (header-based) | `docker-compose.local.yml` |
| **Production** | Manually created on VPS, never committed | `cloudflare` (JWT) | `docker-compose.deploy.yml` |

**Rules:**

- `.env` is gitignored. Always.
- `.env.example` is committed with placeholder values and comments.
- Production secrets live only on the VPS filesystem. They are not in GitHub
  secrets (only the SSH key is). This keeps the blast radius small.
- When a new env var is added, update `.env.example` in the same PR.

---

## Rollback

The deploy is a `git reset --hard origin/main` followed by a rebuild. To roll
back a bad deploy:

### Option A: Revert commit (preferred)

```bash
git revert <bad-commit-sha>
# Push to a branch, open PR, merge — triggers automatic redeploy
```

This preserves history and goes through the normal PR flow.

### Option B: Emergency manual rollback

SSH into the VPS directly:

```bash
ssh deploy@<vps-ip>
cd /opt/momentum
git log --oneline -5          # Find the last good commit
git reset --hard <good-sha>
make deploy-up
```

Then create a revert PR on GitHub to bring `main` back in sync with what's
deployed.

### Database rollback

There is no automated database rollback. Migrations are auto-applied on API
startup (`AUTO_MIGRATE=true`). If a migration is destructive:

1. Restore from the most recent R2 backup before deploying
2. Fix the migration
3. Deploy the fix

This is acceptable because the system has a single writer (you) and backups
run nightly. For destructive migrations, run a manual backup immediately
before merging the PR.

---

## Workflow for a typical change

Whether the author is you in an IDE, Cursor agent, or any other tool:

```
1. Create branch          git checkout -b dev/my-change
2. Make changes           (edit, test locally with make local-up)
3. Commit + push          git push -u origin HEAD
4. Open PR                gh pr create --base main
5. CI runs                (typecheck, lint, build — automatic)
6. Review + approve       (you, in GitHub UI or CLI)
7. Merge                  (squash merge recommended)
8. Deploy runs            (automatic — SSH → pull → rebuild)
9. Verify                 (hit the production URL, check /health/ready)
10. Branch auto-deleted
```

---

## Pre-flight checklist

Things to complete before the first production deploy through this pipeline:

- [ ] Initialize git repo and push to GitHub
- [ ] Configure branch protection on `main`
- [ ] Create `.github/workflows/ci.yml`
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Provision VPS and run one-time setup (user, SSH key, clone, `.env`)
- [ ] Add GitHub secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`)
- [ ] Production web build — change deploy compose to build static assets
      instead of running Vite dev server (current `npm run dev` in production
      is functional but wasteful and exposes dev tooling)
- [ ] Add container healthchecks to `api` and `web` in `docker-compose.deploy.yml`
- [ ] Fix `backup_to_r2.sh` to reference `docker-compose.deploy.yml` instead of
      `docker-compose.local.yml` when running on production
- [ ] Add `ruff` to backend `requirements.txt` (or a separate `dev-requirements.txt`)
- [ ] Set up cron for nightly backups on VPS
- [ ] Run a full deploy cycle end-to-end and verify

---

## Future improvements (not needed now)

| Improvement | When it makes sense |
|-------------|---------------------|
| Automated tests in CI | When you have tests worth running |
| E2E tests (Playwright) | When the UI stabilizes enough to write stable selectors |
| Docker image registry (GHCR) | If build times on VPS become painful — push pre-built images instead of building on-server |
| Blue/green deploys | If even brief downtime becomes unacceptable |
| Separate staging environment | If you need to test Cloudflare Access flows without touching production |
| Alembic migrations | If `AUTO_MIGRATE=true` becomes risky with production data |
| Dependabot / Renovate | For automated dependency update PRs |
| Deploy notifications | Post to Telegram/Slack on successful deploy (nice to have for awareness) |
